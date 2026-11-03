// Phase 17 in the browser: a member's own scorecard, the lead's team and a target change that waits for HR, HR
// approving it and closing a month, the library, the company calibration view, and OKRs with a check-in.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "performance");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const visible = (loc, ms = 12000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const toast = (page, re) => visible(page.locator("[data-sonner-toast]").filter({ hasText: re }), 10000);
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email}: no page error`, false, e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
}

try {
  const d = await as("dawit@demo.local");
  check("Performance is in the sidebar", await visible(d.getByRole("link", { name: "Performance", exact: true })));
  await d.goto(`${base}/performance`);
  check("my scorecard with the Recording template", await visible(d.locator("[data-scorecard]").getByText(/Recording/)));
  check("with KRAs and KPIs", (await d.locator("[data-kpi]").count()) >= 4);
  await d.screenshot({ path: path.join(shots, "1-my-scorecard.png"), fullPage: true });

  // OKRs: a personal objective, a key result and a check-in.
  await d.goto(`${base}/performance?tab=okrs`);
  check("no cycle yet for a member", await visible(d.getByText(/HR or the owners open one/)));

  const a = await as("admin@demo.local");
  await a.goto(`${base}/performance?tab=okrs`);
  await a.getByRole("button", { name: "New cycle" }).click();
  const y = new Date().getUTCFullYear();
  await a.locator("[data-cycle-form]").getByLabel("Cycle name").fill(`Q4 ${y}`);
  await a.locator("[data-cycle-form]").getByLabel("First day").fill(`${y}-10-01`);
  await a.locator("[data-cycle-form]").getByLabel("Last day").fill(`${y}-12-31`);
  await a.getByRole("button", { name: "Open the cycle" }).click();
  check("HR opens a cycle", await toast(a, /Cycle opened/));
  await a.waitForTimeout(800);
  await a.getByRole("button", { name: "New objective" }).click();
  await a.locator("[data-objective-form]").getByLabel("Level").selectOption("company");
  await a.locator("[data-objective-form]").getByLabel("Objective").fill("Every lesson ready a week early");
  await a.locator("[data-objective-form]").getByRole("button", { name: "Save" }).click();
  check("a company objective", await toast(a, /Objective set/));

  await d.goto(`${base}/performance?tab=okrs`);
  await d.getByRole("button", { name: "New objective" }).click();
  await d.locator("[data-objective-form]").getByLabel("Objective").fill("Record faster");
  await d.locator("[data-objective-form]").getByLabel("Supports").selectOption({ label: "Supports: Every lesson ready a week early" });
  await d.locator("[data-objective-form]").getByRole("button", { name: "Save" }).click();
  check("a personal objective supporting the company's", await toast(d, /Objective set/));
  await d.waitForTimeout(800);
  const mine = d.locator('[data-objective="Record faster"]');
  await mine.getByRole("button", { name: "Key result" }).click();
  await mine.getByLabel("Key result").fill("Record 40 parts");
  await mine.getByLabel("Target").fill("40");
  await mine.getByRole("button", { name: "Add" }).click();
  check("a key result", await toast(d, /Key result added/));
  await d.waitForTimeout(800);
  await mine.getByRole("button", { name: "Check in" }).click();
  await mine.getByLabel("Value now").fill("10");
  await mine.getByLabel("Confidence").selectOption("at_risk");
  await mine.getByRole("button", { name: "Save" }).click();
  check("a check-in", await toast(d, /Checked in/));
  await d.waitForTimeout(800);
  check("the objective's progress shows", await visible(mine.getByText("25%")));
  await d.screenshot({ path: path.join(shots, "2-okrs.png"), fullPage: true });

  // The lead: team, a person, a target change that waits for HR.
  const h = await as("hana@demo.local");
  await h.goto(`${base}/performance?tab=team`);
  check("the lead sees the team", await visible(h.locator("[data-team-scorecards]").getByText("Dawit")));
  await h.locator("[data-team-scorecards]").getByRole("link", { name: "Dawit" }).click();
  await h.locator('[data-kpi="prod_finished"]').getByRole("button", { name: "Target" }).click();
  await h.locator("[data-kpi-edit]").getByLabel("New target").fill("12");
  await h.locator("[data-kpi-edit]").getByLabel("Reason").fill("Two weeks of leave");
  await h.locator("[data-kpi-edit]").getByRole("button", { name: "Save" }).click();
  check("a change to this month goes to HR", await toast(h, /Sent to HR/));
  await h.screenshot({ path: path.join(shots, "3-lead.png"), fullPage: true });

  // HR approves, closes last month, sees the library and the company.
  await a.goto(`${base}/performance?tab=periods`);
  await a.locator('[data-pending="target"]').getByRole("button", { name: "Approve" }).click();
  check("HR approves the target", await toast(a, /Approved/));
  await a.getByRole("button", { name: "Close the month" }).click();
  check("last month closed", await toast(a, /closed/));
  await a.screenshot({ path: path.join(shots, "4-periods.png"), fullPage: true });
  await a.goto(`${base}/performance?tab=library`);
  check("the library lists the ready templates", await visible(a.locator('[data-template-row="Customer support agent"]')));
  await a.goto(`${base}/performance?tab=company`);
  check("the company view with calibration", await visible(a.locator("[data-company-scorecard]").getByText("Departments and calibration")));
  await a.screenshot({ path: path.join(shots, "5-company.png"), fullPage: true });

  await d.goto(`${base}/performance`);
  check("Dawit sees his own target", await visible(d.locator('[data-kpi="prod_finished"]').getByText("(own)")));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
