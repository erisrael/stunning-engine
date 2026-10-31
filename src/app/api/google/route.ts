import { getViewer } from "@/server/auth";
import { createMeet, disconnect, googleConnection, startYoutubeUpload } from "@/server/google";
import { can, hasRole } from "@/server/users";
import { WorkflowError } from "@/server/workflow";

// Google actions for the signed-in person: status, a Meet link, starting a YouTube upload, disconnecting.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  if (viewer.previewBy) return Response.json({ ok: false, error: "Not available in View as." }, { status: 403 });
  let body: { op?: string; title?: string; description?: string; size?: number; mime?: string; privacy?: "private" | "unlisted" | "public" };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  try {
    let data: unknown = null;
    if (body.op === "status") data = await googleConnection(viewer.id);
    else if (body.op === "meet") data = { link: await createMeet(viewer, body.title || "Call") };
    else if (body.op === "youtube") {
      if (!hasRole(viewer, "uploading") && !can(viewer, "work.override") && !viewer.leads.includes("uploading")) throw new WorkflowError("FORBIDDEN", "Uploading staff upload to YouTube.");
      data = await startYoutubeUpload(viewer, { title: String(body.title ?? ""), description: body.description, privacy: body.privacy, size: Number(body.size), mime: String(body.mime ?? "") });
    } else if (body.op === "disconnect") await disconnect(viewer);
    else return Response.json({ ok: false, error: "Unknown operation." }, { status: 400 });
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof WorkflowError) return Response.json({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return Response.json({ ok: false, error: "Google did not answer. Try again." }, { status: 500 });
  }
}
