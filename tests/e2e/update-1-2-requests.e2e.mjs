// Update 1.2 Phase 7 in the browser: Customer Support Requests. Support writes a request from a conversation on the
// desk; the Dev team's head receives it, acknowledges it, asks for information; support answers; the head approves
// (the chain's step) and resolves it; support sees the result on the request and in the conversation, and closes it.
// Admin sees the destinations and approval chains. Phone width without sideways scrolling.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-requests");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const signIn = async (email) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(`${email}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return page;
};
const act = async (page, action, text) => {
  await page.locator(`[data-request-actions] [data-action=${action}]`).click();
  if (text) {
    await page.locator("[data-action-text] textarea").fill(text);
    await page.locator("[data-action-text] button").first().click();
  }
};

try {
  // Support, from the conversation.
  const agent = await signIn("admin@demo.local");
  await agent.goto(`${base}/support?ticket=${prep.ticket}`);
  await agent.locator("[data-new-support-request]").click();
  const form = agent.locator("[data-request-form]");
  await form.waitFor({ timeout: 20000 });
  check("the new request starts from the conversation", (await form.getByLabel("Title").inputValue()) === "Lesson 4 does not load" && (await agent.getByText(/About conversation #\d+/).count()) === 1);
  await form.getByLabel("Type").selectOption("bug");
  await form.getByLabel("Error details").fill("HTTP 403 from the video server");
  await form.getByLabel("Requested action").fill("Fix the video link");
  await form.getByRole("button", { name: "Send" }).click();
  const detail = agent.locator("[data-request-detail]");
  check("sent, it is Submitted with a reference", await seen(detail.locator("[data-request-status=submitted]")));
  const ref = (await detail.getAttribute("data-request-detail")) ?? "";
  check("the reference looks right", /^SR-\d{4}-\d{4}$/.test(ref), ref);
  await agent.screenshot({ path: path.join(shots, "submitted.png"), fullPage: true });

  // The Dev head.
  const head = await signIn(prep.head);
  await head.goto(`${base}/support-requests`);
  // A first visit shows the department's tour.
  await head.getByRole("button", { name: "Skip" }).click({ timeout: 5000 }).catch(() => null);
  await head.locator("[data-request-scope=inbox]").click();
  await head.locator(`[data-request-row='${ref}']`).click();
  check("opened by the destination it is Received", await seen(head.locator("[data-request-detail] [data-request-status=received]")));
  await act(head, "acknowledge");
  check("acknowledged, a task is made in the Dev workspace", await seen(head.locator("[data-request-detail] [data-request-status=acknowledged]")) && (await seen(head.locator("[data-request-detail] dt").filter({ hasText: "Workspace task" }))));
  await act(head, "ask_info", "Which Android version?");
  check("asking for information", await seen(head.locator("[data-request-detail] [data-request-status=waiting_info]")));

  // Support answers.
  await agent.goto(`${base}/support-requests?r=${ref}`);
  await act(agent, "provide_info", "Android 11 on a Samsung A12");
  check("support answers and it is in progress", await seen(agent.locator("[data-request-detail] [data-request-status=in_progress]")));

  // Approval by the chain's head, then resolved.
  await head.goto(`${base}/support-requests?r=${ref}`);
  await act(head, "submit_approval");
  check("submitted for approval", await seen(head.locator("[data-request-detail] [data-request-status=pending_approval]")));
  await act(head, "approve");
  check("approved by the chain's step", await seen(head.locator("[data-request-detail] [data-request-status=approved]")));
  await act(head, "start");
  await act(head, "resolve", "The video token was renewed; lessons load again.");
  check("resolved", await seen(head.locator("[data-request-detail] [data-request-status=resolved]")));

  // Support sees the result, in the request and the conversation, and closes it.
  await agent.goto(`${base}/support-requests?r=${ref}`);
  check("support sees the resolution", await seen(agent.locator("[data-request-detail]").getByText("The video token was renewed; lessons load again.")));
  await act(agent, "close");
  check("and closes it", await seen(agent.locator("[data-request-detail] [data-request-status=closed]")));
  const events = await agent.locator("[data-request-detail] [data-event]").count();
  check("the history keeps every step", events >= 10, events);
  await agent.goto(`${base}/support?ticket=${prep.ticket}`);
  check("the result is noted in the conversation", await seen(agent.getByText(new RegExp(`Request ${ref} resolved`))));

  // Admin's setup.
  await agent.goto(`${base}/support-requests`);
  await agent.locator("[data-request-scope=setup]").click();
  check("Admin sees destinations and approval chains", await seen(agent.locator("[data-destination='Developer Team Head']")) && (await agent.locator("[data-chains]").getByText(/Developer Team Head/).count()) >= 1);
  await agent.screenshot({ path: path.join(shots, "setup.png"), fullPage: true });

  await agent.setViewportSize({ width: 390, height: 844 });
  await agent.goto(`${base}/support-requests?r=${ref}`);
  await agent.waitForTimeout(1500);
  check("no sideways scroll at phone width", !(await agent.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await agent.screenshot({ path: path.join(shots, "phone.png"), fullPage: true });
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
