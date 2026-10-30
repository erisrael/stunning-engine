import { getViewer } from "@/server/auth";
import { readTaskFile } from "@/server/work-extras";

// Serves a file attached to a department task, to people who can see the task.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const file = await readTaskFile(viewer, (await params).id).catch(() => null);
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
