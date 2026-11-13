// Update 1.1 call center in the browser, with real WebRTC (fake microphones): a customer calls from the widget,
// Admin answers, mutes, holds (the widget hears hold music), brings Sara in (a conference through Admin's
// browser) and hands the call over; the widget follows the transfer to Sara. Sara then calls the customer in the
// app; the customer asks for a call-back, which Sara takes from the Calls page; the history shows it all.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-calls");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];
const ctx = async (w, h) => browser.newContext({ viewport: { width: w, height: h }, permissions: ["microphone"] });
async function agent(email) {
  const page = await (await ctx(1440, 900)).newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/support?tab=desk&view=all`);
  await page.locator("button[data-status=online]").click();
  return page;
}
try {
  const admin = await agent("admin@demo.local");
  const sara = await agent("sara@demo.local");
  const cust = await (await ctx(420, 760)).newPage();
  cust.on("pageerror", (e) => errors.push(`customer: ${e.message}`));
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=call-1&name=Hana%20Girma&phone=%2B251911000111`);

  // The customer calls; Admin answers.
  await cust.locator("[data-call-us]").click();
  check("the widget is calling", await seen(cust.locator("[data-call-state=ringing]")));
  const ring = admin.locator("[data-ringing]").filter({ hasText: "Hana Girma is calling" });
  check("the call rings in the desk", await seen(ring));
  await ring.click();
  check("Admin is connected", await seen(admin.locator("[data-call-panel=live]")));
  check("the widget is connected", await seen(cust.locator("[data-call-state=live]")));

  // Mute and hold.
  await admin.locator("[data-mute]").click();
  check("mute shows", await seen(admin.locator("[data-muted]"), 3000));
  await admin.locator("[data-mute]").click();
  await admin.locator("[data-hold]").click();
  check("the caller is on hold", await seen(cust.locator("[data-call-state=hold]"), 8000));
  await admin.screenshot({ path: path.join(shots, "1-hold.png") });
  await admin.locator("[data-hold]").click();
  check("and back", await seen(cust.locator("[data-call-state=live]"), 8000));

  // Sara joins, then takes the call (a warm transfer).
  await admin.locator("[data-invite]").click();
  await admin.getByLabel("Colleague").selectOption({ label: "Sara Tesfaye" }).catch(async () => admin.getByLabel("Colleague").selectOption({ index: 0 }));
  await admin.locator("[data-call-pick-go]").click();
  const join = sara.locator("[data-ringing]").filter({ hasText: "asks you to join a call" });
  check("Sara is asked to join", await seen(join));
  await join.click();
  check("Sara is in the call", await seen(sara.locator("[data-call-panel=live]")));
  check("Admin sees Sara with them", await seen(admin.locator("[data-conference]"), 10000));
  await admin.screenshot({ path: path.join(shots, "2-conference.png") });
  await admin.locator("[data-hand-over]").click();
  check("Admin's call ends after handing over", await seen(admin.locator("[data-call-panel=ended]")));
  const xfer = sara.locator("[data-ringing]").filter({ hasText: "Transferred to you" });
  check("the widget calls Sara again by itself", await seen(xfer, 20000));
  if (await sara.locator("[data-call-close]").count()) await sara.locator("[data-call-close]").click();
  await xfer.click();
  check("the customer is now talking with Sara", await seen(cust.locator("[data-call-state=live]").filter({ hasText: "Sara" }), 15000));
  await sara.getByLabel("Call notes").fill("Refund steps explained");
  await sara.locator("[data-hang-up]").click();
  check("the widget sees the end", await seen(cust.locator("[data-call-state=ended]")));
  await cust.getByRole("button", { name: "OK" }).click();
  await sara.locator("[data-call-close]").click().catch(() => {});

  // Sara calls the customer in the app.
  await sara.goto(`${base}/support?tab=desk&view=all`);
  await sara.getByText("Call from the app").first().click();
  await sara.waitForURL(/ticket=/);
  const dialApp = sara.locator("[data-dial-app]");
  check("the customer can be called in the app", await seen(dialApp) && (await dialApp.isEnabled()));
  await dialApp.click();
  check("it rings in the widget", await seen(cust.locator("[data-incoming-call]").filter({ hasText: "Sara is calling you" })));
  await cust.locator("[data-answer-call]").click();
  check("the outgoing call connects", await seen(sara.locator("[data-call-panel=live]")) && (await seen(cust.locator("[data-call-state=live]"))));
  await cust.locator("[data-call-end]").click();
  check("the agent sees the customer hang up", await seen(sara.locator("[data-call-panel=ended]"), 10000));
  await sara.locator("[data-call-close]").click();

  // A call-back.
  await cust.getByRole("button", { name: "OK" }).click().catch(() => {});
  await cust.locator("[data-ask-callback]").first().click();
  await cust.getByLabel("Your phone number").fill("+251911000111");
  await cust.locator("[data-callback-send]").click();
  check("the widget confirms the call-back", await seen(cust.getByText("We will call you soon")));
  await sara.goto(`${base}/support?tab=calls`);
  const cb = sara.locator("[data-callback='+251911000111']");
  check("it waits on the Calls page", await seen(cb));
  await cb.locator("[data-call-back]").click();
  check("calling back opens the phone call", await seen(sara.locator("[data-phone-panel]")));
  await sara.getByLabel("What was said").fill("Called back about the refund");
  await sara.locator("[data-phone-end]").click();
  check("the call is saved", await seen(sara.getByText("Call saved")));
  check("the call-back is gone", await sara.locator("[data-callback='+251911000111']").waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));

  // History.
  await sara.reload();
  const hist = sara.locator("[data-call-history]");
  check("history shows the transferred call", await seen(hist.locator("[data-call-row=transferred]").filter({ hasText: "Sara" })));
  check("and the phone call-back with its notes", await seen(hist.locator("tr").filter({ hasText: "Called back about the refund" })));
  check("and the outgoing app call", await seen(hist.locator("tr").filter({ hasText: "App, out" })));
  await sara.screenshot({ path: path.join(shots, "3-calls.png"), fullPage: true });
  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("call center flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
