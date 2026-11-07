// Safe fixes for imported cells, shared by the import helper (server) and the department paste (browser).

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");

// A date in many spellings to YYYY-MM-DD. Day first when unclear (as written in Ethiopia and most of the world).
export function normalizeDate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Excel's day numbers (1900 system).
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const n = Math.floor(Number(s));
    if (n > 20000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 864e5).toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[ T].*)?$/);
  if (m) return valid(+m[1]!, +m[2]!, +m[3]!);
  m = s.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})(?:[ T].*)?$/);
  if (m) {
    let a = +m[1]!, b = +m[2]!;
    const y = m[3]!.length === 2 ? 2000 + +m[3]! : +m[3]!;
    // 03/25/2026: the second number cannot be a month, so the first is.
    if (b > 12 && a <= 12) [a, b] = [b, a];
    return valid(y, b, a);
  }
  m = s.toLowerCase().match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-.,]+([a-z]{3})[a-z]*[\s\-.,]+(\d{4})$/);
  if (m && MONTHS.includes(m[2]!)) return valid(+m[3]!, MONTHS.indexOf(m[2]!) + 1, +m[1]!);
  m = s.toLowerCase().match(/^([a-z]{3})[a-z]*[\s\-.]+(\d{1,2})(?:st|nd|rd|th)?,?[\s\-.]+(\d{4})$/);
  if (m && MONTHS.includes(m[1]!)) return valid(+m[3]!, MONTHS.indexOf(m[1]!) + 1, +m[2]!);
  const t = Date.parse(s);
  if (!Number.isNaN(t) && /[a-z]/i.test(s)) return new Date(t).toISOString().slice(0, 10);
  return null;
}
function valid(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCMonth() === mo - 1 ? `${y}-${pad(mo)}-${pad(d)}` : null;
}

function lev(a: string, b: string) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}
export const squash = (s: string) => s.toLowerCase().replace(/[\s_\-./]+/g, "");

// The allowed value closest to what was written, when it is close enough to be safe.
export function closestOption(v: string, opts: string[]): string | null {
  const s = squash(v);
  if (!s) return null;
  const exact = opts.find((o) => squash(o) === s);
  if (exact) return exact;
  const starts = opts.filter((o) => squash(o).startsWith(s) || s.startsWith(squash(o)));
  if (starts.length === 1 && s.length >= 3) return starts[0]!;
  let best: string | null = null;
  let bestD = Infinity;
  for (const o of opts) {
    const d = lev(s, squash(o));
    if (d < bestD) [best, bestD] = [o, d];
  }
  return best && bestD <= Math.max(1, Math.floor(squash(best).length / 4)) ? best : null;
}

// Validates a master file location or link:
// Accepts:
// 1. Local drive paths: e.g. D:\My Seed EdTech Lecture\Grade 5\... or C:/Videos/...
// 2. Shared network paths: e.g. \\Server\Production\... or //Server/Production/...
// 3. Web links: https://... or http://...
// 4. File URIs: file://...
// 5. Unix/POSIX paths: /Volumes/..., /mnt/..., /Users/...
// 6. Custom schemes: drive://..., dropbox://..., smb://...
// 7. Well-known cloud storage domains without protocol: drive.google.com/..., dropbox.com/...
export function isValidFileLocationOrUrl(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  const v = raw.trim();
  if (!v) return false;

  // 1. Web links (http://, https://)
  if (/^https?:\/\/\S+/i.test(v)) return true;

  // 2. Windows local drive paths (e.g. D:\..., C:\..., D:/...)
  if (/^[a-zA-Z]:[\\/]\S*/i.test(v)) return true;

  // 3. Shared-drive UNC paths (e.g. \\Server\... or //Server/...)
  if (/^(?:\\\\|\/\/)[^\\/\s]+[\\/]\S*/i.test(v)) return true;

  // 4. Unix/POSIX root paths (e.g. /Volumes/..., /mnt/..., /Users/...)
  if (/^\/[^/\s]+[\\/]\S*/i.test(v)) return true;

  // 5. File URI or custom protocols (e.g. file://..., drive://..., smb://...)
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/\S+/i.test(v)) return true;

  // 6. Common domain storage prefixes without protocol (e.g. drive.google.com/..., dropbox.com/...)
  if (/^(?:www\.)?(?:drive\.google\.com|dropbox\.com|onedrive\.live\.com|sharepoint\.com|box\.com|youtube\.com|youtu\.be)[\/\S]*/i.test(v)) return true;

  return false;
}


