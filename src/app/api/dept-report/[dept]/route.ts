import { getViewer } from "@/server/auth";
import { deptPageReportHtml, hasReport } from "@/server/dept-page-report";

// A department page as a print-ready report in the company format: ?view=<page> plus the page's own filters;
// &print=1 opens the print dialog (Save as PDF). The person's own permissions apply.
export async function GET(request: Request, { params }: { params: Promise<{ dept: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const dept = (await params).dept;
  const q = new URL(request.url).searchParams;
  const view = q.get("view") ?? "list";
  if (!hasReport(view)) return new Response("This page has no report", { status: 404 });
  try {
    return new Response(await deptPageReportHtml(viewer, dept, view, q), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
