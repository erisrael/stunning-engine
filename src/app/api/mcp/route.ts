import { appOrigin } from "@/server/password-reset";
import { bearerUser } from "@/server/oauth";
import { OPERATIONS, runOperation } from "@/server/tools-api";
import { CORS, json, preflight } from "@/server/oauth-http";
import { WorkflowError } from "@/server/workflow";

// The remote MCP server for Claude (Streamable HTTP, JSON responses, no server-sent stream). Add it in Claude as a
// custom connector with the address <site>/api/mcp; Claude finds the sign-in through the 401 below and OAuth.
// Every request carries the person's token, checked here: their own Tools data only, while Admin allows MCP for them.
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const ok = (id: Msg["id"], result: unknown) => ({ jsonrpc: "2.0", id, result });
const err = (id: Msg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function handle(m: Msg, user: NonNullable<Awaited<ReturnType<typeof bearerUser>>>) {
  if (m.jsonrpc !== "2.0" || typeof m.method !== "string") return err(m.id, -32600, "Invalid request.");
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return ok(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "myseed-tools", title: "Myseed Tools hub", version: "1.0.0" },
        instructions: `You are connected to ${user.name}'s private Myseed Tools hub: their notes, checklists, tasks and reminders, and a lookup of production lesson parts they may see. Ask before creating notes on their behalf when the request is unclear.`,
      });
    }
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, {
        tools: Object.entries(OPERATIONS).map(([name, o]) => ({
          name,
          description: o.description,
          inputSchema: o.input,
          annotations: { readOnlyHint: !["create_note", "add_checklist_item"].includes(name), destructiveHint: false, openWorldHint: false },
        })),
      });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      if (!Object.hasOwn(OPERATIONS, name)) return err(m.id, -32602, `Unknown tool ${name}.`);
      try {
        const result = await runOperation(user, name, (m.params?.arguments ?? {}) as Record<string, unknown>);
        return ok(m.id, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], structuredContent: result, isError: false });
      } catch (e) {
        return ok(m.id, { content: [{ type: "text", text: e instanceof WorkflowError ? e.message : "The operation failed." }], isError: true });
      }
    }
    default:
      return err(m.id, -32601, `Method ${m.method} is not supported.`);
  }
}

export async function POST(req: Request) {
  const user = await bearerUser(req, "mcp");
  if (!user) {
    const origin = await appOrigin();
    return json({ error: "invalid_token", error_description: "Connect with OAuth first." }, 401, { "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/api/mcp", scope="tools"` });
  }
  const body = (await req.json().catch(() => null)) as Msg | Msg[] | null;
  if (!body) return json(err(null, -32700, "Parse error."), 400);
  const list = Array.isArray(body) ? body.slice(0, 50) : [body];
  const out = [];
  for (const m of list) {
    // Notifications (no id) get no answer.
    if (m && m.id === undefined) continue;
    out.push(await handle(m, user));
  }
  if (!out.length) return new Response(null, { status: 202, headers: CORS });
  return json(Array.isArray(body) ? out : out[0]);
}

export async function GET() {
  return new Response("This MCP server answers POST requests only.", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}
export const OPTIONS = preflight;
