import Link from "next/link";
import { PrinterIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { reportsData } from "@/server/reports";
import { filterOptions } from "@/server/view-data";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { describeFilters } from "@/server/exporter";
import { parseFilters, scopeQueryString } from "@/lib/filters";
import { fmtDate, fmtDuration, fmtNum, fmtPct, tzLabel } from "@/lib/format";
import { CAT, SEQ } from "@/lib/chart-colors";
import { STAGES, STAGE_LABELS } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard, PageHeader } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { BarsChart, ChartFrame, LinesChart } from "@/components/app/charts";
import { CommentThread } from "@/components/app/comment-thread";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reports" };

function delta(cur: number | null, prev: number | null, higherIsGood: boolean, pct = false) {
  if (cur === null || prev === null) return undefined;
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return { direction: "flat" as const, text: "No change vs prior period" };
  const text = pct ? `${d > 0 ? "+" : ""}${(d * 100).toFixed(0)} pts vs prior period` : `${d > 0 ? "+" : ""}${fmtNum(d)} vs prior period`;
  return { direction: d > 0 ? ("up" as const) : ("down" as const), text, good: (d > 0) === higherIsGood };
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const weeks = [4, 8, 12, 26].includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const r = await reportsData(viewer, filters, nowIso(), weeks);
  const c = r.current;
  const p = r.previous;
  const min = r.minSample;
  const window = `${fmtDate(r.period.from, tz)} to ${fmtDate(new Date(new Date(r.period.to).getTime() - 1).toISOString(), tz)}`;
  const qs = scopeQueryString(new URLSearchParams(Object.entries(sp).flatMap(([k, v]) => (typeof v === "string" ? [[k, v]] : []))));
  const filterText = await describeFilters(filters);
  const weekLink = (w: number) => {
    const q = new URLSearchParams(qs.replace(/^\?/, ""));
    q.set("weeks", String(w));
    return `/reports?${q}`;
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports"
        description={`Last ${weeks} complete weeks (${window}) compared with the ${weeks} weeks before. ${tzLabel(tz)}.`}
        actions={
          <>
            <div className="flex rounded-lg border bg-muted/40 p-0.5">
              {[4, 8, 12, 26].map((w) => (
                <Link key={w} href={weekLink(w)} className={cn("rounded-md px-2.5 py-1 text-xs font-medium", w === weeks ? "bg-background shadow-sm" : "text-muted-foreground")}>
                  {w} weeks
                </Link>
              ))}
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/reports/print${qs ? `${qs}&` : "?"}weeks=${weeks}`}>
                <PrinterIcon /> Printable summary
              </Link>
            </Button>
          </>
        }
      />
      <FilterBar options={await filterOptions(viewer, "/reports")} total={r.sampleItems} totalLabel="items in scope (historical migrations excluded)" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <MetricCard label="Lessons published" value={fmtNum(c.published)} trend={delta(c.published, p.published, true)} definition={{ definition: "Unique items whose required destinations were all confirmed live. Multiple platforms or attempts never inflate this count.", basis: "Published date in the period", sample: c.published }} />
        <MetricCard label="Published minutes" value={fmtNum(c.minutes)} trend={delta(c.minutes, p.minutes, true)} definition={{ definition: "Sum of final durations of items published in the period.", basis: "Published date" }} />
        <MetricCard label="Accepted stage completions" value={fmtNum(c.completions)} trend={delta(c.completions, p.completions, true)} definition={{ definition: "Stage attempts accepted by the next stage, plus confirmed publications. Rework attempts count separately.", basis: "Completed date" }} />
        <MetricCard label="Median lead time" value={c.leadN >= min ? fmtDuration(c.leadMedian) : "Insufficient data"} hint={`n = ${c.leadN}`} definition={{ definition: "Release to production through confirmed publication, calendar time.", basis: "Published in the period", sample: c.leadN }} />
        <MetricCard label="First-pass acceptance" value={c.submittedN >= min ? fmtPct(c.firstPass) : "Insufficient data"} trend={delta(c.firstPass, p.firstPass, true, true)} hint={`n = ${c.submittedN}`} definition={{ definition: "Share of submitted handoffs accepted without being returned.", denominator: "Handoffs submitted in the period", sample: c.submittedN }} />
        <MetricCard label="On time vs current deadline" value={c.dueN >= min ? fmtPct(c.onTimeCurrent) : "Insufficient data"} hint={`n = ${c.dueN}`} definition={{ definition: "Items due in the period that were published by their latest approved deadline. Unfinished items count as late.", basis: "Due-in-period cohort", denominator: "Items due", sample: c.dueN }} />
        <MetricCard label="On time vs original deadline" value={c.dueOrigN >= min ? fmtPct(c.onTimeOriginal) : "Insufficient data"} hint={`n = ${c.dueOrigN}`} definition={{ definition: "Same as the current-deadline rate, measured against the baseline before any extensions.", basis: "Original due date in the period", sample: c.dueOrigN }} />
        <MetricCard label="Overdue open items" value={fmtNum(r.overdueOpen)} tone={r.overdueOpen ? "danger" : "success"} href={`/content?flags=overdue`} hint={`Rework ${fmtPct(c.reworkShare)} of labor`} definition={{ definition: "Draft or in-production items past their current deadline right now. Shown next to on-time rates so unfinished work does not disappear.", basis: "As of now" }} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Is each stage getting faster?"
          description="Weekly median stage residence in hours (entry to accepted completion). Weeks with fewer than 2 completions show a gap. The table adds the 90th percentile and sample size."
          table={{
            columns: ["Week", ...STAGES.flatMap((st) => [`${STAGE_LABELS[st]} median h`, `p90 h`, "n"])],
            rows: r.turnaround.map((t) => [String(t.week), ...STAGES.flatMap((st) => [t[st] ?? "-", t[`${st}_p90`] ?? "-", t[`${st}_n`] ?? 0])]),
          }}
        >
          <LinesChart data={r.turnaround} xKey="week" series={STAGES.map((st, i) => ({ key: st, label: STAGE_LABELS[st], color: CAT[i] }))} unit="h" />
        </ChartFrame>
        <ChartFrame
          title="Why does work take this long?"
          description="Average hours per completed attempt spent queued, actively worked, paused, blocked and waiting for handoff acceptance. Stacks reconcile to stage residence."
          table={{ columns: ["Stage", "Queued h", "Active h", "Paused h", "Blocked h", "Handoff wait h", "Labor h", "Attempts"], rows: r.breakdown.map((b) => [b.stage, b.queued, b.active, b.paused, b.blocked, b.handoff, b.labor, b.n]) }}
        >
          <BarsChart
            data={r.breakdown}
            xKey="stage"
            stacked
            series={[
              { key: "queued", label: "To do", color: CAT[1] },
              { key: "active", label: "Active", color: CAT[0] },
              { key: "paused", label: "Paused", color: CAT[2] },
              { key: "blocked", label: "Blocked", color: CAT[4] },
              { key: "handoff", label: "Handoff wait", color: CAT[3] },
            ]}
            unit="h"
          />
        </ChartFrame>
        <ChartFrame
          title="Are we keeping up with demand?"
          description="Items released to production versus accepted stage completions and unique publications, by week."
          table={{ columns: ["Week", "Released", "Accepted completions", "Published"], rows: r.flow.map((f) => [f.week, f.arrivals, f.completions, f.published]) }}
        >
          <BarsChart
            data={r.flow}
            xKey="week"
            series={[
              { key: "arrivals", label: "Released to production", color: CAT[1] },
              { key: "published", label: "Published", color: CAT[0] },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="Where is work accumulating?"
          description={`Open items by age in their current stage: up to ${r.bands[0]} days, ${r.bands[0]}-${r.bands[1]}, ${r.bands[1]}-${r.bands[2]}, over ${r.bands[2]}. Live ages, separate from completed turnaround.`}
          table={{ columns: ["Stage", "Fresh", "Recent", "Aging", "Old", "Total", "Oldest", "Median age"], rows: r.backlog.map((b) => [b.stage, b.fresh, b.recent, b.aging, b.old, b.total, fmtDuration(b.oldest), fmtDuration(b.medianAge)]) }}
        >
          <BarsChart
            data={r.backlog}
            xKey="stage"
            stacked
            horizontal
            series={[
              { key: "fresh", label: `0-${r.bands[0]} days`, color: SEQ[0] },
              { key: "recent", label: `${r.bands[0]}-${r.bands[1]} days`, color: SEQ[1] },
              { key: "aging", label: `${r.bands[1]}-${r.bands[2]} days`, color: SEQ[2] },
              { key: "old", label: `Over ${r.bands[2]} days`, color: SEQ[3] },
            ]}
          />
        </ChartFrame>
        <ChartFrame
          title="What blocks the work?"
          description="Blockers opened in the period or still open: total blocked hours by cause."
          table={{ columns: ["Cause", "Blockers", "Blocked hours", "Still open"], rows: r.blockerCauses.map((b) => [b.cause, b.count, b.hours, b.open]) }}
        >
          {r.blockerCauses.length ? (
            <BarsChart data={r.blockerCauses} xKey="cause" horizontal height={Math.max(160, r.blockerCauses.length * 36)} series={[{ key: "hours", label: "Blocked hours", color: CAT[4] }]} />
          ) : (
            <p className="py-10 text-center text-sm text-muted-foreground">No blockers in this period.</p>
          )}
        </ChartFrame>
        <ChartFrame
          title="How much work is repeated?"
          description="Returns and changes requested per week, with labor spent on rework attempts. Faster work with more corrections is not an improvement."
          table={{ columns: ["Week", "Returns", "Rework labor h"], rows: r.reworkTrend.map((x) => [x.week, x.returns, x.reworkHours]) }}
        >
          <BarsChart data={r.reworkTrend} xKey="week" series={[{ key: "returns", label: "Returns and change requests", color: CAT[2] }]} />
        </ChartFrame>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Quality by stage</CardTitle>
            <CardDescription>Handoffs submitted in the period.</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left font-medium">Stage</th><th className="text-right font-medium">Submitted</th><th className="text-right font-medium">Returned</th><th className="text-right font-medium">First pass</th></tr>
              </thead>
              <tbody>
                {r.quality.map((q) => (
                  <tr key={q.stage} className="border-t"><td className="py-1.5">{q.stage}</td><td className="text-right tabular">{q.submitted}</td><td className="text-right tabular">{q.returned}</td><td className="text-right tabular">{q.submitted >= min ? fmtPct(q.firstPass) : "Insufficient data"}</td></tr>
                ))}
              </tbody>
            </table>
            {r.reworkReasons.length > 0 && (
              <div className="mt-4 space-y-1">
                <p className="text-xs font-medium">Return reasons</p>
                {r.reworkReasons.map((x) => (
                  <div key={x.reason} className="flex justify-between text-xs"><span>{x.reason}</span><span className="tabular">{x.count}</span></div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>By grade and subject</CardTitle>
            <CardDescription>Primary placement only, so rows add up to the totals. Published counts use the period; open counts are as of now.</CardDescription>
          </CardHeader>
          <CardContent className="max-h-96 overflow-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
                <tr><th className="text-left font-medium">Grade</th><th className="text-left font-medium">Subject</th><th className="text-right font-medium">Published</th><th className="text-right font-medium">In production</th><th className="text-right font-medium">Drafts</th><th className="text-right font-medium">Median lead time</th></tr>
              </thead>
              <tbody>
                {r.byGradeSubject.map((g) => (
                  <tr key={`${g.grade}-${g.subject}`} className="border-t">
                    <td className="py-1.5">{g.grade}</td><td>{g.subject}</td><td className="text-right tabular">{g.published}</td><td className="text-right tabular">{g.inProd}</td><td className="text-right tabular">{g.drafts}</td>
                    <td className="text-right tabular">{g.leadN >= Math.min(3, min) ? fmtDuration(g.leadMedian) : g.leadN ? `n = ${g.leadN}` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report discussion</CardTitle>
          <CardDescription>Comments keep the filters and date window they were written against, so their context survives later updates.</CardDescription>
        </CardHeader>
        <CardContent>
          <CommentThread
            reportKey="reports"
            viewerId={viewer.id}
            isManager={viewer.roles.includes("manager")}
            tz={tz}
            context={{ window, filters: filterText, generatedAt: nowIso(), weeks }}
            placeholder="Comment on these numbers. Your filters and date window are saved with the comment."
          />
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        {r.historicalExcluded} historical migration record{r.historicalExcluded === 1 ? "" : "s"} excluded from all timing metrics. Figures below {min} observations show as insufficient data. Staff are never ranked here; workload and capacity live under Team and capacity.
      </p>
    </div>
  );
}
