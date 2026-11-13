// Update 1.0 Phase 1 in the browser: Overview and Sheet keep grade, subject and unit in view while scrolling,
// members do not see the Kiosk link or its setup screen, and the assistant can be hidden and brought back.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const login = async (email, viewport) => {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return page;
};

try {
  // A short window so the Overview table scrolls even with the demo's few parts.
  const admin = await login("admin@demo.local", { width: 1280, height: 440 });
  await admin.goto(`${base}/overview?view=table`);
  const table = admin.locator("table").first();
  await table.waitFor();
  const box = table.locator("xpath=..");
  const pinned = table.locator("tbody td[rowspan] > div.sticky").first();
  check("Overview labels sit in a sticky wrapper", (await pinned.count()) > 0);
  const label = (await pinned.innerText()).trim();
  const scrollable = await box.evaluate((el) => el.scrollHeight > el.clientHeight + 20);
  check("the Overview table scrolls in a short window", scrollable);
  await box.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await admin.waitForTimeout(200);
  const pos = await admin.evaluate(() => {
    const head = document.querySelector("table thead").getBoundingClientRect();
    const wrap = document.querySelector("table").parentElement.getBoundingClientRect();
    // The label of the grade at the bottom of the table (the last first-column label).
    const labels = [...document.querySelectorAll("tbody td[rowspan] > div.sticky")].filter((d) => d.parentElement.cellIndex === 0 || d.parentElement.parentElement.firstElementChild === d.parentElement);
    const last = labels[labels.length - 1].getBoundingClientRect();
    return { headBottom: head.bottom, labelTop: last.top, wrapBottom: wrap.bottom };
  });
  check(`the last grade label stays in view below the header after scrolling (first was "${label}")`, pos.labelTop >= pos.headBottom - 1 && pos.labelTop < pos.wrapBottom, pos);
  await admin.screenshot({ path: path.join(shots, "overview-scrolled.png") });

  await admin.goto(`${base}/overview?view=tree`);
  await admin.getByRole("button", { name: "Expand all" }).click();
  check("open hierarchy headings are sticky", (await admin.locator("button.sticky").count()) > 0);

  await admin.setViewportSize({ width: 1440, height: 900 });
  await admin.goto(`${base}/sheet`);
  const bar = admin.getByLabel("Current position in the sheet");
  await bar.waitFor({ timeout: 12000 });
  check("the Sheet shows Grade › Subject › Unit for the top row", /Grade/.test(await bar.innerText()), await bar.innerText());
  check("repeated grade cells are faded, not blank", (await admin.locator("td .opacity-35").count()) > 0);
  await admin.screenshot({ path: path.join(shots, "sheet.png") });
  check("Admin sees the Kiosk link", (await admin.locator('[data-sidebar=sidebar] a[href="/kiosk"]').count()) > 0);

  // A member.
  const dawit = await login("dawit@demo.local", { width: 1440, height: 900 });
  await dawit.goto(`${base}/attendance`);
  check("a member does not see the Kiosk link", (await dawit.locator('[data-sidebar=sidebar] a[href="/kiosk"]').count()) === 0);
  await dawit.goto(`${base}/kiosk`);
  check("a member opening /kiosk is told it is for HR and Admin", await dawit.getByRole("heading", { name: "Kiosk setup is for HR and Admin" }).isVisible());

  await dawit.goto(`${base}/dashboard`);
  await dawit.getByRole("button", { name: "Open the assistant" }).click();
  await dawit.getByRole("button", { name: "Hide the assistant" }).click();
  await dawit.getByText("Assistant hidden. Turn it back on in Settings.").waitFor();
  await dawit.reload();
  check("the hidden assistant stays hidden", (await dawit.locator("[data-assistant]").count()) === 0);
  await dawit.goto(`${base}/preferences`);
  await dawit.getByRole("radio", { name: "Shown", exact: true }).click();
  await dawit.getByText("Saved", { exact: true }).waitFor();
  await dawit.reload();
  check("Settings brings the assistant back", (await dawit.locator("[data-assistant]").count()) > 0);

  // Grade 12 shows in the Sheet with every grade, not only when filtered to it.
  await admin.goto(`${base}/sheet`);
  await admin.getByLabel("Current position in the sheet").waitFor({ timeout: 12000 });
  check("the Sheet lists Grade 12 with the other grades", (await admin.locator("table tbody").getByText("G12", { exact: true }).count()) > 0);

  // The List view keeps grade, subject and unit in view.
  await admin.goto(`${base}/content`);
  await admin.locator("table").first().waitFor();
  check("List view labels sit in a sticky wrapper", (await admin.locator("tbody td[rowspan] > div.sticky").count()) > 0);

  // A lead takes several waiting parts at once, then sees them as a table.
  const hana = await login("hana@demo.local", { width: 1440, height: 900 });
  await hana.goto(`${base}/my-work?tab=production`);
  const take = hana.locator("[data-take-work]");
  await take.waitFor({ timeout: 12000 });
  await take.getByLabel("Grade").selectOption("Grade 12");
  const shownRows = await take.locator("tbody tr").count();
  check("the waiting parts filter by grade", shownRows === 6, shownRows);
  await take.getByLabel(/^Select .*G12/).first().check();
  await take.getByLabel(/^Select .*G12/).nth(1).check();
  await take.getByRole("button", { name: /Take 2 selected/ }).click();
  await hana.getByText("2 on your work now").waitFor({ timeout: 12000 });
  check("two parts are taken at once", true);
  await hana.goto(`${base}/my-work?tab=production&view=table`);
  const mine = hana.getByRole("toolbar", { name: "Filter my parts" });
  await mine.waitFor();
  await mine.getByLabel("Grade").selectOption("Grade 12");
  const mineRows = await hana.locator("table").first().locator("tbody tr").count();
  check("My work as a table shows the two taken parts", mineRows === 2, mineRows);
  await hana.screenshot({ path: path.join(shots, "my-work-table.png") });

  check("no browser errors", admin.errors.length === 0 && dawit.errors.length === 0 && hana.errors.length === 0, [...admin.errors, ...dawit.errors, ...hana.errors].slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 1 flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
