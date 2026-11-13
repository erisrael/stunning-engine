// Update 1.0 Phase 6 in the browser: an import is undone from Job history (asked, approved, rows put back), Admin's
// import and export rules, a team member takes a range of waiting parts that the lead approves, and My work's
// table groups, hides columns and saves a view.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-phase6");
fs.mkdirSync(shots, { recursive: true });
let fails = 0;
const check = (name, ok, extra) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
  if (!ok) fails++;
};
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const login = async (email, viewport = { width: 1440, height: 900 }) => {
  const page = await (await browser.newContext({ viewport })).newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(e.message));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !u.pathname.includes("/login"));
  return page;
};
const toast = (page, re) => page.locator("[data-sonner-toast]").filter({ hasText: re }).first().waitFor({ timeout: 15000 }).then(() => true, () => false);

try {
  const admin = await login("admin@demo.local");

  // 1. Import two pieces of equipment through the wizard.
  await admin.goto(`${base}/import-export?template=equipment`);
  await admin.getByRole("button", { name: "Continue" }).click();
  const csv = "Asset tag,Name,Department,Category,Status,Notes\nE2E-U1,Undo camera,general,Camera,available,one\nE2E-U2,Undo mic,general,Audio,available,two\n";
  await admin.locator("input[type=file]").first().setInputFiles({ name: "undo-me.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await admin.getByRole("button", { name: /Validate and preview/ }).click();
  await admin.getByRole("button", { name: /Confirm import of 2 rows/ }).click();
  check("the import runs", await admin.getByText(/Created/).first().waitFor({ timeout: 20000 }).then(() => true, () => false));

  // 2. Ask to undo it from Job history, then approve.
  await admin.goto(`${base}/import-export`);
  const undoBtn = admin.locator("[data-undo-job]").first();
  check("Job history offers Undo within the window", await undoBtn.waitFor({ timeout: 12000 }).then(() => true, () => false));
  await undoBtn.click();
  await admin.getByLabel("Why undo").fill("Wrong file");
  await admin.getByRole("button", { name: "Ask to undo" }).click();
  check("the undo is requested", await toast(admin, /Undo requested/));
  const reqs = admin.locator("[data-undo-requests]");
  await reqs.waitFor({ timeout: 12000 });
  check("the job shows the undo waiting", (await admin.locator("[data-undo-pending]").count()) > 0);
  await admin.screenshot({ path: path.join(shots, "1-undo-request.png") });
  await reqs.getByRole("button", { name: /Approve and undo/ }).first().click();
  check("approving undoes it", await toast(admin, /Undone: \d+ changes put back/));
  await admin.locator("[data-undone]").first().waitFor({ timeout: 12000 });
  check("the job shows as undone", (await admin.locator("[data-undone]").count()) > 0);
  check("the result lists what was put back", await reqs.getByText(/changes put back/).first().isVisible());
  await admin.screenshot({ path: path.join(shots, "2-undone.png") });

  // 3. Admin's rules: the undo window and the export switches.
  const rules = admin.locator("[data-io-rules]");
  await rules.getByLabel("Undo window in hours").fill("48");
  await rules.locator("[data-save-undo]").click();
  check("the undo window saves", await toast(admin, /undone for 48 hours/));
  check("people exports are offered", (await admin.locator("[data-people-export] a").count()) === 3);
  await rules.getByRole("switch", { name: "Teams export" }).click();
  check("a switch saves", await toast(admin, /Teams export off/));
  await admin.reload();
  await admin.locator("[data-people-export]").waitFor();
  check("a turned-off export is no longer offered", (await admin.locator("[data-people-export] a").count()) === 2);
  const res = await admin.request.get(`${base}/api/export/people?entity=teams`);
  check("and the server refuses it", res.status() === 403);
  await admin.locator("[data-io-rules]").getByRole("switch", { name: "Teams export" }).click();
  await toast(admin, /Teams export on/);
  await admin.screenshot({ path: path.join(shots, "3-rules.png") });

  // 4. Admin lets team members take work, with the lead approving.
  await admin.goto(`${base}/my-work?tab=admin`);
  const tr = admin.locator("[data-take-rules]");
  await tr.waitFor({ timeout: 12000 });
  await tr.getByRole("button", { expanded: false }).click();
  await tr.getByRole("switch", { name: "Team members may take work" }).click();
  await tr.locator("[data-save-take-rules]").click();
  check("the take rules save", await toast(admin, /Rules for taking work saved/));

  // 5. Dawit (a member) selects a range with shift-click and asks for them.
  const dawit = await login("dawit@demo.local");
  await dawit.goto(`${base}/my-work?tab=production`);
  const take = dawit.locator("[data-take-work]");
  check("a member sees waiting parts once Admin allows it", await take.waitFor({ timeout: 12000 }).then(() => true, () => false));
  const boxes = take.locator("tbody [role=checkbox]");
  const n = await boxes.count();
  await boxes.nth(0).click();
  await boxes.nth(2).click({ modifiers: ["Shift"] });
  check("shift-click selects the range", await take.getByRole("button", { name: /Take 3 selected/ }).isVisible(), n);
  await take.getByRole("button", { name: /Take 3 selected/ }).click();
  check("the takes wait for the lead", await toast(dawit, /3 waiting for the lead/));
  await dawit.screenshot({ path: path.join(shots, "4-member-take.png") });

  // 6. Hana (the lead) approves them.
  const hana = await login("hana@demo.local");
  await hana.goto(`${base}/my-work?tab=production`);
  const tq = hana.locator("[data-take-requests]");
  check("the lead sees the takes to approve", await tq.waitFor({ timeout: 12000 }).then(() => true, () => false));
  await tq.getByLabel("Select all requests").click();
  await tq.getByRole("button", { name: /Approve 3/ }).click();
  check("approving gives them to the member", await toast(hana, /3 approved/));
  await hana.screenshot({ path: path.join(shots, "5-approved.png") });

  // 7. Dawit's table: group, hide a column, save a view.
  await dawit.goto(`${base}/my-work?tab=production&view=table`);
  const wt = dawit.locator("[data-work-table='my-work:parts'][data-ready]");
  await wt.waitFor({ timeout: 12000 });
  check("the approved parts are on the member's table", (await wt.locator("tbody tr").count()) >= 3);
  await wt.locator("[data-group-by]").selectOption("stage");
  check("rows group by stage", (await wt.locator("tbody[data-group]").count()) >= 1);
  await wt.locator("[data-columns]").click();
  await dawit.getByLabel("Show Priority").click();
  await dawit.keyboard.press("Escape");
  check("a column can be hidden", (await wt.locator("thead th", { hasText: "Priority" }).count()) === 0);
  dawit.once("dialog", (d) => d.accept("By stage"));
  await wt.locator("[data-save-view]").click();
  check("the view is saved", await toast(dawit, /Saved “By stage”/));
  await dawit.reload();
  await wt.waitFor();
  check("the arrangement is remembered after a reload", (await wt.locator("tbody[data-group]").count()) >= 1 && (await wt.locator("thead th", { hasText: "Priority" }).count()) === 0);
  check("the saved view is offered", (await wt.locator("[data-saved-views] option", { hasText: "By stage" }).count()) === 1);
  await dawit.screenshot({ path: path.join(shots, "6-table.png") });

  check("no browser errors", admin.errors.length === 0 && dawit.errors.length === 0 && hana.errors.length === 0, [...admin.errors, ...dawit.errors, ...hana.errors].slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 6 flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
