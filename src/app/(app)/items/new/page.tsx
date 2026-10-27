import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { all } from "@/server/db";
import { taxonomy } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { userDirectory } from "@/server/users";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { NewItemForm } from "./new-item-form";

export const metadata = { title: "New item" };

export default async function NewItemPage() {
  await requireCapability("items.create");
  const tax = await taxonomy();
  const s = await getSettings();
  const lessons = await all<{ id: string; unitId: string; number: number; title: string; title_am: string | null; objectives: string | null; items: number }>(
      "SELECT l.id, l.unit_id AS unitId, l.number, l.title, l.title_am, l.objectives, (SELECT COUNT(*) FROM items i WHERE i.lesson_id = l.id) AS items FROM lessons l ORDER BY l.number",
    );
  return (
    <div className="space-y-4">
      <PageHeader
        title="New production item"
        description="One item is one deliverable, such as a main lesson video, revision clip or worksheet. Your draft is kept in this browser until you create it."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/import-export">Create many from a spreadsheet</Link>
          </Button>
        }
      />
      <NewItemForm
        o={{
          grades: tax.grades.filter((g) => g.active).map((g) => ({ id: g.id, code: g.code, name: g.name })),
          subjects: tax.subjects.filter((x) => x.active).map((x) => ({ id: x.id, code: x.code, name: x.name })),
          gradeSubjects: tax.gradeSubjects,
          units: tax.units.map((u) => ({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, number: u.number, title: u.title })),
          lessons,
          users: await userDirectory(),
          lists: s.lists,
          destinations: s.destinations.filter((d) => d.active),
          tz: s.workspace.timezone,
          prefix: s.workspace.codePrefix,
        }}
      />
    </div>
  );
}
