import { appOrigin } from "@/server/password-reset";
import { metadata } from "@/server/oauth";
import { json, preflight } from "@/server/oauth-http";

// RFC 8414: how Claude and ChatGPT find the sign-in and token addresses.
export async function GET() {
  return json(metadata(await appOrigin()), 200, { "Cache-Control": "public, max-age=3600" });
}
export const OPTIONS = preflight;
