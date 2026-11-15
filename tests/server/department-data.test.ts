import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { getDeptConfig, saveDeptConfig, workAccess } from "../../src/server/dept-config";
import { bulkTasks, importTasks, listTasks, saveTask } from "../../src/server/work";

let failures = 0;
function check(name: string, result: boolean) { console.log(`${result ? "PASS" : "FAIL"} ${name}`); if (!result) failures++; }
async function denied(fn: () => Promise<unknown>) { try { await fn(); return false; } catch (e) { return (e as { code?: string }).code === "FORBIDDEN"; } }
async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const member = (await loadUser((await upsertAccount({ name: "Data member", email: "data-member@test.local", title: "Developer", roles: ["developer"], password: "Data-Manager-2026!", mustChangePassword: false })).id))!;
  const first = await saveTask(member, "dev", { title: "First record" });
  const second = await saveTask(member, "dev", { title: "Second record" });
  const other = await saveTask(admin, "dev", { title: "Private record" });
  check("membership limits visible rows", !(await listTasks(member, "dev", {})).tasks.some(t => t.id === other));
  const mixed = await bulkTasks(member, "dev", [first, other], { delete: true });
  check("bulk checks each record and reports failures", mixed[0].ok && !mixed[1].ok);
  check("cross-department IDs cannot be modified", !(await bulkTasks(admin, "marketing", [second], { delete: true }))[0].ok);
  let cfg = await getDeptConfig("dev");
  await saveDeptConfig(admin, "dev", { ...cfg, rights: { ...cfg.rights, member: { ...cfg.rights.member, dataManager: false, createTasks: false, updateTasks: false, deleteTasks: false, bulkActions: false } } }, cfg.version);
  check("Data Manager access can be disabled", !(await workAccess(member, "dev")).rights.dataManager);
  check("create permission is enforced by server", await denied(() => saveTask(member, "dev", { title: "Forbidden" })));
  check("update permission applies to own records", await denied(() => saveTask(member, "dev", { id: second, title: "Forbidden" })));
  check("delete permission applies to own records", await denied(() => bulkTasks(member, "dev", [second], { delete: true })));
  cfg = await getDeptConfig("dev");
  await saveDeptConfig(admin, "dev", { ...cfg, rights: { ...cfg.rights, member: { ...cfg.rights.member, updateTasks: true } } }, cfg.version);
  check("bulk permission is independent from update", await denied(() => bulkTasks(member, "dev", [second, other], { priority: "high" })));
  check("bulk import cannot bypass bulk permission", await denied(() => importTasks(member, "dev", [{ title: "one" }, { title: "two" }])));
  check("single-row editing remains available", (await bulkTasks(member, "dev", [second], { priority: "high" }))[0].ok);
  check("admin retains full access", (await workAccess(admin, "dev")).rights.createTasks);
}
main().catch(e => { console.error(e); failures++; }).finally(async () => { await closeDb(); process.exitCode = failures ? 1 : 0; });
