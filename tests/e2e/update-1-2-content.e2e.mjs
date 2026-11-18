// Update 1.2 in the browser: Legacy CMS › Content shows Noor's academic content (subjects, units, lessons with their
// videos, notes and quizzes), imports a quiz from pasted text and sends it to Noor in batches through Noor's own
// forms, adds lessons, and reports what there is. Then the support app on the web: a guest signs in with a phone
// number, sees the new home, and changes the app's appearance. Desktop and phone. Noor is the fake in
// tests/fixtures/noor-content-fixture.mjs.
import { chromium } from "playwright-core";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createNoorContent } from "../fixtures/noor-content-fixture.mjs";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-content");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 20000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);

const fake = createNoorContent();
const noor = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const r = fake.respond(req.method, new URL(req.url, "http://x").pathname, body && /json/.test(req.headers["content-type"] || "") ? JSON.parse(body) : null);
    if (r.json) return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(r.json));
    res.writeHead(r.status, { "Content-Type": "text/html" }).end(r.html);
  });
});
await new Promise((r) => noor.listen(47396, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", "admin@demo.local");
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));

  // 1. Subjects and a subject.
  await page.goto(`${base}/legacy-cms?view=content`);
  check("Content lists the subjects read from Noor", await seen(page.locator("[data-subject='7']").filter({ hasText: "Chemistry" })));
  await page.locator("[data-subject='7']").click();
  check("a subject opens as its units", await seen(page.locator("[data-unit='40']").filter({ hasText: "Unit 1: Chemical Reactions" })));
  check("its gaps are named", await seen(page.locator("[data-content-gaps]").filter({ hasText: "without a playable video" })));
  await page.getByRole("button", { name: "Expand all" }).click();
  check("lessons show their video and notes", (await seen(page.locator("[data-lesson='134'] img"))) && (await seen(page.locator("[data-lesson='135']").getByText("No video"))));
  await page.locator("[data-quiz='152'] button").first().click();
  check("a quiz shows its questions with the right answer", await seen(page.locator("[data-question-list]").getByText("A solid forms")));
  await page.keyboard.press("Escape");
  await page.screenshot({ path: path.join(shots, "1-subject.png"), fullPage: true });

  // 2. A quiz imported from pasted text and sent to Noor.
  await page.locator("[data-unit-actions='41']").click();
  await page.getByRole("menuitem", { name: /Quiz/ }).click();
  await page.locator("[data-quiz-paste]").fill("Which is a solution?\nA. Salt water\nB. Sand\nC. Oil\nANSWER: A\n\nWhat dissolves salt?\nA. Water\nB. Air\nANSWER: A\n\nNo answer here\nA. x\nB. y");
  check("pasted questions are previewed with what needs fixing", (await seen(page.locator("[data-quiz-preview]").getByText("2 questions ready, 1 need fixing"))) && (await seen(page.locator("[data-quiz-errors]").getByText("Question 3"))));
  await page.screenshot({ path: path.join(shots, "2-import.png") });
  await page.locator("[data-quiz-send]").click();
  await page.getByRole("radio", { name: /^Jobs/ }).click();
  check("the job finishes", await seen(page.locator("[data-content-jobs] [data-job=done]"), 30000));
  check("the quiz is in Noor with both questions", fake.state.quizzes.some((q) => q.unit_id === 41 && q.questions.length === 2 && q.questions[0].correct_answer === "A"), fake.state.quizzes.map((q) => [q.unit_id, q.questions.length]));
  await page.locator("[data-content-jobs] [data-job=done]").first().click();
  await page.screenshot({ path: path.join(shots, "3-jobs.png") });

  // 3. Lessons added to a unit.
  await page.getByRole("radio", { name: "Subjects", exact: true }).click();
  await page.locator("[data-subject='7']").click();
  await page.locator("[data-unit-actions='41']").click();
  await page.getByRole("menuitem", { name: /Lessons/ }).click();
  await page.getByLabel("Lesson title").fill("Part 1 - Solubility");
  await page.getByLabel("YouTube link").fill("https://youtu.be/dQw4w9WgXcQ");
  await page.getByLabel("Duration").fill("12:30");
  await page.locator("[data-lessons-send]").click();
  await page.getByRole("radio", { name: /^Jobs/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-content-jobs] [data-job=done]").length >= 2, null, { timeout: 30000 }).catch(() => {});
  check("the lesson is in Noor with its video", fake.state.units.find((u) => u.id === 41).lessons.some((l) => l.title === "Part 1 - Solubility" && l.youtube_video_id === "dQw4w9WgXcQ" && l.duration_seconds === 750), fake.state.units.find((u) => u.id === 41).lessons);

  // A note with a PDF on a lesson, uploaded through Noor's upload.
  await page.getByRole("radio", { name: "Subjects", exact: true }).click();
  await page.locator("[data-subject='7']").click();
  await page.getByRole("button", { name: "Expand all" }).click();
  await page.getByRole("button", { name: "Add a note to Part 2 - Balancing Equations" }).click();
  await page.getByLabel("Note", { exact: true }).fill("Practice balancing with these worked examples.");
  await page.locator("[data-note-pdf]").setInputFiles({ name: "balancing.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF") });
  await page.locator("[data-note-send]").click();
  await page.getByRole("radio", { name: /^Jobs/ }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-content-jobs] [data-job=done]").length >= 3, null, { timeout: 30000 }).catch(() => {});
  const note = fake.state.units[0].lessons.find((l) => l.id === 135).notes[0];
  check("the note reaches Noor with its PDF", !!note && /worked examples/.test(note.content_text) && /tmp-\d+\.pdf/.test(note.pdf_url ?? ""), note);

  // 4. The report.
  await page.getByRole("radio", { name: "Report", exact: true }).click();
  check("the report groups subjects by grade", await seen(page.locator("[data-content-report]").getByText("Grade 10")));
  await page.screenshot({ path: path.join(shots, "4-report.png"), fullPage: true });
  check("no page errors in Content", !errors.length, errors);

  // 5. Phone: the same subject.
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await ctx.storageState() });
  const p2 = await phone.newPage();
  await p2.goto(`${base}/legacy-cms?view=content`);
  await p2.locator("[data-subject='7']").click();
  check("Content works on a phone", await seen(p2.locator("[data-unit='40']")));
  check("without sideways scrolling", await p2.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await p2.screenshot({ path: path.join(shots, "5-phone.png"), fullPage: true });

  // 6. The support app on the web: a guest with a phone number.
  const web = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const w = await web.newPage();
  const werr = [];
  w.on("pageerror", (e) => werr.push(e.message));
  await w.goto(`${base}/support-app`);
  check("the support app offers guest sign-in", await seen(w.locator("[data-guest-start]")));
  await w.screenshot({ path: path.join(shots, "6-signin.png") });
  await w.locator("[data-guest-start]").click();
  await w.getByLabel("Your name").fill("Almaz");
  await w.getByLabel("Phone number").fill("0911 223 344");
  await w.locator("[data-guest-submit]").click();
  check("a guest is signed in to the new home", (await seen(w.locator("[data-quick-actions]"))) && (await seen(w.getByText("Hi Almaz"))));
  await w.screenshot({ path: path.join(shots, "7-home.png"), fullPage: true });
  await w.getByRole("navigation", { name: "Support sections" }).locator("[data-tab=more]").click();
  await w.locator("[data-more=appearance]").click();
  await w.locator("[data-look-option=dark]").click();
  await w.locator("[data-look-accent=green]").click();
  check("the appearance changes the app", await w.evaluate(() => document.documentElement.classList.contains("dark") && document.documentElement.dataset.accent === "green"));
  await w.screenshot({ path: path.join(shots, "8-appearance-dark.png"), fullPage: true });
  await w.reload();
  check("and stays after a reload", (await seen(w.locator("[data-quick-actions]"))) && (await w.evaluate(() => document.documentElement.classList.contains("dark"))));
  await w.getByRole("navigation", { name: "Support sections" }).locator("[data-tab=more]").click();
  await w.locator("[data-more=sign-out]").click();
  check("signing out returns to sign-in", await seen(w.locator("[data-support-signin]")));
  check("no page errors in the support app", !werr.length, werr);
} finally {
  await browser.close();
  noor.close();
}
console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exitCode = fails ? 1 : 0;
