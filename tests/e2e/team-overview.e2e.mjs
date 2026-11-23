// Production, Overview: a Recording member opens it from the sidebar and sees only the Recording team's column,
// for every grade and subject; Admin sets which teams each role sees ("Who sees which teams"); managers and Admin
// see all four. Curriculum is only for leads and admins.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "team-overview");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const signIn = async (email) => {
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
};
const heads = (p) => p.locator("main table thead").first().innerText().catch(() => "");
try {
  const m = await signIn("dawit@demo.local");
  const errors = [];
  m.on("pageerror", (e) => errors.push(e.message));
  await m.goto(`${base}/dashboard`);
  const side = await m.locator("[data-sidebar=sidebar]").first().innerText().catch(() => "");
  check("the member's sidebar has the team overview", /Team overview/.test(side), side.slice(0, 300));
  check("and no Curriculum", !/Curriculum/.test(side));
  await m.goto(`${base}/overview`);
  await m.waitForTimeout(800);
  check("the member opens the Overview: the Recording team overview", /Recording team overview/.test(await m.locator("h1").first().innerText()), m.url());
  let h = await heads(m);
  check("only the Recording team's column", /Recording/i.test(h) && !/Editing|Uploading|Publication/i.test(h), h);
  await m.screenshot({ path: path.join(shots, "member-overview.png"), fullPage: false });
  // Export: Excel, the PDF report and CSV, with only the member's team.
  await m.click("[data-overview-export]");
  check("the member's Export offers Excel, PDF report and CSV", (await m.locator("[data-export-xlsx]").count()) === 1 && (await m.locator("[data-export-report]").count()) === 1 && (await m.locator("[data-export-csv]").count()) === 1);
  const [x] = await Promise.all([m.waitForEvent("download", { timeout: 15000 }), m.click("[data-export-xlsx]")]);
  const xf = fs.readFileSync(await x.path());
  check("the Excel workbook downloads", /\.xlsx$/.test(x.suggestedFilename()) && xf.subarray(0, 2).toString() === "PK", x.suggestedFilename());
  const csv = await (await m.request.get(`${base}/api/overview-export?format=csv`)).text();
  const first = csv.split(String.fromCharCode(10))[0];
  check("the CSV has only the Recording team", /Recording/.test(first) && !/Editing|Uploading/.test(first), first);
  const rep = await (await m.request.get(`${base}/api/overview-export?format=report`)).text();
  check("the PDF report is the Recording team overview", /Recording team overview/.test(rep) && rep.includes("/api/branding/logo"));
  const rp = await m.context().newPage();
  await rp.goto(`${base}/api/overview-export?format=report`);
  await rp.screenshot({ path: path.join(shots, "member-report.png") });
  await rp.close();
  await m.goto(`${base}/team-overview`);
  await m.waitForURL(/\/overview/, { timeout: 10000 }).catch(() => {});
  check("the old address goes to the Overview", /\/overview/.test(m.url()), m.url());
  await m.goto(`${base}/curriculum`);
  await m.waitForURL(/\/dashboard/, { timeout: 10000 }).catch(() => {});
  check("Curriculum is closed to a member", /\/dashboard/.test(m.url()), m.url());

  // Admin: Recording members also see Editing.
  const a = await signIn("admin@demo.local");
  await a.goto(`${base}/overview`);
  check("Admin sees every team", /Editing/i.test(await heads(a)) && /Publication/i.test(await heads(a)));
  await a.click("[data-overview-teams]");
  await a.click('[data-overview-cell="recording:editing"]');
  await a.screenshot({ path: path.join(shots, "admin-config.png") });
  await a.click("[data-overview-save]");
  await a.waitForTimeout(1500);
  await m.goto(`${base}/overview`);
  await m.waitForTimeout(800);
  h = await heads(m);
  check("after Admin's change the member sees Recording and Editing", /Recording/i.test(h) && /Editing/i.test(h) && !/Uploading/i.test(h), h);
  check("no script errors", errors.length === 0, errors.join(" | "));

  const l = await signIn("hana@demo.local");
  await l.goto(`${base}/curriculum`);
  check("the team lead opens Curriculum", /\/curriculum/.test(l.url()), l.url());
} finally {
  await browser.close();
}
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
if (fails) process.exitCode = 1;
