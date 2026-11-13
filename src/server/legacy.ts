// The Legacy catalog: the way the Recording team kept its recordings before this app (Grade, Subject, Unit, Part, then
// video shots by camera code), in the same order and with the same steps. It has no data of its own: a subject, unit or
// part added here is the real one, and a video shot is a real recording on that part's work. So what they log the old
// way is in the system at once, cleaned up, and every other page sees it.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { can, canViewItem, hasRole, isLeadOf, isManager, scopeAllowsGradeSubject, type AppUser } from "./users";
import { getSettings } from "./settings";
import * as wf from "./workflow";
import { audit, WorkflowError, type Ctx } from "./workflow";
import { exportTrackerBackup, importCurriculumBackup, isCurriculumBackup, subjectCode, type CurriculumBackup } from "./workspace-data";
import { cleanCameraCode, cleanName, editDistance, isPlaceholderTitle, stripDots, tidyBackup } from "@/lib/curriculum-names";
import { STAGE_LABELS, type Stage } from "@/lib/domain";

export type LegacyConfig = {
  on: boolean;
  // After a video shot is logged: the part stays open for more, or is marked done at once (ready to hand off; it is
  // never handed off on its own).
  afterVideo: "stay" | "done";
  // A part with no real name takes the video's title.
  nameFromVideo: boolean;
  // Importing an old backup: parts with videos count as recorded and move on to Editing.
  importAsRecorded: boolean;
};
const DEFAULT: LegacyConfig = { on: true, afterVideo: "stay", nameFromVideo: true, importAsRecorded: true };

export async function legacyConfig(): Promise<LegacyConfig> {
  const v = parseJson<Partial<LegacyConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy'"))?.value, {});
  const out = { ...DEFAULT, ...v };
  // The old setting "recorded" now means "done" (it no longer hands off by itself).
  if ((out.afterVideo as string) === "recorded") out.afterVideo = "done";
  return out;
}

export async function saveLegacyConfig(user: AppUser, input: Partial<LegacyConfig>) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the Legacy catalog.");
  const cur = await legacyConfig();
  const next: LegacyConfig = { on: input.on ?? cur.on, afterVideo: input.afterVideo === "done" || input.afterVideo === "stay" ? input.afterVideo : cur.afterVideo, nameFromVideo: input.nameFromVideo ?? cur.nameFromVideo, importAsRecorded: input.importAsRecorded ?? cur.importAsRecorded };
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
// The Recording lead or a planner: names, numbers and deletions. Everyone else in Recording is a media contributor:
// they add units, parts and video entries inside the catalog, and change or delete only their own entries.
export const canManageLegacy = canRemove;

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

export type LegacyFile = { id: string; name: string; mime: string; size: number };
// One video entry: everything about a recording is entered here and only here (the part card has no second copy).
export type LegacyVideo = {
  id: string;
  cameraCode: string;
  title: string;
  description: string;
  minutes: number | null;
  link: string | null;
  disk: string | null;
  path: string | null;
  presenter: string | null;
  studio: string | null;
  studioReason: string | null;
  recordedOn: string | null;
  status: "draft" | "submitted";
  files: LegacyFile[];
  noResources: boolean;
  by: string | null;
  mine: boolean;
  canEdit: boolean;
  canDelete: boolean;
};
export type LegacyCheck = { key: string; label: string; required: boolean; checked: boolean };
export type LegacyPart = {
  id: string;
  number: number;
  title: string;
  kind: "standard" | "review";
  itemId: string | null;
  itemCode: string | null;
  where: string;
  status: string | null;
  canLog: boolean;
  canMark: boolean;
  canReopen: boolean;
  videos: LegacyVideo[];
  drafts: number;
  // Shown, not entered: the presenter comes from the video entries and the raw total is the sum of their lengths.
  teacher: string | null;
  rawMin: number | null;
  notes: string | null;
  checks: LegacyCheck[];
  missing: string[];
};

const REVIEW = /^(?:review|summary|ክለሳ|ፈተና|exam)/i;
const kindOf = (k: string | null, title: string): LegacyPart["kind"] => (k === "review" || (!k && REVIEW.test(title.trim())) ? "review" : "standard");

function whereIs(i: { lifecycle: string; stage: Stage | null; stage_status: string | null } | undefined) {
  if (!i || i.lifecycle === "draft") return "Not started";
  if (i.lifecycle === "published") return "Published";
  if (i.stage === "recording")
    return i.stage_status === "awaiting_handoff"
      ? "Handed off, waiting for Editing"
      : i.stage_status === "finished"
        ? "Done, ready to hand off"
        : i.stage_status === "lead_review"
          ? "With the Recording lead"
          : i.stage_status === "ready"
            ? "Approved, ready for Editing"
            : "In Recording";
  return i.stage ? `In ${STAGE_LABELS[i.stage]}` : i.lifecycle;
}

type AssetRow = {
  id: string;
  item_id: string;
  camera_code: string | null;
  label: string | null;
  notes: string | null;
  duration_min: number | null;
  url: string | null;
  source_ref: string | null;
  title: string | null;
  presenter: string | null;
  studio: string | null;
  studio_reason: string | null;
  recorded_on: string | null;
  entry_status: string | null;
  no_resources: number | null;
  created_by: string | null;
  by_name: string | null;
};
const ASSET_COLS = "a.id, a.item_id, a.camera_code, a.label, a.notes, a.duration_min, a.url, a.source_ref, a.title, a.presenter, a.studio, a.studio_reason, a.recorded_on, a.entry_status, a.no_resources, a.created_by, (SELECT name FROM users x WHERE x.id = a.created_by) AS by_name";

async function filesFor(assetIds: string[]) {
  const m = new Map<string, LegacyFile[]>();
  if (!assetIds.length) return m;
  const rows = await all<LegacyFile & { asset_id: string }>(`SELECT id, asset_id, name, mime, size FROM asset_files WHERE asset_id IN (${placeholders(assetIds.length)}) ORDER BY created_at`, ...assetIds);
  for (const r of rows) m.set(r.asset_id, [...(m.get(r.asset_id) ?? []), { id: r.id, name: r.name, mime: r.mime, size: Number(r.size) }]);
  return m;
}

function toVideo(a: AssetRow, files: LegacyFile[], user: AppUser | null, open: boolean, manage: boolean): LegacyVideo {
  // A shot on an external disk keeps "disk:<name>" as its label and the folder in source_ref (as the work card does).
  const disk = a.label?.startsWith("disk:") ? a.label.slice(5) : null;
  const title = a.title ?? (disk ? "" : (a.label ?? ""));
  const mine = !!user && a.created_by === user.id;
  const canEdit = manage || (mine && open);
  return {
    id: a.id,
    cameraCode: a.camera_code ?? "",
    title: isPlaceholderTitle(title) ? "" : title,
    description: a.notes ?? "",
    minutes: a.duration_min == null ? null : Number(a.duration_min),
    link: a.url,
    disk,
    path: disk ? a.source_ref : null,
    presenter: a.presenter,
    studio: a.studio,
    studioReason: a.studio_reason,
    recordedOn: a.recorded_on,
    status: a.entry_status === "draft" ? "draft" : "submitted",
    files,
    noResources: !!Number(a.no_resources ?? 0),
    by: a.by_name,
    mine,
    canEdit,
    canDelete: canEdit && open,
  };
}

export async function legacyParts(unitId: string, user: AppUser | null = null): Promise<LegacyPart[]> {
  const parts = await all<{ id: string; number: number; title: string; part_kind: string | null }>("SELECT id, number, title, part_kind FROM lessons WHERE unit_id = ? ORDER BY number", unitId);
  if (!parts.length) return [];
  const manage = !!user && canRemove(user);
  const ids = parts.map((p) => p.id);
  const items = await all<{ id: string; code: string; lesson_id: string; lifecycle: string; stage: Stage | null; stage_status: string | null; teacher: string | null; current_attempt_id: string | null }>(
    `SELECT id, code, lesson_id, lifecycle, stage, stage_status, teacher, current_attempt_id FROM items WHERE lesson_id IN (${placeholders(ids.length)}) AND revision_of_id IS NULL AND lifecycle NOT IN ('archived','cancelled')`,
    ...ids,
  );
  const assets = items.length
    ? await all<AssetRow>(`SELECT ${ASSET_COLS} FROM assets a WHERE a.kind = 'raw' AND a.status = 'current' AND a.item_id IN (${placeholders(items.length)}) ORDER BY a.created_at`, ...items.map((i) => i.id))
    : [];
  const files = await filesFor(assets.map((a) => a.id));
  const settings = await getSettings();
  const out: LegacyPart[] = [];
  for (const p of parts) {
    const it = items.find((i) => i.lesson_id === p.id);
    const memberOpen = !it || it.lifecycle === "draft" || (it.lifecycle === "in_production" && it.stage === "recording" && OPEN.slice(0, 4).includes(it.stage_status ?? ""));
    const open = memberOpen || (manage && it?.lifecycle === "in_production" && it.stage === "recording" && LEAD_OPEN.includes(it.stage_status ?? ""));
    const videos = assets.filter((a) => a.item_id === it?.id).map((a) => toVideo(a, files.get(a.id) ?? [], user, manage ? open : memberOpen, manage));
    const att = it?.current_attempt_id ? await get<{ raw_duration_min: number | null; notes: string | null; id: string; status: string }>("SELECT id, raw_duration_min, notes, status FROM stage_attempts WHERE id = ?", it.current_attempt_id) : null;
    const results = att ? await all<{ key: string; checked: number }>("SELECT key, checked FROM checklist_results WHERE attempt_id = ?", att.id) : [];
    const checks = settings.checklists.recording.map((c) => ({ key: c.key, label: c.label, required: c.required, checked: !!results.find((r) => r.key === c.key)?.checked }));
    const missing = it && att && it.stage === "recording" && OPEN.slice(0, 4).includes(att.status) ? (await wf.evaluateRequirements(it.id)).filter((r) => !r.met && !r.key.startsWith("verify:") && !r.key.startsWith("check:")).map((r) => r.label) : [];
    out.push({
      id: p.id,
      number: Number(p.number),
      title: p.title,
      kind: kindOf(p.part_kind, p.title),
      itemId: it?.id ?? null,
      itemCode: it?.code ?? null,
      where: whereIs(it),
      status: it?.lifecycle === "draft" ? "draft" : (it?.stage_status ?? null),
      canLog: open,
      canMark: (!it || it.lifecycle === "draft" || (it.stage === "recording" && OPEN.slice(0, 4).includes(it.stage_status ?? ""))) && videos.length > 0,
      canReopen: it?.stage === "recording" && it.stage_status === "finished",
      videos,
      drafts: videos.filter((v) => v.status === "draft").length,
      teacher: it?.teacher ?? null,
      rawMin: att?.raw_duration_min == null ? null : Number(att.raw_duration_min),
      notes: att?.notes ?? null,
      checks,
      missing,
    });
  }
  return out;
}

// What the video form offers: the studios (Settings, Lists) and the presenters (Presenters page).
export async function legacyChoices() {
  const [studios, presenters] = await Promise.all([studioList(), presenterList()]);
  return { studios, presenters };
}
async function studioList() {
  return ((await getSettings()).lists.studios ?? []).filter(Boolean);
}
async function presenterList() {
  return (await all<{ name: string }>("SELECT name FROM presenters WHERE active = 1 ORDER BY name")).map((r) => r.name);
}

// ---------------------------------------------------------------------------
// Adding, as in the old catalog
// ---------------------------------------------------------------------------

// Subjects are the Recording lead's or a planner's to add; camera operators work inside the ones that exist.
export async function addSubject(user: AppUser, gradeId: string, rawName: string) {
  need(user);
  if (!canRemove(user)) throw new WorkflowError("FORBIDDEN", "Only the Recording lead or a planner adds subjects. You can add a unit inside a subject.");
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
  const title = cleanName(t, "unit");
  // A unit needs a real title; "Unit 4" alone is not saved.
  if (!t || !title || isPlaceholderTitle(title)) throw new WorkflowError("VALIDATION", "Give the unit its title (for example: Cell biology). A unit cannot be saved without one.");
  if (!(await get("SELECT 1 AS x FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId))) throw new WorkflowError("NOT_FOUND", "Choose a subject of this grade first.");
  const number = await nextNumber("units", "grade_id = ? AND subject_id = ?", [gradeId, subjectId], numberIn(t));
  const id = uid("unt_");
  await run(
    "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am) VALUES (?, (SELECT id FROM curricula WHERE active = 1 ORDER BY id LIMIT 1), ?, ?, ?, ?, ?)",
    id,
    gradeId,
    subjectId,
    String(number),
    title,
    ETHIOPIC.test(title) ? title : null,
  );
  await logged(user, "unit", `${user.name} added unit ${number} "${title}"`);
  return { id, number };
}

export type AddPartOptions = {
  // Kept for older callers; parts are now placed by their number only.
  insertAt?: number | null;
  kind?: "standard" | "review" | "custom";
};

const partNumber = (n: unknown) => {
  const v = Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 999) throw new WorkflowError("VALIDATION", "The part number is a whole number from 1 to 999.");
  return v;
};
async function numberFree(unitId: string, n: number, except?: string) {
  const row = await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", unitId, String(n));
  if (row && row.id !== except) throw new WorkflowError("VALIDATION", `Part ${n} already exists in this unit. Each part number is used once.`);
}

// A part is planned work: the part and its production item are made together, as an import does. Parts are named only
// "Part X"; the topic is typed once, as the video title. A number (from the form) must be free in the unit; older
// callers that pass text get the number in it, or the next free one.
export async function addPart(user: AppUser, unitId: string, raw: string | number, opts: AddPartOptions = {}) {
  need(user);
  const u = await get<{ grade_id: string; subject_id: string }>("SELECT grade_id, subject_id FROM units WHERE id = ?", unitId);
  if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
  const text = typeof raw === "string" ? tidy(raw) : "";
  const kind: LegacyPart["kind"] = opts.kind === "review" || REVIEW.test(text) ? "review" : "standard";
  let number: number;
  if (typeof raw === "number" || /^\d+$/.test(text)) {
    number = partNumber(raw);
    await numberFree(unitId, number);
  } else number = await nextNumber("lessons", "unit_id = ?", [unitId], numberIn(text));
  const title = `Part ${number}`;
  return await tx(async () => {
    const id = uid("les_");
    await run("INSERT INTO lessons (id, unit_id, number, title, title_am, language, planned_deliverables, part_kind, created_at) VALUES (?, ?, ?, ?, NULL, 'en', 1, ?, ?)", id, unitId, String(number), title, kind, nowIso());
    const item = await wf.createItem(SYS, { lessonId: id, gradeId: u.grade_id, subjectId: u.subject_id, title, titleAm: null, language: "en", provenance: "live" });
    await logged(user, "part", `${user.name} added ${kind === "review" ? "review " : ""}part ${number}`, item.id);
    return { id, number, itemId: item.id };
  });
}

// The Recording lead (or a planner) corrects a part's number or kind; the name follows the number.
export async function editPart(user: AppUser, lessonId: string, input: { number: number; kind?: "standard" | "review" }) {
  needRemove(user);
  const l = await get<{ unit_id: string; number: number; title: string; part_kind: string | null }>("SELECT unit_id, number, title, part_kind FROM lessons WHERE id = ?", lessonId);
  if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
  const number = partNumber(input.number);
  await numberFree(l.unit_id, number, lessonId);
  const kind = input.kind === "review" ? "review" : input.kind === "standard" ? "standard" : kindOf(l.part_kind, l.title);
  const title = `Part ${number}`;
  await tx(async () => {
    await run("UPDATE lessons SET number = ?, title = ?, title_am = NULL, part_kind = ? WHERE id = ?", String(number), title, kind, lessonId);
    // The work keeps a real topic (from its video) and only follows the part's name while it has none.
    for (const it of await all<{ id: string; title: string }>("SELECT id, title FROM items WHERE lesson_id = ?", lessonId))
      if (it.title === l.title || isPlaceholderTitle(it.title)) await run("UPDATE items SET title = ?, title_am = NULL, version = version + 1, updated_at = ? WHERE id = ?", title, nowIso(), it.id);
    await logged(user, "part", `${user.name} changed part ${Number(l.number)} to ${kind === "review" ? "review " : ""}part ${number}`);
  });
  return { number };
}

// One-time clean-up: parts with their own titles ("Part 3: text", "Part 4: Intro") become "Part X". Review parts keep
// their kind. The work items keep their topic, and the old names stay in the history.
export async function migratePartNames(user: AppUser, commit: boolean) {
  if (!planner(user) && !can(user, "settings.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Admin or a planner renames the parts.");
  const rows = await all<{ id: string; number: number; title: string; part_kind: string | null }>("SELECT id, number, title, part_kind FROM lessons ORDER BY unit_id, number");
  const changes = rows.filter((r) => r.title !== `Part ${Number(r.number)}` || !r.part_kind).map((r) => ({ id: r.id, from: r.title, to: `Part ${Number(r.number)}`, kind: kindOf(r.part_kind, r.title) }));
  const renamed = changes.filter((c) => c.from !== c.to);
  if (commit && changes.length) {
    await tx(async () => {
      for (const c of changes) await run("UPDATE lessons SET title = ?, title_am = NULL, part_kind = ? WHERE id = ?", c.to, c.kind, c.id);
      await audit({ actor: user }, { action: "legacy.part_names", summary: `${user.name} renamed ${renamed.length} parts to number-only names`, oldValue: renamed.slice(0, 2000).map((c) => ({ id: c.id, title: c.from })) });
    });
  }
  return { count: renamed.length, sample: renamed.slice(0, 30).map(({ from, to }) => ({ from, to })), done: commit };
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
// The Recording lead (or a planner) still changes a part once it is done, sent to them or approved, until it is
// handed over to Editing.
const LEAD_OPEN = [...OPEN, "lead_review", "ready"];
const openFor = (u: AppUser | null, status: string | null | undefined) => (u && canRemove(u) ? LEAD_OPEN : OPEN).includes(status ?? "");

export type Upload = { name: string; mime: string; base64: string };
export type VideoInput = {
  cameraCode: string;
  title?: string | null;
  description?: string | null;
  minutes?: number | null;
  link?: string | null;
  disk?: string | null;
  path?: string | null;
  presenter?: string | null;
  studio?: string | null;
  studioReason?: string | null;
  recordedOn?: string | null;
  // With a status the form's rules apply: a Draft needs the camera code, title and studio; Submitted for Review
  // needs every field. Without one (imports, older callers) the entry is saved as submitted, as before.
  status?: "draft" | "submitted";
  noResources?: boolean;
  files?: Upload[];
  removeFiles?: string[];
};

export const OTHER_STUDIO = "Other";
export const CAMERA_CODE_HELP = "The code the camera gives the file, as C0172, CLIP0250 or 0ZA4K. Several files for one video: C0172 & C0173.";
const RES_LIMIT = { count: 6, bytes: 9 * 1024 * 1024 };
const RES_OK = /\.(pdf|pptx?|key|odp|docx?|odt|xlsx?|csv|txt|png|jpe?g|gif|webp|zip)$/i;

function cleanUploads(files: Upload[] | undefined) {
  const list = (files ?? []).filter((f) => f && typeof f.base64 === "string" && f.base64.length);
  if (list.length > RES_LIMIT.count) throw new WorkflowError("VALIDATION", `Attach at most ${RES_LIMIT.count} files at a time.`);
  let total = 0;
  return list.map((f) => {
    const name = String(f.name ?? "file").replace(/[\\/]/g, "_").slice(0, 160) || "file";
    if (!RES_OK.test(name)) throw new WorkflowError("VALIDATION", `"${name}" is not a PDF, slide deck, document or image.`);
    const size = Math.floor((f.base64.length * 3) / 4);
    total += size;
    if (total > RES_LIMIT.bytes) throw new WorkflowError("VALIDATION", "Supporting files are limited to 9 MB at a time. Link bigger ones in the notes.");
    return { name, mime: String(f.mime ?? "").slice(0, 100) || "application/octet-stream", size, data: f.base64 };
  });
}

const localToday = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);

type Entry = {
  code: string;
  doubtful: boolean;
  title: string;
  notes: string | null;
  minutes: number | null;
  link: string | null;
  disk: string | null;
  path: string | null;
  presenter: string | null;
  studio: string | null;
  studioReason: string | null;
  recordedOn: string | null;
  status: "draft" | "submitted";
  noResources: boolean;
};

// Checks one entry as the form's rules say, and that its camera code is not already logged for the same studio and day.
async function checkEntry(input: VideoInput, selfId: string | null, fileCount: number): Promise<Entry> {
  const clean = cleanCameraCode(input.cameraCode);
  if (!clean.code) throw new WorkflowError("VALIDATION", "Enter the camera code.");
  const strict = input.status !== undefined;
  const status = input.status === "draft" ? "draft" : "submitted";
  const title = tidy(input.title);
  const minutes = Number(input.minutes);
  const disk = tidy(input.disk, 80) || null;
  const e: Entry = {
    code: clean.code,
    doubtful: clean.doubtful,
    title: title && !isPlaceholderTitle(title) ? title : "",
    notes: [tidy(input.description, 2000), clean.note].filter(Boolean).join(". ") || null,
    minutes: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes * 600) / 600 : null,
    link: disk ? null : tidy(input.link, 1000) || null,
    disk,
    path: disk ? tidy(input.path, 400) || null : null,
    presenter: tidy(input.presenter, 120) || null,
    studio: tidy(input.studio, 80) || null,
    studioReason: null,
    recordedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(input.recordedOn ?? "")) ? String(input.recordedOn) : null,
    status,
    noResources: !!input.noResources && fileCount === 0,
  };
  if (e.studio === OTHER_STUDIO) e.studioReason = tidy(input.studioReason, 200) || null;
  if (strict) {
    if (!e.title) throw new WorkflowError("VALIDATION", "Give the video its title: the topic only.");
    if (!e.studio) throw new WorkflowError("VALIDATION", "Choose the studio.");
    const studios = await studioList();
    if (e.studio !== OTHER_STUDIO && studios.length && !studios.includes(e.studio)) throw new WorkflowError("VALIDATION", `Choose a studio from the list (${studios.join(", ")}) or Other.`);
    if (e.studio === OTHER_STUDIO && !e.studioReason) throw new WorkflowError("VALIDATION", "Say briefly why the studio is Other.");
    if (input.recordedOn && !e.recordedOn) throw new WorkflowError("VALIDATION", "The recording date is not a date.");
    if (e.recordedOn && e.recordedOn > localToday()) throw new WorkflowError("VALIDATION", "The recording date cannot be in the future.");
  }
  if (strict && status === "submitted") {
    if (e.doubtful) throw new WorkflowError("VALIDATION", `"${e.code}" does not look like a camera code. ${CAMERA_CODE_HELP}`);
    const missing = [
      !e.presenter && "presenter",
      !e.recordedOn && "recording date",
      !e.minutes && "length (M:S)",
      !e.link && !(e.disk && e.path) && "storage location (the raw footage link, or the disk and its folder)",
      !fileCount && !e.noResources && "supporting resources (attach them, or choose None)",
    ].filter(Boolean);
    if (missing.length) throw new WorkflowError("VALIDATION", `To submit for review, fill in: ${missing.join(", ")}. Or save it as a draft.`);
    const presenters = await presenterList();
    if (presenters.length && !presenters.some((n) => n.toLowerCase() === e.presenter!.toLowerCase())) throw new WorkflowError("VALIDATION", "Choose the presenter from the Presenters list (add them there first).");
  }
  // Camera codes restart on every card, so a code is unique per studio and recording date.
  if (e.studio && e.recordedOn) {
    const codes = e.code.split(" & ").filter((c) => c !== "UNKNOWN");
    const rows = await all<{ camera_code: string | null }>("SELECT camera_code FROM assets WHERE kind = 'raw' AND status = 'current' AND studio = ? AND recorded_on = ? AND id <> ?", e.studio, e.recordedOn, selfId ?? "");
    const taken = codes.find((c) => rows.some((r) => (r.camera_code ?? "").split(" & ").includes(c)));
    if (taken) throw new WorkflowError("VALIDATION", `${taken} is already logged for ${e.studio} on ${e.recordedOn}. A camera code is used once per studio and day.`);
  }
  return e;
}

// The part's presenter is the one on its latest video entry (the work card and other teams read it from the item).
async function syncPresenter(itemId: string) {
  const p = (await get<{ presenter: string | null }>("SELECT presenter FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current' AND presenter IS NOT NULL ORDER BY created_at DESC LIMIT 1", itemId))?.presenter;
  if (p) await run("UPDATE items SET teacher = ?, version = version + 1, updated_at = ? WHERE id = ? AND (teacher IS NULL OR teacher <> ?)", p, nowIso(), itemId, p);
}

async function saveEntryExtras(assetId: string, e: Entry, files: ReturnType<typeof cleanUploads>, by: string | null) {
  await run(
    "UPDATE assets SET title = ?, presenter = ?, studio = ?, studio_reason = ?, recorded_on = ?, entry_status = ?, no_resources = ?, created_by = COALESCE(created_by, ?) WHERE id = ?",
    e.title || null,
    e.presenter,
    e.studio,
    e.studioReason,
    e.recordedOn,
    e.status,
    e.noResources ? 1 : 0,
    by,
    assetId,
  );
  for (const f of files) await run("INSERT INTO asset_files (id, asset_id, name, mime, size, data, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("af_"), assetId, f.name, f.mime, f.size, f.data, by, nowIso());
}

export async function addVideo(user: AppUser, lessonId: string, input: VideoInput) {
  need(user);
  const cfg = await legacyConfig();
  const files = cleanUploads(input.files);
  const e = await checkEntry(input, null, files.length);
  return await tx(async () => {
    const { item } = await itemFor(user, lessonId);
    if (item.lifecycle === "draft") await wf.releaseToProduction(SYS, item.id);
    else if (item.lifecycle !== "in_production") throw new WorkflowError("INVALID_STATE", "This part is already published.");
    const attempt = await wf.currentAttempt(item.id);
    if (!attempt || attempt.stage !== "recording" || !openFor(user, attempt.status))
      throw new WorkflowError("INVALID_STATE", attempt?.stage === "recording" && LEAD_OPEN.includes(attempt.status) ? "This part is with the Recording lead; the lead can still change it before handing it over." : `This part has left Recording (${attempt ? STAGE_LABELS[attempt.stage] : "done"}). Ask the lead to reopen it to add a video.`);
    // The person logging it recorded it, unless someone already owns it.
    if (!attempt.owner_id && hasRole(user, "recording")) {
      await run("UPDATE stage_attempts SET owner_id = ? WHERE id = ?", user.id, attempt.id);
      await run("UPDATE stage_assignments SET user_id = ? WHERE item_id = ? AND stage = 'recording'", user.id, item.id);
    }
    const id = await wf.addAsset(SYS, item.id, {
      kind: "raw",
      cameraCode: e.code,
      label: e.disk ? null : e.title || null,
      notes: e.notes,
      url: e.link,
      disk: e.disk,
      path: e.path,
      durationMin: e.minutes,
      sourceRef: e.disk ? undefined : uid("vid_"),
    });
    await saveEntryExtras(id, e, files, user.id);
    await syncPresenter(item.id);
    // The part's total raw minutes are the sum of its shots (the engine keeps it so on every change).
    await logged(user, "video", `${user.name} logged the shot ${e.code}${e.title ? ` "${e.title}"` : ""}${e.status === "draft" ? " as a draft" : ""}`, item.id);
    // Parts are named "Part X" only; the work item takes the first real video title so other teams see the topic.
    const it = await get<{ title: string }>("SELECT title FROM items WHERE id = ?", item.id);
    if (cfg.nameFromVideo && e.title && it && isPlaceholderTitle(it.title)) await run("UPDATE items SET title = ?, title_am = ?, version = version + 1, updated_at = ? WHERE id = ?", stripDots(e.title), ETHIOPIC.test(e.title) ? stripDots(e.title) : null, nowIso(), item.id);
    if (cfg.afterVideo === "done" && e.status === "submitted") await wf.finishWork(SYS, item.id).catch(() => {});
    return { id, code: e.code, doubtful: e.doubtful, status: e.status };
  });
}

async function assetOf(id: string) {
  const a = await get<AssetRow & { status: string }>(`SELECT ${ASSET_COLS}, a.status FROM assets a WHERE a.id = ? AND a.kind = 'raw'`, id);
  if (!a || a.status !== "current") throw new WorkflowError("NOT_FOUND", "Video shot not found.");
  return a;
}

// Who may change an entry: the Recording lead (or a planner) at any stage, so storage paths can be updated when files
// move from a PC to an external disk; anyone else only their own entries, while the part is open in Recording.
async function needOwnOpen(user: AppUser, a: { item_id: string; created_by: string | null }, what: string) {
  if (canRemove(user)) return;
  const attempt = await wf.currentAttempt(a.item_id);
  if (a.created_by !== user.id) throw new WorkflowError("FORBIDDEN", `You can ${what} only your own video entries. Ask the Recording lead.`);
  if (!attempt || attempt.stage !== "recording" || !OPEN.slice(0, 4).includes(attempt.status)) throw new WorkflowError("INVALID_STATE", `This part is no longer open in Recording, so you cannot ${what} it. Ask the Recording lead.`);
}

// Wrong details are corrected in place: the entry is changed, never added again, so the raw total is not counted twice.
export async function editVideo(user: AppUser, assetId: string, input: VideoInput) {
  need(user);
  const a = await assetOf(assetId);
  await needOwnOpen(user, a, "change");
  const was = toVideo(a, [], user, true, true);
  const keep = <K extends keyof VideoInput>(k: K, v: VideoInput[K]) => (input[k] === undefined ? v : input[k]);
  const merged: VideoInput = {
    cameraCode: input.cameraCode,
    title: keep("title", was.title),
    description: keep("description", was.description),
    minutes: keep("minutes", was.minutes),
    disk: keep("disk", was.disk),
    path: keep("path", was.path),
    link: keep("link", was.link),
    presenter: keep("presenter", was.presenter),
    studio: keep("studio", was.studio),
    studioReason: keep("studioReason", was.studioReason),
    recordedOn: keep("recordedOn", was.recordedOn),
    noResources: keep("noResources", was.noResources),
    status: input.status,
  };
  const existing = (await filesFor([assetId])).get(assetId) ?? [];
  const removing = new Set((input.removeFiles ?? []).filter((id) => existing.some((f) => f.id === id)));
  const files = cleanUploads(input.files);
  const e = await checkEntry(merged, assetId, existing.length - removing.size + files.length);
  if (input.status === undefined) e.status = was.status;
  const wasDisk = !!a.label?.startsWith("disk:");
  const sourceRef = e.disk ? e.path : wasDisk || !a.source_ref ? uid("vid_") : a.source_ref;
  await tx(async () => {
    await run("UPDATE assets SET camera_code = ?, label = ?, notes = ?, duration_min = ?, url = ?, source_ref = ? WHERE id = ?", e.code, e.disk ? `disk:${e.disk}` : e.title || null, e.notes, e.minutes, e.link, sourceRef, assetId);
    for (const id of removing) await run("DELETE FROM asset_files WHERE id = ? AND asset_id = ?", id, assetId);
    await saveEntryExtras(assetId, e, files, user.id);
    const attempt = await wf.currentAttempt(a.item_id);
    if (attempt?.stage === "recording") await wf.recomputeRaw(a.item_id, attempt.id);
    await syncPresenter(a.item_id);
  });
  await logged(user, "video", `${user.name} corrected the shot ${a.camera_code ?? ""}${a.camera_code !== e.code ? ` to ${e.code}` : ""}${was.status === "draft" && e.status === "submitted" ? " and submitted it for review" : ""}`, a.item_id);
  return { code: e.code, status: e.status };
}

export async function deleteVideo(user: AppUser, assetId: string) {
  need(user);
  const a = await assetOf(assetId);
  await needOwnOpen(user, a, "delete");
  const attempt = await wf.currentAttempt(a.item_id);
  if (!attempt || attempt.stage !== "recording" || !openFor(user, attempt.status)) throw new WorkflowError("INVALID_STATE", "This part has left Recording, so its recordings stay. Correct the details instead.");
  await run("UPDATE assets SET status = 'superseded' WHERE id = ?", assetId);
  const sum = (await get<{ m: number | null }>("SELECT SUM(duration_min) AS m FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current'", a.item_id))?.m;
  await run("UPDATE stage_attempts SET raw_duration_min = ? WHERE id = ?", sum != null && Number(sum) > 0 ? Number(sum) : null, attempt.id);
  await logged(user, "video", `${user.name} removed the shot ${a.camera_code ?? ""}`, a.item_id);
}

// A supporting file on a video entry, for anyone who uses the catalog or can see the work.
export async function readVideoFile(viewer: AppUser, fileId: string) {
  const f = await get<{ name: string; mime: string; data: string; item_id: string }>("SELECT f.name, f.mime, f.data, a.item_id FROM asset_files f JOIN assets a ON a.id = f.asset_id WHERE f.id = ?", fileId);
  if (!f || (!canUseLegacy(viewer) && !(await canViewItem(viewer, f.item_id)))) return null;
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

// The rest of what the Recording team enters on a part: the presenter, the raw minutes in total, notes and the
// checklist. A part already handed on keeps its details; only the presenter and notes can still be corrected.
export async function saveDetails(user: AppUser, lessonId: string, input: { teacher?: string | null; rawMin?: number | null; notes?: string | null; checks?: Record<string, boolean> }) {
  need(user);
  const { item } = await itemFor(user, lessonId);
  const now = nowIso();
  await tx(async () => {
    if (input.teacher !== undefined) {
      const t = tidy(input.teacher, 120) || null;
      await run("UPDATE items SET teacher = ?, version = version + 1, updated_at = ? WHERE id = ?", t, now, item.id);
    }
    if (item.lifecycle === "draft" && (input.rawMin !== undefined || input.notes !== undefined || input.checks)) await wf.releaseToProduction(SYS, item.id);
    const attempt = await wf.currentAttempt(item.id);
    const open = attempt && attempt.stage === "recording" && (OPEN.slice(0, 4).includes(attempt.status) || (canRemove(user) && LEAD_OPEN.includes(attempt.status)));
    if (attempt && attempt.stage === "recording" && input.notes !== undefined) await run("UPDATE stage_attempts SET notes = ? WHERE id = ?", tidy(input.notes, 4000) || null, attempt.id);
    if (open && input.rawMin !== undefined) await wf.setDurations(SYS, item.id, { rawDurationMin: input.rawMin === null || !(Number(input.rawMin) >= 0) ? null : Number(input.rawMin) });
    if (open && input.checks) for (const [k, v] of Object.entries(input.checks)) await wf.setChecklist(SYS, item.id, k, !!v);
    await logged(user, "details", `${user.name} filled in the part's recording details`, item.id);
  });
}

// Done: the part waits as "Done, ready to hand off". It is never handed off from here on its own; the person checks it
// and hands it off (one or many) on Ready to hand off.
// The recording checklist is ticked here, when the part is marked done (it is not entered anywhere else).
export async function markDone(user: AppUser, lessonId: string, checks?: Record<string, boolean>) {
  need(user);
  const { item } = await itemFor(user, lessonId);
  const attempt = await wf.currentAttempt(item.id);
  if (!attempt || attempt.stage !== "recording" || !OPEN.slice(0, 4).includes(attempt.status)) throw new WorkflowError("INVALID_STATE", "This part is not open in Recording.");
  if (!(await get("SELECT 1 AS x FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current'", item.id))) throw new WorkflowError("VALIDATION", "Log a video shot first.");
  const drafts = await all<{ camera_code: string | null }>("SELECT camera_code FROM assets WHERE item_id = ? AND kind = 'raw' AND status = 'current' AND entry_status = 'draft'", item.id);
  if (drafts.length) throw new WorkflowError("VALIDATION", `Submit or remove the draft entries first: ${drafts.map((d) => d.camera_code).join(", ")}.`);
  if (checks) for (const [k, v] of Object.entries(checks)) await wf.setChecklist(SYS, item.id, k, !!v);
  await wf.finishWork(SYS, item.id);
  await logged(user, "done", `${user.name} marked the part done`, item.id);
}
export const markRecorded = markDone;

export async function reopenPart(user: AppUser, lessonId: string) {
  need(user);
  const { item } = await itemFor(user, lessonId);
  await wf.reopenFinished(SYS, item.id);
  await logged(user, "reopened", `${user.name} reopened the part to change it`, item.id);
}

// ---------------------------------------------------------------------------
// Ready to hand off: parts done, checked by the person, handed off one by one or many at once
// ---------------------------------------------------------------------------

export type ReadyRow = { itemId: string; lessonId: string; code: string; title: string; grade: string; gradeId: string; subject: string; subjectId: string; unit: number | null; part: number | null; teacher: string | null; owner: string | null; ownerId: string | null; status: string; videos: number; minutes: number | null; finishedAt: string | null };
export type ReadyFilter = { gradeId?: string | null; subjectId?: string | null; teacher?: string | null; ownerId?: string | null; status?: string | null; q?: string | null };

const leadsRecording = (u: AppUser) => isLeadOf(u, "recording") || isManager(u) || can(u, "items.plan");

export async function readyToHandOff(user: AppUser, f: ReadyFilter = {}): Promise<ReadyRow[]> {
  need(user);
  const lead = leadsRecording(user);
  const rows = await all<ReadyRow & { finished_at: string | null }>(
    `SELECT i.id AS "itemId", i.lesson_id AS "lessonId", i.code, i.title, g.name AS grade, g.id AS "gradeId", s.name AS subject, s.id AS "subjectId", un.number AS unit, l.number AS part,
        i.teacher, u.name AS owner, a.owner_id AS "ownerId", a.status, a.raw_duration_min AS minutes, i.recorded_at AS finished_at,
        (SELECT COUNT(*) FROM assets x WHERE x.item_id = i.id AND x.kind = 'raw' AND x.status = 'current') AS videos
     FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id
     LEFT JOIN users u ON u.id = a.owner_id
     JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 JOIN grades g ON g.id = m.grade_id JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
     WHERE i.lifecycle = 'in_production' AND a.stage = 'recording' AND a.status IN (${lead ? "'finished','lead_review','ready'" : "'finished','lead_review'"})
       ${lead ? "" : "AND a.owner_id = ?"}
     ORDER BY g.sort, s.sort, un.number, l.number LIMIT 2000`,
    ...(lead ? [] : [user.id]),
  );
  const needle = f.q?.trim().toLowerCase();
  return rows
    .map((r) => ({ ...r, videos: Number(r.videos), minutes: r.minutes == null ? null : Number(r.minutes), unit: r.unit == null ? null : Number(r.unit), part: r.part == null ? null : Number(r.part), finishedAt: r.finished_at }))
    .filter(
      (r) =>
        (!f.gradeId || r.gradeId === f.gradeId) &&
        (!f.subjectId || r.subjectId === f.subjectId) &&
        (!f.teacher || (r.teacher ?? "").toLowerCase() === f.teacher.toLowerCase()) &&
        (!f.ownerId || r.ownerId === f.ownerId) &&
        (!f.status || r.status === f.status) &&
        (!needle || `${r.code} ${r.title} ${r.teacher ?? ""} ${r.owner ?? ""}`.toLowerCase().includes(needle)),
    )
    .map(({ finished_at: _f, ...r }) => r as ReadyRow);
}

// Hands off what the person checked. A team member sends it to the Recording lead (who approves it); the lead (or a
// manager) approves what was sent and hands it all over to Editing as one batch.
export async function handOff(user: AppUser, itemIds: string[], note?: string | null) {
  need(user);
  const ids = [...new Set(itemIds)].slice(0, 500);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose the parts to hand off.");
  const lead = leadsRecording(user);
  const ctx: Ctx = { actor: user, source: "bulk" };
  const results: { id: string; code: string; ok: boolean; error?: string }[] = [];
  const toBatch: string[] = [];
  for (const id of ids) {
    const it = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", id);
    if (!it) continue;
    try {
      const a = await wf.currentAttempt(id);
      if (!a || a.stage !== "recording") throw new WorkflowError("INVALID_STATE", "Not in Recording.");
      if (lead) {
        if (a.status === "finished" || a.status === "lead_review") {
          if (a.owner_id === user.id || a.status === "finished") await wf.submitToLead({ ...ctx, silent: true }, id, { note: note ?? null }).catch(() => {});
          const b = await wf.currentAttempt(id);
          if (b && (b.status === "lead_review" || b.status === "finished")) await wf.leadDecide(ctx, id, { decision: "approve", note: note ?? null });
        }
        if ((await wf.currentAttempt(id))?.status !== "ready") throw new WorkflowError("INVALID_STATE", "Not approved yet.");
        toBatch.push(id);
      } else {
        if (a.owner_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only your own parts.");
        if (a.status !== "finished") throw new WorkflowError("INVALID_STATE", "Already sent to the lead.");
        await wf.submitToLead(ctx, id, { note: note ?? null });
        results.push({ id, code: it.code, ok: true });
      }
    } catch (e) {
      results.push({ id, code: it.code, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  let handover: string | null = null;
  if (toBatch.length) {
    const { createHandover } = await import("./editorial");
    const r = await createHandover(user, { itemIds: toBatch, note: note ?? "From the Legacy catalog" });
    handover = r.code;
    for (const x of r.results) results.push({ id: x.id, code: x.code, ok: x.ok, error: x.error });
  }
  await logged(user, "handoff", `${user.name} handed off ${results.filter((r) => r.ok).length} parts${handover ? ` (${handover})` : ""}`);
  return { results, handover, sentToLead: !lead };
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
