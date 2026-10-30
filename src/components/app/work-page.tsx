import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptPeople } from "@/server/departments";
import { workAccess } from "@/server/dept-config";
import { listProjects, listTasks, type TaskFilter } from "@/server/work";
import { PageHeader } from "@/components/app/primitives";
import { POSITION_LABELS } from "@/lib/domain";
import type { WorkDept } from "@/lib/work";
import { WorkClient } from "./work-client";
import { DeptConfigure } from "./dept-configure";
import { DeptDashboardView } from "./dept-dashboard-view";

const TABS = ["dashboard", "board", "list", "projects", "calendar", "configure"] as const;
const SORTS = ["updated", "due", "priority", "code", "title", "status"] as const;

// The Dev and Marketing sections share this page; their vocabulary, workflow and rights come from the configuration.
export async function WorkPage({ dept, searchParams }: { dept: WorkDept; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const access = await workAccess(viewer, dept).catch(() => null);
  if (!access) redirect("/dashboard?denied=permission");
  const cfg = access.config;
  const sp = await searchParams;
  // The dashboard is the landing tab; a link to a task opens the board with it.
  let tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : sp.task ? "board" : "dashboard";
  if (tab === "configure" && !access.rights.configure) tab = "board";
  const header = (
    <PageHeader
      title={cfg.title}
      description={`${cfg.description}${access.readOnly ? " You are viewing as an owner (read only)." : access.position ? ` You are ${POSITION_LABELS[access.position].toLowerCase()} here.` : ""}`}
    />
  );
  if (tab === "configure")
    return (
      <div className="space-y-4">
        {header}
        <DeptConfigure dept={dept} config={cfg} version={cfg.version} />
      </div>
    );
  if (tab === "dashboard") {
    const [projects, people] = await Promise.all([listProjects(viewer, dept), deptPeople(dept)]);
    return (
      <div className="space-y-4">
        {header}
        <WorkClient
          dept={dept}
          tab="dashboard"
          filter={{}}
          tasks={[]}
          projects={projects}
          people={people.map((p) => ({ id: p.id, name: p.name, position: p.position }))}
          access={{ rights: access.rights, readOnly: access.readOnly }}
          config={cfg}
          viewerId={viewer.id}
          openTaskId={null}
          showArchived={false}
          dashboard={<DeptDashboardView viewer={viewer} dept={dept} sp={sp} />}
        />
      </div>
    );
  }
  const statuses = sp.status ? sp.status.split(",").filter((s) => cfg.statuses.some((x) => x.key === s)) : [];
  const filter: TaskFilter = {
    q: sp.q ?? null,
    status: statuses,
    open: sp.status === "open",
    assignee: sp.assignee ?? null,
    project: sp.project ?? null,
    type: sp.type ?? null,
    priority: sp.priority ?? null,
    due: sp.due === "overdue" || sp.due === "week" || sp.due === "none" ? sp.due : null,
    sort: (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as TaskFilter["sort"]) : tab === "board" ? undefined : "updated",
    dir: sp.dir === "asc" ? "asc" : "desc",
  };
  // The board orders cards by their position, so it ignores the list sort.
  const { tasks } = await listTasks(viewer, dept, tab === "board" ? { ...filter, sort: "status", dir: "asc" } : filter);
  const [projects, people] = await Promise.all([listProjects(viewer, dept, { archived: sp.archived === "1" }), deptPeople(dept)]);
  return (
    <div className="space-y-4">
      {header}
      <WorkClient
        dept={dept}
        tab={tab}
        filter={filter}
        tasks={tasks}
        projects={projects}
        people={people.map((p) => ({ id: p.id, name: p.name, position: p.position }))}
        access={{ rights: access.rights, readOnly: access.readOnly }}
        config={cfg}
        viewerId={viewer.id}
        openTaskId={sp.task ?? null}
        showArchived={sp.archived === "1"}
      />
    </div>
  );
}
