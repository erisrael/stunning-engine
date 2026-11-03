// Phase 25: strategic planning, monitoring and evaluation. The results chain and its rules, indicators and SMART
// gaps, results entered by the person responsible and verified by someone else, Red/Amber/Green against targets,
// results read from the app, risks, OECD-DAC evaluations, reminders, every document in both looks (opened and read),
// the Excel tracking table, and the KPI library's reference sheet.
process.env.AI_FAKE = "1";
process.env.MAIL_FAKE = "1";
import JSZip from "jszip";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as S from "../../src/server/strategy";
import { buildDoc, trackingWorkbook } from "../../src/server/strategy-docs";
import { listKpis, saveKpi } from "../../src/server/performance";
import { achievement, monthsOf, periodsOf, ragOf, riskLevel, smartGaps } from "../../src/lib/strategy";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const docText = async (buf: Buffer) => (await (await JSZip.loadAsync(buf)).file("word/document.xml")!.async("string")).replace(/<[^>]+>/g, " ");

async function main() {
  // The method.
  check("periods: months, quarters, halves, years", periodsOf("quarterly", "2026-01-01", "2026-12-31").join(",") === "2026-Q1,2026-Q2,2026-Q3,2026-Q4" && periodsOf("semiannual", "2026-03-01", "2027-02-01").join(",") === "2026-H1,2026-H2,2027-H1" && periodsOf("annual", "2026-01-01", "2028-12-31").length === 3 && periodsOf("monthly", "2026-11-01", "2027-02-28").length === 4);
  check("months of a period", monthsOf("2026-Q2").join(",") === "2026-04,2026-05,2026-06" && monthsOf("2026").length === 12 && monthsOf("2026-H2")[0] === "2026-07");
  check("achievement from the baseline to the target", achievement(75, 100, 50, "up") === 50 && achievement(100, 100, 50, "up") === 100 && achievement(30, 20, 40, "down") === 50 && achievement(8, 10, null, "up") === 80);
  check("Red, Amber, Green", ragOf(95) === "green" && ragOf(80) === "amber" && ragOf(50) === "red" && ragOf(null) === "none" && ragOf(85, { green: 80, amber: 60 }) === "green");
  check("risk levels from likelihood × impact", riskLevel(25) === "critical" && riskLevel(12) === "high" && riskLevel(6) === "medium" && riskLevel(2) === "low");
  check("the SMART check names what is missing", smartGaps({ name: "x", definition: null, unit: "number", direction: "up", baseline: null, baselineDate: null, frequency: "quarterly", dataSource: null, method: null, verification: null, responsibleId: null, formula: null, disaggregation: null, measure: null, targets: {} }).map((g) => g.key).join("").length >= 5);

  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@sp.local`, title: "Staff", roles: roles as never, password: "Strategy-2026!", mustChangePassword: false })).id))!;
  const officer = await mk("meofficer", ["developer"]);
  const other = await mk("spother", ["developer"]);
  const owner = await mk("spowner", ["owner"]);

  // Rights.
  check("people with no part in it cannot open it", /strategy is for/.test((await throws(() => S.listPlans(other))) ?? ""));
  check("only planners make plans", /Only owners/.test((await throws(() => S.savePlan(other, { name: "X", start: "2026-01-01", end: "2027-01-01" }))) ?? ""));
  check("dates are checked", /end after/.test((await throws(() => S.savePlan(admin, { name: "X", start: "2027-01-01", end: "2026-01-01" }))) ?? ""));

  // The example plan, and the results chain.
  const planId = await S.examplePlan(admin);
  let v = await S.planView(admin, planId);
  check("the example: a goal, outcomes, outputs, activities", ["goal", "outcome", "output", "activity"].every((l) => v.nodes.some((n) => n.level === l)) && v.nodes[0]!.code === "G1", v.nodes.map((n) => n.code));
  check("with indicators, risks and pillars", v.indicators.length === 5 && v.risks.length === 2 && v.plan.pillars.length === 4);
  check("codes follow the logframe", v.nodes.some((n) => n.code === "G1.O1.P1.A1") && v.indicators.some((i) => i.code === "G1.O1.P1.I1"), v.indicators.map((i) => i.code));
  const goal = v.nodes.find((n) => n.level === "goal")!;
  check("an output cannot sit right under a goal", /Under a goal/.test((await throws(() => S.saveNode(admin, { planId, parentId: goal.id, level: "output", title: "Wrong" }))) ?? ""));
  check("only a goal stands alone", /Only a goal/.test((await throws(() => S.saveNode(admin, { planId, level: "outcome", title: "Alone" }))) ?? ""));
  const o3 = await S.saveNode(admin, { planId, parentId: goal.id, level: "outcome", title: "Schools adopt the lessons", pillar: "Reach and growth", perspective: "customer" });
  const indId = await S.saveIndicator(admin, { nodeId: o3, name: "Schools using the lessons", definition: "Schools with at least one class using Myseed lessons every week in the period.", unit: "number", baseline: 20, frequency: "quarterly", dataSource: "School survey", method: "Phone survey of schools", verification: "Survey records", responsibleId: officer.id, targets: { "2026-Q1": 40, "2026-Q2": 60 } });
  check("the person responsible is told", !!(await get("SELECT 1 AS x FROM notifications WHERE user_id = ? AND title LIKE '%Schools using the lessons%'", officer.id)));
  check("they can now open the plan", (await S.listPlans(officer)).some((p) => p.id === planId));

  // Results.
  check("someone else cannot enter its results", /Only the person reporting/.test((await throws(() => S.enterActual(other, { indicatorId: indId, period: "2026-Q1", value: 30 }))) ?? ""));
  await S.enterActual(officer, { indicatorId: indId, period: "2026-Q1", value: 30, note: "Survey delayed by exams" });
  v = await S.planView(admin, planId, { now: "2026-05-15T10:00:00.000Z" });
  const ind = v.indicators.find((i) => i.id === indId)!;
  const q1 = ind.rows.find((r) => r.period === "2026-Q1")!;
  check("achievement and status against the target", q1.actual === 30 && q1.achievement === 50 && q1.rag === "red" && q1.note === "Survey delayed by exams", q1);
  check("its status is the latest result's", ind.rag === "red");
  check("the reporter does not verify their own results", /Only owners/.test((await throws(() => S.verifyActual(officer, indId, "2026-Q1"))) ?? ""));
  await S.enterActual(admin, { indicatorId: indId, period: "2026-Q2", value: 45 });
  check("nor does a planner who entered it", /Someone other/.test((await throws(() => S.verifyActual(admin, indId, "2026-Q2"))) ?? ""));
  await S.verifyActual(admin, indId, "2026-Q1");
  v = await S.planView(admin, planId, { now: "2026-05-15T10:00:00.000Z" });
  check("a planner verifies it", v.indicators.find((i) => i.id === indId)!.rows.find((r) => r.period === "2026-Q1")!.verified);
  await S.enterActual(officer, { indicatorId: indId, period: "2026-Q1", value: 58 });
  v = await S.planView(admin, planId, { now: "2026-05-15T10:00:00.000Z" });
  const q1b = v.indicators.find((i) => i.id === indId)!.rows.find((r) => r.period === "2026-Q1")!;
  check("a changed result needs verifying again", q1b.actual === 58 && !q1b.verified && q1b.rag === "green", q1b);
  check("the latest result sets the status (Q2: 45 of 60 from 20)", v.indicators.find((i) => i.id === indId)!.rag === "red");
  check("the summary counts by pillar, perspective and level", v.summary.byPillar.some((x) => x.pillar === "Reach and growth" && x.red === 1) && v.summary.byPerspective.find((x) => x.perspective === "customer")!.total >= 1 && v.summary.byLevel.find((x) => x.level === "outcome")!.total >= 2, v.summary.byPillar);
  check("results read from the app (counts are 0 when nothing was done)", v.indicators.filter((i) => i.measure === "prod_finished").every((i) => i.rows.some((r) => r.source === "auto" && r.actual !== null)), v.indicators.filter((i) => i.measure).map((i) => i.rows.filter((r) => r.source).length));

  // Reminders for a period without a result.
  const remindId = await S.saveIndicator(admin, { nodeId: o3, name: "Teacher training sessions", unit: "number", frequency: "monthly", responsibleId: officer.id, targets: {} });
  void remindId;
  await S.savePlan(admin, { ...v.plan, id: planId, status: "active" });
  const job = await S.strategyJob(new Date().toISOString());
  check("whoever reports is reminded when a period ends without a result", job.reminded >= 1, job);
  const again = await S.strategyJob(new Date().toISOString());
  check("once", again.reminded === 0, again);

  // Risks and evaluations.
  await S.saveRisk(admin, { planId, title: "Funding gap", category: "Financial", likelihood: 5, impact: 5, mitigation: "New partners", ownerId: owner.id });
  v = await S.planView(admin, planId);
  check("risks are scored and sorted", v.risks[0]!.title === "Funding gap" && v.risks[0]!.score === 25 && v.risks[0]!.level === "critical" && v.summary.risks.high >= 1);
  const evId = await S.saveEvaluation(admin, { planId, title: "Annual review 2026", kind: "annual", period: "2026", scores: { relevance: { rating: 4, evidence: "Aligned with the curriculum" }, efficiency: { rating: 2, evidence: "Costs above plan" } }, summary: "Good progress.", lessons: "Plan uploads at night.", recommendations: [{ text: "Add a second studio", ownerId: owner.id, due: "2027-03-01", response: "Accepted", status: "open" }] });
  v = await S.planView(admin, planId);
  const ev = v.evaluations.find((e) => e.id === evId)!;
  check("an evaluation by the DAC criteria with recommendations", ev.scores.relevance?.rating === 4 && ev.scores.efficiency?.rating === 2 && ev.recommendations[0]!.owner === "spowner" && v.summary.recommendations === 1, ev);

  // Documents, in both looks (the AI on with the stand-in model, for the report's narrative).
  await (await import("../../src/server/assistant-ai")).saveAiConfig(admin, { on: true, offRoles: [], dailyLimit: 0, actions: true, key: "sk-ant-test" });
  for (const style of ["myseed", "international"] as const)
    for (const kind of ["plan", "meplan", "report", "kpis", "evaluation", "logframe"] as const) {
      const d = await buildDoc({ ...admin, activeRole: "admin" }, { planId, kind, style, narrative: kind === "report" });
      const text = await docText(d.buffer);
      const want = { plan: "Results framework", meplan: "Indicator reference sheets", report: "Indicator performance", kpis: "Strategic indicators", evaluation: "Findings by criterion", logframe: "Means of verification" }[kind];
      check(`${kind} (${style}) is a Word file with its sections`, d.file.endsWith(".docx") && text.includes(want) && (style === "international" ? /1\. /.test(text) : /MYSEED|Myseed/.test(text)), { file: d.file, want, has: text.includes(want) });
    }
  const rep = await docText((await buildDoc({ ...admin, activeRole: "admin" }, { planId, kind: "report", style: "myseed", narrative: true })).buffer);
  check("the report has the AI narrative when asked", /Narrative/.test(rep) && /Analysis/.test(rep));
  check("and the indicator's comment", /Schools using the lessons/.test(rep));
  const wb = await trackingWorkbook(admin, planId);
  const zip = await JSZip.loadAsync(wb.buffer);
  check("the Excel tracking table has the indicators and the risks", wb.file.endsWith(".xlsx") && !!zip.file("xl/worksheets/sheet1.xml") && !!zip.file("xl/worksheets/sheet2.xml"));
  check("documents follow the same rights", /strategy is for/.test((await throws(() => buildDoc({ ...other, activeRole: "developer" }, { planId, kind: "plan", style: "myseed" }))) ?? ""));

  // The KPI library's reference sheet.
  const key = await saveKpi(admin, { name: "Lessons per month", source: "manual", unit: "count", direction: "up", meta: { perspective: "process", formula: "Lessons published in the month", dataSource: "Publication log", frequency: "monthly", owner: "Head of production", rationale: "Shows output" } });
  const k = (await listKpis()).find((x) => x.key === key)!;
  check("a KPI keeps its reference sheet", k.meta?.perspective === "process" && k.meta?.formula === "Lessons published in the month" && k.meta?.owner === "Head of production", k.meta);
  const dict = await docText((await buildDoc({ ...admin, activeRole: "admin" }, { planId, kind: "kpis", style: "international" })).buffer);
  check("the KPI dictionary lists it with its sheet", /Lessons per month/.test(dict) && /Publication log/.test(dict));

  await S.deletePlan(admin, planId);
  check("a plan can be deleted with everything in it", !(await get("SELECT 1 AS x FROM sp_indicators WHERE id = ?", indId)));

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
