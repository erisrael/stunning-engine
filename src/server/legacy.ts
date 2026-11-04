// The Legacy catalog: the way the Recording team kept its recordings before this app (Grade, Subject, Unit, Part, then
// video shots by camera code), in the same order and with the same steps. It has no data of its own: a subject, unit or
// part added here is the real one, and a video shot is a real recording on that part's work. So what they log the old
// way is in the system at once, cleaned up, and every other page sees it.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { can, hasRole, isLeadOf, isManager, scopeAllowsGradeSubject, type AppUser } from "./users";
import { getSettings } from "./settings";
import * as wf from "./workflow";
import { audit, WorkflowError, type Ctx } from "./workflow";
import { renamePart } from "./curriculum-fix";
import { exportTrackerBackup, importCurriculumBackup, isCurriculumBackup, subjectCode, type CurriculumBackup } from "./workspace-data";
import { cleanCameraCode, cleanName, editDistance, isPlaceholderTitle, stripDots, tidyBackup } from "@/lib/curriculum-names";
import { STAGE_LABELS, type Stage } from "@/lib/domain";

export type LegacyConfig = {
  on: boolean;
  // After a video shot is logged: the part waits for Mark recorded, or goes to Editing's incoming at once.
  afterVideo: "stay" | "recorded";
  // A part with no real name takes the video's title.
  nameFromVideo: boolean;
  // Importing an old backup: parts with videos count as recorded and move on to Editing.
  importAsRecorded: boolean;
};
const DEFAULT: LegacyConfig = { on: true, afterVideo: "stay", nameFromVideo: true, importAsRecorded: true };

export async function legacyConfig(): Promise<LegacyConfig> {
  const v = parseJson<Partial<LegacyConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy'"))?.value, {});
  return { ...DEFAULT, ...v };
}

export async function saveLegacyConfig(user: AppUser, input: Partial<LegacyConfig>) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the Legacy catalog.");
  const cur = await legacyConfig();
  const next: LegacyConfig = { on: input.on ?? cur.on, afterVideo: input.afterVideo === "recorded" || input.afterVideo === "stay" ? input.afterVideo : cur.afterVideo, nameFromVideo: input.nameFromVideo ?? cur.nameFromVideo, importAsRecorded: input.importAsRecorded ?? cur.importAsRecorded };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.legacy", summary: `${user.name} changed the Legacy catalog settings`, newValue: next });
}

const planner = (u: AppUser) => can(u, "items.plan") || can(u, "import.run") || can(u, "data.manage") || isManager(u);
export const canUseLegacy = (u: AppUser) => planner(u) || hasRole(u, "recording");
export const canImportLegacy = (u: AppUser) => planner(u) || can(u, "import.tracker") || isLeadOf(u, "recording");
// Removing subjects, units and parts is the lead's, as it can take work with it.
const canRemove = (u: AppUser) => planner(u) || isLeadOf(u, "recording");

const need = (u: AppUser) => {
  if (!canUseLegacy(u)) throw new WorkflowError("FORBIDDEN", "The Legacy catalog is for the Recording team.");
};
const needRemove = (u: AppUser) => {
  if (!canRemove(u)) throw new WorkflowError("FORBIDDEN", "Only the Recording lead or a planner removes these.");
};
const SYS: Ctx = { actor: null, source: "bulk", silent: true };
const ETHIOPIC = /[ሀ-፿]/;
const tidy = (s: unknown, max = 200) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function logged(u: AppUser, kind: string, summary: string, itemId?: string | null) {
  await audit({ actor: u }, { itemId: itemId ?? undefined, stage: "recording", action: `legacy.${kind}`, summary });
}

// ---------------------------------------------------------------------------
// Reading, level by level
// ---------------------------------------------------------------------------

export async function legacyStats() {
  const [videos, units] = await Promise.all([
    get<{ n: number }>("SELECT COUNT(*) AS n FROM assets a JOIN items i ON i.id = a.item_id WHERE a.kind = 'raw' AND a.status = 'current' AND i.lifecycle NOT IN ('archived','cancelled')"),
    get<{ n: number }>("SELECT COUNT(*) AS n FROM units"),
  ]);
  return { videos: Number(videos?.n ?? 0), units: Number(units?.n ?? 0) };
}

const VIDEOS_BY = (key: string) => `SELECT u.${key} AS k, COUNT(*) AS n FROM assets a JOIN items i ON i.id = a.item_id JOIN lessons l ON l.id = i.lesson_id JOIN units u ON u.id = l.unit_id
  WHERE a.kind = 'raw' AND a.status = 'current' AND i.lifecycle NOT IN ('archived','cancelled')`;

export async function legacyGrades(user: AppUser) {
  const grades = await all<{ id: string; name: string; level: string | null }>("SELECT id, name, level FROM grades WHERE active = 1 ORDER BY sort");
  const offered = await all<{ grade_id: string; subject_id: string }>("SELECT gs.grade_id, gs.subject_id FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id WHERE s.active = 1");
  const vids = await all<{ k: string; n: number }>(`${VIDEOS_BY("grade_id")} GROUP BY u.grade_id`);
  return grades
    .filter((g) => !user.scopes.length || offered.some((o) => o.grade_id === g.id && scopeAllowsGradeSubject(user, g.id, o.subject_id)))
    .map((g) => ({ ...g, subjects: offered.filter((o) => o.grade_id === g.id).length, videos: Number(vids.find((v) => v.k === g.id)?.n ?? 0) }));
}

export async function legacySubjects(user: AppUser, gradeId: string) {
  const rows = await all<{ id: string; name: string; units: number }>(
    "SELECT s.id, s.name, (SELECT COUNT(*) FROM units u WHERE u.grade_id = gs.grade_id AND u.subject_id = s.id) AS units FROM grade_subjects gs JOIN subjects s ON s.id = gs.subject_id WHERE gs.grade_id = ? AND s.active = 1 ORDER BY s.sort, s.name",
    gradeId,
  );
  const vids = await all<{ k: string; n: number }>(`${VIDEOS_BY("subject_id")} AND u.grade_id = ? GROUP BY u.subject_id`, gradeId);
  return rows.filter((s) => scopeAllowsGradeSubject(user, gradeId, s.id)).map((s) => ({ ...s, units: Number(s.units), videos: Number(vids.find((v) => v.k === s.id)?.n ?? 0) }));
}

export async function legacyUnits(gradeId: string, subjectId: string) {
  const units = await all<{ id: string; number: number; title: string; parts: number }>("SELECT u.id, u.number, u.title, (SELECT COUNT(*) FROM lessons l WHERE l.unit_id = u.id) AS parts FROM units u WHERE u.grade_id = ? AND u.subject_id = ? ORDER BY u.number", gradeId, subjectId);
  const vids = await all<{ k: string; n: number }>(`${VIDEOS_BY("id")} AND u.grade_id = ? AND u.subject_id = ? GROUP BY u.id`, gradeId, subjectId);
  return units.map((u) => ({ ...u, number: Number(u.number), parts: Number(u.parts), videos: Number(vids.find((v) => v.k === u.id)?.n ?? 0) }));
}

export type LegacyVideo = { id: string; cameraCode: string; title: string; description: string };
export type LegacyPart = { id: string; number: number; title: string; itemId: string | null; itemCode: string | null; where: string; canLog: boolean; canMark: boolean; videos: LegacyVideo[] };

function whereIs(i: { lifecycle: string; stage: Stage | null; stage_status: string | null } | undefined) {
  if (!i || i.lifecycle === "draft") return "Not started";
  if (i.lifecycle === "published") return "Published";
  if (i.stage === "recording") return i.stage_status === "awaiting_handoff" ? "Recorded, waiting for Editing" : "In Recording";
  return i.stage ? `In ${STAGE_LABELS[i.stage]}` : i.lifecycle;
}

export async function legacyParts(unitId: string): Promise<LegacyPart[]> {
  const parts = await all<{ id: string; number: number; title: string }>("SELECT id, number, title FROM lessons WHERE unit_id = ? ORDER BY number", unitId);
  if (!parts.length) return [];
  const ids = parts.map((p) => p.id);
  const items = await all<{ id: string; code: string; lesson_id: string; lifecycle: string; stage: Stage | null; stage_status: string | null }>(
    `SELECT id, code, lesson_id, lifecycle, stage, stage_status FROM items WHERE lesson_id IN (${placeholders(ids.length)}) AND revision_of_id IS NULL AND lifecycle NOT IN ('archived','cancelled')`,
    ...ids,
  );
  const assets = items.length
    ? await all<{ id: string; item_id: string; camera_code: string | null; label: string | null; notes: string | null }>(
        `SELECT id, item_id, camera_code, label, notes FROM assets WHERE kind = 'raw' AND status = 'current' AND item_id IN (${placeholders(items.length)}) ORDER BY created_at`,
        ...items.map((i) => i.id),
      )
    : [];
  return parts.map((p) => {
    const it = items.find((i) => i.lesson_id === p.id);
    const inRecording = !it || it.lifecycle === "draft" || (it.lifecycle === "in_production" && it.stage === "recording" && it.stage_status !== "awaiting_handoff");
    const videos = assets.filter((a) => a.item_id === it?.id).map((a) => ({ id: a.id, cameraCode: a.camera_code ?? "", title: a.label ?? "", description: a.notes ?? "" }));
    return { id: p.id, number: Number(p.number), title: p.title, itemId: it?.id ?? null, itemCode: it?.code ?? null, where: whereIs(it), canLog: inRecording, canMark: inRecording && videos.length > 0, videos };
  });
}

// ---------------------------------------------------------------------------
// Adding, as in the old catalog
// ---------------------------------------------------------------------------

export async function addSubject(user: AppUser, gradeId: string, rawName: string) {
  need(user);
  const name = tidy(rawName, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Subject name cannot be empty.");
  if (!(await get("SELECT 1 AS x FROM grades WHERE id = ?", gradeId))) throw new WorkflowError("NOT_FOUND", "Grade not found.");
  // The same subject typed a little differently is the same subject, not a new one.
  const all_ = await all<{ id: string; name: string }>("SELECT id, name FROM subjects WHERE active = 1");
  const close = all_.find((s) => s.name.toLowerCase() === name.toLowerCase()) ?? (name.length >= 5 ? all_.find((s) => editDistance(s.name.toLowerCase(), name.toLowerCase()) <= 2) : undefined);
  let id = close?.id ?? null;
  if (!id) {
    const code = subjectCode(name);
    const byCode = await get<{ id: string }>("SELECT id FROM subjects WHERE code = ?", code);
    id = byCode?.id ?? `sub_${code.toLowerCase()}_${uid("").slice(0, 4)}`;
    if (byCode) await run("UPDATE subjects SET active = 1 WHERE id = ?", id);
    else await run("INSERT INTO subjects (id, code, name, sort, active) VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM subjects), 1)", id, code, name);
  }
  await run("INSERT INTO grade_subjects (grade_id, subject_id) VALUES (?, ?) ON CONFLICT DO NOTHING", gradeId, id);
  await logged(user, "subject", `${user.name} added the subject "${close?.name ?? name}" to a grade`);
  return { id, name: close?.name ?? name, sameAs: close && close.name !== name ? close.name : null };
}

async function nextNumber(table: "units" | "lessons", where: string, params: string[], wanted: number | null) {
  if (wanted && !(await get(`SELECT 1 AS x FROM ${table} WHERE ${where} AND number = ?`, ...params, String(wanted)))) return wanted;
  return Number((await get<{ n: number }>(`SELECT COALESCE(MAX(number), 0) AS n FROM ${table} WHERE ${where}`, ...params))?.n ?? 0) + 1;
}

const numberIn = (raw: string) => {
  const m = /^(?:unit|chapter|part|ምዕራፍ|ክፍል)\s*(\d+)/i.exec(raw.trim());
  return m ? Number(m[1]) : null;
};

export async function addUnit(user: AppUser, gradeId: string, subjectId: string, rawTitle: string) {
  need(user);
  const t = tidy(rawTitle);
  if (!t) throw new WorkflowError("VALIDATION", "Unit title cannot be empty!");
  const number = await nextNumber("units", "grade_id = ? AND subject_id = ?", [gradeId, subjectId], numberIn(t));
  const title = cleanName(t, "unit");
  const id = uid("unt_");
  await run(
    "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am) VALUES (?, (SELECT id FROM curricula WHERE active = 1 ORDER BY id LIMIT 1), ?, ?, ?, ?, ?)",
    id,
    gradeId,
    subjectId,
    String(number),
    isPlaceholderTitle(title) ? `Unit ${number}` : title,
    ETHIOPIC.test(title) ? title : null,
  );
  await logged(user, "unit", `${user.name} added unit ${number} "${title}"`);
  return { id, number };
}

// A part is planned work: the part and its production item are made together, as an import does.
export async function addPart(user: AppUser, unitId: string, rawTitle: string) {
  need(user);
  const u = await get<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM units WHERE id = ?", unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  const t = tidy(rawTitle);
  if (!t) throw new WorkflowError("VALIDATION", "Part title cannot be empty!");
  const number = await nextNumber("lessons", "unit_id = ?", [unitId], numberIn(t));
  const title = cleanName(t, "part");
  const am = ETHIOPIC.test(title);
  return await tx(async () => {
    const id = uid("les_");
    await run("INSERT INTO lessons (id, unit_id, number, title, title_am, language, planned_deliverables, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", id, unitId, String(number), isPlaceholderTitle(title) ? `Part ${number}` : title, am ? title : null, am ? "am" : "en", nowIso());
    const item = await wf.createItem(SYS, { lessonId: id, gradeId: u.grade_id, subjectId: u.subject_id, title: isPlaceholderTitle(title) ? `Part ${number}` : title, titleAm: am ? title : null, language: am ? "am" : "en", provenance: "live" });
    await logged(user, "part", `${user.name} added part ${number} "${title}"`, item.id);
    return { id, number, itemId: item.id };
  });
}

// ---------------------------------------------------------------------------
// Video shots
// ---------------------------------------------------------------------------

async function itemFor(user: AppUser, lessonId: string) {
  const l = await get<{ title: string; language: string | null; number: number; grade_id: string; subject_id: string }>(
    "SELECT l.title, l.language, l.number, u.grade_id, u.subject_id FROM lessons l JOIN units u ON u.id = l.unit_id WHERE l.id = ?",
    lessonId,
  );
  if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
  const it = await get<{ id: string; lifecycle: string; stage: Stage | null }>("SELECT id, lifecycle, stage FROM items WHERE lesson_id = ? AND revision_of_id IS NULL AND lifecycle NOT IN ('archived','cancelled') ORDER BY created_at LIMIT 1", lessonId);
  if (it) return { lesson: l, item: it };
  const made = await wf.createItem(SYS, { lessonId, gradeId: l.grade_id, subjectId: l.subject_id, title: l.title, language: l.language ?? "en", provenance: "live" });
  return { lesson: l, item: { id: made.id, lifecycle: made.lifecycle, stage: null as Stage | null } };
}

const OPEN = ["queued", "in_progress", "paused", "blocked", "finished"];

export async function addVideo(user: AppUser, lessonId: string, input: { cameraCode: string; title?: string | null; description?: string | null }) {
  need(user);
  const clean = cleanCameraCode(input.cameraCode);
  if (!clean.code) throw new WorkflowError("VALIDATION", "Enter the camera code.");
  const cfg = await legacyConfig();
  const title = tidy(input.title);
  const description = [tidy(input.description, 2000), clean.note].filter(Boolean).join(". ");
  return await tx(async () => {
    const { lesson, item } = await itemFor(user, lessonId);
    if (item.lifecycle === "draft") await wf.releaseToProduction(SYS, item.id);
    else if (item.lifecycle !== "in_production") throw new WorkflowError("INVALID_STATE", "This part is already published.");
    const attempt = await wf.currentAttempt(item.id);
    if (!attempt || attempt.stage !== "recording" || !OPEN.includes(attempt.status))
      throw new WorkflowError("INVALID_STATE", `This part has left Recording (${attempt ? STAGE_LABELS[attempt.stage] : "done"}). Ask the lead to reopen it to add a video.`);
    // The person logging it recorded it, unless someone already owns it.
    if (!attempt.owner_id && hasRole(user, "recording")) {
      await run("UPDATE stage_attempts SET owner_id = ? WHERE id = ?", user.id, attempt.id);
      await run("UPDATE stage_assignments SET user_id = ? WHERE item_id = ? AND stage = 'recording'", user.id, item.id);
    }
    await wf.addAsset(SYS, item.id, { kind: "raw", cameraCode: clean.code, label: title && !isPlaceholderTitle(title) ? title : null, notes: description || null, url: null, sourceRef: uid("vid_") });
    await logged(user, "video", `${user.name} logged the shot ${clean.code}${title ? ` "${title}"` : ""}`, item.id);
    // A part with no real name takes the shot's title (the old catalog had real names only on its videos).
    if (cfg.nameFromVideo && isPlaceholderTitle(lesson.title) && title && !isPlaceholderTitle(title)) await renamePart(user, lessonId, stripDots(title)).catch(() => {});
    if (cfg.afterVideo === "recorded") await sendOn(item.id);
    return { code: clean.code, doubtful: clean.doubtful };
  });
}

async function assetOf(id: string) {
  const a = await get<{ id: string; item_id: string; camera_code: string | null; label: string | null; notes: string | null; status: string }>("SELECT id, item_id, camera_code, label, notes, status FROM assets WHERE id = ? AND kind = 'raw'", id);
  if (!a || a.status !== "current") throw new WorkflowError("NOT_FOUND", "Video shot not found.");
  return a;
}

// Wrong details can be corrected at any stage; they say which recording it is, not what the work was.
export async function editVideo(user: AppUser, assetId: string, input: { cameraCode: string; title?: string | null; description?: string | null }) {
  need(user);
  const a = await assetOf(assetId);
  const clean = cleanCameraCode(input.cameraCode);
  if (!clean.code) throw new WorkflowError("VALIDATION", "Enter the camera code.");
  const title = tidy(input.title);
  await run("UPDATE assets SET camera_code = ?, label = ?, notes = ? WHERE id = ?", clean.code, title && !isPlaceholderTitle(title) ? title : null, [tidy(input.description, 2000), clean.note].filter(Boolean).join(". ") || null, assetId);
  await logged(user, "video", `${user.name} corrected the shot ${a.camera_code ?? ""} to ${clean.code}`, a.item_id);
}

export async function deleteVideo(user: AppUser, assetId: string) {
  need(user);
  const a = await assetOf(assetId);
  const attempt = await wf.currentAttempt(a.item_id);
  if (!attempt || attempt.stage !== "recording" || !OPEN.includes(attempt.status)) throw new WorkflowError("INVALID_STATE", "This part has left Recording, so its recordings stay. Correct the details instead.");
  await run("UPDATE assets SET status = 'superseded' WHERE id = ?", assetId);
  await logged(user, "video", `${user.name} removed the shot ${a.camera_code ?? ""}`, a.item_id);
}

async function sendOn(itemId: string) {
  const settings = await getSettings();
  for (const c of settings.checklists.recording.filter((x) => x.required)) await wf.setChecklist(SYS, itemId, c.key, true);
  await wf.submitHandoff(SYS, itemId, { note: "Marked recorded in the Legacy catalog" });
}

// The old catalog had no "done": this is the step that sends the part on, to Editing's incoming, where they accept or reject it.
export async function markRecorded(user: AppUser, lessonId: string) {
  need(user);
  const { item } = await itemFor(user, lessonId);
  const attempt = await wf.currentAttempt(item.id);
  if (!attempt || attempt.stage !== "recording" || !OPEN.includes(attempt.status)) throw new WorkflowError("INVALID_STATE", "This part is not waiting in Recording.");
  if (!(await get("SELECT 1 AS x FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current'", item.id))) throw new WorkflowError("VALIDATION", "Log a video shot first.");
  await tx(async () => {
    await sendOn(item.id);
    await logged(user, "recorded", `${user.name} marked the part recorded`, item.id);
  });
}

// ---------------------------------------------------------------------------
// Removing: only what no team has worked on past Recording
// ---------------------------------------------------------------------------

async function removeLesson(lessonId: string, reason: string) {
  const items = await all<{ id: string; lifecycle: string; code: string }>("SELECT id, lifecycle, code FROM items WHERE lesson_id = ? AND lifecycle NOT IN ('archived','cancelled')", lessonId);
  for (const it of items) {
    const past = await get("SELECT 1 AS x FROM stage_attempts WHERE item_id = ? AND stage <> 'recording'", it.id);
    if (past || it.lifecycle === "published") throw new WorkflowError("INVALID_STATE", `${it.code} has already gone past Recording, so it stays. Fix its name or place on the Curriculum page instead.`);
  }
  for (const it of items) await wf.closeItem(SYS, it.id, { lifecycle: "cancelled", reason });
  await run("DELETE FROM lessons WHERE id = ?", lessonId);
}

export async function deletePart(user: AppUser, lessonId: string) {
  needRemove(user);
  const l = await get<{ title: string }>("SELECT title FROM lessons WHERE id = ?", lessonId);
  if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
  await tx(async () => {
    await removeLesson(lessonId, `Part removed in the Legacy catalog by ${user.name}`);
    await logged(user, "removed", `${user.name} removed the part "${l.title}"`);
  });
}

async function removeUnit(unitId: string, reason: string) {
  for (const l of await all<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ?", unitId)) await removeLesson(l.id, reason);
  await run("DELETE FROM units WHERE id = ?", unitId);
}

export async function deleteUnit(user: AppUser, unitId: string) {
  needRemove(user);
  const u = await get<{ title: string }>("SELECT title FROM units WHERE id = ?", unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  await tx(async () => {
    await removeUnit(unitId, `Unit removed in the Legacy catalog by ${user.name}`);
    await logged(user, "removed", `${user.name} removed the unit "${u.title}"`);
  });
}

export async function deleteSubject(user: AppUser, gradeId: string, subjectId: string) {
  needRemove(user);
  const s = await get<{ name: string }>("SELECT name FROM subjects WHERE id = ?", subjectId);
  if (!s) throw new WorkflowError("NOT_FOUND", "Subject not found.");
  await tx(async () => {
    for (const u of await all<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId)) await removeUnit(u.id, `Subject removed in the Legacy catalog by ${user.name}`);
    await run("DELETE FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
    if (!(await get("SELECT 1 AS x FROM grade_subjects WHERE subject_id = ?", subjectId))) await run("UPDATE subjects SET active = 0 WHERE id = ?", subjectId);
    await logged(user, "removed", `${user.name} removed the subject "${s.name}" from a grade`);
  });
}

// ---------------------------------------------------------------------------
// Import and export, in the old catalog's file format
// ---------------------------------------------------------------------------

function counts(data: CurriculumBackup) {
  const c = { grades: 0, subjects: 0, units: 0, parts: 0, videos: 0 };
  for (const g of Object.values(data)) {
    c.grades++;
    for (const s of g.subjects) {
      c.subjects++;
      for (const u of s.units ?? []) {
        c.units++;
        for (const p of u.parts ?? []) {
          c.parts++;
          c.videos += p.videos?.length ?? 0;
        }
      }
    }
  }
  return c;
}

// Reads an old backup, tidies it and says what it will do. With dryRun off it goes in; ids stay, so running it again
// updates the same rows, and a name a person has corrected is kept.
export async function importLegacy(user: AppUser, text: string, fileName: string, dryRun: boolean) {
  if (!canImportLegacy(user)) throw new WorkflowError("FORBIDDEN", "The Recording lead or a planner imports a backup.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new WorkflowError("VALIDATION", "Failed to read this file. It must be the catalog's JSON backup.");
  }
  if (!isCurriculumBackup(parsed)) throw new WorkflowError("VALIDATION", "Invalid JSON catalog format (it needs grades with subjects, units, parts and videos).");
  const { data, fixes } = tidyBackup(parsed as never);
  const clean = data as unknown as CurriculumBackup;
  const out = { counts: counts(clean), fixes: fixes.slice(0, 500), fixCount: fixes.length };
  if (dryRun) return { ...out, summary: null };
  const cfg = await legacyConfig();
  const summary = await importCurriculumBackup(clean, { actorId: user.id, createItems: true, markRecorded: cfg.importAsRecorded, fileName });
  return { ...out, summary };
}

export const legacyBackup = (user: AppUser) => exportTrackerBackup(user);

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// The catalog as a Word document, as the old page exported it: grade, subject, unit, part, and a table of shots.
export async function legacyWord(user: AppUser) {
  const data = await exportTrackerBackup(user);
  const { workspace } = await getSettings();
  let h = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Recorded video catalog</title><style>
body{font-family:Calibri,'Segoe UI',Arial,sans-serif;margin:30px;color:#1e293b}h1{color:#0F7B3E;font-size:24pt;border-bottom:2px solid #0F7B3E;padding-bottom:8px}h2{font-size:18pt;margin-top:25px;background:#f1f5f9;padding:6px 10px;border-left:5px solid #0F7B3E}h3{color:#1e3a8a;font-size:14pt;margin:18px 0 8px}h4{color:#334155;font-size:12pt;margin:12px 0 4px 15px}p.s{color:#64748b;font-size:10pt}p.p{margin:8px 0 4px 25px;font-weight:bold;color:#0284c7}p.e{margin-left:35px;font-style:italic;font-size:9pt;color:#94a3b8}table{width:95%;margin-left:25px;border-collapse:collapse;margin-bottom:15px}th{background:#0f172a;color:#fff;padding:8px;text-align:left;font-size:10pt}td{border:1px solid #cbd5e1;padding:8px;font-size:10pt;vertical-align:top}.c{font-family:'Courier New',monospace;font-weight:bold;color:#b45309}
</style></head><body><h1>${esc(workspace.name)}: recorded video catalog</h1><p class='s'>Generated on ${new Date().toISOString().slice(0, 10)}</p>`;
  for (const g of Object.values(data)) {
    h += `<h2>${esc(g.name)}${g.type ? ` (${esc(g.type)})` : ""}</h2>`;
    if (!g.subjects.length) h += `<p class='e'>No subjects recorded for this grade.</p>`;
    for (const s of g.subjects) {
      h += `<h3>Subject: ${esc(s.name)}</h3>`;
      if (!s.units.length) h += `<p class='e'>No units recorded.</p>`;
      for (const u of s.units) {
        h += `<h4>${esc(u.title)}</h4>`;
        if (!u.parts.length) h += `<p class='e'>No parts configured.</p>`;
        for (const p of u.parts) {
          h += `<p class='p'>${esc(p.title)}</p>`;
          if (!p.videos?.length) h += `<p class='e'>No video shots added to this part.</p>`;
          else h += `<table><thead><tr><th style='width:15%'>Camera code</th><th style='width:35%'>Video title</th><th style='width:50%'>Description</th></tr></thead><tbody>${p.videos.map((v) => `<tr><td><span class='c'>${esc(v.cameraCode)}</span></td><td><strong>${esc(v.title)}</strong></td><td>${esc(v.description || "N/A")}</td></tr>`).join("")}</tbody></table>`;
        }
      }
    }
  }
  return `${h}</body></html>`;
}
