import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { getSettings } from "@/server/settings";
import { teamOverview } from "@/server/team-flow";
import { PageHeader } from "@/components/app/primitives";
import { TeamOverview } from "@/components/app/team-overview";
import { STAGE_LABELS, type Stage } from "@/lib/domain";

export const metadata = { title: "Team overview" };

// A production team's overview for its members and lead: what the whole team has done, what is open, sent back to
// redo or waiting, and who is on what. Read only. Recording members have it by default (Roles and permissions).
export default async function TeamOverviewPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const viewer = await requireViewer();
  const TEAMS = ["recording", "editing", "uploading"] as const;
  const sp = await searchParams;
  const fromRole = (TEAMS as readonly string[]).includes(viewer.activeRole) ? (viewer.activeRole as Stage) : null;
  // Managers may open any team's; everyone else their own team's.
  const stage = (sp.stage && (TEAMS as readonly string[]).includes(sp.stage) && (can(viewer, "work.override") || viewer.leads.includes(sp.stage as Stage)) ? sp.stage : fromRole ?? viewer.leads.find((l) => (TEAMS as readonly string[]).includes(l))) as Stage | undefined;
  if (!stage || !can(viewer, "team.overview")) redirect("/dashboard?denied=permission");
  const tz = (await getSettings()).workspace.timezone;
  return (
    <div className="space-y-4">
      <PageHeader title={`${STAGE_LABELS[stage]} team overview`} description="What the whole team has done, what is open, sent back to redo or waiting, and who is on what. Read only." />
      <TeamOverview data={await teamOverview(viewer, stage)} tz={tz} links={can(viewer, "items.detail")} />
    </div>
  );
}
