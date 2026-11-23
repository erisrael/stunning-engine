import { all, get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { funConfig, funFor, levelOf, pointsOf } from "./fun";
import { getSettings } from "./settings";
import { notify } from "./notifications";
import { localParts } from "@/lib/attendance";
import { cleanLook, DEFAULT_LOOK, lookItems, type HomeLayout, type Look } from "@/lib/fun-catalog";

// Seed Town: the 3D world in Fun mode. People walk (or drive) around as characters they design, chat (nearby, the
// whole town, or their voice room), talk by voice (nearby: louder the closer; or in a room wherever they are), and
// visit homes, shops and the office. Every colleague has a desk in their department's workspace and a home: at the
// desk while working, at home when away. Above each head: a status and a bar with the day's progress. Who is absent
// shows only to the people Admin chose (HR by default). The live room is kept in memory (positions are tiny and
// short-lived; voices go straight between browsers, this server only introduces them); only avatars, homes and
// things people own are stored.

export type { Look };
export { DEFAULT_LOOK, cleanLook };

async function needWorld(user: AppUser) {
  const c = await funFor(user);
  if (!c || !c.world) throw new WorkflowError("FORBIDDEN", "Admin switched Seed Town off.");
  return c;
}

export async function myLook(user: AppUser): Promise<Look> {
  const r = await get<{ look: string }>("SELECT look FROM fun_avatars WHERE user_id = ?", user.id);
  return cleanLook(parseJson<Partial<Look>>(r?.look ?? "{}", {}));
}

// Paid clothes and accessories must be owned; free ones are everyone's.
async function checkOwned(user: AppUser, l: Look) {
  const { owns, itemOf } = await import("./fun-shop");
  for (const k of lookItems(l)) {
    if (!(await owns(user.id, k))) throw new WorkflowError("VALIDATION", `Buy ${(await itemOf(k))?.label ?? "that"} in the shop first.`);
  }
}

export async function saveLook(user: AppUser, look: Partial<Look>) {
  await needWorld(user);
  const l = cleanLook(look);
  await checkOwned(user, l);
  await run("INSERT INTO fun_avatars (user_id, look, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET look = excluded.look, updated_at = excluded.updated_at", user.id, JSON.stringify(l), nowIso());
  const p = room.get(user.id);
  if (p) (p.look = l), (p.lookV = Date.now());
  return l;
}

// Up to four saved looks to switch between.
export type Preset = { name: string; look: Look };
export async function presets(user: AppUser): Promise<Preset[]> {
  const r = await get<{ presets: string }>("SELECT presets FROM fun_avatars WHERE user_id = ?", user.id);
  return parseJson<Preset[]>(r?.presets ?? "[]", []).map((p) => ({ name: String(p.name).slice(0, 30), look: cleanLook(p.look) }));
}
export async function savePreset(user: AppUser, name: string, look: Partial<Look> | null) {
  await needWorld(user);
  const n = name.trim().slice(0, 30);
  if (!n) throw new WorkflowError("VALIDATION", "Name the look.");
  let list = (await presets(user)).filter((p) => p.name !== n);
  if (look) {
    const l = cleanLook(look);
    await checkOwned(user, l);
    if (list.length >= 4) throw new WorkflowError("VALIDATION", "Four saved looks at most; delete one first.");
    list = [...list, { name: n, look: l }];
  }
  await run("INSERT INTO fun_avatars (user_id, look, updated_at, presets) VALUES (?, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET presets = excluded.presets, updated_at = excluded.updated_at", user.id, JSON.stringify(await myLook(user)), nowIso(), JSON.stringify(list));
  return list;
}

// ------------------------------------------------------------------------------------------------- the roster

export type Status = "working" | "idle" | "break" | "online" | "left" | "leave" | "absent" | "away";
export type Resident = { id: string; name: string; dept: string; status: Status; progress: number; look: Look; me: boolean };

// Everyone with an account: where they are today, from sign-in activity, the day's check-ins and approved leave.
export async function roster(user: AppUser): Promise<{ residents: Resident[]; seesAbsence: boolean; departments: string[] }> {
  const c = await needWorld(user);
  const ws = (await getSettings()).workspace;
  const today = localParts(nowIso(), ws.timezone).date;
  const seesAbsence = c.worldAbsence === "everyone" || can(user, "users.manage") || can(user, "hr.access") || (c.worldAbsence === "leads" && (user.leads.length > 0 || can(user, "team.view")));
  const people = await all<{ id: string; name: string; last_active_at: string | null; emp: string | null; dept: string | null; look: string | null }>(
    `SELECT u.id, u.name, u.last_active_at, e.id AS emp, e.department AS dept, a.look
       FROM users u LEFT JOIN employees e ON e.user_id = u.id AND e.status <> 'left' LEFT JOIN fun_avatars a ON a.user_id = u.id
      WHERE u.active = 1 ORDER BY u.name LIMIT 300`,
  );
  const events = await all<{ employee_id: string; kind: string }>("SELECT employee_id, kind FROM att_events WHERE day = ? AND voided = 0 ORDER BY at", today).catch(() => []);
  const lastKind = new Map<string, string>();
  for (const e of events) lastKind.set(e.employee_id, e.kind);
  const leave = new Set((await all<{ employee_id: string }>("SELECT employee_id FROM leave_requests WHERE status = 'approved' AND start_date <= ? AND end_date >= ?", today, today).catch(() => [])).map((r) => r.employee_id));
  // Progress: the day's work points against the daily cap, or tasks finished today (out of five).
  const prog = new Map<string, number>();
  if (c.worldProgress === "tasks") {
    for (const r of await all<{ id: string; n: number }>("SELECT assignee_id AS id, COUNT(*) AS n FROM dept_tasks WHERE status_category = 'done' AND completed_at >= ? GROUP BY assignee_id", `${today}T00:00:00`).catch(() => [])) prog.set(r.id, Math.min(100, Number(r.n) * 20));
  } else {
    const cap = c.dailyCap || 100;
    for (const r of await all<{ id: string; n: number }>("SELECT user_id AS id, SUM(points) AS n FROM fun_points WHERE source = 'work' AND substr(created_at, 1, 10) = ? GROUP BY user_id", today).catch(() => [])) prog.set(r.id, Math.min(100, Math.round((Number(r.n) / cap) * 100)));
  }
  const now = Date.now();
  const residents = people.map((p) => {
    const seen = p.last_active_at ? (now - Date.parse(p.last_active_at)) / 60e3 : 1e9;
    const k = p.emp ? lastKind.get(p.emp) : undefined;
    let status: Status;
    if (p.emp && leave.has(p.emp)) status = "leave";
    else if (k && /break|lunch/.test(k) && !/end/.test(k)) status = "break";
    else if (k === "check_out" || k === "out") status = "left";
    else if (k) status = seen < 5 ? "working" : "idle";
    else if (seen < 5) status = "online";
    else status = p.emp ? "absent" : "away";
    if (status === "absent" && !seesAbsence) status = "away";
    if (status === "leave" && !seesAbsence) status = "away";
    return { id: p.id, name: p.name, dept: p.dept ?? "Team", status, progress: prog.get(p.id) ?? 0, look: cleanLook(parseJson<Partial<Look>>(p.look ?? "{}", {})), me: p.id === user.id };
  });
  const departments = [...new Set(residents.map((r) => r.dept))].slice(0, 12);
  return { residents, seesAbsence, departments };
}

// ------------------------------------------------------------------------------------------------- the live room

type Voice = { mode: "off" | "near" | "room"; room: string | null; muted: boolean };
type Player = {
  id: string;
  name: string;
  look: Look;
  lookV: number;
  x: number;
  y: number;
  z: number;
  ry: number;
  mv: number;
  veh: string;
  vp: string;
  act: string;
  at: number;
  say: string;
  sayAt: number;
  emote: string;
  emoteAt: number;
  lastSay: number;
  voice: Voice;
  // Which version of each person's look this player already has (looks are sent once, not every tick).
  seen: Map<string, number>;
  // Updates sent to this player (far people go every fifth).
  tick?: number;
};
type Msg = { id: number; from: string; name: string; ch: "near" | "town" | "room"; room: string | null; x: number; z: number; text: string; at: number };
type VoiceRoom = { id: string; name: string; owner: string; priv: boolean; code: string; cap: number; kicked: Set<string>; at: number };

const room = new Map<string, Player>();
const msgs: Msg[] = [];
let msgSeq = 0;
const mail = new Map<string, { from: string; d: unknown }[]>();
const rooms = new Map<string, VoiceRoom>();
const fireworks: { x: number; z: number; at: number; by: string }[] = [];
const STALE = 15_000;
const NEAR_CHAT = 30;
// Within this distance (metres) people are sent on every update; further away, about once a second.
const FAR = 150;
const NEAR_VOICE = 40;

export type SyncInput = {
  x?: number;
  y?: number;
  z?: number;
  ry?: number;
  mv?: number;
  veh?: string;
  vp?: string;
  act?: string;
  say?: string;
  ch?: "near" | "town" | "room";
  emote?: string;
  since?: number;
  voice?: Partial<Voice>;
  vr?: { op: "create"; name: string; priv?: boolean } | { op: "join"; id: string; code?: string } | { op: "leave" } | { op: "kick"; id: string };
  sig?: { to: string; d: unknown }[];
  fw?: boolean;
  // A new page: send every look again.
  fresh?: boolean;
  // Football: the ball as the last kicker sees it, a goal they saw, or a new match.
  ball?: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
  goal?: "teal" | "gold";
  ballReset?: boolean;
  // Seed Strike online: create, join (public or with the code) or leave a match; hits I landed (checked here).
  strike?: { op: "create"; mode: "duel" | "tdm" | "ffa"; map: string; priv?: boolean } | { op: "join"; id: string; code?: string } | { op: "quick"; mode: "duel" | "tdm" | "ffa" } | { op: "leave" };
  hits?: { to: string; w: string; hs: boolean }[];
  // Grand Prix online: open a race (circuit, cars, laps), join one, start it now (the host), leave; my race
  // progress (laps done, the part of the current lap, best lap and finish time in seconds).
  race?: { op: "open"; circuit: string; cars: string; laps: number } | { op: "join"; id: string } | { op: "go" } | { op: "leave" };
  rp?: { lap: number; prog: number; best: number | null; done: number | null };
};

// Grand Prix races between people (in memory): someone opens one, others join on the grid until the lights (25
// seconds after it opens, or sooner when the host starts it); laps and distance come in with each sync, so
// everyone sees the same order; a race closes when everyone has left or after half an hour.
type RacePlayer = { lap: number; prog: number; best: number | null; done: number | null; slot: number };
type Race = { id: string; circuit: string; cars: string; laps: number; host: string; at: number; startAt: number; players: Map<string, RacePlayer> };
const races = new Map<string, Race>();
const RACE_MAX = 12;
const raceOf = (id: string) => [...races.values()].find((r) => r.players.has(id)) ?? null;

// Seed Strike matches between people (in memory): the server is the referee. A hit counts only between two
// people alive in the same match, on different teams in team play, within the weapon's range of where the server
// last saw them, and no faster than the weapon fires; it takes the weapon's damage (twice on the head). Kills,
// deaths, respawns (three seconds), the kill feed and the winner live here.
type MatchPlayer = { team: number; hp: number; armor: number; alive: boolean; respawnAt: number; k: number; d: number; hits: number[] };
type Match = { id: string; mode: "duel" | "tdm" | "ffa"; map: string; code: string; host: string; at: number; endsAt: number; players: Map<string, MatchPlayer>; feed: { at: number; text: string }[]; over: string | null };
const matches = new Map<string, Match>();
const LIMIT = { duel: 5, tdm: 30, ffa: 20 } as const;
const MAX = { duel: 2, tdm: 10, ffa: 8 } as const;
const matchOf = (id: string) => [...matches.values()].find((m) => m.players.has(id)) ?? null;

// The stadium's shared ball and score (in memory, like positions).
const pitch = { ball: null as SyncInput["ball"] | null, seq: 0, by: "", score: { teal: 0, gold: 0 }, goalAt: 0 };
const PITCH_X = [140, 235] as const;

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// Two players may exchange voice: both talking, and near each other (nearby mode) or in the same room.
function voiceLink(a: Player, b: Player) {
  if (a.voice.mode === "off" || b.voice.mode === "off") return false;
  if (a.voice.mode === "room" || b.voice.mode === "room") return a.voice.mode === "room" && b.voice.mode === "room" && !!a.voice.room && a.voice.room === b.voice.room;
  return dist(a, b) <= NEAR_VOICE + 10;
}

// One step of the conversation with the world: my position (and a chat line, a wave, voice signals), and everyone
// else in it. Kept small: a few rounded numbers per person; looks only when they change.
export async function sync(user: AppUser, input: SyncInput) {
  const c = await needWorld(user);
  const now = Date.now();
  let p = room.get(user.id);
  if (!p) {
    p = { id: user.id, name: user.name, look: await myLook(user), lookV: now, x: 0, y: 0, z: 8, ry: 0, mv: 0, veh: "", vp: "", act: "", at: now, say: "", sayAt: 0, emote: "", emoteAt: 0, lastSay: 0, voice: { mode: "off", room: null, muted: false }, seen: new Map() };
    room.set(user.id, p);
  }
  const num = (v: unknown, d: number, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
  // The town reaches past the ring road (the Grand Prix, the archery field) and the Strike maps lie further out.
  p.x = num(input.x, p.x, -1100, 1100);
  p.y = num(input.y, p.y, -2, 140);
  p.z = num(input.z, p.z, -1100, 1100);
  p.ry = num(input.ry, p.ry, -10, 10);
  p.mv = input.mv ? Math.min(2, Math.round(Number(input.mv))) : 0;
  p.veh = typeof input.veh === "string" && /^[a-z0-9.-]{0,40}$/.test(input.veh) ? input.veh : "";
  p.vp = typeof input.vp === "string" && /^#[0-9a-f]{6}$/i.test(input.vp) ? input.vp : "";
  p.act = typeof input.act === "string" ? input.act.replace(/[^a-z0-9:-]/gi, "").slice(0, 24) : "";
  p.at = now;
  if (input.fresh) p.seen.clear();
  let err: string | null = null;

  // Chat: nearby (and a bubble), the whole town, or the voice room.
  if (input.say && c.worldChat) {
    if (now - p.lastSay < 1500) throw new WorkflowError("VALIDATION", "A little slower.");
    const text = input.say.replace(/\s+/g, " ").trim().slice(0, 160);
    const ch = input.ch === "town" ? "town" : input.ch === "room" && p.voice.room ? "room" : "near";
    if (text) {
      if (ch !== "room") (p.say = text.slice(0, 120)), (p.sayAt = now);
      p.lastSay = now;
      msgs.push({ id: ++msgSeq, from: p.id, name: p.name, ch, room: ch === "room" ? p.voice.room : null, x: p.x, z: p.z, text, at: now });
      while (msgs.length > 300) msgs.shift();
    }
  }
  if (input.emote && ["wave", "dance", "jump", "cheer", "laugh", "cry", "bow", "sit", "clap", "kick"].includes(input.emote)) (p.emote = input.emote), (p.emoteAt = now);
  if (input.fw) {
    const { lightFirework } = await import("./fun-shop");
    try {
      await lightFirework(user);
      fireworks.push({ x: p.x, z: p.z, at: now, by: p.name });
      while (fireworks.length > 30) fireworks.shift();
    } catch (e) {
      err = (e as Error).message;
    }
  }

  // Football: the last kicker shares the ball; goals count once (not twice in three seconds); a new match resets.
  const fin = (v: unknown, lim: number) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= lim;
  if (input.ball && ["x", "y", "z"].every((k) => fin((input.ball as Record<string, number>)[k], 260)) && ["vx", "vy", "vz"].every((k) => fin((input.ball as Record<string, number>)[k], 60))) {
    pitch.ball = { x: input.ball.x, y: input.ball.y, z: input.ball.z, vx: input.ball.vx, vy: input.ball.vy, vz: input.ball.vz };
    pitch.seq++;
    pitch.by = p.id;
  }
  if ((input.goal === "teal" || input.goal === "gold") && pitch.by === p.id && now - pitch.goalAt > 3000) {
    pitch.score[input.goal]++;
    pitch.goalAt = now;
    pitch.ball = { x: 185, y: 1, z: 60, vx: 0, vy: 0, vz: 0 };
    pitch.seq++;
    pitch.by = "";
  }
  if (input.ballReset) {
    pitch.score = { teal: 0, gold: 0 };
    pitch.ball = { x: 185, y: 1, z: 60, vx: 0, vy: 0, vz: 0 };
    pitch.seq++;
    pitch.by = "";
  }

  // Grand Prix online.
  if (input.race) {
    const op = input.race;
    const cur = raceOf(p.id);
    if (op.op === "leave" || op.op === "open" || op.op === "join") cur?.players.delete(p.id);
    if (op.op === "open" && ["park", "harbour", "highland"].includes(String(op.circuit)) && ["f2", "gt"].includes(String(op.cars))) {
      const id = `r${now.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
      const r: Race = { id, circuit: op.circuit, cars: op.cars, laps: Math.max(2, Math.min(10, Math.round(Number(op.laps) || 5))), host: p.id, at: now, startAt: now + 25_000, players: new Map() };
      r.players.set(p.id, { lap: 0, prog: 0, best: null, done: null, slot: 0 });
      races.set(id, r);
    } else if (op.op === "join") {
      const r = races.get(String(op.id));
      if (!r || now > r.startAt - 3000) err = "That race has started.";
      else if (r.players.size >= RACE_MAX) err = "That race is full.";
      else r.players.set(p.id, { lap: 0, prog: 0, best: null, done: null, slot: Math.max(-1, ...[...r.players.values()].map((x) => x.slot)) + 1 });
    } else if (op.op === "go" && cur && cur.host === p.id && now < cur.startAt - 6000) cur.startAt = now + 6000;
  }
  {
    const r = raceOf(p.id);
    const rp = input.rp;
    if (r && rp && now > r.startAt) {
      const me = r.players.get(p.id)!;
      me.lap = Math.max(0, Math.min(r.laps + 1, Math.round(num(rp.lap, me.lap, 0, 20))));
      me.prog = num(rp.prog, me.prog, 0, 1);
      me.best = typeof rp.best === "number" && rp.best > 5 ? rp.best : me.best;
      if (me.done === null && typeof rp.done === "number" && rp.done > 10 && me.lap > r.laps) me.done = rp.done;
    }
  }
  for (const [id, r] of races) {
    for (const pid of r.players.keys()) if (!room.has(pid)) r.players.delete(pid);
    if (!r.players.size || now - r.at > 30 * 60_000) races.delete(id);
  }

  // Seed Strike: matches and hits.
  if (input.strike) {
    const op = input.strike;
    const cur = matchOf(p.id);
    if (op.op === "leave" || op.op === "create" || op.op === "join" || op.op === "quick") cur?.players.delete(p.id);
    const joinTo = (m: Match) => {
      if (m.players.size >= MAX[m.mode]) return (err = "That match is full."), false;
      const teams = [0, 1].map((t) => [...m.players.values()].filter((x) => x.team === t).length);
      m.players.set(p!.id, { team: m.mode === "tdm" ? (teams[0]! <= teams[1]! ? 0 : 1) : m.players.size, hp: 100, armor: 50, alive: true, respawnAt: 0, k: 0, d: 0, hits: [] });
      m.feed.push({ at: now, text: `${p!.name} joined` });
      return true;
    };
    if (op.op === "create" && ["duel", "tdm", "ffa"].includes(op.mode) && /^[a-z]{3,12}$/.test(String(op.map))) {
      const id = `sm_${Math.random().toString(36).slice(2, 9)}`;
      const m: Match = { id, mode: op.mode, map: op.map, code: op.priv ? String(Math.floor(1000 + Math.random() * 9000)) : "", host: p.id, at: now, endsAt: now + (op.mode === "tdm" ? 8 : 10) * 60_000, players: new Map(), feed: [], over: null };
      matches.set(id, m);
      joinTo(m);
    } else if (op.op === "join") {
      const m = matches.get(String(op.id));
      if (!m || m.over) err = "That match has ended.";
      else if (m.code && String(op.code ?? "") !== m.code && m.host !== p.id) err = "That match is private: ask for its code.";
      else joinTo(m);
    } else if (op.op === "quick" && ["duel", "tdm", "ffa"].includes(op.mode)) {
      // Matchmaking: the fullest open public match of the mode, or a new one.
      const open = [...matches.values()].filter((m) => !m.code && !m.over && m.mode === op.mode && m.players.size < MAX[m.mode]).sort((a, b) => b.players.size - a.players.size)[0];
      if (open) joinTo(open);
      else {
        const id = `sm_${Math.random().toString(36).slice(2, 9)}`;
        const m: Match = { id, mode: op.mode, map: ["facility", "warehouse", "urban", "desert"][Math.floor(Math.random() * 4)]!, code: "", host: p.id, at: now, endsAt: now + 8 * 60_000, players: new Map(), feed: [], over: null };
        matches.set(id, m);
        joinTo(m);
      }
    }
  }
  const mm = matchOf(p.id);
  if (mm && !mm.over) {
    const me = mm.players.get(p.id)!;
    if (!me.alive && now > me.respawnAt) (me.alive = true), (me.hp = 100), (me.armor = 50);
    const { WEAPONS } = await import("@/lib/strike-weapons");
    for (const h of (input.hits ?? []).slice(0, 20)) {
      const w = WEAPONS[h.w as keyof typeof WEAPONS];
      const vp = room.get(String(h.to));
      const v = mm.players.get(String(h.to));
      if (!w || !vp || !v || !me.alive || !v.alive || h.to === p.id) continue;
      if (mm.mode === "tdm" && v.team === me.team) continue;
      if (Math.hypot(vp.x - p.x, vp.z - p.z) > w.range + 6) continue;
      me.hits = me.hits.filter((t) => now - t < 1000);
      if (me.hits.length > (w.rpm / 60) * w.pellets + 2) continue;
      me.hits.push(now);
      const dmg = w.dmg * (h.hs ? (h.w === "shotgun" ? 1.5 : 2) : 1);
      const toArmor = Math.min(v.armor, dmg * 0.5);
      v.armor -= toArmor;
      v.hp -= dmg - toArmor;
      if (v.hp <= 0) {
        v.alive = false;
        v.d++;
        v.respawnAt = now + 3000;
        me.k++;
        mm.feed.push({ at: now, text: `${p.name} ${h.hs ? "headshot" : "took out"} ${vp.name} (${w.label})` });
        if (mm.mode === "duel") for (const x of mm.players.values()) (x.hp = 100), (x.armor = 50);
      }
    }
    const teamK = [0, 1].map((t) => [...mm.players.values()].filter((x) => x.team === t).reduce((a, x) => a + x.k, 0));
    const top = [...mm.players.entries()].sort((a, b) => b[1].k - a[1].k)[0];
    if (mm.mode === "tdm" && Math.max(...teamK) >= LIMIT.tdm) mm.over = teamK[0]! >= LIMIT.tdm ? "Blue team won" : "Red team won";
    else if (mm.mode !== "tdm" && top && top[1].k >= LIMIT[mm.mode]) mm.over = `${room.get(top[0])?.name ?? "Someone"} won`;
    else if (now > mm.endsAt) mm.over = "Time";
    while (mm.feed.length > 30) mm.feed.shift();
  }
  for (const [id, m] of matches) if ((m.players.size === 0 && now - m.at > 30_000) || now - m.at > 30 * 60_000) matches.delete(id);
  for (const m of matches.values()) for (const id of m.players.keys()) if (!room.has(id)) m.players.delete(id);

  // Voice: the mode, mute, and rooms (create, join with a code when private, leave; the owner removes people).
  if (input.voice && c.worldVoice) {
    if (input.voice.mode && ["off", "near", "room"].includes(input.voice.mode)) p.voice.mode = input.voice.mode;
    if (typeof input.voice.muted === "boolean") p.voice.muted = input.voice.muted;
    if (p.voice.mode !== "room") p.voice.room = null;
  }
  if (!c.worldVoice) p.voice = { mode: "off", room: null, muted: true };
  if (input.vr && c.worldVoice) {
    const op = input.vr;
    if (op.op === "create") {
      const name = String(op.name ?? "").trim().slice(0, 30) || `${p.name.split(" ")[0]}'s room`;
      const id = `vr_${Math.random().toString(36).slice(2, 9)}`;
      const code = op.priv ? String(Math.floor(1000 + Math.random() * 9000)) : "";
      rooms.set(id, { id, name, owner: p.id, priv: !!op.priv, code, cap: c.voiceRoomCap, kicked: new Set(), at: now });
      p.voice = { ...p.voice, mode: "room", room: id };
    } else if (op.op === "join") {
      const r = rooms.get(op.id);
      const members = [...room.values()].filter((q) => q.voice.room === op.id && now - q.at < STALE).length;
      if (!r) err = "That room has closed.";
      else if (r.kicked.has(p.id)) err = "The room's owner removed you.";
      else if (r.priv && r.owner !== p.id && String(op.code ?? "") !== r.code) err = "That room is private: ask its owner for the code.";
      else if (members >= r.cap) err = `The room is full (${r.cap}).`;
      else p.voice = { ...p.voice, mode: "room", room: r.id };
    } else if (op.op === "leave") p.voice = { ...p.voice, mode: "near", room: null };
    else if (op.op === "kick") {
      const r = p.voice.room ? rooms.get(p.voice.room) : null;
      const q = room.get(op.id);
      if (!r || r.owner !== p.id) err = "Only the room's owner removes people.";
      else if (q && q.voice.room === r.id) (r.kicked.add(q.id), (q.voice = { ...q.voice, mode: "near", room: null }));
    }
  }

  // Voice signals (offers, answers, network candidates) to people this player may talk with.
  for (const s of (input.sig ?? []).slice(0, 30)) {
    const to = room.get(String(s.to));
    if (!to || to.id === p.id) continue;
    const size = JSON.stringify(s.d ?? null).length;
    if (size > 12000) continue;
    const isBye = (s.d as { t?: string } | null)?.t === "bye";
    if (!isBye && !voiceLink(p, to)) continue;
    const box = mail.get(to.id) ?? [];
    box.push({ from: p.id, d: s.d });
    mail.set(to.id, box.slice(-80));
  }

  // Housekeeping: people gone quiet leave; empty rooms close after a minute.
  for (const [id, q] of room) if (now - q.at > STALE) (room.delete(id), mail.delete(id));
  for (const [id, r] of rooms) if (now - r.at > 60_000 && ![...room.values()].some((q) => q.voice.room === id)) rooms.delete(id);
  for (const r of rooms.values()) if ([...room.values()].some((q) => q.voice.room === r.id)) r.at = now;

  const rd = (v: number) => Math.round(v * 100) / 100;
  const since = Number(input.since) || 0;
  const myMail = mail.get(p.id) ?? [];
  mail.delete(p.id);
  // Near people every update; far ones every fifth (still in town: their ids are in k, so they are kept, not dropped).
  p.tick = (p.tick ?? 0) + 1;
  const all = [...room.values()].filter((q) => q.id !== user.id);
  const farTurn = p.tick % 5 === 0 || !!input.fresh;
  const others = farTurn ? all : all.filter((q) => Math.hypot(q.x - p!.x, q.z - p!.z) <= FAR || q.voice.room === p!.voice.room && !!q.voice.room);
  const kept = farTurn ? [] : all.filter((q) => !others.includes(q)).map((q) => q.id);
  const looks: Record<string, Look> = {};
  for (const q of others) if (p.seen.get(q.id) !== q.lookV) (looks[q.id] = q.look), p.seen.set(q.id, q.lookV);
  return {
    t: now,
    me: { voice: p.voice },
    k: kept,
    p: others.map((q) => [q.id, q.name, rd(q.x), rd(q.y), rd(q.z), rd(q.ry), q.mv, now - q.sayAt < 7000 ? q.say : "", now - q.emoteAt < 3000 ? q.emote : "", q.veh, q.vp, q.act, q.voice.mode === "off" ? "" : q.voice.mode === "near" ? "n" : `r:${q.voice.room}`, q.voice.muted ? 1 : 0] as const),
    looks,
    m: since < 0 ? [] : msgs.filter((m) => m.id > since && (m.from === p.id || m.ch === "town" || (m.ch === "near" && dist(m, p) <= NEAR_CHAT) || (m.ch === "room" && !!m.room && m.room === p.voice.room))).slice(-40).map((m) => ({ id: m.id, from: m.from, name: m.name, ch: m.ch, text: m.text, at: m.at })),
    last: msgSeq,
    s: myMail,
    rooms: c.worldVoice ? [...rooms.values()].map((r) => ({ id: r.id, name: r.name, owner: r.owner, priv: r.priv, code: r.owner === p.id ? r.code : "", cap: r.cap, n: [...room.values()].filter((q) => q.voice.room === r.id).length })) : [],
    fw: fireworks.filter((f) => now - f.at < 6000),
    pitch: p.x > PITCH_X[0] && p.x < PITCH_X[1] ? { ball: pitch.ball, seq: pitch.seq, by: pitch.by, score: pitch.score } : null,
    strike: (() => {
      const m = matchOf(p.id);
      if (!m) return p.act.startsWith("strike") ? { open: [...matches.values()].filter((x) => !x.code && !x.over).map((x) => ({ id: x.id, mode: x.mode, map: x.map, n: x.players.size, max: MAX[x.mode] })) } : null;
      const me = m.players.get(p.id)!;
      return {
        id: m.id,
        mode: m.mode,
        map: m.map,
        code: m.host === p.id ? m.code : "",
        me: { team: me.team, hp: Math.max(0, Math.round(me.hp)), armor: Math.round(me.armor), alive: me.alive, respawnIn: me.alive ? 0 : Math.max(0, Math.ceil((me.respawnAt - now) / 1000)) },
        board: [...m.players.entries()].map(([id, x]) => ({ id, name: room.get(id)?.name ?? "?", team: x.team, k: x.k, d: x.d, alive: x.alive })),
        feed: m.feed.slice(-5).map((f) => f.text).reverse(),
        over: m.over,
        endsIn: Math.max(0, Math.ceil((m.endsAt - now) / 1000)),
      };
    })(),
    race: (() => {
      const r = raceOf(p.id);
      if (!r) return races.size ? { open: [...races.values()].filter((x) => now < x.startAt - 3000).map((x) => ({ id: x.id, circuit: x.circuit, cars: x.cars, laps: x.laps, n: x.players.size, startIn: x.startAt - now, host: room.get(x.host)?.name ?? "" })) } : null;
      return {
        id: r.id,
        circuit: r.circuit,
        cars: r.cars,
        laps: r.laps,
        host: r.host === p.id,
        startIn: r.startAt - now,
        slot: r.players.get(p.id)!.slot,
        rows: [...r.players.entries()].filter(([id]) => id !== p.id).map(([id, x]) => ({ id, name: room.get(id)?.name ?? "?", lap: x.lap, prog: x.prog, best: x.best, done: x.done })),
      };
    })(),
    err,
  };
}

// Report someone in town: Admin hears about it, with what they said lately.
export async function reportPlayer(user: AppUser, targetId: string, reason: string) {
  await needWorld(user);
  const t = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ?", targetId);
  if (!t || t.id === user.id) throw new WorkflowError("VALIDATION", "Choose someone to report.");
  const said = msgs.filter((m) => m.from === t.id).slice(-5).map((m) => `"${m.text}"`).join(" ");
  const { usersWithRole } = await import("./notifications");
  const admins = await usersWithRole("admin" as never).catch(() => [] as string[]);
  await notify(admins, { type: "security", title: `Seed Town report: ${t.name}`, body: `${user.name}: ${reason.trim().slice(0, 300) || "No reason given."}${said ? ` Lately said: ${said.slice(0, 500)}` : ""}`, link: "/admin?tab=fun" }, nowIso(), user.id);
  return true;
}

// Where browsers find each other for voice: Google's free public STUN, plus Admin's relay (TURN) when set; with a
// shared secret each person gets credentials that expire in a day (the coturn REST scheme).
export async function iceServers(user: AppUser) {
  const c = await funConfig();
  const list: { urls: string[]; username?: string; credential?: string }[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  const urls = c.turnUrls.split(",").map((u) => u.trim()).filter(Boolean);
  if (urls.length && c.turnSecret) {
    const { createHmac } = await import("node:crypto");
    const username = `${Math.floor(Date.now() / 1000) + 24 * 3600}:${user.id}`;
    list.push({ urls, username, credential: createHmac("sha1", c.turnSecret).update(username).digest("base64") });
  } else if (urls.length) list.push({ urls, username: c.turnUsername, credential: c.turnCredential });
  return list;
}

export async function worldHome(user: AppUser) {
  const c = await needWorld(user);
  const r = await roster(user);
  const { homesOf, rideOf, catalog, wallet } = await import("./fun-shop");
  const homes = await homesOf(r.residents.slice(0, 60).map((x) => x.id));
  const pts = await pointsOf(user.id);
  const world = await worldLayout();
  return {
    look: await myLook(user),
    presets: await presets(user),
    chat: c.worldChat,
    voice: c.worldVoice,
    shop: c.shop,
    playCoins: c.playCoins,
    name: c.worldName || "Seed Town",
    coins: pts.balance,
    level: levelOf(pts.earned),
    ride: await rideOf(user.id),
    homes: Object.fromEntries(homes) as Record<string, HomeLayout>,
    items: c.shop ? await catalog() : [],
    wallet: c.shop ? await wallet(user) : null,
    layout: world,
    iceServers: c.worldVoice ? await iceServers(user) : [],
    ...r,
  };
}

// The guest arcade's Seed Town: the town, its public layout and the catalog (everything free), one resident (the
// guest) and nothing else: no staff, departments, homes, chat or voice. No sign-in; Admin can switch it off.
export async function guestHome() {
  const c = await funConfig();
  if (!c.enabled || !c.world || !c.guestArcade) return null;
  const { catalog } = await import("./fun-shop");
  const guest: Resident = { id: "guest", name: "Guest", dept: "", status: "online", progress: 0, look: cleanLook({}), me: true };
  return {
    look: DEFAULT_LOOK,
    presets: [] as { name: string; look: Look }[],
    chat: false,
    voice: false,
    shop: true,
    playCoins: false,
    name: c.worldName || "Seed Town",
    coins: 0,
    level: 1,
    ride: null,
    homes: {} as Record<string, HomeLayout>,
    items: (await catalog()).map((i) => ({ ...i, price: 0, level: undefined })),
    wallet: null,
    layout: await worldLayout(),
    iceServers: [] as RTCIceServer[],
    residents: [guest],
    seesAbsence: false,
    departments: [] as string[],
  };
}
// The arcade's game list (the same switches as Fun mode's games) when it is open.
export async function guestArcade() {
  const c = await funConfig();
  if (!c.enabled || !c.guestArcade) return null;
  return { world: c.world, games: c.games };
}

// For the Admin page: how many are in the world now.
export function worldCount() {
  const now = Date.now();
  return [...room.values()].filter((p) => now - p.at < STALE).length;
}

export async function worldConfigFor() {
  return funConfig();
}

// ------------------------------------------------------------------------------------------------- Admin's additions

// Things Admin places in town without code (cfg.funWorld): props from the library at a spot, turned and sized, and
// characters to talk to with their own lines. The town builds them on top of its own buildings.
export const PROP_KINDS = ["tree", "bench", "lamp", "fountain", "statue", "kiosk", "billboard", "flowers", "rock", "tent", "stage", "arch", "car", "npc", "spawn", "chest", "model"] as const;
// model: an uploaded .glb (its id); solid: people and vehicles cannot pass through it.
export type Prop = { id: string; kind: (typeof PROP_KINDS)[number]; x: number; z: number; r: number; s: number; color: string; text: string; name: string; lines: string[]; model?: string; solid?: boolean; y?: number };
export type WorldLayout = { props: Prop[]; notice: string };

export async function worldLayout(): Promise<WorldLayout> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.funWorld'");
  const v = parseJson<Partial<WorldLayout>>(row?.value ?? "{}", {});
  return { props: v.props ?? [], notice: v.notice ?? "" };
}

export async function saveWorldLayout(user: AppUser, input: Partial<WorldLayout>) {
  if (!(can(user, "users.manage") || can(user, "settings.manage"))) throw new WorkflowError("FORBIDDEN", "Only Admin edits the town.");
  const props: Prop[] = (input.props ?? []).slice(0, 300).map((p, i) => {
    if (!PROP_KINDS.includes(p.kind)) throw new WorkflowError("VALIDATION", "Unknown thing to place.");
    const n = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v * 10) / 10)) : d);
    return {
      id: /^[a-z0-9_-]{1,24}$/i.test(String(p.id)) ? String(p.id) : `p${i}${Date.now().toString(36)}`,
      kind: p.kind,
      x: n(p.x, -190, 190, 0),
      z: n(p.z, -190, 190, 0),
      r: n(p.r, -360, 360, 0),
      s: n(p.s, 0.3, 5, 1),
      color: /^#[0-9a-f]{6}$/i.test(String(p.color)) ? String(p.color) : "#64748b",
      text: String(p.text ?? "").slice(0, 60),
      name: String(p.name ?? "").slice(0, 30),
      lines: (Array.isArray(p.lines) ? p.lines : []).map((l) => String(l).slice(0, 200)).filter(Boolean).slice(0, 6),
      model: p.kind === "model" && /^fm_[a-z0-9_-]{4,40}$/i.test(String(p.model)) ? String(p.model) : undefined,
      solid: p.solid !== false,
      y: n(p.y, 0, 40, 0),
    };
  });
  const next: WorldLayout = { props, notice: String(input.notice ?? "").slice(0, 200) };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.funWorld', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  return next;
}
