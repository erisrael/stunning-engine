// Phase 11 in the browser: a department as the person's own sidebar (by position), each view at its own address
// with old ?tab= links redirected, no tab bar, Admin's folded departments, Profile tabs replacing My record, Leave
// and Claims and pay (old addresses redirected), and Approvals.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "navigation");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const visible = (loc, ms = 10000) => loc.first().waitFor({ timeout: ms }).then(() => true, () => false);
async function as(email) {
  const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 20000 });
  return page;
}
const side = (page) => page.locator("[data-sidebar=sidebar]");
const sideLink = (page, name) => side(page).getByRole("link", { name, exact: true });
const groups = async (page) => (await side(page).locator("[data-sidebar=group-label]").allInnerTexts()).map((t) => t.trim().toLowerCase());

try {
  // A Dev team member
  const d = await as("dina@demo.local");
  const g = await groups(d);
  check("a member's sidebar has the department sections", ["dev team", "work", "plan", "insights", "tools"].every((x) => g.includes(x)), g.join(","));
  check("and no Departments heading", !g.includes("departments"), g.join(","));
  check("members get Board, List, Calendar, My report and Requests", (await Promise.all(["Board", "List", "Calendar", "My report", "Requests", "My board", "Repositories"].map((n) => sideLink(d, n).isVisible()))).every(Boolean));
  check("but not the lead's Sheet, Overview, Timeline or Team", (await Promise.all(["Sheet", "Overview", "Timeline", "Team"].map((n) => sideLink(d, n).count()))).every((c) => c === 0));
  check("My record, Leave and Claims and pay are no longer in the sidebar", (await Promise.all(["My record", "Leave", "Claims and pay"].map((n) => sideLink(d, n).count()))).every((c) => c === 0));
  check("Profile is at the bottom of the sidebar", await sideLink(d, "Profile").isVisible());
  await d.screenshot({ path: path.join(shots, "1-member-sidebar.png") });
  await sideLink(d, "Board").click();
  await d.waitForURL(/\/dev\/board$/);
  check("Board has its own address", true);
  check("the Board entry is the active one", (await sideLink(d, "Board").getAttribute("data-active")) === "true" && (await sideLink(d, "My board").getAttribute("data-active")) !== "true");
  check("duplicate page navigation is removed", (await d.getByRole("group", { name: "View" }).count()) === 0 && (await d.getByRole("tab", { name: /Timeline|Overview|Projects/ }).count()) === 0);
  await sideLink(d, "List").click();
  await d.waitForURL(/\/dev\/list/);
  check("the sidebar opens /dev/list", true);
  await sideLink(d, "My board").click();
  await d.waitForURL(/\/dev\/board\?assignee=/);
  check("My board is the board filtered to me, and is the active entry", (await sideLink(d, "My board").getAttribute("data-active")) === "true");
  await d.goto(`${base}/dev?tab=timeline&project=x`);
  await d.waitForURL(/\/dev\/timeline\?project=x/);
  check("old ?tab= links go to the view's address, keeping filters", true);
  await d.goto(`${base}/dev/team`);
  await d.waitForURL(/\/dev\/board$/);
  check("a view a member may not open goes to the board", true);
  await d.screenshot({ path: path.join(shots, "2-board.png") });

  // The Dev lead
  const l = await as("leul@demo.local");
  check("a lead also gets Sheet, Overview, Timeline and Team", (await Promise.all(["Sheet", "Overview", "Timeline", "Team"].map((n) => sideLink(l, n).isVisible()))).every(Boolean));
  check("a lead's report is called Report", await sideLink(l, "Report").isVisible());

  // Admin keeps folded departments
  const a = await as("admin@demo.local");
  check("Admin keeps the Departments heading", (await groups(a)).includes("departments"));
  await a.goto(`${base}/dev/board`);
  check("the department's views fold out under it", await visible(side(a).getByRole("link", { name: "Timeline", exact: true })));
  check("including Configure for Admin", await visible(side(a).getByRole("link", { name: "Configure", exact: true })));
  await a.screenshot({ path: path.join(shots, "3-admin.png") });

  check("a user granted Noor CMS access gets a direct sidebar link", await sideLink(d,"Legacy CMS (Noor)").isVisible());
  await a.goto(`${base}/admin?tab=sidebar`);
  check("Admin has no duplicate category navigation", await a.locator('main a[href="/admin?tab=people"]').count()===0);
  await a.getByRole("combobox",{name:"Role",exact:true}).click();
  await a.getByRole("option",{name:"Developer",exact:true}).click();
  await a.getByRole("checkbox",{name:"Dev team",exact:true}).uncheck();
  await a.getByRole("checkbox",{name:"Noor legacy CMS",exact:true}).uncheck();
  await a.getByRole("button",{name:"Save for Developer",exact:true}).click();
  await a.getByText("Sidebar saved for Developer",{exact:true}).waitFor();
  await d.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await sideLink(d,"Board").waitFor({state:"hidden",timeout:15000});
  await sideLink(d,"Legacy CMS (Noor)").waitFor({state:"hidden",timeout:15000});
  check("Admin-hidden sections disappear in an already-open member session", await side(d).locator('a[href^="/dev"]').count()===0 && await sideLink(d,"Legacy CMS (Noor)").count()===0);
  await a.getByRole("checkbox",{name:"Dev team",exact:true}).check();
  await a.getByRole("checkbox",{name:"Noor legacy CMS",exact:true}).check();
  await a.getByRole("button",{name:"Save for Developer",exact:true}).click();
  await d.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await sideLink(d,"Board").waitFor({timeout:15000});
  check("Restoring sidebar choices restores access links",await sideLink(d,"Legacy CMS (Noor)").isVisible());
  const y=await as("meron@demo.local");
  const row=sideLink(y,"Handovers").locator('xpath=..');
  const badge=row.locator('[data-nav-count]'), arrow=row.getByRole("button");
  const badgeBox=await badge.boundingBox(), arrowBox=await arrow.boundingBox(), linkBox=await sideLink(y,"Handovers").boundingBox();
  check("Counters, labels and dropdown buttons have separate space", !!badgeBox && !!arrowBox && linkBox.x+linkBox.width<=badgeBox.x && badgeBox.x+badgeBox.width<=arrowBox.x);
  await arrow.click();
  check("Dropdown opens independently of its counter",await side(y).getByRole("link",{name:"Rejected",exact:true}).isVisible());
  await arrow.click();
  check("Dropdown closes independently of its counter",await side(y).getByRole("link",{name:"Rejected",exact:true}).count()===0);
  await y.screenshot({path:path.join(shots,"5-counter-dropdown.png")});

  await y.locator('[data-sidebar="trigger"]').click();
  await y.waitForTimeout(250);
  check("Collapsed sidebar hides counters and dropdown controls",await side(y).locator('[data-nav-controls]:visible').count()===0);
  await y.locator('[data-sidebar="trigger"]').click();
  await y.setViewportSize({width:390,height:844});
  await y.locator('[data-sidebar="trigger"]').click();
  const mobileGroup=side(y).getByRole("button",{name:"Workflow",exact:true});
  await mobileGroup.click();
  check("Mobile group opens",await mobileGroup.getAttribute("aria-expanded")==="true");
  await mobileGroup.click();
  check("Mobile group closes",await mobileGroup.getAttribute("aria-expanded")==="false");

  // Profile tabs and old addresses
  await d.goto(`${base}/me`);
  await d.waitForURL(/\/profile\?tab=record/);
  check("/me opens Profile, My record", await visible(d.getByRole("link", { name: "My record", exact: true }).and(d.locator("[aria-current=page]"))));
  await d.goto(`${base}/leave?month=2026-03`);
  await d.waitForURL(/\/profile\?tab=leave&month=2026-03/);
  check("/leave opens Profile, Leave, with the month", true);
  await d.goto(`${base}/pay?tab=payslips`);
  await d.waitForURL(/\/profile\?tab=pay&pay=payslips/);
  check("/pay opens Profile, Pay and claims, on Payslips", true);
  await d.getByRole("tab", { name: "Purchase requests" }).click();
  await d.waitForURL(/tab=pay.*pay=purchases|pay=purchases.*tab=pay/);
  check("Pay's own tabs stay inside Profile", true);
  await d.goto(`${base}/profile?tab=account`);
  check("Account has the password and two-step sign-in", (await visible(d.getByText("Two-step sign-in"))) && (await visible(d.getByText("Password", { exact: true }))));
  await d.screenshot({ path: path.join(shots, "4-profile.png"), fullPage: true });

  // Approvals
  const h = await as("hana@demo.local");
  check("a team lead has Approvals", await sideLink(h, "Approvals").isVisible());
  await sideLink(h, "Approvals").click();
  await h.waitForURL(/\/approvals/);
  check("the Approvals page opens", await visible(h.getByText(/Nothing waiting for you|Approvals/)));
  check("a member without anything to approve has no Approvals entry", (await sideLink(d, "Approvals").count()) === 0);
} catch (e) {
  check("run finished", false, e.message);
  let i = 0;
  for (const c of browser.contexts()) for (const p of c.pages()) await p.screenshot({ path: path.join(shots, `fail-${i++}.png`) }).catch(() => {});
}
await browser.close();
console.log(fails ? `${fails} failed` : "all passed");
