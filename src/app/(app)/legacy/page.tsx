import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { canImportLegacy, canUseLegacy, legacyConfig, legacyGrades, legacyParts, legacyStats, legacySubjects, legacyUnits, readyToHandOff } from "@/server/legacy";
import { can, isLeadOf, isManager } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { LegacyClient } from "./legacy-client";

export const metadata = { title: "Legacy catalog" };

// The Recording team's old way, level by level: Grades, then a grade's subjects, then units, then parts and video shots.
export default async function LegacyPage({ searchParams }: { searchParams: Promise<{ g?: string; s?: string; u?: string; view?: string }> }) {
  const viewer = await requireViewer();
  const cfg = await legacyConfig();
  if (!canUseLegacy(viewer) || (!cfg.on && !can(viewer, "settings.manage") && !can(viewer, "users.manage"))) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const grade = sp.g ? await get<{ id: string; name: string; level: string | null }>("SELECT id, name, level FROM grades WHERE id = ?", sp.g) : null;
  const subject = grade && sp.s ? await get<{ id: string; name: string }>("SELECT id, name FROM subjects WHERE id = ?", sp.s) : null;
  const unit = subject && sp.u ? await get<{ id: string; number: number; title: string }>("SELECT id, number, title FROM units WHERE id = ? AND grade_id = ? AND subject_id = ?", sp.u, grade!.id, subject.id) : null;
  const readyAll = await readyToHandOff(viewer, {});
  const showReady = sp.view === "ready";
  const [stats, grades, subjects, units, parts] = await Promise.all([
    legacyStats(),
    grade ? Promise.resolve([]) : legacyGrades(viewer),
    grade && !subject ? legacySubjects(viewer, grade.id) : Promise.resolve([]),
    grade && subject && !unit ? legacyUnits(grade.id, subject.id) : Promise.resolve([]),
    unit ? legacyParts(unit.id) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Legacy catalog" description="The way the Recording team has always logged its recordings: grade, subject, unit, part, then video shots by camera code. What you add here is put into the system properly, so every team sees it." />
      <LegacyClient
        stats={stats}
        grade={grade ?? null}
        subject={subject ?? null}
        unit={unit ? { ...unit, number: Number(unit.number) } : null}
        grades={grades}
        subjects={subjects}
        units={units}
        parts={parts}
        ready={showReady ? readyAll : null}
        readyCount={readyAll.filter((r) => (isLeadOf(viewer, "recording") || isManager(viewer) ? true : r.status === "finished")).length}
        lead={isLeadOf(viewer, "recording") || isManager(viewer) || can(viewer, "items.plan")}
        canImport={canImportLegacy(viewer)}
        canRemove={isManager(viewer) || isLeadOf(viewer, "recording") || can(viewer, "items.plan") || can(viewer, "import.run") || can(viewer, "data.manage")}
        admin={can(viewer, "settings.manage") || can(viewer, "users.manage")}
        config={cfg}
      />
    </div>
  );
}
