import { getViewer } from "@/server/auth";
import { overviewCsv, overviewReportHtml } from "@/server/dept-overview-export";

// A department's team overview with the page's filters: ?format=csv (the tasks) or ?format=report (the print-ready
// report, A4; &print=1 opens the print dialog). The person's own permissions apply.
export async function GET(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const dept = (await params).dept;
  const q = new URL(request.url).searchParams;
  const f = { project: q.get("project"), person: q.get("person"), type: q.get("type"), priority: q.get("priority"), sprint: q.get("sprint"), period: q.get("period") ? Number(q.get("period")) : null };
  try {
    if (q.get("format") === "csv")
      return new Response(await overviewCsv(viewer, dept, f), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${dept}-tasks-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    return new Response(await overviewReportHtml(viewer, dept, f), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
