"use client";

import * as React from "react";
import { TrophyIcon } from "lucide-react";
import * as F from "@/app/actions/fun";

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
