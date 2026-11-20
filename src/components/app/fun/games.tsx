"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, BombIcon, FlagIcon, LightbulbIcon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { MEMORY_ICONS } from "./icons";
import { ScoreBoard, cellGrid, gameSfx, useScores } from "./shell";

export { Snake } from "./snake";

// Games for breaks, each with its own modes, levels, scores per mode and a few coins for a good round (within the
// daily cap Admin sets; work stays the main way to earn).

type Dir = "up" | "down" | "left" | "right";
const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

function useDirections(onDir: (d: Dir) => void) {
  const ref = React.useRef<HTMLDivElement>(null);
  const cb = React.useRef(onDir);
  cb.current = onDir;
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const key = (e: KeyboardEvent) => {
      const d = KEYS[e.key];
      if (d) (e.preventDefault(), cb.current(d));
    };
    let sx = 0, sy = 0;
    const start = (e: TouchEvent) => ((sx = e.touches[0]!.clientX), (sy = e.touches[0]!.clientY));
    const end = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - sx, dy = e.changedTouches[0]!.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
      cb.current(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
    };
    el.addEventListener("keydown", key);
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end);
    return () => (el.removeEventListener("keydown", key), el.removeEventListener("touchstart", start), el.removeEventListener("touchend", end));
  }, []);
  return ref;
}
function Pad({ onDir }: { onDir: (d: Dir) => void }) {
  return (
    <div className="mx-auto grid w-32 grid-cols-3 gap-1 sm:hidden">
      <span />
      <Button size="icon" variant="outline" aria-label="Up" onClick={() => onDir("up")}><ArrowUpIcon /></Button>
      <span />
      <Button size="icon" variant="outline" aria-label="Left" onClick={() => onDir("left")}><ArrowLeftIcon /></Button>
      <Button size="icon" variant="outline" aria-label="Down" onClick={() => onDir("down")}><ArrowDownIcon /></Button>
      <Button size="icon" variant="outline" aria-label="Right" onClick={() => onDir("right")}><ArrowRightIcon /></Button>
    </div>
  );
}

// A row of choices (modes, levels, sizes).
function Pills<T extends string | number>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1 text-xs" role="radiogroup" aria-label={label}>
      <span className="text-muted-foreground">{label}</span>
      {options.map(([v, l]) => (
        <button key={String(v)} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={cn("rounded-full border px-2 py-0.5", value === v ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted")}>
          {l}
        </button>
      ))}
    </div>
  );
}

// A few coins for a good round (the server keeps the daily cap).
async function coins(amount: number) {
  if (amount <= 0) return;
  const r = await F.playRewardAction("game", amount);
  if (r.ok && r.data?.coins) toast.success(`+${r.data.coins} coins`);
}
function useOwnedSkins() {
  const [owned, setOwned] = React.useState<Set<string>>(new Set());
  React.useEffect(() => void F.walletAction().then((r) => r.ok && r.data && setOwned(new Set(r.data.owned.map((o) => o.key)))), []);
  return owned;
}

// ------------------------------------------------------------------------------------------------- 2048

type Board = number[];
function slide(b: Board, n: number, d: Dir): { b: Board; gained: number; moved: boolean } {
  const out = Array<number>(n * n).fill(0);
  let gained = 0;
  for (let k = 0; k < n; k++) {
    const idx = Array.from({ length: n }, (_, i) => (d === "left" ? k * n + i : d === "right" ? k * n + n - 1 - i : d === "up" ? i * n + k : (n - 1 - i) * n + k));
    const vals = idx.map((i) => b[i]!).filter(Boolean);
    const merged: number[] = [];
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] === vals[i + 1]) (merged.push(vals[i]! * 2), (gained += vals[i]! * 2), i++);
      else merged.push(vals[i]!);
    }
    idx.forEach((pos, i) => (out[pos] = merged[i] ?? 0));
  }
  return { b: out, gained, moved: out.some((v, i) => v !== b[i]) };
}
const addTile = (b: Board) => {
  const empty = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return b;
  const n = [...b];
  n[empty[Math.floor(Math.random() * empty.length)]!] = Math.random() < 0.9 ? 2 : 4;
  return n;
};
const THEMES: Record<string, { empty: string; bg: string; tile: (v: number) => string }> = {
  classic: { empty: "bg-[#cdc1b4]", bg: "bg-[#bbada0]", tile: (v) => ({ 2: "bg-[#eee4da] text-[#776e65]", 4: "bg-[#ede0c8] text-[#776e65]", 8: "bg-[#f2b179] text-white", 16: "bg-[#f59563] text-white", 32: "bg-[#f67c5f] text-white", 64: "bg-[#f65e3b] text-white", 128: "bg-[#edcf72] text-white", 256: "bg-[#edcc61] text-white", 512: "bg-[#edc850] text-white", 1024: "bg-[#edc53f] text-white", 2048: "bg-[#edc22e] text-white" })[v] ?? "bg-[#3c3a32] text-white" },
  neon: { empty: "bg-[#1e1b4b]", bg: "bg-[#0b0420]", tile: (v) => ["", "bg-[#22d3ee] text-black", "bg-[#a78bfa] text-black", "bg-[#f0abfc] text-black", "bg-[#f472b6] text-white", "bg-[#fb7185] text-white", "bg-[#facc15] text-black", "bg-[#4ade80] text-black", "bg-[#38bdf8] text-black", "bg-[#e879f9] text-white", "bg-[#fde047] text-black", "bg-white text-black"][Math.min(11, Math.log2(v))] ?? "bg-white text-black" },
  pastel: { empty: "bg-[#f5f0ff]", bg: "bg-[#e9d5ff]", tile: (v) => ["", "bg-[#fde2e4] text-[#6b4f4f]", "bg-[#fad2e1] text-[#6b4f4f]", "bg-[#e2ece9] text-[#3f5f57]", "bg-[#bee1e6] text-[#3f5f57]", "bg-[#cddafd] text-[#3f4a6b]", "bg-[#dfe7fd] text-[#3f4a6b]", "bg-[#fff1e6] text-[#6b5a4f]", "bg-[#f0efeb] text-[#555]", "bg-[#d0f4de] text-[#355]", "bg-[#a9def9] text-[#245]", "bg-[#e4c1f9] text-[#425]"][Math.min(11, Math.log2(v))] ?? "bg-[#e4c1f9]" },
};
export function Game2048() {
  const [n, setN] = React.useState(4);
  const [mode, setMode] = React.useState<"classic" | "time" | "zen">("classic");
  const [theme, setTheme] = React.useState("classic");
  const owned = useOwnedSkins();
  const fresh = React.useCallback((size: number) => addTile(addTile(Array<number>(size * size).fill(0))), []);
  const [b, setB] = React.useState<Board>(() => fresh(4));
  const [score, setScore] = React.useState(0);
  const [hist, setHist] = React.useState<{ b: Board; s: number }[]>([]);
  const [undos, setUndos] = React.useState(3);
  const [end, setEnd] = React.useState<number | null>(null);
  const [left, setLeft] = React.useState(0);
  const key = `2048:${mode}${n === 4 ? "" : `-${n}`}`;
  const { best, report } = useScores(key);
  const stuck = (["up", "down", "left", "right"] as Dir[]).every((d) => !slide(b, n, d).moved);
  const over = (mode !== "zen" && stuck) || (mode === "time" && end !== null && left <= 0);
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (over && !reported.current && score) {
      reported.current = true;
      void report(score, { max: Math.max(...b), size: n });
      void coins(Math.max(...b) >= 2048 ? 5 : Math.max(...b) >= 512 ? 2 : 0);
    }
  }, [over, score, b, report, n]);
  React.useEffect(() => {
    if (mode !== "time" || end === null) return;
    const t = window.setInterval(() => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))), 300);
    return () => window.clearInterval(t);
  }, [mode, end]);
  const reset = (size = n, m = mode) => {
    if (score && !reported.current) void report(score);
    reported.current = false;
    setN(size);
    setB(fresh(size));
    setScore(0);
    setHist([]);
    setUndos(3);
    setEnd(m === "time" ? Date.now() + 180_000 : null);
    setLeft(180);
  };
  const move = (d: Dir) => {
    if (over) return;
    let r = slide(b, n, d);
    if (!r.moved) {
      if (mode === "zen" && stuck) (r = { b: b.map((v) => (v <= 4 ? 0 : v)), gained: 0, moved: true }), toast("Zen: small tiles cleared");
      else return;
    }
    setHist((h) => [...h.slice(-10), { b, s: score }]);
    gameSfx(r.gained ? "match" : "move", r.gained ? 0.35 : 0.25);
    setB(addTile(r.b));
    setScore((s) => s + r.gained);
  };
  const ref = useDirections(move);
  const th = THEMES[theme] ?? THEMES.classic!;
  return (
    <div className="space-y-2" data-game="2048">
      <Pills label="Mode" value={mode} onChange={(m) => (setMode(m), reset(n, m))} options={[["classic", "Classic"], ["time", "3-minute rush"], ["zen", "Zen (never stuck)"]]} />
      <Pills label="Board" value={n} onChange={(s) => reset(s)} options={[[3, "3x3"], [4, "4x4"], [5, "5x5"], [6, "6x6"]]} />
      <Pills label="Tiles" value={theme} onChange={setTheme} options={[["classic", "Classic"], ...(owned.has("skin.2048.neon") ? ([["neon", "Neon"]] as [string, string][]) : []), ...(owned.has("skin.2048.pastel") ? ([["pastel", "Pastel"]] as [string, string][]) : [])]} />
      <div className="flex items-center justify-between text-sm">
        <span>Score <b className="tabular-nums">{score}</b>{mode === "time" ? ` · ${left}s` : ""} · best tile {Math.max(...b)}</span>
        <span className="flex gap-1">
          <Button size="xs" variant="outline" disabled={!hist.length || !undos || over} onClick={() => { const h = hist.at(-1)!; setB(h.b); setScore(h.s); setHist(hist.slice(0, -1)); setUndos(undos - 1); }}><Undo2Icon /> Undo ({undos})</Button>
          <Button size="xs" variant="outline" onClick={() => reset()}><RotateCcwIcon /> New game</Button>
        </span>
      </div>
      <div ref={ref} tabIndex={0} className={cn("relative touch-none rounded-lg p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring", th.bg)} aria-label="2048 board: use the arrow keys or swipe">
        <div style={cellGrid(n)} className="gap-1.5">
          {b.map((v, i) => (
            <div key={i} className={cn("flex aspect-square items-center justify-center rounded-md font-bold transition-colors", n >= 6 ? "text-sm" : n === 5 ? "text-base" : "text-xl", v ? th.tile(v) : th.empty)}>
              {v || ""}
            </div>
          ))}
        </div>
        {over && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-lg font-bold text-white">{mode === "time" && left <= 0 ? "Time!" : "Game over"}: {score}</div>}
      </div>
      <Pad onDir={move} />
      <p className="text-[11px] text-muted-foreground">Neon and pastel tiles are in the Corner Shop in Seed Town.</p>
      <ScoreBoard best={best} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Memory

export function Memory() {
  const [size, setSize] = React.useState<"easy" | "normal" | "hard">("normal");
  const [mode, setMode] = React.useState<"classic" | "time">("classic");
  const owned = useOwnedSkins();
  const [space, setSpace] = React.useState(false);
  const pairs = size === "easy" ? 6 : size === "normal" ? 8 : 15;
  const cols = size === "hard" ? 6 : 4;
  const deal = React.useCallback(() => {
    const faces = Array.from({ length: pairs }, (_, i) => i);
    return [...faces, ...faces].sort(() => Math.random() - 0.5);
  }, [pairs]);
  const [cards, setCards] = React.useState<number[]>(deal);
  const [open, setOpen] = React.useState<number[]>([]);
  const [done, setDone] = React.useState<Set<number>>(new Set());
  const [moves, setMoves] = React.useState(0);
  const [start, setStart] = React.useState<number | null>(null);
  const [secs, setSecs] = React.useState(0);
  const [combo, setCombo] = React.useState(0);
  const [points, setPoints] = React.useState(0);
  const [boards, setBoards] = React.useState(0);
  const key = mode === "time" ? `memory:time` : `memory${size === "normal" ? "" : `:${size}`}`;
  const { best, report } = useScores(key);
  const won = done.size === cards.length;
  const timeLeft = mode === "time" && start ? Math.max(0, 75 - secs) : 75;
  React.useEffect(() => {
    if (!start || (won && mode === "classic")) return;
    const t = window.setInterval(() => setSecs(Math.round((Date.now() - start) / 1000)), 300);
    return () => window.clearInterval(t);
  }, [start, won, mode]);
  const finished = React.useRef(false);
  React.useEffect(() => {
    if (mode === "time" && start && timeLeft <= 0 && !finished.current) {
      finished.current = true;
      void report(points, { boards });
      void coins(Math.floor(points / 60));
    }
  }, [mode, start, timeLeft, points, boards, report]);
  const reset = () => (setCards(deal()), setOpen([]), setDone(new Set()), setMoves(0), setStart(null), setSecs(0), setCombo(0), setPoints(0), setBoards(0), (finished.current = false));
  React.useEffect(() => void reset(), [size, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  const flip = (i: number) => {
    if (open.length === 2 || open.includes(i) || done.has(i) || (mode === "time" && start && timeLeft <= 0)) return;
    if (!start) setStart(Date.now());
    gameSfx("flip", 0.35);
    const o = [...open, i];
    setOpen(o);
    if (o.length === 2) {
      setMoves((m) => m + 1);
      window.setTimeout(() => {
        if (cards[o[0]!] === cards[o[1]!]) {
          const c = combo + 1;
          setCombo(c);
          gameSfx("match");
          setPoints((p) => p + 10 * c);
          const d = new Set(done).add(o[0]!).add(o[1]!);
          setDone(d);
          if (d.size === cards.length) {
            if (mode === "time") (setBoards((x) => x + 1), window.setTimeout(() => (setCards(deal()), setDone(new Set())), 400));
            else {
              const s = Math.max(1, Math.round((Date.now() - (start ?? Date.now())) / 1000));
              void report(s, { moves: moves + 1, size });
              void coins(size === "hard" ? 3 : 1);
            }
          }
        } else setCombo(0);
        setOpen([]);
      }, 600);
    }
  };
  const Icon = (c: number) => MEMORY_ICONS[c % MEMORY_ICONS.length]!;
  return (
    <div className="space-y-2" data-game="memory">
      <Pills label="Mode" value={mode} onChange={setMode} options={[["classic", "Classic"], ["time", "Time attack (75 s)"]]} />
      <Pills label="Board" value={size} onChange={setSize} options={[["easy", "12 cards"], ["normal", "16 cards"], ["hard", "30 cards"]]} />
      {owned.has("skin.cards.space") && <Pills label="Cards" value={space ? "space" : "classic"} onChange={(v) => setSpace(v === "space")} options={[["classic", "Classic"], ["space", "Space"]]} />}
      <div className="flex items-center justify-between text-sm">
        <span>{mode === "time" ? `${timeLeft}s · ${points} points · ${boards} boards` : `${moves} moves · ${secs}s`}{combo > 1 ? ` · combo x${combo}` : ""}</span>
        <Button size="xs" variant="outline" onClick={reset}><RotateCcwIcon /> Shuffle</Button>
      </div>
      <div style={cellGrid(cols)} className="gap-1.5">
        {cards.map((c, i) => {
          const up = open.includes(i) || done.has(i);
          return (
            <button key={i} type="button" onClick={() => flip(i)} aria-label={up ? `Card ${c + 1}` : "Hidden card"} className={cn("flex aspect-square items-center justify-center rounded-lg border text-2xl transition-all duration-300", up ? "bg-card [transform:rotateY(0)]" : space ? "bg-gradient-to-br from-[#1e1b4b] to-[#7c3aed] [transform:rotateY(180deg)]" : "bg-primary/80 [transform:rotateY(180deg)]", done.has(i) && "opacity-60")}>
              {up ? React.createElement(Icon(c), { className: cn("size-6", c >= MEMORY_ICONS.length && "text-primary") }) : ""}
            </button>
          );
        })}
      </div>
      {won && mode === "classic" && <p className="text-center text-sm font-semibold text-primary">All pairs in {secs}s and {moves} moves!</p>}
      {mode === "time" && start && timeLeft <= 0 && <p className="text-center text-sm font-semibold text-primary">Time! {points} points, {boards} boards cleared.</p>}
      <ScoreBoard best={best} unit={mode === "time" ? " pts" : "s"} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Minesweeper

const LEVELS = { beginner: { w: 9, h: 9, m: 10 }, intermediate: { w: 16, h: 16, m: 40 }, expert: { w: 16, h: 30, m: 99 } } as const;
export function Minesweeper() {
  const [lvl, setLvl] = React.useState<keyof typeof LEVELS>("beginner");
  const { w: W, h: H, m: MINES } = LEVELS[lvl];
  type Cell = { mine: boolean; n: number; open: boolean; flag: boolean };
  const make = React.useCallback((): Cell[] => Array.from({ length: W * H }, () => ({ mine: false, n: 0, open: false, flag: false })), [W, H]);
  const [cells, setCells] = React.useState<Cell[]>(make);
  const [state, setState] = React.useState<"ready" | "on" | "won" | "lost">("ready");
  const [flagMode, setFlagMode] = React.useState(false);
  const [start, setStart] = React.useState(0);
  const [secs, setSecs] = React.useState(0);
  const { best, report } = useScores(lvl === "beginner" ? "minesweeper" : `minesweeper:${lvl}`);
  const press = React.useRef<number | null>(null);
  React.useEffect(() => (setCells(make()), setState("ready"), setSecs(0)), [lvl, make]);
  React.useEffect(() => {
    if (state !== "on") return;
    const t = window.setInterval(() => setSecs(Math.floor((Date.now() - start) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [state, start]);
  const near = (i: number) => {
    const x = i % W, y = Math.floor(i / W), out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) out.push((y + dy) * W + x + dx);
    return out;
  };
  const lay = (safe: number) => {
    const c = make();
    const avoid = new Set([safe, ...near(safe)]);
    let placed = 0;
    while (placed < MINES) {
      const i = Math.floor(Math.random() * W * H);
      if (!c[i]!.mine && !avoid.has(i)) (c[i]!.mine = true), placed++;
    }
    c.forEach((cell, i) => (cell.n = near(i).filter((j) => c[j]!.mine).length));
    return c;
  };
  const openFrom = (c: Cell[], list: number[]) => {
    const stack = [...list];
    let boom = false;
    while (stack.length) {
      const j = stack.pop()!;
      if (c[j]!.open || c[j]!.flag) continue;
      c[j]!.open = true;
      if (c[j]!.mine) boom = true;
      else if (c[j]!.n === 0) stack.push(...near(j).filter((k) => !c[k]!.open && !c[k]!.mine));
    }
    return boom;
  };
  const finish = (c: Cell[], boom: boolean) => {
    setCells(c);
    gameSfx(boom ? "lose" : "tap", boom ? 0.6 : 0.25);
    if (boom) {
      c.forEach((x) => x.mine && (x.open = true));
      return setState("lost");
    }
    if (c.filter((x) => !x.open).length === MINES) {
      setState("won");
      gameSfx("win");
      const s = Math.max(1, Math.round((Date.now() - (start || Date.now())) / 1000));
      void report(s, { level: lvl });
      void coins(lvl === "expert" ? 5 : lvl === "intermediate" ? 3 : 1);
    }
  };
  const toggleFlag = (i: number) => {
    if (state === "won" || state === "lost" || cells[i]!.open) return;
    setCells(cells.map((x, j) => (j === i ? { ...x, flag: !x.flag } : x)));
  };
  const reveal = (i: number) => {
    if (state === "won" || state === "lost") return;
    let c = cells.map((x) => ({ ...x }));
    if (state === "ready") (c = lay(i)), setState("on"), setStart(Date.now());
    if (flagMode) return toggleFlag(i);
    const cell = c[i]!;
    if (cell.flag) return;
    // Chording: clicking an open number whose flags are all placed opens the rest around it.
    if (cell.open && cell.n > 0) {
      const around = near(i);
      if (around.filter((k) => c[k]!.flag).length === cell.n) return finish(c, openFrom(c, around.filter((k) => !c[k]!.flag)));
      return;
    }
    finish(c, openFrom(c, [i]));
  };
  const COL = ["", "text-[#1a73e8]", "text-[#188038]", "text-[#d93025]", "text-[#8430ce]", "text-[#b06000]", "text-[#007b83]", "text-black", "text-gray-500"];
  return (
    <div className="space-y-2" data-game="minesweeper">
      <Pills label="Level" value={lvl} onChange={setLvl} options={[["beginner", "Beginner"], ["intermediate", "Intermediate"], ["expert", "Expert"]]} />
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{state === "won" ? `Cleared in ${secs}s!` : state === "lost" ? "Boom." : `${MINES - cells.filter((c) => c.flag).length} mines left · ${secs}s`}</span>
        <span className="flex gap-1">
          <Button size="xs" variant={flagMode ? "default" : "outline"} onClick={() => setFlagMode(!flagMode)} aria-pressed={flagMode}><FlagIcon /> Flag</Button>
          <Button size="xs" variant="outline" onClick={() => (setCells(make()), setState("ready"), setSecs(0))}><RotateCcwIcon /> New</Button>
        </span>
      </div>
      <div className="max-h-[60vh] overflow-auto">
        <div style={cellGrid(W)} className="gap-0.5 rounded-lg bg-muted p-1">
          {cells.map((c, i) => (
            <button
              key={i}
              type="button"
              onClick={() => (press.current === -1 ? (press.current = null) : reveal(i))}
              onContextMenu={(e) => (e.preventDefault(), toggleFlag(i))}
              onTouchStart={() => {
                const t = window.setTimeout(() => (toggleFlag(i), (press.current = -1), navigator.vibrate?.(30)), 420);
                press.current = t;
              }}
              onTouchEnd={() => press.current && press.current > 0 && (window.clearTimeout(press.current), (press.current = null))}
              className={cn("flex aspect-square items-center justify-center rounded-sm font-bold", W > 9 ? "text-[10px]" : "text-sm", c.open ? (c.mine ? "bg-[#ea4335] text-white" : "bg-background") : "bg-primary/25 hover:bg-primary/35", COL[c.n])}
              aria-label={c.open ? (c.mine ? "Mine" : String(c.n || "Empty")) : c.flag ? "Flagged" : "Hidden"}
            >
              {c.open ? (c.mine ? <BombIcon className="size-3.5" /> : c.n || "") : c.flag ? <FlagIcon className="size-3.5 text-[#d93025]" /> : ""}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Right-click, long-press or the Flag button marks a mine. Click a number whose mines are all flagged to open around it.</p>
      <ScoreBoard best={best} unit="s" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Tic-tac-toe

type TttMode = "3" | "4" | "gomoku";
const TTT: Record<TttMode, { n: number; k: number; label: string }> = { "3": { n: 3, k: 3, label: "3x3" }, "4": { n: 4, k: 4, label: "4x4, four in a row" }, gomoku: { n: 9, k: 5, label: "9x9, five in a row" } };
function lineAt(b: string[], n: number, k: number): number[] | null {
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = b[y * n + x];
      if (!v) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]] as const) {
        const cells = [];
        for (let i = 0; i < k; i++) {
          const xx = x + dx * i, yy = y + dy * i;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n || b[yy * n + xx] !== v) break;
          cells.push(yy * n + xx);
        }
        if (cells.length === k) return cells;
      }
    }
  return null;
}
function minimax(b: string[], me: boolean, depth: number): number {
  const w = lineAt(b, 3, 3);
  if (w) return b[w[0]!] === "O" ? 10 - depth : depth - 10;
  if (b.every(Boolean)) return 0;
  let best = me ? -99 : 99;
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = me ? "O" : "X";
    const s = minimax(b, !me, depth + 1);
    b[i] = "";
    best = me ? Math.max(best, s) : Math.min(best, s);
  }
  return best;
}
// Bigger boards: score each empty square by the lines it builds for the bot and blocks for you.
function heuristic(b: string[], n: number, k: number) {
  let best = -1, bestS = -1;
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  for (let i = 0; i < b.length; i++) {
    if (b[i]) continue;
    const x = i % n, y = Math.floor(i / n);
    let s = Math.random() * 0.5 + (n - Math.abs(x - (n - 1) / 2) - Math.abs(y - (n - 1) / 2)) * 0.1;
    for (const who of ["O", "X"]) {
      for (const [dx, dy] of dirs) {
        let run = 0;
        for (const sg of [1, -1]) for (let j = 1; j < k; j++) {
          const xx = x + dx * j * sg, yy = y + dy * j * sg;
          if (xx < 0 || yy < 0 || xx >= n || yy >= n || b[yy * n + xx] !== who) break;
          run++;
        }
        const v = run >= k - 1 ? 1000 : Math.pow(4, run);
        s += who === "O" ? v * 1.1 : v;
      }
    }
    if (s > bestS) (bestS = s), (best = i);
  }
  return best;
}
export function TicTacToe() {
  const [mode, setMode] = React.useState<TttMode>("3");
  const [level, setLevel] = React.useState<"easy" | "medium" | "hard">("hard");
  const { n, k } = TTT[mode];
  const [b, setB] = React.useState<string[]>(() => Array(9).fill(""));
  const [streak, setStreak] = React.useState(0);
  const [tally, setTally] = React.useState({ w: 0, l: 0, d: 0 });
  const { best, report } = useScores(mode === "3" ? "tictactoe" : `tictactoe:${mode}`);
  React.useEffect(() => setB(Array(n * n).fill("")), [n]);
  const w = lineAt(b, n, k);
  const draw = !w && b.length === n * n && b.every(Boolean);
  const play = (i: number) => {
    if (b[i] || w || draw) return;
    const nb = [...b];
    nb[i] = "X";
    gameSfx("tap", 0.35);
    if (lineAt(nb, n, k)) {
      gameSfx("win");
      const s = streak + 1;
      setStreak(s);
      setTally((t) => ({ ...t, w: t.w + 1 }));
      void report(s, { level });
      void coins(level === "hard" ? 2 : level === "medium" ? 1 : 0);
      return setB(nb);
    }
    const free = nb.map((v, j) => (v ? -1 : j)).filter((j) => j >= 0);
    if (free.length) {
      let pick = free[Math.floor(Math.random() * free.length)]!;
      const smart = level === "hard" || (level === "medium" && Math.random() < 0.6);
      if (smart) {
        if (n === 3) pick = free.map((j) => ({ j, s: (() => { const m = [...nb]; m[j] = "O"; return minimax(m, false, 0); })() })).sort((a, c) => c.s - a.s)[0]!.j;
        else pick = heuristic(nb, n, k);
      }
      nb[pick] = "O";
      if (lineAt(nb, n, k)) (setStreak(0), setTally((t) => ({ ...t, l: t.l + 1 })));
      else if (nb.every(Boolean)) setTally((t) => ({ ...t, d: t.d + 1 }));
    } else setTally((t) => ({ ...t, d: t.d + 1 }));
    setB(nb);
  };
  return (
    <div className="space-y-2" data-game="tictactoe">
      <Pills label="Board" value={mode} onChange={setMode} options={(Object.keys(TTT) as TttMode[]).map((m) => [m, TTT[m].label])} />
      <Pills label="Computer" value={level} onChange={setLevel} options={[["easy", "Easy"], ["medium", "Medium"], ["hard", "Hard"]]} />
      <div className="flex items-center justify-between text-sm">
        <span>{w ? (b[w[0]!] === "X" ? "You win!" : "The computer wins") : draw ? "Draw" : "You are X"} · streak {streak} · {tally.w}W {tally.l}L {tally.d}D</span>
        <Button size="xs" variant="outline" onClick={() => setB(Array(n * n).fill(""))}><RotateCcwIcon /> Again</Button>
      </div>
      <div style={cellGrid(n)} className={cn("mx-auto gap-1", n === 3 ? "max-w-64" : n === 4 ? "max-w-72" : "max-w-96")}>
        {b.map((v, i) => (
          <button key={i} type="button" onClick={() => play(i)} aria-label={v || `Square ${i + 1}`} className={cn("flex aspect-square items-center justify-center rounded-md border bg-card font-bold", n === 9 ? "text-base" : "text-4xl", w?.includes(i) && "bg-primary/15", v === "X" ? "text-primary" : "text-[#ea4335]")}>
            {v}
          </button>
        ))}
      </div>
      <ScoreBoard best={best} unit=" wins" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Word guess

const W5 = "about above actor adapt admit adopt after again agent agree ahead alarm album alert alive allow alone along alter angle angry apple apply arena argue arise array aside asset audio avoid award aware badge baker basic beach begin being below bench birth black blade blame blank blend block bloom board boost bound brain brand brave bread break brief bring broad brown brush build bunch buyer cabin cable candy carry catch cause chain chair chalk charm chart chase cheap check chess chief child civil claim class clean clear click climb clock close cloud coach coast color count court cover craft crane cream crisp crowd crown curve cycle daily dance delta dream dress drink drive early earth eight elite empty enjoy enter equal error event every exact exist extra faith false fancy feast fence field fight final first flame flash fleet float floor flour focus force forum found frame fresh front fruit funny ghost giant given glass globe glory grace grade grain grand grant grape grass great green group guard guess guide habit happy heart heavy honey horse hotel house human humor ideal image index inner input issue juice knife label large laser later laugh layer learn lemon level light limit lucky lunch magic major maker march match mayor medal media metal minor model money month motor mount mouse mouth movie music nerve never night noble noise north novel nurse ocean offer often olive onion orbit order other outer owner paint panel paper party peace pearl phone photo piano pilot pitch place plain plane plant plate point power press price pride prize proof proud queen quick quiet quote radio raise range rapid ratio reach ready relax reply ridge right river robot rough round route royal rugby scale scene score sense serve seven shade shape share sharp sheep shelf shell shift shine shirt shock shore short skill sleep slide smart smile smoke solid sound south space spare speak speed spice spoon sport staff stage stair stamp stand start steam steel stone store storm story sugar sunny super sweet swift table taste teach thank theme thick think tiger title toast today token tooth topic total touch tower track trade train treat trend trial tribe trick truck trust truth uncle under unity upper urban usual valid value video visit vital voice waste watch water wheel white whole woman world worry write youth zebra".split(" ");
const W4 = "able acid aged also area army away baby back ball band bank base bath bear beat bell best bird blue boat body bold bone book born boss both bowl bread burn busy cafe cake call calm camp card care cart case cash cell chat city clay club coal coat code coin cold cook cool copy core corn cost crew cute dark data date dawn deal dear deep desk diet door down draw drop drum duck dust duty each earn east easy edge else even exit face fact fair fall farm fast fear feel file fill film find fine fire firm fish five flag flat flow food foot form free frog fuel full fund gain game gate gift girl give glad goal gold golf good grow hair half hall hand hard head heal hear heat help hero high hill hold home hope horn host hour huge idea iron item jazz join joke jump keen keep kind king kite knee lake lamp land last late lead leaf left lift like line link lion list live load lock long look love luck mail main make many mark meal milk mind mint moon more most move much name near neat need nest news nice note open page park path peak pick plan play poem pool post pull pure race rain read real rest rice rich ride ring road rock roof room root rose rule safe sail salt sand save seed ship shoe shop show sign silk sing site size skin slow snow soft song soup star stay step stop sure swim tale talk tall team tent test time tool tour town tree trip true tune turn view vote walk wall warm wave week well west wide wild wind wing wise wish wood word work yard year zero zone".split(" ");
const W6 = "action active advice almost always amount animal answer anyone appear around artist attack autumn banana basket beauty became before better beyond bridge bright broken budget butter button camera candle carbon career castle center chance change charge choice circle client coffee colour common corner cotton course create credit custom damage danger decide degree design detail dinner direct doctor dollar double dragon driver during easily editor effect effort energy engine enough escape estate evening expert family father figure finger finish flight flower follow forest friend future garden gentle global golden ground growth guitar health heaven height honest hungry island jungle kitten ladder launch leader letter listen little lovely market master matter memory method middle minute mirror mobile modern moment mother motion museum nation nature number object office orange option orange parent people person planet player pocket points police potato prince profit public puzzle rabbit random reader reason record remote rescue result return rhythm rocket safety sample school screen search season second secret silver simple singer smooth social spirit spring square stable status strong studio summer sunset supply system talent target temple theory ticket timber toward travel useful valley victor violet wealth winner winter wisdom wonder worker yellow".split(" ");
const clean = (list: string[], n: number) => [...new Set(list.filter((w) => w.length === n))];
const BANK: Record<number, string[]> = { 4: clean(W4, 4), 5: clean(W5, 5), 6: clean(W6, 6) };
const dayIndex = () => Math.floor(Date.now() / 864e5);
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};
export function WordGuess() {
  const [len, setLen] = React.useState<4 | 5 | 6>(5);
  const [mode, setMode] = React.useState<"free" | "daily">("free");
  const [hard, setHard] = React.useState(false);
  const words = BANK[len]!;
  const pick = React.useCallback(() => (mode === "daily" ? words[(dayIndex() * 7919) % words.length]! : words[Math.floor(Math.random() * words.length)]!), [mode, words]);
  const [word, setWord] = React.useState(pick);
  const [rows, setRows] = React.useState<string[]>([]);
  const [cur, setCur] = React.useState("");
  const [streak, setStreak] = React.useState(0);
  const tries = len + 1;
  const { best, report } = useScores(mode === "daily" ? "wordguess:daily" : len === 5 ? "wordguess" : `wordguess:${len}`);
  const dailyKey = `myseed.word.daily.${len}.${dayIndex()}`;
  React.useEffect(() => {
    setWord(pick());
    setCur("");
    try {
      const saved = mode === "daily" ? (JSON.parse(localStorage.getItem(dailyKey) ?? "[]") as string[]) : [];
      setRows(saved);
    } catch {
      setRows([]);
    }
    try {
      setStreak(Number(localStorage.getItem("myseed.word.streak") ?? 0));
    } catch {}
  }, [len, mode, pick, dailyKey]);
  const won = rows.includes(word);
  const lost = !won && rows.length >= tries;
  const color = (g: string, i: number) => {
    if (word[i] === g[i]) return "bg-[#188038] text-white border-[#188038]";
    const rest = word.split("").filter((c, j) => g[j] !== c);
    const before = g.slice(0, i).split("").filter((c, j) => c === g[i] && word[j] !== c).length;
    return rest.filter((c) => c === g[i]).length > before ? "bg-[#F9AB00] text-white border-[#F9AB00]" : "bg-muted-foreground/50 text-white border-transparent";
  };
  const submit = () => {
    if (cur.length !== len || won || lost) return;
    // Hard mode: letters found must be used again.
    if (hard && rows.length) {
      const last = rows.at(-1)!;
      for (let i = 0; i < len; i++) if (last[i] === word[i] && cur[i] !== last[i]) return void toast.error(`Letter ${i + 1} must be ${last[i]!.toUpperCase()}`);
      for (const c of new Set(last.split("").filter((c) => word.includes(c)))) if (!cur.includes(c)) return void toast.error(`Use ${c.toUpperCase()} again`);
    }
    const r = [...rows, cur];
    setRows(r);
    setCur("");
    gameSfx(cur === word ? "win" : r.length >= tries ? "lose" : "flip", 0.4);
    if (mode === "daily") save(dailyKey, JSON.stringify(r));
    if (cur === word) {
      const s = streak + 1;
      setStreak(s);
      save("myseed.word.streak", String(s));
      void report(tries + 1 - r.length + (hard ? 2 : 0), { word, len, hard });
      void coins(mode === "daily" ? 3 : 1);
    } else if (r.length >= tries) (setStreak(0), save("myseed.word.streak", "0"));
  };
  const used = new Map<string, string>();
  rows.forEach((g) => g.split("").forEach((c, i) => {
    const k = color(g, i);
    if (!used.has(c) || k.includes("188038")) used.set(c, k);
  }));
  return (
    <div className="space-y-2" data-game="wordguess">
      <Pills label="Mode" value={mode} onChange={setMode} options={[["free", "Practice"], ["daily", "Today's word"]]} />
      <Pills label="Letters" value={len} onChange={setLen} options={[[4, "4"], [5, "5"], [6, "6"]]} />
      <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} /> Hard mode (found letters must be used)</label>
      <div className="flex items-center justify-between text-sm">
        <span>{won ? `Got it in ${rows.length}!` : lost ? `It was ${word.toUpperCase()}` : `Guess the ${len}-letter word`} · streak {streak}</span>
        {mode === "free" && <Button size="xs" variant="outline" onClick={() => (setWord(pick()), setRows([]), setCur(""))}><RotateCcwIcon /> New word</Button>}
      </div>
      <div className="mx-auto grid max-w-72 gap-1">
        {Array.from({ length: tries }, (_, r) => {
          const g = rows[r] ?? (r === rows.length ? cur.padEnd(len) : " ".repeat(len));
          return (
            <div key={r} style={cellGrid(len)} className="gap-1">
              {g.split("").map((c, i) => (
                <span key={i} className={cn("flex aspect-square items-center justify-center rounded border-2 text-lg font-bold uppercase", rows[r] ? color(rows[r]!, i) : c.trim() ? "border-foreground/40" : "border-muted")}>{c.trim()}</span>
              ))}
            </div>
          );
        })}
      </div>
      <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), submit())}>
        <input value={cur} onChange={(e) => setCur(e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, len))} maxLength={len} disabled={won || lost} aria-label="Your guess" placeholder="Type a word" className="h-9 flex-1 rounded-md border bg-background px-2 text-sm tracking-[.3em] uppercase" autoFocus />
        <Button size="sm" type="submit" disabled={cur.length !== len || won || lost}>Guess</Button>
      </form>
      <div className="flex flex-wrap justify-center gap-0.5">
        {"qwertyuiopasdfghjklzxcvbnm".split("").map((c) => (
          <button key={c} type="button" onClick={() => setCur((x) => (x + c).slice(0, len))} className={cn("h-7 w-6 rounded border text-xs uppercase", used.get(c) ?? "bg-card")}>{c}</button>
        ))}
        <button type="button" onClick={() => setCur((x) => x.slice(0, -1))} className="h-7 rounded border px-1.5 text-xs">Del</button>
      </div>
      <ScoreBoard best={best} unit=" pts" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Typing

const SENTENCES = [
  "Small steps every day add up to big results by the end of the month.",
  "Good teamwork means sharing what you know and asking when you are stuck.",
  "The quick brown fox jumps over the lazy dog while the cat watches calmly.",
  "Learning never exhausts the mind; it only makes the next lesson easier.",
  "Clear notes today save an hour of searching for answers tomorrow.",
  "A short break and a glass of water can make the afternoon much better.",
];
const QUOTES = [
  "The secret of getting ahead is getting started. (Mark Twain)",
  "It always seems impossible until it is done. (Nelson Mandela)",
  "Quality is not an act, it is a habit. (Aristotle)",
  "If you want to go fast, go alone. If you want to go far, go together. (African proverb)",
  "Simplicity is the ultimate sophistication. (Leonardo da Vinci)",
];
const COMMON = "the be to of and a in that have it for not on with he as you do at this but his by from they we say her she or an will my one all would there their what so up out if about who get which go me when make can like time no just him know take people into year your good some could them see other than then now look only come its over think also back after use two how our work first well way even new want because any these give day most us".split(" ");
type TypeMode = "sentence" | "w30" | "w60" | "quote" | "numbers";
export function Typing() {
  const [mode, setMode] = React.useState<TypeMode>("sentence");
  const make = React.useCallback((m: TypeMode) => {
    if (m === "quote") return QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
    if (m === "numbers") return Array.from({ length: 12 }, () => (Math.random() < 0.4 ? String(Math.floor(Math.random() * 999)) : COMMON[Math.floor(Math.random() * COMMON.length)]!) + (Math.random() < 0.25 ? [",", ".", "!", "?", ";"][Math.floor(Math.random() * 5)] : "")).join(" ");
    if (m === "w30" || m === "w60") return Array.from({ length: 80 }, () => COMMON[Math.floor(Math.random() * COMMON.length)]!).join(" ");
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)]!;
  }, []);
  const [text, setText] = React.useState(() => make("sentence"));
  const [typed, setTyped] = React.useState("");
  const [start, setStart] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const [result, setResult] = React.useState<{ wpm: number; acc: number } | null>(null);
  const limit = mode === "w30" ? 30 : mode === "w60" ? 60 : 0;
  const { best, report } = useScores(mode === "sentence" ? "typing" : `typing:${mode}`);
  const finish = React.useCallback((v: string, t0: number) => {
    const mins = (Date.now() - t0) / 60000 || 1 / 60;
    const right = v.split("").filter((c, i) => c === text[i]).length;
    const r = { wpm: Math.round(right / 5 / mins), acc: Math.round((right / Math.max(1, v.length)) * 100) };
    setResult(r);
    void report(r.wpm, { accuracy: r.acc, mode });
    if (r.acc >= 90) void coins(r.wpm >= 60 ? 2 : 1);
  }, [text, report, mode]);
  React.useEffect(() => {
    if (!start || result || !limit) return;
    const t = window.setInterval(() => {
      setNow(Date.now());
      if (Date.now() - start >= limit * 1000) finish(typed, start);
    }, 200);
    return () => window.clearInterval(t);
  }, [start, result, limit, typed, finish]);
  const reset = (m = mode) => (setText(make(m)), setTyped(""), setStart(null), setResult(null));
  const onType = (v: string) => {
    if (result) return;
    const t0 = start ?? Date.now();
    if (!start) setStart(t0);
    setTyped(v);
    if (!limit && v.length >= text.length) finish(v, t0);
  };
  const live = start && !result ? Math.round(typed.split("").filter((c, i) => c === text[i]).length / 5 / Math.max(1 / 60, (now - start) / 60000)) : 0;
  const shown = limit ? text.slice(0, Math.max(120, typed.length + 60)) : text;
  return (
    <div className="space-y-2" data-game="typing">
      <Pills label="Mode" value={mode} onChange={(m) => (setMode(m), reset(m))} options={[["sentence", "Sentence"], ["w30", "30 s sprint"], ["w60", "60 s sprint"], ["quote", "Quotes"], ["numbers", "Numbers and marks"]]} />
      {limit > 0 && start && !result && <p className="text-xs text-muted-foreground">{Math.max(0, limit - Math.floor((now - start) / 1000))}s left · {live} wpm</p>}
      <p className="rounded-lg bg-muted/60 p-3 font-mono text-sm leading-relaxed">
        {shown.split("").map((c, i) => (
          <span key={i} className={cn(i < typed.length ? (typed[i] === c ? "text-[#188038]" : "bg-[#ea4335]/20 text-[#d93025]") : i === typed.length ? "border-b-2 border-primary" : "text-muted-foreground")}>{c}</span>
        ))}
      </p>
      <textarea value={typed} onChange={(e) => onType(e.target.value)} disabled={!!result} rows={2} aria-label="Type the text" placeholder="Start typing; the clock starts with your first key" className="w-full rounded-md border bg-background p-2 font-mono text-sm" autoFocus />
      {result && <p className="text-center text-sm font-semibold">{result.wpm} words a minute, {result.acc}% right</p>}
      <Button size="xs" variant="outline" onClick={() => reset()}><RotateCcwIcon /> Another</Button>
      <ScoreBoard best={best} unit=" wpm" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Reaction games

type RMode = "classic" | "aim" | "sequence" | "stroop";
export function Reaction() {
  const [mode, setMode] = React.useState<RMode>("classic");
  return (
    <div className="space-y-2" data-game="reaction">
      <Pills label="Mode" value={mode} onChange={setMode} options={[["classic", "Reaction"], ["aim", "Aim trainer"], ["sequence", "Sequence memory"], ["stroop", "Colour words"]]} />
      {mode === "classic" ? <ReactionClassic /> : mode === "aim" ? <Aim /> : mode === "sequence" ? <Sequence /> : <Stroop />}
    </div>
  );
}

function ReactionClassic() {
  const [state, setState] = React.useState<"idle" | "wait" | "go" | "early" | "done">("idle");
  const [ms, setMs] = React.useState(0);
  const [runs, setRuns] = React.useState<number[]>([]);
  const t0 = React.useRef(0);
  const timer = React.useRef<number | null>(null);
  const { best, report } = useScores("reaction");
  React.useEffect(() => () => void (timer.current && window.clearTimeout(timer.current)), []);
  const click = () => {
    if (state === "idle" || state === "done" || state === "early") {
      setState("wait");
      timer.current = window.setTimeout(() => ((t0.current = performance.now()), setState("go")), 1200 + Math.random() * 2800);
    } else if (state === "wait") {
      if (timer.current) window.clearTimeout(timer.current);
      setState("early");
    } else {
      const r = Math.round(performance.now() - t0.current);
      setMs(r);
      setState("done");
      const all = [...runs, r].slice(-5);
      setRuns(all);
      void report(r);
      if (r < 250) void coins(1);
    }
  };
  const look = { idle: "bg-primary text-primary-foreground", wait: "bg-[#d93025] text-white", go: "bg-[#188038] text-white", early: "bg-[#F9AB00] text-black", done: "bg-primary text-primary-foreground" }[state];
  const say = { idle: "Click to start", wait: "Wait for green…", go: "CLICK!", early: "Too soon! Click to try again", done: `${ms} ms. Click to go again` }[state];
  return (
    <>
      <button type="button" onPointerDown={click} className={cn("flex h-48 w-full items-center justify-center rounded-xl text-xl font-bold select-none", look)}>{say}</button>
      {runs.length > 1 && <p className="text-center text-xs text-muted-foreground">Last {runs.length}: average {Math.round(runs.reduce((a, b) => a + b, 0) / runs.length)} ms</p>}
      <ScoreBoard best={best} unit=" ms" />
    </>
  );
}

function Aim() {
  const N = 20;
  const [hits, setHits] = React.useState(0);
  const [pos, setPos] = React.useState({ x: 50, y: 50, s: 14 });
  const [t0, setT0] = React.useState<number | null>(null);
  const [res, setRes] = React.useState<number | null>(null);
  const { best, report } = useScores("reaction:aim");
  const next = () => setPos({ x: 8 + Math.random() * 84, y: 10 + Math.random() * 80, s: 9 + Math.random() * 8 });
  const hit = () => {
    const start = t0 ?? performance.now();
    if (!t0) setT0(start);
    const h = hits + 1;
    setHits(h);
    if (h >= N) {
      const avg = Math.round((performance.now() - start) / N);
      setRes(avg);
      void report(avg);
      if (avg < 600) void coins(1);
    } else next();
  };
  return (
    <>
      <div className="relative h-60 w-full overflow-hidden rounded-xl bg-muted" data-aim>
        {res === null ? (
          <button type="button" onPointerDown={hit} aria-label="Target" className="absolute rounded-full border-4 border-white bg-[#ea4335] shadow" style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.s * 3}px`, height: `${pos.s * 3}px`, transform: "translate(-50%,-50%)" }} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm">
            <p className="text-lg font-bold">{res} ms a target</p>
            <Button size="sm" onClick={() => (setHits(0), setT0(null), setRes(null), next())}>Again</Button>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">{hits} of {N} targets. The clock starts with the first hit.</p>
      <ScoreBoard best={best} unit=" ms" />
    </>
  );
}

function Sequence() {
  const [seq, setSeq] = React.useState<number[]>([]);
  const [show, setShow] = React.useState<number | null>(null);
  const [input, setInput] = React.useState<number[]>([]);
  const [state, setState] = React.useState<"idle" | "show" | "you" | "over">("idle");
  const { best, report } = useScores("reaction:sequence");
  const play = (s: number[]) => {
    setState("show");
    setInput([]);
    s.forEach((c, i) => {
      window.setTimeout(() => setShow(c), 500 + i * 650);
      window.setTimeout(() => setShow(null), 500 + i * 650 + 420);
    });
    window.setTimeout(() => setState("you"), 500 + s.length * 650);
  };
  const begin = () => {
    const s = [Math.floor(Math.random() * 9)];
    setSeq(s);
    play(s);
  };
  const tap = (c: number) => {
    if (state !== "you") return;
    const inp = [...input, c];
    setInput(inp);
    setShow(c);
    window.setTimeout(() => setShow(null), 150);
    if (seq[inp.length - 1] !== c) {
      setState("over");
      void report(seq.length - 1);
      if (seq.length - 1 >= 8) void coins(2);
      return;
    }
    if (inp.length === seq.length) {
      const s = [...seq, Math.floor(Math.random() * 9)];
      setSeq(s);
      window.setTimeout(() => play(s), 500);
    }
  };
  return (
    <>
      <p className="text-sm">{state === "idle" ? "Watch the squares light up, then tap them in the same order." : state === "show" ? "Watch…" : state === "you" ? `Your turn: ${input.length}/${seq.length}` : `Level ${seq.length - 1}. Well remembered!`}</p>
      <div style={cellGrid(3)} className="mx-auto max-w-64 gap-2">
        {Array.from({ length: 9 }, (_, i) => <button key={i} type="button" onPointerDown={() => tap(i)} aria-label={`Square ${i + 1}`} className={cn("aspect-square rounded-xl border transition-colors", show === i ? "bg-primary" : "bg-muted hover:bg-muted/70")} />)}
      </div>
      {(state === "idle" || state === "over") && <Button size="sm" onClick={begin}><LightbulbIcon /> {state === "idle" ? "Start" : "Again"}</Button>}
      <ScoreBoard best={best} unit=" levels" />
    </>
  );
}

const SCOL = [["red", "#dc2626"], ["blue", "#2563eb"], ["green", "#16a34a"], ["yellow", "#ca8a04"]] as const;
function Stroop() {
  const [q, setQ] = React.useState({ word: 0, ink: 1 });
  const [score, setScore] = React.useState(0);
  const [end, setEnd] = React.useState<number | null>(null);
  const [now, setNow] = React.useState(Date.now());
  const { best, report } = useScores("reaction:stroop");
  const left = end ? Math.max(0, Math.ceil((end - now) / 1000)) : 30;
  const done = React.useRef(false);
  React.useEffect(() => {
    if (!end) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [end]);
  React.useEffect(() => {
    if (end && left === 0 && !done.current) {
      done.current = true;
      void report(score);
      if (score >= 25) void coins(2);
    }
  }, [end, left, score, report]);
  const next = () => setQ({ word: Math.floor(Math.random() * 4), ink: Math.floor(Math.random() * 4) });
  const answer = (c: number) => {
    if (!end) (setEnd(Date.now() + 30000), (done.current = false));
    if (end && left === 0) return;
    setScore((s) => (c === q.ink ? s + 1 : Math.max(0, s - 1)));
    next();
  };
  return (
    <>
      <p className="text-xs text-muted-foreground">Tap the colour of the ink, not the word. Thirty seconds; wrong taps cost a point.</p>
      <p className="py-6 text-center text-5xl font-black uppercase" style={{ color: SCOL[q.ink]![1] }}>{SCOL[q.word]![0]}</p>
      <div className="grid grid-cols-4 gap-1">{SCOL.map(([name, col], i) => <Button key={name} onClick={() => answer(i)} style={{ background: col }} className="text-white capitalize">{name}</Button>)}</div>
      <p className="text-center text-sm">{score} points · {left}s{end && left === 0 ? " · done!" : ""}</p>
      {end && left === 0 && <Button size="sm" variant="outline" onClick={() => (setScore(0), setEnd(null), next())}>Again</Button>}
      <ScoreBoard best={best} unit=" pts" />
    </>
  );
}
