import { sharedSite } from "@/server/attendance-capture";
import { AuthShell } from "../../login/auth-shell";
import { SharedCheckin } from "./shared-checkin";

// Depends on who is asking and from which network, so never prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "Check-in for others" };

// A computer already at the office (reception, a lead's laptop) used as a kiosk: the person types their number and
// PIN. Works only on the office network, and is not signed in as them.
export default async function SharedPage() {
  const s = await sharedSite();
  return (
    <AuthShell title="Check-in for others" subtitle={s.ok ? s.site.name : undefined}>
      {s.ok ? <SharedCheckin /> : <p className="text-center text-sm text-muted-foreground">{s.reason}</p>}
    </AuthShell>
  );
}
