// Customer support channels besides the app (Phase 20): email (a mailbox in the app becomes the support inbox:
// new mail opens a ticket, replies thread by "[#1234]" in the subject or by the email headers, and agents' replies
// go out from it), Telegram (customers write to the support bot; agents' replies go back to the chat), and the
// knowledge base customers search before asking (and agents link in replies).

import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { seal, unseal } from "./secrets";
import type { AppUser } from "./users";
import { trackedFetch } from "./call-monitor";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Customers from email and Telegram
// ---------------------------------------------------------------------------

async function customerFor(input: { channel: "email" | "telegram"; key: string; name: string; email?: string | null }) {
  const ext = `${input.channel === "email" ? "mail" : "tg"}:${input.key.toLowerCase()}`;
  // A connected system's own bot: its customers belong to that system.
  const sys = input.channel === "telegram" ? botCtx.getStore() : undefined;
  if (sys) {
    const own = await get<{ id: string }>("SELECT id FROM sup_customers WHERE app_id = ? AND external_id = ?", sys.appId, ext);
    if (own) {
      await run("UPDATE sup_customers SET last_seen_at = ? WHERE id = ?", nowIso(), own.id);
      return own.id;
    }
    const cid = uid("cus_");
    await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, created_at, last_seen_at) VALUES (?, ?, ?, ?, NULL, ?, ?)", cid, sys.appId, ext, clean(input.name, 120) || input.key, nowIso(), nowIso());
    return cid;
  }
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
async function incoming(input: { channel: "email" | "telegram"; customerId: string; ticketId: string | null; subject: string; body: string; emailId?: string | null; category?: string | null }) {
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
  const sys = input.channel === "telegram" ? botCtx.getStore() : undefined;
  const id = await sd.createTicketFromChannel({ subject: input.subject, body, customerId: input.customerId, channel: input.channel, emailId: input.emailId ?? null, appQueue: sys?.queueId ?? null, appId: sys?.appId ?? null, category: input.category ?? null });
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
  const c = await get<{ email: string | null; external_id: string | null; app_id: string | null }>("SELECT email, external_id, app_id FROM sup_customers WHERE id = ?", t.customer_id);
  const sd = await import("./support-desk");
  const cfg = await sd.supportConfig();
  if (t.channel === "telegram" && c?.external_id?.startsWith("tg:")) {
    const send = () => telegramSend(c.external_id!.slice(3), `${body}\n\n- ${agentName.split(" ")[0]}, support (#${t.number})`);
    const sys = await systemBot(c.app_id);
    if (sys) await botCtx.run(sys, send);
    else await send();
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

type Poster = (url: string, body: unknown) => Promise<{ ok: boolean; result?: unknown; description?: string; error_code?: number }>;
let poster: Poster = async (url, body) => (await trackedFetch("telegram", url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json() as Promise<{ ok: boolean }>;
export function setTelegramPoster(p: Poster) {
  poster = p;
}
// Files customers send are downloaded from Telegram's file server (replaced in tests).
type Downloader = (url: string) => Promise<Buffer>;
let downloader: Downloader = async (url) => Buffer.from(await (await trackedFetch("telegram", url)).arrayBuffer());
export function setTelegramDownloader(d: Downloader) {
  downloader = d;
}

type TgState = { tokenEnc?: string; secret?: string; bot?: string; origin?: string };
async function telegramState() {
  return parseJson<TgState>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.telegram'"))?.value, {});
}
// The bot handling the current update or reply: a connected system's own bot, or (none set) the default bot.
type BotCtx = { appId: string; token: string; queueId: string | null; name: string };
const botCtx = new AsyncLocalStorage<BotCtx>();
async function systemBot(appId: string | null | undefined): Promise<BotCtx | null> {
  if (!appId) return null;
  const a = await get<{ id: string; name: string; tg_token: string | null; queue_id: string | null }>("SELECT id, name, tg_token, queue_id FROM sup_apps WHERE id = ?", appId);
  const token = a?.tg_token ? await unseal(a.tg_token) : null;
  return a && token ? { appId: a.id, token, queueId: a.queue_id, name: a.name } : null;
}
async function botToken() {
  const ctx = botCtx.getStore();
  if (ctx) return ctx.token;
  const s = await telegramState();
  return s.tokenEnc ? await unseal(s.tokenEnc) : null;
}
const api = async (method: string, body: unknown) => {
  const token = await botToken();
  if (!token) return { ok: false } as Awaited<ReturnType<Poster>>;
  return poster(`https://api.telegram.org/bot${token}/${method}`, body);
};
// For the bot manager (src/server/bot-manager.ts): which bot is answering, calls to it, and its public address.
export const botApi = api;
export function currentBot() {
  return botCtx.getStore()?.appId ?? "default";
}
export async function withBot<T>(bot: string, fn: () => Promise<T>) {
  if (bot === "default") return fn();
  const b = await systemBot(bot);
  if (!b) throw new WorkflowError("NOT_FOUND", "That system has no Telegram bot.");
  return botCtx.run(b, fn);
}
export async function botOrigin() {
  const ctx = botCtx.getStore();
  if (ctx) return (await get<{ tg_origin: string | null }>("SELECT tg_origin FROM sup_apps WHERE id = ?", ctx.appId))?.tg_origin ?? (await telegramState()).origin ?? null;
  return (await telegramState()).origin ?? null;
}

// What the bot says, set on the Telegram page (Customer support, Telegram). Labels come from the help menu.
export type TelegramTexts = {
  lang: "both" | "en" | "am";
  welcome: string;
  welcomeAm: string;
  ask: string;
  askAm: string;
  thanks: string;
  thanksAm: string;
  miniApp: boolean;
  askPhone: boolean;
  resources: boolean;
  surveys: boolean;
  feedback: boolean;
  feedbackAsk: string;
  feedbackAskAm: string;
  feedbackThanks: string;
  feedbackThanksAm: string;
};
export const DEFAULT_TG_TEXTS: TelegramTexts = {
  lang: "both",
  welcome: "Selam! What do you need help with?",
  welcomeAm: "ሰላም! በምን እንርዳዎት?",
  ask: "Write your question in one message. Our team will answer here.",
  askAm: "ጥያቄዎን በአንድ መልዕክት ይጻፉ። ቡድናችን እዚሁ ይመልስልዎታል።",
  thanks: "Thank you. Your request is #{number}. We will answer here.",
  thanksAm: "እናመሰግናለን። የጥያቄዎ ቁጥር #{number} ነው። እዚሁ እንመልስልዎታለን።",
  miniApp: true,
  askPhone: true,
  resources: true,
  surveys: true,
  feedback: true,
  feedbackAsk: "Write your feedback in one message. It goes to our team.",
  feedbackAskAm: "አስተያየትዎን በአንድ መልዕክት ይጻፉ። ለቡድናችን ይደርሳል።",
  feedbackThanks: "Thank you for your feedback.",
  feedbackThanksAm: "ስለ አስተያየትዎ እናመሰግናለን።",
};
// Each system's bot has its own texts; until set they are the default bot's.
const textsKey = (bot: string) => (bot === "default" ? "sup.telegram.texts" : `sup.telegram.texts.${bot}`);
const readTexts = async (key: string) => parseJson<Partial<TelegramTexts>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value, {});
export async function telegramTexts(bot = currentBot()): Promise<TelegramTexts> {
  return { ...DEFAULT_TG_TEXTS, ...(await readTexts(textsKey("default"))), ...(bot === "default" ? {} : await readTexts(textsKey(bot))) };
}
export async function saveTelegramTexts(user: AppUser, input: Partial<TelegramTexts>, bot = "default") {
  const sd = await import("./support-desk");
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin change the bot's texts.");
  if (bot !== "default" && !(await get("SELECT id FROM sup_apps WHERE id = ? AND tg_token IS NOT NULL", bot))) throw new WorkflowError("NOT_FOUND", "That system has no Telegram bot.");
  const cur = await telegramTexts(bot);
  const t = (k: keyof TelegramTexts, max = 600) => clean(input[k] ?? cur[k], max) || String(DEFAULT_TG_TEXTS[k]);
  const next: TelegramTexts = {
    lang: input.lang === "en" || input.lang === "am" || input.lang === "both" ? input.lang : cur.lang,
    welcome: t("welcome"),
    welcomeAm: t("welcomeAm"),
    ask: t("ask"),
    askAm: t("askAm"),
    thanks: t("thanks"),
    thanksAm: t("thanksAm"),
    miniApp: input.miniApp ?? cur.miniApp,
    askPhone: input.askPhone ?? cur.askPhone,
    resources: input.resources ?? cur.resources,
    surveys: input.surveys ?? cur.surveys,
    feedback: input.feedback ?? cur.feedback,
    feedbackAsk: t("feedbackAsk"),
    feedbackAskAm: t("feedbackAskAm"),
    feedbackThanks: t("feedbackThanks"),
    feedbackThanksAm: t("feedbackThanksAm"),
  };
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", textsKey(bot), JSON.stringify(next), nowIso(), user.id);
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} changed the ${bot === "default" ? "default" : "system"} Telegram bot's texts` });
  if (bot === "default" && (await telegramState()).tokenEnc) await setMenuButton(next).catch(() => null);
  return next;
}
const say = (x: TelegramTexts, en: string, am: string) => (x.lang === "en" ? en : x.lang === "am" ? am : `${en}\n${am}`);
const label = (x: TelegramTexts, c: { icon: string; labelEn: string; labelAm: string }) => `${x.lang === "am" ? c.labelAm : x.lang === "en" || c.labelAm === c.labelEn ? c.labelEn : `${c.labelEn} · ${c.labelAm}`}`;
const helpUrl = (origin: string | undefined) => (origin && /^https:\/\//.test(origin) ? `${origin}/help?from=telegram` : null);

// The menu button next to the chat's text box opens the help center as a Mini App (needs a public https address).
async function setMenuButton(x: TelegramTexts) {
  const url = helpUrl((await telegramState()).origin);
  return api("setChatMenuButton", url && x.miniApp ? { menu_button: { type: "web_app", text: x.lang === "am" ? "የእርዳታ ማዕከል" : "Help center", web_app: { url } } } : { menu_button: { type: "commands" } });
}

// Tells Telegram where to send messages and button presses, and sets the menu button.
async function hookUp(token: string, secret: string, origin: string) {
  return poster(`https://api.telegram.org/bot${token}/setWebhook`, { url: `${origin}/api/support/telegram/${secret}`, secret_token: secret, allowed_updates: ["message", "callback_query"] });
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
  const hook = await hookUp(t, secret, origin);
  if (!hook.ok) throw new WorkflowError("VALIDATION", "Telegram could not reach this site. It needs a public https address.");
  const bot = (me.result as { username?: string } | undefined)?.username ?? null;
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('sup.telegram', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify({ tokenEnc: await seal(t), secret, bot: bot ?? undefined, origin } satisfies TgState),
    nowIso(),
    user.id,
  );
  await setMenuButton(await telegramTexts()).catch(() => null);
  await poster(`https://api.telegram.org/bot${t}/setMyCommands`, { commands: [{ command: "start", description: "Help menu" }, { command: "menu", description: "Help menu" }] }).catch(() => null);
  await sd.saveSupportConfig(user, { telegram: true });
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} connected the Telegram bot @${bot}` });
  return { bot };
}

// Sets the webhook again (buttons need button presses delivered too) and the menu button, without a new token.
export async function refreshTelegram(user: AppUser, origin: string) {
  const sd = await import("./support-desk");
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin updates the Telegram bot.");
  const s = await telegramState();
  const token = await botToken();
  if (!token || !s.secret) throw new WorkflowError("INVALID_STATE", "Connect the bot first.");
  const hook = await hookUp(token, s.secret, origin);
  if (!hook.ok) throw new WorkflowError("VALIDATION", `Telegram could not set the webhook${hook.description ? `: ${hook.description}` : ""}.`);
  await run("UPDATE settings SET value = ?, updated_at = ? WHERE key = 'sup.telegram'", JSON.stringify({ ...s, origin }), nowIso());
  await setMenuButton(await telegramTexts()).catch(() => null);
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} updated the Telegram bot's webhook and menu` });
  return telegramHealth();
}

// A connected system's own bot: the token from @BotFather is sealed; Telegram sends its messages to its own address.
export async function connectSystemBot(user: AppUser, appId: string, token: string, origin: string) {
  const sd = await import("./support-desk");
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin connects Telegram bots.");
  const a = await get<{ id: string; name: string }>("SELECT id, name FROM sup_apps WHERE id = ?", appId);
  if (!a) throw new WorkflowError("NOT_FOUND", "Unknown system.");
  const t = clean(token, 100);
  if (!/^\d+:[\w-]{20,}$/.test(t)) throw new WorkflowError("VALIDATION", "Paste the bot token from @BotFather (numbers, a colon, then letters).");
  const def = await botToken().catch(() => null);
  const other = await all<{ tg_token: string | null }>("SELECT tg_token FROM sup_apps WHERE id <> ? AND tg_token IS NOT NULL", appId);
  for (const o of other) if ((await unseal(o.tg_token!)) === t) throw new WorkflowError("VALIDATION", "Another system already uses this bot. Each system needs its own bot.");
  if (def === t) throw new WorkflowError("VALIDATION", "This is the default support bot. Make a new bot with @BotFather for this system.");
  const me = await poster(`https://api.telegram.org/bot${t}/getMe`, {});
  if (!me.ok) throw new WorkflowError("VALIDATION", "Telegram did not accept that token.");
  const secret = crypto.randomBytes(16).toString("hex");
  const hook = await hookUp(t, secret, origin);
  if (!hook.ok) throw new WorkflowError("VALIDATION", "Telegram could not reach this site. It needs a public https address.");
  const bot = (me.result as { username?: string } | undefined)?.username ?? null;
  await run("UPDATE sup_apps SET tg_token = ?, tg_secret = ?, tg_bot = ?, tg_origin = ? WHERE id = ?", await seal(t), secret, bot, origin, appId);
  await poster(`https://api.telegram.org/bot${t}/setMyCommands`, { commands: [{ command: "start", description: "Help menu" }, { command: "menu", description: "Help menu" }, { command: "feedback", description: "Send feedback" }] }).catch(() => null);
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} connected the bot @${bot} to ${a.name}` });
  return { bot };
}

export async function disconnectSystemBot(user: AppUser, appId: string) {
  const sd = await import("./support-desk");
  if (!sd.isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin disconnects Telegram bots.");
  const bot = await systemBot(appId);
  if (bot) await poster(`https://api.telegram.org/bot${bot.token}/deleteWebhook`, {}).catch(() => null);
  await run("UPDATE sup_apps SET tg_token = NULL, tg_secret = NULL, tg_bot = NULL WHERE id = ?", appId);
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} disconnected ${bot?.name ?? "a system"}'s Telegram bot` });
}

export async function telegramInfo() {
  const s = await telegramState();
  return { connected: !!s.tokenEnc, bot: s.bot ?? null };
}

// The webhook as Telegram sees it: address, waiting updates, last error, and whether button presses arrive.
export async function telegramHealth() {
  const s = await telegramState();
  if (!s.tokenEnc) return { connected: false as const };
  const r = await api("getWebhookInfo", {}).catch(() => ({ ok: false }) as Awaited<ReturnType<Poster>>);
  const w = (r.result ?? {}) as { url?: string; pending_update_count?: number; last_error_date?: number; last_error_message?: string; allowed_updates?: string[] };
  const buttons = !w.allowed_updates || w.allowed_updates.includes("callback_query");
  return {
    connected: true as const,
    bot: s.bot ?? null,
    reachable: r.ok,
    url: w.url ?? null,
    pending: Number(w.pending_update_count ?? 0),
    lastError: w.last_error_message ? `${w.last_error_message}${w.last_error_date ? ` (${new Date(w.last_error_date * 1000).toISOString().slice(0, 16).replace("T", " ")})` : ""}` : null,
    buttons,
    miniApp: !!helpUrl(s.origin),
  };
}

async function telegramSend(chatId: string, text: string, extra: Record<string, unknown> = {}) {
  await api("sendMessage", { chat_id: chatId, text: text.slice(0, 4000), ...extra });
}

// The help menu as buttons, two in a row, and the help center (Mini App) when the site has a public https address.
async function sendMenu(chat: string, x: TelegramTexts) {
  const { helpCategories } = await import("./support-help");
  const cats = await helpCategories({ activeOnly: true });
  const rows: { text: string; callback_data?: string; web_app?: { url: string } }[][] = [];
  for (let i = 0; i < cats.length; i += 2) rows.push(cats.slice(i, i + 2).map((c) => ({ text: label(x, c), callback_data: `c:${c.key}` })));
  rows.push(...(await (await import("./bot-manager")).menuRows(currentBot(), x)));
  const url = helpUrl((await telegramState()).origin);
  if (url && x.miniApp && currentBot() === "default") rows.push([{ text: x.lang === "am" ? "የእርዳታ ማዕከል" : "Open the help center", web_app: { url } }]);
  await telegramSend(chat, say(x, x.welcome, x.welcomeAm), { reply_markup: { inline_keyboard: rows } });
}

type TgFrom = { id?: number; first_name?: string; last_name?: string; username?: string };
type TgUpdate = {
  message?: {
    message_id: number;
    text?: string;
    caption?: string;
    chat: { id: number; type: string };
    from?: TgFrom;
    contact?: { phone_number: string; user_id?: number };
    photo?: { file_id: string; file_size?: number; width?: number }[];
    document?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
  };
  callback_query?: { id: string; data?: string; from: TgFrom; message?: { chat: { id: number; type: string } } };
};
const nameOf = (f?: TgFrom) => [f?.first_name, f?.last_name].filter(Boolean).join(" ") || f?.username || "Telegram customer";

async function customerMeta(id: string) {
  return parseJson<Record<string, string>>((await get<{ meta: string }>("SELECT meta FROM sup_customers WHERE id = ?", id))?.meta, {});
}
async function setCustomerMeta(id: string, patch: Record<string, string | null>) {
  const m = await customerMeta(id);
  for (const [k, v] of Object.entries(patch)) if (v === null) delete m[k];
  else m[k] = v;
  await run("UPDATE sup_customers SET meta = ? WHERE id = ?", JSON.stringify(m), id);
}

// A button press: a category shows its help articles; "Still need help?" asks for the question, which then opens a
// request in that category's queue.
async function telegramButton(q: NonNullable<TgUpdate["callback_query"]>, x: TelegramTexts) {
  await api("answerCallbackQuery", { callback_query_id: q.id }).catch(() => null);
  const chat = String(q.message?.chat.id ?? q.from.id ?? "");
  if (!chat || (q.message && q.message.chat.type !== "private")) return;
  const data = String(q.data ?? "");
  const h = await import("./support-help");
  if (data === "m") return sendMenu(chat, x);
  if (/^(r|s|f)$|^(r|s|q|x):/.test(data)) {
    const who = await customerFor({ channel: "telegram", key: chat, name: nameOf(q.from) });
    if (await (await import("./bot-manager")).button(currentBot(), chat, who, data, x)) return;
  }
  const [kind, key] = [data.slice(0, 1), data.slice(2)];
  const c = await h.helpCategory(key);
  if (!c || !c.active) return sendMenu(chat, x);
  const customerId = await customerFor({ channel: "telegram", key: chat, name: nameOf(q.from) });
  if (kind === "c" && c.selfHelp) {
    const arts = await h.categoryArticles(c.key, 5);
    if (arts.length) {
      const origin = (await telegramState()).origin;
      const https = !!helpUrl(origin);
      const list = arts.map((a, i) => `${i + 1}. ${a.title}${https ? "" : origin ? `\n${origin}/help/${a.id}` : ""}`).join("\n");
      const rows: { text: string; url?: string; callback_data?: string }[][] = https ? arts.map((a) => [{ text: a.title.slice(0, 60), url: `${origin}/help/${a.id}` }]) : [];
      rows.push([{ text: x.lang === "am" ? "አሁንም እርዳታ ይፈልጋሉ?" : "Still need help?", callback_data: `a:${c.key}` }], [{ text: x.lang === "am" ? "« ማውጫ" : "« Menu", callback_data: "m" }]);
      await telegramSend(chat, `${label(x, c)}\n\n${list}`, { reply_markup: { inline_keyboard: rows } });
      return;
    }
  }
  // Straight to asking: the next message opens a request in this category.
  await setCustomerMeta(customerId, { tgCategory: c.key, tgCategoryAt: nowIso() });
  const extra: Record<string, unknown> = {};
  const phone = (await get<{ phone: string | null }>("SELECT phone FROM sup_customers WHERE id = ?", customerId))?.phone;
  if (x.askPhone && !phone) extra.reply_markup = { keyboard: [[{ text: x.lang === "am" ? "ስልክ ቁጥሬን አጋራ" : "Share my phone number", request_contact: true }]], resize_keyboard: true, one_time_keyboard: true };
  await telegramSend(chat, `${label(x, c)}\n${say(x, x.ask, x.askAm)}`, extra);
}

// A message to the bot (Telegram's webhook, checked by its secret).
export async function telegramUpdate(secret: string, headerSecret: string | null, update: TgUpdate) {
  const s = await telegramState();
  if (s.secret && secret === s.secret) {
    if (headerSecret && headerSecret !== s.secret) throw new WorkflowError("FORBIDDEN", "Unknown hook.");
    return handleUpdate(update);
  }
  const app = secret ? await get<{ id: string; active: number; channels: string | null }>("SELECT id, active, channels FROM sup_apps WHERE tg_secret = ?", secret) : null;
  if (!app || (headerSecret && headerSecret !== secret)) throw new WorkflowError("FORBIDDEN", "Unknown hook.");
  const bot = await systemBot(app.id);
  if (!bot) throw new WorkflowError("FORBIDDEN", "Unknown hook.");
  const { channelsOf } = await import("./connected-systems");
  if (!Number(app.active) || !channelsOf(app.channels).telegram) {
    const chat = update.message?.chat.id ?? update.callback_query?.from.id;
    if (chat) await botCtx.run(bot, () => telegramSend(String(chat), "Support on Telegram is not available for this app right now. / በቴሌግራም ድጋፍ አሁን አይገኝም።"));
    return { ok: true };
  }
  return botCtx.run(bot, () => handleUpdate(update));
}

async function handleUpdate(update: TgUpdate) {
  const sd = await import("./support-desk");
  if (!(await sd.supportConfig()).enabled) return { ok: true };
  const x = await telegramTexts();
  if (update.callback_query) {
    await telegramButton(update.callback_query, x);
    return { ok: true };
  }
  const m = update.message;
  if (!m || m.chat.type !== "private") return { ok: true };
  const text = (m.text ?? m.caption ?? "").trim();
  const chat = String(m.chat.id);
  const name = nameOf(m.from);
  // Kept from /start on, so everyone who opened the bot gets its sends.
  const customerId = await customerFor({ channel: "telegram", key: chat, name });
  if (/^\/(start|menu|help)\b/.test(text)) {
    await (await import("./bot-manager")).message(currentBot(), chat, customerId, "", x);
    await sendMenu(chat, x);
    return { ok: true };
  }
  // Their own number, shared with the button: kept on the customer so agents can find their records by phone.
  if (m.contact) {
    if (!m.contact.user_id || m.contact.user_id === m.from?.id) {
      const phone = clean(m.contact.phone_number, 40).replace(/^(?=\d)/, "+");
      await run("UPDATE sup_customers SET phone = ? WHERE id = ?", phone, customerId);
      await telegramSend(chat, x.lang === "am" ? "እናመሰግናለን፣ ስልክ ቁጥርዎ ተቀምጧል።" : "Thank you, your number is saved.", { reply_markup: { remove_keyboard: true } });
    }
    return { ok: true };
  }
  // Answers to a form, feedback, and the content and form commands.
  if (await (await import("./bot-manager")).message(currentBot(), chat, customerId, text, x)) return { ok: true };
  const file = m.document ? { id: m.document.file_id, name: m.document.file_name ?? "file", mime: m.document.mime_type ?? "application/octet-stream", size: m.document.file_size ?? 0 } : m.photo?.length ? { id: m.photo.at(-1)!.file_id, name: `photo-${m.message_id}.jpg`, mime: "image/jpeg", size: m.photo.at(-1)!.file_size ?? 0 } : null;
  // The open conversation continues; otherwise a new ticket, in the category chosen from the menu (for a day).
  const open = await get<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND channel = 'telegram' AND status NOT IN ('closed') ORDER BY updated_at DESC LIMIT 1", customerId);
  const meta = await customerMeta(customerId);
  const category = !open && meta.tgCategory && Date.now() - Date.parse(meta.tgCategoryAt ?? "") < 86400e3 ? meta.tgCategory : null;
  const h = category ? await import("./support-help") : null;
  const cat = h ? await h.helpCategory(category) : null;
  const body = text || (file ? (m.photo ? "(a photo)" : `(a file: ${file.name})`) : "(an empty message)");
  const id = await incoming({ channel: "telegram", customerId, ticketId: open?.id ?? null, subject: `${cat ? `${cat.labelEn}: ` : ""}${text.slice(0, 70) || (file ? file.name : "Telegram message")}`, body, category });
  if (category) await setCustomerMeta(customerId, { tgCategory: null, tgCategoryAt: null });
  if (file) {
    const h2 = await import("./support-help");
    try {
      if (file.size > h2.TICKET_FILE_MAX) throw new Error("larger than 10 MB");
      const info = await api("getFile", { file_id: file.id });
      const path = (info.result as { file_path?: string } | undefined)?.file_path;
      const token = await botToken();
      if (!info.ok || !path || !token) throw new Error("Telegram did not give the file");
      await h2.attachTicketFile(id, { name: file.name, mime: file.mime, data: await downloader(`https://api.telegram.org/file/bot${token}/${path}`) });
    } catch (e) {
      await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), id, `The customer sent ${file.name}, but it could not be kept: ${e instanceof Error ? e.message : String(e)}. Ask them to send it again or describe it.`, nowIso());
    }
  }
  if (!open) {
    const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", id);
    await telegramSend(chat, say(x, x.thanks, x.thanksAm).replaceAll("{number}", String(t?.number ?? "")));
  }
  return { ok: true };
}

// The bot token, for checking a Mini App's signed initData (src/server/support-help.ts).
export async function telegramBotToken() {
  return botToken();
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
