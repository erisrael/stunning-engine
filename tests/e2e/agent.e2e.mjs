// Phases 22-23 in the browser: the assistant docked on the side (stays open between pages), Agent mode doing a
// task itself, earlier conversations, the team analyzer for a lead with the AI write-up, and People without
// Admin for a regular member.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "agent");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (loc, t = 15000) => loc.waitFor({ timeout: t }).then(() => true, () => false);
async function as(email, home = /dashboard|dev/) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email} no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(home, { timeout: 30000 });
  return page;
}

try {
  const dev = await as("abebe@demo.local");
  await dev.goto(`${base}/dev`);
  await dev.keyboard.press("Alt+KeyA");
  const panel = dev.getByRole("dialog", { name: "Assistant" });
  check("the assistant opens", await seen(panel, 8000));
  await dev.locator("[data-assistant-dock]").click();
  check("it docks on the side, full height", await seen(dev.locator("[data-assistant][data-docked]"), 5000));
  const pad = await dev.evaluate(() => getComputedStyle(document.body).paddingRight);
  check("the page makes room for it", pad === "416px", pad);
  check("Ask and Agent modes are offered", await seen(dev.locator("[data-assistant-mode]"), 5000));
  await dev.getByRole("radio", { name: "Agent" }).click();
  check("Agent mode is chosen", (await dev.locator("[data-assistant-mode]").getAttribute("data-assistant-mode")) === "agent");
  await dev.getByLabel("Ask the assistant").fill("create task Agent browser task in dev");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  const steps = dev.locator("[data-agent-steps]").first();
  check("the agent did it and says so", await seen(steps));
  check("one step, done", (await dev.locator('[data-agent-step="ok"]').count()) === 1, await steps.innerText().catch(() => ""));
  await dev.screenshot({ path: path.join(shots, "1-agent-docked.png") });
  await dev.goto(`${base}/dev/list`);
  check("the panel stays open on the next page", await seen(dev.locator("[data-assistant][data-docked]"), 8000));
  check("the task exists", await seen(dev.getByText("Agent browser task").first(), 10000));
  await dev.locator("[data-assistant-history]").click();
  check("earlier conversations are listed", await seen(dev.locator("[data-assistant-convos]").getByText("create task Agent browser task in dev").first(), 8000));
  await dev.locator("[data-assistant-convos]").getByText("create task Agent browser task in dev").first().click();
  check("an earlier conversation opens with what the agent did", await seen(dev.locator("[data-agent-steps]").first(), 8000));

  // People: no Admin for a regular member, their lead is there.
  await dev.goto(`${base}/people`);
  await dev.waitForLoadState("load");
  const body = await dev.locator("main main").innerText();
  check("a regular member does not see Admin in People", !/Administrator/.test(body) && /Lena Lead/.test(body), body.slice(0, 300));

  // The lead's analyzer.
  const lead = await as("lena@demo.local");
  await lead.goto(`${base}/dev/analyze`);
  check("the lead opens the analyzer", await seen(lead.locator("[data-team-analyzer]")));
  check("insights are shown", (await lead.locator("[data-insight]").count()) >= 1);
  check("members are listed", await seen(lead.locator('[data-member="Abebe"]'), 5000));
  check("overdue work is listed", /Analyzer task 0/.test(await lead.locator('[data-risk="overdue"]').innerText()));
  await lead.getByLabel("Question about the team").fill("Who can take more?");
  await lead.getByRole("button", { name: "Explain with AI" }).click();
  check("the AI writes it up", await seen(lead.locator("[data-analyzer-answer]")));
  await lead.screenshot({ path: path.join(shots, "2-analyzer.png"), fullPage: true });
  await dev.goto(`${base}/dev/analyze`);
  check("a member is sent away from the analyzer", await dev.waitForURL(/\/dev\/board/, { timeout: 15000 }).then(() => true, () => false), dev.url());

  // Admin's setting.
  const admin = await as("admin@demo.local");
  await admin.goto(`${base}/admin`);
  check("Admin sets who members see", await seen(admin.locator("[data-people-visibility]")));
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
