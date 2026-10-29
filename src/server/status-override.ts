// Bulk status changes with a required reason. Each change runs through the workflow engine with system
// authority (handoff records, the next stage opening, publication and notifications behave as usual); only
// handoff evidence checks are skipped, and what was missing is written into the stage notes with the reason.
// The acting person is kept on a "status.override" audit entry and in the notes.

import { get, nowIso, run, tx, uid } from "./db";
import {
  acceptHandoff,
  audit,
  endSessions,
  getItem,
  missingRequirements,
  releaseToProduction,
  reopenStage,
  requireAttempt,
  setAttemptStatus,
  STAGE_DATE_COLUMN,
  submitHandoff,
  syncItem,
  WorkflowError,
  type AttemptRow,
  type Ctx,
} from "./workflow";
import { can, canViewItem, isLeadOf, type AppUser } from "./users";
import { NEXT_STAGE, SHEET_STATUS_OPTIONS, STAGE_LABELS, STAGES, stageIndex, type Stage } from "@/lib/domain";

export type OverrideResult = { id: string; code: string; ok: boolean; error?: string; plan?: string };

export function canOverrideStage(user: AppUser, stage: Stage) {
  return can(user, "work.override") || can(user, "data.manage") || isLeadOf(user, stage);
}

function targetLabel(stage: Stage, value: string) {
  return SHEET_STATUS_OPTIONS[stage].find((o) => o.value === value)?.label ?? value;
}

async function appendNote(attemptId: string, actor: AppUser, text: string) {
  const line = `[${nowIso().slice(0, 10)} ${actor.name}] ${text}`;
  await run("UPDATE stage_attempts SET notes = CASE WHEN notes IS NULL OR notes = '' THEN ? ELSE notes || ? END WHERE id = ?", line, `\n${line}`, attemptId);
}

// Applies the target on the item's current attempt, which is already at the chosen stage.
async function applyHere(sys: Ctx, actor: AppUser, itemId: string, attempt: AttemptRow, value: string, reason: string) {
  const now = nowIso();
  const stage = attempt.stage;
  if (value !== "blocked" && attempt.status === "blocked")
    await run(
      "UPDATE blockers SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE attempt_id = ? AND resolved_at IS NULL",
      now,
      actor.id,
      `Status changed by ${actor.name}: ${reason}`,
      attempt.id,
    );
  if (value !== "in_progress" && !value.startsWith("sub:")) await endSessions(attempt.id, now, "status override");
  const started = async () => {
    if (!attempt.first_started_at) await run("UPDATE stage_attempts SET first_started_at = ? WHERE id = ?", now, attempt.id);
  };

  switch (value) {
    case "queued":
      if (stage === "publication") await run("UPDATE stage_attempts SET substate = 'pending_review' WHERE id = ?", attempt.id);
      await setAttemptStatus(attempt, "queued", now, reason);
      break;
    case "in_progress":
      await started();
      if (stage === "uploading" && !attempt.substate) await run("UPDATE stage_attempts SET substate = 'uploading' WHERE id = ?", attempt.id);
      await setAttemptStatus(attempt, "in_progress", now, reason);
      break;
    case "paused":
      await started();
      await setAttemptStatus(attempt, "paused", now, reason);
      break;
    case "blocked":
      if (attempt.status !== "blocked") {
        await run(
          "INSERT INTO blockers (id, attempt_id, item_id, cause, note, opened_by, opened_at) VALUES (?, ?, ?, 'other', ?, ?, ?)",
          uid("blk_"),
          attempt.id,
          itemId,
          reason,
          actor.id,
          now,
        );
        await setAttemptStatus(attempt, "blocked", now, reason);
      }
      break;
    case "awaiting_handoff":
      await submit(sys, actor, itemId, attempt, reason);
      break;
    case "completed":
      await complete(sys, actor, itemId, attempt, reason);
      return;
    default: {
      if (!value.startsWith("sub:")) throw new WorkflowError("VALIDATION", "Unknown status.");
      const sub = value.slice(4);
      if (stage === "uploading" && ["uploading", "processing", "failed"].includes(sub)) {
        await started();
        await run("UPDATE stage_attempts SET substate = ? WHERE id = ?", sub, attempt.id);
        if (attempt.status !== "in_progress" && attempt.status !== "paused") await setAttemptStatus(attempt, "in_progress", now, reason);
      } else if (stage === "publication" && ["changes_requested", "ready", "scheduled", "failed"].includes(sub)) {
        await run("UPDATE stage_attempts SET substate = ? WHERE id = ?", sub, attempt.id);
        if (attempt.status === "blocked" || attempt.status === "awaiting_handoff") await setAttemptStatus(attempt, "queued", now, reason);
      } else throw new WorkflowError("VALIDATION", `${targetLabel(stage, value)} does not apply to ${STAGE_LABELS[stage]}.`);
    }
  }
  await syncItem(itemId, now);
}

// Submits the handoff, through the engine when the evidence is complete, otherwise directly with a note.
async function submit(sys: Ctx, actor: AppUser, itemId: string, attempt: AttemptRow, reason: string) {
  if (attempt.stage === "publication") throw new WorkflowError("INVALID_STATE", "Publication has no handoff. Choose Published instead.");
  if (attempt.status === "awaiting_handoff") return;
  const now = nowIso();
  if (attempt.status === "blocked") await setAttemptStatus(attempt, attempt.first_started_at ? "paused" : "queued", now, reason);
  const missing = await missingRequirements(itemId, attempt);
  if (!missing.length) {
    await submitHandoff(sys, itemId, {});
    return;
  }
  await appendNote(attempt.id, actor, `Submitted without: ${missing.map((m) => m.label).join("; ")}`);
  await endSessions(attempt.id, now, "handoff");
  await run("UPDATE stage_attempts SET handoff_submitted_at = ? WHERE id = ?", now, attempt.id);
  if (attempt.stage === "uploading") await run("UPDATE stage_attempts SET substate = 'uploaded' WHERE id = ?", attempt.id);
  await run(`UPDATE items SET ${STAGE_DATE_COLUMN[attempt.stage]} = ? WHERE id = ?`, now, itemId);
  await setAttemptStatus(attempt, "awaiting_handoff", now, reason);
  await syncItem(itemId, now);
}

// Marks the stage done: submit if needed, then accept (which opens the next stage), or publish.
async function complete(sys: Ctx, actor: AppUser, itemId: string, attempt: AttemptRow, reason: string) {
  const now = nowIso();
  if (attempt.stage === "publication") {
    await endSessions(attempt.id, now, "status override");
    await run("UPDATE stage_attempts SET completed_at = ?, substate = NULL WHERE id = ?", now, attempt.id);
    await setAttemptStatus(attempt, "completed", now, reason);
    await run(
      "UPDATE publication_targets SET release_status = 'live', published_at = COALESCE(published_at, ?), verified_at = ?, verified_by = ? WHERE item_id = ? AND required = 1",
      now,
      now,
      actor.id,
      itemId,
    );
    await run("UPDATE items SET lifecycle = 'published', published_at = COALESCE(published_at, ?), publication_verified_at = ? WHERE id = ?", now, now, itemId);
    await audit(sys, { itemId, stage: "publication", action: "item.published", summary: `Marked published by ${actor.name}`, reason });
    await syncItem(itemId, now);
    return;
  }
  await submit(sys, actor, itemId, attempt, reason);
  await acceptHandoff(sys, itemId, { note: `Status changed by ${actor.name}: ${reason}` });
}

// What a change would do, as one line, without changing anything.
async function plan(itemId: string, stage: Stage, value: string): Promise<{ text: string; noop?: boolean }> {
  const item = await getItem(itemId);
  const label = `${STAGE_LABELS[stage]}: ${targetLabel(stage, value)}`;
  if (item.lifecycle === "archived" || item.lifecycle === "cancelled") throw new WorkflowError("INVALID_STATE", "Closed item. Restore it first.");
  if (item.lifecycle === "published") {
    if (stage === "publication" && value === "completed") return { text: "Already published", noop: true };
    throw new WorkflowError("INVALID_STATE", "Published. Changes after publication use a revision.");
  }
  const current: Stage = item.lifecycle === "draft" ? "recording" : (item.stage ?? "recording");
  const steps: string[] = [];
  if (item.lifecycle === "draft") steps.push("Release to Recording");
  const ci = stageIndex(current);
  const si = stageIndex(stage);
  if (si > ci) steps.push(`Mark ${STAGES.slice(ci, si).map((s) => STAGE_LABELS[s]).join(", ")} done`);
  if (si < ci) {
    if (value === "completed") return { text: `${STAGE_LABELS[stage]} is already done`, noop: true };
    steps.push(`Reopen ${STAGE_LABELS[stage]} (${STAGE_LABELS[current]} is set aside)`);
  }
  if (si === ci && item.stage_status && value === item.stage_status && !value.startsWith("sub:")) return { text: `Already ${targetLabel(stage, value)}`, noop: true };
  if (value === "completed" && NEXT_STAGE[stage]) steps.push(`${label}, ${STAGE_LABELS[NEXT_STAGE[stage]!]} opens`);
  else steps.push(label);
  return { text: steps.join(" → ") };
}

export async function overrideStatus(actor: AppUser, ids: string[], input: { stage: Stage; value: string; reason: string }, dryRun: boolean): Promise<OverrideResult[]> {
  const { stage, value } = input;
  const reason = input.reason?.trim();
  if (!STAGES.includes(stage)) throw new WorkflowError("VALIDATION", "Choose a stage.");
  if (!SHEET_STATUS_OPTIONS[stage].some((o) => o.value === value)) throw new WorkflowError("VALIDATION", "Choose a status for that stage.");
  if (!reason) throw new WorkflowError("VALIDATION", "A reason is required. It is saved in the stage notes and the audit log.");
  const results: OverrideResult[] = [];
  for (const id of ids.slice(0, 500)) {
    const row = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", id);
    if (!row) continue;
    try {
      if (!(await canViewItem(actor, id))) throw new WorkflowError("FORBIDDEN", "Outside your grade and subject access.");
      const p = await plan(id, stage, value);
      const item = await getItem(id);
      const from: Stage = item.lifecycle === "draft" ? "recording" : (item.stage ?? "recording");
      // Every stage the change passes through needs override rights for that stage.
      const touched = STAGES.slice(Math.min(stageIndex(from), stageIndex(stage)), Math.max(stageIndex(from), stageIndex(stage)) + 1);
      const denied = touched.find((s) => !canOverrideStage(actor, s));
      if (denied) throw new WorkflowError("FORBIDDEN", `You cannot change ${STAGE_LABELS[denied]} status.`);
      if (dryRun || p.noop) {
        results.push({ id, code: row.code, ok: true, plan: p.text });
        continue;
      }
      await tx(async () => {
        const sys: Ctx = { actor: null, source: "bulk" };
        const note = `Status set to ${STAGE_LABELS[stage]}: ${targetLabel(stage, value)}. Reason: ${reason}`;
        if ((await getItem(id)).lifecycle === "draft") await releaseToProduction(sys, id);
        let attempt = await requireAttempt(id);
        while (stageIndex(attempt.stage) < stageIndex(stage)) {
          await appendNote(attempt.id, actor, `Marked done to reach ${STAGE_LABELS[stage]}. Reason: ${reason}`);
          await complete(sys, actor, id, attempt, reason);
          attempt = await requireAttempt(id);
        }
        if (stageIndex(attempt.stage) > stageIndex(stage)) {
          await reopenStage(sys, id, { target: stage, reasonCategory: "other", note: `Status changed by ${actor.name}: ${reason}` });
          attempt = await requireAttempt(id);
        }
        await appendNote(attempt.id, actor, note);
        await applyHere(sys, actor, id, attempt, value, reason);
        await audit({ actor, source: "bulk" }, { itemId: id, attemptId: attempt.id, stage, action: "status.override", summary: `${actor.name} set ${row.code} ${STAGE_LABELS[stage]} to ${targetLabel(stage, value)}`, newValue: { stage, value }, reason });
      });
      results.push({ id, code: row.code, ok: true, plan: p.text });
    } catch (err) {
      results.push({ id, code: row.code, ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return results;
}
