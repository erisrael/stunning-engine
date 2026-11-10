// Update 1.0, Phase 1: the assistant keeps task creation in scope (members for themselves, leads for their
// own team), batch assignment is for the stage's lead, the profile PIN block and the assistant button follow
// Admin's switches, and the Sheet can count items per grade (so Grade 12 is one click away past the row cap).
process.env.AI_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { prepareOp } from "../../src/server/assistant-ops";
import { createDepartmentRow, setPosition } from "../../src/server/departments";
import { captureConfig, saveCaptureConfig } from "../../src/server/attendance-capture";
import { roleOptions, saveRoleOptions } from "../../src/server/assistant";
import { countItemsByGrade } from "../../src/server/queries";
import { emptyFilters } from "../../src/lib/filters";

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
  const admin = { ...(await by("admin@demo.local")), activeRole: "admin" as const };
  const hana = { ...(await by("hana@demo.local")), activeRole: "recording" as const };
  const dawit = { ...(await by("dawit@demo.local")), activeRole: "recording" as const };
  const yonas = { ...(await by("yonas@demo.local")), activeRole: "editing" as const };

  // A created department: Hana leads it, Dawit is a member, Yonas is not in it.
  await createDepartmentRow(admin, { key: "ops", title: "Ops", template: "general" });
  await setPosition(admin, "ops", hana.id, "lead");
  await setPosition(admin, "ops", dawit.id, "member");

  const own = await prepareOp(dawit, "create_task", { department: "ops", title: "My task" });
  check("a member's task is for themselves when no one is named", own.params.assigneeId === dawit.id, own.params);
  const other = await err(() => prepareOp(dawit, "create_task", { department: "ops", title: "For Hana", assignee_id: hana.id }));
  check("a member cannot create a task for someone else", !!other && /only for yourself/.test(other), other);
  const assign = await err(() => prepareOp(dawit, "assign_task", { department: "ops", task_id: "x", assignee_id: hana.id }));
  check("a member cannot assign tasks", !!assign && /only for yourself/.test(assign), assign);
  const team = await prepareOp(hana, "create_task", { department: "ops", title: "For Dawit", assignee_id: dawit.id });
  check("a lead creates a task for their own team member", team.params.assigneeId === dawit.id, team.params);
  const outside = await err(() => prepareOp(hana, "create_task", { department: "ops", title: "For Yonas", assignee_id: yonas.id }));
  check("a lead cannot create a task for someone outside the team", !!outside && /only to members of Ops/.test(outside), outside);

  // Batch assignment of production parts.
  const memberBatch = await err(() => prepareOp(dawit, "lead_assign_batch", { stage: "recording", assignee_id: dawit.id }));
  check("a member cannot batch-assign parts", !!memberBatch && /Only the recording team lead/.test(memberBatch), memberBatch);
  const wrongTeam = await err(() => prepareOp(hana, "lead_assign_batch", { stage: "recording", assignee_id: yonas.id }));
  check("a lead cannot batch-assign to someone outside the stage", !!wrongTeam && /only to members of the recording team/.test(wrongTeam), wrongTeam);
  const otherStage = await err(() => prepareOp(hana, "lead_assign_batch", { stage: "editing", assignee_id: yonas.id }));
  check("a lead cannot batch-assign another stage's work", !!otherStage && /Only the editing team lead/.test(otherStage), otherStage);
  const ok = await err(() => prepareOp(hana, "lead_assign_batch", { stage: "recording", assignee_id: dawit.id }));
  check("the stage lead passes the role check", !ok || !/team lead|members of the/.test(ok), ok);

  // Profile PIN switch.
  check("the PIN shows on profiles by default", (await captureConfig()).methods.profilePin === true);
  const cfg = await captureConfig();
  await saveCaptureConfig(admin, { ...cfg, methods: { ...cfg.methods, profilePin: false } });
  check("Admin can hide the PIN on profiles", (await captureConfig()).methods.profilePin === false);

  // Assistant button default per role.
  check("the assistant shows by default", (await roleOptions("recording")).shown === true);
  await saveRoleOptions(admin, { recording: { shown: false } });
  check("Admin can hide it by default for a role", (await roleOptions("recording")).shown === false && (await roleOptions("editing")).shown === true);

  // Items per grade, in curriculum order, ignoring the grade filter itself.
  const grades = await countItemsByGrade(admin, emptyFilters(), new Date().toISOString());
  const withGrade = await countItemsByGrade(admin, { ...emptyFilters(), g: grades.map((g) => g.id).slice(0, 1) }, new Date().toISOString());
  check("grade counts are listed", grades.length > 0 && grades.every((g) => Number(g.c) > 0), grades);
  check("the grade filter does not hide other grades' chips", JSON.stringify(withGrade) === JSON.stringify(grades), { grades, withGrade });

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
