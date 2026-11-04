// Phase 30: the assistant offers only what the person's role can do. Pages they cannot open are never offered,
// tools and actions outside their rights are not given (and refused if asked for), and HR's work is done by the
// assistant for HR: looking people up, attendance, leave, cases, one-to-ones, training, openings, announcements.
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { syncFromUsers } from "../../src/server/hr";
import * as ai from "../../src/server/assistant-ai";
import { canOpenPath, placesFor } from "../../src/server/page-access";
import { assistantContext } from "../../src/server/assistant";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const dawit = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'dawit@demo.local'"))!.id))!;
  const hrU = (await loadUser((await upsertAccount({ name: "Tigist HR", email: "tigist@roles.local", title: "HR officer", roles: ["hr_manager"], password: "Roles-2026-HR!", mustChangePassword: false })).id))!;
  await syncFromUsers(admin);
  await ai.saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: true, agent: true, key: "sk-test" });
  const D = { ...dawit, activeRole: "recording" as const };
  const H = { ...hrU, activeRole: "hr_manager" as const };

  // Pages.
  check("a member cannot open Admin, HR or Finance", !(await canOpenPath(D, "/admin")) && !(await canOpenPath(D, "/hr")) && !(await canOpenPath(D, "/finance")) && !(await canOpenPath(D, "/dev/configure")));
  check("but can open their own pages", (await canOpenPath(D, "/attendance")) && (await canOpenPath(D, "/profile?tab=leave")) && (await canOpenPath(D, "/chat")));
  check("HR opens HR, not Admin", (await canOpenPath(H, "/hr")) && !(await canOpenPath(H, "/admin")));
  const mp = (await placesFor(D, null)).map((p) => p.name);
  check("the member's page list leaves out what they cannot open", !mp.includes("Admin") && !mp.includes("HR") && !mp.includes("Finance") && mp.includes("Attendance"), mp);
  check("the browser gets the same list", JSON.stringify((await assistantContext(D)).places) === JSON.stringify(mp));
  const open = await ai.askAi(D, { history: [], text: 'tool:open_page {"href":"/admin","label":"Admin"}' });
  check("the assistant will not offer a page the member cannot open", open.links.length === 0 && /cannot open/.test(open.text), open);

  // What a member can do.
  const ab = await ai.abilities(D);
  check("a member is not a lead, HR or an approver", !ab.lead && !ab.hr && !ab.approver && !ab.attendanceHr, ab);
  const hrTry = await ai.askAi(D, { history: [], text: "tool:hr_people {}" });
  check("HR's tools are not given to a member", /not available to this person/.test(hrTry.text), hrTry.text);
  const dec = await ai.askAi(D, { history: [], text: 'tool:propose {"kind":"decide_leave","args":{"request_id":"x","decision":"approve"}}' });
  check("nor approving leave", dec.proposals.length === 0 && /may not/.test(dec.text), dec.text);
  const act = await ai.askAi(D, { history: [], text: 'tool:do_action {"kind":"hr_announce","args":{"title":"x","body":"y"}}', mode: "agent" });
  check("nor announcing in Agent mode", act.done.length === 0 && /may not/.test(act.text) && !(await get("SELECT 1 AS x FROM announcements WHERE title = 'x'")), act);
  check("a member keeps their own actions", (await ai.askAi(D, { history: [], text: "create task Hello in dev" })).proposals.length === 0);

  // HR.
  const hab = await ai.abilities(H);
  check("HR has HR's rights", hab.hr && hab.attendanceHr && hab.cases && hab.announce, hab);
  const people = await ai.askAi(H, { history: [], text: 'tool:hr_people {"text":"dawit"}' });
  check("HR looks people up", /Dawit/.test(people.text), people.text);
  const one = await ai.askAi(H, { history: [], text: 'tool:hr_employee {"employee":"Dawit"}' });
  check("and one employee in full", /leave_balances/.test(one.text) && /Dawit/.test(one.text), one.text);
  const today = await ai.askAi(H, { history: [], text: "tool:hr_attendance_day {}" });
  check("today's attendance", /counts/.test(today.text), today.text);
  const q = await ai.askAi(H, { history: [], text: "tool:hr_leave_queue {}" });
  check("the leave queue", /waiting_for_hr/.test(q.text), q.text);
  check("what falls due and the year's numbers", !/error/.test((await ai.askAi(H, { history: [], text: "tool:hr_due {}" })).text) && !/"error"/.test((await ai.askAi(H, { history: [], text: "tool:hr_report {}" })).text));

  const day = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  const r1 = await ai.askAi(H, { history: [], text: `tool:do_action {"kind":"hr_mark_day","args":{"employee":"Dawit","day":"${day}","status":"late","in_time":"09:20","note":"Traffic"}}`, mode: "agent" });
  check("HR records a day itself", r1.done[0]?.ok === true, r1.done);
  const r2 = await ai.askAi(H, { history: [], text: `tool:do_action {"kind":"hr_log_attendance","args":{"employee":"Dawit","day":"${day}","kind":"out","time":"17:30","note":"Forgot to check out"}}`, mode: "agent" });
  check("logs a missed check-out", r2.done[0]?.ok === true, r2.done);
  const types = await all<{ key: string }>("SELECT key FROM leave_types LIMIT 1");
  const r3 = await ai.askAi(H, { history: [], text: `tool:do_action {"kind":"hr_adjust_leave","args":{"employee":"Dawit","leave_type":"${types[0]?.key ?? "annual"}","days":2,"note":"Carried over"}}`, mode: "agent" });
  check("adjusts a leave balance", r3.done[0]?.ok === true, r3.done);
  const r4 = await ai.askAi(H, { history: [], text: 'tool:do_action {"kind":"hr_announce","args":{"title":"Office closed Friday","body":"For the holiday.","kind":"news"}}', mode: "agent" });
  check("posts an announcement", r4.done[0]?.ok === true && !!(await get("SELECT 1 AS x FROM announcements WHERE title = 'Office closed Friday'")), r4.done);
  const r5 = await ai.askAi(H, { history: [], text: 'tool:do_action {"kind":"hr_open_case","args":{"employee":"Dawit","kind":"grievance","title":"Shift complaint"}}', mode: "agent" });
  check("opens a case", r5.done[0]?.ok === true, r5.done);
  const r6 = await ai.askAi(H, { history: [], text: 'tool:do_action {"kind":"hr_open_job","args":{"title":"Video editor","positions":2,"closes":"2027-01-31"}}', mode: "agent" });
  check("opens a job", r6.done[0]?.ok === true, r6.done);
  const r7 = await ai.askAi(H, { history: [], text: 'tool:do_action {"kind":"hr_mark_day","args":{"employee":"Nobody Here","day":"2026-01-01","status":"late"}}', mode: "agent" });
  check("an unknown person is a clear failure, not a crash", r7.done[0]?.ok === false && /No employee/.test(r7.done[0]!.result), r7.done);
  check("each HR action is logged", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM ai_agent_log WHERE user_id = ? AND ok = 1", hrU.id))?.c) >= 6);

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
