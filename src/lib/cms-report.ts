import { cmsDate, cmsField } from "./cms-filters";

// One CMS report, built the same way for the on-page preview and for the Excel, CSV and PDF files.
export const CMS_GROUP_BY = [
  ["none", "No grouping"],
  ["day", "Day"],
  ["method", "Payment method"],
  ["status", "Status"],
  ["grade", "Grade"],
  ["plan", "Plan"],
] as const;
export type CmsGroupBy = (typeof CMS_GROUP_BY)[number][0];

export type CmsReportSpec = {
  category: string;
  from: string;
  until: string;
  search?: string;
  filters?: Record<string, string>;
  columns: string[];
  groupBy: CmsGroupBy;
  sumColumn?: string;
  title?: string;
};
export type CmsReportGroup = { key: string; label: string; count: number; sum: number; rows: Record<string, string>[] };
export type CmsReport = { spec: CmsReportSpec; columns: string[]; groups: CmsReportGroup[]; totals: { count: number; sum: number }; sumColumn: string | null };

const FIELDS: Record<Exclude<CmsGroupBy, "none" | "day">, string[]> = {
  method: ["payment method", "method", "payment channel", "payment_method"],
  status: ["status", "payment status", "subscription status", "state"],
  grade: ["grade", "grades", "all grades"],
  plan: ["plan", "subscription plan", "package", "plan name"],
};

export const cmsAmount = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
export const cmsAmountColumn = (headers: string[]) => headers.find((h) => /^(amount|total|price|paid|amount paid)$/i.test(h.trim())) ?? headers.find((h) => /amount|total|price/i.test(h)) ?? null;
export const cmsDateColumn = (headers: string[]) => headers.find((h) => /created/i.test(h)) ?? headers.find((h) => /date|_at$| at$/i.test(h)) ?? null;
const addisDay = (d: Date) => new Date(+d + 3 * 3600_000).toISOString().slice(0, 10);

export function cmsGroupValue(row: Record<string, string>, by: CmsGroupBy): string {
  if (by === "none") return "All rows";
  if (by === "day") {
    const d = row._date ? new Date(row._date) : cmsDate(row);
    return d ? addisDay(d) : "No date";
  }
  return cmsField(row, FIELDS[by]) || "Not set";
}

export function buildCmsReport(rows: Record<string, string>[], headers: string[], spec: CmsReportSpec): CmsReport {
  const columns = (spec.columns.length ? spec.columns : headers).filter((c) => headers.includes(c));
  const sumColumn = spec.sumColumn === "" ? null : spec.sumColumn && headers.includes(spec.sumColumn) ? spec.sumColumn : cmsAmountColumn(headers);
  const map = new Map<string, CmsReportGroup>();
  for (const r of rows) {
    const key = cmsGroupValue(r, spec.groupBy);
    let g = map.get(key);
    if (!g) map.set(key, (g = { key, label: key, count: 0, sum: 0, rows: [] }));
    g.count++;
    if (sumColumn) g.sum += cmsAmount(r[sumColumn]);
    g.rows.push(r);
  }
  const groups = [...map.values()].sort((a, b) => (spec.groupBy === "day" ? b.key.localeCompare(a.key) : b.count - a.count || a.key.localeCompare(b.key)));
  return { spec, columns, groups, sumColumn, totals: { count: rows.length, sum: groups.reduce((s, g) => s + g.sum, 0) } };
}

export const cmsFiltersText = (spec: Pick<CmsReportSpec, "search" | "filters">) =>
  [spec.search?.trim() && `Search "${spec.search.trim()}"`, ...Object.entries(spec.filters || {}).filter(([, v]) => v).map(([k, v]) => `${k.replace(/\.value$/, "").replace(/[_.]/g, " ")}: ${v}`)].filter(Boolean).join(" · ") || "None";
