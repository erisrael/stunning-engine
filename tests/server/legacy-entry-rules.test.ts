// Legacy catalog, camera operator rules (MySeed feedback, Nov 2026): one place for every detail (the video entry), the
// required fields with Draft or Submitted for Review, unique camera codes per studio and day, parts named "Part X" with
// unique numbers, read-only names for media contributors, and feedback with screenshots and documents.
process.env.MAIL_FAKE = "1";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as lg from "../../src/server/legacy";
import * as sup from "../../src/server/support";
import { savePresenter } from "../../src/server/presenters";

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
const PDF = { name: "handout.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") };
const PNG = { name: "screen.png", mime: "image/png", base64: Buffer.from("png-bytes").toString("base64") };
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 21 * 3600_000).toISOString().slice(0, 10);

async function main() {
  const [admin, hana, dawit, meron] = [await by("admin@demo.local"), await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local")];
  await savePresenter(admin, { name: "W/ro Almaz Tesfaye" });
  await savePresenter(admin, { name: "Ato Bekele Girma" });
  const choices = await lg.legacyChoices();
  check("the form offers the studios and the presenters list", choices.studios.length >= 2 && choices.presenters.includes("W/ro Almaz Tesfaye"), choices);
  const studio = choices.studios[0]!;

  // Hierarchy: a camera operator adds units inside a subject, never subjects; a unit needs a title.
  const grade = (await lg.legacyGrades(dawit))[0]!.id;
  check("a camera operator cannot add a subject", await rejects(() => lg.addSubject(dawit, grade, "Chemistry X"), /lead or a planner adds subjects/));
  const sub = await lg.addSubject(hana, grade, "Physics Rules");
  check("a unit cannot be saved without a title", (await rejects(() => lg.addUnit(dawit, grade, sub.id, "Unit 2:"), /unit its title/)) && (await rejects(() => lg.addUnit(dawit, grade, sub.id, "  "), /unit its title/)));
  check("nor outside a subject of the grade", await rejects(() => lg.addUnit(dawit, grade, "sub_nope", "Unit 1: Motion"), /subject of this grade/));
  const unit = await lg.addUnit(dawit, grade, sub.id, "Unit 1: Motion");
  check("a camera operator adds a unit with a title", (await get<{ title: string }>("SELECT title FROM units WHERE id = ?", unit.id))?.title === "Motion");

  // Parts: "Part X", the number unique in the unit, sorted by number, Standard or Review.
  const p3 = await lg.addPart(dawit, unit.id, 3);
  const p1 = await lg.addPart(dawit, unit.id, 1);
  check("a part is named only Part X", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", p3.id))?.title === "Part 3");
  check("the number is unique in the unit", await rejects(() => lg.addPart(dawit, unit.id, 3), /Part 3 already exists/));
  check("and a whole number from 1", (await rejects(() => lg.addPart(dawit, unit.id, 0), /whole number/)) && (await rejects(() => lg.addPart(dawit, unit.id, 2.5), /whole number/)));
  const rv = await lg.addPart(dawit, unit.id, 2, { kind: "review" });
  let parts = await lg.legacyParts(unit.id, dawit);
  check("parts are listed by number", parts.map((p) => p.number).join(",") === "1,2,3", parts.map((p) => p.number));
  check("a review part keeps its kind", parts.find((p) => p.id === rv.id)?.kind === "review" && parts.find((p) => p.id === rv.id)?.title === "Part 2");
  check("a camera operator cannot renumber a part", await rejects(() => lg.editPart(dawit, p3.id, { number: 4 }), /lead or a planner/));
  check("the lead cannot take a number in use", await rejects(() => lg.editPart(hana, p3.id, { number: 1 }), /Part 1 already exists/));
  await lg.editPart(hana, p3.id, { number: 4, kind: "standard" });
  check("the lead renumbers a part; the name follows", (await get<{ title: string; number: number }>("SELECT title, number FROM lessons WHERE id = ?", p3.id))?.title === "Part 4");
  check("a camera operator cannot delete a part", await rejects(() => lg.deletePart(dawit, p3.id), /lead or a planner/));

  // Video entry: Draft needs code, title, studio; Submit needs everything.
  check("a draft needs a title", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "C0500", studio, status: "draft" }), /title/));
  check("a draft needs a studio", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "C0500", title: "Speed", status: "draft" }), /studio/));
  check("Other needs a reason", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "C0500", title: "Speed", studio: lg.OTHER_STUDIO, status: "draft" }), /why the studio is Other/));
  check("a studio from the list", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "C0500", title: "Speed", studio: "Garage", status: "draft" }), /from the list/));
  const draft = await lg.addVideo(dawit, p1.id, { cameraCode: "c0500", title: "Speed", studio, status: "draft" });
  check("a draft is saved with only code, title and studio", draft.status === "draft" && draft.code === "C0500");
  parts = await lg.legacyParts(unit.id, dawit);
  let v = parts.find((p) => p.id === p1.id)!.videos[0]!;
  check("the entry's heading is its title, and it says Draft", v.title === "Speed" && v.status === "draft" && v.mine && v.canEdit && v.canDelete, v);
  check("the part counts its drafts", parts.find((p) => p.id === p1.id)!.drafts === 1);
  const sub1 = await rejects(() => lg.editVideo(dawit, v.id, { cameraCode: "C0500", title: "Speed", studio, status: "submitted" }), /presenter, recording date, length \(M:S\), storage location .*, supporting resources/);
  check("submitting says every field still missing", sub1);
  check("a presenter must come from the Presenters list", await rejects(() => lg.editVideo(dawit, v.id, { cameraCode: "C0500", title: "Speed", studio, presenter: "Someone Else", recordedOn: today, minutes: 12.5, link: "D:\\Raw\\Physics", noResources: true, status: "submitted" }), /Presenters list/));
  check("a doubtful code is not submitted", await rejects(() => lg.editVideo(dawit, v.id, { cameraCode: "hello", title: "Speed", studio, presenter: "W/ro Almaz Tesfaye", recordedOn: today, minutes: 12.5, link: "D:\\Raw", noResources: true, status: "submitted" }), /does not look like a camera code/));
  check("the recording date cannot be in the future", await rejects(() => lg.editVideo(dawit, v.id, { cameraCode: "C0500", title: "Speed", studio, recordedOn: "2999-01-01", status: "draft" }), /future/));
  check("Done is refused while a draft is left", await rejects(() => lg.markDone(dawit, p1.id), /draft entries/));
  await lg.editVideo(dawit, v.id, { cameraCode: "C0500 & c0501", title: "Speed", studio, presenter: "W/ro Almaz Tesfaye", recordedOn: today, minutes: 12.5, link: "D:\\Raw\\Physics", files: [PDF], status: "submitted" });
  v = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p1.id)!.videos[0]!;
  check("submitted with every field, and the PDF attached", v.status === "submitted" && v.cameraCode === "C0500 & C0501" && v.presenter === "W/ro Almaz Tesfaye" && v.minutes === 12.5 && v.files.length === 1 && v.files[0]!.name === "handout.pdf", v);
  const item = (await get<{ id: string; teacher: string | null; title: string }>("SELECT id, teacher, title FROM items WHERE lesson_id = ?", p1.id))!;
  check("the presenter is entered once and the work shows it", item.teacher === "W/ro Almaz Tesfaye", item);
  check("the work item takes the video title so other teams see the topic", item.title === "Speed", item);
  check("the attached file can be read back, by the team and by those who see the work", (await lg.readVideoFile(hana, v.files[0]!.id))?.data.toString() === "%PDF-1.4 test" && !(await lg.readVideoFile(meron, "af_nope")));

  // A camera code is unique per studio and recording date.
  check("the same code, studio and day is refused", await rejects(() => lg.addVideo(dawit, p3.id, { cameraCode: "C0501", title: "Velocity", studio, recordedOn: today, status: "draft" }), /C0501 is already logged/));
  const otherDay = await lg.addVideo(dawit, p3.id, { cameraCode: "C0501", title: "Velocity", studio, recordedOn: yesterday, presenter: "Ato Bekele Girma", minutes: 3.25, disk: "Disk B", path: "Physics/U1", noResources: true, status: "submitted" });
  check("on another day it is a different file", otherDay.status === "submitted");

  // Presenter prefill comes from the previous clip; a second entry by someone else.
  await lg.addVideo(hana, p1.id, { cameraCode: "C0600", title: "Acceleration", studio, status: "draft" });
  const vs = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p1.id)!.videos;
  const hanas = vs.find((x) => x.cameraCode === "C0600")!;
  check("a camera operator cannot change or delete someone else's entry", !hanas.canEdit && !hanas.canDelete && (await rejects(() => lg.editVideo(dawit, hanas.id, { cameraCode: "C0600", title: "Mine now" }), /only your own/)) && (await rejects(() => lg.deleteVideo(dawit, hanas.id), /only your own/)));
  check("the lead sees and can change every entry", (await lg.legacyParts(unit.id, hana)).find((p) => p.id === p1.id)!.videos.every((x) => x.canEdit));
  await lg.deleteVideo(hana, hanas.id);

  // Removing a file and choosing None.
  await lg.editVideo(dawit, v.id, { cameraCode: "C0500 & C0501", removeFiles: [v.files[0]!.id], noResources: true, status: "submitted" });
  v = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p1.id)!.videos[0]!;
  check("a file is removed, and None is kept", v.files.length === 0 && v.noResources && v.status === "submitted", v);

  // Done ticks the checklist in the same step.
  const part = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p1.id)!;
  await lg.markDone(dawit, p1.id, Object.fromEntries(part.checks.map((c) => [c.key, true])));
  const doneP = (await lg.legacyParts(unit.id, dawit)).find((p) => p.id === p1.id)!;
  check("Done ticks the checklist and finishes the part", doneP.status === "finished" && doneP.checks.every((c) => c.checked), doneP.status);
  check("once done, a camera operator cannot change the entry; the lead can update the storage", (await rejects(() => lg.editVideo(dawit, v.id, { cameraCode: "C0500 & C0501", link: "E:\\x" }), /no longer open/)) && !!(await lg.editVideo(hana, v.id, { cameraCode: "C0500 & C0501", disk: "Disk A", path: "Physics/U1", status: "submitted" })));
  check("moving it to a disk changes the entry, not the footage total", (await lg.legacyParts(unit.id, hana)).find((p) => p.id === p1.id)!.rawMin === 12.5);

  // Old titles become Part X once.
  await run("UPDATE lessons SET title = 'Part 4: Intro', part_kind = NULL WHERE id = ?", p3.id);
  check("only Admin or a planner renames old parts", await rejects(() => lg.migratePartNames(dawit, false), /Admin or a planner/));
  const dry = await lg.migratePartNames(admin, false);
  check("the check shows what changes and changes nothing", dry.count >= 1 && dry.sample.some((x) => x.from === "Part 4: Intro" && x.to === "Part 4") && (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", p3.id))?.title === "Part 4: Intro", dry);
  await lg.migratePartNames(admin, true);
  check("then the old parts are renamed", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", p3.id))?.title === "Part 4" && (await lg.migratePartNames(admin, false)).count === 0);

  // Feedback carries screenshots and documents.
  check("feedback refuses other file kinds", await rejects(() => sup.sendFeedback(dawit, { category: "bug", message: "Broken", files: [{ name: "run.exe", mime: "application/x-msdownload", base64: "AAAA" }] }), /not a screenshot/));
  check("and too many files", await rejects(() => sup.sendFeedback(dawit, { category: "bug", message: "Broken", files: Array.from({ length: 7 }, () => PNG) }), /at most 6/));
  const fb = await sup.sendFeedback(dawit, { category: "bug", message: "The card shows To be determined", page: "/legacy", files: [PNG, PDF] });
  const mine = (await sup.myFeedback(dawit)).find((f) => f.id === fb)!;
  check("feedback is saved with its files", mine.files.length === 2 && mine.files[0]!.name === "screen.png", mine.files);
  check("a screenshot alone is enough", !!(await sup.sendFeedback(dawit, { category: "bug", message: "", files: [PNG] })));
  const adminList = (await sup.listFeedback(admin)).find((f) => f.id === fb)!;
  check("Admin sees the files", adminList.files.length === 2);
  check("the files open for the sender and Admin only", !!(await sup.readFeedbackFile(dawit, mine.files[0]!.id)) && !!(await sup.readFeedbackFile(admin, mine.files[1]!.id)) && !(await sup.readFeedbackFile(meron, mine.files[0]!.id)));

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
