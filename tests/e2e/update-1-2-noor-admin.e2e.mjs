// Update 1.2, System improvements 4 in the browser: Legacy CMS › Noor admin lists Noor's admin pages by group;
// Students is read live from Noor (search, Noor's filter, pages) and a record is created, edited and deleted in
// Noor; Send SMS counts SMS parts, asks before sending and sends through Noor; Noor refusing a page is said plainly.
// Desktop and phone. Noor is the fake in tests/fixtures/noor-admin-fixture.mjs.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createNoorAdmin } from "../fixtures/noor-admin-fixture.mjs";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-noor-admin");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const fake = createNoorAdmin();
const noor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const r = fake.respond(req.method, new URL(req.url, "http://x").pathname, req.headers.cookie || "", body ? JSON.parse(body) : null);
    if (r.json) return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(r.json));
    res.writeHead(r.status, { "Content-Type": "text/html", ...(r.status === 302 ? { Location: "/admin/login" } : {}) }).end(r.html);
  });
});
await new Promise((r) => noor.listen(47393, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // The catalogue.
  await page.goto(`${base}/legacy-cms?view=admin`);
  await page.locator("[data-noor-admin]").waitFor({ timeout: 20000 });
  const groups = await page.locator("[data-admin-group] h2").allInnerTexts();
  check("Noor's admin pages are grouped", groups.join("|") === "People|Roles and permissions|Academics|Agents and commissions|Rewards and app content|Feedback and messages|Subscriptions and billing", groups);
  check("every Noor page is there", (await page.locator("a[data-admin-page]").count()) === 38, await page.locator("a[data-admin-page]").count());
  await page.screenshot({ path: path.join(shots, "catalog.png"), fullPage: true });

  // A list, live from Noor.
  await page.locator("[data-admin-page=students]").click();
  const total = page.locator("[data-noor-total]");
  await total.filter({ hasText: "1 to 25 of 30 in Noor" }).waitFor({ timeout: 20000 });
  check("Students is read live from Noor", (await page.locator("[data-noor-row]").count()) === 25);
  await page.getByLabel("Search in Noor").fill("Student 2");
  await total.filter({ hasText: "of 11 in Noor" }).waitFor({ timeout: 15000 });
  await page.getByRole("combobox", { name: "Grade" }).click();
  await page.getByRole("option", { name: "Grade 2" }).click();
  await total.filter({ hasText: "of 6 in Noor" }).waitFor({ timeout: 15000 });
  check("search and Noor's filter narrow the list in Noor", (await page.locator("[data-noor-row]").count()) === 6);
  await page.screenshot({ path: path.join(shots, "list.png"), fullPage: true });
  await page.getByLabel("Search in Noor").fill("");
  await page.getByRole("combobox", { name: "Grade" }).click();
  await page.getByRole("option", { name: "Any" }).click();
  await total.filter({ hasText: "of 30 in Noor" }).waitFor({ timeout: 15000 });
  await page.getByRole("combobox", { name: "Rows per page" }).click();
  await page.getByRole("option", { name: "10 per page" }).click();
  await page.getByText("Page 1 of 3").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Next page" }).click();
  await page.getByText("Page 2 of 3").waitFor({ timeout: 15000 });
  check("and pages through Noor", (await page.locator("[data-noor-row]").first().innerText()).includes("Student 11"));

  // Create in Noor, with Noor's validation first.
  await page.locator("[data-noor-create]").click();
  await page.locator("[data-noor-form=students]").waitFor({ timeout: 15000 });
  check("Noor's create form opens with its fields", (await page.locator("[data-noor-field]").count()) === 6);
  await page.getByLabel("Full name").fill("Student 3");
  await page.locator("[data-noor-submit]").click();
  check("Noor's validation shows on the field", await seen(page.locator("[data-noor-field=name]").getByText("The full name has already been taken.")));
  await page.getByLabel("Full name").fill("Hana Bekele");
  await page.getByRole("combobox", { name: "Grade" }).last().click();
  await page.getByRole("option", { name: "Grade 2" }).click();
  await page.locator("[data-noor-submit]").click();
  await page.getByText("Created in Noor.").waitFor({ timeout: 15000 });
  check("a student is created in Noor", fake.state.students[0].name === "Hana Bekele" && fake.state.students[0].grade === "Grade 2", fake.state.students[0]);

  // Edit and delete in Noor.
  await page.getByLabel("Search in Noor").fill("Hana");
  await page.locator("[data-noor-row='31']").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Edit 31" }).click();
  await page.getByLabel("Full name").waitFor({ timeout: 15000 });
  check("the edit form holds Noor's values", (await page.getByLabel("Full name").inputValue()) === "Hana Bekele");
  await page.getByLabel("Full name").fill("Hana B. Bekele");
  await page.locator("[data-noor-submit]").click();
  await page.getByText("Saved in Noor.").waitFor({ timeout: 15000 });
  check("and saves to Noor", fake.state.students.find((s) => s.id === 31)?.name === "Hana B. Bekele");
  await page.locator("[data-noor-row='31']").filter({ hasText: "Hana B. Bekele" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Delete 31" }).click();
  await page.locator("[data-noor-confirm-delete]").click();
  await page.getByText("Deleted in Noor.").waitFor({ timeout: 15000 });
  check("a record is deleted in Noor after asking", !fake.state.students.some((s) => s.id === 31));

  // Send SMS.
  await page.goto(`${base}/legacy-cms/admin/send-sms`);
  await page.locator("[data-noor-form=send-sms]").waitFor({ timeout: 20000 });
  await page.getByLabel("Message").fill("a".repeat(161));
  check("SMS parts are counted before sending", (await page.locator("[data-sms-count]").getAttribute("data-sms-count")) === "2" && (await page.locator("[data-sms-count]").innerText()).includes("GSM-7"));
  await page.getByLabel("Message").fill("School opens Monday.");
  await page.locator("[data-noor-submit]").click();
  await page.locator("[data-noor-confirm-send]").waitFor();
  check("sending asks first, and nothing is sent yet", fake.state.sms.length === 0);
  await page.screenshot({ path: path.join(shots, "send-sms.png"), fullPage: true });
  await page.locator("[data-noor-confirm-send]").click();
  await page.getByText(/Noor accepted it/).waitFor({ timeout: 15000 });
  check("the SMS is sent through Noor", fake.state.sms.at(-1)?.message === "School opens Monday.");

  // Settings and a refused page.
  await page.goto(`${base}/legacy-cms/admin/settings`);
  await page.locator("[data-noor-form=settings]").waitFor({ timeout: 20000 });
  await page.locator("[data-noor-field=maintenance]").getByRole("switch").click();
  await page.locator("[data-noor-submit]").click();
  await page.getByText(/Noor accepted it/).waitFor({ timeout: 15000 });
  check("Settings are saved in Noor", fake.state.settings.maintenance === true);
  await page.goto(`${base}/legacy-cms/admin/grades`);
  check("Noor refusing a page is said plainly", await seen(page.locator("[data-noor-error]").getByText(/not allowed to open/)));

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const u of ["/legacy-cms?view=admin", "/legacy-cms/admin/students", "/legacy-cms/admin/send-sms"]) {
    await page.goto(`${base}${u}`);
    await page.waitForTimeout(1500);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${u} has no sideways scroll at phone width`, !wide);
    await page.screenshot({ path: path.join(shots, `${u.replace(/\W+/g, "-")}-phone.png`), fullPage: true });
  }
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
  noor.close();
}
process.exit(fails ? 1 : 0);
