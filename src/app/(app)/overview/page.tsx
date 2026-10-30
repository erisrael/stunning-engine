import { requireCapability } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { structureRows } from "@/server/structure";
import { PageHeader } from "@/components/app/primitives";
import { StructureReport } from "@/components/app/structure-report";
import { PageImport } from "@/components/app/page-import";
import { PresentButton } from "@/components/app/present-button";

export const metadata = { title: "Overview" };

// A simple status report for every role: where each unit and part stands in the four stages.
export default async function OverviewPage() {
  const viewer = await requireCapability("nav.overview");
  const tax = await taxonomy();
  const rows = await structureRows(viewer);
  const grades = tax.grades.filter((g) => rows.some((r) => r.gradeId === g.id)).map((g) => ({ id: g.id, name: g.name }));
  const subjects = tax.subjects.filter((s) => rows.some((r) => r.subjectId === s.id)).map((s) => ({ id: s.id, name: s.name }));
  return (
    <div className="space-y-4">
      <PageHeader
        help="overview" title="Overview"
        description="Where every unit and part stands in Recording, Editing, Uploading and Publication. Switch between grade-first and subject-first, and between a table and a hierarchy."
        actions={
          <>
            <PresentButton />
            <PageImport viewer={viewer} page="curriculum" label="Import curriculum" />
            <PageImport viewer={viewer} page="work" label="Import progress" />
          </>
        }
      />
      <StructureReport rows={rows} grades={grades} subjects={subjects} defaultMode="grade" defaultView="table" />
    </div>
  );
}
