import { all, get, nowIso, run, uid, type Param } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { callConnector, connectorsFor, pick, type Connector } from "./connectors";
import { PURPOSES, sendSmsMessage, smsConfig, smsPrices, type Purpose, type SmsPrice } from "./sms";
import { smsCount } from "@/lib/sms-segments";

// The SMS console (Update 1.2, System improvements 5): compose for typed numbers and for groups (staff, Noor parents
// and students), see the message as it arrives, its characters, parts and encoding, and the cost before sending (parts
// times the provider's price per part: Twilio's from its Pricing API, the others from their price list as Admin keeps
// it), then send as one batch. Every message is tracked to delivered, pending, failed or rejected from the providers'
// delivery reports, with its parts, cost and failure reason, and usage is summed per day, provider and status.

const need = (u: AppUser) => {
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sends SMS from the console.");
};
const MAX_RECIPIENTS = 2000;

// Ethiopian numbers (09.., 07.., 9.. and 251..) become +251...; other numbers need their country code.
export function normalizePhone(raw: string): string | null {
  const s = raw.replace(/&#43;/g, "+").replace(/[^\d+]/g, "");
  const d = s.replace(/\D/g, "");
  if (/^0[79]\d{8}$/.test(d)) return `+251${d.slice(1)}`;
  if (/^[79]\d{8}$/.test(d)) return `+251${d}`;
  if (/^251[79]\d{8}$/.test(d)) return `+${d}`;
  if (s.startsWith("+") && d.length >= 8 && d.length <= 15) return `+${d}`;
  return null;
}

// --- Recipients ----------------------------------------------------------------------

export type Recipient = { phone: string; name: string | null };
const GROUPS = [
  { key: "staff", label: "Staff with a phone number" },
  { key: "noor:parents", label: "Noor parents (stored copy)" },
  { key: "noor:students", label: "Noor students (stored copy)" },
] as const;

async function groupMembers(key: string): Promise<Recipient[]> {
  if (key === "staff") return (await all<{ name: string; phone: string | null }>("SELECT name, phone FROM users WHERE active = 1 AND phone IS NOT NULL AND phone <> ''")).flatMap((u) => (normalizePhone(u.phone!) ? [{ phone: normalizePhone(u.phone!)!, name: u.name }] : []));
  const cat = key.startsWith("noor:") ? key.slice(5) : null;
  if (!cat) throw new WorkflowError("VALIDATION", "Unknown group.");
  const rows = await all<{ title: string | null; data_json: string }>("SELECT title, data_json FROM legacy_cms_records WHERE category = ?", cat);
  const out: Recipient[] = [];
  for (const r of rows) {
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(r.data_json);
    } catch {
      continue;
    }
    const phoneKey = Object.keys(data).find((k) => /phone|mobile|tel/i.test(k) && String(data[k] ?? "").trim());
    const phone = phoneKey ? normalizePhone(String(data[phoneKey]).split(/[,/;]/)[0]) : null;
    if (phone) out.push({ phone, name: r.title });
  }
  return out;
}

export async function smsRecipientGroups(user: AppUser) {
  need(user);
  return Promise.all(GROUPS.map(async (g) => ({ key: g.key, label: g.label, count: new Set((await groupMembers(g.key)).map((m) => m.phone)).size })));
}

export type RecipientInput = { numbers?: string; groups?: string[] };
export async function resolveRecipients(input: RecipientInput) {
  const seen = new Map<string, Recipient>();
  const invalid: string[] = [];
  for (const part of (input.numbers ?? "").split(/[\n,;]+/)) {
    const t = part.trim();
    if (!t) continue;
    // "Name <number>" or "number name" both work for pasted lists.
    const num = t.match(/\+?[\d\s()-]{7,}/)?.[0] ?? t;
    const phone = normalizePhone(num);
    if (!phone) {
      invalid.push(t.slice(0, 40));
      continue;
    }
    const name = t.replace(num, "").replace(/[<>]/g, "").trim() || null;
    if (!seen.has(phone)) seen.set(phone, { phone, name });
  }
  for (const g of input.groups ?? []) {
    if (!GROUPS.some((x) => x.key === g)) throw new WorkflowError("VALIDATION", "Unknown group.");
    for (const m of await groupMembers(g)) if (!seen.has(m.phone)) seen.set(m.phone, m);
  }
  return { recipients: [...seen.values()], invalid };
}

// --- Pricing -------------------------------------------------------------------------

export async function saveSmsPrice(user: AppUser, connectorId: string, input: { perPart: number; currency: string; source?: string | null } | null) {
  need(user);
  const c = (await connectorsFor("sms")).find((x) => x.id === connectorId);
  if (!c) throw new WorkflowError("NOT_FOUND", "That SMS provider is not active.");
  const prices = await smsPrices();
  if (!input) delete prices[connectorId];
  else {
    const perPart = Number(input.perPart);
    if (!Number.isFinite(perPart) || perPart < 0 || perPart > 1000) throw new WorkflowError("VALIDATION", "Give the price of one SMS part.");
    const currency = String(input.currency || "").trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new WorkflowError("VALIDATION", "Give the currency as a three-letter code, such as ETB.");
    prices[connectorId] = { perPart, currency, source: String(input.source || "Price list kept by Admin").slice(0, 120), updatedAt: nowIso() };
  }
  await setMeta("sms.pricing", JSON.stringify(prices));
  await audit({ actor: user }, { action: "settings.sms", summary: input ? `${user.name} set ${c.name}'s price to ${prices[connectorId].perPart} ${prices[connectorId].currency} a part` : `${user.name} cleared ${c.name}'s price` });
  return prices[connectorId] ?? null;
}

// Twilio publishes its prices (Pricing API, Messaging Countries): the outbound SMS price to Ethiopian mobiles.
export async function refreshLivePrice(user: AppUser, connectorId: string, country = "ET") {
  need(user);
  const c = (await connectorsFor("sms")).find((x) => x.id === connectorId);
  if (!c) throw new WorkflowError("NOT_FOUND", "That SMS provider is not active.");
  if (c.preset !== "twilio") throw new WorkflowError("INVALID_STATE", `${c.name} has no pricing API; enter the price from its price list.`);
  const probe: Connector = { ...c, baseUrl: "https://pricing.twilio.com", operation: { method: "GET", path: `/v1/Messaging/Countries/${country}`, contentType: "none", map: {}, headers: {} }, response: {} };
  const r = await callConnector(probe, {}, { test: true });
  if (!r.ok) throw new WorkflowError("INVALID_STATE", `Twilio's Pricing API did not answer: ${r.error}`);
  const list = (pick(r.body, "outbound_sms_prices") as { carrier?: string; prices?: { number_type?: string; current_price?: string }[] }[] | undefined) ?? [];
  const prices = list.flatMap((x) => (x.prices ?? []).map((p) => Number(p.current_price))).filter((n) => Number.isFinite(n) && n > 0);
  if (!prices.length) throw new WorkflowError("INVALID_STATE", "Twilio returned no outbound SMS price for this country.");
  const currency = String(pick(r.body, "price_unit") ?? "USD").toUpperCase();
  // Carriers differ; the highest keeps the estimate on the safe side.
  return saveSmsPrice(user, connectorId, { perPart: Math.max(...prices), currency, source: `Twilio Pricing API (${country}), highest carrier rate` });
}

// --- Estimate and send ---------------------------------------------------------------

export type ComposeInput = RecipientInput & { message: string; purpose?: Purpose; sender?: string | null; connectorId?: string | null; template?: string | null };

async function providerFor(purpose: Purpose, connectorId: string | null | undefined) {
  const active = await connectorsFor("sms");
  if (connectorId) {
    const c = active.find((x) => x.id === connectorId);
    if (!c) throw new WorkflowError("NOT_FOUND", "That SMS provider is not active.");
    return { c, fixed: true };
  }
  const cfg = await smsConfig();
  const chosen = cfg.routes[purpose].connectors.map((id) => active.find((x) => x.id === id)).find(Boolean);
  const c = chosen ?? active[0];
  if (!c) throw new WorkflowError("INVALID_STATE", "No SMS provider is connected (Integrations hub, Connections).");
  return { c, fixed: false };
}

export async function estimateSms(user: AppUser, input: ComposeInput) {
  need(user);
  const purpose: Purpose = PURPOSES.some((p) => p.key === input.purpose) ? input.purpose! : "alerts";
  const { recipients, invalid } = await resolveRecipients(input);
  const count = smsCount(input.message ?? "");
  const { c } = await providerFor(purpose, input.connectorId);
  const price: SmsPrice | undefined = (await smsPrices())[c.id];
  const parts = count.segments * recipients.length;
  const cfg = await smsConfig();
  return {
    recipients: recipients.length,
    sample: recipients.slice(0, 5),
    invalid,
    tooMany: recipients.length > MAX_RECIPIENTS,
    count,
    parts,
    provider: { id: c.id, name: c.name },
    sender: (input.sender ?? "") || cfg.routes[purpose].sender || null,
    price: price ?? null,
    cost: price ? Math.round(price.perPart * parts * 100) / 100 : null,
  };
}

export async function sendSmsBatch(user: AppUser, input: ComposeInput) {
  need(user);
  const purpose: Purpose = PURPOSES.some((p) => p.key === input.purpose) ? input.purpose! : "alerts";
  if (purpose === "otp") throw new WorkflowError("VALIDATION", "Sign-in codes are sent by the system, not from the console.");
  const message = (input.message ?? "").trim();
  if (!message) throw new WorkflowError("VALIDATION", "Write the message.");
  if (message.length > 900) throw new WorkflowError("VALIDATION", "Keep the message under 900 characters.");
  const est = await estimateSms(user, input);
  if (!est.recipients) throw new WorkflowError("VALIDATION", "Add at least one recipient.");
  if (est.tooMany) throw new WorkflowError("VALIDATION", `Send to at most ${MAX_RECIPIENTS} people at a time.`);
  const { recipients } = await resolveRecipients(input);
  const { c, fixed } = await providerFor(purpose, input.connectorId);
  const id = uid("smsb_");
  await run(
    "INSERT INTO sms_batches (id, created_by, purpose, sender, connector_id, preview, recipients, segments, est_cost, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sending', ?)",
    id,
    user.id,
    purpose,
    est.sender,
    c.id,
    message.slice(0, 160),
    recipients.length,
    est.parts,
    est.cost,
    est.price?.currency ?? null,
    nowIso(),
  );
  let sent = 0;
  let failed = 0;
  for (const r of recipients) {
    try {
      await sendSmsMessage({ to: r.phone, name: r.name, message, purpose, sender: input.sender || null, only: fixed ? c.id : null, batchId: id });
      sent++;
    } catch {
      failed++;
    }
  }
  await run("UPDATE sms_batches SET sent = ?, failed = ?, status = ?, finished_at = ? WHERE id = ?", sent, failed, failed && !sent ? "failed" : "done", nowIso(), id);
  await audit({ actor: user }, { action: "sms.batch", summary: `${user.name} sent an SMS to ${recipients.length} ${recipients.length === 1 ? "person" : "people"} through ${c.name}: ${sent} accepted, ${failed} failed` });
  return { id, sent, failed, recipients: recipients.length };
}

// --- History and usage ---------------------------------------------------------------

export type HistoryQuery = { q?: string | null; status?: string | null; provider?: string | null; batch?: string | null; from?: string | null; until?: string | null; page?: number; size?: number };
const STATUSES = ["delivered", "pending", "failed", "rejected"] as const;
// Pending: queued here or accepted by the provider, with no delivery report yet.
const statusSql = (s: string) => (s === "pending" ? "m.status IN ('queued', 'sent')" : "m.status = ?");

function where(f: HistoryQuery) {
  const w: string[] = [];
  const p: Param[] = [];
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) {
    w.push(statusSql(f.status));
    if (f.status !== "pending") p.push(f.status);
  }
  if (f.provider) (w.push("m.connector_id = ?"), p.push(f.provider));
  if (f.batch) (w.push("m.batch_id = ?"), p.push(f.batch));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) (w.push("m.created_at >= ?"), p.push(`${f.from}T00:00:00`));
  if (f.until && /^\d{4}-\d{2}-\d{2}$/.test(f.until)) (w.push("m.created_at <= ?"), p.push(`${f.until}T23:59:59.999Z`));
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase().slice(0, 80)}%`;
    w.push("(LOWER(m.to_phone) LIKE ? OR LOWER(COALESCE(m.recipient_name, '')) LIKE ? OR LOWER(COALESCE(m.preview, '')) LIKE ? OR LOWER(COALESCE(m.provider_id, '')) LIKE ?)");
    p.push(like, like, like, like);
  }
  return { sql: w.length ? `WHERE ${w.join(" AND ")}` : "", params: p };
}

type HistoryRow = { id: string; to_phone: string; recipient_name: string | null; purpose: string; sender: string | null; preview: string | null; length: number; segments: number | null; encoding: string | null; status: string; report_status: string | null; error: string | null; attempts: number; cost: number | null; currency: string | null; created_at: string; sent_at: string | null; delivered_at: string | null; provider_id: string | null; batch_id: string | null; provider: string | null };
const shape = (r: HistoryRow) => ({
  ...r,
  status: r.status === "queued" || r.status === "sent" ? ("pending" as const) : (r.status as "delivered" | "failed" | "rejected"),
  stage: r.status,
  cost: r.cost === null ? null : Number(r.cost),
  segments: Number(r.segments ?? 1),
});

export async function smsHistory(user: AppUser, f: HistoryQuery = {}) {
  need(user);
  const size = Math.min(100, Math.max(10, Math.floor(f.size ?? 25)));
  const page = Math.max(1, Math.floor(f.page ?? 1));
  const w = where(f);
  const total = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM sms_messages m ${w.sql}`, ...w.params))?.n ?? 0);
  const rows = await all<HistoryRow>(
    `SELECT m.id, m.to_phone, m.recipient_name, m.purpose, m.sender, m.preview, m.length, m.segments, m.encoding, m.status, m.report_status, m.error, m.attempts, m.cost, m.currency, m.created_at, m.sent_at, m.delivered_at, m.provider_id, m.batch_id, c.name AS provider FROM sms_messages m LEFT JOIN int_connectors c ON c.id = m.connector_id ${w.sql} ORDER BY m.created_at DESC LIMIT ${size} OFFSET ${(page - 1) * size}`,
    ...w.params,
  );
  return { rows: rows.map(shape), total, page, size, pages: Math.max(1, Math.ceil(total / size)) };
}

export async function exportSmsHistory(user: AppUser, f: HistoryQuery = {}) {
  need(user);
  const w = where(f);
  const rows = (await all<HistoryRow>(`SELECT m.*, c.name AS provider FROM sms_messages m LEFT JOIN int_connectors c ON c.id = m.connector_id ${w.sql} ORDER BY m.created_at DESC LIMIT 50000`, ...w.params)).map(shape);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s;
  };
  const head = ["Sent", "Recipient", "Name", "Purpose", "Sender", "Provider", "Status", "Provider status", "Parts", "Encoding", "Cost", "Currency", "Delivered", "Failure reason", "Provider message id", "Batch"];
  const lines = rows.map((r) => [r.created_at, r.to_phone, r.recipient_name, r.purpose, r.sender, r.provider, r.status, r.report_status, r.segments, r.encoding, r.cost, r.currency, r.delivered_at, r.error, r.provider_id, r.batch_id].map(cell).join(","));
  await audit({ actor: user }, { action: "sms.export", summary: `${user.name} exported ${rows.length} SMS records` });
  return { filename: `sms-history-${nowIso().slice(0, 10)}.csv`, csv: [head.join(","), ...lines].join("\n") };
}

export async function smsUsage(user: AppUser, f: { from?: string | null; until?: string | null } = {}) {
  need(user);
  const w = where({ from: f.from, until: f.until });
  const rows = await all<{ status: string; day: string; provider: string | null; connector_id: string | null; n: number | string; parts: number | string | null; cost: number | string | null; currency: string | null }>(
    `SELECT m.status, SUBSTR(m.created_at, 1, 10) AS day, c.name AS provider, m.connector_id, COUNT(*) AS n, SUM(m.segments) AS parts, SUM(m.cost) AS cost, m.currency FROM sms_messages m LEFT JOIN int_connectors c ON c.id = m.connector_id ${w.sql} GROUP BY m.status, SUBSTR(m.created_at, 1, 10), c.name, m.connector_id, m.currency`,
    ...w.params,
  );
  const bucket = (s: string) => (s === "queued" || s === "sent" ? "pending" : s);
  const totals = { messages: 0, parts: 0, delivered: 0, pending: 0, failed: 0, rejected: 0 } as Record<string, number>;
  const costs: Record<string, number> = {};
  const days = new Map<string, { day: string; messages: number; parts: number; delivered: number; failed: number }>();
  const providers = new Map<string, { name: string; messages: number; parts: number; delivered: number; failed: number; cost: number; currency: string | null }>();
  for (const r of rows) {
    const n = Number(r.n);
    const parts = Number(r.parts ?? 0);
    const b = bucket(r.status);
    totals.messages += n;
    totals.parts += parts;
    totals[b] = (totals[b] ?? 0) + n;
    if (r.cost !== null && r.currency) costs[r.currency] = (costs[r.currency] ?? 0) + Number(r.cost);
    const d = days.get(r.day) ?? { day: r.day, messages: 0, parts: 0, delivered: 0, failed: 0 };
    d.messages += n;
    d.parts += parts;
    if (b === "delivered") d.delivered += n;
    if (b === "failed" || b === "rejected") d.failed += n;
    days.set(r.day, d);
    const key = r.connector_id ?? "none";
    const pv = providers.get(key) ?? { name: r.provider ?? "Not sent", messages: 0, parts: 0, delivered: 0, failed: 0, cost: 0, currency: r.currency };
    pv.messages += n;
    pv.parts += parts;
    if (b === "delivered") pv.delivered += n;
    if (b === "failed" || b === "rejected") pv.failed += n;
    pv.cost += Number(r.cost ?? 0);
    pv.currency = pv.currency ?? r.currency;
    providers.set(key, pv);
  }
  const reported = totals.delivered + totals.failed + totals.rejected;
  const batches = await all<{ id: string; preview: string | null; recipients: number; sent: number; failed: number; est_cost: number | null; currency: string | null; status: string; created_at: string; by_name: string | null; provider: string | null }>(
    "SELECT b.id, b.preview, b.recipients, b.sent, b.failed, b.est_cost, b.currency, b.status, b.created_at, u.name AS by_name, c.name AS provider FROM sms_batches b LEFT JOIN users u ON u.id = b.created_by LEFT JOIN int_connectors c ON c.id = b.connector_id ORDER BY b.created_at DESC LIMIT 20",
  );
  return {
    totals,
    costs: Object.entries(costs).map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
    deliveryRate: reported ? Math.round((totals.delivered / reported) * 100) : null,
    days: [...days.values()].sort((a, b) => a.day.localeCompare(b.day)),
    providers: [...providers.values()].map((p) => ({ ...p, cost: Math.round(p.cost * 100) / 100 })),
    batches: batches.map((b) => ({ ...b, est_cost: b.est_cost === null ? null : Number(b.est_cost) })),
  };
}

// Everything the console page needs at once.
export async function smsConsole(user: AppUser) {
  need(user);
  const providers = await connectorsFor("sms");
  const prices = await smsPrices();
  const cfg = await smsConfig();
  return {
    providers: providers.map((c) => ({ id: c.id, name: c.name, preset: c.preset ?? null, price: prices[c.id] ?? null, livePricing: c.preset === "twilio", balance: !!cfg.balance[c.id] || c.preset === "africastalking" || c.preset === "twilio", lastTest: c.lastTest })),
    groups: await smsRecipientGroups(user),
    templates: cfg.templates.filter((t) => t.purpose !== "otp"),
    purposes: PURPOSES.filter((p) => p.key !== "otp").map((p) => ({ key: p.key, label: p.label, sender: cfg.routes[p.key].sender })),
    lastPricingNote: (await getMeta("sms.pricing")) ? null : "No prices yet: set each provider's price per SMS part to see costs.",
  };
}
