import { getViewer } from "@/server/auth";
import * as f from "@/server/finance";

// Finance downloads: Excel reports, the payroll bank file, bill attachments and claim receipts.
//   ?report=transactions|pnl|payroll|tax|cost&from=&to=&period=&run=
//   ?bank=<runId>   ?bill=<billId>   ?receipt=<claimId>
export async function GET(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return new Response("Sign in required", { status: 401 });
  if (viewer.previewBy) return new Response("Not available in View as", { status: 403 });
  const url = new URL(request.url);
  const q = (k: string) => url.searchParams.get(k) ?? "";
  const file = (name: string, mime: string, data: Buffer | string) =>
    new Response(typeof data === "string" ? data : new Uint8Array(data), {
      headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="${encodeURIComponent(name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  try {
    if (q("bank")) {
      const b = await f.bankFile(viewer, q("bank"));
      return file(`salaries-${q("bank")}.csv`, "text/csv; charset=utf-8", b.csv);
    }
    if (q("bill")) {
      const b = await f.billFile(viewer, q("bill"));
      return b ? file(b.name, "application/octet-stream", b.data) : new Response("Not found", { status: 404 });
    }
    if (q("receipt")) {
      const r = await f.claimReceipt(viewer, q("receipt"));
      return r ? file(r.name, "application/octet-stream", r.data) : new Response("Not found", { status: 404 });
    }
    const range = { from: /^\d{4}-\d{2}-\d{2}$/.test(q("from")) ? q("from") : `${new Date().getUTCFullYear()}-01-01`, to: /^\d{4}-\d{2}-\d{2}$/.test(q("to")) ? q("to") : new Date().toISOString().slice(0, 10) };
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const sheet = (name: string, head: string[], rows: (string | number | null)[][]) => {
      const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
      ws.addRow(head).font = { bold: true };
      rows.forEach((r) => ws.addRow(r));
      ws.columns.forEach((c, i) => (c.width = Math.min(50, Math.max(10, ...[head[i] ?? "", ...rows.slice(0, 200).map((r) => String(r[i] ?? ""))].map((v) => v.length + 2)))));
    };
    const report = q("report");
    if (report === "transactions") {
      const rows = await f.listTransactions(viewer, range);
      sheet("Transactions", ["Date", "In or out", "Amount", "Account", "Ledger", "Party", "Department", "Project", "Product", "Channel", "Description", "Reference", "Source", "Status"], rows.map((r) => [r.date, r.direction, Number(r.amount), r.account, r.ledger_code, r.party, r.department, r.project, r.product, r.channel, r.description, r.reference, r.source, r.status]));
    } else if (report === "pnl") {
      const p = await f.profitAndLoss(viewer, range);
      sheet("By department", ["Department", "Income", "Spending", "Payroll", "Net"], p.byDept.map((d) => [d.label, d.income, d.spend, d.payroll, d.net]));
      sheet("By account", ["Code", "Account", "Income", "Spending"], p.byLedger.map((l) => [l.code, l.name, l.income, l.spend]));
    } else if (report === "cost") {
      const c = await f.costPerVideo(viewer, range);
      sheet("Cost per video", ["Measure", "Value"], [["Published videos", c.published], ["Production spending", c.spend], ["Production payroll", c.payroll], ["Total cost", c.total], ["Cost per video", c.perVideo], ["Hours logged", c.hours], ["Average hourly cost", c.hourlyCost], ["Time cost per video", c.timeCostPerVideo]]);
    } else if (report === "payroll" && q("run")) {
      const rows = await f.payslipsOf(viewer, q("run"));
      sheet("Payroll", ["Code", "Name", "Department", "Basic", "Overtime hours", "Unpaid days", "Gross", "Taxable", "Income tax", "Pension 7%", "Pension 11%", "Other deductions", "Net", "Bank", "Account"], rows.map((r) => [r.code, r.name, r.department, Number(r.basic), Number(r.overtime_hours), Number(r.unpaid_days), Number(r.gross), Number(r.taxable), Number(r.income_tax), Number(r.pension_employee), Number(r.pension_employer), Number(r.other_deductions), Number(r.net), r.bank_name, r.bank_account]));
    } else if (report === "tax" && /^\d{4}-\d{2}$/.test(q("period"))) {
      const rows = await f.taxAndPension(viewer, q("period"));
      sheet("Income tax", ["Code", "Name", "TIN", "Taxable income", "Income tax"], rows.map((r) => [r.code, r.name, r.tin, Number(r.taxable), Number(r.income_tax)]));
      sheet("Pension", ["Code", "Name", "Pension number", "Basic salary", "Employee 7%", "Employer 11%", "Total"], rows.map((r) => [r.code, r.name, r.pension_no, Number(r.basic), Number(r.pension_employee), Number(r.pension_employer), Number(r.pension_employee) + Number(r.pension_employer)]));
    } else return new Response("Unknown report", { status: 400 });
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return file(`finance-${report}-${range.from}-to-${range.to}.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buf);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "Not allowed", { status: 403 });
  }
}
