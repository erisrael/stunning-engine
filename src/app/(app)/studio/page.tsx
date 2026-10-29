import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptAccess } from "@/server/departments";
import { taxonomy } from "@/server/queries";
import { listQuestions, listResources } from "@/server/studio";
import { PageHeader } from "@/components/app/primitives";
import { POSITION_LABELS } from "@/lib/domain";
import type { ResourceType } from "@/lib/studio";
import { StudioClient } from "./studio-client";

export const metadata = { title: "Studio" };

const TABS = ["note", "exam", "flashcards", "questions"] as const;

export default async function StudioPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const access = await deptAccess(viewer, "studio");
  if (!access.view) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "note";
  const common = { q: sp.q ?? null, status: sp.status ?? null, gradeId: sp.g ?? null, subjectId: sp.s ?? null, unitId: sp.u ?? null };
  const sortDir = sp.dir === "asc" ? "asc" : "desc";
  const resources =
    tab === "questions"
      ? []
      : (await listResources(viewer, { ...common, type: tab as ResourceType, mine: sp.mine === "1", sort: sp.sort === "title" || sp.sort === "status" ? sp.sort : "updated", dir: sortDir })).rows;
  const questions =
    tab === "questions"
      ? (await listQuestions(viewer, { ...common, type: sp.type ?? null, difficulty: sp.difficulty ?? null, sort: sp.sort === "difficulty" || sp.sort === "type" ? sp.sort : "updated", dir: sortDir })).rows
      : [];
  const tax = await taxonomy();
  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio"
        description={`Notes, exams, the question bank and flash cards, placed on the curriculum. Write and submit for review; heads and leads approve and publish.${access.readOnly ? " You are viewing as an owner (read only)." : access.position ? ` You are ${POSITION_LABELS[access.position].toLowerCase()} here.` : ""}`}
      />
      <StudioClient
        tab={tab}
        filter={{ ...common, type: sp.type ?? null, difficulty: sp.difficulty ?? null, mine: sp.mine === "1", sort: sp.sort ?? null, dir: sortDir }}
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
      />
    </div>
  );
}
