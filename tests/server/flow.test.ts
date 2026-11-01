// Phase 12 checks: the department flow. The Dev flow end to end (intake, work with a limit and checklist, code
// review, QA with accept and bugs, release), a reviewed flow from a template, a merged pull request moving work on,
// and the flow's own rules.
import { get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { createDepartment, getDeptConfig, saveDeptConfig } from "../../src/server/dept-config";
import { getTask, listTasks, moveTask, saveTask } from "../../src/server/work";
import * as flow from "../../src/server/dept-flow";
import { taskToInput } from "../../src/server/work-extras";
import { applyFlowPreset, normalizeFlow } from "../../src/lib/dept-flow";
import { departmentChapter } from "../../src/lib/help-departments";

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
const row = (id: string) => get<{ status: string; flow_state: string | null; assignee_id: string | null; flow_note: string | null; labels: string; release_id: string | null; priority: string }>(
  "SELECT status, flow_state, assignee_id, flow_note, labels, release_id, priority FROM dept_tasks WHERE id = ?",
  id,
);

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string) => (await loadUser((await upsertAccount({ name: key, email: `${key}@flow.local`, title: "Developer", roles: ["developer"], password: "Flow-Test-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("lead");
  const dev1 = await mk("dev1");
  const tester = await mk("tester");
  await setPosition(admin, "dev", lead.id, "lead");

  // Configure: the ready Dev flow, with the tester checking QA.
  const base = await getDeptConfig("dev");
  check("Dev starts with its ready flow on", base.flow.on && base.flow.stages.some((s) => s.status === "qa"));
  const withFlow = applyFlowPreset(base, "dev");
  Object.assign(withFlow.flow.stages.find((s) => s.status === "qa")!, { checkers: "people", people: [tester.id] });
  check("the ready flow adds the statuses it needs", ["review", "qa", "ready_release", "released"].every((k) => withFlow.statuses.some((s) => s.key === k)));
  check("and the tests and docs checklist", withFlow.types.find((t) => t.key === "bug")!.checklist.some((l) => l.text === "Tests added or updated"));
  const noTester = applyFlowPreset(base, "dev");
  Object.assign(noTester.flow.stages.find((s) => s.status === "qa")!, { checkers: "people", people: [] });
  check("QA checked by named people needs someone named", /name at least one person/.test((await throws(() => saveDeptConfig(admin, "dev", noTester, base.version))) ?? ""));
  await saveDeptConfig(admin, "dev", withFlow, base.version);
  const cfg = await getDeptConfig("dev");
  check("the flow is saved and on", cfg.flow.on && cfg.flow.stages.length === 6);

  // Intake: a bug is triaged and planned to a developer.
  const bugId = await saveTask(lead, "dev", { title: "Login button does nothing", type: "bug" });
  let home = (await flow.flowHome(lead, "dev"))!;
  check("new work waits in the lead's intake", home.desk!.lead && home.desk!.intake.some((c) => c.id === bugId));
  await flow.flowPlan(lead, "dev", bugId, { priority: "high", assigneeId: dev1.id });
  let r = (await row(bugId))!;
  check("planning sends it to the developer's To do", r.status === "todo" && r.flow_state === "todo" && r.assignee_id === dev1.id && r.priority === "high", r);

  // Members cannot skip stages.
  check("a member cannot drag work into QA", /move on with the buttons/.test((await throws(() => moveTask(dev1, "dev", bugId, "qa", null))) ?? ""));

  // Work: start, the limit of two in progress, the checklist before Done.
  home = (await flow.flowHome(dev1, "dev"))!;
  check("it is on the developer's own board", home.mine.some((c) => c.id === bugId && c.state === "todo"));
  await flow.flowStart(dev1, "dev", bugId);
  r = (await row(bugId))!;
  check("start moves it to In progress", r.status === "in_progress" && r.flow_state === "working", r);
  check("and the timer runs", !!(await get("SELECT 1 AS x FROM dept_time_entries WHERE task_id = ? AND ended_at IS NULL", bugId)));
  const t2 = await saveTask(lead, "dev", { title: "Second", type: "chore", assigneeId: dev1.id, status: "todo" });
  const t3 = await saveTask(lead, "dev", { title: "Third", type: "chore", assigneeId: dev1.id, status: "todo" });
  await flow.flowStart(dev1, "dev", t2);
  check("a third at once is refused (limit 2)", /limit 2/.test((await throws(() => flow.flowStart(dev1, "dev", t3))) ?? ""));
  check("done is refused while the checklist is open", /still needs/.test((await throws(() => flow.flowDone(dev1, "dev", bugId))) ?? ""));
  const t = await getTask(dev1, "dev", bugId);
  await saveTask(dev1, "dev", { ...taskToInput(t), checklist: t.checklist.map((c) => ({ ...c, done: true })) });
  await flow.flowDone(dev1, "dev", bugId);
  check("done, not sent", (await row(bugId))!.flow_state === "done");
  check("the timer stopped", !(await get("SELECT 1 AS x FROM dept_time_entries WHERE task_id = ? AND ended_at IS NULL", bugId)));
  const sent = await flow.flowSend(dev1, "dev", [bugId]);
  r = (await row(bugId))!;
  check("send moves it to code review", sent[0]!.ok && r.status === "review" && r.flow_state === "todo", { sent, r });

  // Code review: only leads; return needs a note; pass to QA, where it arrives.
  check("a developer cannot pass code review", !(await flow.flowPass(dev1, "dev", [bugId]))[0]!.ok);
  check("a return needs comments", /Say what needs to change/.test((await throws(() => flow.flowCheckReturn(lead, "dev", bugId, " "))) ?? ""));
  await flow.flowPass(lead, "dev", [bugId]);
  r = (await row(bugId))!;
  check("passed code review: arriving in QA", r.status === "qa" && r.flow_state === "arriving", r);

  // QA: the tester sees it, accepts it, and sends it back as a bug.
  check("the tester sees QA work", (await listTasks(tester, "dev")).tasks.some((x) => x.id === bugId));
  home = (await flow.flowHome(tester, "dev"))!;
  check("it arrives on the tester's desk", !!home.desk && home.desk.arriving.some((c) => c.id === bugId));
  check("passing before accepting is refused", /Accept it first/.test((await flow.flowPass(tester, "dev", [bugId]))[0]!.error ?? ""));
  await flow.flowAccept(tester, "dev", [bugId]);
  await flow.flowCheckReturn(tester, "dev", bugId, "1. Open login\n2. Press the button\nNothing happens");
  r = (await row(bugId))!;
  check("a bug goes back to the developer's To do with the steps", r.status === "todo" && r.flow_state === "todo" && r.assignee_id === dev1.id && /Steps to reproduce/.test(r.flow_note ?? ""), r);
  check("and is labelled a bug", JSON.parse(r.labels).includes("bug"));

  // Round two, then release.
  await flow.flowPause(dev1, "dev", t2);
  await flow.flowStart(dev1, "dev", bugId);
  await flow.flowDone(dev1, "dev", bugId);
  await flow.flowSend(dev1, "dev", [bugId]);
  check("the return note is cleared when it moves on", !(await row(bugId))!.flow_note);
  await flow.flowPass(lead, "dev", [bugId]);
  await flow.flowAccept(tester, "dev", [bugId]);
  await flow.flowPass(tester, "dev", [bugId]);
  check("passed QA: ready to release", (await row(bugId))!.status === "ready_release");
  home = (await flow.flowHome(lead, "dev"))!;
  check("the lead sees it ready to release", home.desk!.release.some((c) => c.id === bugId));
  const notes = await flow.draftReleaseNotes(lead, "dev", [bugId]);
  check("release notes are drafted from the tasks", /Login button does nothing/.test(notes) && /Bug/.test(notes), notes);
  check("only leads release", !!(await throws(() => flow.flowRelease(dev1, "dev", { ids: [bugId], name: "v1.0", notes }))));
  const rel = await flow.flowRelease(lead, "dev", { ids: [bugId], name: "v1.0", notes });
  r = (await row(bugId))!;
  check("released", r.status === "released" && r.flow_state === null && r.release_id === rel.id, r);
  check("the release keeps its notes and count", (await get<{ task_count: number }>("SELECT task_count FROM dept_releases WHERE id = ?", rel.id))?.task_count === 1);
  check("a release name is used once", /already a release/.test((await throws(() => flow.flowRelease(lead, "dev", { ids: [bugId], name: "V1.0", notes: "" }))) ?? ""));

  // A merged pull request moves code review on by itself, when the stage says so.
  const c2 = await getDeptConfig("dev");
  const next = structuredClone(c2);
  next.flow.stages.find((s) => s.status === "review")!.autoOnMerge = true;
  await saveDeptConfig(admin, "dev", next, c2.version);
  const prTask = await saveTask(lead, "dev", { title: "Merged by GitHub", type: "chore", assigneeId: dev1.id, status: "review" });
  const code = (await get<{ code: string }>("SELECT code FROM dept_tasks WHERE id = ?", prTask))!.code;
  await run(
    "INSERT INTO integration_cache (key, data, fetched_at) VALUES (?, ?, ?)",
    "gh:dev:org/app",
    JSON.stringify({ fullName: "org/app", openPrs: [], mergedPrs: [{ number: 7, title: `${code} fix`, url: "https://github.com/org/app/pull/7", branch: "fix", mergedAt: nowIso(), tasks: [code] }] }),
    nowIso(),
  );
  const moved = await flow.applyMergedPullRequests();
  check("a merged pull request passes code review", moved === 1 && (await row(prTask))!.status === "qa", { moved, r: await row(prTask) });
  home = (await flow.flowHome(lead, "dev"))!;
  check("cards show the pull request", home.desk!.arriving.find((c) => c.id === prTask)?.prs[0]?.state === "merged");

  // A department from a template brings its flow; there the lead approves before work is finished.
  await createDepartment(admin, { key: "ops-test", title: "Ops test", template: "blank" });
  const ops = await getDeptConfig("ops-test");
  check("a template brings its ready flow, on", ops.flow.on && ops.flow.stages.some((s) => s.review));
  const member = await mk("member");
  await setPosition(admin, "ops-test", member.id, "member");
  await setPosition(admin, "ops-test", lead.id, "lead");
  const job = await saveTask(lead, "ops-test", { title: "Fix the door", assigneeId: member.id });
  await flow.flowStart(member, "ops-test", job);
  await flow.flowDone(member, "ops-test", job);
  await flow.flowSend(member, "ops-test", [job]);
  check("reviewed work goes to the lead", (await row(job))!.flow_state === "sent");
  check("members cannot approve", !!(await throws(() => flow.flowApprove(member, "ops-test", [job]))));
  await flow.flowReturn(lead, "ops-test", job, "The hinge is still loose");
  r = (await row(job))!;
  check("returned with the note, back to To do", r.flow_state === "todo" && r.status === "todo" && r.flow_note === "The hinge is still loose", r);
  await flow.flowStart(member, "ops-test", job);
  await flow.flowDone(member, "ops-test", job);
  await flow.flowSend(member, "ops-test", [job]);
  await flow.flowApprove(lead, "ops-test", [job]);
  r = (await row(job))!;
  check("approved at the last stage: finished", r.status === "done" && r.flow_state === null, r);

  // The flow's own rules.
  const sts = ops.statuses;
  const bad = (stages: unknown[]) => {
    try {
      normalizeFlow({ on: true, stages }, sts);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  check("stages that go round in a circle are refused", /circle/.test(bad([{ status: "todo", kind: "work", next: "in_progress" }, { status: "in_progress", kind: "work", next: "todo" }]) ?? ""));
  check("a status used by two stages is refused", /two stages/.test(bad([{ status: "in_progress", kind: "work", queueStatus: "todo" }, { status: "todo", kind: "work" }]) ?? ""));
  check("a next that is not a stage is refused", /not a stage/.test(bad([{ status: "todo", kind: "work", next: "done" }]) ?? ""));
  check("Help explains the flow", departmentChapter("dev", await getDeptConfig("dev")).sections.some((s) => s.title === "Stage by stage"));

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
