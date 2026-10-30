import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptPeople } from "@/server/departments";
import { workAccess } from "@/server/dept-config";
import { deptViews, listProjects, listTasks, type TaskFilter } from "@/server/work";
import { PageHeader } from "@/components/app/primitives";
import { POSITION_LABELS } from "@/lib/domain";
import type { WorkDept } from "@/lib/work";
import { WorkClient } from "./work-client";
import { DeptConfigure } from "./dept-configure";
import { DeptDashboardView } from "./dept-dashboard-view";
import { deptReport, listSprints, runningTimer, teamWorkload } from "@/server/work-extras";
import { getSettings } from "@/server/settings";
import { isPeriod } from "@/lib/dashboards";
import { customDepartment } from "@/server/departments";
import { githubOverview } from "@/server/github";
import { accountingMap, ACCOUNTING_FORMATS } from "@/server/accounting";
import { GithubRepos } from "./github-repos";
import { FinanceAccounting } from "./integrations";
import { deptPath } from "@/lib/work";

const TABS = ["dashboard", "board", "list", "sheet", "overview", "timeline", "team", "report", "projects", "calendar", "configure", "repos", "accounting"] as const;
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
  if (tab === "team" && !access.rights.seeAll) tab = "board";
  // Department-specific tabs: GitHub for the Dev team, accounting exports for a Finance department.
  const template = (await customDepartment(dept))?.template ?? null;
  const extraTabs: { key: "repos" | "accounting"; label: string }[] = [
    ...(dept === "dev" || template === "dev" ? [{ key: "repos" as const, label: "Repositories" }] : []),
    ...(template === "finance" ? [{ key: "accounting" as const, label: "Accounting" }] : []),
  ];
  if ((tab === "repos" || tab === "accounting") && !extraTabs.some((t) => t.key === tab)) tab = "board";
  const period = isPeriod(sp.period) ? sp.period : "30d";
  const [sprints, timer] = await Promise.all([cfg.features.sprints ? listSprints(viewer, dept) : Promise.resolve([]), runningTimer(viewer)]);
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
        <DeptConfigure dept={dept} config={cfg} version={cfg.version} people={(await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name }))} />
      </div>
    );
  if (tab === "repos" || tab === "accounting") {
    const projects = await listProjects(viewer, dept);
    const panel =
      tab === "repos" ? (
        <GithubRepos dept={dept} data={await githubOverview(viewer, dept)} projects={projects.map((p) => ({ id: p.id, name: p.name }))} taskHref={deptPath(dept)} />
      ) : (
        <FinanceAccounting dept={dept} map={await accountingMap(viewer, dept)} types={cfg.types.map((t) => ({ key: t.key, label: t.label }))} formats={ACCOUNTING_FORMATS} canConfigure={access.rights.configure && !access.readOnly} />
      );
    return (
      <div className="space-y-4">
        {header}
        <WorkClient
          dept={dept}
          tab={tab}
          filter={{}}
          tasks={[]}
          projects={projects}
          people={(await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name, position: p.position }))}
          access={{ rights: access.rights, readOnly: access.readOnly }}
          config={cfg}
          viewerId={viewer.id}
          openTaskId={null}
          showArchived={false}
          sprints={sprints}
          timer={timer}
          extraTabs={extraTabs}
          panel={panel}
        />
      </div>
    );
  }
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
          sprints={sprints}
          timer={timer}
          extraTabs={extraTabs}
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
    sprint: sp.sprint ?? null,
    request: sp.request === "pending" ? "pending" : null,
    sort: (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as TaskFilter["sort"]) : tab === "board" ? undefined : "updated",
    dir: sp.dir === "asc" ? "asc" : "desc",
  };
  // The board orders cards by their position, so it ignores the list sort. Team and Report load their own data.
  const ownData = tab === "team" || tab === "report";
  const [{ tasks }, projects, people, views, team, report, settings] = await Promise.all([
    ownData ? Promise.resolve({ tasks: [] }) : listTasks(viewer, dept, tab === "board" ? { ...filter, sort: "status", dir: "asc" } : filter),
    listProjects(viewer, dept, { archived: sp.archived === "1" }),
    deptPeople(dept),
    deptViews(viewer, dept),
    tab === "team" ? teamWorkload(viewer, dept, period) : Promise.resolve(null),
    tab === "report" ? deptReport(viewer, dept, period) : Promise.resolve(null),
    getSettings(),
  ]);
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
        views={views}
        sprints={sprints}
        timer={timer}
        team={team}
        report={report}
        period={period}
        workspace={settings.workspace.name}
        extraTabs={extraTabs}
      />
    </div>
  );
}
