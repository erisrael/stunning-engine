// Configure whole system in the browser: the admin renames the system and its reports, switches the motion to
// cinematic and picks an icon pack; a confirmation lists the changes; afterwards the sidebar, the page and the reports
// carry them. A department page's Export menu offers the PDF report; the project dialog has "Part of"; the Dev home
// shows the Dev dojo.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "system-config");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);

try {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  await page.goto(`${base}/admin`);
  check("Admin links to Configure whole system", (await page.locator("[data-configure-system]").count()) === 1);
  await page.goto(`${base}/admin/configure`);
  await page.waitForSelector("[data-system-config]");
  await page.fill("#sc-name", "Seed");
  await page.fill("#sc-tag", "Operations");
  await page.fill("#sc-report", "Seed Operations");
  await page.click('[data-motion-option="cinematic"]');
  await page.getByRole("radio", { name: /Neon/ }).click();
  await page.screenshot({ path: path.join(shots, "1-configure.png"), fullPage: true });
  await page.click("[data-system-review]");
  const list = page.locator("[data-system-changes]");
  await list.waitFor();
  const changes = await list.innerText();
  check("the confirmation lists every change", /System name/.test(changes) && /Name on reports/.test(changes) && /Cinematic/.test(changes) && /Neon/.test(changes), changes);
  await page.screenshot({ path: path.join(shots, "2-confirm.png") });
  await page.click("[data-system-confirm]");
  await page.waitForLoadState("load");
  await page.waitForTimeout(2500);
  await page.goto(`${base}/dashboard`);
  const html = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  check("everyone without a choice gets cinematic and the neon icons", html.motion === "cinematic" && html.iconPack === "neon", JSON.stringify(html));
  check("the sidebar shows the new name", /Seed/.test(await page.locator("[data-sidebar=sidebar]").first().innerText().catch(() => "")) || /Seed/.test(await page.content()));
  check("the browser tab carries the new name", /Seed Operations/.test(await page.title()), await page.title());

  // A department page: the Export menu with the PDF report, in the company format with the new name.
  await page.goto(`${base}/dev/board`);
  await page.waitForTimeout(600);
  check("a scene cut plays on a new page", ["cut", undefined].includes(await page.evaluate(() => document.documentElement.dataset.scene)));
  await page.click("[data-page-export]");
  check("the Export menu offers a PDF report and CSV", (await page.locator("[data-export-pdf]").count()) === 1 && (await page.locator("[data-export-csv]").count()) === 1);
  await page.screenshot({ path: path.join(shots, "3-export.png") });
  await page.keyboard.press("Escape");
  const rep = await page.request.get(`${base}/api/dept-report/dev?view=board`);
  const body = await rep.text();
  check("the board's PDF report is in the company format with the new name and logo", rep.ok() && body.includes("Seed Operations") && body.includes("/api/branding/logo") && body.includes("Dev"), body.slice(0, 200));
  const rp = await ctx.newPage();
  await rp.goto(`${base}/api/dept-report/dev?view=projects`);
  await rp.screenshot({ path: path.join(shots, "4-projects-report.png"), fullPage: false });
  await rp.close();
  check("pages without a report refuse it", (await page.request.get(`${base}/api/dept-report/dev?view=dojo`)).status() === 404);

  // Projects: a main project and a part.
  await page.goto(`${base}/dev/projects`);
  await page.getByRole("button", { name: /New project/i }).click();
  check("the project dialog has Part of", (await page.locator("[data-project-parent]").count()) === 1);
  await page.keyboard.press("Escape");

  // The Dev home shows the Dev dojo.
  await page.goto(`${base}/dev`);
  check("the Dev home links to the Dev dojo", (await page.locator("[data-dojo-card]").count()) === 1);

  // A person's own choice wins: Off.
  await page.evaluate(() => {
    const a = JSON.parse(localStorage.getItem("myseed.appearance") || "{}");
    localStorage.setItem("myseed.appearance", JSON.stringify({ ...a, motion: "off", iconPack: "bold" }));
  });
  await page.reload();
  const own = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  check("a person's own motion and icons win", own.motion === "off" && own.iconPack === "bold", JSON.stringify(own));
  check("no script errors", errors.length === 0, errors.join(" | "));
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
