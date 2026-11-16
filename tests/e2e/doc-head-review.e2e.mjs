import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let failed = 0;
let page;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"} ${name}`); if (!ok) failed++; };
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${process.env.BASE_URL}/login`);
  await page.fill("input[name=email]", prep.email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(u => !u.pathname.includes("/login"));
  await page.goto(`${process.env.BASE_URL}/dev/docs?doc=${prep.doc}`);
  const skip = page.getByRole("button", { name: "Skip", exact: true });
  if (await skip.waitFor({ timeout: 3000 }).then(() => true, () => false)) await skip.click();
  const self = page.getByRole("button", { name: /Document Head.*you/ });
  await self.waitFor(); check("department head can select themselves", await self.isVisible());
  await self.click(); await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  const approve = page.getByRole("button", { name: "Approve Specification", exact: true });
  await approve.waitFor(); check("head submission reaches the review state", await approve.isVisible());
  await approve.click(); await approve.waitFor({ state: "hidden" });
  check("head can explicitly approve the submitted document", await page.getByText("Approved Specification", { exact: true }).first().isVisible());
  const shots = path.join(process.env.SHOTS_DIR || "test-results", "doc-head-review"); fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, "approved.png"), fullPage: true });
  check("no browser exceptions", errors.length === 0);
} catch (e) { console.error(e); if (page) { console.log("URL", page.url()); console.log((await page.locator("body").innerText()).slice(0, 10000)); } check("head review flow completed", false); }
finally { await browser.close(); }
process.exitCode = failed ? 1 : 0;
