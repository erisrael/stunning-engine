import { cookies } from "next/headers";
import { KIOSK_COOKIE, kioskFromToken } from "@/server/attendance";
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
  const { error } = await searchParams;
  return <KioskPairing initialError={error} />;
}
