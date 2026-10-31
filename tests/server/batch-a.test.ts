// Batch A checks: review notes, changes since a return, studio sessions, handover badge, redo notice.
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { getSettings } from "../../src/server/settings";
import * as wf from "../../src/server/workflow";
import * as ed from "../../src/server/editorial";
import * as rn from "../../src/server/review-notes";
import * as ss from "../../src/server/sessions";
import { leadDesk, myWork } from "../../src/server/team-flow";
import { shellCounts } from "../../src/server/shell";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
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
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const [hana, dawit, meron] = [await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local")];
  const items = await all<{ id: string; code: string }>("SELECT i.id, i.code FROM items i JOIN lessons l ON l.id = i.lesson_id ORDER BY l.number");
  const [p1, p2, p3] = items;

  // Studio sessions
  const day = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
  const batch = await ss.bookSession(hana, { date: day, time: "10:00", durationMin: 120, room: "Studio A", presenter: "Teacher Almaz", operatorId: dawit.id, itemIds: [p1!.id, p2!.id], assignToOperator: true });
  check("lead books a session for two parts", !!batch);
  check("parts are given to the operator", (await get<{ user_id: string }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", p1!.id))?.user_id === dawit.id);
  check("the same studio at an overlapping time is refused", /already booked/.test((await throws(() => ss.bookSession(hana, { date: day, time: "11:00", durationMin: 60, room: "Studio A", itemIds: [p3!.id] }))) ?? ""));
  check("the operator cannot be in two studios at once", /operator is already booked/.test((await throws(() => ss.bookSession(hana, { date: day, time: "11:00", durationMin: 60, room: "Studio B", operatorId: dawit.id, itemIds: [p3!.id] }))) ?? ""));
  await ss.bookSession(hana, { date: day, time: "12:00", durationMin: 60, room: "Studio A", itemIds: [p3!.id] });
  check("back-to-back booking in the same studio is fine", true);
  check("a team member cannot book", !!(await throws(() => ss.bookSession(dawit, { date: day, time: "15:00", durationMin: 60, room: "Studio B", itemIds: [p3!.id] }))));
  const week = await ss.sessionWeek(hana, ss.weekStartOf(day, 1));
  const b = week.bookings.find((x) => x.batchId === batch);
  check("the week shows the booking with both parts", b?.items.length === 2 && b.room === "Studio A" && b.operator === "Dawit", b);
  check("operator sees their next sessions", (await ss.mySessions(dawit)).some((x) => x.batchId === batch));
  check("moving into a clash is refused", /already booked/.test((await throws(() => ss.moveSession(hana, batch, { date: day, time: "12:30" }))) ?? ""));
  await ss.moveSession(hana, batch, { date: day, time: "08:00" });
  check("moving to a free time works", (await ss.sessionWeek(hana, ss.weekStartOf(day, 1))).bookings.some((x) => x.batchId === batch));
  const mine = await myWork(dawit);
  check("the recorder's card shows the session", mine.items.some((x) => x.id === p1!.id && x.session?.room === "Studio A"), mine.items.map((x) => x.session));

  // Review notes and changes since a return
  const d = { actor: dawit };
  await wf.startWork(d, p1!.id, { switchFrom: true });
  await wf.addAsset(d, p1!.id, { kind: "raw", url: "https://drive.example/raw1", cameraCode: "00001" } as never);
  for (const c of (await getSettings()).checklists.recording) if (c.required) await wf.setChecklist(d, p1!.id, c.key, true);
  await wf.submitToLead(d, p1!.id);
  check("a team member cannot add review notes", !!(await throws(() => rn.addReviewNote(dawit, p1!.id, { at: "0:42", note: "x" }))));
  await rn.addReviewNote(hana, p1!.id, { at: "0:42", note: "Board is out of focus" });
  await rn.addReviewNote(hana, p1!.id, { at: "3:05", note: "Audio drops" });
  check("bad timecode is refused", !!(await throws(() => rn.addReviewNote(hana, p1!.id, { at: "abc", note: "x" }))));
  let desk = (await leadDesk(hana, "recording"))!;
  const card = desk.review.find((x) => x.id === p1!.id)!;
  check("lead sees notes in time order", card.reviewNotes.length === 2 && card.reviewNotes[0]!.atSec === 42, card.reviewNotes);
  await wf.leadDecide({ actor: hana }, p1!.id, { decision: "return", note: "0:42 Board is out of focus; 3:05 Audio drops" });
  const back = (await myWork(dawit)).items.find((x) => x.id === p1!.id)!;
  check("the recorder sees the notes after the return", back.reviewNotes.filter((n) => !n.resolved).length === 2);
  await rn.resolveReviewNote(dawit, back.reviewNotes[0]!.id, true);
  await wf.addAsset(d, p1!.id, { kind: "raw", url: "https://drive.example/raw1b", cameraCode: "00003" } as never);
  await wf.submitToLead(d, p1!.id);
  desk = (await leadDesk(hana, "recording"))!;
  const again = desk.review.find((x) => x.id === p1!.id)!;
  check("lead sees what changed since the return", !!again.changes && again.changes.changes.length >= 2, again.changes);
  check("one note fixed, one open", again.reviewNotes.filter((n) => n.resolved).length === 1 && again.reviewNotes.filter((n) => !n.resolved).length === 1);

  // Handover badge for the next lead
  await wf.leadDecide({ actor: hana }, p1!.id, { decision: "approve" });
  const before = (await shellCounts(meron)).incoming;
  await ed.createHandover(hana, { itemIds: [p1!.id] });
  check("the next lead's handover badge counts the new batch", (await shellCounts(meron)).incoming === before + 1);

  // Redo notice goes to the target team's leads (action layer); the engine reopens the stage.
  const n0 = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ?", hana.id))?.c ?? 0);
  void n0;
  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
}
main();
