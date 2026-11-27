import { toolsPage } from "@/server/tools-page";
import { listFiles, seesProduction } from "@/server/tools-data";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { SheetsClient } from "./sheets-client";

export const metadata = { title: "Sheets" };

export default async function SheetsPage() {
  const { viewer, tools, nav } = await toolsPage("sheets");
  const [saved, settings] = await Promise.all([listFiles(viewer, "sheet"), getSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Sheets" description="A spreadsheet with Excel formulas, styles, several sheets and charts. Open and save .xlsx and .csv, and compare your workbooks with Myseed data for your team: production, your department's tasks, finance and HR." />
      <ToolsNav apps={nav} active="sheets" />
      <SheetsClient saved={saved} canCrossCheck={seesProduction(viewer)} aiOn={tools.features.includes("ai_copy")} workspace={settings.workspace.name} who={viewer.name} />
    </div>
  );
}
