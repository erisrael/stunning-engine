// Phase 13b in the browser: colourful sidebar icons (and "One colour"), the AI assistant answering with a page to
// open and a proposal confirmed by the person, typed voice commands, Alt+A, and Admin's AI card.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "assistant-ai");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
async function as(email, home = /dashboard|dev/) {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
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
  await dev.waitForLoadState("load");
  // Colourful icons in the sidebar.
  const side = dev.locator("[data-sidebar=sidebar]").first();
  const colours = await side.locator("svg.app-icon").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  check("sidebar icons are drawn with AppIcon", colours.length >= 5, colours.length);
  check("in several colours", new Set(colours).size >= 4, [...new Set(colours)].join(" "));
  await dev.screenshot({ path: path.join(shots, "1-colourful-sidebar.png") });
  await dev.evaluate(() => (document.documentElement.dataset.icons = "plain"));
  const plain = await side.locator("svg.app-icon").evaluateAll((els) => els.map((e) => getComputedStyle(e).color));
  check("'One colour' turns them back", new Set(plain).size <= 3 && new Set(plain).size < new Set(colours).size, [...new Set(plain)].join(" "));
  await dev.evaluate(() => (document.documentElement.dataset.icons = "colour"));

  // Alt+A opens the assistant.
  await dev.keyboard.press("Alt+KeyA");
  const panel = dev.getByRole("dialog", { name: "Assistant" });
  check("Alt+A opens the assistant", await panel.waitFor({ timeout: 5000 }).then(() => true, () => false));
  check("Chat starts without bulky suggestion lists", (await dev.locator("[data-assistant-suggest]").count()) === 0);
  check("Capability help is available on demand", await dev.getByRole("button",{name:"What can you do?",exact:true}).isVisible());

  // An AI answer with a page to open.
  await dev.getByLabel("Ask the assistant").fill("where is attendance");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  check("the AI offers the page", await dev.getByRole("button", { name: "Open Attendance" }).waitFor({ timeout: 15000 }).then(() => true, () => false));

  // A proposal, confirmed by the person.
  await dev.getByLabel("Ask the assistant").fill("create task Write the API guide in dev");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  const prop = dev.locator("[data-assistant-proposal]").first();
  check("the AI proposes the task", await prop.waitFor({ timeout: 15000 }).then(() => true, () => false));
  check("the proposal says what will happen", /Write the API guide/.test(await prop.innerText()));
  await dev.screenshot({ path: path.join(shots, "2-proposal.png") });
  // Update 1.0 phase 5: the task is made on the page. The form opens filled in; the person presses Create.
  check("no Confirm for tasks: it opens the form", (await prop.getByRole("button", { name: "Confirm" }).count()) === 0);
  await prop.getByRole("button", { name: "Open the form" }).click();
  const form = dev.getByRole("dialog").filter({ has: dev.locator("[data-assist='task-title']") });
  check("the task form opens on the page, filled in", await form.waitFor({ timeout: 15000 }).then(async () => (await form.locator("[data-assist='task-title']").inputValue()) === "Write the API guide", () => false));
  check("the assistant points at it", await dev.locator("[data-assistant-show]").waitFor({ timeout: 8000 }).then(() => true, () => false));
  await dev.screenshot({ path: path.join(shots, "2b-handoff.png") });
  await form.locator("[data-assist='task-save']").click();
  check("the person's Create makes it", await toast(dev, /created|saved/i));
  const stop = dev.getByRole("dialog", { name: "Show me" }).getByRole("button", { name: /Stop|Done/ });
  if (await stop.count()) await stop.first().click().catch(() => {});
  await dev.keyboard.press("Alt+KeyA");

  // A typed voice command runs at once.
  await dev.getByLabel("Ask the assistant").fill("open leave");
  await dev.getByRole("button", { name: "Ask", exact: true }).click();
  check("'open leave' opens Leave", await dev.waitForURL(/profile\?tab=leave/, { timeout: 15000 }).then(() => true, () => false));
  check("voice controls are there (read aloud, language)", (await dev.getByLabel("Voice language").count()) === 1 && (await dev.getByRole("button", { name: "Read answers aloud" }).count()) === 1);
  await dev.getByRole("button", { name: "Close the assistant" }).first().click();

  // Capabilities are requested in chat, and routines live on their own page.
  await dev.goto(`${base}/dev`);await dev.keyboard.press("Alt+KeyA");
  await dev.getByLabel("Ask the assistant").fill("What can you do?");await dev.getByRole("button",{name:"Ask",exact:true}).click();
  check("Capability help is grouped buttons for the role",await dev.locator("[data-assistant-menu] [data-assistant-group='me']").last().waitFor({timeout:5000}).then(()=>true,()=>false) && (await dev.locator("[data-assistant-menu]").last().getByRole("button").count()) >= 4);
  await dev.screenshot({ path: path.join(shots, "3b-what-can-you-do.png") });
  await dev.getByLabel("Ask the assistant").fill("routines");await dev.getByRole("button",{name:"Ask",exact:true}).click();
  await dev.getByRole("button",{name:"Open Routines",exact:true}).click();await dev.waitForURL(/routines/);
  check("Assistant routes to the Routines page",dev.url().endsWith("/routines"));
  await dev.getByRole("button",{name:"Close the assistant"}).first().click();

  // Record a routine: create a task as usual.
  await dev.getByRole("button", { name: "Record a routine",exact:true }).click();
  await dev.goto(`${base}/dev`);
  check("recording shows at the top", await dev.getByRole("status", { name: "Recording a routine" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  await dev.getByRole("button", { name: "New task" }).first().click();
  await dev.getByRole("dialog").getByLabel("Title", { exact: true }).fill("Weekly notes");
  await dev.getByRole("dialog").getByRole("button", { name: "Create", exact: true }).click();
  await dev.waitForTimeout(1500);
  check("three steps recorded", /3 steps/.test(await dev.getByRole("status", { name: "Recording a routine" }).innerText()), await dev.getByRole("status", { name: "Recording a routine" }).innerText());
  await dev.getByRole("button", { name: "Stop and save" }).click();
  const save = dev.locator("[data-save-routine]");
  await save.getByLabel("Routine name").fill("Weekly notes task");
  check("the typed title is asked each time", await save.getByLabel("Ask for Title each time").isChecked());
  await dev.screenshot({ path: path.join(shots, "4-save-routine.png") });
  await save.getByRole("button", { name: "Save routine" }).click();
  check("routine saved", await toast(dev, /Routine "Weekly notes task" saved/));

  // Run it with another title; the person confirms (Admin's default).
  await dev.goto(`${base}/routines`);
  await dev.locator("[data-routine]").filter({hasText:"Weekly notes task"}).getByRole("button",{name:"Run routine",exact:true}).click();
  const runBox = dev.locator("[data-routine-start]");
  await runBox.getByLabel("Title").fill("Second note from the routine");
  await runBox.getByRole("button", { name: "Confirm and run" }).click();
  check("the routine runs by itself", await dev.locator("[data-routine-runner]").waitFor({ timeout: 10000 }).then(() => true, () => false));
  check("and finishes", await toast(dev, /"Weekly notes task" is done/));
  await dev.goto(`${base}/dev/list`);
  check("the task it made is there", await dev.getByText("Second note from the routine").first().waitFor({ timeout: 10000 }).then(() => true, () => false));
  await dev.goto(`${base}/routines`);
  check("Routines lists it with its run", (await dev.locator("[data-routine]").filter({ hasText: "Weekly notes task" }).count()) === 1 && /Done/.test(await dev.locator("[data-run]").first().innerText()));

  // Admin's AI card.
  const admin = await as("admin@demo.local");
  await admin.goto(`${base}/admin/assistant`);
  const card = admin.locator("[data-ai-admin]");
  check("Admin sees the AI card", await card.waitFor({ timeout: 10000 }).then(() => true, () => false));
  check("AI is enabled without exposing the saved API key",(await card.getByRole("switch",{name:"Enable Smart AI Assistant across workspace"}).getAttribute("aria-checked"))==="true" && !(await admin.locator("body").innerText()).includes("sk-ant-e2e"));
  check("usage is counted", /[1-9]\d* questions/.test(await card.locator("[data-ai-usage]").innerText()));
  await admin.screenshot({ path: path.join(shots, "3-admin-ai.png"), fullPage: true });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
