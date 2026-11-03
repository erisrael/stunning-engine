import { requireViewer } from "@/server/auth";
import { listRoutines, listRuns, routinesConfig, routinesOpen } from "@/server/routines";
import { PageHeader } from "@/components/app/primitives";
import { RoutinesPage } from "./routines-page";

export const metadata = { title: "Routines" };

// Routines (Phase 13d): what a person recorded for the assistant to do, the runs, and runs waiting for approval.
export default async function Page({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireViewer();
  const [routines, runs, cfg, open] = await Promise.all([listRoutines(viewer), listRuns(viewer), routinesConfig(), routinesOpen(viewer)]);
  const { tab } = await searchParams;
  const approval = cfg.approval === "self" ? "You confirm each run." : cfg.approval === "lead" ? "Your line manager approves each run first." : "Admin approves each run first.";
  return (
    <div className="space-y-4">
      <PageHeader title="Routines" description={`Record how you do something once; then ask the assistant to do it ("run weekly report"), by button, typing or voice. ${approval}`} />
      <RoutinesPage routines={routines} runs={runs} open={open} tab={tab === "approve" ? "approve" : "mine"} viewerId={viewer.id} />
    </div>
  );
}
