// Phase 34: the Recording team's old catalog works as it did, and everything goes into the real system.
// Set LEGACY_BACKUP to a real backup file to also check a full import of it.
process.env.MAIL_FAKE = "1";
import fs from "node:fs";
import { all, closeDb, get } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as wf from "../../src/server/workflow";
import * as lg from "../../src/server/legacy";
import { myWork } from "../../src/server/team-flow";
import { canOpenPath } from "../../src/server/page-access";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
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

async function main() {
  const [admin, hana, dawit, meron] = [await by("admin@demo.local"), await by("hana@demo.local"), await by("dawit@demo.local"), await by("meron@demo.local")];
  await upsertAccount({ name: "Outside", email: "outside@legacy.local", title: "HR", roles: ["hr_manager"], password: "Legacy-2026-Out!", mustChangePassword: false } as never);
  const outside = await by("outside@legacy.local");
  check("the Recording team uses it", lg.canUseLegacy(dawit) && lg.canUseLegacy(hana));
  check("other teams do not", !lg.canUseLegacy(meron) && !lg.canUseLegacy(outside) && !(await canOpenPath(meron, "/legacy")) && (await canOpenPath(dawit, "/legacy")));
  check("others are refused", await rejects(() => lg.addUnit(meron, "x", "y", "Unit 1"), /Recording team/));

  // The levels, top down.
  const grades = await lg.legacyGrades(dawit);
  check("grades, with their school level", grades.length > 0 && grades.every((g) => g.name), grades.slice(0, 2));
  const grade = grades[0]!.id;

  check("a camera operator cannot add a subject", await rejects(() => lg.addSubject(dawit, grade, "Astronomy"), /lead or a planner adds subjects/));
  const sub = await lg.addSubject(hana, grade, "Astronomy");
  check("a new subject is added", (await lg.legacySubjects(dawit, grade)).some((s) => s.id === sub.id && s.name === "Astronomy"));
  const again = await lg.addSubject(hana, grade, "astronmy");
  check("the same subject typed a little differently is not a second one", again.id === sub.id && again.sameAs === "Astronomy", again);

  const u1 = await lg.addUnit(dawit, grade, sub.id, "Unit 3: The Sky");
  const row = await get<{ number: number; title: string }>("SELECT number, title FROM units WHERE id = ?", u1.id);
  check("a unit takes its number and clean name from what is typed", Number(row?.number) === 3 && row?.title === "The Sky", row);
  check("the next unit gets a free number", (await lg.addUnit(dawit, grade, sub.id, "Unit 3: The Moon")).number === 4);

  const p1 = await lg.addPart(dawit, u1.id, "Part 1: Stars");
  const it = await get<{ id: string; title: string; lifecycle: string; code: string }>("SELECT id, title, lifecycle, code FROM items WHERE lesson_id = ?", p1.id);
  check("a part is real work named by number: a draft with its code", it?.title === "Part 1" && it.lifecycle === "draft" && !!it.code && (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", p1.id))?.title === "Part 1", it);
  check("placed in the grade and subject", !!(await get("SELECT 1 AS x FROM item_memberships WHERE item_id = ? AND grade_id = ? AND subject_id = ? AND unit_id = ? AND is_primary = 1", it!.id, grade, sub.id, u1.id)));
  check("the part shows in the unit", (await lg.legacyParts(u1.id))[0]?.where === "Not started");

  // Video shots.
  const r = await lg.addVideo(dawit, p1.id, { cameraCode: "c0172 and CO173", title: "Introduction", description: "Cut in two" });
  check("the code is tidied", r.code === "C0172 & C0173", r);
  const asset = await get<{ id: string; camera_code: string; label: string; notes: string; stage: string; status: string }>("SELECT id, camera_code, label, notes, stage, status FROM assets WHERE item_id = ? AND kind = 'raw'", it!.id);
  check("a shot is a real recording on the work", asset?.camera_code === "C0172 & C0173" && asset.label === "Introduction" && asset.notes === "Cut in two" && asset.status === "current", asset);
  const att = await wf.currentAttempt(it!.id);
  check("the part is now in Recording, owned by who logged it", att?.stage === "recording" && att.owner_id === dawit.id, att);
  check("and on their board", (await myWork(dawit)).items.some((x) => x.id === it!.id));
  check("the counts follow", (await lg.legacyUnits(grade, sub.id)).find((x) => x.id === u1.id)?.videos === 1 && (await lg.legacyStats()).videos >= 1);
  check("a code is required", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "  " }), /camera code/));

  const named = await lg.addPart(dawit, u1.id, "Part 2:");
  await lg.addVideo(dawit, named.id, { cameraCode: "C0200", title: "Simple Present ......" });
  check("the part keeps its number name; its work takes the video's title", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", named.id))?.title === "Part 2" && (await get<{ title: string }>("SELECT title FROM items WHERE lesson_id = ?", named.id))?.title === "Simple Present");
  const tbd = await lg.addPart(dawit, u1.id, "Part 3: Topic Name");
  await lg.addVideo(dawit, tbd.id, { cameraCode: "C0201", title: "To be determined" });
  check("but not from a placeholder", (await get<{ title: string }>("SELECT title FROM items WHERE lesson_id = ?", tbd.id))!.title === "Part 3");

  // Correcting and removing.
  await lg.editVideo(dawit, asset!.id, { cameraCode: "C0172", title: "Introduction to stars", description: "" });
  check("a shot is corrected", (await get<{ camera_code: string; label: string }>("SELECT camera_code, label FROM assets WHERE id = ?", asset!.id))?.label === "Introduction to stars");
  const extra = await lg.addVideo(dawit, p1.id, { cameraCode: "C0999" });
  void extra;
  const extraId = (await get<{ id: string }>("SELECT id FROM assets WHERE camera_code = 'C0999'"))!.id;
  await lg.deleteVideo(dawit, extraId);
  check("a shot is removed", (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)?.videos.length === 1);
  check("a member cannot delete a part", await rejects(() => lg.deletePart(dawit, tbd.id), /lead or a planner/));

  // Everything else the team enters on a part.
  let part1 = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!;
  check("the part lists the checklist, ticked when it is marked done (not as missing details)", part1.checks.length > 0 && !part1.missing.some((m) => part1.checks.some((c) => c.label === m)), part1);
  await lg.saveDetails(dawit, p1.id, { teacher: "Ato Kebede", rawMin: 42, notes: "Studio 2, second take is better", checks: Object.fromEntries(part1.checks.map((c) => [c.key, true])) });
  part1 = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!;
  check("presenter, minutes, notes and checklist are saved on the real work", part1.teacher === "Ato Kebede" && part1.rawMin === 42 && /Studio 2/.test(part1.notes ?? "") && part1.checks.every((c) => c.checked), part1);
  check("and nothing is missing now", part1.missing.length === 0, part1.missing);
  await lg.addVideo(dawit, p1.id, { cameraCode: "C0173", title: "Second take", minutes: 20, link: "https://drive.example.com/c0173" });
  const shot = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!.videos.find((v) => v.cameraCode === "C0173")!;
  check("a shot keeps its minutes and link", shot.minutes === 20 && shot.link === "https://drive.example.com/c0173", shot);
  await lg.addVideo(dawit, p1.id, { cameraCode: "C0174", title: "On the disk", disk: "Disk A", path: "G9/Astronomy/U3" });
  const diskShot = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!.videos.find((v) => v.cameraCode === "C0174")!;
  check("or the disk and folder it is on", diskShot.disk === "Disk A" && diskShot.path === "G9/Astronomy/U3", diskShot);

  // Done: it waits ready to hand off; it is not handed off on its own.
  check("Done is offered once it has a shot", part1.canMark && part1.canLog);
  await lg.markDone(dawit, p1.id);
  const doneAt = await wf.currentAttempt(it!.id);
  check("done: it stays in Recording, ready to hand off", doneAt?.stage === "recording" && doneAt.status === "finished", doneAt);
  const after1 = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!;
  check("the catalog says so", /ready to hand off/.test(after1.where) && after1.canReopen && !after1.canLog, after1);
  await lg.reopenPart(dawit, p1.id);
  check("it can be reopened to change it", (await wf.currentAttempt(it!.id))?.status === "paused");
  await lg.markDone(dawit, p1.id);
  const ready = await lg.readyToHandOff(dawit, {});
  check("it is on the person's Ready to hand off list", ready.some((r) => r.itemId === it!.id && r.teacher === "Ato Kebede"), ready);
  check("filters by teacher and subject", (await lg.readyToHandOff(dawit, { teacher: "ato kebede" })).length >= 1 && (await lg.readyToHandOff(dawit, { subjectId: "nope" })).length === 0);
  const sentR = await lg.handOff(dawit, [it!.id]);
  check("a member hands it off to the Recording lead", sentR.sentToLead && sentR.results[0]?.ok === true && (await wf.currentAttempt(it!.id))?.status === "lead_review", sentR);
  const leadList = await lg.readyToHandOff(hana, {});
  check("the lead sees it", leadList.some((r) => r.itemId === it!.id && r.status === "lead_review"));
  const batch = await lg.handOff(hana, [it!.id]);
  check("the lead hands it over to Editing as a batch", !!batch.handover && (await wf.currentAttempt(it!.id))?.status === "awaiting_handoff", batch);
  const after = (await lg.legacyParts(u1.id)).find((x) => x.id === p1.id)!;
  check("then it waits for Editing, and logging stops", /waiting for Editing/.test(after.where) && !after.canLog && !after.canMark, after);
  check("a video cannot be added now", await rejects(() => lg.addVideo(dawit, p1.id, { cameraCode: "C1" }), /left Recording/));
  check("a camera operator cannot change it once it has left Recording", await rejects(() => lg.editVideo(dawit, asset!.id, { cameraCode: "C0172", title: "Stars" }), /no longer open/));
  await lg.editVideo(hana, asset!.id, { cameraCode: "C0172", title: "Stars", description: "" });
  check("but the Recording lead can still correct the details", (await get<{ label: string }>("SELECT label FROM assets WHERE id = ?", asset!.id))?.label === "Stars");
  await wf.acceptHandoff({ actor: null, source: "bulk", silent: true }, it!.id, {});
  check("work past Recording cannot be deleted", await rejects(() => lg.deletePart(hana, p1.id), /past Recording/));
  check("nor its unit", await rejects(() => lg.deleteUnit(hana, u1.id), /past Recording/));
  await lg.deletePart(hana, tbd.id);
  check("a part still in Recording can, and its work is cancelled", !(await get("SELECT 1 AS x FROM lessons WHERE id = ?", tbd.id)) && !!(await get("SELECT 1 AS x FROM items WHERE lesson_id IS NULL AND lifecycle = 'cancelled'")));
  const empty = await lg.addSubject(hana, grade, "Geology");
  await lg.addUnit(hana, grade, empty.id, "Unit 1: Rocks");
  await lg.deleteSubject(hana, grade, empty.id);
  check("a subject with nothing worked on can be removed", !(await lg.legacySubjects(hana, grade)).some((s) => s.id === empty.id));

  // Settings.
  await lg.saveLegacyConfig(admin, { afterVideo: "done" });
  const auto = await lg.addPart(dawit, u1.id, "Part 9: Auto");
  const autoItem = (await get<{ id: string }>("SELECT id FROM items WHERE lesson_id = ?", auto.id))!.id;
  await lg.saveDetails(dawit, auto.id, { rawMin: 5, checks: Object.fromEntries((await lg.legacyParts(u1.id)).find((x) => x.id === auto.id)!.checks.map((c) => [c.key, true])) });
  await lg.addVideo(dawit, auto.id, { cameraCode: "C0300", title: "Auto" });
  check("set to mark done at once, a shot makes it ready to hand off, never handed off", (await wf.currentAttempt(autoItem))?.status === "finished");
  await lg.saveLegacyConfig(admin, { afterVideo: "stay", on: false });
  check("Admin can switch it off for the team", !(await canOpenPath(dawit, "/legacy")));
  check("only Admin changes it", await rejects(() => lg.saveLegacyConfig(hana, { on: true }), /Only Admin/));
  await lg.saveLegacyConfig(admin, { on: true });

  // Import and exports.
  const backup = {
    "grade-11": {
      name: "Grade 11",
      type: "Secondary School",
      subjects: [
        {
          id: "lg-eng",
          name: "English",
          units: [
            { id: "lg-u1", title: "Unit 4: Ancient Civilizations and Medieva", parts: [] },
            { id: "lg-u2", title: "l Unit 5: Africa", parts: [{ id: "lg-p1", title: "Part 1: Topic Name", videos: [{ id: "lg-v1", cameraCode: "c0106 repeated", title: "Lesson one ....", description: "" }] }] },
          ],
        },
      ],
    },
  };
  check("a member cannot import", await rejects(() => lg.importLegacy(dawit, JSON.stringify(backup), "b.json", true), /lead or a planner/));
  check("a bad file is refused", await rejects(() => lg.importLegacy(hana, "{nope", "b.json", true), /Failed to read/) && (await rejects(() => lg.importLegacy(hana, '{"a":1}', "b.json", true), /Invalid JSON catalog/)));
  const dry = await lg.importLegacy(hana, JSON.stringify(backup), "b.json", true);
  check("checking says what is in it and what gets tidied, and changes nothing", dry.counts.units === 2 && dry.counts.videos === 1 && dry.fixCount >= 2 && !(await get("SELECT 1 AS x FROM units WHERE source_ref = 'lg-u1'")), dry);
  const done = await lg.importLegacy(hana, JSON.stringify(backup), "b.json", false);
  check("it goes in, tidied", done.summary?.parts.created === 1 && (await get<{ title: string }>("SELECT title FROM units WHERE source_ref = 'lg-u1'"))?.title.endsWith("Medieval") === true && (await get<{ title: string }>("SELECT title FROM units WHERE source_ref = 'lg-u2'"))?.title === "Africa", done.summary);
  check("the part got the video's name, the code its note", (await get<{ title: string }>("SELECT title FROM lessons WHERE source_ref = 'lg-p1'"))?.title === "Lesson one" && !!(await get("SELECT 1 AS x FROM assets WHERE camera_code = 'C0106' AND notes = 'Repeated'")));
  const twice = await lg.importLegacy(hana, JSON.stringify(backup), "b.json", false);
  check("importing again adds nothing", twice.summary?.parts.created === 0 && twice.summary?.recordings.created === 0, twice.summary);
  const file = await lg.legacyBackup(admin);
  check("the backup is the same file format", !!file["grade-11"]?.subjects[0]?.units[0]?.parts && lg.canImportLegacy(hana));
  const word = await lg.legacyWord(admin);
  check("the Word export has the catalog in it", word.includes("Grade 11") && word.includes("Subject: English") && word.includes("C0106") && word.includes("urn:schemas-microsoft-com:office:word"));
  check("and escapes what people typed", !(await lg.legacyWord(admin)).includes("<script"));

  // The real file, when given.
  const real = process.env.LEGACY_BACKUP;
  if (real && fs.existsSync(real)) {
    const text = fs.readFileSync(real, "utf8");
    const c = await lg.importLegacy(admin, text, "real.json", true);
    console.log(`real backup: ${JSON.stringify(c.counts)}, ${c.fixCount} tidied`);
    const t0 = Date.now();
    const s = await lg.importLegacy(admin, text, "real.json", false);
    console.log(`real import took ${Math.round((Date.now() - t0) / 1000)} s: ${JSON.stringify(s.summary)}`);
    check("the real backup's parts are all in", (s.summary?.parts.created ?? 0) + (s.summary?.parts.updated ?? 0) === c.counts.parts, s.summary);
    check("with no warnings lost", (s.summary?.warnings.length ?? 0) === 0, s.summary?.warnings.slice(0, 5));
    const issues = await (await import("../../src/server/curriculum-fix")).findIssues();
    const tally: Record<string, number> = {};
    for (const i of issues) tally[i.kind] = (tally[i.kind] ?? 0) + 1;
    console.log(`real issues: ${JSON.stringify(tally)}`);
    console.log(issues.filter((i) => i.kind === "subject_place" || i.kind === "subject_typo" || i.kind === "merged_unit").map((i) => i.message).join("\n"));
    void all;
  }

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
