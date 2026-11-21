// Seed Town's city overhaul on the server: what town folk remember and the tasks they give (paid once, only at the
// place), the AI answering for them only when Admin allows, the online Seed Strike referee (matches, teams, hits
// checked for range, team and rate, kills and the winner), the wider town (positions past the ring road), realistic
// looks, the new cars and rewards for activity modes.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { upsertAccount } from "../../src/server/workspace-data";
import * as fun from "../../src/server/fun";
import * as npc from "../../src/server/fun-npc";
import * as W from "../../src/server/fun-world";
import * as shop from "../../src/server/fun-shop";
import { CATALOG, PEOPLE_BASES, cleanLook, lookItems } from "../../src/lib/fun-catalog";
import { WEAPONS } from "../../src/lib/strike-weapons";
import { CRUD_AREAS } from "../../src/lib/domain";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra).slice(0, 500)}` : ""}`);
};
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function main() {
  const by = async (email: string) => (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = ?", email))!.id))!;
  const admin = await by("admin@demo.local");
  const dawit = await by("dawit@demo.local");
  const hana = await by("hana@demo.local");
  const guest = (await loadUser((await upsertAccount({ name: "Strike Guest", email: "strike@seedtown.local", title: "x", roles: ["editing"] as never, password: "Strike-Guest-2026!", mustChangePassword: false })).id))!;
  await fun.saveFunConfig(admin, { enabled: true, world: true, shop: true, points: true, playCoins: 60, freeAll: false });
  await run("DELETE FROM fun_points WHERE user_id = ?", dawit.id);

  // ---------------------------------------------------------------- town folk remember
  const m0 = await npc.npcMemory(dawit, "npc-folk-0");
  check("a new acquaintance remembers nothing", m0.met === 0 && m0.relation === 0 && m0.quest === null);
  const m1 = await npc.npcTalked(dawit, "npc-folk-0", { topic: "hello" });
  check("talking counts a meeting and warms them up", m1.met === 1 && m1.relation === 1 && m1.topics[0] === "hello");
  const m2 = await npc.npcTalked(dawit, "npc-folk-0", { topic: "smalltalk" });
  check("talking again within the hour is the same meeting", m2.met === 1 && m2.topics.join() === "smalltalk,hello");
  check("unknown people are refused", await rejects(npc.npcMemory(dawit, "npc folk <0>")));
  const quest = { id: "q1", text: "Go to the library", place: "the library", x: -52, z: -44, r: 8, reward: 10 };
  const m3 = await npc.npcTalked(dawit, "npc-folk-0", { topic: "task", quest });
  check("a task is remembered", m3.quest?.place === "the library" && m3.quest.reward === 10);
  check("a task far outside town is refused", await rejects(npc.npcTalked(hana, "npc-folk-1", { topic: "task", quest: { ...quest, x: 5000 } })));
  const m4 = await npc.npcTalked(dawit, "npc-folk-0", { topic: "task", quest: { ...quest, id: "q2", reward: 999 } });
  check("one task at a time (the first stays)", m4.quest?.id === "q1");
  check("the task is not done away from its place", await rejects(npc.npcQuestDone(dawit, "npc-folk-0", { x: 0, z: 0 })));
  const before = (await fun.pointsOf(dawit.id)).balance;
  const done = await npc.npcQuestDone(dawit, "npc-folk-0", { x: -50, z: -45 });
  check("at the place the task is done and pays", done.coins === 10 && (await fun.pointsOf(dawit.id)).balance === before + 10 && done.memory.quest === null && done.memory.done === 1, done);
  check("a done task cannot be claimed twice", await rejects(npc.npcQuestDone(dawit, "npc-folk-0", { x: -50, z: -45 })));
  check("helping makes them like you more", done.memory.relation >= 12);
  const { npcReply } = await import("../../src/server/assistant-ai");
  const reply = await npcReply({ ...dawit, activeRole: "recording", sessionId: "s" } as never, { name: "Saba", role: "Shopper", personality: "friendly", context: "", history: [], text: "What is the meaning of life?" });
  check("without the AI switched on, town folk answer from their script (null)", reply === null);

  // ---------------------------------------------------------------- the wider town
  const r1 = await W.sync(dawit, { x: 340, y: 0, z: -255 });
  const r2 = await W.sync(hana, { x: 330, y: 0, z: -250 });
  const seen = r2.p.find((p) => p[0] === dawit.id);
  check("positions past the ring road are kept (the Grand Prix)", !!seen && seen[2] === 340 && seen[4] === -255, seen);
  void r1;

  // ---------------------------------------------------------------- Grand Prix online
  type RaceOut = { open?: { id: string; circuit: string; n: number }[]; id?: string; slot?: number; host?: boolean; startIn?: number; laps?: number; rows?: { id: string; lap: number; prog: number; done: number | null }[] };
  const opened = (await W.sync(dawit, { x: 214, y: 0, z: -127, race: { op: "open", circuit: "harbour", cars: "gt", laps: 3 } })).race as RaceOut;
  check("opening a race puts you on the grid as host", !!opened?.id && opened.slot === 0 && opened.host === true && opened.laps === 3 && (opened.startIn ?? 0) > 20_000, opened);
  const list = (await W.sync(hana, { x: 214, y: 0, z: -130 })).race as RaceOut;
  check("others see the open race", !!list?.open?.some((r) => r.id === opened.id && r.circuit === "harbour" && r.n === 1), list);
  const hanaRace = (await W.sync(hana, { x: 214, y: 0, z: -130, race: { op: "join", id: opened.id! } })).race as RaceOut;
  check("joining takes the next grid slot", hanaRace?.id === opened.id && hanaRace.slot === 1 && !!hanaRace.rows?.some((r) => r.id === dawit.id), hanaRace);
  check("a bad circuit opens nothing", !("id" in (((await W.sync(guest, { x: 0, y: 0, z: 0, race: { op: "open", circuit: "moon", cars: "gt", laps: 3 } })).race ?? {}) as object)));
  const go = (await W.sync(dawit, { x: 214, y: 0, z: -127, race: { op: "go" } })).race as RaceOut;
  check("the host can start it sooner", (go.startIn ?? 99_999) <= 6000, go);
  check("progress before the lights is not taken", ((await W.sync(hana, { x: 214, y: 0, z: -130, rp: { lap: 3, prog: 0.5, best: 40, done: null } })).race as RaceOut).rows !== undefined && (((await W.sync(dawit, { x: 214, y: 0, z: -127 })).race as RaceOut).rows ?? []).find((r) => r.id === hana.id)?.lap === 0);
  await W.sync(dawit, { x: 214, y: 0, z: -127, race: { op: "leave" } });
  await W.sync(hana, { x: 214, y: 0, z: -130, race: { op: "leave" } });
  check("an empty race closes", !(((await W.sync(hana, { x: 214, y: 0, z: -130 })).race as RaceOut | null)?.open ?? []).some((r) => r.id === opened.id));

  // ---------------------------------------------------------------- Seed Strike online
  await W.sync(dawit, { x: 700, y: 0, z: 0, act: "strike", strike: { op: "create", mode: "tdm", map: "warehouse" } });
  const lobby = await W.sync(hana, { x: 700, y: 0, z: 10, act: "strike-lobby" });
  check("an open public match is listed", !!lobby.strike && "open" in lobby.strike && (lobby.strike.open ?? []).some((m) => m.mode === "tdm" && m.n === 1), lobby.strike);
  const matchId = lobby.strike && "open" in lobby.strike ? (lobby.strike.open ?? [])[0]!.id : "";
  const joined = await W.sync(hana, { x: 700, y: 0, z: 10, act: "strike", strike: { op: "join", id: matchId } });
  const js = joined.strike as { me: { team: number; hp: number }; board: { id: string; team: number }[] };
  check("joining puts you on the other team", js.me.team === 1 && js.board.length === 2 && js.board.find((b) => b.id === dawit.id)?.team === 0, js);
  await W.sync(guest, { x: 702, y: 0, z: 8, act: "strike", strike: { op: "join", id: matchId } });
  const hit = async (from: typeof dawit, to: string, w = "rifle", hs = false, at = { x: 700, z: 0 }) => W.sync(from, { ...at, y: 0, act: "strike", hits: [{ to, w, hs }] });
  // The third player joined team 0 (balance): hits between teammates do nothing.
  let st = (await hit(guest, dawit.id)).strike as { board: { id: string; k: number }[] };
  const dawitHp = ((await W.sync(dawit, { x: 700, y: 0, z: 0, act: "strike" })).strike as { me: { hp: number } }).me.hp;
  check("teammates cannot hurt each other", dawitHp === 100, dawitHp);
  // Out of range: the rifle reaches 90 m (+6): from 200 m away nothing happens.
  await W.sync(hana, { x: 900, y: 0, z: 0, act: "strike" });
  await hit(dawit, hana.id, "rifle", false, { x: 700, z: 0 });
  let hanaMe = ((await W.sync(hana, { x: 900, y: 0, z: 0, act: "strike" })).strike as { me: { hp: number } }).me;
  check("a hit from beyond the weapon's range does not count", hanaMe.hp === 100, hanaMe);
  await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike" });
  check("an unknown weapon does not count", ((await hit(dawit, hana.id, "railgun")).strike as { board: { id: string }[] }) && ((await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike" })).strike as { me: { hp: number } }).me.hp === 100);
  // Real hits: armour takes half until it runs out; the head takes double.
  await hit(dawit, hana.id, "rifle", true);
  hanaMe = ((await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike" })).strike as { me: { hp: number; armor: number } }).me as never;
  check("a headshot hurts twice, armour takes half", (hanaMe as unknown as { hp: number; armor: number }).hp === 100 - (WEAPONS.rifle.dmg * 2 - WEAPONS.rifle.dmg) && (hanaMe as unknown as { armor: number }).armor === 50 - WEAPONS.rifle.dmg, hanaMe);
  for (let k = 0; k < 6; k++) st = (await hit(dawit, hana.id, "rifle", true)).strike as never;
  const after = (await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike" })).strike as { me: { alive: boolean; respawnIn: number }; feed: string[]; board: { id: string; k: number; d: number }[] };
  check("enough hits take them out; they respawn in three seconds", !after.me.alive && after.me.respawnIn <= 3 && after.me.respawnIn >= 2, after.me);
  check("the kill is counted and in the feed", after.board.find((b) => b.id === dawit.id)?.k === 1 && after.board.find((b) => b.id === hana.id)?.d === 1 && after.feed.some((f) => /headshot/.test(f)), after);
  // Rate: more hits in a second than the gun fires are dropped.
  await run("SELECT 1");
  const burst = Array.from({ length: 20 }, () => ({ to: guest.id, w: "pistol", hs: false }));
  await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike", strike: { op: "leave" } });
  await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike", strike: { op: "create", mode: "ffa", map: "desert" } });
  const ffa = (await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike" })).strike as { id: string };
  await W.sync(guest, { x: 706, y: 0, z: 6, act: "strike", strike: { op: "join", id: ffa.id } });
  await W.sync(hana, { x: 705, y: 0, z: 5, act: "strike", hits: burst });
  const g = ((await W.sync(guest, { x: 706, y: 0, z: 6, act: "strike" })).strike as { me: { hp: number; armor: number } }).me;
  const maxHits = Math.floor((WEAPONS.pistol.rpm / 60) * WEAPONS.pistol.pellets + 3);
  check("hits faster than the weapon fires are dropped", 150 - (g.hp + g.armor) <= WEAPONS.pistol.dmg * maxHits && 150 - (g.hp + g.armor) > 0, g);
  const priv = await W.sync(dawit, { x: 700, y: 0, z: 0, act: "strike", strike: { op: "create", mode: "duel", map: "urban", priv: true } });
  const pm = priv.strike as { id: string; code: string };
  check("a private match has a code for its host", /^\d{4}$/.test(pm.code));
  const wrong = await W.sync(guest, { x: 700, y: 0, z: 0, act: "strike", strike: { op: "join", id: pm.id, code: "0000" } });
  check("the wrong code is refused", !!wrong.err && /private/.test(wrong.err));
  const right = await W.sync(guest, { x: 700, y: 0, z: 0, act: "strike", strike: { op: "join", id: pm.id, code: pm.code } });
  check("the right code joins", (right.strike as { board: unknown[] }).board.length === 2);
  check("a duel holds two", !!(await W.sync(hana, { x: 700, y: 0, z: 0, act: "strike", strike: { op: "join", id: pm.id, code: pm.code } })).err);
  void st;

  // ---------------------------------------------------------------- looks, cars, rewards
  const look = cleanLook({ style: "realistic", base: "rb_f04" });
  check("realistic people are a style with their own models", look.style === "realistic" && look.base === "rb_f04" && PEOPLE_BASES.length === 8);
  check("a realistic look names its free avatar", lookItems(look).includes("avatar.rb_f04") && CATALOG.find((i) => i.key === "avatar.rb_f04")?.price === 0);
  check("an anime model is not taken for a realistic person", cleanLook({ style: "realistic", base: "kai" }).base === "rb_m01");
  check("every realistic person's file is in the app", PEOPLE_BASES.every((p) => fs.existsSync(`public${p.file}`)));
  for (const k of ["car.sedan", "car.suv", "car.pickup", "car.supercar", "car.gt911", "car.concept", "car.f2"]) check(`the dealer sells ${k}`, !!CATALOG.find((i) => i.key === k && i.kind === "vehicle"));
  check("the licensed car models are in the app", fs.existsSync("public/models/cars/porsche911.glb") && fs.existsSync("public/models/cars/concept.glb"));
  const manifest = JSON.parse(fs.readFileSync("public/models/manifest.json", "utf8")) as { assets: { license: string; source: string }[] };
  check("every asset in the library has a licence and a source", manifest.assets.length >= 80 && manifest.assets.every((a) => a.license && /^https?:\/\//.test(a.source)));
  check("no asset carries a non-commercial licence", manifest.assets.every((a) => !/NC|non-?commercial/i.test(a.license)));
  const archery = await shop.playReward(dawit, "archery-wind", 30);
  check("an activity's mode pays as the activity", archery.coins > 0);
  check("unknown activities pay nothing", await rejects(shop.playReward(dawit, "skydiving", 5)));
  await fun.saveScore(dawit, "world:gp", 74500);
  await fun.saveScore(dawit, "world:gp", 71200);
  check("Grand Prix laps count lowest first", (await fun.bestScores(dawit, "world:gp")).mine === 71200);
  check("the V E D U grid has studio sessions and presenters", ["sessions", "presenters"].every((k) => CRUD_AREAS.some((a) => a.key === k)));

  // ---------------------------------------------------------------- the Windows app downloads
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "desk-"));
  process.env.DESKTOP_DOWNLOADS_DIR = dir;
  const { GET } = await import("../../src/app/downloads/desktop/[...file]/route");
  const none = await GET(new Request("http://x/downloads/desktop/latest"), { params: Promise.resolve({ file: ["latest"] }) });
  check("no app published yet: latest says so", none.status === 404);
  fs.writeFileSync(path.join(dir, "SeedTown-1.0.0-x64.exe"), "MZ fake");
  fs.writeFileSync(path.join(dir, "latest.yml"), "version: 1.0.0\n");
  const latest = await GET(new Request("http://x/downloads/desktop/latest"), { params: Promise.resolve({ file: ["latest"] }) });
  check("latest sends the newest installer", latest.status === 302 && /SeedTown-1\.0\.0-x64\.exe$/.test(latest.headers.get("location") ?? ""));
  const yml = await GET(new Request("http://x/downloads/desktop/latest.yml"), { params: Promise.resolve({ file: ["latest.yml"] }) });
  check("the update feed is served fresh", yml.status === 200 && (await yml.text()).startsWith("version") && yml.headers.get("cache-control") === "no-cache");
  const evil = await GET(new Request("http://x/downloads/desktop/..%2F..%2Fpackage.json"), { params: Promise.resolve({ file: ["..", "..", "package.json"] }) });
  check("nothing outside the folder is served", evil.status === 404);

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main().catch(async (e) => {
  console.error(e);
  await closeDb();
  process.exit(1);
});
