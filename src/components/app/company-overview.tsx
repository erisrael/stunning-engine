import type { AppUser } from "@/server/users";
import { companySummary } from "@/server/company";
import { ensureDeptConfigs } from "@/server/dept-config";
import { ownerStats } from "@/server/owners";
import { structureRows } from "@/server/structure";
import { getSettings } from "@/server/settings";
import { StructureDashboard } from "@/components/app/structure-dashboard";
import { Overview, ProductionSection } from "@/app/(app)/owners/owners-client";
import { COMPANY_VIEWS, isPeriod, type CompanyView } from "@/lib/dashboards";
import { CompanyOverall, ViewSwitcher } from "./company-overall";
import { DashFilters } from "./dept-dashboard";
import { DeptDashboardView } from "./dept-dashboard-view";
import { companyFinance, rights as financeRights } from "@/server/finance";
import { CompanyFinance } from "./company-finance";

// The Company overview: switch between the whole company and each department. Used by /company and the Owners page.
export async function CompanyOverview({ viewer, sp }: { viewer: AppUser; sp: Record<string, string | undefined> }) {
  const configs = await ensureDeptConfigs();
  const created = Object.keys(configs).filter((k) => k !== "dev" && k !== "marketing");
  // Finance is shown to people who can read finance (owners, Finance); others never see the tab.
  const money = financeRights(viewer).view;
  const view = (COMPANY_VIEWS.some((v) => v.key === sp.view) || created.includes(sp.view ?? "") || (money && sp.view === "finance") ? sp.view : "overall") as CompanyView | string;
  const period = isPeriod(sp.period) ? sp.period : "30d";
  const switcher = <ViewSwitcher current={view} labels={{ dev: configs.dev!.title, marketing: configs.marketing!.title }} extra={[...created.map((k) => ({ key: k, label: configs[k]!.title })), ...(money ? [{ key: "finance", label: "Finance" }] : [])]} />;
  if (view === "finance") {
    const year = /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : new Date().getUTCFullYear();
    const qs = new URLSearchParams({ ...(sp.tab ? { tab: sp.tab } : {}), view: "finance" }).toString();
    return (
      <div className="space-y-4">
        {switcher}
        <CompanyFinance data={await companyFinance(viewer, year)} base={`?${qs}`} />
      </div>
    );
  }
  if (view === "dev" || view === "marketing" || view === "studio" || created.includes(view))
    return (
      <div className="space-y-4">
        {switcher}
        <DeptDashboardView viewer={viewer} dept={view} sp={sp} />
      </div>
    );
  if (view === "production") {
    const [stats, rows, settings] = await Promise.all([ownerStats(), structureRows(viewer), getSettings()]);
    return (
      <div className="space-y-4">
        {switcher}
        <ProductionSection s={stats} />
        <StructureDashboard rows={rows} mode="grade" timezone={settings.workspace.timezone} />
      </div>
    );
  }
  const [summary, stats] = await Promise.all([companySummary(viewer, period), ownerStats()]);
  return (
    <div className="space-y-4">
      {switcher}
      <DashFilters period={period} filters={[]} />
      <CompanyOverall data={summary} />
      <Overview s={stats} />
    </div>
  );
}
