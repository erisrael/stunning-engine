"use client";
import * as React from "react";
import { RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusStrip, Toolbar } from "@/components/app/page-kit";
import { MetricCard } from "@/components/app/primitives";
import { cmsPresetRange } from "@/lib/cms-filters";
import type { LegacyCmsCategory } from "@/lib/legacy-cms";
import { RangePicker, useShowEc, type Period } from "./range-controls";
import { useCmsRange } from "./use-cms-range";
import { Breakdown, dayOfRow, daysOf, fmtNum, PeriodBars, tally } from "./cms-charts";

// Growth from Noor, live and date first (Update 1.0): new students and parents by the day their account was
// made, subscriptions by the day they started, with grade, city, gender and plan breakdowns.
export function CmsGrowthView({ categories }: { categories: LegacyCmsCategory[] }) {
  const [period, setPeriod] = React.useState<Period | null>("30days");
  const [start, setStart] = React.useState("");
  const [end, setEnd] = React.useState("");
  const [showEc, setShowEc] = useShowEc();
  const students = useCmsRange();
  const parents = useCmsRange();
  const subs = useCmsRange();
  const range = period ? cmsPresetRange(period, start, end) : null;
  const has = (c: LegacyCmsCategory) => categories.includes(c);
  const load = React.useCallback(
    async (refresh = false) => {
      if (!range) return;
      // One after another: Noor serves one account session, and each load is fastest on its own.
      if (has("students")) await students.load({ category: "students", ...range, refresh });
      if (has("parents")) await parents.load({ category: "parents", ...range, refresh });
      if (has("subscriptions")) await subs.load({ category: "subscriptions", ...range, refresh, dateField: "start_date" });
    },
    [range?.from, range?.until], // eslint-disable-line react-hooks/exhaustive-deps
  );
  React.useEffect(() => {
    const t = setTimeout(() => void load(), 200);
    return () => clearTimeout(t);
  }, [load]);
  const s = students.result?.category === "students" ? students.result.records : [];
  const p = parents.result?.category === "parents" ? parents.result.records : [];
  const sb = subs.result?.category === "subscriptions" ? subs.result.records : [];
  const days = range ? daysOf(range.from, range.until) : [];
  const perDay = (xs: Record<string, string>[]) => {
    const m = new Map<string, number>();
    for (const x of xs) m.set(dayOfRow(x), (m.get(dayOfRow(x)) ?? 0) + 1);
    return days.map((d) => m.get(d) ?? 0);
  };
  const subscribed = s.filter((x) => /active|trial|paid/i.test(x.Subscription ?? x["Subscription status"] ?? "")).length;
  const loading = students.loading || parents.loading || subs.loading;
  const progress = students.progress || parents.progress || subs.progress;
  const errors = [students.error, parents.error, subs.error].filter(Boolean);

  return (
    <div className="space-y-3">
      <Toolbar label="Growth range" end={<Button size="sm" variant="outline" className="h-8 text-xs" disabled={loading || !range} onClick={() => void load(true)}><RefreshCwIcon className={loading ? "animate-spin" : ""} /> Refresh</Button>}>
        <RangePicker period={period} start={start} end={end} showEc={showEc} onShowEc={setShowEc} onChange={(v) => (setPeriod(v.period), setStart(v.start), setEnd(v.end))} />
      </Toolbar>
      {loading && <StatusStrip><RefreshCwIcon className="size-3.5 animate-spin" /> {progress || "Loading from Noor…"}</StatusStrip>}
      {errors.map((e) => <StatusStrip key={e} tone="danger">{e}</StatusStrip>)}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="New students" value={fmtNum(s.length)} hint="accounts made in range" tone="success" />
        <MetricCard label="New parents" value={fmtNum(p.length)} />
        <MetricCard label="Subscriptions started" value={fmtNum(sb.length)} />
        <MetricCard label="New students subscribed" value={`${s.length ? Math.round((subscribed / s.length) * 100) : 0}%`} hint={`${subscribed} of ${s.length}`} />
      </div>
      <div className="rounded-xl border bg-card p-3">
        <p className="mb-2 text-xs font-medium text-muted-foreground">Per day</p>
        <PeriodBars label="New students, parents and subscriptions per day" points={days} series={[{ name: "New students", values: perDay(s), className: "bg-primary" }, { name: "New parents", values: perDay(p), className: "bg-sky-400" }, { name: "Subscriptions started", values: perDay(sb), className: "bg-emerald-500" }]} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Breakdown title="New students by grade" rows={tally(s, (x) => x.Grade ?? "")} />
        <Breakdown title="New students by city" rows={tally(s, (x) => x.City ?? "")} />
        <Breakdown title="New students by gender" rows={tally(s, (x) => x.Gender ?? "")} />
        <Breakdown title="Subscriptions by plan" rows={tally(sb, (x) => x.Plan ?? "")} />
        <Breakdown title="Subscriptions by status" rows={tally(sb, (x) => x.Status ?? "")} />
        <Breakdown title="Subscriptions by grade" rows={tally(sb, (x) => x.Grade ?? "")} />
      </div>
    </div>
  );
}
