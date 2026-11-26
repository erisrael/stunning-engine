// Small helpers for the OAuth and MCP endpoints: CORS for tools that call from a browser (MCP Inspector), and
// OAuth-style JSON errors.
import { OAuthError } from "./oauth";
import { WorkflowError } from "./workflow";

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id",
  "Access-Control-Max-Age": "86400",
};
export const preflight = () => new Response(null, { status: 204, headers: CORS });
export const json = (body: unknown, status = 200, extra: Record<string, string> = {}) => Response.json(body, { status, headers: { ...CORS, "Cache-Control": "no-store", ...extra } });
export function oauthFail(e: unknown) {
  if (e instanceof OAuthError) return json({ error: e.error, error_description: e.description }, e.status);
  if (e instanceof WorkflowError) return json({ error: e.code === "FORBIDDEN" ? "access_denied" : "invalid_request", error_description: e.message }, e.code === "FORBIDDEN" ? 403 : 400);
  return json({ error: "server_error", error_description: "Something went wrong." }, 500);
}
