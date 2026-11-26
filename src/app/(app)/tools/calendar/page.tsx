import { toolsPage } from "@/server/tools-page";
import { calendarFeed, listNotes, listReminders, listTasks } from "@/server/tools-data";
import { appOrigin } from "@/server/password-reset";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { ToolsNav } from "@/components/app/tools/shared";
import { CalendarClient } from "./calendar-client";

export const metadata = { title: "Reminder Calendar" };

export default async function CalendarToolPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { viewer, tools, nav } = await toolsPage("calendar");
  const notesOn = tools.apps.some((a) => a.key === "notes");
  const icsOn = tools.features.includes("ics");
  const [reminders, tasks, notes, feed, origin, settings, sp] = await Promise.all([
    listReminders(viewer),
    notesOn ? listTasks(viewer) : Promise.resolve([]),
    notesOn ? listNotes(viewer) : Promise.resolve([]),
    icsOn ? calendarFeed(viewer) : Promise.resolve(null),
    appOrigin(),
    getSettings(),
    searchParams,
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Reminder Calendar" description="Your reminders and every task with a due date, by month or week. Subscribe from Google Calendar, Outlook or Apple Calendar." />
      <ToolsNav apps={nav} active="calendar" />
      <CalendarClient
        initialReminders={reminders}
        tasks={tasks}
        notes={notes.map((n) => ({ id: n.id, title: n.title || "Untitled" }))}
        feed={feed ? { url: `${origin}/calendar/feed/${feed.token}.ics`, createdAt: feed.createdAt, expiresAt: feed.expiresAt, lastUsedAt: feed.lastUsedAt, expired: feed.expired } : null}
        icsOn={icsOn}
        origin={origin}
        weekStartsOn={settings.workspace.weekStartsOn ?? 1}
        focus={sp.d ?? null}
        workspace={settings.workspace.name}
        who={viewer.name}
        aiOn={tools.features.includes("ai_copy")}
      />
    </div>
  );
}
