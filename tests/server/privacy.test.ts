// Phase 16.5 checks: the privacy notice and its versions, acceptance; the retention schedule removing old records
// and logging it; who opened whose HR record or payslip; Download my data (and no password in it).
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { getEmployee, syncFromUsers } from "../../src/server/hr";
import * as pv from "../../src/server/privacy";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
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
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@pv.local`, title: "Staff", roles: roles as never, password: "Privacy-2026!", mustChangePassword: false })).id))!;
  const staff = await mk("pvstaff", ["developer"]);
  const hr = await mk("pvhr", ["hr_manager"]);
  await syncFromUsers(admin);

  check("no notice, nothing to accept", (await pv.privacyToAccept(staff)) === null);
  check("staff cannot change it", !!(await throws(() => pv.savePrivacy(staff, { notice: "x" }))));
  const v1 = await pv.savePrivacy(hr, { notice: "We keep your record for HR." });
  check("HR writes the notice (version 1)", v1 === 1);
  check("everyone must accept it", (await pv.privacyToAccept(staff))?.version === 1);
  await pv.acceptPrivacy(staff, 1);
  check("accepted", (await pv.privacyToAccept(staff)) === null && (await pv.acceptanceReport(admin)).accepted >= 1);
  check("saving the same text keeps the version", (await pv.savePrivacy(hr, { notice: "We keep your record for HR.", retention: { notificationsDays: 30 } })) === 1);
  const v2 = await pv.savePrivacy(hr, { notice: "We keep your record for HR. Changed." });
  check("a changed notice is version 2, accepted again", v2 === 2 && (await pv.privacyToAccept(staff))?.version === 2);
  check("an old version cannot be accepted", /changed/.test((await throws(() => pv.acceptPrivacy(staff, 1))) ?? ""));

  // Retention.
  const old = new Date(Date.now() - 400 * 864e5).toISOString();
  await run("INSERT INTO notifications (id, user_id, type, title, read_at, created_at, updated_at) VALUES (?, ?, 'hr', 'Old notice', ?, ?, ?)", uid("ntf_"), staff.id, old, old, old);
  await run("INSERT INTO notifications (id, user_id, type, title, created_at, updated_at) VALUES (?, ?, 'hr', 'Old unread notice', ?, ?)", uid("ntf_"), staff.id, old, old);
  await run("INSERT INTO page_visits (day, user_id, role, section, n) VALUES (?, ?, 'developer', '/dev', 3)", "2020-01-01", staff.id);
  const removed = await pv.applyRetention();
  check("old read notifications and visits are removed", (removed["read notifications"] ?? 0) >= 1 && (removed["page visits"] ?? 0) >= 1, removed);
  check("unread ones stay", !!(await get("SELECT 1 AS x FROM notifications WHERE title = 'Old unread notice'")));
  check("what was removed is in the audit log", !!(await get("SELECT 1 AS x FROM audit_events WHERE action = 'privacy.retention'")));

  // Who opened whose record.
  const emp = (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", staff.id))!.id;
  await getEmployee(hr, emp);
  await getEmployee(hr, emp);
  const own = (await get<{ id: string }>("SELECT id FROM employees WHERE user_id = ?", hr.id))!.id;
  await getEmployee(hr, own);
  const log = await pv.accessLog(admin);
  check("opening someone's HR record is logged once an hour", log.filter((l) => l.viewer === "pvhr" && l.what === "hr_record").length === 1, log);
  check("one's own is not", !log.some((l) => l.employee === "pvhr"));
  check("only Admin and HR managers see the log", !!(await throws(() => pv.accessLog(staff))));

  // Download my data.
  const data = await pv.myData(staff);
  check("my data has the account and HR record", (data.account as { email: string }).email === "pvstaff@pv.local" && data.hrRecord.length === 1 && Array.isArray(data.leave));
  check("and no password", !JSON.stringify(data).includes("password_hash") && !JSON.stringify(data).includes("$scrypt"));
  void nowIso;

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
