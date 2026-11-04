// Fixing the curriculum: names typed wrong, and subjects, units or parts that landed in the wrong place. The four
// production teams correct lesson and part names; planners (and leads, if Admin allows it) move and merge. Every change
// is kept in a list and in the audit log. A name a person corrected is not overwritten by a later import. Item codes stay
// as they are, because other teams' files refer to them.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { can, canViewItem, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { cleanCameraCode, cleanName, editDistance, isPlaceholderTitle, stripDots } from "@/lib/curriculum-names";
import { STAGES, type Stage } from "@/lib/domain";

export type CurriculumConfig = { renameRoles: Stage[]; structure: "planners" | "leads" };
const DEFAULT: CurriculumConfig = { renameRoles: [...STAGES], structure: "planners" };

export async function curriculumConfig(): Promise<CurriculumConfig> {
  const v = parseJson<Partial<CurriculumConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.curriculum'"))?.value, {});
  return { ...DEFAULT, ...v };
}

export async function saveCurriculumConfig(user: AppUser, input: Partial<CurriculumConfig>) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes who fixes the curriculum.");
  const cur = await curriculumConfig();
  const next: CurriculumConfig = {
    renameRoles: Array.isArray(input.renameRoles) ? input.renameRoles.filter((r) => STAGES.includes(r)) : cur.renameRoles,
    structure: input.structure === "leads" || input.structure === "planners" ? input.structure : cur.structure,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.curriculum', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.curriculum", summary: `${user.name} changed who fixes the curriculum`, newValue: next });
}

const planner = (u: AppUser) => can(u, "items.plan") || can(u, "import.run") || can(u, "data.manage");

export async function curriculumRights(u: AppUser) {
  const cfg = await curriculumConfig();
  const structure = planner(u) || (cfg.structure === "leads" && u.leads.length > 0);
  return { structure, rename: structure || u.roles.some((r) => cfg.renameRoles.includes(r as Stage)) };
}

async function needRename(u: AppUser) {
  if (!(await curriculumRights(u)).rename) throw new WorkflowError("FORBIDDEN", "Your team does not correct curriculum names (Curriculum, Settings).");
}
async function needStructure(u: AppUser) {
  if (!(await curriculumRights(u)).structure) throw new WorkflowError("FORBIDDEN", "A planner moves and merges the curriculum. You can correct names.");
}

// People limited to some grades or subjects correct only those.
function inScope(u: AppUser, gradeId: string, subjectId: string) {
  if (!u.scopes.length || u.scopes.some((s) => !s.gradeId && !s.subjectId)) return true;
  return u.scopes.some((s) => (!s.gradeId || s.gradeId === gradeId) && (!s.subjectId || s.subjectId === subjectId));
}

async function log(u: AppUser | null, kind: string, entityId: string, summary: string, before: unknown, after: unknown) {
  await run(
    "INSERT INTO curriculum_changes (id, kind, entity_id, summary, before_value, after_value, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("cch_"),
    kind,
    entityId,
    summary,
    JSON.stringify(before ?? null),
    JSON.stringify(after ?? null),
    u?.id ?? null,
    nowIso(),
  );
  await audit({ actor: u }, { action: `curriculum.${kind}`, summary, oldValue: before, newValue: after });
}

export async function recentChanges(limit = 200) {
  return all<{ id: string; kind: string; summary: string; actor: string | null; created_at: string }>(
    "SELECT c.id, c.kind, c.summary, u.name AS actor, c.created_at FROM curriculum_changes c LEFT JOIN users u ON u.id = c.actor_id ORDER BY c.created_at DESC LIMIT ?",
    String(limit),
  );
}

const ETHIOPIC = /[ሀ-፿]/;
const tidy = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Names
// ---------------------------------------------------------------------------

export async function renamePart(user: AppUser, lessonId: string, title: string) {
  await needRename(user);
  const l = await get<{ title: string; number: number; grade_id: string; subject_id: string }>(
    "SELECT l.title, l.number, u.grade_id, u.subject_id FROM lessons l JOIN units u ON u.id = l.unit_id WHERE l.id = ?",
    lessonId,
  );
  if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
  if (!inScope(user, l.grade_id, l.subject_id)) throw new WorkflowError("FORBIDDEN", "This part is outside your grades and subjects.");
  const name = cleanName(tidy(title), "part");
  if (!name) throw new WorkflowError("VALIDATION", "Give the part a name.");
  if (name === l.title) return;
  await tx(async () => {
    const am = ETHIOPIC.test(name);
    await run("UPDATE lessons SET title = ?, title_am = ?, title_locked = 1 WHERE id = ?", name, am ? name : null, lessonId);
    // The work carries the part's name, unless someone gave that item its own.
    const items = await all<{ id: string; title: string }>("SELECT id, title FROM items WHERE lesson_id = ?", lessonId);
    for (const it of items)
      if (it.title === l.title || isPlaceholderTitle(it.title))
        await run("UPDATE items SET title = ?, title_am = ?, version = version + 1, updated_at = ? WHERE id = ?", name, am ? name : null, nowIso(), it.id);
    await log(user, "part_renamed", lessonId, `${user.name} renamed part ${l.number} "${l.title}" to "${name}"`, l.title, name);
  });
}

// From a work card or the item page.
export async function renameItem(user: AppUser, itemId: string, title: string) {
  await needRename(user);
  if (!(await canViewItem(user, itemId))) throw new WorkflowError("FORBIDDEN", "This part is outside your access.");
  const it = await get<{ lesson_id: string | null; title: string }>("SELECT lesson_id, title FROM items WHERE id = ?", itemId);
  if (!it) throw new WorkflowError("NOT_FOUND", "Part not found.");
  if (it.lesson_id) {
    await renamePart(user, it.lesson_id, title);
    const name = cleanName(tidy(title), "part");
    await run("UPDATE items SET title = ?, version = version + 1, updated_at = ? WHERE id = ? AND title <> ?", name, nowIso(), itemId, name);
    return;
  }
  const name = tidy(title);
  if (!name) throw new WorkflowError("VALIDATION", "Give the part a name.");
  await run("UPDATE items SET title = ?, version = version + 1, updated_at = ? WHERE id = ?", name, nowIso(), itemId);
  await log(user, "item_renamed", itemId, `${user.name} renamed "${it.title}" to "${name}"`, it.title, name);
}

export async function renameUnit(user: AppUser, unitId: string, title: string) {
  await needRename(user);
  const u = await get<{ title: string; number: number; grade_id: string; subject_id: string }>("SELECT title, number, grade_id, subject_id FROM units WHERE id = ?", unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  if (!inScope(user, u.grade_id, u.subject_id)) throw new WorkflowError("FORBIDDEN", "This unit is outside your grades and subjects.");
  const name = cleanName(tidy(title), "unit");
  if (!name) throw new WorkflowError("VALIDATION", "Give the unit a name.");
  if (name === u.title) return;
  await run("UPDATE units SET title = ?, title_am = ?, title_locked = 1 WHERE id = ?", name, ETHIOPIC.test(name) ? name : null, unitId);
  await log(user, "unit_renamed", unitId, `${user.name} renamed unit ${u.number} "${u.title}" to "${name}"`, u.title, name);
}

export async function renameSubject(user: AppUser, subjectId: string, name: string) {
  await needStructure(user);
  const s = await get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", subjectId);
  if (!s) throw new WorkflowError("NOT_FOUND", "Subject not found.");
  const next = tidy(name, 120);
  if (!next) throw new WorkflowError("VALIDATION", "Give the subject a name.");
  const clash = await get<{ id: string }>("SELECT id FROM subjects WHERE lower(name) = lower(?) AND id <> ? AND active = 1", next, subjectId);
  if (clash) throw new WorkflowError("VALIDATION", `A subject called "${next}" exists. Merge into it instead.`);
  await run("UPDATE subjects SET name = ? WHERE id = ?", next, subjectId);
  await log(user, "subject_renamed", subjectId, `${user.name} renamed the subject "${s.name}" to "${next}"`, s.name, next);
}

export async function renumber(user: AppUser, kind: "unit" | "part", id: string, number: number) {
  await needStructure(user);
  const n = Math.round(Number(number));
  if (!(n > 0)) throw new WorkflowError("VALIDATION", "Give a number above zero.");
  if (kind === "unit") {
    const u = await get<{ number: number; grade_id: string; subject_id: string; title: string }>("SELECT number, grade_id, subject_id, title FROM units WHERE id = ?", id);
    if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
    if (await get("SELECT 1 AS x FROM units WHERE grade_id = ? AND subject_id = ? AND number = ? AND id <> ?", u.grade_id, u.subject_id, String(n), id)) throw new WorkflowError("VALIDATION", `Unit ${n} already exists here.`);
    await run("UPDATE units SET number = ? WHERE id = ?", String(n), id);
    await log(user, "unit_renumbered", id, `${user.name} made "${u.title}" unit ${n} (was ${u.number})`, u.number, n);
  } else {
    const l = await get<{ number: number; unit_id: string; title: string }>("SELECT number, unit_id, title FROM lessons WHERE id = ?", id);
    if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
    if (await get("SELECT 1 AS x FROM lessons WHERE unit_id = ? AND number = ? AND id <> ?", l.unit_id, String(n), id)) throw new WorkflowError("VALIDATION", `Part ${n} already exists in this unit.`);
    await run("UPDATE lessons SET number = ? WHERE id = ?", String(n), id);
    await log(user, "part_renumbered", id, `${user.name} made "${l.title}" part ${n} (was ${l.number})`, l.number, n);
  }
}

// ---------------------------------------------------------------------------
// Moving and merging
// ---------------------------------------------------------------------------

async function moveMembership(itemId: string, fromG: string, fromS: string, toG: string, toS: string, unitId: string | null) {
  if (fromG === toG && fromS === toS) {
    await run("UPDATE item_memberships SET unit_id = ? WHERE item_id = ? AND grade_id = ? AND subject_id = ?", unitId, itemId, fromG, fromS);
    return;
  }
  const had = await get<{ is_primary: number }>("SELECT is_primary FROM item_memberships WHERE item_id = ? AND grade_id = ? AND subject_id = ?", itemId, fromG, fromS);
  if (!had) return;
  if (await get("SELECT 1 AS x FROM item_memberships WHERE item_id = ? AND grade_id = ? AND subject_id = ?", itemId, toG, toS)) {
    await run("DELETE FROM item_memberships WHERE item_id = ? AND grade_id = ? AND subject_id = ?", itemId, fromG, fromS);
    await run("UPDATE item_memberships SET unit_id = ?, is_primary = GREATEST(is_primary, ?) WHERE item_id = ? AND grade_id = ? AND subject_id = ?", unitId, String(had.is_primary), itemId, toG, toS);
  } else await run("UPDATE item_memberships SET grade_id = ?, subject_id = ?, unit_id = ? WHERE item_id = ? AND grade_id = ? AND subject_id = ?", toG, toS, unitId, itemId, fromG, fromS);
}

async function freeUnitNumber(gradeId: string, subjectId: string, wanted: number) {
  if (!(await get("SELECT 1 AS x FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", gradeId, subjectId, String(wanted)))) return wanted;
  return Number((await get<{ n: number }>("SELECT COALESCE(MAX(number), 0) AS n FROM units WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId))?.n ?? 0) + 1;
}

async function placeUnit(unitId: string, toG: string, toS: string) {
  const u = (await get<{ number: number; grade_id: string; subject_id: string }>("SELECT number, grade_id, subject_id FROM units WHERE id = ?", unitId))!;
  if (u.grade_id === toG && u.subject_id === toS) return;
  const number = await freeUnitNumber(toG, toS, Number(u.number));
  await run("UPDATE units SET grade_id = ?, subject_id = ?, number = ? WHERE id = ?", toG, toS, String(number), unitId);
  await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", toG, toS);
  const members = await all<{ item_id: string }>(
    "SELECT DISTINCT m.item_id FROM item_memberships m LEFT JOIN items i ON i.id = m.item_id LEFT JOIN lessons l ON l.id = i.lesson_id WHERE m.grade_id = ? AND m.subject_id = ? AND (m.unit_id = ? OR l.unit_id = ?)",
    u.grade_id,
    u.subject_id,
    unitId,
    unitId,
  );
  for (const m of members) await moveMembership(m.item_id, u.grade_id, u.subject_id, toG, toS, unitId);
  for (const t of ["studio_resources", "studio_questions"]) await run(`UPDATE ${t} SET grade_id = ?, subject_id = ? WHERE unit_id = ?`, toG, toS, unitId);
}

// A subject with nothing left in a grade leaves that grade; with nothing anywhere it is switched off (kept for history).
async function tidyAfterMove(gradeId: string, subjectId: string) {
  const left = await get("SELECT 1 AS x FROM units WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
  const members = await get("SELECT 1 AS x FROM item_memberships WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
  if (left || members) return;
  await run("DELETE FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
  if (!(await get("SELECT 1 AS x FROM grade_subjects WHERE subject_id = ?", subjectId))) await run("UPDATE subjects SET active = 0 WHERE id = ?", subjectId);
}

const nameOf = async (t: "grades" | "subjects", id: string) => (await get<{ name: string }>(`SELECT name FROM ${t} WHERE id = ?`, id))?.name ?? id;

// A subject imported under the wrong grade: everything in it goes to the right one.
export async function moveSubject(user: AppUser, input: { subjectId: string; fromGradeId: string; toGradeId: string }) {
  await needStructure(user);
  if (input.fromGradeId === input.toGradeId) throw new WorkflowError("VALIDATION", "Choose another grade.");
  const units = await all<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? ORDER BY number", input.fromGradeId, input.subjectId);
  await tx(async () => {
    for (const u of units) await placeUnit(u.id, input.toGradeId, input.subjectId);
    const rest = await all<{ item_id: string; unit_id: string | null }>("SELECT item_id, unit_id FROM item_memberships WHERE grade_id = ? AND subject_id = ?", input.fromGradeId, input.subjectId);
    for (const m of rest) await moveMembership(m.item_id, input.fromGradeId, input.subjectId, input.toGradeId, input.subjectId, m.unit_id);
    await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", input.toGradeId, input.subjectId);
    await tidyAfterMove(input.fromGradeId, input.subjectId);
    await log(user, "subject_moved", input.subjectId, `${user.name} moved ${await nameOf("subjects", input.subjectId)} from ${await nameOf("grades", input.fromGradeId)} to ${await nameOf("grades", input.toGradeId)} (${units.length} units)`, input.fromGradeId, input.toGradeId);
  });
  return { units: units.length };
}

// Two names for one subject: all its work goes under the other name, in one grade or everywhere.
export async function mergeSubject(user: AppUser, input: { fromId: string; toId: string; gradeId?: string | null }) {
  await needStructure(user);
  if (input.fromId === input.toId) throw new WorkflowError("VALIDATION", "Choose another subject.");
  const units = await all<{ id: string; grade_id: string }>(`SELECT id, grade_id FROM units WHERE subject_id = ?${input.gradeId ? " AND grade_id = ?" : ""} ORDER BY number`, input.fromId, ...(input.gradeId ? [input.gradeId] : []));
  const grades = input.gradeId ? [input.gradeId] : (await all<{ grade_id: string }>("SELECT grade_id FROM grade_subjects WHERE subject_id = ?", input.fromId)).map((g) => g.grade_id);
  await tx(async () => {
    for (const u of units) await placeUnit(u.id, u.grade_id, input.toId);
    for (const g of grades) {
      const rest = await all<{ item_id: string; unit_id: string | null }>("SELECT item_id, unit_id FROM item_memberships WHERE grade_id = ? AND subject_id = ?", g, input.fromId);
      for (const m of rest) await moveMembership(m.item_id, g, input.fromId, g, input.toId, m.unit_id);
      await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", g, input.toId);
      await tidyAfterMove(g, input.fromId);
    }
    await log(user, "subject_merged", input.fromId, `${user.name} merged ${await nameOf("subjects", input.fromId)} into ${await nameOf("subjects", input.toId)} (${units.length} units)`, input.fromId, input.toId);
  });
  return { units: units.length };
}

export async function moveUnit(user: AppUser, input: { unitId: string; gradeId: string; subjectId: string }) {
  await needStructure(user);
  const u = await get<{ grade_id: string; subject_id: string; title: string }>("SELECT grade_id, subject_id, title FROM units WHERE id = ?", input.unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  await tx(async () => {
    await placeUnit(input.unitId, input.gradeId, input.subjectId);
    await tidyAfterMove(u.grade_id, u.subject_id);
    await log(user, "unit_moved", input.unitId, `${user.name} moved the unit "${u.title}" to ${await nameOf("grades", input.gradeId)}, ${await nameOf("subjects", input.subjectId)}`, u, input);
  });
}

export async function movePart(user: AppUser, input: { lessonId: string; unitId: string }) {
  await needStructure(user);
  const l = await get<{ unit_id: string; number: number; title: string; grade_id: string; subject_id: string }>(
    "SELECT l.unit_id, l.number, l.title, u.grade_id, u.subject_id FROM lessons l JOIN units u ON u.id = l.unit_id WHERE l.id = ?",
    input.lessonId,
  );
  const to = await get<{ grade_id: string; subject_id: string; title: string }>("SELECT grade_id, subject_id, title FROM units WHERE id = ?", input.unitId);
  if (!l || !to) throw new WorkflowError("NOT_FOUND", "Part or unit not found.");
  await tx(async () => {
    const taken = await get("SELECT 1 AS x FROM lessons WHERE unit_id = ? AND number = ?", input.unitId, String(l.number));
    const number = taken ? Number((await get<{ n: number }>("SELECT COALESCE(MAX(number), 0) AS n FROM lessons WHERE unit_id = ?", input.unitId))?.n ?? 0) + 1 : Number(l.number);
    await run("UPDATE lessons SET unit_id = ?, number = ? WHERE id = ?", input.unitId, String(number), input.lessonId);
    const items = await all<{ id: string }>("SELECT id FROM items WHERE lesson_id = ?", input.lessonId);
    for (const it of items) await moveMembership(it.id, l.grade_id, l.subject_id, to.grade_id, to.subject_id, input.unitId);
    await log(user, "part_moved", input.lessonId, `${user.name} moved the part "${l.title}" to the unit "${to.title}"`, l.unit_id, input.unitId);
  });
}

// ---------------------------------------------------------------------------
// Browsing
// ---------------------------------------------------------------------------

export async function curriculumIndex() {
  const grades = await all<{ id: string; name: string; level: string | null }>("SELECT id, name, level FROM grades WHERE active = 1 ORDER BY sort");
  const subjects = await all<{ id: string; name: string; code: string }>("SELECT id, name, code FROM subjects WHERE active = 1 ORDER BY sort, name");
  const offered = await all<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM grade_subjects");
  return { grades, subjects, offered };
}

export type CurriculumUnit = { id: string; number: number; title: string; parts: { id: string; number: number; title: string; itemId: string | null; itemCode: string | null; videoTitle: string | null }[] };

export async function subjectUnits(gradeId: string, subjectId: string): Promise<CurriculumUnit[]> {
  const units = await all<{ id: string; number: number; title: string }>("SELECT id, number, title FROM units WHERE grade_id = ? AND subject_id = ? ORDER BY number", gradeId, subjectId);
  if (!units.length) return [];
  const parts = await all<{ id: string; unit_id: string; number: number; title: string; item_id: string | null; item_code: string | null; label: string | null }>(
    `SELECT l.id, l.unit_id, l.number, l.title, i.id AS item_id, i.code AS item_code,
        (SELECT a.label FROM assets a WHERE a.item_id = i.id AND a.kind = 'raw' AND a.status = 'current' AND a.label IS NOT NULL ORDER BY a.created_at LIMIT 1) AS label
     FROM lessons l LEFT JOIN items i ON i.lesson_id = l.id AND i.revision_of_id IS NULL
     WHERE l.unit_id IN (${placeholders(units.length)}) ORDER BY l.number`,
    ...units.map((u) => u.id),
  );
  return units.map((u) => ({
    ...u,
    number: Number(u.number),
    parts: parts.filter((p) => p.unit_id === u.id).map((p) => ({ id: p.id, number: Number(p.number), title: p.title, itemId: p.item_id, itemCode: p.item_code, videoTitle: p.label })),
  }));
}

// ---------------------------------------------------------------------------
// Finding what looks wrong
// ---------------------------------------------------------------------------

export type IssueKind = "subject_typo" | "subject_place" | "merged_unit" | "unit_name" | "part_name" | "camera_code";
export type Issue = { id: string; kind: IssueKind; entityId: string; where: string; gradeId: string | null; subjectId: string | null; current: string; suggestion: string | null; message: string };

export async function findIssues(): Promise<Issue[]> {
  const out: Issue[] = [];
  const { grades, subjects, offered } = await curriculumIndex();
  const gradeName = new Map(grades.map((g) => [g.id, g.name]));

  // Two subjects whose names differ by a slip.
  const count = await all<{ subject_id: string; n: number }>("SELECT subject_id, COUNT(*) AS n FROM units GROUP BY subject_id");
  const size = (id: string) => Number(count.find((c) => c.subject_id === id)?.n ?? 0);
  for (const a of subjects)
    for (const b of subjects) {
      if (a.id === b.id) continue;
      const [x, y] = [a.name.toLowerCase(), b.name.toLowerCase()];
      if (x.length < 5 || editDistance(x, y) > 2 || size(a.id) > size(b.id) || (size(a.id) === size(b.id) && a.id > b.id)) continue;
      out.push({ id: `subject_typo:${a.id}:${b.id}`, kind: "subject_typo", entityId: a.id, where: "Subject", gradeId: null, subjectId: a.id, current: a.name, suggestion: b.name, message: `"${a.name}" looks like a slip of "${b.name}". Merge them.` });
    }

  // A subject found in one grade of a school level, though it normally belongs to another level.
  const levels = new Map(grades.map((g) => [g.id, g.level]));
  for (const s of subjects) {
    const where = offered.filter((o) => o.subject_id === s.id).map((o) => o.grade_id);
    const byLevel = new Map<string, string[]>();
    for (const g of where) byLevel.set(levels.get(g) ?? "", [...(byLevel.get(levels.get(g) ?? "") ?? []), g]);
    if (byLevel.size < 2) continue;
    for (const [, gs] of byLevel) {
      const others = where.length - gs.length;
      if (gs.length === 1 && others >= 2)
        out.push({ id: `subject_place:${s.id}:${gs[0]}`, kind: "subject_place", entityId: s.id, where: `${gradeName.get(gs[0]!)}, ${s.name}`, gradeId: gs[0]!, subjectId: s.id, current: s.name, suggestion: null, message: `${s.name} is in ${gradeName.get(gs[0]!)} but otherwise only in other school levels. It may be imported to the wrong grade.` });
    }
  }

  const units = await all<{ id: string; number: number; title: string; grade_id: string; subject_id: string; grade: string; subject: string }>(
    "SELECT u.id, u.number, u.title, u.grade_id, u.subject_id, g.name AS grade, s.name AS subject FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id ORDER BY g.sort, s.sort, u.number",
  );
  for (const u of units) {
    const where = `${u.grade}, ${u.subject}, Unit ${u.number}`;
    const merged = /^(.*\S)\s+Unit\s*(\d+)\s*[:.\-–]\s*(.+)$/i.exec(u.title);
    if (merged) out.push({ id: `merged_unit:${u.id}`, kind: "merged_unit", entityId: u.id, where, gradeId: u.grade_id, subjectId: u.subject_id, current: u.title, suggestion: `${merged[1]} | Unit ${merged[2]}: ${merged[3]}`, message: "Two units were typed as one. Split them." });
    else if (isPlaceholderTitle(u.title)) out.push({ id: `unit_name:${u.id}`, kind: "unit_name", entityId: u.id, where, gradeId: u.grade_id, subjectId: u.subject_id, current: u.title, suggestion: null, message: "This unit has no real name." });
  }

  const parts = await all<{ id: string; number: number; title: string; unit_number: number; grade_id: string; subject_id: string; grade: string; subject: string; label: string | null }>(
    `SELECT l.id, l.number, l.title, u.number AS unit_number, u.grade_id, u.subject_id, g.name AS grade, s.name AS subject,
        (SELECT a.label FROM items i JOIN assets a ON a.item_id = i.id WHERE i.lesson_id = l.id AND a.kind = 'raw' AND a.status = 'current' AND a.label IS NOT NULL ORDER BY a.created_at LIMIT 1) AS label
     FROM lessons l JOIN units u ON u.id = l.unit_id JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
     ORDER BY g.sort, s.sort, u.number, l.number`,
  );
  for (const p of parts) {
    if (!isPlaceholderTitle(p.title)) continue;
    const from = p.label && !isPlaceholderTitle(p.label) ? stripDots(p.label) : null;
    out.push({ id: `part_name:${p.id}`, kind: "part_name", entityId: p.id, where: `${p.grade}, ${p.subject}, Unit ${p.unit_number}, Part ${p.number}`, gradeId: p.grade_id, subjectId: p.subject_id, current: p.title, suggestion: from, message: from ? "No real name, but its video has one." : "This part has no real name." });
  }

  const codes = await all<{ id: string; camera_code: string; code: string; grade_id: string | null; subject_id: string | null }>(
    "SELECT a.id, a.camera_code, i.code, m.grade_id, m.subject_id FROM assets a JOIN items i ON i.id = a.item_id LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 WHERE a.kind = 'raw' AND a.status = 'current' AND a.camera_code IS NOT NULL",
  );
  for (const c of codes) {
    const clean = cleanCameraCode(c.camera_code);
    if (clean.code && clean.code !== c.camera_code)
      out.push({ id: `camera_code:${c.id}`, kind: "camera_code", entityId: c.id, where: c.code, gradeId: c.grade_id, subjectId: c.subject_id, current: c.camera_code, suggestion: clean.code, message: "This camera code can be tidied." });
  }
  return out;
}

// Applies one finding: its suggestion, or the name the person typed.
export async function applyIssue(user: AppUser, id: string, typed?: string | null) {
  const [kind, a, b] = id.split(":") as [IssueKind, string, string | undefined];
  const name = typed?.trim() || null;
  switch (kind) {
    case "part_name": {
      const issue = name ? null : (await findIssues()).find((i) => i.id === id);
      const title = name ?? issue?.suggestion;
      if (!title) throw new WorkflowError("VALIDATION", "Type the part's name.");
      return renamePart(user, a, title);
    }
    case "unit_name":
      if (!name) throw new WorkflowError("VALIDATION", "Type the unit's name.");
      return renameUnit(user, a, name);
    case "subject_typo":
      await mergeSubject(user, { fromId: a, toId: b! });
      return;
    case "merged_unit":
      return splitUnit(user, a);
    case "camera_code": {
      await needRename(user);
      const asset = await get<{ camera_code: string; notes: string | null }>("SELECT camera_code, notes FROM assets WHERE id = ?", a);
      if (!asset) throw new WorkflowError("NOT_FOUND", "Recording not found.");
      const c = cleanCameraCode(name ?? asset.camera_code);
      await run("UPDATE assets SET camera_code = ?, notes = ? WHERE id = ?", c.code, [asset.notes, c.note].filter(Boolean).join(". ") || null, a);
      await log(user, "camera_code", a, `${user.name} corrected the camera code "${asset.camera_code}" to "${c.code}"`, asset.camera_code, c.code);
      return;
    }
    default:
      throw new WorkflowError("VALIDATION", "Move this one by hand, on Browse and edit.");
  }
}

// "Unit 9: A Unit 10: B" becomes two units. The parts stay on the first.
export async function splitUnit(user: AppUser, unitId: string) {
  await needStructure(user);
  const u = await get<{ number: number; title: string; grade_id: string; subject_id: string; curriculum_id: string | null }>("SELECT number, title, grade_id, subject_id, curriculum_id FROM units WHERE id = ?", unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  const m = /^(.*\S)\s+Unit\s*(\d+)\s*[:.\-–]\s*(.+)$/i.exec(u.title);
  if (!m) throw new WorkflowError("VALIDATION", "This unit is not two units in one.");
  const number = await freeUnitNumber(u.grade_id, u.subject_id, Number(m[2]));
  await tx(async () => {
    await run("UPDATE units SET title = ?, title_locked = 1 WHERE id = ?", m[1]!, unitId);
    await run("INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_locked) VALUES (?, ?, ?, ?, ?, ?, 1)", uid("unt_"), u.curriculum_id, u.grade_id, u.subject_id, String(number), m[3]!);
    await log(user, "unit_split", unitId, `${user.name} split "${u.title}" into "${m[1]}" and "${m[3]}"`, u.title, [m[1], m[3]]);
  });
}

// Every finding that has a ready suggestion (the ones a person need not type).
export async function applyAllSuggestions(user: AppUser, kinds: IssueKind[]) {
  const issues = (await findIssues()).filter((i) => kinds.includes(i.kind) && (i.suggestion || i.kind === "merged_unit"));
  const failed: string[] = [];
  let done = 0;
  for (const i of issues.slice(0, 2000)) {
    try {
      if (i.kind === "part_name") await renamePart(user, i.entityId, i.suggestion!);
      else await applyIssue(user, i.id);
      done++;
    } catch (e) {
      failed.push(`${i.where}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { done, failed };
}
