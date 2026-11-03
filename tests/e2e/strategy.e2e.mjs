// Phase 25 in the browser: a plan from the example, its overview (Red, Amber, Green and the Balanced Scorecard), the
// results framework with SMART checks, entering a result, the risk heat map, and downloading documents.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "strategy");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  await page.goto(`${base}/strategy`);
  check("Strategy opens", await seen(page.locator("[data-strategy]")));
  await page.locator("[data-example-plan]").click();
  check("an example plan is made", await seen(page.locator("[data-strategy-overview]"), 20000));
  check("with Red, Amber, Green counts", (await page.locator("[data-rag-count]").count()) === 4);
  check("and the Balanced Scorecard", (await page.locator("[data-perspective]").count()) === 4);
  await page.screenshot({ path: path.join(shots, "1-overview.png"), fullPage: true });

  await page.getByRole("link", { name: "Results framework" }).click();
  check("the results chain is shown", await seen(page.locator('[data-node="G1"]')) && (await page.locator("[data-indicator]").count()) >= 5);
  check("each indicator is checked against SMART", (await page.locator("[data-indicator]").filter({ hasText: "SMART" }).count()) >= 5);
  await page.locator('[data-add-child="G1"]').click();
  await page.getByLabel("Result", { exact: true }).fill("Parents trust Myseed lessons");
  await page.locator("[data-save-node]").click();
  check("an outcome is added under the goal", await seen(page.locator('[data-node="G1.O3"]'), 10000));
  await page.screenshot({ path: path.join(shots, "2-framework.png"), fullPage: true });

  await page.getByRole("link", { name: "Monitor" }).click();
  const box = page.locator("[data-enter]").first();
  check("results can be entered", await seen(box));
  await box.locator("input").first().fill("88");
  await box.locator("input").nth(1).fill("Review done in September");
  await box.getByRole("button", { name: "Save" }).click();
  check("the result is saved and rated", await seen(page.locator("[data-monitor-indicator]").filter({ hasText: "88" }).first(), 10000));

  await page.getByRole("link", { name: "Risks" }).click();
  check("the heat map shows the risks", (await seen(page.locator("[data-risks]"))) && (await page.locator("[data-heat]").count()) === 25 && (await page.locator("[data-risks] [data-risk]").count()) >= 2);

  await page.screenshot({ path: path.join(shots, "3-risks.png"), fullPage: true });
  await page.getByRole("link", { name: "Documents" }).click();
  await seen(page.locator("[data-documents]"));
  await page.locator('[data-doc-style="international"]').click();
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.locator('[data-doc="meplan"]').click()]);
  const file = path.join(shots, "me-plan.docx");
  await dl.saveAs(file);
  const xml = await (await JSZip.loadAsync(fs.readFileSync(file))).file("word/document.xml").async("string");
  check("the M&E plan downloads as a Word file", /Indicator reference sheets/.test(xml) && /Logical framework matrix/.test(xml));
  const [dl2] = await Promise.all([page.waitForEvent("download", { timeout: 30000 }), page.locator('[data-doc="tracking"]').click()]);
  check("the tracking table downloads as Excel", /\.xlsx$/.test(dl2.suggestedFilename()));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
