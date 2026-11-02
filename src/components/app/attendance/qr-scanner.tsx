"use client";

// Scanning the entrance QR inside the app (Admin, Attendance setup: "Scan the QR in the app"): the camera opens in
// a dialog, the code is read on the phone (the browser's own reader when it has one, else jsQR), and a code from
// this workspace's poster opens the check-in page with it, where the site's checks run as for any scan.
import * as React from "react";
import { useRouter } from "next/navigation";
import jsQR from "jsqr";
import { Loader2Icon, QrCodeIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// A code from the poster: a link to /in?c=<code> on this site, or the code alone.
export function checkinCodeFrom(text: string, origin: string): string | null {
  const t = text.trim();
  if (/^[\w-]+\.[\w-]+$/.test(t)) return t;
  try {
    const u = new URL(t, origin);
    if (u.origin !== origin || u.pathname !== "/in") return null;
    const c = u.searchParams.get("c");
    return c && /^[\w-]+\.[\w-]+$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

type Detector = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };

export function QrScanButton({ label = "Scan the QR", className }: { label?: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size="lg" variant="outline" className={className} onClick={() => setOpen(true)} data-qr-scan>
        <QrCodeIcon /> {label}
      </Button>
      {open && <QrScanDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function QrScanDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const video = React.useRef<HTMLVideoElement>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(true);
  const [wrong, setWrong] = React.useState(false);
  React.useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const W = window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector };
    const native = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;
    const found = (text: string) => {
      const code = checkinCodeFrom(text, window.location.origin);
      if (!code) return setWrong(true);
      stopped = true;
      onClose();
      router.push(`/in?c=${encodeURIComponent(code)}`);
    };
    const tick = async () => {
      if (stopped) return;
      const v = video.current;
      if (v && v.readyState >= 2 && v.videoWidth) {
        try {
          if (native) {
            const r = await native.detect(v);
            if (r[0]?.rawValue) return found(r[0].rawValue);
          } else if (ctx) {
            canvas.width = v.videoWidth;
            canvas.height = v.videoHeight;
            ctx.drawImage(v, 0, 0);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const r = jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" });
            if (r?.data) return found(r.data);
          }
        } catch {}
      }
      raf = window.setTimeout(() => void tick(), 180) as unknown as number;
    };
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        if (video.current) {
          video.current.srcObject = stream;
          await video.current.play().catch(() => {});
        }
        setStarting(false);
        void tick();
      } catch {
        setStarting(false);
        setError("The camera could not be opened. Allow the camera for this site, or scan the poster with the phone's camera app.");
      }
    })();
    return () => {
      stopped = true;
      window.clearTimeout(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onClose, router]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md" data-qr-dialog>
        <DialogHeader>
          <DialogTitle>Scan the QR at the entrance</DialogTitle>
          <DialogDescription>Point the camera at the printed code. Checking in follows on the next page.</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
          <video ref={video} className="size-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgb(0_0_0/0.35)]" />
          {starting && (
            <div className="absolute inset-0 flex items-center justify-center text-white">
              <Loader2Icon className="size-6 animate-spin" />
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {wrong && !error && <p className="text-sm text-[var(--st-paused-fg)]">That code is not this workspace&apos;s check-in poster.</p>}
      </DialogContent>
    </Dialog>
  );
}
