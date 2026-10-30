import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { all } from "@/server/db";
import { getEmployee, hrDepartments, listEmployees } from "@/server/hr";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { EmployeeView } from "@/components/app/hr/employee-view";
import { employeeChecklists } from "@/server/hr-hiring";
import { growthFor } from "@/server/hr-growth";
import { EmployeeLifecycle } from "@/components/app/hr/hiring";
import { GrowthSection } from "@/components/app/hr/growth";
import { can } from "@/server/users";

export const metadata = { title: "Employee" };

// HR sees and edits the full record; the person sees their own; line managers see their team (read only).
export default async function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const detail = await getEmployee(viewer, (await params).id);
  if (!detail) notFound();
  const departments = (await hrDepartments()).map((d) => ({ value: d.key, label: d.label }));
  const hr = detail.view === "hr";
  const managers = hr ? (await listEmployees(viewer)).map((p) => ({ value: p.id, label: p.name })) : undefined;
  // Accounts not linked to another record.
  const accounts = hr
    ? (
        await all<{ id: string; name: string; email: string }>(
          "SELECT u.id, u.name, u.email FROM users u WHERE u.active = 1 AND NOT EXISTS (SELECT 1 FROM employees e WHERE e.user_id = u.id AND e.id <> ?) ORDER BY u.name",
          detail.employee.id,
        )
      ).map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))
    : undefined;
  const [growth, lists] = await Promise.all([growthFor(viewer, detail.employee.id), employeeChecklists(viewer, detail.employee.id)]);
  return (
    <div className="space-y-4">
      <PageHeader
        help={hr ? "hr" : "me"}
        eyebrow={hr ? "HR" : detail.view === "self" ? "My record" : "My team"}
        title={detail.employee.preferredName || detail.employee.fullName}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={hr ? "/hr" : "/me"}>
              <ArrowLeftIcon /> {hr ? "HR" : "My record"}
            </Link>
          </Button>
        }
      />
      <EmployeeView detail={detail} departments={departments} managers={managers} accounts={accounts} />
      <div className="grid gap-4 xl:grid-cols-2">
        {growth && <GrowthSection employeeId={detail.employee.id} growth={growth} />}
        <EmployeeLifecycle employeeId={detail.employee.id} lists={lists} view={detail.view} canManage={can(viewer, "hr.manage")} status={detail.employee.status} />
      </div>
    </div>
  );
}
