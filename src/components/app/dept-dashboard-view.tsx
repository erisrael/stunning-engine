import type { AppUser } from "@/server/users";
import { dashboardLayout, dashboardPeople, gradeOptions, studioDashboard, workDashboard } from "@/server/dashboards";
import { getDeptConfig } from "@/server/dept-config";
import { listProjects } from "@/server/work";
import { isPeriod } from "@/lib/dashboards";
import { RESOURCE_TYPE_LABELS, RESOURCE_TYPES } from "@/lib/studio";
import { DashFilters, StudioDashboard, WorkDashboard } from "./dept-dashboard";

type Params = Record<string, string | undefined>;

// A department's dashboard with its filters, loaded for this viewer. Used in the department's own section and in
// the Company overview.
export async function DeptDashboardView({ viewer, dept, sp }: { viewer: AppUser; dept: "dev" | "marketing" | "studio"; sp: Params }) {
  const period = isPeriod(sp.period) ? sp.period : "30d";
  const info = await dashboardLayout(viewer, dept);
  if (dept === "studio") {
    const data = await studioDashboard(viewer, { type: sp.type ?? null, person: sp.person ?? null, grade: sp.grade ?? null, period });
    const [people, grades] = await Promise.all([data.canSeeAll ? dashboardPeople("studio") : Promise.resolve([]), gradeOptions()]);
    return (
      <div className="space-y-3">
        <DashFilters
          period={period}
          filters={[
            { key: "type", placeholder: "Every type", value: sp.type ?? null, options: RESOURCE_TYPES.map((t) => ({ value: t, label: RESOURCE_TYPE_LABELS[t].many })) },
            { key: "grade", placeholder: "Every grade", value: sp.grade ?? null, options: grades.map((g) => ({ value: g.id, label: g.name })) },
            ...(data.canSeeAll ? [{ key: "person", placeholder: "Everyone", value: sp.person ?? null, options: [{ value: "me", label: "Me" }, ...people.map((p) => ({ value: p.id, label: p.name }))] }] : []),
          ]}
        />
        <StudioDashboard data={data} info={info} />
      </div>
    );
  }
  const [data, cfg, projects] = await Promise.all([
    workDashboard(viewer, dept, { project: sp.project ?? null, person: sp.person ?? null, type: sp.type ?? null, period }),
    getDeptConfig(dept),
    listProjects(viewer, dept),
  ]);
  const people = data.canSeeAll ? await dashboardPeople(dept) : [];
  return (
    <div className="space-y-3">
      <DashFilters
        period={period}
        filters={[
          { key: "project", placeholder: `Every ${cfg.names.project.toLowerCase()}`, value: sp.project ?? null, options: [{ value: "none", label: `No ${cfg.names.project.toLowerCase()}` }, ...projects.map((p) => ({ value: p.id, label: `${p.key} ${p.name}` }))] },
          { key: "type", placeholder: "Every type", value: sp.type ?? null, options: cfg.types.map((t) => ({ value: t.key, label: t.label })) },
          ...(data.canSeeAll
            ? [{ key: "person", placeholder: "Everyone", value: sp.person ?? null, options: [{ value: "me", label: "Me" }, { value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.id, label: p.name }))] }]
            : []),
        ]}
      />
      <WorkDashboard dept={dept} data={data} info={info} />
    </div>
  );
}
