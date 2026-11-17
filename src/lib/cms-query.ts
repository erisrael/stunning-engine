// Noor record filters (Update 1.2, Phase 4), shared by the filter builder and the server (src/server/cms-query.ts).
// A filter is a group of conditions joined by AND or OR; a group may hold groups. A condition names a registered
// field, an operator allowed for the field's type, and a value.

export type CmsCond = { field: string; op: string; value?: string | number | string[] | null; value2?: string | number | null };
export type CmsGroup = { join: "and" | "or"; items: (CmsCond | CmsGroup)[] };
export const isGroup = (x: CmsCond | CmsGroup): x is CmsGroup => Array.isArray((x as CmsGroup).items);
export const emptyGroup = (): CmsGroup => ({ join: "and", items: [] });

export const CMS_OPS: Record<string, string> = {
  contains: "contains",
  not_contains: "does not contain",
  eq: "is",
  neq: "is not",
  starts: "starts with",
  ends: "ends with",
  in: "is any of",
  not_in: "is none of",
  gt: "greater than",
  gte: "at least",
  lt: "less than",
  lte: "at most",
  between: "between",
  preset: "in",
  on: "on",
  before: "before",
  after: "after",
  is_true: "is yes",
  is_false: "is no",
  empty: "is empty",
  not_empty: "is not empty",
};

const TEXT = ["contains", "not_contains", "eq", "neq", "starts", "ends", "in", "not_in", "empty", "not_empty"];
const NUM = ["eq", "neq", "gt", "gte", "lt", "lte", "between", "empty", "not_empty"];
const DATE = ["preset", "on", "before", "after", "between", "empty", "not_empty"];
export function cmsOpsFor(type: string): string[] {
  if (["integer", "decimal", "currency"].includes(type)) return NUM;
  if (["date", "datetime"].includes(type)) return DATE;
  if (type === "boolean") return ["is_true", "is_false", "empty", "not_empty"];
  if (["enum", "status"].includes(type)) return ["in", "not_in", "eq", "neq", "contains", "empty", "not_empty"];
  if (type === "json") return ["contains", "not_contains", "empty", "not_empty"];
  return TEXT;
}
export const cmsDefaultOp = (type: string) => cmsOpsFor(type)[0];
export const opNeedsValue = (op: string) => !["empty", "not_empty", "is_true", "is_false"].includes(op);
export const opNeedsSecond = (op: string) => op === "between";

// The fixed filters the spec names, matched to whatever field of the resource holds them.
export const CMS_QUICK = [
  ["status", "Status"],
  ["entity", "Type"],
  ["method", "Payment method"],
  ["currency", "Currency"],
  ["amount", "Amount"],
  ["created", "Created"],
  ["updated", "Updated"],
  ["customer", "Customer"],
  ["user", "User"],
  ["organization", "Organization"],
  ["department", "Department"],
  ["related", "Related record"],
] as const;
export type CmsQuickKey = (typeof CMS_QUICK)[number][0];

export type CmsColumnsConfig = { order: string[]; hidden: string[]; widths: Record<string, number>; pinned: string[] };
export type CmsRecordsView = { filter: CmsGroup; search?: string; sort?: { field: string; dir: "asc" | "desc" } | null; columns?: CmsColumnsConfig };
