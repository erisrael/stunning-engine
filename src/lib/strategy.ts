// Strategic planning, monitoring and evaluation (Phase 25), following the usual international practice:
// - a results chain (logical framework): Goal (impact), Outcomes, Outputs and Activities, grouped by strategic
//   pillars and tagged with a Balanced Scorecard perspective, each with assumptions;
// - indicators with a full reference sheet (definition, unit, calculation, data source and method, frequency,
//   disaggregation, who reports it, baseline, targets per period, means of verification), checked against SMART;
// - results entered per period (or read from the app), verified, and rated Red, Amber or Green against the target;
// - a risk register (likelihood × impact, 5 × 5, ISO 31000 style) and evaluations by the OECD-DAC criteria with
//   recommendations and the management response;
// - documents: the strategic plan, the M&E plan, the performance report, the KPI dictionary and an evaluation
//   report, in Myseed's look or an international format.

export const LEVELS = { goal: "Goal (impact)", outcome: "Outcome", output: "Output", activity: "Activity" } as const;
export type Level = keyof typeof LEVELS;
export const CHILD_LEVEL: Record<Level, Level | null> = { goal: "outcome", outcome: "output", output: "activity", activity: null };

export const PERSPECTIVES = {
  financial: "Financial and sustainability",
  customer: "Learners, schools and partners",
  process: "Internal processes",
  learning: "People, learning and growth",
} as const;
export type Perspective = keyof typeof PERSPECTIVES;

export const FREQUENCIES = { monthly: "Monthly", quarterly: "Quarterly", semiannual: "Every six months", annual: "Yearly" } as const;
export type Frequency = keyof typeof FREQUENCIES;

export const UNITS = ["number", "percent", "birr", "days", "hours", "score", "ratio", "yes/no"] as const;

export const DAC_CRITERIA = {
  relevance: { label: "Relevance", question: "Is the work doing the right things for learners, schools and the company?" },
  coherence: { label: "Coherence", question: "How well does it fit with other work, inside and outside the company?" },
  effectiveness: { label: "Effectiveness", question: "Is it reaching its objectives and results?" },
  efficiency: { label: "Efficiency", question: "How well are resources (time, money, people) used?" },
  impact: { label: "Impact", question: "What difference does it make, intended or not?" },
  sustainability: { label: "Sustainability", question: "Will the benefits last?" },
} as const;
export type DacCriterion = keyof typeof DAC_CRITERIA;
export const DAC_RATINGS = { 4: "Highly satisfactory", 3: "Satisfactory", 2: "Partly satisfactory", 1: "Unsatisfactory" } as const;

export const RISK_CATEGORIES = ["Strategic", "Operational", "Financial", "People", "Technology", "Legal and compliance", "Reputation", "External"] as const;

export type Rag = "green" | "amber" | "red" | "none";
export const RAG_LABELS: Record<Rag, string> = { green: "On track", amber: "Needs attention", red: "Off track", none: "No data" };
export const RAG_COLORS: Record<Rag, string> = { green: "#1E8E3E", amber: "#F9AB00", red: "#D93025", none: "#9AA0A6" };

// How far the result is towards the target, from the baseline: 100% when it is reached. For "lower is better" the
// direction is turned. Without a baseline the share of the target is used.
export function achievement(actual: number | null, target: number | null, baseline: number | null, direction: "up" | "down"): number | null {
  if (actual === null || target === null) return null;
  const b = baseline ?? (direction === "up" ? 0 : null);
  if (b !== null && target !== b) {
    const pct = ((actual - b) / (target - b)) * 100;
    return Math.round(Math.max(-100, Math.min(200, pct)));
  }
  if (direction === "down") return actual <= target ? 100 : target === 0 ? 0 : Math.round(Math.max(0, (target / actual) * 100));
  return target === 0 ? (actual >= 0 ? 100 : 0) : Math.round((actual / target) * 100);
}

export function ragOf(ach: number | null, t: { green: number; amber: number } = { green: 90, amber: 70 }): Rag {
  if (ach === null) return "none";
  return ach >= t.green ? "green" : ach >= t.amber ? "amber" : "red";
}

// The periods an indicator is reported for, between two dates: 2026-03, 2026-Q1, 2026-H1 or 2026.
export function periodsOf(freq: Frequency, from: string, to: string): string[] {
  const out: string[] = [];
  const [y0, m0] = [Number(from.slice(0, 4)), Number(from.slice(5, 7)) || 1];
  const [y1, m1] = [Number(to.slice(0, 4)), Number(to.slice(5, 7)) || 12];
  for (let y = y0; y <= y1; y++)
    for (let m = y === y0 ? m0 : 1; m <= (y === y1 ? m1 : 12); m++) {
      const p = freq === "monthly" ? `${y}-${String(m).padStart(2, "0")}` : freq === "quarterly" ? `${y}-Q${Math.ceil(m / 3)}` : freq === "semiannual" ? `${y}-H${m <= 6 ? 1 : 2}` : `${y}`;
      if (!out.includes(p)) out.push(p);
    }
  return out.slice(0, 120);
}

// The months a period covers (for results read from the app).
export function monthsOf(period: string): string[] {
  const y = period.slice(0, 4);
  if (/^\d{4}-\d{2}$/.test(period)) return [period];
  const q = period.match(/^\d{4}-Q([1-4])$/);
  if (q) return [0, 1, 2].map((i) => `${y}-${String((Number(q[1]) - 1) * 3 + i + 1).padStart(2, "0")}`);
  const h = period.match(/^\d{4}-H([12])$/);
  if (h) return Array.from({ length: 6 }, (_, i) => `${y}-${String((Number(h[1]) - 1) * 6 + i + 1).padStart(2, "0")}`);
  if (/^\d{4}$/.test(period)) return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, "0")}`);
  return [];
}

export function periodLabel(p: string) {
  const q = p.match(/^(\d{4})-Q([1-4])$/);
  if (q) return `Q${q[2]} ${q[1]}`;
  const h = p.match(/^(\d{4})-H([12])$/);
  if (h) return `H${h[2]} ${h[1]}`;
  if (/^\d{4}-\d{2}$/.test(p)) return new Date(`${p}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
  return p;
}

export type IndicatorSheet = {
  name: string;
  definition: string | null;
  unit: string;
  direction: "up" | "down";
  baseline: number | null;
  baselineDate: string | null;
  frequency: Frequency;
  dataSource: string | null;
  method: string | null;
  verification: string | null;
  responsibleId: string | null;
  formula: string | null;
  disaggregation: string | null;
  measure: string | null;
  targets: Record<string, number>;
};

// The SMART check of an indicator's sheet: what is missing to make it Specific, Measurable, Achievable (a
// baseline), Relevant (on a result) and Time-bound (targets per period).
export function smartGaps(i: IndicatorSheet): { key: "S" | "M" | "A" | "R" | "T"; text: string }[] {
  const gaps: { key: "S" | "M" | "A" | "R" | "T"; text: string }[] = [];
  if (!i.definition || i.definition.trim().length < 15) gaps.push({ key: "S", text: "Write a clear definition (what exactly is counted)." });
  if (!i.unit) gaps.push({ key: "M", text: "Give the unit." });
  if (!i.measure && !i.dataSource) gaps.push({ key: "M", text: "Say where the data comes from, or read it from the app." });
  if (!i.measure && !i.method) gaps.push({ key: "M", text: "Say how it is collected." });
  if (i.baseline === null) gaps.push({ key: "A", text: "Set a baseline (the value at the start), so targets are realistic." });
  if (!i.responsibleId) gaps.push({ key: "R", text: "Name who reports it." });
  if (!Object.keys(i.targets).length) gaps.push({ key: "T", text: "Set targets for its periods." });
  if (!i.verification) gaps.push({ key: "M", text: "Name the means of verification (the report, file or system that proves it)." });
  return gaps;
}

export function riskScore(likelihood: number, impact: number) {
  return Math.max(1, Math.min(5, likelihood)) * Math.max(1, Math.min(5, impact));
}
export function riskLevel(score: number): "low" | "medium" | "high" | "critical" {
  return score >= 20 ? "critical" : score >= 12 ? "high" : score >= 6 ? "medium" : "low";
}
export const RISK_COLORS = { low: "#1E8E3E", medium: "#F9AB00", high: "#E8710A", critical: "#D93025" } as const;

export const DOC_KINDS = {
  plan: "Strategic plan",
  meplan: "M&E plan (results framework and indicator sheets)",
  report: "Performance report",
  kpis: "KPI dictionary",
  evaluation: "Evaluation report",
  logframe: "Logical framework (matrix)",
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const DOC_STYLES = { myseed: "Myseed (colourful, with the logo)", international: "International (formal, numbered)" } as const;
export type DocStyle = keyof typeof DOC_STYLES;
