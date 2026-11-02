// Phase 14 in the browser: a team member reads their company mailbox under Email (folders, a message shown safely,
// an attachment), writes to a colleague with a few seconds to undo, the colleague replies, and Admin sees who has a
// mailbox. The server runs with MAIL_FAKE=1 (mail in memory).
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "mail");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re, timeout = 10000) =>
  page
    .locator("[data-sonner-toast]")
    .filter({ hasText: re })
    .first()
    .waitFor({ timeout })
    .then(
      () => true,
      () => false,
    );
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email} no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const row = (page, subject) => page.locator("[data-mail-row]").filter({ hasText: subject }).first();

try {
  const dawit = await as("dawit@demo.local");
  check("Email is in the sidebar for someone with a mailbox", await dawit.getByRole("link", { name: /^Email/ }).first().isVisible());
  await dawit.goto(`${base}/email`);
  await dawit.locator("[data-mail-list]").waitFor({ timeout: 20000 });
  check("the folders are listed", (await dawit.locator("[data-folder]").count()) === 5 && (await dawit.locator('[data-folder="inbox"]').innerText()).includes("2"));
  check("the inbox lists the mail", (await dawit.locator("[data-mail-row]").count()) === 3);
  check("no bulk-email tabs for a team member", (await dawit.getByRole("tab", { name: "Send to many" }).count()) === 0);
  await row(dawit, "Monthly report").click();
  await dawit.locator("[data-mail-message]").waitFor({ timeout: 10000 });
  check("the message opens beside the list", await dawit.getByRole("heading", { name: "Monthly report" }).isVisible());
  check("outside pictures wait for Show images", await dawit.getByRole("button", { name: "Show images" }).isVisible());
  const frame = dawit.frameLocator('iframe[title="Message body"]');
  await frame.getByText("Downloads went up").waitFor({ timeout: 10000 }).catch(() => null);
  const html = await frame.locator("html").innerHTML();
  check("the body is shown without its script", html.includes("Downloads went up") && !/<script|alert\(1\)/i.test(html), html);
  check("the attachment is offered", await dawit.getByRole("link", { name: "report.csv" }).isVisible());
  await dawit.screenshot({ path: path.join(shots, "1-inbox.png") });

  await dawit.getByRole("button", { name: "Archive" }).first().click();
  check("archived", await toast(dawit, /Archived/));
  check("Archive appears", await dawit.locator('[data-folder="archive"]').waitFor({ timeout: 10000 }).then(() => true, () => false));

  await dawit.keyboard.press("c");
  const dlg = dawit.getByRole("dialog");
  await dlg.waitFor();
  await dlg.getByLabel("To", { exact: true }).fill("yonas@myseed.test");
  await dlg.getByLabel("Subject", { exact: true }).fill("Camera for Tuesday");
  await dlg.getByLabel("Message", { exact: true }).fill("Can you bring the second camera?");
  await dlg.getByRole("button", { name: "Send", exact: true }).click();
  check("sending can be undone for a moment", await toast(dawit, /Sending/));
  check("then it is sent", await toast(dawit, /^Sent$/, 15000));
  await dawit.locator('[data-folder="sent"]').click();
  await dawit.waitForTimeout(800);
  check("a copy is in Sent", await row(dawit, "Camera for Tuesday").isVisible());

  const yonas = await as("yonas@demo.local");
  await yonas.goto(`${base}/email`);
  await yonas.locator("[data-mail-list]").waitFor({ timeout: 20000 });
  check("the colleague receives it", await row(yonas, "Camera for Tuesday").isVisible());
  await row(yonas, "Camera for Tuesday").click();
  await yonas.locator("[data-mail-message]").waitFor();
  await yonas.getByRole("button", { name: "Reply", exact: true }).click();
  const rd = yonas.getByRole("dialog");
  check("reply fills in the sender and subject", (await rd.getByLabel("To", { exact: true }).inputValue()) === "dawit@myseed.test" && (await rd.getByLabel("Subject", { exact: true }).inputValue()) === "Re: Camera for Tuesday");
  await rd.getByLabel("Message", { exact: true }).press("Control+Home");
  await rd.getByLabel("Message", { exact: true }).pressSequentially("Yes, I will.");
  await yonas.screenshot({ path: path.join(shots, "2-reply.png") });
  await rd.getByRole("button", { name: "Send", exact: true }).click();
  check("the reply is sent", await toast(yonas, /^Sent$/, 15000));

  await dawit.locator('[data-folder="inbox"]').click();
  await dawit.getByRole("button", { name: "Refresh" }).click();
  await dawit.waitForTimeout(1500);
  check("the reply arrives", await row(dawit, "Re: Camera for Tuesday").isVisible());

  const admin = await as("admin@demo.local");
  await admin.goto(`${base}/email?tab=settings`);
  await admin.locator("[data-mail-admin]").waitFor({ timeout: 20000 });
  check("Admin sees who has a mailbox", (await admin.locator("[data-mailbox]").count()) === 2);
  check("mail stays private by default", (await admin.getByRole("switch", { name: "Email managers may open mailboxes" }).getAttribute("aria-checked")) === "false");
  await admin.locator("[data-mail-admin]").screenshot({ path: path.join(shots, "3-admin.png") });
} catch (e) {
  check("ran without crashing", false, e?.stack ?? e);
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
