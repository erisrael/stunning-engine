import { getViewer } from "@/server/auth";
import { readProfileFile } from "@/server/profiles";

// A profile file, for its owner, their lead or line manager, HR and Admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const file = await readProfileFile(viewer, (await params).id).catch(() => null);
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
