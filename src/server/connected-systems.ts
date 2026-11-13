// Connected systems (Update 1.1, phase 11). Every support app (MySeed Academy, Transaction Verify, a client's app) is
// a connected system with:
// - its own keys: the public key for the widget and SDK, the secret for signing customers and server calls;
// - channel switches: web chat, Telegram chat, calls (browser) and SMS, each on or off for that system;
// - its own Telegram bot (optional): messages to it become tickets of that system, in its queue, and agents' replies
//   go back through the same bot. Without one, the default bot (Customer support, Telegram) serves everyone;
// - an outgoing webhook: ticket events (created, replied, solved) are posted to the system's server, signed with
//   HMAC-SHA256 of the body (header X-Myseed-Signature: sha256=<hex>);
// - customer sync: the system's server sends its users (POST /api/support/v1/customers/sync with X-App-Secret).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";

export const CHANNELS = [
  { key: "web_chat", label: "Web chat", hint: "The widget and SDK conversations" },
  { key: "telegram", label: "Telegram chat", hint: "Messages to this system's bot" },
  { key: "calls", label: "Calls", hint: "Customers call from the widget (browser)" },
  { key: "sms", label: "SMS", hint: "Text messages to this system's customers" },
] as const;
export type Channel = (typeof CHANNELS)[number]["key"];
export type Channels = Record<Channel, boolean>;
export const WEBHOOK_EVENTS = ["ticket.created", "ticket.replied", "ticket.solved"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export const channelsOf = (raw: string | null | undefined): Channels => {
  const c = parseJson<Partial<Channels>>(raw ?? null, {});
  return Object.fromEntries(CHANNELS.map((x) => [x.key, c[x.key] !== false])) as Channels;
};
const isAdmin = async (u: AppUser) => (await import("./support-desk")).isAdmin(u);

type SysRow = { id: string; name: string; public_key: string; secret: string; active: number; queue_id: string | null; description: string | null; channels: string | null; tg_token: string | null; tg_bot: string | null; webhook_url: string | null; webhook_secret: string | null; webhook_events: string | null; webhook_last: string | null; call_engine?: string | null; call_phone?: string | null };

// A system's channel switch, checked where a channel is used (widget, calls, Telegram, SMS).
export async function channelOn(appId: string | null | undefined, ch: Channel) {
  if (!appId) return true;
  const r = await get<{ channels: string | null }>("SELECT channels FROM sup_apps WHERE id = ?", appId);
  return r ? channelsOf(r.channels)[ch] : true;
}
export async function needChannel(appId: string | null | undefined, ch: Channel) {
  if (!(await channelOn(appId, ch))) throw new WorkflowError("INVALID_STATE", `${CHANNELS.find((x) => x.key === ch)!.label} is switched off for this app.`);
}

// Admin's settings of one system (keys stay in Apps; this is the rest).
export async function saveSystem(user: AppUser, id: string, input: { description?: string | null; channels?: Partial<Channels>; webhookUrl?: string | null; webhookEvents?: string[] }) {
  if (!(await isAdmin(user))) throw new WorkflowError("FORBIDDEN", "Only Admin sets up connected systems.");
  const cur = await get<SysRow>("SELECT * FROM sup_apps WHERE id = ?", id);
  if (!cur) throw new WorkflowError("NOT_FOUND", "Unknown system.");
  const channels = { ...channelsOf(cur.channels), ...Object.fromEntries(Object.entries(input.channels ?? {}).filter(([k]) => CHANNELS.some((c) => c.key === k)).map(([k, v]) => [k, !!v])) };
  const url = input.webhookUrl === undefined ? cur.webhook_url : clean(input.webhookUrl, 400) || null;
  if (url && !/^https?:\/\/[^\s]+$/i.test(url)) throw new WorkflowError("VALIDATION", "The webhook must be a web address (https://...).");
  const events = input.webhookEvents === undefined ? parseJson<string[]>(cur.webhook_events, [...WEBHOOK_EVENTS]) : input.webhookEvents.filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e));
  const secret = url && !cur.webhook_secret ? `whsec_${crypto.randomBytes(18).toString("base64url")}` : cur.webhook_secret;
  await run("UPDATE sup_apps SET description = ?, channels = ?, webhook_url = ?, webhook_events = ?, webhook_secret = ? WHERE id = ?", input.description === undefined ? cur.description : clean(input.description, 300) || null, JSON.stringify(channels), url, JSON.stringify(events), secret, id);
  await audit({ actor: user }, { action: "support.system", summary: `${user.name} changed the connected system ${cur.name} (channels: ${CHANNELS.filter((c) => channels[c.key]).map((c) => c.label).join(", ") || "none"}${url ? "; webhook on" : ""})` });
  return { webhookSecret: url && !cur.webhook_secret ? secret : null };
}

export async function newWebhookSecret(user: AppUser, id: string) {
  if (!(await isAdmin(user))) throw new WorkflowError("FORBIDDEN", "Only Admin changes webhook secrets.");
  const secret = `whsec_${crypto.randomBytes(18).toString("base64url")}`;
  await run("UPDATE sup_apps SET webhook_secret = ? WHERE id = ?", secret, id);
  await audit({ actor: user }, { action: "support.system", summary: `${user.name} made a new webhook secret for a connected system` });
  return secret;
}

export const signBody = (secret: string, body: string) => `sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`;

// Posts a ticket event to the system's webhook (never blocks the desk: failures are logged in the call monitor).
export async function systemEvent(appId: string | null | undefined, event: WebhookEvent, data: Record<string, unknown>) {
  if (!appId) return null;
  const s = await get<SysRow>("SELECT * FROM sup_apps WHERE id = ?", appId);
  if (!s?.webhook_url || !s.webhook_secret || !Number(s.active)) return null;
  if (!parseJson<string[]>(s.webhook_events, [...WEBHOOK_EVENTS]).includes(event)) return null;
  const body = JSON.stringify({ id: uid("evt_"), event, system: s.name, at: nowIso(), data });
  const { trackedFetch } = await import("./call-monitor");
  let status = 0;
  try {
    const r = await trackedFetch("systems", s.webhook_url, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Myseed-Webhooks/1.0", "X-Myseed-Event": event, "X-Myseed-Signature": signBody(s.webhook_secret, body) }, body, signal: AbortSignal.timeout(8000) }, { summary: `${s.name} webhook ${event}` });
    status = r.status;
  } catch {
    status = 0;
  }
  await run("UPDATE sup_apps SET webhook_last = ? WHERE id = ?", JSON.stringify({ event, status, ok: status >= 200 && status < 300, at: nowIso() }), appId);
  return status;
}

// The system's server sends its users so agents see them before they write (and the widget knows them).
export async function syncCustomers(publicKey: string | null, secret: string | null, list: unknown) {
  const s = publicKey ? await get<SysRow>("SELECT * FROM sup_apps WHERE public_key = ?", publicKey) : null;
  const ok = !!s && !!secret && secret.length === s.secret.length && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(s.secret));
  if (!s || !ok || !Number(s.active)) throw new WorkflowError("FORBIDDEN", "Wrong app key or secret.");
  if (!Array.isArray(list) || !list.length) throw new WorkflowError("VALIDATION", "Send { customers: [{ id, name, email?, phone?, meta? }] }.");
  if (list.length > 500) throw new WorkflowError("VALIDATION", "Send at most 500 customers per call.");
  let created = 0;
  let updated = 0;
  const now = nowIso();
  for (const raw of list as Record<string, unknown>[]) {
    const ext = clean(raw?.id, 120);
    if (!ext) continue;
    const name = clean(raw.name, 120) || ext;
    const email = clean(raw.email, 200) || null;
    const phone = clean(raw.phone, 40) || null;
    const meta = raw.meta && typeof raw.meta === "object" ? JSON.stringify(raw.meta).slice(0, 4000) : null;
    const found = await get<{ id: string }>("SELECT id FROM sup_customers WHERE app_id = ? AND external_id = ?", s.id, ext);
    if (found) {
      await run("UPDATE sup_customers SET name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), meta = COALESCE(?, meta) WHERE id = ?", name, email, phone, meta, found.id);
      updated++;
    } else {
      await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, meta, verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)", uid("cus_"), s.id, ext, name, email, phone, meta ?? "{}", now);
      created++;
    }
  }
  return { created, updated };
}

// The systems page: settings, the bot, the webhook and traffic per system (also used by the live dashboard).
export async function listSystems(user: AppUser) {
  if (!(await (await import("./support-desk")).isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin see connected systems.");
  const rows = await all<SysRow>("SELECT * FROM sup_apps ORDER BY created_at");
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const traffic = await all<{ app_id: string | null; channel: string; n: number | string; open: number | string }>(
    "SELECT app_id, channel, COUNT(*) AS n, SUM(CASE WHEN status NOT IN ('solved','closed') THEN 1 ELSE 0 END) AS open FROM sup_tickets WHERE created_at >= ? GROUP BY app_id, channel",
    week,
  );
  const sys = rows.map((r) => {
    const t = traffic.filter((x) => x.app_id === r.id);
    return {
      id: r.id,
      name: r.name,
      publicKey: r.public_key,
      active: !!Number(r.active),
      description: r.description ?? "",
      channels: channelsOf(r.channels),
      bot: r.tg_token ? (r.tg_bot ?? "connected") : null,
      callEngine: (r.call_engine === "phone" ? "phone" : "browser") as "browser" | "phone",
      callPhone: r.call_phone ?? "",
      webhookUrl: r.webhook_url ?? "",
      webhookEvents: parseJson<string[]>(r.webhook_events, [...WEBHOOK_EVENTS]),
      webhookSecretSet: !!r.webhook_secret,
      webhookLast: parseJson<{ event: string; status: number; ok: boolean; at: string } | null>(r.webhook_last, null),
      tickets7: t.reduce((a, x) => a + Number(x.n), 0),
      open: t.reduce((a, x) => a + Number(x.open), 0),
      byChannel: Object.fromEntries(t.map((x) => [x.channel, Number(x.n)])) as Record<string, number>,
    };
  });
  const other = traffic.filter((x) => !x.app_id);
  return { systems: sys, unattached: { tickets7: other.reduce((a, x) => a + Number(x.n), 0), byChannel: Object.fromEntries(other.map((x) => [x.channel, Number(x.n)])) as Record<string, number> } };
}
