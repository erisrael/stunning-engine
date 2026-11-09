import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { all } from "@/server/db";
import { getSettings } from "@/server/settings";
import { taxonomy } from "@/server/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/primitives";
import { CalendarSettings, DestinationSettings, ListSettings, TaxonomySettings, TeamSettings, WorkflowSettings, WorkspaceSettings } from "./settings-client";
import { PageImport } from "@/components/app/page-import";
import { CallSettings } from "./call-settings";
import { turnSettings } from "@/server/calls";
import { secretSource } from "@/server/secrets";

export const metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireCapability("settings.manage");
  const { tab = "taxonomy" } = await searchParams;
  const s = await getSettings();
  const tax = await taxonomy();
  const lessons = await all<{ id: string; unit_id: string; number: number; title: string; title_am: string | null; objectives: string | null; planned_deliverables: number; items: number }>(
      "SELECT l.*, (SELECT COUNT(*) FROM items i WHERE i.lesson_id = l.id) AS items FROM lessons l ORDER BY l.number",
    );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Curriculum, workflow rules, how each team works, destinations, calendar, lists and calls. People, roles and permissions are in Admin."
        actions={<PageImport viewer={viewer} page="curriculum" label="Import curriculum" />}
      />
      <Tabs value={tab} className="gap-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="taxonomy" asChild><Link href="/settings?tab=taxonomy">Curriculum</Link></TabsTrigger>
          <TabsTrigger value="workflow" asChild><Link href="/settings?tab=workflow">Workflow</Link></TabsTrigger>
          <TabsTrigger value="teams" asChild><Link href="/settings?tab=teams">Teams</Link></TabsTrigger>
          <TabsTrigger value="destinations" asChild><Link href="/settings?tab=destinations">Destinations</Link></TabsTrigger>
          <TabsTrigger value="calendar" asChild><Link href="/settings?tab=calendar">Calendar and alerts</Link></TabsTrigger>
          <TabsTrigger value="lists" asChild><Link href="/settings?tab=lists">Lists</Link></TabsTrigger>
          <TabsTrigger value="workspace" asChild><Link href="/settings?tab=workspace">Workspace</Link></TabsTrigger>
          <TabsTrigger value="calls" asChild><Link href="/settings?tab=calls">Calls</Link></TabsTrigger>
        </TabsList>
        <TabsContent value="taxonomy">
          <TaxonomySettings t={{ grades: tax.grades, subjects: tax.subjects, gradeSubjects: tax.gradeSubjects, units: tax.units, lessons, terms: s.lists.terms }} />
        </TabsContent>
        <TabsContent value="workflow">
          <WorkflowSettings settings={s} />
        </TabsContent>
        <TabsContent value="teams">
          <TeamSettings settings={s} />
        </TabsContent>
        <TabsContent value="destinations">
          <DestinationSettings settings={s} />
        </TabsContent>
        <TabsContent value="calendar">
          <CalendarSettings settings={s} />
        </TabsContent>
        <TabsContent value="lists">
          <ListSettings settings={s} />
        </TabsContent>
        <TabsContent value="workspace">
          <WorkspaceSettings settings={s} />
        </TabsContent>
        <TabsContent value="calls">
          <CallSettings turn={await turnSettings()} secretSource={secretSource()} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
