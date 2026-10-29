// Admin data manager: browse every curriculum and production record, rename, move, merge and fill in bulk,
// find broken imports and repair them. Deletes go through the trash (see trash.ts).

import { all, get, nowIso, run, tx } from "./db";
import { audit, buildCode, setMemberships, syncItem, updateItemFields, WorkflowError, EDITABLE_FIELDS, type Ctx, type EditableField } from "./workflow";
import { moveToTrash } from "./trash";
import { FILL_FIELDS, RECORD_ENTITIES, type RecordEntity } from "@/lib/data-fields";

export { FILL_FIELDS, RECORD_ENTITIES, type RecordEntity };


export type DataRecord = {
  id: string;
  code: string | null;
  number: number | null;
  title: string;
  title_am: string | null;
  grade_id: string | null;
  grade: string | null;
  subject_id: string | null;
  subject: string | null;
  unit_id: string | null;
  unit_number: number | null;
  unit_title: string | null;
  lesson_id: string | null;
  lesson_number: number | null;
  lesson_title: string | null;
  status: string | null;
  children: number;
  extra: Record<string, string | number | null>;
};

export type RecordFilter = { entity: RecordEntity; gradeId?: string | null; subjectId?: string | null; unitId?: string | null; q?: string | null; unplaced?: boolean };

export const RECORD_LIMIT = 2000;

function like(q: string) {
  return `%${q.trim().toLowerCase()}%`;
}

export async function listRecords(f: RecordFilter): Promise<{ rows: DataRecord[]; capped: boolean }> {
  const where: string[] = [];
  const params: (string | number)[] = [];
  const filt = (sql: string, ...p: (string | number)[]) => {
    where.push(sql);
    params.push(...p);
  };
  let sql = "";
  switch (f.entity) {
    case "items":
      if (f.unplaced) filt("m.item_id IS NULL");
      if (f.gradeId) filt("m.grade_id = ?", f.gradeId);
      if (f.subjectId) filt("m.subject_id = ?", f.subjectId);
      if (f.unitId) filt("(m.unit_id = ? OR l.unit_id = ?)", f.unitId, f.unitId);
      if (f.q) filt("(lower(i.title) LIKE ? OR lower(i.code) LIKE ? OR lower(COALESCE(i.title_am, '')) LIKE ?)", like(f.q), like(f.q), like(f.q));
      sql = `SELECT i.id, i.code, NULL AS number, i.title, i.title_am, m.grade_id, g.name AS grade, m.subject_id, s.name AS subject, m.unit_id, u.number AS unit_number,
          u.title AS unit_title, i.lesson_id, l.number AS lesson_number, l.title AS lesson_title,
          CASE WHEN i.lifecycle = 'in_production' THEN i.stage || ':' || COALESCE(i.stage_status, '') ELSE i.lifecycle END AS status, 0 AS children,
          i.priority, i.language, i.teacher, i.content_type, i.deliverable_type, i.import_batch_id, i.created_at
        FROM items i
        LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
        LEFT JOIN grades g ON g.id = m.grade_id
        LEFT JOIN subjects s ON s.id = m.subject_id
        LEFT JOIN units u ON u.id = m.unit_id
        LEFT JOIN lessons l ON l.id = i.lesson_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY g.sort, g.code, s.sort, s.name, u.number, l.number, i.code`;
      break;
    case "lessons":
      if (f.gradeId) filt("u.grade_id = ?", f.gradeId);
      if (f.subjectId) filt("u.subject_id = ?", f.subjectId);
      if (f.unitId) filt("u.id = ?", f.unitId);
      if (f.q) filt("(lower(l.title) LIKE ? OR lower(COALESCE(l.title_am, '')) LIKE ?)", like(f.q), like(f.q));
      sql = `SELECT l.id, NULL AS code, l.number, l.title, l.title_am, u.grade_id, g.name AS grade, u.subject_id, s.name AS subject, u.id AS unit_id, u.number AS unit_number,
          u.title AS unit_title, NULL AS lesson_id, NULL AS lesson_number, NULL AS lesson_title, NULL AS status,
          (SELECT COUNT(*) FROM items x WHERE x.lesson_id = l.id) AS children, l.objectives, l.language, l.planned_deliverables, l.created_at
        FROM lessons l JOIN units u ON u.id = l.unit_id JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY g.sort, g.code, s.sort, s.name, u.number, l.number`;
      break;
    case "units":
      if (f.gradeId) filt("u.grade_id = ?", f.gradeId);
      if (f.subjectId) filt("u.subject_id = ?", f.subjectId);
      if (f.q) filt("(lower(u.title) LIKE ? OR lower(COALESCE(u.title_am, '')) LIKE ?)", like(f.q), like(f.q));
      sql = `SELECT u.id, NULL AS code, u.number, u.title, u.title_am, u.grade_id, g.name AS grade, u.subject_id, s.name AS subject, NULL AS unit_id, NULL AS unit_number,
          NULL AS unit_title, NULL AS lesson_id, NULL AS lesson_number, NULL AS lesson_title, NULL AS status,
          (SELECT COUNT(*) FROM lessons x WHERE x.unit_id = u.id) AS children, u.term
        FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY g.sort, g.code, s.sort, s.name, u.number`;
      break;
    case "subjects":
      if (f.q) filt("(lower(name) LIKE ? OR lower(code) LIKE ?)", like(f.q), like(f.q));
      sql = `SELECT id, code, sort AS number, name AS title, name_am AS title_am, NULL AS grade_id, NULL AS grade, NULL AS subject_id, NULL AS subject, NULL AS unit_id,
          NULL AS unit_number, NULL AS unit_title, NULL AS lesson_id, NULL AS lesson_number, NULL AS lesson_title,
          CASE WHEN active = 1 THEN 'active' ELSE 'inactive' END AS status, (SELECT COUNT(*) FROM units x WHERE x.subject_id = subjects.id) AS children
        FROM subjects ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort, name`;
      break;
    case "grades":
      if (f.q) filt("(lower(name) LIKE ? OR lower(code) LIKE ?)", like(f.q), like(f.q));
      sql = `SELECT id, code, sort AS number, name AS title, NULL AS title_am, NULL AS grade_id, NULL AS grade, NULL AS subject_id, NULL AS subject, NULL AS unit_id,
          NULL AS unit_number, NULL AS unit_title, NULL AS lesson_id, NULL AS lesson_number, NULL AS lesson_title,
          CASE WHEN active = 1 THEN 'active' ELSE 'inactive' END AS status, (SELECT COUNT(*) FROM units x WHERE x.grade_id = grades.id) AS children, level
        FROM grades ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY sort, code`;
      break;
  }
  const raw = await all<Record<string, unknown>>(`${sql} LIMIT ${RECORD_LIMIT + 1}`, ...params);
  const base = new Set(["id", "code", "number", "title", "title_am", "grade_id", "grade", "subject_id", "subject", "unit_id", "unit_number", "unit_title", "lesson_id", "lesson_number", "lesson_title", "status", "children"]);
  const rows = raw.slice(0, RECORD_LIMIT).map((r) => {
    const extra: DataRecord["extra"] = {};
    for (const [k, v] of Object.entries(r)) if (!base.has(k)) extra[k] = (v as string | number | null) ?? null;
    return { ...(r as unknown as DataRecord), children: Number(r.children ?? 0), extra };
  });
  return { rows, capped: raw.length > RECORD_LIMIT };
}

// ---------------------------------------------------------------------------
// Rename and fill
// ---------------------------------------------------------------------------

const TABLE: Record<Exclude<RecordEntity, "items">, string> = { lessons: "lessons", units: "units", subjects: "subjects", grades: "grades" };

function nameColumn(entity: RecordEntity, field: "title" | "title_am") {
  if (entity === "subjects" || entity === "grades") {
    if (field === "title_am" && entity === "grades") throw new WorkflowError("VALIDATION", "Grades have no Amharic name.");
    return field === "title" ? "name" : "name_am";
  }
  return field;
}

export async function renameRecords(ctx: Ctx, entity: RecordEntity, field: "title" | "title_am", changes: { id: string; value: string }[]) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const c of changes.slice(0, RECORD_LIMIT)) {
    const value = c.value.replace(/\s+/g, " ").trim();
    try {
      if (field === "title" && !value) throw new WorkflowError("VALIDATION", "Names cannot be empty.");
      if (entity === "items") await updateItemFields(ctx, c.id, { [field]: value || null });
      else {
        const col = nameColumn(entity, field);
        const before = await get<Record<string, string>>(`SELECT ${col} AS v FROM ${TABLE[entity]} WHERE id = ?`, c.id);
        if (!before) throw new WorkflowError("NOT_FOUND", "Record not found.");
        if (before.v === value) {
          results.push({ id: c.id, ok: true });
          continue;
        }
        await run(`UPDATE ${TABLE[entity]} SET ${col} = ? WHERE id = ?`, value || null, c.id);
        await audit(ctx, { action: "data.renamed", summary: `${ctx.actor?.name} renamed ${entity.slice(0, -1)} "${before.v}" to "${value}"`, oldValue: before.v, newValue: value });
      }
      results.push({ id: c.id, ok: true });
    } catch (err) {
      results.push({ id: c.id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

export async function fillRecords(ctx: Ctx, entity: RecordEntity, ids: string[], field: string, value: string | number | boolean | null) {
  const spec = FILL_FIELDS[entity].find((f) => f.key === field);
  if (!spec) throw new WorkflowError("VALIDATION", "That field cannot be filled in bulk.");
  let v: string | number | null = value === "" ? null : (value as string | number | null);
  if (spec.kind === "number" && v !== null) {
    v = Number(v);
    if (!Number.isFinite(v)) throw new WorkflowError("VALIDATION", "Enter a number.");
  }
  if (spec.kind === "bool") v = value === true || value === "true" || value === 1 ? 1 : 0;
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids.slice(0, RECORD_LIMIT)) {
    try {
      if (entity === "items") {
        if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) throw new WorkflowError("VALIDATION", "Not an editable item field.");
        await updateItemFields(ctx, id, { [field as EditableField]: field === "tags" ? String(v ?? "").split(",").map((t) => t.trim()).filter(Boolean) : v });
      } else await run(`UPDATE ${TABLE[entity]} SET ${field} = ? WHERE id = ?`, v, id);
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (entity !== "items") await audit(ctx, { action: "data.filled", summary: `${ctx.actor?.name} set ${spec.label} on ${results.filter((r) => r.ok).length} ${entity}`, newValue: v });
  return results;
}

// ---------------------------------------------------------------------------
// Move and merge
// ---------------------------------------------------------------------------

// Makes (grade, subject, unit) the item's primary placement, keeping its other placements.
async function setPrimaryPlacement(ctx: Ctx, itemId: string, gradeId: string, subjectId: string, unitId: string | null) {
  const current = await all<{ grade_id: string; subject_id: string; unit_id: string | null; is_primary: number }>(
    "SELECT grade_id, subject_id, unit_id, is_primary FROM item_memberships WHERE item_id = ?",
    itemId,
  );
  const primary = current.find((m) => m.is_primary);
  if (primary && primary.grade_id === gradeId && primary.subject_id === subjectId && primary.unit_id === unitId) return false;
  const others = current.filter((m) => !m.is_primary && !(m.grade_id === gradeId && m.subject_id === subjectId));
  await setMemberships(ctx, itemId, [
    { gradeId, subjectId, unitId, primary: true },
    ...others.map((m) => ({ gradeId: m.grade_id, subjectId: m.subject_id, unitId: m.unit_id, primary: false })),
  ]);
  return true;
}

async function ensureOffering(gradeId: string, subjectId: string) {
  await run("INSERT OR IGNORE INTO grade_subjects (grade_id, subject_id) VALUES (?, ?)", gradeId, subjectId);
}

async function freeNumber(sql: string, wanted: number, ...params: string[]) {
  if (!(await get(`${sql} AND number = ?`, ...params, wanted))) return wanted;
  const max = await get<{ n: number | null }>(sql.replace(/^SELECT 1 AS x/, "SELECT MAX(number) AS n"), ...params);
  return Number(max?.n ?? 0) + 1;
}

export type MoveTarget = { gradeId: string; subjectId: string; unitId?: string | null; lessonId?: string | null; recode?: boolean };

export async function moveRecords(ctx: Ctx, entity: RecordEntity, ids: string[], target: MoveTarget) {
  const results: { id: string; ok: boolean; error?: string; note?: string }[] = [];
  const unit = target.unitId ? await get<{ id: string; grade_id: string; subject_id: string }>("SELECT id, grade_id, subject_id FROM units WHERE id = ?", target.unitId) : undefined;
  if (target.unitId && !unit) throw new WorkflowError("VALIDATION", "The target unit does not exist.");
  if (unit && (unit.grade_id !== target.gradeId || unit.subject_id !== target.subjectId)) throw new WorkflowError("VALIDATION", "The unit does not belong to that grade and subject.");
  const lesson = target.lessonId ? await get<{ id: string; unit_id: string }>("SELECT id, unit_id FROM lessons WHERE id = ?", target.lessonId) : undefined;
  if (target.lessonId && (!lesson || lesson.unit_id !== target.unitId)) throw new WorkflowError("VALIDATION", "The part does not belong to that unit.");
  if (!(await get("SELECT 1 AS x FROM grades WHERE id = ?", target.gradeId)) || !(await get("SELECT 1 AS x FROM subjects WHERE id = ?", target.subjectId)))
    throw new WorkflowError("VALIDATION", "Choose a valid grade and subject.");
  await ensureOffering(target.gradeId, target.subjectId);

  for (const id of ids.slice(0, RECORD_LIMIT)) {
    try {
      await tx(async () => {
        const now = nowIso();
        if (entity === "items") {
          await setPrimaryPlacement(ctx, id, target.gradeId, target.subjectId, target.unitId ?? null);
          const it = await get<{ lesson_id: string | null; lesson_unit: string | null }>(
            "SELECT i.lesson_id, l.unit_id AS lesson_unit FROM items i LEFT JOIN lessons l ON l.id = i.lesson_id WHERE i.id = ?",
            id,
          );
          // A part from another unit would contradict the new placement, so it is replaced or cleared.
          const nextLesson = target.lessonId ?? (it?.lesson_id && it.lesson_unit === (target.unitId ?? null) ? it.lesson_id : null);
          if ((it?.lesson_id ?? null) !== nextLesson) {
            await run("UPDATE items SET lesson_id = ?, version = version + 1 WHERE id = ?", nextLesson, id);
            await audit(ctx, { itemId: id, action: "field.changed", summary: `${ctx.actor?.name} changed the part`, oldValue: it?.lesson_id ?? null, newValue: nextLesson });
            await syncItem(id, now);
          }
          if (target.recode) await recodeItem(ctx, id);
        } else if (entity === "lessons") {
          if (!unit) throw new WorkflowError("VALIDATION", "Choose the unit to move parts into.");
          const l = await get<{ unit_id: string; number: number }>("SELECT unit_id, number FROM lessons WHERE id = ?", id);
          if (!l) throw new WorkflowError("NOT_FOUND", "Part not found.");
          if (l.unit_id === unit.id) return;
          const number = await freeNumber("SELECT 1 AS x FROM lessons WHERE unit_id = ?", l.number, unit.id);
          await run("UPDATE lessons SET unit_id = ?, number = ? WHERE id = ?", unit.id, number, id);
          for (const it of await all<{ id: string }>("SELECT id FROM items WHERE lesson_id = ?", id)) {
            await setPrimaryPlacement(ctx, it.id, unit.grade_id, unit.subject_id, unit.id);
            if (target.recode) await recodeItem(ctx, it.id);
          }
          await audit(ctx, { action: "data.moved", summary: `${ctx.actor?.name} moved part ${l.number} to another unit${number !== l.number ? ` as part ${number}` : ""}` });
        } else if (entity === "units") {
          const u = await get<{ grade_id: string; subject_id: string; number: number; title: string }>("SELECT grade_id, subject_id, number, title FROM units WHERE id = ?", id);
          if (!u) throw new WorkflowError("NOT_FOUND", "Unit not found.");
          if (u.grade_id === target.gradeId && u.subject_id === target.subjectId) return;
          const number = await freeNumber("SELECT 1 AS x FROM units WHERE grade_id = ? AND subject_id = ?", u.number, target.gradeId, target.subjectId);
          await run("UPDATE units SET grade_id = ?, subject_id = ?, number = ? WHERE id = ?", target.gradeId, target.subjectId, number, id);
          const items = await all<{ id: string }>(
            "SELECT DISTINCT i.id FROM items i LEFT JOIN lessons l ON l.id = i.lesson_id LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 WHERE l.unit_id = ? OR m.unit_id = ?",
            id,
            id,
          );
          for (const it of items) {
            await setPrimaryPlacement(ctx, it.id, target.gradeId, target.subjectId, id);
            if (target.recode) await recodeItem(ctx, it.id);
          }
          await audit(ctx, { action: "data.moved", summary: `${ctx.actor?.name} moved unit ${u.number} ${u.title} with ${items.length} items` });
        } else throw new WorkflowError("VALIDATION", "Grades and subjects are merged, not moved.");
      });
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}

// Rebuilds an item's code from its current grade, subject, unit and part.
export async function recodeItem(ctx: Ctx, itemId: string) {
  const r = await get<{ code: string; deliverable_type: string; g: string | null; s: string | null; un: number | null; ln: number | null }>(
    `SELECT i.code, i.deliverable_type, g.code AS g, s.code AS s, u.number AS un, l.number AS ln
     FROM items i LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 LEFT JOIN grades g ON g.id = m.grade_id
     LEFT JOIN subjects s ON s.id = m.subject_id LEFT JOIN units u ON u.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id WHERE i.id = ?`,
    itemId,
  );
  if (!r?.g || !r.s) return null;
  const base = await buildCode({ gradeCode: r.g, subjectCode: r.s, unitNumber: r.un, lessonNumber: r.ln, deliverableType: r.deliverable_type });
  if (r.code === base || r.code.startsWith(`${base}-`)) return null;
  let code = base;
  let n = 2;
  while (await get("SELECT 1 AS x FROM items WHERE code = ? AND id <> ?", code, itemId)) code = `${base}-${n++}`;
  await run("UPDATE items SET code = ?, version = version + 1, updated_at = ? WHERE id = ?", code, nowIso(), itemId);
  await audit(ctx, { itemId, action: "field.changed", summary: `${ctx.actor?.name} changed the code from ${r.code} to ${code}`, oldValue: r.code, newValue: code });
  return code;
}

// Merges duplicate grades or subjects into one. Units with the same number are combined; the emptied
// source record goes to the trash.
export async function mergeRecords(ctx: Ctx, entity: "grades" | "subjects", sourceIds: string[], targetId: string) {
  const col = entity === "grades" ? "grade_id" : "subject_id";
  const other = entity === "grades" ? "subject_id" : "grade_id";
  const target = await get<{ name: string }>(`SELECT name FROM ${entity} WHERE id = ?`, targetId);
  if (!target) throw new WorkflowError("NOT_FOUND", "Choose the record to merge into.");
  let moved = 0;
  for (const sourceId of sourceIds.filter((s) => s !== targetId)) {
    await tx(async () => {
      for (const u of await all<{ id: string; number: number; grade_id: string; subject_id: string }>(`SELECT id, number, grade_id, subject_id FROM units WHERE ${col} = ?`, sourceId)) {
        const twin = await get<{ id: string }>(`SELECT id FROM units WHERE ${col} = ? AND ${other} = ? AND number = ?`, targetId, (u as Record<string, unknown>)[other] as string, u.number);
        if (twin) {
          for (const l of await all<{ id: string; number: number }>("SELECT id, number FROM lessons WHERE unit_id = ?", u.id)) {
            const number = await freeNumber("SELECT 1 AS x FROM lessons WHERE unit_id = ?", l.number, twin.id);
            await run("UPDATE lessons SET unit_id = ?, number = ? WHERE id = ?", twin.id, number, l.id);
          }
          await run("UPDATE item_memberships SET unit_id = ? WHERE unit_id = ?", twin.id, u.id);
          await run("DELETE FROM units WHERE id = ?", u.id);
        } else await run(`UPDATE units SET ${col} = ? WHERE id = ?`, targetId, u.id);
        moved++;
      }
      for (const m of await all<{ item_id: string; grade_id: string; subject_id: string; is_primary: number }>(`SELECT item_id, grade_id, subject_id, is_primary FROM item_memberships WHERE ${col} = ?`, sourceId)) {
        const o = (m as Record<string, unknown>)[other] as string;
        const clash = await get<{ is_primary: number }>(`SELECT is_primary FROM item_memberships WHERE item_id = ? AND ${col} = ? AND ${other} = ?`, m.item_id, targetId, o);
        if (clash) {
          await run(`DELETE FROM item_memberships WHERE item_id = ? AND ${col} = ? AND ${other} = ?`, m.item_id, sourceId, o);
          if (m.is_primary) await run(`UPDATE item_memberships SET is_primary = 1 WHERE item_id = ? AND ${col} = ? AND ${other} = ?`, m.item_id, targetId, o);
        } else await run(`UPDATE item_memberships SET ${col} = ? WHERE item_id = ? AND ${col} = ? AND ${other} = ?`, targetId, m.item_id, sourceId, o);
      }
      for (const gs of await all<Record<string, string>>(`SELECT ${other} AS o FROM grade_subjects WHERE ${col} = ?`, sourceId))
        await run(`INSERT OR IGNORE INTO grade_subjects (${col}, ${other}) VALUES (?, ?)`, targetId, gs.o);
      await run(`UPDATE access_scopes SET ${col} = ? WHERE ${col} = ?`, targetId, sourceId);
      await run(`UPDATE chat_groups SET ${col} = ? WHERE ${col} = ?`, targetId, sourceId);
      const src = await get<{ name: string }>(`SELECT name FROM ${entity} WHERE id = ?`, sourceId);
      await moveToTrash(ctx, entity === "grades" ? "grade" : "subject", sourceId, `Merged into ${target.name}`);
      await audit(ctx, { action: "data.merged", summary: `${ctx.actor?.name} merged ${src?.name ?? sourceId} into ${target.name}` });
    });
  }
  return { units: moved };
}

// ---------------------------------------------------------------------------
// Health checks: broken imports and inconsistent placement
// ---------------------------------------------------------------------------

export type HealthRow = { id: string; label: string; detail: string; link?: string };
export type HealthIssue = { key: string; title: string; description: string; severity: "error" | "warning" | "info"; fix: string | null; trash: string | null; rows: HealthRow[]; total: number };

const SHOW = 200;

export async function healthReport(): Promise<HealthIssue[]> {
  const issues: HealthIssue[] = [];
  const push = (i: Omit<HealthIssue, "rows" | "total">, rows: HealthRow[]) => rows.length && issues.push({ ...i, rows: rows.slice(0, SHOW), total: rows.length });

  const mismatch = await all<{ id: string; code: string; title: string; got: string | null; want: string }>(
    `SELECT i.id, i.code, i.title,
        CASE WHEN m.item_id IS NULL THEN NULL ELSE COALESCE(g.name, '?') || ' / ' || COALESCE(s.name, '?') || COALESCE(' / Unit ' || mu.number, '') END AS got,
        ug.name || ' / ' || us.name || ' / Unit ' || u.number AS want
     FROM items i JOIN lessons l ON l.id = i.lesson_id JOIN units u ON u.id = l.unit_id
     JOIN grades ug ON ug.id = u.grade_id JOIN subjects us ON us.id = u.subject_id
     LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
     LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id LEFT JOIN units mu ON mu.id = m.unit_id
     WHERE m.item_id IS NULL OR m.grade_id <> u.grade_id OR m.subject_id <> u.subject_id OR m.unit_id IS NULL OR m.unit_id <> u.id
     ORDER BY i.code`,
  );
  push(
    {
      key: "placement_mismatch",
      title: "Placement does not match the part",
      description: "The item's grade, subject or unit differs from the unit its part belongs to, usually from an import with the wrong subject.",
      severity: "error",
      fix: "Set placement from the part",
      trash: "Move items to trash",
    },
    mismatch.map((r) => ({ id: r.id, label: `${r.code} ${r.title}`, detail: `${r.got ?? "No placement"} → ${r.want}`, link: `/items/${r.id}` })),
  );

  const unplaced = await all<{ id: string; code: string; title: string }>(
    "SELECT i.id, i.code, i.title FROM items i WHERE i.lesson_id IS NULL AND NOT EXISTS (SELECT 1 FROM item_memberships m WHERE m.item_id = i.id AND m.is_primary = 1) ORDER BY i.code",
  );
  push(
    { key: "unplaced", title: "Items with no grade or subject", description: "No part and no primary placement. Select them in Records (Unplaced) and use Move.", severity: "error", fix: null, trash: "Move items to trash" },
    unplaced.map((r) => ({ id: r.id, label: `${r.code} ${r.title}`, detail: "No placement", link: `/items/${r.id}` })),
  );

  const placeholder = await all<{ id: string; kind: string; label: string }>(
    `SELECT id, 'item' AS kind, code || ' ' || title AS label FROM items WHERE lower(trim(title)) IN ('', 'undefined', 'null', 'untitled', 'n/a', '-', 'tbd', 'new item')
     UNION ALL SELECT id, 'part', title FROM lessons WHERE lower(trim(title)) IN ('', 'undefined', 'null', 'untitled', 'n/a', '-', 'tbd')
     UNION ALL SELECT id, 'unit', title FROM units WHERE lower(trim(title)) IN ('', 'undefined', 'null', 'untitled', 'n/a', '-', 'tbd')`,
  );
  push(
    { key: "placeholder_names", title: "Placeholder names", description: "Names such as undefined, null or Untitled. Rename them in Records.", severity: "warning", fix: null, trash: "Move to trash" },
    placeholder.map((r) => ({ id: `${r.kind}:${r.id}`, label: r.label, detail: r.kind, link: r.kind === "item" ? `/items/${r.id}` : undefined })),
  );

  const spacing = await all<{ id: string; kind: string; label: string }>(
    `SELECT id, 'items' AS kind, title AS label FROM items WHERE title <> btrim(regexp_replace(title, '\\s+', ' ', 'g'))
     UNION ALL SELECT id, 'lessons', title FROM lessons WHERE title <> btrim(regexp_replace(title, '\\s+', ' ', 'g'))
     UNION ALL SELECT id, 'units', title FROM units WHERE title <> btrim(regexp_replace(title, '\\s+', ' ', 'g'))
     UNION ALL SELECT id, 'subjects', name FROM subjects WHERE name <> btrim(regexp_replace(name, '\\s+', ' ', 'g'))
     UNION ALL SELECT id, 'grades', name FROM grades WHERE name <> btrim(regexp_replace(name, '\\s+', ' ', 'g'))`,
  );
  push(
    { key: "spacing", title: "Extra spaces in names", description: "Leading, trailing or repeated spaces, which break sorting and matching on re-import.", severity: "warning", fix: "Clean up spaces", trash: null },
    spacing.map((r) => ({ id: `${r.kind}:${r.id}`, label: JSON.stringify(r.label), detail: r.kind })),
  );

  const dupes = await all<{ id: string; code: string; title: string; lesson: string; first_code: string }>(
    `SELECT i.id, i.code, i.title, l.title AS lesson,
        (SELECT x.code FROM items x WHERE x.lesson_id = i.lesson_id AND x.deliverable_type = i.deliverable_type AND x.lifecycle NOT IN ('archived','cancelled') ORDER BY x.created_at, x.code LIMIT 1) AS first_code
     FROM items i JOIN lessons l ON l.id = i.lesson_id
     WHERE i.lifecycle NOT IN ('archived','cancelled') AND i.revision_of_id IS NULL
       AND EXISTS (SELECT 1 FROM items x WHERE x.lesson_id = i.lesson_id AND x.deliverable_type = i.deliverable_type AND x.lifecycle NOT IN ('archived','cancelled')
                   AND x.id <> i.id AND (x.created_at < i.created_at OR (x.created_at = i.created_at AND x.code < i.code)))
     ORDER BY i.code`,
  );
  push(
    {
      key: "duplicates",
      title: "Possible duplicate items",
      description: "More than one open item of the same deliverable type for one part. The oldest is kept; the listed newer copies can be moved to the trash.",
      severity: "warning",
      fix: "Move newer copies to trash",
      trash: null,
    },
    dupes.map((r) => ({ id: r.id, label: `${r.code} ${r.title}`, detail: `Same part as ${r.first_code} (${r.lesson})`, link: `/items/${r.id}` })),
  );

  const offering = await all<{ grade_id: string; subject_id: string; g: string; s: string; n: number }>(
    `SELECT u.grade_id, u.subject_id, g.name AS g, s.name AS s, COUNT(*) AS n FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
     WHERE NOT EXISTS (SELECT 1 FROM grade_subjects gs WHERE gs.grade_id = u.grade_id AND gs.subject_id = u.subject_id)
     GROUP BY u.grade_id, u.subject_id, g.name, s.name`,
  );
  push(
    { key: "offering", title: "Subjects not offered in their grade", description: "Units exist for a grade and subject that is not switched on, so they are hidden from some lists. Offer the subject if it belongs there, or move its units (with their parts and items) to the trash if they were imported by mistake.", severity: "warning", fix: "Offer the subject", trash: "Move units to trash" },
    offering.map((r) => ({ id: `${r.grade_id}|${r.subject_id}`, label: `${r.g} / ${r.s}`, detail: `${r.n} units` })),
  );

  const empty = await all<{ id: string; label: string; detail: string }>(
    `SELECT u.id, 'Unit ' || u.number || ': ' || u.title AS label, g.name || ' / ' || s.name AS detail FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
     WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.unit_id = u.id) AND NOT EXISTS (SELECT 1 FROM item_memberships m WHERE m.unit_id = u.id)`,
  );
  push({ key: "empty_units", title: "Empty units", description: "Units with no parts and no items. Many are planned units not yet split into parts; only trash the ones a mistaken import left behind.", severity: "info", fix: "Move empty units to trash", trash: null }, empty);

  const orphanParts = await all<{ id: string; label: string; detail: string }>(
    `SELECT l.id, 'Part ' || l.number || ': ' || l.title AS label, g.name || ' / ' || s.name || ' / Unit ' || u.number AS detail
     FROM lessons l JOIN units u ON u.id = l.unit_id JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id
     WHERE NOT EXISTS (SELECT 1 FROM items i WHERE i.lesson_id = l.id)
     ORDER BY g.sort, s.sort, u.number, l.number`,
  );
  push(
    {
      key: "orphan_parts",
      title: "Parts with no item",
      description: "Parts that show as missing in Overview and Coverage because no item exists for them, often left behind when an item was deleted. Trash the ones that should not be there.",
      severity: "info",
      fix: "Move parts to trash",
      trash: null,
    },
    orphanParts,
  );

  const inactive = await all<{ id: string; code: string; title: string; what: string }>(
    `SELECT i.id, i.code, i.title, CASE WHEN g.active = 0 THEN 'Inactive grade ' || g.name ELSE 'Inactive subject ' || s.name END AS what
     FROM items i JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1 JOIN grades g ON g.id = m.grade_id JOIN subjects s ON s.id = m.subject_id
     WHERE (g.active = 0 OR s.active = 0) AND i.lifecycle IN ('draft','in_production')`,
  );
  push(
    { key: "inactive", title: "Open items in inactive grades or subjects", description: "Work is still open where the grade or subject is switched off. Move the items or reactivate it.", severity: "info", fix: null, trash: "Move items to trash" },
    inactive.map((r) => ({ id: r.id, label: `${r.code} ${r.title}`, detail: r.what, link: `/items/${r.id}` })),
  );

  return issues;
}

export async function fixHealthIssue(ctx: Ctx, key: string, ids: string[], mode: "fix" | "trash" = "fix") {
  let fixed = 0;
  const errors: string[] = [];
  const each = async (id: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      fixed++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  if (mode === "trash") {
    const reason = "Removed from the data health check";
    for (const ref of ids)
      await each(ref, async () => {
        if (key === "offering") {
          // Every unit of the grade and subject, with its parts and items.
          const [g, sub] = ref.split("|");
          for (const u of await all<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ?", g, sub)) await moveToTrash(ctx, "unit", u.id, reason);
        } else if (key === "placeholder_names") {
          const [kind, id] = ref.split(":");
          await moveToTrash(ctx, kind === "part" ? "lesson" : kind === "unit" ? "unit" : "item", id, reason, { withParts: true });
        } else if (["placement_mismatch", "unplaced", "inactive"].includes(key)) await moveToTrash(ctx, "item", ref, reason, { withParts: true });
        else throw new WorkflowError("VALIDATION", "These rows cannot be moved to the trash from here.");
      });
    await audit(ctx, { action: "data.repaired", summary: `${ctx.actor?.name} moved ${fixed} "${key.replace(/_/g, " ")}" rows to trash` });
    return { fixed, errors };
  }
  switch (key) {
    case "placement_mismatch":
      for (const id of ids)
        await each(id, async () => {
          const u = await get<{ id: string; grade_id: string; subject_id: string }>(
            "SELECT u.id, u.grade_id, u.subject_id FROM items i JOIN lessons l ON l.id = i.lesson_id JOIN units u ON u.id = l.unit_id WHERE i.id = ?",
            id,
          );
          if (u) await setPrimaryPlacement(ctx, id, u.grade_id, u.subject_id, u.id);
        });
      break;
    case "spacing":
      for (const ref of ids)
        await each(ref, async () => {
          const [kind, id] = ref.split(":") as [RecordEntity, string];
          if (kind === "items") {
            const r = await get<{ title: string }>("SELECT title FROM items WHERE id = ?", id);
            if (r) await updateItemFields(ctx, id, { title: r.title.replace(/\s+/g, " ").trim() });
          } else {
            const col = kind === "subjects" || kind === "grades" ? "name" : "title";
            await run(`UPDATE ${TABLE[kind as Exclude<RecordEntity, "items">]} SET ${col} = btrim(regexp_replace(${col}, '\\s+', ' ', 'g')) WHERE id = ?`, id);
          }
        });
      break;
    case "duplicates":
      for (const id of ids) await each(id, () => moveToTrash(ctx, "item", id, "Duplicate found by the data health check"));
      break;
    case "offering":
      for (const ref of ids)
        await each(ref, async () => {
          const [g, s] = ref.split("|");
          await ensureOffering(g, s);
        });
      break;
    case "orphan_parts":
      for (const id of ids) await each(id, () => moveToTrash(ctx, "lesson", id, "Part with no item, found by the data health check"));
      break;
    case "empty_units":
      for (const id of ids) await each(id, () => moveToTrash(ctx, "unit", id, "Empty unit found by the data health check"));
      break;
    default:
      throw new WorkflowError("VALIDATION", "This issue has no automatic fix.");
  }
  await audit(ctx, { action: "data.repaired", summary: `${ctx.actor?.name} fixed ${fixed} "${key.replace(/_/g, " ")}" issues` });
  return { fixed, errors };
}

// ---------------------------------------------------------------------------
// Import batches
// ---------------------------------------------------------------------------

export type ImportBatch = { id: string; kind: string; template: string | null; file_name: string | null; status: string; created_count: number; updated_count: number; live_items: number; actor: string | null; created_at: string };

export async function listImportBatches(): Promise<ImportBatch[]> {
  const rows = await all<ImportBatch>(
    `SELECT j.id, j.kind, j.template, j.file_name, j.status, j.created_count, j.updated_count, u.name AS actor, j.created_at,
        (SELECT COUNT(*) FROM items i WHERE i.import_batch_id = j.id) AS live_items
     FROM jobs j LEFT JOIN users u ON u.id = j.actor_id WHERE j.dry_run = 0 AND j.kind <> 'export' ORDER BY j.created_at DESC LIMIT 200`,
  );
  return rows.map((r) => ({ ...r, live_items: Number(r.live_items), created_count: Number(r.created_count), updated_count: Number(r.updated_count) }));
}

export async function batchItemIds(jobId: string, limit = 5000) {
  return (await all<{ id: string }>(`SELECT id FROM items WHERE import_batch_id = ? LIMIT ${limit}`, jobId)).map((r) => r.id);
}

