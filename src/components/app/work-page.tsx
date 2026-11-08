import Link from "next/link";
import { Button } from "@/components/ui/button";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { deptPeople } from "@/server/departments";
import { getDeptConfig, workAccess } from "@/server/dept-config";
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
import { customDepartment, customDepartments } from "@/server/departments";
import { githubOverview } from "@/server/github";
import { accountingMap, ACCOUNTING_FORMATS } from "@/server/accounting";
import { GithubRepos } from "./github-repos";
import { FinanceAccounting } from "./integrations";
import { DEPT_VIEW_LABELS, DEPT_VIEWS, deptPath, deptViewPath } from "@/lib/work";
import { flowHome } from "@/server/dept-flow";

const TABS = ["dashboard", "board", "list", "sheet", "overview", "timeline", "team", "report", "projects", "calendar", "configure", "repos", "accounting", "sprint", "roadmap", "docs", "present", "tools", "analyze", "requests"] as const;
const SORTS = ["updated", "due", "priority", "code", "title", "status"] as const;

// The Dev and Marketing sections share this page; their vocabulary, workflow and rights come from the configuration.
// Each view has its own address (/dev/board); the old ?tab= links are sent there.
export async function WorkPage({ dept, searchParams, view }: { dept: WorkDept; searchParams: Promise<Record<string, string | undefined>>; view?: string }) {
  const viewer = await requireViewer();
  const access = await workAccess(viewer, dept).catch(() => null);
  if (!access) redirect("/dashboard?denied=permission");
  const cfg = access.config;
  const sp = await searchParams;
  if (view !== undefined && !(DEPT_VIEWS as readonly string[]).includes(view)) notFound();
  if (view === undefined && ((sp.tab && sp.tab !== "dashboard") || sp.task)) {
    const { tab: old, ...rest } = sp;
    const q = new URLSearchParams(Object.entries(rest).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
    redirect(deptViewPath(dept, (TABS as readonly string[]).includes(old ?? "") ? old! : "board", q));
  }
  // The dashboard is the department's home; a link to a task opens the board with it.
  const tab = (view ?? "dashboard") as (typeof TABS)[number];
  if ((tab === "configure" && !access.rights.configure) || ((tab === "team" || tab === "analyze") && !access.rights.seeAll)) redirect(deptViewPath(dept, "board"));
  // Department-specific tabs: GitHub for the Dev team, accounting exports for a Finance department.
  const template = (await customDepartment(dept))?.template ?? null;
  const extraTabs: { key: "repos" | "accounting"; label: string }[] = [
    ...(dept === "dev" || template === "dev" ? [{ key: "repos" as const, label: "Repositories" }] : []),
    ...(template === "finance" ? [{ key: "accounting" as const, label: "Accounting" }] : []),
  ];
  if ((tab === "repos" || tab === "accounting") && !extraTabs.some((t) => t.key === tab)) redirect(deptViewPath(dept, "board"));
  const period = isPeriod(sp.period) ? sp.period : "30d";
  const [sprints, timer] = await Promise.all([cfg.features.sprints ? listSprints(viewer, dept) : Promise.resolve([]), runningTimer(viewer)]);
  const header = (
    <PageHeader
      title={tab === "dashboard" ? cfg.title : `${cfg.title}: ${tab === "report" && !access.rights.seeAll ? "My report" : DEPT_VIEW_LABELS[tab]}`}
      description={`${cfg.description}${access.readOnly ? " You are viewing as an owner (read only)." : access.position ? ` You are ${POSITION_LABELS[access.position].toLowerCase()} here.` : ""}`}
    />
  );
  if (tab === "configure")
    return (
      <div className="space-y-4">
        {header}
        <DeptConfigure
          dept={dept}
          config={cfg}
          version={cfg.version}
          people={(await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name }))}
          departments={await requestDepartments(dept)}
        />
      </div>
    );
  // A presentation of the department for a meeting or an office screen (Phase 12c).
  if (tab === "present") {
    const { deckPage } = await import("@/server/deck-page");
    const { Deck } = await import("./deck/deck-client");
    const pg = await deckPage(viewer, `dept:${dept}`, sp.deck ?? null);
    return <Deck scope={`dept:${dept}`} {...pg} back={deptPath(dept)} presenter={sp.presenter === "1"} />;
  }
  if (tab === "requests") {
    const { myRequests, requestTargets } = await import("@/server/work-extras");
    const { all } = await import("@/server/db");
    const [targets, mine, incoming] = await Promise.all([
      requestTargets(viewer),
      myRequests(viewer),
      all<{
        id: string;
        dept: string;
        code: string;
        title: string;
        description: string | null;
        status: string;
        status_category: string;
        request_state: string | null;
        assignee_name: string | null;
        requested_by_name: string | null;
        created_at: string;
        due_date: string | null;
      }>(
        `SELECT t.id, t.dept, t.code, t.title, t.description, t.status, t.status_category, t.request_state,
                u.name AS assignee_name, r.name AS requested_by_name, t.created_at, t.due_date
         FROM dept_tasks t
         LEFT JOIN users u ON u.id = t.assignee_id
         LEFT JOIN users r ON r.id = t.requested_by
         WHERE t.dept = ? AND (t.request_state IS NOT NULL OR t.requested_by IS NOT NULL)
         ORDER BY t.created_at DESC LIMIT 100`,
        dept
      ),
    ]);
    const { DeptRequestsView } = await import("./dept-requests");
    const people = (await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name, position: p.position }));
    const projects = await listProjects(viewer, dept);
    return (
      <div className="space-y-4">
        {header}
        <Button variant="outline" asChild><Link href={`/resources?department=${encodeURIComponent(dept)}`}>Finance requests &amp; equipment</Link></Button>
        <WorkClient
          dept={dept}
          tab="board"
          filter={{}}
          tasks={[]}
          projects={projects}
          people={people}
          access={{ rights: access.rights, readOnly: access.readOnly }}
          config={cfg}
          viewerId={viewer.id}
          openTaskId={null}
          showArchived={false}
          sprints={sprints}
          timer={timer}
          extraTabs={extraTabs}
          panel={
            <DeptRequestsView
              dept={dept}
              deptTitle={cfg.title}
              canManage={access.rights.assign || access.rights.configure}
              targets={targets}
              incoming={incoming.map((x) => ({ ...x, deptTitle: cfg.title, statusLabel: x.status }))}
              outgoing={mine.map((x) => ({ ...x, description: null }))}
              people={people}
            />
          }
        />
      </div>
    );
  }
  if ((tab === "sprint" && !cfg.features.sprints) || ((tab === "roadmap" || tab === "docs") && !access.view)) redirect(deptViewPath(dept, "board"));
  if (tab === "tools" && !access.view) redirect(deptViewPath(dept, "board"));
  if (tab === "repos" || tab === "accounting" || tab === "sprint" || tab === "roadmap" || tab === "docs" || tab === "tools" || tab === "analyze") {
    const projects = await listProjects(viewer, dept);
    const ds = await import("@/server/dev-studio");
    const { SprintView, RoadmapView, DocsView } = await import("./dev-studio");
    const panel =
      tab === "analyze" ? (
        await (async () => {
          const { teamInsights } = await import("@/server/team-insights");
          const { aiAvailable } = await import("@/server/assistant-ai");
          const { TeamAnalyzer } = await import("./team-analyzer");
          const weeks = Number(sp.weeks) || 8;
          return <TeamAnalyzer dept={dept} data={await teamInsights(viewer, dept, { weeks })} ai={await aiAvailable(viewer)} taskHref={deptViewPath(dept, "board")} />;
        })()
      ) : tab === "sprint" ? (
        <SprintView dept={dept} data={await ds.sprintPage(viewer, dept, sp.sprint ?? null)} viewerId={viewer.id} />
      ) : tab === "roadmap" ? (
        <RoadmapView data={await ds.roadmap(viewer, dept)} dora={await ds.doraMeasures(viewer, dept)} />
      ) : tab === "tools" ? (
        await (async () => {
          const dt = await import("@/server/dev-tools");
          const dpl = await import("@/server/dev-plan");
          const { DevToolsView } = await import("./dev-tools-view");
          return (
            <DevToolsView
              dept={dept}
              releaseReview={await (await import("@/server/release-proposals")).releaseProposals(viewer,dept)}
              releases={await dt.releasesWithDeploys(viewer, dept)}
              incidents={await dt.listIncidents(viewer, dept)}
              cases={await dt.listTestCases(viewer, dept)}
              docs={(await ds.listDocs(viewer, dept)).map((x) => ({ id: x.id, title: x.title, kind: x.kind }))}
              templates={await dpl.listTemplates(viewer, dept)}
              tools={access.rights.configure ? await dt.toolsView(viewer, dept) : null}
              nextVersion={await dt.nextVersion(dept)}
              canWrite={!access.readOnly}
              canProjects={access.rights.projects && !access.readOnly}
              canConfigure={access.rights.configure}
              epics={await dpl.epics(viewer, dept)}
              drift={await dpl.baselineDrift(viewer, dept)}
              portfolio={access.rights.seeAll ? await dpl.portfolio(viewer) : null}
            />
          );
        })()
      ) : tab === "docs" ? (
        <DocsView
          dept={dept}
          docs={await ds.listDocs(viewer, dept)}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          people={(await deptPeople(dept)).map((p) => ({ id: p.id, name: p.name }))}
          openId={sp.doc ?? null}
          workspace={(await getSettings()).workspace.name}
        />
      ) : tab === "repos" ? (
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
    const [projects, people, flow] = await Promise.all([listProjects(viewer, dept), deptPeople(dept), flowHome(viewer, dept)]);
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
          flow={flow}
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
    tab === "report" ? deptReport(viewer, dept, period, {person:sp.person,project:sp.project,status:sp.status,sprint:sp.sprint,projectStatus:sp.projectStatus}) : Promise.resolve(null),
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
        baselines={tab === "timeline" ? await (await import("@/server/dev-plan")).baselines(viewer, dept).catch(() => ({})) : undefined}
      />
    </div>
  );
}

// Other departments a flow stage may hand work to (those that take requests).
async function requestDepartments(self: string) {
  const keys = ["dev", "marketing", ...(await customDepartments()).map((c) => c.key)].filter((k) => k !== self);
  const out: { key: string; title: string }[] = [];
  for (const k of keys) {
    const c = await getDeptConfig(k).catch(() => null);
    if (c?.features.requests) out.push({ key: k, title: c.title });
  }
  return out;
}
