import { getViewer } from "@/server/auth";
import { iceServers } from "@/server/calls";

// Connection servers for a call: public STUN, plus Cloudflare relay credentials when the relay is set up.
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ iceServers: [] }, { status: 401 });
  return Response.json(await iceServers(), { headers: { "Cache-Control": "no-store" } });
}
