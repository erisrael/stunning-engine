// Feedback to Admin, and safety reports (a message, a person, a chat or anything else) under the safety policy.
// Reports are seen by the system admin only; the person reported never learns who reported them.

import { all, get, nowIso, placeholders, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, listUsers, type AppUser } from "./users";

export const FEEDBACK_CATEGORIES = { idea: "Idea or wish", bug: "Something is broken", question: "Question", praise: "Praise", other: "Other" } as const;
export type FeedbackCategory = keyof typeof FEEDBACK_CATEGORIES;
export const FEEDBACK_STATUSES = { new: "New", reviewing: "Looking into it", planned: "Planned", done: "Done", closed: "Closed" } as const;

export const REPORT_REASONS = {
  harassment: "Harassment or bullying",
  hate: "Hate or discrimination",
  sexual: "Sexual content or advances",
  threat: "Threats or violence",
  privacy: "Sharing private information",
  spam: "Spam or scam",
  fraud: "Fraud or misuse of company resources",
  safety: "Health and safety risk",
  other: "Something else",
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;
export const REPORT_STATUSES = { open: "Open", reviewing: "Reviewing", resolved: "Resolved", dismissed: "No action" } as const;
export type ReportStatus = keyof typeof REPORT_STATUSES;

async function adminIds() {
  return (await listUsers()).filter((u) => u.perms.includes("users.manage")).map((u) => u.id);
}
const clean = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

// Screenshots, PDFs and office documents sent with feedback (kept in the database, like profile files).
export type FeedbackUpload = { name: string; mime: string; base64: string };
export type FeedbackFile = { id: string; name: string; mime: string; size: number };
export const FEEDBACK_FILE_LIMITS = { count: 6, totalBytes: 8 * 1024 * 1024 };
const OK_MIME = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\..+|vnd\.ms-(excel|powerpoint)|zip))$/;
const OK_EXT = /\.(png|jpe?g|gif|webp|bmp|pdf|txt|csv|docx?|xlsx?|pptx?|zip)$/i;

function checkUploads(files: FeedbackUpload[] | undefined) {
  const list = (files ?? []).filter((f) => f && typeof f.base64 === "string" && f.base64.length);
  if (list.length > FEEDBACK_FILE_LIMITS.count) throw new WorkflowError("VALIDATION", `Attach at most ${FEEDBACK_FILE_LIMITS.count} files.`);
  let total = 0;
  return list.map((f) => {
    const name = String(f.name ?? "file").replace(/[\\/]/g, "_").slice(0, 160) || "file";
    const mime = String(f.mime ?? "").slice(0, 100);
    if (!OK_MIME.test(mime) && !OK_EXT.test(name)) throw new WorkflowError("VALIDATION", `"${name}" is not a screenshot, PDF or document.`);
    const size = Math.floor((f.base64.length * 3) / 4);
    total += size;
    if (total > FEEDBACK_FILE_LIMITS.totalBytes) throw new WorkflowError("VALIDATION", "Attachments are limited to 8 MB in total.");
    return { name, mime: mime || "application/octet-stream", size, data: f.base64 };
  });
}

async function filesOf(ids: string[]) {
  if (!ids.length) return new Map<string, FeedbackFile[]>();
  const rows = await all<FeedbackFile & { feedback_id: string }>(`SELECT id, feedback_id, name, mime, size FROM feedback_files WHERE feedback_id IN (${placeholders(ids.length)}) ORDER BY created_at`, ...ids);
  const m = new Map<string, FeedbackFile[]>();
  for (const r of rows) m.set(r.feedback_id, [...(m.get(r.feedback_id) ?? []), { id: r.id, name: r.name, mime: r.mime, size: Number(r.size) }]);
  return m;
}

export async function sendFeedback(user: AppUser, input: { category: string; message: string; page?: string | null; files?: FeedbackUpload[] }) {
  const message = clean(input.message, 4000);
  const uploads = checkUploads(input.files);
  if (message.length < 3 && !uploads.length) throw new WorkflowError("VALIDATION", "Write your feedback first.");
  const category = (input.category in FEEDBACK_CATEGORIES ? input.category : "other") as FeedbackCategory;
  const id = uid("fb_");
  const now = nowIso();
  await run("INSERT INTO feedback (id, user_id, category, message, page, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, user.id, category, message || "(see the attached files)", clean(input.page, 300) || null, now, now);
  for (const f of uploads) await run("INSERT INTO feedback_files (id, feedback_id, name, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", uid("fbf_"), id, f.name, f.mime, f.size, f.data, now);
  const extra = uploads.length ? ` (${uploads.length} file${uploads.length === 1 ? "" : "s"} attached)` : "";
  await notify(await adminIds(), { type: "approval", title: `Feedback: ${FEEDBACK_CATEGORIES[category]}`, body: `${user.name}: ${message.slice(0, 140)}${extra}`, link: "/admin?tab=feedback", groupKey: "feedback" }, now, user.id);
  return id;
}

export async function myFeedback(user: AppUser) {
  const rows = await all<{ id: string; category: FeedbackCategory; message: string; status: string; reply: string | null; created_at: string; updated_at: string }>(
    "SELECT id, category, message, status, reply, created_at, updated_at FROM feedback WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    user.id,
  );
  const files = await filesOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, files: files.get(r.id) ?? [] }));
}

// One attached file, for the person who sent it and for Admin.
export async function readFeedbackFile(viewer: AppUser, fileId: string) {
  const f = await get<{ name: string; mime: string; data: string; user_id: string | null }>(
    "SELECT ff.name, ff.mime, ff.data, f.user_id FROM feedback_files ff JOIN feedback f ON f.id = ff.feedback_id WHERE ff.id = ?",
    fileId,
  );
  if (!f || (f.user_id !== viewer.id && !can(viewer, "users.manage"))) return null;
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

export async function listFeedback(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin reads feedback.");
  const rows = await all<{ id: string; category: FeedbackCategory; message: string; page: string | null; status: string; reply: string | null; created_at: string; name: string | null; replier: string | null }>(
    "SELECT f.id, f.category, f.message, f.page, f.status, f.reply, f.created_at, u.name, r.name AS replier FROM feedback f LEFT JOIN users u ON u.id = f.user_id LEFT JOIN users r ON r.id = f.replied_by ORDER BY CASE f.status WHEN 'new' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, f.created_at DESC LIMIT 500",
  );
  const files = await filesOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, files: files.get(r.id) ?? [] }));
}

export async function answerFeedback(user: AppUser, id: string, input: { status: string; reply?: string | null }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin answers feedback.");
  const f = await get<{ user_id: string | null; message: string }>("SELECT user_id, message FROM feedback WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "This feedback is gone.");
  const status = input.status in FEEDBACK_STATUSES ? input.status : "reviewing";
  const reply = clean(input.reply, 2000) || null;
  if (reply) await run("UPDATE feedback SET status = ?, reply = ?, replied_by = ?, updated_at = ? WHERE id = ?", status, reply, user.id, nowIso(), id);
  else await run("UPDATE feedback SET status = ?, updated_at = ? WHERE id = ?", status, nowIso(), id);
  if (f.user_id)
    await notify([f.user_id], { type: "approval", title: `Your feedback: ${FEEDBACK_STATUSES[status as keyof typeof FEEDBACK_STATUSES]}`, body: reply ?? f.message.slice(0, 120), link: "/feedback" }, nowIso(), user.id);
}

// ---------------------------------------------------------------------------
// Safety reports
// ---------------------------------------------------------------------------

export type ReportInput = { targetType: "message" | "user" | "chat" | "other"; targetId?: string | null; targetLabel?: string | null; reason: string; details?: string | null; evidence?: string | null };

export async function sendReport(user: AppUser, input: ReportInput) {
  const reason = (input.reason in REPORT_REASONS ? input.reason : "other") as ReportReason;
  const details = clean(input.details, 4000);
  if (reason === "other" && details.length < 5) throw new WorkflowError("VALIDATION", "Say what happened.");
  const type = ["message", "user", "chat", "other"].includes(input.targetType) ? input.targetType : "other";
  let label = clean(input.targetLabel, 200) || null;
  if (type === "message" && input.targetId) {
    const m = await get<{ group_id: string; author_name: string; group_name: string }>(
      "SELECT c.group_id, u.name AS author_name, g.name AS group_name FROM chat_messages c JOIN users u ON u.id = c.author_id JOIN chat_groups g ON g.id = c.group_id WHERE c.id = ?",
      input.targetId,
    );
    if (!m || !(await get("SELECT 1 AS x FROM chat_members WHERE group_id = ? AND user_id = ?", m.group_id, user.id))) throw new WorkflowError("FORBIDDEN", "You can report only messages you can see.");
    label = `Message from ${m.author_name} in ${m.group_name}`;
  }
  if (type === "user" && input.targetId) label = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", input.targetId))?.name ?? label;
  const id = uid("rep_");
  const now = nowIso();
  await run(
    "INSERT INTO reports (id, reporter_id, target_type, target_id, target_label, reason, details, evidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.id,
    type,
    input.targetId ?? null,
    label,
    reason,
    details || null,
    clean(input.evidence, 4000) || null,
    now,
    now,
  );
  // Admin is told what kind of report it is; the content stays in Admin, Reports.
  await notify(await adminIds(), { type: "approval", title: `Safety report: ${REPORT_REASONS[reason]}`, body: "A new report needs a look.", link: "/admin?tab=reports", groupKey: "reports" }, now, user.id);
  await audit({ actor: user }, { action: "safety.report", summary: `A safety report was filed (${REPORT_REASONS[reason]})` });
  return id;
}

export async function myReports(user: AppUser) {
  return all<{ id: string; target_label: string | null; reason: ReportReason; status: ReportStatus; resolution: string | null; created_at: string }>(
    "SELECT id, target_label, reason, status, resolution, created_at FROM reports WHERE reporter_id = ? ORDER BY created_at DESC LIMIT 50",
    user.id,
  );
}

export async function listReports(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin reads safety reports.");
  return all<{ id: string; target_type: string; target_id: string | null; target_label: string | null; reason: ReportReason; details: string | null; evidence: string | null; status: ReportStatus; resolution: string | null; created_at: string; reporter: string | null; handler: string | null; message_body: string | null; message_encrypted: number | null }>(
    `SELECT r.*, u.name AS reporter, h.name AS handler, c.body AS message_body, c.encrypted AS message_encrypted
     FROM reports r LEFT JOIN users u ON u.id = r.reporter_id LEFT JOIN users h ON h.id = r.handled_by
     LEFT JOIN chat_messages c ON r.target_type = 'message' AND c.id = r.target_id
     ORDER BY CASE r.status WHEN 'open' THEN 0 WHEN 'reviewing' THEN 1 ELSE 2 END, r.created_at DESC LIMIT 500`,
  );
}

export async function handleReport(user: AppUser, id: string, input: { status: string; resolution?: string | null; deleteMessage?: boolean; deactivateUser?: boolean }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin handles safety reports.");
  const r = await get<{ reporter_id: string | null; target_type: string; target_id: string | null; reason: ReportReason }>("SELECT reporter_id, target_type, target_id, reason FROM reports WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "This report is gone.");
  const status = (input.status in REPORT_STATUSES ? input.status : "reviewing") as ReportStatus;
  const resolution = clean(input.resolution, 2000) || null;
  if ((status === "resolved" || status === "dismissed") && !resolution) throw new WorkflowError("VALIDATION", "Note what was done, for the record.");
  const now = nowIso();
  if (input.deleteMessage && r.target_type === "message" && r.target_id) await run("UPDATE chat_messages SET deleted_at = ?, pinned = 0, updated_at = ? WHERE id = ?", now, now, r.target_id);
  let deactivated: string | null = null;
  if (input.deactivateUser) {
    const target = r.target_type === "user" ? r.target_id : r.target_type === "message" && r.target_id ? (await get<{ author_id: string }>("SELECT author_id FROM chat_messages WHERE id = ?", r.target_id))?.author_id : null;
    if (target && target !== user.id) {
      await run("UPDATE users SET active = 0 WHERE id = ?", target);
      await run("DELETE FROM sessions WHERE user_id = ?", target);
      deactivated = target;
    }
  }
  await run("UPDATE reports SET status = ?, resolution = COALESCE(?, resolution), handled_by = ?, updated_at = ? WHERE id = ?", status, resolution, user.id, now, id);
  await audit({ actor: user }, { action: "safety.report", summary: `${user.name} marked a safety report ${REPORT_STATUSES[status].toLowerCase()}${input.deleteMessage ? ", deleted the message" : ""}${deactivated ? ", deactivated the account" : ""}` });
  if (r.reporter_id && (status === "resolved" || status === "dismissed"))
    await notify([r.reporter_id], { type: "approval", title: "Your report was reviewed", body: resolution ?? REPORT_STATUSES[status], link: "/safety" }, now, user.id);
}
