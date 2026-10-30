import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import * as f from "@/server/finance";
import { PageHeader } from "@/components/app/primitives";
import { FinanceHome } from "@/components/app/finance/finance-ui";
import { FIN_TABS, type FinTab } from "@/lib/finance";

export const metadata = { title: "Finance" };

// Finance: what Finance staff work on, and what owners read. Each tab loads only its own data.
export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const r = f.rights(viewer);
  if (!r.view && !r.payroll && !r.ownerApprove) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const fallback: FinTab = r.view ? "overview" : "payroll";
  const tab: FinTab = (FIN_TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as FinTab) : fallback;
  const today = new Date().toISOString().slice(0, 10);
  const settings = await f.financeSettings();
  const [accounts, parties, ledger, departments] = await Promise.all([
    r.view ? f.listAccounts(viewer) : Promise.resolve([]),
    r.view ? f.listParties(viewer) : Promise.resolve([]),
    f.ledger(),
    f.financeDepartments(),
  ]);
  const day = (k: string, d: string) => (/^\d{4}-\d{2}-\d{2}$/.test(sp[k] ?? "") ? sp[k]! : d);
  const range = { from: day("from", `${today.slice(0, 4)}-01-01`), to: day("to", today) };
  let data: Record<string, unknown> = {};
  switch (tab) {
    case "overview":
      data = { overview: await f.financeOverview(viewer) };
      break;
    case "transactions":
      data = { rows: await f.listTransactions(viewer, { from: sp.from, to: sp.to }) };
      break;
    case "bills":
      data = { rows: await f.listBills(viewer) };
      break;
    case "invoices":
      data = { rows: await f.listInvoices(viewer) };
      break;
    case "claims":
      data = { rows: await f.listClaims(viewer, "finance") };
      break;
    case "purchasing":
      data = { rows: await f.listPurchases(viewer) };
      break;
    case "budgets": {
      const year = Number(sp.year) || Number(today.slice(0, 4));
      data = { rows: await f.listBudgets(viewer, year), year };
      break;
    }
    case "payroll": {
      const runs = r.payroll || r.ownerApprove ? await f.payrollRuns({ ...viewer, perms: [...viewer.perms, "finance.payroll"] }) : [];
      const openId = sp.run ?? runs[0]?.id ?? null;
      data = {
        runs,
        structures: r.payroll ? await f.payStructures(viewer) : [],
        openId,
        open: openId && (r.payroll || r.ownerApprove) ? await f.payslipsOf({ ...viewer, perms: [...viewer.perms, "finance.payroll"] }, openId) : null,
      };
      break;
    }
    case "parties":
      data = { rows: parties };
      break;
    case "accounts":
      data = { rows: accounts };
      break;
    case "reports":
      data = { ...range, pnl: await f.profitAndLoss(viewer, range), cost: await f.costPerVideo(viewer, range), summary: await f.summary(range) };
      break;
    case "settings":
      data = { settings, ledger, periods: await f.lockedPeriods() };
      break;
  }
  return (
    <div className="space-y-4">
      <PageHeader help="finance" title="Finance" description="Money accounts, bills and invoices, claims and purchasing, budgets, payroll and reports. Whoever prepares something does not approve it." />
      <FinanceHome
        tab={tab}
        data={data}
        ctx={{
          rights: r,
          cur: settings.currency,
          accounts: accounts.filter((a) => a.active).map((a) => ({ value: a.id, label: `${a.name} (${a.balance.toLocaleString()})` })),
          parties: parties.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, kind: p.kind })),
          ledger: ledger.filter((l) => l.active).map((l) => ({ value: l.code, label: `${l.code} ${l.name}` })),
          departments: departments.map((d) => ({ value: d.key, label: d.label })),
          today,
        }}
      />
    </div>
  );
}
