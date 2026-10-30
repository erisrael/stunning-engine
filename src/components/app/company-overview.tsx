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

// The Company overview: switch between the whole company and each department. Used by /company and the Owners page.
export async function CompanyOverview({ viewer, sp }: { viewer: AppUser; sp: Record<string, string | undefined> }) {
  const view = (COMPANY_VIEWS.some((v) => v.key === sp.view) ? sp.view : "overall") as CompanyView;
  const period = isPeriod(sp.period) ? sp.period : "30d";
  const configs = await ensureDeptConfigs();
  const switcher = <ViewSwitcher current={view} labels={{ dev: configs.dev.title, marketing: configs.marketing.title }} />;
  if (view === "dev" || view === "marketing" || view === "studio")
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
