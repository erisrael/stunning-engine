import { datePresetRange, isDatePreset } from "./date-presets";
// CMS dates without a zone are interpreted in the workspace's Addis Ababa zone.
export function parseCmsDate(value: unknown, now = new Date()): Date | null {
  // Noor adds a relative hint after the date ("Nov 2, 2026 14:50:35 1 week ago"); the absolute part decides.
  const text = String(value ?? "").trim().replace(/^(.*\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)\s+(?:\d+\s+\w+|an? \w+)\s+ago$/i, "$1");
  if (!text) return null;
  const relative = text.toLowerCase();
  if (relative === "just now" || relative === "today") return now;
  if (relative === "yesterday") return new Date(+now - 86400000);
  const ago = relative.match(/^(\d+)\s*(second|sec|minute|min|hour|day|week|month|year)s?\s+ago$/);
  if (ago) {
    const units: Record<string, number> = { second: 1000, sec: 1000, minute: 60000, min: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000, year: 31536000000 };
    return new Date(+now - Number(ago[1]) * units[ago[2]]);
  }
  // Slash dates in Noor are day/month/year; parse before the browser's US fallback.
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (slash || iso) {
    const [year, month, day] = slash ? [Number(slash[3]), Number(slash[2]), Number(slash[1])] : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return new Date(+date - 10800000);
  }
  // Do not treat phone numbers, IDs or arbitrary text as dates.
  if (!/^\d{4}-\d{2}-\d{2}[T ]/.test(text) && !/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i.test(text)) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(text);
  const date = new Date(zoned ? text : `${text} GMT+0300`);
  const isoDate = /^\d{4}-/.test(text) && !zoned ? new Date(text.replace(" ", "T") + "+03:00") : date;
  return Number.isNaN(+isoDate) ? null : isoDate;
}

const key = (value: string) => value.toLowerCase().replace(/[\s_-]+/g, "");
export function cmsField(record: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const entry = Object.entries(record).find(([k]) => key(k) === key(name));
    if (entry && entry[1] != null && String(entry[1]).trim()) return String(entry[1]).trim();
  }
  return "";
}

export function cmsDate(record: Record<string, unknown>): Date | null {
  for (const name of ["created at", "created", "date", "submitted", "submitted at", "invoice date", "payment date", "joined at", "joined", "registered at", "start date", "starts at", "end date", "expires at"]) {
    const parsed = parseCmsDate(cmsField(record, [name]));
    if (parsed) return parsed;
  }
  return null;
}

export function cmsChoiceMatches(value: string, selected: string): boolean {
  if (selected === "all") return true;
  return value.toLowerCase().split(/[,;|\n]+/).some((part) => part.trim() === selected.trim().toLowerCase());
}

export function cmsDateMatches(record: Record<string, unknown>, period: string, start: string, end: string, now = new Date()): boolean {
  if (period === "all" || (period === "custom" && !start && !end)) return true;
  const date = cmsDate(record);
  if (!date) return false;
  const r = period !== "custom" ? cmsPresetRange(period, start, end, now) : null;
  // Addis Ababa days to instants: midnight there is 21:00 UTC the day before.
  let from = r ? Date.parse(`${r.from}T00:00:00Z`) - 10800000 : -Infinity;
  let until = r ? Date.parse(`${r.until}T00:00:00Z`) - 10800000 + 86400000 : Infinity;
  if (period === "custom") {
    const parsedStart = start ? parseCmsDate(start) : null;
    const parsedEnd = end ? parseCmsDate(end) : null;
    if ((start && !parsedStart) || (end && !parsedEnd)) return false;
    from = parsedStart ? +parsedStart : -Infinity;
    until = parsedEnd ? +parsedEnd + 86400000 : Infinity;
  }
  return +date >= from && +date < until;
}

// A date preset as an inclusive Addis Ababa day range (YYYY-MM-DD), for date-first loading from Noor.
// The spec's date ranges for every Noor page (Update 1.2): Today is the default everywhere. All time has no range
// (pages then read every page of Noor, or the saved copy). Same Addis Ababa arithmetic as Chapa (date-presets.ts).
export const CMS_DATE_PRESETS = [
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
  ["all", "All time"],
  ["custom", "Custom"],
] as const;
export const CMS_DEFAULT_PERIOD = "today" as const;
export function cmsPresetRange(period: string, start = "", end = "", now = new Date()): { from: string; until: string } | null {
  const day = (t: number) => new Date(t + 10800000).toISOString().slice(0, 10);
  const today = day(+now);
  if (period === "all") return null;
  if (period !== "custom" && isDatePreset(period)) {
    const r = datePresetRange(period, null, null, now);
    return r.from && r.until ? { from: r.from, until: r.until } : null;
  }
  if (period === "custom") {
    const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!ok(start) && !ok(end)) return null;
    const from = ok(start) ? start : end;
    const until = ok(end) ? end : today;
    return from <= until ? { from, until } : { from: until, until: from };
  }
  return null;
}

// Pages that always need a date range (growth, revenue, invoices): All time is every day since Noor began.
export const CMS_ALL_FROM = "2015-01-01";
export function cmsRangeOrAll(period: string, start = "", end = "", now = new Date()): { from: string; until: string } | null {
  if (period === "all") return { from: CMS_ALL_FROM, until: new Date(+now + 10800000).toISOString().slice(0, 10) };
  return cmsPresetRange(period, start, end, now);
}
