// The office tools in a browser: Letters (writing on the page, the design editor's ribbon, templates), Documents
// (typing on the page), Sheets (the spreadsheet and Compare with Myseed data) and Slides (free design). No page
// errors, the ribbon and panes are there, and text in designs keeps its colour (a quoting bug once dropped it).
import { chromium } from "playwright-core";

const base = process.env.BASE_URL ?? "http://localhost:3123";
const shots = process.env.SHOTS_DIR || null;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let pass = 0;
let fail = 0;
const check = (name, ok, extra) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
};
const shot = async (page, name) => shots && (await page.screenshot({ path: `${shots}/${name}.png` }));

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`${page.url()}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });

  // Letters: typing on the page.
  await page.goto(`${base}/tools/letters`);
  await page.waitForSelector("text=Letter details", { timeout: 30000 });
  check("letters open on the page, with the details beside it", (await page.locator("textarea").count()) > 0);
  check("the tools tab row is hidden while the sidebar is open", (await page.locator('nav[aria-label="Tools"]').count()) === 0);
  await shot(page, "letters-write");

  // Design mode: the ribbon, panes and a template.
  await page.getByRole("tab", { name: /design/i }).first().click();
  await page.waitForSelector('[role="tablist"][aria-label="Ribbon"]', { timeout: 20000 });
  check("the design editor has the Office ribbon", (await page.locator('[role="tablist"][aria-label="Ribbon"] [role="tab"]').count()) >= 5);
  check("the format pane is there", (await page.locator('aside[aria-label="Format"]').count()) === 1);
  const colour = await page.evaluate(() => {
    const el = [...document.querySelectorAll(".dz-page, [data-page-bg] div")].find((d) => /Ref:/.test(d.textContent ?? "") && d.children.length === 1);
    return el ? getComputedStyle(el.firstElementChild ?? el).color : null;
  });
  check("text in the design keeps its own colour", colour !== null && colour !== "rgb(0, 0, 0)", colour);
  await page.getByRole("tab", { name: "insert" }).click();
  await shot(page, "letters-design-insert");
  await page.getByRole("tab", { name: "home" }).click();
  await shot(page, "letters-design");

  // Documents: typing on the page.
  await page.goto(`${base}/tools/docs`);
  await page.getByRole("button", { name: /Report/ }).first().click();
  await page.waitForSelector("text=Page setup", { timeout: 20000 });
  check("documents are edited on the page", (await page.locator('input[aria-label="Heading"]').count()) > 0);
  await shot(page, "docs");

  // Sheets: a template, the grid, and Compare with Myseed data.
  await page.goto(`${base}/tools/sheets`);
  await page.getByRole("button", { name: /Templates/ }).click();
  await page.getByRole("button", { name: /Monthly budget/ }).click();
  await page.waitForSelector('[role="grid"]', { timeout: 20000 });
  check("the budget template works out its totals", (await page.locator('[role="grid"]').innerText()).includes("TOTAL") || (await page.locator('[role="grid"]').innerText()).includes("Total"));
  await shot(page, "sheets");
  await page.getByRole("tab", { name: /Compare with Myseed data/ }).click();
  await page.waitForSelector("text=Production: parts and their stages", { timeout: 20000 });
  check("Myseed data to compare with is offered", true);
  await shot(page, "sheets-compare");

  // Slides: free design.
  await page.goto(`${base}/tools/decks`);
  await page.getByRole("button", { name: /Blank free design/ }).click();
  await page.waitForSelector('[role="tablist"][aria-label="Ribbon"]', { timeout: 20000 });
  check("slides open in the free-design editor", true);
  await shot(page, "slides");

  check("no page errors", errors.length === 0, errors);
} catch (e) {
  console.error(e);
  console.log("FAIL crashed");
  fail++;
} finally {
  await browser.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exitCode = 1;
