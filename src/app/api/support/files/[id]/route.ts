import { getViewer } from "@/server/auth";
import { readTicketFile } from "@/server/support-help";

// A photo or document a customer sent on a ticket (Telegram), for agents who can work that ticket.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const file = await readTicketFile(viewer, (await params).id).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  const inline = /^(image\/(png|jpe?g|gif|webp)|application\/pdf|text\/plain)/.test(file.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
