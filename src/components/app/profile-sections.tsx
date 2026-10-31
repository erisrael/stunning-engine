// The Profile tabs that used to be pages of their own (My record, Leave, Claims and pay). /me, /leave and /pay
// send people here.
import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { getEmployee, hrDepartments, myEmployeeId } from "@/server/hr";
import { EmptyState } from "@/components/app/primitives";
import { EmployeeView } from "@/components/app/hr/employee-view";
import { employeeChecklists, myInterviews } from "@/server/hr-hiring";
import { growthFor, reviewsToWrite } from "@/server/hr-growth";
import { EmployeeLifecycle, MyInterviews } from "@/components/app/hr/hiring";
import { GrowthSection } from "@/components/app/hr/growth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { leaveCalendar, myLeave } from "@/server/leave";
import { MyLeave } from "@/components/app/hr/leave";
import * as f from "@/server/finance";
import { PayHome, type PayTab } from "@/components/app/finance/pay-ui";

const TABS: PayTab[] = ["claims", "purchases", "payslips", "approve"];

export async function MyRecordSection() {
  const viewer = await requireViewer();
  const id = await myEmployeeId(viewer);
  const detail = id ? await getEmployee(viewer, id) : null;
  const departments = (await hrDepartments()).map((d) => ({ value: d.key, label: d.label }));
  const [growth, lists, interviews, toWrite] = await Promise.all([
    id ? growthFor(viewer, id) : null,
    id ? employeeChecklists(viewer, id) : [],
    myInterviews(viewer),
    reviewsToWrite(viewer),
  ]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Your job details, contact details, documents and equipment. Update your contact details here; ask HR for anything else.</p>
      {toWrite.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle>Reviews to write ({toWrite.length})</CardTitle>
            <CardDescription>Their self reviews are in. Open each person to write yours.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm">
            {toWrite.map((r) => (
              <Link key={r.id} href={`/hr/people/${r.employee_id}`} className="rounded-md border px-3 py-1.5 hover:border-primary">
                {r.full_name} <span className="text-muted-foreground">· {r.name}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}
      <MyInterviews items={interviews} />
      {detail ? (
        // HR people see their own record as everyone else does.
        <>
          <EmployeeView detail={{ ...detail, view: "self", rights: { ...detail.rights, editContact: true, addDocs: ["certificate", "cv", "other"] } }} departments={departments} />
          <div className="grid gap-4 xl:grid-cols-2">
            {growth && <GrowthSection employeeId={detail.employee.id} growth={{ ...growth, relation: "self", reviews: growth.reviews.map((r) => ({ ...r, canLead: false, canSelf: r.status === "self" })) }} />}
            <EmployeeLifecycle employeeId={detail.employee.id} lists={lists} view="self" canManage={false} status={detail.employee.status} />
          </div>
        </>
      ) : (
        <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Ask them if yours is missing." />
      )}
    </div>
  );
}

export async function LeaveSection({ monthParam }: { monthParam?: string }) {
  const viewer = await requireViewer();
  const month = /^\d{4}-\d{2}$/.test(monthParam ?? "") ? monthParam! : new Date().toISOString().slice(0, 7);
  const [data, cal] = await Promise.all([myLeave(viewer), leaveCalendar(viewer, month)]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Your balances and leave requests. Your line manager approves first, then HR. Weekends and public holidays are not counted.</p>
      {data.employeeId ? (
        <MyLeave balances={data.balances} requests={data.requests} approvals={data.approvals} types={data.types} calendar={data.calendar} month={month} entries={cal.entries} />
      ) : (
        <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Ask them if yours is missing, then you can ask for leave here." />
      )}
    </div>
  );
}

export async function PaySection({ payTab }: { payTab?: string }) {
  const viewer = await requireViewer();
  const tab = TABS.includes(payTab as PayTab) ? (payTab as PayTab) : "claims";
  const [claims, purchases, payslips, toApprove, departments, ledger, settings] = await Promise.all([
    f.listClaims(viewer, "mine"),
    f.listPurchases(viewer, true),
    f.myPayslips(viewer),
    f.listClaims(viewer, "toApprove"),
    f.financeDepartments(),
    f.ledger(),
    f.financeSettings(),
  ]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Claim expenses, ask to buy things, and read your payslips.</p>
      <PayHome
        tab={tab}
        tabParam="pay"
        claims={claims}
        purchases={purchases}
        payslips={payslips}
        toApprove={toApprove}
        departments={departments.map((d) => ({ value: d.key, label: d.label }))}
        ledger={ledger.filter((l) => l.active && l.type === "expense").map((l) => ({ value: l.code, label: l.name }))}
        cur={settings.currency}
        today={new Date().toISOString().slice(0, 10)}
      />
    </div>
  );
}
