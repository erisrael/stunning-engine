// Update 1.2 Phases 5 and 6 in the browser. The customer's widget starts from a topic of the content store; on the
// desk the agent finds the spec's ten views, right-clicks a message for its menu (save, details, forward to a target
// Admin set, edit and delete their own), escalates and archives, and opens the customer panel at phone width. The
// Content screen edits and publishes a menu entry with a preview.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-desk");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];

try {
  // The customer picks a topic in the widget.
  const cust = await (await browser.newContext({ viewport: { width: 420, height: 780 } })).newPage();
  cust.on("pageerror", (e) => errors.push(`customer: ${e.message}`));
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=desk-1&name=Almaz%20Bekele`);
  check("the widget greets with the content store's welcome", await seen(cust.getByText("Welcome to MySeed Support. How can we help you today?")));
  await cust.locator("[data-topic='topic.payments']").click();
  check("the chosen topic is shown above the question", await seen(cust.locator("[data-chosen-topic]").filter({ hasText: "Payments and Billing" })));
  await cust.getByLabel("Your question").fill("I paid 300 birr, call me on 0911223344");
  await cust.getByRole("button", { name: /^Send$/ }).click();
  await seen(cust.locator("[data-live-thread]"));

  // The agent's desk.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`agent: ${e.message}`));
  const answers = [];
  page.on("dialog", (d) => d.accept(answers.shift() ?? ""));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // A forwarding target first (Queues and replies).
  await page.goto(`${base}/support?tab=queues`);
  const form = page.locator("[data-forward-form]");
  await form.waitFor({ timeout: 20000 });
  const opts = await form.getByLabel("Target", { exact: true }).locator("option").allInnerTexts();
  await form.getByLabel("Target", { exact: true }).selectOption({ label: opts.find((o) => /^Dawit/.test(o)) });
  await form.getByLabel("Target name").fill("Finance: Dawit");
  await form.getByRole("button", { name: "Add target" }).click();
  check("Admin adds a forwarding target", await seen(page.locator("[data-forward-target='Finance: Dawit']")));

  await page.goto(`${base}/support?view=all`);
  const views = await page.locator("[data-view]").allInnerTexts();
  check("the spec's ten views are offered", ["All conversations", "My conversations", "Unassigned", "Assigned to me", "Waiting in queue", "Active", "Pending", "Resolved", "Archived", "Escalated"].every((v) => views.some((x) => x.startsWith(v))), views);
  await page.locator("[data-ticket-row]").filter({ hasText: "Payments and Billing" }).first().click();
  const bubble = page.locator("[data-from=customer]").filter({ hasText: "I paid 300 birr" }).first();
  await bubble.waitFor({ timeout: 20000 });
  await page.screenshot({ path: path.join(shots, "desk.png"), fullPage: true });
  await bubble.click({ button: "right" });
  const menu = page.locator("[data-msg-menu-content]");
  const items = await menu.locator("[data-menu-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-menu-item")));
  check("right-click opens the message menu", ["reply", "react", "copy", "forward", "save", "details", "report"].every((k) => items.includes(k)) && !items.includes("edit"), items);
  await menu.locator("[data-menu-item=save]").click();
  check("Save marks the message", await seen(page.locator("[data-from=customer] [data-saved]")));
  await bubble.click({ button: "right" });
  await page.locator("[data-msg-menu-content] [data-menu-item=forward]").click();
  const fwd = page.locator("[data-forward]");
  await fwd.getByLabel("Note").fill("Is this payment in Chapa?");
  await fwd.getByRole("button", { name: "Forward" }).click();
  check("forwarding reaches the target", await seen(page.getByText(/Forwarded to 1 person/)));
  await bubble.click({ button: "right" });
  await page.locator("[data-msg-menu-content] [data-menu-item=details]").click();
  check("View details lists the forward", await seen(page.locator("[data-message-details]").getByText(/to Finance: Dawit/)));
  await page.keyboard.press("Escape");

  // The agent's own reply: edit, then delete.
  await page.getByLabel("Reply", { exact: true }).fill("We are checking your payment now.");
  await page.getByRole("button", { name: /^Send$/ }).click();
  const mine = page.locator("[data-chat-msg]").filter({ hasText: "We are checking your payment now." }).first();
  await mine.waitFor({ timeout: 15000 });
  answers.push("We are checking your payment with Finance now.");
  await mine.click({ button: "right" });
  await page.locator("[data-msg-menu-content] [data-menu-item=edit]").click();
  check("an agent edits their own reply", await seen(page.locator("[data-chat-msg]").filter({ hasText: "with Finance now." }).locator("[data-edited]")));
  answers.push("");
  await page.locator("[data-chat-msg]").filter({ hasText: "with Finance now." }).first().click({ button: "right" });
  await page.locator("[data-msg-menu-content] [data-menu-item=delete]").click();
  check("and deletes it", await seen(page.locator("[data-deleted]")));
  check("the customer no longer sees it", await (async () => { await cust.waitForTimeout(4000); return (await cust.getByText("with Finance now.").count()) === 0; })());

  // Escalate and archive.
  answers.push("Paid but not active for two days");
  await page.locator("[data-escalate]").click();
  check("escalating", await seen(page.locator("[data-escalate]").filter({ hasText: "Escalated" })));
  await page.goto(`${base}/support?view=escalated`);
  check("it is under Escalated", await seen(page.locator("[data-ticket-row]").filter({ hasText: "Payments and Billing" })));
  await page.locator("[data-ticket-row]").filter({ hasText: "Payments and Billing" }).first().click();
  await page.locator("[data-archive]").filter({ hasText: "Archive" }).waitFor({ timeout: 15000 });
  await page.locator("[data-escalate]").filter({ hasText: "Escalated" }).waitFor({ timeout: 15000 });
  await page.locator("[data-archive]").click();
  await seen(page.getByText("Archived", { exact: true }).first());
  await page.locator("[data-archive]").filter({ hasText: "Unarchive" }).waitFor({ timeout: 15000 });
  await page.goto(`${base}/support?view=archived`);
  check("archived, it is under Archived only", await seen(page.locator("[data-ticket-row]").filter({ hasText: "Payments and Billing" })) && (await (async () => { await page.goto(`${base}/support?view=all`); return (await page.locator("[data-ticket-row]").filter({ hasText: "Payments and Billing" }).count()) === 0; })()));

  // Content.
  await page.goto(`${base}/support?tab=content`);
  const entry = page.locator("[data-content-key='menu.start']");
  await entry.waitFor({ timeout: 20000 });
  await entry.getByRole("button", { name: "Start a Conversation" }).click();
  await page.getByLabel("Text").fill("Start a new conversation");
  await page.getByRole("button", { name: "Save and publish" }).click();
  check("a menu entry is published", await seen(page.getByText("Published. The bot says it now.")));
  check("the preview shows it in the Telegram frame", await seen(page.locator("[data-preview=telegram]").getByText("Start a new conversation")));
  await page.screenshot({ path: path.join(shots, "content.png"), fullPage: true });

  // Phone width: the customer panel is a sheet.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/support?view=archived`);
  await page.locator("[data-ticket-row]").first().click();
  await page.locator("[data-customer-panel-open]").waitFor({ timeout: 15000 });
  await page.locator("[data-customer-panel-open]").click();
  check("at phone width the customer panel opens as a sheet", await seen(page.getByRole("dialog").locator("[data-conversation-facts]")));
  await page.screenshot({ path: path.join(shots, "desk-phone.png"), fullPage: true });
  await page.keyboard.press("Escape");
  const wide = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no sideways scroll at phone width", !wide);
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
