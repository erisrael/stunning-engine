import { all, get, nowIso, run, tx, uid, parseJson } from "./db";
import { getSettings, rulesFor } from "./settings";
import { handoverStatuses } from "@/lib/team-rules";
import { can, canViewItem, hasRole, isLeadOf, isManager, type AppUser } from "./users";
import { managers, notify, roleUsersForItem, teamLeads } from "./notifications";
import {
  BLOCKER_CAUSE_LABELS,
  NEXT_STAGE,
  RETURN_REASON_LABELS,
  STAGE_LABELS,
  STAGES,
  STATUS_LABELS,
  stageIndex,
  type AssetKind,
  type Capability,
  type AttemptStatus,
  type Stage,
} from "@/lib/domain";

// ---------------------------------------------------------------------------
// Context, errors and row types
// ---------------------------------------------------------------------------

export type Ctx = {
  actor: AppUser | null; // null means the system or an integration
  now?: string;
  requestId?: string;
  jobId?: string;
  source?: "ui" | "sheet" | "board" | "bulk" | "import" | "seed" | "system";
  silent?: boolean; // suppress notifications (used for historical migration)
};

export type WorkflowErrorCode =
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "REQUIREMENTS_MISSING"
  | "CONFLICT"
  | "ACTIVE_SESSION_ELSEWHERE"
  | "VALIDATION";

export class WorkflowError extends Error {
  constructor(
    public code: WorkflowErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export type ItemRow = {
  id: string;
  code: string;
  lesson_id: string | null;
  deliverable_type: string;
  title: string;
  title_am: string | null;
  objectives: string | null;
  language: string;
  content_type: string;
  teacher: string | null;
  target_duration_min: number | null;
  actual_duration_min: number | null;
  complexity: string;
  complexity_note: string | null;
  priority: string;
  tags: string;
  lifecycle: string;
  stage: Stage | null;
  stage_status: AttemptStatus | null;
  substate: string | null;
  current_attempt_id: string | null;
  next_action: string | null;
  next_action_owner_id: string | null;
  planned_publish_at: string | null;
  original_due_at: string | null;
  current_due_at: string | null;
  scheduled_publish_at: string | null;
  published_at: string | null;
  publication_verified_at: string | null;
  live_url: string | null;
  provenance: string;
  exclude_from_metrics: number;
  import_batch_id: string | null;
  source_reference: string | null;
  revision_of_id: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
  released_at: string | null;
  updated_at: string;
  version: number;
};

export type AttemptRow = {
  id: string;
  item_id: string;
  stage: Stage;
  attempt_no: number;
  cause: string;
  cause_note: string | null;
  status: AttemptStatus;
  substate: string | null;
  owner_id: string | null;
  entered_at: string;
  first_started_at: string | null;
  handoff_submitted_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
  held: number;
  raw_duration_min: number | null;
  notes: string | null;
};

export type TargetRow = {
  id: string;
  item_id: string;
  platform: string;
  required: number;
  upload_status: string;
  external_id: string | null;
  upload_url: string | null;
  uploaded_asset_id: string | null;
  playback_checked: number;
  metadata_checked: number;
  release_status: string;
  scheduled_at: string | null;
  live_url: string | null;
  published_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  failure_reason: string | null;
  retry_count: number;
};

const CLOSED: AttemptStatus[] = ["completed", "returned", "superseded"];

const INTERVAL_FOR: Partial<Record<AttemptStatus, string>> = {
  queued: "queued",
  in_progress: "active",
  paused: "paused",
  blocked: "blocked",
  finished: "finished",
  lead_review: "review",
  ready: "ready",
  awaiting_handoff: "handoff",
};

function at(ctx: Ctx) {
  return ctx.now ?? nowIso();
}

function actorId(ctx: Ctx) {
  return ctx.actor?.id ?? null;
}

function actorName(ctx: Ctx) {
  return ctx.actor?.name ?? "System";
}

// ---------------------------------------------------------------------------
// Loading helpers
// ---------------------------------------------------------------------------

export async function getItem(itemId: string): Promise<ItemRow> {
  const item = await get<ItemRow>("SELECT * FROM items WHERE id = ?", itemId);
  if (!item) throw new WorkflowError("NOT_FOUND", "This item no longer exists.");
  return item;
}

export async function currentAttempt(itemId: string): Promise<AttemptRow | null> {
  return (
    await get<AttemptRow>(
            `SELECT * FROM stage_attempts WHERE item_id = ? AND status NOT IN ('completed','returned','superseded')
       ORDER BY entered_at DESC LIMIT 1`,
            itemId,
          ) ?? null
  );
}

export async function requireAttempt(itemId: string, stage?: Stage): Promise<AttemptRow> {
  const attempt = await currentAttempt(itemId);
  if (!attempt) throw new WorkflowError("INVALID_STATE", "This item has no open stage.");
  if (stage && attempt.stage !== stage)
    throw new WorkflowError(
      "INVALID_STATE",
      `This item is in ${STAGE_LABELS[attempt.stage]}, not ${STAGE_LABELS[stage]}. Refresh to see the latest state.`,
    );
  return attempt;
}

export async function targets(itemId: string): Promise<TargetRow[]> {
  return await all<TargetRow>("SELECT * FROM publication_targets WHERE item_id = ? ORDER BY required DESC, platform", itemId);
}

async function stageOwner(itemId: string, stage: Stage): Promise<string | null> {
  return (await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = ?", itemId, stage))
    ?.user_id ?? null;
}

async function userName(id: string | null) {
  if (!id) return "Unassigned";
  return (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id))?.name ?? "Unknown user";
}

async function isCollaborator(itemId: string, userId: string) {
  return !!await get("SELECT 1 AS x FROM item_collaborators WHERE item_id = ? AND user_id = ?", itemId, userId);
}

// ---------------------------------------------------------------------------
// Audit, intervals and projections
// ---------------------------------------------------------------------------

export async function audit(
  ctx: Ctx,
  e: {
    itemId?: string | null;
    attemptId?: string | null;
    stage?: string | null;
    action: string;
    summary: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
    sourceOccurredAt?: string | null;
    correctsEventId?: string | null;
  },
) {
  await run(
        `INSERT INTO audit_events (id, item_id, attempt_id, stage, actor_id, actor_kind, action, summary, old_value, new_value,
       reason, request_id, job_id, occurred_at, source_occurred_at, corrects_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        uid("ev_"),
        e.itemId ?? null,
        e.attemptId ?? null,
        e.stage ?? null,
        actorId(ctx),
        ctx.actor ? (ctx.source === "import" ? "import" : "user") : "system",
        e.action,
        e.summary,
        e.oldValue === undefined ? null : JSON.stringify(e.oldValue),
        e.newValue === undefined ? null : JSON.stringify(e.newValue),
        e.reason ?? null,
        ctx.requestId ?? null,
        ctx.jobId ?? null,
        at(ctx),
        e.sourceOccurredAt ?? null,
        e.correctsEventId ?? null,
      );
}

async function closeInterval(attemptId: string, now: string) {
  await run("UPDATE stage_intervals SET ended_at = ? WHERE attempt_id = ? AND ended_at IS NULL", now, attemptId);
}

async function openInterval(attemptId: string, state: string, now: string, reason?: string | null) {
  await run(
        "INSERT INTO stage_intervals (attempt_id, state, started_at, reason) VALUES (?, ?, ?, ?)",
        attemptId,
        state,
        now,
        reason ?? null,
      );
}

export async function setAttemptStatus(attempt: AttemptRow, status: AttemptStatus, now: string, reason?: string | null) {
  if (attempt.status === status) return;
  await closeInterval(attempt.id, now);
  const state = INTERVAL_FOR[status];
  if (state) await openInterval(attempt.id, state, now, reason);
  await run(
        `UPDATE stage_attempts SET status = ?, closed_at = CASE WHEN ? = 1 THEN ? ELSE closed_at END WHERE id = ?`,
        status,
        CLOSED.includes(status) ? 1 : 0,
        now,
        attempt.id,
      );
  attempt.status = status;
}

async function openSessions(attemptId: string) {
  return await all<{ id: string; user_id: string; started_at: string }>(
      "SELECT id, user_id, started_at FROM work_sessions WHERE attempt_id = ? AND ended_at IS NULL",
      attemptId,
    );
}

export async function endSessions(attemptId: string, now: string, reason: string, userId?: string) {
  if (userId)
    await run(
            "UPDATE work_sessions SET ended_at = ?, end_reason = ? WHERE attempt_id = ? AND user_id = ? AND ended_at IS NULL",
            now,
            reason,
            attemptId,
            userId,
          );
  else
    await run("UPDATE work_sessions SET ended_at = ?, end_reason = ? WHERE attempt_id = ? AND ended_at IS NULL", now, reason, attemptId);
}

async function nextActionFor(item: ItemRow, attempt: AttemptRow | null): Promise<{ text: string | null; owner: string | null }> {
  if (item.lifecycle === "draft") return { text: "Start recording", owner: await stageOwner(item.id, "recording") };
  if (item.lifecycle === "published") return { text: null, owner: null };
  if (item.lifecycle === "archived" || item.lifecycle === "cancelled") return { text: null, owner: null };
  if (!attempt) return { text: null, owner: null };
  const label = STAGE_LABELS[attempt.stage];
  if (!attempt.owner_id && attempt.status === "queued") return { text: `Assign a ${label.toLowerCase()} owner`, owner: null };
  if (attempt.stage === "publication") {
    switch (attempt.substate) {
      case "changes_requested":
        return { text: "Resolve requested changes", owner: attempt.owner_id };
      case "ready":
        return { text: "Schedule or publish release", owner: attempt.owner_id };
      case "scheduled":
        return { text: "Confirm live release", owner: attempt.owner_id };
      case "failed":
        return { text: "Retry failed release", owner: attempt.owner_id };
    }
    if (attempt.status === "blocked")
      return { text: "Resolve blocker", owner: await blockerResolver(attempt.id) ?? attempt.owner_id };
    return { text: "Review for publication", owner: attempt.owner_id };
  }
  switch (attempt.status) {
    case "queued":
      return {
        text:
          attempt.stage === "recording"
            ? "Start recording"
            : attempt.stage === "editing"
              ? "Start editing"
              : "Start upload",
        owner: attempt.owner_id,
      };
    case "in_progress":
      return {
        text:
          attempt.stage === "recording"
            ? "Finish recording and submit raw files"
            : attempt.stage === "editing"
              ? "Submit edited master"
              : "Verify upload and hand off",
        owner: attempt.owner_id,
      };
    case "paused":
      return { text: "Resume work", owner: attempt.owner_id };
    case "blocked":
      return { text: "Resolve blocker", owner: await blockerResolver(attempt.id) ?? attempt.owner_id };
    case "finished":
      return { text: "Send to the team lead", owner: attempt.owner_id };
    case "lead_review":
      return { text: `Team lead approves ${label.toLowerCase()}`, owner: (await teamLeads(attempt.stage))[0] ?? null };
    case "ready": {
      const next = NEXT_STAGE[attempt.stage];
      return { text: next ? `Team lead hands over to ${STAGE_LABELS[next]}` : "Confirm release", owner: (await teamLeads(attempt.stage))[0] ?? null };
    }
    case "awaiting_handoff": {
      const next = NEXT_STAGE[attempt.stage];
      return {
        text: next ? `${STAGE_LABELS[next]} team lead accepts the handover` : "Confirm release",
        owner: next ? ((await teamLeads(next))[0] ?? null) : attempt.owner_id,
      };
    }
  }
  return { text: null, owner: null };
}

async function blockerResolver(attemptId: string) {
  return (
    (await get<{ resolver_id: string | null }>(
            "SELECT resolver_id FROM blockers WHERE attempt_id = ? AND resolved_at IS NULL ORDER BY opened_at DESC LIMIT 1",
            attemptId,
          ))?.resolver_id ?? null
  );
}

// Current status on the item is a projection of attempt history, refreshed after every change.
export async function syncItem(itemId: string, now: string, extra: Record<string, unknown> = {}) {
  const item = await getItem(itemId);
  const attempt = await currentAttempt(itemId);
  Object.assign(item, extra);
  const next = await nextActionFor(item, attempt);
  const sets: Record<string, unknown> = {
    stage: attempt ? attempt.stage : item.lifecycle === "published" ? "publication" : item.stage,
    stage_status: attempt ? attempt.status : item.lifecycle === "published" ? "completed" : item.stage_status,
    substate: attempt ? attempt.substate : item.lifecycle === "published" ? null : item.substate,
    current_attempt_id: attempt?.id ?? null,
    next_action: next.text,
    next_action_owner_id: next.owner,
    updated_at: now,
    ...extra,
  };
  const keys = Object.keys(sets);
  await run(
        `UPDATE items SET ${keys.map((k) => `${k} = ?`).join(", ")}, version = version + 1 WHERE id = ?`,
        ...(keys.map((k) => sets[k]) as (string | number | null)[]),
        itemId,
      );
}

function checkVersion(item: ItemRow, expectedVersion?: number) {
  if (expectedVersion !== undefined && expectedVersion !== null && item.version !== expectedVersion) {
    throw new WorkflowError("CONFLICT", "Someone else updated this item. Review the latest values and try again.", {
      currentVersion: item.version,
      stage: item.stage,
      status: item.stage_status,
      substate: item.substate,
      updatedAt: item.updated_at,
    });
  }
}

async function requireView(ctx: Ctx, itemId: string) {
  if (ctx.actor && !await canViewItem(ctx.actor, itemId))
    throw new WorkflowError("FORBIDDEN", "This item is outside your grade and subject access.");
}

function requireManagerCtx(ctx: Ctx, what: string, cap: Capability = "items.plan") {
  if (ctx.actor && !can(ctx.actor, cap)) throw new WorkflowError("FORBIDDEN", `You do not have permission to ${what}.`);
}

async function canWork(ctx: Ctx, attempt: AttemptRow) {
  const u = ctx.actor;
  if (!u) return true;
  if (isManager(u)) return true;
  if (isLeadOf(u, attempt.stage)) return true;
  if (!hasRole(u, attempt.stage)) return false;
  return !attempt.owner_id || attempt.owner_id === u.id || await isCollaborator(attempt.item_id, u.id);
}

async function requireWork(ctx: Ctx, attempt: AttemptRow) {
  if (!await canWork(ctx, attempt)) {
    const owner = await userName(attempt.owner_id);
    throw new WorkflowError(
      "FORBIDDEN",
      `Only the ${STAGE_LABELS[attempt.stage]} owner (${owner}) or a manager can update this stage.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Creation and release
// ---------------------------------------------------------------------------

export type CreateItemInput = {
  lessonId?: string | null;
  gradeId: string;
  subjectId: string;
  unitId?: string | null;
  lessonNumber?: number | null;
  lessonTitle?: string | null;
  deliverableType?: string;
  title: string;
  titleAm?: string | null;
  objectives?: string | null;
  language?: string;
  contentType?: string;
  teacher?: string | null;
  targetDurationMin?: number | null;
  complexity?: string;
  complexityNote?: string | null;
  priority?: string;
  tags?: string[];
  plannedPublishAt?: string | null;
  dueAt?: string | null;
  owners?: Partial<Record<Stage, string | null>>;
  stageDue?: Partial<Record<Stage, string | null>>;
  requiredDestinations?: string[];
  optionalDestinations?: string[];
  secondaryMemberships?: { gradeId: string; subjectId: string; unitId?: string | null }[];
  release?: boolean;
  provenance?: "live" | "imported" | "historical";
  excludeFromMetrics?: boolean;
  importBatchId?: string | null;
  sourceReference?: string | null;
  revisionOfId?: string | null;
  code?: string | null;
};

export async function buildCode(input: {
  gradeCode: string;
  subjectCode: string;
  unitNumber?: number | null;
  lessonNumber?: number | null;
  deliverableType?: string;
}) {
  const s = await getSettings();
  const suffix = s.lists.deliverableTypes.find((d) => d.key === input.deliverableType)?.codeSuffix ?? "";
  const parts = [s.workspace.codePrefix, input.gradeCode, input.subjectCode];
  if (input.unitNumber) parts.push(`U${String(input.unitNumber).padStart(2, "0")}`);
  if (input.lessonNumber) parts.push(`L${String(input.lessonNumber).padStart(2, "0")}`);
  if (suffix) parts.push(suffix);
  return parts.join("-");
}

async function uniqueCode(base: string) {
  let code = base;
  let n = 2;
  while (await get("SELECT 1 AS x FROM items WHERE code = ?", code)) code = `${base}-${n++}`;
  return code;
}

export async function createItem(ctx: Ctx, input: CreateItemInput): Promise<ItemRow> {
  return await tx(async () => {
      const now = at(ctx);
      if (ctx.actor && !can(ctx.actor, "items.create") && ctx.source !== "seed")
        throw new WorkflowError("FORBIDDEN", "You do not have permission to create items.");
      const grade = await get<{ id: string; code: string }>("SELECT id, code FROM grades WHERE id = ?", input.gradeId);
      const subject = await get<{ id: string; code: string }>("SELECT id, code FROM subjects WHERE id = ?", input.subjectId);
      if (!grade || !subject) throw new WorkflowError("VALIDATION", "Choose a valid grade and subject.");
      if (!input.title?.trim()) throw new WorkflowError("VALIDATION", "A title is required.");

      let lessonId = input.lessonId ?? null;
      let unitId = input.unitId ?? null;
      let unitNumber: number | null = null;
      let lessonNumber: number | null = input.lessonNumber ?? null;
      if (lessonId) {
        const lesson = await get<{ unit_id: string; number: number }>("SELECT unit_id, number FROM lessons WHERE id = ?", lessonId);
        if (!lesson) throw new WorkflowError("VALIDATION", "The selected lesson does not exist.");
        unitId = lesson.unit_id;
        lessonNumber = lesson.number;
      } else if (unitId && lessonNumber) {
        const existing = await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", unitId, lessonNumber);
        if (existing) lessonId = existing.id;
        else {
          lessonId = uid("les_");
          await run(
                      "INSERT INTO lessons (id, unit_id, number, title, title_am, objectives, language, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                      lessonId,
                      unitId,
                      lessonNumber,
                      input.lessonTitle || input.title,
                      input.titleAm ?? null,
                      input.objectives ?? null,
                      input.language ?? "en",
                      now,
                    );
        }
      }
      if (unitId) {
        const unit = await get<{ number: number; grade_id: string; subject_id: string }>(
                "SELECT number, grade_id, subject_id FROM units WHERE id = ?",
                unitId,
              );
        if (!unit) throw new WorkflowError("VALIDATION", "The selected unit does not exist.");
        if (unit.grade_id !== grade.id || unit.subject_id !== subject.id)
          throw new WorkflowError("VALIDATION", "The unit does not belong to the selected grade and subject.");
        unitNumber = unit.number;
      }

      const code = await uniqueCode(
              input.code?.trim() ||
                await buildCode({
                            gradeCode: grade.code,
                            subjectCode: subject.code,
                            unitNumber,
                            lessonNumber,
                            deliverableType: input.deliverableType,
                          }),
            );
      const id = uid("itm_");
      await run(
              `INSERT INTO items (id, code, lesson_id, deliverable_type, title, title_am, objectives, language, content_type, teacher,
        target_duration_min, complexity, complexity_note, priority, tags, lifecycle, planned_publish_at, original_due_at,
        current_due_at, provenance, exclude_from_metrics, import_batch_id, source_reference, revision_of_id, created_by,
        created_at, updated_at, next_action)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Start recording')`,
              id,
              code,
              lessonId,
              input.deliverableType ?? "main_video",
              input.title.trim(),
              input.titleAm?.trim() || null,
              input.objectives ?? null,
              input.language ?? "en",
              input.contentType ?? "lesson_video",
              input.teacher ?? null,
              input.targetDurationMin ?? null,
              input.complexity ?? "standard",
              input.complexityNote ?? null,
              input.priority ?? "normal",
              JSON.stringify(input.tags ?? []),
              input.plannedPublishAt ?? null,
              input.dueAt ?? null,
              input.dueAt ?? null,
              input.provenance ?? "live",
              input.excludeFromMetrics ? 1 : 0,
              input.importBatchId ?? null,
              input.sourceReference ?? null,
              input.revisionOfId ?? null,
              actorId(ctx),
              now,
              now,
            );
      await run(
              "INSERT INTO item_memberships (item_id, grade_id, subject_id, unit_id, is_primary) VALUES (?, ?, ?, ?, 1)",
              id,
              grade.id,
              subject.id,
              unitId,
            );
      for (const m of input.secondaryMemberships ?? []) {
        if (m.gradeId === grade.id && m.subjectId === subject.id) continue;
        await run(
                  "INSERT OR IGNORE INTO item_memberships (item_id, grade_id, subject_id, unit_id, is_primary) VALUES (?, ?, ?, ?, 0)",
                  id,
                  m.gradeId,
                  m.subjectId,
                  m.unitId ?? null,
                );
      }
      for (const stage of STAGES) {
        const owner = input.owners?.[stage] ?? null;
        await run(
                  "INSERT INTO stage_assignments (item_id, stage, user_id, stage_due_at, assigned_at, assigned_by) VALUES (?, ?, ?, ?, ?, ?)",
                  id,
                  stage,
                  owner,
                  input.stageDue?.[stage] ?? null,
                  now,
                  actorId(ctx),
                );
      }
      const s = await getSettings();
      const required = input.requiredDestinations?.length
        ? input.requiredDestinations
        : s.destinations.filter((d) => d.active && d.requiredByDefault).map((d) => d.key);
      const optional = (input.optionalDestinations ?? []).filter((d) => !required.includes(d));
      for (const p of required)
        await run("INSERT INTO publication_targets (id, item_id, platform, required) VALUES (?, ?, ?, 1)", uid("pt_"), id, p);
      for (const p of optional)
        await run("INSERT INTO publication_targets (id, item_id, platform, required) VALUES (?, ?, ?, 0)", uid("pt_"), id, p);

      await audit(ctx, {
              itemId: id,
              action: "item.created",
              summary: `${actorName(ctx)} created ${code}`,
              newValue: { code, title: input.title, provenance: input.provenance ?? "live" },
            });
      if (input.release) await releaseToProduction(ctx, id);
      else await syncItem(id, now);
      return await getItem(id);
    });
}

// opts.byStart: Recording staff pressed Start on a draft; startWork checks they may work the stage.
export async function releaseToProduction(ctx: Ctx, itemId: string, startStage: Stage = "recording", opts: { byStart?: boolean } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      const item = await getItem(itemId);
      if (!opts.byStart) requireManagerCtx(ctx, "release items to production", "items.create");
      if (item.lifecycle !== "draft") throw new WorkflowError("INVALID_STATE", "Only draft items can be released.");
      await run("UPDATE items SET lifecycle = 'in_production', released_at = ? WHERE id = ?", now, itemId);
      await audit(ctx, {
              itemId,
              action: "item.released",
              summary: opts.byStart ? `${actorName(ctx)} started ${item.code}` : `${actorName(ctx)} released ${item.code} to production`,
              newValue: { startStage },
            });
      await openAttempt(ctx, itemId, startStage, "initial", null);
      await syncItem(itemId, now);
    });
}

async function openAttempt(ctx: Ctx, itemId: string, stage: Stage, cause: string, note: string | null, ownerOverride?: string | null) {
  const now = at(ctx);
  const n = ((await get<{ n: number }>("SELECT MAX(attempt_no) AS n FROM stage_attempts WHERE item_id = ? AND stage = ?", itemId, stage))?.n ?? 0) + 1;
  const owner = ownerOverride !== undefined ? ownerOverride : await stageOwner(itemId, stage);
  const id = uid("att_");
  await run(
        `INSERT INTO stage_attempts (id, item_id, stage, attempt_no, cause, cause_note, status, substate, owner_id, entered_at)
     VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?, ?)`,
        id,
        itemId,
        stage,
        n,
        cause,
        note,
        stage === "publication" ? "pending_review" : null,
        owner,
        now,
      );
  await openInterval(id, "queued", now);
  if (owner && owner !== await stageOwner(itemId, stage)) {
    await run("UPDATE stage_assignments SET user_id = ?, assigned_at = ?, assigned_by = ? WHERE item_id = ? AND stage = ?", owner, now, actorId(ctx), itemId, stage);
  }
  const item = await getItem(itemId);
  await audit(ctx, {
        itemId,
        attemptId: id,
        stage,
        action: "stage.entered",
        summary: `${STAGE_LABELS[stage]} attempt ${n} opened${cause !== "initial" ? ` (${cause})` : ""}`,
        newValue: { owner: owner ? await userName(owner) : null, cause },
        reason: note,
      });
  if (!ctx.silent) {
    const leads = await teamLeads(stage);
    if (leads.length)
      await notify(
        leads.filter((l) => l !== owner),
        {
          type: "assignment",
          title: owner ? `${item.code} entered ${STAGE_LABELS[stage]} (${await userName(owner)})` : `${item.code} is waiting for a ${STAGE_LABELS[stage]} assignee`,
          body: cause === "initial" ? item.title : `${item.title} (${cause === "returned" ? "returned for rework" : "redo requested"})`,
          link: `/items/${itemId}/form`,
          itemId,
          dedupeKey: `lead-queue:${id}`,
        },
        now,
        actorId(ctx) ?? undefined,
      );
    if (owner)
      await notify(
                [owner],
                {
                  type: "assignment",
                  title: `${item.code} is in your ${STAGE_LABELS[stage]} queue`,
                  body: cause === "initial" ? item.title : `${item.title} (${cause === "returned" ? "returned for rework" : "reopened"})`,
                  link: `/items/${itemId}`,
                  itemId,
                  dedupeKey: `queue:${id}`,
                },
                now,
                actorId(ctx) ?? undefined,
              );
    else if (!leads.length)
      await notify(
                await managers(),
                {
                  type: "assignment",
                  title: `${item.code} entered ${STAGE_LABELS[stage]} without an owner`,
                  body: "Assign an owner so the handoff does not stall.",
                  link: `/items/${itemId}`,
                  itemId,
                  dedupeKey: `unassigned:${id}`,
                },
                now,
              );
  }
  return id;
}

// ---------------------------------------------------------------------------
// Active work: start, pause, block
// ---------------------------------------------------------------------------

export async function startWork(ctx: Ctx, itemId: string, opts: { expectedVersion?: number; switchFrom?: boolean } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      let item = await getItem(itemId);
      checkVersion(item, opts.expectedVersion);
      // Drafts are started by Recording staff themselves: the item enters production and goes straight to In progress.
      if (item.lifecycle === "draft") {
        const u = ctx.actor;
        const owner = await stageOwner(itemId, "recording");
        if (u && !isManager(u) && !isLeadOf(u, "recording") && !(hasRole(u, "recording") && (!owner || owner === u.id)))
          throw new WorkflowError("FORBIDDEN", owner ? `Only ${await userName(owner)} or the Recording lead can start this item.` : "Only Recording staff can start this item.");
        await releaseToProduction(ctx, itemId, "recording", { byStart: true });
        item = await getItem(itemId);
      }
      const attempt = await requireAttempt(itemId);
      if (!["queued", "paused", "in_progress"].includes(attempt.status))
        throw new WorkflowError(
          "INVALID_STATE",
          attempt.status === "blocked"
            ? "Resolve the blocker before starting work."
            : `Work cannot start while the stage is ${STATUS_LABELS[attempt.status].toLowerCase()}.`,
        );
      await requireWork(ctx, attempt);
      const uidActor = actorId(ctx);
      if (uidActor) {
        const elsewhere = await get<{ id: string; item_id: string; attempt_id: string; code: string }>(
                `SELECT ws.id, ws.item_id, ws.attempt_id, i.code FROM work_sessions ws JOIN items i ON i.id = ws.item_id
         WHERE ws.user_id = ? AND ws.ended_at IS NULL AND ws.attempt_id <> ?`,
                uidActor,
                attempt.id,
              );
        if (elsewhere) {
          if (!opts.switchFrom && !(await getSettings()).policies.autoPauseOtherSessions)
            throw new WorkflowError(
              "ACTIVE_SESSION_ELSEWHERE",
              `You already have an active timer on ${elsewhere.code}. Pause it before starting here.`,
              { itemId: elsewhere.item_id, code: elsewhere.code },
            );
          await pauseWork({ ...ctx }, elsewhere.item_id, { reason: `Switched to ${item.code}` });
        }
        const mine = await get("SELECT 1 AS x FROM work_sessions WHERE attempt_id = ? AND user_id = ? AND ended_at IS NULL", attempt.id, uidActor);
        if (mine) return;
        // The team's limit on work in progress per person.
        const limit = (await rulesFor(attempt.stage)).wipLimit;
        if (limit > 0 && attempt.status === "queued") {
          // Started and not yet marked done: in progress, paused or blocked. Resuming is always allowed.
          const open = await get<{ c: number }>(
            "SELECT COUNT(*) AS c FROM stage_attempts a JOIN items i ON i.current_attempt_id = a.id WHERE a.stage = ? AND a.owner_id = ? AND a.status IN ('in_progress','paused','blocked') AND a.id <> ?",
            attempt.stage,
            uidActor,
            attempt.id,
          );
          if (Number(open?.c ?? 0) >= limit)
            throw new WorkflowError("INVALID_STATE", `${STAGE_LABELS[attempt.stage]} works on at most ${limit} ${limit === 1 ? "part" : "parts"} at a time. Mark one you started done first.`);
        }
        if (!attempt.owner_id && ctx.actor && hasRole(ctx.actor, attempt.stage)) {
          await run("UPDATE stage_attempts SET owner_id = ? WHERE id = ?", uidActor, attempt.id);
          await run("UPDATE stage_assignments SET user_id = ?, assigned_at = ?, assigned_by = ? WHERE item_id = ? AND stage = ?", uidActor, now, uidActor, itemId, attempt.stage);
          await audit(ctx, {
                        itemId,
                        attemptId: attempt.id,
                        stage: attempt.stage,
                        action: "assignment.claimed",
                        summary: `${actorName(ctx)} claimed the unassigned ${STAGE_LABELS[attempt.stage]} stage`,
                        oldValue: null,
                        newValue: ctx.actor?.name,
                      });
          attempt.owner_id = uidActor;
        } else if (attempt.owner_id && attempt.owner_id !== uidActor && !await isCollaborator(itemId, uidActor)) {
          await run("INSERT OR IGNORE INTO item_collaborators (item_id, user_id, stage) VALUES (?, ?, ?)", itemId, uidActor, attempt.stage);
        }
        await run(
                  "INSERT INTO work_sessions (id, attempt_id, item_id, user_id, started_at) VALUES (?, ?, ?, ?, ?)",
                  uid("ws_"),
                  attempt.id,
                  itemId,
                  uidActor,
                  now,
                );
      }
      const wasStatus = attempt.status;
      if (!attempt.first_started_at) await run("UPDATE stage_attempts SET first_started_at = ? WHERE id = ?", now, attempt.id);
      if (attempt.stage === "uploading" && !attempt.substate)
        await run("UPDATE stage_attempts SET substate = 'uploading' WHERE id = ?", attempt.id);
      await setAttemptStatus(attempt, "in_progress", now);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: wasStatus === "paused" ? "work.resumed" : "work.started",
              summary: `${actorName(ctx)} ${wasStatus === "paused" ? "resumed" : "started"} ${STAGE_LABELS[attempt.stage].toLowerCase()}`,
              oldValue: wasStatus,
              newValue: "in_progress",
            });
      await syncItem(itemId, now);
    });
}

export async function pauseWork(ctx: Ctx, itemId: string, opts: { reason?: string; expectedVersion?: number; endAll?: boolean } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, opts.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (attempt.status !== "in_progress") throw new WorkflowError("INVALID_STATE", "Only active work can be paused.");
      await requireWork(ctx, attempt);
      if (opts.endAll || !ctx.actor) await endSessions(attempt.id, now, "paused");
      else await endSessions(attempt.id, now, "paused", ctx.actor.id);
      const remaining = await openSessions(attempt.id);
      if (remaining.length === 0) await setAttemptStatus(attempt, "paused", now, opts.reason ?? null);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "work.paused",
              summary: `${actorName(ctx)} paused ${STAGE_LABELS[attempt.stage].toLowerCase()}${remaining.length ? " (others still working)" : ""}`,
              reason: opts.reason ?? null,
            });
      await syncItem(itemId, now);
    });
}

export async function blockWork(
  ctx: Ctx,
  itemId: string,
  input: { cause: string; note?: string | null; resolverId?: string | null; expectedVersion?: number },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (!["queued", "in_progress", "paused"].includes(attempt.status))
        throw new WorkflowError("INVALID_STATE", "Only queued, active or paused work can be marked blocked.");
      await requireWork(ctx, attempt);
      if (!input.cause) throw new WorkflowError("VALIDATION", "Choose a blocker cause.");
      await endSessions(attempt.id, now, "blocked");
      const id = uid("blk_");
      await run(
              "INSERT INTO blockers (id, attempt_id, item_id, cause, note, resolver_id, opened_by, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
              id,
              attempt.id,
              itemId,
              input.cause,
              input.note ?? null,
              input.resolverId ?? null,
              actorId(ctx),
              now,
            );
      await setAttemptStatus(attempt, "blocked", now, BLOCKER_CAUSE_LABELS[input.cause] ?? input.cause);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "work.blocked",
              summary: `${actorName(ctx)} marked ${STAGE_LABELS[attempt.stage].toLowerCase()} blocked: ${BLOCKER_CAUSE_LABELS[input.cause] ?? input.cause}`,
              newValue: { cause: input.cause, resolver: input.resolverId ? await userName(input.resolverId) : null },
              reason: input.note ?? null,
            });
      if (!ctx.silent)
        await notify(
                  [input.resolverId, ...await managers()],
                  {
                    type: "blocker",
                    title: `${item.code} is blocked in ${STAGE_LABELS[attempt.stage]}`,
                    body: `${BLOCKER_CAUSE_LABELS[input.cause] ?? input.cause}${input.note ? `: ${input.note}` : ""}`,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `blocked:${id}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      await syncItem(itemId, now);
    });
}

export async function unblockWork(ctx: Ctx, itemId: string, input: { resolution?: string | null; resume?: boolean; expectedVersion?: number } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (attempt.status !== "blocked") throw new WorkflowError("INVALID_STATE", "This stage is not blocked.");
      const resolver = await blockerResolver(attempt.id);
      const allowed = !ctx.actor || await canWork(ctx, attempt) || resolver === ctx.actor.id;
      if (!allowed) throw new WorkflowError("FORBIDDEN", "Only the stage owner, the named resolver or a manager can clear this blocker.");
      await run(
              "UPDATE blockers SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE attempt_id = ? AND resolved_at IS NULL",
              now,
              actorId(ctx),
              input.resolution ?? null,
              attempt.id,
            );
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "work.unblocked",
              summary: `${actorName(ctx)} cleared the blocker`,
              reason: input.resolution ?? null,
            });
      const resumeNow = input.resume !== false && await canWork(ctx, attempt) && !!ctx.actor;
      await setAttemptStatus(attempt, attempt.first_started_at ? "paused" : "queued", now, "Blocker cleared");
      await syncItem(itemId, now);
      if (resumeNow) await startWork({ ...ctx }, itemId, { switchFrom: true });
      else if (!ctx.silent && attempt.owner_id)
        await notify(
                  [attempt.owner_id],
                  {
                    type: "blocker",
                    title: `Blocker cleared on ${item.code}`,
                    body: input.resolution ?? "You can resume work.",
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `unblocked:${attempt.id}:${now}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
    });
}

// ---------------------------------------------------------------------------
// Evidence: assets, checklists, durations
// ---------------------------------------------------------------------------

const ASSET_STAGE: Record<AssetKind, Stage> = {
  raw: "recording",
  take_notes: "recording",
  master: "editing",
  captions: "editing",
  thumbnail: "editing",
  transcript: "editing",
  document: "editing",
};

export async function addAsset(
  ctx: Ctx,
  itemId: string,
  input: {
    kind: AssetKind;
    url?: string | null;
    cameraCode?: string | null;
    label?: string | null;
    durationMin?: number | null;
    notes?: string | null;
    sourceRef?: string | null;
  },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      const stage = ASSET_STAGE[input.kind];
      const url = input.url?.trim() || null;
      const cameraCode = input.cameraCode?.trim() || null;
      // Recordings are identified by camera code; every other file needs a storage link.
      if (input.kind === "raw" || input.kind === "take_notes") {
        if (!url && !cameraCode) throw new WorkflowError("VALIDATION", "Enter the camera code(s) or a storage link for the recording.");
      } else if (!url) throw new WorkflowError("VALIDATION", "Provide a storage link for the file.");
      if (url && !/^https?:\/\/|^\\\\|^[a-z]+:\/\//i.test(url))
        throw new WorkflowError("VALIDATION", "Use a full link such as https://drive.example.com/file or a network path.");
      const attempt = await currentAttempt(itemId);
      const supporting = input.kind === "document" || input.kind === "transcript";
      if (!supporting) {
        if (!attempt || attempt.stage !== stage)
          throw new WorkflowError(
            "INVALID_STATE",
            `${STAGE_LABELS[stage]} files can only change while the item is in ${STAGE_LABELS[stage]}. Reopen that stage to replace them.`,
          );
        await requireWork(ctx, attempt);
      } else if (ctx.actor && !isManager(ctx.actor) && !(attempt && await canWork(ctx, attempt))) {
        throw new WorkflowError("FORBIDDEN", "Only the current stage owner or a manager can attach documents.");
      }
      const prev = await get<{ id: string; version_no: number }>(
            "SELECT id, version_no FROM assets WHERE item_id = ? AND kind = ? ORDER BY version_no DESC LIMIT 1",
            itemId,
            input.kind,
          );
      const version = (prev?.version_no ?? 0) + 1;
      const id = uid("ast_");
      if (input.kind !== "raw" && input.kind !== "document")
        await run("UPDATE assets SET status = 'superseded' WHERE item_id = ? AND kind = ? AND status = 'current'", itemId, input.kind);
      await run(
              `INSERT INTO assets (id, item_id, attempt_id, stage, kind, version_no, label, url, camera_code, duration_min, status, notes, source_ref, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'current', ?, ?, ?, ?)`,
              id,
              itemId,
              attempt?.id ?? null,
              stage,
              input.kind,
              version,
              input.label ?? null,
              url,
              cameraCode,
              input.durationMin ?? null,
              input.notes ?? null,
              input.sourceRef ?? null,
              actorId(ctx),
              now,
            );
      if (input.kind === "master" && prev) {
        // Approvals bound to the superseded master are no longer valid.
        const invalidated = await run("UPDATE handoff_reviews SET valid = 0 WHERE item_id = ? AND asset_id = ? AND valid = 1", itemId, prev.id);
        if (Number(invalidated.changes) > 0)
          await audit(ctx, {
                        itemId,
                        action: "approval.invalidated",
                        summary: `Approvals for master v${prev.version_no} were invalidated by master v${version}`,
                      });
      }
      if (input.kind === "master" && input.durationMin)
        await run("UPDATE items SET actual_duration_min = ? WHERE id = ?", input.durationMin, itemId);
      if (input.kind === "raw" && input.durationMin && attempt)
        await run("UPDATE stage_attempts SET raw_duration_min = COALESCE(raw_duration_min, 0) + ? WHERE id = ?", input.durationMin, attempt.id);
      await audit(ctx, {
              itemId,
              attemptId: attempt?.id,
              stage,
              action: "asset.added",
              summary: `${actorName(ctx)} added ${input.kind === "raw" ? "recording" : input.kind.replace("_", " ")} ${cameraCode ? `${cameraCode} ` : ""}v${version}${input.label ? ` (${input.label})` : ""}`,
              newValue: { url, cameraCode, version, durationMin: input.durationMin ?? null, notes: input.notes ?? null },
            });
      await syncItem(itemId, now);
      void item;
      return id;
    });
}

export async function setChecklist(ctx: Ctx, itemId: string, key: string, checked: boolean) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const attempt = await requireAttempt(itemId);
      await requireWork(ctx, attempt);
      const def = key.startsWith("wc:")
        ? (await workChecklistItems(itemId, attempt.stage)).find((c) => `wc:${c.key}` === key)
        : (await getSettings()).checklists[attempt.stage].find((c) => c.key === key);
      if (!def) throw new WorkflowError("VALIDATION", "Unknown checklist item.");
      // Changing a checked line clears any lead verification of it.
      await run(
              `INSERT INTO checklist_results (attempt_id, key, checked, checked_by, checked_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(attempt_id, key) DO UPDATE SET checked = excluded.checked, checked_by = excluded.checked_by, checked_at = excluded.checked_at,
         verified_by = NULL, verified_at = NULL`,
              attempt.id,
              key,
              checked ? 1 : 0,
              actorId(ctx),
              now,
            );
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "checklist.updated",
              summary: `${actorName(ctx)} ${checked ? "checked" : "unchecked"} "${def.label}"`,
              oldValue: !checked,
              newValue: checked,
            });
      await syncItem(itemId, now);
    });
}

// Free-text notes on the current stage attempt (Page view). Only people who can work the stage may write them.
export async function setStageNotes(ctx: Ctx, itemId: string, notes: string | null) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const attempt = await requireAttempt(itemId);
    await requireWork(ctx, attempt);
    const value = notes?.trim() || null;
    if (value && value.length > 4000) throw new WorkflowError("VALIDATION", "Notes are limited to 4,000 characters.");
    await run("UPDATE stage_attempts SET notes = ? WHERE id = ?", value, attempt.id);
    await audit(ctx, {
      itemId,
      attemptId: attempt.id,
      stage: attempt.stage,
      action: "stage.notes",
      summary: `${actorName(ctx)} updated ${STAGE_LABELS[attempt.stage].toLowerCase()} notes`,
      oldValue: attempt.notes,
      newValue: value,
    });
    await syncItem(itemId, now);
  });
}

export async function setDurations(ctx: Ctx, itemId: string, input: { rawDurationMin?: number | null; actualDurationMin?: number | null }) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const attempt = await requireAttempt(itemId);
      await requireWork(ctx, attempt);
      const item = await getItem(itemId);
      if (input.rawDurationMin !== undefined) {
        await run("UPDATE stage_attempts SET raw_duration_min = ? WHERE id = ?", input.rawDurationMin, attempt.id);
        await audit(ctx, {
                    itemId,
                    attemptId: attempt.id,
                    stage: attempt.stage,
                    action: "duration.raw",
                    summary: `${actorName(ctx)} recorded raw duration ${input.rawDurationMin ?? "-"} min`,
                    oldValue: attempt.raw_duration_min,
                    newValue: input.rawDurationMin,
                  });
      }
      if (input.actualDurationMin !== undefined) {
        await run("UPDATE items SET actual_duration_min = ? WHERE id = ?", input.actualDurationMin, itemId);
        await audit(ctx, {
                    itemId,
                    attemptId: attempt.id,
                    stage: attempt.stage,
                    action: "duration.final",
                    summary: `${actorName(ctx)} set final duration to ${input.actualDurationMin ?? "-"} min`,
                    oldValue: item.actual_duration_min,
                    newValue: input.actualDurationMin,
                  });
      }
      await syncItem(itemId, now);
    });
}

// ---------------------------------------------------------------------------
// Requirement evaluation
// ---------------------------------------------------------------------------

export type Requirement = { key: string; label: string; met: boolean };

async function currentAsset(itemId: string, kind: AssetKind) {
  return await get<{ id: string; version_no: number }>(
      "SELECT id, version_no FROM assets WHERE item_id = ? AND kind = ? AND status = 'current' ORDER BY version_no DESC LIMIT 1",
      itemId,
      kind,
    );
}

export async function validApproval(itemId: string, attemptId: string) {
  return await get<{ id: string; reviewer_id: string; self_approval: number }>(
      `SELECT id, reviewer_id, self_approval FROM handoff_reviews
     WHERE item_id = ? AND attempt_id = ? AND kind = 'publication_review' AND decision = 'approved' AND valid = 1
     ORDER BY created_at DESC LIMIT 1`,
      itemId,
      attemptId,
    );
}

export async function evaluateRequirements(itemId: string, attempt?: AttemptRow | null): Promise<Requirement[]> {
  const a = attempt ?? await currentAttempt(itemId);
  if (!a) return [];
  const s = await getSettings();
  const item = await getItem(itemId);
  const reqs: Requirement[] = [];
  const checks = await all<{ key: string; checked: number; verified_at: string | null }>("SELECT key, checked, verified_at FROM checklist_results WHERE attempt_id = ?", a.id);
  const checked = new Set(checks.filter((c) => c.checked).map((c) => c.key));
  const verified = new Set(checks.filter((c) => c.checked && c.verified_at).map((c) => c.key));
  if (a.stage === "recording") {
    const rawCount = (await get<{ c: number }>("SELECT COUNT(*) AS c FROM assets WHERE item_id = ? AND kind = 'raw' AND attempt_id = ?", itemId, a.id))?.c ?? 0;
    reqs.push({ key: "raw", label: "At least one recording logged (camera code or link)", met: rawCount > 0 });
    if (s.policies.requireRawDuration) reqs.push({ key: "raw_duration", label: "Recorded raw duration entered", met: !!a.raw_duration_min });
  }
  if (a.stage === "editing") {
    const master = await currentAsset(itemId, "master");
    reqs.push({ key: "master", label: "Edited master version linked", met: !!master });
    if (s.policies.captionsRequired) reqs.push({ key: "captions", label: "Captions linked", met: !!await currentAsset(itemId, "captions") });
    if (s.policies.thumbnailRequired) reqs.push({ key: "thumbnail", label: "Thumbnail linked", met: !!await currentAsset(itemId, "thumbnail") });
    reqs.push({ key: "final_duration", label: "Final duration recorded", met: !!item.actual_duration_min });
  }
  if (a.stage === "uploading") {
    const master = await currentAsset(itemId, "master");
    for (const t of (await targets(itemId)).filter((t) => t.required)) {
      const label = s.destinations.find((d) => d.key === t.platform)?.label ?? t.platform;
      reqs.push({
        key: `upload:${t.platform}`,
        label: `${label}: uploaded with destination ID or link`,
        met: t.upload_status === "uploaded" && !!(t.external_id || t.upload_url),
      });
      reqs.push({
        key: `version:${t.platform}`,
        label: `${label}: uploaded version is the approved master`,
        met: !!master && t.uploaded_asset_id === master.id,
      });
      if (s.policies.requirePlaybackCheck)
        reqs.push({ key: `playback:${t.platform}`, label: `${label}: playback verified`, met: !!t.playback_checked });
      reqs.push({ key: `metadata:${t.platform}`, label: `${label}: metadata verified`, met: !!t.metadata_checked });
    }
  }
  if (a.stage === "publication") {
    const approval = await validApproval(itemId, a.id);
    reqs.push({ key: "approval", label: "Final publication approval recorded", met: !!approval });
    if (s.policies.requireManagerApproval) {
      const mgr = await get(
              "SELECT 1 AS x FROM handoff_reviews WHERE attempt_id = ? AND kind = 'manager_approval' AND decision = 'approved' AND valid = 1",
              a.id,
            );
      reqs.push({ key: "manager_approval", label: "Manager approval recorded", met: !!mgr });
    }
  }
  for (const c of s.checklists[a.stage]) {
    if (c.required) reqs.push({ key: `check:${c.key}`, label: c.label, met: checked.has(c.key) });
    if (c.verify) reqs.push({ key: `verify:${c.key}`, label: `${c.label}: verified by the team lead`, met: verified.has(c.key) });
  }
  // The checklist chosen for this person when the work was assigned (keys stored as "wc:<key>").
  for (const c of await workChecklistItems(itemId, a.stage)) {
    const k = `wc:${c.key}`;
    if (c.required) reqs.push({ key: k, label: c.label, met: checked.has(k) });
    if (c.verify) reqs.push({ key: `verify:${c.key}`, label: `${c.label}: verified by the team lead`, met: verified.has(k) });
  }
  return reqs;
}

export type WorkChecklistItem = { key: string; label: string; required: boolean; verify: boolean; hint?: string | null };

export async function workChecklistItems(itemId: string, stage: Stage): Promise<WorkChecklistItem[]> {
  const row = await get<{ items: string }>("SELECT items FROM work_checklists WHERE item_id = ? AND stage = ?", itemId, stage);
  return row ? parseJson<WorkChecklistItem[]>(row.items, []) : [];
}

export async function missingRequirements(itemId: string, attempt?: AttemptRow | null) {
  return (await evaluateRequirements(itemId, attempt)).filter((r) => !r.met);
}

// ---------------------------------------------------------------------------
// Team member to team lead: finish, send, approve or return
// ---------------------------------------------------------------------------

// The team lead (or a manager) of a stage acts for the team: approves work and hands it over.
export function leadsStage(u: AppUser | null, stage: Stage) {
  return !u || isManager(u) || isLeadOf(u, stage);
}

// What a team member must have done before marking work done: everything except the lead's verifications.
async function workerMissing(itemId: string, attempt: AttemptRow) {
  return (await missingRequirements(itemId, attempt)).filter((r) => !r.key.startsWith("verify:"));
}

// The team member marks their work done. It stays with them (Done, not sent) until they send it to the team lead,
// one at a time or all together at the end of the day.
export async function finishWork(ctx: Ctx, itemId: string) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const attempt = await requireAttempt(itemId);
    if (attempt.stage === "publication") throw new WorkflowError("INVALID_STATE", "Publication completes when the release is confirmed live.");
    if (!["queued", "in_progress", "paused"].includes(attempt.status))
      throw new WorkflowError("INVALID_STATE", `This cannot be marked done while it is ${STATUS_LABELS[attempt.status].toLowerCase()}.`);
    await requireWork(ctx, attempt);
    const missing = await workerMissing(itemId, attempt);
    if (missing.length) throw new WorkflowError("REQUIREMENTS_MISSING", "Finish what is still needed first.", missing);
    await endSessions(attempt.id, now, "finished");
    if (!attempt.first_started_at) await run("UPDATE stage_attempts SET first_started_at = ? WHERE id = ?", now, attempt.id);
    // Recorded, edited and uploaded dates are when the work was done.
    await run(`UPDATE items SET ${STAGE_DATE_COLUMN[attempt.stage]} = ? WHERE id = ?`, now, itemId);
    await setAttemptStatus(attempt, "finished", now);
    await audit(ctx, { itemId, attemptId: attempt.id, stage: attempt.stage, action: "work.finished", summary: `${actorName(ctx)} marked ${STAGE_LABELS[attempt.stage].toLowerCase()} done` });
    await syncItem(itemId, now);
  });
}

// Back to work on something marked done but not yet sent.
export async function reopenFinished(ctx: Ctx, itemId: string) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const attempt = await requireAttempt(itemId);
    if (attempt.status !== "finished") throw new WorkflowError("INVALID_STATE", "Only work marked done and not yet sent can be reopened.");
    await requireWork(ctx, attempt);
    await setAttemptStatus(attempt, "paused", now, "Reopened");
    await audit(ctx, { itemId, attemptId: attempt.id, stage: attempt.stage, action: "work.reopened", summary: `${actorName(ctx)} reopened ${STAGE_LABELS[attempt.stage].toLowerCase()} to change it` });
    await syncItem(itemId, now);
  });
}

// Sends finished work to the stage's team lead. Work still in progress is marked done on the way. A lead (or a
// manager) sending their own work approves it at the same time.
export async function submitToLead(ctx: Ctx, itemId: string, input: { note?: string | null } = {}) {
  const attempt = await requireAttempt(itemId);
  if (["queued", "in_progress", "paused"].includes(attempt.status)) await finishWork(ctx, itemId);
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const a = await requireAttempt(itemId);
    if (a.status !== "finished") throw new WorkflowError("INVALID_STATE", `This is ${STATUS_LABELS[a.status].toLowerCase()}; only work marked done is sent to the team lead.`);
    await requireWork(ctx, a);
    const item = await getItem(itemId);
    if (input.note?.trim()) await run("UPDATE stage_attempts SET notes = ? WHERE id = ?", [a.notes, `${actorName(ctx)}: ${input.note.trim()}`].filter(Boolean).join("\n"), a.id);
    await run("UPDATE stage_attempts SET handoff_submitted_at = ? WHERE id = ?", now, a.id);
    const review = (await rulesFor(a.stage)).leadReview;
    if (!review && !leadsStage(ctx.actor, a.stage)) {
      // The team works without lead review: sent work is ready for the lead to hand over.
      await setAttemptStatus(a, "ready", now);
      await audit(ctx, { itemId, attemptId: a.id, stage: a.stage, action: "lead.submitted", summary: `${actorName(ctx)} sent ${STAGE_LABELS[a.stage].toLowerCase()} to the team lead; ready for handover`, reason: input.note ?? null });
      if (!ctx.silent) {
        const leads = await teamLeads(a.stage);
        await notify(
          leads.length ? leads : await managers(),
          { type: "handoff", title: `Ready to hand over: ${item.code}`, body: `${actorName(ctx)} finished ${STAGE_LABELS[a.stage].toLowerCase()} of ${item.title}.`, link: "/dashboard", itemId, groupKey: `lead-ready:${a.stage}` },
          now,
          actorId(ctx) ?? undefined,
        );
      }
    } else if (leadsStage(ctx.actor, a.stage)) {
      await approveChecks(ctx, a, now);
      await setAttemptStatus(a, "ready", now);
      await audit(ctx, { itemId, attemptId: a.id, stage: a.stage, action: "lead.approved", summary: `${actorName(ctx)} finished ${STAGE_LABELS[a.stage].toLowerCase()}; ready for handover` });
    } else {
      await setAttemptStatus(a, "lead_review", now);
      await audit(ctx, { itemId, attemptId: a.id, stage: a.stage, action: "lead.submitted", summary: `${actorName(ctx)} sent ${STAGE_LABELS[a.stage].toLowerCase()} to the team lead`, reason: input.note ?? null });
      if (!ctx.silent) {
        const leads = await teamLeads(a.stage);
        await notify(
          leads.length ? leads : await managers(),
          { type: "approval", title: `To approve: ${item.code}`, body: `${actorName(ctx)} finished ${STAGE_LABELS[a.stage].toLowerCase()} of ${item.title}.`, link: "/dashboard", itemId, groupKey: `lead-review:${a.stage}` },
          now,
          actorId(ctx) ?? undefined,
        );
      }
    }
    await syncItem(itemId, now);
  });
}

// Approving verifies the checklist lines a lead must verify.
async function approveChecks(ctx: Ctx, a: AttemptRow, now: string) {
  await run("UPDATE checklist_results SET verified_by = ?, verified_at = ? WHERE attempt_id = ? AND checked = 1 AND verified_at IS NULL", actorId(ctx), now, a.id);
}

// The team lead approves work sent to them (Ready for handover) or returns it to the team member with a note.
export async function leadDecide(ctx: Ctx, itemId: string, input: { decision: "approve" | "return"; note?: string | null }) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const a = await requireAttempt(itemId);
    if (!leadsStage(ctx.actor, a.stage)) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[a.stage]} team lead or a manager approves this.`);
    if (!["lead_review", "finished"].includes(a.status)) throw new WorkflowError("INVALID_STATE", `This is ${STATUS_LABELS[a.status].toLowerCase()}, not waiting for approval.`);
    const item = await getItem(itemId);
    if (input.decision === "approve") {
      const missing = await workerMissing(itemId, a);
      if (missing.length) throw new WorkflowError("REQUIREMENTS_MISSING", "Something required is still missing.", missing);
      await approveChecks(ctx, a, now);
      await setAttemptStatus(a, "ready", now);
      await audit(ctx, { itemId, attemptId: a.id, stage: a.stage, action: "lead.approved", summary: `${actorName(ctx)} approved ${STAGE_LABELS[a.stage].toLowerCase()}; ready for handover`, reason: input.note ?? null });
    } else {
      if (!input.note?.trim()) throw new WorkflowError("VALIDATION", "Say what needs to change.");
      await run("UPDATE stage_attempts SET notes = ?, handoff_submitted_at = NULL WHERE id = ?", [a.notes, `Team lead: ${input.note.trim()}`].filter(Boolean).join("\n"), a.id);
      await run("UPDATE checklist_results SET verified_by = NULL, verified_at = NULL WHERE attempt_id = ?", a.id);
      await setAttemptStatus(a, "paused", now, input.note.trim());
      await audit(ctx, { itemId, attemptId: a.id, stage: a.stage, action: "lead.returned", summary: `${actorName(ctx)} returned ${STAGE_LABELS[a.stage].toLowerCase()} to the team member`, reason: input.note.trim() });
      if (!ctx.silent && a.owner_id && a.owner_id !== actorId(ctx))
        await notify([a.owner_id], { type: "handoff", title: `Changes needed: ${item.code}`, body: input.note.trim(), link: `/dashboard?item=${itemId}`, itemId, dedupeKey: `lead-return:${a.id}:${now}` }, now, actorId(ctx) ?? undefined);
    }
    await syncItem(itemId, now);
  });
}

// ---------------------------------------------------------------------------
// Handoffs
// ---------------------------------------------------------------------------

export async function submitHandoff(ctx: Ctx, itemId: string, input: { note?: string | null; expectedVersion?: number } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (attempt.stage === "publication")
        throw new WorkflowError("INVALID_STATE", "Publication completes when the live release is confirmed.");
      if (!leadsStage(ctx.actor, attempt.stage))
        throw new WorkflowError("FORBIDDEN", `Your team lead hands work over to ${STAGE_LABELS[NEXT_STAGE[attempt.stage]!]}. Mark it done and send it to the team lead.`);
      if (!["in_progress", "paused", "queued", "finished", "lead_review", "ready"].includes(attempt.status))
        throw new WorkflowError("INVALID_STATE", `A handoff cannot be submitted while the stage is ${STATUS_LABELS[attempt.status].toLowerCase()}.`);
      // People hand over finished work only (imports and status corrections run without an actor).
      if (ctx.actor) {
        const rules = await rulesFor(attempt.stage);
        if (!handoverStatuses(rules).includes(attempt.status))
          throw new WorkflowError(
            "INVALID_STATE",
            ["finished", "lead_review"].includes(attempt.status)
              ? "Approve it first; only approved work is handed over."
              : `This is ${STATUS_LABELS[attempt.status].toLowerCase()}. Mark it done and send it to the team lead first; only finished work is handed over.`,
          );
      }
      await requireWork(ctx, attempt);
      // Handing over approves any line still waiting for the lead's verification.
      await approveChecks(ctx, attempt, now);
      const missing = await missingRequirements(itemId, attempt);
      if (missing.length)
        throw new WorkflowError("REQUIREMENTS_MISSING", "Complete the required evidence before submitting the handoff.", missing);
      await endSessions(attempt.id, now, "handoff");
      await run("UPDATE stage_attempts SET handoff_submitted_at = COALESCE(handoff_submitted_at, ?), notes = COALESCE(?, notes) WHERE id = ?", now, input.note ?? null, attempt.id);
      if (attempt.stage === "uploading") await run("UPDATE stage_attempts SET substate = 'uploaded' WHERE id = ?", attempt.id);
      // Recorded, edited and uploaded dates are when the work was marked done; a direct handover sets them now.
      if (!["finished", "lead_review", "ready"].includes(attempt.status)) await run(`UPDATE items SET ${STAGE_DATE_COLUMN[attempt.stage]} = ? WHERE id = ?`, now, itemId);
      await setAttemptStatus(attempt, "awaiting_handoff", now);
      const next = NEXT_STAGE[attempt.stage]!;
      const receiver = await stageOwner(itemId, next);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "handoff.submitted",
              summary: `${actorName(ctx)} submitted the ${STAGE_LABELS[attempt.stage].toLowerCase()} handoff to ${STAGE_LABELS[next]} (${await userName(receiver)})`,
              reason: input.note ?? null,
            });
      if (!ctx.silent) {
        // The next team's lead receives the handover; without a lead, whoever is set to do the work there.
        const leads = await teamLeads(next);
        const recipients = leads.length ? leads : receiver ? [receiver] : await roleUsersForItem(next, itemId);
        await notify(
                  recipients,
                  {
                    type: "handoff",
                    title: `Handoff waiting: ${item.code}`,
                    body: `${STAGE_LABELS[attempt.stage]} handed over ${item.title}. Accept or return it.`,
                    link: `/dashboard`,
                    itemId,
                    dedupeKey: `handoff:${attempt.id}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
        if (!receiver && !leads.length)
          await notify(
                      await managers(),
                      {
                        type: "handoff",
                        title: `Unassigned handoff: ${item.code}`,
                        body: `No ${STAGE_LABELS[next].toLowerCase()} owner is assigned. Assign one so the item does not stall.`,
                        link: `/items/${itemId}`,
                        itemId,
                        dedupeKey: `handoff-unassigned:${attempt.id}`,
                      },
                      now,
                    );
      }
      await syncItem(itemId, now);
    });
}

async function canReceive(ctx: Ctx, itemId: string, next: Stage) {
  const u = ctx.actor;
  if (!u) return true;
  if (isManager(u)) return true;
  if (isLeadOf(u, next)) return true;
  if (!hasRole(u, next)) return false;
  if ((await teamLeads(next)).length) return false;
  const owner = await stageOwner(itemId, next);
  return !owner || owner === u.id;
}

export async function acceptHandoff(ctx: Ctx, itemId: string, input: { note?: string | null; expectedVersion?: number } = {}) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (attempt.status !== "awaiting_handoff") throw new WorkflowError("INVALID_STATE", "There is no handoff waiting for acceptance.");
      const next = NEXT_STAGE[attempt.stage]!;
      if (!await canReceive(ctx, itemId, next))
        throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[next]} owner or a manager can accept this handoff.`);
      const master = await currentAsset(itemId, "master");
      const self = !!ctx.actor && attempt.owner_id === ctx.actor.id;
      await run(
              `INSERT INTO handoff_reviews (id, attempt_id, item_id, kind, decision, note, reviewer_id, asset_id, self_approval, created_at)
       VALUES (?, ?, ?, 'handoff', 'accepted', ?, ?, ?, ?, ?)`,
              uid("rev_"),
              attempt.id,
              itemId,
              input.note ?? null,
              actorId(ctx),
              attempt.stage === "editing" || attempt.stage === "uploading" ? (master?.id ?? null) : null,
              self ? 1 : 0,
              now,
            );
      await run("UPDATE stage_attempts SET completed_at = ? WHERE id = ?", now, attempt.id);
      await setAttemptStatus(attempt, "completed", now);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "handoff.accepted",
              summary: `${actorName(ctx)} accepted the ${STAGE_LABELS[attempt.stage].toLowerCase()} handoff${self ? " (self-acceptance)" : ""}`,
              reason: input.note ?? null,
            });
      // The next stage keeps its planned owner; otherwise the accepting lead assigns it (a team member accepting,
      // where there is no lead, takes it).
      const owner = (await stageOwner(itemId, next)) ?? (ctx.actor && hasRole(ctx.actor, next) && !leadsStage(ctx.actor, next) ? ctx.actor.id : null);
      await openAttempt(ctx, itemId, next, "initial", null, owner);
      // The receiving team's turnaround starts when the work arrives.
      const days = (await rulesFor(next)).targetDays;
      if (days > 0)
        await run("UPDATE stage_assignments SET stage_due_at = ? WHERE item_id = ? AND stage = ? AND stage_due_at IS NULL", new Date(Date.parse(now) + days * 864e5).toISOString(), itemId, next);
      if (!ctx.silent && attempt.owner_id)
        await notify(
                  [attempt.owner_id],
                  {
                    type: "handoff",
                    title: `Handoff accepted: ${item.code}`,
                    body: `${STAGE_LABELS[next]} accepted your ${STAGE_LABELS[attempt.stage].toLowerCase()} work.`,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `accepted:${attempt.id}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      await syncItem(itemId, now);
    });
}

export async function returnHandoff(
  ctx: Ctx,
  itemId: string,
  input: { reasonCategory: string; note: string; assetId?: string | null; expectedVersion?: number },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (attempt.status !== "awaiting_handoff") throw new WorkflowError("INVALID_STATE", "There is no handoff waiting to be returned.");
      const next = NEXT_STAGE[attempt.stage]!;
      if (!await canReceive(ctx, itemId, next))
        throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[next]} owner or a manager can return this handoff.`);
      if (!input.reasonCategory || !input.note?.trim())
        throw new WorkflowError("VALIDATION", "A reason category and a specific note are required to return work.");
      const master = await currentAsset(itemId, "master");
      await run(
              `INSERT INTO handoff_reviews (id, attempt_id, item_id, kind, decision, reason_category, note, reviewer_id, asset_id, created_at)
       VALUES (?, ?, ?, 'handoff', 'returned', ?, ?, ?, ?, ?)`,
              uid("rev_"),
              attempt.id,
              itemId,
              input.reasonCategory,
              input.note.trim(),
              actorId(ctx),
              input.assetId ?? master?.id ?? null,
              now,
            );
      await setAttemptStatus(attempt, "returned", now, input.reasonCategory);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "handoff.returned",
              summary: `${actorName(ctx)} returned the ${STAGE_LABELS[attempt.stage].toLowerCase()} handoff: ${RETURN_REASON_LABELS[input.reasonCategory] ?? input.reasonCategory}`,
              reason: input.note,
            });
      await openAttempt(ctx, itemId, attempt.stage, "returned", `${RETURN_REASON_LABELS[input.reasonCategory] ?? input.reasonCategory}: ${input.note}`, attempt.owner_id);
      await syncItem(itemId, now);
    });
}

// Reopen an earlier stage as a new attempt. Downstream approvals tied to superseded assets are invalidated.
export async function reopenStage(
  ctx: Ctx,
  itemId: string,
  input: { target: Stage; reasonCategory: string; note: string; expectedVersion?: number },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId);
      if (stageIndex(input.target) >= stageIndex(attempt.stage))
        throw new WorkflowError("VALIDATION", "Only an earlier stage can be reopened.");
      if (ctx.actor && !isManager(ctx.actor) && !hasRole(ctx.actor, attempt.stage))
        throw new WorkflowError("FORBIDDEN", `Only ${STAGE_LABELS[attempt.stage]} staff or a manager can request upstream changes.`);
      if (!input.note?.trim()) throw new WorkflowError("VALIDATION", "Explain what must change upstream.");
      await endSessions(attempt.id, now, "superseded");
      await run("UPDATE blockers SET resolved_at = ?, resolution = 'Superseded by reopened stage' WHERE attempt_id = ? AND resolved_at IS NULL", now, attempt.id);
      await run("UPDATE stage_attempts SET held = 1 WHERE id = ?", attempt.id);
      await setAttemptStatus(attempt, "superseded", now, "Upstream stage reopened");
      if (stageIndex(input.target) <= stageIndex("editing")) {
        await run("UPDATE handoff_reviews SET valid = 0 WHERE item_id = ? AND valid = 1 AND kind <> 'handoff_return'", itemId);
        await run(
                  `UPDATE publication_targets SET upload_status = 'pending', uploaded_asset_id = NULL, playback_checked = 0, metadata_checked = 0,
           release_status = CASE WHEN release_status = 'live' THEN 'live' ELSE 'pending' END, scheduled_at = NULL WHERE item_id = ?`,
                  itemId,
                );
      } else {
        await run("UPDATE handoff_reviews SET valid = 0 WHERE item_id = ? AND kind = 'publication_review' AND valid = 1", itemId);
      }
      await run("UPDATE items SET scheduled_publish_at = NULL WHERE id = ?", itemId);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: attempt.stage,
              action: "stage.reopened",
              summary: `${actorName(ctx)} reopened ${STAGE_LABELS[input.target]} from ${STAGE_LABELS[attempt.stage]}: ${RETURN_REASON_LABELS[input.reasonCategory] ?? input.reasonCategory}`,
              oldValue: attempt.stage,
              newValue: input.target,
              reason: input.note,
            });
      await run(
              `INSERT INTO handoff_reviews (id, attempt_id, item_id, kind, decision, reason_category, note, reviewer_id, created_at)
       VALUES (?, ?, ?, 'handoff_return', 'returned', ?, ?, ?, ?)`,
              uid("rev_"),
              attempt.id,
              itemId,
              input.reasonCategory,
              input.note,
              actorId(ctx),
              now,
            );
      await openAttempt(ctx, itemId, input.target, "reopened", `${RETURN_REASON_LABELS[input.reasonCategory] ?? input.reasonCategory}: ${input.note}`);
      await syncItem(itemId, now);
      void item;
    });
}

// ---------------------------------------------------------------------------
// Uploading
// ---------------------------------------------------------------------------

export async function recordUpload(
  ctx: Ctx,
  itemId: string,
  input: {
    platform: string;
    status: "uploading" | "processing" | "uploaded" | "failed";
    externalId?: string | null;
    uploadUrl?: string | null;
    failureReason?: string | null;
    expectedVersion?: number;
  },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId, "uploading");
      await requireWork(ctx, attempt);
      const target = await get<TargetRow>("SELECT * FROM publication_targets WHERE item_id = ? AND platform = ?", itemId, input.platform);
      if (!target) throw new WorkflowError("VALIDATION", "That destination is not configured for this item.");
      if (input.status === "uploaded" && !(input.externalId || input.uploadUrl || target.external_id || target.upload_url))
        throw new WorkflowError("VALIDATION", "Record the destination item ID or link before marking it uploaded.");
      if (input.status === "failed" && !input.failureReason?.trim())
        throw new WorkflowError("VALIDATION", "Describe why the upload failed.");
      const master = await currentAsset(itemId, "master");
      await run(
              `UPDATE publication_targets SET upload_status = ?, external_id = COALESCE(?, external_id), upload_url = COALESCE(?, upload_url),
         uploaded_asset_id = CASE WHEN ? = 'uploaded' THEN ? ELSE uploaded_asset_id END,
         failure_reason = ?, retry_count = retry_count + CASE WHEN ? = 'failed' THEN 1 ELSE 0 END WHERE id = ?`,
              input.status,
              input.externalId ?? null,
              input.uploadUrl ?? null,
              input.status,
              master?.id ?? null,
              input.status === "failed" ? input.failureReason ?? null : null,
              input.status,
              target.id,
            );
      if (attempt.status === "queued" && ctx.actor) await startWork(ctx, itemId, { switchFrom: true });
      const all_ = (await targets(itemId)).filter((t) => t.required);
      const sub =
        input.status === "failed"
          ? "failed"
          : all_.every((t) => t.upload_status === "uploaded")
            ? "processing"
            : input.status === "processing"
              ? "processing"
              : "uploading";
      await run("UPDATE stage_attempts SET substate = ? WHERE id = ?", sub, attempt.id);
      const label = (await getSettings()).destinations.find((d) => d.key === input.platform)?.label ?? input.platform;
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "uploading",
              action: `upload.${input.status}`,
              summary: `${actorName(ctx)} marked ${label} upload ${input.status}${input.failureReason ? `: ${input.failureReason}` : ""}`,
              oldValue: target.upload_status,
              newValue: { status: input.status, externalId: input.externalId ?? target.external_id, url: input.uploadUrl ?? target.upload_url },
            });
      if (input.status === "failed" && !ctx.silent)
        await notify(
                  [...await managers(), attempt.owner_id],
                  {
                    type: "failure",
                    title: `Upload failed: ${item.code} on ${label}`,
                    body: input.failureReason ?? undefined,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `upload-failed:${target.id}:${target.retry_count + 1}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      await syncItem(itemId, now);
    });
}

export async function verifyTarget(ctx: Ctx, itemId: string, input: { platform: string; playback?: boolean; metadata?: boolean }) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const attempt = await requireAttempt(itemId, "uploading");
      await requireWork(ctx, attempt);
      const target = await get<TargetRow>("SELECT * FROM publication_targets WHERE item_id = ? AND platform = ?", itemId, input.platform);
      if (!target) throw new WorkflowError("VALIDATION", "Unknown destination.");
      if (target.upload_status !== "uploaded" && (input.playback || input.metadata))
        throw new WorkflowError("INVALID_STATE", "Mark the upload complete before verifying playback or metadata.");
      await run(
              "UPDATE publication_targets SET playback_checked = COALESCE(?, playback_checked), metadata_checked = COALESCE(?, metadata_checked) WHERE id = ?",
              input.playback === undefined ? null : input.playback ? 1 : 0,
              input.metadata === undefined ? null : input.metadata ? 1 : 0,
              target.id,
            );
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "uploading",
              action: "upload.verified",
              summary: `${actorName(ctx)} updated verification for ${input.platform}: ${[
                input.playback !== undefined ? `playback ${input.playback ? "verified" : "cleared"}` : null,
                input.metadata !== undefined ? `metadata ${input.metadata ? "verified" : "cleared"}` : null,
              ]
                .filter(Boolean)
                .join(", ")}`,
            });
      await syncItem(itemId, now);
    });
}

export async function setUploadSubstate(ctx: Ctx, itemId: string, substate: "uploading" | "processing") {
  return await tx(async () => {
      const now = at(ctx);
      const attempt = await requireAttempt(itemId, "uploading");
      await requireWork(ctx, attempt);
      if (attempt.status === "queued" || attempt.status === "paused") await startWork(ctx, itemId, { switchFrom: true });
      await run("UPDATE stage_attempts SET substate = ? WHERE id = ?", substate, attempt.id);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "uploading",
              action: "upload.substate",
              summary: `${actorName(ctx)} set upload state to ${substate}`,
              oldValue: attempt.substate,
              newValue: substate,
            });
      await syncItem(itemId, now);
    });
}

// ---------------------------------------------------------------------------
// Publication
// ---------------------------------------------------------------------------

async function requirePublisher(ctx: Ctx, override?: string | null) {
  const u = ctx.actor;
  if (!u) return { override: false };
  if (hasRole(u, "publication")) return { override: false };
  if (can(u, "release.emergency") && (await getSettings()).policies.managerEmergencyRelease) {
    if (!override?.trim())
      throw new WorkflowError("VALIDATION", "Manager emergency release requires a written reason. It is recorded in the audit history.");
    return { override: true };
  }
  throw new WorkflowError("FORBIDDEN", "Only Publication staff can release content.");
}

export async function reviewPublication(
  ctx: Ctx,
  itemId: string,
  input: {
    decision: "approved" | "changes_requested";
    reasonCategory?: string | null;
    note?: string | null;
    returnTo?: Stage | null;
    managerApproval?: boolean;
    expectedVersion?: number;
  },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId, "publication");
      const u = ctx.actor;
      if (u && !hasRole(u, "publication") && !isManager(u))
        throw new WorkflowError("FORBIDDEN", "Only Publication reviewers or managers can record educational review.");
      if (input.managerApproval && u && !isManager(u)) throw new WorkflowError("FORBIDDEN", "Only managers can record manager approval.");
      const s = await getSettings();
      if (input.decision === "approved") {
        const reqChecks = s.checklists.publication.filter((c) => c.required);
        const checked = new Set(
          (await all<{ key: string }>("SELECT key FROM checklist_results WHERE attempt_id = ? AND checked = 1", attempt.id)).map((r) => r.key),
        );
        const missing = reqChecks.filter((c) => !checked.has(c.key)).map((c) => ({ key: `check:${c.key}`, label: c.label, met: false }));
        if (missing.length && !input.managerApproval)
          throw new WorkflowError("REQUIREMENTS_MISSING", "Complete the review checklist before approving.", missing);
      } else if (!input.note?.trim()) {
        throw new WorkflowError("VALIDATION", "Describe the changes required.");
      }
      // Self-approval: the reviewer also did the last stage before Publication (Uploading).
      const lastUpload = await get<{ id: string; owner_id: string | null }>(
              "SELECT id, owner_id FROM stage_attempts WHERE item_id = ? AND stage = 'uploading' AND status <> 'superseded' ORDER BY attempt_no DESC LIMIT 1",
              itemId,
            );
      const workedOn =
        !!u &&
        !!lastUpload &&
        (lastUpload.owner_id === u.id || !!await get("SELECT 1 AS x FROM work_sessions WHERE attempt_id = ? AND user_id = ?", lastUpload.id, u.id));
      if (workedOn && input.decision === "approved" && !s.policies.allowSelfApproval && !input.managerApproval)
        throw new WorkflowError(
          "FORBIDDEN",
          "You did the upload for this item, so another Publication reviewer must approve it. An admin can allow self-approval in Settings, Workflow.",
        );
      if (attempt.status === "queued" && u && hasRole(u, "publication")) {
        if (!attempt.first_started_at) await run("UPDATE stage_attempts SET first_started_at = ? WHERE id = ?", now, attempt.id);
        if (!attempt.owner_id) {
          await run("UPDATE stage_attempts SET owner_id = ? WHERE id = ?", u.id, attempt.id);
          attempt.owner_id = u.id;
        }
      }
      const master = await currentAsset(itemId, "master");
      await run(
              `INSERT INTO handoff_reviews (id, attempt_id, item_id, kind, decision, reason_category, note, reviewer_id, asset_id, self_approval, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              uid("rev_"),
              attempt.id,
              itemId,
              input.managerApproval ? "manager_approval" : "publication_review",
              input.decision,
              input.reasonCategory ?? null,
              input.note ?? null,
              actorId(ctx),
              master?.id ?? null,
              workedOn ? 1 : 0,
              now,
            );
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "publication",
              action: input.managerApproval ? "review.manager" : `review.${input.decision}`,
              summary: `${actorName(ctx)} ${input.decision === "approved" ? "approved" : "requested changes on"} ${item.code}${workedOn ? " (self-approval recorded)" : ""}`,
              reason: input.note ?? null,
            });
      if (input.decision === "approved") {
        if (!input.managerApproval) {
          await run("UPDATE stage_attempts SET substate = 'ready' WHERE id = ?", attempt.id);
          if (attempt.status === "queued" || attempt.status === "paused") await setAttemptStatus(attempt, "in_progress", now);
        }
        await syncItem(itemId, now);
        return;
      }
      if (input.returnTo) {
        await syncItem(itemId, now);
        await reopenStage(ctx, itemId, { target: input.returnTo, reasonCategory: input.reasonCategory ?? "other", note: input.note ?? "" });
        return;
      }
      await run("UPDATE stage_attempts SET substate = 'changes_requested' WHERE id = ?", attempt.id);
      await syncItem(itemId, now);
    });
}

export async function schedulePublication(ctx: Ctx, itemId: string, input: { scheduledAt: string; expectedVersion?: number }) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      const attempt = await requireAttempt(itemId, "publication");
      await requirePublisher(ctx, "scheduling");
      if (!await validApproval(itemId, attempt.id))
        throw new WorkflowError("REQUIREMENTS_MISSING", "Record the final approval before scheduling.", [
          { key: "approval", label: "Final publication approval recorded", met: false },
        ]);
      if (!input.scheduledAt) throw new WorkflowError("VALIDATION", "Choose a release time.");
      await run("UPDATE stage_attempts SET substate = 'scheduled' WHERE id = ?", attempt.id);
      await run(
              "UPDATE publication_targets SET release_status = 'scheduled', scheduled_at = ? WHERE item_id = ? AND release_status <> 'live'",
              input.scheduledAt,
              itemId,
            );
      if (attempt.status !== "in_progress") await setAttemptStatus(attempt, "in_progress", now);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "publication",
              action: "release.scheduled",
              summary: `${actorName(ctx)} scheduled the release`,
              oldValue: item.scheduled_publish_at,
              newValue: input.scheduledAt,
            });
      await syncItem(itemId, now, { scheduled_publish_at: input.scheduledAt });
    });
}

export async function confirmLive(
  ctx: Ctx,
  itemId: string,
  input: { platform: string; liveUrl: string; publishedAt?: string | null; overrideReason?: string | null; expectedVersion?: number },
) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      const attempt = await requireAttempt(itemId, "publication");
      const target = await get<TargetRow>("SELECT * FROM publication_targets WHERE item_id = ? AND platform = ?", itemId, input.platform);
      if (!target) throw new WorkflowError("VALIDATION", "That destination is not configured for this item.");
      // Retried confirmations for an already verified destination are idempotent.
      if (target.release_status === "live" && target.live_url === input.liveUrl) return;
      checkVersion(item, input.expectedVersion);
      const { override } = await requirePublisher(ctx, input.overrideReason);
      if (!await validApproval(itemId, attempt.id))
        throw new WorkflowError("REQUIREMENTS_MISSING", "Publication cannot complete without the final approval.", [
          { key: "approval", label: "Final publication approval recorded", met: false },
        ]);
      if (!/^https?:\/\//i.test(input.liveUrl?.trim() ?? ""))
        throw new WorkflowError("VALIDATION", "Enter the confirmed live link (https://...).");
      const publishedAt = input.publishedAt || now;
      await run(
              `UPDATE publication_targets SET release_status = 'live', live_url = ?, published_at = ?, verified_at = ?, verified_by = ?, failure_reason = NULL
       WHERE id = ?`,
              input.liveUrl.trim(),
              publishedAt,
              now,
              actorId(ctx),
              target.id,
            );
      const label = (await getSettings()).destinations.find((d) => d.key === input.platform)?.label ?? input.platform;
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "publication",
              action: override ? "release.override" : "release.live",
              summary: `${actorName(ctx)} confirmed ${label} live${override ? " (manager emergency release)" : ""}`,
              newValue: { url: input.liveUrl, publishedAt, verifiedAt: now },
              reason: input.overrideReason ?? null,
              sourceOccurredAt: publishedAt,
            });
      const required = (await targets(itemId)).filter((t) => t.required);
      const done = required.every((t) => t.release_status === "live");
      if (!done) {
        if (attempt.status !== "in_progress") await setAttemptStatus(attempt, "in_progress", now);
        await syncItem(itemId, now);
        return;
      }
      const latest = required.map((t) => t.published_at!).sort().at(-1) ?? publishedAt;
      const primaryUrl = required[0]?.live_url ?? input.liveUrl;
      await endSessions(attempt.id, now, "published");
      await run("UPDATE stage_attempts SET completed_at = ?, substate = NULL WHERE id = ?", now, attempt.id);
      await setAttemptStatus(attempt, "completed", now);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "publication",
              action: "item.published",
              summary: `${item.code} is published on all required destinations`,
              newValue: { publishedAt: latest },
            });
      await syncItem(itemId, now, {
              lifecycle: "published",
              published_at: latest,
              publication_verified_at: now,
              live_url: primaryUrl,
            });
      if (!ctx.silent) {
        const owners = (await all<{ user_id: string }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND user_id IS NOT NULL", itemId)).map((r) => r.user_id);
        await notify(
                  [...await managers(), ...owners],
                  {
                    type: "published",
                    title: `Published: ${item.code}`,
                    body: item.title,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `published:${itemId}:${attempt.id}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      }
    });
}

export async function markReleaseFailed(ctx: Ctx, itemId: string, input: { platform: string; reason: string }) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      const attempt = await requireAttempt(itemId, "publication");
      await requirePublisher(ctx, "failure report");
      if (!input.reason?.trim()) throw new WorkflowError("VALIDATION", "Describe the release failure.");
      await run(
              "UPDATE publication_targets SET release_status = 'failed', failure_reason = ?, retry_count = retry_count + 1 WHERE item_id = ? AND platform = ?",
              input.reason,
              itemId,
              input.platform,
            );
      await run("UPDATE stage_attempts SET substate = 'failed' WHERE id = ?", attempt.id);
      await audit(ctx, {
              itemId,
              attemptId: attempt.id,
              stage: "publication",
              action: "release.failed",
              summary: `${actorName(ctx)} reported a failed release on ${input.platform}`,
              reason: input.reason,
            });
      if (!ctx.silent)
        await notify(
                  [...await managers(), ...await roleUsersForItem("publication", itemId)],
                  {
                    type: "failure",
                    title: `Release failed: ${item.code}`,
                    body: input.reason,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `release-failed:${attempt.id}:${now}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      await syncItem(itemId, now);
    });
}

// ---------------------------------------------------------------------------
// Management: assignment, deadlines, metadata, lifecycle
// ---------------------------------------------------------------------------

export async function assignStage(ctx: Ctx, itemId: string, input: { stage: Stage; userId: string | null; reason?: string | null; expectedVersion?: number }) {
  return await tx(async () => {
      const now = at(ctx);
      if (ctx.actor && !can(ctx.actor, "items.plan") && !isLeadOf(ctx.actor, input.stage))
        throw new WorkflowError("FORBIDDEN", `Only managers and ${STAGE_LABELS[input.stage]} team leads can assign this stage.`);
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      if (input.userId) {
        const holds = await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = ?", input.userId, input.stage);
        if (!holds) throw new WorkflowError("VALIDATION", `${await userName(input.userId)} does not hold the ${STAGE_LABELS[input.stage]} role.`);
      }
      const old = await stageOwner(itemId, input.stage);
      if (old === input.userId) return;
      await run(
              "UPDATE stage_assignments SET user_id = ?, assigned_at = ?, assigned_by = ? WHERE item_id = ? AND stage = ?",
              input.userId,
              now,
              actorId(ctx),
              itemId,
              input.stage,
            );
      const attempt = await currentAttempt(itemId);
      if (attempt && attempt.stage === input.stage) {
        await run("UPDATE stage_attempts SET owner_id = ? WHERE id = ?", input.userId, attempt.id);
        if (old && attempt.status === "in_progress") {
          await endSessions(attempt.id, now, "reassigned", old);
          if ((await openSessions(attempt.id)).length === 0) await setAttemptStatus(attempt, "paused", now, "Reassigned");
        }
      }
      await audit(ctx, {
              itemId,
              attemptId: attempt?.stage === input.stage ? attempt.id : null,
              stage: input.stage,
              action: "assignment.changed",
              summary: `${actorName(ctx)} assigned ${STAGE_LABELS[input.stage]} to ${await userName(input.userId)} (was ${await userName(old)})`,
              oldValue: old ? await userName(old) : null,
              newValue: input.userId ? await userName(input.userId) : null,
              reason: input.reason ?? null,
            });
      if (!ctx.silent && input.userId)
        await notify(
                  [input.userId],
                  {
                    type: "assignment",
                    title: `You were assigned ${STAGE_LABELS[input.stage]} for ${item.code}`,
                    body: item.title,
                    link: `/items/${itemId}`,
                    itemId,
                    dedupeKey: `assign:${itemId}:${input.stage}:${input.userId}:${now}`,
                  },
                  now,
                  actorId(ctx) ?? undefined,
                );
      await syncItem(itemId, now);
    });
}

export const STAGE_DATE_COLUMN: Record<Stage, "recorded_at" | "edited_at" | "uploaded_at" | "published_at"> = {
  recording: "recorded_at",
  editing: "edited_at",
  uploading: "uploaded_at",
  publication: "published_at",
};

// Corrects the recorded, edited, uploaded or publication date. Planners, the stage's leads and its owner may do this.
export async function setStageDate(ctx: Ctx, itemId: string, stage: Stage, dateIso: string | null) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const u = ctx.actor;
    if (u && !can(u, "items.plan") && !isLeadOf(u, stage)) {
      const owner = await stageOwner(itemId, stage);
      if (!hasRole(u, stage) || (owner && owner !== u.id)) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[stage]} team can change this date.`);
    }
    if (dateIso && Number.isNaN(Date.parse(dateIso))) throw new WorkflowError("VALIDATION", "Use a valid date.");
    const col = STAGE_DATE_COLUMN[stage];
    const item = (await getItem(itemId)) as unknown as Record<string, string | null>;
    if (stage === "publication" && !dateIso) throw new WorkflowError("VALIDATION", "The publication date can be corrected but not removed.");
    if (stage === "publication" && item.lifecycle !== "published") throw new WorkflowError("INVALID_STATE", "The publication date is set when the item is confirmed live.");
    await run(`UPDATE items SET ${col} = ? WHERE id = ?`, dateIso, itemId);
    await audit(ctx, { itemId, stage, action: "stage.date", summary: `${actorName(ctx)} set the ${STAGE_LABELS[stage].toLowerCase()} date`, oldValue: item[col], newValue: dateIso });
    await syncItem(itemId, now);
  });
}

export async function changeDeadline(ctx: Ctx, itemId: string, input: { dueAt: string | null; reason: string; expectedVersion?: number }) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "change deadlines");
      const item = await getItem(itemId);
      checkVersion(item, input.expectedVersion);
      if (item.current_due_at && !input.reason?.trim())
        throw new WorkflowError("VALIDATION", "Deadline changes require a reason. The original deadline is preserved.");
      await run(
              "INSERT INTO deadline_revisions (item_id, old_due_at, new_due_at, reason, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
              itemId,
              item.current_due_at,
              input.dueAt,
              input.reason || "Initial deadline",
              actorId(ctx),
              now,
            );
      await audit(ctx, {
              itemId,
              action: "deadline.changed",
              summary: `${actorName(ctx)} changed the deadline`,
              oldValue: item.current_due_at,
              newValue: input.dueAt,
              reason: input.reason,
            });
      await syncItem(itemId, now, {
              current_due_at: input.dueAt,
              original_due_at: item.original_due_at ?? input.dueAt,
            });
    });
}

export const EDITABLE_FIELDS = [
  "title",
  "title_am",
  "objectives",
  "language",
  "content_type",
  "deliverable_type",
  "teacher",
  "target_duration_min",
  "complexity",
  "complexity_note",
  "priority",
  "tags",
  "planned_publish_at",
] as const;
export type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function updateItemFields(ctx: Ctx, itemId: string, fields: Partial<Record<EditableField, unknown>>, expectedVersion?: number) {
  return await tx(async () => {
      const now = at(ctx);
      await requireView(ctx, itemId);
      const item = await getItem(itemId);
      checkVersion(item, expectedVersion);
      const u = ctx.actor;
      const keys = Object.keys(fields).filter((k) => (EDITABLE_FIELDS as readonly string[]).includes(k)) as EditableField[];
      if (!keys.length) return;
      if (u && !can(u, "items.plan")) {
        // Operational staff may edit descriptive metadata only while they own the current stage.
        const attempt = await currentAttempt(itemId);
        const allowed: EditableField[] = ["teacher", "objectives", "title_am", "complexity_note"];
        if (!attempt || !await canWork(ctx, attempt) || keys.some((k) => !allowed.includes(k)))
          throw new WorkflowError("FORBIDDEN", "You do not have permission to change planning fields such as priority, title and dates.");
      }
      const changes: Record<string, unknown> = {};
      for (const k of keys) {
        let v = fields[k];
        if (k === "tags") v = JSON.stringify(Array.isArray(v) ? v : String(v ?? "").split(",").map((t) => t.trim()).filter(Boolean));
        if (k === "target_duration_min") v = v === "" || v === null ? null : Number(v);
        if (k === "title" && !String(v ?? "").trim()) throw new WorkflowError("VALIDATION", "Title cannot be empty.");
        if ((item as Record<string, unknown>)[k] === v) continue;
        changes[k] = v;
        await audit(ctx, {
                    itemId,
                    action: "field.changed",
                    summary: `${actorName(ctx)} changed ${k.replace(/_/g, " ")}`,
                    oldValue: (item as Record<string, unknown>)[k],
                    newValue: v,
                  });
      }
      if (Object.keys(changes).length) await syncItem(itemId, now, changes);
    });
}

export async function setMemberships(
  ctx: Ctx,
  itemId: string,
  memberships: { gradeId: string; subjectId: string; unitId?: string | null; primary: boolean }[],
) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "change curriculum placement");
      if (!memberships.length || memberships.filter((m) => m.primary).length !== 1)
        throw new WorkflowError("VALIDATION", "Exactly one primary membership is required.");
      const old = await all("SELECT grade_id, subject_id, unit_id, is_primary FROM item_memberships WHERE item_id = ?", itemId);
      await run("DELETE FROM item_memberships WHERE item_id = ?", itemId);
      for (const m of memberships)
        await run(
                  "INSERT OR IGNORE INTO item_memberships (item_id, grade_id, subject_id, unit_id, is_primary) VALUES (?, ?, ?, ?, ?)",
                  itemId,
                  m.gradeId,
                  m.subjectId,
                  m.unitId ?? null,
                  m.primary ? 1 : 0,
                );
      await audit(ctx, { itemId, action: "membership.changed", summary: `${actorName(ctx)} updated curriculum placement`, oldValue: old, newValue: memberships });
      await syncItem(itemId, now);
    });
}

export async function setDestinations(ctx: Ctx, itemId: string, destinations: { platform: string; required: boolean }[]) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "change destinations");
      if (!destinations.some((d) => d.required)) throw new WorkflowError("VALIDATION", "At least one required destination is needed.");
      const existing = await targets(itemId);
      for (const t of existing) {
        const keep = destinations.find((d) => d.platform === t.platform);
        if (!keep) {
          if (t.release_status === "live") throw new WorkflowError("INVALID_STATE", `${t.platform} is already live and cannot be removed here.`);
          await run("DELETE FROM publication_targets WHERE id = ?", t.id);
        } else await run("UPDATE publication_targets SET required = ? WHERE id = ?", keep.required ? 1 : 0, t.id);
      }
      for (const d of destinations)
        if (!existing.find((t) => t.platform === d.platform))
          await run("INSERT INTO publication_targets (id, item_id, platform, required) VALUES (?, ?, ?, ?)", uid("pt_"), itemId, d.platform, d.required ? 1 : 0);
      await audit(ctx, {
              itemId,
              action: "destinations.changed",
              summary: `${actorName(ctx)} updated publication destinations`,
              oldValue: existing.map((t) => ({ platform: t.platform, required: !!t.required })),
              newValue: destinations,
            });
      await syncItem(itemId, now);
    });
}

export async function closeItem(ctx: Ctx, itemId: string, input: { lifecycle: "archived" | "cancelled"; reason: string }) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "archive or cancel items", "items.close");
      if (!input.reason?.trim()) throw new WorkflowError("VALIDATION", "A reason is required.");
      const item = await getItem(itemId);
      const attempt = await currentAttempt(itemId);
      if (attempt) {
        await endSessions(attempt.id, now, input.lifecycle);
        await setAttemptStatus(attempt, "superseded", now, input.lifecycle);
      }
      await audit(ctx, {
              itemId,
              action: `item.${input.lifecycle}`,
              summary: `${actorName(ctx)} ${input.lifecycle} ${item.code}`,
              oldValue: item.lifecycle,
              newValue: input.lifecycle,
              reason: input.reason,
            });
      await syncItem(itemId, now, { lifecycle: input.lifecycle, cancel_reason: input.reason });
    });
}

export async function restoreItem(ctx: Ctx, itemId: string, reason: string) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "restore items", "items.close");
      const item = await getItem(itemId);
      if (item.lifecycle !== "archived" && item.lifecycle !== "cancelled") throw new WorkflowError("INVALID_STATE", "Only archived or cancelled items can be restored.");
      const last = await get<AttemptRow>("SELECT * FROM stage_attempts WHERE item_id = ? ORDER BY entered_at DESC LIMIT 1", itemId);
      await audit(ctx, { itemId, action: "item.restored", summary: `${actorName(ctx)} restored ${item.code}`, reason });
      if (item.published_at) {
        await syncItem(itemId, now, { lifecycle: "published", cancel_reason: null });
        return;
      }
      if (!last) {
        await syncItem(itemId, now, { lifecycle: "draft", cancel_reason: null });
        return;
      }
      await run("UPDATE items SET lifecycle = 'in_production', cancel_reason = NULL WHERE id = ?", itemId);
      await openAttempt(ctx, itemId, last.stage, "reopened", `Restored: ${reason}`);
      await syncItem(itemId, now);
    });
}

export async function createRevision(ctx: Ctx, itemId: string, input: { reason: string; startStage?: Stage; dueAt?: string | null }) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "start a post-publication revision", "items.create");
      const item = await getItem(itemId);
      if (item.lifecycle !== "published") throw new WorkflowError("INVALID_STATE", "Revisions start from published items.");
      if (!input.reason?.trim()) throw new WorkflowError("VALIDATION", "Explain why the revision is needed.");
      const n = ((await get<{ c: number }>("SELECT COUNT(*) AS c FROM items WHERE revision_of_id = ?", itemId))?.c ?? 0) + 1;
      const primary = (await get<{ grade_id: string; subject_id: string; unit_id: string | null }>(
            "SELECT grade_id, subject_id, unit_id FROM item_memberships WHERE item_id = ? AND is_primary = 1",
            itemId,
          ))!;
      const secondary = await all<{ grade_id: string; subject_id: string; unit_id: string | null }>(
            "SELECT grade_id, subject_id, unit_id FROM item_memberships WHERE item_id = ? AND is_primary = 0",
            itemId,
          );
      const owners = Object.fromEntries(
        (await all<{ stage: Stage; user_id: string | null }>("SELECT stage, user_id FROM stage_assignments WHERE item_id = ?", itemId)).map((r) => [r.stage, r.user_id]),
      );
      const ts = await targets(itemId);
      const rev = await createItem(ctx, {
              lessonId: item.lesson_id,
              gradeId: primary.grade_id,
              subjectId: primary.subject_id,
              unitId: primary.unit_id,
              deliverableType: item.deliverable_type,
              title: item.title,
              titleAm: item.title_am,
              objectives: item.objectives,
              language: item.language,
              contentType: item.content_type,
              teacher: item.teacher,
              targetDurationMin: item.target_duration_min,
              complexity: item.complexity,
              complexityNote: item.complexity_note,
              priority: item.priority,
              tags: parseJson<string[]>(item.tags, []),
              dueAt: input.dueAt ?? null,
              owners,
              requiredDestinations: ts.filter((t) => t.required).map((t) => t.platform),
              optionalDestinations: ts.filter((t) => !t.required).map((t) => t.platform),
              secondaryMemberships: secondary.map((m) => ({ gradeId: m.grade_id, subjectId: m.subject_id, unitId: m.unit_id })),
              revisionOfId: itemId,
              code: `${item.code}-R${n}`,
            });
      await audit(ctx, {
              itemId,
              action: "revision.started",
              summary: `${actorName(ctx)} started revision ${rev.code}. The live version stays published until a replacement is verified.`,
              reason: input.reason,
              newValue: { revisionId: rev.id },
            });
      await releaseToProduction(ctx, rev.id, input.startStage ?? "editing");
      return rev.id;
    });
}

// ---------------------------------------------------------------------------
// Work sessions: stale review and corrections
// ---------------------------------------------------------------------------

export async function endStaleSession(ctx: Ctx, sessionId: string, endedAt: string, reason: string) {
  return await tx(async () => {
      const now = at(ctx);
      const s = await get<{ id: string; user_id: string; attempt_id: string; item_id: string; started_at: string; ended_at: string | null }>(
            "SELECT * FROM work_sessions WHERE id = ?",
            sessionId,
          );
      if (!s) throw new WorkflowError("NOT_FOUND", "Session not found.");
      if (s.ended_at) return;
      if (ctx.actor && ctx.actor.id !== s.user_id && !isManager(ctx.actor))
        throw new WorkflowError("FORBIDDEN", "Only the session owner or a manager can close this timer.");
      if (endedAt < s.started_at || endedAt > now) throw new WorkflowError("VALIDATION", "The end time must be between the start time and now.");
      await run("UPDATE work_sessions SET ended_at = ?, end_reason = 'stale_review', correction_reason = ? WHERE id = ?", endedAt, reason, sessionId);
      const attempt = (await get<AttemptRow>("SELECT * FROM stage_attempts WHERE id = ?", s.attempt_id))!;
      if (attempt.status === "in_progress" && (await openSessions(attempt.id)).length === 0) {
        // The active interval ends at the reviewed time, then the stage is paused.
        await run("UPDATE stage_intervals SET ended_at = ? WHERE attempt_id = ? AND ended_at IS NULL", endedAt, attempt.id);
        await openInterval(attempt.id, "paused", endedAt, "Stale session closed");
        await run("UPDATE stage_attempts SET status = 'paused' WHERE id = ?", attempt.id);
      }
      await audit(ctx, {
              itemId: s.item_id,
              attemptId: s.attempt_id,
              action: "session.stale_closed",
              summary: `${actorName(ctx)} closed a stale timer at the reviewed end time`,
              oldValue: { endedAt: null },
              newValue: { endedAt },
              reason,
            });
      await syncItem(s.item_id, now);
    });
}

export async function requestSessionCorrection(ctx: Ctx, sessionId: string, input: { startedAt: string; endedAt: string; reason: string }) {
  return await tx(async () => {
      const now = at(ctx);
      const s = await get<{ id: string; user_id: string; item_id: string }>("SELECT id, user_id, item_id FROM work_sessions WHERE id = ?", sessionId);
      if (!s) throw new WorkflowError("NOT_FOUND", "Session not found.");
      if (ctx.actor && ctx.actor.id !== s.user_id && !isManager(ctx.actor))
        throw new WorkflowError("FORBIDDEN", "You can only request corrections for your own sessions.");
      if (!input.reason?.trim()) throw new WorkflowError("VALIDATION", "A correction reason is required.");
      if (input.endedAt <= input.startedAt) throw new WorkflowError("VALIDATION", "The end must be after the start.");
      await run(
              `INSERT INTO session_corrections (id, session_id, requested_by, proposed_started_at, proposed_ended_at, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
              uid("cor_"),
              sessionId,
              actorId(ctx),
              input.startedAt,
              input.endedAt,
              input.reason,
              now,
            );
      await audit(ctx, { itemId: s.item_id, action: "session.correction_requested", summary: `${actorName(ctx)} requested a timer correction`, reason: input.reason, newValue: input });
      if (!ctx.silent)
        await notify(await managers(), { type: "approval", title: "Timer correction awaiting approval", body: input.reason, link: "/team?tab=corrections", itemId: s.item_id }, now, actorId(ctx) ?? undefined);
    });
}

export async function decideSessionCorrection(ctx: Ctx, correctionId: string, approve: boolean) {
  return await tx(async () => {
      const now = at(ctx);
      requireManagerCtx(ctx, "approve timer corrections", "corrections.approve");
      const c = await get<{ id: string; session_id: string; requested_by: string; proposed_started_at: string; proposed_ended_at: string; reason: string; status: string }>(
            "SELECT * FROM session_corrections WHERE id = ?",
            correctionId,
          );
      if (!c || c.status !== "pending") throw new WorkflowError("INVALID_STATE", "This correction was already decided.");
      const s = (await get<{ id: string; item_id: string; attempt_id: string; started_at: string; ended_at: string | null }>("SELECT * FROM work_sessions WHERE id = ?", c.session_id))!;
      await run("UPDATE session_corrections SET status = ?, decided_by = ?, decided_at = ? WHERE id = ?", approve ? "approved" : "rejected", actorId(ctx), now, correctionId);
      if (approve) {
        await run(
                  "UPDATE work_sessions SET corrected_from = ?, started_at = ?, ended_at = ?, corrected_by = ?, correction_reason = ? WHERE id = ?",
                  JSON.stringify({ startedAt: s.started_at, endedAt: s.ended_at }),
                  c.proposed_started_at,
                  c.proposed_ended_at,
                  actorId(ctx),
                  c.reason,
                  s.id,
                );
      }
      await audit(ctx, {
              itemId: s.item_id,
              attemptId: s.attempt_id,
              action: approve ? "session.corrected" : "session.correction_rejected",
              summary: `${actorName(ctx)} ${approve ? "approved" : "rejected"} a timer correction`,
              oldValue: { startedAt: s.started_at, endedAt: s.ended_at },
              newValue: approve ? { startedAt: c.proposed_started_at, endedAt: c.proposed_ended_at } : undefined,
              reason: c.reason,
            });
      if (!ctx.silent)
        await notify([c.requested_by], { type: "approval", title: `Timer correction ${approve ? "approved" : "rejected"}`, link: `/items/${s.item_id}`, itemId: s.item_id }, now);
    });
}

// ---------------------------------------------------------------------------
// Idempotent execution wrapper for UI actions
// ---------------------------------------------------------------------------

export async function once<T>(key: string | undefined, action: string, fn: () => T): Promise<T | { duplicate: true }> {
  if (!key) return fn();
  const seen = await get<{ key: string }>("SELECT key FROM idempotency_keys WHERE key = ?", key);
  if (seen) return { duplicate: true };
  return await tx(async () => {
      const result = fn();
      await run("INSERT INTO idempotency_keys (key, action, created_at) VALUES (?, ?, ?)", key, action, nowIso());
      return result;
    });
}

// ---------------------------------------------------------------------------
// Imported progress (Import, Stage progress): a team records work already done outside the app.
// ---------------------------------------------------------------------------

// Marks the item's current stage as done on the given date and opens the next stage (or publishes).
// Used only by imports: it records past work, so it does not ask for the live evidence checklist,
// and the history says it was imported.
export async function recordStageCompletion(ctx: Ctx, itemId: string, stage: Stage, input: { doneAt: string; note?: string | null; liveUrl?: string | null }) {
  return await tx(async () => {
    const now = at(ctx);
    await requireView(ctx, itemId);
    const u = ctx.actor;
    if (u && !isManager(u) && !isLeadOf(u, stage) && !hasRole(u, stage))
      throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[stage]} team can record ${STAGE_LABELS[stage].toLowerCase()} progress.`);
    const item = await getItem(itemId);
    if (item.lifecycle === "draft") await releaseToProduction({ ...ctx, actor: null }, itemId);
    const attempt = await requireAttempt(itemId);
    if (stageIndex(stage) < stageIndex(attempt.stage)) {
      // Already past this stage: only the date is corrected.
      await run(`UPDATE items SET ${STAGE_DATE_COLUMN[stage]} = ? WHERE id = ?`, input.doneAt, itemId);
      await syncItem(itemId, now);
      return "date" as const;
    }
    if (attempt.stage !== stage)
      throw new WorkflowError("INVALID_STATE", `${item.code} is still in ${STAGE_LABELS[attempt.stage]}. ${STAGE_LABELS[attempt.stage]} must be done first.`);
    await endSessions(attempt.id, now, "imported");
    await run(
      "UPDATE stage_attempts SET handoff_submitted_at = COALESCE(handoff_submitted_at, ?), completed_at = ?, notes = COALESCE(?, notes) WHERE id = ?",
      input.doneAt,
      input.doneAt,
      input.note ?? null,
      attempt.id,
    );
    await setAttemptStatus(attempt, "completed", now, "Imported progress");
    await run(`UPDATE items SET ${STAGE_DATE_COLUMN[stage]} = ? WHERE id = ?`, input.doneAt, itemId);
    await audit(ctx, {
      itemId,
      attemptId: attempt.id,
      stage,
      action: "stage.imported",
      summary: `${actorName(ctx)} imported ${STAGE_LABELS[stage].toLowerCase()} as done`,
      newValue: { doneAt: input.doneAt },
      reason: input.note ?? null,
      sourceOccurredAt: input.doneAt,
    });
    const next = NEXT_STAGE[stage];
    if (next) await openAttempt(ctx, itemId, next, "initial", "Previous stage imported as done");
    else {
      const live = input.liveUrl?.trim() || null;
      await run(
        "UPDATE publication_targets SET release_status = 'live', live_url = COALESCE(?, live_url), published_at = COALESCE(published_at, ?), verified_at = ? WHERE item_id = ? AND required = 1",
        live,
        input.doneAt,
        now,
        itemId,
      );
      await run(
        "UPDATE items SET lifecycle = 'published', published_at = ?, publication_verified_at = ?, live_url = COALESCE(?, live_url) WHERE id = ?",
        input.doneAt,
        now,
        live,
        itemId,
      );
      await audit(ctx, { itemId, stage, action: "item.published", summary: `${item.code} recorded as published (imported)` });
    }
    await syncItem(itemId, now);
    return "done" as const;
  });
}
