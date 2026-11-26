import { toolsPage } from "@/server/tools-page";
import { listFiles, seesProduction } from "@/server/tools-data";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { SheetsClient } from "./sheets-client";

export const metadata = { title: "Excel / Sheets Studio" };

export default async function SheetsPage() {
  const { viewer, tools, nav } = await toolsPage("sheets");
  const [saved, settings] = await Promise.all([listFiles(viewer, "sheet"), getSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader title="Excel / Sheets Studio" description="Open, paste, edit, sort and filter sheets, export .xlsx or .csv, and cross-check codes, titles and teachers against production data." />
      <ToolsNav apps={nav} active="sheets" />
      <SheetsClient saved={saved} canCrossCheck={seesProduction(viewer)} aiOn={tools.features.includes("ai_copy")} workspace={settings.workspace.name} who={viewer.name} />
    </div>
  );
}
