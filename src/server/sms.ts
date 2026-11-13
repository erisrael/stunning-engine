import crypto from "node:crypto";
import { all, get, nowIso, run, uid } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { callConnector, connectorsFor, pick, type Connector } from "./connectors";
import { recordIncoming } from "./call-monitor";

// SMS (Update 1.0, phase 7): every message is kept with its delivery status. Messages are routed by purpose (OTP,
// alerts, marketing) to Admin's providers in order, each with its sender ID; a failed send is retried and then goes
// to the next provider. Delivery reports come back to a signed callback address. Admin keeps message templates and
// can check each provider's balance.

export const PURPOSES = [
  { key: "otp", label: "Sign-in codes (OTP)" },
  { key: "alerts", label: "Alerts and reminders" },
  { key: "marketing", label: "Marketing" },
] as const;
export type Purpose = (typeof PURPOSES)[number]["key"];
export type Route = { connectors: string[]; sender: string };
export type SmsTemplate = { key: string; name: string; purpose: Purpose; text: string };
export type SmsConfig = { routes: Record<Purpose, Route>; retries: number; templates: SmsTemplate[]; dlrToken: string; balance: Record<string, { path: string; valuePath: string }> };

const blankRoute = (): Route => ({ connectors: [], sender: "" });
const isPurpose = (p: unknown): p is Purpose => PURPOSES.some((x) => x.key === p);

export async function smsConfig(): Promise<SmsConfig> {
  let raw: Partial<SmsConfig> = {};
  try {
    raw = JSON.parse((await getMeta("sms.config")) ?? "{}");
  } catch {
    raw = {};
  }
  let dlrToken = typeof raw.dlrToken === "string" && raw.dlrToken.length >= 16 ? raw.dlrToken : "";
  if (!dlrToken) {
    dlrToken = crypto.randomBytes(18).toString("base64url");
    await setMeta("sms.config", JSON.stringify({ ...raw, dlrToken }));
  }
  const routes = Object.fromEntries(PURPOSES.map((p) => {
    const r = raw.routes?.[p.key];
    return [p.key, { connectors: Array.isArray(r?.connectors) ? r!.connectors.map(String).slice(0, 10) : [], sender: String(r?.sender ?? "").slice(0, 20) }];
  })) as Record<Purpose, Route>;
  const templates = (Array.isArray(raw.templates) ? raw.templates : []).filter((t) => t && t.key && t.text).map((t) => ({ key: String(t.key).slice(0, 40), name: String(t.name ?? t.key).slice(0, 80), purpose: isPurpose(t.purpose) ? t.purpose : "alerts", text: String(t.text).slice(0, 900) }));
  const balance = Object.fromEntries(Object.entries(raw.balance ?? {}).filter(([, v]) => v && v.path).map(([k, v]) => [k, { path: String(v.path).slice(0, 300), valuePath: String(v.valuePath ?? "").slice(0, 120) }]));
  return { routes, retries: Math.max(0, Math.min(3, Math.round(Number(raw.retries ?? 1)))), templates, dlrToken, balance };
}

export async function saveSmsConfig(user: AppUser, input: Partial<Omit<SmsConfig, "dlrToken">> & { newToken?: boolean }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up SMS.");
  const cur = await smsConfig();
  const routes = { ...cur.routes };
  for (const p of PURPOSES) {
    const r = input.routes?.[p.key];
    if (r) routes[p.key] = { connectors: (r.connectors ?? []).map(String).slice(0, 10), sender: String(r.sender ?? "").trim().slice(0, 20) };
  }
  const keys = new Set<string>();
  const templates = input.templates === undefined ? cur.templates : input.templates.filter((t) => t.key?.trim() && t.text?.trim()).map((t) => ({ key: t.key.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40), name: (t.name || t.key).trim().slice(0, 80), purpose: isPurpose(t.purpose) ? t.purpose : "alerts", text: t.text.trim().slice(0, 900) })).filter((t) => (keys.has(t.key) ? false : (keys.add(t.key), true)));
  const next: SmsConfig = {
    routes,
    retries: input.retries === undefined ? cur.retries : Math.max(0, Math.min(3, Math.round(Number(input.retries)))),
    templates,
    dlrToken: input.newToken ? crypto.randomBytes(18).toString("base64url") : cur.dlrToken,
    balance: input.balance === undefined ? cur.balance : Object.fromEntries(Object.entries(input.balance).filter(([, v]) => v?.path?.trim()).map(([k, v]) => [k, { path: v.path.trim().slice(0, 300), valuePath: (v.valuePath ?? "").trim().slice(0, 120) }])),
  };
  await setMeta("sms.config", JSON.stringify(next));
  await audit({ actor: user }, { action: "settings.sms", summary: `${user.name} updated SMS setup (routes, ${next.templates.length} templates, ${next.retries} retries)${input.newToken ? "; a new delivery-report address was made" : ""}` });
  return next;
}

export function fillTemplate(text: string, vars: Record<string, string | number> = {}) {
  return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

const normPhone = (to: string) => to.replace(/[^\d+]/g, "");

// Providers for a purpose: the ones Admin chose for it (in that order), otherwise every active SMS provider in order.
async function providersFor(purpose: Purpose, cfg: SmsConfig): Promise<Connector[]> {
  const active = await connectorsFor("sms");
  const chosen = cfg.routes[purpose].connectors.map((id) => active.find((c) => c.id === id)).filter((c): c is Connector => !!c);
  return chosen.length ? chosen : active;
}

export async function sendSmsMessage(input: { to: string; message?: string; sender?: string | null; purpose?: Purpose; template?: string; vars?: Record<string, string | number>; only?: string | null }) {
  const cfg = await smsConfig();
  const purpose: Purpose = isPurpose(input.purpose) ? input.purpose : "alerts";
  let message = input.message ?? "";
  if (input.template) {
    const t = cfg.templates.find((x) => x.key === input.template);
    if (!t) throw new WorkflowError("NOT_FOUND", `No SMS template "${input.template}".`);
    message = fillTemplate(t.text, input.vars);
  }
  message = message.slice(0, 900);
  if (!message.trim()) throw new WorkflowError("VALIDATION", "Write the message.");
  const phone = normPhone(input.to);
  if (phone.replace(/\D/g, "").length < 9) throw new WorkflowError("VALIDATION", "That phone number looks too short.");
  // only: one provider and no fallback (a provider's own test).
  const providers = input.only ? (await connectorsFor("sms")).filter((c) => c.id === input.only) : await providersFor(purpose, cfg);
  if (!providers.length) throw new WorkflowError("INVALID_STATE", "No SMS provider is connected (Admin, Integrations, Integrate a platform).");
  const sender = (input.sender ?? "") || cfg.routes[purpose].sender;
  const id = uid("sms_");
  const now = nowIso();
  await run(
    "INSERT INTO sms_messages (id, to_phone, purpose, sender, preview, length, status, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, ?, ?)",
    id,
    phone,
    purpose,
    sender || null,
    // OTP codes are never kept.
    purpose === "otp" ? null : message.slice(0, 60),
    message.length,
    now,
    now,
  );
  const errors: string[] = [];
  let attempts = 0;
  for (const c of providers) {
    for (let t = 0; t <= cfg.retries; t++) {
      attempts++;
      const r = await callConnector(c, { to: phone, message, sender: sender ?? "" });
      if (r.ok) {
        await run("UPDATE sms_messages SET status = 'sent', connector_id = ?, provider_id = ?, attempts = ?, error = NULL, updated_at = ? WHERE id = ?", c.id, r.id, attempts, nowIso(), id);
        return { id, providerId: r.id, provider: c.name, attempts, fallback: c.id !== providers[0].id };
      }
      errors.push(`${c.name}: ${r.error}`);
    }
  }
  await run("UPDATE sms_messages SET status = 'failed', attempts = ?, error = ?, updated_at = ? WHERE id = ?", attempts, errors.join("; ").slice(0, 300), nowIso(), id);
  throw new WorkflowError("INVALID_STATE", `The SMS was not sent: ${errors.at(-1)}`);
}

// Delivery reports: Africa's Talking posts id and status as a form; others send JSON with similar names.
const DELIVERED = /^(success|delivered|deliveredtohandset|delivrd)$/i;
const FAILED = /^(failed|rejected|undelivered|undeliv|expired|absentsubscriber|insufficientcredit|userinblacklist|invalidphonenumber)$/i;

export async function handleDeliveryReport(token: string | null, body: Record<string, unknown>) {
  const cfg = await smsConfig();
  const ok = !!token && token.length === cfg.dlrToken.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(cfg.dlrToken));
  if (!ok) {
    await recordIncoming("sms", { ok: false, status: 403, summary: "Delivery report with a wrong token", error: "Refused" });
    return { ok: false, status: 403 as const };
  }
  const items = Array.isArray(body.data) ? (body.data as Record<string, unknown>[]) : [body];
  let updated = 0;
  for (const b of items) {
    const pid = String(b.id ?? b.messageId ?? b.message_id ?? b.MessageSid ?? pick(b, "response.message_id") ?? "").trim();
    const raw = String(b.status ?? b.deliveryStatus ?? b.MessageStatus ?? b.dlr_status ?? "").replace(/\s+/g, "");
    if (!pid) continue;
    const status = DELIVERED.test(raw) ? "delivered" : FAILED.test(raw) ? "failed" : "sent";
    const reason = String(b.failureReason ?? b.reason ?? b.ErrorCode ?? "").slice(0, 200) || null;
    const r = await run(
      "UPDATE sms_messages SET status = ?, error = CASE WHEN ? = 'failed' THEN COALESCE(?, error) ELSE error END, delivered_at = CASE WHEN ? = 'delivered' THEN ? ELSE delivered_at END, updated_at = ? WHERE provider_id = ?",
      status,
      status,
      reason,
      status,
      nowIso(),
      nowIso(),
      pid,
    );
    updated += r.changes;
  }
  await recordIncoming("sms", { ok: true, status: 200, summary: `Delivery report: ${items.length} item${items.length === 1 ? "" : "s"}, ${updated} matched`, ref: String(items[0]?.id ?? items[0]?.messageId ?? "") || null });
  return { ok: true, status: 200 as const, updated };
}

// A provider's balance, from the address Admin set for it (Africa's Talking's is filled in).
export async function smsBalance(user: AppUser, connectorId: string) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin checks the SMS balance.");
  const c = (await connectorsFor("sms")).find((x) => x.id === connectorId);
  if (!c) throw new WorkflowError("NOT_FOUND", "That SMS provider is not active.");
  const cfg = await smsConfig();
  const b = cfg.balance[c.id] ?? (c.preset === "africastalking" ? { path: "/version1/user?username={{secret.username}}", valuePath: "UserData.balance" } : null);
  if (!b) throw new WorkflowError("INVALID_STATE", `Set the balance address for ${c.name} first.`);
  const probe: Connector = { ...c, operation: { method: "GET", path: b.path, contentType: "none", map: {}, headers: c.operation.headers }, response: {} };
  const r = await callConnector(probe, {}, { test: true });
  if (!r.ok) throw new WorkflowError("INVALID_STATE", `${c.name} did not answer: ${r.error}`);
  const v = b.valuePath ? pick(r.body, b.valuePath) : r.body;
  return { provider: c.name, balance: typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v).slice(0, 200) };
}

export async function smsOverview(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees SMS.");
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const counts = await all<{ status: string; c: number }>("SELECT status, COUNT(*) AS c FROM sms_messages WHERE created_at >= ? GROUP BY status", since);
  const recent = await all<{ id: string; to_phone: string; purpose: string; sender: string | null; preview: string | null; status: string; error: string | null; attempts: number; created_at: string; delivered_at: string | null; provider: string | null }>(
    "SELECT m.id, m.to_phone, m.purpose, m.sender, m.preview, m.status, m.error, m.attempts, m.created_at, m.delivered_at, c.name AS provider FROM sms_messages m LEFT JOIN int_connectors c ON c.id = m.connector_id ORDER BY m.created_at DESC LIMIT 100",
  );
  const providers = (await connectorsFor("sms")).map((c) => ({ id: c.id, name: c.name, preset: c.preset ?? null, lastTest: c.lastTest }));
  // Phone numbers are shown with the middle hidden.
  const mask = (p: string) => (p.length > 6 ? `${p.slice(0, 4)}•••${p.slice(-3)}` : p);
  return { counts: Object.fromEntries(counts.map((c) => [c.status, Number(c.c)])) as Record<string, number>, recent: recent.map((r) => ({ ...r, to_phone: mask(r.to_phone) })), providers, config: await smsConfig() };
}

export async function lastDeliveryReport() {
  return (await get<{ at: string }>("SELECT MAX(at) AS at FROM int_calls WHERE source = 'sms' AND direction = 'in'"))?.at ?? null;
}
