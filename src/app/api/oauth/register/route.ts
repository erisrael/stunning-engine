import { registerClient } from "@/server/oauth";
import { json, oauthFail, preflight } from "@/server/oauth-http";

// RFC 7591 dynamic client registration (Claude registers itself before asking the person to connect).
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return json({ error: "invalid_client_metadata", error_description: "Send JSON." }, 400);
    return json(await registerClient(body), 201);
  } catch (e) {
    const r = oauthFail(e);
    return r.status === 400 ? json({ error: "invalid_redirect_uri", error_description: (e as Error).message }, 400) : r;
  }
}
export const OPTIONS = preflight;
