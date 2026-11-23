// Where to go after signing in: only a path on this site. "//evil.com", "/\evil.com" (browsers read the backslash as
// a slash), full addresses, other schemes and control characters all fall back to the dashboard (open redirects).
export function safeNext(next: string | null | undefined, fallback = "/dashboard") {
  const n = String(next ?? "");
  if (!/^\/(?![\\/])/.test(n) || /[\\\u0000-\u001f\u007f]/.test(n)) return fallback;
  try {
    const home = new URL("https://same.site");
    return new URL(n, home).origin === home.origin ? n : fallback;
  } catch {
    return fallback;
  }
}
