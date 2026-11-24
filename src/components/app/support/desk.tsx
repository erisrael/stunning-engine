"use client";

// The support desk (agents): status (online, away, offline), the inbox by view, a ticket with the conversation,
// replies and internal notes, saved replies, status, priority, assignment, the customer and their other tickets,
// calls (answer a call from the app in the browser, recorded when switched on; log a phone call) and the activity.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, ArrowLeftIcon, ArchiveIcon, BookmarkIcon, CircleIcon, FlagIcon, ForwardIcon, InfoIcon, Loader2Icon, LockIcon, MessageSquareTextIcon, PencilIcon, PhoneCallIcon, PhoneIcon, PlusIcon, SearchIcon, SendIcon, Trash2Icon } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import * as SC from "@/app/actions/support-chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import * as A from "@/app/actions/support-desk";
import { transferTicketAction } from "@/app/actions/support-help";
import { CHANNEL_LABELS, PRIORITIES, PRIORITY_LABELS, TICKET_STATUSES, TICKET_STATUS_LABELS, type Priority, type TicketStatus } from "@/lib/support";
import { cn } from "@/lib/utils";
import { CustomerPresence, DeskLive, TranscriptLink, seenBy, useAgentTyping, useTicketLive } from "./desk-live";
import { ChatTimeline, Composer, type ComposerHandle, type KitCall, type KitMenuItem, type KitMsg, type KitQuote, type KitReaction } from "@/components/support-chat/kit";
import { StudentLookupDialog } from "./student-lookup-dialog";
import { UserAvatar } from "@/components/app/primitives";

type Res = { ok: boolean; error?: string; data?: unknown };
type Row = { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue: string | null; customer: string | null; assignee: string | null; assignee_id: string | null; updated_at: string; sla_first_due: string | null; sla_resolve_due: string | null; first_response_at: string | null; breached: number; unread?: number; escalated_at?: string | null };
type Detail = {
  retention?: boolean;
  ticket: Record<string, unknown>;
  customer: { id: string; name: string; email: string | null; phone: string | null; meta: Record<string, string>; verified: boolean; app: string | null; telegram?: boolean; external_id?: string | null } | null;
  messages: { id: string; author_kind: string; author_id?: string | null; author: string | null; body: string; internal: boolean; created_at: string; mine?: boolean; replyTo?: { id: string; author: string; body: string } | null; reactions?: KitReaction[]; edited_at?: string | null; deleted_at?: string | null; delivered_at?: string | null; saved?: boolean }[];
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
const STATUS_DOT: Record<string, string> = { online: "text-[#188038]", busy: "text-[#D93025]", away: "text-[#F9AB00]", break: "text-[#8430CE]", offline: "text-muted-foreground" };
const STATUS_LABEL: Record<string, string> = { online: "Available", busy: "Busy", away: "Away", break: "Break", offline: "Offline" };
const STATUS_TOAST: Record<string, string> = { online: "You are available: new conversations and calls come to you", busy: "Busy: no new conversations or queue calls until you are available", away: "Away", break: "On a break", offline: "Offline" };
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
    <span className={cn("text-xs tabular-nums", tone)} title={r.first_response_at ? "Time left to solve" : "Time left to answer"} suppressHydrationWarning>
      {left < 0 ? `${ago(due)} late` : `${left < 60 ? `${left} min` : `${Math.round(left / 60)} h`} left`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Agent status, heartbeat and incoming calls
// ---------------------------------------------------------------------------

export function AgentBar({ status, compact = false }: { status: string; compact?: boolean }) {
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
    <div className={cn("flex items-center gap-2", compact ? "min-w-0 flex-nowrap" : "flex-wrap")} data-agent-bar>
      <span className={cn("text-sm text-muted-foreground", compact && "sr-only")}>My status</span>
      {compact ? (
        // In the desk's list header: one segmented control; only your current status is spelled out.
        <span role="group" aria-label="My status" className="inline-flex shrink-0 items-center rounded-full border bg-background p-0.5">
          {(["online", "busy", "away", "break", "offline"] as const).map((s) => (
            <button
              key={s}
              type="button"
              disabled={busy}
              aria-pressed={status === s}
              title={STATUS_LABEL[s]}
              onClick={() => act(() => A.setAgentStatusAction(s), STATUS_TOAST[s]!)}
              className={cn("inline-flex h-7 items-center gap-1.5 rounded-full px-2 text-xs transition-colors [&>svg]:shrink-0 disabled:opacity-60", status === s ? "bg-muted font-medium text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              data-status={s}
            >
              <CircleIcon className={cn("size-2.5 fill-current", STATUS_DOT[s])} />
              {status === s && <span>{STATUS_LABEL[s]}</span>}
            </button>
          ))}
        </span>
      ) : (
        (["online", "busy", "away", "break", "offline"] as const).map((s) => (
          <Button key={s} size="sm" variant={status === s ? "default" : "outline"} disabled={busy} onClick={() => act(() => A.setAgentStatusAction(s), STATUS_TOAST[s]!)} data-status={s}>
            <CircleIcon className={cn("size-3 fill-current", STATUS_DOT[s])} /> {STATUS_LABEL[s]}
          </Button>
        ))
      )}
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

export function Inbox({ rows, view, views, q, openId, base = "/support?", pri = "", ch = "", channels = [] }: { rows: Row[]; view: string; views: { key: string; label: string; count?: number }[]; q: string; openId: string | null; base?: string; pri?: string; ch?: string; channels?: { key: string; label: string }[] }) {
  const router = useRouter();
  const [search, setSearch] = React.useState(q);
  const join = base.includes("?") ? (base.endsWith("?") ? base : `${base}&`) : `${base}?`;
  const keep = (p: string, c: string) => `${p ? `&pri=${p}` : ""}${c ? `&ch=${c}` : ""}`;
  const href = (v: string, extra = "") => `${join}view=${encodeURIComponent(v)}${search ? `&q=${encodeURIComponent(search)}` : ""}${keep(pri, ch)}${extra}`;
  // The everyday lists stay as chips; the others (and each queue) are in "More lists".
  const PRIMARY = ["mine", "unassigned", "waiting", "escalated", "breached"];
  const primary = views.filter((v) => PRIMARY.includes(v.key));
  const more = views.filter((v) => !PRIMARY.includes(v.key));
  // The list of conversations, laid out like Team chat: search, the lists as chips, then one row per conversation.
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-inbox>
      <div className="space-y-2 border-b p-3">
        <form className="relative" onSubmit={(e) => (e.preventDefault(), router.push(href(view)))}>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label="Search tickets" placeholder="Search number, customer, phone or words" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 rounded-full bg-muted/60 pl-8" />
        </form>
        {/* The main lists as chips (with counts), the rest in one picker: no row to scroll sideways. */}
        <nav aria-label="Conversation lists" data-inbox-lists className="flex flex-wrap items-center gap-1">
          {primary.map((v) => (
            <Link key={v.key} href={href(v.key)} aria-current={view === v.key ? "page" : undefined} className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs whitespace-nowrap", view === v.key ? "border-primary bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted")} data-view={v.key}>
              {v.label}
              {v.count ? <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{v.count}</span> : null}
            </Link>
          ))}
          {more.length > 0 && (
            <select
              aria-label="More lists"
              className={cn(select, "h-7 max-w-[11rem] min-w-0 rounded-full px-2.5 text-xs", more.some((v) => v.key === view) && "border-primary bg-primary/10 font-medium text-foreground")}
              value={more.some((v) => v.key === view) ? view : ""}
              onChange={(e) => e.target.value && router.push(href(e.target.value))}
            >
              <option value="">More lists…</option>
              {more.map((v) => (
                <option key={v.key} value={v.key}>
                  {v.label}
                  {v.count ? ` (${v.count})` : ""}
                </option>
              ))}
            </select>
          )}
        </nav>
        <div className="flex gap-1" aria-label="Filters">
          <select aria-label="Priority filter" className={cn(select, "h-7 min-w-0 flex-1 rounded-full text-xs")} value={pri} onChange={(e) => router.push(`${join}view=${encodeURIComponent(view)}${search ? `&q=${encodeURIComponent(search)}` : ""}${keep(e.target.value, ch)}`)}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
          <select aria-label="Channel filter" className={cn(select, "h-7 min-w-0 flex-1 rounded-full text-xs")} value={ch} onChange={(e) => router.push(`${join}view=${encodeURIComponent(view)}${search ? `&q=${encodeURIComponent(search)}` : ""}${keep(pri, e.target.value)}`)}>
            <option value="">Any channel</option>
            {channels.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((r) => {
          const unread = Number(r.unread) > 0;
          return (
            <li key={r.id}>
              <Link href={`${join}view=${encodeURIComponent(view)}${keep(pri, ch)}&ticket=${r.id}`} aria-current={r.id === openId ? "true" : undefined} className={cn("flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60", r.id === openId && "bg-primary/10 hover:bg-primary/10")} data-ticket-row={r.number}>
                <span className="relative shrink-0">
                  <UserAvatar name={r.customer ?? "Customer"} size="md" className="size-11 text-sm" />
                  {r.escalated_at && <AlertTriangleIcon className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-card p-0.5 text-[#D93025]" aria-label="Escalated" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className={cn("truncate", unread ? "font-semibold" : "font-medium")}>{r.customer ?? "Customer"}</span>
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>{ago(r.updated_at)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", unread ? "text-foreground" : "text-muted-foreground")}>
                      <span className="font-mono text-xs">#{r.number}</span> {r.subject}
                    </span>
                    {unread && <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground" aria-label={`${r.unread} unread`} data-unread>{r.unread}</span>}
                  </span>
                  <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
                    <span>{TICKET_STATUS_LABELS[r.status]}</span>
                    <span>· {r.assignee ?? "Unassigned"}</span>
                    {r.priority !== "normal" && <span className={cn("rounded px-1 text-[10px] uppercase", PRI[r.priority])}>{PRIORITY_LABELS[r.priority]}</span>}
                    <Sla r={r} />
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">Nothing here.</li>}
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

export function TicketView({ d, agents, queues, canned, me, lead, articles = [], origin = "", backHref }: { d: Detail; agents: { id: string; name: string }[]; queues: { id: string; name: string }[]; canned: { id: string; title: string; body: string }[]; me: string; lead: boolean; articles?: { id: string; title: string }[]; origin?: string; backHref?: string }) {
  const { act, busy } = useAct();
  const t = d.ticket as { id: string; number: number; subject: string; status: TicketStatus; priority: Priority; channel: string; queue_id: string | null; assignee_id: string | null; assignee: string | null; created_at: string; rating: number | null; rating_comment: string | null; tags: string; escalated_at?: string | null; escalation_note?: string | null; archived_at?: string | null; offered_at?: string | null; legal_hold?: number };
  const [forwardFor, setForwardFor] = React.useState<string | null>(null);
  const [detailsFor, setDetailsFor] = React.useState<string | null>(null);
  const [panel, setPanel] = React.useState(false);
  // The customer panel: a column on wide screens (shown until closed), a sheet on narrower ones.
  const [info, setInfo] = React.useState(true);
  const openInfo = () => (window.matchMedia("(min-width: 1280px)").matches ? setInfo((v) => !v) : setPanel(true));
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
    status: m.author_kind === "agent" && !m.internal ? (seenBy(live?.read, m.created_at) ? "seen" : m.delivered_at ? "delivered" : "sent") : null,
    role: m.internal ? "note" : m.author_kind,
    edited: !!m.edited_at,
    deleted: !!m.deleted_at,
    saved: !!m.saved,
  }));
  // The message menu (right-click, or a long press on a phone), after the kit's Reply, React and Copy.
  const menu = (km: KitMsg): KitMenuItem[] => {
    const src = d.messages.find((x) => x.id === km.id);
    if (!src) return [];
    const items: KitMenuItem[] = [
      { key: "forward", label: "Forward", icon: <ForwardIcon />, onSelect: () => setForwardFor(src.id) },
      { key: "save", label: src.saved ? "Remove from saved" : "Save", icon: <BookmarkIcon />, onSelect: () => void act(() => SC.saveSupportMessageAction(src.id), src.saved ? "Removed from saved" : "Saved") },
      { key: "details", label: "View details", icon: <InfoIcon />, onSelect: () => setDetailsFor(src.id) },
      {
        key: "report",
        label: "Report",
        icon: <FlagIcon />,
        onSelect: () => {
          const why = window.prompt("Why do you report this message? The support leads are told.");
          if (why?.trim()) void act(() => SC.reportSupportMessageAction(src.id, why), "Reported to the support leads");
        },
      },
    ];
    if (src.mine)
      items.push({
        key: "edit",
        label: "Edit",
        icon: <PencilIcon />,
        separatorBefore: true,
        onSelect: () => {
          const next = window.prompt("Edit your message", src.body);
          if (next !== null && next.trim() && next !== src.body) void act(() => SC.editSupportMessageAction(src.id, next), "Edited");
        },
      });
    if (src.mine || lead)
      items.push({
        key: "delete",
        label: "Delete",
        icon: <Trash2Icon />,
        danger: true,
        separatorBefore: !src.mine,
        onSelect: async () => {
          if (!window.confirm("Delete this message? It stays on record for the support leads.")) return;
          const r = await SC.deleteSupportMessageAction(src.id);
          if (!r.ok) return void toast.error(r.error);
          toast.success(r.data?.stillWithCustomer ? "Deleted here. The customer keeps the copy already sent to their Telegram or email." : "Deleted");
          router.refresh();
        },
      });
    return items;
  };
  const kitCalls: KitCall[] = d.calls.map((c) => ({ id: c.id, at: c.started_at, direction: c.direction, kind: c.kind, status: c.status, durationS: c.duration_s, who: c.agent, recordingUrl: c.recording_id ? `/api/support/recording/${c.id}` : null }));
  const uploadFile = async (blob: Blob, name: string, caption: string) => {
    const qs = new URLSearchParams({ ticket: t.id, name, ...(caption ? { caption } : {}), ...(reply ? { replyTo: reply.id } : {}) });
    const r = await fetch(`/api/support/upload?${qs}`, { method: "POST", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Could not send the file.");
  };
  const sel = cn(select, "h-7 max-w-40 shrink-0 text-xs");
  return (
    <div className="flex h-full min-h-0" data-ticket={t.number}>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Like a Team chat conversation: who it is with, their presence, calls and the details button. */}
        <header className="flex items-center gap-2 border-b px-3 py-2 sm:gap-3" data-ticket-header>
          {backHref && (
            <Button size="icon" variant="ghost" className="shrink-0 md:hidden" asChild aria-label="Back to conversations">
              <Link href={backHref}>
                <ArrowLeftIcon />
              </Link>
            </Button>
          )}
          <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={openInfo}>
            <UserAvatar name={d.customer?.name ?? "Customer"} size="md" className="size-10 shrink-0 text-sm" />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate font-semibold">{d.customer?.name ?? "Customer"}</span>
                <CustomerPresence />
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                <span className="font-mono">#{t.number}</span> {t.subject} · {CHANNEL_LABELS[t.channel] ?? t.channel} · opened {when(t.created_at)}
                {t.rating !== null && ` · rated ${t.rating} of 5${t.rating_comment ? `: "${t.rating_comment}"` : ""}`}
              </span>
            </span>
          </button>
          <span className="hidden shrink-0 sm:inline-flex">
            <TranscriptLink ticketId={t.id} />
          </span>
          <Button size="icon" variant={info ? "secondary" : "ghost"} className="shrink-0" aria-label="Customer details" title="Customer details" aria-pressed={info} onClick={openInfo} data-customer-panel-open>
            <InfoIcon />
          </Button>
        </header>
        {/* The conversation's state and actions in one slim row; on small screens it wraps onto more lines. */}
        <div className="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5 text-sm" data-ticket-tools>
          <select aria-label="Status" className={sel} value={t.status} disabled={busy} onChange={(e) => act(() => A.setTicketStatusAction(t.id, e.target.value as TicketStatus), "Status changed")}>
            {TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TICKET_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select aria-label="Priority" className={sel} value={t.priority} disabled={busy} onChange={(e) => act(() => A.updateTicketAction(t.id, { priority: e.target.value as Priority }), "Priority changed")}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABELS[p]}
              </option>
            ))}
          </select>
          <select aria-label="Queue" className={sel} value={move?.queueId ?? t.queue_id ?? ""} disabled={busy} onChange={(e) => (e.target.value && e.target.value !== t.queue_id ? setMove({ queueId: e.target.value, note: move?.note ?? "" }) : setMove(null))}>
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
            <select aria-label="Assignee" className={sel} value={t.assignee_id ?? ""} disabled={busy} onChange={(e) => act(() => A.assignTicketAction(t.id, e.target.value || null), "Assigned")}>
              <option value="">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          ) : t.assignee_id === me ? (
            <Button size="xs" variant="outline" className="shrink-0" disabled={busy} onClick={() => act(() => A.assignTicketAction(t.id, null), "Back to the queue")}>
              Give back
            </Button>
          ) : (
            <Button size="xs" className="shrink-0" disabled={busy} onClick={() => act(() => A.assignTicketAction(t.id, me), "It is yours")}>
              Take it
            </Button>
          )}
          <span className="shrink-0 text-xs whitespace-nowrap text-muted-foreground">{t.assignee ? `With ${t.assignee}` : "Nobody has it yet"}</span>
          {/* Offered by a queue where agents accept: take it, or pass it to the next agent. */}
          {t.offered_at && t.assignee_id === me && (
            <span className="flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs" data-offered>
              Offered to you
              <Button size="xs" disabled={busy} onClick={() => act(() => SC.acceptConversationAction(t.id), "Accepted: it is yours")} data-offer-accept>Accept</Button>
              <Button size="xs" variant="outline" disabled={busy} onClick={() => act(() => SC.declineConversationAction(t.id), "Declined: it goes to the next agent")} data-offer-decline>Decline</Button>
            </span>
          )}
          <span className="ml-auto" />
          <span className="flex shrink-0 items-center [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs">
            <DialButtons ticketId={t.id} customer={d.customer?.name ?? null} number={t.number} phone={d.customer?.phone ?? null} />
          </span>
          <Button size="xs" variant="ghost" className="shrink-0" onClick={() => setPhone(phone ? null : { direction: "outbound", minutes: 5, notes: "" })}>
            <PhoneIcon /> Log a phone call
          </Button>
          {d.customer?.phone && (
            <Button size="xs" variant="ghost" className="shrink-0" onClick={() => setSms(sms === null ? "" : null)} data-sms-open>
              <MessageSquareTextIcon /> Send SMS
            </Button>
          )}
          <Button size="xs" variant={t.escalated_at ? "default" : "ghost"} className="shrink-0" disabled={busy} onClick={() => { if (t.escalated_at) void act(() => SC.escalateTicketAction(t.id, null, false), "No longer escalated"); else { const why = window.prompt("Why escalate? The support leads are told."); if (why !== null) void act(() => SC.escalateTicketAction(t.id, why), "Escalated"); } }} data-escalate>
            <AlertTriangleIcon /> {t.escalated_at ? "Escalated" : "Escalate"}
          </Button>
          <Button asChild size="xs" variant="ghost" className="shrink-0">
            <Link href={`/support-requests?ticket=${t.id}`} data-new-support-request>
              <SendIcon /> Support request
            </Link>
          </Button>
          <Button size="xs" variant="ghost" className="shrink-0" disabled={busy} title={t.archived_at ? "Bring it back to the working lists" : "Hide it from the working lists; nothing is deleted and it can be restored"} onClick={() => act(() => SC.archiveTicketAction(t.id, !t.archived_at), t.archived_at ? "Restored to the lists" : "Archived (restore it from Archived)")} data-archive>
            <ArchiveIcon /> {t.archived_at ? "Restore" : "Archive"}
          </Button>
          {d.retention && (
            <>
              <Button
                size="xs"
                variant={t.legal_hold ? "default" : "ghost"}
                className="shrink-0"
                disabled={busy}
                title="A conversation under legal hold is never deleted"
                onClick={() => {
                  if (t.legal_hold) return void act(() => SC.conversationHoldAction(t.id, false), "Legal hold lifted");
                  const why = window.prompt("Why must this conversation be kept? (complaint, dispute, investigation)");
                  if (why) void act(() => SC.conversationHoldAction(t.id, true, why), "Kept under legal hold");
                }}
                data-conversation-hold
              >
                <LockIcon /> {t.legal_hold ? "Legal hold" : "Hold"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                className="shrink-0 text-destructive"
                disabled={busy || !!t.legal_hold}
                title={t.legal_hold ? "Lift the legal hold first" : "Delete permanently: the messages and files go for good; call records stay"}
                onClick={async () => {
                  const why = window.prompt(`Delete conversation #${t.number} permanently? Its messages and files cannot be restored (call records stay). Write the reason to confirm.`);
                  if (!why) return;
                  if (await act(() => SC.deleteConversationAction(t.id, why), "Conversation deleted")) window.location.assign("/support?view=all");
                }}
                data-conversation-delete
              >
                <Trash2Icon /> Delete
              </Button>
            </>
          )}
        </div>
        {move && (
          <div className="flex flex-wrap items-end gap-2 border-b bg-muted/30 px-3 py-2 text-sm" data-transfer>
            <span className="text-xs text-muted-foreground">Move to {queues.find((q) => q.id === move.queueId)?.name}. The customer keeps the same conversation.</span>
            <Input aria-label="Note for the next team" placeholder="Note for the next team, e.g. paid by telebirr on 3 Nov, not showing" className="h-8 min-w-60 flex-1" value={move.note} onChange={(e) => setMove({ ...move, note: e.target.value })} />
            <Button size="sm" disabled={busy || !move.note.trim()} onClick={async () => (await act(() => transferTicketAction(t.id, move.queueId, move.note), "Moved with your note")) && setMove(null)}>
              Move
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMove(null)}>
              Cancel
            </Button>
          </div>
        )}
        {sms !== null && (
          <div className="flex flex-wrap items-end gap-2 border-b bg-muted/30 px-3 py-2 text-sm" data-send-sms>
            <span className="text-xs text-muted-foreground">To {d.customer?.phone}. Kept on the ticket.</span>
            <Input aria-label="SMS text" maxLength={600} placeholder="Short message" className="h-8 min-w-60 flex-1" value={sms} onChange={(e) => setSms(e.target.value)} />
            <Button size="sm" disabled={busy || !sms.trim()} onClick={async () => (await act(() => A.agentSmsAction(t.id, sms), "SMS sent")) && setSms(null)}>
              Send
            </Button>
          </div>
        )}
        {phone && (
          <div className="flex flex-wrap items-end gap-2 border-b bg-muted/30 px-3 py-2 text-sm" data-log-call>
            <select aria-label="Direction" className={select} value={phone.direction} onChange={(e) => setPhone({ ...phone, direction: e.target.value as "inbound" })}>
              <option value="outbound">I called the customer</option>
              <option value="inbound">The customer called</option>
            </select>
            <Input aria-label="Minutes" type="number" min={0} className="h-8 w-24" value={phone.minutes} onChange={(e) => setPhone({ ...phone, minutes: Number(e.target.value) })} />
            <Input aria-label="What was said" placeholder="What was said" className="h-8 min-w-60 flex-1" value={phone.notes} onChange={(e) => setPhone({ ...phone, notes: e.target.value })} />
            <Button size="sm" disabled={busy || !phone.notes.trim()} onClick={async () => (await act(() => A.logPhoneCallAction(t.id, phone), "Call logged")) && setPhone(null)}>
              Save
            </Button>
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col" data-desk-chat>
            <ChatTimeline
              messages={kitMsgs}
              calls={kitCalls}
              typing={live?.typing ? (d.customer?.name ?? "The customer").split(" ")[0]! : null}
              onReply={(m) => setReply({ id: m.id, author: m.side === "in" ? (d.customer?.name ?? "Customer") : (m.author ?? "Support"), body: m.body })}
              onReact={(m, e) => void act(() => A.reactAction(m.id, e))}
              onDropFiles={internal ? undefined : (list) => composer.current?.addFiles(list)}
              menu={menu}
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
                      className={cn(select, "h-7 max-w-44 text-xs")}
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
                    <select aria-label="Saved reply" className={cn(select, "h-7 max-w-44 text-xs")} value="" onChange={(e) => setBody((b) => `${b}${b ? "\n" : ""}${canned.find((c) => c.id === e.target.value)?.body ?? ""}`)}>
                      <option value="">Saved replies…</option>
                      {canned.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  )}
                  {!internal && (
                    <select aria-label="Then" className={cn(select, "h-7 max-w-48 text-xs")} value={after} onChange={(e) => setAfter(e.target.value as TicketStatus | "")}>
                      <option value="">and keep the status</option>
                      <option value="pending">and wait for the customer</option>
                      <option value="solved">and mark it solved</option>
                    </select>
                  )}
                </div>
              }
            />
        </div>
      </div>

      {info && (
        <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l bg-card text-sm xl:flex 2xl:w-96" data-customer-panel>
          {side()}
        </aside>
      )}
      <Sheet open={panel} onOpenChange={setPanel}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-md">
          <SheetHeader className="sr-only">
            <SheetTitle>{d.customer?.name ?? "Customer"}</SheetTitle>
            <SheetDescription>#{t.number} · {t.subject}</SheetDescription>
          </SheetHeader>
          <div className="text-sm">{side()}</div>
        </SheetContent>
      </Sheet>
      <ForwardSheet messageId={forwardFor} onClose={() => setForwardFor(null)} />
      <DetailsSheet messageId={detailsFor} onClose={() => setDetailsFor(null)} />
    </div>
  );

  // The customer and the conversation, like Team chat's contact panel: who they are, Telegram, contacts, records,
  // agent, priority, tags, other conversations, calls and the activity.
  function side() {
    const tags = (() => {
      try {
        return JSON.parse(t.tags || "[]") as string[];
      } catch {
        return [];
      }
    })();
    return (
      <>
        <div className="flex flex-col items-center gap-1 border-b px-4 py-5 text-center">
          <UserAvatar name={d.customer?.name ?? "Customer"} size="md" className="size-16 text-lg" />
          <p className="mt-1 font-semibold">{d.customer?.name ?? "Customer"}</p>
          {d.customer && (
            <p className="text-xs text-muted-foreground">
              {[d.customer.app, d.customer.verified ? "signed in" : null].filter(Boolean).join(" · ") || (CHANNEL_LABELS[t.channel] ?? t.channel)}
            </p>
          )}
          <CustomerPresence />
        </div>
        <PanelSection title="Conversation" data-conversation-facts>
          <p><span className="text-muted-foreground">Agent:</span> {t.assignee ?? "Nobody yet"}</p>
          <p><span className="text-muted-foreground">Priority:</span> {PRIORITY_LABELS[t.priority]}</p>
          <p><span className="text-muted-foreground">Status:</span> {TICKET_STATUS_LABELS[t.status]}</p>
          {t.escalated_at && <p className="text-[#D93025]"><span className="text-muted-foreground">Escalated:</span> {when(t.escalated_at)}{t.escalation_note ? `, ${t.escalation_note}` : ""}</p>}
          <form className="flex gap-1 pt-1" onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("tags") ?? ""); void act(() => A.updateTicketAction(t.id, { tags: v.split(",").map((x) => x.trim()).filter(Boolean) }), "Tags saved"); }}>
            <Input name="tags" aria-label="Tags" defaultValue={tags.join(", ")} placeholder="Tags, separated by commas" className="h-7 text-xs" />
            <Button size="xs" type="submit" disabled={busy}>Save</Button>
          </form>
        </PanelSection>
        {d.customer && (
          <PanelSection title="Contact">
            {d.customer.email && <p>{d.customer.email}</p>}
            <CustomerPhone customer={d.customer} ticketId={t.id} />
            {d.customer.telegram && d.customer.external_id && <p data-telegram-id><span className="text-muted-foreground">Telegram ID:</span> <span className="tabular-nums">{d.customer.external_id.replace(/^tg:/, "")}</span></p>}
            {Object.entries(d.customer.meta).filter(([k]) => !k.startsWith("tg")).map(([k, v]) => (
              <p key={k}>
                <span className="text-muted-foreground">{k}:</span> {v}
              </p>
            ))}
          </PanelSection>
        )}
        {d.history.length > 0 && (
          <PanelSection title="Other conversations">
            {d.history.map((h) => (
              <Link key={h.id} href={`/support?ticket=${h.id}`} className="block truncate hover:underline">
                #{h.number} {h.subject} ({TICKET_STATUS_LABELS[h.status as TicketStatus] ?? h.status})
              </Link>
            ))}
          </PanelSection>
        )}
        <PanelSection title="Calls" data-calls>
          {d.calls.length === 0 && <p className="text-muted-foreground">No calls.</p>}
          {d.calls.map((c) => (
            <div key={c.id} className="space-y-1 rounded-md border p-1.5">
              <p>
                {c.kind === "phone" ? "Phone" : "App call"}, {c.direction === "outbound" ? "out" : "in"} · {c.status}
                {c.duration_s !== null && ` · ${Math.floor(c.duration_s / 60)}:${String(c.duration_s % 60).padStart(2, "0")}`} · {c.agent ?? ""}
              </p>
              <p className="text-muted-foreground">{when(c.started_at)}</p>
              {c.notes && <p>{c.notes}</p>}
              {c.recording_id && <audio controls preload="none" src={`/api/support/recording/${c.id}`} className="h-8 w-full" data-recording-player />}
            </div>
          ))}
        </PanelSection>
        <PanelSection title="Activity">
          <div className="max-h-60 space-y-1 overflow-y-auto">
            {d.log.map((l, i) => (
              <p key={i}>
                <span className="text-muted-foreground">{ago(l.at)}</span> {l.who ?? "System"}: {l.kind.replace(/_/g, " ")}
                {l.detail ? `, ${l.detail}` : ""}
              </p>
            ))}
          </div>
        </PanelSection>
      </>
    );
  }
}

// A section of the customer panel: a small uppercase heading over its facts.
function PanelSection({ title, children, ...rest }: { title: string; children: React.ReactNode } & { [k: `data-${string}`]: unknown }) {
  return (
    <section className="space-y-1.5 border-b px-4 py-3 text-xs" {...rest}>
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------
// New ticket (phone, email, walk-in)
// ---------------------------------------------------------------------------

export function NewTicket({ queues, compact = false }: { queues: { id: string; name: string }[]; compact?: boolean }) {
  const router = useRouter();
  const { act, busy } = useAct();
  const [open, setOpen] = React.useState(false);
  const [f, setF] = React.useState({ customerName: "", email: "", phone: "", subject: "", body: "", channel: "phone", priority: "normal" as Priority, queueId: "" });
  // A dialog, so it opens the same from the desk's narrow list header and from the support home.
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" title="New ticket for a phone call, email or visit">
          <PlusIcon /> <span className={compact ? "sr-only" : undefined}>New ticket</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>For a customer who called, wrote an email or came in.</DialogDescription>
        </DialogHeader>
      <div className="grid gap-2 sm:grid-cols-3" data-new-ticket>
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
      </div>
      </DialogContent>
    </Dialog>
  );
}

// The desk around the inbox and the open ticket, holding the call in progress.
// With bar={false} the page places <AgentBar compact /> itself (the full-height desk puts it in its header).
export function Desk({ status, record, children, bar = true }: { status: string; record: boolean; children: React.ReactNode; bar?: boolean }) {
  return (
    <DeskLive>
      <CallProvider record={record}>
        {bar ? (
          <div className="space-y-3">
            <AgentBar status={status} />
            {children}
          </div>
        ) : (
          children
        )}
      </CallProvider>
    </DeskLive>
  );
}

// Forwarding a customer message to a target Admin set up (Support, Queues and replies).
function ForwardSheet({ messageId, onClose }: { messageId: string | null; onClose: () => void }) {
  const [targets, setTargets] = React.useState<{ id: string; label: string; needsApproval: boolean; includeCustomer: boolean }[] | null>(null);
  const [target, setTarget] = React.useState("");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (!messageId) return;
    setNote("");
    void SC.forwardTargetsForAction().then((r) => {
      if (!r.ok) return void toast.error(r.error);
      setTargets(r.data ?? []);
      setTarget(r.data?.[0]?.id ?? "");
    });
  }, [messageId]);
  const chosen = targets?.find((x) => x.id === target);
  return (
    <Sheet open={!!messageId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Forward the message</SheetTitle>
          <SheetDescription>It arrives as a card in the person's team chat and is kept on this conversation's log.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6 text-sm" data-forward>
          {targets === null ? <Loader2Icon className="size-4 animate-spin" /> : !targets.length ? (
            <p className="text-muted-foreground">No forwarding target is open to you. Admin or a support lead sets them in Support, Queues and replies.</p>
          ) : (
            <>
              <select aria-label="Forward to" className={cn(select, "w-full")} value={target} onChange={(e) => setTarget(e.target.value)}>
                {targets.map((x) => <option key={x.id} value={x.id}>{x.label}{x.needsApproval ? " (a lead approves first)" : ""}</option>)}
              </select>
              {chosen && <p className="text-xs text-muted-foreground">{chosen.includeCustomer ? "The customer's name and contacts go with it." : "The customer's details stay here; numbers and emails in the text are hidden."}</p>}
              <Textarea aria-label="Note" placeholder="Note for them (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
              <Button
                disabled={busy || !target}
                onClick={async () => {
                  setBusy(true);
                  const r = await SC.forwardMessageAction({ messageId: messageId!, targetId: target, note });
                  setBusy(false);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(r.data?.status === "pending" ? "Sent to a support lead to approve" : `Forwarded to ${r.data?.recipients ?? 0} person(s)`);
                  onClose();
                }}
              >
                <ForwardIcon /> Forward
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DetailsSheet({ messageId, onClose }: { messageId: string | null; onClose: () => void }) {
  const [d, setD] = React.useState<Awaited<ReturnType<typeof import("@/server/support-chat").messageDetails>> | null>(null);
  React.useEffect(() => {
    setD(null);
    if (messageId) void SC.supportMessageDetailsAction(messageId).then((r) => (r.ok ? setD(r.data!) : toast.error(r.error)));
  }, [messageId]);
  const row = (k: string, v: string | null | undefined) => (v ? <p><span className="text-muted-foreground">{k}:</span> {v}</p> : null);
  return (
    <Sheet open={!!messageId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Message details</SheetTitle>
          <SheetDescription>{d ? `${d.author ?? "Unknown"}${d.internal ? ", internal note" : ""}` : "Loading..."}</SheetDescription>
        </SheetHeader>
        {d && (
          <div className="space-y-2 px-4 pb-6 text-sm" data-message-details>
            {row("Sent", when(d.sentAt))}
            {row("Delivered", d.deliveredAt ? when(d.deliveredAt) : null)}
            {row("Read by the customer", d.readByCustomer ? when(d.readByCustomer) : null)}
            {row("Edited", d.editedAt ? when(d.editedAt) : null)}
            {row("Deleted", d.deletedAt ? when(d.deletedAt) : null)}
            {d.body !== null && <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-2">{d.body}</p>}
            {d.forwards.length > 0 && <p className="pt-2 font-medium">Forwarded</p>}
            {d.forwards.map((f, i) => <p key={i} className="text-xs">{when(f.created_at)}: {f.by} to {f.label} ({f.status})</p>)}
            {d.reports.length > 0 && <p className="pt-2 font-medium">Reports</p>}
            {d.reports.map((r, i) => <p key={i} className="text-xs">{when(r.created_at)}: {r.by}, {r.reason}</p>)}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
