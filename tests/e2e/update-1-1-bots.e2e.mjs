// Update 1.1 bot manager in the browser: the system's bot with its subscribers, a PDF and a YouTube link added to
// its library, a message scheduled and cancelled, a survey built and its results opened, feedback escalated to a
// ticket, and the bot's own welcome saved.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-1-bots");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const seen = (loc, t = 12000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
const errors = [];
try {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  await page.goto(`${base}/support?tab=bots`);
  const chip = page.locator(`[data-bot="${prep.bot}"]`);
  check("the system's bot is listed with its subscribers", await seen(chip.filter({ hasText: "2 subscribers" })));
  check("and its new feedback", await seen(chip.filter({ hasText: "1 new" })));

  // Content: a PDF and a link.
  await page.getByLabel("Title").fill("Grade 6 guide");
  await page.getByLabel("Caption").fill("Read before the exam");
  await page.locator("[data-content-file]").setInputFiles({ name: "guide.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 e2e") });
  await page.locator("[data-add-content]").click();
  check("the PDF is in the library", await seen(page.locator("[data-content-item='Grade 6 guide']").filter({ hasText: "guide.pdf" })));
  await page.getByLabel("Title").fill("How to log in");
  await page.getByLabel("Link").fill("https://youtu.be/abc123");
  await page.locator("[data-add-content]").click();
  check("the link is in the library", await seen(page.locator("[data-content-item='How to log in']").filter({ hasText: "youtu.be" })));
  const [file] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "guide.pdf" }).click()]);
  await file.waitForLoadState().catch(() => null);
  check("staff can open the uploaded file", (await file.evaluate(() => document.contentType).catch(() => "")) === "application/pdf" || file.url().includes("/api/support/bot-file/"));
  await file.close();

  // A scheduled message, then cancelled.
  await page.getByLabel("Message", { exact: true }).fill("Exam tomorrow at 9");
  const t = new Date(Date.now() + 86400e3);
  const local = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}T09:00`;
  await page.getByLabel("When to send the message").fill(local);
  await page.getByRole("button", { name: "Schedule" }).last().click();
  check("the send is scheduled", await seen(page.locator("[data-push=scheduled]").filter({ hasText: "Exam tomorrow" })));
  await page.locator("[data-push=scheduled]").getByRole("button", { name: /Cancel/ }).click();
  check("and cancelled", await seen(page.locator("[data-push=cancelled]").filter({ hasText: "Exam tomorrow" })));
  await page.screenshot({ path: path.join(shots, "1-content.png"), fullPage: true });

  // A survey.
  await page.locator("[data-section=forms]").click();
  await page.locator("[data-new-form]").click();
  await page.getByLabel("Title").fill("Lesson survey");
  await page.getByLabel("Question 1", { exact: true }).fill("How do you rate the lessons?");
  await page.getByLabel("Answer type 1").selectOption("rating");
  await page.getByRole("button", { name: "Question", exact: true }).click();
  await page.getByLabel("Question 2", { exact: true }).fill("Which grade?");
  await page.getByLabel("Answer type 2").selectOption("choice");
  await page.getByLabel("Choices 2").fill("Grade 5, Grade 6");
  await page.locator("[data-save-form]").click();
  check("the survey is saved", await seen(page.locator("[data-form='Lesson survey']").filter({ hasText: "2 questions" })));
  await page.locator("[data-form='Lesson survey'] [data-results]").click();
  check("its results open", await seen(page.locator("[data-form-results]").filter({ hasText: "0 finished responses" })));
  await page.screenshot({ path: path.join(shots, "2-forms.png"), fullPage: true });

  // Feedback.
  await page.locator("[data-section=feedback]").click();
  const fb = page.locator("[data-feedback=new]").filter({ hasText: "payment page crashes" });
  check("the feedback is in New", await seen(fb));
  await fb.locator("[data-escalate]").click();
  await page.locator("[data-fstatus=escalated]").click();
  check("escalated, it links to its ticket", await seen(page.locator("[data-feedback=escalated]").getByRole("link", { name: /Ticket #\d+/ })));
  await page.screenshot({ path: path.join(shots, "3-feedback.png"), fullPage: true });

  // Settings.
  await page.locator("[data-section=settings]").click();
  await page.getByLabel("Welcome", { exact: true }).fill("Welcome to MySeed Academy");
  await page.getByLabel("Send feedback button").click();
  await page.locator("[data-save-bot-settings]").click();
  await page.waitForTimeout(1000);
  await page.reload();
  check("the bot's welcome is kept", (await page.getByLabel("Welcome", { exact: true }).inputValue()) === "Welcome to MySeed Academy");
  check("the feedback button is off", (await page.getByLabel("Send feedback button").getAttribute("aria-checked")) === "false");
  await page.screenshot({ path: path.join(shots, "4-settings.png"), fullPage: true });

  // Phone width: no sideways scrolling.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${base}/support?tab=bots&section=content`);
  await page.locator("[data-bot-manager]").waitFor();
  check("fits a phone", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  check("no browser errors", errors.length === 0, errors.slice(0, 5));
} catch (e) {
  console.error(e);
  check("bot manager flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
