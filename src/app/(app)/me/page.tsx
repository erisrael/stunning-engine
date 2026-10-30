import { requireViewer } from "@/server/auth";
import { getEmployee, hrDepartments, myEmployeeId } from "@/server/hr";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { EmployeeView } from "@/components/app/hr/employee-view";

export const metadata = { title: "My record" };

// Self-service: a person's own HR record, documents, equipment and the people who report to them.
export default async function MePage() {
  const viewer = await requireViewer();
  const id = await myEmployeeId(viewer);
  const detail = id ? await getEmployee(viewer, id) : null;
  const departments = (await hrDepartments()).map((d) => ({ value: d.key, label: d.label }));
  return (
    <div className="space-y-4">
      <PageHeader help="me" title="My record" description="Your job details, contact details, documents and equipment. Update your contact details here; ask HR for anything else." />
      {detail ? (
        // HR people see their own record as everyone else does.
        <EmployeeView detail={{ ...detail, view: "self", rights: { ...detail.rights, editContact: true, addDocs: ["certificate", "cv", "other"] } }} departments={departments} />
      ) : (
        <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Ask them if yours is missing." />
      )}
    </div>
  );
}
