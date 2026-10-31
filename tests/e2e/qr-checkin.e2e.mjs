// Phase 10b in the browser: Admin's Capture tab and the QR poster, checking in by QR on the office network
// (and refused outside it), break and lunch, a stale poster, the shared office computer, a team lead recording a
// check-in, HR reviewing it, and the Me tab's buttons. The office network is simulated with X-Forwarded-For,
// as the hosting's proxy would send it.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "qr-checkin");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const PW = "Demo-Workflow-2026";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const OFFICE = "196.188.10.23";
const OUTSIDE = "8.8.8.8";
const ctx = (ip, extra = {}) => browser.newContext({ viewport: { width: 420, height: 860 }, extraHTTPHeaders: { "x-forwarded-for": ip }, ...extra });
const visible = (loc, ms = 10000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
async function login(page, email, next) {
  await page.goto(`${base}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", PW);
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
}
const tap = async (page, name) => {
  await page.getByRole("button", { name, exact: true }).click();
  return visible(page.getByTestId("checkin-done"));
};

try {
  // Admin: Capture tab and the poster.
  const a = await (await ctx(OFFICE, { viewport: { width: 1360, height: 950 } })).newPage();
  await login(a, "admin@demo.local");
  await a.goto(`${base}/attendance?tab=capture`);
  check("Admin has the Capture tab, and sees the address they are on", (await a.getByTestId("my-ip").innerText().catch(() => "")) === OFFICE);
  check("the site shows with its poster", await visible(a.getByRole("link", { name: "Print the QR poster" })));
  await a.screenshot({ path: path.join(shots, "1-capture.png"), fullPage: true });
  await a.goto(`${base}/attendance/poster?site=${prep.siteId}`);
  const url = await a.getByTestId("poster").locator("img").getAttribute("data-url");
  check("the poster's QR opens the check-in page with the site's code", url?.endsWith(`/in?c=${prep.code}`), url);
  check("the poster gives the short address and the no-smartphone ways", await visible(a.getByText(/\/in\/shared/)));
  await a.screenshot({ path: path.join(shots, "2-poster.png"), fullPage: true });

  // Dawit scans the poster on the office Wi-Fi: signs in once, then one tap.
  const d = await (await ctx(OFFICE)).newPage();
  await d.goto(`${base}/in?c=${prep.code}`);
  await d.waitForURL(/\/login/);
  await d.fill("input[name=email]", "dawit@demo.local");
  await d.fill("input[name=password]", PW);
  await d.getByRole("button", { name: /log in/i }).click();
  await d.waitForURL(/\/in\?c=/);
  check("after signing in the QR page comes back with only Check in", (await d.getByTestId("checkin-pad").getByRole("button").allInnerTexts()).map((t) => t.trim()).join("|") === "Check in");
  await d.screenshot({ path: path.join(shots, "3-in.png") });
  check("check in", await tap(d, "Check in"));
  await d.screenshot({ path: path.join(shots, "4-done.png") });
  await d.reload();
  check("then break, lunch and check out are offered", (await d.getByTestId("checkin-pad").getByRole("button").allInnerTexts()).map((t) => t.trim()).join("|") === "Start break|Start lunch|Check out");
  check("start a break", await tap(d, "Start break"));
  await d.reload();
  check("on a break only Back from break is offered", (await d.getByTestId("checkin-pad").getByRole("button").allInnerTexts()).map((t) => t.trim()).join("|") === "Back from break");
  check("back from break", await tap(d, "Back from break"));
  await d.reload();
  check("start lunch", await tap(d, "Start lunch"));
  await d.reload();
  check("back from lunch", await tap(d, "Back from lunch"));

  // The same phone outside the office.
  const o = await (await ctx(OUTSIDE)).newPage();
  await login(o, "dawit@demo.local", `/in?c=${prep.code}`);
  await o.goto(`${base}/in?c=${prep.code}`);
  check("outside the office network it says to connect to the Wi-Fi", await visible(o.getByText(/Connect to the Head office Wi-Fi/)));
  check("and offers no buttons", (await o.getByTestId("checkin-pad").getByRole("button", { name: /Check|Start|Back/ }).count()) === 0);
  await o.screenshot({ path: path.join(shots, "5-outside.png") });

  // Admin makes a new code: the old poster stops working.
  await a.goto(`${base}/attendance?tab=capture`);
  a.once("dialog", (dlg) => dlg.accept());
  await a.getByRole("button", { name: "New code" }).click();
  await visible(a.getByText("New code made"));
  await d.goto(`${base}/in?c=${prep.code}`);
  check("an old poster is refused after a new code", await visible(d.getByText(/QR code is old/)));
  await d.goto(`${base}/in`);
  check("the typed short address still works on the office network", await visible(d.getByRole("button", { name: "Check out", exact: true })));

  // The shared office computer: number and PIN, office network only.
  const s = await (await ctx(OFFICE)).newPage();
  await s.goto(`${base}/in/shared`);
  await s.fill("#sh-code", prep.yonasCode.replace("EMP-", ""));
  await s.fill("#sh-pin", "0000");
  await s.getByRole("button", { name: "Continue" }).click();
  check("a wrong PIN is refused", await visible(s.getByText(/do not match/)));
  await s.fill("#sh-pin", prep.pin);
  await s.getByRole("button", { name: "Continue" }).click();
  await s.getByRole("button", { name: "Check in", exact: true }).click();
  check("Yonas checks in on the shared computer", await visible(s.getByTestId("shared-done")));
  await s.screenshot({ path: path.join(shots, "6-shared.png") });
  const s2 = await (await ctx(OUTSIDE)).newPage();
  await s2.goto(`${base}/in/shared`);
  check("the shared page refuses computers outside the office", await visible(s2.getByText(/only on a computer on the office network/)));

  // Hana (Dawit's lead) records a check-out for him; HR reviews it.
  const h = await (await ctx(OFFICE, { viewport: { width: 1360, height: 950 } })).newPage();
  await login(h, "hana@demo.local");
  await h.goto(`${base}/attendance?tab=team`);
  await h.getByRole("button", { name: "Record a check-in" }).click();
  await h.locator("#lead-who").selectOption({ label: "Dawit" });
  await h.getByRole("group", { name: "What to record" }).getByRole("button", { name: "Check out" }).click();
  await h.getByRole("button", { name: "Record", exact: true }).click();
  check("the lead's record is saved and goes to HR", await visible(h.getByText(/HR will review it/)));
  await a.goto(`${base}/attendance?tab=review`);
  const row = a.getByTestId("flag-row").filter({ hasText: "Recorded by Hana" });
  check("HR sees it among check-ins to review", await visible(row));
  await a.screenshot({ path: path.join(shots, "7-review.png"), fullPage: true });
  await row.getByRole("button", { name: "Accept", exact: true }).click();
  check("HR accepts it", await visible(a.getByText("Accepted")));

  // Timesheets show lunch and breaks.
  await a.goto(`${base}/attendance?tab=timesheets`);
  check("timesheets have the lunch and breaks column", await visible(a.getByText("Lunch and breaks", { exact: true })));
  await a.screenshot({ path: path.join(shots, "8-timesheets.png"), fullPage: true });

  // Dawit's Me tab has the same buttons on the office network.
  await d.goto(`${base}/attendance`);
  check("the Me tab shows the check-in buttons on the office network", await visible(d.getByTestId("checkin-pad")));
} catch (e) {
  check("run finished", false, e.message);
  let i = 0;
  for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: path.join(shots, `fail-${i++}.png`) }).catch(() => {});
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
