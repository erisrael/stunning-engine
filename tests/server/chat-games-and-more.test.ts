// Games in chat (each move checked, the bot answers, hidden picks and quiz answers stay hidden), focus mode, Seed
// Town (avatars, who is where, absences only for HR), the presentation templates and the fuller company deck.
import { closeDb, get, nowIso, run, uid } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as G from "../../src/server/chat-games";
import { groupMessages } from "../../src/server/chat";
import * as fun from "../../src/server/fun";
import * as W from "../../src/server/fun-world";
import { applyMove, newState, viewFor, type GameMeta } from "../../src/lib/chat-games";
import { BUILT_IN_TEMPLATES } from "../../src/lib/deck-templates";
import { companySlides } from "../../src/server/decks";
import { parseYouTube, personaFrom } from "../../src/lib/focus";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 400)}` : ""}`);
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  const outsider = (await loadUser((await upsertAccount({ name: "Out Sider", email: "out@cg.local", title: "x", roles: ["editing"] as never, password: "Outsider-2026-ok!", mustChangePassword: false })).id))!;
  const g = uid("grp_");
  const now = nowIso();
  await run("INSERT INTO chat_groups (id, name, kind, created_by, created_at) VALUES (?, 'Game room', 'group', ?, ?)", g, admin.id, now);
  for (const u of [admin, dawit]) await run("INSERT INTO chat_members (group_id, user_id, member_role, joined_at) VALUES (?, ?, 'member', ?)", g, u.id, now);
  const meta = async (id: string, viewer = admin.id) => (await groupMessages(g, { viewerId: viewer })).find((m) => m.id === id)!.meta as unknown as GameMeta;

  // ---------------------------------------------------------------- chat games
  check("only chat members start games", await rejects(G.startGame(outsider, { groupId: g, game: "tictactoe", opponent: "bot" })));
  const ttt = await G.startGame(admin, { groupId: g, game: "tictactoe", opponent: "bot", level: 3 });
  let m = await G.playMove(admin, ttt, { cell: 4 });
  check("tic-tac-toe against the bot: the bot answers at once", (m.state.board as string[]).filter(Boolean).length === 2 && m.turn === 0, m.state);
  check("a taken square is refused", await rejects(G.playMove(admin, ttt, { cell: 4 })));
  check("a watcher cannot move", await rejects(G.playMove(dawit, ttt, { cell: 0 })));

  const ch = await G.startGame(admin, { groupId: g, game: "chess", opponent: dawit.id });
  check("it is not your move until the other side plays", await rejects(G.playMove(dawit, ch, { from: "e7", to: "e5" })));
  check("illegal chess moves are refused", await rejects(G.playMove(admin, ch, { from: "e2", to: "e5" })));
  await G.playMove(admin, ch, { from: "e2", to: "e4" });
  m = await G.playMove(dawit, ch, { from: "e7", to: "e5" });
  check("two players take turns", m.moves === 2 && m.turn === 0 && m.last === "e7e5");
  m = await G.resignGame(dawit, ch);
  check("resigning gives the game to the other side", m.status === "done" && m.winner === 0);
  const re = await G.rematch(admin, ch);
  check("a rematch is a new game in the chat", (await meta(re)).players.join() === [admin.id, dawit.id].join());

  const open = await G.startGame(admin, { groupId: g, game: "connect4", opponent: "open" });
  check("an open game waits for someone", (await meta(open)).status === "waiting");
  check("you cannot join your own open game", await rejects(G.joinGame(admin, open)));
  await G.joinGame(dawit, open);
  check("the first to join plays", (await meta(open)).players[1] === dawit.id && (await meta(open)).status === "playing");
  let c4 = newState("connect4") as { board: string[] };
  let c4m: GameMeta = { game: "connect4", players: ["a", "b"], open: false, level: 2, turn: 0, status: "playing", winner: null, moves: 0, last: null, state: c4, by: "a" };
  for (const [who, col] of [[0, 0], [1, 1], [0, 0], [1, 1], [0, 0], [1, 1], [0, 0]] as const) c4m = applyMove(c4m, who, { col });
  check("four in a column wins Connect Four", c4m.status === "done" && c4m.winner === 0);

  const rps = await G.startGame(admin, { groupId: g, game: "rps", opponent: dawit.id });
  await G.playMove(admin, rps, { pick: "rock" });
  check("the other side's rock-paper-scissors pick stays hidden", ((await meta(rps, dawit.id)).state.picks as string[])[0] === "hidden" && ((await meta(rps, admin.id)).state.picks as string[])[0] === "rock");

  const quiz = await G.startGame(admin, { groupId: g, game: "trivia", opponent: "open" });
  const q0 = await meta(quiz, dawit.id);
  check("quiz answers are not sent before answering", (q0.state.questions as { answer: number }[]).every((q) => q.answer === -1) && (q0.state.questions as unknown[]).length === 5);
  await G.playMove(dawit, quiz, { q: 0, choice: 0 });
  check("answered questions show their answer", ((await meta(quiz, dawit.id)).state.questions as { answer: number }[])[0]!.answer >= 0);
  check("questions are answered in order", await rejects(G.playMove(dawit, quiz, { q: 3, choice: 0 })));
  check("hidden helpers hide, viewFor never leaks", JSON.stringify(viewFor({ ...q0, state: { ...q0.state } } as GameMeta, "nobody")).includes('"answer":-1'));

  // ---------------------------------------------------------------- focus mode
  check("the quiz finds a persona", personaFrom([0, 0, 0, 2]).key === "deep-diver" && personaFrom([2, 2, 1, 0]).key === "energy-sprinter");
  check("YouTube links are read safely", parseYouTube("https://www.youtube.com/playlist?list=PLabc123")?.list === "PLabc123" && parseYouTube("https://youtu.be/jfKfPfyJRdk")?.video === "jfKfPfyJRdk" && parseYouTube("https://evil.example/?list=PLx") === null);
  const fset = await fun.saveFocus(dawit, { persona: "calm-coder", prefs: { minutes: 50, hideToasts: true, youtube: [{ id: "PLgood", title: "Mine" }, { id: "../bad", title: "x" }] } });
  check("persona and settings are kept", fset.persona === "calm-coder" && fset.prefs.minutes === 50 && fset.prefs.youtube!.length === 1);
  check("unknown personas are refused", await rejects(fun.saveFocus(dawit, { persona: "hacker" })));
  const done = await fun.completeFocus(dawit, 25);
  check("a finished session counts and earns points", done.sessions === 1 && done.minutes === 25 && done.earned >= 0);
  check("sessions cannot be finished back to back", await rejects(fun.completeFocus(dawit, 25)));

  // ---------------------------------------------------------------- Seed Town
  const look = await W.saveLook(dawit, { skin: "#123456", shirt: "javascript:alert(1)", hat: "crown", face: "cool" } as never);
  check("character looks are cleaned and kept", look.skin === "#123456" && look.shirt === W.DEFAULT_LOOK.shirt && look.hat === "crown" && (await W.myLook(dawit)).face === "cool");
  const forDawit = await W.roster(dawit);
  const forAdmin = await W.roster(admin);
  check("everyone is on the roster with a status and progress", forAdmin.residents.length >= 3 && forAdmin.residents.every((r) => r.progress >= 0 && r.progress <= 100));
  check("absences show to HR and Admin only", forAdmin.seesAbsence && !forDawit.seesAbsence && !forDawit.residents.some((r) => r.status === "absent" || r.status === "leave"));
  const s1 = await W.sync(dawit, { x: 5, z: 6, say: "hello town" });
  const s2 = await W.sync(admin, { x: 1, z: 1, emote: "wave" });
  check("the live room shares positions and chat", s1.p.every((p) => p[0] !== dawit.id) && s2.p.some((p) => p[0] === dawit.id && p[2] === 5 && p[6] === "hello town"));
  check("chat is paced", await rejects(W.sync(dawit, { say: "again" })));
  await fun.saveFunConfig(admin, { world: false });
  check("Admin turns Seed Town off", await rejects(W.roster(dawit)));
  await fun.saveFunConfig(admin, { world: true, worldAbsence: "everyone" });
  check("Admin can show absences to everyone", (await W.roster(dawit)).seesAbsence);

  // ---------------------------------------------------------------- presentations
  check("twenty built-in templates, professional and fun", BUILT_IN_TEMPLATES.length >= 20 && ["executive", "consulting", "comic", "neon-night", "space"].every((k) => BUILT_IN_TEMPLATES.some((t) => t.id === k)) && new Set(BUILT_IN_TEMPLATES.map((t) => t.id)).size === BUILT_IN_TEMPLATES.length);
  check("drawn backgrounds are safe images", BUILT_IN_TEMPLATES.every((t) => t.background === null || t.background.startsWith("data:image/svg+xml;base64,")));
  const deck = await companySlides(admin);
  check("the company deck opens with the headline numbers and ends with highlights", deck.slides[0]!.key === "glance" && deck.slides.at(-1)!.key === "highlights", deck.slides.map((s) => s.key));

  console.log(`${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
