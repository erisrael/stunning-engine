import { cookies } from "next/headers";
import Link from "next/link";
import { KIOSK_COOKIE, kioskFromToken } from "@/server/attendance";
import { getViewer } from "@/server/auth";
import { can } from "@/server/users";
import { KioskScreen } from "@/components/app/attendance/kiosk";
import { KioskPairing } from "@/components/app/attendance/kiosk-pairing";

export const metadata = {
  title: "Attendance Kiosk",
  manifest: "/api/kiosk/manifest",
};

// The kiosk at the entrance or branch. The device holds the kiosk's own token, not a person's sign-in.
export default async function KioskPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const kiosk = await kioskFromToken((await cookies()).get(KIOSK_COOKIE)?.value);
  if (kiosk) return <KioskScreen initialName={kiosk.name} />;
  // Setting up a kiosk is for Admin and HR. A signed-in member or lead who opens the address is told so
  // instead of seeing the pairing screen. A device with no sign-in still pairs with a code from HR or Admin.
  const viewer = await getViewer();
  if (viewer && !can(viewer, "attendance.manage") && !can(viewer, "attendance.capture")) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6">
        <div className="max-w-sm space-y-3 rounded-xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">Kiosk setup is for HR and Admin</h1>
          <p className="text-sm text-muted-foreground">Kiosk stations are set up and paired by HR or Admin. To check in, use the kiosk at your entrance or the Attendance page.</p>
          <Link href="/attendance" className="inline-block text-sm font-medium text-primary underline underline-offset-2">
            Go to Attendance
          </Link>
        </div>
      </main>
    );
  }
  const { error } = await searchParams;
  return <KioskPairing initialError={error} />;
}
