// Customer support channels besides the app (Phase 20): email (a mailbox in the app becomes the support inbox:
// new mail opens a ticket, replies thread by "[#1234]" in the subject or by the email headers, and agents' replies
// go out from it), Telegram (customers write to the support bot; agents' replies go back to the chat), and the
// knowledge base customers search before asking (and agents link in replies).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { seal, unseal } from "./secrets";
import type { AppUser } from "./users";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Customers from email and Telegram
// ---------------------------------------------------------------------------

async function customerFor(input: { channel: "email" | "telegram"; key: string; name: string; email?: string | null }) {
  const ext = `${input.channel === "email" ? "mail" : "tg"}:${input.key.toLowerCase()}`;
  const found = await get<{ id: string }>("SELECT id FROM sup_customers WHERE app_id IS NULL AND external_id = ?", ext);
  if (found) {
    await run("UPDATE sup_customers SET last_seen_at = ? WHERE id = ?", nowIso(), found.id);
    return found.id;
  }
  // The same email may already be a customer of an app: then it is that customer.
  if (input.email) {
    const byMail = await get<{ id: string }>("SELECT id FROM sup_customers WHERE LOWER(email) = LOWER(?) ORDER BY created_at LIMIT 1", input.email);
    if (byMail) return byMail.id;
  }
  const id = uid("cus_");
  await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?)", id, ext, clean(input.name, 120) || input.key, input.email ?? null, nowIso(), nowIso());
  return id;
}

// A message from outside: added to the ticket it answers, else a new ticket (given out as any other).
async function incoming(input: { channel: "email" | "telegram"; customerId: string; ticketId: string | null; subject: string; body: string; emailId?: string | null }) {
  const sd = await import("./support-desk");
  const body = clean(input.body, 8000) || "(empty message)";
  const now = nowIso();
  if (input.ticketId) {
    const t = await get<{ id: string; number: number; status: string; assignee_id: string | null }>("SELECT id, number, status, assignee_id FROM sup_tickets WHERE id = ?", input.ticketId);
    if (t && t.status !== "closed") {
      await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at, email_id) VALUES (?, ?, 'customer', ?, ?, 0, ?, ?)", uid("smg_"), t.id, input.customerId, body, now, input.emailId ?? null);
      await run("UPDATE sup_tickets SET status = CASE WHEN status IN ('pending','solved') THEN 'open' ELSE status END, solved_at = CASE WHEN status = 'solved' THEN NULL ELSE solved_at END, last_customer_at = ?, updated_at = ? WHERE id = ?", now, now, t.id);
      if (t.assignee_id) await (await import("./notifications")).notify([t.assignee_id], { type: "assignment", title: `#${t.number}: the customer replied (${input.channel === "email" ? "email" : "Telegram"})`, body: body.slice(0, 200), link: `/support?ticket=${t.id}`, dedupeKey: `sup-in-${t.id}-${now}` }, now);
      else await sd.autoAssign(t.id);
      return t.id;
    }
  }
  const app = { queue_id: null } as { queue_id: string | null };
  const id = await sd.createTicketFromChannel({ subject: input.subject, body, customerId: input.customerId, channel: input.channel, emailId: input.emailId ?? null, appQueue: app.queue_id });
  return id;
}

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

const NUMBER = /\[#(\d+)\]/;

// Reads the support mailbox for new mail since the last check.
export async function pollSupportMailbox() {
  const sd = await import("./support-desk");
  const cfg = await sd.supportConfig();
  if (!cfg.enabled || !cfg.mailbox) return { read: 0 };
  const { mailboxNewMessages } = await import("./mail");
  const key = `sup.mail.${cfg.mailbox.toLowerCase()}`;
  const last = Number(parseJson<number>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value, 0));
  const { messages, lastUid } = await mailboxNewMessages(cfg.mailbox, last);
  let read = 0;
  for (const m of messages) {
    // Our own replies and mail loops are left alone.
    if (!m.fromAddress || m.fromAddress === cfg.mailbox.toLowerCase() || /mailer-daemon|no-?reply/i.test(m.fromAddress)) continue;
    if (m.messageId && (await get("SELECT 1 AS x FROM sup_messages WHERE email_id = ?", m.messageId))) continue;
    const customerId = await customerFor({ channel: "email", key: m.fromAddress, name: m.fromName, email: m.fromAddress });
    let ticketId: string | null = null;
    const num = m.subject.match(NUMBER)?.[1];
    if (num) ticketId = (await get<{ id: string }>("SELECT id FROM sup_tickets WHERE number = ?", Number(num)))?.id ?? null;
    for (const ref of [m.inReplyTo, ...m.references].filter(Boolean) as string[]) {
      if (ticketId) break;
      ticketId = (await get<{ ticket_id: string }>("SELECT ticket_id FROM sup_messages WHERE email_id = ?", ref))?.ticket_id ?? null;
    }
    // Only the customer of the ticket continues it by email.
    if (ticketId && !(await get("SELECT 1 AS x FROM sup_tickets WHERE id = ? AND customer_id = ?", ticketId, customerId))) ticketId = null;
    // Quoted earlier messages are cut off: only the new part of a reply goes on the ticket.
    const text = m.text.split(/\n(?:On .{5,120} wrote:|-{2,} ?Original Message|>.*\n>)/)[0]!.trim() || m.text;
    await incoming({ channel: "email", customerId, ticketId, subject: m.subject.replace(NUMBER, "").replace(/^(re|fwd?):\s*/i, "").trim(), body: text, emailId: m.messageId });
    read++;
  }
  await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, JSON.stringify(lastUid), nowIso());
  return { read };
}

// An agent's public reply on an email or Telegram ticket goes back the same way.
export async function deliverReply(ticketId: string, body: string, agentName: string) {
  const t = await get<{ number: number; subject: string; channel: string; customer_id: string | null }>("SELECT number, subject, channel, customer_id FROM sup_tickets WHERE id = ?", ticketId);
  if (!t?.customer_id) return null;
  const c = await get<{ email: string | null; external_id: string | null }>("SELECT email, external_id FROM sup_customers WHERE id = ?", t.customer_id);
  const sd = await import("./support-desk");
  const cfg = await sd.supportConfig();
  if (t.channel === "telegram" && c?.external_id?.startsWith("tg:")) {
    await telegramSend(c.external_id.slice(3), `${body}\n\n- ${agentName.split(" ")[0]}, support (#${t.number})`);
    return "telegram";
  }
  if (t.channel === "email" && c?.email && cfg.mailbox) {
    const last = await get<{ email_id: string }>("SELECT email_id FROM sup_messages WHERE ticket_id = ? AND email_id IS NOT NULL ORDER BY created_at DESC LIMIT 1", ticketId);
    const refs = (await all<{ email_id: string }>("SELECT email_id FROM sup_messages WHERE ticket_id = ? AND email_id IS NOT NULL ORDER BY created_at", ticketId)).map((r) => r.email_id);
    const { sendFromMailbox } = await import("./mail");
    const r = await sendFromMailbox(cfg.mailbox, { to: [c.email], subject: `Re: ${t.subject} [#${t.number}]`, text: `${body}\n\n${agentName.split(" ")[0]}\nCustomer support\n\n(Reply to this email to continue. Keep [#${t.number}] in the subject.)`, inReplyTo: last?.email_id ?? null, references: refs });
    return r.messageId;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

type Poster = (url: string, body: unknown) => Promise<{ ok: boolean; result?: unknown }>;
let poster: Poster = async (url, body) => (await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json() as Promise<{ ok: boolean }>;
export function setTelegramPoster(p: Poster) {
  poster = p;
}

async function telegramState() {
  return parseJson<{ tokenEnc?: string; secret?: string; bot?: string }>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.telegram'"))?.value, {});
}

// Admin saves the bot token (from @BotFather): kept sealed; the app tells Telegram where to send messages.
export async function connectTelegram(user: AppUser, token: string, origin: string) {
  const sd = await import("./support-desk");
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin connects the Telegram bot.");
  const t = clean(token, 100);
  if (!/^\d+:[\w-]{20,}$/.test(t)) throw new WorkflowError("VALIDATION", "Paste the bot token from @BotFather (numbers, a colon, then letters).");
  const secret = crypto.randomBytes(16).toString("hex");
  const me = await poster(`https://api.telegram.org/bot${t}/getMe`, {});
  if (!me.ok) throw new WorkflowError("VALIDATION", "Telegram did not accept that token.");
  const hook = await poster(`https://api.telegram.org/bot${t}/setWebhook`, { url: `${origin}/api/support/telegram/${secret}`, secret_token: secret, allowed_updates: ["message"] });
  if (!hook.ok) throw new WorkflowError("VALIDATION", "Telegram could not reach this site. It needs a public https address.");
  const bot = (me.result as { username?: string } | undefined)?.username ?? null;
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('sup.telegram', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify({ tokenEnc: await seal(t), secret, bot }),
    nowIso(),
    user.id,
  );
  await sd.saveSupportConfig(user, { telegram: true });
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} connected the Telegram bot @${bot}` });
  return { bot };
}

export async function telegramInfo() {
  const s = await telegramState();
  return { connected: !!s.tokenEnc, bot: s.bot ?? null };
}

async function telegramSend(chatId: string, text: string) {
  const s = await telegramState();
  if (!s.tokenEnc) return;
  const token = await unseal(s.tokenEnc);
  if (!token) return;
  await poster(`https://api.telegram.org/bot${token}/sendMessage`, { chat_id: chatId, text: text.slice(0, 4000) });
}

// A message to the bot (Telegram's webhook, checked by its secret).
export async function telegramUpdate(secret: string, headerSecret: string | null, update: { message?: { message_id: number; text?: string; caption?: string; chat: { id: number; type: string }; from?: { first_name?: string; last_name?: string; username?: string } } }) {
  const s = await telegramState();
  if (!s.secret || secret !== s.secret || (headerSecret && headerSecret !== s.secret)) throw new WorkflowError("FORBIDDEN", "Unknown hook.");
  const sd = await import("./support-desk");
  if (!(await sd.supportConfig()).enabled) return { ok: true };
  const m = update.message;
  if (!m || m.chat.type !== "private") return { ok: true };
  const text = (m.text ?? m.caption ?? "").trim();
  const chat = String(m.chat.id);
  if (text === "/start") {
    await telegramSend(chat, "Selam! Write your question here and our support team will answer in this chat.");
    return { ok: true };
  }
  const name = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "Telegram customer";
  const customerId = await customerFor({ channel: "telegram", key: chat, name });
  // The open conversation continues; otherwise a new ticket.
  const open = await get<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND channel = 'telegram' AND status NOT IN ('closed') ORDER BY updated_at DESC LIMIT 1", customerId);
  const id = await incoming({ channel: "telegram", customerId, ticketId: open?.id ?? null, subject: text.slice(0, 80) || "Telegram message", body: text || "(a photo or file: ask the customer to describe it in words)" });
  if (!open) {
    const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", id);
    await telegramSend(chat, `Thank you. Your request is #${t?.number}. We will answer here.`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// The knowledge base
// ---------------------------------------------------------------------------

export type Article = { id: string; title: string; body: string; category: string | null; keywords: string; published: boolean; views: number; helpful: number; not_helpful: number; updated_at: string };
const articleOf = (r: Omit<Article, "published"> & { published: number }): Article => ({ ...r, published: !!Number(r.published), views: Number(r.views), helpful: Number(r.helpful), not_helpful: Number(r.not_helpful) });

export async function listArticles(user: AppUser) {
  const sd = await import("./support-desk");
  if (!(await sd.isAgent(user))) throw new WorkflowError("FORBIDDEN", "Only support agents see the knowledge base here.");
  return (await all<Omit<Article, "published"> & { published: number }>("SELECT * FROM sup_articles ORDER BY published DESC, category, title")).map(articleOf);
}

export async function saveArticle(user: AppUser, input: { id?: string | null; title: string; body: string; category?: string | null; keywords?: string; published?: boolean }) {
  const sd = await import("./support-desk");
  if (!(await sd.isAgent(user))) throw new WorkflowError("FORBIDDEN", "Only support agents write articles.");
  // Agents write drafts; leads publish.
  const publish = !!input.published;
  if (publish && !(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "A support lead publishes articles.");
  const title = clean(input.title, 160);
  const body = clean(input.body, 20000);
  if (!title || !body) throw new WorkflowError("VALIDATION", "Give the title and the answer.");
  const now = nowIso();
  if (input.id) {
    await run("UPDATE sup_articles SET title = ?, body = ?, category = ?, keywords = ?, published = ?, updated_by = ?, updated_at = ? WHERE id = ?", title, body, clean(input.category, 60) || null, clean(input.keywords, 300), publish ? 1 : 0, user.id, now, input.id);
    return input.id;
  }
  const id = uid("art_");
  await run("INSERT INTO sup_articles (id, title, body, category, keywords, published, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, title, body, clean(input.category, 60) || null, clean(input.keywords, 300), publish ? 1 : 0, user.id, user.id, now, now);
  return id;
}

// Customers' search: published articles whose title, keywords or text have the words, best first.
export async function searchArticles(q: string, limit = 8) {
  const words = [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2))].slice(0, 8);
  const rows = await all<{ id: string; title: string; body: string; category: string | null; keywords: string; helpful: number; views: number }>("SELECT id, title, body, category, keywords, helpful, views FROM sup_articles WHERE published = 1");
  if (!words.length) return rows.sort((a, b) => Number(b.views) - Number(a.views)).slice(0, limit).map((r) => ({ id: r.id, title: r.title, category: r.category, snippet: r.body.slice(0, 160) }));
  return rows
    .map((r) => {
      const t = r.title.toLowerCase();
      const k = r.keywords.toLowerCase();
      const b = r.body.toLowerCase();
      const score = words.reduce((s, w) => s + (t.includes(w) ? 5 : 0) + (k.includes(w) ? 3 : 0) + (b.includes(w) ? 1 : 0), 0) + Number(r.helpful) * 0.1;
      return { r, score };
    })
    .filter((x) => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => ({ id: r.id, title: r.title, category: r.category, snippet: r.body.slice(0, 160) }));
}

export async function readArticle(id: string) {
  const a = await get<{ id: string; title: string; body: string; category: string | null; updated_at: string }>("SELECT id, title, body, category, updated_at FROM sup_articles WHERE id = ? AND published = 1", id);
  if (!a) throw new WorkflowError("NOT_FOUND", "Article not found.");
  await run("UPDATE sup_articles SET views = views + 1 WHERE id = ?", id);
  return a;
}

export async function voteArticle(id: string, helpful: boolean) {
  await run(`UPDATE sup_articles SET ${helpful ? "helpful = helpful + 1" : "not_helpful = not_helpful + 1"} WHERE id = ? AND published = 1`, id);
}
