"use client";
import * as React from "react";
import { toast } from "sonner";
import { HammerIcon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StatusStrip, Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { waitForCmsTask } from "@/lib/cms-task-client";
import { cmsMetricsAction } from "@/app/actions/cms-reports";
import { Breakdown, CumulativeLine, fmtMoney, fmtNum, PeriodBars } from "./cms-charts";

type Row = Awaited<ReturnType<typeof import("@/server/cms-metrics").cmsMetrics>>[number];
type Grain = "day" | "week" | "month" | "year";
type Span = "30" | "90" | "365" | "year" | "all" | "custom";
const METRICS = [
  ["paidAmount", "Paid revenue", fmtMoney],
  ["paid", "Paid invoices", fmtNum],
  ["invoices", "All invoices", fmtNum],
  ["pending", "Waiting for approval", fmtNum],
  ["newStudents", "New students", fmtNum],
  ["newParents", "New parents", fmtNum],
  ["subscriptionsStarted", "Subscriptions started", fmtNum],
  ["feedback", "Feedback", fmtNum],
] as const;
type MetricKey = (typeof METRICS)[number][0];
const addis = (t: number) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);

// Which period a day belongs to: the day, its week (from Monday), its month or its year.
function bucket(day: string, g: Grain) {
  if (g === "day") return day;
  if (g === "month") return day.slice(0, 7);
  if (g === "year") return day.slice(0, 4);
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return `${d.toISOString().slice(0, 10)}`;
}

// Reports › Dashboard (Update 1.0): the stored daily Noor figures as trends by day, week, month and year for any
// range, against the period before, plus the running total (overall progress).
export function CmsDashboardView({ canBuild }: { canBuild: boolean }) {
  const [span, setSpan] = React.useState<Span>("90");
  const [grain, setGrain] = React.useState<Grain>("week");
  const [metric, setMetric] = React.useState<MetricKey>("paidAmount");
  const [from, setFrom] = React.useState("");
  const [until, setUntil] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [building, setBuilding] = React.useState("");
  const today = addis(Date.now());
  const range = React.useMemo(() => {
    if (span === "all") return { from: "", until: today };
    if (span === "year") return { from: `${today.slice(0, 4)}-01-01`, until: today };
    if (span === "custom") return { from: from || addis(Date.now() - 29 * 86400e3), until: until || today };
    return { from: addis(Date.now() - (Number(span) - 1) * 86400e3), until: today };
  }, [span, from, until, today]);
  const load = React.useCallback(async () => {
    const r = await cmsMetricsAction();
    setRows(r.ok ? r.data ?? [] : []);
    if (!r.ok) toast.error(r.error);
  }, []);
  React.useEffect(() => void load(), [load]);

  const all = rows ?? [];
  const inRange = all.filter((r) => (!range.from || r.day >= range.from) && r.day <= range.until);
  const len = range.from ? Math.round((Date.parse(range.until) - Date.parse(range.from)) / 86400e3) + 1 : 0;
  const before = range.from ? all.filter((r) => r.day < range.from && r.day >= addis(Date.parse(`${range.from}T12:00:00Z`) - len * 86400e3)) : [];
  const total = (xs: Row[], k: MetricKey) => xs.reduce((a, r) => a + Number(r[k] ?? 0), 0);
  const buckets = [...new Set(inRange.map((r) => bucket(r.day, grain)))].sort();
  const per = (k: MetricKey) => buckets.map((b) => total(inRange.filter((r) => bucket(r.day, grain) === b), k));
  const [, mLabel, mFmt] = METRICS.find(([k]) => k === metric)!;
  const change = (k: MetricKey) => {
    const a = total(inRange, k);
    const b = total(before, k);
    if (!range.from || !b) return null;
    return Math.round(((a - b) / b) * 100);
  };
  const merge = (pick: (r: Row) => Record<string, number>) => {
    const m = new Map<string, number>();
    for (const r of inRange) for (const [k, v] of Object.entries(pick(r) ?? {})) m.set(k, (m.get(k) ?? 0) + v);
    return [...m.entries()] as [string, number][];
  };
  const build = async () => {
    const f = range.from || addis(Date.now() - 364 * 86400e3);
    setBuilding("Starting…");
    try {
      const r = await waitForCmsTask<{ days: number; errors: string[] }>({ kind: "metrics", from: f, until: range.until }, setBuilding);
      if (r.errors.length) toast.warning(`Built ${r.days} days; some tables failed: ${r.errors.join("; ")}`);
      else toast.success(`Built the figures for ${r.days} days`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBuilding("");
    }
  };

  return (
    <div className="space-y-3">
      <Toolbar
        label="Dashboard range"
        end={
          <>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => void load()}><RefreshCwIcon /> Reload</Button>
            {canBuild && <Button size="sm" variant="outline" className="h-8 text-xs" disabled={!!building} onClick={build} title="Count these days from Noor and store them"><HammerIcon /> {building || "Build these days"}</Button>}
          </>
        }
      >
        <ViewSwitcher label="Dashboard range" value={span} onChange={setSpan} options={[["30", "30 days"], ["90", "90 days"], ["365", "12 months"], ["year", "This year"], ["all", "All time"], ["custom", "Custom"]]} />
        {span === "custom" && (
          <span className="flex items-center gap-1">
            <Input type="date" aria-label="From" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" aria-label="Until" value={until} onChange={(e) => setUntil(e.target.value)} className="h-8 w-[9.5rem] text-xs" />
          </span>
        )}
        <ViewSwitcher label="Group by" value={grain} onChange={setGrain} options={[["day", "Daily"], ["week", "Weekly"], ["month", "Monthly"], ["year", "Yearly"]]} />
      </Toolbar>
      {!rows ? (
        <StatusStrip>Loading the stored figures…</StatusStrip>
      ) : !all.length ? (
        <EmptyState title="No daily figures stored yet" description="They are made every night for the day before. Build earlier days now to see the trends." action={canBuild ? <Button onClick={build} disabled={!!building}><HammerIcon /> {building || "Build the last 90 days"}</Button> : undefined} />
      ) : (
        <>
          <StatusStrip>
            {inRange.length} stored days in this range{inRange.length < len && range.from ? ` (${len - inRange.length} not built yet${canBuild ? ": Build these days" : ""})` : ""} · stored nightly; the latest figures are from {all.at(-1)?.day}
          </StatusStrip>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {METRICS.slice(0, 8).map(([k, l, f]) => {
              const c = change(k);
              return <MetricCard key={k} label={l} value={f(total(inRange, k))} trend={c === null ? undefined : { direction: c > 0 ? "up" : c < 0 ? "down" : "flat", text: `${c > 0 ? "+" : ""}${c}% vs the period before`, good: k === "pending" ? c < 0 : c > 0 }} />;
            })}
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">{mLabel}, {grain === "day" ? "per day" : grain === "week" ? "per week" : grain === "month" ? "per month" : "per year"}</p>
              <select aria-label="Measure" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className="h-7 rounded-md border bg-background px-2 text-xs">
                {METRICS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
            <PeriodBars label={`${mLabel} by period`} points={buckets} series={[{ name: mLabel, values: per(metric), className: "bg-primary", format: mFmt }]} />
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Overall progress: {mLabel.toLowerCase()} added up</p>
              <CumulativeLine label={`${mLabel} running total`} points={buckets} values={per(metric)} format={mFmt} />
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">New students against subscriptions started</p>
              <PeriodBars label="New students and subscriptions" points={buckets} series={[{ name: "New students", values: per("newStudents"), className: "bg-primary" }, { name: "Subscriptions started", values: per("subscriptionsStarted"), className: "bg-emerald-500" }]} height={110} />
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <Breakdown title="Paid revenue by method" rows={merge((r) => r.methods)} format={fmtMoney} />
            <Breakdown title="Subscriptions by plan" rows={merge((r) => r.plans)} />
            <Breakdown title="New students by grade" rows={merge((r) => r.grades)} />
          </div>
          <div className="overflow-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                <tr><th className="px-2 py-2">{grain === "week" ? "Week of" : grain === "day" ? "Day" : grain === "month" ? "Month" : "Year"}</th>{METRICS.map(([k, l]) => <th key={k} className="px-2 py-2 text-right">{l}</th>)}</tr>
              </thead>
              <tbody>
                {[...buckets].reverse().map((b) => {
                  const xs = inRange.filter((r) => bucket(r.day, grain) === b);
                  return <tr key={b} className="border-t"><td className="px-2 py-1.5 font-medium">{b}</td>{METRICS.map(([k, , f]) => <td key={k} className="px-2 py-1.5 text-right tabular-nums">{f(total(xs, k))}</td>)}</tr>;
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
