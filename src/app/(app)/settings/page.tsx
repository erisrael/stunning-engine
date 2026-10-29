import { requireCapability } from "@/server/auth";
import { all } from "@/server/db";
import { getSettings } from "@/server/settings";
import { taxonomy } from "@/server/queries";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/primitives";
import { CalendarSettings, DestinationSettings, ListSettings, TaxonomySettings, WorkflowSettings, WorkspaceSettings } from "./settings-client";
import { PageImport } from "@/components/app/page-import";

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
        description="Curriculum, workflow rules, destinations, calendar and lists. People, roles and permissions are in Admin."
        actions={<PageImport viewer={viewer} page="curriculum" label="Import curriculum" />}
      />
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="taxonomy">Curriculum</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="destinations">Destinations</TabsTrigger>
          <TabsTrigger value="calendar">Calendar and alerts</TabsTrigger>
          <TabsTrigger value="lists">Lists</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
        </TabsList>
        <TabsContent value="taxonomy">
          <TaxonomySettings t={{ grades: tax.grades, subjects: tax.subjects, gradeSubjects: tax.gradeSubjects, units: tax.units, lessons, terms: s.lists.terms }} />
        </TabsContent>
        <TabsContent value="workflow">
          <WorkflowSettings settings={s} />
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
      </Tabs>
    </div>
  );
}
