// Review notes pinned to a time in the master ("0:42: trim the silence"), and what changed since a lead returned
// the work. Leads (and managers, and Publication on its own stage) write notes; the person doing the work ticks them
// off as fixed.

import { all, get, nowIso, run, uid } from "./db";
import { audit, currentAttempt, leadsStage, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { canViewItem, hasRole, type AppUser } from "./users";
import { STAGE_LABELS } from "@/lib/domain";

export type ReviewNote = { id: string; atSec: number | null; note: string; author: string | null; createdAt: string; resolved: boolean; resolvedBy: string | null };

export const fmtTimecode = (sec: number | null) => (sec === null ? "" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);

export async function reviewNotes(itemId: string, attemptId: string): Promise<ReviewNote[]> {
  const rows = await all<{ id: string; at_sec: number | null; note: string; author: string | null; created_at: string; resolved_at: string | null; resolver: string | null }>(
    `SELECT n.id, n.at_sec, n.note, a.name AS author, n.created_at, n.resolved_at, r.name AS resolver FROM item_review_notes n
     LEFT JOIN users a ON a.id = n.author_id LEFT JOIN users r ON r.id = n.resolved_by
     WHERE n.item_id = ? AND n.attempt_id = ? ORDER BY n.at_sec IS NULL, n.at_sec, n.created_at`,
    itemId,
    attemptId,
  );
  return rows.map((r) => ({ id: r.id, atSec: r.at_sec === null ? null : Number(r.at_sec), note: r.note, author: r.author, createdAt: r.created_at, resolved: !!r.resolved_at, resolvedBy: r.resolver }));
}

// What happened on this attempt after the lead last returned it: new links, checklist ticks, lengths and notes.
export async function changesSinceReturn(itemId: string, attemptId: string) {
  const ret = await get<{ occurred_at: string; reason: string | null }>(
    "SELECT occurred_at, reason FROM audit_events WHERE attempt_id = ? AND action = 'lead.returned' ORDER BY occurred_at DESC LIMIT 1",
    attemptId,
  );
  if (!ret) return null;
  const rows = await all<{ summary: string; occurred_at: string; action: string }>(
    `SELECT summary, occurred_at, action FROM audit_events WHERE item_id = ? AND attempt_id = ? AND occurred_at > ?
       AND action NOT LIKE 'lead.%' AND action NOT IN ('work.started','work.resumed','work.paused','session.ended')
     ORDER BY occurred_at LIMIT 30`,
    itemId,
    attemptId,
    ret.occurred_at,
  );
  return { returnedAt: ret.occurred_at, reason: ret.reason, changes: rows.map((r) => ({ summary: r.summary, at: r.occurred_at })) };
}

async function context(user: AppUser, itemId: string) {
  if (!(await canViewItem(user, itemId))) throw new WorkflowError("FORBIDDEN", "You cannot open this item.");
  const a = await currentAttempt(itemId);
  if (!a) throw new WorkflowError("INVALID_STATE", "This item is not in production.");
  const reviewer = leadsStage(user, a.stage) || (a.stage === "publication" && hasRole(user, "publication"));
  const worker = a.owner_id === user.id;
  return { a, reviewer, worker };
}

// "1:05", "65" or "0:01:05" to seconds.
export function parseTimecode(v: string | null | undefined): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0) || parts.length > 3) throw new WorkflowError("VALIDATION", "Write the time as m:ss, for example 1:05.");
  return parts.reduce((acc, p) => acc * 60 + Math.floor(p), 0);
}

export async function addReviewNote(user: AppUser, itemId: string, input: { at?: string | null; note: string }) {
  const { a, reviewer } = await context(user, itemId);
  if (!reviewer) throw new WorkflowError("FORBIDDEN", `Only the ${STAGE_LABELS[a.stage]} team lead adds review notes.`);
  const note = String(input.note ?? "").trim().slice(0, 500);
  if (!note) throw new WorkflowError("VALIDATION", "Write what to change.");
  const atSec = parseTimecode(input.at);
  const now = nowIso();
  await run(
    "INSERT INTO item_review_notes (id, item_id, attempt_id, stage, at_sec, note, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("rn_"),
    itemId,
    a.id,
    a.stage,
    atSec,
    note,
    user.id,
    now,
  );
  await audit({ actor: user }, { itemId, attemptId: a.id, stage: a.stage, action: "review.note", summary: `${user.name} noted${atSec !== null ? ` at ${fmtTimecode(atSec)}` : ""}: ${note}` });
  if (a.owner_id && a.owner_id !== user.id)
    await notify([a.owner_id], { type: "handoff", title: `Review note${atSec !== null ? ` at ${fmtTimecode(atSec)}` : ""}`, body: note, link: `/dashboard?item=${itemId}`, itemId, groupKey: `review-notes:${a.id}` }, now, user.id);
}

export async function resolveReviewNote(user: AppUser, id: string, resolved: boolean) {
  const n = await get<{ item_id: string; attempt_id: string; note: string }>("SELECT item_id, attempt_id, note FROM item_review_notes WHERE id = ?", id);
  if (!n) throw new WorkflowError("NOT_FOUND", "Note not found.");
  const { a, reviewer, worker } = await context(user, n.item_id);
  if (a.id !== n.attempt_id) throw new WorkflowError("INVALID_STATE", "This note belongs to earlier work.");
  if (!reviewer && !worker) throw new WorkflowError("FORBIDDEN", "Only the person doing the work or the team lead ticks notes off.");
  await run("UPDATE item_review_notes SET resolved_by = ?, resolved_at = ? WHERE id = ?", resolved ? user.id : null, resolved ? nowIso() : null, id);
  await audit({ actor: user }, { itemId: n.item_id, attemptId: a.id, stage: a.stage, action: "review.fixed", summary: `${user.name} ${resolved ? "fixed" : "reopened"}: ${n.note}` });
}

export async function deleteReviewNote(user: AppUser, id: string) {
  const n = await get<{ item_id: string; author_id: string | null }>("SELECT item_id, author_id FROM item_review_notes WHERE id = ?", id);
  if (!n) return;
  const { reviewer } = await context(user, n.item_id);
  if (!reviewer && n.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only the team lead removes review notes.");
  await run("DELETE FROM item_review_notes WHERE id = ?", id);
}

// Open notes, for the return message.
export async function openNotesText(itemId: string, attemptId: string) {
  const open = (await reviewNotes(itemId, attemptId)).filter((n) => !n.resolved);
  return open.map((n) => `${n.atSec !== null ? `${fmtTimecode(n.atSec)} ` : ""}${n.note}`).join("; ");
}

