// Attendance kept by hand (HR and Admin, "attendance.manage"): logging a check-in someone missed, changing the time
// of a check-in, removing one, and clearing a person's days. Nothing is deleted: a changed or removed check-in stays,
// voided, with who did it and why, and every change is in the audit log and told to the person.
//
// Also the attendance rules for employees (warnings after repeated lateness or absence, pay deducted for repeated
// lateness, a monthly limit on corrections) and the written rules, generated from the settings, which HR can publish
// as a policy everyone confirms (Announcements).

import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import type { AppUser } from "./users";
import { attendanceConfig, hrIds, managesAttendance, monthSheet, shiftOf } from "./attendance";
import { EVENT_KINDS, KIND_LABELS, SOURCE_LABELS, fmtMin, localParts, localToIso, overnight, toMin, type EventKind, type Source } from "@/lib/attendance";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isTime = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

function needManage(u: AppUser) {
  if (!managesAttendance(u)) throw new WorkflowError("FORBIDDEN", "Only HR and Admin change attendance records.");
}
function needReason(note: unknown) {
  const n = clean(note, 300);
  if (!n) throw new WorkflowError("VALIDATION", 'Give the reason, for example "forgot to check in" or "test check-ins".');
  return n;
}

async function employee(id: string) {
  const e = await get<{ id: string; full_name: string; user_id: string | null }>("SELECT id, full_name, user_id FROM employees WHERE id = ?", id);
  if (!e) throw new WorkflowError("NOT_FOUND", "Employee not found.");
  return e;
}

// The moment for a day and a local time; on a night shift a time before the start is the next morning.
async function momentOf(employeeId: string, day: string, time: string) {
  const tz = (await getSettings()).workspace.timezone;
  const shift = await shiftOf(employeeId, undefined, day);
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  return localToIso(overnight(shift) && toMin(time) < toMin(shift.start) ? next : day, time, tz);
}

async function tell(userId: string | null, title: string, body: string, actor: AppUser) {
  if (userId) await notify([userId], { type: "hr", title, body, link: "/attendance" }, nowIso(), actor.id);
}

export type EditorEvent = { id: string; kind: EventKind; time: string; at: string; source: Source; sourceLabel: string; note: string | null; voided: boolean; by: string | null };

// One person's check-ins for a day, removed ones included (struck through in the editor).
export async function dayEvents(user: AppUser, employeeId: string, day: string): Promise<EditorEvent[]> {
  needManage(user);
  if (!isDay(day)) throw new WorkflowError("VALIDATION", "Choose the day.");
  const tz = (await getSettings()).workspace.timezone;
  const rows = await all<{ id: string; kind: EventKind; at: string; source: Source; note: string | null; voided: number; by: string | null }>(
    "SELECT a.id, a.kind, a.at, a.source, a.note, a.voided, u.name AS by FROM att_events a LEFT JOIN users u ON u.id = a.created_by WHERE a.employee_id = ? AND a.day = ? ORDER BY a.at",
    employeeId,
    day,
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, time: fmtMin(localParts(r.at, tz).minutes), at: r.at, source: r.source, sourceLabel: SOURCE_LABELS[r.source] ?? r.source, note: r.note, voided: !!Number(r.voided), by: r.by }));
}

// A check-in logged by hand (the person forgot, the kiosk was down, a visit outside the office).
export async function logEvent(user: AppUser, input: { employeeId: string; day: string; kind: EventKind; time: string; note: string }) {
  needManage(user);
  if (!isDay(input.day)) throw new WorkflowError("VALIDATION", "Choose the day.");
  if (!isTime(input.time)) throw new WorkflowError("VALIDATION", "The time is HH:MM.");
  if (!EVENT_KINDS.includes(input.kind)) throw new WorkflowError("VALIDATION", "Choose check-in, check-out, break or lunch.");
  const note = needReason(input.note);
  const e = await employee(input.employeeId);
  const at = await momentOf(e.id, input.day, input.time);
  if (Date.parse(at) > Date.now() + 5 * 60e3) throw new WorkflowError("VALIDATION", "That time has not come yet.");
  const id = uid("att_");
  await run(
    "INSERT INTO att_events (id, employee_id, kind, at, day, source, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'hr', ?, ?, ?)",
    id,
    e.id,
    input.kind,
    at,
    input.day,
    `Logged by ${user.name}: ${note}`,
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { itemId: e.id, action: "attendance.edit", summary: `${user.name} logged ${e.full_name}'s ${KIND_LABELS[input.kind]} at ${input.time} on ${input.day}`, reason: note });
  await tell(e.user_id, `Your ${KIND_LABELS[input.kind]} was logged`, `${input.day} at ${input.time}, by ${user.name}. ${note}`, user);
  return id;
}

// A check-in's time changed: the old one stays, voided, and a new one takes its place.
export async function editEvent(user: AppUser, eventId: string, input: { time: string; note: string }) {
  needManage(user);
  if (!isTime(input.time)) throw new WorkflowError("VALIDATION", "The time is HH:MM.");
  const note = needReason(input.note);
  const ev = await get<{ id: string; employee_id: string; kind: EventKind; at: string; day: string; voided: number }>("SELECT id, employee_id, kind, at, day, voided FROM att_events WHERE id = ?", eventId);
  if (!ev) throw new WorkflowError("NOT_FOUND", "That check-in is not there any more.");
  if (Number(ev.voided)) throw new WorkflowError("INVALID_STATE", "That check-in was already removed.");
  const e = await employee(ev.employee_id);
  const tz = (await getSettings()).workspace.timezone;
  const was = fmtMin(localParts(ev.at, tz).minutes);
  const at = await momentOf(e.id, ev.day, input.time);
  if (Date.parse(at) > Date.now() + 5 * 60e3) throw new WorkflowError("VALIDATION", "That time has not come yet.");
  const id = uid("att_");
  await tx(async () => {
    await run("UPDATE att_events SET voided = 1 WHERE id = ?", ev.id);
    await run(
      "INSERT INTO att_events (id, employee_id, kind, at, day, source, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, 'hr', ?, ?, ?)",
      id,
      e.id,
      ev.kind,
      at,
      ev.day,
      `Changed from ${was} by ${user.name}: ${note}`,
      user.id,
      nowIso(),
    );
  });
  await audit({ actor: user }, { itemId: e.id, action: "attendance.edit", summary: `${user.name} changed ${e.full_name}'s ${KIND_LABELS[ev.kind]} on ${ev.day} from ${was} to ${input.time}`, reason: note });
  await tell(e.user_id, `Your ${KIND_LABELS[ev.kind]} time was changed`, `${ev.day}: ${was} is now ${input.time}, by ${user.name}. ${note}`, user);
  return id;
}

export async function removeEvent(user: AppUser, eventId: string, noteIn: string) {
  needManage(user);
  const note = needReason(noteIn);
  const ev = await get<{ employee_id: string; kind: EventKind; at: string; day: string; voided: number }>("SELECT employee_id, kind, at, day, voided FROM att_events WHERE id = ?", eventId);
  if (!ev) throw new WorkflowError("NOT_FOUND", "That check-in is not there any more.");
  if (Number(ev.voided)) return;
  const e = await employee(ev.employee_id);
  const tz = (await getSettings()).workspace.timezone;
  const was = fmtMin(localParts(ev.at, tz).minutes);
  await run("UPDATE att_events SET voided = 1 WHERE id = ?", eventId);
  await audit({ actor: user }, { itemId: e.id, action: "attendance.edit", summary: `${user.name} removed ${e.full_name}'s ${KIND_LABELS[ev.kind]} at ${was} on ${ev.day}`, reason: note });
  await tell(e.user_id, `A ${KIND_LABELS[ev.kind]} was removed`, `${ev.day} at ${was}, by ${user.name}. ${note}`, user);
}

// Clearing a person's days (or everyone's, for test check-ins before going live): their check-ins are voided and any
// hand-made day records removed, so the days count again from nothing (absent on working days, unless on leave).
export async function clearAttendance(user: AppUser, input: { employeeId: string | null; from: string; to: string; note: string }) {
  needManage(user);
  if (!isDay(input.from) || !isDay(input.to) || input.to < input.from) throw new WorkflowError("VALIDATION", "Choose the first and last day.");
  if (Date.parse(input.to) - Date.parse(input.from) > 366 * 864e5) throw new WorkflowError("VALIDATION", "Clear at most a year at a time.");
  const note = needReason(input.note);
  const who = input.employeeId ? await employee(input.employeeId) : null;
  const scope = who ? "AND employee_id = ?" : "";
  const args = who ? [input.from, input.to, who.id] : [input.from, input.to];
  const events = Number((await get<{ c: number }>(`SELECT COUNT(*) AS c FROM att_events WHERE voided = 0 AND day >= ? AND day <= ? ${scope}`, ...args))?.c ?? 0);
  const marks = Number((await get<{ c: number }>(`SELECT COUNT(*) AS c FROM att_marks WHERE day >= ? AND day <= ? ${scope}`, ...args))?.c ?? 0);
  await tx(async () => {
    await run(`UPDATE att_events SET voided = 1 WHERE voided = 0 AND day >= ? AND day <= ? ${scope}`, ...args);
    await run(`DELETE FROM att_marks WHERE day >= ? AND day <= ? ${scope}`, ...args);
  });
  const range = input.from === input.to ? input.from : `${input.from} to ${input.to}`;
  await audit({ actor: user }, { itemId: who?.id ?? null, action: "attendance.clear", summary: `${user.name} cleared ${who ? `${who.full_name}'s` : "everyone's"} attendance for ${range} (${events} check-ins, ${marks} day records)`, reason: note });
  if (who) await tell(who.user_id, "Your attendance was cleared", `${range}, by ${user.name}. ${note}`, user);
  return { events, marks };
}

// ---------------------------------------------------------------------------
// Rules for employees
// ---------------------------------------------------------------------------

export type AttendanceRules = {
  // Warn the person and HR after this many late days in a month (0: off).
  lateWarnAfter: number;
  // Every this many late days in a month cost this many days of pay (0: off). Payroll takes it with the unpaid days.
  latesPerDeduction: number;
  deductionDays: number;
  // Warn after this many days absent without leave in a month (0: off).
  absentWarnAfter: number;
  // Corrections a person may ask for in a month (0: no limit).
  maxCorrections: number;
  // A day without a check-out: warn the person the next morning.
  remindMissingOut: boolean;
  // Notice for absence: hours before the shift a person must tell their line manager (shown in the written rules).
  absenceNoticeHours: number;
};

export const DEFAULT_RULES: AttendanceRules = { lateWarnAfter: 3, latesPerDeduction: 0, deductionDays: 0.5, absentWarnAfter: 1, maxCorrections: 3, remindMissingOut: true, absenceNoticeHours: 2 };

export async function attendanceRules(): Promise<AttendanceRules> {
  const s = parseJson<Partial<AttendanceRules>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.attendance.rules'"))?.value, {});
  return { ...DEFAULT_RULES, ...s };
}

export async function saveAttendanceRules(user: AppUser, input: Partial<AttendanceRules>) {
  needManage(user);
  const cur = await attendanceRules();
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Number(v))) : d);
  const next: AttendanceRules = {
    lateWarnAfter: Math.round(n(input.lateWarnAfter ?? cur.lateWarnAfter, 3, 0, 31)),
    latesPerDeduction: Math.round(n(input.latesPerDeduction ?? cur.latesPerDeduction, 0, 0, 31)),
    deductionDays: n(input.deductionDays ?? cur.deductionDays, 0.5, 0, 5),
    absentWarnAfter: Math.round(n(input.absentWarnAfter ?? cur.absentWarnAfter, 1, 0, 31)),
    maxCorrections: Math.round(n(input.maxCorrections ?? cur.maxCorrections, 3, 0, 31)),
    remindMissingOut: !!(input.remindMissingOut ?? cur.remindMissingOut),
    absenceNoticeHours: n(input.absenceNoticeHours ?? cur.absenceNoticeHours, 2, 0, 72),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.attendance.rules', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "attendance.settings", summary: `${user.name} changed the attendance rules`, newValue: next });
  return next;
}

// Days of pay the lateness rule costs for a month's late days.
export const lateDeduction = (lates: number, r: AttendanceRules) => (r.latesPerDeduction > 0 ? Math.floor(lates / r.latesPerDeduction) * r.deductionDays : 0);

// The rules as a person reads them, from the shifts and settings in force.
export async function rulesText(): Promise<string> {
  const cfg = await attendanceConfig();
  const r = await attendanceRules();
  const ws = (await getSettings()).workspace.name;
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const shifts = cfg.shifts
    .map((s) => `- ${s.label}: ${s.start} to ${s.end}, ${s.workdays.map((d) => DAYS[d]).join(", ")}; ${s.graceMin} minutes' grace${s.lunch ? `; lunch ${s.lunch.from} to ${s.lunch.to} (${s.lunch.minutes} minutes)` : `; ${s.breakMin} minutes of breaks`}${s.shortBreaks ? `; ${s.shortBreaks.count} short breaks of ${s.shortBreaks.minutes} minutes${s.shortBreaks.paid ? "" : " (unpaid)"}` : ""}.`)
    .join("\n");
  const lines = [
    `Attendance rules at ${ws}`,
    "",
    "1. Working hours",
    shifts,
    "",
    "2. Checking in and out",
    "- Check in when you arrive and check out when you leave, every working day, in the way your workplace uses (the QR at the entrance, the app on the office network, the kiosk or your team lead).",
    "- Record lunch and breaks with their buttons when your shift has them.",
    "- Checking in for someone else, or asking someone to check in for you, is not allowed and is treated as misconduct.",
    "",
    "3. Lateness and leaving early",
    `- Arriving after the shift start plus the grace time counts as late. Leaving ${cfg.earlyLeaveMin} minutes or more before the end counts as leaving early.`,
    r.lateWarnAfter ? `- After ${r.lateWarnAfter} late days in a month you and HR receive a warning.` : "",
    r.latesPerDeduction ? `- Every ${r.latesPerDeduction} late days in a month cost ${r.deductionDays} day${r.deductionDays === 1 ? "" : "s"} of pay, taken in that month's payroll.` : "",
    `- Fewer than ${cfg.halfDayHours} hours worked in a day counts as a half day.`,
    "",
    "4. Absence",
    `- If you cannot come, tell your line manager at least ${r.absenceNoticeHours} hours before your shift and ask for leave in the app.`,
    "- A working day without a check-in or approved leave counts as absent and is unpaid.",
    r.absentWarnAfter ? `- After ${r.absentWarnAfter} ${r.absentWarnAfter === 1 ? "day" : "days"} absent without leave in a month you and HR receive a warning.` : "",
    "",
    "5. Overtime",
    `- Time worked more than ${cfg.overtimeAfterMin} minutes past the end of your shift counts as overtime and is paid at the rates of the Labour Proclamation (1.5 times on working days, 1.75 at night, 2 on the weekly rest day, 2.5 on public holidays) when your line manager asked for it.`,
    "",
    "6. Mistakes and corrections",
    `- If you forgot to check in or out, ask for a correction in Attendance the same week, with the reason. Your line manager or HR approves it.${r.maxCorrections ? ` At most ${r.maxCorrections} corrections a month.` : ""}`,
    r.remindMissingOut ? "- If you forget to check out, you are reminded the next morning." : "",
    "- HR and Admin may log, change or remove a check-in, or clear days, with a reason. You are told each time and every change is kept in the record.",
    "",
    "7. Your data",
    "- Your check-in times, the place checks (office network, location) and your device are kept for attendance and payroll only. You can see your own record in Attendance at any time.",
  ];
  return lines.filter((l, i, a) => l !== "" || a[i - 1] !== "").filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n");
}

// HR publishes the rules as a policy everyone confirms (Announcements, Phase 18).
export async function publishRules(user: AppUser, text?: string | null) {
  needManage(user);
  const body = clean(text, 8000) || (await rulesText());
  const { saveAnnouncement } = await import("./announcements");
  const id = await saveAnnouncement(user, { title: "Attendance rules", body, kind: "policy", audience: { all: true, departments: [], roles: [] }, pinned: true, notify: true });
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.attendance.rulesAnnouncement', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(id),
    nowIso(),
    user.id,
  );
  return id;
}

// The month so far, against the rules: warnings to the person and HR (once a month each), the next morning's
// reminder of a missing check-out. Runs with the scheduled checks.
export async function ruleChecks(now = nowIso(), forMonth?: string) {
  const r = await attendanceRules();
  const tz = (await getSettings()).workspace.timezone;
  const today = localParts(now, tz).date;
  const month = forMonth ?? today.slice(0, 7);
  const emps = await all<{ id: string; full_name: string; user_id: string | null }>("SELECT id, full_name, user_id FROM employees WHERE status <> 'left'");
  if (!emps.length) return { warned: 0, reminded: 0 };
  const sheet = await monthSheet(emps.map((e) => e.id), month);
  const hr = await hrIds();
  let warned = 0;
  let reminded = 0;
  for (const row of sheet) {
    const e = emps.find((x) => x.id === row.employeeId)!;
    const to = [e.user_id, ...hr].filter((x): x is string => !!x);
    if (r.lateWarnAfter && row.totals.late >= r.lateWarnAfter) {
      await notify(to, { type: "hr", title: `${e.full_name}: late ${row.totals.late} times in ${month}`, body: `The attendance rules warn after ${r.lateWarnAfter} late days in a month.${r.latesPerDeduction ? ` Every ${r.latesPerDeduction} late days cost ${r.deductionDays} day of pay.` : ""}`, link: "/attendance", dedupeKey: `att-late-${e.id}-${month}` }, now);
      warned++;
    }
    if (r.absentWarnAfter && row.totals.absent >= r.absentWarnAfter) {
      await notify(to, { type: "hr", title: `${e.full_name}: absent without leave ${row.totals.absent} ${row.totals.absent === 1 ? "day" : "days"} in ${month}`, body: "Absent days without leave are unpaid. Ask for leave in the app when you cannot come.", link: "/attendance", dedupeKey: `att-absent-${e.id}-${month}-${row.totals.absent >= r.absentWarnAfter * 2 ? 2 : 1}` }, now);
      warned++;
    }
    if (r.remindMissingOut && e.user_id) {
      const yesterday = row.days.filter((d) => d.date < today).pop();
      if (yesterday?.missingOut) {
        await notify([e.user_id], { type: "hr", title: `No check-out on ${yesterday.date}`, body: "Ask for a correction in Attendance with the time you left.", link: "/attendance?tab=me", dedupeKey: `att-out-${e.id}-${yesterday.date}` }, now);
        reminded++;
      }
    }
  }
  return { warned, reminded };
}

// Corrections asked for this month by a person (for the monthly limit).
export async function correctionsThisMonth(employeeId: string, day: string) {
  return Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM att_corrections WHERE employee_id = ? AND substr(day, 1, 7) = ? AND status <> 'cancelled'", employeeId, day.slice(0, 7)))?.c ?? 0);
}

export const EDIT_SOURCE_LABEL = SOURCE_LABELS.hr;
void fmtMin;
