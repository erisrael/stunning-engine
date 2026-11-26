import { userForToken } from "@/server/feeds";
import * as Doc from "@/server/corr/documents";
import { verifyDocument } from "@/server/corr/signing";
import { WorkflowError } from "@/server/workflow";

// Correspondence for the company's other applications, with an API key from Admin, Integrations that includes
// "Correspondence" (Authorization: Bearer msk_...). The key acts as the person who made it, with their rights.
//   GET  /api/v1/corr/letters?q=&status=&direction=      search the registry
//   GET  /api/v1/corr/letter?id=                          one letter's status and details
//   POST /api/v1/corr/drafts      {categoryId, subject, recipients, data}   create a draft
//   POST /api/v1/corr/incoming    {subject, sender, externalRef, receivedAt, dueAt}  register incoming mail
//   GET  /api/v1/corr/verify?q=CODE-OR-REFERENCE           verify an issued letter
const json = (b: unknown, status = 200) => Response.json(b, { status, headers: { "Cache-Control": "no-store" } });

async function who(req: Request) {
  const t = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  return t ? userForToken(t, "correspondence") : null;
}

async function handle(req: Request, op: string) {
  if (op === "verify") return json(await verifyDocument(new URL(req.url).searchParams.get("q") ?? "", { ip: null, ua: "api" }));
  const user = await who(req);
  if (!user) return json({ error: "The key is missing, revoked, or does not include Correspondence." }, 401);
  const q = new URL(req.url).searchParams;
  try {
    if (req.method === "GET" && op === "letters") return json(await Doc.listDocs(user, { q: q.get("q") ?? undefined, status: q.get("status")?.split(","), direction: (q.get("direction") as "outgoing" | "incoming") || undefined, page: Number(q.get("page")) || 0 }));
    if (req.method === "GET" && op === "letter") {
      const d = await Doc.getDoc(user, q.get("id") ?? "");
      return json({ id: d.id, ref: d.ref, status: d.status, subject: d.subject, direction: d.direction, category: d.categoryName, issuedAt: d.issuedAt, dispatchedAt: d.dispatchedAt, deliveredAt: d.deliveredAt, recipients: d.recipients, verifyCode: d.verifyCode, contentHash: d.contentHash });
    }
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (req.method === "POST" && op === "drafts") {
      const id = await Doc.createDraft(user, { categoryId: String(body.categoryId ?? "") });
      await Doc.saveDraft(user, id, { subject: String(body.subject ?? ""), data: body.data ?? {}, recipients: body.recipients ?? [] });
      return json({ id }, 201);
    }
    if (req.method === "POST" && op === "incoming") return json(await Doc.registerIncoming(user, body as never), 201);
    return json({ error: "Not found." }, 404);
  } catch (e) {
    if (e instanceof WorkflowError) return json({ error: e.message }, e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400);
    return json({ error: "The request failed." }, 500);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ op: string }> }) {
  return handle(req, (await params).op);
}
export async function POST(req: Request, { params }: { params: Promise<{ op: string }> }) {
  return handle(req, (await params).op);
}
