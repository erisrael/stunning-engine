import { getViewer } from "@/server/auth";
import { exportDoc } from "@/server/dev-library";
import { clientIpFrom } from "@/server/client-ip";

// A department document as Word (.docx), Markdown or HTML: ?dept=dev&format=docx|md|html. Needs download access.
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const q = new URL(request.url).searchParams;
  const format = (["docx", "md", "html"].includes(q.get("format") ?? "") ? q.get("format") : "docx") as "docx" | "md" | "html";
  try {
    const f = await exportDoc(viewer, q.get("dept") ?? "", (await params).id, format, { userAgent: request.headers.get("user-agent"), ip: clientIpFrom(request.headers) });
    return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: /shared|only view|app/i.test(e instanceof Error ? e.message : "") ? 403 : 404 });
  }
}
