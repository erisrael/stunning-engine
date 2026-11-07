"use client";

// A department's report for a period: totals, work by status and type, people, projects, KPIs and money, what was
// finished and what is overdue. Printable (or saved as PDF from the print dialog), and downloadable as Excel.

import * as React from "react";
import { DownloadIcon, PrinterIcon, FilterIcon, CalendarIcon, UserIcon, FolderIcon, BarChart3Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { DeptReportData } from "@/server/work-extras";
import type { Period } from "@/lib/dashboards";

const fmt = (v: number) => v.toLocaleString("en-US");

export type DevReportKind =
  | "standup"
  | "weekly"
  | "retro"
  | "velocity";

export function ReportView({ dept, data, period, workspace }: { dept: string; data: DeptReportData; period: Period; workspace: string }) {
  const t = data.names.tasks.toLowerCase();

  // Report Type & Filters
  const [reportKind, setReportKind] = React.useState<DevReportKind>("standup");
  const [filterDeveloper, setFilterDeveloper] = React.useState<string>("all");
  const [filterProject, setFilterProject] = React.useState<string>("all");
  const [filterStatus, setFilterStatus] = React.useState<string>("all");

  // Filtered task lists
  const filteredDone = data.doneList.filter((item) => {
    if (filterDeveloper !== "all" && item.assignee !== filterDeveloper) return false;
    return true;
  });

  const filteredOverdue = data.overdueList.filter((item) => {
    if (filterDeveloper !== "all" && item.assignee !== filterDeveloper) return false;
    return true;
  });

  // Filtered People
  const filteredPeople = data.people.filter((p) => {
    if (filterDeveloper !== "all" && p.name !== filterDeveloper) return false;
    return true;
  });

  // Filtered Projects
  const filteredProjects = data.projects.filter((p) => {
    if (filterProject !== "all" && p.key !== filterProject) return false;
    return true;
  });

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

  const reportTitle =
    reportKind === "standup"
      ? "Daily Standup Report"
      : reportKind === "weekly"
      ? "Weekly Engineering Report"
      : reportKind === "retro"
      ? "Sprint Retrospective Report"
      : "Monthly Velocity and Delivery Report";

  return (
    <div className="space-y-4">
      {/* Report Controls & Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-2">
          {/* Report Kind Selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Type:</span>
            <Select value={reportKind} onValueChange={(v) => setReportKind(v as DevReportKind)}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standup">Daily Standup Report</SelectItem>
                <SelectItem value="weekly">Weekly Engineering Report</SelectItem>
                <SelectItem value="retro">Sprint Retrospective Report</SelectItem>
                <SelectItem value="velocity">Monthly Velocity &amp; Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Single Developer */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Developer:</span>
            <Select value={filterDeveloper} onValueChange={setFilterDeveloper}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Developers</SelectItem>
                {data.people.map((p) => (
                  <SelectItem key={p.name} value={p.name}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Project */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Project:</span>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {data.projects.map((p) => (
                  <SelectItem key={p.key} value={p.key}>
                    {p.key} - {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Team Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Status:</span>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="open">In Progress / Open</SelectItem>
                <SelectItem value="overdue">Overdue / Blocked</SelectItem>
                <SelectItem value="done">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <PrinterIcon className="size-4" /> Print / Save PDF
          </Button>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <a href={`/api/dept-report?dept=${encodeURIComponent(dept)}&period=${period}`}>
              <DownloadIcon className="size-4" /> Excel
            </a>
          </Button>
        </div>
      </div>

      {/* Main Report Document */}
      <article className="mx-auto max-w-4xl space-y-6 rounded-xl border bg-card p-6 print:max-w-none print:border-0 print:p-0 sm:p-10">
        <header className="border-b pb-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{workspace}</p>
            <Badge variant="outline" className="text-xs font-medium">
              {reportTitle}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold mt-1">{data.title} {reportTitle}</h1>
          <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-3 mt-1">
            <span>Period: <strong>{data.period.label}</strong> ({data.period.from} to {data.period.to})</span>
            {filterDeveloper !== "all" && <span>Developer: <strong>{filterDeveloper}</strong></span>}
            {filterProject !== "all" && <span>Project: <strong>{filterProject}</strong></span>}
            {filterStatus !== "all" && <span>Status Scope: <strong>{filterStatus}</strong></span>}
          </div>
        </header>

        {/* Highlight KPI Summary Cards */}
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ["Completed Work", filteredDone.length],
            ["Overdue / Blockers", filteredOverdue.length],
            ["Active Open Tasks", data.totals.open],
            ["New Tasks Created", data.totals.created],
            ["Hours Logged", data.totals.hours],
          ].map(([label, v]) => (
            <div key={label as string} className="rounded-lg border p-3 bg-muted/10">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold tabular">{fmt(v as number)}</p>
            </div>
          ))}
        </section>

        {/* Standup / Retro Specific Narrative Sections */}
        {reportKind === "standup" && (
          <section className="space-y-3 rounded-lg border bg-muted/10 p-4">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              Daily Standup Summary &amp; Blockers
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 text-xs text-muted-foreground">
              <div className="rounded border bg-card p-3">
                <div className="font-semibold text-foreground mb-1">Delivered Yesterday / Recently</div>
                {filteredDone.slice(0, 5).map((d) => (
                  <div key={d.code} className="truncate py-0.5 font-mono">
                    {d.code} - {d.title} ({d.assignee ?? "unassigned"})
                  </div>
                ))}
                {!filteredDone.length && <div>No items finished in the selected period.</div>}
              </div>
              <div className="rounded border bg-card p-3">
                <div className="font-semibold text-foreground mb-1 text-rose-600 dark:text-rose-400">Blockers &amp; Overdue Items</div>
                {filteredOverdue.slice(0, 5).map((d) => (
                  <div key={d.code} className="truncate py-0.5 font-mono">
                    {d.code} - {d.title} (due {d.due})
                  </div>
                ))}
                {!filteredOverdue.length && <div className="text-emerald-600">No overdue blockers detected.</div>}
              </div>
            </div>
          </section>
        )}

        {reportKind === "retro" && (
          <section className="space-y-3 rounded-lg border bg-muted/10 p-4">
            <h2 className="text-sm font-semibold">Sprint Retrospective Review</h2>
            <div className="grid gap-3 sm:grid-cols-3 text-xs">
              <div className="rounded border bg-card p-3 space-y-1">
                <div className="font-semibold text-emerald-600">What went well</div>
                <p className="text-muted-foreground">High velocity on core modules; {filteredDone.length} items completed on target.</p>
              </div>
              <div className="rounded border bg-card p-3 space-y-1">
                <div className="font-semibold text-amber-600">What can improve</div>
                <p className="text-muted-foreground">Address estimation drift on long-running tasks and eliminate carry-over.</p>
              </div>
              <div className="rounded border bg-card p-3 space-y-1">
                <div className="font-semibold text-primary">Action items for next sprint</div>
                <p className="text-muted-foreground">Refine acceptance criteria during backlog grooming and set daily standup check-ins.</p>
              </div>
            </div>
          </section>
        )}

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
          <h2 className="mb-2 text-sm font-semibold">People / Developer Breakdown</h2>
          {table(
            ["Person", "Open", "Done", "Overdue", "Hours"],
            filteredPeople.map((p) => [p.name, p.open, p.done, p.overdue, p.hours]),
            "No developers match the filter."
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">{data.names.projects} Breakdown</h2>
          {table(
            ["Project", "Status", "Progress", "Done", "Due", "Budget"],
            filteredProjects.map((p) => [
              `${p.key} ${p.name}`,
              p.status,
              `${p.progress}%`,
              `${p.done}/${p.total}`,
              p.due ?? "",
              p.budget == null ? "" : fmt(p.budget),
            ]),
            `No ${data.names.projects.toLowerCase()} match the filter.`
          )}
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
          <h2 className="mb-2 text-sm font-semibold">Finished in the period ({filteredDone.length})</h2>
          {table(
            ["Item", "Type", "By", "Done"],
            filteredDone.slice(0, 60).map((d) => [`${d.code} ${d.title}`, d.type, d.assignee ?? "", d.completed]),
            "Nothing finished in this period matching filters."
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">Overdue &amp; Blockers ({filteredOverdue.length})</h2>
          {table(
            ["Item", "Assignee", "Due"],
            filteredOverdue.map((d) => [`${d.code} ${d.title}`, d.assignee ?? "", d.due]),
            "Nothing overdue matching filters."
          )}
        </section>
      </article>
    </div>
  );
}

