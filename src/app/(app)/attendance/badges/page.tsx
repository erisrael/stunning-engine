import QRCode from "qrcode";
import { requireCapability } from "@/server/auth";
import { badgesFor } from "@/server/attendance";
import { getSettings } from "@/server/settings";
import { PrintButton } from "@/components/app/finance/print-button";

export const metadata = { title: "Badges" };

// Printable badges: name, number and a QR code the kiosk scans. Cut out along the border.
export default async function BadgesPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const viewer = await requireCapability("attendance.manage");
  const ids = ((await searchParams).ids ?? "").split(",").filter(Boolean).slice(0, 500);
  const [people, s] = await Promise.all([badgesFor(viewer, ids), getSettings()]);
  const cards = await Promise.all(people.map(async (p) => ({ ...p, qr: p.badge ? await QRCode.toDataURL(p.badge, { margin: 1, width: 220 }) : null })));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-semibold">Badges</h1>
        <p className="text-sm text-muted-foreground">{cards.filter((c) => !c.qr).length ? "People without a badge are skipped; make new badges first." : `${cards.length} to print.`}</p>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 print:grid-cols-3">
        {cards
          .filter((c) => c.qr)
          .map((c) => (
            <div key={c.id} className="flex break-inside-avoid flex-col items-center gap-2 rounded-xl border-2 border-dashed p-4 text-center">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{s.workspace.name}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.qr!} alt={`Badge code for ${c.full_name}`} className="size-36 bg-white p-1" />
              <p className="text-lg leading-tight font-semibold">{c.full_name}</p>
              <p className="text-sm text-muted-foreground">{c.job_title ?? ""}</p>
              <p className="font-mono text-sm">{c.code}</p>
            </div>
          ))}
      </div>
    </div>
  );
}
