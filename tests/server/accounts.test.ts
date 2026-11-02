// Deactivating and deleting accounts: deactivate signs out and blocks, reactivate restores; delete removes an account
// with no history completely, and anonymises one with history (work kept, personal data and mailbox gone, email free
// again, open tasks unassigned); never your own account or the last Admin; the typed email must match.
process.env.MAIL_FAKE = "1";
import { all, get, run, closeDb, nowIso } from "../../src/server/db";
import { listUsers, loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { connectMailbox } from "../../src/server/mail";
import { saveTask } from "../../src/server/work";
import { setPosition } from "../../src/server/departments";
import * as acc from "../../src/server/account-delete";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[] = ["developer"]) =>
    (await loadUser((await upsertAccount({ name: key, email: `${key}@acc.local`, title: "Staff", roles: roles as never, password: "Accounts-2026!", mustChangePassword: false })).id))!;
  const fresh = await mk("fresh");
  const worker = await mk("worker");
  const member = await mk("member");

  // Deactivate
  await run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('ses_acc1', ?, ?, ?)", fresh.id, nowIso(), new Date(Date.now() + 864e5).toISOString());
  check("people cannot deactivate others", !!(await throws(() => acc.setAccountActive(member, fresh.id, false))));
  await acc.setAccountActive(admin, fresh.id, false);
  check("deactivating signs out and blocks", !(await loadUser(fresh.id))!.active && !(await get("SELECT 1 AS x FROM sessions WHERE user_id = ?", fresh.id)));
  await acc.setAccountActive(admin, fresh.id, true);
  check("reactivating restores", (await loadUser(fresh.id))!.active);
  check("not your own account", /own account/.test((await throws(() => acc.setAccountActive(admin, admin.id, false))) ?? ""));

  // Last Admin
  for (const r of await all<{ user_id: string }>("SELECT user_id FROM role_assignments WHERE role = 'admin' AND user_id <> ?", admin.id)) await run("DELETE FROM role_assignments WHERE user_id = ? AND role = 'admin'", r.user_id);
  const second = await mk("second", ["admin"]);
  const secondUser = (await loadUser(second.id))!;
  await acc.setAccountActive(admin, second.id, false);
  check("the last active Admin cannot be deactivated", /last active Admin/.test((await throws(() => acc.setAccountActive(secondUser, admin.id, false))) ?? ""));
  await acc.setAccountActive(admin, second.id, true);

  // Delete with no history
  const p1 = await acc.deletePreview(admin, fresh.id);
  check("an account with no history is removed completely", p1.mode === "remove" && !p1.history.length, p1);
  check("the typed email must match", /exactly/.test((await throws(() => acc.deleteAccount(admin, fresh.id, "wrong@acc.local"))) ?? ""));
  await acc.deleteAccount(admin, fresh.id, "FRESH@acc.local");
  check("it is gone", !(await get("SELECT 1 AS x FROM users WHERE id = ?", fresh.id)) && !(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ?", fresh.id)));

  // Delete with history
  await connectMailbox(admin, { userId: worker.id, address: "worker@myseed.test", password: "x" });
  await setPosition(admin, "dev", worker.id, "lead");
  const open = await saveTask(admin, "dev", { title: "Open work", assigneeId: worker.id });
  const doneTask = await saveTask(admin, "dev", { title: "Finished work", assigneeId: worker.id });
  await run("UPDATE dept_tasks SET status_category = 'done', status = 'released' WHERE id = ?", doneTask);
  const p2 = await acc.deletePreview(admin, worker.id);
  check("history is listed", p2.mode === "anonymise" && p2.history.some((h) => h.label === "department tasks" && h.count === 2), p2);
  await acc.deleteAccount(admin, worker.id, "worker@acc.local");
  const w = await get<{ name: string; email: string; active: number; deleted_at: string | null }>("SELECT name, email, active, deleted_at FROM users WHERE id = ?", worker.id);
  check("with history the account is anonymised", w?.name === "Deleted person" && w.email.endsWith("@deleted.invalid") && !w.active && !!w.deleted_at, w);
  check("roles, positions and the mailbox are gone", !(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ?", worker.id)) && !(await get("SELECT 1 AS x FROM department_positions WHERE user_id = ?", worker.id)) && !(await get("SELECT 1 AS x FROM email_senders WHERE address = 'worker@myseed.test'")));
  check("open work goes back to unassigned, finished work keeps its owner", !(await get<{ a: string | null }>("SELECT assignee_id AS a FROM dept_tasks WHERE id = ?", open))?.a && (await get<{ a: string | null }>("SELECT assignee_id AS a FROM dept_tasks WHERE id = ?", doneTask))?.a === worker.id);
  check("the email can be used again", !!(await upsertAccount({ name: "New worker", email: "worker@acc.local", roles: ["developer"], password: "Accounts-2026!", mustChangePassword: false })).created);
  check("deleted accounts are left out of Admin, People", !(await listUsers({ includeInactive: true })).some((u) => u.id === worker.id));
  check("the deletion is recorded", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'user.deleted'")));
  check("a deleted account cannot be deleted twice", !!(await throws(() => acc.deleteAccount(admin, worker.id, "x"))));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
