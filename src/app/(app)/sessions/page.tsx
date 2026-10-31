import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { can } from "@/server/users";
import { canPlanSessions, recordingStaff, sessionCandidates, sessionWeek, weekStartOf } from "@/server/sessions";
import { localDate } from "@/lib/format";
import { nowIso } from "@/server/db";
import { PageHeader } from "@/components/app/primitives";
import { SessionPlanner } from "@/components/app/sessions-planner";

export const metadata = { title: "Studio sessions" };

// The Recording lead's week of studio sessions: book, move, cancel; operators see and close their own.
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await requireViewer();
  if (!canPlanSessions(viewer) && !can(viewer, "team.view") && !viewer.roles.includes("recording")) redirect("/dashboard?denied=permission");
  const s = await getSettings();
  const today = localDate(nowIso(), s.workspace.timezone);
  const sp = await searchParams;
  const week = weekStartOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today, s.workspace.weekStartsOn);
  const plan = canPlanSessions(viewer);
  const [data, staff, candidates] = await Promise.all([sessionWeek(viewer, week), recordingStaff(), plan ? sessionCandidates(viewer) : Promise.resolve([])]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio sessions"
        description={plan ? "Book the studio, the camera operator and the presenter for the parts to record. The operator is told and sees the session on their Home." : "Your studio sessions. Mark one recorded when it is done."}
      />
      <SessionPlanner week={week} today={today} tz={data.tz} bookings={data.bookings} studios={data.studios} staff={staff} candidates={candidates} canPlan={plan} me={viewer.id} />
    </div>
  );
}
