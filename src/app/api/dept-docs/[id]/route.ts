import { getViewer } from "@/server/auth";
import { exportDoc } from "@/server/dev-library";

// A department document as Word (.docx), Markdown or HTML: ?dept=dev&format=docx|md|html
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const q = new URL(request.url).searchParams;
  const format = (["docx", "md", "html"].includes(q.get("format") ?? "") ? q.get("format") : "docx") as "docx" | "md" | "html";
  try {
    const f = await exportDoc(viewer, q.get("dept") ?? "", (await params).id, format);
    return new Response(new Uint8Array(f.data), { headers: { "Content-Type": f.mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(f.name)}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 404 });
  }
}
