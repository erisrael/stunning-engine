"use client";

// A department's report for a period: totals, work by status and type, people, projects, KPIs and money, what was
// finished and what is overdue. Printable (or saved as PDF from the print dialog), and downloadable as Excel.

import * as React from "react";
import { DownloadIcon, PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DeptReportData } from "@/server/work-extras";
import type { Period } from "@/lib/dashboards";

const fmt = (v: number) => v.toLocaleString("en-US");

export function ReportView({ dept, data, period, workspace }: { dept: string; data: DeptReportData; period: Period; workspace: string }) {
  const t = data.names.tasks.toLowerCase();
  const table = (head: string[], rows: (string | number | null)[][], empty: string) =>
    rows.length ? (
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-muted-foreground">
          <tr className="border-b">
            {head.map((h, i) => (
              <th key={h} className={`py-1.5 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`py-1.5 pr-3 ${j > 0 ? "text-right tabular" : ""}`}>
                  {c ?? ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    ) : (
      <p className="text-sm text-muted-foreground">{empty}</p>
    );
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 no-print">
        <Button size="sm" onClick={() => window.print()}>
          <PrinterIcon /> Print or save as PDF
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a href={`/api/dept-report?dept=${encodeURIComponent(dept)}&period=${period}`}>
            <DownloadIcon /> Excel
          </a>
        </Button>
      </div>
      <article className="mx-auto max-w-4xl space-y-6 rounded-xl border bg-card p-6 print:max-w-none print:border-0 print:p-0 sm:p-10">
        <header className="border-b pb-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{workspace}</p>
          <h1 className="text-2xl font-semibold">{data.title} report</h1>
          <p className="text-sm text-muted-foreground">
            {data.period.label}: {data.period.from} to {data.period.to}
          </p>
        </header>
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Done", data.totals.done],
            ["New", data.totals.created],
            ["Still open", data.totals.open],
            ["Overdue", data.totals.overdue],
            ["Hours logged", data.totals.hours],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular">{fmt(v as number)}</p>
            </div>
          ))}
        </section>
        <section className="grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-2 text-sm font-semibold">By status</h2>
            {table(["Status", t], data.byStatus.map((s) => [s.label, s.count]), "Nothing yet.")}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-semibold">By type</h2>
            {table(["Type", "Open", "Done"], data.byType.map((s) => [s.label, s.open, s.done]), "Nothing yet.")}
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">People</h2>
          {table(["Person", "Open", "Done", "Overdue", "Hours"], data.people.map((p) => [p.name, p.open, p.done, p.overdue, p.hours]), "Nobody yet.")}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">{data.names.projects}</h2>
          {table(["Project", "Status", "Progress", "Done", "Due", "Budget"], data.projects.map((p) => [`${p.key} ${p.name}`, p.status, `${p.progress}%`, `${p.done}/${p.total}`, p.due ?? "", p.budget == null ? "" : fmt(p.budget)]), `No ${data.names.projects.toLowerCase()}.`)}
        </section>
        {(data.kpis.length > 0 || data.money.length > 0) && (
          <section className="grid gap-6 sm:grid-cols-2">
            {data.kpis.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold">KPIs</h2>
                {table(["KPI", "Total"], data.kpis.map((k) => [k.label, `${fmt(k.total)}${k.unit ? ` ${k.unit}` : ""}`]), "")}
              </div>
            )}
            {data.money.length > 0 && (
              <div>
                <h2 className="mb-2 text-sm font-semibold">Money on finished work</h2>
                {table(["Field", "Total"], data.money.map((m) => [m.label, fmt(m.done)]), "")}
              </div>
            )}
          </section>
        )}
        <section>
          <h2 className="mb-2 text-sm font-semibold">Finished in the period ({data.doneList.length})</h2>
          {table(["Item", "Type", "By", "Done"], data.doneList.slice(0, 60).map((d) => [`${d.code} ${d.title}`, d.type, d.assignee ?? "", d.completed]), "Nothing finished in this period.")}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold">Overdue ({data.overdueList.length})</h2>
          {table(["Item", "Assignee", "Due"], data.overdueList.map((d) => [`${d.code} ${d.title}`, d.assignee ?? "", d.due]), "Nothing overdue.")}
        </section>
      </article>
    </div>
  );
}
