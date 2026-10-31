// Attendance in the browser: a person, their lead, HR, and the kiosk (online and offline).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "attendance");
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
  await page.waitForURL(/dashboard|attendance|hr/, { timeout: 30000 });
  return page;
}
const go = async (page, p) => {
  await page.goto(`${base}${p}`);
  await page.waitForLoadState("load");
  await page.waitForTimeout(800);
};

try {
  // A team member
  const d = await as("dawit@demo.local");
  check("sidebar has Attendance", (await d.locator("a[href='/attendance']").count()) > 0);
  await go(d, "/attendance");
  await d.getByRole("button", { name: "Check in" }).click();
  check("check in from the app", await toast(d, /Checked in/));
  await d.waitForTimeout(1200);
  check("button turns to Check out", await d.getByRole("button", { name: "Check out" }).isVisible());
  await d.fill("#att-pin", "4826");
  await d.getByRole("button", { name: "Save PIN" }).click();
  check("set own PIN", await toast(d, /PIN saved/));
  await d.screenshot({ path: path.join(shots, "1-me.png"), fullPage: true });
  const correct = d.getByRole("button", { name: "Correct" }).first();
  if (await correct.count()) {
    await correct.click();
    await d.fill("#c-in", "08:30");
    await d.fill("#c-out", "17:35");
    await d.fill("#c-why", "Forgot to check out");
    await d.getByRole("button", { name: "Send" }).click();
    check("ask for a correction", await toast(d, /Sent for approval/));
  } else check("a past day to correct is listed", false);
  check("team member sees no board tab", (await d.locator("a[href='/attendance?tab=team']").count()) === 0);

  // The line manager and Recording lead
  const h = await as("hana@demo.local");
  await go(h, "/attendance?tab=team");
  check("lead sees the team member on the board", await h.locator("main").getByText("Dawit").first().isVisible());
  check("board shows the app check-in", await h.locator("main").getByText("App").first().isVisible());
  await h.screenshot({ path: path.join(shots, "2-board.png"), fullPage: true });
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  await go(h, `/attendance?tab=team&day=${yesterday}`);
  await h.locator("tr", { hasText: "Dawit" }).getByRole("button", { name: "Record" }).click();
  await h.getByRole("dialog").getByRole("button", { name: "Late", exact: true }).click();
  await h.fill("#m-in", "09:05");
  await h.fill("#m-note", "Kiosk not working");
  await h.getByRole("dialog").getByRole("button", { name: "Record", exact: true }).click();
  check("lead records a day by hand", await toast(h, /Recorded/));
  await h.waitForTimeout(1200);
  check("hand-made label shows", await h.locator("main").getByText("Hand-made, HR to review").first().isVisible());
  await go(h, "/attendance?tab=corrections");
  const corrRow = h.locator("li", { hasText: "Forgot to check out" });
  check("lead sees the correction to decide", await corrRow.first().isVisible());
  await corrRow.getByRole("button", { name: "Approve" }).click();
  check("lead approves the correction", await toast(h, /Approved/));
  await go(h, "/attendance?tab=timesheets");
  check("lead sees team timesheets", await h.locator("main").getByText("Dawit").first().isVisible());

  // HR (Admin)
  const a = await as("admin@demo.local");
  await go(a, "/attendance?tab=review");
  check("HR sees the hand-made day to review", await a.locator("main").getByText("Kiosk not working").first().isVisible());
  await a.getByRole("button", { name: /Mark all reviewed/ }).click();
  check("HR marks it reviewed", await toast(a, /Reviewed/));
  await a.screenshot({ path: path.join(shots, "3-review.png"), fullPage: true });
  await go(a, "/attendance?tab=setup");
  check("setup shows shifts", await a.getByLabel("Shift name").first().isVisible());
  // Kiosks are set up by Admin, in Capture.
  await go(a, "/attendance?tab=capture");
  await a.fill("input[aria-label='Kiosk name']", "Studio door");
  await a.getByRole("button", { name: "Add kiosk" }).click();
  await a.getByRole("dialog").waitFor();
  check("new kiosk gives a setup link with a QR code", (await a.getByRole("dialog").locator("img[alt='Kiosk setup code']").count()) === 1 && (await a.getByLabel("Setup link").inputValue()).includes("/api/attendance/kiosk?setup="));
  await a.screenshot({ path: path.join(shots, "4-setup-kiosk.png") });
  await a.getByRole("dialog").getByRole("button", { name: "Done" }).first().click();
  await a.screenshot({ path: path.join(shots, "5-setup.png"), fullPage: true });
  const xlsx = await a.evaluate(async (m) => {
    const r = await fetch(`/api/attendance?month=${m}`);
    return { status: r.status, type: r.headers.get("content-type"), size: (await r.arrayBuffer()).byteLength };
  }, yesterday.slice(0, 7));
  check("timesheet Excel downloads", xlsx.status === 200 && xlsx.type.includes("spreadsheet") && xlsx.size > 3000, JSON.stringify(xlsx));
  await go(a, `/attendance/badges?ids=${(await a.evaluate(() => 0)) || ""}`);
  const badgePage = await a.context().newPage();
  await badgePage.goto(`${base}/attendance?tab=setup`);
  await go(a, "/attendance?tab=setup");
  await a.locator("tr", { hasText: "Hana" }).getByRole("checkbox").check();
  const href = await a.getByRole("link", { name: "Print badges" }).getAttribute("href");
  await go(a, href);
  check("printable badge with a QR code", (await a.locator("img[alt^='Badge code for']").count()) === 1);
  await a.screenshot({ path: path.join(shots, "6-badges.png") });
  await badgePage.close();

  // The kiosk device
  const kctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const k = await kctx.newPage();
  k.on("pageerror", (e) => check("kiosk no page error", false, e.message));
  await k.goto(`${base}/kiosk`);
  check("an unpaired device is told to get a setup link", await k.getByText("This device is not a kiosk yet").isVisible());
  await k.goto(`${base}/api/attendance/kiosk?setup=${prep.setup}`);
  await k.waitForURL(/\/kiosk$/);
  await k.waitForTimeout(1500);
  check("setup link turns the device into the kiosk", await k.getByText("Main entrance").isVisible());
  await k.getByLabel("Badge code (from the scanner)").fill(prep.badge);
  await k.keyboard.press("Enter");
  await k.getByText(/Welcome, Hana/).waitFor({ timeout: 10000 }).then(() => check("badge scan checks in", true), () => check("badge scan checks in", false));
  await k.screenshot({ path: path.join(shots, "7-kiosk-badge.png") });
  await k.waitForTimeout(4500);
  await k.getByRole("button", { name: "Use my number and PIN" }).click();
  for (const ch of prep.yonasCode.replace("EMP-", "").replace(/^0+/, "")) await k.getByRole("button", { name: ch, exact: true }).click();
  await k.getByRole("button", { name: "Next" }).click();
  for (const ch of prep.pin) await k.getByRole("button", { name: ch, exact: true }).click();
  await k.getByRole("button", { name: "OK" }).click();
  await k.getByText(/Welcome, Yonas/).waitFor({ timeout: 10000 }).then(() => check("number and PIN check in", true), () => check("number and PIN check in", false));
  await k.waitForTimeout(4500);
  await kctx.setOffline(true);
  await k.getByLabel("Badge code (from the scanner)").fill(prep.badge);
  await k.keyboard.press("Enter");
  await k.getByText(/Saved at/).waitFor({ timeout: 10000 }).then(() => check("offline check-in is kept on the device", true), () => check("offline check-in is kept on the device", false));
  check("waiting count shows", await k.getByText("1 waiting to send").isVisible());
  await k.screenshot({ path: path.join(shots, "8-kiosk-offline.png") });
  await kctx.setOffline(false);
  await k.evaluate(() => window.dispatchEvent(new Event("online")));
  await k.getByText("waiting to send").waitFor({ state: "detached", timeout: 15000 }).then(() => check("sent when the network is back", true), () => check("sent when the network is back", false));
  await kctx.close();
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
