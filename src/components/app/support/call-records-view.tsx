"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DownloadIcon, LockIcon, PhoneIncomingIcon, PhoneOutgoingIcon, UnlockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import * as A from "@/app/actions/support-ivr";
import { deleteRecordingAction } from "@/app/actions/support-chat";
import type { CallRecord } from "@/server/call-records";

// Call Records (Update 1.2, Phase 9): every customer call, filterable, with a record per call.

type Detail = Awaited<ReturnType<typeof import("@/server/call-records").callRecordDetail>>;
type Filters = Record<"q" | "customer" | "minDur" | "maxDur" | "agent" | "queue" | "department" | "direction" | "status" | "outcome" | "recorded" | "from" | "to", string>;
const select = "h-8 rounded-md border bg-background px-2 text-sm";
const secs = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—");
const PHASE: Record<string, string> = { completed: "Completed", missed: "Missed", declined: "Declined", cancelled: "Cancelled", failed: "Failed", ringing: "Ringing", accepted: "Accepted", connecting: "Connecting", connected: "Connected", on_hold: "On hold", transferring: "Transferred", ended: "Ended", answered: "Answered" };

export function CallRecordsView({ rows, stats, filters, all, people, queues, departments, outcomes }: { rows: CallRecord[]; stats: { calls: number; answered: number; missed: number; avgTalkS: number | null; avgWaitS: number | null; recorded: number }; filters: Filters; all: boolean; people: { id: string; name: string }[]; queues: { id: string; name: string }[]; departments: { key: string; label: string }[]; outcomes: Record<string, string> }) {
  const router = useRouter();
  const [f, setF] = React.useState(filters);
  const [open, setOpen] = React.useState<string | null>(null);
  const apply = (next: Filters) => {
    const p = new URLSearchParams(Object.entries(next).filter(([, v]) => v));
    router.push(`/call-records${p.size ? `?${p}` : ""}`);
  };
  const tile = (label: string, value: React.ReactNode) => (
    <div className="rounded-md border p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
  return (
    <div className="space-y-4" data-call-records>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tile("Calls", <span data-records-count>{stats.calls}</span>)}
        {tile("Answered", stats.answered)}
        {tile("Missed", stats.missed)}
        {tile("Average talk", secs(stats.avgTalkS))}
        {tile("Average wait", secs(stats.avgWaitS))}
        {tile("Recorded", stats.recorded)}
      </div>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply(f);
        }}
      >
        <Input aria-label="Search" className="h-8 w-56" placeholder="Name, phone, #ticket, note, tag" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <Input aria-label="Customer" className="h-8 w-40" placeholder="Customer" value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })} />
        <Input aria-label="Shortest call (minutes)" type="number" min={0} className="h-8 w-24" placeholder="Min min" value={f.minDur} onChange={(e) => setF({ ...f, minDur: e.target.value })} />
        <Input aria-label="Longest call (minutes)" type="number" min={0} className="h-8 w-24" placeholder="Max min" value={f.maxDur} onChange={(e) => setF({ ...f, maxDur: e.target.value })} />
        {all && (
          <select aria-label="Agent" className={select} value={f.agent} onChange={(e) => setF({ ...f, agent: e.target.value })}>
            <option value="">Every agent</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <select aria-label="Queue" className={select} value={f.queue} onChange={(e) => setF({ ...f, queue: e.target.value })}>
          <option value="">Every queue</option>
          {queues.map((q) => (
            <option key={q.id} value={q.id}>{q.name}</option>
          ))}
        </select>
        <select aria-label="Department" className={select} value={f.department} onChange={(e) => setF({ ...f, department: e.target.value })}>
          <option value="">Every department</option>
          {departments.map((d) => (
            <option key={d.key} value={d.key}>{d.label}</option>
          ))}
        </select>
        <select aria-label="Direction" className={select} value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
          <option value="">In and out</option>
          <option value="inbound">Incoming</option>
          <option value="outbound">Outgoing</option>
        </select>
        <select aria-label="Status" className={select} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
          <option value="">Any status</option>
          {["completed", "missed", "declined", "cancelled", "failed", "transferring"].map((s) => (
            <option key={s} value={s}>{PHASE[s]}</option>
          ))}
        </select>
        <select aria-label="Outcome" className={select} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
          <option value="">Any outcome</option>
          {Object.entries(outcomes).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <select aria-label="Recording" className={select} value={f.recorded} onChange={(e) => setF({ ...f, recorded: e.target.value })}>
          <option value="">Recorded or not</option>
          <option value="yes">Recorded</option>
          <option value="no">Not recorded</option>
          <option value="hold">Under legal hold</option>
          <option value="deleted">Recording deleted or expired</option>
        </select>
        <Input aria-label="From" type="date" className="h-8 w-36" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
        <Input aria-label="To" type="date" className="h-8 w-36" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
        <Button size="sm" type="submit">Filter</Button>
        {Object.values(filters).some(Boolean) && (
          <Button size="sm" type="button" variant="ghost" onClick={() => apply(Object.fromEntries(Object.keys(f).map((k) => [k, ""])) as Filters)}>
            Clear
          </Button>
        )}
        {all && (
          <Button
            size="sm"
            type="button"
            variant="outline"
            className="ml-auto"
            onClick={async () => {
              const r = await A.exportCallRecordsAction({ q: filters.q, customer: filters.customer, minDur: filters.minDur, maxDur: filters.maxDur, agentId: filters.agent, queueId: filters.queue, department: filters.department, direction: filters.direction, status: filters.status, outcome: filters.outcome, recorded: filters.recorded, from: filters.from, to: filters.to });
              if (!r.ok) return void toast.error(r.error);
              const url = URL.createObjectURL(new Blob([r.data!], { type: "text/csv" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = `call-records-${new Date().toISOString().slice(0, 10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <DownloadIcon /> Export
          </Button>
        )}
      </form>
      {!all && <p className="text-xs text-muted-foreground">You see the calls you took or made.</p>}
      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No calls match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2">When</th>
                    <th className="p-2">Customer</th>
                    <th className="p-2">Agent</th>
                    <th className="p-2">Queue</th>
                    <th className="p-2">Status</th>
                    <th className="p-2 text-right">Wait</th>
                    <th className="p-2 text-right">Talk</th>
                    <th className="p-2">Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/50" onClick={() => setOpen(r.id)} data-call-record={r.id}>
                      <td className="p-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1" suppressHydrationWarning>
                          {r.direction === "inbound" ? <PhoneIncomingIcon className="size-3.5 text-muted-foreground" aria-label="Incoming" /> : <PhoneOutgoingIcon className="size-3.5 text-muted-foreground" aria-label="Outgoing" />}
                          {when(r.startedAt)}
                        </span>
                      </td>
                      <td className="p-2">{r.customer ?? r.phone ?? "—"}</td>
                      <td className="p-2">{r.agent ?? "—"}</td>
                      <td className="p-2">{r.queue ?? "—"}</td>
                      <td className="p-2">
                        <span className="inline-flex items-center gap-1">
                          {PHASE[r.phase ?? r.status] ?? r.phase ?? r.status}
                          {r.recording === "saved" && <Badge variant="outline">Rec</Badge>}
                          {r.legalHold && <LockIcon className="size-3.5" aria-label="Legal hold" />}
                        </span>
                      </td>
                      <td className="p-2 text-right tabular-nums">{secs(r.waitS)}</td>
                      <td className="p-2 text-right tabular-nums">{secs(r.durationS)}</td>
                      <td className="p-2">{r.outcome ? outcomes[r.outcome] : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <RecordSheet id={open} onClose={() => setOpen(null)} outcomes={outcomes} onSaved={() => router.refresh()} />
    </div>
  );
}

function RecordSheet({ id, onClose, outcomes, onSaved }: { id: string | null; onClose: () => void; outcomes: Record<string, string>; onSaved: () => void }) {
  const [d, setD] = React.useState<Detail | null>(null);
  const [edit, setEdit] = React.useState({ notes: "", tags: "", outcome: "", category: "" });
  const [rate, setRate] = React.useState(1);
  const audio = React.useRef<HTMLAudioElement>(null);
  const load = React.useCallback(async (callId: string) => {
    const r = await A.callRecordAction(callId);
    if (!r.ok) return void toast.error(r.error);
    setD(r.data!);
    setEdit({ notes: r.data!.record.notes ?? "", tags: r.data!.record.tags.join(", "), outcome: r.data!.record.outcome ?? "", category: r.data!.record.category ?? "" });
  }, []);
  React.useEffect(() => {
    setD(null);
    if (id) void load(id);
  }, [id, load]);
  React.useEffect(() => {
    if (audio.current) audio.current.playbackRate = rate;
  }, [rate, d]);
  const r = d?.record;
  const field = (label: string, value: React.ReactNode) => (
    <div className="flex gap-2 py-0.5">
      <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 break-words">{value ?? "—"}</dd>
    </div>
  );
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg" data-call-record-sheet>
        <SheetHeader>
          <SheetTitle>Call record</SheetTitle>
          <SheetDescription>{r ? `${r.customer ?? r.phone ?? "Customer"} · ${when(r.startedAt)}` : "Loading…"}</SheetDescription>
        </SheetHeader>
        {r && d && (
          <div className="space-y-4 px-4 pb-6 text-sm">
            {d.can.listen && (
              <div className="space-y-2 rounded-lg border p-2" data-record-player>
                <audio ref={audio} controls preload="none" className="w-full" src={`/api/support/recording/${r.id}`} />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Label htmlFor="rec-rate" className="text-xs">Speed</Label>
                  <select id="rec-rate" className={cn(select, "h-7")} value={rate} onChange={(e) => setRate(Number(e.target.value))}>
                    {[0.75, 1, 1.25, 1.5, 2].map((x) => (
                      <option key={x} value={x}>{x}×</option>
                    ))}
                  </select>
                  {d.can.download && (
                    <Button asChild size="xs" variant="outline" className="ml-auto">
                      <a href={`/api/support/recording/${r.id}?download=1`} data-record-download>
                        <DownloadIcon /> Download
                      </a>
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Each listen and download is logged.</p>
              </div>
            )}
            {!d.can.listen && r.recording !== "saved" && <p className="text-xs text-muted-foreground">Recording: {r.recording === "none" ? "not recorded" : r.recording === "purged" ? "removed after the keeping period" : r.recording}</p>}
            <dl className="text-sm">
              {field("Call ID", <span className="font-mono text-xs">{r.id}</span>)}
              {field("Customer", r.customerId ? <span>{r.customer} <span className="font-mono text-xs text-muted-foreground">{r.customerId}</span></span> : r.phone)}
              {field("Agent", r.agent)}
              {field("Department", r.department)}
              {field("Queue", r.queue)}
              {field("Direction", r.direction === "inbound" ? "Incoming" : "Outgoing")}
              {field("Started", when(r.startedAt))}
              {field("Ended", when(r.endedAt))}
              {field("Waited", secs(r.waitS))}
              {field("Talked", secs(r.durationS))}
              {field("Status", PHASE[r.phase ?? r.status] ?? r.status)}
              {field("Conversation", r.ticketId ? <Link className="underline" href={`/support?ticket=${r.ticketId}`}>#{r.ticketNumber}</Link> : null)}
              {field("Support request", r.requestId ? <Link className="underline" href={`/support-requests?r=${r.requestId}`}>{r.requestRef}</Link> : d.requests.length ? `${d.requests.length} on the conversation` : null)}
              {field("Recording", r.recording === "saved" ? `Saved${r.recordingSize ? `, ${Math.round(r.recordingSize / 1024)} KB` : ""}${r.legalHold ? ", under legal hold" : ""}` : r.recording)}
            </dl>
            {d.can.edit && (
              <div className="space-y-2 rounded-lg border p-2" data-record-edit>
                <div className="grid grid-cols-2 gap-2">
                  <select aria-label="Outcome" className={cn(select, "w-full")} value={edit.outcome} onChange={(e) => setEdit({ ...edit, outcome: e.target.value })}>
                    <option value="">No outcome yet</option>
                    {Object.entries(outcomes).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                  <Input aria-label="Category" placeholder="Category, e.g. payment" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} />
                </div>
                <Input aria-label="Tags" placeholder="Tags, comma separated" value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} />
                <Textarea aria-label="Notes" rows={3} placeholder="Notes" value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
                {d.requests.length > 0 && (
                  <select aria-label="Related support request" className={cn(select, "w-full")} defaultValue={r.requestId ?? ""} onChange={async (e) => {
                    const x = await A.updateCallRecordAction(r.id, { requestId: e.target.value || null });
                    if (!x.ok) return void toast.error(x.error);
                    await load(r.id);
                  }}>
                    <option value="">No related support request</option>
                    {d.requests.map((q) => (
                      <option key={q.id} value={q.id}>{q.reference} · {q.title}</option>
                    ))}
                  </select>
                )}
                <Button
                  size="sm"
                  onClick={async () => {
                    const x = await A.updateCallRecordAction(r.id, { notes: edit.notes, tags: edit.tags.split(",").map((t) => t.trim()), outcome: edit.outcome || null, category: edit.category || null });
                    if (!x.ok) return void toast.error(x.error);
                    toast.success("Call record saved");
                    await load(r.id);
                    onSaved();
                  }}
                  data-record-save
                >
                  Save
                </Button>
              </div>
            )}
            {d.can.remove && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={async () => {
                  const why = window.prompt("Delete this recording permanently? The call record stays. Write the reason to confirm.");
                  if (!why) return;
                  const x = await deleteRecordingAction(r.id, why);
                  if (!x.ok) return void toast.error(x.error);
                  toast.success("Recording deleted; the call record stays");
                  await load(r.id);
                  onSaved();
                }}
                data-record-delete
              >
                Delete recording
              </Button>
            )}
            {d.can.hold && r.recording === "saved" && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  const reason = r.legalHold ? null : window.prompt("Why must this recording be kept? (complaint, dispute, investigation)");
                  if (!r.legalHold && !reason) return;
                  const x = await A.setLegalHoldAction(r.id, !r.legalHold, reason);
                  if (!x.ok) return void toast.error(x.error);
                  toast.success(r.legalHold ? "Legal hold lifted" : "Kept under legal hold");
                  await load(r.id);
                }}
                data-record-hold
              >
                {r.legalHold ? <UnlockIcon /> : <LockIcon />} {r.legalHold ? "Lift legal hold" : "Legal hold"}
              </Button>
            )}
            <section>
              <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Lifecycle</h3>
              <ol className="space-y-0.5 text-xs" data-record-lifecycle>
                {[...d.queue.map((e) => ({ at: e.at, text: `Queue: ${e.kind}${e.agent ? ` (${e.agent})` : ""}${e.detail ? `, ${e.detail}` : ""}` })), ...d.lifecycle.map((e) => ({ at: e.at, text: PHASE[e.phase] ?? e.phase }))]
                  .sort((a, b) => a.at.localeCompare(b.at))
                  .map((e, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{new Date(e.at).toLocaleTimeString()}</span>
                      {e.text}
                    </li>
                  ))}
              </ol>
            </section>
            {d.access.length > 0 && (
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recording access</h3>
                <ul className="space-y-0.5 text-xs" data-record-access>
                  {d.access.map((a, i) => (
                    <li key={i}>{when(a.at)} · {a.who ?? "?"} {a.action === "download" ? "downloaded" : "listened"}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
