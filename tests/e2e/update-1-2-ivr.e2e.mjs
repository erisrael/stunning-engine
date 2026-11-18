// Update 1.2 Phase 9 in the browser, with fake microphones: a customer taps Call in the widget, goes through the phone
// menu (English, then Payment and billing) and waits in the Payment support queue, which rings in Admin's desk; the
// caller hangs up (abandoned) and the live board counts it. Admin builds and tests the menu on the canvas, sets a
// queue's call settings, and opens a recorded call in Call Records (player, download, outcome, legal hold).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-ivr");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = async (w, h) => browser.newContext({ viewport: { width: w, height: h }, permissions: ["microphone"] });
const errors = [];

try {
  const page = await (await ctx(1440, 900)).newPage();
  page.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  const answers = [];
  page.on("dialog", (d) => d.accept(answers.shift() ?? ""));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/support?tab=desk&view=all`);
  await page.locator("button[data-status=online]").click();

  // The caller goes through the phone menu.
  const cust = await (await ctx(420, 780)).newPage();
  cust.on("pageerror", (e) => errors.push(`customer: ${e.message}`));
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=ivr-1&name=Hana%20Girma&phone=%2B251911000111`);
  await cust.locator("[data-call-us]").click();
  const player = cust.locator("[data-ivr-player]");
  check("tapping Call opens the phone menu with the welcome", await seen(player.getByText("Welcome to MySeed Customer Support.")));
  check("it asks for the language first", await seen(player.locator("[data-ivr-choice='2']").filter({ hasText: "English" })));
  await player.locator("[data-ivr-choice='2']").click();
  check("then offers the main menu", await seen(player.locator("[data-ivr-choice='3']").filter({ hasText: "Payment and billing" })));
  await cust.screenshot({ path: path.join(shots, "1-menu.png") });
  await player.locator("[data-ivr-choice='3']").click();
  check("the caller waits in the queue", await seen(cust.locator("[data-call-state=ringing]"), 20000));
  check("the waiting caller can ask for a call-back or change topic", await seen(cust.locator("[data-call-instead-callback]")) && (await cust.locator("[data-call-change-topic]").count()) > 0);
  check("the call rings in Admin's desk", await seen(page.locator("[data-ringing]").filter({ hasText: "Hana Girma is calling" }), 20000));
  await cust.locator("[data-call-end]").click();
  check("the caller hangs up", await seen(cust.locator("[data-call-state=ended]")));

  // The live board.
  await page.goto(`${base}/support?tab=board`);
  const pay = page.locator("[data-board-queue='Payment support']");
  check("the live board shows the Payment support queue", await seen(pay));
  check("with the abandoned call counted", await seen(pay.getByText("Abandoned").locator("..").getByText("1", { exact: true })));
  check("and the agents with their state", await seen(page.locator("[data-board-agents]").getByText("Available")));
  await page.screenshot({ path: path.join(shots, "2-board.png"), fullPage: true });

  // The builder.
  await page.goto(`${base}/support?tab=ivr`);
  check("the builder shows the flow on the canvas", await seen(page.locator("[data-ivr-node='menu']")));
  check("the published flow is answering callers", await seen(page.locator("[data-ivr-active]").getByText("Answering callers")));
  check("and is ready to publish", await seen(page.locator("[data-ivr-valid]")));
  await page.locator("[data-ivr-add]").selectOption("tts");
  check("a new node flags its missing connection", await seen(page.locator("[data-ivr-issues]").getByText(/connect "Then"/)));
  check("publishing is blocked until it is fixed", await page.locator("[data-ivr-publish]").isDisabled());
  await page.locator("[data-ivr-remove]").click();
  check("removing it makes the flow valid again", await seen(page.locator("[data-ivr-valid]")));
  // Drag a node.
  const node = page.locator("[data-ivr-node='welcome']");
  const box = await node.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 130, box.y + 52, { steps: 5 });
  await page.mouse.up();
  const moved = await node.boundingBox();
  check("nodes move by dragging", Math.abs(moved.x - box.x - 100) <= 12 && Math.abs(moved.y - box.y - 40) <= 12, { box, moved });
  check("an unsaved change is flagged", await seen(page.locator("[data-ivr-dirty]")));
  // A test call through the draft.
  const test = page.locator("[data-ivr-test]");
  await test.locator("[data-ivr-test-start]").click();
  await test.locator("[data-ivr-key='2']").click();
  await test.locator("[data-ivr-key='4']").click();
  check("a test call ends in a queue with its topic", await seen(test.locator("[data-ivr-test-done=queue]").getByText("technical")));
  await page.locator("[data-ivr-save]").click();
  check("the draft saves", await seen(page.getByText("Draft saved")));
  await page.screenshot({ path: path.join(shots, "3-builder.png"), fullPage: true });

  // Queue call settings.
  await page.goto(`${base}/support?tab=queues`);
  await page.locator("[data-queue-calls='Payment support']").getByRole("button", { name: "Call settings" }).click();
  const form = page.locator("[data-queue-call-form]");
  await form.getByLabel(/Most callers waiting/).fill("5");
  await form.getByLabel(/When closed or full/).selectOption({ label: "Academy" });
  await form.locator("[data-qc-save]").click();
  check("a queue's call settings save", await seen(page.locator("[data-queue-calls='Payment support']").getByText(/up to 5 waiting.*overflows to Academy/)));

  // Call Records.
  await page.goto(`${base}/call-records`);
  check("Call Records lists the calls", await seen(page.locator(`[data-call-record='${prep.call}']`)));
  await page.locator(`[data-call-record='${prep.call}']`).click();
  const sheet = page.locator("[data-call-record-sheet]");
  check("the record shows the spec's fields", await seen(sheet.getByText("Meron Alemu")) && (await sheet.getByText("Waited").count()) > 0);
  check("with the player and a download for Admin", await seen(sheet.locator("[data-record-player] audio")) && (await sheet.locator("[data-record-download]").count()) === 1);
  await sheet.getByLabel("Outcome").selectOption("resolved");
  await sheet.getByLabel("Notes").fill("Refund explained");
  await sheet.locator("[data-record-save]").click();
  check("the outcome and notes save", await seen(page.getByText("Call record saved")));
  answers.push("Customer complaint");
  await sheet.locator("[data-record-hold]").click();
  check("Admin puts the recording under legal hold", await seen(sheet.getByRole("button", { name: /Lift legal hold/ })));
  await page.screenshot({ path: path.join(shots, "4-call-record.png"), fullPage: true });
  await page.keyboard.press("Escape");

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of ["/call-records", "/support?tab=ivr", "/support?tab=board"]) {
    await page.goto(`${base}${url}`);
    await page.waitForLoadState("networkidle").catch(() => {});
    const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`no sideways scroll at phone width on ${url}`, !wide);
  }
  await page.screenshot({ path: path.join(shots, "5-phone.png"), fullPage: true });
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
