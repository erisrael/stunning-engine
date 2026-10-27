"use server";

import crypto from "node:crypto";
import { requireCapability, requireManager, requireViewer } from "@/server/auth";
import { wrap } from "@/server/action-result";
import { all, get, nowIso, parseJson, run, tx, uid } from "@/server/db";
import { getSettings, savePermissionMatrix, saveSetting, type Settings } from "@/server/settings";
import { hashPassword, passwordProblems } from "@/server/passwords";
import { uniqueHandle } from "@/server/importer";
import { audit, decideSessionCorrection, WorkflowError } from "@/server/workflow";
import { runScheduledChecks } from "@/server/jobs";
import { can, type UserPrefs } from "@/server/users";
import { emptyWorkspace, importCurriculumBackup, isCurriculumBackup } from "@/server/workspace-data";
import { CAPABILITIES, ROLES, STAGES, leadKey, type Capability, type PermissionMatrix, type Role, type Stage } from "@/lib/domain";

// ---------------------------------------------------------------------------
// Workspace settings
// ---------------------------------------------------------------------------

export async function saveSettingsAction<K extends keyof Settings>(key: K, value: Settings[K]) {
  return wrap(async () => {
    const viewer = await requireCapability("settings.manage");
    const before = (await getSettings())[key];
    if (key === "checklists") {
      const lists = value as Settings["checklists"];
      for (const st of STAGES) {
        const keys = new Set<string>();
        for (const c of lists[st] ?? []) {
          if (!c.key || !c.label.trim()) throw new WorkflowError("VALIDATION", `Every ${st} checklist item needs a label.`);
          if (keys.has(c.key)) throw new WorkflowError("VALIDATION", `Duplicate checklist key ${c.key}.`);
          keys.add(c.key);
        }
      }
    }
    if (key === "destinations" && !(value as Settings["destinations"]).some((d) => d.active && d.requiredByDefault))
      throw new WorkflowError("VALIDATION", "Keep at least one active destination that is required by default.");
    if (key === "calendar") {
      const cal = value as Settings["calendar"];
      if (!/^\d{2}:\d{2}$/.test(cal.dayStart) || !/^\d{2}:\d{2}$/.test(cal.dayEnd) || cal.dayStart >= cal.dayEnd)
        throw new WorkflowError("VALIDATION", "Working hours must be HH:mm with the start before the end.");
    }
    await saveSetting(key, value, viewer.id);
    await audit({ actor: viewer }, { action: "settings.changed", summary: `${viewer.name} changed ${key} settings`, oldValue: before, newValue: value });
  });
}

export async function runChecksAction() {
  return wrap(async () => {
    await requireManager("settings.manage");
    return await runScheduledChecks();
  });
}

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

export async function upsertGradeAction(input: { id?: string; code: string; name: string; sort: number; active: boolean }) {
  return wrap(async () => {
    const viewer = await requireManager();
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,6}$/.test(code)) throw new WorkflowError("VALIDATION", "Grade codes are 1 to 6 letters or digits, for example G08.");
    const clash = await get<{ id: string }>("SELECT id FROM grades WHERE code = ?", code);
    if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `Code ${code} is already used.`);
    if (input.id) await run("UPDATE grades SET code = ?, name = ?, sort = ?, active = ? WHERE id = ?", code, input.name.trim(), input.sort, input.active, input.id);
    else await run("INSERT INTO grades (id, code, name, sort, active) VALUES (?, ?, ?, ?, ?)", `grd_${code.toLowerCase()}_${uid().slice(0, 4)}`, code, input.name.trim(), input.sort, input.active);
    await audit({ actor: viewer }, { action: "taxonomy.grade", summary: `${viewer.name} saved grade ${code}` });
  });
}

export async function upsertSubjectAction(input: { id?: string; code: string; name: string; nameAm?: string; sort: number; active: boolean }) {
  return wrap(async () => {
    const viewer = await requireManager();
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) throw new WorkflowError("VALIDATION", "Subject codes are 2 to 8 letters or digits, for example MATH.");
    const clash = await get<{ id: string }>("SELECT id FROM subjects WHERE code = ?", code);
    if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `Code ${code} is already used.`);
    if (input.id) await run("UPDATE subjects SET code = ?, name = ?, name_am = ?, sort = ?, active = ? WHERE id = ?", code, input.name.trim(), input.nameAm || null, input.sort, input.active, input.id);
    else await run("INSERT INTO subjects (id, code, name, name_am, sort, active) VALUES (?, ?, ?, ?, ?, ?)", `sub_${code.toLowerCase()}_${uid().slice(0, 4)}`, code, input.name.trim(), input.nameAm || null, input.sort, input.active);
    await audit({ actor: viewer }, { action: "taxonomy.subject", summary: `${viewer.name} saved subject ${code}` });
  });
}

export async function setGradeSubjectAction(gradeId: string, subjectId: string, offered: boolean) {
  return wrap(async () => {
    const viewer = await requireManager();
    if (offered) await run("INSERT OR IGNORE INTO grade_subjects (grade_id, subject_id) VALUES (?, ?)", gradeId, subjectId);
    else {
      const used = await get("SELECT 1 AS x FROM item_memberships WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
      if (used) throw new WorkflowError("INVALID_STATE", "Items already use this grade and subject. Archive them first.");
      await run("DELETE FROM grade_subjects WHERE grade_id = ? AND subject_id = ?", gradeId, subjectId);
    }
    await audit({ actor: viewer }, { action: "taxonomy.offering", summary: `${viewer.name} ${offered ? "offered" : "removed"} a subject in a grade` });
  });
}

export async function upsertUnitAction(input: { id?: string; gradeId: string; subjectId: string; number: number; title: string; titleAm?: string; term?: string }) {
  return wrap(async () => {
    const viewer = await requireManager();
    if (!input.title.trim() || !(input.number > 0)) throw new WorkflowError("VALIDATION", "Units need a number and a title.");
    const clash = await get<{ id: string }>("SELECT id FROM units WHERE grade_id = ? AND subject_id = ? AND number = ?", input.gradeId, input.subjectId, input.number);
    if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `Unit ${input.number} already exists for this grade and subject.`);
    if (input.id) await run("UPDATE units SET number = ?, title = ?, title_am = ?, term = ? WHERE id = ?", input.number, input.title.trim(), input.titleAm || null, input.term || null, input.id);
    else
      await run(
                "INSERT INTO units (id, curriculum_id, grade_id, subject_id, number, title, title_am, term) VALUES (?, (SELECT id FROM curricula WHERE active = 1 LIMIT 1), ?, ?, ?, ?, ?, ?)",
                uid("unt_"),
                input.gradeId,
                input.subjectId,
                input.number,
                input.title.trim(),
                input.titleAm || null,
                input.term || null,
              );
    await audit({ actor: viewer }, { action: "taxonomy.unit", summary: `${viewer.name} saved unit ${input.number}: ${input.title}` });
  });
}

export async function upsertLessonAction(input: { id?: string; unitId: string; number: number; title: string; titleAm?: string; objectives?: string; plannedDeliverables?: number }) {
  return wrap(async () => {
    const viewer = await requireManager();
    if (!input.title.trim() || !(input.number > 0)) throw new WorkflowError("VALIDATION", "Lessons need a number and a title.");
    const clash = await get<{ id: string }>("SELECT id FROM lessons WHERE unit_id = ? AND number = ?", input.unitId, input.number);
    if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", `Lesson ${input.number} already exists in this unit.`);
    if (input.id)
      await run(
                "UPDATE lessons SET number = ?, title = ?, title_am = ?, objectives = ?, planned_deliverables = ? WHERE id = ?",
                input.number,
                input.title.trim(),
                input.titleAm || null,
                input.objectives || null,
                input.plannedDeliverables ?? 1,
                input.id,
              );
    else
      await run(
                "INSERT INTO lessons (id, unit_id, number, title, title_am, objectives, planned_deliverables, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                uid("les_"),
                input.unitId,
                input.number,
                input.title.trim(),
                input.titleAm || null,
                input.objectives || null,
                input.plannedDeliverables ?? 1,
                nowIso(),
              );
    await audit({ actor: viewer }, { action: "taxonomy.lesson", summary: `${viewer.name} saved lesson ${input.number}: ${input.title}` });
  });
}

export async function deleteLessonAction(id: string) {
  return wrap(async () => {
    const viewer = await requireManager();
    if (await get("SELECT 1 AS x FROM items WHERE lesson_id = ?", id)) throw new WorkflowError("INVALID_STATE", "This lesson has production items and cannot be deleted.");
    await run("DELETE FROM lessons WHERE id = ?", id);
    await audit({ actor: viewer }, { action: "taxonomy.lesson_deleted", summary: `${viewer.name} deleted a planned lesson` });
  });
}

// ---------------------------------------------------------------------------
// Users, roles, scope and capacity
// ---------------------------------------------------------------------------

export type UserInput = {
  id?: string;
  name: string;
  email: string;
  handle?: string;
  title?: string;
  phone?: string;
  bio?: string;
  roles: Role[];
  scopes: { gradeId: string | null; subjectId: string | null }[];
  capacity: Partial<Record<Stage, number>>;
  active: boolean;
  password?: string; // set directly instead of a generated temporary password
  mustChangePassword?: boolean;
};

export async function saveUserAction(input: UserInput) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    const email = input.email.trim().toLowerCase();
    if (!input.name.trim()) throw new WorkflowError("VALIDATION", "Name is required.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new WorkflowError("VALIDATION", "Enter a valid email.");
    if (!input.roles.length) throw new WorkflowError("VALIDATION", "Give the person at least one role.");
    if (input.roles.some((r) => !ROLES.includes(r))) throw new WorkflowError("VALIDATION", "Unknown role.");
    if (input.id === viewer.id && !input.roles.some((r) => r === "admin" || r === "manager"))
      throw new WorkflowError("VALIDATION", "You cannot remove your own Admin or Manager role.");
    if (input.id === viewer.id && !input.active) throw new WorkflowError("VALIDATION", "You cannot deactivate your own account.");
    const clash = await get<{ id: string }>("SELECT id FROM users WHERE lower(email) = ?", email);
    if (clash && clash.id !== input.id) throw new WorkflowError("VALIDATION", "Another account already uses this email.");
    const handle = input.handle?.trim().replace(/^@/, "").toLowerCase();
    if (handle) {
      if (!/^[a-z0-9._-]{2,32}$/.test(handle)) throw new WorkflowError("VALIDATION", "Handles use 2 to 32 letters, digits, dots, dashes or underscores.");
      const taken = await get<{ id: string }>("SELECT id FROM users WHERE handle = ?", handle);
      if (taken && taken.id !== input.id) throw new WorkflowError("VALIDATION", `@${handle} is already taken.`);
    }
    if (input.password) {
      const problem = passwordProblems(input.password);
      if (problem) throw new WorkflowError("VALIDATION", problem);
    }
    let tempPassword: string | null = null;
    const id = input.id ?? uid("usr_");
    await tx(async () => {
      if (input.id) {
        const before = await get("SELECT name, email, handle, title, phone, bio, active FROM users WHERE id = ?", id);
        await run(
          "UPDATE users SET name = ?, email = ?, handle = COALESCE(?, handle), title = ?, phone = ?, bio = ?, active = ? WHERE id = ?",
          input.name.trim(),
          email,
          handle || null,
          input.title || null,
          input.phone || null,
          input.bio || null,
          input.active,
          id,
        );
        if (input.password)
          await run("UPDATE users SET password_hash = ?, must_change_password = ? WHERE id = ?", hashPassword(input.password), input.mustChangePassword ?? false, id);
        if (!input.active || input.password) await run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", id, viewer.sessionId);
        await audit({ actor: viewer }, { action: "user.updated", summary: `${viewer.name} updated ${input.name}`, oldValue: before, newValue: { ...input, password: undefined, capacity: undefined } });
      } else {
        const password = input.password || (tempPassword = `Myseed-${crypto.randomBytes(4).toString("hex")}`);
        await run(
          "INSERT INTO users (id, name, email, handle, title, phone, bio, password_hash, must_change_password, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          id,
          input.name.trim(),
          email,
          handle || (await uniqueHandle(email.split("@")[0])),
          input.title || null,
          input.phone || null,
          input.bio || null,
          hashPassword(password),
          input.password ? (input.mustChangePassword ?? true) : true,
          input.active,
          nowIso(),
        );
        await audit({ actor: viewer }, { action: "user.invited", summary: `${viewer.name} added ${input.name} (${input.roles.join(", ")})` });
      }
      await run("DELETE FROM role_assignments WHERE user_id = ?", id);
      for (const r of input.roles) await run("INSERT INTO role_assignments (user_id, role) VALUES (?, ?)", id, r);
      await run("DELETE FROM access_scopes WHERE user_id = ?", id);
      for (const s of input.scopes) if (s.gradeId || s.subjectId) await run("INSERT INTO access_scopes (user_id, grade_id, subject_id) VALUES (?, ?, ?)", id, s.gradeId, s.subjectId);
      await run("DELETE FROM user_capacity WHERE user_id = ?", id);
      for (const [st, h] of Object.entries(input.capacity)) if (h && h > 0 && input.roles.includes(st as Role)) await run("INSERT INTO user_capacity (user_id, stage, hours_per_week) VALUES (?, ?, ?)", id, st, h);
    });
    return { id, tempPassword };
  });
}

export async function resetPasswordAction(userId: string) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    const temp = `Myseed-${crypto.randomBytes(4).toString("hex")}`;
    await run("UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?", hashPassword(temp), userId);
    await run("DELETE FROM sessions WHERE user_id = ?", userId);
    const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId))?.name;
    await audit({ actor: viewer }, { action: "user.password_reset", summary: `${viewer.name} reset the password for ${name}` });
    return { tempPassword: temp };
  });
}

export async function signOutUserAction(userId: string) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    const n = await run("DELETE FROM sessions WHERE user_id = ? AND id <> ?", userId, viewer.sessionId);
    const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId))?.name;
    await audit({ actor: viewer }, { action: "user.signed_out", summary: `${viewer.name} signed ${name} out of ${n.changes} session(s)` });
    return { sessions: n.changes };
  });
}

export async function savePermissionsAction(matrix: PermissionMatrix) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    const valid = new Set<string>(CAPABILITIES.map((c) => c.key));
    const keys = [...ROLES, ...STAGES.map(leadKey)] as (keyof PermissionMatrix)[];
    const clean = Object.fromEntries(keys.map((k) => [k, [...new Set((matrix[k] ?? []).filter((c) => valid.has(c)))]])) as PermissionMatrix;
    // Someone must always be able to manage users, or the workspace locks itself out.
    if (!clean.admin.includes("users.manage") && !clean.manager.includes("users.manage"))
      throw new WorkflowError("VALIDATION", "Keep Manage users for Admin or Manager so the workspace can still be administered.");
    if (!viewer.roles.some((r) => clean[r].includes("users.manage")))
      throw new WorkflowError("VALIDATION", "This change would remove your own access to Admin. Keep Manage users on one of your roles.");
    await savePermissionMatrix(clean, viewer.id);
    await audit({ actor: viewer }, { action: "permissions.changed", summary: `${viewer.name} changed role permissions`, newValue: clean });
  });
}

// ---------------------------------------------------------------------------
// Workspace data (Admin, Data)
// ---------------------------------------------------------------------------

export async function importCurriculumAction(formData: FormData) {
  return wrap(async () => {
    const viewer = await requireCapability("data.manage");
    const file = formData.get("file");
    if (!(file instanceof File) || !file.size) throw new WorkflowError("VALIDATION", "Choose the curriculum backup JSON file.");
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new WorkflowError("VALIDATION", "The file is not valid JSON.");
    }
    if (!isCurriculumBackup(data)) throw new WorkflowError("VALIDATION", "This JSON is not a curriculum tracker backup (grade, subjects, units, parts).");
    return await importCurriculumBackup(data, {
      actorId: viewer.id,
      fileName: file.name,
      createItems: formData.get("createItems") !== "0",
      markRecorded: formData.get("markRecorded") !== "0",
    });
  });
}

export async function emptyWorkspaceAction(input: { confirm: string; keepAccounts: boolean }) {
  return wrap(async () => {
    const viewer = await requireCapability("data.manage");
    if (input.confirm.trim().toUpperCase() !== "EMPTY") throw new WorkflowError("VALIDATION", "Type EMPTY to confirm.");
    if (!input.keepAccounts && !can(viewer, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only user administrators can remove accounts.");
    // The person emptying the workspace keeps their own account and session.
    await emptyWorkspace({ keepAccounts: true, keepSettings: input.keepAccounts });
    if (!input.keepAccounts) {
      await run("DELETE FROM users WHERE id <> ?", viewer.id);
      await run("DELETE FROM sessions WHERE id <> ?", viewer.sessionId);
    }
    await audit({ actor: viewer }, { action: "workspace.emptied", summary: `${viewer.name} emptied the workspace${input.keepAccounts ? " (accounts kept)" : ""}` });
  });
}

export async function saveLeaveAction(input: { userId: string; startsOn: string; endsOn: string; note?: string }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (input.userId !== viewer.id && !can(viewer, "team.view")) throw new WorkflowError("FORBIDDEN", "Only managers can record leave for others.");
    if (!input.startsOn || !input.endsOn || input.endsOn < input.startsOn) throw new WorkflowError("VALIDATION", "Choose a valid date range.");
    await run("INSERT INTO leave_entries (user_id, starts_on, ends_on, note) VALUES (?, ?, ?, ?)", input.userId, input.startsOn, input.endsOn, input.note || null);
  });
}

export async function deleteLeaveAction(id: number) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ user_id: string }>("SELECT user_id FROM leave_entries WHERE id = ?", id);
    if (!row) return;
    if (row.user_id !== viewer.id && !can(viewer, "team.view")) throw new WorkflowError("FORBIDDEN", "Not allowed.");
    await run("DELETE FROM leave_entries WHERE id = ?", id);
  });
}

export async function decideCorrectionAction(id: string, approve: boolean) {
  return wrap(async () => {
    const viewer = await requireCapability("corrections.approve");
    await decideSessionCorrection({ actor: viewer }, id, approve);
  });
}

// ---------------------------------------------------------------------------
// Personal preferences and saved views
// ---------------------------------------------------------------------------

export async function savePrefsAction(patch: Partial<UserPrefs>) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const row = await get<{ prefs: string }>("SELECT prefs FROM users WHERE id = ?", viewer.id);
    const current = parseJson<UserPrefs>(row?.prefs, {});
    const prefs: UserPrefs = { ...current, ...patch };
    // Per-role and per-preset maps merge so saving one role never resets another.
    for (const k of ["dashboardCards", "dashboardPanels", "sheetPresets"] as const)
      if (patch[k]) (prefs as Record<string, unknown>)[k] = { ...(current[k] ?? {}), ...patch[k] };
    await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify(prefs), viewer.id);
  });
}

export async function saveViewAction(input: { name: string; page: string; query: string; shared: boolean; config?: Record<string, unknown> }) {
  return wrap(async () => {
    const viewer = await requireViewer();
    if (!input.name.trim()) throw new WorkflowError("VALIDATION", "Name the view.");
    if (input.shared && !can(viewer, "items.plan") && !viewer.roles.includes("manager")) throw new WorkflowError("FORBIDDEN", "Only managers can share views with everyone.");
    const id = uid("sv_");
    await run(
            "INSERT INTO saved_views (id, owner_id, name, page, query, config, shared, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            id,
            viewer.id,
            input.name.trim(),
            input.page,
            input.query.replace(/^\?/, ""),
            JSON.stringify(input.config ?? {}),
            input.shared,
            nowIso(),
          );
    return id;
  });
}

export async function deleteViewAction(id: string) {
  return wrap(async () => {
    const viewer = await requireViewer();
    const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE id = ?", id);
    if (!v) return;
    if (v.owner_id !== viewer.id && !can(viewer, "items.plan") && !viewer.roles.includes("manager")) throw new WorkflowError("FORBIDDEN", "You can only delete your own views.");
    await run("DELETE FROM saved_views WHERE id = ?", id);
  });
}

export async function listViews(page?: string) {
  const viewer = await requireViewer();
  return await all<{ id: string; name: string; page: string; query: string; shared: number; owner_id: string }>(
      `SELECT id, name, page, query, shared, owner_id FROM saved_views WHERE (owner_id = ? OR shared = 1) ${page ? "AND page = ?" : ""} ORDER BY shared DESC, name`,
      ...(page ? [viewer.id, page] : [viewer.id]),
    );
}

// ---------------------------------------------------------------------------
// Teams: leads per stage and own-work-only members (Admin, Teams)
// ---------------------------------------------------------------------------

export async function setTeamLeadAction(stage: Stage, userId: string, lead: boolean) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    if (!STAGES.includes(stage)) throw new WorkflowError("VALIDATION", "Unknown team.");
    const holds = await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = ?", userId, stage);
    if (lead && !holds) throw new WorkflowError("VALIDATION", "Give the person this team's role first.");
    if (lead) await run("INSERT INTO team_leads (stage, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", stage, userId);
    else await run("DELETE FROM team_leads WHERE stage = ? AND user_id = ?", stage, userId);
    // Leads see their whole team, so they are never limited to their own work.
    if (lead) await run("UPDATE users SET own_work_only = 0 WHERE id = ?", userId);
    const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId))?.name;
    await audit({ actor: viewer }, { action: "team.lead", summary: `${viewer.name} ${lead ? "made" : "removed"} ${name} ${lead ? "a" : "as"} ${stage} team lead` });
  });
}

export async function setOwnWorkOnlyAction(userId: string, on: boolean) {
  return wrap(async () => {
    const viewer = await requireCapability("users.manage");
    if (on && (await get("SELECT 1 AS x FROM team_leads WHERE user_id = ?", userId))) throw new WorkflowError("VALIDATION", "Team leads see their whole team. Remove the lead role first.");
    await run("UPDATE users SET own_work_only = ? WHERE id = ?", on, userId);
    const name = (await get<{ name: string }>("SELECT name FROM users WHERE id = ?", userId))?.name;
    await audit({ actor: viewer }, { action: "team.own_work", summary: `${viewer.name} ${on ? "limited" : "unlimited"} ${name} to their own work` });
  });
}
