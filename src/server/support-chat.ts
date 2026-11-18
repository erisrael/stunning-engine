import { all, get, nowIso, run, uid } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import * as sd from "./support-desk";

// Message actions on a support conversation (Update 1.2, Phase 6): edit, delete, save, report and details, and
// conversation archive and escalation. What reached the customer through Telegram or email cannot be changed there:
// such a reply is not edited here either, and deleting it hides it from the app only (the result says so).

const EDIT_WINDOW = 24 * 3600e3;
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
type Msg = { id: string; ticket_id: string; author_kind: string; author_id: string | null; body: string; internal: number; created_at: string; deleted_at: string | null; edited_at: string | null; delivered_at: string | null };
async function messageFor(user: AppUser, messageId: string) {
  const m = await get<Msg>("SELECT id, ticket_id, author_kind, author_id, body, internal, created_at, deleted_at, edited_at, delivered_at FROM sup_messages WHERE id = ?", messageId);
  if (!m) throw new WorkflowError("NOT_FOUND", "Message not found.");
  const t = await sd.canWork(user, m.ticket_id);
  const channel = (await get<{ channel: string }>("SELECT channel FROM sup_tickets WHERE id = ?", t.id))?.channel ?? "widget";
  return { m, t, channel };
}

export async function editSupportMessage(user: AppUser, messageId: string, body: string) {
  const { m, t, channel } = await messageFor(user, messageId);
  const text = clean(body, 8000);
  if (!text) throw new WorkflowError("VALIDATION", "Write the message.");
  if (m.author_kind !== "agent" || m.author_id !== user.id) throw new WorkflowError("FORBIDDEN", "You can edit only your own messages.");
  if (m.deleted_at) throw new WorkflowError("INVALID_STATE", "The message was deleted.");
  if (!Number(m.internal)) {
    if (["telegram", "email"].includes(channel)) throw new WorkflowError("INVALID_STATE", `The customer already has this reply in ${channel === "telegram" ? "Telegram" : "their email"}, where it cannot be changed. Send a correction instead.`);
    if (Date.now() - Date.parse(m.created_at) > EDIT_WINDOW) throw new WorkflowError("INVALID_STATE", "A reply can be edited for 24 hours. Send a correction instead.");
  }
  if (text === m.body) return;
  await run("UPDATE sup_messages SET body = ?, edited_at = ? WHERE id = ?", text, nowIso(), m.id);
  await sd.activity(user.id, t.id, "message_edited", m.body.slice(0, 200));
}

export async function deleteSupportMessage(user: AppUser, messageId: string) {
  const { m, t, channel } = await messageFor(user, messageId);
  if (m.deleted_at) return { stillWithCustomer: false };
  const lead = (await sd.isLead(user)) || user.perms.includes("support.delete_messages");
  const own = m.author_kind === "agent" && m.author_id === user.id;
  if (!lead && !(own && Date.now() - Date.parse(m.created_at) <= EDIT_WINDOW)) throw new WorkflowError("FORBIDDEN", "You can delete your own messages for 24 hours; support leads can delete any.");
  await run("UPDATE sup_messages SET deleted_at = ?, deleted_by = ? WHERE id = ?", nowIso(), user.id, m.id);
  await sd.activity(user.id, t.id, "message_deleted", `${m.author_kind === "customer" ? "Customer" : "Agent"} message: ${m.body.slice(0, 200)}`);
  await audit({ actor: user }, { action: "support.message_delete", summary: `${user.name} deleted a message in #${t.number}` });
  return { stillWithCustomer: !Number(m.internal) && m.author_kind !== "customer" && ["telegram", "email"].includes(channel) };
}

// Saved messages: a person's own list, across conversations.
export async function toggleSavedMessage(user: AppUser, messageId: string) {
  await messageFor(user, messageId);
  const had = await get("SELECT 1 FROM sup_saved_messages WHERE user_id = ? AND message_id = ?", user.id, messageId);
  if (had) await run("DELETE FROM sup_saved_messages WHERE user_id = ? AND message_id = ?", user.id, messageId);
  else await run("INSERT INTO sup_saved_messages (user_id, message_id, saved_at) VALUES (?, ?, ?)", user.id, messageId, nowIso());
  return { saved: !had };
}
export async function savedMessages(user: AppUser) {
  return all<{ id: string; ticket_id: string; number: number; subject: string; body: string; author_kind: string; created_at: string; saved_at: string }>(
    `SELECT m.id, t.id AS ticket_id, t.number, t.subject, m.body, m.author_kind, m.created_at, s.saved_at FROM sup_saved_messages s
     JOIN sup_messages m ON m.id = s.message_id JOIN sup_tickets t ON t.id = m.ticket_id WHERE s.user_id = ? AND m.deleted_at IS NULL ORDER BY s.saved_at DESC LIMIT 200`,
    user.id,
  );
}

export async function reportSupportMessage(user: AppUser, messageId: string, reason: string) {
  const { m, t } = await messageFor(user, messageId);
  const why = clean(reason, 500);
  if (!why) throw new WorkflowError("VALIDATION", "Say why you report it.");
  await run("INSERT INTO sup_message_reports (id, message_id, user_id, reason, created_at) VALUES (?, ?, ?, ?, ?)", uid("srp_"), m.id, user.id, why, nowIso());
  await sd.activity(user.id, t.id, "message_reported", why);
  const leads = (await sd.supportConfig()).leads.filter((id) => id !== user.id);
  await notify(leads, { type: "assignment", title: `${user.name} reported a message in #${t.number}`, body: why, link: `/support?ticket=${t.id}`, groupKey: `sup-report-${t.id}` }, nowIso());
}

export async function messageDetails(user: AppUser, messageId: string) {
  const { m, t } = await messageFor(user, messageId);
  const lead = await sd.isLead(user);
  const read = await get<{ customer_read_at: string | null }>("SELECT customer_read_at FROM sup_tickets WHERE id = ?", t.id);
  const by = async (id: string | null) => (id ? ((await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id))?.name ?? null) : null);
  const reports = await all<{ reason: string; created_at: string; by: string | null }>("SELECT r.reason, r.created_at, u.name AS by FROM sup_message_reports r LEFT JOIN users u ON u.id = r.user_id WHERE r.message_id = ? ORDER BY r.created_at", m.id);
  const forwards = await all<{ label: string; status: string; created_at: string; by: string | null }>("SELECT ft.label, f.status, f.created_at, u.name AS by FROM sup_forwards f JOIN sup_forward_targets ft ON ft.id = f.target_id LEFT JOIN users u ON u.id = f.by_id WHERE f.message_id = ? ORDER BY f.created_at", m.id);
  return {
    id: m.id,
    author: m.author_kind === "agent" ? await by(m.author_id) : m.author_kind === "customer" ? "Customer" : "System",
    internal: !!Number(m.internal),
    sentAt: m.created_at,
    deliveredAt: m.delivered_at,
    readByCustomer: !Number(m.internal) && m.author_kind !== "customer" && read?.customer_read_at && read.customer_read_at >= m.created_at ? read.customer_read_at : null,
    editedAt: m.edited_at,
    deletedAt: m.deleted_at,
    // The words of a deleted message stay on record for support leads.
    body: m.deleted_at && !lead ? null : m.body,
    reports,
    forwards,
  };
}

// Archived conversations leave every list but Archived; a new customer message brings them back.
export async function archiveTicket(user: AppUser, ticketId: string, archived: boolean) {
  const t = await sd.canWork(user, ticketId);
  await run("UPDATE sup_tickets SET archived_at = ?, updated_at = ? WHERE id = ?", archived ? nowIso() : null, nowIso(), t.id);
  await sd.activity(user.id, t.id, archived ? "archived" : "unarchived");
}

// Escalation: the conversation is marked, raised to high priority, and the support leads are told.
export async function escalateTicket(user: AppUser, ticketId: string, note: string | null, on = true) {
  const t = await sd.canWork(user, ticketId);
  const why = clean(note, 500) || null;
  if (on) {
    await run("UPDATE sup_tickets SET escalated_at = COALESCE(escalated_at, ?), escalation_note = ?, priority = CASE WHEN priority IN ('low','normal') THEN 'high' ELSE priority END, updated_at = ? WHERE id = ?", nowIso(), why, nowIso(), t.id);
    await sd.activity(user.id, t.id, "escalated", why);
    await notify((await sd.supportConfig()).leads.filter((id) => id !== user.id), { type: "assignment", title: `#${t.number} was escalated by ${user.name}`, body: why ?? t.subject, link: `/support?ticket=${t.id}`, dedupeKey: `sup-esc-${t.id}-${Date.now()}` }, nowIso());
  } else {
    await run("UPDATE sup_tickets SET escalated_at = NULL, escalation_note = NULL, updated_at = ? WHERE id = ?", nowIso(), t.id);
    await sd.activity(user.id, t.id, "de_escalated", why);
  }
}
