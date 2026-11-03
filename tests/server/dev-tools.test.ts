// Phases 12b.2, 12b.4 and 12b.5 checks: the department's API key; deployments, incidents (and Sentry), GitLab merge
// requests and test runs reported by other tools; webhooks out signed and Slack notices (a stand-in network);
// releases with versions; test cases, failed runs filing bugs, traceability; Jira, Trello and Asana import and Jira
// export; project templates, epics, baselines, MS Project export and the portfolio; DORA's time to restore.
import crypto from "node:crypto";
import { get, run, closeDb, nowIso, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { saveTask } from "../../src/server/work";
import { createDoc, doraMeasures, linkRequirement, saveDoc } from "../../src/server/dev-studio";
import { cachedPrsByCode } from "../../src/server/github";
import * as dt from "../../src/server/dev-tools";
import * as dp from "../../src/server/dev-plan";

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

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string) => (await loadUser((await upsertAccount({ name: key, email: `${key}@dt.local`, title: "Dev", roles: ["developer"], password: "DevTools-2026!", mustChangePassword: false })).id))!;
  const head = await mk("dthead");
  const devm = await mk("dtdev");
  await setPosition(admin, "dev", head.id, "head");
  const sent: { url: string; body: string; headers: Record<string, string> }[] = [];
  dt.setPoster(async (url, body, headers) => void sent.push({ url, body, headers }));

  // Setup.
  check("members cannot see the tools' settings", !!(await throws(() => dt.toolsView(devm, "dev"))));
  const k = await dt.newApiKey(head, "dev");
  check("an API key is made and checked", k.startsWith("msk_dev_") && (await dt.checkApiKey("dev", k)) && !(await dt.checkApiKey("dev", `${k}x`)) && !(await dt.checkApiKey("dev", null)));
  check("only a hint is kept", !JSON.stringify(await dt.toolsView(head, "dev")).includes(k));
  await dt.saveToolsSettings(head, "dev", { webhooks: [{ url: "https://hooks.example.test/myseed", events: ["deploy", "release", "incident", "task.created"] }], slack: "https://hooks.slack.com/services/T/B/X", notify: ["deploy", "incident"] });
  const hook = (await dt.toolsView(head, "dev")).webhooks[0]!;

  // Releases and deployments.
  const relId = uid("rel_");
  await run("INSERT INTO dept_releases (id, dept, name, notes, task_count, version, created_by, created_at) VALUES (?, 'dev', 'v1.4.0', '', 3, '1.4.0', ?, ?)", relId, head.id, nowIso());
  const dep = await dt.handleEvent("dev", { type: "deploy", environment: "Production", version: "v1.4.0", status: "ok", commit: "abc123" }, {});
  check("a deployment is linked to its release by version", (dep as unknown as { release: string }).release === relId);
  const w = sent.find((x) => x.url === "https://hooks.example.test/myseed" && x.headers["X-Myseed-Event"] === "deploy");
  const secret = await dt.webhookSecret(head, "dev", hook.id);
  check("the webhook gets it, signed", !!w && w.headers["X-Myseed-Signature"] === `sha256=${crypto.createHmac("sha256", secret!).update(w.body).digest("hex")}`);
  check("and Slack a notice", sent.some((x) => x.url.startsWith("https://hooks.slack.com/") && /Deployed v1.4.0 to production/.test(x.body)));
  const rd = await dt.releasesWithDeploys(head, "dev");
  check("environments show their latest deployment", rd.environments.some((e) => e.name === "production" && e.latest?.version === "v1.4.0") && rd.releases[0]?.deployments.length === 1);
  check("the next version", (await dt.nextVersion("dev", "minor")) === "1.5.0" && (await dt.nextVersion("dev", "patch")) === "1.4.1");
  check("versions must look like 1.4.0", /1\.4\.0/.test((await throws(() => dt.setReleaseVersion(head, "dev", relId, "spring"))) ?? ""));

  // Incidents.
  const inc = (await dt.handleEvent("dev", { type: "incident", title: "Login fails for some students", severity: "sev2", id: "mon-1" }, {})) as unknown as { id: string; bugTaskId: string };
  check("an incident opens a bug", !!(await get("SELECT 1 AS x FROM dept_tasks WHERE id = ? AND title LIKE '[SEV2]%'", inc.bugTaskId)));
  check("the same incident twice is one", ((await dt.handleEvent("dev", { type: "incident", title: "again", id: "mon-1" }, {})) as { again?: boolean }).again === true);
  await run("UPDATE dev_incidents SET started_at = ? WHERE id = ?", new Date(Date.now() - 3 * 36e5).toISOString(), inc.id);
  await dt.handleEvent("dev", { type: "incident_resolved", id: "mon-1" }, {});
  check("resolved by the tool", (await get<{ status: string }>("SELECT status FROM dev_incidents WHERE id = ?", inc.id))?.status === "resolved");
  check("DORA's time to restore", ((await doraMeasures(head, "dev")).timeToRestoreHours ?? 0) >= 2.9);
  const sen = (await dt.handleEvent("dev", { action: "created", data: { issue: { id: "sentry-9", title: "TypeError in player", level: "error", permalink: "https://sentry.test/9" } } }, { sentry: "issue" })) as { id: string };
  check("a Sentry alert opens an incident", (await get<{ severity: string; source: string }>("SELECT severity, source FROM dev_incidents WHERE id = ?", sen.id))?.source === "sentry");

  // GitLab.
  const tid = await saveTask(head, "dev", { title: "Offline video download", status: "todo", assigneeId: devm.id });
  const code = (await get<{ code: string }>("SELECT code FROM dept_tasks WHERE id = ?", tid))!.code;
  await dt.handleEvent("dev", { object_kind: "merge_request", project: { path_with_namespace: "myseed/app" }, object_attributes: { iid: 42, title: `${code}: offline downloads`, source_branch: `feature/${code.toLowerCase()}`, state: "opened", url: "https://gitlab.test/mr/42" } }, { gitlab: "Merge Request Hook" });
  check("a GitLab merge request shows on its task", (await cachedPrsByCode("dev")).get(code)?.some((p) => p.repo === "myseed/app" && p.number === 42 && p.state === "open") === true);

  // Tests and traceability.
  const doc = await createDoc(head, "dev", { kind: "srs", title: "Offline SRS" });
  await saveDoc(head, "dev", doc, { title: "Offline SRS", body: "FR-1 Students download a lesson.\nFR-2 Downloads expire after 30 days." });
  await linkRequirement(head, "dev", doc, "FR-1", tid, true);
  const tc = await dt.saveTestCase(head, "dev", { title: "Download on a slow network", steps: "1. Turn on 2G\n2. Download", expected: "It finishes", requirement: "fr-1", docId: doc });
  const runRes = await dt.recordTestRun(head, "dev", { caseId: tc, result: "fail", note: "Stopped at 60%" });
  check("a failed test files a bug with the steps", /Turn on 2G/.test((await get<{ description: string }>("SELECT description FROM dept_tasks WHERE id = ?", runRes.bugTaskId!))?.description ?? ""));
  check("the case shows its last result", (await dt.listTestCases(head, "dev")).find((c) => c.id === tc)?.last?.result === "fail");
  const tr = await dt.traceability(head, "dev", doc);
  const fr1 = tr.rows.find((r) => r.requirement === "FR-1");
  check("traceability: FR-1 to its task, merge request and test", !!fr1 && fr1.tasks[0]?.code === code && fr1.pullRequests.length === 1 && fr1.tests[0]?.result === "fail" && fr1.covered, fr1);
  check("FR-2 is not covered", tr.uncovered.includes("FR-2"));
  await dt.handleEvent("dev", { type: "test_run", caseTitle: "Download on a slow network", result: "pass" }, {});
  check("a test runner reports a pass", (await dt.listTestCases(head, "dev")).find((c) => c.id === tc)?.last?.result === "pass");

  // Import and export.
  const jira = 'Issue key,Summary,Issue Type,Status,Priority,Assignee,Description\nJ-1,"Fix the, quiz timer",Bug,In Progress,High,Nobody Here,"Line one\nline two"\nJ-2,Translate the menu,Task,Done,,,\n';
  const ji = await dt.importFrom(head, "dev", "jira", jira);
  check("a Jira CSV is imported (quotes, commas, new lines); finished ones left out", ji.created === 1 && ji.skippedDone === 1 && !!(await get("SELECT 1 AS x FROM dept_tasks WHERE dept = 'dev' AND title = 'Fix the, quiz timer' AND status_category = 'active'")), ji);
  const trello = JSON.stringify({ lists: [{ id: "l1", name: "Doing" }], cards: [{ name: "Trello card", desc: "From Trello", idList: "l1", closed: false, due: null }, { name: "Archived", desc: "", idList: "l1", closed: true, due: null }] });
  check("Trello's JSON (archived cards left out)", (await dt.importFrom(head, "dev", "trello", trello)).created === 1);
  check("Asana's CSV", (await dt.importFrom(head, "dev", "asana", "Name,Notes,Section/Column,Due Date\nAsana task,Notes here,To do,2026-12-01\n")).created === 1);
  const out = await dt.exportJiraCsv(head, "dev");
  check("exported in Jira's columns", out.startsWith('"Issue key","Summary"') && out.includes(code));

  // Templates, epics, baselines, MS Project, portfolio.
  const tpls = await dp.listTemplates(head, "dev");
  check("Myseed's ready templates", tpls.filter((t) => t.builtIn).length === 5);
  const ap = await dp.applyTemplate(head, "dev", "builtin:feature", { name: "Quiz feature", key: "QZ", start: "2026-12-01" });
  check("a project from a template has its milestones and tasks", ap.tasks === 9 && Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_milestones WHERE project_id = ?", ap.projectId))?.c) === 3);
  const ep = await dp.epics(head, "dev");
  check("epics with their progress", ep.filter((e) => e.project === "Quiz feature").length === 4 && ep.find((e) => e.title === "Build")?.children === 3);
  check("documents from the template", Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM dept_docs WHERE project_id = ?", ap.projectId))?.c) === 3);
  const own = await dp.saveTemplate(head, "dev", { name: "Hotfix", body: { epics: [{ title: "Fix", tasks: [{ title: "Patch", days: 1 }] }], milestones: [], docs: [] } });
  check("heads add their own templates", (await dp.listTemplates(head, "dev")).some((t) => t.id === own));
  check("members do not", !!(await throws(() => dp.saveTemplate(devm, "dev", { name: "X", body: { epics: [], milestones: [], docs: [] } }))));
  check("a baseline is saved", (await dp.saveBaseline(head, "dev", ap.projectId)) >= 9 && Object.keys(await dp.baselines(head, "dev")).length >= 9);
  const slipId = (await get<{ id: string }>("SELECT id FROM dept_tasks WHERE project_id = ? AND due_date IS NOT NULL LIMIT 1", ap.projectId))!.id;
  await run("UPDATE dept_tasks SET due_date = '2027-06-30' WHERE id = ?", slipId);
  const drift = await dp.baselineDrift(head, "dev");
  check("a task that moved shows against the baseline", drift.rows[0]?.id === slipId && drift.rows[0].slipDays > 0 && !!drift.savedAt);
  const xml = await dp.msProjectXml(head, "dev", ap.projectId);
  check("MS Project XML with its tasks", xml.includes('<Project xmlns="http://schemas.microsoft.com/project">') && (xml.match(/<Task>/g) ?? []).length >= 9);
  check("the portfolio lists it", (await dp.portfolio(admin)).some((p) => p.name === "Quiz feature" && p.deptTitle));
  check("task events go to the webhook", sent.some((x) => x.headers["X-Myseed-Event"] === "task.created"));

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
