import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { myEmployeeId } from "@/server/hr";
import {
  attendanceConfig,
  attendanceInbox,
  corrections,
  dailyBoard,
  listKiosks,
  managesAttendance,
  myAttendance,
  peopleSetup,
  reviewQueue,
  teamIds,
  timesheets,
} from "@/server/attendance";
import { localParts } from "@/lib/attendance";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { AttTabs, CorrectionsPanel, MyAttendance, ReviewPanel, Setup, TeamBoard, Timesheets } from "@/components/app/attendance/attendance-ui";

export const metadata = { title: "Attendance" };

// Everyone's own attendance; the daily board and day records for team leads; corrections; timesheets; and HR's
// review, rules, badges and kiosks.
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const tz = (await getSettings()).workspace.timezone;
  const today = localParts(new Date().toISOString(), tz).date;
  const hr = managesAttendance(viewer);
  const [team, me, inbox, corr] = await Promise.all([teamIds(viewer), myEmployeeId(viewer), attendanceInbox(viewer), corrections(viewer)]);
  const lead = hr || team.length > 0;
  const tabs = [
    ...(me ? [{ key: "me", label: "Me" }] : []),
    ...(lead ? [{ key: "team", label: hr ? "Daily board" : "My team" }] : []),
    ...(lead || corr.toDecide.length ? [{ key: "corrections", label: "Corrections", badge: corr.toDecide.length }] : []),
    ...(lead ? [{ key: "timesheets", label: "Timesheets" }] : []),
    ...(hr ? [{ key: "review", label: "Review", badge: inbox?.review }, { key: "setup", label: "Setup" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : (tabs[0]?.key ?? "me");
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") && sp.day! <= today ? sp.day! : today;

  let panel: React.ReactNode;
  if (!tabs.length)
    panel = <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Once yours is there, you check in and out here or at the kiosk." />;
  else if (tab === "me") {
    const data = await myAttendance(viewer, month);
    panel = <MyAttendance data={data} month={month} today={today} />;
  } else if (tab === "team") panel = <TeamBoard board={await dailyBoard(viewer, day)} today={today} canManage={hr} myId={me} />;
  else if (tab === "corrections") panel = <CorrectionsPanel toDecide={corr.toDecide} recent={corr.recent} canManage={hr} />;
  else if (tab === "timesheets") panel = <Timesheets rows={await timesheets(viewer, month)} month={month} />;
  else if (tab === "review") panel = <ReviewPanel rows={await reviewQueue(viewer)} />;
  else if (tab === "setup") {
    const [cfg, people, kiosks] = await Promise.all([attendanceConfig(), peopleSetup(viewer), listKiosks(viewer)]);
    panel = <Setup cfg={cfg} people={people} kiosks={kiosks} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance"
        description={
          lead
            ? "Check-ins from the kiosk and the app, your team's day, corrections and timesheets. When a kiosk is down, record the day by hand; HR reviews it."
            : "Check in when you arrive and out when you leave. A wrong time? Ask for a correction."
        }
      />
      {tabs.length > 1 && <AttTabs tab={tab} tabs={tabs} />}
      {panel}
    </div>
  );
}
