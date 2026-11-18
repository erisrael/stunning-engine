import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { userDirectory } from "@/server/users";
import * as sd from "@/server/support-desk";
import * as R from "@/server/call-records";
import { PageHeader } from "@/components/app/primitives";
import { CallRecordsView } from "@/components/app/support/call-records-view";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/domain";

export const metadata = { title: "Call records" };

// Call Records (Update 1.2, Phase 9, spec part H): every customer call with its record and recording. Admin, support
// leads and the managers Admin allows see every call; agents see their own.
export default async function CallRecordsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  if (!(await R.canOpenCallRecords(viewer))) redirect("/");
  const sp = await searchParams;
  const filters = { q: sp.q ?? "", customer: sp.customer ?? "", minDur: sp.minDur ?? "", maxDur: sp.maxDur ?? "", agent: sp.agent ?? "", queue: sp.queue ?? "", department: sp.department ?? "", direction: sp.direction ?? "", status: sp.status ?? "", outcome: sp.outcome ?? "", recorded: sp.recorded ?? "", from: sp.from ?? "", to: sp.to ?? "" };
  const f = { q: filters.q, customer: filters.customer || null, minDur: filters.minDur || null, maxDur: filters.maxDur || null, agentId: filters.agent || null, queueId: filters.queue || null, department: filters.department || null, direction: filters.direction || null, status: filters.status || null, outcome: filters.outcome || null, recorded: filters.recorded || null, from: filters.from || null, to: filters.to || null };
  const { rows, all } = await R.listCallRecords(viewer, f);
  const { customDepartments } = await import("@/server/departments");
  const departments = [...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))];
  const cfg = await sd.supportConfig();
  return (
    <div className="space-y-4">
      <PageHeader title="Call records" description={`Every customer call: who, when, how long they waited and talked, the outcome and the recording. ${cfg.recordingDays > 0 ? `Recordings are kept ${cfg.recordingDays} days unless under legal hold.` : "Recordings are kept indefinitely."} The call record itself is kept when its recording expires.`} />
      <CallRecordsView
        rows={rows}
        stats={await R.callRecordStats(viewer, f)}
        filters={filters}
        all={all}
        people={(await userDirectory()).map((u) => ({ id: u.id, name: u.name }))}
        queues={(await sd.listQueues()).map((q) => ({ id: q.id, name: q.name }))}
        departments={departments}
        outcomes={R.OUTCOME_LABELS}
      />
    </div>
  );
}
