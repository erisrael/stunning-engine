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
  const local = new Date(+now + 10800000);
  const today = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - 10800000;
  let from = today;
  let until = today + 86400000;
  if (period === "yesterday") { from -= 86400000; until = today; }
  if (period === "week") from -= ((local.getUTCDay() + 6) % 7) * 86400000;
  if (period === "month") from = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 10800000;
  if (period === "30days") from -= 29 * 86400000;
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
export const CMS_DATE_PRESETS = [
  ["today", "Today"],
  ["yesterday", "Yesterday"],
  ["week", "This week"],
  ["month", "This month"],
  ["30days", "Last 30 days"],
  ["custom", "Custom"],
] as const;
export function cmsPresetRange(period: string, start = "", end = "", now = new Date()): { from: string; until: string } | null {
  const day = (t: number) => new Date(t + 10800000).toISOString().slice(0, 10);
  const local = new Date(+now + 10800000);
  const today = day(+now);
  const back = (n: number) => day(+now - n * 86400000);
  if (period === "today") return { from: today, until: today };
  if (period === "yesterday") return { from: back(1), until: back(1) };
  if (period === "week") return { from: back((local.getUTCDay() + 6) % 7), until: today };
  if (period === "month") return { from: `${today.slice(0, 7)}-01`, until: today };
  if (period === "30days") return { from: back(29), until: today };
  if (period === "custom") {
    const ok = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
    if (!ok(start) && !ok(end)) return null;
    const from = ok(start) ? start : end;
    const until = ok(end) ? end : today;
    return from <= until ? { from, until } : { from: until, until: from };
  }
  return null;
}
