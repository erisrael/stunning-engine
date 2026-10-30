"use client";

// Department dashboards (Dev, Marketing, Studio): a grid of widgets the viewer can rearrange. People save their own
// arrangement; heads (people who configure the department) also save the default for each position.

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, Loader2Icon, PlusIcon, RotateCcwIcon, Settings2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState, MetricCard, Meter } from "@/components/app/primitives";
import { BarsChart, ChartFrame, LinesChart } from "@/components/app/charts";
import { resetDashboardLayoutAction, saveDashboardLayoutAction } from "@/app/actions/departments";
import type { DashDept, StudioDashboardData, WorkDashboardData } from "@/server/dashboards";
import { PERIODS, WIDGET_SIZE_LABELS, WIDGETS, type DashKind, type LayoutItem, type Period, type WidgetSize } from "@/lib/dashboards";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from "@/lib/studio";
import { POSITION_LABELS, POSITIONS, type Position } from "@/lib/domain";
import { CAT } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";
import { deptPath } from "@/lib/work";

const fmt = (v: number) => v.toLocaleString("en-US");
const SPAN: Record<WidgetSize, string> = { s: "col-span-1", m: "sm:col-span-2", l: "sm:col-span-2 lg:col-span-4" };

export type LayoutInfo = { layout: LayoutItem[]; personal: boolean; position: Position; canSetDefaults: boolean };
type Option = { value: string; label: string };

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function DashFilters({ period, filters }: { period: Period; filters: { key: string; placeholder: string; value: string | null; options: Option[] }[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const go = (k: string, v: string | null) => {
    const p = new URLSearchParams(params.toString());
    v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={(v) => go("period", v === "30d" ? null : v)}>
        <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Period">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIODS.map((p) => (
            <SelectItem key={p.key} value={p.key}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {filters.map((f) => (
        <Select key={f.key} value={f.value ?? "all"} onValueChange={(v) => go(f.key, v === "all" ? null : v)}>
          <SelectTrigger size="sm" className="h-8 w-40 text-xs" aria-label={f.placeholder}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{f.placeholder}</SelectItem>
            {f.options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grid with customising
// ---------------------------------------------------------------------------

function DashboardGrid({ dept, kind, info, render }: { dept: DashDept; kind: DashKind; info: LayoutInfo; render: (key: string) => React.ReactNode }) {
  const router = useRouter();
  const catalog = WIDGETS[kind];
  const [editing, setEditing] = React.useState(false);
  const [items, setItems] = React.useState(info.layout);
  const [target, setTarget] = React.useState<"mine" | Position>("mine");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => setItems(info.layout), [info.layout]);
  const hidden = catalog.filter((w) => !items.some((i) => i.key === w.key));
  const move = (i: number, d: number) => {
    const next = [...items];
    const [x] = next.splice(i, 1);
    next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x!);
    setItems(next);
  };
  const save = async () => {
    setBusy(true);
    const r = await saveDashboardLayoutAction(dept, target, items);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(target === "mine" ? "Your dashboard is saved" : `Saved as the default for ${POSITION_LABELS[target].toLowerCase()}s`);
    setEditing(false);
    router.refresh();
  };
  const reset = async () => {
    const r = await resetDashboardLayoutAction(dept, target);
    if (!r.ok) return toast.error(r.error);
    toast.success(target === "mine" ? "Back to the default dashboard" : `Default for ${POSITION_LABELS[target].toLowerCase()}s reset`);
    setEditing(false);
    router.refresh();
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!editing ? (
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setEditing(true)}>
            <Settings2Icon /> Customize
          </Button>
        ) : (
          <div className="ml-auto flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2 py-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={!hidden.length}>
                  <PlusIcon /> Add widget
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                {(["Numbers", "Charts", "Lists", "Other"] as const).map((g) => {
                  const list = hidden.filter((w) => w.group === g);
                  if (!list.length) return null;
                  return (
                    <React.Fragment key={g}>
                      <DropdownMenuLabel>{g}</DropdownMenuLabel>
                      {list.map((w) => (
                        <DropdownMenuItem key={w.key} onClick={() => setItems([...items, { key: w.key, size: w.size }])}>
                          {w.label}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </React.Fragment>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <Select value={target} onValueChange={(v) => setTarget(v as "mine" | Position)}>
              <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="Save for">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mine">Save for me</SelectItem>
                {info.canSetDefaults &&
                  POSITIONS.map((p) => (
                    <SelectItem key={p} value={p}>
                      Default for {POSITION_LABELS[p].toLowerCase()}s
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button size="sm" variant="ghost" onClick={reset} title={target === "mine" ? "Use the default for your position" : "Back to the built-in default"} disabled={target === "mine" && !info.personal}>
              <RotateCcwIcon /> Reset
            </Button>
            <Button size="sm" variant="ghost" onClick={() => (setItems(info.layout), setEditing(false))}>
              <XIcon /> Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2Icon className="animate-spin" /> : <CheckIcon />} Save
            </Button>
          </div>
        )}
      </div>
      {!items.length ? (
        <EmptyState title="No widgets" description="Use Customize, then Add widget." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((it, i) => {
            const w = catalog.find((x) => x.key === it.key)!;
            return (
              <div key={it.key} className={cn("relative min-w-0", SPAN[it.size], editing && "rounded-xl ring-2 ring-primary/30 ring-offset-2 ring-offset-background")}>
                {editing && (
                  <div className="absolute -top-3 right-2 z-10 flex items-center gap-1 rounded-lg border bg-popover px-1 py-0.5 shadow-sm">
                    <span className="max-w-32 truncate px-1 text-[11px] font-medium">{w.label}</span>
                    <Button size="icon-xs" variant="ghost" aria-label={`Move ${w.label} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowLeftIcon />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={`Move ${w.label} later`} disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                      <ArrowRightIcon />
                    </Button>
                    <Select value={it.size} onValueChange={(v) => setItems(items.map((x, j) => (j === i ? { ...x, size: v as WidgetSize } : x)))}>
                      <SelectTrigger size="sm" className="h-6 w-24 text-[11px]" aria-label={`Size of ${w.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(WIDGET_SIZE_LABELS) as WidgetSize[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {WIDGET_SIZE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="icon-xs" variant="ghost" className="text-destructive" aria-label={`Remove ${w.label}`} onClick={() => setItems(items.filter((_, j) => j !== i))}>
                      <XIcon />
                    </Button>
                  </div>
                )}
                {render(it.key)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Panel({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex h-full flex-col gap-2 rounded-xl border bg-card p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// Horizontal bars with each item's own colour (statuses, types, priorities).
function BarList({ rows, unit, empty = "Nothing to show." }: { rows: { label: string; value: number; color?: string; note?: string }[]; unit?: string; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-xs">
          <span className="w-28 shrink-0 truncate" title={r.label}>
            {r.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? "var(--chart-1)" }} />
          </span>
          <span className="w-20 shrink-0 text-right tabular text-muted-foreground">
            {fmt(r.value)}
            {unit}
            {r.note && ` · ${r.note}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ItemList({ rows, empty }: { rows: { id: string; href: string; code?: string; title: string; meta?: string; late?: boolean }[]; empty: string }) {
  if (!rows.length) return <p className="py-4 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {rows.map((r) => (
        <li key={r.id} className="flex items-center gap-2 py-1.5 text-sm">
          {r.code && <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{r.code}</span>}
          <Link href={r.href} className="min-w-0 flex-1 truncate hover:underline">
            {r.title}
          </Link>
          {r.meta && <span className={cn("shrink-0 text-xs", r.late ? "font-medium text-destructive" : "text-muted-foreground")}>{r.meta}</span>}
        </li>
      ))}
    </ul>
  );
}

function Activity({ rows }: { rows: { summary: string; occurred_at: string }[] }) {
  if (!rows.length) return <p className="py-4 text-center text-xs text-muted-foreground">No activity to show.</p>;
  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map((r, i) => (
        <li key={i} className="flex gap-2">
          <span className="w-20 shrink-0 text-muted-foreground">{r.occurred_at.slice(5, 16).replace("T", " ")}</span>
          <span className="min-w-0">{r.summary}</span>
        </li>
      ))}
    </ul>
  );
}

const shortWeek = (w: string) => w.slice(5);

// ---------------------------------------------------------------------------
// Dev and Marketing
// ---------------------------------------------------------------------------

export function WorkDashboard({ dept, data, info }: { dept: string; data: WorkDashboardData; info: LayoutInfo }) {
  const base = deptPath(dept);
  const today = new Date().toISOString().slice(0, 10);
  const label = (k: string) => data.statuses.find((s) => s.key === k)?.label ?? k;
  const t = data.names.tasks.toLowerCase();
  const taskHref = (id: string) => `${base}?task=${id}`;
  const listHref = (q: string) => `${base}?tab=list${q}`;
  const taskRows = (list: WorkDashboardData["lists"]["mine"], meta: (x: WorkDashboardData["lists"]["mine"][number]) => string | undefined) =>
    list.map((x) => ({ id: x.id, href: taskHref(x.id), code: x.code, title: x.title, meta: meta(x), late: !!x.due_date && x.due_date < today }));
  const c = data.cards;
  const render = (key: string): React.ReactNode => {
    switch (key) {
      case "c_open":
        return <MetricCard label="Not finished" value={fmt(c.open)} href={listHref("&status=open")} />;
      case "c_active":
        return <MetricCard label="In progress" value={fmt(c.active)} />;
      case "c_review":
        return <MetricCard label="In review" value={fmt(c.review)} tone={c.review > 5 ? "warning" : "default"} />;
      case "c_overdue":
        return <MetricCard label="Overdue" value={fmt(c.overdue)} tone={c.overdue ? "danger" : "success"} href={listHref("&due=overdue")} />;
      case "c_due_week":
        return <MetricCard label="Due in the next 7 days" value={fmt(c.dueWeek)} href={listHref("&due=week")} />;
      case "c_done":
        return <MetricCard label="Done" value={fmt(c.done)} hint={data.period.label} tone="success" />;
      case "c_unassigned":
        return <MetricCard label="Unassigned" value={fmt(c.unassigned)} tone={c.unassigned ? "warning" : "default"} href={listHref("&assignee=none&status=open")} />;
      case "c_mine":
        return <MetricCard label={`My open ${t}`} value={fmt(c.mine)} href={listHref("&assignee=me&status=open")} />;
      case "ch_throughput":
        return (
          <ChartFrame title={`${data.names.tasks} done and created`} description="Per week, last 12 weeks" table={{ columns: ["Week", "Done", "Created"], rows: data.throughput.map((w) => [w.week, w.done, w.created]) }}>
            <BarsChart data={data.throughput.map((w) => ({ week: shortWeek(w.week), done: w.done, created: w.created }))} xKey="week" series={[{ key: "done", label: "Done", color: CAT[0] }, { key: "created", label: "Created", color: CAT[2] }]} />
          </ChartFrame>
        );
      case "ch_cycle":
        return (
          <ChartFrame title="Days to finish" description="Average days from creation to done, per week" table={{ columns: ["Week", "Days"], rows: data.cycle.map((w) => [w.week, w.days ?? "-"]) }}>
            <LinesChart data={data.cycle.map((w) => ({ week: shortWeek(w.week), days: w.days }))} xKey="week" series={[{ key: "days", label: "Days", color: CAT[1] }]} />
          </ChartFrame>
        );
      case "ch_status":
        return (
          <Panel title="Work by status" description={`Open now; done ones counted for ${data.period.label.toLowerCase()}`}>
            <BarList rows={data.byStatus.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
          </Panel>
        );
      case "ch_type":
        return (
          <Panel title="Open work by type">
            <BarList rows={data.byType.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
          </Panel>
        );
      case "ch_priority":
        return (
          <Panel title="Open work by priority">
            <BarList rows={data.byPriority.map((s) => ({ label: s.label, value: s.count, color: s.color }))} />
          </Panel>
        );
      case "ch_people":
        return (
          <Panel title="Workload per person" description="Open items · estimated hours">
            {data.canSeeAll ? (
              <BarList rows={data.people.map((p) => ({ label: p.name, value: p.open, note: `${fmt(p.hours)}h${p.overdue ? `, ${p.overdue} late` : ""}` }))} empty="Nobody has open work." />
            ) : (
              <p className="text-xs text-muted-foreground">Shown to people who see everyone&apos;s work.</p>
            )}
          </Panel>
        );
      case "ch_kpi":
        return (
          <Panel title="KPIs against target" description={data.period.label}>
            {data.kpis.length ? (
              <ul className="space-y-2 text-xs">
                {data.kpis.map((k) => (
                  <li key={k.key} className="space-y-1">
                    <div className="flex justify-between">
                      <span>{k.label}</span>
                      <span className="tabular text-muted-foreground">
                        {fmt(k.actual)}
                        {k.target ? ` / ${fmt(k.target)}` : ""} {k.unit}
                      </span>
                    </div>
                    <Meter value={k.actual} max={Math.max(1, k.target || k.actual)} tone={k.target && !k.higherIsBetter && k.actual > k.target ? "danger" : "primary"} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No KPIs. Switch them on in Configure.</p>
            )}
          </Panel>
        );
      case "ch_budget":
        return data.budget.length ? (
          <ChartFrame title="Budget and spend" description={`Live ${data.names.projects.toLowerCase()}`} table={{ columns: ["Project", "Budget", "Spend"], rows: data.budget.map((b) => [`${b.key} ${b.name}`, b.budget, b.spend]) }}>
            <BarsChart data={data.budget.map((b) => ({ project: b.key, budget: b.budget, spend: b.spend }))} xKey="project" series={[{ key: "budget", label: "Budget", color: CAT[3] }, { key: "spend", label: "Spend", color: CAT[0] }]} />
          </ChartFrame>
        ) : (
          <Panel title="Budget and spend">
            <p className="text-xs text-muted-foreground">No {data.names.projects.toLowerCase()} with a budget yet. Spend comes from a KPI called Spend or Cost.</p>
          </Panel>
        );
      case "money":
        return (
          <Panel title="Money fields" description={`Done in ${data.period.label.toLowerCase()} · still open`}>
            {data.money.length ? (
              <ul className="space-y-1 text-sm">
                {data.money.map((m) => (
                  <li key={m.key} className="flex justify-between gap-2">
                    <span>{m.label}</span>
                    <span className="tabular">
                      {fmt(m.done)} <span className="text-muted-foreground">· {fmt(m.open)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Add a field of the Money kind in Configure (for example Cost or Price) to total it here.</p>
            )}
          </Panel>
        );
      case "l_mine":
        return (
          <Panel title={`My ${t}`}>
            <ItemList rows={taskRows(data.lists.mine, (x) => x.due_date?.slice(5) ?? label(x.status))} empty={`No open ${t} assigned to you.`} />
          </Panel>
        );
      case "l_overdue":
        return (
          <Panel title="Overdue">
            <ItemList rows={taskRows(data.lists.overdue, (x) => `${x.due_date?.slice(5)}${x.assignee_name ? ` · ${x.assignee_name}` : ""}`)} empty="Nothing overdue." />
          </Panel>
        );
      case "l_review":
        return (
          <Panel title="Waiting for review" description="Longest waiting first">
            <ItemList rows={taskRows(data.lists.review, (x) => x.assignee_name ?? undefined)} empty="Nothing waiting." />
          </Panel>
        );
      case "l_recent":
        return (
          <Panel title="Recently changed">
            <ItemList rows={taskRows(data.lists.recent, (x) => label(x.status))} empty={`No ${t} yet.`} />
          </Panel>
        );
      case "l_milestones":
        return (
          <Panel title={`Upcoming ${data.names.milestone.toLowerCase()}s`} description="Next 45 days, and late ones">
            <ItemList rows={data.milestones.map((m) => ({ id: m.id, href: `${base}?tab=projects`, code: m.project_key, title: m.name, meta: m.due_date.slice(5), late: m.due_date < today }))} empty="None coming up." />
          </Panel>
        );
      case "l_risk":
        return (
          <Panel title={`${data.names.projects} at risk`} description="Late work, or past their due date">
            <ItemList
              rows={data.risk.map((r) => ({ id: r.id, href: `${base}?tab=list&project=${r.id}&due=overdue`, code: r.key, title: r.name, meta: `${r.progress}%${r.late ? ` · ${r.late} late` : ""}${r.pastDue ? " · past due" : ""}`, late: true }))}
              empty="Nothing at risk."
            />
          </Panel>
        );
      case "calendar":
        return (
          <Panel title="Next two weeks" description="By due date">
            <div className="grid grid-cols-7 gap-1 text-[11px] lg:grid-cols-14">
              {data.calendar.map((d) => (
                <div key={d.day} className={cn("min-h-16 rounded-md border p-1", d.day === today && "border-primary bg-primary/5")}>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{new Date(`${d.day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>
                    <span>{Number(d.day.slice(8))}</span>
                  </div>
                  {d.tasks.map((x) => (
                    <Link key={x.id} href={taskHref(x.id)} className="block truncate rounded bg-primary/10 px-1 hover:bg-primary/20" title={x.title}>
                      {x.title}
                    </Link>
                  ))}
                  {d.count > d.tasks.length && <span className="text-muted-foreground">+{d.count - d.tasks.length}</span>}
                </div>
              ))}
            </div>
          </Panel>
        );
      case "activity":
        return (
          <Panel title="Activity">
            <Activity rows={data.activity} />
          </Panel>
        );
      default:
        return null;
    }
  };
  return <DashboardGrid dept={dept} kind="work" info={info} render={render} />;
}

// ---------------------------------------------------------------------------
// Studio
// ---------------------------------------------------------------------------

export function StudioDashboard({ data, info }: { data: StudioDashboardData; info: LayoutInfo }) {
  const c = data.cards;
  const href = (x: { id: string; type: string }) => `/studio?tab=${x.type}&open=${x.id}`;
  const rows = (list: StudioDashboardData["lists"]["mine"], meta: (x: StudioDashboardData["lists"]["mine"][number]) => string | undefined) =>
    list.map((x) => ({ id: x.id, href: href(x), code: RESOURCE_TYPE_LABELS[x.type].one, title: x.title, meta: meta(x) }));
  const status = (s: string) => data.statusLabels[s as keyof typeof data.statusLabels] ?? s;
  const typeSeries = RESOURCE_TYPES.map((t, i) => ({ key: t, label: RESOURCE_TYPE_LABELS[t].many, color: CAT[i] }));
  const render = (key: string): React.ReactNode => {
    switch (key) {
      case "c_drafts":
        return <MetricCard label="Drafts" value={fmt(c.drafts)} />;
      case "c_review":
        return <MetricCard label="In review" value={fmt(c.review)} tone={c.review > 5 ? "warning" : "default"} />;
      case "c_approved":
        return <MetricCard label="Approved, not published" value={fmt(c.approved)} />;
      case "c_published":
        return <MetricCard label="Published" value={fmt(c.published)} hint={data.period.label} tone="success" />;
      case "c_questions":
        return <MetricCard label="Approved questions" value={fmt(c.questions)} href="/studio?tab=questions" />;
      case "c_mine":
        return <MetricCard label="My unpublished work" value={fmt(c.mine)} />;
      case "ch_published":
        return (
          <ChartFrame title="Published per week" description="Last 12 weeks" table={{ columns: ["Week", ...typeSeries.map((s) => s.label)], rows: data.published.map((w) => [w.week, ...RESOURCE_TYPES.map((t) => Number(w[t as keyof typeof w] ?? 0))]) }}>
            <BarsChart data={data.published.map((w) => ({ ...w, week: shortWeek(w.week) }))} xKey="week" series={typeSeries} stacked />
          </ChartFrame>
        );
      case "ch_status": {
        const sts = ["draft", "review", "approved", "published"];
        return (
          <ChartFrame title="Work by type and status" table={{ columns: ["Type", ...sts.map(status)], rows: data.byStatus.map((r) => [r.type, ...sts.map((s) => Number(r[s as keyof typeof r] ?? 0))]) }}>
            <BarsChart data={data.byStatus} xKey="type" series={sts.map((s, i) => ({ key: s, label: status(s), color: CAT[i] }))} stacked />
          </ChartFrame>
        );
      }
      case "ch_coverage":
        return data.coverage.length ? (
          <ChartFrame title="Published by grade" table={{ columns: ["Grade", ...typeSeries.map((s) => s.label)], rows: data.coverage.map((g) => [g.grade, ...RESOURCE_TYPES.map((t) => Number(g[t as keyof typeof g] ?? 0))]) }}>
            <BarsChart data={data.coverage} xKey="grade" series={typeSeries} stacked />
          </ChartFrame>
        ) : (
          <Panel title="Published by grade">
            <p className="text-xs text-muted-foreground">Nothing published yet.</p>
          </Panel>
        );
      case "ch_difficulty":
        return (
          <ChartFrame title="Question bank by difficulty" table={{ columns: ["Difficulty", "Approved", "Not yet approved"], rows: data.difficulty.map((d) => [d.difficulty, d.approved, d.other]) }}>
            <BarsChart data={data.difficulty} xKey="difficulty" series={[{ key: "approved", label: "Approved", color: CAT[0] }, { key: "other", label: "Not yet approved", color: CAT[2] }]} stacked />
          </ChartFrame>
        );
      case "l_review":
        return (
          <Panel title="Waiting for review" description="Longest waiting first">
            <ItemList rows={rows(data.lists.review, (x) => x.author_name ?? undefined)} empty="Nothing waiting." />
          </Panel>
        );
      case "l_mine":
        return (
          <Panel title="My work">
            <ItemList rows={rows(data.lists.mine, (x) => status(x.status))} empty="Nothing unpublished." />
          </Panel>
        );
      case "l_recent":
        return (
          <Panel title="Recently changed">
            <ItemList rows={rows(data.lists.recent, (x) => status(x.status))} empty="Nothing yet." />
          </Panel>
        );
      case "activity":
        return (
          <Panel title="Activity">
            <Activity rows={data.activity} />
          </Panel>
        );
      default:
        return null;
    }
  };
  return <DashboardGrid dept="studio" kind="studio" info={info} render={render} />;
}
