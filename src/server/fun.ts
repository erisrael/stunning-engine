import { all, get, nowIso, parseJson, run, tx, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// Fun mode: a side window (like the assistant) with music, games, a pet, points and morale boosters. Work earns
// points (rules on audited actions, a daily cap); points feed and grow the pet. Games keep best scores only and
// never earn points, so work stays the way to earn. Admin turns every part on or off (cfg.fun).
// Music comes from Audius (free, open, no key) and lyrics from LRCLIB (free, open); both through this server.

export const FUN_GAMES = [
  { key: "world", label: "Seed Town 3D", note: "Walk the office world: see who is working, chat and play together" },
  { key: "chess", label: "Chess", note: "Play the computer at five levels" },
  { key: "chess-learn", label: "Learn chess", note: "Lessons and daily puzzles from Lichess" },
  { key: "sudoku", label: "Sudoku", note: "Four levels, with notes and checking" },
  { key: "2048", label: "2048", note: "Slide and join the tiles" },
  { key: "snake", label: "Snake", note: "Eat, grow, do not bite yourself" },
  { key: "memory", label: "Memory", note: "Find the pairs" },
  { key: "minesweeper", label: "Minesweeper", note: "Clear the field" },
  { key: "tictactoe", label: "Tic-tac-toe", note: "Against the computer" },
  { key: "wordguess", label: "Word guess", note: "Guess the five-letter word in six tries" },
  { key: "typing", label: "Typing race", note: "How fast do you type?" },
  { key: "reaction", label: "Reaction time", note: "Click when it turns green" },
] as const;
export type FunGame = (typeof FUN_GAMES)[number]["key"];

export type PointRule = { key: string; label: string; action: string; summary?: string; points: number; on: boolean };
export const DEFAULT_POINT_RULES: PointRule[] = [
  { key: "stage", label: "Submit your stage of a part", action: "submit", points: 10, on: true },
  { key: "published", label: "A part is published", action: "item.published", points: 15, on: true },
  { key: "handover", label: "Receive a handover", action: "handover.accepted", points: 5, on: true },
  { key: "handoff", label: "Hand off work that is accepted", action: "handoff.accepted", points: 5, on: true },
  { key: "report", label: "Send your report", action: "report.submitted", points: 8, on: true },
  { key: "task", label: "Move a department task to done", action: "*.task", summary: "\\bto (done|closed|complete|completed|finished)\\b", points: 8, on: true },
  { key: "solved", label: "Solve a customer's question", action: "support.solved", points: 6, on: true },
  { key: "lead", label: "A lead you sent is approved", action: "lead.approved", points: 10, on: true },
  { key: "kudos", label: "Give a colleague an award", action: "recognition.title", summary: "\\bgave\\b", points: 3, on: true },
  { key: "focus", label: "Finish a focus session", action: "focus.session", points: 5, on: true },
];

export type FunConfig = {
  enabled: boolean;
  music: boolean;
  lyrics: boolean;
  playlists: boolean;
  games: string[];
  pet: boolean;
  points: boolean;
  leaderboard: boolean;
  moods: boolean;
  dailyCap: number;
  rules: PointRule[];
  // Roles that see Fun mode (empty: everyone).
  roles: string[];
  // Games only between these times (HH:mm, empty: any time), e.g. lunch and after work.
  gamesFrom: string;
  gamesTo: string;
  // The pet's food costs this many points.
  feedCost: number;
  // Focus mode: a timer with music for the person's persona; YouTube playlists (sign-in needs Admin's Google
  // OAuth client ID with the YouTube Data API on; without it people paste a playlist link).
  focus: boolean;
  youtube: boolean;
  youtubeClientId: string;
  // Seed Town (the 3D world): on, chat bubbles, who sees absences ("hr": HR and Admin; "leads": also team leads;
  // "everyone"), what fills the bar above each head ("points": the day's work points; "tasks": tasks finished today),
  // and the world's name.
  world: boolean;
  worldChat: boolean;
  worldAbsence: "hr" | "leads" | "everyone";
  worldProgress: "points" | "tasks";
  worldName: string;
  // Seed Town's shop, homes and vehicles (bought with points: work is the main way to earn), voice chat (nearby or
  // in rooms; voices go straight between browsers, the server only introduces them), the biggest voice room, and
  // coins a day for playing (town activities and the mini-games; 0: only work earns).
  shop: boolean;
  worldVoice: boolean;
  voiceRoomCap: number;
  playCoins: number;
  // Optional YouTube Data API key: search YouTube inside the app (100 searches a day on the free quota; results
  // are kept for a day).
  youtubeApiKey: string;
  // Voice relay (TURN) for networks that block direct calls: comma-separated turn: or turns: addresses, with either
  // a fixed username and password, or coturn's shared secret (time-limited credentials per person).
  turnUrls: string;
  turnUsername: string;
  turnCredential: string;
  turnSecret: string;
};
export const DEFAULT_FUN: FunConfig = {
  enabled: true,
  music: true,
  lyrics: true,
  playlists: true,
  games: FUN_GAMES.map((g) => g.key),
  pet: true,
  points: true,
  leaderboard: true,
  moods: true,
  dailyCap: 150,
  rules: DEFAULT_POINT_RULES,
  roles: [],
  gamesFrom: "",
  gamesTo: "",
  feedCost: 10,
  focus: true,
  youtube: true,
  youtubeClientId: "",
  world: true,
  worldChat: true,
  worldAbsence: "hr",
  worldProgress: "points",
  worldName: "Seed Town",
  shop: true,
  worldVoice: true,
  voiceRoomCap: 8,
  playCoins: 40,
  youtubeApiKey: "",
  turnUrls: "",
  turnUsername: "",
  turnCredential: "",
  turnSecret: "",
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// Read on every audited action, so kept for half a minute (cleared when Admin saves).
let cfgCache: { at: number; cfg: FunConfig } | null = null;
export async function funConfig(): Promise<FunConfig> {
  if (cfgCache && Date.now() - cfgCache.at < 30_000) return cfgCache.cfg;
  const cfg = await readFunConfig();
  cfgCache = { at: Date.now(), cfg };
  return cfg;
}
async function readFunConfig(): Promise<FunConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.fun'");
  const saved = parseJson<Partial<FunConfig>>(row?.value ?? "{}", {});
  // Rules Admin never saw (added later) come in with their defaults.
  const rules = [...(saved.rules ?? []), ...DEFAULT_POINT_RULES.filter((d) => !(saved.rules ?? []).some((r) => r.key === d.key))];
  return { ...DEFAULT_FUN, ...saved, rules };
}

const isAdmin = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");

export async function saveFunConfig(user: AppUser, input: Partial<FunConfig>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets Fun mode.");
  const cur = await funConfig();
  const bool = (k: keyof FunConfig) => (typeof input[k] === "boolean" ? (input[k] as boolean) : (cur[k] as boolean));
  const keys = FUN_GAMES.map((g) => g.key as string);
  const rules = (input.rules ?? cur.rules).slice(0, 60).map((r) => {
    if (!r.key || !r.action || typeof r.action !== "string" || r.action.length > 80) throw new WorkflowError("VALIDATION", "Each points rule needs an action.");
    if (r.summary) {
      try {
        new RegExp(r.summary, "i");
      } catch {
        throw new WorkflowError("VALIDATION", `The text match of "${r.label}" is not a valid pattern.`);
      }
    }
    return { key: String(r.key).slice(0, 40), label: String(r.label ?? r.key).slice(0, 120), action: r.action.trim(), summary: r.summary ? String(r.summary).slice(0, 200) : undefined, points: Math.max(0, Math.min(500, Math.round(Number(r.points) || 0))), on: r.on !== false };
  });
  const from = input.gamesFrom ?? cur.gamesFrom;
  const to = input.gamesTo ?? cur.gamesTo;
  if ((from && !HHMM.test(from)) || (to && !HHMM.test(to))) throw new WorkflowError("VALIDATION", "Game hours are HH:mm, or empty for any time.");
  const next: FunConfig = {
    enabled: bool("enabled"),
    music: bool("music"),
    lyrics: bool("lyrics"),
    playlists: bool("playlists"),
    pet: bool("pet"),
    focus: bool("focus"),
    youtube: bool("youtube"),
    youtubeClientId: String(input.youtubeClientId ?? cur.youtubeClientId ?? "").trim().slice(0, 200),
    world: bool("world"),
    worldChat: bool("worldChat"),
    worldAbsence: (["hr", "leads", "everyone"] as const).find((x) => x === (input.worldAbsence ?? cur.worldAbsence)) ?? "hr",
    worldProgress: input.worldProgress === "tasks" || (input.worldProgress === undefined && cur.worldProgress === "tasks") ? "tasks" : "points",
    worldName: String(input.worldName ?? cur.worldName ?? "Seed Town").trim().slice(0, 40) || "Seed Town",
    shop: bool("shop"),
    worldVoice: bool("worldVoice"),
    voiceRoomCap: Math.max(2, Math.min(12, Math.round(Number(input.voiceRoomCap ?? cur.voiceRoomCap) || 8))),
    playCoins: Math.max(0, Math.min(1000, Math.round(Number(input.playCoins ?? cur.playCoins) || 0))),
    youtubeApiKey: String(input.youtubeApiKey ?? cur.youtubeApiKey ?? "").trim().slice(0, 200),
    turnUrls: String(input.turnUrls ?? cur.turnUrls ?? "")
      .split(",")
      .map((u) => u.trim())
      .filter((u) => /^turns?:[^\s]{3,200}$/.test(u))
      .slice(0, 4)
      .join(", "),
    turnUsername: String(input.turnUsername ?? cur.turnUsername ?? "").trim().slice(0, 200),
    turnCredential: String(input.turnCredential ?? cur.turnCredential ?? "").trim().slice(0, 200),
    turnSecret: String(input.turnSecret ?? cur.turnSecret ?? "").trim().slice(0, 200),
    points: bool("points"),
    leaderboard: bool("leaderboard"),
    moods: bool("moods"),
    games: (input.games ?? cur.games).filter((g) => keys.includes(g)),
    dailyCap: Math.max(0, Math.min(5000, Math.round(Number(input.dailyCap ?? cur.dailyCap) || 0))),
    rules,
    roles: (input.roles ?? cur.roles).filter((r) => typeof r === "string").slice(0, 50),
    gamesFrom: from,
    gamesTo: to,
    feedCost: Math.max(0, Math.min(500, Math.round(Number(input.feedCost ?? cur.feedCost) || 0))),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.fun', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  cfgCache = null;
  await audit({ actor: user }, { action: "settings.fun", summary: `${user.name} changed Fun mode` });
  return next;
}

// Fun mode for this person: on, and their role is included.
export async function funFor(user: AppUser): Promise<FunConfig | null> {
  const c = await funConfig();
  if (!c.enabled) return null;
  if (c.roles.length && !user.roles.some((r) => c.roles.includes(r))) return null;
  return c;
}
async function need(user: AppUser, part?: "music" | "lyrics" | "playlists" | "pet" | "points" | "leaderboard" | "moods") {
  const c = await funFor(user);
  if (!c) throw new WorkflowError("FORBIDDEN", "Fun mode is off for you.");
  if (part && !c[part]) throw new WorkflowError("FORBIDDEN", "Admin switched this part of Fun mode off.");
  return c;
}

// ------------------------------------------------------------------------------------------------- points

const today = () => nowIso().slice(0, 10);
const globToRe = (g: string) => new RegExp(`^${g.split("*").map((x) => x.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`);

// Called for every audited action (workflow.audit): the first matching rule pays, once per item per day, within
// the daily cap. Never throws.
export async function awardForAction(actorId: string | null | undefined, action: string, summary: string, ref?: string | null) {
  try {
    if (!actorId || action.startsWith("fun.") || action === "settings.fun") return 0;
    const c = await funConfig();
    if (!c.enabled || !c.points) return 0;
    const rule = c.rules.find((r) => r.on && r.points > 0 && globToRe(r.action).test(action) && (!r.summary || new RegExp(r.summary, "i").test(summary)));
    if (!rule) return 0;
    const day = today();
    const key = `${rule.key}:${ref ?? summary.slice(0, 80)}`;
    if (await get("SELECT id FROM fun_points WHERE user_id = ? AND ref = ? AND substr(created_at, 1, 10) = ?", actorId, key, day)) return 0;
    const earned = (await get<{ n: number }>("SELECT COALESCE(SUM(points), 0) AS n FROM fun_points WHERE user_id = ? AND source = 'work' AND substr(created_at, 1, 10) = ?", actorId, day))?.n ?? 0;
    const pts = c.dailyCap ? Math.min(rule.points, Math.max(0, c.dailyCap - earned)) : rule.points;
    if (pts <= 0) return 0;
    await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'work', ?, ?)", uid("fp_"), actorId, pts, rule.label, key, nowIso());
    return pts;
  } catch {
    return 0;
  }
}

export async function pointsOf(userId: string) {
  const r = await get<{ total: number; earned: number; today: number }>(
    "SELECT COALESCE(SUM(points), 0) AS total, COALESCE(SUM(CASE WHEN points > 0 THEN points ELSE 0 END), 0) AS earned, COALESCE(SUM(CASE WHEN points > 0 AND substr(created_at, 1, 10) = ? THEN points ELSE 0 END), 0) AS today FROM fun_points WHERE user_id = ?",
    today(),
    userId,
  );
  return { balance: Number(r?.total ?? 0), earned: Number(r?.earned ?? 0), today: Number(r?.today ?? 0) };
}

// Levels grow with everything ever earned (spending does not lower them): 0, 50, 150, 300, 500, ...
export function levelOf(earned: number) {
  let level = 1;
  let need = 50;
  let floor = 0;
  while (earned >= floor + need) {
    floor += need;
    level++;
    need = 50 * level;
  }
  return { level, into: earned - floor, need };
}

// ------------------------------------------------------------------------------------------------- pet

export const PET_KINDS = [
  { key: "cat", label: "Cat" },
  { key: "dog", label: "Puppy" },
  { key: "fox", label: "Fox" },
  { key: "panda", label: "Panda" },
  { key: "dragon", label: "Dragon" },
  { key: "robot", label: "Robot" },
  { key: "owl", label: "Owl" },
  { key: "bunny", label: "Bunny" },
] as const;
// Things the pet wears, unlocked by level (more in the pet shop).
export const PET_ITEMS = [
  { key: "none", label: "Nothing", level: 1 },
  { key: "bow", label: "Bow", level: 2 },
  { key: "cap", label: "Cap", level: 3 },
  { key: "glasses", label: "Sunglasses", level: 4 },
  { key: "crown", label: "Crown", level: 6 },
  { key: "headphones", label: "Headphones", level: 8 },
  { key: "wizard", label: "Wizard hat", level: 10 },
] as const;
// Growth: care earns the pet experience; it grows up in four stages.
export const PET_STAGES = [
  { key: "baby", label: "Baby", xp: 0 },
  { key: "young", label: "Young", xp: 100 },
  { key: "teen", label: "Adolescent", xp: 300 },
  { key: "adult", label: "Adult", xp: 700 },
] as const;

type Need = "full" | "fun" | "clean" | "energy" | "love" | "health";
type PetStats = Partial<Record<Need, { v: number; at: string }>> & { sleepUntil?: string; petXpAt?: string; waterAt?: string };
type PetRow = {
  user_id: string; kind: string; name: string; outfit: string; fed_at: string | null; played_at: string | null; petted_at: string | null; created_at: string;
  xp: number; washed_at: string | null; slept_at: string | null; stats: string; streak: number; streak_day: string | null; skin: string | null; wear: string; log: string;
};
// How fast each need drops, per hour (energy rises while asleep).
const DECAY: Record<Need, number> = { full: 6, fun: 5, clean: 3, energy: 4, love: 4, health: 2 };
const hrs = (iso: string | null | undefined) => (iso ? Math.max(0, (Date.now() - Date.parse(iso)) / 36e5) : 999);
const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function needsOf(p: PetRow) {
  const s = parseJson<PetStats>(p.stats ?? "{}", {});
  // Pets from before the needs were kept start from their old care times.
  const legacy: Record<Need, string | null> = { full: p.fed_at, fun: p.played_at, love: p.petted_at, clean: p.washed_at ?? p.created_at, energy: p.slept_at ?? p.created_at, health: p.created_at };
  const now: Record<Need, number> = { full: 0, fun: 0, clean: 0, energy: 0, love: 0, health: 0 };
  const sleeping = !!s.sleepUntil && Date.parse(s.sleepUntil) > Date.now();
  for (const k of Object.keys(DECAY) as Need[]) {
    const e = s[k] ?? { v: 100, at: legacy[k] ?? p.created_at };
    if (k === "energy" && s.sleepUntil) {
      // Asleep: energy fills; after waking it drops again.
      const start = Date.parse(e.at), end = Math.min(Date.now(), Date.parse(s.sleepUntil));
      const slept = Math.max(0, (end - start) / 36e5);
      const awake = Math.max(0, (Date.now() - Math.max(start, Date.parse(s.sleepUntil))) / 36e5);
      now.energy = clamp(e.v + slept * 120 - awake * DECAY.energy);
    } else now[k] = clamp(e.v - hrs(e.at) * DECAY[k]);
  }
  now.health = clamp(now.health * 0.4 + now.full * 0.25 + now.clean * 0.2 + now.energy * 0.15);
  return { now, stats: s, sleeping };
}

const stageOf = (xp: number) => {
  let i = 0;
  while (i + 1 < PET_STAGES.length && xp >= PET_STAGES[i + 1]!.xp) i++;
  return { ...PET_STAGES[i]!, index: i, next: PET_STAGES[i + 1]?.xp ?? null };
};

function petView(p: PetRow, todayPts: number) {
  const { now, sleeping } = needsOf(p);
  const work = Math.min(100, todayPts * 2);
  const happiness = clamp(now.full * 0.25 + now.fun * 0.2 + now.love * 0.15 + now.clean * 0.1 + now.health * 0.1 + work * 0.2);
  const mood = sleeping ? "sleeping" : happiness >= 75 ? "joyful" : happiness >= 50 ? "happy" : happiness >= 25 ? "okay" : "sad";
  const stage = stageOf(Number(p.xp ?? 0));
  return {
    kind: p.kind, name: p.name, outfit: p.outfit, since: p.created_at,
    hunger: 100 - now.full, full: now.full, fun: now.fun, love: now.love, clean: now.clean, energy: now.energy, health: now.health,
    happiness, mood, sleeping, xp: Number(p.xp ?? 0), stage: stage.key, stageLabel: stage.label, stageIndex: stage.index, nextXp: stage.next,
    streak: Number(p.streak ?? 0), skin: p.skin, wear: parseJson<string[]>(p.wear ?? "[]", []), log: parseJson<{ at: string; what: string }[]>(p.log ?? "[]", []).slice(0, 20),
  };
}

export async function myPet(user: AppUser) {
  const c = await need(user, "pet");
  const p = await get<PetRow>("SELECT * FROM fun_pets WHERE user_id = ?", user.id);
  const pts = await pointsOf(user.id);
  const lvl = levelOf(pts.earned);
  const things = c.shop ? await all<{ item: string; qty: number }>("SELECT item, qty FROM fun_items WHERE user_id = ? AND qty > 0 AND (item LIKE 'food.%' OR item LIKE 'toy.%' OR item LIKE 'petwear.%' OR item LIKE 'petskin.%')", user.id) : [];
  const kennel = await all<{ id: string; data: string }>("SELECT id, data FROM fun_pet_kennel WHERE user_id = ? ORDER BY stored_at", user.id);
  const others = kennel.map((k) => {
    const r = parseJson<PetRow>(k.data, {} as PetRow);
    return { id: k.id, name: r.name, kind: r.kind, stage: stageOf(Number(r.xp ?? 0)).label };
  });
  const base = { points: pts, level: lvl, feedCost: c.feedCost, things: things.map((t) => ({ key: t.item, qty: Number(t.qty) })), shop: c.shop, others, slots: MAX_PETS };
  if (!p) return { pet: null, ...base };
  return { pet: petView(p, pts.today), ...base };
}

// Up to three pets: one out, the others resting in the kennel (their needs pause while they rest).
export const MAX_PETS = 3;
async function toKennel(userId: string) {
  const cur = await get<PetRow>("SELECT * FROM fun_pets WHERE user_id = ?", userId);
  if (!cur) return;
  await run("INSERT INTO fun_pet_kennel (id, user_id, data, stored_at) VALUES (?, ?, ?, ?)", uid("pk_"), userId, JSON.stringify(cur), nowIso());
  await run("DELETE FROM fun_pets WHERE user_id = ?", userId);
}

export async function switchPet(user: AppUser, kennelId: string) {
  await need(user, "pet");
  const k = await get<{ id: string; data: string; stored_at: string }>("SELECT * FROM fun_pet_kennel WHERE id = ? AND user_id = ?", kennelId, user.id);
  if (!k) throw new WorkflowError("NOT_FOUND", "That pet is not in your kennel.");
  const r = parseJson<PetRow>(k.data, {} as PetRow);
  // Needs pick up where they were when it went to rest.
  const away = Date.now() - Date.parse(k.stored_at);
  const shift = (iso: string | null) => (iso ? new Date(Date.parse(iso) + away).toISOString() : iso);
  const stats = parseJson<PetStats>(r.stats ?? "{}", {});
  for (const key of Object.keys(DECAY) as Need[]) if (stats[key]) stats[key]!.at = shift(stats[key]!.at)!;
  if (stats.sleepUntil) stats.sleepUntil = shift(stats.sleepUntil)!;
  await tx(async () => {
    await toKennel(user.id);
    await run("DELETE FROM fun_pet_kennel WHERE id = ?", k.id);
    await run(
      "INSERT INTO fun_pets (user_id, kind, name, outfit, fed_at, played_at, petted_at, created_at, updated_at, xp, washed_at, slept_at, stats, streak, streak_day, skin, wear, log) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      user.id, r.kind, r.name, r.outfit ?? "none", shift(r.fed_at), shift(r.played_at), shift(r.petted_at), r.created_at, nowIso(), Number(r.xp ?? 0), shift(r.washed_at), shift(r.slept_at), JSON.stringify(stats), Number(r.streak ?? 0), r.streak_day, r.skin, r.wear ?? "[]", r.log ?? "[]",
    );
  });
  return myPet(user);
}

export async function adoptPet(user: AppUser, kind: string, name: string) {
  await need(user, "pet");
  if (!PET_KINDS.some((k) => k.key === kind)) throw new WorkflowError("VALIDATION", "Choose one of the pets.");
  // Another pet: the one out now goes to rest in the kennel (three at most).
  if (await get("SELECT user_id FROM fun_pets WHERE user_id = ?", user.id)) {
    const n = Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM fun_pet_kennel WHERE user_id = ?", user.id))?.n ?? 0);
    if (n + 1 >= MAX_PETS) throw new WorkflowError("VALIDATION", `You can keep ${MAX_PETS} pets.`);
    await toKennel(user.id);
  }
  const n = name.trim().slice(0, 30) || PET_KINDS.find((k) => k.key === kind)!.label;
  const now = nowIso();
  const stats: PetStats = { full: { v: 90, at: now }, fun: { v: 90, at: now }, clean: { v: 100, at: now }, energy: { v: 100, at: now }, love: { v: 80, at: now }, health: { v: 100, at: now } };
  await run(
    "INSERT INTO fun_pets (user_id, kind, name, outfit, fed_at, played_at, petted_at, created_at, updated_at, stats, xp, log) VALUES (?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT (user_id) DO UPDATE SET kind = excluded.kind, name = excluded.name, updated_at = excluded.updated_at",
    user.id, kind, n, now, now, now, now, now, JSON.stringify(stats), JSON.stringify([{ at: now, what: `${n} came home` }]),
  );
  return myPet(user);
}

export type PetAct = "feed" | "water" | "play" | "pet" | "bath" | "sleep" | "wake" | "outfit" | "wear" | "skin" | "rename";

// Care: each act changes the needs; care that is needed (not when already full) earns the pet experience, and the
// first care of a day keeps the streak going. Food beyond the basic bowl comes from the pet shop.
export async function carePet(user: AppUser, act: PetAct, arg?: string) {
  const c = await need(user, "pet");
  const p = await get<PetRow>("SELECT * FROM fun_pets WHERE user_id = ?", user.id);
  if (!p) throw new WorkflowError("VALIDATION", "Adopt a pet first.");
  const nowS = nowIso();
  const { now: n, stats, sleeping } = needsOf(p);
  const set = (k: Need, v: number) => (stats[k] = { v: clamp(v), at: nowS });
  let xp = 0;
  let what = "";
  const fields: Record<string, string | number | null> = {};
  if (sleeping && !["wake", "pet", "outfit", "wear", "skin", "rename"].includes(act)) throw new WorkflowError("VALIDATION", `${p.name} is asleep. Let it rest, or wake it up.`);
  if (act === "feed") {
    const food = arg && arg !== "kibble" ? arg : null;
    if (food) {
      const { itemOf, useOne } = await import("./fun-shop");
      const it = await itemOf(food);
      if (!it || it.kind !== "petfood") throw new WorkflowError("VALIDATION", "That is not pet food.");
      await useOne(user.id, food);
      const e = it.effect ?? {};
      set("full", n.full + (e.hunger ?? 0));
      if (e.fun) set("fun", n.fun + e.fun);
      if (e.energy) set("energy", n.energy + e.energy);
      if (e.love) set("love", n.love + e.love);
      if (e.health) set("health", n.health + e.health);
      what = `Ate ${it.label.toLowerCase()}`;
    } else {
      const pts = await pointsOf(user.id);
      if (c.points && c.feedCost > 0) {
        if (pts.balance < c.feedCost) throw new WorkflowError("VALIDATION", `Food costs ${c.feedCost} points; you have ${pts.balance}. Work earns points.`);
        await run("INSERT INTO fun_points (id, user_id, points, reason, source, ref, created_at) VALUES (?, ?, ?, ?, 'spend', 'pet.feed', ?)", uid("fp_"), user.id, -c.feedCost, `Fed ${p.name}`, nowS);
      }
      set("full", n.full + 35);
      what = "Ate a bowl of food";
    }
    if (n.full < 80) xp += 10;
    fields.fed_at = nowS;
  } else if (act === "water") {
    set("full", n.full + 8);
    set("health", n.health + 6);
    if (hrs(stats.waterAt) > 0.5) xp += 2;
    stats.waterAt = nowS;
    what = "Had some water";
  } else if (act === "play") {
    if (n.energy < 12) throw new WorkflowError("VALIDATION", `${p.name} is too sleepy to play. Let it nap first.`);
    let boost = 25;
    if (arg) {
      const { owns, itemOf } = await import("./fun-shop");
      const it = await itemOf(arg);
      if (!it || it.kind !== "pettoy" || !(await owns(user.id, arg))) throw new WorkflowError("VALIDATION", "Get that toy at Paws & Treats first.");
      boost = 40;
      what = `Played with the ${it.label.toLowerCase()}`;
    } else what = "Played together";
    if (n.fun < 80) xp += 6;
    set("fun", n.fun + boost);
    set("energy", n.energy - 10);
    set("clean", n.clean - 5);
    fields.played_at = nowS;
  } else if (act === "pet") {
    set("love", n.love + 15);
    if (hrs(stats.petXpAt) > 1 / 3) (xp += 3), (stats.petXpAt = nowS);
    what = arg === "belly" ? "Got a belly rub" : arg === "chin" ? "Got a chin scratch" : "Got a pat on the head";
    fields.petted_at = nowS;
  } else if (act === "bath") {
    if (n.clean < 70) xp += 8;
    set("clean", 100);
    set("love", n.love - 5);
    what = "Had a bath";
    fields.washed_at = nowS;
  } else if (act === "sleep") {
    stats.energy = { v: n.energy, at: nowS };
    stats.sleepUntil = new Date(Date.now() + Math.max(10, Math.round(((100 - n.energy) / 120) * 60)) * 60e3).toISOString();
    what = "Went to sleep";
    fields.slept_at = nowS;
  } else if (act === "wake") {
    stats.energy = { v: n.energy, at: nowS };
    delete stats.sleepUntil;
    what = "Woke up";
  } else if (act === "outfit") {
    const item = PET_ITEMS.find((i) => i.key === arg);
    if (!item) throw new WorkflowError("VALIDATION", "Unknown item.");
    const lvl = levelOf((await pointsOf(user.id)).earned).level;
    if (item.level > lvl) throw new WorkflowError("VALIDATION", `${item.label} unlocks at level ${item.level}.`);
    fields.outfit = item.key;
  } else if (act === "wear") {
    const list = (arg ? arg.split(",") : []).filter(Boolean).slice(0, 3);
    const { owns } = await import("./fun-shop");
    for (const k of list) if (!k.startsWith("petwear.") || !(await owns(user.id, k))) throw new WorkflowError("VALIDATION", "Get that at Paws & Treats first.");
    fields.wear = JSON.stringify(list);
  } else if (act === "skin") {
    if (arg) {
      const { owns } = await import("./fun-shop");
      if (!arg.startsWith("petskin.") || !(await owns(user.id, arg))) throw new WorkflowError("VALIDATION", "Get that coat at Paws & Treats first.");
    }
    fields.skin = arg || null;
  } else if (act === "rename") {
    const nm = String(arg ?? "").trim().slice(0, 30);
    if (!nm) throw new WorkflowError("VALIDATION", "Give it a name.");
    fields.name = nm;
    what = `Is now called ${nm}`;
  } else throw new WorkflowError("VALIDATION", "Unknown care.");

  // The day's first care keeps the streak (and gives a bonus).
  const day = nowS.slice(0, 10);
  if (xp > 0 && p.streak_day !== day) {
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    fields.streak = p.streak_day === yesterday ? Number(p.streak ?? 0) + 1 : 1;
    fields.streak_day = day;
    xp += 15;
  }
  const before = stageOf(Number(p.xp ?? 0));
  const after = stageOf(Number(p.xp ?? 0) + xp);
  const log = parseJson<{ at: string; what: string }[]>(p.log ?? "[]", []);
  if (what) log.unshift({ at: nowS, what });
  if (after.index > before.index) log.unshift({ at: nowS, what: `Grew up: now ${after.label.toLowerCase()}` });
  fields.stats = JSON.stringify(stats);
  fields.xp = Number(p.xp ?? 0) + xp;
  fields.log = JSON.stringify(log.slice(0, 30));
  fields.updated_at = nowS;
  const keys = Object.keys(fields);
  await run(`UPDATE fun_pets SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE user_id = ?`, ...keys.map((k) => fields[k]!), user.id);
  const res = await myPet(user);
  return { ...res, gained: xp, grew: after.index > before.index ? after.label : null };
}

// ------------------------------------------------------------------------------------------------- scores

export async function saveScore(user: AppUser, game: string, score: number, meta?: Record<string, unknown>) {
  const c = await need(user);
  if (!/^[a-z0-9-]{1,30}(:[a-z0-9-]{1,30})?$/.test(game)) throw new WorkflowError("VALIDATION", "Unknown game.");
  if (!c.games.includes(game.split(":")[0]!)) throw new WorkflowError("FORBIDDEN", "Admin switched this game off.");
  const s = Math.round(Number(score));
  if (!Number.isFinite(s) || s < 0 || s > 10_000_000) throw new WorkflowError("VALIDATION", "Not a score.");
  await run("INSERT INTO fun_scores (id, user_id, game, score, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)", uid("fs_"), user.id, game, s, meta ? JSON.stringify(meta).slice(0, 2000) : null, nowIso());
  return bestScores(user, game);
}

// Lower is better for times (typing is words per minute: higher is better).
const LOWER_BETTER = new Set(["reaction", "sudoku", "minesweeper", "memory", "reaction:classic", "reaction:aim", "world:parkour", "world:race"]);
const lowerBetter = (game: string) => LOWER_BETTER.has(game) || (LOWER_BETTER.has(game.split(":")[0]!) && !/:(time|zen|daily-streak|sequence|stroop|blitz)/.test(game));

export async function bestScores(user: AppUser, game: string) {
  await need(user);
  const lower = lowerBetter(game);
  const order = lower ? "ASC" : "DESC";
  const agg = lower ? "MIN" : "MAX";
  const mine = await get<{ s: number | null }>(`SELECT ${agg}(score) AS s FROM fun_scores WHERE user_id = ? AND game = ?`, user.id, game);
  const top = await all<{ name: string; s: number }>(
    `SELECT u.name AS name, ${agg}(f.score) AS s FROM fun_scores f JOIN users u ON u.id = f.user_id WHERE f.game = ? GROUP BY f.user_id, u.name ORDER BY s ${order} LIMIT 5`,
    game,
  );
  const games = await get<{ n: number }>("SELECT COUNT(*) AS n FROM fun_scores WHERE user_id = ? AND game = ?", user.id, game);
  return { mine: mine?.s ?? null, top, lowerIsBetter: lower, played: Number(games?.n ?? 0) };
}

// ------------------------------------------------------------------------------------------------- leaderboard and moods

export async function leaderboard(user: AppUser, days = 7) {
  await need(user, "leaderboard");
  const since = new Date(Date.now() - days * 864e5).toISOString();
  const rows = await all<{ id: string; name: string; pts: number }>(
    "SELECT u.id AS id, u.name AS name, SUM(f.points) AS pts FROM fun_points f JOIN users u ON u.id = f.user_id WHERE f.source = 'work' AND f.created_at >= ? GROUP BY u.id, u.name ORDER BY pts DESC LIMIT 10",
    since,
  );
  return rows.map((r, i) => ({ rank: i + 1, name: r.name, points: Number(r.pts), me: r.id === user.id }));
}

export async function myPointsLog(user: AppUser) {
  await need(user, "points");
  return all<{ points: number; reason: string; created_at: string }>("SELECT points, reason, created_at FROM fun_points WHERE user_id = ? ORDER BY created_at DESC LIMIT 30", user.id);
}

// Today's mood, one per person per day; the team sees only the spread, never who said what.
export async function setMood(user: AppUser, mood: number) {
  await need(user, "moods");
  const m = Math.round(mood);
  if (m < 1 || m > 5) throw new WorkflowError("VALIDATION", "Mood is 1 to 5.");
  await run("INSERT INTO fun_moods (user_id, day, mood, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, day) DO UPDATE SET mood = excluded.mood", user.id, today(), m, nowIso());
  return teamMood(user);
}
export async function teamMood(user: AppUser) {
  await need(user, "moods");
  const rows = await all<{ mood: number; n: number }>("SELECT mood, COUNT(*) AS n FROM fun_moods WHERE day = ? GROUP BY mood", today());
  const mine = await get<{ mood: number }>("SELECT mood FROM fun_moods WHERE user_id = ? AND day = ?", user.id, today());
  const total = rows.reduce((a, r) => a + Number(r.n), 0);
  const avg = total ? rows.reduce((a, r) => a + r.mood * Number(r.n), 0) / total : null;
  return { mine: mine?.mood ?? null, total, average: avg === null ? null : Math.round(avg * 10) / 10, spread: [1, 2, 3, 4, 5].map((k) => Number(rows.find((r) => r.mood === k)?.n ?? 0)) };
}

// ------------------------------------------------------------------------------------------------- playlists

// artworkAlt: the same cover on mirror hosts, tried in turn when the first one fails.
export type Track = { id: string; title: string; artist: string; artwork: string | null; artworkAlt?: string[]; duration: number; genre?: string | null };
type PlaylistRow = { id: string; user_id: string; name: string; tracks_json: string; shared: number; created_at: string; updated_at: string };

const cleanTrack = (t: Partial<Track>): Track | null =>
  t && typeof t.id === "string" && /^[A-Za-z0-9]{1,24}$/.test(t.id)
    ? { id: t.id, title: String(t.title ?? "").slice(0, 200), artist: String(t.artist ?? "").slice(0, 120), artwork: typeof t.artwork === "string" && /^https:\/\//.test(t.artwork) ? t.artwork.slice(0, 500) : null, artworkAlt: Array.isArray(t.artworkAlt) ? t.artworkAlt.filter((u) => typeof u === "string" && /^https:\/\//.test(u)).slice(0, 3).map((u) => u.slice(0, 500)) : [], duration: Math.max(0, Math.round(Number(t.duration) || 0)), genre: t.genre ? String(t.genre).slice(0, 60) : null }
    : null;

export async function myPlaylists(user: AppUser) {
  await need(user, "playlists");
  const rows = await all<PlaylistRow & { owner: string }>(
    "SELECT p.*, u.name AS owner FROM fun_playlists p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? OR p.shared = 1 ORDER BY (p.user_id = ?) DESC, p.updated_at DESC LIMIT 100",
    user.id,
    user.id,
  );
  return rows.map((r) => ({ id: r.id, name: r.name, mine: r.user_id === user.id, owner: r.owner, shared: !!r.shared, tracks: parseJson<Track[]>(r.tracks_json, []) }));
}

export async function savePlaylist(user: AppUser, input: { id?: string | null; name: string; tracks: Partial<Track>[]; shared?: boolean }) {
  await need(user, "playlists");
  const name = input.name.trim().slice(0, 80);
  if (!name) throw new WorkflowError("VALIDATION", "Give the playlist a name.");
  const tracks = input.tracks.map(cleanTrack).filter((t): t is Track => !!t).slice(0, 300);
  const now = nowIso();
  if (input.id) {
    const p = await get<PlaylistRow>("SELECT * FROM fun_playlists WHERE id = ?", input.id);
    if (!p || p.user_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only its owner changes a playlist.");
    await run("UPDATE fun_playlists SET name = ?, tracks_json = ?, shared = ?, updated_at = ? WHERE id = ?", name, JSON.stringify(tracks), input.shared ? 1 : 0, now, p.id);
    return p.id;
  }
  if (((await get<{ n: number }>("SELECT COUNT(*) AS n FROM fun_playlists WHERE user_id = ?", user.id))?.n ?? 0) >= 50) throw new WorkflowError("VALIDATION", "You have 50 playlists; delete one first.");
  const id = uid("fpl_");
  await run("INSERT INTO fun_playlists (id, user_id, name, tracks_json, shared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, user.id, name, JSON.stringify(tracks), input.shared ? 1 : 0, now, now);
  return id;
}

export async function deletePlaylist(user: AppUser, id: string) {
  await need(user, "playlists");
  const p = await get<PlaylistRow>("SELECT * FROM fun_playlists WHERE id = ?", id);
  if (!p || (p.user_id !== user.id && !isAdmin(user))) throw new WorkflowError("FORBIDDEN", "Only its owner deletes a playlist.");
  await run("DELETE FROM fun_playlists WHERE id = ?", id);
}

// ------------------------------------------------------------------------------------------------- music and lyrics

const AUDIUS = "https://api.audius.co";
const APP = "myseed_ops";
const cache = new Map<string, { at: number; data: unknown }>();
async function fetchJson<T>(url: string, ttlMs: number): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < ttlMs) return hit.data as T;
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "MyseedOps/1.0" }, signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new WorkflowError("VALIDATION", r.status === 404 ? "Not found." : `The music service answered ${r.status}. Try again.`);
  const data = (await r.json()) as T;
  cache.set(url, { at: Date.now(), data });
  if (cache.size > 400) cache.delete(cache.keys().next().value!);
  return data;
}

type AudiusTrack = { id: string; title: string; duration: number; genre?: string; user?: { name?: string }; artwork?: (Record<string, string> & { mirrors?: string[] }) | null; is_streamable?: boolean };
const toTrack = (t: AudiusTrack): Track => {
  const art = t.artwork?.["480x480"] ?? t.artwork?.["150x150"] ?? null;
  // The same file on the mirror hosts Audius lists (its main host is sometimes down).
  const path = art ? art.replace(/^https:\/\/[^/]+/, "") : "";
  const alt = art ? (t.artwork?.mirrors ?? []).filter((m) => /^https:\/\//.test(m)).slice(0, 3).map((m) => `${m.replace(/\/$/, "")}${path}`) : [];
  return { id: t.id, title: t.title, artist: t.user?.name ?? "", artwork: art, artworkAlt: alt, duration: t.duration, genre: t.genre ?? null };
};

export async function searchMusic(user: AppUser, q: string) {
  await need(user, "music");
  const query = q.trim().slice(0, 100);
  const url = query ? `${AUDIUS}/v1/tracks/search?query=${encodeURIComponent(query)}&app_name=${APP}&limit=25` : `${AUDIUS}/v1/tracks/trending?app_name=${APP}&limit=25`;
  const r = await fetchJson<{ data: AudiusTrack[] }>(url, query ? 10 * 60e3 : 30 * 60e3);
  return r.data.filter((t) => t.is_streamable !== false).map(toTrack);
}

// Moods and genres as ready searches.
export const MUSIC_MOODS = [
  { key: "focus", label: "Focus", q: "lofi" },
  { key: "chill", label: "Chill", q: "chill" },
  { key: "energy", label: "Energy", q: "workout" },
  { key: "jazz", label: "Jazz", q: "jazz" },
  { key: "piano", label: "Piano", q: "piano" },
  { key: "ethio", label: "Ethiopian", q: "ethiopian" },
  { key: "afro", label: "Afrobeats", q: "afrobeats" },
  { key: "classical", label: "Classical", q: "classical" },
];

export function streamUrl(id: string) {
  if (!/^[A-Za-z0-9]{1,24}$/.test(id)) throw new WorkflowError("VALIDATION", "Not a track.");
  return `${AUDIUS}/v1/tracks/${id}/stream?app_name=${APP}`;
}

// Lyrics from LRCLIB: synced lines ([mm:ss.xx] text) when there are some, else plain text.
export async function lyrics(user: AppUser, artist: string, title: string, duration?: number) {
  await need(user, "lyrics");
  const clean = (s: string) => s.replace(/\(.*?\)|\[.*?\]/g, "").replace(/\s+-\s+.*$/, "").trim().slice(0, 120);
  const t = clean(title);
  if (!t) return null;
  const list = await fetchJson<{ trackName: string; artistName: string; duration: number; syncedLyrics: string | null; plainLyrics: string | null; instrumental: boolean }[]>(
    `https://lrclib.net/api/search?track_name=${encodeURIComponent(t)}${artist ? `&artist_name=${encodeURIComponent(clean(artist))}` : ""}`,
    24 * 3600e3,
  ).catch(() => []);
  const pick = (duration ? list.find((x) => Math.abs(x.duration - duration) < 6) : null) ?? list.find((x) => x.syncedLyrics || x.plainLyrics);
  if (!pick) return null;
  const lines = pick.syncedLyrics
    ? pick.syncedLyrics.split("\n").map((l) => {
        const m = l.match(/^\[(\d+):(\d+(?:\.\d+)?)\]\s?(.*)$/);
        return m ? { at: Number(m[1]) * 60 + Number(m[2]), text: m[3]! } : null;
      }).filter((x): x is { at: number; text: string } => !!x)
    : null;
  return { title: pick.trackName, artist: pick.artistName, instrumental: pick.instrumental, synced: lines, plain: pick.plainLyrics };
}

// ------------------------------------------------------------------------------------------------- the window

// Everything the Fun window needs when it opens.
export async function funHome(user: AppUser) {
  const c = await funFor(user);
  if (!c) return null;
  const pts = await pointsOf(user.id);
  return {
    focus: c.focus ? await focusOf(user) : null,
    config: { focus: c.focus, youtube: c.youtube, youtubeClientId: c.youtube ? c.youtubeClientId : "", youtubeSearch: c.youtube && !!c.youtubeApiKey, shop: c.shop, playCoins: c.playCoins, music: c.music, lyrics: c.lyrics, playlists: c.playlists, games: FUN_GAMES.filter((g) => c.games.includes(g.key)), pet: c.pet, points: c.points, leaderboard: c.leaderboard, moods: c.moods, gamesFrom: c.gamesFrom, gamesTo: c.gamesTo, feedCost: c.feedCost, dailyCap: c.dailyCap },
    points: pts,
    level: levelOf(pts.earned),
    rules: c.points ? c.rules.filter((r) => r.on && r.points > 0).map((r) => ({ label: r.label, points: r.points })) : [],
    moods: MUSIC_MOODS,
  };
}

// Chess puzzles from Lichess (free, open data): today's puzzle, or a fresh one. The position (FEN, the side to
// move solves) and the solution in UCI moves.
export async function chessPuzzle(user: AppUser, kind: "daily" | "next") {
  const c = await need(user);
  if (!c.games.includes("chess-learn")) throw new WorkflowError("FORBIDDEN", "Admin switched chess lessons off.");
  const url = kind === "daily" ? "https://lichess.org/api/puzzle/daily" : `https://lichess.org/api/puzzle/next?t=${Math.floor(Date.now() / 20000)}`;
  const r = await fetchJson<{ puzzle: { id: string; rating: number; solution: string[]; themes: string[]; fen?: string; initialPly: number }; game: { pgn: string } }>(url, kind === "daily" ? 3600e3 : 15e3);
  return { id: r.puzzle.id, rating: r.puzzle.rating, solution: r.puzzle.solution, themes: r.puzzle.themes, fen: r.puzzle.fen ?? null, pgn: r.game.pgn };
}

// ------------------------------------------------------------------------------------------------- focus mode

// The persona from the focus quiz and the person's settings (timer lengths, YouTube playlists they keep).
export type FocusPrefs = { minutes?: number; breakMinutes?: number; hideToasts?: boolean; dim?: boolean; youtube?: { id: string; title: string }[] };
type FocusRow = { user_id: string; persona: string | null; prefs: string; sessions: number; minutes: number; last_at: string | null };

export async function focusOf(user: AppUser) {
  const r = await get<FocusRow>("SELECT * FROM fun_focus WHERE user_id = ?", user.id);
  return { persona: r?.persona ?? null, prefs: parseJson<FocusPrefs>(r?.prefs ?? "{}", {}), sessions: Number(r?.sessions ?? 0), minutes: Number(r?.minutes ?? 0) };
}

const PERSONAS = ["calm-coder", "deep-diver", "energy-sprinter", "classical-thinker", "afro-groover", "nature-listener", "jazz-cafe", "gamer-flow"];
export async function saveFocus(user: AppUser, input: { persona?: string | null; prefs?: FocusPrefs }) {
  const c = await need(user);
  if (!c.focus) throw new WorkflowError("FORBIDDEN", "Admin switched focus mode off.");
  if (input.persona && !PERSONAS.includes(input.persona)) throw new WorkflowError("VALIDATION", "Unknown persona.");
  const cur = await focusOf(user);
  const p = { ...cur.prefs, ...(input.prefs ?? {}) };
  const prefs: FocusPrefs = {
    minutes: Math.max(5, Math.min(180, Math.round(Number(p.minutes ?? 25)))),
    breakMinutes: Math.max(1, Math.min(60, Math.round(Number(p.breakMinutes ?? 5)))),
    hideToasts: !!p.hideToasts,
    dim: !!p.dim,
    youtube: (p.youtube ?? []).filter((y) => y && /^[A-Za-z0-9_-]{2,64}$/.test(y.id)).slice(0, 30).map((y) => ({ id: y.id, title: String(y.title ?? "").slice(0, 120) })),
  };
  await run(
    "INSERT INTO fun_focus (user_id, persona, prefs, sessions, minutes, updated_at) VALUES (?, ?, ?, 0, 0, ?) ON CONFLICT (user_id) DO UPDATE SET persona = excluded.persona, prefs = excluded.prefs, updated_at = excluded.updated_at",
    user.id, input.persona === undefined ? cur.persona : input.persona, JSON.stringify(prefs), nowIso(),
  );
  return focusOf(user);
}

// A finished session: counted, and points by the rules (sessions must really last: not sooner than the length
// after the last one).
export async function completeFocus(user: AppUser, minutes: number) {
  const c = await need(user);
  if (!c.focus) throw new WorkflowError("FORBIDDEN", "Admin switched focus mode off.");
  const m = Math.round(Number(minutes));
  if (!(m >= 5 && m <= 180)) throw new WorkflowError("VALIDATION", "Not a session length.");
  const r = await get<FocusRow>("SELECT * FROM fun_focus WHERE user_id = ?", user.id);
  if (r?.last_at && Date.now() - Date.parse(r.last_at) < m * 60e3 * 0.9) throw new WorkflowError("VALIDATION", "That session ended too soon after the last one.");
  const now = nowIso();
  await run(
    "INSERT INTO fun_focus (user_id, persona, prefs, sessions, minutes, last_at, updated_at) VALUES (?, NULL, '{}', 1, ?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET sessions = fun_focus.sessions + 1, minutes = fun_focus.minutes + excluded.minutes, last_at = excluded.last_at, updated_at = excluded.updated_at",
    user.id, m, now, now,
  );
  const pts = m >= 20 ? await awardForAction(user.id, "focus.session", `${user.name} focused for ${m} minutes`, `focus:${now}`) : 0;
  return { ...(await focusOf(user)), earned: pts };
}

// ------------------------------------------------------------------------------------------------- YouTube search

// Search YouTube inside the app with Admin's Data API key (each search costs 100 of the free 10,000 daily units, so
// results are kept for a day). Without a key people search after signing in to YouTube, or paste links.
export type YtVideo = { id: string; title: string; channel: string; thumb: string; live: boolean };
export async function youtubeSearch(user: AppUser, q: string, kind: "video" | "playlist" = "video") {
  const c = await need(user);
  if (!c.youtube) throw new WorkflowError("FORBIDDEN", "Admin switched YouTube off.");
  if (!c.youtubeApiKey) throw new WorkflowError("VALIDATION", "YouTube search needs Admin's API key. Sign in to YouTube, or paste a link.");
  const query = q.trim().slice(0, 100);
  if (!query) return [];
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=20&safeSearch=moderate&type=${kind}&q=${encodeURIComponent(query)}&key=${encodeURIComponent(c.youtubeApiKey)}`;
  const r = await fetchJson<{ items?: { id: { videoId?: string; playlistId?: string }; snippet: { title: string; channelTitle: string; liveBroadcastContent?: string; thumbnails?: { medium?: { url: string } } } }[] }>(url, 24 * 3600e3);
  return (r.items ?? [])
    .map((i) => ({ id: i.id.videoId ?? i.id.playlistId ?? "", title: decodeEntities(i.snippet.title), channel: decodeEntities(i.snippet.channelTitle), thumb: i.snippet.thumbnails?.medium?.url ?? "", live: i.snippet.liveBroadcastContent === "live", playlist: !!i.id.playlistId }))
    .filter((v) => v.id);
}
const decodeEntities = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
