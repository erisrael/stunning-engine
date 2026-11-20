"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, FlagIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BombIcon } from "lucide-react";
import { MEMORY_ICONS } from "./icons";
import { ScoreBoard, cellGrid, useScores } from "./shell";

// Small games for breaks. Each keeps the person's best score (shell.tsx); none earns points.

type Dir = "up" | "down" | "left" | "right";
const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", w: "up", s: "down", a: "left", d: "right" };

// Arrow keys on a focused box, swipes on touch screens, and arrow buttons.
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

// ------------------------------------------------------------------------------------------------- 2048
type Board = number[];
function slide(b: Board, d: Dir): { b: Board; gained: number; moved: boolean } {
  const out = Array<number>(16).fill(0);
  let gained = 0;
  for (let k = 0; k < 4; k++) {
    const idx = [0, 1, 2, 3].map((i) => (d === "left" ? k * 4 + i : d === "right" ? k * 4 + 3 - i : d === "up" ? i * 4 + k : (3 - i) * 4 + k));
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
const TILE: Record<number, string> = { 2: "bg-[#eee4da] text-[#776e65]", 4: "bg-[#ede0c8] text-[#776e65]", 8: "bg-[#f2b179] text-white", 16: "bg-[#f59563] text-white", 32: "bg-[#f67c5f] text-white", 64: "bg-[#f65e3b] text-white", 128: "bg-[#edcf72] text-white", 256: "bg-[#edcc61] text-white", 512: "bg-[#edc850] text-white", 1024: "bg-[#edc53f] text-white", 2048: "bg-[#edc22e] text-white" };

export function Game2048() {
  const fresh = () => addTile(addTile(Array<number>(16).fill(0)));
  const [b, setB] = React.useState<Board>(fresh);
  const [score, setScore] = React.useState(0);
  const { best, report } = useScores("2048");
  const over = (["up", "down", "left", "right"] as Dir[]).every((d) => !slide(b, d).moved);
  const reported = React.useRef(false);
  React.useEffect(() => {
    if (over && !reported.current && score) (reported.current = true), void report(score, { max: Math.max(...b) });
  }, [over, score, b, report]);
  const move = (d: Dir) => {
    const r = slide(b, d);
    if (!r.moved) return;
    setB(addTile(r.b));
    setScore((s) => s + r.gained);
  };
  const ref = useDirections(move);
  return (
    <div className="space-y-2" data-game="2048">
      <div className="flex items-center justify-between text-sm">
        <span>Score <b className="tabular-nums">{score}</b></span>
        <Button size="xs" variant="outline" onClick={() => (score && !reported.current && void report(score), (reported.current = false), setB(fresh()), setScore(0))}>
          <RotateCcwIcon /> New game
        </Button>
      </div>
      <div ref={ref} tabIndex={0} className="relative touch-none rounded-lg bg-[#bbada0] p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="2048 board: use the arrow keys or swipe">
        <div style={cellGrid(4)} className="gap-1.5">
          {b.map((v, i) => (
            <div key={i} className={cn("flex aspect-square items-center justify-center rounded-md text-xl font-bold transition-colors", v ? (TILE[v] ?? "bg-[#3c3a32] text-white") : "bg-[#cdc1b4]")}>
              {v || ""}
            </div>
          ))}
        </div>
        {over && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/45 text-lg font-bold text-white">Game over: {score}</div>}
      </div>
      <Pad onDir={move} />
      <ScoreBoard best={best} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Snake
export function Snake() {
  const N = 18;
  const [snake, setSnake] = React.useState<number[]>([N * 9 + 5, N * 9 + 4, N * 9 + 3]);
  const [food, setFood] = React.useState(N * 9 + 12);
  const [dir, setDir] = React.useState<Dir>("right");
  const [state, setState] = React.useState<"ready" | "on" | "dead">("ready");
  const dirRef = React.useRef(dir);
  const queued = React.useRef<Dir | null>(null);
  const { best, report } = useScores("snake");
  const turn = (d: Dir) => {
    const opp: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };
    if (state === "ready") setState("on");
    if (d !== opp[dirRef.current]) queued.current = d;
  };
  const ref = useDirections(turn);
  React.useEffect(() => {
    if (state !== "on") return;
    const t = window.setInterval(() => {
      if (queued.current) (dirRef.current = queued.current), setDir(queued.current), (queued.current = null);
      setSnake((s) => {
        const h = s[0]!;
        const x = h % N, y = Math.floor(h / N);
        const d = dirRef.current;
        const nx = d === "left" ? x - 1 : d === "right" ? x + 1 : x, ny = d === "up" ? y - 1 : d === "down" ? y + 1 : y;
        const nh = ny * N + nx;
        if (nx < 0 || ny < 0 || nx >= N || ny >= N || s.includes(nh)) {
          setState("dead");
          void report(s.length - 3);
          return s;
        }
        if (nh === food) {
          let f = food;
          while ([nh, ...s].includes(f)) f = Math.floor(Math.random() * N * N);
          setFood(f);
          return [nh, ...s];
        }
        return [nh, ...s.slice(0, -1)];
      });
    }, Math.max(60, 130 - snake.length * 2));
    return () => window.clearInterval(t);
  }, [state, food, report, snake.length]);
  const reset = () => (setSnake([N * 9 + 5, N * 9 + 4, N * 9 + 3]), setFood(N * 9 + 12), (dirRef.current = "right"), setDir("right"), setState("ready"));
  const set = new Set(snake);
  return (
    <div className="space-y-2" data-game="snake">
      <div className="flex items-center justify-between text-sm">
        <span>Length <b className="tabular-nums">{snake.length - 3}</b></span>
        <Button size="xs" variant="outline" onClick={reset}><RotateCcwIcon /> Again</Button>
      </div>
      <div ref={ref} tabIndex={0} className="relative touch-none rounded-lg border bg-[#0f1a14] p-1 outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Snake: press an arrow key or swipe to start">
        <div style={cellGrid(N)}>
          {Array.from({ length: N * N }, (_, i) => (
            <div key={i} className={cn("aspect-square", i === snake[0] ? "rounded-sm bg-[#8ef5a8]" : set.has(i) ? "rounded-sm bg-[#34a853]" : i === food ? "rounded-full bg-[#ea4335]" : "")} />
          ))}
        </div>
        {state !== "on" && (
          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-center text-sm font-semibold text-white">
            {state === "ready" ? "Press an arrow key or swipe to start" : `Bitten! Length ${snake.length - 3}`}
          </div>
        )}
      </div>
      <Pad onDir={turn} />
      <ScoreBoard best={best} />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Memory
const FACES = [0, 1, 2, 3, 4, 5, 6, 7];
export function Memory() {
  const deal = () => [...FACES.slice(0, 8), ...FACES.slice(0, 8)].sort(() => Math.random() - 0.5);
  const [cards, setCards] = React.useState<number[]>(deal);
  const [open, setOpen] = React.useState<number[]>([]);
  const [done, setDone] = React.useState<Set<number>>(new Set());
  const [moves, setMoves] = React.useState(0);
  const [start, setStart] = React.useState<number | null>(null);
  const [secs, setSecs] = React.useState(0);
  const { best, report } = useScores("memory");
  const won = done.size === 16;
  React.useEffect(() => {
    if (!start || won) return;
    const t = window.setInterval(() => setSecs(Math.round((Date.now() - start) / 1000)), 500);
    return () => window.clearInterval(t);
  }, [start, won]);
  const flip = (i: number) => {
    if (open.length === 2 || open.includes(i) || done.has(i)) return;
    if (!start) setStart(Date.now());
    const o = [...open, i];
    setOpen(o);
    if (o.length === 2) {
      setMoves((m) => m + 1);
      window.setTimeout(() => {
        if (cards[o[0]!] === cards[o[1]!]) {
          const d = new Set(done).add(o[0]!).add(o[1]!);
          setDone(d);
          if (d.size === 16) void report(Math.max(1, Math.round((Date.now() - (start ?? Date.now())) / 1000)), { moves: moves + 1 });
        }
        setOpen([]);
      }, 650);
    }
  };
  return (
    <div className="space-y-2" data-game="memory">
      <div className="flex items-center justify-between text-sm">
        <span>{moves} moves · {secs}s</span>
        <Button size="xs" variant="outline" onClick={() => (setCards(deal()), setOpen([]), setDone(new Set()), setMoves(0), setStart(null), setSecs(0))}><RotateCcwIcon /> Shuffle</Button>
      </div>
      <div style={cellGrid(4)} className="gap-1.5">
        {cards.map((c, i) => {
          const up = open.includes(i) || done.has(i);
          return (
            <button key={i} type="button" onClick={() => flip(i)} aria-label={up ? `Card ${c + 1}` : "Hidden card"} className={cn("flex aspect-square items-center justify-center rounded-lg border text-2xl transition-all duration-300", up ? "bg-card [transform:rotateY(0)]" : "bg-primary/80 [transform:rotateY(180deg)]", done.has(i) && "opacity-60")}>
              {up ? React.createElement(MEMORY_ICONS[c]!, { className: "size-6" }) : ""}
            </button>
          );
        })}
      </div>
      {won && <p className="text-center text-sm font-semibold text-primary">All pairs in {secs}s and {moves} moves!</p>}
      <ScoreBoard best={best} unit="s" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Minesweeper
export function Minesweeper() {
  const W = 9, MINES = 10;
  type Cell = { mine: boolean; n: number; open: boolean; flag: boolean };
  const make = (): Cell[] => Array.from({ length: W * W }, () => ({ mine: false, n: 0, open: false, flag: false }));
  const [cells, setCells] = React.useState<Cell[]>(make);
  const [state, setState] = React.useState<"ready" | "on" | "won" | "lost">("ready");
  const [flagMode, setFlagMode] = React.useState(false);
  const [start, setStart] = React.useState(0);
  const { best, report } = useScores("minesweeper");
  const near = (i: number) => {
    const x = i % W, y = Math.floor(i / W), out: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < W) out.push((y + dy) * W + x + dx);
    return out;
  };
  const lay = (safe: number) => {
    const c = make();
    const avoid = new Set([safe, ...near(safe)]);
    let placed = 0;
    while (placed < MINES) {
      const i = Math.floor(Math.random() * W * W);
      if (!c[i]!.mine && !avoid.has(i)) (c[i]!.mine = true), placed++;
    }
    c.forEach((cell, i) => (cell.n = near(i).filter((j) => c[j]!.mine).length));
    return c;
  };
  const reveal = (i: number) => {
    if (state === "won" || state === "lost") return;
    let c = cells.map((x) => ({ ...x }));
    if (state === "ready") (c = lay(i)), setState("on"), setStart(Date.now());
    if (flagMode) {
      if (!c[i]!.open) c[i]!.flag = !c[i]!.flag;
      return setCells(c);
    }
    if (c[i]!.flag) return;
    if (c[i]!.mine) {
      c.forEach((x) => x.mine && (x.open = true));
      setCells(c);
      return setState("lost");
    }
    const stack = [i];
    while (stack.length) {
      const j = stack.pop()!;
      if (c[j]!.open) continue;
      c[j]!.open = true;
      if (c[j]!.n === 0) stack.push(...near(j).filter((k) => !c[k]!.open && !c[k]!.mine));
    }
    setCells(c);
    if (c.filter((x) => !x.open).length === MINES) {
      setState("won");
      void report(Math.max(1, Math.round((Date.now() - (start || Date.now())) / 1000)));
    }
  };
  const COL = ["", "text-[#1a73e8]", "text-[#188038]", "text-[#d93025]", "text-[#8430ce]", "text-[#b06000]", "text-[#007b83]", "text-black", "text-gray-500"];
  return (
    <div className="space-y-2" data-game="minesweeper">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span>{state === "won" ? "Cleared!" : state === "lost" ? "Boom." : `${MINES - cells.filter((c) => c.flag).length} mines left`}</span>
        <span className="flex gap-1">
          <Button size="xs" variant={flagMode ? "default" : "outline"} onClick={() => setFlagMode(!flagMode)} aria-pressed={flagMode}><FlagIcon /> Flag</Button>
          <Button size="xs" variant="outline" onClick={() => (setCells(make()), setState("ready"))}><RotateCcwIcon /> New</Button>
        </span>
      </div>
      <div style={cellGrid(W)} className="gap-0.5 rounded-lg bg-muted p-1">
        {cells.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => reveal(i)}
            onContextMenu={(e) => {
              e.preventDefault();
              if (c.open || state === "won" || state === "lost") return;
              setCells(cells.map((x, j) => (j === i ? { ...x, flag: !x.flag } : x)));
            }}
            className={cn("flex aspect-square items-center justify-center rounded-sm text-sm font-bold", c.open ? (c.mine ? "bg-[#ea4335] text-white" : "bg-background") : "bg-primary/25 hover:bg-primary/35", COL[c.n])}
            aria-label={c.open ? (c.mine ? "Mine" : String(c.n || "Empty")) : c.flag ? "Flagged" : "Hidden"}
          >
            {c.open ? (c.mine ? <BombIcon className="size-4" /> : c.n || "") : c.flag ? <FlagIcon className="size-4 text-[#d93025]" /> : ""}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">Right-click (or the Flag button) marks a mine.</p>
      <ScoreBoard best={best} unit="s" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Tic-tac-toe
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const winner = (b: string[]) => LINES.find((l) => b[l[0]!] && b[l[0]!] === b[l[1]!] && b[l[0]!] === b[l[2]!]);
function minimax(b: string[], me: boolean): number {
  const w = winner(b);
  if (w) return b[w[0]!] === "O" ? 10 : -10;
  if (b.every(Boolean)) return 0;
  const scores = b.map((v, i) => (v ? null : (() => { const n = [...b]; n[i] = me ? "O" : "X"; return minimax(n, !me); })())).filter((x): x is number => x !== null);
  return me ? Math.max(...scores) : Math.min(...scores);
}
export function TicTacToe() {
  const [b, setB] = React.useState<string[]>(Array(9).fill(""));
  const [level, setLevel] = React.useState<"easy" | "hard">("hard");
  const [streak, setStreak] = React.useState(0);
  const { best, report } = useScores("tictactoe");
  const w = winner(b);
  const draw = !w && b.every(Boolean);
  const play = (i: number) => {
    if (b[i] || w || draw) return;
    const n = [...b];
    n[i] = "X";
    if (winner(n)) {
      const s = streak + 1;
      setStreak(s);
      void report(s);
      return setB(n);
    }
    const free = n.map((v, j) => (v ? -1 : j)).filter((j) => j >= 0);
    if (free.length) {
      let pick = free[Math.floor(Math.random() * free.length)]!;
      if (level === "hard") pick = free.map((j) => ({ j, s: (() => { const m = [...n]; m[j] = "O"; return minimax(m, false); })() })).sort((a, c) => c.s - a.s)[0]!.j;
      n[pick] = "O";
      if (winner(n)) setStreak(0);
    }
    setB(n);
  };
  return (
    <div className="space-y-2" data-game="tictactoe">
      <div className="flex items-center justify-between text-sm">
        <span>{w ? (b[w[0]!] === "X" ? "You win!" : "The computer wins") : draw ? "Draw" : "You are X"} · streak {streak}</span>
        <span className="flex gap-1">
          <Button size="xs" variant="outline" onClick={() => setLevel(level === "hard" ? "easy" : "hard")}>{level === "hard" ? "Hard" : "Easy"}</Button>
          <Button size="xs" variant="outline" onClick={() => setB(Array(9).fill(""))}><RotateCcwIcon /> Again</Button>
        </span>
      </div>
      <div style={cellGrid(3)} className="mx-auto max-w-64 gap-1.5">
        {b.map((v, i) => (
          <button key={i} type="button" onClick={() => play(i)} aria-label={v || `Square ${i + 1}`} className={cn("flex aspect-square items-center justify-center rounded-lg border bg-card text-4xl font-bold", w?.includes(i) && "bg-primary/15", v === "X" ? "text-primary" : "text-[#ea4335]")}>
            {v}
          </button>
        ))}
      </div>
      <ScoreBoard best={best} unit=" wins" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Word guess
const WORDS = "about above actor adapt admit adopt after again agent agree ahead alarm album alert alive allow alone along alter angle angry apple apply arena argue arise array aside asset audio avoid award aware badge baker basic beach begin being below bench birth black blade blame blank blend block bloom board boost bound brain brand brave bread break brief bring broad brown brush build bunch buyer cabin cable candy carry catch cause chain chair chalk charm chart chase cheap check chess chief child civil claim class clean clear click climb clock close cloud coach coast color count court cover craft crane cream crisp crowd crown curve cycle daily dance delta dream dress drink drive early earth eight elite empty enjoy enter equal error event every exact exist extra faith false fancy feast fence field fight final first flame flash fleet float floor flour focus force forum found frame fresh front fruit funny ghost giant given glass globe glory grace grade grain grand grant grape grass great green group guard guess guide habit happy heart heavy honey horse hotel house human humor ideal image index inner input issue juice knife label large laser later laugh layer learn lemon level light limit lucky lunch magic major maker march match mayor medal media metal minor model money month motor mount mouse mouth movie music nerve never night noble noise north novel nurse ocean offer often olive onion orbit order other outer owner paint panel paper party peace pearl phone photo piano pilot pitch place plain plane plant plate point power press price pride prize proof proud queen quick quiet quote radio raise range rapid ratio reach ready relax reply ridge right river robot rough round route royal rugby scale scene score sense serve seven shade shape share sharp sheep shelf shell shift shine shirt shock shore short skill sleep slide smart smile smoke solid sound south space spare speak speed spice spoon sport staff stage stair stamp stand start steam steel stone store storm story sugar sunny super sweet swift table taste teach thank theme thick think tiger title toast today token tooth topic total touch tower track trade train treat trend trial tribe trick truck trust truth uncle under unity upper urban usual valid value video visit vital voice waste watch water wheel white whole woman world worry write youth zebra".split(" ");
export function WordGuess() {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]!;
  const [word, setWord] = React.useState(pick);
  const [rows, setRows] = React.useState<string[]>([]);
  const [cur, setCur] = React.useState("");
  const { best, report } = useScores("wordguess");
  const won = rows.includes(word);
  const lost = !won && rows.length >= 6;
  const submit = () => {
    if (cur.length !== 5 || won || lost) return;
    const r = [...rows, cur];
    setRows(r);
    setCur("");
    if (cur === word) void report(7 - r.length, { word });
  };
  const color = (g: string, i: number) => {
    if (word[i] === g[i]) return "bg-[#188038] text-white border-[#188038]";
    // Count letters not already matched in place, so repeated letters are marked fairly.
    const rest = word.split("").filter((c, j) => g[j] !== c);
    const before = g.slice(0, i).split("").filter((c, j) => c === g[i] && word[j] !== c).length;
    return rest.filter((c) => c === g[i]).length > before ? "bg-[#F9AB00] text-white border-[#F9AB00]" : "bg-muted-foreground/50 text-white border-transparent";
  };
  const used = new Map<string, string>();
  rows.forEach((g) => g.split("").forEach((c, i) => {
    const k = color(g, i);
    if (!used.has(c) || k.includes("188038")) used.set(c, k);
  }));
  return (
    <div className="space-y-2" data-game="wordguess">
      <div className="flex items-center justify-between text-sm">
        <span>{won ? `Got it in ${rows.length}!` : lost ? `It was ${word.toUpperCase()}` : "Guess the five-letter word"}</span>
        <Button size="xs" variant="outline" onClick={() => (setWord(pick()), setRows([]), setCur(""))}><RotateCcwIcon /> New word</Button>
      </div>
      <div className="mx-auto grid max-w-64 gap-1">
        {Array.from({ length: 6 }, (_, r) => {
          const g = rows[r] ?? (r === rows.length ? cur.padEnd(5) : "     ");
          return (
            <div key={r} className="grid grid-cols-5 gap-1">
              {g.split("").map((c, i) => (
                <span key={i} className={cn("flex aspect-square items-center justify-center rounded border-2 text-lg font-bold uppercase", rows[r] ? color(rows[r]!, i) : c.trim() ? "border-foreground/40" : "border-muted")}>{c.trim()}</span>
              ))}
            </div>
          );
        })}
      </div>
      <form className="flex gap-1" onSubmit={(e) => (e.preventDefault(), submit())}>
        <input value={cur} onChange={(e) => setCur(e.target.value.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5))} maxLength={5} disabled={won || lost} aria-label="Your guess" placeholder="Type a word" className="h-9 flex-1 rounded-md border bg-background px-2 text-sm tracking-[.3em] uppercase" autoFocus />
        <Button size="sm" type="submit" disabled={cur.length !== 5 || won || lost}>Guess</Button>
      </form>
      <div className="flex flex-wrap justify-center gap-0.5">
        {"qwertyuiopasdfghjklzxcvbnm".split("").map((c) => (
          <button key={c} type="button" onClick={() => setCur((x) => (x + c).slice(0, 5))} className={cn("h-7 w-6 rounded border text-xs uppercase", used.get(c) ?? "bg-card")}>{c}</button>
        ))}
      </div>
      <ScoreBoard best={best} unit=" pts" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Typing race
const SENTENCES = [
  "Small steps every day add up to big results by the end of the month.",
  "Good teamwork means sharing what you know and asking when you are stuck.",
  "The quick brown fox jumps over the lazy dog while the cat watches calmly.",
  "Learning never exhausts the mind; it only makes the next lesson easier.",
  "Clear notes today save an hour of searching for answers tomorrow.",
  "A short break and a glass of water can make the afternoon much better.",
];
export function Typing() {
  const [text, setText] = React.useState(() => SENTENCES[Math.floor(Math.random() * SENTENCES.length)]!);
  const [typed, setTyped] = React.useState("");
  const [start, setStart] = React.useState<number | null>(null);
  const [result, setResult] = React.useState<{ wpm: number; acc: number } | null>(null);
  const { best, report } = useScores("typing");
  const onType = (v: string) => {
    if (result) return;
    if (!start) setStart(Date.now());
    setTyped(v);
    if (v.length >= text.length) {
      const mins = (Date.now() - (start ?? Date.now())) / 60000 || 1 / 60;
      const right = v.split("").filter((c, i) => c === text[i]).length;
      const r = { wpm: Math.round(right / 5 / mins), acc: Math.round((right / text.length) * 100) };
      setResult(r);
      void report(r.wpm, { accuracy: r.acc });
    }
  };
  return (
    <div className="space-y-2" data-game="typing">
      <p className="rounded-lg bg-muted/60 p-3 font-mono text-sm leading-relaxed">
        {text.split("").map((c, i) => (
          <span key={i} className={cn(i < typed.length ? (typed[i] === c ? "text-[#188038]" : "bg-[#ea4335]/20 text-[#d93025]") : i === typed.length ? "border-b-2 border-primary" : "text-muted-foreground")}>{c}</span>
        ))}
      </p>
      <textarea value={typed} onChange={(e) => onType(e.target.value)} disabled={!!result} rows={2} aria-label="Type the sentence" placeholder="Start typing; the clock starts with your first key" className="w-full rounded-md border bg-background p-2 font-mono text-sm" autoFocus />
      {result && <p className="text-center text-sm font-semibold">{result.wpm} words a minute, {result.acc}% right</p>}
      <Button size="xs" variant="outline" onClick={() => (setText(SENTENCES[Math.floor(Math.random() * SENTENCES.length)]!), setTyped(""), setStart(null), setResult(null))}><RotateCcwIcon /> Another</Button>
      <ScoreBoard best={best} unit=" wpm" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- Reaction time
export function Reaction() {
  const [state, setState] = React.useState<"idle" | "wait" | "go" | "early" | "done">("idle");
  const [ms, setMs] = React.useState(0);
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
      void report(r);
    }
  };
  const look = { idle: "bg-primary text-primary-foreground", wait: "bg-[#d93025] text-white", go: "bg-[#188038] text-white", early: "bg-[#F9AB00] text-black", done: "bg-primary text-primary-foreground" }[state];
  const say = { idle: "Click to start", wait: "Wait for green…", go: "CLICK!", early: "Too soon! Click to try again", done: `${ms} ms. Click to go again` }[state];
  return (
    <div className="space-y-2" data-game="reaction">
      <button type="button" onPointerDown={click} className={cn("flex h-48 w-full items-center justify-center rounded-xl text-xl font-bold select-none", look)}>{say}</button>
      <ScoreBoard best={best} unit=" ms" />
    </div>
  );
}
