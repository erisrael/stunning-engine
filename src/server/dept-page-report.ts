// "PDF report" on every page of a department (Board, List, Sheet, Timeline, Calendar, Projects, Sprint, Roadmap,
// Team, Releases, Specs and docs, Access): what the page shows, with its filters, in the company format
// (src/server/report-doc.ts), ready to save as PDF. People get only what they may see, and only what was shared to
// download (view-only work is left out).

import { workAccess } from "./dept-config";
import { listProjects, listTasks, type Project, type Task, type TaskFilter } from "./work";
import { reportBrand, reportDocument, table, tiles, bar, callout, esc, type ReportSection } from "./report-doc";
import { labelOf } from "@/lib/dept-config";
import { isPeriod, type Period } from "@/lib/dashboards";
import { DEPT_VIEW_LABELS } from "@/lib/work";
import type { AppUser } from "./users";

export { REPORT_VIEWS, hasReport } from "@/lib/work";

const TASK_VIEWS = ["board", "list", "sheet", "data", "calendar", "overview", "requests"];

function taskFilter(q: URLSearchParams, statuses: string[]): TaskFilter {
  const s = q.get("status");
  return {
    q: q.get("q"),
    status: s && s !== "open" ? s.split(",").filter((x) => statuses.includes(x)) : [],
    open: s === "open",
    assignee: q.get("assignee"),
    project: q.get("project"),
    type: q.get("type"),
    priority: q.get("priority"),
    due: (["overdue", "week", "none"] as const).find((x) => x === q.get("due")) ?? null,
    sprint: q.get("sprint"),
    request: q.get("request") === "pending" ? "pending" : null,
    exportable: true,
    sort: "code",
    dir: "asc",
  };
}

const day = (v: string | null | undefined) => (v ? v.slice(0, 10) : "");
const today = () => new Date().toISOString().slice(0, 10);

export async function deptPageReportHtml(user: AppUser, d: string, view: string, q: URLSearchParams): Promise<string> {
  const a = await workAccess(user, d);
  const cfg = a.config;
  const brand = await reportBrand();
  const viewLabel = view === "tools" ? "Releases and quality" : ((DEPT_VIEW_LABELS as Record<string, string>)[view] ?? "Report");
  const unit = cfg.sprint?.unit === "points" ? "pts" : "h";
  const units = (t: Task) => (cfg.sprint?.unit === "points" ? (t.points ?? 0) : (t.estimate_hours ?? 0));
  const projects = await listProjects(user, a.dept);
  const projectName = (id: string | null) => (id ? (projects.find((p) => p.id === id) ?? null) : null);
  const filters: string[] = [];
  const control: [string, string][] = [];
  let sections: ReportSection[] = [];
  let landscape = true;

  // ---------------- task pages ----------------
  if (TASK_VIEWS.includes(view) || view === "timeline") {
    const f = taskFilter(q, cfg.statuses.map((s) => s.key));
    const { tasks } = await listTasks(user, a.dept, f);
    if (f.project) filters.push(`Project: ${projectName(f.project)?.name ?? f.project}`);
    if (f.assignee) filters.push(`Assignee: ${f.assignee === "me" ? user.name : f.assignee === "none" ? "Nobody yet" : (tasks.find((t) => t.assignee_id === f.assignee)?.assignee_name ?? "Someone")}`);
    if (f.type) filters.push(`Type: ${labelOf(cfg.types, f.type)}`);
    if (f.priority) filters.push(`Priority: ${labelOf(cfg.priorities, f.priority)}`);
    if (f.status?.length) filters.push(`Status: ${f.status.map((s) => labelOf(cfg.statuses, s)).join(", ")}`);
    if (f.open) filters.push("Open work only");
    if (f.due) filters.push({ overdue: "Overdue", week: "Due this week", none: "No due date" }[f.due]);
    if (f.sprint) filters.push(`Sprint: ${f.sprint === "current" ? "Current" : f.sprint === "none" ? "No sprint" : (tasks.find((t) => t.sprint_id === f.sprint)?.sprint_name ?? f.sprint)}`);
    if (f.q) filters.push(`Search: “${f.q}”`);
    const now = today();
    const cat = (c: string) => tasks.filter((t) => t.status_category === c);
    const overdue = tasks.filter((t) => t.due_date && t.due_date < now && !["done", "cancelled"].includes(t.status_category));
    const summary = tiles([
      ["Tasks", tasks.length],
      ["To do", cat("open").length],
      ["In progress", cat("active").length],
      ["In review", cat("review").length],
      ["Done", cat("done").length],
      ["Overdue", overdue.length],
      ["Nobody assigned", tasks.filter((t) => !t.assignee_id && t.status_category !== "done").length],
      [`Total ${unit}`, Math.round(tasks.reduce((n, t) => n + units(t), 0) * 10) / 10],
    ]);
    const row = (t: Task) => [t.code, t.title, t.project_key ?? "", t.assignee_name ?? "Nobody yet", labelOf(cfg.priorities, t.priority), day(t.start_date), day(t.due_date), units(t) || ""];
    const head = ["Code", "Task", "Project", "Assignee", "Priority", "Start", "Due", unit];
    sections.push({ id: "summary", title: "Summary", html: summary + (overdue.length ? callout("Overdue", `<p>${overdue.slice(0, 12).map((t) => `<strong>${esc(t.code)}</strong> ${esc(t.title)} (due ${esc(day(t.due_date))})`).join("<br>")}</p>`) : "") });

    if (view === "timeline") {
      // A Gantt drawn with bars: every task with dates, by project, on one scale.
      const dated = tasks.filter((t) => t.start_date || t.due_date);
      const start = dated.map((t) => (t.start_date ?? t.due_date)!).sort()[0] ?? now;
      const end = dated.map((t) => (t.due_date ?? t.start_date)!).sort().at(-1) ?? now;
      const span = Math.max(1, (Date.parse(end) - Date.parse(start)) / 864e5 + 1);
      const gantt = (t: Task) => {
        const s = (Date.parse((t.start_date ?? t.due_date)!) - Date.parse(start)) / 864e5;
        const e = (Date.parse((t.due_date ?? t.start_date)!) - Date.parse(start)) / 864e5 + 1;
        const color = t.status_category === "done" ? "#16a34a" : t.due_date && t.due_date < now ? "#dc2626" : "#7b68ee";
        return `<span class="rep-gantt"><span style="left:${(s / span) * 100}%;width:${Math.max(1.5, ((e - s) / span) * 100)}%;background:${color}"></span></span>`;
      };
      control.push(["Dates", `${start} to ${end}`]);
      const groups = [...new Set(dated.map((t) => t.project_key ?? "No project"))];
      for (const g of groups) {
        const list = dated.filter((t) => (t.project_key ?? "No project") === g).sort((x, y) => (x.start_date ?? x.due_date ?? "").localeCompare(y.start_date ?? y.due_date ?? ""));
        const p = projects.find((x) => x.key === g);
        sections.push({ id: `tl-${g}`, title: p ? `${p.key} ${p.name}` : g, html: table(["Code", "Task", "Assignee", "Status", "Start", "Due", `${start} → ${end}`], list.map((t) => [t.code, t.title, t.assignee_name ?? "", labelOf(cfg.statuses, t.status), day(t.start_date), day(t.due_date), gantt(t)]), [], [6]) });
      }
      const undated = tasks.filter((t) => !t.start_date && !t.due_date);
      if (undated.length) sections.push({ id: "undated", title: "Without dates", html: table(head, undated.map(row), [7]) });
    } else if (view === "calendar") {
      landscape = false;
      const weekOf = (v: string) => {
        const dt = new Date(`${v}T00:00:00Z`);
        dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
        return dt.toISOString().slice(0, 10);
      };
      const due = tasks.filter((t) => t.due_date).sort((x, y) => x.due_date!.localeCompare(y.due_date!));
      for (const w of [...new Set(due.map((t) => weekOf(t.due_date!)))])
        sections.push({ id: `wk-${w}`, title: `Week of ${w}`, html: table(["Due", "Code", "Task", "Assignee", "Status"], due.filter((t) => weekOf(t.due_date!) === w).map((t) => [day(t.due_date), t.code, t.title, t.assignee_name ?? "", labelOf(cfg.statuses, t.status)])) });
      if (!due.length) sections.push({ id: "none", title: "Due dates", html: "<p>Nothing has a due date.</p>" });
    } else {
      // By stage, in the order of the flow.
      for (const s of cfg.statuses) {
        const list = tasks.filter((t) => t.status === s.key);
        if (list.length) sections.push({ id: `st-${s.key}`, title: `${s.label} (${list.length})`, html: table(head, list.map(row), [7]) });
      }
    }
  }

  // ---------------- projects and roadmap ----------------
  else if (view === "projects" || view === "roadmap") {
    const visible = new Set(projects.map((p) => p.id));
    const tops = projects.filter((p) => !p.archived && (!p.parent_id || !visible.has(p.parent_id)));
    const parts = (p: Project) => projects.filter((x) => x.parent_id === p.id && !x.archived);
    const r = (p: Project) => p.rollup ?? p;
    const health = view === "roadmap" ? new Map((await (await import("./dev-studio")).roadmap(user, a.dept)).projects.map((x) => [x.id, x])) : null;
    const healthText: Record<string, string> = { done: "Finished", on_track: "On track", at_risk: "At risk", late: "Late" };
    const all = tops.flatMap((p) => [p, ...parts(p)]);
    sections.push({
      id: "summary",
      title: "Summary",
      html: tiles([
        ["Main projects", tops.length],
        ["Sub-projects", projects.filter((p) => p.parent_id && !p.archived).length],
        ["Tasks", tops.reduce((n, p) => n + r(p).total, 0)],
        ["Done", tops.reduce((n, p) => n + r(p).done, 0)],
        ["Open", tops.reduce((n, p) => n + r(p).open, 0)],
        ["Overdue", tops.reduce((n, p) => n + r(p).overdue, 0)],
      ]) + table(["Main project", "Status", "Progress", "Done", "Open", "Overdue", "Sub-projects", ...(health ? ["Health"] : [])], tops.map((p) => [`${p.key} ${p.name}`, labelOf(cfg.projectStatuses, p.status), bar(r(p).progress, p.color ?? undefined), `${r(p).done}/${r(p).total}`, r(p).open, r(p).overdue, parts(p).length, ...(health ? [healthText[health.get(p.id)?.health ?? ""] ?? ""] : [])]), [3, 4, 5, 6], [2]),
    });
    for (const p of tops) {
      const list = [p, ...parts(p)];
      const ms = list.flatMap((x) => x.milestones.map((m) => [x.key, m.name, m.due_date ?? "", m.status === "done" ? "Done" : "Open", `${m.done}/${m.total}`]));
      sections.push({
        id: `p-${p.key}`,
        title: `${p.key} ${p.name}`,
        html:
          (p.description ? `<p>${esc(p.description)}</p>` : "") +
          table(["Project", "Status", "Lead", "Start", "Due", "Progress", "Done", "Open", "Overdue"], list.map((x) => [`${x.id === p.id ? "" : "↳ "}${x.key} ${x.name}`, labelOf(cfg.projectStatuses, x.status), x.lead_name ?? "", x.start_date ?? "", x.due_date ?? "Ongoing", bar(x.progress, x.color ?? undefined), `${x.done}/${x.total}`, x.open, x.overdue]), [6, 7, 8], [5]) +
          (ms.length ? `<h2 class="rep-sub">Milestones</h2>${table(["Project", "Milestone", "Due", "State", "Tasks done"], ms)}` : ""),
      });
    }
    if (!all.length) sections = [{ id: "none", title: "Projects", html: "<p>No projects to show.</p>" }];
  }

  // ---------------- sprint ----------------
  else if (view === "sprint") {
    const sp = await (await import("./dev-studio")).sprintPage(user, a.dept, q.get("sprint"));
    const s = sp.current;
    if (!s) sections.push({ id: "none", title: "Sprint", html: "<p>No sprint yet.</p>" });
    else {
      control.push(["Sprint", `${s.name} (${s.status})`], ["Dates", `${s.start_date ?? ""} to ${s.end_date ?? ""}`]);
      const done = sp.tasks.filter((t) => t.done);
      const committed = sp.tasks.reduce((n, t) => n + t.units, 0);
      const doneUnits = done.reduce((n, t) => n + t.units, 0);
      sections.push({
        id: "summary",
        title: "Summary",
        html: tiles([["Tasks", sp.tasks.length], ["Done", done.length], [`Committed ${unit}`, committed], [`Done ${unit}`, doneUnits], ["Progress", `${committed ? Math.round((doneUnits / committed) * 100) : 0}%`], ["Added late", sp.tasks.filter((t) => t.addedLate).length], ["Average velocity", sp.velocity.average ?? "None yet"]]) + (s.goal ? callout("Sprint goal", `<p>${esc(s.goal)}</p>`) : "") + (s.review_note ? callout("Review", `<p>${esc(s.review_note)}</p>`) : ""),
      });
      sections.push({ id: "tasks", title: "The sprint's work", html: table(["Code", "Task", "Type", "Status", "Assignee", unit, "Note"], sp.tasks.map((t) => [t.code, t.title, t.type, t.status, t.assignee ?? "Nobody yet", t.units, t.addedLate ? "Added after the start" : ""]), [5]) });
      sections.push({ id: "capacity", title: "Capacity and load", html: table(["Person", `Capacity (${unit})`, `Planned (${unit})`, "Load"], sp.capacity.map((c) => [c.name, c.capacity, c.load, c.capacity ? bar((c.load / c.capacity) * 100, c.load > c.capacity ? "#dc2626" : "#16a34a") : ""]), [1, 2], [3]) });
      if (sp.retro.length) sections.push({ id: "retro", title: "Retrospective", html: table(["Kind", "Note", "By", "Task"], sp.retro.map((r) => [{ well: "Went well", improve: "To improve", action: "Action" }[r.kind] ?? r.kind, r.text, r.author ?? "", r.task_code ?? ""])) });
      if (sp.standups.length) sections.push({ id: "standups", title: "Stand-ups", html: table(["Day", "Person", "Yesterday", "Today", "Blockers"], sp.standups.slice(0, 60).map((x) => [x.day, x.name, x.yesterday ?? "", x.today ?? "", x.blockers ?? ""])) });
      sections.push({ id: "backlog", title: "Backlog (top 40)", html: table(["Code", "Task", "Type", "Priority", unit], sp.backlog.slice(0, 40).map((t) => [t.code, t.title, t.type, labelOf(cfg.priorities, t.priority), t.units]), [4]) });
    }
  }

  // ---------------- team ----------------
  else if (view === "team") {
    const period: Period = isPeriod(q.get("period")) ? (q.get("period") as Period) : "30d";
    const team = await (await import("./work-extras")).teamWorkload(user, a.dept, period);
    control.push(["Period", team.period.label]);
    sections.push({ id: "people", title: "Workload", html: table(["Person", "Position", "Open", "Estimated h", "Due this week h", "Capacity h/week", "Load", "Overdue", "Logged this week h", "Done in period"], team.people.map((p) => [p.name, p.position ?? "", p.open, p.hours, p.dueWeekHours, p.capacity, p.capacity ? bar((p.dueWeekHours / p.capacity) * 100, p.dueWeekHours > p.capacity ? "#dc2626" : "#16a34a") : "", p.overdue, p.logged, p.done]), [2, 3, 4, 5, 7, 8, 9], [6]) });
    for (const p of team.people.filter((x) => x.tasks.length))
      sections.push({ id: `who-${p.id ?? "none"}`, title: p.name, html: table(["Code", "Task", "Status", "Priority", "Due", "Estimate h"], p.tasks.map((t) => [t.code, t.title, labelOf(cfg.statuses, t.status), labelOf(cfg.priorities, t.priority), t.due_date ?? "", t.estimate_hours ?? ""]), [5]) });
  }

  // ---------------- releases ----------------
  else if (view === "tools") {
    const rel = await (await import("./dev-tools")).releasesWithDeploys(user, a.dept);
    sections.push({ id: "envs", title: "Environments", html: table(["Environment", "Live version", "Since"], rel.environments.map((e) => [e.name, e.latest?.version ?? "", day(e.latest?.at)])) });
    sections.push({ id: "releases", title: "Releases", html: table(["Release", "Version", "Tasks", "Date", "Deployments"], rel.releases.map((r) => [r.name, r.version ?? "", r.task_count, day(r.created_at), r.deployments.map((x) => `${x.environment} ${x.status}`).join(", ")]), [2]) });
    sections.push({ id: "deploys", title: "Deployments", html: table(["When", "Environment", "Version", "Status"], rel.deployments.map((x) => [x.at.slice(0, 16).replace("T", " "), x.environment, x.version ?? "", x.status])) });
  }

  // ---------------- documents ----------------
  else if (view === "docs") {
    landscape = false;
    const docs = await (await import("./dev-studio")).listDocs(user, a.dept);
    const kinds = [...new Set(docs.map((x) => x.kind))];
    sections.push({ id: "summary", title: "Summary", html: tiles([["Documents", docs.length], ["Approved", docs.filter((x) => x.status === "approved").length], ["In review", docs.filter((x) => x.status === "review").length], ["Drafts", docs.filter((x) => x.status === "draft").length]]) });
    for (const k of kinds) sections.push({ id: `k-${k}`, title: k.charAt(0).toUpperCase() + k.slice(1), html: table(["Title", "Status", "Version", "Project", "Author", "Updated"], docs.filter((x) => x.kind === k).map((x) => [x.title, x.status, `v${x.version}`, x.project ?? "", x.author ?? "", day(x.updatedAt)]), [2]) });
  }

  // ---------------- access ----------------
  else if (view === "access") {
    const ov = await (await import("./dept-access")).accessOverview(user, a.dept);
    const open = ov.events.filter((e) => !e.reviewedAt);
    sections.push({ id: "summary", title: "Summary", html: tiles([["Shares", ov.shares.length], ["View only", ov.shares.filter((s) => s.level === "view").length], ["View and download", ov.shares.filter((s) => s.level !== "view").length], ["Alerts to review", open.length]]) });
    sections.push({ id: "shares", title: "What is shared with whom", html: table(["Item", "Kind", "With", "Level", "By", "Since"], ov.shares.map((s) => [s.title, s.kind, s.name, s.level === "view" ? "View only" : "View and download", s.by ?? "", day(s.at)])) });
    sections.push({ id: "alerts", title: "Access alerts", html: table(["Last", "Person", "What happened", "On", "Times", "Reviewed"], ov.events.map((e) => [e.last.slice(0, 16).replace("T", " "), e.name, e.label, e.title ?? "", e.repeats, e.reviewedAt ? `${e.reviewer ?? ""}: ${e.outcome ?? ""}` : "Not yet"]), [4]) });
  }

  // ---------------- the team overview (Report, Insights, Analyze) ----------------
  else {
    const { overviewReportHtml } = await import("./dept-overview-export");
    return overviewReportHtml(user, a.dept, { project: q.get("project"), person: q.get("person"), type: q.get("type"), priority: q.get("priority"), sprint: q.get("sprint"), period: q.get("period") ? Number(q.get("period")) : null });
  }

  const date = today();
  const ref = `${a.dept.toUpperCase()}-${view.toUpperCase()}-${date.replace(/-/g, "")}`;
  return reportDocument({
    brand,
    title: `${cfg.title}: ${viewLabel}`,
    kind: `${viewLabel} report`,
    ref,
    landscape,
    control: [
      ...control,
      ["Filters", filters.join(" · ") || "None"],
      ["Prepared for", user.name],
      ["Generated", `${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC`],
      ...(a.rights.seeAll ? [] : ([["Scope", "Your own work and what was shared with you to download"]] as [string, string][])),
    ],
    sections,
  });
}
