"use client";

// Phase 12c: a department's presentation for a meeting or an office screen. Each slide has a plain sentence of
// what it says (fixed rules), why, and the next action. Arrows or space move on; Play cycles by itself; Notes show
// the speaker notes; Slides chooses which to show (kept on this computer). Transitions respect "reduce motion".

import * as React from "react";
import Link from "next/link";
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ExpandIcon, ListChecksIcon, NotebookTextIcon, PauseIcon, PlayIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BarsChart, LinesChart } from "@/components/app/charts";
import { CAT } from "@/lib/chart-colors";
import type { PresentData } from "@/server/present";
import { cn } from "@/lib/utils";

type Slide = { key: string; title: string; body: React.ReactNode; say: string; why?: string; next?: string; note: string };
const HEALTH: Record<string, string> = { on_track: "On track", at_risk: "At risk", late: "Late" };

function Big({ label, value, tone }: { label: string; value: number; tone?: "bad" | "good" }) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <p className="text-lg text-muted-foreground">{label}</p>
      <p className={cn("text-6xl font-semibold tabular-nums", tone === "bad" && value > 0 && "text-destructive", tone === "good" && "text-emerald-600 dark:text-emerald-400")}>{value}</p>
    </div>
  );
}

export function DeptPresent({ dept, data, back }: { dept: string; data: PresentData; back: string }) {
  const all: Slide[] = [
    {
      key: "numbers",
      title: `${data.title} this week`,
      body: (
        <div className="grid gap-4 sm:grid-cols-3">
          <Big label="Open" value={data.counts.open} />
          <Big label="Finished this week" value={data.counts.done7} tone="good" />
          <Big label="Overdue" value={data.counts.overdue} tone="bad" />
          <Big label="New this week" value={data.counts.created7} />
          <Big label="In review" value={data.counts.review} />
          <Big label="Nobody on it" value={data.counts.unassigned} tone="bad" />
        </div>
      ),
      say: data.say.numbers,
      why: data.say.numbersWhy,
      next: data.say.numbersNext,
      note: "Start with the week in numbers; ask who can take the overdue and unassigned work.",
    },
    ...(data.glance && data.say.flow
      ? [
          {
            key: "flow",
            title: "The flow",
            body: (
              <div className="flex flex-wrap gap-3">
                {data.glance.map((g) => (
                  <div key={g.status} className="min-w-36 flex-1 rounded-2xl border bg-card p-4" style={{ borderTop: `6px solid ${g.color}` }}>
                    <p className="text-muted-foreground">{g.label}</p>
                    <p className="text-5xl font-semibold tabular-nums">{g.total}</p>
                    {g.late > 0 && <p className="font-medium text-destructive">{g.late} past the target</p>}
                  </div>
                ))}
              </div>
            ),
            say: data.say.flow.text,
            why: data.say.flow.why,
            next: data.say.flow.next,
            note: "Walk the stages left to right; the one holding the most is the bottleneck.",
          },
        ]
      : []),
    {
      key: "throughput",
      title: "Finished and new, week by week",
      body: <BarsChart data={data.weeks} xKey="week" series={[{ key: "done", label: "Finished", color: CAT[0]! }, { key: "created", label: "New", color: CAT[2]! }]} height={360} />,
      say: data.say.throughput,
      note: "When the new bars stay above the finished ones, the backlog grows.",
    },
    ...(data.sprint && data.say.sprint
      ? [
          {
            key: "sprint",
            title: data.sprint.name,
            body: (
              <div className="space-y-2">
                {data.sprint.goal && <p className="text-xl">Goal: {data.sprint.goal}</p>}
                <LinesChart
                  data={data.sprint.burn.days.map((d, i) => ({ day: d.slice(5), left: data.sprint!.burn.remaining[i] ?? null, ideal: data.sprint!.burn.ideal[i] ?? null }))}
                  xKey="day"
                  series={[
                    { key: "left", label: "Left", color: CAT[0]! },
                    { key: "ideal", label: "Even pace", color: CAT[3]! },
                  ]}
                  height={340}
                />
              </div>
            ),
            say: data.say.sprint,
            note: "Above the even line means behind; talk about what blocks it.",
          },
        ]
      : []),
    ...(data.projects.length && data.say.projects
      ? [
          {
            key: "projects",
            title: "Projects",
            body: (
              <ul className="space-y-3">
                {data.projects.map((p) => (
                  <li key={p.name} className="space-y-1">
                    <div className="flex items-center gap-3 text-xl">
                      <span className="flex-1">{p.name}</span>
                      <span className={cn("rounded px-2 text-base", p.health === "late" ? "bg-red-500/15 text-red-700 dark:text-red-300" : p.health === "at_risk" ? "bg-amber-500/15 text-amber-800 dark:text-amber-300" : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300")}>
                        {HEALTH[p.health] ?? p.health}
                      </span>
                      <span className="w-16 text-right tabular-nums">{p.progress}%</span>
                    </div>
                    <div className="h-2 rounded bg-muted">
                      <div className="h-2 rounded bg-primary transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${p.progress}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            ),
            say: data.say.projects,
            note: "For each late or at-risk project: a new date, more people, or less scope.",
          },
        ]
      : []),
    {
      key: "recent",
      title: "Since last time",
      body: data.recent.length ? (
        <ul className="space-y-2 text-xl">
          {data.recent.map((r) => (
            <li key={r.code}>
              <span className="font-mono text-base text-muted-foreground">{r.code}</span> {r.title}
              {r.who && <span className="text-muted-foreground"> · {r.who}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xl text-muted-foreground">Nothing finished in the last seven days.</p>
      ),
      say: data.recent.length ? `${data.recent.length} finished in the last seven days.` : "Nothing was finished in the last seven days.",
      note: "Thank the people who finished work.",
    },
  ];
  const storeKey = `myseed.present.${dept}`;
  const [chosen, setChosen] = React.useState<string[]>(() => all.map((s) => s.key));
  React.useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (Array.isArray(v) && v.length) setChosen(v);
    } catch {}
  }, [storeKey]);
  const slides = all.filter((s) => chosen.includes(s.key));
  const [i, setI] = React.useState(0);
  const [playing, setPlaying] = React.useState(false);
  const [notes, setNotes] = React.useState(false);
  const [picking, setPicking] = React.useState(false);
  const go = React.useCallback((d: number) => setI((x) => (x + d + slides.length) % Math.max(1, slides.length)), [slides.length]);
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") (e.preventDefault(), go(1));
      if (e.key === "ArrowLeft" || e.key === "PageUp") (e.preventDefault(), go(-1));
      if (e.key.toLowerCase() === "n") setNotes((x) => !x);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [go]);
  React.useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => go(1), 15000);
    return () => window.clearInterval(t);
  }, [playing, go]);
  const s = slides[Math.min(i, slides.length - 1)];
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background" data-present={dept}>
      <div className="h-1 bg-muted" aria-hidden>
        <div className="h-1 bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${((i + 1) / Math.max(1, slides.length)) * 100}%` }} />
      </div>
      <header className="flex flex-wrap items-center gap-2 px-6 py-3 text-sm">
        <Button asChild size="sm" variant="ghost">
          <Link href={back}>
            <ArrowLeftIcon /> Back
          </Link>
        </Button>
        <span className="text-muted-foreground">
          {data.title} · {data.date} · slide {Math.min(i, slides.length - 1) + 1} of {slides.length}
        </span>
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-pressed={picking} onClick={() => setPicking(!picking)}>
            <ListChecksIcon /> Slides
          </Button>
          <Button size="sm" variant="ghost" aria-pressed={notes} onClick={() => setNotes(!notes)}>
            <NotebookTextIcon /> Notes
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPlaying(!playing)}>
            {playing ? <PauseIcon /> : <PlayIcon />} {playing ? "Pause" : "Play"}
          </Button>
          <Button size="sm" variant="ghost" aria-label="Full screen" onClick={() => document.documentElement.requestFullscreen?.().catch(() => null)}>
            <ExpandIcon />
          </Button>
        </span>
      </header>
      {picking && (
        <div className="mx-6 flex flex-wrap gap-2 rounded-lg border p-2 text-sm" aria-label="Choose slides">
          {all.map((x) => (
            <label key={x.key} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={chosen.includes(x.key)}
                onChange={(e) => {
                  const next = e.target.checked ? [...chosen, x.key] : chosen.filter((k) => k !== x.key);
                  if (!next.length) return;
                  setChosen(next);
                  setI(0);
                  try {
                    localStorage.setItem(storeKey, JSON.stringify(next));
                  } catch {}
                }}
              />
              {x.title}
            </label>
          ))}
        </div>
      )}
      {s && (
        <main key={s.key} className="flex flex-1 flex-col gap-6 overflow-y-auto px-10 py-6 motion-safe:animate-in motion-safe:fade-in motion-safe:duration-500">
          <h1 className="text-4xl font-semibold">{s.title}</h1>
          <div className="flex-1">{s.body}</div>
          <div className="rounded-2xl bg-muted/50 p-4 text-xl" data-explainer>
            <p>{s.say}</p>
            {s.why && <p className="text-muted-foreground">{s.why}</p>}
            {s.next && <p className="font-medium">{s.next}</p>}
          </div>
          {notes && <p className="rounded-lg border border-dashed p-3 text-base text-muted-foreground">Notes: {s.note}</p>}
        </main>
      )}
      <footer className="flex justify-between px-6 pb-4">
        <Button variant="outline" aria-label="Previous slide" onClick={() => go(-1)}>
          <ChevronLeftIcon />
        </Button>
        <Button variant="outline" aria-label="Next slide" onClick={() => go(1)}>
          <ChevronRightIcon />
        </Button>
      </footer>
    </div>
  );
}
