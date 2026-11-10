// What the assistant can do for a person (Phase 13d), in one place: each operation is prepared first (checked, with
// a plain summary of what will happen) and runs only when the person confirms it, through the pages' own functions
// with their usual permission checks. The AI proposes them; routines and Admin's per-role switches use the same list.

import { all, get, nowIso, placeholders, run } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { myDepartments } from "./departments";
import { getDeptConfig } from "./dept-config";
import { getTask, listTasks, saveTask, moveTask, addTaskComment, bulkTasks } from "./work";
import { createRequest } from "./work-extras";
import { flowApprove, flowDone, flowReturn, flowSend, flowStart } from "./dept-flow";
import { cancelLeave, decideLeave, leaveTypes, requestLeave } from "./leave";
import { myEmployeeId } from "./hr";
import { decideCorrection, punchSelf, requestCorrection, stateOf } from "./attendance";
import { decideClaim, submitClaim } from "./finance";
import { deptPath } from "@/lib/work";

type Viewer = AppUser & { activeRole: string };
type Args = Record<string, string | number | boolean | null | undefined>;
export type Prepared = { title: string; lines: string[]; params: Record<string, unknown> };

export const OPS: { key: string; label: string; group: string; args: string; who?: string }[] = [
  { key: "leave", label: "Ask for leave", group: "Me", args: "leave_type, start, end, reason" },
  { key: "cancel_leave", label: "Cancel a leave request", group: "Me", args: "request_id" },
  { key: "check_in", label: "Check in or out", group: "Me", args: "" },
  { key: "attendance_correction", label: "Ask to correct attendance", group: "Me", args: "day, in_time (HH:MM), out_time (HH:MM), reason" },
  { key: "claim", label: "Claim an expense (no receipt)", group: "Me", args: "date, amount, description" },
  { key: "read_notifications", label: "Mark notifications read", group: "Me", args: "" },
  { key: "create_task", label: "Create a task", group: "Tasks", args: "department, title, description, assignee_id, due, priority" },
  { key: "start_task", label: "Start a task", group: "Tasks", args: "department, task_id" },
  { key: "finish_task", label: "Mark a task done", group: "Tasks", args: "department, task_id" },
  { key: "send_task", label: "Send done work to the lead", group: "Tasks", args: "department, task_id" },
  { key: "move_task", label: "Move a task to another status", group: "Tasks", args: "department, task_id, status" },
  { key: "update_task", label: "Change a task's priority or due date", group: "Tasks", args: "department, task_id, priority, due" },
  { key: "comment_task", label: "Comment on a task", group: "Tasks", args: "department, task_id, text" },
  { key: "request_department", label: "Ask another department", group: "Tasks", args: "department, title, description, request_type, due" },
  { key: "assign_task", label: "Assign a task", group: "Leads", args: "department, task_id, assignee_id", who: "leads" },
  { key: "approve_task", label: "Approve work sent to me", group: "Leads", args: "department, task_id", who: "leads" },
  { key: "return_task", label: "Return work with a note", group: "Leads", args: "department, task_id, note", who: "leads" },
  { key: "lead_handover", label: "Hand over parts to next stage (by grade, subject or codes)", group: "Leads", args: "stage, grade, subject, item_codes, note, receiver_id", who: "leads" },
  { key: "lead_assign_batch", label: "Assign batch of parts to team member", group: "Leads", args: "stage, assignee_id, item_codes, grade, subject", who: "leads" },
  { key: "decide_leave", label: "Approve or reject leave", group: "Approvals", args: "request_id, decision (approve|reject), note", who: "managers" },
  { key: "decide_claim", label: "Approve or reject a claim", group: "Approvals", args: "claim_id, decision (approve|reject), note", who: "managers" },
  { key: "decide_correction", label: "Approve or reject an attendance correction", group: "Approvals", args: "correction_id, decision (approve|reject), note", who: "managers" },
  { key: "run_routine", label: "Run one of my routines", group: "Routines", args: "routine_id" },
  // HR's work (Phase 30): only for people with the HR rights each needs.
  { key: "hr_mark_day", label: "Record someone's day (present, late, absent...)", group: "HR", args: "employee (name or code), day, status (present|late|half_day|absent|leave), in_time, out_time, note", who: "attendance" },
  { key: "hr_log_attendance", label: "Log a missed check-in or check-out", group: "HR", args: "employee, day, kind (in|out|break_start|break_end|lunch_start|lunch_end), time (HH:MM), note", who: "attendanceHr" },
  { key: "hr_adjust_leave", label: "Add or take away leave days", group: "HR", args: "employee, leave_type, days (negative to take away), note, year", who: "hr" },
  { key: "hr_announce", label: "Post an announcement", group: "HR", args: "title, body, kind (news|policy), department (empty: everyone)", who: "announce" },
  { key: "hr_open_case", label: "Open an HR case", group: "HR", args: "employee, kind (disciplinary|grievance|investigation), title, note", who: "cases" },
  { key: "hr_update_case", label: "Update an HR case", group: "HR", args: "case_id, status (open|investigating|action_taken|closed), note, outcome", who: "cases" },
  { key: "hr_one_on_one", label: "Record a one-to-one meeting", group: "HR", args: "employee, date, notes, actions", who: "hr" },
  { key: "hr_save_goal", label: "Set or update an employee goal", group: "HR", args: "employee (name or code), title, detail, due, progress (0-100)", who: "hr" },
  { key: "hr_assign_course", label: "Assign a training course", group: "HR", args: "course (title), employees (names, comma separated), due", who: "hr" },
  { key: "hr_open_job", label: "Open a job opening", group: "HR", args: "title, department, positions, description, closes (YYYY-MM-DD)", who: "hr" },
  { key: "hr_schedule_interview", label: "Schedule an applicant interview", group: "HR", args: "applicant_id, scheduled_at (YYYY-MM-DD HH:MM), duration_min, location", who: "hr" },
  { key: "hr_move_applicant", label: "Move applicant hiring stage", group: "HR", args: "applicant_id, stage (applied|screening|interview|offer|hired|rejected), reason", who: "hr" },
  { key: "hr_start_onboarding", label: "Start an onboarding/offboarding checklist", group: "HR", args: "employee, kind (onboarding|offboarding)", who: "hr" },
  { key: "hr_issue_equipment", label: "Assign equipment to employee", group: "HR", args: "equipment_id, employee, due_back, note", who: "hr" },
  { key: "hr_return_equipment", label: "Record equipment return", group: "HR", args: "equipment_id, condition, note", who: "hr" },
];
export const OP_KEYS = OPS.map((o) => o.key);

const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const hm = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}$/.test(v) ? v : null);
const str = (v: unknown, n = 4000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
const decision = (v: unknown) => (v === "approve" || v === "reject" ? v : null);

async function needDept(user: Viewer, d: unknown) {
  const ds = await myDepartments(user);
  const want = String(d ?? "").toLowerCase();
  const found = ds.find((x) => x.dept === want || x.title.toLowerCase() === want);
  if (!found) throw new WorkflowError("FORBIDDEN", `You cannot open the department "${d}". Yours: ${ds.map((x) => `${x.title} (${x.dept})`).join(", ") || "none"}.`);
  return found;
}
// By id (with the page's own access check), or by its code (WEB-12).
async function findTask(user: Viewer, d: string, id: unknown) {
  const key = String(id ?? "").trim();
  if (!key) throw new WorkflowError("NOT_FOUND", "Which task? Look it up first (use its id).");
  if (!/^[A-Z][A-Z0-9]*-\d+$/i.test(key)) return await getTask(user, d, key);
  const t = (await listTasks(user, d, { q: key, open: false })).tasks.find((x) => x.code.toLowerCase() === key.toLowerCase());
  if (!t) throw new WorkflowError("NOT_FOUND", "Task not found; look it up first (use its id).");
  return t;
}
const nameOf = async (id: unknown) => (typeof id === "string" ? ((await get<{ name: string }>("SELECT name FROM users WHERE id = ?", id))?.name ?? null) : null);

// An employee by name or code, among those HR (or the lead) can see.
export async function findEmployee(user: Viewer, v: unknown) {
  const q = String(v ?? "").trim().toLowerCase();
  if (!q) throw new WorkflowError("VALIDATION", "Name the employee.");
  const { listEmployees } = await import("./hr");
  const list = await listEmployees(user).catch(() => null);
  if (!list) throw new WorkflowError("FORBIDDEN", "Only HR looks up employees.");
  const hit = list.find((e) => e.code.toLowerCase() === q || e.id === v) ?? list.find((e) => e.name.toLowerCase() === q) ?? list.filter((e) => e.name.toLowerCase().includes(q));
  if (Array.isArray(hit)) {
    if (hit.length === 1) return hit[0]!;
    if (!hit.length) throw new WorkflowError("NOT_FOUND", `No employee called "${v}".`);
    throw new WorkflowError("VALIDATION", `Several people match "${v}": ${hit.slice(0, 6).map((e) => `${e.name} (${e.code})`).join(", ")}. Say which.`);
  }
  return hit;
}

export async function prepareOp(user: Viewer, kind: string, a: Args): Promise<Prepared> {
  const p: Record<string, unknown> = { kind };
  const lines: string[] = [];
  let title = OPS.find((o) => o.key === kind)?.label ?? "";
  switch (kind) {
    case "leave": {
      const types = await leaveTypes();
      const t = types.find((x) => x.key === a.leave_type || x.label.toLowerCase() === String(a.leave_type ?? "").toLowerCase());
      if (!t) throw new WorkflowError("VALIDATION", `Unknown leave type. Types: ${types.map((x) => `${x.label} (${x.key})`).join(", ")}`);
      const s = day(a.start), e = day(a.end);
      if (!s || !e || e < s) throw new WorkflowError("VALIDATION", "Give start and end as YYYY-MM-DD, end not before start.");
      lines.push(t.label, `From ${s} to ${e}`, ...(a.reason ? [`Reason: ${a.reason}`] : []), "It goes to your manager for approval");
      Object.assign(p, { typeKey: t.key, start: s, end: e, reason: str(a.reason, 500) });
      break;
    }
    case "cancel_leave": {
      const r = await get<{ id: string; start_date: string; end_date: string; status: string; employee_id: string }>("SELECT id, start_date, end_date, status, employee_id FROM leave_requests WHERE id = ?", a.request_id);
      if (!r || r.employee_id !== (await myEmployeeId(user))) throw new WorkflowError("NOT_FOUND", "That leave request is not yours.");
      lines.push(`Leave from ${r.start_date} to ${r.end_date} (${r.status.replace(/_/g, " ")})`, "It is cancelled");
      p.id = r.id;
      break;
    }
    case "check_in": {
      const emp = await myEmployeeId(user);
      if (!emp) throw new WorkflowError("NOT_FOUND", "No HR record yet; HR adds it.");
      const s = await stateOf(emp);
      title = s.state === "in" ? "Check out" : s.state === "out" ? "Check in" : "Back from the break";
      lines.push(`${title} now`);
      break;
    }
    case "attendance_correction": {
      const d = day(a.day);
      if (!d || !str(a.reason)) throw new WorkflowError("VALIDATION", "Give the day (YYYY-MM-DD) and a reason.");
      lines.push(`Day ${d}`, ...(hm(a.in_time) ? [`In at ${a.in_time}`] : []), ...(hm(a.out_time) ? [`Out at ${a.out_time}`] : []), `Reason: ${a.reason}`, "It goes to your lead, then HR");
      Object.assign(p, { day: d, inTime: hm(a.in_time), outTime: hm(a.out_time), reason: str(a.reason, 500) });
      break;
    }
    case "claim": {
      const d = day(a.date);
      const amount = Number(a.amount);
      if (!d || !(amount > 0) || !str(a.description)) throw new WorkflowError("VALIDATION", "Give the date, the amount and what it was for.");
      lines.push(`${amount.toLocaleString()} on ${d}`, String(a.description), "Add the receipt later on Profile, Pay and claims if asked");
      Object.assign(p, { date: d, amount, description: str(a.description, 300) });
      break;
    }
    case "read_notifications": {
      const n = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL", user.id))?.c ?? 0);
      lines.push(`${n} unread notification${n === 1 ? "" : "s"} marked read`);
      break;
    }
    case "decide_leave": {
      const r = await get<{ id: string; full_name: string; start_date: string; end_date: string; approver_id: string | null; status: string }>(
        "SELECT r.id, e.full_name, r.start_date, r.end_date, r.approver_id, r.status FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE r.id = ?",
        a.request_id,
      );
      const dec = decision(a.decision);
      if (!r || !dec) throw new WorkflowError("NOT_FOUND", "Leave request not found, or no decision (approve or reject).");
      if (dec === "reject" && !str(a.note)) throw new WorkflowError("VALIDATION", "Say why it is rejected.");
      title = dec === "approve" ? "Approve leave" : "Reject leave";
      lines.push(`${r.full_name}: ${r.start_date} to ${r.end_date}`, ...(a.note ? [`Note: ${a.note}`] : []));
      Object.assign(p, { id: r.id, decision: dec, note: str(a.note, 500) });
      break;
    }
    case "decide_claim": {
      const c = await get<{ id: string; name: string; amount: number; description: string }>("SELECT c.id, u.name, c.amount, c.description FROM fin_claims c JOIN users u ON u.id = c.user_id WHERE c.id = ?", a.claim_id);
      const dec = decision(a.decision);
      if (!c || !dec) throw new WorkflowError("NOT_FOUND", "Claim not found, or no decision (approve or reject).");
      if (dec === "reject" && !str(a.note)) throw new WorkflowError("VALIDATION", "Say why it is not approved.");
      title = dec === "approve" ? "Approve a claim" : "Reject a claim";
      lines.push(`${c.name}: ${Number(c.amount).toLocaleString()} for ${c.description}`, ...(a.note ? [`Note: ${a.note}`] : []));
      Object.assign(p, { id: c.id, decision: dec, note: str(a.note, 500) });
      break;
    }
    case "decide_correction": {
      const c = await get<{ id: string; full_name: string; day: string; in_time: string | null; out_time: string | null }>("SELECT c.id, e.full_name, c.day, c.in_time, c.out_time FROM att_corrections c JOIN employees e ON e.id = c.employee_id WHERE c.id = ?", a.correction_id);
      const dec = decision(a.decision);
      if (!c || !dec) throw new WorkflowError("NOT_FOUND", "Correction not found, or no decision (approve or reject).");
      title = dec === "approve" ? "Approve a correction" : "Reject a correction";
      lines.push(`${c.full_name}: ${c.day}${c.in_time ? `, in ${c.in_time}` : ""}${c.out_time ? `, out ${c.out_time}` : ""}`, ...(a.note ? [`Note: ${a.note}`] : []));
      Object.assign(p, { id: c.id, decision: dec, note: str(a.note, 500) });
      break;
    }
    case "run_routine": {
      const r = await get<{ id: string; name: string; steps: string; owner_id: string; shared: string }>("SELECT id, name, steps, owner_id, shared FROM assistant_routines WHERE id = ?", a.routine_id);
      if (!r || (r.owner_id !== user.id && r.shared === "none")) throw new WorkflowError("NOT_FOUND", "Routine not found.");
      title = `Run "${r.name}"`;
      lines.push(`${(JSON.parse(r.steps) as unknown[]).length} recorded steps, done in your browser as you would`, "Approval first if Admin asks for it");
      p.id = r.id;
      break;
    }
    case "hr_mark_day":
    case "hr_log_attendance":
    case "hr_adjust_leave":
    case "hr_open_case":
    case "hr_one_on_one":
    case "hr_save_goal":
    case "hr_start_onboarding": {
      const e = await findEmployee(user, a.employee);
      p.employeeId = e.id;
      lines.push(`${e.name}${e.code ? ` (${e.code})` : ""}`);
      if (kind === "hr_mark_day") {
        const d = day(a.day);
        const st = String(a.status ?? "");
        if (!d || !["present", "late", "half_day", "absent", "leave"].includes(st)) throw new WorkflowError("VALIDATION", "Give the day (YYYY-MM-DD) and the status: present, late, half_day, absent or leave.");
        lines.push(`${d}: ${st.replace("_", " ")}`, ...(hm(a.in_time) ? [`In ${a.in_time}`] : []), ...(hm(a.out_time) ? [`Out ${a.out_time}`] : []), ...(str(a.note) ? [`Note: ${a.note}`] : []));
        Object.assign(p, { day: d, status: st, inTime: hm(a.in_time), outTime: hm(a.out_time), note: str(a.note, 300) });
      } else if (kind === "hr_log_attendance") {
        const d = day(a.day);
        const k = String(a.kind ?? "");
        if (!d || !hm(a.time) || !["in", "out", "break_start", "break_end", "lunch_start", "lunch_end"].includes(k) || !str(a.note)) throw new WorkflowError("VALIDATION", "Give the day, the kind (in or out...), the time HH:MM and a reason.");
        lines.push(`${d} at ${a.time}: ${k.replace("_", " ")}`, `Reason: ${a.note}`, "The person is told; it is in the audit log");
        Object.assign(p, { day: d, eventKind: k, time: hm(a.time), note: str(a.note, 300) });
      } else if (kind === "hr_adjust_leave") {
        const types = await leaveTypes();
        const t = types.find((x) => x.key === a.leave_type || x.label.toLowerCase() === String(a.leave_type ?? "").toLowerCase());
        const n = Number(a.days);
        if (!t || !n || !str(a.note)) throw new WorkflowError("VALIDATION", `Give the leave type (${types.map((x) => x.label).join(", ")}), the days and why.`);
        const year = Number(a.year) || new Date().getUTCFullYear();
        lines.push(`${n > 0 ? "Add" : "Take away"} ${Math.abs(n)} days of ${t.label} for ${year}`, `Reason: ${a.note}`);
        Object.assign(p, { typeKey: t.key, days: n, year, note: str(a.note, 300) });
      } else if (kind === "hr_open_case") {
        const k = String(a.kind ?? "");
        if (!["disciplinary", "grievance", "investigation"].includes(k) || !str(a.title)) throw new WorkflowError("VALIDATION", "Give the kind (disciplinary, grievance or investigation) and a short title.");
        lines.push(`${k} case: ${a.title}`, "Only HR managers see it");
        Object.assign(p, { caseKind: k, title: str(a.title, 160), note: str(a.note, 1000) });
      } else if (kind === "hr_save_goal") {
        const t = str(a.title, 200);
        if (!t) throw new WorkflowError("VALIDATION", "Goal title is required.");
        const prog = typeof a.progress === "number" ? Math.max(0, Math.min(100, a.progress)) : 0;
        lines.push(`Goal: "${t}"`, ...(day(a.due) ? [`Due: ${a.due}`] : []), `Progress: ${prog}%`);
        Object.assign(p, { title: t, detail: str(a.detail, 2000), due: day(a.due), progress: prog });
      } else if (kind === "hr_start_onboarding") {
        const k = String(a.kind ?? "").toLowerCase();
        if (k !== "onboarding" && k !== "offboarding") throw new WorkflowError("VALIDATION", "Kind must be onboarding or offboarding.");
        lines.push(`Start ${k} checklist`);
        Object.assign(p, { checklistKind: k });
      } else {
        const d = day(a.date) ?? new Date().toISOString().slice(0, 10);
        if (!str(a.notes)) throw new WorkflowError("VALIDATION", "Give the meeting's notes.");
        lines.push(`One-to-one on ${d}`, String(a.notes).slice(0, 200), ...(str(a.actions) ? [`Actions: ${a.actions}`] : []));
        Object.assign(p, { date: d, notes: str(a.notes, 3000), actions: str(a.actions, 1000) });
      }
      break;
    }
    case "hr_update_case": {
      const cid = str(a.case_id);
      if (!cid) throw new WorkflowError("VALIDATION", "Case ID is required.");
      const st = str(a.status);
      lines.push(`Update case ${cid}`, ...(st ? [`Status: ${st}`] : []), ...(a.note ? [`Note: ${a.note}`] : []), ...(a.outcome ? [`Outcome: ${a.outcome}`] : []));
      Object.assign(p, { caseId: cid, status: st, note: str(a.note, 2000), outcome: str(a.outcome, 2000) });
      break;
    }
    case "hr_schedule_interview": {
      const aid = str(a.applicant_id);
      if (!aid) throw new WorkflowError("VALIDATION", "Applicant ID is required.");
      const when = str(a.scheduled_at);
      if (!when) throw new WorkflowError("VALIDATION", "Interview date and time required (YYYY-MM-DD HH:MM).");
      const dur = Number(a.duration_min) || 45;
      lines.push(`Interview on ${when} (${dur} mins)`, ...(a.location ? [`Location: ${a.location}`] : []));
      Object.assign(p, { applicantId: aid, scheduledAt: when, durationMin: dur, location: str(a.location, 200) });
      break;
    }
    case "hr_move_applicant": {
      const aid = str(a.applicant_id);
      if (!aid) throw new WorkflowError("VALIDATION", "Applicant ID is required.");
      const stage = str(a.stage);
      if (!stage || !["applied", "screening", "interview", "offer", "hired", "rejected"].includes(stage)) {
        throw new WorkflowError("VALIDATION", "Stage must be applied, screening, interview, offer, hired, or rejected.");
      }
      lines.push(`Move applicant to "${stage}"`, ...(a.reason ? [`Reason: ${a.reason}`] : []));
      Object.assign(p, { applicantId: aid, stage, reason: str(a.reason, 500) });
      break;
    }
    case "hr_issue_equipment": {
      const eqId = str(a.equipment_id);
      if (!eqId) throw new WorkflowError("VALIDATION", "Equipment ID is required.");
      const emp = await findEmployee(user, a.employee);
      lines.push(`Assign equipment to ${emp.name} (${emp.code})`, ...(day(a.due_back) ? [`Due back: ${a.due_back}`] : []));
      Object.assign(p, { equipmentId: eqId, employeeId: emp.id, dueBack: day(a.due_back), note: str(a.note, 500) });
      break;
    }
    case "hr_return_equipment": {
      const eqId = str(a.equipment_id);
      if (!eqId) throw new WorkflowError("VALIDATION", "Equipment ID is required.");
      const cond = str(a.condition) ?? "good";
      lines.push(`Record return for equipment (condition: ${cond})`, ...(a.note ? [`Note: ${a.note}`] : []));
      Object.assign(p, { equipmentId: eqId, condition: cond, note: str(a.note, 500) });
      break;
    }
    case "hr_announce": {
      const t = str(a.title, 160);
      const b = str(a.body, 8000);
      if (!t || !b) throw new WorkflowError("VALIDATION", "Give the announcement's title and text.");
      const depKey = str(a.department, 60);
      lines.push(t, b.slice(0, 200), depKey ? `To the ${depKey} department` : "To everyone", a.kind === "policy" ? "As a policy everyone confirms" : "As news");
      Object.assign(p, { title: t, body: b, policy: a.kind === "policy", department: depKey });
      break;
    }
    case "hr_assign_course": {
      const c = await get<{ id: string; title: string }>("SELECT id, title FROM courses WHERE active = 1 AND lower(title) LIKE lower(?) ORDER BY title LIMIT 1", `%${String(a.course ?? "").trim()}%`);
      if (!c || !String(a.course ?? "").trim()) throw new WorkflowError("NOT_FOUND", "No course with that title (HR, Growth, Training).");
      const names = String(a.employees ?? "").split(/[,;]/).map((x) => x.trim()).filter(Boolean);
      if (!names.length) throw new WorkflowError("VALIDATION", "Name the people.");
      const ids: string[] = [];
      for (const n of names.slice(0, 50)) ids.push((await findEmployee(user, n)).id);
      lines.push(`"${c.title}" for ${names.join(", ")}`, ...(day(a.due) ? [`Due ${a.due}`] : []));
      Object.assign(p, { courseId: c.id, employeeIds: ids, due: day(a.due) });
      break;
    }
    case "hr_open_job": {
      const t = str(a.title, 120);
      if (!t) throw new WorkflowError("VALIDATION", "Give the job title.");
      const n = Math.max(1, Math.min(50, Number(a.positions) || 1));
      lines.push(t, `${n} position${n > 1 ? "s" : ""}`, ...(str(a.department) ? [`Department: ${a.department}`] : []), ...(day(a.closes) ? [`Closes ${a.closes}`] : []), "Opened as a draft in HR, Hiring");
      Object.assign(p, { title: t, positions: n, department: str(a.department, 60), description: str(a.description, 4000), closes: day(a.closes) });
      break;
    }
    case "lead_handover": {
      const stage = String(a.stage || user.activeRole || "").toLowerCase();
      const validStages = ["recording", "editing", "uploading"];
      const targetStage = validStages.includes(stage) ? stage : user.leads.find((s) => validStages.includes(s)) || "recording";
      const grade = a.grade ? String(a.grade).trim() : null;
      const subject = a.subject ? String(a.subject).trim() : null;
      const rawCodes = a.item_codes ? (Array.isArray(a.item_codes) ? a.item_codes : String(a.item_codes).split(/[\s,]+/)).filter(Boolean) : [];

      let sql = `
        SELECT i.id, i.code, i.title, i.grade, i.subject, i.stage_status
        FROM items i
        JOIN stage_attempts a ON a.id = i.current_attempt_id
        WHERE i.lifecycle = 'in_production' AND a.stage = ?
      `;
      const params: any[] = [targetStage];
      if (grade) {
        sql += " AND i.grade = ?";
        params.push(grade);
      }
      if (subject) {
        sql += " AND (i.subject ILIKE ? OR i.title ILIKE ?)";
        params.push(`%${subject}%`, `%${subject}%`);
      }
      if (rawCodes.length > 0) {
        sql += ` AND i.code IN (${placeholders(rawCodes.length)})`;
        params.push(...rawCodes);
      }
      sql += " ORDER BY i.grade, i.subject, i.code LIMIT 50";

      const items = await all<{ id: string; code: string; title: string; grade: string; subject: string; stage_status: string }>(sql, ...params);
      if (!items.length) {
        throw new WorkflowError("NOT_FOUND", `No items found in stage "${targetStage}" matching ${grade ? `Grade ${grade} ` : ""}${subject ? `Subject "${subject}"` : ""}`);
      }

      const nextStageName = targetStage === "recording" ? "Editing" : targetStage === "editing" ? "Uploading" : "Publication";
      title = `Hand over ${items.length} parts (${targetStage} → ${nextStageName})`;
      lines.push(
        `Stage: ${targetStage} → ${nextStageName}`,
        `Batch: ${items.length} parts`,
        ...(grade ? [`Grade: ${grade}`] : []),
        ...(subject ? [`Subject: ${subject}`] : []),
        `Parts: ${items.slice(0, 8).map((x) => x.code).join(", ")}${items.length > 8 ? ` and ${items.length - 8} more` : ""}`,
        `Note: ${a.note || "Handover prepared by Assistant"}`
      );
      Object.assign(p, {
        stage: targetStage,
        itemIds: items.map((x) => x.id),
        note: a.note || `Handover prepared by Assistant (${items.length} parts)`,
        toUserId: a.receiver_id || null,
      });
      break;
    }
    case "lead_assign_batch": {
      const stage = String(a.stage || user.activeRole || "").toLowerCase();
      const validStages = ["recording", "editing", "uploading"];
      const targetStage = validStages.includes(stage) ? stage : user.leads.find((s) => validStages.includes(s)) || "recording";
      const who = await nameOf(a.assignee_id);
      if (!who) throw new WorkflowError("NOT_FOUND", "Assignee not found.");
      const grade = a.grade ? String(a.grade).trim() : null;
      const subject = a.subject ? String(a.subject).trim() : null;
      const rawCodes = a.item_codes ? (Array.isArray(a.item_codes) ? a.item_codes : String(a.item_codes).split(/[\s,]+/)).filter(Boolean) : [];

      let sql = `
        SELECT i.id, i.code, i.title, i.grade, i.subject, a.id as attempt_id
        FROM items i
        JOIN stage_attempts a ON a.id = i.current_attempt_id
        WHERE i.lifecycle = 'in_production' AND a.stage = ?
      `;
      const params: any[] = [targetStage];
      if (grade) {
        sql += " AND i.grade = ?";
        params.push(grade);
      }
      if (subject) {
        sql += " AND (i.subject ILIKE ? OR i.title ILIKE ?)";
        params.push(`%${subject}%`, `%${subject}%`);
      }
      if (rawCodes.length > 0) {
        sql += ` AND i.code IN (${placeholders(rawCodes.length)})`;
        params.push(...rawCodes);
      }
      sql += " LIMIT 50";

      const items = await all<{ id: string; code: string; title: string; attempt_id: string }>(sql, ...params);
      if (!items.length) {
        throw new WorkflowError("NOT_FOUND", `No parts found in stage "${targetStage}" matching criteria.`);
      }

      title = `Assign ${items.length} parts to ${who}`;
      lines.push(
        `Stage: ${targetStage}`,
        `Assignee: ${who}`,
        `Count: ${items.length} parts`,
        `Parts: ${items.slice(0, 8).map((x) => x.code).join(", ")}${items.length > 8 ? ` and ${items.length - 8} more` : ""}`
      );
      Object.assign(p, {
        stage: targetStage,
        assigneeId: a.assignee_id,
        attemptIds: items.map((x) => x.attempt_id),
      });
      break;
    }
    default: {
      // Department work.
      const d = await needDept(user, a.department);
      p.dept = d.dept;
      const cfg = await getDeptConfig(d.dept);
      if (kind === "create_task") {
        const t = str(a.title, 200);
        if (!t) throw new WorkflowError("VALIDATION", "A title is needed.");
        const who = a.assignee_id ? await nameOf(a.assignee_id) : null;
        if (a.assignee_id && !who) throw new WorkflowError("NOT_FOUND", "Unknown assignee id.");
        const pr = a.priority ? cfg.priorities.find((x) => x.key === a.priority || x.label.toLowerCase() === String(a.priority).toLowerCase()) : null;
        title = `New ${cfg.names.task.toLowerCase()} in ${d.title}`;
        lines.push(t, ...(a.description ? [String(a.description).slice(0, 160)] : []), who ? `For ${who}` : "Not assigned yet", ...(day(a.due) ? [`Due ${a.due}`] : []), ...(pr ? [`Priority ${pr.label}`] : []));
        Object.assign(p, { title: t, description: str(a.description), assigneeId: a.assignee_id ?? null, due: day(a.due), priority: pr?.key ?? null });
        break;
      }
      if (kind === "request_department") {
        const t = str(a.title, 200);
        const allowed = cfg.types.filter((x) => x.active && (!cfg.intake.types.length || cfg.intake.types.includes(x.key)));
        const ty = allowed.find((x) => x.key === a.request_type || x.label.toLowerCase() === String(a.request_type ?? "").toLowerCase()) ?? allowed[0];
        if (!t || !ty) throw new WorkflowError("VALIDATION", `Say what you need${allowed.length ? `; kinds: ${allowed.map((x) => x.label).join(", ")}` : ""}.`);
        title = `Ask ${d.title}`;
        lines.push(t, `As: ${ty.label}`, ...(day(a.due) ? [`Needed by ${a.due}`] : []), "Their lead plans it; you can follow it in Requests");
        Object.assign(p, { title: t, description: str(a.description), type: ty.key, due: day(a.due) });
        break;
      }
      const task = await findTask(user, d.dept, a.task_id);
      p.taskId = task.id;
      lines.push(`${task.code} ${task.title}`);
      if (kind === "start_task") lines.push("It moves to In progress and your timer starts");
      else if (kind === "finish_task") lines.push("Marked done (then send it to your lead if your department reviews work)");
      else if (kind === "send_task") lines.push("Sent to your lead for review");
      else if (kind === "approve_task") lines.push("Approved; it moves on to the next stage");
      else if (kind === "move_task") {
        const st = cfg.statuses.find((x) => x.key === a.status || x.label.toLowerCase() === String(a.status ?? "").toLowerCase());
        if (!st) throw new WorkflowError("VALIDATION", `Unknown status. Statuses: ${cfg.statuses.map((x) => `${x.label} (${x.key})`).join(", ")}`);
        lines.push(`From ${cfg.statuses.find((x) => x.key === task.status)?.label ?? task.status} to ${st.label}`);
        p.status = st.key;
      } else if (kind === "assign_task") {
        const who = await nameOf(a.assignee_id);
        if (!who) throw new WorkflowError("NOT_FOUND", "Unknown assignee id.");
        lines.push(`To ${who}`);
        p.assigneeId = a.assignee_id;
      } else if (kind === "update_task") {
        const pr = a.priority ? cfg.priorities.find((x) => x.key === a.priority || x.label.toLowerCase() === String(a.priority).toLowerCase()) : null;
        if (!pr && !day(a.due)) throw new WorkflowError("VALIDATION", "Give a priority or a due date.");
        if (pr) lines.push(`Priority ${pr.label}`);
        if (day(a.due)) lines.push(`Due ${a.due}`);
        Object.assign(p, { priority: pr?.key ?? null, due: day(a.due) });
      } else if (kind === "comment_task" || kind === "return_task") {
        const text = str(a.text ?? a.note);
        if (!text) throw new WorkflowError("VALIDATION", kind === "return_task" ? "Say what to change." : "The comment is empty.");
        lines.push(kind === "return_task" ? `Returned: "${text.slice(0, 300)}"` : `"${text.slice(0, 300)}"`);
        p.text = text;
      } else throw new WorkflowError("VALIDATION", `Unknown action "${kind}".`);
    }
  }
  return { title, lines, params: p };
}

// Runs a prepared operation as the person (after Confirm). Returns what to say and where to look.
export async function executeOp(user: Viewer, p: Record<string, unknown>): Promise<{ done: string; href: string | null; routine?: string }> {
  const s = (k: string) => (p[k] === null || p[k] === undefined ? null : String(p[k]));
  switch (p.kind) {
    case "leave":
      await requestLeave(user, { typeKey: s("typeKey")!, startDate: s("start")!, endDate: s("end")!, reason: s("reason") });
      return { done: "Leave asked for", href: "/profile?tab=leave" };
    case "cancel_leave":
      await cancelLeave(user, s("id")!);
      return { done: "Leave cancelled", href: "/profile?tab=leave" };
    case "check_in":
      await punchSelf(user, {});
      return { done: "Recorded", href: "/attendance" };
    case "attendance_correction":
      await requestCorrection(user, { day: s("day")!, inTime: s("inTime"), outTime: s("outTime"), reason: s("reason")! });
      return { done: "Correction asked for", href: "/attendance?tab=corrections" };
    case "claim":
      await submitClaim(user, { date: s("date")!, amount: Number(p.amount), description: s("description")! });
      return { done: "Claim sent", href: "/profile?tab=pay" };
    case "read_notifications":
      await run("UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL", nowIso(), user.id);
      return { done: "Marked read", href: "/notifications" };
    case "decide_leave":
      await decideLeave(user, s("id")!, { decision: s("decision") as "approve" | "reject", note: s("note") });
      return { done: s("decision") === "approve" ? "Leave approved" : "Leave rejected", href: "/approvals" };
    case "decide_claim":
      await decideClaim(user, s("id")!, { approve: s("decision") === "approve", note: s("note") ?? undefined });
      return { done: s("decision") === "approve" ? "Claim approved" : "Claim rejected", href: "/approvals" };
    case "decide_correction":
      await decideCorrection(user, s("id")!, { decision: s("decision") as "approve" | "reject", note: s("note") });
      return { done: s("decision") === "approve" ? "Correction approved" : "Correction rejected", href: "/approvals" };
    case "run_routine":
      return { done: "Routine ready", href: null, routine: s("id")! };
    case "hr_mark_day": {
      const { markDay } = await import("./attendance");
      await markDay(user, { employeeId: s("employeeId")!, day: s("day")!, status: s("status") as "present", inTime: s("inTime"), outTime: s("outTime"), note: s("note") });
      return { done: "Day recorded", href: "/attendance?tab=team" };
    }
    case "hr_log_attendance": {
      const { logEvent } = await import("./attendance-admin");
      await logEvent(user, { employeeId: s("employeeId")!, day: s("day")!, kind: s("eventKind") as "in", time: s("time")!, note: s("note")! });
      return { done: "Attendance logged", href: "/attendance?tab=records" };
    }
    case "hr_adjust_leave": {
      const { adjustBalance } = await import("./leave");
      await adjustBalance(user, { employeeId: s("employeeId")!, typeKey: s("typeKey")!, year: Number(p.year), days: Number(p.days), note: s("note")! });
      return { done: "Leave balance changed", href: "/hr?tab=leave" };
    }
    case "hr_open_case": {
      const { openCase } = await import("./hr-growth");
      await openCase(user, { employeeId: s("employeeId")!, kind: s("caseKind")!, title: s("title")!, note: s("note") });
      return { done: "Case opened", href: "/hr?tab=cases" };
    }
    case "hr_one_on_one": {
      const { addOneOnOne } = await import("./hr-growth");
      await addOneOnOne(user, { employeeId: s("employeeId")!, heldOn: s("date")!, notes: s("notes"), actions: s("actions") });
      return { done: "One-to-one recorded", href: `/hr/${s("employeeId")}` };
    }
    case "hr_assign_course": {
      const { assignCourse } = await import("./hr-growth");
      await assignCourse(user, s("courseId")!, { employeeIds: p.employeeIds as string[], dueDate: s("due") });
      return { done: "Training assigned", href: "/hr?tab=growth" };
    }
    case "hr_open_job": {
      const { saveOpening } = await import("./hr-hiring");
      await saveOpening(user, { title: s("title")!, department: s("department"), positions: Number(p.positions), description: s("description"), closesOn: s("closes"), status: "draft" });
      return { done: "Job opening drafted", href: "/hr?tab=hiring" };
    }
    case "hr_announce": {
      const { saveAnnouncement } = await import("./announcements");
      const dep = s("department");
      await saveAnnouncement(user, { title: s("title")!, body: s("body")!, kind: p.policy ? "policy" : "news", audience: { all: !dep, departments: dep ? [dep] : [], roles: [] }, notify: true });
      return { done: "Announcement posted", href: "/announcements" };
    }
    case "hr_save_goal": {
      const { saveGoal } = await import("./hr-growth");
      await saveGoal(user, { employeeId: s("employeeId")!, title: s("title")!, detail: s("detail"), dueDate: s("due"), progress: typeof p.progress === "number" ? p.progress : 0 });
      return { done: "Employee goal saved", href: `/hr/${s("employeeId")}` };
    }
    case "hr_update_case": {
      const { updateCase } = await import("./hr-growth");
      await updateCase(user, s("caseId")!, { status: s("status") ?? undefined, note: s("note"), outcome: s("outcome") });
      return { done: "HR case updated", href: "/hr?tab=cases" };
    }
    case "hr_schedule_interview": {
      const { scheduleInterview } = await import("./hr-hiring");
      await scheduleInterview(user, s("applicantId")!, { scheduledAt: s("scheduledAt")!, durationMin: Number(p.durationMin) || 45, location: s("location"), interviewerIds: [user.id] });
      return { done: "Interview scheduled", href: "/hr?tab=hiring" };
    }
    case "hr_move_applicant": {
      const { moveApplicant } = await import("./hr-hiring");
      await moveApplicant(user, s("applicantId")!, { stage: s("stage")!, reason: s("reason") });
      return { done: `Applicant moved to ${s("stage")}`, href: "/hr?tab=hiring" };
    }
    case "hr_start_onboarding": {
      const { startChecklist } = await import("./hr-hiring");
      await startChecklist(user, s("employeeId")!, s("checklistKind") as "onboarding" | "offboarding");
      return { done: `${s("checklistKind")} checklist started`, href: "/hr?tab=checklists" };
    }
    case "hr_issue_equipment": {
      const { issueEquipment } = await import("./hr");
      await issueEquipment(user, s("equipmentId")!, { employeeId: s("employeeId")!, dueBack: s("dueBack"), note: s("note") });
      return { done: "Equipment issued to employee", href: "/hr?tab=equipment" };
    }
    case "hr_return_equipment": {
      const { returnEquipment } = await import("./hr");
      await returnEquipment(user, s("equipmentId")!, { condition: s("condition") ?? "good", note: s("note") });
      return { done: "Equipment return recorded", href: "/hr?tab=equipment" };
    }
    case "lead_handover": {
      const { createHandover } = await import("./editorial");
      const r = await createHandover(user, {
        itemIds: (p.itemIds as string[]) || [],
        toUserId: (p.toUserId as string) || null,
        note: (p.note as string) || "Prepared by assistant",
      });
      const okCount = r.results.filter((x) => x.ok).length;
      return { done: `Handover created: ${okCount} items handed over`, href: "/handovers" };
    }
    case "lead_assign_batch": {
      const attemptIds = (p.attemptIds as string[]) || [];
      const assigneeId = p.assigneeId as string;
      for (const attId of attemptIds) {
        await run("UPDATE stage_attempts SET owner_id = ?, updated_at = ? WHERE id = ?", assigneeId, nowIso(), attId);
      }
      return { done: `Assigned ${attemptIds.length} parts`, href: "/pipeline" };
    }
  }
  const d = s("dept")!;
  const id = s("taskId");
  switch (p.kind) {
    case "create_task": {
      const tid = await saveTask(user, d, { title: s("title")!, description: s("description"), assigneeId: s("assigneeId"), dueDate: s("due"), ...(s("priority") ? { priority: s("priority")! } : {}) });
      return { done: "Created", href: `${deptPath(d)}/list?task=${tid}` };
    }
    case "request_department":
      await createRequest(user, d, { title: s("title")!, description: s("description"), type: s("type")!, dueDate: s("due") });
      return { done: "Request sent", href: "/requests" };
    case "start_task":
      await flowStart(user, d, id!).catch(async (e) => {
        const st = (await getDeptConfig(d)).statuses.find((x) => x.category === "active");
        if (!st) throw e;
        await moveTask(user, d, id!, st.key, null);
      });
      return { done: "Started", href: deptPath(d) };
    case "finish_task":
      // With a flow: Done (starting it first when it was not started); without one: the first done status.
      await flowDone(user, d, id!).catch(async (e) => {
        const cfg = await getDeptConfig(d);
        if (cfg.flow.on) {
          await flowStart(user, d, id!).catch(() => {});
          return await flowDone(user, d, id!);
        }
        const st = cfg.statuses.find((x) => x.category === "done");
        if (!st) throw e;
        await moveTask(user, d, id!, st.key, null);
      });
      return { done: "Marked done", href: deptPath(d) };
    case "send_task":
      await flowSend(user, d, [id!]);
      return { done: "Sent to the lead", href: deptPath(d) };
    case "approve_task":
      await flowApprove(user, d, [id!]);
      return { done: "Approved", href: deptPath(d) };
    case "return_task":
      await flowReturn(user, d, id!, s("text")!);
      return { done: "Returned", href: deptPath(d) };
    case "move_task":
      await moveTask(user, d, id!, s("status")!, null);
      return { done: "Moved", href: deptPath(d) };
    case "assign_task":
      await bulkTasks(user, d, [id!], { assigneeId: s("assigneeId") });
      return { done: "Assigned", href: deptPath(d) };
    case "update_task":
      await bulkTasks(user, d, [id!], { ...(s("priority") ? { priority: s("priority")! } : {}), ...(s("due") ? { dueDate: s("due") } : {}) });
      return { done: "Updated", href: deptPath(d) };
    case "comment_task":
      await addTaskComment(user, d, id!, s("text")!);
      return { done: "Comment added", href: deptPath(d) };
  }
  throw new WorkflowError("VALIDATION", "Unknown action.");
}

// What waits for the person's decision (for the AI's my_approvals).
export async function myApprovals(user: Viewer) {
  const leave = await all<{ id: string; full_name: string; start_date: string; end_date: string; type_key: string }>(
    "SELECT r.id, e.full_name, r.start_date, r.end_date, r.type_key FROM leave_requests r JOIN employees e ON e.id = r.employee_id WHERE r.status = 'pending_lead' AND r.approver_id = ? ORDER BY r.start_date LIMIT 30",
    user.id,
  );
  const claims = await all<{ id: string; name: string; amount: number; description: string; date: string }>(
    "SELECT c.id, u.name, c.amount, c.description, c.date FROM fin_claims c JOIN users u ON u.id = c.user_id WHERE c.status = 'submitted' AND c.approver_id = ? ORDER BY c.date LIMIT 30",
    user.id,
  );
  const corrections = await all<{ id: string; full_name: string; day: string; reason: string }>(
    `SELECT c.id, e.full_name, c.day, c.reason FROM att_corrections c JOIN employees e ON e.id = c.employee_id WHERE (c.status = 'pending_lead' AND c.approver_id = ?)${can(user, "attendance.manage") ? " OR c.status = 'pending_hr'" : ""} ORDER BY c.day LIMIT 30`,
    user.id,
  );
  return { leave, claims, corrections };
}
