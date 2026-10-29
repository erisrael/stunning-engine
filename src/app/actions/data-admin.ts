"use server";

import { requireCapability, requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { all } from "@/server/db";
import { wrap } from "@/server/action-result";
import { fillRecords, fixHealthIssue, mergeRecords, moveRecords, recodeItem, renameRecords, RECORD_ENTITIES, type MoveTarget, type RecordEntity } from "@/server/data-admin";
import { moveToTrash, previewTrash, purgeTrash, restoreFromTrash, type TrashEntity } from "@/server/trash";
import { WorkflowError, type Ctx } from "@/server/workflow";
import { overrideStatus } from "@/server/status-override";
import type { Stage } from "@/lib/domain";

// Every data-manager action needs "Empty, import and back up workspace data" (data.manage).
async function ctx(): Promise<Ctx> {
  const viewer = await requireCapability("data.manage");
  return { actor: viewer, source: "bulk" };
}

// Renaming and filling items is planning work, so items.plan is enough for those two.
async function planCtx(entity: RecordEntity): Promise<Ctx> {
  if (entity !== "items") return ctx();
  const viewer = await requireViewer();
  if (!can(viewer, "items.plan") && !can(viewer, "data.manage")) throw new WorkflowError("FORBIDDEN", "You do not have permission to edit item planning fields.");
  return { actor: viewer, source: "bulk" };
}

function entityOf(entity: string): RecordEntity {
  if (!(RECORD_ENTITIES as readonly string[]).includes(entity)) throw new WorkflowError("VALIDATION", "Unknown record type.");
  return entity as RecordEntity;
}

const SINGULAR: Record<RecordEntity, TrashEntity> = { items: "item", lessons: "lesson", units: "unit", subjects: "subject", grades: "grade" };

export async function renameRecordsAction(entity: RecordEntity, field: "title" | "title_am", changes: { id: string; value: string }[]) {
  return wrap(async () => renameRecords(await planCtx(entityOf(entity)), entityOf(entity), field === "title_am" ? "title_am" : "title", changes));
}

export async function fillRecordsAction(entity: RecordEntity, ids: string[], field: string, value: string | number | boolean | null) {
  return wrap(async () => fillRecords(await planCtx(entityOf(entity)), entityOf(entity), ids, field, value));
}

export async function moveRecordsAction(entity: RecordEntity, ids: string[], target: MoveTarget) {
  return wrap(async () => moveRecords(await ctx(), entityOf(entity), ids, target));
}

export async function mergeRecordsAction(entity: "grades" | "subjects", sourceIds: string[], targetId: string) {
  return wrap(async () => {
    if (entity !== "grades" && entity !== "subjects") throw new WorkflowError("VALIDATION", "Only grades and subjects can be merged.");
    return mergeRecords(await ctx(), entity, sourceIds, targetId);
  });
}

export async function recodeItemsAction(ids: string[]) {
  return wrap(async () => {
    const c = await ctx();
    let changed = 0;
    for (const id of ids.slice(0, 2000)) {
      const before = await recodeItem(c, id);
      if (before) changed++;
    }
    return { changed };
  });
}

export async function previewTrashAction(entity: RecordEntity | "batch", id: string) {
  return wrap(async () => {
    await ctx();
    return previewTrash(entity === "batch" ? "batch" : SINGULAR[entityOf(entity)], id);
  }, { revalidate: false });
}

export async function trashRecordsAction(entity: RecordEntity | "batch", ids: string[], reason?: string) {
  return wrap(async () => {
    const c = await ctx();
    const kind: TrashEntity = entity === "batch" ? "batch" : SINGULAR[entityOf(entity)];
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids.slice(0, 2000)) {
      try {
        await moveToTrash(c, kind, id, reason);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  });
}

export async function restoreTrashAction(ids: string[]) {
  return wrap(async () => {
    const c = await ctx();
    const results: { id: string; ok: boolean; error?: string }[] = [];
    for (const id of ids) {
      try {
        await restoreFromTrash(c, id);
        results.push({ id, ok: true });
      } catch (err) {
        results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    }
    return results;
  });
}

export async function purgeTrashAction(ids: string[]) {
  return wrap(async () => purgeTrash(await ctx(), ids));
}

export async function fixHealthAction(key: string, ids: string[]) {
  return wrap(async () => fixHealthIssue(await ctx(), key, ids));
}

export async function lessonsForUnitAction(unitId: string) {
  return wrap(async () => {
    await ctx();
    return all<{ id: string; number: number; title: string }>("SELECT id, number, title FROM lessons WHERE unit_id = ? ORDER BY number", unitId);
  }, { revalidate: false });
}

// Bulk status change with a required reason; rights are checked per stage (see status-override.ts).
export async function overrideStatusAction(ids: string[], input: { stage: Stage; value: string; reason: string }, dryRun = false) {
  return wrap(async () => overrideStatus(await requireViewer(), ids, input, dryRun), { revalidate: !dryRun });
}
