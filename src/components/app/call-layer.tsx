"use client";

// In-app calls. Mounted once in the app layout, so a call keeps going while moving between pages. It polls
// /api/calls for an incoming call (every 2.5 seconds while the page is visible) and, during a call, for the call's
// state and the other side's connection messages. Audio and video go directly between the two browsers (WebRTC).

import * as React from "react";
import { toast } from "sonner";
import {
  Maximize2Icon,
  MicIcon,
  MicOffIcon,
  Minimize2Icon,
  MonitorUpIcon,
  PhoneIcon,
  PhoneOffIcon,
  SignalHighIcon,
  SignalLowIcon,
  SignalMediumIcon,
  SwitchCameraIcon,
  VideoIcon,
  VideoOffIcon,
} from "lucide-react";
import type { CallMedia, CallSignal, CallStatus, CallView } from "@/server/calls";
import { cn } from "@/lib/utils";

type Phase = "idle" | "incoming" | "outgoing" | "connecting" | "active" | "ended";
type Quality = "good" | "fair" | "poor" | null;
type PollResult = { incoming: CallView | null; call: CallView | null; signals: CallSignal[] };
type Ice = { iceServers: RTCIceServer[]; relay: boolean };

const TERMINAL: CallStatus[] = ["declined", "busy", "missed", "cancelled", "ended", "failed"];
// A call that is answered but not connected after this long fails (usually a network that blocks calls).
const CONNECT_MS = 25_000;

async function api<T>(op: string, body: Record<string, unknown> = {}): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const res = await fetch("/api/calls", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op, ...body }), cache: "no-store" });
    return await res.json();
  } catch {
    return { ok: false, error: "No connection. Check the network and try again." };
  }
}

function getMedia(media: CallMedia, facing: "user" | "environment" = "user") {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Calls need a secure (https) page and a browser with camera and microphone support.");
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: media === "video" ? { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

function mediaError(err: unknown, media: CallMedia) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return `Allow ${media === "video" ? "the camera and microphone" : "the microphone"} for this site in the browser, then call again.`;
  if (name === "NotFoundError") return media === "video" ? "No camera or microphone was found." : "No microphone was found.";
  return err instanceof Error ? err.message : "The microphone could not be opened.";
}

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, "0");
  return `${h ? `${h}:` : ""}${mm}:${String(s % 60).padStart(2, "0")}`;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

function endLabel(c: CallView, relay: boolean) {
  const media = c.media === "video" ? "Video call" : "Voice call";
  switch (c.status) {
    case "declined":
      return c.direction === "outgoing" ? "Declined" : "Call declined";
    case "busy":
      return `${c.peer.name} is in another call`;
    case "missed":
      return c.direction === "outgoing" ? "No answer" : "Missed call";
    case "cancelled":
      return c.direction === "outgoing" ? "Call cancelled" : "Missed call";
    case "failed":
      return relay ? "The call could not connect" : "The call could not connect. This network may block calls; an administrator can set up the relay in Settings, Calls.";
    default:
      return c.answeredAt ? `${media} ended · ${fmtDuration((Date.parse(c.endedAt ?? new Date().toISOString()) - Date.parse(c.answeredAt)) / 1000)}` : "Call ended";
  }
}

// Ringtones made in the browser (no sound files): incoming ring, ringback for the caller, and a short end tone.
class Tones {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;

  private burst(freqs: number[], at: number, dur: number, vol = 0.1) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.02);
    g.gain.setValueAtTime(vol, at + dur - 0.03);
    g.gain.linearRampToValueAtTime(0, at + dur);
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(at);
      o.stop(at + dur);
    }
  }

  play(kind: "ring" | "ringback" | "end") {
    this.stop();
    try {
      this.ctx ??= new AudioContext();
      void this.ctx.resume().catch(() => {});
    } catch {
      return;
    }
    const once = () => {
      const t = this.ctx!.currentTime + 0.05;
      if (kind === "ring") {
        this.burst([523, 659], t, 0.4, 0.14);
        this.burst([523, 659], t + 0.6, 0.4, 0.14);
        navigator.vibrate?.([400, 200, 400]);
      } else if (kind === "ringback") this.burst([440, 480], t, 1.5, 0.06);
      else [0, 0.18, 0.36].forEach((d, i) => this.burst([620 - i * 120], t + d, 0.14, 0.08));
    };
    once();
    if (kind !== "end") this.timer = window.setInterval(once, kind === "ring" ? 3000 : 4000);
  }

  stop() {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = null;
    navigator.vibrate?.(0);
  }
}

const CallContext = React.createContext<{ start: (groupId: string, media: CallMedia) => void; inCall: boolean }>({ start: () => {}, inCall: false });

export function useCalls() {
  return React.useContext(CallContext);
}

async function closeCallNotification(id: string) {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    (await reg?.getNotifications({ tag: `call:${id}` }))?.forEach((n) => n.close());
  } catch {
    /* no service worker */
  }
}

export function CallLayer({ children }: { children: React.ReactNode }) {
  const [phase, setPhaseState] = React.useState<Phase>("idle");
  const [call, setCall] = React.useState<CallView | null>(null);
  const [ended, setEnded] = React.useState("");
  const [localStream, setLocalStream] = React.useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = React.useState<MediaStream | null>(null);
  const [muted, setMuted] = React.useState(false);
  const [camOff, setCamOff] = React.useState(false);
  const [peerCamOff, setPeerCamOff] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [minimized, setMinimized] = React.useState(false);
  const [quality, setQuality] = React.useState<Quality>(null);
  const [connectedAt, setConnectedAt] = React.useState<number | null>(null);
  const [cameras, setCameras] = React.useState(0);
  const [, tick] = React.useState(0);

  const phaseRef = React.useRef<Phase>("idle");
  const callRef = React.useRef<CallView | null>(null);
  const pcRef = React.useRef<RTCPeerConnection | null>(null);
  const localRef = React.useRef<MediaStream | null>(null);
  const screenRef = React.useRef<MediaStreamTrack | null>(null);
  const seqRef = React.useRef(0);
  const queued = React.useRef<RTCIceCandidateInit[]>([]);
  const early = React.useRef<CallSignal[]>([]);
  const dismissed = React.useRef(new Set<string>());
  const autoAnswer = React.useRef<string | null>(null);
  const iceRef = React.useRef<Promise<Ice> | null>(null);
  const relayRef = React.useRef(false);
  const timers = React.useRef<number[]>([]);
  const facing = React.useRef<"user" | "environment">("user");
  const lossRef = React.useRef({ lost: 0, recv: 0 });
  const tones = React.useRef<Tones | null>(null);
  tones.current ??= typeof window === "undefined" ? null : new Tones();

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const setCurrent = (c: CallView | null) => {
    callRef.current = c;
    setCall(c);
  };

  const iceServers = () => (iceRef.current ??= fetch("/api/calls/ice", { cache: "no-store" }).then((r) => r.json() as Promise<Ice>).catch(() => ({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }], relay: false })));

  const signal = (kind: string, payload: unknown) => {
    const c = callRef.current;
    if (c) void api("signal", { callId: c.id, kind, payload: JSON.stringify(payload) });
  };

  const teardown = () => {
    tones.current?.stop();
    timers.current.forEach((t) => window.clearInterval(t));
    timers.current = [];
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    screenRef.current?.stop();
    screenRef.current = null;
    queued.current = [];
    early.current = [];
    seqRef.current = 0;
    iceRef.current = null;
    lossRef.current = { lost: 0, recv: 0 };
    setLocalStream(null);
    setRemoteStream(null);
    setMuted(false);
    setCamOff(false);
    setPeerCamOff(false);
    setSharing(false);
    setQuality(null);
    setConnectedAt(null);
  };

  const finishLocal = (c: CallView, quiet = false) => {
    const was = phaseRef.current;
    teardown();
    void closeCallNotification(c.id);
    // The screen keeps showing who the call was with until the end message closes.
    callRef.current = null;
    if (quiet || was === "idle") return toIdle();
    setCall(c);
    setEnded(endLabel(c, relayRef.current));
    setPhase("ended");
    tones.current?.play("end");
    window.setTimeout(() => phaseRef.current === "ended" && toIdle(), c.status === "failed" ? 6000 : 2500);
  };

  const toIdle = () => {
    setPhase("idle");
    setCall(null);
    setMinimized(false);
  };

  const hangup = async (reason?: "failed") => {
    const c = callRef.current;
    if (!c) return;
    const at = new Date().toISOString();
    finishLocal({ ...c, status: reason === "failed" ? "failed" : c.status === "ringing" ? "cancelled" : "ended", endedAt: at });
    await api("hangup", { callId: c.id, reason });
  };

  const startStats = (pc: RTCPeerConnection) => {
    const id = window.setInterval(async () => {
      if (pc.connectionState !== "connected") return;
      try {
        const stats = await pc.getStats();
        let rtt: number | null = null;
        let lost = 0;
        let recv = 0;
        stats.forEach((r) => {
          if (r.type === "candidate-pair" && r.nominated && r.state === "succeeded" && typeof r.currentRoundTripTime === "number") rtt = r.currentRoundTripTime;
          if (r.type === "inbound-rtp" && r.kind === "audio") {
            lost = r.packetsLost ?? 0;
            recv = r.packetsReceived ?? 0;
          }
        });
        const dl = lost - lossRef.current.lost;
        const dr = recv - lossRef.current.recv;
        lossRef.current = { lost, recv };
        const loss = dl + dr > 0 ? dl / (dl + dr) : 0;
        const r = rtt ?? 0;
        setQuality(r > 0.4 || loss > 0.08 ? "poor" : r > 0.2 || loss > 0.03 ? "fair" : "good");
      } catch {
        /* stats are optional */
      }
    }, 3000);
    timers.current.push(id);
  };

  const createPeer = async (initiator: boolean) => {
    const ice = await iceServers();
    relayRef.current = ice.relay;
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    pcRef.current = pc;
    const local = localRef.current;
    local?.getTracks().forEach((t) => pc.addTrack(t, local));
    pc.ontrack = (e) => setRemoteStream(e.streams[0] ?? new MediaStream([e.track]));
    pc.onicecandidate = (e) => e.candidate && signal("candidate", e.candidate.toJSON());
    pc.onconnectionstatechange = () => {
      if (pcRef.current !== pc) return;
      const st = pc.connectionState;
      if (st === "connected") {
        if (phaseRef.current === "connecting") setPhase("active");
        setConnectedAt((x) => x ?? Date.now());
        setQuality((q) => q ?? "good");
      } else if (st === "disconnected") setQuality("poor");
      else if (st === "failed") void hangup("failed");
    };
    const deadline = window.setTimeout(() => {
      if (pcRef.current === pc && pc.connectionState !== "connected") void hangup("failed");
    }, CONNECT_MS);
    timers.current.push(deadline);
    startStats(pc);
    if (initiator) {
      await pc.setLocalDescription(await pc.createOffer());
      signal("offer", pc.localDescription!.toJSON());
    }
    const pending = early.current;
    early.current = [];
    for (const s of pending) await onSignal(s);
  };

  const flushCandidates = async (pc: RTCPeerConnection) => {
    const list = queued.current;
    queued.current = [];
    for (const c of list) await pc.addIceCandidate(c).catch(() => {});
  };

  const onSignal = async (s: CallSignal) => {
    const pc = pcRef.current;
    if (!pc) return void early.current.push(s);
    const data = JSON.parse(s.payload);
    try {
      if (s.kind === "offer") {
        await pc.setRemoteDescription(data);
        await flushCandidates(pc);
        await pc.setLocalDescription(await pc.createAnswer());
        signal("answer", pc.localDescription!.toJSON());
      } else if (s.kind === "answer") {
        await pc.setRemoteDescription(data);
        await flushCandidates(pc);
      } else if (s.kind === "candidate") {
        if (pc.remoteDescription) await pc.addIceCandidate(data).catch(() => {});
        else queued.current.push(data);
      } else if (s.kind === "media") setPeerCamOff(data.video === false);
    } catch (err) {
      console.error("call signal", err);
    }
  };

  const accept = async () => {
    const c = callRef.current;
    if (!c || phaseRef.current !== "incoming") return;
    tones.current?.stop();
    try {
      const stream = await getMedia(c.media);
      localRef.current = stream;
      setLocalStream(stream);
    } catch (err) {
      toast.error(mediaError(err, c.media), { duration: 8000 });
      return decline();
    }
    void iceServers();
    const r = await api<CallView>("answer", { callId: c.id });
    if (!r.ok) {
      toast.error(r.error);
      return finishLocal(c, true);
    }
    setCurrent(r.data);
    setPhase("connecting");
    void closeCallNotification(c.id);
    await createPeer(false);
  };

  const decline = async () => {
    const c = callRef.current;
    if (!c) return;
    dismissed.current.add(c.id);
    finishLocal(c, true);
    await api("decline", { callId: c.id });
  };

  const start = async (groupId: string, media: CallMedia) => {
    if (callRef.current) return void toast.error("You are already in a call.");
    try {
      const stream = await getMedia(media);
      localRef.current = stream;
      setLocalStream(stream);
    } catch (err) {
      return void toast.error(mediaError(err, media), { duration: 8000 });
    }
    void iceServers();
    const r = await api<CallView>("start", { groupId, media });
    if (!r.ok) {
      teardown();
      return void toast.error(r.error);
    }
    setCurrent(r.data);
    setMinimized(false);
    if (r.data.status === "busy") return finishLocal(r.data);
    setPhase("outgoing");
    tones.current?.play("ringback");
  };

  const onPoll = async (d: PollResult) => {
    const mine = callRef.current;
    if (!mine) {
      const inc = d.incoming;
      if (inc && !dismissed.current.has(inc.id)) {
        setCurrent(inc);
        setMinimized(false);
        setPhase("incoming");
        tones.current?.play("ring");
        if (autoAnswer.current === inc.id) {
          autoAnswer.current = null;
          await accept();
        }
      }
      return;
    }
    const c = d.call;
    if (!c || c.id !== mine.id) return;
    if (TERMINAL.includes(c.status)) return finishLocal(c);
    // Answered on another of this person's devices.
    if (phaseRef.current === "incoming" && c.status === "accepted") return finishLocal(c, true);
    setCurrent(c);
    if (phaseRef.current === "outgoing" && c.status === "accepted") {
      tones.current?.stop();
      setPhase("connecting");
      await createPeer(true);
    }
    for (const s of d.signals) {
      seqRef.current = Math.max(seqRef.current, s.seq);
      await onSignal(s);
    }
  };

  // Latest handlers for the long-lived poll loop and listeners.
  const engine = React.useRef({ onPoll, start });
  engine.current = { onPoll, start };

  React.useEffect(() => {
    // Opened from the notification's Answer button.
    const url = new URL(window.location.href);
    const a = url.searchParams.get("answer");
    if (a) {
      autoAnswer.current = a;
      url.searchParams.delete("answer");
      window.history.replaceState(null, "", url.toString());
    }
    let stop = false;
    let t = 0;
    const loop = async () => {
      if (stop) return;
      const c = callRef.current;
      if (c || document.visibilityState === "visible") {
        const r = await api<PollResult>("poll", { callId: c?.id ?? null, afterSeq: seqRef.current });
        if (!stop && r.ok) await engine.current.onPoll(r.data).catch((err) => console.error("call poll", err));
      }
      const p = phaseRef.current;
      t = window.setTimeout(loop, !callRef.current ? 2500 : p === "outgoing" || p === "connecting" ? 700 : 2000);
    };
    void loop();
    const onVisible = () => document.visibilityState === "visible" && !callRef.current && (window.clearTimeout(t), void loop());
    // Closing the tab mid-call hangs up at once instead of waiting for the other side to notice.
    const onUnload = () => {
      const c = callRef.current;
      if (c && phaseRef.current !== "incoming") navigator.sendBeacon("/api/calls", JSON.stringify({ op: "hangup", callId: c.id }));
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onUnload);
    return () => {
      stop = true;
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onUnload);
    };
  }, []);

  React.useEffect(() => {
    if (phase !== "active") return;
    const id = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  React.useEffect(() => {
    if (call?.media !== "video" || !localStream) return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setCameras(d.filter((x) => x.kind === "videoinput").length))
      .catch(() => {});
  }, [call?.media, localStream]);

  const videoSender = () => pcRef.current?.getSenders().find((s) => s.track?.kind === "video");

  const toggleMute = () => {
    const next = !muted;
    localRef.current?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const toggleCam = () => {
    const next = !camOff;
    localRef.current?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
    signal("media", { video: !next });
  };

  const switchCam = async () => {
    const local = localRef.current;
    if (!local) return;
    facing.current = facing.current === "user" ? "environment" : "user";
    try {
      const fresh = (await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing.current } })).getVideoTracks()[0]!;
      const old = local.getVideoTracks()[0];
      if (!screenRef.current) await videoSender()?.replaceTrack(fresh);
      if (old) {
        local.removeTrack(old);
        old.stop();
      }
      fresh.enabled = !camOff;
      local.addTrack(fresh);
      setLocalStream(new MediaStream(local.getTracks()));
    } catch (err) {
      toast.error(mediaError(err, "video"));
    }
  };

  const toggleShare = async () => {
    const sender = videoSender();
    if (!sender) return;
    const camera = localRef.current?.getVideoTracks()[0] ?? null;
    if (screenRef.current) {
      screenRef.current.stop();
      screenRef.current = null;
      await sender.replaceTrack(camera);
      return setSharing(false);
    }
    try {
      const screen = (await navigator.mediaDevices.getDisplayMedia({ video: true })).getVideoTracks()[0]!;
      screenRef.current = screen;
      await sender.replaceTrack(screen);
      setSharing(true);
      screen.onended = () => {
        if (screenRef.current !== screen) return;
        screenRef.current = null;
        void sender.replaceTrack(camera);
        setSharing(false);
      };
    } catch {
      /* cancelled */
    }
  };

  const inCall = phase !== "idle" && phase !== "ended";
  const ctx = React.useMemo(() => ({ start: (g: string, m: CallMedia) => void engine.current.start(g, m), inCall }), [inCall]);

  const video = call?.media === "video";
  const showRemoteVideo = video && !!remoteStream && !peerCamOff && (phase === "active" || phase === "connecting");
  const status =
    phase === "incoming"
      ? `Incoming ${video ? "video" : "voice"} call`
      : phase === "outgoing"
        ? "Ringing…"
        : phase === "connecting"
          ? "Connecting…"
          : phase === "active"
            ? fmtDuration(connectedAt ? (Date.now() - connectedAt) / 1000 : 0)
            : ended;

  return (
    <CallContext.Provider value={ctx}>
      {children}
      {phase !== "idle" && (
        <div
          role="dialog"
          aria-label={status}
          className={cn(
            "z-[100] overflow-hidden bg-zinc-950 text-white shadow-2xl",
            minimized ? "fixed right-4 bottom-4 h-44 w-72 rounded-2xl" : "fixed inset-0",
          )}
        >
          {/* Remote audio and video; always mounted during a call so sound keeps playing when minimised. */}
          <video
            ref={(el) => {
              if (el && el.srcObject !== remoteStream) el.srcObject = remoteStream;
            }}
            autoPlay
            playsInline
            className={cn("absolute inset-0 size-full bg-black object-contain", !showRemoteVideo && "invisible")}
          />
          {!showRemoteVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center">
              <span
                className={cn(
                  "flex items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-violet-600 font-semibold",
                  minimized ? "size-12 text-lg" : "size-28 text-4xl",
                  (phase === "incoming" || phase === "outgoing") && "animate-pulse",
                )}
              >
                {call ? initials(call.peer.name) : ""}
              </span>
              <span className={cn("font-semibold", minimized ? "text-sm" : "text-2xl")}>{call?.peer.name}</span>
              <span className={cn("text-white/70", minimized ? "text-xs" : "text-sm")}>{status}</span>
            </div>
          )}
          {showRemoteVideo && (
            <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/60 to-transparent p-3">
              <span className="block text-sm font-medium">{call?.peer.name}</span>
              <span className="block text-xs text-white/70">{status}</span>
            </div>
          )}
          {video && localStream && !minimized && (phase === "outgoing" || phase === "connecting" || phase === "active") && (
            <video
              ref={(el) => {
                if (el && el.srcObject !== localStream) el.srcObject = localStream;
              }}
              autoPlay
              playsInline
              muted
              className={cn(
                "absolute right-4 bottom-28 h-40 w-28 rounded-xl border border-white/20 bg-black object-cover shadow-lg sm:h-36 sm:w-56",
                facing.current === "user" && "-scale-x-100",
                camOff && "opacity-30",
              )}
            />
          )}
          {phase === "active" && quality && !minimized && (
            <span className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/50 px-2 py-1 text-xs" title="Connection quality">
              {quality === "good" ? <SignalHighIcon className="size-3.5 text-emerald-400" /> : quality === "fair" ? <SignalMediumIcon className="size-3.5 text-amber-400" /> : <SignalLowIcon className="size-3.5 text-red-400" />}
              {quality === "good" ? "Good" : quality === "fair" ? "Fair" : "Poor connection"}
            </span>
          )}

          <div className={cn("absolute inset-x-0 bottom-0 flex items-center justify-center", minimized ? "gap-2 p-2" : "gap-3 p-6 sm:gap-4")}>
            {phase === "incoming" ? (
              <>
                <RoundButton label="Decline" className="bg-red-600 hover:bg-red-500" big onClick={decline}>
                  <PhoneOffIcon />
                </RoundButton>
                <RoundButton label="Accept" className="bg-emerald-600 hover:bg-emerald-500" big onClick={accept}>
                  {video ? <VideoIcon /> : <PhoneIcon />}
                </RoundButton>
              </>
            ) : phase === "ended" ? null : (
              <>
                <RoundButton label={muted ? "Unmute" : "Mute"} small={minimized} active={muted} onClick={toggleMute}>
                  {muted ? <MicOffIcon /> : <MicIcon />}
                </RoundButton>
                {video && !minimized && (
                  <RoundButton label={camOff ? "Turn camera on" : "Turn camera off"} active={camOff} onClick={toggleCam}>
                    {camOff ? <VideoOffIcon /> : <VideoIcon />}
                  </RoundButton>
                )}
                {video && !minimized && cameras > 1 && (
                  <RoundButton label="Switch camera" onClick={switchCam}>
                    <SwitchCameraIcon />
                  </RoundButton>
                )}
                {video && !minimized && phase === "active" && typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia && (
                  <RoundButton label={sharing ? "Stop sharing" : "Share screen"} active={sharing} onClick={toggleShare}>
                    <MonitorUpIcon />
                  </RoundButton>
                )}
                <RoundButton label={minimized ? "Expand" : "Minimise"} small={minimized} onClick={() => setMinimized((m) => !m)}>
                  {minimized ? <Maximize2Icon /> : <Minimize2Icon />}
                </RoundButton>
                <RoundButton label="Hang up" small={minimized} className="bg-red-600 hover:bg-red-500" onClick={() => hangup()}>
                  <PhoneOffIcon />
                </RoundButton>
              </>
            )}
          </div>
        </div>
      )}
    </CallContext.Provider>
  );
}

function RoundButton({ label, onClick, children, className, active, big, small }: { label: string; onClick: () => void; children: React.ReactNode; className?: string; active?: boolean; big?: boolean; small?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none [&_svg]:size-5",
        big ? "size-16 [&_svg]:size-7" : small ? "size-9 [&_svg]:size-4" : "size-12",
        className ?? (active ? "bg-white text-zinc-900" : "bg-white/15 hover:bg-white/25"),
      )}
    >
      {children}
    </button>
  );
}
