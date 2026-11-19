"use client";

import * as React from "react";
import { getSudoku } from "sudoku-gen";
import { EraserIcon, LightbulbIcon, PencilIcon, RotateCcwIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ScoreBoard, useScores } from "./shell";

// Sudoku from sudoku-gen (open source): four levels, notes, mistakes shown, hints, and a timer.
type Level = "easy" | "medium" | "hard" | "expert";

export function Sudoku() {
  const [level, setLevel] = React.useState<Level>("easy");
  const [game, setGame] = React.useState(() => getSudoku("easy"));
  const [vals, setVals] = React.useState<string[]>(() => game.puzzle.split(""));
  const [notes, setNotes] = React.useState<Set<string>[]>(() => Array.from({ length: 81 }, () => new Set()));
  const [sel, setSel] = React.useState<number | null>(null);
  const [noteMode, setNoteMode] = React.useState(false);
  const [mistakes, setMistakes] = React.useState(0);
  const [start, setStart] = React.useState(() => Date.now());
  const [secs, setSecs] = React.useState(0);
  const { best, report } = useScores("sudoku");
  const given = game.puzzle;
  const won = vals.join("") === game.solution;
  const box = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (won) return;
    const t = window.setInterval(() => setSecs(Math.round((Date.now() - start) / 1000)), 1000);
    return () => window.clearInterval(t);
  }, [start, won]);

  const fresh = (l: Level) => {
    const g = getSudoku(l);
    setGame(g);
    setVals(g.puzzle.split(""));
    setNotes(Array.from({ length: 81 }, () => new Set()));
    setSel(null);
    setMistakes(0);
    setStart(Date.now());
    setSecs(0);
  };
  const put = (d: string) => {
    if (sel === null || given[sel] !== "-" || won) return;
    if (noteMode && d !== "-") {
      const n = notes.map((s) => new Set(s));
      if (n[sel]!.has(d)) n[sel]!.delete(d);
      else n[sel]!.add(d);
      return setNotes(n);
    }
    const v = [...vals];
    v[sel] = d;
    setVals(v);
    if (d !== "-" && d !== game.solution[sel]) setMistakes((m) => m + 1);
    if (v.join("") === game.solution) void report(Math.max(1, Math.round((Date.now() - start) / 1000)), { level, mistakes });
  };
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const key = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) put(e.key);
      else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") put("-");
      else if (sel !== null && e.key.startsWith("Arrow")) {
        e.preventDefault();
        const d = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[e.key] ?? 0;
        setSel(Math.max(0, Math.min(80, sel + d)));
      } else if (e.key === "n") setNoteMode((x) => !x);
    };
    el.addEventListener("keydown", key);
    return () => el.removeEventListener("keydown", key);
  });

  const peers = (i: number, j: number) => Math.floor(i / 9) === Math.floor(j / 9) || i % 9 === j % 9 || (Math.floor(i / 27) === Math.floor(j / 27) && Math.floor((i % 9) / 3) === Math.floor((j % 9) / 3));
  const count = (d: string) => vals.filter((v) => v === d).length;
  return (
    <div className="space-y-2" data-game="sudoku">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <select aria-label="Level" value={level} onChange={(e) => { const l = e.target.value as Level; setLevel(l); fresh(l); }} className="h-7 rounded-md border bg-background px-1.5">
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
          <option value="expert">Expert</option>
        </select>
        <span className="tabular-nums">{Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}</span>
        <span className={cn(mistakes && "text-[#d93025]")}>· {mistakes} mistakes</span>
        <Button size="xs" variant="outline" className="ml-auto" onClick={() => fresh(level)}><RotateCcwIcon /> New</Button>
      </div>
      <div ref={box} tabIndex={0} className="mx-auto grid max-w-[340px] grid-cols-9 overflow-hidden rounded-md border-2 border-foreground/70 outline-none" aria-label="Sudoku grid: choose a square, then type a number">
        {vals.map((v, i) => {
          const r = Math.floor(i / 9), c = i % 9;
          const wrong = v !== "-" && v !== game.solution[i];
          const same = sel !== null && v !== "-" && v === vals[sel];
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSel(i)}
              aria-label={`Row ${r + 1}, column ${c + 1}: ${v === "-" ? "empty" : v}`}
              className={cn(
                "relative flex aspect-square items-center justify-center border-foreground/15 text-base",
                c % 3 === 2 && c < 8 ? "border-r-2 border-r-foreground/60" : "border-r",
                r % 3 === 2 && r < 8 ? "border-b-2 border-b-foreground/60" : "border-b",
                sel === i ? "bg-primary/30" : same ? "bg-primary/15" : sel !== null && peers(i, sel) ? "bg-muted" : "bg-card",
                given[i] !== "-" ? "font-bold" : wrong ? "text-[#d93025]" : "text-primary",
              )}
            >
              {v !== "-" ? v : notes[i]!.size ? (
                <span className="grid h-full w-full grid-cols-3 text-[8px] leading-none text-muted-foreground">
                  {"123456789".split("").map((d) => <span key={d} className="flex items-center justify-center">{notes[i]!.has(d) ? d : ""}</span>)}
                </span>
              ) : ""}
            </button>
          );
        })}
      </div>
      <div className="mx-auto grid max-w-[340px] grid-cols-9 gap-1">
        {"123456789".split("").map((d) => (
          <button key={d} type="button" disabled={count(d) >= 9} onClick={() => put(d)} className="aspect-square rounded-md border bg-card text-lg font-semibold hover:bg-muted disabled:opacity-30">{d}</button>
        ))}
      </div>
      <div className="flex justify-center gap-1">
        <Button size="xs" variant={noteMode ? "default" : "outline"} onClick={() => setNoteMode(!noteMode)} aria-pressed={noteMode}><PencilIcon /> Notes</Button>
        <Button size="xs" variant="outline" onClick={() => put("-")}><EraserIcon /> Clear</Button>
        <Button size="xs" variant="outline" disabled={sel === null || given[sel ?? 0] !== "-"} onClick={() => sel !== null && put(game.solution[sel]!)}><LightbulbIcon /> Hint</Button>
      </div>
      {won && <p className="text-center text-sm font-semibold text-primary">Solved in {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, "0")}!</p>}
      <ScoreBoard best={best} unit="s" />
    </div>
  );
}
