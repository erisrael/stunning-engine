// HR vocabulary shared by the server and the client.

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "intern"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = { full_time: "Full time", part_time: "Part time", contract: "Contract", intern: "Intern" };

export const EMPLOYEE_STATUSES = ["active", "probation", "on_leave", "left"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = { active: "Active", probation: "On probation", on_leave: "On leave", left: "Left" };

// ID documents are sensitive: only people who may see ID numbers see them.
export const DOC_KINDS = ["contract", "id", "certificate", "cv", "other"] as const;
export type DocKind = (typeof DOC_KINDS)[number];
export const DOC_KIND_LABELS: Record<DocKind, string> = { contract: "Contract", id: "ID document", certificate: "Certificate", cv: "CV", other: "Other" };
// Documents a person may add to their own record.
export const SELF_DOC_KINDS: DocKind[] = ["certificate", "cv", "other"];

export const EQUIPMENT_CATEGORIES = ["camera", "lens", "microphone", "lighting", "laptop", "phone", "storage", "furniture", "other"] as const;
export type EquipmentCategory = (typeof EQUIPMENT_CATEGORIES)[number];
export const EQUIPMENT_CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  camera: "Camera",
  lens: "Lens",
  microphone: "Microphone",
  lighting: "Lighting",
  laptop: "Laptop",
  phone: "Phone",
  storage: "Storage",
  furniture: "Furniture",
  other: "Other",
};

export const CONDITIONS = ["new", "good", "fair", "damaged"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = { new: "New", good: "Good", fair: "Fair", damaged: "Damaged" };

export const EQUIPMENT_STATUSES = ["available", "issued", "repair", "retired"] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];
export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = { available: "Available", issued: "Issued", repair: "In repair", retired: "Retired" };

export type EmergencyContact = { name: string; relation: string; phone: string };

// Reminder windows, in days before the date.
export const REMIND_DOC_DAYS = 30;
export const REMIND_CONTRACT_DAYS = 30;
export const REMIND_PROBATION_DAYS = 14;

// Tabs of the HR page (shared by the server page and the client tabs).
export const HR_TABS = ["people", "leave", "hiring", "lifecycle", "performance", "training", "cases", "reports", "due", "org", "equipment"] as const;
export type HrTab = (typeof HR_TABS)[number];
