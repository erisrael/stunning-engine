// Admin's Noor access page (people table with department and role filters, bulk grants, saved logins, role
// defaults, data policy), the Chapa and Legacy CMS sidebar entries, and the Finance requests page for Admin.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "noor-access");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  await page.goto(`${base}/resources`);
  check("Finance requests opens for Admin", !(await page.getByText("This page could not load").count()));

  const side = page.locator("[data-sidebar=sidebar]");
  check("the sidebar has Chapa payments and Legacy CMS", (await side.locator('a[href="/finance/chapa"]').count()) > 0 && (await side.locator('a[href^="/legacy-cms"]').count()) > 0);

  await page.goto(`${base}/admin?tab=legacy-cms`);
  await page.getByText("Noor Legacy CMS: user access & credentials").waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  check("the connection card has Check, Sign in, Sign out", (await page.getByRole("button", { name: "Sign out" }).count()) === 1 && (await page.getByRole("button", { name: "Check" }).count()) === 1);
  check("people are filtered by department and role", (await page.getByRole("combobox", { name: "Department" }).count()) === 1 && (await page.getByRole("combobox", { name: "Role" }).count()) === 1);

  // Saved login, then give it with a table to two people in bulk.
  await page.getByRole("radiogroup", { name: "Noor access sections" }).getByRole("radio", { name: "Noor logins" }).click();
  await page.getByRole("button", { name: "Save a Noor login" }).click();
  await page.getByLabel("Name").fill("Finance team");
  await page.getByLabel("Noor email").fill("finance@noor.test");
  await page.getByLabel("Noor password").fill("pw");
  await page.getByRole("button", { name: "Save and test" }).click();
  await page.getByRole("cell", { name: "Finance team", exact: true }).waitFor({ timeout: 15000 });
  check("a Noor login is saved for sharing", true);

  await page.getByRole("radiogroup", { name: "Noor access sections" }).getByRole("radio", { name: "People & access" }).click();
  await page.getByLabel("Search people").fill("a");
  const boxes = page.getByRole("checkbox", { name: /^Select (?!everyone)/ });
  await boxes.nth(0).click();
  await boxes.nth(1).click();
  const bar = page.getByRole("region", { name: "Change access for the selected people" });
  await bar.getByRole("button", { name: "+ Invoices" }).click();
  await page.getByText(/Access saved for 2 people/).waitFor({ timeout: 15000 });
  await bar.getByRole("combobox", { name: "Login for the selected people" }).selectOption({ label: "Saved: Finance team" });
  await page.getByText(/Login changed for 2 people/).waitFor({ timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll("select")].filter((e) => e.getAttribute("aria-label")?.endsWith(": Noor login") && e.selectedOptions[0]?.text === "Saved: Finance team").length >= 2, null, { timeout: 15000 }).catch(() => {});
  check("bulk grants give tables and a shared login to several people", (await page.getByRole("combobox", { name: /: Noor login$/ }).evaluateAll((els) => els.filter((e) => e.selectedOptions[0]?.text === "Saved: Finance team").length)) >= 2);
  await page.screenshot({ path: path.join(shots, "people.png"), fullPage: true });

  await page.getByRole("radiogroup", { name: "Noor access sections" }).getByRole("radio", { name: "Stored data" }).click();
  await page.getByRole("radiogroup", { name: "Data policy" }).getByRole("radio", { name: "Also the people Admin allows" }).click();
  await page.getByText("Data policy saved").waitFor();
  check("the data policy can let chosen people manage stored data", true);
  await page.screenshot({ path: path.join(shots, "data.png") });

  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("Noor access flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
