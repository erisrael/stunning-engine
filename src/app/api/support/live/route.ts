import { getViewer } from "@/server/auth";
import * as sd from "@/server/support-desk";
import { sseResponse } from "@/server/sse";

export const dynamic = "force-dynamic";

// The desk's live stream: the inbox stamp (refresh the list when it changes) and, with ?ticket=, the open ticket's
// state (new messages, the customer typing, read, online). Opening it keeps the agent seen.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const ticket = new URL(request.url).searchParams.get("ticket");
  try {
    await sd.inboxStamp(viewer);
    if (ticket) await sd.agentLive(viewer, ticket);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
  let beat = 0;
  return sseResponse(request, async () => {
    if (++beat % 20 === 1) await sd.heartbeat(viewer);
    return { inbox: await sd.inboxStamp(viewer), ticket: ticket ? await sd.agentLive(viewer, ticket) : null };
  });
}
