// Phase 17: the KPI library seeded from the measures, templates matched to people (most specific first), scorecards
// from real work (on time, sent back, attendance), targets by leads (HR approves changes to a started month), typed
// values, weights checked, closing a month freezes it and corrections need HR, team and company views with the
// spread of ratings, OKRs (levels and rights, limits, check-ins, off track told, linked measures, linked tasks),
// the scheduled job and the presentation slides.
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { syncFromUsers } from "../../src/server/hr";
import * as pf from "../../src/server/performance";
import { kpiScore } from "../../src/lib/performance";

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
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  for (const [email, name] of [
    ["perfhead@demo.local", "Perf Head"],
    ["perfdev@demo.local", "Perf Dev"],
  ] as const)
    await upsertAccount({ email, name, roles: ["developer"], password: "Demo-Workflow-2026" });
  const headU = await by("perfhead@demo.local");
  const devU = await by("perfdev@demo.local");
  await setPosition(admin, "dev", headU.id, "head");
  await setPosition(admin, "dev", devU.id, "member");
  await syncFromUsers(admin);
  const head = (await loadUser(headU.id))!;
  const dev = (await loadUser(devU.id))!;
  const sara = await by("sara@demo.local");

  // Scoring rules.
  check("percent of target, capped at 120", kpiScore({ direction: "up", scoring: "percent", bands: {} }, 30, 20) === 120 && kpiScore({ direction: "up", scoring: "percent", bands: {} }, 10, 20) === 50);
  check("lower is better: target over actual", kpiScore({ direction: "down", scoring: "percent", bands: {} }, 20, 10) === 50);
  check("lower is better with a zero target: each one costs 20", kpiScore({ direction: "down", scoring: "percent", bands: {} }, 2, 0) === 60);
  check("bands and pass", kpiScore({ direction: "up", scoring: "bands", bands: { green: 90, amber: 70 } }, 80, 90) === 70 && kpiScore({ direction: "up", scoring: "pass", bands: {} }, 5, 4) === 100);

  // Library and templates.
  const kpis = await pf.listKpis();
  check("the library starts with a KPI per measure", kpis.length >= 16 && kpis.some((k) => k.key === "tasks_on_time" && k.minSample === 5));
  const tpls = await pf.listTemplates();
  check("ready templates for Myseed's roles", ["Recording", "Editing", "Developer", "Tech lead", "Customer support agent", "Everyone else"].every((n) => tpls.some((t) => t.name === n)));
  check("a developer gets the Developer template", (await pf.templateFor(dev))?.name === "Developer");
  check("a head gets Tech lead (the position wins over the role)", (await pf.templateFor(head))?.name === "Tech lead");
  check("weights must add up to 100", /add up to 90/.test((await throws(() => pf.saveTemplate(admin, { name: "Bad", appliesTo: ["role:owner"], kras: [{ name: "A", weight: 90, kpis: [{ kpi: "tasks_done", weight: 100, target: 5 }] }] }))) ?? ""));
  const qty = await pf.saveTemplate(admin, { name: "Owners", appliesTo: ["role:owner"], kras: [{ name: "Delivery", weight: 100, kpis: [{ kpi: "tasks_done", weight: 100, target: 5 }] }] });
  check("only quantity KPIs gives a warning", qty.warnings.some((w) => /quality/.test(w)));
  check("members do not change the library", !!(await throws(() => pf.saveKpi(dev, { name: "x" }))));
  const manualKey = await pf.saveKpi(admin, { name: "Code reviews given", source: "manual", unit: "count", direction: "up" });

  // Work this month: 4 tasks done, 3 on time, 1 returned.
  const period = await pf.currentPeriod();
  const now = nowIso();
  const due = (d: string) => d;
  const tasks: string[] = [];
  for (const [i, d] of [due("2099-01-01"), due("2099-01-01"), due("2099-01-01"), due("2000-01-01")].entries()) {
    const id = uid("tsk_");
    tasks.push(id);
    await run("INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, due_date, points, created_at, updated_at, completed_at) VALUES (?, 'dev', ?, 'Work', 'done', 'done', ?, ?, 5, ?, ?, ?)", id, `PF-${i}`, dev.id, d, now, now, now);
  }
  await run("INSERT INTO dept_task_comments (id, task_id, author_id, body, created_at) VALUES (?, ?, ?, 'Returned: tests missing', ?)", uid("tcm_"), tasks[0], head.id, now);
  // Two more on-time tasks so the on-time rate has its minimum sample of 5.
  for (const i of [4, 5]) await run("INSERT INTO dept_tasks (id, dept, code, title, status, status_category, assignee_id, due_date, created_at, updated_at, completed_at) VALUES (?, 'dev', ?, 'Work', 'done', 'done', ?, '2099-01-01', ?, ?, ?)", uid("tsk_"), `PF-${i}`, dev.id, now, now, now);

  const mine = await pf.myScorecard(dev, dev.id, period);
  const line = (k: string) => mine.card.kras.flatMap((x) => x.kpis).find((x) => x.kpi === k);
  check("tasks done counted", line("tasks_done")?.value === 6, line("tasks_done"));
  check("on time: 5 of 6", line("tasks_on_time")?.value === 83.3 && line("tasks_on_time")?.sample === 6, line("tasks_on_time"));
  check("story points", line("points_done")?.value === 20);
  check("returned: 1 of 6", line("tasks_returned")?.value === 16.7);
  check("an overall score and a rating", mine.card.score !== null && !!mine.card.rating, mine.card);
  check("a member sees their own scorecard", mine.card.template === "Developer");
  check("but not a colleague's", !!(await throws(() => pf.myScorecard(dev, head.id, period))));
  check("the head sees the member's", (await pf.myScorecard(head, dev.id, period)).card.userId === dev.id);

  // Targets.
  check("a lead's change to this month waits for HR", (await pf.setTarget(head, { userId: dev.id, kpi: "tasks_done", period, target: 6, reason: "Part-time this month" })) === "pending");
  check("until approved the template's target counts", !line("tasks_done")?.targetOverridden && /12 for the whole month|^$/.test(line("tasks_done")?.note ?? ""), line("tasks_done"));
  const day = Number(new Date().toISOString().slice(8, 10));
  check("in the running month the target is the part of the month gone", day >= 28 || (line("tasks_done")?.target ?? 12) < 12);
  const pend = await pf.pendingChanges(admin);
  await pf.decideChange(admin, "target", pend.targets[0]!.id, true);
  const after = (await pf.myScorecard(dev, dev.id, period)).card.kras.flatMap((x) => x.kpis).find((x) => x.kpi === "tasks_done");
  check("approved: the person's own target counts", !!after?.targetOverridden && (after.note ?? "").includes("6 for the whole month") || (after?.target === 6 && !!after.targetOverridden), after);
  check("a member cannot set targets", !!(await throws(() => pf.setTarget(dev, { userId: dev.id, kpi: "tasks_done", period, target: 1, reason: "x" }))));
  check("a target needs a reason", !!(await throws(() => pf.setTarget(head, { userId: dev.id, kpi: "tasks_done", period, target: 1, reason: "" }))));

  // A typed-in KPI.
  await pf.saveTemplate(admin, {
    id: (await pf.listTemplates()).find((t) => t.name === "Developer")!.id,
    name: "Developer",
    appliesTo: ["dept:dev:member", "role:developer"],
    kras: [
      { name: "Delivery", weight: 50, kpis: [{ kpi: "tasks_done", weight: 50, target: 12 }, { kpi: "tasks_on_time", weight: 50, target: 85 }] },
      { name: "Quality", weight: 30, kpis: [{ kpi: "tasks_returned", weight: 60, target: 10 }, { kpi: manualKey, weight: 40, target: 10 }] },
      { name: "Reliability", weight: 20, kpis: [{ kpi: "punctuality", weight: 100, target: 95 }] },
    ],
  });
  await pf.enterValue(head, { userId: dev.id, kpi: manualKey, period, value: 12 });
  check("a typed-in value counts", (await pf.myScorecard(dev, dev.id, period)).card.kras.flatMap((x) => x.kpis).find((x) => x.kpi === manualKey)?.value === 12);

  // Team and company.
  const team = await pf.teamScorecards(head, period);
  check("the head's team", team.some((c) => c.userId === dev.id) && !team.some((c) => c.userId === sara.id));
  check("members have no team view", !!(await throws(() => pf.teamScorecards(dev, period))));
  const comp = await pf.companyScorecard(admin, period);
  check("the company: departments with the spread of ratings, and KPIs added up", comp.departments.length >= 1 && comp.departments.every((d) => Object.keys(d.ratings).length === 3) && comp.kpis.some((k) => k.key === "tasks_done" && (k.value ?? 0) >= 6), comp);
  check("members cannot see the company scorecard", !!(await throws(() => pf.companyScorecard(dev, period))));

  // Closing a month.
  const last = new Date(Date.UTC(Number(period.slice(0, 4)), Number(period.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  check("the current month cannot be closed", !!(await throws(() => pf.closePeriod(admin, period))));
  const n = await pf.closePeriod(admin, last);
  check("closing freezes the month's scorecards", n >= 2 && (await pf.myScorecard(dev, dev.id, last)).card.frozen);
  check("a lead's correction to a closed month waits for HR", (await pf.enterValue(head, { userId: dev.id, kpi: manualKey, period: last, value: 3, note: "Missed in the count" })) === "pending");
  check("a correction needs a reason", !!(await throws(() => pf.enterValue(head, { userId: dev.id, kpi: manualKey, period: last, value: 3 }))));
  const pv = (await pf.pendingChanges(admin)).values[0]!;
  await pf.decideChange(admin, "value", pv.id, true);
  check("approved: the frozen scorecard is redone", (await pf.myScorecard(dev, dev.id, last)).card.kras.flatMap((x) => x.kpis).find((x) => x.kpi === manualKey)?.value === 3);
  check("HR reviews get the scorecards as evidence", (await pf.scorecardEvidence(dev.id, `${last}-01`, `${last}-28`)).length === 1);

  // OKRs.
  const cyc = await pf.saveCycle(admin, { name: "Q4", start: `${period.slice(0, 4)}-${period.slice(5, 7)}-01`, end: `${period.slice(0, 4)}-12-31`, maxObjectives: 2, maxKrs: 3 });
  const co = await pf.saveObjective(admin, { cycleId: cyc, level: "company", title: "Students learn more each week" });
  check("only owners, HR and Admin set company objectives", !!(await throws(() => pf.saveObjective(dev, { cycleId: cyc, level: "company", title: "x" }))));
  const dob = await pf.saveObjective(head, { cycleId: cyc, level: "department", scope: "dev", title: "Ship the quiz feature", parentId: co });
  check("a member cannot set the department's", !!(await throws(() => pf.saveObjective(dev, { cycleId: cyc, level: "department", scope: "dev", title: "x" }))));
  const po = await pf.saveObjective(dev, { cycleId: cyc, level: "person", title: "Grow as a developer", parentId: dob, visibility: "private" });
  await pf.saveObjective(dev, { cycleId: cyc, level: "person", title: "Second" });
  check("the limit of objectives", /At most 2/.test((await throws(() => pf.saveObjective(dev, { cycleId: cyc, level: "person", title: "Third" }))) ?? ""));
  const kr1 = await pf.saveKeyResult(dev, { objectiveId: po, title: "Finish 20 tasks", start: 0, target: 20, kpiKey: "tasks_done" });
  const kr2 = await pf.saveKeyResult(dev, { objectiveId: po, title: "Give a tech talk", kind: "milestone", target: 1 });
  let tree = await pf.okrTree(dev, cyc);
  const mineObj = tree.find((o) => o.id === po)!;
  check("a key result linked to a measure moves by itself", mineObj.krs.find((k) => k.id === kr1)?.current === 6, mineObj.krs);
  await pf.checkIn(dev, kr2, { value: 1, confidence: "on_track", note: "Done on Friday" });
  tree = await pf.okrTree(dev, cyc);
  check("objective score from its key results", tree.find((o) => o.id === po)?.score === Math.round(((6 / 20 + 1) / 2) * 100) / 100, tree.find((o) => o.id === po));
  await pf.checkIn(dev, kr1, { value: 6, confidence: "off_track", note: "Blocked by the API" });
  check("off track tells the owner of the objective it supports", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE 'Off track:%'", head.id)));
  check("a private objective is hidden from others", !(await pf.okrTree(sara, cyc)).some((o) => o.id === po) && (await pf.okrTree(sara, cyc)).some((o) => o.id === co));
  await pf.linkTask(dev, kr1, "PF-1");
  check("tasks linked to a key result", (await pf.okrTree(dev, cyc)).find((o) => o.id === po)!.krs.find((k) => k.id === kr1)!.tasks.done === 1);
  check("closing an objective keeps its score and reflection", (await pf.closeObjective(dev, po, "Good quarter")) !== null);

  // Job and slides.
  const j = await pf.performanceJob();
  check("the scheduled job runs", typeof j.red === "number");
  const slides = await pf.companyPerformanceSlides(admin);
  check("scorecard and objective slides for the company deck", slides.some((s) => s.key === "kpis") && slides.some((s) => s.key === "okrs"), slides.map((s) => s.key));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
  await closeDb();
}

main().catch(async (e) => {
  console.error(e);
  process.exitCode = 1;
  await closeDb();
});
