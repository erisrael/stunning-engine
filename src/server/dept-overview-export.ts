// The team overview leaves the app: the tasks behind it as a spreadsheet (CSV), and a print-ready report in the
// company format (A4, cover, the headline numbers, the flow, projects, people, the sprint, releases, what is due),
// with the same filters as the page. Members get only what they may see, and only what was shared to download.

import { workAccess } from "./dept-config";
import { deptOverview, type OverviewFilter } from "./dept-overview";
import { listTasks } from "./work";
import { getSettings } from "./settings";
import { SPEC_CSS, escHtml } from "@/lib/spec-doc";
import type { AppUser } from "./users";

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export async function overviewCsv(user: AppUser, d: string, f: OverviewFilter) {
  const a = await workAccess(user, d);
  const cfg = a.config;
  const sprint = f.sprint === "current" ? null : f.sprint;
  const { tasks } = await listTasks(user, a.dept, {
    project: f.project ?? null,
    assignee: f.person ?? null,
    type: f.type ?? null,
    priority: f.priority ?? null,
    sprint: f.sprint === "current" ? "current" : sprint ?? null,
    exportable: true,
    sort: "code",
    dir: "asc",
  });
  const lab = (list: { key: string; label: string }[], k: string) => list.find((x) => x.key === k)?.label ?? k;
  const head = ["Code", "Title", "Project", "Type", "Status", "Stage group", "Priority", "Assignee", cfg.sprint.unit === "points" ? "Points" : "Hours", "Start", "Due", "Done", "Created"];
  const rows = tasks.map((t) => {
    const r = t as unknown as Record<string, unknown>;
    return [t.code, t.title, r.project_name ?? r.project_key ?? "", lab(cfg.types, t.type), lab(cfg.statuses, t.status), r.status_category ?? "", lab(cfg.priorities, t.priority), t.assignee_name ?? "", cfg.sprint.unit === "points" ? (r.points ?? "") : (r.estimate_hours ?? ""), t.start_date ?? "", t.due_date ?? "", String(r.completed_at ?? "").slice(0, 10), String(t.created_at).slice(0, 10)].map(csvCell).join(",");
  });
  return `\uFEFF${[head.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

export async function overviewReportHtml(user: AppUser, d: string, f: OverviewFilter) {
  const a = await workAccess(user, d);
  const data = await deptOverview(user, d, f);
  const workspace = (await getSettings()).workspace.name || "Myseed";
  const unit = data.unit === "points" ? "pts" : "h";
  const t = data.tiles;
  const period = data.period ? `the last ${data.period === 365 ? "year" : `${data.period} days`}` : "all time";
  const names = (list: { id: string; label: string }[], id?: string | null) => list.find((x) => x.id === id)?.label ?? id ?? "";
  const filters = [
    f.project && `Project: ${names(data.options.projects, f.project)}`,
    f.person && `Person: ${f.person === "none" ? "Nobody yet" : names(data.options.people, f.person)}`,
    f.type && `Type: ${names(data.options.types, f.type)}`,
    f.priority && `Priority: ${names(data.options.priorities, f.priority)}`,
    f.sprint && `Sprint: ${f.sprint === "current" ? "Current" : names(data.options.sprints, f.sprint)}`,
  ].filter(Boolean) as string[];
  const table = (head: string[], rows: (string | number)[][], right: number[] = []) =>
    `<div class="spec-table"><table><thead><tr>${head.map((h, i) => `<th${right.includes(i) ? ' style="text-align:right"' : ""}>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' style="text-align:right"' : ""}>${escHtml(String(c))}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}">None</td></tr>`}</tbody></table></div>`;
  const health: Record<string, string> = { done: "Finished", on_track: "On track", at_risk: "At risk", late: "Late" };
  const tiles = [
    [`Done (${period})`, `${t.doneInPeriod} · ${t.unitsInPeriod} ${unit}`],
    ["Done in all", `${t.doneTotal} · ${t.progress}% of all ${unit}`],
    ["In progress", t.active],
    ["In review and QA", t.review],
    ["To do", t.todo],
    ["Backlog", t.backlog],
    ["Overdue", t.overdue],
    ["Open bugs", t.openBugs],
    [`Releases (${period})`, t.releases],
    ["Velocity", t.velocity === null ? "None yet" : `${t.velocity} ${unit}`],
  ];
  const body = `
<h1 id="spec-summary">1. Summary</h1>
<div class="ov-tiles">${tiles.map(([l, v]) => `<div class="ov-tile"><p class="ov-l">${escHtml(String(l))}</p><p class="ov-v">${escHtml(String(v))}</p></div>`).join("")}</div>
${data.sprint ? `<blockquote class="spec-callout spec-callout-note"><p class="spec-callout-title">Current sprint</p><p><strong>${escHtml(data.sprint.name)}</strong>, ${escHtml(data.sprint.start ?? "")} to ${escHtml(data.sprint.end ?? "")}: ${data.sprint.done} of ${data.sprint.committed} ${unit} done, ${data.sprint.finished} of ${data.sprint.tasks} tasks, ${data.sprint.daysLeft} days left.${data.sprint.goal ? ` Goal: ${escHtml(data.sprint.goal)}` : ""}</p></blockquote>` : ""}
<h1 id="spec-flow">2. The flow</h1>
${table(["Stage", "Tasks", unit], data.flow.map((s) => [s.label, s.count, s.units]), [1, 2])}
<h1 id="spec-projects">3. Projects</h1>
${table(["Project", "Status", "Progress", "Done", "Open", "Bugs", "Overdue", "Next milestone", "Due", "Health"], data.projects.map((p) => [`${p.key} ${p.name}`, p.status, `${p.progress}%`, `${p.done}/${p.total}`, p.open, p.bugs, p.overdue, p.next ? `${p.next.name}${p.next.due ? ` (${p.next.due})` : ""}` : "", p.due ?? "Ongoing", health[p.health] ?? p.health]), [2, 3, 4, 5, 6])}
<h1 id="spec-people">4. Who is on what</h1>
${table(["Person", "To do", "Doing", "Review", "Overdue", `Done (${period})`, unit, "Working on"], data.team.map((p) => [p.name, p.todo, p.active, p.review, p.overdue, p.doneInPeriod, p.unitsInPeriod, p.now.map((x) => `${x.code} ${x.title}`).join("; ")]), [1, 2, 3, 4, 5, 6])}
<h1 id="spec-throughput">5. Throughput</h1>
${table(["Week starting", `Finished (${unit})`, "Tasks finished", "Tasks added"], data.throughput.map((w) => [w.week, w.units, w.finished, w.created]), [1, 2, 3])}
${table(["Type", "Done", "Open"], data.types.map((x) => [x.label, x.done, x.open]), [1, 2])}
<h1 id="spec-due">6. Due in the next two weeks, and overdue</h1>
${table(["Task", "Project", "Assignee", "Due", "Status"], data.dueSoon.map((x) => [`${x.code} ${x.title}`, x.project ?? "", x.assignee ?? "Nobody yet", x.due ?? "", x.status]))}
<h1 id="spec-recent">7. Recently finished and released</h1>
${table(["Task", "Project", "Assignee", "Done"], data.recent.map((x) => [`${x.code} ${x.title}`, x.project ?? "", x.assignee ?? "", (x.done ?? "").slice(0, 10)]))}
${table(["Release", "Tasks", "Date"], data.releases.map((r) => [r.name, r.task_count, r.created_at.slice(0, 10)]), [1])}`;
  const title = `${a.config.title}: team overview`;
  const ref = `${a.dept.toUpperCase()}-REPORT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}`;
  const control = `<table class="spec-control"><tbody>
<tr><th>Report</th><td><span class="spec-mono">${escHtml(ref)}</span></td></tr>
<tr><th>Period</th><td>${escHtml(period[0]!.toUpperCase() + period.slice(1))}${data.since ? ` (from ${escHtml(data.since)})` : ""}</td></tr>
<tr><th>Filters</th><td>${escHtml(filters.join(" · ") || "None: the whole department")}</td></tr>
<tr><th>Prepared for</th><td>${escHtml(user.name)}</td></tr>
<tr><th>Generated</th><td>${escHtml(new Date().toISOString().slice(0, 16).replace("T", " "))} UTC</td></tr>
${data.seeAll ? "" : "<tr><th>Scope</th><td>Your own work and what was shared with you</td></tr>"}
</tbody></table>`;
  const toc = `<nav class="spec-toc" aria-label="Contents"><p class="spec-toc-title">Contents</p><ol>${["Summary", "The flow", "Projects", "Who is on what", "Throughput", "Due in the next two weeks, and overdue", "Recently finished and released"].map((h, i) => `<li class="d1"><a href="#spec-${["summary", "flow", "projects", "people", "throughput", "due", "recent"][i]}">${i + 1}. ${escHtml(h)}</a></li>`).join("")}</ol></nav>`;
  const footer = `${workspace} · ${title}`.replace(/["\\]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(title)}</title><style>
@page{size:A4 landscape;margin:14mm 14mm 16mm;@bottom-left{content:"${footer}";font:9pt Calibri,Arial,sans-serif;color:#6b7280}@bottom-right{content:counter(page) " / " counter(pages);font:9pt Calibri,Arial,sans-serif;color:#6b7280}}
html,body{margin:0;background:#eef0f3}body{font-family:Calibri,"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;padding:24px 12px}
@media print{html,body{background:#fff;padding:0}}
${SPEC_CSS}
.spec-doc{max-width:72rem}
.ov-tiles{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:.5rem 0 1rem}
.ov-tile{border:1px solid var(--spec-rule);border-radius:10px;padding:.5rem .75rem;break-inside:avoid}
.ov-l{margin:0;font-size:11px;color:var(--spec-muted)}.ov-v{margin:.15rem 0 0;font-size:18px;font-weight:700}
.spec-table td,.spec-table th{min-width:0}
</style></head><body><article class="spec-doc spec-print"><div class="spec-cover"><div class="spec-band"></div><header class="spec-head"><div class="spec-brand"><span>${escHtml(workspace)}</span></div><div class="spec-ref">Team report<br>${escHtml(ref)}</div></header><section class="spec-titleblock"><p class="spec-kind">Team report</p><h1 class="spec-title">${escHtml(title)}</h1>${control}</section></div>${toc}<div class="spec-body">${body}</div><footer class="spec-foot"><span>${escHtml(workspace)} · Internal report</span><span>${escHtml(ref)}</span></footer></article><script>window.addEventListener("load",()=>{if(new URLSearchParams(location.search).get("print")==="1")setTimeout(()=>window.print(),300)})</script></body></html>`;
}
