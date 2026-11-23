"use client";

// The Dev dojo: short games that teach real development (src/lib/dev-dojo.ts). Bug hunt, Regex lab and quizzes,
// with XP, levels, streaks and pixel effects. Progress is kept on this computer for each person.

import * as React from "react";
import { BugIcon, CheckIcon, GitBranchIcon, RotateCcwIcon, ShieldIcon, TimerIcon, TrophyIcon, XIcon, RegexIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BUG_ROUNDS, QUIZZES, REGEX_LEVELS, levelOf, xpFor } from "@/lib/dev-dojo";
import { cn } from "@/lib/utils";

type Progress = { xp: number; best: Record<string, number>; done: Record<string, boolean> };
const EMPTY: Progress = { xp: 0, best: {}, done: {} };
const keyFor = (viewerId: string) => `myseed.dojo.${viewerId}`;

function useProgress(viewerId: string) {
  const [p, setP] = React.useState<Progress>(EMPTY);
  React.useEffect(() => {
    try {
      setP({ ...EMPTY, ...JSON.parse(localStorage.getItem(keyFor(viewerId)) ?? "{}") });
    } catch {}
  }, [viewerId]);
  const save = React.useCallback(
    (f: (x: Progress) => Progress) =>
      setP((x) => {
        const n = f(x);
        try {
          localStorage.setItem(keyFor(viewerId), JSON.stringify(n));
        } catch {}
        return n;
      }),
    [viewerId],
  );
  return [p, save] as const;
}

// A pixel "+XP" that rises from where you answered.
function useBurst() {
  const [bursts, setBursts] = React.useState<{ id: number; text: string; good: boolean }[]>([]);
  const fire = (text: string, good: boolean) => {
    const id = Date.now() + Math.random();
    setBursts((b) => [...b, { id, text, good }]);
    window.setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 900);
  };
  const layer = (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-6 flex justify-center">
      {bursts.map((b) => (
        <span key={b.id} className={cn("dojo-burst font-mono text-lg font-bold", b.good ? "text-emerald-500" : "text-rose-500")}>
          {b.text}
        </span>
      ))}
    </div>
  );
  return { fire, layer };
}

const GAMES = [
  { key: "bugs", label: "Bug hunt", icon: BugIcon, blurb: "Find the line with the bug." },
  { key: "regex", label: "Regex lab", icon: RegexIcon, blurb: "Match one list, not the other." },
  ...QUIZZES.map((q) => ({ key: q.key, label: q.title, icon: q.key === "git" ? GitBranchIcon : q.key === "bigo" ? TimerIcon : ShieldIcon, blurb: q.blurb })),
] as const;

export function DevDojo({ viewerId, name }: { viewerId: string; name: string }) {
  const [p, save] = useProgress(viewerId);
  const [game, setGame] = React.useState<string>("bugs");
  const { level, into } = levelOf(p.xp);
  const award = (id: string, gained: number) => save((x) => ({ ...x, xp: x.xp + gained, done: { ...x.done, [id]: true } }));
  const best = (g: string, score: number) => save((x) => ({ ...x, best: { ...x.best, [g]: Math.max(x.best[g] ?? 0, score) } }));
  return (
    <div className="space-y-4" data-dev-dojo>
      <style>{`
        @keyframes dojo-rise { 0% { opacity: 0; transform: translateY(8px) scale(.8); } 20% { opacity: 1; transform: translateY(0) scale(1.15); } 100% { opacity: 0; transform: translateY(-36px) scale(1); } }
        .dojo-burst { animation: dojo-rise .9s steps(9) forwards; text-shadow: 2px 2px 0 rgb(0 0 0 / .25); }
        @keyframes dojo-shake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .dojo-shake { animation: dojo-shake .25s steps(4) 2; }
        @keyframes dojo-pop { 0% { transform: scale(.9); } 50% { transform: scale(1.04); } 100% { transform: scale(1); } }
        .dojo-pop { animation: dojo-pop .3s steps(3); }
        .dojo-bar { background-image: repeating-linear-gradient(90deg, currentColor 0 6px, transparent 6px 8px); }
        @media (prefers-reduced-motion: reduce) { .dojo-burst, .dojo-shake, .dojo-pop { animation: none; } }
      `}</style>
      <section className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-3">
        <div className="grid size-12 place-items-center rounded-md border-2 border-current font-mono text-lg font-bold text-emerald-500" aria-label={`Level ${level}`}>
          {level}
        </div>
        <div className="min-w-48 flex-1">
          <p className="font-mono text-sm font-semibold">
            {name} · level {level} · {p.xp} XP
          </p>
          <div className="mt-1 h-3 w-full overflow-hidden rounded-sm border bg-muted" role="progressbar" aria-valuenow={into} aria-valuemin={0} aria-valuemax={100} aria-label="Progress to the next level">
            <div className="dojo-bar h-full text-emerald-500 transition-all" style={{ width: `${into}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {Object.keys(p.done).length} lessons solved · 10 XP each, more for a streak · {100 - into} XP to level {level + 1}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <TrophyIcon className="size-4 text-amber-500" />
          {GAMES.filter((g) => p.best[g.key]).map((g) => `${g.label} ${p.best[g.key]}`).join(" · ") || "No best scores yet"}
        </div>
      </section>
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Games">
        {GAMES.map((g) => (
          <button key={g.key} role="tab" type="button" aria-selected={game === g.key} onClick={() => setGame(g.key)} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", game === g.key ? "border-primary bg-primary/10" : "hover:bg-muted/50")} data-dojo-game={g.key}>
            <g.icon className="size-4" />
            <span>
              <span className="block font-medium">{g.label}</span>
              <span className="block text-[11px] text-muted-foreground">{g.blurb}</span>
            </span>
          </button>
        ))}
      </div>
      {game === "bugs" && <BugHunt done={p.done} award={award} best={(s) => best("bugs", s)} />}
      {game === "regex" && <RegexLab done={p.done} award={award} best={(s) => best("regex", s)} />}
      {QUIZZES.filter((q) => q.key === game).map((q) => (
        <QuizGame key={q.key} quiz={q} award={award} best={(s) => best(q.key, s)} />
      ))}
    </div>
  );
}

function BugHunt({ done, award, best }: { done: Record<string, boolean>; award: (id: string, xp: number) => void; best: (s: number) => void }) {
  const [i, setI] = React.useState(0);
  const [pick, setPick] = React.useState<number | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const [shake, setShake] = React.useState(false);
  const { fire, layer } = useBurst();
  const r = BUG_ROUNDS[i % BUG_ROUNDS.length]!;
  const answered = pick !== null;
  const choose = (n: number) => {
    if (answered) return;
    setPick(n);
    if (n === r.bug) {
      const s = streak + 1;
      const gained = xpFor(s);
      setStreak(s);
      setScore((x) => x + 1);
      best(score + 1);
      fire(`+${gained} XP`, true);
      if (!done[`bug:${r.id}`]) award(`bug:${r.id}`, gained);
    } else {
      setStreak(0);
      setShake(true);
      window.setTimeout(() => setShake(false), 500);
      fire("miss", false);
    }
  };
  return (
    <section className={cn("relative space-y-3 rounded-xl border bg-card p-4", shake && "dojo-shake")} aria-label="Bug hunt" data-bug-round={r.id}>
      {layer}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold">
          Round {(i % BUG_ROUNDS.length) + 1}/{BUG_ROUNDS.length}: {r.title}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          score {score} · streak {streak}
          {done[`bug:${r.id}`] ? " · solved before" : ""}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">Click the line with the bug.</p>
      <pre className="overflow-x-auto rounded-lg border bg-[#050b08] p-0 text-[13px] leading-6 text-[#c8ffe4]">
        {r.code.map((line, n) => (
          <button
            key={n}
            type="button"
            onClick={() => choose(n)}
            className={cn(
              "block w-full whitespace-pre px-3 text-left font-mono hover:bg-white/5",
              answered && n === r.bug && "bg-emerald-500/25",
              answered && n === pick && n !== r.bug && "bg-rose-500/25",
            )}
            data-bug-line={n}
          >
            <span className="mr-3 inline-block w-5 select-none text-right text-[#4f8f6f]">{n + 1}</span>
            {line}
          </button>
        ))}
      </pre>
      {answered && (
        <div className="dojo-pop space-y-1 rounded-lg border p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            {pick === r.bug ? <CheckIcon className="size-4 text-emerald-500" /> : <XIcon className="size-4 text-rose-500" />}
            {pick === r.bug ? "Right." : `Not that one: it is line ${r.bug + 1}.`}
          </p>
          <p>{r.why}</p>
          <p className="font-mono text-xs text-muted-foreground">Fix: {r.fix}</p>
          <Button size="sm" className="mt-1" onClick={() => (setPick(null), setI((x) => x + 1))}>
            Next round
          </Button>
        </div>
      )}
    </section>
  );
}

function RegexLab({ done, award, best }: { done: Record<string, boolean>; award: (id: string, xp: number) => void; best: (s: number) => void }) {
  const [i, setI] = React.useState(0);
  const [src, setSrc] = React.useState("");
  const [hint, setHint] = React.useState(false);
  const [solved, setSolved] = React.useState(0);
  const { fire, layer } = useBurst();
  const lv = REGEX_LEVELS[i % REGEX_LEVELS.length]!;
  let re: RegExp | null = null;
  let error: string | null = null;
  try {
    re = src ? new RegExp(src) : null;
  } catch (e) {
    error = e instanceof Error ? e.message : "Not a valid pattern";
  }
  const ok = (s: string, want: boolean) => !!re && re.test(s) === want;
  const all = !!re && lv.match.every((s) => ok(s, true)) && lv.skip.every((s) => ok(s, false));
  const wasAll = React.useRef(false);
  React.useEffect(() => {
    if (all && !wasAll.current) {
      fire(`+${hint ? 5 : 10} XP`, true);
      setSolved((x) => (best(x + 1), x + 1));
      if (!done[`re:${lv.id}`]) award(`re:${lv.id}`, hint ? 5 : 10);
    }
    wasAll.current = all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all]);
  const row = (s: string, want: boolean) => (
    <li key={`${want}${s}`} className={cn("flex items-center gap-2 rounded px-2 py-0.5 font-mono text-xs", re ? (ok(s, want) ? "bg-emerald-500/15" : "bg-rose-500/15") : "bg-muted")}>
      {re ? ok(s, want) ? <CheckIcon className="size-3 text-emerald-500" /> : <XIcon className="size-3 text-rose-500" /> : <span className="size-3" />}
      {s === "" ? <span className="text-muted-foreground">(empty)</span> : s}
    </li>
  );
  return (
    <section className="relative space-y-3 rounded-xl border bg-card p-4" aria-label="Regex lab" data-regex-level={lv.id}>
      {layer}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold">
          Level {(i % REGEX_LEVELS.length) + 1}/{REGEX_LEVELS.length}: {lv.title}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">solved {solved}{done[`re:${lv.id}`] ? " · solved before" : ""}</span>
      </div>
      <p className="text-sm">{lv.brief}</p>
      <div className="flex items-center gap-2 font-mono">
        <span className="text-muted-foreground">/</span>
        <Input value={src} onChange={(e) => setSrc(e.target.value)} placeholder="your pattern" className="h-9 font-mono" aria-label="Pattern" spellCheck={false} />
        <span className="text-muted-foreground">/</span>
      </div>
      {error && <p className="font-mono text-xs text-rose-500">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-medium">Must match</p>
          <ul className="space-y-1">{lv.match.map((s) => row(s, true))}</ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-medium">Must not match</p>
          <ul className="space-y-1">{lv.skip.map((s) => row(s, false))}</ul>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {all ? (
          <>
            <span className="dojo-pop flex items-center gap-1 text-sm font-medium text-emerald-600">
              <CheckIcon className="size-4" /> Solved
            </span>
            <Button size="sm" onClick={() => (setI((x) => x + 1), setSrc(""), setHint(false))}>
              Next level
            </Button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setHint(true)} disabled={hint}>
            {hint ? lv.hint : "Hint (half the XP)"}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="gap-1" onClick={() => setSrc(lv.answer)}>
          <RotateCcwIcon className="size-3.5" /> Show an answer
        </Button>
      </div>
    </section>
  );
}

function QuizGame({ quiz, award, best }: { quiz: (typeof QUIZZES)[number]; award: (id: string, xp: number) => void; best: (s: number) => void }) {
  const [i, setI] = React.useState(0);
  const [pick, setPick] = React.useState<number | null>(null);
  const [streak, setStreak] = React.useState(0);
  const [score, setScore] = React.useState(0);
  const { fire, layer } = useBurst();
  const q = quiz.questions[i % quiz.questions.length]!;
  const end = i > 0 && i % quiz.questions.length === 0 && pick === null;
  const choose = (n: number) => {
    if (pick !== null) return;
    setPick(n);
    if (n === q.answer) {
      const s = streak + 1;
      setStreak(s);
      setScore((x) => (best(x + 1), x + 1));
      fire(`+${xpFor(s)} XP`, true);
      award(`${quiz.key}:${q.id}`, xpFor(s));
    } else {
      setStreak(0);
      fire("miss", false);
    }
  };
  return (
    <section className="relative space-y-3 rounded-xl border bg-card p-4" aria-label={quiz.title} data-quiz={quiz.key}>
      {layer}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono text-sm font-semibold">
          {quiz.title}: question {(i % quiz.questions.length) + 1}/{quiz.questions.length}
        </h2>
        <span className="font-mono text-xs text-muted-foreground">
          score {score} · streak {streak}
        </span>
      </div>
      {end && <p className="dojo-pop rounded-lg border p-2 text-sm">Round complete: {score} right so far. Going again mixes in what you missed.</p>}
      <p className="text-sm font-medium">{q.q}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {q.options.map((o, n) => (
          <button
            key={n}
            type="button"
            onClick={() => choose(n)}
            className={cn("rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors hover:bg-muted/50", pick !== null && n === q.answer && "border-emerald-500 bg-emerald-500/15", pick === n && n !== q.answer && "border-rose-500 bg-rose-500/15")}
            data-quiz-option={n}
          >
            {o}
          </button>
        ))}
      </div>
      {pick !== null && (
        <div className="dojo-pop space-y-1 rounded-lg border p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium">
            {pick === q.answer ? <CheckIcon className="size-4 text-emerald-500" /> : <XIcon className="size-4 text-rose-500" />}
            {pick === q.answer ? "Right." : "Not quite."}
          </p>
          <p>{q.why}</p>
          <Button size="sm" className="mt-1" onClick={() => (setPick(null), setI((x) => x + 1))}>
            Next question
          </Button>
        </div>
      )}
    </section>
  );
}
