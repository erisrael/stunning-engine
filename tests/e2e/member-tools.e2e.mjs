// Members' tools in the browser: accept or reject assigned work with a reason; right-click Ask a question (only their
// team, lead and HR); Focus mode (timer, focus view, pill); the assistant put away with its X and brought back from the
// top bar; the Assistant Manager without import buttons; a member's request to Finance going to their team lead, who
// passes it on from Approvals.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "member-tools");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const signIn = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};
const seen = (loc, timeout = 8000) => loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);

try {
  // ------------------------------------------------ the Assistant Manager: no imports
  const am = await signIn("am@demo.local");
  for (const p of ["/overview", "/calendar", "/resources", "/content"]) {
    await am.goto(`${base}${p}`);
    await am.waitForTimeout(500);
    const n = await am.getByRole("button", { name: /^Import/ }).count();
    check(`the Assistant Manager has no import button on ${p}`, n === 0, n);
  }

  // ------------------------------------------------ a member
  const m = await signIn("dawit@demo.local");
  const errors = [];
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`${base}/dashboard`);
  // Accept or reject
  const answer = m.locator("[data-answer]");
  check("assigned work offers Accept and Reject", await seen(answer));
  await answer.first().locator("[data-reject]").click();
  check("rejecting needs a reason", await m.locator("[data-answer-send]").isDisabled());
  await m.fill("[data-answer-reason]", "I am at the dentist that day");
  await m.click("[data-answer-send]");
  check("rejected, it goes back to the lead", await seen(m.getByText(/back with your team lead/)));
  await m.screenshot({ path: path.join(shots, "answered.png") });

  // Right-click, Ask a question
  await m.goto(`${base}/dashboard`);
  await m.locator("main h1").first().click({ button: "right" });
  check("right-click opens the Ask menu", await seen(m.locator("[data-ask-menu]")));
  await m.click("[data-ask-open]");
  check("the ask dialog opens", await seen(m.locator("[data-ask-dialog]")));
  await m.waitForFunction(() => (document.querySelector("[data-ask-to]")?.options.length ?? 0) > 1, null, { timeout: 10000 }).catch(() => {});
  const opts = await m.locator("[data-ask-to] option").allInnerTexts();
  check("the member can ask their lead and HR", opts.some((o) => /Hana/.test(o)) && opts.some((o) => /Helen HR/.test(o)), opts.join(","));
  check("but not Admin or another team's lead", !opts.some((o) => /^Admin$/.test(o.trim()) || /Meron/.test(o)), opts.join(","));
  await m.selectOption("[data-ask-to]", { label: "Hana" });
  await m.fill("[data-ask-text]", "Which studio is free on Thursday?");
  await m.click("[data-ask-send]");
  check("the question is sent", await seen(m.getByText("Question sent")));

  // Focus mode
  await m.click("[data-focus-open]");
  await m.fill("[data-focus-task]", "Record Unit 3");
  await m.fill("[data-focus-minutes]", "1");
  await m.click("[data-focus-start]");
  check("the focus view shows the task and the time", (await seen(m.locator("[data-focus-view]"))) && /Record Unit 3/.test(await m.locator("[data-focus-view]").innerText()));
  await m.screenshot({ path: path.join(shots, "focus.png") });
  await m.click("[data-focus-min]");
  check("working in the app keeps a timer pill", await seen(m.locator("[data-focus-pill]")));
  await m.goto(`${base}/chat`);
  check("the pill carries on across pages", await seen(m.locator("[data-focus-pill]")));
  await m.click("[data-focus-pill]");
  await m.click("[data-focus-stop]");
  check("ending it removes the pill", (await m.locator("[data-focus-pill]").count()) === 0);

  // The assistant: put away and back
  await m.goto(`${base}/dashboard`);
  if (await seen(m.locator("[data-assistant-tuck]"), 5000)) {
    await m.click("[data-assistant-tuck]");
    check("the X puts the assistant away", await m.locator("[data-assistant]").isHidden());
    await m.reload();
    check("it stays away after a reload", await m.locator("[data-assistant][data-tucked]").first().waitFor({ state: "attached", timeout: 8000 }).then(() => m.locator("[data-assistant]").isHidden(), () => false));
    await m.click("[data-assistant-toggle]");
    check("the top bar's Assistant button brings it back, open", await seen(m.getByRole("dialog", { name: "Assistant" })));
  } else check("the assistant shows for the member", false);

  // A request to Finance goes to the team lead first
  await m.goto(`${base}/resources`);
  await m.getByRole("button", { name: "Request from Finance" }).click();
  await m.selectOption("[data-request-kind]", "device");
  await m.getByLabel("Request title").fill("Tripod for the studio");
  await m.getByLabel("Justification").fill("Our tripod broke");
  await m.getByRole("button", { name: "Send to Finance" }).click();
  check("the member's request is with the team lead", await seen(m.locator("[data-request-status]", { hasText: "With team lead" })));
  check("no page errors for the member", errors.length === 0, errors.join(" | "));

  const lead = await signIn("hana@demo.local");
  await lead.goto(`${base}/approvals`);
  const row = lead.locator("[data-review-row]", { hasText: "Tripod" });
  check("the lead sees it on Approvals", await seen(row));
  await row.locator("[data-review-pass]").click();
  check("and passes it on to Finance", await seen(lead.getByText(/passed on to Finance/)));
  await lead.screenshot({ path: path.join(shots, "lead-approvals.png") });
} catch (e) {
  console.log(`FAIL crashed: ${e?.stack ?? e}`);
  fails++;
} finally {
  await browser.close();
}
console.log(`\n${fails ? "FAILED" : "ok"}`);
process.exitCode = fails ? 1 : 0;
