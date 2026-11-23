// A team member accepts or rejects work assigned to them, with their reason. Accepting keeps it theirs (the note is
// for the lead). Rejecting needs a reason: the part goes back to the team lead to give to someone else, and the leads
// are told why. Only the person it is assigned to answers, and only before they start it.

import { all, get, nowIso, run, uid } from "./db";
import { notify, teamLeads } from "./notifications";
import { audit, WorkflowError } from "./workflow";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import type { AppUser } from "./users";

export type AssignmentResponse = { decision: "accepted" | "declined"; reason: string | null; at: string };

export async function latestResponses(userId: string, itemIds: string[]): Promise<Map<string, AssignmentResponse>> {
  const out = new Map<string, AssignmentResponse>();
  if (!itemIds.length) return out;
  const rows = await all<{ item_id: string; decision: string; reason: string | null; created_at: string }>(
    `SELECT item_id, decision, reason, created_at FROM assignment_responses WHERE user_id = ? AND item_id IN (${itemIds.map(() => "?").join(",")}) ORDER BY created_at`,
    userId,
    ...itemIds,
  );
  for (const r of rows) out.set(r.item_id, { decision: r.decision as AssignmentResponse["decision"], reason: r.reason, at: r.created_at });
  return out;
}

export async function respondToAssignment(user: AppUser, itemId: string, decision: "accepted" | "declined", reason?: string | null) {
  const note = String(reason ?? "").replace(/\s+/g, " ").trim().slice(0, 500);
  if (decision !== "accepted" && decision !== "declined") throw new WorkflowError("VALIDATION", "Accept or reject.");
  if (decision === "declined" && note.length < 3) throw new WorkflowError("VALIDATION", "Say why you cannot take it, so the lead can give it to someone else.");
  const item = await get<{ id: string; code: string; title: string; lifecycle: string; current_attempt_id: string | null }>("SELECT id, code, title, lifecycle, current_attempt_id FROM items WHERE id = ?", itemId);
  if (!item) throw new WorkflowError("NOT_FOUND", "Not found.");
  // Theirs and not started: a queued attempt they own, or a Recording assignment not yet in production.
  const attempt = item.current_attempt_id
    ? await get<{ id: string; stage: Stage; status: string; owner_id: string | null; started_at: string | null }>("SELECT id, stage, status, owner_id, started_at FROM stage_attempts WHERE id = ?", item.current_attempt_id)
    : undefined;
  const draft = await get<{ stage: Stage; user_id: string | null }>("SELECT stage, user_id FROM stage_assignments WHERE item_id = ? AND user_id = ? AND stage = 'recording'", itemId, user.id);
  let stage: Stage | null = null;
  if (attempt && attempt.owner_id === user.id && attempt.status === "queued" && !attempt.started_at) stage = attempt.stage;
  else if (item.lifecycle === "draft" && draft) stage = "recording";
  if (!stage) throw new WorkflowError("FORBIDDEN", "You can answer only work assigned to you that you have not started.");
  const now = nowIso();
  await run("INSERT INTO assignment_responses (id, item_id, stage, user_id, decision, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("asr_"), itemId, stage, user.id, decision, note || null, now);
  if (decision === "declined") {
    // Back to the lead: nobody owns it until the lead gives it to someone.
    if (attempt && attempt.owner_id === user.id && attempt.stage === stage) await run("UPDATE stage_attempts SET owner_id = NULL WHERE id = ?", attempt.id);
    await run("UPDATE stage_assignments SET user_id = NULL WHERE item_id = ? AND stage = ? AND user_id = ?", itemId, stage, user.id);
  }
  const leads = await teamLeads(stage);
  await notify(
    leads,
    {
      type: "assignment",
      title: decision === "declined" ? `${user.name} rejected ${item.code}` : `${user.name} accepted ${item.code}`,
      body: `${item.title} (${STAGE_LABELS[stage]})${note ? `: ${note}` : ""}${decision === "declined" ? ". It is back with you to give to someone else." : ""}`,
      link: `/items/${itemId}`,
      itemId,
    },
    now,
    user.id,
  );
  await audit({ actor: user }, { action: `assignment.${decision}`, itemId, summary: `${user.name} ${decision === "declined" ? "rejected" : "accepted"} ${item.code}${note ? `: ${note}` : ""}` });
  return { decision, stage };
}
