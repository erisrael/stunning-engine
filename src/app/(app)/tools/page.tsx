import Link from "next/link";
import { BellIcon, FileSpreadsheetIcon, FileTextIcon, MailIcon, NotebookPenIcon, PresentationIcon } from "lucide-react";
import { toolsPage } from "@/server/tools-page";
import { calendarFeed } from "@/server/tools-data";
import { myNotion } from "@/server/tools-notion";
import { myConnections } from "@/server/oauth";
import { appOrigin } from "@/server/password-reset";
import { PageHeader } from "@/components/app/primitives";
import { Card, CardContent } from "@/components/ui/card";
import { ToolsNav } from "@/components/app/tools/shared";
import { ConnectionsClient } from "./connections-client";

export const metadata = { title: "Tools hub" };

const ICONS = { notes: NotebookPenIcon, calendar: BellIcon, sheets: FileSpreadsheetIcon, docs: FileTextIcon, decks: PresentationIcon, letters: MailIcon } as const;

// The Tools hub: the apps Admin gave this person, and the optional connections (none is needed to use the apps).
export default async function ToolsHubPage({ searchParams }: { searchParams: Promise<{ notion?: string }> }) {
  const { viewer, tools, nav } = await toolsPage("hub");
  const f = tools.features;
  const [feed, notion, apps, origin, sp] = await Promise.all([
    f.includes("ics") ? calendarFeed(viewer) : Promise.resolve(null),
    f.includes("notion") ? myNotion(viewer) : Promise.resolve(null),
    f.includes("mcp") || f.includes("gpt") ? myConnections(viewer) : Promise.resolve([]),
    appOrigin(),
    searchParams,
  ]);
  return (
    <div className="space-y-5">
      <PageHeader title="Tools hub" description="Everyday tools inside Myseed. They work on their own; connecting Notion, a calendar or an AI assistant is optional." />
      <ToolsNav apps={nav} active="hub" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.apps.map((a) => {
          const Icon = ICONS[a.key];
          return (
            <Link key={a.key} href={a.href} className="group">
              <Card className="h-full transition-colors group-hover:border-primary">
                <CardContent className="flex gap-3 p-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <span>
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-sm text-muted-foreground">{a.hint}</span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
      {f.some((x) => x !== "ai_copy") && (
        <ConnectionsClient
          features={f}
          origin={origin}
          feed={feed ? { url: `${origin}/calendar/feed/${feed.token}.ics`, expired: feed.expired } : null}
          notion={notion}
          apps={apps}
          notice={sp.notion ?? null}
          calendarApp={tools.apps.some((a) => a.key === "calendar")}
        />
      )}
    </div>
  );
}
