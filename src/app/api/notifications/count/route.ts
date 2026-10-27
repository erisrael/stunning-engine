import { getViewer } from "@/server/auth";
import { nowIso } from "@/server/db";
import { unreadCount } from "@/server/notifications";
import { unreadChatCount } from "@/server/chat";

export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return Response.json({ count: 0, chat: 0 }, { status: 401 });
  return Response.json({ count: await unreadCount(viewer.id, nowIso()), chat: await unreadChatCount(viewer.id) }, { headers: { "Cache-Control": "no-store" } });
}
