import { all, get, nowIso, parseJson, run, uid } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";

// Customer support's configuration center (Update 1.2, spec 14.2): the settings that had no screen of their own:
// business hours and holidays (what customers are told when support is closed), escalation rules (conversations
// raised to the leads by themselves), notifications (who is told what), and chat (files and voice notes from
// customers). The other areas keep their own screens; the center lists them all with their state.

export const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export type DayHours = { open: string; close: string } | null;
export type CenterConfig = {
  schedule: {
    // Off: support is treated as always open (the free-text hours are only shown).
    on: boolean;
    days: Record<Weekday, DayHours>;
    holidays: { date: string; name: string }[];
    // The workspace's own holidays (Settings, Calendar) count too.
    companyHolidays: boolean;
    // Sent as the first answer to a conversation started while closed, and shown in the app.
    closedMessage: string;
  };
  escalation: {
    // A conversation that misses its target is escalated (marked, raised to high, the leads told).
    onBreach: boolean;
    // Words in a customer's message that escalate the conversation (fraud, lawyer, police...).
    keywords: string[];
    // A rating of 1 or 2 escalates the conversation.
    lowRating: boolean;
  };
  notifications: {
    // The leads are told when a conversation misses its target.
    breachToLeads: boolean;
    // The leads are told when a new conversation waits because no agent is free.
    waitingToLeads: boolean;
    // The customer is told in the conversation (and so in Telegram or by email) when a request raised for them
    // is received, taken on, resolved or not approved.
    requestUpdatesToCustomer: boolean;
  };
  chat: {
    customerFiles: boolean;
    voiceNotes: boolean;
    maxFileMb: number;
  };
};

const NINE_TO_FIVE: DayHours = { open: "08:30", close: "17:30" };
export const DEFAULT_CENTER: CenterConfig = {
  schedule: { on: false, days: { mon: NINE_TO_FIVE, tue: NINE_TO_FIVE, wed: NINE_TO_FIVE, thu: NINE_TO_FIVE, fri: NINE_TO_FIVE, sat: null, sun: null }, holidays: [], companyHolidays: true, closedMessage: "We are closed right now. Your message is saved and we will answer when we open." },
  escalation: { onBreach: false, keywords: [], lowRating: false },
  notifications: { breachToLeads: true, waitingToLeads: true, requestUpdatesToCustomer: true },
  chat: { customerFiles: true, voiceNotes: true, maxFileMb: 10 },
};

const KEY = "cfg.support.center";
export async function centerConfig(): Promise<CenterConfig> {
  const s = parseJson<Partial<CenterConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", KEY))?.value, {});
  return {
    schedule: { ...DEFAULT_CENTER.schedule, ...s.schedule, days: { ...DEFAULT_CENTER.schedule.days, ...s.schedule?.days } },
    escalation: { ...DEFAULT_CENTER.escalation, ...s.escalation },
    notifications: { ...DEFAULT_CENTER.notifications, ...s.notifications },
    chat: { ...DEFAULT_CENTER.chat, ...s.chat },
  };
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function saveCenterConfig(user: AppUser, input: Partial<CenterConfig>) {
  const sd = await import("./support-desk");
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin change support's settings.");
  const cur = await centerConfig();
  const sch = { ...cur.schedule, ...input.schedule };
  const days = {} as Record<Weekday, DayHours>;
  for (const d of WEEKDAYS) {
    const v = input.schedule?.days ? input.schedule.days[d] : cur.schedule.days[d];
    if (!v) days[d] = null;
    else {
      if (!HHMM.test(v.open) || !HHMM.test(v.close)) throw new WorkflowError("VALIDATION", `Give ${d} as two times like 08:30 and 17:30.`);
      if (v.close <= v.open) throw new WorkflowError("VALIDATION", `On ${d} support must close after it opens.`);
      days[d] = { open: v.open, close: v.close };
    }
  }
  const holidays = [...new Map((sch.holidays ?? []).map((h) => [String(h.date), { date: String(h.date), name: clean(h.name, 80) || "Holiday" }])).values()];
  const bad = holidays.find((h) => !/^\d{4}-\d{2}-\d{2}$/.test(h.date) || Number.isNaN(Date.parse(h.date)));
  if (bad) throw new WorkflowError("VALIDATION", `"${bad.date}" is not a date.`);
  const esc = { ...cur.escalation, ...input.escalation };
  const chat = { ...cur.chat, ...input.chat };
  const maxFileMb = Math.round(Number(chat.maxFileMb));
  if (!(maxFileMb >= 1 && maxFileMb <= 10)) throw new WorkflowError("VALIDATION", "Files from customers may be 1 to 10 MB.");
  const next: CenterConfig = {
    schedule: { on: !!sch.on, days, holidays: holidays.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 200), companyHolidays: !!sch.companyHolidays, closedMessage: clean(sch.closedMessage, 500) || DEFAULT_CENTER.schedule.closedMessage },
    escalation: { onBreach: !!esc.onBreach, lowRating: !!esc.lowRating, keywords: [...new Set((esc.keywords ?? []).map((k) => clean(k, 40).toLowerCase()).filter((k) => k.length >= 3))].slice(0, 50) },
    notifications: { ...cur.notifications, ...input.notifications },
    chat: { customerFiles: !!chat.customerFiles, voiceNotes: !!chat.voiceNotes, maxFileMb },
  };
  await run("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", KEY, JSON.stringify(next), nowIso(), user.id);
  await audit({ actor: user }, { action: "support.center", summary: `${user.name} changed customer support's ${Object.keys(input).join(", ")} settings` });
  return next;
}

// --- Business hours and holidays ---------------------------------------------

const addis = (ms: number) => {
  const d = new Date(ms + 3 * 3600e3);
  return { date: d.toISOString().slice(0, 10), day: WEEKDAYS[(d.getUTCDay() + 6) % 7]!, time: d.toISOString().slice(11, 16) };
};
async function holidayOn(date: string, c: CenterConfig) {
  const own = c.schedule.holidays.find((h) => h.date === date);
  if (own) return own.name;
  if (!c.schedule.companyHolidays) return null;
  const { getSettings } = await import("./settings");
  return (await getSettings()).calendar.holidays.find((h) => h.date === date)?.name ?? null;
}

// Open now (Addis Ababa time), and if not: why, and when it opens next.
export async function supportOpen(now = Date.now(), c?: CenterConfig): Promise<{ open: boolean; reason: "hours" | "holiday" | null; holiday: string | null; nextOpen: string | null }> {
  const cfg = c ?? (await centerConfig());
  if (!cfg.schedule.on) return { open: true, reason: null, holiday: null, nextOpen: null };
  const t = addis(now);
  const holiday = await holidayOn(t.date, cfg);
  const h = cfg.schedule.days[t.day];
  if (!holiday && h && t.time >= h.open && t.time < h.close) return { open: true, reason: null, holiday: null, nextOpen: null };
  // The next opening within two weeks: later today, or the first working, non-holiday day.
  let nextOpen: string | null = null;
  for (let i = 0; i < 14 && !nextOpen; i++) {
    const d = addis(now + i * 86400e3);
    const dh = cfg.schedule.days[d.day];
    if (!dh || (await holidayOn(d.date, cfg))) continue;
    if (i === 0 && t.time >= dh.open) continue;
    nextOpen = `${d.date}T${dh.open}:00+03:00`;
  }
  return { open: false, reason: holiday ? "holiday" : "hours", holiday, nextOpen };
}

// The week and the coming holidays, for the app's Support information page.
export async function scheduleForCustomers(now = Date.now()) {
  const c = await centerConfig();
  if (!c.schedule.on) return null;
  const today = addis(now).date;
  const company = c.schedule.companyHolidays ? (await (await import("./settings")).getSettings()).calendar.holidays : [];
  const coming = [...c.schedule.holidays, ...company].filter((h) => h.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  return { days: c.schedule.days, holidays: [...new Map(coming.map((h) => [h.date, h])).values()].slice(0, 5), status: await supportOpen(now, c), closedMessage: c.schedule.closedMessage };
}

// A conversation started while support is closed gets the closed message as its first answer (once).
export async function answerWhenClosed(ticketId: string, now = Date.now()) {
  const c = await centerConfig();
  const st = await supportOpen(now, c);
  if (st.open) return false;
  const when = st.nextOpen ? new Date(st.nextOpen).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : null;
  const text = `${st.holiday ? `Today is a holiday (${st.holiday}). ` : ""}${c.schedule.closedMessage}${when ? ` We open ${when}.` : ""}`;
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 0, ?)", uid("smg_"), ticketId, text, nowIso());
  const ch = await import("./support-channels");
  await ch.deliverReply(ticketId, text, "Support").catch(() => null);
  return true;
}

// --- Escalation rules ----------------------------------------------------------

// Raises a conversation by a rule: marked escalated, high priority, the leads told. Once per conversation.
export async function escalateByRule(ticketId: string, why: string) {
  const t = await get<{ id: string; number: number; subject: string; escalated_at: string | null; status: string }>("SELECT id, number, subject, escalated_at, status FROM sup_tickets WHERE id = ?", ticketId);
  if (!t || t.escalated_at) return false;
  const now = nowIso();
  await run("UPDATE sup_tickets SET escalated_at = ?, escalation_note = ?, priority = CASE WHEN priority IN ('low','normal') THEN 'high' ELSE priority END, updated_at = ? WHERE id = ?", now, why, now, t.id);
  const sd = await import("./support-desk");
  await sd.activity(null, t.id, "escalated", why);
  await notify((await sd.supportConfig()).leads, { type: "assignment", title: `#${t.number} was escalated: ${why}`, body: t.subject, link: `/support?ticket=${t.id}`, dedupeKey: `sup-esc-rule-${t.id}` }, now);
  return true;
}

// A customer's words: escalated when they contain one of the rule's keywords.
export async function escalateByWords(ticketId: string, text: string) {
  const { escalation } = await centerConfig();
  if (!escalation.keywords.length) return false;
  const low = ` ${text.toLowerCase()} `;
  const hit = escalation.keywords.find((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}\\p{N}]|$)`, "u").test(low));
  return hit ? escalateByRule(ticketId, `the customer wrote "${hit}"`) : false;
}

// --- Chat ----------------------------------------------------------------------

export async function checkCustomerFile(mime: string, size: number) {
  const { chat } = await centerConfig();
  const voice = /^audio\//.test(mime);
  if (voice && !chat.voiceNotes) throw new WorkflowError("FORBIDDEN", "Voice notes are not taken here. Write your message instead.");
  if (!voice && !chat.customerFiles) throw new WorkflowError("FORBIDDEN", "Files are not taken here. Describe it in a message instead.");
  if (size > chat.maxFileMb * 1024 * 1024) throw new WorkflowError("VALIDATION", `The file is larger than ${chat.maxFileMb} MB.`);
}

// --- The center ----------------------------------------------------------------

// Every area of spec 14.2 with its state, read from the real settings, and where it is managed.
export async function configurationCenter(user: AppUser) {
  const sd = await import("./support-desk");
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin see support's settings.");
  const cfg = await sd.supportConfig();
  const c = await centerConfig();
  const n = async (sql: string) => Number((await get<{ n: number }>(sql))?.n ?? 0);
  const ch = await import("./support-channels");
  const tg = await ch.telegramInfo();
  const texts = await ch.telegramTexts().catch(() => null);
  const ivr = await get<{ name: string }>("SELECT name FROM sup_ivr_flows WHERE active = 1 AND published_version IS NOT NULL LIMIT 1");
  const queues = await all<{ name: string; active: number }>("SELECT name, active FROM sup_queues");
  const { getPermissionMatrix } = await import("./settings");
  const roles = Object.keys((await getPermissionMatrix()) as Record<string, string[]>).length;
  const relay = await (await import("./calls")).iceServers().then((r) => r.relay).catch(() => false);
  const open = await supportOpen(Date.now(), c);
  const days = WEEKDAYS.filter((d) => c.schedule.days[d]).length;
  const s = (on: boolean) => (on ? "on" : "off");
  return [
    { key: "telegram-bot", label: "Telegram bot", state: tg.connected ? `Connected as @${tg.bot}` : "Not connected", ok: tg.connected, href: "/support?tab=telegram" },
    { key: "mini-app", label: "Telegram Mini App", state: texts?.miniApp ? "On: the bot's menu button opens the support app" : "Off", ok: !!texts?.miniApp, href: "/support?tab=telegram" },
    { key: "content", label: "Customer support content", state: `${await n("SELECT COUNT(*) AS n FROM sup_content WHERE published_body IS NOT NULL AND enabled = 1")} published texts`, ok: true, href: "/support?tab=content" },
    { key: "chat", label: "Chat", state: `Files from customers ${s(c.chat.customerFiles)}, voice notes ${s(c.chat.voiceNotes)}, up to ${c.chat.maxFileMb} MB`, ok: true, href: "/support?tab=config#chat" },
    { key: "notifications", label: "Notifications", state: `Leads told of missed targets ${s(c.notifications.breachToLeads)}; customers told of request updates ${s(c.notifications.requestUpdatesToCustomer)}`, ok: true, href: "/support?tab=config#notifications" },
    { key: "calling", label: "Voice calling", state: `Rings ${cfg.ringSeconds} s, then the whole queue after ${cfg.callEscalateSec} s`, ok: true, href: "/support?tab=settings" },
    { key: "webrtc", label: "WebRTC (relay for calls)", state: relay ? "Relay (TURN) set up: calls connect through firewalls" : "No relay: calls on some networks may not connect", ok: relay, href: "/settings?tab=calls" },
    { key: "ivr", label: "IVR (phone menu)", state: ivr ? `Active: ${ivr.name}` : cfg.ivr.on ? "Waiting message on, no menu" : "Off", ok: !!ivr || cfg.ivr.on, href: "/support?tab=ivr" },
    { key: "queues", label: "Queue management", state: `${queues.filter((q) => Number(q.active)).length} active of ${queues.length}`, ok: queues.some((q) => Number(q.active)), href: "/support?tab=queues" },
    { key: "recording", label: "Call recording", state: cfg.recordCalls ? "On, after the customer agrees" : "Off", ok: true, href: "/support?tab=settings" },
    { key: "call-retention", label: "Call retention", state: cfg.recordingDays === 0 ? "Recordings kept indefinitely" : `Recordings kept ${cfg.recordingDays} days; call records always kept`, ok: true, href: "/support?tab=settings" },
    { key: "hours", label: "Business hours", state: c.schedule.on ? `${days} days a week; ${open.open ? "open now" : "closed now"}` : `Not set: "${cfg.hours}" is only shown`, ok: c.schedule.on, href: "/support?tab=config#hours" },
    { key: "holidays", label: "Holidays", state: `${c.schedule.holidays.length} support holidays${c.schedule.companyHolidays ? " plus the workspace calendar's" : ""}`, ok: true, href: "/support?tab=config#hours" },
    { key: "departments", label: "Departments", state: "Departments and their heads", ok: true, href: "/admin?tab=departments" },
    { key: "agent-groups", label: "Agent groups", state: `${queues.length} queues with their agents and skills`, ok: queues.length > 0, href: "/support?tab=queues" },
    { key: "permissions", label: "Permissions", state: `${roles} roles, with the support roles`, ok: true, href: "/admin?tab=permissions" },
    { key: "escalation", label: "Escalation rules", state: [c.escalation.onBreach && "missed targets", c.escalation.lowRating && "low ratings", c.escalation.keywords.length && `${c.escalation.keywords.length} keywords`].filter(Boolean).join(", ") || "Only by hand", ok: c.escalation.onBreach || c.escalation.lowRating || c.escalation.keywords.length > 0, href: "/support?tab=config#escalation" },
    { key: "data-retention", label: "Data retention", state: cfg.conversationDays ? `Closed conversations deleted after ${cfg.conversationDays} days (not under legal hold)` : "Conversations kept until deleted by hand", ok: true, href: "/support?tab=settings" },
    { key: "integrations", label: "Integrations", state: `${await n("SELECT COUNT(*) AS n FROM sup_apps WHERE active = 1")} connected apps and systems`, ok: true, href: "/support?tab=systems" },
  ];
}
