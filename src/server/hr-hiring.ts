// HR recruitment, onboarding and offboarding: job openings, the applicant pipeline, interviews with scorecards,
// offers, hiring into an employee record (and an app account), and the joiner and leaver checklists.

import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { can, listUsers, type AppUser } from "./users";
import { hashPassword } from "./passwords";
import { uniqueHandle } from "./importer";
import { myEmployeeId, saveEmployee } from "./hr";
import { ROLES, type Role } from "@/lib/domain";
import {
  APPLICANT_STAGES,
  DEFAULT_CHECKLISTS,
  OPENING_STATUSES,
  RECOMMENDATIONS,
  type ApplicantStage,
  type ChecklistItem,
  type ChecklistKind,
  type ChecklistTemplateItem,
  type OpeningStatus,
  type Recommendation,
} from "@/lib/hr-growth";
import { EMPLOYMENT_TYPES } from "@/lib/hr";

const clean = (v: unknown, max = 300) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MAX_FILE = 8 * 1024 * 1024;
// Roles HR may give a new hire's account. Admin, Manager, Owner and the HR Manager role need users.manage.
const PRIVILEGED: Role[] = ["admin", "manager", "owner", "hr_manager"];

function needHr(u: AppUser) {
  if (!can(u, "hr.access")) throw new WorkflowError("FORBIDDEN", "Only HR can do this.");
}

async function hrUserIds() {
  return (await listUsers()).filter((u) => u.perms.includes("hr.access")).map((u) => u.id);
}

// ---------------------------------------------------------------------------
// Openings and applicants
// ---------------------------------------------------------------------------

export type Opening = {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  employmentType: string;
  positions: number;
  description: string | null;
  hiringManagerId: string | null;
  hiringManagerName: string | null;
  status: OpeningStatus;
  closesOn: string | null;
  counts: Record<ApplicantStage, number>;
  createdAt: string;
};

export async function listOpenings(user: AppUser): Promise<Opening[]> {
  needHr(user);
  const rows = await all<{
    id: string;
    title: string;
    department: string | null;
    location: string | null;
    employment_type: string;
    positions: number;
    description: string | null;
    hiring_manager_id: string | null;
    manager_name: string | null;
    status: OpeningStatus;
    closes_on: string | null;
    created_at: string;
  }>(
    `SELECT o.*, e.full_name AS manager_name FROM job_openings o LEFT JOIN employees e ON e.id = o.hiring_manager_id
     ORDER BY CASE o.status WHEN 'open' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END, o.created_at DESC`,
  );
  const counts = await all<{ opening_id: string; stage: ApplicantStage; c: number }>("SELECT opening_id, stage, COUNT(*) AS c FROM applicants GROUP BY opening_id, stage");
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    department: r.department,
    location: r.location,
    employmentType: r.employment_type,
    positions: Number(r.positions),
    description: r.description,
    hiringManagerId: r.hiring_manager_id,
    hiringManagerName: r.manager_name,
    status: r.status,
    closesOn: r.closes_on,
    counts: Object.fromEntries(APPLICANT_STAGES.map((s) => [s, Number(counts.find((c) => c.opening_id === r.id && c.stage === s)?.c ?? 0)])) as Record<ApplicantStage, number>,
    createdAt: r.created_at,
  }));
}

export async function saveOpening(
  user: AppUser,
  input: { id?: string | null; title: string; department?: string | null; location?: string | null; employmentType?: string; positions?: number; description?: string | null; hiringManagerId?: string | null; status?: string; closesOn?: string | null },
) {
  needHr(user);
  const title = clean(input.title, 120);
  if (!title) throw new WorkflowError("VALIDATION", "Enter the job title.");
  const now = nowIso();
  const values = [
    title,
    clean(input.department, 60),
    clean(input.location, 120),
    EMPLOYMENT_TYPES.includes(input.employmentType as never) ? input.employmentType : "full_time",
    Math.max(1, Math.min(50, Math.trunc(Number(input.positions) || 1))),
    clean(input.description, 6000),
    clean(input.hiringManagerId, 40),
    OPENING_STATUSES.includes(input.status as OpeningStatus) ? input.status : "open",
    isDay(input.closesOn) ? input.closesOn : null,
  ];
  if (input.id) {
    await run(
      "UPDATE job_openings SET title = ?, department = ?, location = ?, employment_type = ?, positions = ?, description = ?, hiring_manager_id = ?, status = ?, closes_on = ?, updated_at = ? WHERE id = ?",
      ...values,
      now,
      input.id,
    );
    await audit({ actor: user }, { action: "hr.hiring", summary: `${user.name} updated the opening ${title}` });
    return input.id;
  }
  const id = uid("job_");
  await run(
    "INSERT INTO job_openings (id, title, department, location, employment_type, positions, description, hiring_manager_id, status, closes_on, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    ...values,
    user.id,
    now,
    now,
  );
  await audit({ actor: user }, { action: "hr.hiring", summary: `${user.name} opened the position ${title}` });
  return id;
}

export type Applicant = {
  id: string;
  openingId: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  stage: ApplicantStage;
  notes: string | null;
  rejectedReason: string | null;
  offerStartDate: string | null;
  offerNote: string | null;
  employeeId: string | null;
  createdAt: string;
  updatedAt: string;
  files: { id: string; name: string; size: number }[];
  interviews: Interview[];
  avgRating: number | null;
};

export type Interview = {
  id: string;
  scheduledAt: string;
  durationMin: number;
  location: string | null;
  interviewers: { id: string; name: string }[];
  status: string;
  scorecards: { reviewerId: string; reviewerName: string; rating: number; recommendation: Recommendation; notes: string | null }[];
};

async function interviewsFor(applicantIds: string[]): Promise<Map<string, Interview[]>> {
  const out = new Map<string, Interview[]>();
  if (!applicantIds.length) return out;
  const marks = applicantIds.map(() => "?").join(",");
  const rows = await all<{ id: string; applicant_id: string; scheduled_at: string; duration_min: number; location: string | null; interviewer_ids: string; status: string }>(
    `SELECT * FROM interviews WHERE applicant_id IN (${marks}) ORDER BY scheduled_at`,
    ...applicantIds,
  );
  const cards = rows.length
    ? await all<{ interview_id: string; reviewer_id: string; name: string | null; rating: number; recommendation: Recommendation; notes: string | null }>(
        `SELECT s.*, u.name FROM scorecards s LEFT JOIN users u ON u.id = s.reviewer_id WHERE s.interview_id IN (${rows.map(() => "?").join(",")})`,
        ...rows.map((r) => r.id),
      )
    : [];
  const names = new Map((await all<{ id: string; name: string }>("SELECT id, name FROM users")).map((u) => [u.id, u.name]));
  for (const r of rows) {
    const list = out.get(r.applicant_id) ?? [];
    list.push({
      id: r.id,
      scheduledAt: r.scheduled_at,
      durationMin: Number(r.duration_min),
      location: r.location,
      interviewers: parseJson<string[]>(r.interviewer_ids, []).map((id) => ({ id, name: names.get(id) ?? "Unknown" })),
      status: r.status,
      scorecards: cards
        .filter((c) => c.interview_id === r.id)
        .map((c) => ({ reviewerId: c.reviewer_id, reviewerName: c.name ?? "Unknown", rating: Number(c.rating), recommendation: c.recommendation, notes: c.notes })),
    });
    out.set(r.applicant_id, list);
  }
  return out;
}

export async function listApplicants(user: AppUser, openingId: string): Promise<Applicant[]> {
  needHr(user);
  const rows = await all<{
    id: string;
    opening_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    source: string | null;
    stage: ApplicantStage;
    notes: string | null;
    rejected_reason: string | null;
    offer_start_date: string | null;
    offer_note: string | null;
    employee_id: string | null;
    created_at: string;
    updated_at: string;
  }>("SELECT * FROM applicants WHERE opening_id = ? ORDER BY created_at", openingId);
  const files = rows.length
    ? await all<{ id: string; applicant_id: string; name: string; size: number }>(
        `SELECT id, applicant_id, name, size FROM applicant_files WHERE applicant_id IN (${rows.map(() => "?").join(",")}) ORDER BY created_at`,
        ...rows.map((r) => r.id),
      )
    : [];
  const ivs = await interviewsFor(rows.map((r) => r.id));
  return rows.map((r) => {
    const interviews = ivs.get(r.id) ?? [];
    const ratings = interviews.flatMap((i) => i.scorecards.map((c) => c.rating));
    return {
      id: r.id,
      openingId: r.opening_id,
      fullName: r.full_name,
      email: r.email,
      phone: r.phone,
      source: r.source,
      stage: r.stage,
      notes: r.notes,
      rejectedReason: r.rejected_reason,
      offerStartDate: r.offer_start_date,
      offerNote: r.offer_note,
      employeeId: r.employee_id,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      files: files.filter((f) => f.applicant_id === r.id).map((f) => ({ id: f.id, name: f.name, size: Number(f.size) })),
      interviews,
      avgRating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null,
    };
  });
}

export async function saveApplicant(
  user: AppUser,
  input: { id?: string | null; openingId: string; fullName: string; email?: string | null; phone?: string | null; source?: string | null; notes?: string | null; file?: { name: string; mime: string; base64: string } | null },
) {
  needHr(user);
  const name = clean(input.fullName, 160);
  if (!name) throw new WorkflowError("VALIDATION", "Enter the applicant's name.");
  if (!(await get("SELECT 1 AS x FROM job_openings WHERE id = ?", input.openingId))) throw new WorkflowError("NOT_FOUND", "This opening no longer exists.");
  const now = nowIso();
  let id = input.id;
  if (id) {
    await run("UPDATE applicants SET full_name = ?, email = ?, phone = ?, source = ?, notes = ?, updated_at = ? WHERE id = ?", name, clean(input.email, 200), clean(input.phone, 40), clean(input.source, 80), clean(input.notes, 4000), now, id);
  } else {
    id = uid("app_");
    await run(
      "INSERT INTO applicants (id, opening_id, full_name, email, phone, source, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      id,
      input.openingId,
      name,
      clean(input.email, 200),
      clean(input.phone, 40),
      clean(input.source, 80),
      clean(input.notes, 4000),
      user.id,
      now,
      now,
    );
    await audit({ actor: user }, { action: "hr.hiring", summary: `${user.name} added the applicant ${name}` });
  }
  if (input.file) await addApplicantFile(user, id, input.file);
  return id;
}

export async function addApplicantFile(user: AppUser, applicantId: string, file: { name: string; mime: string; base64: string }) {
  needHr(user);
  const size = Math.floor((file.base64.length * 3) / 4);
  if (size > MAX_FILE) throw new WorkflowError("VALIDATION", "Files are limited to 8 MB.");
  await run(
    "INSERT INTO applicant_files (id, applicant_id, name, mime, size, data, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("apf_"),
    applicantId,
    file.name.replace(/[\\/]/g, "_").slice(0, 160) || "file",
    file.mime.slice(0, 100) || "application/octet-stream",
    size,
    file.base64,
    user.id,
    nowIso(),
  );
}

export async function readApplicantFile(user: AppUser, fileId: string) {
  if (!can(user, "hr.access")) {
    // Interviewers may open the CV of someone they interview.
    const f = await get<{ applicant_id: string }>("SELECT applicant_id FROM applicant_files WHERE id = ?", fileId);
    const mine = f && (await all<{ interviewer_ids: string }>("SELECT interviewer_ids FROM interviews WHERE applicant_id = ?", f.applicant_id)).some((i) => parseJson<string[]>(i.interviewer_ids, []).includes(user.id));
    if (!mine) return null;
  }
  const f = await get<{ name: string; mime: string; data: string }>("SELECT name, mime, data FROM applicant_files WHERE id = ?", fileId);
  return f ? { name: f.name, mime: f.mime, data: Buffer.from(f.data, "base64") } : null;
}

export async function moveApplicant(user: AppUser, id: string, input: { stage: string; reason?: string | null; offerStartDate?: string | null; offerNote?: string | null }) {
  needHr(user);
  const a = await get<{ full_name: string; stage: ApplicantStage }>("SELECT full_name, stage FROM applicants WHERE id = ?", id);
  if (!a) throw new WorkflowError("NOT_FOUND", "This applicant no longer exists.");
  const stage = input.stage as ApplicantStage;
  if (!APPLICANT_STAGES.includes(stage) || stage === "hired") throw new WorkflowError("VALIDATION", "Use Hire to hire someone.");
  if (a.stage === "hired") throw new WorkflowError("INVALID_STATE", `${a.full_name} is already hired.`);
  if (stage === "rejected" && !clean(input.reason)) throw new WorkflowError("VALIDATION", "Note why, for the record.");
  await run(
    "UPDATE applicants SET stage = ?, rejected_reason = ?, offer_start_date = COALESCE(?, offer_start_date), offer_note = COALESCE(?, offer_note), updated_at = ? WHERE id = ?",
    stage,
    stage === "rejected" ? clean(input.reason, 500) : null,
    isDay(input.offerStartDate) ? input.offerStartDate : null,
    clean(input.offerNote, 1000),
    nowIso(),
    id,
  );
  await audit({ actor: user }, { action: "hr.hiring", summary: `${user.name} moved ${a.full_name} to ${stage}${stage === "rejected" ? `: ${clean(input.reason)}` : ""}` });
}

export async function scheduleInterview(user: AppUser, applicantId: string, input: { scheduledAt: string; durationMin?: number; location?: string | null; interviewerIds: string[] }) {
  needHr(user);
  const a = await get<{ full_name: string; title: string }>("SELECT a.full_name, o.title FROM applicants a JOIN job_openings o ON o.id = a.opening_id WHERE a.id = ?", applicantId);
  if (!a) throw new WorkflowError("NOT_FOUND", "This applicant no longer exists.");
  const at = new Date(input.scheduledAt);
  if (Number.isNaN(at.getTime())) throw new WorkflowError("VALIDATION", "Choose the date and time.");
  const ids = [...new Set(input.interviewerIds)].filter(Boolean).slice(0, 8);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose at least one interviewer.");
  const id = uid("int_");
  await run(
    "INSERT INTO interviews (id, applicant_id, scheduled_at, duration_min, location, interviewer_ids, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    applicantId,
    at.toISOString(),
    Math.max(10, Math.min(480, Math.trunc(Number(input.durationMin) || 45))),
    clean(input.location, 200),
    JSON.stringify(ids),
    user.id,
    nowIso(),
  );
  await run("UPDATE applicants SET stage = CASE WHEN stage IN ('applied','screening') THEN 'interview' ELSE stage END, updated_at = ? WHERE id = ?", nowIso(), applicantId);
  await notify(ids, { type: "assignment", title: `Interview: ${a.full_name}`, body: `${a.title}, ${at.toISOString().slice(0, 16).replace("T", " ")} UTC${input.location ? `, ${input.location}` : ""}. Add your scorecard in My record afterwards.`, link: "/profile?tab=record" }, nowIso(), user.id);
  await audit({ actor: user }, { action: "hr.hiring", summary: `${user.name} scheduled an interview with ${a.full_name}` });
  return id;
}

export async function cancelInterview(user: AppUser, id: string) {
  needHr(user);
  await run("UPDATE interviews SET status = 'cancelled' WHERE id = ?", id);
}

// Interviews a person takes part in, with their own scorecard (shown on My record).
export async function myInterviews(user: AppUser) {
  const rows = await all<{ id: string; applicant_id: string; full_name: string; title: string; scheduled_at: string; location: string | null; interviewer_ids: string; status: string }>(
    `SELECT i.*, a.full_name, o.title FROM interviews i JOIN applicants a ON a.id = i.applicant_id JOIN job_openings o ON o.id = a.opening_id
     WHERE i.status <> 'cancelled' AND a.stage NOT IN ('hired','rejected') ORDER BY i.scheduled_at DESC LIMIT 100`,
  );
  const mine = rows.filter((r) => parseJson<string[]>(r.interviewer_ids, []).includes(user.id));
  const cards = mine.length
    ? await all<{ interview_id: string; rating: number; recommendation: Recommendation; notes: string | null }>(
        `SELECT interview_id, rating, recommendation, notes FROM scorecards WHERE reviewer_id = ? AND interview_id IN (${mine.map(() => "?").join(",")})`,
        user.id,
        ...mine.map((m) => m.id),
      )
    : [];
  const files = mine.length
    ? await all<{ id: string; applicant_id: string; name: string }>(`SELECT id, applicant_id, name FROM applicant_files WHERE applicant_id IN (${mine.map(() => "?").join(",")})`, ...mine.map((m) => m.applicant_id))
    : [];
  return mine.map((r) => ({
    id: r.id,
    applicantName: r.full_name,
    opening: r.title,
    scheduledAt: r.scheduled_at,
    location: r.location,
    files: files.filter((f) => f.applicant_id === r.applicant_id).map((f) => ({ id: f.id, name: f.name })),
    scorecard: cards.find((c) => c.interview_id === r.id) ?? null,
  }));
}

export async function submitScorecard(user: AppUser, interviewId: string, input: { rating: number; recommendation: string; notes?: string | null }) {
  const i = await get<{ interviewer_ids: string; applicant_id: string; status: string }>("SELECT interviewer_ids, applicant_id, status FROM interviews WHERE id = ?", interviewId);
  if (!i) throw new WorkflowError("NOT_FOUND", "This interview no longer exists.");
  if (!parseJson<string[]>(i.interviewer_ids, []).includes(user.id) && !can(user, "hr.access")) throw new WorkflowError("FORBIDDEN", "Only the interviewers score this interview.");
  const rating = Math.trunc(Number(input.rating));
  if (!(rating >= 1 && rating <= 5)) throw new WorkflowError("VALIDATION", "Rate from 1 to 5.");
  if (!RECOMMENDATIONS.includes(input.recommendation as Recommendation)) throw new WorkflowError("VALIDATION", "Choose a recommendation.");
  await run(
    `INSERT INTO scorecards (id, interview_id, reviewer_id, rating, recommendation, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (interview_id, reviewer_id) DO UPDATE SET rating = excluded.rating, recommendation = excluded.recommendation, notes = excluded.notes, created_at = excluded.created_at`,
    uid("sc_"),
    interviewId,
    user.id,
    rating,
    input.recommendation,
    clean(input.notes, 3000),
    nowIso(),
  );
  await run("UPDATE interviews SET status = 'done' WHERE id = ?", interviewId);
  const a = await get<{ full_name: string }>("SELECT full_name FROM applicants WHERE id = ?", i.applicant_id);
  await notify(await hrUserIds(), { type: "hr", title: `Scorecard in: ${a?.full_name}`, body: `${user.name} rated ${rating} of 5.`, link: "/hr?tab=hiring", groupKey: `scorecards:${i.applicant_id}` }, nowIso(), user.id);
}

// Hire: the applicant becomes an employee (on probation, with onboarding started), optionally with an app account.
export async function hireApplicant(
  user: AppUser,
  id: string,
  input: { startDate: string; jobTitle?: string | null; probationEnd?: string | null; createAccount?: boolean; roles?: Role[] },
) {
  needHr(user);
  const a = await get<{ full_name: string; email: string | null; phone: string | null; stage: ApplicantStage; opening_id: string }>(
    "SELECT full_name, email, phone, stage, opening_id FROM applicants WHERE id = ?",
    id,
  );
  if (!a) throw new WorkflowError("NOT_FOUND", "This applicant no longer exists.");
  if (a.stage === "hired") throw new WorkflowError("INVALID_STATE", `${a.full_name} is already hired.`);
  if (a.stage === "rejected") throw new WorkflowError("INVALID_STATE", "Move the applicant out of Not selected first.");
  if (!isDay(input.startDate)) throw new WorkflowError("VALIDATION", "Choose the start date.");
  const o = (await get<{ title: string; department: string | null; employment_type: string; hiring_manager_id: string | null; positions: number; location: string | null }>(
    "SELECT title, department, employment_type, hiring_manager_id, positions, location FROM job_openings WHERE id = ?",
    a.opening_id,
  ))!;
  const roles = (input.roles ?? []).filter((r) => ROLES.includes(r));
  let userId: string | null = null;
  let tempPassword: string | null = null;
  if (input.createAccount) {
    const email = a.email?.trim().toLowerCase();
    if (!email) throw new WorkflowError("VALIDATION", "Add the applicant's email first; the account signs in with it.");
    if (!roles.length) throw new WorkflowError("VALIDATION", "Choose at least one role for the account.");
    if (roles.some((r) => PRIVILEGED.includes(r)) && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Admin, Manager, Owner and HR Manager accounts are given by an administrator.");
    if (await get("SELECT 1 AS x FROM users WHERE lower(email) = ?", email)) throw new WorkflowError("VALIDATION", "An account already uses this email. Link it on the employee record instead.");
    userId = uid("usr_");
    tempPassword = `Myseed-${crypto.randomBytes(4).toString("hex")}`;
  }
  let employeeId = "";
  await tx(async () => {
    if (userId) {
      await run(
        "INSERT INTO users (id, name, email, handle, phone, password_hash, must_change_password, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)",
        userId,
        a.full_name,
        a.email!.trim().toLowerCase(),
        await uniqueHandle(a.email!.split("@")[0]!),
        a.phone,
        hashPassword(tempPassword!),
        nowIso(),
      );
      for (const r of roles) await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?)", userId, r);
    }
    employeeId = await saveEmployee(user, {
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
      userId,
      jobTitle: clean(input.jobTitle, 120) ?? o.title,
      department: o.department,
      managerId: o.hiring_manager_id,
      employmentType: o.employment_type,
      location: o.location,
      status: "probation",
      startDate: input.startDate,
      probationEnd: isDay(input.probationEnd) ? input.probationEnd : null,
    });
    await run("UPDATE applicants SET stage = 'hired', employee_id = ?, offer_start_date = ?, updated_at = ? WHERE id = ?", employeeId, input.startDate, nowIso(), id);
    const hired = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM applicants WHERE opening_id = ? AND stage = 'hired'", a.opening_id))?.c ?? 0);
    if (hired >= Number(o.positions)) await run("UPDATE job_openings SET status = 'filled', updated_at = ? WHERE id = ?", nowIso(), a.opening_id);
  });
  await startChecklist(user, employeeId, "onboarding");
  await audit({ actor: user }, { itemId: employeeId, action: "hr.hiring", summary: `${user.name} hired ${a.full_name} as ${o.title}, starting ${input.startDate}${userId ? `, with an account (${roles.join(", ")})` : ""}` });
  return { employeeId, tempPassword };
}

// ---------------------------------------------------------------------------
// Onboarding and offboarding checklists
// ---------------------------------------------------------------------------

export async function checklistTemplates(): Promise<Record<ChecklistKind, ChecklistTemplateItem[]>> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'hr.checklists'");
  return { ...DEFAULT_CHECKLISTS, ...parseJson<Partial<Record<ChecklistKind, ChecklistTemplateItem[]>>>(row?.value, {}) };
}

export async function saveChecklistTemplate(user: AppUser, kind: ChecklistKind, items: ChecklistTemplateItem[]) {
  if (!can(user, "hr.manage")) throw new WorkflowError("FORBIDDEN", "Only the HR Manager changes the checklists.");
  const clean2 = items
    .map((i, n) => ({ key: i.key || `i${n}_${uid("").slice(0, 6)}`, label: (i.label ?? "").trim().slice(0, 160), owner: i.owner }))
    .filter((i) => i.label)
    .slice(0, 40);
  const all2 = { ...(await checklistTemplates()), [kind]: clean2 };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('hr.checklists', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(all2),
    nowIso(),
    user.id,
  );
}

export type EmployeeChecklist = { id: string; employeeId: string; employeeName: string; kind: ChecklistKind; items: ChecklistItem[]; status: "open" | "done"; startedAt: string; finishedAt: string | null };

const toChecklist = (r: { id: string; employee_id: string; full_name: string; kind: ChecklistKind; items: string; status: "open" | "done"; started_at: string; finished_at: string | null }): EmployeeChecklist => ({
  id: r.id,
  employeeId: r.employee_id,
  employeeName: r.full_name,
  kind: r.kind,
  items: parseJson<ChecklistItem[]>(r.items, []),
  status: r.status,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

export async function startChecklist(user: AppUser, employeeId: string, kind: ChecklistKind) {
  needHr(user);
  const open = await get<{ id: string }>("SELECT id FROM employee_checklists WHERE employee_id = ? AND kind = ? AND status = 'open'", employeeId, kind);
  if (open) return open.id;
  const tpl = (await checklistTemplates())[kind];
  const id = uid("ecl_");
  await run(
    "INSERT INTO employee_checklists (id, employee_id, kind, items, started_at, started_by) VALUES (?, ?, ?, ?, ?, ?)",
    id,
    employeeId,
    kind,
    JSON.stringify(tpl.map((t) => ({ ...t, doneAt: null, doneBy: null, note: null }))),
    nowIso(),
    user.id,
  );
  return id;
}

// Offboarding: sets the last day, starts the leaver checklist and tells the line manager.
export async function startOffboarding(user: AppUser, employeeId: string, input: { lastDay: string; reason?: string | null }) {
  if (!can(user, "hr.manage")) throw new WorkflowError("FORBIDDEN", "Only the HR Manager starts offboarding.");
  if (!isDay(input.lastDay)) throw new WorkflowError("VALIDATION", "Choose the last working day.");
  const e = await get<{ full_name: string; manager_id: string | null }>("SELECT full_name, manager_id FROM employees WHERE id = ?", employeeId);
  if (!e) throw new WorkflowError("NOT_FOUND", "This employee no longer exists.");
  await run("UPDATE employees SET end_date = ?, end_reason = ?, updated_at = ?, updated_by = ? WHERE id = ?", input.lastDay, clean(input.reason, 400), nowIso(), user.id, employeeId);
  const id = await startChecklist(user, employeeId, "offboarding");
  const m = e.manager_id ? await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", e.manager_id) : null;
  if (m?.user_id) await notify([m.user_id], { type: "hr", title: `Leaving: ${e.full_name}`, body: `Last working day ${input.lastDay}. Plan the handover of their work.`, link: `/hr/people/${employeeId}` }, nowIso(), user.id);
  await audit({ actor: user }, { itemId: employeeId, action: "hr.employee", summary: `${user.name} started offboarding ${e.full_name}, last day ${input.lastDay}` });
  return id;
}

export async function tickChecklist(user: AppUser, checklistId: string, key: string, done: boolean, note?: string | null) {
  const c = await get<{ employee_id: string; items: string; kind: ChecklistKind; status: string }>("SELECT employee_id, items, kind, status FROM employee_checklists WHERE id = ?", checklistId);
  if (!c) throw new WorkflowError("NOT_FOUND", "This checklist no longer exists.");
  const items = parseJson<ChecklistItem[]>(c.items, []);
  const it = items.find((i) => i.key === key);
  if (!it) throw new WorkflowError("NOT_FOUND", "This line no longer exists.");
  // HR ticks anything; the line manager ticks manager lines; the person ticks their own lines.
  const hr = can(user, "hr.access");
  if (!hr) {
    const me = await myEmployeeId(user);
    const managerOf = me ? !!(await get("SELECT 1 AS x FROM employees WHERE id = ? AND manager_id = ?", c.employee_id, me)) : false;
    const ok = (it.owner === "manager" && managerOf) || (it.owner === "employee" && me === c.employee_id);
    if (!ok) throw new WorkflowError("FORBIDDEN", "HR ticks this line.");
  }
  it.doneAt = done ? nowIso() : null;
  it.doneBy = done ? user.name : null;
  if (note !== undefined) it.note = clean(note, 300);
  const all2 = items.every((i) => i.doneAt);
  await run("UPDATE employee_checklists SET items = ?, status = ?, finished_at = ? WHERE id = ?", JSON.stringify(items), all2 ? "done" : "open", all2 ? nowIso() : null, checklistId);
  // Offboarding done: the person has left (the account is deactivated only by its own line, below).
  if (all2 && c.kind === "offboarding" && can(user, "hr.manage")) await run("UPDATE employees SET status = 'left', updated_at = ? WHERE id = ? AND end_date IS NOT NULL AND end_date <= ?", nowIso(), c.employee_id, nowIso().slice(0, 10));
  return all2;
}

// The "Remove app access" line can do it for real.
export async function deactivateAccount(user: AppUser, employeeId: string) {
  if (!can(user, "hr.manage") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only the HR Manager or an administrator removes access.");
  const e = await get<{ user_id: string | null; full_name: string }>("SELECT user_id, full_name FROM employees WHERE id = ?", employeeId);
  if (!e?.user_id) throw new WorkflowError("VALIDATION", "This person has no app account.");
  if (e.user_id === user.id) throw new WorkflowError("VALIDATION", "You cannot remove your own access.");
  await run("UPDATE users SET active = 0 WHERE id = ?", e.user_id);
  await run("DELETE FROM sessions WHERE user_id = ?", e.user_id);
  await audit({ actor: user }, { itemId: employeeId, action: "user.updated", summary: `${user.name} removed ${e.full_name}'s app access (offboarding)` });
}

export async function employeeChecklists(user: AppUser, employeeId: string) {
  const rows = await all<Parameters<typeof toChecklist>[0]>(
    "SELECT c.*, e.full_name FROM employee_checklists c JOIN employees e ON e.id = c.employee_id WHERE c.employee_id = ? ORDER BY c.started_at DESC",
    employeeId,
  );
  void user;
  return rows.map(toChecklist);
}

export async function openChecklists(user: AppUser) {
  needHr(user);
  const rows = await all<Parameters<typeof toChecklist>[0]>(
    "SELECT c.*, e.full_name FROM employee_checklists c JOIN employees e ON e.id = c.employee_id WHERE c.status = 'open' ORDER BY c.started_at",
  );
  return rows.map(toChecklist);
}
