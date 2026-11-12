// Update 1.0, production: recordings corrected in place (location changes never add the footage again), the Recording
// lead corrects work before handing it over, lengths in M:S, the My work number, approving and returning many at once,
// and studio sessions changed, deleted, imported (with a preview, kept in sync by session id) and sent to the details.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as wf from "../../src/server/workflow";
import * as lg from "../../src/server/legacy";
import * as ss from "../../src/server/sessions";
import { myWork, myWorkCount, partsToApprove } from "../../src/server/team-flow";
import { shellCounts } from "../../src/server/shell";
import { fmtMS, parseMS } from "../../src/lib/duration";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};
const by = async (email: string): Promise<AppUser> => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const raw = async (itemId: string) => Number((await get<{ m: number | null }>("SELECT a.raw_duration_min AS m FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id = ?", itemId))?.m ?? 0);
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

// The required checklist ticked, as the team does before marking a part done.
const tick = async (unitId: string, partId: string) => {
  const dawit = await by("dawit@demo.local");
  const p = (await lg.legacyParts(unitId, dawit)).find((x) => x.id === partId)!;
  await lg.saveDetails(dawit, partId, { checks: Object.fromEntries(p.checks.map((c) => [c.key, true])) });
};

async function main() {
  const [admin, hana, dawit] = [await by("admin@demo.local"), await by("hana@demo.local"), await by("dawit@demo.local")];

  // Lengths as minutes and seconds.
  check("12:30 reads as twelve and a half minutes", parseMS("12:30") === 12.5 && parseMS("12m30s") === 12.5 && parseMS("12.5") === 12.5 && parseMS("") === null);
  check("a bad length is refused, not guessed", Number.isNaN(parseMS("12:75")) && Number.isNaN(parseMS("abc")));
  check("shown as M:SS", fmtMS(12.5) === "12:30" && fmtMS(3) === "3:00" && fmtMS(null) === "");

  // A part in the old catalog with one shot.
  const grade = (await lg.legacyGrades(dawit))[0]!.id;
  const sub = await lg.addSubject(hana, grade, "Geology");
  const unit = await lg.addUnit(dawit, grade, sub.id, "Unit 1: Rocks");
  const p1 = await lg.addPart(dawit, unit.id, "Part 1: Minerals");
  const item = (await get<{ id: string; code: string }>("SELECT id, code FROM items WHERE lesson_id = ?", p1.id))!;
  await lg.addVideo(dawit, p1.id, { cameraCode: "C0201", title: "Intro", minutes: 10.5, link: "https://drive.example.com/a" });
  check("the raw total is the shot's length", (await raw(item.id)) === 10.5, await raw(item.id));
  const shot = (await lg.legacyParts(unit.id, dawit))[0]!.videos[0]!;

  // Moving it to a disk and correcting its length changes the shot; nothing is added.
  await lg.editVideo(dawit, shot.id, { cameraCode: "C0201", title: "Intro", minutes: 12, disk: "Disk 3", path: "G9/Geo/U1", link: null });
  const after = (await lg.legacyParts(unit.id, dawit))[0]!;
  check("the location is changed on the same shot", after.videos.length === 1 && after.videos[0]!.disk === "Disk 3" && after.videos[0]!.path === "G9/Geo/U1" && !after.videos[0]!.link, after.videos);
  check("the raw total follows the corrected length, not a sum", (await raw(item.id)) === 12, await raw(item.id));
  await lg.editVideo(dawit, shot.id, { cameraCode: "C0201", title: "Intro", minutes: 12, disk: "", link: "https://drive.example.com/b" });
  const back = (await lg.legacyParts(unit.id, dawit))[0]!.videos[0]!;
  check("and back to a link", !back.disk && back.link === "https://drive.example.com/b" && !back.path, back);

  await lg.addVideo(dawit, p1.id, { cameraCode: "C0202", title: "Part two", minutes: 5.25, link: "https://drive.example.com/c" });
  check("a second shot adds its length once", (await raw(item.id)) === 17.25, await raw(item.id));

  // On the work card: correct and remove a recording in place.
  const assets = await all<{ id: string; camera_code: string }>("SELECT id, camera_code FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current' ORDER BY created_at", item.id);
  await wf.editRawAsset({ actor: dawit }, item.id, assets[1]!.id, { disk: "Disk 4", path: "G9/Geo/U1/P1", durationMin: 6 });
  const moved = await get<{ label: string; url: string | null; source_ref: string; duration_min: number }>("SELECT label, url, source_ref, duration_min FROM assets WHERE id = ?", assets[1]!.id);
  check("the work card moves a recording to a disk in place", moved?.label === "disk:Disk 4" && !moved.url && moved.source_ref === "G9/Geo/U1/P1" && Number(moved.duration_min) === 6, moved);
  check("and the total is the sum of the shots", (await raw(item.id)) === 18, await raw(item.id));
  check("the board shows each recording with its id and length", (await myWork(dawit)).items.find((i) => i.id === item.id)?.assets.some((a) => a.id === assets[1]!.id && a.durationMin === 6 && a.disk === "Disk 4") === true);
  await wf.removeRawAsset({ actor: dawit }, item.id, assets[1]!.id);
  check("removing a recording takes its minutes off", (await raw(item.id)) === 12, await raw(item.id));

  // The My work number is the board's own parts still to do.
  const board = (await myWork(dawit)).items.filter((i) => ["queued", "in_progress", "paused", "blocked"].includes(i.status)).length;
  check("My work counts what the board shows to do", (await myWorkCount(dawit)) === board && board > 0, { count: await myWorkCount(dawit), board });
  check("the sidebar shows the same number", (await shellCounts(dawit)).myWork === board);

  // Marked done: the member can no longer change it; the lead can, until it is handed over.
  await tick(unit.id, p1.id);
  await lg.markDone(dawit, p1.id);
  check("done parts leave the to-do number", (await myWorkCount(dawit)) === board - 1);
  const a0 = assets[0]!.id;
  check("a member cannot correct a recording once done", await rejects(() => wf.editRawAsset({ actor: dawit }, item.id, a0, { durationMin: 11 }), /team lead can still correct/));
  await wf.editRawAsset({ actor: hana }, item.id, a0, { durationMin: 11 });
  check("the Recording lead corrects it before handing it over", (await raw(item.id)) === 11, await raw(item.id));
  const leadView = (await lg.legacyParts(unit.id, hana))[0]!;
  check("in the catalog the lead can still change it; the member cannot", leadView.canLog && !leadView.canMark && !(await lg.legacyParts(unit.id, dawit))[0]!.canLog);
  await lg.editVideo(hana, a0, { cameraCode: "C0201", title: "Intro", minutes: 11.5, disk: "Disk 9", path: "x" });
  check("the lead moves its location too, without adding minutes", (await raw(item.id)) === 11.5, await raw(item.id));

  // Approvals: done and sent parts, approved or returned many at once.
  const p2 = await lg.addPart(dawit, unit.id, "Part 2: Crystals");
  const item2 = (await get<{ id: string }>("SELECT id FROM items WHERE lesson_id = ?", p2.id))!;
  await lg.addVideo(dawit, p2.id, { cameraCode: "C0301", minutes: 3, link: "https://drive.example.com/d" });
  await tick(unit.id, p2.id);
  await wf.submitToLead({ actor: dawit }, item2.id);
  const list = await partsToApprove(hana);
  const s1 = list.find((r) => r.id === item.id);
  const s2 = list.find((r) => r.id === item2.id);
  check("Approvals lists parts marked done and parts sent to the lead", s1?.status === "finished" && s2?.status === "lead_review" && s1.shots === 1 && s1.rawMin === 11.5, { s1, s2 });
  check("not for people who lead nothing", (await partsToApprove(dawit)).length === 0);
  check("the Approvals number counts them", (await shellCounts(hana)).leadReview >= 2);
  await wf.leadDecide({ actor: hana }, item.id, { decision: "return", note: "Re-shoot the intro" });
  await wf.leadDecide({ actor: hana }, item2.id, { decision: "approve" });
  check("returned goes back to the member, approved is ready", (await wf.currentAttempt(item.id))?.status === "paused" && (await wf.currentAttempt(item2.id))?.status === "ready");

  // Studio sessions: book, change, record (sent to the details), delete.
  const p3 = await lg.addPart(dawit, unit.id, "Part 3: Fossils");
  const item3 = (await get<{ id: string; code: string }>("SELECT id, code FROM items WHERE lesson_id = ?", p3.id))!;
  const batch = await ss.bookSession(admin, { date: day(3), time: "09:00", durationMin: 120, room: "Studio A", presenter: "Ato Kebede", operatorId: dawit.id, itemIds: [item3.id] });
  await ss.editSession(admin, batch, { date: day(3), time: "10:00", durationMin: 90, room: "Studio B", presenter: "W/ro Almaz", operatorId: dawit.id, itemIds: [item3.id, item.id], note: "Slides" });
  const edited = (await ss.sessionTable(admin, day(0), day(10))).find((b) => b.batchId === batch);
  check("a session is changed in place, parts added", edited?.room === "Studio B" && edited.presenter === "W/ro Almaz" && edited.durationMin === 90 && edited.items.length === 2 && edited.note === "Slides", edited);
  check("a clash is refused when changing", await rejects(async () => {
    const other = await ss.bookSession(admin, { date: day(3), time: "13:00", durationMin: 60, room: "Studio A", itemIds: [item2.id] });
    await ss.editSession(admin, other, { date: day(3), time: "10:30", durationMin: 60, room: "Studio B", itemIds: [item2.id] });
  }, /already booked/));

  await lg.addVideo(dawit, p3.id, { cameraCode: "C0401", minutes: 2, link: "https://drive.example.com/e" });
  await ss.setSessionsStatus(dawit, [batch], "completed");
  const t3 = await get<{ teacher: string | null }>("SELECT teacher FROM items WHERE id = ?", item3.id);
  const n3 = (await wf.currentAttempt(item3.id))?.notes ?? "";
  check("a recorded session gives the part its presenter", t3?.teacher === "W/ro Almaz", t3);
  check("and the studio, day, time and length go on its recording details", /Studio session: Studio B, \d{4}-\d{2}-\d{2} 10:00 to 11:30, 90 min, presenter W\/ro Almaz/.test(n3), n3);
  const legacyNotes = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p3.id);
  check("the catalog's recording details show them", legacyNotes?.teacher === "W/ro Almaz" && /Studio session/.test(legacyNotes.notes ?? ""), legacyNotes);
  await ss.setSessionStatus(admin, batch, "completed");
  check("recording it again does not repeat the line", ((await wf.currentAttempt(item3.id))?.notes ?? "").split("Studio session").length === 2);

  // Import: preview first, then book new rows and change rows with a session id.
  const p4 = await lg.addPart(dawit, unit.id, "Part 4: Layers");
  const item4 = (await get<{ id: string; code: string }>("SELECT id, code FROM items WHERE lesson_id = ?", p4.id))!;
  const rows: ss.SessionImportRow[] = [
    { date: day(5), start: "9:00", minutes: "60", studio: "Studio A", presenter: "Ato Bekele", operator: "Dawit", parts: `${item4.code}; ${item3.code}`, status: "booked", note: "" },
    { session_id: batch, date: day(3), start: "10:00", minutes: "90", studio: "Studio B", presenter: "W/ro Almaz", operator: "dawit@demo.local", parts: item3.code, status: "recorded" },
    { date: day(5), start: "09:30", minutes: "60", studio: "Studio A", parts: "NOPE-123", operator: "Nobody" },
    { date: day(6), start: "9:00", minutes: "60", studio: "Studio Z", parts: item4.code },
  ];
  const preview = await ss.importSessions(admin, rows, false);
  check("the preview says what each row does", preview.lines.map((l) => l.action).join() === "create,update,error,error" && preview.done === 0, preview.lines.map((l) => [l.action, l.errors]));
  check("and why a row is skipped", preview.lines[2]!.errors.some((e) => /NOPE-123/.test(e)) && preview.lines[2]!.errors.some((e) => /Nobody/.test(e)) && preview.lines[3]!.errors.some((e) => /Studio Z/.test(e)));
  check("nothing is booked by a preview", !(await get("SELECT 1 AS x FROM recording_sessions WHERE item_id = ?", item4.id)));
  const done = await ss.importSessions(admin, rows, true);
  check("importing books the new rows and changes the synced one", done.done === 2, done.lines.map((l) => [l.action, l.errors]));
  const synced = (await ss.sessionTable(admin, day(0), day(10))).find((b) => b.batchId === batch);
  check("the synced session now has only the listed part, still recorded", synced?.items.length === 1 && synced.items[0]!.id === item3.id && synced.status === "completed", synced);
  const fresh = (await ss.sessionTable(admin, day(0), day(10))).find((b) => b.items.some((i) => i.id === item4.id));
  check("the new session has its presenter, operator and parts", fresh?.presenter === "Ato Bekele" && fresh.operatorId === dawit.id && fresh.items.length === 2 && fresh.room === "Studio A", fresh);
  check("only the people who book sessions import them", await rejects(() => ss.importSessions(dawit, rows, false), /academic manager/));

  const removed = await ss.deleteSessions(admin, [fresh!.batchId]);
  check("sessions are deleted with their parts' rows", removed === 2 && !(await get("SELECT 1 AS x FROM recording_sessions WHERE batch_id = ?", fresh!.batchId)));
  check("a member cannot delete sessions", await rejects(() => ss.deleteSessions(dawit, [batch]), /academic manager/));

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
