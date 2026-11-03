// The team analyzer (Phase 23): for leads of a department, how work flows. Throughput per week, created against
// finished, cycle and lead time (median and 85th percentile), work in each status and how long it has waited there
// (the bottleneck), each member's load, pace and on-time rate, and the risks to act on now (overdue, stuck,
// blocked, urgent without an owner, overloaded or idle people). Everything is worked out from the tasks and their
// status moves; the AI only writes it up in words when it is on (askAnalysis in assistant-ai.ts).

import { all, nowIso } from "./db";
import { deptPeople } from "./departments";
import { workAccess } from "./dept-config";
import { WorkflowError } from "./workflow";
import type { AppUser } from "./users";

const DAY = 864e5;
const DEFAULT_CAPACITY = 40;

type T = {
  id: string;
  code: string;
  title: string;
  status: string;
  status_category: string;
  assignee_id: string | null;
  due_date: string | null;
  priority: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  estimate_hours: number | null;
};

export type Insight = { tone: "good" | "warn" | "bad" | "info"; title: string; detail: string };

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]! * 10) / 10;
};
const days = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / DAY);
const weekStart = (iso: string) => {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export async function teamInsights(user: AppUser, d: string, opts: { weeks?: number; now?: string } = {}) {
  const a = await workAccess(user, d);
  if (!a.rights.seeAll) throw new WorkflowError("FORBIDDEN", "The analyzer is for leads and people who see everyone's work in this department.");
  const now = opts.now ?? nowIso();
  const today = now.slice(0, 10);
  const weeks = Math.max(4, Math.min(26, opts.weeks ?? 8));
  const since = new Date(new Date(now).getTime() - weeks * 7 * DAY).toISOString();
  const cfg = a.config;
  const label = (k: string) => cfg.statuses.find((s) => s.key === k)?.label ?? k;
  const catOf = (k: string) => cfg.statuses.find((s) => s.key === k)?.category ?? "open";
  const [tasks, moves, people, caps, blocks] = await Promise.all([
    all<T>(
      "SELECT id, code, title, status, status_category, assignee_id, due_date, priority, created_at, updated_at, completed_at, estimate_hours FROM dept_tasks WHERE dept = ? AND status_category <> 'cancelled'",
      a.dept,
    ),
    all<{ task_id: string; from_status: string | null; to_status: string; at: string }>("SELECT task_id, from_status, to_status, at FROM dept_task_moves WHERE dept = ? ORDER BY at", a.dept),
    deptPeople(a.dept),
    all<{ user_id: string; hours_per_week: number }>("SELECT user_id, hours_per_week FROM dept_capacity WHERE dept = ?", a.dept),
    all<{ task_id: string; blocker_status: string }>(
      "SELECT l.task_id, b.status_category AS blocker_status FROM dept_task_links l JOIN dept_tasks b ON b.id = l.blocked_by JOIN dept_tasks t ON t.id = l.task_id WHERE t.dept = ?",
      a.dept,
    ),
  ]);
  const movesBy = new Map<string, typeof moves>();
  for (const m of moves) movesBy.set(m.task_id, [...(movesBy.get(m.task_id) ?? []), m]);
  const open = tasks.filter((t) => t.status_category !== "done");
  const done = tasks.filter((t) => t.status_category === "done" && t.completed_at);
  const doneRecent = done.filter((t) => t.completed_at! >= since);

  // Throughput and arrivals per week.
  const weekKeys: string[] = [];
  for (let i = weeks - 1; i >= 0; i--) weekKeys.push(weekStart(new Date(new Date(now).getTime() - i * 7 * DAY).toISOString()));
  const flow = weekKeys.map((w) => ({
    week: w,
    created: tasks.filter((t) => weekStart(t.created_at) === w).length,
    done: done.filter((t) => weekStart(t.completed_at!) === w).length,
  }));

  // Cycle time: from the first move into work (a status in the "active" or "review" group) to done. Lead time:
  // from creation to done.
  const startOf = (t: T) => movesBy.get(t.id)?.find((m) => ["active", "review"].includes(catOf(m.to_status)))?.at ?? null;
  const cycle = doneRecent.map((t) => {
    const s = startOf(t);
    return s ? days(s, t.completed_at!) : null;
  }).filter((x): x is number => x !== null);
  const lead = doneRecent.map((t) => days(t.created_at, t.completed_at!));

  // Work in each status now, and how long it has been there (since the last move into it, else last update).
  const inStatus = (t: T) => {
    const last = [...(movesBy.get(t.id) ?? [])].reverse().find((m) => m.to_status === t.status);
    return days(last?.at ?? t.updated_at ?? t.created_at, now);
  };
  const statuses = cfg.statuses
    .filter((s) => s.category !== "done" && s.category !== "cancelled")
    .map((s) => {
      const here = open.filter((t) => t.status === s.key);
      const ages = here.map(inStatus);
      return { key: s.key, label: s.label, category: s.category, count: here.length, avgDays: ages.length ? Math.round((ages.reduce((x, y) => x + y, 0) / ages.length) * 10) / 10 : 0, oldestDays: ages.length ? Math.round(Math.max(...ages) * 10) / 10 : 0 };
    });
  // Time spent in each status by finished work (from the moves), to see where finished work waited longest.
  const spent = new Map<string, number[]>();
  for (const t of doneRecent) {
    const ms = movesBy.get(t.id) ?? [];
    for (let i = 0; i < ms.length; i++) {
      const m = ms[i]!;
      const end = ms[i + 1]?.at ?? t.completed_at!;
      if (catOf(m.to_status) === "done") continue;
      spent.set(m.to_status, [...(spent.get(m.to_status) ?? []), days(m.at, end)]);
    }
  }
  const waits = [...spent.entries()].map(([k, xs]) => ({ key: k, label: label(k), avgDays: Math.round((xs.reduce((x, y) => x + y, 0) / xs.length) * 10) / 10, samples: xs.length })).sort((x, y) => y.avgDays - x.avgDays);
  const working = statuses.filter((s) => s.category !== "open");
  const bottleneck = [...(working.length ? working : statuses)].sort((x, y) => y.count * Math.max(1, y.avgDays) - x.count * Math.max(1, x.avgDays))[0] ?? null;

  // Members.
  const members = people.map((p) => {
    const mine = open.filter((t) => t.assignee_id === p.id);
    const fin = doneRecent.filter((t) => t.assignee_id === p.id);
    const withDue = fin.filter((t) => t.due_date);
    const onTime = withDue.filter((t) => t.completed_at!.slice(0, 10) <= t.due_date!).length;
    const cap = Number(caps.find((c) => c.user_id === p.id)?.hours_per_week ?? DEFAULT_CAPACITY);
    const hours = Math.round(mine.reduce((s, t) => s + Number(t.estimate_hours ?? 0), 0) * 10) / 10;
    const myCycle = fin.map((t) => {
      const s = startOf(t);
      return s ? days(s, t.completed_at!) : null;
    }).filter((x): x is number => x !== null);
    return {
      id: p.id,
      name: p.name,
      position: p.position,
      open: mine.length,
      inProgress: mine.filter((t) => catOf(t.status) === "active").length,
      overdue: mine.filter((t) => t.due_date && t.due_date < today).length,
      done: fin.length,
      perWeek: Math.round((fin.length / weeks) * 10) / 10,
      onTimePct: withDue.length ? Math.round((onTime / withDue.length) * 100) : null,
      cycleMedian: pct(myCycle, 50),
      hours,
      capacity: cap,
      loadPct: cap ? Math.round((hours / cap) * 100) : null,
    };
  });

  // Risks to act on now.
  const blocked = new Set(blocks.filter((b) => b.blocker_status !== "done" && b.blocker_status !== "cancelled").map((b) => b.task_id));
  const short = (t: T) => ({ id: t.id, code: t.code, title: t.title, status: label(t.status), due: t.due_date, assignee: people.find((p) => p.id === t.assignee_id)?.name ?? null, priority: t.priority });
  const risks = {
    overdue: open.filter((t) => t.due_date && t.due_date < today).sort((x, y) => x.due_date!.localeCompare(y.due_date!)).slice(0, 15).map(short),
    stuck: open.filter((t) => catOf(t.status) !== "open" && inStatus(t) >= 7).sort((x, y) => inStatus(y) - inStatus(x)).slice(0, 15).map((t) => ({ ...short(t), days: Math.round(inStatus(t)) })),
    blocked: open.filter((t) => blocked.has(t.id)).slice(0, 15).map(short),
    unowned: open.filter((t) => !t.assignee_id && (t.priority === "high" || t.priority === "urgent")).slice(0, 15).map(short),
  };

  const ins: Insight[] = [];
  const doneN = doneRecent.length;
  const createdN = tasks.filter((t) => t.created_at >= since).length;
  if (createdN > doneN * 1.25 && createdN - doneN >= 3) ins.push({ tone: "warn", title: "More work arrives than is finished", detail: `${createdN} created and ${doneN} finished in ${weeks} weeks: the backlog grows by about ${Math.round((createdN - doneN) / weeks)} a week.` });
  else if (doneN >= createdN && doneN > 0) ins.push({ tone: "good", title: "The team keeps up", detail: `${doneN} finished against ${createdN} created in ${weeks} weeks.` });
  const last4 = flow.slice(-4).reduce((s, w) => s + w.done, 0);
  const prev4 = flow.slice(-8, -4).reduce((s, w) => s + w.done, 0);
  if (prev4 >= 4 && last4 < prev4 * 0.7) ins.push({ tone: "warn", title: "Throughput dropped", detail: `${last4} finished in the last 4 weeks against ${prev4} in the 4 before.` });
  if (prev4 >= 2 && last4 > prev4 * 1.3) ins.push({ tone: "good", title: "Throughput is up", detail: `${last4} finished in the last 4 weeks against ${prev4} in the 4 before.` });
  if (bottleneck && bottleneck.count >= 3 && bottleneck.avgDays >= 3) ins.push({ tone: "bad", title: `Work waits in ${bottleneck.label}`, detail: `${bottleneck.count} tasks sit there for ${bottleneck.avgDays} days on average (the oldest ${bottleneck.oldestDays}). Limit work in progress or add help at this step.` });
  if (waits[0] && waits[0].avgDays >= 2) ins.push({ tone: "info", title: `Finished work waited longest in ${waits[0].label}`, detail: `${waits[0].avgDays} days on average over ${waits[0].samples} tasks.` });
  for (const m of members) {
    if (m.loadPct !== null && m.loadPct > 120) ins.push({ tone: "bad", title: `${m.name} is overloaded`, detail: `${m.hours} estimated hours open against ${m.capacity} a week (${m.loadPct}%). Move or re-plan some work.` });
    if (m.inProgress >= 5) ins.push({ tone: "warn", title: `${m.name} has ${m.inProgress} tasks in progress at once`, detail: "Starting fewer and finishing more usually shortens cycle time." });
    if (m.onTimePct !== null && m.onTimePct < 60 && m.done >= 3) ins.push({ tone: "warn", title: `${m.name} finishes ${m.onTimePct}% on time`, detail: "Check the estimates and due dates set for this work." });
  }
  const idle = members.filter((m) => m.open === 0);
  if (idle.length && open.some((t) => !t.assignee_id)) ins.push({ tone: "info", title: `${idle.length} ${idle.length === 1 ? "person has" : "people have"} no open work`, detail: `${idle.map((m) => m.name).join(", ")}; ${open.filter((t) => !t.assignee_id).length} open tasks have no owner.` });
  if (risks.unowned.length) ins.push({ tone: "bad", title: `${risks.unowned.length} urgent or high-priority tasks have no owner`, detail: risks.unowned.slice(0, 3).map((t) => t.code).join(", ") });
  if (risks.overdue.length) ins.push({ tone: risks.overdue.length >= 5 ? "bad" : "warn", title: `${risks.overdue.length} tasks are overdue`, detail: risks.overdue.slice(0, 3).map((t) => `${t.code} (${t.due})`).join(", ") });
  if (risks.blocked.length) ins.push({ tone: "warn", title: `${risks.blocked.length} tasks are blocked by unfinished work`, detail: risks.blocked.slice(0, 3).map((t) => t.code).join(", ") });
  if (!ins.length) ins.push({ tone: "info", title: "Not much to read yet", detail: "The analysis gets better as tasks move through the board." });
  const order = { bad: 0, warn: 1, info: 2, good: 3 } as const;
  ins.sort((x, y) => order[x.tone] - order[y.tone]);

  return {
    dept: a.dept,
    title: cfg.title,
    weeks,
    totals: { open: open.length, done: doneN, created: createdN, overdue: risks.overdue.length, unassigned: open.filter((t) => !t.assignee_id).length, wip: open.filter((t) => catOf(t.status) !== "open").length },
    flow,
    cycle: { median: pct(cycle, 50), p85: pct(cycle, 85), samples: cycle.length },
    lead: { median: pct(lead, 50), p85: pct(lead, 85), samples: lead.length },
    statuses,
    waits,
    bottleneck,
    members,
    risks,
    insights: ins,
  };
}
export type TeamInsights = Awaited<ReturnType<typeof teamInsights>>;
