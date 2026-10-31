// Batch B in the browser: the owner's Finance view, the HR report's absence card, the rota dialog.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "batch-b");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email} no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard|company|owners/, { timeout: 30000 });
  return page;
}
const go = async (page, p) => (await page.goto(`${base}${p}`), await page.waitForLoadState("load"), await page.waitForTimeout(800));
try {
  const o = await as("owner@demo.local");
  await go(o, "/company");
  check("owner sees a Finance tab", (await o.getByRole("link", { name: "Finance" }).count()) > 0);
  await go(o, "/company?view=finance");
  check("Finance view renders", await o.getByText("Departments against budget").isVisible());
  await o.screenshot({ path: path.join(shots, "1-company-finance.png"), fullPage: true });
  const a = await as("admin@demo.local");
  await go(a, "/company");
  check("Admin without finance access has no Finance tab", (await a.getByRole("navigation", { name: "Department" }).getByRole("link", { name: "Finance" }).count()) === 0);
  await go(a, "/hr?tab=reports");
  check("HR report shows absence and lateness", await a.getByText("Absence and lateness").isVisible());
  await go(a, "/attendance?tab=setup");
  await a.locator("tr", { hasText: "Dawit" }).getByRole("checkbox").check();
  await a.getByRole("button", { name: "Rota" }).click();
  await a.getByRole("button", { name: "Save rota" }).click();
  check("rota saved", await toast(a, /Rota set/));
  await a.waitForTimeout(1000);
  check("rota shows in the table", await a.locator("tr", { hasText: "Dawit" }).getByText(/Rota:/).isVisible());
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
