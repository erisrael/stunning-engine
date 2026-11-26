// Shared vocabulary of the Tools hub (server and browser).

export const TOOL_APPS = [
  { key: "notes", label: "Notes & Checklists", href: "/tools/notes", hint: "Notes with tick boxes, tasks with due dates, linked to production parts." },
  { key: "calendar", label: "Reminder Calendar", href: "/tools/calendar", hint: "Reminders and dated tasks by month or week; subscribe from Google, Outlook or Apple." },
  { key: "sheets", label: "Excel / Sheets Studio", href: "/tools/sheets", hint: "Open, edit and export .xlsx and .csv; cross-check rows against production data." },
  { key: "docs", label: "Document Builder", href: "/tools/docs", hint: "Documents from templates, exported to Word (.docx) or PDF." },
  { key: "decks", label: "PowerPoint Deck Maker", href: "/tools/decks", hint: "Slides from layouts, exported to PowerPoint (.pptx)." },
  { key: "letters", label: "Company Letter Generator", href: "/tools/letters", hint: "Official letters on the locked company letterhead, as PDF or Word." },
] as const;
export type ToolApp = (typeof TOOL_APPS)[number]["key"];

export const TOOL_FEATURES = [
  { key: "ai_copy", label: "Copy context for AI", hint: "Copies notes, tasks and cross-check results as Markdown to paste into any AI chat." },
  { key: "ics", label: "Private calendar feed (.ics)", hint: "Subscribe to reminders from Google Calendar, Outlook or Apple Calendar." },
  { key: "notion", label: "Send to Notion", hint: "Each person connects their own Notion workspace." },
  { key: "mcp", label: "Claude (MCP connector)", hint: "People connect Claude to their own notes and reminders, with OAuth." },
  { key: "gpt", label: "ChatGPT (Custom GPT actions)", hint: "The same operations as an OpenAPI schema with OAuth." },
] as const;
export type ToolFeature = (typeof TOOL_FEATURES)[number]["key"];

export type Letterhead = {
  company: string;
  tagline: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  footer: string;
  primary: string;
  accent: string;
  // A data URL; empty uses the site's logo (Admin, Branding).
  logo: string | null;
  signName: string;
  signTitle: string;
  refPrefix: string;
};
export const DEFAULT_LETTERHEAD: Letterhead = {
  company: "Myseed",
  tagline: "",
  address: "Addis Ababa, Ethiopia",
  phone: "",
  email: "",
  website: "myseed.com.et",
  footer: "",
  primary: "#16a34a",
  accent: "#0f172a",
  logo: null,
  signName: "",
  signTitle: "",
  refPrefix: "MS",
};

// Markdown tick boxes: "- [ ] task" and "- [x] done".
export const CHECKBOX_RE = /^(\s*[-*+]\s+)\[( |x|X)\](\s+.*)?$/;
export function checkboxStats(md: string) {
  let done = 0;
  let total = 0;
  for (const line of md.split(/\r?\n/)) {
    const m = CHECKBOX_RE.exec(line);
    if (!m) continue;
    total++;
    if (m[2] !== " ") done++;
  }
  return { done, total };
}
// Flips the n-th tick box (0-based) in the Markdown.
export function toggleCheckbox(md: string, index: number) {
  let n = -1;
  return md
    .split(/\r?\n/)
    .map((line) => {
      const m = CHECKBOX_RE.exec(line);
      if (!m) return line;
      n++;
      if (n !== index) return line;
      return `${m[1]}[${m[2] === " " ? "x" : " "}]${m[3] ?? ""}`;
    })
    .join("\n");
}

export type LinkRef = { kind: "item"; id: string; label: string } | null;

export type NoteView = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  pinned: boolean;
  link: LinkRef;
  createdAt: string;
  updatedAt: string;
};
export type TaskView = {
  id: string;
  noteId: string | null;
  title: string;
  description: string;
  dueAt: string | null;
  done: boolean;
  doneAt: string | null;
  link: LinkRef;
  createdAt: string;
};
export type ReminderView = {
  id: string;
  title: string;
  notes: string;
  at: string;
  allDay: boolean;
  done: boolean;
  noteId: string | null;
  taskId: string | null;
  link: LinkRef;
};

// Notes and tasks as Markdown for an AI chat (ChatGPT, Claude, Gemini), with what each is linked to.
export function aiContext(opts: { workspace: string; who: string; notes: NoteView[]; tasks: TaskView[]; reminders?: ReminderView[]; ask?: string }) {
  const out: string[] = [`# Context from ${opts.workspace}`, "", `Prepared for ${opts.who} on ${new Date().toISOString().slice(0, 10)}. Use it to answer the request at the end.`, ""];
  const link = (l: LinkRef) => (l ? ` (linked to ${l.label})` : "");
  if (opts.notes.length) {
    out.push("## Notes", "");
    for (const n of opts.notes) {
      const s = checkboxStats(n.body);
      out.push(`### ${n.title || "Untitled"}${link(n.link)}`);
      if (n.tags.length) out.push(`Tags: ${n.tags.join(", ")}`);
      if (s.total) out.push(`Checklist: ${s.done}/${s.total} done`);
      out.push("", n.body.trim() || "_(empty)_", "");
    }
  }
  if (opts.tasks.length) {
    const open = opts.tasks.filter((t) => !t.done);
    out.push(`## Tasks (${opts.tasks.length - open.length}/${opts.tasks.length} done)`, "");
    for (const t of opts.tasks) out.push(`- [${t.done ? "x" : " "}] ${t.title}${t.dueAt ? ` — due ${t.dueAt.slice(0, 10)}` : ""}${link(t.link)}${t.description ? `\n  ${t.description.replace(/\n/g, "\n  ")}` : ""}`);
    out.push("");
  }
  if (opts.reminders?.length) {
    out.push("## Reminders", "");
    for (const r of opts.reminders) out.push(`- ${r.at.slice(0, 16).replace("T", " ")} ${r.title}${r.done ? " (done)" : ""}${link(r.link)}`);
    out.push("");
  }
  out.push("## Request", "", opts.ask?.trim() || "_Write what you want the AI to do with this context._");
  return out.join("\n");
}
