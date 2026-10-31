// Attendance: check-ins from the app, a phone at the site or a kiosk; a team lead's day records when there is no
// kiosk or it fails; corrections approved by the line manager; the daily board; monthly timesheets; and the
// overtime and unpaid days payroll takes. A day's result is always computed from the check-ins, the person's shift,
// approved leave, public holidays and any hand-made record (src/lib/attendance.ts).

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, listUsers, type AppUser } from "./users";
import { hrDepartments, myEmployeeId, teamOf } from "./hr";
import { hashPassword, verifyPassword } from "./passwords";
import {
  DAY_STATUS_LABELS,
  DEFAULT_ATTENDANCE,
  MARK_STATUSES,
  computeDay,
  distanceM,
  fmtMin,
  localParts,
  localToIso,
  monthTotals,
  overnight,
  overtimeHours,
  shiftKeyOn,
  toMin,
  unpaidDays,
  type AttendanceConfig,
  type CorrectionStatus,
  type DayEvent,
  type DayMark,
  type DayResult,
  type MarkStatus,
  type MonthTotals,
  type Shift,
  type ShiftAssign,
  type Source,
} from "@/lib/attendance";
import { STAGES, type Stage } from "@/lib/domain";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function attendanceConfig(): Promise<AttendanceConfig> {
  const stored = parseJson<Partial<AttendanceConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.attendance'"))?.value, {});
  return {
    ...DEFAULT_ATTENDANCE,
    ...stored,
    methods: { ...DEFAULT_ATTENDANCE.methods, ...(stored.methods ?? {}) },
    site: { ...DEFAULT_ATTENDANCE.site, ...(stored.site ?? {}) },
    shifts: stored.shifts?.length ? stored.shifts : DEFAULT_ATTENDANCE.shifts,
  };
}

export async function saveAttendanceConfig(user: AppUser, input: Partial<AttendanceConfig>) {
  needManage(user);
  const cur = await attendanceConfig();
  const num = (v: unknown, d: number, min: number, max: number) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
  const shifts: Shift[] = (input.shifts ?? cur.shifts).map((s, i) => {
    const label = clean(s.label, 60);
    const key = clean(s.key, 30).toLowerCase().replace(/[^a-z0-9_]/g, "_") || `shift_${i + 1}`;
    if (!label) throw new WorkflowError("VALIDATION", "Name every shift.");
    // An end before the start is a night shift that ends the next morning.
    if (!isTime(s.start) || !isTime(s.end) || toMin(s.end) === toMin(s.start)) throw new WorkflowError("VALIDATION", `${label}: give the start and end (HH:MM); they cannot be the same.`);
    const workdays = [...new Set((s.workdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    if (!workdays.length) throw new WorkflowError("VALIDATION", `${label}: choose the working days.`);
    return { key, label, start: s.start, end: s.end, graceMin: num(s.graceMin, 15, 0, 120), breakMin: num(s.breakMin, 60, 0, 180), workdays };
  });
  if (!shifts.length) throw new WorkflowError("VALIDATION", "Keep at least one shift.");
  if (new Set(shifts.map((s) => s.key)).size !== shifts.length) throw new WorkflowError("VALIDATION", "Two shifts have the same key.");
  const methods = { ...cur.methods, ...(input.methods ?? {}) };
  const site = { ...cur.site, ...(input.site ?? {}) };
  const lat = site.lat === null || (site.lat as unknown) === "" ? null : Number(site.lat);
  const lng = site.lng === null || (site.lng as unknown) === "" ? null : Number(site.lng);
  if (methods.mobile && (lat === null || lng === null || !Number.isFinite(lat) || !Number.isFinite(lng)))
    throw new WorkflowError("VALIDATION", "Phone check-in needs the site's location (latitude and longitude).");
  const start = input.startDate === undefined ? cur.startDate : input.startDate || null;
  if (start !== null && !isDay(start)) throw new WorkflowError("VALIDATION", "Choose the day attendance starts counting.");
  const next: AttendanceConfig = {
    startDate: start,
    shifts,
    defaultShift: shifts.some((s) => s.key === (input.defaultShift ?? cur.defaultShift)) ? (input.defaultShift ?? cur.defaultShift) : shifts[0]!.key,
    earlyLeaveMin: num(input.earlyLeaveMin ?? cur.earlyLeaveMin, 15, 0, 240),
    overtimeAfterMin: num(input.overtimeAfterMin ?? cur.overtimeAfterMin, 30, 0, 240),
    halfDayHours: num(input.halfDayHours ?? cur.halfDayHours, 4, 1, 12),
    methods: { web: !!methods.web, kiosk: !!methods.kiosk, mobile: !!methods.mobile, face: !!methods.face },
    faceThreshold: num(input.faceThreshold ?? cur.faceThreshold, 0.5, 0.35, 0.6),
    site: { label: clean(site.label, 60) || "Office", lat: lat !== null && Number.isFinite(lat) ? lat : null, lng: lng !== null && Number.isFinite(lng) ? lng : null, radiusM: num(site.radiusM, 200, 20, 5000) },
    kioskSilenceMin: num(input.kioskSilenceMin ?? cur.kioskSilenceMin, 30, 5, 600),
    offlineMaxHours: num(input.offlineMaxHours ?? cur.offlineMaxHours, 72, 1, 240),
    policy: clean(input.policy ?? cur.policy, 6000),
  };
  await run(
    `INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.attendance', ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "attendance.settings", summary: `${user.name} changed the attendance settings` });
}

// ---------------------------------------------------------------------------
// Who sees whom
// ---------------------------------------------------------------------------

export const managesAttendance = (u: AppUser) => can(u, "attendance.manage");

function needManage(u: AppUser) {
  if (!managesAttendance(u)) throw new WorkflowError("FORBIDDEN", "Only HR manages attendance for everyone.");
}

async function managerIds() {
  return (await listUsers()).filter((u) => u.perms.includes("attendance.manage")).map((u) => u.id);
}

// The people a lead looks after: everyone who reports to them, and the members of the production teams they lead.
export async function teamIds(user: AppUser): Promise<string[]> {
  const me = await myEmployeeId(user);
  const reports = me ? await teamOf(me) : [];
  const led = STAGES.filter((s) => user.leads.includes(s as Stage));
  const members = led.length
    ? (
        await all<{ id: string }>(
          `SELECT DISTINCT e.id FROM employees e JOIN role_assignments r ON r.user_id = e.user_id WHERE r.role IN (${led.map(() => "?").join(",")}) AND e.status <> 'left'`,
          ...led,
        )
      ).map((r) => r.id)
    : [];
  return [...new Set([...reports, ...members])].filter((id) => id !== me);
}

// Everyone this person may see on the board and in reports (HR: everyone).
async function visible(user: AppUser): Promise<{ all: boolean; ids: string[] }> {
  if (managesAttendance(user)) return { all: true, ids: [] };
  return { all: false, ids: await teamIds(user) };
}

async function canSee(user: AppUser, employeeId: string) {
  if (managesAttendance(user)) return true;
  if ((await myEmployeeId(user)) === employeeId) return true;
  return (await teamIds(user)).includes(employeeId);
}

// ---------------------------------------------------------------------------
// Days
// ---------------------------------------------------------------------------

type Emp = { id: string; code: string; full_name: string; department: string | null; job_title: string | null; user_id: string | null; manager_id: string | null; start_date: string | null; end_date: string | null; status: string };

function daysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T12:00:00Z`); t <= Date.parse(`${to}T12:00:00Z`); t += 864e5) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

type AssignRow = { employee_id: string; shift_key: string | null; rota: string | null; rota_start: string | null };
const toAssign = (r: AssignRow | undefined): ShiftAssign | null => (r ? { shiftKey: r.shift_key, rota: parseJson<string[] | null>(r.rota, null), rotaStart: r.rota_start } : null);
const pickShift = (c: AttendanceConfig, key: string) => c.shifts.find((s) => s.key === key) ?? c.shifts.find((s) => s.key === c.defaultShift) ?? c.shifts[0]!;

// The person's shift on a day (their rota week, their shift, or the default).
export async function shiftOf(employeeId: string, cfg?: AttendanceConfig, day?: string): Promise<Shift> {
  const c = cfg ?? (await attendanceConfig());
  const a = toAssign(await get<AssignRow>("SELECT employee_id, shift_key, rota, rota_start FROM att_shift_assign WHERE employee_id = ?", employeeId));
  return pickShift(c, shiftKeyOn(a, day ?? (await tzNow()).date, c.defaultShift));
}

export type EventRow = { id: string; kind: "in" | "out"; at: string; minutes: number; source: Source; offline: boolean; note: string | null; distanceM: number | null };

// Each person's days in a range, with their check-ins.
async function loadDays(emps: Emp[], from: string, to: string, opts: { allDays?: boolean } = {}) {
  const out = new Map<string, { days: DayResult[]; events: Map<string, EventRow[]> }>();
  if (!emps.length) return out;
  const cfg = await attendanceConfig();
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const ids = emps.map((e) => e.id);
  const ph = ids.map(() => "?").join(",");
  const [events, marks, leaves, assigns] = await Promise.all([
    all<{ id: string; employee_id: string; kind: "in" | "out"; at: string; day: string; source: Source; offline: number; note: string | null; distance_m: number | null }>(
      `SELECT id, employee_id, kind, at, day, source, offline, note, distance_m FROM att_events WHERE voided = 0 AND day >= ? AND day <= ? AND employee_id IN (${ph}) ORDER BY at`,
      from,
      to,
      ...ids,
    ),
    all<{ employee_id: string; day: string; status: MarkStatus; in_time: string | null; out_time: string | null; note: string | null; source: "lead" | "hr"; reviewed_at: string | null }>(
      `SELECT employee_id, day, status, in_time, out_time, note, source, reviewed_at FROM att_marks WHERE day >= ? AND day <= ? AND employee_id IN (${ph})`,
      from,
      to,
      ...ids,
    ),
    all<{ employee_id: string; start_date: string; end_date: string; half_day: number; label: string | null; paid: number | null }>(
      `SELECT r.employee_id, r.start_date, r.end_date, r.half_day, t.label, t.paid FROM leave_requests r LEFT JOIN leave_types t ON t.key = r.type_key
       WHERE r.status = 'approved' AND r.start_date <= ? AND r.end_date >= ? AND r.employee_id IN (${ph})`,
      to,
      from,
      ...ids,
    ),
    all<AssignRow>(`SELECT employee_id, shift_key, rota, rota_start FROM att_shift_assign WHERE employee_id IN (${ph})`, ...ids),
  ]);
  const holidays = new Map(s.calendar.holidays.map((h) => [h.date, h.name]));
  const now = localParts(nowIso(), tz);
  // Nothing counts before attendance started, so nobody is absent for days before it existed.
  const countFrom = opts.allDays ? from : cfg.startDate ?? (await get<{ d: string | null }>("SELECT MIN(d) AS d FROM (SELECT MIN(day) AS d FROM att_events UNION ALL SELECT MIN(day) FROM att_marks) x"))?.d ?? now.date;
  const shiftFor = (id: string, day: string) => pickShift(cfg, shiftKeyOn(toAssign(assigns.find((a) => a.employee_id === id)), day, cfg.defaultShift));
  for (const e of emps) {
    const evByDay = new Map<string, EventRow[]>();
    for (const ev of events.filter((x) => x.employee_id === e.id)) {
      const list = evByDay.get(ev.day) ?? [];
      // A night shift's check-out after midnight counts on from the day it started.
      const lp = localParts(ev.at, tz);
      list.push({ id: ev.id, kind: ev.kind, at: ev.at, minutes: lp.minutes + (lp.date > ev.day ? 24 * 60 : 0), source: ev.source, offline: !!ev.offline, note: ev.note, distanceM: ev.distance_m === null ? null : Number(ev.distance_m) });
      evByDay.set(ev.day, list);
    }
    const days: DayResult[] = [];
    for (const day of daysBetween(from, to)) {
      if (day < countFrom || (e.start_date && day < e.start_date) || (e.end_date && day > e.end_date)) continue;
      const m = marks.find((x) => x.employee_id === e.id && x.day === day);
      const lv = leaves.find((x) => x.employee_id === e.id && x.start_date <= day && x.end_date >= day);
      const mark: DayMark | null = m
        ? { status: m.status, inMin: m.in_time ? toMin(m.in_time) : null, outMin: m.out_time ? toMin(m.out_time) : null, note: m.note, source: m.source, reviewed: !!m.reviewed_at || m.source === "hr" }
        : null;
      days.push(
        computeDay({
          date: day,
          shift: shiftFor(e.id, day),
          events: (evByDay.get(day) ?? []).map((x): DayEvent => ({ kind: x.kind, minutes: x.minutes, source: x.source })),
          leave: lv ? { label: lv.label ?? "Leave", paid: lv.paid === null ? true : !!lv.paid, half: !!lv.half_day } : null,
          holiday: holidays.get(day) ?? null,
          mark,
          now,
          rules: cfg,
        }),
      );
    }
    out.set(e.id, { days, events: evByDay });
  }
  return out;
}

const EMP_SELECT = "SELECT id, code, full_name, department, job_title, user_id, manager_id, start_date, end_date, status FROM employees";

async function employeesFor(user: AppUser, opts: { includeSelf?: boolean } = {}): Promise<Emp[]> {
  const v = await visible(user);
  const me = await myEmployeeId(user);
  if (v.all) return all<Emp>(`${EMP_SELECT} WHERE status <> 'left' ORDER BY full_name`);
  const ids = [...new Set([...v.ids, ...(opts.includeSelf && me ? [me] : [])])];
  if (!ids.length) return [];
  return all<Emp>(`${EMP_SELECT} WHERE status <> 'left' AND id IN (${ids.map(() => "?").join(",")}) ORDER BY full_name`, ...ids);
}

async function tzNow() {
  const tz = (await getSettings()).workspace.timezone;
  return { tz, ...localParts(nowIso(), tz) };
}

// ---------------------------------------------------------------------------
// My attendance
// ---------------------------------------------------------------------------

export async function myAttendance(user: AppUser, month: string) {
  const employeeId = await myEmployeeId(user);
  const cfg = await attendanceConfig();
  if (!employeeId) return { employeeId: null as string | null, cfg, today: null, events: [] as EventRow[], days: [] as DayResult[], totals: null as MonthTotals | null, shift: null as Shift | null, code: null as string | null, hasPin: false, face: null as { enrolledAt: string; samples: number } | null, corrections: [] as CorrectionRow[] };
  const emp = (await get<Emp>(`${EMP_SELECT} WHERE id = ?`, employeeId))!;
  const { date } = await tzNow();
  const r = monthRange(month);
  const [range, todayData, badge] = await Promise.all([
    loadDays([emp], r.from, r.to),
    loadDays([emp], date, date),
    get<{ pin_hash: string | null }>("SELECT pin_hash FROM att_badges WHERE employee_id = ?", employeeId),
  ]);
  const mine = range.get(employeeId)!;
  const t = todayData.get(employeeId)!;
  return {
    employeeId,
    cfg,
    today: t.days[0] ?? null,
    events: t.events.get(date) ?? [],
    days: mine.days,
    totals: monthTotals(mine.days.filter((d) => d.date <= date)),
    shift: await shiftOf(employeeId, cfg),
    code: emp.code,
    hasPin: !!badge?.pin_hash,
    face: await (await import("./attendance-face")).faceStatus(employeeId),
    corrections: (await corrections(user)).mine,
  };
}

// Writes one check-in or check-out, turning the last one of the day around.
async function punch(
  employeeId: string,
  input: { at?: string; source: Source; kioskId?: string | null; lat?: number | null; lng?: number | null; accuracy?: number | null; distanceM?: number | null; offline?: boolean; clientId?: string | null; note?: string | null; createdBy?: string | null },
) {
  const tz = (await getSettings()).workspace.timezone;
  const at = input.at ?? nowIso();
  const lp = localParts(at, tz);
  let day = lp.date;
  // Early morning, after a night shift that started yesterday and is still open: this closes yesterday.
  const yesterday = new Date(Date.parse(`${day}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const prevShift = await shiftOf(employeeId, undefined, yesterday);
  if (overnight(prevShift) && lp.minutes <= toMin(prevShift.end) + 4 * 60) {
    const open = await get<{ kind: string }>("SELECT kind FROM att_events WHERE employee_id = ? AND day = ? AND voided = 0 ORDER BY at DESC LIMIT 1", employeeId, yesterday);
    if (open?.kind === "in") day = yesterday;
  }
  const prev = await get<{ kind: "in" | "out"; at: string }>("SELECT kind, at FROM att_events WHERE employee_id = ? AND day = ? AND voided = 0 AND at <= ? ORDER BY at DESC LIMIT 1", employeeId, day, at);
  // A second scan within a minute is the same check-in, not a check-out.
  if (prev && Math.abs(Date.parse(at) - Date.parse(prev.at)) < 60e3) return { kind: prev.kind, at: prev.at, day, duplicate: true };
  const kind: "in" | "out" = prev?.kind === "in" ? "out" : "in";
  await run(
    `INSERT INTO att_events (id, employee_id, kind, at, day, source, kiosk_id, lat, lng, accuracy, distance_m, offline, client_id, note, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uid("att_"),
    employeeId,
    kind,
    at,
    day,
    input.source,
    input.kioskId ?? null,
    input.lat ?? null,
    input.lng ?? null,
    input.accuracy ?? null,
    input.distanceM ?? null,
    input.offline ? 1 : 0,
    input.clientId ?? null,
    input.note ?? null,
    input.createdBy ?? null,
    nowIso(),
  );
  return { kind, at, day, duplicate: false };
}

async function dayLine(employeeId: string, day: string) {
  const emp = await get<Emp>(`${EMP_SELECT} WHERE id = ?`, employeeId);
  if (!emp) return null;
  return (await loadDays([emp], day, day)).get(employeeId)?.days[0] ?? null;
}

// Checking in from the app: anywhere when the app is allowed, or from a phone within the site's radius.
export async function punchSelf(user: AppUser, input: { lat?: number | null; lng?: number | null; accuracy?: number | null }) {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
  const cfg = await attendanceConfig();
  const hasLoc = Number.isFinite(Number(input.lat)) && Number.isFinite(Number(input.lng)) && input.lat !== null && input.lng !== null;
  let distance: number | null = null;
  if (hasLoc && cfg.site.lat !== null && cfg.site.lng !== null) distance = Math.round(distanceM({ lat: Number(input.lat), lng: Number(input.lng) }, { lat: cfg.site.lat, lng: cfg.site.lng }));
  let source: Source = "web";
  if (!cfg.methods.web) {
    if (!cfg.methods.mobile) throw new WorkflowError("FORBIDDEN", "Check in at the kiosk at the entrance.");
    if (!hasLoc) throw new WorkflowError("VALIDATION", "Allow location so the app can check you are at the site.");
    if (distance === null || distance > cfg.site.radiusM + Math.min(100, Number(input.accuracy) || 0))
      throw new WorkflowError("VALIDATION", `You are about ${distance ?? "?"} m from ${cfg.site.label}. Check in when you are there, or at the kiosk.`);
    source = "mobile";
  }
  const r = await punch(employeeId, { source, lat: hasLoc ? Number(input.lat) : null, lng: hasLoc ? Number(input.lng) : null, accuracy: hasLoc ? Number(input.accuracy) || null : null, distanceM: distance, createdBy: user.id });
  // Not "duplicate": the action wrapper treats that key as an idempotent replay and drops the data.
  return { kind: r.kind, at: r.at, day: r.day, repeat: r.duplicate, line: await dayLine(employeeId, r.day) };
}

// ---------------------------------------------------------------------------
// The daily board and a lead's day records
// ---------------------------------------------------------------------------

export type BoardRow = { employeeId: string; name: string; code: string; department: string | null; jobTitle: string | null; shift: string; result: DayResult; events: EventRow[] };

export async function dailyBoard(user: AppUser, day: string) {
  if (!isDay(day)) throw new WorkflowError("VALIDATION", "Choose a day.");
  const emps = await employeesFor(user);
  const cfg = await attendanceConfig();
  // The board lists everyone on any day, so a lead can record days before the first check-in.
  const data = await loadDays(emps, day, day, { allDays: true });
  const depts = new Map((await hrDepartments()).map((d) => [d.key, d.label]));
  const rows: BoardRow[] = [];
  for (const e of emps) {
    const d = data.get(e.id);
    const result = d?.days[0];
    if (!result) continue;
    const shift = await shiftOf(e.id, cfg, day);
    rows.push({ employeeId: e.id, name: e.full_name, code: e.code, department: e.department ? (depts.get(e.department) ?? e.department) : null, jobTitle: e.job_title, shift: shift.label, result, events: d.events.get(day) ?? [] });
  }
  const count = (st: string) => rows.filter((r) => r.result.status === st).length;
  return {
    day,
    rows,
    counts: { present: count("present"), late: count("late"), half_day: count("half_day"), absent: count("absent"), leave: count("leave"), not_in: count("not_in"), off: count("off") + count("holiday"), total: rows.length },
    kioskDown: await silentKiosks(),
  };
}

export async function markDay(user: AppUser, input: { employeeId: string; day: string; status: MarkStatus; inTime?: string | null; outTime?: string | null; note?: string | null }) {
  const hr = managesAttendance(user);
  const me = await myEmployeeId(user);
  if (input.employeeId === me && !hr) throw new WorkflowError("FORBIDDEN", "Your line manager or HR records your day.");
  if (!hr && !(await teamIds(user)).includes(input.employeeId)) throw new WorkflowError("FORBIDDEN", "You record days only for your own team.");
  if (!isDay(input.day)) throw new WorkflowError("VALIDATION", "Choose the day.");
  const { date } = await tzNow();
  if (input.day > date) throw new WorkflowError("VALIDATION", "Days in the future cannot be recorded yet.");
  if (!MARK_STATUSES.includes(input.status)) throw new WorkflowError("VALIDATION", "Choose present, late, absent, half day or on leave.");
  const inTime = input.inTime || null;
  const outTime = input.outTime || null;
  if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) throw new WorkflowError("VALIDATION", "Times are HH:MM.");
  if (inTime && outTime && toMin(outTime) <= toMin(inTime) && !overnight(await shiftOf(input.employeeId, undefined, input.day)))
    throw new WorkflowError("VALIDATION", "The time out is before the time in.");
  const note = clean(input.note, 300) || null;
  if (!note) throw new WorkflowError("VALIDATION", "Give the reason, for example \"kiosk broken\" or \"called in sick\". HR reviews it.");
  const emp = await get<{ full_name: string; user_id: string | null }>("SELECT full_name, user_id FROM employees WHERE id = ?", input.employeeId);
  if (!emp) throw new WorkflowError("NOT_FOUND", "Employee not found.");
  const now = nowIso();
  await run(
    `INSERT INTO att_marks (employee_id, day, status, in_time, out_time, note, source, set_by, set_at, reviewed_by, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id, day) DO UPDATE SET status = excluded.status, in_time = excluded.in_time, out_time = excluded.out_time, note = excluded.note,
       source = excluded.source, set_by = excluded.set_by, set_at = excluded.set_at, reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`,
    input.employeeId,
    input.day,
    input.status,
    inTime,
    outTime,
    note,
    hr ? "hr" : "lead",
    user.id,
    now,
    hr ? user.id : null,
    hr ? now : null,
  );
  const what = `${DAY_STATUS_LABELS[input.status]}${inTime ? ` ${inTime}` : ""}${outTime ? ` to ${outTime}` : ""} on ${input.day}`;
  await audit({ actor: user }, { itemId: input.employeeId, action: "attendance.mark", summary: `${user.name} recorded ${emp.full_name}: ${what}`, reason: note });
  if (emp.user_id) await notify([emp.user_id], { type: "hr", title: `Your day was recorded: ${DAY_STATUS_LABELS[input.status]}`, body: `${user.name}: ${what}. ${note}`, link: "/attendance" }, now, user.id);
}

export async function clearMark(user: AppUser, employeeId: string, day: string) {
  const hr = managesAttendance(user);
  const m = await get<{ set_by: string | null }>("SELECT set_by FROM att_marks WHERE employee_id = ? AND day = ?", employeeId, day);
  if (!m) return;
  if (!hr && m.set_by !== user.id) throw new WorkflowError("FORBIDDEN", "Only the person who recorded it, or HR, can remove it.");
  await run("DELETE FROM att_marks WHERE employee_id = ? AND day = ?", employeeId, day);
  await audit({ actor: user }, { itemId: employeeId, action: "attendance.mark", summary: `${user.name} removed the hand-made record for ${day}` });
}

// Lead records HR has not looked at yet.
export async function reviewQueue(user: AppUser) {
  needManage(user);
  return all<{ employee_id: string; day: string; status: MarkStatus; in_time: string | null; out_time: string | null; note: string | null; set_at: string; full_name: string; set_by_name: string | null }>(
    `SELECT m.employee_id, m.day, m.status, m.in_time, m.out_time, m.note, m.set_at, e.full_name, u.name AS set_by_name
     FROM att_marks m JOIN employees e ON e.id = m.employee_id LEFT JOIN users u ON u.id = m.set_by
     WHERE m.source = 'lead' AND m.reviewed_at IS NULL ORDER BY m.day DESC, e.full_name LIMIT 500`,
  );
}

export async function reviewMarks(user: AppUser, keys: { employeeId: string; day: string }[]) {
  needManage(user);
  const now = nowIso();
  for (const k of keys.slice(0, 500)) await run("UPDATE att_marks SET reviewed_by = ?, reviewed_at = ? WHERE employee_id = ? AND day = ? AND reviewed_at IS NULL", user.id, now, k.employeeId, k.day);
  await audit({ actor: user }, { action: "attendance.review", summary: `${user.name} reviewed ${keys.length} hand-made attendance ${keys.length === 1 ? "record" : "records"}` });
}

// ---------------------------------------------------------------------------
// Corrections
// ---------------------------------------------------------------------------

export type CorrectionRow = {
  id: string;
  employee_id: string;
  full_name: string;
  day: string;
  in_time: string | null;
  out_time: string | null;
  reason: string;
  status: CorrectionStatus;
  approver_id: string | null;
  approver_name: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
};

const CORR_SELECT = `SELECT c.*, e.full_name, a.name AS approver_name, d.name AS decided_by_name FROM att_corrections c JOIN employees e ON e.id = c.employee_id
  LEFT JOIN users a ON a.id = c.approver_id LEFT JOIN users d ON d.id = c.decided_by`;

export async function corrections(user: AppUser) {
  const me = await myEmployeeId(user);
  const hr = managesAttendance(user);
  const [mine, toDecide, recent] = await Promise.all([
    me ? all<CorrectionRow>(`${CORR_SELECT} WHERE c.employee_id = ? ORDER BY c.created_at DESC LIMIT 50`, me) : Promise.resolve([] as CorrectionRow[]),
    all<CorrectionRow>(`${CORR_SELECT} WHERE (c.status = 'pending_lead' AND c.approver_id = ?) ${hr ? "OR c.status IN ('pending_lead','pending_hr')" : ""} ORDER BY c.created_at`, user.id),
    hr ? all<CorrectionRow>(`${CORR_SELECT} ORDER BY c.created_at DESC LIMIT 200`) : Promise.resolve([] as CorrectionRow[]),
  ]);
  return { mine, toDecide: toDecide.filter((c) => c.employee_id !== me), recent };
}

export async function requestCorrection(user: AppUser, input: { day: string; inTime?: string | null; outTime?: string | null; reason: string }) {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet.");
  if (!isDay(input.day)) throw new WorkflowError("VALIDATION", "Choose the day.");
  const { date } = await tzNow();
  if (input.day > date) throw new WorkflowError("VALIDATION", "Choose a day that has passed or today.");
  const inTime = input.inTime || null;
  const outTime = input.outTime || null;
  if (!inTime && !outTime) throw new WorkflowError("VALIDATION", "Give the right time in, time out, or both.");
  if ((inTime && !isTime(inTime)) || (outTime && !isTime(outTime))) throw new WorkflowError("VALIDATION", "Times are HH:MM.");
  if (inTime && outTime && toMin(outTime) <= toMin(inTime) && !overnight(await shiftOf(employeeId, undefined, input.day)))
    throw new WorkflowError("VALIDATION", "The time out is before the time in.");
  const reason = clean(input.reason, 300);
  if (!reason) throw new WorkflowError("VALIDATION", "Say what happened, for example \"forgot to check out\".");
  if (await get("SELECT 1 AS x FROM att_corrections WHERE employee_id = ? AND day = ? AND status IN ('pending_lead','pending_hr')", employeeId, input.day))
    throw new WorkflowError("VALIDATION", "You already asked for a correction of this day.");
  const mgr = await get<{ user_id: string | null; status: string }>("SELECT m.user_id, m.status FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.id = ?", employeeId);
  const approver = mgr?.user_id && mgr.status !== "left" && mgr.user_id !== user.id ? mgr.user_id : null;
  const id = uid("atc_");
  const now = nowIso();
  await run(
    "INSERT INTO att_corrections (id, employee_id, day, in_time, out_time, reason, status, approver_id, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    employeeId,
    input.day,
    inTime,
    outTime,
    reason,
    approver ? "pending_lead" : "pending_hr",
    approver,
    user.id,
    now,
  );
  const what = `${input.day}: ${inTime ? `in ${inTime}` : ""}${inTime && outTime ? ", " : ""}${outTime ? `out ${outTime}` : ""}. ${reason}`;
  await notify(approver ? [approver] : await managerIds(), { type: "approval", title: `Attendance correction: ${user.name}`, body: what, link: "/attendance?tab=corrections", dedupeKey: `att-corr:${id}` }, now, user.id);
  await audit({ actor: user }, { itemId: employeeId, action: "attendance.correction", summary: `${user.name} asked to correct ${what}` });
  return id;
}

export async function decideCorrection(user: AppUser, id: string, input: { decision: "approve" | "reject"; note?: string | null }) {
  const c = await get<CorrectionRow>(`${CORR_SELECT} WHERE c.id = ?`, id);
  if (!c) throw new WorkflowError("NOT_FOUND", "Correction not found.");
  if (!["pending_lead", "pending_hr"].includes(c.status)) throw new WorkflowError("INVALID_STATE", "This correction was already decided.");
  const hr = managesAttendance(user);
  if (!(hr || (c.status === "pending_lead" && c.approver_id === user.id))) throw new WorkflowError("FORBIDDEN", "The line manager or HR decides this.");
  if ((await myEmployeeId(user)) === c.employee_id) throw new WorkflowError("FORBIDDEN", "Someone else decides your own correction.");
  const note = clean(input.note, 300) || null;
  if (input.decision === "reject" && !note) throw new WorkflowError("VALIDATION", "Say why it is not approved.");
  const now = nowIso();
  const tz = (await getSettings()).workspace.timezone;
  const shift = await shiftOf(c.employee_id, undefined, c.day);
  const nextDay = new Date(Date.parse(`${c.day}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  // On a night shift, a time earlier than the start is the next morning.
  const when = (time: string) => localToIso(overnight(shift) && toMin(time) < toMin(shift.start) ? nextDay : c.day, time, tz);
  await tx(async () => {
    await run("UPDATE att_corrections SET status = ?, decided_by = ?, decided_at = ?, decision_note = ? WHERE id = ?", input.decision === "approve" ? "approved" : "rejected", user.id, now, note, id);
    if (input.decision === "approve") {
      // The corrected time replaces that day's check-ins of the same kind; the old ones stay, voided, for the trail.
      for (const [kind, time] of [["in", c.in_time], ["out", c.out_time]] as const) {
        if (!time) continue;
        await run("UPDATE att_events SET voided = 1 WHERE employee_id = ? AND day = ? AND kind = ? AND voided = 0", c.employee_id, c.day, kind);
        await run(
          "INSERT INTO att_events (id, employee_id, kind, at, day, source, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'correction', ?, ?, ?)",
          uid("att_"),
          c.employee_id,
          kind,
          when(time),
          c.day,
          `Correction approved by ${user.name}: ${c.reason}`,
          user.id,
          now,
        );
      }
    }
  });
  const emp = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", c.employee_id);
  if (emp?.user_id)
    await notify([emp.user_id], { type: "hr", title: input.decision === "approve" ? "Attendance correction approved" : "Attendance correction not approved", body: `${c.day}${note ? `. ${note}` : ""}`, link: "/attendance" }, now, user.id);
  await audit({ actor: user }, { itemId: c.employee_id, action: "attendance.correction", summary: `${user.name} ${input.decision === "approve" ? "approved" : "did not approve"} ${c.full_name}'s correction for ${c.day}`, reason: note });
}

export async function cancelCorrection(user: AppUser, id: string) {
  const me = await myEmployeeId(user);
  const c = await get<{ employee_id: string; status: string }>("SELECT employee_id, status FROM att_corrections WHERE id = ?", id);
  if (!c || c.employee_id !== me) throw new WorkflowError("FORBIDDEN", "You can cancel only your own corrections.");
  if (!["pending_lead", "pending_hr"].includes(c.status)) throw new WorkflowError("INVALID_STATE", "This correction was already decided.");
  await run("UPDATE att_corrections SET status = 'cancelled' WHERE id = ?", id);
}

// ---------------------------------------------------------------------------
// Monthly timesheets and payroll
// ---------------------------------------------------------------------------

export type TimesheetRow = { employeeId: string; name: string; code: string; department: string | null; totals: MonthTotals; unpaidDays: number; overtimeHours: number; days: DayResult[] };

export async function timesheets(user: AppUser, month: string): Promise<TimesheetRow[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new WorkflowError("VALIDATION", "Choose the month.");
  const emps = await employeesFor(user);
  return sheetFor(emps, month);
}

async function sheetFor(emps: Emp[], month: string): Promise<TimesheetRow[]> {
  const r = monthRange(month);
  const { date } = await tzNow();
  const to = r.to < date ? r.to : date;
  if (to < r.from) return emps.map((e) => ({ employeeId: e.id, name: e.full_name, code: e.code, department: e.department, totals: monthTotals([]), unpaidDays: 0, overtimeHours: 0, days: [] }));
  const data = await loadDays(emps, r.from, to);
  const depts = new Map((await hrDepartments()).map((d) => [d.key, d.label]));
  return emps.map((e) => {
    // Today counts once it is over; until then it is still being worked.
    const days = (data.get(e.id)?.days ?? []).filter((d) => d.status !== "not_in");
    const totals = monthTotals(days);
    return { employeeId: e.id, name: e.full_name, code: e.code, department: e.department ? (depts.get(e.department) ?? e.department) : null, totals, unpaidDays: unpaidDays(totals), overtimeHours: overtimeHours(totals), days };
  });
}

// What payroll takes for a month: overtime hours and unpaid days per employee.
export async function payrollFeed(period: string, employeeIds: string[]) {
  if (!employeeIds.length) return new Map<string, { overtimeHours: number; unpaidDays: number }>();
  const emps = await all<Emp>(`${EMP_SELECT} WHERE id IN (${employeeIds.map(() => "?").join(",")})`, ...employeeIds);
  const rows = await sheetFor(emps, period);
  return new Map(rows.map((r) => [r.employeeId, { overtimeHours: r.overtimeHours, unpaidDays: r.unpaidDays }]));
}

// ---------------------------------------------------------------------------
// Shifts, PINs and badges
// ---------------------------------------------------------------------------

export async function peopleSetup(user: AppUser) {
  needManage(user);
  const cfg = await attendanceConfig();
  const rows = await all<{ id: string; code: string; full_name: string; department: string | null; shift_key: string | null; rota: string | null; pin_hash: string | null; badge: string | null }>(
    `SELECT e.id, e.code, e.full_name, e.department, s.shift_key, s.rota, b.pin_hash, b.badge FROM employees e
     LEFT JOIN att_shift_assign s ON s.employee_id = e.id LEFT JOIN att_badges b ON b.employee_id = e.id
     WHERE e.status <> 'left' ORDER BY e.full_name`,
  );
  const faces = new Set(await (await import("./attendance-face")).enrolledIds());
  return rows.map((r) => ({ id: r.id, code: r.code, name: r.full_name, department: r.department, shift: r.shift_key ?? cfg.defaultShift, rota: parseJson<string[] | null>(r.rota, null), hasPin: !!r.pin_hash, badge: r.badge, face: faces.has(r.id) }));
}

export async function assignShift(user: AppUser, employeeIds: string[], shiftKey: string) {
  needManage(user);
  const cfg = await attendanceConfig();
  const shift = cfg.shifts.find((s) => s.key === shiftKey);
  if (!shift) throw new WorkflowError("VALIDATION", "Choose a shift.");
  const now = nowIso();
  for (const id of employeeIds.slice(0, 1000))
    await run(
      `INSERT INTO att_shift_assign (employee_id, shift_key, rota, rota_start, updated_by, updated_at) VALUES (?, ?, NULL, NULL, ?, ?)
       ON CONFLICT (employee_id) DO UPDATE SET shift_key = excluded.shift_key, rota = NULL, rota_start = NULL, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      id,
      shiftKey,
      user.id,
      now,
    );
  await audit({ actor: user }, { action: "attendance.settings", summary: `${user.name} put ${employeeIds.length} ${employeeIds.length === 1 ? "person" : "people"} on the ${shift.label} shift` });
}

// A rota: one shift per week, repeating, from the week of the start date.
export async function assignRota(user: AppUser, employeeIds: string[], keys: string[], startDate: string) {
  needManage(user);
  const cfg = await attendanceConfig();
  const rota = keys.filter((k) => cfg.shifts.some((s) => s.key === k)).slice(0, 4);
  if (rota.length < 2) throw new WorkflowError("VALIDATION", "A rota needs at least two weeks; for one shift, use Put on shift.");
  if (!isDay(startDate)) throw new WorkflowError("VALIDATION", "Choose the week the rota starts.");
  const wso = (await getSettings()).workspace.weekStartsOn;
  const t = new Date(`${startDate}T12:00:00Z`);
  const weekStart = new Date(t.getTime() - ((t.getUTCDay() - wso + 7) % 7) * 864e5).toISOString().slice(0, 10);
  const now = nowIso();
  for (const id of employeeIds.slice(0, 1000))
    await run(
      `INSERT INTO att_shift_assign (employee_id, shift_key, rota, rota_start, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (employee_id) DO UPDATE SET shift_key = excluded.shift_key, rota = excluded.rota, rota_start = excluded.rota_start, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      id,
      rota[0]!,
      JSON.stringify(rota),
      weekStart,
      user.id,
      now,
    );
  await audit({ actor: user }, { action: "attendance.settings", summary: `${user.name} put ${employeeIds.length} ${employeeIds.length === 1 ? "person" : "people"} on a ${rota.length}-week rota from ${weekStart}` });
}

async function upsertBadge(employeeId: string, patch: { pinHash?: string | null; badge?: string | null }) {
  const cur = await get<{ pin_hash: string | null; badge: string | null }>("SELECT pin_hash, badge FROM att_badges WHERE employee_id = ?", employeeId);
  await run(
    `INSERT INTO att_badges (employee_id, pin_hash, badge, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (employee_id) DO UPDATE SET pin_hash = excluded.pin_hash, badge = excluded.badge, updated_at = excluded.updated_at`,
    employeeId,
    patch.pinHash === undefined ? (cur?.pin_hash ?? null) : patch.pinHash,
    patch.badge === undefined ? (cur?.badge ?? null) : patch.badge,
    nowIso(),
  );
}

const pinOk = (pin: string) => /^\d{4,6}$/.test(pin) && !/^(\d)\1+$/.test(pin) && !"0123456789".includes(pin) && !"9876543210".includes(pin);

export async function setOwnPin(user: AppUser, pin: string) {
  const employeeId = await myEmployeeId(user);
  if (!employeeId) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet.");
  if (!pinOk(pin)) throw new WorkflowError("VALIDATION", "Use 4 to 6 digits, not all the same and not in a row (like 1234).");
  await upsertBadge(employeeId, { pinHash: hashPassword(pin) });
  await audit({ actor: user }, { itemId: employeeId, action: "attendance.pin", summary: `${user.name} set their kiosk PIN` });
}

// HR sets a starting PIN (shown once) and prints badges.
export async function resetPin(user: AppUser, employeeId: string) {
  needManage(user);
  let pin = "";
  do pin = String(crypto.randomInt(100000, 999999));
  while (!pinOk(pin));
  await upsertBadge(employeeId, { pinHash: hashPassword(pin) });
  await audit({ actor: user }, { itemId: employeeId, action: "attendance.pin", summary: `${user.name} set a new kiosk PIN` });
  return pin;
}

export async function newBadges(user: AppUser, employeeIds: string[]) {
  needManage(user);
  for (const id of employeeIds.slice(0, 1000)) await upsertBadge(id, { badge: `MYB-${crypto.randomBytes(9).toString("base64url")}` });
  await audit({ actor: user }, { action: "attendance.badge", summary: `${user.name} made new badges for ${employeeIds.length} ${employeeIds.length === 1 ? "person" : "people"}; old badges stop working` });
}

export async function badgesFor(user: AppUser, employeeIds: string[]) {
  needManage(user);
  if (!employeeIds.length) return [];
  return all<{ id: string; code: string; full_name: string; job_title: string | null; badge: string | null }>(
    `SELECT e.id, e.code, e.full_name, e.job_title, b.badge FROM employees e LEFT JOIN att_badges b ON b.employee_id = e.id WHERE e.id IN (${employeeIds.map(() => "?").join(",")}) ORDER BY e.full_name`,
    ...employeeIds,
  );
}

// ---------------------------------------------------------------------------
// Kiosks
// ---------------------------------------------------------------------------

export const KIOSK_COOKIE = "myseed_kiosk";
type KioskRow = { id: string; name: string; active: number; last_seen_at: string | null; alerted_at: string | null; sign_key: string | null; setup_expires: string | null; token_hash: string | null; created_at: string };

export async function listKiosks(user: AppUser) {
  needManage(user);
  const rows = await all<KioskRow>("SELECT id, name, active, last_seen_at, alerted_at, setup_expires, token_hash, created_at FROM att_kiosks ORDER BY created_at");
  return rows.map((k) => ({ id: k.id, name: k.name, active: !!k.active, lastSeenAt: k.last_seen_at, paired: !!k.token_hash, setupExpires: k.setup_expires, createdAt: k.created_at }));
}

// A setup code links one tablet or laptop to the kiosk; it works once, within a day.
async function setupCode(id: string) {
  const code = crypto.randomBytes(18).toString("base64url");
  await run("UPDATE att_kiosks SET setup_hash = ?, setup_expires = ? WHERE id = ?", sha(code), new Date(Date.now() + 864e5).toISOString(), id);
  return code;
}

export async function createKiosk(user: AppUser, name: string) {
  needManage(user);
  const n = clean(name, 60);
  if (!n) throw new WorkflowError("VALIDATION", "Name the kiosk, for example \"Main entrance\".");
  const id = uid("kio_");
  await run("INSERT INTO att_kiosks (id, name, active, created_by, created_at) VALUES (?, ?, 1, ?, ?)", id, n, user.id, nowIso());
  await audit({ actor: user }, { action: "attendance.kiosk", summary: `${user.name} added the kiosk ${n}` });
  return { id, code: await setupCode(id) };
}

export async function pairAgain(user: AppUser, id: string) {
  needManage(user);
  await run("UPDATE att_kiosks SET token_hash = NULL WHERE id = ?", id);
  await audit({ actor: user }, { action: "attendance.kiosk", summary: `${user.name} unpaired a kiosk to set it up again` });
  return { id, code: await setupCode(id) };
}

export async function setKioskActive(user: AppUser, id: string, active: boolean) {
  needManage(user);
  await run("UPDATE att_kiosks SET active = ?, token_hash = CASE WHEN ? = 1 THEN token_hash ELSE NULL END WHERE id = ?", active ? 1 : 0, active ? 1 : 0, id);
  await audit({ actor: user }, { action: "attendance.kiosk", summary: `${user.name} ${active ? "switched on" : "switched off and unpaired"} a kiosk` });
}

// The setup code becomes the device's own token (kept in a cookie) and a signing key for check-ins kept offline.
export async function pairKiosk(code: string) {
  const k = await get<KioskRow & { setup_hash: string }>("SELECT * FROM att_kiosks WHERE setup_hash = ? AND active = 1", sha(code));
  if (!k || !k.setup_expires || k.setup_expires < nowIso()) return null;
  const token = crypto.randomBytes(32).toString("base64url");
  const signKey = crypto.randomBytes(32).toString("base64url");
  await run("UPDATE att_kiosks SET token_hash = ?, sign_key = ?, setup_hash = NULL, setup_expires = NULL, last_seen_at = ? WHERE id = ?", sha(token), signKey, nowIso(), k.id);
  return token;
}

export async function kioskFromToken(token: string | null | undefined) {
  if (!token) return null;
  return (await get<KioskRow>("SELECT * FROM att_kiosks WHERE token_hash = ? AND active = 1", sha(token))) ?? null;
}

export async function kioskPing(k: KioskRow) {
  await run("UPDATE att_kiosks SET last_seen_at = ?, alerted_at = NULL WHERE id = ?", nowIso(), k.id);
  const cfg = await attendanceConfig();
  const s = await getSettings();
  return { name: k.name, signKey: k.sign_key, kioskOn: cfg.methods.kiosk, faceOn: cfg.methods.face, timezone: s.workspace.timezone, workspace: s.workspace.name, offlineMaxHours: cfg.offlineMaxHours };
}

// Wrong PINs lock that employee number on that kiosk for ten minutes after five tries.
const failures = new Map<string, { n: number; until: number }>();

function normalizeCode(v: string) {
  const s = v.trim().toUpperCase();
  if (/^\d{1,6}$/.test(s)) return `EMP-${s.padStart(3, "0")}`;
  if (/^EMP-?\d{1,6}$/.test(s)) return `EMP-${s.replace(/\D/g, "").padStart(3, "0")}`;
  return s;
}

export type KioskPunchInput = { badge?: string | null; code?: string | null; pin?: string | null; face?: number[] | null; at?: string | null; clientId?: string | null; sig?: string | null };

export async function kioskPunch(k: KioskRow, input: KioskPunchInput) {
  const cfg = await attendanceConfig();
  if (!cfg.methods.kiosk) throw new WorkflowError("FORBIDDEN", "Kiosk check-in is switched off. Ask HR.");
  let at = nowIso();
  let offline = false;
  if (input.at) {
    // Check-ins kept while offline carry their real time, signed by this kiosk so they cannot be changed.
    const cred = input.badge ?? input.code ?? "";
    const expected = crypto.createHmac("sha256", k.sign_key ?? "").update(`${input.clientId ?? ""}|${input.at}|${cred}`).digest("base64url");
    const sig = input.sig ?? "";
    if (!k.sign_key || sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) throw new WorkflowError("FORBIDDEN", "This saved check-in is not signed by this kiosk.");
    const t = Date.parse(input.at);
    if (!Number.isFinite(t) || t > Date.now() + 5 * 60e3) throw new WorkflowError("VALIDATION", "The saved time is in the future.");
    if (t < Date.now() - cfg.offlineMaxHours * 36e5) throw new WorkflowError("VALIDATION", `Saved check-ins older than ${cfg.offlineMaxHours} hours are not accepted. Ask HR to record the day.`);
    at = new Date(t).toISOString();
    offline = Date.now() - t > 2 * 60e3;
    if (input.clientId && (await get("SELECT 1 AS x FROM att_events WHERE kiosk_id = ? AND client_id = ?", k.id, input.clientId))) return { duplicate: true, name: "", kind: "in" as const, at, line: null };
  }
  let emp: { id: string; full_name: string; preferred_name: string | null } | undefined;
  let source: Source;
  if (input.face) {
    // Face check-in is live only: a saved offline check-in uses the badge or PIN.
    if (!cfg.methods.face) throw new WorkflowError("FORBIDDEN", "Face check-in is switched off. Use your badge or PIN.");
    if (input.at) throw new WorkflowError("VALIDATION", "Face check-in needs the network. Use your badge or PIN.");
    const { matchFace } = await import("./attendance-face");
    const id = await matchFace(input.face, cfg.faceThreshold);
    if (!id) throw new WorkflowError("NOT_FOUND", "Your face was not recognised. Use your badge or PIN.");
    emp = await get("SELECT id, full_name, preferred_name FROM employees WHERE id = ? AND status <> 'left'", id);
    if (!emp) throw new WorkflowError("NOT_FOUND", "Your face was not recognised. Use your badge or PIN.");
    source = "kiosk_face";
  } else if (input.badge) {
    emp = await get("SELECT e.id, e.full_name, e.preferred_name FROM att_badges b JOIN employees e ON e.id = b.employee_id WHERE b.badge = ? AND e.status <> 'left'", clean(input.badge, 80));
    if (!emp) throw new WorkflowError("NOT_FOUND", "This badge is not recognised. Ask HR for a new one.");
    source = "kiosk_badge";
  } else {
    const code = normalizeCode(String(input.code ?? ""));
    const key = `${k.id}:${code}`;
    const f = failures.get(key);
    if (f && f.n >= 5 && f.until > Date.now()) throw new WorkflowError("FORBIDDEN", "Too many wrong PINs. Wait ten minutes or ask your team lead.");
    const row = await get<{ id: string; full_name: string; preferred_name: string | null; pin_hash: string | null }>(
      "SELECT e.id, e.full_name, e.preferred_name, b.pin_hash FROM employees e LEFT JOIN att_badges b ON b.employee_id = e.id WHERE e.code = ? AND e.status <> 'left'",
      code,
    );
    if (!row || !row.pin_hash || !verifyPassword(String(input.pin ?? ""), row.pin_hash)) {
      failures.set(key, { n: (f && f.until > Date.now() ? f.n : 0) + 1, until: Date.now() + 10 * 60e3 });
      throw new WorkflowError("VALIDATION", row && !row.pin_hash ? "No PIN is set for this number. Set one in the app under Attendance, or ask HR." : "That number and PIN do not match.");
    }
    failures.delete(key);
    emp = row;
    source = "kiosk_pin";
  }
  const r = await punch(emp.id, { at, source, kioskId: k.id, offline, clientId: input.clientId ?? null });
  await run("UPDATE att_kiosks SET last_seen_at = ?, alerted_at = NULL WHERE id = ?", nowIso(), k.id);
  const line = await dayLine(emp.id, r.day);
  return { duplicate: r.duplicate, name: emp.preferred_name || emp.full_name.split(" ")[0]!, kind: r.kind, at: r.at, line: line ? { status: line.status, lateMin: line.lateMin } : null };
}

// Kiosks that stopped reporting during working hours.
async function silentKiosks() {
  const cfg = await attendanceConfig();
  const cutoff = new Date(Date.now() - cfg.kioskSilenceMin * 60e3).toISOString();
  return all<{ id: string; name: string; last_seen_at: string | null }>("SELECT id, name, last_seen_at FROM att_kiosks WHERE active = 1 AND token_hash IS NOT NULL AND (last_seen_at IS NULL OR last_seen_at < ?)", cutoff);
}

// Run with the scheduled checks: a silent kiosk during working hours tells HR and the leads to record days by hand.
export async function kioskSilenceChecks(now = nowIso()) {
  const cfg = await attendanceConfig();
  if (!cfg.methods.kiosk) return;
  const { tz } = await tzNow();
  const local = localParts(now, tz);
  const shift = cfg.shifts.find((s) => s.key === cfg.defaultShift) ?? cfg.shifts[0]!;
  const working = shift.workdays.includes(new Date(`${local.date}T12:00:00Z`).getUTCDay()) && local.minutes >= toMin(shift.start) - 30 && local.minutes <= toMin(shift.end);
  if (!working) return;
  const silent = (await silentKiosks()).filter((k) => k.last_seen_at);
  if (!silent.length) return;
  const leads = (await listUsers()).filter((u) => u.leads.length || u.perms.includes("attendance.manage")).map((u) => u.id);
  for (const k of silent) {
    const row = await get<{ alerted_at: string | null }>("SELECT alerted_at FROM att_kiosks WHERE id = ?", k.id);
    if (row?.alerted_at) continue;
    await notify(
      leads,
      {
        type: "hr",
        title: `Kiosk ${k.name} stopped reporting`,
        body: `Last seen ${fmtMin(localParts(k.last_seen_at!, tz).minutes)}. Until it is back, record your team's day by hand in Attendance.`,
        link: "/attendance?tab=team",
        dedupeKey: `kiosk-silent:${k.id}:${k.last_seen_at}`,
      },
      now,
    );
    await run("UPDATE att_kiosks SET alerted_at = ? WHERE id = ?", now, k.id);
  }
}

// HR's home for attendance: what needs looking at.
export async function attendanceInbox(user: AppUser) {
  if (!managesAttendance(user)) return null;
  const [review, pending] = await Promise.all([
    get<{ c: number }>("SELECT COUNT(*) AS c FROM att_marks WHERE source = 'lead' AND reviewed_at IS NULL"),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM att_corrections WHERE status IN ('pending_lead','pending_hr')"),
  ]);
  return { review: Number(review?.c ?? 0), corrections: Number(pending?.c ?? 0) };
}

// ---------------------------------------------------------------------------
// HR reports and performance reviews
// ---------------------------------------------------------------------------

// One person's totals for a period (up to today), for review evidence.
export async function attendanceTotals(employeeId: string, from: string, to: string): Promise<MonthTotals | null> {
  const emp = await get<Emp>(`${EMP_SELECT} WHERE id = ?`, employeeId);
  if (!emp) return null;
  const { date } = await tzNow();
  const end = to < date ? to : date;
  if (end < from) return null;
  const days = (await loadDays([emp], from, end)).get(employeeId)?.days.filter((d) => d.status !== "not_in") ?? [];
  return days.length ? monthTotals(days) : null;
}

// Absence and lateness across the company for a year: per month and per department.
export async function attendanceYear(year: number) {
  const { date } = await tzNow();
  const from = `${year}-01-01`;
  const to = `${year}-12-31` < date ? `${year}-12-31` : date;
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const empty = { months: months.map((m) => ({ month: m, absent: 0, late: 0, lateMin: 0, halfDays: 0 })), byDepartment: [] as { key: string; label: string; people: number; absent: number; late: number; lateMin: number; workdays: number; rate: number }[] };
  if (to < from) return empty;
  const emps = await all<Emp>(`${EMP_SELECT} WHERE status <> 'left' OR end_date >= ?`, from);
  const data = await loadDays(emps, from, to);
  const depts = new Map((await hrDepartments()).map((d) => [d.key, d.label]));
  const byDept = new Map<string, { people: number; absent: number; late: number; lateMin: number; workdays: number }>();
  for (const e of emps) {
    const days = data.get(e.id)?.days.filter((d) => d.status !== "not_in") ?? [];
    for (const d of days) {
      const m = empty.months.find((x) => x.month === d.date.slice(0, 7))!;
      if (d.status === "absent") m.absent++;
      if (d.status === "late") (m.late++, (m.lateMin += d.lateMin));
      if (d.status === "half_day") m.halfDays++;
    }
    const key = e.department ?? "";
    const t = monthTotals(days);
    const g = byDept.get(key) ?? { people: 0, absent: 0, late: 0, lateMin: 0, workdays: 0 };
    g.people++;
    g.absent += t.absent;
    g.late += t.late;
    g.lateMin += t.lateMin;
    // Days that were meant to be worked: present, late, half days and absences.
    g.workdays += t.present + t.halfDays + t.absent;
    byDept.set(key, g);
  }
  empty.byDepartment = [...byDept.entries()]
    .map(([key, g]) => ({ key, label: depts.get(key) ?? (key || "No department"), ...g, rate: g.workdays ? Math.round((g.absent / g.workdays) * 1000) / 10 : 0 }))
    .sort((a, b) => b.rate - a.rate);
  return empty;
}
