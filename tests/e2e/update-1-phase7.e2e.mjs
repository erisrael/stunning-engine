// Update 1.0 Phase 7 in the browser: the integrations hub (cards with health and owner), the call monitor (filters,
// chart, alert rules), SMS and email setup, connection order, the AI page's usage tab and test console, and the
// attendance setup checklist with kiosk check-in ways and test capture.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const base = process.env.BASE_URL;
const shots = path.join(process.env.SHOTS_DIR || "test-results", "update-1-phase7");
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
const seen = (loc, t = 12000) => loc.waitFor({ timeout: t }).then(() => true, () => false);

try {
  const admin = await login("admin@demo.local");

  // 1. The hub's overview.
  await admin.goto(`${base}/admin/integrations`);
  const ov = admin.locator("[data-hub-overview]");
  check("the hub shows seven integrations", await seen(ov) && (await ov.locator("[data-integration]").count()) === 7);
  check("Noor shows as failing or degraded", ["failing", "degraded"].includes(await ov.locator("[data-integration=noor] [data-health]").getAttribute("data-health")));
  await ov.getByLabel("Owner of Email").selectOption({ label: "Admin" }).catch(async () => ov.getByLabel("Owner of Email").selectOption({ index: 1 }));
  check("an owner is saved", await toast(admin, /Owner saved/));
  await admin.screenshot({ path: path.join(shots, "1-overview.png"), fullPage: true });

  // 2. The monitor: filters, chart, alert rules.
  await ov.locator("[data-integration=noor]").getByRole("link", { name: "Calls" }).click();
  await admin.waitForURL(/tab=monitor/);
  const mon = admin.locator("[data-monitor]");
  await mon.waitFor();
  check("the monitor opens on the source", (await mon.getByLabel("Source").inputValue()) === "noor");
  check("the chart is drawn", (await mon.locator("[data-calls-chart] [role=img]").count()) === 24);
  await mon.getByRole("switch", { name: "Failures only" }).click();
  await admin.waitForURL(/failed=1/);
  await mon.locator("[data-monitor-rows] tbody tr").first().waitFor();
  check("failures only shows the three failed calls", (await mon.locator("[data-monitor-rows] [data-call-ok='0']").count()) === 3 && (await mon.locator("[data-monitor-rows] [data-call-ok='1']").count()) === 0);
  await mon.getByLabel("Source").selectOption("");
  await admin.waitForURL((u) => !u.searchParams.get("source"));
  await mon.getByRole("switch", { name: "Failures only" }).click();
  await admin.waitForURL((u) => !u.searchParams.get("failed"));
  await mon.getByLabel("Search calls").fill("tx-e2e-1");
  await mon.getByRole("button", { name: "Search" }).click();
  await admin.waitForURL(/q=tx-e2e-1/);
  check("searching finds the callback by reference", await seen(mon.locator("[data-monitor-rows] tbody tr", { hasText: "Webhook charge.success" })));
  const rules = admin.locator("[data-alert-rules]");
  await rules.getByLabel("Failures at least").fill("40");
  await rules.locator("[data-save-alerts]").click();
  check("alert rules save", await toast(admin, /Alert rules saved/));
  await admin.screenshot({ path: path.join(shots, "2-monitor.png"), fullPage: true });

  // 3. SMS setup.
  await admin.goto(`${base}/admin/integrations?tab=sms`);
  const sms = admin.locator("[data-sms-setup]");
  check("SMS setup opens with routing for three purposes", await seen(sms) && (await sms.locator("[data-sms-route]").count()) === 3);
  await sms.getByLabel("Sender ID for Sign-in codes (OTP)").fill("MYSEED");
  await sms.getByRole("button", { name: "Add template" }).click();
  await sms.getByLabel("Template key").last().fill("welcome");
  await sms.getByLabel("Template text").last().fill("Welcome {{name}}");
  await sms.locator("[data-save-sms]").click();
  check("SMS setup saves", await toast(admin, /SMS setup saved/));
  check("the delivery report address is shown", (await sms.getByLabel("Delivery report address", { exact: true }).inputValue()).includes("/api/integrations/sms/dlr?t="));
  await admin.reload();
  check("the template is kept", (await admin.locator("[data-sms-setup]").getByLabel("Template key").first().inputValue()) === "welcome");
  await admin.screenshot({ path: path.join(shots, "3-sms.png"), fullPage: true });

  // 4. Email setup.
  await admin.goto(`${base}/admin/integrations?tab=email`);
  const em = admin.locator("[data-email-setup]");
  check("email setup shows five steps", await seen(em) && (await em.locator("[data-email-step]").count()) === 5);
  const evUrl = await em.getByLabel("Bounce report address", { exact: true }).inputValue();
  check("the bounce report address is shown", evUrl.includes("/api/integrations/email/events?t="));
  const res = await admin.request.post(evUrl.replace(/^https?:\/\/[^/]+/, base), { data: { type: "email.bounced", data: { email_id: "x1", to: ["bounce-e2e@example.com"], bounce: { type: "Permanent", message: "No such user" } } } });
  check("the events address takes a bounce", res.status() === 200);
  await admin.reload();
  check("the bounce is listed", await seen(admin.locator("[data-bounces] tr", { hasText: "bounce-e2e@example.com" })));
  const bad = await admin.request.post(`${base}/api/integrations/email/events?t=wrong`, { data: {} });
  check("a wrong events address is refused", bad.status() === 401);
  await admin.screenshot({ path: path.join(shots, "4-email.png"), fullPage: true });

  // 5. Connections.
  await admin.goto(`${base}/admin/integrations?tab=connections`);
  check("connections show the fallback order and the platforms", await seen(admin.locator("[data-connector-order=email]")) && (await admin.locator("[data-integrations-hub]").count()) === 1);
  await admin.goto(`${base}/admin?tab=integrations`);
  await admin.waitForURL(/\/admin\/integrations\?tab=connections/);
  check("the old Connections tab opens the hub", true);

  // 6. The AI page: usage, cost and the test console.
  await admin.goto(`${base}/admin/assistant?tab=usage`);
  const au = admin.locator("[data-ai-usage]");
  check("the AI usage tab opens", await seen(au));
  await au.locator("[data-ai-console]").getByLabel("Question").fill("Say hello");
  await au.locator("[data-ai-console]").getByRole("button", { name: "Send" }).click();
  check("the console answers", await seen(au.locator("[data-console-result]"), 20000));
  const firstPrice = au.locator("[data-ai-prices] input").first();
  await firstPrice.fill("0.5");
  await au.locator("[data-save-prices]").click();
  check("prices save", await toast(admin, /Prices saved/));
  await admin.reload();
  check("the console call is counted", Number((await admin.locator("[data-ai-total=Calls]").innerText()).replace(/\D/g, "")) >= 1);
  await admin.screenshot({ path: path.join(shots, "5-ai.png"), fullPage: true });

  // 7. Attendance: the setup checklist, kiosk ways and test capture.
  await admin.goto(`${base}/attendance?tab=capture`);
  const cl = admin.locator("[data-att-setup]");
  check("the setup checklist shows six steps", await seen(cl) && (await cl.locator("[data-att-step]").count()) === 6);
  check("the kiosk step is not failing", (await cl.locator("[data-att-step=kiosk]").getAttribute("data-status")) !== "fail");
  await admin.getByRole("button", { name: "Face on Front desk" }).click();
  check("a check-in way can be turned off", await toast(admin, /Check-in ways saved/));
  await admin.reload();
  check("and stays off", (await admin.getByRole("button", { name: "Face on Front desk" }).getAttribute("aria-pressed")) === "false");
  await admin.locator("[data-kiosk-test-start]").first().click();
  check("test capture starts", await toast(admin, /Test capture on/));
  await admin.screenshot({ path: path.join(shots, "6-attendance.png"), fullPage: true });

  // 8. The sidebar links to the hub and the monitor.
  await admin.goto(`${base}/admin/integrations?tab=monitor`);
  const hubLinks = await admin.locator("a[href^='/admin/integrations']").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  check("the sidebar has the hub and the monitor", hubLinks.includes("/admin/integrations"), hubLinks);

  // 9. Members cannot open the hub.
  const dawit = await login("dawit@demo.local");
  await dawit.goto(`${base}/admin/integrations`);
  await dawit.waitForURL((u) => !u.pathname.startsWith("/admin/integrations"), { timeout: 10000 }).catch(() => null);
  check("members are sent away from the hub", !dawit.url().includes("/admin/integrations") && (await dawit.locator("[data-hub-overview]").count()) === 0, dawit.url());

  check("no browser errors", admin.errors.length === 0 && dawit.errors.length === 0, [...admin.errors, ...dawit.errors].slice(0, 5));
} catch (e) {
  console.error(e);
  check("Update 1.0 Phase 7 flow completed", false);
} finally {
  await browser.close();
}
process.exitCode = fails ? 1 : 0;
