"use client";

// The call center in the desk: the call in progress (answer, or call the customer in the app; mute, hold with hold
// music for the caller, bring a colleague in, hand the call over, transfer, record both voices, notes), phone calls
// from the dialer with their notes, and the Calls page (call-backs waiting, dialer, today's totals, history).
//
// A colleague joins through this browser: it sends the customer this agent's voice mixed with the colleague's, and
// the colleague this agent's voice mixed with the customer's. Nothing changes on the customer's side.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeftIcon, HeadphonesIcon, Loader2Icon, MicIcon, MicOffIcon, PauseIcon, PhoneCallIcon, PhoneForwardedIcon, PhoneIcon, PhoneOffIcon, PlayIcon, SmartphoneIcon, UserPlusIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import * as A from "@/app/actions/support-desk";
import type { CallHistoryRow } from "@/server/support-calls";
import { cn } from "@/lib/utils";

export type Ring = { id: string; ticket_id: string; customer: string | null; number: number; started_at: string; offer: string; consent: number; kind?: string; host?: string | null; transferred?: number };
export type ActiveCall = { mode: "answer"; ring: Ring } | { mode: "dial"; ticketId: string; customer: string | null; number: number } | { mode: "phone"; callId: string; phone: string; label: string; ticketId: string | null };

type Ctx = { active: ActiveCall | null; start: (c: ActiveCall) => void };
const CallCtx = React.createContext<Ctx>({ active: null, start: () => toast.error("Open Customer support to make calls.") });
export const useCallCenter = () => React.useContext(CallCtx);

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export function CallProvider({ record, children }: { record: boolean; children: React.ReactNode }) {
  const [active, setActive] = React.useState<ActiveCall | null>(null);
  // A call that has ended (its panel still showing notes and Close) gives way to the next one.
  const ended = React.useRef(false);
  const [isEnded, setIsEnded] = React.useState(false);
  const start = React.useCallback(
    (c: ActiveCall) =>
      setActive((cur) => {
        if (cur && !ended.current) {
          toast.error("Finish the call in progress first.");
          return cur;
        }
        ended.current = false;
        setIsEnded(false);
        return c;
      }),
    [],
  );
  const done = React.useCallback(() => setActive(null), []);
  const onEnded = React.useCallback(() => ((ended.current = true), setIsEnded(true)), []);
  return (
    <CallCtx.Provider value={{ active: isEnded ? null : active, start }}>
      {active && (active.mode === "phone" ? <PhonePanel key={active.callId} call={active} onDone={done} /> : <CallPanel key={active.mode === "answer" ? active.ring.id : `dial-${active.ticketId}`} call={active} record={record} onDone={done} onEnded={onEnded} />)}
      {children}
    </CallCtx.Provider>
  );
}

async function gathered(pc: RTCPeerConnection, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && (window.clearTimeout(t), resolve()));
  });
}

type Leg = { id: string; status: string; name: string | null };
type Parts = {
  pc?: RTCPeerConnection;
  mic?: MediaStream;
  sender?: RTCRtpSender;
  remote: MediaStream;
  ctx?: AudioContext;
  rec?: MediaRecorder;
  chunks: Blob[];
  poll?: number;
  timer?: number;
  callId?: string;
  staff?: { pc: RTCPeerConnection; legId?: string; userId: string; name: string; poll?: number; out?: MediaStreamTrack };
};

function CallPanel({ call, record, onDone, onEnded }: { call: Exclude<ActiveCall, { mode: "phone" }>; record: boolean; onDone: () => void; onEnded: () => void }) {
  const router = useRouter();
  const ring = call.mode === "answer" ? call.ring : null;
  const staffLeg = ring?.kind === "staff";
  const who = call.mode === "answer" ? (staffLeg ? `${ring!.host ?? "A colleague"}'s call` : (ring!.customer ?? "Customer")) : (call.customer ?? "Customer");
  const number = call.mode === "answer" ? ring!.number : call.number;
  const ticketId = call.mode === "answer" ? ring!.ticket_id : call.ticketId;
  const [phase, setPhase] = React.useState<"connecting" | "ringing" | "live" | "ended">("connecting");
  const [secs, setSecs] = React.useState(0);
  const [muted, setMuted] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const [notes, setNotes] = React.useState("");
  const [legs, setLegs] = React.useState<Leg[]>([]);
  const [pick, setPick] = React.useState<null | "invite" | "transfer">(null);
  const [targets, setTargets] = React.useState<{ id: string; name: string }[]>([]);
  const [target, setTarget] = React.useState("");
  const [xferNote, setXferNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [recState, setRecState] = React.useState<"off" | "recording" | "saving" | "saved" | "failed">("off");
  const p = React.useRef<Parts>({ remote: new MediaStream(), chunks: [] });
  const audio = React.useRef<HTMLAudioElement>(null);
  const staffAudio = React.useRef<HTMLAudioElement>(null);
  const state = React.useRef({ muted: false, held: false });

  // Mute: this agent's voice off for everyone. Hold: nothing goes to the customer, and their voice is not heard.
  const apply = React.useCallback(() => {
    const { muted: m, held: h } = state.current;
    p.current.mic?.getAudioTracks().forEach((t) => (t.enabled = !m));
    if (p.current.sender?.track) p.current.sender.track.enabled = !h;
    if (audio.current) audio.current.muted = h;
  }, []);

  const dropStaff = React.useCallback(async (tell: boolean) => {
    const s = p.current.staff;
    if (!s) return;
    if (s.poll) window.clearInterval(s.poll);
    s.pc.close();
    p.current.staff = undefined;
    const micTrack = p.current.mic?.getAudioTracks()[0];
    if (micTrack && p.current.sender) await p.current.sender.replaceTrack(micTrack).catch(() => {});
    if (tell && s.legId) await A.agentEndCallAction(s.legId, null);
    if (staffAudio.current) staffAudio.current.srcObject = null;
    apply();
  }, [apply]);

  const hangUp = React.useCallback(
    async (tell: boolean) => {
      const x = p.current;
      if (x.poll) window.clearInterval(x.poll);
      if (x.timer) window.clearInterval(x.timer);
      await dropStaff(false);
      setPhase("ended");
      onEnded();
      if (x.rec && x.rec.state !== "inactive") {
        setRecState("saving");
        await new Promise<void>((resolve) => {
          x.rec!.onstop = () => resolve();
          x.rec!.stop();
        });
        try {
          const blob = new Blob(x.chunks, { type: x.rec.mimeType || "audio/webm" });
          const r = await fetch(`/api/support/recording/${x.callId}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
          setRecState(r.ok ? "saved" : "failed");
        } catch {
          setRecState("failed");
        }
      }
      x.mic?.getTracks().forEach((t) => t.stop());
      x.pc?.close();
      void x.ctx?.close().catch(() => {});
      if (tell && x.callId) await A.agentEndCallAction(x.callId, null);
    },
    [dropStaff, onEnded],
  );

  const startRecording = React.useCallback(() => {
    const x = p.current;
    if (x.rec || typeof MediaRecorder === "undefined" || !x.mic) return;
    try {
      const ctx = (x.ctx ??= new AudioContext());
      const dest = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(x.mic).connect(dest);
      ctx.createMediaStreamSource(x.remote).connect(dest);
      const rec = new MediaRecorder(dest.stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24000 } : undefined);
      rec.ondataavailable = (ev) => ev.data.size && x.chunks.push(ev.data);
      rec.start(5000);
      x.rec = rec;
      setRecState("recording");
    } catch {
      setRecState("failed");
    }
  }, []);

  const goLive = React.useCallback(
    (doRecord: boolean) => {
      setPhase("live");
      router.push(`/support?ticket=${ticketId}`);
      p.current.timer = window.setInterval(() => setSecs((s) => s + 1), 1000);
      if (doRecord) startRecording();
      p.current.poll = window.setInterval(async () => {
        const s = await A.agentPollCallAction(p.current.callId!);
        if (!s.ok) return;
        const d = s.data as { status: string; onHold: boolean; legs: Leg[] };
        setLegs(d.legs ?? []);
        if (["ended", "missed", "declined"].includes(d.status)) {
          toast.message(staffLeg ? "The call has ended." : "The customer hung up.");
          await hangUp(false);
        }
        if (d.status === "transferred") await hangUp(false);
      }, 2000);
    },
    [hangUp, router, startRecording, staffLeg, ticketId],
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ice = await A.iceAction();
        const pc = new RTCPeerConnection({ iceServers: ice.ok ? ((ice.data as { iceServers: RTCIceServer[] }).iceServers ?? []) : [] });
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        Object.assign(p.current, { pc, mic });
        p.current.sender = pc.addTrack(mic.getAudioTracks()[0]!, mic);
        pc.ontrack = (e) => {
          e.streams[0]?.getTracks().forEach((t) => p.current.remote.addTrack(t));
          if (audio.current) audio.current.srcObject = p.current.remote;
        };
        if (call.mode === "answer") {
          p.current.callId = call.ring.id;
          await pc.setRemoteDescription(JSON.parse(call.ring.offer) as RTCSessionDescriptionInit);
          await pc.setLocalDescription(await pc.createAnswer());
          await gathered(pc);
          if (cancelled) return;
          const r = await A.answerCallAction(call.ring.id, JSON.stringify(pc.localDescription));
          if (!r.ok) {
            toast.error(r.error ?? "Could not answer.");
            await hangUp(false);
            onDone();
            return;
          }
          // Both voices are recorded after the customer agreed (they did, to start the call). Not a colleague's leg.
          goLive(record && !staffLeg && !!call.ring.consent);
        } else {
          await pc.setLocalDescription(await pc.createOffer());
          await gathered(pc);
          if (cancelled) return;
          const r = await A.dialCustomerAction(call.ticketId, JSON.stringify(pc.localDescription));
          if (!r.ok) {
            toast.error(r.error ?? "Could not call.");
            await hangUp(false);
            onDone();
            return;
          }
          const d = r.data as { callId: string; record: boolean };
          p.current.callId = d.callId;
          setPhase("ringing");
          p.current.poll = window.setInterval(async () => {
            const s = await A.agentPollCallAction(d.callId);
            if (!s.ok) return;
            const k = s.data as { status: string; answer: string | null };
            if (k.status === "answered" && k.answer && pc.signalingState === "have-local-offer") {
              window.clearInterval(p.current.poll);
              await pc.setRemoteDescription(JSON.parse(k.answer) as RTCSessionDescriptionInit);
              goLive(d.record);
            } else if (["missed", "declined", "ended"].includes(k.status)) {
              toast.message(k.status === "declined" ? "The customer declined the call." : "The customer did not answer.");
              await hangUp(false);
            }
          }, 1500);
        }
      } catch (e) {
        toast.error(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? "Allow the microphone to make and answer calls." : "The call could not connect.");
        await hangUp(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The call is set up once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMute = () => {
    state.current.muted = !state.current.muted;
    setMuted(state.current.muted);
    apply();
  };
  const toggleHold = async () => {
    setBusy(true);
    const r = await A.holdCallAction(p.current.callId!, !held);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    state.current.held = !held;
    setHeld(!held);
    apply();
  };
  const openPick = async (kind: "invite" | "transfer") => {
    const r = await A.transferTargetsAction();
    if (!r.ok) return void toast.error(r.error);
    const list = r.data as { id: string; name: string }[];
    if (!list.length) return void toast.error("No colleague is online in support right now.");
    setTargets(list);
    setTarget(list[0]!.id);
    setPick(kind);
  };

  // A colleague into the call through this browser.
  const invite = async () => {
    const x = p.current;
    const name = targets.find((t) => t.id === target)?.name ?? "Colleague";
    setBusy(true);
    try {
      const ice = await A.iceAction();
      const spc = new RTCPeerConnection({ iceServers: ice.ok ? ((ice.data as { iceServers: RTCIceServer[] }).iceServers ?? []) : [] });
      const ctx = (x.ctx ??= new AudioContext());
      const toStaff = ctx.createMediaStreamDestination();
      ctx.createMediaStreamSource(x.mic!).connect(toStaff);
      if (x.remote.getAudioTracks().length) ctx.createMediaStreamSource(x.remote).connect(toStaff);
      spc.addTrack(toStaff.stream.getAudioTracks()[0]!, toStaff.stream);
      spc.ontrack = (e) => {
        const remoteS = e.streams[0] ?? new MediaStream([e.track]);
        if (staffAudio.current) staffAudio.current.srcObject = remoteS;
        const toCustomer = ctx.createMediaStreamDestination();
        ctx.createMediaStreamSource(x.mic!).connect(toCustomer);
        ctx.createMediaStreamSource(remoteS).connect(toCustomer);
        const out = toCustomer.stream.getAudioTracks()[0]!;
        if (x.staff) x.staff.out = out;
        void x.sender?.replaceTrack(out).then(apply);
      };
      x.staff = { pc: spc, userId: target, name };
      await spc.setLocalDescription(await spc.createOffer());
      await gathered(spc);
      const r = await A.inviteToCallAction(x.callId!, target, JSON.stringify(spc.localDescription));
      if (!r.ok) {
        toast.error(r.error);
        await dropStaff(false);
        return;
      }
      const legId = (r.data as { legId: string }).legId;
      x.staff.legId = legId;
      setPick(null);
      toast.message(`Calling ${name}…`);
      x.staff.poll = window.setInterval(async () => {
        const s = await A.agentPollCallAction(legId);
        if (!s.ok || !x.staff) return;
        const k = s.data as { status: string; answer: string | null };
        if (k.status === "answered" && k.answer && spc.signalingState === "have-local-offer") await spc.setRemoteDescription(JSON.parse(k.answer) as RTCSessionDescriptionInit);
        if (["missed", "declined", "ended"].includes(k.status)) {
          toast.message(k.status === "ended" ? `${name} left the call.` : `${name} did not join.`);
          await dropStaff(false);
        }
      }, 1500);
    } finally {
      setBusy(false);
    }
  };

  const transfer = async (to: string, note: string) => {
    setBusy(true);
    const r = await A.transferCallAction(p.current.callId!, to, note || null);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Transferred to ${(r.data as { to: string }).to}`);
    setPick(null);
    await hangUp(false);
  };

  const joined = legs.find((l) => l.status === "answered");
  const asking = legs.find((l) => l.status === "ringing");
  const live = phase === "live";
  return (
    <Card className="border-[#188038]/40" data-call-panel={phase}>
      <CardContent className="space-y-2 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <HeadphonesIcon className="size-5 text-[#188038]" aria-hidden />
          <span className="font-medium">
            {who} · #{number}
          </span>
          <span className="tabular-nums text-muted-foreground" data-call-clock>
            {phase === "connecting" ? "Connecting…" : phase === "ringing" ? "Ringing in the customer's app…" : live ? clock(secs) : "Call ended"}
          </span>
          {held && <span className="rounded bg-[#F9AB00]/20 px-1.5 text-xs text-[#B06000]" data-on-hold>On hold</span>}
          {muted && <span className="rounded bg-muted px-1.5 text-xs" data-muted>Muted</span>}
          {joined && <span className="rounded bg-primary/10 px-1.5 text-xs" data-conference>With {joined.name}</span>}
          {asking && <span className="text-xs text-muted-foreground">Asking {asking.name}…</span>}
          {recState !== "off" && (
            <span className={cn("inline-flex items-center gap-1 text-xs", recState === "recording" ? "text-[#D93025]" : "text-muted-foreground")} data-recording={recState}>
              <MicIcon className="size-3" aria-hidden /> {recState === "recording" ? "Recording" : recState === "saving" ? "Saving the recording…" : recState === "saved" ? "Recording saved" : "Recording failed"}
            </span>
          )}
          <audio ref={audio} autoPlay />
          <audio ref={staffAudio} autoPlay />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {(live || phase === "ringing") && (
            <Button size="sm" variant={muted ? "default" : "outline"} onClick={toggleMute} data-mute aria-pressed={muted}>
              {muted ? <MicOffIcon /> : <MicIcon />} {muted ? "Unmute" : "Mute"}
            </Button>
          )}
          {live && !staffLeg && (
            <>
              <Button size="sm" variant={held ? "default" : "outline"} disabled={busy} onClick={toggleHold} data-hold aria-pressed={held}>
                {held ? <PlayIcon /> : <PauseIcon />} {held ? "Resume" : "Hold"}
              </Button>
              {!joined && !asking && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => openPick("invite")} data-invite>
                  <UserPlusIcon /> Add a colleague
                </Button>
              )}
              {joined && p.current.staff && (
                <>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => transfer(p.current.staff!.userId, "")} data-hand-over>
                    <PhoneForwardedIcon /> Hand over to {joined.name}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => dropStaff(true)}>
                    <XIcon /> Remove {joined.name}
                  </Button>
                </>
              )}
              {!joined && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => openPick("transfer")} data-transfer-call>
                  <ArrowRightLeftIcon /> Transfer
                </Button>
              )}
            </>
          )}
          <Input aria-label="Call notes" placeholder="Notes" className="h-8 w-56" value={notes} onChange={(e) => setNotes(e.target.value)} />
          {phase !== "ended" ? (
            <Button size="sm" variant="destructive" onClick={async () => (await hangUp(false), await A.agentEndCallAction(p.current.callId ?? "", notes || null), router.refresh())} data-hang-up>
              <PhoneOffIcon /> {staffLeg ? "Leave" : "Hang up"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={recState === "saving"} onClick={async () => (notes && p.current.callId && (await A.agentEndCallAction(p.current.callId, notes)), onDone(), router.refresh())} data-call-close>
              Close
            </Button>
          )}
        </div>
        {pick && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-2" data-call-pick={pick}>
            <span className="text-xs text-muted-foreground">{pick === "invite" ? "Talk together first; then hand over or remove them." : "The caller goes straight to them; the ticket becomes theirs."}</span>
            <select aria-label="Colleague" className="h-8 rounded-md border bg-background px-2 text-sm" value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {pick === "transfer" && <Input aria-label="Note for them" placeholder="Note for them" className="h-8 w-56" value={xferNote} onChange={(e) => setXferNote(e.target.value)} />}
            <Button size="sm" disabled={busy || !target} onClick={() => (pick === "invite" ? invite() : transfer(target, xferNote))} data-call-pick-go>
              {busy && <Loader2Icon className="animate-spin" />} {pick === "invite" ? "Call them" : "Transfer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPick(null)}>
              Cancel
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// A call by phone: Dial hands the number to this device's phone or softphone; the time runs here and the notes are kept.
function PhonePanel({ call, onDone }: { call: Extract<ActiveCall, { mode: "phone" }>; onDone: () => void }) {
  const router = useRouter();
  const [secs, setSecs] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    const t = window.setInterval(() => setSecs((s) => s + 1), 1000);
    return () => window.clearInterval(t);
  }, []);
  const end = async () => {
    setBusy(true);
    const r = await A.agentEndCallAction(call.callId, notes || null);
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success("Call saved");
    onDone();
    router.refresh();
  };
  return (
    <Card className="border-[#188038]/40" data-phone-panel>
      <CardContent className="flex flex-wrap items-center gap-2 py-3 text-sm">
        <SmartphoneIcon className="size-5 text-[#188038]" aria-hidden />
        <span className="font-medium">{call.label}</span>
        <Button size="sm" variant="outline" asChild>
          <a href={`tel:${call.phone}`} data-phone-dial>
            <PhoneIcon /> Dial {call.phone}
          </a>
        </Button>
        <span className="tabular-nums text-muted-foreground">{clock(secs)}</span>
        <Input aria-label="What was said" placeholder="What was said" className="h-8 min-w-56 flex-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button size="sm" variant="destructive" disabled={busy} onClick={end} data-phone-end>
          <PhoneOffIcon /> End and save
        </Button>
      </CardContent>
    </Card>
  );
}

// On the ticket: call the customer in the app (when they have it open) or by phone.
export function DialButtons({ ticketId, customer, number, phone }: { ticketId: string; customer: string | null; number: number; phone: string | null }) {
  const { start, active } = useCallCenter();
  const [info, setInfo] = React.useState<{ inApp: boolean; online: boolean; phone: string | null } | null>(null);
  React.useEffect(() => {
    let stop = false;
    const load = async () => {
      const r = await A.dialInfoAction(ticketId);
      if (!stop && r.ok) setInfo(r.data as { inApp: boolean; online: boolean; phone: string | null });
    };
    void load();
    const t = window.setInterval(load, 15000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [ticketId]);
  const tel = info?.phone ?? phone;
  const byPhone = async () => {
    const r = await A.startPhoneCallAction({ ticketId });
    if (!r.ok) return void toast.error(r.error);
    const d = r.data as { callId: string; phone: string };
    start({ mode: "phone", callId: d.callId, phone: d.phone, label: `${customer ?? "Customer"} · #${number}`, ticketId });
  };
  return (
    <>
      {info?.inApp && (
        <Button size="sm" variant="ghost" disabled={!info.online || !!active} title={info.online ? "Rings in the customer's app" : "The customer does not have the app open"} onClick={() => start({ mode: "dial", ticketId, customer, number })} data-dial-app>
          <PhoneCallIcon /> Call in the app{!info.online && " (not open)"}
        </Button>
      )}
      {tel && (
        <Button size="sm" variant="ghost" disabled={!!active} onClick={byPhone} data-dial-phone>
          <PhoneIcon /> Call {tel}
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// The Calls page
// ---------------------------------------------------------------------------

const STATUS_LABEL: Record<string, string> = { ended: "Talked", answered: "In progress", missed: "Missed", declined: "Declined", transferred: "Transferred", ringing: "Ringing", callback: "Call-back waiting" };
const FILTERS = [
  { key: "", label: "All" },
  { key: "answered", label: "Talked" },
  { key: "missed", label: "Missed" },
  { key: "callback", label: "Call-backs" },
];

export function CallsCenter({ rows, callbacks, stats, filters }: { rows: CallHistoryRow[]; callbacks: CallHistoryRow[]; stats: { today: number; missed: number; callbacks: number; avgTalkS: number; avgHoldS: number }; filters: { status: string; direction: string; q: string; from: string; to: string } }) {
  const router = useRouter();
  const { start, active } = useCallCenter();
  const [num, setNum] = React.useState("");
  const [q, setQ] = React.useState(filters.q);
  const href = (patch: Record<string, string>) => {
    const s = new URLSearchParams({ tab: "calls", ...Object.fromEntries(Object.entries({ ...filters, ...patch }).filter(([, v]) => v)) });
    return `/support?${s}`;
  };
  const dial = async (input: { phone?: string; callbackId?: string }, label: string) => {
    const r = await A.startPhoneCallAction(input);
    if (!r.ok) return void toast.error(r.error);
    const d = r.data as { callId: string; phone: string; ticketId: string | null };
    start({ mode: "phone", callId: d.callId, phone: d.phone, label, ticketId: d.ticketId });
    router.refresh();
  };
  const tiles = [
    { label: "Calls today", value: String(stats.today) },
    { label: "Missed today", value: String(stats.missed) },
    { label: "Call-backs waiting", value: String(stats.callbacks) },
    { label: "Average talk", value: clock(stats.avgTalkS) },
    { label: "Average hold", value: clock(stats.avgHoldS) },
  ];
  return (
    <div className="space-y-4" data-calls-center>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className="text-xl font-semibold tabular-nums">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dialer</CardTitle>
            <CardDescription>Opens the number on this device&apos;s phone (or a softphone). The time and your notes are kept; a known number goes on that customer.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Input aria-label="Phone number" inputMode="tel" placeholder="+251 9..." className="w-56" value={num} onChange={(e) => setNum(e.target.value)} onKeyDown={(e) => e.key === "Enter" && num && void dial({ phone: num }, num)} />
            <Button disabled={!num.trim() || !!active} onClick={() => dial({ phone: num }, num)} data-dialer-call>
              <PhoneIcon /> Call
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Call-backs waiting</CardTitle>
            <CardDescription>Customers who asked to be called, from the app or the Telegram bot. Oldest first.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {!callbacks.length && <p className="text-sm text-muted-foreground">None waiting.</p>}
            {callbacks.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm" data-callback={c.phone ?? ""}>
                <div className="min-w-0 flex-1">
                  <div className="font-medium">
                    {c.customer ?? "Customer"} · {c.phone}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {when(c.startedAt)}
                    {c.system && ` · ${c.system}`}
                    {c.ticketId && (
                      <>
                        {" · "}
                        <Link className="underline" href={`/support?ticket=${c.ticketId}`}>
                          #{c.number}
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                <Button size="sm" disabled={!!active} onClick={() => dial({ callbackId: c.id }, `${c.customer ?? "Customer"}${c.number ? ` · #${c.number}` : ""}`)} data-call-back>
                  <PhoneIcon /> Call back
                </Button>
                <Button size="sm" variant="ghost" onClick={async () => {
                  const r = await A.cancelCallbackAction(c.id);
                  if (!r.ok) return void toast.error(r.error);
                  router.refresh();
                }}>
                  Close
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <CardTitle className="text-base">Call history</CardTitle>
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Link key={f.key} href={href({ status: f.key })} data-call-filter={f.key || "all"} className={cn("rounded-md border px-2.5 py-1 text-sm", filters.status === f.key ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:bg-muted")}>
                {f.label}
              </Link>
            ))}
            <select aria-label="Direction" className="h-8 rounded-md border bg-background px-2 text-sm" value={filters.direction} onChange={(e) => router.push(href({ direction: e.target.value }))}>
              <option value="">In and out</option>
              <option value="inbound">Incoming</option>
              <option value="outbound">Outgoing</option>
            </select>
            <Input type="date" aria-label="From" className="h-8 w-auto" value={filters.from} onChange={(e) => router.push(href({ from: e.target.value }))} />
            <Input type="date" aria-label="To" className="h-8 w-auto" value={filters.to} onChange={(e) => router.push(href({ to: e.target.value }))} />
            <form className="flex gap-1.5" onSubmit={(e) => (e.preventDefault(), router.push(href({ q })))}>
              <Input aria-label="Search calls" placeholder="Name, phone or #ticket" className="h-8 w-48" value={q} onChange={(e) => setQ(e.target.value)} />
            </form>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!rows.length ? (
            <p className="text-sm text-muted-foreground">No calls match.</p>
          ) : (
            <table className="w-full min-w-[56rem] text-sm" data-call-history>
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 font-normal">When</th>
                  <th className="font-normal">Customer</th>
                  <th className="font-normal">Call</th>
                  <th className="font-normal">Agent</th>
                  <th className="font-normal">Length</th>
                  <th className="font-normal">Recording</th>
                  <th className="font-normal">Notes</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t align-top" data-call-row={r.status}>
                    <td className="py-1.5 pr-2 whitespace-nowrap">{when(r.startedAt)}</td>
                    <td className="pr-2">
                      {r.customer ?? r.phone ?? "Unknown"}
                      <div className="text-xs text-muted-foreground">
                        {r.phone && r.customer ? r.phone : ""}
                        {r.ticketId && (
                          <Link className="ml-1 underline" href={`/support?ticket=${r.ticketId}`}>
                            #{r.number}
                          </Link>
                        )}
                        {r.customerId && (
                          <Link className="ml-1 underline" href={href({ customer: r.customerId })} title="This customer's calls">
                            all calls
                          </Link>
                        )}
                      </div>
                    </td>
                    <td className="pr-2">
                      {r.kind === "phone" ? "Phone" : "App"}, {r.direction === "outbound" ? "out" : "in"}
                      <div className={cn("text-xs", r.status === "missed" || r.status === "declined" ? "text-[#D93025]" : "text-muted-foreground")}>
                        {STATUS_LABEL[r.status] ?? r.status}
                        {r.transferredTo && ` to ${r.transferredTo}`}
                      </div>
                    </td>
                    <td className="pr-2">{r.agent ?? "-"}</td>
                    <td className="pr-2 tabular-nums">
                      {r.durationS !== null ? clock(r.durationS) : "-"}
                      {r.holdS > 0 && <div className="text-xs text-muted-foreground">{clock(r.holdS)} on hold</div>}
                    </td>
                    <td className="pr-2">{r.recorded ? <audio controls preload="none" className="h-8 w-56" src={`/api/support/recording/${r.id}`} /> : <span className="text-muted-foreground">-</span>}</td>
                    <td className="max-w-64 text-xs">{r.notes ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
