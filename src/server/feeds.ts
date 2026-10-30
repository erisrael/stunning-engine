// Data feeds for Power BI, Excel and other tools: Admin creates an API key for chosen datasets, and the tool reads
// /api/feeds/<dataset>?key=... as JSON or CSV. A feed shows what the person who created the key may see.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, loadUser, type AppUser } from "./users";
import { structureRows } from "./structure";
import { customDepartments } from "./departments";
import { STAGES } from "@/lib/domain";

export const DATASETS = {
  production_parts: { label: "Production: every part and its stages", needs: "nav.overview" },
  stage_work: { label: "Production: work per stage (who, when, how long)", needs: "reports.view" },
  dept_tasks: { label: "Departments: tasks, status, dates and hours", needs: "company.view" },
  finance_items: { label: "Finance department: payments, invoices and expenses", needs: "company.view" },
  headcount: { label: "HR: employees (no salary, ID or bank details)", needs: "hr.access" },
  leave: { label: "HR: approved and requested leave", needs: "hr.access" },
} as const;
export type Dataset = keyof typeof DATASETS;
export const isDataset = (k: string): k is Dataset => k in DATASETS;

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

export type ApiToken = { id: string; name: string; prefix: string; datasets: Dataset[]; createdBy: string | null; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };

export async function listTokens(user: AppUser): Promise<ApiToken[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages API keys.");
  const rows = await all<{ id: string; name: string; prefix: string; datasets: string; created_by: string | null; creator: string | null; created_at: string; last_used_at: string | null; revoked_at: string | null }>(
    "SELECT t.*, u.name AS creator FROM api_tokens t LEFT JOIN users u ON u.id = t.created_by ORDER BY t.created_at DESC",
  );
  return rows.map((r) => ({ id: r.id, name: r.name, prefix: r.prefix, datasets: parseJson<Dataset[]>(r.datasets, []), createdBy: r.creator, createdAt: r.created_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at }));
}

export async function createToken(user: AppUser, input: { name: string; datasets: string[] }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin creates API keys.");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the key after where it is used, for example Power BI, owners' report.");
  const datasets = [...new Set(input.datasets)].filter(isDataset);
  if (!datasets.length) throw new WorkflowError("VALIDATION", "Choose at least one dataset.");
  const missing = datasets.filter((d) => !can(user, DATASETS[d].needs));
  if (missing.length) throw new WorkflowError("FORBIDDEN", `You cannot see ${missing.map((d) => DATASETS[d].label).join(", ")} yourself, so you cannot share it.`);
  const token = `msk_${crypto.randomBytes(24).toString("base64url")}`;
  await run(
    "INSERT INTO api_tokens (id, name, token_hash, prefix, datasets, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    uid("tok_"),
    name,
    hash(token),
    token.slice(0, 8),
    JSON.stringify(datasets),
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { action: "integration.token", summary: `${user.name} created the API key "${name}" for ${datasets.join(", ")}` });
  return token;
}

export async function revokeToken(user: AppUser, id: string) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin revokes API keys.");
  await run("UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", nowIso(), id);
  await audit({ actor: user }, { action: "integration.token", summary: `${user.name} revoked an API key` });
}

// The key's owner, if the key is valid and covers the dataset.
export async function userForToken(token: string, dataset: Dataset): Promise<AppUser | null> {
  const t = await get<{ id: string; datasets: string; created_by: string | null; revoked_at: string | null; last_used_at: string | null }>("SELECT id, datasets, created_by, revoked_at, last_used_at FROM api_tokens WHERE token_hash = ?", hash(token));
  if (!t || t.revoked_at || !t.created_by || !parseJson<string[]>(t.datasets, []).includes(dataset)) return null;
  const user = await loadUser(t.created_by);
  if (!user?.active || !can(user, DATASETS[dataset].needs)) return null;
  if (!t.last_used_at || Date.now() - Date.parse(t.last_used_at) > 60e3) await run("UPDATE api_tokens SET last_used_at = ? WHERE id = ?", nowIso(), t.id);
  return user;
}

type Row = Record<string, string | number | null>;

export async function datasetRows(user: AppUser, dataset: Dataset): Promise<Row[]> {
  switch (dataset) {
    case "production_parts":
      return (await structureRows(user))
        .filter((r) => r.partId)
        .map((r) => ({
          grade: r.gradeName,
          subject: r.subjectName,
          unit: r.unitNumber,
          unit_title: r.unitTitle,
          part: r.partNumber,
          part_title: r.partTitle,
          code: r.itemCode,
          ...Object.fromEntries(STAGES.flatMap((s) => [[`${s}_status`, r.stages[s]], [`${s}_done_on`, r.dates[s]?.slice(0, 10) ?? null]])),
        }));
    case "stage_work":
      return all<Row>(
        `SELECT i.code, a.stage, a.attempt_no, a.status, u.name AS owner, a.entered_at, a.first_started_at, a.completed_at,
                (SELECT ROUND(SUM(EXTRACT(EPOCH FROM (CAST(COALESCE(w.ended_at, w.started_at) AS TIMESTAMP) - CAST(w.started_at AS TIMESTAMP)))) / 3600.0, 2) FROM work_sessions w WHERE w.attempt_id = a.id) AS hours
         FROM stage_attempts a JOIN items i ON i.id = a.item_id LEFT JOIN users u ON u.id = a.owner_id ORDER BY a.entered_at DESC LIMIT 50000`,
      );
    case "dept_tasks":
    case "finance_items": {
      const finance = (await customDepartments()).filter((d) => d.template === "finance").map((d) => d.key);
      if (dataset === "finance_items" && !finance.length) return [];
      const rows = await all<{ dept: string; code: string; title: string; type: string; status: string; status_category: string; priority: string; assignee: string | null; project: string | null; start_date: string | null; due_date: string | null; created_at: string; completed_at: string | null; estimate_hours: number | null; spent_hours: number | null; fields: string }>(
        `SELECT t.dept, t.code, t.title, t.type, t.status, t.status_category, t.priority, u.name AS assignee, p.name AS project, t.start_date, t.due_date, t.created_at, t.completed_at, t.estimate_hours, t.spent_hours, t.fields
         FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id LEFT JOIN dept_projects p ON p.id = t.project_id
         ${dataset === "finance_items" ? `WHERE t.dept IN (${finance.map(() => "?").join(",")})` : ""} ORDER BY t.created_at DESC LIMIT 50000`,
        ...(dataset === "finance_items" ? finance : []),
      );
      return rows.map(({ fields, ...r }) => {
        const f = parseJson<Record<string, unknown>>(fields, {});
        return dataset === "finance_items"
          ? { ...r, amount: Number(f.amount ?? 0) || 0, payee: (f.payee as string) ?? null, reference: (f.reference as string) ?? null }
          : { ...r, ...Object.fromEntries(Object.entries(f).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v)).map(([k, v]) => [`field_${k}`, v as string])) };
      });
    }
    case "headcount":
      return all<Row>("SELECT code, full_name AS name, department, job_title, employment_type, status, start_date, probation_end, contract_end, end_date FROM employees ORDER BY code");
    case "leave":
      return all<Row>(
        "SELECT e.code, e.full_name AS name, e.department, r.type_key AS leave_type, r.start_date, r.end_date, r.days, r.status, r.created_at FROM leave_requests r JOIN employees e ON e.id = r.employee_id ORDER BY r.start_date DESC",
      );
  }
}

export function toCsv(rows: Row[]) {
  if (!rows.length) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
}
