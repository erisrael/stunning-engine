// Admin, System in the browser: health, running the jobs, a backup and a test restore, downloading it, a browser
// error reaching the Errors list, marking it fixed, and alert settings.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "system");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 90000 }).then(() => true, () => false);
try {
  const h = await fetch(`${base}/api/health`);
  check("the health address answers for uptime checks", h.status === 200 && (await h.json()).ok === true);
  check("the jobs address refuses calls without the secret", (await fetch(`${base}/api/cron/checks`)).status === 401);

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });
  const a = await ctx.newPage();
  await a.goto(`${base}/login`);
  await a.fill("input[name=email]", "admin@demo.local");
  await a.fill("input[name=password]", "Demo-Workflow-2026");
  await a.getByRole("button", { name: /log in/i }).click();
  await a.waitForURL((u) => !/\/login/.test(u.pathname));

  // A browser error, sent by the page's reporter.
  await a.evaluate(() => setTimeout(() => { throw new Error("e2e browser boom for kidus@myseed.et"); }, 0));
  await a.waitForTimeout(1500);

  await a.goto(`${base}/admin`);
  await a.getByRole("tab", { name: "System" }).click();
  await a.waitForURL(/tab=system/);
  check("opening the System tab loads it", await a.getByText("How the system is doing").waitFor({ timeout: 20000 }).then(() => true, () => false));
  check("health lists the database", await a.getByTestId("health-db").isVisible());
  await a.screenshot({ path: path.join(shots, "1-health.png"), fullPage: true });

  await a.getByRole("tab", { name: "Scheduled jobs" }).click();
  await a.getByRole("button", { name: "Run all now" }).click();
  check("the jobs run", await toast(a, "Jobs ran"));
  await a.reload();
  await a.getByRole("tab", { name: "Scheduled jobs" }).click();
  check("each job shows its last run", await a.getByRole("row", { name: /Trash clean-up/ }).getByText(/\d{1,2} \w{3} \d{4}|\d{4}/).first().isVisible().catch(() => false));
  await a.screenshot({ path: path.join(shots, "2-jobs.png"), fullPage: true });

  await a.getByRole("tab", { name: "Backups" }).click();
  await a.getByRole("button", { name: "Back up now" }).click();
  check("a backup is made from the page", await toast(a, /Backup myseed-.* saved/));
  await a.reload();
  await a.getByRole("tab", { name: "Backups" }).click();
  const link = a.getByRole("link", { name: /^Download myseed-/ }).first();
  check("the backup is listed", await link.isVisible().catch(() => false));
  const [dl] = await Promise.all([a.waitForEvent("download"), link.click()]);
  const file = await dl.path();
  check("it downloads as a backup file", /^myseed-\d{8}-\d{4}\.json\.gz$/.test(dl.suggestedFilename()) && fs.statSync(file).size > 1000, dl.suggestedFilename());
  await a.getByRole("button", { name: "Test restore now" }).click();
  check("the test restore passes", await toast(a, /rows in \d+ tables match/));
  await a.screenshot({ path: path.join(shots, "3-backups.png"), fullPage: true });

  await a.reload();
  await a.getByRole("tab", { name: /^Errors/ }).click();
  const row = a.getByTestId("error-row").filter({ hasText: "e2e browser boom" });
  check("the browser error reached Admin", await row.isVisible().catch(() => false));
  check("its email address is masked", (await row.innerText().catch(() => "")).includes("[email]"));
  await a.screenshot({ path: path.join(shots, "4-errors.png"), fullPage: true });
  await row.getByRole("button", { name: "Fixed" }).click();
  check("it can be marked fixed", await toast(a, "Marked fixed"));

  await a.getByRole("tab", { name: "Alerts" }).click();
  await a.getByLabel("Telegram bot token").fill("not-a-token");
  await a.getByRole("button", { name: "Save" }).click();
  check("a wrong Telegram token is refused", await toast(a, /Telegram bot token/));
  await a.getByLabel("Telegram bot token").fill("");
  await a.getByLabel("Keep errors for (days)").fill("30");
  await a.getByRole("button", { name: "Save" }).click();
  check("alert settings save", await toast(a, "Alert settings saved"));
  await a.getByRole("button", { name: "Send a test alert" }).click();
  check("a test alert is sent", await toast(a, /Test sent/));
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
