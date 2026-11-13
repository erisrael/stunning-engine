// The Customer Support role's home in the browser: someone with only the Support role opens the app and gets their
// agent home (no error page): stats, the waiting ticket, going online takes it, it opens in the desk.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "hotfix-support-home");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "sara@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/dashboard`);
  const home = page.locator("[data-support-home]");
  check("a Support-only user gets the agent home", await seen(home));
  check("no error page", (await page.getByText(/Something went wrong|Application error/i).count()) === 0);
  check("six numbers are shown", (await home.locator("[data-support-stats] > *").count()) === 6);
  check("the waiting ticket is listed", await seen(home.locator("[data-home-waiting]").getByText("Video does not load")));
  check("quick actions are there", await seen(home.getByRole("link", { name: /Find a student or parent/ })) && (await home.getByRole("link", { name: /Knowledge base/ }).count()) === 1);
  await page.screenshot({ path: path.join(shots, "1-home.png"), fullPage: true });
  // The slide-over preview: read the ticket without leaving the page.
  await home.locator("[data-home-waiting] [data-preview-ticket]").first().click();
  const pv = page.locator("[data-ticket-preview]");
  check("the preview slides over with the message and customer", await seen(pv.getByText("The grade 6 video stops")) && await seen(pv.locator("[data-preview-customer]").getByText("Almaz Bekele")));
  await page.screenshot({ path: path.join(shots, "1b-preview.png") });
  await page.keyboard.press("Escape");
  check("closing it keeps the page", await pv.waitFor({ state: "hidden", timeout: 5000 }).then(() => true, () => false) && page.url().includes("/dashboard"));
  // Going online (the desk's status switch) gives her the waiting ticket.
  await page.locator("button[data-status=online]").click();
  await page.locator("[data-sonner-toast]").filter({ hasText: /You are online/ }).first().waitFor({ timeout: 15000 }).catch(() => null);
  await page.reload();
  check("going online moves it to My tickets", await seen(page.locator("[data-home-mine]").getByText("Video does not load")));
  await page.locator("[data-home-mine] [data-home-ticket]").first().click();
  await page.waitForURL(/\/support\?tab=desk&ticket=/);
  check("a ticket opens in the desk", await seen(page.getByText("The grade 6 video stops")));
  await page.screenshot({ path: path.join(shots, "2-desk.png"), fullPage: true });
  check("no browser errors", errors.length === 0, errors.slice(0, 5));

  // Admin: the i-Conic card asks for the request shape instead of guessing it.
  const ad = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await ad.goto(`${base}/login`);
  await ad.fill("input[name=email]", "admin@demo.local");
  await ad.fill("input[name=password]", "Demo-Workflow-2026");
  await ad.getByRole("button", { name: /log in/i }).click();
  await ad.waitForURL((u) => !u.pathname.includes("/login"));
  await ad.goto(`${base}/admin?tab=external-apis`);
  await ad.getByRole("tab", { name: /SMS/ }).first().click();
  const card = ad.locator("[data-iconic-card]");
  check("the i-Conic card shows the send path and key style", await seen(card) && (await card.getByLabel("Send path").inputValue()) === "/send" && (await card.getByLabel("API address").inputValue()) === "");
  await card.locator("[data-iconic-test]").click();
  check("testing without an address says what to fill in", await seen(card.locator("[data-iconic-result]").getByText(/API address/)));
  await ad.screenshot({ path: path.join(shots, "3-iconic.png"), fullPage: true });

  // No emojis: the help menu uses icons, picked from a list.
  const emoji = /\p{Extended_Pictographic}/u;
  await ad.goto(`${base}/support?tab=help`);
  const pick = ad.getByLabel("Icon of Payments");
  check("menu icons are picked from a list", await seen(pick) && (await pick.inputValue()) === "card");
  check("the help setup page has no emojis", !emoji.test(await ad.locator("main").last().innerText()));
  const pub = await (await browser.newContext({ viewport: { width: 420, height: 860 } })).newPage();
  await pub.goto(`${base}/help`);
  await pub.getByText("Payments").first().waitFor({ timeout: 12000 }).catch(() => null);
  check("the help center shows icons, not emojis", !emoji.test(await pub.locator("body").innerText()) && (await pub.locator("svg").count()) >= 8);
  await pub.screenshot({ path: path.join(shots, "4-help-center.png"), fullPage: true });
} catch (e) {
  console.error(e);
  check("support home flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
