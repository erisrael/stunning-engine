// Update 1.1: the support app inside Telegram (Mini App) and bot content editing.
import { chromium } from "playwright-core";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-miniapp");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};

function initData(token, user, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: "AAH", user: JSON.stringify(user) });
  const checkStr = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", key).update(checkStr).digest("hex"));
  return p.toString();
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());

  // 1. Open the support widget inside Telegram as Hana (tg:501).
  const hanaData = initData(prep.token, { id: 501, first_name: "Hana", last_name: "Girma" });
  await page.goto(`${base}/support-widget?tg=${encodeURIComponent(prep.bot)}#tgWebAppData=${encodeURIComponent(hanaData)}`);

  check("the Mini App opens for a Telegram customer", await seen(page.locator("[data-new-question]")));
  check("bot resources appear in the support app", await seen(page.locator("[data-resources]").filter({ hasText: "Student Handbook" })));
  await page.screenshot({ path: path.join(shots, "1-miniapp-home.png"), fullPage: true });

  // 2. Open with &call=1 to verify call prompt.
  await page.goto(`${base}/support-widget?tg=${encodeURIComponent(prep.bot)}&call=1#tgWebAppData=${encodeURIComponent(hanaData)}`);
  check("call prompt is shown when requested", await seen(page.locator("[data-call-prompt]")));
  await page.screenshot({ path: path.join(shots, "2-miniapp-call.png"), fullPage: true });

  // 3. Ask a question from the Mini App.
  await page.locator("[data-new-question]").click();
  await page.getByLabel("Subject").fill("Exam schedule");
  await page.getByLabel("Your question").fill("Where do we find the exam hall?");
  await page.getByRole("button", { name: "Send" }).click();
  check("the conversation thread opens", await seen(page.locator("text=Exam schedule")));
  await page.screenshot({ path: path.join(shots, "3-miniapp-ticket.png"), fullPage: true });

  // Back to list shows the conversation
  await page.getByRole("button", { name: "Back", exact: true }).click();
  check("the conversation is listed", await seen(page.locator("[data-conversation-item]").filter({ hasText: "Exam schedule" })));
  const ticketId = await page.locator("[data-conversation-item]").filter({ hasText: "Exam schedule" }).first().getAttribute("data-ticket");

  // Update 1.2, spec 15: every page of the support app.
  const tabs = page.getByRole("navigation", { name: "Support sections" });
  check("the tab bar has Home, Chats, Requests, Calls and More", (await tabs.locator("[data-tab]").evaluateAll((els) => els.map((e) => e.getAttribute("data-tab")))).join("|") === "home|chats|requests|calls|more" && (await tabs.locator("[data-tab=chats]").innerText()).startsWith("Chats"));
  await tabs.locator("[data-tab=chats]").click();
  check("Chats lists active conversations", await seen(page.locator("[data-page-chats] [data-requests=open] [data-conversation-item]").filter({ hasText: "Exam schedule" })));
  await tabs.locator("[data-tab=requests]").click();
  check("Requests explains itself when empty", await seen(page.locator("[data-page-requests]").getByText("No requests yet.")));
  await tabs.locator("[data-tab=calls]").click();
  check("Calls has the call interface and the call history", (await seen(page.locator("[data-call-interface]"))) && (await seen(page.locator("[data-call-history]"))));
  await tabs.locator("[data-tab=more]").click();
  await page.locator("[data-more=faq]").click();
  check("FAQ opens with search", await seen(page.locator("[data-page-faq] [data-help-search]")));
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator("[data-more=profile]").click();
  await page.locator("[data-page-profile]").waitFor();
  await page.getByLabel("Name", { exact: true }).fill("Hana G. Girma");
  await page.locator("[data-profile-save-name]").click();
  check("the profile saves a corrected name", await seen(page.locator("[data-page-profile]").getByText("Saved")));
  await page.screenshot({ path: path.join(shots, "3b-profile.png"), fullPage: true });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator("[data-more=language]").click();
  await page.locator("[data-language=am]").click();
  check("Language switches the app to Amharic", await seen(page.getByText("ቋንቋ", { exact: true })));
  await page.locator("[data-language=en]").click();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator("[data-more=info]").click();
  check("Support information shows the hours", await seen(page.locator("[data-support-hours]")));
  await page.screenshot({ path: path.join(shots, "3c-info.png"), fullPage: true });
  await page.goto(`${base}/support-widget?tg=${encodeURIComponent(prep.bot)}&page=t_${ticketId}#tgWebAppData=${encodeURIComponent(hanaData)}`);
  check("a deep link opens the conversation", await seen(page.locator("[data-page^='t:']")) && (await seen(page.getByText("Exam schedule"))));
  await page.goto(`${base}/support-widget?tg=${encodeURIComponent(prep.bot)}&page=faq#tgWebAppData=${encodeURIComponent(hanaData)}`);
  check("and a deep link opens the FAQ", await seen(page.locator("[data-page-faq]")));
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check("the app fits a phone without sideways scrolling", wide <= 1, { wide });

  // Inside Telegram itself: Telegram's Back and Main buttons and haptics (a stand-in for Telegram's WebApp object).
  const tgCtx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  await tgCtx.route("**/telegram-web-app.js", (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  await tgCtx.addInitScript(() => {
    const log = (window.__tg = { main: { text: null, visible: false, clicks: [] }, back: { visible: false, clicks: [] }, haptics: 0 });
    const btn = (o) => ({ show: () => (o.visible = true), hide: () => (o.visible = false), onClick: (f) => o.clicks.push(f), offClick: (f) => (o.clicks = o.clicks.filter((x) => x !== f)) });
    window.Telegram = {
      WebApp: {
        platform: "android", version: "8.0", initData: "", initDataUnsafe: {}, themeParams: {}, colorScheme: "light", ready() {}, expand() {}, onEvent() {}, offEvent() {},
        BackButton: btn(log.back),
        MainButton: { ...btn(log.main), setParams: (p) => { if (p.text) log.main.text = p.text; log.main.active = p.is_active; }, showProgress() {}, hideProgress() {} },
        HapticFeedback: { impactOccurred: () => log.haptics++, selectionChanged: () => log.haptics++, notificationOccurred: () => log.haptics++ },
      },
    };
  });
  const tgp = await tgCtx.newPage();
  tgp.on("pageerror", (e) => errors.push(e.message));
  await tgp.goto(`${base}/support-widget?tg=${encodeURIComponent(prep.bot)}#tgWebAppData=${encodeURIComponent(hanaData)}`);
  await tgp.locator("[data-page-home]").waitFor({ timeout: 15000 });
  const st1 = await tgp.evaluate(() => ({ main: window.__tg.main.visible, back: window.__tg.back.visible }));
  check("in Telegram, Home starts a conversation with + (no Ask a question Main button)", !st1.main && !st1.back && (await tgp.locator("[data-new-question]").count()) === 1, st1);
  await tgp.locator("[data-new-question]").click();
  await tgp.locator("[data-page-new]").waitFor();
  await tgp.waitForFunction(() => window.__tg.main.text === "Send" && window.__tg.back.visible, null, { timeout: 5000 }).catch(() => {});
  const st2 = await tgp.evaluate(() => ({ text: window.__tg.main.text, back: window.__tg.back.visible }));
  check("writing a question, Send is the Main button and Telegram's Back button shows", st2.text === "Send" && st2.back && (await tgp.locator("[data-page-new]").getByRole("button", { name: "Send" }).count()) === 0, st2);
  await tgp.getByLabel("Your question").fill("Sent with Telegram's button");
  await tgp.evaluate(() => window.__tg.main.clicks.at(-1)());
  check("the Main button sends it", await seen(tgp.getByText("Sent with Telegram's button")));
  await tgp.evaluate(() => window.__tg.back.clicks.at(-1)());
  check("Telegram's Back button goes back", await seen(tgp.locator("[data-page-home]")));
  check("presses give haptic feedback", (await tgp.evaluate(() => window.__tg.haptics)) >= 2);
  await tgp.screenshot({ path: path.join(shots, "3d-telegram-buttons.png"), fullPage: true });
  await tgCtx.close();

  // 4. Admin edits the bot resource in Bot Manager.
  const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (e) => errors.push(e.message));
  adminPage.on("dialog", (d) => d.accept());

  await adminPage.goto(`${base}/login`);
  await adminPage.fill("input[name=email]", "admin@demo.local");
  await adminPage.fill("input[name=password]", "Demo-Workflow-2026");
  await adminPage.getByRole("button", { name: /log in/i }).click();
  await adminPage.waitForURL((u) => !u.pathname.includes("/login"));

  await adminPage.goto(`${base}/support?tab=bots&section=content`);
  const editBtn = adminPage.locator("[aria-label='Edit Student Handbook']");
  check("content item has an edit button", await seen(editBtn));
  await editBtn.click();

  const editor = adminPage.locator("[data-content-editor='Student Handbook']");
  check("the content editor opens inline", await seen(editor));
  await editor.getByLabel("Caption").fill("Updated guidelines 2026");
  await editor.locator("[data-content-save]").click();
  check("the updated caption is saved", await seen(adminPage.locator("[data-content-item='Student Handbook']").filter({ hasText: "Updated guidelines 2026" })));
  await adminPage.screenshot({ path: path.join(shots, "4-bot-manager-edit.png"), fullPage: true });

  check("no browser errors occurred", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("miniapp flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
