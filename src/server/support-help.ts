// Customer help, one menu everywhere (Update 1.0, phase 4).
//
// - Categories: Quick help, FAQ, How to, Plans, Payments, Account, App help and Talk to a person, in English and
//   Amharic. The same list feeds the Telegram bot, the help page on the web (also opened as a Telegram Mini App) and
//   the reports. Each shows its help articles first; "Still need help?" opens a request in the category's queue.
// - Routing rules: category, optional words and channel pick the queue (and priority). Payments go to the Payment
//   follow-up queue, where Finance staff can be agents; agents see only their queues' tickets.
// - Moving a ticket to another queue keeps one thread for the customer, with a note for the next team.
// - The help page: customers read articles, open a request and follow it with a private link (no account); inside
//   Telegram they are known by Telegram's signed initData, so the chat and the page are the same conversation.
// - Files customers send (Telegram photos and documents) are kept on the ticket.

import { supportIconKey } from "@/lib/support-icon-keys";
import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import * as sd from "./support-desk";
import { PRIORITIES, type Priority } from "@/lib/support";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type HelpCategory = {
  key: string;
  labelEn: string;
  labelAm: string;
  hintEn: string;
  hintAm: string;
  icon: string;
  kbCategory: string | null;
  queueId: string | null;
  // Show help articles before asking; off for "Talk to a person".
  selfHelp: boolean;
  sort: number;
  active: boolean;
};

const DEFAULTS: Omit<HelpCategory, "queueId" | "sort" | "active">[] = [
  { key: "quick", labelEn: "Quick help", labelAm: "ፈጣን እርዳታ", hintEn: "The answers people need most", hintAm: "በብዛት የሚፈለጉ መልሶች", icon: "zap", kbCategory: null, selfHelp: true },
  { key: "faq", labelEn: "FAQ", labelAm: "ተደጋግመው የሚጠየቁ", hintEn: "Common questions", hintAm: "የተለመዱ ጥያቄዎች", icon: "help", kbCategory: "FAQ", selfHelp: true },
  { key: "howto", labelEn: "How to", labelAm: "እንዴት እንደሚሰራ", hintEn: "Step by step guides", hintAm: "ደረጃ በደረጃ መመሪያዎች", icon: "book", kbCategory: "How to", selfHelp: true },
  { key: "plans", labelEn: "Plans", labelAm: "ዕቅዶች", hintEn: "Subscriptions and prices", hintAm: "የደንበኝነት ዕቅዶች እና ዋጋዎች", icon: "package", kbCategory: "Plans", selfHelp: true },
  { key: "payments", labelEn: "Payments", labelAm: "ክፍያዎች", hintEn: "Paying, failed or pending payments", hintAm: "ክፍያ፣ ያልተሳኩ ወይም በመጠባበቅ ላይ ያሉ ክፍያዎች", icon: "card", kbCategory: "Payments", selfHelp: true },
  { key: "account", labelEn: "Account", labelAm: "መለያ", hintEn: "Signing in, profile, password", hintAm: "መግባት፣ መገለጫ፣ የይለፍ ቃል", icon: "user", kbCategory: "Account", selfHelp: true },
  { key: "app", labelEn: "App help", labelAm: "የመተግበሪያ እርዳታ", hintEn: "Videos, lessons, the app not working", hintAm: "ቪዲዮዎች፣ ትምህርቶች፣ መተግበሪያው ካልሰራ", icon: "phone", kbCategory: "App help", selfHelp: true },
  { key: "person", labelEn: "Talk to a person", labelAm: "ሰው ያናግሩ", hintEn: "Write to our team", hintAm: "ለቡድናችን ይጻፉ", icon: "person", kbCategory: null, selfHelp: false },
];

type CatRow = { key: string; label_en: string; label_am: string; hint_en: string | null; hint_am: string | null; icon: string | null; kb_category: string | null; queue_id: string | null; self_help: number; sort: number; active: number };
const catOf = (r: CatRow): HelpCategory => ({
  key: r.key,
  labelEn: r.label_en,
  labelAm: r.label_am,
  hintEn: r.hint_en ?? "",
  hintAm: r.hint_am ?? "",
  icon: supportIconKey(r.icon),
  kbCategory: r.kb_category,
  queueId: r.queue_id,
  selfHelp: !!Number(r.self_help),
  sort: Number(r.sort),
  active: !!Number(r.active),
});

// The menu, made with its defaults on first use (Payments to the Payment follow-up queue).
export async function helpCategories(opts: { activeOnly?: boolean } = {}): Promise<HelpCategory[]> {
  let rows = await all<CatRow>("SELECT * FROM sup_categories ORDER BY sort, key");
  if (!rows.length) {
    const pay = await sd.paymentFollowupQueue();
    const now = nowIso();
    for (const [i, c] of DEFAULTS.entries())
      await run(
        "INSERT INTO sup_categories (key, label_en, label_am, hint_en, hint_am, icon, kb_category, queue_id, self_help, sort, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT (key) DO NOTHING",
        c.key,
        c.labelEn,
        c.labelAm,
        c.hintEn,
        c.hintAm,
        c.icon,
        c.kbCategory,
        c.key === "payments" ? pay : null,
        c.selfHelp ? 1 : 0,
        i + 1,
        now,
      );
    rows = await all<CatRow>("SELECT * FROM sup_categories ORDER BY sort, key");
  }
  const list = rows.map(catOf);
  return opts.activeOnly ? list.filter((c) => c.active) : list;
}

export async function helpCategory(key: string | null | undefined) {
  if (!key) return null;
  return (await helpCategories()).find((c) => c.key === key) ?? null;
}

export async function saveCategories(user: AppUser, input: (Partial<HelpCategory> & { key: string })[]) {
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin change the help menu.");
  const cur = await helpCategories();
  const queues = new Set((await sd.listQueues()).map((q) => q.id));
  const now = nowIso();
  await tx(async () => {
    for (const [i, c] of input.entries()) {
      const key = clean(c.key, 30).toLowerCase().replace(/[^a-z0-9_]/g, "_");
      if (!key) continue;
      const was = cur.find((x) => x.key === key);
      const labelEn = clean(c.labelEn ?? was?.labelEn, 60);
      if (!labelEn) throw new WorkflowError("VALIDATION", "Every menu item needs an English label.");
      const queueId = c.queueId === undefined ? (was?.queueId ?? null) : c.queueId && queues.has(c.queueId) ? c.queueId : null;
      await run(
        `INSERT INTO sup_categories (key, label_en, label_am, hint_en, hint_am, icon, kb_category, queue_id, self_help, sort, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (key) DO UPDATE SET label_en = excluded.label_en, label_am = excluded.label_am, hint_en = excluded.hint_en, hint_am = excluded.hint_am, icon = excluded.icon, kb_category = excluded.kb_category,
           queue_id = excluded.queue_id, self_help = excluded.self_help, sort = excluded.sort, active = excluded.active, updated_at = excluded.updated_at`,
        key,
        labelEn,
        clean(c.labelAm ?? was?.labelAm, 60) || labelEn,
        clean(c.hintEn ?? was?.hintEn, 120),
        clean(c.hintAm ?? was?.hintAm, 120),
        supportIconKey(c.icon ?? was?.icon),
        clean(c.kbCategory === undefined ? was?.kbCategory : c.kbCategory, 60) || null,
        queueId,
        (c.selfHelp ?? was?.selfHelp ?? true) ? 1 : 0,
        i + 1,
        (c.active ?? was?.active ?? true) ? 1 : 0,
        now,
      );
    }
  });
  await audit({ actor: user }, { action: "support.categories", summary: `${user.name} changed the customer help menu (${input.length} items)` });
  return helpCategories();
}

// The published articles of a category (Quick help: the most read of all).
export async function categoryArticles(key: string, limit = 6) {
  const c = await helpCategory(key);
  if (!c) return [];
  const rows = c.kbCategory
    ? await all<{ id: string; title: string; body: string; kind: string; video: string | null }>("SELECT id, title, body, kind, video FROM sup_articles WHERE published = 1 AND LOWER(COALESCE(category, '')) = LOWER(?) ORDER BY helpful DESC, views DESC, title LIMIT ?", c.kbCategory, limit)
    : c.selfHelp
      ? await all<{ id: string; title: string; body: string; kind: string; video: string | null }>("SELECT id, title, body, kind, video FROM sup_articles WHERE published = 1 ORDER BY views DESC, helpful DESC, title LIMIT ?", limit)
      : [];
  return rows.map((r) => ({ id: r.id, title: r.title, snippet: r.body.slice(0, 160), kind: r.kind === "guide" ? "guide" : "article", video: !!r.video }));
}

// ---------------------------------------------------------------------------
// Routing rules
// ---------------------------------------------------------------------------

export const ROUTE_CHANNELS = ["any", "telegram", "web", "widget", "email"] as const;
export type HelpRoute = { id: string; category: string | null; keywords: string[]; channel: (typeof ROUTE_CHANNELS)[number]; queueId: string; priority: Priority | null; sort: number; active: boolean };

export async function listRoutes(): Promise<HelpRoute[]> {
  return (await all<{ id: string; category: string | null; keywords: string; channel: string; queue_id: string; priority: string | null; sort: number; active: number }>("SELECT * FROM sup_routes ORDER BY sort, created_at")).map((r) => ({
    id: r.id,
    category: r.category,
    keywords: parseJson<string[]>(r.keywords, []),
    channel: (ROUTE_CHANNELS as readonly string[]).includes(r.channel) ? (r.channel as HelpRoute["channel"]) : "any",
    queueId: r.queue_id,
    priority: PRIORITIES.includes(r.priority as Priority) ? (r.priority as Priority) : null,
    sort: Number(r.sort),
    active: !!Number(r.active),
  }));
}

// Rules are checked in order; the first that fits wins. The whole list is saved at once.
export async function saveRoutes(user: AppUser, input: (Partial<HelpRoute> & { queueId: string })[]) {
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin change the routing rules.");
  const queues = new Set((await sd.listQueues()).map((q) => q.id));
  const cats = new Set((await helpCategories()).map((c) => c.key));
  const list = input.slice(0, 100);
  for (const r of list) {
    if (!queues.has(r.queueId)) throw new WorkflowError("VALIDATION", "Every rule needs a queue.");
    if (r.category && !cats.has(r.category)) throw new WorkflowError("VALIDATION", `"${r.category}" is not in the help menu.`);
  }
  const now = nowIso();
  await tx(async () => {
    await run("DELETE FROM sup_routes");
    for (const [i, r] of list.entries())
      await run(
        "INSERT INTO sup_routes (id, category, keywords, channel, queue_id, priority, sort, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        uid("sr_"),
        r.category || null,
        JSON.stringify([...new Set((r.keywords ?? []).map((k) => clean(k, 40).toLowerCase()).filter(Boolean))].slice(0, 30)),
        (ROUTE_CHANNELS as readonly string[]).includes(r.channel ?? "") ? r.channel : "any",
        r.queueId,
        r.priority && PRIORITIES.includes(r.priority) ? r.priority : null,
        i + 1,
        r.active === false ? 0 : 1,
        now,
      );
  });
  await audit({ actor: user }, { action: "support.routes", summary: `${user.name} saved ${list.length} support routing rules` });
  return listRoutes();
}

// Where a new request goes: the first rule that fits, else the category's queue, else (null) the desk's keyword routing.
export async function routeFor(input: { category?: string | null; text: string; channel: string }) {
  const text = input.text.toLowerCase();
  const queues = new Set((await sd.listQueues()).filter((q) => q.active).map((q) => q.id));
  for (const r of await listRoutes()) {
    if (!r.active || !queues.has(r.queueId)) continue;
    if (r.category && r.category !== input.category) continue;
    if (r.channel !== "any" && r.channel !== input.channel) continue;
    if (r.keywords.length && !r.keywords.some((k) => text.includes(k))) continue;
    return { queueId: r.queueId, priority: r.priority, by: "rule" as const };
  }
  const c = await helpCategory(input.category);
  if (c?.queueId && queues.has(c.queueId)) return { queueId: c.queueId, priority: null, by: "category" as const };
  return null;
}

// ---------------------------------------------------------------------------
// Moving a ticket to another queue (Support to Finance and back): one thread for the customer
// ---------------------------------------------------------------------------

export async function transferTicket(user: AppUser, ticketId: string, queueId: string, note: string) {
  const q = (await sd.listQueues()).find((x) => x.id === queueId && x.active);
  if (!q) throw new WorkflowError("NOT_FOUND", "Choose a queue.");
  const d = await sd.ticketDetail(user, ticketId);
  const t = d.ticket as { id: string; number: number; queue_id: string | null; queue: string | null };
  if (t.queue_id === queueId) throw new WorkflowError("VALIDATION", `It is already in ${q.name}.`);
  const why = clean(note, 1000);
  if (!why) throw new WorkflowError("VALIDATION", "Write a short note for the next team.");
  const now = nowIso();
  await run("UPDATE sup_tickets SET queue_id = ?, assignee_id = NULL, assigned_at = NULL, status = CASE WHEN status IN ('solved','closed') THEN 'open' ELSE status END, updated_at = ? WHERE id = ?", queueId, now, t.id);
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'agent', ?, ?, 1, ?)", uid("smg_"), t.id, user.id, `Moved from ${t.queue ?? "no queue"} to ${q.name}: ${why}`, now);
  await sd.activity(user.id, t.id, "transferred", `${t.queue ?? "No queue"} to ${q.name}`);
  if (!(await sd.autoAssign(t.id)) && q.members.length)
    await (await import("./notifications")).notify(q.members, { type: "assignment", title: `Ticket #${t.number} moved to ${q.name}`, body: why.slice(0, 200), link: `/support?ticket=${t.id}`, dedupeKey: `sup-move-${t.id}-${now}` }, now, user.id);
  return { queue: q.name };
}

// ---------------------------------------------------------------------------
// Files on tickets (Telegram photos and documents)
// ---------------------------------------------------------------------------

export const TICKET_FILE_MAX = 10 * 1024 * 1024;

export async function attachTicketFile(ticketId: string, file: { name: string; mime: string; data: Buffer }, messageId?: string | null) {
  if (file.data.length > TICKET_FILE_MAX) throw new WorkflowError("VALIDATION", "The file is larger than 10 MB.");
  const msg = messageId ? { id: messageId } : await get<{ id: string }>("SELECT id FROM sup_messages WHERE ticket_id = ? AND author_kind = 'customer' ORDER BY created_at DESC LIMIT 1", ticketId);
  const id = uid("sfl_");
  await run("INSERT INTO sup_files (id, ticket_id, message_id, name, mime, size, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, ticketId, msg?.id ?? null, clean(file.name, 160).replace(/[\\/]/g, "_") || "file", clean(file.mime, 100) || "application/octet-stream", file.data.length, file.data.toString("base64"), nowIso());
  return id;
}

export async function ticketFiles(ticketIds: string[]) {
  if (!ticketIds.length) return [];
  return all<{ id: string; ticket_id: string; message_id: string | null; name: string; mime: string; size: number; created_at: string }>(
    `SELECT id, ticket_id, message_id, name, mime, size, created_at FROM sup_files WHERE ticket_id IN (${ticketIds.map(() => "?").join(",")}) ORDER BY created_at`,
    ...ticketIds,
  );
}

// For agents who can work the ticket.
export async function readTicketFile(user: AppUser, fileId: string) {
  const f = await get<{ ticket_id: string; name: string; mime: string; data: string }>("SELECT ticket_id, name, mime, data FROM sup_files WHERE id = ?", fileId);
  if (!f) return null;
  await sd.ticketDetail(user, f.ticket_id);
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") };
}

// ---------------------------------------------------------------------------
// The help page: customers without an account, and inside Telegram
// ---------------------------------------------------------------------------

async function webSecret() {
  const s = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.web.secret'"))?.value;
  if (s) return parseJson<string>(s, "");
  const fresh = crypto.randomBytes(24).toString("hex");
  await run("INSERT INTO settings (key, value, updated_at) VALUES ('sup.web.secret', ?, ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(fresh), nowIso());
  return parseJson<string>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'sup.web.secret'"))!.value, fresh);
}
const sign = async (customerId: string) => `${customerId}.${crypto.createHmac("sha256", await webSecret()).update(`help:${customerId}`).digest("hex").slice(0, 40)}`;

async function customerOf(token: string | null | undefined) {
  const [id] = String(token ?? "").split(".");
  if (!id || !token || token !== (await sign(id))) throw new WorkflowError("FORBIDDEN", "This help link is not valid. Open a new request.");
  const c = await get<{ id: string; name: string; external_id: string | null; phone: string | null; email: string | null }>("SELECT id, name, external_id, phone, email FROM sup_customers WHERE id = ?", id);
  if (!c) throw new WorkflowError("FORBIDDEN", "This help link is not valid. Open a new request.");
  await run("UPDATE sup_customers SET last_seen_at = ? WHERE id = ?", nowIso(), id);
  return c;
}

async function needOn() {
  if (!(await sd.supportConfig()).enabled) throw new WorkflowError("INVALID_STATE", "Help requests are not open right now. Please try again later.");
}

// What the help page shows: the menu, its articles, and the support hours.
export async function helpHome() {
  const cfg = await sd.supportConfig();
  const cats = await helpCategories({ activeOnly: true });
  const articles = await all<{ id: string; title: string; body: string; category: string | null; views: number }>("SELECT id, title, body, category, views FROM sup_articles WHERE published = 1 ORDER BY views DESC, title LIMIT 400");
  return {
    open: cfg.enabled,
    hours: cfg.hours,
    categories: cats.map(({ queueId: _q, ...c }) => c),
    articles: articles.map((a) => ({ id: a.id, title: a.title, category: a.category, snippet: a.body.slice(0, 200), views: Number(a.views) })),
  };
}

// A new request from the help page. The customer gets a private link (token) to follow it.
export async function helpAsk(input: { token?: string | null; name: string; phone?: string | null; email?: string | null; category?: string | null; message: string; telegram?: boolean }) {
  await needOn();
  const message = clean(input.message, 4000);
  if (message.length < 5) throw new WorkflowError("VALIDATION", "Write your question (a few words at least).");
  let c = input.token ? await customerOf(input.token).catch(() => null) : null;
  if (!c) {
    const name = clean(input.name, 120);
    const phone = clean(input.phone, 40) || null;
    const email = clean(input.email, 200).toLowerCase() || null;
    if (!name) throw new WorkflowError("VALIDATION", "Write your name.");
    if (!phone && !email) throw new WorkflowError("VALIDATION", "Give a phone number or an email so we can reach you.");
    if (phone && !/^\+?[\d\s-]{7,20}$/.test(phone)) throw new WorkflowError("VALIDATION", "The phone number does not look right.");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkflowError("VALIDATION", "The email does not look right.");
    const id = uid("cus_");
    await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)", id, `web:${crypto.randomBytes(8).toString("hex")}`, name, email, phone, nowIso(), nowIso());
    c = { id, name, external_id: null, phone, email };
  }
  const open = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_tickets WHERE customer_id = ? AND status NOT IN ('solved','closed')", c.id))?.n ?? 0);
  if (open >= 5) throw new WorkflowError("VALIDATION", "You already have 5 open requests. Reply on one of them below.");
  const cat = await helpCategory(input.category);
  const tg = !!c.external_id?.startsWith("tg:");
  const id = await sd.createTicketFromChannel({ subject: `${cat ? `${cat.labelEn}: ` : ""}${message.slice(0, 70)}`, body: message, customerId: c.id, channel: tg ? "telegram" : "web", appQueue: null, category: cat?.key ?? null });
  const t = await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", id);
  return { token: await sign(c.id), ticketId: id, number: Number(t?.number) };
}

// The customer's requests and their public messages (never internal notes).
export async function helpTickets(token: string) {
  const c = await customerOf(token);
  const tickets = await all<{ id: string; number: number; subject: string; status: string; category: string | null; updated_at: string }>(
    "SELECT id, number, subject, status, category, updated_at FROM sup_tickets WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 30",
    c.id,
  );
  return { name: c.name, tickets };
}

export async function helpMessages(token: string, ticketId: string) {
  const c = await customerOf(token);
  const t = await get<{ id: string; number: number; subject: string; status: string }>("SELECT id, number, subject, status FROM sup_tickets WHERE id = ? AND customer_id = ?", ticketId, c.id);
  if (!t) throw new WorkflowError("NOT_FOUND", "Request not found.");
  const messages = await all<{ id: string; author_kind: string; author: string | null; body: string; created_at: string }>(
    `SELECT m.id, m.author_kind, CASE WHEN m.author_kind = 'agent' THEN u.name ELSE NULL END AS author, m.body, m.created_at FROM sup_messages m LEFT JOIN users u ON u.id = m.author_id
     WHERE m.ticket_id = ? AND m.internal = 0 ORDER BY m.created_at`,
    t.id,
  );
  // Only the agent's first name is shown to customers.
  return { ticket: t, messages: messages.map((m) => ({ ...m, author: m.author_kind === "agent" ? (m.author ?? "Support").split(" ")[0] : m.author_kind === "customer" ? "You" : "Myseed" })) };
}

export async function helpReply(token: string, ticketId: string, body: string) {
  await needOn();
  const c = await customerOf(token);
  const text = clean(body, 4000);
  if (!text) throw new WorkflowError("VALIDATION", "Write your message.");
  const t = await get<{ id: string; number: number; status: string; assignee_id: string | null }>("SELECT id, number, status, assignee_id FROM sup_tickets WHERE id = ? AND customer_id = ?", ticketId, c.id);
  if (!t) throw new WorkflowError("NOT_FOUND", "Request not found.");
  if (t.status === "closed") throw new WorkflowError("INVALID_STATE", "This request is closed. Open a new one.");
  const now = nowIso();
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'customer', ?, ?, 0, ?)", uid("smg_"), t.id, c.id, text, now);
  await run("UPDATE sup_tickets SET status = CASE WHEN status IN ('pending','solved') THEN 'open' ELSE status END, solved_at = CASE WHEN status = 'solved' THEN NULL ELSE solved_at END, last_customer_at = ?, updated_at = ? WHERE id = ?", now, now, t.id);
  if (t.assignee_id) await (await import("./notifications")).notify([t.assignee_id], { type: "assignment", title: `#${t.number}: the customer replied (help page)`, body: text.slice(0, 200), link: `/support?ticket=${t.id}`, dedupeKey: `sup-in-${t.id}-${now}` }, now);
  else await sd.autoAssign(t.id);
}

// Inside Telegram (Mini App): the page sends Telegram's signed initData; checked with the bot token, it says who the
// customer is, the same customer as in the bot's chat.
export async function helpTelegram(initData: string, botToken: string | null) {
  await needOn();
  if (!botToken) throw new WorkflowError("INVALID_STATE", "The Telegram bot is not connected.");
  const p = new URLSearchParams(String(initData ?? ""));
  const hash = p.get("hash") ?? "";
  p.delete("hash");
  const check = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = crypto.createHmac("sha256", "WebAppData").update(botToken).digest();
  const want = crypto.createHmac("sha256", key).update(check).digest("hex");
  if (hash.length !== want.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(want))) throw new WorkflowError("FORBIDDEN", "Telegram could not confirm who you are. Open the help center from the bot again.");
  const authDate = Number(p.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) throw new WorkflowError("FORBIDDEN", "This Telegram session is old. Open the help center from the bot again.");
  const u = parseJson<{ id?: number; first_name?: string; last_name?: string; username?: string }>(p.get("user"), {});
  if (!u.id) throw new WorkflowError("FORBIDDEN", "Telegram did not say who you are.");
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || "Telegram customer";
  const ext = `tg:${u.id}`;
  let c = await get<{ id: string }>("SELECT id FROM sup_customers WHERE app_id IS NULL AND external_id = ?", ext);
  if (!c) {
    const id = uid("cus_");
    await run("INSERT INTO sup_customers (id, app_id, external_id, name, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?)", id, ext, clean(name, 120), nowIso(), nowIso());
    c = { id };
  }
  return { token: await sign(c.id), name };
}

// ---------------------------------------------------------------------------
// Reports: by category, channel and queue
// ---------------------------------------------------------------------------

export async function categoryReport(user: AppUser, range: { from: string; to: string }) {
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin see the reports.");
  const from = `${range.from}T00:00:00.000Z`;
  const to = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 864e5).toISOString();
  const rows = await all<{ category: string | null; channel: string; queue: string | null; created_at: string; first_response_at: string | null; solved_at: string | null; breached: number; rating: number | null }>(
    "SELECT t.category, t.channel, q.name AS queue, t.created_at, t.first_response_at, t.solved_at, t.breached, t.rating FROM sup_tickets t LEFT JOIN sup_queues q ON q.id = t.queue_id WHERE t.created_at >= ? AND t.created_at < ?",
    from,
    to,
  );
  const cats = new Map((await helpCategories()).map((c) => [c.key, c.labelEn]));
  const group = (key: (r: (typeof rows)[number]) => string) => {
    const m = new Map<string, typeof rows>();
    for (const r of rows) m.set(key(r), [...(m.get(key(r)) ?? []), r]);
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    return [...m.entries()]
      .map(([name, list]) => {
        const rated = list.filter((r) => r.rating != null);
        return {
          name,
          tickets: list.length,
          solved: list.filter((r) => r.solved_at).length,
          late: list.filter((r) => Number(r.breached)).length,
          firstResponseMin: avg(list.filter((r) => r.first_response_at).map((r) => (Date.parse(r.first_response_at!) - Date.parse(r.created_at)) / 60e3)),
          resolveMin: avg(list.filter((r) => r.solved_at).map((r) => (Date.parse(r.solved_at!) - Date.parse(r.created_at)) / 60e3)),
          rating: rated.length ? Math.round((rated.reduce((a, r) => a + Number(r.rating), 0) / rated.length) * 10) / 10 : null,
        };
      })
      .sort((a, b) => b.tickets - a.tickets);
  };
  const { CHANNEL_LABELS } = await import("@/lib/support");
  return {
    total: rows.length,
    byCategory: group((r) => (r.category ? (cats.get(r.category) ?? r.category) : "No category")),
    byChannel: group((r) => CHANNEL_LABELS[r.channel] ?? r.channel),
    byQueue: group((r) => r.queue ?? "No queue"),
  };
}
