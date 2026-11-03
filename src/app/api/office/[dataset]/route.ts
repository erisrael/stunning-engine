import { getViewer } from "@/server/auth";
import { officeExport } from "@/server/office";

// A data feed as Excel, Word or PowerPoint for the signed-in person: /api/office/<dataset>?format=xlsx|docx|pptx
async function _GET(request: Request, { params }: { params: Promise<{ dataset: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const f = new URL(request.url).searchParams.get("format");
  try {
    const out = await officeExport(viewer, (await params).dataset, f === "docx" || f === "pptx" ? f : "xlsx");
    return new Response(new Uint8Array(out.data), { headers: { "Content-Type": out.mime, "Content-Disposition": `attachment; filename="${out.name}"`, "Cache-Control": "no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}

// Counted in Admin, Platform, API usage.
export const GET = (...a: Parameters<typeof _GET>) => import("@/server/platform").then((p) => p.tracked("office", () => _GET(...a)));
