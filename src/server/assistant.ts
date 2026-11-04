// The assistant on the server (Phase 13): Admin's setup (flows off per role, extra keywords, short answers), the
// pickers a "do" flow needs (taken from the app, with the same permission checks as the pages), and monitoring
// (how often each flow starts and finishes, where people give up, what matched nothing).

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { homeDepartment } from "./nav";
import { flowHome } from "./dept-flow";
import { leaveTypes } from "./leave";
import { routinesOpen } from "./routines";
import { deptPeople, myDepartments } from "./departments";
import { myEmployeeId } from "./hr";
import { stateOf } from "./attendance";
import { DEFAULT_ASSISTANT, FLOWS, flowsFor, type AssistantConfig } from "@/lib/assistant";
import { STAGES } from "@/lib/domain";

export async function assistantConfig(): Promise<AssistantConfig> {
  const v = parseJson<Partial<AssistantConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant'"))?.value, {});
  return { off: v.off ?? {}, keywords: v.keywords ?? {}, answers: Array.isArray(v.answers) ? v.answers : DEFAULT_ASSISTANT.answers };
}

export async function saveAssistantConfig(user: AppUser, input: AssistantConfig) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the assistant.");
  const keys = new Set(FLOWS.map((f) => f.key));
  const words = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => String(x).trim().toLowerCase().slice(0, 60)).filter(Boolean).slice(0, 40);
  const cfg: AssistantConfig = {
    off: Object.fromEntries(Object.entries(input.off ?? {}).filter(([k]) => keys.has(k)).map(([k, v]) => [k, (Array.isArray(v) ? v : []).map(String).slice(0, 30)])),
    keywords: Object.fromEntries(Object.entries(input.keywords ?? {}).filter(([k]) => keys.has(k)).map(([k, v]) => [k, words(v)])),
    answers: (input.answers ?? [])
      .map((a) => ({ q: String(a.q ?? "").trim().slice(0, 200), words: words(a.words), a: String(a.a ?? "").trim().slice(0, 1500) }))
      .filter((a) => a.q && a.a)
      .slice(0, 100),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(cfg),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.assistant", summary: `${user.name} changed the assistant setup` });
}

// Per role (Admin, Assistant, Roles): AI answers, voice, routines, which actions the AI may prepare (null: all),
// the suggestion chips shown first, and a daily limit for AI questions (null: Admin's general limit).
// agent: whether the role may switch the assistant to Agent mode (it then does the allowed actions itself).
export type RoleOptions = { ai: boolean; voice: boolean; routines: boolean; agent: boolean; actions: string[] | null; suggestions: string[]; dailyLimit: number | null };
export const DEFAULT_ROLE_OPTIONS: RoleOptions = { ai: true, voice: true, routines: true, agent: true, actions: null, suggestions: [], dailyLimit: null };

export async function allRoleOptions(): Promise<Record<string, RoleOptions>> {
  return parseJson<Record<string, RoleOptions>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.assistant.roles'"))?.value, {});
}
export async function roleOptions(role: string): Promise<RoleOptions> {
  return { ...DEFAULT_ROLE_OPTIONS, ...((await allRoleOptions())[role] ?? {}) };
}
export async function saveRoleOptions(user: AppUser, input: Record<string, Partial<RoleOptions>>) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up the assistant.");
  const out: Record<string, RoleOptions> = {};
  for (const [role, o] of Object.entries(input ?? {}).slice(0, 40)) {
    if (!/^[a-z_]{2,30}$/.test(role)) continue;
    out[role] = {
      ai: o.ai !== false,
      voice: o.voice !== false,
      routines: o.routines !== false,
      agent: o.agent !== false,
      actions: Array.isArray(o.actions) ? o.actions.map(String).filter((x) => /^[a-z_]{2,40}$/.test(x)).slice(0, 60) : null,
      suggestions: (Array.isArray(o.suggestions) ? o.suggestions : []).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 8),
      dailyLimit: o.dailyLimit === null || o.dailyLimit === undefined || String(o.dailyLimit) === "" ? null : Math.max(0, Math.min(1000, Math.round(Number(o.dailyLimit)))),
    };
  }
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.assistant.roles', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(out),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.assistant.roles", summary: `${user.name} changed the assistant's options per role` });
}

// Who the person is, for choosing their flows.
export async function assistantContext(user: AppUser & { activeRole: string }) {
  const home = await homeDepartment(user);
  const production = (STAGES as readonly string[]).includes(user.activeRole);
  const lead = user.leads.length > 0 || !!home?.seeAll || can(user, "users.manage");
  const who = { role: user.activeRole, lead, department: !!home, production, hr: can(user, "attendance.manage"), finance: can(user, "finance.access"), admin: can(user, "users.manage") };
  const cfg = await assistantConfig();
  const options = await roleOptions(user.activeRole);
  const routines = options.routines && (await routinesOpen(user));
  // The pages this person can open (by name), so typed and spoken "open ..." only go there.
  const places = (await (await import("./page-access")).placesFor(user, home?.base ?? null)).map((p) => p.name);
  return { who, home: home ? { key: home.key, base: home.base, title: home.title, kind: home.kind } : null, flows: flowsFor(who, cfg), cfg, options, routines, places };
}
export type AssistantContext = Awaited<ReturnType<typeof assistantContext>>;

// The pickers a "do" flow needs.
export async function assistantData(user: AppUser & { activeRole: string }, flow: string) {
  const ctx = await assistantContext(user);
  if (!ctx.flows.some((f) => f.key === flow)) throw new WorkflowError("FORBIDDEN", "This is not open to you.");
  if (flow === "do.leave") return { types: (await leaveTypes()).map((t) => ({ key: t.key, label: t.label })) };
  // A task in any department the person may add to (not the Studio, which has its own kinds of work).
  if (flow === "do.task") {
    const ds = (await myDepartments(user)).filter((d) => !d.readOnly && d.dept !== "studio");
    return {
      depts: await Promise.all(
        ds.map(async (d) => ({ id: d.dept, label: d.title, people: (await deptPeople(d.dept)).map((p) => ({ id: p.id, label: p.id === user.id ? `${p.name} (me)` : p.name })) })),
      ),
    };
  }
  if (flow === "do.checkin") {
    const emp = await myEmployeeId(user);
    if (!emp) throw new WorkflowError("NOT_FOUND", "You do not have an HR record yet. Ask HR to add you.");
    const s = await stateOf(emp);
    return { state: s.state, since: s.since };
  }
  if (!ctx.home || ctx.home.kind !== "work") throw new WorkflowError("INVALID_STATE", "This works in a department with a flow.");
  const h = await flowHome(user, ctx.home.key);
  if (!h) throw new WorkflowError("INVALID_STATE", "Your department does not use a flow yet (Configure, Flow).");
  if (flow === "do.start") return { dept: ctx.home.key, tasks: h.mine.filter((c) => c.state === "todo").map((c) => ({ id: c.id, label: `${c.code} ${c.title}`, note: c.note })) };
  if (flow === "do.assign")
    return {
      dept: ctx.home.key,
      tasks: (h.desk?.assign ?? []).map((c) => ({ id: c.id, label: `${c.code} ${c.title}` })),
      people: (h.desk?.people ?? []).map((p) => ({ id: p.id, label: `${p.name} (${p.todo + p.working} open)` })),
    };
  throw new WorkflowError("NOT_FOUND", "Unknown flow.");
}

// Monitoring: started, finished, given up (with the step), and typed text that matched nothing.
export async function logAssistant(user: AppUser & { activeRole: string }, e: { flow?: string | null; event: "start" | "finish" | "abandon" | "nomatch" | "show" | "voice"; step?: number | null; text?: string | null }) {
  if (!["start", "finish", "abandon", "nomatch", "show", "voice"].includes(e.event)) return;
  await run(
    "INSERT INTO assistant_events (id, user_id, role, flow, event, step, text, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    uid("ase_"),
    user.id,
    user.activeRole,
    e.flow?.slice(0, 40) ?? null,
    e.event,
    e.step ?? null,
    e.text?.slice(0, 200) ?? null,
    nowIso(),
  );
}

export async function assistantStats(user: AppUser, weeks = 8) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees this.");
  const since = new Date(Date.now() - weeks * 7 * 864e5).toISOString();
  const rows = await all<{ flow: string | null; event: string; role: string; step: number | null; text: string | null; at: string }>("SELECT flow, event, role, step, text, at FROM assistant_events WHERE at >= ? ORDER BY at DESC LIMIT 20000", since);
  const flows = FLOWS.map((f) => {
    const of = rows.filter((r) => r.flow === f.key);
    const started = of.filter((r) => r.event === "start" || r.event === "show").length;
    const finished = of.filter((r) => r.event === "finish").length;
    const gaveUp = of.filter((r) => r.event === "abandon");
    const steps = new Map<number, number>();
    for (const g of gaveUp) steps.set(Number(g.step ?? 0), (steps.get(Number(g.step ?? 0)) ?? 0) + 1);
    return { key: f.key, title: f.title, started, finished, gaveUp: gaveUp.length, worstStep: [...steps.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null, roles: [...new Set(of.map((r) => r.role))] };
  });
  const week = (iso: string) => {
    const d = new Date(iso);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  };
  const byWeek = new Map<string, number>();
  for (const r of rows) if (r.event === "start" || r.event === "show") byWeek.set(week(r.at), (byWeek.get(week(r.at)) ?? 0) + 1);
  const unmatched = new Map<string, number>();
  for (const r of rows) if (r.event === "nomatch" && r.text) unmatched.set(r.text.toLowerCase(), (unmatched.get(r.text.toLowerCase()) ?? 0) + 1);
  return {
    flows,
    weeks: [...byWeek.entries()].sort().map(([w, n]) => ({ week: w, started: n })),
    unmatched: [...unmatched.entries()].sort((x, y) => y[1] - x[1]).slice(0, 50).map(([text, n]) => ({ text, n })),
    total: rows.length,
  };
}
export type AssistantStats = Awaited<ReturnType<typeof assistantStats>>;
