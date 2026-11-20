import { get, nowIso, parseJson, run } from "./db";
import type { AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { funFor } from "./fun";

// What town folk remember about each person: how often they have met, how they feel about them (talking, helping
// and finishing their tasks raise it), what was talked about lately, and the task they gave (one at a time). A
// finished task pays its coins once (within the day's play coins).

export type NpcMemory = { met: number; relation: number; topics: string[]; quest: Quest | null; done: number; lastAt: string | null };
export type Quest = { id: string; text: string; place: string; x: number; z: number; r: number; reward: number };
const EMPTY: NpcMemory = { met: 0, relation: 0, topics: [], quest: null, done: 0, lastAt: null };
const NPC = /^[a-z0-9-]{2,60}$/i;

async function need(user: AppUser) {
  const c = await funFor(user);
  if (!c || !c.world) throw new WorkflowError("FORBIDDEN", "Seed Town is off for you.");
  return c;
}

export async function npcMemory(user: AppUser, npc: string): Promise<NpcMemory> {
  await need(user);
  if (!NPC.test(npc)) throw new WorkflowError("VALIDATION", "Unknown person.");
  const r = await get<{ data: string }>("SELECT data FROM fun_npc_memory WHERE user_id = ? AND npc = ?", user.id, npc);
  return { ...EMPTY, ...parseJson<Partial<NpcMemory>>(r?.data ?? "{}", {}) };
}

async function save(user: AppUser, npc: string, m: NpcMemory) {
  await run(
    "INSERT INTO fun_npc_memory (user_id, npc, data, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, npc) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
    user.id,
    npc,
    JSON.stringify(m),
    nowIso(),
  );
}

// A conversation happened: count the meeting (once an hour), the topic, and maybe a new task.
export async function npcTalked(user: AppUser, npc: string, input: { topic: string; quest?: Quest | null }) {
  const m = await npcMemory(user, npc);
  const now = nowIso();
  if (!m.lastAt || Date.parse(now) - Date.parse(m.lastAt) > 3600_000) m.met++;
  m.lastAt = now;
  m.relation = Math.min(100, m.relation + (input.topic === "bye" ? 0 : 1));
  m.topics = [String(input.topic).slice(0, 30), ...m.topics.filter((t) => t !== input.topic)].slice(0, 8);
  if (input.quest && !m.quest) {
    const q = input.quest;
    if (!Number.isFinite(q.x) || !Number.isFinite(q.z) || Math.abs(q.x) > 900 || Math.abs(q.z) > 900) throw new WorkflowError("VALIDATION", "That task is not in town.");
    m.quest = { id: String(q.id).slice(0, 80), text: String(q.text).slice(0, 300), place: String(q.place).slice(0, 60), x: q.x, z: q.z, r: Math.max(4, Math.min(20, Number(q.r) || 8)), reward: Math.max(0, Math.min(20, Math.round(Number(q.reward) || 0))) };
  }
  await save(user, npc, m);
  return m;
}

// The task is done when the person stands at its place (the browser reports where they are; the place and the
// radius are the ones stored with the task).
export async function npcQuestDone(user: AppUser, npc: string, at: { x: number; z: number }) {
  const m = await npcMemory(user, npc);
  const q = m.quest;
  if (!q) throw new WorkflowError("VALIDATION", "There is no task from this person.");
  if (Math.hypot(Number(at.x) - q.x, Number(at.z) - q.z) > q.r + 2) throw new WorkflowError("VALIDATION", `Go to ${q.place} first.`);
  m.quest = null;
  m.done++;
  m.relation = Math.min(100, m.relation + 10);
  await save(user, npc, m);
  const { playReward } = await import("./fun-shop");
  const paid = await playReward(user, "quest", q.reward).catch(() => ({ coins: 0, left: 0 }));
  return { memory: m, coins: paid.coins, quest: q };
}
