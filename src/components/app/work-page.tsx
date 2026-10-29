import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptAccess, deptPeople } from "@/server/departments";
import { listProjects, listTasks, type TaskFilter } from "@/server/work";
import { PageHeader } from "@/components/app/primitives";
import { POSITION_LABELS } from "@/lib/domain";
import { TASK_STATUSES, WORK_CONFIG, type WorkDept } from "@/lib/work";
import { WorkClient } from "./work-client";

const TABS = ["board", "list", "projects", "calendar"] as const;
const SORTS = ["updated", "due", "priority", "code", "title", "status"] as const;

// The Dev and Marketing sections share this page; only the vocabulary differs.
export async function WorkPage({ dept, searchParams }: { dept: WorkDept; searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const access = await deptAccess(viewer, dept);
  if (!access.view) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "board";
  const filter: TaskFilter = {
    q: sp.q ?? null,
    status: sp.status ? sp.status.split(",").filter((s) => (TASK_STATUSES as readonly string[]).includes(s)) : [],
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
  const cfg = WORK_CONFIG[dept];
  return (
    <div className="space-y-4">
      <PageHeader
        title={cfg.title}
        description={`${cfg.description}${access.readOnly ? " You are viewing as an owner (read only)." : access.position ? ` You are ${POSITION_LABELS[access.position].toLowerCase()} here.` : ""}`}
      />
      <WorkClient
        dept={dept}
        tab={tab}
        filter={filter}
        tasks={tasks}
        projects={projects}
        people={people.map((p) => ({ id: p.id, name: p.name, position: p.position }))}
        access={{ manage: access.manage, readOnly: access.readOnly }}
        viewerId={viewer.id}
        openTaskId={sp.task ?? null}
        showArchived={sp.archived === "1"}
      />
    </div>
  );
}
