// Only recognize local check-in links. Signature, expiry and office checks remain server-side.
export function checkinCodeFrom(text: string, origin: string): string | null {
  const t = text.trim();
  const valid = (value: string) => /^[\w-]+\.[\w-]+$/.test(value) || /^kiosk\.[\w-]+\.\d{13}\.[A-Za-z0-9_-]{43}$/.test(value);
  if (valid(t)) return t;
  try {
    const u = new URL(t, origin);
    if (u.origin !== origin || u.pathname !== "/in") return null;
    const c = u.searchParams.get("c");
    return c && valid(c) ? c : null;
  } catch {
    return null;
  }
}

