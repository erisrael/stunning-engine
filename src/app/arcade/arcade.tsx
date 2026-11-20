"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronLeftIcon, Gamepad2Icon, Loader2Icon, Maximize2Icon, Minimize2Icon } from "lucide-react";
import { setFunActions } from "@/components/app/fun/actions";
import { guestActions } from "@/components/app/fun/guest-actions";
import { GAME_ICONS } from "@/components/app/fun/icons";
import { cn } from "@/lib/utils";

// The guest arcade: an arcade machine (marquee, screen, control deck) with Seed Town and the arcade games. Guests
// play without an account; scores, coins and their look stay in this browser. Nothing here leads out: links that
// would leave /arcade are stopped, and in kiosk mode (the Windows app's arcade mode, the Android app) right-click,
// new windows and the back button stay inside too.

const Loading = () => (
  <p className="flex h-full items-center justify-center gap-2 font-[family-name:var(--font-vt323)] text-2xl text-[#7dd3fc]">
    <Loader2Icon className="size-5 animate-spin" /> LOADING
  </p>
);
const G = (k: "Game2048" | "Snake" | "Memory" | "Minesweeper" | "TicTacToe" | "WordGuess" | "Typing" | "Reaction") => dynamic(() => import("@/components/app/fun/games").then((m) => m[k]), { ssr: false, loading: Loading });
const GAMES: Record<string, React.ComponentType> = {
  world: dynamic(() => import("@/components/app/fun/world").then((m) => function Town() {
    return <m.SeedTown fill />;
  }), { ssr: false, loading: Loading }),
  chess: dynamic(() => import("@/components/app/fun/chess").then((m) => m.ChessGame), { ssr: false, loading: Loading }),
  sudoku: dynamic(() => import("@/components/app/fun/sudoku").then((m) => m.Sudoku), { ssr: false, loading: Loading }),
  "2048": G("Game2048"),
  snake: G("Snake"),
  memory: G("Memory"),
  minesweeper: G("Minesweeper"),
  tictactoe: G("TicTacToe"),
  wordguess: G("WordGuess"),
  typing: G("Typing"),
  reaction: G("Reaction"),
};

type Home = { items: { key: string }[] } & Record<string, unknown>;
type GameInfo = { key: string; label: string; note: string };

export function Arcade({ open, games, home, kiosk }: { open: boolean; games: GameInfo[]; home: Home | null; kiosk: boolean }) {
  // Guest versions of the Fun actions while the arcade is open (before any game renders).
  const [ready] = React.useState(() => {
    if (typeof window !== "undefined") setFunActions(guestActions(home?.items ?? [], home));
    return true;
  });
  React.useEffect(() => () => setFunActions(null), []);
  const list = React.useMemo(() => [...(home ? [{ key: "world", label: "Seed Town 3D", note: "Drive, race, shoot, explore the city" }] : []), ...games.filter((g) => g.key !== "world" && GAMES[g.key])], [games, home]);
  const [game, setGame] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState(0);
  const [full, setFull] = React.useState(false);
  const [clock, setClock] = React.useState("");

  // Nothing leaves the arcade: links out are stopped; in kiosk mode also right-click and new windows.
  React.useEffect(() => {
    const stop = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin === window.location.origin && u.pathname.startsWith("/arcade")) return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("click", stop, true);
    const menu = (e: Event) => kiosk && e.preventDefault();
    document.addEventListener("contextmenu", menu);
    const open0 = window.open;
    if (kiosk) window.open = () => null;
    // Other games and Seed Town ask for a game by event (the arcade cabinet in town opens Snake).
    const cmd = (e: Event) => {
      const g = (e as CustomEvent<{ game?: string }>).detail?.game;
      if (g && GAMES[g]) setGame(g);
    };
    window.addEventListener("myseed-fun", cmd);
    // Android: the back button returns to the game list instead of leaving.
    const cap = (window as unknown as { Capacitor?: { Plugins?: { App?: { addListener: (n: string, f: () => void) => Promise<{ remove: () => void }> } } } }).Capacitor;
    const back = cap?.Plugins?.App?.addListener("backButton", () => setGame(null));
    // The Windows app's kiosk: Ctrl+Shift+Q asks for the staff PIN to leave.
    const desk = (window as unknown as { seedDesktop?: { askLeave?: () => Promise<unknown> } }).seedDesktop;
    const leave = (e: KeyboardEvent) => {
      if (desk?.askLeave && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "q") (e.preventDefault(), void desk.askLeave());
    };
    window.addEventListener("keydown", leave, true);
    const fs = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fs);
    const tick = () => setClock(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    tick();
    const id = window.setInterval(tick, 15000);
    return () => {
      document.removeEventListener("click", stop, true);
      document.removeEventListener("contextmenu", menu);
      window.open = open0;
      window.removeEventListener("myseed-fun", cmd);
      void back?.then((h) => h.remove());
      document.removeEventListener("fullscreenchange", fs);
      window.removeEventListener("keydown", leave, true);
      window.clearInterval(id);
    };
  }, [kiosk]);

  // The game list: arrows move, Enter or Space starts.
  React.useEffect(() => {
    if (game) return;
    const k = (e: KeyboardEvent) => {
      const cols = window.innerWidth >= 1024 ? 4 : window.innerWidth >= 640 ? 3 : 2;
      const d = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
      if (d) {
        e.preventDefault();
        setSel((s) => Math.max(0, Math.min(list.length - 1, s + d)));
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (list[sel]) setGame(list[sel]!.key);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [game, list, sel]);

  const Game = game ? GAMES[game] : null;
  const info = list.find((g) => g.key === game);
  const toggleFull = () => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.().catch(() => {}));

  return (
    <div className={cn("arcade flex min-h-dvh flex-col items-center bg-[var(--arc-bg)] text-[var(--arc-ink)] select-none", game === "world" && "h-dvh")} data-arcade data-kiosk={kiosk ? "1" : undefined}>
      <style>{ARCADE_CSS}</style>
      <div className={cn("flex w-full max-w-[1500px] flex-1 flex-col px-2 pt-2 sm:px-4 sm:pt-3", game === "world" && "min-h-0")}>
        {/* The marquee. */}
        <header className={cn("arc-marquee relative flex shrink-0 items-center justify-center overflow-hidden rounded-t-[22px] border-x-4 border-t-4 border-[var(--arc-trim)]", game ? "h-11 sm:h-12" : "h-20 sm:h-24")}>
          <div className="arc-lights absolute inset-x-0 top-1" aria-hidden />
          <div className="arc-lights absolute inset-x-0 bottom-1" aria-hidden />
          <h1 className={cn("arc-neon font-[family-name:var(--font-vt323)] tracking-[0.18em]", game ? "text-2xl sm:text-3xl" : "text-4xl sm:text-6xl")}>MYSEED ARCADE</h1>
        </header>

        {/* The screen in its bezel. */}
        <main className={cn("arc-bezel relative flex flex-col border-x-4 border-[var(--arc-trim)] p-2 sm:p-4", game === "world" ? "min-h-0 flex-1" : "flex-1")}>
          <div className={cn("arc-screen relative flex flex-1 flex-col overflow-hidden rounded-[14px]", game === "world" && "min-h-0")}>
            {!game || !Game ? (
              <div className="arc-crt flex flex-1 flex-col px-3 py-4 sm:px-8 sm:py-6" data-arcade-menu>
                {!open ? (
                  <p className="m-auto text-center font-[family-name:var(--font-vt323)] text-3xl text-[#fca5a5]">THE ARCADE IS CLOSED</p>
                ) : (
                  <>
                    <div className="mb-4 flex items-end justify-between gap-2">
                      <p className="arc-blink font-[family-name:var(--font-vt323)] text-3xl text-[#fde047] sm:text-4xl">SELECT GAME</p>
                      <p className="font-[family-name:var(--font-vt323)] text-xl text-[#7dd3fc] tabular-nums">{clock}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" role="listbox" aria-label="Games">
                      {list.map((g, i) => {
                        const Icon = GAME_ICONS[g.key] ?? Gamepad2Icon;
                        return (
                          <button
                            key={g.key}
                            type="button"
                            role="option"
                            aria-selected={sel === i}
                            onMouseEnter={() => setSel(i)}
                            onClick={() => setGame(g.key)}
                            className={cn("arc-card group flex min-h-[132px] flex-col items-start gap-2 rounded-xl p-3 text-left sm:p-4", sel === i && "arc-card-on", g.key === "world" && "sm:col-span-2")}
                            data-arcade-game={g.key}
                          >
                            <Icon className="size-8 text-[#7dd3fc]" />
                            <span className="font-[family-name:var(--font-vt323)] text-2xl leading-none text-white sm:text-3xl">{g.label.toUpperCase()}</span>
                            <span className="text-xs text-[#a5b4fc]">{g.note}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="arc-blink mt-auto pt-6 text-center font-[family-name:var(--font-vt323)] text-2xl text-[#f0abfc]">FREE PLAY · PRESS START</p>
                  </>
                )}
              </div>
            ) : (
              <div className={cn("flex flex-1 flex-col", game === "world" && "min-h-0")}>
                <div className="flex shrink-0 items-center gap-2 border-b border-white/10 bg-black/60 px-2 py-1">
                  <button type="button" onClick={() => setGame(null)} className="arc-btn flex items-center gap-1 rounded-md px-2 py-1 font-[family-name:var(--font-vt323)] text-xl" data-arcade-menu-btn>
                    <ChevronLeftIcon className="size-4" /> MENU
                  </button>
                  <p className="flex-1 truncate text-center font-[family-name:var(--font-vt323)] text-xl text-[#fde047]">{info?.label.toUpperCase()}</p>
                  <button type="button" onClick={toggleFull} className="arc-btn rounded-md p-1.5" aria-label={full ? "Leave full screen" : "Full screen"}>
                    {full ? <Minimize2Icon className="size-4" /> : <Maximize2Icon className="size-4" />}
                  </button>
                </div>
                <div className={cn("relative flex-1", game === "world" ? "min-h-0" : "overflow-y-auto bg-[var(--arc-game)] p-3 text-foreground sm:p-6")} data-arcade-play={game}>
                  {ready && (game === "world" ? <Game /> : <div className="mx-auto max-w-2xl rounded-xl bg-background p-3 shadow-xl sm:p-5"><Game /></div>)}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* The control deck (decoration on big screens; the games use the keyboard, mouse or touch). */}
        {!game && (
          <footer className="arc-deck hidden h-28 shrink-0 items-center justify-center gap-16 rounded-b-[22px] border-x-4 border-b-4 border-[var(--arc-trim)] md:flex" aria-hidden>
            <div className="arc-stick" />
            <div className="grid grid-cols-3 gap-3">
              {["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"].map((c) => (
                <span key={c} className="arc-button" style={{ background: c }} />
              ))}
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="arc-coin" />
              <span className="font-[family-name:var(--font-vt323)] text-sm text-[#fca5a5]">FREE PLAY</span>
            </div>
          </footer>
        )}
        {game && <div className="h-2 shrink-0 rounded-b-[22px] border-x-4 border-b-4 border-[var(--arc-trim)] bg-[var(--arc-cab)]" aria-hidden />}
      </div>
      {!kiosk && !game && <p className="py-2 text-center text-[11px] text-white/40">Scores and coins stay on this device.</p>}
    </div>
  );
}

const ARCADE_CSS = `
.arcade { --arc-bg: #05050a; --arc-cab: #14101f; --arc-trim: #2b2140; --arc-ink: #e5e7eb; --arc-game: #0b0b14;
  background: radial-gradient(1200px 600px at 50% -10%, #2a1650 0%, transparent 60%), radial-gradient(900px 500px at 50% 120%, #0d2a4a 0%, transparent 60%), var(--arc-bg); }
.arc-marquee { background: linear-gradient(180deg, #3b0764 0%, #1e1b4b 55%, #0f172a 100%); box-shadow: inset 0 -6px 18px rgba(0,0,0,.6), 0 0 40px rgba(168,85,247,.25); }
.arc-neon { color: #fdf4ff; text-shadow: 0 0 4px #fff, 0 0 12px #e879f9, 0 0 26px #c026d3, 0 0 44px #7c3aed; }
.arc-lights { height: 6px; background-image: radial-gradient(circle, #fde047 0 2px, transparent 3px); background-size: 18px 6px; animation: arc-chase 1.2s linear infinite; opacity: .9; }
@keyframes arc-chase { to { background-position: 18px 0; } }
.arc-bezel { background: linear-gradient(180deg, var(--arc-cab), #0d0a16); box-shadow: inset 0 0 0 2px #000, inset 0 10px 30px rgba(0,0,0,.7); }
.arc-screen { background: #000; box-shadow: 0 0 0 3px #000, 0 0 0 6px #241b37, inset 0 0 60px rgba(56,189,248,.08); }
.arc-crt { background: radial-gradient(ellipse at center, #0b1530 0%, #050814 70%, #020309 100%); position: relative; }
.arc-crt::after { content: ""; position: absolute; inset: 0; pointer-events: none; background: repeating-linear-gradient(0deg, rgba(255,255,255,.035) 0 1px, transparent 1px 3px); mix-blend-mode: overlay; }
.arc-card { background: linear-gradient(160deg, rgba(76,29,149,.55), rgba(15,23,42,.85)); border: 2px solid rgba(129,140,248,.35); transition: transform .12s, box-shadow .12s, border-color .12s; }
.arc-card-on { border-color: #fde047; box-shadow: 0 0 0 2px rgba(253,224,71,.3), 0 0 24px rgba(253,224,71,.35); transform: translateY(-2px); }
.arc-btn { color: #e0f2fe; background: linear-gradient(180deg, #312e81, #1e1b4b); border: 1px solid #4f46e5; }
.arc-btn:hover { border-color: #fde047; }
.arc-blink { animation: arc-blink 1.4s steps(2, start) infinite; }
@keyframes arc-blink { to { visibility: hidden; } }
.arc-deck { background: linear-gradient(180deg, #1a1328, #0c0912); box-shadow: inset 0 8px 20px rgba(0,0,0,.6); }
.arc-stick { width: 70px; height: 70px; border-radius: 50%; background: radial-gradient(circle at 50% 40%, #111 0 14px, #2a2a2a 15px 30px, #0a0a0a 31px); position: relative; }
.arc-stick::after { content: ""; position: absolute; left: 50%; top: -34px; width: 34px; height: 34px; margin-left: -17px; border-radius: 50%; background: radial-gradient(circle at 35% 30%, #fca5a5, #dc2626 55%, #7f1d1d); box-shadow: 0 4px 8px rgba(0,0,0,.6); }
.arc-button { width: 34px; height: 34px; border-radius: 50%; box-shadow: inset 0 -5px 0 rgba(0,0,0,.35), 0 3px 0 #000, 0 0 12px rgba(255,255,255,.12); }
.arc-coin { width: 26px; height: 40px; border-radius: 6px; background: #111; box-shadow: inset 0 0 0 2px #444, inset 0 0 0 6px #111, inset 0 0 0 7px #ef4444; }
@media (prefers-reduced-motion: reduce) { .arc-lights, .arc-blink { animation: none; } }
`;
