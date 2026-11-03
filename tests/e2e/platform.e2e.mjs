// Phase 28 in the browser: Admin's five platform pages: health score, database tables and a read-only query,
// API usage after a health call, status with the running deploy, and the developer page with the OpenAPI file.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "platform");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });

  await page.goto(`${base}/admin/platform?tab=health`);
  check("system health shows a score", await seen(page.locator("[data-score]")));
  await page.screenshot({ path: path.join(shots, "1-health.png"), fullPage: true });
  await page.goto(`${base}/admin/platform?tab=database`);
  check("the database lists its tables", await seen(page.locator('[data-table="users"]')));
  await page.locator("[data-run-query]").click();
  check("a read-only query runs", await seen(page.locator("[data-query-result]")));
  await page.getByLabel("SQL").fill("DELETE FROM users");
  await page.locator("[data-run-query]").click();
  check("changes are refused", await seen(page.locator("[data-sonner-toast]").filter({ hasText: "Only reading" }), 8000));
  await page.request.get(`${base}/api/health`);
  await page.goto(`${base}/admin/platform?tab=api`);
  check("API usage counts the call", await seen(page.locator('[data-route="health"]')));
  await page.goto(`${base}/admin/platform?tab=status`);
  check("status shows the running deploy", await seen(page.locator("[data-deploy]").first()) && await seen(page.locator("[data-overall]")));
  await page.goto(`${base}/admin/platform?tab=developer`);
  check("the developer page lists the APIs", await seen(page.locator('[data-endpoint="/api/support/v1/identify"]')));
  const spec = await (await page.request.get(`${base}/api/openapi.json`)).json();
  check("the OpenAPI file is served", spec.openapi?.startsWith("3") && !!spec.paths["/api/health"]);
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
