import { requireViewer } from "@/server/auth";
import { leaveCalendar, myLeave } from "@/server/leave";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { MyLeave } from "@/components/app/hr/leave";

export const metadata = { title: "Leave" };

// Everyone's own leave: balances, asking for leave, their requests, approvals for line managers and who is off.
export default async function LeavePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : new Date().toISOString().slice(0, 7);
  const [data, cal] = await Promise.all([myLeave(viewer), leaveCalendar(viewer, month)]);
  return (
    <div className="space-y-4">
      <PageHeader help="leave" explainer="ask-leave" title="Leave" description="Your balances and leave requests. Your line manager approves first, then HR. Weekends and public holidays are not counted." />
      {data.employeeId ? (
        <MyLeave balances={data.balances} requests={data.requests} approvals={data.approvals} types={data.types} calendar={data.calendar} month={month} entries={cal.entries} />
      ) : (
        <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Ask them if yours is missing, then you can ask for leave here." />
      )}
    </div>
  );
}
