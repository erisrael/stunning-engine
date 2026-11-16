import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "department-records");
fs.mkdirSync(shots, { recursive: true });
let failed = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message)); page.on("dialog", d => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local"); await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click(); await page.waitForURL(u => !u.pathname.includes("/login"));
  for (const [scope, dataset, field, title] of [["studio", "note", "Title", "Browser note"], ["hr", "employees", "Full name", "Browser employee"], ["finance", "parties", "Name", "Browser vendor"]]) {
    await page.goto(`${base}/${scope}/data?dataset=${dataset}`);
    await page.getByRole("button", { name: "New record", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.getByLabel(field, { exact: true }).fill(title);
    await dialog.getByRole("button", { name: "Save record" }).click(); await dialog.waitFor({ state: "hidden" });
    const row = page.locator("tr[data-record]").filter({ hasText: title }); await row.waitFor();
    check(`${scope} creates records`, await row.count() === 1);
    const id = await row.getAttribute("data-record");
    await row.click({ button: "right" }); check(`${scope} row context menu`, await page.getByRole("menuitem", { name: "Edit record", exact: true }).isVisible()); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Sheet", exact: true }).click();
    await page.waitForURL(u => u.searchParams.get("view") === "sheet");
    const cell = page.locator(`tr[data-record="${id}"]`).getByLabel(field, { exact: true });
    await cell.fill(`${title} edited`); await cell.press("Enter");
    await page.getByRole("button", { name: "Table", exact: true }).click(); await page.waitForURL(u => u.searchParams.get("view") === "table");
    await page.getByText(`${title} edited`, { exact: true }).waitFor();
    check(`${scope} sheet saves edits`, true);
    await page.locator("th[data-column]").first().click({ button: "right" }); check(`${scope} column actions`, await page.getByRole("menuitem", { name: "Sort ascending" }).isVisible()); await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Configure permissions" }).click(); check(`${scope} checkbox permission matrix`, await page.getByRole("checkbox", { name: scope === "studio" ? "Member: edit" : "Owner: edit", exact: true }).isVisible());
    await page.screenshot({ path: path.join(shots, `${scope}.png`), fullPage: true });
  }
  await page.goto(`${base}/studio/data?dataset=questions`);
  await page.getByRole("button", { name: "New record", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Question", { exact: true }).fill("Question source link check");
  await page.getByRole("dialog").getByRole("button", { name: "Save record" }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  const questionRow = page.locator("tr[data-record]").filter({ hasText: "Question source link check" });
  await questionRow.getByRole("button", { name: /^Actions/ }).click();
  await page.getByRole("menuitem", { name: "Open source record" }).click();
  await page.getByRole("dialog").waitFor();
  check("question source links open the question editor", await page.getByRole("dialog").isVisible());
  check("no browser exceptions", errors.length === 0);
} catch (e) { console.error(e); check("department records flow completed", false); }
finally { await browser.close(); }
process.exitCode = failed ? 1 : 0;
