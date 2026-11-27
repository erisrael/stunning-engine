import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { myRoleChanges } from "@/server/role-change";
import { PageHeader } from "@/components/app/primitives";
import { MyRoleChangesView } from "@/components/app/role-impact";

export const metadata = { title: "Your role changes" };

// The person's side of a role change: finish your work first, or continue where you stopped once a role is back.
export default async function MyRoleChangePage() {
  const viewer = await requireViewer();
  const data = await myRoleChanges(viewer);
  return (
    <div className="space-y-4">
      <PageHeader title="Your role changes" description="When a role of yours is changing you are asked to finish your work first. When a role comes back, you can continue where you stopped." />
      <MyRoleChangesView data={data} tz={(await getSettings()).workspace.timezone} />
    </div>
  );
}
