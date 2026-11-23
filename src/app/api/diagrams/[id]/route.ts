import { getViewer } from "@/server/auth";
import { getDiagram } from "@/server/diagrams";

// A draw.io diagram's picture (SVG) for documents and the project book. ?xml=1 returns the editable drawing. The
// picture is served so that nothing in it can run (no scripts, a sandbox), whatever was drawn.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  try {
    const d = await getDiagram(viewer, (await params).id.replace(/\.svg$/, ""));
    if (new URL(request.url).searchParams.get("xml")) return new Response(d.xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } });
    const svg = d.svg || `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="80"><rect width="420" height="80" rx="8" fill="#f3f4f6" stroke="#9ca3af" stroke-dasharray="6 4"/><text x="210" y="46" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">Empty diagram: open it in draw.io to draw</text></svg>`;
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-cache",
        ETag: `"${d.updated_at}"`,
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not found", { status: 404 });
  }
}
