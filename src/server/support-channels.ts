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
      // A customer writing again brings an archived conversation back to the lists.
      await run("UPDATE sup_tickets SET status = CASE WHEN status IN ('pending','solved') THEN 'open' ELSE status END, solved_at = CASE WHEN status = 'solved' THEN NULL ELSE solved_at END, archived_at = NULL, last_customer_at = ?, updated_at = ? WHERE id = ?", now, now, t.id);
      if (t.assignee_id) await (await import("./notifications")).notify([t.assignee_id], { type: "assignment", title: `#${t.number}: the customer replied (${input.channel === "email" ? "email" : "Telegram"})`, body: body.slice(0, 200), link: `/support?ticket=${t.id}`, dedupeKey: `sup-in-${t.id}-${now}` }, now);
      else await sd.autoAssign(t.id);
      await (await import("./support-center")).escalateByWords(t.id, body).catch((e) => console.error("escalation rule", e));
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
// An agent's photo, voice note or file sent to a Telegram customer as itself (with the caption and the agent's name).
// Returns null for tickets that are not on Telegram.
export async function deliverFile(ticketId: string, file: { name: string; mime: string; data: Buffer }, caption: string, agentName: string) {
  const t = await get<{ number: number; channel: string; customer_id: string | null }>("SELECT number, channel, customer_id FROM sup_tickets WHERE id = ?", ticketId);
  if (!t?.customer_id || t.channel !== "telegram") return null;
  const c = await get<{ external_id: string | null; app_id: string | null }>("SELECT external_id, app_id FROM sup_customers WHERE id = ?", t.customer_id);
  if (!c?.external_id?.startsWith("tg:")) return null;
  const m = file.mime.toLowerCase();
  const [method, field] = /^image\/(jpe?g|png|webp)$/.test(m) ? ["sendPhoto", "photo"] : /^audio\/ogg/.test(m) ? ["sendVoice", "voice"] : /^audio\/(mpeg|mp3|mp4|m4a|x-m4a|aac)$/.test(m) ? ["sendAudio", "audio"] : /^video\/mp4$/.test(m) ? ["sendVideo", "video"] : ["sendDocument", "document"];
  const send = async () => {
    const token = await botToken();
    if (!token) throw new Error("The Telegram bot is not connected.");
    const form = new FormData();
    form.set("chat_id", c.external_id!.slice(3));
    form.set(field, new Blob([new Uint8Array(file.data)], { type: file.mime }), file.name);
    form.set("caption", `${caption ? `${caption}\n\n` : ""}- ${agentName.split(" ")[0]}, support (#${t.number})`.slice(0, 1024));
    const r = await uploader(method, token, form);
    if (!r.ok) throw new Error(r.description ?? "Telegram did not take the file");
    return "telegram";
  };
  const sys = await systemBot(c.app_id);
  return sys ? botCtx.run(sys, send) : send();
}

// The agent asks a Telegram customer for their number: the bot shows the "Share my phone number" button.
export async function askTelegramPhone(user: AppUser, ticketId: string) {
  const sd = await import("./support-desk");
  const t = await sd.canWork(user, ticketId);
  const c = t.customer_id ? await get<{ external_id: string | null; app_id: string | null }>("SELECT external_id, app_id FROM sup_customers WHERE id = ?", t.customer_id) : null;
  if (!c?.external_id?.startsWith("tg:")) throw new WorkflowError("VALIDATION", "This customer is not on Telegram.");
  const x = await telegramTexts((await systemBot(c.app_id))?.appId ?? "default");
  const send = () => askPhone(c.external_id!.slice(3), x);
  const sys = await systemBot(c.app_id);
  if (sys) await botCtx.run(sys, send);
  else await send();
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, `${user.name} asked the customer to share their phone number.`, nowIso());
  return { ok: true };
}

export async function deliverReply(ticketId: string, body: string, agentName: string) {
  const t = await get<{ number: number; subject: string; channel: string; customer_id: string | null }>("SELECT number, subject, channel, customer_id FROM sup_tickets WHERE id = ?", ticketId);
  if (!t?.customer_id) return null;
  const c = await get<{ email: string | null; external_id: string | null; app_id: string | null }>("SELECT email, external_id, app_id FROM sup_customers WHERE id = ?", t.customer_id);
  const sd = await import("./support-desk");
  const cfg = await sd.supportConfig();
  if (t.channel === "telegram" && c?.external_id?.startsWith("tg:")) {
    // With a button that opens this conversation in the support app (a deep link), when the app is on.
    const send = async () => {
      const url = (await telegramTexts()).miniApp ? supportAppUrl(await botOrigin(), currentBot(), `&page=t_${ticketId}`) : null;
      return telegramSend(c.external_id!.slice(3), `${body}\n\n- ${agentName.split(" ")[0]}, support (#${t.number})`, url ? { reply_markup: { inline_keyboard: [[{ text: "Open conversation", web_app: { url } }]] } } : {});
    };
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
// Files agents send go to Telegram as a form upload (replaced in tests).
type Uploader = (method: string, token: string, form: FormData) => Promise<{ ok: boolean; description?: string }>;
let uploader: Uploader = async (method, token, form) => (await trackedFetch("telegram", `https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form })).json() as Promise<{ ok: boolean; description?: string }>;
export function setTelegramUploader(u: Uploader) {
  uploader = u;
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
  callback: boolean;
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
  callback: true,
  feedbackAsk: "Write your feedback in one message. It goes to our team.",
  feedbackAskAm: "አስተያየትዎን በአንድ መልዕክት ይጻፉ። ለቡድናችን ይደርሳል።",
  feedbackThanks: "Thank you for your feedback.",
  feedbackThanksAm: "ስለ አስተያየትዎ እናመሰግናለን።",
};
// Each system's bot has its own texts; until set they are the default bot's.
const textsKey = (bot: string) => (bot === "default" ? "sup.telegram.texts" : `sup.telegram.texts.${bot}`);
const readTexts = async (key: string) => parseJson<Partial<TelegramTexts>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value, {});
export async function telegramTexts(bot = currentBot()): Promise<TelegramTexts> {
  // The switches (language, Mini App, phone, resources...) are kept here; the words are the published content
  // (support-content.ts), the one copy every reader uses.
  const base = { ...DEFAULT_TG_TEXTS, ...(await readTexts(textsKey("default"))), ...(bot === "default" ? {} : await readTexts(textsKey(bot))) };
  return { ...base, ...(await (await import("./support-content")).botTextsFromContent(bot)) } as TelegramTexts;
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
    callback: input.callback ?? cur.callback,
    feedbackAsk: t("feedbackAsk"),
    feedbackAskAm: t("feedbackAskAm"),
    feedbackThanks: t("feedbackThanks"),
    feedbackThanksAm: t("feedbackThanksAm"),
  };
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", textsKey(bot), JSON.stringify(next), nowIso(), user.id);
  await (await import("./support-content")).publishBotTexts(bot, next, user.id);
  await audit({ actor: user }, { action: "support.telegram", summary: `${user.name} changed the ${bot === "default" ? "default" : "system"} Telegram bot's texts` });
  if (bot !== "default" || (await telegramState()).tokenEnc) await withBot(bot, () => setMenuButton(next)).catch(() => null);
  return next;
}
const say = (x: TelegramTexts, en: string, am: string) => (x.lang === "en" ? en : x.lang === "am" ? am : `${en}\n${am}`);
const label = (x: TelegramTexts, c: { icon: string; labelEn: string; labelAm: string }) => `${x.lang === "am" ? c.labelAm : x.lang === "en" || c.labelAm === c.labelEn ? c.labelEn : `${c.labelEn} · ${c.labelAm}`}`;
const helpUrl = (origin: string | undefined) => (origin && /^https:\/\//.test(origin) ? `${origin}/help?from=telegram` : null);
// The support app inside Telegram (a Mini App): the same chat, calls, help and resources as the web widget.
const supportAppUrl = (origin: string | null | undefined, bot: string, extra = "") => (origin && /^https:\/\//.test(origin) ? `${origin}/support-widget?tg=${encodeURIComponent(bot)}${extra}` : null);

// The menu button next to the chat's text box opens the support app (needs a public https address).
async function setMenuButton(x: TelegramTexts) {
  const url = supportAppUrl(await botOrigin(), currentBot());
  return api("setChatMenuButton", url && x.miniApp ? { menu_button: { type: "web_app", text: x.lang === "am" ? "ድጋፍ" : "Support", web_app: { url } } } : { menu_button: { type: "commands" } });
}

// The support app opened from a bot: Telegram's signed data says who it is; they get the widget's session as the
// bot's system (or, for the default bot, as the Telegram app), the same customer as in the chat.
export async function telegramMiniApp(initData: string, bot: string) {
  const sd = await import("./support-desk");
  if (!(await sd.supportConfig()).enabled) throw new WorkflowError("INVALID_STATE", "Support is not available right now.");
  const sys = bot && bot !== "default" ? await systemBot(bot) : null;
  if (bot && bot !== "default" && !sys) throw new WorkflowError("NOT_FOUND", "That bot is not connected.");
  const token = sys ? sys.token : await botToken();
  if (!token) throw new WorkflowError("INVALID_STATE", "The Telegram bot is not connected.");
  const who = (await import("./support-help")).verifyTelegramInitData(initData, token);
  const run1 = () => customerFor({ channel: "telegram", key: String(who.id), name: who.name });
  const customerId = sys ? await botCtx.run(sys, run1) : await run1();
  const app = sys ? (await get<import("./support-desk").AppFull>("SELECT * FROM sup_apps WHERE id = ?", sys.appId))! : await sd.defaultTelegramApp();
  if (sys && !Number(app.active)) throw new WorkflowError("INVALID_STATE", "Support for this app is switched off.");
  return { key: app.public_key, session: await sd.sessionFor(app, customerId) };
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
  await withBot(appId, async () => setMenuButton(await telegramTexts(appId))).catch(() => null);
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
// "Share my phone number": Telegram's own button, which sends the person's verified number. Shown on /start until
// they share it, on /phone and from the menu at any time (to change it too).
const PHONE_BUTTON = (x: TelegramTexts) => (x.lang === "am" ? "ስልክ ቁጥሬን አጋራ" : "Share my phone number");
async function askPhone(chat: string, x: TelegramTexts) {
  await telegramSend(chat, x.lang === "am" ? "ስልክ ቁጥርዎን ያጋሩ፤ መለያዎን አግኝተን በፍጥነት እንረዳዎታለን። ከታች ያለውን ቁልፍ ይጫኑ።" : "Share your phone number so we can find your account and help you faster. Press the button below.", {
    reply_markup: { keyboard: [[{ text: PHONE_BUTTON(x), request_contact: true }]], resize_keyboard: true, is_persistent: true },
  });
}

// Words from the content store, in the customer's language (both while they have not chosen and the bot speaks both).
async function sayKey(x: TelegramTexts, key: string, vars: Record<string, string | number> = {}) {
  return (await import("./support-content")).contentSay(key, x.lang, currentBot(), vars);
}
async function btn(x: TelegramTexts, key: string) {
  const c = await import("./support-content");
  const [en, am] = await Promise.all([c.contentText(key, "en", currentBot()), c.contentText(key, "am", currentBot())]);
  return (x.lang === "am" ? am || en : x.lang === "en" ? en || am : en && am && en !== am ? `${en} · ${am}` : en || am).slice(0, 64);
}
async function withLang(x: TelegramTexts, customerId: string): Promise<TelegramTexts> {
  const l = (await customerMeta(customerId)).lang;
  return l === "en" || l === "am" ? { ...x, lang: l } : x;
}
const backRow = async (x: TelegramTexts) => [{ text: await btn(x, "button.menu"), callback_data: "m" }];

// The main menu (Customer support, Content): its entries in order, one a row; then resources, forms, feedback and
// call-back; the phone and language buttons; the support app.
async function sendMenu(chat: string, x: TelegramTexts) {
  const c = await import("./support-content");
  const { helpCategories } = await import("./support-help");
  const cats = new Set((await helpCategories({ activeOnly: true })).map((k) => k.key));
  const rows: { text: string; callback_data?: string; web_app?: { url: string }; url?: string }[][] = [];
  for (const e of await c.contentEntries("menu", x.lang, currentBot())) {
    const a = e.action;
    if (a.startsWith("url:")) rows.push([{ text: e.label, url: a.slice(4) }]);
    // A category entry is the category's own button: its help articles first, then the question.
    else if (a.startsWith("category:")) rows.push([{ text: e.label, callback_data: cats.has(a.slice(9)) ? `c:${a.slice(9)}` : "mn:start" }]);
    else rows.push([{ text: e.label, callback_data: a === "language" ? "lang" : `mn:${a}` }]);
  }
  rows.push(...(await (await import("./bot-manager")).menuRows(currentBot(), x)));
  rows.push([{ text: PHONE_BUTTON(x), callback_data: "ph" }, { text: await btn(x, "button.language"), callback_data: "lang" }]);
  const origin = await botOrigin();
  const appUrl = supportAppUrl(origin, currentBot());
  if (appUrl && x.miniApp) {
    rows.push([{ text: await btn(x, "button.open_app"), web_app: { url: appUrl } }]);
    // Telegram bots cannot call; the support app can, in the browser inside Telegram.
    const { channelOn } = await import("./connected-systems");
    if (await channelOn(currentBot() === "default" ? null : currentBot(), "calls")) rows.push([{ text: x.lang === "am" ? "ወደ ድጋፍ ይደውሉ" : "Call support", web_app: { url: supportAppUrl(origin, currentBot(), "&call=1")! } }]);
  }
  await telegramSend(chat, (await sayKey(x, "welcome")) || say(x, x.welcome, x.welcomeAm), { reply_markup: { inline_keyboard: rows } });
}

const STATUS_WORDS: Record<string, [string, string]> = {
  new: ["Received", "ደርሷል"],
  open: ["In progress", "በሂደት ላይ"],
  pending: ["Waiting for your answer", "መልስዎን እየጠበቅን ነው"],
  on_hold: ["On hold", "ተይዟል"],
  solved: ["Solved", "ተፈቷል"],
  closed: ["Closed", "ተዘግቷል"],
};
const statusWord = (x: TelegramTexts, s: string) => {
  const [en, am] = STATUS_WORDS[s] ?? [s, s];
  return x.lang === "am" ? am : x.lang === "en" ? en : `${en} · ${am}`;
};
const REOPEN_DAYS = 7;
const openTicketOf = (customerId: string) =>
  get<{ id: string; number: number; queue_id: string | null; status: string }>("SELECT id, number, queue_id, status FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed') ORDER BY updated_at DESC LIMIT 1", customerId);
const reopenableOf = (customerId: string) =>
  get<{ id: string; number: number }>("SELECT id, number FROM sup_tickets WHERE customer_id = ? AND status IN ('solved','closed') AND updated_at >= ? ORDER BY updated_at DESC LIMIT 1", customerId, new Date(Date.now() - REOPEN_DAYS * 86400e3).toISOString());

// The customer's requests: open ones (with change topic and close), or earlier ones (with reopen when allowed).
async function sendRequests(chat: string, x: TelegramTexts, customerId: string, earlier: boolean) {
  const list = await all<{ number: number; subject: string; status: string; updated_at: string }>(
    `SELECT number, subject, status, updated_at FROM sup_tickets WHERE customer_id = ? AND status ${earlier ? "IN" : "NOT IN"} ('solved','closed') ORDER BY updated_at DESC LIMIT 10`,
    customerId,
  );
  if (!list.length) return telegramSend(chat, await sayKey(x, earlier ? "history.none" : "requests.none"), { reply_markup: { inline_keyboard: [await backRow(x)] } });
  const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Africa/Addis_Ababa" });
  const lines = list.map((t) => `#${t.number} · ${t.subject.slice(0, 60)}\n   ${statusWord(x, t.status)} · ${day(t.updated_at)}`);
  const rows: { text: string; callback_data: string }[][] = [];
  if (!earlier) rows.push([{ text: await btn(x, "button.transfer"), callback_data: "tr" }, { text: await btn(x, "button.close"), callback_data: "cl" }]);
  else if (await reopenableOf(customerId)) rows.push([{ text: await btn(x, "button.reopen"), callback_data: "ro" }]);
  rows.push(await backRow(x));
  await telegramSend(chat, `${await sayKey(x, earlier ? "history.title" : "requests.title")}\n\n${lines.join("\n")}`, { reply_markup: { inline_keyboard: rows } });
}

async function sendTopics(chat: string, x: TelegramTexts, prefix: "tp" | "tt", intro: string) {
  const topics = await (await import("./support-content")).contentEntries("category", x.lang, currentBot());
  const rows = topics.map((t) => [{ text: t.label, callback_data: `${prefix}:${t.key}`.slice(0, 64) }]);
  rows.push(await backRow(x));
  await telegramSend(chat, await sayKey(x, intro), { reply_markup: { inline_keyboard: rows } });
}

async function closeConversation(chat: string, x: TelegramTexts, customerId: string) {
  const t = await openTicketOf(customerId);
  if (!t) return telegramSend(chat, await sayKey(x, "close.none"));
  const now = nowIso();
  await run("UPDATE sup_tickets SET status = 'closed', close_reason = 'customer', solved_at = COALESCE(solved_at, ?), updated_at = ? WHERE id = ?", now, now, t.id);
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, "The customer closed the conversation in Telegram.", now);
  await (await import("./support-desk")).activity(null, t.id, "closed", "Closed by the customer");
  await telegramSend(chat, await sayKey(x, "close.done", { number: t.number }), { reply_markup: { inline_keyboard: [await backRow(x)] } });
}
async function reopenConversation(chat: string, x: TelegramTexts, customerId: string) {
  if (await openTicketOf(customerId)) return sendRequests(chat, x, customerId, false);
  const t = await reopenableOf(customerId);
  if (!t) return telegramSend(chat, await sayKey(x, "reopen.none"), { reply_markup: { inline_keyboard: [await backRow(x)] } });
  const now = nowIso();
  await run("UPDATE sup_tickets SET status = 'open', solved_at = NULL, close_reason = NULL, updated_at = ? WHERE id = ?", now, t.id);
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, "The customer reopened the conversation in Telegram.", now);
  const sd = await import("./support-desk");
  await sd.activity(null, t.id, "reopened", "Reopened by the customer");
  await sd.autoAssign(t.id).catch(() => null);
  await telegramSend(chat, await sayKey(x, "reopen.done", { number: t.number }));
}
async function transferConversation(chat: string, x: TelegramTexts, customerId: string, topicKey: string) {
  const t = await openTicketOf(customerId);
  if (!t) return telegramSend(chat, await sayKey(x, "transfer.none"), { reply_markup: { inline_keyboard: [await backRow(x)] } });
  const topic = (await (await import("./support-content")).contentEntries("category", x.lang, currentBot())).find((e) => e.key === topicKey);
  if (!topic) return sendTopics(chat, x, "tt", "transfer.choose");
  const cat = topic.action.startsWith("category:") ? await (await import("./support-help")).helpCategory(topic.action.slice(9)) : null;
  const now = nowIso();
  const sd = await import("./support-desk");
  const moves = !!cat?.queueId && cat.queueId !== t.queue_id;
  if (moves) await run("UPDATE sup_tickets SET queue_id = ?, assignee_id = NULL, updated_at = ? WHERE id = ?", cat!.queueId, now, t.id);
  else await run("UPDATE sup_tickets SET updated_at = ? WHERE id = ?", now, t.id);
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, `The customer moved this conversation to "${topic.label}".`, now);
  await sd.activity(null, t.id, "transferred", `Moved by the customer to ${topic.label}`);
  if (moves) await sd.autoAssign(t.id).catch(() => null);
  await telegramSend(chat, await sayKey(x, "transfer.done", { number: t.number, topic: topic.label }));
}

// After a new request: who is there, the customer's place in line and, when enough answers were timed, the usual wait.
async function sendQueueInfo(chat: string, x: TelegramTexts, ticketId: string) {
  const sd = await import("./support-desk");
  const t = await get<{ queue_id: string | null; assignee_id: string | null; created_at: string }>("SELECT queue_id, assignee_id, created_at FROM sup_tickets WHERE id = ?", ticketId);
  if (!t) return;
  if (t.assignee_id) return telegramSend(chat, await sayKey(x, "agent.available"));
  if (!(await sd.availableAgents(t.queue_id, undefined, { ignoreLimit: true })).length) {
    const off = await sayKey(x, "offline");
    if (off) await telegramSend(chat, off);
    return;
  }
  const ahead = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_tickets WHERE assignee_id IS NULL AND status IN ('new','open') AND COALESCE(queue_id, '') = COALESCE(?, '') AND created_at < ?", t.queue_id, t.created_at))?.n ?? 0);
  const timed = await all<{ created_at: string; first_response_at: string }>(
    "SELECT created_at, first_response_at FROM sup_tickets WHERE COALESCE(queue_id, '') = COALESCE(?, '') AND first_response_at IS NOT NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 200",
    t.queue_id,
    new Date(Date.now() - 14 * 86400e3).toISOString(),
  );
  const waits = timed.map((r) => (Date.parse(r.first_response_at) - Date.parse(r.created_at)) / 60e3).filter((m) => m >= 0 && m < 24 * 60).sort((a, b) => a - b);
  // Only with ten timed answers or more: a median of fewer would mislead.
  const wait = waits.length >= 10 ? Math.max(1, Math.round(waits[Math.floor(waits.length / 2)])) : null;
  const parts = [await sayKey(x, "queue.position", { position: ahead + 1 }), wait ? await sayKey(x, "queue.wait", { minutes: wait }) : ""].filter(Boolean);
  if (parts.length) await telegramSend(chat, parts.join("\n"));
}

// FAQ search: the customer's words against the published help articles.
async function answerFaq(chat: string, x: TelegramTexts, q: string) {
  const arts = await searchArticles(q, 5);
  if (!arts.length) return telegramSend(chat, await sayKey(x, "faq.none"), { reply_markup: { inline_keyboard: [[{ text: await btn(x, "menu.contact"), callback_data: "mn:contact" }], await backRow(x)] } });
  const origin = (await telegramState()).origin;
  const https = !!helpUrl(origin);
  const rows: { text: string; url?: string; callback_data?: string }[][] = arts.map((a) => (https ? [{ text: a.title.slice(0, 60), url: `${origin}/help/${a.id}` }] : [{ text: a.title.slice(0, 60), callback_data: `g:${a.id}` }]));
  rows.push([{ text: await btn(x, "menu.contact"), callback_data: "mn:contact" }], await backRow(x));
  await telegramSend(chat, await sayKey(x, "faq.results"), { reply_markup: { inline_keyboard: rows } });
}

// Whether the bot of a customer's system (or the default bot) is connected, so a message reaches them.
export async function telegramReachable(appId: string | null) {
  const sys = await systemBot(appId);
  return sys ? true : !!(await botToken());
}

// A call to a Telegram customer: the bot says so, with a button that opens the support app to answer.
export async function notifyTelegramCall(customerId: string | null, kind: "incoming" | "missed" | "ended", agentName?: string | null): Promise<{ chat: string; mid: number; bot: string } | null> {
  if (!customerId) return null;
  const c = await get<{ external_id: string | null; app_id: string | null }>("SELECT external_id, app_id FROM sup_customers WHERE id = ?", customerId);
  if (!c?.external_id?.startsWith("tg:")) return null;
  const chat = c.external_id.slice(3);
  const go = async () => {
    if (!(await botToken())) return null;
    const x = await withLang(await telegramTexts(), customerId);
    const text = await sayKey(x, `call.${kind}`, { agent: (agentName ?? "").split(" ")[0] || (x.lang === "am" ? "ወኪል" : "An agent") });
    if (!text) return null;
    // call=in: the support app opens straight on the ringing call (call=1 is the customer calling us).
    const url = kind === "incoming" ? supportAppUrl(await botOrigin(), currentBot(), "&call=in") : null;
    const r = (await api("sendMessage", { chat_id: chat, text: text.slice(0, 4000), ...(url ? { reply_markup: { inline_keyboard: [[{ text: await btn(x, "button.open_app"), web_app: { url } }]] } } : {}) })) as { ok?: boolean; result?: { message_id?: number } };
    return r?.result?.message_id ? { chat, mid: r.result.message_id, bot: currentBot() } : null;
  };
  const sys = await systemBot(c.app_id);
  return sys ? botCtx.run(sys, go) : go();
}

// The call notice once the call is decided: its Answer button goes, and the text says what happened.
export async function closeTelegramCallNotice(callId: string, outcome: "answered" | "declined" | "cancelled" | "missed") {
  const k = await get<{ tg_notice: string | null; customer_id: string | null }>("SELECT tg_notice, customer_id FROM sup_calls WHERE id = ?", callId);
  const n = k?.tg_notice ? (JSON.parse(k.tg_notice) as { chat: string; mid: number; bot: string }) : null;
  if (!n) return;
  await run("UPDATE sup_calls SET tg_notice = NULL WHERE id = ?", callId);
  const go = async () => {
    const x = await withLang(await telegramTexts(), k!.customer_id ?? "");
    const am = x.lang === "am";
    const text = {
      answered: am ? "ጥሪውን መልሰዋል።" : "You answered the call.",
      declined: am ? "ጥሪውን አልተቀበሉም።" : "You declined the call.",
      cancelled: am ? "ጥሪው ከመመለስዎ በፊት ተቋርጧል።" : "The call ended before you answered.",
      missed: am ? "ያመለጠ ጥሪ።" : "Missed call.",
    }[outcome];
    await api("editMessageText", { chat_id: n.chat, message_id: n.mid, text, reply_markup: { inline_keyboard: [] } });
  };
  const sys = n.bot && n.bot !== "default" ? await systemBot(n.bot) : null;
  await (sys ? botCtx.run(sys, go) : go());
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
    voice?: { file_id: string; mime_type?: string; file_size?: number; duration?: number };
    audio?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    video?: { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
    video_note?: { file_id: string; file_size?: number };
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
  let data = String(q.data ?? "");
  const h = await import("./support-help");
  const me = await customerFor({ channel: "telegram", key: chat, name: nameOf(q.from) });
  x = await withLang(x, me);
  if (data === "m") return sendMenu(chat, x);
  if (data === "ph") return askPhone(chat, x);
  // Language: chosen once, kept on the customer.
  if (data === "lang") return telegramSend(chat, await sayKey({ ...x, lang: "both" }, "language.choose"), { reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "l:en" }, { text: "አማርኛ", callback_data: "l:am" }]] } });
  if (data === "l:en" || data === "l:am") {
    const lang = data.slice(2) as "en" | "am";
    await setCustomerMeta(me, { lang });
    const y = { ...x, lang };
    await telegramSend(chat, await sayKey(y, "language.saved"));
    return sendMenu(chat, y);
  }
  // The main menu's own entries (Customer support, Content).
  if (data.startsWith("mn:")) {
    const a = data.slice(3);
    if (a === "start") return sendTopics(chat, x, "tp", "topics.choose");
    if (a === "requests") return sendRequests(chat, x, me, false);
    if (a === "history") return sendRequests(chat, x, me, true);
    if (a === "faq") {
      await setCustomerMeta(me, { tgAwait: "faq", tgAwaitAt: nowIso() });
      return telegramSend(chat, await sayKey(x, "faq.prompt"), { reply_markup: { inline_keyboard: [await backRow(x)] } });
    }
    if (a === "contact") {
      if ((await h.helpCategory("person"))?.active) data = "a:person";
      else return telegramSend(chat, await sayKey(x, "ask"));
    } else return sendMenu(chat, x);
  }
  // A conversation topic: straight to the question, in the topic's category.
  if (data.startsWith("tp:")) {
    const topic = (await (await import("./support-content")).contentEntries("category", "en", currentBot())).find((e) => e.key === data.slice(3));
    if (!topic) return sendTopics(chat, x, "tp", "topics.choose");
    await setCustomerMeta(me, { tgTopic: topic.label, tgTopicAt: nowIso() });
    if (!topic.action.startsWith("category:") || !(await h.helpCategory(topic.action.slice(9)))?.active) {
      await setCustomerMeta(me, { tgCategory: null, tgCategoryAt: null });
      return telegramSend(chat, `${topic.label}\n${await sayKey(x, "ask")}`);
    }
    data = `a:${topic.action.slice(9)}`;
  }
  if (data === "tr") return sendTopics(chat, x, "tt", "transfer.choose");
  if (data.startsWith("tt:")) return transferConversation(chat, x, me, data.slice(3));
  if (data === "cl") return closeConversation(chat, x, me);
  if (data === "ro") return reopenConversation(chat, x, me);
  if (data.startsWith("g:")) {
    const msgs = await (await import("./kb-guides")).guideMessages(data.slice(2)).catch(() => null);
    if (!msgs) return telegramSend(chat, x.lang === "am" ? "ይህ መረጃ ከእንግዲህ የለም።" : "This is no longer available.");
    for (const m of msgs) await telegramSend(chat, m);
    return;
  }
  if (/^(r|s|f|cb)$|^(r|s|q|x):/.test(data)) {
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
      // Guides and video answers can also be read here in the chat.
      for (const a of arts.filter((x) => x.kind === "guide" || x.video)) rows.push([{ text: `${x.lang === "am" ? "እዚህ ያንብቡ" : "Read here"}: ${a.title}`.slice(0, 60), callback_data: `g:${a.id}` }]);
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
  let x = await telegramTexts();
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
  x = await withLang(x, customerId);
  if (/^\/(start|menu|help)\b/.test(text)) {
    await (await import("./bot-manager")).message(currentBot(), chat, customerId, "", x);
    // Until we have their number, the share button sits under the message box (before the menu, which stays last).
    if (/^\/start\b/.test(text) && !(await get<{ phone: string | null }>("SELECT phone FROM sup_customers WHERE id = ?", customerId))?.phone) await askPhone(chat, x);
    await sendMenu(chat, x);
    return { ok: true };
  }
  if (/^\/phone\b/.test(text)) {
    await askPhone(chat, x);
    return { ok: true };
  }
  // The commands of the content store's command list.
  const cmd = text.match(/^\/(requests|history|language|transfer|close|reopen)\b/)?.[1];
  if (cmd) {
    if (cmd === "requests" || cmd === "history") await sendRequests(chat, x, customerId, cmd === "history");
    else if (cmd === "language") await telegramSend(chat, await sayKey({ ...x, lang: "both" }, "language.choose"), { reply_markup: { inline_keyboard: [[{ text: "English", callback_data: "l:en" }, { text: "አማርኛ", callback_data: "l:am" }]] } });
    else if (cmd === "transfer") await sendTopics(chat, x, "tt", "transfer.choose");
    else if (cmd === "close") await closeConversation(chat, x, customerId);
    else await reopenConversation(chat, x, customerId);
    return { ok: true };
  }
  // The answer to "Frequently Asked Questions": searched in the help articles (asked within ten minutes).
  const waiting = await customerMeta(customerId);
  if (waiting.tgAwait === "faq" && text && !text.startsWith("/") && !m.contact) {
    await setCustomerMeta(customerId, { tgAwait: null, tgAwaitAt: null });
    if (Date.now() - Date.parse(waiting.tgAwaitAt ?? "") < 10 * 60e3) {
      await answerFaq(chat, x, text);
      return { ok: true };
    }
  }
  // Their own number, shared with the button: kept on the customer so agents can find their records by phone.
  if (m.contact) {
    if (!m.contact.user_id || m.contact.user_id === m.from?.id) {
      // Kept, and matched to the student, payment and invoice records for the agent (the customer sees none of it).
      await (await import("./customer-records")).recordPhone(customerId, clean(m.contact.phone_number, 40), "telegram");
      await telegramSend(chat, x.lang === "am" ? "እናመሰግናለን፣ ስልክ ቁጥርዎ ተቀምጧል።" : "Thank you, your number is saved.", { reply_markup: { remove_keyboard: true } });
      // A call-back asked for before the number was shared.
      await (await import("./bot-manager")).afterContact(currentBot(), chat, customerId, x);
    }
    return { ok: true };
  }
  // Answers to a form, feedback, and the content and form commands.
  if (await (await import("./bot-manager")).message(currentBot(), chat, customerId, text, x)) return { ok: true };
  // Photos, files, voice notes, music, videos and round video notes are all kept on the conversation.
  const file = m.document
    ? { id: m.document.file_id, name: m.document.file_name ?? "file", mime: m.document.mime_type ?? "application/octet-stream", size: m.document.file_size ?? 0 }
    : m.photo?.length
      ? { id: m.photo.at(-1)!.file_id, name: `photo-${m.message_id}.jpg`, mime: "image/jpeg", size: m.photo.at(-1)!.file_size ?? 0 }
      : m.voice
        ? { id: m.voice.file_id, name: `voice-${m.message_id}.ogg`, mime: m.voice.mime_type ?? "audio/ogg", size: m.voice.file_size ?? 0 }
        : m.audio
          ? { id: m.audio.file_id, name: m.audio.file_name ?? `audio-${m.message_id}.mp3`, mime: m.audio.mime_type ?? "audio/mpeg", size: m.audio.file_size ?? 0 }
          : m.video
            ? { id: m.video.file_id, name: m.video.file_name ?? `video-${m.message_id}.mp4`, mime: m.video.mime_type ?? "video/mp4", size: m.video.file_size ?? 0 }
            : m.video_note
              ? { id: m.video_note.file_id, name: `video-note-${m.message_id}.mp4`, mime: "video/mp4", size: m.video_note.file_size ?? 0 }
              : null;
  // The open conversation continues; otherwise a new ticket, in the category chosen from the menu (for a day).
  const open = await get<{ id: string }>("SELECT id FROM sup_tickets WHERE customer_id = ? AND channel = 'telegram' AND status NOT IN ('closed') ORDER BY updated_at DESC LIMIT 1", customerId);
  const meta = await customerMeta(customerId);
  const category = !open && meta.tgCategory && Date.now() - Date.parse(meta.tgCategoryAt ?? "") < 86400e3 ? meta.tgCategory : null;
  const h = category ? await import("./support-help") : null;
  const cat = h ? await h.helpCategory(category) : null;
  const body = text || (file ? (m.photo ? "(a photo)" : m.voice ? "(a voice note)" : m.video_note ? "(a video note)" : `(a file: ${file.name})`) : "(an empty message)");
  const topic = !open && meta.tgTopic && Date.now() - Date.parse(meta.tgTopicAt ?? "") < 86400e3 ? meta.tgTopic : null;
  const id = await incoming({ channel: "telegram", customerId, ticketId: open?.id ?? null, subject: `${topic ? `${topic}: ` : cat ? `${cat.labelEn}: ` : ""}${text.slice(0, 70) || (file ? file.name : "Telegram message")}`, body, category });
  if (category || topic) await setCustomerMeta(customerId, { tgCategory: null, tgCategoryAt: null, tgTopic: null, tgTopicAt: null });
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
    await sendQueueInfo(chat, x, id).catch((e) => console.error("Queue message failed", e));
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
  if (input.id && (await get<{ kind: string }>("SELECT kind FROM sup_articles WHERE id = ?", input.id))?.kind === "guide") return (await import("./kb-guides")).saveKbArticle(user, { ...input, kind: "guide" });
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

// A published article or guide with its steps and videos (src/server/kb-guides.ts).
export async function readArticle(id: string) {
  return (await import("./kb-guides")).publicArticle(id);
}

export async function voteArticle(id: string, helpful: boolean) {
  await run(`UPDATE sup_articles SET ${helpful ? "helpful = helpful + 1" : "not_helpful = not_helpful + 1"} WHERE id = ? AND published = 1`, id);
}
