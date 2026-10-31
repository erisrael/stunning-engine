import { getViewer } from "@/server/auth";
import { WorkflowError } from "@/server/workflow";
import { timesheets } from "@/server/attendance";
import { DAY_STATUS_LABELS, fmtMin } from "@/lib/attendance";

// Monthly timesheets as Excel: a summary per person and every day in detail. HR gets everyone, leads their team.
//   ?month=YYYY-MM
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  try {
    const rows = await timesheets(viewer, month);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = (name: string, head: string[], data: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.addRow(head).font = { bold: true };
      data.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c, i) => (c.width = Math.min(40, Math.max(10, ...[head[i] ?? "", ...data.slice(0, 200).map((r) => String(r[i] ?? ""))].map((v) => v.length + 2)))));
    };
    const h = (min: number) => Math.round((min / 60) * 100) / 100;
    sheet(
      "Summary",
      ["Code", "Name", "Department", "Days present", "Late days", "Late minutes", "Half days", "Absent", "On leave", "Unpaid leave days", "Hours worked", "Overtime hours", "Missing check-outs", "Hand-made days", "Unpaid days (payroll)", "Overtime (payroll)"],
      rows.map((r) => [r.code, r.name, r.department, r.totals.present, r.totals.late, r.totals.lateMin, r.totals.halfDays, r.totals.absent, r.totals.leave, r.totals.unpaidLeave, h(r.totals.workedMin), h(r.totals.overtimeMin), r.totals.missingOut, r.totals.manual, r.unpaidDays, r.overtimeHours]),
    );
    sheet(
      "Days",
      ["Code", "Name", "Date", "Status", "In", "Out", "Hours", "Late min", "Early min", "Overtime min", "Missing check-out", "Hand-made", "Note"],
      rows.flatMap((r) => r.days.map((d) => [r.code, r.name, d.date, DAY_STATUS_LABELS[d.status], d.firstIn === null ? null : fmtMin(d.firstIn), d.lastOut === null ? null : fmtMin(d.lastOut), h(d.workedMin), d.lateMin, d.earlyMin, d.overtimeMin, d.missingOut ? "Yes" : "", d.manual ? "Yes" : "", d.note ?? d.leaveLabel])),
    );
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="attendance-${month}.xlsx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return new Response(err instanceof WorkflowError ? err.message : "Something went wrong", { status: err instanceof WorkflowError ? 400 : 500 });
  }
}
