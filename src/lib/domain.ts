// Shared domain vocabulary used by both the server and the client.

export const ROLES = ["recording", "editing", "uploading", "publication", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  recording: "Recording",
  editing: "Editing",
  uploading: "Uploading",
  publication: "Publication",
  manager: "Manager",
  admin: "Admin",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  recording: "Records sessions and logs camera codes for each part.",
  editing: "Edits footage and delivers the master, captions and thumbnail.",
  uploading: "Uploads approved masters to each destination and verifies playback.",
  publication: "Reviews, schedules and confirms releases.",
  manager: "Plans work, assigns owners, sets deadlines and follows delivery.",
  admin: "Manages people, roles, permissions, access and workspace data.",
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
  { key: "reports.view", label: "View reports", group: "Insights" },
  { key: "team.view", label: "View team workload and capacity", group: "Insights" },
  { key: "corrections.approve", label: "Approve timer corrections", group: "Insights" },
  { key: "chat.manage", label: "Create chat groups and manage members", group: "Collaboration" },
  { key: "questions.ask", label: "Ask tracked questions", group: "Collaboration" },
  { key: "settings.manage", label: "Change workflow settings", group: "Administration" },
  { key: "users.manage", label: "Manage users, roles, permissions and access", group: "Administration" },
  { key: "data.manage", label: "Empty, import and back up workspace data", group: "Administration" },
] as const;
export type Capability = (typeof CAPABILITIES)[number]["key"];

// Sidebar pages everyone sees unless Admin turns them off for a role.
export const NAV_CAPABILITIES: Capability[] = ["nav.overview", "nav.questions", "nav.list", "nav.sheet", "nav.board", "nav.calendar", "nav.coverage", "nav.team"];
const STAFF: Capability[] = [...NAV_CAPABILITIES, "export.run", "export.report", "export.tracker", "import.stage"];

export const DEFAULT_PERMISSIONS: Record<Role, Capability[]> = {
  recording: STAFF,
  editing: STAFF,
  uploading: STAFF,
  publication: STAFF,
  // Managers follow delivery: they view everything but do not edit item data.
  manager: [...NAV_CAPABILITIES, "export.run", "export.report", "export.tracker", "export.audit", "reports.view", "team.view", "corrections.approve", "chat.manage", "questions.ask", "settings.manage"],
  admin: [
    ...NAV_CAPABILITIES,
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
  ],
};

// Team leads (Admin, Teams) get these on top of their roles; Admin can change them per team.
export type LeadKey = `lead.${Stage}`;
export const leadKey = (stage: Stage): LeadKey => `lead.${stage}`;
const LEAD_BASE: Capability[] = ["reports.view", "team.view", "questions.ask", "export.run", "export.report", "export.tracker", "import.stage"];
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
  "awaiting_handoff",
  "completed",
  "returned",
  "superseded",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

// One vocabulary everywhere: To do, In progress, Paused, Blocked, Submitted, Done.
export const STATUS_LABELS: Record<AttemptStatus, string> = {
  queued: "To do",
  in_progress: "In progress",
  paused: "Paused",
  blocked: "Blocked",
  awaiting_handoff: "Submitted",
  completed: "Done",
  returned: "Returned",
  superseded: "Replaced",
};

export const OPEN_STATUSES: AttemptStatus[] = ["queued", "in_progress", "paused", "blocked", "awaiting_handoff"];

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
  { value: "awaiting_handoff", label: "Submitted" },
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
    { value: "awaiting_handoff", label: "Submitted" },
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
};
// Essential workflow notifications stay visible even when the type is muted.
export const ESSENTIAL_NOTIFICATION_TYPES: NotificationType[] = ["assignment", "handoff", "approval", "question"];

export function roleForStage(stage: Stage): Role {
  return stage;
}
