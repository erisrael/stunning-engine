import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { capacityData, myEffort } from "@/server/capacity";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { userNames } from "@/server/rows";
import { parseFilters } from "@/lib/filters";
import { ROLE_LABELS, STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";
import { fmtDateTime, fmtDuration, fmtNum, fmtPct } from "@/lib/format";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Meter, MetricCard, PageHeader, UserAvatar } from "@/components/app/primitives";
import { Corrections, LeaveManager, ScenarioPlanner } from "./team-client";
import { PageImport } from "@/components/app/page-import";

export const metadata = { title: "Team and capacity" };

export default async function TeamPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.team");
  const sp = await searchParams;
  // Managers see everyone; team leads see their own team's members; everyone else sees only themselves.
  const manager = viewer.roles.includes("manager");
  const isManager = manager || viewer.leads.length > 0;
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const now = nowIso();
  const data = await capacityData(viewer, parseFilters(sp), now);
  const names = await userNames();
  const tab = typeof sp.tab === "string" ? sp.tab : isManager ? "workload" : "effort";
  const effort = await myEffort(viewer.id, now);
  const effortTotal = effort.reduce((a, e) => a + ((e.ended_at ? new Date(e.ended_at).getTime() : Date.now()) - new Date(e.started_at).getTime()), 0);
  const me = data.team.find((t) => t.id === viewer.id);
  const inMyTeam = (t: { id: string; roles: string[] }) => t.id === viewer.id || viewer.leads.some((st) => t.roles.includes(st));
  const team = manager ? data.team : isManager ? data.team.filter(inMyTeam) : data.team.filter((t) => t.id === viewer.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title={isManager ? "Team and capacity" : "My effort and capacity"}
        description={
          isManager
            ? "Assigned work against available production hours, a demand scenario per stage, leave and timer corrections. No staff rankings are shown."
            : "Your logged work sessions, your open work and your leave. Only you and managers see your effort."
        }
        actions={<PageImport viewer={viewer} page="people" />}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STAGES.map((st) => {
          const x = data.stages.find((y) => y.stage === st)!;
          const weeksToClear = x.completionsPerWeek > 0 ? x.backlog / x.completionsPerWeek : null;
          return (
            <MetricCard
              key={st}
              label={`${STAGE_LABELS[st]} backlog`}
              value={fmtNum(x.backlog)}
              hint={`${fmtNum(x.completionsPerWeek, 1)} done/week, ${fmtNum(x.availableWeek, 0)}h available/week${weeksToClear !== null ? `, about ${fmtNum(weeksToClear, 1)} weeks to clear` : ""}`}
              tone={x.arrivalsPerWeek > x.completionsPerWeek * 1.2 && x.backlog > 3 ? "warning" : "default"}
              href={`/content?stage=${st}`}
              definition={{ definition: "Open items in the stage, recent completion rate, and production hours available from configured capacity after leave. A warning shows when arrivals outpace completions by more than 20 percent.", basis: "Last 4 weeks and next 4 weeks of leave", sample: x.sample }}
            />
          );
        })}
      </div>
      <Tabs defaultValue={tab} className="gap-4">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          {isManager && <TabsTrigger value="workload">Workload</TabsTrigger>}
          {isManager && <TabsTrigger value="scenario">Capacity scenario</TabsTrigger>}
          <TabsTrigger value="effort">My effort</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="corrections">Timer corrections</TabsTrigger>
        </TabsList>
        {isManager && (
          <TabsContent value="workload">
            <Card>
              <CardHeader>
                <CardTitle>Who has room for more work?</CardTitle>
                <CardDescription>Estimated remaining hours on owned open work against available hours over the next four weeks. Utilization uses logged sessions in the last four weeks.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 text-left font-medium">Person</th>
                      <th className="text-left font-medium">Roles</th>
                      <th className="text-right font-medium">Open items</th>
                      <th className="text-right font-medium">Est. remaining</th>
                      <th className="text-right font-medium">Available, 4 weeks</th>
                      <th className="w-40 px-3 text-left font-medium">Load</th>
                      <th className="text-right font-medium">Logged, 4 weeks</th>
                      <th className="text-right font-medium">Leave days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((u) => {
                      const load = u.available4 ? u.remaining / u.available4 : null;
                      return (
                        <tr key={u.id} className="border-b last:border-0">
                          <td className="py-2">
                            <span className="flex items-center gap-2">
                              <UserAvatar name={u.name} />
                              <span>
                                <Link href={`/content?owner=${u.id}`} className="font-medium hover:underline">{u.name}</Link>
                                <span className="block text-xs text-muted-foreground">{u.title}</span>
                              </span>
                            </span>
                          </td>
                          <td className="text-xs">{u.roles.map((r) => ROLE_LABELS[r]).join(", ")}</td>
                          <td className="text-right tabular">
                            {u.owned}
                            {u.blocked > 0 && <span className="block text-[11px] text-[var(--st-blocked-fg)]">{u.blocked} blocked</span>}
                          </td>
                          <td className="text-right tabular">{fmtNum(u.remaining, 1)}h</td>
                          <td className="text-right tabular">{fmtNum(u.available4, 0)}h</td>
                          <td className="px-3">
                            <Meter value={u.remaining} max={u.available4 || 1} tone={load !== null && load > 1 ? "danger" : load !== null && load > 0.8 ? "warning" : "primary"} />
                            <span className="text-[11px] text-muted-foreground">{load === null ? "No capacity set" : fmtPct(load)}</span>
                          </td>
                          <td className="text-right tabular">
                            {fmtNum(u.logged4, 1)}h
                            <span className="block text-[11px] text-muted-foreground">{u.utilization === null ? "" : `${fmtPct(u.utilization)} of capacity`}</span>
                          </td>
                          <td className="text-right tabular">{u.leaveDays}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-muted-foreground">Capacity hours are set per person and stage in Settings, Users and access. Missing effort shows as incomplete, never as zero work.</p>
              </CardContent>
            </Card>
          </TabsContent>
        )}
        {isManager && (
          <TabsContent value="scenario">
            <ScenarioPlanner data={data} />
          </TabsContent>
        )}
        <TabsContent value="effort" className="space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard label="Logged, 4 weeks" value={fmtDuration(effortTotal)} definition={{ definition: "Sum of your work sessions started in the last four weeks." }} />
            <MetricCard label="Sessions" value={fmtNum(effort.length)} definition={{ definition: "Number of start-to-pause intervals you recorded." }} />
            <MetricCard label="Open items you own" value={fmtNum(me?.owned ?? 0)} href="/content?owner=me" definition={{ definition: "Items whose current stage you own." }} />
            <MetricCard label="Weekly capacity" value={me?.weekly ? `${me.weekly}h` : "Not set"} definition={{ definition: "Your production hours per week as configured by a manager." }} />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>My work sessions</CardTitle>
              <CardDescription>Request a correction from the item Workflow tab if a timer was wrong. Originals are always kept.</CardDescription>
            </CardHeader>
            <CardContent>
              {effort.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions in the last four weeks.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {effort.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                      <Link href={`/items/${e.item_id}?tab=workflow`} className="font-mono text-xs text-primary hover:underline">{e.code}</Link>
                      <span className="min-w-0 flex-1 truncate">{e.title}</span>
                      <span className="text-xs text-muted-foreground">{STAGE_LABELS[e.stage as Stage]}</span>
                      <span className="text-xs tabular">{fmtDateTime(e.started_at, tz)}</span>
                      <span className="w-16 text-right text-xs font-medium tabular">{e.ended_at ? fmtDuration(new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) : "running"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="leave">
          <LeaveManager leave={manager ? data.leave : data.leave.filter((l) => team.some((t) => t.id === l.user_id))} users={team.map((t) => ({ id: t.id, name: t.name }))} names={names} viewerId={viewer.id} isManager={isManager} />
        </TabsContent>
        <TabsContent value="corrections">
          <Corrections rows={manager ? data.corrections : data.corrections.filter((c) => team.some((t) => t.id === c.requested_by))} names={names} tz={tz} isManager={isManager} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
