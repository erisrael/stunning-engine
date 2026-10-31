import { cookies } from "next/headers";
import { KIOSK_COOKIE, kioskFromToken } from "@/server/attendance";
import { KioskScreen } from "@/components/app/attendance/kiosk";

export const metadata = { title: "Attendance kiosk" };

// The kiosk at the entrance. The device holds the kiosk's own token, not a person's sign-in.
export default async function KioskPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const kiosk = await kioskFromToken((await cookies()).get(KIOSK_COOKIE)?.value);
  if (kiosk) return <KioskScreen initialName={kiosk.name} />;
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">This device is not a kiosk yet</h1>
        <p className="text-muted-foreground">
          {error === "setup" ? "That setup link has expired or was already used. " : ""}
          HR makes a kiosk in Attendance, Setup, Kiosks, and gives you a one-time setup link. Open it on this device and it becomes the kiosk.
        </p>
      </div>
    </main>
  );
}
