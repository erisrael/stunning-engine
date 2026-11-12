// HR: creating app accounts for employees, and deleting employees.
process.env.MAIL_FAKE = "1";
import assert from "node:assert/strict";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { createAppAccountForEmployee, deleteEmployee, saveEmployee } from "../../src/server/hr";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};

const rejects = async (fn: () => Promise<unknown>, re: RegExp) => {
  try {
    await fn();
    return false;
  } catch (e) {
    return re.test(String(e));
  }
};

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const hrManager = (await loadUser((await upsertAccount({ name: "HR Lead", email: "lead@hr.local", title: "HR Manager", roles: ["hr_manager"], password: "HR-Password-2026!", mustChangePassword: false } as never)).id))!;
  const regularStaff = (await loadUser((await upsertAccount({ name: "Regular Staff", email: "staff@demo.local", title: "Staff", roles: ["recording"], password: "Staff-Password-2026!", mustChangePassword: false } as never)).id))!;

  // 1. Save an employee without an app account
  const empId = await saveEmployee(hrManager, {
    fullName: "Abebe Bikila",
    email: "abebe.test@myseed.com.et",
    jobTitle: "Senior Editor",
    department: "editing",
  });
  check("employee created without account", !!empId);

  // 2. Regular staff cannot create app account
  check(
    "regular staff cannot create app account",
    await rejects(() => createAppAccountForEmployee(regularStaff, { employeeId: empId }), /Only HR/),
  );

  // 3. HR creates an app account for Abebe
  const acc = await createAppAccountForEmployee(hrManager, {
    employeeId: empId,
    roles: ["editing"],
  });
  check("account created successfully", !!acc.userId && acc.email === "abebe.test@myseed.com.et" && !!acc.tempPassword);

  const empAfter = await get<{ user_id: string | null }>("SELECT user_id FROM employees WHERE id = ?", empId);
  check("employee is now linked to user", empAfter?.user_id === acc.userId);

  const userRow = await get<{ id: string; email: string; must_change_password: number; active: number }>("SELECT id, email, must_change_password, active FROM users WHERE id = ?", acc.userId);
  check("user record created properly", userRow?.email === "abebe.test@myseed.com.et" && userRow?.must_change_password === 1 && userRow?.active === 1);

  const roleRow = await get<{ role: string }>("SELECT role FROM role_assignments WHERE user_id = ?", acc.userId);
  check("role assigned correctly", roleRow?.role === "editing");

  // 4. Cannot create duplicate account for already linked employee
  check(
    "cannot create second account for linked employee",
    await rejects(() => createAppAccountForEmployee(hrManager, { employeeId: empId }), /already linked/),
  );

  // 5. Creating a second employee to test delete
  const emp2Id = await saveEmployee(hrManager, {
    fullName: "Chala Regassa",
    email: "chala.test@myseed.com.et",
    jobTitle: "Assistant Editor",
    department: "editing",
    managerId: empId,
  });
  check("second employee created reporting to first", !!emp2Id);

  // 6. Regular staff cannot delete employee
  check(
    "regular staff cannot delete employee",
    await rejects(() => deleteEmployee(regularStaff, empId), /Only HR/),
  );

  // 7. Delete employee empId (manager)
  const delRes = await deleteEmployee(hrManager, empId);
  check("employee deleted by HR manager", delRes.id === empId && delRes.name === "Abebe Bikila");

  const empDeleted = await get<{ id: string }>("SELECT id FROM employees WHERE id = ?", empId);
  check("employee record removed from DB", !empDeleted);

  const emp2After = await get<{ manager_id: string | null }>("SELECT manager_id FROM employees WHERE id = ?", emp2Id);
  check("reporting employee manager_id set to null", emp2After?.manager_id === null);

  // 8. Delete second employee with deleteUserAccount flag
  const emp2Acc = await createAppAccountForEmployee(hrManager, {
    employeeId: emp2Id,
    roles: ["editing"],
  });
  check("second employee account created", !!emp2Acc.userId);

  const delEmp2Res = await deleteEmployee(admin, emp2Id, { deleteUserAccount: true });
  check("second employee deleted with user cleanup", delEmp2Res.id === emp2Id);

  const emp2Check = await get<{ id: string }>("SELECT id FROM employees WHERE id = ?", emp2Id);
  check("second employee record deleted", !emp2Check);

  console.log(`\nResults: ${pass} passed, ${fail} failed.`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
}).finally(() => closeDb());

