"use server";

import { requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { get, nowIso, run, uid } from "@/server/db";
import { can, isManager, canViewItem } from "@/server/users";
import { evaluateRequirements, getItem, WorkflowError } from "@/server/workflow";
import * as wf from "@/server/workflow";
import { audit } from "@/server/workflow";
import { REDO_LABELS, RETURN_REASON_LABELS, type AssetKind, type Stage } from "@/lib/domain";
import { postCard, stageGroup } from "@/server/chat";

export type ItemActionInput =
  | { action: "release"; startStage?: Stage }
  | { action: "start"; switchFrom?: boolean }
  | { action: "pause"; reason?: string }
  | { action: "block"; cause: string; note?: string; resolverId?: string | null }
  | { action: "unblock"; resolution?: string; resume?: boolean }
  | { action: "submit"; note?: string }
  | { action: "finish" }
  | { action: "reopenFinished" }
  | { action: "submitLead"; note?: string }
  | { action: "leadApprove"; note?: string }
  | { action: "leadReturn"; note: string }
  | { action: "accept"; note?: string }
  | { action: "return"; reasonCategory: string; note: string }
  | { action: "reopen"; target: Stage; reasonCategory: string; note: string }
  | { action: "redo"; target: Stage; reasonCategory: string; note: string }
  | { action: "stageDate"; stage: Stage; date: string | null }
  | { action: "asset"; kind: AssetKind; url?: string | null; cameraCode?: string | null; label?: string; durationMin?: number | null; notes?: string }
  | { action: "stageNotes"; notes: string | null }
  | { action: "checklist"; key: string; checked: boolean }
  | { action: "durations"; rawDurationMin?: number | null; actualDurationMin?: number | null }
  | { action: "upload"; platform: string; status: "uploading" | "processing" | "uploaded" | "failed"; externalId?: string; uploadUrl?: string; failureReason?: string }
  | { action: "uploadSubstate"; substate: "uploading" | "processing" }
  | { action: "verify"; platform: string; playback?: boolean; metadata?: boolean }
  | { action: "review"; decision: "approved" | "changes_requested"; reasonCategory?: string; note?: string; returnTo?: Stage | null; managerApproval?: boolean }
  | { action: "schedule"; scheduledAt: string }
  | { action: "live"; platform: string; liveUrl: string; publishedAt?: string | null; overrideReason?: string }
  | { action: "releaseFailed"; platform: string; reason: string }
  | { action: "assign"; stage: Stage; userId: string | null; reason?: string }
  | { action: "deadline"; dueAt: string | null; reason: string }
  | { action: "stageDue"; stage: Stage; dueAt: string | null }
  | { action: "fields"; fields: Record<string, unknown> }
  | { action: "memberships"; memberships: { gradeId: string; subjectId: string; unitId?: string | null; primary: boolean }[] }
  | { action: "destinations"; destinations: { platform: string; required: boolean }[] }
  | { action: "close"; lifecycle: "archived" | "cancelled"; reason: string }
  | { action: "restore"; reason: string }
  | { action: "revision"; reason: string; startStage?: Stage; dueAt?: string | null }
  | { action: "staleClose"; sessionId: string; endedAt: string; reason: string }
  | { action: "correction"; sessionId: string; startedAt: string; endedAt: string; reason: string }
  | { action: "recordingSession"; scheduledStart: string; durationMin: number; presenter?: string; location?: string; notes?: string }
  | { action: "recordingSessionStatus"; sessionId: string; status: "scheduled" | "completed" | "cancelled" | "rescheduled"; note?: string };

export async function itemAction(itemId: string, input: ItemActionInput, opts: { expectedVersion?: number; requestId?: string; source?: "ui" | "sheet" | "board" | "bulk" } = {}) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const ctx: wf.Ctx = { actor: viewer, requestId: opts.requestId, source: opts.source ?? "ui" };
    const v = opts.expectedVersion;
    return await wf.once(opts.requestId, input.action, async () => {
          switch (input.action) {
            case "release":
              return await wf.releaseToProduction(ctx, itemId, input.startStage);
            case "start":
              return await wf.startWork(ctx, itemId, { expectedVersion: v, switchFrom: input.switchFrom });
            case "pause":
              return await wf.pauseWork(ctx, itemId, { reason: input.reason, expectedVersion: v });
            case "block":
              return await wf.blockWork(ctx, itemId, { cause: input.cause, note: input.note, resolverId: input.resolverId, expectedVersion: v });
            case "unblock":
              return await wf.unblockWork(ctx, itemId, { resolution: input.resolution, resume: input.resume, expectedVersion: v });
            case "submit":
              return await wf.submitHandoff(ctx, itemId, { note: input.note, expectedVersion: v });
            case "finish":
              return await wf.finishWork(ctx, itemId);
            case "reopenFinished":
              return await wf.reopenFinished(ctx, itemId);
            case "submitLead":
              return await wf.submitToLead(ctx, itemId, { note: input.note });
            case "leadApprove":
              return await wf.leadDecide(ctx, itemId, { decision: "approve", note: input.note });
            case "leadReturn":
              return await wf.leadDecide(ctx, itemId, { decision: "return", note: input.note });
            case "accept":
              return await wf.acceptHandoff(ctx, itemId, { note: input.note, expectedVersion: v });
            case "return":
              return await wf.returnHandoff(ctx, itemId, { reasonCategory: input.reasonCategory, note: input.note, expectedVersion: v });
            case "reopen":
              return await wf.reopenStage(ctx, itemId, { target: input.target, reasonCategory: input.reasonCategory, note: input.note, expectedVersion: v });
            case "asset":
              return await wf.addAsset(ctx, itemId, input);
            case "stageNotes":
              return await wf.setStageNotes(ctx, itemId, input.notes);
            case "redo": {
              // Return a waiting handoff, or reopen an earlier stage, then tell that team in its chat.
              const attempt = await wf.currentAttempt(itemId);
              if (!attempt) throw new WorkflowError("INVALID_STATE", "This item is not in production.");
              const from = attempt.stage;
              if (attempt.status === "awaiting_handoff" && attempt.stage === input.target)
                await wf.returnHandoff(ctx, itemId, { reasonCategory: input.reasonCategory, note: input.note, expectedVersion: v });
              else await wf.reopenStage(ctx, itemId, { target: input.target, reasonCategory: input.reasonCategory, note: input.note, expectedVersion: v });
              const item = await getItem(itemId);
              const label = REDO_LABELS[input.target];
              await postCard(await stageGroup(input.target), viewer.id, {
                kind: "request",
                body: `${label} for ${item.code} (${item.title}): ${input.note}`,
                itemId,
                meta: { label, target: input.target, from, reason: RETURN_REASON_LABELS[input.reasonCategory] ?? input.reasonCategory },
              });
              return;
            }
            case "stageDate":
              return await wf.setStageDate(ctx, itemId, input.stage, input.date);
            case "checklist":
              return await wf.setChecklist(ctx, itemId, input.key, input.checked);
            case "durations":
              return await wf.setDurations(ctx, itemId, input);
            case "upload":
              return await wf.recordUpload(ctx, itemId, { ...input, expectedVersion: v });
            case "uploadSubstate":
              return await wf.setUploadSubstate(ctx, itemId, input.substate);
            case "verify":
              return await wf.verifyTarget(ctx, itemId, input);
            case "review":
              return await wf.reviewPublication(ctx, itemId, { ...input, expectedVersion: v });
            case "schedule":
              return await wf.schedulePublication(ctx, itemId, { scheduledAt: input.scheduledAt, expectedVersion: v });
            case "live":
              return await wf.confirmLive(ctx, itemId, { ...input, expectedVersion: v });
            case "releaseFailed":
              return await wf.markReleaseFailed(ctx, itemId, input);
            case "assign":
              return await wf.assignStage(ctx, itemId, { ...input, expectedVersion: v });
            case "deadline":
              return await wf.changeDeadline(ctx, itemId, { ...input, expectedVersion: v });
            case "stageDue": {
              if (!can(viewer, "items.plan")) throw new WorkflowError("FORBIDDEN", "You do not have permission to set stage deadlines.");
              const old = await get<{ stage_due_at: string | null }>("SELECT stage_due_at FROM stage_assignments WHERE item_id = ? AND stage = ?", itemId, input.stage);
              await run("UPDATE stage_assignments SET stage_due_at = ? WHERE item_id = ? AND stage = ?", input.dueAt, itemId, input.stage);
              await audit(ctx, { itemId, stage: input.stage, action: "deadline.stage", summary: `${viewer.name} set the ${input.stage} target date`, oldValue: old?.stage_due_at ?? null, newValue: input.dueAt });
              await wf.syncItem(itemId, nowIso());
              return;
            }
            case "fields":
              return await wf.updateItemFields(ctx, itemId, input.fields, v);
            case "memberships":
              return await wf.setMemberships(ctx, itemId, input.memberships);
            case "destinations":
              return await wf.setDestinations(ctx, itemId, input.destinations);
            case "close":
              return await wf.closeItem(ctx, itemId, input);
            case "restore":
              return await wf.restoreItem(ctx, itemId, input.reason);
            case "revision":
              return await wf.createRevision(ctx, itemId, input);
            case "staleClose":
              return await wf.endStaleSession(ctx, input.sessionId, input.endedAt, input.reason);
            case "correction":
              return await wf.requestSessionCorrection(ctx, input.sessionId, input);
            case "recordingSession": {
              if (!await canViewItem(viewer, itemId)) throw new WorkflowError("FORBIDDEN", "This item is outside your access scope.");
              if (!isManager(viewer) && !viewer.roles.includes("recording")) throw new WorkflowError("FORBIDDEN", "Only Recording staff can book sessions.");
              if (!input.scheduledStart) throw new WorkflowError("VALIDATION", "Choose a start time.");
              const id = uid("rs_");
              await run(
                              "INSERT INTO recording_sessions (id, item_id, scheduled_start, duration_min, presenter, location, status, outcome_note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)",
                              id,
                              itemId,
                              input.scheduledStart,
                              input.durationMin || 60,
                              input.presenter || null,
                              input.location || null,
                              input.notes || null,
                              viewer.id,
                              nowIso(),
                            );
              await audit(ctx, { itemId, stage: "recording", action: "recording.scheduled", summary: `${viewer.name} booked a recording session`, newValue: input });
              return id;
            }
            case "recordingSessionStatus": {
              if (!isManager(viewer) && !viewer.roles.includes("recording")) throw new WorkflowError("FORBIDDEN", "Only Recording staff can update sessions.");
              const old = await get<{ status: string }>("SELECT status FROM recording_sessions WHERE id = ? AND item_id = ?", input.sessionId, itemId);
              if (!old) throw new WorkflowError("NOT_FOUND", "Session not found.");
              await run("UPDATE recording_sessions SET status = ?, outcome_note = COALESCE(?, outcome_note) WHERE id = ?", input.status, input.note ?? null, input.sessionId);
              await audit(ctx, { itemId, stage: "recording", action: "recording.session", summary: `${viewer.name} marked a recording session ${input.status}`, oldValue: old.status, newValue: input.status, reason: input.note ?? null });
              return;
            }
          }
        });
  });
}

export async function requirementsAction(itemId: string) {
  return wrap(
    async () => {
      const viewer = await requireViewer();
      if (!await canViewItem(viewer, itemId)) throw new WorkflowError("FORBIDDEN", "Outside your scope.");
      const item = await getItem(itemId);
      const attempt = await wf.currentAttempt(itemId);
      return {
        requirements: await evaluateRequirements(itemId),
        version: item.version,
        stage: item.stage,
        status: item.stage_status,
        substate: item.substate,
        lifecycle: item.lifecycle,
        ownerId: attempt?.owner_id ?? null,
        targets: (await wf.targets(itemId)).map((t) => ({
          platform: t.platform,
          required: !!t.required,
          uploadStatus: t.upload_status,
          releaseStatus: t.release_status,
          externalId: t.external_id,
          uploadUrl: t.upload_url,
          liveUrl: t.live_url,
          playback: !!t.playback_checked,
          metadata: !!t.metadata_checked,
        })),
        canPublish: viewer.roles.includes("publication"),
        hasApproval: attempt?.stage === "publication" ? !!await wf.validApproval(itemId, attempt.id) : false,
      };
    },
    { revalidate: false },
  );
}

export async function createItemAction(input: wf.CreateItemInput) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const item = await wf.createItem({ actor: viewer, source: "ui" }, input);
    return { id: item.id, code: item.code };
  });
}

export type BulkInput =
  | { action: "assign"; stage: Stage; userId: string | null; reason?: string }
  | { action: "priority"; priority: string }
  | { action: "deadline"; dueAt: string | null; reason: string }
  | { action: "release" }
  | { action: "accept" }
  | { action: "submit" }
  | { action: "submitLead" }
  | { action: "leadApprove" }
  | { action: "tags"; tags: string[] };

// Bulk changes run row by row through the same engine rules; ineligible rows are reported, never forced.
export async function bulkAction(ids: string[], input: BulkInput, dryRun = false) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const results: { id: string; code: string; ok: boolean; error?: string; missing?: string[] }[] = [];
    for (const id of ids.slice(0, 500)) {
      const item = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", id);
      if (!item) continue;
      const ctx: wf.Ctx = { actor: viewer, source: "bulk" };
      try {
        if (dryRun) {
          if (input.action === "submit") {
            const missing = await wf.missingRequirements(id);
            results.push({ id, code: item.code, ok: missing.length === 0, missing: missing.map((m) => m.label) });
            continue;
          }
          if (input.action === "accept") {
            const a = await wf.currentAttempt(id);
            results.push({ id, code: item.code, ok: a?.status === "awaiting_handoff", error: a?.status === "awaiting_handoff" ? undefined : "No handoff waiting" });
            continue;
          }
          if (input.action === "release") {
            const it = await getItem(id);
            results.push({ id, code: item.code, ok: it.lifecycle === "draft", error: it.lifecycle === "draft" ? undefined : "Not a draft" });
            continue;
          }
          results.push({ id, code: item.code, ok: can(viewer, "items.plan"), error: can(viewer, "items.plan") ? undefined : "Not permitted for your role" });
          continue;
        }
        switch (input.action) {
          case "assign":
            await wf.assignStage(ctx, id, input);
            break;
          case "priority":
            await wf.updateItemFields(ctx, id, { priority: input.priority });
            break;
          case "deadline":
            await wf.changeDeadline(ctx, id, input);
            break;
          case "release":
            await wf.releaseToProduction(ctx, id);
            break;
          case "accept":
            await wf.acceptHandoff(ctx, id);
            break;
          case "submit":
            await wf.submitHandoff(ctx, id);
            break;
          case "submitLead":
            await wf.submitToLead(ctx, id);
            break;
          case "leadApprove":
            await wf.leadDecide(ctx, id, { decision: "approve" });
            break;
          case "tags":
            await wf.updateItemFields(ctx, id, { tags: input.tags });
            break;
        }
        results.push({ id, code: item.code, ok: true });
      } catch (err) {
        results.push({
          id,
          code: item.code,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          missing: err instanceof WorkflowError && err.code === "REQUIREMENTS_MISSING" ? (err.details as { label: string }[]).map((m) => m.label) : undefined,
        });
      }
    }
    return results;
  }, { revalidate: !dryRun });
}
