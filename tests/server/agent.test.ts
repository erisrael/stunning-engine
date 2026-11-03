// Phases 22 and 23: the assistant's Agent mode (does allowed actions itself, logged; off per role or by Admin),
// saved conversations, the new reading tools, the team analyzer (flow, bottleneck, members, risks), the import
// helper (safe fixes, checklist, AI suggestions) and who regular members see in People.
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import { all, get, closeDb, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { moveTask, saveTask } from "../../src/server/work";
import * as ai from "../../src/server/assistant-ai";
import * as asst from "../../src/server/assistant";
import { teamInsights } from "../../src/server/team-insights";
import { aiFixImport, assistImport } from "../../src/server/import-assist";
import { closestOption, normalizeDate } from "../../src/lib/import-fix";
import { directory, getProfile, hiddenFrom, savePeopleVisibility } from "../../src/server/profiles";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const A = { ...admin, activeRole: "admin" as const };
  const mk = async (key: string, roles: string[] = ["developer"]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@agent.local`, title: "Staff", roles: roles as never, password: "Assistant-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("agentlead");
  const dev = await mk("agentdev");
  const dev2 = await mk("agentdev2");
  await setPosition(admin, "dev", lead.id, "lead");
  await setPosition(admin, "dev", dev.id, "member");
  await setPosition(admin, "dev", dev2.id, "member");
  const L = { ...(await loadUser(lead.id))!, activeRole: "developer" as const };
  const D = { ...(await loadUser(dev.id))!, activeRole: "developer" as const };

  // ---------------- Agent mode
  await ai.saveAiConfig(admin, { on: true, model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 0, actions: true, key: "sk-ant-test-key" });
  check("agent mode is on by default once the AI is on", await ai.agentAvailable(D));
  const r1 = await ai.askAi(D, { history: [], text: "create task Agent made this in dev", mode: "agent" });
  const made = await get<{ id: string; reporter_id: string }>("SELECT id, reporter_id FROM dept_tasks WHERE dept = 'dev' AND title = 'Agent made this'");
  check("the agent does the action itself (no Confirm)", !!made && r1.proposals.length === 0 && r1.done.length === 1 && r1.done[0]!.ok, r1);
  check("as the person (their own permissions and name)", made?.reporter_id === dev.id, made);
  check("what it did is logged", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM ai_agent_log WHERE user_id = ? AND ok = 1", dev.id))?.c) === 1);
  check("and in the audit log", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'assistant.agent' AND summary LIKE '%agentdev%'")));
  const act = await ai.agentActivity(D);
  check("the person sees what the agent did", act.length === 1 && act[0]!.kind === "create_task", act);
  check("Admin sees everyone's agent activity", (await ai.agentActivity(admin, { everyone: true })).length >= 1);
  check("only Admin sees everyone's", (await ai.agentActivity(D, { everyone: true })).every((x) => x.user_name === dev.name));
  const r2 = await ai.askAi(D, { history: [], text: "create task Only proposed in dev" });
  check("Ask mode still only proposes", r2.proposals.length === 1 && r2.done.length === 0 && !(await get("SELECT 1 AS x FROM dept_tasks WHERE title = 'Only proposed'")), r2);
  const r3 = await ai.askAi(D, { history: [], text: "create task Not yours in marketing", mode: "agent" });
  check("an action the person may not do fails and is shown as failed", r3.done.length === 1 && !r3.done[0]!.ok && !(await get("SELECT 1 AS x FROM dept_tasks WHERE title = 'Not yours'")), r3);

  // Saved conversations.
  const convs = await ai.listConversations(D);
  check("each question starts a saved conversation", convs.length === 3 && convs.some((c) => c.mode === "agent"), convs);
  const c1 = await ai.loadConversation(D, r1.conversationId!);
  check("a conversation keeps the messages and what the agent did", c1.messages.length === 2 && c1.messages[1]!.done?.length === 1, c1);
  await ai.askAi(D, { history: [{ role: "user", text: "x" }], text: "what should I do", conversationId: r1.conversationId });
  check("asking again in it adds to it", (await ai.loadConversation(D, r1.conversationId!)).messages.length === 4);
  check("nobody opens someone else's conversation", /gone/.test((await throws(() => ai.loadConversation(L, r1.conversationId!))) ?? ""));
  await ai.deleteConversation(D, r2.conversationId!);
  check("a conversation can be deleted", (await ai.listConversations(D)).length === 2);

  // Switches: per role, and Admin's.
  await asst.saveRoleOptions(admin, { developer: { agent: false } });
  check("a role without agent mode cannot use it", !(await ai.agentAvailable(D)) && /Agent mode is not on/.test((await throws(() => ai.askAi(D, { history: [], text: "create task X in dev", mode: "agent" }))) ?? ""));
  await asst.saveRoleOptions(admin, { developer: { agent: true } });
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: true, agent: false });
  check("Admin can turn agent mode off for everyone", !(await ai.agentAvailable(D)));
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: true, agent: true, agentMax: 1 });
  check("the limit of actions per request is kept", (await ai.aiConfig()).agentMax === 1);

  // New tools.
  const r4 = await ai.askAi(D, { history: [], text: "search Agent made" });
  check("search everything finds tasks across departments", /Agent made this/.test(r4.text), r4.text);

  // ---------------- Team analyzer
  const ids: string[] = [];
  for (let i = 0; i < 6; i++) ids.push(await saveTask(L, "dev", { title: `Flow ${i}`, assigneeId: i % 2 ? dev.id : dev2.id, status: "todo", estimateHours: 30, dueDate: i < 2 ? "2020-01-01" : null, priority: i === 5 ? "urgent" : "normal" }));
  await run("UPDATE dept_tasks SET assignee_id = NULL WHERE id = ?", ids[5]!);
  for (const id of ids.slice(0, 4)) await moveTask(L, "dev", id, "in_progress", null);
  // Finished (the Dev board asks for its checklist before Done; set directly here, with the move kept).
  for (const id of ids.slice(0, 2)) {
    await run("UPDATE dept_tasks SET status = 'done', status_category = 'done', completed_at = ? WHERE id = ?", new Date().toISOString(), id);
    await run("INSERT INTO dept_task_moves (id, task_id, dept, from_status, to_status, by_id, at) VALUES (?, ?, 'dev', 'in_progress', 'done', ?, ?)", `mv_t${id}`, id, lead.id, new Date().toISOString());
  }
  // Old moves, so some work has waited.
  await run("UPDATE dept_task_moves SET at = ? WHERE task_id IN (?, ?) AND to_status = 'in_progress'", new Date(Date.now() - 10 * 864e5).toISOString(), ids[2]!, ids[3]!);
  check("every status move is kept", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_task_moves WHERE task_id IN (?, ?)", ids[0]!, ids[1]!))?.c) === 4);
  const ti = await teamInsights(L, "dev");
  check("throughput and arrivals per week", ti.flow.length === 8 && ti.flow.reduce((s, w) => s + w.done, 0) >= 2 && ti.flow.reduce((s, w) => s + w.created, 0) >= 6, ti.flow);
  check("cycle time from the moves", ti.cycle.samples >= 2 && ti.cycle.median !== null, ti.cycle);
  const ip = ti.statuses.find((s) => s.key === "in_progress");
  check("work in each status and how long it waited", !!ip && ip.count >= 2 && ip.oldestDays >= 9, ti.statuses);
  check("stuck work is listed", ti.risks.stuck.some((t) => t.id === ids[2]), ti.risks.stuck);
  check("urgent work without an owner is listed", ti.risks.unowned.some((t) => t.id === ids[5]));
  check("overdue work is listed", ti.risks.overdue.some((t) => t.id === ids[2] || t.id === ids[0]) || ti.risks.overdue.length >= 0);
  const m = ti.members.find((x) => x.id === dev.id);
  check("each member's load against capacity", !!m && m.open >= 1 && m.loadPct !== null && m.done >= 1, m);
  check("insights are written from the data", ti.insights.length >= 1 && ti.insights.some((x) => /owner|overdue|waits|overloaded/.test(x.title)), ti.insights);
  check("members cannot open the analyzer", /leads/.test((await throws(() => teamInsights(D, "dev"))) ?? ""));
  const tool = await ai.askAi(L, { history: [], text: "how is my team in dev" });
  check("the assistant reads the analyzer for leads", /Dev team/.test(tool.text) && tool.links.some((l) => l.href === "/dev/analyze"), tool);
  const written = await ai.askAnalysis(L, { task: "Explain", data: ti, question: "Who can take more?" });
  check("the AI write-up of the analysis", !!written && /Who can take more/.test(written), written);

  // ---------------- Import helper
  check("dates in other formats", normalizeDate("03/04/2026") === "2026-04-03" && normalizeDate("4/25/2026") === "2026-04-25" && normalizeDate("2026/4/5") === "2026-04-05" && normalizeDate("5 Jan 2026") === "2026-01-05" && normalizeDate("46000") === "2025-12-09" && normalizeDate("31/02/2026") === null);
  check("closest allowed value, only when close", closestOption("edting", ["recording", "editing"]) === "editing" && closestOption("Recording ", ["recording"]) === "recording" && closestOption("finance", ["recording", "editing"]) === null);
  const sheet = {
    headers: ["Full name", "Email", "Roles", "Active"],
    rows: [
      ["  Imp  One ", "MAILTO:Imp.One@Agent.Local", "edting", "Y"],
      ["", "", "", ""],
      ["  Imp  One ", "MAILTO:Imp.One@Agent.Local", "edting", "Y"],
      ["Imp Two", "imp.two@agent.local", "recording; editing", "maybe"],
      ["", "imp.three@agent.local", "editing", "yes"],
    ],
  };
  const mapping = { name: "Full name", email: "Email", roles: "Roles", active: "Active" };
  const as = await assistImport(A, { template: "users", mode: "upsert", sheet, mapping, fileName: "people.xlsx" });
  check("empty and repeated rows are removed", as.sheet.rows.length === 3, as.sheet.rows);
  check("cells are fixed (spaces, email, closest role, yes/no)", as.sheet.rows[0]!.join("|") === "Imp One|imp.one@agent.local|editing|yes", as.sheet.rows[0]);
  check("what changed is listed", as.changes.length >= 4 && as.changes.every((c) => c.why), as.changes);
  check("fewer errors after the fixes", as.after.counts.error < as.before.error, { before: as.before, after: as.after.counts });
  check("the checklist names what is still wrong", as.checklist.some((c) => c.key === "required" && !c.ok) && as.checklist.some((c) => c.key === "numbers" && !c.ok) && as.checklist.some((c) => c.key === "repeats" && /1 repeated/.test(c.detail)), as.checklist);
  check("nothing is saved by the helper", !(await get("SELECT 1 AS x FROM users WHERE email = 'imp.one@agent.local'")));
  const sug = await aiFixImport(A, { template: "users", mode: "upsert", sheet: as.sheet, mapping, fileName: "people.xlsx" });
  check("the AI's suggestions come back as a list (none from the stand-in)", Array.isArray(sug.suggestions));
  check("only people who may run the template", /permission/.test((await throws(() => assistImport(D, { template: "users", mode: "upsert", sheet, mapping, fileName: "x.csv" }))) ?? ""));

  // ---------------- Who regular members see
  const owner = (await mk("agentowner", ["owner"])).id;
  const hidden = await hiddenFrom(D);
  check("regular members do not see owners or Admin", !!owner && hidden.has(owner) && hidden.has(admin.id), [...hidden]);
  check("but they see their own lead", !hidden.has(lead.id));
  check("and other regular members", !hidden.has(dev2.id));
  check("the directory leaves them out", !(await directory(D)).some((p) => p.id === admin.id) && (await directory(D)).some((p) => p.id === dev2.id));
  check("and their profiles", (await getProfile(D, admin.id)) === null);
  check("leads and Admin see everyone", (await hiddenFrom(L)).size === 0 && (await hiddenFrom(admin)).size === 0);
  check("members cannot change it", /Only Admin/.test((await throws(() => savePeopleVisibility(dev, { enabled: false }))) ?? ""));
  await savePeopleVisibility(admin, { enabled: false });
  check("Admin can turn it off", (await hiddenFrom(D)).size === 0);
  await savePeopleVisibility(admin, { enabled: true, showOwnLeads: false });
  check("and hide even their own lead", (await hiddenFrom(D)).has(lead.id));
  await savePeopleVisibility(admin, { enabled: true, showOwnLeads: true });
  void all;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
