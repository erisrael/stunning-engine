import { getViewer } from "@/server/auth";
import { answerCall, declineCall, hangUp, pollCalls, sendSignal, startCall } from "@/server/calls";
import { WorkflowError } from "@/server/workflow";

// The call engine's single endpoint, polled by the call layer on every page. A route handler rather than server
// actions, so polling never re-renders pages; navigator.sendBeacon also posts here when a tab closes mid-call.
export async function POST(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ ok: false, error: "Sign in again." }, { status: 401 });
  let body: { op?: string; callId?: string; groupId?: string; media?: string; afterSeq?: number; kind?: string; payload?: string; reason?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  try {
    const id = String(body.callId ?? "");
    let data: unknown = null;
    switch (body.op) {
      case "poll":
        data = await pollCalls(viewer, { callId: body.callId ?? null, afterSeq: Number(body.afterSeq ?? 0) });
        break;
      case "start":
        data = await startCall(viewer, String(body.groupId ?? ""), body.media === "video" ? "video" : "audio");
        break;
      case "answer":
        data = await answerCall(viewer, id);
        break;
      case "decline":
        await declineCall(viewer, id);
        break;
      case "hangup":
        await hangUp(viewer, id, body.reason === "failed" ? "failed" : null);
        break;
      case "signal":
        await sendSignal(viewer, id, String(body.kind ?? ""), String(body.payload ?? ""));
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
