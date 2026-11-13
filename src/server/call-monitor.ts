import { all, get, nowIso, run, uid } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// The callback and API call monitor (Update 1.0, phase 7). Every outgoing call to a provider and every incoming
// webhook is one row in int_calls: its source (chapa, telegram, sms, email, ai, noor, connector), direction, status,
// time taken and a summary without secrets. Admin sets when failures raise an alert.

export const SOURCES = [
  { key: "chapa", label: "Chapa payments" },
  { key: "sms", label: "SMS" },
  { key: "email", label: "Email" },
  { key: "ai", label: "AI" },
  { key: "telegram", label: "Telegram" },
  { key: "noor", label: "Noor CMS" },
  { key: "payment", label: "Payment connectors" },
  { key: "connector", label: "Other connectors" },
  { key: "systems", label: "Connected systems" },
] as const;
export type Source = (typeof SOURCES)[number]["key"];
export const sourceLabel = (s: string) => SOURCES.find((x) => x.key === s)?.label ?? s;

export type CallInput = {
  source: Source | string;
  direction?: "out" | "in";
  ok: boolean;
  status?: number;
  ms?: number;
  summary: string;
  error?: string | null;
  ref?: string | null;
  connectorId?: string | null;
  test?: boolean;
  tokensIn?: number | null;
  tokensOut?: number | null;
  cost?: number | null;
};

// Addresses lose their query string (keys such as Gemini's ride there) and are kept short.
export function safeUrl(u: string | URL) {
  try {
    const x = new URL(String(u));
    // Telegram carries the bot token in the path (/bot<token>/sendMessage, /file/bot<token>/…).
    return `${x.host}${x.pathname.replace(/\/bot[^/]+/g, "/bot…")}`.slice(0, 160);
  } catch {
    return String(u).split("?")[0].replace(/\/bot[^/]+/g, "/bot…").slice(0, 160);
  }
}

export async function recordCall(c: CallInput) {
  try {
    await run(
      "INSERT INTO int_calls (id, connector_id, capability, ok, status, ms, summary, error, test, at, source, direction, ref, tokens_in, tokens_out, cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      uid("icl_"),
      c.connectorId ?? null,
      c.source,
      c.ok ? 1 : 0,
      c.status ?? 0,
      Math.round(c.ms ?? 0),
      c.summary.slice(0, 300),
      c.error ? String(c.error).slice(0, 300) : null,
      c.test ? 1 : 0,
      nowIso(),
      c.source,
      c.direction ?? "out",
      c.ref ? String(c.ref).slice(0, 120) : null,
      c.tokensIn ?? null,
      c.tokensOut ?? null,
      c.cost ?? null,
    );
    if (!c.ok && !c.test) await checkAlert(c.source);
  } catch {
    // The monitor never breaks the call it watches.
  }
}

// fetch with the call recorded. The response is returned untouched.
export async function trackedFetch(source: Source | string, input: string | URL, init?: RequestInit, opts: { summary?: string; ref?: string | null; okIf?: (r: Response) => boolean } = {}) {
  const t0 = Date.now();
  const label = `${init?.method ?? "GET"} ${safeUrl(input)}`;
  try {
    const res = await fetch(input, init);
    const ok = opts.okIf ? opts.okIf(res) : res.ok;
    await recordCall({ source, ok, status: res.status, ms: Date.now() - t0, summary: opts.summary ? `${opts.summary} · ${label}` : label, error: ok ? null : `HTTP ${res.status}`, ref: opts.ref });
    return res;
  } catch (e) {
    await recordCall({ source, ok: false, status: 0, ms: Date.now() - t0, summary: opts.summary ? `${opts.summary} · ${label}` : label, error: e instanceof Error ? e.message : String(e), ref: opts.ref });
    throw e;
  }
}

export async function recordIncoming(source: Source | string, input: { ok: boolean; status?: number; summary: string; error?: string | null; ref?: string | null; ms?: number }) {
  await recordCall({ source, direction: "in", ...input });
}

// Alerts: when, in the last windowMin minutes, a source had at least minCalls calls and failurePct of them failed.
export type AlertRules = { on: boolean; failurePct: number; minCalls: number; windowMin: number };
const DEFAULT_ALERTS: AlertRules = { on: true, failurePct: 25, minCalls: 5, windowMin: 60 };

export async function alertRules(): Promise<AlertRules> {
  try {
    const v = JSON.parse((await getMeta("monitor.alerts")) ?? "{}") as Partial<AlertRules>;
    const n = (x: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Math.min(hi, Math.max(lo, Math.round(Number(x)))) : d);
    return { on: v.on !== false, failurePct: n(v.failurePct, DEFAULT_ALERTS.failurePct, 1, 100), minCalls: n(v.minCalls, DEFAULT_ALERTS.minCalls, 1, 1000), windowMin: n(v.windowMin, DEFAULT_ALERTS.windowMin, 5, 1440) };
  } catch {
    return DEFAULT_ALERTS;
  }
}

export async function saveAlertRules(user: AppUser, input: Partial<AlertRules>) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets monitor alerts.");
  await setMeta("monitor.alerts", JSON.stringify({ ...(await alertRules()), ...input }));
  const r = await alertRules();
  await audit({ actor: user }, { action: "settings.monitor", summary: `${user.name} set monitor alerts: ${r.on ? `${r.failurePct}% failures of at least ${r.minCalls} calls in ${r.windowMin} minutes` : "off"}` });
  return r;
}

async function checkAlert(source: string) {
  const r = await alertRules();
  if (!r.on) return;
  const since = new Date(Date.now() - r.windowMin * 60e3).toISOString();
  const s = await get<{ calls: number; fails: number }>("SELECT COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fails FROM int_calls WHERE source = ? AND test = 0 AND at >= ?", source, since);
  const calls = Number(s?.calls ?? 0);
  const fails = Number(s?.fails ?? 0);
  if (calls < r.minCalls || (fails / calls) * 100 < r.failurePct) return;
  // One alert per source per window.
  if (await get("SELECT 1 FROM int_alerts WHERE source = ? AND at >= ?", source, since)) return;
  await run("INSERT INTO int_alerts (id, source, calls, failures, window_min, at) VALUES (?, ?, ?, ?, ?, ?)", uid("ial_"), source, calls, fails, r.windowMin, nowIso());
  const { notify } = await import("./notifications");
  const admins = (await all<{ user_id: string }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.active = 1")).map((x) => x.user_id);
  await notify(admins, { type: "failure", title: `${sourceLabel(source)} is failing`, body: `${fails} of ${calls} calls failed in the last ${r.windowMin} minutes.`, link: `/admin/integrations?tab=monitor&source=${source}`, dedupeKey: `monitor:${source}:${since.slice(0, 13)}` }, nowIso());
}

// What the monitor page shows.
export type MonitorFilter = { source?: string | null; direction?: string | null; failed?: boolean; q?: string | null; hours?: number };

export async function monitorData(user: AppUser, f: MonitorFilter = {}) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees the call monitor.");
  const hours = Math.max(1, Math.min(24 * 30, f.hours ?? 24));
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const where = ["l.at >= ?"];
  const params: (string | number)[] = [since];
  if (f.source) where.push("COALESCE(l.source, l.capability) = ?"), params.push(f.source);
  if (f.direction === "in" || f.direction === "out") where.push("l.direction = ?"), params.push(f.direction);
  if (f.failed) where.push("l.ok = 0");
  if (f.q?.trim()) where.push("(l.summary ILIKE ? OR COALESCE(l.error, '') ILIKE ? OR COALESCE(l.ref, '') ILIKE ?)"), params.push(...Array(3).fill(`%${f.q.trim()}%`));
  const rows = await all<{ id: string; source: string; direction: string; ok: number; status: number; ms: number; summary: string; error: string | null; ref: string | null; test: number; at: string; name: string | null; tokens_in: number | null; tokens_out: number | null; cost: number | null }>(
    `SELECT l.id, COALESCE(l.source, l.capability) AS source, l.direction, l.ok, l.status, l.ms, l.summary, l.error, l.ref, l.test, l.at, c.name, l.tokens_in, l.tokens_out, l.cost
     FROM int_calls l LEFT JOIN int_connectors c ON c.id = l.connector_id WHERE ${where.join(" AND ")} ORDER BY l.at DESC LIMIT 300`,
    ...params,
  );
  const stats = await sourceStats(hours);
  // Calls and failures per hour (or per day past three days), for the chart.
  const bucketH = hours > 72 ? 24 : 1;
  const all_ = await all<{ at: string; ok: number }>(`SELECT l.at, l.ok FROM int_calls l WHERE ${where.filter((w) => w !== "l.ok = 0").join(" AND ")} AND l.test = 0`, ...params);
  const buckets = Math.ceil(hours / bucketH);
  const start = Date.now() - buckets * bucketH * 3600e3;
  const series = Array.from({ length: buckets }, (_, i) => ({ at: new Date(start + i * bucketH * 3600e3).toISOString(), calls: 0, failures: 0 }));
  for (const r of all_) {
    const i = Math.floor((Date.parse(r.at) - start) / (bucketH * 3600e3));
    if (i >= 0 && i < buckets) {
      series[i].calls++;
      if (!r.ok) series[i].failures++;
    }
  }
  const alerts = await all<{ id: string; source: string; calls: number; failures: number; window_min: number; at: string }>("SELECT * FROM int_alerts ORDER BY at DESC LIMIT 20");
  return { hours, bucketH, rows, stats, series, alerts, rules: await alertRules() };
}

export type SourceStat = { source: string; calls: number; failures: number; failurePct: number; avgMs: number; lastAt: string | null; lastIn: string | null; lastError: string | null };

export async function sourceStats(hours = 24): Promise<SourceStat[]> {
  const since = new Date(Date.now() - hours * 3600e3).toISOString();
  const rows = await all<{ source: string; calls: number; fails: number; avg_ms: number; last_at: string | null; last_in: string | null }>(
    `SELECT COALESCE(source, capability) AS source, COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fails, AVG(ms) AS avg_ms, MAX(at) AS last_at,
       MAX(CASE WHEN direction = 'in' THEN at END) AS last_in
     FROM int_calls WHERE at >= ? AND test = 0 GROUP BY COALESCE(source, capability)`,
    since,
  );
  const out: SourceStat[] = [];
  for (const r of rows) {
    const err = await get<{ error: string | null }>("SELECT error FROM int_calls WHERE COALESCE(source, capability) = ? AND ok = 0 ORDER BY at DESC LIMIT 1", r.source);
    const calls = Number(r.calls);
    const failures = Number(r.fails ?? 0);
    out.push({ source: r.source, calls, failures, failurePct: calls ? Math.round((failures / calls) * 1000) / 10 : 0, avgMs: Math.round(Number(r.avg_ms ?? 0)), lastAt: r.last_at, lastIn: r.last_in, lastError: err?.error ?? null });
  }
  return out.sort((a, b) => b.calls - a.calls);
}
