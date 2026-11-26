import { toolsPage } from "@/server/tools-page";
import { listFiles } from "@/server/tools-data";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { DocsClient } from "./docs-client";

export const metadata = { title: "Document Builder" };

export default async function DocsPage() {
  const { viewer, tools, nav } = await toolsPage("docs");
  return (
    <div className="space-y-4">
      <PageHeader title="Document Builder" description="Write documents from ready layouts (minutes, reports, proposals, procedures, memos) and export them to Word or PDF." />
      <ToolsNav apps={nav} active="docs" />
      <DocsClient files={await listFiles(viewer, "doc")} author={viewer.name} letterhead={tools.letterhead} notion={tools.features.includes("notion")} />
    </div>
  );
}
