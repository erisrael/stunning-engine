import { appOrigin } from "@/server/password-reset";
import { resourceMetadata } from "@/server/oauth";
import { json, preflight } from "@/server/oauth-http";

// RFC 9728: the MCP server (/api/mcp) and the authorization server that protects it.
export async function GET() {
  return json(resourceMetadata(await appOrigin()), 200, { "Cache-Control": "public, max-age=3600" });
}
export const OPTIONS = preflight;
