import { getViewer } from "@/server/auth";
import { exportKb } from "@/server/kb-guides";

// Every help article and guide as JSON, in the import format (support leads).
export async function GET() {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  try {
    const list = await exportKb(viewer);
    return new Response(JSON.stringify(list, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="help-articles-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
