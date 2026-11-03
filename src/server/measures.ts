// Phase 17: the measure catalogue. Each measure is computed from what the app already records (no typing), for many
// people at once and one month: production stages, department tasks, attendance, customer support and kudos.
// A measure gives a numerator and, for rates and averages, a denominator (the sample), so teams and departments add
// up correctly: a team's on-time rate is all its on-time work over all its work, not an average of averages.

import { all } from "./db";

export type Agg = { num: number; den: number | null };
export type MeasureDef = { key: string; name: string; description: string; unit: "count" | "percent" | "hours" | "days" | "minutes" | "score"; direction: "up" | "down"; quality: boolean; area: string };

export const MEASURES: MeasureDef[] = [
  { key: "prod_finished", name: "Parts finished", description: "Production stages finished in the month.", unit: "count", direction: "up", quality: false, area: "Production" },
  { key: "prod_on_time", name: "Parts on time", description: "Stages finished by their stage date, out of those with a date.", unit: "percent", direction: "up", quality: false, area: "Production" },
  { key: "prod_cycle_days", name: "Days per stage", description: "From starting a stage to finishing it, on average.", unit: "days", direction: "down", quality: false, area: "Production" },
  { key: "prod_returned", name: "Parts sent back", description: "Reviews asking for changes, out of the stages finished.", unit: "percent", direction: "down", quality: true, area: "Production" },
  { key: "tasks_done", name: "Tasks done", description: "Department tasks finished in the month.", unit: "count", direction: "up", quality: false, area: "Departments" },
  { key: "tasks_on_time", name: "Tasks on time", description: "Tasks finished by their due date, out of those with one.", unit: "percent", direction: "up", quality: false, area: "Departments" },
  { key: "points_done", name: "Story points done", description: "Points of the tasks finished in the month.", unit: "count", direction: "up", quality: false, area: "Departments" },
  { key: "tasks_returned", name: "Tasks returned", description: "Tasks sent back (returned or a bug from a check), out of those finished.", unit: "percent", direction: "down", quality: true, area: "Departments" },
  { key: "punctuality", name: "On-time days", description: "Working days started on time, out of the working days (leave and holidays left out).", unit: "percent", direction: "up", quality: false, area: "People" },
  { key: "absence_days", name: "Absent days", description: "Working days absent without leave.", unit: "days", direction: "down", quality: false, area: "People" },
  { key: "overtime_hours", name: "Overtime hours", description: "Hours past the end of the shift.", unit: "hours", direction: "up", quality: false, area: "People" },
  { key: "support_solved", name: "Tickets solved", description: "Customer support tickets solved in the month.", unit: "count", direction: "up", quality: false, area: "Customer support" },
  { key: "support_on_target", name: "Tickets solved on target", description: "Solved within the queue's target, out of those solved.", unit: "percent", direction: "up", quality: false, area: "Customer support" },
  { key: "support_first_response", name: "First answer (minutes)", description: "From a ticket coming in to the first answer, on average.", unit: "minutes", direction: "down", quality: false, area: "Customer support" },
  { key: "support_csat", name: "Customer rating", description: "Average rating customers gave (1 to 5).", unit: "score", direction: "up", quality: true, area: "Customer support" },
  { key: "kudos_received", name: "Kudos received", description: "Thanks from colleagues (Recognition).", unit: "count", direction: "up", quality: false, area: "People" },
];
export const measureDef = (key: string) => MEASURES.find((m) => m.key === key) ?? null;

const bounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return { from: `${period}-01T00:00:00.000Z`, to: new Date(Date.UTC(y!, m!, 1)).toISOString(), fromDay: `${period}-01`, toDay: new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10) };
};
const ph = (n: number) => Array.from({ length: n }, () => "?").join(",");

// The value of an aggregate: a count as is; a rate as a percent; an average as the mean.
export function valueOf(key: string, a: Agg | undefined): { value: number | null; sample: number } {
  if (!a) return { value: null, sample: 0 };
  const def = measureDef(key);
  if (a.den === null) return { value: a.num, sample: a.num };
  if (!a.den) return { value: null, sample: 0 };
  const v = a.num / a.den;
  return { value: Math.round((def?.unit === "percent" ? v * 100 : v) * 10) / 10, sample: a.den };
}

export function addAgg(list: (Agg | undefined)[]): Agg | undefined {
  const xs = list.filter((x): x is Agg => !!x);
  if (!xs.length) return undefined;
  return { num: xs.reduce((s, x) => s + x.num, 0), den: xs[0]!.den === null ? null : xs.reduce((s, x) => s + (x.den ?? 0), 0) };
}

// One measure for many people in a month: user id -> aggregate (people with nothing are left out).
export async function measureFor(key: string, period: string, userIds: string[]): Promise<Map<string, Agg>> {
  const out = new Map<string, Agg>();
  if (!userIds.length) return out;
  const { from, to } = bounds(period);
  const ids = userIds;
  const rows = async (sql: string, ...args: (string | number)[]) => {
    for (const r of await all<{ uid: string; num: number; den: number | null }>(sql, ...args, ...ids)) out.set(r.uid, { num: Number(r.num ?? 0), den: r.den === null || r.den === undefined ? null : Number(r.den) });
  };
  switch (key) {
    case "prod_finished":
      await rows(`SELECT owner_id AS uid, COUNT(*) AS num, NULL AS den FROM stage_attempts WHERE completed_at >= ? AND completed_at < ? AND owner_id IN (${ph(ids.length)}) GROUP BY owner_id`, from, to);
      break;
    case "prod_on_time":
      await rows(
        `SELECT a.owner_id AS uid, SUM(CASE WHEN a.completed_at <= sa.stage_due_at THEN 1 ELSE 0 END) AS num, COUNT(*) AS den FROM stage_attempts a JOIN stage_assignments sa ON sa.item_id = a.item_id AND sa.stage = a.stage
         WHERE sa.stage_due_at IS NOT NULL AND a.completed_at >= ? AND a.completed_at < ? AND a.owner_id IN (${ph(ids.length)}) GROUP BY a.owner_id`,
        from,
        to,
      );
      break;
    case "prod_cycle_days":
      for (const r of await all<{ uid: string; s: string; c: string }>(`SELECT owner_id AS uid, first_started_at AS s, completed_at AS c FROM stage_attempts WHERE first_started_at IS NOT NULL AND completed_at >= ? AND completed_at < ? AND owner_id IN (${ph(ids.length)})`, from, to, ...ids)) {
        const x = out.get(r.uid) ?? { num: 0, den: 0 };
        x.num += Math.max(0, (Date.parse(r.c) - Date.parse(r.s)) / 864e5);
        x.den = (x.den ?? 0) + 1;
        out.set(r.uid, x);
      }
      break;
    case "prod_returned": {
      const fin = await measureFor("prod_finished", period, ids);
      for (const r of await all<{ uid: string; n: number }>(
        `SELECT a.owner_id AS uid, COUNT(*) AS n FROM handoff_reviews h JOIN stage_attempts a ON a.id = h.attempt_id WHERE h.decision = 'changes_requested' AND h.valid = 1 AND h.created_at >= ? AND h.created_at < ? AND a.owner_id IN (${ph(ids.length)}) GROUP BY a.owner_id`,
        from,
        to,
        ...ids,
      ))
        out.set(r.uid, { num: Number(r.n), den: fin.get(r.uid)?.num ?? 0 });
      for (const [u, f] of fin) if (!out.has(u)) out.set(u, { num: 0, den: f.num });
      break;
    }
    case "tasks_done":
      await rows(`SELECT assignee_id AS uid, COUNT(*) AS num, NULL AS den FROM dept_tasks WHERE status_category = 'done' AND completed_at >= ? AND completed_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`, from, to);
      break;
    case "points_done":
      await rows(`SELECT assignee_id AS uid, COALESCE(SUM(points), 0) AS num, NULL AS den FROM dept_tasks WHERE status_category = 'done' AND completed_at >= ? AND completed_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`, from, to);
      break;
    case "tasks_on_time":
      await rows(
        `SELECT assignee_id AS uid, SUM(CASE WHEN SUBSTRING(completed_at FROM 1 FOR 10) <= due_date THEN 1 ELSE 0 END) AS num, COUNT(*) AS den FROM dept_tasks
         WHERE status_category = 'done' AND due_date IS NOT NULL AND completed_at >= ? AND completed_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`,
        from,
        to,
      );
      break;
    case "tasks_returned": {
      const done = await measureFor("tasks_done", period, ids);
      for (const r of await all<{ uid: string; n: number }>(
        `SELECT t.assignee_id AS uid, COUNT(*) AS n FROM dept_task_comments c JOIN dept_tasks t ON t.id = c.task_id WHERE (c.body LIKE 'Returned%' OR c.body LIKE 'Bug found%') AND c.created_at >= ? AND c.created_at < ? AND t.assignee_id IN (${ph(ids.length)}) GROUP BY t.assignee_id`,
        from,
        to,
        ...ids,
      ))
        out.set(r.uid, { num: Number(r.n), den: done.get(r.uid)?.num ?? 0 });
      for (const [u, d] of done) if (!out.has(u)) out.set(u, { num: 0, den: d.num });
      break;
    }
    case "punctuality":
    case "absence_days":
    case "overtime_hours": {
      const emps = await all<{ id: string; user_id: string }>(`SELECT id, user_id FROM employees WHERE status <> 'left' AND user_id IN (${ph(ids.length)})`, ...ids);
      if (!emps.length) break;
      const { monthSheet } = await import("./attendance");
      const sheet = await monthSheet(emps.map((e) => e.id), period);
      for (const r of sheet) {
        const u = emps.find((e) => e.id === r.employeeId)!.user_id;
        const t = r.totals;
        const days = t.present + t.late + t.halfDays + t.absent;
        if (key === "punctuality") {
          if (days) out.set(u, { num: t.present, den: days });
        } else if (key === "absence_days") {
          if (days) out.set(u, { num: t.absent, den: null });
        } else if (t.overtimeMin) out.set(u, { num: Math.round((t.overtimeMin / 60) * 10) / 10, den: null });
      }
      break;
    }
    case "support_solved":
      await rows(`SELECT assignee_id AS uid, COUNT(*) AS num, NULL AS den FROM sup_tickets WHERE solved_at >= ? AND solved_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`, from, to);
      break;
    case "support_on_target":
      await rows(`SELECT assignee_id AS uid, SUM(CASE WHEN solved_at <= sla_resolve_due THEN 1 ELSE 0 END) AS num, COUNT(*) AS den FROM sup_tickets WHERE solved_at >= ? AND solved_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`, from, to);
      break;
    case "support_first_response":
      for (const r of await all<{ uid: string; c: string; f: string }>(`SELECT assignee_id AS uid, created_at AS c, first_response_at AS f FROM sup_tickets WHERE first_response_at IS NOT NULL AND created_at >= ? AND created_at < ? AND assignee_id IN (${ph(ids.length)})`, from, to, ...ids)) {
        const x = out.get(r.uid) ?? { num: 0, den: 0 };
        x.num += Math.max(0, (Date.parse(r.f) - Date.parse(r.c)) / 60e3);
        x.den = (x.den ?? 0) + 1;
        out.set(r.uid, x);
      }
      break;
    case "support_csat":
      await rows(`SELECT assignee_id AS uid, SUM(rating) AS num, COUNT(*) AS den FROM sup_tickets WHERE rating IS NOT NULL AND solved_at >= ? AND solved_at < ? AND assignee_id IN (${ph(ids.length)}) GROUP BY assignee_id`, from, to);
      break;
    case "kudos_received":
      await rows(`SELECT to_user AS uid, COUNT(*) AS num, NULL AS den FROM recog_kudos WHERE created_at >= ? AND created_at < ? AND to_user IN (${ph(ids.length)}) GROUP BY to_user`, from, to);
      break;
  }
  return out;
}
