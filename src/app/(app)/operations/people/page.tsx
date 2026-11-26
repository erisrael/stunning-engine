import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { peopleOpsAccess, peopleOpsDirectory, OPS_DEPT_LABELS } from "@/server/people-ops";
import { PageHeader } from "@/components/app/primitives";
import { PeopleOpsClient } from "./people-ops-client";

export const metadata = { title: "People operations" };

// The Operations head manages the people of the departments Admin chose (Admin, People & roles, Operations authority).
export default async function PeopleOpsPage() {
  const viewer = await requireViewer();
  if (!(await peopleOpsAccess(viewer)).allowed) redirect("/dashboard?denied=permission");
  const { access, people, stages } = await peopleOpsDirectory(viewer);
  const scope = access.admin ? "every department (you are Admin)" : [...access.config.departments.map((d) => OPS_DEPT_LABELS[d]), ...(access.config.chiefs ? ["the chief officers"] : [])].join(", ");
  return (
    <div className="space-y-4">
      <PageHeader
        title="People operations"
        description={`Give and take roles, and name leads, for ${scope}. Admin and Owner accounts are managed by Admin only.`}
      />
      <PeopleOpsClient
        people={people}
        roles={access.roles}
        positionDepts={access.positionDepts.map((d) => ({ key: d, label: OPS_DEPT_LABELS[d] }))}
        stages={access.admin || access.config.departments.includes("production") ? stages : []}
        canAssignHeads={access.admin || access.config.assignHeads}
        admin={access.admin}
        viewerId={viewer.id}
      />
    </div>
  );
}
