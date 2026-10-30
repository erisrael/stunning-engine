import { requireViewer } from "@/server/auth";
import { myRequests, requestTargets } from "@/server/work-extras";
import { PageHeader } from "@/components/app/primitives";
import { RequestsClient } from "./requests-client";

export const metadata = { title: "Requests" };

export default async function RequestsPage() {
  const viewer = await requireViewer();
  const [targets, mine] = await Promise.all([requestTargets(viewer), myRequests(viewer)]);
  return (
    <div className="space-y-4">
      <PageHeader help="departments" title="Requests" description="Ask another department for something (a design, a fix, a purchase), and follow what happens to your requests. A head or lead accepts or declines each one." />
      <RequestsClient targets={targets} mine={mine} />
    </div>
  );
}
