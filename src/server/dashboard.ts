import { all, get, placeholders } from "./db";
import { getSettings } from "./settings";
import { listItems, type ItemListRow } from "./queries";
import { attemptTimings, median, weekStart, lastCompleteWeeks, type AttemptTiming } from "./metrics";
import type { AppUser } from "./users";
import { PREV_STAGE, STAGE_LABELS, STAGES, type Role, type Stage } from "@/lib/domain";
import { BLOCKER_CAUSE_LABELS } from "@/lib/domain";
import { fmtDuration, fmtHours, fmtNum, fmtPct } from "@/lib/format";
import { filtersToParams, type Filters } from "@/lib/filters";

export type Metric = {
  key: string;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: "default" | "warning" | "danger" | "success";
  definition: { definition: string; basis?: string; denominator?: string; sample?: string | number };
  trend?: { direction: "up" | "down" | "flat"; text: string; good?: boolean };
};

export type Attention = { key: string; tone: "danger" | "warning" | "info"; title: string; detail: string; href: string; count?: number };

const WEEK = 7 * 864e5;

function link(base: string, f: Partial<Filters>, scope: Filters) {
  const merged: Partial<Filters> = { g: scope.g, s: scope.s, u: scope.u, ...f };
  const qs = filtersToParams(merged).toString();
  return qs ? `${base}?${qs}` : base;
}

function chunked<T>(ids: string[], fn: (c: string[]) => T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...fn(ids.slice(i, i + 500)));
  return out;
}

export async function dashboardData(user: AppUser, role: Role, scope: Filters, nowIso: string) {
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const now = new Date(nowIso).getTime();
  const base: Filters = { ...scope, stage: [], status: [], owner: [], flags: [], page: 1, size: 50 };
  const { rows } = await listItems(user, base, nowIso, { all: true });
  const ids = rows.map((r) => r.id);
  const attemptIds: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    attemptIds.push(...(await all<{ id: string }>(`SELECT id FROM stage_attempts WHERE item_id IN (${placeholders(c.length)})`, ...c)).map((r) => r.id));
  }
  const timings = await attemptTimings(attemptIds, nowIso);
  const metricItems = new Set(rows.filter((r) => r.provenance !== "historical").map((r) => r.id));
  const live = timings.filter((t) => metricItems.has(t.itemId));
  const since4 = now - 4 * WEEK;
  const since8 = now - 8 * WEEK;
  const open = rows.filter((r) => r.lifecycle === "in_production");
  const byId = new Map(rows.map((r) => [r.id, r]));
  const inWindow = (iso: string | null, from: number, to = now) => !!iso && new Date(iso).getTime() >= from && new Date(iso).getTime() < to;

  const stage = role === "manager" ? null : (role as Stage);
  const metrics: Metric[] = [];

  // Weekly accepted completions trend for the stage (or all stages for managers).
  const weeks = [...lastCompleteWeeks(8, nowIso, tz, s.workspace.weekStartsOn), weekStart(nowIso, tz, s.workspace.weekStartsOn)];
  const trend = weeks.map((w, i) => {
    const comp = live.filter((t) => t.completedAt && (!stage || t.stage === stage) && weekStart(t.completedAt, tz, s.workspace.weekStartsOn) === w);
    const arrivals = live.filter((t) => t.cause === "initial" && (!stage || t.stage === stage) && weekStart(t.enteredAt, tz, s.workspace.weekStartsOn) === w);
    const published = rows.filter((r) => r.published_at && r.provenance !== "historical" && weekStart(r.published_at, tz, s.workspace.weekStartsOn) === w);
    return { week: w, label: i === weeks.length - 1 ? "This week" : w.slice(5), completed: comp.length, arrivals: arrivals.length, published: published.length };
  });

  // Worklist
  let worklist: ItemListRow[] = [];
  if (stage) {
    const prev = PREV_STAGE[stage];
    worklist = open.filter(
      (r) =>
        (r.stage === stage && (!r.stages[stage].ownerId || r.stages[stage].ownerId === user.id)) ||
        (prev && r.stage === prev && r.stage_status === "awaiting_handoff" && (!r.owners[stage] || r.owners[stage] === user.id)),
    );
  } else {
    worklist = open.filter(
      (r) =>
        r.stage_status === "blocked" ||
        r.stage_status === "awaiting_handoff" ||
        (r.current_due_at && r.current_due_at < nowIso) ||
        !r.next_action_owner_id ||
        r.open_questions > 0,
    );
  }
  const rank = (r: ItemListRow) =>
    (r.stage_status === "in_progress" ? 0 : r.stage_status === "blocked" ? 1 : r.stage_status === "awaiting_handoff" && r.stage !== stage ? 2 : 3) * 10 +
    ({ urgent: 0, high: 1, normal: 2, low: 3 }[r.priority] ?? 2);
  worklist.sort((a, b) => rank(a) - rank(b) || (a.current_due_at ?? "9").localeCompare(b.current_due_at ?? "9"));

  const stageT = (st: Stage) => live.filter((t) => t.stage === st);
  const completedIn = (st: Stage, from: number, to = now) => stageT(st).filter((t) => t.status === "completed" && inWindow(t.completedAt, from, to));
  const openFor = (st: Stage) => open.filter((r) => r.stage === st);
  const ageOf = (r: ItemListRow) => (r.stage_entered_at ? now - new Date(r.stage_entered_at).getTime() : 0);
  const cmp = (cur: number, prev: number, higherIsGood: boolean) => {
    if (!prev && !cur) return undefined;
    const diff = cur - prev;
    const dir: "up" | "down" | "flat" = diff > 0 ? "up" : diff < 0 ? "down" : "flat";
    return { direction: dir, text: `${diff > 0 ? "+" : ""}${diff} vs prior 4 weeks`, good: dir === "flat" ? undefined : (diff > 0) === higherIsGood };
  };
  const returnsFor = (st: Stage, from: number) => live.filter((t) => t.stage === st && t.status === "returned" && inWindow(t.closedAt, from)).length;
  const submittedFor = (st: Stage, from: number) => live.filter((t) => t.stage === st && t.submittedAt && inWindow(t.submittedAt, from)).length;

  if (stage) {
    const mine = worklist.filter((r) => r.stage === stage);
    const incoming = worklist.filter((r) => r.stage !== stage);
    const done4 = completedIn(stage, since4);
    const donePrev = completedIn(stage, since8, since4);
    const openStage = openFor(stage);
    const ages = openStage.map(ageOf);
    metrics.push({
      key: "queue",
      label: "My queue",
      value: fmtNum(mine.length),
      hint: `${mine.filter((r) => r.stage_status === "queued").length} not started`,
      href: link("/content", { stage: [stage], owner: ["me", "unassigned"] }, scope),
      definition: { definition: `Open ${STAGE_LABELS[stage]} items you own, plus unassigned ones you can claim.`, basis: "As of now", sample: mine.length },
    });
    metrics.push({
      key: "incoming",
      label: "Handoffs waiting for you",
      value: fmtNum(incoming.length),
      tone: incoming.length ? "warning" : "default",
      href: link("/content", { stage: [PREV_STAGE[stage] ?? stage], flags: ["waiting"] }, scope),
      definition: { definition: "Submitted by the previous stage and waiting for acceptance or return. This delay is counted against the receiving team.", basis: "As of now" },
    });
    metrics.push({
      key: "done",
      label: "Accepted completions, 4 weeks",
      value: fmtNum(done4.length),
      trend: cmp(done4.length, donePrev.length, true),
      href: link("/reports", { stage: [stage] }, scope),
      definition: { definition: "Stage attempts accepted by the next stage. Repeated attempts count separately; unique lessons are reported on Reports.", basis: "Accepted (completed) date, last 4 weeks", sample: done4.length },
    });
    const durations = done4.map((t) => t.residence);
    metrics.push({
      key: "turnaround",
      label: "Median stage time",
      value: durations.length >= s.reporting.minSample ? fmtDuration(median(durations)) : "Insufficient data",
      hint: durations.length ? `${durations.length} completed attempts` : undefined,
      definition: {
        definition: "Median residence from stage entry to accepted completion, including queue, blocked, paused and handoff wait. Not the same as hours worked.",
        basis: "Completed in the last 4 weeks",
        sample: durations.length,
      },
    });
    const ret4 = returnsFor(stage, since4);
    const sub4 = submittedFor(stage, since4);
    metrics.push({
      key: "rework",
      label: stage === "recording" ? "Reshoot rate" : stage === "editing" ? "Correction rate" : "Return rate",
      value: sub4 ? fmtPct(ret4 / sub4) : "-",
      hint: `${ret4} of ${sub4} handoffs returned`,
      tone: sub4 && ret4 / sub4 > 0.15 ? "warning" : "default",
      href: link("/content", { stage: [stage], flags: ["rework"] }, scope),
      definition: { definition: "Returned handoffs divided by submitted handoffs.", basis: "Submitted in the last 4 weeks", denominator: "Submitted handoffs", sample: sub4 },
    });
    if (stage === "recording") {
      const mins = await rawMinutesTotal(done4.map((t) => t.attemptId));
      metrics.push({
        key: "minutes",
        label: "Raw minutes recorded, 4 weeks",
        value: fmtNum(mins),
        definition: { definition: "Sum of raw durations on accepted recording attempts.", basis: "Accepted date, last 4 weeks", sample: done4.length },
      });
    } else if (stage === "editing") {
      const minutes = done4.reduce((a, t) => a + (byId.get(t.itemId)?.actual_duration_min ?? 0), 0);
      const labor = done4.reduce((a, t) => a + t.labor, 0);
      metrics.push({
        key: "labor",
        label: "Labor per finished minute",
        value: minutes ? fmtHours(labor / minutes, 2) : "-",
        definition: { definition: "Editing labor hours (all contributors' sessions) divided by final video minutes.", basis: "Accepted in the last 4 weeks", denominator: "Final minutes", sample: done4.length },
      });
    } else if (stage === "uploading") {
      const targetsFailed = (await all<{ c: number }>(
              `SELECT COUNT(*) AS c FROM publication_targets WHERE upload_status = 'failed' AND item_id IN (${ids.length ? placeholders(ids.length) : "''"})`,
              ...ids,
            ))[0]?.c ?? 0;
      metrics.push({
        key: "failed",
        label: "Failed transfers open",
        value: fmtNum(targetsFailed),
        tone: targetsFailed ? "danger" : "default",
        href: link("/content", { status: ["sub:failed"], stage: ["uploading"] }, scope),
        definition: { definition: "Destinations whose latest upload attempt failed and has not been retried successfully.", basis: "As of now" },
      });
    } else {
      const due = rows.filter((r) => r.current_due_at && inWindow(r.current_due_at, since4) && r.provenance !== "historical");
      const onTime = due.filter((r) => r.published_at && r.published_at <= r.current_due_at!);
      metrics.push({
        key: "ontime",
        label: "On-time releases",
        value: due.length ? fmtPct(onTime.length / due.length) : "-",
        hint: `${onTime.length} of ${due.length} due`,
        definition: { definition: "Items due in the window that were published by their current deadline. Unfinished items count as not on time.", basis: "Due date, last 4 weeks", denominator: "Items due", sample: due.length },
      });
    }
    metrics.push({
      key: "age",
      label: "Oldest open item",
      value: ages.length ? fmtDuration(Math.max(...ages)) : "-",
      hint: ages.length ? `median ${fmtDuration(median(ages))}` : undefined,
      tone: ages.length && Math.max(...ages) > s.alerts.queueAgingDays * 864e5 ? "warning" : "default",
      href: link("/content", { stage: [stage], sort: "age", dir: "asc" }, scope),
      definition: { definition: "Live age of open items in this stage, from stage entry to now. Shown separately from completed turnaround so stuck work stays visible.", basis: "As of now", sample: ages.length },
    });
  } else {
    const pub4 = rows.filter((r) => r.provenance !== "historical" && inWindow(r.published_at, since4));
    const pubPrev = rows.filter((r) => r.provenance !== "historical" && inWindow(r.published_at, since8, since4));
    const lead = pub4.filter((r) => r.released_at).map((r) => new Date(r.published_at!).getTime() - new Date(r.released_at!).getTime());
    const overdue = open.filter((r) => r.current_due_at && r.current_due_at < nowIso).length + rows.filter((r) => r.lifecycle === "draft" && r.current_due_at && r.current_due_at < nowIso).length;
    const blocked = open.filter((r) => r.stage_status === "blocked").length;
    const waiting = open.filter((r) => r.stage_status === "awaiting_handoff").length;
    const unassigned = open.filter((r) => !r.next_action_owner_id).length;
    const questions = (await all<{ c: number }>("SELECT COUNT(*) AS c FROM manager_questions WHERE status = 'open'"))[0]?.c ?? 0;
    metrics.push({
      key: "wip",
      label: "In production",
      value: fmtNum(open.length),
      hint: STAGES.map((st) => `${STAGE_LABELS[st].slice(0, 3)} ${open.filter((r) => r.stage === st).length}`).join("  "),
      href: link("/pipeline", {}, scope),
      definition: { definition: "Distinct items released to production and not yet published, archived or cancelled. Multi-grade items count once.", basis: "As of now", sample: open.length },
    });
    metrics.push({
      key: "overdue",
      label: "Overdue",
      value: fmtNum(overdue),
      tone: overdue ? "danger" : "success",
      href: link("/content", { flags: ["overdue"], sort: "due", dir: "asc" }, scope),
      definition: { definition: "Open or draft items past their current approved deadline.", basis: "Current due date versus now" },
    });
    metrics.push({
      key: "blocked",
      label: "Blocked",
      value: fmtNum(blocked),
      tone: blocked ? "warning" : "default",
      href: link("/content", { flags: ["blocked"] }, scope),
      definition: { definition: "Open stages with an unresolved blocker.", basis: "As of now" },
    });
    metrics.push({
      key: "waiting",
      label: "Submitted, not accepted",
      value: fmtNum(waiting),
      hint: unassigned ? `${unassigned} without an owner` : undefined,
      tone: waiting ? "warning" : "default",
      href: link("/pipeline", { flags: ["waiting"] }, scope),
      definition: { definition: "Handoffs submitted and not yet accepted or returned. Counted against the receiving team.", basis: "As of now" },
    });
    metrics.push({
      key: "published",
      label: "Published, 4 weeks",
      value: fmtNum(pub4.length),
      hint: `${fmtNum(pub4.reduce((a, r) => a + (r.actual_duration_min ?? 0), 0))} minutes`,
      trend: cmp(pub4.length, pubPrev.length, true),
      href: link("/content", { stage: ["published"], dateField: "published", from: new Date(since4).toISOString().slice(0, 10) }, scope),
      definition: { definition: "Unique items whose required destinations were all confirmed live. Historical migrations are excluded.", basis: "Published date, last 4 weeks", sample: pub4.length },
    });
    metrics.push({
      key: "lead",
      label: "Median lead time",
      value: lead.length >= s.reporting.minSample ? fmtDuration(median(lead)) : "Insufficient data",
      hint: `${questions} unanswered question${questions === 1 ? "" : "s"}`,
      definition: { definition: "Release to production through confirmed publication, calendar time.", basis: "Published in the last 4 weeks", sample: lead.length },
    });
  }

  // Attention panel
  const attention: Attention[] = [];
  const overdueRows = (stage ? worklist : open).filter((r) => r.current_due_at && r.current_due_at < nowIso);
  if (overdueRows.length)
    attention.push({ key: "overdue", tone: "danger", title: `${overdueRows.length} overdue`, detail: overdueRows.slice(0, 3).map((r) => r.code).join(", "), href: link("/content", { flags: ["overdue"], ...(stage ? { stage: [stage] } : {}) }, scope), count: overdueRows.length });
  const blockedRows = (stage ? worklist : open).filter((r) => r.stage_status === "blocked");
  for (const r of blockedRows.slice(0, 4))
    attention.push({ key: `blk-${r.id}`, tone: "warning", title: `Blocked: ${r.code}`, detail: BLOCKER_CAUSE_LABELS[r.open_blocker ?? ""] ?? "Blocker open", href: `/items/${r.id}` });
  const staleCut = new Date(now - s.alerts.staleSessionHours * 3600e3).toISOString();
  const stale = await all<{ id: string; item_id: string; code: string; started_at: string }>(
      `SELECT ws.id, ws.item_id, i.code, ws.started_at FROM work_sessions ws JOIN items i ON i.id = ws.item_id WHERE ws.user_id = ? AND ws.ended_at IS NULL AND ws.started_at < ?`,
      user.id,
      staleCut,
    );
  for (const w of stale) attention.push({ key: `stale-${w.id}`, tone: "warning", title: `Timer still running on ${w.code}`, detail: `Started ${fmtDuration(now - new Date(w.started_at).getTime())} ago. Review it.`, href: `/dashboard?review=sessions` });
  const myQuestions = await all<{ id: string; question: string; item_id: string | null; due_at: string | null }>(
      "SELECT id, question, item_id, due_at FROM manager_questions WHERE owner_id = ? AND status = 'open' ORDER BY due_at",
      user.id,
    );
  for (const q of myQuestions.slice(0, 3))
    attention.push({ key: `q-${q.id}`, tone: q.due_at && q.due_at < nowIso ? "danger" : "info", title: "Question for you", detail: q.question, href: q.item_id ? `/items/${q.item_id}?tab=discussion` : "/questions" });
  if (!stage) {
    const unassigned = open.filter((r) => !r.next_action_owner_id);
    if (unassigned.length) attention.push({ key: "unassigned", tone: "warning", title: `${unassigned.length} without an owner`, detail: "Assign owners so handoffs do not stall.", href: link("/content", { flags: ["unassigned"] }, scope), count: unassigned.length });
    const longWait = open.filter((r) => r.stage_status === "awaiting_handoff" && ageOfSubmit(r, now) > s.alerts.handoffWaitHours * 3600e3);
    if (longWait.length) attention.push({ key: "wait", tone: "warning", title: `${longWait.length} handoffs waiting over ${s.alerts.handoffWaitHours}h`, detail: longWait.slice(0, 3).map((r) => r.code).join(", "), href: link("/pipeline", { flags: ["waiting"] }, scope) });
    const corrections = (await all<{ c: number }>("SELECT COUNT(*) AS c FROM session_corrections WHERE status = 'pending'"))[0]?.c ?? 0;
    if (corrections) attention.push({ key: "corr", tone: "info", title: `${corrections} timer correction${corrections === 1 ? "" : "s"} to approve`, detail: "Original entries stay in the history.", href: "/team?tab=corrections" });
    const aging = STAGES.map((st) => ({ st, n: openFor(st).filter((r) => ageOf(r) > s.alerts.queueAgingDays * 864e5).length })).filter((x) => x.n);
    for (const a of aging) attention.push({ key: `age-${a.st}`, tone: "info", title: `${a.n} aging in ${STAGE_LABELS[a.st]}`, detail: `Older than ${s.alerts.queueAgingDays} days in stage`, href: link("/content", { stage: [a.st], sort: "age", dir: "asc" }, scope) });
  }

  // Stage backlog for managers (bars with aging bands)
  const bands = s.reporting.agingBands;
  const backlog = STAGES.map((st) => {
    const list = openFor(st);
    const b = [0, 0, 0, 0];
    for (const r of list) {
      const d = ageOf(r) / 864e5;
      const idx = d <= bands[0] ? 0 : d <= bands[1] ? 1 : d <= bands[2] ? 2 : 3;
      b[idx]++;
    }
    return { stage: STAGE_LABELS[st], key: st, fresh: b[0], recent: b[1], aging: b[2], old: b[3], total: list.length };
  });

  const mySessions = await all<{ id: string; item_id: string; code: string; title: string; started_at: string }>(
      "SELECT ws.id, ws.item_id, i.code, i.title, ws.started_at FROM work_sessions ws JOIN items i ON i.id = ws.item_id WHERE ws.user_id = ? AND ws.ended_at IS NULL",
      user.id,
    );

  return { metrics, worklist, trend, attention, backlog, mySessions, bands, staleHours: s.alerts.staleSessionHours };
}

function ageOfSubmit(r: ItemListRow, now: number) {
  const st = r.stage ? r.stages[r.stage] : null;
  return st?.enteredAt ? now - new Date(st.enteredAt).getTime() : 0;
}

async function rawMinutesTotal(ids: string[]) {
  if (!ids.length) return 0;
  const row = await get<{ m: number | null }>(`SELECT SUM(raw_duration_min) AS m FROM stage_attempts WHERE id IN (${placeholders(ids.length)})`, ...ids);
  return row?.m ?? 0;
}

export type DashboardData = Awaited<ReturnType<typeof dashboardData>>;
export type { AttemptTiming };
