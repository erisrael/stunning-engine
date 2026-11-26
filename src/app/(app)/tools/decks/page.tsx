import { toolsPage } from "@/server/tools-page";
import { listFiles } from "@/server/tools-data";
import { designFor } from "@/server/tools";
import { listTemplates } from "@/server/deck-templates";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { DecksClient } from "./decks-client";

export const metadata = { title: "PowerPoint Deck Maker" };

export default async function DecksPage() {
  const { viewer, tools, nav } = await toolsPage("decks");
  const lh = tools.letterhead;
  const [files, t, settings] = await Promise.all([listFiles(viewer, "deck"), listTemplates(), getSettings()]);
  return (
    <div className="space-y-4">
      <PageHeader title="PowerPoint Deck Maker" description="Build slides from ready layouts, or design them freely (text, pictures, shapes, tables, icons) and present full screen. Open .pptx files and export to PowerPoint, PDF or pictures." />
      <ToolsNav apps={nav} active="decks" />
      <DecksClient files={files} templates={t.templates} defaultTemplate={t.defaultId} workspace={settings.workspace.name} design={await designFor(viewer, "decks")} brand={{ company: lh.company, tagline: lh.tagline, address: lh.address, phone: lh.phone, email: lh.email, website: lh.website, footer: lh.footer, primary: lh.primary, accent: lh.accent, hasLogo: true }} />
    </div>
  );
}
