// Department configuration: the vocabulary, workflow, fields and rights of a work department (Dev, Marketing),
// stored as data and edited in the department's Configure tab. Shared by the server and the browser.
//
// Keys never change once created (tasks store them); labels, colours, order and on/off can change freely.
// Dashboards and reports count by status category, so renaming or adding statuses keeps the numbers right.

import { WORK_CONFIG, isBuiltInWorkDept, type WorkDept } from "./work";

export const STATUS_CATEGORIES = ["open", "active", "review", "done", "cancelled"] as const;
export type StatusCategory = (typeof STATUS_CATEGORIES)[number];
export const STATUS_CATEGORY_LABELS: Record<StatusCategory, string> = { open: "Not started", active: "In progress", review: "In review", done: "Done", cancelled: "Cancelled" };
// Not finished: counted as open work, and overdue when past the due date.
export const OPEN_CATEGORIES: StatusCategory[] = ["open", "active", "review"];

export const PROJECT_CATEGORIES = ["planning", "active", "paused", "done", "cancelled"] as const;
export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];
export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = { planning: "Planning", active: "Active", paused: "Paused", done: "Done", cancelled: "Cancelled" };
export const LIVE_PROJECT_CATEGORIES: ProjectCategory[] = ["planning", "active", "paused"];

export const FIELD_TYPES = ["text", "longtext", "number", "money", "date", "select", "multiselect", "person", "url", "checkbox", "rating"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];
export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text",
  longtext: "Long text",
  number: "Number",
  money: "Money",
  date: "Date",
  select: "Single choice",
  multiselect: "Multiple choice",
  person: "Person",
  url: "Link",
  checkbox: "Checkbox",
  rating: "Rating (1 to 5)",
};

export const CONFIG_POSITIONS = ["head", "lead", "member"] as const;
export type ConfigPosition = (typeof CONFIG_POSITIONS)[number];

export const RIGHTS = [
  { key: "seeAll", label: "See everyone's tasks", hint: "Off: only tasks they are assigned or created" },
  { key: "editAll", label: "Edit and move everyone's tasks" },
  { key: "assign", label: "Assign tasks to other people" },
  { key: "deleteAll", label: "Delete anyone's tasks", hint: "Everyone can delete tasks they created" },
  { key: "projects", label: "Create and edit projects and milestones" },
  { key: "restricted", label: "Move tasks out of restricted statuses", hint: "Statuses marked \"Only with the right\"" },
  { key: "kpis", label: "Record KPI results" },
  { key: "configure", label: "Configure the department", hint: "This screen" },
] as const;
export type Right = (typeof RIGHTS)[number]["key"];
export type Rights = Record<Right, boolean>;

export const FEATURES = [
  { key: "milestones", label: "Milestones" },
  { key: "estimates", label: "Estimates (hours)" },
  { key: "timeSpent", label: "Time spent (hours)" },
  { key: "progress", label: "Progress slider" },
  { key: "labels", label: "Labels" },
  { key: "startDate", label: "Start dates" },
  { key: "budget", label: "Project budget" },
  { key: "kpis", label: "KPIs and targets" },
  { key: "checklists", label: "Checklists on tasks" },
  { key: "review", label: "Review step (a reviewer approves or sends back)" },
  { key: "subtasks", label: "Subtasks" },
  { key: "dependencies", label: "Dependencies (blocked by)" },
  { key: "timeTracking", label: "Time tracking (timer and time entries)" },
  { key: "recurring", label: "Recurring tasks" },
  { key: "attachments", label: "File attachments" },
  { key: "sprints", label: "Sprints" },
  { key: "requests", label: "Requests from other departments" },
] as const;
export type Feature = (typeof FEATURES)[number]["key"];

export type DeptStatus = { key: string; label: string; category: StatusCategory; color: string; limit: number | null; restricted: boolean; onBoard: boolean; active: boolean };
export type ChecklistLine = { text: string; verify: boolean };
// verify: a lead (someone who edits everyone's tasks) or the reviewer must check it too.
export type DeptType = { key: string; label: string; color: string; active: boolean; checklist: ChecklistLine[] };
export type DeptTemplate = { key: string; label: string; title: string; description: string; type: string; priority: string; estimate: number | null; checklist: ChecklistLine[]; subtasks: string[] };

export const AUTOMATION_TRIGGERS = [
  { key: "created", label: "A task is created" },
  { key: "status", label: "A task moves to a status" },
  { key: "subtasks_done", label: "All subtasks of a task are done" },
] as const;
export const AUTOMATION_ACTIONS = [
  { key: "assign", label: "Assign to", value: "person" },
  { key: "priority", label: "Set priority", value: "priority" },
  { key: "status", label: "Move to status", value: "status" },
  { key: "progress", label: "Set progress to (%)", value: "number" },
  { key: "notify_reporter", label: "Notify the creator", value: null },
  { key: "notify_assignee", label: "Notify the assignee", value: null },
  { key: "notify_managers", label: "Notify heads and leads", value: null },
] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number]["key"];
export type AutomationAction = (typeof AUTOMATION_ACTIONS)[number]["key"];
export type DeptAutomation = { key: string; label: string; when: AutomationTrigger; status: string | null; type: string | null; actions: { do: AutomationAction; value: string | null }[]; active: boolean };
export type DeptPriority = { key: string; label: string; color: string; active: boolean };
export type DeptProjectStatus = { key: string; label: string; category: ProjectCategory; active: boolean };
export type DeptField = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
  help: string;
  // Required from this status category on (null: never required); "open" means always.
  requiredFrom: StatusCategory | null;
  types: string[]; // task types that show it; empty: all
  onCard: boolean;
  inList: boolean;
  leadsOnly: boolean; // only people who can edit everyone's tasks may change it
  active: boolean;
};
export type DeptKpi = { key: string; label: string; unit: string; higherIsBetter: boolean; active: boolean };

export type DeptConfig = {
  title: string;
  description: string;
  names: { project: string; projects: string; task: string; tasks: string; milestone: string };
  codePrefix: string;
  statuses: DeptStatus[];
  types: DeptType[];
  priorities: DeptPriority[];
  labels: string[];
  projectStatuses: DeptProjectStatus[];
  fields: DeptField[];
  kpis: DeptKpi[];
  rights: Record<ConfigPosition, Rights>;
  features: Record<Feature, boolean>;
  notify: { assigned: boolean; statusToReporter: boolean; reviewToManagers: boolean; comments: boolean };
  templates: DeptTemplate[];
  automations: DeptAutomation[];
  // Requests from other departments: which types people may ask for, and a note shown on the request form.
  intake: { types: string[]; intro: string };
};

const PALETTE = ["#64748b", "#0ea5e9", "#7b68ee", "#f59e0b", "#22c55e", "#ef4444", "#ec4899", "#14b8a6", "#a855f7", "#f97316"];
export const colorAt = (i: number) => PALETTE[i % PALETTE.length]!;

const ALL_RIGHTS: Rights = { seeAll: true, editAll: true, assign: true, deleteAll: true, projects: true, restricted: true, kpis: true, configure: true };

// Today's fixed values for Dev and Marketing, so nothing changes until someone edits the configuration. Other
// departments start from a template (deptTemplateConfig) when they are created; this is only their fallback.
export function defaultConfig(dept: WorkDept): DeptConfig {
  if (!isBuiltInWorkDept(dept)) return deptTemplateConfig("blank", dept, dept.toUpperCase().slice(0, 4));
  const w = WORK_CONFIG[dept];
  const marketing = dept === "marketing";
  return {
    title: w.title,
    description: w.description,
    names: { project: w.project, projects: w.projects, task: "Task", tasks: "Tasks", milestone: "Milestone" },
    codePrefix: dept === "dev" ? "DEV" : "MKT",
    statuses: [
      { key: "backlog", label: "Backlog", category: "open", color: "#94a3b8", limit: null, restricted: false, onBoard: true, active: true },
      { key: "todo", label: "To do", category: "open", color: "#64748b", limit: null, restricted: false, onBoard: true, active: true },
      { key: "in_progress", label: "In progress", category: "active", color: "#0ea5e9", limit: null, restricted: false, onBoard: true, active: true },
      { key: "review", label: "In review", category: "review", color: "#f59e0b", limit: null, restricted: false, onBoard: true, active: true },
      { key: "done", label: "Done", category: "done", color: "#22c55e", limit: null, restricted: false, onBoard: true, active: true },
      { key: "cancelled", label: "Cancelled", category: "cancelled", color: "#a1a1aa", limit: null, restricted: false, onBoard: false, active: true },
    ],
    types: w.taskTypes.map((t, i) => ({ key: t.key, label: t.label, color: colorAt(i + 1), active: true, checklist: [] })),
    priorities: [
      { key: "urgent", label: "Urgent", color: "#ef4444", active: true },
      { key: "high", label: "High", color: "#f97316", active: true },
      { key: "normal", label: "Normal", color: "#0ea5e9", active: true },
      { key: "low", label: "Low", color: "#94a3b8", active: true },
    ],
    labels: [],
    projectStatuses: [
      { key: "planning", label: "Planning", category: "planning", active: true },
      { key: "active", label: "Active", category: "active", active: true },
      { key: "on_hold", label: "On hold", category: "paused", active: true },
      { key: "done", label: "Done", category: "done", active: true },
      { key: "cancelled", label: "Cancelled", category: "cancelled", active: true },
    ],
    fields: [],
    kpis: w.metrics.map((m) => ({ key: m.key, label: m.label, unit: m.key === "spend" ? "ETB" : "", higherIsBetter: m.key !== "spend", active: true })),
    rights: {
      head: { ...ALL_RIGHTS },
      lead: { ...ALL_RIGHTS, configure: false },
      member: { seeAll: false, editAll: false, assign: false, deleteAll: false, projects: false, restricted: true, kpis: true, configure: false },
    },
    features: { ...BASE_FEATURES, kpis: marketing },
    notify: { assigned: true, statusToReporter: false, reviewToManagers: false, comments: true },
    templates: [],
    automations: [],
    intake: { types: [], intro: "" },
  };
}

const BASE_FEATURES: Record<Feature, boolean> = {
  milestones: true,
  estimates: true,
  timeSpent: true,
  progress: true,
  labels: true,
  startDate: true,
  budget: true,
  kpis: false,
  checklists: true,
  review: false,
  subtasks: true,
  dependencies: true,
  timeTracking: true,
  recurring: true,
  attachments: true,
  sprints: false,
  requests: false,
};

// ---------------------------------------------------------------------------
// Templates for new departments (Admin, Departments, New department)
// ---------------------------------------------------------------------------

export const DEPT_TEMPLATES = [
  { key: "support", label: "Support", hint: "Tickets from customers or staff: triage, waiting on the customer, resolved" },
  { key: "sales", label: "Sales", hint: "Leads and deals through a pipeline, with deal value and won or lost" },
  { key: "operations", label: "Operations", hint: "Recurring and one-off jobs, purchases and facilities" },
  { key: "hr", label: "HR", hint: "Hiring, onboarding and people requests (before the full HR module)" },
  { key: "finance", label: "Finance", hint: "Payments, invoices and approvals (before the full Finance module)" },
  { key: "blank", label: "Blank", hint: "A simple To do, In progress, Done board to shape yourself" },
] as const;
export type DeptTemplateKey = (typeof DEPT_TEMPLATES)[number]["key"];

const st = (key: string, label: string, category: StatusCategory, color: string, extra: Partial<DeptStatus> = {}): DeptStatus => ({ key, label, category, color, limit: null, restricted: false, onBoard: category !== "cancelled", active: true, ...extra });
const ty = (key: string, label: string, i: number, checklist: ChecklistLine[] = []): DeptType => ({ key, label, color: colorAt(i + 1), active: true, checklist });
const fd = (key: string, label: string, type: FieldType, extra: Partial<DeptField> = {}): DeptField => ({ key, label, type, options: [], help: "", requiredFrom: null, types: [], onCard: false, inList: true, leadsOnly: false, active: true, ...extra });
const kp = (key: string, label: string, unit = "", higherIsBetter = true): DeptKpi => ({ key, label, unit, higherIsBetter, active: true });

export function deptTemplateConfig(template: string, title: string, codePrefix: string): DeptConfig {
  const base: DeptConfig = {
    title,
    description: "",
    names: { project: "Project", projects: "Projects", task: "Task", tasks: "Tasks", milestone: "Milestone" },
    codePrefix,
    statuses: [st("todo", "To do", "open", "#64748b"), st("in_progress", "In progress", "active", "#0ea5e9"), st("done", "Done", "done", "#22c55e"), st("cancelled", "Cancelled", "cancelled", "#a1a1aa")],
    types: [ty("task", "Task", 0)],
    priorities: [
      { key: "urgent", label: "Urgent", color: "#ef4444", active: true },
      { key: "high", label: "High", color: "#f97316", active: true },
      { key: "normal", label: "Normal", color: "#0ea5e9", active: true },
      { key: "low", label: "Low", color: "#94a3b8", active: true },
    ],
    labels: [],
    projectStatuses: [
      { key: "planning", label: "Planning", category: "planning", active: true },
      { key: "active", label: "Active", category: "active", active: true },
      { key: "on_hold", label: "On hold", category: "paused", active: true },
      { key: "done", label: "Done", category: "done", active: true },
      { key: "cancelled", label: "Cancelled", category: "cancelled", active: true },
    ],
    fields: [],
    kpis: [],
    rights: {
      head: { ...ALL_RIGHTS },
      lead: { ...ALL_RIGHTS, configure: false },
      member: { seeAll: false, editAll: false, assign: false, deleteAll: false, projects: false, restricted: true, kpis: true, configure: false },
    },
    features: { ...BASE_FEATURES, budget: false },
    notify: { assigned: true, statusToReporter: true, reviewToManagers: false, comments: true },
    templates: [],
    automations: [],
    intake: { types: [], intro: "" },
  };
  switch (template) {
    case "support":
      return {
        ...base,
        description: "Tickets from customers and staff, from triage to resolved.",
        names: { project: "Queue", projects: "Queues", task: "Ticket", tasks: "Tickets", milestone: "Milestone" },
        statuses: [
          st("new", "New", "open", "#94a3b8"),
          st("triage", "Triage", "open", "#64748b"),
          st("in_progress", "In progress", "active", "#0ea5e9"),
          st("waiting", "Waiting on customer", "active", "#f59e0b"),
          st("resolved", "Resolved", "done", "#22c55e"),
          st("closed", "Closed", "cancelled", "#a1a1aa"),
        ],
        types: [ty("question", "Question", 0), ty("incident", "Incident", 1, [{ text: "Customer told the issue is fixed", verify: false }]), ty("request", "Request", 2)],
        fields: [
          fd("customer", "Customer", "text", { onCard: true }),
          fd("channel", "Channel", "select", { options: ["Phone", "Telegram", "Email", "In person", "App"] }),
          fd("satisfaction", "Satisfaction", "rating", { inList: false }),
        ],
        kpis: [kp("tickets", "Tickets resolved"), kp("first_response", "Hours to first response", "h", false)],
        features: { ...base.features, milestones: false, budget: false, requests: true },
        intake: { types: ["question", "incident", "request"], intro: "Describe the problem, who is affected and how to reach them." },
        automations: [
          { key: "urgent_incidents", label: "Incidents start as urgent", when: "created", status: null, type: "incident", actions: [{ do: "priority", value: "urgent" }, { do: "notify_managers", value: null }], active: true },
          { key: "resolved_notify", label: "Tell the creator when resolved", when: "status", status: "resolved", type: null, actions: [{ do: "notify_reporter", value: null }], active: true },
        ],
      };
    case "sales":
      return {
        ...base,
        description: "Leads and deals through the pipeline.",
        names: { project: "Campaign", projects: "Campaigns", task: "Deal", tasks: "Deals", milestone: "Milestone" },
        statuses: [
          st("lead", "Lead", "open", "#94a3b8"),
          st("contacted", "Contacted", "active", "#0ea5e9"),
          st("proposal", "Proposal", "active", "#7b68ee"),
          st("negotiation", "Negotiation", "review", "#f59e0b"),
          st("won", "Won", "done", "#22c55e"),
          st("lost", "Lost", "cancelled", "#ef4444", { onBoard: true }),
        ],
        types: [ty("school", "School", 0), ty("parent", "Parent or student", 1), ty("partner", "Partner", 2)],
        fields: [
          fd("company", "Organisation", "text", { onCard: true }),
          fd("contact", "Contact person", "text"),
          fd("phone", "Phone", "text", { inList: false }),
          fd("value", "Deal value", "money", { onCard: true, requiredFrom: "review" }),
          fd("source", "Source", "select", { options: ["Referral", "Website", "Social media", "Event", "Cold call"] }),
        ],
        kpis: [kp("revenue", "Revenue won", "ETB"), kp("deals", "Deals won")],
        features: { ...base.features, kpis: true, budget: true },
      };
    case "operations":
      return {
        ...base,
        description: "Recurring and one-off jobs, purchases and facilities.",
        names: { project: "Area", projects: "Areas", task: "Job", tasks: "Jobs", milestone: "Milestone" },
        statuses: [st("todo", "To do", "open", "#64748b"), st("in_progress", "In progress", "active", "#0ea5e9"), st("waiting", "Waiting", "active", "#f59e0b"), st("done", "Done", "done", "#22c55e"), st("cancelled", "Cancelled", "cancelled", "#a1a1aa")],
        types: [ty("job", "Job", 0), ty("purchase", "Purchase", 1, [{ text: "Quote attached", verify: false }, { text: "Approved", verify: true }]), ty("repair", "Repair", 2)],
        fields: [fd("cost", "Cost", "money"), fd("supplier", "Supplier", "text")],
        features: { ...base.features, requests: true },
        intake: { types: ["job", "purchase", "repair"], intro: "What is needed, where, and by when." },
      };
    case "hr":
      return {
        ...base,
        description: "Hiring, onboarding and people requests.",
        names: { project: "Position", projects: "Positions", task: "Case", tasks: "Cases", milestone: "Stage" },
        statuses: [st("new", "New", "open", "#94a3b8"), st("in_progress", "In progress", "active", "#0ea5e9"), st("approval", "Waiting for approval", "review", "#f59e0b"), st("done", "Done", "done", "#22c55e"), st("cancelled", "Cancelled", "cancelled", "#a1a1aa")],
        types: [ty("hiring", "Hiring", 0), ty("onboarding", "Onboarding", 1, [{ text: "Accounts created", verify: false }, { text: "Equipment handed over", verify: false }, { text: "Contract signed", verify: true }]), ty("leave", "Leave request", 2), ty("other", "Other", 3)],
        fields: [fd("person", "Employee", "person", { onCard: true })],
        features: { ...base.features, review: true, requests: true },
        rights: { ...base.rights, member: { ...base.rights.member, seeAll: false } },
        intake: { types: ["leave", "other"], intro: "HR requests are seen only by HR." },
      };
    case "finance":
      return {
        ...base,
        description: "Payments, invoices and approvals.",
        names: { project: "Budget", projects: "Budgets", task: "Item", tasks: "Items", milestone: "Milestone" },
        statuses: [st("submitted", "Submitted", "open", "#94a3b8"), st("checking", "Checking", "active", "#0ea5e9"), st("approval", "Waiting for approval", "review", "#f59e0b"), st("paid", "Paid", "done", "#22c55e"), st("rejected", "Rejected", "cancelled", "#ef4444", { onBoard: true })],
        types: [ty("payment", "Payment", 0, [{ text: "Receipt or invoice attached", verify: false }]), ty("invoice", "Invoice", 1), ty("expense", "Expense claim", 2, [{ text: "Receipt attached", verify: false }])],
        fields: [fd("amount", "Amount", "money", { onCard: true, requiredFrom: "open" }), fd("payee", "Payee", "text"), fd("reference", "Reference", "text", { inList: false })],
        features: { ...base.features, review: true, requests: true, budget: true },
        intake: { types: ["payment", "expense"], intro: "Attach the invoice or receipt." },
      };
    default:
      return base;
  }
}

export const ADMIN_RIGHTS: Rights = { ...ALL_RIGHTS };
export const NO_RIGHTS: Rights = { seeAll: false, editAll: false, assign: false, deleteAll: false, projects: false, restricted: false, kpis: false, configure: false };
export const READ_RIGHTS: Rights = { ...NO_RIGHTS, seeAll: true };

// A stable key from a label: "In QA" -> "in_qa", made unique against the keys already used.
export function makeKey(label: string, taken: string[]) {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "item";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

const str = (v: unknown, max = 80) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const color = (v: unknown, fallback: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback);
const bool = (v: unknown, fallback = false) => (typeof v === "boolean" ? v : fallback);
const KEY = /^[a-z][a-z0-9_]{0,31}$/;

function list<T extends { key: string }>(raw: unknown, what: string, each: (r: Record<string, unknown>, i: number) => T): T[] {
  if (!Array.isArray(raw)) throw new Error(`${what}: expected a list.`);
  const out: T[] = [];
  for (const [i, r] of raw.entries()) {
    if (!r || typeof r !== "object") continue;
    const item = each(r as Record<string, unknown>, i);
    if (!KEY.test(item.key)) throw new Error(`${what}: "${item.key}" is not a valid key.`);
    if (out.some((o) => o.key === item.key)) throw new Error(`${what}: "${item.key}" appears twice.`);
    out.push(item);
  }
  return out;
}

// Cleans a configuration from the editor (or an import) and checks it can work. Throws a plain message.
export function normalizeConfig(raw: unknown, dept: WorkDept): DeptConfig {
  const d = defaultConfig(dept);
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const names = (r.names ?? {}) as Record<string, unknown>;
  const statuses = list(r.statuses ?? d.statuses, "Statuses", (s, i) => {
    const category = (STATUS_CATEGORIES as readonly string[]).includes(s.category as string) ? (s.category as StatusCategory) : "open";
    const limit = Number(s.limit);
    return {
      key: str(s.key, 32),
      label: str(s.label, 40) || str(s.key, 32),
      category,
      color: color(s.color, colorAt(i)),
      limit: Number.isFinite(limit) && limit > 0 ? Math.round(limit) : null,
      restricted: bool(s.restricted),
      onBoard: bool(s.onBoard, category !== "cancelled"),
      active: bool(s.active, true),
    };
  });
  const live = statuses.filter((s) => s.active);
  if (!live.some((s) => s.category === "done")) throw new Error("Keep at least one status in the Done category switched on.");
  if (!live.some((s) => OPEN_CATEGORIES.includes(s.category))) throw new Error("Keep at least one status for unfinished work switched on.");
  const types = list(r.types ?? d.types, "Task types", (t, i) => ({
    key: str(t.key, 32),
    label: str(t.label, 40) || str(t.key, 32),
    color: color(t.color, colorAt(i)),
    active: bool(t.active, true),
    checklist: lines(t.checklist),
  }));
  if (!types.some((t) => t.active)) throw new Error("Keep at least one task type switched on.");
  const priorities = list(r.priorities ?? d.priorities, "Priorities", (p, i) => ({ key: str(p.key, 32), label: str(p.label, 40) || str(p.key, 32), color: color(p.color, colorAt(i)), active: bool(p.active, true) }));
  if (!priorities.some((p) => p.active)) throw new Error("Keep at least one priority switched on.");
  const projectStatuses = list(r.projectStatuses ?? d.projectStatuses, "Project statuses", (p) => ({
    key: str(p.key, 32),
    label: str(p.label, 40) || str(p.key, 32),
    category: (PROJECT_CATEGORIES as readonly string[]).includes(p.category as string) ? (p.category as ProjectCategory) : "active",
    active: bool(p.active, true),
  }));
  if (!projectStatuses.some((p) => p.active)) throw new Error("Keep at least one project status switched on.");
  const typeKeys = types.map((t) => t.key);
  const fields = list(r.fields ?? d.fields, "Fields", (f) => {
    const type = (FIELD_TYPES as readonly string[]).includes(f.type as string) ? (f.type as FieldType) : "text";
    const options = Array.isArray(f.options) ? [...new Set(f.options.map((o) => str(o, 60)).filter(Boolean))].slice(0, 50) : [];
    if ((type === "select" || type === "multiselect") && !options.length) throw new Error(`Field "${str(f.label, 40)}": add at least one choice.`);
    return {
      key: str(f.key, 32),
      label: str(f.label, 40) || str(f.key, 32),
      type,
      options: type === "select" || type === "multiselect" ? options : [],
      help: str(f.help, 160),
      requiredFrom: (STATUS_CATEGORIES as readonly string[]).includes(f.requiredFrom as string) ? (f.requiredFrom as StatusCategory) : null,
      types: Array.isArray(f.types) ? f.types.filter((t): t is string => typeof t === "string" && typeKeys.includes(t)) : [],
      onCard: bool(f.onCard),
      inList: bool(f.inList),
      leadsOnly: bool(f.leadsOnly),
      active: bool(f.active, true),
    };
  });
  const kpis = list(r.kpis ?? d.kpis, "KPIs", (k) => ({ key: str(k.key, 32), label: str(k.label, 40) || str(k.key, 32), unit: str(k.unit, 12), higherIsBetter: bool(k.higherIsBetter, true), active: bool(k.active, true) }));
  const rr = (r.rights ?? {}) as Record<string, Record<string, unknown>>;
  const rights = Object.fromEntries(
    CONFIG_POSITIONS.map((p) => [p, Object.fromEntries(RIGHTS.map((x) => [x.key, bool(rr[p]?.[x.key], d.rights[p][x.key])])) as Rights]),
  ) as Record<ConfigPosition, Rights>;
  // Someone must always be able to change the configuration back.
  if (!rights.head.configure) throw new Error("Heads must keep the right to configure the department.");
  const ff = (r.features ?? {}) as Record<string, unknown>;
  const nn = (r.notify ?? {}) as Record<string, unknown>;
  const statusKeys = statuses.map((x) => x.key);
  const priorityKeys = priorities.map((x) => x.key);
  const templates = list(r.templates ?? d.templates, "Templates", (t) => ({
    key: str(t.key, 32),
    label: str(t.label, 40) || str(t.key, 32),
    title: str(t.title, 200),
    description: typeof t.description === "string" ? t.description.slice(0, 4000) : "",
    type: typeKeys.includes(t.type as string) ? (t.type as string) : typeKeys[0]!,
    priority: priorityKeys.includes(t.priority as string) ? (t.priority as string) : (priorityKeys.includes("normal") ? "normal" : priorityKeys[0]!),
    estimate: Number.isFinite(Number(t.estimate)) && Number(t.estimate) > 0 ? Number(t.estimate) : null,
    checklist: lines(t.checklist),
    subtasks: Array.isArray(t.subtasks) ? t.subtasks.map((x) => str(x, 200)).filter(Boolean).slice(0, 30) : [],
  }));
  const actionKeys = AUTOMATION_ACTIONS.map((x) => x.key) as string[];
  const automations = list(r.automations ?? d.automations, "Automations", (a) => ({
    key: str(a.key, 32),
    label: str(a.label, 80) || "Automation",
    when: (AUTOMATION_TRIGGERS.map((x) => x.key) as string[]).includes(a.when as string) ? (a.when as AutomationTrigger) : "status",
    status: statusKeys.includes(a.status as string) ? (a.status as string) : null,
    type: typeKeys.includes(a.type as string) ? (a.type as string) : null,
    actions: (Array.isArray(a.actions) ? a.actions : [])
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && actionKeys.includes((x as Record<string, unknown>).do as string))
      .slice(0, 6)
      .map((x) => ({ do: x.do as AutomationAction, value: x.value == null || x.value === "" ? null : str(x.value, 60) })),
    active: bool(a.active, true),
  }));
  for (const a of automations) {
    if (a.when === "status" && !a.status) throw new Error(`Automation "${a.label}": choose the status it reacts to.`);
    if (!a.actions.length) throw new Error(`Automation "${a.label}": add at least one action.`);
    const bad = a.actions.find((x) => (x.do === "status" && !statusKeys.includes(x.value ?? "")) || (x.do === "priority" && !priorityKeys.includes(x.value ?? "")) || (x.do === "assign" && !x.value));
    if (bad) throw new Error(`Automation "${a.label}": choose a value for "${AUTOMATION_ACTIONS.find((x) => x.key === bad.do)!.label}".`);
  }
  const ii = (r.intake ?? {}) as Record<string, unknown>;
  const prefix = str(r.codePrefix, 8).toUpperCase() || d.codePrefix;
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(prefix)) throw new Error("The code prefix is 2 to 8 letters or digits, starting with a letter.");
  return {
    title: str(r.title, 40) || d.title,
    description: str(r.description, 300),
    names: {
      project: str(names.project, 24) || d.names.project,
      projects: str(names.projects, 24) || d.names.projects,
      task: str(names.task, 24) || d.names.task,
      tasks: str(names.tasks, 24) || d.names.tasks,
      milestone: str(names.milestone, 24) || d.names.milestone,
    },
    codePrefix: prefix,
    statuses,
    types,
    priorities,
    labels: Array.isArray(r.labels) ? [...new Set(r.labels.map((l) => str(l, 30).toLowerCase()).filter(Boolean))].slice(0, 60) : [],
    projectStatuses,
    fields,
    kpis,
    rights,
    features: Object.fromEntries(FEATURES.map((f) => [f.key, bool(ff[f.key], d.features[f.key])])) as Record<Feature, boolean>,
    notify: {
      assigned: bool(nn.assigned, d.notify.assigned),
      statusToReporter: bool(nn.statusToReporter, d.notify.statusToReporter),
      reviewToManagers: bool(nn.reviewToManagers, d.notify.reviewToManagers),
      comments: bool(nn.comments, d.notify.comments),
    },
    templates,
    automations,
    intake: { types: Array.isArray(ii.types) ? ii.types.filter((t): t is string => typeof t === "string" && typeKeys.includes(t)) : [], intro: str(ii.intro, 300) },
  };
}

function lines(raw: unknown): ChecklistLine[] {
  return Array.isArray(raw)
    ? raw
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({ text: str(x.text, 160), verify: bool(x.verify) }))
        .filter((x) => x.text)
        .slice(0, 30)
    : [];
}

// A checklist line on a task.
export type TaskCheck = { id: string; text: string; verify: boolean; done: boolean; doneBy: string | null; verifiedBy: string | null };

// Lookups used by every view.
export const statusOf = (c: DeptConfig, key: string) => c.statuses.find((s) => s.key === key);
export const categoryOf = (c: DeptConfig, key: string): StatusCategory => statusOf(c, key)?.category ?? "open";
export const labelOf = (items: { key: string; label: string }[], key: string) => items.find((i) => i.key === key)?.label ?? key;
export const priorityRank = (c: DeptConfig, key: string) => {
  const i = c.priorities.findIndex((p) => p.key === key);
  return i < 0 ? c.priorities.length : i;
};

const ORDER: StatusCategory[] = ["open", "active", "review", "done"];
// Whether a field must be filled for a task in this status.
export function fieldRequired(f: DeptField, category: StatusCategory) {
  if (!f.requiredFrom || category === "cancelled") return false;
  return ORDER.indexOf(category) >= ORDER.indexOf(f.requiredFrom);
}

export const fieldShown = (f: DeptField, type: string) => f.active && (!f.types.length || f.types.includes(type));

export type FieldValue = string | number | boolean | string[] | null;

export function fieldEmpty(v: FieldValue | undefined) {
  return v == null || v === "" || v === false || (Array.isArray(v) && !v.length);
}

export function formatField(f: DeptField, v: FieldValue | undefined, people?: { id: string; name: string }[]): string {
  if (fieldEmpty(v)) return "";
  if (f.type === "checkbox") return "Yes";
  if (f.type === "multiselect" && Array.isArray(v)) return v.join(", ");
  if (f.type === "person") return people?.find((p) => p.id === v)?.name ?? "";
  if (f.type === "money" || f.type === "number") return Number(v).toLocaleString("en-US");
  if (f.type === "rating") return "★".repeat(Number(v));
  return String(v);
}
