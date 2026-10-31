// HR: employee records, reporting lines, documents with expiry reminders, and the equipment register.
// HR (hr.access) sees and edits everyone; salary, ID, tax and bank details need hr.sensitive. Each person sees their
// own record and can update their contact details; line managers see their team's job and contact details only.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { customDepartments } from "./departments";
import { can, listUsers, type AppUser } from "./users";
import { DEPARTMENT_LABELS, DEPARTMENT_ROLES, ROLE_LABELS, type Department } from "@/lib/domain";
import {
  CONDITIONS,
  DOC_KINDS,
  DOC_KIND_LABELS,
  EMPLOYEE_STATUSES,
  EMPLOYMENT_TYPES,
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_STATUSES,
  REMIND_CONTRACT_DAYS,
  REMIND_DOC_DAYS,
  REMIND_PROBATION_DAYS,
  SELF_DOC_KINDS,
  type Condition,
  type DocKind,
  type EmergencyContact,
  type EmployeeStatus,
  type EmploymentType,
  type EquipmentCategory,
  type EquipmentStatus,
} from "@/lib/hr";

const DAY = 864e5;
export const MAX_HR_FILE = 8 * 1024 * 1024;

export type HrRights = { hr: boolean; manage: boolean; sensitive: boolean };
export const hrRights = (u: AppUser): HrRights => ({ hr: can(u, "hr.access"), manage: can(u, "hr.manage"), sensitive: can(u, "hr.sensitive") });

function needHr(u: AppUser) {
  if (!can(u, "hr.access")) throw new WorkflowError("FORBIDDEN", "Only HR can do this.");
}

const clean = (v: unknown, max = 300) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};
const day = (v: unknown) => {
  const s = clean(v, 10);
  if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new WorkflowError("VALIDATION", "Dates must be in the form YYYY-MM-DD.");
  return s;
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

// ---------------------------------------------------------------------------
// Departments, reporting lines
// ---------------------------------------------------------------------------

export async function hrDepartments(): Promise<{ key: string; label: string }[]> {
  const built = (Object.keys(DEPARTMENT_LABELS) as Department[]).map((k) => ({ key: k, label: DEPARTMENT_LABELS[k] }));
  const custom = (await customDepartments()).map((d) => ({ key: d.key, label: d.title }));
  return [...built, ...custom, { key: "hr", label: "HR" }, { key: "management", label: "Management" }];
}

export async function myEmployeeId(user: AppUser) {
  return (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", user.id))?.id ?? null;
}

// Everyone who reports to this employee, directly or through others.
export async function teamOf(employeeId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(
    `WITH RECURSIVE t(id) AS (SELECT id FROM employees WHERE manager_id = ? UNION SELECT e.id FROM employees e JOIN t ON e.manager_id = t.id)
     SELECT id FROM t`,
    employeeId,
  );
  return rows.map((r) => r.id);
}

type View = "hr" | "self" | "team";
async function viewOf(user: AppUser, employeeId: string): Promise<View | null> {
  if (can(user, "hr.access")) return "hr";
  const me = await myEmployeeId(user);
  if (!me) return null;
  if (me === employeeId) return "self";
  return (await teamOf(me)).includes(employeeId) ? "team" : null;
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

type EmployeeRow = {
  id: string;
  code: string;
  user_id: string | null;
  full_name: string;
  preferred_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  birth_date: string | null;
  gender: string | null;
  emergency_contacts: string;
  job_title: string | null;
  department: string | null;
  manager_id: string | null;
  employment_type: EmploymentType;
  status: EmployeeStatus;
  location: string | null;
  start_date: string | null;
  probation_end: string | null;
  contract_end: string | null;
  end_date: string | null;
  end_reason: string | null;
  notes: string | null;
  updated_at: string;
};

export type EmployeeListRow = {
  id: string;
  code: string;
  name: string;
  jobTitle: string | null;
  department: string | null;
  managerId: string | null;
  managerName: string | null;
  employmentType: EmploymentType;
  status: EmployeeStatus;
  startDate: string | null;
  probationEnd: string | null;
  contractEnd: string | null;
  email: string | null;
  phone: string | null;
  userId: string | null;
  docsDue: number;
};

const displayName = (r: { full_name: string; preferred_name: string | null }) => r.preferred_name || r.full_name;

// HR sees everyone; anyone else sees the people who report to them.
export async function listEmployees(user: AppUser, opts: { includeLeft?: boolean } = {}): Promise<EmployeeListRow[]> {
  let ids: string[] | null = null;
  if (!can(user, "hr.access")) {
    const me = await myEmployeeId(user);
    ids = me ? await teamOf(me) : [];
    if (!ids.length) return [];
  }
  const soon = new Date(Date.now() + REMIND_DOC_DAYS * DAY).toISOString().slice(0, 10);
  const rows = await all<EmployeeRow & { manager_name: string | null; manager_preferred: string | null; docs_due: number }>(
    `SELECT e.*, m.full_name AS manager_name, m.preferred_name AS manager_preferred,
            (SELECT COUNT(*) FROM employee_documents d WHERE d.employee_id = e.id AND d.expires_at IS NOT NULL AND d.expires_at <= ?) AS docs_due
     FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
     WHERE (? = 1 OR e.status <> 'left') ${ids ? `AND e.id IN (${ids.map(() => "?").join(",")})` : ""}
     ORDER BY e.full_name`,
    soon,
    opts.includeLeft ? 1 : 0,
    ...(ids ?? []),
  );
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: displayName(r),
    jobTitle: r.job_title,
    department: r.department,
    managerId: r.manager_id,
    managerName: r.manager_name ? r.manager_preferred || r.manager_name : null,
    employmentType: r.employment_type,
    status: r.status,
    startDate: r.start_date,
    probationEnd: r.probation_end,
    contractEnd: r.contract_end,
    email: r.email,
    phone: r.phone,
    userId: r.user_id,
    docsDue: Number(r.docs_due ?? 0),
  }));
}

export type PrivateDetails = { salaryGrade: string | null; nationalId: string | null; tin: string | null; pensionNo: string | null; bankName: string | null; bankAccount: string | null };
export type EmployeeDoc = { id: string; kind: DocKind; title: string; name: string; size: number; expiresAt: string | null; createdAt: string };
export type HeldEquipment = { id: string; tag: string; name: string; category: EquipmentCategory; issuedAt: string | null; dueBack: string | null; condition: Condition };

export type EmployeeDetail = {
  view: View;
  rights: HrRights & { editContact: boolean; addDocs: DocKind[] };
  employee: {
    id: string;
    code: string;
    userId: string | null;
    fullName: string;
    preferredName: string | null;
    email: string | null;
    phone: string | null;
    jobTitle: string | null;
    department: string | null;
    managerId: string | null;
    managerName: string | null;
    employmentType: EmploymentType;
    status: EmployeeStatus;
    location: string | null;
    startDate: string | null;
    probationEnd: string | null;
    contractEnd: string | null;
    endDate: string | null;
    endReason: string | null;
    // Personal details: HR and the person only.
    address?: string | null;
    birthDate?: string | null;
    gender?: string | null;
    emergencyContacts?: EmergencyContact[];
    // HR only.
    notes?: string | null;
    updatedAt: string;
  };
  private: PrivateDetails | null;
  documents: EmployeeDoc[];
  equipment: HeldEquipment[];
  reports: { id: string; name: string; jobTitle: string | null }[];
};

export async function getEmployee(user: AppUser, id: string): Promise<EmployeeDetail | null> {
  const view = await viewOf(user, id);
  if (!view) return null;
  const e = await get<EmployeeRow>("SELECT * FROM employees WHERE id = ?", id);
  if (!e) return null;
  const rights = hrRights(user);
  const manager = e.manager_id ? await get<{ full_name: string; preferred_name: string | null }>("SELECT full_name, preferred_name FROM employees WHERE id = ?", e.manager_id) : null;
  const personal = view !== "team";
  const priv =
    view === "hr" && rights.sensitive
      ? await get<{ salary_grade: string | null; national_id: string | null; tin: string | null; pension_no: string | null; bank_name: string | null; bank_account: string | null }>(
          "SELECT * FROM employee_private WHERE employee_id = ?",
          id,
        )
      : null;
  const docs =
    view === "team"
      ? []
      : (
          await all<{ id: string; kind: DocKind; title: string; name: string; size: number; expires_at: string | null; created_at: string }>(
            "SELECT id, kind, title, name, size, expires_at, created_at FROM employee_documents WHERE employee_id = ? ORDER BY created_at DESC",
            id,
          )
        )
          .filter((d) => d.kind !== "id" || view === "self" || rights.sensitive)
          .map((d) => ({ id: d.id, kind: d.kind, title: d.title, name: d.name, size: Number(d.size), expiresAt: d.expires_at, createdAt: d.created_at }));
  const equipment = (
    await all<{ id: string; tag: string; name: string; category: EquipmentCategory; issued_at: string | null; due_back: string | null; condition: Condition }>(
      "SELECT id, tag, name, category, issued_at, due_back, condition FROM equipment WHERE holder_id = ? AND status = 'issued' ORDER BY tag",
      id,
    )
  ).map((q) => ({ id: q.id, tag: q.tag, name: q.name, category: q.category, issuedAt: q.issued_at, dueBack: q.due_back, condition: q.condition }));
  const reports = (
    await all<{ id: string; full_name: string; preferred_name: string | null; job_title: string | null }>(
      "SELECT id, full_name, preferred_name, job_title FROM employees WHERE manager_id = ? AND status <> 'left' ORDER BY full_name",
      id,
    )
  ).map((r) => ({ id: r.id, name: displayName(r), jobTitle: r.job_title }));
  return {
    view,
    rights: { ...rights, editContact: view === "hr" || view === "self", addDocs: view === "hr" ? DOC_KINDS.filter((k) => k !== "id" || rights.sensitive) : view === "self" ? SELF_DOC_KINDS : [] },
    employee: {
      id: e.id,
      code: e.code,
      userId: e.user_id,
      fullName: e.full_name,
      preferredName: e.preferred_name,
      email: e.email,
      phone: e.phone,
      jobTitle: e.job_title,
      department: e.department,
      managerId: e.manager_id,
      managerName: manager ? displayName(manager) : null,
      employmentType: e.employment_type,
      status: e.status,
      location: e.location,
      startDate: e.start_date,
      probationEnd: e.probation_end,
      contractEnd: e.contract_end,
      endDate: e.end_date,
      endReason: e.end_reason,
      ...(personal ? { address: e.address, birthDate: e.birth_date, gender: e.gender, emergencyContacts: parseJson<EmergencyContact[]>(e.emergency_contacts, []) } : {}),
      ...(view === "hr" ? { notes: e.notes } : {}),
      updatedAt: e.updated_at,
    },
    private: priv
      ? { salaryGrade: priv.salary_grade, nationalId: priv.national_id, tin: priv.tin, pensionNo: priv.pension_no, bankName: priv.bank_name, bankAccount: priv.bank_account }
      : rights.sensitive && view === "hr"
        ? { salaryGrade: null, nationalId: null, tin: null, pensionNo: null, bankName: null, bankAccount: null }
        : null,
    documents: docs,
    equipment,
    reports,
  };
}

export type EmployeeInput = {
  id?: string | null;
  userId?: string | null;
  fullName: string;
  preferredName?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  emergencyContacts?: EmergencyContact[];
  jobTitle?: string | null;
  department?: string | null;
  managerId?: string | null;
  employmentType?: string;
  status?: string;
  location?: string | null;
  startDate?: string | null;
  probationEnd?: string | null;
  contractEnd?: string | null;
  endDate?: string | null;
  endReason?: string | null;
  notes?: string | null;
  private?: Partial<PrivateDetails>;
};

const contacts = (v: unknown): EmergencyContact[] =>
  (Array.isArray(v) ? v : [])
    .map((c) => ({ name: clean(c?.name, 120) ?? "", relation: clean(c?.relation, 60) ?? "", phone: clean(c?.phone, 40) ?? "" }))
    .filter((c) => c.name || c.phone)
    .slice(0, 5);

async function nextCode() {
  const r = await get<{ m: number | null }>("SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) AS m FROM employees WHERE code ~ '^EMP-[0-9]+$'");
  return `EMP-${String(Number(r?.m ?? 0) + 1).padStart(3, "0")}`;
}

export async function saveEmployee(user: AppUser, input: EmployeeInput): Promise<string> {
  needHr(user);
  const rights = hrRights(user);
  const fullName = clean(input.fullName, 160);
  if (!fullName) throw new WorkflowError("VALIDATION", "Enter the person's full name.");
  const existing = input.id ? await get<EmployeeRow>("SELECT * FROM employees WHERE id = ?", input.id) : null;
  if (input.id && !existing) throw new WorkflowError("NOT_FOUND", "This employee no longer exists.");
  const status = oneOf(input.status, EMPLOYEE_STATUSES, existing?.status ?? "active");
  if (status === "left" && existing?.status !== "left") {
    if (!rights.manage) throw new WorkflowError("FORBIDDEN", "Only the HR Manager ends someone's employment.");
    if (!day(input.endDate)) throw new WorkflowError("VALIDATION", "Enter the last working day.");
  }
  const managerId = clean(input.managerId, 40);
  if (managerId) {
    if (managerId === input.id) throw new WorkflowError("VALIDATION", "A person cannot be their own line manager.");
    if (!(await get("SELECT 1 AS x FROM employees WHERE id = ?", managerId))) throw new WorkflowError("VALIDATION", "Choose a line manager from the list.");
    if (input.id && (await teamOf(input.id)).includes(managerId)) throw new WorkflowError("VALIDATION", "That person already reports to this employee, so they cannot be their line manager.");
  }
  const userId = clean(input.userId, 40);
  if (userId) {
    const taken = await get<{ id: string; full_name: string }>("SELECT id, full_name FROM employees WHERE user_id = ? AND id <> ?", userId, input.id ?? "");
    if (taken) throw new WorkflowError("VALIDATION", `That account is already linked to ${taken.full_name}.`);
  }
  const now = nowIso();
  const values = {
    user_id: userId,
    full_name: fullName,
    preferred_name: clean(input.preferredName, 80),
    email: clean(input.email, 200),
    phone: clean(input.phone, 40),
    address: clean(input.address, 400),
    birth_date: day(input.birthDate),
    gender: clean(input.gender, 30),
    emergency_contacts: JSON.stringify(contacts(input.emergencyContacts)),
    job_title: clean(input.jobTitle, 120),
    department: clean(input.department, 60),
    manager_id: managerId,
    employment_type: oneOf(input.employmentType, EMPLOYMENT_TYPES, existing?.employment_type ?? "full_time"),
    status,
    location: clean(input.location, 120),
    start_date: day(input.startDate),
    probation_end: day(input.probationEnd),
    contract_end: day(input.contractEnd),
    end_date: day(input.endDate),
    end_reason: clean(input.endReason, 400),
    notes: clean(input.notes, 4000),
  };
  const cols = Object.keys(values) as (keyof typeof values)[];
  let id = existing?.id;
  if (existing) {
    await run(`UPDATE employees SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ?, updated_by = ? WHERE id = ?`, ...cols.map((c) => values[c]), now, user.id, existing.id);
  } else {
    id = uid("emp_");
    await run(
      `INSERT INTO employees (id, code, ${cols.join(", ")}, created_at, updated_at, updated_by) VALUES (?, ?, ${cols.map(() => "?").join(", ")}, ?, ?, ?)`,
      id,
      await nextCode(),
      ...cols.map((c) => values[c]),
      now,
      now,
      user.id,
    );
  }
  // Sensitive details change only for people allowed to see them, and their values never go into the audit log.
  if (input.private && rights.sensitive) {
    const p = input.private;
    await run(
      `INSERT INTO employee_private (employee_id, salary_grade, national_id, tin, pension_no, bank_name, bank_account, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (employee_id) DO UPDATE SET salary_grade = excluded.salary_grade, national_id = excluded.national_id, tin = excluded.tin,
         pension_no = excluded.pension_no, bank_name = excluded.bank_name, bank_account = excluded.bank_account, updated_at = excluded.updated_at`,
      id,
      clean(p.salaryGrade, 40),
      clean(p.nationalId, 60),
      clean(p.tin, 40),
      clean(p.pensionNo, 40),
      clean(p.bankName, 80),
      clean(p.bankAccount, 60),
      now,
    );
  }
  const changed = existing ? cols.filter((c) => String(existing[c] ?? "") !== String(values[c] ?? "")) : [];
  await audit(
    { actor: user },
    {
      itemId: id,
      action: "hr.employee",
      summary: existing
        ? `${user.name} updated ${fullName}'s record${changed.length ? ` (${changed.map((c) => c.replace(/_/g, " ")).join(", ")})` : ""}${input.private && rights.sensitive ? " and private details" : ""}`
        : `${user.name} added ${fullName} to HR records`,
    },
  );
  return id!;
}

// Self-service: a person keeps their own contact details current.
export async function updateOwnContact(user: AppUser, input: { preferredName?: string | null; phone?: string | null; address?: string | null; emergencyContacts?: EmergencyContact[] }) {
  const id = await myEmployeeId(user);
  if (!id) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
  await run(
    "UPDATE employees SET preferred_name = ?, phone = ?, address = ?, emergency_contacts = ?, updated_at = ?, updated_by = ? WHERE id = ?",
    clean(input.preferredName, 80),
    clean(input.phone, 40),
    clean(input.address, 400),
    JSON.stringify(contacts(input.emergencyContacts)),
    nowIso(),
    user.id,
    id,
  );
  await audit({ actor: user }, { itemId: id, action: "hr.employee", summary: `${user.name} updated their contact details` });
}

// Creates a record for every active account that has none, with the department taken from their roles.
export async function syncFromUsers(user: AppUser) {
  needHr(user);
  const users = await listUsers();
  const linked = new Set((await all<{ user_id: string }>("SELECT user_id FROM employees WHERE user_id IS NOT NULL")).map((r) => r.user_id));
  const positions = await all<{ department: string; user_id: string }>("SELECT department, user_id FROM department_positions");
  let added = 0;
  for (const u of users) {
    if (linked.has(u.id)) continue;
    const dept =
      (Object.keys(DEPARTMENT_ROLES) as Department[]).find((d) => DEPARTMENT_ROLES[d].some((r) => u.roles.includes(r))) ??
      (u.roles.some((r) => r === "hr_manager" || r === "hr_officer") ? "hr" : null) ??
      positions.find((p) => p.user_id === u.id)?.department ??
      (u.roles.includes("owner") || u.roles.includes("admin") ? "management" : null);
    const title = u.roles.map((r) => ROLE_LABELS[r]).join(", ") || null;
    await saveEmployee(user, { userId: u.id, fullName: u.name, email: u.email, department: dept, jobTitle: title, status: "active" });
    added++;
  }
  return { added };
}

// ---------------------------------------------------------------------------
// Org chart
// ---------------------------------------------------------------------------

export type OrgNode = { id: string; name: string; jobTitle: string | null; department: string | null; managerId: string | null };

export async function orgChart(user: AppUser): Promise<OrgNode[]> {
  needHr(user);
  const rows = await all<{ id: string; full_name: string; preferred_name: string | null; job_title: string | null; department: string | null; manager_id: string | null }>(
    "SELECT id, full_name, preferred_name, job_title, department, manager_id FROM employees WHERE status <> 'left' ORDER BY full_name",
  );
  return rows.map((r) => ({ id: r.id, name: displayName(r), jobTitle: r.job_title, department: r.department, managerId: r.manager_id }));
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export async function addDocument(user: AppUser, employeeId: string, input: { kind: string; title?: string; expiresAt?: string | null; file: { name: string; mime: string; base64: string } }) {
  const detail = await getEmployee(user, employeeId);
  const kind = oneOf(input.kind, DOC_KINDS, "other");
  if (!detail || !detail.rights.addDocs.includes(kind)) throw new WorkflowError("FORBIDDEN", "You cannot add this kind of document here.");
  const size = Math.floor((input.file.base64.length * 3) / 4);
  if (size > MAX_HR_FILE) throw new WorkflowError("VALIDATION", "Files are limited to 8 MB.");
  const name = input.file.name.replace(/[\\/]/g, "_").slice(0, 160) || "file";
  const id = uid("edoc_");
  await run(
    "INSERT INTO employee_documents (id, employee_id, kind, title, name, mime, size, data, expires_at, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id,
    employeeId,
    kind,
    clean(input.title, 160) ?? DOC_KIND_LABELS[kind],
    name,
    input.file.mime.slice(0, 100) || "application/octet-stream",
    size,
    input.file.base64,
    day(input.expiresAt),
    user.id,
    nowIso(),
  );
  await audit({ actor: user }, { itemId: employeeId, action: "hr.document", summary: `${user.name} added ${DOC_KIND_LABELS[kind].toLowerCase()} "${name}" to ${detail.employee.fullName}'s record` });
  return id;
}

async function docFor(user: AppUser, docId: string) {
  const d = await get<{ id: string; employee_id: string; kind: DocKind; name: string; mime: string; uploaded_by: string | null }>(
    "SELECT id, employee_id, kind, name, mime, uploaded_by FROM employee_documents WHERE id = ?",
    docId,
  );
  if (!d) return null;
  const view = await viewOf(user, d.employee_id);
  if (view === "hr" && (d.kind !== "id" || can(user, "hr.sensitive"))) return { d, view };
  if (view === "self") return { d, view };
  return null;
}

export async function deleteDocument(user: AppUser, docId: string) {
  const f = await docFor(user, docId);
  if (!f) throw new WorkflowError("FORBIDDEN", "You cannot remove this document.");
  // People remove only what they added themselves; HR removes any document they can see.
  if (f.view === "self" && f.d.uploaded_by !== user.id) throw new WorkflowError("FORBIDDEN", "Ask HR to remove documents HR added.");
  await run("DELETE FROM employee_documents WHERE id = ?", docId);
  await audit({ actor: user }, { itemId: f.d.employee_id, action: "hr.document", summary: `${user.name} removed the document "${f.d.name}"` });
}

export async function readDocument(user: AppUser, docId: string) {
  const f = await docFor(user, docId);
  if (!f) return null;
  const row = await get<{ data: string }>("SELECT data FROM employee_documents WHERE id = ?", docId);
  return { name: f.d.name, mime: f.d.mime, data: Buffer.from(row?.data ?? "", "base64") };
}

// What needs HR's attention soon: documents expiring, contracts ending, probation ending (and anything overdue).
export type HrDue = { kind: "document" | "contract" | "probation"; employeeId: string; employeeName: string; label: string; date: string };

export async function hrUpcoming(user: AppUser, days = 60): Promise<HrDue[]> {
  needHr(user);
  const until = new Date(Date.now() + days * DAY).toISOString().slice(0, 10);
  const sensitive = can(user, "hr.sensitive");
  const docs = await all<{ employee_id: string; full_name: string; preferred_name: string | null; title: string; kind: DocKind; expires_at: string }>(
    `SELECT d.employee_id, e.full_name, e.preferred_name, d.title, d.kind, d.expires_at FROM employee_documents d JOIN employees e ON e.id = d.employee_id
     WHERE d.expires_at IS NOT NULL AND d.expires_at <= ? AND e.status <> 'left'`,
    until,
  );
  const people = await all<{ id: string; full_name: string; preferred_name: string | null; contract_end: string | null; probation_end: string | null; status: string }>(
    "SELECT id, full_name, preferred_name, contract_end, probation_end, status FROM employees WHERE status <> 'left' AND ((contract_end IS NOT NULL AND contract_end <= ?) OR (probation_end IS NOT NULL AND probation_end <= ?))",
    until,
    until,
  );
  const today = new Date().toISOString().slice(0, 10);
  const out: HrDue[] = [
    ...docs.filter((d) => d.kind !== "id" || sensitive).map((d) => ({ kind: "document" as const, employeeId: d.employee_id, employeeName: displayName(d), label: d.title, date: d.expires_at })),
    ...people.filter((p) => p.contract_end && p.contract_end <= until).map((p) => ({ kind: "contract" as const, employeeId: p.id, employeeName: displayName(p), label: "Contract ends", date: p.contract_end! })),
    // Probation that has passed stops showing once the person is no longer marked as on probation.
    ...people
      .filter((p) => p.probation_end && p.probation_end <= until && (p.probation_end >= today || p.status === "probation"))
      .map((p) => ({ kind: "probation" as const, employeeId: p.id, employeeName: displayName(p), label: "Probation ends", date: p.probation_end! })),
  ];
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

async function hrUserIds() {
  return (await listUsers()).filter((u) => u.perms.includes("hr.access")).map((u) => u.id);
}

// Daily: reminds HR (and the person, for their own documents) before dates come up.
export async function hrReminderChecks(now = nowIso()) {
  const today = now.slice(0, 10);
  const at = (days: number) => new Date(Date.parse(now) + days * DAY).toISOString().slice(0, 10);
  const hr = await hrUserIds();
  let sent = 0;
  const docs = await all<{ id: string; employee_id: string; user_id: string | null; full_name: string; title: string; kind: DocKind; expires_at: string }>(
    `SELECT d.id, d.employee_id, e.user_id, e.full_name, d.title, d.kind, d.expires_at FROM employee_documents d JOIN employees e ON e.id = d.employee_id
     WHERE d.expires_at IS NOT NULL AND d.expires_at <= ? AND e.status <> 'left'`,
    at(REMIND_DOC_DAYS),
  );
  for (const d of docs) {
    const past = d.expires_at < today;
    await notify(
      [...hr, d.user_id],
      {
        type: "hr",
        title: `${past ? "Expired" : "Expiring"}: ${d.full_name}'s ${d.title}`,
        body: `${past ? "Expired on" : "Expires on"} ${d.expires_at}.`,
        link: `/hr/people/${d.employee_id}`,
        dedupeKey: `hr-doc:${d.id}:${d.expires_at}:${past ? "past" : "soon"}`,
      },
      now,
    );
    sent++;
  }
  const people = await all<{ id: string; full_name: string; contract_end: string | null; probation_end: string | null }>(
    "SELECT id, full_name, contract_end, probation_end FROM employees WHERE status <> 'left'",
  );
  for (const p of people) {
    if (p.contract_end && p.contract_end <= at(REMIND_CONTRACT_DAYS) && p.contract_end >= today) {
      await notify(hr, { type: "hr", title: `Contract ending: ${p.full_name}`, body: `The contract ends on ${p.contract_end}.`, link: `/hr/people/${p.id}`, dedupeKey: `hr-contract:${p.id}:${p.contract_end}` }, now);
      sent++;
    }
    if (p.probation_end && p.probation_end <= at(REMIND_PROBATION_DAYS) && p.probation_end >= today) {
      await notify(hr, { type: "hr", title: `Probation ending: ${p.full_name}`, body: `Probation ends on ${p.probation_end}. Confirm or extend it.`, link: `/hr/people/${p.id}`, dedupeKey: `hr-probation:${p.id}:${p.probation_end}` }, now);
      sent++;
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Equipment
// ---------------------------------------------------------------------------

export type EquipmentRow = {
  id: string;
  tag: string;
  name: string;
  category: EquipmentCategory;
  serial: string | null;
  condition: Condition;
  status: EquipmentStatus;
  holderId: string | null;
  holderName: string | null;
  issuedAt: string | null;
  dueBack: string | null;
  purchasedAt: string | null;
  notes: string | null;
};

export async function listEquipment(user: AppUser): Promise<EquipmentRow[]> {
  needHr(user);
  const rows = await all<{
    id: string;
    tag: string;
    name: string;
    category: EquipmentCategory;
    serial: string | null;
    condition: Condition;
    status: EquipmentStatus;
    holder_id: string | null;
    full_name: string | null;
    preferred_name: string | null;
    issued_at: string | null;
    due_back: string | null;
    purchased_at: string | null;
    notes: string | null;
  }>("SELECT q.*, e.full_name, e.preferred_name FROM equipment q LEFT JOIN employees e ON e.id = q.holder_id ORDER BY q.tag");
  return rows.map((r) => ({
    id: r.id,
    tag: r.tag,
    name: r.name,
    category: r.category,
    serial: r.serial,
    condition: r.condition,
    status: r.status,
    holderId: r.holder_id,
    holderName: r.full_name ? r.preferred_name || r.full_name : null,
    issuedAt: r.issued_at,
    dueBack: r.due_back,
    purchasedAt: r.purchased_at,
    notes: r.notes,
  }));
}

async function logEquipment(equipmentId: string, action: string, actor: AppUser, extra: { employeeId?: string | null; condition?: string | null; note?: string | null } = {}) {
  await run(
    "INSERT INTO equipment_events (id, equipment_id, action, employee_id, condition, note, actor_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("eqe_"),
    equipmentId,
    action,
    extra.employeeId ?? null,
    extra.condition ?? null,
    extra.note ?? null,
    actor.id,
    nowIso(),
  );
}

export async function saveEquipment(
  user: AppUser,
  input: { id?: string | null; tag: string; name: string; category?: string; serial?: string | null; condition?: string; status?: string; purchasedAt?: string | null; notes?: string | null },
) {
  needHr(user);
  const tag = clean(input.tag, 40)?.toUpperCase();
  const name = clean(input.name, 120);
  if (!tag || !name) throw new WorkflowError("VALIDATION", "Enter an asset tag and a name.");
  const clash = await get<{ id: string }>("SELECT id FROM equipment WHERE tag = ? AND id <> ?", tag, input.id ?? "");
  if (clash) throw new WorkflowError("VALIDATION", `The tag ${tag} is already used.`);
  const existing = input.id ? await get<{ status: EquipmentStatus; holder_id: string | null }>("SELECT status, holder_id FROM equipment WHERE id = ?", input.id) : null;
  if (input.id && !existing) throw new WorkflowError("NOT_FOUND", "This equipment no longer exists.");
  // Issuing and returning go through their own actions so the history stays complete.
  let status = oneOf(input.status, EQUIPMENT_STATUSES, existing?.status ?? "available");
  if (status === "issued" && existing?.status !== "issued") status = existing?.status ?? "available";
  if (existing?.status === "issued" && status !== "issued") throw new WorkflowError("VALIDATION", "Take it back from the person first.");
  const now = nowIso();
  const values = [tag, name, oneOf(input.category, EQUIPMENT_CATEGORIES, "other"), clean(input.serial, 80), oneOf(input.condition, CONDITIONS, "good"), status, day(input.purchasedAt), clean(input.notes, 1000)];
  if (existing) {
    await run("UPDATE equipment SET tag = ?, name = ?, category = ?, serial = ?, condition = ?, status = ?, purchased_at = ?, notes = ?, updated_at = ? WHERE id = ?", ...values, now, input.id);
    await logEquipment(input.id!, "updated", user, { condition: values[4] as string });
    return input.id!;
  }
  const id = uid("eq_");
  await run("INSERT INTO equipment (id, tag, name, category, serial, condition, status, purchased_at, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", id, ...values, now, now);
  await logEquipment(id, "added", user, { condition: values[4] as string });
  return id;
}

export async function issueEquipment(user: AppUser, id: string, input: { employeeId: string; dueBack?: string | null; note?: string | null }) {
  needHr(user);
  const q = await get<{ tag: string; name: string; status: EquipmentStatus }>("SELECT tag, name, status FROM equipment WHERE id = ?", id);
  if (!q) throw new WorkflowError("NOT_FOUND", "This equipment no longer exists.");
  if (q.status !== "available") throw new WorkflowError("INVALID_STATE", `${q.tag} is not available to issue.`);
  const e = await get<{ full_name: string; user_id: string | null; status: string }>("SELECT full_name, user_id, status FROM employees WHERE id = ?", input.employeeId);
  if (!e || e.status === "left") throw new WorkflowError("VALIDATION", "Choose a current employee.");
  const now = nowIso();
  await run("UPDATE equipment SET status = 'issued', holder_id = ?, issued_at = ?, due_back = ?, updated_at = ? WHERE id = ?", input.employeeId, now.slice(0, 10), day(input.dueBack), now, id);
  await logEquipment(id, "issued", user, { employeeId: input.employeeId, note: clean(input.note, 400) });
  if (e.user_id) await notify([e.user_id], { type: "hr", title: `Issued to you: ${q.name} (${q.tag})`, body: input.dueBack ? `Please return it by ${input.dueBack}.` : undefined, link: "/profile?tab=record" }, now, user.id);
}

export async function returnEquipment(user: AppUser, id: string, input: { condition?: string; note?: string | null }) {
  needHr(user);
  const q = await get<{ status: EquipmentStatus; holder_id: string | null }>("SELECT status, holder_id FROM equipment WHERE id = ?", id);
  if (!q || q.status !== "issued") throw new WorkflowError("INVALID_STATE", "This equipment is not issued to anyone.");
  const condition = oneOf(input.condition, CONDITIONS, "good");
  await run(
    "UPDATE equipment SET status = ?, condition = ?, holder_id = NULL, issued_at = NULL, due_back = NULL, updated_at = ? WHERE id = ?",
    condition === "damaged" ? "repair" : "available",
    condition,
    nowIso(),
    id,
  );
  await logEquipment(id, "returned", user, { employeeId: q.holder_id, condition, note: clean(input.note, 400) });
}

export async function equipmentHistory(user: AppUser, id: string) {
  needHr(user);
  return all<{ id: string; action: string; employee: string | null; condition: string | null; note: string | null; actor: string | null; at: string }>(
    `SELECT v.id, v.action, e.full_name AS employee, v.condition, v.note, u.name AS actor, v.at FROM equipment_events v
     LEFT JOIN employees e ON e.id = v.employee_id LEFT JOIN users u ON u.id = v.actor_id WHERE v.equipment_id = ? ORDER BY v.at DESC LIMIT 100`,
    id,
  );
}
