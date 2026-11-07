"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CameraIcon,
  CheckCircle2Icon,
  DownloadIcon,
  KeyRoundIcon,
  Loader2Icon,
  MapPinIcon,
  QrCodeIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  TabletIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function KioskPairing({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [pin, setPin] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(
    initialError === "setup"
      ? "That setup link has expired or was already used. Please request a new setup link or 6-digit PIN from HR/Admin."
      : ""
  );
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);
  const [isPwaInstalled, setIsPwaInstalled] = React.useState(false);
  const [showCamera, setShowCamera] = React.useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);

  // Capture PWA install prompt
  React.useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handler);
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsPwaInstalled(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      toast.info("To install on iOS or Tablet: Tap Share -> 'Add to Home Screen'.");
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsPwaInstalled(true);
      toast.success("Kiosk app installed successfully!");
    }
    setDeferredPrompt(null);
  };

  const handlePair = async (codeToPair: string) => {
    const c = codeToPair.trim();
    if (!c) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/attendance/kiosk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pair", code: c }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        toast.success("Device paired successfully! Launching kiosk...");
        window.location.href = "/kiosk";
      } else {
        setError(data.error || "Failed to pair kiosk with this code.");
      }
    } catch {
      setError("Network connection error. Check tablet internet and retry.");
    } finally {
      setBusy(false);
    }
  };

  const pressDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length === 6) {
        void handlePair(nextPin);
      }
    }
  };

  const backspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  // Barcode / QR detector from camera
  React.useEffect(() => {
    if (!showCamera) return;
    let stream: MediaStream | null = null;
    let active = true;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          void videoRef.current.play();
        }

        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const scan = async () => {
            if (!active || !videoRef.current) return;
            try {
              const barcodes = await detector.detect(videoRef.current);
              if (barcodes.length > 0) {
                const raw = barcodes[0].rawValue;
                // If it's a URL with setup=...
                const match = raw.match(/setup=([a-zA-Z0-9_-]+)/);
                const code = match ? match[1] : raw;
                active = false;
                setShowCamera(false);
                void handlePair(code);
                return;
              }
            } catch {}
            requestAnimationFrame(scan);
          };
          scan();
        }
      })
      .catch(() => {
        setError("Unable to access tablet camera for QR scanning.");
        setShowCamera(false);
      });

    return () => {
      active = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [showCamera]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#0a0a14] px-4 py-8 text-[#ecebf7]">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* App Title & Header */}
        <div className="space-y-2">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <TabletIcon className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Connect Tablet Kiosk</h1>
          <p className="text-xs text-[#a9a6c9] leading-relaxed">
            Link this tablet or device to an attendance station (Main Entrance, Studio, or Branch).
          </p>
        </div>

        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-medium text-rose-300">
            {error}
          </div>
        )}

        {/* 6-Digit PIN Entry */}
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRoundIcon className="size-3.5 text-indigo-400" /> Enter 6-Digit Setup PIN
            </span>
            <span className="text-[11px] text-[#7d7aa0]">From Attendance &gt; Setup</span>
          </div>

          {/* PIN display boxes */}
          <div className="flex justify-center gap-2">
            {[0, 1, 2, 3, 4, 5].map((idx) => (
              <div
                key={idx}
                className={`flex size-12 items-center justify-center rounded-xl border text-xl font-bold transition-all ${
                  pin[idx]
                    ? "border-indigo-400 bg-indigo-500/20 text-white shadow-inner"
                    : "border-white/15 bg-white/5 text-[#7d7aa0]"
                }`}
              >
                {pin[idx] || "•"}
              </div>
            ))}
          </div>

          {/* Numeric keypad */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => pressDigit(d)}
                className="h-12 rounded-xl bg-white/10 text-xl font-bold hover:bg-white/15 active:bg-white/25 transition-all text-[#ecebf7]"
              >
                {d}
              </button>
            ))}
            <button
              type="button"
              disabled={busy || !pin}
              onClick={backspace}
              className="h-12 rounded-xl bg-white/5 text-sm font-semibold hover:bg-white/10 active:bg-white/20 transition-all text-[#a9a6c9]"
            >
              Clear
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => pressDigit("0")}
              className="h-12 rounded-xl bg-white/10 text-xl font-bold hover:bg-white/15 active:bg-white/25 transition-all text-[#ecebf7]"
            >
              0
            </button>
            <button
              type="button"
              disabled={busy || pin.length < 6}
              onClick={() => handlePair(pin)}
              className="h-12 rounded-xl bg-indigo-600 font-semibold text-white hover:bg-indigo-500 active:bg-indigo-700 transition-all disabled:opacity-40 flex items-center justify-center"
            >
              {busy ? <Loader2Icon className="size-5 animate-spin" /> : "Connect"}
            </button>
          </div>
        </div>

        {/* Camera Scanner or Install App */}
        <div className="flex flex-col gap-2.5">
          <Button
            variant="secondary"
            className="w-full gap-2 border border-white/10 bg-white/5 hover:bg-white/10 text-[#ecebf7]"
            onClick={() => setShowCamera(!showCamera)}
          >
            <CameraIcon className="size-4 text-emerald-400" />
            {showCamera ? "Close Camera" : "Scan Setup QR Code with Camera"}
          </Button>

          {showCamera && (
            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black aspect-square max-w-xs mx-auto">
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-2 border-dashed border-emerald-400/70 m-8 rounded-xl pointer-events-none animate-pulse" />
            </div>
          )}

          {!isPwaInstalled && (
            <Button
              variant="outline"
              className="w-full gap-2 border-white/15 bg-transparent hover:bg-white/5 text-[#a9a6c9]"
              onClick={handleInstallClick}
            >
              <DownloadIcon className="size-4 text-blue-400" />
              Install Kiosk App on this Device
            </Button>
          )}
        </div>

        {/* Footer help */}
        <div className="space-y-1 text-xs text-[#7d7aa0]">
          <p>Admins can add and manage multiple sites in Attendance &gt; Setup &gt; Kiosks.</p>
          <p>For security, setup links and PINs expire after 24 hours.</p>
        </div>
      </div>
    </main>
  );
}

