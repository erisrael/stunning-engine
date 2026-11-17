// Date ranges every data screen offers (Update 1.2): Chapa transactions and Noor records use the same list and the
// same arithmetic. Days are Addis Ababa days (UTC+3, no daylight saving); weeks start on Monday. A range is a pair
// of inclusive YYYY-MM-DD days; "all" has no bounds.

export const DATE_PRESETS = [
  ["all", "All time"],
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["3days", "Last 3 days"],
  ["7days", "Last 7 days"],
  ["14days", "Last 14 days"],
  ["30days", "Last 30 days"],
  ["week", "This week"],
  ["lastweek", "Last week"],
  ["month", "This month"],
  ["lastmonth", "Last month"],
  ["year", "This year"],
  ["custom", "Custom range"],
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number][0];
export const datePresetLabel = (k: string) => DATE_PRESETS.find(([p]) => p === k)?.[1] ?? k;
export const isDatePreset = (k: unknown): k is DatePreset => DATE_PRESETS.some(([p]) => p === k);

const SHIFT = 3 * 3600_000;
const DAY = 86400_000;
const isDay = (s: string | null | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const addisToday = (now: number | Date = Date.now()) => new Date(+now + SHIFT).toISOString().slice(0, 10);

// "Last N days" is the N calendar days ending today, so "Last 3 days" is the day before yesterday, yesterday and today.
export function datePresetRange(preset: DatePreset, start?: string | null, end?: string | null, now: number | Date = Date.now()): { from: string | null; until: string | null } {
  const t = +now;
  const day = (ms: number) => new Date(ms + SHIFT).toISOString().slice(0, 10);
  const today = day(t);
  const back = (n: number) => day(t - n * DAY);
  const local = new Date(t + SHIFT);
  const monday = (local.getUTCDay() + 6) % 7; // days since Monday
  switch (preset) {
    case "all":
      return { from: null, until: null };
    case "today":
      return { from: today, until: today };
    case "yesterday":
      return { from: back(1), until: back(1) };
    case "3days":
      return { from: back(2), until: today };
    case "7days":
      return { from: back(6), until: today };
    case "14days":
      return { from: back(13), until: today };
    case "30days":
      return { from: back(29), until: today };
    case "week":
      return { from: back(monday), until: today };
    case "lastweek":
      return { from: back(monday + 7), until: back(monday + 1) };
    case "month":
      return { from: `${today.slice(0, 7)}-01`, until: today };
    case "lastmonth": {
      const first = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth() - 1, 1));
      const last = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 0));
      return { from: first.toISOString().slice(0, 10), until: last.toISOString().slice(0, 10) };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, until: today };
    case "custom": {
      const a = isDay(start) ? start : null;
      const b = isDay(end) ? end : null;
      return a && b && a > b ? { from: b, until: a } : { from: a, until: b };
    }
  }
}

// The instants a range covers, as ISO strings: from the start of the first day (or the given HH:mm) up to, but not
// including, the end of the last day (or the minute after the given HH:mm).
export function rangeInstants(from: string | null | undefined, until: string | null | undefined, fromTime?: string | null, untilTime?: string | null): { start: string | null; end: string | null } {
  const time = (s: string | null | undefined) => (s && /^\d{2}:\d{2}$/.test(s) ? s : null);
  const at = (day: string, hm: string) => Date.parse(`${day}T${hm}:00Z`) - SHIFT;
  const start = isDay(from) ? new Date(at(from, time(fromTime) ?? "00:00")).toISOString() : null;
  const ut = time(untilTime);
  const end = isDay(until) ? new Date(ut ? at(until, ut) + 60_000 : at(until, "00:00") + DAY).toISOString() : null;
  return { start, end };
}
