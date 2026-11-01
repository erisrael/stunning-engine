"use client";

// Home of a department that uses a flow (Configure, Flow).
// Members: their own work as a board (To do, In progress, Done not sent, With the lead): start, fill in the card,
// mark it done, send one or all; returned work comes back with the lead's note.
// Leads: triage the intake, approve or return what was sent, hand approved work over as a batch, accept what
// arrives, assign, release, and the flow at a glance. Checkers (a tech lead, testers) pass work on or return it.

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CheckCircle2Icon,
  CheckIcon,
  ExternalLinkIcon,
  GitPullRequestIcon,
  InboxIcon,
  Loader2Icon,
  PackageCheckIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SendIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/app/primitives";
import {
  draftReleaseNotesAction,
  flowAcceptAction,
  flowApproveAction,
  flowAssignAction,
  flowCheckReturnAction,
  flowDeclineAction,
  flowDoneAction,
  flowHandOverAction,
  flowPassAction,
  flowPauseAction,
  flowPlanAction,
  flowReleaseAction,
  flowReopenAction,
  flowReturnAction,
  flowSendAction,
  flowSendBackAction,
  flowStartAction,
} from "@/app/actions/departments";
import type { FlowCard, FlowHome, FlowStageInfo } from "@/server/dept-flow";
import { cn } from "@/lib/utils";

type R = { ok: boolean; error?: string; data?: unknown };
type Many = { id: string; code: string; ok: boolean; error?: string }[];
const today = () => new Date().toISOString().slice(0, 10);

function useRun() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (key: string, p: () => Promise<R>, done?: string | ((d: unknown) => string)) => {
    setBusy(key);
    const r = await p();
    setBusy(null);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong.", { duration: 8000 }), false;
    // Actions on several tasks report each one.
    if (Array.isArray(r.data) && r.data.length && typeof r.data[0] === "object" && r.data[0] && "ok" in (r.data[0] as object)) {
      const res = r.data as Many;
      const bad = res.filter((x) => !x.ok);
      const what = typeof done === "string" ? done : "Done";
      if (bad.length) toast.warning(`${res.length - bad.length} of ${res.length}: ${what.toLowerCase()}`, { description: bad.map((b) => `${b.code}: ${b.error}`).join("\n"), duration: 12000 });
      else toast.success(res.length === 1 ? `${res[0]!.code}: ${what.toLowerCase()}` : `${res.length}: ${what.toLowerCase()}`);
    } else if (done) toast.success(typeof done === "function" ? done(r.data) : done);
    router.refresh();
    return true;
  };
  return { run, busy };
}

function usePick(ids: string[]) {
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const key = ids.join();
  React.useEffect(() => setPicked((p) => new Set([...p].filter((x) => ids.includes(x)))), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (id: string) => setPicked((p) => (p.has(id) ? (p.delete(id), new Set(p)) : new Set(p.add(id))));
  return { picked, toggle, all: () => setPicked(picked.size === ids.length ? new Set() : new Set(ids)), chosen: picked.size ? [...picked] : ids };
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

function PrChip({ pr }: { pr: FlowCard["prs"][number] }) {
  const tone =
    pr.state === "merged"
      ? "bg-violet-500/15 text-violet-700 dark:text-violet-300"
      : pr.checks === "failure"
        ? "bg-red-500/15 text-red-700 dark:text-red-300"
        : pr.checks === "success"
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-muted text-muted-foreground";
  const word = pr.state === "merged" ? "merged" : pr.state === "draft" ? "draft" : pr.checks === "failure" ? "checks failing" : pr.checks === "success" ? "checks pass" : pr.checks === "pending" ? "checks running" : "open";
  return (
    <a href={pr.url} target="_blank" rel="noreferrer" title={`${pr.repo}: ${pr.title} (${pr.branch})`} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] hover:underline", tone)}>
      <GitPullRequestIcon className="size-3" />#{pr.number} {word}
    </a>
  );
}

function Card({
  c,
  data,
  select,
  children,
  showPerson,
  onOpen,
}: {
  c: FlowCard;
  data: FlowHome;
  select?: React.ReactNode;
  children?: React.ReactNode;
  showPerson?: boolean;
  onOpen: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const type = data.types.find((t) => t.key === c.type);
  const prio = data.priorities.find((p) => p.key === c.priority);
  const late = c.dueDate && c.dueDate < today();
  return (
    <div data-flow-card={c.id} className={cn("rounded-lg border bg-card p-2.5 shadow-xs", c.note && c.state === "todo" && "border-amber-500/60")}>
      <div className="flex items-start gap-2">
        {select}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className="font-mono">{c.code}</span>
            {type && (
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ background: type.color }} />
                {type.label}
              </span>
            )}
            {prio && prio.key !== "normal" && (
              <span className="rounded px-1" style={{ background: `${prio.color}22`, color: prio.color }}>
                {prio.label}
              </span>
            )}
            {c.running && <span className="rounded bg-emerald-500/15 px-1 text-emerald-700 dark:text-emerald-400">timer on</span>}
            {c.request && <span className="rounded bg-sky-500/15 px-1 text-sky-700 dark:text-sky-300">{c.request.pending ? "new request" : "request"}{c.request.by ? ` from ${c.request.by}` : ""}</span>}
          </span>
          <span className="mt-0.5 block font-medium">{c.title}</span>
          {(c.project || c.sprint || (showPerson && c.assigneeName)) && (
            <span className="block truncate text-xs text-muted-foreground">{[showPerson && c.assigneeName, c.project, c.sprint].filter(Boolean).join(" · ")}</span>
          )}
        </button>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {c.checklist.total > 0 && (
          <span className={cn("rounded px-1.5 py-0.5 text-[11px] tabular-nums", c.checklist.done === c.checklist.total ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : "bg-muted text-muted-foreground")}>
            {c.checklist.done}/{c.checklist.total} checklist
          </span>
        )}
        {c.prs.map((p) => (
          <PrChip key={`${p.repo}#${p.number}`} pr={p} />
        ))}
        <span className={cn("text-[11px]", c.late ? "font-medium text-destructive" : "text-muted-foreground")} title="Days in this stage">
          {c.daysIn === 0 ? "today" : `${c.daysIn} d here`}
        </span>
        {c.dueDate && <span className={cn("ml-auto text-[11px] whitespace-nowrap", late ? "font-medium text-destructive" : "text-muted-foreground")}>{late ? `Late: ${c.dueDate}` : `Due ${c.dueDate.slice(5)}`}</span>}
      </div>
      {c.note && <p className="mt-1.5 whitespace-pre-line rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-800 dark:text-amber-300">{c.note}</p>}
      {open && (
        <div className="mt-2 space-y-1.5 border-t pt-2 text-xs">
          {c.description && <p className="line-clamp-6 whitespace-pre-line text-muted-foreground">{c.description}</p>}
          {c.fields.map((f) => (
            <p key={f.label}>
              <span className="text-muted-foreground">{f.label}: </span>
              <span className="whitespace-pre-line">{f.value}</span>
            </p>
          ))}
          {(c.estimate != null || c.spent != null) && (
            <p className="text-muted-foreground">
              {c.estimate != null && `Estimate ${c.estimate} h`}
              {c.estimate != null && c.spent != null && " · "}
              {c.spent != null && `Spent ${c.spent} h`}
            </p>
          )}
          {c.missing.length > 0 && (
            <div>
              <p className="font-medium">Still needed</p>
              <ul className="list-disc pl-4 text-muted-foreground">
                {c.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => onOpen(c.id)}>
            <ExternalLinkIcon /> Open the {data.task.toLowerCase()} to fill it in
          </Button>
        </div>
      )}
      {children}
    </div>
  );
}

function NoteForm({ label, placeholder, rows = 2, onCancel, onSubmit, busy }: { label: string; placeholder: string; rows?: number; onCancel: () => void; onSubmit: (note: string) => void; busy: boolean }) {
  const [note, setNote] = React.useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea autoFocus rows={rows} value={note} onChange={(e) => setNote(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!note.trim() || busy} onClick={() => onSubmit(note)}>
          {busy && <Loader2Icon className="animate-spin" />} {label}
        </Button>
      </div>
    </div>
  );
}

function Guide({ s }: { s: FlowStageInfo }) {
  if (!s.steps.length) return null;
  return (
    <details className="rounded-lg border bg-muted/20 px-3 py-2 text-sm" data-flow-guide={s.status}>
      <summary className="cursor-pointer font-medium">How {s.label} works</summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-muted-foreground">
        {s.steps.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ol>
      {(s.days || s.wip) && (
        <p className="mt-1 text-xs text-muted-foreground">
          {s.days ? `Target: ${s.days} day${s.days === 1 ? "" : "s"} in ${s.label}. ` : ""}
          {s.wip ? `At most ${s.wip} in progress per person.` : ""}
        </p>
      )}
    </details>
  );
}

// ---------------------------------------------------------------------------
// The member's board
// ---------------------------------------------------------------------------

const COLUMNS = [
  { key: "todo", label: "To do", hint: "Assigned to you" },
  { key: "working", label: "In progress", hint: "Your timer runs while it is here" },
  { key: "done", label: "Done, not sent", hint: "Send it when you are ready" },
  { key: "sent", label: "With the lead", hint: "Waiting for approval" },
] as const;

function MemberBoard({ data, onOpen }: { data: FlowHome; onOpen: (id: string) => void }) {
  const { run, busy } = useRun();
  const done = data.mine.filter((c) => c.state === "done");
  const stageOf = (c: FlowCard) => data.stages.find((s) => s.status === c.stage);
  const multiStage = new Set(data.mine.map((c) => c.stage)).size > 1;
  return (
    <section className="space-y-3" aria-label="My work">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">My work</h2>
        <span className="text-sm text-muted-foreground">Tap a card to see what it still needs.</span>
        {done.length > 0 && (
          <Button className="ml-auto" disabled={busy === "send-all"} onClick={() => run("send-all", () => flowSendAction(data.dept, done.map((c) => c.id)), "Sent")}>
            {busy === "send-all" ? <Loader2Icon className="animate-spin" /> : <SendIcon />} Send {done.length} done
          </Button>
        )}
      </div>
      {!data.mine.length ? (
        <EmptyState icon={<InboxIcon className="size-5" />} title={`No ${data.tasks.toLowerCase()} assigned to you`} description="Your lead assigns work; it appears here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const list = data.mine.filter((c) => c.state === col.key);
            return (
              <div key={col.key} className="flex flex-col gap-2 rounded-xl bg-muted/40 p-2" data-flow-column={col.key}>
                <div className="px-1">
                  <p className="text-sm font-semibold">
                    {col.label} <span className="font-normal text-muted-foreground tabular-nums">{list.length}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{col.hint}</p>
                </div>
                {list.map((c) => {
                  const s = stageOf(c);
                  const b = (k: string) => busy === `${c.id}:${k}`;
                  return (
                    <Card key={c.id} c={c} data={data} onOpen={onOpen}>
                      {multiStage && s && <p className="mt-1 text-[11px] text-muted-foreground">Stage: {s.label}</p>}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {c.state === "todo" && (
                          <Button size="sm" variant="outline" disabled={b("start")} onClick={() => run(`${c.id}:start`, () => flowStartAction(data.dept, c.id), "Started")}>
                            <PlayIcon /> Start
                          </Button>
                        )}
                        {c.state === "working" && (
                          <Button size="sm" variant="outline" disabled={b("pause")} onClick={() => run(`${c.id}:pause`, () => flowPauseAction(data.dept, c.id))}>
                            <PauseIcon /> Pause
                          </Button>
                        )}
                        {(c.state === "todo" || c.state === "working") && (
                          <Button size="sm" disabled={b("done")} onClick={() => run(`${c.id}:done`, () => flowDoneAction(data.dept, c.id), "Marked done")}>
                            <CheckIcon /> Done
                          </Button>
                        )}
                        {c.state === "done" && (
                          <>
                            <Button size="sm" disabled={b("send")} onClick={() => run(`${c.id}:send`, () => flowSendAction(data.dept, [c.id]), s?.review ? "Sent to the lead" : `Sent on${s?.nextLabel ? ` to ${s.nextLabel}` : ""}`)}>
                              <SendIcon /> {s?.review ? "Send to the lead" : s?.nextLabel ? `Send to ${s.nextLabel}` : "Finish"}
                            </Button>
                            <Button size="sm" variant="ghost" disabled={b("reopen")} onClick={() => run(`${c.id}:reopen`, () => flowReopenAction(data.dept, c.id))}>
                              <RotateCcwIcon /> Reopen
                            </Button>
                          </>
                        )}
                      </div>
                    </Card>
                  );
                })}
                {!list.length && <p className="py-3 text-center text-xs text-muted-foreground">Nothing here</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// The lead's desk
// ---------------------------------------------------------------------------

function Section({ title, hint, count, actions, children, name }: { title: string; hint: string; count: number; actions?: React.ReactNode; children: React.ReactNode; name: string }) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-3" aria-label={title} data-flow-section={name}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">
          {title} <span className="font-normal text-muted-foreground tabular-nums">{count}</span>
        </h3>
        <span className="text-xs text-muted-foreground">{hint}</span>
        <span className="ml-auto flex flex-wrap gap-2">{actions}</span>
      </div>
      {children}
    </section>
  );
}

function Paged<T>({ items, children, empty }: { items: T[]; children: (x: T) => React.ReactNode; empty: string }) {
  const [n, setN] = React.useState(8);
  return (
    <>
      <div className="space-y-2">{items.slice(0, n).map(children)}</div>
      {items.length > n && (
        <Button size="sm" variant="ghost" className="w-full" onClick={() => setN(n + 8)}>
          Show {Math.min(8, items.length - n)} more of {items.length - n}
        </Button>
      )}
      {!items.length && <p className="text-xs text-muted-foreground">{empty}</p>}
    </>
  );
}

function Glance({ data }: { data: FlowHome }) {
  const g = data.desk!.glance;
  return (
    <section aria-label="Flow at a glance" className="space-y-1.5">
      <p className="text-xs font-medium">Flow at a glance</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {g.map((s) => (
          <div key={s.status} className="flex min-w-32 flex-1 flex-col rounded-lg border bg-card px-3 py-2" style={{ borderTop: `3px solid ${s.color}` }} data-flow-glance={s.status}>
            <span className="text-xs text-muted-foreground">{s.label}</span>
            <span className="text-xl font-semibold tabular-nums">{s.total}</span>
            <span className="text-[11px] text-muted-foreground">
              {s.kind === "work"
                ? [s.counts.todo && `${s.counts.todo} to do`, s.counts.working && `${s.counts.working} in progress`, s.counts.done && `${s.counts.done} done`, s.counts.sent && `${s.counts.sent} to approve`, s.counts.ready && `${s.counts.ready} to hand over`, s.counts.arriving && `${s.counts.arriving} arriving`]
                    .filter(Boolean)
                    .join(" · ") || "empty"
                : s.kind === "final"
                  ? "finished"
                  : [s.counts.arriving && `${s.counts.arriving} arriving`, s.counts.todo && `${s.counts.todo} waiting`].filter(Boolean).join(" · ") || "empty"}
            </span>
            {s.late > 0 && <span className="text-[11px] font-medium text-destructive">{s.late} past the target</span>}
            {s.doneWeek > 0 && s.kind !== "final" && <span className="text-[11px] text-muted-foreground">{s.doneWeek} moved on this week</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function IntakeRow({ c, data, onOpen }: { c: FlowCard; data: FlowHome; onOpen: (id: string) => void }) {
  const { run, busy } = useRun();
  const [priority, setPriority] = React.useState(c.priority);
  const [sprint, setSprint] = React.useState(c.sprintId ?? "none");
  const [person, setPerson] = React.useState(c.assigneeId ?? "none");
  const [declining, setDeclining] = React.useState(false);
  const stage = data.stages.find((s) => s.status === c.stage);
  return (
    <Card c={c} data={data} onOpen={onOpen} showPerson>
      {declining ? (
        <NoteForm label="Decline" placeholder="Why it is declined (the person who asked is told)" busy={busy === "decline"} onCancel={() => setDeclining(false)} onSubmit={(note) => run("decline", () => flowDeclineAction(data.dept, c.id, note), "Declined")} />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger size="sm" className="h-8 w-28 text-xs" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {data.priorities.map((p) => (
                <SelectItem key={p.key} value={p.key}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {data.sprints.length > 0 && (
            <Select value={sprint} onValueChange={setSprint}>
              <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Sprint">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No sprint</SelectItem>
                {data.sprints.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    {s.status === "active" ? " (current)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger size="sm" className="h-8 w-36 text-xs" aria-label="Person">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nobody yet</SelectItem>
              {data.people.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={busy === "plan"}
            onClick={() => run("plan", () => flowPlanAction(data.dept, c.id, { priority, sprintId: sprint === "none" ? null : sprint, assigneeId: person === "none" ? null : person }), `Planned${stage?.nextLabel ? ` into ${stage.nextLabel}` : ""}`)}
          >
            <SendIcon /> Plan{stage?.nextLabel ? ` into ${stage.nextLabel}` : ""}
          </Button>
          {c.request?.pending && (
            <Button size="sm" variant="ghost" onClick={() => setDeclining(true)}>
              <XIcon /> Decline
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

function CheckRow({ c, data, onOpen }: { c: FlowCard; data: FlowHome; onOpen: (id: string) => void }) {
  const { run, busy } = useRun();
  const [returning, setReturning] = React.useState(false);
  const s = data.stages.find((x) => x.status === c.stage)!;
  return (
    <Card c={c} data={data} onOpen={onOpen} showPerson>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {s.label}
        {c.from ? ` · from ${c.from}` : ""}
      </p>
      {returning ? (
        <NoteForm
          label={s.returnAsBug ? "Send back as a bug" : "Return"}
          placeholder={s.returnAsBug ? "Steps to reproduce, what you expected and what happened" : "What needs to change"}
          rows={s.returnAsBug ? 4 : 2}
          busy={busy === "return"}
          onCancel={() => setReturning(false)}
          onSubmit={(note) => run("return", () => flowCheckReturnAction(data.dept, c.id, note), "Returned")}
        />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy === "pass"} onClick={() => run("pass", () => flowPassAction(data.dept, [c.id]), "Passed")}>
            <CheckIcon /> Pass{s.nextLabel ? ` to ${s.nextLabel}` : ""}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
            <RotateCcwIcon /> {s.returnAsBug ? "Send back as a bug" : "Return"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ArrivingRow({ c, data, onOpen }: { c: FlowCard; data: FlowHome; onOpen: (id: string) => void }) {
  const { run, busy } = useRun();
  const [back, setBack] = React.useState(false);
  const s = data.stages.find((x) => x.status === c.stage)!;
  return (
    <Card c={c} data={data} onOpen={onOpen} showPerson>
      <p className="mt-1 text-[11px] text-muted-foreground">
        Arriving in {s.label}
        {c.from ? ` from ${c.from}` : ""}
      </p>
      {back ? (
        <NoteForm label={`Send back${c.from ? ` to ${c.from}` : ""}`} placeholder="What is missing or incomplete" busy={busy === "back"} onCancel={() => setBack(false)} onSubmit={(note) => run("back", () => flowSendBackAction(data.dept, c.id, note), "Sent back")} />
      ) : (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" disabled={busy === "accept"} onClick={() => run("accept", () => flowAcceptAction(data.dept, [c.id]), "Accepted")}>
            <CheckIcon /> Accept
          </Button>
          <Button size="sm" variant="outline" onClick={() => setBack(true)}>
            <RotateCcwIcon /> Send back as missing
          </Button>
        </div>
      )}
    </Card>
  );
}

function ApproveRow({ c, data, onOpen, select }: { c: FlowCard; data: FlowHome; onOpen: (id: string) => void; select: React.ReactNode }) {
  const { run, busy } = useRun();
  const [returning, setReturning] = React.useState(false);
  return (
    <Card c={c} data={data} onOpen={onOpen} showPerson select={select}>
      {returning ? (
        <NoteForm label="Return" placeholder="What needs to change" busy={busy === "return"} onCancel={() => setReturning(false)} onSubmit={(note) => run("return", () => flowReturnAction(data.dept, c.id, note), "Returned")} />
      ) : (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" disabled={busy === "approve"} onClick={() => run("approve", () => flowApproveAction(data.dept, [c.id]), "Approved")}>
            <CheckIcon /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setReturning(true)}>
            <RotateCcwIcon /> Return
          </Button>
        </div>
      )}
    </Card>
  );
}

function ReleasePanel({ data, onOpen }: { data: FlowHome; onOpen: (id: string) => void }) {
  const list = data.desk!.release;
  const pick = usePick(list.map((c) => c.id));
  const { run, busy } = useRun();
  const [name, setName] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [drafting, setDrafting] = React.useState(false);
  const stage = data.stages.find((s) => s.kind === "release");
  const draft = async () => {
    setDrafting(true);
    const r = await draftReleaseNotesAction(data.dept, pick.chosen);
    setDrafting(false);
    if (r.ok) setNotes(String(r.data ?? ""));
    else toast.error(r.error);
  };
  return (
    <Section
      name="release"
      title={stage ? stage.label : "Ready to release"}
      hint={`Group what is ready into a release${stage?.nextLabel ? `; it moves to ${stage.nextLabel}` : ""}`}
      count={list.length}
      actions={
        list.length > 0 && (
          <Button size="sm" variant="ghost" onClick={pick.all}>
            {pick.picked.size === list.length ? "Clear" : "Choose all"}
          </Button>
        )
      }
    >
      <Paged items={list} empty="Nothing waiting to be released.">
        {(c) => <Card key={c.id} c={c} data={data} onOpen={onOpen} showPerson select={<Checkbox aria-label={`Include ${c.code}`} checked={pick.picked.has(c.id)} onCheckedChange={() => pick.toggle(c.id)} className="mt-1" />} />}
      </Paged>
      {list.length > 0 && (
        <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
          <div className="flex flex-wrap gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Release name, for example v1.4.0" aria-label="Release name" className="h-8 max-w-60 text-sm" />
            <Button size="sm" variant="outline" disabled={drafting} onClick={draft}>
              {drafting && <Loader2Icon className="animate-spin" />} Draft the notes from {pick.picked.size || "all"} {data.tasks.toLowerCase()}
            </Button>
          </div>
          <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Release notes: what is new, what was fixed" aria-label="Release notes" />
          <Button
            size="sm"
            disabled={!name.trim() || busy === "release"}
            onClick={() =>
              run("release", () => flowReleaseAction(data.dept, { ids: pick.chosen, name, notes }), (d) => {
                const res = (d as { results: Many }).results;
                return `${name} released with ${res.filter((x) => x.ok).length} ${data.tasks.toLowerCase()}`;
              }).then((ok) => ok && (setName(""), setNotes("")))
            }
          >
            <PackageCheckIcon /> Release {pick.picked.size || list.length}
          </Button>
        </div>
      )}
      {data.desk!.releases.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Recent releases</summary>
          <ul className="mt-2 space-y-2">
            {data.desk!.releases.map((r) => (
              <li key={r.id} className="rounded-lg border p-2">
                <p className="font-medium">
                  {r.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {r.createdAt.slice(0, 10)} · {r.taskCount} {data.tasks.toLowerCase()}
                    {r.by ? ` · ${r.by}` : ""}
                  </span>
                </p>
                {r.notes && <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{r.notes}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}

function LeadDesk({ data, onOpen }: { data: FlowHome; onOpen: (id: string) => void }) {
  const d = data.desk!;
  const { run, busy } = useRun();
  const approve = usePick(d.approve.map((c) => c.id));
  const ready = usePick(d.ready.map((c) => c.id));
  const assign = usePick(d.assign.map((c) => c.id));
  const [assignTo, setAssignTo] = React.useState("");
  const has = (k: FlowStageInfo["kind"]) => data.stages.some((s) => s.kind === k);
  const nextOf = (c?: FlowCard) => data.stages.find((s) => s.status === c?.stage)?.nextLabel;
  const tick = (p: ReturnType<typeof usePick>, id: string, code: string) => <Checkbox aria-label={`Select ${code}`} checked={p.picked.has(id)} onCheckedChange={() => p.toggle(id)} className="mt-1" />;
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{d.lead ? "Lead desk" : "To check"}</h2>
      {d.lead && <Glance data={data} />}
      <div className="grid gap-3 xl:grid-cols-2">
        {d.lead && has("intake") && (
          <Section name="intake" title="Intake" hint="New work, bugs and requests: set the priority, the sprint and the person, then plan it" count={d.intake.length}>
            <Paged items={d.intake} empty="Nothing new to triage.">
              {(c) => <IntakeRow key={c.id} c={c} data={data} onOpen={onOpen} />}
            </Paged>
          </Section>
        )}
        {(d.checks.length > 0 || has("check")) && (
          <Section
            name="checks"
            title="To check"
            hint="Pass it on, or return it with what to change"
            count={d.checks.length}
            actions={
              d.checks.length > 1 && (
                <Button size="sm" variant="outline" disabled={busy === "pass-all"} onClick={() => run("pass-all", () => flowPassAction(data.dept, d.checks.map((c) => c.id)), "Passed")}>
                  <CheckCircle2Icon /> Pass all {d.checks.length}
                </Button>
              )
            }
          >
            <Paged items={d.checks} empty="Nothing waiting for a check.">
              {(c) => <CheckRow key={c.id} c={c} data={data} onOpen={onOpen} />}
            </Paged>
          </Section>
        )}
        {(d.arriving.length > 0 || data.stages.some((s) => s.accept)) && (
          <Section
            name="arriving"
            title="Arriving"
            hint="Handed over; accept it, or send it back as missing"
            count={d.arriving.length}
            actions={
              d.arriving.length > 1 && (
                <Button size="sm" variant="outline" disabled={busy === "accept-all"} onClick={() => run("accept-all", () => flowAcceptAction(data.dept, d.arriving.map((c) => c.id)), "Accepted")}>
                  <CheckIcon /> Accept all {d.arriving.length}
                </Button>
              )
            }
          >
            <Paged items={d.arriving} empty="Nothing arriving.">
              {(c) => <ArrivingRow key={c.id} c={c} data={data} onOpen={onOpen} />}
            </Paged>
          </Section>
        )}
        {d.lead && data.stages.some((s) => s.review) && (
          <Section
            name="approve"
            title="To approve"
            hint="Sent to you by the team"
            count={d.approve.length}
            actions={
              d.approve.length > 0 && (
                <Button size="sm" disabled={busy === "approve-many"} onClick={() => run("approve-many", () => flowApproveAction(data.dept, approve.chosen), "Approved")}>
                  <CheckCircle2Icon /> Approve {approve.picked.size || "all"}
                </Button>
              )
            }
          >
            <Paged items={d.approve} empty="Nothing waiting for approval.">
              {(c) => <ApproveRow key={c.id} c={c} data={data} onOpen={onOpen} select={tick(approve, c.id, c.code)} />}
            </Paged>
          </Section>
        )}
        {d.lead && (d.ready.length > 0 || data.stages.some((s) => s.review && (s.nextDept || (s.next && data.stages.find((x) => x.status === s.next)?.kind !== "final")))) && (
          <Section
            name="ready"
            title="Ready for the next stage"
            hint="Approved; hand it over as a batch"
            count={d.ready.length}
            actions={
              d.ready.length > 0 && (
                <Button size="sm" disabled={busy === "handover"} onClick={() => run("handover", () => flowHandOverAction(data.dept, ready.chosen), "Handed over")}>
                  <SendIcon /> Hand over {ready.picked.size || "all"}
                  {nextOf(d.ready[0]) ? ` to ${nextOf(d.ready[0])}` : ""}
                </Button>
              )
            }
          >
            <Paged items={d.ready} empty="Nothing approved and waiting.">
              {(c) => <Card key={c.id} c={c} data={data} onOpen={onOpen} showPerson select={tick(ready, c.id, c.code)} />}
            </Paged>
          </Section>
        )}
        {d.lead && has("release") && <ReleasePanel data={data} onOpen={onOpen} />}
        {d.lead && (
          <Section
            name="assign"
            title="To assign"
            hint="Work nobody has yet"
            count={d.assign.length}
            actions={
              d.assign.length > 0 && (
                <>
                  <Select value={assignTo} onValueChange={setAssignTo}>
                    <SelectTrigger size="sm" className="h-8 w-48 text-xs" aria-label="Assign to">
                      <SelectValue placeholder="Assign to…" />
                    </SelectTrigger>
                    <SelectContent>
                      {d.people.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} ({p.todo + p.working} open)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!assignTo || busy === "assign"} onClick={() => run("assign", () => flowAssignAction(data.dept, assign.chosen, assignTo), "Assigned")}>
                    <UserPlusIcon /> Assign {assign.picked.size || "all"}
                  </Button>
                </>
              )
            }
          >
            <Paged items={d.assign} empty="Everything is assigned.">
              {(c) => <Card key={c.id} c={c} data={data} onOpen={onOpen} select={tick(assign, c.id, c.code)} />}
            </Paged>
          </Section>
        )}
      </div>
      {d.lead && d.people.length > 0 && (
        <Section name="team" title="The team now" hint="Open work per person" count={d.people.length}>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {d.people.map((p) => (
              <li key={p.id} className="rounded-lg border p-2 text-sm">
                <p className="font-medium">{p.name}</p>
                <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  <span>{p.todo} to do</span>
                  <span>{p.working} in progress</span>
                  <span>{p.done} done, not sent</span>
                  <span>{p.sent} with you</span>
                </p>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

export function DeptFlowHome({ data, onOpen }: { data: FlowHome; onOpen: (id: string) => void }) {
  const guides = data.stages.filter((s) => s.mine && s.steps.length);
  const lead = !!data.desk?.lead;
  const board = data.mine.length > 0 || (!lead && !data.desk);
  return (
    <div className="space-y-4" data-flow-home={data.dept}>
      {guides.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {guides.map((s) => (
            <Guide key={s.status} s={s} />
          ))}
        </div>
      )}
      {!lead && board && <MemberBoard data={data} onOpen={onOpen} />}
      {data.desk && <LeadDesk data={data} onOpen={onOpen} />}
      {lead && data.mine.length > 0 && <MemberBoard data={data} onOpen={onOpen} />}
    </div>
  );
}
