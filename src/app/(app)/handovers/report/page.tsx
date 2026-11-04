import { requireCapability } from "@/server/auth";
import { crossCheckCount } from "@/server/editorial";
import { handoverReport, type ReportOutcome } from "@/server/handover-report";
import { getSettings } from "@/server/settings";
import { can, userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { STAGES, type Stage } from "@/lib/domain";
import { localInputToIso } from "@/lib/format";
import { HandoverNav } from "../handover-nav";
import { ReportClient } from "./report-client";

export const metadata = { title: "Handover report" };

const OUTCOMES = ["waiting", "accepted", "in_check", "rejected", "overturned"] as const;

export default async function HandoverReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("nav.handovers");
  const sp = await searchParams;
  const tz = (await getSettings()).workspace.timezone;
  const filter = {
    stage: (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : null,
    outcome: (OUTCOMES as readonly string[]).includes(sp.outcome ?? "") ? (sp.outcome as ReportOutcome) : null,
    person: sp.person || null,
    q: sp.q || null,
  };
  const [{ rows, totals }, people, count] = await Promise.all([
    handoverReport(viewer, { ...filter, from: sp.from ? localInputToIso(`${sp.from}T00:00`, tz) : null, to: sp.to ? localInputToIso(`${sp.to}T23:59`, tz) : null }),
    userDirectory(),
    crossCheckCount(viewer),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="Handover report" description="When each part was handed over, and the date and time it was accepted or rejected, by whom, and how the cross-check went." />
      <HandoverNav settings={can(viewer, "settings.manage") || can(viewer, "users.manage")} rejected={count} />
      <ReportClient rows={rows} totals={totals} tz={tz} filter={{ ...filter, from: sp.from ?? null, to: sp.to ?? null }} people={people.map((p) => ({ id: p.id, name: p.name }))} />
    </div>
  );
}
