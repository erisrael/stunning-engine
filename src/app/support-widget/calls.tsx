"use client";

// Calls in the support widget: calling an agent (after agreeing to the recording when calls are recorded), the
// waiting message and place in line, hold (music, microphone off), following a transfer to another agent, an
// agent calling the customer, and "Call me back" (the only way when the system takes calls on a phone number).
import * as React from "react";
import { MicIcon, MicOffIcon, PhoneIcon, PhoneOffIcon, SignalHighIcon, SignalLowIcon, SignalMediumIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProximityShade, RouteToggle, useAudioRoute } from "@/components/app/audio-route";
import { Input } from "@/components/ui/input";
import type { IvrScreen } from "@/lib/support-ivr";
import type { Api, Session } from "./widget";
import { shareTelegramPhone } from "./tg";
import { gathered, trickle } from "@/lib/call-ice";

// Telegram's Mini App controls used during a call (each only where this Telegram version has it).
type TgCallApp = {
  HapticFeedback?: { impactOccurred?: (s: "light" | "medium" | "heavy") => void; notificationOccurred?: (t: "error" | "success" | "warning") => void };
  enableClosingConfirmation?: () => void;
  disableClosingConfirmation?: () => void;
  disableVerticalSwipes?: () => void;
  enableVerticalSwipes?: () => void;
  expand?: () => void;
  onEvent?: (e: string, f: () => void) => void;
  offEvent?: (e: string, f: () => void) => void;
};
const tgApp = (): TgCallApp | null => (typeof window === "undefined" ? null : ((window as unknown as { Telegram?: { WebApp?: TgCallApp } }).Telegram?.WebApp ?? null));
const haptic = (kind: "ring" | "success" | "error" | "tap") => {
  const h = tgApp()?.HapticFeedback;
  try {
    if (kind === "ring") h?.impactOccurred?.("heavy");
    else if (kind === "tap") h?.impactOccurred?.("light");
    else h?.notificationOccurred?.(kind);
  } catch {}
};
// While a call rings or runs inside Telegram: closing the app asks first, and a downward swipe does not close it.
function useTelegramCallGuard(active: boolean) {
  React.useEffect(() => {
    const tg = tgApp();
    if (!active || !tg) return;
    try {
      tg.expand?.();
      tg.enableClosingConfirmation?.();
      tg.disableVerticalSwipes?.();
    } catch {}
    return () => {
      try {
        tg.disableClosingConfirmation?.();
        tg.enableVerticalSwipes?.();
      } catch {}
    };
  }, [active]);
}

// Ring tones made in the browser, as in the team's own calls: the incoming ring (two tones, with vibration and a
// Telegram haptic) and a short tone when a call ends.
function tone(kind: "ring" | "end") {
  try {
    const ctx = new AudioContext();
    void ctx.resume().catch(() => {});
    const burst = (freqs: number[], at: number, dur: number, vol: number) => {
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
    };
    const t = ctx.currentTime + 0.05;
    if (kind === "ring") {
      burst([523, 659], t, 0.4, 0.14);
      burst([523, 659], t + 0.6, 0.4, 0.14);
    } else [0, 0.18, 0.36].forEach((d, i) => burst([620 - i * 120], t + d, 0.14, 0.08));
    window.setTimeout(() => void ctx.close().catch(() => {}), 1500);
  } catch {}
}


type Ivr = { on: boolean; message: string; lang: string; audio: string | null; music: boolean; repeatSec: number; position: boolean };

// One sound output for everything the caller hears before an agent answers. Phones (and Telegram's in-app browser)
// only play sound that a tap started, and the waiting sound starts later (when the server says the call is waiting),
// so the Call tap unlocks this output first (unlockCallAudio) and every waiting sound goes through it.
let callAudio: AudioContext | null = null;
export function unlockCallAudio() {
  try {
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (C) {
      callAudio ??= new C();
      void callAudio.resume().catch(() => {});
      // A silent blip makes iPhones treat the output as started by the tap.
      const b = callAudio.createBuffer(1, 1, 22050);
      const src = callAudio.createBufferSource();
      src.buffer = b;
      src.connect(callAudio.destination);
      src.start(0);
    }
    // The spoken message too (iPhone speaks only after a tap has spoken once).
    window.speechSynthesis?.speak(new SpeechSynthesisUtterance(""));
  } catch {}
}
const audioOut = () => {
  if (!callAudio) {
    const C = typeof window === "undefined" ? null : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (C) callAudio = new C();
  }
  void callAudio?.resume().catch(() => {});
  return callAudio;
};

// What the caller hears until an agent answers (Support setup, Waiting message for callers):
// - the recording Admin uploaded, or the message spoken (where the phone has a voice for it), with the place in line
//   and the expected wait, then soft hold music; repeated every few seconds as set;
// - a phone that cannot speak it (Telegram's browser, many Android apps) hears the hold music at once instead of silence;
// - with the waiting message switched off, the ringing tone of a phone call.
// It stops the moment the call is answered or ends.
function useWaitingMessage(active: boolean) {
  const cfg = React.useRef<Ivr | null>(null);
  const [position, setPosition] = React.useState<number | null>(null);
  const said = React.useRef(0);
  // The latest wait estimate, read when the message is spoken (Admin, Support: tell callers the expected wait).
  const waitRef = React.useRef<number | null>(null);
  const tune = React.useRef<number | null>(null);
  const tuneKind = React.useRef<"music" | "ring" | null>(null);
  const nodes = React.useRef(new Set<AudioScheduledSourceNode>());
  const recording = React.useRef<{ url: string; buf: Promise<AudioBuffer | null> } | null>(null);
  const silenceTimer = React.useRef<number | null>(null);
  const play = (n: AudioScheduledSourceNode, at: number, until: number) => {
    nodes.current.add(n);
    n.onended = () => nodes.current.delete(n);
    n.start(at);
    n.stop(until);
  };
  const stopSounds = React.useCallback(() => {
    if (tune.current) window.clearInterval(tune.current);
    tune.current = null;
    tuneKind.current = null;
    if (silenceTimer.current) window.clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
    for (const n of nodes.current) {
      try {
        n.onended = null;
        n.stop();
      } catch {}
    }
    nodes.current.clear();
  }, []);
  const stopAll = React.useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    stopSounds();
    said.current = 0;
  }, [stopSounds]);
  // Soft hold music: a slow chord pattern from the browser, no file needed.
  const music = React.useCallback(() => {
    if (tuneKind.current === "music") return;
    stopSounds();
    const ac = audioOut();
    if (!ac) return;
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    const note = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = notes[i++ % notes.length]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.06, ac.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination);
      play(o, ac.currentTime, ac.currentTime + 1);
    };
    note();
    tuneKind.current = "music";
    tune.current = window.setInterval(note, 1000);
  }, [stopSounds]);
  // The ringing tone of a phone call (425 Hz, one second on, four off), when there is no waiting message.
  const ring = React.useCallback(() => {
    if (tuneKind.current === "ring") return;
    stopSounds();
    const ac = audioOut();
    if (!ac) return;
    const burst = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = 425;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.07, ac.currentTime + 0.03);
      g.gain.setValueAtTime(0.07, ac.currentTime + 0.95);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 1);
      o.connect(g).connect(ac.destination);
      play(o, ac.currentTime, ac.currentTime + 1.05);
    };
    burst();
    tuneKind.current = "ring";
    tune.current = window.setInterval(burst, 5000);
  }, [stopSounds]);
  // After the message: the hold music, or the ringing tone when Admin switched the music off.
  const after = React.useCallback(() => (cfg.current?.music === false ? ring() : music()), [music, ring]);
  const speak = React.useCallback(
    (pos: number | null) => {
      const c = cfg.current;
      if (!c?.on) return;
      said.current = Date.now();
      stopSounds();
      // The uploaded recording, through the unlocked output.
      if (c.audio) {
        const ac = audioOut();
        if (!ac) return after();
        if (recording.current?.url !== c.audio)
          recording.current = {
            url: c.audio,
            buf: fetch(c.audio)
              .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
              .then((b) => ac.decodeAudioData(b))
              .catch(() => null),
          };
        void recording.current.buf.then((buf) => {
          if (!buf || cfg.current !== c) return void (buf ? null : after());
          const src = ac.createBufferSource();
          src.buffer = buf;
          src.connect(ac.destination);
          nodes.current.add(src);
          src.onended = () => {
            nodes.current.delete(src);
            if (cfg.current === c) after();
          };
          src.start();
        });
        return;
      }
      // The message spoken, where this phone has a voice for it.
      const synth = window.speechSynthesis;
      const voices = synth?.getVoices?.() ?? [];
      if (!synth || (voices.length === 0 && /Android|Telegram/i.test(navigator.userAgent))) return after();
      const est = waitRef.current;
      const am = c.lang?.startsWith("am");
      const waitText = est ? (am ? ` ወኪል ለማግኘት በግምት ${Math.max(1, Math.round(est / 60))} ደቂቃ ይጠብቁ።` : ` The expected wait is about ${est < 90 ? "one minute" : `${Math.round(est / 60)} minutes`}.`) : "";
      const text = `${c.message}${c.position && pos && pos > 1 ? (am ? ` በመስመሩ ${pos}ኛ ነዎት።` : ` You are number ${pos} in line.`) : ""}${waitText}`;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = c.lang;
      u.rate = 0.95;
      let started = false;
      u.onstart = () => (started = true);
      u.onend = () => after();
      u.onerror = () => after();
      synth.cancel();
      synth.speak(u);
      // A phone that says nothing (no voice for the language): the music instead of silence.
      silenceTimer.current = window.setTimeout(() => !started && after(), 1500);
    },
    [after, stopSounds],
  );
  React.useEffect(() => {
    if (!active) stopAll();
    return () => stopAll();
  }, [active, stopAll]);
  const update = (ivr: Ivr | null, pos: number | null, estimateSec: number | null = null) => {
    cfg.current = ivr;
    waitRef.current = estimateSec;
    setPosition(pos);
    if (!active) return;
    // No waiting message: the ringing tone, as on a phone.
    if (!ivr?.on) return ring();
    if (!said.current || Date.now() - said.current > ivr.repeatSec * 1000) speak(pos);
  };
  return { update, position };
}

// Soft hold music while the agent has the caller on hold (a slow chord pattern from the browser).
function useHoldTone(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    // Through the output the Call tap unlocked (phones and Telegram play nothing else).
    const ac = audioOut();
    if (!ac) return;
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    const playing = new Set<OscillatorNode>();
    const play = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = notes[i++ % notes.length]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination);
      playing.add(o);
      o.onended = () => playing.delete(o);
      o.start();
      o.stop(ac.currentTime + 1);
    };
    play();
    const t = window.setInterval(play, 1000);
    return () => {
      window.clearInterval(t);
      for (const o of playing) {
        try {
          o.stop();
        } catch {}
      }
    };
  }, [active]);
}

type CallState = "idle" | "consent" | "callback" | "ringing" | "live" | "ended";
type Poll = { status: string; answer: string | null; agent: string | null; position?: number; estimateSec?: number | null; announcement?: string | null; callbackOffer?: boolean; ivr?: Ivr | null; onHold?: boolean; transferTo?: string | null; ice?: unknown[] };
type Begin = { ticketId: string | null; consent: boolean; onTicket: ((id: string) => void) | null; lang: string };

// One call from the widget: calling out (and calling again to follow a transfer), or answering an agent's call;
// hold (music, and the microphone off) and the end.
function useCustomerCall(api: Api) {
  const [state, setState] = React.useState<CallState>("idle");
  const [info, setInfo] = React.useState<string | null>(null);
  const [secs, setSecs] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  // The microphone was refused (Telegram's in-app browser does this on some phones): offer the browser or a call-back.
  const [micBlocked, setMicBlocked] = React.useState(false);
  const ref = React.useRef<{ pc?: RTCPeerConnection; mic?: MediaStream; poll?: number; timer?: number; callId?: string; consent?: boolean; ticketId?: string | null; begin?: Begin; connectTimer?: number; servers?: RTCIceServer[]; ice?: ReturnType<typeof trickle> }>({});
  // The phone menu (IVR) before the call, and what the queue tells a waiting caller.
  const [ivr, setIvr] = React.useState<IvrScreen | null>(null);
  const [queue, setQueue] = React.useState<{ estimateSec: number | null; announcement: string | null; callbackOffer: boolean } | null>(null);
  // The agent's voice. It can arrive before the call bar (and its player) is on screen: answering a call sets up the
  // connection while the ringing screen still shows. So the stream is kept and given to the player whenever it
  // mounts, and played explicitly: a Telegram or phone browser may refuse autoplay, and then a tap turns sound on.
  const remote = React.useRef<MediaStream | null>(null);
  const player = React.useRef<HTMLAudioElement | null>(null);
  const [soundBlocked, setSoundBlocked] = React.useState(false);
  const playRemote = React.useCallback(() => {
    const el = player.current;
    if (!el || !remote.current) return;
    if (el.srcObject !== remote.current) el.srcObject = remote.current;
    el.muted = false;
    void el.play().then(
      () => setSoundBlocked(false),
      () => setSoundBlocked(true),
    );
  }, []);
  const audio = React.useCallback(
    (el: HTMLAudioElement | null) => {
      player.current = el;
      if (el) playRemote();
    },
    [playRemote],
  );
  const waiting = useWaitingMessage(state === "ringing");
  useHoldTone(state === "live" && held);
  // In-call controls as in the team's calls: mute, the connection's quality, reconnecting, and a time limit to connect.
  const [muted, setMuted] = React.useState(false);
  const mutedRef = React.useRef(false);
  const [quality, setQuality] = React.useState<"good" | "fair" | "poor" | null>(null);
  const [reconnecting, setReconnecting] = React.useState(false);
  useTelegramCallGuard(state === "ringing" || state === "live");
  const toggleMute = () => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    haptic("tap");
    ref.current.mic?.getTracks().forEach((t) => (t.enabled = !m && !held));
  };
  // Connection quality from the browser's own statistics (round trip and lost packets), every three seconds.
  React.useEffect(() => {
    if (state !== "live") return setQuality(null);
    let last = { lost: 0, got: 0 };
    const t = window.setInterval(async () => {
      const pc = ref.current.pc;
      if (!pc) return;
      try {
        let rtt = 0;
        let lost = 0;
        let got = 0;
        (await pc.getStats()).forEach((r: { type: string; state?: string; nominated?: boolean; currentRoundTripTime?: number; kind?: string; packetsLost?: number; packetsReceived?: number }) => {
          if (r.type === "candidate-pair" && r.state === "succeeded" && r.nominated && r.currentRoundTripTime) rtt = r.currentRoundTripTime;
          if (r.type === "inbound-rtp" && r.kind === "audio") (lost = r.packetsLost ?? 0), (got = r.packetsReceived ?? 0);
        });
        const dl = lost - last.lost;
        const dg = got - last.got;
        last = { lost, got };
        const loss = dg + dl > 0 ? dl / (dg + dl) : 0;
        setQuality(rtt > 0.6 || loss > 0.1 ? "poor" : rtt > 0.3 || loss > 0.03 ? "fair" : "good");
      } catch {}
    }, 3000);
    return () => window.clearInterval(t);
  }, [state]);

  const clear = () => {
    const p = ref.current;
    if (p.poll) window.clearInterval(p.poll);
    if (p.timer) window.clearInterval(p.timer);
    p.poll = p.timer = undefined;
    p.pc?.close();
    p.pc = undefined;
  };
  const stop = React.useCallback(
    async (tell: boolean) => {
      const p = ref.current;
      const id = p.callId;
      clear();
      p.mic?.getTracks().forEach((t) => t.stop());
      p.mic = undefined;
      setHeld(false);
      setReconnecting(false);
      mutedRef.current = false;
      setMuted(false);
      if (p.connectTimer) window.clearTimeout(p.connectTimer);
      if (id) tone("end");
      if (tell && id) await api(`calls/${id}/end`, {}).catch(() => {});
      // Nothing was calling (the widget closing, a menu left): back to the start, not "Call ended".
      setState(id ? "ended" : "idle");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api],
  );
  React.useEffect(() => () => void stop(false), [stop]);

  const newPc = async () => {
    const ice = await api<{ iceServers: RTCIceServer[] }>("ice");
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    // Addresses found after the offer or answer go to the agent through the server (see lib/call-ice).
    const tr = trickle(pc, (candidate) => (ref.current.callId && ref.current.pc === pc ? api(`calls/${ref.current.callId}/ice`, { candidate }) : Promise.resolve()));
    Object.assign(ref.current, { servers: ice.iceServers, ice: tr });
    // What this browser sees of the audio goes into the call's lifecycle on the server.
    pc.onconnectionstatechange = () => {
      const id = ref.current.callId;
      const st = pc.connectionState === "connected" ? "connected" : pc.connectionState === "failed" ? "failed" : null;
      if (id && st) void api(`calls/${id}/state`, { state: st }).catch(() => {});
      // A dropped network often comes back on its own: say so instead of ending the call.
      setReconnecting(pc.connectionState === "disconnected");
      if (pc.connectionState === "connected" && ref.current.connectTimer) {
        window.clearTimeout(ref.current.connectTimer);
        ref.current.connectTimer = undefined;
      }
      if (pc.connectionState === "failed") {
        haptic("error");
        setInfo("The call lost its connection.");
        void stop(false);
      }
    };
    const mic = ref.current.mic ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    Object.assign(ref.current, { pc, mic });
    mic.getTracks().forEach((t) => ((t.enabled = true), pc.addTrack(t, mic)));
    remote.current = null;
    pc.ontrack = (e) => {
      const st = (remote.current ??= e.streams[0] ?? new MediaStream());
      if (!st.getTracks().includes(e.track)) st.addTrack(e.track);
      playRemote();
    };
    return pc;
  };

  const live = (agent: string | null) => {
    setInfo(agent ? `You are talking with ${agent}` : null);
    setState("live");
    haptic("success");
    window.setTimeout(playRemote, 0);
    if (!ref.current.timer) ref.current.timer = window.setInterval(() => setSecs((x) => x + 1), 1000);
    // Answered but no sound path within 25 seconds (a network that blocks calls): end it and say why.
    const pc = ref.current.pc;
    if (pc && pc.connectionState !== "connected" && !ref.current.connectTimer)
      ref.current.connectTimer = window.setTimeout(() => {
        ref.current.connectTimer = undefined;
        if (ref.current.pc !== pc || pc.connectionState === "connected") return;
        const id = ref.current.callId;
        if (id) void api(`calls/${id}/state`, { state: "failed" }).catch(() => {});
        setInfo("The call could not connect on this network. Try Wi-Fi or mobile data, or ask us to call you back.");
        void stop(false);
      }, 25_000);
  };

  // While connected: hold, a transfer (call again, to the new agent), the end.
  const follow = (callId: string, pc: RTCPeerConnection, outgoing: boolean) => {
    ref.current.callId = callId;
    const tr = ref.current.ice;
    tr?.start();
    ref.current.poll = window.setInterval(async () => {
      const k = await api<Poll>(`calls/${callId}`).catch(() => null);
      if (!k || ref.current.callId !== callId) return;
      if (k.status === "ringing") {
        waiting.update(k.ivr ?? null, k.position ?? null, k.estimateSec ?? null);
        setQueue({ estimateSec: k.estimateSec ?? null, announcement: k.announcement ?? null, callbackOffer: k.callbackOffer !== false });
      } else setQueue(null);
      if (outgoing && k.status === "answered" && k.answer && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(JSON.parse(k.answer) as RTCSessionDescriptionInit);
        live(k.agent);
      }
      // The agent's addresses found after their answer or offer.
      if (k.status === "answered" && k.ice?.length) void tr?.add(k.ice);
      if (k.status === "answered") {
        const h = !!k.onHold;
        setHeld(h);
        ref.current.mic?.getTracks().forEach((t) => (t.enabled = !h && !mutedRef.current));
      }
      if (k.status === "transferred") {
        clear();
        setHeld(false);
        setInfo(`Transferring you to ${k.transferTo ?? "a colleague"}…`);
        setState("ringing");
        void call(ref.current.ticketId ?? null, ref.current.consent ?? true, null, callId);
      }
      if (["ended", "missed", "declined"].includes(k.status)) {
        setInfo(k.status === "missed" ? "Nobody could answer. We will write to you here." : "The call has ended.");
        await stop(false);
      }
    }, 1500);
  };

  const call = async (ticketId: string | null, consent: boolean, onTicket: ((id: string) => void) | null, transferFrom: string | null = null, ivrSession: string | null = null) => {
    if (!transferFrom) setInfo(null);
    try {
      const pc = await newPc();
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc, ref.current.servers);
      setState("ringing");
      const r = await api<{ callId: string; ticketId: string }>("calls", { ticketId, offer: JSON.stringify(pc.localDescription), consent, transferFrom, ivrSession });
      Object.assign(ref.current, { consent, ticketId: r.ticketId });
      if (!ticketId && onTicket) onTicket(r.ticketId);
      follow(r.callId, pc, true);
    } catch (e) {
      const blocked = e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message);
      setMicBlocked(blocked);
      setInfo(blocked ? "The microphone is not allowed here. Open this page in your browser, or ask us to call you back." : e instanceof Error ? e.message : "The call could not start.");
      await stop(false);
    }
  };

  const accept = async (c: Incoming) => {
    unlockCallAudio();
    try {
      const pc = await newPc();
      await pc.setRemoteDescription(JSON.parse(c.offer) as RTCSessionDescriptionInit);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc, ref.current.servers);
      ref.current.callId = c.id;
      await api(`calls/${c.id}/accept`, { answer: JSON.stringify(pc.localDescription), consent: true });
      void api(`calls/${c.id}/state`, { state: "connecting" }).catch(() => {});
      Object.assign(ref.current, { consent: true, ticketId: c.ticketId });
      live(c.agent);
      follow(c.id, pc, false);
    } catch (e) {
      const blocked = e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message);
      setMicBlocked(blocked);
      setInfo(blocked ? "The microphone is not allowed here. Open this page in your browser, or ask us to call you back." : e instanceof Error ? e.message : "The call could not connect.");
      await stop(false);
    }
  };

  // Tapping Call: the active phone menu first (when there is one), then the call to the queue it chose.
  const begin = async (b: Begin) => {
    unlockCallAudio();
    ref.current.begin = b;
    setInfo(null);
    const sc = await api<IvrScreen | null>("ivr", { lang: b.lang }).catch(() => null);
    if (sc && (sc.ask || sc.done)) return setIvr(sc);
    await call(b.ticketId, b.consent, b.onTicket);
  };
  const routed = (sessionId: string) => {
    const b = ref.current.begin;
    setIvr(null);
    void call(b?.ticketId ?? null, b?.consent ?? true, b?.onTicket ?? null, null, sessionId);
  };
  // "Change topic" while waiting: the call ends and the menu starts again.
  const restart = async () => {
    await stop(true);
    setState("idle");
    setSecs(0);
    if (ref.current.begin) await begin(ref.current.begin);
  };

  return { state, setState, info, secs, setSecs, held, audio, soundBlocked, playRemote, waiting, call, accept, stop, micBlocked, setMicBlocked, ivr, setIvr, begin, routed, restart, queue, muted, toggleMute, quality, reconnecting };
}

function CallBar({ c, onOk, onCallback }: { c: ReturnType<typeof useCustomerCall>; onOk: () => void; onCallback: () => void }) {
  const { state, info, secs, held, waiting, queue } = c;
  // The loudspeaker or the earpiece, the screen kept on, and the proximity shade (shared with the team's calls).
  const route = useAudioRoute(state === "live", "voice");
  const mins = queue?.estimateSec ? Math.max(1, Math.round(queue.estimateSec / 60)) : null;
  return (
    <div className="space-y-2">
    {state === "ringing" && queue && (
      <div className="space-y-1 rounded-lg bg-muted/50 p-2 text-xs" data-call-queue>
        {queue.announcement && <p>{queue.announcement}</p>}
        {mins !== null && <p data-call-estimate>About {mins} minute{mins === 1 ? "" : "s"} to wait.</p>}
        <div className="flex flex-wrap gap-2">
          {queue.callbackOffer && (
            <Button size="xs" variant="outline" onClick={async () => (await c.stop(true), c.setState("idle"), onCallback())} data-call-instead-callback>
              Call me back instead
            </Button>
          )}
          {c.ivr === null && (
            <Button size="xs" variant="ghost" onClick={() => void c.restart()} data-call-change-topic>
              Change topic
            </Button>
          )}
        </div>
      </div>
    )}
    <div className="flex items-center gap-2 rounded-lg border p-2 text-sm" data-call-state={held && state === "live" ? "hold" : state}>
      <audio ref={c.audio} autoPlay playsInline data-call-audio />
      {state === "live" && c.soundBlocked && (
        <Button size="xs" onClick={c.playRemote} data-call-sound>
          Tap to hear the agent
        </Button>
      )}
      <ProximityShade near={route.near} locked={route.locked} />
      {state === "live" && c.quality && (
        <span title="Connection quality" aria-label={`Connection ${c.quality}`} data-call-quality={c.quality}>
          {c.quality === "good" ? <SignalHighIcon className="size-4 text-emerald-600" /> : c.quality === "fair" ? <SignalMediumIcon className="size-4 text-amber-500" /> : <SignalLowIcon className="size-4 text-red-500" />}
        </span>
      )}
      <span className="flex-1" aria-live="polite">
        {state === "ringing"
          ? (info ?? (waiting.position && waiting.position > 1 ? `Calling… you are number ${waiting.position} in line` : "Calling… please hold"))
          : state === "live"
            ? held
              ? "On hold, please wait…"
              : c.reconnecting
                ? "Reconnecting…"
                : `${info ?? "Connected"} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
            : (info ?? "Call ended")}
      </span>
      {state === "ended" ? (
        <Button size="sm" variant="ghost" onClick={onOk}>
          OK
        </Button>
      ) : (
        <>
          {state === "live" && (
            <>
              <Button size="icon-sm" variant={c.muted ? "default" : "outline"} aria-label={c.muted ? "Unmute" : "Mute"} aria-pressed={c.muted} onClick={c.toggleMute} data-call-mute={c.muted ? "on" : "off"}>
                {c.muted ? <MicOffIcon /> : <MicIcon />}
              </Button>
              <RouteToggle route={route.route} onToggle={route.toggle} realOutputs={route.realOutputs} className="inline-flex size-8 items-center justify-center rounded-md border [&_svg]:size-4" />
            </>
          )}
          <Button size="sm" variant="destructive" onClick={() => void c.stop(true)} data-call-end>
            <PhoneOffIcon /> End
          </Button>
        </>
      )}
    </div>
    </div>
  );
}

// The phone menu on screen: each prompt is spoken in the caller's language (or its recording plays) and shows as text;
// the choices are a keypad. Pressing nothing for the flow's wait counts as no answer, as on a phone.
function IvrPlayer({ api, c, color, onCallback }: { api: Api; c: ReturnType<typeof useCustomerCall>; color: string; onCallback: () => void }) {
  const sc = c.ivr!;
  const [digits, setDigits] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [voice, setVoice] = React.useState<{ maxSec: number } | null>(null);
  const press = React.useCallback(
    async (key: string) => {
      setBusy(true);
      setDigits("");
      try {
        c.setIvr(await api<IvrScreen>(`ivr/${sc.sessionId}`, { key }));
      } catch (e) {
        c.setIvr({ ...sc, say: [{ text: e instanceof Error ? e.message : "The menu has ended.", audioUrl: null }], ask: null, done: { action: "end" } });
      }
      setBusy(false);
    },
    [api, c, sc],
  );
  // Speak or play the prompts of each new screen.
  React.useEffect(() => {
    let cancelled = false;
    let player: HTMLAudioElement | null = null;
    const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
    synth?.cancel();
    void (async () => {
      for (const p of sc.say) {
        if (cancelled) return;
        if (p.audioUrl) {
          player = new Audio(p.audioUrl);
          await new Promise<void>((res) => ((player!.onended = () => res()), (player!.onerror = () => res()), void player!.play().catch(() => res())));
        } else if (synth && p.text) {
          const u = new SpeechSynthesisUtterance(p.text);
          u.lang = sc.lang === "am" ? "am-ET" : "en-US";
          await new Promise<void>((res) => ((u.onend = () => res()), (u.onerror = () => res()), synth.speak(u)));
        }
      }
    })();
    return () => {
      cancelled = true;
      synth?.cancel();
      player?.pause();
    };
  }, [sc]);
  // No key in time: the engine repeats or falls back.
  React.useEffect(() => {
    if (!sc.ask) return;
    const speaking = sc.say.reduce((n, p) => n + p.text.length * 70, 0);
    const t = window.setTimeout(() => void press("#timeout"), sc.ask.timeoutSec * 1000 + speaking);
    return () => window.clearTimeout(t);
  }, [sc, press, digits]);
  // The menu chose where the call goes.
  React.useEffect(() => {
    const d = sc.done;
    if (!d) return;
    if (d.action === "queue" || d.action === "agent") c.routed(sc.sessionId);
    else if (d.action === "voicemail") setVoice({ maxSec: d.maxSec ?? 120 });
    else if (d.action === "callback") {
      c.setIvr(null);
      onCallback();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sc]);
  const leave = async () => {
    c.setIvr(null);
    speechSynthesis?.cancel();
    await api(`ivr/${sc.sessionId}/leave`, {}).catch(() => {});
  };
  if (voice) return <VoiceMessage api={api} sessionId={sc.sessionId} maxSec={voice.maxSec} color={color} prompt={sc.say.map((p) => p.text).join(" ")} onClose={() => c.setIvr(null)} />;
  return (
    <div className="space-y-2 rounded-lg border p-2 text-sm" data-ivr-player data-ivr-lang={sc.lang}>
      <div className="space-y-1">
        {sc.say.map((p, i) => (
          <p key={i} className={i === sc.say.length - 1 ? "" : "text-muted-foreground"}>{p.text}</p>
        ))}
      </div>
      {sc.ask?.kind === "choice" && (
        <div className="grid gap-1">
          {sc.ask.options.map((o) => (
            <Button key={o.key} variant="outline" size="sm" className="justify-start" disabled={busy} onClick={() => void press(o.key)} data-ivr-choice={o.key}>
              <span className="w-5 font-semibold tabular-nums">{o.key}</span> {o.label}
            </Button>
          ))}
        </div>
      )}
      {sc.ask?.kind === "digits" && (
        <div className="space-y-1">
          <Input aria-label="Number" readOnly value={digits} className="text-center tabular-nums" />
          <div className="grid grid-cols-3 gap-1">
            {"1234567890".split("").map((k) => (
              <Button key={k} size="sm" variant="outline" disabled={busy || digits.length >= (sc.ask?.maxDigits ?? 10)} onClick={() => setDigits(digits + k)}>{k}</Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setDigits(digits.slice(0, -1))}>⌫</Button>
            <Button size="sm" className="text-white" style={{ background: color }} disabled={busy || !digits} onClick={() => void press(digits)}>Send</Button>
          </div>
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => void leave()} data-ivr-leave>
          {sc.done?.action === "end" ? "OK" : <><PhoneOffIcon /> Hang up</>}
        </Button>
      </div>
    </div>
  );
}

// A voice message from the phone menu: record up to the limit, then it goes to the conversation.
function VoiceMessage({ api, sessionId, maxSec, color, prompt, onClose }: { api: Api; sessionId: string; maxSec: number; color: string; prompt: string; onClose: () => void }) {
  const [state, setState] = React.useState<"ready" | "recording" | "sending" | "sent" | "error">("ready");
  const [left, setLeft] = React.useState(maxSec);
  const [msg, setMsg] = React.useState<string | null>(null);
  const rec = React.useRef<{ r?: MediaRecorder; chunks: Blob[]; t?: number; stream?: MediaStream }>({ chunks: [] });
  const finish = React.useCallback(() => rec.current.r?.state === "recording" && rec.current.r.stop(), []);
  React.useEffect(() => () => (window.clearInterval(rec.current.t), rec.current.stream?.getTracks().forEach((t) => t.stop())), []);
  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      rec.current = { r, chunks: [], stream };
      r.ondataavailable = (e) => e.data.size && rec.current.chunks.push(e.data);
      r.onstop = async () => {
        window.clearInterval(rec.current.t);
        stream.getTracks().forEach((t) => t.stop());
        setState("sending");
        const blob = new Blob(rec.current.chunks, { type: r.mimeType || "audio/webm" });
        const data = await new Promise<string>((res) => {
          const fr = new FileReader();
          fr.onload = () => res(String(fr.result).split(",")[1] ?? "");
          fr.readAsDataURL(blob);
        });
        try {
          await api("voicemail", { sessionId, mime: blob.type, data });
          setState("sent");
        } catch (e) {
          setMsg(e instanceof Error ? e.message : "The message could not be sent.");
          setState("error");
        }
      };
      r.start(1000);
      setState("recording");
      setLeft(maxSec);
      rec.current.t = window.setInterval(() => setLeft((x) => (x <= 1 ? (finish(), 0) : x - 1)), 1000);
    } catch {
      setMsg("The microphone is not allowed here. Write to us instead.");
      setState("error");
    }
  };
  return (
    <div className="space-y-2 rounded-lg border p-2 text-sm" data-voice-message={state}>
      <p>{state === "sent" ? "Thank you. We got your message and will answer here." : (msg ?? prompt)}</p>
      <div className="flex gap-2">
        {state === "ready" && (
          <Button size="sm" className="text-white" style={{ background: color }} onClick={() => void start()} data-voice-start>
            <MicIcon /> Record
          </Button>
        )}
        {state === "recording" && (
          <Button size="sm" variant="destructive" onClick={finish} data-voice-stop>
            <SquareIcon /> Send ({left} s)
          </Button>
        )}
        {state === "sending" && <span className="text-xs text-muted-foreground">Sending…</span>}
        {(state === "ready" || state === "sent" || state === "error") && (
          <Button size="sm" variant="ghost" onClick={onClose}>{state === "sent" ? "OK" : "Close"}</Button>
        )}
      </div>
    </div>
  );
}

// "Ask us to call you": a phone number, and a waiting call-back for the team.
function CallbackForm({ api, ticketId, color, onClose, knownPhone = null }: { api: Api; ticketId: string | null; color: string; onClose: () => void; knownPhone?: string | null }) {
  const [phone, setPhone] = React.useState(knownPhone ?? "");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-2 rounded-lg border p-2 text-xs" data-callback-form>
      {msg ? (
        <p>{msg}</p>
      ) : (
        <>
          <p>{phone ? "We will call you on this number." : "Share your number and we will call you."}</p>
          <SharePhone api={api} color={color} onShared={setPhone} compact />
          <Input aria-label="Your phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+251 9..." value={phone} onChange={(e) => setPhone(e.target.value)} />
        </>
      )}
      <div className="flex gap-2">
        {!msg && (
          <Button
            size="sm"
            className="text-white"
            style={{ background: color }}
            disabled={busy || !phone.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ again: boolean }>("callback", { phone, ticketId });
                setMsg(r.again ? "We already have your request. We will call you soon." : "Thank you. We will call you soon.");
              } catch (e) {
                setMsg(e instanceof Error ? e.message : "Could not send.");
              }
              setBusy(false);
            }}
            data-callback-send
          >
            Call me back
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          {msg ? "OK" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

// "Share my phone number": in Telegram its own one-tap prompt; elsewhere the phone's number from autofill. Saved
// on the customer (POST phone), so call-backs and the agents have it and nobody types it again.
export function SharePhone({ api, color, onShared, compact = false }: { api: Api; color: string; onShared: (phone: string) => void; compact?: boolean }) {
  const [busy, setBusy] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);
  const tg = typeof window !== "undefined" && !!(window as unknown as { Telegram?: { WebApp?: { requestContact?: unknown } } }).Telegram?.WebApp?.requestContact;
  const save = async (n: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await api<{ phone: string }>("phone", { phone: n });
      onShared(r.phone);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save the number.");
    }
    setBusy(false);
  };
  if (tg)
    return (
      <div className="space-y-1">
        <Button
          size={compact ? "sm" : "default"}
          className="w-full text-white"
          style={{ background: color }}
          disabled={busy}
          onClick={async () => {
            const n = await shareTelegramPhone();
            if (n) await save(n);
          }}
          data-share-phone
        >
          <PhoneIcon /> Share my phone number
        </Button>
        {err && <p className="text-xs text-[#D93025]">{err}</p>}
      </div>
    );
  if (compact) return null;
  return (
    <form className="flex gap-2" onSubmit={(e) => (e.preventDefault(), void save(typed))}>
      <Input aria-label="Your phone number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+251 9..." value={typed} onChange={(e) => setTyped(e.target.value)} className="flex-1" />
      <Button type="submit" className="text-white" style={{ background: color }} disabled={busy || typed.trim().length < 9} data-share-phone>
        Save
      </Button>
      {err && <p className="text-xs text-[#D93025]">{err}</p>}
    </form>
  );
}

// Calling an agent: the browser asks for the microphone, the call rings in the desk, and the agent answers there.
// When the system takes calls on a phone number instead, the number and "Ask us to call you".
type Call = ReturnType<typeof useCustomerCall>;
const CallCtx = React.createContext<Call | null>(null);

// In a conversation (compact) it shows nothing until the phone button in the header is tapped, as in a chat app:
// then the recording question, the call itself, or "Call me back" when nobody is online.
export const CALL_EVENT = "myseed:support-call";
export function CallButton({ api, s, ticketId, color, onTicket, lang = "en", compact = false }: { api: Api; s: Session; ticketId: string | null; color: string; onTicket: (id: string) => void; lang?: string; compact?: boolean }) {
  const c = React.useContext(CallCtx)!;
  const [agree, setAgree] = React.useState(false);
  const [mode, setMode] = React.useState<"idle" | "consent" | "callback">("idle");
  const start = React.useRef<() => void>(() => {});
  start.current = () => {
    if (c.state !== "idle" || c.ivr) return;
    // A closed line: ask to be called back; otherwise call and wait in the line.
    if (s.schedule && !s.schedule.status.open) return setMode("callback");
    if (s.recordCalls) return setMode("consent");
    void c.begin({ ticketId, consent: true, onTicket, lang });
  };
  React.useEffect(() => {
    if (!compact) return;
    const on = () => start.current();
    window.addEventListener(CALL_EVENT, on);
    return () => window.removeEventListener(CALL_EVENT, on);
  }, [compact]);
  if (s.channels?.calls === false) return null;
  if (s.callEngine?.engine === "phone")
    return mode === "callback" ? (
      <CallbackForm api={api} ticketId={ticketId} color={color} knownPhone={s.customer.phone ?? null} onClose={() => setMode("idle")} />
    ) : (
      <div className="flex gap-2" data-call-phone-engine>
        {s.callEngine.phone && (
          <Button variant="outline" className="flex-1" asChild>
            <a href={`tel:${s.callEngine.phone.replace(/[^\d+]/g, "")}`}>
              <PhoneIcon /> Call {s.callEngine.phone}
            </a>
          </Button>
        )}
        <Button variant="outline" className="flex-1" onClick={() => setMode("callback")} data-ask-callback>
          Ask us to call you
        </Button>
      </div>
    );
  if (c.state === "idle" && mode === "callback") return <CallbackForm api={api} ticketId={ticketId} color={color} knownPhone={s.customer.phone ?? null} onClose={() => setMode("idle")} />;
  if (c.ivr) return null;
  if (c.state === "idle" && mode === "idle" && compact) return null;
  if (c.state === "idle" && mode === "idle")
    return (
      <div className="flex gap-2">
        {!(s.schedule && !s.schedule.status.open) && (
          <Button variant="outline" className="flex-1" onClick={() => (s.recordCalls ? setMode("consent") : void c.begin({ ticketId, consent: true, onTicket, lang }))} data-call-us>
            <PhoneIcon /> Call us
          </Button>
        )}
        <Button variant="ghost" className={!(s.schedule && !s.schedule.status.open) ? "" : "w-full"} onClick={() => setMode("callback")} data-ask-callback>
          Call me back
        </Button>
      </div>
    );
  if (c.state === "idle" && mode === "consent")
    return (
      <div className="space-y-2 rounded-lg border p-2 text-xs" data-call-consent>
        <p>{s.recordingNotice}</p>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I agree
        </label>
        <div className="flex gap-2">
          <Button size="sm" className="text-white" style={{ background: color }} disabled={!agree} onClick={() => (setMode("idle"), void c.begin({ ticketId, consent: agree, onTicket, lang }))}>
            <PhoneIcon /> Call
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
            Cancel
          </Button>
        </div>
      </div>
    );
  // A call in progress shows at the top of the widget (CallLayer).
  return null;
}

type Incoming = { id: string; offer: string; agent: string | null; ticketId: string | null; record: boolean; notice: string | null; startedAt?: string; ringSeconds?: number };

// While a call rings: the phone vibrates and a soft tone plays (when the browser allows), and the seconds left show.
function useRinging(ring: Incoming | null) {
  const [left, setLeft] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (!ring) return setLeft(null);
    const end = Date.parse(ring.startedAt ?? new Date().toISOString()) + (ring.ringSeconds ?? 45) * 1000;
    const beep = () => {
      navigator.vibrate?.([400, 200, 400]);
      haptic("ring");
      tone("ring");
    };
    const tick = () => setLeft(Math.max(0, Math.round((end - Date.now()) / 1000)));
    tick();
    beep();
    const t1 = window.setInterval(tick, 1000);
    const t2 = window.setInterval(beep, 3000);
    return () => {
      window.clearInterval(t1);
      window.clearInterval(t2);
      navigator.vibrate?.(0);
    };
  }, [ring]);
  return left;
}
// Open this page outside Telegram's in-app browser (where the microphone may be refused).
const openInBrowser = () => {
  const tg = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(window.location.href);
  else window.open(window.location.href, "_blank");
};

// The widget's one call, shown at the top whichever page is open (so it carries on when the conversation opens),
// and an agent calling the customer: it rings here while the panel is open; answer (agreeing to the recording when
// calls are recorded) or decline.
export function CallLayer({ api, s, children, openedForCall = false, onBusy }: { api: Api; s: Session; children: React.ReactNode; openedForCall?: boolean; onBusy?: (busy: boolean) => void }) {
  const c = useCustomerCall(api);
  const [ring, setRing] = React.useState<Incoming | null>(null);
  // Tells the page when a call rings, runs or plays the phone menu (Telegram's main button steps aside then).
  const busy = c.state !== "idle" || !!ring || !!c.ivr;
  React.useEffect(() => onBusy?.(busy), [busy, onBusy]);
  // A page reload (a new version, components/app/version-watch) waits while a call rings or runs.
  React.useEffect(() => {
    document.documentElement.dataset.callActive = busy ? "1" : "";
  }, [busy]);
  const [askBack, setAskBack] = React.useState(false);
  // Opened from the bot's "is calling you" notice: show that the call is being found, or that it was missed.
  const [finding, setFinding] = React.useState(openedForCall);
  const [missed, setMissed] = React.useState<{ agent: string | null; at: string } | null>(null);
  const [answering, setAnswering] = React.useState(false);
  const idle = c.state === "idle";
  const left = useRinging(idle ? ring : null);
  useTelegramCallGuard(idle && !!ring);
  // As the team's calls do: check now, every 2.5 seconds, and the moment the app comes back to the front (Telegram
  // pauses a Mini App in the background).
  React.useEffect(() => {
    if (!idle || s.channels?.calls === false || s.callEngine?.engine === "phone") return;
    let stop = false;
    const tick = async () => {
      const r = await api<{ call: Incoming | null; missed?: { agent: string | null; at: string } | null }>("calls/incoming").catch(() => null);
      if (stop || !r) return;
      setRing(r.call);
      setFinding((f) => {
        if (f && !r.call && r.missed) setMissed(r.missed);
        return false;
      });
    };
    void tick();
    const t = window.setInterval(tick, 2500);
    const wake = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", wake);
    const tg = tgApp();
    tg?.onEvent?.("activated", wake);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", wake);
      tg?.offEvent?.("activated", wake);
    };
  }, [api, idle, s.channels?.calls, s.callEngine?.engine]);
  return (
    <CallCtx.Provider value={c}>
      {!idle && (
        <div className="px-4 pt-3">
          <CallBar c={c} onOk={() => (c.setState("idle"), c.setSecs(0), setRing(null))} onCallback={() => setAskBack(true)} />
        </div>
      )}
      {idle && c.ivr && (
        <div className="px-4 pt-3">
          <IvrPlayer api={api} c={c} color={s.app.color ?? "#1A73E8"} onCallback={() => setAskBack(true)} />
        </div>
      )}
      {c.micBlocked && (
        <div className="space-y-2 border-b px-4 py-3 text-sm" data-mic-blocked>
          <p>{c.info}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={openInBrowser} data-open-browser>Open in my browser</Button>
            <Button size="sm" variant="outline" onClick={() => (setAskBack(true), c.setMicBlocked(false))} data-mic-callback>Call me back</Button>
            <Button size="sm" variant="ghost" onClick={() => c.setMicBlocked(false)}>Close</Button>
          </div>
        </div>
      )}
      {askBack && <div className="px-4 pt-3"><CallbackForm api={api} ticketId={null} color={s.app.color ?? "#1A73E8"} knownPhone={s.customer.phone ?? null} onClose={() => setAskBack(false)} /></div>}
      {idle && finding && !ring && (
        <div className="border-b px-4 py-3 text-sm" data-call-finding>Connecting you to the call…</div>
      )}
      {idle && !ring && missed && (
        <div className="space-y-2 border-b px-4 py-3 text-sm" data-call-missed>
          <p>
            You missed a call from {missed.agent ?? "our support team"} at {new Date(missed.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.
          </p>
          {s.recordCalls && <p className="text-xs text-muted-foreground">{s.recordingNotice} Calling back means you agree.</p>}
          <div className="flex gap-2">
            <Button size="sm" className="text-white" style={{ background: "#188038" }} onClick={() => (setMissed(null), void c.begin({ ticketId: null, consent: true, onTicket: null, lang: document.documentElement.lang === "am" ? "am" : "en" }))} data-call-back>
              <PhoneIcon /> Call back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMissed(null)}>Not now</Button>
          </div>
        </div>
      )}
      {idle && ring && (
        // Full screen, as a phone shows a call: who is calling, the time left, the recording notice, answer or decline.
        <div role="dialog" aria-modal="true" aria-label={`${ring.agent ?? "Support"} is calling you`} className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-6 py-10 text-center" data-incoming-call>
          <div className="space-y-2 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.app.name} support</p>
            <div className="mx-auto flex size-20 items-center justify-center rounded-full text-3xl font-semibold text-white motion-safe:animate-pulse" style={{ background: s.app.color ?? "#1A73E8" }} aria-hidden>
              {(ring.agent ?? "S").slice(0, 1).toUpperCase()}
            </div>
            <p className="text-xl font-semibold">{ring.agent ?? "Support"} is calling you</p>
            {left !== null && <p className="text-sm text-muted-foreground" data-ring-left>Rings for {left} more second{left === 1 ? "" : "s"}. Nothing connects until you answer.</p>}
            {ring.record && ring.notice && <p className="text-xs text-muted-foreground">{ring.notice} Answering means you agree.</p>}
          </div>
          <div className="flex w-full max-w-xs items-start justify-around">
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Decline"
                className="flex size-16 items-center justify-center rounded-full bg-red-600 text-white shadow-lg [&_svg]:size-7"
                onClick={async () => (haptic("tap"), setRing(null), await api(`calls/${ring.id}/decline`, {}).catch(() => {}))}
                data-decline-call
              >
                <PhoneOffIcon />
              </button>
              <span className="text-xs">Decline</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <button
                type="button"
                aria-label="Answer"
                disabled={answering}
                className="flex size-16 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg disabled:opacity-60 [&_svg]:size-7"
                onClick={async () => {
                  setAnswering(true);
                  haptic("tap");
                  const r = ring;
                  setRing(null);
                  await c.accept(r);
                  setAnswering(false);
                }}
                data-answer-call
              >
                <PhoneIcon />
              </button>
              <span className="text-xs">Answer</span>
            </div>
          </div>
        </div>
      )}
      {children}
    </CallCtx.Provider>
  );
}
