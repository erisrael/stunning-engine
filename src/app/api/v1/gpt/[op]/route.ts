import { bearerUser } from "@/server/oauth";
import { runOperation, type Operation } from "@/server/tools-api";
import { json, preflight } from "@/server/oauth-http";
import { WorkflowError } from "@/server/workflow";

// The Custom GPT actions (see /api/v1/gpt/schema.json). Every call needs the person's OAuth token.
const ROUTES: Record<string, Partial<Record<"GET" | "POST", Operation>>> = {
  notes: { GET: "list_user_notes", POST: "create_note" },
  reminders: { GET: "list_reminders" },
  "checklist-items": { POST: "add_checklist_item" },
  crosscheck: { GET: "crosscheck_code_or_teacher" },
};

async function run(req: Request, method: "GET" | "POST", op: string) {
  const name = ROUTES[op]?.[method];
  if (!name) return json({ error: "Not found." }, 404);
  const user = await bearerUser(req, "gpt");
  if (!user) return json({ error: "Connect your Myseed account first." }, 401, { "WWW-Authenticate": 'Bearer scope="tools"' });
  const args: Record<string, unknown> =
    method === "GET"
      ? Object.fromEntries([...new URL(req.url).searchParams].map(([k, v]) => [k, v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) && k === "limit" ? Number(v) : v]))
      : (((await req.json().catch(() => ({}))) ?? {}) as Record<string, unknown>);
  try {
    return json(await runOperation(user, name, args));
  } catch (e) {
    if (e instanceof WorkflowError) return json({ error: e.message }, e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400);
    return json({ error: "The operation failed." }, 500);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ op: string }> }) {
  return run(req, "GET", (await params).op);
}
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  return run(req, "POST", (await params).op);
}
export const OPTIONS = preflight;
