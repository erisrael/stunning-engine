import { getViewer } from "@/server/auth";
import { can } from "@/server/users";
import { sseResponse } from "@/server/sse";
import { liveDashboard } from "@/server/live-dashboard";

// The live admin dashboard as server-sent events (Admin only): the roster and the desk's numbers, sent whenever they
// change (checked every 3 seconds). The stream ends after a few minutes and the browser reconnects by itself.
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (!can(viewer, "users.manage") || viewer.previewBy) return new Response("Only Admin sees the live dashboard", { status: 403 });
  return sseResponse(request, () => liveDashboard(viewer), { intervalMs: 3000 });
}
