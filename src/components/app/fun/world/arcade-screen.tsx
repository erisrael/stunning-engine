"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ARCADE_GAMES } from "./arcade3d";

// Playing a cabinet in Seed Arcade: the game on the cabinet's screen, over the town. Pixel art all round: a marquee
// with chase lights, a screen that switches on in steps, scan lines, a pixel runner along the bottom, hard-edged
// buttons. Esc (or Back to town) goes back to walking.

const Loading = () => <p className="arcade-px py-10 text-center text-2xl text-[#7dd3fc]">LOADING...</p>;
const G = (k: "Game2048" | "Snake" | "Memory" | "Minesweeper" | "TicTacToe" | "WordGuess" | "Typing" | "Reaction") => dynamic(() => import("../games").then((m) => m[k]), { ssr: false, loading: Loading });
const GAMES: Record<string, React.ComponentType> = {
  snake: G("Snake"),
  "2048": G("Game2048"),
  memory: G("Memory"),
  minesweeper: G("Minesweeper"),
  tictactoe: G("TicTacToe"),
  wordguess: G("WordGuess"),
  typing: G("Typing"),
  reaction: G("Reaction"),
  chess: dynamic(() => import("../chess").then((m) => m.ChessGame), { ssr: false, loading: Loading }),
  sudoku: dynamic(() => import("../sudoku").then((m) => m.Sudoku), { ssr: false, loading: Loading }),
};

export function ArcadeScreen({ game: start, onClose }: { game: string; onClose: () => void }) {
  // "pick": the home console's menu; Esc in a game goes back to the menu, Esc in the menu closes.
  const console_ = start === "pick";
  const [game, setGame] = React.useState(start);
  const [sel, setSel] = React.useState(0);
  const picking = game === "pick";
  const info = picking ? { key: "pick", label: "GAME CONSOLE", color: "#2563eb" } : (ARCADE_GAMES.find((g) => g.key === game) ?? { key: game, label: game.toUpperCase(), color: "#a855f7" });
  const Game = GAMES[game] ?? GAMES.snake!;
  const back = React.useCallback(() => (console_ && !picking ? setGame("pick") : onClose()), [console_, picking, onClose]);
  React.useEffect(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") return e.preventDefault(), e.stopPropagation(), back();
      if (!picking) return;
      const cols = 5;
      const n = ARCADE_GAMES.length;
      const mv: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, d: 1, a: -1, s: cols, w: -cols };
      if (e.key in mv) return e.preventDefault(), setSel((x) => (x + mv[e.key]! + n) % n);
      if (e.key === "Enter" || e.key === " ") return e.preventDefault(), setGame(ARCADE_GAMES[sel]!.key);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [back, picking, sel]);
  return (
    <div className="arcade-overlay absolute inset-0 z-40 flex items-center justify-center overflow-hidden p-2 sm:p-4" data-arcade-screen={game} style={{ ["--cab" as string]: info.color }}>
      <style>{PIXEL_CSS}</style>
      <div className="arcade-cab flex max-h-full w-full max-w-3xl flex-col">
        <div className="arcade-marquee relative flex h-14 shrink-0 items-center justify-center overflow-hidden sm:h-16">
          <div className="arcade-chase absolute inset-x-2 top-1" aria-hidden />
          <div className="arcade-chase absolute inset-x-2 bottom-1" aria-hidden />
          <h2 className="arcade-px arcade-title text-3xl tracking-[0.25em] sm:text-4xl">{info.label}</h2>
        </div>
        <div className="arcade-bezel min-h-0 flex-1 p-2 sm:p-3">
          <div className="arcade-crt relative h-full min-h-[300px] overflow-y-auto">
            <div className="arcade-on dark relative z-0 p-2 text-foreground sm:p-4" key={game}>
              {picking ? (
                <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-5" data-console-menu>
                  {ARCADE_GAMES.map((g, i) => (
                    <button key={g.key} type="button" onMouseEnter={() => setSel(i)} onClick={() => setGame(g.key)} className={`arcade-px arcade-tile py-6 text-xl ${sel === i ? "arcade-tile-on" : ""}`} style={{ ["--cab" as string]: g.color }} data-console-game={g.key}>
                      {g.label}
                    </button>
                  ))}
                  <p className="arcade-px col-span-full text-center text-lg text-[#94a3b8]">ARROWS OR WASD TO CHOOSE · ENTER TO PLAY · ESC TO STOP</p>
                </div>
              ) : (
                <Game />
              )}
            </div>
            <div className="arcade-scan pointer-events-none absolute inset-0 z-10" aria-hidden />
          </div>
        </div>
        <div className="arcade-deck relative flex h-12 shrink-0 items-center justify-between gap-2 px-3">
          <div className="arcade-runner" aria-hidden />
          <p className="arcade-px arcade-blink hidden text-lg text-[#f0abfc] sm:block">{console_ ? "HOME CONSOLE · 1P" : "FREE PLAY · 1P START"}</p>
          <button type="button" onClick={back} className="arcade-px arcade-btn px-3 py-0.5 text-lg" data-arcade-back>
            {console_ && !picking ? "ESC · GAMES MENU" : console_ ? "ESC · TURN OFF" : "ESC · BACK TO TOWN"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Pixel style: no soft edges anywhere (stepped corners, hard shadows), everything moves in steps.
const PIXEL_CSS = `
.arcade-px { font-family: var(--font-vt323), ui-monospace, monospace; }
.arcade-overlay { background: #07050e; background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px); background-size: 8px 8px; image-rendering: pixelated; }
.arcade-cab { background: #17111f; box-shadow: 0 0 0 4px #000, 0 0 0 8px var(--cab), 0 0 0 12px #000, 0 0 40px color-mix(in srgb, var(--cab) 45%, transparent);
  clip-path: polygon(0 12px, 4px 12px, 4px 8px, 8px 8px, 8px 4px, 12px 4px, 12px 0, calc(100% - 12px) 0, calc(100% - 12px) 4px, calc(100% - 8px) 4px, calc(100% - 8px) 8px, calc(100% - 4px) 8px, calc(100% - 4px) 12px, 100% 12px, 100% calc(100% - 12px), calc(100% - 4px) calc(100% - 12px), calc(100% - 4px) calc(100% - 8px), calc(100% - 8px) calc(100% - 8px), calc(100% - 8px) calc(100% - 4px), calc(100% - 12px) calc(100% - 4px), calc(100% - 12px) 100%, 12px 100%, 12px calc(100% - 4px), 8px calc(100% - 4px), 8px calc(100% - 8px), 4px calc(100% - 8px), 4px calc(100% - 12px), 0 calc(100% - 12px)); }
.arcade-marquee { background: linear-gradient(180deg, #2e1065, #0f0a1f); border-bottom: 4px solid #000; }
.arcade-title { color: #fff; text-shadow: 2px 0 0 var(--cab), -2px 0 0 var(--cab), 0 2px 0 var(--cab), 0 -2px 0 var(--cab), 4px 4px 0 #000; animation: arcade-flicker 3s steps(1) infinite; }
@keyframes arcade-flicker { 0%, 92%, 96%, 100% { opacity: 1; } 94% { opacity: .55; } }
.arcade-chase { height: 4px; background-image: linear-gradient(90deg, #fde047 0 4px, transparent 4px 12px); background-size: 12px 4px; animation: arcade-chase .6s steps(3) infinite; }
@keyframes arcade-chase { to { background-position: 12px 0; } }
.arcade-bezel { background: #0b0812; }
.arcade-crt { background: #050811; box-shadow: inset 0 0 0 4px #000, inset 0 0 50px rgba(56,189,248,.12); }
.arcade-on { animation: arcade-power .5s steps(5) both; transform-origin: center; }
@keyframes arcade-power { 0% { transform: scaleY(.02); filter: brightness(3); } 60% { transform: scaleY(.6); } 100% { transform: scaleY(1); filter: none; } }
.arcade-scan { background: repeating-linear-gradient(0deg, rgba(0,0,0,.16) 0 2px, transparent 2px 4px); }
.arcade-deck { background: #120d1a; border-top: 4px solid #000; }
.arcade-blink { animation: arcade-blink 1s steps(2, start) infinite; }
@keyframes arcade-blink { to { visibility: hidden; } }
.arcade-tile { color: #fff; background: #0b1020; box-shadow: inset 0 0 0 4px var(--cab), 4px 4px 0 #000; }
.arcade-tile-on { background: var(--cab); animation: arcade-blink-tile .5s steps(2) infinite; }
@keyframes arcade-blink-tile { 50% { box-shadow: inset 0 0 0 4px #fff, 4px 4px 0 #000; } }
.arcade-btn { color: #fff; background: var(--cab); box-shadow: 4px 4px 0 #000; border: 0; }
.arcade-btn:active { transform: translate(4px, 4px); box-shadow: none; }
.arcade-runner { width: 4px; height: 4px; position: relative; color: var(--cab); animation: arcade-run 4s steps(40) infinite, arcade-legs .3s steps(1) infinite;
  box-shadow: 4px 0 #fde68a, 8px 0 #fde68a, 4px 4px currentColor, 8px 4px currentColor, 0 8px currentColor, 12px 8px currentColor, 4px 12px #1e293b, 8px 12px #1e293b; }
@keyframes arcade-run { from { left: 0; } to { left: 160px; } }
@keyframes arcade-legs { 50% { box-shadow: 4px 0 #fde68a, 8px 0 #fde68a, 4px 4px currentColor, 8px 4px currentColor, 0 4px currentColor, 12px 4px currentColor, 0 12px #1e293b, 12px 12px #1e293b; } }
@media (prefers-reduced-motion: reduce) { .arcade-on, .arcade-chase, .arcade-blink, .arcade-runner, .arcade-title { animation: none; } }
`;
