import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { structureRows } from "@/server/structure";
import { canConfigureOverview, overviewStagesFor, overviewTeams } from "@/server/overview-teams";
import { PageHeader } from "@/components/app/primitives";
import { StructureReport } from "@/components/app/structure-report";
import { OverviewTeamsAdmin } from "@/components/app/overview-teams-admin";
import { PageImport } from "@/components/app/page-import";
import { PresentButton } from "@/components/app/present-button";
import { ROLE_LABELS, STAGE_LABELS, STAGES } from "@/lib/domain";

export const metadata = { title: "Overview" };

// A simple status report: where each unit and part stands in the four stages. A production team sees its own
// team's column (Admin sets which teams each role sees, on this page); managers and Admin see all four.
export default async function OverviewPage() {
  const viewer = await requireViewer();
  const stages = await overviewStagesFor(viewer);
  if (stages && !stages.length) redirect("/dashboard?denied=permission");
  const tax = await taxonomy();
  // A team's overview is the whole team's work, whatever grades or subjects the person works on.
  const rows = await structureRows(stages ? { ...viewer, scopes: [], ownWorkOnly: false } : viewer);
  const grades = tax.grades.filter((g) => rows.some((r) => r.gradeId === g.id)).map((g) => ({ id: g.id, name: g.name }));
  const subjects = tax.subjects.filter((s) => rows.some((r) => r.subjectId === s.id)).map((s) => ({ id: s.id, name: s.name }));
  const shown = stages ?? [...STAGES];
  const names = shown.map((s) => STAGE_LABELS[s]);
  const title = stages && stages.length === 1 ? `${STAGE_LABELS[stages[0]!]} team overview` : "Overview";
  return (
    <div className="space-y-4">
      <PageHeader
        help="overview" explainer="present" title={title}
        description={`Where every unit and part stands in ${names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0]}. Switch between grade-first and subject-first, and between a table and a hierarchy.`}
        actions={
          <>
            <PresentButton />
            {!stages && <PageImport viewer={viewer} page="curriculum" label="Import curriculum" />}
            {!stages && <PageImport viewer={viewer} page="work" label="Import progress" />}
          </>
        }
      />
      {canConfigureOverview(viewer) && <OverviewTeamsAdmin value={await overviewTeams()} roles={Object.entries(ROLE_LABELS).map(([k, v]) => ({ key: k, label: v }))} />}
      <StructureReport rows={rows} grades={grades} subjects={subjects} defaultMode="grade" defaultView="table" stages={shown} serverExport />
    </div>
  );
}
