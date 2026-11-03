// Planning (Phases 12b.2 and 12b.4): project templates that bring a project's epics, milestones, tasks and documents;
// Gantt baselines (planned dates saved, then shown against the actual ones); epics with their progress; export to
// MS Project (XML); and a portfolio of every department's projects for heads and owners.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { getDeptConfig, saveDeptConfig, workAccess } from "./dept-config";
import { listProjects, listTasks, saveMilestone, saveProject, saveTask } from "./work";
import { createDoc } from "./dev-studio";
import { myDepartments } from "./departments";
import type { DocKind } from "@/lib/dev-docs";

export type TemplateBody = {
  epics: { title: string; tasks: { title: string; type?: string; days?: number }[] }[];
  milestones: { name: string; day: number }[];
  docs: DocKind[];
};
export type ProjectTemplate = { id: string; name: string; description: string; body: TemplateBody; builtIn: boolean };

// Ready templates for Myseed's own work (12b.4); heads and Admin add their own or change copies of these.
export const BUILT_IN: ProjectTemplate[] = [
  {
    id: "builtin:feature",
    name: "New app feature",
    description: "From the requirement to the release: spec, design, build, test, ship.",
    builtIn: true,
    body: {
      epics: [
        { title: "Specification", tasks: [{ title: "Write the SRS and acceptance criteria", days: 5 }, { title: "Review the SRS with the product owner", days: 7 }] },
        { title: "Design", tasks: [{ title: "Screens and flows", days: 10 }, { title: "Technical design", days: 10 }] },
        { title: "Build", tasks: [{ title: "Backend", days: 20 }, { title: "Mobile app", days: 25 }, { title: "Amharic texts", days: 25 }] },
        { title: "Test and release", tasks: [{ title: "Test plan on students' devices", type: "task", days: 28 }, { title: "Release notes", days: 30 }] },
      ],
      milestones: [
        { name: "Spec approved", day: 7 },
        { name: "Feature complete", day: 25 },
        { name: "Released", day: 30 },
      ],
      docs: ["srs", "design", "testplan"],
    },
  },
  {
    id: "builtin:content-import",
    name: "Content import pipeline",
    description: "Bringing a batch of lessons into the app from production.",
    builtIn: true,
    body: {
      epics: [{ title: "Import", tasks: [{ title: "Map the curriculum (grade, subject, unit, part)", days: 3 }, { title: "Import script and dry run", days: 8 }, { title: "Check playback and metadata", days: 12 }, { title: "Go live", days: 14 }] }],
      milestones: [{ name: "Dry run passed", day: 8 }, { name: "Live", day: 14 }],
      docs: ["design", "runbook"],
    },
  },
  {
    id: "builtin:rollout",
    name: "New grade or subject rollout",
    description: "A new grade or subject from planning to launch, with marketing.",
    builtIn: true,
    body: {
      epics: [
        { title: "Content", tasks: [{ title: "Curriculum plan approved", days: 7 }, { title: "Recording schedule booked", days: 14 }, { title: "First units published", days: 45 }] },
        { title: "App", tasks: [{ title: "Grade or subject added in the app", days: 30 }, { title: "Offline packs", days: 40 }] },
        { title: "Launch", tasks: [{ title: "Launch campaign", days: 50 }, { title: "School partner briefings", days: 55 }] },
      ],
      milestones: [{ name: "Content ready", day: 45 }, { name: "Launch", day: 60 }],
      docs: ["prd", "testplan"],
    },
  },
  {
    id: "builtin:mobile-release",
    name: "Mobile release",
    description: "A store release of the learning app.",
    builtIn: true,
    body: {
      epics: [{ title: "Release", tasks: [{ title: "Freeze the release branch", days: 1 }, { title: "Regression tests on the test devices", days: 4 }, { title: "Store listing and screenshots", days: 5 }, { title: "Submit to the stores", days: 6 }, { title: "Staged rollout and watch crash reports", days: 10 }] }],
      milestones: [{ name: "Submitted", day: 6 }, { name: "Fully rolled out", day: 10 }],
      docs: ["release", "runbook"],
    },
  },
  {
    id: "builtin:bug-bash",
    name: "Bug bash",
    description: "A focused week of finding and fixing bugs.",
    builtIn: true,
    body: { epics: [{ title: "Bug bash", tasks: [{ title: "Choose the areas and testers", days: 1 }, { title: "Bash day", days: 2 }, { title: "Triage the bugs found", days: 3 }, { title: "Fix the top ten", days: 7 }] }], milestones: [{ name: "Bash day", day: 2 }, { name: "Fixes shipped", day: 7 }], docs: ["postmortem"] },
  },
];

export async function listTemplates(user: AppUser, d: string): Promise<ProjectTemplate[]> {
  const a = await workAccess(user, d);
  const own = await all<{ id: string; name: string; description: string; body: string }>("SELECT id, name, description, body FROM dept_project_templates WHERE dept = ? ORDER BY name", a.dept);
  return [...own.map((t) => ({ id: t.id, name: t.name, description: t.description, body: parseJson<TemplateBody>(t.body, { epics: [], milestones: [], docs: [] }), builtIn: false })), ...BUILT_IN];
}

export async function saveTemplate(user: AppUser, d: string, input: { id?: string | null; name: string; description?: string; body: TemplateBody }) {
  const a = await workAccess(user, d);
  if (!a.rights.configure && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the department's head or Admin changes templates.");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the template.");
  const body: TemplateBody = {
    epics: (input.body?.epics ?? []).slice(0, 20).map((e) => ({ title: String(e.title).slice(0, 120), tasks: (e.tasks ?? []).slice(0, 40).map((t) => ({ title: String(t.title).slice(0, 200), type: t.type, days: Math.max(0, Math.round(Number(t.days ?? 0))) })) })),
    milestones: (input.body?.milestones ?? []).slice(0, 20).map((m) => ({ name: String(m.name).slice(0, 80), day: Math.max(0, Math.round(Number(m.day ?? 0))) })),
    docs: (input.body?.docs ?? []).slice(0, 10),
  };
  const now = nowIso();
  if (input.id && !input.id.startsWith("builtin:")) {
    await run("UPDATE dept_project_templates SET name = ?, description = ?, body = ?, updated_at = ? WHERE id = ? AND dept = ?", name, input.description ?? "", JSON.stringify(body), now, input.id, a.dept);
    return input.id;
  }
  const id = uid("ptp_");
  await run("INSERT INTO dept_project_templates (id, dept, name, description, body, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, a.dept, name, input.description ?? "", JSON.stringify(body), user.id, now, now);
  return id;
}

export async function deleteTemplate(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d);
  if (!a.rights.configure && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the department's head or Admin changes templates.");
  await run("DELETE FROM dept_project_templates WHERE id = ? AND dept = ?", id, a.dept);
}

// A new project from a template: the project, its milestones, epics with their tasks (dated from the start), and
// the documents. An "Epic" task type is added to the department when it has none.
export async function applyTemplate(user: AppUser, d: string, templateId: string, input: { name: string; key: string; start: string; leadId?: string | null }) {
  const a = await workAccess(user, d, "write");
  if (!a.rights.projects) throw new WorkflowError("FORBIDDEN", "Only leads and heads start projects.");
  const t = (await listTemplates(user, d)).find((x) => x.id === templateId);
  if (!t) throw new WorkflowError("NOT_FOUND", "Template not found.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start)) throw new WorkflowError("VALIDATION", "Choose the start date.");
  const at = (days: number) => new Date(Date.parse(`${input.start}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
  const end = Math.max(0, ...t.body.milestones.map((m) => m.day), ...t.body.epics.flatMap((e) => e.tasks.map((x) => x.days ?? 0)));
  let cfg = await getDeptConfig(a.dept);
  // An "Epic" type is added when the department has none and the person may configure it; otherwise the epics are
  // ordinary tasks with the template's tasks under them.
  if (t.body.epics.length && !cfg.types.some((x) => x.key === "epic") && a.rights.configure) {
    const { version, ...plain } = cfg;
    await saveDeptConfig(user, a.dept, { ...plain, types: [...plain.types, { key: "epic", label: "Epic", color: "#9334E6", active: true, checklist: [] }] }, version, "added the Epic task type for a project template");
    cfg = await getDeptConfig(a.dept);
  }
  const epicType = cfg.types.some((x) => x.key === "epic") ? "epic" : undefined;
  const firstStatus = cfg.projectStatuses.find((x) => x.category !== "done" && x.category !== "cancelled")?.key ?? cfg.projectStatuses[0]?.key ?? "active";
  const projectId = await saveProject(user, a.dept, { name: input.name, key: input.key.trim().toUpperCase(), status: firstStatus, startDate: input.start, dueDate: at(end), leadId: input.leadId ?? null });
  for (const m of t.body.milestones) await saveMilestone(user, a.dept, { projectId, name: m.name, dueDate: at(m.day) });
  let tasks = 0;
  for (const e of t.body.epics) {
    const last = Math.max(0, ...e.tasks.map((x) => x.days ?? 0));
    const epicId = await saveTask(user, a.dept, { title: e.title, ...(epicType ? { type: epicType } : {}), projectId, startDate: input.start, dueDate: at(last) }, { automations: false });
    for (const x of e.tasks) {
      const type = x.type && cfg.types.some((y) => y.key === x.type) ? x.type : undefined;
      await saveTask(user, a.dept, { title: x.title, parentId: epicId, projectId, dueDate: at(x.days ?? last), ...(type ? { type } : {}) }, { automations: false });
      tasks++;
    }
  }
  for (const k of t.body.docs) await createDoc(user, a.dept, { kind: k, projectId, title: `${input.name}: ${k.replace("_", " ")}` }).catch(() => null);
  await audit({ actor: user }, { action: `${a.dept}.template`, summary: `${user.name} started ${input.name} from the template ${t.name} (${tasks} tasks)` });
  return { projectId, tasks };
}

// ---------------------------------------------------------------------------
// Baselines and epics
// ---------------------------------------------------------------------------

export async function saveBaseline(user: AppUser, d: string, projectId: string | null) {
  const a = await workAccess(user, d);
  if (!a.rights.projects && !a.rights.seeAll) throw new WorkflowError("FORBIDDEN", "Only leads and heads save a baseline.");
  const rows = await all<{ id: string; start_date: string | null; due_date: string | null }>(
    `SELECT id, start_date, due_date FROM dept_tasks WHERE dept = ? AND (start_date IS NOT NULL OR due_date IS NOT NULL) ${projectId ? "AND project_id = ?" : ""}`,
    a.dept,
    ...(projectId ? [projectId] : []),
  );
  const now = nowIso();
  for (const r of rows)
    await run(
      "INSERT INTO dept_task_baselines (task_id, dept, start_date, due_date, saved_at, saved_by) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (task_id) DO UPDATE SET start_date = excluded.start_date, due_date = excluded.due_date, saved_at = excluded.saved_at, saved_by = excluded.saved_by",
      r.id,
      a.dept,
      r.start_date,
      r.due_date,
      now,
      user.id,
    );
  return rows.length;
}

export async function baselines(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const rows = await all<{ task_id: string; start_date: string | null; due_date: string | null; saved_at: string }>("SELECT task_id, start_date, due_date, saved_at FROM dept_task_baselines WHERE dept = ?", a.dept);
  return Object.fromEntries(rows.map((r) => [r.task_id, { start: r.start_date, due: r.due_date, savedAt: r.saved_at }]));
}

// Tasks whose dates moved since the baseline, latest slip first.
export async function baselineDrift(user: AppUser, d: string) {
  const base = await baselines(user, d);
  const { tasks } = await listTasks(user, d, { open: false });
  const days = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(a) - Date.parse(b)) / 864e5) : 0);
  const rows = tasks
    .filter((t) => base[t.id])
    .map((t) => ({ id: t.id, code: t.code, title: t.title, baseDue: base[t.id].due, due: t.due_date, slipDays: days(t.due_date, base[t.id].due) }))
    .filter((r) => r.slipDays !== 0)
    .sort((x, y) => y.slipDays - x.slipDays);
  const savedAt = Object.values(base).map((b) => b.savedAt).sort().pop() ?? null;
  return { savedAt, tracked: Object.keys(base).length, rows };
}

export async function epics(user: AppUser, d: string) {
  const { tasks } = await listTasks(user, d, { open: false });
  return tasks
    .filter((t) => t.type === "epic")
    .map((e) => {
      const kids = tasks.filter((t) => t.parent_id === e.id && t.status_category !== "cancelled");
      const done = kids.filter((t) => t.status_category === "done").length;
      return { id: e.id, code: e.code, title: e.title, project: e.project_name, due: e.due_date, children: kids.length, done, progress: kids.length ? Math.round((done / kids.length) * 100) : 0 };
    });
}

// ---------------------------------------------------------------------------
// Export to MS Project (MSPDI XML), opened by Microsoft Project and ProjectLibre
// ---------------------------------------------------------------------------

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export async function msProjectXml(user: AppUser, d: string, projectId: string | null) {
  const a = await workAccess(user, d);
  const projects = await listProjects(user, a.dept);
  const p = projectId ? projects.find((x) => x.id === projectId) : null;
  const { tasks } = await listTasks(user, a.dept, { open: false, ...(projectId ? { project: projectId } : {}) });
  const dated = tasks.filter((t) => t.start_date || t.due_date);
  const uidOf = new Map(dated.map((t, i) => [t.id, i + 1]));
  const day = (s: string | null, fb: string) => `${s ?? fb}T08:00:00`;
  const items = dated.map((t) => {
    const start = t.start_date ?? t.due_date!;
    const finish = t.due_date ?? t.start_date!;
    const days = Math.max(1, Math.round((Date.parse(finish) - Date.parse(start)) / 864e5) + 1);
    const preds = t.blocked_by.filter((b) => uidOf.has(b)).map((b) => `<PredecessorLink><PredecessorUID>${uidOf.get(b)}</PredecessorUID><Type>1</Type></PredecessorLink>`).join("");
    return `<Task><UID>${uidOf.get(t.id)}</UID><ID>${uidOf.get(t.id)}</ID><Name>${esc(`${t.code} ${t.title}`)}</Name><OutlineLevel>${t.parent_id && uidOf.has(t.parent_id) ? 2 : 1}</OutlineLevel><Start>${day(start, start)}</Start><Finish>${day(finish, finish).replace("08:00", "17:00")}</Finish><Duration>PT${days * 8}H0M0S</Duration><PercentComplete>${t.status_category === "done" ? 100 : t.progress ?? 0}</PercentComplete>${preds}</Task>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project">
<Name>${esc(p?.name ?? a.config.title)}</Name>
<Title>${esc(p?.name ?? a.config.title)}</Title>
<CreationDate>${nowIso().slice(0, 19)}</CreationDate>
<Tasks>${items.join("\n")}</Tasks>
</Project>`;
}

// ---------------------------------------------------------------------------
// Portfolio: every department's projects, for heads and owners
// ---------------------------------------------------------------------------

export async function portfolio(user: AppUser) {
  const { roadmap } = await import("./dev-studio");
  const ds = (await myDepartments(user)).filter((x) => x.dept !== "studio");
  const out = [];
  for (const d of ds) {
    const r = await roadmap(user, d.dept).catch(() => null);
    if (!r) continue;
    for (const p of r.projects) out.push({ dept: d.dept, deptTitle: d.title, ...p });
  }
  return out;
}
export type PortfolioRow = Awaited<ReturnType<typeof portfolio>>[number];

void get;
