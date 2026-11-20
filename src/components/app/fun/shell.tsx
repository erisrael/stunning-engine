"use client";

import * as React from "react";
import { TrophyIcon } from "lucide-react";
import { F } from "./actions";

type Best = { mine: number | null; top: { name: string; s: number }[]; lowerIsBetter: boolean };

// Best scores for a game: yours and the team's top five. report(score) saves a finished game.
export function useScores(game: string) {
  const [best, setBest] = React.useState<Best | null>(null);
  React.useEffect(() => {
    void F.bestScoresAction(game).then((r) => r.ok && setBest(r.data ?? null));
  }, [game]);
  const report = React.useCallback(
    async (score: number, meta?: Record<string, unknown>) => {
      const r = await F.saveScoreAction(game, score, meta);
      if (r.ok && r.data) setBest(r.data);
      return r.ok;
    },
    [game],
  );
  return { best, report };
}

export function ScoreBoard({ best, unit = "" }: { best: Best | null; unit?: string }) {
  if (!best) return null;
  return (
    <div className="rounded-lg border bg-muted/40 p-2 text-xs" data-fun-scores>
      <p className="flex items-center gap-1 font-medium">
        <TrophyIcon className="size-3.5 text-[#F9AB00]" /> Your best: {best.mine === null ? "none yet" : `${best.mine}${unit}`}
      </p>
      {best.top.length > 0 && (
        <ol className="mt-1 space-y-0.5 text-muted-foreground">
          {best.top.map((t, i) => (
            <li key={i} className="flex justify-between">
              <span>
                {i + 1}. {t.name}
              </span>
              <span className="tabular-nums">
                {t.s}
                {unit}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// A grid of square cells that fits the window.
export const cellGrid = (cols: number) => ({ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }) as React.CSSProperties;

// Short sounds for the games (Kenney's interface sounds, CC0): on unless the person turned them off.
const SOUNDS = { move: "toggle", flip: "select", match: "confirm", win: "maximize", lose: "error", tap: "click", key: "click" } as const;
let audioCtx: AudioContext | null = null;
const buffers = new Map<string, Promise<AudioBuffer | null>>();
export const gameSoundOn = () => {
  try {
    return localStorage.getItem("myseed.games.sound") !== "off";
  } catch {
    return true;
  }
};
export function gameSfx(kind: keyof typeof SOUNDS, volume = 0.5) {
  if (typeof window === "undefined" || !gameSoundOn()) return;
  try {
    audioCtx ??= new AudioContext();
    const c = audioCtx;
    const name = SOUNDS[kind];
    if (!buffers.has(name)) buffers.set(name, fetch(`/audio/sfx/${name}.mp3`).then((r) => r.arrayBuffer()).then((b) => c.decodeAudioData(b)).catch(() => null));
    void buffers.get(name)!.then((buf) => {
      if (!buf) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      const g = c.createGain();
      g.gain.value = volume;
      src.connect(g).connect(c.destination);
      src.start();
    });
  } catch {}
}
