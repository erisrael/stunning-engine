// Phases 31 to 34 in the browser: handovers on Approvals, the rejection cross-check, the report; correcting names and
// moving a subject; auto-assign; the routine editor and form import; and the Recording team's Legacy catalog.
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"));
const shots = path.join(process.env.SHOTS_DIR ?? path.join(here, "..", "..", "test-results"), "production");
fs.mkdirSync(shots, { recursive: true });
const base = process.env.BASE_URL ?? "http://localhost:3123";
const prep = JSON.parse(fs.readFileSync(process.env.PREP_FILE, "utf8"));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
let fails = 0;
const check = (label, ok, extra) => (console.log(`${ok ? "PASS" : "FAIL"} ${label}${!ok && extra !== undefined ? " " + String(extra).slice(0, 300) : ""}`), ok || fails++);
const seen = (l, ms = 15000) => l.first().waitFor({ timeout: ms }).then(() => true, () => false);
const errors = [];

async function login(email, viewport = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${email} ${page.url()}: ${e.message}`));
  await page.goto(`${base}/login`);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "Demo-Workflow-2026");
  await page.getByRole("button", { name: /log in/i }).click();
  await page.waitForURL((u) => !/\/login/.test(u.pathname), { timeout: 30000 });
  return page;
}
const toast = (page, re) => seen(page.locator("[data-sonner-toast]").filter({ hasText: re }));
const gone = (page, re) => page.waitForURL((u) => !re.test(u.pathname), { timeout: 10000 }).then(() => true, () => false);
const notBroken = async (page, label) => check(`${label} opens`, !(await page.getByText("This page could not load").count()) && !(await page.getByText("Application error").count()));

try {
  // ---- Handovers: Editing's lead checks them on Approvals.
  const meron = await login("meron@demo.local");
  await meron.goto(`${base}/approvals`);
  const card = meron.locator('[data-testid="approvals-handovers"]');
  check("Approvals lists the handover to check", await seen(card));
  const rows = card.locator("[data-approval-row]");
  check("each batch is its own row, with the sender and date", (await rows.count()) === 2 && /Sent/.test(await rows.first().innerText()), await card.innerText().catch(() => ""));
  await meron.screenshot({ path: path.join(shots, "1-approvals.png") });

  // Accept one batch right on Approvals.
  await card.locator(`[data-approval-row*="${prep.acceptCode}"]`).getByRole("button", { name: "Accept all" }).click();
  check("a whole batch is accepted from Approvals", await toast(meron, /accepted/));

  // Reject the other one from its page.
  await meron.goto(`${base}/handovers/${prep.rejectId}`);
  await notBroken(meron, "the handover");
  await meron.getByRole("checkbox", { name: /select all/i }).first().click().catch(() => {});
  if (!(await meron.getByRole("button", { name: "Reject" }).count())) await meron.locator("tbody [role=checkbox]").first().click();
  await meron.getByRole("button", { name: "Reject" }).first().click();
  const dlg = meron.getByRole("dialog");
  await dlg.getByLabel("Reason").selectOption("audio_quality");
  await dlg.locator("textarea").fill("No sound on the second camera");
  await dlg.getByRole("button", { name: "Reject" }).click();
  check("rejecting works", await toast(meron, /rejected/));

  await meron.goto(`${base}/handovers/rejected`);
  check("the rejected page lists it", await seen(meron.locator(`[data-rejected-row="${prep.rejectCode}"]`)));
  check("the person who rejected it is told someone else checks", await seen(meron.getByText("Someone else checks this")));
  await meron.screenshot({ path: path.join(shots, "2-rejected.png") });

  // ---- The Recording lead checks it; it is back in To do with high priority.
  const hana = await login("hana@demo.local");
  await hana.goto(`${base}/approvals`);
  check("Approvals shows rejections to cross-check", await seen(hana.locator('[data-testid="approvals-rejected"]')));
  await hana.goto(`${base}/handovers/rejected`);
  const row = hana.locator(`[data-rejected-row="${prep.rejectCode}"]`);
  check("the sending lead sees why", /No sound on the second camera/.test(await row.innerText()));
  await row.getByRole("checkbox").click();
  await hana.locator("[data-crosscheck-bar]").getByRole("button", { name: "Rejection is right" }).click();
  check("confirming works", await toast(hana, /back in the team's To do/));

  const dawit = await login("dawit@demo.local");
  await dawit.goto(`${base}/dashboard`);
  const onBoard = dawit.locator(`[data-item="${prep.rejectItem}"]`);
  check("it is on the recorder's To do", await seen(onBoard));
  check("marked high priority, with why", (await onBoard.locator('[data-priority="high"]').count()) === 1 && /No sound/.test(await onBoard.innerText()), await onBoard.innerText());
  await dawit.screenshot({ path: path.join(shots, "3-todo.png") });

  // Correct a name right on the card.
  await onBoard.getByRole("button", { name: /Correct the name/ }).click();
  await dawit.getByRole("dialog").getByLabel("Part name").fill("Forces and motion");
  await dawit.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  check("a team member corrects the name on the card", await toast(dawit, /Name corrected/));
  check("the card shows it", await seen(onBoard.getByText("Forces and motion")));

  // ---- The report.
  await meron.goto(`${base}/handovers/report`);
  await notBroken(meron, "the report");
  const rep = meron.locator(`[data-report-row="${prep.rejectCode}"]`);
  check("the report has the rejection, with the check", await seen(rep));
  const repText = await rep.innerText();
  check("with sent, rejected and checked dates and times", (repText.match(/\d{1,2}:\d{2}/g) ?? []).length >= 3 && /Rejected/.test(repText) && /Hana/.test(repText), repText);
  check("the accepted batch too", /Accepted/.test(await meron.locator(`[data-report-row="${prep.acceptItemCode}"]`).innerText()));
  await meron.screenshot({ path: path.join(shots, "4-report.png") });
  const [download] = await Promise.all([meron.waitForEvent("download"), meron.getByRole("button", { name: "Export" }).click()]);
  check("the report exports", /handover-report/.test(download.suggestedFilename()));

  // ---- Settings: Admin only; studio off hides Studio sessions.
  const admin = await login("admin@demo.local");
  await admin.goto(`${base}/handovers/settings`);
  await notBroken(admin, "handover settings");
  check("studio booking is optional by default", (await admin.getByLabel("Studio booking").inputValue()) === "optional");
  await admin.getByLabel("Studio booking").selectOption("off");
  await admin.getByRole("button", { name: "Save settings" }).click();
  check("settings saved", await toast(admin, /saved/));
  await dawit.goto(`${base}/sessions`);
  check("studio off: the page is gone for the team", await gone(dawit, /\/sessions/));
  await admin.goto(`${base}/handovers/settings`);
  await admin.getByLabel("Studio booking").selectOption("optional");
  await admin.getByRole("button", { name: "Save settings" }).click();
  await toast(admin, /saved/);
  await meron.goto(`${base}/handovers/settings`);
  check("a lead cannot open the settings", await gone(meron, /\/handovers\/settings/));

  // ---- Curriculum.
  await admin.goto(`${base}/curriculum`);
  await notBroken(admin, "the curriculum page");
  check("what looks wrong is listed", await seen(admin.locator(`[data-issue="part_name:${prep.badLesson}"]`)));
  await admin.screenshot({ path: path.join(shots, "5-curriculum.png") });
  const issue = admin.locator(`[data-issue="part_name:${prep.badLesson}"]`);
  await issue.getByRole("textbox").fill("Plant cells");
  await issue.getByRole("button", { name: "Use" }).click();
  check("a bad name is fixed from the list", await toast(admin, /Fixed/));
  await admin.goto(`${base}/curriculum?tab=browse&g=${prep.gradeId}&s=${prep.subjectId}`);
  check("browse shows the corrected part", await seen(admin.getByRole("button", { name: /Rename part/ }).filter({ hasText: "Plant cells" })));
  await admin.getByRole("button", { name: "Move to another grade" }).click();
  const mv = admin.getByRole("dialog");
  await mv.getByLabel("To grade").selectOption(prep.otherGradeId);
  await mv.getByRole("button", { name: "Move" }).click();
  check("a subject in the wrong grade is moved", await toast(admin, /Subject moved/));
  await admin.goto(`${base}/curriculum?tab=changes`);
  check("the changes are kept", await seen(admin.locator("[data-curriculum-changes]").getByText(/moved/)));
  await dawit.goto(`${base}/curriculum?tab=browse`);
  check("a team member can correct names but not move", await dawit.getByRole("button", { name: /Rename part|Rename unit/ }).first().waitFor({ timeout: 8000 }).then(() => true, () => false).then(async (x) => x || (await dawit.locator("[data-curriculum]").count()) > 0) && (await dawit.getByRole("button", { name: "Move to another grade" }).count()) === 0);

  // Auto-assign.
  await hana.goto(`${base}/curriculum?tab=auto`);
  const aa = hana.locator('[data-autoassign="recording"]');
  check("the lead sees their team's auto-assign", await seen(aa));
  await aa.getByLabel("How").selectOption("least_loaded");
  await aa.getByRole("button", { name: "Save" }).click();
  check("auto-assign saves", await toast(hana, /auto-assign saved/));
  await hana.waitForTimeout(800);
  await aa.getByRole("button", { name: "Assign waiting parts now" }).click();
  check("waiting parts are assigned", await toast(hana, /waiting parts assigned/));
  await aa.getByLabel("How").selectOption("off");
  await aa.getByRole("button", { name: "Save" }).click();
  await toast(hana, /auto-assign saved/);

  // ---- Routines: the page, the editor, the form template.
  await dawit.goto(`${base}/routines`);
  await notBroken(dawit, "routines");
  check("the routine has Edit", await seen(dawit.locator(`[data-routine="${prep.routine}"]`).getByRole("link", { name: "Edit" })));
  await dawit.locator(`[data-routine="${prep.routine}"]`).getByRole("link", { name: "Edit" }).click();
  await dawit.waitForURL(/\/routines\/rtn_/);
  const ed = dawit.locator("[data-routine-editor]");
  check("the editor lists the steps", (await ed.locator("[data-step]").count()) === 3);
  await ed.getByLabel("Step 2 action").selectOption("fill");
  await ed.getByLabel("Step 2 field").fill("Note");
  await ed.getByLabel("Ask for step 2 each time").click();
  await ed.getByRole("button", { name: "Move step 3 up" }).click();
  await ed.getByLabel("Name", { exact: true }).fill("Ask for lights");
  await dawit.screenshot({ path: path.join(shots, "6-routine.png"), fullPage: true });
  await ed.getByRole("button", { name: "Save changes" }).click();
  check("changes save", await toast(dawit, /Routine saved/));
  await dawit.waitForTimeout(800);
  const fill = dawit.locator("[data-fill-from-file]");
  check("the template's columns follow the asked fields", /Title, Note/.test(await fill.innerText()), await fill.innerText());
  const tplRes = await dawit.request.get(`${base}/api/routines/${prep.routine}/template`);
  check("the form template downloads", tplRes.ok() && (await tplRes.text()).includes('"Title","Note"'));
  await fill.getByLabel("Filled template").setInputFiles({ name: "form.csv", mimeType: "text/csv", buffer: Buffer.from('"Title","Note"\r\n"A","first"\r\n"B",""\r\n') });
  await fill.getByRole("button", { name: "Check the file" }).click();
  check("the file is checked first, with its problems", await seen(dawit.locator("[data-fill-preview]").getByText(/1 row is ready, 1 left out/)));
  check("wrong template refused", await (async () => {
    await fill.getByLabel("Filled template").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from('"Nope"\r\n"A"\r\n') });
    await fill.getByRole("button", { name: "Check the file" }).click();
    return toast(dawit, /not the routine's template/);
  })());
  await dawit.goto(`${base}/routines`);
  await dawit.getByRole("button", { name: "Import a routine" }).click();
  const imp = dawit.locator("[data-import-routine]");
  await imp.getByLabel(/^File/).setInputFiles({ name: "steps.csv", mimeType: "text/csv", buffer: Buffer.from('"page","action","field","value","ask","note"\r\n"/requests","fill","Title","x","yes",""\r\n') });
  await imp.getByLabel("Name").fill("Imported form");
  await imp.getByRole("button", { name: "Import" }).click();
  check("a routine is imported from the template", await toast(dawit, /Routine imported/));
  await dawit.waitForURL(/\/routines\/rtn_/);
  await dawit.getByRole("button", { name: /^Delete Imported form/ }).click();
  await dawit.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  check("deleting asks first, then goes back", await toast(dawit, /Routine deleted/));
  await dawit.waitForURL(/\/routines$/);

  // ---- The Legacy catalog, the old flow from the top.
  await dawit.goto(`${base}/dashboard`);
  check("the Recording team has the Legacy catalog in the sidebar", await seen(dawit.getByRole("link", { name: "Legacy catalog" })));
  await dawit.goto(`${base}/legacy`);
  await notBroken(dawit, "the Legacy catalog");
  check("the bar shows the totals and the files", await seen(dawit.locator("[data-legacy-stats]")) && (await dawit.locator("[data-legacy-bar]").getByRole("link", { name: "Word" }).count()) === 1);
  await dawit.screenshot({ path: path.join(shots, "7-legacy-grades.png") });
  await dawit.locator(`[data-legacy-grade="${prep.gradeName}"]`).click();
  await dawit.waitForURL(/g=/);
  await dawit.getByRole("button", { name: "Add new subject" }).click();
  await dawit.locator("[data-legacy-dialog]").getByLabel("Subject name").fill("Astronomy");
  await dawit.locator("[data-legacy-dialog]").getByRole("button", { name: "Save" }).click();
  check("a subject is added", await seen(dawit.locator('[data-legacy-subject="Astronomy"]')));
  await dawit.locator('[data-legacy-subject="Astronomy"]').getByRole("link", { name: /View units/ }).click();
  await dawit.waitForURL(/s=/);
  await dawit.getByRole("button", { name: "Add new unit" }).click();
  await dawit.locator("[data-legacy-dialog]").getByLabel("Unit title").fill("Unit 1: The Sky");
  await dawit.locator("[data-legacy-dialog]").getByRole("button", { name: "Save" }).click();
  check("a unit is added", await seen(dawit.locator('[data-legacy-unit="1"]')));
  await dawit.locator('[data-legacy-unit="1"]').getByRole("link", { name: /Manage parts/ }).click();
  await dawit.waitForURL(/u=/);
  await dawit.getByRole("button", { name: "Add new part" }).click();
  await dawit.locator("[data-legacy-dialog]").getByLabel("Part title").fill("Part 1: Stars");
  await dawit.locator("[data-legacy-dialog]").getByRole("button", { name: "Save" }).click();
  const part = dawit.locator('[data-legacy-part="1"]');
  check("a part is added", await seen(part));
  check("not started", /Not started/.test(await part.innerText()));
  await part.getByRole("button", { name: "Add video" }).click();
  const v = dawit.locator("[data-legacy-video]");
  await v.getByLabel("Camera code").fill("c0172 and CO173");
  await v.getByLabel("Video title").fill("Introduction");
  await v.getByRole("button", { name: "Save video shot" }).click();
  check("the shot shows, with its code tidied", await seen(dawit.locator('[data-legacy-shot="C0172 & C0173"]')));
  check("the part is now in Recording", await seen(part.getByText("In Recording")));
  await dawit.screenshot({ path: path.join(shots, "8-legacy-parts.png"), fullPage: true });
  await part.getByRole("button", { name: "Mark recorded" }).click();
  check("Mark recorded sends it on", await toast(dawit, /Sent on to Editing/));
  check("it says it waits for Editing", await seen(part.getByText(/waiting for Editing/)));
  const word = await dawit.request.get(`${base}/api/legacy/word`);
  check("the Word export works", word.ok() && (await word.text()).includes("Astronomy"));
  const bk = await dawit.request.get(`${base}/api/legacy/backup`);
  check("the backup works", bk.ok() && (await bk.text()).includes("C0172 & C0173"));
  await dawit.goto(`${base}/legacy`);
  check("a member does not get Import", (await dawit.locator("[data-legacy-bar]").getByRole("button", { name: "Import" }).count()) === 0);

  // The new part is real: Editing's lead sees it.
  await meron.goto(`${base}/dashboard`);
  check("the part reached Editing's lead", await seen(meron.getByText("Stars")));

  // Import with the lead: checked first, tidied.
  await hana.goto(`${base}/legacy`);
  await hana.locator("[data-legacy-bar]").getByRole("button", { name: "Import" }).click();
  const li = hana.locator("[data-legacy-import]");
  const backup = { "grade-11": { name: "Grade 11", type: "Secondary School", subjects: [{ id: "e2e-s", name: "History", units: [{ id: "e2e-u", title: "Unit 1: Rome", parts: [{ id: "e2e-p", title: "Part 1: Topic Name", videos: [{ id: "e2e-v", cameraCode: "CO173", title: "The Republic ....", description: "" }] }] }] }] } };
  await li.getByLabel("Catalog backup").setInputFiles({ name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  await li.getByRole("button", { name: "Check the file" }).click();
  check("checking the backup says what it holds and what gets tidied", await seen(hana.locator("[data-legacy-check]").getByText(/1 part, 1 video/)) && /C0173/.test(await hana.locator("[data-legacy-check]").innerText()));
  await hana.screenshot({ path: path.join(shots, "9-legacy-import.png") });
  await li.getByRole("button", { name: "Import", exact: true }).click();
  check("the backup goes in", await toast(hana, /Catalog imported/));

  // Admin can switch it off.
  await admin.goto(`${base}/legacy`);
  await admin.getByRole("button", { name: "Legacy catalog settings" }).click();
  await admin.locator("[data-legacy-settings]").getByLabel("Show the Legacy catalog to the Recording team").click();
  await admin.locator("[data-legacy-settings]").getByRole("button", { name: "Save" }).click();
  check("settings save", await toast(admin, /Settings saved/));
  await dawit.goto(`${base}/legacy`);
  check("off: the team no longer gets it", await gone(dawit, /\/legacy/));
  await admin.goto(`${base}/legacy`);
  await admin.getByRole("button", { name: "Legacy catalog settings" }).click();
  await admin.locator("[data-legacy-settings]").getByLabel("Show the Legacy catalog to the Recording team").click();
  await admin.locator("[data-legacy-settings]").getByRole("button", { name: "Save" }).click();
  await toast(admin, /Settings saved/);

  // Phones: the new pages fit, with no sideways scroll.
  const phone = await login("hana@demo.local", { width: 390, height: 800 });
  for (const p of ["/legacy", "/handovers/report", "/handovers/rejected", "/curriculum", "/routines", "/approvals"]) {
    await phone.goto(`${base}${p}`);
    await phone.waitForLoadState("load");
    await phone.waitForTimeout(300);
    const over = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(`${p} fits a phone`, over <= 1, `${over}px over`);
  }

  check("no script errors", errors.length === 0, errors.join(" | "));
} catch (e) {
  console.log(`FAIL crashed ${e?.stack ?? e}`);
  fails++;
}
await browser.close();
console.log(`\n${fails ? `${fails} failed` : "all passed"}`);
process.exit(fails ? 1 : 0);
