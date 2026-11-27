import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { personByHandle, removalFromParam, roleImpact } from "@/server/role-change";
import { WorkflowError } from "@/server/workflow";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { RoleImpactView } from "@/components/app/role-impact";

export const metadata = { title: "Impact of a role change" };

// The impact analysis page: what taking a role (or a team lead position) from someone affects, before it happens.
export default async function RoleChangePage({ params, searchParams }: { params: Promise<{ handle: string }>; searchParams: Promise<{ remove?: string }> }) {
  const viewer = await requireViewer();
  const { handle } = await params;
  const { remove = "" } = await searchParams;
  const person = await personByHandle(decodeURIComponent(handle));
  if (!person) notFound();
  let impact;
  try {
    impact = await roleImpact(viewer, person.id, removalFromParam(remove));
  } catch (e) {
    if (e instanceof WorkflowError && e.code === "FORBIDDEN") redirect("/dashboard?denied=permission");
    throw e;
  }
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="People and roles"
        title={`Impact of the role change for ${person.name}`}
        description="What changes if these roles are taken: the work they still hold, their team's queue, and the pages and rights they lose. Nothing changes until you confirm."
      />
      <RoleImpactView impact={impact} back={can(viewer, "users.manage") ? "/admin?tab=people" : "/operations/people"} />
    </div>
  );
}
