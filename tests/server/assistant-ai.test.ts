// Phase 13b checks: the AI assistant (with a stand-in model, AI_FAKE=1) is off until Admin turns it on, follows the
// roles and the daily limit, reads with the person's own permissions, and only proposes actions: a sealed proposal
// runs on Confirm by the person it was made for, with the page's own checks. Also: typo-tolerant keywords and the
// new flows (create a task, check in or out) for every department.
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import * as ai from "../../src/server/assistant-ai";
import * as asst from "../../src/server/assistant";
import { DEFAULT_ASSISTANT, FLOWS, flowsFor, matchText, nearly } from "../../src/lib/assistant";

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
  // Smarter keywords: typos.
  check("one letter off still matches", nearly("leav", "leave") && nearly("assgin", "assign") && nearly("atendance", "attendance") && !nearly("cat", "car"));
  const first = (t: string) => matchText(t, FLOWS, DEFAULT_ASSISTANT)[0] as { type: string; flow?: { key: string }; place?: { name: string } } | undefined;
  check("'asign videos' (typo) finds Assign work", first("asign videos to Yonas")?.flow?.key === "do.assign", first("asign videos to Yonas"));
  check("'create a task' finds the new flow", first("create a task for the website")?.flow?.key === "do.task");
  check("'check me in' finds Check in now", first("check me in")?.flow?.key === "do.checkin");
  check("finance flows only for Finance", flowsFor({ role: "finance", lead: false, department: false, production: false, hr: false, finance: true, admin: false }, DEFAULT_ASSISTANT).some((f) => f.key === "show.finance") && !flowsFor({ role: "developer", lead: false, department: true, production: false, hr: false, admin: false }, DEFAULT_ASSISTANT).some((f) => f.key === "show.finance"));
  check("every person gets a flow for email, chat and requests", ["show.email", "show.chat", "show.request"].every((k) => flowsFor({ role: "editing", lead: false, department: false, production: true, hr: false, admin: false }, DEFAULT_ASSISTANT).some((f) => f.key === k)));
  check("'where is finance' finds the page", first("where is finance")?.place?.name === "Finance");

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const A = { ...admin, activeRole: "admin" as const };
  const mk = async (key: string, roles: string[] = ["developer"]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@ai.local`, title: "Staff", roles: roles as never, password: "Assistant-2026!", mustChangePassword: false })).id))!;
  const devUser = await mk("aidev");
  const mkt = await mk("aimkt", ["marketing"]);
  await setPosition(admin, "dev", devUser.id, "member");
  const D = { ...devUser, activeRole: "developer" as const };
  const M = { ...mkt, activeRole: "marketing" as const };

  // The new do flows' pickers.
  const td = (await asst.assistantData(D, "do.task")) as { depts: { id: string; people: { id: string }[] }[] };
  check("Create a task offers the person's departments with their people", td.depts.some((d) => d.id === "dev" && d.people.some((p) => p.id === devUser.id)), td);
  check("Check in says the person has no HR record when they have none", /HR record/.test((await throws(() => asst.assistantData(D, "do.checkin"))) ?? ""));

  // Off until Admin turns it on.
  check("off by default", !(await ai.aiAvailable(D)));
  check("people cannot turn it on", /Only Admin/.test((await throws(() => ai.saveAiConfig(devUser, { on: true }))) ?? ""));
  check("asking while off is refused", /not on/.test((await throws(() => ai.askAi(D, { history: [], text: "hello" }))) ?? ""));
  await ai.saveAiConfig(admin, { on: true, model: "claude-opus-5-5", effort: "low", offRoles: ["marketing"], dailyLimit: 0, actions: true, key: "sk-ant-test-key" });
  const cfg = await ai.aiConfig();
  check("the key is stored sealed, never returned", cfg.hasKey && !JSON.stringify(cfg).includes("sk-ant-test-key") && !((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant.ai'"))?.value ?? "").includes("sk-ant-test-key"));
  check("on for a developer", await ai.aiAvailable(D));
  check("off for a role Admin left out", !(await ai.aiAvailable(M)));

  // Reads with the person's own data.
  const r1 = await ai.askAi(D, { history: [], text: "what is my leave balance", page: "/dev" });
  check("answers from a tool (leave)", /found/.test(r1.text) && /HR record/.test(r1.text), r1);
  const r2 = await ai.askAi(D, { history: [{ role: "user", text: "hi" }, { role: "assistant", text: "Hello" }], text: "where is attendance" });
  check("offers a page to open", r2.links.some((l) => l.href === "/attendance"), r2);

  // Proposals: nothing happens until Confirm.
  const before = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_tasks WHERE dept = 'dev' AND title = 'Fix the login page'"))?.c ?? 0);
  const r3 = await ai.askAi(D, { history: [], text: "create task Fix the login page in dev" });
  const p = r3.proposals[0];
  check("a task is proposed, not created", !!p && /Fix the login page/.test(p.lines.join(" ")) && Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_tasks WHERE dept = 'dev' AND title = 'Fix the login page'"))?.c ?? 0) === before, r3);
  check("someone else cannot confirm it", /not yours/.test((await throws(() => ai.confirmProposal(A, p!.token))) ?? ""));
  check("a changed proposal is refused", !!(await throws(() => ai.confirmProposal(D, p!.token.slice(0, -4) + "AAAA"))));
  const done = await ai.confirmProposal(D, p!.token);
  check("Confirm creates it with the page's own action", done.done === "Created" && Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_tasks WHERE dept = 'dev' AND title = 'Fix the login page'"))?.c ?? 0) === before + 1, done);
  const r4 = await ai.askAi(D, { history: [], text: "create task Spy on finance in finance" });
  check("no proposal in a department the person cannot open", r4.proposals.length === 0 && /cannot open/.test(r4.text), r4);

  // Actions can be switched off; the daily limit holds.
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: false });
  const r5 = await ai.askAi(D, { history: [], text: "create task Another one in dev" });
  check("with actions off, nothing is proposed", r5.proposals.length === 0, r5);
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 1, actions: true });
  check("the daily limit stops more questions", /today's 1 questions/.test((await throws(() => ai.askAi(M, { history: [], text: "hello" })).then(() => throws(() => ai.askAi(M, { history: [], text: "hello again" })))) ?? ""));
  const usage = await ai.aiUsage(admin);
  check("Admin sees the usage", usage.questions >= 5 && usage.confirmed >= 1 && usage.byRole.some((x) => x.role === "developer"), usage);
  await ai.saveAiConfig(admin, { on: false, clearKey: true });
  check("the key can be removed", !(await ai.aiConfig()).hasKey);

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
