// The Telegram bot manager (Update 1.1): for each bot (the default support bot, or a connected system's own bot) a
// content library (videos, PDFs, documents, images kept here, or links such as YouTube) that customers open from
// the bot's menu or that is sent to every subscriber now or at a set time; forms and surveys answered in the chat
// one question at a time; and the feedback inbox (new, reviewed, escalated to a ticket).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import * as ch from "./support-channels";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export const BOT_FILE_MAX = 20 * 1024 * 1024;
export const CONTENT_KINDS = ["video", "pdf", "document", "image", "link"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];
export type QuestionType = "text" | "choice" | "rating";
export type Question = { text: string; type: QuestionType; options: string[]; required: boolean };
export type FeedbackStatus = "new" | "reviewed" | "escalated";

async function lead(user: AppUser) {
  const sd = await import("./support-desk");
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin manage the bots.");
}

// ---------------------------------------------------------------------------
// The bots
// ---------------------------------------------------------------------------

export type BotRow = { key: string; name: string; username: string | null; subscribers: number; newFeedback: number };

export async function listBots(user: AppUser): Promise<BotRow[]> {
  await lead(user);
  const out: BotRow[] = [];
  const def = await ch.telegramInfo();
  if (def.connected) out.push({ key: "default", name: "Default support bot", username: def.bot, subscribers: 0, newFeedback: 0 });
  for (const a of await all<{ id: string; name: string; tg_bot: string | null }>("SELECT id, name, tg_bot FROM sup_apps WHERE tg_token IS NOT NULL ORDER BY name")) out.push({ key: a.id, name: a.name, username: a.tg_bot, subscribers: 0, newFeedback: 0 });
  for (const b of out) {
    b.subscribers = (await subscribers(b.key)).length;
    b.newFeedback = Number((await get<{ n: number | string }>("SELECT COUNT(*) AS n FROM sup_bot_feedback WHERE bot = ? AND status = 'new'", b.key))?.n ?? 0);
  }
  return out;
}

async function needBot(key: string) {
  const k = clean(key, 60);
  if (k === "default") {
    if (!(await ch.telegramInfo()).connected) throw new WorkflowError("INVALID_STATE", "Connect the default bot on the Telegram tab first.");
    return k;
  }
  const a = await get<{ id: string }>("SELECT id FROM sup_apps WHERE id = ? AND tg_token IS NOT NULL", k);
  if (!a) throw new WorkflowError("NOT_FOUND", "That system has no Telegram bot.");
  return a.id;
}

// Everyone who has written to the bot, and has not blocked it.
async function subscribers(bot: string) {
  const rows = await all<{ id: string; external_id: string; meta: string }>(
    bot === "default" ? "SELECT id, external_id, meta FROM sup_customers WHERE app_id IS NULL AND external_id LIKE 'tg:%'" : "SELECT id, external_id, meta FROM sup_customers WHERE app_id = ? AND external_id LIKE 'tg:%'",
    ...(bot === "default" ? [] : [bot]),
  );
  return rows.filter((r) => !parseJson<Record<string, string>>(r.meta, {}).tgBlocked).map((r) => ({ id: r.id, chat: r.external_id.slice(3) }));
}

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

export type ContentItem = { id: string; title: string; kind: ContentKind; caption: string | null; url: string | null; fileName: string | null; size: number; active: boolean; sends: number; createdAt: string };

export async function listContent(user: AppUser, bot: string): Promise<ContentItem[]> {
  await lead(user);
  return (await all<{ id: string; title: string; kind: ContentKind; caption: string | null; url: string | null; file_name: string | null; size: number; active: number; sends: number; created_at: string }>("SELECT id, title, kind, caption, url, file_name, size, active, sends, created_at FROM sup_bot_content WHERE bot = ? ORDER BY created_at DESC", bot)).map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    caption: r.caption,
    url: r.url,
    fileName: r.file_name,
    size: Number(r.size),
    active: !!Number(r.active),
    sends: Number(r.sends),
    createdAt: r.created_at,
  }));
}

const kindOf = (mime: string, name: string): ContentKind => (mime.startsWith("video/") ? "video" : mime.startsWith("image/") ? "image" : mime === "application/pdf" || /\.pdf$/i.test(name) ? "pdf" : "document");

export async function saveContent(user: AppUser, botKey: string, input: { id?: string | null; title: string; caption?: string | null; url?: string | null; active?: boolean; file?: { name: string; mime: string; data: Buffer } | null }) {
  await lead(user);
  const bot = await needBot(botKey);
  const title = clean(input.title, 120);
  if (!title) throw new WorkflowError("VALIDATION", "Give the content a title.");
  const caption = clean(input.caption, 900) || null;
  const url = clean(input.url, 500) || null;
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new WorkflowError("VALIDATION", "The link must start with http:// or https://.");
  if (input.file && input.file.data.length > BOT_FILE_MAX) throw new WorkflowError("VALIDATION", "The file is larger than 20 MB, the most Telegram takes from a link. Upload it to YouTube or a drive and add the link instead.");
  if (input.file && !input.file.data.length) throw new WorkflowError("VALIDATION", "The file is empty.");
  const now = nowIso();
  if (input.id) {
    const cur = await get<{ id: string }>("SELECT id FROM sup_bot_content WHERE id = ? AND bot = ?", input.id, bot);
    if (!cur) throw new WorkflowError("NOT_FOUND", "Unknown content.");
    await run("UPDATE sup_bot_content SET title = ?, caption = ?, active = ? WHERE id = ?", title, caption, input.active === false ? 0 : 1, cur.id);
    if (url) await run("UPDATE sup_bot_content SET url = ?, kind = CASE WHEN data IS NULL THEN 'link' ELSE kind END WHERE id = ?", url, cur.id);
    await audit({ actor: user }, { action: "support.bot", summary: `${user.name} changed bot content "${title}"` });
    return { id: cur.id };
  }
  if (!input.file && !url) throw new WorkflowError("VALIDATION", "Add a file or a link.");
  const id = uid("bct_");
  const f = input.file;
  const name = f ? clean(f.name, 160).replace(/[\\/]/g, "_") || "file" : null;
  const mime = f ? clean(f.mime, 100) || "application/octet-stream" : null;
  await run(
    "INSERT INTO sup_bot_content (id, bot, title, kind, caption, url, file_name, mime, size, data, pub, active, sends, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
    id,
    bot,
    title,
    f ? kindOf(mime!, name!) : "link",
    caption,
    f ? null : url,
    name,
    mime,
    f ? f.data.length : 0,
    f ? f.data.toString("base64") : null,
    crypto.randomBytes(18).toString("hex"),
    input.active === false ? 0 : 1,
    user.id,
    now,
  );
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} added bot content "${title}"` });
  return { id };
}

export async function deleteContent(user: AppUser, id: string) {
  await lead(user);
  const c = await get<{ title: string }>("SELECT title FROM sup_bot_content WHERE id = ?", id);
  if (!c) throw new WorkflowError("NOT_FOUND", "Unknown content.");
  await run("UPDATE sup_bot_pushes SET status = 'cancelled' WHERE content_id = ? AND status = 'scheduled'", id);
  await run("DELETE FROM sup_bot_content WHERE id = ?", id);
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} removed bot content "${c.title}"` });
}

// The file itself, for Telegram to fetch (the link carries an unguessable key) and for staff to preview.
export async function contentFile(id: string, pub: string) {
  const f = await get<{ file_name: string; mime: string; data: string | null; pub: string }>("SELECT file_name, mime, data, pub FROM sup_bot_content WHERE id = ?", id);
  if (!f?.data || !pub || pub.length !== f.pub.length || !crypto.timingSafeEqual(Buffer.from(pub), Buffer.from(f.pub))) return null;
  return { name: f.file_name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}
export async function staffContentFile(user: AppUser, id: string) {
  await lead(user);
  const f = await get<{ file_name: string; mime: string; data: string | null }>("SELECT file_name, mime, data FROM sup_bot_content WHERE id = ?", id);
  return f?.data ? { name: f.file_name, mime: f.mime, data: Buffer.from(f.data, "base64") } : null;
}

type Sendable = { id: string; title: string; kind: ContentKind; caption: string | null; url: string | null; pub: string; data: string | null };

// One item to one chat: a file goes by its link (Telegram fetches it; needs a public https address), a link as text.
async function sendItem(chat: string, c: Sendable, origin: string | null) {
  const text = [c.title, c.caption].filter(Boolean).join("\n\n");
  if (!c.data) return ch.botApi("sendMessage", { chat_id: chat, text: `${text}\n\n${c.url ?? ""}`.trim().slice(0, 4000) });
  const fileUrl = origin ? `${origin}/api/support/bot-file/${c.id}?k=${c.pub}` : null;
  if (!fileUrl || !/^https:\/\//.test(fileUrl)) return ch.botApi("sendMessage", { chat_id: chat, text: `${text}\n\n${fileUrl ?? "(the file needs a public https address to reach Telegram)"}`.slice(0, 4000) });
  const method = c.kind === "image" ? "sendPhoto" : c.kind === "video" ? "sendVideo" : "sendDocument";
  const field = c.kind === "image" ? "photo" : c.kind === "video" ? "video" : "document";
  return ch.botApi(method, { chat_id: chat, [field]: fileUrl, caption: text.slice(0, 1000) });
}

// ---------------------------------------------------------------------------
// Sending to every subscriber, now or later
// ---------------------------------------------------------------------------

export type Push = { id: string; what: string; sendAt: string; status: string; sent: number; failed: number; sentAt: string | null };

export async function listPushes(user: AppUser, bot: string): Promise<Push[]> {
  await lead(user);
  const rows = await all<{ id: string; content_id: string | null; form_id: string | null; message: string | null; send_at: string; status: string; sent: number; failed: number; sent_at: string | null; ct: string | null; ft: string | null }>(
    `SELECT p.id, p.content_id, p.form_id, p.message, p.send_at, p.status, p.sent, p.failed, p.sent_at, c.title AS ct, f.title AS ft
     FROM sup_bot_pushes p LEFT JOIN sup_bot_content c ON c.id = p.content_id LEFT JOIN sup_bot_forms f ON f.id = p.form_id
     WHERE p.bot = ? ORDER BY p.send_at DESC LIMIT 50`,
    bot,
  );
  return rows.map((r) => ({ id: r.id, what: r.ct ?? (r.ft ? `Survey: ${r.ft}` : r.message?.slice(0, 80) ?? "(removed)"), sendAt: r.send_at, status: r.status, sent: Number(r.sent), failed: Number(r.failed), sentAt: r.sent_at }));
}

export async function schedulePush(user: AppUser, botKey: string, input: { contentId?: string | null; formId?: string | null; message?: string | null; sendAt?: string | null }, origin: string | null) {
  await lead(user);
  const bot = await needBot(botKey);
  const message = clean(input.message, 3500) || null;
  if (input.contentId && !(await get("SELECT id FROM sup_bot_content WHERE id = ? AND bot = ?", input.contentId, bot))) throw new WorkflowError("NOT_FOUND", "Unknown content.");
  if (input.formId && !(await get("SELECT id FROM sup_bot_forms WHERE id = ? AND bot = ? AND active = 1", input.formId, bot))) throw new WorkflowError("NOT_FOUND", "Unknown or paused form.");
  if (!input.contentId && !input.formId && !message) throw new WorkflowError("VALIDATION", "Pick content, a form, or write a message.");
  const now = nowIso();
  let at = now;
  if (input.sendAt) {
    const t = Date.parse(input.sendAt);
    if (!Number.isFinite(t)) throw new WorkflowError("VALIDATION", "Pick a valid time.");
    if (t < Date.now() - 60e3) throw new WorkflowError("VALIDATION", "The time is in the past.");
    at = new Date(t).toISOString();
  }
  const id = uid("bps_");
  await run("INSERT INTO sup_bot_pushes (id, bot, content_id, form_id, message, send_at, status, origin, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?)", id, bot, input.contentId ?? null, input.formId ?? null, message, at, origin, user.id, now);
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} ${input.sendAt ? `scheduled a send for ${at.slice(0, 16).replace("T", " ")}` : "sent to the bot's subscribers"}` });
  if (!input.sendAt) await runPushes(now);
  return { id };
}

export async function cancelPush(user: AppUser, id: string) {
  await lead(user);
  const p = await get<{ status: string }>("SELECT status FROM sup_bot_pushes WHERE id = ?", id);
  if (!p) throw new WorkflowError("NOT_FOUND", "Unknown send.");
  if (p.status !== "scheduled") throw new WorkflowError("INVALID_STATE", "Only a send that has not started can be cancelled.");
  await run("UPDATE sup_bot_pushes SET status = 'cancelled' WHERE id = ?", id);
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} cancelled a scheduled bot send` });
}

// Due sends go out (from the support job every minute, or at once for "Send now").
export async function runPushes(now = nowIso()) {
  const due = await all<{ id: string; bot: string; content_id: string | null; form_id: string | null; message: string | null; origin: string | null }>("SELECT id, bot, content_id, form_id, message, origin FROM sup_bot_pushes WHERE status = 'scheduled' AND send_at <= ? ORDER BY send_at", now);
  let total = 0;
  for (const p of due) {
    // Claimed first, so two runs never send the same push twice.
    const claimed = await get<{ id: string }>("UPDATE sup_bot_pushes SET status = 'sending' WHERE id = ? AND status = 'scheduled' RETURNING id", p.id);
    if (!claimed) continue;
    const item = p.content_id ? await get<Sendable>("SELECT id, title, kind, caption, url, pub, data FROM sup_bot_content WHERE id = ?", p.content_id) : null;
    const form = p.form_id ? await get<{ id: string; title: string; intro: string | null }>("SELECT id, title, intro FROM sup_bot_forms WHERE id = ? AND active = 1", p.form_id) : null;
    let sent = 0;
    let failed = 0;
    await ch.withBot(p.bot, async () => {
      const origin = p.origin ?? (await ch.botOrigin());
      for (const s of await subscribers(p.bot)) {
        let r: { ok: boolean; error_code?: number } = { ok: false };
        try {
          if (item) r = await sendItem(s.chat, item, origin);
          else if (form) r = await ch.botApi("sendMessage", { chat_id: s.chat, text: [form.title, form.intro].filter(Boolean).join("\n\n"), reply_markup: { inline_keyboard: [[{ text: "Start", callback_data: `s:${form.id}` }]] } });
          else if (p.message) r = await ch.botApi("sendMessage", { chat_id: s.chat, text: p.message });
        } catch {
          r = { ok: false };
        }
        if (r.ok) sent++;
        else {
          failed++;
          // Blocked the bot: left out of later sends.
          if (r.error_code === 403) await setMeta(s.id, { tgBlocked: nowIso() });
        }
      }
    });
    await run("UPDATE sup_bot_pushes SET status = 'sent', sent = ?, failed = ?, sent_at = ? WHERE id = ?", sent, failed, nowIso(), p.id);
    if (item) await run("UPDATE sup_bot_content SET sends = sends + ? WHERE id = ?", sent, item.id);
    total += sent;
  }
  return { pushes: due.length, sent: total };
}

// ---------------------------------------------------------------------------
// Forms and surveys
// ---------------------------------------------------------------------------

export type BotForm = { id: string; kind: "form" | "survey"; title: string; intro: string | null; questions: Question[]; active: boolean; responses: number; started: number };

export async function listForms(user: AppUser, bot: string): Promise<BotForm[]> {
  await lead(user);
  const rows = await all<{ id: string; kind: string; title: string; intro: string | null; questions: string; active: number; done: number | string; started: number | string }>(
    `SELECT f.id, f.kind, f.title, f.intro, f.questions, f.active,
       (SELECT COUNT(*) FROM sup_bot_responses r WHERE r.form_id = f.id AND r.done = 1) AS done,
       (SELECT COUNT(*) FROM sup_bot_responses r WHERE r.form_id = f.id) AS started
     FROM sup_bot_forms f WHERE f.bot = ? ORDER BY f.created_at DESC`,
    bot,
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind === "form" ? "form" : "survey", title: r.title, intro: r.intro, questions: parseJson<Question[]>(r.questions, []), active: !!Number(r.active), responses: Number(r.done), started: Number(r.started) }));
}

export async function saveForm(user: AppUser, botKey: string, input: { id?: string | null; kind?: string; title: string; intro?: string | null; questions: Partial<Question>[]; active?: boolean }) {
  await lead(user);
  const bot = await needBot(botKey);
  const title = clean(input.title, 120);
  if (!title) throw new WorkflowError("VALIDATION", "Give the form a title.");
  const qs: Question[] = [];
  for (const q of input.questions ?? []) {
    const text = clean(q.text, 300);
    if (!text) continue;
    const type: QuestionType = q.type === "choice" || q.type === "rating" ? q.type : "text";
    const options = type === "choice" ? [...new Set((q.options ?? []).map((o) => clean(o, 40)).filter(Boolean))].slice(0, 8) : [];
    if (type === "choice" && options.length < 2) throw new WorkflowError("VALIDATION", `"${text}" needs at least two choices.`);
    qs.push({ text, type, options, required: q.required !== false });
  }
  if (!qs.length) throw new WorkflowError("VALIDATION", "Add at least one question.");
  if (qs.length > 20) throw new WorkflowError("VALIDATION", "A form has at most 20 questions.");
  const kind = input.kind === "form" ? "form" : "survey";
  const intro = clean(input.intro, 600) || null;
  if (input.id) {
    const cur = await get<{ id: string }>("SELECT id FROM sup_bot_forms WHERE id = ? AND bot = ?", input.id, bot);
    if (!cur) throw new WorkflowError("NOT_FOUND", "Unknown form.");
    await run("UPDATE sup_bot_forms SET kind = ?, title = ?, intro = ?, questions = ?, active = ? WHERE id = ?", kind, title, intro, JSON.stringify(qs), input.active === false ? 0 : 1, cur.id);
    await audit({ actor: user }, { action: "support.bot", summary: `${user.name} changed the ${kind} "${title}"` });
    return { id: cur.id };
  }
  const id = uid("bfm_");
  await run("INSERT INTO sup_bot_forms (id, bot, kind, title, intro, questions, active, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", id, bot, kind, title, intro, JSON.stringify(qs), input.active === false ? 0 : 1, user.id, nowIso());
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} added the ${kind} "${title}"` });
  return { id };
}

export async function deleteForm(user: AppUser, id: string) {
  await lead(user);
  const f = await get<{ title: string }>("SELECT title FROM sup_bot_forms WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Unknown form.");
  await run("UPDATE sup_bot_pushes SET status = 'cancelled' WHERE form_id = ? AND status = 'scheduled'", id);
  await run("DELETE FROM sup_bot_responses WHERE form_id = ?", id);
  await run("DELETE FROM sup_bot_forms WHERE id = ?", id);
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} removed the form "${f.title}" and its answers` });
}

// The results: per question, choice counts or the average rating, and every finished response.
export async function formResults(user: AppUser, id: string) {
  await lead(user);
  const f = await get<{ id: string; title: string; questions: string }>("SELECT id, title, questions FROM sup_bot_forms WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Unknown form.");
  const qs = parseJson<Question[]>(f.questions, []);
  const rows = await all<{ id: string; answers: string; updated_at: string; name: string | null; phone: string | null }>(
    "SELECT r.id, r.answers, r.updated_at, c.name, c.phone FROM sup_bot_responses r LEFT JOIN sup_customers c ON c.id = r.customer_id WHERE r.form_id = ? AND r.done = 1 ORDER BY r.updated_at DESC",
    id,
  );
  const responses = rows.map((r) => ({ id: r.id, at: r.updated_at, name: r.name ?? "Unknown", phone: r.phone, answers: parseJson<(string | null)[]>(r.answers, []) }));
  const summary = qs.map((q, i) => {
    const vals = responses.map((r) => r.answers[i]).filter((v): v is string => !!v);
    if (q.type === "choice") return { question: q.text, type: q.type, counts: q.options.map((o) => ({ option: o, n: vals.filter((v) => v === o).length })), answered: vals.length };
    if (q.type === "rating") {
      const n = vals.map(Number).filter((v) => v >= 1 && v <= 5);
      return { question: q.text, type: q.type, average: n.length ? Math.round((n.reduce((a, b) => a + b, 0) / n.length) * 10) / 10 : null, counts: [1, 2, 3, 4, 5].map((s) => ({ option: String(s), n: n.filter((v) => v === s).length })), answered: n.length };
    }
    return { question: q.text, type: q.type, answered: vals.length };
  });
  return { title: f.title, questions: qs, summary, responses };
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export type Feedback = { id: string; body: string; status: FeedbackStatus; ticketId: string | null; ticketNumber: number | null; customer: string; phone: string | null; createdAt: string };

export async function listFeedback(user: AppUser, bot: string, status?: string | null): Promise<Feedback[]> {
  await lead(user);
  const st = status === "new" || status === "reviewed" || status === "escalated" ? status : null;
  const rows = await all<{ id: string; body: string; status: FeedbackStatus; ticket_id: string | null; number: number | null; name: string | null; phone: string | null; created_at: string }>(
    `SELECT f.id, f.body, f.status, f.ticket_id, t.number, c.name, c.phone, f.created_at FROM sup_bot_feedback f
     LEFT JOIN sup_customers c ON c.id = f.customer_id LEFT JOIN sup_tickets t ON t.id = f.ticket_id
     WHERE f.bot = ?${st ? " AND f.status = ?" : ""} ORDER BY f.created_at DESC LIMIT 200`,
    bot,
    ...(st ? [st] : []),
  );
  return rows.map((r) => ({ id: r.id, body: r.body, status: r.status, ticketId: r.ticket_id, ticketNumber: r.number === null ? null : Number(r.number), customer: r.name ?? "Unknown", phone: r.phone, createdAt: r.created_at }));
}

export async function setFeedbackStatus(user: AppUser, id: string, status: "new" | "reviewed") {
  await lead(user);
  const f = await get<{ status: string }>("SELECT status FROM sup_bot_feedback WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Unknown feedback.");
  if (f.status === "escalated") throw new WorkflowError("INVALID_STATE", "This feedback is already a ticket.");
  await run("UPDATE sup_bot_feedback SET status = ?, reviewed_by = ?, updated_at = ? WHERE id = ?", status === "new" ? "new" : "reviewed", user.id, nowIso(), id);
}

// Feedback that needs action becomes a ticket for the bot's system, from the same customer.
export async function escalateFeedback(user: AppUser, id: string) {
  await lead(user);
  const f = await get<{ bot: string; body: string; status: string; customer_id: string | null }>("SELECT bot, body, status, customer_id FROM sup_bot_feedback WHERE id = ?", id);
  if (!f) throw new WorkflowError("NOT_FOUND", "Unknown feedback.");
  if (f.status === "escalated") throw new WorkflowError("INVALID_STATE", "This feedback is already a ticket.");
  if (!f.customer_id) throw new WorkflowError("INVALID_STATE", "The customer is no longer on file.");
  const sd = await import("./support-desk");
  const app = f.bot === "default" ? null : await get<{ id: string; queue_id: string | null }>("SELECT id, queue_id FROM sup_apps WHERE id = ?", f.bot);
  const ticketId = await sd.createTicketFromChannel({ subject: `Feedback: ${f.body.slice(0, 70)}`, body: f.body, customerId: f.customer_id, channel: "telegram", appQueue: app?.queue_id ?? null, appId: app?.id ?? null });
  await run("UPDATE sup_bot_feedback SET status = 'escalated', ticket_id = ?, reviewed_by = ?, updated_at = ? WHERE id = ?", ticketId, user.id, nowIso(), id);
  await audit({ actor: user }, { action: "support.bot", summary: `${user.name} turned bot feedback into a ticket` });
  const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", ticketId);
  return { ticketId, number: t ? Number(t.number) : null };
}

// ---------------------------------------------------------------------------
// In the chat (called from support-channels.ts with the bot already chosen)
// ---------------------------------------------------------------------------

type Texts = ch.TelegramTexts;
const am = (x: Texts) => x.lang === "am";
const pick = (x: Texts, en: string, amh: string) => (x.lang === "en" ? en : x.lang === "am" ? amh : `${en}\n${amh}`);

async function meta(customerId: string) {
  return parseJson<Record<string, string>>((await get<{ meta: string }>("SELECT meta FROM sup_customers WHERE id = ?", customerId))?.meta, {});
}
async function setMeta(customerId: string, patch: Record<string, string | null>) {
  const m = await meta(customerId);
  for (const [k, v] of Object.entries(patch)) if (v === null) delete m[k];
  else m[k] = v;
  await run("UPDATE sup_customers SET meta = ? WHERE id = ?", JSON.stringify(m), customerId);
}

// Extra rows for the bot's main menu.
export async function menuRows(bot: string, x: Texts) {
  const rows: { text: string; callback_data: string }[] = [];
  if (x.resources && (await get("SELECT id FROM sup_bot_content WHERE bot = ? AND active = 1 LIMIT 1", bot))) rows.push({ text: am(x) ? "መረጃዎች" : "Resources", callback_data: "r" });
  if (x.surveys && (await get("SELECT id FROM sup_bot_forms WHERE bot = ? AND active = 1 LIMIT 1", bot))) rows.push({ text: am(x) ? "ቅጾች እና ጥናቶች" : "Forms and surveys", callback_data: "s" });
  if (x.feedback) rows.push({ text: am(x) ? "አስተያየት ይስጡ" : "Send feedback", callback_data: "f" });
  const out: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += 2) out.push(rows.slice(i, i + 2));
  return out;
}

const backRow = (x: Texts) => [{ text: am(x) ? "« ማውጫ" : "« Menu", callback_data: "m" }];

// A button press this module owns; false when it is not one.
export async function button(bot: string, chat: string, customerId: string, data: string, x: Texts): Promise<boolean> {
  const send = (text: string, extra: Record<string, unknown> = {}) => ch.botApi("sendMessage", { chat_id: chat, text: text.slice(0, 4000), ...extra });
  if (data === "r") {
    const items = await all<{ id: string; title: string }>("SELECT id, title FROM sup_bot_content WHERE bot = ? AND active = 1 ORDER BY created_at DESC LIMIT 20", bot);
    if (!items.length) return void (await send(am(x) ? "አሁን ምንም መረጃ የለም።" : "Nothing here yet.", { reply_markup: { inline_keyboard: [backRow(x)] } })), true;
    await send(am(x) ? "መረጃዎች" : "Resources", { reply_markup: { inline_keyboard: [...items.map((i) => [{ text: i.title.slice(0, 60), callback_data: `r:${i.id}` }]), backRow(x)] } });
    return true;
  }
  if (data.startsWith("r:")) {
    const item = await get<Sendable>("SELECT id, title, kind, caption, url, pub, data FROM sup_bot_content WHERE id = ? AND bot = ? AND active = 1", data.slice(2), bot);
    if (!item) return void (await send(am(x) ? "ይህ መረጃ ከእንግዲህ የለም።" : "This is no longer available.")), true;
    const r = await sendItem(chat, item, await ch.botOrigin());
    if (r.ok) await run("UPDATE sup_bot_content SET sends = sends + 1 WHERE id = ?", item.id);
    return true;
  }
  if (data === "s") {
    const forms = await all<{ id: string; title: string }>("SELECT id, title FROM sup_bot_forms WHERE bot = ? AND active = 1 ORDER BY created_at DESC LIMIT 20", bot);
    if (!forms.length) return void (await send(am(x) ? "አሁን ምንም ቅጽ የለም።" : "No forms right now.", { reply_markup: { inline_keyboard: [backRow(x)] } })), true;
    await send(am(x) ? "ቅጾች እና ጥናቶች" : "Forms and surveys", { reply_markup: { inline_keyboard: [...forms.map((f) => [{ text: f.title.slice(0, 60), callback_data: `s:${f.id}` }]), backRow(x)] } });
    return true;
  }
  if (data.startsWith("s:")) {
    const form = await get<{ id: string; title: string; intro: string | null }>("SELECT id, title, intro FROM sup_bot_forms WHERE id = ? AND bot = ? AND active = 1", data.slice(2), bot);
    if (!form) return void (await send(am(x) ? "ይህ ቅጽ ተዘግቷል።" : "This form is closed.")), true;
    const now = nowIso();
    const rid = uid("brs_");
    await run("INSERT INTO sup_bot_responses (id, form_id, customer_id, answers, step, done, created_at, updated_at) VALUES (?, ?, ?, '[]', 0, 0, ?, ?)", rid, form.id, customerId, now, now);
    await setMeta(customerId, { tgForm: rid, tgFeedback: null });
    await send([form.title, form.intro].filter(Boolean).join("\n\n"));
    await ask(chat, rid, x);
    return true;
  }
  if (data.startsWith("q:")) {
    const [rid, value] = [data.slice(2, data.lastIndexOf(":")), data.slice(data.lastIndexOf(":") + 1)];
    await answer(chat, customerId, rid, { index: value }, x);
    return true;
  }
  if (data.startsWith("x:")) {
    await setMeta(customerId, { tgForm: null });
    await send(am(x) ? "ቅጹ ተሰርዟል።" : "Stopped. You can start again from the menu.", { reply_markup: { inline_keyboard: [backRow(x)] } });
    return true;
  }
  if (data === "f") {
    await setMeta(customerId, { tgFeedback: nowIso(), tgForm: null });
    await send(pick(x, x.feedbackAsk, x.feedbackAskAm));
    return true;
  }
  return false;
}

// The next question of a response, with buttons for choices and ratings.
async function ask(chat: string, rid: string, x: Texts) {
  const r = await get<{ step: number; questions: string }>("SELECT r.step, f.questions FROM sup_bot_responses r JOIN sup_bot_forms f ON f.id = r.form_id WHERE r.id = ?", rid);
  if (!r) return;
  const qs = parseJson<Question[]>(r.questions, []);
  const step = Number(r.step);
  const q = qs[step];
  if (!q) return;
  const rows: { text: string; callback_data: string }[][] = [];
  if (q.type === "choice") q.options.forEach((o, i) => rows.push([{ text: o, callback_data: `q:${rid}:${i}` }]));
  if (q.type === "rating") rows.push([1, 2, 3, 4, 5].map((n) => ({ text: String(n), callback_data: `q:${rid}:${n}` })));
  if (!q.required) rows.push([{ text: am(x) ? "ዝለል" : "Skip", callback_data: `q:${rid}:-` }]);
  rows.push([{ text: am(x) ? "አቁም" : "Stop", callback_data: `x:${rid}` }]);
  const hint = q.type === "text" ? (am(x) ? "\n(መልስዎን ይጻፉ)" : "\n(Write your answer)") : q.type === "rating" ? (am(x) ? "\n(1 ዝቅተኛ፣ 5 ከፍተኛ)" : "\n(1 is lowest, 5 is highest)") : "";
  await ch.botApi("sendMessage", { chat_id: chat, text: `${step + 1}/${qs.length}. ${q.text}${hint}`, reply_markup: { inline_keyboard: rows } });
}

// An answer, from a button (index, rating or "-" to skip) or a typed message; then the next question or thanks.
async function answer(chat: string, customerId: string, rid: string, a: { index?: string; text?: string }, x: Texts) {
  const r = await get<{ id: string; step: number; answers: string; done: number; customer_id: string | null; questions: string }>(
    "SELECT r.id, r.step, r.answers, r.done, r.customer_id, f.questions FROM sup_bot_responses r JOIN sup_bot_forms f ON f.id = r.form_id WHERE r.id = ?",
    rid,
  );
  if (!r || Number(r.done) || r.customer_id !== customerId) return;
  const qs = parseJson<Question[]>(r.questions, []);
  const step = Number(r.step);
  const q = qs[step];
  if (!q) return;
  let value: string | null = null;
  if (a.index === "-" && !q.required) value = null;
  else if (q.type === "choice" && a.index !== undefined) value = q.options[Number(a.index)] ?? null;
  else if (q.type === "rating" && a.index !== undefined) value = /^[1-5]$/.test(a.index) ? a.index : null;
  else if (q.type === "rating" && a.text) value = /^[1-5]$/.test(a.text.trim()) ? a.text.trim() : null;
  else if (q.type === "text" && a.text) value = clean(a.text, 2000) || null;
  else if (q.type === "choice" && a.text) value = q.options.find((o) => o.toLowerCase() === a.text!.trim().toLowerCase()) ?? null;
  if (value === null && !(a.index === "-" && !q.required)) {
    await ch.botApi("sendMessage", { chat_id: chat, text: am(x) ? "እባክዎ ከቁልፎቹ አንዱን ይምረጡ ወይም መልስ ይጻፉ።" : "Please use one of the buttons, or write your answer." });
    return ask(chat, rid, x);
  }
  const answers = parseJson<(string | null)[]>(r.answers, []);
  answers[step] = value;
  const next = step + 1;
  const done = next >= qs.length;
  // Moves on only from the step that was asked, so a double press does not skip a question.
  const moved = await get<{ id: string }>("UPDATE sup_bot_responses SET answers = ?, step = ?, done = ?, updated_at = ? WHERE id = ? AND step = ? RETURNING id", JSON.stringify(answers), next, done ? 1 : 0, nowIso(), rid, step);
  if (!moved) return;
  if (!done) return ask(chat, rid, x);
  await setMeta(customerId, { tgForm: null });
  await ch.botApi("sendMessage", { chat_id: chat, text: am(x) ? "እናመሰግናለን! መልሶችዎ ደርሰውናል።" : "Thank you! Your answers are in.", reply_markup: { inline_keyboard: [backRow(x)] } });
}

// A typed message: an answer to an open form, or the feedback asked for. True when it was one of these.
export async function message(bot: string, chat: string, customerId: string, text: string, x: Texts): Promise<boolean> {
  const m = await meta(customerId);
  if (m.tgBlocked) await setMeta(customerId, { tgBlocked: null });
  if (/^\/feedback\b/.test(text)) return button(bot, chat, customerId, "f", x);
  if (/^\/(resources|content)\b/.test(text)) return button(bot, chat, customerId, "r", x);
  if (/^\/(surveys|forms)\b/.test(text)) return button(bot, chat, customerId, "s", x);
  if (m.tgForm && text) {
    await answer(chat, customerId, m.tgForm, { text }, x);
    return true;
  }
  if (m.tgFeedback && Date.now() - Date.parse(m.tgFeedback) < 86400e3 && text) {
    const now = nowIso();
    await run("INSERT INTO sup_bot_feedback (id, bot, customer_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'new', ?, ?)", uid("bfb_"), bot, customerId, clean(text, 4000), now, now);
    await setMeta(customerId, { tgFeedback: null });
    await ch.botApi("sendMessage", { chat_id: chat, text: pick(x, x.feedbackThanks, x.feedbackThanksAm), reply_markup: { inline_keyboard: [backRow(x)] } });
    const sd = await import("./support-desk");
    const leads = (await sd.supportConfig()).leads;
    if (leads.length) await (await import("./notifications")).notify(leads, { type: "assignment", title: "New feedback from the Telegram bot", body: text.slice(0, 200), link: `/support?tab=bots&bot=${bot}&section=feedback`, dedupeKey: `bot-fb-${customerId}-${now}` }, now);
    return true;
  }
  return false;
}
