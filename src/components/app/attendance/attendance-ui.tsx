"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import QRCode from "qrcode";
import { AlertTriangleIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, CopyIcon, DownloadIcon, Loader2Icon, LogInIcon, LogOutIcon, MapPinIcon, PlusIcon, PrinterIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/app/primitives";
import { StatusPill, type Tone } from "@/components/app/status-pill";
import * as A from "@/app/actions/attendance";
import { FaceEnroll } from "./face-enroll";
import {
  ACTION_LABELS,
  CORRECTION_STATUS_LABELS,
  DAY_STATUS_LABELS,
  MARK_STATUSES,
  SOURCE_LABELS,
  fmtHours,
  fmtMin,
  stateAfter,
  toggleKind,
  type AttendanceConfig,
  type EventKind,
  type CorrectionStatus,
  type DayResult,
  type DayStatus,
  type MarkStatus,
  type MonthTotals,
  type Shift,
} from "@/lib/attendance";
import type { BoardRow, CorrectionRow, EventRow, TimesheetRow } from "@/server/attendance";
import { cn } from "@/lib/utils";

type Result = { ok: boolean; error?: string; data?: unknown };

function useAct() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const act = async <T,>(fn: () => Promise<Result>, done?: string): Promise<T | null> => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error ?? "Something went wrong.");
      return null;
    }
    if (done) toast.success(done);
    router.refresh();
    return (r.data ?? true) as T;
  };
  return { act, busy };
}

const TONE: Record<DayStatus, Tone> = { present: "done", late: "paused", half_day: "queued", absent: "blocked", leave: "scheduled", holiday: "neutral", off: "neutral", not_in: "queued" };
export const DayPill = ({ status }: { status: DayStatus }) => <StatusPill tone={TONE[status]} size="xs" label={DAY_STATUS_LABELS[status]} />;
const CORR_TONE: Record<CorrectionStatus, Tone> = { pending_lead: "queued", pending_hr: "queued", approved: "done", rejected: "blocked", cancelled: "neutral" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const fmtDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const shiftMonth = (m: string, by: number) => {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y!, mo! - 1 + by, 1));
  return d.toISOString().slice(0, 7);
};
const shiftDay = (d: string, by: number) => new Date(Date.parse(`${d}T12:00:00Z`) + by * 864e5).toISOString().slice(0, 10);

function Flags({ d }: { d: DayResult }) {
  return (
    <span className="flex flex-wrap gap-1">
      {d.manual && <Badge variant="secondary">{d.reviewed ? "Hand-made" : "Hand-made, HR to review"}</Badge>}
      {d.missingOut && <Badge variant="destructive">No check-out</Badge>}
      {d.onBreak && <Badge variant="outline">{d.onBreak === "lunch" ? "At lunch now" : "On a break now"}</Badge>}
      {d.missingReturn && <Badge variant="destructive">Did not come back from {d.lunchMin ? "lunch" : "a break"}</Badge>}
      {d.breakOverMin > 0 && <Badge variant="outline">Breaks over by {d.breakOverMin} min</Badge>}
      {d.leaveLabel && d.status !== "leave" && <Badge variant="outline">{d.leaveLabel}</Badge>}
    </span>
  );
}

export function AttTabs({ tab, tabs }: { tab: string; tabs: { key: string; label: string; badge?: number }[] }) {
  return (
    <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1 sm:w-fit" aria-label="Attendance sections">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.key === "me" ? "/attendance" : `/attendance?tab=${t.key}`}
          className={cn("rounded-md px-3 py-1.5 text-sm font-medium", tab === t.key ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}
          aria-current={tab === t.key ? "page" : undefined}
        >
          {t.label}
          {!!t.badge && <span className="ml-1.5 rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground tabular-nums">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// My attendance
// ---------------------------------------------------------------------------

type MyData = {
  employeeId: string | null;
  cfg: AttendanceConfig;
  today: DayResult | null;
  events: EventRow[];
  days: DayResult[];
  totals: MonthTotals | null;
  shift: Shift | null;
  code: string | null;
  hasPin: boolean;
  face: { enrolledAt: string; samples: number } | null;
  corrections: CorrectionRow[];
};

function Tile({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function MyAttendance({ data, month, today }: { data: MyData; month: string; today: string }) {
  const { act, busy } = useAct();
  const [pin, setPin] = React.useState("");
  const [correcting, setCorrecting] = React.useState<{ day: string; inTime: string; outTime: string; reason: string } | null>(null);
  const canSelf = data.cfg.methods.web || data.cfg.methods.mobile;
  const last = data.events.at(-1);
  // One button: it ends a break or lunch, else checks in or out.
  const nextKind = toggleKind(stateAfter(last?.kind));
  const isIn = nextKind !== "in";

  const check = async () => {
    let loc: { lat: number; lng: number; accuracy: number } | null = null;
    const wantsLoc = data.cfg.methods.mobile && data.cfg.site.lat !== null;
    if (wantsLoc && "geolocation" in navigator) {
      loc = await new Promise((resolve) =>
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        ),
      );
    }
    const r = await act<{ kind: EventKind; repeat: boolean; line: DayResult | null }>(() => A.punchAction(loc ?? {}));
    if (r)
      toast.success(
        r.repeat ? "Already recorded a moment ago" : r.kind === "in" ? `Checked in${r.line?.lateMin ? `, ${r.line.lateMin} min late` : ""}` : r.kind === "out" ? "Checked out. See you tomorrow." : ACTION_LABELS[r.kind].done,
      );
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>
              {data.shift ? `${data.shift.label}. Check in from ${data.shift.start}; ${data.shift.graceMin} minutes' grace.` : ""}
            </CardDescription>
            {data.today && (
              <CardAction>
                <DayPill status={data.today.status} />
              </CardAction>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-6">
              <div>
                <p className="text-xs text-muted-foreground">In</p>
                <p className="text-3xl font-semibold tabular-nums">{fmtMin(data.today?.firstIn)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Out</p>
                <p className="text-3xl font-semibold tabular-nums">{fmtMin(data.today?.lastOut)}</p>
              </div>
              {!!data.today?.lateMin && <p className="text-sm text-[var(--st-paused-fg)]">{data.today.lateMin} min late</p>}
              {canSelf && (
                <Button size="lg" className="ml-auto" disabled={busy} onClick={check}>
                  {busy ? <Loader2Icon className="animate-spin" /> : isIn ? <LogOutIcon /> : <LogInIcon />} {ACTION_LABELS[nextKind].button}
                </Button>
              )}
            </div>
            {!canSelf && <p className="text-sm text-muted-foreground">Check in and out at the kiosk at the entrance with your badge, or your number and PIN.</p>}
            {canSelf && !data.cfg.methods.web && (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPinIcon className="size-3.5" /> From your phone, at {data.cfg.site.label} only. Your location is checked once, when you press the button.
              </p>
            )}
            {data.events.length > 0 && (
              <ul className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {data.events.map((e) => (
                  <li key={e.id} className="rounded border px-2 py-1">
                    {ACTION_LABELS[e.kind]?.done ?? e.kind} {fmtMin(e.minutes)} · {SOURCE_LABELS[e.source]}
                    {e.flagState === "pending" && " · HR to review"}
                    {e.offline && " · saved offline"}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Kiosk sign-in</CardTitle>
            <CardDescription>At the kiosk, scan your badge, or type your number and PIN.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm">
              Your number: <span className="font-mono text-base font-semibold">{data.code}</span>
            </p>
            <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => (e.preventDefault(), void act(() => A.setOwnPinAction(pin), "PIN saved").then((ok) => ok && setPin("")))}>
              <div className="space-y-1.5">
                <Label htmlFor="att-pin">{data.hasPin ? "Change your PIN" : "Set a PIN"}</Label>
                <Input id="att-pin" inputMode="numeric" autoComplete="new-password" type="password" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="4 to 6 digits" className="w-40" />
              </div>
              <Button type="submit" variant="outline" disabled={busy || pin.length < 4}>
                Save PIN
              </Button>
            </form>
            <p className="text-xs text-muted-foreground">{data.hasPin ? "A PIN is set." : "No PIN yet."} Never share it; it records your time.</p>
            {data.cfg.methods.face && (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-sm font-medium">Face check-in</p>
                {data.face ? (
                  <>
                    <p className="text-xs text-muted-foreground">On since {fmtDate(data.face.enrolledAt.slice(0, 10))}, with your consent. Only a face code is kept, encrypted; never a photo.</p>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => window.confirm("Withdraw your consent and delete your face data? You can check in with your badge or PIN.") && act(() => A.deleteFaceAction(data.employeeId!, "withdrawn"), "Face data deleted")}
                    >
                      Withdraw consent and delete
                    </Button>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Not set up. It is optional: if you want it, HR sets it up with you and your written consent.</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {data.totals && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Tile label="Days present" value={data.totals.present} />
          <Tile label="Late" value={data.totals.late} hint={data.totals.lateMin ? `${data.totals.lateMin} min in all` : undefined} />
          <Tile label="Absent" value={data.totals.absent} />
          <Tile label="On leave" value={data.totals.leave} />
          <Tile label="Hours worked" value={fmtHours(data.totals.workedMin)} />
          <Tile label="Overtime" value={fmtHours(data.totals.overtimeMin)} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>My days</CardTitle>
          <CardDescription>A wrong or missing time? Ask for a correction; your line manager approves it.</CardDescription>
          <CardAction className="flex items-center gap-1">
            <Button size="icon-sm" variant="ghost" asChild aria-label="Previous month">
              <Link href={`/attendance?month=${shiftMonth(month, -1)}`}>
                <ChevronLeftIcon />
              </Link>
            </Button>
            <span className="text-sm font-medium tabular-nums">{month}</span>
            <Button size="icon-sm" variant="ghost" asChild aria-label="Next month">
              <Link href={`/attendance?month=${shiftMonth(month, 1)}`}>
                <ChevronRightIcon />
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1.5 font-medium">Day</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">In</th>
                <th className="font-medium">Out</th>
                <th className="font-medium">Hours</th>
                <th className="font-medium">Notes</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {[...data.days].reverse().filter((d) => d.date <= today).map((d) => (
                <tr key={d.date} className="border-t">
                  <td className="py-1.5 whitespace-nowrap">{fmtDate(d.date)}</td>
                  <td>
                    <DayPill status={d.status} />
                  </td>
                  <td className="tabular-nums">{fmtMin(d.firstIn)}</td>
                  <td className="tabular-nums">{fmtMin(d.lastOut)}</td>
                  <td className="tabular-nums">{d.workedMin ? fmtHours(d.workedMin) : "-"}</td>
                  <td>
                    <Flags d={d} />
                    {d.note && <span className="text-xs text-muted-foreground">{d.note}</span>}
                  </td>
                  <td className="text-right">
                    {["present", "late", "half_day", "absent"].includes(d.status) && (
                      <Button size="xs" variant="ghost" onClick={() => setCorrecting({ day: d.date, inTime: d.firstIn !== null ? fmtMin(d.firstIn) : "", outTime: d.lastOut !== null ? fmtMin(d.lastOut) : "", reason: "" })}>
                        Correct
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.days.length && <p className="py-4 text-sm text-muted-foreground">No days in this month yet.</p>}
        </CardContent>
      </Card>

      {data.corrections.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>My corrections</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {data.corrections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="font-medium">{fmtDate(c.day)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.in_time && `in ${c.in_time}`} {c.out_time && `out ${c.out_time}`}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.reason}</span>
                  <StatusPill tone={CORR_TONE[c.status]} size="xs" label={CORRECTION_STATUS_LABELS[c.status]} />
                  {c.decision_note && <span className="text-xs text-muted-foreground">{c.decision_note}</span>}
                  {["pending_lead", "pending_hr"].includes(c.status) && (
                    <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(() => A.cancelCorrectionAction(c.id), "Cancelled")}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <details className="rounded-lg border px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">Attendance and privacy policy</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
          {data.cfg.policy
            .split("\n")
            .filter(Boolean)
            .map((l, i) => (
              <li key={i}>{l}</li>
            ))}
        </ul>
      </details>

      <Dialog open={!!correcting} onOpenChange={(o) => !o && setCorrecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Correct {correcting && fmtDate(correcting.day)}</DialogTitle>
            <DialogDescription>Give the right times. Your line manager approves it, and HR sees the trail.</DialogDescription>
          </DialogHeader>
          {correcting && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-in">Time in</Label>
                <Input id="c-in" type="time" value={correcting.inTime} onChange={(e) => setCorrecting({ ...correcting, inTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-out">Time out</Label>
                <Input id="c-out" type="time" value={correcting.outTime} onChange={(e) => setCorrecting({ ...correcting, outTime: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-why">What happened</Label>
                <Textarea id="c-why" rows={2} value={correcting.reason} onChange={(e) => setCorrecting({ ...correcting, reason: e.target.value })} placeholder="Forgot to check out" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrecting(null)}>
              Cancel
            </Button>
            <Button
              disabled={busy || !correcting?.reason.trim()}
              onClick={async () => {
                if (!correcting) return;
                const ok = await act(() => A.requestCorrectionAction({ day: correcting.day, inTime: correcting.inTime || null, outTime: correcting.outTime || null, reason: correcting.reason }), "Sent for approval");
                if (ok) setCorrecting(null);
              }}
            >
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The daily board, with a lead's day records
// ---------------------------------------------------------------------------

type Board = { day: string; rows: BoardRow[]; counts: Record<string, number>; kioskDown: { id: string; name: string; last_seen_at: string | null }[] };
type MarkForm = { ids: string[]; names: string; status: MarkStatus; inTime: string; outTime: string; note: string };

export function TeamBoard({ board, today, canManage, myId }: { board: Board; today: string; canManage: boolean; myId: string | null }) {
  const { act, busy } = useAct();
  const [q, setQ] = React.useState("");
  const [only, setOnly] = React.useState<string>("all");
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [form, setForm] = React.useState<MarkForm | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = board.rows.filter((r) => (only === "all" || r.result.status === only) && (!needle || `${r.name} ${r.code} ${r.department ?? ""}`.toLowerCase().includes(needle)));
  const markable = (r: BoardRow) => canManage || r.employeeId !== myId;
  const open = (list: BoardRow[]) =>
    setForm({
      ids: list.map((r) => r.employeeId),
      names: list.length === 1 ? list[0]!.name : `${list.length} people`,
      status: list.length === 1 && MARK_STATUSES.includes(list[0]!.result.status as MarkStatus) ? (list[0]!.result.status as MarkStatus) : "present",
      inTime: list.length === 1 && list[0]!.result.firstIn !== null ? fmtMin(list[0]!.result.firstIn) : "",
      outTime: list.length === 1 && list[0]!.result.lastOut !== null ? fmtMin(list[0]!.result.lastOut) : "",
      note: board.kioskDown.length ? "Kiosk not working" : "",
    });
  const save = async () => {
    if (!form) return;
    let ok = 0;
    for (const id of form.ids) {
      const r = await act(() => A.markDayAction({ employeeId: id, day: board.day, status: form.status, inTime: form.inTime || null, outTime: form.outTime || null, note: form.note }));
      if (!r) break;
      ok++;
    }
    if (ok === form.ids.length) {
      toast.success(`Recorded ${ok === 1 ? form.names : `${ok} people`}`);
      setForm(null);
      setPicked(new Set());
    }
  };
  const chips: [string, string][] = [
    ["all", `Everyone ${board.counts.total}`],
    ["present", `Present ${board.counts.present}`],
    ["late", `Late ${board.counts.late}`],
    ["not_in", `Not in yet ${board.counts.not_in}`],
    ["absent", `Absent ${board.counts.absent}`],
    ["leave", `On leave ${board.counts.leave}`],
    ["half_day", `Half day ${board.counts.half_day}`],
  ];

  return (
    <div className="space-y-3">
      {board.kioskDown.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-[var(--st-blocked-fg)]/40 bg-[var(--st-blocked-bg)] px-3 py-2 text-sm text-[var(--st-blocked-fg)]">
          <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
          <p>
            {board.kioskDown.map((k) => k.name).join(", ")} stopped reporting. Record your team&apos;s day by hand: tick the people and press Record. HR reviews every hand-made entry.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" asChild aria-label="Previous day">
          <Link href={`/attendance?tab=team&day=${shiftDay(board.day, -1)}`}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <span className="min-w-36 text-center text-sm font-semibold">{fmtDate(board.day)}</span>
        <Button size="icon-sm" variant="outline" asChild aria-label="Next day" disabled={board.day >= today}>
          <Link href={`/attendance?tab=team&day=${shiftDay(board.day, 1)}`} aria-disabled={board.day >= today}>
            <ChevronRightIcon />
          </Link>
        </Button>
        {board.day !== today && (
          <Button size="sm" variant="ghost" asChild>
            <Link href="/attendance?tab=team">Today</Link>
          </Button>
        )}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or department" className="h-8 w-56" aria-label="Search" />
        {picked.size > 0 && (
          <Button size="sm" className="ml-auto" onClick={() => open(board.rows.filter((r) => picked.has(r.employeeId)))}>
            Record {picked.size}
          </Button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setOnly(k)} className={cn("rounded-full border px-3 py-1 text-xs tabular-nums", only === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
            {l}
          </button>
        ))}
      </div>
      {!board.rows.length ? (
        <EmptyState title="Nobody to show" description="Your team appears here: the people who report to you, and the members of the production teams you lead." />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2">
                  <Checkbox
                    aria-label="Select everyone shown"
                    checked={rows.length > 0 && rows.filter(markable).every((r) => picked.has(r.employeeId))}
                    onCheckedChange={(v) => setPicked(v ? new Set(rows.filter(markable).map((r) => r.employeeId)) : new Set())}
                  />
                </th>
                <th className="font-medium">Person</th>
                <th className="font-medium">Status</th>
                <th className="font-medium">In</th>
                <th className="font-medium">Out</th>
                <th className="font-medium">Hours</th>
                <th className="font-medium">How</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-t">
                  <td className="px-2 py-1.5">
                    {markable(r) && (
                      <Checkbox
                        aria-label={`Select ${r.name}`}
                        checked={picked.has(r.employeeId)}
                        onCheckedChange={(v) => setPicked((p) => (v ? new Set(p.add(r.employeeId)) : (p.delete(r.employeeId), new Set(p))))}
                      />
                    )}
                  </td>
                  <td className="py-1.5">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.code}
                      {r.department ? ` · ${r.department}` : ""} · {r.shift}
                    </p>
                  </td>
                  <td>
                    <div className="flex flex-col items-start gap-1">
                      <DayPill status={r.result.status} />
                      {!!r.result.lateMin && <span className="text-[11px] text-muted-foreground">{r.result.lateMin} min late</span>}
                    </div>
                  </td>
                  <td className="tabular-nums">{fmtMin(r.result.firstIn)}</td>
                  <td className="tabular-nums">{fmtMin(r.result.lastOut)}</td>
                  <td className="tabular-nums">{r.result.workedMin ? fmtHours(r.result.workedMin) : "-"}</td>
                  <td className="text-xs text-muted-foreground">
                    {[...new Set(r.events.map((e) => SOURCE_LABELS[e.source] + (e.offline ? " (offline)" : "")))].join(", ")}
                    <Flags d={r.result} />
                    {r.result.note && <p>{r.result.note}</p>}
                  </td>
                  <td className="pr-2 text-right whitespace-nowrap">
                    {markable(r) && (
                      <Button size="xs" variant="outline" onClick={() => open([r])}>
                        Record
                      </Button>
                    )}
                    {r.result.manual && markable(r) && (
                      <Button size="icon-xs" variant="ghost" aria-label={`Remove the hand-made record for ${r.name}`} onClick={() => act(() => A.clearMarkAction(r.employeeId, board.day), "Removed")}>
                        <Trash2Icon />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record the day for {form?.names}</DialogTitle>
            <DialogDescription>{fmtDate(board.day)}. Labelled as hand-made; HR reviews it and the person is told.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Status</Label>
                <div className="flex flex-wrap gap-1.5">
                  {MARK_STATUSES.map((s) => (
                    <button key={s} type="button" onClick={() => setForm({ ...form, status: s })} className={cn("rounded-md border px-3 py-1.5 text-sm", form.status === s ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                      {DAY_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>
              {form.status !== "absent" && form.status !== "leave" && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-in">Time in (optional)</Label>
                    <Input id="m-in" type="time" value={form.inTime} onChange={(e) => setForm({ ...form, inTime: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="m-out">Time out (optional)</Label>
                    <Input id="m-out" type="time" value={form.outTime} onChange={(e) => setForm({ ...form, outTime: e.target.value })} />
                  </div>
                </>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="m-note">Reason</Label>
                <Input id="m-note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Kiosk not working; called in sick; on location shoot" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !form?.note.trim()} onClick={save}>
              {busy && <Loader2Icon className="animate-spin" />} Record
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Corrections to decide, HR's review of hand-made days, timesheets
// ---------------------------------------------------------------------------

export function CorrectionsPanel({ toDecide, recent, canManage }: { toDecide: CorrectionRow[]; recent: CorrectionRow[]; canManage: boolean }) {
  const { act, busy } = useAct();
  const [notes, setNotes] = React.useState<Record<string, string>>({});
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>To decide</CardTitle>
          <CardDescription>Approving replaces that day&apos;s time in or out; the old times stay in the history.</CardDescription>
        </CardHeader>
        <CardContent>
          {!toDecide.length ? (
            <p className="text-sm text-muted-foreground">Nothing waiting.</p>
          ) : (
            <ul className="divide-y">
              {toDecide.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 py-2.5 text-sm">
                  <span className="font-medium">{c.full_name}</span>
                  <span>{fmtDate(c.day)}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {c.in_time && `in ${c.in_time}`} {c.out_time && `out ${c.out_time}`}
                  </span>
                  <span className="min-w-0 flex-1">{c.reason}</span>
                  <StatusPill tone={CORR_TONE[c.status]} size="xs" label={CORRECTION_STATUS_LABELS[c.status]} />
                  <Input value={notes[c.id] ?? ""} onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })} placeholder="Note (needed to refuse)" className="h-8 w-48" aria-label={`Note for ${c.full_name}`} />
                  <Button size="sm" disabled={busy} onClick={() => act(() => A.decideCorrectionAction(c.id, { decision: "approve", note: notes[c.id] || null }), "Approved")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" disabled={busy || !notes[c.id]?.trim()} onClick={() => act(() => A.decideCorrectionAction(c.id, { decision: "reject", note: notes[c.id] }), "Not approved")}>
                    Refuse
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>All corrections</CardTitle>
            <CardDescription>The trail of every correction asked for, with who decided and when.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 font-medium">Person</th>
                  <th className="font-medium">Day</th>
                  <th className="font-medium">Asked for</th>
                  <th className="font-medium">Reason</th>
                  <th className="font-medium">Status</th>
                  <th className="font-medium">Decided by</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="py-1.5">{c.full_name}</td>
                    <td>{fmtDate(c.day)}</td>
                    <td className="tabular-nums">
                      {c.in_time && `in ${c.in_time}`} {c.out_time && `out ${c.out_time}`}
                    </td>
                    <td>{c.reason}</td>
                    <td>
                      <StatusPill tone={CORR_TONE[c.status]} size="xs" label={CORRECTION_STATUS_LABELS[c.status]} />
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {c.decided_by_name ?? (c.status.startsWith("pending") ? (c.approver_name ?? "HR") : "-")}
                      {c.decision_note && `: ${c.decision_note}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!recent.length && <p className="py-3 text-sm text-muted-foreground">No corrections yet.</p>}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

type ReviewRow = { employee_id: string; day: string; status: MarkStatus; in_time: string | null; out_time: string | null; note: string | null; set_at: string; full_name: string; set_by_name: string | null };

export function ReviewPanel({ rows }: { rows: ReviewRow[] }) {
  const { act, busy } = useAct();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const key = (r: ReviewRow) => `${r.employee_id}|${r.day}`;
  const chosen = rows.filter((r) => picked.has(key(r)));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hand-made days to review</CardTitle>
        <CardDescription>Days team leads recorded by hand. Check them; change any that are wrong on the Team board.</CardDescription>
        {rows.length > 0 && (
          <CardAction>
            <Button size="sm" disabled={busy} onClick={() => act(() => A.reviewMarksAction((chosen.length ? chosen : rows).map((r) => ({ employeeId: r.employee_id, day: r.day }))), "Reviewed").then(() => setPicked(new Set()))}>
              Mark {chosen.length || "all"} reviewed
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {!rows.length ? (
          <p className="text-sm text-muted-foreground">Nothing to review.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8" />
                <th className="py-1.5 font-medium">Person</th>
                <th className="font-medium">Day</th>
                <th className="font-medium">Recorded as</th>
                <th className="font-medium">Reason</th>
                <th className="font-medium">By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={key(r)} className="border-t">
                  <td>
                    <Checkbox aria-label={`Select ${r.full_name} ${r.day}`} checked={picked.has(key(r))} onCheckedChange={(v) => setPicked((p) => (v ? new Set(p.add(key(r))) : (p.delete(key(r)), new Set(p))))} />
                  </td>
                  <td className="py-1.5">{r.full_name}</td>
                  <td>{fmtDate(r.day)}</td>
                  <td>
                    <DayPill status={r.status} />{" "}
                    <span className="tabular-nums text-xs text-muted-foreground">
                      {r.in_time ?? ""}
                      {r.out_time ? ` to ${r.out_time}` : ""}
                    </span>
                  </td>
                  <td>{r.note}</td>
                  <td className="text-xs text-muted-foreground">{r.set_by_name}</td>
                  <td className="text-right">
                    <Button size="xs" variant="ghost" asChild>
                      <Link href={`/attendance?tab=team&day=${r.day}`}>Open the day</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

export function Timesheets({ rows, month }: { rows: TimesheetRow[]; month: string }) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.name} ${r.code} ${r.department ?? ""}`.toLowerCase().includes(needle));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Timesheets</CardTitle>
        <CardDescription>Days up to today. Unpaid days and overtime are what payroll takes (Finance, Payroll, Fill from Attendance).</CardDescription>
        <CardAction className="flex items-center gap-1">
          <Button size="icon-sm" variant="ghost" asChild aria-label="Previous month">
            <Link href={`/attendance?tab=timesheets&month=${shiftMonth(month, -1)}`}>
              <ChevronLeftIcon />
            </Link>
          </Button>
          <span className="text-sm font-medium tabular-nums">{month}</span>
          <Button size="icon-sm" variant="ghost" asChild aria-label="Next month">
            <Link href={`/attendance?tab=timesheets&month=${shiftMonth(month, 1)}`}>
              <ChevronRightIcon />
            </Link>
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a href={`/api/attendance?month=${month}`}>
              <DownloadIcon /> Excel
            </a>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 overflow-x-auto">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-56" aria-label="Search timesheets" />
        <table className="w-full min-w-[900px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1.5 font-medium">Person</th>
              <th className="text-right font-medium">Present</th>
              <th className="text-right font-medium">Late</th>
              <th className="text-right font-medium">Absent</th>
              <th className="text-right font-medium">Half days</th>
              <th className="text-right font-medium">Leave</th>
              <th className="text-right font-medium">Hours</th>
              <th className="text-right font-medium">Lunch and breaks</th>
              <th className="text-right font-medium">Overtime h</th>
              <th className="text-right font-medium">Unpaid days</th>
              <th className="text-right font-medium">No check-out</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {shown.map((r) => (
              <tr key={r.employeeId} className="border-t">
                <td className="py-1.5">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.code}
                    {r.department ? ` · ${r.department}` : ""}
                  </p>
                </td>
                <td className="text-right">{r.totals.present}</td>
                <td className="text-right">
                  {r.totals.late}
                  {r.totals.lateMin ? <span className="text-xs text-muted-foreground"> ({r.totals.lateMin} min)</span> : null}
                </td>
                <td className="text-right">{r.totals.absent}</td>
                <td className="text-right">{r.totals.halfDays}</td>
                <td className="text-right">{r.totals.leave}</td>
                <td className="text-right">{fmtHours(r.totals.workedMin)}</td>
                <td className="text-right" title={`Lunch ${fmtHours(r.totals.lunchMin)}, breaks ${fmtHours(r.totals.breakMin)}`}>
                  {r.totals.lunchMin + r.totals.breakMin ? fmtHours(r.totals.lunchMin + r.totals.breakMin) : "-"}
                  {r.totals.breakOverMin > 0 && <span className="block text-xs text-[var(--st-paused-fg)]">over by {r.totals.breakOverMin} min</span>}
                </td>
                <td className="text-right">{r.overtimeHours}</td>
                <td className="text-right">{r.unpaidDays}</td>
                <td className="text-right">{r.totals.missingOut || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!shown.length && <p className="text-sm text-muted-foreground">Nobody to show.</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Setup (HR): rules, shifts, people, kiosks
// ---------------------------------------------------------------------------

type PersonSetup = { id: string; code: string; name: string; department: string | null; shift: string; rota: string[] | null; hasPin: boolean; badge: string | null; face: boolean };
type KioskInfo = { id: string; name: string; active: boolean; lastSeenAt: string | null; paired: boolean; setupExpires: string | null; createdAt: string };

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5 border-b py-3 last:border-0 sm:grid-cols-[260px_1fr] sm:items-center sm:gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  );
}

// HR's half of the setup: shifts, breaks and rules, and people (shifts, rotas, PINs, badges, faces). How people
// check in (methods, sites, posters, kiosks) is Admin's, in the Capture tab.
export function Setup({ cfg, people }: { cfg: AttendanceConfig; people: PersonSetup[] }) {
  return (
    <div className="space-y-4">
      <Rules cfg={cfg} />
      <People cfg={cfg} people={people} />
    </div>
  );
}

function Rules({ cfg }: { cfg: AttendanceConfig }) {
  const { act, busy } = useAct();
  const [c, setC] = React.useState(cfg);
  const setShift = (i: number, patch: Partial<Shift>) => setC({ ...c, shifts: c.shifts.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const num = (v: string) => (v === "" ? 0 : Number(v));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Rules and shifts</CardTitle>
        <CardDescription>Working hours, grace, lateness and overtime. Approved leave and public holidays (Settings, Calendar) are counted automatically.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Shifts</p>
          {c.shifts.map((s, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={s.label} onChange={(e) => setShift(i, { label: e.target.value })} className="h-8 w-52" aria-label="Shift name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Start</Label>
                <Input type="time" value={s.start} onChange={(e) => setShift(i, { start: e.target.value })} className="h-8 w-28" aria-label="Start" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End{s.end && s.start && s.end <= s.start ? " (next day)" : ""}</Label>
                <Input type="time" value={s.end} onChange={(e) => setShift(i, { end: e.target.value })} className="h-8 w-28" aria-label="End" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grace min</Label>
                <Input type="number" min={0} value={s.graceMin} onChange={(e) => setShift(i, { graceMin: num(e.target.value) })} className="h-8 w-20" aria-label="Grace minutes" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Break min</Label>
                <Input type="number" min={0} value={s.breakMin} onChange={(e) => setShift(i, { breakMin: num(e.target.value) })} className="h-8 w-20" aria-label="Break minutes" />
              </div>
              <div className="flex gap-1" role="group" aria-label="Working days">
                {DAYS.map((d, n) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={s.workdays.includes(n)}
                    onClick={() => setShift(i, { workdays: s.workdays.includes(n) ? s.workdays.filter((x) => x !== n) : [...s.workdays, n].sort() })}
                    className={cn("h-8 rounded-md border px-2 text-xs", s.workdays.includes(n) ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}
                  >
                    {d}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1.5 text-xs">
                <input type="radio" name="default-shift" checked={c.defaultShift === s.key} onChange={() => setC({ ...c, defaultShift: s.key })} /> Default
              </label>
              <Button size="icon-sm" variant="ghost" aria-label="Remove shift" disabled={c.shifts.length === 1} onClick={() => setC({ ...c, shifts: c.shifts.filter((_, j) => j !== i) })}>
                <Trash2Icon />
              </Button>
              <div className="flex w-full flex-wrap items-end gap-2 border-t pt-2">
                <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                  <Checkbox checked={!!s.lunch} onCheckedChange={(v) => setShift(i, { lunch: v === true ? { from: "12:00", to: "14:00", minutes: 60 } : null })} /> Lunch
                </label>
                {s.lunch && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-xs">Lunch from</Label>
                      <Input type="time" value={s.lunch.from} onChange={(e) => setShift(i, { lunch: { ...s.lunch!, from: e.target.value } })} className="h-8 w-28" aria-label="Lunch window from" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">to</Label>
                      <Input type="time" value={s.lunch.to} onChange={(e) => setShift(i, { lunch: { ...s.lunch!, to: e.target.value } })} className="h-8 w-28" aria-label="Lunch window to" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Lunch min</Label>
                      <Input type="number" min={0} value={s.lunch.minutes} onChange={(e) => setShift(i, { lunch: { ...s.lunch!, minutes: num(e.target.value) } })} className="h-8 w-20" aria-label="Lunch minutes" />
                    </div>
                  </>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Short breaks</Label>
                  <Input type="number" min={0} value={s.shortBreaks?.count ?? 0} onChange={(e) => setShift(i, { shortBreaks: { minutes: 15, paid: true, ...s.shortBreaks, count: num(e.target.value) } })} className="h-8 w-20" aria-label="Short breaks a day" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">of min</Label>
                  <Input type="number" min={0} value={s.shortBreaks?.minutes ?? 15} onChange={(e) => setShift(i, { shortBreaks: { count: 0, paid: true, ...s.shortBreaks, minutes: num(e.target.value) } })} className="h-8 w-20" aria-label="Short break minutes" />
                </div>
                <label className="flex items-center gap-1.5 pb-1.5 text-xs">
                  <Checkbox checked={s.shortBreaks?.paid ?? true} onCheckedChange={(v) => setShift(i, { shortBreaks: { count: 0, minutes: 15, ...s.shortBreaks, paid: v === true } })} /> Breaks paid
                </label>
                <p className="pb-1.5 text-xs text-muted-foreground">When people record breaks and lunch, the real times count instead of the fixed break.</p>
              </div>
            </div>
          ))}
          <Button size="sm" variant="outline" onClick={() => setC({ ...c, shifts: [...c.shifts, { key: `shift_${Date.now().toString(36)}`, label: "New shift", start: "09:00", end: "18:00", graceMin: 15, breakMin: 60, workdays: [1, 2, 3, 4, 5] }] })}>
            <PlusIcon /> Add shift
          </Button>
        </div>
        <div>
          <Row label="Count attendance from" hint="Days before this are not counted, so nobody is absent before attendance started. Empty: from the first check-in.">
            <Input type="date" value={c.startDate ?? ""} onChange={(e) => setC({ ...c, startDate: e.target.value || null })} className="w-44" aria-label="Count attendance from" />
          </Row>
          <Row label="Leaving early" hint="Minutes before the end that count as leaving early.">
            <Input type="number" min={0} value={c.earlyLeaveMin} onChange={(e) => setC({ ...c, earlyLeaveMin: num(e.target.value) })} className="w-24" aria-label="Leaving early minutes" />
          </Row>
          <Row label="Overtime starts" hint="Minutes after the end of the shift before overtime counts. Work on days off and holidays is all overtime.">
            <Input type="number" min={0} value={c.overtimeAfterMin} onChange={(e) => setC({ ...c, overtimeAfterMin: num(e.target.value) })} className="w-24" aria-label="Overtime after minutes" />
          </Row>
          <Row label="Half day" hint="Fewer hours worked than this is a half day.">
            <Input type="number" min={1} step="0.5" value={c.halfDayHours} onChange={(e) => setC({ ...c, halfDayHours: num(e.target.value) })} className="w-24" aria-label="Half day hours" />
          </Row>
          <Row label="Break overruns in payroll" hint="When on, unpaid minutes of lunch and breaks taken beyond the shift's allowance are deducted from pay (with the overtime and unpaid days).">
            <Switch checked={c.deductBreakOverrun} onCheckedChange={(v) => setC({ ...c, deductBreakOverrun: v })} aria-label="Deduct break overruns" />
          </Row>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="att-policy">Attendance and privacy policy</Label>
          <Textarea id="att-policy" rows={7} value={c.policy} onChange={(e) => setC({ ...c, policy: e.target.value })} />
          <p className="text-xs text-muted-foreground">Shown to everyone on their Attendance page. One point per line.</p>
        </div>
        <Button
          disabled={busy}
          onClick={() =>
            act(
              () =>
                A.saveAttendanceConfigAction({
                  shifts: c.shifts,
                  defaultShift: c.defaultShift,
                  startDate: c.startDate,
                  earlyLeaveMin: c.earlyLeaveMin,
                  overtimeAfterMin: c.overtimeAfterMin,
                  halfDayHours: c.halfDayHours,
                  deductBreakOverrun: c.deductBreakOverrun,
                  policy: c.policy,
                }),
              "Attendance rules saved",
            )
          }
        >
          Save
        </Button>
      </CardContent>
    </Card>
  );
}

function People({ cfg, people }: { cfg: AttendanceConfig; people: PersonSetup[] }) {
  const { act, busy } = useAct();
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [shift, setShift] = React.useState(cfg.defaultShift);
  const [q, setQ] = React.useState("");
  const [shownPin, setShownPin] = React.useState<{ name: string; pin: string } | null>(null);
  const [rota, setRota] = React.useState<{ keys: string[]; start: string } | null>(null);
  const needle = q.trim().toLowerCase();
  const rows = people.filter((p) => !needle || `${p.name} ${p.code} ${p.department ?? ""}`.toLowerCase().includes(needle));
  const ids = [...picked];
  const label = (k: string) => cfg.shifts.find((s) => s.key === k)?.label ?? k;
  return (
    <Card>
      <CardHeader>
        <CardTitle>People, shifts and badges</CardTitle>
        <CardDescription>Put people on a shift, print badges (a QR code each) and set starting PINs. Everyone can change their own PIN on their Attendance page.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="h-8 w-48" aria-label="Search people" />
          <span className="ml-auto text-xs text-muted-foreground">{picked.size} selected</span>
          <Select value={shift} onValueChange={setShift}>
            <SelectTrigger size="sm" className="h-8 w-56" aria-label="Shift">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {cfg.shifts.map((s) => (
                <SelectItem key={s.key} value={s.key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={busy || !ids.length} onClick={() => act(() => A.assignShiftAction(ids, shift), "Shift set")}>
            <ClockIcon /> Put on shift
          </Button>
          <Button size="sm" variant="outline" disabled={!ids.length} onClick={() => setRota({ keys: [cfg.shifts[0]!.key, cfg.shifts[1]?.key ?? cfg.shifts[0]!.key], start: new Date().toISOString().slice(0, 10) })}>
            Rota
          </Button>
          <Button size="sm" variant="outline" disabled={busy || !ids.length} onClick={() => act(() => A.newBadgesAction(ids), "New badges made; print them")}>
            New badges
          </Button>
          <Button size="sm" variant="outline" disabled={!ids.length} asChild>
            <a href={`/attendance/badges?ids=${ids.join(",")}`} target="_blank" rel="noreferrer">
              <PrinterIcon /> Print badges
            </a>
          </Button>
        </div>
        <div className="max-h-[480px] overflow-auto rounded-lg border">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2">
                  <Checkbox aria-label="Select everyone shown" checked={rows.length > 0 && rows.every((r) => picked.has(r.id))} onCheckedChange={(v) => setPicked(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
                <th className="font-medium">Person</th>
                <th className="font-medium">Shift</th>
                <th className="font-medium">PIN</th>
                <th className="font-medium">Badge</th>
                {cfg.methods.face && <th className="font-medium">Face</th>}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-2 py-1.5">
                    <Checkbox aria-label={`Select ${p.name}`} checked={picked.has(p.id)} onCheckedChange={(v) => setPicked((s) => (v ? new Set(s.add(p.id)) : (s.delete(p.id), new Set(s))))} />
                  </td>
                  <td>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.code}
                      {p.department ? ` · ${p.department}` : ""}
                    </p>
                  </td>
                  <td className="text-xs">{p.rota?.length ? `Rota: ${p.rota.map(label).join(" / ")}` : label(p.shift)}</td>
                  <td className="text-xs">{p.hasPin ? "Set" : <span className="text-muted-foreground">None</span>}</td>
                  <td className="text-xs">{p.badge ? "Made" : <span className="text-muted-foreground">None</span>}</td>
                  {cfg.methods.face && (
                    <td className="text-xs">
                      <FaceEnroll employeeId={p.id} name={p.name} enrolled={p.face} />
                    </td>
                  )}
                  <td className="pr-2 text-right">
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        const pin = await act<string>(() => A.resetPinAction(p.id));
                        if (pin) setShownPin({ name: p.name, pin });
                      }}
                    >
                      New PIN
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      <Dialog open={!!rota} onOpenChange={(o) => !o && setRota(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rota for {ids.length} {ids.length === 1 ? "person" : "people"}</DialogTitle>
            <DialogDescription>One shift per week, repeating. Week 1 starts in the week of the date you choose.</DialogDescription>
          </DialogHeader>
          {rota && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="rota-start">Week 1 starts</Label>
                <Input id="rota-start" type="date" value={rota.start} onChange={(e) => setRota({ ...rota, start: e.target.value })} className="w-44" />
              </div>
              {rota.keys.map((k, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-16 text-sm">Week {i + 1}</span>
                  <Select value={k} onValueChange={(v) => setRota({ ...rota, keys: rota.keys.map((x, j) => (j === i ? v : x)) })}>
                    <SelectTrigger className="w-64" aria-label={`Week ${i + 1} shift`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cfg.shifts.map((s) => (
                        <SelectItem key={s.key} value={s.key}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rota.keys.length > 2 && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Remove week ${i + 1}`} onClick={() => setRota({ ...rota, keys: rota.keys.filter((_, j) => j !== i) })}>
                      <Trash2Icon />
                    </Button>
                  )}
                </div>
              ))}
              {rota.keys.length < 4 && (
                <Button size="sm" variant="outline" onClick={() => setRota({ ...rota, keys: [...rota.keys, cfg.shifts[0]!.key] })}>
                  <PlusIcon /> Add a week
                </Button>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRota(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={async () => rota && (await act(() => A.assignRotaAction(ids, rota.keys, rota.start), "Rota set")) && setRota(null)}>
              Save rota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!shownPin} onOpenChange={(o) => !o && setShownPin(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New PIN for {shownPin?.name}</DialogTitle>
            <DialogDescription>Shown once. Give it to them in person; they can change it on their Attendance page.</DialogDescription>
          </DialogHeader>
          <p className="text-center font-mono text-4xl font-semibold tracking-[0.3em]">{shownPin?.pin}</p>
          <DialogFooter>
            <Button onClick={() => setShownPin(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function SetupLink({ code, onClose }: { code: { id: string; code: string; name: string } | null; onClose: () => void }) {
  const [qr, setQr] = React.useState<string | null>(null);
  const link = code ? `${window.location.origin}/api/attendance/kiosk?setup=${code.code}` : "";
  React.useEffect(() => {
    if (link) QRCode.toDataURL(link, { margin: 1, width: 240 }).then(setQr, () => setQr(null));
  }, [link]);
  return (
    <Dialog open={!!code} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up {code?.name}</DialogTitle>
          <DialogDescription>Open this link once on the kiosk&apos;s tablet or laptop (or scan the code with it). It works for 24 hours and only once. The device then stays signed in as the kiosk, with no personal account.</DialogDescription>
        </DialogHeader>
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="Kiosk setup code" className="mx-auto size-48 rounded border bg-white p-1" />
        )}
        <div className="flex gap-2">
          <Input readOnly value={link} className="font-mono text-xs" aria-label="Setup link" onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            onClick={() =>
              navigator.clipboard.writeText(link).then(
                () => toast.success("Copied"),
                () => toast.error("Copy the link by hand."),
              )
            }
          >
            <CopyIcon /> Copy
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Kiosks({ kiosks }: { kiosks: KioskInfo[] }) {
  const { act, busy } = useAct();
  const [name, setName] = React.useState("");
  const [setup, setSetup] = React.useState<{ id: string; code: string; name: string } | null>(null);
  const ago = (iso: string | null) => {
    if (!iso) return "never";
    const m = Math.round((Date.now() - Date.parse(iso)) / 60e3);
    return m < 2 ? "just now" : m < 120 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Kiosks</CardTitle>
        <CardDescription>A tablet or laptop at the entrance, open on the kiosk page. If one stops reporting during working hours, leads and HR are told to record days by hand.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="divide-y rounded-lg border">
          {kiosks.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{k.name}</span>
              {!k.active ? <Badge variant="secondary">Off</Badge> : k.paired ? <Badge variant="outline">Set up</Badge> : <Badge variant="secondary">Waiting for setup</Badge>}
              <span className="text-xs text-muted-foreground">Last signal {ago(k.lastSeenAt)}</span>
              <span className="ml-auto flex gap-1">
                <Button
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    const r = await act<{ id: string; code: string }>(() => A.pairKioskAgainAction(k.id));
                    if (r) setSetup({ ...r, name: k.name });
                  }}
                >
                  {k.paired ? "Move to another device" : "New setup link"}
                </Button>
                <Button size="xs" variant="ghost" disabled={busy} onClick={() => act(() => A.setKioskActiveAction(k.id, !k.active), k.active ? "Switched off" : "Switched on")}>
                  {k.active ? "Switch off" : "Switch on"}
                </Button>
              </span>
            </li>
          ))}
          {!kiosks.length && <li className="px-3 py-3 text-sm text-muted-foreground">No kiosks yet.</li>}
        </ul>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await act<{ id: string; code: string }>(() => A.createKioskAction(name));
            if (r) {
              setSetup({ ...r, name });
              setName("");
            }
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Main entrance" className="w-56" aria-label="Kiosk name" />
          <Button type="submit" variant="outline" disabled={busy || !name.trim()}>
            <PlusIcon /> Add kiosk
          </Button>
        </form>
      </CardContent>
      <SetupLink code={setup} onClose={() => setSetup(null)} />
    </Card>
  );
}
