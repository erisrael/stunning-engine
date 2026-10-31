"use client";

import * as React from "react";
import { Loader2Icon, MicIcon, MicOffIcon, PhoneOffIcon, VideoIcon, VideoOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// A group call for up to four people. Every pair of browsers has its own direct connection (a mesh). The person
// whose id sorts first in each pair makes the offer, so two people never offer to each other at once.

type Peer = { id: string; name: string };
type Signal = { seq: number; from: string; kind: string; payload: string };

async function api<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch("/api/calls/group", { method: "POST", body: JSON.stringify(body), cache: "no-store" });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error ?? "Something went wrong with the call.");
  return j.data as T;
}

function Tile({ name, stream, muted, self, video }: { name: string; stream: MediaStream | null; muted: boolean; self?: boolean; video: boolean }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (ref.current && stream && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  const hasVideo = video && !!stream?.getVideoTracks().some((t) => t.enabled && t.readyState === "live");
  return (
    <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl bg-[#1d1b3a]">
      <video ref={ref} autoPlay playsInline muted={self || muted} className={cn("absolute inset-0 size-full object-cover", !hasVideo && "invisible", self && "-scale-x-100")} />
      {!hasVideo && <span className="flex size-20 items-center justify-center rounded-full bg-white/10 text-3xl font-semibold text-white">{name.slice(0, 1).toUpperCase()}</span>}
      <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-sm text-white">
        {name}
        {self ? " (you)" : ""}
      </span>
      {!stream && !self && (
        <span className="absolute top-2 right-2 flex items-center gap-1 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">
          <Loader2Icon className="size-3 animate-spin" /> Connecting
        </span>
      )}
    </div>
  );
}

export function GroupCallRoom({ callId, me }: { callId: string; me: Peer }) {
  const [state, setState] = React.useState<"joining" | "in" | "ended" | "error">("joining");
  const [error, setError] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("Group call");
  const [video, setVideo] = React.useState(false);
  const [peers, setPeers] = React.useState<Peer[]>([]);
  const [streams, setStreams] = React.useState<Record<string, MediaStream>>({});
  const [micOn, setMicOn] = React.useState(true);
  const [camOn, setCamOn] = React.useState(true);
  const local = React.useRef<MediaStream | null>(null);
  const pcs = React.useRef(new Map<string, RTCPeerConnection>());
  const pending = React.useRef(new Map<string, RTCIceCandidateInit[]>());
  const seq = React.useRef(0);
  const ice = React.useRef<RTCIceServer[]>([]);
  const left = React.useRef(false);

  const send = (to: string, kind: string, payload: unknown) => api({ op: "signal", callId, to, kind, payload: JSON.stringify(payload) }).catch(() => null);

  const connect = React.useCallback(
    (peer: Peer) => {
      if (pcs.current.has(peer.id)) return pcs.current.get(peer.id)!;
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      pcs.current.set(peer.id, pc);
      local.current?.getTracks().forEach((t) => pc.addTrack(t, local.current!));
      pc.onicecandidate = (e) => e.candidate && void send(peer.id, "ice", e.candidate.toJSON());
      pc.ontrack = (e) => setStreams((s) => ({ ...s, [peer.id]: e.streams[0] ?? new MediaStream([e.track]) }));
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") pc.restartIce?.();
      };
      if (me.id < peer.id)
        void (async () => {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await send(peer.id, "offer", offer);
        })();
      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [callId, me.id],
  );

  const drop = (id: string) => {
    pcs.current.get(id)?.close();
    pcs.current.delete(id);
    setStreams((s) => {
      const n = { ...s };
      delete n[id];
      return n;
    });
  };

  const handle = async (s: Signal, list: Peer[]) => {
    const from = list.find((p) => p.id === s.from) ?? { id: s.from, name: "Someone" };
    const pc = connect(from);
    const data = JSON.parse(s.payload);
    if (s.kind === "offer") {
      await pc.setRemoteDescription(data);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send(from.id, "answer", answer);
    } else if (s.kind === "answer") {
      if (pc.signalingState === "have-local-offer") await pc.setRemoteDescription(data);
    } else if (s.kind === "ice") {
      if (pc.remoteDescription) await pc.addIceCandidate(data).catch(() => null);
      else pending.current.set(from.id, [...(pending.current.get(from.id) ?? []), data]);
    }
    if (pc.remoteDescription && pending.current.has(from.id)) {
      for (const c of pending.current.get(from.id)!) await pc.addIceCandidate(c).catch(() => null);
      pending.current.delete(from.id);
    }
  };

  const leave = React.useCallback(() => {
    if (left.current) return;
    left.current = true;
    navigator.sendBeacon?.("/api/calls/group", JSON.stringify({ op: "leave", callId }));
    pcs.current.forEach((pc) => pc.close());
    pcs.current.clear();
    local.current?.getTracks().forEach((t) => t.stop());
    setState("ended");
  }, [callId]);

  React.useEffect(() => {
    let stop = false;
    (async () => {
      try {
        const joined = await api<{ media: "audio" | "video"; group: string }>({ op: "join", callId });
        setTitle(joined.group);
        const wantVideo = joined.media === "video";
        setVideo(wantVideo);
        ice.current = ((await fetch("/api/calls/ice").then((r) => r.json()).catch(() => ({ iceServers: [] }))) as { iceServers: RTCIceServer[] }).iceServers;
        try {
          local.current = await navigator.mediaDevices.getUserMedia({ audio: true, video: wantVideo });
        } catch {
          // No camera (or refused): join with sound only.
          local.current = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => new MediaStream());
          setCamOn(false);
        }
        setState("in");
        while (!stop && !left.current) {
          const r = await api<{ status: string; participants: Peer[]; signals: Signal[] }>({ op: "poll", callId, afterSeq: seq.current }).catch(() => null);
          if (r) {
            if (r.status !== "active") {
              leave();
              break;
            }
            const others = r.participants.filter((p) => p.id !== me.id);
            setPeers(others);
            for (const p of others) connect(p);
            for (const id of [...pcs.current.keys()]) if (!others.some((p) => p.id === id)) drop(id);
            for (const s of r.signals) {
              seq.current = Math.max(seq.current, s.seq);
              await handle(s, others).catch(() => null);
            }
          }
          await new Promise((res) => setTimeout(res, 1500));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setState("error");
      }
    })();
    const bye = () => leave();
    window.addEventListener("pagehide", bye);
    return () => {
      stop = true;
      window.removeEventListener("pagehide", bye);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const toggleMic = () => {
    const on = !micOn;
    local.current?.getAudioTracks().forEach((t) => (t.enabled = on));
    setMicOn(on);
  };
  const toggleCam = () => {
    const on = !camOn;
    local.current?.getVideoTracks().forEach((t) => (t.enabled = on));
    setCamOn(on);
  };

  if (state === "ended" || state === "error")
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#14132a] px-4 text-center text-[#ecebf7]">
        <div className="space-y-3">
          <p className="text-2xl font-semibold">{state === "ended" ? "You left the call" : "Could not join the call"}</p>
          {error && <p className="text-[#a9a6c9]">{error}</p>}
          <p className="text-sm text-[#a9a6c9]">You can close this tab.</p>
        </div>
      </main>
    );

  const tiles = [{ id: me.id, name: me.name, self: true }, ...peers.map((p) => ({ ...p, self: false }))];
  return (
    <main className="flex min-h-dvh flex-col bg-[#14132a] text-[#ecebf7]" style={{ paddingLeft: "max(16px, env(safe-area-inset-left, 0px))", paddingRight: "max(16px, env(safe-area-inset-right, 0px))" }}>
      <header className="flex items-center gap-3 py-4">
        <p className="font-semibold">{title}</p>
        <span className="text-sm text-[#a9a6c9]">
          {state === "joining" ? "Joining…" : `${tiles.length} of 4 in the call`}
        </span>
      </header>
      <section className={cn("grid flex-1 content-center gap-3", tiles.length > 1 && "sm:grid-cols-2")} aria-label="People in the call">
        {tiles.map((t) => (
          <Tile key={t.id} name={t.name} self={t.self} stream={t.self ? local.current : (streams[t.id] ?? null)} muted={false} video={video} />
        ))}
      </section>
      {tiles.length === 1 && state === "in" && <p className="pt-3 text-center text-sm text-[#a9a6c9]">Waiting for others to join from the group chat.</p>}
      <footer className="flex justify-center gap-3 py-5">
        <Button size="lg" variant="secondary" onClick={toggleMic} aria-pressed={!micOn} aria-label={micOn ? "Mute" : "Unmute"}>
          {micOn ? <MicIcon /> : <MicOffIcon />} {micOn ? "Mute" : "Unmute"}
        </Button>
        {video && (
          <Button size="lg" variant="secondary" onClick={toggleCam} aria-pressed={!camOn} aria-label={camOn ? "Camera off" : "Camera on"}>
            {camOn ? <VideoIcon /> : <VideoOffIcon />} {camOn ? "Camera off" : "Camera on"}
          </Button>
        )}
        <Button size="lg" variant="destructive" onClick={leave}>
          <PhoneOffIcon /> Leave
        </Button>
      </footer>
    </main>
  );
}
