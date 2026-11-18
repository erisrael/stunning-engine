import { getViewer } from "@/server/auth";
import { chapaCustomersReport, type ChapaCustomerFilter, type ChapaCustomerOutcome } from "@/server/chapa-hub";
import { logReportExport, reportCsv, reportXlsx } from "@/server/cms-reports";

// Chapa customers as Excel or CSV, with the same filters as the Customers tab:
//   ?format=xlsx|csv&biz=&q=&from=&until=&method=a,b&outcome=paid_first,recovered,failed_only,pending_only&sort=
// (the PDF is the print page /export/cms-report?list=chapa-customers with the same parameters).
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const u = new URL(request.url);
  const q = (k: string) => u.searchParams.get(k) ?? "";
  const list = (k: string) => (q(k) ? q(k).split(",").filter(Boolean).slice(0, 20) : undefined);
  const f: ChapaCustomerFilter = { biz: q("biz") || null, q: q("q") || undefined, from: q("from") || undefined, until: q("until") || undefined, method: list("method"), outcome: list("outcome") as ChapaCustomerOutcome[] | undefined, sort: (q("sort") || undefined) as ChapaCustomerFilter["sort"] };
  const format = q("format") === "csv" ? "csv" : "xlsx";
  try {
    const { report, meta } = await chapaCustomersReport(viewer, f);
    await logReportExport(viewer, format, report, meta);
    const body = format === "csv" ? reportCsv(report, meta) : new Uint8Array(await reportXlsx(report, meta));
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="chapa-customers-${meta.from}-to-${meta.until}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
}
