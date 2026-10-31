import { redirect } from "next/navigation";
import { getViewer } from "@/server/auth";
import { checkinView } from "@/server/attendance-capture";
import { WorkflowError } from "@/server/workflow";
import { AuthShell } from "../login/auth-shell";
import { CheckinPad } from "@/components/app/attendance/checkin-pad";

// Depends on who is asking and from which network, so never prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Check in" };

// The page the printed QR opens (with ?c=<site code>), and the short address people type when they cannot scan.
// After the first sign-in the phone stays signed in, so it is one tap.
export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
  const code = c && /^[\w-]+\.[\w-]+$/.test(c) ? c : null;
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent(code ? `/in?c=${code}` : "/in")}`);
  let body: React.ReactNode;
  try {
    body = <CheckinPad initial={await checkinView(viewer, { code })} code={code} />;
  } catch (e) {
    body = <p className="text-center text-sm text-muted-foreground">{e instanceof WorkflowError ? e.message : "Check-in is not available right now."}</p>;
  }
  return (
    <AuthShell title="Attendance">
      {body}
      <p className="mt-6 text-center text-xs text-muted-foreground">
        <a href="/attendance" className="text-primary hover:underline">
          My attendance
        </a>
        {" · "}
        <a href="/dashboard" className="text-primary hover:underline">
          Open the app
        </a>
      </p>
    </AuthShell>
  );
}
