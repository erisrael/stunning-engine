import { getViewer } from "@/server/auth";
import { readVideoFile } from "@/server/legacy";

// A supporting file (PDF, slides, handout) on a video entry in the Legacy catalog.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const file = await readVideoFile(viewer, (await params).id).catch(() => null);
  if (!file) return new Response("Not found", { status: 404 });
  const inline = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain)/.test(file.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
