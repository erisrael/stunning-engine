"use client";

// The department's team overview and dashboard (src/server/dept-overview.ts): filters in one row, the headline
// numbers (each opens the matching list), the flow by stage, who is on what, projects with progress and health,
// throughput and the mix of work, the current sprint and releases, what is due and what was just finished.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, CircleDotIcon, ClockIcon, DownloadIcon, FilterXIcon, PrinterIcon, RocketIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import { CAT } from "@/lib/chart-colors";
import { deptViewPath } from "@/lib/work";
import { cn } from "@/lib/utils";
import type { DeptOverview as Data } from "@/server/dept-overview";

const PERIODS: [number, string][] = [[7, "7 days"], [30, "30 days"], [90, "90 days"], [365, "1 year"], [0, "All time"]];
const HEALTH: Record<string, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  done: { label: "Finished", className: "border-transparent bg-muted text-muted-foreground", icon: CheckCircle2Icon },
  on_track: { label: "On track", className: "border-[color:var(--success)]/40 text-[color:var(--success)]", icon: CircleDotIcon },
  at_risk: { label: "At risk", className: "border-[color:var(--warning)]/50 text-[color:var(--warning)]", icon: AlertTriangleIcon },
  late: { label: "Late", className: "border-destructive/50 text-destructive", icon: ClockIcon },
};
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : "");

export function DeptOverview({ dept, data }: { dept: string; data: Data }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const unit = data.unit === "points" ? "pts" : "h";
  const set = (key: string, value: string | null) => {
    const q = new URLSearchParams(sp.toString());
    if (value && value !== "all") q.set(key, value);
    else q.delete(key);
    router.push(`${pathname}${q.toString() ? `?${q}` : ""}`, { scroll: false });
  };
  // The list view with the same filters, plus more.
  const list = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (sp.get("project")) q.set("project", sp.get("project")!);
    if (sp.get("person") && sp.get("person") !== "none") q.set("assignee", sp.get("person")!);
    if (sp.get("type")) q.set("type", sp.get("type")!);
    if (sp.get("priority")) q.set("priority", sp.get("priority")!);
    if (sp.get("sprint")) q.set("sprint", sp.get("sprint")!);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return deptViewPath(dept, "list", q.toString());
  };
  const taskHref = (id: string) => deptViewPath(dept, "list", `task=${id}`);
  const statusesOf = (cat: string) => data.flow.filter((s) => s.category === cat).map((s) => s.key).join(",");
  const t = data.tiles;
  const periodLabel = PERIODS.find(([p]) => p === data.period)?.[1] ?? "30 days";
  const tiles: { label: string; value: string; hint?: string; href?: string; warn?: boolean }[] = [
    { label: `Done, ${periodLabel.toLowerCase()}`, value: String(t.doneInPeriod), hint: `${fmt(t.unitsInPeriod)} ${unit}`, href: list({ status: statusesOf("done") }) },
    { label: "Done in all", value: String(t.doneTotal), hint: `${t.progress}% of all ${unit}` },
    { label: "In progress", value: String(t.active), href: list({ status: statusesOf("active") }) },
    { label: "In review and QA", value: String(t.review), href: list({ status: statusesOf("review") }) },
    { label: "To do", value: String(t.todo), href: list({ status: data.flow.filter((s) => s.category === "open" && s.key !== "backlog").map((s) => s.key).join(",") }) },
    { label: "Backlog", value: String(t.backlog), href: list({ status: "backlog" }) },
    { label: "Overdue", value: String(t.overdue), href: list({ due: "overdue" }), warn: t.overdue > 0 },
    { label: "Open bugs", value: String(t.openBugs), href: list({ type: "bug", status: "open" }), warn: t.openBugs > 0 },
    { label: `Releases, ${periodLabel.toLowerCase()}`, value: String(t.releases), href: deptViewPath(dept, "tools") },
    { label: "Velocity", value: t.velocity === null ? "None yet" : `${t.velocity} ${unit}`, hint: "Average of the last three sprints", href: deptViewPath(dept, "sprint") },
  ];
  const filters: { key: string; label: string; all: string; options: { id: string; label: string }[]; none?: string }[] = [
    { key: "project", label: "Project", all: "Every project", options: data.options.projects, none: "No project" },
    { key: "person", label: "Person", all: "Everyone", options: data.options.people, none: "Nobody yet" },
    { key: "type", label: "Type", all: "Every type", options: data.options.types },
    { key: "priority", label: "Priority", all: "Any priority", options: data.options.priorities },
    { key: "sprint", label: "Sprint", all: "Any sprint", options: [{ id: "current", label: "Current sprint" }, ...data.options.sprints], none: "Not in a sprint" },
  ];
  const flowTotal = Math.max(1, data.flow.reduce((n, s) => n + s.count, 0));
  return (
    <div className="space-y-4" data-dept-overview>
      {/* Filters in one row above everything they change. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2" role="group" aria-label="Filters">
        {filters.map((f) => (
          <Select key={f.key} value={sp.get(f.key) ?? "all"} onValueChange={(v) => set(f.key, v)}>
            <SelectTrigger className={cn("h-8 w-44 text-xs", sp.get(f.key) && "border-primary text-primary")} aria-label={f.label} data-overview-filter={f.key}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{f.all}</SelectItem>
              {f.none && <SelectItem value="none">{f.none}</SelectItem>}
              {f.options.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="group" aria-label="Period">
          {PERIODS.map(([p, label]) => (
            <button key={p} type="button" aria-pressed={data.period === p} onClick={() => set("period", p === 30 ? null : String(p))} className={cn("rounded px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground", data.period === p && "bg-background text-foreground shadow-sm")} data-overview-period={p}>
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto flex gap-1.5">
          <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <a href={`/api/dept-overview/${dept}?format=csv&${sp.toString()}`} data-overview-export="csv">
              <DownloadIcon className="size-3.5" /> Export (CSV)
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 gap-1 text-xs">
            <a href={`/api/dept-overview/${dept}?format=report&print=1&${sp.toString()}`} target="_blank" rel="noreferrer" data-overview-export="report">
              <PrinterIcon className="size-3.5" /> Report (PDF)
            </a>
          </Button>
        </span>
        {(data.filtered || data.period !== 30) && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => router.push(pathname, { scroll: false })}>
            <FilterXIcon className="size-3.5" /> Clear
          </Button>
        )}
      </div>

      {/* Headline numbers. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-overview-tiles>
        {tiles.map((x) => {
          const body = (
            <>
              <p className="text-[11px] text-muted-foreground">{x.label}</p>
              <p className={cn("text-xl font-semibold tabular-nums", x.warn && "text-destructive")}>{x.value}</p>
              {x.hint && <p className="text-[11px] text-muted-foreground">{x.hint}</p>}
            </>
          );
          return x.href ? (
            <Link key={x.label} href={x.href} className="rounded-xl border bg-card px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-muted/30" data-overview-tile={x.label}>
              {body}
            </Link>
          ) : (
            <div key={x.label} className="rounded-xl border bg-card px-3 py-2.5" data-overview-tile={x.label}>
              {body}
            </div>
          );
        })}
      </div>

      {/* The flow by stage. */}
      <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="The flow by stage">
        <h2 className="text-sm font-semibold">The flow</h2>
        <div className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {data.flow.filter((s) => s.count).map((s) => (
            <div key={s.key} style={{ width: `${(s.count / flowTotal) * 100}%`, background: s.color }} />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {data.flow.map((s) => (
            <Link key={s.key} href={list({ status: s.key })} className="rounded-lg border px-2.5 py-2 hover:bg-muted/40" data-overview-stage={s.key}>
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.label}
              </p>
              <p className="text-lg font-semibold tabular-nums">{s.count}</p>
              <p className="text-[11px] text-muted-foreground">
                {fmt(s.units)} {unit}
              </p>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* Who is on what. */}
        <section className="space-y-2 rounded-xl border bg-card p-3 xl:col-span-2" aria-label="Who is on what">
          <h2 className="text-sm font-semibold">Who is on what</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Person</th>
                  <th className="px-2 py-1.5 text-right font-medium">To do</th>
                  <th className="px-2 py-1.5 text-right font-medium">Doing</th>
                  <th className="px-2 py-1.5 text-right font-medium">Review</th>
                  <th className="px-2 py-1.5 text-right font-medium">Overdue</th>
                  <th className="px-2 py-1.5 text-right font-medium">Done ({periodLabel})</th>
                  <th className="px-2 py-1.5 text-right font-medium">{unit}</th>
                  <th className="px-2 py-1.5 text-left font-medium">Working on</th>
                </tr>
              </thead>
              <tbody>
                {data.team.map((p) => (
                  <tr key={p.id ?? "none"} className="border-t" data-overview-person={p.name}>
                    <td className="px-2 py-1.5 font-medium">{p.id ? <button type="button" className="hover:underline" onClick={() => set("person", p.id)}>{p.name}</button> : <span className="text-muted-foreground">{p.name}</span>}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.todo}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.active}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.review}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", p.overdue > 0 && "font-semibold text-destructive")}>{p.overdue}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.doneInPeriod}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmt(p.unitsInPeriod)}</td>
                    <td className="max-w-64 px-2 py-1.5">
                      {p.now.length ? (
                        p.now.map((x) => (
                          <Link key={x.id} href={taskHref(x.id)} className="block truncate hover:underline">
                            <span className="font-mono text-[11px] text-muted-foreground">{x.code}</span> {x.title}
                          </Link>
                        ))
                      ) : (
                        <span className="text-muted-foreground">Nothing started</span>
                      )}
                    </td>
                  </tr>
                ))}
                {!data.team.length && (
                  <tr>
                    <td colSpan={8} className="px-2 py-4 text-center text-muted-foreground">
                      Nobody in the team yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* The current sprint and the latest releases. */}
        <div className="space-y-4">
          <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="Current sprint">
            <h2 className="text-sm font-semibold">Current sprint</h2>
            {data.sprint ? (
              <Link href={deptViewPath(dept, "sprint")} className="block space-y-1.5 hover:opacity-90">
                <p className="text-sm font-medium">
                  {data.sprint.name} <span className="text-xs font-normal text-muted-foreground">{day(data.sprint.start)} to {day(data.sprint.end)}, {data.sprint.daysLeft} days left</span>
                </p>
                {data.sprint.goal && <p className="text-xs text-muted-foreground">{data.sprint.goal}</p>}
                <div className="h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${fmt(data.sprint.done)} of ${fmt(data.sprint.committed)} ${unit} done`}>
                  <div className="h-full rounded-full" style={{ width: `${data.sprint.committed ? Math.min(100, (data.sprint.done / data.sprint.committed) * 100) : 0}%`, background: CAT[0] }} />
                </div>
                <p className="text-xs tabular-nums">
                  {fmt(data.sprint.done)} of {fmt(data.sprint.committed)} {unit} done · {data.sprint.finished} of {data.sprint.tasks} tasks
                </p>
              </Link>
            ) : (
              <p className="text-xs text-muted-foreground">No sprint is running.</p>
            )}
          </section>
          <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="Latest releases">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <RocketIcon className="size-3.5" /> Latest releases
            </h2>
            <ul className="divide-y text-xs">
              {data.releases.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-2 py-1.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-muted-foreground tabular-nums">
                    {r.task_count} tasks · {day(r.created_at)}
                  </span>
                </li>
              ))}
              {!data.releases.length && <li className="py-1.5 text-muted-foreground">No releases yet.</li>}
            </ul>
          </section>
        </div>
      </div>

      {/* Projects. */}
      <section className="space-y-2 rounded-xl border bg-card p-3" aria-label="Projects">
        <h2 className="text-sm font-semibold">Projects</h2>
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Project</th>
                <th className="px-2 py-1.5 text-left font-medium">Status</th>
                <th className="w-40 px-2 py-1.5 text-left font-medium">Progress ({unit})</th>
                <th className="px-2 py-1.5 text-right font-medium">Done</th>
                <th className="px-2 py-1.5 text-right font-medium">Open</th>
                <th className="px-2 py-1.5 text-right font-medium">Bugs</th>
                <th className="px-2 py-1.5 text-right font-medium">Overdue</th>
                <th className="px-2 py-1.5 text-left font-medium">Next milestone</th>
                <th className="px-2 py-1.5 text-left font-medium">Due</th>
                <th className="px-2 py-1.5 text-left font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => {
                const h = HEALTH[p.health]!;
                return (
                  <tr key={p.id} className="border-t" data-overview-project={p.key}>
                    <td className="px-2 py-1.5">
                      <button type="button" className="flex items-center gap-1.5 text-left hover:underline" onClick={() => set("project", p.id)}>
                        <span className="size-2 shrink-0 rounded-full" style={{ background: p.color ?? "var(--muted-foreground)" }} />
                        <span className="font-mono text-[11px] text-muted-foreground">{p.key}</span>
                        <span className="font-medium">{p.name}</span>
                      </button>
                    </td>
                    <td className="px-2 py-1.5 text-muted-foreground">{p.status}</td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: CAT[0] }} />
                        </div>
                        <span className="w-9 text-right tabular-nums">{p.progress}%</span>
                      </div>
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {p.done}/{p.total}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.open}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", p.bugs > 0 && "text-destructive")}>{p.bugs}</td>
                    <td className={cn("px-2 py-1.5 text-right tabular-nums", p.overdue > 0 && "font-semibold text-destructive")}>{p.overdue}</td>
                    <td className="px-2 py-1.5">{p.next ? `${p.next.name}${p.next.due ? ` (${p.next.due})` : ""}` : <span className="text-muted-foreground">None</span>}</td>
                    <td className="px-2 py-1.5 tabular-nums">{p.due ?? <span className="text-muted-foreground">Ongoing</span>}</td>
                    <td className="px-2 py-1.5">
                      <Badge variant="outline" className={cn("gap-1 font-medium", h.className)}>
                        <h.icon className="size-3" /> {h.label}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
              {!data.projects.length && (
                <tr>
                  <td colSpan={10} className="px-2 py-4 text-center text-muted-foreground">
                    No projects match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Throughput and the mix of work. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartFrame
          title={`Finished per week (${unit})`}
          description="The last twelve weeks, weeks starting on Monday"
          table={{ columns: ["Week", `Finished (${unit})`, "Tasks finished", "Tasks added"], rows: data.throughput.map((w) => [w.week, w.units, w.finished, w.created]) }}
        >
          <BarsChart data={data.throughput.map((w) => ({ week: w.week.slice(5), units: w.units }))} xKey="week" series={[{ key: "units", label: `Finished (${unit})`, color: CAT[0]! }]} unit={unit} />
        </ChartFrame>
        <ChartFrame title="Work by type" description="Tasks done and still open" table={{ columns: ["Type", "Done", "Open"], rows: data.types.map((x) => [x.label, x.done, x.open]) }}>
          <BarsChart
            data={data.types.map((x) => ({ type: x.label, done: x.done, open: x.open }))}
            xKey="type"
            stacked
            horizontal
            series={[
              { key: "done", label: "Done", color: CAT[0]! },
              { key: "open", label: "Open", color: CAT[1]! },
            ]}
            unit="tasks"
          />
        </ChartFrame>
      </div>

      {/* What is due and what was finished. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: "Due in the next two weeks, and overdue", items: data.dueSoon, empty: "Nothing due soon.", date: (x: Data["dueSoon"][number]) => x.due, label: "Due" },
          { title: "Recently finished", items: data.recent, empty: "Nothing finished yet.", date: (x: Data["recent"][number]) => day(x.done), label: "Done" },
        ].map((box) => (
          <section key={box.title} className="space-y-2 rounded-xl border bg-card p-3" aria-label={box.title}>
            <h2 className="text-sm font-semibold">{box.title}</h2>
            <ul className="divide-y text-xs">
              {box.items.map((x) => {
                const late = box.label === "Due" && x.due && x.due < new Date().toISOString().slice(0, 10);
                return (
                  <li key={x.id} className="flex items-center gap-2 py-1.5">
                    <Link href={taskHref(x.id)} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="font-mono text-[11px] text-muted-foreground">{x.code}</span> {x.title}
                    </Link>
                    <span className="hidden text-muted-foreground sm:inline">{x.assignee ?? "Nobody yet"}</span>
                    <span className={cn("w-20 text-right tabular-nums", late && "font-semibold text-destructive")}>{box.date(x)}</span>
                  </li>
                );
              })}
              {!box.items.length && <li className="py-1.5 text-muted-foreground">{box.empty}</li>}
            </ul>
          </section>
        ))}
      </div>
      {!data.seeAll && <p className="text-xs text-muted-foreground">You see your own work and what your team lead or head shared with you.</p>}
    </div>
  );
}

// A compact strip for the department's Home, opening the full overview.
export function DeptOverviewStrip({ dept, data }: { dept: string; data: Data }) {
  const t = data.tiles;
  const unit = data.unit === "points" ? "pts" : "h";
  const items: [string, string, boolean?][] = [
    ["Done, 30 days", `${t.doneInPeriod} (${fmt(t.unitsInPeriod)} ${unit})`],
    ["In progress", String(t.active)],
    ["In review and QA", String(t.review)],
    ["To do", String(t.todo)],
    ["Overdue", String(t.overdue), t.overdue > 0],
    ["Open bugs", String(t.openBugs), t.openBugs > 0],
    ["Velocity", t.velocity === null ? "None yet" : `${t.velocity} ${unit}`],
  ];
  return (
    <Link href={deptViewPath(dept, "insights")} className="block rounded-xl border bg-card p-3 hover:border-primary/50" aria-label="Team overview" data-overview-strip>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Team overview</h2>
        <span className="text-xs text-primary">Open the full overview</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {items.map(([label, value, warn]) => (
          <div key={label}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className={cn("text-base font-semibold tabular-nums", warn && "text-destructive")}>{value}</p>
          </div>
        ))}
      </div>
    </Link>
  );
}
