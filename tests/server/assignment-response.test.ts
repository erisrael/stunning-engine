// A team member accepts or rejects work assigned to them, with a reason; rejecting hands it back to the lead, who is
// told why; only the person it is assigned to answers, before starting it.
process.env.MAIL_FAKE = "1";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as wf from "../../src/server/workflow";
import { respondToAssignment, latestResponses } from "../../src/server/assignment-response";
import { myWork } from "../../src/server/team-flow";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => fn().then(() => false, (e) => re.test(String(e?.message ?? e)));

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const dawit = await by("dawit@demo.local");
  const hana = await by("hana@demo.local");
  const lesson = (await get<{ id: string; grade_id: string; subject_id: string }>("SELECT l.id, u.grade_id, u.subject_id FROM lessons l JOIN units u ON u.id = l.unit_id LIMIT 1"))!;
  const mk = (title: string) => wf.createItem({ actor: null, source: "seed" }, { lessonId: lesson.id, gradeId: lesson.grade_id, subjectId: lesson.subject_id, title, owners: { recording: dawit.id } } as never);
  const a = await mk("Assigned part A");
  const b = await mk("Assigned part B");
  const idOf = (x: unknown) => (typeof x === "string" ? x : (x as { id: string }).id);
  const A = idOf(a);
  const B = idOf(b);

  check("someone else cannot answer it", await rejects(() => respondToAssignment(hana, A, "accepted"), /assigned to you/));
  check("rejecting needs a reason", await rejects(() => respondToAssignment(dawit, A, "declined", ""), /Say why/));
  await respondToAssignment(dawit, A, "accepted", "Thursday morning");
  const mine = await myWork(dawit);
  const itA = mine.items.find((i) => i.id === A);
  check("accepted, with the note, and still theirs", itA?.response?.decision === "accepted" && itA.response.reason === "Thursday morning", itA?.response);
  await respondToAssignment(dawit, B, "declined", "I am on leave that week");
  const after = await myWork(dawit);
  check("rejected work leaves their board", !after.items.some((i) => i.id === B));
  const owner = await get<{ u: string | null }>("SELECT COALESCE(a.owner_id, sa.user_id) AS u FROM items i LEFT JOIN stage_attempts a ON a.id = i.current_attempt_id LEFT JOIN stage_assignments sa ON sa.item_id = i.id AND sa.stage = 'recording' WHERE i.id = ?", B);
  check("and goes back to the lead unassigned", !owner?.u, owner);
  const note = await all<{ title: string; body: string }>("SELECT title, body FROM notifications WHERE user_id = ? AND item_id = ? ORDER BY created_at DESC", hana.id, B);
  check("the lead is told why", note.some((n) => /rejected/.test(n.title) && /on leave/.test(n.body)), note);
  check("answers are kept", (await latestResponses(dawit.id, [A, B])).size === 2);
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => closeDb());
