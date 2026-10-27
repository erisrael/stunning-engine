// Display helpers. Stored instants are UTC; everything shown uses the workspace timezone.

export const DEFAULT_TZ = "Africa/Addis_Ababa";

export function fmtDateTime(iso: string | null | undefined, tz = DEFAULT_TZ, opts: { seconds?: boolean } = {}) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: opts.seconds ? "2-digit" : undefined,
    hourCycle: "h23",
  }).format(d);
}

export function fmtDate(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function fmtShortDate(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(d);
}

export function fmtTime(iso: string | null | undefined, tz = DEFAULT_TZ) {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

export function tzLabel(tz = DEFAULT_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
  const off = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  return `${tz.replace(/_/g, " ")} (${off.replace("GMT", "UTC")})`;
}

export function fmtDuration(ms: number | null | undefined, opts: { empty?: string } = {}) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return opts.empty ?? "-";
  if (ms < 0) ms = 0;
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h ? `${days}d ${h}h` : `${days}d`;
}

export function fmtHours(ms: number | null | undefined, digits = 1) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return "-";
  return `${(ms / 3600000).toFixed(digits)}h`;
}

export function fmtAge(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "-";
  return fmtDuration(now - new Date(iso).getTime());
}

export function fmtRelative(iso: string | null | undefined, now = Date.now()) {
  if (!iso) return "-";
  const diff = new Date(iso).getTime() - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 60000) return "just now";
  if (abs < 3600000) return rtf.format(Math.round(diff / 60000), "minute");
  if (abs < 86400000) return rtf.format(Math.round(diff / 3600000), "hour");
  if (abs < 86400000 * 30) return rtf.format(Math.round(diff / 86400000), "day");
  return rtf.format(Math.round(diff / (86400000 * 30)), "month");
}

export function fmtPct(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${(n * 100).toFixed(digits)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

// Converts a value from <input type="datetime-local"> interpreted in tz into a UTC ISO string.
export function localInputToIso(value: string, tz = DEFAULT_TZ): string | null {
  if (!value) return null;
  const [datePart, timePart = "00:00"] = value.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offset = tzOffsetMinutes(new Date(guess), tz);
  return new Date(guess - offset * 60000).toISOString();
}

export function isoToLocalInput(iso: string | null | undefined, tz = DEFAULT_TZ, dateOnly = false): string {
  if (!iso) return "";
  const d = new Date(iso);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  return dateOnly ? date : `${date}T${parts.hour}:${parts.minute}`;
}

export function tzOffsetMinutes(date: Date, tz = DEFAULT_TZ) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

// Local calendar date (YYYY-MM-DD) of an instant in tz.
export function localDate(iso: string | Date, tz = DEFAULT_TZ) {
  return isoToLocalInput(typeof iso === "string" ? iso : iso.toISOString(), tz, true);
}

// End of a local day in tz, as a UTC instant. Used for date-only due dates.
export function endOfLocalDayIso(date: string, tz = DEFAULT_TZ) {
  return localInputToIso(`${date}T23:59`, tz);
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}
