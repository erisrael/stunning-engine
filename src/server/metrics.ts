import { all, placeholders } from "./db";
import { getSettings, type Settings } from "./settings";
import { localDate, localInputToIso } from "@/lib/format";
import type { AttemptStatus, Stage } from "@/lib/domain";

export type Buckets = { queued: number; active: number; paused: number; blocked: number; handoff: number };

export type AttemptTiming = {
  attemptId: string;
  itemId: string;
  stage: Stage;
  attemptNo: number;
  cause: string;
  status: AttemptStatus;
  ownerId: string | null;
  enteredAt: string;
  firstStartedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  closedAt: string | null;
  open: boolean;
  buckets: Buckets;
  businessBuckets: Buckets;
  residence: number;
  businessResidence: number;
  initialQueue: number;
  initialQueueOpen: boolean;
  labor: number;
  laborByUser: Record<string, number>;
  sessionCount: number;
  openSessionCount: number;
};

type IntervalRow = { attempt_id: string; state: keyof Buckets; started_at: string; ended_at: string | null };
type SessionRow = { attempt_id: string; user_id: string; started_at: string; ended_at: string | null };
type AttemptRow = {
  id: string;
  item_id: string;
  stage: Stage;
  attempt_no: number;
  cause: string;
  status: AttemptStatus;
  owner_id: string | null;
  entered_at: string;
  first_started_at: string | null;
  handoff_submitted_at: string | null;
  completed_at: string | null;
  closed_at: string | null;
};

const ms = (iso: string) => new Date(iso).getTime();

// ---------------------------------------------------------------------------
// Business time: overlap of an interval with configured working hours.
// ---------------------------------------------------------------------------

export function businessMs(startIso: string, endIso: string, settings: Settings) {
  const start = ms(startIso);
  const end = ms(endIso);
  if (end <= start) return 0;
  const tz = settings.workspace.timezone;
  const holidays = new Set(settings.calendar.holidays.map((h) => h.date));
  const workdays = new Set(settings.calendar.workdays);
  let total = 0;
  let day = localDate(new Date(start).toISOString(), tz);
  const lastDay = localDate(new Date(end).toISOString(), tz);
  for (let guard = 0; guard < 4000; guard++) {
    const [y, m, d] = day.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (workdays.has(weekday) && !holidays.has(day)) {
      const ws = ms(localInputToIso(`${day}T${settings.calendar.dayStart}`, tz)!);
      const we = ms(localInputToIso(`${day}T${settings.calendar.dayEnd}`, tz)!);
      const a = Math.max(start, ws);
      const b = Math.min(end, we);
      if (b > a) total += b - a;
    }
    if (day >= lastDay) break;
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    day = next.toISOString().slice(0, 10);
  }
  return total;
}

export function businessHoursPerDay(settings: Settings) {
  const [sh, sm] = settings.calendar.dayStart.split(":").map(Number);
  const [eh, em] = settings.calendar.dayEnd.split(":").map(Number);
  return (eh * 60 + em - (sh * 60 + sm)) / 60;
}

function unionLength(intervals: [number, number][]) {
  if (!intervals.length) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [cs, ce] = sorted[0];
  for (const [s, e] of sorted.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      cs = s;
      ce = e;
    }
  }
  return total + (ce - cs);
}

// ---------------------------------------------------------------------------
// Attempt timing
// ---------------------------------------------------------------------------

export async function attemptTimings(attemptIds: string[] | null, nowIso: string, opts: { business?: boolean } = {}): Promise<AttemptTiming[]> {
  const settings = await getSettings();
  const where = attemptIds ? `WHERE id IN (${placeholders(attemptIds.length)})` : "";
  if (attemptIds && !attemptIds.length) return [];
  const attempts = await all<AttemptRow>(`SELECT * FROM stage_attempts ${where}`, ...(attemptIds ?? []));
  if (!attempts.length) return [];
  const ids = attempts.map((a) => a.id);
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500));
  const intervals: IntervalRow[] = [];
  const sessions: SessionRow[] = [];
  for (const c of chunks) {
    intervals.push(...await all<IntervalRow>(`SELECT attempt_id, state, started_at, ended_at FROM stage_intervals WHERE attempt_id IN (${placeholders(c.length)})`, ...c));
    sessions.push(...await all<SessionRow>(`SELECT attempt_id, user_id, started_at, ended_at FROM work_sessions WHERE attempt_id IN (${placeholders(c.length)})`, ...c));
  }
  const byAttemptI = new Map<string, IntervalRow[]>();
  for (const i of intervals) (byAttemptI.get(i.attempt_id) ?? byAttemptI.set(i.attempt_id, []).get(i.attempt_id)!).push(i);
  const byAttemptS = new Map<string, SessionRow[]>();
  for (const s of sessions) (byAttemptS.get(s.attempt_id) ?? byAttemptS.set(s.attempt_id, []).get(s.attempt_id)!).push(s);
  const now = ms(nowIso);

  return attempts.map((a) => {
    const buckets: Buckets = { queued: 0, active: 0, paused: 0, blocked: 0, handoff: 0 };
    const businessBuckets: Buckets = { queued: 0, active: 0, paused: 0, blocked: 0, handoff: 0 };
    for (const iv of byAttemptI.get(a.id) ?? []) {
      const s = ms(iv.started_at);
      const e = iv.ended_at ? ms(iv.ended_at) : now;
      if (e > s && iv.state in buckets) {
        buckets[iv.state] += e - s;
        if (opts.business) businessBuckets[iv.state] += businessMs(iv.started_at, new Date(e).toISOString(), settings);
      }
    }
    const ss = byAttemptS.get(a.id) ?? [];
    const laborByUser: Record<string, number> = {};
    let labor = 0;
    for (const s of ss) {
      const d = (s.ended_at ? ms(s.ended_at) : now) - ms(s.started_at);
      if (d > 0) {
        labor += d;
        laborByUser[s.user_id] = (laborByUser[s.user_id] ?? 0) + d;
      }
    }
    const end = a.closed_at ? ms(a.closed_at) : now;
    const residence = end - ms(a.entered_at);
    return {
      attemptId: a.id,
      itemId: a.item_id,
      stage: a.stage,
      attemptNo: a.attempt_no,
      cause: a.cause,
      status: a.status,
      ownerId: a.owner_id,
      enteredAt: a.entered_at,
      firstStartedAt: a.first_started_at,
      submittedAt: a.handoff_submitted_at,
      completedAt: a.completed_at,
      closedAt: a.closed_at,
      open: !a.closed_at,
      buckets,
      businessBuckets,
      residence,
      businessResidence: opts.business ? businessMs(a.entered_at, new Date(end).toISOString(), settings) : 0,
      initialQueue: (a.first_started_at ? ms(a.first_started_at) : end) - ms(a.entered_at),
      initialQueueOpen: !a.first_started_at,
      labor,
      laborByUser,
      sessionCount: ss.length,
      openSessionCount: ss.filter((s) => !s.ended_at).length,
    };
  });
}

// Active processing time is the union of contributors' sessions.
export async function activeProcessingMs(attemptId: string, nowIso: string) {
  const ss = await all<SessionRow>("SELECT attempt_id, user_id, started_at, ended_at FROM work_sessions WHERE attempt_id = ?", attemptId);
  const now = ms(nowIso);
  return unionLength(ss.map((s) => [ms(s.started_at), s.ended_at ? ms(s.ended_at) : now]));
}

export function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export function median(values: number[]) {
  return percentile(values, 0.5);
}

export function mean(values: number[]) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function weekStart(iso: string, tz: string, weekStartsOn = 1) {
  const day = localDate(iso, tz);
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const diff = (date.getUTCDay() - weekStartsOn + 7) % 7;
  date.setUTCDate(date.getUTCDate() - diff);
  return date.toISOString().slice(0, 10);
}

export function lastCompleteWeeks(n: number, nowIso: string, tz: string, weekStartsOn = 1) {
  const current = weekStart(nowIso, tz, weekStartsOn);
  const weeks: string[] = [];
  const [y, m, d] = current.split("-").map(Number);
  for (let i = n; i >= 1; i--) {
    const w = new Date(Date.UTC(y, m - 1, d - i * 7));
    weeks.push(w.toISOString().slice(0, 10));
  }
  return weeks;
}
