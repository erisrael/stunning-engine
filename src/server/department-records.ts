import { all, get, nowIso, parseJson, run, tx } from "./db";
import { can, type AppUser } from "./users";
import { deptAccess } from "./departments";
import { canConfigureStudio } from "./studio-extras";
import { audit, WorkflowError } from "./workflow";
import * as studio from "./studio";
import * as hr from "./hr";
import * as finance from "./finance";
import { roleLabel, ROLES } from "@/lib/domain";
import { DATA_RIGHTS, grantsFor, RECORD_SCOPES, RECORD_SETS, type DataGrants, type DataPolicy, type DataRight, type ManagedRecord, type RecordsPageData, type RecordScope, type RecordValue } from "@/lib/department-records";

function scopeOf(scope: string): RecordScope {
  if (!(RECORD_SCOPES as readonly string[]).includes(scope)) throw new WorkflowError("VALIDATION", "Unknown department.");
  return scope as RecordScope;
}
const policyKey = (scope: RecordScope) => `data-manager.${scope}`;
async function policyFor(scope: RecordScope): Promise<DataPolicy> {
  return parseJson((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", policyKey(scope)))?.value, { version: 0, grants: {} });
}
async function accessFor(user: AppUser, scope: RecordScope) {
  const admin = can(user, "users.manage");
  const membership = scope === "studio" ? await deptAccess(user, "studio") : null;
  const view = scope === "studio" ? membership!.view : scope === "hr" ? can(user, "hr.access") : finance.rights(user).view;
  if (!view) throw new WorkflowError("FORBIDDEN", "You cannot access this department's records.");
  const write = scope === "studio" ? !membership!.readOnly : scope === "hr" ? can(user, "hr.access") : finance.rights(user).access;
  const configure = admin || (scope === "studio" ? await canConfigureStudio(user) : scope === "hr" ? can(user, "hr.manage") : finance.rights(user).approve);
  const policy = await policyFor(scope);
  const keys = scope === "studio" ? [membership!.readOnly ? "observer" : membership!.position ?? "member"] : user.roles;
  const rights = Object.fromEntries(DATA_RIGHTS.map(right => [right, (right === "view" || right === "export" || write) && (admin || keys.some(key => grantsFor(policy, key)[right]))])) as DataGrants;
  const principals = scope === "studio" ? [{ key: "head", label: "Head" }, { key: "lead", label: "Lead" }, { key: "member", label: "Member" }, { key: "observer", label: "Read-only observer" }] : ROLES.filter(role => role !== "admin").map(key => ({ key, label: roleLabel(key) }));
  return { rights, configure, policy, principals, membership };
}
function need(rights: DataGrants, right: DataRight) {
  if (!rights.view || !rights[right]) throw new WorkflowError("FORBIDDEN", "Your role or membership does not allow this Data Manager action.");
}
function values(row: object): Record<string, RecordValue> {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v == null || ["string", "number", "boolean"].includes(typeof v))) as Record<string, RecordValue>;
}

export async function departmentRecords(user: AppUser, rawScope: string, dataset?: string, year = new Date().getUTCFullYear()): Promise<RecordsPageData> {
  const scope = scopeOf(rawScope);
  const access = await accessFor(user, scope);
  need(access.rights, "view");
  const set = RECORD_SETS[scope].find(s => s.key === (dataset ?? RECORD_SETS[scope][0].key));
  if (!set) throw new WorkflowError("VALIDATION", "Unknown record type.");
  if (!Number.isInteger(year) || year < 1900 || year > 2200) throw new WorkflowError("VALIDATION", "Choose a valid year.");
  let rows: ManagedRecord[] = [];
  const row = (id: string, data: object, edit: boolean, remove: boolean, href = set.href): ManagedRecord => ({ id, values: Object.fromEntries(set.columns.map(c => [c.key, values(data)[c.key] ?? null])), href, edit: edit && access.rights.edit, remove: remove && access.rights.remove });
  const manager = access.membership?.manage ?? false;
  if (scope === "studio") {
    if (set.key === "questions") rows = (await studio.listQuestions(user)).rows.map(q => row(q.id, { ...q, author: q.author_name }, manager || q.author_id === user.id, manager || q.author_id === user.id, `${set.href}&open=${q.id}`));
    else rows = (await studio.listResources(user, { type: set.key as "note" | "exam" | "flashcards" })).rows.map(r => row(r.id, { ...r, dueDate: r.due_date, author: r.author_name, assignee: r.assignee_name }, manager || r.author_id === user.id || r.assignee_id === user.id, manager || (r.author_id === user.id && r.status === "draft"), `${set.href}&open=${r.id}`));
  } else if (scope === "hr") {
    if (set.key === "employees") {
      const names = new Map((await all<{ id: string; full_name: string }>("SELECT id, full_name FROM employees")).map(r => [r.id, r.full_name]));
      rows = (await hr.listEmployees(user, { includeLeft: true })).map(r => row(r.id, { ...r, fullName: names.get(r.id) }, true, can(user, "hr.manage") || can(user, "users.manage"), `/hr/people/${r.id}`));
    } else rows = (await hr.listEquipment(user)).map(r => row(r.id, r, true, r.status !== "issued" && r.status !== "retired"));
  } else {
    const approve = finance.rights(user).approve;
    if (set.key === "accounts") rows = (await finance.listAccounts(user)).map(r => row(r.id, r, approve, approve && r.active));
    if (set.key === "parties") rows = (await finance.listParties(user)).map(r => row(r.id, { ...r, bankAccount: r.bank_account, active: !!r.active }, true, !!r.active));
    if (set.key === "transactions") rows = (await finance.listTransactions(user)).map(r => row(r.id, r, false, approve && r.status === "posted" && ["manual", "transfer"].includes(r.source)));
    if (set.key === "bills") rows = (await finance.listBills(user)).map(r => row(r.id, r, false, false));
    if (set.key === "invoices") rows = (await finance.listInvoices(user)).map(r => row(r.id, r, false, false));
    if (set.key === "budgets") rows = (await finance.listBudgets(user, year)).map(r => row(r.id, r, false, false));
  }
  return { scope, dataset: set.key, rows, rights: { ...access.rights, create: access.rights.create && !!set.create && (scope !== "finance" || set.key !== "accounts" || finance.rights(user).approve) }, configure: access.configure, policy: access.configure ? access.policy : null, principals: access.configure ? access.principals : [], year };
}

export async function saveDataPolicy(user: AppUser, rawScope: string, input: DataPolicy) {
  const scope = scopeOf(rawScope);
  const a = await accessFor(user, scope);
  if (!a.configure) throw new WorkflowError("FORBIDDEN", "Only department configuration managers can change these permissions.");
  const grants: DataPolicy["grants"] = {};
  for (const p of a.principals) grants[p.key] = Object.fromEntries(DATA_RIGHTS.map(key => {
    const v = input.grants?.[p.key]?.[key];
    if (typeof v !== "boolean") throw new WorkflowError("VALIDATION", "Every permission must be checked or unchecked.");
    return [key, v];
  })) as DataGrants;
  // Keep configuration reachable by the person saving. Admin always has access.
  if (!can(user, "users.manage")) {
    const keys = scope === "studio" ? [a.membership?.position ?? "member"] : user.roles;
    if (!keys.some(key => grants[key]?.view)) throw new WorkflowError("VALIDATION", "Keep Data Manager access for your own role or membership.");
  }
  await tx(async () => {
    await run("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING", policyKey(scope), JSON.stringify({ version: 0, grants: {} }), nowIso());
    const current = await get<{ value: string }>("SELECT value FROM settings WHERE key = ? FOR UPDATE", policyKey(scope));
    const old = parseJson<DataPolicy>(current?.value, { version: 0, grants: {} });
    if (old.version !== input.version) throw new WorkflowError("CONFLICT", "Permissions changed. Reload before saving.");
    await run("UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = ?", JSON.stringify({ version: old.version + 1, grants }), nowIso(), user.id, policyKey(scope));
    await audit({ actor: user }, { action: `${scope}.data.permissions`, summary: `${user.name} updated Data Manager permissions` });
  });
}

export async function saveDepartmentRecord(user: AppUser, rawScope: string, dataset: string, id: string | null, patch: Record<string, RecordValue>) {
  const data = await departmentRecords(user, rawScope, dataset);
  need(data.rights, id ? "edit" : "create");
  const set = RECORD_SETS[data.scope].find(s => s.key === dataset)!;
  if (id && !data.rows.some(r => r.id === id && r.edit)) throw new WorkflowError("FORBIDDEN", "This record cannot be edited by you.");
  const p: Record<string, RecordValue> = {};
  for (const [key, value] of Object.entries(patch)) {
    const column = set.columns.find(c => c.key === key && c.edit);
    if (!column) throw new WorkflowError("VALIDATION", `The field ${key} is not editable here.`);
    if (column.edit === "checkbox" ? typeof value !== "boolean" : typeof value !== "string") throw new WorkflowError("VALIDATION", `Invalid ${column.label}.`);
    if (typeof value === "string" && (value.length > 50000 || (column.required && !value.trim()) || (column.options && !column.options.includes(value)))) throw new WorkflowError("VALIDATION", `Check ${column.label}.`);
    p[key] = value;
  }
  const str = (key: string, fallback = "") => String(p[key] ?? fallback);
  if (data.scope === "studio") {
    if (dataset === "questions") {
      const old = id ? (await studio.listQuestions(user)).rows.find(r => r.id === id) : null;
      await studio.saveQuestion(user, { id: id ?? undefined, type: old?.type ?? "short", stem: str("stem", old?.stem), answer: str("answer", old?.answer ?? ""), explanation: str("explanation", old?.explanation ?? ""), difficulty: str("difficulty", old?.difficulty ?? "medium"), options: old?.options, tags: old?.tags, status: old?.status, gradeId: old?.grade_id, subjectId: old?.subject_id, unitId: old?.unit_id, lessonId: old?.lesson_id });
    } else {
      const old = id ? (await studio.getResource(user, id)).resource : null;
      await studio.saveResource(user, { id: id ?? undefined, type: dataset as "note" | "exam" | "flashcards", title: str("title", old?.title), language: str("language", old?.language ?? "en"), body: str("body", old?.body), dueDate: str("dueDate", old?.due_date ?? "") || null, meta: old?.meta, assigneeId: old?.assignee_id, gradeId: old?.grade_id, subjectId: old?.subject_id, unitId: old?.unit_id, lessonId: old?.lesson_id });
    }
  } else if (data.scope === "hr") {
    if (dataset === "employees") {
      const old = id ? await hr.getEmployee(user, id) : null;
      await hr.saveEmployee(user, { ...old?.employee, id, fullName: str("fullName", old?.employee.fullName), ...p });
    } else {
      const old = id ? (await hr.listEquipment(user)).find(r => r.id === id) : null;
      await hr.saveEquipment(user, { ...old, id, tag: str("tag", old?.tag), name: str("name", old?.name), ...p });
    }
  } else if (dataset === "accounts") {
    const old = id ? (await finance.listAccounts(user)).find(r => r.id === id) : null;
    await finance.saveAccount(user, { ...old, id, name: str("name", old?.name), kind: str("kind", old?.kind ?? "bank"), ...p });
  } else if (dataset === "parties") {
    const old = id ? (await finance.listParties(user)).find(r => r.id === id) : null;
    await finance.saveParty(user, { id, name: str("name", old?.name), kind: str("kind", old?.kind ?? "vendor"), tin: str("tin", old?.tin ?? ""), phone: str("phone", old?.phone ?? ""), email: str("email", old?.email ?? ""), bank: str("bank", old?.bank ?? ""), bankAccount: str("bankAccount", old?.bank_account ?? ""), active: typeof p.active === "boolean" ? p.active : old ? !!old.active : true });
  } else throw new WorkflowError("FORBIDDEN", "Open the source page to use this record's approval workflow.");
  await audit({ actor: user }, { action: `${data.scope}.data.save`, summary: `${user.name} ${id ? "edited" : "created"} a ${dataset} record in Data Manager` });
}

export async function bulkDepartmentRecords(user: AppUser, rawScope: string, dataset: string, ids: string[], action: "remove" | "edit", patch: Record<string, RecordValue> = {}) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !["remove", "edit"].includes(action)) throw new WorkflowError("VALIDATION", "Select between 1 and 100 records and a valid action.");
  const data = await departmentRecords(user, rawScope, dataset);
  need(data.rights, action);
  if (ids.length > 1) need(data.rights, "bulk");
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of new Set(ids)) {
    try {
      const row = data.rows.find(r => r.id === id);
      if (!row || !row[action]) throw new WorkflowError("FORBIDDEN", "This record is unavailable or the action is not allowed.");
      await tx(async () => {
        if (action === "edit") return saveDepartmentRecord(user, rawScope, dataset, id, patch);
        if (data.scope === "studio") {
          if (dataset === "questions") await studio.deleteQuestions(user, [id]);
          else await studio.deleteResources(user, [id]);
        } else if (data.scope === "hr") {
          if (dataset === "employees") await hr.deleteEmployee(user, id, { deleteUserAccount: false });
          else {
            const old = (await hr.listEquipment(user)).find(r => r.id === id)!;
            await hr.saveEquipment(user, { ...old, status: "retired" });
          }
        } else if (dataset === "transactions") await finance.voidTransaction(user, id);
        else if (dataset === "accounts") await finance.saveAccount(user, { ...(await finance.listAccounts(user)).find(r => r.id === id)!, active: false });
        else if (dataset === "parties") {
          const old = (await finance.listParties(user)).find(r => r.id === id)!;
          await finance.saveParty(user, { id, name: old.name, kind: old.kind, tin: old.tin ?? "", phone: old.phone ?? "", email: old.email ?? "", bank: old.bank ?? "", bankAccount: old.bank_account ?? "", active: false });
        }
        await audit({ actor: user }, { action: `${data.scope}.data.remove`, summary: `${user.name} removed or retired ${dataset} record ${id} through Data Manager` });
      });
      results.push({ id, ok: true });
    } catch (e) { results.push({ id, ok: false, error: e instanceof Error ? e.message : "Could not save this record." }); }
  }
  return results;
}
