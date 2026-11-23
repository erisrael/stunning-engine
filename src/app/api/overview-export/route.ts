import { getViewer } from "@/server/auth";
import { overviewCsv, overviewReportHtml, overviewXlsx, type OverviewFilter } from "@/server/overview-export";

// Production, Overview, Export: ?format=xlsx | report | csv with the page's filters (mode, grade, subject, status,
// stage, q). A production team's members get their own team's columns; managers and Admin all four.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const q = new URL(request.url).searchParams;
  const list = (k: string) => (q.get(k) ?? "").split(",").filter((x) => x && x !== "all");
  // The page's status filter is "<team or any>:<status>".
  const raw = q.get("status");
  const [st, v] = raw && raw !== "all" ? raw.split(":") : [null, null];
  const f: OverviewFilter = { grades: list("grade"), subjects: list("subject"), status: v ?? null, stage: st && st !== "any" ? st : null, q: q.get("q"), mode: q.get("mode") === "subject" ? "subject" : "grade" };
  const date = new Date().toISOString().slice(0, 10);
  try {
    const format = q.get("format");
    if (format === "xlsx")
      return new Response(new Uint8Array(await overviewXlsx(viewer, f)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="overview-${date}.xlsx"`, "Cache-Control": "no-store" } });
    if (format === "csv")
      return new Response(await overviewCsv(viewer, f), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="overview-${date}.csv"`, "Cache-Control": "no-store" } });
    return new Response(await overviewReportHtml(viewer, f), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Failed", { status: 403 });
  }
}
