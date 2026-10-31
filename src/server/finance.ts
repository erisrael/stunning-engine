// Finance: money accounts, vendors and customers, the journal, payables and receivables, expense claims,
// purchasing, budgets, payroll and reports. Whoever prepares something is never the one who approves it, and
// nothing changes in a locked period. Every change is in the audit log.

import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, listUsers, type AppUser } from "./users";
import { customDepartments } from "./departments";
import { STAGES, DEPARTMENT_LABELS, type Department } from "@/lib/domain";
import {
  ACCOUNT_KINDS,
  DEFAULT_FINANCE_SETTINGS,
  DEFAULT_LEDGER,
  LEDGER_TYPES,
  PARTY_KINDS,
  computePay,
  round2,
  type AccountKind,
  type FinanceSettings,
  type LedgerType,
  type PartyKind,
  type PayLine,
} from "@/lib/finance";

const clean = (v: unknown, n = 300) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const amountOf = (v: unknown) => {
  const n = round2(Number(v));
  if (!Number.isFinite(n) || n <= 0) throw new WorkflowError("VALIDATION", "Enter an amount above zero.");
  if (n > 1e12) throw new WorkflowError("VALIDATION", "That amount is too large.");
  return n;
};
const today = () => new Date().toISOString().slice(0, 10);

export const rights = (u: AppUser) => ({
  access: can(u, "finance.access"),
  approve: can(u, "finance.approve"),
  payroll: can(u, "finance.payroll"),
  view: can(u, "finance.view") || can(u, "finance.access"),
  ownerApprove: can(u, "finance.owner_approve"),
});
function need(u: AppUser, r: keyof ReturnType<typeof rights>, what = "do this") {
  if (!rights(u)[r]) throw new WorkflowError("FORBIDDEN", `Finance permission needed to ${what}.`);
}
async function financeIds(cap: "finance.approve" | "finance.access" | "finance.owner_approve" | "finance.payroll") {
  return (await listUsers()).filter((u) => u.perms.includes(cap)).map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Settings, ledger codes, locked periods
// ---------------------------------------------------------------------------

export async function financeSettings(): Promise<FinanceSettings> {
  return { ...DEFAULT_FINANCE_SETTINGS, ...parseJson<Partial<FinanceSettings>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.finance'"))?.value, {}) };
}

export async function saveFinanceSettings(user: AppUser, input: Partial<FinanceSettings>) {
  need(user, "approve", "change finance settings");
  const cur = await financeSettings();
  const num = (v: unknown, d: number, min = 0, max = 1e9) => (Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : d);
  const brackets = (input.taxBrackets ?? cur.taxBrackets)
    .map((b) => ({ upTo: b.upTo === null || b.upTo === undefined || (b.upTo as unknown) === "" ? null : num(b.upTo, 0), rate: num(b.rate, 0, 0, 100), deduct: num(b.deduct, 0) }))
    .sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
  if (!brackets.length || brackets[brackets.length - 1]!.upTo !== null) throw new WorkflowError("VALIDATION", "The last tax bracket must have no upper limit.");
  const next: FinanceSettings = {
    currency: clean(input.currency ?? cur.currency, 8) || "ETB",
    fiscalStartMonth: num(input.fiscalStartMonth ?? cur.fiscalStartMonth, 7, 1, 12),
    vatRate: num(input.vatRate ?? cur.vatRate, 15, 0, 100),
    pensionEmployee: num(input.pensionEmployee ?? cur.pensionEmployee, 7, 0, 100),
    pensionEmployer: num(input.pensionEmployer ?? cur.pensionEmployer, 11, 0, 100),
    taxBrackets: brackets,
    daysPerMonth: num(input.daysPerMonth ?? cur.daysPerMonth, 30, 1, 31),
    hoursPerDay: num(input.hoursPerDay ?? cur.hoursPerDay, 8, 1, 24),
    approvalLimit: num(input.approvalLimit ?? cur.approvalLimit, 10000),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.finance', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "finance.settings", summary: `${user.name} changed the finance settings`, newValue: next });
  return next;
}

export async function ledger(): Promise<{ code: string; name: string; type: LedgerType; active: boolean }[]> {
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_ledger"))?.c ?? 0);
  if (!n) for (const l of DEFAULT_LEDGER) await run("INSERT INTO fin_ledger (code, name, type) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", l.code, l.name, l.type);
  return (await all<{ code: string; name: string; type: LedgerType; active: number }>("SELECT * FROM fin_ledger ORDER BY code")).map((r) => ({ ...r, active: !!r.active }));
}

export async function saveLedger(user: AppUser, input: { code: string; name: string; type: string; active?: boolean }) {
  need(user, "approve", "change the chart of accounts");
  const code = clean(input.code, 20);
  if (!/^[A-Za-z0-9.-]{2,20}$/.test(code)) throw new WorkflowError("VALIDATION", "Use a short account code such as 61000.");
  if (!(input.type in LEDGER_TYPES)) throw new WorkflowError("VALIDATION", "Choose the account type.");
  await run(
    "INSERT INTO fin_ledger (code, name, type, active) VALUES (?, ?, ?, ?) ON CONFLICT (code) DO UPDATE SET name = excluded.name, type = excluded.type, active = excluded.active",
    code,
    clean(input.name, 80) || code,
    input.type,
    input.active === false ? 0 : 1,
  );
}

export async function isLocked(date: string) {
  return !!(await get("SELECT 1 AS x FROM fin_periods WHERE period = ?", date.slice(0, 7)));
}
async function needOpen(date: string) {
  if (await isLocked(date)) throw new WorkflowError("INVALID_STATE", `${date.slice(0, 7)} is closed. Ask the Finance Manager to reopen it first.`);
}

export async function lockPeriod(user: AppUser, period: string, locked: boolean) {
  need(user, "approve", "close periods");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new WorkflowError("VALIDATION", "Choose the month.");
  if (locked) await run("INSERT INTO fin_periods (period, locked_by, locked_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", period, user.id, nowIso());
  else await run("DELETE FROM fin_periods WHERE period = ?", period);
  await audit({ actor: user }, { action: "finance.period", summary: `${user.name} ${locked ? "closed" : "reopened"} ${period}` });
}

export async function lockedPeriods() {
  return all<{ period: string; locked_at: string; name: string | null }>("SELECT p.period, p.locked_at, u.name FROM fin_periods p LEFT JOIN users u ON u.id = p.locked_by ORDER BY p.period DESC");
}

// Departments a transaction or budget can belong to.
export async function financeDepartments() {
  const built = (Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => ({ key: k, label: DEPARTMENT_LABELS[k] }));
  return [...built, ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title })), { key: "hr", label: "HR" }, { key: "management", label: "Management" }];
}

// ---------------------------------------------------------------------------
// Accounts and parties
// ---------------------------------------------------------------------------

export async function listAccounts(user: AppUser) {
  need(user, "view", "see accounts");
  const rows = await all<{ id: string; name: string; kind: AccountKind; number: string | null; ledger_code: string | null; opening_balance: number; active: number; inflow: number; outflow: number }>(
    `SELECT a.*, COALESCE((SELECT SUM(amount) FROM fin_transactions t WHERE t.account_id = a.id AND t.status = 'posted' AND t.direction = 'in'), 0) AS inflow,
            COALESCE((SELECT SUM(amount) FROM fin_transactions t WHERE t.account_id = a.id AND t.status = 'posted' AND t.direction = 'out'), 0) AS outflow
     FROM fin_accounts a ORDER BY a.active DESC, a.name`,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.kind, number: r.number, ledgerCode: r.ledger_code, opening: Number(r.opening_balance), active: !!r.active, balance: round2(Number(r.opening_balance) + Number(r.inflow) - Number(r.outflow)) }));
}

export async function saveAccount(user: AppUser, input: { id?: string | null; name: string; kind: string; number?: string | null; ledgerCode?: string | null; opening?: number; active?: boolean }) {
  need(user, "approve", "manage money accounts");
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the account.");
  const kind = (input.kind in ACCOUNT_KINDS ? input.kind : "bank") as AccountKind;
  const vals = [name, kind, clean(input.number, 40) || null, clean(input.ledgerCode, 20) || null, round2(Number(input.opening) || 0), input.active === false ? 0 : 1];
  if (input.id) await run("UPDATE fin_accounts SET name = ?, kind = ?, number = ?, ledger_code = ?, opening_balance = ?, active = ? WHERE id = ?", ...vals, input.id);
  else await run("INSERT INTO fin_accounts (id, name, kind, number, ledger_code, opening_balance, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("acc_"), ...vals, nowIso());
  await audit({ actor: user }, { action: "finance.account", summary: `${user.name} ${input.id ? "updated" : "added"} the account ${name}` });
}

export async function listParties(user: AppUser) {
  need(user, "view", "see vendors and customers");
  return all<{ id: string; kind: PartyKind; name: string; tin: string | null; phone: string | null; email: string | null; bank: string | null; bank_account: string | null; active: number }>("SELECT * FROM fin_parties ORDER BY active DESC, name");
}

export async function saveParty(user: AppUser, input: { id?: string | null; kind: string; name: string; tin?: string; phone?: string; email?: string; bank?: string; bankAccount?: string; active?: boolean }) {
  need(user, "access", "manage vendors and customers");
  const name = clean(input.name, 120);
  if (!name) throw new WorkflowError("VALIDATION", "Enter the name.");
  const kind = (input.kind in PARTY_KINDS ? input.kind : "vendor") as PartyKind;
  const vals = [kind, name, clean(input.tin, 30) || null, clean(input.phone, 40) || null, clean(input.email, 120) || null, clean(input.bank, 80) || null, clean(input.bankAccount, 40) || null, input.active === false ? 0 : 1];
  if (input.id) await run("UPDATE fin_parties SET kind = ?, name = ?, tin = ?, phone = ?, email = ?, bank = ?, bank_account = ?, active = ? WHERE id = ?", ...vals, input.id);
  else await run("INSERT INTO fin_parties (id, kind, name, tin, phone, email, bank, bank_account, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("pty_"), ...vals, nowIso());
}

// ---------------------------------------------------------------------------
// The journal
// ---------------------------------------------------------------------------

export type TxInput = {
  date: string;
  direction: "in" | "out";
  amount: number;
  accountId: string;
  ledgerCode?: string | null;
  partyId?: string | null;
  department?: string | null;
  project?: string | null;
  product?: string | null;
  channel?: string | null;
  description?: string | null;
  reference?: string | null;
};

async function post(user: AppUser, input: TxInput, source = "manual", sourceId: string | null = null, transferId: string | null = null) {
  if (!isDay(input.date)) throw new WorkflowError("VALIDATION", "Choose the date.");
  await needOpen(input.date);
  if (!(await get("SELECT 1 AS x FROM fin_accounts WHERE id = ? AND active = 1", input.accountId))) throw new WorkflowError("VALIDATION", "Choose an active money account.");
  const id = uid("ftx_");
  await run(
    `INSERT INTO fin_transactions (id, date, direction, amount, account_id, ledger_code, party_id, department, project, product, channel, description, reference, source, source_id, transfer_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.date,
    input.direction === "in" ? "in" : "out",
    amountOf(input.amount),
    input.accountId,
    clean(input.ledgerCode, 20) || null,
    input.partyId || null,
    clean(input.department, 60) || null,
    clean(input.project, 80) || null,
    clean(input.product, 80) || null,
    clean(input.channel, 80) || null,
    clean(input.description, 300) || null,
    clean(input.reference, 80) || null,
    source,
    sourceId,
    transferId,
    user.id,
    nowIso(),
  );
  return id;
}

export async function postTransaction(user: AppUser, input: TxInput) {
  need(user, "access", "record payments");
  const id = await post(user, input);
  await audit({ actor: user }, { action: "finance.tx", summary: `${user.name} recorded ${input.direction === "in" ? "money in" : "a payment"} of ${round2(input.amount)} on ${input.date}` });
  return id;
}

export async function transfer(user: AppUser, input: { date: string; amount: number; fromId: string; toId: string; description?: string }) {
  need(user, "access", "move money between accounts");
  if (input.fromId === input.toId) throw new WorkflowError("VALIDATION", "Choose two different accounts.");
  const t = uid("tr_");
  await tx(async () => {
    await post(user, { date: input.date, direction: "out", amount: input.amount, accountId: input.fromId, description: input.description || "Transfer" }, "transfer", null, t);
    await post(user, { date: input.date, direction: "in", amount: input.amount, accountId: input.toId, description: input.description || "Transfer" }, "transfer", null, t);
  });
  await audit({ actor: user }, { action: "finance.tx", summary: `${user.name} moved ${round2(input.amount)} between accounts` });
}

export async function voidTransaction(user: AppUser, id: string) {
  need(user, "approve", "cancel transactions");
  const t = await get<{ date: string; source: string; transfer_id: string | null }>("SELECT date, source, transfer_id FROM fin_transactions WHERE id = ?", id);
  if (!t) throw new WorkflowError("NOT_FOUND", "Transaction not found.");
  await needOpen(t.date);
  if (!["manual", "transfer"].includes(t.source)) throw new WorkflowError("VALIDATION", "Cancel it from the bill, invoice, claim or payroll it came from.");
  if (t.transfer_id) await run("UPDATE fin_transactions SET status = 'void' WHERE transfer_id = ?", t.transfer_id);
  else await run("UPDATE fin_transactions SET status = 'void' WHERE id = ?", id);
  await audit({ actor: user }, { action: "finance.tx", summary: `${user.name} cancelled a transaction from ${t.date}` });
}

export type TxRow = { id: string; date: string; direction: "in" | "out"; amount: number; account: string | null; ledger_code: string | null; party: string | null; department: string | null; project: string | null; product: string | null; channel: string | null; description: string | null; reference: string | null; source: string; status: string };

export async function listTransactions(user: AppUser, f: { from?: string; to?: string; accountId?: string; direction?: string; q?: string } = {}) {
  need(user, "view", "see transactions");
  const w: string[] = ["1=1"];
  const p: (string | number)[] = [];
  if (isDay(f.from)) (w.push("t.date >= ?"), p.push(f.from));
  if (isDay(f.to)) (w.push("t.date <= ?"), p.push(f.to));
  if (f.accountId) (w.push("t.account_id = ?"), p.push(f.accountId));
  if (f.direction === "in" || f.direction === "out") (w.push("t.direction = ?"), p.push(f.direction));
  if (f.q?.trim()) (w.push("(t.description ILIKE ? OR t.reference ILIKE ? OR p.name ILIKE ?)"), p.push(...Array(3).fill(`%${f.q.trim()}%`)));
  return all<TxRow>(
    `SELECT t.id, t.date, t.direction, t.amount, a.name AS account, t.ledger_code, p.name AS party, t.department, t.project, t.product, t.channel, t.description, t.reference, t.source, t.status
     FROM fin_transactions t LEFT JOIN fin_accounts a ON a.id = t.account_id LEFT JOIN fin_parties p ON p.id = t.party_id
     WHERE ${w.join(" AND ")} ORDER BY t.date DESC, t.created_at DESC LIMIT 2000`,
    ...p,
  );
}

// ---------------------------------------------------------------------------
// Bills (what we owe)
// ---------------------------------------------------------------------------

export async function listBills(user: AppUser) {
  need(user, "view", "see bills");
  return all<{ id: string; vendor: string | null; vendor_id: string | null; number: string | null; date: string; due_date: string | null; amount: number; ledger_code: string | null; department: string | null; project: string | null; description: string | null; status: string; recurring: string | null; file_name: string | null; created_by_name: string | null; approved_by_name: string | null; created_by: string | null }>(
    `SELECT b.id, p.name AS vendor, b.vendor_id, b.number, b.date, b.due_date, b.amount, b.ledger_code, b.department, b.project, b.description, b.status, b.recurring, b.file_name, b.created_by,
            c.name AS created_by_name, a.name AS approved_by_name
     FROM fin_bills b LEFT JOIN fin_parties p ON p.id = b.vendor_id LEFT JOIN users c ON c.id = b.created_by LEFT JOIN users a ON a.id = b.approved_by
     ORDER BY CASE b.status WHEN 'awaiting_approval' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, COALESCE(b.due_date, b.date)`,
  );
}

export async function saveBill(user: AppUser, input: { id?: string | null; vendorId?: string | null; number?: string; date: string; dueDate?: string | null; amount: number; ledgerCode?: string; department?: string; project?: string; description?: string; recurring?: string | null; purchaseId?: string | null; file?: { name: string; mime: string; base64: string } | null }) {
  need(user, "access", "record bills");
  if (!isDay(input.date)) throw new WorkflowError("VALIDATION", "Choose the bill date.");
  const amount = amountOf(input.amount);
  if (input.file && input.file.base64.length > 11_000_000) throw new WorkflowError("VALIDATION", "Attachments are limited to 8 MB.");
  const now = nowIso();
  const vals = [input.vendorId || null, clean(input.number, 40) || null, input.date, isDay(input.dueDate) ? input.dueDate : null, amount, clean(input.ledgerCode, 20) || "60000", clean(input.department, 60) || null, clean(input.project, 80) || null, clean(input.description, 300) || null, input.recurring === "monthly" ? "monthly" : null];
  if (input.id) {
    const b = await get<{ status: string }>("SELECT status FROM fin_bills WHERE id = ?", input.id);
    if (!b || b.status !== "awaiting_approval") throw new WorkflowError("INVALID_STATE", "Only bills waiting for approval can be changed.");
    await run("UPDATE fin_bills SET vendor_id = ?, number = ?, date = ?, due_date = ?, amount = ?, ledger_code = ?, department = ?, project = ?, description = ?, recurring = ?, updated_at = ? WHERE id = ?", ...vals, now, input.id);
    return input.id;
  }
  const id = uid("bil_");
  await run(
    "INSERT INTO fin_bills (id, vendor_id, number, date, due_date, amount, ledger_code, department, project, description, recurring, purchase_id, file_name, file_mime, file_data, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    ...vals,
    input.purchaseId ?? null,
    input.file?.name.slice(0, 160) ?? null,
    input.file?.mime.slice(0, 100) ?? null,
    input.file?.base64 ?? null,
    user.id,
    now,
    now,
  );
  await notify((await financeIds("finance.approve")).filter((x) => x !== user.id), { type: "approval", title: "Bill to approve", body: `${clean(input.description, 80) || "A bill"}: ${amount}`, link: "/finance?tab=bills", groupKey: "fin-bills" }, now, user.id);
  await audit({ actor: user }, { action: "finance.bill", summary: `${user.name} recorded a bill of ${amount}` });
  return id;
}

export async function approveBill(user: AppUser, id: string, approve: boolean) {
  const b = await get<{ status: string; created_by: string | null; amount: number }>("SELECT status, created_by, amount FROM fin_bills WHERE id = ?", id);
  if (!b || b.status !== "awaiting_approval") throw new WorkflowError("INVALID_STATE", "This bill is not waiting for approval.");
  const s = await financeSettings();
  if (b.amount > s.approvalLimit) need(user, "approve", "approve bills above the limit");
  else need(user, "access", "approve bills");
  if (b.created_by === user.id) throw new WorkflowError("FORBIDDEN", "Someone else approves a bill you recorded.");
  await run("UPDATE fin_bills SET status = ?, approved_by = ?, updated_at = ? WHERE id = ?", approve ? "approved" : "void", user.id, nowIso(), id);
  await audit({ actor: user }, { action: "finance.bill", summary: `${user.name} ${approve ? "approved" : "cancelled"} a bill of ${b.amount}` });
}

export async function payBill(user: AppUser, id: string, input: { accountId: string; date: string; reference?: string }) {
  need(user, "access", "pay bills");
  const b = await get<{ status: string; vendor_id: string | null; amount: number; ledger_code: string | null; department: string | null; project: string | null; description: string | null; number: string | null; recurring: string | null; date: string; due_date: string | null }>(
    "SELECT * FROM fin_bills WHERE id = ?",
    id,
  );
  if (!b || b.status !== "approved") throw new WorkflowError("INVALID_STATE", "Approve the bill before paying it.");
  await tx(async () => {
    const t = await post(user, { date: input.date, direction: "out", amount: b.amount, accountId: input.accountId, ledgerCode: b.ledger_code, partyId: b.vendor_id, department: b.department, project: b.project, description: b.description, reference: input.reference || b.number }, "bill", id);
    await run("UPDATE fin_bills SET status = 'paid', paid_tx_id = ?, updated_at = ? WHERE id = ?", t, nowIso(), id);
    // A monthly bill comes back next month for approval.
    if (b.recurring === "monthly") {
      const shift = (d: string | null) => {
        if (!d) return null;
        const x = new Date(`${d}T00:00:00Z`);
        x.setUTCMonth(x.getUTCMonth() + 1);
        return x.toISOString().slice(0, 10);
      };
      await run(
        "INSERT INTO fin_bills (id, vendor_id, number, date, due_date, amount, ledger_code, department, project, description, recurring, created_by, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, 'monthly', ?, ?, ?)",
        uid("bil_"),
        b.vendor_id,
        shift(b.date),
        shift(b.due_date),
        b.amount,
        b.ledger_code,
        b.department,
        b.project,
        b.description,
        user.id,
        nowIso(),
        nowIso(),
      );
    }
  });
  await audit({ actor: user }, { action: "finance.bill", summary: `${user.name} paid a bill of ${b.amount}` });
}

export async function billFile(user: AppUser, id: string) {
  need(user, "view", "open bills");
  const b = await get<{ file_name: string | null; file_mime: string | null; file_data: string | null }>("SELECT file_name, file_mime, file_data FROM fin_bills WHERE id = ?", id);
  return b?.file_data ? { name: b.file_name ?? "bill", mime: b.file_mime ?? "application/octet-stream", data: Buffer.from(b.file_data, "base64") } : null;
}

// ---------------------------------------------------------------------------
// Invoices (what we are owed)
// ---------------------------------------------------------------------------

export type InvoiceLine = { description: string; qty: number; price: number };

export async function listInvoices(user: AppUser) {
  need(user, "view", "see invoices");
  return all<{ id: string; number: string; customer: string | null; customer_id: string | null; date: string; due_date: string | null; lines: string; amount: number; vat: number; product: string | null; channel: string | null; department: string | null; status: string }>(
    `SELECT i.*, p.name AS customer FROM fin_invoices i LEFT JOIN fin_parties p ON p.id = i.customer_id
     ORDER BY CASE i.status WHEN 'sent' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, i.date DESC`,
  );
}

export async function saveInvoice(user: AppUser, input: { id?: string | null; customerId?: string | null; date: string; dueDate?: string | null; lines: InvoiceLine[]; withVat?: boolean; product?: string; channel?: string; department?: string }) {
  need(user, "access", "write invoices");
  if (!isDay(input.date)) throw new WorkflowError("VALIDATION", "Choose the invoice date.");
  const lines = input.lines.map((l) => ({ description: clean(l.description, 200), qty: Math.max(0, Number(l.qty) || 0), price: round2(Number(l.price) || 0) })).filter((l) => l.description && l.qty > 0);
  if (!lines.length) throw new WorkflowError("VALIDATION", "Add at least one line.");
  const sub = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
  const s = await financeSettings();
  const vat = input.withVat ? round2((sub * s.vatRate) / 100) : 0;
  const now = nowIso();
  const vals = [input.customerId || null, input.date, isDay(input.dueDate) ? input.dueDate : null, JSON.stringify(lines), round2(sub + vat), vat, clean(input.product, 80) || null, clean(input.channel, 80) || null, clean(input.department, 60) || null];
  if (input.id) {
    const i = await get<{ status: string }>("SELECT status FROM fin_invoices WHERE id = ?", input.id);
    if (!i || i.status !== "draft") throw new WorkflowError("INVALID_STATE", "Only draft invoices can be changed.");
    await run("UPDATE fin_invoices SET customer_id = ?, date = ?, due_date = ?, lines = ?, amount = ?, vat = ?, product = ?, channel = ?, department = ?, updated_at = ? WHERE id = ?", ...vals, now, input.id);
    return input.id;
  }
  const year = input.date.slice(0, 4);
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_invoices WHERE number LIKE ?", `INV-${year}-%`))?.c ?? 0) + 1;
  const id = uid("inv_");
  await run(
    "INSERT INTO fin_invoices (id, number, customer_id, date, due_date, lines, amount, vat, product, channel, department, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    `INV-${year}-${String(n).padStart(4, "0")}`,
    ...vals,
    user.id,
    now,
    now,
  );
  await audit({ actor: user }, { action: "finance.invoice", summary: `${user.name} wrote an invoice for ${round2(sub + vat)}` });
  return id;
}

export async function setInvoiceStatus(user: AppUser, id: string, status: "sent" | "void") {
  need(user, "access", "send invoices");
  if (status === "void") need(user, "approve", "cancel invoices");
  await run("UPDATE fin_invoices SET status = ?, updated_at = ? WHERE id = ? AND status IN ('draft','sent')", status, nowIso(), id);
}

export async function receiveInvoice(user: AppUser, id: string, input: { accountId: string; date: string; reference?: string }) {
  need(user, "access", "record payments received");
  const i = await get<{ status: string; customer_id: string | null; amount: number; product: string | null; channel: string | null; department: string | null; number: string }>("SELECT * FROM fin_invoices WHERE id = ?", id);
  if (!i || !["sent", "draft"].includes(i.status)) throw new WorkflowError("INVALID_STATE", "This invoice is already paid or cancelled.");
  await tx(async () => {
    const t = await post(user, { date: input.date, direction: "in", amount: i.amount, accountId: input.accountId, ledgerCode: "40000", partyId: i.customer_id, department: i.department, product: i.product, channel: i.channel, description: `Invoice ${i.number}`, reference: input.reference || i.number }, "invoice", id);
    await run("UPDATE fin_invoices SET status = 'paid', paid_tx_id = ?, updated_at = ? WHERE id = ?", t, nowIso(), id);
  });
  await audit({ actor: user }, { action: "finance.invoice", summary: `${user.name} recorded payment of invoice ${i.number}` });
}

// ---------------------------------------------------------------------------
// Expense claims: line manager (or team lead), then Finance, then paid
// ---------------------------------------------------------------------------

async function lineManagerOf(user: AppUser) {
  const m = await get<{ user_id: string | null }>("SELECT m.user_id FROM employees e JOIN employees m ON m.id = e.manager_id WHERE e.user_id = ? AND m.status <> 'left'", user.id);
  if (m?.user_id && m.user_id !== user.id) return m.user_id;
  const stage = STAGES.find((s) => user.roles.includes(s));
  if (stage) {
    const lead = await get<{ user_id: string }>("SELECT user_id FROM team_leads WHERE stage = ? AND user_id <> ? LIMIT 1", stage, user.id);
    if (lead) return lead.user_id;
  }
  return null;
}

export async function submitClaim(user: AppUser, input: { date: string; amount: number; ledgerCode?: string; department?: string; project?: string; description: string; receipt?: { name: string; mime: string; base64: string } | null }) {
  if (!isDay(input.date)) throw new WorkflowError("VALIDATION", "Choose the date you spent it.");
  const amount = amountOf(input.amount);
  const description = clean(input.description, 300);
  if (!description) throw new WorkflowError("VALIDATION", "Say what it was for.");
  if (input.receipt && input.receipt.base64.length > 11_000_000) throw new WorkflowError("VALIDATION", "Receipts are limited to 8 MB.");
  const approver = await lineManagerOf(user);
  const id = uid("clm_");
  const now = nowIso();
  await run(
    "INSERT INTO fin_claims (id, user_id, date, amount, ledger_code, department, project, description, receipt_name, receipt_mime, receipt_data, status, approver_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    user.id,
    input.date,
    amount,
    clean(input.ledgerCode, 20) || "60000",
    clean(input.department, 60) || null,
    clean(input.project, 80) || null,
    description,
    input.receipt?.name.slice(0, 160) ?? null,
    input.receipt?.mime.slice(0, 100) ?? null,
    input.receipt?.base64 ?? null,
    approver ? "submitted" : "lead_approved",
    approver,
    now,
    now,
  );
  await notify(approver ? [approver] : await financeIds("finance.access"), { type: "approval", title: `Expense claim from ${user.name}`, body: `${description}: ${amount}`, link: approver ? "/pay?tab=approve" : "/finance?tab=claims" }, now, user.id);
  return id;
}

export async function decideClaim(user: AppUser, id: string, input: { approve: boolean; note?: string }) {
  const c = await get<{ status: string; user_id: string; approver_id: string | null; amount: number; description: string }>("SELECT status, user_id, approver_id, amount, description FROM fin_claims WHERE id = ?", id);
  if (!c) throw new WorkflowError("NOT_FOUND", "Claim not found.");
  if (c.user_id === user.id) throw new WorkflowError("FORBIDDEN", "Someone else approves your own claim.");
  if (!input.approve && !clean(input.note)) throw new WorkflowError("VALIDATION", "Say why it is not approved.");
  const now = nowIso();
  if (c.status === "submitted") {
    if (c.approver_id !== user.id && !rights(user).approve) throw new WorkflowError("FORBIDDEN", "Their line manager decides this first.");
    await run("UPDATE fin_claims SET status = ?, lead_by = ?, lead_at = ?, note = ?, updated_at = ? WHERE id = ?", input.approve ? "lead_approved" : "rejected", user.id, now, clean(input.note, 300) || null, now, id);
    if (input.approve) await notify(await financeIds("finance.access"), { type: "approval", title: "Expense claim to check", body: `${c.description}: ${c.amount}`, link: "/finance?tab=claims", groupKey: "fin-claims" }, now, user.id);
  } else if (c.status === "lead_approved") {
    const s = await financeSettings();
    need(user, c.amount > s.approvalLimit ? "approve" : "access", "approve claims");
    await run("UPDATE fin_claims SET status = ?, finance_by = ?, finance_at = ?, note = ?, updated_at = ? WHERE id = ?", input.approve ? "approved" : "rejected", user.id, now, clean(input.note, 300) || null, now, id);
  } else throw new WorkflowError("INVALID_STATE", "This claim is already decided.");
  await notify([c.user_id], { type: "approval", title: input.approve ? "Expense claim approved" : "Expense claim not approved", body: input.approve ? c.description : clean(input.note), link: "/pay" }, now, user.id);
}

export async function payClaim(user: AppUser, id: string, input: { accountId: string; date: string }) {
  need(user, "access", "pay claims");
  const c = await get<{ status: string; user_id: string; amount: number; ledger_code: string | null; department: string | null; project: string | null; description: string; name: string }>(
    "SELECT c.*, u.name FROM fin_claims c JOIN users u ON u.id = c.user_id WHERE c.id = ?",
    id,
  );
  if (!c || c.status !== "approved") throw new WorkflowError("INVALID_STATE", "Approve the claim before paying it.");
  await tx(async () => {
    const t = await post(user, { date: input.date, direction: "out", amount: c.amount, accountId: input.accountId, ledgerCode: c.ledger_code, department: c.department, project: c.project, description: `Claim: ${c.name}, ${c.description}` }, "claim", id);
    await run("UPDATE fin_claims SET status = 'paid', paid_tx_id = ?, updated_at = ? WHERE id = ?", t, nowIso(), id);
  });
  await notify([c.user_id], { type: "approval", title: "Expense claim paid", body: `${c.description}: ${c.amount}`, link: "/pay" }, nowIso(), user.id);
}

export async function listClaims(user: AppUser, scope: "mine" | "toApprove" | "finance") {
  if (scope === "finance") need(user, "view", "see claims");
  const where = scope === "mine" ? "c.user_id = ?" : scope === "toApprove" ? "c.approver_id = ? AND c.status = 'submitted'" : "1=1";
  return all<{ id: string; name: string; date: string; amount: number; ledger_code: string | null; department: string | null; description: string; receipt_name: string | null; status: string; note: string | null; created_at: string; user_id: string }>(
    `SELECT c.id, u.name, c.date, c.amount, c.ledger_code, c.department, c.description, c.receipt_name, c.status, c.note, c.created_at, c.user_id FROM fin_claims c JOIN users u ON u.id = c.user_id
     WHERE ${where} ORDER BY CASE c.status WHEN 'submitted' THEN 0 WHEN 'lead_approved' THEN 1 WHEN 'approved' THEN 2 ELSE 3 END, c.created_at DESC LIMIT 500`,
    ...(scope === "finance" ? [] : [user.id]),
  );
}

export async function claimReceipt(user: AppUser, id: string) {
  const c = await get<{ user_id: string; approver_id: string | null; receipt_name: string | null; receipt_mime: string | null; receipt_data: string | null }>("SELECT user_id, approver_id, receipt_name, receipt_mime, receipt_data FROM fin_claims WHERE id = ?", id);
  if (!c?.receipt_data) return null;
  if (c.user_id !== user.id && c.approver_id !== user.id && !rights(user).view) return null;
  return { name: c.receipt_name ?? "receipt", mime: c.receipt_mime ?? "application/octet-stream", data: Buffer.from(c.receipt_data, "base64") };
}

// ---------------------------------------------------------------------------
// Purchasing: request, approve, order, receive, bill
// ---------------------------------------------------------------------------

export async function requestPurchase(user: AppUser, input: { title: string; department?: string; project?: string; lines: InvoiceLine[]; vendorId?: string | null; note?: string }) {
  const title = clean(input.title, 120);
  if (!title) throw new WorkflowError("VALIDATION", "Say what you want to buy.");
  const lines = input.lines.map((l) => ({ description: clean(l.description, 200), qty: Math.max(0, Number(l.qty) || 0), price: round2(Number(l.price) || 0) })).filter((l) => l.description && l.qty > 0);
  if (!lines.length) throw new WorkflowError("VALIDATION", "Add at least one item.");
  const estimate = round2(lines.reduce((a, l) => a + l.qty * l.price, 0));
  const year = today().slice(0, 4);
  const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_purchases WHERE number LIKE ?", `PR-${year}-%`))?.c ?? 0) + 1;
  const id = uid("pur_");
  const now = nowIso();
  await run(
    "INSERT INTO fin_purchases (id, number, requester_id, department, project, title, lines, estimate, vendor_id, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    `PR-${year}-${String(n).padStart(4, "0")}`,
    user.id,
    clean(input.department, 60) || null,
    clean(input.project, 80) || null,
    title,
    JSON.stringify(lines),
    estimate,
    input.vendorId || null,
    clean(input.note, 500) || null,
    now,
    now,
  );
  await notify(await financeIds("finance.access"), { type: "approval", title: `Purchase request: ${title}`, body: `${user.name}, about ${estimate}`, link: "/finance?tab=purchasing", groupKey: "fin-purchases" }, now, user.id);
  return id;
}

export async function listPurchases(user: AppUser, mine = false) {
  if (!mine) need(user, "view", "see purchasing");
  return all<{ id: string; number: string; requester: string | null; requester_id: string | null; department: string | null; project: string | null; title: string; lines: string; estimate: number; vendor: string | null; vendor_id: string | null; status: string; note: string | null; received_note: string | null; created_at: string }>(
    `SELECT pr.*, u.name AS requester, v.name AS vendor FROM fin_purchases pr LEFT JOIN users u ON u.id = pr.requester_id LEFT JOIN fin_parties v ON v.id = pr.vendor_id
     ${mine ? "WHERE pr.requester_id = ?" : ""} ORDER BY CASE pr.status WHEN 'submitted' THEN 0 WHEN 'approved' THEN 1 WHEN 'ordered' THEN 2 WHEN 'received' THEN 3 ELSE 4 END, pr.created_at DESC LIMIT 500`,
    ...(mine ? [user.id] : []),
  );
}

export async function movePurchase(user: AppUser, id: string, input: { step: "approve" | "reject" | "order" | "receive" | "bill"; vendorId?: string | null; note?: string; amount?: number; date?: string }) {
  const p = await get<{ status: string; requester_id: string | null; estimate: number; title: string; vendor_id: string | null; department: string | null; project: string | null; number: string }>("SELECT * FROM fin_purchases WHERE id = ?", id);
  if (!p) throw new WorkflowError("NOT_FOUND", "Purchase not found.");
  const now = nowIso();
  const s = await financeSettings();
  switch (input.step) {
    case "approve":
    case "reject":
      if (p.status !== "submitted") throw new WorkflowError("INVALID_STATE", "It is already decided.");
      need(user, p.estimate > s.approvalLimit ? "approve" : "access", "approve purchases");
      if (p.requester_id === user.id) throw new WorkflowError("FORBIDDEN", "Someone else approves your own request.");
      if (input.step === "reject" && !clean(input.note)) throw new WorkflowError("VALIDATION", "Say why it is not approved.");
      await run("UPDATE fin_purchases SET status = ?, approved_by = ?, note = COALESCE(?, note), updated_at = ? WHERE id = ?", input.step === "approve" ? "approved" : "rejected", user.id, clean(input.note, 500) || null, now, id);
      break;
    case "order":
      need(user, "access", "place orders");
      if (p.status !== "approved") throw new WorkflowError("INVALID_STATE", "Approve it before ordering.");
      await run("UPDATE fin_purchases SET status = 'ordered', vendor_id = COALESCE(?, vendor_id), ordered_at = ?, updated_at = ? WHERE id = ?", input.vendorId || null, now, now, id);
      break;
    case "receive":
      if (p.status !== "ordered") throw new WorkflowError("INVALID_STATE", "It has not been ordered yet.");
      if (p.requester_id !== user.id && !rights(user).access) throw new WorkflowError("FORBIDDEN", "The requester or Finance confirms delivery.");
      await run("UPDATE fin_purchases SET status = 'received', received_at = ?, received_note = ?, updated_at = ? WHERE id = ?", now, clean(input.note, 300) || null, now, id);
      break;
    case "bill": {
      need(user, "access", "record bills");
      if (p.status !== "received") throw new WorkflowError("INVALID_STATE", "Confirm delivery before billing.");
      const amount = amountOf(input.amount ?? p.estimate);
      // Invoice matching: a bill far from the approved estimate is flagged in its description.
      const off = Math.abs(amount - p.estimate) / Math.max(1, p.estimate);
      const billId = await saveBill(user, {
        vendorId: p.vendor_id,
        date: isDay(input.date) ? input.date : today(),
        amount,
        department: p.department ?? undefined,
        project: p.project ?? undefined,
        description: `${p.number} ${p.title}${off > 0.05 ? ` (differs from the approved ${p.estimate} by ${Math.round(off * 100)}%)` : ""}`,
        purchaseId: id,
        ledgerCode: "64000",
      });
      await run("UPDATE fin_purchases SET status = 'billed', bill_id = ?, updated_at = ? WHERE id = ?", billId, now, id);
      break;
    }
  }
  if (p.requester_id && p.requester_id !== user.id) await notify([p.requester_id], { type: "approval", title: `Purchase ${p.number}: ${input.step === "reject" ? "not approved" : input.step === "approve" ? "approved" : input.step === "order" ? "ordered" : input.step === "receive" ? "received" : "billed"}`, body: p.title, link: "/pay?tab=purchases" }, now, user.id);
  await audit({ actor: user }, { action: "finance.purchase", summary: `${user.name}: ${input.step} ${p.number}` });
}

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

// Spend counts payments from the journal (not transfers or payroll, which is counted from payslips) for the
// budget's year, matched on department or project.
async function spentFor(scopeType: string, scopeKey: string, year: number) {
  const col = scopeType === "department" ? "department" : "project";
  const r = await get<{ s: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM fin_transactions WHERE status = 'posted' AND direction = 'out' AND source NOT IN ('transfer','payroll') AND ${col} = ? AND date >= ? AND date <= ?`,
    scopeKey,
    `${year}-01-01`,
    `${year}-12-31`,
  );
  let payroll = 0;
  if (scopeType === "department") {
    const p = await get<{ s: number }>(
      `SELECT COALESCE(SUM(s.gross + s.pension_employer), 0) AS s FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id
       WHERE r.status IN ('paid','locked') AND e.department = ? AND r.period >= ? AND r.period <= ?`,
      scopeKey,
      `${year}-01`,
      `${year}-12`,
    );
    payroll = Number(p?.s ?? 0);
  }
  return round2(Number(r?.s ?? 0) + payroll);
}

export async function listBudgets(user: AppUser, year: number) {
  need(user, "view", "see budgets");
  const rows = await all<{ id: string; scope_type: string; scope_key: string; scope_label: string; year: number; amount: number; alert_pct: number }>("SELECT * FROM fin_budgets WHERE year = ? ORDER BY scope_type, scope_label", year);
  return Promise.all(rows.map(async (b) => ({ ...b, amount: Number(b.amount), spent: await spentFor(b.scope_type, b.scope_key, b.year) })));
}

export async function saveBudget(user: AppUser, input: { scopeType: string; scopeKey: string; scopeLabel: string; year: number; amount: number; alertPct?: number }) {
  need(user, "approve", "set budgets");
  const key = clean(input.scopeKey, 80);
  if (!key) throw new WorkflowError("VALIDATION", "Choose what the budget is for.");
  await run(
    `INSERT INTO fin_budgets (id, scope_type, scope_key, scope_label, year, amount, alert_pct, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (scope_type, scope_key, year) DO UPDATE SET amount = excluded.amount, alert_pct = excluded.alert_pct, scope_label = excluded.scope_label, alerted_pct = 0`,
    uid("bud_"),
    ["department", "project", "campaign", "production"].includes(input.scopeType) ? input.scopeType : "department",
    key,
    clean(input.scopeLabel, 120) || key,
    Math.trunc(input.year),
    amountOf(input.amount),
    Math.min(100, Math.max(10, Math.trunc(Number(input.alertPct) || 80))),
    nowIso(),
  );
  await audit({ actor: user }, { action: "finance.budget", summary: `${user.name} set the ${input.year} budget for ${clean(input.scopeLabel, 120) || key} to ${round2(input.amount)}` });
}

// Daily: tells Finance (and the department's heads) when spend passes the alert level, and again at 100%.
export async function budgetAlerts() {
  const year = new Date().getUTCFullYear();
  const rows = await all<{ id: string; scope_type: string; scope_key: string; scope_label: string; amount: number; alert_pct: number; alerted_pct: number }>("SELECT * FROM fin_budgets WHERE year = ?", year);
  let n = 0;
  for (const b of rows) {
    const pct = Math.floor(((await spentFor(b.scope_type, b.scope_key, year)) / Math.max(1, Number(b.amount))) * 100);
    const level = pct >= 100 ? 100 : pct >= b.alert_pct ? b.alert_pct : 0;
    if (!level || level <= b.alerted_pct) continue;
    const heads = b.scope_type === "department" ? (await all<{ user_id: string }>("SELECT user_id FROM department_positions WHERE department = ? AND position = 'head'", b.scope_key)).map((r) => r.user_id) : [];
    await notify([...(await financeIds("finance.approve")), ...heads], { type: "approval", title: `Budget ${level >= 100 ? "used up" : `at ${pct}%`}: ${b.scope_label}`, body: `${pct}% of ${b.amount} spent in ${year}.`, link: "/finance?tab=budgets", dedupeKey: `budget:${b.id}:${level}` }, nowIso());
    await run("UPDATE fin_budgets SET alerted_pct = ? WHERE id = ?", level, b.id);
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Payroll: HR prepares, Finance checks, the owner approves, Finance pays and closes the month
// ---------------------------------------------------------------------------

export async function payStructures(user: AppUser) {
  need(user, "payroll", "see salaries");
  const rows = await all<{ id: string; code: string; full_name: string; department: string | null; job_title: string | null; basic: number | null; allowances: string | null; deductions: string | null; bank_name: string | null; bank_account: string | null }>(
    `SELECT e.id, e.code, e.full_name, e.department, e.job_title, s.basic, s.allowances, s.deductions, p.bank_name, p.bank_account
     FROM employees e LEFT JOIN fin_pay_structures s ON s.employee_id = e.id LEFT JOIN employee_private p ON p.employee_id = e.id
     WHERE e.status <> 'left' ORDER BY e.full_name`,
  );
  return rows.map((r) => ({ employeeId: r.id, code: r.code, name: r.full_name, department: r.department, jobTitle: r.job_title, basic: r.basic === null ? null : Number(r.basic), allowances: parseJson<PayLine[]>(r.allowances, []), deductions: parseJson<PayLine[]>(r.deductions, []), bank: r.bank_name, account: r.bank_account }));
}

const lines = (v: PayLine[]) =>
  (v ?? [])
    .map((l) => ({ name: clean(l.name, 60), amount: round2(Number(l.amount) || 0), taxable: l.taxable !== false }))
    .filter((l) => l.name && l.amount > 0)
    .slice(0, 12);

export async function savePayStructure(user: AppUser, employeeId: string, input: { basic: number; allowances: PayLine[]; deductions: PayLine[] }) {
  need(user, "payroll", "set salaries");
  const basic = round2(Number(input.basic) || 0);
  if (basic < 0) throw new WorkflowError("VALIDATION", "Enter the basic salary.");
  await run(
    `INSERT INTO fin_pay_structures (employee_id, basic, allowances, deductions, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (employee_id) DO UPDATE SET basic = excluded.basic, allowances = excluded.allowances, deductions = excluded.deductions, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    employeeId,
    basic,
    JSON.stringify(lines(input.allowances)),
    JSON.stringify(lines(input.deductions)),
    user.id,
    nowIso(),
  );
  // The amount itself stays out of the audit log.
  await audit({ actor: user }, { action: "finance.payroll", summary: `${user.name} changed a salary structure` });
}

async function recompute(slipId: string) {
  const s = await financeSettings();
  const p = await get<{ basic: number; allowances: string; deductions: string; overtime_hours: number; overtime_rate: number; unpaid_days: number }>("SELECT * FROM fin_payslips WHERE id = ?", slipId);
  if (!p) return;
  const r = computePay({ basic: Number(p.basic), allowances: parseJson(p.allowances, []), deductions: parseJson(p.deductions, []), overtimeHours: Number(p.overtime_hours), overtimeRate: Number(p.overtime_rate), unpaidDays: Number(p.unpaid_days) }, s);
  await run(
    "UPDATE fin_payslips SET gross = ?, taxable = ?, income_tax = ?, pension_employee = ?, pension_employer = ?, other_deductions = ?, net = ? WHERE id = ?",
    r.gross,
    r.taxable,
    r.incomeTax,
    r.pensionEmployee,
    r.pensionEmployer,
    r.otherDeductions,
    r.net,
    slipId,
  );
}

export async function createPayrollRun(user: AppUser, period: string) {
  need(user, "payroll", "prepare payroll");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new WorkflowError("VALIDATION", "Choose the month.");
  await needOpen(`${period}-01`);
  if (await get("SELECT 1 AS x FROM fin_payroll_runs WHERE period = ?", period)) throw new WorkflowError("VALIDATION", `${period} already has a payroll run.`);
  const people = (await payStructures(user)).filter((p) => p.basic !== null && p.basic > 0);
  if (!people.length) throw new WorkflowError("VALIDATION", "Set salaries in Payroll, Salaries first.");
  const id = uid("prl_");
  const now = nowIso();
  await tx(async () => {
    await run("INSERT INTO fin_payroll_runs (id, period, prepared_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", id, period, user.id, now, now);
    for (const p of people) {
      const sid = uid("psl_");
      await run(
        "INSERT INTO fin_payslips (id, run_id, employee_id, basic, allowances, deductions) VALUES (?, ?, ?, ?, ?, ?)",
        sid,
        id,
        p.employeeId,
        p.basic,
        JSON.stringify(p.allowances),
        JSON.stringify(p.deductions),
      );
      await recompute(sid);
    }
  });
  await audit({ actor: user }, { action: "finance.payroll", summary: `${user.name} started payroll for ${period} (${people.length} people)` });
  return id;
}

export async function updatePayslip(user: AppUser, slipId: string, input: { overtimeHours?: number; overtimeRate?: number; unpaidDays?: number; allowances?: PayLine[]; deductions?: PayLine[] }) {
  need(user, "payroll", "change payslips");
  const s = await get<{ status: string }>("SELECT r.status FROM fin_payslips p JOIN fin_payroll_runs r ON r.id = p.run_id WHERE p.id = ?", slipId);
  if (!s || s.status !== "draft") throw new WorkflowError("INVALID_STATE", "Payslips change only while the run is being prepared.");
  const n = (v: unknown, max: number) => Math.min(max, Math.max(0, Number(v) || 0));
  await run(
    "UPDATE fin_payslips SET overtime_hours = COALESCE(?, overtime_hours), overtime_rate = COALESCE(?, overtime_rate), unpaid_days = COALESCE(?, unpaid_days), allowances = COALESCE(?, allowances), deductions = COALESCE(?, deductions) WHERE id = ?",
    input.overtimeHours === undefined ? null : n(input.overtimeHours, 400),
    input.overtimeRate === undefined ? null : n(input.overtimeRate, 5),
    input.unpaidDays === undefined ? null : n(input.unpaidDays, 31),
    input.allowances ? JSON.stringify(lines(input.allowances)) : null,
    input.deductions ? JSON.stringify(lines(input.deductions)) : null,
    slipId,
  );
  await recompute(slipId);
}

// Overtime hours and unpaid days for every payslip in a draft run, from Attendance (days absent without leave, half
// days and unpaid leave; overtime past the end of each shift). Payslips can still be changed by hand afterwards.
export async function fillFromAttendance(user: AppUser, runId: string) {
  need(user, "payroll", "change payslips");
  const r = await get<{ period: string; status: string }>("SELECT period, status FROM fin_payroll_runs WHERE id = ?", runId);
  if (!r) throw new WorkflowError("NOT_FOUND", "Payroll run not found.");
  if (r.status !== "draft") throw new WorkflowError("INVALID_STATE", "Payslips change only while the run is being prepared.");
  const slips = await all<{ id: string; employee_id: string }>("SELECT id, employee_id FROM fin_payslips WHERE run_id = ?", runId);
  const { payrollFeed } = await import("./attendance");
  const feed = await payrollFeed(r.period, slips.map((s) => s.employee_id));
  let changed = 0;
  for (const s of slips) {
    const f = feed.get(s.employee_id);
    if (!f) continue;
    await run("UPDATE fin_payslips SET overtime_hours = ?, unpaid_days = ? WHERE id = ?", Math.min(400, f.overtimeHours), Math.min(31, f.unpaidDays), s.id);
    await recompute(s.id);
    changed++;
  }
  await audit({ actor: user }, { action: "finance.payroll", summary: `${user.name} filled overtime and unpaid days for ${r.period} from Attendance (${changed} payslips)` });
  return changed;
}

export async function payrollRuns(user: AppUser) {
  need(user, "payroll", "see payroll");
  return all<{ id: string; period: string; status: string; prepared: string | null; checked: string | null; approved: string | null; people: number; gross: number; net: number; tax: number; pension: number; employer: number; prepared_by: string | null; checked_by: string | null }>(
    `SELECT r.id, r.period, r.status, r.prepared_by, r.checked_by, pu.name AS prepared, cu.name AS checked, au.name AS approved,
            COUNT(s.id) AS people, COALESCE(SUM(s.gross),0) AS gross, COALESCE(SUM(s.net),0) AS net, COALESCE(SUM(s.income_tax),0) AS tax,
            COALESCE(SUM(s.pension_employee),0) AS pension, COALESCE(SUM(s.pension_employer),0) AS employer
     FROM fin_payroll_runs r LEFT JOIN fin_payslips s ON s.run_id = r.id LEFT JOIN users pu ON pu.id = r.prepared_by LEFT JOIN users cu ON cu.id = r.checked_by LEFT JOIN users au ON au.id = r.approved_by
     GROUP BY r.id, r.period, r.status, r.prepared_by, r.checked_by, pu.name, cu.name, au.name ORDER BY r.period DESC`,
  );
}

export async function payslipsOf(user: AppUser, runId: string) {
  need(user, "payroll", "see payroll");
  return all<{ id: string; employee_id: string; code: string; name: string; department: string | null; basic: number; allowances: string; deductions: string; overtime_hours: number; overtime_rate: number; unpaid_days: number; gross: number; taxable: number; income_tax: number; pension_employee: number; pension_employer: number; other_deductions: number; net: number; bank_name: string | null; bank_account: string | null }>(
    `SELECT s.*, e.code, e.full_name AS name, e.department, p.bank_name, p.bank_account FROM fin_payslips s JOIN employees e ON e.id = s.employee_id LEFT JOIN employee_private p ON p.employee_id = e.id
     WHERE s.run_id = ? ORDER BY e.full_name`,
    runId,
  );
}

export async function movePayroll(user: AppUser, runId: string, input: { step: "check" | "approve" | "reopen" | "pay" | "lock"; accountId?: string; date?: string; note?: string }) {
  const r = await get<{ status: string; period: string; prepared_by: string | null; checked_by: string | null }>("SELECT status, period, prepared_by, checked_by FROM fin_payroll_runs WHERE id = ?", runId);
  if (!r) throw new WorkflowError("NOT_FOUND", "Payroll run not found.");
  const now = nowIso();
  switch (input.step) {
    case "check":
      need(user, "approve", "check payroll");
      if (r.status !== "draft") throw new WorkflowError("INVALID_STATE", "Only a payroll being prepared can be checked.");
      if (r.prepared_by === user.id) throw new WorkflowError("FORBIDDEN", "Someone other than the preparer checks payroll.");
      await run("UPDATE fin_payroll_runs SET status = 'checked', checked_by = ?, updated_at = ? WHERE id = ?", user.id, now, runId);
      await notify(await financeIds("finance.owner_approve"), { type: "approval", title: `Payroll ${r.period} to approve`, body: "Checked by Finance.", link: "/finance?tab=payroll" }, now, user.id);
      break;
    case "approve":
      need(user, "ownerApprove", "approve payroll");
      if (r.status !== "checked") throw new WorkflowError("INVALID_STATE", "Finance checks payroll before it is approved.");
      if (r.prepared_by === user.id || r.checked_by === user.id) throw new WorkflowError("FORBIDDEN", "The final approval comes from someone who did not prepare or check it.");
      await run("UPDATE fin_payroll_runs SET status = 'approved', approved_by = ?, updated_at = ? WHERE id = ?", user.id, now, runId);
      await notify(await financeIds("finance.approve"), { type: "approval", title: `Payroll ${r.period} approved`, body: "Ready to pay.", link: "/finance?tab=payroll" }, now, user.id);
      break;
    case "reopen":
      if (!["checked", "approved"].includes(r.status)) throw new WorkflowError("INVALID_STATE", "Only checked or approved payroll goes back to preparation.");
      if (!rights(user).approve && !rights(user).ownerApprove) throw new WorkflowError("FORBIDDEN", "Finance or the owner sends payroll back.");
      if (!clean(input.note)) throw new WorkflowError("VALIDATION", "Say what needs to change.");
      await run("UPDATE fin_payroll_runs SET status = 'draft', checked_by = NULL, approved_by = NULL, note = ?, updated_at = ? WHERE id = ?", clean(input.note, 500), now, runId);
      if (r.prepared_by) await notify([r.prepared_by], { type: "approval", title: `Payroll ${r.period} sent back`, body: clean(input.note), link: "/finance?tab=payroll" }, now, user.id);
      break;
    case "pay": {
      need(user, "approve", "pay salaries");
      if (r.status !== "approved") throw new WorkflowError("INVALID_STATE", "The owner approves payroll before it is paid.");
      if (!input.accountId) throw new WorkflowError("VALIDATION", "Choose the account to pay from.");
      const date = isDay(input.date) ? input.date : today();
      const t = (await get<{ net: number; tax: number; pension: number }>(
        "SELECT COALESCE(SUM(net),0) AS net, COALESCE(SUM(income_tax),0) AS tax, COALESCE(SUM(pension_employee + pension_employer),0) AS pension FROM fin_payslips WHERE run_id = ?",
        runId,
      ))!;
      await tx(async () => {
        await post(user, { date, direction: "out", amount: Number(t.net), accountId: input.accountId!, ledgerCode: "61000", description: `Salaries ${r.period}` }, "payroll", runId);
        if (Number(t.tax) > 0) await post(user, { date, direction: "out", amount: Number(t.tax), accountId: input.accountId!, ledgerCode: "23100", description: `Income tax ${r.period}` }, "payroll", runId);
        if (Number(t.pension) > 0) await post(user, { date, direction: "out", amount: Number(t.pension), accountId: input.accountId!, ledgerCode: "23200", description: `Pension ${r.period}` }, "payroll", runId);
        await run("UPDATE fin_payroll_runs SET status = 'paid', paid_by = ?, account_id = ?, updated_at = ? WHERE id = ?", user.id, input.accountId!, now, runId);
      });
      const people = await all<{ user_id: string | null }>("SELECT e.user_id FROM fin_payslips s JOIN employees e ON e.id = s.employee_id WHERE s.run_id = ?", runId);
      await notify(people.map((p) => p.user_id), { type: "approval", title: `Your payslip for ${r.period}`, body: "Your salary has been paid.", link: "/pay?tab=payslips" }, now, user.id);
      break;
    }
    case "lock":
      need(user, "approve", "close payroll");
      if (r.status !== "paid") throw new WorkflowError("INVALID_STATE", "Pay the run before closing it.");
      await run("UPDATE fin_payroll_runs SET status = 'locked', updated_at = ? WHERE id = ?", now, runId);
      await lockPeriod(user, r.period, true);
      break;
  }
  await audit({ actor: user }, { action: "finance.payroll", summary: `${user.name}: payroll ${r.period} ${input.step}` });
}

// The bank's bulk transfer file: one line per person with their account and net pay.
export async function bankFile(user: AppUser, runId: string) {
  need(user, "approve", "export the bank file");
  const rows = await payslipsOf(user, runId);
  const missing = rows.filter((r) => !r.bank_account).map((r) => r.name);
  const csv = [["Employee code", "Name", "Bank", "Account", "Net pay"], ...rows.map((r) => [r.code, r.name, r.bank_name ?? "", r.bank_account ?? "", Number(r.net).toFixed(2)])]
    .map((l) => l.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : String(c))).join(","))
    .join("\r\n");
  return { csv, missing };
}

// A person's own payslips (paid runs only), or any payslip for Payroll and Finance.
export async function myPayslips(user: AppUser) {
  return all<{ id: string; period: string; net: number; gross: number }>(
    `SELECT s.id, r.period, s.net, s.gross FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id
     WHERE e.user_id = ? AND r.status IN ('paid','locked') ORDER BY r.period DESC`,
    user.id,
  );
}

export async function payslip(user: AppUser, id: string) {
  const s = await get<{ id: string; run_id: string; period: string; status: string; user_id: string | null; code: string; name: string; job_title: string | null; department: string | null; basic: number; allowances: string; deductions: string; overtime_hours: number; overtime_rate: number; unpaid_days: number; gross: number; taxable: number; income_tax: number; pension_employee: number; pension_employer: number; other_deductions: number; net: number; tin: string | null; pension_no: string | null; bank_name: string | null; bank_account: string | null }>(
    `SELECT s.*, r.period, r.status, e.user_id, e.code, e.full_name AS name, e.job_title, e.department, p.tin, p.pension_no, p.bank_name, p.bank_account
     FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id LEFT JOIN employee_private p ON p.employee_id = e.id WHERE s.id = ?`,
    id,
  );
  if (!s) return null;
  const own = s.user_id === user.id && ["paid", "locked"].includes(s.status);
  if (!own && !rights(user).payroll) return null;
  const set = await financeSettings();
  return { ...s, allowances: parseJson<PayLine[]>(s.allowances, []), deductions: parseJson<PayLine[]>(s.deductions, []), currency: set.currency, settings: set };
}

// ---------------------------------------------------------------------------
// Reports and the overview
// ---------------------------------------------------------------------------

export type Range = { from: string; to: string };

async function payrollCost(range: Range, department?: string) {
  const r = await get<{ s: number; g: number; e: number }>(
    `SELECT COALESCE(SUM(s.gross + s.pension_employer), 0) AS s, COALESCE(SUM(s.gross),0) AS g, COALESCE(SUM(s.pension_employer),0) AS e
     FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id
     WHERE r.status IN ('paid','locked') AND r.period >= ? AND r.period <= ? ${department ? "AND e.department = ?" : ""}`,
    range.from.slice(0, 7),
    range.to.slice(0, 7),
    ...(department ? [department] : []),
  );
  return { total: Number(r?.s ?? 0), gross: Number(r?.g ?? 0), employer: Number(r?.e ?? 0) };
}

// Revenue and spending for a period: money in (not transfers) is revenue; money out (not transfers or payroll
// remittances) plus the cost of paid payroll is spending.
export async function summary(range: Range) {
  const [inn, out, payroll, byMonth] = await Promise.all([
    get<{ s: number }>("SELECT COALESCE(SUM(amount),0) AS s FROM fin_transactions WHERE status = 'posted' AND direction = 'in' AND source <> 'transfer' AND date >= ? AND date <= ?", range.from, range.to),
    get<{ s: number }>("SELECT COALESCE(SUM(amount),0) AS s FROM fin_transactions WHERE status = 'posted' AND direction = 'out' AND source NOT IN ('transfer','payroll') AND date >= ? AND date <= ?", range.from, range.to),
    payrollCost(range),
    all<{ month: string; dir: string; s: number }>(
      "SELECT SUBSTRING(date FROM 1 FOR 7) AS month, direction AS dir, COALESCE(SUM(amount),0) AS s FROM fin_transactions WHERE status = 'posted' AND source NOT IN ('transfer','payroll') AND date >= ? AND date <= ? GROUP BY 1, 2 ORDER BY 1",
      range.from,
      range.to,
    ),
  ]);
  const pm = await all<{ period: string; s: number }>(
    "SELECT r.period, COALESCE(SUM(s.gross + s.pension_employer),0) AS s FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id WHERE r.status IN ('paid','locked') AND r.period >= ? AND r.period <= ? GROUP BY r.period",
    range.from.slice(0, 7),
    range.to.slice(0, 7),
  );
  const months = [...new Set([...byMonth.map((m) => m.month), ...pm.map((p) => p.period)])].sort();
  return {
    revenue: round2(Number(inn?.s ?? 0)),
    expenses: round2(Number(out?.s ?? 0) + payroll.total),
    payroll: round2(payroll.total),
    byMonth: months.map((m) => ({
      month: m,
      revenue: round2(Number(byMonth.find((x) => x.month === m && x.dir === "in")?.s ?? 0)),
      expenses: round2(Number(byMonth.find((x) => x.month === m && x.dir === "out")?.s ?? 0) + Number(pm.find((p) => p.period === m)?.s ?? 0)),
    })),
  };
}

// Profit and loss per department for a period, with spending per ledger account.
export async function profitAndLoss(user: AppUser, range: Range) {
  need(user, "view", "see reports");
  const depts = await financeDepartments();
  const rows = await all<{ department: string | null; dir: string; ledger_code: string | null; s: number }>(
    "SELECT department, direction AS dir, ledger_code, COALESCE(SUM(amount),0) AS s FROM fin_transactions WHERE status = 'posted' AND source NOT IN ('transfer','payroll') AND date >= ? AND date <= ? GROUP BY 1, 2, 3",
    range.from,
    range.to,
  );
  const pay = await all<{ department: string | null; s: number }>(
    `SELECT e.department, COALESCE(SUM(s.gross + s.pension_employer),0) AS s FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id
     WHERE r.status IN ('paid','locked') AND r.period >= ? AND r.period <= ? GROUP BY e.department`,
    range.from.slice(0, 7),
    range.to.slice(0, 7),
  );
  const keys = [...new Set([...rows.map((r) => r.department ?? ""), ...pay.map((p) => p.department ?? "")])];
  const led = await ledger();
  const byDept = keys.map((k) => {
    const income = rows.filter((r) => (r.department ?? "") === k && r.dir === "in").reduce((a, r) => a + Number(r.s), 0);
    const spend = rows.filter((r) => (r.department ?? "") === k && r.dir === "out").reduce((a, r) => a + Number(r.s), 0);
    const payroll = Number(pay.find((p) => (p.department ?? "") === k)?.s ?? 0);
    return { key: k, label: depts.find((d) => d.key === k)?.label ?? (k || "Not assigned"), income: round2(income), spend: round2(spend), payroll: round2(payroll), net: round2(income - spend - payroll) };
  });
  const byLedger = [...new Set(rows.map((r) => r.ledger_code ?? ""))].map((code) => ({
    code,
    name: led.find((l) => l.code === code)?.name ?? (code || "No account"),
    income: round2(rows.filter((r) => (r.ledger_code ?? "") === code && r.dir === "in").reduce((a, r) => a + Number(r.s), 0)),
    spend: round2(rows.filter((r) => (r.ledger_code ?? "") === code && r.dir === "out").reduce((a, r) => a + Number(r.s), 0)),
  }));
  return { byDept: byDept.sort((a, b) => b.spend + b.payroll - (a.spend + a.payroll)), byLedger: byLedger.sort((a, b) => a.code.localeCompare(b.code)) };
}

// Cost per published video: Production's spending and payroll for the period, divided by what was published;
// also the hours logged on production work, valued at the average hourly cost of Production's people.
export async function costPerVideo(user: AppUser, range: Range) {
  need(user, "view", "see reports");
  const end = `${range.to}T23:59:59.999Z`;
  const [spend, payroll, published, hours] = await Promise.all([
    get<{ s: number }>("SELECT COALESCE(SUM(amount),0) AS s FROM fin_transactions WHERE status = 'posted' AND direction = 'out' AND source NOT IN ('transfer','payroll') AND department = 'production' AND date >= ? AND date <= ?", range.from, range.to),
    payrollCost(range, "production"),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM items WHERE lifecycle = 'published' AND published_at >= ? AND published_at <= ?", `${range.from}T00:00:00.000Z`, end),
    get<{ h: number }>(
      "SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (CAST(COALESCE(ended_at, started_at) AS TIMESTAMP) - CAST(started_at AS TIMESTAMP)))) / 3600.0, 0) AS h FROM work_sessions WHERE started_at >= ? AND started_at <= ?",
      `${range.from}T00:00:00.000Z`,
      end,
    ),
  ]);
  const s = await financeSettings();
  const people = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM employees WHERE department = 'production' AND status <> 'left'"))?.c ?? 0);
  const months = Math.max(1, (Number(range.to.slice(0, 4)) - Number(range.from.slice(0, 4))) * 12 + Number(range.to.slice(5, 7)) - Number(range.from.slice(5, 7)) + 1);
  const hourly = people ? payroll.total / (people * months * s.daysPerMonth * (5 / 7) * s.hoursPerDay) : 0;
  const total = round2(Number(spend?.s ?? 0) + payroll.total);
  const n = Number(published?.c ?? 0);
  return {
    published: n,
    spend: round2(Number(spend?.s ?? 0)),
    payroll: round2(payroll.total),
    total,
    perVideo: n ? round2(total / n) : null,
    hours: round2(Number(hours?.h ?? 0)),
    hourlyCost: round2(hourly),
    timeCostPerVideo: n ? round2((Number(hours?.h ?? 0) * hourly) / n) : null,
  };
}

// Income tax and pension to declare for a month (for ERCA and POESSA).
export async function taxAndPension(user: AppUser, period: string) {
  need(user, "payroll", "see tax and pension");
  return all<{ code: string; name: string; tin: string | null; pension_no: string | null; basic: number; taxable: number; income_tax: number; pension_employee: number; pension_employer: number }>(
    `SELECT e.code, e.full_name AS name, p.tin, p.pension_no, s.basic, s.taxable, s.income_tax, s.pension_employee, s.pension_employer
     FROM fin_payslips s JOIN fin_payroll_runs r ON r.id = s.run_id JOIN employees e ON e.id = s.employee_id LEFT JOIN employee_private p ON p.employee_id = e.id
     WHERE r.period = ? ORDER BY e.full_name`,
    period,
  );
}

export async function financeOverview(user: AppUser) {
  need(user, "view", "see finance");
  const t = today();
  const year = t.slice(0, 4);
  const month = { from: `${t.slice(0, 7)}-01`, to: t };
  const [accounts, monthSum, yearSum, billsDue, receivable, claims, purchases, budgets, runs] = await Promise.all([
    listAccounts(user),
    summary(month),
    summary({ from: `${year}-01-01`, to: t }),
    all<{ id: string; description: string | null; vendor: string | null; amount: number; due_date: string | null; status: string }>(
      "SELECT b.id, b.description, p.name AS vendor, b.amount, b.due_date, b.status FROM fin_bills b LEFT JOIN fin_parties p ON p.id = b.vendor_id WHERE b.status IN ('awaiting_approval','approved') ORDER BY COALESCE(b.due_date, b.date) LIMIT 8",
    ),
    all<{ id: string; number: string; customer: string | null; amount: number; due_date: string | null }>(
      "SELECT i.id, i.number, p.name AS customer, i.amount, i.due_date FROM fin_invoices i LEFT JOIN fin_parties p ON p.id = i.customer_id WHERE i.status = 'sent' ORDER BY i.due_date LIMIT 8",
    ),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_claims WHERE status IN ('lead_approved','approved')"),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_purchases WHERE status IN ('submitted','approved','received')"),
    listBudgets(user, Number(year)),
    get<{ c: number }>("SELECT COUNT(*) AS c FROM fin_payroll_runs WHERE status IN ('draft','checked','approved')"),
  ]);
  return {
    cash: round2(accounts.filter((a) => a.active).reduce((s, a) => s + a.balance, 0)),
    accounts,
    month: monthSum,
    year: yearSum,
    billsDue,
    receivable,
    owed: round2(billsDue.reduce((s, b) => s + Number(b.amount), 0)),
    toCollect: round2(receivable.reduce((s, i) => s + Number(i.amount), 0)),
    claimsWaiting: Number(claims?.c ?? 0),
    purchasesWaiting: Number(purchases?.c ?? 0),
    payrollOpen: Number(runs?.c ?? 0),
    budgets: budgets.map((b) => ({ label: b.scope_label, amount: b.amount, spent: b.spent })).sort((a, b) => b.spent / b.amount - a.spent / a.amount).slice(0, 6),
  };
}

