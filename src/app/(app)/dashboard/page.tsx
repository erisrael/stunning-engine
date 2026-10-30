import Link from "next/link";
import { CalendarClockIcon, FilePlus2Icon, UploadIcon } from "lucide-react";
import { requireViewer } from "@/server/auth";
import { dashboardData } from "@/server/dashboard";
import { filterOptions } from "@/server/view-data";
import { toWorkRows, userNames } from "@/server/rows";
import { all, nowIso, placeholders } from "@/server/db";
import { getSettings } from "@/server/settings";
import { scopeSql } from "@/server/users";
import { parseFilters } from "@/lib/filters";
import { ROLE_LABELS, STAGE_LABELS, type Stage } from "@/lib/domain";
import { fmtDateTime, fmtShortDate, fmtTime, tzLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { PageHeader, MetricCard, EmptyState } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { Worklist } from "@/components/app/worklist";
import { BarsChart, ChartFrame } from "@/components/app/charts";
import { CAT, SEQ } from "@/lib/chart-colors";
import { AttentionList, CustomizeDashboard, SessionBanner } from "./widgets";
import { ManagerHome } from "./manager-home";
import { PageImport } from "@/components/app/page-import";
import { DASHBOARD_PANELS as PANELS } from "@/lib/panels";
import { redirect } from "next/navigation";
import { can, isLeadOf } from "@/server/users";
import { leadDesk, myWork } from "@/server/team-flow";
import { LeadDesk, MyBoard } from "@/components/app/team-flow";

export const metadata = { title: "Dashboard" };

const ROLE_COPY: Record<string, { title: string; description: string; empty: string }> = {
  recording: { title: "Recording", description: "Today's sessions, your recording queue, missing raw files and reshoot requests.", empty: "No recording work assigned to you." },
  editing: { title: "Editing", description: "Accepted raw footage, your editing queue, current work and correction requests.", empty: "No editing work waiting for you." },
  uploading: { title: "Uploading", description: "Approved masters, upload queue, failed transfers and processing checks.", empty: "No uploads waiting for you." },
  publication: { title: "Publication", description: "Lessons ready for review, approvals, the release calendar and release failures.", empty: "Nothing waiting for review or release." },
  manager: { title: "Organization overview", description: "Delivery health across stages, overdue work, blockers, unanswered questions and capacity signals.", empty: "No exceptions right now." },
};

// A plain boolean (not a type guard), so later code keeps the full role type.
const managerView = (role: string): boolean => role === "manager";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer();
  // People only in Dev, Studio or Marketing (or owners only) start in their own section, not the production home.
  if (!viewer.roles.some((r) => ["recording", "editing", "uploading", "publication", "manager", "admin"].includes(r))) {
    const home = can(viewer, "owners.view") ? "/owners" : can(viewer, "dev.access") ? "/dev" : can(viewer, "studio.access") ? "/studio" : can(viewer, "marketing.access") ? "/marketing" : null;
    if (home) redirect(home);
  }
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const now = nowIso();
  const s = await getSettings();
  const tz = s.workspace.timezone;
  // Admins see the organization overview.
  const role = viewer.activeRole === "admin" ? "manager" : viewer.activeRole;
  // Someone viewing as a department role (or as an owner) starts in that section; Home is the production dashboard.
  const SECTION: Partial<Record<string, string>> = { owner: "/company", developer: "/dev", content: "/studio", marketing: "/marketing", hr_manager: "/hr", hr_officer: "/hr" };
  if (!ROLE_COPY[role] && SECTION[role]) redirect(SECTION[role]!);
  if (managerView(role)) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    return <ManagerHome viewer={viewer} timezone={tz} greeting={hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"} />;
  }
  // Recording, Editing and Uploading: team members get their own board; team leads their desk, then their own work.
  const team = (["recording", "editing", "uploading"] as string[]).includes(role) ? (role as "recording" | "editing" | "uploading") : null;
  if (team) {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    const greeting = `${hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, ${viewer.name.split(" ")[0]}`;
    const [desk, mine] = await Promise.all([isLeadOf(viewer, team) ? leadDesk(viewer, team) : Promise.resolve(null), myWork(viewer)]);
    const own = mine.items.filter((i) => i.stage === team);
    return (
      <div className="space-y-6">
        <PageHeader help={desk ? "lead" : "member"} explainer={desk ? "lead-desk" : "my-board"} eyebrow={`${STAGE_LABELS[team]}${desk ? " team lead" : ""}`} title={greeting} description={desk ? "Approve what your team sends, hand it over to the next team, accept what arrives and assign it." : "Your work. Start it, fill in what it needs on the card, mark it done, and send it to your team lead."} />
        {desk && <LeadDesk data={desk} />}
        {(!desk || own.length > 0) && <MyBoard items={own} title={desk ? "My own work" : "My work"} />}
      </div>
    );
  }
  const data = await dashboardData(viewer, role, filters, now);
  const options = await filterOptions(viewer, "/dashboard");
  const users = await userNames();
  const copy = ROLE_COPY[role];

  const cardKeys = data.metrics.map((m) => m.key);
  const savedCards = viewer.prefs.dashboardCards?.[role];
  const visibleCards = savedCards?.length ? savedCards.filter((k) => cardKeys.includes(k)) : cardKeys.slice(0, 6);
  const savedPanels = viewer.prefs.dashboardPanels?.[role];
  const visiblePanels = savedPanels?.length ? savedPanels : PANELS.map((p) => p.key).filter((k) => k !== "backlog" || role === "manager");
  const show = (k: string) => visiblePanels.includes(k);

  // Upcoming schedule: recording sessions for recorders and managers, releases for publication.
  const sc = scopeSql(viewer, "i");
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString();
  const sessions =
    role === "recording" || role === "manager"
      ? await all<{ id: string; item_id: string; code: string; title: string; scheduled_start: string; duration_min: number; presenter: string | null; location: string | null }>(
                    `SELECT rs.id, rs.item_id, i.code, i.title, rs.scheduled_start, rs.duration_min, rs.presenter, rs.location FROM recording_sessions rs JOIN items i ON i.id = rs.item_id
           WHERE rs.status = 'scheduled' AND rs.scheduled_start >= ? AND rs.scheduled_start <= ? AND ${sc.sql} ORDER BY rs.scheduled_start LIMIT 8`,
                    new Date(Date.now() - 2 * 3600e3).toISOString(),
                    weekAhead,
                    ...sc.params,
                  )
      : [];
  const releases =
    role === "publication" || role === "manager" || role === "uploading"
      ? await all<{ id: string; code: string; title: string; scheduled_publish_at: string; substate: string | null }>(
                    `SELECT i.id, i.code, i.title, i.scheduled_publish_at, i.substate FROM items i WHERE i.lifecycle = 'in_production' AND i.scheduled_publish_at IS NOT NULL
           AND i.scheduled_publish_at <= ? AND ${sc.sql} ORDER BY i.scheduled_publish_at LIMIT 8`,
                    weekAhead,
                    ...sc.params,
                  )
      : [];
  const failures =
    role === "uploading"
      ? await all<{ item_id: string; code: string; platform: string; failure_reason: string | null }>(
                    `SELECT t.item_id, i.code, t.platform, t.failure_reason FROM publication_targets t JOIN items i ON i.id = t.item_id
           WHERE t.upload_status = 'failed' AND i.lifecycle = 'in_production' AND ${sc.sql} LIMIT 6`,
                    ...sc.params,
                  )
      : [];
  const reworkIds = data.worklist.filter((r) => r.rework_count > 0).map((r) => r.id);
  const returned = reworkIds.length
    ? await all<{ item_id: string; cause_note: string | null }>(
              `SELECT item_id, cause_note FROM stage_attempts WHERE cause <> 'initial' AND status NOT IN ('completed','returned','superseded') AND item_id IN (${placeholders(reworkIds.length)})`,
              ...reworkIds,
            )
    : [];

  const stage = role === "manager" ? null : (role as Stage);
  const firstName = viewer.name.split(" ")[0];
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow={`${ROLE_LABELS[role]} dashboard`}
        title={`${greeting}, ${firstName}`}
        description={copy.description}
        actions={
          <>
            <CustomizeDashboard role={role} cards={data.metrics.map((m) => ({ key: m.key, label: m.label }))} visibleCards={visibleCards} visiblePanels={visiblePanels} />
            {role === "manager" && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/import-export">
                    <UploadIcon /> Import plan
                  </Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/items/new">
                    <FilePlus2Icon /> New item
                  </Link>
                </Button>
              </>
            )}
            {stage && <PageImport viewer={viewer} page="work" label="Import my work" only={[`${stage}_progress`]} />}
            {stage && (
              <Button size="sm" variant="outline" asChild>
                <Link href={`/sheet?preset=${stage}`}>Open {STAGE_LABELS[stage]} sheet</Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar options={options} showViews={false} hideKeys={["stage", "status", "owner"]} note={`Times in ${tzLabel(tz)}`} />
      <SessionBanner sessions={data.mySessions} staleHours={data.staleHours} tz={tz} autoReview={sp.review === "sessions"} />
      {sp.denied && <p className="rounded-lg border bg-[var(--st-paused-bg)] p-3 text-sm text-[var(--st-paused-fg)]">That page is limited to managers. You were returned to your dashboard.</p>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {data.metrics
          .filter((m) => visibleCards.includes(m.key))
          .map((m) => (
            <MetricCard key={m.key} label={m.label} value={m.value} hint={m.hint} href={m.href} tone={m.tone} definition={m.definition} trend={m.trend} />
          ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {show("worklist") && (
            <Card className="gap-3">
              <CardHeader>
                <CardTitle>{stage ? `My ${STAGE_LABELS[stage].toLowerCase()} work` : "Exceptions to act on"}</CardTitle>
                <CardDescription>
                  {stage
                    ? "Active and blocked work first, then incoming handoffs, then by priority and due date."
                    : "Blocked, overdue, waiting, unassigned or questioned items across all stages."}
                </CardDescription>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={stage ? `/content?stage=${stage}&owner=me,unassigned` : "/content?flags=overdue"}>View all</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <Worklist rows={await toWorkRows(data.worklist, viewer.id)} viewer={{ id: viewer.id, roles: viewer.roles, leads: viewer.leads, perms: viewer.perms }} users={users} tz={tz} limit={12} now={Date.now()} empty={{ title: copy.empty }} />
                {data.worklist.length > 12 && <p className="mt-2 text-xs text-muted-foreground">Showing 12 of {data.worklist.length}. Use View all for the full list.</p>}
              </CardContent>
            </Card>
          )}
          {show("trend") && (
            <ChartFrame
              title={stage ? `${STAGE_LABELS[stage]} arrivals and accepted completions` : "Arrivals, completions and publications"}
              description="Last 8 complete weeks plus the current week. Completions count accepted attempts; publications count unique items."
              table={{
                columns: ["Week starting", "Arrivals", "Accepted completions", ...(stage ? [] : ["Published"])],
                rows: data.trend.map((t) => [t.week, t.arrivals, t.completed, ...(stage ? [] : [t.published])]),
              }}
            >
              <BarsChart
                data={data.trend}
                xKey="label"
                series={[
                  { key: "arrivals", label: "Arrivals", color: CAT[1] },
                  { key: "completed", label: "Accepted completions", color: CAT[0] },
                  ...(stage ? [] : [{ key: "published", label: "Published", color: CAT[2] }]),
                ]}
              />
            </ChartFrame>
          )}
          {show("backlog") && role === "manager" && (
            <ChartFrame
              title="Where work is accumulating"
              description={`Open items per stage by age in stage: up to ${data.bands[0]} days, ${data.bands[0]}-${data.bands[1]}, ${data.bands[1]}-${data.bands[2]}, over ${data.bands[2]} days.`}
              table={{ columns: ["Stage", "Fresh", "Recent", "Aging", "Old", "Total"], rows: data.backlog.map((b) => [b.stage, b.fresh, b.recent, b.aging, b.old, b.total]) }}
            >
              <BarsChart
                data={data.backlog}
                xKey="stage"
                stacked
                horizontal
                height={200}
                series={[
                  { key: "fresh", label: `0-${data.bands[0]} days`, color: SEQ[0] },
                  { key: "recent", label: `${data.bands[0]}-${data.bands[1]} days`, color: SEQ[1] },
                  { key: "aging", label: `${data.bands[1]}-${data.bands[2]} days`, color: SEQ[2] },
                  { key: "old", label: `Over ${data.bands[2]} days`, color: SEQ[3] },
                ]}
              />
            </ChartFrame>
          )}
        </div>
        <div className="space-y-4">
          {show("attention") && (
            <Card className="gap-2">
              <CardHeader>
                <CardTitle>Needs attention</CardTitle>
                <CardDescription>Select an entry to open the underlying records.</CardDescription>
              </CardHeader>
              <CardContent>
                <AttentionList items={data.attention} />
              </CardContent>
            </Card>
          )}
          {show("upcoming") && (sessions.length > 0 || releases.length > 0 || failures.length > 0 || returned.length > 0 || role === "recording" || role === "publication") && (
            <Card className="gap-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CalendarClockIcon className="size-4" /> {role === "recording" ? "Upcoming sessions" : role === "uploading" ? "Failures and releases" : "Next 7 days"}
                </CardTitle>
                <CardAction>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href="/calendar">Calendar</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="space-y-3">
                {failures.map((f) => (
                  <Link key={`${f.item_id}-${f.platform}`} href={`/items/${f.item_id}`} className="block rounded-lg border border-[var(--st-failed-fg)]/30 bg-[var(--st-failed-bg)] p-2 text-xs text-[var(--st-failed-fg)]">
                    <span className="font-medium">{f.code}</span> failed on {f.platform}: {f.failure_reason ?? "no reason recorded"}
                  </Link>
                ))}
                {returned.map((r) => (
                  <Link key={r.item_id} href={`/items/${r.item_id}`} className="block rounded-lg border p-2 text-xs">
                    <span className="font-medium">Correction requested:</span> {r.cause_note}
                  </Link>
                ))}
                {sessions.length > 0 && (
                  <ul className="space-y-1.5">
                    {sessions.map((x) => (
                      <li key={x.id}>
                        <Link href={`/items/${x.item_id}`} className="flex gap-3 rounded-lg p-1.5 hover:bg-muted/60">
                          <span className="w-14 shrink-0 text-xs leading-tight tabular">
                            <span className="block font-medium">{fmtShortDate(x.scheduled_start, tz)}</span>
                            <span className="text-muted-foreground">{fmtTime(x.scheduled_start, tz)}</span>
                          </span>
                          <span className="min-w-0 text-xs">
                            <span className="block truncate font-medium">{x.title}</span>
                            <span className="block truncate text-muted-foreground">
                              {x.presenter ?? "Presenter TBC"} / {x.location ?? "Studio TBC"} / {x.duration_min} min
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {releases.length > 0 && (
                  <ul className="space-y-1.5">
                    {releases.map((x) => (
                      <li key={x.id}>
                        <Link href={`/items/${x.id}`} className="flex items-center justify-between gap-2 rounded-lg p-1.5 text-xs hover:bg-muted/60">
                          <span className="min-w-0 truncate">
                            <span className="font-medium">{x.code}</span> {x.title}
                          </span>
                          <span className="shrink-0 text-muted-foreground tabular">{fmtDateTime(x.scheduled_publish_at, tz)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {!sessions.length && !releases.length && !failures.length && !returned.length && <EmptyState title="Nothing scheduled this week" />}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
