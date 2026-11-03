// Customer support in the browser: the SDK on another page opens the widget; a customer asks a question; it goes to
// the online agent at once; the agent answers in the desk; the customer sees it, calls from the widget (fake
// microphone), the agent answers the call, it is recorded, and the lead sees it all in the monitor.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "support");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required", "--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights"] });
const visible = (loc, ms = 12000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
const toast = (page, re) => visible(page.locator("[data-sonner-toast]").filter({ hasText: re }), 10000);
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, permissions: ["microphone"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email}: no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
}

const SITE = `<html><body><h1>Myseed App</h1><script src="${base}/support-sdk.js"></script><script>MyseedSupport.init({ appKey: ${JSON.stringify(prep.key)}, baseUrl: ${JSON.stringify(base)}, user: { id: "cust-1", name: "Abebe Kebede", email: "abebe@example.com", meta: { grade: "9" } } });</script></body></html>`;

try {
  // Sara opens the desk and goes online.
  const sara = await as("sara@demo.local");
  check("the Customer support link is in the agent's sidebar", await visible(sara.getByRole("link", { name: "Customer support" })));
  await sara.goto(`${base}/support`);
  await sara.locator('[data-status="online"]').click();
  check("online", await toast(sara, /You are online/));

  // The SDK on another site: the launcher opens the widget.
  const cctx = await browser.newContext({ viewport: { width: 1000, height: 820 }, permissions: ["microphone"] });
  const site = await cctx.newPage();
  site.on("pageerror", (e) => check(`customer site: no page error`, false, e.stack ?? e.message));
  site.on("requestfailed", (r) => console.log("request failed", r.url(), r.failure()?.errorText));
  // A customer's site on another address (localhost counts as secure, as https would).
  await site.route("http://localhost:4999/**", (r) => r.fulfill({ contentType: "text/html", body: SITE }));
  await site.goto("http://localhost:4999/");
  await site.locator('[data-myseed-support="launcher"]').click();
  const w = site.frameLocator('[data-myseed-support="panel"] iframe');
  check("the SDK opens the widget with the app's greeting", await visible(w.getByText("Selam! How can we help?"), 20000));
  check("it says the team is online", await visible(w.getByText("We are online")));
  await w.locator("[data-new-question]").click();
  await w.getByLabel("Subject").fill("Cannot login");
  await w.getByLabel("Your question").fill("The app says my login code expired.");
  await w.getByRole("button", { name: "Send" }).click();
  check("the conversation opens", await visible(w.locator("[data-thread]").getByText("login code expired")));
  await site.screenshot({ path: path.join(shots, "1-sdk-widget.png") });

  // It went straight to Sara.
  await sara.goto(`${base}/support?view=mine`);
  const row = sara.locator("[data-ticket-row]").first();
  check("the ticket is Sara's at once", await visible(row));
  await row.click();
  check("the customer's details are beside it", await visible(sara.getByText("abebe@example.com")));
  await sara.getByLabel("Reply").fill("Selam Abebe, I sent you a new code.");
  await sara.getByRole("button", { name: "Send", exact: true }).click();
  check("sent", await toast(sara, /Sent/));
  await sara.getByRole("button", { name: /Internal note/ }).click({ force: true });
  await sara.getByLabel("Internal note").fill("SMS provider was slow");
  await sara.getByRole("button", { name: "Add note" }).click({ force: true });
  check("note added", await toast(sara, /Note added/));
  await sara.screenshot({ path: path.join(shots, "2-desk.png"), fullPage: true });
  check("the customer sees the answer", await visible(w.locator('[data-from="agent"]').getByText("I sent you a new code"), 15000));
  check("but not the internal note", (await w.getByText("SMS provider was slow").count()) === 0);

  // A call from the widget, answered in the desk and recorded.
  await w.locator("[data-call-us]").click();
  await w.locator("[data-call-consent]").getByRole("checkbox").check();
  await w.locator("[data-call-consent]").getByRole("button", { name: "Call" }).click();
  check("the call rings in the desk", await visible(sara.locator("[data-ringing]"), 20000));
  await sara.locator("[data-ringing]").first().click();
  check("the agent is on the call", await visible(sara.locator('[data-call-panel="live"]'), 20000));
  check("the customer is connected", await visible(w.locator('[data-call-state="live"]'), 20000));
  check("it is recording", await visible(sara.locator('[data-recording="recording"]'), 10000));
  await sara.waitForTimeout(3000);
  await sara.screenshot({ path: path.join(shots, "3-call.png") });
  await sara.locator("[data-call-panel]").getByRole("button", { name: "Hang up" }).click();
  check("the recording is saved", await visible(sara.locator('[data-recording="saved"]'), 20000));
  await sara.reload();
  check("the call and its recording are on the ticket", await visible(sara.locator("[data-recording-player]"), 15000));

  // The lead's monitor.
  const liya = await as("liya@demo.local");
  await liya.goto(`${base}/support?tab=monitor`);
  check("the lead sees the agents", await visible(liya.locator("[data-agents-table]").getByText("Sara")));
  check("and the activity", await visible(liya.locator("[data-activity]").getByText(/call answered/)));
  await liya.screenshot({ path: path.join(shots, "4-monitor.png"), fullPage: true });

  // Admin's setup shows the app's snippet.
  const admin = await as("admin@demo.local");
  await admin.goto(`${base}/support?tab=apps`);
  check("the SDK snippet is ready to copy", await visible(admin.locator("[data-snippet]").getByText(prep.key)));
  await admin.screenshot({ path: path.join(shots, "5-apps.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
