// HR vocabulary for recruitment, onboarding and offboarding, performance, training and cases.

export const OPENING_STATUSES = ["open", "on_hold", "filled", "closed"] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];
export const OPENING_STATUS_LABELS: Record<OpeningStatus, string> = { open: "Open", on_hold: "On hold", filled: "Filled", closed: "Closed" };

export const APPLICANT_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected"] as const;
export type ApplicantStage = (typeof APPLICANT_STAGES)[number];
export const APPLICANT_STAGE_LABELS: Record<ApplicantStage, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  hired: "Hired",
  rejected: "Not selected",
};

export const RECOMMENDATIONS = ["strong_yes", "yes", "no", "strong_no"] as const;
export type Recommendation = (typeof RECOMMENDATIONS)[number];
export const RECOMMENDATION_LABELS: Record<Recommendation, string> = { strong_yes: "Strong yes", yes: "Yes", no: "No", strong_no: "Strong no" };

export type ChecklistKind = "onboarding" | "offboarding";
export const CHECKLIST_KIND_LABELS: Record<ChecklistKind, string> = { onboarding: "Onboarding", offboarding: "Offboarding" };
export type ChecklistOwner = "hr" | "manager" | "employee" | "admin" | "finance";
export const CHECKLIST_OWNER_LABELS: Record<ChecklistOwner, string> = { hr: "HR", manager: "Line manager", employee: "The person", admin: "Admin", finance: "Finance" };
export type ChecklistTemplateItem = { key: string; label: string; owner: ChecklistOwner };
export type ChecklistItem = ChecklistTemplateItem & { doneAt: string | null; doneBy: string | null; note: string | null };

export const DEFAULT_CHECKLISTS: Record<ChecklistKind, ChecklistTemplateItem[]> = {
  onboarding: [
    { key: "contract", label: "Contract signed and added to their record", owner: "hr" },
    { key: "documents", label: "ID, tax ID and bank details collected", owner: "hr" },
    { key: "account", label: "App account and email address created", owner: "admin" },
    { key: "equipment", label: "Equipment issued (laptop, camera, microphone)", owner: "hr" },
    { key: "welcome", label: "Welcome meeting and introduction to the team", owner: "manager" },
    { key: "training", label: "First-week training: the app, their stage and the checklists", owner: "manager" },
    { key: "tour", label: "Get-started tour done and contact details filled in", owner: "employee" },
    { key: "probation", label: "Probation goals agreed", owner: "manager" },
  ],
  offboarding: [
    { key: "handover", label: "Work handed over to the team", owner: "manager" },
    { key: "equipment", label: "Equipment returned", owner: "hr" },
    { key: "access", label: "App access removed", owner: "admin" },
    { key: "exit", label: "Exit interview", owner: "hr" },
    { key: "settlement", label: "Final settlement handed to Finance (last salary, unused leave, deductions)", owner: "finance" },
    { key: "certificate", label: "Certificate of service issued", owner: "hr" },
  ],
};

export const GOAL_STATUSES = ["open", "done", "dropped"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];
export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = { open: "In progress", done: "Done", dropped: "Dropped" };

export const REVIEW_STATUSES = ["self", "lead", "done"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = { self: "Self review", lead: "With line manager", done: "Done" };
export const RATING_LABELS: Record<number, string> = { 1: "Below expectations", 2: "Partly meets", 3: "Meets expectations", 4: "Exceeds", 5: "Outstanding" };

export const TRAINING_STATUSES = ["assigned", "done"] as const;
export type TrainingStatus = (typeof TRAINING_STATUSES)[number];

export const CASE_KINDS = ["disciplinary", "grievance", "investigation"] as const;
export type CaseKind = (typeof CASE_KINDS)[number];
export const CASE_KIND_LABELS: Record<CaseKind, string> = { disciplinary: "Disciplinary", grievance: "Grievance", investigation: "Investigation" };
export const CASE_STATUSES = ["open", "investigating", "closed"] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = { open: "Open", investigating: "Investigating", closed: "Closed" };
