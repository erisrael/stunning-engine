// Deactivating and deleting accounts (Admin, People).
//
// Deactivate: the person cannot sign in and is signed out everywhere; everything stays, and Reactivate undoes it.
// Delete:
// - with no history in the workspace (a mistake, a test account), the account is removed completely;
// - with history (work, time, comments, messages, claims, an HR record), removing it would take that history with
//   it or leave it without an owner, so the account is anonymised instead: name, email, handle, password, roles,
//   sign-in methods, profile, mailbox and notifications are removed, the email can be used again, and past work
//   shows "Deleted person". Open tasks assigned to them go back to unassigned.
// Neither is allowed on your own account or on the last active Admin.

import crypto from "node:crypto";
import { all, get, nowIso, run, tx } from "./db";
import { hashPassword } from "./passwords";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// Where a person's history lives. Each query counts rows; a missing table (older workspace) counts as none.
const HISTORY: { label: string; sql: string; n?: number }[] = [
  { label: "production work", sql: "SELECT COUNT(*) AS c FROM stage_attempts WHERE owner_id = ?" },
  { label: "assigned production work", sql: "SELECT COUNT(*) AS c FROM stage_assignments WHERE user_id = ?" },
  { label: "work sessions (time)", sql: "SELECT COUNT(*) AS c FROM work_sessions WHERE user_id = ?" },
  { label: "items created", sql: "SELECT COUNT(*) AS c FROM items WHERE created_by = ?" },
  { label: "department tasks", sql: "SELECT COUNT(*) AS c FROM dept_tasks WHERE assignee_id = ?" },
  { label: "time on tasks", sql: "SELECT COUNT(*) AS c FROM dept_time_entries WHERE user_id = ?" },
  { label: "comments", sql: "SELECT (SELECT COUNT(*) FROM comments WHERE author_id = ?) + (SELECT COUNT(*) FROM dept_task_comments WHERE author_id = ?) AS c", n: 2 },
  { label: "chat messages", sql: "SELECT COUNT(*) AS c FROM chat_messages WHERE author_id = ?" },
  { label: "Studio resources", sql: "SELECT COUNT(*) AS c FROM studio_resources WHERE author_id = ?" },
  { label: "expense claims", sql: "SELECT COUNT(*) AS c FROM fin_claims WHERE user_id = ?" },
  { label: "HR record", sql: "SELECT COUNT(*) AS c FROM employees WHERE user_id = ?" },
  { label: "stand-ups", sql: "SELECT COUNT(*) AS c FROM dept_standups WHERE user_id = ?" },
];

export type DeletePreview = { name: string; email: string; mode: "remove" | "anonymise"; history: { label: string; count: number }[]; blocked: string | null };

async function guard(actor: AppUser, id: string) {
  if (!can(actor, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages accounts.");
  const u = await get<{ id: string; name: string; email: string; active: number; deleted_at: string | null }>("SELECT id, name, email, active, deleted_at FROM users WHERE id = ?", id);
  if (!u || u.deleted_at) throw new WorkflowError("NOT_FOUND", "Account not found.");
  let blocked: string | null = null;
  if (id === actor.id) blocked = "You cannot do this to your own account.";
  else if (await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = 'admin'", id)) {
    const admins = await get<{ c: number }>("SELECT COUNT(*) AS c FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.active = 1 AND u.id <> ?", id);
    if (!Number(admins?.c ?? 0)) blocked = "This is the last active Admin. Make someone else Admin first.";
  }
  return { u, blocked };
}

export async function deletePreview(actor: AppUser, id: string): Promise<DeletePreview> {
  const { u, blocked } = await guard(actor, id);
  const history: { label: string; count: number }[] = [];
  for (const h of HISTORY) {
    const c = await get<{ c: number }>(h.sql, ...Array(h.n ?? 1).fill(id)).catch(() => null);
    if (Number(c?.c ?? 0) > 0) history.push({ label: h.label, count: Number(c!.c) });
  }
  return { name: u.name, email: u.email, mode: history.length ? "anonymise" : "remove", history, blocked };
}

export async function setAccountActive(actor: AppUser, id: string, active: boolean) {
  const { u, blocked } = await guard(actor, id);
  if (!active && blocked) throw new WorkflowError("VALIDATION", blocked);
  await run("UPDATE users SET active = ? WHERE id = ?", active ? 1 : 0, id);
  if (!active) await run("DELETE FROM sessions WHERE user_id = ?", id);
  await audit({ actor }, { action: active ? "user.reactivated" : "user.deactivated", summary: `${actor.name} ${active ? "reactivated" : "deactivated"} ${u.name} (${u.email})` });
}

// The typed email must match, so the wrong row is never deleted by a slip.
export async function deleteAccount(actor: AppUser, id: string, confirmEmail: string) {
  const p = await deletePreview(actor, id);
  if (p.blocked) throw new WorkflowError("VALIDATION", p.blocked);
  if (confirmEmail.trim().toLowerCase() !== p.email.toLowerCase()) throw new WorkflowError("VALIDATION", "Type the person's email exactly to confirm.");
  await tx(async () => {
    // The mailbox in the app goes in both cases (the mailbox at the host is not touched).
    const boxes = await all<{ id: string }>("SELECT id FROM email_senders WHERE user_id = ?", id);
    for (const b of boxes) await run("DELETE FROM mail_state WHERE sender_id = ?", b.id);
    await run("DELETE FROM email_senders WHERE user_id = ?", id);
    if (p.mode === "remove") {
      await run("DELETE FROM users WHERE id = ?", id);
      return;
    }
    const short = id.replace(/^usr_/, "").slice(0, 10);
    await run(
      "UPDATE users SET name = 'Deleted person', email = ?, handle = ?, title = NULL, phone = NULL, bio = NULL, password_hash = ?, must_change_password = 0, active = 0, prefs = '{}', deleted_at = ? WHERE id = ?",
      `deleted-${short}@deleted.invalid`,
      `deleted-${short}`,
      hashPassword(crypto.randomBytes(32).toString("hex")),
      nowIso(),
      id,
    );
    for (const sql of [
      "DELETE FROM sessions WHERE user_id = ?",
      "DELETE FROM role_assignments WHERE user_id = ?",
      "DELETE FROM access_scopes WHERE user_id = ?",
      "DELETE FROM team_leads WHERE user_id = ?",
      "DELETE FROM department_positions WHERE user_id = ?",
      "DELETE FROM user_capacity WHERE user_id = ?",
      "DELETE FROM dept_capacity WHERE user_id = ?",
      "DELETE FROM dept_task_watchers WHERE user_id = ?",
      "DELETE FROM notifications WHERE user_id = ?",
      "DELETE FROM push_subscriptions WHERE user_id = ?",
      "DELETE FROM user_two_step WHERE user_id = ?",
      "DELETE FROM two_step_trust WHERE user_id = ?",
      "DELETE FROM user_identities WHERE user_id = ?",
      "DELETE FROM google_tokens WHERE user_id = ?",
      "DELETE FROM password_history WHERE user_id = ?",
      "DELETE FROM password_resets WHERE user_id = ?",
      "DELETE FROM email_verifications WHERE user_id = ?",
      "DELETE FROM profile_files WHERE user_id = ?",
      "DELETE FROM profiles WHERE user_id = ?",
      "DELETE FROM chat_members WHERE user_id = ?",
      "DELETE FROM assistant_routines WHERE owner_id = ?",
      "DELETE FROM assistant_runs WHERE user_id = ?",
      // Open work goes back to unassigned so it is not stuck with nobody able to do it.
      "UPDATE dept_tasks SET assignee_id = NULL WHERE assignee_id = ? AND status_category <> 'done'",
      // The HR record stays with HR (pay and contract history), no longer linked to a sign-in.
      "UPDATE employees SET user_id = NULL WHERE user_id = ?",
    ])
      await run(sql, id);
  });
  await audit(
    { actor },
    {
      action: "user.deleted",
      summary: `${actor.name} deleted the account of ${p.name} (${p.email})${p.mode === "anonymise" ? `; their history (${p.history.map((h) => h.label).join(", ")}) is kept as "Deleted person"` : ""}`,
    },
  );
  return { mode: p.mode };
}
