// The Dev team's record (docs/dev-history.json): nothing without the Kidus Dev account; then the projects, sprints,
// releases with deployments and tasks, assigned to him, finished work released and 100 % on the roadmap, the
// maintenance project open with its sprint and backlog, velocity from the closed sprints, DORA from the releases;
// running again adds nothing and leaves changes made in the app alone. The file itself is checked too.
process.env.MAIL_FAKE = "1";
import fs from "node:fs";
import { all, get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { applyDevHistory, type DevHistory, type DoneTask } from "../../src/server/dev-history";
import { doraMeasures, roadmap, sprintPage } from "../../src/server/dev-studio";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};

async function main() {
  // The file.
  const h = JSON.parse(fs.readFileSync("docs/dev-history.json", "utf8")) as DevHistory;
  const codes = h.projects.flatMap((p) => p.tasks.map((t) => (Array.isArray(t) ? t[0] : t.code)));
  check("every task code is unique and starts with its project key", new Set(codes).size === codes.length && h.projects.every((p) => p.tasks.every((t) => (Array.isArray(t) ? t[0] : t.code).startsWith(`${p.key}-`))));
  const done = h.projects.flatMap((p) => p.tasks.filter((t): t is DoneTask => Array.isArray(t)));
  const releases = new Set(h.releases.map((r) => r.name));
  // Myseed Ops work shipped in a release; other projects' built work may not be released yet (an empty release).
  const shipped = done.filter((t) => t[6]);
  check("every released task names a known release and fits a sprint", shipped.length > 100 && shipped.every((t) => releases.has(t[6]) && h.sprints.some((s) => s.start <= t[5] && t[5] <= s.end) && t[4] <= t[5]), shipped.filter((t) => !releases.has(t[6]) || t[4] > t[5]).map((t) => t[0]));
  check("no task ships before its release date is reached", shipped.every((t) => t[5] <= h.releases.find((r) => r.name === t[6])!.date), shipped.filter((t) => t[5] > h.releases.find((r) => r.name === t[6])!.date).map((t) => t[0]));
  check("every finished task starts before it ends", done.every((t) => t[4] <= t[5]));
  const open = h.projects.flatMap((p) => p.tasks.filter((t) => !Array.isArray(t))) as { code: string; sprint?: string; milestone?: string; status: string }[];
  check("planned work names a known sprint and milestone; the backlog has no sprint", open.every((t) => (!t.sprint || h.sprints.some((s) => s.name === t.sprint)) && (t.status === "backlog" ? !t.sprint : true)) && h.projects.every((p) => p.tasks.every((t) => Array.isArray(t) || !t.milestone || p.milestones.some((m) => m.name === t.milestone))), open.filter((t) => t.sprint && !h.sprints.some((s) => s.name === t.sprint)).map((t) => t.code));

  // Without the account, nothing.
  const first = await applyDevHistory();
  check("nothing is added without the Kidus Dev account", !first.applied && /Kidus/.test(first.reason ?? "") && !(await get("SELECT 1 AS x FROM dept_projects WHERE key = 'CORE'")), first);

  const kidus = (await loadUser((await upsertAccount({ name: "Kidus Sebsibe", email: "kidus.dev@history.local", title: "Developer", roles: ["developer"], password: "History-2026!", mustChangePassword: false })).id))!;
  await upsertAccount({ name: "Kidus Admin", email: "kidus.admin@history.local", title: "Admin", roles: ["admin"], password: "History-2026!", mustChangePassword: false });
  const r = await applyDevHistory();
  check("applied for the Dev account (the Developer role preferred)", r.applied && r.owner === "Kidus Sebsibe", r);
  check("all projects, sprints and releases are added", r.projects === h.projects.length && r.sprints === h.sprints.length && r.releases === h.releases.length, r);
  check("and every task", r.tasks === codes.length, r);
  check("Kidus heads the Dev team", (await get<{ position: string }>("SELECT position FROM department_positions WHERE department = 'dev' AND user_id = ?", kidus.id))?.position === "head");

  const tasks = await all<{ code: string; status: string; status_category: string; assignee_id: string | null; release_id: string | null; sprint_id: string | null; completed_at: string | null; start_date: string | null; due_date: string | null; points: number }>(
    "SELECT code, status, status_category, assignee_id, release_id, sprint_id, completed_at, start_date, due_date, points FROM dept_tasks WHERE dept = 'dev'",
  );
  const finished = tasks.filter((t) => t.status_category === "done");
  check("finished work is done, assigned to Kidus and on the timeline", finished.length === done.length && finished.every((t) => t.status === "released" && t.assignee_id === kidus.id && t.completed_at && t.start_date && t.due_date));
  check("released work is in its sprint and release", finished.filter((t) => shipped.some((x) => x[0] === t.code)).every((t) => t.release_id && t.sprint_id));
  const planned = await all<{ code: string; start_date: string | null; due_date: string | null; fields: string; checklist: string; assignee_id: string | null }>("SELECT code, start_date, due_date, fields, checklist, assignee_id FROM dept_tasks WHERE dept = 'dev' AND status_category = 'open' AND sprint_id IS NOT NULL");
  check("planned work is on the timeline for Kidus, with its acceptance criteria and checklist", planned.length > 30 && planned.every((t) => t.start_date && t.due_date && t.start_date <= t.due_date && t.assignee_id === kidus.id) && planned.filter((t) => JSON.parse(t.fields).acceptance).length > 30 && planned.some((t) => JSON.parse(t.checklist).length === 2));
  const maint = tasks.filter((t) => t.code.startsWith("MAINT-"));
  check("maintenance work is open: the sprint's to-dos for Kidus, the rest in the backlog", maint.length > 0 && maint.every((t) => t.status_category === "open") && maint.some((t) => t.status === "todo" && t.assignee_id === kidus.id && t.sprint_id) && maint.some((t) => t.status === "backlog" && !t.sprint_id));

  const map = await roadmap(kidus, "dev");
  const core = map.projects.find((p) => p.key === "CORE");
  const m = map.projects.find((p) => p.key === "MAINT");
  const ongoing = ["OPS", "MAINT", "WEB", "SCHOOL", "VERIFY"];
  // Four main projects; Myseed Ops holds its 13 parts and adds up their progress.
  const opsRow = map.projects.find((p) => p.key === "OPS");
  check("four main projects; the Ops parts sit in Myseed Ops", map.projects.filter((p) => !p.parent_key).map((p) => p.key).sort().join() === "OPS,SCHOOL,VERIFY,WEB" && map.projects.filter((p) => p.parent_key === "OPS").length === 13 && opsRow?.parts === 13, map.projects.map((p) => [p.key, p.parent_key]));
  check("Myseed Ops adds up its parts: nearly all done, still open for maintenance", !!opsRow && opsRow.progress > 80 && opsRow.progress < 100 && opsRow.health !== "done", opsRow && [opsRow.progress, opsRow.health]);
  check("delivered projects are done at 100 % with Kidus on the team", !!core && core.progress === 100 && core.health === "done" && core.team.includes("Kidus Sebsibe") && map.projects.filter((p) => !ongoing.includes(p.key)).every((p) => p.progress === 100 && p.health === "done"), map.projects.map((p) => [p.key, p.progress, p.health]));
  const web = map.projects.find((p) => p.key === "WEB");
  check("the website is mostly done; SchoolHub and Transaction Verify are part way", !!web && web.progress >= 60 && web.progress < 100 && ["SCHOOL", "VERIFY"].every((k) => { const p = map.projects.find((x) => x.key === k); return !!p && p.progress > 30 && p.progress < 100 && p.health !== "done"; }), map.projects.filter((p) => ongoing.includes(p.key)).map((p) => [p.key, p.progress, p.health]));
  check("the maintenance project is active and open", !!m && m.health !== "done" && m.progress === 0 && m.nextMilestone?.name === "Sprint 3 follow-ups", m);

  const sp = await sprintPage(kidus, "dev");
  check("the current sprint is Sprint 3, with its to-dos; Sprints 4 to 6 are planned", sp.current?.name === "Sprint 3" && sp.current.status === "active" && sp.tasks.length >= 5 && sp.sprints.filter((s) => s.status === "planned").length === 3);
  check("velocity comes from the closed sprints", (sp.velocity.average ?? 0) > 0 && sp.sprints.filter((s) => s.status === "closed").every((s) => Number(s.done_units) > 0 && s.review_note), sp.velocity);
  const deploys = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dev_deployments WHERE dept = 'dev' AND environment = 'production' AND status = 'ok'"))?.n);
  check("every release has its production deployment", deploys === h.releases.length);
  const dora = await doraMeasures(kidus, "dev");
  check("DORA measures come from the releases", dora.releases === h.releases.length && dora.leadTimeHours !== null && dora.leadTimeHours >= 0, dora);
  const rel = await get<{ task_count: number }>("SELECT task_count FROM dept_releases WHERE dept = 'dev' AND name = 'v0.1.0'");
  check("releases count their tasks", Number(rel?.task_count) > 0);
  check("new task codes continue after the recorded ones", Number((await get<{ n: number }>("SELECT next_number AS n FROM dept_projects WHERE key = 'CORE'"))?.n) === 16);

  // Again: nothing changes, and edits in the app stay.
  await run("UPDATE dept_tasks SET title = 'Renamed in the app' WHERE code = 'CORE-1'");
  const again = await applyDevHistory();
  check("running again with the same file does nothing", !again.applied && again.reason === "already applied");
  await run("UPDATE dept_projects SET parent_id = NULL WHERE dept = 'dev' AND key = 'FUN'");
  const forced = await applyDevHistory({ force: true });
  check("a part moved out of its main project stays out", !(await get<{ p: string | null }>("SELECT parent_id AS p FROM dept_projects WHERE dept = 'dev' AND key = 'FUN'"))?.p);
  check("forcing adds nothing new and keeps edits", forced.applied && forced.tasks === 0 && forced.projects === 0 && forced.skipped === codes.length && (await get<{ title: string }>("SELECT title FROM dept_tasks WHERE code = 'CORE-1'"))?.title === "Renamed in the app", forced);
  check("no project twice", Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_projects WHERE dept = 'dev' AND key = 'CORE'"))?.n) === 1);

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
