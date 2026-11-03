// Phase 17 (shared by the server and the pages): KRA templates, scoring, ratings and settings.

// meta: the KPI's reference sheet (Phase 25): Balanced Scorecard perspective, how it is worked out, where the data
// comes from, how often, who owns it and why it matters.
export type KpiMeta = { perspective?: string | null; formula?: string | null; dataSource?: string | null; frequency?: string | null; owner?: string | null; rationale?: string | null };
export type KpiDef = { key: string; name: string; description: string | null; unit: string; direction: "up" | "down"; source: "measure" | "manual"; measure: string | null; scoring: "percent" | "bands" | "pass"; bands: { green?: number; amber?: number }; minSample: number; quality: boolean; active: boolean; meta?: KpiMeta };
export type TemplateKpi = { kpi: string; weight: number; target: number };
export type TemplateKra = { name: string; weight: number; kpis: TemplateKpi[] };
export type Template = { id: string; name: string; appliesTo: string[]; kras: TemplateKra[]; active: boolean };

export type PerfConfig = {
  enabled: boolean;
  // Production staff and members see their own scorecard (leads and HR always do).
  staffSeeOwn: boolean;
  ratings: { min: number; label: string }[];
  // The previous month closes by itself on this day of the month (0: HR closes it by hand).
  closeDay: number;
  // Weekday of the OKR check-in reminder (0 Sunday ... 6 Saturday).
  checkinDay: number;
  // Below this KPI score the person is told it turned red.
  redBelow: number;
};

export const DEFAULT_PERF: PerfConfig = {
  enabled: true,
  staffSeeOwn: true,
  ratings: [
    { min: 110, label: "Exceeds" },
    { min: 90, label: "Meets" },
    { min: 0, label: "Below" },
  ],
  closeDay: 5,
  checkinDay: 1,
  redBelow: 60,
};

export const ratingOf = (score: number | null, ratings: PerfConfig["ratings"]) => (score === null ? null : ([...ratings].sort((a, b) => b.min - a.min).find((r) => score >= r.min)?.label ?? null));

// One KPI's score (0 to 120): percent of the target (capped at 120%; for "lower is better" the target over the
// actual), or bands (green 100, amber 70, red 40), or pass (100) or fail (0).
export function kpiScore(k: Pick<KpiDef, "direction" | "scoring" | "bands">, actual: number, target: number): number {
  if (k.scoring === "pass") return (k.direction === "up" ? actual >= target : actual <= target) ? 100 : 0;
  if (k.scoring === "bands") {
    const g = k.bands.green ?? target;
    const a = k.bands.amber ?? target * (k.direction === "up" ? 0.8 : 1.25);
    if (k.direction === "up") return actual >= g ? 100 : actual >= a ? 70 : 40;
    return actual <= g ? 100 : actual <= a ? 70 : 40;
  }
  if (k.direction === "up") return target > 0 ? Math.min(120, (actual / target) * 100) : actual > 0 ? 120 : 100;
  // Lower is better; a target of zero: nothing is full marks, each one costs 20 points.
  if (target <= 0) return actual <= 0 ? 100 : Math.max(0, 100 - actual * 20);
  return actual <= 0 ? 120 : Math.min(120, (target / actual) * 100);
}

const kra = (name: string, weight: number, kpis: [string, number, number][]): TemplateKra => ({ name, weight, kpis: kpis.map(([kpi, w, target]) => ({ kpi, weight: w, target })) });
const prod = (finished: number): TemplateKra[] => [
  kra("Delivery", 50, [
    ["prod_finished", 60, finished],
    ["prod_on_time", 40, 90],
  ]),
  kra("Quality", 30, [["prod_returned", 100, 10]]),
  kra("Reliability", 20, [
    ["punctuality", 70, 95],
    ["absence_days", 30, 0],
  ]),
];

// Ready templates for Myseed's roles and positions (HR edits them and adds its own). A person gets the first that
// matches, most specific first: a department position (dept:dev:lead), customer support, a production lead, a role.
export const READY_TEMPLATES: Omit<Template, "id">[] = [
  { name: "Recording", appliesTo: ["role:recording", "lead:recording"], kras: prod(20), active: true },
  { name: "Editing", appliesTo: ["role:editing", "lead:editing"], kras: prod(15), active: true },
  { name: "Uploading", appliesTo: ["role:uploading", "lead:uploading"], kras: prod(30), active: true },
  { name: "Publication", appliesTo: ["role:publication", "lead:publication"], kras: prod(30), active: true },
  {
    name: "Developer",
    appliesTo: ["dept:dev:member", "role:developer"],
    kras: [
      kra("Delivery", 50, [
        ["tasks_done", 40, 12],
        ["tasks_on_time", 30, 85],
        ["points_done", 30, 20],
      ]),
      kra("Quality", 30, [["tasks_returned", 100, 10]]),
      kra("Reliability", 20, [["punctuality", 100, 95]]),
    ],
    active: true,
  },
  {
    name: "Tech lead",
    appliesTo: ["dept:dev:lead", "dept:dev:head"],
    kras: [
      kra("Delivery", 40, [
        ["tasks_done", 50, 8],
        ["tasks_on_time", 50, 85],
      ]),
      kra("Quality", 40, [["tasks_returned", 100, 8]]),
      kra("Reliability", 20, [["punctuality", 100, 95]]),
    ],
    active: true,
  },
  {
    name: "Customer support agent",
    appliesTo: ["support:agent"],
    kras: [
      kra("Customers helped", 40, [
        ["support_solved", 50, 80],
        ["support_on_target", 50, 90],
      ]),
      kra("Quality of help", 40, [
        ["support_csat", 60, 4.5],
        ["support_first_response", 40, 30],
      ]),
      kra("Reliability", 20, [["punctuality", 100, 95]]),
    ],
    active: true,
  },
  {
    name: "Everyone else",
    appliesTo: ["*"],
    kras: [
      kra("Delivery", 50, [
        ["tasks_done", 50, 10],
        ["tasks_on_time", 50, 85],
      ]),
      kra("Reliability", 30, [["punctuality", 100, 95]]),
      kra("Teamwork", 20, [["kudos_received", 100, 2]]),
    ],
    active: true,
  },
];

export type KpiLine = { kpi: string; name: string; unit: string; direction: "up" | "down"; weight: number; target: number; targetOverridden: boolean; value: number | null; sample: number; score: number | null; note: string | null; source: "measure" | "manual" | "correction" | null; previous: number | null };
export type KraLine = { name: string; weight: number; score: number | null; kpis: KpiLine[] };
export type Scorecard = { userId: string; name: string; period: string; template: string | null; score: number | null; rating: string | null; kras: KraLine[]; frozen: boolean; warnings: string[] };

export const OKR_LEVELS = { company: "Company", department: "Department", team: "Team", person: "Personal" } as const;
export type OkrLevel = keyof typeof OKR_LEVELS;
export const CONFIDENCE = { on_track: "On track", at_risk: "At risk", off_track: "Off track" } as const;
export type Confidence = keyof typeof CONFIDENCE;
export const krScore = (kr: { kind: string; start_value: number; target: number; current: number }) =>
  kr.kind === "milestone" ? (kr.current >= 1 ? 1 : 0) : kr.target === kr.start_value ? (kr.current >= kr.target ? 1 : 0) : Math.max(0, Math.min(1, (kr.current - kr.start_value) / (kr.target - kr.start_value)));
