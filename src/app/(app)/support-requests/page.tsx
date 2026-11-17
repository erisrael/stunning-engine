import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { can, userDirectory } from "@/server/users";
import * as sd from "@/server/support-desk";
import * as R from "@/server/support-requests";
import { PageHeader } from "@/components/app/primitives";
import { SupportRequestsView } from "@/components/app/support/requests-view";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/domain";

export const metadata = { title: "Customer Support Requests" };

// Customer Support Requests (Update 1.2, Phase 7): support asks internal teams for help on a customer's case and
// follows it; the teams receive, work, approve and resolve them here; Admin sets destinations and approval chains.
export default async function SupportRequestsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const admin = can(viewer, "users.manage") || can(viewer, "settings.manage");
  const agent = (await sd.isAgent(viewer)) || admin;
  const lead = admin || (await sd.supportConfig()).leads.includes(viewer.id);
  // Opened from a conversation: the new request starts linked to it.
  const ticket = sp.ticket ? await sd.canWork(viewer, sp.ticket).then((t) => ({ id: t.id, number: t.number, subject: t.subject }), () => null) : null;
  const { customDepartments } = await import("@/server/departments");
  const departments = [...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))];
  const people = (await userDirectory()).map((u) => ({ id: u.id, name: u.name }));
  const opened = sp.r ? await get<{ id: string }>("SELECT id FROM sup_requests WHERE reference = ? OR id = ?", sp.r, sp.r) : null;
  return (
    <div className="space-y-4">
      <PageHeader title="Customer Support Requests" description="Ask the Dev team, Finance, the support head or Administration for help on a customer's case, and follow it to the end. Teams receive, work, approve and resolve their requests here." />
      <SupportRequestsView
        canCreate={agent}
        lead={lead}
        admin={admin}
        destinations={agent ? await R.requestDestinationsFor(viewer) : []}
        counts={await R.supportRequestCounts(viewer)}
        ticket={ticket}
        startNew={sp.new === "1" || !!ticket}
        openId={opened?.id ?? null}
        setup={admin ? await R.requestSetup(viewer) : null}
        people={people}
        departments={departments}
      />
    </div>
  );
}
