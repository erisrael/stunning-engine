import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { can } from "@/server/users";
import { canPlanSessions, recordingStaff, sessionCandidates, sessionsConfig, sessionTable, sessionWeek, weekStartOf } from "@/server/sessions";
import { userDirectory } from "@/server/users";
import { SessionsManagers } from "./managers";
import { localDate } from "@/lib/format";
import { nowIso } from "@/server/db";
import { handoverConfig } from "@/server/handover-config";
import { PageHeader } from "@/components/app/primitives";
import { SessionPlanner } from "@/components/app/sessions-planner";
import { SessionsTable } from "@/components/app/sessions-table";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = { title: "Studio sessions" };

// The Recording lead's week of studio sessions: book, move, cancel; operators see and close their own.
export default async function SessionsPage({ searchParams }: { searchParams: Promise<{ week?: string; view?: string; from?: string; to?: string }> }) {
  const viewer = await requireViewer();
  const plan = await canPlanSessions(viewer);
  if (!plan && !can(viewer, "team.view") && !viewer.roles.includes("recording")) redirect("/dashboard?denied=permission");
  const booking = (await handoverConfig()).studioBooking;
  if (booking === "off") redirect("/dashboard?denied=permission");
  const s = await getSettings();
  const today = localDate(nowIso(), s.workspace.timezone);
  const sp = await searchParams;
  const week = weekStartOf(/^\d{4}-\d{2}-\d{2}$/.test(sp.week ?? "") ? sp.week! : today, s.workspace.weekStartsOn);
  const table = sp.view === "table";
  const day = (v: string | undefined, fb: string) => (/^d{4}-d{2}-d{2}$/.test(v ?? "") ? v! : fb);
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const from = day(sp.from, shift(today, -30));
  const until = day(sp.to, shift(today, 60));
  const [data, staff, candidates, rows] = await Promise.all([
    sessionWeek(viewer, week),
    recordingStaff(),
    plan ? sessionCandidates(viewer) : Promise.resolve([]),
    table ? sessionTable(viewer, from <= until ? from : until, from <= until ? until : from) : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader
        title="Studio sessions"
        description={`${plan ? "Book the studio, the camera operator and the presenter for the parts to record. The operator is told and sees the session on their Home. The academic manager runs this page." : "Your studio sessions. Mark one recorded when it is done."} ${booking === "required" ? "A part needs a session before recording starts." : "Booking is optional: a part can be recorded without one."}`}
      />
      {(can(viewer, "users.manage") || can(viewer, "settings.manage")) && <SessionsManagers config={await sessionsConfig()} people={(await userDirectory()).map((u) => ({ id: u.id, name: u.name }))} />}
      <div className="flex gap-1" role="radiogroup" aria-label="Sessions as">
        {[
          ["week", "Week", `/sessions?week=${week}`],
          ["table", "Table, import and export", "/sessions?view=table"],
        ].map(([k, label, href]) => (
          <Link key={k} role="radio" aria-checked={(k === "table") === table} href={href!} className={cn("rounded-md border px-2.5 py-1 text-xs", (k === "table") === table ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")}>
            {label}
          </Link>
        ))}
      </div>
      {table ? (
        <SessionsTable rows={rows} from={from} until={until} today={today} tz={data.tz} studios={data.studios} staff={staff} candidates={candidates} canPlan={plan} me={viewer.id} />
      ) : (
      <SessionPlanner week={week} today={today} tz={data.tz} bookings={data.bookings} studios={data.studios} staff={staff} candidates={candidates} canPlan={plan} me={viewer.id} />
      )}
    </div>
  );
}
