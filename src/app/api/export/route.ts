import { getViewer } from "@/server/auth";
import { exportItems, type ExportRequest } from "@/server/exporter";
import { parseFilters } from "@/lib/filters";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const body = (await request.json()) as Omit<ExportRequest, "filters"> & { query: string };
  try {
    const filters = parseFilters(new URLSearchParams(body.query ?? ""));
    const file = await exportItems(viewer, { ...body, filters });
    return new Response(typeof file.body === "string" ? file.body : new Uint8Array(file.body), {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "X-Row-Count": String(file.rows),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Export failed", { status: 400 });
  }
}
