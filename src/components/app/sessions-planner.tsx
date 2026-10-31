"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlusIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, Loader2Icon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { bookSessionAction, moveSessionAction, setSessionStatusAction } from "@/app/actions/sessions";
import type { Booking } from "@/server/sessions";
import { cn } from "@/lib/utils";

type Candidate = { id: string; code: string; title: string; grade: string | null; subject: string | null; unit_number: number | null; part_number: number | null; booked: string | null };
type Result = { ok: boolean; error?: string; data?: unknown };
const MIME = "application/x-myseed-session";

const local = (iso: string, tz: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
};
const addMin = (hhmm: string, min: number) => {
  const [h, m] = hhmm.split(":").map(Number);
  const t = (h! * 60 + m! + min) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
const dayLabel = (d: string) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
const shiftDays = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

export function SessionPlanner(props: {
  week: string;
  today: string;
  tz: string;
  bookings: Booking[];
  studios: string[];
  staff: { id: string; name: string }[];
  candidates: Candidate[];
  canPlan: boolean;
  me: string;
}) {
  const { week, today, tz, bookings, studios, staff, candidates, canPlan, me } = props;
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [booking, setBooking] = React.useState(false);
  const [moving, setMoving] = React.useState<{ b: Booking; date: string; time: string; room: string } | null>(null);
  const [over, setOver] = React.useState<string | null>(null);
  const days = Array.from({ length: 7 }, (_, i) => shiftDays(week, i));
  const run = async (p: Promise<Result>, done: string) => {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) return toast.error(r.error ?? "Something went wrong."), false;
    toast.success(done);
    router.refresh();
    return true;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="icon-sm" variant="outline" asChild aria-label="Previous week">
          <Link href={`/sessions?week=${shiftDays(week, -7)}`}>
            <ChevronLeftIcon />
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/sessions">This week</Link>
        </Button>
        <Button size="icon-sm" variant="outline" asChild aria-label="Next week">
          <Link href={`/sessions?week=${shiftDays(week, 7)}`}>
            <ChevronRightIcon />
          </Link>
        </Button>
        <h2 className="text-lg font-semibold">
          {dayLabel(days[0]!)} to {dayLabel(days[6]!)}
        </h2>
        {canPlan && (
          <Button className="ml-auto" onClick={() => setBooking(true)}>
            <CalendarPlusIcon /> Book a session
          </Button>
        )}
      </div>
      {canPlan && <p className="text-xs text-muted-foreground">Drag a session to another day to move it; the time stays the same.</p>}
      <div className="grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const list = bookings.filter((b) => local(b.start, tz).date === d);
          return (
            <section
              key={d}
              aria-label={dayLabel(d)}
              className={cn("min-h-40 rounded-xl border bg-muted/30 p-2", d === today && "border-primary", over === d && "bg-primary/10 ring-2 ring-primary/40")}
              onDragOver={(e) => {
                if (!canPlan || !e.dataTransfer.types.includes(MIME)) return;
                e.preventDefault();
                setOver(d);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                setOver(null);
                const raw = e.dataTransfer.getData(MIME);
                if (!raw) return;
                e.preventDefault();
                const { batchId, time } = JSON.parse(raw);
                void run(moveSessionAction(batchId, { date: d, time }), `Moved to ${dayLabel(d)}`);
              }}
            >
              <p className={cn("mb-2 text-xs font-semibold", d === today && "text-primary")}>{dayLabel(d)}</p>
              <div className="space-y-2">
                {list.map((b) => {
                  const t = local(b.start, tz);
                  const mine = b.operatorId === me;
                  return (
                    <article
                      key={b.batchId}
                      draggable={canPlan && b.status === "scheduled"}
                      onDragStart={(e) => e.dataTransfer.setData(MIME, JSON.stringify({ batchId: b.batchId, time: t.time }))}
                      className={cn("space-y-1.5 rounded-lg border bg-card p-2 text-xs shadow-xs", canPlan && b.status === "scheduled" && "cursor-grab", b.status === "completed" && "opacity-70")}
                    >
                      <p className="font-semibold tabular-nums">
                        {t.time} to {addMin(t.time, b.durationMin)}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {b.room && <Badge variant="secondary">{b.room}</Badge>}
                        {b.status === "completed" && <Badge variant="outline">Recorded</Badge>}
                      </div>
                      <p className="text-muted-foreground">
                        {b.operator ?? "No operator"}
                        {b.presenter ? ` · ${b.presenter}` : ""}
                      </p>
                      <ul className="space-y-0.5">
                        {b.items.map((it) => (
                          <li key={it.id} className="truncate" title={`${it.code} ${it.title} (${it.place})`}>
                            {it.title}
                          </li>
                        ))}
                      </ul>
                      {b.note && <p className="text-muted-foreground">{b.note}</p>}
                      {b.status === "scheduled" && (canPlan || mine) && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          <Button size="xs" variant="outline" disabled={busy} onClick={() => run(setSessionStatusAction(b.batchId, "completed"), "Marked recorded")}>
                            <CheckIcon /> Recorded
                          </Button>
                          {canPlan && (
                            <>
                              <Button size="xs" variant="ghost" onClick={() => setMoving({ b, date: t.date, time: t.time, room: b.room ?? "" })}>
                                Move
                              </Button>
                              <Button size="icon-xs" variant="ghost" aria-label="Cancel the session" disabled={busy} onClick={() => run(setSessionStatusAction(b.batchId, "cancelled"), "Cancelled")}>
                                <XIcon />
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
                {!list.length && <p className="py-2 text-center text-[11px] text-muted-foreground">Free</p>}
              </div>
            </section>
          );
        })}
      </div>

      {booking && <BookDialog onClose={() => setBooking(false)} today={today} studios={studios} staff={staff} candidates={candidates} run={run} busy={busy} />}

      <Dialog open={!!moving} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move the session</DialogTitle>
            <DialogDescription>The camera operator is told.</DialogDescription>
          </DialogHeader>
          {moving && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="mv-date">Day</Label>
                <Input id="mv-date" type="date" value={moving.date} onChange={(e) => setMoving({ ...moving, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="mv-time">Start</Label>
                <Input id="mv-time" type="time" value={moving.time} onChange={(e) => setMoving({ ...moving, time: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Studio</Label>
                <Select value={moving.room} onValueChange={(v) => setMoving({ ...moving, room: v })}>
                  <SelectTrigger aria-label="Studio">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[...new Set([...studios, moving.room].filter(Boolean))].map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoving(null)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={async () => moving && (await run(moveSessionAction(moving.b.batchId, { date: moving.date, time: moving.time, room: moving.room }), "Moved")) && setMoving(null)}>
              Move
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BookDialog({
  onClose,
  today,
  studios,
  staff,
  candidates,
  run,
  busy,
}: {
  onClose: () => void;
  today: string;
  studios: string[];
  staff: { id: string; name: string }[];
  candidates: Candidate[];
  run: (p: Promise<Result>, done: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [f, setF] = React.useState({ date: today, time: "09:00", durationMin: 120, room: studios[0] ?? "", presenter: "", operatorId: "", note: "", assign: true });
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = candidates.filter((c) => !needle || `${c.code} ${c.title} ${c.grade ?? ""} ${c.subject ?? ""}`.toLowerCase().includes(needle)).slice(0, 200);
  const place = (c: Candidate) => [c.grade, c.subject, c.unit_number != null ? `U${c.unit_number}` : null, c.part_number != null ? `P${c.part_number}` : null].filter(Boolean).join(" · ");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Book a studio session</DialogTitle>
          <DialogDescription>Choose the studio and time, who records, and the parts. A studio or operator already booked then is refused.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="b-date">Day</Label>
            <Input id="b-date" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-time">Start</Label>
            <Input id="b-time" type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-dur">Minutes</Label>
            <Input id="b-dur" type="number" min={15} step={15} value={f.durationMin} onChange={(e) => setF({ ...f, durationMin: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Studio</Label>
            <Select value={f.room} onValueChange={(v) => setF({ ...f, room: v })}>
              <SelectTrigger aria-label="Studio">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {studios.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Camera operator</Label>
            <Select value={f.operatorId} onValueChange={(v) => setF({ ...f, operatorId: v })}>
              <SelectTrigger aria-label="Camera operator">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="b-pres">Presenter (teacher)</Label>
            <Input id="b-pres" value={f.presenter} onChange={(e) => setF({ ...f, presenter: e.target.value })} placeholder="Name" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Label>Parts</Label>
            <span className="text-xs text-muted-foreground">{picked.size} chosen</span>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title, grade, subject" className="ml-auto h-8 w-64" aria-label="Search parts" />
          </div>
          <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
            {shown.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox checked={picked.has(c.id)} onCheckedChange={(v) => setPicked((p) => (v ? new Set(p.add(c.id)) : (p.delete(c.id), new Set(p))))} aria-label={c.title} />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="text-xs text-muted-foreground">{place(c)}</span>
                  {c.booked && <Badge variant="outline">Booked</Badge>}
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-3 text-xs text-muted-foreground">No parts waiting to be recorded.</li>}
          </ul>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={f.assign} onCheckedChange={(v) => setF({ ...f, assign: v === true })} /> Give unassigned parts to the camera operator
        </label>
        <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional): props, board, slides" aria-label="Note" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !picked.size || !f.room}
            onClick={async () => {
              const ok = await run(
                bookSessionAction({ date: f.date, time: f.time, durationMin: f.durationMin, room: f.room, presenter: f.presenter || null, operatorId: f.operatorId || null, itemIds: [...picked], assignToOperator: f.assign, note: f.note || null }),
                "Session booked",
              );
              if (ok) onClose();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} Book
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
