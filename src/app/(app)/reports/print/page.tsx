import { requireViewer } from "@/server/auth";
import { reportsData } from "@/server/reports";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { describeFilters } from "@/server/exporter";
import { parseFilters } from "@/lib/filters";
import { fmtDate, fmtDateTime, fmtDuration, fmtNum, fmtPct, tzLabel } from "@/lib/format";
import { PrintButton } from "./print-button";

export const metadata = { title: "Manager summary" };

export default async function PrintSummary({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const weeks = [4, 8, 12, 26].includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const now = nowIso();
  const r = await reportsData(viewer, filters, now, weeks);
  const c = r.current;
  const p = r.previous;
  const row = (label: string, cur: string, prev: string, note: string) => (
    <tr className="border-b">
      <td className="py-1.5 pr-3">{label}</td>
      <td className="py-1.5 pr-3 text-right font-medium tabular">{cur}</td>
      <td className="py-1.5 pr-3 text-right text-muted-foreground tabular">{prev}</td>
      <td className="py-1.5 text-xs text-muted-foreground">{note}</td>
    </tr>
  );
  return (
    <article className="mx-auto max-w-4xl space-y-6 rounded-xl border bg-card p-6 print:border-0 print:p-0 sm:p-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.workspace.name}</p>
          <h1 className="text-2xl font-semibold">Production summary</h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(r.period.from, tz)} to {fmtDate(new Date(new Date(r.period.to).getTime() - 1).toISOString(), tz)} ({weeks} complete weeks) compared with the previous {weeks} weeks
          </p>
        </div>
        <PrintButton />
      </header>
      <section className="grid gap-1 text-xs text-muted-foreground">
        <p>Generated {fmtDateTime(now, tz)} by {viewer.name}. {tzLabel(tz)}.</p>
        <p>Filters: {await describeFilters(filters)}</p>
        <p>Historical migrations excluded from timing: {r.historicalExcluded}. Counts use distinct items; multi-grade items count once.</p>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Headline measures</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b"><th className="py-1 text-left font-medium">Measure</th><th className="py-1 text-right font-medium">This period</th><th className="py-1 text-right font-medium">Prior period</th><th className="py-1 text-left font-medium">Definition</th></tr>
          </thead>
          <tbody>
            {row("Lessons published", fmtNum(c.published), fmtNum(p.published), "Unique items confirmed live on all required destinations")}
            {row("Published minutes", fmtNum(c.minutes), fmtNum(p.minutes), "Final durations of published items")}
            {row("Accepted stage completions", fmtNum(c.completions), fmtNum(p.completions), "Attempts accepted by the next stage")}
            {row("Median lead time", c.leadN >= r.minSample ? fmtDuration(c.leadMedian) : "Insufficient data", p.leadN >= r.minSample ? fmtDuration(p.leadMedian) : "Insufficient data", `Release to publication, n = ${c.leadN}`)}
            {row("First-pass acceptance", fmtPct(c.firstPass), fmtPct(p.firstPass), `Handoffs accepted without return, n = ${c.submittedN}`)}
            {row("On time, current deadline", fmtPct(c.onTimeCurrent), fmtPct(p.onTimeCurrent), `Due-in-period cohort, n = ${c.dueN}`)}
            {row("On time, original deadline", fmtPct(c.onTimeOriginal), fmtPct(p.onTimeOriginal), `Baseline deadline cohort, n = ${c.dueOrigN}`)}
            {row("Rework share of labor", fmtPct(c.reworkShare), fmtPct(p.reworkShare), "Labor on returned or reopened attempts")}
            {row("Overdue open items (now)", fmtNum(r.overdueOpen), "-", "Draft or in production past current deadline")}
          </tbody>
        </table>
      </section>
      <section className="grid gap-6 sm:grid-cols-2">
        <div>
          <h2 className="mb-2 text-sm font-semibold">Open backlog by stage</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="text-left font-medium">Stage</th><th className="text-right font-medium">Open</th><th className="text-right font-medium">Over {r.bands[2]} days</th><th className="text-right font-medium">Oldest</th></tr></thead>
            <tbody>{r.backlog.map((b) => <tr key={b.stage} className="border-b"><td className="py-1">{b.stage}</td><td className="text-right tabular">{b.total}</td><td className="text-right tabular">{b.old}</td><td className="text-right tabular">{fmtDuration(b.oldest)}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Average time per completed attempt (hours)</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="text-left font-medium">Stage</th><th className="text-right font-medium">Queue</th><th className="text-right font-medium">Active</th><th className="text-right font-medium">Blocked</th><th className="text-right font-medium">Wait</th><th className="text-right font-medium">n</th></tr></thead>
            <tbody>{r.breakdown.map((b) => <tr key={b.stage} className="border-b"><td className="py-1">{b.stage}</td><td className="text-right tabular">{b.queued}</td><td className="text-right tabular">{b.active}</td><td className="text-right tabular">{b.blocked}</td><td className="text-right tabular">{b.handoff}</td><td className="text-right tabular">{b.n}</td></tr>)}</tbody>
          </table>
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Top blocker causes</h2>
          <table className="w-full text-sm">
            <tbody>{r.blockerCauses.slice(0, 6).map((b) => <tr key={b.cause} className="border-b"><td className="py-1">{b.cause}</td><td className="text-right tabular">{b.count} blockers</td><td className="text-right tabular">{b.hours} h</td></tr>)}</tbody>
          </table>
          {!r.blockerCauses.length && <p className="text-sm text-muted-foreground">None in this period.</p>}
        </div>
        <div>
          <h2 className="mb-2 text-sm font-semibold">Return reasons</h2>
          <table className="w-full text-sm">
            <tbody>{r.reworkReasons.map((x) => <tr key={x.reason} className="border-b"><td className="py-1">{x.reason}</td><td className="text-right tabular">{x.count}</td></tr>)}</tbody>
          </table>
          {!r.reworkReasons.length && <p className="text-sm text-muted-foreground">None in this period.</p>}
        </div>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">By grade and subject (primary placement)</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground"><tr className="border-b"><th className="text-left font-medium">Grade</th><th className="text-left font-medium">Subject</th><th className="text-right font-medium">Published</th><th className="text-right font-medium">In production</th><th className="text-right font-medium">Drafts</th></tr></thead>
          <tbody>{r.byGradeSubject.map((g) => <tr key={`${g.grade}${g.subject}`} className="border-b"><td className="py-1">{g.grade}</td><td>{g.subject}</td><td className="text-right tabular">{g.published}</td><td className="text-right tabular">{g.inProd}</td><td className="text-right tabular">{g.drafts}</td></tr>)}</tbody>
        </table>
      </section>
      <footer className="border-t pt-3 text-[11px] text-muted-foreground">
        Measured from system events. Planned dates never create actual events. Capacity figures are scenarios, not staffing decisions.
      </footer>
    </article>
  );
}
