// Project packs on the Roadmap: a project's roadmap infographic (roadmap.sh style) from its milestones and tasks, the
// portfolio picture of every project, generating a project (full project or sub-project) from a template with its
// phases, topics and documents, and the project book: one document, set as a book, with everything about the
// project (cover, document control, contents, every chapter to the IEEE standards, the roadmap, traceability).

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { need, workAccess } from "./dept-config";
import { listDocs, roadmap } from "./dev-studio";
import { saveProject, saveTask } from "./work";
import type { AppUser } from "./users";
import { reportBrand } from "./report-doc";
import { BOOK_CHAPTERS, DOC_STANDARDS, PACK_DOCS, PROJECT_TYPES, ROADMAP_TEMPLATES, packDocBody, type ProjectType } from "@/lib/project-pack";
import { portfolioSvg, roadmapSvg, type GraphicPhase, type TopicStatus } from "@/lib/roadmap-svg";
import { renderSpecBody, escHtml } from "@/lib/spec-doc";
import { DOC_KINDS, docRef, requirementIds } from "@/lib/dev-docs";

type ProjectRow = { id: string; key: string; name: string; description: string | null; status: string; start_date: string | null; due_date: string | null; parent_id: string | null; meta: string; lead: string | null; color: string | null; created_at: string; updated_at: string };

export const projectTypeOf = (p: { parent_id: string | null; meta?: string | null }): ProjectType => {
  const m = parseJson<{ type?: string }>(p.meta ?? "{}", {});
  return m.type === "full" || m.type === "sub" ? m.type : p.parent_id ? "sub" : "full";
};

async function projectFor(user: AppUser, d: string, id: string) {
  const a = await workAccess(user, d);
  const p = await get<ProjectRow>("SELECT p.*, u.name AS lead FROM dept_projects p LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = ? AND p.dept = ?", id, a.dept);
  if (!p) throw new WorkflowError("NOT_FOUND", "Project not found.");
  // Members see the projects they reach on the Roadmap.
  const visible = (await roadmap(user, a.dept)).projects.find((x) => x.id === id);
  if (!visible) throw new WorkflowError("FORBIDDEN", "This project is not shared with you.");
  return { a, p, visible };
}

const topicStatus = (cat: string): TopicStatus => (cat === "done" ? "done" : cat === "active" || cat === "review" ? "doing" : "todo");

// The roadmap as phases (milestones) and topics (their tasks), for the infographic.
export async function projectGraphic(user: AppUser, d: string, id: string) {
  const { p, visible } = await projectFor(user, d, id);
  const ms = await all<{ id: string; name: string; due_date: string | null; status: string }>("SELECT id, name, due_date, status FROM dept_milestones WHERE project_id = ? ORDER BY sort, due_date", id);
  const tasks = await all<{ title: string; status_category: string; milestone_id: string | null; labels: string | null; project_id: string }>(
    "SELECT t.title, t.status_category, t.milestone_id, t.labels, t.project_id FROM dept_tasks t WHERE (t.project_id = ? OR t.project_id IN (SELECT id FROM dept_projects WHERE parent_id = ? AND archived = 0)) AND t.status_category <> 'cancelled' ORDER BY t.created_at",
    id,
    id,
  );
  const phases: GraphicPhase[] = ms.map((m) => {
    const list = tasks.filter((t) => t.milestone_id === m.id);
    const topics = list.map((t) => ({ title: t.title, status: topicStatus(t.status_category), optional: parseJson<string[]>(t.labels ?? "[]", []).includes("optional") }));
    const status: TopicStatus = m.status === "done" || (topics.length > 0 && topics.every((x) => x.status === "done" || x.optional)) ? "done" : topics.some((x) => x.status !== "todo") ? "doing" : "todo";
    return { name: m.name, due: m.due_date, status, topics };
  });
  const loose = tasks.filter((t) => !t.milestone_id || !ms.some((m) => m.id === t.milestone_id));
  if (loose.length) phases.push({ name: "Other work", due: null, status: loose.every((t) => t.status_category === "done") ? "done" : "doing", topics: loose.slice(0, 24).map((t) => ({ title: t.title, status: topicStatus(t.status_category) })) });
  const brand = await reportBrand();
  const type = projectTypeOf(p);
  const meta = parseJson<{ template?: string }>(p.meta, {});
  const tpl = ROADMAP_TEMPLATES.find((x) => x.key === meta.template);
  const svg = roadmapSvg({
    title: p.name,
    subtitle: [`${p.key}`, PROJECT_TYPES.find((x) => x.key === type)?.label, tpl?.label, p.lead ? `Lead: ${p.lead}` : null, p.due_date ? `Due ${p.due_date}` : null].filter(Boolean).join(" · "),
    progress: visible.progress,
    phases,
    brand: brand.name,
    date: new Date().toISOString().slice(0, 10),
  });
  return { svg, phases, project: { id: p.id, key: p.key, name: p.name, type, progress: visible.progress } };
}

export async function portfolioGraphic(user: AppUser, d: string) {
  const a = await workAccess(user, d);
  const r = await roadmap(user, a.dept);
  const metas = new Map((await all<{ id: string; meta: string }>("SELECT id, meta FROM dept_projects WHERE dept = ?", a.dept)).map((x) => [x.id, x]));
  // Parents first, each followed by its sub-projects.
  const tops = r.projects.filter((p) => !p.parent_id || !r.projects.some((x) => x.id === p.parent_id));
  const ordered = tops.flatMap((t) => [t, ...r.projects.filter((x) => x.parent_id === t.id)]);
  const brand = await reportBrand();
  return portfolioSvg(
    ordered.map((p) => ({ key: p.key, name: p.name, type: projectTypeOf({ parent_id: p.parent_id, meta: metas.get(p.id)?.meta }), start: p.start_date, due: p.due_date, progress: p.progress, health: p.health, lead: p.lead })),
    { title: "Projects roadmap", brand: brand.name, date: new Date().toISOString().slice(0, 10) },
  );
}

const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

// Generate a project pack: a new project (or an existing one) set to a type, its roadmap from a template (phases as
// milestones with dates, topics as tasks), and its starting documents with diagrams.
export async function generatePack(
  user: AppUser,
  d: string,
  input: { projectId?: string | null; project?: { key: string; name: string; description?: string | null; parentId?: string | null; startDate?: string | null } | null; type: ProjectType; template?: string | null; roadmap: boolean; docs: boolean },
) {
  const a = await workAccess(user, d, "write");
  need(a, "projects", "You cannot create projects here.");
  if (!PROJECT_TYPES.some((t) => t.key === input.type)) throw new WorkflowError("VALIDATION", "Choose the type: full project or sub-project.");
  const tpl = input.template ? ROADMAP_TEMPLATES.find((t) => t.key === input.template) : null;
  if (input.template && !tpl) throw new WorkflowError("VALIDATION", "Unknown template.");
  if (input.type === "sub" && !input.projectId && !input.project?.parentId) throw new WorkflowError("VALIDATION", "A sub-project belongs to a full project: choose its parent.");
  let id = input.projectId ?? null;
  if (!id) {
    if (!input.project) throw new WorkflowError("VALIDATION", "Name the project.");
    const status = a.config.projectStatuses.find((s) => s.active !== false && s.category !== "done" && s.category !== "cancelled")?.key ?? a.config.projectStatuses[0]!.key;
    const start = input.project.startDate || new Date().toISOString().slice(0, 10);
    const weeks = tpl?.phases.reduce((n, p) => n + p.weeks, 0) ?? 0;
    id = await saveProject(user, a.dept, {
      key: input.project.key,
      name: input.project.name,
      description: input.project.description ?? null,
      status,
      startDate: start,
      dueDate: weeks ? addDays(start, weeks * 7) : null,
      parentId: input.type === "sub" ? (input.project.parentId ?? null) : null,
      meta: { type: input.type, template: tpl?.key } as never,
    });
  }
  const p = await get<ProjectRow>("SELECT p.*, u.name AS lead FROM dept_projects p LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = ? AND p.dept = ?", id, a.dept);
  if (!p) throw new WorkflowError("NOT_FOUND", "Project not found.");
  // The type (and template) on the project.
  const meta = { ...parseJson<Record<string, unknown>>(p.meta, {}), type: input.type, ...(tpl ? { template: tpl.key } : {}) };
  await run("UPDATE dept_projects SET meta = ?, updated_at = ? WHERE id = ?", JSON.stringify(meta), nowIso(), id);
  const parent = p.parent_id ? (await get<{ name: string }>("SELECT name FROM dept_projects WHERE id = ?", p.parent_id))?.name ?? null : null;
  let tasks = 0;
  let milestones = 0;
  if (input.roadmap && tpl) {
    let at = p.start_date || new Date().toISOString().slice(0, 10);
    let sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) AS n FROM dept_milestones WHERE project_id = ?", id))?.n ?? 0);
    for (const ph of tpl.phases) {
      at = addDays(at, ph.weeks * 7);
      const mid = uid("mst_");
      await run("INSERT INTO dept_milestones (id, project_id, name, due_date, status, sort, created_at) VALUES (?, ?, ?, ?, 'open', ?, ?)", mid, id, ph.name, at, ++sort, nowIso());
      milestones++;
      for (const t of ph.topics) {
        await saveTask(user, a.dept, { title: t.title, projectId: id, milestoneId: mid, dueDate: at, labels: t.optional ? ["roadmap", "optional"] : ["roadmap"] }, { automations: false });
        tasks++;
      }
    }
  }
  let docs = 0;
  if (input.docs) {
    const have = new Set((await all<{ kind: string }>("SELECT kind FROM dept_docs WHERE project_id = ?", id)).map((r) => r.kind));
    const now = nowIso();
    for (const dd of PACK_DOCS[input.type]) {
      if (have.has(dd.kind)) continue;
      const body = packDocBody(dd.kind, { name: p.name, key: p.key, type: input.type, description: p.description, parent, lead: p.lead, start: p.start_date, due: p.due_date, template: tpl ?? null });
      await run(
        "INSERT INTO dept_docs (id, dept, project_id, kind, title, body, status, version, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?, ?)",
        uid("doc_"),
        a.dept,
        id,
        dd.kind,
        `${p.name}: ${dd.title}`.slice(0, 160),
        body,
        user.id,
        now,
        now,
      );
      docs++;
    }
  }
  await audit({ actor: user }, { action: `${a.dept}.project_pack`, summary: `${user.name} generated the ${input.type === "full" ? "full project" : "sub-project"} pack for ${p.key}${tpl ? ` from "${tpl.label}"` : ""}: ${milestones} phases, ${tasks} topics, ${docs} documents` });
  return { projectId: id, milestones, tasks, docs };
}

// ---------------------------------------------------------------------------
// The project book
// ---------------------------------------------------------------------------

export async function projectBook(user: AppUser, d: string, id: string) {
  const { a, p, visible } = await projectFor(user, d, id);
  const type = projectTypeOf(p);
  const brand = await reportBrand();
  const graphic = await projectGraphic(user, d, id);
  const subs = await all<{ id: string; key: string; name: string; status: string }>("SELECT id, key, name, status FROM dept_projects WHERE parent_id = ? AND archived = 0 ORDER BY key", id);
  const parent = p.parent_id ? await get<{ key: string; name: string }>("SELECT key, name FROM dept_projects WHERE id = ?", p.parent_id) : null;
  // The documents this person may read, of this project and its sub-projects.
  const allowed = (await listDocs(user, a.dept)).filter((x) => x.projectId === id || subs.some((s) => s.id === x.projectId));
  const bodies = allowed.length
    ? await all<{ id: string; kind: string; title: string; body: string; status: string; version: number; updated_at: string; approved_at: string | null; author: string | null; project_id: string }>(
        `SELECT x.id, x.kind, x.title, x.body, x.status, x.version, x.updated_at, x.approved_at, u.name AS author, x.project_id FROM dept_docs x LEFT JOIN users u ON u.id = x.created_by WHERE x.id IN (${allowed.map(() => "?").join(",")}) ORDER BY x.created_at`,
        ...allowed.map((x) => x.id),
      )
    : [];
  const ms = await all<{ name: string; due_date: string | null; status: string }>("SELECT name, due_date, status FROM dept_milestones WHERE project_id = ? ORDER BY sort, due_date", id);
  const tasks = await all<{ code: string; title: string; status: string; status_category: string; assignee: string | null; due_date: string | null; description: string | null }>(
    "SELECT t.code, t.title, t.status, t.status_category, u.name AS assignee, t.due_date, t.description FROM dept_tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.project_id = ? AND t.status_category <> 'cancelled' ORDER BY t.created_at LIMIT 500",
    id,
  );
  const versions = bodies.length
    ? await all<{ doc_id: string; version: number; saved_at: string; status: string; by: string | null }>(
        `SELECT v.doc_id, v.version, v.saved_at, v.status, u.name AS by FROM dept_doc_versions v LEFT JOIN users u ON u.id = v.saved_by WHERE v.doc_id IN (${bodies.map(() => "?").join(",")}) ORDER BY v.saved_at`,
        ...bodies.map((b) => b.id),
      )
    : [];
  const date = new Date().toISOString().slice(0, 10);
  const ref = `${a.dept.toUpperCase()}-BOOK-${p.key}`;
  const e = escHtml;
  const label = (k: string) => DOC_KINDS.find((x) => x.key === k)?.label ?? "Document";

  // Chapters: overview, roadmap, then the documents by kind in the IEEE order, then traceability and appendices.
  type Chapter = { id: string; title: string; html: string; subs: { id: string; title: string }[] };
  const chapters: Chapter[] = [];
  chapters.push({
    id: "ch-overview",
    title: "Project overview",
    subs: [],
    html: `<p>${e(p.description || `${p.name} (${p.key}).`)}</p>
<table class="kv"><tbody>
<tr><th>Project</th><td>${e(p.name)} (${e(p.key)})</td></tr>
<tr><th>Type</th><td>${type === "full" ? "Full project" : `Sub-project of ${e(parent ? `${parent.name} (${parent.key})` : "its parent")}`}</td></tr>
<tr><th>Lead</th><td>${e(p.lead ?? "Not set")}</td></tr>
<tr><th>Dates</th><td>${e(p.start_date ?? "Not set")} to ${e(p.due_date ?? "not set")}</td></tr>
<tr><th>Progress</th><td>${visible.progress}% · ${e(String(visible.status))} · ${visible.health.replace("_", " ")}</td></tr>
<tr><th>Team</th><td>${e(visible.team.join(", ") || "Not yet")}</td></tr>
${subs.length ? `<tr><th>Sub-projects</th><td>${subs.map((s) => `${e(s.key)} ${e(s.name)}`).join("<br>")}</td></tr>` : ""}
</tbody></table>`,
  });
  chapters.push({
    id: "ch-roadmap",
    title: "Roadmap",
    subs: [],
    html: `<figure class="book-figure">${graphic.svg}<figcaption>Figure: the ${e(p.name)} roadmap. Phases down the middle; done topics are ticked.</figcaption></figure>
${ms.length ? `<table><thead><tr><th>Phase</th><th>Due</th><th>Status</th></tr></thead><tbody>${ms.map((m) => `<tr><td>${e(m.name)}</td><td>${e(m.due_date ?? "")}</td><td>${m.status === "done" ? "Done" : "Open"}</td></tr>`).join("")}</tbody></table>` : ""}`,
  });
  for (const c of BOOK_CHAPTERS) {
    const docs = bodies.filter((b) => c.kinds.includes(b.kind));
    if (!docs.length) continue;
    const ch: Chapter = { id: `ch-${c.key}`, title: c.title, subs: [], html: `<p class="chapter-intro">${e(c.intro)}</p>` };
    for (const doc of docs) {
      const sid = `doc-${doc.id}`;
      ch.subs.push({ id: sid, title: doc.title });
      const { html } = renderSpecBody(doc.body, { title: doc.title });
      ch.html += `<section class="book-doc" id="${sid}">
<h2>${e(doc.title)}</h2>
<p class="doc-meta">${e(label(doc.kind))} · ${e(docRef(a.dept, doc.kind, doc.id))} · version ${doc.version} · ${doc.status === "approved" ? `approved ${e((doc.approved_at ?? "").slice(0, 10))}` : e(doc.status)}${doc.author ? ` · ${e(doc.author)}` : ""}${DOC_STANDARDS[doc.kind] ? ` · ${e(DOC_STANDARDS[doc.kind]!)}` : ""}</p>
<div class="book-body">${html}</div>
</section>`;
    }
    chapters.push(ch);
  }
  // Traceability: each requirement ID, the documents that state it and the tasks that carry it.
  const reqs = new Map<string, Set<string>>();
  for (const b of bodies) for (const r of requirementIds(b.body)) reqs.set(r, (reqs.get(r) ?? new Set()).add(b.title));
  const links = await all<{ req: string; code: string; title: string; status_category: string }>(
    "SELECT l.req, t.code, t.title, t.status_category FROM dept_doc_links l JOIN dept_tasks t ON t.id = l.task_id WHERE l.doc_id IN (SELECT id FROM dept_docs WHERE project_id = ?)",
    id,
  );
  if (reqs.size)
    chapters.push({
      id: "ch-trace",
      title: "Requirements traceability",
      subs: [],
      html: `<p class="chapter-intro">Every requirement, where it is stated and the work that delivers it (ISO/IEC/IEEE 29148).</p><table><thead><tr><th>Requirement</th><th>Stated in</th><th>Tasks</th></tr></thead><tbody>${[...reqs.entries()]
        .sort(([x], [y]) => x.localeCompare(y, "en", { numeric: true }))
        .map(([r, docs]) => `<tr><td><b>${e(r)}</b></td><td>${[...docs].map(e).join("<br>")}</td><td>${links.filter((l) => l.req === r).map((l) => `${e(l.code)} ${e(l.title)}${l.status_category === "done" ? " ✓" : ""}`).join("<br>") || "<span class=muted>Not linked yet</span>"}</td></tr>`)
        .join("")}</tbody></table>`,
    });
  if (tasks.length)
    chapters.push({
      id: "ch-work",
      title: "Appendix A: the work",
      subs: [],
      html: `<table><thead><tr><th>Task</th><th>Title</th><th>Status</th><th>Who</th><th>Due</th></tr></thead><tbody>${tasks.map((t) => `<tr><td>${e(t.code)}</td><td>${e(t.title)}</td><td>${e(t.status)}</td><td>${e(t.assignee ?? "")}</td><td>${e(t.due_date ?? "")}</td></tr>`).join("")}</tbody></table>`,
    });
  chapters.push({
    id: "ch-index",
    title: `Appendix ${tasks.length ? "B" : "A"}: documents and standards`,
    subs: [],
    html: `<table><thead><tr><th>Document</th><th>Kind</th><th>Reference</th><th>Version</th><th>Standard</th></tr></thead><tbody>${bodies.map((b) => `<tr><td>${e(b.title)}</td><td>${e(label(b.kind))}</td><td>${e(docRef(a.dept, b.kind, b.id))}</td><td>${b.version}</td><td>${e(DOC_STANDARDS[b.kind] ?? "")}</td></tr>`).join("") || `<tr><td colspan=5 class=muted>No documents yet. Generate the project pack on the Roadmap.</td></tr>`}</tbody></table>`,
  });

  const cover = `<section class="book-cover">
<div class="cover-band" style="background:${e(brand.color)}"></div>
<img class="cover-logo" src="${e(brand.logo)}" alt="">
<p class="cover-org">${e(brand.name)}</p>
<p class="cover-kind">Project book</p>
<h1 class="cover-title">${e(p.name)}</h1>
<p class="cover-sub">${type === "full" ? "Full project" : `Sub-project of ${e(parent?.name ?? "its parent")}`} · ${e(p.key)}</p>
<table class="cover-meta"><tbody>
<tr><th>Reference</th><td>${e(ref)}</td></tr>
<tr><th>Date</th><td>${date}</td></tr>
<tr><th>Lead</th><td>${e(p.lead ?? "Not set")}</td></tr>
<tr><th>Prepared for</th><td>${e(user.name)}</td></tr>
<tr><th>Standards</th><td>ISO/IEC/IEEE 29148, IEEE 1016, IEEE 829, IEEE 16326, IEEE 1063</td></tr>
</tbody></table>
<p class="cover-foot">${bodies.length} documents · ${ms.length} phases · ${tasks.length} tasks</p>
</section>`;
  const control = `<section class="book-front" id="control"><h1>Document control</h1>
<table><thead><tr><th>Document</th><th>Version</th><th>Status</th><th>Last change</th></tr></thead><tbody>${bodies.map((b) => `<tr><td>${e(b.title)}</td><td>${b.version}</td><td>${e(b.status)}</td><td>${e(b.updated_at.slice(0, 10))}</td></tr>`).join("") || "<tr><td colspan=4 class=muted>No documents yet.</td></tr>"}</tbody></table>
${versions.length ? `<h2>Revision history</h2><table><thead><tr><th>Document</th><th>Version</th><th>Saved</th><th>By</th><th>Status</th></tr></thead><tbody>${versions.map((v) => `<tr><td>${e(bodies.find((b) => b.id === v.doc_id)?.title ?? "")}</td><td>${v.version}</td><td>${e(v.saved_at.slice(0, 10))}</td><td>${e(v.by ?? "")}</td><td>${e(v.status)}</td></tr>`).join("")}</tbody></table>` : ""}
</section>`;
  const toc = `<section class="book-front" id="contents"><h1>Contents</h1><ol class="toc">${chapters.map((c) => `<li><a href="#${c.id}">${e(c.title)}</a>${c.subs.length ? `<ol>${c.subs.map((s) => `<li><a href="#${s.id}">${e(s.title)}</a></li>`).join("")}</ol>` : ""}</li>`).join("")}</ol></section>`;
  const body = chapters.map((c, i) => `<section class="book-chapter" id="${c.id}"><p class="chapter-no">Chapter ${i + 1}</p><h1>${e(c.title)}</h1>${c.html}</section>`).join("");
  return { title: `${p.name}: project book`, html: cover + control + toc + body, ref, brand: brand.name, project: { key: p.key, name: p.name } };
}
