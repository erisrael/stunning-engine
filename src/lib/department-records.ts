export const RECORD_SCOPES = ["studio", "hr", "finance"] as const;
export type RecordScope = (typeof RECORD_SCOPES)[number];
export type RecordValue = string | number | boolean | null;
export type RecordColumn = { key: string; label: string; edit?: "text" | "textarea" | "number" | "date" | "checkbox"; options?: string[]; required?: boolean };
export type RecordSet = { key: string; label: string; columns: RecordColumn[]; create?: boolean; remove?: string; href: string };
const col = (key: string, label: string, edit?: RecordColumn["edit"], required?: boolean): RecordColumn => ({ key, label, edit, required });
const resourceColumns = [col("title", "Title", "text", true), col("status", "Status"), col("language", "Language", "text"), col("body", "Content", "textarea"), col("dueDate", "Due date", "date"), col("author", "Author"), col("assignee", "Assignee"), col("grade", "Grade"), col("subject", "Subject")];
export const RECORD_SETS: Record<RecordScope, RecordSet[]> = {
  studio: [
    ...["note", "exam", "flashcards"].map(key => ({ key, label: key === "note" ? "Notes" : key === "exam" ? "Exams" : "Flash cards", columns: resourceColumns, create: true, remove: "Delete", href: `/studio?tab=${key}` })),
    { key: "questions", label: "Questions", create: true, remove: "Delete", href: "/studio?tab=questions", columns: [col("stem", "Question", "textarea", true), col("type", "Type"), col("answer", "Answer", "textarea"), col("explanation", "Explanation", "textarea"), { ...col("difficulty", "Difficulty", "text"), options: ["easy", "medium", "hard"] }, col("status", "Status"), col("author", "Author")] },
  ],
  hr: [
    { key: "employees", label: "Employees", create: true, remove: "Delete employee record", href: "/hr", columns: [col("code", "Code"), col("fullName", "Full name", "text", true), col("jobTitle", "Job title", "text"), col("department", "Department", "text"), col("email", "Email", "text"), col("phone", "Phone", "text"), col("status", "Status"), col("startDate", "Start date", "date")] },
    { key: "equipment", label: "Equipment", create: true, remove: "Retire", href: "/hr?tab=equipment", columns: [col("tag", "Asset tag", "text", true), col("name", "Name", "text", true), col("category", "Category"), col("serial", "Serial number", "text"), col("status", "Status"), col("condition", "Condition"), col("holderName", "Holder"), col("purchasedAt", "Purchased", "date"), col("notes", "Notes", "textarea")] },
  ],
  finance: [
    { key: "accounts", label: "Accounts", create: true, remove: "Deactivate", href: "/finance?tab=accounts", columns: [col("name", "Name", "text", true), { ...col("kind", "Kind", "text"), options: ["bank", "cash", "petty", "mobile"] }, col("number", "Account number", "text"), col("ledgerCode", "Ledger code", "text"), col("balance", "Balance"), col("active", "Active", "checkbox")] },
    { key: "parties", label: "Vendors and customers", create: true, remove: "Deactivate", href: "/finance?tab=parties", columns: [col("name", "Name", "text", true), { ...col("kind", "Kind", "text"), options: ["vendor", "customer", "both"] }, col("tin", "TIN", "text"), col("phone", "Phone", "text"), col("email", "Email", "text"), col("bank", "Bank", "text"), col("bankAccount", "Bank account", "text"), col("active", "Active", "checkbox")] },
    { key: "transactions", label: "Transactions", remove: "Void", href: "/finance?tab=transactions", columns: [col("date", "Date"), col("description", "Description"), col("direction", "Direction"), col("amount", "Amount"), col("account", "Account"), col("party", "Party"), col("reference", "Reference"), col("source", "Source"), col("status", "Status")] },
    { key: "bills", label: "Bills", href: "/finance?tab=bills", columns: [col("number", "Number"), col("vendor", "Vendor"), col("date", "Date"), col("due_date", "Due date"), col("amount", "Amount"), col("description", "Description"), col("status", "Status")] },
    { key: "invoices", label: "Invoices", href: "/finance?tab=invoices", columns: [col("number", "Number"), col("customer", "Customer"), col("date", "Date"), col("due_date", "Due date"), col("amount", "Amount"), col("vat", "VAT"), col("status", "Status")] },
    { key: "budgets", label: "Budgets", href: "/finance?tab=budgets", columns: [col("scope_label", "Budget"), col("scope_type", "Scope"), col("year", "Year"), col("amount", "Amount"), col("spent", "Spent"), col("committed", "Committed"), col("available", "Available")] },
  ],
};
export const DATA_RIGHTS = ["view", "create", "edit", "remove", "bulk", "export"] as const;
export type DataRight = (typeof DATA_RIGHTS)[number];
export type DataGrants = Record<DataRight, boolean>;
export type DataPolicy = { version: number; grants: Record<string, DataGrants> };
export const DEFAULT_DATA_GRANTS: DataGrants = { view: true, create: true, edit: true, remove: true, bulk: true, export: true };
export function grantsFor(policy: DataPolicy, key: string): DataGrants {
  const grants = policy.grants[key] ?? DEFAULT_DATA_GRANTS;
  return key === "observer" ? { ...grants, create: false, edit: false, remove: false, bulk: false } : grants;
}
export type ManagedRecord = { id: string; values: Record<string, RecordValue>; href: string; edit: boolean; remove: boolean };
export type RecordsPageData = { scope: RecordScope; dataset: string; rows: ManagedRecord[]; rights: DataGrants; configure: boolean; policy: DataPolicy | null; principals: { key: string; label: string }[]; year: number };
