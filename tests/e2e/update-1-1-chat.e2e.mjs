// Update 1.1: the support conversation works like the team chat, in the customer's widget and on the agent's desk.
// Bubbles with day separators and read ticks, the other side typing, emoji reactions, replies that quote, photos with
// a caption that open full screen, voice notes with a waveform player (fake microphone), emoji, and the customer's
// phone number with a records lookup on the desk.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-chat");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];
// A real 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

try {
  // The customer asks from the widget.
  const cctx = await browser.newContext({ viewport: { width: 420, height: 780 }, permissions: ["microphone"] });
  const cust = await cctx.newPage();
  cust.on("pageerror", (e) => errors.push(`customer: ${e.message}`));
  await cust.goto(`${base}/support-widget?key=${encodeURIComponent(prep.key)}&id=chat-1&name=Almaz%20Bekele`);
  await cust.locator("[data-new-question]").click();
  await cust.getByLabel("Your question").fill("The payment page does not open");
  await cust.getByRole("button", { name: /^Send$/ }).click();
  const thread = cust.locator("[data-live-thread]");
  check("the widget shows the conversation as chat", await seen(thread.locator("[data-from=customer]").filter({ hasText: "The payment page does not open" })));
  check("with a day separator", await seen(thread.getByText("Today", { exact: true })));

  // The agent opens it.
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ["microphone"] });
  const agent = await actx.newPage();
  agent.on("pageerror", (e) => errors.push(`agent: ${e.message}`));
  await agent.goto(`${base}/login`);
  await agent.fill("input[name=email]", "admin@demo.local");
  await agent.fill("input[name=password]", "Demo-Workflow-2026");
  await agent.getByRole("button", { name: /log in/i }).click();
  await agent.waitForURL((u) => !u.pathname.includes("/login"));
  await agent.goto(`${base}/support?tab=desk&view=all`);
  await agent.locator("button[data-status=online]").click();
  await agent.getByText("The payment page does not open").first().click();
  await agent.waitForURL(/ticket=/);
  const desk = agent.locator("[data-desk-chat]");
  check("the desk shows the same chat", await seen(desk.locator("[data-from=customer]").filter({ hasText: "The payment page does not open" })));

  // Typing, a reply and read ticks.
  await agent.getByLabel("Reply", { exact: true }).fill("Which phone");
  check("the customer sees the agent typing", await seen(thread.locator("[data-typing]"), 10000));
  await agent.getByLabel("Reply", { exact: true }).fill("Which phone do you use?");
  await agent.getByRole("button", { name: "Send", exact: true }).click();
  const agentMsg = thread.locator("[data-from=agent]").filter({ hasText: "Which phone do you use?" });
  check("the reply arrives in the widget", await seen(agentMsg));
  check("the agent's message turns Seen once the customer read it", await seen(desk.locator("[data-seen]"), 15000));

  // The customer reacts and replies to it.
  await agentMsg.hover();
  await agentMsg.getByRole("button", { name: "React to this message" }).click();
  await thread.locator("[data-react-bar]").getByRole("button", { name: "React 👍" }).click();
  check("the customer's reaction shows on the desk", await seen(desk.locator("[data-from=agent] [data-reaction='👍']"), 15000));
  await agentMsg.hover();
  await agentMsg.getByRole("button", { name: "Reply to this message" }).click();
  check("the composer shows what is answered", await seen(thread.locator("[data-replying]").filter({ hasText: "Which phone do you use?" })));
  await thread.getByLabel("Write a message").fill("A Samsung A12");
  await thread.getByLabel("Write a message").press("Enter");
  const answer = desk.locator("[data-from=customer]").filter({ hasText: "A Samsung A12" });
  check("the desk sees the reply quoting the question", await seen(answer.locator("[data-quote]").filter({ hasText: "Which phone do you use?" })));

  // A photo with a caption.
  await thread.locator("[data-chat-file-input]").setInputFiles({ name: "error.png", mimeType: "image/png", buffer: PNG });
  check("the photo waits with a preview for a caption", await seen(thread.locator("[data-pending-files] img")));
  await thread.getByLabel("Add a caption").fill("This is what I see");
  await thread.locator("[data-chat-send]").click();
  const photo = desk.locator("[data-from=customer]").filter({ hasText: "This is what I see" });
  check("the desk gets the photo with its caption", await seen(photo.locator("[data-chat-image]")));
  await photo.locator("[data-chat-image]").click();
  check("the photo opens full screen", await seen(agent.locator("[data-lightbox]")));
  await agent.keyboard.press("Escape");
  check("and closes", (await agent.locator("[data-lightbox]").count()) === 0);

  // A voice note from the agent.
  await desk.getByRole("button", { name: "Record a voice note" }).click();
  check("recording shows its timer", await seen(desk.locator("[data-recording]")));
  await agent.waitForTimeout(1600);
  await desk.getByRole("button", { name: "Send voice note" }).click();
  const voice = thread.locator("[data-from=agent] [data-voice-note]");
  check("the customer gets the voice note with a player", await seen(voice, 20000));
  await voice.locator("[data-voice-speed]").click();
  check("its speed can be changed", (await voice.locator("[data-voice-speed]").innerText()).includes("1.5"));

  // Emoji.
  await desk.getByRole("button", { name: "Emoji" }).click();
  await desk.locator("[data-emoji-picker]").getByRole("button", { name: "🙏" }).click();
  await agent.getByRole("button", { name: "Send", exact: true }).click();
  check("an emoji alone shows large", await seen(thread.locator("[data-from=agent] [data-jumbo]").filter({ hasText: "🙏" })));

  // The customer's number and their records.
  await agent.locator("[data-customer-phone]").getByRole("button", { name: "Add" }).click();
  await agent.getByLabel("Customer phone number").fill("0911 22 33 44");
  await agent.locator("[data-customer-phone]").getByRole("button", { name: "Save" }).click();
  check("the number is kept in full form", await seen(agent.locator("[data-customer-phone] [data-phone]").filter({ hasText: "+251911223344" })));
  check("with a records lookup", await seen(agent.locator("[data-lookup-records]")));

  await agent.screenshot({ path: path.join(shots, "1-desk.png") });
  await cust.screenshot({ path: path.join(shots, "2-widget.png") });
  check("no page errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  fails++;
} finally {
  await browser.close();
}
if (fails) process.exit(1);
