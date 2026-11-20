"use client";

import * as React from "react";
import { Chess, type Square } from "chess.js";
import { Chessboard } from "react-chessboard";
import { aiMove } from "js-chess-engine";
import { toast } from "sonner";
import { CheckCircle2Icon, ChevronLeftIcon, ChevronRightIcon, LightbulbIcon, Loader2Icon, RotateCcwIcon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { F } from "./actions";
import { ScoreBoard, useScores } from "./shell";

// Chess: chess.js keeps the rules, react-chessboard draws the board and js-chess-engine plays (all open source).
// Lessons teach the pieces and ideas on small positions; puzzles come from Lichess.

const LIGHT = { backgroundColor: "color-mix(in oklab, var(--primary) 10%, #f0d9b5)" };
const DARK = { backgroundColor: "color-mix(in oklab, var(--primary) 22%, #b58863)" };
const HILITE = { background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 26%, transparent 28%)" };
const SELECTED = { background: "color-mix(in oklab, var(--primary) 35%, transparent)" };
const LAST = { background: "rgb(255 213 0 / .35)" };

// Click a piece, then a square (or drag). Returns square styles for the selection and the legal targets.
function useClickMove(game: Chess, canMove: boolean, tryMove: (from: string, to: string) => boolean) {
  const [sel, setSel] = React.useState<string | null>(null);
  const targets = sel ? game.moves({ square: sel as Square, verbose: true }).map((m) => m.to) : [];
  const onSquareClick = ({ square }: { square: string }) => {
    if (!canMove) return;
    if (sel && targets.includes(square as Square)) {
      tryMove(sel, square);
      return setSel(null);
    }
    const p = game.get(square as Square);
    setSel(p && p.color === game.turn() ? square : null);
  };
  const styles: Record<string, React.CSSProperties> = {};
  if (sel) styles[sel] = SELECTED;
  targets.forEach((t) => (styles[t] = HILITE));
  return { onSquareClick, styles, clear: () => setSel(null) };
}

// ------------------------------------------------------------------------------------------------- play the computer
export function ChessGame() {
  const game = React.useRef(new Chess());
  const [fen, setFen] = React.useState(game.current.fen());
  const [side, setSide] = React.useState<"white" | "black">("white");
  const [level, setLevel] = React.useState(2);
  const [thinking, setThinking] = React.useState(false);
  const [last, setLast] = React.useState<[string, string] | null>(null);
  const [hint, setHint] = React.useState<[string, string] | null>(null);
  const { best, report } = useScores("chess");
  const g = game.current;
  const mine = (side === "white" ? "w" : "b") === g.turn();
  const over = g.isGameOver();

  const computer = React.useCallback(() => {
    if (g.isGameOver()) return;
    setThinking(true);
    window.setTimeout(() => {
      try {
        const m = aiMove(g.fen(), level);
        const [from, to] = Object.entries(m)[0]!;
        g.move({ from: from.toLowerCase(), to: to.toLowerCase(), promotion: "q" });
        setLast([from.toLowerCase(), to.toLowerCase()]);
        setFen(g.fen());
        if (g.isCheckmate()) toast("Checkmate. The computer wins this one.");
      } finally {
        setThinking(false);
      }
    }, 60);
  }, [g, level]);

  const tryMove = (from: string, to: string) => {
    if (!mine || thinking || over) return false;
    try {
      g.move({ from, to, promotion: "q" });
    } catch {
      return false;
    }
    setLast([from, to]);
    setHint(null);
    setFen(g.fen());
    if (g.isCheckmate()) {
      toast.success("Checkmate! You win.");
      void report(level * 100 + Math.max(0, 100 - g.history().length), { level });
      return true;
    }
    computer();
    return true;
  };
  const click = useClickMove(g, mine && !thinking && !over, tryMove);
  const reset = (s = side) => {
    game.current = new Chess();
    setFen(game.current.fen());
    setLast(null);
    setHint(null);
    click.clear();
    if (s === "black") window.setTimeout(() => computer(), 200);
  };
  React.useEffect(() => {
    if (side === "black" && game.current.history().length === 0) computer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [side]);

  const styles = { ...(last ? { [last[0]]: LAST, [last[1]]: LAST } : {}), ...(hint ? { [hint[0]]: SELECTED, [hint[1]]: HILITE } : {}), ...click.styles };
  const status = g.isCheckmate() ? (g.turn() === (side === "white" ? "w" : "b") ? "Checkmate: you lost" : "Checkmate: you won!") : g.isDraw() ? "Draw" : g.isCheck() ? "Check!" : thinking ? "The computer is thinking…" : mine ? "Your move" : "";
  return (
    <div className="space-y-2" data-game="chess">
      <div className="flex flex-wrap items-center gap-1 text-xs">
        <select aria-label="Level" value={level} onChange={(e) => setLevel(Number(e.target.value))} className="h-7 rounded-md border bg-background px-1.5">
          {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Level {l}{l === 1 ? " (beginner)" : l === 5 ? " (strong, slow)" : ""}</option>)}
        </select>
        <select aria-label="Play as" value={side} onChange={(e) => { const s = e.target.value as "white" | "black"; setSide(s); reset(s); }} className="h-7 rounded-md border bg-background px-1.5">
          <option value="white">Play white</option>
          <option value="black">Play black</option>
        </select>
        <span className="ml-auto flex gap-1">
          <Button size="xs" variant="outline" disabled={thinking || over || !mine} onClick={() => { const m = aiMove(g.fen(), 3); const [a, b] = Object.entries(m)[0]!; setHint([a.toLowerCase(), b.toLowerCase()]); }} title="Show a good move"><LightbulbIcon /> Hint</Button>
          <Button size="xs" variant="outline" disabled={thinking || g.history().length < 2} onClick={() => { g.undo(); g.undo(); setFen(g.fen()); setLast(null); }}><Undo2Icon /> Undo</Button>
          <Button size="xs" variant="outline" onClick={() => reset()}><RotateCcwIcon /> New</Button>
        </span>
      </div>
      <p className={cn("flex items-center gap-1 text-sm font-medium", g.isCheck() && "text-[#d93025]")}>{thinking && <Loader2Icon className="size-3.5 animate-spin" />}{status}</p>
      <div className="mx-auto max-w-[360px]">
        <Chessboard
          options={{
            id: "fun-chess",
            position: fen,
            boardOrientation: side,
            allowDragging: mine && !thinking && !over,
            onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
            onSquareClick: click.onSquareClick,
            squareStyles: styles,
            lightSquareStyle: LIGHT,
            darkSquareStyle: DARK,
          }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">Moves: {g.history().length ? g.history().join(" ") : "none yet"}</p>
      <ScoreBoard best={best} unit=" pts" />
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- lessons and puzzles
type Lesson = { title: string; text: string; fen: string; goal: "check" | "mate" | { from: string; to: string[] }; done: string };
const LESSONS: Lesson[] = [
  { title: "The rook", text: "A rook moves any number of squares in a straight line: up, down, left or right. Move the rook to the top edge, d8.", fen: "k7/8/8/8/3R4/8/8/7K w - - 0 1", goal: { from: "d4", to: ["d8"] }, done: "Rooks love open lines." },
  { title: "The bishop", text: "A bishop moves diagonally, as far as it likes, and always stays on its colour. Move the bishop to g8.", fen: "k7/8/8/8/2B5/8/8/7K w - - 0 1", goal: { from: "c4", to: ["g8"] }, done: "A bishop on a long diagonal is strong." },
  { title: "The queen", text: "The queen moves like a rook and a bishop together. Take the black rook on d5.", fen: "k7/8/8/3r4/8/8/8/3Q3K w - - 0 1", goal: { from: "d1", to: ["d5"] }, done: "The queen is your strongest piece. Keep it safe early on." },
  { title: "The knight", text: "A knight jumps in an L: two squares one way and one to the side. It can jump over pieces. Jump to c3.", fen: "k7/8/8/8/8/8/8/1N5K w - - 0 1", goal: { from: "b1", to: ["c3"] }, done: "Knights are best near the centre." },
  { title: "The pawn", text: "Pawns move forward one square (two from their first square) and take diagonally. Push the e-pawn two squares.", fen: "k7/8/8/8/8/8/4P3/7K w - - 0 1", goal: { from: "e2", to: ["e4"] }, done: "Pawns never move backwards." },
  { title: "Promotion", text: "A pawn that reaches the last row becomes a queen (or another piece). Promote the pawn.", fen: "k7/4P3/8/8/8/8/8/7K w - - 0 1", goal: { from: "e7", to: ["e8"] }, done: "A new queen!" },
  { title: "Castling", text: "Once per game the king can move two squares towards a rook, and the rook jumps over it. Neither may have moved, and the king may not pass through check. Castle on the king's side: move the king to g1.", fen: "r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1", goal: { from: "e1", to: ["g1"] }, done: "Castling keeps the king safe and brings the rook into play." },
  { title: "En passant", text: "A pawn that moves two squares can be taken as if it moved one, but only right away. Black just played d7-d5. Take it en passant with the e5 pawn.", fen: "k7/8/8/3pP3/8/8/8/7K w - d6 0 1", goal: { from: "e5", to: ["d6"] }, done: "Now you know the rule most beginners miss." },
  { title: "Check", text: "Attacking the king is check; the other side must get out of it. Give check with the rook.", fen: "4k3/8/8/8/8/8/8/R5K1 w - - 0 1", goal: "check", done: "Check! Black must move the king." },
  { title: "Back-rank mate", text: "A king stuck behind its own pawns can be mated on the back row. Find checkmate in one.", fen: "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1", goal: "mate", done: "Checkmate. Always give your king an escape square." },
  { title: "Queen and king mate", text: "The king helps the queen. Find checkmate in one.", fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 1", goal: "mate", done: "The king covers the escape squares; the queen gives mate." },
  { title: "Opening ideas", text: "Start by taking the centre, bringing out knights and bishops, and castling early. Play a centre pawn two squares (e4 or d4).", fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", goal: { from: "*", to: ["e4", "d4"] }, done: "A classic start. Next: knights to f3 and c3." },
];

type Puzzle = { id: string; rating: number; solution: string[]; themes: string[]; fen: string | null; pgn: string };

export function ChessLearn() {
  const [mode, setMode] = React.useState<"lessons" | "puzzle">("lessons");
  const [n, setN] = React.useState(0);
  const [doneSet, setDoneSet] = React.useState<Set<number>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("myseed.fun.chess.lessons") ?? "[]") as number[]);
    } catch {
      return new Set();
    }
  });
  const [puzzle, setPuzzle] = React.useState<Puzzle | null>(null);
  const [loading, setLoading] = React.useState(false);
  const { best, report } = useScores("chess-learn");
  const game = React.useRef(new Chess(LESSONS[0]!.fen));
  const [fen, setFen] = React.useState(LESSONS[0]!.fen);
  const [msg, setMsg] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [step, setStep] = React.useState(0);
  const [orient, setOrient] = React.useState<"white" | "black">("white");

  const loadLesson = (i: number) => {
    game.current = new Chess(LESSONS[i]!.fen);
    setN(i);
    setFen(game.current.fen());
    setMsg(null);
    setOrient("white");
  };
  const loadPuzzle = async (kind: "daily" | "next") => {
    setLoading(true);
    const r = await F.chessPuzzleAction(kind);
    setLoading(false);
    if (!r.ok || !r.data) return void toast.error(r.ok ? "No puzzle now." : r.error);
    const p = r.data;
    const g = new Chess();
    if (p.fen) g.load(p.fen);
    else g.loadPgn(p.pgn);
    game.current = g;
    setPuzzle(p);
    setStep(0);
    setFen(g.fen());
    setOrient(g.turn() === "w" ? "white" : "black");
    setMsg({ ok: true, text: `${g.turn() === "w" ? "White" : "Black"} to move and win. Rating ${p.rating}.` });
  };

  const tryMove = (from: string, to: string) => {
    const g = game.current;
    if (mode === "lessons") {
      const l = LESSONS[n]!;
      if (typeof l.goal === "object" && ((l.goal.from !== "*" && l.goal.from !== from) || !l.goal.to.includes(to))) {
        try {
          new Chess(g.fen()).move({ from, to, promotion: "q" });
          setMsg({ ok: false, text: "A legal move, but not the one asked for. Try again." });
        } catch {
          setMsg({ ok: false, text: "That piece cannot move there." });
        }
        return false;
      }
      try {
        g.move({ from, to, promotion: "q" });
      } catch {
        setMsg({ ok: false, text: "That piece cannot move there." });
        return false;
      }
      setFen(g.fen());
      const ok = l.goal === "check" ? g.isCheck() : l.goal === "mate" ? g.isCheckmate() : true;
      if (!ok) {
        setMsg({ ok: false, text: l.goal === "mate" ? "Not mate yet. Reset and look again." : "No check. Reset and try again." });
        return true;
      }
      setMsg({ ok: true, text: `Well done! ${l.done}` });
      const d = new Set(doneSet).add(n);
      setDoneSet(d);
      try {
        localStorage.setItem("myseed.fun.chess.lessons", JSON.stringify([...d]));
      } catch {}
      return true;
    }
    if (!puzzle || step >= puzzle.solution.length) return false;
    const want = puzzle.solution[step]!;
    const uci = `${from}${to}`;
    let mv;
    try {
      mv = g.move({ from, to, promotion: (want[4] as "q") ?? "q" });
    } catch {
      return false;
    }
    // Any move that gives mate counts too.
    if (uci !== want.slice(0, 4) && !g.isCheckmate()) {
      g.undo();
      setMsg({ ok: false, text: `${mv.san} is not it. Look for forcing moves: checks, captures, threats.` });
      setFen(g.fen());
      return false;
    }
    setFen(g.fen());
    const nextStep = step + 1;
    if (nextStep >= puzzle.solution.length || g.isCheckmate()) {
      setStep(puzzle.solution.length);
      setMsg({ ok: true, text: "Solved! Great eye." });
      void report(puzzle.rating, { id: puzzle.id });
      return true;
    }
    // The other side answers.
    window.setTimeout(() => {
      const r = puzzle.solution[nextStep]!;
      g.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: (r[4] as "q") ?? "q" });
      setFen(g.fen());
      setStep(nextStep + 1);
      setMsg({ ok: true, text: "Good! Keep going." });
    }, 450);
    return true;
  };
  const canMove = mode === "lessons" ? !msg?.ok || !msg.text.startsWith("Well done") : !!puzzle && step < puzzle.solution.length;
  const click = useClickMove(game.current, canMove, tryMove);
  const l = LESSONS[n]!;
  return (
    <div className="space-y-2" data-game="chess-learn">
      <div className="flex gap-1 rounded-full bg-muted p-0.5 text-xs">
        <button type="button" className={cn("flex-1 rounded-full py-1", mode === "lessons" && "bg-background font-medium shadow-xs")} onClick={() => (setMode("lessons"), loadLesson(n))}>Lessons ({doneSet.size}/{LESSONS.length})</button>
        <button type="button" className={cn("flex-1 rounded-full py-1", mode === "puzzle" && "bg-background font-medium shadow-xs")} onClick={() => (setMode("puzzle"), !puzzle && void loadPuzzle("daily"))}>Puzzles</button>
      </div>
      {mode === "lessons" ? (
        <div className="space-y-1">
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" className="size-7" disabled={n === 0} aria-label="Previous lesson" onClick={() => loadLesson(n - 1)}><ChevronLeftIcon /></Button>
            <p className="flex-1 text-center text-sm font-semibold">{n + 1}. {l.title} {doneSet.has(n) && <CheckCircle2Icon className="inline size-4 text-[#188038]" />}</p>
            <Button size="icon" variant="ghost" className="size-7" disabled={n === LESSONS.length - 1} aria-label="Next lesson" onClick={() => loadLesson(n + 1)}><ChevronRightIcon /></Button>
          </div>
          <p className="text-sm text-muted-foreground">{l.text}</p>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-xs">
          <Button size="xs" variant="outline" disabled={loading} onClick={() => void loadPuzzle("daily")}>Today&apos;s puzzle</Button>
          <Button size="xs" variant="outline" disabled={loading} onClick={() => void loadPuzzle("next")}>{loading ? <Loader2Icon className="animate-spin" /> : null} Another</Button>
          {puzzle && <span className="ml-auto truncate text-muted-foreground">{puzzle.themes.slice(0, 3).join(", ")}</span>}
        </div>
      )}
      {msg && <p className={cn("rounded-md px-2 py-1 text-sm", msg.ok ? "bg-[#188038]/10 text-[#137333]" : "bg-[#d93025]/10 text-[#b3261e]")} data-chess-msg>{msg.text}</p>}
      <div className="mx-auto max-w-[340px]">
        <Chessboard
          options={{
            id: "fun-chess-learn",
            position: fen,
            boardOrientation: orient,
            allowDragging: canMove,
            onPieceDrop: ({ sourceSquare, targetSquare }) => (targetSquare ? tryMove(sourceSquare, targetSquare) : false),
            onSquareClick: click.onSquareClick,
            squareStyles: click.styles,
            lightSquareStyle: LIGHT,
            darkSquareStyle: DARK,
          }}
        />
      </div>
      <div className="flex gap-1">
        {mode === "lessons" && <Button size="xs" variant="outline" onClick={() => loadLesson(n)}><RotateCcwIcon /> Reset</Button>}
        {mode === "lessons" && msg?.text.startsWith("Well done") && n < LESSONS.length - 1 && <Button size="xs" onClick={() => loadLesson(n + 1)}>Next lesson <ChevronRightIcon /></Button>}
      </div>
      {mode === "puzzle" && <p className="text-[10px] text-muted-foreground">Puzzles from Lichess (free and open).</p>}
      <ScoreBoard best={best} unit=" (hardest puzzle solved)" />
    </div>
  );
}
