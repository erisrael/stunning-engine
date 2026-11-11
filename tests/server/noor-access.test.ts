// Admin, Noor access: saved Noor logins shared by several people, per-person tables in bulk, role defaults,
// own logins, reset and revoke, and the data policy for syncing, clearing and snapshots.
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import * as A from "../../src/server/cms-access";
import { allowedCategoriesForUser, getLegacyCmsConfigForUser, canManageCmsData, syncLegacyCms } from "../../src/server/legacy-cms";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const err = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const hana = await by("hana@demo.local");
  const dawit = await by("dawit@demo.local");

  check("only Admin opens Noor access", !!(await err(() => A.cmsAccessOverview(hana))));
  const o = await A.cmsAccessOverview(admin);
  check("the overview lists people with departments, roles and stored data", o.people.length > 3 && o.people.every((p) => Array.isArray(p.roles)) && o.stored.tables.length === 7, o.people.length);

  const acc = await A.saveCmsAccount(admin, { label: "Finance team", username: "finance@noor.test", password: "secret-1" });
  await A.grantCmsAccess(admin, { userIds: [hana.id, dawit.id], tables: ["invoices", "subscriptions"], login: { kind: "account", accountId: acc } });
  const [ch, cd] = [await getLegacyCmsConfigForUser(hana), await getLegacyCmsConfigForUser(dawit)];
  check("two people share one saved Noor login", ch.username === "finance@noor.test" && cd.username === "finance@noor.test" && ch.password === "secret-1");
  check("their tables are what Admin gave them", JSON.stringify(await allowedCategoriesForUser(dawit.roles[0], dawit.id)) === JSON.stringify(["invoices", "subscriptions"]));
  await A.grantCmsAccess(admin, { userIds: [dawit.id], addTables: ["feedback"], removeTables: ["subscriptions"] });
  check("tables can be added and removed in bulk", JSON.stringify((await allowedCategoriesForUser(dawit.roles[0], dawit.id)).sort()) === JSON.stringify(["feedback", "invoices"]));
  check("an own login needs a password the first time", /password/.test((await err(() => A.grantCmsAccess(admin, { userIds: [dawit.id], login: { kind: "own", username: "dawit@noor.test" } }))) ?? ""));
  await A.grantCmsAccess(admin, { userIds: [dawit.id], login: { kind: "own", username: "dawit@noor.test", password: "pw-2" } });
  check("a person can have their own Noor login", (await getLegacyCmsConfigForUser(dawit)).username === "dawit@noor.test");
  const ov = await A.cmsAccessOverview(admin);
  check("the overview shows each person's login", ov.people.find((p) => p.id === hana.id)?.login.label === "Finance team" && ov.people.find((p) => p.id === dawit.id)?.login.kind === "own" && ov.accounts[0].users === 1);
  await A.deleteCmsAccount(admin, acc);
  check("removing a saved login moves its people to the shared login", (await getLegacyCmsConfigForUser(hana)).username !== "finance@noor.test");

  // Data policy.
  check("by default only Admin manages the stored data", (await canManageCmsData(admin)) && !(await canManageCmsData(hana)));
  await A.grantCmsAccess(admin, { userIds: [hana.id], canManageData: true });
  check("allowing a person does nothing while the policy is Admin only", !(await canManageCmsData(hana)));
  await A.setCmsDataPolicy(admin, "granted");
  check("with the policy open, the allowed person manages data", await canManageCmsData(hana));
  check("others still cannot sync", /Admin/.test((await err(() => syncLegacyCms(dawit, { category: "invoices" }))) ?? ""));

  await A.resetCmsAccess(admin, [dawit.id]);
  check("reset goes back to the role's tables and the shared login", (await A.cmsAccessOverview(admin)).people.find((p) => p.id === dawit.id)?.override === null);
  await A.revokeCmsAccess(admin, [hana.id]);
  check("no access means no tables", (await allowedCategoriesForUser(hana.roles[0], hana.id)).length === 0);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
