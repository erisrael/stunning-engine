// Batch C in the browser: a real two-person group call (fake camera and microphone), Help chapters,
// email copies of notifications, Send later.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "batch-c");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 10000 }).then(() => true, () => false);
async function as(email) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, permissions: ["camera", "microphone"] });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`${email} no page error`, false, e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL(/dashboard/, { timeout: 30000 });
  return page;
}
const go = async (page, p) => (await page.goto(`${base}${p}`), await page.waitForLoadState("load"), await page.waitForTimeout(800));

try {
  const h = await as("hana@demo.local");
  const { group } = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
  const call = await h.evaluate(async (g) => (await fetch("/api/calls/group", { method: "POST", body: JSON.stringify({ op: "start", groupId: g, media: "video" }) }).then((r) => r.json())).data, group);
  check("Hana starts a group video call", !!call?.id, JSON.stringify(call));
  await go(h, `/call/${call.id}`);
  const d = await as("dawit@demo.local");
  await go(d, `/call/${call.id}`);
  await h.waitForTimeout(9000);
  check("both see two people in the call", (await h.getByText("2 of 4 in the call").count()) === 1 && (await d.getByText("2 of 4 in the call").count()) === 1);
  const connected = await h.evaluate(() => [...document.querySelectorAll("video")].filter((v) => v.srcObject && v.readyState >= 2).length);
  check("video flows between the two browsers", connected >= 2, connected);
  check("no 'Connecting' left", (await h.getByText("Connecting").count()) === 0);
  await h.screenshot({ path: path.join(shots, "1-group-call.png") });
  await d.getByRole("button", { name: "Leave" }).click();
  await h.waitForTimeout(4000);
  check("the other person sees them leave", (await h.getByText("1 of 4 in the call").count()) === 1);
  await h.getByRole("button", { name: "Leave" }).click();

  const a = await as("admin@demo.local");
  await go(a, "/profile/help");
  await a.getByRole("switch").first().click().catch(() => null);
  await a.getByPlaceholder(/Search/).first().fill("attendance");
  check("Help has the Attendance chapter", await a.getByText("Attendance: checking in, corrections and your team's day").first().isVisible());
  await a.getByPlaceholder(/Search/).first().fill("how it works");
  check("Help has chapters written from each department's setup", (await a.getByText(/Dev team: how it works|Marketing: how it works/).count()) > 0);

  await go(a, "/notifications");
  const emailSwitch = a.getByRole("switch", { name: "Email copies: Approvals" });
  if (await emailSwitch.count()) {
    await emailSwitch.click();
    await a.waitForTimeout(1000);
    await go(a, "/notifications");
    check("email copies switch is saved", (await a.getByRole("switch", { name: "Email copies: Approvals" }).getAttribute("aria-checked")) === "true");
  } else check("email copies switch is on the preferences", false);
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
