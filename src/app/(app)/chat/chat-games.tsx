"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Chess, type Square } from "chess.js";
import { toast } from "sonner";
import { BotIcon, FlagIcon, Gamepad2Icon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BOT, CHAT_GAMES, c4Drop, reversiMoves, triviaScores, type GameMeta, type Move, type TriviaQ } from "@/lib/chat-games";
import { chatGameMoveAction, joinChatGameAction, rematchChatGameAction, resignChatGameAction, startChatGameAction } from "@/app/actions/chat";
import type { ChatMessage } from "@/server/chat";

const Chessboard = dynamic(() => import("react-chessboard").then((m) => m.Chessboard), { ssr: false, loading: () => <div className="aspect-square w-full animate-pulse rounded bg-muted" /> });

// Start a game in this chat: which game, and against whom (someone in the chat, the first who joins, or the bot).
export function GameDialog({ groupId, members, viewerId, direct, onClose, onSent }: { groupId: string; members: { id: string; name: string }[]; viewerId: string; direct: boolean; onClose: () => void; onSent: () => void }) {
  const [game, setGame] = React.useState<string>("chess");
  const others = members.filter((m) => m.id !== viewerId);
  const [opp, setOpp] = React.useState<string>(direct && others[0] ? others[0].id : "open");
  const [level, setLevel] = React.useState(2);
  const [busy, setBusy] = React.useState(false);
  const def = CHAT_GAMES.find((g) => g.key === game)!;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Play a game</DialogTitle>
          <DialogDescription>It shows in the chat as a live board; everyone here can watch.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Game">
          {CHAT_GAMES.map((g) => (
            <button key={g.key} type="button" role="radio" aria-checked={game === g.key} onClick={() => (setGame(g.key), !g.bot && opp === BOT && setOpp("open"))} className={cn("flex flex-col items-center gap-1 rounded-lg border p-2 text-center text-xs", game === g.key && "border-primary bg-primary/10")} data-chat-game={g.key}>
              <span className="text-2xl">{g.emoji}</span>
              {g.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{def.note}</p>
        {game !== "trivia" && (
          <div className="space-y-1.5 text-sm">
            <p className="font-medium">Play against</p>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setOpp(BOT)} aria-pressed={opp === BOT} className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-xs", opp === BOT && "border-primary bg-primary/10")} data-opponent="bot">
                <BotIcon className="size-3.5" /> The bot
              </button>
              {!direct && (
                <button type="button" onClick={() => setOpp("open")} aria-pressed={opp === "open"} className={cn("flex items-center gap-1 rounded-full border px-3 py-1 text-xs", opp === "open" && "border-primary bg-primary/10")} data-opponent="open">
                  <UsersIcon className="size-3.5" /> First to join
                </button>
              )}
              {others.slice(0, 30).map((m) => (
                <button key={m.id} type="button" onClick={() => setOpp(m.id)} aria-pressed={opp === m.id} className={cn("rounded-full border px-3 py-1 text-xs", opp === m.id && "border-primary bg-primary/10")}>
                  {m.name}
                </button>
              ))}
            </div>
            {opp === BOT && (
              <label className="flex items-center gap-2 text-xs">
                Bot strength
                <input type="range" min={1} max={game === "chess" ? 4 : 3} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Bot strength" />
                <span>{["", "Easy", "Medium", "Hard", "Strong"][level]}</span>
              </label>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await startChatGameAction({ groupId, game, opponent: game === "trivia" ? "open" : opp, level });
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              onClose();
              onSent();
            }}
            data-chat-game-start
          >
            <Gamepad2Icon /> Start
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const nameOf = (id: string | undefined, names: Record<string, string>, viewerId: string) => (!id ? "?" : id === BOT ? "The bot" : id === viewerId ? "You" : (names[id] ?? "Someone"));

// The live board in a chat message.
export function GameCard({ m, viewerId, names, onChanged }: { m: ChatMessage; viewerId: string; names: Record<string, string>; onChanged: (patch: Partial<ChatMessage>) => void }) {
  const g = m.meta as unknown as GameMeta;
  const def = CHAT_GAMES.find((x) => x.key === g.game);
  const [busy, setBusy] = React.useState(false);
  const me = g.players.indexOf(viewerId);
  const myTurn = g.status === "playing" && me === g.turn;
  const act = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error ?? "Not allowed.");
    if (r.data && typeof r.data === "object") onChanged({ meta: r.data as Record<string, unknown> });
  };
  const move = (mv: Move) => act(() => chatGameMoveAction(m.id, mv));
  if (!def) return null;
  const [p0, p1] = [nameOf(g.players[0], names, viewerId), nameOf(g.players[1], names, viewerId)];
  const status =
    g.status === "waiting"
      ? "Waiting for someone to join"
      : g.status === "done"
        ? g.winner === "draw"
          ? "Draw"
          : g.winner === null
            ? "Finished"
            : `${nameOf(g.players[g.winner], names, viewerId)} won${g.players[g.winner] === viewerId ? "! 🎉" : ""}`
        : g.game === "trivia" || g.game === "rps"
          ? "Playing"
          : myTurn
            ? "Your move"
            : `${nameOf(g.players[g.turn], names, viewerId)} to move`;
  return (
    <div className="mb-1 w-[19rem] max-w-full space-y-2 rounded-xl bg-background p-2 text-foreground [&_*]:[text-shadow:none]" style={{ color: "var(--foreground)" }} data-game-card={g.game} data-game-status={g.status}>
      <div className="flex items-center gap-1.5 text-xs">
        <span className="text-base">{def.emoji}</span>
        <span className="font-semibold">{def.label}</span>
        {g.game !== "trivia" && g.players.length === 2 && <span className="truncate text-muted-foreground">· {p0} vs {p1}</span>}
      </div>
      <p className={cn("text-xs font-medium", myTurn ? "text-primary" : "text-muted-foreground", g.status === "done" && "text-foreground")} data-game-state>{status}</p>

      {g.status === "waiting" ? (
        g.players.includes(viewerId) ? <p className="text-xs text-muted-foreground">Anyone in the chat can join.</p> : <Button size="sm" disabled={busy} onClick={() => act(() => joinChatGameAction(m.id))} data-game-join>Join the game</Button>
      ) : g.game === "chess" ? (
        <ChessCard g={g} me={me} myTurn={myTurn && !busy} onMove={move} />
      ) : g.game === "tictactoe" ? (
        <div className="mx-auto grid w-48 grid-cols-3 gap-1">
          {(g.state.board as string[]).map((v, i) => (
            <button key={i} type="button" disabled={!myTurn || !!v || busy} onClick={() => move({ cell: i })} className={cn("flex aspect-square items-center justify-center rounded-md border bg-card text-3xl font-black", g.last === String(i) && "ring-2 ring-primary/50")} style={{ color: v === "X" ? "#4f46e5" : "#ea4335" }} aria-label={v || `Square ${i + 1}`} data-ttt={i}>
              {v}
            </button>
          ))}
        </div>
      ) : g.game === "connect4" ? (
        <div className="rounded-lg bg-[#1a56db] p-1">
          <div className="grid grid-cols-7 gap-1">
            {(g.state.board as string[]).map((v, i) => (
              <button key={i} type="button" disabled={!myTurn || busy || c4Drop(g.state.board as string[], i % 7) < 0} onClick={() => move({ col: i % 7 })} aria-label={`Column ${(i % 7) + 1}`} className={cn("aspect-square rounded-full", v === "R" ? "bg-[#ea4335]" : v === "Y" ? "bg-[#fbbc04]" : "bg-white/90", g.last === String(i) && "ring-2 ring-white")} data-c4={i % 7} />
            ))}
          </div>
        </div>
      ) : g.game === "reversi" ? (
        <ReversiCard g={g} me={me} myTurn={myTurn && !busy} onMove={move} />
      ) : g.game === "rps" ? (
        <RpsCard g={g} me={me} busy={busy} names={names} viewerId={viewerId} onMove={move} />
      ) : (
        <TriviaCard g={g} viewerId={viewerId} names={names} busy={busy} onMove={move} />
      )}

      <div className="flex flex-wrap gap-1">
        {g.status === "playing" && (me >= 0 || (g.game === "trivia" && g.by === viewerId)) && (
          <Button size="xs" variant="ghost" disabled={busy} onClick={() => (g.game === "trivia" || window.confirm("Resign this game?")) && act(() => resignChatGameAction(m.id))}>
            <FlagIcon /> {g.game === "trivia" ? "End the quiz" : "Resign"}
          </Button>
        )}
        {g.status === "done" && (me >= 0 || g.game === "trivia") && (
          <Button size="xs" variant="outline" disabled={busy} onClick={() => act(() => rematchChatGameAction(m.id))} data-game-rematch>
            <RotateCcwIcon /> {g.game === "trivia" ? "New quiz" : "Rematch"}
          </Button>
        )}
      </div>
    </div>
  );
}

function ChessCard({ g, me, myTurn, onMove }: { g: GameMeta; me: number; myTurn: boolean; onMove: (m: Move) => void }) {
  const fen = g.state.fen as string;
  const chess = React.useMemo(() => new Chess(fen), [fen]);
  const [sel, setSel] = React.useState<string | null>(null);
  const targets = sel ? chess.moves({ square: sel as Square, verbose: true }).map((x) => x.to as string) : [];
  const styles: Record<string, React.CSSProperties> = {};
  if (g.last) for (const s of [g.last.slice(0, 2), g.last.slice(2, 4)]) styles[s] = { background: "rgb(255 213 0 / .35)" };
  if (sel) styles[sel] = { background: "color-mix(in oklab, var(--primary) 35%, transparent)" };
  for (const t of targets) styles[t] = { background: "radial-gradient(circle, color-mix(in oklab, var(--primary) 55%, transparent) 25%, transparent 27%)" };
  return (
    <div className="space-y-1">
      <Chessboard
        options={{
          id: `chat-${fen.length}-${g.moves}`,
          position: fen,
          boardOrientation: me === 1 ? "black" : "white",
          allowDragging: myTurn,
          squareStyles: styles,
          onPieceDrop: ({ sourceSquare, targetSquare }) => {
            if (!targetSquare || !myTurn) return false;
            onMove({ from: sourceSquare, to: targetSquare });
            return true;
          },
          onSquareClick: ({ square }) => {
            if (!myTurn) return;
            if (sel && targets.includes(square)) return (onMove({ from: sel, to: square }), setSel(null));
            const p = chess.get(square as Square);
            setSel(p && p.color === chess.turn() ? square : null);
          },
        }}
      />
      {chess.isCheck() && g.status !== "done" && <p className="text-xs font-semibold text-[#d93025]">Check!</p>}
    </div>
  );
}

function ReversiCard({ g, me, myTurn, onMove }: { g: GameMeta; me: number; myTurn: boolean; onMove: (m: Move) => void }) {
  const b = g.state.board as string[];
  const mine = me === 0 ? "B" : "W";
  const legal = myTurn ? reversiMoves(b, mine) : [];
  const n = { B: b.filter((x) => x === "B").length, W: b.filter((x) => x === "W").length };
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-8 gap-px rounded-md bg-[#0b5e2e] p-1">
        {b.map((v, i) => (
          <button key={i} type="button" disabled={!legal.includes(i)} onClick={() => onMove({ cell: i })} aria-label={v ? (v === "B" ? "Black" : "White") : legal.includes(i) ? "Possible move" : "Empty"} className="flex aspect-square items-center justify-center bg-[#188038]" data-rv={i}>
            {v ? <span className={cn("size-[80%] rounded-full shadow", v === "B" ? "bg-[#111]" : "bg-white")} /> : legal.includes(i) ? <span className="size-2 rounded-full bg-black/30" /> : null}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">⚫ {n.B} · ⚪ {n.W}{myTurn && !legal.length ? " · no move: you pass" : ""}</p>
      {myTurn && !legal.length && <Button size="xs" onClick={() => onMove({ pass: true })}>Pass</Button>}
    </div>
  );
}

const RPS = { rock: "✊", paper: "✋", scissors: "✌️" } as const;
function RpsCard({ g, me, busy, names, viewerId, onMove }: { g: GameMeta; me: number; busy: boolean; names: Record<string, string>; viewerId: string; onMove: (m: Move) => void }) {
  const picks = g.state.picks as (string | null)[];
  const rounds = g.state.rounds as [string, string][];
  const score = g.state.score as number[];
  return (
    <div className="space-y-1.5">
      <p className="text-center text-sm font-semibold tabular-nums">{nameOf(g.players[0], names, viewerId)} {score[0]} : {score[1]} {nameOf(g.players[1], names, viewerId)}</p>
      {rounds.length > 0 && <p className="text-center text-lg">{rounds.slice(-3).map(([a, b]) => `${RPS[a as keyof typeof RPS]} ${RPS[b as keyof typeof RPS]}`).join("  ·  ")}</p>}
      {g.status === "playing" && me >= 0 && (
        picks[me] ? (
          <p className="text-center text-xs text-muted-foreground">You picked {RPS[picks[me] as keyof typeof RPS]}. Waiting for the other side…</p>
        ) : (
          <div className="flex justify-center gap-2">
            {(Object.keys(RPS) as (keyof typeof RPS)[]).map((k) => (
              <button key={k} type="button" disabled={busy} onClick={() => onMove({ pick: k })} className="rounded-full border bg-card p-2 text-2xl transition-transform hover:scale-110" aria-label={k} data-rps={k}>
                {RPS[k]}
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}

function TriviaCard({ g, viewerId, names, busy, onMove }: { g: GameMeta; viewerId: string; names: Record<string, string>; busy: boolean; onMove: (m: Move) => void }) {
  const qs = g.state.questions as TriviaQ[];
  const mine = (g.state.answers as Record<string, number[]>)[viewerId] ?? [];
  const i = mine.length;
  const q = qs[i];
  const prev = i > 0 ? qs[i - 1] : null;
  const scores = triviaScores(g);
  return (
    <div className="space-y-2">
      {prev && <p className={cn("text-xs", prev.answer === mine[i - 1] ? "text-[#188038]" : "text-[#d93025]")}>{prev.answer === mine[i - 1] ? "Right!" : `Not quite: ${prev.options[prev.answer]}`}</p>}
      {q && g.status !== "done" ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-muted-foreground">Question {i + 1} of {qs.length}{q.category ? ` · ${q.category}` : ""}</p>
          <p className="text-sm font-medium">{q.q}</p>
          <div className="grid gap-1">
            {q.options.map((o, k) => (
              <button key={k} type="button" disabled={busy} onClick={() => onMove({ q: i, choice: k })} className="rounded-md border bg-card px-2 py-1 text-left text-sm hover:bg-muted" data-trivia-option={k}>
                {o}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{g.status === "done" ? "The quiz is over." : "You answered every question."}</p>
      )}
      {scores.length > 0 && (
        <ol className="space-y-0.5 text-xs">
          {scores.slice(0, 6).map((s, k) => (
            <li key={s.id} className={cn("flex justify-between rounded px-1.5", s.id === viewerId && "bg-primary/10 font-medium")}>
              <span>{["🥇", "🥈", "🥉"][k] ?? `${k + 1}.`} {nameOf(s.id, names, viewerId)}</span>
              <span className="tabular-nums">{s.score}/{qs.length}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
