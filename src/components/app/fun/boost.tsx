"use client";

import * as React from "react";
import { toast } from "sonner";
import { CoffeeIcon, HeartPulseIcon, MedalIcon, QuoteIcon, TimerIcon, WindIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";

// Morale boosters: today's mood (the team sees only the spread), the week's points board, how points are earned,
// a breathing exercise, a stretch-break timer and a thought for the day.
const MOODS = ["😫", "😕", "😐", "🙂", "🤩"];
const THOUGHTS = [
  "Done is better than perfect. Ship it, then make it better.",
  "Every expert was once a beginner.",
  "Small progress is still progress.",
  "Ask for help early; it is a strength.",
  "A kind word to a colleague costs nothing and lasts all day.",
  "Focus on one thing at a time; finish it, then pick the next.",
  "Rest is part of the work.",
  "Celebrate the small wins: they add up to the big ones.",
  "Good teams make each other better.",
  "Your future self will thank you for the note you write today.",
];
const STRETCHES = ["Roll your shoulders back ten times.", "Look at something far away for twenty seconds.", "Stand up and reach for the ceiling.", "Turn your head slowly left and right.", "Shake out your hands and wrists.", "Drink a glass of water."];

type Home = { points: { balance: number; earned: number; today: number }; level: { level: number; into: number; need: number }; rules: { label: string; points: number }[]; config: { leaderboard: boolean; moods: boolean; points: boolean; dailyCap: number } };

export function BoostTab({ home }: { home: Home }) {
  const [mood, setMood] = React.useState<{ mine: number | null; total: number; average: number | null; spread: number[] } | null>(null);
  const [board, setBoard] = React.useState<{ rank: number; name: string; points: number; me: boolean }[] | null>(null);
  const [log, setLog] = React.useState<{ points: number; reason: string; created_at: string }[] | null>(null);
  const [breath, setBreath] = React.useState<"off" | "in" | "hold" | "out">("off");
  const [timer, setTimer] = React.useState<number | null>(null);
  const [left, setLeft] = React.useState(0);
  React.useEffect(() => {
    if (home.config.moods) void F.moodAction().then((r) => r.ok && setMood(r.data ?? null));
    if (home.config.leaderboard) void F.leaderboardAction(7).then((r) => r.ok && setBoard(r.data ?? []));
    if (home.config.points) void F.pointsLogAction().then((r) => r.ok && setLog(r.data ?? []));
  }, [home.config]);
  // Breathing: in 4, hold 4, out 6.
  React.useEffect(() => {
    if (breath === "off") return;
    const next = { in: "hold", hold: "out", out: "in" } as const;
    const t = window.setTimeout(() => setBreath(next[breath]), breath === "out" ? 6000 : 4000);
    return () => window.clearTimeout(t);
  }, [breath]);
  // Break timer: a reminder when it is time to stretch.
  React.useEffect(() => {
    if (timer === null) return;
    const t = window.setInterval(() => {
      const s = Math.max(0, Math.round((timer - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) {
        setTimer(null);
        const tip = STRETCHES[Math.floor(Math.random() * STRETCHES.length)]!;
        toast("Time for a break", { description: tip, duration: 15000 });
        try {
          if ("speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(`Time for a break. ${tip}`));
        } catch {}
      }
    }, 1000);
    return () => window.clearInterval(t);
  }, [timer]);
  const thought = THOUGHTS[Math.floor(Date.now() / 864e5) % THOUGHTS.length]!;
  return (
    <div className="space-y-4" data-fun-boost>
      <div className="flex items-start gap-2 rounded-xl bg-primary/10 p-3 text-sm">
        <QuoteIcon className="mt-0.5 size-4 shrink-0 text-primary" />
        <p>{thought}</p>
      </div>

      {home.config.moods && (
        <section className="space-y-1.5">
          <p className="text-sm font-medium">How are you today?</p>
          <div className="flex justify-between">
            {MOODS.map((m, i) => (
              <button key={m} type="button" aria-label={`Mood ${i + 1} of 5`} aria-pressed={mood?.mine === i + 1} onClick={async () => { const r = await F.moodAction(i + 1); if (r.ok) (setMood(r.data ?? null), toast.success("Thanks for sharing")); }} className={cn("rounded-full p-1.5 text-3xl transition-transform hover:scale-110", mood?.mine === i + 1 && "bg-primary/15 ring-2 ring-primary")}>
                {m}
              </button>
            ))}
          </div>
          {mood && mood.total > 0 && (
            <div className="space-y-1">
              <div className="flex h-2 overflow-hidden rounded-full">
                {mood.spread.map((n, i) => n > 0 && <span key={i} style={{ width: `${(n / mood.total) * 100}%`, background: ["#d93025", "#e8710a", "#f9ab00", "#7cb342", "#188038"][i] }} />)}
              </div>
              <p className="text-[11px] text-muted-foreground">Team today: {mood.average} of 5 from {mood.total} {mood.total === 1 ? "person" : "people"}. Nobody sees who said what.</p>
            </div>
          )}
        </section>
      )}

      {home.config.points && (
        <section className="space-y-1.5">
          <p className="flex items-center gap-1 text-sm font-medium"><MedalIcon className="size-4 text-[#F9AB00]" /> Your points</p>
          <p className="text-xs text-muted-foreground">
            {home.points.balance} to spend · {home.points.earned} earned in all · {home.points.today} today{home.config.dailyCap ? ` (up to ${home.config.dailyCap} a day)` : ""} · level {home.level.level}
          </p>
          <details className="text-xs">
            <summary className="cursor-pointer text-primary">How work earns points</summary>
            <ul className="mt-1 space-y-0.5">
              {home.rules.map((r) => (
                <li key={r.label} className="flex justify-between"><span>{r.label}</span><span className="tabular-nums">+{r.points}</span></li>
              ))}
            </ul>
          </details>
          {log && log.length > 0 && (
            <details className="text-xs">
              <summary className="cursor-pointer text-primary">Latest</summary>
              <ul className="mt-1 space-y-0.5">
                {log.slice(0, 10).map((l, i) => (
                  <li key={i} className="flex justify-between gap-2"><span className="truncate">{l.reason}</span><span className={cn("tabular-nums", l.points < 0 ? "text-[#d93025]" : "text-[#188038]")}>{l.points > 0 ? "+" : ""}{l.points}</span></li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {home.config.leaderboard && board && (
        <section className="space-y-1.5" data-fun-leaderboard>
          <p className="text-sm font-medium">This week&apos;s top contributors</p>
          {board.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nobody yet this week. Finish a task to lead the board.</p>
          ) : (
            <ol className="space-y-1">
              {board.map((b) => (
                <li key={b.rank} className={cn("flex items-center gap-2 rounded-lg px-2 py-1 text-sm", b.me ? "bg-primary/10 font-medium" : "bg-muted/40")}>
                  <span className="w-6 text-center">{b.rank === 1 ? "🥇" : b.rank === 2 ? "🥈" : b.rank === 3 ? "🥉" : b.rank}</span>
                  <span className="flex-1 truncate">{b.name}{b.me ? " (you)" : ""}</span>
                  <span className="tabular-nums">{b.points}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      <section className="grid grid-cols-2 gap-2">
        <div className="space-y-2 rounded-xl border p-3 text-center">
          <p className="flex items-center justify-center gap-1 text-sm font-medium"><WindIcon className="size-4" /> Breathe</p>
          <div className="flex h-20 items-center justify-center">
            <span className={cn("rounded-full bg-primary/30 transition-all ease-in-out", breath === "in" ? "size-20 duration-[4000ms]" : breath === "hold" ? "size-20 duration-300" : breath === "out" ? "size-6 duration-[6000ms]" : "size-10")} />
          </div>
          <p className="h-4 text-xs text-muted-foreground">{breath === "in" ? "Breathe in…" : breath === "hold" ? "Hold…" : breath === "out" ? "Breathe out…" : "One calm minute"}</p>
          <Button size="xs" variant="outline" onClick={() => setBreath(breath === "off" ? "in" : "off")}>{breath === "off" ? "Start" : "Stop"}</Button>
        </div>
        <div className="space-y-2 rounded-xl border p-3 text-center">
          <p className="flex items-center justify-center gap-1 text-sm font-medium"><CoffeeIcon className="size-4" /> Stretch break</p>
          <p className="flex h-20 items-center justify-center text-2xl font-semibold tabular-nums">{timer ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}` : <TimerIcon className="size-8 text-muted-foreground" />}</p>
          <p className="h-4 text-xs text-muted-foreground">{timer ? "Until your break" : "Remind me in"}</p>
          {timer ? (
            <Button size="xs" variant="outline" onClick={() => setTimer(null)}>Cancel</Button>
          ) : (
            <span className="flex justify-center gap-1">
              {[25, 45, 60].map((m) => <Button key={m} size="xs" variant="outline" onClick={() => (setTimer(Date.now() + m * 60e3), setLeft(m * 60))}>{m}m</Button>)}
            </span>
          )}
        </div>
      </section>
      <p className="flex items-center gap-1 text-[11px] text-muted-foreground"><HeartPulseIcon className="size-3" /> Short breaks help focus. Games are for breaks, not instead of work.</p>
    </div>
  );
}
