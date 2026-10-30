// Finance vocabulary and the payroll arithmetic, shared by the server and the screens.

export const ACCOUNT_KINDS = { bank: "Bank account", cash: "Cash", petty: "Petty cash", mobile: "Mobile money (telebirr, M-Pesa)" } as const;
export type AccountKind = keyof typeof ACCOUNT_KINDS;
export const PARTY_KINDS = { vendor: "Vendor", customer: "Customer", both: "Vendor and customer" } as const;
export type PartyKind = keyof typeof PARTY_KINDS;
export const LEDGER_TYPES = { income: "Income", expense: "Expense", asset: "Asset", liability: "Liability", equity: "Equity" } as const;
export type LedgerType = keyof typeof LEDGER_TYPES;

// A starting chart of accounts (Sage 50 style codes); Finance edits it in Settings.
export const DEFAULT_LEDGER: { code: string; name: string; type: LedgerType }[] = [
  { code: "10100", name: "Cash on hand", type: "asset" },
  { code: "10200", name: "Bank", type: "asset" },
  { code: "10300", name: "Petty cash", type: "asset" },
  { code: "11000", name: "Accounts receivable", type: "asset" },
  { code: "20000", name: "Accounts payable", type: "liability" },
  { code: "23100", name: "Income tax payable", type: "liability" },
  { code: "23200", name: "Pension payable", type: "liability" },
  { code: "40000", name: "Course and subscription sales", type: "income" },
  { code: "40100", name: "Advertising and sponsorship", type: "income" },
  { code: "40200", name: "Grants and partnerships", type: "income" },
  { code: "49000", name: "Other income", type: "income" },
  { code: "60000", name: "General expenses", type: "expense" },
  { code: "61000", name: "Salaries and wages", type: "expense" },
  { code: "61100", name: "Pension (employer)", type: "expense" },
  { code: "62000", name: "Rent and utilities", type: "expense" },
  { code: "63000", name: "Internet and software", type: "expense" },
  { code: "64000", name: "Equipment", type: "expense" },
  { code: "65000", name: "Production costs", type: "expense" },
  { code: "66000", name: "Marketing and advertising", type: "expense" },
  { code: "67000", name: "Travel and transport", type: "expense" },
  { code: "68000", name: "Training", type: "expense" },
  { code: "69000", name: "Bank charges", type: "expense" },
];

export const BILL_STATUSES = { awaiting_approval: "Waiting for approval", approved: "Approved, to pay", paid: "Paid", void: "Cancelled" } as const;
export const INVOICE_STATUSES = { draft: "Draft", sent: "Sent", paid: "Paid", void: "Cancelled" } as const;
export const CLAIM_STATUSES = { submitted: "With line manager", lead_approved: "With Finance", approved: "Approved, to pay", paid: "Paid", rejected: "Not approved" } as const;
export const PURCHASE_STATUSES = { submitted: "Waiting for approval", approved: "Approved", ordered: "Ordered", received: "Received", billed: "Billed", rejected: "Not approved" } as const;
export const PAYROLL_STATUSES = { draft: "Being prepared", checked: "Checked by Finance", approved: "Approved", paid: "Paid", locked: "Locked" } as const;
export const BUDGET_SCOPES = { department: "Department", project: "Project", campaign: "Campaign", production: "Production line" } as const;
export type BudgetScope = keyof typeof BUDGET_SCOPES;

export type TaxBracket = { upTo: number | null; rate: number; deduct: number };
export type FinanceSettings = {
  currency: string;
  // Ethiopian fiscal year starts on Hamle 1 (about 8 July).
  fiscalStartMonth: number;
  vatRate: number;
  pensionEmployee: number;
  pensionEmployer: number;
  // Monthly income tax: the bracket the taxable income falls in gives rate x income - deduction.
  taxBrackets: TaxBracket[];
  daysPerMonth: number;
  hoursPerDay: number;
  // Claims and purchases above this need the Finance Manager (below, an accountant may approve).
  approvalLimit: number;
};

// Monthly brackets of Proclamation 979/2016. Check against the current law and change them in Finance, Settings.
export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  currency: "ETB",
  fiscalStartMonth: 7,
  vatRate: 15,
  pensionEmployee: 7,
  pensionEmployer: 11,
  taxBrackets: [
    { upTo: 600, rate: 0, deduct: 0 },
    { upTo: 1650, rate: 10, deduct: 60 },
    { upTo: 3200, rate: 15, deduct: 142.5 },
    { upTo: 5250, rate: 20, deduct: 302.5 },
    { upTo: 7800, rate: 25, deduct: 565 },
    { upTo: 10900, rate: 30, deduct: 955 },
    { upTo: null, rate: 35, deduct: 1500 },
  ],
  daysPerMonth: 30,
  hoursPerDay: 8,
  approvalLimit: 10000,
};

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function incomeTax(taxable: number, brackets: TaxBracket[]) {
  if (taxable <= 0) return 0;
  const b = brackets.find((x) => x.upTo === null || taxable <= x.upTo) ?? brackets[brackets.length - 1]!;
  return Math.max(0, round2((taxable * b.rate) / 100 - b.deduct));
}

export type PayLine = { name: string; amount: number; taxable?: boolean };

export type PayInput = { basic: number; allowances: PayLine[]; deductions: PayLine[]; overtimeHours: number; overtimeRate: number; unpaidDays: number };
export type PayResult = { overtime: number; unpaid: number; gross: number; taxable: number; incomeTax: number; pensionEmployee: number; pensionEmployer: number; otherDeductions: number; net: number };

// One month's pay: overtime and unpaid days from the basic salary; pension on the basic salary; tax on the taxable
// income (basic, taxable allowances and overtime, less unpaid days).
export function computePay(p: PayInput, s: FinanceSettings): PayResult {
  const daily = p.basic / s.daysPerMonth;
  const overtime = round2((daily / s.hoursPerDay) * p.overtimeRate * p.overtimeHours);
  const unpaid = round2(daily * p.unpaidDays);
  const allow = p.allowances.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const taxableAllow = p.allowances.filter((x) => x.taxable !== false).reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const gross = round2(p.basic + allow + overtime - unpaid);
  const taxable = round2(Math.max(0, p.basic + taxableAllow + overtime - unpaid));
  const tax = incomeTax(taxable, s.taxBrackets);
  const pensionBase = Math.max(0, p.basic - unpaid);
  const pensionEmployee = round2((pensionBase * s.pensionEmployee) / 100);
  const pensionEmployer = round2((pensionBase * s.pensionEmployer) / 100);
  const otherDeductions = round2(p.deductions.reduce((a, x) => a + (Number(x.amount) || 0), 0));
  return { overtime, unpaid, gross, taxable, incomeTax: tax, pensionEmployee, pensionEmployer, otherDeductions, net: round2(gross - tax - pensionEmployee - otherDeductions) };
}

export const money = (n: number, currency = "ETB") => `${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
export const periodOf = (date: string) => date.slice(0, 7);

// Tabs of the Finance page (shared by the server page and the client tabs).
export const FIN_TABS = ["overview", "transactions", "bills", "invoices", "claims", "purchasing", "budgets", "payroll", "parties", "accounts", "reports", "settings"] as const;
export type FinTab = (typeof FIN_TABS)[number];
