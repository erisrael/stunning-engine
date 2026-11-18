// Whether a browser request comes from a page of this site. Behind a proxy (Caddy on the VPS) the app's own request.url
// is its inside address (http://0.0.0.0:3000/...), never the https address the browser used, so comparing the Origin
// header with request.url refused every same-site POST. The host the browser asked for is in Host (Caddy keeps it) or
// X-Forwarded-Host; the Origin's host must be one of them. Browsers cannot forge Origin or Host, which is what this
// check is for (pages of other sites).
export function requestHosts(request: Request): string[] {
  const raw = [request.headers.get("x-forwarded-host"), request.headers.get("host"), safeHost(request.url)];
  return [...new Set(raw.flatMap((v) => (v ?? "").split(",")).map((s) => s.trim().toLowerCase()).filter(Boolean))];
}

function safeHost(u: string) {
  try {
    return new URL(u).host;
  } catch {
    return "";
  }
}

export function fromThisSite(request: Request, origin: string | null | undefined): boolean {
  if (!origin) return false;
  const host = safeHost(origin).toLowerCase();
  return !!host && requestHosts(request).includes(host);
}
