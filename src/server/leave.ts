// Leave: types and policy, balances, requests approved by the line manager then HR, the team leave calendar and
// public holidays (the workspace calendar's holidays, shared with Settings). Approved leave also writes a
// leave_entries row so capacity and workload count it.

import { all, get, nowIso, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings, saveSetting } from "./settings";
import { can, listUsers, type AppUser } from "./users";
import { myEmployeeId } from "./hr";
import { DEFAULT_LEAVE_TYPES, LEAVE_STATUS_LABELS, countLeaveDays, ethiopianHolidays, type LeaveStatus, type LeaveType } from "@/lib/leave";

const DAY = 864e5;
const round = (n: number) => Math.round(n * 2) / 2;
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const today = () => new Date().toISOString().slice(0, 10);

function needHr(u: AppUser) {
  if (!can(u, "hr.access")) throw new WorkflowError("FORBIDDEN", "Only HR can do this.");
}

async function hrUserIds() {
  return (await listUsers()).filter((u) => u.perms.includes("hr.access")).map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypeRow = { key: string; label: string; paid: number; days_per_year: number | null; service_bonus: number; accrual: string; needs_document: number; active: number; sort: number };
const toType = (r: TypeRow): LeaveType => ({
  key: r.key,
  label: r.label,
  paid: !!r.paid,
  daysPerYear: r.days_per_year === null ? null : Number(r.days_per_year),
  serviceBonus: Number(r.service_bonus),
  accrual: r.accrual === "monthly" ? "monthly" : "yearly",
  needsDocument: !!r.needs_document,
  active: !!r.active,
  sort: Number(r.sort),
});

// The defaults are written on first use, so HR can change them from there.
export async function leaveTypes(opts: { includeInactive?: boolean } = {}): Promise<LeaveType[]> {
  let rows = await all<TypeRow>("SELECT * FROM leave_types ORDER BY sort, label");
  if (!rows.length) {
    for (const t of DEFAULT_LEAVE_TYPES)
      await run(
        "INSERT INTO leave_types (key, label, paid, days_per_year, service_bonus, accrual, needs_document, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
        t.key,
        t.label,
        t.paid ? 1 : 0,
        t.daysPerYear,
        t.serviceBonus,
        t.accrual,
        t.needsDocument ? 1 : 0,
        1,
        t.sort,
      );
    rows = await all<TypeRow>("SELECT * FROM leave_types ORDER BY sort, label");
  }
  return rows.map(toType).filter((t) => opts.includeInactive || t.active);
}

export async function saveLeaveType(user: AppUser, input: Partial<LeaveType> & { label: string; key?: string }) {
  if (!can(user, "hr.manage")) throw new WorkflowError("FORBIDDEN", "Only the HR Manager changes leave policy.");
  const label = input.label?.trim().slice(0, 60);
  if (!label) throw new WorkflowError("VALIDATION", "Name the leave type.");
  const existing = (await leaveTypes({ includeInactive: true })).find((t) => t.key === input.key);
  const key = existing?.key ?? (label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || uid("lt_"));
  if (!existing && (await get("SELECT 1 AS x FROM leave_types WHERE key = ?", key))) throw new WorkflowError("VALIDATION", "A leave type with this name already exists.");
  const days = input.daysPerYear === null || input.daysPerYear === undefined || Number.isNaN(Number(input.daysPerYear)) ? null : Math.max(0, Number(input.daysPerYear));
  await run(
    `INSERT INTO leave_types (key, label, paid, days_per_year, service_bonus, accrual, needs_document, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET label = excluded.label, paid = excluded.paid, days_per_year = excluded.days_per_year, service_bonus = excluded.service_bonus,
       accrual = excluded.accrual, needs_document = excluded.needs_document, active = excluded.active`,
    key,
    label,
    input.paid === false ? 0 : 1,
    days,
    Math.max(0, Number(input.serviceBonus ?? 0)),
    input.accrual === "monthly" ? "monthly" : "yearly",
    input.needsDocument ? 1 : 0,
    input.active === false ? 0 : 1,
    existing?.sort ?? 100,
  );
  await audit({ actor: user }, { action: "hr.leave", summary: `${user.name} ${existing ? "changed" : "added"} the leave type ${label}` });
  return key;
}

// ---------------------------------------------------------------------------
// Days and balances
// ---------------------------------------------------------------------------

export async function workCalendar() {
  const s = await getSettings();
  return { workdays: s.calendar.workdays, holidays: s.calendar.holidays };
}

export async function leaveDays(start: string, end: string, halfDay = false) {
  const c = await workCalendar();
  return countLeaveDays(start, end, c.workdays, c.holidays.map((h) => h.date), halfDay);
}

export type Balance = {
  type: LeaveType;
  // The year's full allowance, after starting part-way through the year and service years.
  entitlement: number | null;
  // What has built up so far (the same as the allowance for yearly types and past years).
  accrued: number | null;
  adjusted: number;
  used: number;
  pending: number;
  available: number | null;
};

export async function balances(employeeId: string, year = new Date().getUTCFullYear()): Promise<Balance[]> {
  const e = await get<{ start_date: string | null }>("SELECT start_date FROM employees WHERE id = ?", employeeId);
  if (!e) return [];
  const types = await leaveTypes();
  const taken = await all<{ type_key: string; status: LeaveStatus; days: number }>(
    "SELECT type_key, status, SUM(days) AS days FROM leave_requests WHERE employee_id = ? AND start_date >= ? AND start_date <= ? AND status IN ('pending_lead','pending_hr','approved') GROUP BY type_key, status",
    employeeId,
    `${year}-01-01`,
    `${year}-12-31`,
  );
  const adj = await all<{ type_key: string; days: number }>("SELECT type_key, SUM(days) AS days FROM leave_adjustments WHERE employee_id = ? AND year = ? GROUP BY type_key", employeeId, year);
  const now = new Date();
  const start = e.start_date ? new Date(`${e.start_date}T00:00:00Z`) : null;
  // Completed years of service at the start of this leave year.
  const service = start ? Math.max(0, Math.floor((Date.UTC(year, 0, 1) - start.getTime()) / (365.25 * DAY))) : 0;
  // Months of the year the person works: from their start month (if they started this year) to December.
  const firstMonth = start && start.getUTCFullYear() === year ? start.getUTCMonth() : start && start.getUTCFullYear() > year ? 12 : 0;
  const lastMonth = year < now.getUTCFullYear() ? 11 : year > now.getUTCFullYear() ? -1 : now.getUTCMonth();
  return types.map((t) => {
    const sum = (status: LeaveStatus[]) => taken.filter((x) => x.type_key === t.key && status.includes(x.status)).reduce((a, x) => a + Number(x.days), 0);
    const used = sum(["approved"]);
    const pending = sum(["pending_lead", "pending_hr"]);
    const adjusted = Number(adj.find((x) => x.type_key === t.key)?.days ?? 0);
    if (t.daysPerYear === null) return { type: t, entitlement: null, accrued: null, adjusted, used, pending, available: null };
    const full = t.daysPerYear + t.serviceBonus * Math.floor(service / 2);
    const entitlement = round((full * (12 - firstMonth)) / 12);
    const accrued = t.accrual === "monthly" ? round((full * Math.max(0, lastMonth - firstMonth + 1)) / 12) : entitlement;
    return { type: t, entitlement, accrued, adjusted, used, pending, available: round(accrued + adjusted - used - pending) };
  });
}

export async function adjustBalance(user: AppUser, input: { employeeId: string; typeKey: string; year: number; days: number; note: string }) {
  needHr(user);
  const days = Number(input.days);
  if (!days || !Number.isFinite(days)) throw new WorkflowError("VALIDATION", "Enter the days to add (or a negative number to take away).");
  if (!input.note?.trim()) throw new WorkflowError("VALIDATION", "Say why the balance changes, for example days carried over.");
  const e = await get<{ full_name: string }>("SELECT full_name FROM employees WHERE id = ?", input.employeeId);
  if (!e) throw new WorkflowError("NOT_FOUND", "This employee no longer exists.");
  await run(
    "INSERT INTO leave_adjustments (id, employee_id, type_key, year, days, note, actor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("ladj_"),
    input.employeeId,
    input.typeKey,
    Math.trunc(input.year),
    days,
    input.note.trim().slice(0, 300),
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { itemId: input.employeeId, action: "hr.leave", summary: `${user.name} ${days > 0 ? "added" : "took away"} ${Math.abs(days)} days of ${input.typeKey} leave for ${e.full_name} (${input.year}): ${input.note.trim()}` });
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export type LeaveRequestRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  typeKey: string;
  typeLabel: string;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  approverName: string | null;
  leadNote: string | null;
  hrNote: string | null;
  createdAt: string;
};

const REQUEST_SQL = `SELECT r.*, e.full_name, e.preferred_name, t.label AS type_label, u.name AS approver_name
  FROM leave_requests r JOIN employees e ON e.id = r.employee_id LEFT JOIN leave_types t ON t.key = r.type_key LEFT JOIN users u ON u.id = r.approver_id`;

type RawRequest = {
  id: string;
  employee_id: string;
  full_name: string;
  preferred_name: string | null;
  type_key: string;
  type_label: string | null;
  start_date: string;
  end_date: string;
  half_day: number;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  approver_id: string | null;
  approver_name: string | null;
  lead_note: string | null;
  hr_note: string | null;
  created_at: string;
};
const toRequest = (r: RawRequest): LeaveRequestRow => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.preferred_name || r.full_name,
  typeKey: r.type_key,
  typeLabel: r.type_label ?? r.type_key,
  startDate: r.start_date,
  endDate: r.end_date,
  halfDay: !!r.half_day,
  days: Number(r.days),
  reason: r.reason,
  status: r.status,
  approverName: r.approver_name,
  leadNote: r.lead_note,
  hrNote: r.hr_note,
  createdAt: r.created_at,
});

async function requestRow(id: string) {
  const r = await get<RawRequest>(`${REQUEST_SQL} WHERE r.id = ?`, id);
  if (!r) throw new WorkflowError("NOT_FOUND", "This leave request no longer exists.");
  return r;
}

// The line manager approves first when they have an account; otherwise (or when they are the person) HR does.
async function approverFor(employeeId: string, requesterUserId: string | null) {
  const m = await get<{ user_id: string | null; status: string }>(
    "SELECT m.user_id, m.status FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.id = ?",
    employeeId,
  );
  return m?.user_id && m.status !== "left" && m.user_id !== requesterUserId ? m.user_id : null;
}

async function writeEntry(r: { id: string; employee_id: string; start_date: string; end_date: string; type_label?: string | null }) {
  const e = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", r.employee_id);
  if (!e?.user_id) return;
  await run("DELETE FROM leave_entries WHERE request_id = ?", r.id);
  await run("INSERT INTO leave_entries (user_id, starts_on, ends_on, note, request_id) VALUES (?, ?, ?, ?, ?)", e.user_id, r.start_date, r.end_date, r.type_label ?? "Leave", r.id);
}

export type LeaveInput = { typeKey: string; startDate: string; endDate: string; halfDay?: boolean; reason?: string | null; employeeId?: string | null };

// A person asks for leave; HR can also record leave for someone, which is approved straight away.
export async function requestLeave(user: AppUser, input: LeaveInput) {
  const own = await myEmployeeId(user);
  const forOther = !!input.employeeId && input.employeeId !== own;
  if (forOther) needHr(user);
  const employeeId = forOther ? input.employeeId! : own;
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
  const emp = await get<{ full_name: string; user_id: string | null; status: string }>("SELECT full_name, user_id, status FROM employees WHERE id = ?", employeeId);
  if (!emp || emp.status === "left") throw new WorkflowError("VALIDATION", "Choose a current employee.");
  const type = (await leaveTypes()).find((t) => t.key === input.typeKey);
  if (!type) throw new WorkflowError("VALIDATION", "Choose a leave type.");
  if (!isDay(input.startDate) || !isDay(input.endDate)) throw new WorkflowError("VALIDATION", "Choose the first and last day.");
  if (input.endDate < input.startDate) throw new WorkflowError("VALIDATION", "The last day is before the first day.");
  if (input.startDate.slice(0, 4) !== input.endDate.slice(0, 4)) throw new WorkflowError("VALIDATION", "Split leave that crosses into the new year into two requests.");
  const halfDay = !!input.halfDay && input.startDate === input.endDate;
  const days = await leaveDays(input.startDate, input.endDate, halfDay);
  if (!days) throw new WorkflowError("VALIDATION", "Those dates are all weekends or public holidays.");
  const overlap = await get<{ start_date: string; end_date: string }>(
    "SELECT start_date, end_date FROM leave_requests WHERE employee_id = ? AND status IN ('pending_lead','pending_hr','approved') AND start_date <= ? AND end_date >= ?",
    employeeId,
    input.endDate,
    input.startDate,
  );
  if (overlap) throw new WorkflowError("VALIDATION", `This overlaps leave already asked for (${overlap.start_date} to ${overlap.end_date}).`);
  // People cannot ask for more than they have; HR recording leave can go over (for example agreed advance leave).
  const bal = (await balances(employeeId, Number(input.startDate.slice(0, 4)))).find((b) => b.type.key === type.key);
  if (!forOther && bal?.available !== null && bal?.available !== undefined && days > bal.available)
    throw new WorkflowError("VALIDATION", `You have ${bal.available} ${bal.available === 1 ? "day" : "days"} of ${type.label.toLowerCase()} available, and this is ${days}.`);
  const now = nowIso();
  const id = uid("lv_");
  const approver = forOther ? null : await approverFor(employeeId, user.id);
  const status: LeaveStatus = forOther ? "approved" : approver ? "pending_lead" : "pending_hr";
  await run(
    `INSERT INTO leave_requests (id, employee_id, type_key, start_date, end_date, half_day, days, reason, status, approver_id, hr_decided_by, hr_decided_at, created_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    employeeId,
    type.key,
    input.startDate,
    input.endDate,
    halfDay ? 1 : 0,
    days,
    input.reason?.trim().slice(0, 500) || null,
    status,
    approver,
    forOther ? user.id : null,
    forOther ? now : null,
    user.id,
    now,
    now,
  );
  const what = `${type.label}: ${input.startDate}${input.endDate !== input.startDate ? ` to ${input.endDate}` : ""} (${days} ${days === 1 ? "day" : "days"})`;
  if (forOther) {
    await writeEntry({ id, employee_id: employeeId, start_date: input.startDate, end_date: input.endDate, type_label: type.label });
    if (emp.user_id) await notify([emp.user_id], { type: "hr", title: "Leave recorded for you", body: what, link: "/leave" }, now, user.id);
  } else if (approver) {
    await notify([approver], { type: "approval", title: `Leave request: ${emp.full_name}`, body: what, link: "/leave", dedupeKey: `leave:${id}:lead` }, now);
  } else {
    await notify(await hrUserIds(), { type: "approval", title: `Leave request: ${emp.full_name}`, body: what, link: "/hr?tab=leave", dedupeKey: `leave:${id}:hr` }, now, user.id);
  }
  await audit({ actor: user }, { itemId: employeeId, action: "hr.leave", summary: `${forOther ? `${user.name} recorded` : `${emp.full_name} asked for`} ${what}` });
  return id;
}

export async function decideLeave(user: AppUser, id: string, input: { decision: "approve" | "reject"; note?: string | null }) {
  const r = await requestRow(id);
  const hr = can(user, "hr.access");
  const note = input.note?.trim().slice(0, 500) || null;
  if (input.decision === "reject" && !note) throw new WorkflowError("VALIDATION", "Say why, so they can plan around it.");
  const own = (await myEmployeeId(user)) === r.employee_id;
  if (own) throw new WorkflowError("FORBIDDEN", "Someone else decides your own leave.");
  const now = nowIso();
  const emp = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", r.employee_id);
  const what = `${r.type_label ?? r.type_key}: ${r.start_date}${r.end_date !== r.start_date ? ` to ${r.end_date}` : ""}`;
  let next: LeaveStatus;
  if (r.status === "pending_lead") {
    // HR may decide before the line manager, for example when the manager is away.
    if (r.approver_id !== user.id && !hr) throw new WorkflowError("FORBIDDEN", "The line manager or HR decides this request.");
    next = input.decision === "reject" ? "rejected" : hr ? "approved" : "pending_hr";
    await run("UPDATE leave_requests SET status = ?, lead_decided_by = ?, lead_decided_at = ?, lead_note = ?, updated_at = ? WHERE id = ?", next, user.id, now, note, now, id);
    if (next === "approved") await run("UPDATE leave_requests SET hr_decided_by = ?, hr_decided_at = ? WHERE id = ?", user.id, now, id);
  } else if (r.status === "pending_hr") {
    if (!hr) throw new WorkflowError("FORBIDDEN", "HR decides this request.");
    next = input.decision === "reject" ? "rejected" : "approved";
    await run("UPDATE leave_requests SET status = ?, hr_decided_by = ?, hr_decided_at = ?, hr_note = ?, updated_at = ? WHERE id = ?", next, user.id, now, note, now, id);
  } else throw new WorkflowError("INVALID_STATE", `This request is already ${LEAVE_STATUS_LABELS[r.status].toLowerCase()}.`);

  if (next === "pending_hr")
    await notify(await hrUserIds(), { type: "approval", title: `Leave to approve: ${r.full_name}`, body: `${what}. Approved by the line manager.`, link: "/hr?tab=leave", dedupeKey: `leave:${id}:hr` }, now, user.id);
  if (next === "approved") await writeEntry(r);
  if (next !== "pending_hr" && emp?.user_id)
    await notify([emp.user_id], { type: "hr", title: next === "approved" ? "Leave approved" : "Leave not approved", body: `${what}${note ? `. ${note}` : ""}`, link: "/leave" }, now, user.id);
  await audit({ actor: user }, { itemId: r.employee_id, action: "hr.leave", summary: `${user.name} ${input.decision === "approve" ? "approved" : "did not approve"} ${r.full_name}'s ${what}${note ? `: ${note}` : ""}` });
  return next;
}

// People cancel their own requests (approved leave only before it starts); HR can cancel any.
export async function cancelLeave(user: AppUser, id: string) {
  const r = await requestRow(id);
  const own = (await myEmployeeId(user)) === r.employee_id;
  const hr = can(user, "hr.access");
  if (!own && !hr) throw new WorkflowError("FORBIDDEN", "You can cancel only your own leave.");
  if (!["pending_lead", "pending_hr", "approved"].includes(r.status)) throw new WorkflowError("INVALID_STATE", "This request is already closed.");
  if (r.status === "approved" && !hr && r.start_date <= today()) throw new WorkflowError("INVALID_STATE", "Leave that has started is changed by HR. Ask them.");
  const now = nowIso();
  await run("UPDATE leave_requests SET status = 'cancelled', updated_at = ? WHERE id = ?", now, id);
  await run("DELETE FROM leave_entries WHERE request_id = ?", id);
  const what = `${r.type_label ?? r.type_key}: ${r.start_date}${r.end_date !== r.start_date ? ` to ${r.end_date}` : ""}`;
  if (r.status === "approved") await notify(await hrUserIds(), { type: "hr", title: `Leave cancelled: ${r.full_name}`, body: what, link: "/hr?tab=leave" }, now, user.id);
  if (r.status === "pending_lead" && r.approver_id) await notify([r.approver_id], { type: "hr", title: `Leave request withdrawn: ${r.full_name}`, body: what, link: "/leave" }, now, user.id);
  await audit({ actor: user }, { itemId: r.employee_id, action: "hr.leave", summary: `${user.name} cancelled ${r.full_name}'s ${what}` });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export type LeaveCalendarEntry = { id: string; employeeName: string; typeLabel: string; startDate: string; endDate: string; status: LeaveStatus };

// Who is off in a month: HR sees everyone; others see themselves and the people who report to them.
export async function leaveCalendar(user: AppUser, month: string): Promise<{ entries: LeaveCalendarEntry[]; holidays: { date: string; name: string }[]; workdays: number[] }> {
  const from = `${month}-01`;
  const to = `${month}-31`;
  let scope = "";
  let params: string[] = [];
  if (!can(user, "hr.access")) {
    const me = await myEmployeeId(user);
    const ids = me
      ? [
          me,
          ...(
            await all<{ id: string }>(
              "WITH RECURSIVE t(id) AS (SELECT id FROM employees WHERE manager_id = ? UNION SELECT e.id FROM employees e JOIN t ON e.manager_id = t.id) SELECT id FROM t",
              me,
            )
          ).map((x) => x.id),
        ]
      : [];
    if (!ids.length) ids.push("-");
    scope = `AND r.employee_id IN (${ids.map(() => "?").join(",")})`;
    params = ids;
  }
  const rows = await all<RawRequest>(`${REQUEST_SQL} WHERE r.status IN ('pending_lead','pending_hr','approved') AND r.start_date <= ? AND r.end_date >= ? ${scope} ORDER BY r.start_date`, to, from, ...params);
  const c = await workCalendar();
  return {
    entries: rows.map((r) => ({ id: r.id, employeeName: r.preferred_name || r.full_name, typeLabel: r.type_label ?? r.type_key, startDate: r.start_date, endDate: r.end_date, status: r.status })),
    holidays: c.holidays.filter((h) => h.date.startsWith(month)),
    workdays: c.workdays,
  };
}

export async function myLeave(user: AppUser) {
  const employeeId = await myEmployeeId(user);
  const year = new Date().getUTCFullYear();
  const c = await workCalendar();
  if (!employeeId) return { employeeId: null, balances: [], requests: [], approvals: [], types: await leaveTypes(), calendar: c };
  const [bal, mine, approvals] = await Promise.all([
    balances(employeeId, year),
    all<RawRequest>(`${REQUEST_SQL} WHERE r.employee_id = ? ORDER BY r.start_date DESC LIMIT 100`, employeeId),
    all<RawRequest>(`${REQUEST_SQL} WHERE r.status = 'pending_lead' AND r.approver_id = ? ORDER BY r.start_date`, user.id),
  ]);
  return { employeeId, balances: bal, requests: mine.map(toRequest), approvals: approvals.map(toRequest), types: await leaveTypes(), calendar: c };
}

export async function hrLeave(user: AppUser, year = new Date().getUTCFullYear()) {
  needHr(user);
  const [waiting, withManagers, recent, types] = await Promise.all([
    all<RawRequest>(`${REQUEST_SQL} WHERE r.status = 'pending_hr' ORDER BY r.start_date`),
    all<RawRequest>(`${REQUEST_SQL} WHERE r.status = 'pending_lead' ORDER BY r.start_date`),
    all<RawRequest>(`${REQUEST_SQL} WHERE r.start_date >= ? AND r.start_date <= ? AND r.status IN ('approved','rejected','cancelled') ORDER BY r.start_date DESC LIMIT 300`, `${year}-01-01`, `${year}-12-31`),
    leaveTypes({ includeInactive: true }),
  ]);
  const c = await workCalendar();
  return { waiting: waiting.map(toRequest), withManagers: withManagers.map(toRequest), recent: recent.map(toRequest), types, calendar: c, year };
}

export async function balancesFor(user: AppUser, employeeId: string, year?: number) {
  needHr(user);
  return balances(employeeId, year);
}

// ---------------------------------------------------------------------------
// Public holidays (the workspace calendar's list)
// ---------------------------------------------------------------------------

function needHolidays(u: AppUser) {
  if (!can(u, "hr.access") && !can(u, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only HR or a manager with Settings changes public holidays.");
}

export async function addHolidays(user: AppUser, list: { date: string; name: string }[]) {
  needHolidays(user);
  const s = await getSettings();
  const have = new Set(s.calendar.holidays.map((h) => h.date));
  const add = list.filter((h) => isDay(h.date) && h.name?.trim() && !have.has(h.date)).map((h) => ({ date: h.date, name: h.name.trim().slice(0, 80) }));
  if (!add.length) return 0;
  await saveSetting("calendar", { ...s.calendar, holidays: [...s.calendar.holidays, ...add].sort((a, b) => a.date.localeCompare(b.date)) }, user.id);
  await audit({ actor: user }, { action: "hr.leave", summary: `${user.name} added ${add.length} public ${add.length === 1 ? "holiday" : "holidays"}` });
  return add.length;
}

export async function addEthiopianHolidays(user: AppUser, year: number) {
  return addHolidays(user, ethiopianHolidays(Math.trunc(year)));
}

export async function removeHoliday(user: AppUser, date: string) {
  needHolidays(user);
  const s = await getSettings();
  await saveSetting("calendar", { ...s.calendar, holidays: s.calendar.holidays.filter((h) => h.date !== date) }, user.id);
  await audit({ actor: user }, { action: "hr.leave", summary: `${user.name} removed the public holiday on ${date}` });
}
