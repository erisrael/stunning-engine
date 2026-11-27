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

export const metadata = { title: "Tools" };

const ICONS = { notes: NotebookPenIcon, calendar: BellIcon, sheets: FileSpreadsheetIcon, docs: FileTextIcon, decks: PresentationIcon, letters: MailIcon } as const;
// Each app's colour (icon tile) and what it opens and saves.
const TONE = { notes: "bg-amber-500/15 text-amber-700 dark:text-amber-300", calendar: "bg-sky-500/15 text-sky-700 dark:text-sky-300", sheets: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", docs: "bg-blue-500/15 text-blue-700 dark:text-blue-300", decks: "bg-orange-500/15 text-orange-700 dark:text-orange-300", letters: "bg-violet-500/15 text-violet-700 dark:text-violet-300" } as const;
const FORMATS: Record<string, string[]> = { notes: ["Markdown", "Tasks"], calendar: [".ics feed"], sheets: [".xlsx", ".csv", ".tsv", "PDF", "Charts"], docs: [".docx", "PDF", ".md", ".html"], decks: [".pptx", "PDF", "PNG", "Present"], letters: ["PDF", "Word", "PNG", "Design"] };

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
      <PageHeader title="Tools" description="Everyday tools inside Myseed. They work on their own; connecting Notion, a calendar or an AI assistant is optional." />
      <ToolsNav apps={nav} active="hub" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tools.apps.map((a) => {
          const Icon = ICONS[a.key];
          return (
            <Link key={a.key} href={a.href} className="group">
              <Card className="h-full transition-all group-hover:-translate-y-0.5 group-hover:border-primary group-hover:shadow-md">
                <CardContent className="flex gap-3 p-4">
                  <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${TONE[a.key]}`}>
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium">{a.label}</span>
                    <span className="block text-sm text-muted-foreground">{a.hint}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      {(FORMATS[a.key] ?? []).map((x) => (
                        <span key={x} className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                          {x}
                        </span>
                      ))}
                    </span>
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
