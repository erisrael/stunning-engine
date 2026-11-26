import { tokenEndpoint } from "@/server/oauth";
import { json, oauthFail, preflight } from "@/server/oauth-http";

// The token endpoint: a one-time code (with its PKCE verifier) or a refresh token for an access token.
export async function POST(req: Request) {
  try {
    const type = req.headers.get("content-type") ?? "";
    const form = type.includes("application/json") ? new URLSearchParams(Object.entries((await req.json().catch(() => ({}))) as Record<string, string>)) : new URLSearchParams(await req.text());
    const auth = req.headers.get("authorization") ?? "";
    let basic: { id: string; secret: string } | null = null;
    if (/^Basic\s+/i.test(auth)) {
      const [id, secret] = Buffer.from(auth.replace(/^Basic\s+/i, ""), "base64").toString().split(":");
      if (id && secret) basic = { id: decodeURIComponent(id), secret: decodeURIComponent(secret) };
    }
    return json(await tokenEndpoint(form, basic), 200, { Pragma: "no-cache" });
  } catch (e) {
    return oauthFail(e);
  }
}
export const OPTIONS = preflight;
