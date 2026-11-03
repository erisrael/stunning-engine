// Data protection for everyone's records (Phase 16.5):
// - a privacy notice for staff (Admin, Privacy), shown at first sign-in and again whenever it changes; acceptance
//   is recorded with the version;
// - a retention schedule (Admin, Privacy) applied every day by the scheduled checks, with what was removed logged;
// - "Download my data" for each person (Profile): their account, HR record, leave, attendance, pay, claims, work and
//   what they wrote;
// - an access log of who opened HR and salary records (not their own), for HR managers and Admin.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export type Retention = { attendanceYears: number; applicantsMonths: number; notificationsDays: number; visitsDays: number; assistantDays: number; auditYears: number };
export type PrivacyConfig = { notice: string; version: number; updatedAt: string | null; retention: Retention };
export const DEFAULT_RETENTION: Retention = { attendanceYears: 5, applicantsMonths: 6, notificationsDays: 180, visitsDays: 365, assistantDays: 365, auditYears: 7 };

export async function privacyConfig(): Promise<PrivacyConfig> {
  const v = parseJson<Partial<PrivacyConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.privacy'"))?.value, {});
  return { notice: v.notice ?? "", version: Number(v.version ?? 0), updatedAt: v.updatedAt ?? null, retention: { ...DEFAULT_RETENTION, ...(v.retention ?? {}) } };
}

const canManage = (u: AppUser) => can(u, "users.manage") || can(u, "hr.manage");

export async function savePrivacy(user: AppUser, input: { notice?: string; retention?: Partial<Retention> }) {
  if (!canManage(user)) throw new WorkflowError("FORBIDDEN", "Only Admin and HR managers set this.");
  const cur = await privacyConfig();
  const notice = String(input.notice ?? cur.notice).trim().slice(0, 20000);
  const clamp = (v: unknown, d: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(Number(v ?? d) || d)));
  const r = input.retention ?? {};
  const next: PrivacyConfig = {
    notice,
    // A changed notice is a new version, which everyone accepts again.
    version: notice !== cur.notice ? cur.version + 1 : cur.version,
    updatedAt: notice !== cur.notice ? nowIso() : cur.updatedAt,
    retention: {
      attendanceYears: clamp(r.attendanceYears, cur.retention.attendanceYears, 1, 30),
      applicantsMonths: clamp(r.applicantsMonths, cur.retention.applicantsMonths, 1, 120),
      notificationsDays: clamp(r.notificationsDays, cur.retention.notificationsDays, 7, 3650),
      visitsDays: clamp(r.visitsDays, cur.retention.visitsDays, 7, 3650),
      assistantDays: clamp(r.assistantDays, cur.retention.assistantDays, 7, 3650),
      auditYears: clamp(r.auditYears, cur.retention.auditYears, 1, 30),
    },
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.privacy', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.privacy", summary: `${user.name} changed the privacy notice or retention (version ${next.version})` });
  return next.version;
}

// What the person still has to accept (null when nothing).
export async function privacyToAccept(user: AppUser) {
  const c = await privacyConfig();
  if (!c.notice || !c.version) return null;
  const done = await get("SELECT 1 AS x FROM privacy_acceptances WHERE user_id = ? AND version = ?", user.id, c.version);
  return done ? null : { notice: c.notice, version: c.version, updatedAt: c.updatedAt };
}

export async function acceptPrivacy(user: AppUser, version: number) {
  const c = await privacyConfig();
  if (version !== c.version) throw new WorkflowError("INVALID_STATE", "The notice changed; read the new one.");
  await run("INSERT INTO privacy_acceptances (user_id, version, accepted_at) VALUES (?, ?, ?) ON CONFLICT (user_id, version) DO NOTHING", user.id, version, nowIso());
}

export async function acceptanceReport(user: AppUser) {
  if (!canManage(user)) throw new WorkflowError("FORBIDDEN", "Only Admin and HR managers see this.");
  const c = await privacyConfig();
  const people = await all<{ id: string; name: string; accepted_at: string | null }>(
    "SELECT u.id, u.name, a.accepted_at FROM users u LEFT JOIN privacy_acceptances a ON a.user_id = u.id AND a.version = ? WHERE u.active = 1 AND u.deleted_at IS NULL ORDER BY u.name",
    c.version,
  );
  return { version: c.version, accepted: people.filter((p) => p.accepted_at).length, waiting: people.filter((p) => !p.accepted_at).map((p) => ({ id: p.id, name: p.name })) };
}

// ---------------------------------------------------------------------------
// Retention, applied by the scheduled checks
// ---------------------------------------------------------------------------

const ago = (days: number) => new Date(Date.now() - days * 864e5).toISOString();

export async function applyRetention() {
  const r = (await privacyConfig()).retention;
  const count = async (sql: string, ...p: string[]) => Number((await get<{ c: number }>(sql, ...p))?.c ?? 0);
  const removed: Record<string, number> = {};
  const purge = async (label: string, where: string, table: string, ...p: string[]) => {
    const n = await count(`SELECT COUNT(*) AS c FROM ${table} WHERE ${where}`, ...p);
    if (n) await run(`DELETE FROM ${table} WHERE ${where}`, ...p);
    if (n) removed[label] = n;
  };
  await purge("attendance events", "day < ?", "att_events", ago(r.attendanceYears * 365).slice(0, 10));
  await purge("attendance marks", "day < ?", "att_marks", ago(r.attendanceYears * 365).slice(0, 10));
  await purge("applicants not hired", "employee_id IS NULL AND updated_at < ?", "applicants", ago(r.applicantsMonths * 30));
  await purge("read notifications", "read_at IS NOT NULL AND created_at < ?", "notifications", ago(r.notificationsDays));
  await purge("page visits", "day < ?", "page_visits", ago(r.visitsDays).slice(0, 10));
  await purge("assistant events", "at < ?", "assistant_events", ago(r.assistantDays));
  await purge("audit entries", "occurred_at < ?", "audit_events", ago(r.auditYears * 365));
  await purge("record access log", "at < ?", "record_access_log", ago(r.auditYears * 365));
  if (Object.keys(removed).length)
    await run(
      "INSERT INTO audit_events (id, actor_kind, action, summary, occurred_at) VALUES (?, 'system', 'privacy.retention', ?, ?)",
      uid("aud_"),
      `Retention removed ${Object.entries(removed).map(([k, v]) => `${v} ${k}`).join(", ")}`,
      nowIso(),
    ).catch(() => {});
  return removed;
}

// ---------------------------------------------------------------------------
// Who opened HR and salary records
// ---------------------------------------------------------------------------

export async function logRecordAccess(viewer: AppUser, employeeId: string, what: "hr_record" | "salary" | "payslip" | "document") {
  const own = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", employeeId);
  if (own?.user_id === viewer.id) return;
  // One line per person, record and kind per hour is enough.
  const since = new Date(Date.now() - 3600e3).toISOString();
  if (await get("SELECT 1 AS x FROM record_access_log WHERE viewer_id = ? AND employee_id = ? AND what = ? AND at > ?", viewer.id, employeeId, what, since)) return;
  await run("INSERT INTO record_access_log (id, viewer_id, employee_id, what, at) VALUES (?, ?, ?, ?, ?)", uid("ral_"), viewer.id, employeeId, what, nowIso());
}

export async function accessLog(user: AppUser, opts: { employeeId?: string | null } = {}) {
  if (!canManage(user)) throw new WorkflowError("FORBIDDEN", "Only Admin and HR managers see this.");
  return await all<{ at: string; viewer: string; employee: string; what: string }>(
    `SELECT l.at, u.name AS viewer, COALESCE(e.preferred_name, e.full_name) AS employee, l.what FROM record_access_log l
     JOIN users u ON u.id = l.viewer_id JOIN employees e ON e.id = l.employee_id ${opts.employeeId ? "WHERE l.employee_id = ?" : ""} ORDER BY l.at DESC LIMIT 300`,
    ...(opts.employeeId ? [opts.employeeId] : []),
  );
}

// ---------------------------------------------------------------------------
// Download my data
// ---------------------------------------------------------------------------

export async function myData(user: AppUser) {
  const q = (sql: string, ...p: string[]) => all(sql, ...p).catch(() => []);
  const emp = await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", user.id);
  const e = emp?.id ?? "-";
  const account = await get("SELECT id, name, email, handle, title, phone, bio, created_at, last_login_at, prefs FROM users WHERE id = ?", user.id);
  return {
    exportedAt: nowIso(),
    note: "Everything the app keeps about you. Chat messages are end-to-end encrypted and are not included; open Chat to read them.",
    account,
    roles: await q("SELECT role FROM role_assignments WHERE user_id = ?", user.id),
    profile: await q("SELECT * FROM profiles WHERE user_id = ?", user.id),
    hrRecord: emp ? await q("SELECT * FROM employees WHERE id = ?", e) : [],
    hrDocuments: emp ? await q("SELECT id, kind, title, name, expires_at, created_at FROM employee_documents WHERE employee_id = ?", e) : [],
    leave: emp ? await q("SELECT * FROM leave_requests WHERE employee_id = ?", e) : [],
    attendance: emp ? await q("SELECT kind, at, day, source FROM att_events WHERE employee_id = ? ORDER BY at", e) : [],
    attendanceCorrections: emp ? await q("SELECT * FROM att_corrections WHERE employee_id = ?", e) : [],
    payslips: emp ? await q("SELECT * FROM fin_payslips WHERE employee_id = ?", e) : [],
    claims: await q("SELECT id, date, amount, description, status, created_at FROM fin_claims WHERE user_id = ?", user.id),
    tasksAssigned: await q("SELECT dept, code, title, status, created_at, updated_at FROM dept_tasks WHERE assignee_id = ?", user.id),
    taskComments: await q("SELECT task_id, body, created_at FROM dept_task_comments WHERE author_id = ?", user.id),
    comments: await q("SELECT item_id, body, created_at FROM comments WHERE author_id = ?", user.id),
    notifications: await q("SELECT type, title, body, created_at, read_at FROM notifications WHERE user_id = ?", user.id),
    signIns: await q("SELECT event, method, ip, user_agent, at FROM signin_log WHERE user_id = ? ORDER BY at DESC LIMIT 500", user.id),
    routines: await q("SELECT name, description, steps, created_at FROM assistant_routines WHERE owner_id = ?", user.id),
    announcementsRead: await q("SELECT announcement_id, read_at, acked_at FROM announcement_reads WHERE user_id = ?", user.id),
    privacyAcceptances: await q("SELECT version, accepted_at FROM privacy_acceptances WHERE user_id = ?", user.id),
  };
}
