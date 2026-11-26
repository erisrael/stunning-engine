"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { BellIcon, CheckSquareIcon, ChevronLeftIcon, ChevronRightIcon, CopyIcon, PlusIcon, RefreshCwIcon, Trash2Icon, UnlinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { deleteReminderAction, regenerateFeedAction, revokeFeedAction, saveReminderAction, setTaskDoneAction } from "@/app/actions/tools";
import { aiContext, type LinkRef, type ReminderView, type TaskView } from "@/lib/tools";
import { copyText, CopyAiButton, RecordPicker } from "@/components/app/tools/shared";
import { cn } from "@/lib/utils";

type Feed = { url: string; createdAt: string; expiresAt: string; lastUsedAt: string | null; expired: boolean } | null;
type Ev = { id: string; kind: "reminder" | "task"; title: string; at: string; allDay: boolean; done: boolean; link: LinkRef; src: ReminderView | TaskView };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localDay = (iso: string, allDay: boolean) => (allDay ? iso.slice(0, 10) : ymd(new Date(iso)));
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function CalendarClient({
  initialReminders,
  tasks: initialTasks,
  notes,
  feed: initialFeed,
  icsOn,
  origin,
  weekStartsOn,
  focus,
  workspace,
  who,
  aiOn,
}: {
  initialReminders: ReminderView[];
  tasks: TaskView[];
  notes: { id: string; title: string }[];
  feed: Feed;
  icsOn: boolean;
  origin: string;
  weekStartsOn: number;
  focus: string | null;
  workspace: string;
  who: string;
  aiOn: boolean;
}) {
  const [reminders, setReminders] = React.useState(initialReminders);
  const [tasks, setTasks] = React.useState(initialTasks);
  const [view, setView] = React.useState<"month" | "week">("month");
  const [cursor, setCursor] = React.useState(() => (focus && /^\d{4}-\d{2}-\d{2}$/.test(focus) ? new Date(`${focus}T12:00:00`) : new Date()));
  const [editing, setEditing] = React.useState<Partial<ReminderView> | null>(null);
  const [feed, setFeed] = React.useState(initialFeed);
  const today = ymd(new Date());

  const events: Ev[] = [
    ...reminders.map((r) => ({ id: r.id, kind: "reminder" as const, title: r.title, at: r.at, allDay: r.allDay, done: r.done, link: r.link, src: r })),
    ...tasks.filter((t) => t.dueAt).map((t) => ({ id: t.id, kind: "task" as const, title: t.title, at: t.dueAt!, allDay: true, done: t.done, link: t.link, src: t })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const byDay = new Map<string, Ev[]>();
  for (const e of events) {
    const k = localDay(e.at, e.allDay);
    byDay.set(k, [...(byDay.get(k) ?? []), e]);
  }

  // The days shown: whole weeks covering the month, or one week.
  const start = new Date(cursor);
  if (view === "month") start.setDate(1);
  start.setDate(start.getDate() - ((start.getDay() - weekStartsOn + 7) % 7));
  const count = view === "month" ? Math.ceil((new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate() + ((new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay() - weekStartsOn + 7) % 7)) / 7) * 7 : 7;
  const days = Array.from({ length: count }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const move = (n: number) => {
    const d = new Date(cursor);
    if (view === "month") d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + 7 * n);
    setCursor(d);
  };
  const upcoming = events.filter((e) => !e.done && localDay(e.at, e.allDay) >= today).slice(0, 12);
  const late = events.filter((e) => !e.done && localDay(e.at, e.allDay) < today);

  const toggle = async (e: Ev) => {
    if (e.kind === "task") {
      setTasks((all) => all.map((t) => (t.id === e.id ? { ...t, done: !t.done } : t)));
      const r = await setTaskDoneAction(e.id, !e.done);
      if (!r.ok) toast.error(r.error);
    } else {
      const r0 = e.src as ReminderView;
      setReminders((all) => all.map((r) => (r.id === e.id ? { ...r, done: !r.done } : r)));
      const r = await saveReminderAction({ ...r0, done: !r0.done });
      if (!r.ok) toast.error(r.error);
    }
  };

  const Chip = ({ e }: { e: Ev }) => (
    <button
      type="button"
      onClick={() => (e.kind === "reminder" ? setEditing(e.src as ReminderView) : (window.location.href = `/tools/notes?task=${e.id}`))}
      className={cn("flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px]", e.kind === "task" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-primary/10 text-primary", e.done && "line-through opacity-60")}
      title={e.title}
    >
      {e.kind === "task" ? <CheckSquareIcon className="size-3 shrink-0" /> : <BellIcon className="size-3 shrink-0" />}
      {!e.allDay && <span className="tabular">{timeOf(e.at)}</span>}
      <span className="truncate">{e.title}</span>
    </button>
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <Card>
        <CardContent className="space-y-3 p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" aria-label="Previous" onClick={() => move(-1)}>
              <ChevronLeftIcon />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" aria-label="Next" onClick={() => move(1)}>
              <ChevronRightIcon />
            </Button>
            <h2 className="text-base font-semibold">{view === "month" ? cursor.toLocaleDateString([], { month: "long", year: "numeric" }) : `${days[0]!.toLocaleDateString()} – ${days[6]!.toLocaleDateString()}`}</h2>
            <div className="ml-auto flex gap-1">
              {(["month", "week"] as const).map((v) => (
                <Button key={v} size="sm" variant={view === v ? "secondary" : "ghost"} onClick={() => setView(v)} className="capitalize">
                  {v}
                </Button>
              ))}
              <Button size="sm" onClick={() => setEditing({ title: "", notes: "", at: new Date(`${ymd(cursor)}T09:00:00`).toISOString(), allDay: false, done: false, link: null, noteId: null })}>
                <PlusIcon /> Reminder
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-md border bg-border text-xs">
            {days.slice(0, 7).map((d) => (
              <div key={`h${d.getDay()}`} className="bg-muted/60 px-2 py-1 text-center font-medium text-muted-foreground">
                {d.toLocaleDateString([], { weekday: "short" })}
              </div>
            ))}
            {days.map((d) => {
              const k = ymd(d);
              const list = byDay.get(k) ?? [];
              const other = view === "month" && d.getMonth() !== cursor.getMonth();
              return (
                <div
                  key={k}
                  className={cn("min-h-24 bg-background p-1", view === "week" && "min-h-64", other && "bg-muted/30 text-muted-foreground")}
                  onDoubleClick={() => setEditing({ title: "", notes: "", at: new Date(`${k}T09:00:00`).toISOString(), allDay: false, done: false, link: null, noteId: null })}
                >
                  <div className={cn("mb-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular", k === today && "bg-primary text-primary-foreground")}>{d.getDate()}</div>
                  <div className="space-y-0.5">
                    {list.slice(0, view === "week" ? 20 : 3).map((e) => (
                      <Chip key={`${e.kind}${e.id}`} e={e} />
                    ))}
                    {list.length > (view === "week" ? 20 : 3) && <p className="px-1 text-[11px] text-muted-foreground">+{list.length - (view === "week" ? 20 : 3)} more</p>}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">Double-click a day to add a reminder. Tasks come from Notes &amp; Checklists when they have a due date.</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {late.length > 0 && (
          <Card className="border-destructive/40">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-destructive">Overdue ({late.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {late.slice(0, 10).map((e) => (
                <AgendaRow key={`${e.kind}${e.id}`} e={e} onToggle={() => toggle(e)} />
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">Upcoming</CardTitle>
            {aiOn && <CopyAiButton label="Copy for AI" build={(ask) => aiContext({ workspace, who, notes: [], tasks: tasks.filter((t) => !t.done), reminders: reminders.filter((r) => !r.done), ask })} />}
          </CardHeader>
          <CardContent className="space-y-1">
            {upcoming.map((e) => (
              <AgendaRow key={`${e.kind}${e.id}`} e={e} onToggle={() => toggle(e)} />
            ))}
            {!upcoming.length && <p className="text-sm text-muted-foreground">Nothing coming up.</p>}
          </CardContent>
        </Card>
        {icsOn && <FeedCard feed={feed} setFeed={setFeed} origin={origin} />}
      </div>

      {editing && (
        <ReminderDialog
          value={editing}
          notes={notes}
          onClose={() => setEditing(null)}
          onSaved={(r) => {
            setReminders((all) => [...all.filter((x) => x.id !== r.id), r]);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setReminders((all) => all.filter((x) => x.id !== id));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function AgendaRow({ e, onToggle }: { e: Ev; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox checked={e.done} onCheckedChange={onToggle} aria-label={`Done: ${e.title}`} />
      {e.kind === "task" ? <CheckSquareIcon className="size-3.5 shrink-0 text-amber-600" /> : <BellIcon className="size-3.5 shrink-0 text-primary" />}
      <span className="min-w-0 flex-1 truncate">{e.title}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular">{e.allDay ? e.at.slice(5, 10) : new Date(e.at).toLocaleString([], { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
    </div>
  );
}

function ReminderDialog({ value, notes, onClose, onSaved, onDeleted }: { value: Partial<ReminderView>; notes: { id: string; title: string }[]; onClose: () => void; onSaved: (r: ReminderView) => void; onDeleted: (id: string) => void }) {
  const [v, setV] = React.useState(value);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{v.id ? "Reminder" : "New reminder"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input autoFocus value={v.title ?? ""} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="What to remember" aria-label="Title" />
          <div className="flex flex-wrap items-center gap-3">
            {v.allDay ? (
              <Input type="date" value={(v.at ?? "").slice(0, 10)} onChange={(e) => setV({ ...v, at: `${e.target.value}T00:00:00.000Z` })} className="w-44" aria-label="Day" />
            ) : (
              <Input type="datetime-local" value={v.at ? toLocalInput(v.at) : ""} onChange={(e) => setV({ ...v, at: new Date(e.target.value).toISOString() })} className="w-56" aria-label="When" />
            )}
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={!!v.allDay}
                onCheckedChange={(c) => {
                  const day = v.at ? ymd(new Date(v.at)) : ymd(new Date());
                  setV({ ...v, allDay: !!c, at: c ? `${day}T00:00:00.000Z` : new Date(`${day}T09:00:00`).toISOString() });
                }}
              />
              All day
            </label>
          </div>
          <Textarea value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} placeholder="Notes" rows={3} />
          <div className="flex flex-wrap items-center gap-2">
            {notes.length > 0 && (
              <Select value={v.noteId ?? "none"} onValueChange={(x) => setV({ ...v, noteId: x === "none" ? null : x })}>
                <SelectTrigger className="h-8 w-52 text-xs" aria-label="Note">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No note</SelectItem>
                  {notes.map((n) => (
                    <SelectItem key={n.id} value={n.id}>
                      {n.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <RecordPicker value={v.link ?? null} onChange={(link) => setV({ ...v, link })} />
            {v.noteId && (
              <Link href={`/tools/notes?note=${v.noteId}`} className="text-xs underline">
                Open note
              </Link>
            )}
          </div>
        </div>
        <DialogFooter>
          {v.id && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                const r = await deleteReminderAction(v.id!);
                if (!r.ok) return toast.error(r.error);
                onDeleted(v.id!);
              }}
            >
              <Trash2Icon /> Delete
            </Button>
          )}
          <Button
            disabled={busy || !v.title?.trim() || !v.at}
            onClick={async () => {
              setBusy(true);
              const input = { id: v.id, title: v.title!, notes: v.notes ?? "", at: v.at!, allDay: !!v.allDay, done: !!v.done, noteId: v.noteId ?? null, link: v.link ?? null };
              const r = await saveReminderAction(input);
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              onSaved({ id: r.data as string, title: input.title, notes: input.notes, at: input.at, allDay: input.allDay, done: input.done, noteId: input.noteId, taskId: null, link: input.link });
              toast.success("Reminder saved");
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FeedCard({ feed, setFeed, origin }: { feed: Feed; setFeed: (f: Feed) => void; origin: string }) {
  const [busy, setBusy] = React.useState(false);
  const make = async () => {
    if (feed && !confirm("Make a new link? The current one stops working at once, so calendars using it must subscribe again.")) return;
    setBusy(true);
    const r = await regenerateFeedAction();
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    const now = new Date();
    setFeed({ url: `${origin}/calendar/feed/${r.data as string}.ics`, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + 365 * 864e5).toISOString(), lastUsedAt: null, expired: false });
    toast.success("New private calendar link ready");
  };
  const webcal = feed?.url.replace(/^https?:/, "webcal:");
  return (
    <Card id="subscribe">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Subscribe in your calendar</CardTitle>
        <CardDescription className="text-xs">A private link only you should know. Anyone with it can read your reminders, so make a new one if it was shared by mistake.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {feed ? (
          <>
            <div className="flex gap-1">
              <Input readOnly value={feed.url} className="h-8 font-mono text-xs" aria-label="Private calendar link" onFocus={(e) => e.currentTarget.select()} />
              <Button size="icon" variant="outline" className="size-8" aria-label="Copy link" onClick={() => copyText(feed.url, "Link copied")}>
                <CopyIcon />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {feed.expired ? "Expired: make a new link." : `Works until ${new Date(feed.expiresAt).toLocaleDateString()}.`} {feed.lastUsedAt ? `Last read ${new Date(feed.lastUsedAt).toLocaleString()}.` : "Not read by a calendar yet."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal!)}`} target="_blank" rel="noopener noreferrer">
                  Google Calendar
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feed.url)}&name=${encodeURIComponent("Myseed reminders")}`} target="_blank" rel="noopener noreferrer">
                  Outlook
                </a>
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={webcal}>Apple Calendar</a>
              </Button>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Other calendars</summary>
              <p className="mt-1">Add a calendar &ldquo;from URL&rdquo; (or &ldquo;subscribe&rdquo;) and paste the link. Calendars refresh it on their own schedule, from every few minutes (Apple) to several hours (Google).</p>
            </details>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={busy} onClick={make}>
                <RefreshCwIcon /> New link
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={async () => {
                  if (!confirm("Turn the link off? Calendars using it stop updating.")) return;
                  const r = await revokeFeedAction();
                  if (!r.ok) return toast.error(r.error);
                  setFeed(null);
                }}
              >
                <UnlinkIcon /> Turn off
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" disabled={busy} onClick={make}>
            Make my private calendar link
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
