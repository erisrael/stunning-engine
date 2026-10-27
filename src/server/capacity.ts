import { all, placeholders } from "./db";
import { getSettings } from "./settings";
import { listItems } from "./queries";
import { attemptTimings, mean, median } from "./metrics";
import type { AppUser } from "./users";
import { STAGES, type Role, type Stage } from "@/lib/domain";
import { emptyFilters, type Filters } from "@/lib/filters";

const H = 3600e3;
const WEEK = 7 * 864e5;

export async function capacityData(user: AppUser, filters: Filters, nowIso: string) {
  const s = await getSettings();
  const now = new Date(nowIso).getTime();
  const { rows } = await listItems(user, { ...emptyFilters(), g: filters.g, s: filters.s, life: ["draft", "in_production", "published"] }, nowIso, { all: true });
  const live = rows.filter((r) => r.provenance !== "historical");
  const ids = live.map((r) => r.id);
  const attemptIds: string[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const c = ids.slice(i, i + 500);
    attemptIds.push(...(await all<{ id: string }>(`SELECT id FROM stage_attempts WHERE item_id IN (${placeholders(c.length)})`, ...c)).map((r) => r.id));
  }
  const timings = await attemptTimings(attemptIds, nowIso);
  const since8 = now - 8 * WEEK;
  const since4 = now - 4 * WEEK;

  // Observed labor per completed stage, including rework attempts attributed to the item.
  const laborPerItem: Record<Stage, number | null> = {} as never;
  const sample: Record<Stage, number> = {} as never;
  for (const st of STAGES) {
    const done = timings.filter((t) => t.stage === st && t.completedAt && new Date(t.completedAt).getTime() >= since8);
    const byItem = new Map<string, number>();
    for (const t of timings.filter((t) => t.stage === st && t.closedAt && new Date(t.closedAt).getTime() >= since8)) byItem.set(t.itemId, (byItem.get(t.itemId) ?? 0) + t.labor);
    const perItem = done.map((t) => byItem.get(t.itemId) ?? t.labor).filter((x) => x > 0);
    laborPerItem[st] = perItem.length ? (mean(perItem) ?? 0) / H : null;
    sample[st] = perItem.length;
  }

  const arrivalsPerWeek = live.filter((r) => r.released_at && new Date(r.released_at).getTime() >= since4).length / 4;
  const plannedNext4 = live.filter((r) => r.lifecycle === "draft" && r.current_due_at && new Date(r.current_due_at).getTime() < now + 4 * WEEK).length;

  // Staff capacity, leave and workload
  const users = await all<{ id: string; name: string; title: string | null }>("SELECT id, name, title FROM users WHERE active = 1 ORDER BY name");
  const roles = await all<{ user_id: string; role: Role }>("SELECT user_id, role FROM role_assignments");
  const caps = await all<{ user_id: string; stage: Stage; hours_per_week: number }>("SELECT user_id, stage, hours_per_week FROM user_capacity");
  const leave = await all<{ id: number; user_id: string; starts_on: string; ends_on: string; note: string | null }>("SELECT * FROM leave_entries WHERE ends_on >= ? ORDER BY starts_on", new Date(now - 864e5).toISOString().slice(0, 10));
  const workdaysPerWeek = s.calendar.workdays.length || 5;
  const leaveDaysNext4 = (uid: string) => {
    let days = 0;
    const horizon = new Date(now + 4 * WEEK).toISOString().slice(0, 10);
    const today = new Date(now).toISOString().slice(0, 10);
    for (const l of leave.filter((x) => x.user_id === uid)) {
      const from = l.starts_on > today ? l.starts_on : today;
      const to = l.ends_on < horizon ? l.ends_on : horizon;
      for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d = new Date(d.getTime() + 864e5))
        if (s.calendar.workdays.includes(d.getUTCDay())) days++;
    }
    return days;
  };
  const sessions = await all<{ user_id: string; started_at: string; ended_at: string | null; attempt_id: string }>(
      "SELECT user_id, started_at, ended_at, attempt_id FROM work_sessions WHERE started_at >= ?",
      new Date(since4).toISOString(),
    );
  const openRows = live.filter((r) => r.lifecycle === "in_production" && r.stage);
  const team = users
    .map((u) => {
      const ur = roles.filter((r) => r.user_id === u.id).map((r) => r.role);
      const capByStage = Object.fromEntries(caps.filter((c) => c.user_id === u.id).map((c) => [c.stage, c.hours_per_week])) as Partial<Record<Stage, number>>;
      const weekly = Object.values(capByStage).reduce((a, b) => a + (b ?? 0), 0);
      const leaveDays = leaveDaysNext4(u.id);
      const available4 = Math.max(0, weekly * 4 - (weekly / workdaysPerWeek) * leaveDays);
      const owned = openRows.filter((r) => r.stages[r.stage!].ownerId === u.id);
      const remaining = owned.reduce((acc, r) => {
        const st = r.stage!;
        const t = timings.find((x) => x.attemptId === r.stages[st].attemptId);
        const est = laborPerItem[st] ?? 0;
        return acc + Math.max(est * 0.15, est - (t ? t.labor / H : 0));
      }, 0);
      const logged = sessions.filter((x) => x.user_id === u.id).reduce((a, x) => a + ((x.ended_at ? new Date(x.ended_at).getTime() : now) - new Date(x.started_at).getTime()), 0) / H;
      return {
        id: u.id,
        name: u.name,
        title: u.title,
        roles: ur,
        capacity: capByStage,
        weekly,
        leaveDays,
        available4,
        owned: owned.length,
        ownedByStage: Object.fromEntries(STAGES.map((st) => [st, owned.filter((r) => r.stage === st).length])) as Record<Stage, number>,
        remaining,
        logged4: logged,
        utilization: weekly ? logged / (weekly * 4) : null,
        blocked: owned.filter((r) => r.stage_status === "blocked").length,
      };
    })
    .filter((u) => u.roles.some((r) => r !== "manager") || u.weekly > 0);

  const stages = STAGES.map((st) => {
    const open = openRows.filter((r) => r.stage === st);
    const people = team.filter((u) => (u.capacity[st] ?? 0) > 0);
    const availableWeek = people.reduce((a, u) => a + (u.capacity[st] ?? 0) * (1 - u.leaveDays / (4 * workdaysPerWeek)), 0);
    const ages = open.map((r) => (r.stage_entered_at ? now - new Date(r.stage_entered_at).getTime() : 0));
    const completions4 = timings.filter((t) => t.stage === st && t.status === "completed" && t.completedAt && new Date(t.completedAt).getTime() >= since4).length / 4;
    const entered4 = timings.filter((t) => t.stage === st && t.cause === "initial" && new Date(t.enteredAt).getTime() >= since4).length / 4;
    return {
      stage: st,
      laborPerItem: laborPerItem[st],
      sample: sample[st],
      backlog: open.length,
      blocked: open.filter((r) => r.stage_status === "blocked").length,
      waiting: open.filter((r) => r.stage_status === "awaiting_handoff").length,
      medianAgeDays: ages.length ? (median(ages) ?? 0) / 864e5 : 0,
      people: people.length,
      availableWeek,
      completionsPerWeek: completions4,
      arrivalsPerWeek: entered4,
    };
  });

  const corrections = await all<{ id: string; session_id: string; requested_by: string; proposed_started_at: string; proposed_ended_at: string; reason: string; status: string; created_at: string; started_at: string; ended_at: string | null; item_id: string; code: string; decided_by: string | null; decided_at: string | null }>(
      `SELECT c.*, ws.started_at, ws.ended_at, ws.item_id, i.code FROM session_corrections c JOIN work_sessions ws ON ws.id = c.session_id JOIN items i ON i.id = ws.item_id ORDER BY c.status = 'pending' DESC, c.created_at DESC LIMIT 50`,
    );

  return { stages, team, arrivalsPerWeek, plannedNext4, leave, corrections, minSample: s.reporting.minSample };
}

export async function myEffort(userId: string, nowIso: string) {
  const since = new Date(new Date(nowIso).getTime() - 4 * WEEK).toISOString();
  return await all<{ id: string; item_id: string; code: string; title: string; stage: string; started_at: string; ended_at: string | null; end_reason: string | null; corrected_from: string | null }>(
      `SELECT ws.id, ws.item_id, i.code, i.title, a.stage, ws.started_at, ws.ended_at, ws.end_reason, ws.corrected_from FROM work_sessions ws
     JOIN items i ON i.id = ws.item_id JOIN stage_attempts a ON a.id = ws.attempt_id WHERE ws.user_id = ? AND ws.started_at >= ? ORDER BY ws.started_at DESC`,
      userId,
      since,
    );
}

export type CapacityData = Awaited<ReturnType<typeof capacityData>>;
