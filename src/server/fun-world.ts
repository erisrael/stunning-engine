import { all, get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";
import { funConfig, funFor } from "./fun";
import { getSettings } from "./settings";
import { localParts } from "@/lib/attendance";

// Seed Town: the 3D world in Fun mode. People walk around as blocky characters they design, chat in bubbles and wave.
// Every colleague also has a desk in their department's workspace and a home: at the desk while working, at home when
// away. Above each head: a status ring and a bar that fills with the day's progress. Who is absent shows only to the
// people Admin chose (HR by default). The live room is kept in memory (positions are tiny and short-lived); only
// avatars are stored.

export type Look = { skin: string; shirt: string; pants: string; hair: string; hat: "none" | "cap" | "crown" | "beanie" | "halo" | "horns"; face: "smile" | "cool" | "wink" | "calm" };
export const DEFAULT_LOOK: Look = { skin: "#f2c9a0", shirt: "#4f46e5", pants: "#1f2937", hair: "#2b1b0e", hat: "none", face: "smile" };
const HEX = /^#[0-9a-f]{6}$/i;
const HATS = ["none", "cap", "crown", "beanie", "halo", "horns"];
const FACES = ["smile", "cool", "wink", "calm"];

export function cleanLook(l: Partial<Look> | null | undefined): Look {
  const c = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  return {
    skin: c(l?.skin, DEFAULT_LOOK.skin),
    shirt: c(l?.shirt, DEFAULT_LOOK.shirt),
    pants: c(l?.pants, DEFAULT_LOOK.pants),
    hair: c(l?.hair, DEFAULT_LOOK.hair),
    hat: (HATS.includes(String(l?.hat)) ? l!.hat : "none") as Look["hat"],
    face: (FACES.includes(String(l?.face)) ? l!.face : "smile") as Look["face"],
  };
}

async function needWorld(user: AppUser) {
  const c = await funFor(user);
  if (!c || !c.world) throw new WorkflowError("FORBIDDEN", "Admin switched Seed Town off.");
  return c;
}

export async function myLook(user: AppUser): Promise<Look> {
  const r = await get<{ look: string }>("SELECT look FROM fun_avatars WHERE user_id = ?", user.id);
  return cleanLook(parseJson<Partial<Look>>(r?.look ?? "{}", {}));
}
export async function saveLook(user: AppUser, look: Partial<Look>) {
  await needWorld(user);
  const l = cleanLook(look);
  await run("INSERT INTO fun_avatars (user_id, look, updated_at) VALUES (?, ?, ?) ON CONFLICT (user_id) DO UPDATE SET look = excluded.look, updated_at = excluded.updated_at", user.id, JSON.stringify(l), nowIso());
  const p = room.get(user.id);
  if (p) p.look = l;
  return l;
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

type Player = { id: string; name: string; look: Look; x: number; z: number; ry: number; mv: number; at: number; say: string; sayAt: number; emote: string; emoteAt: number; lastSay: number };
const room = new Map<string, Player>();
const STALE = 15_000;

// One step of the conversation with the world: my position (and a chat line or a wave), and everyone else in it.
// Kept small: a few numbers per person, rounded.
export async function sync(user: AppUser, input: { x?: number; z?: number; ry?: number; mv?: number; say?: string; emote?: string }) {
  const c = await needWorld(user);
  const now = Date.now();
  let p = room.get(user.id);
  if (!p) {
    p = { id: user.id, name: user.name, look: await myLook(user), x: 0, z: 8, ry: 0, mv: 0, at: now, say: "", sayAt: 0, emote: "", emoteAt: 0, lastSay: 0 };
    room.set(user.id, p);
  }
  const num = (v: unknown, d: number, lim: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : d);
  p.x = num(input.x, p.x, 120);
  p.z = num(input.z, p.z, 120);
  p.ry = num(input.ry, p.ry, 10);
  p.mv = input.mv ? 1 : 0;
  p.at = now;
  if (input.say && c.worldChat) {
    if (now - p.lastSay < 1500) throw new WorkflowError("VALIDATION", "A little slower.");
    p.say = input.say.replace(/\s+/g, " ").trim().slice(0, 120);
    p.sayAt = now;
    p.lastSay = now;
  }
  if (input.emote && ["wave", "dance", "jump", "cheer"].includes(input.emote)) (p.emote = input.emote), (p.emoteAt = now);
  for (const [id, q] of room) if (now - q.at > STALE) room.delete(id);
  const r = (v: number) => Math.round(v * 100) / 100;
  return {
    t: now,
    p: [...room.values()].filter((q) => q.id !== user.id).map((q) => [q.id, q.name, r(q.x), r(q.z), r(q.ry), q.mv, now - q.sayAt < 7000 ? q.say : "", now - q.emoteAt < 3000 ? q.emote : "", q.look] as const),
  };
}

export async function worldHome(user: AppUser) {
  const c = await needWorld(user);
  return { look: await myLook(user), chat: c.worldChat, name: c.worldName || "Seed Town", ...(await roster(user)) };
}

// For the Admin page: how many are in the world now.
export function worldCount() {
  const now = Date.now();
  return [...room.values()].filter((p) => now - p.at < STALE).length;
}

export async function worldConfigFor() {
  return funConfig();
}
