// Types of request to Finance, and who a team member's request goes to first (src/server/finance-routing.ts).
export const REQUEST_KINDS = ["device", "subscription", "budget", "repair", "replacement", "salary_advance", "allowance", "loan", "benefit", "other"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

export const REQUEST_KIND_LABELS: Record<RequestKind, string> = {
  device: "Device",
  subscription: "Subscription",
  budget: "Budget",
  repair: "Repair",
  replacement: "Replacement",
  salary_advance: "Salary advance",
  allowance: "Allowance",
  loan: "Loan",
  benefit: "Benefit",
  other: "Other",
};

// Things for the work go to the team lead; personal money matters go to HR.
export const REQUEST_ROUTE: Record<RequestKind, "lead" | "hr"> = {
  device: "lead",
  subscription: "lead",
  budget: "lead",
  repair: "lead",
  replacement: "lead",
  other: "lead",
  salary_advance: "hr",
  allowance: "hr",
  loan: "hr",
  benefit: "hr",
};
