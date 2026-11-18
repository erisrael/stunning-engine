// Update 1.2 Phases 3 and 4 in the browser: Legacy CMS › Records filters, sorts, pages and exports the stored rows of
// a resource found in Noor's menu (quick filters, the AND / OR builder, saved views, columns, the record drawer), and
// Resources & fields shows Noor's total against the stored count and lets Admin correct a field. Desktop and phone.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-noor");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
// The seeded rows (tests/e2e/prep.ts): Teacher 1..120, salary 5000 + 10 i, status by i % 3.
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const rows = Array.from({ length: 120 }, (_, k) => ({ i: k + 1, salary: 5000 + (k + 1) * 10, status: ["active", "on leave", "left"][(k + 1) % 3] }));
const left = rows.filter((r) => r.status === "left");
const leftRich = left.filter((r) => r.salary > 6000);

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept("Rich leavers"));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // Records.
  await page.goto(`${base}/legacy-cms?view=records`);
  await page.getByLabel("Noor resource").click();
  await page.getByRole("option", { name: /^Teachers/ }).click();
  const total = page.locator("[data-records-total]");
  await total.filter({ hasText: "120 matching records" }).waitFor({ timeout: 20000 });
  check("every stored row is counted", (await page.locator("tbody tr").count()) === 50);
  await page.screenshot({ path: path.join(shots, "records.png"), fullPage: true });

  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "left", exact: true }).click();
  await total.filter({ hasText: `${left.length} matching records` }).waitFor({ timeout: 15000 });
  check("the status quick filter narrows the whole set", true);

  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("button", { name: "Condition" }).click();
  const cond = page.locator("[data-cms-condition]").first();
  await cond.getByLabel("Field").click();
  await page.getByRole("option", { name: "Salary" }).click();
  await cond.getByLabel("Operator").click();
  await page.getByRole("option", { name: "greater than" }).click();
  await cond.getByLabel("Value").fill("6000");
  await page.getByRole("button", { name: "Apply" }).click();
  await total.filter({ hasText: `${leftRich.length} matching records` }).waitFor({ timeout: 15000 });
  check("a builder condition on money text works with the quick filter", (await page.locator("tbody tr").count()) === leftRich.length);

  await page.getByRole("button", { name: "Salary" }).click();
  await page.getByRole("button", { name: "Salary" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll("th")].some((th) => th.getAttribute("aria-sort") === "descending"));
  await page.waitForTimeout(700);
  const names = await page.locator("tbody tr td:nth-child(2)").allInnerTexts();
  check("sorting by salary, largest first", names[0] === `Teacher ${leftRich.at(-1).i}`, names.slice(0, 3));

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export" }).click();
  const csv = fs.readFileSync(await (await download).path(), "utf8").trim().split(/\r?\n/);
  check("export holds every matching row and a header", csv.length === leftRich.length + 1 && csv[0].includes("Salary"), csv.slice(0, 2));

  await page.getByRole("button", { name: /^Views/ }).click();
  await page.getByRole("button", { name: "Save the current view" }).click();
  await page.getByText("View saved.").waitFor();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Columns" }).click();
  await page.getByLabel("Show Salary").click();
  await page.keyboard.press("Escape");
  check("a column can be hidden", (await page.locator("thead th").filter({ hasText: "Salary" }).count()) === 0);

  await page.locator("tbody tr").first().click();
  await page.getByRole("heading", { name: `Teacher ${leftRich.at(-1).i}` }).waitFor({ timeout: 15000 });
  check("a record opens with all its fields", (await page.getByText("Related records").count()) === 1);
  await page.screenshot({ path: path.join(shots, "record.png"), fullPage: true });
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Reset" }).click();
  await page.getByLabel("Status", { exact: true }).click();
  await page.getByRole("option", { name: "Any" }).click();
  await total.filter({ hasText: "120 matching records" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /^Views/ }).click();
  await page.getByRole("button", { name: "Rich leavers", exact: true }).click();
  await total.filter({ hasText: `${leftRich.length} matching records` }).waitFor({ timeout: 15000 });
  check("a saved view brings its filters back", true);

  // Resources & fields.
  await page.goto(`${base}/legacy-cms?view=fields`);
  const row = page.locator("[data-cms-resource=teachers]");
  await row.waitFor({ timeout: 20000 });
  check("a resource found in Noor's menu shows Noor's total and the stored count", (await row.innerText()).includes("120"));
  await row.getByRole("button", { name: /6 fields/ }).click();
  const nameLabel = page.getByLabel("Label of name");
  await nameLabel.fill("Full name");
  await nameLabel.press("Tab");
  await page.waitForTimeout(800);
  await page.keyboard.press("Escape");
  await row.getByRole("button", { name: /6 fields/ }).click();
  check("Admin's label is kept", (await page.getByLabel("Label of name").inputValue()) === "Full name");
  check("a sensitive field is marked", (await page.getByLabel("password_hint is sensitive").getAttribute("data-state")) === "checked");
  await page.screenshot({ path: path.join(shots, "fields.png"), fullPage: true });

  // Storage & snapshots (Update 1.2): storage against Noor, snapshots as full pages, compare.
  await page.keyboard.press("Escape");
  await page.goto(`${base}/legacy-cms?view=storage`);
  await page.locator("[data-archives]").waitFor({ timeout: 20000 });
  check("storage shows what is stored against Noor's total", (await page.locator("[data-archive-resource=teachers]").innerText()).includes("120") && (await page.locator("[data-archive-stats]").innerText()).includes("120"));
  check("Fetch everything is offered", await page.locator("[data-fetch-everything]").isVisible());
  await page.locator("[data-snapshot-new]").click();
  await page.getByLabel("Snapshot name").fill("Teachers before");
  await page.getByLabel("What to copy").selectOption("teachers");
  await page.locator("[data-snapshot-save]").click();
  await page.locator("[data-snapshot='Teachers before']").waitFor({ timeout: 15000 });
  check("a snapshot is taken", (await page.locator("[data-snapshot='Teachers before']").innerText()).includes("120 records"));
  await page.locator("[data-snapshot='Teachers before']").getByRole("link", { name: "Open" }).click();
  await page.locator("[data-snapshot-records]").waitFor({ timeout: 20000 });
  await page.locator("[data-records-total='120']").waitFor({ timeout: 15000 });
  check("the snapshot opens as a page with its records", (await page.locator("[data-snapshot-row]").count()) === 50);
  await page.getByLabel("Search records").fill("Teacher 11");
  await page.locator("[data-records-total='11']").waitFor({ timeout: 15000 });
  check("its records are searched", true);
  await page.getByLabel("Search records").fill("");
  await page.locator("[data-records-total='120']").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByText("Page 2 of 3").waitFor({ timeout: 15000 });
  check("and paged", true);
  await page.screenshot({ path: path.join(shots, "snapshot-records.png"), fullPage: true });
  const snapNav = page.getByRole("navigation", { name: "Snapshot sections" });
  await snapNav.getByRole("link", { name: /Schemas/ }).click();
  check("its schemas show each field's kind and fill rate", await seen(page.locator("[data-snapshot-schemas] [data-schema-field]")));
  await snapNav.getByRole("link", { name: /Data quality/ }).click();
  check("its data quality is scored", await seen(page.locator("[data-snapshot-quality] [data-quality-score]")));
  await snapNav.getByRole("link", { name: /Logs/ }).click();
  check("its logs show its creation", await seen(page.locator("[data-snapshot-logs]").getByText(/Teachers before/)));
  await snapNav.getByRole("link", { name: /Compare/ }).click();
  await page.locator("[data-snapshot-comparison]").waitFor({ timeout: 15000 });
  check("compared with the data now, nothing changed", (await page.locator("[data-compare-resource=teachers]").innerText()).replace(/\s+/g, " ").includes("120 120 0 0 0"));
  await page.screenshot({ path: path.join(shots, "snapshot-compare.png"), fullPage: true });

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const v of ["records", "fields", "storage"]) {
    await page.goto(`${base}/legacy-cms?view=${v}`);
    await page.waitForTimeout(1500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${v} has no sideways scroll at phone width`, !wide);
    await page.screenshot({ path: path.join(shots, `${v}-phone.png`), fullPage: true });
  }
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
