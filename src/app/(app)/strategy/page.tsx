import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { listPlans, managesStrategy, planView } from "@/server/strategy";
import { MEASURES } from "@/server/measures";
import { userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { StrategyClient } from "@/components/app/strategy/strategy-client";

export const metadata = { title: "Strategy and M&E" };

// Strategic planning, monitoring and evaluation (Phase 25).
export default async function StrategyPage({ searchParams }: { searchParams: Promise<{ plan?: string; tab?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const plans = await listPlans(viewer).catch(() => null);
  if (!plans) redirect("/dashboard?denied=permission");
  const id = plans.find((p) => p.id === sp.plan)?.id ?? plans[0]?.id ?? null;
  const view = id ? await planView(viewer, id) : null;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Strategy and M&E"
        description="The strategic plan as a results framework (goal, outcomes, outputs, activities), indicators with baselines and targets, results each period rated Red, Amber or Green, risks, evaluations by the OECD-DAC criteria, and the documents."
      />
      <StrategyClient
        plans={plans.map((p) => ({ id: p.id, name: p.name, status: p.status }))}
        view={view}
        tab={sp.tab ?? "overview"}
        canManage={managesStrategy(viewer)}
        people={(await userDirectory()).map((u) => ({ id: u.id, name: u.name }))}
        measures={MEASURES.map((m) => ({ key: m.key, name: m.name, unit: m.unit, area: m.area }))}
      />
    </div>
  );
}
