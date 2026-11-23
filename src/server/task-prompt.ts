// A task as a prompt for an AI coding assistant (Claude Code, Cursor, Copilot and the like), built from what the app
// knows, with no AI key and nothing sent anywhere: the project, the task and its acceptance criteria, checklist and
// subtasks, the requirements it builds (from specs the person may read), related tasks, the latest comments, the
// steps that suit its type, the team's rules (docs/dev-team/RULEBOOK.md), and what to hand back (branch, commit,
// pull request).

import { all, get } from "./db";
import { workAccess } from "./dept-config";
import { getTask } from "./work";
import { memberScope } from "./dept-access";
import type { AppUser } from "./users";

export type PromptStyle = "agent" | "short" | "review";
export const PROMPT_STYLES: { key: PromptStyle; label: string; hint: string }[] = [
  { key: "agent", label: "Coding agent (full)", hint: "For Claude Code or another agent working in the repository" },
  { key: "short", label: "Short", hint: "The task and its acceptance criteria only" },
  { key: "review", label: "Code review", hint: "Ask an assistant to review the pull request against the task" },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

// How to go about it, by the kind of task.
const STEPS: Record<string, string[]> = {
  bug: [
    "Reproduce the problem first, from the steps in the description, and find the cause before changing code.",
    "Write a test that fails because of the bug, then fix it so the test passes.",
    "Check for the same mistake elsewhere in the code and fix those too.",
  ],
  feature: [
    "Read the code around the change and follow the patterns already used there.",
    "Plan the change in a few steps (data, server, interface, tests) before writing code.",
    "Build it end to end, including empty, error and permission cases.",
  ],
  improvement: ["Read how it works today and keep everything that already works.", "Make the change in small steps, checking each one.", "Show before and after (a screenshot or numbers) where it helps."],
  chore: ["Do the work as described; keep the change narrow.", "Record what was done and anything that needs following up."],
  research: ["Investigate and compare the options; do not change production code.", "Write the findings with a recommendation, the alternatives, and what each costs or risks.", "Answer the question in the first paragraph."],
};

const RULES = [
  "Check permissions on the server for every new action; hiding a button is not protection.",
  "Database changes are additive only (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS); raise SCHEMA_VERSION and add new tables to TABLES.",
  "SQL goes through src/server/db.ts with ? placeholders; never paste values into SQL.",
  "No secrets, keys or personal data in code, commits, logs or this conversation.",
  "Tests run against throwaway databases only (npm test, npm run test:e2e); add a test for the change.",
  "No emojis anywhere in the product; plain words in sentence case; phone widths, light and dark mode.",
  "This project uses Next.js 16: read the relevant guide in node_modules/next/dist/docs/ before writing Next.js code (AGENTS.md).",
];

export async function taskPrompt(user: AppUser, d: string, taskId: string, style: PromptStyle = "agent") {
  const a = await workAccess(user, d);
  const t = await getTask(user, a.dept, taskId); // the person's own permissions
  const cfg = a.config;
  const label = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;
  const type = label(cfg.types, t.type);
  const project = t.project_id ? await get<{ key: string; name: string; description: string | null }>("SELECT key, name, description FROM dept_projects WHERE id = ?", t.project_id) : null;
  const acceptance = Object.entries(t.fields ?? {}).find(([k]) => /accept/i.test(k))?.[1];
  const otherFields = Object.entries(t.fields ?? {}).filter(([k, v]) => !/accept/i.test(k) && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  const fieldLabel = (k: string) => cfg.fields.find((f) => f.key === k)?.label ?? k;

  // Requirements this task builds, with their lines, from documents the person may read.
  const scope = await memberScope(a, user);
  const reqRows = await all<{ req: string; doc_id: string; title: string; body: string; folder_id: string | null; created_by: string | null }>(
    "SELECT l.req, l.doc_id, x.title, x.body, x.folder_id, x.created_by FROM dept_doc_links l JOIN dept_docs x ON x.id = l.doc_id WHERE l.task_id = ?",
    t.id,
  );
  const reqs = reqRows
    .filter((r) => scope.full || scope.item("doc", r.doc_id, r.folder_id, r.created_by))
    .map((r) => {
      const lines = r.body.split(/\r?\n/);
      const i = lines.findIndex((l) => new RegExp(`\\b${r.req}\\b`).test(l));
      const text = i >= 0 ? [lines[i], ...lines.slice(i + 1, i + 4).filter((l) => /^\s+\S|^\s*acceptance/i.test(l))].join(" ").replace(/\s+/g, " ").trim() : r.req;
      return { req: r.req, doc: r.title, text };
    });
  const subtasks = await all<{ code: string; title: string; status_category: string }>("SELECT code, title, status_category FROM dept_tasks WHERE parent_id = ? ORDER BY sort", t.id);
  const links = [
    ...(await all<{ code: string; title: string }>("SELECT t.code, t.title FROM dept_task_links l JOIN dept_tasks t ON t.id = l.blocked_by WHERE l.task_id = ?", t.id)).map((x) => ({ ...x, kind: "blocks this task" })),
    ...(await all<{ code: string; title: string }>("SELECT t.code, t.title FROM dept_task_links l JOIN dept_tasks t ON t.id = l.task_id WHERE l.blocked_by = ?", t.id)).map((x) => ({ ...x, kind: "waits for this task" })),
  ];
  const comments = await all<{ body: string; name: string | null; created_at: string }>(
    "SELECT c.body, u.name, c.created_at FROM dept_task_comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.task_id = ? ORDER BY c.created_at DESC LIMIT 5",
    t.id,
  );

  const head = `${t.code}: ${t.title}`;
  const acc = acceptance ? String(acceptance) : null;
  const L: string[] = [];
  if (style === "short") {
    L.push(`# ${head}`, "", `${type}${project ? ` in ${project.key} ${project.name}` : ""}. Priority: ${label(cfg.priorities, t.priority)}.`, "");
    if (t.description) L.push(t.description.trim(), "");
    if (acc) L.push("Done when:", acc.trim(), "");
    if (t.checklist?.length) L.push(...t.checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`), "");
    return L.join("\n").trim() + "\n";
  }
  if (style === "review") {
    L.push(
      `Review the pull request for ${head}.`,
      "",
      "## What the change must do",
      t.description?.trim() || "(no description)",
      "",
      ...(acc ? ["## Acceptance criteria", acc.trim(), ""] : []),
      ...(reqs.length ? ["## Requirements it builds", ...reqs.map((r) => `- ${r.text} (${r.doc})`), ""] : []),
      "## Check",
      "- Does it meet every acceptance criterion and requirement above? Name any that it misses.",
      "- Correctness: empty lists, errors, slow networks, two people at once, Amharic text, phone widths.",
      "- Security: permissions checked on the server for every action, list and export; no secrets; safe SQL with placeholders.",
      "- Database: additive changes only, SCHEMA_VERSION raised, new tables in TABLES.",
      "- Tests: is there a test that would have failed without the change?",
      "",
      "Answer with the problems first, most serious first, each with the file and line and a concrete fix. Then anything optional.",
    );
    return L.join("\n").trim() + "\n";
  }

  L.push(`# Task ${head}`, "");
  L.push("## Context", "");
  L.push(`You are working on ${project ? `**${project.name}** (${project.key})` : "this project"} for the ${cfg.title} at Myseed.${project?.description ? ` ${project.description.trim()}` : ""}`);
  L.push(`Type: ${type}. Priority: ${label(cfg.priorities, t.priority)}. Status: ${label(cfg.statuses, t.status)}.${t.sprint_name ? ` Sprint: ${t.sprint_name}.` : ""}${t.due_date ? ` Due: ${t.due_date}.` : ""}${t.points ? ` Size: ${t.points} points.` : ""}`, "");
  L.push("## What to do", "", t.description?.trim() || t.title, "");
  if (acc) L.push("## Acceptance criteria", "", acc.trim(), "");
  if (reqs.length) L.push("## Requirements this builds", "", ...reqs.map((r) => `- ${r.text} (from "${r.doc}")`), "");
  if (otherFields.length) L.push("## Details", "", ...otherFields.map(([k, v]) => `- ${fieldLabel(k)}: ${Array.isArray(v) ? v.join(", ") : String(v)}`), "");
  if (subtasks.length) L.push("## Subtasks", "", ...subtasks.map((s) => `- [${s.status_category === "done" ? "x" : " "}] ${s.code} ${s.title}`), "");
  if (links.length) L.push("## Related tasks", "", ...links.map((l) => `- ${l.code} ${l.title} (${l.kind})`), "");
  if (comments.length) L.push("## Latest comments", "", ...comments.reverse().map((c) => `- ${c.name ?? "Someone"} (${c.created_at.slice(0, 10)}): ${c.body.replace(/\s+/g, " ").slice(0, 400)}`), "");
  L.push("## How to go about it", "", ...(STEPS[t.type] ?? STEPS.feature!).map((s, i) => `${i + 1}. ${s}`), `${(STEPS[t.type] ?? STEPS.feature!).length + 1}. Run \`npm run typecheck\` and the tests for the area you changed, and fix anything that fails.`, "");
  L.push("## Rules", "", ...RULES.map((r) => `- ${r}`), "");
  if (t.checklist?.length) L.push("## Definition of done", "", ...t.checklist.map((c) => `- [${c.done ? "x" : " "}] ${c.text}`), "");
  const prefix = t.type === "bug" ? "fix" : t.type === "chore" ? "chore" : t.type === "research" ? "docs" : "feat";
  L.push(
    "## Hand back",
    "",
    `- Work on the branch \`${prefix}/${t.code}-${slug(t.title)}\`.`,
    `- A commit message in the project's style: \`${prefix}: ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}\` (what changed, as the user sees it).`,
    "- A pull request description: what changed and why, how it was tested (commands, roles, devices), database changes, what to watch after the deploy, how to undo it.",
    "- Ask before anything you cannot undo (deleting data, pushing to main, changing production settings).",
  );
  return L.join("\n").trim() + "\n";
}
