// Update 1.1 live chat in the browser: a customer in the widget and an agent in the desk. Messages arrive at once
// both ways (the widget's slow fallback is 30 s, so anything faster is the live stream), typing shows on both sides,
// "Seen" appears, a file reaches the agent, Amharic with Latin typing works, and the transcript downloads.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-live");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];
try {
  // The customer asks.
  const cust = await (await browser.newContext({ viewport: { width: 420, height: 760 } })).newPage();
  cust.on("pageerror", (e) => errors.push(`customer: ${e.message} ${e.stack}`));
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=live-1&name=Almaz%20Bekele`);
  await cust.locator("[data-new-question]").click();
  await cust.getByLabel("Your question").fill("My grade 6 videos stop loading");
  await cust.getByRole("button", { name: /^Send$/ }).click();
  const thread = cust.locator("[data-live-thread]");
  const opened = await seen(thread);
  if (!opened) (await cust.screenshot({ path: path.join(shots, "0-widget-fail.png") }), console.log("ERRORS", errors));
  check("the conversation opens live", opened);

  // The agent goes online and opens it.
  const agent = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  agent.on("pageerror", (e) => errors.push(`agent: ${e.message}`));
  await agent.goto(`${base}/login`);
  await agent.fill("input[name=email]", "admin@demo.local");
  await agent.fill("input[name=password]", "Demo-Workflow-2026");
  await agent.getByRole("button", { name: /log in/i }).click();
  await agent.waitForURL((u) => !u.pathname.includes("/login"));
  await agent.goto(`${base}/support?tab=desk&view=all`);
  await agent.locator("button[data-status=online]").click();
  await agent.getByText("My grade 6 videos stop loading").first().click();
  await agent.waitForURL(/ticket=/);
  check("the agent sees the customer online", await seen(agent.locator("[data-customer-presence=online]")));

  // Typing both ways.
  await cust.getByLabel("Write a message").fill("hello");
  check("the agent sees the customer typing", await seen(agent.locator("[data-customer-typing]"), 8000));
  await cust.getByLabel("Write a message").fill("");
  await agent.getByLabel("Reply").fill("Let me check");
  check("the customer sees the agent typing", await seen(thread.locator("[data-agent-typing]"), 8000));
  check("the customer sees the agent online", await seen(thread.locator("[data-agent-presence=online]")));

  // A reply arrives at once (well under the 30 s fallback).
  await agent.getByLabel("Reply").fill("Please update the app and try again");
  await agent.getByRole("button", { name: /^Send$/ }).click();
  const t0 = Date.now();
  const arrived = await seen(thread.locator("[data-from=agent]").filter({ hasText: "Please update the app" }), 10000);
  check("the reply reaches the widget live", arrived && Date.now() - t0 < 10000, Date.now() - t0);
  check("the customer's message shows Seen", await seen(thread.locator("[data-seen]"), 8000));

  // The customer answers and sends a file; the agent sees both without reloading.
  await cust.getByLabel("Write a message").fill("Updated, still stops");
  await cust.getByLabel("Write a message").press("Enter");
  check("the customer's reply reaches the desk live", await seen(agent.locator("[data-msg=customer]").filter({ hasText: "Updated, still stops" }), 10000));
  await cust.locator("[data-widget-file-input]").setInputFiles({ name: "screen.txt", mimeType: "text/plain", buffer: Buffer.from("error 403 at 01:12") });
  check("the file reaches the desk", await seen(agent.locator("[data-ticket-file]").filter({ hasText: "screen.txt" }), 10000));
  check("and the widget shows it", await seen(thread.locator("[data-widget-file]").filter({ hasText: "screen.txt" })));
  check("the agent's reply shows Seen once the customer read it", await seen(agent.locator("[data-seen]"), 10000));
  await agent.screenshot({ path: path.join(shots, "1-desk.png"), fullPage: true });

  // Amharic.
  await cust.locator("[data-lang-toggle]").click();
  check("the widget switches to Amharic", await seen(cust.getByRole("button", { name: "ላክ" })));
  const box = cust.getByLabel("መልዕክት ይጻፉ");
  await box.pressSequentially("selam ");
  check("Latin letters become Ge'ez as you type", (await box.inputValue()) === "ሰላም ", await box.inputValue());
  await box.pressSequentially("amesegnalehu");
  await box.press("Enter");
  check("the Amharic message is sent in Ge'ez", await seen(agent.locator("[data-msg=customer]").filter({ hasText: "ሰላም አመሰግናለሁ" }), 10000));
  await cust.screenshot({ path: path.join(shots, "2-widget.png") });

  // The transcript.
  const [dl] = await Promise.all([agent.waitForEvent("download"), agent.locator("[data-transcript]").click()]);
  const text = fs.readFileSync(await dl.path(), "utf8");
  check("the transcript downloads with the conversation", text.includes("My grade 6 videos stop loading") && text.includes("ሰላም አመሰግናለሁ"));
  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("live chat flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
