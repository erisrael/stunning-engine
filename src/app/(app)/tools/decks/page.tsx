import { toolsPage } from "@/server/tools-page";
import { listFiles } from "@/server/tools-data";
import { listTemplates } from "@/server/deck-templates";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { DecksClient } from "./decks-client";

export const metadata = { title: "PowerPoint Deck Maker" };

export default async function DecksPage() {
  const { viewer, nav } = await toolsPage("decks");
  const [files, t, settings] = await Promise.all([listFiles(viewer, "deck"), listTemplates(), getSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader title="PowerPoint Deck Maker" description="Build slides from ready layouts in the company's presentation designs, then export to PowerPoint (.pptx)." />
      <ToolsNav apps={nav} active="decks" />
      <DecksClient files={files} templates={t.templates} defaultTemplate={t.defaultId} workspace={settings.workspace.name} />
    </div>
  );
}
