// Face check-in in the browser: the models load, the kiosk offers face check-in, and with no face in view
// (Chrome's test camera) it falls back to badge or PIN; HR's enrolment dialog needs consent first.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "face-checkin");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
try {
  const kctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ["camera"] });
  const k = await kctx.newPage();
  const errors = [];
  k.on("pageerror", (e) => errors.push(e.message));
  await k.goto(`${base}/api/attendance/kiosk?setup=${prep.setup}`);
  await k.waitForURL(/\/kiosk$/);
  await k.waitForTimeout(1500);
  const btn = k.getByRole("button", { name: "Check in with my face" });
  check("kiosk offers face check-in", await btn.waitFor({ timeout: 15000 }).then(() => true, () => false));
  await btn.click();
  await k.getByText(/One face in view|Look at the camera|Come a little closer|Move into the middle/).waitFor({ timeout: 30000 }).then(
    () => check("the face models load and read the camera", true),
    async () => check("the face models load and read the camera", false, (await k.locator("main").innerText()).slice(0, 200)),
  );
  await k.screenshot({ path: path.join(shots, "1-kiosk-face.png") });
  await k.getByText(/not read in time/).waitFor({ timeout: 20000 }).then(
    () => check("no face: told to use badge or PIN", true),
    () => check("no face: told to use badge or PIN", false),
  );
  check("no page errors on the kiosk", errors.length === 0, errors.join("; "));
  await kctx.close();

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, permissions: ["camera"] });
  const a = await ctx.newPage();
  await a.goto(`${base}/login`);
  await a.fill("input[name=email]", "admin@demo.local");
  await a.fill("input[name=password]", "Demo-Workflow-2026");
  await a.getByRole("button", { name: /log in/i }).click();
  await a.waitForURL(/dashboard/);
  await a.goto(`${base}/attendance?tab=setup`);
  await a.waitForTimeout(1000);
  await a.locator("tr", { hasText: "Dawit" }).getByRole("button", { name: "Set up" }).click();
  const dlg = a.getByRole("dialog");
  check("enrolment shows the consent text", await dlg.getByText(/code made from my face/).isVisible());
  check("captures need consent first", await dlg.getByRole("button", { name: "Take captures" }).isDisabled());
  await dlg.getByRole("checkbox").check();
  await dlg.getByRole("button", { name: "Take captures" }).click();
  await a.locator("[data-sonner-toast]").filter({ hasText: /No clear single face/ }).first().waitFor({ timeout: 40000 }).then(
    () => check("with no face in view, enrolment explains what to fix", true),
    () => check("with no face in view, enrolment explains what to fix", false),
  );
  check("nothing saved without five captures", await dlg.getByRole("button", { name: "Save" }).isDisabled());
  await a.screenshot({ path: path.join(shots, "2-enrol.png") });
} catch (e) {
  check("run finished", false, e.message);
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
