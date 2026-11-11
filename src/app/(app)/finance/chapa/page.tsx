import { redirect } from "next/navigation";
import { ArrowLeftRightIcon, BarChart3Icon, CalendarDaysIcon, CoinsIcon, GitCompareIcon, LandmarkIcon, LifeBuoyIcon, ListIcon, RotateCcwIcon, Settings2Icon, UsersIcon, WalletIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { chapaBusinesses, chapaSettings } from "@/server/chapa-hub";
import { can } from "@/server/users";
import { PageHeader, PageTabs, type PageTab } from "@/components/app/page-kit";
import { ChapaHub, type ChapaTab } from "@/components/app/finance/chapa/chapa-hub";

export const metadata = { title: "Chapa" };

// Finance › Chapa (Update 1.0, Phase 3): every Chapa dashboard page the API can serve, for every business,
// with a business switcher ("All businesses" or one), payment follow-up, and Admin's action rules.
export default async function ChapaPage({ searchParams }: { searchParams: Promise<{ tab?: string; biz?: string }> }) {
  const viewer = await requireViewer();
  const admin = can(viewer, "users.manage") || can(viewer, "settings.manage");
  const businesses = await chapaBusinesses(viewer);
  if (!businesses.length && !admin) redirect("/finance?denied=chapa");
  const sp = await searchParams;
  const any = (a: keyof (typeof businesses)[number]["rights"]) => businesses.some((b) => b.rights[a]);
  const tabs: PageTab[] = [
    { key: "overview", label: "Overview", icon: <BarChart3Icon /> },
    { key: "transactions", label: "Transactions", icon: <ListIcon /> },
    { key: "daily", label: "Daily board", icon: <CalendarDaysIcon /> },
    { key: "customers", label: "Customers", icon: <UsersIcon /> },
    { key: "followup", label: "Follow-up", icon: <LifeBuoyIcon />, hidden: !any("send_support") },
    { key: "balance", label: "Balance & swap", icon: <WalletIcon /> },
    { key: "withdrawals", label: "Withdrawals", icon: <LandmarkIcon /> },
    { key: "refunds", label: "Refunds", icon: <RotateCcwIcon /> },
    { key: "funds", label: "Account funds", icon: <CoinsIcon /> },
    { key: "match", label: "Match to Noor", icon: <GitCompareIcon /> },
    { key: "settings", label: "Settings", icon: <Settings2Icon />, hidden: !admin },
  ];
  const tab = (tabs.find((t) => t.key === sp.tab && !t.hidden)?.key ?? "overview") as ChapaTab;
  const biz = sp.biz && businesses.some((b) => b.id === sp.biz) ? sp.biz : "all";
  const qs = (k: string) => `/finance/chapa?tab=${k}${biz !== "all" ? `&biz=${biz}` : ""}`;
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={<span className="flex items-center gap-1.5"><ArrowLeftRightIcon className="size-3.5" /> Finance</span>}
        title="Chapa"
        description="Payments for every business on Chapa: overview, transactions, the daily board, customers, follow-up to Support, balances and withdrawals."
      />
      <PageTabs tabs={tabs} active={tab} href={qs} label="Chapa pages" />
      <ChapaHub tab={tab} biz={biz} businesses={businesses} admin={admin} settings={tab === "settings" ? await chapaSettings() : null} />
    </div>
  );
}
