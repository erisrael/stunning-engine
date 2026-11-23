// The Dev team's record of how the system was built (docs/dev-history.json): projects with milestones, sprints,
// releases with their production deployments, and tasks, assigned to the Dev account that did the work (Kidus).
// Applied when the server starts (src/instrumentation.ts) and with `npm run dev:history`.
//
// It only adds what is missing and never changes or removes what people have changed in the app: a project, sprint,
// release or task that already exists (by its key, name or code) is left as it is. When the file changes, new
// entries are added on the next start. Without the Dev account it does nothing, so it can run again once the
// account exists. MYSEED_DEV_OWNER_EMAIL names the account when the name alone is not enough.

import crypto from "node:crypto";
import { all, get, nowIso, run, tx, uid } from "./db";
import { audit } from "./workflow";
import { getDeptConfig } from "./dept-config";

export type DoneTask = [code: string, title: string, type: string, points: number, start: string, done: string, release: string, description: string];
// Open work: on the timeline from its sprint (or its own start and due dates), with acceptance criteria and the
// done checklist. Backlog work has no sprint and no dates until it is planned.
type OpenTask = { code: string; title: string; type: string; points: number | null; priority?: string; status: "todo" | "backlog"; sprint?: string; milestone?: string; description?: string; acceptance?: string; start?: string; due?: string };
export type DevHistory = {
  dept?: string;
  sprints: { name: string; start: string; end: string; status: "closed" | "active" | "planned"; goal: string; review?: string }[];
  releases: { name: string; version: string; date: string; commit: string; notes: string }[];
  projects: {
    key: string;
    // The main project this one is part of (sub-projects, v90).
    parent?: string;
    name: string;
    color: string;
    status: string;
    start: string;
    due: string | null;
    description: string;
    milestones: { name: string; due: string | null; status?: "open" | "done" }[];
    tasks: (DoneTask | OpenTask)[];
  }[];
};
export type HistoryResult = { applied: boolean; reason?: string; owner?: string; projects: number; sprints: number; releases: number; tasks: number; skipped: number; nested?: number };

const at = (day: string, hour: number) => `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;

async function owner() {
  const email = process.env.MYSEED_DEV_OWNER_EMAIL?.trim().toLowerCase();
  const rows = await all<{ id: string; name: string; dev: number; pos: number }>(
    `SELECT u.id, u.name,
       CASE WHEN EXISTS (SELECT 1 FROM role_assignments r WHERE r.user_id = u.id AND r.role = 'developer') THEN 1 ELSE 0 END AS dev,
       CASE WHEN EXISTS (SELECT 1 FROM department_positions p WHERE p.user_id = u.id AND p.department = 'dev') THEN 1 ELSE 0 END AS pos
     FROM users u WHERE u.active = 1 AND ${email ? "lower(u.email) = ?" : "lower(u.name) LIKE 'kidus%'"}
     ORDER BY dev DESC, pos DESC, u.name`,
    ...(email ? [email] : []),
  );
  return rows[0] ?? null;
}

export async function applyDevHistory(opts: { root?: string; file?: string; force?: boolean } = {}): Promise<HistoryResult> {
  const fs = (await import(/* turbopackIgnore: true */ "node:fs/promises")) as typeof import("node:fs/promises");
  const path = (await import(/* turbopackIgnore: true */ "node:path")) as typeof import("node:path");
  const result: HistoryResult = { applied: false, projects: 0, sprints: 0, releases: 0, tasks: 0, skipped: 0 };
  let text: string;
  try {
    text = await fs.readFile(path.join(opts.root ?? process.cwd(), opts.file ?? path.join("docs", "dev-history.json")), "utf8");
  } catch {
    return { ...result, reason: "no record file" };
  }
  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const done = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'dev_history_hash'");
  if (!opts.force && done && JSON.parse(done.value) === hash) return { ...result, reason: "already applied" };
  const h = JSON.parse(text) as DevHistory;
  const dept = h.dept ?? "dev";
  const who = await owner();
  if (!who) return { ...result, reason: "no Dev account named Kidus (or MYSEED_DEV_OWNER_EMAIL) yet" };
  result.owner = who.name;

  // The department's own keys: the done status (Released in the Dev flow), the first open ones, the task types.
  const cfg = await getDeptConfig(dept);
  const st = cfg.statuses.filter((s) => s.active);
  const pick = (keys: string[], category: string) => st.find((s) => keys.includes(s.key)) ?? st.find((s) => s.category === category)!;
  const doneSt = pick(["released", "done"], "done");
  const todoSt = pick(["todo"], "open");
  const backlogSt = pick(["backlog"], "open");
  const types = cfg.types.filter((t) => t.active).map((t) => t.key);
  const typeOf = (t: string) => (types.includes(t) ? t : (types[0] ?? "task"));
  const prioOf = (p?: string) => (cfg.priorities.some((x) => x.key === p && x.active) ? p! : "normal");
  const doneProject = cfg.projectStatuses.find((s) => s.key === "done" && s.active) ?? cfg.projectStatuses.find((s) => s.category === "done")!;
  const activeProject = cfg.projectStatuses.find((s) => s.key === "active" && s.active) ?? cfg.projectStatuses.find((s) => s.category === "active")!;

  await tx(async () => {
    // Kidus heads the Dev team when no position is set yet.
    if (!(await get("SELECT 1 AS x FROM department_positions WHERE department = ? AND user_id = ?", dept, who.id)))
      await run("INSERT INTO department_positions (department, user_id, position) VALUES (?, ?, 'head') ON CONFLICT DO NOTHING", dept, who.id);

    const sprintIds = new Map<string, { id: string; start: string; end: string; status: string }>();
    for (const s of h.sprints) {
      const found = await get<{ id: string; start_date: string | null; end_date: string | null; status: string }>("SELECT id, start_date, end_date, status FROM dept_sprints WHERE dept = ? AND lower(name) = lower(?)", dept, s.name);
      if (found) {
        sprintIds.set(s.name, { id: found.id, start: found.start_date ?? s.start, end: found.end_date ?? s.end, status: found.status });
        continue;
      }
      // One active sprint at a time: an older open sprint keeps its state and this one starts as planned.
      const status = s.status === "active" && (await get("SELECT 1 AS x FROM dept_sprints WHERE dept = ? AND status = 'active'", dept)) ? "planned" : s.status;
      const id = uid("spr_");
      await run("INSERT INTO dept_sprints (id, dept, name, goal, start_date, end_date, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", id, dept, s.name, s.goal, s.start, s.end, status, at(s.start, 6));
      sprintIds.set(s.name, { id, start: s.start, end: s.end, status });
      result.sprints++;
    }
    const sprintOf = (day: string) => h.sprints.find((s) => s.start <= day && day <= s.end);

    const releaseIds = new Map<string, { id: string; created: string }>();
    for (const r of h.releases) {
      const found = await get<{ id: string; created_at: string }>("SELECT id, created_at FROM dept_releases WHERE dept = ? AND (lower(name) = lower(?) OR version = ?)", dept, r.name, r.version);
      if (found) {
        releaseIds.set(r.name, { id: found.id, created: found.created_at });
        continue;
      }
      const id = uid("rel_");
      const created = at(r.date, 16);
      await run("INSERT INTO dept_releases (id, dept, name, notes, task_count, created_by, created_at, version) VALUES (?, ?, ?, ?, 0, ?, ?, ?)", id, dept, r.name, r.notes, who.id, created, r.version);
      await run("INSERT INTO dev_deployments (id, dept, environment, version, release_id, status, commit_sha, url, source, at) VALUES (?, ?, 'production', ?, ?, 'ok', ?, 'https://ops.myseed.com.et', 'history', ?)", uid("dep_"), dept, r.version, id, r.commit, created);
      releaseIds.set(r.name, { id, created });
      result.releases++;
    }

    let sort = Number((await get<{ n: number }>("SELECT COALESCE(MAX(sort), 0) AS n FROM dept_tasks WHERE dept = ?", dept))?.n ?? 0);
    for (const p of h.projects) {
      let project = await get<{ id: string }>("SELECT id FROM dept_projects WHERE dept = ? AND key = ?", dept, p.key);
      if (!project) {
        const id = uid("prj_");
        const status = p.status === "done" ? doneProject.key : activeProject.key;
        await run(
          "INSERT INTO dept_projects (id, dept, key, name, description, status, lead_id, start_date, due_date, color, meta, next_number, archived, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)",
          id, dept, p.key, p.name, p.description, status, who.id, p.start, p.due, p.color, JSON.stringify({ source: "history" }), who.id, at(p.start, 6), at(p.due ?? p.start, 16),
        );
        project = { id };
        result.projects++;
      }
      const milestoneIds = new Map<string, { id: string; due: string | null }>();
      for (const [i, m] of p.milestones.entries()) {
        const found = await get<{ id: string; due_date: string | null }>("SELECT id, due_date FROM dept_milestones WHERE project_id = ? AND lower(name) = lower(?)", project.id, m.name);
        if (found) {
          milestoneIds.set(m.name, { id: found.id, due: found.due_date });
          continue;
        }
        const id = uid("ms_");
        await run("INSERT INTO dept_milestones (id, project_id, name, due_date, status, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, project.id, m.name, m.due, m.status ?? (p.status === "done" ? "done" : "open"), i, at(p.start, 6));
        milestoneIds.set(m.name, { id, due: m.due });
      }
      const dated = [...milestoneIds.values()].filter((m) => m.due).sort((x, y) => x.due!.localeCompare(y.due!));
      let highest = 0;
      for (const raw of p.tasks) {
        const t: OpenTask & { start?: string; done?: string; release?: string } = Array.isArray(raw)
          ? { code: raw[0], title: raw[1], type: raw[2], points: raw[3], start: raw[4], done: raw[5], release: raw[6], description: raw[7], status: "todo" }
          : raw;
        highest = Math.max(highest, Number(t.code.split("-").pop()) || 0);
        if (await get("SELECT 1 AS x FROM dept_tasks WHERE dept = ? AND upper(code) = upper(?)", dept, t.code)) {
          result.skipped++;
          continue;
        }
        const id = uid("tsk_");
        sort++;
        if (t.done) {
          // Finished: released, in the sprint and release it shipped in, on the timeline from start to finish.
          const sp = sprintOf(t.done);
          const s = sp ? sprintIds.get(sp.name) : undefined;
          const rel = t.release ? releaseIds.get(t.release) : undefined; // built work not yet released has none
          const ms = dated.find((m) => m.due! >= t.done!) ?? dated[dated.length - 1] ?? null;
          const completed = rel && rel.created.slice(0, 10) === t.done ? at(t.done, 14) : at(t.done, 15);
          await run(
            `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, status_category, priority, assignee_id, reporter_id, reviewer_id,
               progress, start_date, due_date, labels, sort, created_at, updated_at, completed_at, sprint_id, sprint_added_at, release_id, points, fields, checklist)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'done', 'normal', ?, ?, ?, 100, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?)`,
            id, dept, project.id, ms?.id ?? null, t.code, t.title, t.description || null, typeOf(t.type), doneSt.key, who.id, who.id, who.id,
            t.start, t.done, sort, at(t.start!, 6), completed, completed, s?.id ?? null, s ? at(s.start, 6) : null, rel?.id ?? null, t.points,
            JSON.stringify(["Tests added or updated", "Docs updated"].map((text) => ({ id: uid("chk_"), text, verify: false, done: true, doneBy: who.id, verifiedBy: null }))),
          );
        } else {
          const s = t.sprint ? sprintIds.get(t.sprint) : undefined;
          const ms = t.milestone ? milestoneIds.get(t.milestone) : undefined;
          const now = nowIso();
          const status = t.status === "backlog" ? backlogSt : todoSt;
          const plan = t.sprint ? h.sprints.find((x) => x.name === t.sprint) : undefined;
          const type = typeOf(t.type);
          const checks = ["feature", "bug", "improvement"].includes(type) ? ["Tests added or updated", "Docs updated"].map((text) => ({ id: uid("chk_"), text, verify: false, done: false, doneBy: null, verifiedBy: null })) : [];
          await run(
            `INSERT INTO dept_tasks (id, dept, project_id, milestone_id, code, title, description, type, status, status_category, priority, assignee_id, reporter_id,
               progress, start_date, due_date, labels, sort, created_at, updated_at, sprint_id, sprint_added_at, points, fields, checklist)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, ?)`,
            id, dept, project.id, ms?.id ?? null, t.code, t.title, t.description || null, type, status.key, status.category, prioOf(t.priority),
            t.status === "todo" || t.sprint ? who.id : null, who.id, t.start ?? plan?.start ?? null, t.due ?? plan?.end ?? null, sort, now, now,
            s?.id ?? null, s ? (s.start < now.slice(0, 10) ? now : at(s.start, 6)) : null, t.points, JSON.stringify(t.acceptance ? { acceptance: t.acceptance } : {}), JSON.stringify(checks),
          );
        }
        result.tasks++;
      }
      // Task codes made in the app continue after the recorded ones.
      await run("UPDATE dept_projects SET next_number = GREATEST(next_number, ?) WHERE id = ?", highest + 1, project.id);
    }

    // Sub-projects: each part goes into its main project once. Someone who later moves it out keeps it out.
    for (const p of h.projects) {
      if (!p.parent) continue;
      const flag = `dev_history_parent:${dept}:${p.key}`;
      if (await get("SELECT 1 AS x FROM settings WHERE key = ?", flag)) continue;
      const parent = await get<{ id: string }>("SELECT id FROM dept_projects WHERE dept = ? AND key = ? AND parent_id IS NULL", dept, p.parent);
      const child = await get<{ id: string }>("SELECT id FROM dept_projects WHERE dept = ? AND key = ? AND parent_id IS NULL", dept, p.key);
      if (parent && child && parent.id !== child.id && !(await get("SELECT 1 AS x FROM dept_projects WHERE parent_id = ?", child.id))) {
        await run("UPDATE dept_projects SET parent_id = ? WHERE id = ?", parent.id, child.id);
        result.nested = (result.nested ?? 0) + 1;
      }
      await run("INSERT INTO settings (key, value, updated_at) VALUES (?, 'true', ?) ON CONFLICT (key) DO NOTHING", flag, nowIso());
    }
    // Each release's task count, and each closed sprint's planned and finished points with its review.
    for (const r of releaseIds.values()) await run("UPDATE dept_releases SET task_count = (SELECT COUNT(*) FROM dept_tasks WHERE release_id = ?) WHERE id = ?", r.id, r.id);
    for (const s of h.sprints) {
      const ref = sprintIds.get(s.name);
      if (!ref || s.status !== "closed") continue;
      const pts = Number((await get<{ n: number }>("SELECT COALESCE(SUM(points), 0) AS n FROM dept_tasks WHERE sprint_id = ?", ref.id))?.n ?? 0);
      await run(
        "UPDATE dept_sprints SET status = 'closed', closed_at = COALESCE(closed_at, ?), planned_units = COALESCE(planned_units, ?), done_units = COALESCE(done_units, ?), review_note = COALESCE(review_note, ?) WHERE id = ? AND (status <> 'closed' OR done_units IS NULL)",
        at(s.end, 16), pts, pts, s.review ?? null, ref.id,
      );
    }
    await run("INSERT INTO settings (key, value, updated_at) VALUES ('dev_history_hash', ?, ?) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at", JSON.stringify(hash), nowIso());
  });
  if (result.projects || result.tasks || result.releases || result.sprints || result.nested)
    await audit({ actor: null, source: "system" }, { action: `${dept}.history`, summary: `Dev team record: ${result.projects} projects, ${result.sprints} sprints, ${result.releases} releases and ${result.tasks} tasks added, assigned to ${who.name}` });
  return { ...result, applied: true };
}
