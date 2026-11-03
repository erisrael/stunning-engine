// Phase 13d checks: the assistant's operations (prepared, then run on Confirm with the pages' checks), options per
// role (AI, actions, limits), tutorials, and routines (saved, shared, approved by the person, a line manager or
// Admin; started only when approved; finished).
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { saveTask } from "../../src/server/work";
import { syncFromUsers } from "../../src/server/hr";
import * as ops from "../../src/server/assistant-ops";
import * as ai from "../../src/server/assistant-ai";
import * as asst from "../../src/server/assistant";
import * as rt from "../../src/server/routines";
import { DEFAULT_ASSISTANT, FLOWS, flowsFor, matchText } from "../../src/lib/assistant";

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
  // Tutorials.
  check("tutorials are flows", FLOWS.filter((f) => f.kind === "guide").length >= 25);
  const t = matchText("how do I turn on two-step sign in", FLOWS, DEFAULT_ASSISTANT)[0] as { flow?: { key: string } } | undefined;
  check("'turn on two-step' finds the tutorial", t?.flow?.key === "t.twostep", t);
  check("HR tutorials only for HR", !flowsFor({ role: "developer", lead: false, department: true, production: false, hr: false, admin: false }, DEFAULT_ASSISTANT).some((f) => f.key === "t.hr.add"));

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const A = { ...admin, activeRole: "admin" as const };
  const mk = async (key: string, roles: string[] = ["developer"]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@rt.local`, title: "Staff", roles: roles as never, password: "Routines-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("rtlead");
  const dev = await mk("rtdev");
  const other = await mk("rtother", ["marketing"]);
  await setPosition(admin, "dev", lead.id, "lead");
  await setPosition(admin, "dev", dev.id, "member");
  await syncFromUsers(admin);
  // The developer reports to the lead (for "line manager approves").
  const emp = async (id: string) => (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", id))!.id;
  const { run } = await import("../../src/server/db");
  await run("UPDATE employees SET manager_id = ? WHERE id = ?", await emp(lead.id), await emp(dev.id));
  const D = { ...dev, activeRole: "developer" as const };
  const L = { ...lead, activeRole: "developer" as const };
  const O = { ...other, activeRole: "marketing" as const };

  // Operations: prepare, then execute.
  const id = await saveTask(lead, "dev", { title: "Write the release notes", status: "todo", assigneeId: dev.id });
  const p1 = await ops.prepareOp(D, "update_task", { department: "dev", task_id: id, due: "2026-12-01" });
  check("a change is prepared with a summary", p1.lines.some((l) => /Due 2026-12-01/.test(l)), p1);
  await ops.executeOp(D, p1.params);
  check("and runs on Confirm", (await get<{ due_date: string }>("SELECT due_date FROM dept_tasks WHERE id = ?", id))?.due_date === "2026-12-01");
  const p2 = await ops.prepareOp(D, "comment_task", { department: "dev", task_id: id, text: "Draft is ready" });
  await ops.executeOp(D, p2.params);
  check("a comment is added", !!(await get("SELECT 1 AS x FROM dept_task_comments WHERE task_id = ? AND body = 'Draft is ready'", id)));
  const p3 = await ops.prepareOp(D, "finish_task", { department: "dev", task_id: id });
  check("finishing follows the page's rules (the checklist must be filled)", /still needs/.test((await throws(() => ops.executeOp(D, p3.params))) ?? ""));
  check("though it was started for them", (await get<{ flow_state: string }>("SELECT flow_state FROM dept_tasks WHERE id = ?", id))?.flow_state === "working");
  check("someone outside the department cannot", /cannot open/.test((await throws(() => ops.prepareOp(O, "comment_task", { department: "dev", task_id: id, text: "x" }))) ?? ""));
  const p4 = await ops.prepareOp(D, "read_notifications", {});
  await ops.executeOp(D, p4.params);
  check("notifications marked read", !(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND read_at IS NULL", dev.id)));
  check("approvals list what waits", Array.isArray((await ops.myApprovals(L)).leave));

  // Options per role.
  await ai.saveAiConfig(admin, { on: true, model: "claude-opus-5-5", effort: "low", offRoles: [], dailyLimit: 0, actions: true, key: "sk-ant-test" });
  check("people cannot change role options", /Only Admin/.test((await throws(() => asst.saveRoleOptions(dev, {}))) ?? ""));
  await asst.saveRoleOptions(admin, { developer: { ai: true, voice: false, routines: true, actions: ["leave", "check_in"], suggestions: ["What is due today?"], dailyLimit: 2 }, marketing: { ai: false } });
  const ctx = await asst.assistantContext(D);
  check("the role's options reach the assistant", ctx.options.voice === false && ctx.options.suggestions[0] === "What is due today?" && ctx.routines === true, ctx.options);
  check("AI off for a role", !(await ai.aiAvailable(O)));
  const r1 = await ai.askAi(D, { history: [], text: "create task Something in dev" });
  check("an action the role may not have is not prepared", r1.proposals.length === 0 && /may not have/.test(r1.text), r1);
  await ai.askAi(D, { history: [], text: "hello" });
  check("the role's daily limit holds", /today's 2 questions/.test((await throws(() => ai.askAi(D, { history: [], text: "again" }))) ?? ""));
  await asst.saveRoleOptions(admin, {});

  // Routines.
  const steps = [
    { path: "/dev", do: "click", role: "button", name: "New task" },
    { path: "/dev", do: "fill", label: "Title", value: "Weekly notes", ask: true },
    { path: "/dev", do: "click", role: "button", name: "Create" },
  ];
  check("an empty routine is refused", /Nothing was recorded/.test((await throws(() => rt.saveRoutine(D, { name: "x", steps: [] }))) ?? ""));
  check("a step outside the app is refused", /outside the app/.test((await throws(() => rt.saveRoutine(D, { name: "x", steps: [{ path: "https://evil.example", do: "click" }] }))) ?? ""));
  const rid = await rt.saveRoutine(D, { name: "Weekly notes", steps, shared: "team" });
  check("saved and listed", (await rt.listRoutines(D)).some((r) => r.id === rid && r.steps.length === 3));
  check("shared with the department", (await rt.listRoutines(L)).some((r) => r.id === rid));
  check("not with others", !(await rt.listRoutines(O)).some((r) => r.id === rid));
  check("only the owner changes it", /owner/.test((await throws(() => rt.saveRoutine(L, { id: rid, name: "Mine now", steps }))) ?? ""));
  // The person confirms (default).
  const run1 = await rt.requestRun(D, rid, { "1": "Notes for week 45" });
  check("with 'the person confirms' a run is approved at once", run1.status === "approved");
  const started = await rt.startRun(D, run1.id);
  check("starting gives the steps and the values", started.steps.length === 3 && started.values["1"] === "Notes for week 45");
  check("a run starts once", !!(await throws(() => rt.startRun(D, run1.id))));
  await rt.finishRun(D, run1.id, true);
  check("finished and counted", (await rt.listRuns(D)).mine[0]?.status === "done" && (await rt.listRoutines(D)).find((r) => r.id === rid)?.uses === 1);
  // The line manager approves first.
  await rt.saveRoutinesConfig(admin, { approval: "lead" });
  const run2 = await rt.requestRun(D, rid, {});
  check("with 'line manager first' it waits", run2.status === "pending" && !!(await throws(() => rt.startRun(D, run2.id))));
  check("the manager is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND type = 'assistant'", lead.id)));
  check("and sees it to approve", (await rt.listRuns(L)).toApprove.some((x) => x.id === run2.id));
  check("someone else cannot approve it", !!(await throws(() => rt.decideRun(O, run2.id, true))));
  check("rejecting needs a reason", /why/.test((await throws(() => rt.decideRun(L, run2.id, false))) ?? ""));
  await rt.decideRun(L, run2.id, true);
  check("approved, it can run", (await rt.startRun(D, run2.id)).steps.length === 3);
  await rt.finishRun(D, run2.id, false, "Could not find Create");
  check("a stopped run is recorded", (await rt.listRuns(D)).mine.find((x) => x.id === run2.id)?.status === "failed");
  // Admin first.
  await rt.saveRoutinesConfig(admin, { approval: "admin" });
  const run3 = await rt.requestRun(D, rid, {});
  check("with 'Admin first' Admin approves", (await rt.listRuns(A)).toApprove.some((x) => x.id === run3.id));
  // Through the AI.
  const r6 = await ai.askAi(D, { history: [], text: `run routine ${rid}` });
  check("the AI can prepare a routine run", r6.proposals[0]?.title === 'Run "Weekly notes"', r6);
  const c6 = await ai.confirmProposal(D, r6.proposals[0]!.token);
  check("confirming it hands the routine to the browser", c6.routine === rid, c6);
  // Switched off for a role.
  await rt.saveRoutinesConfig(admin, { approval: "self", offRoles: ["developer"] });
  check("routines off for a role", /not on/.test((await throws(() => rt.requestRun(D, rid, {}))) ?? ""));
  await rt.saveRoutinesConfig(admin, { offRoles: [] });
  await rt.deleteRoutine(D, rid);
  check("removed with its runs", !(await all("SELECT 1 AS x FROM assistant_runs WHERE routine_id = ?", rid)).length);

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
