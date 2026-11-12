// Lengths of recordings are typed and shown as minutes and seconds (M:S, as 12:30); they are stored as decimal
// minutes. "12:30", "12m30s", "12.5" and "12" all read as twelve and a half minutes (or twelve).

export function parseMS(input: unknown): number | null {
  const s = String(input ?? "").trim().toLowerCase();
  if (!s) return null;
  let m = /^(\d{1,4}):(\d{1,2})$/.exec(s);
  if (m) {
    const sec = Number(m[2]);
    if (sec >= 60) return NaN;
    return Number(m[1]) + sec / 60;
  }
  m = /^(?:(\d{1,4})\s*m(?:in)?)?\s*(?:(\d{1,2})\s*s(?:ec)?)?$/.exec(s);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) + Number(m[2] ?? 0) / 60;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

// 12.5 -> "12:30"; null -> "".
export function fmtMS(min: number | null | undefined) {
  if (min == null || !Number.isFinite(Number(min))) return "";
  const total = Math.round(Number(min) * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
