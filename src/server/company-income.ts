import { all, get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { rights as financeRights } from "./finance";

// Chapa payments and Noor invoice revenue on the Company overview (owners and Finance), read from what is
// already stored (chapa_transactions, cms_daily_metrics). Nothing here calls Chapa or Noor, so opening the
// overview never costs a request to either. Admin or Finance chooses what is shown (cfg.company_income).

export type CompanyIncomeConfig = {
  chapa: boolean;
  noor: boolean;
  // Also show the short version on the Overall view, not only in Finance.
  onOverall: boolean;
  // Chapa businesses left out (for example a test business). Empty: all.
  excludeBusinesses: string[];
};
export const DEFAULT_INCOME_CONFIG: CompanyIncomeConfig = { chapa: true, noor: true, onOverall: true, excludeBusinesses: [] };

export async function companyIncomeConfig(): Promise<CompanyIncomeConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.company_income'");
  return { ...DEFAULT_INCOME_CONFIG, ...parseJson<Partial<CompanyIncomeConfig>>(row?.value ?? "{}", {}) };
}

export const canConfigureIncome = (u: AppUser) => can(u, "users.manage") || can(u, "finance.access");

export async function saveCompanyIncomeConfig(user: AppUser, input: Partial<CompanyIncomeConfig>) {
  if (!canConfigureIncome(user)) throw new WorkflowError("FORBIDDEN", "Only Admin or Finance chooses what the Company overview shows.");
  const cur = await companyIncomeConfig();
  const next: CompanyIncomeConfig = {
    chapa: input.chapa ?? cur.chapa,
    noor: input.noor ?? cur.noor,
    onOverall: input.onOverall ?? cur.onOverall,
    excludeBusinesses: Array.isArray(input.excludeBusinesses) ? input.excludeBusinesses.map(String).slice(0, 50) : cur.excludeBusinesses,
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.company_income', ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  return next;
}

type Money = { currency: string; amount: number; count: number };
export type CompanyIncome = {
  config: CompanyIncomeConfig;
  canConfigure: boolean;
  businesses: { id: string; name: string }[];
  range: { from: string; to: string };
  chapa: null | {
    success: Money[];
    pending: number;
    failed: number;
    refunded: Money[];
    byMonth: { month: string; currency: string; amount: number; count: number }[];
    byBusiness: { id: string; name: string; currency: string; amount: number; count: number }[];
    lastTxAt: string | null;
    lastSyncAt: string | null;
  };
  noor: null | {
    paid: number;
    paidAmount: number;
    pending: number;
    pendingAmount: number;
    failed: number;
    byMonth: { month: string; paidAmount: number; paid: number }[];
    methods: Record<string, number>;
    days: number;
    updatedAt: string | null;
  };
};

const addisStartIso = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 3600e3).toISOString();
const addisEndIso = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 3 * 3600e3 + 864e5).toISOString();

export async function companyIncome(user: AppUser, range: { from: string; to: string }): Promise<CompanyIncome | null> {
  if (!financeRights(user).view) return null;
  const config = await companyIncomeConfig();
  const businesses = await all<{ id: string; name: string }>("SELECT id, name FROM chapa_accounts ORDER BY name").catch(() => []);
  const out: CompanyIncome = { config, canConfigure: canConfigureIncome(user), businesses, range, chapa: null, noor: null };
  const from = addisStartIso(range.from);
  const to = addisEndIso(range.to);

  if (config.chapa) {
    const ex = config.excludeBusinesses.filter((id) => businesses.some((b) => b.id === id));
    const exSql = ex.length ? ` AND t.account_id NOT IN (${ex.map(() => "?").join(",")})` : "";
    const base = [from, to, ...ex];
    const w = `t.created_at >= ? AND t.created_at < ?${exSql}`;
    const [byStatus, byMonth, byBiz, last] = await Promise.all([
      all<{ status: string; currency: string; n: number; s: number }>(`SELECT t.status, t.currency, COUNT(*) AS n, COALESCE(SUM(t.amount),0) AS s FROM chapa_transactions t WHERE ${w} GROUP BY t.status, t.currency`, ...base),
      all<{ m: string; currency: string; n: number; s: number }>(`SELECT SUBSTR(t.created_at,1,7) AS m, t.currency, COUNT(*) AS n, COALESCE(SUM(t.amount),0) AS s FROM chapa_transactions t WHERE ${w} AND t.status = 'success' GROUP BY SUBSTR(t.created_at,1,7), t.currency ORDER BY m`, ...base),
      all<{ id: string; name: string; currency: string; n: number; s: number }>(`SELECT a.id, a.name, t.currency, COUNT(*) AS n, COALESCE(SUM(t.amount),0) AS s FROM chapa_transactions t JOIN chapa_accounts a ON a.id = t.account_id WHERE ${w} AND t.status = 'success' GROUP BY a.id, a.name, t.currency ORDER BY s DESC`, ...base),
      get<{ tx: string | null; sync: string | null }>(`SELECT (SELECT MAX(created_at) FROM chapa_transactions) AS tx, (SELECT MAX(last_ok_sync_at) FROM chapa_accounts) AS sync`),
    ]).catch(() => [[], [], [], null] as const);
    const pick = (st: string) => byStatus.filter((r) => r.status === st).map((r) => ({ currency: r.currency, amount: Number(r.s), count: Number(r.n) }));
    out.chapa = {
      success: pick("success"),
      refunded: pick("refunded"),
      pending: byStatus.filter((r) => r.status === "pending").reduce((a, r) => a + Number(r.n), 0),
      failed: byStatus.filter((r) => r.status === "failed").reduce((a, r) => a + Number(r.n), 0),
      byMonth: byMonth.map((r) => ({ month: r.m, currency: r.currency, amount: Number(r.s), count: Number(r.n) })),
      byBusiness: byBiz.map((r) => ({ id: r.id, name: r.name, currency: r.currency, amount: Number(r.s), count: Number(r.n) })),
      lastTxAt: last?.tx ?? null,
      lastSyncAt: last?.sync ?? null,
    };
  }

  if (config.noor) {
    const rows = await all<{ day: string; metrics_json: string; updated_at: string }>("SELECT day, metrics_json, updated_at FROM cms_daily_metrics WHERE day >= ? AND day <= ? ORDER BY day", range.from, range.to).catch(() => []);
    const n = { paid: 0, paidAmount: 0, pending: 0, pendingAmount: 0, failed: 0, methods: {} as Record<string, number> };
    const months: Record<string, { paidAmount: number; paid: number }> = {};
    let updatedAt: string | null = null;
    for (const r of rows) {
      const m = parseJson<Record<string, any>>(r.metrics_json, {});
      n.paid += Number(m.paid) || 0;
      n.paidAmount += Number(m.paidAmount) || 0;
      n.pending += Number(m.pending) || 0;
      n.pendingAmount += Number(m.pendingAmount) || 0;
      n.failed += Number(m.failed) || 0;
      for (const [k, v] of Object.entries((m.methods ?? {}) as Record<string, number>)) n.methods[k] = (n.methods[k] ?? 0) + (Number(v) || 0);
      const mo = (months[r.day.slice(0, 7)] ??= { paidAmount: 0, paid: 0 });
      mo.paidAmount += Number(m.paidAmount) || 0;
      mo.paid += Number(m.paid) || 0;
      if (!updatedAt || r.updated_at > updatedAt) updatedAt = r.updated_at;
    }
    out.noor = { ...n, byMonth: Object.entries(months).map(([month, v]) => ({ month, ...v })), days: rows.length, updatedAt };
  }
  return out;
}
