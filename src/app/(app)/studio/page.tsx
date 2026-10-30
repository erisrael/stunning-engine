import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptAccess, deptPeople } from "@/server/departments";
import { taxonomy } from "@/server/queries";
import { listQuestions, listResources } from "@/server/studio";
import { canConfigureStudio, getStudioConfig, studioTeam, studioWork } from "@/server/studio-extras";
import { deptViews } from "@/server/work";
import { PageHeader } from "@/components/app/primitives";
import { POSITION_LABELS } from "@/lib/domain";
import { isPeriod } from "@/lib/dashboards";
import type { ResourceType } from "@/lib/studio";
import { StudioClient } from "./studio-client";
import { DeptDashboardView } from "@/components/app/dept-dashboard-view";

export const metadata = { title: "Studio" };

const TABS = ["dashboard", "board", "calendar", "team", "note", "exam", "flashcards", "questions", "configure"] as const;

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const access = await deptAccess(viewer, "studio");
  if (!access.view) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const canConfigure = await canConfigureStudio(viewer);
  // The dashboard is the landing tab; a link to a resource opens notes with it.
  let tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : sp.open ? "note" : "dashboard";
  if ((tab === "team" && !access.manage && !access.readOnly) || (tab === "configure" && !canConfigure)) tab = "board";
  const common = { q: sp.q ?? null, status: sp.status ?? null, gradeId: sp.g ?? null, subjectId: sp.s ?? null, unitId: sp.u ?? null };
  const sortDir = sp.dir === "asc" ? "asc" : "desc";
  const listTab = tab === "note" || tab === "exam" || tab === "flashcards";
  const [resources, questions, tax, work, team, studioConfig, people, views] = await Promise.all([
    listTab
      ? listResources(viewer, { ...common, type: tab as ResourceType, mine: sp.mine === "1", sort: sp.sort === "title" || sp.sort === "status" ? sp.sort : "updated", dir: sortDir }).then((r) => r.rows)
      : Promise.resolve([]),
    tab === "questions"
      ? listQuestions(viewer, { ...common, type: sp.type ?? null, difficulty: sp.difficulty ?? null, sort: sp.sort === "difficulty" || sp.sort === "type" ? sp.sort : "updated", dir: sortDir }).then((r) => r.rows)
      : Promise.resolve([]),
    taxonomy(),
    tab === "board" || tab === "calendar" ? studioWork(viewer, { q: sp.q ?? null, type: sp.type ?? null, person: sp.person ?? null, grade: sp.g ?? null }) : Promise.resolve([]),
    tab === "team" ? studioTeam(viewer, isPeriod(sp.period) ? sp.period : "30d") : Promise.resolve(null),
    tab === "configure" ? getStudioConfig() : Promise.resolve(null),
    deptPeople("studio"),
    deptViews(viewer, "studio"),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio"
        description={`Notes, exams, the question bank and flash cards, placed on the curriculum. Write and submit for review; heads and leads approve and publish.${access.readOnly ? " You are viewing as an owner (read only)." : access.position ? ` You are ${POSITION_LABELS[access.position].toLowerCase()} here.` : ""}`}
      />
      <StudioClient
        tab={tab}
        filter={{ ...common, type: sp.type ?? null, difficulty: sp.difficulty ?? null, mine: sp.mine === "1", sort: sp.sort ?? null, dir: sortDir, person: sp.person ?? null }}
        resources={resources}
        questions={questions}
        access={{ manage: access.manage, readOnly: access.readOnly }}
        viewerId={viewer.id}
        openId={sp.open ?? null}
        taxonomy={{
          grades: tax.grades.map((g) => ({ id: g.id, name: g.name, code: g.code })),
          subjects: tax.subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
          units: tax.units.map((u) => ({ id: u.id, gradeId: u.grade_id, subjectId: u.subject_id, number: u.number, title: u.title })),
        }}
        dashboard={tab === "dashboard" ? <DeptDashboardView viewer={viewer} dept="studio" sp={sp} /> : undefined}
        work={work}
        team={team}
        studioConfig={studioConfig}
        canConfigure={canConfigure}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        views={views}
      />
    </div>
  );
}
