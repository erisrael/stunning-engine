// Attendance: shared vocabulary, settings and the rules that turn check-ins into a day's result.
// Used by the server and the client; no database access here.

export type Shift = { key: string; label: string; start: string; end: string; graceMin: number; breakMin: number; workdays: number[] };

export type AttendanceConfig = {
  // Days before this are not counted (no absences before attendance started). Empty: from the first check-in.
  startDate: string | null;
  shifts: Shift[];
  defaultShift: string;
  // Leaving this many minutes or more before the end counts as leaving early.
  earlyLeaveMin: number;
  // Time after the end of the shift before overtime counts.
  overtimeAfterMin: number;
  // Fewer hours than this in a day is a half day.
  halfDayHours: number;
  // How people may check in: from the app anywhere, at a kiosk, or from a phone at the site (location checked).
  methods: { web: boolean; kiosk: boolean; mobile: boolean };
  site: { label: string; lat: number | null; lng: number | null; radiusM: number };
  // A kiosk that has not reported for this long during working hours raises an alert.
  kioskSilenceMin: number;
  // Check-ins a kiosk kept while offline are accepted up to this many hours late.
  offlineMaxHours: number;
  // The written attendance and privacy policy shown to everyone.
  policy: string;
};

export const DEFAULT_ATTENDANCE: AttendanceConfig = {
  startDate: null,
  shifts: [
    { key: "standard", label: "Standard (08:30 to 17:30)", start: "08:30", end: "17:30", graceMin: 15, breakMin: 60, workdays: [1, 2, 3, 4, 5] },
    { key: "studio", label: "Studio (07:30 to 16:30)", start: "07:30", end: "16:30", graceMin: 10, breakMin: 60, workdays: [1, 2, 3, 4, 5, 6] },
  ],
  defaultShift: "standard",
  earlyLeaveMin: 15,
  overtimeAfterMin: 30,
  halfDayHours: 4,
  methods: { web: true, kiosk: true, mobile: false },
  site: { label: "Office", lat: null, lng: null, radiusM: 200 },
  kioskSilenceMin: 30,
  offlineMaxHours: 72,
  policy: [
    "Attendance records the times you start and finish work, so pay, overtime and leave are right.",
    "You check in when you arrive and check out when you leave, at the kiosk or in the app.",
    "When a kiosk is broken or missing, your team lead records your day by hand. HR reviews every manual entry.",
    "If a time is wrong (for example you forgot to check out), ask for a correction. Your line manager approves it and HR sees the trail.",
    "Location is checked only at the moment you check in from your phone, and only when phone check-in is switched on. It is not tracked.",
    "Attendance records are kept for payroll and labour law, and seen by you, your line manager and HR.",
  ].join("\n"),
};

export const DAY_STATUSES = ["present", "late", "half_day", "absent", "leave", "holiday", "off", "not_in"] as const;
export type DayStatus = (typeof DAY_STATUSES)[number];
export const DAY_STATUS_LABELS: Record<DayStatus, string> = {
  present: "Present",
  late: "Late",
  half_day: "Half day",
  absent: "Absent",
  leave: "On leave",
  holiday: "Holiday",
  off: "Day off",
  not_in: "Not in yet",
};
// What a team lead or HR can set by hand.
export const MARK_STATUSES = ["present", "late", "half_day", "absent", "leave"] as const;
export type MarkStatus = (typeof MARK_STATUSES)[number];

export const SOURCES = ["web", "mobile", "kiosk_pin", "kiosk_badge", "kiosk_face", "lead", "hr", "correction"] as const;
export type Source = (typeof SOURCES)[number];
export const SOURCE_LABELS: Record<Source, string> = {
  web: "App",
  mobile: "Phone at site",
  kiosk_pin: "Kiosk, PIN",
  kiosk_badge: "Kiosk, badge",
  kiosk_face: "Kiosk, face",
  lead: "Team lead",
  hr: "HR",
  correction: "Correction",
};

export const CORRECTION_STATUSES = ["pending_lead", "pending_hr", "approved", "rejected", "cancelled"] as const;
export type CorrectionStatus = (typeof CORRECTION_STATUSES)[number];
export const CORRECTION_STATUS_LABELS: Record<CorrectionStatus, string> = {
  pending_lead: "With line manager",
  pending_hr: "With HR",
  approved: "Approved",
  rejected: "Not approved",
  cancelled: "Cancelled",
};

export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
export const fmtMin = (min: number | null | undefined) => (min === null || min === undefined ? "-" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(Math.round(min % 60)).padStart(2, "0")}`);
export const fmtHours = (min: number) => `${Math.floor(min / 60)}h ${String(Math.round(min % 60)).padStart(2, "0")}m`;

// Distance in metres between two points (haversine).
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = 6371e3;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}

// Local date and minutes after midnight of an instant, in the workspace's timezone.
export function localParts(iso: string, tz: string) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, minutes: Number(v("hour")) * 60 + Number(v("minute")) };
}

// The instant of a local date and time in the workspace's timezone.
export function localToIso(date: string, hhmm: string, tz: string) {
  const guess = Date.parse(`${date}T${hhmm}:00Z`);
  const p = localParts(new Date(guess).toISOString(), tz);
  const offset = (Date.parse(`${p.date}T${fmtMin(p.minutes)}:00Z`) - guess) / 60e3;
  return new Date(guess - offset * 60e3).toISOString();
}

export const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

// A shift that ends after midnight (22:00 to 06:00) belongs to the day it starts.
export const overnight = (s: Pick<Shift, "start" | "end">) => toMin(s.end) <= toMin(s.start);

// The shift a person works on a day: their rota (one shift per week, repeating from the rota's first week) or
// their single shift, else the default.
export type ShiftAssign = { shiftKey: string | null; rota: string[] | null; rotaStart: string | null };
export function shiftKeyOn(a: ShiftAssign | null | undefined, day: string, defaultKey: string) {
  if (a?.rota?.length && a.rotaStart) {
    const n = a.rota.length;
    const weeks = Math.floor((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${a.rotaStart}T12:00:00Z`)) / (7 * 864e5));
    return a.rota[((weeks % n) + n) % n]!;
  }
  return a?.shiftKey ?? defaultKey;
}

export type DayEvent = { kind: "in" | "out"; minutes: number; source: Source };
export type DayMark = { status: MarkStatus; inMin: number | null; outMin: number | null; note: string | null; source: "lead" | "hr"; reviewed: boolean };
export type DayInput = {
  date: string;
  shift: Shift;
  events: DayEvent[];
  leave: { label: string; paid: boolean; half: boolean } | null;
  holiday: string | null;
  mark: DayMark | null;
  now: { date: string; minutes: number };
  rules: Pick<AttendanceConfig, "earlyLeaveMin" | "overtimeAfterMin" | "halfDayHours">;
};
export type DayResult = {
  date: string;
  status: DayStatus;
  firstIn: number | null;
  lastOut: number | null;
  workedMin: number;
  lateMin: number;
  earlyMin: number;
  overtimeMin: number;
  missingOut: boolean;
  manual: boolean;
  reviewed: boolean;
  note: string | null;
  leaveLabel: string | null;
  unpaidLeave: number;
  sources: Source[];
};

// One person's day: a hand-made mark wins, then leave, holidays and days off, then the check-ins against the shift.
export function computeDay(d: DayInput): DayResult {
  const start = toMin(d.shift.start);
  // Night shifts end the next morning: minutes past midnight count from the start day.
  const night = overnight(d.shift);
  const end = toMin(d.shift.end) + (night ? 24 * 60 : 0);
  const ev = [...d.events].sort((a, b) => a.minutes - b.minutes);
  const base: DayResult = {
    date: d.date,
    status: "absent",
    firstIn: null,
    lastOut: null,
    workedMin: 0,
    lateMin: 0,
    earlyMin: 0,
    overtimeMin: 0,
    missingOut: false,
    manual: false,
    reviewed: true,
    note: null,
    leaveLabel: d.leave?.label ?? null,
    unpaidLeave: d.leave && !d.leave.paid ? (d.leave.half ? 0.5 : 1) : 0,
    sources: [...new Set(ev.map((e) => e.source))],
  };
  const timed = (inMin: number | null, outMin: number | null) => {
    const worked = inMin !== null && outMin !== null && outMin > inMin ? outMin - inMin : 0;
    const net = worked >= 6 * 60 ? worked - d.shift.breakMin : worked;
    return {
      firstIn: inMin,
      lastOut: outMin,
      workedMin: Math.max(0, net),
      lateMin: inMin !== null && inMin > start + d.shift.graceMin ? inMin - start : 0,
      earlyMin: outMin !== null && outMin <= end - d.rules.earlyLeaveMin ? end - outMin : 0,
      overtimeMin: outMin !== null && outMin > end + d.rules.overtimeAfterMin ? outMin - end : 0,
    };
  };

  if (d.mark) {
    const m = { ...d.mark };
    if (night && m.outMin !== null && m.outMin < start) m.outMin += 24 * 60;
    const t = m.inMin !== null || m.outMin !== null ? timed(m.inMin, m.outMin) : null;
    const fullDay = Math.max(0, end - start - d.shift.breakMin);
    return {
      ...base,
      ...(t ?? {}),
      status: m.status,
      workedMin: t?.workedMin || (m.status === "present" || m.status === "late" ? fullDay : m.status === "half_day" ? Math.round(fullDay / 2) : 0),
      overtimeMin: t?.overtimeMin ?? 0,
      lateMin: m.status === "late" ? (t?.lateMin ?? 0) : 0,
      manual: true,
      reviewed: m.reviewed,
      note: m.note,
      unpaidLeave: m.status === "leave" ? base.unpaidLeave : 0,
      sources: [...base.sources, m.source],
    };
  }

  // Closed in-and-out pairs count; a check-in left open past the day is a missing check-out.
  let worked = 0;
  let open: number | null = null;
  for (const e of ev) {
    if (e.kind === "in") open ??= e.minutes;
    else if (open !== null) {
      worked += e.minutes - open;
      open = null;
    }
  }
  const firstIn = ev.find((e) => e.kind === "in")?.minutes ?? null;
  const lastOut = [...ev].reverse().find((e) => e.kind === "out")?.minutes ?? null;
  const t = timed(firstIn, lastOut);
  const net = worked >= 6 * 60 ? worked - d.shift.breakMin : worked;
  // Minutes into this day's shift right now (a night shift's day runs on past midnight), or null when it is over.
  const nextDay = new Date(Date.parse(`${d.date}T12:00:00Z`) + 864e5).toISOString().slice(0, 10);
  const nowRel = d.date === d.now.date ? d.now.minutes : night && nextDay === d.now.date ? d.now.minutes + 24 * 60 : null;
  const missingOut = open !== null && (nowRel === null ? d.date < d.now.date : nowRel > end + 4 * 60);
  const workday = d.shift.workdays.includes(weekday(d.date));

  if (d.leave && !d.leave.half && firstIn === null) return { ...base, status: "leave" };
  if (firstIn === null) {
    if (d.holiday) return { ...base, status: "holiday", note: d.holiday };
    if (!workday) return { ...base, status: "off" };
    if (d.leave?.half) return { ...base, status: "half_day" };
    const notYet = d.date > d.now.date || (nowRel !== null && nowRel < end);
    return { ...base, status: notYet ? "not_in" : "absent" };
  }
  // Worked on a holiday or a day off: all of it is overtime.
  if (d.holiday || !workday)
    return { ...base, ...t, status: d.holiday ? "holiday" : "off", workedMin: Math.max(0, net), lateMin: 0, earlyMin: 0, overtimeMin: Math.max(0, net), missingOut, note: d.holiday };
  // On a half day of leave, the half worked is a normal day's work.
  const short = !d.leave?.half && !missingOut && lastOut !== null && net < d.rules.halfDayHours * 60;
  const halfLeave = !!d.leave?.half;
  const status: DayStatus = short ? "half_day" : t.lateMin > 0 && !halfLeave ? "late" : "present";
  return { ...base, ...t, status, workedMin: Math.max(0, net), missingOut, lateMin: halfLeave ? 0 : t.lateMin, earlyMin: halfLeave ? 0 : t.earlyMin };
}

// A month's totals for one person, as payroll and the timesheet use them.
export type MonthTotals = { present: number; late: number; lateMin: number; halfDays: number; absent: number; leave: number; unpaidLeave: number; workedMin: number; overtimeMin: number; missingOut: number; manual: number };
export function monthTotals(days: DayResult[]): MonthTotals {
  const t: MonthTotals = { present: 0, late: 0, lateMin: 0, halfDays: 0, absent: 0, leave: 0, unpaidLeave: 0, workedMin: 0, overtimeMin: 0, missingOut: 0, manual: 0 };
  for (const d of days) {
    if (d.status === "present" || d.status === "late") t.present++;
    if (d.status === "late") (t.late++, (t.lateMin += d.lateMin));
    if (d.status === "half_day") t.halfDays++;
    if (d.status === "absent") t.absent++;
    if (d.status === "leave") t.leave++;
    t.unpaidLeave += d.unpaidLeave;
    t.workedMin += d.workedMin;
    t.overtimeMin += d.overtimeMin;
    if (d.missingOut) t.missingOut++;
    if (d.manual) t.manual++;
  }
  return t;
}

// Unpaid days for payroll: days absent without leave, half of each half day, and unpaid leave.
export const unpaidDays = (t: MonthTotals) => t.absent + t.halfDays * 0.5 + t.unpaidLeave;
export const overtimeHours = (t: MonthTotals) => Math.round((t.overtimeMin / 60) * 4) / 4;
