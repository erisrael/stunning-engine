// Phase 12b checks: sprints (next sprint from the settings, planning, capacity, burndown with scope added late,
// stand-ups, retrospective actions as tasks, closing with carry-over and velocity), the roadmap's health, specs
// with versions, reviewers and requirement tracing, and DORA from releases.
import { get, run, closeDb, nowIso } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { getDeptConfig, saveDeptConfig } from "../../src/server/dept-config";
import { saveProject, saveTask } from "../../src/server/work";
import * as ds from "../../src/server/dev-studio";

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
  const mk = async (key: string) => (await loadUser((await upsertAccount({ name: key, email: `${key}@ds.local`, title: "Developer", roles: ["developer"], password: "Dev-Studio-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("lead");
  const dev = await mk("dev");
  const qa = await mk("qa");
  await setPosition(admin, "dev", lead.id, "lead");
  const cfg = await getDeptConfig("dev");
  check("Dev has sprints on, in story points", cfg.features.sprints && cfg.sprint.unit === "points");
  await saveDeptConfig(admin, "dev", { ...cfg, sprint: { ...cfg.sprint, lengthWeeks: 1, definitionOfDone: ["Tested on the low-end phone"] } }, cfg.version);

  // Sprints
  check("members do not plan sprints", !!(await throws(() => ds.createNextSprint(dev, "dev"))));
  const s1 = await ds.createNextSprint(lead, "dev", { goal: "Offline lessons" });
  const sp = await get<{ name: string; start_date: string; end_date: string }>("SELECT name, start_date, end_date FROM dept_sprints WHERE id = ?", s1);
  check("the next sprint is named and dated from the settings", sp?.name === "Sprint 1" && (Date.parse(sp.end_date) - Date.parse(sp.start_date)) / 864e5 === 6, sp);
  const t1 = await saveTask(lead, "dev", { title: "Download a part", assigneeId: dev.id, points: 5 });
  const t2 = await saveTask(lead, "dev", { title: "Play offline", assigneeId: dev.id, points: 3 });
  const t3 = await saveTask(lead, "dev", { title: "Sync progress", assigneeId: qa.id, points: 8 });
  check("story points are kept", Number((await get<{ points: number }>("SELECT points FROM dept_tasks WHERE id = ?", t1))?.points) === 5);
  let page = await ds.sprintPage(lead, "dev", s1);
  check("new work is in the backlog", [t1, t2, t3].every((id) => page.backlog.some((b) => b.id === id)));
  await ds.planTask(lead, "dev", t1, s1);
  await ds.planTask(lead, "dev", t2, s1);
  await ds.setSprintCapacity(lead, "dev", dev.id, 6);
  page = await ds.sprintPage(lead, "dev", s1);
  const cap = page.capacity.find((c) => c.id === dev.id);
  check("capacity fills per person and shows over-planning", cap?.capacity === 6 && cap.load === 8, cap);
  await ds.startSprint(lead, "dev", s1, "Students learn offline");
  check("a second active sprint is refused", /Close the current sprint/.test((await throws(async () => ds.startSprint(lead, "dev", await ds.createNextSprint(lead, "dev")))) ?? ""));
  // Work added after the start counts as scope added.
  await run("UPDATE dept_sprints SET start_date = ? WHERE id = ?", new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10), s1);
  await run("UPDATE dept_tasks SET sprint_added_at = ? WHERE id IN (?, ?)", new Date(Date.now() - 3 * 864e5).toISOString(), t1, t2);
  await ds.planTask(lead, "dev", t3, s1);
  page = await ds.sprintPage(lead, "dev", s1);
  check("work added after the start is marked", page.tasks.find((t) => t.id === t3)?.addedLate === true);
  check("the burnup shows scope added", (page.burn?.added ?? 0) === 8, page.burn);
  await run("UPDATE dept_tasks SET status = 'released', status_category = 'done', completed_at = ? WHERE id = ?", nowIso(), t1);
  page = await ds.sprintPage(lead, "dev", s1);
  const lastLeft = page.burn!.remaining.filter((x) => x !== null).at(-1);
  check("the burndown counts finished work", lastLeft === 11, page.burn);

  await ds.saveStandup(dev, "dev", s1, { yesterday: "Download", today: "Offline play", blockers: "Need a test phone" });
  page = await ds.sprintPage(lead, "dev", s1);
  check("stand-up notes are kept per person and day", page.standups.some((x) => x.user_id === dev.id && x.blockers === "Need a test phone"));
  check("blockers tell the leads", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE ?", lead.id, "%is blocked%")));

  await ds.addRetro(dev, "dev", s1, "well", "Pairing on downloads");
  await ds.addRetro(dev, "dev", s1, "action", "Buy a low-end test phone");
  page = await ds.sprintPage(lead, "dev", s1);
  const action = page.retro.find((r) => r.kind === "action")!;
  const taskId = await ds.retroToTask(lead, "dev", action.id, lead.id);
  check("a retrospective action becomes a task", !!(await get("SELECT 1 AS x FROM dept_tasks WHERE id = ? AND title = 'Buy a low-end test phone'", taskId)));
  check("only once", /already a task/.test((await throws(() => ds.retroToTask(lead, "dev", action.id, null))) ?? ""));

  const closed = await ds.closeSprint(lead, "dev", s1, "Shown to the content team");
  const s1row = await get<{ status: string; planned_units: number; done_units: number }>("SELECT status, planned_units, done_units FROM dept_sprints WHERE id = ?", s1);
  check("closing keeps what was planned and finished", s1row?.status === "closed" && Number(s1row.planned_units) === 16 && Number(s1row.done_units) === 5, s1row);
  const moved = await get<{ sprint_id: string | null }>("SELECT sprint_id FROM dept_tasks WHERE id = ?", t2);
  check("unfinished work moves to the next sprint", closed.moved === 2 && !!moved?.sprint_id && moved.sprint_id !== s1, closed);
  page = await ds.sprintPage(lead, "dev");
  check("velocity comes from closed sprints", page.velocity.average === 5, page.velocity);

  // Roadmap and health
  const pid = await saveProject(lead, "dev", { key: "OFF", name: "Offline app", status: "active", startDate: new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10), dueDate: new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10) } as never);
  await saveTask(lead, "dev", { title: "Cache videos", projectId: typeof pid === "string" ? pid : (pid as { id: string }).id, points: 5 });
  const rm = await ds.roadmap(lead, "dev");
  const p = rm.projects.find((x) => x.key === "OFF");
  check("a project far behind its dates is at risk", p?.health === "at_risk" && p.progress === 0, p);

  // Specs
  const docId = await ds.createDoc(lead, "dev", { kind: "srs", template: "srs_myseed" });
  let doc = await ds.getDoc(lead, "dev", docId);
  check("the Myseed SRS template brings its requirements", doc.trace.some((t) => t.req === "FR-1") && doc.trace.some((t) => t.req === "NFR-1"));
  check("requirements start uncovered", doc.trace.every((t) => !t.covered));
  const code = (await get<{ code: string }>("SELECT code FROM dept_tasks WHERE id = ?", t2))!.code;
  await ds.linkRequirement(lead, "dev", docId, "FR-3", code, true);
  doc = await ds.getDoc(lead, "dev", docId);
  check("a requirement links to a task by its code", doc.trace.find((t) => t.req === "FR-3")?.tasks[0]?.id === t2);
  check("sending for review needs another person", /at least one reviewer/.test((await throws(() => ds.submitDoc(lead, "dev", docId, [lead.id]))) ?? ""));
  await ds.submitDoc(lead, "dev", docId, [dev.id, qa.id]);
  check("only named reviewers decide", !!(await throws(() => ds.decideDoc(admin, "dev", docId, true))));
  check("one approval of two keeps it in review", (await ds.decideDoc(dev, "dev", docId, true)) === "review");
  check("all approvals approve it", (await ds.decideDoc(qa, "dev", docId, true)) === "approved");
  await ds.saveDoc(lead, "dev", docId, { title: "Requirements: offline lessons", body: `${doc.body}\nFR-7 (Could): Share a download with a classmate.` });
  doc = await ds.getDoc(lead, "dev", docId);
  check("changing an approved document starts a new version", doc.version === 2 && doc.status === "draft" && doc.versions.some((v) => v.version === 1 && v.status === "approved"), { v: doc.version, s: doc.status });

  // DORA from releases
  await run("INSERT INTO dept_releases (id, dept, name, notes, task_count, created_by, created_at) VALUES ('rel_t1', 'dev', 'v1.0', '', 1, ?, ?)", lead.id, nowIso());
  await run("UPDATE dept_tasks SET release_id = 'rel_t1' WHERE id = ?", t1);
  const dora = await ds.doraMeasures(lead, "dev");
  check("DORA counts releases and lead time", dora.releases === 1 && dora.leadTimeHours !== null, dora);

  // Phase 12c: the department presentation, with sentences written from the numbers.
  const pres = await (await import("../../src/server/present")).presentData(lead, "dev");
  check("the presentation has the week's numbers and a plain sentence", pres.counts.open > 0 && /this week/.test(pres.say.numbers), pres.say);
  check("the project slide names the project at risk", /Offline app/.test(pres.say.projects ?? ""), pres.say.projects);

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
