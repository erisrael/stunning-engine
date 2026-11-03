import { checkApiKey, handleEvent } from "@/server/dev-tools";
import { WorkflowError } from "@/server/workflow";

// Other tools report to a department here (Phase 12b.5), with the department's API key (Configure, Tools):
//   Authorization: Bearer <key>          (CI/CD, monitoring, test runners)
//   X-Gitlab-Token: <key>                (GitLab merge request hooks)
//   ?key=<key>                           (Sentry, whose webhooks cannot set a header)
// Body: { "type": "deploy", "environment": "production", "version": "1.4.0", "status": "ok" } and the like.
export async function POST(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const dept = (await params).dept;
  const url = new URL(request.url);
  const key = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-gitlab-token") || url.searchParams.get("key");
  if (!(await checkApiKey(dept, key))) return Response.json({ error: "Unknown or missing API key." }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  try {
    const r = await handleEvent(dept, body, { gitlab: request.headers.get("x-gitlab-event"), sentry: request.headers.get("sentry-hook-resource") });
    return Response.json(r);
  } catch (e) {
    const status = e instanceof WorkflowError ? (e.code === "NOT_FOUND" ? 404 : 400) : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status });
  }
}
