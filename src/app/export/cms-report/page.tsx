import * as React from "react";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { completedRangeTask } from "@/server/cms-tasks";
import { cleanSpec, logReportExport, reportMeta, reportRun, unableReport, type ReportMeta } from "@/server/cms-reports";
import { MyseedLogo } from "@/components/app/logo";
import { buildCmsReport, CMS_GROUP_BY, type CmsReport, type CmsReportSpec } from "@/lib/cms-report";
import { CmsReportToolbar } from "./toolbar";

export const metadata = { title: "CMS report" };

const PDF_ROW_CAP = 3000;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const cell = "border border-[#e8eaed] px-[1.5mm] py-[0.8mm]";
const head = "border border-[#e8eaed] px-[1.5mm] py-[1mm]";

async function load(viewer: Awaited<ReturnType<typeof requireViewer>>, sp: Record<string, string | undefined>): Promise<{ report: CmsReport; meta: ReportMeta } | null> {
  try {
    if (sp.list === "chapa") {
      const { chapaReport } = await import("@/server/chapa-hub");
      const l = (k: string) => (sp[k] ? sp[k]!.split(",").filter(Boolean) : undefined);
      return await chapaReport(viewer, { biz: sp.biz || null, q: sp.q, status: l("status"), from: sp.from, until: sp.until, currency: sp.currency, type: l("type"), method: l("method") });
    }
    if (sp.list === "unable") return await unableReport(viewer, { search: sp.q, verifier: sp.verifier, ids: sp.ids ? sp.ids.split(",").slice(0, 2000) : undefined });
    const source = sp.run ? await reportRun(viewer, sp.run) : null;
    const range = source ? source.result : (await completedRangeTask(viewer, sp.task ?? "")).result;
    const raw: Partial<CmsReportSpec> = source?.spec ?? JSON.parse(sp.spec || "{}");
    const spec = cleanSpec(raw, range);
    return { report: buildCmsReport(range.records, range.headers, spec), meta: await reportMeta(viewer, range, spec) };
  } catch {
    return null;
  }
}

// Branded A4 report of one Legacy CMS load: cover details, KPI summary, a chart of the groups, then a table per
// group, with page numbers and a footer. Rendered on the server; "Save as PDF" prints it. Every open is logged.
export default async function CmsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const loaded = await load(viewer, sp);
  if (!loaded) redirect("/legacy-cms?view=reports&expired=1");
  const { report, meta } = loaded;
  await logReportExport(viewer, "pdf", report, meta);

  const landscape = sp.orientation ? sp.orientation === "landscape" : report.columns.length > 7;
  const title = report.spec.title || `${meta.table} report`;
  const range = meta.from === meta.until ? meta.from : `${meta.from} to ${meta.until}`;
  const footerText = `${meta.workspace} · ${title} · ${range} · ${meta.exportedAt}`.replace(/["\\]/g, "");
  const grouped = report.spec.groupBy !== "none";
  const chart = report.groups.slice(0, 12);
  const chartBy = report.sumColumn && report.totals.sum > 0 ? "sum" : "count";
  const max = Math.max(1, ...chart.map((g) => (chartBy === "sum" ? g.sum : g.count)));
  let budget = PDF_ROW_CAP;
  const shown = report.groups.map((g) => {
    const rows = g.rows.slice(0, Math.max(0, budget));
    budget -= rows.length;
    return { ...g, rows };
  });
  const truncated = report.totals.count > PDF_ROW_CAP;
  const groupLabel = CMS_GROUP_BY.find(([k]) => k === report.spec.groupBy)?.[1] ?? "No grouping";
  const top = report.groups[0];

  return (
    <div className="report-screen min-h-screen bg-[#e9ebef] py-6 print:min-h-0 print:bg-white print:py-0">
      <style>{`
        @page {
          size: A4 ${landscape ? "landscape" : "portrait"};
          margin: 12mm 11mm 14mm;
          @bottom-left { content: "${footerText}"; font: 7pt sans-serif; color: #8a919c; }
          @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 7pt sans-serif; color: #8a919c; }
        }
        .report-sheet, .report-sheet * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .report-sheet { width: ${landscape ? "297mm" : "210mm"}; min-height: ${landscape ? "210mm" : "297mm"}; padding: 12mm 11mm 14mm; font-size: 7.5pt; }
        .report-sheet thead { display: table-header-group; }
        .report-sheet tr, .report-kpi, .report-chart { break-inside: avoid; }
        .report-group-head { break-after: avoid; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .report-sheet { width: auto; min-height: 0; padding: 0; margin: 0; box-shadow: none; }
        }
      `}</style>
      <div className="no-print mx-auto mb-4 max-w-[297mm] px-4 print:hidden">
        <CmsReportToolbar
          fileTitle={`${meta.workspace} ${title} ${range}`}
          landscape={landscape}
          note={truncated ? `The PDF lists the first ${PDF_ROW_CAP.toLocaleString()} of ${report.totals.count.toLocaleString()} rows; Excel has all of them.` : undefined}
        />
      </div>

      <article className="report-sheet mx-auto bg-white text-[#292d34] shadow-[0_2px_16px_rgba(15,23,42,0.12)]">
        <header className="flex items-start justify-between gap-6 border-b-2 border-[#074924] pb-[4mm]">
          <div className="flex items-center gap-3">
            <MyseedLogo className="size-[13mm] shrink-0" />
            <div>
              <p className="text-[7.5pt] font-semibold tracking-[0.18em] text-[#2f6f45] uppercase">{meta.workspace} · Legacy CMS</p>
              <h1 className="text-[18pt] leading-tight font-bold">{title}</h1>
              <p className="text-[8.5pt] text-[#656f7d]">
                {meta.table} · {range}
              </p>
            </div>
          </div>
          <dl className="grid shrink-0 grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-right text-[7.5pt] text-[#656f7d]">
            <dt>Generated</dt>
            <dd className="font-medium text-[#292d34]">{meta.exportedAt}</dd>
            <dt>Prepared by</dt>
            <dd className="font-medium text-[#292d34]">{meta.exportedBy}</dd>
            <dt>Filters</dt>
            <dd className="max-w-[60mm] font-medium text-[#292d34]">{meta.filters}</dd>
            <dt>Grouped by</dt>
            <dd className="font-medium text-[#292d34]">{groupLabel}</dd>
            <dt>Loaded with</dt>
            <dd className="font-medium text-[#292d34]">{meta.method}</dd>
          </dl>
        </header>

        <section className="my-[4mm] grid grid-cols-4 gap-[3mm]" aria-label="Summary">
          <Kpi label="Rows" value={fmt(report.totals.count)} sub="in this range" />
          {report.sumColumn ? (
            <Kpi label={`Total ${report.sumColumn}`} value={fmt(report.totals.sum)} sub={`average ${fmt(report.totals.count ? report.totals.sum / report.totals.count : 0)}`} />
          ) : (
            <Kpi label="Columns" value={fmt(report.columns.length)} sub="in the tables" />
          )}
          <Kpi label="Groups" value={fmt(report.groups.length)} sub={groupLabel.toLowerCase()} />
          <Kpi label="Largest group" value={top ? top.label : "-"} sub={top ? `${fmt(top.count)} rows${report.sumColumn ? ` · ${fmt(top.sum)}` : ""}` : "no rows"} small />
        </section>

        {grouped && chart.length > 1 && (
          <section className="report-chart mb-[5mm]" aria-label="Chart by group">
            <h2 className="mb-[1.5mm] text-[9.5pt] font-bold">
              {chartBy === "sum" ? `${report.sumColumn} by ${groupLabel.toLowerCase()}` : `Rows by ${groupLabel.toLowerCase()}`}
              {report.groups.length > chart.length && (
                <span className="ml-2 text-[7pt] font-normal text-[#656f7d]">
                  top {chart.length} of {report.groups.length}
                </span>
              )}
            </h2>
            <svg viewBox={`0 0 600 ${chart.length * 18 + 4}`} className="w-full" role="img" aria-label="Bar chart">
              {chart.map((g, i) => {
                const v = chartBy === "sum" ? g.sum : g.count;
                const w = Math.max(1, (v / max) * 380);
                return (
                  <g key={g.key} transform={`translate(0 ${i * 18 + 2})`}>
                    <text x="150" y="11" textAnchor="end" fontSize="9" fill="#292d34">
                      {g.label.length > 28 ? `${g.label.slice(0, 27)}…` : g.label}
                    </text>
                    <rect x="158" y="2" width={w} height="12" rx="2" fill="#2f6f45" />
                    <text x={162 + w} y="11" fontSize="8.5" fill="#656f7d">
                      {fmt(v)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </section>
        )}

        {grouped && (
          <section className="mb-[5mm]" aria-label="Totals by group">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#f5f6f8] text-left text-[6.5pt] tracking-wide text-[#656f7d] uppercase">
                  <th className={head}>{groupLabel}</th>
                  <th className={`${head} text-right`}>Rows</th>
                  {report.sumColumn && <th className={`${head} text-right`}>{report.sumColumn}</th>}
                  <th className={`${head} text-right`}>Share</th>
                </tr>
              </thead>
              <tbody>
                {report.groups.map((g) => (
                  <tr key={g.key}>
                    <td className={`${cell} font-semibold`}>{g.label}</td>
                    <td className={`${cell} text-right tabular-nums`}>{fmt(g.count)}</td>
                    {report.sumColumn && <td className={`${cell} text-right tabular-nums`}>{fmt(g.sum)}</td>}
                    <td className={`${cell} text-right tabular-nums`}>{report.totals.count ? Math.round((g.count / report.totals.count) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr className="font-bold">
                  <td className={cell}>Total</td>
                  <td className={`${cell} text-right tabular-nums`}>{fmt(report.totals.count)}</td>
                  {report.sumColumn && <td className={`${cell} text-right tabular-nums`}>{fmt(report.totals.sum)}</td>}
                  <td className={`${cell} text-right`}>100%</td>
                </tr>
              </tbody>
            </table>
          </section>
        )}

        {shown
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.key} className="mb-[5mm]">
              {grouped && (
                <div className="report-group-head mb-[1.5mm] flex items-baseline justify-between gap-4 border-b border-[#e8eaed] pb-[1mm]">
                  <h2 className="text-[11pt] font-bold">{g.label}</h2>
                  <p className="text-[7pt] text-[#656f7d]">
                    {fmt(g.count)} rows{report.sumColumn ? ` · ${report.sumColumn} ${fmt(g.sum)}` : ""}
                  </p>
                </div>
              )}
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-[#f5f6f8] text-left text-[6.5pt] tracking-wide text-[#656f7d] uppercase">
                    {report.columns.map((c) => (
                      <th key={c} className="border border-[#e8eaed] px-[1.2mm] py-[1mm]">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {g.rows.map((r, i) => (
                    <tr key={i} className={i % 2 ? "bg-[#fafbfc]" : undefined}>
                      {report.columns.map((c) => (
                        <td key={c} className={`border border-[#e8eaed] px-[1.2mm] py-[0.6mm] align-top ${c === report.sumColumn ? "text-right tabular-nums" : ""}`}>
                          {r[c]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
        {truncated && (
          <p className="text-[7.5pt] text-[#8a5300]">
            This PDF lists the first {PDF_ROW_CAP.toLocaleString()} rows. The totals above cover all {fmt(report.totals.count)}; the Excel file has every row.
          </p>
        )}
        {!report.totals.count && <p className="py-10 text-center text-[9pt] text-[#656f7d]">No rows in this range.</p>}
      </article>
    </div>
  );
}

function Kpi({ label, value, sub, small }: { label: string; value: string; sub: string; small?: boolean }) {
  return (
    <div className="report-kpi rounded-md border border-[#e8eaed] bg-[#f4f8f2] p-[2.5mm]">
      <p className="text-[7pt] font-semibold tracking-wide text-[#656f7d] uppercase">{label}</p>
      <p className={`mt-0.5 leading-none font-bold ${small ? "truncate text-[11pt]" : "text-[16pt]"}`}>{value}</p>
      <p className="mt-1 text-[7pt] text-[#656f7d]">{sub}</p>
    </div>
  );
}
