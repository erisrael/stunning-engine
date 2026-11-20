import { aiMove } from "js-chess-engine";
import { get, nowIso, run, uid } from "./db";
import { membership, touchMessage } from "./chat";
import { notify } from "./notifications";
import type { AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { BOT, CHAT_GAMES, FALLBACK_TRIVIA, applyMove, botMove, newState, viewFor, type ChatGameKind, type GameMeta, type Move, type TriviaQ } from "@/lib/chat-games";

// Games inside a chat (src/lib/chat-games.ts has the rules). A game is a chat message (kind "game") whose meta holds
// the board; every move is checked here, the bot answers on the server, and touchMessage lets everyone's open
// chat pick the change up.

type Row = { id: string; group_id: string; author_id: string; kind: string; meta: string; deleted_at: string | null };

const chessBot = (fen: string, level: number) => {
  const m = aiMove(fen, Math.max(1, Math.min(4, level)));
  const [from, to] = Object.entries(m)[0]!;
  return { from: from.toLowerCase(), to: to.toLowerCase() };
};

async function member(user: AppUser, groupId: string) {
  const m = await membership(groupId, user.id);
  if (!m) throw new WorkflowError("FORBIDDEN", "Join the chat to play.");
  const g = await get<{ kind: string; archived: number; name: string }>("SELECT kind, archived, name FROM chat_groups WHERE id = ?", groupId);
  if (!g || g.archived) throw new WorkflowError("INVALID_STATE", "This chat is archived.");
  return { m, g };
}

const decodeHtml = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&eacute;/g, "é").replace(/&[a-z]+;/g, "");

// Five multiple-choice questions from the Open Trivia Database (free), or built-in ones when it cannot be reached.
async function triviaQuestions(): Promise<TriviaQ[]> {
  try {
    const r = await fetch("https://opentdb.com/api.php?amount=5&type=multiple", { signal: AbortSignal.timeout(8000) });
    const j = (await r.json()) as { response_code: number; results: { question: string; correct_answer: string; incorrect_answers: string[]; category: string }[] };
    if (j.response_code !== 0 || !j.results.length) throw new Error("no questions");
    return j.results.map((x) => {
      const options = [...x.incorrect_answers, x.correct_answer].map(decodeHtml).sort(() => Math.random() - 0.5);
      return { q: decodeHtml(x.question), options, answer: options.indexOf(decodeHtml(x.correct_answer)), category: decodeHtml(x.category) };
    });
  } catch {
    return [...FALLBACK_TRIVIA].sort(() => Math.random() - 0.5).slice(0, 5);
  }
}

const label = (g: ChatGameKind) => CHAT_GAMES.find((x) => x.key === g)!;

// Start a game in a chat: against someone named, open to the first member who joins, or against the bot.
export async function startGame(user: AppUser, input: { groupId: string; game: string; opponent: "bot" | "open" | string; level?: number }) {
  const def = CHAT_GAMES.find((x) => x.key === input.game);
  if (!def) throw new WorkflowError("VALIDATION", "Choose a game.");
  const { g } = await member(user, input.groupId);
  const game = def.key as ChatGameKind;
  const level = Math.max(1, Math.min(5, Math.round(Number(input.level ?? 2))));
  let players: string[] = [user.id];
  let open = false;
  if (game === "trivia") open = true;
  else if (input.opponent === "bot") {
    if (!def.bot) throw new WorkflowError("VALIDATION", "The bot does not play this game.");
    players = [user.id, BOT];
  } else if (input.opponent === "open") open = true;
  else {
    if (input.opponent === user.id) throw new WorkflowError("VALIDATION", "Choose someone else, or the bot.");
    if (!(await membership(input.groupId, input.opponent))) throw new WorkflowError("VALIDATION", "They are not in this chat.");
    players = [user.id, input.opponent];
  }
  const meta: GameMeta = {
    game,
    players,
    open,
    level,
    turn: 0,
    status: game === "trivia" ? "playing" : players.length === 2 ? "playing" : "waiting",
    winner: null,
    moves: 0,
    last: null,
    state: newState(game, game === "trivia" ? await triviaQuestions() : undefined),
    by: user.id,
  };
  const id = uid("msg_");
  const now = nowIso();
  const body = `${def.label}${players[1] === BOT ? " against the bot" : open ? (game === "trivia" ? " for everyone" : ": who will play?") : ""}`;
  await run("INSERT INTO chat_messages (id, group_id, author_id, body, kind, meta, created_at) VALUES (?, ?, ?, ?, 'game', ?, ?)", id, input.groupId, user.id, body, JSON.stringify(meta), now);
  await run("UPDATE chat_groups SET last_message_at = ? WHERE id = ?", now, input.groupId);
  if (players[1] && players[1] !== BOT) await notify([players[1]], { type: "discussion", title: `${user.name} challenges you to ${def.label}`, body: g.name, link: `/chat?g=${input.groupId}`, dedupeKey: `game:${id}` }, now, user.id);
  return id;
}

async function load(user: AppUser, messageId: string) {
  const r = await get<Row>("SELECT id, group_id, author_id, kind, meta, deleted_at FROM chat_messages WHERE id = ?", messageId);
  if (!r || r.kind !== "game" || r.deleted_at) throw new WorkflowError("NOT_FOUND", "Game not found.");
  await member(user, r.group_id);
  return { r, m: JSON.parse(r.meta) as GameMeta };
}
async function save(id: string, m: GameMeta) {
  await run("UPDATE chat_messages SET meta = ? WHERE id = ?", JSON.stringify(m), id);
  await touchMessage(id);
}

export async function joinGame(user: AppUser, messageId: string) {
  const { r, m } = await load(user, messageId);
  if (!m.open || m.players.length >= 2) throw new WorkflowError("INVALID_STATE", "Someone already joined.");
  if (m.players.includes(user.id)) throw new WorkflowError("VALIDATION", "Wait for someone else to join, or start one against the bot.");
  m.players.push(user.id);
  m.open = false;
  m.status = "playing";
  await save(r.id, m);
  return viewFor(m, user.id);
}

export async function playMove(user: AppUser, messageId: string, mv: Move) {
  const { r, m } = await load(user, messageId);
  let who = m.players.indexOf(user.id);
  if (m.game !== "trivia") {
    if (m.status === "waiting") throw new WorkflowError("INVALID_STATE", "Waiting for someone to join.");
    if (who < 0) throw new WorkflowError("FORBIDDEN", "You are watching this game.");
  } else who = 0;
  let next: GameMeta;
  try {
    next = applyMove(m, who, mv, user.id);
    // The bot answers at once (several times in Reversi when the person must pass).
    for (let guard = 0; guard < 4 && next.status !== "done" && next.players[1] === BOT; guard++) {
      const botTurn = next.game === "rps" ? (next.state.picks as (string | null)[])[1] === null && (next.state.picks as (string | null)[])[0] !== null : next.turn === 1;
      if (!botTurn) break;
      next = applyMove(next, 1, botMove(next, 1, chessBot));
    }
  } catch (e) {
    throw new WorkflowError("VALIDATION", (e as Error).message);
  }
  await save(r.id, next);
  // Whose turn it is now hears about it when they are away (one notice per game).
  const other = next.players[next.turn];
  if (next.game !== "trivia" && next.status === "playing" && other && other !== BOT && other !== user.id)
    await notify([other], { type: "discussion", title: `Your move in ${label(next.game).label}`, link: `/chat?g=${r.group_id}`, dedupeKey: `game-turn:${r.id}:${Math.floor(Date.now() / 600000)}` }, nowIso(), user.id).catch(() => {});
  return viewFor(next, user.id);
}

export async function resignGame(user: AppUser, messageId: string) {
  const { r, m } = await load(user, messageId);
  const who = m.players.indexOf(user.id);
  if (m.game === "trivia") {
    if (m.by !== user.id) throw new WorkflowError("FORBIDDEN", "Only who started the quiz ends it.");
    m.status = "done";
  } else {
    if (who < 0) throw new WorkflowError("FORBIDDEN", "Only a player can resign.");
    if (m.status === "done") throw new WorkflowError("INVALID_STATE", "This game is over.");
    m.status = "done";
    m.winner = m.players.length === 2 ? 1 - who : null;
  }
  await save(r.id, m);
  return viewFor(m, user.id);
}

// The same game again with the sides swapped.
export async function rematch(user: AppUser, messageId: string) {
  const { r, m } = await load(user, messageId);
  if (m.game !== "trivia" && !m.players.includes(user.id)) throw new WorkflowError("FORBIDDEN", "Only a player asks for a rematch.");
  const opponent = m.game === "trivia" ? "open" : m.players[1] === BOT ? "bot" : (m.players.find((p) => p !== user.id) ?? "open");
  return startGame(user, { groupId: r.group_id, game: m.game, opponent, level: m.level });
}

export function gameView(metaJson: string, viewerId: string) {
  return viewFor(JSON.parse(metaJson) as GameMeta, viewerId);
}
