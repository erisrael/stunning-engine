// Batch A in the browser: studio sessions, review notes on the lead desk, sheet selection, release plan.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "batch-a");
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
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const go = async (page, p) => (await page.goto(`${base}${p}`), await page.waitForLoadState("load"), await page.waitForTimeout(800));

try {
  const h = await as("hana@demo.local");
  check("Studio sessions in the sidebar", (await h.locator("a[href='/sessions']").count()) > 0);
  await go(h, "/sessions");
  await h.getByRole("button", { name: "Book a session" }).click();
  const dlg = h.getByRole("dialog");
  const day = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await dlg.locator("#b-date").fill(day);
  await dlg.locator("#b-time").fill("10:00");
  await dlg.getByRole("combobox", { name: "Camera operator" }).click();
  await h.getByRole("option", { name: "Dawit" }).click();
  await dlg.locator("#b-pres").fill("Teacher Almaz");
  await dlg.getByRole("checkbox", { name: "What is biology?" }).check();
  await dlg.getByRole("checkbox", { name: "The scientific method" }).check();
  await dlg.getByRole("button", { name: "Book" }).click();
  check("book a session", await toast(h, /Session booked/));
  await h.waitForTimeout(1000);
  check("the week shows it", await h.locator("article", { hasText: "Teacher Almaz" }).first().isVisible());
  await h.screenshot({ path: path.join(shots, "1-sessions.png"), fullPage: true });

  const d = await as("dawit@demo.local");
  await go(d, "/dashboard");
  check("recorder's card shows the session", await d.locator("[data-item]", { hasText: "What is biology" }).getByText("Studio A").isVisible());
  await d.locator("[data-item]", { hasText: "What is biology" }).getByRole("button", { name: "Start" }).click();
  await d.waitForTimeout(1500);
  const card = d.locator("[data-item]", { hasText: "What is biology" });
  await card.locator("button[aria-expanded]").click();
  await card.getByLabel("Camera code or link").fill("00001");
  await card.getByRole("button", { name: "Add" }).click();
  await d.waitForTimeout(1200);
  for (const l of ["Presenter and script confirmed", "Audio levels checked on playback", "Framing, focus and lighting checked", "Raw files copied to shared storage"]) {
    await card.getByRole("checkbox", { name: l }).click();
    await d.waitForTimeout(700);
  }
  await card.getByRole("button", { name: "Done" }).click();
  await d.waitForTimeout(1200);
  await card.getByRole("button", { name: "Send" }).click();
  check("recorder sends it", await toast(d, /Sent to the team lead/));

  await go(h, "/dashboard");
  const rcard = h.locator("section[aria-label='To approve'] [data-item]").first();
  await rcard.locator("button[aria-expanded]").click();
  await rcard.getByLabel("Time in the video (m:ss)").fill("0:42");
  await rcard.getByLabel("Review note").fill("Board is out of focus");
  await rcard.getByRole("button", { name: "Add", exact: true }).first().click();
  check("lead adds a time-coded note", await toast(h, /Note added/));
  await h.waitForTimeout(1000);
  check("the note shows with its time", await h.locator("[data-review-notes]").getByText("0:42").first().isVisible());
  await h.locator("section[aria-label='To approve']").getByRole("button", { name: "Return" }).first().click();
  check("return message starts with the open notes", (await h.getByLabel("What needs to change").inputValue()).includes("0:42 Board is out of focus"));
  await h.screenshot({ path: path.join(shots, "2-review-notes.png") });

  await go(h, "/sheet");
  await h.getByRole("checkbox", { name: /^Select MY-/ }).first().check();
  check("sheet selection opens the bulk bar", await h.getByText(/1 selected/).first().isVisible());
  await h.screenshot({ path: path.join(shots, "3-sheet.png") });

  await go(h, "/calendar?view=plan");
  check("release plan view", await h.getByText(/Week of/).first().isVisible());
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
