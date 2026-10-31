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
import { AttTabs, CorrectionsPanel, Kiosks, MyAttendance, ReviewPanel, Setup, TeamBoard, Timesheets } from "@/components/app/attendance/attendance-ui";
import { canCapture, captureConfig, captureStatus, checkinView, flaggedEvents, listDevices } from "@/server/attendance-capture";
import { CaptureSetup } from "@/components/app/attendance/capture-ui";
import { DevicesPanel, FlaggedPanel, LeadCheckin } from "@/components/app/attendance/capture-review";
import { CheckinPad } from "@/components/app/attendance/checkin-pad";
import { appOrigin } from "@/server/password-reset";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Attendance" };

// Everyone's own attendance; the daily board and day records for team leads; corrections; timesheets; and HR's
// review, rules, badges and kiosks.
export default async function AttendancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const tz = (await getSettings()).workspace.timezone;
  const today = localParts(new Date().toISOString(), tz).date;
  const hr = managesAttendance(viewer);
  const admin = canCapture(viewer);
  const cap = await captureConfig();
  const [team, me, inbox, corr] = await Promise.all([teamIds(viewer), myEmployeeId(viewer), attendanceInbox(viewer), corrections(viewer)]);
  const lead = hr || team.length > 0;
  const tabs = [
    ...(me ? [{ key: "me", label: "Me" }] : []),
    ...(lead ? [{ key: "team", label: hr ? "Daily board" : "My team" }] : []),
    ...(lead || corr.toDecide.length ? [{ key: "corrections", label: "Corrections", badge: corr.toDecide.length }] : []),
    ...(lead ? [{ key: "timesheets", label: "Timesheets" }] : []),
    ...(hr ? [{ key: "review", label: "Review", badge: inbox?.review }, { key: "setup", label: "Rules" }] : []),
    ...(admin ? [{ key: "capture", label: "Capture" }] : []),
  ];
  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : (tabs[0]?.key ?? "me");
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") && sp.day! <= today ? sp.day! : today;

  let panel: React.ReactNode;
  if (!tabs.length)
    panel = <EmptyState title="You do not have an HR record yet" description="HR adds records for everyone. Once yours is there, you check in and out here or at the kiosk." />;
  else if (tab === "me") {
    const data = await myAttendance(viewer, month);
    // On the office network (or with QR on), the same one-tap buttons as the poster page.
    const pad = me && (cap.methods.network || cap.methods.qr) ? await checkinView(viewer, {}).catch(() => null) : null;
    panel = (
      <div className="space-y-4">
        {pad && (pad.here.ok || cap.methods.network) && (
          <Card>
            <CardHeader>
              <CardTitle>Check in</CardTitle>
              <CardDescription>{pad.here.ok ? `At ${pad.here.site?.name}.` : "On the office Wi-Fi, or scan the poster at the entrance."}</CardDescription>
            </CardHeader>
            <CardContent>
              <CheckinPad initial={pad} compact />
            </CardContent>
          </Card>
        )}
        <MyAttendance data={data} month={month} today={today} />
      </div>
    );
  } else if (tab === "team") {
    const board = await dailyBoard(viewer, day);
    panel = (
      <div className="space-y-3">
        {cap.methods.leadScan && (
          <div className="flex justify-end">
            <LeadCheckin people={board.rows.filter((r) => r.employeeId !== me).map((r) => ({ id: r.employeeId, name: r.name }))} />
          </div>
        )}
        <TeamBoard board={board} today={today} canManage={hr} myId={me} />
      </div>
    );
  }
  else if (tab === "corrections") panel = <CorrectionsPanel toDecide={corr.toDecide} recent={corr.recent} canManage={hr} />;
  else if (tab === "timesheets") panel = <Timesheets rows={await timesheets(viewer, month)} month={month} />;
  else if (tab === "review")
    panel = (
      <div className="space-y-4">
        <FlaggedPanel rows={await flaggedEvents(viewer)} tz={tz} />
        <ReviewPanel rows={await reviewQueue(viewer)} />
        <DevicesPanel rows={await listDevices(viewer)} tz={tz} />
      </div>
    );
  else if (tab === "setup") {
    const [cfg, people] = await Promise.all([attendanceConfig(), peopleSetup(viewer)]);
    panel = <Setup cfg={cfg} people={people} />;
  } else if (tab === "capture") {
    const [cfg, status, kiosks, origin] = await Promise.all([attendanceConfig(), captureStatus(viewer), listKiosks(viewer), appOrigin()]);
    panel = (
      <div className="space-y-4">
        <CaptureSetup att={cfg} cap={cap} status={status} origin={origin} />
        <Kiosks kiosks={kiosks} />
      </div>
    );
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
