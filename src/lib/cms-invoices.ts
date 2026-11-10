// Finance's verification states for Noor invoices (Update 1.0, Phase 2).
export const INVOICE_STATES = [
  ["unverified", "Unverified"],
  ["verified", "Verified"],
  ["unable", "Unable to verify"],
] as const;
export type InvoiceState = (typeof INVOICE_STATES)[number][0];
export const INVOICE_STATE_LABEL: Record<InvoiceState, string> = Object.fromEntries(INVOICE_STATES) as Record<InvoiceState, string>;

export const UNABLE_REASONS = [
  ["no_slip", "No payment slip"],
  ["amount_mismatch", "Amount does not match"],
  ["unreadable", "Slip unreadable"],
  ["reference_not_found", "Reference not found"],
  ["duplicate", "Duplicate payment"],
  ["other", "Other (explain in the note)"],
] as const;
export type UnableReason = (typeof UNABLE_REASONS)[number][0];
export const UNABLE_REASON_LABEL: Record<string, string> = Object.fromEntries(UNABLE_REASONS);

export type InvoiceReview = {
  invoiceId: string;
  state: InvoiceState;
  reason: string | null;
  note: string | null;
  student: string;
  contactName: string;
  phone: string;
  grade: string;
  plan: string;
  amount: number;
  method: string;
  invoiceDate: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type InvoiceReviewLog = { id: string; invoiceId: string; fromState: string; toState: string; reason: string | null; note: string | null; actorName: string | null; at: string };
