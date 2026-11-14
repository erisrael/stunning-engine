"use client";

// The support desk (agents): status (online, away, offline), the inbox by view, a ticket with the conversation,
// replies and internal notes, saved replies, status, priority, assignment, the customer and their other tickets,
// calls (answer a call from the app in the browser, recorded when switched on; log a phone call) and the activity.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CircleIcon, HeadphonesIcon, Loader2Icon, LockIcon, MessageSquareTextIcon, MicIcon, PaperclipIcon, PhoneCallIcon, PhoneIcon, PhoneOffIcon, PlusIcon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/support-desk";
import { transferTicketAction } from "@/app/actions/support-help";
import { CHANNEL_LABELS, PRIORITIES, PRIORITY_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, type Priority, type TicketStatus } from "@/lib/support";
import { cn } from "@/lib/utils";
import { CustomerPresence, DeskLive, TranscriptLink, seenBy, useAgentTyping, useTicketLive } from "./desk-live";
import { ChatTimeline, Composer, type ComposerHandle, type KitCall, type KitMsg, type KitQuote, type KitReaction } from "@/components/support-chat/kit";
import { StudentLookupDialog } from "./student-lookup-dialog";

type Res = { ok: boolean; error?: string; data?: unknown };
type Row = { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue: string | null; customer: string | null; assignee: string | null; assignee_id: string | null; updated_at: string; sla_first_due: string | null; sla_resolve_due: string | null; first_response_at: string | null; breached: number };
type Detail = {
  ticket: Record<string, unknown>;
  customer: { id: string; name: string; email: string | null; phone: string | null; meta: Record<string, string>; verified: boolean; app: string | null; telegram?: boolean } | null;
  messages: { id: string; author_kind: string; author_id?: string | null; author: string | null; body: string; internal: boolean; created_at: string; mine?: boolean; replyTo?: { id: string; author: string; body: string } | null; reactions?: KitReaction[] }[];
  calls: { id: string; status: string; direction: string; kind: string; agent: string | null; started_at: string; duration_s: number | null; recording_id: string | null; recording_size: number | null; notes: string | null }[];
  log: { kind: string; detail: string | null; at: string; who: string | null }[];
  history: { id: string; number: number; subject: string; status: string; created_at: string }[];
  files?: { id: string; message_id: string | null; name: string; mime: string; size: number }[];
};
import { CallProvider, DialButtons, useCallCenter, type Ring } from "./call-center";

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

export function AgentBar({ status }: { status: string }) {
  const { start } = useCallCenter();
  const onCall = (r: Ring) => start({ mode: "answer", ring: r });
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
          <PhoneCallIcon /> {r.kind === "staff" ? `${r.host ?? "A colleague"} asks you to join a call (#${r.number})` : r.transferred ? `Transferred to you: ${r.customer ?? "Customer"} (#${r.number})` : `${r.customer ?? "Customer"} is calling (#${r.number})`}
        </Button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

export function Inbox({ rows, view, views, q, openId, base = "/support?" }: { rows: Row[]; view: string; views: { key: string; label: string; count?: number }[]; q: string; openId: string | null; base?: string }) {
  const router = useRouter();
  const [search, setSearch] = React.useState(q);
  const join = base.includes("?") ? (base.endsWith("?") ? base : `${base}&`) : `${base}?`;
  const href = (v: string, extra = "") => `${join}view=${encodeURIComponent(v)}${search ? `&q=${encodeURIComponent(search)}` : ""}${extra}`;
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
            <Link href={`${join}view=${encodeURIComponent(view)}&ticket=${r.id}`} className={cn("block space-y-0.5 px-3 py-2 hover:bg-muted/50", r.id === openId && "bg-primary/5")} data-ticket-row={r.number}>
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

// The customer's number: shared on Telegram (or ask for it), typed by the agent, and their records looked up.
function CustomerPhone({ customer, ticketId }: { customer: NonNullable<Detail["customer"]>; ticketId: string }) {
  const { act, busy } = useAct();
  const [edit, setEdit] = React.useState<string | null>(null);
  return (
    <div className="space-y-1.5 pb-1" data-customer-phone>
      <div className="flex flex-wrap items-center gap-1.5">
        {customer.phone ? <span className="font-medium tabular-nums" data-phone>{customer.phone}</span> : <span className="text-muted-foreground">No phone number yet</span>}
        {customer.phone && <StudentLookupDialog initialQuery={customer.phone} trigger={<Button size="xs" variant="outline" data-lookup-records>Look up records</Button>} />}
        {customer.telegram && !customer.phone && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => act(() => A.askPhoneAction(ticketId), "The customer was asked to share their number")} data-ask-phone>
            <PhoneIcon /> Ask for their number
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => setEdit(edit === null ? (customer.phone ?? "") : null)}>
          {customer.phone ? "Change" : "Add"}
        </Button>
      </div>
      {edit !== null && (
        <div className="flex gap-1">
          <Input aria-label="Customer phone number" inputMode="tel" placeholder="+251 9..." className="h-7 text-xs" value={edit} onChange={(e) => setEdit(e.target.value)} />
          <Button size="xs" disabled={busy || !edit.trim()} onClick={async () => (await act(() => A.recordPhoneAction(customer.id, edit), "Saved and matched")) && setEdit(null)}>
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

export function TicketView({ d, agents, queues, canned, me, lead, articles = [], origin = "" }: { d: Detail; agents: { id: string; name: string }[]; queues: { id: string; name: string }[]; canned: { id: string; title: string; body: string }[]; me: string; lead: boolean; articles?: { id: string; title: string }[]; origin?: string }) {
  const { act, busy } = useAct();
  const t = d.ticket as { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue_id: string | null; assignee_id: string | null; assignee: string | null; created_at: string; rating: number | null; rating_comment: string | null; tags: string };
  const [body, setBody] = React.useState("");
  const [internal, setInternal] = React.useState(false);
  const [after, setAfter] = React.useState<TicketStatus | "">("");
  const [phone, setPhone] = React.useState<{ direction: "inbound" | "outbound"; minutes: number; notes: string } | null>(null);
  const [sms, setSms] = React.useState<string | null>(null);
  // Moving to another queue (Support to Finance and back) asks for a note for the next team.
  const [move, setMove] = React.useState<{ queueId: string; note: string } | null>(null);
  const router = useRouter();
  const { ticket: live } = useTicketLive();
  const typing = useAgentTyping(t.id);
  const [reply, setReply] = React.useState<KitQuote | null>(null);
  const composer = React.useRef<ComposerHandle>(null);
  // The conversation for the chat kit: agents on the right (the customer reads them), notes in yellow.
  const fileUrl = (id: string) => `/api/support/files/${id}`;
  const kitMsgs: KitMsg[] = d.messages.map((m) => ({
    id: m.id,
    side: m.internal ? (m.author_kind === "system" ? "system" : "note") : m.author_kind === "agent" ? "out" : m.author_kind === "system" ? "system" : "in",
    author: m.author_kind === "agent" ? (m.mine ? null : m.author) : m.author,
    authorKey: m.author_kind === "customer" ? "customer" : `a:${m.author_id ?? m.author ?? ""}`,
    body: m.body,
    at: m.created_at,
    files: (d.files ?? []).filter((f) => f.message_id === m.id).map((f) => ({ ...f, url: fileUrl(f.id) })),
    replyTo: m.replyTo ?? null,
    reactions: m.reactions ?? [],
    status: m.author_kind === "agent" && !m.internal ? (seenBy(live?.read, m.created_at) ? "seen" : "sent") : null,
    role: m.internal ? "note" : m.author_kind,
  }));
  const kitCalls: KitCall[] = d.calls.map((c) => ({ id: c.id, at: c.started_at, direction: c.direction, kind: c.kind, status: c.status, durationS: c.duration_s, who: c.agent, recordingUrl: c.recording_id ? `/api/support/recording/${c.id}` : null }));
  const uploadFile = async (blob: Blob, name: string, caption: string) => {
    const qs = new URLSearchParams({ ticket: t.id, name, ...(caption ? { caption } : {}), ...(reply ? { replyTo: reply.id } : {}) });
    const r = await fetch(`/api/support/upload?${qs}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not send the file.");
  };
  return (
    <div className="space-y-3" data-ticket={t.number}>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <span className="font-mono text-sm text-muted-foreground">#{t.number}</span> {t.subject}
            <span className="ml-auto flex items-center gap-3">
              <CustomerPresence />
              <TranscriptLink ticketId={t.id} />
            </span>
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
          <select aria-label="Queue" className={select} value={move?.queueId ?? t.queue_id ?? ""} disabled={busy} onChange={(e) => (e.target.value && e.target.value !== t.queue_id ? setMove({ queueId: e.target.value, note: move?.note ?? "" }) : setMove(null))}>
            <option value="" disabled={!!t.queue_id}>
              No queue
            </option>
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
          <span className="ml-auto" />
          <DialButtons ticketId={t.id} customer={d.customer?.name ?? null} number={t.number} phone={d.customer?.phone ?? null} />
          <Button size="sm" variant="ghost" onClick={() => setPhone(phone ? null : { direction: "outbound", minutes: 5, notes: "" })}>
            <PhoneIcon /> Log a phone call
          </Button>
          {d.customer?.phone && (
            <Button size="sm" variant="ghost" onClick={() => setSms(sms === null ? "" : null)} data-sms-open>
              <MessageSquareTextIcon /> Send SMS
            </Button>
          )}
        </CardContent>
        {move && (
          <CardContent className="flex flex-wrap items-end gap-2 border-t pt-3 text-sm" data-transfer>
            <span className="text-xs text-muted-foreground">Move to {queues.find((q) => q.id === move.queueId)?.name}. The customer keeps the same conversation.</span>
            <Input aria-label="Note for the next team" placeholder="Note for the next team, e.g. paid by telebirr on 3 Nov, not showing" className="h-8 min-w-72 flex-1" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
            <Button size="sm" disabled={busy || !move.note.trim()} onClick={async () => (await act(() => transferTicketAction(t.id, move.queueId, move.note), "Moved with your note")) && setMove(null)}>
              Move
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMove(null)}>
              Cancel
            </Button>
          </CardContent>
        )}
        {sms !== null && (
          <CardContent className="flex flex-wrap items-end gap-2 border-t pt-3 text-sm" data-send-sms>
            <span className="text-xs text-muted-foreground">To {d.customer?.phone}. Kept on the ticket.</span>
            <Input aria-label="SMS text" maxLength={600} placeholder="Short message" className="h-8 min-w-72 flex-1" value={sms} onChange={(e) => setSms(e.target.value)} />
            <Button size="sm" disabled={busy || !sms.trim()} onClick={async () => (await act(() => A.agentSmsAction(t.id, sms), "SMS sent")) && setSms(null)}>
              Send
            </Button>
          </CardContent>
        )}
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
          <CardContent className="flex h-[34rem] flex-col p-0" data-desk-chat>
            <ChatTimeline
              messages={kitMsgs}
              calls={kitCalls}
              typing={live?.typing ? (d.customer?.name ?? "The customer").split(" ")[0]! : null}
              onReply={(m) => setReply({ id: m.id, author: m.side === "in" ? (d.customer?.name ?? "Customer") : (m.author ?? "Support"), body: m.body })}
              onReact={(m, e) => void act(() => A.reactAction(m.id, e))}
              onDropFiles={internal ? undefined : (list) => composer.current?.addFiles(list)}
            />
            <Composer
              ref={composer}
              value={body}
              onChange={setBody}
              onTyping={internal ? undefined : typing}
              tone={internal ? "note" : undefined}
              placeholder={internal ? "Only agents see this" : "Your answer to the customer"}
              label={internal ? "Internal note" : "Reply"}
              sendLabel={internal ? "Add note" : "Send"}
              replyTo={reply}
              onCancelReply={() => setReply(null)}
              onError={(e) => toast.error(e)}
              onSend={async (text) => {
                const r = await A.agentReplyAction(t.id, { body: text, internal, status: after || null, replyTo: reply?.id ?? null });
                if (!r.ok) throw new Error(r.error ?? "Not sent.");
                if (internal) toast.success("Note added");
                setReply(null);
                setAfter("");
                router.refresh();
              }}
              onFiles={internal ? undefined : async (list, caption) => {
                for (const [i, f] of list.entries()) await uploadFile(f, f.name, i === 0 ? caption : "");
                setReply(null);
                router.refresh();
              }}
              onVoice={internal ? undefined : async (blob) => {
                await uploadFile(blob, `voice-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"}`, "");
                setReply(null);
                router.refresh();
              }}
              above={
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs" variant={internal ? "outline" : "default"} onClick={() => setInternal(false)}>
                    Reply to the customer
                  </Button>
                  <Button size="xs" variant={internal ? "default" : "outline"} onClick={() => setInternal(true)}>
                    <LockIcon /> Internal note
                  </Button>
                  {articles.length > 0 && !internal && (
                    <select
                      aria-label="Help article"
                      className={cn(select, "h-7 text-xs")}
                      value=""
                      onChange={(e) => {
                        const x = articles.find((y) => y.id === e.target.value);
                        if (x) setBody((b) => `${b}${b ? "\n\n" : ""}${x.title}: ${origin}/help/${x.id}`);
                      }}
                    >
                      <option value="">Link an article…</option>
                      {articles.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.title}
                        </option>
                      ))}
                    </select>
                  )}
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
                  {!internal && (
                    <select aria-label="Then" className={cn(select, "h-7 text-xs")} value={after} onChange={(e) => setAfter(e.target.value as TicketStatus | "")}>
                      <option value="">and keep the status</option>
                      <option value="pending">and wait for the customer</option>
                      <option value="solved">and mark it solved</option>
                    </select>
                  )}
                </div>
              }
            />
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
                <CustomerPhone customer={d.customer} ticketId={t.id} />
                {Object.entries(d.customer.meta).filter(([k]) => !k.startsWith("tg")).map(([k, v]) => (
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
  return (
    <DeskLive>
      <CallProvider record={record}>
        <div className="space-y-3">
          <AgentBar status={status} />
          {children}
        </div>
      </CallProvider>
    </DeskLive>
  );
}
