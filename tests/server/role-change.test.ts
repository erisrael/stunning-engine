// Taking a role with its impact first: open work forwarded to the new lead, the role restored, and the person
// continuing where they stopped (only what nobody touched comes back). Team leads see every team on the Overview.
process.env.MAIL_FAKE = "1";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser, type AppUser } from "../../src/server/users";
import * as wf from "../../src/server/workflow";
import * as rc from "../../src/server/role-change";
import { overviewStagesFor } from "../../src/server/overview-teams";

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
const by = async (email: string): Promise<AppUser> => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
const owner = async (itemId: string) => (await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", itemId))?.user_id;

async function main() {
  const admin = await by("admin@demo.local");
  const hana = await by("hana@demo.local");
  const dawit = await by("dawit@demo.local");

  // Overview: a lead sees every team; a member sees their own team's column.
  check("a team lead sees every team on the Overview", (await overviewStagesFor({ ...hana, activeRole: "recording" })) === null);
  check("a member sees their own team on the Overview", JSON.stringify(await overviewStagesFor({ ...dawit, activeRole: "recording" })) === JSON.stringify(["recording"]));

  const items = await all<{ id: string; code: string }>("SELECT id, code FROM items ORDER BY code LIMIT 3");
  check("the demo has items", items.length >= 2, items.length);
  for (const it of items.slice(0, 2)) await wf.assignStage({ actor: admin }, it.id, { stage: "recording", userId: dawit.id });
  const [a, b] = items;

  check("taking a role goes through the impact page", await rc.needsImpactPage(dawit.id, { roles: ["recording"], leads: [] }));
  check("a role they do not hold needs no impact page", !(await rc.needsImpactPage(dawit.id, { roles: ["editing"], leads: [] })));
  const imp = await rc.roleImpact(admin, dawit.id, { roles: ["recording"], leads: [] });
  check("the impact lists their open work", imp.stageWork.length === 2, imp.stageWork);
  check("the impact lists the rights they lose", imp.permsLost.length > 0);
  check("the team lead is offered first to take the work", imp.candidates.recording?.[0]?.id === hana.id, imp.candidates);
  check("members cannot see or change it", await rejects(() => rc.roleImpact(dawit, hana.id, { roles: ["recording"], leads: [] }), /Admin|Operations/));

  // Finish first: nothing changes, the person is asked.
  await rc.requestFinishFirst(admin, dawit.id, { roles: ["recording"], leads: [] }, "Please wrap up by Friday");
  check("finish first keeps the role", !!(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = 'recording'", dawit.id)));
  const mine = await rc.myRoleChanges(dawit);
  check("the person sees what to finish", mine.pending.length === 1 && mine.pending[0]!.work.length === 2, mine.pending);
  check("they cannot report finished with work left", await rejects(() => rc.reportFinished(dawit, mine.pending[0]!.id), /still have/));

  // Forced: the work goes to the new lead. The last role is never taken.
  check("the last role is never taken", await rejects(() => rc.applyRoleChange(admin, dawit.id, { roles: ["recording"], leads: [] }, { recording: hana.id }, "Dawit"), /at least one role/));
  // Dawit keeps another role so the account is not left with none.
  await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'editing') ON CONFLICT DO NOTHING", dawit.id);
  check("a typed confirmation is needed", await rejects(() => rc.applyRoleChange(admin, dawit.id, { roles: ["recording"], leads: [] }, { recording: hana.id }, "wrong"), /Type Dawit/));
  check("someone must take the work", await rejects(() => rc.applyRoleChange(admin, dawit.id, { roles: ["recording"], leads: [] }, {}, "Dawit"), /Choose who takes/));
  const res = await rc.applyRoleChange(admin, dawit.id, { roles: ["recording"], leads: [] }, { recording: hana.id }, "Dawit");
  check("forced: the work was forwarded", res.moved === 2, res);
  check("forced: the role is gone", !(await get("SELECT 1 AS x FROM role_assignments WHERE user_id = ? AND role = 'recording'", dawit.id)));
  check("forced: the parts are with the lead", (await owner(a!.id)) === hana.id && (await owner(b!.id)) === hana.id);
  check("the pending request became the applied change", !!(await get("SELECT 1 AS x FROM role_changes WHERE user_id = ? AND status = 'applied'", dawit.id)));

  // Someone works on one of them in the meantime.
  await new Promise((r) => setTimeout(r, 15));
  await wf.audit({ actor: hana }, { itemId: b!.id, stage: "recording", action: "item.note", summary: "Hana took it further" });

  // The role comes back.
  await run("INSERT INTO role_assignments (user_id, role) VALUES (?, 'recording') ON CONFLICT DO NOTHING", dawit.id);
  await rc.onRolesGiven(admin, dawit.id, { roles: ["recording"] });
  const back = await rc.myRoleChanges(dawit);
  check("restored: they are asked to continue", back.restored.length === 1, back);
  const entries = back.restored[0]?.entries ?? [];
  check("restored: untouched work can come back", entries.find((e) => e.key.includes(a!.id))?.clean === true, entries);
  check("restored: work someone took further stays", entries.find((e) => e.key.includes(b!.id))?.clean === false, entries);
  const done = await rc.resumeWork(dawit, back.restored[0]!.id);
  check("continue: one came back, one stayed", done.back === 1 && done.left === 1, done);
  check("continue: the untouched part is theirs again", (await owner(a!.id)) === dawit.id);
  check("continue: the other stays with the lead", (await owner(b!.id)) === hana.id);
  check("nothing waits for them any more", (await rc.myRoleChangeCount(dawit.id)) === 0);

  // Taking the only lead's position asks for a new lead when the queue would have none.
  const leadImp = await rc.roleImpact(admin, hana.id, { roles: [], leads: ["recording"] });
  check("the lead's impact lists their team", leadImp.removal.leads.includes("recording") && Array.isArray(leadImp.leadQueue), leadImp.removal);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  console.log("FAIL crashed");
  await closeDb().catch(() => {});
  process.exit(1);
});
