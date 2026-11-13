import { all, get, nowIso, run, tx, uid } from "./db";
import { getMeta, setMeta } from "./settings";
import { can, hasRole, isLeadOf, type AppUser } from "./users";
import { audit, assignStage, WorkflowError } from "./workflow";
import { myDepartments } from "./departments";
import { listTasks } from "./work";
import { notify } from "./notifications";
import { deptPath } from "@/lib/work";
import { STAGE_LABELS, STAGES, type Stage } from "@/lib/domain";

// My work (Update 1.0): taking several waiting parts at once under Admin's rules, the requests leads approve when
// team members take work, and the tasks assigned to the person in every department, for the table view.

export type TakeRule = { maxPerTake: number; maxOpen: number; members: boolean; leadApproval: boolean };
export type TakeRules = TakeRule & { stages: Partial<Record<Stage, Partial<TakeRule>>> };

const num = (v: unknown, d: number, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && v !== null && v !== "" ? Math.min(hi, Math.max(lo, n)) : d;
};
const isAdmin = (u: AppUser) => u.roles.includes("admin") || can(u, "users.manage");
const isLeadFor = (u: AppUser, s: Stage) => can(u, "items.plan") || isLeadOf(u, s);

function clean(r: Partial<TakeRule>, d: TakeRule): TakeRule {
  return { maxPerTake: num(r.maxPerTake, d.maxPerTake, 1, 200), maxOpen: num(r.maxOpen, d.maxOpen, 0, 500), members: r.members === undefined ? d.members : !!r.members, leadApproval: r.leadApproval === undefined ? d.leadApproval : !!r.leadApproval };
}

export async function takeRules(): Promise<TakeRules> {
  let raw: Partial<TakeRules> = {};
  try {
    raw = JSON.parse((await getMeta("work.take")) ?? "{}");
  } catch {
    raw = {};
  }
  // The older single limit stays the default for most per take.
  const legacy = Number(await getMeta("myWorkTakeLimit"));
  const base = clean(raw, { maxPerTake: Number.isFinite(legacy) && legacy > 0 ? Math.min(200, legacy) : 20, maxOpen: 0, members: false, leadApproval: true });
  const stages: TakeRules["stages"] = {};
  for (const s of STAGES) {
    const o = raw.stages?.[s];
    if (!o) continue;
    const kept: Partial<TakeRule> = {};
    if (o.maxPerTake !== undefined && o.maxPerTake !== null) kept.maxPerTake = num(o.maxPerTake, base.maxPerTake, 1, 200);
    if (o.maxOpen !== undefined && o.maxOpen !== null) kept.maxOpen = num(o.maxOpen, base.maxOpen, 0, 500);
    if (o.members !== undefined) kept.members = !!o.members;
    if (o.leadApproval !== undefined) kept.leadApproval = !!o.leadApproval;
    if (Object.keys(kept).length) stages[s] = kept;
  }
  return { ...base, stages };
}

export async function rulesFor(stage: Stage): Promise<TakeRule> {
  const r = await takeRules();
  return { ...r, ...(r.stages[stage] ?? {}) } as TakeRule;
}

export async function saveTakeRules(user: AppUser, input: Partial<TakeRules>) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets the rules for taking work.");
  const cur = await takeRules();
  const base = clean(input, cur);
  const stages: TakeRules["stages"] = input.stages === undefined ? cur.stages : {};
  if (input.stages)
    for (const s of STAGES) {
      const o = input.stages[s];
      if (!o) continue;
      const kept: Partial<TakeRule> = {};
      if (o.maxPerTake !== undefined && o.maxPerTake !== null && String(o.maxPerTake) !== "") kept.maxPerTake = num(o.maxPerTake, base.maxPerTake, 1, 200);
      if (o.maxOpen !== undefined && o.maxOpen !== null && String(o.maxOpen) !== "") kept.maxOpen = num(o.maxOpen, base.maxOpen, 0, 500);
      if (o.members !== undefined && o.members !== null) kept.members = !!o.members;
      if (o.leadApproval !== undefined && o.leadApproval !== null) kept.leadApproval = !!o.leadApproval;
      if (Object.keys(kept).length) stages[s] = kept;
    }
  const next: TakeRules = { ...base, stages };
  await setMeta("work.take", JSON.stringify(next));
  await setMeta("myWorkTakeLimit", String(next.maxPerTake));
  await audit({ actor: user }, { action: "settings.my_work", summary: `${user.name} set the rules for taking work: up to ${next.maxPerTake} per take, ${next.maxOpen ? `${next.maxOpen} open at once` : "no open limit"}, team members ${next.members ? (next.leadApproval ? "take with lead approval" : "take directly") : "do not take"}`, newValue: next });
  return next;
}

export async function takeLimit() {
  return (await takeRules()).maxPerTake;
}

export async function setTakeLimit(user: AppUser, n: number) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets how many parts one person takes at once.");
  return (await saveTakeRules(user, { maxPerTake: n })).maxPerTake;
}

// Open parts the person holds in a stage, plus their takes still waiting for the lead.
export async function openCount(userId: string, stage: Stage) {
  const a = await get<{ c: number }>(
    "SELECT COUNT(*) AS c FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.lifecycle = 'in_production' AND a.stage = ? AND a.owner_id = ? AND a.status IN ('queued','in_progress','paused','blocked')",
    stage,
    userId,
  );
  const p = await get<{ c: number }>("SELECT COUNT(*) AS c FROM take_requests WHERE stage = ? AND user_id = ? AND status = 'pending'", stage, userId);
  return Number(a?.c ?? 0) + Number(p?.c ?? 0);
}

// The stages where this person may take work, with the rules that apply there.
export async function takeStages(user: AppUser) {
  const out: { stage: Stage; lead: boolean; rule: TakeRule; open: number }[] = [];
  for (const s of STAGES) {
    const lead = isLeadOf(user, s) || (can(user, "items.plan") && user.leads.includes(s));
    const rule = await rulesFor(s);
    if (lead || (rule.members && hasRole(user, s))) out.push({ stage: s, lead, rule, open: await openCount(user.id, s) });
  }
  return out;
}

type TakeResult = { id: string; code: string; ok: boolean; pending?: boolean; error?: string };

// Each part is checked in its own transaction: still waiting with nobody on it, the person may take in that stage,
// within the most per take and the most open at once. Members' takes wait for the lead when Admin says so.
export async function takeParts(user: AppUser, parts: { id: string; stage: Stage }[]) {
  const list = parts.filter((p) => p && typeof p.id === "string" && STAGES.includes(p.stage));
  if (!list.length) throw new WorkflowError("VALIDATION", "Choose the parts to take.");
  const byStage = new Map<Stage, string[]>();
  for (const p of list) byStage.set(p.stage, [...(byStage.get(p.stage) ?? []), p.id]);
  const results: TakeResult[] = [];
  const leadsToTell = new Map<Stage, number>();
  for (const [stage, ids] of byStage) {
    const rule = await rulesFor(stage);
    const lead = isLeadFor(user, stage);
    const member = rule.members && hasRole(user, stage);
    if (ids.length > rule.maxPerTake) throw new WorkflowError("VALIDATION", `Take at most ${rule.maxPerTake} ${STAGE_LABELS[stage]} parts at once (Admin sets this).`);
    let open = await openCount(user.id, stage);
    for (const id of ids) {
      const item = await get<{ code: string }>("SELECT code FROM items WHERE id = ?", id);
      if (!item) continue;
      const r: TakeResult = { id, code: item.code, ok: false };
      results.push(r);
      if (!lead && !member) {
        r.error = "Not a stage you can take work in";
        continue;
      }
      if (rule.maxOpen && open >= rule.maxOpen) {
        r.error = `You already have ${open} open in ${STAGE_LABELS[stage]}; Admin allows ${rule.maxOpen}`;
        continue;
      }
      try {
        await tx(async () => {
          const free = await get<{ owner_id: string | null; status: string; stage: string }>(
            "SELECT a.owner_id, a.status, a.stage FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id = ? FOR UPDATE OF a",
            id,
          );
          if (!free || free.stage !== stage || free.status !== "queued" || free.owner_id) throw new WorkflowError("INVALID_STATE", free?.owner_id === user.id ? "Already yours" : "Someone else has it now");
          if (!lead && rule.leadApproval) {
            if (await get("SELECT 1 FROM take_requests WHERE item_id = ? AND stage = ? AND status = 'pending'", id, stage)) throw new WorkflowError("INVALID_STATE", "Someone already asked for it");
            await run("INSERT INTO take_requests (id, item_id, stage, user_id, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", uid("tk_"), id, stage, user.id, nowIso());
            r.pending = true;
          } else await assignStage({ actor: user, source: "bulk" }, id, { stage, userId: user.id, reason: "Took it myself", selfTake: !lead });
        });
        r.ok = true;
        open++;
        if (r.pending) leadsToTell.set(stage, (leadsToTell.get(stage) ?? 0) + 1);
      } catch (e) {
        r.error = e instanceof Error ? e.message : String(e);
      }
    }
  }
  for (const [stage, n] of leadsToTell) {
    const leads = (await all<{ user_id: string }>("SELECT user_id FROM team_leads WHERE stage = ?", stage)).map((l) => l.user_id);
    await notify(leads, { type: "assignment", title: `${user.name} wants to take ${n} ${STAGE_LABELS[stage]} part${n === 1 ? "" : "s"}`, body: "Approve or decline on My work.", link: "/my-work?tab=production", dedupeKey: `take:${user.id}:${stage}:${new Date().toISOString().slice(0, 13)}` }, nowIso(), user.id);
  }
  return results;
}

export type TakeRequest = { id: string; itemId: string; code: string; title: string; stage: Stage; userId: string; userName: string; createdAt: string };

// Takes waiting for this lead, in the stages they lead.
export async function takeRequestsFor(user: AppUser): Promise<TakeRequest[]> {
  const stages = STAGES.filter((s) => isLeadFor(user, s));
  if (!stages.length) return [];
  return (
    await all<{ id: string; item_id: string; code: string; title: string; stage: Stage; user_id: string; user_name: string; created_at: string }>(
      `SELECT r.id, r.item_id, i.code, i.title, r.stage, r.user_id, u.name AS user_name, r.created_at FROM take_requests r JOIN items i ON i.id = r.item_id LEFT JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending' AND r.stage IN (${stages.map(() => "?").join(",")}) ORDER BY r.created_at LIMIT 200`,
      ...stages,
    )
  ).map((r) => ({ id: r.id, itemId: r.item_id, code: r.code, title: r.title, stage: r.stage, userId: r.user_id, userName: r.user_name ?? "Someone", createdAt: r.created_at }));
}

export async function myTakeRequests(user: AppUser) {
  return await all<{ id: string; code: string; title: string; stage: Stage; created_at: string }>(
    "SELECT r.id, i.code, i.title, r.stage, r.created_at FROM take_requests r JOIN items i ON i.id = r.item_id WHERE r.user_id = ? AND r.status = 'pending' ORDER BY r.created_at",
    user.id,
  );
}

export async function decideTakes(user: AppUser, ids: string[], approve: boolean, note?: string) {
  const out: { id: string; ok: boolean; error?: string }[] = [];
  const told = new Map<string, number>();
  for (const id of ids.slice(0, 200)) {
    const r = await get<{ id: string; item_id: string; stage: Stage; user_id: string; status: string }>("SELECT id, item_id, stage, user_id, status FROM take_requests WHERE id = ?", id);
    if (!r || r.status !== "pending") {
      out.push({ id, ok: false, error: "Already decided" });
      continue;
    }
    if (!isLeadFor(user, r.stage)) {
      out.push({ id, ok: false, error: `Only the ${STAGE_LABELS[r.stage]} lead decides` });
      continue;
    }
    try {
      await tx(async () => {
        if (approve) {
          const free = await get<{ owner_id: string | null; status: string; stage: string }>("SELECT a.owner_id, a.status, a.stage FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id = ?", r.item_id);
          if (!free || free.stage !== r.stage || free.status !== "queued" || free.owner_id) throw new WorkflowError("INVALID_STATE", "The part is no longer waiting");
          await assignStage({ actor: user, source: "bulk" }, r.item_id, { stage: r.stage, userId: r.user_id, reason: "Lead approved their take" });
        }
        await run("UPDATE take_requests SET status = ?, decided_by = ?, decided_at = ?, note = ? WHERE id = ?", approve ? "approved" : "declined", user.id, nowIso(), note ?? null, r.id);
      });
      out.push({ id, ok: true });
      told.set(r.user_id, (told.get(r.user_id) ?? 0) + 1);
    } catch (e) {
      await run("UPDATE take_requests SET status = 'declined', decided_by = ?, decided_at = ?, note = ? WHERE id = ? AND status = 'pending'", user.id, nowIso(), e instanceof Error ? e.message : "Not available", r.id);
      out.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  for (const [uidTo, n] of told)
    await notify([uidTo], { type: "assignment", title: approve ? `${user.name} approved ${n} part${n === 1 ? "" : "s"} for you` : `${user.name} declined ${n} of your takes`, body: note ?? (approve ? "They are on your work now." : ""), link: "/my-work?tab=production" }, nowIso(), user.id);
  return out;
}

export type MyTask = { id: string; code: string; title: string; dept: string; deptTitle: string; status: string; statusCategory: string; priority: string; due: string | null; project: string | null; href: string };

// Open tasks assigned to this person in every department they can open.
export async function myDeptTasks(user: AppUser): Promise<MyTask[]> {
  const out: MyTask[] = [];
  for (const d of await myDepartments(user).catch(() => [])) {
    if (d.dept === "production") continue;
    try {
      const { tasks } = await listTasks(user, d.dept, { assignee: "me", open: true, sort: "due", dir: "asc" });
      for (const t of tasks.slice(0, 200))
        out.push({ id: t.id, code: t.code, title: t.title, dept: d.dept, deptTitle: d.title, status: t.status, statusCategory: t.status_category, priority: t.priority, due: t.due_date ?? null, project: t.project_name, href: `${deptPath(d.dept)}/list?task=${t.id}` });
    } catch {
      // A department without tasks for this person.
    }
  }
  return out;
}

// Saved table views on My work (columns, grouping, sort and filters), the person's own or shared by a manager.
export type MyWorkView = { id: string; name: string; shared: boolean; mine: boolean; config: Record<string, unknown> };
export async function myWorkViews(user: AppUser, page: string): Promise<MyWorkView[]> {
  return (
    await all<{ id: string; name: string; shared: number; owner_id: string; config: string }>(
      "SELECT id, name, shared, owner_id, config FROM saved_views WHERE page = ? AND (owner_id = ? OR shared = 1) ORDER BY shared DESC, lower(name)",
      page,
      user.id,
    )
  ).map((v) => {
    let config: Record<string, unknown> = {};
    try {
      config = JSON.parse(v.config);
    } catch {
      config = {};
    }
    return { id: v.id, name: v.name, shared: !!v.shared, mine: v.owner_id === user.id, config };
  });
}
