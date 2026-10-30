import { getViewer } from "@/server/auth";
import { deptReport } from "@/server/work-extras";
import { isPeriod } from "@/lib/dashboards";

// A department's report as an Excel workbook: summary, people, projects, finished and overdue work, all tasks.
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  const url = new URL(request.url);
  const period = isPeriod(url.searchParams.get("period")) ? (url.searchParams.get("period") as never) : "30d";
  let data;
  try {
    data = await deptReport(viewer, url.searchParams.get("dept") ?? "", period);
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Not allowed", { status: 403 });
  }
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const sheet = (name: string, head: string[], rows: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(head).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    ws.columns.forEach((c, i) => (c.width = Math.min(60, Math.max(10, ...[head[i] ?? "", ...rows.map((r) => String(r[i] ?? ""))].map((v) => v.length + 2)))));
  };
  sheet(
    "Summary",
    ["", ""],
    [
      ["Department", data.title],
      ["Period", `${data.period.label}: ${data.period.from} to ${data.period.to}`],
      ["Done", data.totals.done],
      ["New", data.totals.created],
      ["Still open", data.totals.open],
      ["Overdue", data.totals.overdue],
      ["Hours logged", data.totals.hours],
      ...data.kpis.map((k) => [`KPI: ${k.label}${k.unit ? ` (${k.unit})` : ""}`, k.total] as [string, number]),
      ...data.money.map((m) => [`Money: ${m.label}`, m.done] as [string, number]),
    ],
  );
  sheet("People", ["Person", "Open", "Done", "Overdue", "Hours"], data.people.map((p) => [p.name, p.open, p.done, p.overdue, p.hours]));
  sheet(data.names.projects.slice(0, 30), ["Key", "Name", "Status", "Progress %", "Done", "Total", "Due", "Budget"], data.projects.map((p) => [p.key, p.name, p.status, p.progress, p.done, p.total, p.due, p.budget]));
  sheet("Finished", ["Code", "Title", "Type", "By", "Done on"], data.doneList.map((d) => [d.code, d.title, d.type, d.assignee, d.completed]));
  sheet("Overdue", ["Code", "Title", "Assignee", "Due"], data.overdueList.map((d) => [d.code, d.title, d.assignee, d.due]));
  sheet(data.names.tasks.slice(0, 30), ["Code", "Title", "Type", "Status", "Priority", "Assignee", "Project", "Due", "Created", "Completed", "Estimate (h)", "Spent (h)"], data.tasks.map((t) => [t.code, t.title, t.type, t.status, t.priority, t.assignee, t.project, t.due, t.created, t.completed, t.estimate, t.spent]));
  const buf = await wb.xlsx.writeBuffer();
  const name = `${data.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-report-${data.period.from}-to-${data.period.to}.xlsx`;
  return new Response(new Uint8Array(buf as ArrayBuffer), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
