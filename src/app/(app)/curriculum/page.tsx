import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { autoAssignConfig, teamOf } from "@/server/auto-assign";
import { curriculumConfig, curriculumIndex, curriculumRights, findIssues, recentChanges, subjectUnits } from "@/server/curriculum-fix";
import { assignableStages } from "@/server/editorial";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { STAGES } from "@/lib/domain";
import { CurriculumClient } from "./curriculum-client";

export const metadata = { title: "Curriculum" };

const TABS = ["fix", "browse", "auto", "changes", "settings"] as const;

export default async function CurriculumPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const rights = await curriculumRights(viewer);
  const stages = assignableStages(viewer);
  if (!rights.rename && !stages.length) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const admin = can(viewer, "settings.manage") || can(viewer, "users.manage");
  let tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : rights.rename ? "fix" : "auto";
  if (tab === "settings" && !admin) tab = "fix";
  const index = await curriculumIndex();
  const gradeId = sp.g && index.grades.some((g) => g.id === sp.g) ? sp.g : (index.grades[0]?.id ?? null);
  const inGrade = index.subjects.filter((s) => index.offered.some((o) => o.grade_id === gradeId && o.subject_id === s.id));
  const subjectId = sp.s && inGrade.some((s) => s.id === sp.s) ? sp.s : (inGrade[0]?.id ?? null);
  const [issues, units, changes, auto, teams, config] = await Promise.all([
    tab === "fix" ? findIssues() : Promise.resolve([]),
    tab === "browse" && gradeId && subjectId ? subjectUnits(gradeId, subjectId) : Promise.resolve([]),
    tab === "changes" ? recentChanges() : Promise.resolve([]),
    tab === "auto" ? autoAssignConfig() : Promise.resolve(null),
    tab === "auto" ? Promise.all(STAGES.map(async (s) => [s, await teamOf(s)] as const)) : Promise.resolve([]),
    curriculumConfig(),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Curriculum" description="Fix names typed wrong and subjects imported to the wrong place, and set who new work goes to. Every change is kept, and a name a person corrected stays when something is imported again." />
      <CurriculumClient
        tab={tab}
        rights={rights}
        admin={admin}
        index={index}
        gradeId={gradeId}
        subjectId={subjectId}
        issues={issues}
        units={units}
        changes={changes}
        auto={auto}
        teams={Object.fromEntries(teams)}
        assignable={stages}
        config={config}
      />
    </div>
  );
}
