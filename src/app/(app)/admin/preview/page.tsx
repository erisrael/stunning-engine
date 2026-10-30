import { redirect } from "next/navigation";
import { realViewer } from "@/server/auth";
import { all } from "@/server/db";
import { can, listUsers } from "@/server/users";
import { customDepartments } from "@/server/departments";
import { PageHeader } from "@/components/app/primitives";
import { ViewAsPicker, type PreviewPerson } from "@/components/app/security";
import { DEPARTMENT_LABELS, type Stage } from "@/lib/domain";

export const metadata = { title: "View as" };

// Admin's View as: works from the real person behind the session, so it opens even while previewing.
export default async function PreviewPage() {
  const me = await realViewer();
  if (!me || !can(me, "users.manage")) redirect("/dashboard?denied=permission");
  const [users, leads, positions, custom] = await Promise.all([
    listUsers(),
    all<{ user_id: string; stage: Stage }>("SELECT user_id, stage FROM team_leads"),
    all<{ user_id: string; department: string; position: string }>("SELECT user_id, department, position FROM department_positions"),
    customDepartments(),
  ]);
  const people: PreviewPerson[] = users
    .filter((u) => u.id !== me.id)
    .map((u) => ({
      id: u.id,
      name: u.name,
      roles: u.roles,
      leads: leads.filter((l) => l.user_id === u.id).map((l) => l.stage),
      positions: positions.filter((p) => p.user_id === u.id).map((p) => ({ dept: p.department, position: p.position })),
    }));
  const departments = [...Object.entries(DEPARTMENT_LABELS).map(([key, label]) => ({ key, label })), ...custom.map((c) => ({ key: c.key, label: c.title }))];
  return (
    <div className="space-y-4">
      <PageHeader help="admin" explainer="view-as" title="View as" description="Check what a role, department, team lead or person sees, without changing anything." />
      <ViewAsPicker people={people} departments={departments} />
    </div>
  );
}
