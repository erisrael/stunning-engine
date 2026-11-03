import { getViewer } from "@/server/auth";
import { exportJiraCsv } from "@/server/dev-tools";
import { msProjectXml } from "@/server/dev-plan";

// A department's tasks for other tools (Phase 12b): ?format=jira (Jira's CSV) or ?format=msproject (MS Project XML,
// optionally &project=<id>). The person's own permissions apply.
export async function GET(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const dept = (await params).dept;
  const url = new URL(request.url);
  const format = url.searchParams.get("format");
  try {
    if (format === "jira") {
      const body = await exportJiraCsv(viewer, dept);
      return new Response(`﻿${body}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${dept}-tasks-jira.csv"` } });
    }
    if (format === "msproject") {
      const body = await msProjectXml(viewer, dept, url.searchParams.get("project"));
      return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Content-Disposition": `attachment; filename="${dept}-plan.xml"` } });
    }
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
  return new Response("Use format=jira or format=msproject", { status: 400 });
}
