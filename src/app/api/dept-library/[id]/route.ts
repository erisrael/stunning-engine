import { getViewer } from "@/server/auth";
import { readFile, VIEWABLE } from "@/server/dev-library";
import { clientIpFrom } from "@/server/client-ip";

// A file from a department's document library, for people it is shared with (src/server/dept-access.ts). View only:
// shown in the browser when it can be, never downloaded (?download=1 is refused); scraping tools are refused.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const download = new URL(request.url).searchParams.get("download") === "1";
  let file: Awaited<ReturnType<typeof readFile>>;
  try {
    file = await readFile(viewer, (await params).id, { download, userAgent: request.headers.get("user-agent"), ip: clientIpFrom(request.headers) });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
  if (!file) return new Response("Not found", { status: 404 });
  // Files browsers could run (HTML, SVG) are always downloaded, never shown inline.
  const inline = !download && VIEWABLE.test(file.mime);
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": inline ? file.mime : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      ...(file.level === "view" ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'", "X-Robots-Tag": "noindex" } : {}),
    },
  });
}
