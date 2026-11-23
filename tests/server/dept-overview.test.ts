// The department's team overview and dashboard: headline numbers, the flow, who is on what, projects with progress
// and health, throughput, the mix of work, the sprint and releases, and every filter (project, person, type,
// priority, sprint, period). Members see only their own work and what was shared with them.
process.env.MAIL_FAKE = "1";
import { get, run, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { applyDevHistory } from "../../src/server/dev-history";
import { deptOverview } from "../../src/server/dept-overview";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};

async function main() {
  const kidus = (await loadUser((await upsertAccount({ name: "Kidus Sebsibe", email: "kidus@overview.local", title: "Developer", roles: ["developer"], password: "Overview-2026!", mustChangePassword: false })).id))!;
  await applyDevHistory();
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;

  const all = await deptOverview(kidus, "dev", { period: 0 });
  const total = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_tasks WHERE dept = 'dev' AND status_category = 'done'"))?.n);
  check("done in all counts every finished task", all.tiles.doneTotal === total && all.tiles.doneInPeriod === total, all.tiles);
  check("the flow lists the stages with their counts", all.flow.some((s) => s.key === "released" && s.count === total) && all.flow.some((s) => s.key === "backlog" && s.count > 0));
  check("in progress, review, to do and backlog add up to the open work", all.tiles.active + all.tiles.review + all.tiles.todo + all.tiles.backlog === Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM dept_tasks WHERE dept = 'dev' AND status_category NOT IN ('done','cancelled')"))?.n));
  const k = all.team.find((p) => p.id === kidus.id);
  check("who is on what: Kidus with his work, unassigned work apart", !!k && k.todo > 30 && all.team.some((p) => p.id === null && p.todo > 0), all.team.map((p) => [p.name, p.todo, p.doneInPeriod]));
  const web = all.projects.find((p) => p.key === "WEB");
  check("projects with progress, health and the next milestone", !!web && web.progress >= 60 && web.progress < 100 && web.health !== "done" && !!web.next && all.projects.find((p) => p.key === "CORE")?.health === "done");
  check("unfinished projects come before finished ones", all.projects.findIndex((p) => p.health === "done") > all.projects.findIndex((p) => p.health !== "done"));
  check("throughput covers twelve weeks", all.throughput.length === 12);
  check("work by type", all.types.some((t) => t.key === "feature" && t.done > 50));
  check("the current sprint with its committed and finished points", all.sprint?.name === "Sprint 3" && all.sprint.committed > 0 && all.sprint.done > 0 && all.sprint.done <= all.sprint.committed, all.sprint);
  check("velocity from the closed sprints and the latest releases", (all.tiles.velocity ?? 0) > 0 && all.releases.length === 5 && all.releases[0]!.name === "v1.5.0");
  check("recently finished, newest first", all.recent.length === 10 && (all.recent[0]!.done ?? "") >= (all.recent[9]!.done ?? ""));

  // Filters.
  const webId = web!.id;
  const byProject = await deptOverview(kidus, "dev", { project: webId, period: 0 });
  check("filtered by project: only its tasks and its row", byProject.projects.length === 1 && byProject.tiles.doneTotal === web!.done && byProject.filtered);
  const bugs = await deptOverview(kidus, "dev", { type: "feature", period: 0 });
  check("filtered by type", bugs.types.length === 1 && bugs.types[0]!.key === "feature");
  const urgent = await deptOverview(kidus, "dev", { priority: "urgent", period: 0 });
  check("filtered by priority", urgent.tiles.doneTotal === 0 && urgent.tiles.todo + urgent.tiles.backlog >= 2, urgent.tiles);
  const sprint = await deptOverview(kidus, "dev", { sprint: "current", period: 0 });
  check("filtered to the current sprint", sprint.tiles.todo + sprint.tiles.doneTotal === all.sprint!.tasks, sprint.tiles);
  const nobody = await deptOverview(kidus, "dev", { person: "none", period: 0 });
  check("filtered to unassigned work", nobody.team.every((p) => p.id === null || p.todo + p.active + p.review + p.doneInPeriod === 0) && nobody.tiles.doneTotal === 0);
  const week = await deptOverview(kidus, "dev", { period: 7 });
  check("the period changes what counts as done recently, not the totals", week.tiles.doneInPeriod <= all.tiles.doneInPeriod && week.tiles.doneTotal === all.tiles.doneTotal && week.period === 7);
  const odd = await deptOverview(kidus, "dev", { period: 12 });
  check("an unknown period falls back to 30 days", odd.period === 30);

  // Members: counts for the team, lists of their own tasks.
  const member = (await loadUser((await upsertAccount({ name: "Lensa Member", email: "lensa@overview.local", title: "Developer", roles: ["developer"], password: "Overview-2026!", mustChangePassword: false })).id))!;
  await setPosition(admin, "dev", member.id, "member");
  await run("UPDATE dept_tasks SET assignee_id = ? WHERE code = 'WEB-14'", member.id);
  const seen = await deptOverview(member, "dev", { period: 0 });
  check("a member sees only their own work in the numbers", !seen.seeAll && seen.tiles.doneTotal === 0 && seen.tiles.todo + seen.tiles.backlog + seen.tiles.active + seen.tiles.review === 1, seen.tiles);
  check("and in the lists", seen.recent.length === 0 && seen.dueSoon.every((x) => x.code === "WEB-14") && (seen.team.find((p) => p.id === kidus.id)?.now.length ?? 0) === 0);
  check("people outside the department cannot open it", await deptOverview((await loadUser((await upsertAccount({ name: "Mekdes Outside", email: "mekdes@overview.local", title: "Marketing", roles: ["marketing"], password: "Overview-2026!", mustChangePassword: false })).id))!, "dev").then(() => false, () => true));

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
