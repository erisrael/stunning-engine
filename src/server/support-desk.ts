// Customer support: a help desk for the customers of Myseed's apps (and any other app connected with the SDK).
//
// - Apps (Admin, Support setup): each connected app has a public key for its SDK, a secret to sign who the customer
//   is, the web addresses allowed to use it, and the queue its tickets go to first.
// - Queues: who works them (agents), keywords that route a ticket to them, how tickets are given out (least busy or
//   in turn), and the response and resolution targets (SLA).
// - Tickets: from the SDK widget, from a call, or opened by an agent for a phone call or email. A new ticket is given
//   to an available agent of its queue at once: online in the desk (and checked in at work when the setting asks),
//   under their limit of open tickets. Tickets nobody could take wait and are given out as agents come online.
// - Calls: the customer calls from the widget (in the browser, no phone number needed); the agent answers in the
//   desk. Calls are recorded in the agent's browser (both voices) when recording is on, after the customer is told,
//   and kept with the ticket. Agents also log phone calls made outside the app, with notes and a recording file.
// - Monitoring (support leads): each agent's status, open and solved tickets, replies, first response and resolution
//   times, calls and minutes, customer ratings and missed targets, and the activity log.
//
// Customers never see internal notes, agents' activity or other customers' tickets. Every customer call goes through
// /api/support/v1 with the app's public key and the customer's token (src/app/api/support/v1).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid, type Param } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, listUsers, type AppUser } from "./users";
import { signedReadUrl, signedUploadUrl, storageKind } from "./storage";
import {
  DEFAULT_SUPPORT,
  DEFAULT_IVR,
  OPEN_STATUSES,
  PRIORITIES,
  TICKET_STATUSES,
  type SupportConfig,
  type TicketStatus,
  type Priority,
} from "@/lib/support";

export * from "@/lib/support";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const minutesFrom = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60e3).toISOString();
const hmac = (key: string, v: string) => crypto.createHmac("sha256", key).update(v).digest("hex");

// ---------------------------------------------------------------------------
// Settings and who is who
// ---------------------------------------------------------------------------

export async function supportConfig(): Promise<SupportConfig> {
  const s = parseJson<Partial<SupportConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.support'"))?.value, {});
  return { ...DEFAULT_SUPPORT, ...s };
}

export const isAdmin = (u: AppUser) => can(u, "users.manage");
export async function isLead(u: AppUser, cfg?: SupportConfig) {
  return isAdmin(u) || (cfg ?? (await supportConfig())).leads.includes(u.id);
}
async function memberQueues(userId: string) {
  return (await all<{ id: string; members: string }>("SELECT id, members FROM sup_queues WHERE active = 1")).filter((q) => parseJson<string[]>(q.members, []).includes(userId)).map((q) => q.id);
}
export async function isAgent(u: AppUser) {
  return (await isLead(u)) || (await memberQueues(u.id)).length > 0;
}
// The sidebar link: support switched on and this person works in it.
export async function supportNav(u: AppUser) {
  const cfg = await supportConfig();
  return cfg.enabled && (await isAgent(u));
}

async function needAgent(u: AppUser) {
  const cfg = await supportConfig();
  if (!cfg.enabled) throw new WorkflowError("INVALID_STATE", "Customer support is switched off (Admin, Support setup).");
  if (!(await isAgent(u))) throw new WorkflowError("FORBIDDEN", "Only support agents and leads work tickets.");
  return cfg;
}
async function needLead(u: AppUser) {
  const cfg = await supportConfig();
  if (!(await isLead(u, cfg))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin do this.");
  return cfg;
}

export async function saveSupportConfig(user: AppUser, input: Partial<SupportConfig>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets up customer support.");
  const cur = await supportConfig();
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const users = new Set((await listUsers()).map((u) => u.id));
  const next: SupportConfig = {
    enabled: input.enabled ?? cur.enabled,
    leads: (input.leads ?? cur.leads).filter((x: string) => users.has(x)).slice(0, 50),
    autoAssign: input.autoAssign ?? cur.autoAssign,
    requireCheckin: input.requireCheckin ?? cur.requireCheckin,
    recordCalls: input.recordCalls ?? cur.recordCalls,
    recordingNotice: clean(input.recordingNotice ?? cur.recordingNotice, 400) || DEFAULT_SUPPORT.recordingNotice,
    recordingDays: n(input.recordingDays ?? cur.recordingDays, 90, 1, 3650),
    autoCloseDays: n(input.autoCloseDays ?? cur.autoCloseDays, 7, 1, 90),
    ringSeconds: n(input.ringSeconds ?? cur.ringSeconds, 45, 15, 180),
    hours: clean(input.hours ?? cur.hours, 200),
    awayMessage: clean(input.awayMessage ?? cur.awayMessage, 400),
    mailbox: input.mailbox === undefined ? cur.mailbox : input.mailbox ? clean(input.mailbox, 200).toLowerCase() : null,
    telegram: input.telegram ?? cur.telegram,
    ivr: (() => {
      const i = { ...DEFAULT_IVR, ...cur.ivr, ...(input.ivr ?? {}) };
      const audio = i.audio && /^data:audio\/(mpeg|mp3|ogg|wav|webm|aac|mp4);base64,/.test(i.audio) && i.audio.length < 6_000_000 ? i.audio : null;
      if (input.ivr?.audio && !audio) throw new WorkflowError("VALIDATION", "The recording must be an audio file (MP3, OGG, WAV or M4A) up to 4 MB.");
      return { on: !!i.on, message: clean(i.message, 600), lang: clean(i.lang, 20) || "en-US", audio, music: !!i.music, repeatSec: n(i.repeatSec, 30, 10, 300), position: !!i.position };
    })(),
  };
  if (next.mailbox && next.mailbox !== cur.mailbox && !(await get("SELECT 1 AS x FROM email_senders WHERE LOWER(address) = ? AND mailbox = 1", next.mailbox)))
    throw new WorkflowError("VALIDATION", `${next.mailbox} is not a mailbox in the app yet (Email, Settings, Mailboxes).`);
  // A newly chosen mailbox becomes tickets from its next message on, not its old mail.
  if (next.mailbox && next.mailbox !== cur.mailbox) {
    const top = await (await import("./mail")).mailboxTopUid(next.mailbox).catch(() => 0);
    await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", `sup.mail.${next.mailbox}`, JSON.stringify(top), nowIso());
  }
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.support', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "support.settings", summary: `${user.name} ${next.enabled !== cur.enabled ? (next.enabled ? "switched customer support on" : "switched customer support off") : "changed the support settings"}` });
  return next;
}

export async function activity(userId: string | null, ticketId: string | null, kind: string, detail?: string | null) {
  await run("INSERT INTO sup_activity (id, user_id, ticket_id, kind, detail, at) VALUES (?, ?, ?, ?, ?, ?)", uid("sac_"), userId, ticketId, kind, detail ? clean(detail, 300) : null, nowIso());
}

// ---------------------------------------------------------------------------
// Apps (the SDK)
// ---------------------------------------------------------------------------

export type AppRow = { id: string; name: string; publicKey: string; origins: string[]; queueId: string | null; verifyIdentity: boolean; greeting: string | null; color: string | null; active: boolean };
const appRow = (r: { id: string; name: string; public_key: string; origins: string; queue_id: string | null; verify_identity: number; greeting: string | null; color: string | null; active: number }): AppRow => ({
  id: r.id,
  name: r.name,
  publicKey: r.public_key,
  origins: parseJson<string[]>(r.origins, []),
  queueId: r.queue_id,
  verifyIdentity: !!Number(r.verify_identity),
  greeting: r.greeting,
  color: r.color,
  active: !!Number(r.active),
});

export async function listApps(user: AppUser) {
  await needLead(user);
  return (await all<Parameters<typeof appRow>[0]>("SELECT * FROM sup_apps ORDER BY created_at")).map(appRow);
}

export async function saveApp(user: AppUser, input: { id?: string | null; name: string; origins?: string[]; queueId?: string | null; verifyIdentity?: boolean; greeting?: string | null; color?: string | null; active?: boolean }) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin connects apps.");
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the app, for example \"Myseed App\".");
  const origins = [...new Set((input.origins ?? []).map((o) => clean(o, 200).replace(/\/$/, "")).filter(Boolean))];
  const bad = origins.find((o) => !/^https?:\/\/[^/\s]+$/.test(o) && o !== "*");
  if (bad) throw new WorkflowError("VALIDATION", `"${bad}" is not a web address like https://app.myseed.et.`);
  const color = input.color && /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : null;
  if (input.id) {
    await run(
      "UPDATE sup_apps SET name = ?, origins = ?, queue_id = ?, verify_identity = ?, greeting = ?, color = ?, active = ? WHERE id = ?",
      name,
      JSON.stringify(origins),
      input.queueId || null,
      input.verifyIdentity ? 1 : 0,
      clean(input.greeting, 300) || null,
      color,
      input.active === false ? 0 : 1,
      input.id,
    );
    await audit({ actor: user }, { action: "support.app", summary: `${user.name} changed the support app ${name}` });
    return { id: input.id, secret: null as string | null };
  }
  const id = uid("sapp_");
  const secret = crypto.randomBytes(24).toString("base64url");
  await run(
    "INSERT INTO sup_apps (id, name, public_key, secret, origins, queue_id, verify_identity, greeting, color, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
    id,
    name,
    `pk_${crypto.randomBytes(12).toString("base64url")}`,
    secret,
    JSON.stringify(origins),
    input.queueId || null,
    input.verifyIdentity ? 1 : 0,
    clean(input.greeting, 300) || null,
    color,
    nowIso(),
  );
  await audit({ actor: user }, { action: "support.app", summary: `${user.name} connected the app ${name} to customer support` });
  // The secret is shown once; the app's server uses it to sign who the customer is.
  return { id, secret };
}

export async function newAppSecret(user: AppUser, id: string) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin changes an app's secret.");
  const secret = crypto.randomBytes(24).toString("base64url");
  await run("UPDATE sup_apps SET secret = ? WHERE id = ?", secret, id);
  await audit({ actor: user }, { action: "support.app", summary: `${user.name} made a new secret for a support app (customers sign in again)` });
  return secret;
}

type AppFull = { id: string; name: string; public_key: string; secret: string; origins: string; queue_id: string | null; verify_identity: number; greeting: string | null; color: string | null; active: number };

// The app a request comes from: its public key, and the page's web address when the app limits them.
export async function appByKey(publicKey: string | null | undefined, origin: string | null | undefined) {
  if (!publicKey) throw new WorkflowError("FORBIDDEN", "Missing app key.");
  const a = await get<AppFull>("SELECT * FROM sup_apps WHERE public_key = ?", publicKey);
  if (!a || !Number(a.active)) throw new WorkflowError("FORBIDDEN", "Unknown or switched-off app key.");
  const origins = parseJson<string[]>(a.origins, []);
  if (origin && origins.length && !origins.includes("*") && !origins.includes(origin.replace(/\/$/, ""))) throw new WorkflowError("FORBIDDEN", "This web address may not use this app's support.");
  if (!(await supportConfig()).enabled) throw new WorkflowError("INVALID_STATE", "Support is not available right now.");
  return a;
}

// ---------------------------------------------------------------------------
// Customers (from the SDK)
// ---------------------------------------------------------------------------

const tokenFor = (app: AppFull, customerId: string) => `${customerId}.${hmac(app.secret, `tok:${customerId}`)}`;

// The app says who the customer is. With "verify identity" on, the app's server signs the customer's id with the
// app secret (hash = HMAC-SHA256(secret, id), hex), so nobody can pretend to be another customer.
export async function identify(app: AppFull, input: { id?: string | null; name?: string | null; email?: string | null; phone?: string | null; hash?: string | null; meta?: Record<string, unknown> | null }) {
  const ext = clean(input.id, 120) || null;
  if (Number(app.verify_identity)) {
    if (!ext || !input.hash) throw new WorkflowError("FORBIDDEN", "This app signs its customers: send id and hash.");
    const want = hmac(app.secret, ext);
    if (input.hash.length !== want.length || !crypto.timingSafeEqual(Buffer.from(input.hash), Buffer.from(want))) throw new WorkflowError("FORBIDDEN", "The customer's signature does not match.");
  }
  const name = clean(input.name, 120) || (input.email ? clean(input.email, 120).split("@")[0]! : "Visitor");
  const email = clean(input.email, 200) || null;
  const phone = clean(input.phone, 40) || null;
  const meta = JSON.stringify(Object.fromEntries(Object.entries(input.meta ?? {}).slice(0, 20).map(([k, v]) => [clean(k, 40), clean(typeof v === "string" ? v : JSON.stringify(v), 200)])));
  const now = nowIso();
  let id: string;
  const found = ext ? await get<{ id: string }>("SELECT id FROM sup_customers WHERE app_id = ? AND external_id = ?", app.id, ext) : null;
  if (found) {
    id = found.id;
    await run("UPDATE sup_customers SET name = ?, email = COALESCE(?, email), phone = COALESCE(?, phone), meta = ?, verified = ?, last_seen_at = ? WHERE id = ?", name, email, phone, meta, Number(app.verify_identity) ? 1 : 0, now, id);
  } else {
    id = uid("cus_");
    await run(
      "INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, meta, verified, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      app.id,
      ext ?? `anon_${crypto.randomBytes(8).toString("hex")}`,
      name,
      email,
      phone,
      meta,
      Number(app.verify_identity) ? 1 : 0,
      now,
      now,
    );
  }
  const cfg = await supportConfig();
  const online = await availableAgents(null, cfg);
  return { token: tokenFor(app, id), customer: { id, name, email }, app: { name: app.name, greeting: app.greeting, color: app.color }, online: online.length > 0, hours: cfg.hours, awayMessage: cfg.awayMessage, recordCalls: cfg.recordCalls, recordingNotice: cfg.recordingNotice };
}

export async function customerByToken(app: AppFull, token: string | null | undefined) {
  const [id] = String(token ?? "").split(".");
  if (!id || !token || token !== tokenFor(app, id)) throw new WorkflowError("FORBIDDEN", "Sign in to support again.");
  const c = await get<{ id: string; name: string; email: string | null; app_id: string }>("SELECT id, name, email, app_id FROM sup_customers WHERE id = ?", id);
  if (!c || c.app_id !== app.id) throw new WorkflowError("FORBIDDEN", "Sign in to support again.");
  await run("UPDATE sup_customers SET last_seen_at = ? WHERE id = ?", nowIso(), id);
  return c;
}

// ---------------------------------------------------------------------------
// Queues
// ---------------------------------------------------------------------------

export type QueueRow = { id: string; name: string; description: string | null; keywords: string[]; members: string[]; strategy: "least_busy" | "round_robin" | "manual"; slaFirstMin: number; slaResolveMin: number; active: boolean };
const queueRow = (r: { id: string; name: string; description: string | null; keywords: string; members: string; strategy: string; sla_first_min: number; sla_resolve_min: number; active: number }): QueueRow => ({
  id: r.id,
  name: r.name,
  description: r.description,
  keywords: parseJson<string[]>(r.keywords, []),
  members: parseJson<string[]>(r.members, []),
  strategy: (["least_busy", "round_robin", "manual"].includes(r.strategy) ? r.strategy : "least_busy") as QueueRow["strategy"],
  slaFirstMin: Number(r.sla_first_min),
  slaResolveMin: Number(r.sla_resolve_min),
  active: !!Number(r.active),
});

export async function listQueues() {
  return (await all<Parameters<typeof queueRow>[0]>("SELECT * FROM sup_queues ORDER BY sort, created_at")).map(queueRow);
}

export async function saveQueue(user: AppUser, input: { id?: string | null; name: string; description?: string | null; keywords?: string[]; members: string[]; strategy?: string; slaFirstMin?: number; slaResolveMin?: number; active?: boolean }) {
  await needLead(user);
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the queue, for example \"App and account\".");
  const users = new Set((await listUsers()).map((u) => u.id));
  const members = [...new Set(input.members ?? [])].filter((m) => users.has(m));
  const keywords = [...new Set((input.keywords ?? []).map((k) => clean(k, 40).toLowerCase()).filter(Boolean))].slice(0, 40);
  const strategy = ["least_busy", "round_robin", "manual"].includes(input.strategy ?? "") ? input.strategy! : "least_busy";
  const first = Math.max(5, Math.min(10080, Math.round(Number(input.slaFirstMin) || 60)));
  const resolve = Math.max(first, Math.min(43200, Math.round(Number(input.slaResolveMin) || 1440)));
  let id = input.id ?? null;
  if (id) await run("UPDATE sup_queues SET name = ?, description = ?, keywords = ?, members = ?, strategy = ?, sla_first_min = ?, sla_resolve_min = ?, active = ? WHERE id = ?", name, clean(input.description, 300) || null, JSON.stringify(keywords), JSON.stringify(members), strategy, first, resolve, input.active === false ? 0 : 1, id);
  else {
    id = uid("sq_");
    const sort = Number((await get<{ m: number | null }>("SELECT MAX(sort) AS m FROM sup_queues"))?.m ?? 0) + 1;
    await run(
      "INSERT INTO sup_queues (id, name, description, keywords, members, strategy, sla_first_min, sla_resolve_min, sort, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)",
      id,
      name,
      clean(input.description, 300) || null,
      JSON.stringify(keywords),
      JSON.stringify(members),
      strategy,
      first,
      resolve,
      sort,
      nowIso(),
    );
  }
  for (const m of members) await run("INSERT INTO sup_agents (user_id, status, status_since) VALUES (?, 'offline', ?) ON CONFLICT (user_id) DO NOTHING", m, nowIso());
  await audit({ actor: user }, { action: "support.queue", summary: `${user.name} saved the support queue ${name} (${members.length} agents)` });
  return id;
}

// The queue a new ticket goes to: the first whose keywords appear in it, else the app's queue, else the first.
async function routeQueue(text: string, appQueue: string | null) {
  const qs = (await listQueues()).filter((q) => q.active);
  const t = text.toLowerCase();
  return qs.find((q) => q.keywords.some((k) => t.includes(k)))?.id ?? (appQueue && qs.some((q) => q.id === appQueue) ? appQueue : (qs[0]?.id ?? null));
}

// ---------------------------------------------------------------------------
// Agents: status and automatic assignment
// ---------------------------------------------------------------------------

const ONLINE_MS = 3 * 60e3;

export async function setAgentStatus(user: AppUser, status: "online" | "away" | "offline") {
  await needAgent(user);
  if (!["online", "away", "offline"].includes(status)) throw new WorkflowError("VALIDATION", "Choose online, away or offline.");
  const now = nowIso();
  const cur = await get<{ status: string }>("SELECT status FROM sup_agents WHERE user_id = ?", user.id);
  await run(
    "INSERT INTO sup_agents (user_id, status, status_since, last_seen_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET status = excluded.status, status_since = CASE WHEN sup_agents.status = excluded.status THEN sup_agents.status_since ELSE excluded.status_since END, last_seen_at = excluded.last_seen_at",
    user.id,
    status,
    now,
    now,
  );
  if (cur?.status !== status) await activity(user.id, null, `status_${status}`);
  if (status === "online") await assignWaiting();
}

// The desk calls this every few seconds while it is open: an agent who closes the desk drops out of assignment.
export async function heartbeat(user: AppUser) {
  await run("UPDATE sup_agents SET last_seen_at = ? WHERE user_id = ?", nowIso(), user.id);
}

export async function setAgentLimit(user: AppUser, agentId: string, maxOpen: number) {
  await needLead(user);
  await run("INSERT INTO sup_agents (user_id, status, status_since, max_open) VALUES (?, 'offline', ?, ?) ON CONFLICT (user_id) DO UPDATE SET max_open = excluded.max_open", agentId, nowIso(), Math.max(1, Math.min(100, Math.round(maxOpen))));
}

const OPEN_SQL = `('${OPEN_STATUSES.join("','")}')`;

// Agents of a queue (or of any queue) who can take a ticket now, least busy first.
export async function availableAgents(queueId: string | null, cfgIn?: SupportConfig, opts: { ignoreLimit?: boolean } = {}) {
  const cfg = cfgIn ?? (await supportConfig());
  const queues = (await listQueues()).filter((q) => q.active && (!queueId || q.id === queueId));
  const members = [...new Set(queues.flatMap((q) => q.members))];
  if (!members.length) return [];
  const since = new Date(Date.now() - ONLINE_MS).toISOString();
  const rows = await all<{ user_id: string; max_open: number; open: number; last_assigned: string | null }>(
    `SELECT a.user_id, a.max_open,
       (SELECT COUNT(*) FROM sup_tickets t WHERE t.assignee_id = a.user_id AND t.status IN ('new','open')) AS open,
       (SELECT MAX(t.assigned_at) FROM sup_tickets t WHERE t.assignee_id = a.user_id) AS last_assigned
     FROM sup_agents a JOIN users u ON u.id = a.user_id
     WHERE a.status = 'online' AND a.last_seen_at >= ? AND u.active = 1 AND a.user_id IN (${members.map(() => "?").join(",")})`,
    since,
    ...members,
  );
  let ok = rows.filter((r) => opts.ignoreLimit || Number(r.open) < Number(r.max_open));
  if (cfg.requireCheckin) {
    const { stateOf } = await import("./attendance");
    const at = [];
    for (const r of ok) {
      const e = await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ? AND status <> 'left'", r.user_id);
      if (e && (await stateOf(e.id)).state === "in") at.push(r);
    }
    ok = at;
  }
  return ok.sort((a, b) => Number(a.open) - Number(b.open) || String(a.last_assigned ?? "").localeCompare(String(b.last_assigned ?? ""))).map((r) => ({ userId: r.user_id, open: Number(r.open) }));
}

// Gives a ticket to an agent of its queue by the queue's way (least busy, or in turn).
export async function autoAssign(ticketId: string) {
  const cfg = await supportConfig();
  if (!cfg.autoAssign) return null;
  const t = await get<{ id: string; number: number; subject: string; queue_id: string | null; assignee_id: string | null; status: string }>("SELECT id, number, subject, queue_id, assignee_id, status FROM sup_tickets WHERE id = ?", ticketId);
  if (!t || t.assignee_id || !OPEN_STATUSES.includes(t.status as TicketStatus)) return null;
  const q = t.queue_id ? (await listQueues()).find((x) => x.id === t.queue_id) : null;
  if (q?.strategy === "manual") return null;
  const avail = await availableAgents(t.queue_id, cfg);
  if (!avail.length) return null;
  let pick = avail[0]!.userId;
  if (q?.strategy === "round_robin") {
    const last = (await get<{ last_assigned: string | null }>("SELECT last_assigned FROM sup_queues WHERE id = ?", q.id))?.last_assigned;
    const order = q.members.filter((m) => avail.some((a) => a.userId === m));
    const i = last ? order.indexOf(last) : -1;
    pick = order[(i + 1) % order.length] ?? pick;
  }
  const now = nowIso();
  // Only if still unassigned (two assignments at once take one ticket once).
  await run("UPDATE sup_tickets SET assignee_id = ?, assigned_at = ?, status = CASE WHEN status = 'new' THEN 'open' ELSE status END, updated_at = ? WHERE id = ? AND assignee_id IS NULL", pick, now, now, t.id);
  const got = await get<{ assignee_id: string | null }>("SELECT assignee_id FROM sup_tickets WHERE id = ?", t.id);
  if (got?.assignee_id !== pick) return null;
  if (q) await run("UPDATE sup_queues SET last_assigned = ? WHERE id = ?", pick, q.id);
  await activity(null, t.id, "assigned", `To ${(await get<{ name: string }>("SELECT name FROM users WHERE id = ?", pick))?.name} by the system (${q?.strategy === "round_robin" ? "in turn" : "least busy"})`);
  await notify([pick], { type: "assignment", title: `Ticket #${t.number} is yours`, body: t.subject, link: `/support?ticket=${t.id}` }, now);
  return pick;
}

// Tickets that waited because nobody was free, oldest and most urgent first.
export async function assignWaiting() {
  const cfg = await supportConfig();
  if (!cfg.enabled || !cfg.autoAssign) return 0;
  const waiting = await all<{ id: string }>(
    "SELECT id FROM sup_tickets WHERE assignee_id IS NULL AND status IN ('new','open') ORDER BY CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, created_at LIMIT 200",
  );
  let n = 0;
  for (const w of waiting) if (await autoAssign(w.id)) n++;
  return n;
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

async function nextNumber() {
  return Number((await get<{ m: number | null }>("SELECT MAX(number) AS m FROM sup_tickets"))?.m ?? 1000) + 1;
}
const SLA_FACTOR: Record<Priority, number> = { urgent: 0.25, high: 0.5, normal: 1, low: 2 };

async function createTicketRow(input: { subject: string; body: string; customerId: string | null; appId: string | null; appQueue: string | null; channel: string; priority?: Priority; authorKind: "customer" | "agent"; authorId: string | null; queueId?: string | null; internal?: boolean; emailId?: string | null }) {
  const subject = clean(input.subject, 160) || clean(input.body, 80) || "Help";
  const body = clean(input.body, 8000);
  if (!body) throw new WorkflowError("VALIDATION", "Write the question or problem.");
  const priority: Priority = PRIORITIES.includes(input.priority as Priority) ? input.priority! : "normal";
  const queueId = input.queueId ?? (await routeQueue(`${subject} ${body}`, input.appQueue));
  const q = queueId ? (await listQueues()).find((x) => x.id === queueId) : null;
  const now = nowIso();
  const id = uid("tkt_");
  await tx(async () => {
    const number = await nextNumber();
    await run(
      `INSERT INTO sup_tickets (id, number, queue_id, customer_id, app_id, subject, status, priority, channel, created_at, updated_at, sla_first_due, sla_resolve_due, last_customer_at)
       VALUES (?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?)`,
      id,
      number,
      queueId,
      input.customerId,
      input.appId,
      subject,
      priority,
      input.channel,
      now,
      now,
      minutesFrom(now, (q?.slaFirstMin ?? 60) * SLA_FACTOR[priority]),
      minutesFrom(now, (q?.slaResolveMin ?? 1440) * SLA_FACTOR[priority]),
      input.authorKind === "customer" ? now : null,
    );
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at, email_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("smg_"), id, input.authorKind, input.authorId, body, input.internal ? 1 : 0, now, input.emailId ?? null);
  });
  await activity(input.authorKind === "agent" ? input.authorId : null, id, "created", `${input.channel}${q ? `, queue ${q.name}` : ""}`);
  return id;
}

export async function customerCreateTicket(app: AppFull, token: string, input: { subject?: string; message: string; priority?: Priority }) {
  const c = await customerByToken(app, token);
  const id = await createTicketRow({ subject: input.subject ?? "", body: input.message, customerId: c.id, appId: app.id, appQueue: app.queue_id, channel: "widget", priority: input.priority === "urgent" ? "high" : input.priority, authorKind: "customer", authorId: c.id });
  const who = await autoAssign(id);
  if (!who) {
    const leads = (await supportConfig()).leads;
    const t = await get<{ number: number; subject: string }>("SELECT number, subject FROM sup_tickets WHERE id = ?", id);
    await notify(leads, { type: "assignment", title: `Ticket #${t?.number} waits: no agent is free`, body: t?.subject ?? "", link: `/support?ticket=${id}`, dedupeKey: `sup-wait-${id}` }, nowIso());
  }
  return id;
}

// A ticket from email or Telegram (src/server/support-channels.ts), given out as any other.
export async function createTicketFromChannel(input: { subject: string; body: string; customerId: string; channel: "email" | "telegram"; emailId?: string | null; appQueue: string | null }) {
  const id = await createTicketRow({ subject: input.subject, body: input.body, customerId: input.customerId, appId: null, appQueue: input.appQueue, channel: input.channel, authorKind: "customer", authorId: input.customerId, emailId: input.emailId ?? null });
  if (!(await autoAssign(id))) {
    const t = await get<{ number: number; subject: string }>("SELECT number, subject FROM sup_tickets WHERE id = ?", id);
    await notify((await supportConfig()).leads, { type: "assignment", title: `Ticket #${t?.number} waits: no agent is free`, body: t?.subject ?? "", link: `/support?ticket=${id}`, dedupeKey: `sup-wait-${id}` }, nowIso());
  }
  return id;
}

export async function customerTickets(app: AppFull, token: string) {
  const c = await customerByToken(app, token);
  return all<{ id: string; number: number; subject: string; status: string; updated_at: string; rating: number | null }>(
    "SELECT id, number, subject, status, updated_at, rating FROM sup_tickets WHERE customer_id = ? ORDER BY updated_at DESC LIMIT 50",
    c.id,
  );
}

async function customerTicket(app: AppFull, token: string, ticketId: string) {
  const c = await customerByToken(app, token);
  const t = await get<{ id: string; number: number; subject: string; status: string; customer_id: string; assignee_id: string | null; rating: number | null }>("SELECT id, number, subject, status, customer_id, assignee_id, rating FROM sup_tickets WHERE id = ?", ticketId);
  if (!t || t.customer_id !== c.id) throw new WorkflowError("NOT_FOUND", "Conversation not found.");
  return { c, t };
}

export async function customerMessages(app: AppFull, token: string, ticketId: string, since?: string | null) {
  const { t } = await customerTicket(app, token, ticketId);
  const msgs = await all<{ id: string; author_kind: string; name: string | null; body: string; created_at: string }>(
    `SELECT m.id, m.author_kind, u.name, m.body, m.created_at FROM sup_messages m LEFT JOIN users u ON u.id = m.author_id AND m.author_kind = 'agent'
     WHERE m.ticket_id = ? AND m.internal = 0 ${since ? "AND m.created_at > ?" : ""} ORDER BY m.created_at`,
    t.id,
    ...(since ? [since] : []),
  );
  // Customers see the agent's first name only.
  return { ticket: { id: t.id, number: t.number, subject: t.subject, status: t.status, rating: t.rating }, messages: msgs.map((m) => ({ id: m.id, from: m.author_kind, name: m.author_kind === "agent" ? (m.name ?? "Support").split(" ")[0] : m.author_kind === "system" ? "Support" : "You", body: m.body, at: m.created_at })) };
}

export async function customerReply(app: AppFull, token: string, ticketId: string, body: string) {
  const { c, t } = await customerTicket(app, token, ticketId);
  const text = clean(body, 8000);
  if (!text) throw new WorkflowError("VALIDATION", "Write a message.");
  if (t.status === "closed") throw new WorkflowError("INVALID_STATE", "This conversation is closed. Start a new one.");
  const now = nowIso();
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'customer', ?, ?, 0, ?)", uid("smg_"), t.id, c.id, text, now);
  // A reply reopens a solved ticket and takes a waiting one back to the agent.
  await run("UPDATE sup_tickets SET status = CASE WHEN status IN ('pending','solved') THEN 'open' ELSE status END, solved_at = CASE WHEN status = 'solved' THEN NULL ELSE solved_at END, last_customer_at = ?, updated_at = ? WHERE id = ?", now, now, t.id);
  if (t.assignee_id) await notify([t.assignee_id], { type: "assignment", title: `#${t.number}: ${c.name} replied`, body: text.slice(0, 200), link: `/support?ticket=${t.id}`, dedupeKey: `sup-reply-${t.id}-${now}` }, now);
  else await autoAssign(t.id);
}

export async function customerRate(app: AppFull, token: string, ticketId: string, rating: number, comment?: string | null) {
  const { t } = await customerTicket(app, token, ticketId);
  if (!["solved", "closed"].includes(t.status)) throw new WorkflowError("INVALID_STATE", "Rate the help once your question is solved.");
  const r = Math.round(Number(rating));
  if (!(r >= 1 && r <= 5)) throw new WorkflowError("VALIDATION", "Rate from 1 to 5.");
  await run("UPDATE sup_tickets SET rating = ?, rating_comment = ? WHERE id = ?", r, clean(comment, 500) || null, t.id);
  await activity(null, t.id, "rated", `${r} of 5${comment ? `: ${clean(comment, 200)}` : ""}`);
  if (t.assignee_id && r <= 2) await notify([...(await supportConfig()).leads, t.assignee_id], { type: "assignment", title: `#${t.number} was rated ${r} of 5`, body: clean(comment, 200) || "No comment.", link: `/support?ticket=${t.id}` }, nowIso());
}

// --- Agent side --------------------------------------------------------------

export type TicketListRow = { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue: string | null; customer: string | null; assignee: string | null; assignee_id: string | null; updated_at: string; created_at: string; sla_first_due: string | null; sla_resolve_due: string | null; first_response_at: string | null; breached: number; last_customer_at: string | null; last_agent_at: string | null };

export async function inbox(user: AppUser, view: string, q?: string | null) {
  const cfg = await needAgent(user);
  const lead = await isLead(user, cfg);
  const mine = await memberQueues(user.id);
  const where: string[] = [];
  const args: Param[] = [];
  if (view === "mine") (where.push(`t.assignee_id = ? AND t.status IN ${OPEN_SQL.replace(")", ",'pending','on_hold')")}`), args.push(user.id));
  else if (view === "unassigned") where.push(`t.assignee_id IS NULL AND t.status IN ${OPEN_SQL}`);
  else if (view === "breached") where.push(`t.breached = 1 AND t.status NOT IN ('solved','closed')`);
  else if (view === "solved") where.push(`t.status IN ('solved','closed')`);
  else if (view.startsWith("queue:")) (where.push(`t.queue_id = ? AND t.status NOT IN ('solved','closed')`), args.push(view.slice(6)));
  else where.push(`t.status NOT IN ('solved','closed')`);
  // Agents see their queues' tickets and their own; leads see all.
  if (!lead) {
    where.push(`(t.assignee_id = ? ${mine.length ? `OR t.queue_id IN (${mine.map(() => "?").join(",")})` : ""})`);
    args.push(user.id, ...mine);
  }
  if (q?.trim()) {
    const like = `%${q.trim().toLowerCase()}%`;
    where.push("(LOWER(t.subject) LIKE ? OR LOWER(c.name) LIKE ? OR LOWER(COALESCE(c.email,'')) LIKE ? OR CAST(t.number AS TEXT) = ?)");
    args.push(like, like, like, q.trim().replace(/^#/, ""));
  }
  return all<TicketListRow>(
    `SELECT t.id, t.number, t.subject, t.status, t.priority, t.channel, sq.name AS queue, c.name AS customer, u.name AS assignee, t.assignee_id, t.updated_at, t.created_at,
            t.sla_first_due, t.sla_resolve_due, t.first_response_at, t.breached, t.last_customer_at, t.last_agent_at
     FROM sup_tickets t LEFT JOIN sup_queues sq ON sq.id = t.queue_id LEFT JOIN sup_customers c ON c.id = t.customer_id LEFT JOIN users u ON u.id = t.assignee_id
     WHERE ${where.join(" AND ")}
     ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, t.updated_at DESC LIMIT 300`,
    ...args,
  );
}

async function canWork(user: AppUser, ticketId: string) {
  const cfg = await needAgent(user);
  const t = await get<{ id: string; number: number; queue_id: string | null; assignee_id: string | null; status: string; customer_id: string | null; subject: string; first_response_at: string | null; app_id: string | null }>(
    "SELECT id, number, queue_id, assignee_id, status, customer_id, subject, first_response_at, app_id FROM sup_tickets WHERE id = ?",
    ticketId,
  );
  if (!t) throw new WorkflowError("NOT_FOUND", "Ticket not found.");
  if (!(await isLead(user, cfg)) && t.assignee_id !== user.id && !(t.queue_id && (await memberQueues(user.id)).includes(t.queue_id))) throw new WorkflowError("FORBIDDEN", "This ticket is in another team's queue.");
  return t;
}

export async function ticketDetail(user: AppUser, ticketId: string) {
  const t = await canWork(user, ticketId);
  await activity(user.id, t.id, "viewed");
  const full = await get<Record<string, unknown>>(
    `SELECT t.*, sq.name AS queue, u.name AS assignee FROM sup_tickets t LEFT JOIN sup_queues sq ON sq.id = t.queue_id LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id = ?`,
    t.id,
  );
  const customer = t.customer_id ? await get<{ id: string; name: string; email: string | null; phone: string | null; meta: string; verified: number; external_id: string | null; app: string | null }>("SELECT c.*, a.name AS app FROM sup_customers c LEFT JOIN sup_apps a ON a.id = c.app_id WHERE c.id = ?", t.customer_id) : null;
  const messages = await all<{ id: string; author_kind: string; author: string | null; body: string; internal: number; created_at: string }>(
    `SELECT m.id, m.author_kind, CASE WHEN m.author_kind = 'agent' THEN u.name WHEN m.author_kind = 'customer' THEN c.name ELSE 'System' END AS author, m.body, m.internal, m.created_at
     FROM sup_messages m LEFT JOIN users u ON u.id = m.author_id LEFT JOIN sup_customers c ON c.id = m.author_id WHERE m.ticket_id = ? ORDER BY m.created_at`,
    t.id,
  );
  const calls = await all<{ id: string; status: string; direction: string; kind: string; agent: string | null; started_at: string; duration_s: number | null; recording_id: string | null; recording_size: number | null; notes: string | null; consent: number }>(
    "SELECT k.id, k.status, k.direction, k.kind, u.name AS agent, k.started_at, k.duration_s, k.recording_id, k.recording_size, k.notes, k.consent FROM sup_calls k LEFT JOIN users u ON u.id = k.agent_id WHERE k.ticket_id = ? ORDER BY k.started_at DESC",
    t.id,
  );
  const log = await all<{ kind: string; detail: string | null; at: string; who: string | null }>("SELECT a.kind, a.detail, a.at, u.name AS who FROM sup_activity a LEFT JOIN users u ON u.id = a.user_id WHERE a.ticket_id = ? AND a.kind <> 'viewed' ORDER BY a.at DESC LIMIT 100", t.id);
  const history = t.customer_id ? await all<{ id: string; number: number; subject: string; status: string; created_at: string }>("SELECT id, number, subject, status, created_at FROM sup_tickets WHERE customer_id = ? AND id <> ? ORDER BY created_at DESC LIMIT 10", t.customer_id, t.id) : [];
  return { ticket: full, customer: customer ? { ...customer, meta: parseJson<Record<string, string>>(customer.meta, {}), verified: !!Number(customer.verified) } : null, messages: messages.map((m) => ({ ...m, internal: !!Number(m.internal) })), calls, log, history };
}

export async function agentReply(user: AppUser, ticketId: string, input: { body: string; internal?: boolean; status?: TicketStatus | null }) {
  const t = await canWork(user, ticketId);
  const body = clean(input.body, 8000);
  if (!body) throw new WorkflowError("VALIDATION", "Write the reply.");
  const now = nowIso();
  const msgId = uid("smg_");
  await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'agent', ?, ?, ?, ?)", msgId, t.id, user.id, body, input.internal ? 1 : 0, now);
  // Email and Telegram tickets: the reply goes back the same way.
  if (!input.internal) {
    try {
      const sent = await (await import("./support-channels")).deliverReply(t.id, body, user.name);
      if (sent && sent !== "telegram") await run("UPDATE sup_messages SET email_id = ? WHERE id = ?", sent, msgId);
    } catch (e) {
      await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), t.id, `The reply could not be sent to the customer: ${e instanceof Error ? e.message : String(e)}`, nowIso());
    }
  }
  if (!input.internal) {
    // The first public reply answers the ticket (the first response target); an unassigned ticket becomes the replier's.
    await run(
      "UPDATE sup_tickets SET first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, updated_at = ?, assignee_id = COALESCE(assignee_id, ?), assigned_at = COALESCE(assigned_at, ?), status = CASE WHEN status = 'new' THEN 'open' ELSE status END WHERE id = ?",
      now,
      now,
      now,
      user.id,
      now,
      t.id,
    );
  } else await run("UPDATE sup_tickets SET updated_at = ? WHERE id = ?", now, t.id);
  await activity(user.id, t.id, input.internal ? "note" : "replied", body.slice(0, 120));
  if (input.status) await setTicketStatus(user, t.id, input.status);
}

export async function setTicketStatus(user: AppUser, ticketId: string, status: TicketStatus) {
  const t = await canWork(user, ticketId);
  if (!TICKET_STATUSES.includes(status)) throw new WorkflowError("VALIDATION", "Choose a status.");
  if (t.status === status) return;
  const now = nowIso();
  await run(
    "UPDATE sup_tickets SET status = ?, solved_at = CASE WHEN ? IN ('solved','closed') THEN COALESCE(solved_at, ?) ELSE NULL END, updated_at = ? WHERE id = ?",
    status,
    status,
    now,
    now,
    t.id,
  );
  await activity(user.id, t.id, "status", `${t.status} to ${status}`);
  if (status === "solved" && t.customer_id)
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 0, ?)", uid("smg_"), t.id, "This conversation is marked solved. Reply if you still need help, or rate the help you got.", now);
}

export async function assignTicket(user: AppUser, ticketId: string, assigneeId: string | null) {
  const t = await canWork(user, ticketId);
  const lead = await isLead(user);
  // Agents take a ticket for themselves or give it back; leads give it to anyone in support.
  if (!lead && assigneeId && assigneeId !== user.id) throw new WorkflowError("FORBIDDEN", "Only a lead gives a ticket to someone else.");
  if (!lead && !assigneeId && t.assignee_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only a lead takes a ticket from someone.");
  const name = assigneeId ? (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", assigneeId))?.name : null;
  if (assigneeId && !name) throw new WorkflowError("NOT_FOUND", "Agent not found.");
  const now = nowIso();
  await run("UPDATE sup_tickets SET assignee_id = ?, assigned_at = ?, status = CASE WHEN status = 'new' THEN 'open' ELSE status END, updated_at = ? WHERE id = ?", assigneeId, assigneeId ? now : null, now, t.id);
  await activity(user.id, t.id, "assigned", assigneeId ? `To ${name}` : "Back to the queue");
  if (assigneeId && assigneeId !== user.id) await notify([assigneeId], { type: "assignment", title: `Ticket #${t.number} is yours`, body: `${user.name} gave you: ${t.subject}`, link: `/support?ticket=${t.id}` }, now, user.id);
  if (!assigneeId) await autoAssign(t.id);
}

export async function updateTicket(user: AppUser, ticketId: string, input: { priority?: Priority; queueId?: string | null; tags?: string[]; subject?: string }) {
  const t = await canWork(user, ticketId);
  const sets: string[] = [];
  const args: Param[] = [];
  if (input.priority && PRIORITIES.includes(input.priority)) (sets.push("priority = ?"), args.push(input.priority));
  if (input.queueId !== undefined) (sets.push("queue_id = ?"), args.push(input.queueId || null));
  if (input.tags) (sets.push("tags = ?"), args.push(JSON.stringify([...new Set(input.tags.map((x) => clean(x, 30).toLowerCase()).filter(Boolean))].slice(0, 15))));
  if (input.subject) (sets.push("subject = ?"), args.push(clean(input.subject, 160)));
  if (!sets.length) return;
  await run(`UPDATE sup_tickets SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`, ...args, nowIso(), t.id);
  await activity(user.id, t.id, "updated", Object.keys(input).join(", "));
}

// An agent opens a ticket for a phone call, an email or a walk-in, for a customer found or new.
export async function agentCreateTicket(user: AppUser, input: { customerName: string; email?: string | null; phone?: string | null; customerId?: string | null; subject: string; body: string; channel?: string; priority?: Priority; queueId?: string | null; assignToMe?: boolean }) {
  await needAgent(user);
  let customerId = input.customerId ?? null;
  if (!customerId) {
    const email = clean(input.email, 200) || null;
    const phone = clean(input.phone, 40) || null;
    const found = email ? await get<{ id: string }>("SELECT id FROM sup_customers WHERE LOWER(email) = LOWER(?) ORDER BY created_at LIMIT 1", email) : phone ? await get<{ id: string }>("SELECT id FROM sup_customers WHERE phone = ? LIMIT 1", phone) : null;
    customerId = found?.id ?? uid("cus_");
    if (!found) {
      const name = clean(input.customerName, 120);
      if (!name) throw new WorkflowError("VALIDATION", "Give the customer's name.");
      await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)", customerId, `desk_${customerId}`, name, email, phone, nowIso(), nowIso());
    }
  }
  const channel = ["phone", "email", "walk_in", "agent", "social"].includes(input.channel ?? "") ? input.channel! : "phone";
  const id = await createTicketRow({ subject: input.subject, body: input.body, customerId, appId: null, appQueue: null, channel, priority: input.priority, authorKind: "agent", authorId: user.id, queueId: input.queueId ?? undefined, internal: true });
  if (input.assignToMe !== false) await assignTicket(user, id, user.id);
  else await autoAssign(id);
  return id;
}

// --- Saved replies -------------------------------------------------------------

export async function cannedReplies() {
  return all<{ id: string; title: string; body: string }>("SELECT id, title, body FROM sup_canned ORDER BY title");
}
export async function saveCanned(user: AppUser, input: { id?: string | null; title: string; body: string }) {
  await needLead(user);
  const title = clean(input.title, 80);
  const body = clean(input.body, 4000);
  if (!title || !body) throw new WorkflowError("VALIDATION", "Give the title and the text.");
  if (input.id) await run("UPDATE sup_canned SET title = ?, body = ? WHERE id = ?", title, body, input.id);
  else await run("INSERT INTO sup_canned (id, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?)", uid("scn_"), title, body, user.id, nowIso());
}
export async function deleteCanned(user: AppUser, id: string) {
  await needLead(user);
  await run("DELETE FROM sup_canned WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

type CallRow = { id: string; ticket_id: string | null; customer_id: string | null; agent_id: string | null; kind: string; status: string; offer: string | null; answer: string | null; customer_ice: string; agent_ice: string; consent: number; started_at: string; answered_at: string | null; ended_at: string | null };

export async function iceConfig() {
  const { iceServers } = await import("./calls");
  return iceServers();
}

// The customer calls from the widget: a ticket is opened (or the open one used) and the call rings for its agent,
// or for any free agent of the queue.
export async function customerStartCall(app: AppFull, token: string, input: { ticketId?: string | null; offer: string; consent: boolean }) {
  const cfg = await supportConfig();
  const c = await customerByToken(app, token);
  if (cfg.recordCalls && !input.consent) throw new WorkflowError("VALIDATION", "Agree to the call being recorded, or write to us instead.");
  if (!input.offer || input.offer.length > 20000) throw new WorkflowError("VALIDATION", "The call could not start.");
  let ticketId = input.ticketId ?? null;
  if (ticketId) await customerTicket(app, token, ticketId);
  else ticketId = await createTicketRow({ subject: "Call from the app", body: `${c.name} called from ${app.name}.`, customerId: c.id, appId: app.id, appQueue: app.queue_id, channel: "call", authorKind: "customer", authorId: c.id });
  const t = (await get<{ assignee_id: string | null; queue_id: string | null }>("SELECT assignee_id, queue_id FROM sup_tickets WHERE id = ?", ticketId))!;
  // A call is not a new ticket: the ticket's own agent takes it even at their limit of open tickets.
  const avail = await availableAgents(t.queue_id, cfg);
  const agent = t.assignee_id && (await availableAgents(null, cfg, { ignoreLimit: true })).some((a) => a.userId === t.assignee_id) ? t.assignee_id : null;
  if (!agent && !avail.length) {
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 0, ?)", uid("smg_"), ticketId, "No one could take the call right now. Leave a message here and we will answer as soon as we can.", nowIso());
    await autoAssign(ticketId);
    throw new WorkflowError("INVALID_STATE", cfg.awayMessage || "No one can take the call right now. Leave a message and we will answer soon.");
  }
  const id = uid("scl_");
  await run(
    "INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, offer, consent, started_at) VALUES (?, ?, ?, ?, 'inbound', 'web', 'ringing', ?, ?, ?)",
    id,
    ticketId,
    c.id,
    agent,
    input.offer,
    input.consent ? 1 : 0,
    nowIso(),
  );
  await activity(null, ticketId, "call_ringing", `${c.name} is calling`);
  const ring = agent ? [agent] : avail.map((a) => a.userId);
  await notify(ring, { type: "assignment", title: `${c.name} is calling`, body: "Answer in Customer support.", link: `/support?ticket=${ticketId}`, dedupeKey: `sup-call-${id}` }, nowIso());
  return { callId: id, ticketId };
}

async function callFor(id: string) {
  const k = await get<CallRow>("SELECT * FROM sup_calls WHERE id = ?", id);
  if (!k) throw new WorkflowError("NOT_FOUND", "Call not found.");
  return k;
}

// Calls that ring too long are missed: the ticket says so and goes to an agent.
async function expireRinging() {
  const cfg = await supportConfig();
  const old = await all<{ id: string; ticket_id: string | null }>("SELECT id, ticket_id FROM sup_calls WHERE status = 'ringing' AND started_at < ?", new Date(Date.now() - cfg.ringSeconds * 1000).toISOString());
  for (const k of old) {
    await run("UPDATE sup_calls SET status = 'missed', ended_at = ? WHERE id = ? AND status = 'ringing'", nowIso(), k.id);
    if (k.ticket_id) {
      await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 0, ?)", uid("smg_"), k.ticket_id, "Missed call. An agent will get back to you here.", nowIso());
      await activity(null, k.ticket_id, "call_missed");
      await autoAssign(k.ticket_id);
    }
  }
}

export async function customerPollCall(app: AppFull, token: string, callId: string) {
  const c = await customerByToken(app, token);
  await expireRinging();
  const k = await callFor(callId);
  if (k.customer_id !== c.id) throw new WorkflowError("NOT_FOUND", "Call not found.");
  const agent = k.agent_id ? (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", k.agent_id))?.name.split(" ")[0] : null;
  // While it rings: what the caller hears, and their place in line (calls ringing before theirs).
  if (k.status === "ringing") {
    const cfg = await supportConfig();
    const ahead = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_calls WHERE status = 'ringing' AND started_at < ?", k.started_at))?.n ?? 0);
    return { status: k.status, answer: k.answer, ice: parseJson<unknown[]>(k.agent_ice, []), agent, position: ahead + 1, ivr: cfg.ivr.on ? { ...cfg.ivr, audio: cfg.ivr.audio ? `/api/support/ivr-audio` : null } : null };
  }
  return { status: k.status, answer: k.answer, ice: parseJson<unknown[]>(k.agent_ice, []), agent };
}

// The uploaded waiting message, for the widget to play.
export async function ivrAudio() {
  const a = (await supportConfig()).ivr.audio;
  const m = a ? /^data:([^;]+);base64,(.*)$/.exec(a) : null;
  return m ? { mime: m[1]!, data: Buffer.from(m[2]!, "base64") } : null;
}

// ---------------------------------------------------------------------------
// Checking a connected app (Apps and SDK, Test connection; and GET ping for developers)
// ---------------------------------------------------------------------------

export type CheckLine = { label: string; ok: boolean; detail: string };

export async function appChecks(app: { id: string; name: string; active: boolean; origins: string[]; queueId: string | null; verifyIdentity: boolean }): Promise<CheckLine[]> {
  const cfg = await supportConfig();
  const lines: CheckLine[] = [];
  lines.push({ label: "Customer support is on", ok: cfg.enabled, detail: cfg.enabled ? "Customers can reach you." : "Switch it on in Settings." });
  lines.push({ label: "The app is on", ok: app.active, detail: app.active ? "Its key is accepted." : "Its key is refused until it is switched on." });
  lines.push({ label: "Web addresses", ok: true, detail: app.origins.length ? `Browsers may call from ${app.origins.join(", ")}.` : "Any web address may call (fine for testing; set them before going live)." });
  const queue = app.queueId ? (await listQueues()).find((q) => q.id === app.queueId) : null;
  lines.push({ label: "Queue", ok: !app.queueId || !!queue?.active, detail: app.queueId ? (queue ? `${queue.name}, ${queue.members.length} agents` : "The queue was removed.") : "Tickets are routed by keywords and any queue." });
  const online = await availableAgents(app.queueId ?? null, cfg, { ignoreLimit: true });
  lines.push({ label: "Agents online now", ok: online.length > 0, detail: online.length ? `${online.length} can take a ticket or a call.` : "Nobody is online: tickets wait, calls get the away message." });
  const ice = await iceConfig();
  const turn = (ice.iceServers as { urls: string | string[] }[]).some((s) => [s.urls].flat().some((u) => String(u).startsWith("turn")));
  lines.push({ label: "Calls across networks", ok: true, detail: turn ? "A TURN server is set, so calls work behind strict networks." : "Only STUN is set: most calls work; behind strict office networks a TURN server helps (Admin, Calls)." });
  lines.push({ label: "Signed customers", ok: true, detail: app.verifyIdentity ? "The app must sign each customer's id with its secret (hash)." : "Customers are not signed; anyone with the key can say who they are." });
  lines.push({ label: "Waiting message for callers", ok: true, detail: cfg.ivr.on ? (cfg.ivr.audio ? "Plays the uploaded recording." : "Speaks the message, then hold music.") : "Off: callers hear ringing only." });
  return lines;
}

export async function testApp(user: AppUser, id: string) {
  if (!(await isLead(user))) throw new WorkflowError("FORBIDDEN", "Support leads and Admin test apps.");
  const row = (await listApps(user)).find((a) => a.id === id);
  if (!row) throw new WorkflowError("NOT_FOUND", "App not found.");
  const t0 = Date.now();
  const lines = await appChecks(row);
  return { ok: lines.every((l) => l.ok), ms: Date.now() - t0, lines };
}

export async function addIce(side: "customer" | "agent", callId: string, candidate: unknown, who: { customerId?: string; userId?: string }) {
  const k = await callFor(callId);
  if (side === "customer" ? k.customer_id !== who.customerId : k.agent_id !== who.userId) throw new WorkflowError("FORBIDDEN", "Not your call.");
  const col = side === "customer" ? "customer_ice" : "agent_ice";
  const list = parseJson<unknown[]>(side === "customer" ? k.customer_ice : k.agent_ice, []);
  if (list.length >= 60) return;
  list.push(candidate);
  await run(`UPDATE sup_calls SET ${col} = ? WHERE id = ?`, JSON.stringify(list), callId);
}

export async function customerIce(app: AppFull, token: string, callId: string, candidate: unknown) {
  const c = await customerByToken(app, token);
  await addIce("customer", callId, candidate, { customerId: c.id });
}

export async function customerEndCall(app: AppFull, token: string, callId: string) {
  const c = await customerByToken(app, token);
  const k = await callFor(callId);
  if (k.customer_id !== c.id) throw new WorkflowError("NOT_FOUND", "Call not found.");
  await finishCall(k, null);
}

async function finishCall(k: CallRow, by: AppUser | null) {
  if (["ended", "missed", "declined"].includes(k.status)) return;
  const now = nowIso();
  const status = k.status === "ringing" ? (by ? "declined" : "missed") : "ended";
  const dur = k.answered_at ? Math.round((Date.parse(now) - Date.parse(k.answered_at)) / 1000) : null;
  await run("UPDATE sup_calls SET status = ?, ended_at = ?, duration_s = ? WHERE id = ?", status, now, dur, k.id);
  if (k.ticket_id) await activity(by?.id ?? null, k.ticket_id, `call_${status}`, dur !== null ? `${Math.floor(dur / 60)} min ${dur % 60} s` : null);
}

// Calls ringing for this agent (theirs, or for anyone free in their queues).
export async function ringingFor(user: AppUser) {
  if (!(await supportConfig()).enabled) return [];
  await heartbeat(user);
  await expireRinging();
  const qs = await memberQueues(user.id);
  return all<{ id: string; ticket_id: string; customer: string | null; number: number; started_at: string; offer: string; consent: number }>(
    `SELECT k.id, k.ticket_id, c.name AS customer, t.number, k.started_at, k.offer, k.consent FROM sup_calls k JOIN sup_tickets t ON t.id = k.ticket_id LEFT JOIN sup_customers c ON c.id = k.customer_id
     WHERE k.status = 'ringing' AND (k.agent_id = ? ${qs.length ? `OR (k.agent_id IS NULL AND t.queue_id IN (${qs.map(() => "?").join(",")}))` : ""}) ORDER BY k.started_at`,
    user.id,
    ...qs,
  );
}

export async function answerCall(user: AppUser, callId: string, answer: string) {
  await needAgent(user);
  const k = await callFor(callId);
  if (k.status !== "ringing") throw new WorkflowError("INVALID_STATE", k.status === "answered" ? "Someone else answered." : "The call has ended.");
  if (k.agent_id && k.agent_id !== user.id) throw new WorkflowError("FORBIDDEN", "This call rings for another agent.");
  const now = nowIso();
  await run("UPDATE sup_calls SET status = 'answered', agent_id = ?, answer = ?, answered_at = ? WHERE id = ? AND status = 'ringing'", user.id, answer, now, callId);
  const got = await callFor(callId);
  if (got.agent_id !== user.id) throw new WorkflowError("INVALID_STATE", "Someone else answered.");
  if (k.ticket_id) {
    await run("UPDATE sup_tickets SET assignee_id = COALESCE(assignee_id, ?), assigned_at = COALESCE(assigned_at, ?), first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, status = CASE WHEN status = 'new' THEN 'open' ELSE status END, updated_at = ? WHERE id = ?", user.id, now, now, now, now, k.ticket_id);
    await activity(user.id, k.ticket_id, "call_answered");
  }
  return { customerIce: parseJson<unknown[]>(k.customer_ice, []) };
}

export async function agentPollCall(user: AppUser, callId: string) {
  const k = await callFor(callId);
  if (k.agent_id !== user.id) throw new WorkflowError("FORBIDDEN", "Not your call.");
  return { status: k.status, ice: parseJson<unknown[]>(k.customer_ice, []) };
}

export async function agentIce(user: AppUser, callId: string, candidate: unknown) {
  await addIce("agent", callId, candidate, { userId: user.id });
}

export async function agentEndCall(user: AppUser, callId: string, notes?: string | null) {
  const k = await callFor(callId);
  if (k.agent_id && k.agent_id !== user.id && !(await isLead(user))) throw new WorkflowError("FORBIDDEN", "Not your call.");
  await finishCall(k, user);
  if (notes) await run("UPDATE sup_calls SET notes = ? WHERE id = ?", clean(notes, 2000), callId);
}

// A phone call made outside the app (the office phone, a mobile), logged with its length, notes and, when there is
// one, the recording file.
export async function logPhoneCall(user: AppUser, ticketId: string, input: { direction: "inbound" | "outbound"; minutes: number; notes: string }) {
  const t = await canWork(user, ticketId);
  const notes = clean(input.notes, 2000);
  if (!notes) throw new WorkflowError("VALIDATION", "Write what was said.");
  const dur = Math.max(0, Math.min(600, Number(input.minutes) || 0)) * 60;
  const now = nowIso();
  const id = uid("scl_");
  await run(
    "INSERT INTO sup_calls (id, ticket_id, customer_id, agent_id, direction, kind, status, consent, started_at, answered_at, ended_at, duration_s, notes) VALUES (?, ?, ?, ?, ?, 'phone', 'ended', 1, ?, ?, ?, ?, ?)",
    id,
    t.id,
    t.customer_id,
    user.id,
    input.direction === "outbound" ? "outbound" : "inbound",
    new Date(Date.parse(now) - dur * 1000).toISOString(),
    new Date(Date.parse(now) - dur * 1000).toISOString(),
    now,
    Math.round(dur),
    notes,
  );
  await run("UPDATE sup_tickets SET first_response_at = COALESCE(first_response_at, ?), last_agent_at = ?, updated_at = ? WHERE id = ?", now, now, now, t.id);
  await activity(user.id, t.id, "call_logged", `${input.direction === "outbound" ? "Called the customer" : "Customer called"}, ${input.minutes} min`);
  return id;
}

// The recording of a call (from the agent's browser, or a file from the phone system), kept with the ticket.
export async function saveRecording(user: AppUser, callId: string, file: { mime: string; data: Uint8Array }) {
  const cfg = await supportConfig();
  const k = await callFor(callId);
  if (k.agent_id !== user.id && !(await isLead(user, cfg))) throw new WorkflowError("FORBIDDEN", "Not your call.");
  if (!cfg.recordCalls && k.kind !== "phone") throw new WorkflowError("INVALID_STATE", "Call recording is switched off.");
  if (!/^audio\/|^video\/webm/.test(file.mime)) throw new WorkflowError("VALIDATION", "A recording is an audio file.");
  const kind = storageKind();
  const max = kind === "supabase" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.data.byteLength > max) throw new WorkflowError("VALIDATION", `The recording is larger than ${Math.round(max / 1048576)} MB.`);
  const rid = uid("rec_");
  if (kind === "supabase") {
    const url = await signedUploadUrl(`support/${rid}`);
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": file.mime }, body: Buffer.from(file.data) });
    if (!r.ok) throw new WorkflowError("VALIDATION", "Storage refused the recording.");
  } else await run("INSERT INTO sup_blobs (id, data) VALUES (?, ?)", rid, Buffer.from(file.data).toString("base64"));
  await run("UPDATE sup_calls SET recording_id = ?, recording_storage = ?, recording_mime = ?, recording_size = ? WHERE id = ?", rid, kind, file.mime.split(";")[0], file.data.byteLength, callId);
  if (k.ticket_id) await activity(user.id, k.ticket_id, "call_recorded", `${Math.round(file.data.byteLength / 1024)} KB`);
  return rid;
}

// Listening to a recording: support leads and the agent of the call; each listen is logged.
export async function readRecording(user: AppUser, callId: string) {
  const k = await get<{ agent_id: string | null; ticket_id: string | null; recording_id: string | null; recording_storage: string | null; recording_mime: string | null }>("SELECT agent_id, ticket_id, recording_id, recording_storage, recording_mime FROM sup_calls WHERE id = ?", callId);
  if (!k?.recording_id) throw new WorkflowError("NOT_FOUND", "No recording.");
  if (k.agent_id !== user.id && !(await isLead(user))) throw new WorkflowError("FORBIDDEN", "Only the agent of the call and support leads listen to it.");
  await activity(user.id, k.ticket_id, "recording_played");
  if (k.recording_storage === "supabase") return { redirect: await signedReadUrl(`support/${k.recording_id}`, 300), mime: k.recording_mime ?? "audio/webm", data: null };
  const blob = await get<{ data: string }>("SELECT data FROM sup_blobs WHERE id = ?", k.recording_id);
  return { redirect: null, mime: k.recording_mime ?? "audio/webm", data: blob ? Buffer.from(blob.data, "base64") : null };
}

// ---------------------------------------------------------------------------
// Monitoring
// ---------------------------------------------------------------------------

export async function monitor(user: AppUser, range: { from: string; to: string }) {
  const cfg = await needLead(user);
  const from = `${range.from}T00:00:00.000Z`;
  const to = new Date(Date.parse(`${range.to}T00:00:00.000Z`) + 864e5).toISOString();
  const qs = await listQueues();
  const agentIds = [...new Set([...qs.flatMap((q) => q.members), ...cfg.leads])];
  const users = (await listUsers()).filter((u) => agentIds.includes(u.id));
  const statuses = new Map((await all<{ user_id: string; status: string; status_since: string; last_seen_at: string | null; max_open: number }>("SELECT * FROM sup_agents")).map((a) => [a.user_id, a]));
  const since = new Date(Date.now() - ONLINE_MS).toISOString();
  const agents = [];
  for (const u of users) {
    const s = statuses.get(u.id);
    const n = async (sql: string, ...a: Param[]) => Number((await get<{ n: number | null }>(sql, ...a))?.n ?? 0);
    const open = await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE assignee_id = ? AND status IN ('new','open','pending','on_hold')", u.id);
    const solved = await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE assignee_id = ? AND solved_at >= ? AND solved_at < ?", u.id, from, to);
    const replies = await n("SELECT COUNT(*) AS n FROM sup_messages WHERE author_kind = 'agent' AND author_id = ? AND internal = 0 AND created_at >= ? AND created_at < ?", u.id, from, to);
    const firsts = await all<{ c: string; f: string }>("SELECT created_at AS c, first_response_at AS f FROM sup_tickets WHERE assignee_id = ? AND first_response_at IS NOT NULL AND created_at >= ? AND created_at < ?", u.id, from, to);
    const resolves = await all<{ c: string; s: string }>("SELECT created_at AS c, solved_at AS s FROM sup_tickets WHERE assignee_id = ? AND solved_at >= ? AND solved_at < ?", u.id, from, to);
    const calls = await get<{ n: number; s: number | null }>("SELECT COUNT(*) AS n, SUM(duration_s) AS s FROM sup_calls WHERE agent_id = ? AND status = 'ended' AND started_at >= ? AND started_at < ?", u.id, from, to);
    const missed = await n("SELECT COUNT(*) AS n FROM sup_calls k JOIN sup_tickets t ON t.id = k.ticket_id WHERE k.status = 'missed' AND (k.agent_id = ? OR t.assignee_id = ?) AND k.started_at >= ? AND k.started_at < ?", u.id, u.id, from, to);
    const rating = await get<{ a: number | null; n: number }>("SELECT AVG(rating) AS a, COUNT(rating) AS n FROM sup_tickets WHERE assignee_id = ? AND rating IS NOT NULL AND solved_at >= ? AND solved_at < ?", u.id, from, to);
    const breached = await n("SELECT COUNT(*) AS n FROM sup_tickets WHERE assignee_id = ? AND breached = 1 AND created_at >= ? AND created_at < ?", u.id, from, to);
    const last = await get<{ at: string; kind: string }>("SELECT at, kind FROM sup_activity WHERE user_id = ? ORDER BY at DESC LIMIT 1", u.id);
    const avgMin = (xs: { a: string; b: string }[]) => (xs.length ? Math.round(xs.reduce((t, x) => t + (Date.parse(x.b) - Date.parse(x.a)) / 60e3, 0) / xs.length) : null);
    const online = s?.status === "online" && (s.last_seen_at ?? "") >= since;
    agents.push({
      userId: u.id,
      name: u.name,
      status: online ? "online" : s?.status === "away" ? "away" : "offline",
      statusSince: s?.status_since ?? null,
      lastSeen: s?.last_seen_at ?? null,
      maxOpen: Number(s?.max_open ?? 10),
      open,
      solved,
      replies,
      firstResponseMin: avgMin(firsts.map((x) => ({ a: x.c, b: x.f }))),
      resolveMin: avgMin(resolves.map((x) => ({ a: x.c, b: x.s }))),
      calls: Number(calls?.n ?? 0),
      callMin: Math.round(Number(calls?.s ?? 0) / 60),
      missed,
      rating: rating?.a === null || rating?.a === undefined ? null : Math.round(Number(rating.a) * 10) / 10,
      ratings: Number(rating?.n ?? 0),
      breached,
      lastActivity: last ?? null,
    });
  }
  const queues = [];
  for (const q of qs) {
    const w = await get<{ n: number; oldest: string | null }>("SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM sup_tickets WHERE queue_id = ? AND assignee_id IS NULL AND status IN ('new','open')", q.id);
    const open = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM sup_tickets WHERE queue_id = ? AND status NOT IN ('solved','closed')", q.id))?.n ?? 0);
    queues.push({ id: q.id, name: q.name, waiting: Number(w?.n ?? 0), oldestWaitMin: w?.oldest ? Math.round((Date.now() - Date.parse(w.oldest)) / 60e3) : null, open, online: (await availableAgents(q.id, cfg)).length, agents: q.members.length });
  }
  const log = await all<{ at: string; kind: string; detail: string | null; who: string | null; ticket_id: string | null; number: number | null }>(
    "SELECT a.at, a.kind, a.detail, u.name AS who, a.ticket_id, t.number FROM sup_activity a LEFT JOIN users u ON u.id = a.user_id LEFT JOIN sup_tickets t ON t.id = a.ticket_id WHERE a.at >= ? AND a.at < ? AND a.kind <> 'viewed' ORDER BY a.at DESC LIMIT 200",
    from,
    to,
  );
  const recordings = await all<{ id: string; ticket_id: string; number: number; agent: string | null; customer: string | null; started_at: string; duration_s: number | null; recording_size: number | null }>(
    `SELECT k.id, k.ticket_id, t.number, u.name AS agent, c.name AS customer, k.started_at, k.duration_s, k.recording_size FROM sup_calls k JOIN sup_tickets t ON t.id = k.ticket_id
     LEFT JOIN users u ON u.id = k.agent_id LEFT JOIN sup_customers c ON c.id = k.customer_id WHERE k.recording_id IS NOT NULL AND k.started_at >= ? AND k.started_at < ? ORDER BY k.started_at DESC LIMIT 100`,
    from,
    to,
  );
  const totals = await get<{ created: number; solved: number; csat: number | null }>(
    "SELECT (SELECT COUNT(*) FROM sup_tickets WHERE created_at >= ? AND created_at < ?) AS created, (SELECT COUNT(*) FROM sup_tickets WHERE solved_at >= ? AND solved_at < ?) AS solved, (SELECT AVG(rating) FROM sup_tickets WHERE rating IS NOT NULL AND solved_at >= ? AND solved_at < ?) AS csat",
    from,
    to,
    from,
    to,
    from,
    to,
  );
  return { agents, queues, log, recordings, totals: { created: Number(totals?.created ?? 0), solved: Number(totals?.solved ?? 0), csat: totals?.csat === null || totals?.csat === undefined ? null : Math.round(Number(totals.csat) * 10) / 10 } };
}

// ---------------------------------------------------------------------------
// Scheduled checks
// ---------------------------------------------------------------------------

// Targets missed (the assignee and the leads are told, once), solved tickets closed after a while, waiting tickets
// given out, missed calls, and old recordings deleted.
export async function supportChecks(now = nowIso()) {
  const cfg = await supportConfig();
  if (!cfg.enabled) return { breached: 0, closed: 0, assigned: 0 };
  await expireRinging();
  // New mail in the support mailbox becomes tickets or replies.
  if (cfg.mailbox) await (await import("./support-channels")).pollSupportMailbox().catch((e) => console.error("support mailbox", e));
  const late = await all<{ id: string; number: number; subject: string; assignee_id: string | null; first_response_at: string | null }>(
    `SELECT id, number, subject, assignee_id, first_response_at FROM sup_tickets WHERE breached = 0 AND status NOT IN ('solved','closed','pending','on_hold')
     AND ((first_response_at IS NULL AND sla_first_due < ?) OR sla_resolve_due < ?)`,
    now,
    now,
  );
  for (const t of late) {
    await run("UPDATE sup_tickets SET breached = 1 WHERE id = ?", t.id);
    await activity(null, t.id, "breached", t.first_response_at ? "Resolution target missed" : "First response target missed");
    await notify([t.assignee_id, ...cfg.leads], { type: "deadline", title: `#${t.number} missed its target`, body: t.subject, link: `/support?ticket=${t.id}`, dedupeKey: `sup-breach-${t.id}` }, now);
  }
  const old = new Date(Date.parse(now) - cfg.autoCloseDays * 864e5).toISOString();
  const closed = await all<{ id: string }>("SELECT id FROM sup_tickets WHERE status = 'solved' AND solved_at < ?", old);
  for (const c of closed) {
    await run("UPDATE sup_tickets SET status = 'closed', updated_at = ? WHERE id = ?", now, c.id);
    await activity(null, c.id, "status", "solved to closed (automatically)");
  }
  const assigned = await assignWaiting();
  const keep = new Date(Date.parse(now) - cfg.recordingDays * 864e5).toISOString();
  const expired = await all<{ id: string; recording_id: string; recording_storage: string }>("SELECT id, recording_id, recording_storage FROM sup_calls WHERE recording_id IS NOT NULL AND started_at < ?", keep);
  const { deleteStored } = await import("./storage");
  for (const r of expired) {
    if (r.recording_storage === "supabase") await deleteStored({ id: r.recording_id, storage: r.recording_storage, path: `support/${r.recording_id}` }).catch(() => {});
    else await run("DELETE FROM sup_blobs WHERE id = ?", r.recording_id);
    await run("UPDATE sup_calls SET recording_id = NULL, recording_size = NULL WHERE id = ?", r.id);
  }
  return { breached: late.length, closed: closed.length, assigned };
}

// ---------------------------------------------------------------------------
// Payment follow-up (Update 1.0): cases from Chapa payments and Noor invoices
// ---------------------------------------------------------------------------

export const FOLLOWUP_QUEUE = "Payment follow-up";

// The Payment follow-up queue, made on first use. Support leads add its agents in Support setup.
export async function paymentFollowupQueue() {
  const found = await get<{ id: string }>("SELECT id FROM sup_queues WHERE name = ? ORDER BY created_at LIMIT 1", FOLLOWUP_QUEUE);
  if (found) return found.id;
  const id = uid("sq_");
  const sort = Number((await get<{ m: number | null }>("SELECT MAX(sort) AS m FROM sup_queues"))?.m ?? 0) + 1;
  await run(
    "INSERT INTO sup_queues (id, name, description, keywords, members, strategy, sla_first_min, sla_resolve_min, sort, active, created_at) VALUES (?, ?, ?, '[]', '[]', 'least_busy', 240, 2880, ?, 1, ?)",
    id,
    FOLLOWUP_QUEUE,
    "Failed or pending Chapa payments and Noor invoices Finance could not verify: call the customer and help them pay.",
    sort,
    nowIso(),
  );
  return id;
}

// One case per source record. A second send for the same record (or the same customer and source within the
// de-duplicate window) adds a note to the open case instead of opening another.
export async function createFollowupTicket(
  actor: AppUser | null,
  input: { source: "chapa" | "cms_invoice"; sourceRef: string; customerName: string; phone?: string | null; email?: string | null; subject: string; body: string; category?: string; dedupeHours?: number; priority?: Priority; assigneeId?: string | null },
): Promise<{ id: string; number: number; created: boolean }> {
  const phone = clean(input.phone, 40) || null;
  const email = clean(input.email, 200) || null;
  const open = `t.status NOT IN ('solved','closed')`;
  let existing = await get<{ id: string; number: number }>(`SELECT t.id, t.number FROM sup_tickets t WHERE t.source = ? AND t.source_ref = ? AND ${open} LIMIT 1`, input.source, input.sourceRef);
  if (!existing && (phone || email) && input.dedupeHours) {
    const since = new Date(Date.now() - input.dedupeHours * 3600e3).toISOString();
    existing = await get<{ id: string; number: number }>(
      `SELECT t.id, t.number FROM sup_tickets t JOIN sup_customers c ON c.id = t.customer_id WHERE t.source = ? AND ${open} AND t.created_at >= ? AND ((CAST(? AS TEXT) IS NOT NULL AND c.phone = ?) OR (CAST(? AS TEXT) IS NOT NULL AND LOWER(c.email) = LOWER(?))) ORDER BY t.created_at DESC LIMIT 1`,
      input.source, since, phone, phone, email, email,
    );
  }
  if (existing) {
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), existing.id, clean(input.body, 8000), nowIso());
    await run("UPDATE sup_tickets SET updated_at = ? WHERE id = ?", nowIso(), existing.id);
    return { ...existing, created: false };
  }
  const found = phone ? await get<{ id: string }>("SELECT id FROM sup_customers WHERE phone = ? LIMIT 1", phone) : email ? await get<{ id: string }>("SELECT id FROM sup_customers WHERE LOWER(email) = LOWER(?) LIMIT 1", email) : null;
  const customerId = found?.id ?? uid("cus_");
  if (!found) await run("INSERT INTO sup_customers (id, app_id, external_id, name, email, phone, created_at, last_seen_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)", customerId, `pay_${customerId}`, clean(input.customerName, 120) || "Customer", email, phone, nowIso(), nowIso());
  const queueId = await paymentFollowupQueue();
  const id = await createTicketRow({ subject: input.subject, body: input.body, customerId, appId: null, appQueue: null, channel: "agent", priority: input.priority ?? "normal", authorKind: "agent", authorId: actor?.id ?? null, queueId, internal: true });
  await run("UPDATE sup_tickets SET source = ?, source_ref = ?, category = ?, tags = ? WHERE id = ?", input.source, input.sourceRef, input.category ?? "payments", JSON.stringify(["payment-follow-up", input.source]), id);
  if (input.assigneeId) {
    const now = nowIso();
    await run("UPDATE sup_tickets SET assignee_id = ?, assigned_at = ?, status = 'open', updated_at = ? WHERE id = ?", input.assigneeId, now, now, id);
    await notify([input.assigneeId], { type: "assignment", title: "A payment follow-up is yours", body: input.subject, link: `/support?ticket=${id}` }, now, actor?.id);
  } else if (!(await autoAssign(id))) {
    await notify((await supportConfig()).leads, { type: "assignment", title: "Payment follow-up waits: no agent is free", body: input.subject, link: `/support?ticket=${id}`, dedupeKey: `sup-wait-${id}` }, nowIso());
  }
  const number = (await get<{ number: number }>("SELECT number FROM sup_tickets WHERE id = ?", id))!.number;
  return { id, number, created: true };
}

// The customer paid after all: their open follow-up cases close with a note.
export async function closeFollowupsFor(source: "chapa" | "cms_invoice", match: { sourceRef?: string | null; phone?: string | null; email?: string | null }, note: string) {
  const rows = await all<{ id: string }>(
    `SELECT t.id FROM sup_tickets t LEFT JOIN sup_customers c ON c.id = t.customer_id WHERE t.source = ? AND t.status NOT IN ('solved','closed')
       AND ((CAST(? AS TEXT) IS NOT NULL AND t.source_ref = ?) OR (CAST(? AS TEXT) IS NOT NULL AND c.phone = ?) OR (CAST(? AS TEXT) IS NOT NULL AND LOWER(c.email) = LOWER(?)))`,
    source, match.sourceRef ?? null, match.sourceRef ?? null, match.phone ?? null, match.phone ?? null, match.email ?? null, match.email ?? null,
  );
  const now = nowIso();
  for (const r of rows) {
    await run("UPDATE sup_tickets SET status = 'solved', solved_at = ?, updated_at = ? WHERE id = ?", now, now, r.id);
    await run("INSERT INTO sup_messages (id, ticket_id, author_kind, author_id, body, internal, created_at) VALUES (?, ?, 'system', NULL, ?, 1, ?)", uid("smg_"), r.id, note, now);
    await activity(null, r.id, "status", "Closed by the system: the customer paid");
  }
  return rows.length;
}

export async function ticketStatusOf(ids: string[]) {
  if (!ids.length) return {} as Record<string, { number: number; status: string; assignee: string | null }>;
  const rows = await all<{ id: string; number: number; status: string; assignee: string | null }>(`SELECT t.id, t.number, t.status, u.name AS assignee FROM sup_tickets t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.id IN (${ids.map(() => "?").join(",")})`, ...ids);
  return Object.fromEntries(rows.map((r) => [r.id, { number: r.number, status: r.status, assignee: r.assignee }]));
}
