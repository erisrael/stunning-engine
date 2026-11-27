import { toolsPage } from "@/server/tools-page";
import { listNotes, listTasks } from "@/server/tools-data";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { NotesClient } from "./notes-client";

export const metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ note?: string; task?: string }> }) {
  const { viewer, tools, nav } = await toolsPage("notes");
  const [notes, tasks, settings, sp] = await Promise.all([listNotes(viewer), listTasks(viewer), getSettings(), searchParams]);
  return (
    <div className="space-y-4">
      <PageHeader title="Notes" description="Private notes with tick boxes, and tasks with due dates. Link them to production parts by code, title or teacher." />
      <ToolsNav apps={nav} active="notes" />
      <NotesClient
        initialNotes={notes}
        initialTasks={tasks}
        workspace={settings.workspace.name}
        who={viewer.name}
        features={tools.features}
        openNote={sp.note ?? null}
        openTask={sp.task ?? null}
      />
    </div>
  );
}
