// Access in a department: members see their own work and what a head or lead shares with them (a folder and
// everything in it, a document, a file, a project's tasks), to view only or to view and download. Everything is
// checked on the server: the library, search, opening, exports, copies, Notion, files, tasks, the sprint and the
// overview. Attempts to take what may only be viewed, scraping tools and reading in bulk are reported to the heads
// and leads, who review them and remove access.
process.env.MAIL_FAKE = "1";
import { all, get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import * as L from "../../src/server/dev-library";
import { createDoc, getDoc, saveDoc, sprintPage } from "../../src/server/dev-studio";
import { getTask, listTasks, saveProject, saveTask } from "../../src/server/work";
import * as X from "../../src/server/dept-access";
import { deptOverview } from "../../src/server/dept-overview";
import { overviewCsv, overviewReportHtml } from "../../src/server/dept-overview-export";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const throws = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@access.local`, title: "Dev", roles: roles as never, password: "Access-2026!", mustChangePassword: false })).id))!;
  const lead = await mk("acclead", ["developer"]);
  const dev = await mk("accdev", ["developer"]);
  const other = await mk("accother", ["developer"]);
  await setPosition(admin, "dev", lead.id, "lead");
  await setPosition(admin, "dev", dev.id, "member");
  await setPosition(admin, "dev", other.id, "member");
  const L1 = (await loadUser(lead.id))!;

  // The lead's library: a folder with a spec and a file.
  const specs = await L.saveFolder(L1, "dev", { name: "Specs" });
  const inner = await L.saveFolder(L1, "dev", { name: "Payments", parentId: specs });
  const spec = await createDoc(L1, "dev", { kind: "srs", template: "srs", folderId: inner });
  await saveDoc(L1, "dev", spec, { title: "Payments SRS", body: "# Payments SRS\\n\\nFR-1 (Must): pay." });
  const pdf = await L.uploadFile(L1, "dev", { folderId: inner, name: "flows.pdf", mime: "application/pdf", base64: Buffer.from("%PDF-1.4 test").toString("base64") });
  const zip = await L.uploadFile(L1, "dev", { folderId: inner, name: "source.zip", mime: "application/zip", base64: Buffer.from("PK zip").toString("base64") });

  // Nothing shared: nothing seen.
  let lib = await L.library(dev, "dev", null);
  check("a member sees nothing that was not shared", !lib.tree.length && !lib.docs.length && !lib.full && !lib.canShare);
  check("not the folder", /not been shared/.test((await throws(() => L.library(dev, "dev", specs))) ?? ""));
  check("not the document", /not been shared/.test((await throws(() => getDoc(dev, "dev", spec))) ?? ""));
  check("not in search", (await L.searchLibrary(dev, "dev", "Payments")).docs.length === 0 && (await L.searchLibrary(dev, "dev", "Payments")).folders.length === 0);
  check("not the file", /not been shared/.test((await throws(() => L.readFile(dev, pdf, { userAgent: CHROME }))) ?? ""));
  check("members cannot share", /heads and leads/.test((await throws(() => X.setShare(dev, "dev", { kind: "folder", id: specs, userId: dev.id, level: "download" }))) ?? ""));
  check("heads and leads see everything", (await L.library(L1, "dev", inner)).docs.length === 1 && (await L.library(L1, "dev", null)).full);

  // Shared to view: the folder and everything in it, read only.
  await X.setShare(L1, "dev", { kind: "folder", id: specs, userId: dev.id, level: "view" });
  lib = await L.library(dev, "dev", inner);
  check("a shared folder shows with what is inside, marked view only", lib.docs.some((d) => d.id === spec && d.level === "view") && lib.files.length === 2 && lib.path.map((p) => p.name).join("/") === "Specs/Payments" && lib.folderLevel === "view");
  check("another member still sees nothing", !(await L.library(other, "dev", null)).tree.length);
  const view = await getDoc(dev, "dev", spec);
  check("the document opens, view only, not editable", view.level === "view" && !view.canDownload && !view.canEdit && view.viewer.name === "accdev");
  check("it cannot be saved", /shared with you to read/.test((await throws(() => saveDoc(dev, "dev", spec, { title: "x", body: "y" }))) ?? ""));
  check("nor exported", /only view/.test((await throws(() => L.exportDoc(dev, "dev", spec, "docx", { userAgent: CHROME }))) ?? ""));
  check("nor copied", /only view/.test((await throws(() => L.duplicateDoc(dev, "dev", spec))) ?? ""));
  check("a PDF can be viewed in the browser", (await L.readFile(dev, pdf, { userAgent: CHROME }))?.level === "view");
  check("but not downloaded", /only view this file/.test((await throws(() => L.readFile(dev, pdf, { download: true, userAgent: CHROME }))) ?? ""));
  check("and a file the browser cannot show is not served", /only view this file/.test((await throws(() => L.readFile(dev, zip, { userAgent: CHROME }))) ?? ""));
  check("search finds it now", (await L.searchLibrary(dev, "dev", "Payments")).docs.some((d) => d.id === spec));
  check("pinning works on what is shared", (await L.togglePin(dev, "dev", spec)) === true);

  // Alerts.
  const events = async () => all<{ kind: string; repeats: number; user_id: string; reviewed_at: string | null; id: string; target_id: string | null }>("SELECT id, kind, repeats, user_id, reviewed_at, target_id FROM dept_access_events WHERE dept = 'dev' AND user_id = ? ORDER BY created_at", dev.id);
  let ev = await events();
  check("refused exports and downloads are reported", ev.some((e) => e.kind === "download_attempt"), ev);
  const notes = await all<{ title: string }>("SELECT title FROM notifications WHERE user_id = ? AND type = 'security'", lead.id);
  check("the lead is told", notes.some((n) => /Access alert: accdev/.test(n.title)), notes);
  await X.reportFromBrowser(dev, "dev", { kind: "copy", targetKind: "doc", targetId: spec }, { userAgent: CHROME, ip: "10.0.0.5" });
  await X.reportFromBrowser(dev, "dev", { kind: "copy", targetKind: "doc", targetId: spec }, { userAgent: CHROME, ip: "10.0.0.5" });
  ev = await events();
  check("copying from the browser is reported, the same attempt counted on one alert", ev.filter((e) => e.kind === "copy").length === 1 && ev.find((e) => e.kind === "copy")!.repeats === 2, ev);
  check("unknown events are refused", /Unknown event/.test((await throws(() => X.reportFromBrowser(dev, "dev", { kind: "anything" }, {}))) ?? ""));
  check("heads and leads produce no alerts", (await X.reportFromBrowser(L1, "dev", { kind: "copy", targetKind: "doc", targetId: spec }, {})) === null);
  check("a scraping tool is refused and reported", /Open it in the app/.test((await throws(() => L.exportDoc(dev, "dev", spec, "md", { userAgent: "python-requests/2.31" }))) ?? "") && (await events()).some((e) => e.kind === "scraper_client"));
  check("so is a file requested without a browser", /Open it in the app/.test((await throws(() => L.readFile(dev, pdf, { userAgent: "curl/8.4.0" }))) ?? ""));
  for (let i = 0; i < 27; i++) await getDoc(dev, "dev", spec);
  check("opening many documents in a short time is reported", (await events()).some((e) => e.kind === "bulk_reading"));

  // Download access.
  await X.setShare(L1, "dev", { kind: "doc", id: spec, userId: dev.id, level: "download" });
  const dl = await getDoc(dev, "dev", spec);
  check("a document shared to download can be exported and copied", dl.level === "download" && dl.canDownload && (await L.exportDoc(dev, "dev", spec, "md", { userAgent: CHROME })).name.endsWith(".md") && typeof (await L.duplicateDoc(dev, "dev", spec)) === "string");
  check("the folder's other content stays view only", (await L.library(dev, "dev", inner)).files.every((f) => f.level === "view"));
  check("what a member makes is theirs in full", (await L.library(dev, "dev", inner)).docs.some((d) => d.title.endsWith("(copy)") && d.level === "download"));

  // Shared with everyone.
  const handbook = await L.saveFolder(L1, "dev", { name: "Handbook" });
  await X.setShare(L1, "dev", { kind: "folder", id: handbook, userId: "*", level: "view" });
  check("a folder shared with everyone shows for every member", (await L.library(other, "dev", null)).tree.some((f) => f.id === handbook));

  // The Access page: alerts reviewed, access removed.
  const overview = await X.accessOverview(L1, "dev");
  check("the Access page lists the shares and the open alerts", overview.shares.length >= 3 && overview.events.some((e) => e.kind === "copy" && !e.reviewedAt) && overview.people.some((p) => p.id === lead.id && p.full));
  const copyEvent = overview.events.find((e) => e.kind === "copy")!;
  const removed = await X.reviewEvent(L1, "dev", copyEvent.id, "revoke_item");
  check("removing access to the item takes the share away", removed === 1 && /only view/.test((await throws(() => L.exportDoc(dev, "dev", spec, "md", { userAgent: CHROME }))) ?? ""));
  check("the alert is closed with its outcome", (await get<{ outcome: string }>("SELECT outcome FROM dept_access_events WHERE id = ?", copyEvent.id))?.outcome === "access to the item removed");
  check("the document falls back to the folder's view-only share", (await getDoc(dev, "dev", spec)).level === "view");
  const any = overview.events.find((e) => e.kind === "download_attempt")!;
  await X.reviewEvent(L1, "dev", any.id, "revoke_all");
  check("removing all access leaves the member with only their own work", !(await get("SELECT 1 AS x FROM dept_access_grants WHERE user_id = ?", dev.id)) && /not been shared/.test((await throws(() => getDoc(dev, "dev", spec))) ?? "") && (await L.library(dev, "dev", inner)).docs.every((d) => d.title.endsWith("(copy)")));
  check("members cannot open the Access page", /heads and leads/.test((await throws(() => X.accessOverview(dev, "dev"))) ?? ""));

  // Tasks: a project shared with a member, to view only.
  const projectId = String(await saveProject(L1, "dev", { name: "Shared app", key: "SHAP", status: "active" }));
  const t1 = await saveTask(L1, "dev", { title: "Build the shared thing", projectId, assigneeId: lead.id } as never);
  const t1id = typeof t1 === "string" ? t1 : (t1 as { id: string }).id;
  check("a member does not see others' tasks", !(await listTasks(dev, "dev", {})).tasks.some((t) => t.id === t1id) && /Not your task/.test((await throws(() => getTask(dev, "dev", t1id))) ?? ""));
  await X.setShare(L1, "dev", { kind: "project", id: projectId, userId: dev.id, level: "view" });
  check("a shared project's tasks show", (await listTasks(dev, "dev", {})).tasks.some((t) => t.id === t1id) && (await getTask(dev, "dev", t1id)).id === t1id);
  check("but view only keeps them out of exports", !(await overviewCsv(dev, "dev", {})).includes("Build the shared thing"));
  await X.setShare(L1, "dev", { kind: "project", id: projectId, userId: dev.id, level: "download" });
  check("shared to download, they export", (await overviewCsv(dev, "dev", {})).includes("Build the shared thing"));
  const ov = await deptOverview(dev, "dev", { period: 0 });
  check("the overview counts only what the member may see", !ov.seeAll && ov.tiles.todo + ov.tiles.active + ov.tiles.backlog + ov.tiles.doneTotal + ov.tiles.review <= (await listTasks(dev, "dev", {})).tasks.length);
  const report = await overviewReportHtml(L1, "dev", { period: 30 });
  check("the print-ready report has the cover, the sections and A4", /class="spec-cover"/.test(report) && /size:A4 landscape/.test(report) && /3\. Projects/.test(report) && /DEV-REPORT-/.test(report));
  const mine = new Set((await listTasks(dev, "dev", {})).tasks.map((t) => t.id));
  const sp = await sprintPage(dev, "dev").catch(() => null);
  check("the sprint page shows a member only what they may see", !sp || (sp.tasks.every((t) => mine.has(t.id)) && sp.backlog.every((t) => mine.has(t.id))));

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL crashed");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
