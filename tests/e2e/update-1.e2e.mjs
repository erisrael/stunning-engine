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
    const first = document.querySelector("tbody td[rowspan] > div.sticky").getBoundingClientRect();
    const wrap = document.querySelector("table").parentElement.getBoundingClientRect();
    return { headBottom: head.bottom, labelTop: first.top, wrapBottom: wrap.bottom };
  });
  check(`"${label}" stays in view below the header after scrolling`, pos.labelTop >= pos.headBottom - 1 && pos.labelTop < pos.wrapBottom, pos);
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

  check("no browser errors", admin.errors.length === 0 && dawit.errors.length === 0, [...admin.errors, ...dawit.errors].slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 1 flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
