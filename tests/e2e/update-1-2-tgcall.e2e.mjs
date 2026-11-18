// Calls to a Telegram customer in the Mini App, with real WebRTC (fake microphones): Admin calls Hana from her
// conversation; Hana opens the support app from the bot's notice (&call=in) and the call rings full screen; she
// answers, mutes and unmutes, and hangs up. Then Admin calls and gives up before she answers: opening the notice
// late shows the missed call with "Call back".
import { chromium } from "playwright-core";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-2-tgcall");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const seen = (loc, t = 15000) => loc.first().waitFor({ timeout: t }).then(() => true, () => false);
function initData(token, user) {
  const p = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), query_id: "AAH", user: JSON.stringify(user) });
  const checkStr = [...p.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
  const key = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  p.set("hash", crypto.createHmac("sha256", key).update(checkStr).digest("hex"));
  return p.toString();
}
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"] });
const ctx = (w, h) => browser.newContext({ viewport: { width: w, height: h }, permissions: ["microphone"] });
const errors = [];

try {
  // Hana has the support app open in Telegram.
  const hana = await (await ctx(390, 800)).newPage();
  hana.on("pageerror", (e) => errors.push(`hana: ${e.message}`));
  const data = encodeURIComponent(initData(prep.token, { id: 501, first_name: "Hana", last_name: "Girma" }));
  const app = (extra = "") => `${base}/support-widget?tg=${encodeURIComponent(prep.bot)}${extra}#tgWebAppData=${data}`;
  await hana.goto(app());
  await seen(hana.locator("[data-new-question]"));

  // Admin calls her from the conversation.
  const admin = await (await ctx(1440, 900)).newPage();
  admin.on("pageerror", (e) => errors.push(`admin: ${e.message}`));
  admin.on("dialog", (d) => d.accept());
  await admin.goto(`${base}/login`);
  await admin.fill("input[name=email]", "admin@demo.local");
  await admin.fill("input[name=password]", "Demo-Workflow-2026");
  await admin.getByRole("button", { name: /log in/i }).click();
  await admin.waitForURL((u) => !u.pathname.includes("/login"));
  await admin.goto(`${base}/support?tab=desk&view=all&ticket=${prep.ticket}`);
  await admin.locator("button[data-status=online]").click();
  const dial = admin.locator("[data-dial-app]");
  check("Admin can call the Telegram customer in the app", (await seen(dial)) && (await dial.isEnabled()));
  await dial.click();
  check("the agent sees it ringing in her app", await seen(admin.locator("[data-call-panel=ringing]")));

  // She opens the app from the bot's notice.
  await hana.goto(app("&call=in"));
  const ring = hana.locator("[data-incoming-call]");
  check("opened from the notice, the call rings full screen", await seen(ring.filter({ hasText: "is calling you" })));
  const box = await ring.boundingBox();
  check("the ringing screen fills the phone", !!box && box.width >= 380 && box.height >= 780, box);
  check("with the time left", await seen(ring.locator("[data-ring-left]")));
  await hana.screenshot({ path: path.join(shots, "1-incoming.png") });
  await ring.locator("[data-answer-call]").click();
  check("she answers and the call connects", (await seen(hana.locator("[data-call-state=live]"), 25000)) && (await seen(admin.locator("[data-call-panel=live]"), 25000)));
  await hana.locator("[data-call-mute=off]").click();
  check("she can mute", await seen(hana.locator("[data-call-mute=on]"), 3000));
  await hana.locator("[data-call-mute=on]").click();
  check("and unmute", await seen(hana.locator("[data-call-mute=off]"), 3000));
  check("she can switch between speaker and earpiece", (await hana.locator("[data-audio-route]").count()) === 1);
  check("the connection quality shows", await seen(hana.locator("[data-call-quality]"), 12000));
  await hana.screenshot({ path: path.join(shots, "2-live.png") });
  await hana.locator("[data-call-end]").click();
  check("she hangs up and Admin sees it", (await seen(hana.locator("[data-call-state=ended]"))) && (await seen(admin.locator("[data-call-panel=ended]"), 10000)));
  await admin.locator("[data-call-close]").click();

  // A call she does not get to in time.
  await hana.goto(app());
  await seen(hana.locator("[data-new-question]"));
  await admin.goto(`${base}/support?tab=desk&view=all&ticket=${prep.ticket}`);
  await admin.locator("[data-dial-app]").click();
  await seen(admin.locator("[data-call-panel=ringing]"));
  check("the call rings in her open app too", await seen(hana.locator("[data-incoming-call]")));
  await admin.locator("[data-hang-up]").click();
  check("when Admin gives up, the ringing stops", await hana.locator("[data-incoming-call]").waitFor({ state: "detached", timeout: 10000 }).then(() => true, () => false));
  await hana.goto(app("&call=in"));
  check("opening the notice late shows the missed call", await seen(hana.locator("[data-call-missed]").filter({ hasText: "You missed a call from" })));
  check("with Call back", await seen(hana.locator("[data-call-back]")));
  await hana.screenshot({ path: path.join(shots, "3-missed.png") });
  check("no script errors", errors.length === 0, errors);
} catch (e) {
  console.log(`FAIL crashed ${e instanceof Error ? e.stack : e}`);
  fails++;
} finally {
  await browser.close();
}
process.exit(fails ? 1 : 0);
