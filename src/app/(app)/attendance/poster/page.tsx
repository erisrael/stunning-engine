import QRCode from "qrcode";
import { requireCapability } from "@/server/auth";
import { captureConfig, posterCode } from "@/server/attendance-capture";
import { appOrigin } from "@/server/password-reset";
import { getSettings } from "@/server/settings";
import { PrintButton } from "@/components/app/finance/print-button";

// Depends on who is asking and from which network, so never prerendered.
export const dynamic = "force-dynamic";

export const metadata = { title: "QR poster" };

// A printable A4 poster for the entrance: the QR code, the site, the short address to type, and three lines.
export default async function PosterPage({ searchParams }: { searchParams: Promise<{ site?: string }> }) {
  await requireCapability("attendance.capture");
  const { site: id } = await searchParams;
  const [c, s, origin] = await Promise.all([captureConfig(), getSettings(), appOrigin()]);
  const site = c.sites.find((x) => x.id === id) ?? c.sites[0];
  if (!site) return <p className="text-sm text-muted-foreground">Add a site in Attendance, Capture first.</p>;
  const url = `${origin}/in?c=${posterCode(site)}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: "M" });
  const short = `${origin.replace(/^https?:\/\//, "")}/in`;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-semibold">QR poster: {site.name}</h1>
        <p className="text-sm text-muted-foreground">Print on A4 and put it up at the entrance. Making a new code (Attendance, Capture) stops old prints working.</p>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>
      <div className="mx-auto flex aspect-[210/297] w-full max-w-[640px] flex-col items-center justify-between rounded-xl border bg-white p-10 text-center text-black print:max-w-none print:border-0" data-testid="poster">
        <div>
          <p className="text-sm font-semibold tracking-widest uppercase">{s.workspace.name}</p>
          <h2 className="mt-2 text-4xl font-bold">Check in and out here</h2>
          <p className="mt-1 text-xl">{site.name}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt={`QR code for checking in at ${site.name}`} className="w-3/4 max-w-[380px]" data-url={url} />
        <ol className="space-y-1 text-left text-lg">
          <li>1. Connect your phone to the office Wi-Fi.</li>
          <li>2. Scan this code with the camera (or open {short}).</li>
          <li>3. Tap Check in, Break, Lunch or Check out.</li>
        </ol>
        <p className="text-sm">
          No smartphone? Use the office computer at <b>{short}/shared</b> with your number and PIN, or ask your team lead.
        </p>
      </div>
    </div>
  );
}
