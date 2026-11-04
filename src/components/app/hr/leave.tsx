"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlusIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, PencilIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import {
  addEthiopianHolidaysAction,
  addHolidayAction,
  adjustLeaveAction,
  cancelLeaveAction,
  decideLeaveAction,
  leaveBalancesAction,
  removeHolidayAction,
  requestLeaveAction,
  saveLeaveTypeAction,
  addEvidenceAction,
  askHrAction,
  answerQueryAction,
  saveLeaveStaffConfigAction,
} from "@/app/actions/leave";
import type { Balance, EvidenceFile, LeaveCalendarEntry, LeaveQuery, LeaveRequestRow, LeaveStaffConfig } from "@/server/leave";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { FileCheckIcon, MessageCircleQuestionIcon, PaperclipIcon } from "lucide-react";
import { LEAVE_STATUS_LABELS, countLeaveDays, type LeaveStatus, type LeaveType } from "@/lib/leave";
import { cn } from "@/lib/utils";
import { SimpleSelect } from "./hr-home";
import { Field, fmtDay } from "./hr-shared";

type Cal = { workdays: number[]; holidays: { date: string; name: string }[] };
type Opt = { value: string; label: string };

const TONE: Record<LeaveStatus, Tone> = { pending_lead: "paused", pending_hr: "handoff", approved: "done", rejected: "blocked", cancelled: "neutral" };
const LeaveStatusPill = ({ status }: { status: LeaveStatus }) => <StatusPill tone={TONE[status]} size="xs" label={LEAVE_STATUS_LABELS[status]} />;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
const range = (r: { startDate: string; endDate: string; halfDay?: boolean }) =>
  r.startDate === r.endDate ? `${fmtDay(r.startDate)}${r.halfDay ? " (half day)" : ""}` : `${fmtDay(r.startDate)} to ${fmtDay(r.endDate)}`;

async function done(r: { ok: boolean; error?: string }, message: string, router: ReturnType<typeof useRouter>) {
  if (!r.ok) {
    toast.error(r.error);
    return false;
  }
  toast.success(message);
  router.refresh();
  return true;
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export function Balances({ balances }: { balances: Balance[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {balances.map((b) => (
        <div key={b.type.key} className="rounded-lg border bg-card p-3">
          <div className="text-sm font-medium">{b.type.label}</div>
          {b.available === null ? (
            <div className="mt-1 text-xs text-muted-foreground">No limit{b.used ? ` · ${days(b.used)} taken` : ""}</div>
          ) : (
            <>
              <div className="mt-1 text-2xl font-semibold tabular">
                {b.available}
                <span className="ml-1 text-sm font-normal text-muted-foreground">of {b.accrued! + b.adjusted} left</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {b.used ? `${days(b.used)} taken` : "None taken"}
                {b.pending ? ` · ${days(b.pending)} waiting` : ""}
                {b.type.accrual === "monthly" && b.accrued !== b.entitlement ? ` · ${b.entitlement} by December` : ""}
                {b.adjusted ? ` · ${b.adjusted > 0 ? "+" : ""}${b.adjusted} adjusted` : ""}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// A photo or PDF, read in the browser and sent as base64.
async function readEvidence(file: File): Promise<EvidenceFile> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { name: file.name, mime: file.type || "application/octet-stream", base64: btoa(bin) };
}

function EvidencePicker({ file, onFile, required }: { file: File | null; onFile: (f: File | null) => void; required: boolean }) {
  return (
    <Field label={`Evidence${required ? "" : " (optional)"}: a photo or PDF of the medical note`}>
      <Input type="file" accept="image/*,application/pdf" capture="environment" aria-label="Evidence" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
    </Field>
  );
}

export function RequestForm({ types, calendar, people, onDone, requireEvidence = true }: { types: LeaveType[]; calendar: Cal; people?: Opt[]; onDone?: () => void; requireEvidence?: boolean }) {
  const router = useRouter();
  const [file, setFile] = React.useState<File | null>(null);
  const [f, setF] = React.useState({ employeeId: "", typeKey: types[0]?.key ?? "", startDate: "", endDate: "", halfDay: false, reason: "" });
  const [busy, setBusy] = React.useState(false);
  const single = !!f.startDate && (f.endDate || f.startDate) === f.startDate;
  const end = f.endDate || f.startDate;
  const count = f.startDate ? countLeaveDays(f.startDate, end, calendar.workdays, calendar.holidays.map((h) => h.date), f.halfDay && single) : 0;
  const type = types.find((t) => t.key === f.typeKey);
  const submit = async () => {
    setBusy(true);
    const evidence = file && type?.needsDocument ? await readEvidence(file) : null;
    const r = await requestLeaveAction({ ...f, endDate: end, halfDay: f.halfDay && single, employeeId: f.employeeId || null, evidence });
    setBusy(false);
    if (await done(r, people ? "Leave recorded" : "Leave requested", router)) {
      setFile(null);
      setF({ ...f, startDate: "", endDate: "", halfDay: false, reason: "" });
      onDone?.();
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {people && (
          <Field label="Person" className="sm:col-span-2">
            <SimpleSelect value={f.employeeId} onChange={(v) => setF({ ...f, employeeId: v })} options={people} placeholder="Choose a person" />
          </Field>
        )}
        <Field label="Leave type" className="sm:col-span-2">
          <SimpleSelect value={f.typeKey} onChange={(v) => setF({ ...f, typeKey: v })} options={types.map((t) => ({ value: t.key, label: `${t.label}${t.paid ? "" : " (unpaid)"}` }))} />
        </Field>
        <Field label="First day">
          <Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate })} />
        </Field>
        <Field label="Last day">
          <Input type="date" value={end} min={f.startDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} />
        </Field>
      </div>
      {single && (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.halfDay} onCheckedChange={(v) => setF({ ...f, halfDay: v === true })} /> Half a day
        </label>
      )}
      <Field label="Note (optional)">
        <Textarea value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} rows={2} placeholder={type?.needsDocument ? "What happened, if you want to say" : "Anything your manager should know"} />
      </Field>
      {type?.needsDocument && !people && <EvidencePicker file={file} onFile={setFile} required={requireEvidence} />}
      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={busy || !f.startDate || !count || !f.typeKey || (!!people && !f.employeeId) || (!people && !!type?.needsDocument && requireEvidence && !file)}>
          <CalendarPlusIcon /> {people ? "Record leave" : "Ask for leave"}
        </Button>
        <span className="text-sm text-muted-foreground">{f.startDate ? (count ? `${days(count)} of working time` : "Those days are weekends or public holidays") : "Weekends and public holidays are not counted."}</span>
      </div>
    </div>
  );
}

function Decide({ row, onClose }: { row: LeaveRequestRow; onClose: () => void }) {
  const router = useRouter();
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const go = async () => {
    setBusy(true);
    const ok = await done(await decideLeaveAction(row.id, { decision: "reject", note }), "Sent back with your reason", router);
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Do not approve {row.employeeName}&apos;s leave</DialogTitle>
          <DialogDescription>
            {row.typeLabel}, {range(row)}. Say why, so they can plan around it.
          </DialogDescription>
        </DialogHeader>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} aria-label="Reason" autoFocus />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={busy || !note.trim()} onClick={go}>
            Do not approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Requests someone can approve or send back.
export function ApprovalList({ rows, empty, stage }: { rows: LeaveRequestRow[]; empty: string; stage: "lead" | "hr" }) {
  const router = useRouter();
  const [rejecting, setRejecting] = React.useState<LeaveRequestRow | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {r.employeeName} <span className="font-normal text-muted-foreground">· {r.typeLabel}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {range(r)} · {days(r.days)}
              {stage === "hr" && r.approverName ? ` · approved by ${r.approverName}` : ""}
            </div>
            {r.reason && <div className="text-xs text-muted-foreground">“{r.reason}”</div>}
            {r.leadNote && <div className="text-xs text-muted-foreground">Line manager: {r.leadNote}</div>}
            {r.needsDocument &&
              (r.evidenceId ? (
                <a href={`/api/hr-files/${r.evidenceId}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-evidence>
                  <FileCheckIcon className="size-3.5" /> Open the evidence
                </a>
              ) : (
                <div className="text-xs text-[var(--st-paused-fg)]">No evidence attached yet</div>
              ))}
          </div>
          <Button
            size="sm"
            disabled={busy === r.id}
            onClick={async () => {
              setBusy(r.id);
              await done(await decideLeaveAction(r.id, { decision: "approve" }), stage === "lead" ? "Approved and sent to HR" : "Approved", router);
              setBusy(null);
            }}
          >
            <CheckIcon /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(r)}>
            <XIcon /> Do not approve
          </Button>
        </div>
      ))}
      {rejecting && <Decide row={rejecting} onClose={() => setRejecting(null)} />}
    </div>
  );
}

export function RequestTable({ rows, showPerson, canCancel }: { rows: LeaveRequestRow[]; showPerson?: boolean; canCancel: (r: LeaveRequestRow) => boolean }) {
  const router = useRouter();
  if (!rows.length) return <p className="text-sm text-muted-foreground">No leave yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            {showPerson && <TableHead>Person</TableHead>}
            <TableHead>Leave</TableHead>
            <TableHead>When</TableHead>
            <TableHead>Days</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Notes</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              {showPerson && (
                <TableCell>
                  <Link href={`/hr/people/${r.employeeId}`} className="font-medium hover:underline">
                    {r.employeeName}
                  </Link>
                </TableCell>
              )}
              <TableCell>{r.typeLabel}</TableCell>
              <TableCell className="whitespace-nowrap">{range(r)}</TableCell>
              <TableCell className="tabular">{r.days}</TableCell>
              <TableCell>
                <LeaveStatusPill status={r.status} />
              </TableCell>
              <TableCell className="max-w-72 text-xs text-muted-foreground">{[r.reason, r.leadNote && `Line manager: ${r.leadNote}`, r.hrNote && `HR: ${r.hrNote}`].filter(Boolean).join(" · ") || "-"}</TableCell>
              <TableCell className="text-right">
                {canCancel(r) && (
                  <Button size="xs" variant="ghost" onClick={async () => void (await done(await cancelLeaveAction(r.id), "Cancelled", router))}>
                    Cancel
                  </Button>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// Month grid of who is off; weekends and public holidays are shaded. Month changes go through the address.
export function LeaveCalendar({ month, entries, calendar, hrefFor }: { month: string; entries: LeaveCalendarEntry[]; calendar: Cal; hrefFor: (month: string) => string }) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const first = new Date(Date.UTC(y, m - 1, 1));
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const shift = (n: number) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  };
  const holiday = new Map(calendar.holidays.map((h) => [h.date, h.name]));
  const todayIso = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button size="icon-sm" variant="ghost" asChild>
          <Link href={hrefFor(shift(-1))} aria-label="Previous month" scroll={false}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{first.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</span>
        <Button size="icon-sm" variant="ghost" asChild>
          <Link href={hrefFor(shift(1))} aria-label="Next month" scroll={false}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">Pale names are waiting for approval.</span>
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border text-xs">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="bg-muted px-2 py-1 font-medium text-muted-foreground">
            {d}
          </div>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <div key={`b${i}`} className="bg-background" />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const wd = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
          const off = !calendar.workdays.includes(wd) || holiday.has(date);
          const who = entries.filter((e) => e.startDate <= date && e.endDate >= date);
          return (
            <div key={date} className={cn("min-h-20 space-y-0.5 bg-background p-1", off && "bg-muted/60")}>
              <div className={cn("flex items-center gap-1 text-[11px]", date === todayIso && "font-semibold text-primary")}>
                {i + 1}
                {holiday.has(date) && (
                  <span className="truncate text-[10px] text-muted-foreground" title={holiday.get(date)}>
                    {holiday.get(date)}
                  </span>
                )}
              </div>
              {!off &&
                who.slice(0, 4).map((e) => (
                  <div key={e.id} title={`${e.employeeName}: ${e.typeLabel} (${LEAVE_STATUS_LABELS[e.status]})`} className={cn("truncate rounded px-1 py-0.5", e.status === "approved" ? "bg-primary/15 text-foreground" : "bg-muted text-muted-foreground")}>
                    {e.employeeName}
                  </div>
                ))}
              {!off && who.length > 4 && <div className="text-[10px] text-muted-foreground">+{who.length - 4} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Leave page: everyone's own leave, and approvals for line managers
// ---------------------------------------------------------------------------

// Attach evidence to one of your own requests that still waits.
function AddEvidence({ id }: { id: string }) {
  const router = useRouter();
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        aria-label="Add evidence"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (f) await done(await addEvidenceAction(id, await readEvidence(f)), "Evidence sent to HR", router);
        }}
      />
      <Button size="xs" variant="outline" onClick={() => ref.current?.click()}>
        <PaperclipIcon /> Add evidence
      </Button>
    </>
  );
}

// Ask HR: a question about the balance, or a correction of a leave.
function AskHr({ requests, queries }: { requests: LeaveRequestRow[]; queries: LeaveQuery[] }) {
  const router = useRouter();
  const [f, setF] = React.useState({ kind: "question" as "question" | "correction", requestId: "", message: "" });
  const [busy, setBusy] = React.useState(false);
  return (
    <Card data-ask-hr>
      <CardHeader>
        <CardTitle>Ask HR</CardTitle>
        <CardDescription>About your balance, or to correct a leave that is wrong. HR answers here and you are told.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="What about">
            <SimpleSelect value={f.kind} onChange={(v) => setF({ ...f, kind: v as "question" | "correction" })} options={[{ value: "question", label: "A question, for example how many days I have" }, { value: "correction", label: "A correction of my leave" }]} />
          </Field>
          <Field label="Which leave (optional)">
            <SimpleSelect value={f.requestId} onChange={(v) => setF({ ...f, requestId: v })} options={[{ value: "", label: "None in particular" }, ...requests.slice(0, 30).map((r) => ({ value: r.id, label: `${r.typeLabel}, ${range(r)}` }))]} />
          </Field>
        </div>
        <Textarea rows={2} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} aria-label="Your message" placeholder={f.kind === "correction" ? "I was back on Tuesday, so it should be 2 days, not 3" : "How many days of annual leave do I have left?"} />
        <Button
          disabled={busy || !f.message.trim()}
          onClick={async () => {
            setBusy(true);
            const ok = await done(await askHrAction({ kind: f.kind, message: f.message, requestId: f.requestId || null }), "Sent to HR", router);
            setBusy(false);
            if (ok) setF({ ...f, message: "" });
          }}
        >
          <MessageCircleQuestionIcon /> Send to HR
        </Button>
        {queries.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm">
            {queries.map((q) => (
              <li key={q.id} className="space-y-0.5 p-2" data-query={q.status}>
                <p>
                  <span className="text-xs text-muted-foreground">{q.kind === "correction" ? "Correction" : "Question"}{q.requestLabel ? ` · ${q.requestLabel}` : ""} · </span>
                  {q.message}
                </p>
                <p className={cn("text-xs", q.answer ? "" : "text-muted-foreground")}>{q.answer ? `HR (${q.answeredBy}): ${q.answer}` : "Waiting for HR"}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// HR: questions and corrections from people, and what people see of their own leave.
function HrQueries({ queries, staff }: { queries: LeaveQuery[]; staff: LeaveStaffConfig }) {
  const router = useRouter();
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [c, setC] = React.useState(staff);
  const open = queries.filter((q) => q.status === "open");
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card data-hr-queries>
        <CardHeader>
          <CardTitle>Questions and corrections ({open.length})</CardTitle>
          <CardDescription>From people about their leave. Look up their balance below, correct it if needed, and answer.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {!queries.length && <p className="text-sm text-muted-foreground">Nothing asked.</p>}
          {queries.map((q) => (
            <div key={q.id} className="space-y-1.5 rounded-lg border p-2 text-sm" data-hr-query={q.employeeName}>
              <p>
                <span className="font-medium">{q.employeeName}</span>{" "}
                <span className="text-xs text-muted-foreground">
                  {q.kind === "correction" ? "asks for a correction" : "asks"}
                  {q.requestLabel ? ` · ${q.requestLabel}` : ""}
                </span>
              </p>
              <p>{q.message}</p>
              {q.status === "answered" ? (
                <p className="text-xs text-muted-foreground">Answered by {q.answeredBy}: {q.answer}</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Input className="h-8 min-w-48 flex-1" aria-label={`Answer ${q.employeeName}`} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer" />
                  <Button size="sm" disabled={!answers[q.id]?.trim()} onClick={async () => void (await done(await answerQueryAction(q.id, answers[q.id]!), "Answer sent", router))}>
                    Answer
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card data-leave-staff>
        <CardHeader>
          <CardTitle>What people see</CardTitle>
          <CardDescription>Of their own leave, on Profile, Leave.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(
            [
              ["showBalances", "Show people their remaining days"],
              ["requireEvidence", "Leave that needs a document (sick leave) needs evidence attached"],
              ["queries", "People ask HR questions and corrections here"],
            ] as const
          ).map(([k, label]) => (
            <div key={k} className="flex items-center gap-2">
              <Switch id={`ls-${k}`} checked={c[k]} onCheckedChange={(v) => setC({ ...c, [k]: v })} />
              <Label htmlFor={`ls-${k}`}>{label}</Label>
            </div>
          ))}
          <Button size="sm" onClick={async () => void (await done(await saveLeaveStaffConfigAction(c), "Saved", router))}>
            Save
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function MyLeave(props: {
  showBalances?: boolean;
  queries?: LeaveQuery[];
  queriesOn?: boolean;
  requireEvidence?: boolean;
  balances: Balance[];
  requests: LeaveRequestRow[];
  approvals: LeaveRequestRow[];
  types: LeaveType[];
  calendar: Cal;
  month: string;
  entries: LeaveCalendarEntry[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      {props.approvals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>To approve ({props.approvals.length})</CardTitle>
            <CardDescription>From people who report to you. Once you approve, HR gives the final approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <ApprovalList rows={props.approvals} stage="lead" empty="" />
          </CardContent>
        </Card>
      )}
      {props.showBalances !== false && <Balances balances={props.balances} />}
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Ask for leave</CardTitle>
            <CardDescription>Your line manager approves first, then HR.</CardDescription>
          </CardHeader>
          <CardContent>
            <RequestForm types={props.types} calendar={props.calendar} requireEvidence={props.requireEvidence !== false} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Who is off</CardTitle>
            <CardDescription>You and the people who report to you.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCalendar month={props.month} entries={props.entries} calendar={props.calendar} hrefFor={(m) => `/profile?tab=leave&month=${m}`} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Your leave</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestTable rows={props.requests} canCancel={(r) => r.status === "pending_lead" || r.status === "pending_hr" || (r.status === "approved" && r.startDate > today)} />
          {props.requests.some((r) => r.needsDocument && !r.evidenceId && ["pending_lead", "pending_hr", "approved"].includes(r.status)) && (
            <div className="mt-3 space-y-1.5 rounded-lg border border-[var(--st-paused-fg)]/40 p-2 text-sm">
              <p className="font-medium">Evidence still needed</p>
              {props.requests
                .filter((r) => r.needsDocument && !r.evidenceId && ["pending_lead", "pending_hr", "approved"].includes(r.status))
                .map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-2">
                    <span className="flex-1">
                      {r.typeLabel}, {range(r)}
                    </span>
                    <AddEvidence id={r.id} />
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
      {props.queriesOn !== false && <AskHr requests={props.requests} queries={props.queries ?? []} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// HR, Leave tab
// ---------------------------------------------------------------------------

export function HrLeave(props: {
  queries?: LeaveQuery[];
  staff?: LeaveStaffConfig;
  waiting: LeaveRequestRow[];
  withManagers: LeaveRequestRow[];
  recent: LeaveRequestRow[];
  types: LeaveType[];
  calendar: Cal;
  year: number;
  month: string;
  entries: LeaveCalendarEntry[];
  people: Opt[];
  canManage: boolean;
}) {
  const [recording, setRecording] = React.useState(false);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for HR ({props.waiting.length})</CardTitle>
            <CardDescription>Approved by the line manager, or from people without one.</CardDescription>
            <CardAction>
              <Button size="sm" variant="outline" onClick={() => setRecording(true)}>
                <PlusIcon /> Record leave
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="space-y-4">
            <ApprovalList rows={props.waiting} stage="hr" empty="Nothing waiting." />
            {props.withManagers.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">With line managers ({props.withManagers.length}). HR can decide these too, for example when the manager is away.</p>
                <ApprovalList rows={props.withManagers} stage="hr" empty="" />
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Who is off</CardTitle>
            <CardDescription>Everyone, including leave still waiting for approval.</CardDescription>
          </CardHeader>
          <CardContent>
            <LeaveCalendar month={props.month} entries={props.entries} calendar={props.calendar} hrefFor={(m) => `/hr?tab=leave&month=${m}`} />
          </CardContent>
        </Card>
      </div>
      {props.staff && <HrQueries queries={props.queries ?? []} staff={props.staff} />}
      <BalanceTool people={props.people} types={props.types.filter((t) => t.active)} year={props.year} />
      <Card>
        <CardHeader>
          <CardTitle>Decided in {props.year}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestTable rows={props.recent} showPerson canCancel={(r) => r.status === "approved"} />
        </CardContent>
      </Card>
      <div className="grid gap-4 xl:grid-cols-2">
        <LeaveTypes types={props.types} canManage={props.canManage} />
        <Holidays calendar={props.calendar} year={props.year} />
      </div>
      <Dialog open={recording} onOpenChange={setRecording}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Record leave</DialogTitle>
            <DialogDescription>For leave agreed outside the app. It is approved straight away and the person is told.</DialogDescription>
          </DialogHeader>
          <RequestForm types={props.types.filter((t) => t.active)} calendar={props.calendar} people={props.people} onDone={() => setRecording(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BalanceTool({ people, types, year }: { people: Opt[]; types: LeaveType[]; year: number }) {
  const router = useRouter();
  const [who, setWho] = React.useState("");
  const [rows, setRows] = React.useState<Balance[] | null>(null);
  const [adj, setAdj] = React.useState({ typeKey: types[0]?.key ?? "", days: "", note: "" });
  const load = React.useCallback(async (id: string) => {
    setWho(id);
    setRows(null);
    if (!id) return;
    const r = await leaveBalancesAction(id, year);
    if (r.ok) setRows(r.data as Balance[]);
    else toast.error(r.error);
  }, [year]);
  const save = async () => {
    const ok = await done(await adjustLeaveAction({ employeeId: who, typeKey: adj.typeKey, year, days: Number(adj.days), note: adj.note }), "Balance adjusted", router);
    if (ok) {
      setAdj({ ...adj, days: "", note: "" });
      void load(who);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Balances</CardTitle>
        <CardDescription>See anyone&apos;s balance for {year}, and add or take away days, for example days carried over from last year.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-sm">
          <SimpleSelect value={who} onChange={load} options={people} placeholder="Choose a person" />
        </div>
        {rows && <Balances balances={rows} />}
        {who && (
          <div className="grid gap-2 sm:grid-cols-[12rem_7rem_1fr_auto] sm:items-end">
            <Field label="Leave type">
              <SimpleSelect value={adj.typeKey} onChange={(v) => setAdj({ ...adj, typeKey: v })} options={types.filter((t) => t.daysPerYear !== null).map((t) => ({ value: t.key, label: t.label }))} />
            </Field>
            <Field label="Days (+ or -)">
              <Input type="number" step="0.5" value={adj.days} onChange={(e) => setAdj({ ...adj, days: e.target.value })} />
            </Field>
            <Field label="Why">
              <Input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} placeholder="Carried over from last year" />
            </Field>
            <Button onClick={save} disabled={!Number(adj.days) || !adj.note.trim()}>
              Adjust
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LeaveTypes({ types, canManage }: { types: LeaveType[]; canManage: boolean }) {
  const [editing, setEditing] = React.useState<LeaveType | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Leave types</CardTitle>
        <CardDescription>{canManage ? "Days a year and how they build up. Defaults follow the Labour Proclamation 1156/2019." : "Only the HR Manager changes leave policy."}</CardDescription>
        {canManage && (
          <CardAction>
            <Button size="sm" variant="outline" onClick={() => setEditing("new")}>
              <PlusIcon /> Add type
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-1.5 text-sm">
        {types.map((t) => (
          <div key={t.key} className={cn("flex items-center gap-2 rounded-md border px-3 py-2", !t.active && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {t.label}
                {!t.active && " (switched off)"}
              </div>
              <div className="text-xs text-muted-foreground">
                {t.daysPerYear === null ? "No limit" : `${t.daysPerYear} days a year${t.serviceBonus ? `, +${t.serviceBonus} every 2 years of service` : ""}${t.accrual === "monthly" ? ", built up monthly" : ""}`}
                {t.paid ? "" : " · unpaid"}
                {t.needsDocument ? " · needs a document" : ""}
              </div>
            </div>
            {canManage && (
              <Button size="icon-xs" variant="ghost" aria-label={`Edit ${t.label}`} onClick={() => setEditing(t)}>
                <PencilIcon />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      {editing && <TypeForm type={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function TypeForm({ type, onClose }: { type: LeaveType | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = React.useState({
    label: type?.label ?? "",
    limited: type ? type.daysPerYear !== null : true,
    daysPerYear: String(type?.daysPerYear ?? 5),
    serviceBonus: String(type?.serviceBonus ?? 0),
    accrual: type?.accrual ?? "yearly",
    paid: type?.paid ?? true,
    needsDocument: type?.needsDocument ?? false,
    active: type?.active ?? true,
  });
  const save = async () => {
    const ok = await done(
      await saveLeaveTypeAction({
        key: type?.key,
        label: f.label,
        daysPerYear: f.limited ? Number(f.daysPerYear) : null,
        serviceBonus: Number(f.serviceBonus) || 0,
        accrual: f.accrual as "yearly" | "monthly",
        paid: f.paid,
        needsDocument: f.needsDocument,
        active: f.active,
      }),
      "Saved",
      router,
    );
    if (ok) onClose();
  };
  const tick = (k: "limited" | "paid" | "needsDocument" | "active", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={f[k]} onCheckedChange={(v) => setF({ ...f, [k]: v === true })} /> {label}
    </label>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? `Edit ${type.label}` : "Add a leave type"}</DialogTitle>
          <DialogDescription>Changes apply to balances straight away, including leave already taken this year.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
          </Field>
          {tick("limited", "Limited number of days a year")}
          {f.limited && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Days a year">
                <Input type="number" step="0.5" min="0" value={f.daysPerYear} onChange={(e) => setF({ ...f, daysPerYear: e.target.value })} />
              </Field>
              <Field label="Extra per 2 years of service">
                <Input type="number" step="0.5" min="0" value={f.serviceBonus} onChange={(e) => setF({ ...f, serviceBonus: e.target.value })} />
              </Field>
              <Field label="Days become available" className="col-span-2">
                <SimpleSelect
                  value={f.accrual}
                  onChange={(v) => setF({ ...f, accrual: v as "yearly" | "monthly" })}
                  options={[
                    { value: "yearly", label: "All at the start of the year" },
                    { value: "monthly", label: "Month by month" },
                  ]}
                />
              </Field>
            </div>
          )}
          {tick("paid", "Paid")}
          {tick("needsDocument", "Needs a document (for example a medical certificate)")}
          {tick("active", "People can ask for it")}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!f.label.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Holidays({ calendar, year }: { calendar: Cal; year: number }) {
  const router = useRouter();
  const [shown, setShown] = React.useState(year);
  const [h, setH] = React.useState({ date: "", name: "" });
  const list = calendar.holidays.filter((x) => x.date.startsWith(String(shown)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Public holidays</CardTitle>
        <CardDescription>Not counted as leave days. Shared with the work calendar in Settings. Add Eid al-Fitr, Eid al-Adha and Mawlid each year once the dates are announced.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon-sm" variant="ghost" aria-label="Previous year" onClick={() => setShown(shown - 1)}>
            <ChevronLeftIcon />
          </Button>
          <span className="font-medium tabular">{shown}</span>
          <Button size="icon-sm" variant="ghost" aria-label="Next year" onClick={() => setShown(shown + 1)}>
            <ChevronRightIcon />
          </Button>
          <Button size="sm" variant="outline" className="ml-auto" onClick={async () => {
            const r = await addEthiopianHolidaysAction(shown);
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.data ? `Added ${r.data} holidays for ${shown}` : `${shown}'s holidays are already there`);
            router.refresh();
          }}>
            Add Ethiopian holidays for {shown}
          </Button>
        </div>
        <ul className="space-y-1">
          {list.map((x) => (
            <li key={x.date} className="flex items-center gap-2 rounded-md border px-3 py-1.5">
              <span className="w-28 shrink-0 tabular">{fmtDay(x.date)}</span>
              <span className="min-w-0 flex-1 truncate">{x.name}</span>
              <Button size="icon-xs" variant="ghost" aria-label={`Remove ${x.name}`} onClick={async () => void (await done(await removeHolidayAction(x.date), "Removed", router))}>
                <Trash2Icon />
              </Button>
            </li>
          ))}
          {!list.length && <li className="text-muted-foreground">No holidays for {shown} yet.</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Input type="date" value={h.date} onChange={(e) => setH({ ...h, date: e.target.value })} className="w-40" aria-label="Holiday date" />
          <Input value={h.name} onChange={(e) => setH({ ...h, name: e.target.value })} placeholder="Eid al-Fitr" className="min-w-40 flex-1" aria-label="Holiday name" />
          <Button size="sm" variant="outline" disabled={!h.date || !h.name.trim()} onClick={async () => {
            if (await done(await addHolidayAction(h.date, h.name), "Holiday added", router)) setH({ date: "", name: "" });
          }}>
            <PlusIcon /> Add
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
