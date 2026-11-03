"use client";

// The support desk (agents): status (online, away, offline), the inbox by view, a ticket with the conversation,
// replies and internal notes, saved replies, status, priority, assignment, the customer and their other tickets,
// calls (answer a call from the app in the browser, recorded when switched on; log a phone call) and the activity.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleIcon, HeadphonesIcon, Loader2Icon, LockIcon, MicIcon, PhoneCallIcon, PhoneIcon, PhoneOffIcon, PlusIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/support-desk";
import { CHANNEL_LABELS, PRIORITIES, PRIORITY_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, type Priority, type TicketStatus } from "@/lib/support";
import { cn } from "@/lib/utils";

type Res = { ok: boolean; error?: string; data?: unknown };
type Row = { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue: string | null; customer: string | null; assignee: string | null; assignee_id: string | null; updated_at: string; sla_first_due: string | null; sla_resolve_due: string | null; first_response_at: string | null; breached: number };
type Detail = {
  ticket: Record<string, unknown>;
  customer: { id: string; name: string; email: string | null; phone: string | null; meta: Record<string, string>; verified: boolean; app: string | null } | null;
  messages: { id: string; author_kind: string; author: string | null; body: string; internal: boolean; created_at: string }[];
  calls: { id: string; status: string; direction: string; kind: string; agent: string | null; started_at: string; duration_s: number | null; recording_id: string | null; recording_size: number | null; notes: string | null }[];
  log: { kind: string; detail: string | null; at: string; who: string | null }[];
  history: { id: string; number: number; subject: string; status: string; created_at: string }[];
};
type Ring = { id: string; ticket_id: string; customer: string | null; number: number; started_at: string; offer: string; consent: number };

const when = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
  return m < 1 ? "now" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};
const PRI: Record<Priority, string> = { urgent: "bg-[#D93025] text-white", high: "bg-[#E8710A]/20 text-[#B06000]", normal: "bg-muted", low: "bg-muted text-muted-foreground" };
const STATUS_DOT: Record<string, string> = { online: "text-[#188038]", away: "text-[#F9AB00]", offline: "text-muted-foreground" };
const select = "h-8 rounded-md border bg-background px-2 text-sm";

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async (fn: () => Promise<Res>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
    if (done) toast.success(done);
    router.refresh();
    return r.data ?? true;
  };
  return { act, busy };
}

// Target state of a ticket: time left for the first response or the resolution.
function Sla({ r }: { r: Row }) {
  if (["solved", "closed"].includes(r.status)) return null;
  const due = r.first_response_at ? r.sla_resolve_due : r.sla_first_due;
  if (!due) return null;
  const left = Math.round((Date.parse(due) - Date.now()) / 60e3);
  const tone = r.breached || left < 0 ? "text-[#D93025]" : left < 30 ? "text-[#E8710A]" : "text-muted-foreground";
  return (
    <span className={cn("text-xs tabular-nums", tone)} title={r.first_response_at ? "Time left to solve" : "Time left to answer"}>
      {left < 0 ? `${ago(due)} late` : `${left < 60 ? `${left} min` : `${Math.round(left / 60)} h`} left`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agent status, heartbeat and incoming calls
// ---------------------------------------------------------------------------

export function AgentBar({ status, onCall }: { status: string; onCall: (r: Ring) => void }) {
  const { act, busy } = useAct();
  const [ring, setRing] = React.useState<Ring[]>([]);
  React.useEffect(() => {
    let stop = false;
    const tick = async () => {
      const r = await A.ringingAction();
      if (!stop && r.ok) setRing((r.data as Ring[]) ?? []);
    };
    void tick();
    const t = window.setInterval(() => void tick(), 4000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, []);
  return (
    <div className="flex flex-wrap items-center gap-2" data-agent-bar>
      <span className="text-sm text-muted-foreground">My status</span>
      {(["online", "away", "offline"] as const).map((s) => (
        <Button key={s} size="sm" variant={status === s ? "default" : "outline"} disabled={busy} onClick={() => act(() => A.setAgentStatusAction(s), s === "online" ? "You are online: new tickets come to you" : `You are ${s}`)} data-status={s}>
          <CircleIcon className={cn("size-3 fill-current", STATUS_DOT[s])} /> {s[0]!.toUpperCase() + s.slice(1)}
        </Button>
      ))}
      {ring.map((r) => (
        <Button key={r.id} size="sm" className="animate-pulse bg-[#188038] text-white hover:bg-[#188038]/90" onClick={() => onCall(r)} data-ringing={r.id}>
          <PhoneCallIcon /> {r.customer ?? "Customer"} is calling (#{r.number})
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A call in the browser: answer, talk, record both voices, hang up
// ---------------------------------------------------------------------------

async function gathered(pc: RTCPeerConnection, ms = 3000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    pc.addEventListener("icegatheringstatechange", () => pc.iceGatheringState === "complete" && (window.clearTimeout(t), resolve()));
  });
}

export function CallPanel({ ring, record, onDone }: { ring: Ring; record: boolean; onDone: () => void }) {
  const router = useRouter();
  const [state, setState] = React.useState<"connecting" | "live" | "ended">("connecting");
  const [secs, setSecs] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [recState, setRecState] = React.useState<"off" | "recording" | "saving" | "saved" | "failed">("off");
  const parts = React.useRef<{ pc?: RTCPeerConnection; mic?: MediaStream; rec?: MediaRecorder; chunks: Blob[]; ctx?: AudioContext; poll?: number; timer?: number }>({ chunks: [] });
  const audio = React.useRef<HTMLAudioElement>(null);

  const hangUp = React.useCallback(
    async (sendEnd: boolean) => {
      const p = parts.current;
      if (p.poll) window.clearInterval(p.poll);
      if (p.timer) window.clearInterval(p.timer);
      setState("ended");
      if (p.rec && p.rec.state !== "inactive") {
        setRecState("saving");
        await new Promise<void>((resolve) => {
          p.rec!.onstop = () => resolve();
          p.rec!.stop();
        });
        try {
          const blob = new Blob(p.chunks, { type: p.rec.mimeType || "audio/webm" });
          const r = await fetch(`/api/support/recording/${ring.id}`, { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
          setRecState(r.ok ? "saved" : "failed");
        } catch {
          setRecState("failed");
        }
      }
      p.mic?.getTracks().forEach((t) => t.stop());
      p.pc?.close();
      void p.ctx?.close();
      if (sendEnd) await A.agentEndCallAction(ring.id, null);
    },
    [ring.id],
  );

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ice = await A.iceAction();
        const pc = new RTCPeerConnection({ iceServers: ice.ok ? ((ice.data as { iceServers: RTCIceServer[] }).iceServers ?? []) : [] });
        parts.current.pc = pc;
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
        parts.current.mic = mic;
        mic.getTracks().forEach((t) => pc.addTrack(t, mic));
        const remote = new MediaStream();
        pc.ontrack = (e) => {
          e.streams[0]?.getTracks().forEach((t) => remote.addTrack(t));
          if (audio.current) audio.current.srcObject = remote;
          // Both voices into one recording, after the customer agreed (they did, to start the call).
          if (record && !parts.current.rec && typeof MediaRecorder !== "undefined") {
            try {
              const ctx = new AudioContext();
              const dest = ctx.createMediaStreamDestination();
              ctx.createMediaStreamSource(mic).connect(dest);
              ctx.createMediaStreamSource(remote).connect(dest);
              const rec = new MediaRecorder(dest.stream, MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 24000 } : undefined);
              rec.ondataavailable = (ev) => ev.data.size && parts.current.chunks.push(ev.data);
              rec.start(5000);
              Object.assign(parts.current, { ctx, rec });
              setRecState("recording");
            } catch {
              setRecState("failed");
            }
          }
        };
        await pc.setRemoteDescription(JSON.parse(ring.offer) as RTCSessionDescriptionInit);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        if (cancelled) return;
        const r = await A.answerCallAction(ring.id, JSON.stringify(pc.localDescription));
        if (!r.ok) {
          toast.error(r.error ?? "Could not answer.");
          await hangUp(false);
          onDone();
          return;
        }
        setState("live");
        router.push(`/support?ticket=${ring.ticket_id}`);
        parts.current.timer = window.setInterval(() => setSecs((s) => s + 1), 1000);
        parts.current.poll = window.setInterval(async () => {
          const s = await A.agentPollCallAction(ring.id);
          if (s.ok && ["ended", "missed", "declined"].includes((s.data as { status: string }).status)) {
            toast.message("The customer hung up.");
            await hangUp(false);
          }
        }, 2500);
      } catch (e) {
        toast.error(e instanceof Error && /Permission|NotAllowed/i.test(e.name + e.message) ? "Allow the microphone to answer calls." : "The call could not connect.");
        await hangUp(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The call is set up once per ringing call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ring.id]);

  return (
    <Card className="border-[#188038]/40" data-call-panel={state}>
      <CardContent className="flex flex-wrap items-center gap-3 py-3 text-sm">
        <HeadphonesIcon className="size-5 text-[#188038]" />
        <span className="font-medium">
          {ring.customer ?? "Customer"} · #{ring.number}
        </span>
        <span className="tabular-nums text-muted-foreground">{state === "connecting" ? "Connecting…" : state === "live" ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "Call ended"}</span>
        {recState !== "off" && (
          <span className={cn("inline-flex items-center gap-1 text-xs", recState === "recording" ? "text-[#D93025]" : "text-muted-foreground")} data-recording={recState}>
            <MicIcon className="size-3" /> {recState === "recording" ? "Recording" : recState === "saving" ? "Saving the recording…" : recState === "saved" ? "Recording saved" : "Recording failed"}
          </span>
        )}
        <audio ref={audio} autoPlay />
        <Input aria-label="Call notes" placeholder="Notes" className="h-8 w-64" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {state !== "ended" ? (
          <Button size="sm" variant="destructive" onClick={async () => (await hangUp(false), await A.agentEndCallAction(ring.id, notes || null), router.refresh())}>
            <PhoneOffIcon /> Hang up
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={recState === "saving"} onClick={async () => (notes && (await A.agentEndCallAction(ring.id, notes)), onDone(), router.refresh())}>
            Close
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export function Inbox({ rows, view, views, q, openId }: { rows: Row[]; view: string; views: { key: string; label: string; count?: number }[]; q: string; openId: string | null }) {
  const router = useRouter();
  const [search, setSearch] = React.useState(q);
  const href = (v: string, extra = "") => `/support?view=${encodeURIComponent(v)}${search ? `&q=${encodeURIComponent(search)}` : ""}${extra}`;
  return (
    <div className="space-y-2" data-inbox>
      <div className="flex flex-wrap gap-1">
        {views.map((v) => (
          <Link key={v.key} href={href(v.key)} className={cn("rounded-full border px-2.5 py-1 text-xs", view === v.key ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")} data-view={v.key}>
            {v.label}
            {v.count ? ` ${v.count}` : ""}
          </Link>
        ))}
      </div>
      <form onSubmit={(e) => (e.preventDefault(), router.push(href(view)))}>
        <Input aria-label="Search tickets" placeholder="Search: number, subject, customer" value={search} onChange={(e) => setSearch(e.target.value)} className="h-8" />
      </form>
      <ul className="divide-y rounded-lg border">
        {rows.map((r) => (
          <li key={r.id}>
            <Link href={`/support?view=${encodeURIComponent(view)}&ticket=${r.id}`} className={cn("block space-y-0.5 px-3 py-2 hover:bg-muted/50", r.id === openId && "bg-primary/5")} data-ticket-row={r.number}>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">#{r.number}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.subject}</span>
                {r.priority !== "normal" && <span className={cn("rounded px-1.5 text-[10px] uppercase", PRI[r.priority])}>{PRIORITY_LABELS[r.priority]}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{r.customer ?? "Customer"}</span>
                <span>· {TICKET_STATUS_LABELS[r.status]}</span>
                <span>· {r.assignee ?? "Unassigned"}</span>
                <span>· {ago(r.updated_at)}</span>
                <Sla r={r} />
              </div>
            </Link>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing here.</li>}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A ticket
// ---------------------------------------------------------------------------

export function TicketView({ d, agents, queues, canned, me, lead }: { d: Detail; agents: { id: string; name: string }[]; queues: { id: string; name: string }[]; canned: { id: string; title: string; body: string }[]; me: string; lead: boolean }) {
  const { act, busy } = useAct();
  const t = d.ticket as { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue_id: string | null; assignee_id: string | null; assignee: string | null; created_at: string; rating: number | null; rating_comment: string | null; tags: string };
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [after, setAfter] = React.useState<TicketStatus | "">("");
  const [phone, setPhone] = React.useState<{ direction: "inbound" | "outbound"; minutes: number; notes: string } | null>(null);
  const end = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [d.messages.length]);
  return (
    <div className="space-y-3" data-ticket={t.number}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono text-sm text-muted-foreground">#{t.number}</span> {t.subject}
          </CardTitle>
          <CardDescription>
            {CHANNEL_LABELS[t.channel] ?? t.channel} · opened {when(t.created_at)}
            {t.rating !== null && ` · rated ${t.rating} of 5${t.rating_comment ? `: "${t.rating_comment}"` : ""}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Status" className={select} value={t.status} disabled={busy} onChange={(e) => act(() => A.setTicketStatusAction(t.id, e.target.value as TicketStatus), "Status changed")}>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select aria-label="Priority" className={select} value={t.priority} disabled={busy} onChange={(e) => act(() => A.updateTicketAction(t.id, { priority: e.target.value as Priority }), "Priority changed")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <select aria-label="Queue" className={select} value={t.queue_id ?? ""} disabled={busy} onChange={(e) => act(() => A.updateTicketAction(t.id, { queueId: e.target.value || null }), "Moved")}>
            <option value="">No queue</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
          {lead ? (
            <select aria-label="Assignee" className={select} value={t.assignee_id ?? ""} disabled={busy} onChange={(e) => act(() => A.assignTicketAction(t.id, e.target.value || null), "Assigned")}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : t.assignee_id === me ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => act(() => A.assignTicketAction(t.id, null), "Back to the queue")}>
              Give back
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => act(() => A.assignTicketAction(t.id, me), "It is yours")}>
              Take it
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{t.assignee ? `With ${t.assignee}` : "Nobody has it yet"}</span>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPhone(phone ? null : { direction: "outbound", minutes: 5, notes: "" })}>
            <PhoneIcon /> Log a phone call
          </Button>
        </CardContent>
        {phone && (
          <CardContent className="flex flex-wrap items-end gap-2 border-t pt-3 text-sm" data-log-call>
            <select aria-label="Direction" className={select} value={phone.direction} onChange={(e) => setPhone({ ...phone, direction: e.target.value as "inbound" })}>
              <option value="outbound">I called the customer</option>
              <option value="inbound">The customer called</option>
            </select>
            <Input aria-label="Minutes" type="number" min={0} className="h-8 w-24" value={phone.minutes} onChange={(e) => setPhone({ ...phone, minutes: Number(e.target.value) })} />
            <Input aria-label="What was said" placeholder="What was said" className="h-8 w-80" value={phone.notes} onChange={(e) => setPhone({ ...phone, notes: e.target.value })} />
            <Button size="sm" disabled={busy || !phone.notes.trim()} onClick={async () => (await act(() => A.logPhoneCallAction(t.id, phone), "Call logged")) && setPhone(null)}>
              Save
            </Button>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-3 xl:grid-cols-[1fr_18rem]">
        <Card>
          <CardContent className="space-y-3 py-3">
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1" data-conversation>
              {d.messages.map((m) => (
                <div key={m.id} className={cn("max-w-[85%] rounded-lg px-3 py-2 text-sm", m.internal ? "ml-auto border border-[#F9AB00]/50 bg-[#F9AB00]/10" : m.author_kind === "agent" ? "ml-auto bg-primary/10" : m.author_kind === "system" ? "mx-auto bg-muted text-xs text-muted-foreground" : "bg-muted")} data-msg={m.internal ? "note" : m.author_kind}>
                  <p className="mb-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                    {m.internal && <LockIcon className="size-3" />} {m.author ?? ""} · {when(m.created_at)}
                  </p>
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
              <div ref={end} />
            </div>
            <div className="space-y-2 border-t pt-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="xs" variant={internal ? "outline" : "default"} onClick={() => setInternal(false)}>
                  Reply to the customer
                </Button>
                <Button size="xs" variant={internal ? "default" : "outline"} onClick={() => setInternal(true)}>
                  <LockIcon /> Internal note
                </Button>
                {canned.length > 0 && (
                  <select aria-label="Saved reply" className={cn(select, "h-7 text-xs")} value="" onChange={(e) => setBody((b) => `${b}${b ? "\n" : ""}${canned.find((c) => c.id === e.target.value)?.body ?? ""}`)}>
                    <option value="">Saved replies…</option>
                    {canned.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <Textarea aria-label={internal ? "Internal note" : "Reply"} placeholder={internal ? "Only agents see this" : "Your answer to the customer"} className={cn("min-h-24", internal && "bg-[#F9AB00]/5")} value={body} onChange={(e) => setBody(e.target.value)} />
              <div className="flex flex-wrap items-center gap-2">
                {!internal && (
                  <select aria-label="Then" className={select} value={after} onChange={(e) => setAfter(e.target.value as TicketStatus | "")}>
                    <option value="">and keep the status</option>
                    <option value="pending">and wait for the customer</option>
                    <option value="solved">and mark it solved</option>
                  </select>
                )}
                <Button size="sm" disabled={busy || !body.trim()} onClick={async () => (await act(() => A.agentReplyAction(t.id, { body, internal, status: after || null }), internal ? "Note added" : "Sent")) && (setBody(""), setAfter(""))}>
                  {busy ? <Loader2Icon className="animate-spin" /> : <SendIcon />} {internal ? "Add note" : "Send"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3 text-sm">
          {d.customer && (
            <Card>
              <CardHeader className="pb-1">
                <CardTitle className="text-sm">{d.customer.name}</CardTitle>
                <CardDescription>
                  {[d.customer.email, d.customer.phone, d.customer.app].filter(Boolean).join(" · ")}
                  {d.customer.verified && " · signed in"}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-xs">
                {Object.entries(d.customer.meta).map(([k, v]) => (
                  <p key={k}>
                    <span className="text-muted-foreground">{k}:</span> {v}
                  </p>
                ))}
                {d.history.length > 0 && <p className="pt-1 font-medium">Other tickets</p>}
                {d.history.map((h) => (
                  <Link key={h.id} href={`/support?ticket=${h.id}`} className="block truncate hover:underline">
                    #{h.number} {h.subject} ({TICKET_STATUS_LABELS[h.status as TicketStatus] ?? h.status})
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Calls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs" data-calls>
              {d.calls.length === 0 && <p className="text-muted-foreground">No calls.</p>}
              {d.calls.map((c) => (
                <div key={c.id} className="space-y-1 rounded border p-1.5">
                  <p>
                    {c.kind === "phone" ? "Phone" : "App call"}, {c.direction === "outbound" ? "out" : "in"} · {c.status}
                    {c.duration_s !== null && ` · ${Math.floor(c.duration_s / 60)}:${String(c.duration_s % 60).padStart(2, "0")}`} · {c.agent ?? ""}
                  </p>
                  <p className="text-muted-foreground">{when(c.started_at)}</p>
                  {c.notes && <p>{c.notes}</p>}
                  {c.recording_id && <audio controls preload="none" src={`/api/support/recording/${c.id}`} className="h-8 w-full" data-recording-player />}
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-sm">Activity</CardTitle>
            </CardHeader>
            <CardContent className="max-h-60 space-y-1 overflow-y-auto text-xs">
              {d.log.map((l, i) => (
                <p key={i}>
                  <span className="text-muted-foreground">{ago(l.at)}</span> {l.who ?? "System"}: {l.kind.replace(/_/g, " ")}
                  {l.detail ? `, ${l.detail}` : ""}
                </p>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New ticket (phone, email, walk-in)
// ---------------------------------------------------------------------------

export function NewTicket({ queues }: { queues: { id: string; name: string }[] }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ customerName: "", email: "", phone: "", subject: "", body: "", channel: "phone", priority: "normal" as Priority, queueId: "" });
  if (!open)
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <PlusIcon /> New ticket
      </Button>
    );
  return (
    <Card className="w-full" data-new-ticket>
      <CardContent className="grid gap-2 py-3 sm:grid-cols-3">
        <Input aria-label="Customer name" placeholder="Customer name" value={f.customerName} onChange={(e) => setF({ ...f, customerName: e.target.value })} />
        <Input aria-label="Customer email" placeholder="Email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input aria-label="Customer phone" placeholder="Phone" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        <Input aria-label="Subject" placeholder="Subject" className="sm:col-span-3" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} />
        <Textarea aria-label="What the customer needs" placeholder="What the customer needs" className="sm:col-span-3" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <select aria-label="Channel" className={cn(select, "h-9")} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}>
          {["phone", "email", "walk_in", "social"].map((c) => (
            <option key={c} value={c}>
              {CHANNEL_LABELS[c]}
            </option>
          ))}
        </select>
        <select aria-label="New ticket priority" className={cn(select, "h-9")} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <select aria-label="New ticket queue" className={cn(select, "h-9")} value={f.queueId} onChange={(e) => setF({ ...f, queueId: e.target.value })}>
          <option value="">Queue by its keywords</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>
              {q.name}
            </option>
          ))}
        </select>
        <div className="flex gap-2 sm:col-span-3">
          <Button
            size="sm"
            disabled={busy || !f.customerName.trim() || !f.body.trim()}
            onClick={async () => {
              const id = await act(() => A.agentCreateTicketAction({ ...f, queueId: f.queueId || null }), "Ticket opened");
              if (id) (setOpen(false), router.push(`/support?ticket=${id}`));
            }}
          >
            Open the ticket
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// The desk around the inbox and the open ticket, holding the call in progress.
export function Desk({ status, record, children }: { status: string; record: boolean; children: React.ReactNode }) {
  const [call, setCall] = React.useState<Ring | null>(null);
  return (
    <div className="space-y-3">
      <AgentBar status={status} onCall={(r) => setCall((c) => c ?? r)} />
      {call && <CallPanel ring={call} record={record} onDone={() => setCall(null)} />}
      {children}
    </div>
  );
}
