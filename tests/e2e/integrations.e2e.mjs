// Phase 27 in the browser: Admin, Integrations shows Office, Notion and Integrate a platform; a dataset downloads as
// Excel; a preset is added and opened for its keys and a test; a pasted OpenAPI file is read.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "integrations");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
const spec = { openapi: "3.0.0", info: { title: "Pasted SMS" }, servers: [{ url: "https://sms.example.com" }], paths: { "/send": { post: { summary: "Send SMS", requestBody: { content: { "application/json": { schema: { type: "object", properties: { msisdn: { type: "string" }, message: { type: "string" } } } } } } } } } };

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check("no page error", false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  await page.goto(`${base}/admin?tab=integrations`);
  check("the integrations hub shows", await seen(page.locator("[data-integrations-hub]")) && (await page.locator("[data-office], [data-notion], [data-platforms]").count()) === 3);
  const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 20000 }), page.locator('[data-office-export="xlsx"]').click()]);
  check("a dataset downloads as Excel", dl.suggestedFilename().endsWith(".xlsx"), dl.suggestedFilename());
  await page.locator('[data-preset="afromessage"]').click();
  check("a preset is added", await seen(page.locator('[data-connector="AfroMessage"]')));
  check("and opened for its keys", await seen(page.locator('[data-connector="AfroMessage"] [data-secrets] input').first()));
  await page.locator("[data-from-docs] summary").click();
  await page.getByLabel("OpenAPI file").fill(JSON.stringify(spec));
  await page.locator("[data-read-docs]").click();
  check("a pasted OpenAPI file is read and matched", await seen(page.locator("[data-discovery]")) && (await page.locator("[data-discovery]").getByLabel("Value of msisdn").inputValue()) === "{{to}}" && (await page.locator("[data-discovery]").getByLabel("Value of message").inputValue()) === "{{message}}");
  await page.screenshot({ path: path.join(shots, "1-integrations.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
