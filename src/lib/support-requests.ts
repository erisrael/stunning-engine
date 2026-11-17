// Customer Support Requests (Update 1.2, Phase 7): names shared by the server and the pages.

export const REQUEST_TYPES = [
  ["technical", "Technical issue"],
  ["bug", "Bug report"],
  ["payment_verification", "Payment verification"],
  ["refund", "Refund assistance"],
  ["account", "Account issue"],
  ["subscription", "Subscription issue"],
  ["feature", "Feature request"],
  ["escalation", "Customer escalation"],
  ["other", "Other"],
] as const;
export type RequestType = (typeof REQUEST_TYPES)[number][0];

export const REQUEST_STATUSES = [
  ["draft", "Draft"],
  ["submitted", "Submitted"],
  ["received", "Received"],
  ["acknowledged", "Acknowledged"],
  ["in_progress", "In progress"],
  ["waiting_info", "Waiting for information"],
  ["pending_approval", "Pending approval"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["resolved", "Resolved"],
  ["closed", "Closed"],
] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number][0];
export const requestStatusLabel = (s: string) => REQUEST_STATUSES.find(([k]) => k === s)?.[1] ?? s;
export const requestTypeLabel = (s: string) => REQUEST_TYPES.find(([k]) => k === s)?.[1] ?? s;
export const OPEN_REQUEST_STATUSES: RequestStatus[] = ["submitted", "received", "acknowledged", "in_progress", "waiting_info", "pending_approval", "approved"];

// What a person can do to a request; the server says which apply to whom and from which status.
export const REQUEST_ACTIONS = [
  ["submit", "Submit"],
  ["acknowledge", "Acknowledge"],
  ["start", "Mark in progress"],
  ["ask_info", "Ask for information"],
  ["provide_info", "Send the information"],
  ["submit_approval", "Submit for approval"],
  ["approve", "Approve"],
  ["reject", "Reject"],
  ["escalate", "Escalate"],
  ["resolve", "Mark resolved"],
  ["reopen", "Not solved, reopen"],
  ["close", "Close"],
] as const;
export type RequestAction = (typeof REQUEST_ACTIONS)[number][0];
// Actions that need a written reason or text.
export const ACTION_NEEDS_TEXT: Partial<Record<RequestAction, string>> = {
  ask_info: "What do you need to know?",
  provide_info: "The information",
  reject: "Why is it rejected?",
  escalate: "Why escalate?",
  resolve: "Resolution notes (sent back to support)",
  reopen: "What is still wrong?",
};

export const DESTINATION_KINDS = [
  ["dept", "A whole department"],
  ["dept_head", "A department's heads and leads"],
  ["member", "A chosen member"],
  ["support_leads", "Customer support head"],
  ["admin", "Administration"],
] as const;
export type DestinationKind = (typeof DESTINATION_KINDS)[number][0];
export const APPROVER_KINDS = [
  ["user", "A person"],
  ["dept_head", "A department's head"],
  ["support_leads", "Customer support head"],
  ["admin", "Administration"],
] as const;
export type ApprovalStep = { kind: (typeof APPROVER_KINDS)[number][0]; target?: string | null };
