import { getViewer } from "@/server/auth";
import { joinGroupCall, leaveGroupCall, pollGroupCall, signalGroupCall, startGroupCall } from "@/server/group-calls";
import { WorkflowError } from "@/server/workflow";

// Group calls: start, join, poll (participants and setup messages for me), signal one person, leave.
// navigator.sendBeacon posts "leave" here when the call tab closes.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  let body: { op?: string; callId?: string; groupId?: string; media?: string; afterSeq?: number; to?: string; kind?: string; payload?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  // View as: nothing rings and nothing is sent as the person; polling gets an empty answer instead of an error.
  if (viewer.previewBy) {
    if (body.op === "poll") return Response.json({ ok: true, data: { participants: [], signals: [], status: "ended", preview: true } }, { headers: { "Cache-Control": "no-store" } });
    if (body.op === "hangup" || body.op === "leave" || body.op === "decline") return Response.json({ ok: true, data: null });
    return Response.json({ ok: false, error: "Calls are paused while you view the app as someone else. Leave View as to call.", code: "PREVIEW" });
  }
  try {
    const id = String(body.callId ?? "");
    let data: unknown = null;
    switch (body.op) {
      case "start":
        data = await startGroupCall(viewer, String(body.groupId ?? ""), body.media === "video" ? "video" : "audio");
        break;
      case "join":
        data = await joinGroupCall(viewer, id);
        break;
      case "poll":
        data = await pollGroupCall(viewer, id, Number(body.afterSeq ?? 0));
        break;
      case "signal":
        await signalGroupCall(viewer, id, String(body.to ?? ""), String(body.kind ?? ""), String(body.payload ?? ""));
        break;
      case "leave":
        await leaveGroupCall(viewer, id);
        break;
      default:
        return Response.json({ ok: false, error: "Unknown operation." }, { status: 400 });
    }
    return Response.json({ ok: true, data }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof WorkflowError) return Response.json({ ok: false, error: err.message, code: err.code });
    console.error(err);
    return Response.json({ ok: false, error: "Something went wrong with the call." }, { status: 500 });
  }
}
