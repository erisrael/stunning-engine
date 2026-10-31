// Vocabulary of the work departments (shared by the server and the browser). Dev and Marketing are built in; more
// departments are created from templates in Admin, Departments, and live at /d/<key>.

export const WORK_DEPTS = ["dev", "marketing"] as const;
export type BuiltInWorkDept = (typeof WORK_DEPTS)[number];
// A built-in key or the key of a department created in Admin.
export type WorkDept = string;
export const isBuiltInWorkDept = (d: string): d is BuiltInWorkDept => (WORK_DEPTS as readonly string[]).includes(d);
export const deptPath = (d: string) => (isBuiltInWorkDept(d) ? `/${d}` : `/d/${d}`);

// Each view of a department has its own address: /dev is the dashboard, /dev/board, /dev/list and so on.
export const DEPT_VIEWS = ["board", "list", "sheet", "overview", "timeline", "calendar", "projects", "team", "report", "repos", "accounting", "configure"] as const;
export type DeptView = (typeof DEPT_VIEWS)[number];
export const DEPT_VIEW_LABELS: Record<DeptView | "dashboard", string> = {
  dashboard: "Home",
  board: "Board",
  list: "List",
  sheet: "Sheet",
  overview: "Overview",
  timeline: "Timeline",
  calendar: "Calendar",
  projects: "Projects",
  team: "Team",
  report: "Report",
  repos: "Repositories",
  accounting: "Accounting",
  configure: "Configure",
};
export const deptViewPath = (d: string, view: string, query = "") => `${deptPath(d)}${view && view !== "dashboard" ? `/${view}` : ""}${query ? `?${query.replace(/^[?&]/, "")}` : ""}`;
// Keys of new departments: lowercase letters, digits and dashes, not clashing with pages or built-in departments.
export const RESERVED_DEPT_KEYS = ["dev", "marketing", "studio", "production", "owners", "company", "admin", "new"];

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "review", "done", "cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = { backlog: "Backlog", todo: "To do", in_progress: "In progress", review: "In review", done: "Done", cancelled: "Cancelled" };
export const TASK_STATUS_TONE: Record<TaskStatus, string> = { backlog: "neutral", todo: "neutral", in_progress: "active", review: "paused", done: "done", cancelled: "neutral" };
export const OPEN_TASK_STATUSES: TaskStatus[] = ["backlog", "todo", "in_progress", "review"];

export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PROJECT_STATUSES = ["planning", "active", "on_hold", "done", "cancelled"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = { planning: "Planning", active: "Active", on_hold: "On hold", done: "Done", cancelled: "Cancelled" };

export const WORK_CONFIG: Record<
  BuiltInWorkDept,
  { title: string; project: string; projects: string; taskTypes: { key: string; label: string }[]; metrics: { key: string; label: string }[]; description: string }
> = {
  dev: {
    title: "Dev team",
    project: "Project",
    projects: "Projects",
    description: "Projects, milestones and tasks for the dev team. Heads and leads plan and assign; developers see and update their own tasks.",
    taskTypes: [
      { key: "feature", label: "Feature" },
      { key: "bug", label: "Bug" },
      { key: "improvement", label: "Improvement" },
      { key: "chore", label: "Chore" },
      { key: "research", label: "Research" },
    ],
    metrics: [],
  },
  marketing: {
    title: "Marketing",
    project: "Campaign",
    projects: "Campaigns",
    description: "Campaigns, the content calendar, tasks and KPIs. Heads and leads plan and assign; the team sees and updates their own tasks.",
    taskTypes: [
      { key: "social_post", label: "Social post" },
      { key: "design", label: "Design" },
      { key: "video", label: "Video" },
      { key: "ad", label: "Ad" },
      { key: "email", label: "Email" },
      { key: "article", label: "Article" },
      { key: "event", label: "Event" },
      { key: "other", label: "Other" },
    ],
    metrics: [
      { key: "reach", label: "Reach" },
      { key: "impressions", label: "Impressions" },
      { key: "clicks", label: "Clicks" },
      { key: "leads", label: "Leads" },
      { key: "signups", label: "Sign-ups" },
      { key: "spend", label: "Spend" },
    ],
  },
};
