// Accounting exports for a Finance department: paid items become journal lines that Sage 50 (Peachtree),
// QuickBooks or Xero import. The account numbers and vendor IDs come from the department's mapping.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { workAccess } from "./dept-config";
import type { AppUser } from "./users";

export const ACCOUNTING_FORMATS = {
  sage50_disbursements: "Sage 50 (Peachtree): Cash Disbursements Journal",
  sage50_general: "Sage 50 (Peachtree): General Journal",
  quickbooks: "QuickBooks Online: bank transactions",
  xero: "Xero: bank statement lines",
} as const;
export type AccountingFormat = keyof typeof ACCOUNTING_FORMATS;

export type AccountingMap = { cashAccount: string; defaultGl: string; glByType: Record<string, string>; vendorIds: Record<string, string> };
const DEFAULT_MAP: AccountingMap = { cashAccount: "10200", defaultGl: "60000", glByType: {}, vendorIds: {} };
const key = (dept: string) => `int.accounting.${dept}`;

export async function accountingMap(user: AppUser, dept: string): Promise<AccountingMap> {
  await workAccess(user, dept);
  return { ...DEFAULT_MAP, ...parseJson<Partial<AccountingMap>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key(dept)))?.value, {}) };
}

export async function saveAccountingMap(user: AppUser, dept: string, input: AccountingMap) {
  const a = await workAccess(user, dept, "write");
  if (!a.rights.configure) throw new WorkflowError("FORBIDDEN", "Only people who configure the department change the account mapping.");
  const clean = (v: unknown) => String(v ?? "").trim().slice(0, 40);
  const map: AccountingMap = {
    cashAccount: clean(input.cashAccount) || DEFAULT_MAP.cashAccount,
    defaultGl: clean(input.defaultGl) || DEFAULT_MAP.defaultGl,
    glByType: Object.fromEntries(Object.entries(input.glByType ?? {}).map(([k, v]) => [k, clean(v)]).filter(([, v]) => v)),
    vendorIds: Object.fromEntries(Object.entries(input.vendorIds ?? {}).map(([k, v]) => [k.trim().toLowerCase().slice(0, 120), clean(v)]).filter(([k, v]) => k && v)),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key(dept),
    JSON.stringify(map),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "integration.accounting", summary: `${user.name} changed the account mapping for ${dept}` });
}

type Line = { date: string; code: string; reference: string; payee: string; type: string; amount: number; description: string };

async function paidLines(dept: string, from: string, to: string): Promise<Line[]> {
  const rows = await all<{ code: string; title: string; type: string; completed_at: string; fields: string }>(
    `SELECT code, title, type, completed_at, fields FROM dept_tasks WHERE dept = ? AND status_category = 'done' AND completed_at >= ? AND completed_at < ? ORDER BY completed_at, code`,
    dept,
    `${from}T00:00:00.000Z`,
    `${to}T23:59:59.999Z`,
  );
  return rows.map((r) => {
    const f = parseJson<Record<string, unknown>>(r.fields, {});
    return { date: r.completed_at.slice(0, 10), code: r.code, reference: String(f.reference ?? "") || r.code, payee: String(f.payee ?? ""), type: r.type, amount: Math.round((Number(f.amount ?? 0) || 0) * 100) / 100, description: r.title };
  });
}

const cell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: unknown[][]) => rows.map((r) => r.map(cell).join(",")).join("\r\n");
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const dmy = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

// The CSV for the chosen tool, with a short summary.
export async function accountingExport(user: AppUser, dept: string, input: { format: AccountingFormat; from: string; to: string }) {
  await workAccess(user, dept);
  if (!(input.format in ACCOUNTING_FORMATS)) throw new WorkflowError("VALIDATION", "Choose an export format.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.from) || !/^\d{4}-\d{2}-\d{2}$/.test(input.to)) throw new WorkflowError("VALIDATION", "Choose the period.");
  const map = await accountingMap(user, dept);
  const lines = await paidLines(dept, input.from, input.to);
  const gl = (l: Line) => map.glByType[l.type] || map.defaultGl;
  const vendor = (l: Line) => map.vendorIds[l.payee.trim().toLowerCase()] || l.payee;
  let body: string;
  switch (input.format) {
    case "sage50_disbursements":
      body = csv([
        ["Vendor ID", "Check Number", "Date", "Cash Account", "Number of Distributions", "G/L Account", "Amount", "Description", "Memo"],
        ...lines.map((l) => [vendor(l), l.reference, mdy(l.date), map.cashAccount, 1, gl(l), l.amount.toFixed(2), l.description.slice(0, 160), l.code]),
      ]);
      break;
    case "sage50_general":
      body = csv([
        ["Date", "Reference", "Number of Distributions", "G/L Account", "Description", "Amount"],
        ...lines.flatMap((l) => [
          [mdy(l.date), l.reference, 2, gl(l), `${l.payee ? `${l.payee}: ` : ""}${l.description}`.slice(0, 160), l.amount.toFixed(2)],
          [mdy(l.date), l.reference, 2, map.cashAccount, `${l.payee ? `${l.payee}: ` : ""}${l.description}`.slice(0, 160), (-l.amount).toFixed(2)],
        ]),
      ]);
      break;
    case "quickbooks":
      body = csv([["Date", "Description", "Amount"], ...lines.map((l) => [mdy(l.date), `${l.payee} ${l.reference} ${l.description}`.trim(), (-l.amount).toFixed(2)])]);
      break;
    case "xero":
      body = csv([["*Date", "*Amount", "Payee", "Description", "Reference", "Account Code"], ...lines.map((l) => [dmy(l.date), (-l.amount).toFixed(2), l.payee, l.description, l.reference, gl(l)])]);
      break;
  }
  await audit({ actor: user }, { action: "integration.accounting", summary: `${user.name} exported ${lines.length} paid items (${ACCOUNTING_FORMATS[input.format]}) for ${input.from} to ${input.to}` });
  return { csv: body, count: lines.length, total: Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, missingVendor: [...new Set(lines.filter((l) => l.payee && !map.vendorIds[l.payee.trim().toLowerCase()]).map((l) => l.payee))] };
}
