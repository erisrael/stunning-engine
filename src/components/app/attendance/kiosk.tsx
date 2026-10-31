"use client";

import * as React from "react";
import { CameraIcon, CheckCircle2Icon, DeleteIcon, KeyRoundIcon, Loader2Icon, ScanFaceIcon, WifiOffIcon, XCircleIcon } from "lucide-react";
import { blinkWatcher, loadFaceApi, readFace } from "./face";
import { Button } from "@/components/ui/button";
import { DAY_STATUS_LABELS, type DayStatus } from "@/lib/attendance";
import { cn } from "@/lib/utils";

// The kiosk at the entrance. People scan their badge (a USB or Bluetooth scanner types it in, or the camera reads
// it where the browser can), or type their number and PIN. Without a network, check-ins are kept on the device with
// their real time, signed with the kiosk's key, and sent when it is back.

type Queued = { clientId: string; at: string; badge?: string; code?: string; pin?: string; sig: string };
type Outcome = { ok: true; name: string; kind: "in" | "out"; time: string; status?: DayStatus | null; lateMin?: number; saved?: boolean } | { ok: false; error: string };

const QUEUE_KEY = "myseed-kiosk-queue";
const readQueue = (): Queued[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]");
  } catch {
    return [];
  }
};
const writeQueue = (q: Queued[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {
    /* storage full or blocked: the check-in is lost, and the screen says so */
  }
};

async function sign(key: string, text: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function post(body: unknown) {
  const r = await fetch("/api/attendance/kiosk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, data };
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export function KioskScreen({ initialName }: { initialName: string }) {
  const [name, setName] = React.useState(initialName);
  const [tz, setTz] = React.useState<string | undefined>(undefined);
  const [now, setNow] = React.useState(() => new Date());
  const [online, setOnline] = React.useState(true);
  const [queued, setQueued] = React.useState(0);
  const [mode, setMode] = React.useState<"badge" | "code" | "pin" | "face">("badge");
  const [faceOn, setFaceOn] = React.useState(false);
  const [faceMsg, setFaceMsg] = React.useState("");
  const faceVideo = React.useRef<HTMLVideoElement>(null);
  const [code, setCode] = React.useState("");
  const [pin, setPin] = React.useState("");
  const [scan, setScan] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [outcome, setOutcome] = React.useState<Outcome | null>(null);
  const [camera, setCamera] = React.useState(false);
  const signKey = React.useRef<string | null>(null);
  const scanRef = React.useRef<HTMLInputElement>(null);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canScan = typeof window !== "undefined" && "BarcodeDetector" in window;

  const clock = (d: Date, withSeconds = false) => d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, hour12: false, timeZone: tz });

  // Heartbeat: keeps the kiosk counted as working, and fetches the key for offline check-ins.
  const ping = React.useCallback(async () => {
    try {
      const r = await post({ action: "ping" });
      if (r.status === 200) {
        setOnline(true);
        setName(r.data.name);
        setTz(r.data.timezone);
        setFaceOn(!!r.data.faceOn);
        signKey.current = r.data.signKey;
        try {
          localStorage.setItem("myseed-kiosk-key", r.data.signKey ?? "");
        } catch {}
      } else if (r.status === 401) window.location.reload();
    } catch {
      setOnline(false);
    }
  }, []);

  const sync = React.useCallback(async () => {
    const q = readQueue();
    setQueued(q.length);
    if (!q.length) return;
    try {
      const r = await post({ action: "sync", items: q });
      if (r.status !== 200) return;
      setOnline(true);
      // Drop what was taken, and what can never be taken (for example a wrong PIN); keep the rest for later.
      const done = new Set((r.data.results as { clientId: string; ok: boolean; final?: boolean }[]).filter((x) => x.ok || x.final).map((x) => x.clientId));
      const left = readQueue().filter((x) => !done.has(x.clientId));
      writeQueue(left);
      setQueued(left.length);
    } catch {
      setOnline(false);
    }
  }, []);

  React.useEffect(() => {
    try {
      signKey.current = localStorage.getItem("myseed-kiosk-key");
    } catch {}
    void ping().then(sync);
    const t1 = setInterval(() => setNow(new Date()), 1000);
    const t2 = setInterval(() => void ping().then(sync), 60e3);
    const back = () => void ping().then(sync);
    window.addEventListener("online", back);
    return () => {
      clearInterval(t1);
      clearInterval(t2);
      window.removeEventListener("online", back);
    };
  }, [ping, sync]);

  // Keep the badge field focused, so a scanner's typing always lands in it.
  React.useEffect(() => {
    if (mode !== "badge" || outcome) return;
    const t = setInterval(() => document.activeElement !== scanRef.current && scanRef.current?.focus(), 800);
    return () => clearInterval(t);
  }, [mode, outcome]);

  // The result stays up for a few seconds, then the screen is ready for the next person.
  React.useEffect(() => {
    if (!outcome) return;
    const t = setTimeout(() => setOutcome(null), outcome.ok ? 4000 : 5000);
    return () => clearTimeout(t);
  }, [outcome]);

  const submit = async (cred: { badge?: string; code?: string; pin?: string; face?: number[] }) => {
    setBusy(true);
    try {
      const r = await post({ action: "punch", ...cred });
      setOnline(true);
      if (r.status === 200) {
        const d = r.data;
        setOutcome({ ok: true, name: d.name, kind: d.kind, time: clock(new Date(d.at)), status: d.line?.status, lateMin: d.line?.lateMin });
      } else if (r.status === 401) window.location.reload();
      else setOutcome({ ok: false, error: r.data.error ?? "Something went wrong. Try again." });
    } catch {
      // No network: keep it with its real time, signed by this kiosk. A face needs the network; badge or PIN do not.
      setOnline(false);
      if (cred.face) {
        setOutcome({ ok: false, error: "No network for face check-in. Scan your badge or use your number and PIN; they are kept until the network is back." });
        return;
      }
      const at = new Date().toISOString();
      const clientId = crypto.randomUUID();
      const key = signKey.current;
      if (!key) setOutcome({ ok: false, error: "No network, and this kiosk has not been online yet. Tell your team lead." });
      else {
        const sig = await sign(key, `${clientId}|${at}|${cred.badge ?? cred.code ?? ""}`);
        const q = [...readQueue(), { clientId, at, sig, ...cred }];
        writeQueue(q);
        setQueued(q.length);
        setOutcome({ ok: true, name: "", kind: "in", time: clock(new Date(at)), saved: true });
      }
    } finally {
      setBusy(false);
      setCode("");
      setPin("");
      setScan("");
      setMode("badge");
    }
  };

  // Face check-in: one face in view, a blink (a photo cannot blink), then only the face code is sent.
  React.useEffect(() => {
    if (mode !== "face") return;
    let stop = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        setFaceMsg("Starting the camera…");
        const f = await loadFaceApi();
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 } });
        const v = faceVideo.current;
        if (!v || stop) return;
        v.srcObject = stream;
        await v.play();
        const blinked = blinkWatcher();
        const until = Date.now() + 12_000;
        let code: number[] | null = null;
        setFaceMsg("Look at the camera, then blink");
        while (!stop && Date.now() < until) {
          const r = await readFace(f, v).catch(() => null);
          if (!r) setFaceMsg("One face in view, please");
          else if (r.size < 0.18) setFaceMsg("Come a little closer");
          else if (!r.centered) setFaceMsg("Move into the middle");
          else {
            setFaceMsg("Now blink");
            if (r.eyes > 0.26) code = r.code;
            if (blinked(r.eyes) && code) {
              stop = true;
              await submit({ face: code });
              return;
            }
          }
          await new Promise((res) => setTimeout(res, 60));
        }
        if (!stop) {
          setOutcome({ ok: false, error: "Your face was not read in time. Scan your badge or use your number and PIN." });
          setMode("badge");
        }
      } catch {
        setOutcome({ ok: false, error: "The camera is not available. Scan your badge or use your number and PIN." });
        setMode("badge");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Camera scanning, where the browser has a barcode reader.
  React.useEffect(() => {
    if (!camera || !canScan) return;
    let stream: MediaStream | null = null;
    let stop = false;
    const Detector = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    const detector = new Detector({ formats: ["qr_code"] });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        if (!videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        while (!stop) {
          const found = await detector.detect(videoRef.current).catch(() => []);
          const value = found[0]?.rawValue;
          if (value?.startsWith("MYB-")) {
            setCamera(false);
            await submit({ badge: value });
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setCamera(false);
        setOutcome({ ok: false, error: "The camera is not available. Use the scanner, or your number and PIN." });
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  const press = (d: string) => {
    if (mode === "code") setCode((c) => (c + d).slice(0, 6));
    else setPin((p) => (p + d).slice(0, 6));
  };
  const back = () => (mode === "code" ? setCode((c) => c.slice(0, -1)) : setPin((p) => p.slice(0, -1)));
  const next = () => {
    if (mode === "code" && code) setMode("pin");
    else if (mode === "pin" && pin.length >= 4) void submit({ code, pin });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-[#14132a] text-[#ecebf7]" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
      <header className="flex items-center gap-3 py-4">
        <p className="text-lg font-semibold">{name}</p>
        <span className={cn("ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-sm", online ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300")}>
          {online ? "Online" : (
            <>
              <WifiOffIcon className="size-4" /> Offline: check-ins are kept
            </>
          )}
        </span>
        {queued > 0 && <span className="rounded-full bg-white/10 px-3 py-1 text-sm">{queued} waiting to send</span>}
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 pb-10 text-center">
        <div>
          <p className="text-7xl font-semibold tabular-nums sm:text-8xl">{clock(now)}</p>
          <p className="mt-2 text-xl text-[#a9a6c9]">{now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", timeZone: tz })}</p>
        </div>

        {outcome ? (
          <div className={cn("w-full max-w-xl rounded-2xl p-8", outcome.ok ? "bg-emerald-500/15" : "bg-rose-500/15")} role="status" aria-live="assertive">
            {outcome.ok ? (
              <>
                <CheckCircle2Icon className="mx-auto size-16 text-emerald-300" />
                {outcome.saved ? (
                  <>
                    <p className="mt-3 text-3xl font-semibold">Saved at {outcome.time}</p>
                    <p className="mt-2 text-lg text-[#d6d4ee]">The network is down. Your check-in keeps this time and is sent when it is back.</p>
                  </>
                ) : (
                  <>
                    <p className="mt-3 text-3xl font-semibold">
                      {outcome.kind === "in" ? `Welcome, ${outcome.name}` : `Goodbye, ${outcome.name}`}
                    </p>
                    <p className="mt-2 text-xl text-[#d6d4ee]">
                      {outcome.kind === "in" ? "Checked in" : "Checked out"} at {outcome.time}
                      {outcome.kind === "in" && outcome.lateMin ? `, ${outcome.lateMin} min late` : ""}
                      {outcome.kind === "in" && outcome.status && !outcome.lateMin ? `. ${DAY_STATUS_LABELS[outcome.status]}` : ""}
                    </p>
                  </>
                )}
              </>
            ) : (
              <>
                <XCircleIcon className="mx-auto size-16 text-rose-300" />
                <p className="mt-3 text-2xl font-semibold">{outcome.error}</p>
              </>
            )}
          </div>
        ) : mode === "face" ? (
          <div className="flex w-full max-w-xl flex-col items-center gap-4">
            <video ref={faceVideo} muted playsInline className="aspect-[4/3] w-full max-w-md -scale-x-100 rounded-2xl bg-black object-cover" aria-label="Camera" />
            <p className="text-2xl font-semibold" role="status" aria-live="polite">
              {faceMsg}
            </p>
            <Button size="lg" variant="secondary" onClick={() => setMode("badge")}>
              Use my badge or PIN instead
            </Button>
          </div>
        ) : mode === "badge" ? (
          <div className="flex w-full max-w-xl flex-col items-center gap-5">
            <p className="text-3xl font-semibold">Scan your badge</p>
            <form onSubmit={(e) => (e.preventDefault(), scan.trim() && void submit({ badge: scan.trim() }))} className="w-full">
              <input
                ref={scanRef}
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                autoFocus
                autoComplete="off"
                aria-label="Badge code (from the scanner)"
                className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-center font-mono text-lg text-[#ecebf7] placeholder:text-[#7d7aa0]"
                placeholder="Waiting for the scanner…"
              />
            </form>
            {camera && <video ref={videoRef} muted playsInline className="aspect-video w-full max-w-md rounded-xl bg-black object-cover" />}
            <div className="flex flex-wrap justify-center gap-3">
              {faceOn && online && (
                <Button size="lg" onClick={() => (setCamera(false), setMode("face"))}>
                  <ScanFaceIcon /> Check in with my face
                </Button>
              )}
              {canScan && (
                <Button size="lg" variant="secondary" onClick={() => setCamera((c) => !c)}>
                  <CameraIcon /> {camera ? "Stop the camera" : "Scan with the camera"}
                </Button>
              )}
              <Button size="lg" variant="secondary" onClick={() => (setCamera(false), setMode("code"))}>
                <KeyRoundIcon /> Use my number and PIN
              </Button>
            </div>
            {busy && <Loader2Icon className="size-8 animate-spin" />}
          </div>
        ) : (
          <div className="flex w-full max-w-sm flex-col items-center gap-4">
            <p className="text-2xl font-semibold">{mode === "code" ? "Your number" : "Your PIN"}</p>
            <p className="h-14 w-full rounded-xl border border-white/15 bg-white/5 py-2 text-center font-mono text-3xl tracking-[0.3em]" aria-live="polite">
              {mode === "code" ? code || " " : "•".repeat(pin.length) || " "}
            </p>
            <div className="grid w-full grid-cols-3 gap-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" onClick={() => press(d)} className="h-16 rounded-xl bg-white/10 text-2xl font-semibold hover:bg-white/15 active:bg-white/25">
                  {d}
                </button>
              ))}
              <button type="button" onClick={back} aria-label="Delete" className="flex h-16 items-center justify-center rounded-xl bg-white/5 hover:bg-white/10">
                <DeleteIcon />
              </button>
              <button type="button" onClick={() => press("0")} className="h-16 rounded-xl bg-white/10 text-2xl font-semibold hover:bg-white/15">
                0
              </button>
              <button type="button" onClick={next} disabled={busy || (mode === "code" ? !code : pin.length < 4)} className="h-16 rounded-xl bg-[#8b85ff] text-xl font-semibold text-[#14132a] disabled:opacity-40">
                {busy ? <Loader2Icon className="mx-auto animate-spin" /> : mode === "code" ? "Next" : "OK"}
              </button>
            </div>
            <Button variant="ghost" className="text-[#d6d4ee]" onClick={() => (setMode("badge"), setCode(""), setPin(""))}>
              Back to badge
            </Button>
          </div>
        )}
      </main>
      <footer className="pb-4 text-center text-sm text-[#7d7aa0]">Your number is on your Attendance page in the app. Forgot your PIN? Set a new one there, or ask HR.</footer>
    </div>
  );
}
