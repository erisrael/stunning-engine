import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { taxonomy } from "@/server/queries";
import { getSettings } from "@/server/settings";
import { scopeAllowsGradeSubject, userDirectory } from "@/server/users";
import { assignableStages, assignCandidates, listTemplates, stageWorkload } from "@/server/editorial";
import { PageHeader } from "@/components/app/primitives";
import { STAGES, type Stage } from "@/lib/domain";
import { AssignWizard } from "./assign-client";

export const metadata = { title: "Assign work" };

export default async function AssignPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const stages = assignableStages(viewer);
  if (!stages.length) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const stage: Stage = stages.includes(sp.stage as Stage) ? (sp.stage as Stage) : stages[0];
  const list = (v?: string) => (v ?? "").split(",").filter(Boolean);
  const gradeIds = list(sp.g);
  const subjectIds = list(sp.s);
  const mode = sp.mode === "subject" ? "subject" : "grade";

  const tax = await taxonomy();
  const offered = tax.gradeSubjects.filter((x) => scopeAllowsGradeSubject(viewer, x.grade_id, x.subject_id));
  const grades = tax.grades.filter((g) => g.active && offered.some((o) => o.grade_id === g.id)).map((g) => ({ id: g.id, name: g.name }));
  const subjects = tax.subjects.filter((s) => s.active && offered.some((o) => o.subject_id === s.id)).map((s) => ({ id: s.id, name: s.name }));
  // Nothing is listed until a grade or subject is chosen, so large workspaces open quickly.
  const candidates = gradeIds.length || subjectIds.length ? await assignCandidates(viewer, { stage, gradeIds, subjectIds }) : null;
  const [directory, workload, templates, settings] = await Promise.all([userDirectory(), stageWorkload(stage), listTemplates({ stage, active: "active", sort: "name" }), getSettings()]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assign work"
        description="Choose a grade and subject (or a subject, then grades), select the parts, and assign them to one or several people at once, with a due date and a checklist for each person."
      />
      <AssignWizard
        stage={stage}
        stages={stages}
        mode={mode}
        gradeIds={gradeIds}
        subjectIds={subjectIds}
        grades={grades}
        subjects={subjects}
        offered={offered.map((o) => `${o.grade_id}|${o.subject_id}`)}
        candidates={candidates}
        people={directory.filter((u) => u.roles.includes(stage)).map((u) => ({ id: u.id, name: u.name, open: workload[u.id] ?? 0 }))}
        names={Object.fromEntries(directory.map((u) => [u.id, u.name]))}
        templates={templates.map((t) => ({ id: t.id, name: t.name, lines: t.items.length, verify: t.items.filter((i) => i.verify).length }))}
        tz={settings.workspace.timezone}
        allStages={[...STAGES]}
      />
    </div>
  );
}
