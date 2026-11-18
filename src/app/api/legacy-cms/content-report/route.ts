import { getViewer } from "@/server/auth";
import { contentReport } from "@/server/noor-content";
import { logReportExport, reportCsv, reportXlsx } from "@/server/cms-reports";

// The academic content report (Legacy CMS, Content, Report) as Excel or CSV: ?format=xlsx|csv. The PDF is the print
// page /export/cms-report?list=noor-content.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const format = new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  try {
    const { report, meta } = await contentReport(viewer);
    await logReportExport(viewer, format, report, meta);
    const body = format === "csv" ? reportCsv(report, meta) : new Uint8Array(await reportXlsx(report, meta));
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="academic-content-${meta.until}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
}
