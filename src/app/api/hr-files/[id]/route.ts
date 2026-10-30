import { getViewer } from "@/server/auth";
import { readDocument } from "@/server/hr";

// Serves an HR document to HR (ID documents need the sensitive right) or to the person it belongs to.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  // View as never opens someone's private documents.
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const file = await readDocument(viewer, (await params).id).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  // Files browsers could run (HTML, SVG) are always downloaded, never shown inline.
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
