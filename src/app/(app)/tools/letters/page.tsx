import { toolsPage } from "@/server/tools-page";
import { listFiles } from "@/server/tools-data";
import { designFor } from "@/server/tools";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { LettersClient } from "./letters-client";

export const metadata = { title: "Company Letter Generator" };

export default async function LettersPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { viewer, tools, nav } = await toolsPage("letters");
  return (
    <div className="space-y-4">
      <PageHeader title="Company Letter Generator" description="Official letters on the company letterhead, from more than 50 kinds of letter. Write them, design them freely, preview them, and save as PDF, Word or a picture." />
      <ToolsNav apps={nav} active="letters" />
      <LettersClient files={await listFiles(viewer, "letter")} letterhead={tools.letterhead} canEditLetterhead={tools.canEditLetterhead} author={{ name: viewer.name, title: viewer.title }} tab={(await searchParams).tab === "letterhead" && tools.canEditLetterhead ? "letterhead" : "write"} design={await designFor(viewer, "letters")} seal={tools.seal} />
    </div>
  );
}
