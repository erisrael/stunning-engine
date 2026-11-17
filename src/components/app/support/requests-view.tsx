"use client";
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, FileIcon, Loader2Icon, PaperclipIcon, PlusIcon, SendIcon, SettingsIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import { ACTION_NEEDS_TEXT, APPROVER_KINDS, DESTINATION_KINDS, REQUEST_ACTIONS, REQUEST_STATUSES, REQUEST_TYPES, requestStatusLabel, requestTypeLabel, type ApprovalStep, type RequestAction } from "@/lib/support-requests";
import type { Chain, Destination } from "@/server/support-requests";
import * as A from "@/app/actions/support-requests";

// Customer Support Requests (Update 1.2, Phase 7): lists (mine, received, waiting for my approval, all), a request
// with its actions, discussion, files and history, a new request (from a conversation when opened from one), and the
// destinations and approval chains Admin sets.

type Row = Awaited<ReturnType<typeof import("@/server/support-requests").listSupportRequests>>[number];
type Detail = Awaited<ReturnType<typeof import("@/server/support-requests").detail>>;
type Scope = "mine" | "inbox" | "approvals" | "all" | "setup";
const select = "h-9 w-full rounded-md border bg-background px-2 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" });
const TONE: Record<string, string> = {
  draft: "text-muted-foreground",
  submitted: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  received: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  acknowledged: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  in_progress: "border-indigo-500/40 text-indigo-700 dark:text-indigo-300",
  waiting_info: "border-amber-500/40 text-amber-800 dark:text-amber-200",
  pending_approval: "border-amber-500/40 text-amber-800 dark:text-amber-200",
  approved: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  rejected: "border-rose-500/40 text-rose-700 dark:text-rose-300",
  resolved: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  closed: "text-muted-foreground",
};
const Status = ({ s }: { s: string }) => <Badge variant="outline" className={cn("text-[10px]", TONE[s])} data-request-status={s}>{requestStatusLabel(s)}</Badge>;

export function SupportRequestsView(p: {
  canCreate: boolean; lead: boolean; admin: boolean; destinations: { id: string; label: string; types: string[] }[]; counts: { mine: number; inbox: number; approvals: number };
  ticket: { id: string; number: number; subject: string } | null; startNew: boolean; openId: string | null; setup: { destinations: Destination[]; chains: Chain[] } | null;
  people: { id: string; name: string }[]; departments: { key: string; label: string }[];
}) {
  const first: Scope = p.counts.approvals ? "approvals" : p.counts.inbox && !p.canCreate ? "inbox" : "mine";
  const [scope, setScope] = React.useState<Scope>(first);
  const [status, setStatus] = React.useState("");
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [open, setOpen] = React.useState<string | null>(p.openId);
  const [creating, setCreating] = React.useState(p.startNew && p.canCreate);
  const load = React.useCallback(async () => {
    if (scope === "setup") return;
    const r = await A.supportRequestsAction(scope, status || null);
    if (r.ok) setRows(r.data ?? []);
    else toast.error(r.error);
  }, [scope, status]);
  React.useEffect(() => void load(), [load]);
  const tabs: [Scope, string, number | null][] = [
    ["mine", "My requests", p.counts.mine],
    ["inbox", "Received", p.counts.inbox],
    ["approvals", "Waiting for my approval", p.counts.approvals],
    ...(p.lead ? [["all", "All", null] as [Scope, string, null]] : []),
    ...(p.admin ? [["setup", "Destinations and approvals", null] as [Scope, string, null]] : []),
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Request lists">
          {tabs.map(([k, l, n]) => (
            <button key={k} type="button" onClick={() => (setScope(k), setOpen(null))} className={cn("rounded-full border px-3 py-1 text-xs", scope === k ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")} data-request-scope={k}>
              {k === "setup" && <SettingsIcon className="mr-1 inline size-3" />}
              {l}{n ? ` ${n}` : ""}
            </button>
          ))}
        </nav>
        {scope !== "setup" && (
          <select aria-label="Status" className="h-8 rounded-md border bg-background px-2 text-xs" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Any status</option>
            {REQUEST_STATUSES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
        {p.canCreate && <Button size="sm" className="ml-auto" onClick={() => setCreating(true)} data-new-request><PlusIcon /> New request</Button>}
      </div>
      {scope === "setup" && p.setup ? (
        <Setup initial={p.setup} people={p.people} departments={p.departments} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[24rem_1fr]">
          <div className={cn(open && "hidden lg:block")}>
            {!rows ? <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading…</StatusStrip> : !rows.length ? (
              <EmptyState title="No requests here" description={scope === "mine" ? "Write one with New request, or from a conversation on the desk." : "Requests sent to you appear here."} />
            ) : (
              <ul className="divide-y rounded-lg border bg-card">
                {rows.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setOpen(r.id)} className={cn("block w-full space-y-0.5 px-3 py-2 text-left hover:bg-muted/50", open === r.id && "bg-primary/5")} data-request-row={r.reference}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{r.reference}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.title}</span>
                        <Status s={r.status} />
                      </div>
                      <p className="text-xs text-muted-foreground">{requestTypeLabel(r.type)} · to {r.destination ?? "?"}{r.assignee ? ` · ${r.assignee}` : ""} · {when(r.updatedAt)}</p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className={cn("min-w-0", !open && "hidden lg:block")}>
            {open ? <RequestDetail id={open} onBack={() => setOpen(null)} onChanged={load} /> : <EmptyState title="Choose a request" description="Its status, discussion, files and history open here." />}
          </div>
        </div>
      )}
      {creating && <NewRequest destinations={p.destinations} ticket={p.ticket} onClose={() => setCreating(false)} onMade={(id) => (setCreating(false), setScope("mine"), setOpen(id), void load())} />}
    </div>
  );
}

function NewRequest({ destinations, ticket, onClose, onMade }: { destinations: { id: string; label: string; types: string[] }[]; ticket: { id: string; number: number; subject: string } | null; onClose: () => void; onMade: (id: string) => void }) {
  const [f, setF] = React.useState({ type: "technical", title: ticket ? ticket.subject : "", description: "", destinationId: destinations[0]?.id ?? "", priority: "normal", chapaRef: "", requestedAction: "", errorDetails: "", dueDate: "" });
  const [busy, setBusy] = React.useState(false);
  const dest = destinations.find((d) => d.id === f.destinationId);
  const types = REQUEST_TYPES.filter(([k]) => !dest?.types.length || dest.types.includes(k));
  const save = async (submit: boolean) => {
    setBusy(true);
    const r = await A.createSupportRequestAction({ ...f, ticketId: ticket?.id ?? null, submit });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(submit ? `Request ${r.data!.reference} sent` : `Draft ${r.data!.reference} saved`);
    onMade(r.data!.id);
  };
  const field = (k: keyof typeof f, label: string, el: React.ReactNode) => <label className="block space-y-1 text-xs">{label}{el}</label>;
  return (
    <Sheet open onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>New support request</SheetTitle>
          <SheetDescription>{ticket ? `About conversation #${ticket.number}. The customer is linked.` : "Ask an internal team for help."}</SheetDescription>
        </SheetHeader>
        {!destinations.length ? (
          <div className="px-4"><EmptyState title="No destination is switched on" description="Admin switches them on under Destinations and approvals." /></div>
        ) : (
          <div className="space-y-3 px-4 pb-6" data-request-form>
            {field("destinationId", "Send to", <select aria-label="Send to" className={select} value={f.destinationId} onChange={(e) => setF({ ...f, destinationId: e.target.value })}>{destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>)}
            <div className="grid grid-cols-2 gap-2">
              {field("type", "Type", <select aria-label="Type" className={select} value={types.some(([k]) => k === f.type) ? f.type : types[0]?.[0]} onChange={(e) => setF({ ...f, type: e.target.value })}>{types.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>)}
              {field("priority", "Priority", <select aria-label="Priority" className={select} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{["low", "normal", "high", "urgent"].map((x) => <option key={x} value={x}>{x[0].toUpperCase() + x.slice(1)}</option>)}</select>)}
            </div>
            {field("title", "Title", <Input aria-label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />)}
            {field("description", "Description", <Textarea aria-label="Description" rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />)}
            {field("requestedAction", "Requested action", <Input aria-label="Requested action" value={f.requestedAction} onChange={(e) => setF({ ...f, requestedAction: e.target.value })} placeholder="What should they do?" />)}
            {field("errorDetails", "Error details", <Textarea aria-label="Error details" rows={2} value={f.errorDetails} onChange={(e) => setF({ ...f, errorDetails: e.target.value })} placeholder="Messages, codes, steps" />)}
            <div className="grid grid-cols-2 gap-2">
              {field("chapaRef", "Related transaction", <Input aria-label="Related transaction" value={f.chapaRef} onChange={(e) => setF({ ...f, chapaRef: e.target.value })} placeholder="Chapa reference" />)}
              {field("dueDate", "Due date", <Input aria-label="Due date" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />)}
            </div>
            <p className="text-[11px] text-muted-foreground">Screenshots and files are added once the request is saved.</p>
            <div className="flex gap-2">
              <Button disabled={busy || !f.title.trim()} onClick={() => save(true)}><SendIcon /> Send</Button>
              <Button variant="outline" disabled={busy || !f.title.trim()} onClick={() => save(false)}>Save draft</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function RequestDetail({ id, onBack, onChanged }: { id: string; onBack: () => void; onChanged: () => void }) {
  const [d, setD] = React.useState<Detail | null>(null);
  const [text, setText] = React.useState<{ action: RequestAction; value: string } | null>(null);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    setD(null);
    void A.supportRequestAction(id).then((r) => (r.ok ? setD(r.data!) : toast.error(r.error)));
  }, [id]);
  const run = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Not done.");
    if (r.data && typeof r.data === "object" && "reference" in (r.data as object)) setD(r.data as Detail);
    if (done) toast.success(done);
    onChanged();
  };
  if (!d) return <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading…</StatusStrip>;
  const act = (a: RequestAction) => (ACTION_NEEDS_TEXT[a] ? setText({ action: a, value: "" }) : void run(() => A.supportRequestActAction(d.id, a), REQUEST_ACTIONS.find(([k]) => k === a)?.[1]));
  const info = (k: string, v: React.ReactNode) => (v ? <div><dt className="text-muted-foreground">{k}</dt><dd className="break-words font-medium">{v}</dd></div> : null);
  return (
    <article className="space-y-4 rounded-xl border bg-card p-4" data-request-detail={d.reference}>
      <header className="space-y-1">
        <button type="button" className="flex items-center gap-1 text-xs text-primary lg:hidden" onClick={onBack}><ArrowLeftIcon className="size-3" /> Requests</button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{d.reference}</span>
          <Status s={d.status} />
          <Badge variant="outline" className="text-[10px]">{requestTypeLabel(d.type)}</Badge>
          {d.priority !== "normal" && <Badge variant="outline" className="text-[10px]">{d.priority}</Badge>}
        </div>
        <h2 className="text-lg font-semibold">{d.title}</h2>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
        {info("To", d.destination?.label)}
        {info("From", d.creator.name)}
        {info("Assigned", d.canAssign ? (
          <select aria-label="Assign" className="h-7 w-full rounded border bg-background px-1 text-xs" value={d.assignee.id ?? ""} onChange={(e) => void run(() => A.assignSupportRequestAction(d.id, e.target.value || null), "Assigned")}>
            <option value="">Nobody</option>
            {d.assignable.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        ) : (d.assignee.name ?? "Nobody yet"))}
        {info("Conversation", d.ticket && <span className="flex flex-wrap items-center gap-2"><Link className="text-primary hover:underline" href={`/support?ticket=${d.ticket.id}`}>#{d.ticket.number} {d.ticket.subject}</Link><Link className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted" href={`/support?ticket=${d.ticket.id}`} data-call-from-request>Call the customer</Link></span>)}
        {info("Customer", d.customer && `${d.customer.name}${d.customer.phone ? `, ${d.customer.phone}` : ""}`)}
        {info("Transaction", d.chapaRef)}
        {info("Due", d.dueDate)}
        {info("Workspace task", d.task && `${d.task.code} (${d.task.status})`)}
        {info("Approval", d.approval && `step ${Math.min(d.approval.step + 1, d.approval.steps)} of ${d.approval.steps}`)}
        {info("Created", when(d.createdAt))}
        {info("Updated", when(d.updatedAt))}
      </dl>
      {[["Description", d.description], ["Requested action", d.requestedAction], ["Error details", d.errorDetails], ["Resolution", d.resolution]].filter(([, v]) => v).map(([k, v]) => (
        <section key={k} className="space-y-1 text-sm"><p className="text-xs font-medium text-muted-foreground">{k}</p><p className="whitespace-pre-wrap">{v}</p></section>
      ))}
      {(d.actions.length > 0 || d.canDelete) && (
        <div className="flex flex-wrap gap-2" data-request-actions>
          {d.actions.map((a) => (
            <Button key={a} size="sm" variant={["reject"].includes(a) ? "outline" : a === "approve" || a === "resolve" || a === "submit" ? "default" : "secondary"} disabled={busy} onClick={() => act(a)} data-action={a}>
              {a === "approve" && <CheckIcon />}{REQUEST_ACTIONS.find(([k]) => k === a)?.[1]}
            </Button>
          ))}
          {d.canDelete && <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => void run(() => A.deleteSupportRequestDraftAction(d.id), "Draft deleted").then(onBack)}><Trash2Icon /> Delete draft</Button>}
        </div>
      )}
      {text && (
        <div className="space-y-2 rounded-lg border p-3" data-action-text>
          <Textarea aria-label={ACTION_NEEDS_TEXT[text.action]} placeholder={ACTION_NEEDS_TEXT[text.action]} value={text.value} onChange={(e) => setText({ ...text, value: e.target.value })} />
          <div className="flex gap-2">
            <Button size="sm" disabled={busy || !text.value.trim()} onClick={async () => { await run(() => A.supportRequestActAction(d.id, text.action, { text: text.value }), REQUEST_ACTIONS.find(([k]) => k === text.action)?.[1]); setText(null); }}>{REQUEST_ACTIONS.find(([k]) => k === text.action)?.[1]}</Button>
            <Button size="sm" variant="ghost" onClick={() => setText(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <section className="space-y-2" aria-label="Files">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium text-muted-foreground">Files and screenshots</p>
          <Button size="xs" variant="ghost" onClick={() => fileRef.current?.click()}><PaperclipIcon /> Add</Button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            aria-label="Add a file"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              const base64 = await new Promise<string>((res) => {
                const r = new FileReader();
                r.onload = () => res(String(r.result).split(",")[1] ?? "");
                r.readAsDataURL(file);
              });
              await run(() => A.addSupportRequestFileAction(d.id, { name: file.name, mime: file.type || "application/octet-stream", base64 }), "File added");
            }}
          />
        </div>
        {d.files.map((f) => <a key={f.id} href={`/api/support/request-files/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline"><FileIcon className="size-3.5" />{f.name} <span className="text-xs text-muted-foreground">{Math.ceil(f.size / 1024)} KB</span></a>)}
      </section>
      {d.approvals.length > 0 && (
        <section className="space-y-1 text-xs" aria-label="Approvals">
          <p className="font-medium text-muted-foreground">Approvals</p>
          {d.approvals.map((a, i) => <p key={i}>{when(a.created_at)}: step {a.step + 1}, {a.by} {a.decision}{a.reason ? `, ${a.reason}` : ""}{a.selfException ? " (own request, allowed exception)" : ""}</p>)}
        </section>
      )}
      <section className="space-y-2" aria-label="History and discussion">
        <p className="text-xs font-medium text-muted-foreground">History and discussion</p>
        <ol className="space-y-1.5 border-l pl-3 text-xs">
          {d.events.map((e) => (
            <li key={e.id} data-event={e.kind}>
              <span className="text-muted-foreground">{when(e.created_at)}</span> {e.by ?? "System"}
              {e.from_status !== e.to_status && e.to_status ? `: ${requestStatusLabel(e.to_status)}` : e.kind === "comment" ? ":" : `: ${e.kind.replace(/_/g, " ")}`}
              {e.body && <span className="block whitespace-pre-wrap text-sm">{e.body}</span>}
            </li>
          ))}
        </ol>
        {d.status !== "closed" && (
          <div className="flex gap-2">
            <Input aria-label="Comment" placeholder="Write to everyone on this request" value={comment} onChange={(e) => setComment(e.target.value)} />
            <Button size="sm" disabled={busy || !comment.trim()} onClick={async () => { await run(() => A.commentSupportRequestAction(d.id, comment)); setComment(""); }}>Send</Button>
          </div>
        )}
      </section>
    </article>
  );
}

function Setup({ initial, people, departments }: { initial: { destinations: Destination[]; chains: Chain[] }; people: { id: string; name: string }[]; departments: { key: string; label: string }[] }) {
  const [data, setData] = React.useState(initial);
  const blank = { label: "", kind: "dept", dept: "dev", memberId: "", types: [] as string[], active: true };
  const [f, setF] = React.useState<typeof blank & { id?: string }>(blank);
  const [chain, setChain] = React.useState<{ id?: string; destinationId: string; type: string; steps: ApprovalStep[]; allowSelf: boolean }>({ destinationId: "", type: "", steps: [{ kind: "admin" }], allowSelf: false });
  const res = async (r: { ok: boolean; error?: string; data?: { destinations: Destination[]; chains: Chain[] } }, done: string) => (r.ok ? (setData(r.data!), toast.success(done)) : toast.error(r.error));
  const destName = (id: string | null) => (id ? (data.destinations.find((d) => d.id === id)?.label ?? "?") : "Any destination");
  const stepName = (s: ApprovalStep) => (s.kind === "user" ? (people.find((x) => x.id === s.target)?.name ?? "?") : s.kind === "dept_head" ? `${departments.find((x) => x.key === s.target)?.label ?? s.target} head` : APPROVER_KINDS.find(([k]) => k === s.kind)?.[1]);
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Destinations" data-destinations>
        <h2 className="text-sm font-semibold">Destinations</h2>
        <ul className="divide-y rounded-lg border text-sm">
          {data.destinations.map((d) => (
            <li key={d.id} className="flex items-center gap-2 px-3 py-2" data-destination={d.label}>
              <div className="min-w-0 flex-1"><p className="font-medium">{d.label}{!d.active && " (off)"}</p><p className="text-xs text-muted-foreground">{DESTINATION_KINDS.find(([k]) => k === d.kind)?.[1]}{d.types.length ? ` · ${d.types.map(requestTypeLabel).join(", ")}` : " · any type"}</p></div>
              <Button size="sm" variant="ghost" onClick={() => setF({ ...d, dept: d.dept ?? "", memberId: d.memberId ?? "" })}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label={`Remove ${d.label}`} onClick={async () => res(await A.deleteRequestDestinationAction(d.id), "Removed")}><Trash2Icon /></Button>
            </li>
          ))}
          {!data.destinations.length && <li className="px-3 py-4 text-center text-muted-foreground">None yet: support cannot send requests.</li>}
        </ul>
        <div className="grid gap-2 sm:grid-cols-2" data-destination-form>
          <label className="space-y-1 text-xs sm:col-span-2">Name<Input aria-label="Destination name" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="Developer Team Head" /></label>
          <label className="space-y-1 text-xs">Who receives<select aria-label="Who receives" className={select} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{DESTINATION_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          {(f.kind === "dept" || f.kind === "dept_head") && <label className="space-y-1 text-xs">Department<select aria-label="Department" className={select} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>{departments.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</select></label>}
          {f.kind === "member" && <label className="space-y-1 text-xs">Member<select aria-label="Member" className={select} value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })}><option value="">Choose…</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
          <label className="space-y-1 text-xs sm:col-span-2">Types it takes (none chosen: all)
            <select aria-label="Types it takes" multiple className="h-28 w-full rounded-md border bg-background px-2 text-sm" value={f.types} onChange={(e) => setF({ ...f, types: [...e.target.selectedOptions].map((o) => o.value) })}>{REQUEST_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="flex items-center gap-2 text-xs"><Switch checked={f.active} onCheckedChange={(v) => setF({ ...f, active: v })} aria-label="On" /> On</label>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={!f.label.trim()} onClick={async () => { await res(await A.saveRequestDestinationAction({ ...f, memberId: f.memberId || null, dept: f.dept || null }), "Destination saved"); setF(blank); }}><PlusIcon /> {f.id ? "Save" : "Add destination"}</Button>
            {f.id && <Button size="sm" variant="ghost" onClick={() => setF(blank)}>Cancel</Button>}
          </div>
        </div>
      </section>
      <section className="space-y-3 rounded-xl border bg-card p-4" aria-label="Approval chains" data-chains>
        <h2 className="text-sm font-semibold">Approval chains</h2>
        <p className="text-xs text-muted-foreground">Used when a team submits a request for approval. The most specific chain applies. Nobody approves their own request unless the chain allows it; each such approval is recorded.</p>
        <ul className="divide-y rounded-lg border text-sm">
          {data.chains.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1"><p className="font-medium">{destName(c.destinationId)} · {c.type ? requestTypeLabel(c.type) : "any type"}</p><p className="text-xs text-muted-foreground">{c.steps.map(stepName).join(", then ")}{c.allowSelf ? " · self-approval allowed" : ""}</p></div>
              <Button size="sm" variant="ghost" onClick={() => setChain({ id: c.id, destinationId: c.destinationId ?? "", type: c.type ?? "", steps: c.steps, allowSelf: c.allowSelf })}>Edit</Button>
              <Button size="sm" variant="ghost" aria-label="Remove chain" onClick={async () => res(await A.deleteRequestChainAction(c.id), "Removed")}><Trash2Icon /></Button>
            </li>
          ))}
          {!data.chains.length && <li className="px-3 py-4 text-center text-muted-foreground">None yet: requests cannot be submitted for approval.</li>}
        </ul>
        <div className="space-y-2" data-chain-form>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs">Destination<select aria-label="Chain destination" className={select} value={chain.destinationId} onChange={(e) => setChain({ ...chain, destinationId: e.target.value })}><option value="">Any destination</option>{data.destinations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
            <label className="space-y-1 text-xs">Type<select aria-label="Chain type" className={select} value={chain.type} onChange={(e) => setChain({ ...chain, type: e.target.value })}><option value="">Any type</option>{REQUEST_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          </div>
          {chain.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-12 text-xs text-muted-foreground">Step {i + 1}</span>
              <select aria-label={`Step ${i + 1} approver`} className={select} value={s.kind} onChange={(e) => setChain({ ...chain, steps: chain.steps.map((x, j) => (j === i ? { kind: e.target.value as ApprovalStep["kind"], target: null } : x)) })}>{APPROVER_KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {s.kind === "user" && <select aria-label={`Step ${i + 1} person`} className={select} value={s.target ?? ""} onChange={(e) => setChain({ ...chain, steps: chain.steps.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}><option value="">Choose…</option>{people.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}
              {s.kind === "dept_head" && <select aria-label={`Step ${i + 1} department`} className={select} value={s.target ?? ""} onChange={(e) => setChain({ ...chain, steps: chain.steps.map((x, j) => (j === i ? { ...x, target: e.target.value } : x)) })}><option value="">Choose…</option>{departments.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>}
              <Button size="sm" variant="ghost" aria-label={`Remove step ${i + 1}`} disabled={chain.steps.length === 1} onClick={() => setChain({ ...chain, steps: chain.steps.filter((_, j) => j !== i) })}><Trash2Icon /></Button>
            </div>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setChain({ ...chain, steps: [...chain.steps, { kind: "admin" }] })}><PlusIcon /> Add a step</Button>
          <label className="flex items-center gap-2 text-xs"><Switch checked={chain.allowSelf} onCheckedChange={(v) => setChain({ ...chain, allowSelf: v })} aria-label="Allow self-approval" /> Allow approving one's own request (recorded and audited)</label>
          <Button size="sm" onClick={async () => { await res(await A.saveRequestChainAction({ ...chain, destinationId: chain.destinationId || null, type: chain.type || null }), "Chain saved"); setChain({ destinationId: "", type: "", steps: [{ kind: "admin" }], allowSelf: false }); }}><PlusIcon /> {chain.id ? "Save chain" : "Add chain"}</Button>
        </div>
      </section>
    </div>
  );
}
