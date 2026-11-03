// Phase 12 in the browser: the Dev flow on Home. The lead plans a bug from the intake and passes code review, the
// developer starts work on their own board, the tester accepts and sends back a bug; and Configure, Flow.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "flow");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) =>
  page
    .locator("[data-sonner-toast]")
    .filter({ hasText: re })
    .first()
    .waitFor({ timeout: 10000 })
    .then(
      () => true,
      () => false,
    );
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email} no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard|dev/, { timeout: 30000 });
  return page;
}
const go = async (page, p) => (await page.goto(`${base}${p}`), await page.waitForLoadState("load"), await page.waitForTimeout(800));
const card = (page, id) => page.locator(`[data-flow-card="${id}"]`);

try {
  const { bug, feat, rev } = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
  const lead = await as("devlead@demo.local");
  await go(lead, "/dev");
  check("the lead sees the lead desk", await lead.getByRole("heading", { name: "Lead desk" }).isVisible());
  check("the flow at a glance shows every stage", (await lead.locator("[data-flow-glance]").count()) === 6);
  check("the bug waits in the intake", await lead.locator('[data-flow-section="intake"]').locator(`[data-flow-card="${bug}"]`).isVisible());
  await lead.screenshot({ path: path.join(shots, "1-lead-desk.png"), fullPage: true });
  const intake = card(lead, bug);
  await intake.getByLabel("Person").click();
  await lead.getByRole("option", { name: "Bereket" }).click();
  await intake.getByRole("button", { name: /Plan into/ }).click();
  check("planned", await toast(lead, /Planned/));
  await lead.waitForTimeout(1000);
  check("it left the intake", (await lead.locator('[data-flow-section="intake"]').locator(`[data-flow-card="${bug}"]`).count()) === 0);
  await lead.locator('[data-flow-section="checks"]').locator(`[data-flow-card="${rev}"]`).getByRole("button", { name: /Pass to QA/ }).click();
  check("code review passed to QA", await toast(lead, /passed/i));

  const dev = await as("dev@demo.local");
  await go(dev, "/dev");
  check("the developer sees their own board", await dev.getByRole("heading", { name: "My work" }).isVisible());
  check("both their tasks are in To do", (await dev.locator('[data-flow-column="todo"] [data-flow-card]').count()) === 2, await dev.locator('[data-flow-column="todo"] [data-flow-card]').count());
  check("the stage guide is shown", await dev.getByText("How In progress works").isVisible());
  await card(dev, feat).getByRole("button", { name: "Start" }).click();
  check("started", await toast(dev, /Started/));
  await dev.waitForTimeout(1000);
  check("it moved to In progress", (await dev.locator(`[data-flow-column="working"] [data-flow-card="${feat}"]`).count()) === 1);
  await card(dev, feat).getByRole("button", { name: "Done" }).click();
  check("done is refused while the checklist is open", await toast(dev, /still needs/));
  await dev.screenshot({ path: path.join(shots, "2-member-board.png"), fullPage: true });

  const tester = await as("tester@demo.local");
  await go(tester, "/dev");
  check("the tester sees what arrives in QA", await tester.locator('[data-flow-section="arriving"]').locator(`[data-flow-card="${rev}"]`).isVisible());
  await card(tester, rev).getByRole("button", { name: "Accept" }).click();
  check("accepted", await toast(tester, /accepted/i));
  await tester.waitForTimeout(1000);
  await card(tester, rev).getByRole("button", { name: "Send back as a bug" }).click();
  await card(tester, rev).getByPlaceholder(/Steps to reproduce/).fill("1. Turn off the network\n2. Open a lesson\nIt shows an empty page");
  await card(tester, rev).getByRole("button", { name: "Send back as a bug" }).click();
  check("sent back as a bug", await toast(tester, /Returned/));
  await tester.screenshot({ path: path.join(shots, "3-tester.png"), fullPage: true });

  await go(dev, "/dev");
  check("the bug's steps are on the developer's card", await card(dev, rev).getByText(/Steps to reproduce/).isVisible());

  // Phase 13: the assistant.
  await go(dev, "/dev");
  await dev.getByRole("button", { name: "Open the assistant" }).click();
  await dev.getByLabel("Ask the assistant").fill("where is my payslip");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  check("the assistant says where a page is", await dev.getByRole("button", { name: "Open Pay and claims" }).isVisible());
  await dev.getByLabel("Ask the assistant").fill("how do I finish and send my work");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  await dev.getByRole("button", { name: "Show me" }).first().click();
  await dev.locator("[data-assistant-show]").waitFor({ timeout: 10000 });
  await dev.waitForTimeout(1200);
  check("Show me dims the page and points at the board", await dev.getByRole("dialog", { name: "Show me" }).isVisible());
  await dev.screenshot({ path: path.join(shots, "7-assistant-show.png") });
  await dev.getByRole("dialog", { name: "Show me" }).getByRole("button", { name: "Stop" }).click();

  // Phase 12c: the department presentation.
  await go(lead, "/dev/present");
  check("the presentation opens with an explainer", await lead.locator("[data-explainer]").isVisible());
  await lead.keyboard.press("ArrowRight");
  await lead.waitForTimeout(600);
  check("arrow keys move to the next slide", (await lead.getByText(/slide 2 of/).count()) === 1);
  await lead.screenshot({ path: path.join(shots, "8-present.png") });

  // Phase 12b: the Sprint, Roadmap and Specs pages.
  await go(lead, "/dev/sprint");
  await lead.getByRole("button", { name: /Plan the next sprint/ }).click();
  check("the lead plans a sprint", await toast(lead, /Next sprint planned/));
  await lead.waitForTimeout(1000);
  check("the sprint page shows planning and capacity", await lead.locator("[data-sprint-planning]").isVisible());
  await lead.locator("[data-backlog-task]").first().getByRole("button").click();
  await lead.waitForTimeout(1200);
  check("work moves from the backlog into the sprint", (await lead.locator("[data-sprint-task]").count()) >= 1);
  await lead.screenshot({ path: path.join(shots, "5-sprint.png"), fullPage: true });
  await go(lead, "/dev/roadmap");
  check("the roadmap shows the DORA measures", await lead.getByLabel("DORA measures").isVisible());
  await go(lead, "/dev/docs");
  await lead.getByRole("combobox", { name: "Template" }).click();
  await lead.getByRole("option", { name: "SRS for a Myseed learning feature" }).click();
  await lead.getByRole("button", { name: "Start" }).click();
  await lead.waitForURL(/doc=/, { timeout: 15000 });
  await lead.locator("[data-trace]").waitFor({ timeout: 15000 });
  check("a new SRS lists its requirements to trace", (await lead.locator("[data-trace]").getByText("FR-1")).isVisible !== undefined && (await lead.locator("[data-trace]").getByText("not covered").count()) > 3);
  await lead.screenshot({ path: path.join(shots, "6-srs.png"), fullPage: true });

  const admin = await as("admin@demo.local");
  await go(admin, "/dev/configure");
  await admin.getByRole("tab", { name: "Flow" }).click();
  check("Configure, Flow lists the stages", (await admin.locator("[data-flow-stage]").count()) === 6);
  check("the path from the first stage is drawn", await admin.getByLabel("The flow from the first stage").isVisible());
  await admin.screenshot({ path: path.join(shots, "4-configure-flow.png"), fullPage: true });

  // Tools: releases, incidents, tests, epics and baseline, portfolio, templates, integrations.
  await go(admin, "/dev/tools");
  for (const s of ["releases", "incidents", "tests", "plan", "portfolio", "templates", "import", "integrations"])
    check(`Tools shows ${s}`, (await admin.locator(`[data-tools-section="${s}"]`).count()) === 1);
  await admin.locator('[data-template="builtin:feature"]').getByRole("button", { name: "Start a project" }).click();
  await admin.getByLabel("Project key").fill("QZE");
  await admin.getByRole("button", { name: "Create the project" }).click();
  check("a project starts from a template", await toast(admin, /Project started with 9 tasks/));
  await admin.waitForTimeout(1200);
  check("its epics show with progress", (await admin.locator("[data-epic]").count()) >= 4);
  await admin.getByRole("button", { name: "Save baseline now" }).click();
  check("a baseline is saved", await toast(admin, /Baseline saved/));
  await admin.screenshot({ path: path.join(shots, "7-tools.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
