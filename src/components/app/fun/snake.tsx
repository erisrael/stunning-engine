"use client";

import * as React from "react";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowLeftIcon, ArrowRightIcon, ArrowUpIcon, AwardIcon, PauseIcon, PlayIcon, RotateCcwIcon, Volume2Icon, VolumeXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { CATALOG } from "@/lib/fun-catalog";
import { ScoreBoard, useScores } from "./shell";

// Snake, the arcade way (after the classic phone game): ten modes, a maze campaign of ten levels, nine speeds, three
// board sizes, bonus bugs that are worth more the sooner they are eaten, golden apples (double points), combos for
// eating fast, skins (classic phone screen, neon, sunset, rainbow, gold) and achievements. Moves on a fixed clock,
// so it plays the same on any screen.

type Dir = 0 | 1 | 2 | 3; // up, right, down, left
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];
type Mode = "classic" | "endless" | "time" | "survival" | "speed" | "obstacle" | "maze" | "challenge" | "attack" | "party";
const MODES: { key: Mode; label: string; note: string }[] = [
  { key: "classic", label: "Classic", note: "Walls bite. Grow as long as you can." },
  { key: "endless", label: "Endless", note: "No walls: leave one side, come back on the other." },
  { key: "time", label: "Time attack", note: "Ninety seconds: score as much as you can." },
  { key: "survival", label: "Survival", note: "A new rock falls every fifteen seconds." },
  { key: "speed", label: "Speed run", note: "Every bite makes you faster." },
  { key: "obstacle", label: "Obstacles", note: "A field of rocks to weave through." },
  { key: "maze", label: "Maze campaign", note: "Ten levels of mazes. Eat 15 to open the next." },
  { key: "challenge", label: "Challenge", note: "Each apple must be eaten within eight seconds." },
  { key: "attack", label: "Score attack", note: "Sixty seconds, combos count double." },
  { key: "party", label: "Golden party", note: "Bonus food everywhere: a feast!" },
];
const SIZES = { small: 15, medium: 20, large: 26 } as const;

// The campaign's walls on a 20 x 20 board (scaled for other sizes): drawn as functions of x, y.
const MAZES: { name: string; wall: (x: number, y: number, n: number) => boolean }[] = [
  { name: "Open field", wall: () => false },
  { name: "Box", wall: (x, y, n) => x === 0 || y === 0 || x === n - 1 || y === n - 1 },
  { name: "Tunnel", wall: (x, y, n) => (y === Math.floor(n / 3) || y === Math.floor((2 * n) / 3)) && x > 2 && x < n - 3 },
  { name: "Mill", wall: (x, y, n) => { const c = Math.floor(n / 2); return (x === c && Math.abs(y - c) > 2 && Math.abs(y - c) < c - 2) || (y === c && Math.abs(x - c) > 2 && Math.abs(x - c) < c - 2); } },
  { name: "Rails", wall: (x, y, n) => (x === 3 || x === n - 4) && y > 2 && y < n - 3 },
  { name: "Apartment", wall: (x, y, n) => (x === 0 || y === 0 || x === n - 1 || y === n - 1) && !(x === Math.floor(n / 2) || y === Math.floor(n / 2)) },
  { name: "Cross", wall: (x, y, n) => { const c = Math.floor(n / 2); return (x === c || y === c) && Math.abs(x - c) + Math.abs(y - c) > 3 && Math.abs(x - c) < c - 1 && Math.abs(y - c) < c - 1; } },
  { name: "Spiral", wall: (x, y, n) => (y === 3 && x > 2 && x < n - 3) || (x === n - 4 && y > 2 && y < n - 6) || (y === n - 7 && x > 6 && x < n - 3) || (x === 7 && y > 6 && y < n - 6) },
  { name: "Comb", wall: (x, y, n) => x % 4 === 2 && (Math.floor(x / 4) % 2 ? y > 3 : y < n - 4) && x < n - 2 },
  { name: "Fortress", wall: (x, y, n) => (x === 0 || y === 0 || x === n - 1 || y === n - 1 || ((x === 5 || x === n - 6) && (y < 7 || y > n - 8)) || ((y === 5 || y === n - 6) && (x < 7 || x > n - 8))) && !(y === Math.floor(n / 2) && (x === 0 || x === n - 1)) },
];

type Food = { x: number; y: number; kind: "apple" | "bug" | "gold" | "slow" | "shrink"; until?: number };
type State = {
  n: number; snake: { x: number; y: number }[]; dir: Dir; queue: Dir[]; walls: Set<number>; foods: Food[]; score: number; eaten: number; combo: number; lastBite: number;
  over: boolean; won: boolean; tick: number; acc: number; start: number; gold: number; slow: number; nextRock: number; bugIn: number; trail: { x: number; y: number; a: number }[];
};

const SKINS = CATALOG.filter((i) => i.kind === "skin" && i.model === "snake");
const ACH = [
  { key: "first", label: "First bite", test: (s: State) => s.eaten >= 1 },
  { key: "ten", label: "Ten apples", test: (s: State) => s.eaten >= 10 },
  { key: "long", label: "Long snake (length 30)", test: (s: State) => s.snake.length >= 30 },
  { key: "500", label: "500 points", test: (s: State) => s.score >= 500 },
  { key: "combo", label: "Combo x5", test: (s: State) => s.combo >= 5 },
  { key: "giant", label: "Giant (length 60)", test: (s: State) => s.snake.length >= 60 },
];

function beep(on: boolean, f: number, d = 0.07) {
  if (!on) return;
  try {
    const a = new AudioContext();
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = "square";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.05, a.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
    o.connect(g).connect(a.destination);
    o.start();
    o.stop(a.currentTime + d);
    o.onended = () => void a.close();
  } catch {}
}

const store = {
  get<T>(k: string, d: T): T {
    try {
      return (JSON.parse(localStorage.getItem(k) ?? "null") as T) ?? d;
    } catch {
      return d;
    }
  },
  set(k: string, v: unknown) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

export function Snake() {
  const [mode, setMode] = React.useState<Mode>("classic");
  const [speedLvl, setSpeedLvl] = React.useState(5);
  const [size, setSize] = React.useState<keyof typeof SIZES>("medium");
  const [level, setLevel] = React.useState(0);
  const [unlocked, setUnlocked] = React.useState(1);
  const [skinKey, setSkinKey] = React.useState("skin.snake.classic");
  const [owned, setOwned] = React.useState<Set<string>>(new Set());
  const [sound, setSound] = React.useState(true);
  const [phase, setPhase] = React.useState<"menu" | "play" | "pause" | "over">("menu");
  const [view, setView] = React.useState({ score: 0, length: 3, combo: 0, left: 0, eaten: 0 });
  const [earned, setEarned] = React.useState<string[]>([]);
  const [ach, setAch] = React.useState<string[]>([]);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const st = React.useRef<State | null>(null);
  const raf = React.useRef(0);
  const soundRef = React.useRef(sound);
  soundRef.current = sound;
  const { best, report } = useScores(`snake:${mode === "maze" ? `maze` : mode}`);

  React.useEffect(() => {
    setUnlocked(store.get("myseed.snake.unlocked", 1));
    setAch(store.get("myseed.snake.ach", []));
    setSkinKey(store.get<string | null>("myseed.skin.snake", null) ?? "skin.snake.classic");
    setSound(store.get("myseed.snake.sound", true));
    void F.walletAction().then((r) => r.ok && r.data && setOwned(new Set(r.data.owned.map((o) => o.key))));
  }, []);
  const skin = SKINS.find((s) => s.key === skinKey) ?? SKINS[0]!;
  const usable = (k: string) => (SKINS.find((s) => s.key === k)?.price ?? 0) === 0 || owned.has(k);

  const tickMs = (s: State) => {
    let ms = Math.max(45, 210 - speedLvl * 18);
    if (mode === "speed") ms = Math.max(40, ms - s.eaten * 4);
    if (performance.now() < s.slow) ms *= 1.6;
    return ms;
  };
  const free = (s: State) => {
    const taken = new Set([...s.snake.map((p) => p.y * s.n + p.x), ...s.walls, ...s.foods.map((f) => f.y * s.n + f.x)]);
    for (let i = 0; i < 400; i++) {
      const x = Math.floor(Math.random() * s.n), y = Math.floor(Math.random() * s.n);
      if (!taken.has(y * s.n + x)) return { x, y };
    }
    return null;
  };
  const addFood = (s: State, kind: Food["kind"] = "apple") => {
    const p = free(s);
    if (!p) return;
    const now = performance.now();
    s.foods.push({ ...p, kind, until: kind === "apple" ? (mode === "challenge" ? now + 8000 : undefined) : now + (kind === "bug" ? 6000 : 9000) });
  };

  const start = (lvl = level) => {
    const n = mode === "maze" ? 20 : SIZES[size];
    const walls = new Set<number>();
    const maze = mode === "maze" ? MAZES[lvl]! : null;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (maze?.wall(x, y, n)) walls.add(y * n + x);
    const mid = Math.floor(n / 2);
    const snake = [{ x: 4, y: mid }, { x: 3, y: mid }, { x: 2, y: mid }];
    for (const p of snake) walls.delete(p.y * n + p.x);
    for (let x = 0; x < 8; x++) walls.delete(mid * n + x);
    const now = performance.now();
    const s: State = { n, snake, dir: 1, queue: [], walls, foods: [], score: 0, eaten: 0, combo: 0, lastBite: 0, over: false, won: false, tick: 0, acc: 0, start: now, gold: 0, slow: 0, nextRock: now + 15000, bugIn: 5, trail: [] };
    if (mode === "obstacle") for (let i = 0; i < Math.floor(n * n * 0.05); i++) {
      const p = free(s);
      if (p && Math.abs(p.y - mid) > 1) s.walls.add(p.y * n + p.x);
    }
    addFood(s);
    if (mode === "party") for (let i = 0; i < 6; i++) addFood(s, i % 2 ? "gold" : "bug");
    st.current = s;
    setEarned([]);
    setPhase("play");
    canvas.current?.focus();
  };

  const finish = React.useCallback(async (s: State, won = false) => {
    s.over = true;
    setPhase("over");
    beep(soundRef.current, won ? 880 : 140, 0.3);
    const key = mode === "maze" ? "maze" : mode;
    if (s.score > 0) await report(s.score, { mode: key, length: s.snake.length, speed: speedLvl, level: mode === "maze" ? level + 1 : undefined });
    if (s.score >= 100) {
      const r = await F.playRewardAction("game", Math.min(5, Math.floor(s.score / 100)));
      if (r.ok && r.data?.coins) toast.success(`+${r.data.coins} coins for that run`);
    }
  }, [mode, report, speedLvl, level]);

  // The game clock: steps on a fixed rhythm, draws every frame.
  React.useEffect(() => {
    if (phase !== "play") return;
    let last = performance.now();
    const frame = (now: number) => {
      raf.current = requestAnimationFrame(frame);
      const s = st.current;
      if (!s || s.over) return;
      s.acc += Math.min(250, now - last);
      last = now;
      let ms = tickMs(s);
      while (s.acc >= ms && !s.over) {
        s.acc -= ms;
        step(s, now);
        ms = tickMs(s);
      }
      draw(s, now);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, skinKey]);

  const step = (s: State, now: number) => {
    if (s.queue.length) {
      const d = s.queue.shift()!;
      if ((d + 2) % 4 !== s.dir) s.dir = d;
    }
    const h = s.snake[0]!;
    let x = h.x + DX[s.dir]!, y = h.y + DY[s.dir]!;
    const wrap = mode === "endless" || mode === "party" || mode === "time" || mode === "attack";
    if (wrap) (x = (x + s.n) % s.n), (y = (y + s.n) % s.n);
    const hitWall = x < 0 || y < 0 || x >= s.n || y >= s.n || s.walls.has(y * s.n + x);
    const hitSelf = s.snake.slice(0, -1).some((p) => p.x === x && p.y === y);
    if (hitWall || hitSelf) return void finish(s);
    s.snake.unshift({ x, y });
    s.trail.push({ x: h.x, y: h.y, a: 1 });
    if (s.trail.length > 30) s.trail.shift();
    const fi = s.foods.findIndex((f) => f.x === x && f.y === y);
    let grow = false;
    if (fi >= 0) {
      const f = s.foods.splice(fi, 1)[0]!;
      s.combo = now - s.lastBite < 3000 ? Math.min(5, s.combo + 1) : 1;
      s.lastBite = now;
      const mult = (now < s.gold ? 2 : 1) * (mode === "attack" ? s.combo * 2 : s.combo);
      const base = 5 + speedLvl;
      if (f.kind === "apple") {
        s.score += base * mult;
        s.eaten++;
        grow = true;
        addFood(s);
        if (--s.bugIn <= 0) (addFood(s, Math.random() < 0.3 ? "gold" : Math.random() < 0.5 ? "slow" : "bug"), (s.bugIn = 5));
        beep(soundRef.current, 520 + s.combo * 60);
      } else if (f.kind === "bug") {
        const left = Math.max(0, (f.until ?? now) - now) / 1000;
        s.score += Math.round((20 + left * 6) * mult);
        grow = true;
        beep(soundRef.current, 990, 0.12);
      } else if (f.kind === "gold") {
        s.gold = now + 10000;
        s.score += base * 3;
        beep(soundRef.current, 1200, 0.15);
      } else if (f.kind === "slow") {
        s.slow = now + 6000;
        beep(soundRef.current, 300, 0.15);
      } else if (f.kind === "shrink") s.snake.splice(-Math.min(4, s.snake.length - 3), 4);
      if (mode === "party" && s.foods.length < 6) addFood(s, Math.random() < 0.5 ? "bug" : "gold");
      if (mode === "maze" && s.eaten >= 15) {
        s.won = true;
        const next = Math.min(MAZES.length, Math.max(unlocked, level + 2));
        setUnlocked(next);
        store.set("myseed.snake.unlocked", next);
        toast.success(level + 1 < MAZES.length ? `Level ${level + 1} cleared! ${MAZES[level + 1]!.name} is open.` : "You cleared the whole campaign!");
        return void finish(s, true);
      }
    }
    if (!grow) s.snake.pop();
    // Food that runs out of time.
    for (const f of [...s.foods]) if (f.until && now > f.until) {
      s.foods.splice(s.foods.indexOf(f), 1);
      if (f.kind === "apple") {
        if (mode === "challenge") return void finish(s);
        addFood(s);
      }
    }
    if (!s.foods.some((f) => f.kind === "apple")) addFood(s);
    if (mode === "survival" && now > s.nextRock) {
      const p = free(s);
      if (p && Math.hypot(p.x - x, p.y - y) > 3) s.walls.add(p.y * s.n + p.x);
      s.nextRock = now + 15000;
    }
    const limit = mode === "time" ? 90 : mode === "attack" ? 60 : 0;
    const left = limit ? Math.max(0, Math.ceil(limit - (now - s.start) / 1000)) : 0;
    if (limit && left <= 0) return void finish(s, true);
    // Achievements.
    const got = ACH.filter((a) => !ach.includes(a.key) && a.test(s)).map((a) => a.key);
    if (got.length) {
      const all = [...new Set([...store.get<string[]>("myseed.snake.ach", []), ...got])];
      store.set("myseed.snake.ach", all);
      setAch(all);
      setEarned((e) => [...e, ...got]);
      for (const g of got) toast.success(`Achievement: ${ACH.find((a) => a.key === g)!.label}`);
    }
    setView({ score: s.score, length: s.snake.length, combo: s.combo, left, eaten: s.eaten });
  };

  const draw = (s: State, now: number) => {
    const c = canvas.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    const W = c.width;
    const cs = W / s.n;
    const [body, head, bg] = skin.colors ?? ["#34a853", "#8ef5a8", "#0f1a14"];
    const nokia = skin.key === "skin.snake.classic";
    g.fillStyle = nokia ? "#c7f0d8" : (bg ?? "#0f1a14");
    g.fillRect(0, 0, W, W);
    if (!nokia) {
      g.strokeStyle = "rgba(255,255,255,.04)";
      for (let i = 0; i <= s.n; i++) (g.beginPath(), g.moveTo(i * cs, 0), g.lineTo(i * cs, W), g.stroke(), g.beginPath(), g.moveTo(0, i * cs), g.lineTo(W, i * cs), g.stroke());
    }
    // Walls.
    g.fillStyle = nokia ? "#43523d" : "#64748b";
    for (const w of s.walls) g.fillRect((w % s.n) * cs + 1, Math.floor(w / s.n) * cs + 1, cs - 2, cs - 2);
    // Neon trail.
    if (skin.key === "skin.snake.neon" || skin.key === "skin.snake.rainbow") for (const t of s.trail) {
      t.a *= 0.92;
      g.fillStyle = `rgba(240,171,252,${t.a * 0.25})`;
      g.beginPath();
      g.arc(t.x * cs + cs / 2, t.y * cs + cs / 2, cs * 0.3, 0, Math.PI * 2);
      g.fill();
    }
    // Food.
    for (const f of s.foods) {
      const cx = f.x * cs + cs / 2, cy = f.y * cs + cs / 2;
      const pulse = 1 + Math.sin(now / 150) * 0.08;
      if (nokia) {
        g.fillStyle = "#43523d";
        g.fillRect(cx - cs * 0.25, cy - cs * 0.25, cs * 0.5, cs * 0.5);
        continue;
      }
      g.fillStyle = f.kind === "apple" ? "#ef4444" : f.kind === "bug" ? "#a855f7" : f.kind === "gold" ? "#facc15" : f.kind === "slow" ? "#38bdf8" : "#f97316";
      g.beginPath();
      if (f.kind === "gold") for (let i = 0; i < 10; i++) g.lineTo(cx + Math.cos((i * Math.PI) / 5) * cs * (i % 2 ? 0.18 : 0.42) * pulse, cy + Math.sin((i * Math.PI) / 5) * cs * (i % 2 ? 0.18 : 0.42) * pulse);
      else g.arc(cx, cy, cs * 0.38 * pulse, 0, Math.PI * 2);
      g.fill();
      if (f.kind === "apple") (g.fillStyle = "#16a34a"), g.fillRect(cx - 1, cy - cs * 0.48, 3, cs * 0.18);
      if (f.until && f.kind !== "apple") {
        g.strokeStyle = "#fff";
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, cs * 0.48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, (f.until - now) / (f.kind === "bug" ? 6000 : 9000)));
        g.stroke();
      }
    }
    // The snake.
    const n = s.snake.length;
    s.snake.forEach((p, i) => {
      let col = i === 0 ? (head ?? "#8ef5a8") : (body ?? "#34a853");
      if (body === "rainbow") col = `hsl(${(i * 18 + now / 10) % 360} 90% 60%)`;
      else if (skin.key === "skin.snake.sunset" && i) col = `hsl(${20 - (i / n) * 40} 95% ${60 - (i / n) * 15}%)`;
      if (now < s.gold && i % 2 === 0) col = "#fde047";
      g.fillStyle = nokia ? "#43523d" : col;
      const pad = i === 0 ? 0.5 : 1.5;
      if (nokia) g.fillRect(p.x * cs + 1, p.y * cs + 1, cs - 2, cs - 2);
      else {
        g.beginPath();
        g.roundRect(p.x * cs + pad, p.y * cs + pad, cs - pad * 2, cs - pad * 2, cs * 0.3);
        g.fill();
      }
      if (i === 0) {
        g.fillStyle = nokia ? "#c7f0d8" : "#111";
        const ex = DX[s.dir]!, ey = DY[s.dir]!;
        for (const sgn of [-1, 1]) g.fillRect(p.x * cs + cs / 2 + ex * cs * 0.18 + ey * sgn * cs * 0.18 - 2, p.y * cs + cs / 2 + ey * cs * 0.18 - ex * sgn * cs * 0.18 - 2, 4, 4);
      }
    });
  };

  const turn = (d: Dir) => {
    const s = st.current;
    if (phase === "menu" || phase === "over") return;
    if (phase === "pause") return;
    if (s && s.queue.length < 3) s.queue.push(d);
  };
  const onKey = (e: React.KeyboardEvent) => {
    const map: Record<string, Dir> = { ArrowUp: 0, w: 0, ArrowRight: 1, d: 1, ArrowDown: 2, s: 2, ArrowLeft: 3, a: 3 };
    if (e.key in map) (e.preventDefault(), phase === "menu" || phase === "over" ? start() : turn(map[e.key]!));
    else if (e.key === " " || e.key === "p") (e.preventDefault(), setPhase(phase === "play" ? "pause" : phase === "pause" ? "play" : phase));
  };
  // Swipes on touch screens.
  const touch = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <div className="space-y-2" data-game="snake">
      <div className="flex flex-wrap items-center gap-1 text-sm">
        <span className="mr-auto">Score <b className="tabular-nums">{view.score}</b> · length {view.length}{view.combo > 1 ? ` · combo x${view.combo}` : ""}{view.left ? ` · ${view.left}s` : ""}{mode === "maze" && phase !== "menu" ? ` · ${view.eaten}/15` : ""}</span>
        {phase === "play" || phase === "pause" ? (
          <Button size="xs" variant="outline" onClick={() => setPhase(phase === "play" ? "pause" : "play")} aria-label={phase === "play" ? "Pause" : "Resume"}>{phase === "play" ? <PauseIcon /> : <PlayIcon />}</Button>
        ) : null}
        <Button size="xs" variant="outline" onClick={() => start()} data-snake-restart><RotateCcwIcon /> {phase === "menu" ? "Start" : "Again"}</Button>
        <Button size="icon" variant="ghost" className="size-7" aria-label={sound ? "Sound off" : "Sound on"} onClick={() => (setSound(!sound), store.set("myseed.snake.sound", !sound))}>{sound ? <Volume2Icon /> : <VolumeXIcon />}</Button>
      </div>
      <div className="relative">
        <canvas
          ref={canvas}
          width={480}
          height={480}
          tabIndex={0}
          onKeyDown={onKey}
          onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
          onTouchEnd={(e) => {
            const t0 = touch.current;
            if (!t0) return;
            const dx = e.changedTouches[0]!.clientX - t0.x, dy = e.changedTouches[0]!.clientY - t0.y;
            if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return phase === "menu" || phase === "over" ? start() : undefined;
            turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
          }}
          className="aspect-square w-full touch-none rounded-lg border outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Snake: arrow keys or swipes to turn, Space to pause"
        />
        {phase !== "play" && (
          <div className="absolute inset-0 overflow-y-auto rounded-lg bg-black/70 p-3 text-white" data-snake-menu>
            {phase === "pause" ? (
              <div className="flex h-full flex-col items-center justify-center gap-2">
                <p className="text-lg font-bold">Paused</p>
                <Button onClick={() => setPhase("play")}><PlayIcon /> Resume</Button>
              </div>
            ) : (
              <div className="space-y-2 text-xs">
                {phase === "over" && (
                  <div className="text-center">
                    <p className="text-lg font-bold">{st.current?.won ? (mode === "maze" ? "Level cleared!" : "Time!") : "Bitten!"} {view.score} points</p>
                    <p>Length {view.length}{best?.mine ? ` · your best ${best.mine}` : ""}</p>
                    {earned.length > 0 && <p className="text-[#fde68a]">New: {earned.map((k) => ACH.find((a) => a.key === k)!.label).join(", ")}</p>}
                  </div>
                )}
                <p className="font-semibold">Mode</p>
                <div className="grid grid-cols-2 gap-1">
                  {MODES.map((m) => <button key={m.key} type="button" onClick={() => setMode(m.key)} className={cn("rounded border border-white/20 p-1 text-left", mode === m.key && "border-[#fde68a] bg-white/10")} data-snake-mode={m.key}><b>{m.label}</b><span className="block text-[10px] text-white/70">{m.note}</span></button>)}
                </div>
                {mode === "maze" ? (
                  <div>
                    <p className="font-semibold">Level</p>
                    <div className="flex flex-wrap gap-1">{MAZES.map((m, i) => <button key={m.name} type="button" disabled={i >= unlocked} onClick={() => setLevel(i)} className={cn("rounded border border-white/20 px-1.5 py-0.5 disabled:opacity-40", level === i && "border-[#fde68a] bg-white/10")}>{i + 1}. {m.name}</button>)}</div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="font-semibold">Board</span>
                    {(Object.keys(SIZES) as (keyof typeof SIZES)[]).map((k) => <button key={k} type="button" onClick={() => setSize(k)} className={cn("rounded border border-white/20 px-1.5 py-0.5 capitalize", size === k && "border-[#fde68a] bg-white/10")}>{k}</button>)}
                  </div>
                )}
                <label className="flex items-center gap-2"><span className="font-semibold">Speed {speedLvl}</span><input type="range" min={1} max={9} value={speedLvl} onChange={(e) => setSpeedLvl(Number(e.target.value))} className="flex-1" aria-label="Speed" /></label>
                <div>
                  <p className="font-semibold">Skin</p>
                  <div className="flex flex-wrap gap-1">
                    {SKINS.map((s) => (
                      <button key={s.key} type="button" disabled={!usable(s.key)} onClick={() => (setSkinKey(s.key), store.set("myseed.skin.snake", s.key))} title={usable(s.key) ? s.label : `${s.price} coins in the Corner Shop`} className={cn("flex items-center gap-1 rounded border border-white/20 px-1.5 py-0.5 disabled:opacity-40", skinKey === s.key && "border-[#fde68a] bg-white/10")} data-snake-skin={s.key}>
                        <span className="size-3 rounded-full" style={{ background: s.colors?.[0] === "rainbow" ? "linear-gradient(90deg,#f43f5e,#facc15,#22c55e,#3b82f6)" : s.colors?.[0] }} />
                        {s.label.replace("Snake: ", "")}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="flex flex-wrap items-center gap-1"><AwardIcon className="size-3.5" /> {ACH.map((a) => <span key={a.key} className={cn("rounded px-1", ach.includes(a.key) ? "bg-[#fde68a] text-black" : "bg-white/10 text-white/50")}>{a.label}</span>)}</p>
                <Button className="w-full" onClick={() => start()} data-snake-start><PlayIcon /> Play</Button>
              </div>
            )}
          </div>
        )}
      </div>
      <div className="mx-auto grid w-32 grid-cols-3 gap-1 sm:hidden">
        <span />
        <Button size="icon" variant="outline" aria-label="Up" onClick={() => turn(0)}><ArrowUpIcon /></Button>
        <span />
        <Button size="icon" variant="outline" aria-label="Left" onClick={() => turn(3)}><ArrowLeftIcon /></Button>
        <Button size="icon" variant="outline" aria-label="Down" onClick={() => turn(2)}><ArrowDownIcon /></Button>
        <Button size="icon" variant="outline" aria-label="Right" onClick={() => turn(1)}><ArrowRightIcon /></Button>
      </div>
      <ScoreBoard best={best} />
    </div>
  );
}
