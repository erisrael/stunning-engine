"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, MaximizeIcon, PauseIcon, PlayIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { STAGE_LABELS, STAGES, type SimpleStatus, type Stage } from "@/lib/domain";
import type { StructureRow } from "@/server/structure";
import { cn } from "@/lib/utils";

type Mode = "grade" | "subject";
type Slide = { key: string; title: string; subtitle: string; body: React.ReactNode };

const DONE_WORD: Record<Stage, string> = { recording: "Recorded", editing: "Edited", uploading: "Uploaded", publication: "Published" };
const SPEEDS = [8, 15, 30, 60];
const REFRESH_MS = 60_000;

function tally(rows: StructureRow[]) {
  const out = Object.fromEntries(STAGES.map((s) => [s, { done: 0, in_process: 0, missing: 0, none: 0 }])) as Record<Stage, Record<SimpleStatus, number>>;
  for (const r of rows) for (const s of STAGES) out[s][r.stages[s]]++;
  return out;
}

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);
const partName = (r: StructureRow) => `${r.gradeName} · ${r.subjectName} · Unit ${r.unitNumber}${r.partNumber ? ` · Part ${r.partNumber}` : ""}`;
const ago = (iso: string, now: number) => {
  const d = Math.floor((now - Date.parse(iso)) / 864e5);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};

// One stacked bar: done in the stage colour, in process lighter, the rest grey.
function StageBar({ stage, t, total, big }: { stage: Stage; t: Record<SimpleStatus, number>; total: number; big?: boolean }) {
  return (
    <div className={cn("flex overflow-hidden rounded-full bg-muted", big ? "h-5" : "h-3")} title={`${STAGE_LABELS[stage]}: ${t.done} done, ${t.in_process} in process of ${total}`}>
      <div style={{ width: `${pct(t.done, total)}%`, background: `var(--stage-${stage})` }} className="transition-[width] duration-700" />
      <div style={{ width: `${pct(t.in_process, total)}%`, background: `var(--stage-${stage})`, opacity: 0.35 }} className="transition-[width] duration-700" />
    </div>
  );
}

function Overall({ rows }: { rows: StructureRow[] }) {
  const t = tally(rows);
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {STAGES.map((s) => (
        <div key={s} className="rounded-2xl border bg-card p-6">
          <div className="text-sm font-medium uppercase tracking-wide" style={{ color: `var(--stage-${s})` }}>
            {STAGE_LABELS[s]}
          </div>
          <div className="mt-2 text-6xl font-semibold tabular">{pct(t[s].done, rows.length)}%</div>
          <div className="mt-1 text-muted-foreground tabular">
            {t[s].done} of {rows.length} done · {t[s].in_process} in process
          </div>
          <div className="mt-5">
            <StageBar stage={s} t={t[s]} total={rows.length} big />
          </div>
        </div>
      ))}
    </div>
  );
}

// One grade (or subject): each subject (or grade) in it with a bar per stage.
function Group({ rows, mode }: { rows: StructureRow[]; mode: Mode }) {
  const groups = new Map<string, { name: string; sort: number; rows: StructureRow[] }>();
  for (const r of rows) {
    const [id, name, sort] = mode === "grade" ? [r.subjectId, r.subjectName, r.subjectSort] : [r.gradeId, r.gradeName, r.gradeSort];
    const g = groups.get(id) ?? { name, sort, rows: [] };
    g.rows.push(r);
    groups.set(id, g);
  }
  const list = [...groups.values()].sort((a, b) => a.sort - b.sort);
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="grid grid-cols-[minmax(8rem,14rem)_repeat(4,1fr)] gap-x-6 border-b px-6 py-3 text-sm font-medium text-muted-foreground">
        <span>{mode === "grade" ? "Subject" : "Grade"}</span>
        {STAGES.map((s) => (
          <span key={s} style={{ color: `var(--stage-${s})` }}>
            {STAGE_LABELS[s]}
          </span>
        ))}
      </div>
      {list.slice(0, 12).map((g) => {
        const t = tally(g.rows);
        return (
          <div key={g.name} className="grid grid-cols-[minmax(8rem,14rem)_repeat(4,1fr)] items-center gap-x-6 border-b px-6 py-3 last:border-b-0">
            <span className="truncate text-lg font-medium">
              {g.name} <span className="text-sm text-muted-foreground tabular">{g.rows.length}</span>
            </span>
            {STAGES.map((s) => (
              <div key={s} className="space-y-1">
                <StageBar stage={s} t={t[s]} total={g.rows.length} />
                <div className="text-xs text-muted-foreground tabular">
                  {t[s].done}/{g.rows.length}
                  {t[s].in_process ? ` · ${t[s].in_process} in process` : ""}
                </div>
              </div>
            ))}
          </div>
        );
      })}
      {list.length > 12 && <div className="px-6 py-2 text-sm text-muted-foreground">and {list.length - 12} more</div>}
    </div>
  );
}

function Recent({ rows, now }: { rows: StructureRow[]; now: number }) {
  const done = rows
    .flatMap((r) => STAGES.filter((s) => r.stages[s] === "done" && r.dates[s]).map((s) => ({ r, s, at: r.dates[s]! })))
    .filter((x) => now - Date.parse(x.at) < 14 * 864e5)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 10);
  if (!done.length) return <Empty text="Nothing finished in the last two weeks." />;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {done.map((x) => (
        <li key={`${x.r.partId}-${x.s}`} className="flex items-center gap-4 px-6 py-3 text-lg">
          <span className="w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-sm font-medium" style={{ color: `var(--stage-${x.s})`, background: `var(--stage-${x.s}-bg)` }}>
            {DONE_WORD[x.s]}
          </span>
          <span className="min-w-0 flex-1 truncate">{partName(x.r)}</span>
          <span className="shrink-0 text-sm text-muted-foreground">{ago(x.at, now)}</span>
        </li>
      ))}
    </ul>
  );
}

function Next({ rows, users }: { rows: StructureRow[]; users: Record<string, string> }) {
  const going = rows
    .map((r) => ({ r, s: STAGES.find((s) => r.stages[s] === "in_process") }))
    .filter((x): x is { r: StructureRow; s: Stage } => !!x.s)
    .sort((a, b) => STAGES.indexOf(b.s) - STAGES.indexOf(a.s))
    .slice(0, 10);
  if (!going.length) return <Empty text="Nothing in process right now." />;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {going.map(({ r, s }) => (
        <li key={`${r.partId}-${s}`} className="flex items-center gap-4 px-6 py-3 text-lg">
          <span className="w-28 shrink-0 rounded-full px-2.5 py-0.5 text-center text-sm font-medium" style={{ color: `var(--stage-${s})`, background: `var(--stage-${s}-bg)` }}>
            {STAGE_LABELS[s]}
          </span>
          <span className="min-w-0 flex-1 truncate">{partName(r)}</span>
          <span className="shrink-0 truncate text-sm text-muted-foreground">{r.ownerIds.map((id) => users[id]).filter(Boolean).join(", ")}</span>
        </li>
      ))}
    </ul>
  );
}

const Empty = ({ text }: { text: string }) => <div className="rounded-2xl border bg-card p-16 text-center text-xl text-muted-foreground">{text}</div>;

// Full-screen presentation of the Overview for a wall screen or a meeting: it cycles through the whole picture,
// each grade (or subject), recent completions and what is in process, and refreshes its data while running.
export function Visualizer({ rows, mode, users, filterLabel, backHref }: { rows: StructureRow[]; mode: Mode; users: Record<string, string>; filterLabel: string; backHref: string }) {
  const router = useRouter();
  const [index, setIndex] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const [speed, setSpeed] = React.useState(15);
  const [now, setNow] = React.useState(() => Date.now());

  const slides = React.useMemo<Slide[]>(() => {
    const parts = rows.filter((r) => r.partId);
    const groups = new Map<string, { name: string; sort: number; rows: StructureRow[] }>();
    for (const r of parts) {
      const [id, name, sort] = mode === "grade" ? [r.gradeId, r.gradeName, r.gradeSort] : [r.subjectId, r.subjectName, r.subjectSort];
      const g = groups.get(id) ?? { name, sort, rows: [] };
      g.rows.push(r);
      groups.set(id, g);
    }
    return [
      { key: "all", title: "Where everything stands", subtitle: `${filterLabel} · ${parts.length} parts`, body: <Overall rows={parts} /> },
      ...[...groups.entries()]
        .sort((a, b) => a[1].sort - b[1].sort)
        .map(([id, g]) => ({ key: id, title: g.name, subtitle: `${g.rows.length} parts by ${mode === "grade" ? "subject" : "grade"}`, body: <Group rows={g.rows} mode={mode} /> })),
      { key: "recent", title: "Recently finished", subtitle: "The last two weeks", body: <Recent rows={parts} now={now} /> },
      { key: "next", title: "In process now", subtitle: "What the teams are working on", body: <Next rows={parts} users={users} /> },
    ];
  }, [rows, mode, filterLabel, users, now]);

  const count = slides.length;
  const go = React.useCallback((d: number) => setIndex((i) => (i + d + count) % count), [count]);
  const at = Math.min(index, count - 1);

  React.useEffect(() => {
    if (!playing) return;
    const t = setTimeout(() => go(1), speed * 1000);
    return () => clearTimeout(t);
  }, [playing, speed, at, go]);

  React.useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setNow(Date.now());
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, [router]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input,select,[role=combobox],[role=listbox]")) return;
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === "Escape" && !document.fullscreenElement) router.push(backHref);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, router, backHref]);

  const slide = slides[at]!;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-end justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{slide.subtitle}</div>
          <h1 className="truncate text-3xl font-semibold sm:text-4xl">{slide.title}</h1>
        </div>
        <div className="shrink-0 text-right text-sm text-muted-foreground tabular">
          {new Date(now).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          <div className="text-xs">Updates every minute</div>
        </div>
      </div>
      <div key={slide.key} className="min-h-0 flex-1 overflow-auto px-6 py-6 animate-in fade-in duration-500 sm:px-10">
        {slide.body}
      </div>
      {playing && <div key={`p${at}-${speed}`} className="h-0.5 origin-left bg-primary/60" style={{ animation: `viz-progress ${speed}s linear forwards` }} />}
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-2 sm:px-8">
        <Button size="icon-sm" variant="ghost" aria-label="Previous" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label={playing ? "Pause" : "Play"} onClick={() => setPlaying((p) => !p)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button size="icon-sm" variant="ghost" aria-label="Next" onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
        <Select value={String(speed)} onValueChange={(v) => setSpeed(Number(v))}>
          <SelectTrigger size="sm" className="w-32" aria-label="Seconds per slide">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SPEEDS.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s} seconds
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="mx-auto flex flex-wrap items-center gap-1.5">
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Go to ${s.title}`} onClick={() => setIndex(i)} className={cn("h-2 rounded-full transition-all", i === at ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30 hover:bg-muted-foreground/60")} />
          ))}
        </div>
        <Button size="icon-sm" variant="ghost" aria-label="Full screen" onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}>
          <MaximizeIcon />
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={backHref}>
            <XIcon /> Exit
          </Link>
        </Button>
      </div>
    </div>
  );
}
