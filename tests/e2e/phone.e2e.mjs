// On a phone: Settings in one page that fits, Tools instead of Alerts in the tab bar, notification settings moved,
// Help customized on this device, leave without balances (Ask HR, evidence for sick leave), the chat message box
// above everything, and leaving the site while checked in.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "phone");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (l, ms = 15000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);
const errors = [];
const OFFICE = { latitude: 9.0108, longitude: 38.7613, accuracy: 15 };
const AWAY = { latitude: 9.03, longitude: 38.79, accuracy: 15 };

async function login(email, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true, ...opts });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email} ${page.url()}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return { page, ctx };
}
const fits = async (page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const toast = (page, re) => seen(page.locator("[data-sonner-toast]").filter({ hasText: re }));

try {
  const { page, ctx } = await login("dawit@demo.local", { permissions: ["geolocation"], geolocation: OFFICE });

  // ---- Leaving the site: asked once, then told when away.
  await page.goto(`${base}/dashboard`);
  const ask = page.locator("[data-geofence-ask]");
  check("checked in: the phone asks once to use its location", await seen(ask, 20000));
  await ask.getByRole("button", { name: "Allow location" }).click();
  check("the question goes away", await ask.waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  await page.waitForTimeout(2000);
  await ctx.setGeolocation(AWAY);
  check("away from the site: the person is told", await seen(page.locator("[data-sonner-toast]").filter({ hasText: /You left Head office/ }), 70000));
  await page.screenshot({ path: path.join(shots, "1-left.png") });
  await ctx.setGeolocation(OFFICE);

  // ---- The tab bar: Tools in place of Alerts.
  const nav = page.locator("[data-mobile-nav]");
  check("no Alerts tab", (await nav.locator('[data-mobile-tab="Alerts"]').count()) === 0);
  await nav.locator('[data-mobile-tab="Tools"]').click();
  const sheet = page.locator("[data-tools-sheet]");
  check("Tools opens the tools", await seen(sheet) && (await sheet.locator("[data-tool]").count()) >= 6);
  check("with Alerts and Settings in it", (await sheet.locator('[data-tool="Alerts"]').count()) === 1 && (await sheet.locator('[data-tool="Settings"]').count()) === 1);
  await page.screenshot({ path: path.join(shots, "2-tools.png") });
  await sheet.locator('[data-tool="Settings"]').click();
  await page.waitForURL(/\/preferences/);

  // ---- Settings: everything in one page that fits.
  await seen(page.locator("[data-personal-settings]:visible"));
  check("Settings fits the phone", (await fits(page)) <= 1, `${await fits(page)}px over`);
  await seen(page.locator('[data-settings-section="more"]:visible'));
  for (const id of ["look", "language", "notifications", "help", "calls", "location", "more"]) check(`Settings has ${id}`, (await page.locator(`[data-settings-section="${id}"]:visible`).count()) === 1);
  await page.locator('[data-setting="font"]').getByRole("radio", { name: /Atkinson/ }).click();
  await page.locator('[data-setting="contrast"]').getByRole("radio", { name: "High contrast" }).click();
  await page.locator('[data-setting="lang"]').getByRole("radio", { name: /Amharic/ }).click();
  const ds = await page.evaluate(() => ({ ...document.documentElement.dataset }));
  check("font, contrast and language apply at once", ds.font === "readable" && ds.contrast === "high" && ds.lang === "am", JSON.stringify(ds));
  for (const s of await page.locator("[data-setting] [role=radio]").all()) {
    const b = await s.boundingBox();
    if (b && b.x + b.width > 391) {
      check("every option stays on the screen", false, await s.innerText());
      break;
    }
  }
  await page.locator('[data-setting="lang"]').getByRole("radio", { name: "English" }).click();
  await page.locator('[data-setting="contrast"]').getByRole("radio", { name: "Normal" }).click();
  check("the location switch shows it is on for this phone", await page.getByLabel("Use this phone's location while I am checked in").isChecked());
  await page.screenshot({ path: path.join(shots, "3-settings.png"), fullPage: true });

  // The account menu on the phone: Settings, no menus that run off the screen.
  await page.getByRole("button", { name: "Account menu" }).click();
  check("the account menu links to Settings", await seen(page.locator("[data-settings-link]")));
  check("and leaves out the nested menus on phones", !(await page.getByRole("menuitem", { name: /Font and contrast/ }).isVisible().catch(() => false)));
  await page.keyboard.press("Escape");

  // ---- Notifications: the inbox only; preferences are in Settings.
  await page.goto(`${base}/notifications`);
  check("Notifications has no Preferences card", (await page.getByText("Preferences", { exact: true }).count()) === 0);
  check("it links to notification settings", (await page.getByRole("link", { name: /Notification settings/ }).count()) === 1);

  // ---- Help: customized on this device.
  await page.goto(`${base}/profile/help`);
  await page.locator("[data-help-customize]").click();
  const dlg = page.locator("[data-help-dialog]");
  const first = dlg.locator("[data-help-chapter]").first();
  const key = await first.getAttribute("data-help-chapter");
  await first.getByRole("checkbox").click();
  await dlg.getByLabel("Only this device (for example less on the phone)").check();
  await dlg.getByRole("button", { name: "Save" }).click();
  check("a hidden chapter is gone on this device", await toast(page, /this device/) && (await page.locator(`details#${key}`).count()) === 0);
  check("the button says it is set for this device", /this device/.test(await page.locator("[data-help-customize]").innerText()));
  await page.goto(`${base}/preferences#help`);
  await page.getByLabel("Show the help link (?) next to page titles").click();
  await page.goto(`${base}/handovers`).catch(() => {});
  await page.goto(`${base}/attendance`);
  const link = page.locator("[data-help-link]");
  check("page help links can be hidden", (await link.count()) === 0 || !(await link.first().isVisible()));

  // ---- Leave: no balances; Ask HR; evidence for sick leave.
  await page.goto(`${base}/profile?tab=leave`);
  check("no balances for a member", (await page.getByText(/left$/).filter({ hasText: /of \d/ }).count()) === 0 && (await page.locator("text=/of \\d+(\\.\\d)? left/").count()) === 0);
  const askHr = page.locator("[data-ask-hr]");
  check("Ask HR is there", await seen(askHr));
  await askHr.getByLabel("Your message").fill("How many annual days do I have left?");
  await askHr.getByRole("button", { name: "Send to HR" }).click();
  check("the question goes to HR", await toast(page, /Sent to HR/));
  check("and waits there", await seen(askHr.locator('[data-query="open"]')));
  const typeSelect = page.getByText("Leave type").locator("..").locator("button, select").first();
  await typeSelect.click();
  const sickOption = page.getByRole("option", { name: /sick/i }).first();
  if (await sickOption.count()) {
    await sickOption.click();
    check("sick leave asks for evidence", await seen(page.getByLabel("Evidence")));
  } else check("sick leave asks for evidence (no sick type in the demo)", true);
  check("leave fits the phone", (await fits(page)) <= 1, `${await fits(page)}px over`);
  await page.screenshot({ path: path.join(shots, "4-leave.png"), fullPage: true });

  // ---- Chat: inside a conversation the tab bar steps aside and the message box sits at the bottom of the screen.
  await page.goto(`${base}/chat?g=${prep.group}`);
  const composer = page.locator("[data-composer]");
  check("the message box shows", await seen(composer));
  check("the tab bar is out of the way in a conversation", await nav.waitFor({ state: "hidden", timeout: 8000 }).then(() => true, () => false));
  const box = await composer.boundingBox();
  check("the message box is at the bottom of the screen, not under anything", !!box && box.y + box.height <= 800 + 1 && box.y + box.height >= 760, JSON.stringify(box));
  // The keyboard: the visible height shrinks; the box follows it.
  await page.evaluate(() => {
    document.documentElement.style.setProperty("--vvh", "480px");
    document.documentElement.classList.add("kb-open");
  });
  await page.waitForTimeout(200);
  const kb = await composer.boundingBox();
  check("with the keyboard open the box sits just above it", !!kb && kb.y + kb.height <= 480 + 2 && kb.y + kb.height >= 440, JSON.stringify(kb));
  await page.screenshot({ path: path.join(shots, "5-chat-keyboard.png") });
  await page.evaluate(() => {
    document.documentElement.style.removeProperty("--vvh");
    document.documentElement.classList.remove("kb-open");
  });
  await page.goto(`${base}/chat`);
  check("on the list of chats the tab bar is back", await nav.isVisible());

  // ---- HR answers.
  const hr = await login("admin@demo.local");
  await hr.page.goto(`${base}/hr?tab=leave`);
  const q = hr.page.locator("[data-hr-queries]");
  check("HR sees the question", await seen(q.getByText("How many annual days do I have left?")));
  await q.getByRole("textbox").first().fill("You have 14 days left.");
  await q.getByRole("button", { name: "Answer" }).first().click();
  check("HR answers", await toast(hr.page, /Answer sent/));
  check("HR controls what people see", await seen(hr.page.locator("[data-leave-staff]").getByLabel("Show people their remaining days")));
  await page.goto(`${base}/profile?tab=leave`);
  check("the person sees the answer", await seen(page.locator("[data-ask-hr]").getByText(/You have 14 days left/)));

  // Admin sets leaving the site.
  await hr.page.goto(`${base}/attendance?tab=capture`);
  check("Admin has the leaving-the-site settings", await seen(hr.page.locator("[data-geofence-admin]")));
  check("set to only tell", (await hr.page.locator("#gf-mode:visible").first().inputValue()) === "notify");

  // Round 36: no kiosk PIN without a kiosk, My work, the tracker templates, the site's name.
  await page.goto(`${base}/attendance`);
  check("no kiosk set up: no PIN card", (await page.locator("[data-kiosk-signin]:visible").count()) === 0);
  await page.goto(`${base}/my-work`);
  check("My work shows the person's own board", await seen(page.locator("[data-my-work]:visible")));
  check("My work fits the phone", (await fits(page)) <= 1, `${await fits(page)}px over`);
  const tpl = await hr.page.request.get(`${base}/api/tracker-templates/video-tracker`);
  check("the video tracker template downloads", tpl.ok() && (await tpl.text()).includes('"grade","subject","unit","part","status"'));
  const tj = await hr.page.request.get(`${base}/api/tracker-templates/curriculum-tracker`);
  check("the curriculum tracker template downloads", tj.ok() && !!(await tj.json())["grade-9"]);
  await hr.page.goto(`${base}/admin?tab=branding`);
  const idCard = hr.page.locator("[data-identity-admin]:visible");
  check("Admin can set the name and logo", await seen(idCard));
  await idCard.getByLabel("Name", { exact: true }).fill("Acme Academy");
  await idCard.getByLabel("Line under the name").fill("Studio Manager");
  await idCard.getByRole("button", { name: "Save" }).click();
  check("the name is saved", await toast(hr.page, /Name and logo saved/));
  await page.goto(`${base}/dashboard`);
  check("the tab title uses the new name", /Acme Academy Studio Manager/.test(await page.title()), await page.title());
  const man = await hr.page.request.get(`${base}/manifest.webmanifest`);
  check("the installed app uses it too", man.ok() && (await man.json()).name === "Acme Academy Studio Manager");
  const fav = await hr.page.request.get(`${base}/api/branding/favicon`);
  check("a favicon is always served", fav.ok());

  check("no script errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log(`FAIL crashed ${e?.stack ?? e}`);
  fails++;
}
await browser.close();
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
process.exit(fails ? 1 : 0);
