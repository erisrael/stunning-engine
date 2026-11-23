// Configure whole system (internal admins only): the system's name, the name on reports, the logo, motion and the
// icon pack, saved together and audited. Sub-projects: one level, no cycles, progress adds up, a deleted main
// project leaves its parts. Every department page's "PDF report" in the company format with the configured name
// and logo, filtered like the page and limited to what the person may see.
process.env.MAIL_FAKE = "1";
import { get, closeDb } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import { setPosition } from "../../src/server/departments";
import { saveSystemConfig, systemConfig } from "../../src/server/system-config";
import { identity } from "../../src/server/identity";
import { getSettings } from "../../src/server/settings";
import { deleteProject, listProjects, listTasks, saveProject, saveTask } from "../../src/server/work";
import { deptPageReportHtml } from "../../src/server/dept-page-report";
import { REPORT_VIEWS, hasReport } from "../../src/lib/work";
import { appearanceScript } from "../../src/lib/appearance-script";
import vm from "node:vm";

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

async function main() {
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const mk = async (key: string, roles: string[]) => (await loadUser((await upsertAccount({ name: key, email: `${key}@sys.local`, title: "Dev", roles: roles as never, password: "System-2026!", mustChangePassword: false })).id))!;
  const head = await mk("syshead", ["developer"]);
  const member = await mk("sysmember", ["developer"]);
  await setPosition(admin, "dev", head.id, "head");
  await setPosition(admin, "dev", member.id, "member");
  const H = (await loadUser(head.id))!;

  // ---- Configure whole system ----
  const base = { name: "Seed", tagline: "Operations", shortName: "Seed Ops", color: "#0f6e66", reportName: "Seed Operations", motionDefault: "cinematic" as const, cinematicAllowed: true, iconPack: "neon" };
  check("only internal admins configure the system", /internal admin/.test((await throws(() => saveSystemConfig(H, base))) ?? ""));
  check("cinematic cannot be the default while it is off", /switched off/.test((await throws(() => saveSystemConfig(admin, { ...base, cinematicAllowed: false }))) ?? ""));
  check("an unknown icon pack is refused", /icon packs/.test((await throws(() => saveSystemConfig(admin, { ...base, iconPack: "comic-sans" }))) ?? ""));
  check("a name is needed", /name/.test((await throws(() => saveSystemConfig(admin, { ...base, name: "  " }))) ?? ""));
  const logo = `data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}`;
  const saved = await saveSystemConfig(admin, { ...base, logo });
  const id = await identity();
  const ws = (await getSettings()).workspace;
  check("the system's name, line, short name and colour are saved", id.name === "Seed" && id.tagline === "Operations" && id.shortName === "Seed Ops" && id.color === "#0f6e66", id);
  check("the logo is saved", id.logo === true && saved.identity.logo === true);
  check("the name on reports is saved", ws.name === "Seed Operations" && saved.reportName === "Seed Operations");
  check("motion and icon defaults are saved", ws.motionDefault === "cinematic" && ws.cinematicAllowed === true && ws.iconPack === "neon" && (await systemConfig()).iconPack === "neon");
  const log = await get<{ old_value: string; new_value: string }>("SELECT old_value, new_value FROM audit_events WHERE action = 'settings.system' ORDER BY seq DESC LIMIT 1");
  check("the change is audited with before and after", !!log && /Seed Operations/.test(log.new_value ?? "") && /Content Manager|Myseed/.test(log.old_value ?? ""), log);
  // Keeping the logo when it is not sent, then going back to the mark.
  await saveSystemConfig(admin, { ...base, reportName: "Seed Ops reports" });
  check("the logo stays when it is not sent", (await identity()).logo === true);
  await saveSystemConfig(admin, { ...base, logo: null, motionDefault: "subtle", cinematicAllowed: false });
  check("the logo can go back to the mark; cinematic switched off", (await identity()).logo === false && (await getSettings()).workspace.cinematicAllowed === false);

  // The appearance script follows the workspace: motion and icon pack, cinematic only when allowed.
  const run = (stored: Record<string, string>, ui: Parameters<typeof appearanceScript>[1]) => {
    const html = { dataset: {} as Record<string, string>, lang: "en" };
    vm.runInNewContext(appearanceScript("", ui), { localStorage: { getItem: () => JSON.stringify(stored) }, document: { documentElement: html }, location: { pathname: "/dashboard" } });
    return html.dataset;
  };
  let d = run({}, { motion: "cinematic", cinematic: true, iconPack: "bold" });
  check("no choice: the workspace's motion and icon pack", d.motion === "cinematic" && d.iconPack === "bold");
  d = run({ motion: "off", iconPack: "pixel" }, { motion: "cinematic", cinematic: true, iconPack: "bold" });
  check("a person's own choice wins", d.motion === "off" && d.iconPack === "pixel");
  d = run({ motion: "cinematic" }, { motion: "subtle", cinematic: false });
  check("cinematic is refused when Admin switched it off", d.motion === "subtle" && d.motionAllowed === "0");

  // ---- Sub-projects ----
  const main1 = await saveProject(H, "dev", { key: "MAINA", name: "Main A", status: "active" });
  const partA = await saveProject(H, "dev", { key: "PARTA", name: "Part A", status: "active", parentId: main1 });
  const partB = await saveProject(H, "dev", { key: "PARTB", name: "Part B", status: "active", parentId: main1 });
  check("a project cannot be its own parent", /own parent/.test((await throws(() => saveProject(H, "dev", { id: main1, key: "MAINA", name: "Main A", status: "active", parentId: main1 }))) ?? ""));
  check("one level only: a part cannot have parts", /main project/.test((await throws(() => saveProject(H, "dev", { key: "GRAND", name: "Grandchild", status: "active", parentId: partA }))) ?? ""));
  const main2 = await saveProject(H, "dev", { key: "MAINB", name: "Main B", status: "active" });
  check("a project with parts stays main", /stays a main project/.test((await throws(() => saveProject(H, "dev", { id: main1, key: "MAINA", name: "Main A", status: "active", parentId: main2 }))) ?? ""));
  check("saving without parentId keeps the parent", !!(await saveProject(H, "dev", { id: partA, key: "PARTA", name: "Part A renamed", status: "active" })) && (await get<{ p: string }>("SELECT parent_id AS p FROM dept_projects WHERE id = ?", partA))?.p === main1);
  const t1 = await saveTask(H, "dev", { title: "Part A work", projectId: partA, type: "feature", priority: "normal" } as never);
  await saveTask(H, "dev", { title: "Part B work", projectId: partB, type: "feature", priority: "normal" } as never);
  const ps = await listProjects(H, "dev");
  const m = ps.find((p) => p.id === main1);
  check("a main project adds up its parts", !!m && m.children === 2 && m.rollup?.total === 2 && ps.find((p) => p.id === partA)?.parent_key === "MAINA", m && [m.children, m.rollup]);
  check("filtering by the main project includes its parts' tasks", (await listTasks(H, "dev", { project: main1 })).tasks.length === 2 && !!t1);

  // ---- Page reports ----
  check("every listed page has a report", REPORT_VIEWS.every(hasReport) && !hasReport("dojo") && !hasReport("configure"));
  for (const v of REPORT_VIEWS) {
    const html = await deptPageReportHtml(H, "dev", v, new URLSearchParams()).catch((e) => `ERROR ${e instanceof Error ? e.message : e}`);
    const ok = html.startsWith("<!doctype html>") && html.includes("Seed Operations") && html.includes("/api/branding/logo");
    if (!ok) check(`the ${v} page's report`, false, html.slice(0, 300));
    else pass++;
  }
  console.log(`PASS every page's report is in the company format with the configured name and logo (${REPORT_VIEWS.length} pages)`);
  const projectsHtml = await deptPageReportHtml(H, "dev", "projects", new URLSearchParams());
  check("the projects report groups the parts under their main project", projectsHtml.includes("MAINA Main A") && projectsHtml.includes("↳ PARTA"));
  const filtered = await deptPageReportHtml(H, "dev", "list", new URLSearchParams({ project: partB }));
  check("a report keeps the page's filters", filtered.includes("Part B work") && !filtered.includes("Part A work") && filtered.includes("Project: Part B"));
  const M = (await loadUser(member.id))!;
  const mine = await deptPageReportHtml(M, "dev", "board", new URLSearchParams());
  check("a member's report has only their own work", !mine.includes("Part A work") && mine.includes("Your own work"));
  check("the access report is for heads and leads", /heads and leads/.test((await throws(() => deptPageReportHtml(M, "dev", "access", new URLSearchParams()))) ?? ""));

  // A deleted main project leaves its parts as main projects.
  await deleteProject(H, "dev", main1);
  check("deleting a main project keeps its parts", (await get<{ p: string | null }>("SELECT parent_id AS p FROM dept_projects WHERE id = ?", partB))?.p === null);

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
