// Retention (Update 1.2, spec 11.4 and 13). Three different things, never confused:
// - Archive: the conversation leaves the working lists and comes back with Restore; nothing is removed.
// - Legal hold: a conversation or a recording is kept whatever the retention rules say, until the hold is lifted.
// - Permanent deletion: by Admin or people with the retention permission, with a reason, never under a legal hold.
//   The audit log keeps who deleted what and why. Deleting a conversation keeps its call records (their audio
//   follows the recording rules) and support requests; deleting a recording keeps the call record.
// Conversations are kept forever by default; Admin may set a number of days after which closed conversations go.
import { all, get, nowIso, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import { deleteStored } from "./storage";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function canManageRetention(user: AppUser) {
  return sd.isAdmin(user) || can(user, "support.retention");
}
async function need(user: AppUser) {
  if (!(await canManageRetention(user))) throw new WorkflowError("FORBIDDEN", "Only Admin and people allowed to manage retention delete or hold support data.");
}

export async function setConversationHold(user: AppUser, ticketId: string, on: boolean, reason?: string | null) {
  await need(user);
  const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", ticketId);
  if (!t) throw new WorkflowError("NOT_FOUND", "Conversation not found.");
  if (on && !clean(reason, 300)) throw new WorkflowError("VALIDATION", "Say why the conversation must be kept.");
  await run("UPDATE sup_tickets SET legal_hold = ?, legal_hold_reason = ?, updated_at = ? WHERE id = ?", on ? 1 : 0, on ? clean(reason, 300) : null, nowIso(), ticketId);
  await sd.activity(user.id, ticketId, on ? "legal_hold" : "legal_hold_lifted", on ? clean(reason, 300) : null);
  await audit({ actor: user }, { action: "support.legal_hold", summary: `${user.name} ${on ? `put conversation #${t.number} under legal hold: ${clean(reason, 300)}` : `lifted the legal hold on conversation #${t.number}`}` });
}

async function removeConversation(ticketId: string) {
  // Call records and requests outlive the conversation: their link is cleared, not the rows.
  await run("UPDATE sup_calls SET ticket_id = NULL WHERE ticket_id = ?", ticketId);
  await run("UPDATE sup_requests SET ticket_id = NULL WHERE ticket_id = ?", ticketId);
  await run("DELETE FROM sup_tickets WHERE id = ?", ticketId);
}

export async function deleteConversation(user: AppUser, ticketId: string, reason: string) {
  await need(user);
  const t = await get<{ number: number; subject: string; legal_hold: number; customer: string | null; n: number }>(
    "SELECT t.number, t.subject, t.legal_hold, c.name AS customer, (SELECT COUNT(*) FROM sup_messages m WHERE m.ticket_id = t.id) AS n FROM sup_tickets t LEFT JOIN sup_customers c ON c.id = t.customer_id WHERE t.id = ?",
    ticketId,
  );
  if (!t) throw new WorkflowError("NOT_FOUND", "Conversation not found.");
  if (Number(t.legal_hold)) throw new WorkflowError("INVALID_STATE", "This conversation is under legal hold. Lift the hold first.");
  if (!clean(reason, 300)) throw new WorkflowError("VALIDATION", "Say why the conversation is deleted. The reason is kept in the audit log.");
  await removeConversation(ticketId);
  await audit({ actor: user }, { action: "support.conversation_deleted", summary: `${user.name} permanently deleted conversation #${t.number} (${t.subject}, ${t.customer ?? "unknown customer"}, ${Number(t.n)} messages): ${clean(reason, 300)}` });
}

// A recording deleted by hand before its time; the call record stays.
export async function deleteRecording(user: AppUser, callId: string, reason: string) {
  await need(user);
  const k = await get<{ recording_id: string | null; recording_storage: string | null; legal_hold: number; customer: string | null; started_at: string }>(
    "SELECT k.recording_id, k.recording_storage, k.legal_hold, c.name AS customer, k.started_at FROM sup_calls k LEFT JOIN sup_customers c ON c.id = k.customer_id WHERE k.id = ?",
    callId,
  );
  if (!k?.recording_id) throw new WorkflowError("NOT_FOUND", "This call has no recording.");
  if (Number(k.legal_hold)) throw new WorkflowError("INVALID_STATE", "This recording is under legal hold. Lift the hold first.");
  if (!clean(reason, 300)) throw new WorkflowError("VALIDATION", "Say why the recording is deleted. The reason is kept in the audit log.");
  if (k.recording_storage === "supabase") await deleteStored({ id: k.recording_id, storage: k.recording_storage, path: `support/${k.recording_id}` }).catch(() => {});
  else await run("DELETE FROM sup_blobs WHERE id = ?", k.recording_id);
  await run("UPDATE sup_calls SET recording_id = NULL, recording_size = NULL, recording_status = 'deleted' WHERE id = ?", callId);
  await audit({ actor: user }, { action: "support.recording_deleted", summary: `${user.name} deleted the recording of a call with ${k.customer ?? "a customer"} on ${k.started_at.slice(0, 10)}: ${clean(reason, 300)}` });
}

// The scheduled checks: closed conversations past the retention period go (never under a legal hold).
export async function purgeConversations(now = nowIso()) {
  const cfg = await sd.supportConfig();
  const days = Number(cfg.conversationDays ?? 0);
  if (!days) return 0;
  const before = new Date(Date.parse(now) - days * 864e5).toISOString();
  const old = await all<{ id: string; number: number }>("SELECT id, number FROM sup_tickets WHERE status = 'closed' AND legal_hold = 0 AND updated_at < ? LIMIT 500", before);
  for (const t of old) await removeConversation(t.id);
  if (old.length) await audit({ actor: null }, { action: "support.conversation_deleted", summary: `${old.length} closed conversations older than ${days} days were deleted by the retention rule (#${old.map((t) => t.number).slice(0, 20).join(", #")}${old.length > 20 ? "…" : ""})` });
  return old.length;
}

// ---------------------------------------------------------------------------
// Clear every support conversation (Admin only, typed confirmation)
// ---------------------------------------------------------------------------

// Admin types this exact text to confirm; nothing is deleted otherwise.
export const CLEAR_SUPPORT_PHRASE = "DELETE ALL SUPPORT CHATS";

export type ClearSupportSummary = { conversations: number; messages: number; files: number; calls: number; held: number; customers: number };

// What a clear would remove right now (shown before Admin confirms).
export async function supportClearPreview(user: AppUser): Promise<ClearSupportSummary> {
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin clears the support conversations.");
  const n = async (sql: string) => Number((await get<{ n: number }>(sql))?.n ?? 0);
  return {
    conversations: await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE legal_hold = 0"),
    messages: await n("SELECT COUNT(*) AS n FROM sup_messages m JOIN sup_tickets t ON t.id = m.ticket_id WHERE t.legal_hold = 0"),
    files: await n("SELECT COUNT(*) AS n FROM sup_files f JOIN sup_tickets t ON t.id = f.ticket_id WHERE t.legal_hold = 0"),
    calls: await n("SELECT COUNT(*) AS n FROM sup_calls WHERE legal_hold = 0"),
    held: await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE legal_hold = 1"),
    customers: await n("SELECT COUNT(*) AS n FROM sup_customers"),
  };
}

// Removes every conversation (messages, files, reports, saved and forwarded messages, their activity) except those
// under legal hold. Call records go too only when asked (their recordings with them, unless held). Customers, support
// requests, help content, bots and settings stay. A full backup is made first when a backup place is set up; if that
// backup fails, nothing is deleted. The audit log keeps who cleared what and why.
export async function clearSupportChats(user: AppUser, input: { confirm: string; reason: string; includeCalls?: boolean }) {
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin clears the support conversations.");
  if (String(input.confirm ?? "").trim() !== CLEAR_SUPPORT_PHRASE) throw new WorkflowError("VALIDATION", `Type ${CLEAR_SUPPORT_PHRASE} exactly to confirm.`);
  const reason = clean(input.reason, 300);
  if (!reason) throw new WorkflowError("VALIDATION", "Say why the conversations are cleared. The reason is kept in the audit log.");
  const before = await supportClearPreview(user);

  // A copy first, so a mistake can be undone from Admin, Backups.
  let backup: string | null = null;
  const bk = await import("./backups");
  try {
    const r = await bk.runBackup(user);
    if (!r.ok) throw new Error("the backup did not finish");
    backup = r.name;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!/No place to keep backups/i.test(msg)) throw new WorkflowError("INVALID_STATE", `Nothing was deleted: the backup made first failed (${msg}).`);
  }

  const { tx } = await import("./db");
  let calls = 0;
  let recordings: { recording_id: string; recording_storage: string | null }[] = [];
  await tx(async () => {
    const ids = "SELECT id FROM sup_tickets WHERE legal_hold = 0";
    await run(`DELETE FROM sup_activity WHERE ticket_id IN (${ids})`);
    await run(`DELETE FROM sup_queue_events WHERE ticket_id IN (${ids})`);
    await run(`DELETE FROM sup_forwards WHERE ticket_id IN (${ids})`);
    await run(`UPDATE sup_bot_feedback SET ticket_id = NULL WHERE ticket_id IN (${ids})`);
    await run(`UPDATE sup_requests SET ticket_id = NULL WHERE ticket_id IN (${ids})`);
    if (input.includeCalls) {
      recordings = await all<{ recording_id: string; recording_storage: string | null }>("SELECT recording_id, recording_storage FROM sup_calls WHERE legal_hold = 0 AND recording_id IS NOT NULL");
      const callIds = "SELECT id FROM sup_calls WHERE legal_hold = 0";
      await run(`DELETE FROM sup_call_events WHERE call_id IN (${callIds})`);
      await run(`DELETE FROM sup_queue_events WHERE call_id IN (${callIds})`);
      await run(`DELETE FROM sup_recording_chunks WHERE call_id IN (${callIds})`);
      await run(`DELETE FROM sup_recording_access WHERE call_id IN (${callIds})`);
      await run(`UPDATE sup_ivr_sessions SET call_id = NULL WHERE call_id IN (${callIds})`);
      for (const r of recordings) if (r.recording_storage !== "supabase") await run("DELETE FROM sup_blobs WHERE id = ?", r.recording_id);
      calls = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE legal_hold = 0"))?.n ?? 0);
      await run("DELETE FROM sup_calls WHERE legal_hold = 0");
    } else {
      // Call records outlive their conversation: only the link goes.
      await run(`UPDATE sup_calls SET ticket_id = NULL WHERE ticket_id IN (${ids})`);
    }
    await run("DELETE FROM sup_tickets WHERE legal_hold = 0");
  });
  for (const r of recordings) if (r.recording_storage === "supabase") await deleteStored({ id: r.recording_id, storage: r.recording_storage, path: `support/${r.recording_id}` }).catch(() => {});

  const out = { ...before, calls: input.includeCalls ? calls : 0, backup };
  await audit(
    { actor: user },
    {
      action: "support.conversations_cleared",
      summary: `${user.name} cleared all support conversations: ${before.conversations} conversations, ${before.messages} messages, ${before.files} files${input.includeCalls ? `, ${calls} call records` : ""}${before.held ? `; ${before.held} under legal hold kept` : ""}${backup ? `; backup ${backup} made first` : "; no backup place is set up"}. Reason: ${reason}`,
    },
  );
  return out;
}
