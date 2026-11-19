// Games played inside a chat (a message that is a live board): chess, tic-tac-toe, Connect Four, Reversi,
// rock-paper-scissors and a group trivia quiz. Against a colleague, open to the first member who joins, or against
// the bot. The rules live here so the browser shows legal moves and the server checks every move.
import { Chess } from "chess.js";

export const CHAT_GAMES = [
  { key: "chess", label: "Chess", emoji: "♟️", players: 2, bot: true, note: "The classic. Click a piece, then a square." },
  { key: "tictactoe", label: "Tic-tac-toe", emoji: "⭕", players: 2, bot: true, note: "Three in a row." },
  { key: "connect4", label: "Connect Four", emoji: "🔴", players: 2, bot: true, note: "Drop discs; four in a line wins." },
  { key: "reversi", label: "Reversi", emoji: "⚫", players: 2, bot: true, note: "Flip your opponent's discs." },
  { key: "rps", label: "Rock paper scissors", emoji: "✊", players: 2, bot: true, note: "Best of three; picks stay hidden until both chose." },
  { key: "trivia", label: "Trivia quiz", emoji: "🧠", players: 0, bot: false, note: "Five questions for the whole chat; the scoreboard shows live." },
] as const;
export type ChatGameKind = (typeof CHAT_GAMES)[number]["key"];
export const BOT = "bot";

export type TriviaQ = { q: string; options: string[]; answer: number; category?: string };
export type GameMeta = {
  game: ChatGameKind;
  players: string[]; // user ids or "bot"; trivia: everyone who answered
  open: boolean; // waiting for anyone to join
  level: number; // bot strength 1-5
  turn: number; // whose move: index into players
  status: "waiting" | "playing" | "done";
  winner: number | "draw" | null;
  moves: number;
  last: string | null; // last move, for highlighting
  state: Record<string, unknown>;
  by: string; // who started it
};

export type Move = { cell?: number; col?: number; from?: string; to?: string; promotion?: string; pick?: "rock" | "paper" | "scissors"; q?: number; choice?: number; pass?: boolean };

// ------------------------------------------------------------------------------------------------- start

export function newState(game: ChatGameKind, trivia?: TriviaQ[]): Record<string, unknown> {
  if (game === "chess") return { fen: new Chess().fen() };
  if (game === "tictactoe") return { board: Array(9).fill("") };
  if (game === "connect4") return { board: Array(42).fill("") };
  if (game === "reversi") {
    const b = Array(64).fill("");
    b[27] = "W";
    b[28] = "B";
    b[35] = "B";
    b[36] = "W";
    return { board: b };
  }
  if (game === "rps") return { picks: [null, null], rounds: [] as [string, string][], score: [0, 0] };
  return { questions: trivia ?? [], answers: {} as Record<string, number[]> };
}

// ------------------------------------------------------------------------------------------------- rules

const LINES3 = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export const tttWinner = (b: string[]) => {
  const l = LINES3.find((x) => b[x[0]!] && b[x[0]!] === b[x[1]!] && b[x[0]!] === b[x[2]!]);
  return l ? b[l[0]!]! : b.every(Boolean) ? "draw" : null;
};

export function c4Drop(b: string[], col: number) {
  for (let r = 5; r >= 0; r--) if (!b[r * 7 + col]) return r * 7 + col;
  return -1;
}
export function c4Winner(b: string[]) {
  const at = (r: number, c: number) => (r >= 0 && r < 6 && c >= 0 && c < 7 ? b[r * 7 + c] : "");
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 7; c++) {
      const v = at(r, c);
      if (!v) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]] as const) if ([1, 2, 3].every((k) => at(r + dr * k, c + dc * k) === v)) return v;
    }
  return b.every(Boolean) ? "draw" : null;
}

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;
export function reversiFlips(b: string[], cell: number, me: string) {
  if (b[cell]) return [];
  const op = me === "B" ? "W" : "B";
  const r0 = Math.floor(cell / 8), c0 = cell % 8;
  const out: number[] = [];
  for (const [dr, dc] of DIRS) {
    const line: number[] = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === op) (line.push(r * 8 + c), (r += dr), (c += dc));
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === me) out.push(...line);
  }
  return out;
}
export const reversiMoves = (b: string[], me: string) => b.map((_, i) => i).filter((i) => reversiFlips(b, i, me).length > 0);
const reversiCount = (b: string[]) => ({ B: b.filter((x) => x === "B").length, W: b.filter((x) => x === "W").length });

const RPS_BEATS: Record<string, string> = { rock: "scissors", paper: "rock", scissors: "paper" };
const mark = (turn: number, game: ChatGameKind) => (game === "tictactoe" ? (turn === 0 ? "X" : "O") : game === "connect4" ? (turn === 0 ? "R" : "Y") : turn === 0 ? "B" : "W");

// Apply a move by player `who` (an index). Returns the new meta, or throws with a reason to show.
export function applyMove(m: GameMeta, who: number, mv: Move, userId?: string): GameMeta {
  if (m.status === "done") throw new Error("This game is over.");
  const next: GameMeta = JSON.parse(JSON.stringify(m));
  const s = next.state;
  if (m.game === "trivia") {
    const qs = s.questions as TriviaQ[];
    const ans = s.answers as Record<string, number[]>;
    const q = mv.q ?? -1;
    if (!userId || q < 0 || q >= qs.length || mv.choice === undefined || mv.choice < 0 || mv.choice >= qs[q]!.options.length) throw new Error("Choose an answer.");
    const mine = ans[userId] ?? [];
    if (mine.length !== q) throw new Error("Answer the questions in order.");
    ans[userId] = [...mine, mv.choice];
    if (!next.players.includes(userId)) next.players.push(userId);
    next.moves++;
    next.status = "playing";
    return next;
  }
  if (m.game === "rps") {
    const picks = s.picks as (string | null)[];
    if (!mv.pick || !RPS_BEATS[mv.pick]) throw new Error("Pick rock, paper or scissors.");
    if (picks[who]) throw new Error("You picked already; waiting for the other side.");
    picks[who] = mv.pick;
    if (picks[0] && picks[1]) {
      const score = s.score as number[];
      const rounds = s.rounds as [string, string][];
      rounds.push([picks[0], picks[1]]);
      if (RPS_BEATS[picks[0]] === picks[1]) score[0]!++;
      else if (RPS_BEATS[picks[1]] === picks[0]) score[1]!++;
      s.picks = [null, null];
      if (score[0]! >= 2 || score[1]! >= 2) (next.status = "done"), (next.winner = score[0]! > score[1]! ? 0 : 1);
      else if (rounds.length >= 7) (next.status = "done"), (next.winner = score[0] === score[1] ? "draw" : score[0]! > score[1]! ? 0 : 1);
    }
    next.moves++;
    return next;
  }
  if (who !== m.turn) throw new Error("Wait for your turn.");
  if (m.game === "chess") {
    const c = new Chess(s.fen as string);
    let res;
    try {
      res = c.move({ from: mv.from ?? "", to: mv.to ?? "", promotion: mv.promotion ?? "q" });
    } catch {
      throw new Error("That move is not allowed.");
    }
    s.fen = c.fen();
    next.last = `${res.from}${res.to}`;
    if (c.isGameOver()) (next.status = "done"), (next.winner = c.isCheckmate() ? who : "draw");
  } else if (m.game === "tictactoe") {
    const b = s.board as string[];
    const i = mv.cell ?? -1;
    if (i < 0 || i > 8 || b[i]) throw new Error("Pick an empty square.");
    b[i] = mark(who, "tictactoe");
    next.last = String(i);
    const w = tttWinner(b);
    if (w) (next.status = "done"), (next.winner = w === "draw" ? "draw" : who);
  } else if (m.game === "connect4") {
    const b = s.board as string[];
    const i = c4Drop(b, mv.col ?? -1);
    if ((mv.col ?? -1) < 0 || (mv.col ?? 9) > 6 || i < 0) throw new Error("That column is full.");
    b[i] = mark(who, "connect4");
    next.last = String(i);
    const w = c4Winner(b);
    if (w) (next.status = "done"), (next.winner = w === "draw" ? "draw" : who);
  } else if (m.game === "reversi") {
    const b = s.board as string[];
    const me = mark(who, "reversi");
    if (mv.pass) {
      if (reversiMoves(b, me).length) throw new Error("You have a move; you cannot pass.");
    } else {
      const flips = reversiFlips(b, mv.cell ?? -1, me);
      if (!flips.length) throw new Error("That square flips nothing.");
      b[mv.cell!] = me;
      for (const f of flips) b[f] = me;
      next.last = String(mv.cell);
    }
    const op = me === "B" ? "W" : "B";
    if (!reversiMoves(b, op).length && !reversiMoves(b, me).length) {
      const n = reversiCount(b);
      next.status = "done";
      next.winner = n.B === n.W ? "draw" : n.B > n.W ? 0 : 1;
    }
  }
  next.moves++;
  if (next.status !== "done") next.turn = 1 - who;
  // Reversi: a side with no move passes by itself.
  if (next.game === "reversi" && next.status !== "done" && !reversiMoves(s.board as string[], mark(next.turn, "reversi")).length) next.turn = 1 - next.turn;
  return next;
}

// ------------------------------------------------------------------------------------------------- the bot

function tttBest(b: string[], me: string): number {
  const op = me === "X" ? "O" : "X";
  const score = (bb: string[], turn: string, depth: number): number => {
    const w = tttWinner(bb);
    if (w === me) return 10 - depth;
    if (w === op) return depth - 10;
    if (w === "draw") return 0;
    const vals = bb.map((v, i) => (v ? null : (() => { const n = [...bb]; n[i] = turn; return score(n, turn === me ? op : me, depth + 1); })())).filter((x): x is number => x !== null);
    return turn === me ? Math.max(...vals) : Math.min(...vals);
  };
  const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  return free.map((i) => ({ i, s: (() => { const n = [...b]; n[i] = me; return score(n, op, 1); })() })).sort((a, c) => c.s - a.s)[0]!.i;
}

function c4Best(b: string[], me: string, level: number): number {
  const op = me === "R" ? "Y" : "R";
  const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => c4Drop(b, c) >= 0);
  const wins = (who: string, c: number) => { const n = [...b]; n[c4Drop(b, c)] = who; return c4Winner(n) === who; };
  const win = cols.find((c) => wins(me, c));
  if (win !== undefined) return win;
  const block = cols.find((c) => wins(op, c));
  if (block !== undefined && level > 1) return block;
  // Avoid a move that lets the other side win right on top of it.
  const safe = cols.filter((c) => { const n = [...b]; n[c4Drop(b, c)] = me; const above = c4Drop(n, c); if (above < 0) return true; n[above] = op; return c4Winner(n) !== op; });
  const pool = level > 2 && safe.length ? safe : cols;
  return level > 1 ? pool[0]! : pool[Math.floor(Math.random() * pool.length)]!;
}

function reversiBest(b: string[], me: string, level: number): number | null {
  const moves = reversiMoves(b, me);
  if (!moves.length) return null;
  if (level <= 1) return moves[Math.floor(Math.random() * moves.length)]!;
  const corner = [0, 7, 56, 63];
  const xsq = [9, 14, 49, 54];
  return moves.map((i) => ({ i, s: reversiFlips(b, i, me).length + (corner.includes(i) ? 50 : 0) - (xsq.includes(i) ? 20 : 0) + (i % 8 === 0 || i % 8 === 7 || i < 8 || i > 55 ? 5 : 0) })).sort((a, c) => c.s - a.s)[0]!.i;
}

// The bot's move for the side at index `who`. chessMove: js-chess-engine on the server (passed in to keep this file
// light in the browser).
export function botMove(m: GameMeta, who: number, chessMove?: (fen: string, level: number) => { from: string; to: string }): Move {
  const s = m.state;
  if (m.game === "rps") return { pick: (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]! };
  if (m.game === "tictactoe") {
    const b = s.board as string[];
    const free = b.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
    return { cell: m.level <= 1 && Math.random() < 0.6 ? free[Math.floor(Math.random() * free.length)]! : tttBest(b, mark(who, "tictactoe")) };
  }
  if (m.game === "connect4") return { col: c4Best(s.board as string[], mark(who, "connect4"), m.level) };
  if (m.game === "reversi") {
    const c = reversiBest(s.board as string[], mark(who, "reversi"), m.level);
    return c === null ? { pass: true } : { cell: c };
  }
  if (m.game === "chess" && chessMove) return chessMove(s.fen as string, m.level);
  throw new Error("The bot does not play this game.");
}

// ------------------------------------------------------------------------------------------------- what a viewer sees

// Hidden from the viewer: the other side's rock-paper-scissors pick, and trivia answers for questions they have
// not answered yet (so the correct answer is never sent early).
export function viewFor(m: GameMeta, viewerId: string): GameMeta {
  const v: GameMeta = JSON.parse(JSON.stringify(m));
  if (v.game === "rps") {
    const me = v.players.indexOf(viewerId);
    const picks = v.state.picks as (string | null)[];
    v.state.picks = picks.map((p, i) => (i === me ? p : p ? "hidden" : null));
  }
  if (v.game === "trivia") {
    const qs = v.state.questions as TriviaQ[];
    const done = ((v.state.answers as Record<string, number[]>)[viewerId] ?? []).length;
    v.state.questions = qs.map((q, i) => (i < done || v.status === "done" ? q : { ...q, answer: -1 }));
  }
  return v;
}

export function triviaScores(m: GameMeta) {
  const qs = m.state.questions as TriviaQ[];
  const ans = m.state.answers as Record<string, number[]>;
  return Object.entries(ans)
    .map(([id, a]) => ({ id, score: a.filter((c, i) => qs[i]?.answer === c).length, answered: a.length }))
    .sort((x, y) => y.score - x.score || y.answered - x.answered);
}

// Built-in questions for when the open trivia service cannot be reached.
export const FALLBACK_TRIVIA: TriviaQ[] = [
  { q: "What is the capital of Ethiopia?", options: ["Addis Ababa", "Nairobi", "Asmara", "Khartoum"], answer: 0, category: "Geography" },
  { q: "How many sides does a hexagon have?", options: ["5", "6", "7", "8"], answer: 1, category: "Maths" },
  { q: "Which planet is known as the Red Planet?", options: ["Venus", "Jupiter", "Mars", "Mercury"], answer: 2, category: "Science" },
  { q: "What is H2O better known as?", options: ["Salt", "Water", "Oxygen", "Hydrogen"], answer: 1, category: "Science" },
  { q: "Which is the longest river in Africa?", options: ["Congo", "Niger", "Zambezi", "Nile"], answer: 3, category: "Geography" },
  { q: "What is 12 × 12?", options: ["124", "144", "132", "154"], answer: 1, category: "Maths" },
  { q: "Which language has the alphabet called Fidel?", options: ["Swahili", "Amharic", "Arabic", "Somali"], answer: 1, category: "Languages" },
  { q: "Who painted the Mona Lisa?", options: ["Michelangelo", "Van Gogh", "Leonardo da Vinci", "Picasso"], answer: 2, category: "Art" },
  { q: "What gas do plants take in from the air?", options: ["Oxygen", "Nitrogen", "Carbon dioxide", "Helium"], answer: 2, category: "Science" },
  { q: "How many minutes are in a day?", options: ["1,440", "1,200", "2,400", "960"], answer: 0, category: "Maths" },
];
