import { requireViewer } from "@/server/auth";
import * as f from "@/server/finance";
import { PageHeader } from "@/components/app/primitives";
import { PayHome, type PayTab } from "@/components/app/finance/pay-ui";

export const metadata = { title: "Claims and pay" };

const TABS: PayTab[] = ["claims", "purchases", "payslips", "approve"];

// Everyone's money page: expense claims, purchase requests, payslips, and claims to approve for line managers.
export default async function PayPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const tab = TABS.includes(sp.tab as PayTab) ? (sp.tab as PayTab) : "claims";
  const [claims, purchases, payslips, toApprove, departments, ledger, settings] = await Promise.all([
    f.listClaims(viewer, "mine"),
    f.listPurchases(viewer, true),
    f.myPayslips(viewer),
    f.listClaims(viewer, "toApprove"),
    f.financeDepartments(),
    f.ledger(),
    f.financeSettings(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader help="finance-me" title="Claims and pay" description="Claim expenses, ask to buy things, and read your payslips." />
      <PayHome
        tab={tab}
        claims={claims}
        purchases={purchases}
        payslips={payslips}
        toApprove={toApprove}
        departments={departments.map((d) => ({ value: d.key, label: d.label }))}
        ledger={ledger.filter((l) => l.active && l.type === "expense").map((l) => ({ value: l.code, label: l.name }))}
        cur={settings.currency}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
