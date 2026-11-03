// Admin, Platform (Phase 28): five pages for running the app.
// - Database: what it is, its size, every table with its rows and size, and a read-only query console;
// - API usage: calls to the app's own APIs (data feeds, the support SDK, Office and document downloads, health,
//   cron) per day and route, with errors and speed, plus calls out to connected platforms, AI use and feed keys;
// - Status and deploys: the running version, build and commit, uptime, where it runs, each part's status, and the
//   history of deploys (noted when a new build starts);
// - Developer integration: the app's APIs with their addresses, sign-in and examples, its own OpenAPI file, and
//   the keys;
// - System health: one score from the checks, memory, load, disk, database latency, queues, jobs, errors, slow
//   pages and failing connections.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, databaseLabel, get, nowIso, run, tx, uid } from "./db";
import { SCHEMA_VERSION, TABLES } from "./schema";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

const need = (u: AppUser) => {
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees the platform pages.");
};
const DAY = 864e5;

// ---------------------------------------------------------------------------
// API usage: recorded by the API routes
// ---------------------------------------------------------------------------

export async function recordApi(route: string, status: number, ms: number) {
  const day = nowIso().slice(0, 10);
  await run(
    `INSERT INTO api_usage (day, route, calls, errors, total_ms, max_ms) VALUES (?, ?, 1, ?, ?, ?)
     ON CONFLICT (day, route) DO UPDATE SET calls = api_usage.calls + 1, errors = api_usage.errors + excluded.errors, total_ms = api_usage.total_ms + excluded.total_ms, max_ms = GREATEST(api_usage.max_ms, excluded.max_ms)`,
    day,
    route.slice(0, 60),
    status >= 400 ? 1 : 0,
    Math.round(ms),
    Math.round(ms),
  ).catch(() => null);
}

// Wraps a route handler: times it and records the result, whatever happens.
export async function tracked(route: string, fn: () => Promise<Response>): Promise<Response> {
  const t0 = Date.now();
  let status = 500;
  try {
    const r = await fn();
    status = r.status;
    return r;
  } finally {
    void recordApi(route, status, Date.now() - t0);
  }
}

export async function apiUsage(user: AppUser, days = 30) {
  need(user);
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const rows = await all<{ day: string; route: string; calls: number; errors: number; total_ms: number; max_ms: number }>("SELECT * FROM api_usage WHERE day >= ? ORDER BY day", since);
  const routes = new Map<string, { route: string; calls: number; errors: number; ms: number; max: number }>();
  for (const r of rows) {
    const x = routes.get(r.route) ?? { route: r.route, calls: 0, errors: 0, ms: 0, max: 0 };
    x.calls += Number(r.calls);
    x.errors += Number(r.errors);
    x.ms += Number(r.total_ms);
    x.max = Math.max(x.max, Number(r.max_ms));
    routes.set(r.route, x);
  }
  const daysList: { day: string; calls: number; errors: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    const on = rows.filter((r) => r.day === d);
    daysList.push({ day: d, calls: on.reduce((s, r) => s + Number(r.calls), 0), errors: on.reduce((s, r) => s + Number(r.errors), 0) });
  }
  const sinceIso = new Date(Date.now() - days * DAY).toISOString();
  const out = await all<{ name: string | null; capability: string; calls: number; failed: number; ms: number }>(
    "SELECT c.name, l.capability, COUNT(*) AS calls, SUM(CASE WHEN l.ok = 1 THEN 0 ELSE 1 END) AS failed, AVG(l.ms) AS ms FROM int_calls l LEFT JOIN int_connectors c ON c.id = l.connector_id WHERE l.at >= ? GROUP BY c.name, l.capability ORDER BY calls DESC",
    sinceIso,
  ).catch(() => []);
  const ai = await all<{ day: string; n: number }>("SELECT SUBSTRING(at, 1, 10) AS day, COUNT(*) AS n FROM assistant_events WHERE event = 'ai' AND at >= ? GROUP BY SUBSTRING(at, 1, 10) ORDER BY day", sinceIso).catch(() => []);
  const keys = await all<{ name: string; prefix: string; last_used_at: string | null; revoked_at: string | null }>("SELECT name, prefix, last_used_at, revoked_at FROM api_tokens ORDER BY last_used_at DESC NULLS LAST").catch(() => []);
  const total = [...routes.values()].reduce((s, r) => s + r.calls, 0);
  const errors = [...routes.values()].reduce((s, r) => s + r.errors, 0);
  return {
    days,
    total,
    errors,
    errorPct: total ? Math.round((errors / total) * 1000) / 10 : 0,
    routes: [...routes.values()].map((r) => ({ ...r, avgMs: r.calls ? Math.round(r.ms / r.calls) : 0 })).sort((a, b) => b.calls - a.calls),
    daily: daysList,
    outbound: out.map((o) => ({ name: o.name ?? "Removed", capability: o.capability, calls: Number(o.calls), failed: Number(o.failed), avgMs: Math.round(Number(o.ms)) })),
    ai: { total: ai.reduce((s, r) => s + Number(r.n), 0), daily: ai.map((r) => ({ day: r.day, n: Number(r.n) })) },
    keys: keys.map((k) => ({ name: k.name, prefix: k.prefix, lastUsedAt: k.last_used_at, revoked: !!k.revoked_at })),
  };
}

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function dirSize(dir: string): number {
  let n = 0;
  try {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
  } catch {
    // Not there.
  }
  return n;
}

export async function databaseInfo(user: AppUser) {
  need(user);
  const t0 = Date.now();
  await get("SELECT 1 AS x");
  const ping = Date.now() - t0;
  const version = (await get<{ v: string }>("SELECT version() AS v").catch(() => null))?.v ?? "PostgreSQL";
  const size = Number((await get<{ s: number }>("SELECT pg_database_size(current_database()) AS s").catch(() => null))?.s ?? 0) || (process.env.DATABASE_URL ? 0 : dirSize(process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pg")));
  const names = (await all<{ name: string }>("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name")).map((r) => r.name);
  const tables: { name: string; rows: number; bytes: number; backedUp: boolean }[] = [];
  for (const n of names) {
    if (!/^[a-z_0-9]+$/.test(n)) continue;
    const rows = Number((await get<{ c: number }>(`SELECT COUNT(*) AS c FROM "${n}"`).catch(() => null))?.c ?? 0);
    const bytes = Number((await get<{ b: number }>("SELECT pg_total_relation_size(?::regclass) AS b", n).catch(() => null))?.b ?? 0);
    tables.push({ name: n, rows, bytes, backedUp: (TABLES as readonly string[]).includes(n) });
  }
  const conns = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM pg_stat_activity").catch(() => null))?.c ?? 1);
  const schema = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'schema_version'"))?.value;
  return {
    label: databaseLabel(),
    kind: process.env.DATABASE_URL ? "PostgreSQL server" : "Embedded PostgreSQL (PGlite)",
    version: version.split(" on ")[0]!.slice(0, 80),
    size,
    ping,
    connections: conns,
    schemaVersion: Number(schema ?? SCHEMA_VERSION),
    expectedSchema: SCHEMA_VERSION,
    tables: tables.sort((a, b) => b.bytes - a.bytes || b.rows - a.rows),
    rows: tables.reduce((s, t) => s + t.rows, 0),
  };
}

// Columns that are never shown in the console: passwords, keys, tokens, sealed secrets and file contents.
const HIDDEN = /(pass|hash|secret|token|_enc$|enc$|^data$|totp|recovery|private|credential|blob)/i;

export async function runQuery(user: AppUser, sql: string) {
  need(user);
  const q = String(sql ?? "").trim().replace(/;+\s*$/, "");
  if (!q) throw new WorkflowError("VALIDATION", "Write a query.");
  if (q.length > 4000) throw new WorkflowError("VALIDATION", "The query is too long.");
  if (!/^(select|with|explain|show|table)\b/i.test(q)) throw new WorkflowError("VALIDATION", "Only reading queries (SELECT, WITH, EXPLAIN, SHOW) run here. Changes go through the app's pages or the Data manager.");
  if (/;/.test(q.replace(/'[^']*'/g, ""))) throw new WorkflowError("VALIDATION", "One query at a time.");
  if (/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|vacuum|call|do|lock|set|reset|refresh|listen|notify|pg_sleep|lo_import|lo_export|pg_read_file|pg_write)\b/i.test(q.replace(/'[^']*'/g, ""))) throw new WorkflowError("VALIDATION", "That query would change something or reach outside the database.");
  const t0 = Date.now();
  const rows = await tx(async () => {
    await run("SET TRANSACTION READ ONLY");
    await run("SET LOCAL statement_timeout = 5000").catch(() => null);
    // EXPLAIN and SHOW cannot be wrapped in a SELECT.
    return /^(explain|show)/i.test(q) ? all<Record<string, unknown>>(q) : all<Record<string, unknown>>(`SELECT * FROM (${q}) AS q LIMIT 501`);
  }).catch((e) => {
    throw new WorkflowError("VALIDATION", e instanceof Error ? e.message.slice(0, 300) : "The query failed.");
  });
  const cols = Object.keys(rows[0] ?? {});
  const hidden = cols.filter((c) => HIDDEN.test(c));
  await audit({ actor: user }, { action: "platform.query", summary: `${user.name} ran a read-only query: ${q.slice(0, 160)}` });
  return {
    columns: cols,
    hidden,
    rows: rows.slice(0, 500).map((r) => cols.map((c) => (hidden.includes(c) ? "•••" : r[c] === null || r[c] === undefined ? null : typeof r[c] === "object" ? JSON.stringify(r[c]).slice(0, 300) : String(r[c]).slice(0, 300)))),
    more: rows.length > 500,
    ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// Status and deploys
// ---------------------------------------------------------------------------

function readFile(p: string) {
  try {
    return fs.readFileSync(p, "utf8").trim();
  } catch {
    return null;
  }
}
export function buildInfo() {
  const root = process.cwd();
  const pkg = JSON.parse(readFile(path.join(root, "package.json")) ?? "{}") as { version?: string; dependencies?: Record<string, string> };
  let commit = process.env.VERCEL_GIT_COMMIT_SHA || process.env.RENDER_GIT_COMMIT || process.env.COMMIT_REF || process.env.SOURCE_VERSION || process.env.GIT_COMMIT || null;
  let message: string | null = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null;
  if (!commit) {
    const head = readFile(path.join(root, ".git", "HEAD"));
    const ref = head?.startsWith("ref:") ? head.slice(5).trim() : null;
    commit = ref ? (readFile(path.join(root, ".git", ref)) ?? readFile(path.join(root, ".git", "packed-refs"))?.split("\n").find((l) => l.endsWith(ref))?.split(" ")[0] ?? null) : head;
  }
  if (!message && commit) message = null;
  const host = process.env.VERCEL ? "Vercel" : process.env.NETLIFY ? "Netlify" : process.env.RENDER ? "Render" : process.env.FLY_APP_NAME ? "Fly.io" : process.env.RAILWAY_ENVIRONMENT ? "Railway" : "Own server";
  return {
    version: pkg.version ?? "0.0.0",
    build: readFile(path.join(root, ".next", "BUILD_ID")) ?? "development",
    commit: commit ? commit.slice(0, 40) : null,
    message,
    next: pkg.dependencies?.next?.replace(/^[\^~]/, "") ?? "",
    node: process.version,
    env: process.env.NODE_ENV ?? "development",
    host,
  };
}

const g = globalThis as unknown as { __myseedStart?: string; __myseedNoted?: boolean };
g.__myseedStart ??= new Date().toISOString();

// A new build starting is a deploy: kept once per build.
export async function noteDeploy() {
  if (g.__myseedNoted) return;
  g.__myseedNoted = true;
  const b = buildInfo();
  const last = await get<{ build: string; commit_sha: string | null }>("SELECT build, commit_sha FROM sys_deploys ORDER BY started_at DESC LIMIT 1").catch(() => undefined);
  if (last && last.build === b.build && last.commit_sha === b.commit) return;
  await run("INSERT INTO sys_deploys (id, version, build, commit_sha, message, host, node, started_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("dep_"), b.version, b.build, b.commit, b.message, b.host, b.node, g.__myseedStart!).catch(() => null);
}

export async function statusInfo(user: AppUser) {
  need(user);
  await noteDeploy();
  const b = buildInfo();
  const { healthChecks } = await import("./ops");
  const checks = await healthChecks();
  const { aiConfig } = await import("./assistant-ai");
  const ai = await aiConfig().catch(() => null);
  const conns = await all<{ name: string; capability: string; status: string }>("SELECT name, capability, status FROM int_connectors WHERE status = 'active'").catch(() => []);
  const failing = await all<{ name: string | null; n: number }>("SELECT c.name, COUNT(*) AS n FROM int_calls l LEFT JOIN int_connectors c ON c.id = l.connector_id WHERE l.ok = 0 AND l.at >= ? GROUP BY c.name", new Date(Date.now() - DAY).toISOString()).catch(() => []);
  const parts = [
    ...checks.map((c) => ({ key: c.key, label: c.label, state: c.state, text: c.text })),
    { key: "ai", label: "AI assistant", state: (ai?.on ? (ai.hasKey || ai.envKey || ai.fake ? "ok" : "warn") : "ok") as "ok" | "warn" | "bad", text: ai?.on ? `On (${ai.model})` : "Off" },
    ...conns.map((c) => ({ key: `con:${c.name}`, label: `${c.name} (${c.capability})`, state: (failing.some((f) => f.name === c.name) ? "warn" : "ok") as "ok" | "warn" | "bad", text: failing.find((f) => f.name === c.name) ? `${failing.find((f) => f.name === c.name)!.n} failed calls in a day` : "Working" })),
  ];
  const incidents = await all<{ day: string; kinds: number; times: number }>("SELECT SUBSTRING(last_at, 1, 10) AS day, COUNT(*) AS kinds, SUM(count) AS times FROM error_events WHERE last_at >= ? GROUP BY SUBSTRING(last_at, 1, 10) ORDER BY day DESC", new Date(Date.now() - 14 * DAY).toISOString()).catch(() => []);
  const deploys = await all<{ id: string; version: string; build: string; commit_sha: string | null; message: string | null; host: string; node: string; started_at: string }>("SELECT * FROM sys_deploys ORDER BY started_at DESC LIMIT 30").catch(() => []);
  const overall = parts.some((p) => p.state === "bad") ? "bad" : parts.some((p) => p.state === "warn") ? "warn" : "ok";
  return { build: b, startedAt: g.__myseedStart!, uptimeSec: Math.round(process.uptime()), overall, parts, incidents: incidents.map((i) => ({ day: i.day, kinds: Number(i.kinds), times: Number(i.times) })), deploys: deploys.map((d) => ({ id: d.id, version: d.version, build: d.build, commit: d.commit_sha, message: d.message, host: d.host, node: d.node, at: d.started_at })) };
}

// ---------------------------------------------------------------------------
// Developer integration
// ---------------------------------------------------------------------------

export async function openApiDoc(origin: string) {
  const { DATASETS } = await import("./feeds");
  const paths: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(DATASETS))
    paths[`/api/feeds/${k}`] = { get: { operationId: `feed_${k}`, summary: v.label, tags: ["Data feeds"], security: [{ feedKey: [] }, { feedQuery: [] }], parameters: [{ name: "format", in: "query", schema: { type: "string", enum: ["json", "csv"] } }], responses: { 200: { description: "Rows", content: { "application/json": { schema: { type: "array", items: { type: "object" } } }, "text/csv": {} } }, 401: { description: "Key missing, revoked, or not for this dataset" } } } };
  const sup = (op: string, summary: string, body?: Record<string, unknown>, method = "post") => ({ [method]: { operationId: op, summary, tags: ["Customer support SDK"], security: [{ appKey: [] }], ...(body ? { requestBody: { content: { "application/json": { schema: { type: "object", properties: body } } } } } : {}), responses: { 200: { description: "OK" } } } });
  paths["/api/support/v1/identify"] = sup("supportIdentify", "Identify the customer; returns their token", { id: { type: "string" }, name: { type: "string" }, email: { type: "string" }, phone: { type: "string" }, hash: { type: "string", description: "HMAC of the id with the app secret, when identity is verified" } });
  paths["/api/support/v1/tickets"] = { ...sup("supportTickets", "The customer's conversations", undefined, "get"), ...sup("supportNewTicket", "Start a conversation", { subject: { type: "string" }, message: { type: "string" }, priority: { type: "string" } }) };
  paths["/api/support/v1/tickets/{id}/messages"] = { ...sup("supportMessages", "Messages of a conversation", undefined, "get"), ...sup("supportReply", "Reply", { body: { type: "string" } }) };
  paths["/api/support/v1/articles"] = sup("supportArticles", "Help articles matching ?q=", undefined, "get");
  paths["/api/health"] = { get: { operationId: "health", summary: "200 when the app and its database answer", tags: ["Operations"], responses: { 200: { description: "Up" }, 503: { description: "Down" } } } };
  paths["/api/cron/checks"] = { get: { operationId: "cron", summary: "Run the scheduled jobs (Authorization: Bearer CRON_SECRET)", tags: ["Operations"], security: [{ cron: [] }], responses: { 200: { description: "Ran" } } } };
  return {
    openapi: "3.0.3",
    info: { title: "Myseed work app API", version: buildInfo().version, description: "Data feeds for Power BI, Excel and other tools; the customer support SDK; operations. Keys are made in Admin, Integrations." },
    servers: [{ url: origin }],
    components: { securitySchemes: { feedKey: { type: "http", scheme: "bearer", description: "A data feed key (msk_…)" }, feedQuery: { type: "apiKey", in: "query", name: "key" }, appKey: { type: "apiKey", in: "header", name: "X-App-Key" }, cron: { type: "http", scheme: "bearer" } } },
    paths,
  };
}

export async function developerInfo(user: AppUser, origin: string) {
  need(user);
  const spec = await openApiDoc(origin);
  const { listTokens } = await import("./feeds");
  const apps = await all<{ name: string; public_key: string; active: number }>("SELECT name, public_key, active FROM sup_apps ORDER BY name").catch(() => []);
  return {
    origin,
    endpoints: Object.entries(spec.paths).flatMap(([p, ops]) => Object.entries(ops as Record<string, { summary: string; tags: string[] }>).map(([m, o]) => ({ method: m.toUpperCase(), path: p, summary: o.summary, group: o.tags[0] ?? "" }))),
    keys: (await listTokens(user)).map((k) => ({ name: k.name, prefix: k.prefix, datasets: k.datasets, lastUsedAt: k.lastUsedAt, revoked: !!k.revokedAt })),
    apps: apps.map((a) => ({ name: a.name, key: a.public_key, active: !!Number(a.active) })),
    webhooks: (await all<{ name: string; status: string }>("SELECT name, status FROM int_connectors WHERE capability = 'webhook'").catch(() => [])),
  };
}

// ---------------------------------------------------------------------------
// System health
// ---------------------------------------------------------------------------

export async function systemHealth(user: AppUser) {
  need(user);
  const { healthChecks, jobStatus } = await import("./ops");
  const checks = await healthChecks();
  const pings: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = performance.now();
    await get("SELECT 1 AS x");
    pings.push(performance.now() - t);
  }
  pings.sort((a, b) => a - b);
  const mem = process.memoryUsage();
  let disk: { free: number; total: number } | null = null;
  try {
    const s = fs.statfsSync(process.cwd());
    disk = { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
  } catch {
    disk = null;
  }
  const dayAgo = new Date(Date.now() - DAY).toISOString();
  const outbox = await get<{ queued: number; failed: number }>("SELECT SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued, SUM(CASE WHEN status = 'failed' AND created_at >= ? THEN 1 ELSE 0 END) AS failed FROM email_outbox", dayAgo).catch(() => null);
  const errors = await get<{ n: number }>("SELECT COALESCE(SUM(count), 0) AS n FROM error_events WHERE last_at >= ? AND resolved_at IS NULL", dayAgo).catch(() => null);
  const calls = await get<{ n: number; bad: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN ok = 1 THEN 0 ELSE 1 END) AS bad FROM int_calls WHERE at >= ?", dayAgo).catch(() => null);
  const api = await get<{ n: number; bad: number; ms: number }>("SELECT SUM(calls) AS n, SUM(errors) AS bad, SUM(total_ms) AS ms FROM api_usage WHERE day >= ?", dayAgo.slice(0, 10)).catch(() => null);
  const slow = await all<{ section: string; avg: number; samples: number }>("SELECT section, SUM(total_ms) / GREATEST(SUM(samples), 1) AS avg, SUM(samples) AS samples FROM page_timings WHERE day >= ? GROUP BY section ORDER BY avg DESC LIMIT 5", new Date(Date.now() - 7 * DAY).toISOString().slice(0, 10)).catch(() => []);
  const jobs = await jobStatus();
  const metrics = {
    dbP50: Math.round(pings[2]! * 10) / 10,
    dbMax: Math.round(pings[4]! * 10) / 10,
    rssMb: Math.round(mem.rss / 1048576),
    heapMb: Math.round(mem.heapUsed / 1048576),
    heapTotalMb: Math.round(mem.heapTotal / 1048576),
    totalMemMb: Math.round(os.totalmem() / 1048576),
    freeMemMb: Math.round(os.freemem() / 1048576),
    load: os.loadavg().map((x) => Math.round(x * 100) / 100),
    cpus: os.cpus().length,
    disk,
    uptimeSec: Math.round(process.uptime()),
    outboxQueued: Number(outbox?.queued ?? 0),
    emailsFailed: Number(outbox?.failed ?? 0),
    errors24h: Number(errors?.n ?? 0),
    connectorCalls: Number(calls?.n ?? 0),
    connectorFailed: Number(calls?.bad ?? 0),
    apiCalls: Number(api?.n ?? 0),
    apiErrors: Number(api?.bad ?? 0),
    apiAvgMs: api?.n ? Math.round(Number(api.ms) / Number(api.n)) : 0,
    jobsFailing: jobs.jobs.filter((j) => !j.ok).map((j) => j.label),
    jobsLate: jobs.late,
  };
  // A score out of 100: each check and measure takes points off when it is not well.
  const extra: { key: string; label: string; state: "ok" | "warn" | "bad"; text: string }[] = [
    { key: "dbspeed", label: "Database speed", state: metrics.dbP50 > 200 ? "bad" : metrics.dbP50 > 50 ? "warn" : "ok", text: `${metrics.dbP50} ms typical, ${metrics.dbMax} ms slowest of 5` },
    { key: "memory", label: "Memory", state: metrics.freeMemMb < 200 ? "bad" : metrics.freeMemMb < 500 ? "warn" : "ok", text: `${metrics.rssMb} MB used by the app, ${metrics.freeMemMb} MB free of ${metrics.totalMemMb} MB` },
    { key: "disk", label: "Disk", state: !disk ? "ok" : disk.free < 1e9 ? "bad" : disk.free < 5e9 ? "warn" : "ok", text: disk ? `${(disk.free / 1e9).toFixed(1)} GB free of ${(disk.total / 1e9).toFixed(0)} GB` : "Not readable here" },
    { key: "load", label: "Processor load", state: metrics.load[0]! > metrics.cpus * 1.5 ? "bad" : metrics.load[0]! > metrics.cpus ? "warn" : "ok", text: `${metrics.load.join(" / ")} (1, 5, 15 minutes) on ${metrics.cpus} cores` },
    { key: "mail", label: "Email queue", state: metrics.emailsFailed > 5 ? "bad" : metrics.emailsFailed || metrics.outboxQueued > 50 ? "warn" : "ok", text: `${metrics.outboxQueued} waiting, ${metrics.emailsFailed} failed in a day` },
    { key: "connections", label: "Connected platforms", state: metrics.connectorCalls && metrics.connectorFailed / metrics.connectorCalls > 0.2 ? "bad" : metrics.connectorFailed ? "warn" : "ok", text: `${metrics.connectorCalls} calls in a day, ${metrics.connectorFailed} failed` },
    { key: "api", label: "App's APIs", state: metrics.apiCalls && metrics.apiErrors / metrics.apiCalls > 0.1 ? "warn" : "ok", text: `${metrics.apiCalls} calls in a day, ${metrics.apiErrors} errors, ${metrics.apiAvgMs} ms on average` },
  ];
  const all_ = [...checks, ...extra];
  const score = Math.max(0, 100 - all_.reduce((s, c) => s + (c.state === "bad" ? 15 : c.state === "warn" ? 4 : 0), 0));
  return { score, state: score >= 85 ? "ok" : score >= 60 ? "warn" : "bad", checks: all_, metrics, slow: slow.map((s) => ({ section: s.section, avgMs: Math.round(Number(s.avg)), samples: Number(s.samples) })), at: nowIso() };
}
