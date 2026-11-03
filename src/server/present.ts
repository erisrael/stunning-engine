// Phase 12c: a presentation for any work department (Dev, Marketing, departments made from templates), built from
// its own numbers, with a plain sentence per slide written by fixed rules (not an AI).

import { all, get } from "./db";
import { workAccess } from "./dept-config";
import { flowHome } from "./dept-flow";
import { roadmap, sprintPage } from "./dev-studio";
import type { AppUser } from "./users";

const DAY = 864e5;
const n = (v: unknown) => Number(v ?? 0);

export async function presentData(user: AppUser, d: string, opts: { since?: string | null } = {}) {
  const a = await workAccess(user, d);
  const cfg = a.config;
  const dp = a.dept;
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const weekAgo = new Date(now - 7 * DAY).toISOString();
  const counts = await get<{ open: number; overdue: number; review: number; done7: number; created7: number; unassigned: number }>(
    `SELECT SUM(CASE WHEN status_category IN ('open','active','review') THEN 1 ELSE 0 END) AS open,
            SUM(CASE WHEN status_category IN ('open','active','review') AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
            SUM(CASE WHEN status_category = 'review' THEN 1 ELSE 0 END) AS review,
            SUM(CASE WHEN status_category = 'done' AND completed_at >= ? THEN 1 ELSE 0 END) AS done7,
            SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS created7,
            SUM(CASE WHEN status_category IN ('open','active','review') AND assignee_id IS NULL THEN 1 ELSE 0 END) AS unassigned
     FROM dept_tasks WHERE dept = ?`,
    today,
    weekAgo,
    weekAgo,
    dp,
  );
  // Done and created per week, the last 8 weeks.
  const weeks: { week: string; done: number; created: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const from = new Date(now - (i + 1) * 7 * DAY).toISOString();
    const to = new Date(now - i * 7 * DAY).toISOString();
    const r = await get<{ done: number; created: number }>(
      "SELECT SUM(CASE WHEN completed_at >= ? AND completed_at < ? THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN created_at >= ? AND created_at < ? THEN 1 ELSE 0 END) AS created FROM dept_tasks WHERE dept = ?",
      from,
      to,
      from,
      to,
      dp,
    );
    weeks.push({ week: to.slice(5, 10), done: n(r?.done), created: n(r?.created) });
  }
  const recent = await all<{ code: string; title: string; who: string | null }>(
    "SELECT t.code, t.title, u.name AS who FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.dept = ? AND t.status_category = 'done' AND t.completed_at >= ? ORDER BY t.completed_at DESC LIMIT 12",
    dp,
    opts.since ?? weekAgo,
  );
  const flow = cfg.flow.on ? await flowHome(user, dp) : null;
  const glance = flow?.desk?.glance ?? null;
  const sprint = cfg.features.sprints ? await sprintPage(user, dp).catch(() => null) : null;
  const projects = (await roadmap(user, dp)).projects.filter((p) => p.health !== "done");
  const c = { open: n(counts?.open), overdue: n(counts?.overdue), review: n(counts?.review), done7: n(counts?.done7), created7: n(counts?.created7), unassigned: n(counts?.unassigned) };
  const tasks = cfg.names.tasks.toLowerCase();

  // The plain sentences, by fixed rules.
  const say = {
    numbers:
      c.done7 >= c.created7
        ? `${c.done7} ${tasks} finished this week and ${c.created7} new ones came in, so the pile is ${c.done7 > c.created7 ? "shrinking" : "steady"}.`
        : `${c.created7} new ${tasks} came in this week but only ${c.done7} were finished, so the pile is growing.`,
    numbersWhy: c.overdue ? `${c.overdue} are past their due date${c.unassigned ? ` and ${c.unassigned} have nobody on them` : ""}.` : c.unassigned ? `${c.unassigned} have nobody on them yet.` : "Nothing is overdue.",
    numbersNext: c.overdue ? "Next: agree a new date or a person for each overdue one." : c.unassigned ? "Next: assign the work nobody has." : "Next: keep the pace.",
    flow: (() => {
      if (!glance?.length) return null;
      const open = glance.filter((g) => g.kind !== "final");
      const worst = [...open].sort((x, y) => y.late - x.late || y.total - x.total)[0];
      if (!worst || !worst.total) return { text: "The flow is clear: nothing is waiting in any stage.", why: "", next: "" };
      return {
        text: `${worst.label} holds the most: ${worst.total} ${tasks}${worst.late ? `, ${worst.late} past the target` : ""}.`,
        why: worst.counts.arriving ? `${worst.counts.arriving} are waiting to be accepted.` : worst.counts.sent ? `${worst.counts.sent} are waiting for approval.` : "",
        next: `Next: clear ${worst.label} first.`,
      };
    })(),
    throughput: (() => {
      const last = weeks.at(-1)!;
      const avg = Math.round((weeks.slice(0, -1).reduce((x, w) => x + w.done, 0) / 7) * 10) / 10;
      return `This week ${last.done} were finished, against ${avg} a week before.`;
    })(),
    sprint:
      sprint?.current && sprint.burn
        ? (() => {
            const left = sprint.burn.remaining.filter((x) => x !== null).at(-1) ?? 0;
            const i = sprint.burn.remaining.filter((x) => x !== null).length - 1;
            const ideal = sprint.burn.ideal[Math.max(0, i)] ?? 0;
            const unit = sprint.unit === "points" ? "points" : "hours";
            return `${sprint.current.name}: ${left} ${unit} left, ${left > ideal ? `${Math.round((left - ideal) * 10) / 10} behind` : "on or ahead of"} the even pace${sprint.burn.added ? `; ${sprint.burn.added} ${unit} were added after the start` : ""}.`;
          })()
        : null,
    projects: (() => {
      const late = projects.filter((p) => p.health === "late");
      const risk = projects.filter((p) => p.health === "at_risk");
      if (!projects.length) return null;
      if (late.length) return `${late.map((p) => p.name).join(", ")} ${late.length === 1 ? "is" : "are"} late.`;
      if (risk.length) return `${risk.map((p) => p.name).join(", ")} ${risk.length === 1 ? "is" : "are"} behind the pace the dates need.`;
      return "Every project is on track.";
    })(),
  };
  return {
    title: cfg.title,
    date: today,
    counts: c,
    weeks,
    recent,
    glance,
    sprint: sprint?.current && sprint.burn ? { name: sprint.current.name, goal: sprint.current.goal, burn: sprint.burn, unit: sprint.unit } : null,
    projects: projects.map((p) => ({ name: p.name, progress: p.progress, health: p.health, due: p.due_date })),
    say,
  };
}
export type PresentData = Awaited<ReturnType<typeof presentData>>;
