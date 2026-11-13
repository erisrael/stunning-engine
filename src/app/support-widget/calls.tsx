"use client";

// Calls in the support widget: calling an agent (after agreeing to the recording when calls are recorded), the
// waiting message and place in line, hold (music, microphone off), following a transfer to another agent, an
// agent calling the customer, and "Call me back" (the only way when the system takes calls on a phone number).
import * as React from "react";
import { PhoneIcon, PhoneOffIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Api, Session } from "./widget";

async function gathered(pc: RTCPeerConnection, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && (window.clearTimeout(t), resolve()));
  });
}

type Ivr = { on: boolean; message: string; lang: string; audio: string | null; music: boolean; repeatSec: number; position: boolean };

// What the caller hears until an agent answers: the recording Admin uploaded, or the message spoken in their browser,
// with their place in line, then soft hold music; repeated. It stops the moment the call is answered or ends.
function useWaitingMessage(active: boolean) {
  const cfg = React.useRef<Ivr | null>(null);
  const [position, setPosition] = React.useState<number | null>(null);
  const said = React.useRef(0);
  const ctx = React.useRef<AudioContext | null>(null);
  const tune = React.useRef<number | null>(null);
  const player = React.useRef<HTMLAudioElement | null>(null);
  const stopAll = React.useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {}
    if (tune.current) window.clearInterval(tune.current);
    tune.current = null;
    player.current?.pause();
    player.current = null;
    void ctx.current?.close().catch(() => {});
    ctx.current = null;
    said.current = 0;
  }, []);
  // Soft hold music: a slow chord pattern from the browser, no file needed.
  const music = React.useCallback(() => {
    if (tune.current || !cfg.current?.music) return;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ac = (ctx.current ??= new C());
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    const play = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = notes[i++ % notes.length]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 1);
    };
    play();
    tune.current = window.setInterval(play, 1000);
  }, []);
  const speak = React.useCallback(
    (pos: number | null) => {
      const c = cfg.current;
      if (!c?.on) return;
      said.current = Date.now();
      if (tune.current) window.clearInterval(tune.current);
      tune.current = null;
      if (c.audio) {
        const a = (player.current ??= new Audio(c.audio));
        a.currentTime = 0;
        a.onended = () => music();
        void a.play().catch(() => music());
        return;
      }
      const synth = window.speechSynthesis;
      if (!synth) return music();
      const text = `${c.message}${c.position && pos && pos > 1 ? ` You are number ${pos} in line.` : ""}`;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = c.lang;
      u.rate = 0.95;
      u.onend = () => music();
      u.onerror = () => music();
      synth.cancel();
      synth.speak(u);
    },
    [music],
  );
  React.useEffect(() => {
    if (!active) stopAll();
    return () => stopAll();
  }, [active, stopAll]);
  const update = (ivr: Ivr | null, pos: number | null) => {
    cfg.current = ivr;
    setPosition(pos);
    if (!ivr?.on || !active) return;
    if (!said.current || Date.now() - said.current > ivr.repeatSec * 1000) speak(pos);
  };
  return { update, position };
}

// Soft hold music while the agent has the caller on hold (a slow chord pattern from the browser).
function useHoldTone(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const C = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!C) return;
    const ac = new C();
    const notes = [261.6, 329.6, 392, 329.6, 293.7, 349.2, 440, 349.2];
    let i = 0;
    const play = () => {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = "sine";
      o.frequency.value = notes[i++ % notes.length]!;
      g.gain.setValueAtTime(0.0001, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, ac.currentTime + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.9);
      o.connect(g).connect(ac.destination);
      o.start();
      o.stop(ac.currentTime + 1);
    };
    play();
    const t = window.setInterval(play, 1000);
    return () => {
      window.clearInterval(t);
      void ac.close().catch(() => {});
    };
  }, [active]);
}

type CallState = "idle" | "consent" | "callback" | "ringing" | "live" | "ended";
type Poll = { status: string; answer: string | null; agent: string | null; position?: number; ivr?: Ivr | null; onHold?: boolean; transferTo?: string | null };

// One call from the widget: calling out (and calling again to follow a transfer), or answering an agent's call;
// hold (music, and the microphone off) and the end.
function useCustomerCall(api: Api) {
  const [state, setState] = React.useState<CallState>("idle");
  const [info, setInfo] = React.useState<string | null>(null);
  const [secs, setSecs] = React.useState(0);
  const [held, setHeld] = React.useState(false);
  const ref = React.useRef<{ pc?: RTCPeerConnection; mic?: MediaStream; poll?: number; timer?: number; callId?: string; consent?: boolean; ticketId?: string | null }>({});
  const audio = React.useRef<HTMLAudioElement>(null);
  const waiting = useWaitingMessage(state === "ringing");
  useHoldTone(state === "live" && held);

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
      if (tell && id) await api(`calls/${id}/end`, {}).catch(() => {});
      setState("ended");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [api],
  );
  React.useEffect(() => () => void stop(false), [stop]);

  const newPc = async () => {
    const ice = await api<{ iceServers: RTCIceServer[] }>("ice");
    const pc = new RTCPeerConnection({ iceServers: ice.iceServers });
    const mic = ref.current.mic ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
    Object.assign(ref.current, { pc, mic });
    mic.getTracks().forEach((t) => ((t.enabled = true), pc.addTrack(t, mic)));
    pc.ontrack = (e) => audio.current && (audio.current.srcObject = e.streams[0] ?? null);
    return pc;
  };

  const live = (agent: string | null) => {
    setInfo(agent ? `You are talking with ${agent}` : null);
    setState("live");
    if (!ref.current.timer) ref.current.timer = window.setInterval(() => setSecs((x) => x + 1), 1000);
  };

  // While connected: hold, a transfer (call again, to the new agent), the end.
  const follow = (callId: string, pc: RTCPeerConnection, outgoing: boolean) => {
    ref.current.callId = callId;
    ref.current.poll = window.setInterval(async () => {
      const k = await api<Poll>(`calls/${callId}`).catch(() => null);
      if (!k || ref.current.callId !== callId) return;
      if (k.status === "ringing") waiting.update(k.ivr ?? null, k.position ?? null);
      if (outgoing && k.status === "answered" && k.answer && pc.signalingState === "have-local-offer") {
        await pc.setRemoteDescription(JSON.parse(k.answer) as RTCSessionDescriptionInit);
        live(k.agent);
      }
      if (k.status === "answered") {
        const h = !!k.onHold;
        setHeld(h);
        ref.current.mic?.getTracks().forEach((t) => (t.enabled = !h));
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

  const call = async (ticketId: string | null, consent: boolean, onTicket: ((id: string) => void) | null, transferFrom: string | null = null) => {
    if (!transferFrom) setInfo(null);
    try {
      const pc = await newPc();
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      setState("ringing");
      const r = await api<{ callId: string; ticketId: string }>("calls", { ticketId, offer: JSON.stringify(pc.localDescription), consent, transferFrom });
      Object.assign(ref.current, { consent, ticketId: r.ticketId });
      if (!ticketId && onTicket) onTicket(r.ticketId);
      follow(r.callId, pc, true);
    } catch (e) {
      setInfo(e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message) ? "Allow the microphone to call us." : e instanceof Error ? e.message : "The call could not start.");
      await stop(false);
    }
  };

  const accept = async (c: Incoming) => {
    try {
      const pc = await newPc();
      await pc.setRemoteDescription(JSON.parse(c.offer) as RTCSessionDescriptionInit);
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      await api(`calls/${c.id}/accept`, { answer: JSON.stringify(pc.localDescription), consent: true });
      Object.assign(ref.current, { consent: true, ticketId: c.ticketId });
      live(c.agent);
      follow(c.id, pc, false);
    } catch (e) {
      setInfo(e instanceof Error && /Permission|NotAllowed/.test(e.name + e.message) ? "Allow the microphone to answer." : e instanceof Error ? e.message : "The call could not connect.");
      await stop(false);
    }
  };

  return { state, setState, info, secs, setSecs, held, audio, waiting, call, accept, stop };
}

function CallBar({ c, onOk }: { c: ReturnType<typeof useCustomerCall>; onOk: () => void }) {
  const { state, info, secs, held, waiting } = c;
  return (
    <div className="flex items-center gap-2 rounded-lg border p-2 text-sm" data-call-state={held && state === "live" ? "hold" : state}>
      <audio ref={c.audio} autoPlay />
      <span className="flex-1">
        {state === "ringing"
          ? (info ?? (waiting.position && waiting.position > 1 ? `Calling… you are number ${waiting.position} in line` : "Calling… please hold"))
          : state === "live"
            ? held
              ? "On hold, please wait…"
              : `${info ?? "Connected"} · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
            : (info ?? "Call ended")}
      </span>
      {state === "ended" ? (
        <Button size="sm" variant="ghost" onClick={onOk}>
          OK
        </Button>
      ) : (
        <Button size="sm" variant="destructive" onClick={() => void c.stop(true)} data-call-end>
          <PhoneOffIcon /> End
        </Button>
      )}
    </div>
  );
}

// "Ask us to call you": a phone number, and a waiting call-back for the team.
function CallbackForm({ api, ticketId, color, onClose }: { api: Api; ticketId: string | null; color: string; onClose: () => void }) {
  const [phone, setPhone] = React.useState("");
  const [msg, setMsg] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="space-y-2 rounded-lg border p-2 text-xs" data-callback-form>
      {msg ? (
        <p>{msg}</p>
      ) : (
        <>
          <p>Leave your number and we will call you.</p>
          <Input aria-label="Your phone number" inputMode="tel" placeholder="+251 9..." value={phone} onChange={(e) => setPhone(e.target.value)} />
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

// Calling an agent: the browser asks for the microphone, the call rings in the desk, and the agent answers there.
// When the system takes calls on a phone number instead, the number and "Ask us to call you".
type Call = ReturnType<typeof useCustomerCall>;
const CallCtx = React.createContext<Call | null>(null);

export function CallButton({ api, s, ticketId, color, onTicket }: { api: Api; s: Session; ticketId: string | null; color: string; onTicket: (id: string) => void }) {
  const c = React.useContext(CallCtx)!;
  const [agree, setAgree] = React.useState(false);
  const [mode, setMode] = React.useState<"idle" | "consent" | "callback">("idle");
  if (s.channels?.calls === false) return null;
  if (s.callEngine?.engine === "phone")
    return mode === "callback" ? (
      <CallbackForm api={api} ticketId={ticketId} color={color} onClose={() => setMode("idle")} />
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
  if (c.state === "idle" && mode === "callback") return <CallbackForm api={api} ticketId={ticketId} color={color} onClose={() => setMode("idle")} />;
  if (c.state === "idle" && mode === "idle")
    return (
      <div className="flex gap-2">
        {s.online && (
          <Button variant="outline" className="flex-1" onClick={() => (s.recordCalls ? setMode("consent") : void c.call(ticketId, true, onTicket))} data-call-us>
            <PhoneIcon /> Call us
          </Button>
        )}
        <Button variant="ghost" className={s.online ? "" : "w-full"} onClick={() => setMode("callback")} data-ask-callback>
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
          <Button size="sm" className="text-white" style={{ background: color }} disabled={!agree} onClick={() => (setMode("idle"), void c.call(ticketId, agree, onTicket))}>
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

type Incoming = { id: string; offer: string; agent: string | null; ticketId: string | null; record: boolean; notice: string | null };

// The widget's one call, shown at the top whichever page is open (so it carries on when the conversation opens),
// and an agent calling the customer: it rings here while the panel is open; answer (agreeing to the recording when
// calls are recorded) or decline.
export function CallLayer({ api, s, children }: { api: Api; s: Session; children: React.ReactNode }) {
  const c = useCustomerCall(api);
  const [ring, setRing] = React.useState<Incoming | null>(null);
  const idle = c.state === "idle";
  React.useEffect(() => {
    if (!idle || s.channels?.calls === false || s.callEngine?.engine === "phone") return;
    let stop = false;
    const tick = async () => {
      const r = await api<{ call: Incoming | null }>("calls/incoming").catch(() => null);
      if (!stop && r) setRing(r.call);
    };
    void tick();
    const t = window.setInterval(tick, 3000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [api, idle, s.channels?.calls, s.callEngine?.engine]);
  return (
    <CallCtx.Provider value={c}>
      {!idle && (
        <div className="px-4 pt-3">
          <CallBar c={c} onOk={() => (c.setState("idle"), c.setSecs(0), setRing(null))} />
        </div>
      )}
      {idle && ring && (
        <div className="space-y-2 border-b px-4 py-3 text-sm" data-incoming-call>
          <p className="font-medium">{ring.agent ?? "Support"} is calling you</p>
          {ring.record && ring.notice && <p className="text-xs text-muted-foreground">{ring.notice} Answering means you agree.</p>}
          <div className="flex gap-2">
            <Button size="sm" className="text-white" style={{ background: "#188038" }} onClick={() => (setRing(null), void c.accept(ring))} data-answer-call>
              <PhoneIcon /> Answer
            </Button>
            <Button size="sm" variant="outline" onClick={async () => (setRing(null), await api(`calls/${ring.id}/decline`, {}).catch(() => {}))} data-decline-call>
              <PhoneOffIcon /> Decline
            </Button>
          </div>
        </div>
      )}
      {children}
    </CallCtx.Provider>
  );
}
