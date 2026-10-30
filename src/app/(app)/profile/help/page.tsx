import { requireViewer } from "@/server/auth";
import { PageHeader } from "@/components/app/primitives";
import { HelpCenter } from "@/components/app/help-center";
import { audienceFor } from "@/lib/help";

export const metadata = { title: "Help" };

export default async function HelpPage() {
  const viewer = await requireViewer();
  return (
    <div className="space-y-4">
      <PageHeader title="Help" description="The training manual for each role, step-by-step guides, your first steps and the get-started tour." />
      <HelpCenter audience={audienceFor(viewer.activeRole, viewer.leads)} tour={viewer.prefs.tour ?? {}} canSeeAll={viewer.perms.includes("users.manage") || viewer.perms.includes("company.view")} />
    </div>
  );
}
