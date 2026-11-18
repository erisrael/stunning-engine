import { getViewer } from "@/server/auth";
import { readRecording, saveRecording } from "@/server/support-desk";
import { finishRecording, saveRecordingChunk } from "@/server/call-records";
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
    const call = (await params).call;
    const mime = request.headers.get("content-type") ?? "audio/webm";
    // During the call the browser sends the recording in pieces (?chunk=0, 1, 2...) and ?finish=1 when it hangs up,
    // so a closed tab loses seconds, not the call. A whole file (a phone system's recording) still works.
    const u = new URL(request.url);
    if (u.searchParams.has("chunk")) return Response.json(await saveRecordingChunk(viewer, call, Number(u.searchParams.get("chunk")), { mime, data }));
    if (u.searchParams.get("finish") === "1") return Response.json({ id: await finishRecording(call, viewer) });
    const id = await saveRecording(viewer, call, { mime, data });
    return Response.json({ id });
  } catch (e) {
    return fail(e);
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ call: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  try {
    const call = (await params).call;
    const download = new URL(request.url).searchParams.get("download") === "1";
    const r = await readRecording(viewer, call, download);
    if (r.redirect) return Response.redirect(r.redirect, 302);
    if (!r.data) return new Response("Not found", { status: 404 });
    const ext = r.mime.includes("mpeg") ? "mp3" : r.mime.includes("ogg") ? "ogg" : r.mime.includes("wav") ? "wav" : "webm";
    return new Response(new Uint8Array(r.data), { headers: { "Content-Type": r.mime, "Cache-Control": "private, no-store", ...(download ? { "Content-Disposition": `attachment; filename="call-${call}.${ext}"` } : {}) } });
  } catch (e) {
    return fail(e);
  }
}
