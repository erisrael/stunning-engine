import { getViewer } from "@/server/auth";
import { transcript } from "@/server/support-desk";

// The whole conversation as a text file, for agents who can work the ticket.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const t = await transcript(viewer, (await params).id).catch(() => null);
  if (!t) return new Response("Not found", { status: 404 });
  return new Response(t.text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${t.name}"`, "Cache-Control": "private, no-store" } });
}
