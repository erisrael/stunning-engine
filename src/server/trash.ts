// Trash: deleting a record copies its rows (and every dependent row) into one snapshot, then removes them.
// Restoring re-inserts the snapshot in dependency order, so nothing in the live tables needs soft-delete flags.

import { all, get, nowIso, parseJson, placeholders, run, tx, uid } from "./db";
import { TABLES } from "./schema";
import { audit, WorkflowError, type Ctx } from "./workflow";

type Row = Record<string, unknown>;
export type TrashEntity = "item" | "lesson" | "unit" | "grade" | "subject" | "batch";

export type Snapshot = {
  tables: Record<string, Row[]>;
  // Links that were cleared (not deleted) and are put back on restore.
  relink?: {
    memberships?: { item_id: string; grade_id: string; subject_id: string; unit_id: string }[];
    revisions?: { id: string; revision_of_id: string }[];
  };
};

export const TRASH_RETENTION_DAYS = 30;

// Rows that belong to an item and go with it. Each query takes the item ids.
const ITEM_DEPENDENTS: [string, (ph: string) => string][] = [
  ["items", (ph) => `id IN (${ph})`],
  ["item_memberships", (ph) => `item_id IN (${ph})`],
  ["stage_assignments", (ph) => `item_id IN (${ph})`],
  ["item_collaborators", (ph) => `item_id IN (${ph})`],
  ["stage_attempts", (ph) => `item_id IN (${ph})`],
  ["stage_intervals", (ph) => `attempt_id IN (SELECT id FROM stage_attempts WHERE item_id IN (${ph}))`],
  ["work_sessions", (ph) => `item_id IN (${ph})`],
  ["session_corrections", (ph) => `session_id IN (SELECT id FROM work_sessions WHERE item_id IN (${ph}))`],
  ["assets", (ph) => `item_id IN (${ph})`],
  ["checklist_results", (ph) => `attempt_id IN (SELECT id FROM stage_attempts WHERE item_id IN (${ph}))`],
  ["handoff_reviews", (ph) => `item_id IN (${ph})`],
  ["blockers", (ph) => `item_id IN (${ph})`],
  ["deadline_revisions", (ph) => `item_id IN (${ph})`],
  ["publication_targets", (ph) => `item_id IN (${ph})`],
  ["recording_sessions", (ph) => `item_id IN (${ph})`],
];

function add(snap: Snapshot, table: string, rows: Row[]) {
  if (rows.length) (snap.tables[table] ??= []).push(...rows);
}

async function collectItems(snap: Snapshot, itemIds: string[]) {
  const ids = [...new Set(itemIds)];
  for (let i = 0; i < ids.length; i += 400) {
    const chunk = ids.slice(i, i + 400);
    const ph = placeholders(chunk.length);
    for (const [table, where] of ITEM_DEPENDENTS) add(snap, table, await all(`SELECT * FROM ${table} WHERE ${where(ph)}`, ...chunk));
    const revs = await all<{ id: string; revision_of_id: string }>(
      `SELECT id, revision_of_id FROM items WHERE revision_of_id IN (${ph}) AND id NOT IN (${ph})`,
      ...chunk,
      ...chunk,
    );
    if (revs.length) (snap.relink ??= {}).revisions = [...(snap.relink?.revisions ?? []), ...revs];
  }
}

// Items placed in a grade, subject, unit or lesson: their primary placement or their lesson is there.
async function itemsUnder(where: { gradeId?: string; subjectId?: string; unitIds?: string[]; lessonIds?: string[] }) {
  const out = new Set<string>();
  if (where.gradeId || where.subjectId) {
    const col = where.gradeId ? "grade_id" : "subject_id";
    for (const r of await all<{ item_id: string }>(`SELECT item_id FROM item_memberships WHERE ${col} = ? AND is_primary = 1`, where.gradeId ?? where.subjectId ?? ""))
      out.add(r.item_id);
  }
  const units = where.unitIds ?? [];
  if (units.length) {
    const ph = placeholders(units.length);
    for (const r of await all<{ item_id: string }>(`SELECT item_id FROM item_memberships WHERE unit_id IN (${ph}) AND is_primary = 1`, ...units)) out.add(r.item_id);
    for (const r of await all<{ id: string }>(`SELECT id FROM items WHERE lesson_id IN (SELECT id FROM lessons WHERE unit_id IN (${ph}))`, ...units)) out.add(r.id);
  }
  const lessons = where.lessonIds ?? [];
  if (lessons.length) for (const r of await all<{ id: string }>(`SELECT id FROM items WHERE lesson_id IN (${placeholders(lessons.length)})`, ...lessons)) out.add(r.id);
  return [...out];
}

async function collect(entity: TrashEntity, id: string, extraItemIds: string[] = []): Promise<Snapshot> {
  const snap: Snapshot = { tables: {} };
  if (entity === "item" || entity === "batch") {
    await collectItems(snap, entity === "item" ? [id] : extraItemIds);
    return snap;
  }
  if (entity === "lesson") {
    add(snap, "lessons", await all("SELECT * FROM lessons WHERE id = ?", id));
    await collectItems(snap, await itemsUnder({ lessonIds: [id] }));
    return snap;
  }
  let unitIds: string[];
  if (entity === "unit") {
    unitIds = [id];
  } else {
    const col = entity === "grade" ? "grade_id" : "subject_id";
    add(snap, entity === "grade" ? "grades" : "subjects", await all(`SELECT * FROM ${entity === "grade" ? "grades" : "subjects"} WHERE id = ?`, id));
    add(snap, "grade_subjects", await all(`SELECT * FROM grade_subjects WHERE ${col} = ?`, id));
    unitIds = (await all<{ id: string }>(`SELECT id FROM units WHERE ${col} = ?`, id)).map((u) => u.id);
  }
  if (unitIds.length) {
    const ph = placeholders(unitIds.length);
    add(snap, "units", await all(`SELECT * FROM units WHERE id IN (${ph})`, ...unitIds));
    add(snap, "lessons", await all(`SELECT * FROM lessons WHERE unit_id IN (${ph})`, ...unitIds));
  }
  const itemIds = await itemsUnder({ gradeId: entity === "grade" ? id : undefined, subjectId: entity === "subject" ? id : undefined, unitIds });
  await collectItems(snap, itemIds);
  // Secondary placements of other items: removed with a grade or subject, unlinked from a unit.
  if (entity === "grade" || entity === "subject") {
    const col = entity === "grade" ? "grade_id" : "subject_id";
    const ph = itemIds.length ? placeholders(itemIds.length) : null;
    add(snap, "item_memberships", await all(`SELECT * FROM item_memberships WHERE ${col} = ?${ph ? ` AND item_id NOT IN (${ph})` : ""}`, id, ...itemIds));
  } else if (unitIds.length) {
    const ph = placeholders(unitIds.length);
    const kept = await all<{ item_id: string; grade_id: string; subject_id: string; unit_id: string }>(
      `SELECT item_id, grade_id, subject_id, unit_id FROM item_memberships WHERE unit_id IN (${ph})${itemIds.length ? ` AND item_id NOT IN (${placeholders(itemIds.length)})` : ""}`,
      ...unitIds,
      ...itemIds,
    );
    if (kept.length) (snap.relink ??= {}).memberships = kept;
  }
  return snap;
}

function countRows(snap: Snapshot) {
  return Object.values(snap.tables).reduce((n, rows) => n + rows.length, 0);
}

// Deletes the snapshot's rows, children first.
async function removeRows(snap: Snapshot) {
  if (snap.relink?.revisions?.length) {
    const ids = snap.relink.revisions.map((r) => r.id);
    await run(`UPDATE items SET revision_of_id = NULL WHERE id IN (${placeholders(ids.length)})`, ...ids);
  }
  // Removing items, lessons, units, grades and subjects cascades to the rest; memberships of kept items go explicitly.
  const order = ["item_memberships", "items", "lessons", "units", "grade_subjects", "grades", "subjects"];
  for (const table of order) {
    const rows = snap.tables[table];
    if (!rows?.length) continue;
    if (table === "item_memberships" || table === "grade_subjects") {
      const [a, b] = table === "item_memberships" ? ["item_id", "grade_id"] : ["grade_id", "subject_id"];
      const c = table === "item_memberships" ? "subject_id" : null;
      for (const r of rows)
        await run(`DELETE FROM ${table} WHERE ${a} = ? AND ${b} = ?${c ? ` AND ${c} = ?` : ""}`, r[a] as string, r[b] as string, ...(c ? [r[c] as string] : []));
      continue;
    }
    for (let i = 0; i < rows.length; i += 400) {
      const ids = rows.slice(i, i + 400).map((r) => r.id as string);
      await run(`DELETE FROM ${table} WHERE id IN (${placeholders(ids.length)})`, ...ids);
    }
  }
}

export type TrashPreview = { entity: TrashEntity; id: string; label: string; counts: Record<string, number> };

async function describe(entity: TrashEntity, id: string): Promise<{ label: string; detail: string | null }> {
  switch (entity) {
    case "item": {
      const r = await get<{ code: string; title: string }>("SELECT code, title FROM items WHERE id = ?", id);
      return { label: r ? `${r.code} ${r.title}` : id, detail: "Production item" };
    }
    case "lesson": {
      const r = await get<{ number: number; title: string; unit: string }>("SELECT l.number, l.title, u.title AS unit FROM lessons l JOIN units u ON u.id = l.unit_id WHERE l.id = ?", id);
      return { label: r ? `Part ${r.number}: ${r.title}` : id, detail: r ? `Unit ${r.unit}` : null };
    }
    case "unit": {
      const r = await get<{ number: number; title: string; g: string; s: string }>(
        "SELECT u.number, u.title, g.name AS g, s.name AS s FROM units u JOIN grades g ON g.id = u.grade_id JOIN subjects s ON s.id = u.subject_id WHERE u.id = ?",
        id,
      );
      return { label: r ? `Unit ${r.number}: ${r.title}` : id, detail: r ? `${r.g} / ${r.s}` : null };
    }
    case "grade":
    case "subject": {
      const r = await get<{ code: string; name: string }>(`SELECT code, name FROM ${entity === "grade" ? "grades" : "subjects"} WHERE id = ?`, id);
      return { label: r ? `${r.name} (${r.code})` : id, detail: entity === "grade" ? "Grade" : "Subject" };
    }
    case "batch": {
      const r = await get<{ file_name: string | null; kind: string; created_at: string }>("SELECT file_name, kind, created_at FROM jobs WHERE id = ?", id);
      return { label: r ? `Import ${r.file_name ?? r.kind}` : `Import ${id}`, detail: r ? `Items created by the ${r.kind} import of ${r.created_at.slice(0, 10)}` : null };
    }
  }
}

export async function previewTrash(entity: TrashEntity, id: string): Promise<TrashPreview> {
  const snap = await collect(entity, id, entity === "batch" ? await batchItemIds(id) : []);
  const { label } = await describe(entity, id);
  return { entity, id, label, counts: Object.fromEntries(Object.entries(snap.tables).map(([t, r]) => [t, r.length])) };
}

async function batchItemIds(jobId: string) {
  return (await all<{ id: string }>("SELECT id FROM items WHERE import_batch_id = ?", jobId)).map((r) => r.id);
}

export async function moveToTrash(ctx: Ctx, entity: TrashEntity, id: string, reason?: string | null) {
  return await tx(async () => {
    const { label, detail } = await describe(entity, id);
    const snap = await collect(entity, id, entity === "batch" ? await batchItemIds(id) : []);
    const rows = countRows(snap);
    if (!rows) throw new WorkflowError("NOT_FOUND", `${label} has nothing to delete.`);
    await removeRows(snap);
    const trashId = uid("tr_");
    await run(
      "INSERT INTO trash (id, entity, entity_id, label, detail, snapshot, row_count, reason, deleted_by, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      trashId,
      entity,
      id,
      label,
      detail,
      JSON.stringify(snap),
      rows,
      reason?.trim() || null,
      ctx.actor?.id ?? null,
      nowIso(),
    );
    await audit(ctx, {
      itemId: entity === "item" ? id : null,
      action: "trash.deleted",
      summary: `${ctx.actor?.name ?? "System"} moved ${entity} ${label} to trash (${rows} rows)`,
      reason: reason ?? null,
    });
    return { trashId, rows };
  });
}

// Unique keys a restore could collide with if something new took the same code or number meanwhile.
async function conflicts(snap: Snapshot): Promise<string[]> {
  const out: string[] = [];
  for (const r of snap.tables.items ?? []) {
    const hit = await get<{ id: string }>("SELECT id FROM items WHERE code = ?", r.code as string);
    if (hit && hit.id !== r.id) out.push(`Item code ${r.code} is now used by another item`);
  }
  for (const t of ["grades", "subjects"] as const)
    for (const r of snap.tables[t] ?? []) {
      const hit = await get<{ id: string }>(`SELECT id FROM ${t} WHERE code = ?`, r.code as string);
      if (hit && hit.id !== r.id) out.push(`${t === "grades" ? "Grade" : "Subject"} code ${r.code} is now used`);
    }
  for (const r of snap.tables.units ?? []) {
    const hit = await get<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", r.grade_id as string, r.subject_id as string, r.number as number);
    if (hit && hit.id !== r.id) out.push(`Unit ${r.number} (${r.title}) now exists again in its grade and subject`);
  }
  for (const r of snap.tables.lessons ?? []) {
    const hit = await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", r.unit_id as string, r.number as number);
    if (hit && hit.id !== r.id) out.push(`Part ${r.number} (${r.title}) now exists again in its unit`);
  }
  return out;
}

export async function restoreFromTrash(ctx: Ctx, trashId: string) {
  return await tx(async () => {
    const entry = await get<{ id: string; entity: string; entity_id: string; label: string; snapshot: string }>("SELECT * FROM trash WHERE id = ?", trashId);
    if (!entry) throw new WorkflowError("NOT_FOUND", "That trash entry no longer exists.");
    const snap = parseJson<Snapshot>(entry.snapshot, { tables: {} });
    const clash = await conflicts(snap);
    if (clash.length) throw new WorkflowError("VALIDATION", `Cannot restore: ${clash.slice(0, 5).join("; ")}. Rename or move the new record first.`);
    const order = [...TABLES].filter((t) => snap.tables[t]?.length);
    for (const table of order) {
      for (const row of snap.tables[table]) {
        const cols = Object.keys(row);
        try {
          await run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${placeholders(cols.length)}) ON CONFLICT DO NOTHING`, ...cols.map((c) => row[c] as string | number | null));
        } catch (err) {
          throw new WorkflowError(
            "INVALID_STATE",
            `Cannot restore ${entry.label}: a record it belongs to is missing (${table}). Restore its grade, subject, unit or part first. ${err instanceof Error ? err.message : ""}`.trim(),
          );
        }
      }
    }
    for (const m of snap.relink?.memberships ?? [])
      await run("UPDATE item_memberships SET unit_id = ? WHERE item_id = ? AND grade_id = ? AND subject_id = ? AND unit_id IS NULL", m.unit_id, m.item_id, m.grade_id, m.subject_id);
    for (const r of snap.relink?.revisions ?? []) await run("UPDATE items SET revision_of_id = ? WHERE id = ? AND revision_of_id IS NULL", r.revision_of_id, r.id);
    await run("DELETE FROM trash WHERE id = ?", trashId);
    await audit(ctx, {
      itemId: entry.entity === "item" ? entry.entity_id : null,
      action: "trash.restored",
      summary: `${ctx.actor?.name ?? "System"} restored ${entry.entity} ${entry.label} from trash`,
    });
    return { restored: countRows(snap) };
  });
}

export async function purgeTrash(ctx: Ctx, ids: string[] | "expired") {
  if (ids === "expired") {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 864e5).toISOString();
    return (await run("DELETE FROM trash WHERE deleted_at < ?", cutoff)).changes;
  }
  if (!ids.length) return 0;
  const n = (await run(`DELETE FROM trash WHERE id IN (${placeholders(ids.length)})`, ...ids)).changes;
  await audit(ctx, { action: "trash.purged", summary: `${ctx.actor?.name ?? "System"} permanently deleted ${n} trash entries` });
  return n;
}

export type TrashRow = { id: string; entity: TrashEntity; entity_id: string; label: string; detail: string | null; row_count: number; reason: string | null; deleted_by: string | null; deleted_by_name: string | null; deleted_at: string };

export async function listTrash(): Promise<TrashRow[]> {
  return await all<TrashRow>(
    `SELECT t.id, t.entity, t.entity_id, t.label, t.detail, t.row_count, t.reason, t.deleted_by, u.name AS deleted_by_name, t.deleted_at
     FROM trash t LEFT JOIN users u ON u.id = t.deleted_by ORDER BY t.deleted_at DESC LIMIT 1000`,
  );
}
