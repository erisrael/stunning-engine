// Running the system: scheduled jobs and their last results, errors from the server and the browser (kept in the
// app, no outside service), alerts to Admin (in the app, by email, optionally Telegram) and a health summary.
// Shown in Admin, System.

import crypto from "node:crypto";
import os from "node:os";
import { all, databaseLabel, get, nowIso, parseJson, run, uid } from "./db";
import { seal, secretSource, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { notify, usersWithRole } from "./notifications";
import { sendSystemEmail, smtpSettings } from "./email";
import { getMeta, getSettings } from "./settings";
import { storageKind } from "./storage";
import { googleConfig } from "./password-reset";

// ---------------------------------------------------------------------------
// Settings (Admin, System)
// ---------------------------------------------------------------------------

export type OpsConfig = {
  alerts: { email: boolean; emailTo: string[]; telegramChatId: string; hasTelegram: boolean };
  keep: { errorsDays: number; signinLogDays: number };
};
type OpsStored = OpsConfig & { telegramTokenEnc?: string };

const DEFAULT_OPS: OpsConfig = { alerts: { email: true, emailTo: [], telegramChatId: "", hasTelegram: false }, keep: { errorsDays: 90, signinLogDays: 365 } };

async function loadOps(): Promise<OpsStored> {
  const s = parseJson<Partial<OpsStored> | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.ops'"))?.value, null) ?? {};
  return {
    alerts: { ...DEFAULT_OPS.alerts, ...(s.alerts ?? {}), hasTelegram: !!s.telegramTokenEnc },
    keep: { ...DEFAULT_OPS.keep, ...(s.keep ?? {}) },
    telegramTokenEnc: s.telegramTokenEnc,
  };
}

export async function opsConfig(): Promise<OpsConfig> {
  const { telegramTokenEnc: _t, ...rest } = await loadOps();
  void _t;
  return rest;
}

export async function saveOpsConfig(user: AppUser, input: OpsConfig & { telegramToken?: string | null }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes system settings.");
  const old = await loadOps();
  const emailTo = input.alerts.emailTo.map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emailTo.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) throw new WorkflowError("VALIDATION", "One of the alert emails is not valid.");
  const chat = input.alerts.telegramChatId.trim();
  if (chat && !/^-?\d{3,20}$|^@[A-Za-z0-9_]{4,}$/.test(chat)) throw new WorkflowError("VALIDATION", "The Telegram chat ID is a number (for example -1001234567890) or @channelname.");
  const token = input.telegramToken === null ? undefined : input.telegramToken?.trim() ? await seal(input.telegramToken.trim()) : old.telegramTokenEnc;
  if (input.telegramToken?.trim() && !/^\d+:[A-Za-z0-9_-]{30,}$/.test(input.telegramToken.trim())) throw new WorkflowError("VALIDATION", "That does not look like a Telegram bot token (from @BotFather, like 123456:ABC...).");
  const value: OpsStored = {
    alerts: { email: !!input.alerts.email, emailTo, telegramChatId: chat, hasTelegram: false },
    keep: { errorsDays: Math.min(730, Math.max(7, Math.round(input.keep.errorsDays || 90))), signinLogDays: Math.min(3650, Math.max(30, Math.round(input.keep.signinLogDays || 365))) },
    telegramTokenEnc: token,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.ops', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(value),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.ops", summary: `${user.name} changed system alerts` });
}

// ---------------------------------------------------------------------------
// Alerts to Admin
// ---------------------------------------------------------------------------

async function telegram(text: string) {
  const o = await loadOps();
  if (!o.telegramTokenEnc || !o.alerts.telegramChatId) return false;
  const token = await unseal(o.telegramTokenEnc);
  if (!token) return false;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: o.alerts.telegramChatId, text: text.slice(0, 3900), disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  return !!res?.ok;
}

// Something Admin must know about: in the app always; by email and Telegram when set up. Never throws.
export async function alertAdmins(title: string, body: string, link = "/admin?tab=system", groupKey?: string) {
  try {
    const admins = await usersWithRole("admin");
    await notify(admins, { type: "failure", title, body: body.slice(0, 300), link, groupKey }, nowIso());
    const o = await loadOps();
    const ws = (await getSettings()).workspace.name;
    if (o.alerts.email && (await smtpSettings()).source !== "none") {
      const to = o.alerts.emailTo.length ? o.alerts.emailTo : (await all<{ email: string }>("SELECT email FROM users WHERE active = 1 AND id IN (SELECT user_id FROM role_assignments WHERE role = 'admin')")).map((r) => r.email);
      for (const addr of to) await sendSystemEmail(addr, `${ws}: ${title}`, `${body}\n\nOpen Admin, System: ${process.env.APP_URL ?? ""}${link}`).catch(() => null);
    }
    await telegram(`${ws}: ${title}\n${body}`);
  } catch (e) {
    console.error("Alert to Admin failed", e);
  }
}

export async function testAlert(user: AppUser) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sends test alerts.");
  const ws = (await getSettings()).workspace.name;
  const tg = await telegram(`${ws}: test alert from ${user.name}. Alerts reach this chat.`);
  await notify([user.id], { type: "failure", title: "Test alert", body: "Alerts reach you in the app.", link: "/admin?tab=system" }, nowIso());
  const o = await loadOps();
  let mailed = false;
  if (o.alerts.email && (await smtpSettings()).source !== "none") {
    await sendSystemEmail(o.alerts.emailTo[0] ?? user.email, `${ws}: test alert`, "Alerts reach this address.");
    mailed = true;
  }
  return { telegram: tg, email: mailed };
}

// ---------------------------------------------------------------------------
// Scheduled jobs
// ---------------------------------------------------------------------------

export const JOB_LABELS: Record<string, string> = {
  alerts: "Work alerts (deadlines, blockers, timers, handoffs, questions)",
  trash: "Trash clean-up",
  "chat-files": "Chat files clean-up",
  "hr-reminders": "HR and training reminders",
  "chat-retention": "Chat retention",
  budgets: "Budget alerts",
  kiosks: "Silent kiosk alerts",
  "face-cleanup": "Face data of leavers",
  outbox: "Email outbox and Send later",
  backup: "Backups and test restores",
  housekeeping: "Errors and logs clean-up",
};

// Runs one job and records how it went. A job failing twice in a row alerts Admin.
export async function runJob<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const t0 = Date.now();
  try {
    const out = await fn();
    const detail = out && typeof out === "object" ? JSON.stringify(out).slice(0, 300) : out === undefined || out === null ? null : String(out).slice(0, 300);
    await run(
      `INSERT INTO job_runs (name, last_at, last_ok_at, ok, ms, detail, error, runs, failures) VALUES (?, ?, ?, 1, ?, ?, NULL, 1, 0)
       ON CONFLICT (name) DO UPDATE SET last_at = excluded.last_at, last_ok_at = excluded.last_ok_at, ok = 1, ms = excluded.ms, detail = excluded.detail, error = NULL, runs = job_runs.runs + 1, failures = 0`,
      name,
      nowIso(),
      nowIso(),
      Date.now() - t0,
      detail,
    );
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Job ${name} failed`, e);
    await run(
      `INSERT INTO job_runs (name, last_at, ok, ms, error, runs, failures) VALUES (?, ?, 0, ?, ?, 1, 1)
       ON CONFLICT (name) DO UPDATE SET last_at = excluded.last_at, ok = 0, ms = excluded.ms, error = excluded.error, runs = job_runs.runs + 1, failures = job_runs.failures + 1`,
      name,
      nowIso(),
      Date.now() - t0,
      msg.slice(0, 500),
    ).catch(() => null);
    const f = await get<{ failures: number }>("SELECT failures FROM job_runs WHERE name = ?", name).catch(() => null);
    if (f && Number(f.failures) === 2) await alertAdmins(`Scheduled job failing: ${JOB_LABELS[name] ?? name}`, msg, "/admin?tab=system", `job:${name}`);
    await recordError({ source: "job", message: msg, stack: e instanceof Error ? e.stack : undefined, path: `job:${name}` });
    return null;
  }
}

// One holder at a time (the timer, the outside cron and page loads may all try). Expires by itself.
export async function acquireLease(name: string, ms: number, force = false) {
  const key = `lease.${name}`;
  const until = JSON.stringify(new Date(Date.now() + ms).toISOString());
  if (force) {
    await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", key, until, nowIso());
    return true;
  }
  const r = await run(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE settings.value < ?",
    key,
    until,
    nowIso(),
    JSON.stringify(nowIso()),
  );
  return r.changes > 0;
}

export async function releaseLease(name: string) {
  await run("DELETE FROM settings WHERE key = ?", `lease.${name}`).catch(() => null);
}

export type JobRow = { name: string; label: string; lastAt: string | null; lastOkAt: string | null; ok: boolean; ms: number; detail: string | null; error: string | null; runs: number; failures: number };

export async function jobStatus(): Promise<{ lastChecksAt: string | null; trigger: string | null; late: boolean; jobs: JobRow[] }> {
  const rows = await all<{ name: string; last_at: string | null; last_ok_at: string | null; ok: number; ms: number; detail: string | null; error: string | null; runs: number; failures: number }>("SELECT * FROM job_runs");
  const lastChecksAt = await getMeta("lastChecksAt");
  return {
    lastChecksAt,
    trigger: await getMeta("lastChecksTrigger"),
    late: !lastChecksAt || Date.now() - Date.parse(lastChecksAt) > 30 * 60e3,
    jobs: Object.keys(JOB_LABELS).map((name) => {
      const r = rows.find((x) => x.name === name);
      return { name, label: JOB_LABELS[name]!, lastAt: r?.last_at ?? null, lastOkAt: r?.last_ok_at ?? null, ok: r ? !!r.ok : true, ms: Number(r?.ms ?? 0), detail: r?.detail ?? null, error: r?.error ?? null, runs: Number(r?.runs ?? 0), failures: Number(r?.failures ?? 0) };
    }),
  };
}

// ---------------------------------------------------------------------------
// Errors (server, browser, jobs), grouped by what they are
// ---------------------------------------------------------------------------

// Error text without personal data: email addresses, long numbers and tokens are masked.
export function scrub(text: string) {
  return text
    .replace(/[^\s@<>"'()]+@[^\s@<>"'()]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_\-]{32,}\b/g, "[token]")
    .replace(/\b\d{7,}\b/g, "[number]");
}

const stripQuery = (p: string) => p.split("?")[0]!.split("#")[0]!.slice(0, 200);

function fingerprint(source: string, message: string, stack?: string) {
  const frame = (stack ?? "").split("\n").find((l) => /^\s*at\s/.test(l) && !/node_modules|node:internal/.test(l)) ?? "";
  const norm = message.replace(/\d+/g, "#").replace(/'[^']*'|"[^"]*"/g, "'…'").slice(0, 200);
  return crypto.createHash("sha1").update(`${source}|${norm}|${frame.replace(/:\d+:\d+\)?$/, "").trim()}`).digest("hex");
}

export type ErrorInput = { source: "server" | "browser" | "job" | "action"; message: string; stack?: string; path?: string | null; route?: string | null; digest?: string | null; userId?: string | null };

// Stores (or counts again) an error. A new one, or one seen again after being marked fixed, alerts Admin
// (at most once an hour per error). Never throws: reporting must not break the page that failed.
export async function recordError(e: ErrorInput) {
  try {
    const message = scrub(e.message || "Unknown error").slice(0, 500);
    const stack = e.stack ? scrub(e.stack).split("\n").slice(0, 15).join("\n").slice(0, 3000) : null;
    const fp = fingerprint(e.source, message, stack ?? undefined);
    const now = nowIso();
    const old = await get<{ id: string; resolved_at: string | null; alerted_at: string | null; count: number }>("SELECT id, resolved_at, alerted_at, count FROM error_events WHERE fingerprint = ?", fp);
    if (old) {
      await run(
        "UPDATE error_events SET count = count + 1, last_at = ?, path = COALESCE(?, path), digest = COALESCE(?, digest), user_id = COALESCE(?, user_id), resolved_at = NULL WHERE id = ?",
        now,
        e.path ? stripQuery(e.path) : null,
        e.digest ?? null,
        e.userId ?? null,
        old.id,
      );
    } else {
      await run(
        "INSERT INTO error_events (id, fingerprint, source, message, stack, path, route, digest, user_id, count, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)",
        uid("err_"),
        fp,
        e.source,
        message,
        stack,
        e.path ? stripQuery(e.path) : null,
        e.route ?? null,
        e.digest ?? null,
        e.userId ?? null,
        now,
        now,
      );
    }
    const alertDue = !old || (old.resolved_at && (!old.alerted_at || Date.now() - Date.parse(old.alerted_at) > 3600e3));
    if (alertDue) {
      await run("UPDATE error_events SET alerted_at = ? WHERE fingerprint = ?", now, fp);
      await alertAdmins(old ? "An error came back" : "New error", `${e.source}${e.path ? ` on ${stripQuery(e.path)}` : ""}: ${message}`, "/admin?tab=system", "errors");
    }
  } catch (err) {
    console.error("Recording an error failed", err);
  }
}

export type ErrorRow = { id: string; source: string; message: string; stack: string | null; path: string | null; route: string | null; digest: string | null; userName: string | null; count: number; firstAt: string; lastAt: string; resolvedAt: string | null };

export async function listErrors(user: AppUser, opts: { includeResolved?: boolean } = {}): Promise<ErrorRow[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees errors.");
  const rows = await all<{ id: string; source: string; message: string; stack: string | null; path: string | null; route: string | null; digest: string | null; name: string | null; count: number; first_at: string; last_at: string; resolved_at: string | null }>(
    `SELECT e.*, u.name FROM error_events e LEFT JOIN users u ON u.id = e.user_id ${opts.includeResolved ? "" : "WHERE e.resolved_at IS NULL"} ORDER BY e.last_at DESC LIMIT 200`,
  );
  return rows.map((r) => ({ id: r.id, source: r.source, message: r.message, stack: r.stack, path: r.path, route: r.route, digest: r.digest, userName: r.name, count: Number(r.count), firstAt: r.first_at, lastAt: r.last_at, resolvedAt: r.resolved_at }));
}

export async function resolveErrors(user: AppUser, ids: string[]) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin marks errors fixed.");
  for (const id of ids.slice(0, 500)) await run("UPDATE error_events SET resolved_at = ? WHERE id = ?", nowIso(), id);
}

// Daily tidy-up: old fixed errors, old sign-in records and expired sign-in leftovers.
export async function housekeeping(now = nowIso()) {
  const o = await loadOps();
  const day = 864e5;
  const cut = (days: number) => new Date(Date.parse(now) - days * day).toISOString();
  const a = await run("DELETE FROM error_events WHERE last_at < ?", cut(o.keep.errorsDays));
  const b = await run("DELETE FROM signin_log WHERE at < ?", cut(o.keep.signinLogDays));
  await run("DELETE FROM signin_challenges WHERE expires_at < ?", now);
  await run("DELETE FROM two_step_trust WHERE until < ?", now);
  await run("DELETE FROM signin_locks WHERE updated_at < ? AND (locked_until IS NULL OR locked_until < ?)", cut(2), now);
  return { errors: a.changes, signins: b.changes };
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export type HealthCheck = { key: string; label: string; state: "ok" | "warn" | "bad"; text: string };

export async function healthChecks(): Promise<HealthCheck[]> {
  const out: HealthCheck[] = [];
  const t0 = Date.now();
  try {
    await get("SELECT 1 AS x");
    const ms = Date.now() - t0;
    out.push({ key: "db", label: "Database", state: ms > 1000 ? "warn" : "ok", text: `${databaseLabel()}, answered in ${ms} ms` });
  } catch (e) {
    out.push({ key: "db", label: "Database", state: "bad", text: e instanceof Error ? e.message : "Not reachable" });
  }
  const jobs = await jobStatus();
  out.push({
    key: "jobs",
    label: "Scheduled jobs",
    state: jobs.late ? "bad" : jobs.jobs.some((j) => !j.ok) ? "warn" : "ok",
    text: jobs.lastChecksAt
      ? `Last run ${Math.round((Date.now() - Date.parse(jobs.lastChecksAt)) / 60e3)} minutes ago (${jobs.trigger === "timer" ? "server timer" : jobs.trigger === "cron" ? "outside schedule" : jobs.trigger === "admin" ? "run by Admin" : "page visit"})${jobs.jobs.some((j) => !j.ok) ? `; failing: ${jobs.jobs.filter((j) => !j.ok).map((j) => j.label.split(" (")[0]).join(", ")}` : ""}`
      : "Never ran yet",
  });
  const b = await get<{ finished_at: string; ok: number; detail: string | null }>("SELECT finished_at, ok, detail FROM backup_runs WHERE kind = 'backup' ORDER BY started_at DESC LIMIT 1");
  const bok = await get<{ finished_at: string }>("SELECT finished_at FROM backup_runs WHERE kind = 'backup' AND ok = 1 ORDER BY started_at DESC LIMIT 1");
  out.push({
    key: "backup",
    label: "Backups",
    state: !bok ? "warn" : Date.now() - Date.parse(bok.finished_at) > 2 * 864e5 || (b && !b.ok) ? "bad" : "ok",
    text: bok ? `Last good backup ${new Date(bok.finished_at).toISOString().slice(0, 16).replace("T", " ")} UTC${b && !b.ok ? `; the last try failed: ${b.detail ?? ""}` : ""}` : "No backup yet",
  });
  const errs = await get<{ c: number; n: number }>("SELECT COUNT(*) AS c, COALESCE(SUM(count), 0) AS n FROM error_events WHERE resolved_at IS NULL AND last_at > ?", new Date(Date.now() - 864e5).toISOString());
  out.push({ key: "errors", label: "Errors in the last day", state: Number(errs?.c) ? "warn" : "ok", text: Number(errs?.c) ? `${errs!.c} kinds, ${errs!.n} times` : "None" });
  const smtp = await smtpSettings();
  out.push({ key: "email", label: "Email", state: smtp.source === "none" ? "warn" : "ok", text: smtp.source === "none" ? "Not set up: no email alerts, codes or reset links" : `${smtp.fromAddress || smtp.host} (${smtp.source === "env" ? "hosting settings" : "Email, Settings"})` });
  out.push({ key: "storage", label: "File storage", state: "ok", text: storageKind() === "supabase" ? "Supabase Storage" : "In the database (included in backups)" });
  out.push({ key: "google", label: "Google", state: (await googleConfig()) ? "ok" : "warn", text: (await googleConfig()) ? "Connected" : "Not set up (Google sign-in, Drive backups, Meet, YouTube)" });
  out.push({
    key: "secret",
    label: "Encryption key",
    state: secretSource() === "APP_SECRET" ? "ok" : "warn",
    text: secretSource() === "APP_SECRET" ? "APP_SECRET set in the hosting" : "Kept in the database. Set APP_SECRET in the hosting so a database copy does not hold the key.",
  });
  out.push({ key: "cron", label: "Outside schedule", state: process.env.CRON_SECRET ? "ok" : "warn", text: process.env.CRON_SECRET ? "CRON_SECRET set; /api/cron/checks can be called" : "CRON_SECRET not set; only the server timer and page visits run jobs" });
  const mem = process.memoryUsage();
  out.push({ key: "server", label: "Server", state: "ok", text: `Node ${process.version}, up ${Math.round(process.uptime() / 3600)} h, memory ${Math.round(mem.rss / 1048576)} MB of ${Math.round(os.totalmem() / 1048576)} MB` });
  return out;
}
