import { all, placeholders } from "./db";
import { getSettings } from "./settings";
import { listItems } from "./queries";
import { attemptTimings, lastCompleteWeeks, median, percentile, weekStart, mean } from "./metrics";
import type { AppUser } from "./users";
import { BLOCKER_CAUSE_LABELS, RETURN_REASON_LABELS, STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import type { Filters } from "@/lib/filters";

const H = 3600e3;
const hrs = (ms: number | null) => (ms === null ? null : Math.round((ms / H) * 10) / 10);

export async function reportsData(user: AppUser, filters: Filters, nowIso: string, weeksBack: number) {
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const wso = s.workspace.weekStartsOn;
  const now = new Date(nowIso).getTime();
  const { rows } = await listItems(user, { ...filters, life: filters.life.length ? filters.life : ["draft", "in_production", "published"] }, nowIso, { all: true });
  // Historical migrations never feed performance metrics.
  const live = rows.filter((r) => r.provenance !== "historical");
  const ids = live.map((r) => r.id);
  const attemptIds: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    attemptIds.push(...(await all<{ id: string }>(`SELECT id FROM stage_attempts WHERE item_id IN (${placeholders(c.length)})`, ...c)).map((r) => r.id));
  }
  const timings = await attemptTimings(attemptIds, nowIso);
  const weeks = lastCompleteWeeks(weeksBack, nowIso, tz, wso);
  const periodStart = new Date(`${weeks[0]}T00:00:00Z`).getTime() - 3 * H;
  const periodEnd = new Date(`${weekStart(nowIso, tz, wso)}T00:00:00Z`).getTime() - 3 * H;
  const span = periodEnd - periodStart;
  const prevStart = periodStart - span;
  const inP = (iso: string | null | undefined, a = periodStart, b = periodEnd) => !!iso && new Date(iso).getTime() >= a && new Date(iso).getTime() < b;
  const wk = (iso: string) => weekStart(iso, tz, wso);
  const byItem = new Map(live.map((r) => [r.id, r]));

  // Headline KPIs for this period and the comparable prior period.
  const kpi = (a: number, b: number) => {
    const published = live.filter((r) => inP(r.published_at, a, b));
    const lead = published.filter((r) => r.released_at).map((r) => new Date(r.published_at!).getTime() - new Date(r.released_at!).getTime());
    const completions = timings.filter((t) => t.status === "completed" && inP(t.completedAt, a, b));
    const submitted = timings.filter((t) => t.submittedAt && inP(t.submittedAt, a, b) && t.stage !== "publication");
    const returned = submitted.filter((t) => t.status === "returned");
    const due = live.filter((r) => inP(r.current_due_at, a, b));
    const onCurrent = due.filter((r) => r.published_at && r.published_at <= r.current_due_at!);
    const dueOrig = live.filter((r) => inP(r.original_due_at, a, b));
    const onOriginal = dueOrig.filter((r) => r.published_at && r.published_at <= r.original_due_at!);
    const labor = timings.filter((t) => t.closedAt && inP(t.closedAt, a, b));
    const rework = labor.filter((t) => t.cause !== "initial").reduce((x, t) => x + t.labor, 0);
    const totalLabor = labor.reduce((x, t) => x + t.labor, 0);
    return {
      published: published.length,
      minutes: published.reduce((x, r) => x + (r.actual_duration_min ?? 0), 0),
      completions: completions.length,
      leadMedian: median(lead),
      leadN: lead.length,
      firstPass: submitted.length ? 1 - returned.length / submitted.length : null,
      submittedN: submitted.length,
      onTimeCurrent: due.length ? onCurrent.length / due.length : null,
      dueN: due.length,
      onTimeOriginal: dueOrig.length ? onOriginal.length / dueOrig.length : null,
      dueOrigN: dueOrig.length,
      reworkShare: totalLabor ? rework / totalLabor : null,
      laborHours: totalLabor / H,
    };
  };
  const current = kpi(periodStart, periodEnd);
  const previous = kpi(prevStart, periodStart);
  const overdueOpen = live.filter((r) => (r.lifecycle === "in_production" || r.lifecycle === "draft") && r.current_due_at && r.current_due_at < nowIso).length;

  // Weekly turnaround per stage (median and 90th percentile residence, completed in week)
  const turnaround = weeks.map((w) => {
    const row: Record<string, string | number | null> = { week: w.slice(5) };
    for (const st of STAGES) {
      const list = timings.filter((t) => t.stage === st && t.status === "completed" && t.completedAt && wk(t.completedAt) === w).map((t) => t.residence);
      row[st] = list.length >= 2 ? hrs(median(list)) : null;
      row[`${st}_p90`] = list.length >= 2 ? hrs(percentile(list, 0.9)) : null;
      row[`${st}_n`] = list.length;
    }
    return row;
  });

  // Where time goes: mean state buckets of attempts completed in the period
  const breakdown = STAGES.map((st) => {
    const list = timings.filter((t) => t.stage === st && t.status === "completed" && inP(t.completedAt));
    const avg = (k: keyof (typeof list)[number]["buckets"]) => hrs(mean(list.map((t) => t.buckets[k])) ?? 0) ?? 0;
    return { stage: STAGE_LABELS[st], queued: avg("queued"), active: avg("active"), paused: avg("paused"), blocked: avg("blocked"), handoff: avg("handoff"), labor: hrs(mean(list.map((t) => t.labor)) ?? 0) ?? 0, n: list.length };
  });

  // Flow: arrivals vs accepted completions per week (all stages) plus unique publications
  const flow = weeks.map((w) => ({
    week: w.slice(5),
    arrivals: live.filter((r) => r.released_at && wk(r.released_at) === w).length,
    completions: timings.filter((t) => t.status === "completed" && t.completedAt && wk(t.completedAt) === w).length,
    published: live.filter((r) => r.published_at && wk(r.published_at) === w).length,
  }));

  // Blocker causes in the period
  const blockers = ids.length
    ? await (async () => {
        const out: { cause: string; opened_at: string; resolved_at: string | null }[] = [];
        for (let i = 0; i < ids.length; i += 500) {
          const c = ids.slice(i, i + 500);
          out.push(...await all<{ cause: string; opened_at: string; resolved_at: string | null }>(`SELECT cause, opened_at, resolved_at FROM blockers WHERE item_id IN (${placeholders(c.length)})`, ...c));
        }
        return out;
      })()
    : [];
  const causeMap = new Map<string, { count: number; hours: number; open: number }>();
  for (const b of blockers.filter((b) => inP(b.opened_at) || !b.resolved_at)) {
    const e = causeMap.get(b.cause) ?? { count: 0, hours: 0, open: 0 };
    e.count++;
    e.hours += ((b.resolved_at ? new Date(b.resolved_at).getTime() : now) - new Date(b.opened_at).getTime()) / H;
    if (!b.resolved_at) e.open++;
    causeMap.set(b.cause, e);
  }
  const blockerCauses = [...causeMap.entries()].map(([k, v]) => ({ cause: BLOCKER_CAUSE_LABELS[k] ?? k, count: v.count, hours: Math.round(v.hours), open: v.open })).sort((a, b) => b.hours - a.hours);

  // Rework reasons in the period
  const reviews: { reason_category: string | null; created_at: string; kind: string }[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    reviews.push(...await all<{ reason_category: string | null; created_at: string; kind: string }>(`SELECT reason_category, created_at, kind FROM handoff_reviews WHERE decision IN ('returned','changes_requested') AND item_id IN (${placeholders(c.length)})`, ...c));
  }
  const reasonMap = new Map<string, number>();
  for (const r of reviews.filter((r) => inP(r.created_at))) reasonMap.set(r.reason_category ?? "other", (reasonMap.get(r.reason_category ?? "other") ?? 0) + 1);
  const reworkReasons = [...reasonMap.entries()].map(([k, v]) => ({ reason: RETURN_REASON_LABELS[k] ?? k, count: v })).sort((a, b) => b.count - a.count);
  const reworkTrend = weeks.map((w) => ({
    week: w.slice(5),
    returns: reviews.filter((r) => wk(r.created_at) === w).length,
    reworkHours: hrs(timings.filter((t) => t.cause !== "initial" && t.closedAt && wk(t.closedAt) === w).reduce((a, t) => a + t.labor, 0)) ?? 0,
  }));

  // First pass and returns per stage
  const quality = STAGES.filter((st) => st !== "publication").map((st) => {
    const sub = timings.filter((t) => t.stage === st && t.submittedAt && inP(t.submittedAt));
    const ret = sub.filter((t) => t.status === "returned").length;
    return { stage: STAGE_LABELS[st], submitted: sub.length, returned: ret, firstPass: sub.length ? 1 - ret / sub.length : null };
  });

  // Open backlog with live ages (separate from completed turnaround)
  const bands = s.reporting.agingBands;
  const backlog = STAGES.map((st) => {
    const open = live.filter((r) => r.lifecycle === "in_production" && r.stage === st);
    const ages = open.map((r) => (r.stage_entered_at ? now - new Date(r.stage_entered_at).getTime() : 0));
    const b = [0, 0, 0, 0];
    for (const a of ages) {
      const d = a / 864e5;
      b[d <= bands[0] ? 0 : d <= bands[1] ? 1 : d <= bands[2] ? 2 : 3]++;
    }
    return { stage: STAGE_LABELS[st], key: st as Stage, fresh: b[0], recent: b[1], aging: b[2], old: b[3], total: open.length, oldest: ages.length ? Math.max(...ages) : 0, medianAge: median(ages) };
  });

  // Grade and subject breakdown (primary placement, so totals add up)
  const gs = new Map<string, { grade: string; subject: string; published: number; inProd: number; drafts: number; lead: number[] }>();
  for (const r of live) {
    const k = `${r.grade_name}|${r.subject_name}`;
    const e = gs.get(k) ?? { grade: r.grade_name, subject: r.subject_name, published: 0, inProd: 0, drafts: 0, lead: [] };
    if (r.lifecycle === "published" && inP(r.published_at)) {
      e.published++;
      if (r.released_at) e.lead.push(new Date(r.published_at!).getTime() - new Date(r.released_at).getTime());
    }
    if (r.lifecycle === "in_production") e.inProd++;
    if (r.lifecycle === "draft") e.drafts++;
    gs.set(k, e);
  }
  const byGradeSubject = [...gs.values()].map((e) => ({ ...e, leadMedian: median(e.lead), leadN: e.lead.length })).sort((a, b) => a.grade.localeCompare(b.grade) || a.subject.localeCompare(b.subject));

  const historicalExcluded = rows.length - live.length;
  return {
    period: { from: new Date(periodStart).toISOString(), to: new Date(periodEnd).toISOString(), weeks: weeksBack },
    current,
    previous,
    overdueOpen,
    turnaround,
    breakdown,
    flow,
    blockerCauses,
    reworkReasons,
    reworkTrend,
    quality,
    backlog,
    bands,
    byGradeSubject,
    historicalExcluded,
    minSample: s.reporting.minSample,
    sampleItems: live.length,
    byItem: byItem.size,
  };
}

export type ReportsData = Awaited<ReturnType<typeof reportsData>>;
