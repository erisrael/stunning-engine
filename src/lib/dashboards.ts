// Department dashboards: the widget catalog, sizes, periods and the starting layouts per position. A layout is an
// ordered list of widgets with a size; heads set the default for each position, and each person can keep their own.

export type WidgetSize = "s" | "m" | "l";
export const WIDGET_SIZE_LABELS: Record<WidgetSize, string> = { s: "Small", m: "Half width", l: "Full width" };
export type LayoutItem = { key: string; size: WidgetSize };
export type Widget = { key: string; label: string; group: "Numbers" | "Charts" | "Lists" | "Other"; size: WidgetSize; hint?: string };

export const DASH_KINDS = ["work", "studio"] as const;
export type DashKind = (typeof DASH_KINDS)[number];

export const WORK_WIDGETS: Widget[] = [
  { key: "c_open", label: "Not finished", group: "Numbers", size: "s" },
  { key: "c_active", label: "In progress", group: "Numbers", size: "s" },
  { key: "c_review", label: "In review", group: "Numbers", size: "s" },
  { key: "c_overdue", label: "Overdue", group: "Numbers", size: "s" },
  { key: "c_due_week", label: "Due in the next 7 days", group: "Numbers", size: "s" },
  { key: "c_done", label: "Done in the period", group: "Numbers", size: "s" },
  { key: "c_unassigned", label: "Unassigned", group: "Numbers", size: "s" },
  { key: "c_mine", label: "My open work", group: "Numbers", size: "s" },
  { key: "ch_throughput", label: "Done and created per week", group: "Charts", size: "m" },
  { key: "ch_status", label: "Work by status", group: "Charts", size: "m" },
  { key: "ch_type", label: "Open work by type", group: "Charts", size: "m" },
  { key: "ch_priority", label: "Open work by priority", group: "Charts", size: "m" },
  { key: "ch_people", label: "Workload per person", group: "Charts", size: "m", hint: "Open items and estimated hours" },
  { key: "ch_cycle", label: "Days to finish", group: "Charts", size: "m", hint: "Average days from creation to done, per week" },
  { key: "ch_kpi", label: "KPIs against target", group: "Charts", size: "m" },
  { key: "ch_budget", label: "Budget and spend per project", group: "Charts", size: "m" },
  { key: "money", label: "Money fields", group: "Numbers", size: "m", hint: "Totals of money fields on the work" },
  { key: "l_mine", label: "My work", group: "Lists", size: "m" },
  { key: "l_overdue", label: "Overdue", group: "Lists", size: "m" },
  { key: "l_review", label: "Waiting for review", group: "Lists", size: "m" },
  { key: "l_recent", label: "Recently changed", group: "Lists", size: "m" },
  { key: "l_milestones", label: "Upcoming milestones", group: "Lists", size: "m" },
  { key: "l_risk", label: "Projects at risk", group: "Lists", size: "m" },
  { key: "calendar", label: "Next two weeks", group: "Other", size: "l" },
  { key: "activity", label: "Activity", group: "Other", size: "m" },
];

export const STUDIO_WIDGETS: Widget[] = [
  { key: "c_drafts", label: "Drafts", group: "Numbers", size: "s" },
  { key: "c_review", label: "In review", group: "Numbers", size: "s" },
  { key: "c_approved", label: "Approved, not published", group: "Numbers", size: "s" },
  { key: "c_published", label: "Published in the period", group: "Numbers", size: "s" },
  { key: "c_questions", label: "Approved questions", group: "Numbers", size: "s" },
  { key: "c_mine", label: "My unpublished work", group: "Numbers", size: "s" },
  { key: "ch_published", label: "Published per week", group: "Charts", size: "m" },
  { key: "ch_status", label: "Work by type and status", group: "Charts", size: "m" },
  { key: "ch_coverage", label: "Published by grade", group: "Charts", size: "m" },
  { key: "ch_difficulty", label: "Question bank by difficulty", group: "Charts", size: "m" },
  { key: "l_review", label: "Waiting for review", group: "Lists", size: "m" },
  { key: "l_mine", label: "My work", group: "Lists", size: "m" },
  { key: "l_recent", label: "Recently changed", group: "Lists", size: "m" },
  { key: "activity", label: "Activity", group: "Other", size: "m" },
];

export const WIDGETS: Record<DashKind, Widget[]> = { work: WORK_WIDGETS, studio: STUDIO_WIDGETS };

const L = (keys: string[], all: Widget[]): LayoutItem[] => keys.map((k) => ({ key: k, size: all.find((w) => w.key === k)!.size }));

// Members start with their own work; heads and leads with the team's health.
export const DEFAULT_LAYOUTS: Record<DashKind, Record<"head" | "lead" | "member", LayoutItem[]>> = {
  work: {
    head: L(["c_open", "c_overdue", "c_review", "c_done", "ch_throughput", "ch_people", "ch_status", "l_risk", "l_review", "l_overdue", "ch_kpi", "ch_budget", "calendar", "activity"], WORK_WIDGETS),
    lead: L(["c_open", "c_overdue", "c_review", "c_unassigned", "ch_throughput", "ch_people", "l_review", "l_overdue", "ch_status", "l_milestones", "calendar"], WORK_WIDGETS),
    member: L(["c_mine", "c_due_week", "c_overdue", "c_done", "l_mine", "l_recent", "calendar"], WORK_WIDGETS),
  },
  studio: {
    head: L(["c_review", "c_approved", "c_published", "c_drafts", "ch_published", "ch_status", "l_review", "ch_coverage", "ch_difficulty", "activity"], STUDIO_WIDGETS),
    lead: L(["c_review", "c_approved", "c_published", "c_drafts", "l_review", "ch_published", "ch_status", "l_recent"], STUDIO_WIDGETS),
    member: L(["c_mine", "c_review", "c_published", "c_questions", "l_mine", "l_recent", "ch_published"], STUDIO_WIDGETS),
  },
};

export function normalizeLayout(raw: unknown, kind: DashKind): LayoutItem[] {
  if (!Array.isArray(raw)) throw new Error("A layout is a list of widgets.");
  const known = WIDGETS[kind];
  const out: LayoutItem[] = [];
  for (const r of raw) {
    const key = typeof r?.key === "string" ? r.key : "";
    if (!known.some((w) => w.key === key) || out.some((o) => o.key === key)) continue;
    out.push({ key, size: r.size === "s" || r.size === "m" || r.size === "l" ? r.size : known.find((w) => w.key === key)!.size });
  }
  return out;
}

export const PERIODS = [
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "90d", label: "Last 90 days" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
] as const;
export type Period = (typeof PERIODS)[number]["key"];

export function periodRange(p: Period, now = new Date()): { from: string; to: string; label: string } {
  const to = now.toISOString().slice(0, 10);
  const days = (n: number) => new Date(now.getTime() - (n - 1) * 864e5).toISOString().slice(0, 10);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const from =
    p === "7d" ? days(7) : p === "30d" ? days(30) : p === "90d" ? days(90) : p === "month" ? `${to.slice(0, 7)}-01` : p === "quarter" ? new Date(Date.UTC(y, m - (m % 3), 1)).toISOString().slice(0, 10) : `${y}-01-01`;
  return { from, to, label: PERIODS.find((x) => x.key === p)!.label };
}

export const isPeriod = (v: unknown): v is Period => PERIODS.some((p) => p.key === v);

// Views of the Company overview (the whole company, then each department).
export const COMPANY_VIEWS = [
  { key: "overall", label: "Overall" },
  { key: "production", label: "Production" },
  { key: "dev", label: "Dev team" },
  { key: "studio", label: "Studio" },
  { key: "marketing", label: "Marketing" },
] as const;
export type CompanyView = (typeof COMPANY_VIEWS)[number]["key"];
