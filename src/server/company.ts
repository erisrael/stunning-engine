// Company overview: every department side by side, for owners, managers and Admin (company.view). Progress per
// department, output per week across departments, and money: project budgets, recorded spend and money fields
// today; revenue, expenses and payroll once the Finance module (roadmap Phase 8) exists.

import { all, get, nowIso, parseJson } from "./db";
import { WorkflowError } from "./workflow";
import { ensureDeptConfigs } from "./dept-config";
import { can, type AppUser } from "./users";
import { periodRange, type Period } from "@/lib/dashboards";
import type { FieldValue } from "@/lib/dept-config";


const n = (v: unknown) => Number(v ?? 0);
const DAY = 864e5;

export function canSeeCompany(user: AppUser) {
  return can(user, "company.view") || can(user, "owners.view");
}

// Revenue, spending and payroll from Finance; null until Finance has recorded anything.
export type FinanceSummary = {
  currency: string;
  revenue: number;
  expenses: number;
  payroll: number;
  byMonth: { month: string; revenue: number; expenses: number }[];
};
async function financeSummary(range: { from: string; to: string }): Promise<FinanceSummary | null> {
  const { summary, financeSettings } = await import("./finance");
  const { get } = await import("./db");
  const any = await get("SELECT 1 AS x FROM fin_transactions UNION ALL SELECT 1 FROM fin_payroll_runs LIMIT 1");
  if (!any) return null;
  const s = await summary({ from: range.from.slice(0, 10), to: range.to.slice(0, 10) });
  return { currency: (await financeSettings()).currency, ...s };
}

function weekOf(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export type DeptSummary = { dept: string; title: string; unit: string; total: number; done: number; open: number; overdue: number; donePeriod: number; inReview: number };

export async function companySummary(user: AppUser, period: Period) {
  if (!canSeeCompany(user)) throw new WorkflowError("FORBIDDEN", "You do not have access to the company overview.");
  const configs = await ensureDeptConfigs();
  const workDepts = Object.keys(configs);
  const range = periodRange(period);
  const now = nowIso();
  const today = now.slice(0, 10);
  const end = `${range.to}T23:59:59.999Z`;

  const p = await get<Record<string, number>>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN lifecycle = 'published' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN lifecycle IN ('draft','in_production') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN lifecycle IN ('draft','in_production') AND current_due_at < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN lifecycle = 'published' AND published_at >= ? AND published_at <= ? THEN 1 ELSE 0 END) AS period,
       SUM(CASE WHEN lifecycle = 'in_production' AND stage = 'publication' THEN 1 ELSE 0 END) AS review
     FROM items WHERE lifecycle <> 'cancelled'`,
    now,
    range.from,
    end,
  );
  const work = await all<{ dept: string; total: number; done: number; open: number; overdue: number; period: number; review: number }>(
    `SELECT dept, COUNT(*) AS total, SUM(CASE WHEN status_category = 'done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status_category IN ('open','active','review') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status_category IN ('open','active','review') AND due_date < ? THEN 1 ELSE 0 END) AS overdue,
       SUM(CASE WHEN status_category = 'done' AND completed_at >= ? AND completed_at <= ? THEN 1 ELSE 0 END) AS period,
       SUM(CASE WHEN status_category = 'review' THEN 1 ELSE 0 END) AS review
     FROM dept_tasks WHERE status_category <> 'cancelled' GROUP BY dept`,
    today,
    range.from,
    end,
  );
  const s = await get<Record<string, number>>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status <> 'published' THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status = 'published' AND published_at >= ? AND published_at <= ? THEN 1 ELSE 0 END) AS period, SUM(CASE WHEN status = 'review' THEN 1 ELSE 0 END) AS review
     FROM studio_resources WHERE status <> 'archived'`,
    range.from,
    end,
  );
  const departments: DeptSummary[] = [
    { dept: "production", title: "Production", unit: "videos", total: n(p?.total), done: n(p?.done), open: n(p?.open), overdue: n(p?.overdue), donePeriod: n(p?.period), inReview: n(p?.review) },
    ...workDepts.map((d) => {
      const w = work.find((x) => x.dept === d);
      return { dept: d, title: configs[d].title, unit: configs[d].names.tasks.toLowerCase(), total: n(w?.total), done: n(w?.done), open: n(w?.open), overdue: n(w?.overdue), donePeriod: n(w?.period), inReview: n(w?.review) };
    }),
    { dept: "studio", title: "Studio", unit: "resources", total: n(s?.total), done: n(s?.done), open: n(s?.open), overdue: 0, donePeriod: n(s?.period), inReview: n(s?.review) },
  ];

  // Finished per week across the company, last 12 weeks.
  const since = new Date(Date.now() - 12 * 7 * DAY).toISOString();
  const [pw, ww, sw] = await Promise.all([
    all<{ at: string }>("SELECT published_at AS at FROM items WHERE lifecycle = 'published' AND published_at >= ?", since),
    all<{ dept: string; at: string }>("SELECT dept, completed_at AS at FROM dept_tasks WHERE status_category = 'done' AND completed_at >= ?", since),
    all<{ at: string }>("SELECT published_at AS at FROM studio_resources WHERE status = 'published' AND published_at >= ?", since),
  ]);
  const thisWeek = weekOf(now);
  const weeks = Array.from({ length: 12 }, (_, i) => new Date(Date.parse(thisWeek) - (11 - i) * 7 * DAY).toISOString().slice(0, 10));
  const weekly: ({ week: string } & Record<string, number | string>)[] = weeks.map((wk) => ({
    week: wk,
    production: pw.filter((r) => weekOf(r.at) === wk).length,
    studio: sw.filter((r) => weekOf(r.at) === wk).length,
    ...Object.fromEntries(workDepts.map((d) => [d, ww.filter((r) => r.dept === d && weekOf(r.at) === wk).length])),
  }));

  // Money from the departments: budgets of live projects, spend recorded as a Spend or Cost KPI, money fields.
  const money = [];
  for (const d of workDepts) {
    const cfg = configs[d];
    const live = cfg.projectStatuses.filter((x) => x.category !== "done" && x.category !== "cancelled").map((x) => x.key);
    const projects = (await all<{ id: string; status: string; budget: number | null }>("SELECT id, status, budget FROM dept_projects WHERE dept = ? AND archived = 0", d)).filter((x) => live.includes(x.status));
    const spendKey = cfg.kpis.find((k) => /^(spend|cost|costs|expenses?)$/i.test(k.key) || /^(spend|cost|costs|expenses?)$/i.test(k.label));
    const spend = spendKey
      ? await get<{ total: number; period: number }>(
          `SELECT SUM(m.value) AS total, SUM(CASE WHEN m.recorded_on >= ? AND m.recorded_on <= ? THEN m.value ELSE 0 END) AS period
           FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id WHERE p.dept = ? AND m.metric = ?`,
          range.from,
          range.to,
          d,
          spendKey.key,
        )
      : null;
    const moneyFields = cfg.fields.filter((f) => f.active && f.type === "money");
    let fields: { label: string; total: number }[] = [];
    if (moneyFields.length) {
      const done = await all<{ fields: string }>("SELECT fields FROM dept_tasks WHERE dept = ? AND status_category = 'done' AND completed_at >= ? AND completed_at <= ?", d, range.from, end);
      fields = moneyFields.map((f) => ({ label: f.label, total: done.reduce((sum, t) => sum + n(parseJson<Record<string, FieldValue>>(t.fields, {})[f.key]), 0) }));
    }
    money.push({
      dept: d,
      title: cfg.title,
      budget: cfg.features.budget ? projects.reduce((sum, x) => sum + n(x.budget), 0) : 0,
      liveProjects: projects.length,
      spendLabel: spendKey?.label ?? null,
      spendUnit: spendKey?.unit ?? "",
      spendTotal: n(spend?.total),
      spendPeriod: n(spend?.period),
      fields,
    });
  }

  return { period: range, departments, weekly, money, finance: await financeSummary(range) };
}
export type CompanySummary = Awaited<ReturnType<typeof companySummary>>;
