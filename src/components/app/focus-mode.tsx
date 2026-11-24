"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Minimize2Icon, PauseIcon, PlayIcon, SquareIcon, TimerIcon, Maximize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// Focus mode: set a timer and work on one thing. A calm full-screen view with the time left (or a small pill while you
// work in the app), pause and stop, and a chime and notification when the time is up. Kept in this browser, so it
// carries on across pages and reloads.
type Focus = { task: string; minutes: number; endsAt: number | null; leftMs: number; started: number; breakAfter: boolean };
const KEY = "myseed.focus";
const PRESETS = [15, 25, 45, 60, 90];

const load = (): Focus | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
};
const save = (f: Focus | null) => {
  try {
    f ? localStorage.setItem(KEY, JSON.stringify(f)) : localStorage.removeItem(KEY);
  } catch {}
};
const fmt = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.25, 0.5].forEach((t, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = [660, 880, 990][i]!;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.4);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.45);
    });
  } catch {}
}

export function FocusMode() {
  const [focus, setFocus] = React.useState<Focus | null>(null);
  const [full, setFull] = React.useState(true);
  const [setup, setSetup] = React.useState(false);
  const [task, setTask] = React.useState("");
  const [minutes, setMinutes] = React.useState(25);
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const f = load();
    if (f) {
      setFocus(f);
      setFull(false);
    }
  }, []);
  React.useEffect(() => {
    if (!focus?.endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [focus?.endsAt]);

  const left = focus ? (focus.endsAt ? focus.endsAt - now : focus.leftMs) : 0;
  React.useEffect(() => {
    if (!focus?.endsAt || left > 0) return;
    chime();
    const title = "Focus time is up";
    const body = focus.task ? `${focus.task}: ${focus.minutes} minutes done. Take a short break.` : `${focus.minutes} minutes done. Take a short break.`;
    toast.success(title, { description: body, duration: 15000 });
    try {
      if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body });
    } catch {}
    setFocus(null);
    save(null);
    setFull(false);
  }, [left, focus]);

  React.useEffect(() => {
    if (!focus || !full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, full]);

  const start = () => {
    const m = Math.min(600, Math.max(1, Math.round(minutes)));
    const f: Focus = { task: task.trim().slice(0, 140), minutes: m, endsAt: Date.now() + m * 60000, leftMs: m * 60000, started: Date.now(), breakAfter: true };
    setFocus(f);
    save(f);
    setFull(true);
    setSetup(false);
    setNow(Date.now());
    try {
      if ("Notification" in window && Notification.permission === "default") void Notification.requestPermission();
    } catch {}
  };
  const pause = () => {
    if (!focus) return;
    const f = focus.endsAt ? { ...focus, endsAt: null, leftMs: focus.endsAt - Date.now() } : { ...focus, endsAt: Date.now() + focus.leftMs };
    setFocus(f);
    save(f);
    setNow(Date.now());
  };
  const stop = () => {
    setFocus(null);
    save(null);
    setFull(false);
    toast("Focus ended");
  };

  // Phones open it from Tools (mobile-nav.tsx).
  React.useEffect(() => {
    const open = () => (focus ? setFull(true) : setSetup(true));
    window.addEventListener("myseed:focus", open);
    return () => window.removeEventListener("myseed:focus", open);
  }, [focus]);

  const pct = focus ? Math.min(100, Math.max(0, 100 - (left / (focus.minutes * 60000)) * 100)) : 0;

  return (
    <>
      {focus && !full ? (
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-full border bg-primary/10 px-2.5 text-xs font-medium tabular-nums text-primary hover:bg-primary/15"
          onClick={() => setFull(true)}
          aria-label={`Focus mode, ${fmt(left)} left. Open the focus view`}
          data-focus-pill
        >
          <TimerIcon className={cn("size-3.5", focus.endsAt && "animate-pulse")} /> {fmt(left)}
        </button>
      ) : (
        <Button variant="ghost" size="icon" className="max-md:hidden" aria-label="Focus mode" title="Focus mode: set a timer and work on one thing" onClick={() => (focus ? setFull(true) : setSetup(true))} data-focus-open>
          <TimerIcon />
        </Button>
      )}

      <Dialog open={setup} onOpenChange={setSetup}>
        <DialogContent data-focus-setup>
          <DialogHeader>
            <DialogTitle>Focus mode</DialogTitle>
            <DialogDescription>Set a timer and work on one thing. You get a chime and a notification when the time is up.</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1 text-sm">
            What are you working on?
            <Input value={task} onChange={(e) => setTask(e.target.value)} placeholder="For example: record Unit 3, Part 2" aria-label="What are you working on" data-focus-task />
          </label>
          <div className="grid gap-1 text-sm">
            Minutes
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((m) => (
                <Button key={m} size="sm" variant={minutes === m ? "default" : "outline"} onClick={() => setMinutes(m)}>
                  {m}
                </Button>
              ))}
              <Input type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(Number(e.target.value) || 1)} className="h-8 w-20" aria-label="Minutes" data-focus-minutes />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSetup(false)}>
              Cancel
            </Button>
            <Button onClick={start} data-focus-start>
              <PlayIcon /> Start focus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {focus && full && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-background/95 p-6 backdrop-blur-md" role="dialog" aria-label="Focus view" data-focus-view>
          <p className="text-sm tracking-wide text-muted-foreground uppercase">Focus</p>
          {focus.task && <h2 className="max-w-2xl text-center text-xl font-semibold sm:text-2xl">{focus.task}</h2>}
          <div className="relative grid size-64 place-items-center sm:size-80">
            <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted" />
              <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-primary transition-all duration-500" strokeDasharray={`${(pct / 100) * 282.7} 282.7`} />
            </svg>
            <span className="text-5xl font-semibold tabular-nums sm:text-6xl" data-focus-left>
              {fmt(left)}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">{focus.endsAt ? `${focus.minutes} minute focus. Notifications can wait.` : "Paused"}</p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" onClick={pause} data-focus-pause>
              {focus.endsAt ? <PauseIcon /> : <PlayIcon />} {focus.endsAt ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" onClick={() => setFull(false)} data-focus-min>
              <Minimize2Icon /> Work in the app
            </Button>
            <Button variant="ghost" onClick={stop} data-focus-stop>
              <SquareIcon /> End
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Esc or <Maximize2Icon className="inline size-3" /> the timer at the top switches between this view and the app.
          </p>
        </div>,
        document.body,
      )}
    </>
  );
}
