import { getViewer } from "@/server/auth";
import { contentFile, staffContentFile } from "@/server/bot-manager";

// A bot content file. Telegram fetches it with the key in the link; signed-in leads can open it without one.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const key = new URL(request.url).searchParams.get("k");
  let f = key ? await contentFile(id, key) : null;
  if (!f && !key) {
    const viewer = await getViewer();
    if (!viewer) return new Response("Sign in required", { status: 401 });
    f = await staffContentFile(viewer, id).catch(() => null);
  }
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.mime, "Content-Length": String(f.data.length), "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" },
  });
}
