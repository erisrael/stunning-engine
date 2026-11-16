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
