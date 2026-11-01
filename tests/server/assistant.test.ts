// Phase 13 checks: written flows matched from typed text, flows per role and Admin's switches, the "do" pickers
// with the pages' permission checks, and monitoring.
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { saveTask } from "../../src/server/work";
import * as asst from "../../src/server/assistant";
import { DEFAULT_ASSISTANT, FLOWS, flowsFor, matchText } from "../../src/lib/assistant";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};

async function main() {
  const all = FLOWS;
  const first = (t: string) => matchText(t, all, DEFAULT_ASSISTANT)[0];
  check("'give videos to' finds Assign work", first("I want to give videos to Yonas")?.type === "flow" && (first("I want to give videos to Yonas") as { flow: { key: string } }).flow.key === "do.assign");
  check("'day off' finds Ask for leave", (first("can I take a day off next week") as { flow?: { key: string } })?.flow?.key === "do.leave");
  const where = first("where is my payslip");
  check("'where is' finds the page", where?.type === "place" && where.place.name === "Pay and claims", where);
  const mean = first("what does arriving mean");
  check("'what does ... mean' explains the word", mean?.type === "term" && mean.term.term === "Arriving", mean);
  check("nonsense matches nothing", matchText("purple elephant banana", all, DEFAULT_ASSISTANT).length === 0);
  check("Admin's short answers are found", matchText("when is pay day", all, { ...DEFAULT_ASSISTANT, answers: [{ q: "When is pay day?", words: ["pay day", "salary date"], a: "The 28th." }] })[0]?.type === "answer");

  const member = { role: "developer", lead: false, department: true, production: false, hr: false, admin: false };
  check("members do not get Assign work", !flowsFor(member, DEFAULT_ASSISTANT).some((f) => f.key === "do.assign"));
  check("leads do", flowsFor({ ...member, lead: true }, DEFAULT_ASSISTANT).some((f) => f.key === "do.assign"));
  check("Admin can switch a flow off for a role", !flowsFor(member, { ...DEFAULT_ASSISTANT, off: { "do.leave": ["developer"] } }).some((f) => f.key === "do.leave"));

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string) => (await loadUser((await upsertAccount({ name: key, email: `${key}@as.local`, title: "Developer", roles: ["developer"], password: "Assistant-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("alead");
  const dev = await mk("adev");
  await setPosition(admin, "dev", lead.id, "lead");
  const L = { ...lead, activeRole: "developer" as const };
  const D = { ...dev, activeRole: "developer" as const };
  const id = await saveTask(lead, "dev", { title: "Fix the login", status: "todo" });
  const data = (await asst.assistantData(L, "do.assign")) as { tasks: { id: string }[]; people: { id: string }[] };
  check("Assign work offers work nobody has, and the people", data.tasks.some((t) => t.id === id) && data.people.some((p) => p.id === dev.id), data);
  check("a member cannot open Assign work", !!(await asst.assistantData(D, "do.assign").then(() => null, (e) => e)));
  await saveTask(lead, "dev", { id, title: "Fix the login", assigneeId: dev.id, status: "todo" });
  const mine = (await asst.assistantData(D, "do.start")) as { tasks: { id: string }[] };
  check("Start my next task offers my To do", mine.tasks.some((t) => t.id === id));

  await asst.logAssistant(D, { flow: "do.start", event: "start" });
  await asst.logAssistant(D, { flow: "do.start", event: "abandon", step: 1 });
  await asst.logAssistant(D, { event: "nomatch", text: "how do I fly" });
  const stats = await asst.assistantStats(admin);
  const s = stats.flows.find((f) => f.key === "do.start")!;
  check("monitoring counts starts and where people gave up", s.started === 1 && s.gaveUp === 1 && s.worstStep === 1, s);
  check("and what matched nothing", stats.unmatched.some((u) => u.text === "how do i fly"));
  check("only Admin sees monitoring", !!(await asst.assistantStats(dev).then(() => null, (e) => e)));
  await asst.saveAssistantConfig(admin, { off: { "do.leave": ["*"] }, keywords: { "do.assign": ["Allot"] }, answers: [] });
  const ctx = await asst.assistantContext(D);
  check("switched off for everyone hides it", !ctx.flows.some((f) => f.key === "do.leave"));
  check("extra keywords are kept, lower case", ctx.cfg.keywords["do.assign"]?.[0] === "allot");

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
