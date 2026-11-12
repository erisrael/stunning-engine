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
import { bookSessionAction, editSessionAction, moveSessionAction, setSessionStatusAction } from "@/app/actions/sessions";
import type { Booking } from "@/server/sessions";
import { cn } from "@/lib/utils";

export type Candidate = { id: string; code: string; title: string; grade: string | null; subject: string | null; unit_number: number | null; part_number: number | null; booked: string | null };
export type Result = { ok: boolean; error?: string; data?: unknown };
const MIME = "application/x-myseed-session";

export const local = (iso: string, tz: string) => {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${v("year")}-${v("month")}-${v("day")}`, time: `${v("hour")}:${v("minute")}` };
};
export const addMin = (hhmm: string, min: number) => {
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
  const [editing, setEditing] = React.useState<{ batchId: string; date: string; time: string; booking: Booking } | null>(null);
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
                              <Button size="xs" variant="ghost" onClick={() => setEditing({ batchId: b.batchId, date: t.date, time: t.time, booking: b })}>
                                Change
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

      {(booking || editing) && (
        <BookDialog
          onClose={() => (setBooking(false), setEditing(null))}
          today={today}
          studios={studios}
          staff={staff}
          candidates={candidates}
          run={run}
          busy={busy}
          edit={editing}
          presenters={[...new Set(bookings.map((x) => x.presenter).filter((x): x is string => !!x))]}
        />
      )}

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

// Booking a session, or changing one (with `edit`): day, start, length, studio, operator, presenter and the parts,
// which can be filtered by grade and subject and ticked together. The end time is shown as you go.
export function BookDialog({
  onClose,
  today,
  studios,
  staff,
  candidates,
  run,
  busy,
  edit,
  presenters = [],
}: {
  onClose: () => void;
  today: string;
  studios: string[];
  staff: { id: string; name: string }[];
  candidates: Candidate[];
  run: (p: Promise<Result>, done: string) => Promise<boolean>;
  busy: boolean;
  edit?: { batchId: string; date: string; time: string; booking: Booking } | null;
  presenters?: string[];
}) {
  const b = edit?.booking;
  const [f, setF] = React.useState({
    date: edit?.date ?? today,
    time: edit?.time ?? "09:00",
    durationMin: b?.durationMin ?? 120,
    room: b?.room ?? studios[0] ?? "",
    presenter: b?.presenter ?? "",
    operatorId: b?.operatorId ?? "",
    note: b?.note ?? "",
    assign: true,
  });
  const [picked, setPicked] = React.useState<Set<string>>(new Set(b?.items.map((i) => i.id) ?? []));
  const [q, setQ] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [onlyFree, setOnlyFree] = React.useState(false);
  // Parts already in the session stay listed even when they are no longer waiting to be recorded.
  const all: Candidate[] = [
    ...(b?.items ?? [])
      .filter((it) => !candidates.some((c) => c.id === it.id))
      .map((it) => ({ id: it.id, code: it.code, title: it.title, grade: it.place.split(" · ")[0] ?? null, subject: it.place.split(" · ")[1] ?? null, unit_number: null, part_number: null, booked: null })),
    ...candidates,
  ];
  const uniq = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
  const needle = q.trim().toLowerCase();
  const shown = all
    .filter(
      (c) =>
        (!grade || c.grade === grade) &&
        (!subject || c.subject === subject) &&
        (!onlyFree || !c.booked || picked.has(c.id)) &&
        (!needle || `${c.code} ${c.title} ${c.grade ?? ""} ${c.subject ?? ""}`.toLowerCase().includes(needle)),
    )
    .slice(0, 300);
  const place = (c: Candidate) => [c.grade, c.subject, c.unit_number != null ? `U${c.unit_number}` : null, c.part_number != null ? `P${c.part_number}` : null].filter(Boolean).join(" · ");
  const sel = "h-8 rounded-md border bg-background px-2 text-xs";
  const input = () => ({ date: f.date, time: f.time, durationMin: f.durationMin, room: f.room, presenter: f.presenter || null, operatorId: f.operatorId || null, itemIds: [...picked], assignToOperator: f.assign, note: f.note || null });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl" data-book-dialog>
        <DialogHeader>
          <DialogTitle>{edit ? "Change the studio session" : "Book a studio session"}</DialogTitle>
          <DialogDescription>Choose the studio and time, who records and presents, and the parts. A studio or operator already booked then is refused.</DialogDescription>
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
            <div className="flex gap-1">
              {[60, 120, 180, 240].map((m) => (
                <button key={m} type="button" className={cn("rounded border px-1.5 text-[10px]", f.durationMin === m ? "border-primary bg-primary/10" : "text-muted-foreground")} onClick={() => setF({ ...f, durationMin: m })}>
                  {m / 60}h
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Studio</Label>
            <Select value={f.room} onValueChange={(v) => setF({ ...f, room: v })}>
              <SelectTrigger aria-label="Studio">
                <SelectValue placeholder="Choose" />
              </SelectTrigger>
              <SelectContent>
                {[...new Set([...studios, f.room].filter(Boolean))].map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground tabular-nums">Ends {/^\d{2}:\d{2}$/.test(f.time) ? addMin(f.time, f.durationMin || 0) : "—"}</p>
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
            <Input id="b-pres" list="b-pres-list" value={f.presenter} onChange={(e) => setF({ ...f, presenter: e.target.value })} placeholder="Name" />
            <datalist id="b-pres-list">
              {presenters.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Label>Parts</Label>
            <span className="text-xs text-muted-foreground">{picked.size} chosen</span>
            <select aria-label="Grade of parts" className={sel} value={grade} onChange={(e) => (setGrade(e.target.value), setSubject(""))}>
              <option value="">Every grade</option>
              {uniq(all.map((c) => c.grade)).map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <select aria-label="Subject of parts" className={sel} value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value="">Every subject</option>
              {uniq(all.filter((c) => !grade || c.grade === grade).map((c) => c.subject)).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1 text-xs">
              <Checkbox checked={onlyFree} onCheckedChange={(v) => setOnlyFree(v === true)} /> Not booked yet
            </label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search code, title" className="ml-auto h-8 w-48" aria-label="Search parts" />
            <Button size="xs" variant="ghost" type="button" onClick={() => setPicked(new Set([...picked, ...shown.filter((c) => !picked.has(c.id)).slice(0, Math.max(0, 30 - picked.size)).map((c) => c.id)]))}>
              Tick shown
            </Button>
            {picked.size > 0 && (
              <Button size="xs" variant="ghost" type="button" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            )}
          </div>
          <ul className="max-h-60 divide-y overflow-y-auto rounded-lg border text-sm">
            {shown.map((c) => (
              <li key={c.id}>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox
                    checked={picked.has(c.id)}
                    onCheckedChange={(v) =>
                      setPicked((p) => {
                        const n = new Set(p);
                        if (v) n.add(c.id);
                        else n.delete(c.id);
                        return n;
                      })
                    }
                    aria-label={c.title}
                  />
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{c.code}</span>
                  <span className="text-xs text-muted-foreground">{place(c)}</span>
                  {c.booked && <Badge variant="outline">Booked</Badge>}
                </label>
              </li>
            ))}
            {!shown.length && <li className="px-2 py-3 text-xs text-muted-foreground">No parts waiting to be recorded match.</li>}
          </ul>
          <p className="text-[11px] text-muted-foreground">Up to 30 parts in one session.</p>
        </div>
        {!edit && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={f.assign} onCheckedChange={(v) => setF({ ...f, assign: v === true })} /> Give unassigned parts to the camera operator
          </label>
        )}
        <Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional): props, board, slides" aria-label="Note" />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !picked.size || !f.room || picked.size > 30}
            onClick={async () => {
              const ok = await run(edit ? editSessionAction(edit.batchId, input()) : bookSessionAction(input()), edit ? "Session changed" : "Session booked");
              if (ok) onClose();
            }}
          >
            {busy && <Loader2Icon className="animate-spin" />} {edit ? "Save changes" : "Book"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
