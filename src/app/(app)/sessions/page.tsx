import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { can } from "@/server/users";
import { canPlanSessions, recordingStaff, sessionCandidates, sessionsConfig, sessionWeek, weekStartOf } from "@/server/sessions";
import { userDirectory } from "@/server/users";
import { SessionsManagers } from "./managers";
import { localDate } from "@/lib/format";
import { nowIso } from "@/server/db";
import { handoverConfig } from "@/server/handover-config";
import { PageHeader } from "@/components/app/primitives";
import { SessionPlanner } from "@/components/app/sessions-planner";

export const metadata = { title: "Studio sessions" };

// The Recording lead's week of studio sessions: book, move, cancel; operators see and close their own.
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const viewer = await requireViewer();
  const plan = await canPlanSessions(viewer);
  if (!plan && !can(viewer, "team.view") && !viewer.roles.includes("recording")) redirect("/dashboard?denied=permission");
  const booking = (await handoverConfig()).studioBooking;
  if (booking === "off") redirect("/dashboard?denied=permission");
  const s = await getSettings();
  const today = localDate(nowIso(), s.workspace.timezone);
  const sp = await searchParams;
  const week = weekStartOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today, s.workspace.weekStartsOn);
  const [data, staff, candidates] = await Promise.all([sessionWeek(viewer, week), recordingStaff(), plan ? sessionCandidates(viewer) : Promise.resolve([])]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio sessions"
        description={`${plan ? "Book the studio, the camera operator and the presenter for the parts to record. The operator is told and sees the session on their Home. The academic manager runs this page." : "Your studio sessions. Mark one recorded when it is done."} ${booking === "required" ? "A part needs a session before recording starts." : "Booking is optional: a part can be recorded without one."}`}
      />
      {(can(viewer, "users.manage") || can(viewer, "settings.manage")) && <SessionsManagers config={await sessionsConfig()} people={(await userDirectory()).map((u) => ({ id: u.id, name: u.name }))} />}
      <SessionPlanner week={week} today={today} tz={data.tz} bookings={data.bookings} studios={data.studios} staff={staff} candidates={candidates} canPlan={plan} me={viewer.id} />
    </div>
  );
}
