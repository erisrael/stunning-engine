import { revokeToken } from "@/server/oauth";
import { preflight, CORS } from "@/server/oauth-http";

// RFC 7009: an app gives its token back. Always 200, as the RFC asks.
export async function POST(req: Request) {
  const form = new URLSearchParams(await req.text());
  const t = form.get("token");
  if (t) await revokeToken(t).catch(() => {});
  return new Response(null, { status: 200, headers: CORS });
}
export const OPTIONS = preflight;
