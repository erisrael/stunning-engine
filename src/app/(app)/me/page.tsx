import { requireViewer } from "@/server/auth";
import { getEmployee, hrDepartments, myEmployeeId } from "@/server/hr";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { EmployeeView } from "@/components/app/hr/employee-view";
import Link from "next/link";
import { employeeChecklists, myInterviews } from "@/server/hr-hiring";
import { growthFor, reviewsToWrite } from "@/server/hr-growth";
import { EmployeeLifecycle, MyInterviews } from "@/components/app/hr/hiring";
import { GrowthSection } from "@/components/app/hr/growth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "My record" };

// Self-service: a person's own HR record, documents, equipment and the people who report to them.
export default async function MePage() {
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
      <PageHeader help="me" title="My record" description="Your job details, contact details, documents and equipment. Update your contact details here; ask HR for anything else." />
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
