import { getViewer } from "@/server/auth";
import { completedRangeTask } from "@/server/cms-tasks";
import { cleanSpec, logReportExport, reportCsv, reportMeta, reportRun, reportXlsx, unableReport } from "@/server/cms-reports";
import { buildCmsReport, type CmsReportSpec } from "@/lib/cms-report";

// Legacy CMS report files (Update 1.0, Phase 2):
//   ?task=<range load id>&spec=<json>&format=xlsx|csv   exactly the rows that were previewed
//   ?run=<scheduled run id>&format=xlsx|csv             a scheduled report's stored rows
//   ?list=unable&format=xlsx|csv[&ids=a,b][&q=]          the Unable-to-verify contact list
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const url = new URL(request.url);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const format = q("format") === "csv" ? "csv" : "xlsx";
  try {
    let built;
    if (q("list") === "unable") {
      const u = await unableReport(viewer, { search: q("q"), verifier: q("verifier"), ids: q("ids") ? q("ids").split(",").slice(0, 2000) : undefined });
      built = { report: u.report, meta: u.meta, name: "invoices-unable-to-verify" };
    } else {
      const source = q("run") ? await reportRun(viewer, q("run")) : null;
      const range = source ? source.result : (await completedRangeTask(viewer, q("task"))).result;
      let raw: Partial<CmsReportSpec> = source?.spec ?? {};
      if (!source) {
        try {
          raw = JSON.parse(q("spec") || "{}");
        } catch {
          return new Response("Invalid report settings", { status: 400 });
        }
      }
      const spec = cleanSpec(raw, range);
      const report = buildCmsReport(range.records, range.headers, spec);
      built = { report, meta: await reportMeta(viewer, range, spec), name: `${range.category}-${range.from}-to-${range.until}` };
    }
    await logReportExport(viewer, format, built.report, built.meta);
    const body = format === "csv" ? reportCsv(built.report, built.meta) : new Uint8Array(await reportXlsx(built.report, built.meta));
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(`${built.name}.${format}`)}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
}
