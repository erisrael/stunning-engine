import { getViewer } from "@/server/auth";
import { exportPeople } from "@/server/io-export";

// Members, teams or departments as CSV (Update 1.0, phase 6). Admin's export switches are checked on the server.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const entity = new URL(request.url).searchParams.get("entity") ?? "members";
  try {
    const f = await exportPeople(viewer, entity);
    return new Response(`﻿${f.body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${f.filename}"`, "Cache-Control": "no-store" } });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Export failed", { status: 403 });
  }
}
