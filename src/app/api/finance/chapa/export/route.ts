import { getViewer } from "@/server/auth";
import { chapaReport, type TxFilter } from "@/server/chapa-hub";
import { logReportExport, reportCsv, reportXlsx } from "@/server/cms-reports";

// Chapa transactions as Excel or CSV, with the same filters as the Transactions page:
//   ?format=xlsx|csv&biz=&q=&status=a,b&from=&until=&currency=&type=a,b&method=a,b
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const u = new URL(request.url);
  const q = (k: string) => u.searchParams.get(k) ?? "";
  const list = (k: string) => (q(k) ? q(k).split(",").filter(Boolean).slice(0, 20) : undefined);
  const f: TxFilter = { biz: q("biz") || null, q: q("q") || undefined, status: list("status"), from: q("from") || undefined, until: q("until") || undefined, currency: q("currency") || undefined, type: list("type"), method: list("method") };
  const format = q("format") === "csv" ? "csv" : "xlsx";
  try {
    const { report, meta } = await chapaReport(viewer, f);
    await logReportExport(viewer, format, report, meta);
    const body = format === "csv" ? reportCsv(report, meta) : new Uint8Array(await reportXlsx(report, meta));
    return new Response(body, {
      headers: {
        "Content-Type": format === "csv" ? "text/csv; charset=utf-8" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="chapa-transactions-${meta.from}-to-${meta.until}.${format}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
}
