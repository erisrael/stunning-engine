// Owners: company-wide numbers from every department, and the periodic reports department heads and leads write.

import { all, get, nowIso, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify, usersWithRole } from "./notifications";
import { positionsOf } from "./departments";
import { can, type AppUser } from "./users";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, DEPARTMENTS, STAGES, type Department } from "@/lib/domain";

const n = (v: unknown) => Number(v ?? 0);

export async function ownerStats() {
  const today = nowIso().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;
  const p = await get<Record<string, number>>(
    `SELECT COUNT(*) AS items,
       SUM(CASE WHEN lifecycle = 'published' THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN lifecycle = 'in_production' THEN 1 ELSE 0 END) AS in_production,
       SUM(CASE WHEN lifecycle = 'draft' THEN 1 ELSE 0 END) AS draft,
       SUM(CASE WHEN lifecycle = 'published' AND published_at >= ? THEN 1 ELSE 0 END) AS published_month,
       SUM(CASE WHEN lifecycle IN ('draft','in_production') AND current_due_at < ? THEN 1 ELSE 0 END) AS overdue
     FROM items WHERE lifecycle <> 'cancelled'`,
    monthStart,
    nowIso(),
  );
  const byStage = await all<{ stage: string; c: number }>("SELECT stage, COUNT(*) AS c FROM items WHERE lifecycle = 'in_production' GROUP BY stage");
  const weeks = await all<{ wk: string; c: number }>(
    "SELECT substr(published_at, 1, 10) AS wk, COUNT(*) AS c FROM items WHERE lifecycle = 'published' AND published_at >= ? GROUP BY substr(published_at, 1, 10)",
    new Date(Date.now() - 56 * 864e5).toISOString(),
  );
  // Published per week for the last 8 weeks (Monday-based).
  const weekly = Array.from({ length: 8 }, (_, i) => {
    const end = new Date(Date.now() - (7 - i) * 7 * 864e5);
    const start = new Date(end.getTime() - 7 * 864e5);
    return { week: end.toISOString().slice(0, 10), published: weeks.filter((w) => w.wk > start.toISOString().slice(0, 10) && w.wk <= end.toISOString().slice(0, 10)).reduce((s, w) => s + n(w.c), 0) };
  });
  const grades = await all<{ grade: string; total: number; done: number }>(
    `SELECT g.name AS grade, COUNT(l.id) AS total,
       SUM(CASE WHEN EXISTS (SELECT 1 FROM items i WHERE i.lesson_id = l.id AND i.lifecycle = 'published') THEN 1 ELSE 0 END) AS done
     FROM lessons l JOIN units u ON u.id = l.unit_id JOIN grades g ON g.id = u.grade_id GROUP BY g.name, g.sort ORDER BY g.sort`,
  );
  const studio = await all<{ type: string; status: string; c: number }>("SELECT type, status, COUNT(*) AS c FROM studio_resources GROUP BY type, status");
  const questions = await get<{ total: number; approved: number }>("SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved FROM studio_questions");
  const cards = await get<{ c: number }>("SELECT COUNT(*) AS c FROM studio_cards c JOIN studio_resources r ON r.id = c.resource_id WHERE r.status = 'published'");
  const work = await all<{ dept: string; total: number; done: number; open: number; overdue: number }>(
    `SELECT dept, COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN status IN ('backlog','todo','in_progress','review') THEN 1 ELSE 0 END) AS open,
       SUM(CASE WHEN status IN ('backlog','todo','in_progress','review') AND due_date < ? THEN 1 ELSE 0 END) AS overdue
     FROM dept_tasks WHERE status <> 'cancelled' GROUP BY dept`,
    today,
  );
  const projects = await all<{ dept: string; name: string; key: string; status: string; due_date: string | null; total: number; done: number }>(
    `SELECT p.dept, p.name, p.key, p.status, p.due_date,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status <> 'cancelled') AS total,
       (SELECT COUNT(*) FROM dept_tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done
     FROM dept_projects p WHERE p.archived = 0 AND p.status IN ('planning','active','on_hold') ORDER BY p.dept, p.due_date`,
  );
  const kpis = await all<{ metric: string; total: number }>(
    "SELECT m.metric, SUM(m.value) AS total FROM dept_metrics m JOIN dept_projects p ON p.id = m.project_id WHERE p.dept = 'marketing' AND m.recorded_on >= ? GROUP BY m.metric",
    monthStart,
  );
  const people = [];
  for (const d of DEPARTMENTS) {
    const roles = DEPARTMENT_ROLES[d];
    const c = await get<{ c: number }>(
      `SELECT COUNT(DISTINCT r.user_id) AS c FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE u.active = 1 AND r.role IN (${roles.map(() => "?").join(",")})`,
      ...roles,
    );
    people.push({ dept: d, label: DEPARTMENT_LABELS[d], count: n(c?.c) });
  }
  const activeUsers = await get<{ total: number; recent: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN last_login_at >= ? THEN 1 ELSE 0 END) AS recent FROM users WHERE active = 1",
    new Date(Date.now() - 7 * 864e5).toISOString(),
  );
  const count = (type: string, status?: string) => studio.filter((s) => s.type === type && (!status || s.status === status)).reduce((a, s) => a + n(s.c), 0);
  return {
    production: {
      items: n(p?.items),
      published: n(p?.published),
      inProduction: n(p?.in_production),
      draft: n(p?.draft),
      publishedThisMonth: n(p?.published_month),
      overdue: n(p?.overdue),
      byStage: STAGES.map((s) => ({ stage: s, count: n(byStage.find((x) => x.stage === s)?.c) })),
      weekly,
      grades: grades.map((g) => ({ grade: g.grade, total: n(g.total), done: n(g.done) })),
    },
    products: {
      videos: n(p?.published),
      notes: count("note", "published"),
      exams: count("exam", "published"),
      decks: count("flashcards", "published"),
      cards: n(cards?.c),
      questions: n(questions?.approved),
      inReview: studio.filter((s) => s.status === "review").reduce((a, s) => a + n(s.c), 0),
      drafts: studio.filter((s) => s.status === "draft").reduce((a, s) => a + n(s.c), 0),
    },
    work: ["dev", "marketing"].map((d) => {
      const w = work.find((x) => x.dept === d);
      return { dept: d, total: n(w?.total), done: n(w?.done), open: n(w?.open), overdue: n(w?.overdue) };
    }),
    projects: projects.map((x) => ({ ...x, total: n(x.total), done: n(x.done) })),
    kpis: kpis.map((k) => ({ metric: k.metric, total: n(k.total) })),
    people,
    users: { total: n(activeUsers?.total), activeWeek: n(activeUsers?.recent) },
  };
}
export type OwnerStats = Awaited<ReturnType<typeof ownerStats>>;

// ---------------------------------------------------------------------------
// Department reports
// ---------------------------------------------------------------------------

export type DeptReport = {
  id: string;
  department: Department;
  period_start: string;
  period_end: string;
  title: string;
  summary: string;
  highlights: string | null;
  risks: string | null;
  next_steps: string | null;
  status: "draft" | "submitted";
  author_id: string | null;
  author_name: string | null;
  submitted_at: string | null;
  updated_at: string;
};

// Which departments a person writes reports for: where they are head or lead (Admin: all).
export async function reportDepartments(user: AppUser): Promise<Department[]> {
  if (can(user, "users.manage")) return [...DEPARTMENTS];
  const pos = await positionsOf(user.id);
  const out = DEPARTMENTS.filter((d) => pos[d] === "head" || pos[d] === "lead");
  // Production managers report for production.
  if (user.roles.includes("manager") && !out.includes("production")) out.unshift("production");
  return out;
}

export async function listReports(user: AppUser, f: { department?: string | null; status?: string | null; q?: string | null }) {
  const mine = await reportDepartments(user);
  const all_ = can(user, "owners.view") || can(user, "users.manage");
  if (!all_ && !mine.length) throw new WorkflowError("FORBIDDEN", "Department reports are for owners and department heads and leads.");
  const where: string[] = [];
  const params: string[] = [];
  if (!all_) {
    where.push(`(r.department IN (${mine.map(() => "?").join(",")}))`);
    params.push(...mine);
  } else {
    // Owners see submitted reports; drafts stay with their authors.
    where.push("(r.status = 'submitted' OR r.author_id = ?)");
    params.push(user.id);
  }
  if (f.department) {
    where.push("r.department = ?");
    params.push(f.department);
  }
  if (f.status) {
    where.push("r.status = ?");
    params.push(f.status);
  }
  if (f.q?.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(lower(r.title) LIKE ? OR lower(r.summary) LIKE ? OR lower(COALESCE(r.highlights, '')) LIKE ? OR lower(COALESCE(r.risks, '')) LIKE ?)");
    params.push(like, like, like, like);
  }
  return all<DeptReport>(
    `SELECT r.*, u.name AS author_name FROM dept_reports r LEFT JOIN users u ON u.id = r.author_id ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY r.period_end DESC, r.updated_at DESC LIMIT 500`,
    ...params,
  );
}

export type ReportInput = { id?: string; department: Department; periodStart: string; periodEnd: string; title: string; summary: string; highlights?: string; risks?: string; nextSteps?: string; submit?: boolean };

export async function saveReport(user: AppUser, input: ReportInput) {
  const mine = await reportDepartments(user);
  if (!mine.includes(input.department)) throw new WorkflowError("FORBIDDEN", `You do not write reports for ${DEPARTMENT_LABELS[input.department] ?? input.department}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodStart) || !/^\d{4}-\d{2}-\d{2}$/.test(input.periodEnd) || input.periodStart > input.periodEnd) throw new WorkflowError("VALIDATION", "Choose the period (start before end).");
  if (!input.title.trim() || !input.summary.trim()) throw new WorkflowError("VALIDATION", "A report needs a title and a summary.");
  const now = nowIso();
  let id = input.id;
  if (id) {
    const old = await get<{ author_id: string | null; status: string }>("SELECT author_id, status FROM dept_reports WHERE id = ?", id);
    if (!old) throw new WorkflowError("NOT_FOUND", "Report not found.");
    if (old.author_id !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the author edits a report.");
    await run(
      "UPDATE dept_reports SET department = ?, period_start = ?, period_end = ?, title = ?, summary = ?, highlights = ?, risks = ?, next_steps = ?, updated_at = ? WHERE id = ?",
      input.department,
      input.periodStart,
      input.periodEnd,
      input.title.trim(),
      input.summary.trim(),
      input.highlights?.trim() || null,
      input.risks?.trim() || null,
      input.nextSteps?.trim() || null,
      now,
      id,
    );
  } else {
    id = uid("rpt_");
    await run(
      "INSERT INTO dept_reports (id, department, period_start, period_end, title, summary, highlights, risks, next_steps, status, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)",
      id,
      input.department,
      input.periodStart,
      input.periodEnd,
      input.title.trim(),
      input.summary.trim(),
      input.highlights?.trim() || null,
      input.risks?.trim() || null,
      input.nextSteps?.trim() || null,
      user.id,
      now,
      now,
    );
  }
  if (input.submit) {
    await run("UPDATE dept_reports SET status = 'submitted', submitted_at = COALESCE(submitted_at, ?) WHERE id = ?", now, id);
    await audit({ actor: user }, { action: "report.submitted", summary: `${user.name} submitted the ${DEPARTMENT_LABELS[input.department]} report "${input.title.trim()}"` });
    await notify(await usersWithRole("owner"), { type: "discussion", title: `${DEPARTMENT_LABELS[input.department]} report: ${input.title.trim()}`, body: input.summary.slice(0, 160), link: `/owners?tab=reports&open=${id}`, dedupeKey: `report:${id}` }, now, user.id);
  }
  return id;
}

export async function deleteReport(user: AppUser, id: string) {
  const r = await get<{ author_id: string | null; status: string }>("SELECT author_id, status FROM dept_reports WHERE id = ?", id);
  if (!r) return;
  if (!can(user, "users.manage") && !(r.author_id === user.id && r.status === "draft")) throw new WorkflowError("FORBIDDEN", "Only the author deletes a draft report.");
  await run("DELETE FROM dept_reports WHERE id = ?", id);
}

// What a department did in a period, to start a report from.
export async function reportFacts(user: AppUser, department: Department, from: string, to: string) {
  const mine = await reportDepartments(user);
  if (!mine.includes(department)) throw new WorkflowError("FORBIDDEN", "Not your department.");
  const end = `${to}T23:59:59.999Z`;
  if (department === "production") {
    const r = await get<{ published: number; recorded: number; edited: number; uploaded: number }>(
      `SELECT SUM(CASE WHEN published_at >= ? AND published_at <= ? THEN 1 ELSE 0 END) AS published,
         SUM(CASE WHEN recorded_at >= ? AND recorded_at <= ? THEN 1 ELSE 0 END) AS recorded,
         SUM(CASE WHEN edited_at >= ? AND edited_at <= ? THEN 1 ELSE 0 END) AS edited,
         SUM(CASE WHEN uploaded_at >= ? AND uploaded_at <= ? THEN 1 ELSE 0 END) AS uploaded FROM items`,
      from, end, from, end, from, end, from, end,
    );
    return `Recorded ${n(r?.recorded)}, edited ${n(r?.edited)}, uploaded ${n(r?.uploaded)}, published ${n(r?.published)}.`;
  }
  if (department === "studio") {
    const r = await all<{ type: string; c: number }>("SELECT type, COUNT(*) AS c FROM studio_resources WHERE published_at >= ? AND published_at <= ? GROUP BY type", from, end);
    const q = await get<{ c: number }>("SELECT COUNT(*) AS c FROM studio_questions WHERE created_at >= ? AND created_at <= ?", from, end);
    const by = (t: string) => n(r.find((x) => x.type === t)?.c);
    return `Published ${by("note")} notes, ${by("exam")} exams and ${by("flashcards")} flash card decks; ${n(q?.c)} new questions in the bank.`;
  }
  const t = await get<{ done: number; created: number; overdue: number }>(
    `SELECT SUM(CASE WHEN completed_at >= ? AND completed_at <= ? THEN 1 ELSE 0 END) AS done,
       SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 ELSE 0 END) AS created,
       SUM(CASE WHEN status IN ('backlog','todo','in_progress','review') AND due_date < ? THEN 1 ELSE 0 END) AS overdue FROM dept_tasks WHERE dept = ?`,
    from, end, from, end, to, department,
  );
  return `${n(t?.done)} tasks done, ${n(t?.created)} new tasks, ${n(t?.overdue)} overdue at the end of the period.`;
}

export async function canSeeReports(user: AppUser) {
  return can(user, "owners.view") || can(user, "users.manage") || (await reportDepartments(user)).length > 0;
}


