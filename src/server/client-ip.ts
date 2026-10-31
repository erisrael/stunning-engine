// The visitor's internet address, read so that it cannot be faked by the visitor.
//
// Behind a proxy (Render, or Nginx/Caddy on a VPS) the address arrives in X-Forwarded-For, which the visitor can
// also write into. Each proxy adds the address it saw to the end, so the trustworthy entry is the one added by our
// own proxy: counted from the end, TRUSTED_PROXY_HOPS entries back (1 by default, the right number for Render
// and for one Nginx in front of the app). Set TRUSTED_PROXY_HOPS=0 when the app is reached directly (no proxy),
// so the header is ignored. Behind Cloudflare, set TRUST_CLOUDFLARE=1 to use its CF-Connecting-IP.

export function clientIpFrom(h: { get(name: string): string | null }): string | null {
  if (process.env.TRUST_CLOUDFLARE === "1") {
    const cf = h.get("cf-connecting-ip")?.trim();
    if (cf) return cf.slice(0, 64);
  }
  const hops = Math.max(0, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? "1")) || 0);
  if (hops > 0) {
    const list = (h.get("x-forwarded-for") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (list.length) return (list[Math.max(0, list.length - hops)] ?? null)?.slice(0, 64) ?? null;
    const real = h.get("x-real-ip")?.trim();
    if (real) return real.slice(0, 64);
  }
  return null;
}
