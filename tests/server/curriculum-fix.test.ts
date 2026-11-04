// Phase 32: fixing names and subjects imported to the wrong place, the four teams correcting names, auto-assign.
process.env.MAIL_FAKE = "1";
import { closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as wf from "../../src/server/workflow";
import * as cf from "../../src/server/curriculum-fix";
import * as aa from "../../src/server/auto-assign";
import { importCurriculumBackup, upsertAccount } from "../../src/server/workspace-data";
import { cleanCameraCode, cleanName, isPlaceholderTitle, tidyBackup } from "../../src/lib/curriculum-names";

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

// A small backup with the problems the real one has.
const BACKUP = {
  "grade-7": {
    name: "Grade 7",
    type: "Middle School",
    subjects: [
      { id: "fx-sci", name: "General Science", units: [{ id: "fx-u1", title: "Unit 1: Matter", parts: [{ id: "fx-p1", title: "Part 1: Topic Name", videos: [{ id: "fx-v1", cameraCode: "c0021 and CO173", title: "Atoms and molecules ....", description: "" }] }, { id: "fx-p2", title: "Part 2:", videos: [] }] }] },
      { id: "fx-slip", name: "General Sciense", units: [{ id: "fx-u6", title: "Unit 1: Living things", parts: [{ id: "fx-p6", title: "Part 1: Cells", videos: [] }] }] },
      { id: "fx-chem", name: "Chemistry", units: [{ id: "fx-u2", title: "Unit 1: Overview & Fundamentals", parts: [{ id: "fx-p3", title: "Part 1: Key Concepts", videos: [{ id: "fx-v3", cameraCode: "0Z4A1816", title: "To be determined", description: "" }] }] }] },
    ],
  },
  "grade-9": {
    name: "Grade 9",
    type: "Secondary School",
    subjects: [{ id: "fx-chem9", name: "Chemistry", units: [{ id: "fx-u3", title: "Unit 1: Importance", parts: [] }, { id: "fx-u5", title: "Unit 9: Multilingualism Unit 10: Digital Vs Satellite Television", parts: [] }] }],
  },
  "grade-10": {
    name: "Grade 10",
    type: "Secondary School",
    subjects: [{ id: "fx-chem10", name: "Chemistry", units: [{ id: "fx-u4", title: "Unit 1: Reactions", parts: [] }] }],
  },
};

async function main() {
  // Pure helpers.
  check("placeholders", isPlaceholderTitle("Topic Name") && isPlaceholderTitle("Part 3:") && isPlaceholderTitle("To be determined") && isPlaceholderTitle("<empty>") && !isPlaceholderTitle("Simple Present"));
  check("clean names", cleanName("Part 3: Forces", "part") === "Forces" && cleanName("Unit 2: Plants", "unit") === "Plants" && cleanName("Unity is Strength", "unit") === "Unity is Strength");
  check("camera codes", cleanCameraCode("c0172 & CO173 & C0174").code === "C0172 & C0173 & C0174" && cleanCameraCode("00003 AND 00004").code === "00003 & 00004");
  const rep = cleanCameraCode("C0106 REPEATED");
  check("a word after a code becomes a note", rep.code === "C0106" && rep.note === "Repeated", rep);
  const take = cleanCameraCode("C0359 & TAKE THIS ONE");
  check("and the code stays", take.code === "C0359" && /take this one/i.test(take.note ?? ""), take);
  check("a code that is not one is flagged, not changed", cleanCameraCode("PART 2").doubtful && cleanCameraCode("PART 2").code === "PART 2" && cleanCameraCode("UNKNOWN").code === "UNKNOWN" && !cleanCameraCode("UNKNOWN").doubtful, cleanCameraCode("PART 2"));
  const t = tidyBackup({ g: { name: "G", subjects: [{ name: "S", units: [{ id: "a", title: "Unit 4: Ancient Civilizations and Medieva", parts: [] }, { id: "b", title: "l Unit 5: Ancient History of Africa", parts: [{ id: "p", title: "Part 1:", videos: [{ id: "v", cameraCode: "C0001", title: "Bacteria", description: "" }] }] }, { id: "c", title: "Unit 9: A Unit 10: B", parts: [] }] }] } });
  const us = t.data.g!.subjects[0]!.units;
  check("tidy: the stray letter goes back", us[0]!.title.endsWith("Medieval") && us[1]!.title === "Unit 5: Ancient History of Africa", us.map((u) => u.title));
  check("tidy: a part named from its video", us[1]!.parts[0]!.title === "Part 1: Bacteria", us[1]!.parts);
  check("tidy: two units in one are split", us.length === 4 && us[2]!.title === "Unit 9: A" && us[3]!.title === "Unit 10: B", us.map((u) => u.title));
  check("tidy lists what it did", t.fixes.length >= 3, t.fixes);

  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  await upsertAccount({ name: "Other Person", email: "other@fix.local", title: "HR", roles: ["hr_manager"], password: "Fix-2026-Other!", mustChangePassword: false } as never);
  const other = await by("other@fix.local");
  await importCurriculumBackup(BACKUP as never, { actorId: admin.id, createItems: true, markRecorded: false });
  const g = async (code: string) => (await get<{ id: string }>("SELECT id FROM grades WHERE code = ?", code))!.id;
  const [g7, g9] = [await g("G07"), await g("G09")];

  check("a member of a team corrects names, but does not move", (await cf.curriculumRights(dawit)).rename && !(await cf.curriculumRights(dawit)).structure);
  check("someone outside the teams does neither", !(await cf.curriculumRights(other)).rename);

  // Findings.
  let issues = await cf.findIssues();
  const of = (k: string) => issues.filter((i) => i.kind === k);
  const part1 = (await get<{ id: string }>("SELECT id FROM lessons WHERE source_ref = 'fx-p1'"))!.id;
  const named = of("part_name").find((i) => i.entityId === part1);
  check("a placeholder part is found, with a name from its video", named?.suggestion === "Atoms and molecules", named);
  const slip = (await get<{ id: string }>("SELECT id FROM subjects WHERE name = 'General Sciense'"))!;
  const chem = (await get<{ id: string }>("SELECT id FROM subjects WHERE name = 'Chemistry'"))!;
  const sci = (await get<{ id: string }>("SELECT id FROM subjects WHERE name = 'General Science'"))!.id;
  check("a slip in a subject name is found", of("subject_typo").some((i) => i.entityId === slip.id && i.suggestion === "General Science"), of("subject_typo"));
  check("a subject in the wrong school level is found", of("subject_place").some((i) => i.entityId === chem.id && i.gradeId === g7), of("subject_place"));
  check("two units in one are found", of("merged_unit").length >= 1, of("merged_unit"));
  check("a unit with a placeholder name is found", of("unit_name").some((i) => i.current === "Overview & Fundamentals"), of("unit_name"));
  check("a messy camera code is found", of("camera_code").some((i) => i.current.includes("CO173") && i.suggestion === "C0021 & C0173"), of("camera_code"));

  // Renaming from the team.
  check("outside the teams cannot rename", await rejects(() => cf.renamePart(other, part1, "Nope"), /does not correct/));
  await cf.applyIssue(dawit, `part_name:${part1}`);
  const item = await get<{ id: string; title: string }>("SELECT id, title FROM items WHERE lesson_id = ?", part1);
  check("the suggested name is used, on the part and its work", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", part1))?.title === "Atoms and molecules" && item?.title === "Atoms and molecules", item);
  await cf.renameItem(dawit, item!.id, "Part 1: Atoms");
  check("renaming from the card changes the part too", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", part1))?.title === "Atoms" && (await get<{ title: string }>("SELECT title FROM items WHERE id = ?", item!.id))?.title === "Atoms");
  await importCurriculumBackup(BACKUP as never, { actorId: admin.id, createItems: true, markRecorded: false });
  check("importing again keeps a corrected name", (await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", part1))?.title === "Atoms");
  check("a member cannot move or merge", await rejects(() => cf.moveSubject(dawit, { subjectId: chem.id, fromGradeId: g7, toGradeId: g9 }), /planner/));

  // A subject imported to the wrong grade.
  const moved = await cf.moveSubject(admin, { subjectId: chem.id, fromGradeId: g7, toGradeId: g9 });
  const movedUnit = await get<{ grade_id: string; number: number }>("SELECT grade_id, number FROM units WHERE source_ref = 'fx-u2'");
  check("moving a subject moves its units, onto a free number", moved.units === 1 && movedUnit?.grade_id === g9 && Number(movedUnit.number) !== 1, movedUnit);
  const movedItem = await get<{ grade_id: string; subject_id: string }>("SELECT m.grade_id, m.subject_id FROM item_memberships m JOIN items i ON i.id = m.item_id JOIN lessons l ON l.id = i.lesson_id WHERE l.source_ref = 'fx-p3' AND m.is_primary = 1");
  check("and its work", movedItem?.grade_id === g9, movedItem);
  check("the old grade no longer offers it", !(await get("SELECT 1 AS x FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", g7, chem.id)));

  // Two names for one subject.
  await cf.applyIssue(admin, `subject_typo:${slip.id}:${sci}`);
  const after = await get<{ subject_id: string; number: number }>("SELECT subject_id, number FROM units WHERE source_ref = 'fx-u6'");
  check("merging puts the units under the other name, on a free number", after?.subject_id === sci && Number(after.number) !== 1, after);
  check("the merged work follows", (await get<{ subject_id: string }>("SELECT m.subject_id FROM item_memberships m JOIN items i ON i.id = m.item_id JOIN lessons l ON l.id = i.lesson_id WHERE l.source_ref = 'fx-p6' AND m.is_primary = 1"))?.subject_id === sci);
  check("the wrong name is switched off", (await get<{ active: number }>("SELECT active FROM subjects WHERE id = ?", slip.id))?.active === 0);

  // Split, move a unit, move a part.
  const merged = (await cf.findIssues()).find((i) => i.kind === "merged_unit" && i.current.includes("Multilingualism"))!;
  await cf.applyIssue(admin, merged.id);
  check("splitting makes two units", !!(await get("SELECT 1 AS x FROM units WHERE title = 'Digital Vs Satellite Television'")) && !!(await get("SELECT 1 AS x FROM units WHERE title = 'Multilingualism' AND number = 9")));
  const part3 = (await get<{ id: string }>("SELECT id FROM lessons WHERE source_ref = 'fx-p3'"))!.id;
  const u1 = (await get<{ id: string }>("SELECT id FROM units WHERE source_ref = 'fx-u1'"))!.id;
  await cf.movePart(admin, { lessonId: part3, unitId: u1 });
  const p3 = await get<{ unit_id: string; number: number }>("SELECT unit_id, number FROM lessons WHERE id = ?", part3);
  check("a part moves to another unit, on a free number", p3?.unit_id === u1 && Number(p3.number) === 3, p3);
  check("its work is placed there", (await get<{ subject_id: string; unit_id: string }>("SELECT m.subject_id, m.unit_id FROM item_memberships m JOIN items i ON i.id = m.item_id WHERE i.lesson_id = ? AND m.is_primary = 1", part3))?.unit_id === u1);
  await cf.moveUnit(admin, { unitId: u1, gradeId: g9, subjectId: sci });
  check("a unit moves to another grade", (await get<{ grade_id: string }>("SELECT grade_id FROM units WHERE id = ?", u1))?.grade_id === g9);
  await cf.renumber(admin, "part", part1, 7);
  check("renumbering works", Number((await get<{ number: number }>("SELECT number FROM lessons WHERE id = ?", part1))?.number) === 7);
  check("a taken number is refused", await rejects(() => cf.renumber(admin, "part", part3, 7), /already exists/));
  await cf.applyAllSuggestions(admin, ["camera_code"]);
  check("codes are tidied in one go", !!(await get("SELECT 1 AS x FROM assets WHERE camera_code = 'C0021 & C0173'")));
  check("every change is kept", (await cf.recentChanges()).length >= 8);

  // Who may fix: Admin's setting.
  await cf.saveCurriculumConfig(admin, { renameRoles: ["editing"], structure: "leads" });
  check("Admin can take renaming away from a team", !(await cf.curriculumRights(dawit)).rename);
  const hana = await by("hana@demo.local");
  check("and let leads move things", (await cf.curriculumRights(hana)).structure);
  await cf.saveCurriculumConfig(admin, { renameRoles: ["recording", "editing", "uploading", "publication"], structure: "planners" });

  // Auto-assign.
  const yonas = await by("yonas@demo.local");
  const meron = await by("meron@demo.local");
  const stageItem = async (title: string, gradeId: string, subjectId: string) => {
    const it = await wf.createItem({ actor: null, source: "seed" }, { gradeId, subjectId, title });
    return it.id;
  };
  check("off by default: nobody is named", (await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", await stageItem("Off", g9, sci)))?.user_id == null);
  check("a member cannot set it", await rejects(() => aa.saveAutoAssign(dawit, "recording", { mode: "least_loaded", people: [], rules: [] }), /lead or a planner/));
  await aa.saveAutoAssign(hana, "recording", { mode: "rules", people: [], rules: [{ gradeId: g9, subjectId: sci, userId: dawit.id }] });
  const ruled = await stageItem("Ruled", g9, sci);
  check("a rule names the person for a new part", (await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", ruled))?.user_id === dawit.id);
  check("no rule matches: nobody", (await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", await stageItem("Unruled", g7, sci)))?.user_id == null);
  await aa.saveAutoAssign(hana, "recording", { mode: "round_robin", people: [hana.id, dawit.id], rules: [] });
  const [r1, r2, r3] = [await stageItem("R1", g9, sci), await stageItem("R2", g9, sci), await stageItem("R3", g9, sci)];
  const who = async (id: string) => (await get<{ user_id: string }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", id))?.user_id;
  check("in turn", (await who(r1)) !== (await who(r2)) && (await who(r1)) === (await who(r3)), [await who(r1), await who(r2), await who(r3)]);
  await aa.saveAutoAssign(hana, "recording", { mode: "off", people: [], rules: [] });
  await aa.saveAutoAssign(meron, "editing", { mode: "least_loaded", people: [yonas.id], rules: [] });
  const sys = { actor: null, source: "bulk" as const, silent: true };
  await wf.releaseToProduction(sys, r1);
  await wf.addAsset(sys, r1, { kind: "raw", cameraCode: "C0001", url: "https://drive.example.com/raw" });
  for (const c of (await wf.evaluateRequirements(r1)).filter((x) => !x.met && x.key.startsWith("check:"))) await wf.setChecklist(sys, r1, c.key.slice(6), true).catch(() => {});
  await wf.setDurations(sys, r1, { rawDurationMin: 10 }).catch(() => {});
  await run("UPDATE stage_attempts SET status = 'ready' WHERE item_id = ? AND stage = 'recording'", r1);
  await wf.submitHandoff(sys, r1, {});
  await wf.acceptHandoff(sys, r1, {});
  check("work reaching the next team goes to the person set", (await wf.currentAttempt(r1))?.owner_id === yonas.id, await wf.currentAttempt(r1));
  await aa.saveAutoAssign(hana, "recording", { mode: "rules", people: [], rules: [{ gradeId: null, subjectId: sci, userId: dawit.id }] });
  const waiting = await wf.createItem({ actor: null, source: "seed" }, { gradeId: g9, subjectId: sci, title: "Waiting", owners: { recording: null } });
  await run("UPDATE stage_assignments SET user_id = NULL WHERE item_id = ? AND stage = 'recording'", waiting.id);
  const ran = await aa.runAutoAssign(hana, "recording");
  check("waiting parts can be assigned in one go", ran.assigned >= 1 && (await who(waiting.id)) === dawit.id, ran);
  await aa.saveAutoAssign(hana, "recording", { mode: "off", people: [], rules: [] });
  await aa.saveAutoAssign(meron, "editing", { mode: "off", people: [], rules: [] });
  void nowIso;

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
