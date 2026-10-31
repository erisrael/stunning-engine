// Shared domain vocabulary used by both the server and the client.

// Production roles first, then the department roles (Phase 5). Department positions (head, lead, member) are set in Admin.
export const ROLES = ["recording", "editing", "uploading", "publication", "manager", "admin", "owner", "developer", "content", "marketing", "hr_manager", "hr_officer", "finance_manager", "accountant"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  recording: "Recording",
  editing: "Editing",
  uploading: "Uploading",
  publication: "Publication",
  manager: "Manager",
  admin: "Admin",
  owner: "Owner",
  developer: "Developer",
  content: "Content (Studio)",
  marketing: "Marketing",
  hr_manager: "HR Manager",
  hr_officer: "HR Officer",
  finance_manager: "Finance Manager",
  accountant: "Accountant",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  recording: "Records sessions and logs camera codes for each part.",
  editing: "Edits footage and delivers the master, captions and thumbnail.",
  uploading: "Uploads approved masters to each destination and verifies playback.",
  publication: "Reviews, schedules and confirms releases.",
  manager: "Plans work, assigns owners, sets deadlines and follows delivery.",
  admin: "Manages people, roles, permissions, access and workspace data.",
  owner: "Company owner: sees stats and reports from every department.",
  developer: "Dev team: projects, milestones and tasks in Dev.",
  content: "Studio: notes, exams, question bank and flash cards.",
  marketing: "Marketing: campaigns, content calendar, tasks and KPIs.",
  hr_manager: "HR: employee records including salary and ID details, approvals, cases and HR settings.",
  hr_officer: "HR: employee records, documents, equipment and day-to-day people operations.",
  finance_manager: "Finance: approves payments, payroll checks, budgets, and closes periods.",
  accountant: "Finance: records bills, invoices, payments and claims, and prepares reports.",
};

// Capabilities that can be granted per role in Admin, Roles and permissions.
export const CAPABILITIES = [
  { key: "items.create", label: "Create new items (New item)", group: "Production" },
  { key: "items.plan", label: "Edit planning fields, owners and deadlines", group: "Production" },
  { key: "items.close", label: "Archive, cancel and restore items", group: "Production" },
  { key: "work.override", label: "Edit any stage's data (override owners)", group: "Production" },
  { key: "release.emergency", label: "Emergency release without the Publication role", group: "Production" },
  { key: "import.run", label: "Run planning and curriculum imports", group: "Import and export" },
  { key: "import.stage", label: "Import progress for their own stage (CSV, Excel, JSON)", group: "Import and export" },
  { key: "import.tracker", label: "Import the curriculum tracker JSON", group: "Import and export" },
  { key: "export.run", label: "Export Excel, CSV and JSON", group: "Import and export" },
  { key: "export.report", label: "Export the PDF report", group: "Import and export" },
  { key: "export.tracker", label: "Export the curriculum tracker JSON", group: "Import and export" },
  { key: "export.audit", label: "Export metadata and audit JSON", group: "Import and export" },
  { key: "nav.overview", label: "Overview", group: "Sidebar" },
  { key: "nav.questions", label: "Questions", group: "Sidebar" },
  { key: "nav.list", label: "List view", group: "Sidebar" },
  { key: "nav.sheet", label: "Sheet view", group: "Sidebar" },
  { key: "nav.board", label: "Board view", group: "Sidebar" },
  { key: "nav.calendar", label: "Calendar", group: "Sidebar" },
  { key: "nav.coverage", label: "Coverage", group: "Sidebar" },
  { key: "nav.team", label: "Team or My effort", group: "Sidebar" },
  { key: "nav.handovers", label: "Handovers", group: "Sidebar" },
  { key: "items.detail", label: "Open item pages (Page view); without it, work is done from the Home board", group: "Sidebar" },
  { key: "assign.bulk", label: "Assign work in bulk (Assign page)", group: "Editorial workflow" },
  { key: "checklists.manage", label: "Create and edit checklist templates", group: "Editorial workflow" },
  { key: "checklists.verify", label: "Verify checklist items done by others", group: "Editorial workflow" },
  { key: "reports.view", label: "View reports", group: "Insights" },
  { key: "team.view", label: "View team workload and capacity", group: "Insights" },
  { key: "corrections.approve", label: "Approve timer corrections", group: "Insights" },
  { key: "chat.manage", label: "Create chat groups and manage members", group: "Collaboration" },
  { key: "chat.channels", label: "Create channels (only channel admins post)", group: "Collaboration" },
  { key: "questions.ask", label: "Ask tracked questions", group: "Collaboration" },
  { key: "email.send", label: "Send email from the app", group: "Email" },
  { key: "email.manage", label: "Manage email settings, sender addresses and the full sent log", group: "Email" },
  { key: "dev.access", label: "Dev team section", group: "Departments" },
  { key: "studio.access", label: "Studio section (notes, exams, flash cards)", group: "Departments" },
  { key: "marketing.access", label: "Marketing section", group: "Departments" },
  { key: "owners.view", label: "Owners dashboard (stats and reports from every department, read only)", group: "Departments" },
  { key: "company.view", label: "Company overview: every department's dashboard, overall progress and money (read only)", group: "Departments" },
  { key: "chat.contact_owners", label: "Start direct chats with owners", group: "Collaboration" },
  { key: "hr.access", label: "HR section: employee records, org chart, documents and equipment", group: "HR" },
  { key: "hr.manage", label: "HR decisions: end employment, remove records, HR settings", group: "HR" },
  { key: "hr.sensitive", label: "See and edit salary grade, ID, tax and bank details", group: "HR" },
  { key: "hr.cases", label: "Confidential disciplinary and grievance cases", group: "HR" },
  { key: "attendance.manage", label: "Attendance for everyone: shifts, breaks and rules, badges and PINs, reviewing manual entries, flagged check-ins and corrections, reports", group: "HR" },
  { key: "attendance.capture", label: "Attendance capture setup: how people check in (QR posters, office networks, kiosks, phones)", group: "HR" },
  { key: "finance.access", label: "Finance section: record bills, invoices, payments, claims and purchases", group: "Finance" },
  { key: "finance.approve", label: "Approve payments, claims, purchases and payroll checks; close periods", group: "Finance" },
  { key: "finance.payroll", label: "Prepare payroll (salaries, allowances, deductions)", group: "Finance" },
  { key: "finance.view", label: "Read finance reports and dashboards", group: "Finance" },
  { key: "finance.owner_approve", label: "Give the final approval to payroll runs", group: "Finance" },
  { key: "settings.manage", label: "Change workflow settings", group: "Administration" },
  { key: "users.manage", label: "Manage users, roles, permissions and access", group: "Administration" },
  { key: "data.manage", label: "Empty, import and back up workspace data", group: "Administration" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["key"];

// Sidebar pages everyone sees unless Admin turns them off for a role.
export const NAV_CAPABILITIES: Capability[] = ["nav.overview", "nav.questions", "nav.list", "nav.sheet", "nav.board", "nav.calendar", "nav.coverage", "nav.team", "nav.handovers"];
// Editorial workflow tools; team leads get them for their own stage, Admin for every stage.
export const EDITORIAL_CAPABILITIES: Capability[] = ["assign.bulk", "checklists.manage", "checklists.verify"];
// Team members see their own work only: their Home board, questions and their own effort. Team leads see the whole
// workflow (Overview, lists, board, coverage, reports) on top of their role.
const STAFF: Capability[] = ["nav.questions", "nav.team"];
const FULL_VIEW: Capability[] = [...NAV_CAPABILITIES, "items.detail"];

export const DEFAULT_PERMISSIONS: Record<Role, Capability[]> = {
  recording: STAFF,
  editing: STAFF,
  uploading: STAFF,
  // Publication reviews and releases from the item page, with the release calendar.
  publication: [...STAFF, "nav.calendar", "items.detail"],
  // Managers follow delivery: they view everything but do not edit item data.
  manager: [...FULL_VIEW, "export.run", "export.report", "export.tracker", "export.audit", "reports.view", "team.view", "corrections.approve", "chat.manage", "chat.channels", "chat.contact_owners", "email.send", "questions.ask", "settings.manage", "company.view"],
  // Department roles see their own section only; Admin can widen this in Roles and permissions.
  owner: ["owners.view", "company.view", "finance.view", "finance.owner_approve", "items.detail", "nav.overview", "nav.coverage", "reports.view", "team.view", "export.run", "export.report", "chat.channels", "chat.contact_owners", "email.send"],
  developer: ["dev.access"],
  content: ["studio.access"],
  marketing: ["marketing.access", "email.send"],
  hr_manager: ["hr.access", "hr.manage", "hr.sensitive", "hr.cases", "attendance.manage", "finance.payroll", "nav.questions", "email.send", "chat.channels"],
  hr_officer: ["hr.access", "attendance.manage", "nav.questions", "email.send"],
  finance_manager: ["finance.access", "finance.approve", "finance.payroll", "finance.view", "nav.questions", "email.send", "chat.channels", "company.view"],
  accountant: ["finance.access", "finance.view", "nav.questions", "email.send"],
  admin: [
    ...FULL_VIEW,
    "items.create",
    "items.plan",
    "items.close",
    "users.manage",
    "data.manage",
    "settings.manage",
    "chat.manage",
    "import.run",
    "import.stage",
    "import.tracker",
    "export.run",
    "export.report",
    "export.tracker",
    "export.audit",
    "reports.view",
    "team.view",
    "chat.channels",
    "chat.contact_owners",
    "email.send",
    "email.manage",
    "dev.access",
    "studio.access",
    "marketing.access",
    "owners.view",
    "company.view",
    "hr.access",
    "hr.manage",
    "attendance.manage",
    "attendance.capture",
    ...EDITORIAL_CAPABILITIES,
  ],
};

// Departments group people by role. Heads and leads (Admin, Departments) see and assign the whole department's
// work; members see their own. Production keeps its stage team leads.
export const DEPARTMENTS = ["production", "dev", "studio", "marketing"] as const;
export type Department = (typeof DEPARTMENTS)[number];
export const DEPARTMENT_LABELS: Record<Department, string> = { production: "Production", dev: "Dev team", studio: "Studio", marketing: "Marketing" };
export const DEPARTMENT_ROLES: Record<Department, Role[]> = {
  production: ["recording", "editing", "uploading", "publication", "manager"],
  dev: ["developer"],
  studio: ["content"],
  marketing: ["marketing"],
};
export const POSITIONS = ["head", "lead", "member"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_LABELS: Record<Position, string> = { head: "Head", lead: "Lead", member: "Member" };

// Team leads (Admin, Teams) get these on top of their roles; Admin can change them per team.
export type LeadKey = `lead.${Stage}`;
export const leadKey = (stage: Stage): LeadKey => `lead.${stage}`;
const LEAD_BASE: Capability[] = [...NAV_CAPABILITIES, "items.detail", "reports.view", "team.view", "questions.ask", "export.run", "export.report", "export.tracker", "import.stage", "chat.channels", ...EDITORIAL_CAPABILITIES];
export const DEFAULT_LEAD_PERMISSIONS: Record<LeadKey, Capability[]> = {
  "lead.recording": [...LEAD_BASE, "items.create", "items.plan", "import.tracker"],
  "lead.editing": LEAD_BASE,
  "lead.uploading": LEAD_BASE,
  "lead.publication": LEAD_BASE,
};

export type PermissionMatrix = Record<Role | LeadKey, Capability[]>;

export function isStageRole(role: Role): role is Stage {
  return role === "recording" || role === "editing" || role === "uploading" || role === "publication";
}

export const STAGES = ["recording", "editing", "uploading", "publication"] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  recording: "Recording",
  editing: "Editing",
  uploading: "Uploading",
  publication: "Publication",
};

export const NEXT_STAGE: Record<Stage, Stage | null> = {
  recording: "editing",
  editing: "uploading",
  uploading: "publication",
  publication: null,
};

export const PREV_STAGE: Record<Stage, Stage | null> = {
  recording: null,
  editing: "recording",
  uploading: "editing",
  publication: "uploading",
};

export function stageIndex(stage: Stage) {
  return STAGES.indexOf(stage);
}

// Common stage-attempt states. "returned" and "superseded" are closed attempt outcomes.
export const ATTEMPT_STATUSES = [
  "queued",
  "in_progress",
  "paused",
  "blocked",
  "finished",
  "lead_review",
  "ready",
  "awaiting_handoff",
  "completed",
  "returned",
  "superseded",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

// One vocabulary everywhere. A team member works To do, In progress, then Done (not sent yet); sending it puts it
// With the team lead, who approves it (Ready for handover) and hands it over to the next team's lead (Handed over).
export const STATUS_LABELS: Record<AttemptStatus, string> = {
  queued: "To do",
  in_progress: "In progress",
  paused: "Paused",
  blocked: "Blocked",
  finished: "Done, not sent",
  lead_review: "With team lead",
  ready: "Ready for handover",
  awaiting_handoff: "Handed over",
  completed: "Done",
  returned: "Returned",
  superseded: "Replaced",
};

export const OPEN_STATUSES: AttemptStatus[] = ["queued", "in_progress", "paused", "blocked", "finished", "lead_review", "ready", "awaiting_handoff"];
// Still with the team member (not yet sent to the team lead).
export const WORKER_STATUSES: AttemptStatus[] = ["queued", "in_progress", "paused", "blocked", "finished"];

// Substates shown inside Uploading and Publication.
export const UPLOAD_SUBSTATES = ["uploading", "processing", "failed", "uploaded"] as const;
export const PUBLICATION_SUBSTATES = ["pending_review", "changes_requested", "ready", "scheduled", "failed"] as const;
export type Substate = (typeof UPLOAD_SUBSTATES)[number] | (typeof PUBLICATION_SUBSTATES)[number];

export const SUBSTATE_LABELS: Record<string, string> = {
  uploading: "Uploading",
  processing: "Processing",
  failed: "Failed",
  uploaded: "Uploaded",
  pending_review: "In review",
  changes_requested: "Changes requested",
  ready: "Approved",
  scheduled: "Scheduled",
};

export const LIFECYCLES = ["draft", "in_production", "published", "archived", "cancelled"] as const;
export type Lifecycle = (typeof LIFECYCLES)[number];

export const LIFECYCLE_LABELS: Record<Lifecycle, string> = {
  draft: "Draft",
  in_production: "In production",
  published: "Published",
  archived: "Archived",
  cancelled: "Cancelled",
};

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABELS: Record<Priority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const COMPLEXITIES = ["simple", "standard", "complex"] as const;
export type Complexity = (typeof COMPLEXITIES)[number];
export const COMPLEXITY_LABELS: Record<Complexity, string> = {
  simple: "Simple",
  standard: "Standard",
  complex: "Complex",
};

export const ASSET_KINDS = [
  "raw",
  "master",
  "captions",
  "thumbnail",
  "transcript",
  "document",
  "take_notes",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];
export const ASSET_KIND_LABELS: Record<AssetKind, string> = {
  raw: "Raw footage",
  master: "Edited master",
  captions: "Captions",
  thumbnail: "Thumbnail",
  transcript: "Transcript",
  document: "Supporting document",
  take_notes: "Take notes",
};

export const PROVENANCES = ["live", "imported", "historical"] as const;
export type Provenance = (typeof PROVENANCES)[number];

// Sheet view: stage-specific labels mapped onto the common workflow states.
export type SheetStatusOption = { value: string; label: string };

const COMMON_OPTIONS: SheetStatusOption[] = [
  { value: "queued", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "paused", label: "Paused" },
  { value: "blocked", label: "Blocked" },
  { value: "awaiting_handoff", label: "Handed over" },
  { value: "completed", label: "Done" },
];

export const SHEET_STATUS_OPTIONS: Record<Stage, SheetStatusOption[]> = {
  recording: COMMON_OPTIONS,
  editing: COMMON_OPTIONS,
  uploading: [
    { value: "queued", label: "To do" },
    { value: "sub:uploading", label: "Uploading" },
    { value: "sub:processing", label: "Processing" },
    { value: "sub:failed", label: "Upload failed" },
    { value: "blocked", label: "Blocked" },
    { value: "awaiting_handoff", label: "Handed over" },
    { value: "completed", label: "Done" },
  ],
  publication: [
    { value: "queued", label: "In review" },
    { value: "sub:changes_requested", label: "Changes requested" },
    { value: "sub:ready", label: "Approved" },
    { value: "sub:scheduled", label: "Scheduled" },
    { value: "completed", label: "Published" },
    { value: "sub:failed", label: "Release failed" },
  ],
};

// Simplified per-stage status used by coverage and overview reports.
export type SimpleStatus = "done" | "in_process" | "missing" | "none";
export const SIMPLE_STATUS_LABELS: Record<SimpleStatus, string> = { done: "Done", in_process: "In process", missing: "Missing", none: "-" };

export function sheetStatusValue(stage: Stage, status: AttemptStatus | null, substate: string | null): string | null {
  if (!status) return null;
  if (stage === "uploading") {
    if (status === "in_progress" || status === "paused") return substate === "processing" ? "sub:processing" : "sub:uploading";
    if (substate === "failed" && status !== "completed" && status !== "awaiting_handoff") return "sub:failed";
  }
  if (stage === "publication") {
    if (status === "completed") return "completed";
    if (substate && ["changes_requested", "ready", "scheduled", "failed"].includes(substate)) return `sub:${substate}`;
    return "queued";
  }
  return status;
}

export function sheetStatusLabel(stage: Stage, status: AttemptStatus | null, substate: string | null): string {
  const v = sheetStatusValue(stage, status, substate);
  if (!v) return "Not started";
  return SHEET_STATUS_OPTIONS[stage].find((o) => o.value === v)?.label ?? STATUS_LABELS[status as AttemptStatus] ?? v;
}

// What a redo request asks of each stage (sent as a request card to that team's chat).
export const REDO_LABELS: Record<Stage, string> = {
  recording: "Retake recording",
  editing: "Re-edit",
  uploading: "Re-upload",
  publication: "Re-publish",
};

export const RETURN_REASONS = [
  "audio_quality",
  "video_quality",
  "content_error",
  "missing_asset",
  "caption_issue",
  "metadata_issue",
  "curriculum_mismatch",
  "other",
] as const;
export const RETURN_REASON_LABELS: Record<string, string> = {
  audio_quality: "Audio quality",
  video_quality: "Video quality",
  content_error: "Content or accuracy error",
  missing_asset: "Missing or wrong asset",
  caption_issue: "Captions issue",
  metadata_issue: "Metadata issue",
  curriculum_mismatch: "Curriculum mismatch",
  other: "Other",
};

export const BLOCKER_CAUSES = [
  "presenter_unavailable",
  "equipment",
  "waiting_raw_footage",
  "waiting_replacement_audio",
  "waiting_approval",
  "platform_issue",
  "connectivity",
  "content_clarification",
  "other",
] as const;
export const BLOCKER_CAUSE_LABELS: Record<string, string> = {
  presenter_unavailable: "Presenter unavailable",
  equipment: "Equipment or studio",
  waiting_raw_footage: "Waiting for raw footage",
  waiting_replacement_audio: "Waiting for replacement audio",
  waiting_approval: "Waiting for approval",
  platform_issue: "Platform or processing issue",
  connectivity: "Connectivity or transfer",
  content_clarification: "Content clarification needed",
  other: "Other",
};

export const DISCUSSION_BOARDS = ["general", "recording", "editing", "uploading", "publication", "curriculum"] as const;
export const DISCUSSION_BOARD_LABELS: Record<string, string> = {
  general: "General",
  recording: "Recording",
  editing: "Editing",
  uploading: "Uploading",
  publication: "Publication",
  curriculum: "Curriculum",
};
export const DISCUSSION_CATEGORIES = ["question", "decision", "blocker", "announcement", "improvement"] as const;
export const DISCUSSION_CATEGORY_LABELS: Record<string, string> = {
  question: "Question",
  decision: "Decision",
  blocker: "Blocker",
  announcement: "Announcement",
  improvement: "Improvement",
};

export const NOTIFICATION_TYPES = [
  "assignment",
  "handoff",
  "approval",
  "mention",
  "question",
  "deadline",
  "overdue",
  "blocker",
  "failure",
  "published",
  "job",
  "discussion",
  "hr",
  "security",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  assignment: "Assignments",
  handoff: "Handoffs",
  approval: "Approvals",
  mention: "Mentions",
  question: "Manager questions",
  deadline: "Nearing deadline",
  overdue: "Overdue work",
  blocker: "Unresolved blockers",
  failure: "Failed uploads and releases",
  published: "Successful publication",
  job: "Import and export jobs",
  discussion: "Chat groups",
  hr: "HR reminders (documents, contracts, probation)",
  security: "Account security (new sign-ins, lockouts)",
};
// Essential workflow notifications stay visible even when the type is muted.
export const ESSENTIAL_NOTIFICATION_TYPES: NotificationType[] = ["assignment", "handoff", "approval", "question", "security"];

export function roleForStage(stage: Stage): Role {
  return stage;
}
