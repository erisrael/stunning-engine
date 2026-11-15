import type { DeptConfig } from "./dept-config";

export type ImportTemplate = { name: string; mime: string; text: string };
export function csvTemplate(name: string, rows: string[][]): ImportTemplate {
  return { name, mime: "text/csv;charset=utf-8", text: "\uFEFF" + rows.map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(",")).join("\r\n") + "\r\n" };
}

export function taskImportTemplate(dept: string, config: DeptConfig): ImportTemplate {
  const headers = ["title", "description", "type", "status", "priority", "assignee_email", "project_key", "due_date", "start_date", "estimate_hours", "labels", "parent", ...config.fields.filter(f => f.active).map(f => f.key)];
  const example: Record<string, string> = {
    title: "Replace with your task title", description: "Replace this example row before importing",
    type: config.types.find(t => t.active)?.key ?? "",
    status: config.statuses.find(s => s.active && s.category === "open")?.key ?? "",
    priority: config.priorities.find(p => p.active)?.key ?? "",
  };
  return csvTemplate(`${dept}-tasks-import-template.csv`, [headers, headers.map(key => example[key] ?? "")]);
}

export function externalImportTemplate(source: "jira" | "asana" | "trello"): ImportTemplate {
  if (source === "jira") return csvTemplate("jira-import-template.csv", [
    ["Summary", "Description", "Issue Type", "Status", "Priority", "Assignee", "Due Date", "Labels"],
    ["Replace with your task title", "Describe the work", "", "To do", "", "", "", ""],
  ]);
  if (source === "asana") return csvTemplate("asana-import-template.csv", [
    ["Name", "Notes", "Section/Column", "Completed At", "Assignee Email", "Due Date", "Tags"],
    ["Replace with your task title", "Describe the work", "To do", "", "", "", ""],
  ]);
  return { name: "trello-import-template.json", mime: "application/json", text: JSON.stringify({
    lists: [{ id: "todo", name: "To do" }],
    cards: [{ name: "Replace with your task title", desc: "Describe the work", idList: "todo", closed: false, due: null, labels: [] }],
  }, null, 2) + "\n" };
}

export const DOCUMENT_IMPORT_TEMPLATE: ImportTemplate = {
  name: "spec-import-template.md", mime: "text/markdown;charset=utf-8",
  text: "# Feature specification\n\nReplace the example text before importing this document.\n\n## Summary\nDescribe the problem and intended outcome.\n\n## Requirements\n- Describe the expected behavior.\n\n## Acceptance criteria\n- Describe how to verify the requirement.\n\n## Implementation notes\nAdd technical details and dependencies.\n\n## Testing\nList the test scenarios.\n\n## Open questions\nList decisions still needed.\n",
};
