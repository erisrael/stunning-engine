// Record types and bulk-fill fields of the admin data manager, shared by the server and the client.

export const RECORD_ENTITIES = ["items", "lessons", "units", "subjects", "grades"] as const;
export type RecordEntity = (typeof RECORD_ENTITIES)[number];

// Fields each entity accepts in bulk fill. Items use the workflow's editable fields.
export type FillField = { key: string; label: string; kind: "text" | "number" | "bool" };

export const FILL_FIELDS: Record<RecordEntity, { key: string; label: string; kind: "text" | "number" | "bool" }[]> = {
  items: [
    { key: "title_am", label: "Amharic title", kind: "text" },
    { key: "teacher", label: "Teacher", kind: "text" },
    { key: "language", label: "Language", kind: "text" },
    { key: "content_type", label: "Content type", kind: "text" },
    { key: "deliverable_type", label: "Deliverable type", kind: "text" },
    { key: "priority", label: "Priority", kind: "text" },
    { key: "complexity", label: "Complexity", kind: "text" },
    { key: "objectives", label: "Objectives", kind: "text" },
    { key: "target_duration_min", label: "Target minutes", kind: "number" },
    { key: "tags", label: "Tags (comma separated)", kind: "text" },
  ],
  lessons: [
    { key: "title_am", label: "Amharic title", kind: "text" },
    { key: "objectives", label: "Objectives", kind: "text" },
    { key: "language", label: "Language", kind: "text" },
    { key: "planned_deliverables", label: "Planned videos", kind: "number" },
  ],
  units: [
    { key: "title_am", label: "Amharic title", kind: "text" },
    { key: "term", label: "Term", kind: "text" },
  ],
  subjects: [
    { key: "name_am", label: "Amharic name", kind: "text" },
    { key: "sort", label: "Sort order", kind: "number" },
    { key: "active", label: "Active", kind: "bool" },
  ],
  grades: [
    { key: "level", label: "Level", kind: "text" },
    { key: "sort", label: "Sort order", kind: "number" },
    { key: "active", label: "Active", kind: "bool" },
  ],
};
