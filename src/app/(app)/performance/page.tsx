import Link from "next/link";
import { requireViewer } from "@/server/auth";
import * as pf from "@/server/performance";
import { MEASURES } from "@/server/measures";
import { myDepartments } from "@/server/departments";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { CompanyView, Library, MonthPicker, Okrs, Periods, ScorecardView, TeamView } from "@/components/app/performance/perf-ui";
import { WorkflowError } from "@/server/workflow";
import { cn } from "@/lib/utils";

export const metadata = { title: "Performance" };

// Phase 17: my scorecard, my team's, the company's, OKRs, and (HR) the library and periods.
export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const cfg = await pf.perfConfig();
  const lib = pf.managesLibrary(viewer);
  const company = pf.seesCompany(viewer);
  const team = company || (await pf.managedUserIds(viewer)).length > 0;
  if (!cfg.enabled && !lib)
    return (
      <div className="space-y-4">
        <PageHeader title="Performance" description="Scorecards, KPIs and OKRs." />
        <EmptyState title="Performance is switched off" description="HR switches it on in Performance, Periods and settings." />
      </div>
    );
  const tabs = [
    ...(cfg.staffSeeOwn || team ? ["me"] : []),
    ...(team ? ["team"] : []),
    ...(company ? ["company"] : []),
    "okrs",
    ...(lib ? ["library", "periods"] : []),
  ];
  const LABELS: Record<string, string> = { me: "My scorecard", team: "Team", company: "Company", okrs: "OKRs", library: "Library", periods: "Periods and settings" };
  const tab = sp.person ? "person" : tabs.includes(sp.tab ?? "") ? sp.tab! : tabs[0]!;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : await pf.currentPeriod();
  const kpis = await pf.listKpis();

  let panel: React.ReactNode = null;
  try {
    if (tab === "me" || tab === "person") {
      const who = tab === "person" ? sp.person! : viewer.id;
      const s = await pf.myScorecard(viewer, who, period);
      panel = (
        <div className="space-y-3">
          <MonthPicker period={period} base={tab === "person" ? `/performance?person=${who}` : "/performance?tab=me"} />
          <ScorecardView card={s.card} trend={s.trend} canEdit={s.canEdit} kpis={kpis} />
        </div>
      );
    } else if (tab === "team")
      panel = (
        <div className="space-y-3">
          <MonthPicker period={period} base="/performance?tab=team" />
          <TeamView cards={await pf.teamScorecards(viewer, period)} period={period} />
        </div>
      );
    else if (tab === "company")
      panel = (
        <div className="space-y-3">
          <MonthPicker period={period} base="/performance?tab=company" />
          <CompanyView data={await pf.companyScorecard(viewer, period)} />
        </div>
      );
    else if (tab === "okrs") {
      const cycles = await pf.cycles();
      const cycleId = sp.cycle && cycles.some((c) => c.id === sp.cycle) ? sp.cycle : (cycles.find((c) => c.status === "open")?.id ?? cycles[0]?.id ?? null);
      panel = (
        <Okrs
          cycles={cycles}
          cycleId={cycleId}
          tree={cycleId ? await pf.okrTree(viewer, cycleId) : []}
          me={viewer.id}
          departments={(await myDepartments(viewer)).map((d) => ({ key: d.dept, title: d.title }))}
          measures={MEASURES.map((m) => ({ key: m.key, name: m.name }))}
          canCycle={lib || viewer.perms.includes("owners.view")}
        />
      );
    } else if (tab === "library") panel = <Library kpis={kpis} templates={await pf.listTemplates()} measures={MEASURES.map((m) => ({ key: m.key, name: m.name, area: m.area }))} />;
    else if (tab === "periods") panel = <Periods periods={await pf.periods()} pending={await pf.pendingChanges(viewer)} cfg={cfg} current={await pf.currentPeriod()} />;
  } catch (e) {
    if (!(e instanceof WorkflowError)) throw e;
    panel = <EmptyState title="Not available" description={e.message} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Performance" description="Scorecards from the work recorded in the app (KRAs and KPIs, with targets per role), and objectives with key results (OKRs)." />
      <nav className="flex flex-wrap gap-1 border-b" aria-label="Performance">
        {tabs.map((t) => (
          <Link key={t} href={`/performance?tab=${t}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {LABELS[t]}
          </Link>
        ))}
      </nav>
      {panel}
    </div>
  );
}
