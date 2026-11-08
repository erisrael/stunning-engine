import assert from "node:assert/strict";
import { sidebarHidden, pruneSidebar } from "../../src/lib/sidebar-visibility";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { saveSidebarDefaults, sidebarDefaults } from "../../src/server/ui-prefs";

async function main() {
  assert.equal(sidebarHidden("/dev/board?assignee=me", ["/dev"]), true);
  assert.equal(sidebarHidden("/development", ["/dev"]), false);
  assert.equal(sidebarHidden("/admin?sort=name&tab=people", ["/admin?tab=people"]), true);
  assert.equal(sidebarHidden("/admin?tab=teams", ["/admin?tab=people"]), false);
  assert.equal(sidebarHidden("/sheet?grade=2", ["views"]), true);
  console.log("PASS Hidden sections cover descendants and filtered links without hiding unrelated destinations");
  const group = {href:"/admin?tab=people",gather:true,sub:[{href:"/admin?tab=people",label:"People"},{href:"/admin?tab=teams",label:"Teams"}]};
  const pruned = pruneSidebar([group],["/admin?tab=people"]);
  assert.equal(pruned[0].href,"/admin?tab=teams");assert.equal(pruned[0].sub.length,1);
  assert.deepEqual(pruneSidebar([group],["/admin"]),[]);
  assert.deepEqual(pruneSidebar([{href:"/content",id:"views",gather:true,sub:[{href:"/content",label:"List"},{href:"/sheet",label:"Sheet"}]}],["views"]),[]);
  console.log("PASS Gathered groups retarget to visible destinations and disappear when all children are hidden");
  const admin=(await loadUser((await get<{id:string}>("SELECT id FROM users WHERE email='admin@demo.local'"))!.id))!;
  const rules=Array.from({length:85},(_,i)=>`/admin?tab=entry-${i}`);
  await saveSidebarDefaults(admin,"developer",[...rules,"//outside.test","/bad path","views","/dev"]);
  const saved=(await sidebarDefaults()).developer!;
  assert.equal(saved.length,87);assert.ok(saved.includes(rules[84]));assert.equal(sidebarHidden("/dev/repos",saved),true);
  assert.deepEqual(pruneSidebar([{href:"/dev/repos"}],[...saved,...[]]),[]);
  console.log("PASS More than 60 admin choices persist and personal Show everything cannot restore admin-hidden entries");
}
main().catch(e=>{console.error(e);process.exitCode=1;}).finally(closeDb);
