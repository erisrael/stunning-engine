// Myseed data for Sheets Studio: each team compares its own Excel workbooks with what Myseed holds, or loads it as a
// sheet. What a person gets is what they may see: production parts in their grades and subjects, the work in the
// stages they work in, the tasks of the departments they belong to (dev, sales, marketing, operations and the
// others), finance items for finance, and HR lists for HR.

import { all } from "./db";
import { WorkflowError } from "./workflow";
import { can, hasRole, isManager, scopeSql, type AppUser } from "./users";
import { requireTool } from "./tools";
import { STAGES } from "@/lib/domain";

type Row = Record<string, string | number | boolean | null>;
export type SheetSource = { key: string; label: string; hint: string; keyField: string };

const MAX = 20_000;

async function myDepts(user: AppUser) {
  const { myDepartments, customDepartments } = await import("./departments");
  const mine = await myDepartments(user);
  const custom = await customDepartments();
  return { all: mine.map((d) => d.dept), finance: mine.filter((d) => custom.find((c) => c.key === d.dept)?.template === "finance").map((d) => d.dept), titles: Object.fromEntries(mine.map((d) => [d.dept, d.title])) };
}
const stagesOf = (user: AppUser) => (isManager(user) ? [...STAGES] : STAGES.filter((s) => hasRole(user, s)));

export async function sheetSources(user: AppUser): Promise<SheetSource[]> {
  await requireTool(user, "sheets");
  const out: SheetSource[] = [];
  const stages = stagesOf(user);
  if (can(user, "nav.overview") || stages.length) out.push({ key: "production_parts", label: "Production: parts and their stages", hint: "The parts in your grades and subjects, with each stage's status and date.", keyField: "code" });
  if (stages.length || can(user, "reports.view")) out.push({ key: "stage_work", label: can(user, "reports.view") ? "Production: work per stage" : `Production: work in your stages (${stages.join(", ")})`, hint: "Who did each stage, when, and the hours.", keyField: "code" });
  const d = await myDepts(user);
  if (d.all.length || can(user, "company.view")) out.push({ key: "dept_tasks", label: `Departments: tasks${can(user, "company.view") ? "" : ` (${Object.values(d.titles).join(", ")})`}`, hint: "Tasks with status, dates, assignee and hours.", keyField: "code" });
  if (d.finance.length || can(user, "company.view")) out.push({ key: "finance_items", label: "Finance: payments, invoices and expenses", hint: "Amounts, payees and references.", keyField: "reference" });
  if (can(user, "hr.access")) out.push({ key: "headcount", label: "HR: employees", hint: "No salary, ID or bank details.", keyField: "code" }, { key: "leave", label: "HR: leave", hint: "Approved and requested leave.", keyField: "code" });
  return out;
}

export async function sheetSourceRows(user: AppUser, key: string): Promise<{ columns: string[]; rows: Row[]; truncated: boolean }> {
  const sources = await sheetSources(user);
  if (!sources.some((s) => s.key === key)) throw new WorkflowError("FORBIDDEN", "This data is not available to you.");
  const { datasetRows } = await import("./feeds");
  let rows: Row[];
  if (key === "stage_work" && !can(user, "reports.view")) {
    const stages = stagesOf(user);
    const sc = scopeSql(user, "i");
    rows = await all<Row>(
      `SELECT i.code, a.stage, a.attempt_no, a.status, u.name AS owner, a.entered_at, a.first_started_at, a.completed_at
       FROM stage_attempts a JOIN items i ON i.id = a.item_id LEFT JOIN users u ON u.id = a.owner_id
       WHERE a.stage IN (${stages.map(() => "?").join(",")}) AND ${sc.sql} ORDER BY a.entered_at DESC LIMIT ${MAX + 1}`,
      ...stages,
      ...sc.params,
    );
  } else if (key === "dept_tasks" && !can(user, "company.view")) {
    const d = await myDepts(user);
    rows = ((await datasetRows(user, "dept_tasks")) as Row[]).filter((r) => d.all.includes(String(r.dept)));
  } else if (key === "finance_items" && !can(user, "company.view")) {
    const d = await myDepts(user);
    rows = ((await datasetRows(user, "finance_items")) as Row[]).filter((r) => d.finance.includes(String(r.dept)));
  } else rows = (await datasetRows(user, key as never)) as Row[];
  const truncated = rows.length > MAX;
  rows = rows.slice(0, MAX);
  const columns = [...new Set(rows.slice(0, 200).flatMap((r) => Object.keys(r)))];
  return { columns, rows, truncated };
}
