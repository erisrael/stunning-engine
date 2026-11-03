import { getViewer } from "@/server/auth";
import { readRecording, saveRecording } from "@/server/support-desk";
import { WorkflowError } from "@/server/workflow";

// A call's recording: the agent's browser (or a lead with a phone system file) sends it here as the request body;
// the agent of the call and support leads listen to it. Every listen is in the activity log.
const fail = (e: unknown) => {
  const status = e instanceof WorkflowError ? (e.code === "FORBIDDEN" ? 403 : e.code === "NOT_FOUND" ? 404 : 400) : 500;
  return Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status });
};

export async function POST(request: Request, { params }: { params: Promise<{ call: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  try {
    const data = new Uint8Array(await request.arrayBuffer());
    const id = await saveRecording(viewer, (await params).call, { mime: request.headers.get("content-type") ?? "audio/webm", data });
    return Response.json({ id });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ call: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  try {
    const r = await readRecording(viewer, (await params).call);
    if (r.redirect) return Response.redirect(r.redirect, 302);
    if (!r.data) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(r.data), { headers: { "Content-Type": r.mime, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return fail(e);
  }
}
