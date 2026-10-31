// HR performance, training, confidential cases and reports.
// Goals and one-to-ones are shared between the person and their line manager; reviews run in cycles (self review,
// then the line manager, with the person's production and department work attached as evidence); courses track
// completion and renewal; cases are visible to hr.cases only. Reports summarise headcount, movement, leave and training.

import { all, get, nowIso, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, listUsers, type AppUser } from "./users";
import { myEmployeeId } from "./hr";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { CASE_KINDS, CASE_STATUSES, GOAL_STATUSES, type CaseKind, type CaseStatus, type GoalStatus, type ReviewStatus } from "@/lib/hr-growth";

const clean = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const DAY = 864e5;
const n = (v: unknown) => Number(v ?? 0);

function needHr(u: AppUser) {
  if (!can(u, "hr.access")) throw new WorkflowError("FORBIDDEN", "Only HR can do this.");
}

// HR, the person, or their line manager (directly or above).
async function relation(user: AppUser, employeeId: string): Promise<"hr" | "self" | "manager" | null> {
  if (can(user, "hr.access")) return "hr";
  const me = await myEmployeeId(user);
  if (!me) return null;
  if (me === employeeId) return "self";
  const up = await all<{ id: string }>(
    "WITH RECURSIVE t(id) AS (SELECT manager_id FROM employees WHERE id = ? UNION SELECT e.manager_id FROM employees e JOIN t ON e.id = t.id WHERE e.manager_id IS NOT NULL) SELECT id FROM t WHERE id IS NOT NULL",
    employeeId,
  );
  return up.some((x) => x.id === me) ? "manager" : null;
}

async function needRelation(user: AppUser, employeeId: string, allow: ("hr" | "self" | "manager")[]) {
  const r = await relation(user, employeeId);
  if (!r || !allow.includes(r)) throw new WorkflowError("FORBIDDEN", "You cannot change this.");
  return r;
}

async function employeeUser(employeeId: string) {
  return get<{ user_id: string | null; full_name: string; manager_user: string | null }>(
    "SELECT e.user_id, e.full_name, m.user_id AS manager_user FROM employees e LEFT JOIN employees m ON m.id = e.manager_id WHERE e.id = ?",
    employeeId,
  );
}

// ---------------------------------------------------------------------------
// Goals and one-to-ones
// ---------------------------------------------------------------------------

export type Goal = { id: string; title: string; detail: string | null; dueDate: string | null; progress: number; status: GoalStatus; createdAt: string };
export type OneOnOne = { id: string; heldOn: string; managerName: string; notes: string | null; actions: string | null };

export async function growthFor(user: AppUser, employeeId: string) {
  const rel = await relation(user, employeeId);
  if (!rel) return null;
  const goals = await all<{ id: string; title: string; detail: string | null; due_date: string | null; progress: number; status: GoalStatus; created_at: string }>(
    "SELECT * FROM hr_goals WHERE employee_id = ? ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END, due_date NULLS LAST, created_at",
    employeeId,
  );
  const meetings = await all<{ id: string; held_on: string; name: string | null; notes: string | null; actions: string | null }>(
    "SELECT o.id, o.held_on, u.name, o.notes, o.actions FROM one_on_ones o LEFT JOIN users u ON u.id = o.manager_user_id WHERE o.employee_id = ? ORDER BY o.held_on DESC LIMIT 50",
    employeeId,
  );
  const reviews = await all<{
    id: string;
    name: string;
    period_start: string;
    period_end: string;
    status: ReviewStatus;
    self_rating: number | null;
    self_notes: string | null;
    lead_rating: number | null;
    lead_notes: string | null;
    evidence: string;
    reviewer_user_id: string | null;
    self_due: string | null;
    lead_due: string | null;
  }>(
    "SELECT r.*, c.name, c.period_start, c.period_end, c.self_due, c.lead_due FROM hr_reviews r JOIN review_cycles c ON c.id = r.cycle_id WHERE r.employee_id = ? ORDER BY c.period_end DESC",
    employeeId,
  );
  const trainings = await all<{ id: string; title: string; status: string; due_date: string | null; completed_on: string | null; expires_on: string | null; mandatory: number }>(
    "SELECT t.id, c.title, t.status, t.due_date, t.completed_on, t.expires_on, c.mandatory FROM trainings t JOIN courses c ON c.id = t.course_id WHERE t.employee_id = ? ORDER BY t.status, t.due_date NULLS LAST",
    employeeId,
  );
  return {
    relation: rel,
    goals: goals.map((g) => ({ id: g.id, title: g.title, detail: g.detail, dueDate: g.due_date, progress: n(g.progress), status: g.status, createdAt: g.created_at })),
    meetings: meetings.map((m) => ({ id: m.id, heldOn: m.held_on, managerName: m.name ?? "Unknown", notes: m.notes, actions: m.actions })),
    reviews: reviews.map((r) => ({
      id: r.id,
      cycle: r.name,
      period: `${r.period_start} to ${r.period_end}`,
      status: r.status,
      selfRating: r.self_rating,
      selfNotes: r.self_notes,
      // The person sees the manager's part once the review is done.
      leadRating: rel !== "self" || r.status === "done" ? r.lead_rating : null,
      leadNotes: rel !== "self" || r.status === "done" ? r.lead_notes : null,
      evidence: JSON.parse(r.evidence || "{}") as Evidence,
      canSelf: rel === "self" && r.status === "self",
      canLead: r.status === "lead" && (r.reviewer_user_id === user.id || rel === "hr"),
      selfDue: r.self_due,
      leadDue: r.lead_due,
    })),
    trainings: trainings.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.due_date, completedOn: t.completed_on, expiresOn: t.expires_on, mandatory: !!t.mandatory })),
  };
}

export async function saveGoal(user: AppUser, input: { id?: string | null; employeeId: string; title: string; detail?: string | null; dueDate?: string | null; progress?: number; status?: string }) {
  await needRelation(user, input.employeeId, ["hr", "self", "manager"]);
  const title = clean(input.title, 160);
  if (!title) throw new WorkflowError("VALIDATION", "Write the goal.");
  const progress = Math.max(0, Math.min(100, Math.round(Number(input.progress ?? 0))));
  const status = GOAL_STATUSES.includes(input.status as GoalStatus) ? (input.status as GoalStatus) : progress >= 100 ? "done" : "open";
  const now = nowIso();
  if (input.id) {
    await run(
      "UPDATE hr_goals SET title = ?, detail = ?, due_date = ?, progress = ?, status = ?, updated_at = ? WHERE id = ? AND employee_id = ?",
      title,
      clean(input.detail, 2000),
      isDay(input.dueDate) ? input.dueDate : null,
      progress,
      status,
      now,
      input.id,
      input.employeeId,
    );
    return input.id;
  }
  const id = uid("goal_");
  await run(
    "INSERT INTO hr_goals (id, employee_id, title, detail, due_date, progress, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    input.employeeId,
    title,
    clean(input.detail, 2000),
    isDay(input.dueDate) ? input.dueDate : null,
    progress,
    status,
    user.id,
    now,
    now,
  );
  return id;
}

export async function addOneOnOne(user: AppUser, input: { employeeId: string; heldOn: string; notes?: string | null; actions?: string | null }) {
  await needRelation(user, input.employeeId, ["hr", "manager"]);
  if (!isDay(input.heldOn)) throw new WorkflowError("VALIDATION", "Choose the date of the meeting.");
  if (!clean(input.notes) && !clean(input.actions)) throw new WorkflowError("VALIDATION", "Write what you discussed or agreed.");
  await run(
    "INSERT INTO one_on_ones (id, employee_id, manager_user_id, held_on, notes, actions, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    uid("oo_"),
    input.employeeId,
    user.id,
    input.heldOn,
    clean(input.notes, 4000),
    clean(input.actions, 2000),
    nowIso(),
  );
  const e = await employeeUser(input.employeeId);
  if (e?.user_id) await notify([e.user_id], { type: "hr", title: "One-to-one notes added", body: `From ${user.name}, ${input.heldOn}.`, link: "/profile?tab=record" }, nowIso(), user.id);
}

// ---------------------------------------------------------------------------
// Review cycles
// ---------------------------------------------------------------------------

export type Evidence = {
  stageWork?: { stage: string; count: number }[];
  workHours?: number;
  deptTasksDone?: number;
  deptHours?: number;
  goalsDone?: number;
  goalsOpen?: number;
  leaveDays?: number;
  // From Attendance, for the period.
  absentDays?: number;
  lateDays?: number;
  lateMin?: number;
};

// What the person did in the period, attached when the review opens and refreshed when the manager reviews.
async function evidenceFor(employeeId: string, from: string, to: string): Promise<Evidence> {
  const e = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", employeeId);
  const goals = await all<{ status: string; c: number }>("SELECT status, COUNT(*) AS c FROM hr_goals WHERE employee_id = ? GROUP BY status", employeeId);
  const leave = await get<{ d: number }>("SELECT SUM(days) AS d FROM leave_requests WHERE employee_id = ? AND status = 'approved' AND start_date >= ? AND start_date <= ?", employeeId, from, to);
  const att = await (await import("./attendance")).attendanceTotals(employeeId, from, to);
  const out: Evidence = {
    goalsDone: n(goals.find((g) => g.status === "done")?.c),
    goalsOpen: n(goals.find((g) => g.status === "open")?.c),
    leaveDays: n(leave?.d),
    ...(att ? { absentDays: att.absent, lateDays: att.late, lateMin: att.lateMin } : {}),
  };
  if (!e?.user_id) return out;
  const end = `${to}T23:59:59Z`;
  const stage = await all<{ stage: Stage; c: number }>(
    "SELECT stage, COUNT(*) AS c FROM stage_attempts WHERE owner_id = ? AND completed_at IS NOT NULL AND completed_at >= ? AND completed_at <= ? GROUP BY stage",
    e.user_id,
    from,
    end,
  );
  const hours = await get<{ m: number }>(
    "SELECT SUM(EXTRACT(EPOCH FROM (ended_at::timestamptz - started_at::timestamptz)) / 60) AS m FROM work_sessions WHERE user_id = ? AND ended_at IS NOT NULL AND started_at >= ? AND started_at <= ?",
    e.user_id,
    from,
    end,
  );
  const tasks = await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_tasks WHERE assignee_id = ? AND status_category = 'done' AND completed_at >= ? AND completed_at <= ?", e.user_id, from, end);
  const deptMin = await get<{ m: number }>("SELECT SUM(minutes) AS m FROM dept_time_entries WHERE user_id = ? AND started_at >= ? AND started_at <= ?", e.user_id, from, end);
  return {
    ...out,
    stageWork: stage.map((s) => ({ stage: STAGE_LABELS[s.stage] ?? s.stage, count: n(s.c) })),
    workHours: Math.round(n(hours?.m) / 6) / 10,
    deptTasksDone: n(tasks?.c),
    deptHours: Math.round(n(deptMin?.m) / 6) / 10,
  };
}

export async function listCycles(user: AppUser) {
  needHr(user);
  const cycles = await all<{ id: string; name: string; period_start: string; period_end: string; self_due: string | null; lead_due: string | null; status: string; created_at: string }>(
    "SELECT * FROM review_cycles ORDER BY period_end DESC",
  );
  const counts = await all<{ cycle_id: string; status: ReviewStatus; c: number }>("SELECT cycle_id, status, COUNT(*) AS c FROM hr_reviews GROUP BY cycle_id, status");
  return cycles.map((c) => ({
    id: c.id,
    name: c.name,
    periodStart: c.period_start,
    periodEnd: c.period_end,
    selfDue: c.self_due,
    leadDue: c.lead_due,
    status: c.status,
    counts: { self: n(counts.find((x) => x.cycle_id === c.id && x.status === "self")?.c), lead: n(counts.find((x) => x.cycle_id === c.id && x.status === "lead")?.c), done: n(counts.find((x) => x.cycle_id === c.id && x.status === "done")?.c) },
  }));
}

// Opens a cycle for every current employee (or one department); each person is asked for their self review.
export async function startCycle(user: AppUser, input: { name: string; periodStart: string; periodEnd: string; selfDue?: string | null; leadDue?: string | null; department?: string | null }) {
  if (!can(user, "hr.manage")) throw new WorkflowError("FORBIDDEN", "Only the HR Manager starts review cycles.");
  const name = clean(input.name, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Name the cycle, for example 2026 mid-year.");
  if (!isDay(input.periodStart) || !isDay(input.periodEnd) || input.periodEnd < input.periodStart) throw new WorkflowError("VALIDATION", "Choose the period the review covers.");
  const id = uid("cyc_");
  await run(
    "INSERT INTO review_cycles (id, name, period_start, period_end, self_due, lead_due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    name,
    input.periodStart,
    input.periodEnd,
    isDay(input.selfDue) ? input.selfDue : null,
    isDay(input.leadDue) ? input.leadDue : null,
    user.id,
    nowIso(),
  );
  const people = await all<{ id: string; user_id: string | null; manager_user: string | null }>(
    `SELECT e.id, e.user_id, m.user_id AS manager_user FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
     WHERE e.status <> 'left' ${input.department ? "AND e.department = ?" : ""}`,
    ...(input.department ? [input.department] : []),
  );
  for (const p of people) {
    await run(
      "INSERT INTO hr_reviews (id, cycle_id, employee_id, reviewer_user_id, status, evidence) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (cycle_id, employee_id) DO NOTHING",
      uid("rev_"),
      id,
      p.id,
      p.manager_user,
      p.user_id ? "self" : "lead",
      JSON.stringify(await evidenceFor(p.id, input.periodStart, input.periodEnd)),
    );
  }
  await notify(
    people.map((p) => p.user_id),
    { type: "hr", title: `Review: ${name}`, body: `Write your self review in My record${input.selfDue ? ` by ${input.selfDue}` : ""}.`, link: "/profile?tab=record", dedupeKey: `cycle:${id}` },
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "hr.performance", summary: `${user.name} started the review cycle ${name} for ${people.length} people` });
  return { id, count: people.length };
}

export async function submitReview(user: AppUser, reviewId: string, input: { part: "self" | "lead"; rating: number; notes: string }) {
  const r = await get<{ employee_id: string; status: ReviewStatus; reviewer_user_id: string | null; cycle_id: string }>("SELECT employee_id, status, reviewer_user_id, cycle_id FROM hr_reviews WHERE id = ?", reviewId);
  if (!r) throw new WorkflowError("NOT_FOUND", "This review no longer exists.");
  const rating = Math.trunc(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new WorkflowError("VALIDATION", "Choose a rating from 1 to 5.");
  if (!clean(input.notes)) throw new WorkflowError("VALIDATION", "Write a few lines to go with the rating.");
  const rel = await relation(user, r.employee_id);
  const now = nowIso();
  const e = await employeeUser(r.employee_id);
  if (input.part === "self") {
    if (rel !== "self" || r.status !== "self") throw new WorkflowError("FORBIDDEN", "Only the person writes their self review, while it is open.");
    await run("UPDATE hr_reviews SET self_rating = ?, self_notes = ?, self_at = ?, status = 'lead' WHERE id = ?", rating, clean(input.notes, 6000), now, reviewId);
    const to = r.reviewer_user_id ? [r.reviewer_user_id] : (await listUsers()).filter((u) => u.perms.includes("hr.access")).map((u) => u.id);
    await notify(to, { type: "approval", title: `Review to write: ${e?.full_name}`, body: "Their self review is in.", link: `/hr/people/${r.employee_id}`, dedupeKey: `review:${reviewId}:lead` }, now, user.id);
    return;
  }
  if (r.status !== "lead" || !(r.reviewer_user_id === user.id || rel === "hr")) throw new WorkflowError("FORBIDDEN", "The line manager writes this review after the self review.");
  const c = await get<{ period_start: string; period_end: string }>("SELECT period_start, period_end FROM review_cycles WHERE id = ?", r.cycle_id);
  await run(
    "UPDATE hr_reviews SET lead_rating = ?, lead_notes = ?, lead_at = ?, status = 'done', evidence = ? WHERE id = ?",
    rating,
    clean(input.notes, 6000),
    now,
    JSON.stringify(await evidenceFor(r.employee_id, c!.period_start, c!.period_end)),
    reviewId,
  );
  if (e?.user_id) await notify([e.user_id], { type: "hr", title: "Your review is complete", body: "Read it in My record.", link: "/profile?tab=record" }, now, user.id);
  await audit({ actor: user }, { itemId: r.employee_id, action: "hr.performance", summary: `${user.name} completed ${e?.full_name}'s review` });
}

// Reviews a line manager still has to write (for My record).
export async function reviewsToWrite(user: AppUser) {
  return all<{ id: string; employee_id: string; full_name: string; name: string; lead_due: string | null }>(
    "SELECT r.id, r.employee_id, e.full_name, c.name, c.lead_due FROM hr_reviews r JOIN employees e ON e.id = r.employee_id JOIN review_cycles c ON c.id = r.cycle_id WHERE r.status = 'lead' AND r.reviewer_user_id = ? ORDER BY c.lead_due NULLS LAST",
    user.id,
  );
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

export type Course = { id: string; title: string; provider: string | null; description: string | null; renewMonths: number | null; mandatory: boolean; active: boolean; assigned: number; done: number };

export async function listCourses(user: AppUser): Promise<Course[]> {
  needHr(user);
  const rows = await all<{ id: string; title: string; provider: string | null; description: string | null; renew_months: number | null; mandatory: number; active: number; assigned: number; done: number }>(
    `SELECT c.*, (SELECT COUNT(*) FROM trainings t WHERE t.course_id = c.id) AS assigned, (SELECT COUNT(*) FROM trainings t WHERE t.course_id = c.id AND t.status = 'done') AS done
     FROM courses c ORDER BY c.active DESC, c.title`,
  );
  return rows.map((r) => ({ id: r.id, title: r.title, provider: r.provider, description: r.description, renewMonths: r.renew_months === null ? null : n(r.renew_months), mandatory: !!r.mandatory, active: !!r.active, assigned: n(r.assigned), done: n(r.done) }));
}

export async function saveCourse(user: AppUser, input: { id?: string | null; title: string; provider?: string | null; description?: string | null; renewMonths?: number | null; mandatory?: boolean; active?: boolean }) {
  needHr(user);
  const title = clean(input.title, 120);
  if (!title) throw new WorkflowError("VALIDATION", "Name the course.");
  const renew = input.renewMonths ? Math.max(1, Math.min(120, Math.trunc(Number(input.renewMonths)))) : null;
  if (input.id) {
    await run("UPDATE courses SET title = ?, provider = ?, description = ?, renew_months = ?, mandatory = ?, active = ? WHERE id = ?", title, clean(input.provider, 120), clean(input.description, 2000), renew, input.mandatory ? 1 : 0, input.active === false ? 0 : 1, input.id);
    return input.id;
  }
  const id = uid("crs_");
  await run("INSERT INTO courses (id, title, provider, description, renew_months, mandatory, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", id, title, clean(input.provider, 120), clean(input.description, 2000), renew, input.mandatory ? 1 : 0, nowIso());
  return id;
}

export async function assignCourse(user: AppUser, courseId: string, input: { employeeIds: string[]; dueDate?: string | null }) {
  needHr(user);
  const c = await get<{ title: string }>("SELECT title FROM courses WHERE id = ?", courseId);
  if (!c) throw new WorkflowError("NOT_FOUND", "This course no longer exists.");
  let added = 0;
  const now = nowIso();
  for (const eid of [...new Set(input.employeeIds)]) {
    if (await get("SELECT 1 AS x FROM trainings WHERE course_id = ? AND employee_id = ? AND status = 'assigned'", courseId, eid)) continue;
    await run("INSERT INTO trainings (id, course_id, employee_id, due_date, assigned_by, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("trn_"), courseId, eid, isDay(input.dueDate) ? input.dueDate : null, user.id, now);
    const e = await employeeUser(eid);
    if (e?.user_id) await notify([e.user_id], { type: "hr", title: `Training: ${c.title}`, body: input.dueDate ? `Complete it by ${input.dueDate}.` : undefined, link: "/profile?tab=record" }, now, user.id);
    added++;
  }
  return added;
}

// HR records completion; a renewable course gets its expiry date (reminded 30 days before).
export async function completeTraining(user: AppUser, trainingId: string, input: { completedOn: string; note?: string | null }) {
  needHr(user);
  if (!isDay(input.completedOn)) throw new WorkflowError("VALIDATION", "Choose the date it was completed.");
  const t = await get<{ renew_months: number | null }>("SELECT c.renew_months FROM trainings t JOIN courses c ON c.id = t.course_id WHERE t.id = ?", trainingId);
  if (!t) throw new WorkflowError("NOT_FOUND", "This training no longer exists.");
  let expires: string | null = null;
  if (t.renew_months) {
    const d = new Date(`${input.completedOn}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n(t.renew_months));
    expires = d.toISOString().slice(0, 10);
  }
  await run("UPDATE trainings SET status = 'done', completed_on = ?, expires_on = ?, note = ? WHERE id = ?", input.completedOn, expires, clean(input.note, 500), trainingId);
}

export async function courseTrainings(user: AppUser, courseId: string) {
  needHr(user);
  return all<{ id: string; employee_id: string; full_name: string; status: string; due_date: string | null; completed_on: string | null; expires_on: string | null }>(
    "SELECT t.id, t.employee_id, e.full_name, t.status, t.due_date, t.completed_on, t.expires_on FROM trainings t JOIN employees e ON e.id = t.employee_id WHERE t.course_id = ? ORDER BY t.status, e.full_name",
    courseId,
  );
}

// Daily: certificates coming up for renewal (HR and the person), and overdue mandatory training (HR).
export async function trainingReminders(now = nowIso()) {
  const soon = new Date(Date.parse(now) + 30 * DAY).toISOString().slice(0, 10);
  const hr = (await listUsers()).filter((u) => u.perms.includes("hr.access")).map((u) => u.id);
  const due = await all<{ id: string; title: string; full_name: string; user_id: string | null; expires_on: string; employee_id: string }>(
    `SELECT t.id, c.title, e.full_name, e.user_id, t.expires_on, t.employee_id FROM trainings t JOIN courses c ON c.id = t.course_id JOIN employees e ON e.id = t.employee_id
     WHERE t.status = 'done' AND t.expires_on IS NOT NULL AND t.expires_on <= ? AND e.status <> 'left'`,
    soon,
  );
  for (const t of due)
    await notify([...hr, t.user_id], { type: "hr", title: `Renewal due: ${t.title}`, body: `${t.full_name}'s certificate ${t.expires_on < now.slice(0, 10) ? "expired" : "expires"} on ${t.expires_on}.`, link: `/hr/people/${t.employee_id}`, dedupeKey: `renew:${t.id}:${t.expires_on}` }, now);
  return due.length;
}

// ---------------------------------------------------------------------------
// Confidential cases (hr.cases only)
// ---------------------------------------------------------------------------

function needCases(u: AppUser) {
  if (!can(u, "hr.cases")) throw new WorkflowError("FORBIDDEN", "Cases are visible to the HR Manager only.");
}

export type HrCase = { id: string; code: string; employeeId: string; employeeName: string; kind: CaseKind; title: string; status: CaseStatus; openedOn: string; closedOn: string | null; outcome: string | null; notes: { id: string; note: string; actor: string; at: string }[] };

export async function listCases(user: AppUser): Promise<HrCase[]> {
  needCases(user);
  const rows = await all<{ id: string; code: string; employee_id: string; full_name: string; kind: CaseKind; title: string; status: CaseStatus; opened_on: string; closed_on: string | null; outcome: string | null }>(
    "SELECT c.*, e.full_name FROM hr_cases c JOIN employees e ON e.id = c.employee_id ORDER BY CASE c.status WHEN 'closed' THEN 1 ELSE 0 END, c.opened_on DESC",
  );
  const notes = rows.length
    ? await all<{ id: string; case_id: string; note: string; name: string | null; at: string }>(
        `SELECT n.id, n.case_id, n.note, u.name, n.at FROM hr_case_notes n LEFT JOIN users u ON u.id = n.actor_id WHERE n.case_id IN (${rows.map(() => "?").join(",")}) ORDER BY n.at`,
        ...rows.map((r) => r.id),
      )
    : [];
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    employeeId: r.employee_id,
    employeeName: r.full_name,
    kind: r.kind,
    title: r.title,
    status: r.status,
    openedOn: r.opened_on,
    closedOn: r.closed_on,
    outcome: r.outcome,
    notes: notes.filter((x) => x.case_id === r.id).map((x) => ({ id: x.id, note: x.note, actor: x.name ?? "Unknown", at: x.at })),
  }));
}

export async function openCase(user: AppUser, input: { employeeId: string; kind: string; title: string; note?: string | null }) {
  needCases(user);
  const title = clean(input.title, 160);
  if (!title) throw new WorkflowError("VALIDATION", "Give the case a short title.");
  if (!CASE_KINDS.includes(input.kind as CaseKind)) throw new WorkflowError("VALIDATION", "Choose the kind of case.");
  const seq = n((await get<{ c: number }>("SELECT COUNT(*) AS c FROM hr_cases"))?.c) + 1;
  const id = uid("case_");
  const now = nowIso();
  await run(
    "INSERT INTO hr_cases (id, code, employee_id, kind, title, opened_on, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    `CASE-${String(seq).padStart(3, "0")}`,
    input.employeeId,
    input.kind,
    title,
    now.slice(0, 10),
    user.id,
    now,
  );
  if (clean(input.note)) await run("INSERT INTO hr_case_notes (id, case_id, note, actor_id, at) VALUES (?, ?, ?, ?, ?)", uid("cn_"), id, clean(input.note, 6000), user.id, now);
  // The audit log names the case code only, never the person or the details.
  await audit({ actor: user }, { action: "hr.case", summary: `${user.name} opened a confidential case` });
  return id;
}

export async function updateCase(user: AppUser, id: string, input: { status?: string; note?: string | null; outcome?: string | null }) {
  needCases(user);
  const c = await get<{ status: CaseStatus }>("SELECT status FROM hr_cases WHERE id = ?", id);
  if (!c) throw new WorkflowError("NOT_FOUND", "This case no longer exists.");
  const now = nowIso();
  if (clean(input.note)) await run("INSERT INTO hr_case_notes (id, case_id, note, actor_id, at) VALUES (?, ?, ?, ?, ?)", uid("cn_"), id, clean(input.note, 6000), user.id, now);
  if (input.status && CASE_STATUSES.includes(input.status as CaseStatus) && input.status !== c.status) {
    if (input.status === "closed" && !clean(input.outcome)) throw new WorkflowError("VALIDATION", "Record the outcome to close the case.");
    await run("UPDATE hr_cases SET status = ?, closed_on = ?, outcome = COALESCE(?, outcome) WHERE id = ?", input.status, input.status === "closed" ? now.slice(0, 10) : null, clean(input.outcome, 3000), id);
  }
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export async function hrReport(user: AppUser, year = new Date().getUTCFullYear()) {
  needHr(user);
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const people = await all<{ id: string; department: string | null; employment_type: string; status: string; start_date: string | null; end_date: string | null; gender: string | null }>(
    "SELECT id, department, employment_type, status, start_date, end_date, gender FROM employees",
  );
  const current = people.filter((p) => p.status !== "left");
  const group = (key: (p: (typeof people)[number]) => string) => {
    const m = new Map<string, number>();
    for (const p of current) m.set(key(p), (m.get(key(p)) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
  };
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const joiners = months.map((m) => people.filter((p) => p.start_date?.startsWith(m)).length);
  const leavers = months.map((m) => people.filter((p) => p.end_date?.startsWith(m) && p.status === "left").length);
  // Turnover: leavers in the year over the average of headcount at the start and now.
  const atStart = people.filter((p) => (!p.start_date || p.start_date < from) && (!p.end_date || p.end_date >= from)).length;
  const left = leavers.reduce((a, b) => a + b, 0);
  const avg = (atStart + current.length) / 2;
  const leave = await all<{ label: string; days: number; people: number }>(
    `SELECT COALESCE(t.label, r.type_key) AS label, SUM(r.days) AS days, COUNT(DISTINCT r.employee_id) AS people FROM leave_requests r LEFT JOIN leave_types t ON t.key = r.type_key
     WHERE r.status = 'approved' AND r.start_date >= ? AND r.start_date <= ? GROUP BY COALESCE(t.label, r.type_key) ORDER BY days DESC`,
    from,
    to,
  );
  const training = await all<{ title: string; assigned: number; done: number; overdue: number }>(
    `SELECT c.title, COUNT(t.id) AS assigned, SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done,
            SUM(CASE WHEN t.status = 'assigned' AND t.due_date < ? THEN 1 ELSE 0 END) AS overdue
     FROM courses c LEFT JOIN trainings t ON t.course_id = c.id WHERE c.active = 1 GROUP BY c.title ORDER BY c.title`,
    nowIso().slice(0, 10),
  );
  const hiring = await get<{ open: number; applicants: number; hired: number }>(
    `SELECT (SELECT COUNT(*) FROM job_openings WHERE status = 'open') AS open,
            (SELECT COUNT(*) FROM applicants WHERE created_at >= ? AND created_at <= ?) AS applicants,
            (SELECT COUNT(*) FROM applicants WHERE stage = 'hired' AND updated_at >= ? AND updated_at <= ?) AS hired`,
    from,
    `${to}T23:59:59Z`,
    from,
    `${to}T23:59:59Z`,
  );
  return {
    year,
    headcount: current.length,
    byDepartment: group((p) => p.department ?? "No department"),
    byType: group((p) => p.employment_type),
    byStatus: group((p) => p.status),
    months,
    joiners,
    leavers,
    turnover: avg ? Math.round((left / avg) * 1000) / 10 : 0,
    leave: leave.map((l) => ({ label: l.label, days: n(l.days), people: n(l.people) })),
    training: training.map((t) => ({ title: t.title, assigned: n(t.assigned), done: n(t.done), overdue: n(t.overdue) })),
    hiring: { open: n(hiring?.open), applicants: n(hiring?.applicants), hired: n(hiring?.hired) },
    attendance: await (await import("./attendance")).attendanceYear(year),
  };
}
