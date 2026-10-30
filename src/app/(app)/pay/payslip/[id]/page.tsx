import { notFound } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { payslip } from "@/server/finance";
import { getSettings } from "@/server/settings";
import { PrintButton } from "@/components/app/finance/print-button";

export const metadata = { title: "Payslip" };

const m = (n: number | string) => (Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// A payslip to read, print or save as PDF (the browser's Print, Save as PDF).
export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const s = await payslip(viewer, (await params).id);
  if (!s) notFound();
  const ws = (await getSettings()).workspace.name;
  const daily = Number(s.basic) / s.settings.daysPerMonth;
  const overtime = (daily / s.settings.hoursPerDay) * Number(s.overtime_rate) * Number(s.overtime_hours);
  const unpaid = daily * Number(s.unpaid_days);
  const row = (label: string, v: number | string, strong = false) => (
    <tr className={strong ? "font-semibold" : ""}>
      <td className="py-1">{label}</td>
      <td className="py-1 text-right tabular">{m(v)}</td>
    </tr>
  );
  return (
    <div className="mx-auto max-w-2xl space-y-6 rounded-xl border bg-card p-8 print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{ws}</h1>
          <p className="text-muted-foreground">Payslip for {s.period}</p>
        </div>
        <PrintButton />
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <span className="text-muted-foreground">Employee</span>
        <span>
          {s.name} ({s.code})
        </span>
        <span className="text-muted-foreground">Job</span>
        <span>{[s.job_title, s.department].filter(Boolean).join(", ") || "-"}</span>
        <span className="text-muted-foreground">TIN</span>
        <span>{s.tin ?? "-"}</span>
        <span className="text-muted-foreground">Pension number</span>
        <span>{s.pension_no ?? "-"}</span>
        <span className="text-muted-foreground">Paid to</span>
        <span>{[s.bank_name, s.bank_account].filter(Boolean).join(" ") || "-"}</span>
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b pb-1 text-left">Earnings</th>
              <th className="border-b pb-1 text-right">{s.currency}</th>
            </tr>
          </thead>
          <tbody>
            {row("Basic salary", s.basic)}
            {s.allowances.map((a) => row(`${a.name}${a.taxable === false ? " (tax free)" : ""}`, a.amount))}
            {Number(s.overtime_hours) > 0 && row(`Overtime ${s.overtime_hours} h × ${s.overtime_rate}`, overtime)}
            {Number(s.unpaid_days) > 0 && row(`Unpaid leave ${s.unpaid_days} days`, -unpaid)}
            {row("Gross pay", s.gross, true)}
          </tbody>
        </table>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="border-b pb-1 text-left">Deductions</th>
              <th className="border-b pb-1 text-right">{s.currency}</th>
            </tr>
          </thead>
          <tbody>
            {row(`Income tax (on ${m(s.taxable)})`, s.income_tax)}
            {row(`Pension ${s.settings.pensionEmployee}%`, s.pension_employee)}
            {s.deductions.map((d) => row(d.name, d.amount))}
            {row("Total deductions", Number(s.income_tax) + Number(s.pension_employee) + Number(s.other_deductions), true)}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
        <span className="font-medium">Net pay</span>
        <span className="text-2xl font-semibold tabular">
          {m(s.net)} {s.currency}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        The employer also pays {s.settings.pensionEmployer}% pension ({m(s.pension_employer)} {s.currency}). Questions about this payslip go to Finance.
      </p>
    </div>
  );
}
