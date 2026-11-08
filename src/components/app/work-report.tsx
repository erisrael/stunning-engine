"use client";

// A department's report for a period: totals, work by status and type, people, projects, KPIs and money, what was
// finished and what is overdue. Printable (or saved as PDF from the print dialog), and downloadable as Excel.

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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

  const router=useRouter(), pathname=usePathname(), params=useSearchParams();
  const change=(key:string,value:string)=>{const q=new URLSearchParams(params); if(value==="all") q.delete(key); else q.set(key,value);router.push(`${pathname}?${q}`);};
  const filterDeveloper=data.filters.person || "all", filterProject=data.filters.project || "all", filterStatus=data.filters.status || "all";
  const reportKind = data.filters.sprint ? "retro" : period==="today" ? "standup" : period==="7d" ? "weekly" : "velocity";
  const filteredDone=data.doneList, filteredOverdue=data.overdueList, filteredPeople=data.people, filteredProjects=data.projects;
  const exportQuery=new URLSearchParams({dept,period,...Object.fromEntries(Object.entries(data.filters).filter((e):e is [string,string]=>!!e[1]))});
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
            <Select value={reportKind} onValueChange={(v) => {const q=new URLSearchParams(params);q.delete("sprint");q.set("period",v==="standup"?"today":v==="weekly"?"7d":"month");router.push(`${pathname}?${q}`);}}>
              <SelectTrigger className="h-8 w-56 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="standup">Daily Standup Report</SelectItem>
                <SelectItem value="weekly">Weekly Engineering Report</SelectItem>

                <SelectItem value="velocity">Monthly Velocity &amp; Delivery</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Single Developer */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Developer:</span>
            <Select value={filterDeveloper} onValueChange={v=>change("person",v)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Developers</SelectItem>
                {data.options.people.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Project */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Project:</span>
            <Select value={filterProject} onValueChange={v=>change("project",v)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {data.options.projects.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Filter by Team Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Status:</span>
            <Select value={filterStatus} onValueChange={v=>change("status",v)}>
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

        <label className="text-xs">Sprint<select className="ml-2 rounded border bg-background p-2" value={data.filters.sprint || "all"} onChange={e=>change("sprint",e.target.value)}><option value="all">All sprints</option>{data.options.sprints.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label className="text-xs">Project status<select className="ml-2 rounded border bg-background p-2" value={data.filters.projectStatus || "all"} onChange={e=>change("projectStatus",e.target.value)}><option value="all">All statuses</option>{data.options.projectStatuses.map(s=><option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <div className="flex items-center gap-2 ml-auto">
          <Button size="sm" onClick={() => window.print()} className="gap-1.5">
            <PrinterIcon className="size-4" /> Print / Save PDF
          </Button>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <a href={`/api/dept-report?${exportQuery}`}>
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
                <p className="text-muted-foreground">{filteredDone.length} items completed in the selected sprint.</p>
              </div>
              <div className="rounded border bg-card p-3 space-y-1">
                <div className="font-semibold text-amber-600">What can improve</div>
                <p className="text-muted-foreground">{filteredOverdue.length} open items have passed their due dates. Review their blockers with the assignees.</p>
              </div>
              <div className="rounded border bg-card p-3 space-y-1">
                <div className="font-semibold text-primary">Action items for next sprint</div>
                <p className="text-muted-foreground">Use the sprint planner to capture agreed retrospective actions and assign owners.</p>
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

