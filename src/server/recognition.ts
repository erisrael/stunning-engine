// Recognition: a monthly performance score per person, badges and titles, kudos between colleagues, and the
// leaderboard. Admin switches it on (off by default) and sets the weights, who sees what and which badges are given.
//
// The score (0 to 100) is a weighted average of the parts a person has data for:
//   attendance     on-time days out of the working days expected (late counts 0.6, a half day 0.5, absent 0)
//   delivery       work finished (department tasks, production stages, support tickets): 60% on time against the due date, 40% volume
//                  against the median of the same department
//   quality        finished work not sent back (production reviews asking for changes, department tasks returned)
//   collaboration  kudos received and given
// A part without data (no tasks with due dates, no HR record) is left out and the weights of the others count.
// Everyone sees the top of the board and their own place; HR, Admin and owners see everyone, including who needs
// support. Badges are given by fixed rules at the start of each month for the month before; titles by HR or Admin.

import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, listUsers, type AppUser } from "./users";
import { localParts } from "@/lib/attendance";

import { BADGES, DEFAULT_RECOGNITION, KUDOS_VALUES, PARTS, type AwardRow, type BadgeKey, type Part, type RecognitionConfig, type ScoreRow } from "@/lib/recognition";
export { BADGES, DEFAULT_RECOGNITION, KUDOS_VALUES, PARTS, PART_LABELS } from "@/lib/recognition";
export type { AwardRow, BadgeKey, Part, RecognitionConfig, ScoreRow } from "@/lib/recognition";

export async function recognitionConfig(): Promise<RecognitionConfig> {
  const s = parseJson<Partial<RecognitionConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.recognition'"))?.value, {});
  return { ...DEFAULT_RECOGNITION, ...s, weights: { ...DEFAULT_RECOGNITION.weights, ...(s.weights ?? {}) }, badges: { ...DEFAULT_RECOGNITION.badges, ...(s.badges ?? {}) } };
}

export const configures = (u: AppUser) => can(u, "users.manage");
// HR, Admin and owners see the whole board, including who needs support, and give titles.
export const seesAll = (u: AppUser) => can(u, "users.manage") || can(u, "hr.access") || can(u, "owners.view");

export async function saveRecognitionConfig(user: AppUser, input: Partial<RecognitionConfig>) {
  if (!configures(user)) throw new WorkflowError("FORBIDDEN", "Only Admin sets up recognition.");
  const cur = await recognitionConfig();
  const n = (v: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : d);
  const w = { ...cur.weights, ...(input.weights ?? {}) };
  const weights = Object.fromEntries(PARTS.map((p) => [p, n(w[p], DEFAULT_RECOGNITION.weights[p], 0, 100)])) as Record<Part, number>;
  if (!PARTS.some((p) => weights[p] > 0)) throw new WorkflowError("VALIDATION", "Give at least one part a weight.");
  const next: RecognitionConfig = {
    enabled: input.enabled ?? cur.enabled,
    leaderboard: (["everyone", "managers", "off"] as const).includes(input.leaderboard as "everyone") ? input.leaderboard! : cur.leaderboard,
    topN: n(input.topN ?? cur.topN, 10, 3, 100),
    showScores: input.showScores ?? cur.showScores,
    weights,
    badges: Object.fromEntries((Object.keys(BADGES) as BadgeKey[]).map((k) => [k, !!(input.badges?.[k] ?? cur.badges[k])])) as Record<BadgeKey, boolean>,
    kudos: input.kudos ?? cur.kudos,
    kudosPerMonth: n(input.kudosPerMonth ?? cur.kudosPerMonth, 10, 1, 100),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.recognition', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "recognition.settings", summary: `${user.name} ${next.enabled !== cur.enabled ? (next.enabled ? "switched recognition on" : "switched recognition off") : "changed the recognition settings"}`, newValue: next });
  return next;
}

async function needOn() {
  const c = await recognitionConfig();
  if (!c.enabled) throw new WorkflowError("INVALID_STATE", "Recognition is switched off (Admin, Recognition).");
  return c;
}

// ---------------------------------------------------------------------------
// Scores
// ---------------------------------------------------------------------------

const isPeriod = (p: string) => /^\d{4}-\d{2}$/.test(p);
const monthBounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  return { from: `${period}-01T00:00:00.000Z`, to: new Date(Date.UTC(y!, m!, 1)).toISOString() };
};
export const prevPeriod = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 2, 1)).toISOString().slice(0, 7);
};
async function thisPeriod() {
  const tz = (await getSettings()).workspace.timezone;
  return localParts(nowIso(), tz).date.slice(0, 7);
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export async function computeScores(period: string, cfgIn?: RecognitionConfig): Promise<ScoreRow[]> {
  if (!isPeriod(period)) throw new WorkflowError("VALIDATION", "Choose the month.");
  const cfg = cfgIn ?? (await recognitionConfig());
  const { from, to } = monthBounds(period);
  const users = await listUsers();
  const emps = await all<{ id: string; user_id: string; department: string | null }>("SELECT id, user_id, department FROM employees WHERE user_id IS NOT NULL AND status <> 'left'");
  const empOf = new Map(emps.map((e) => [e.user_id, e]));

  // Attendance, from the month's timesheets.
  const { monthSheet } = await import("./attendance");
  const sheet = new Map((await monthSheet(emps.map((e) => e.id), period)).map((r) => [r.employeeId, r.totals]));

  // Delivery: department tasks and production stages finished in the month, and whether by their due date.
  const tasks = await all<{ uid: string; due: string | null; done: string }>(
    "SELECT assignee_id AS uid, due_date AS due, completed_at AS done FROM dept_tasks WHERE assignee_id IS NOT NULL AND status_category = 'done' AND completed_at >= ? AND completed_at < ?",
    from,
    to,
  );
  const stages = await all<{ uid: string; due: string | null; done: string }>(
    `SELECT a.owner_id AS uid, sa.stage_due_at AS due, a.completed_at AS done FROM stage_attempts a LEFT JOIN stage_assignments sa ON sa.item_id = a.item_id AND sa.stage = a.stage
     WHERE a.owner_id IS NOT NULL AND a.completed_at >= ? AND a.completed_at < ?`,
    from,
    to,
  );
  // Customer support: tickets solved in the month count as finished work, on time when within the target.
  const tickets = await all<{ uid: string; due: string | null; done: string }>(
    "SELECT assignee_id AS uid, sla_resolve_due AS due, solved_at AS done FROM sup_tickets WHERE assignee_id IS NOT NULL AND solved_at >= ? AND solved_at < ?",
    from,
    to,
  );
  // Customer ratings of 1 or 2 count as work sent back.
  const lowRatings = await all<{ uid: string; n: number }>("SELECT assignee_id AS uid, COUNT(*) AS n FROM sup_tickets WHERE assignee_id IS NOT NULL AND rating <= 2 AND solved_at >= ? AND solved_at < ? GROUP BY assignee_id", from, to);
  // Quality: reviews asking for changes on a person's stage work; department tasks returned to them.
  const prodReturns = await all<{ uid: string; n: number }>(
    `SELECT a.owner_id AS uid, COUNT(*) AS n FROM handoff_reviews r JOIN stage_attempts a ON a.id = r.attempt_id
     WHERE r.decision = 'changes_requested' AND r.valid = 1 AND r.created_at >= ? AND r.created_at < ? AND a.owner_id IS NOT NULL GROUP BY a.owner_id`,
    from,
    to,
  );
  const taskReturns = await all<{ uid: string; n: number }>(
    `SELECT t.assignee_id AS uid, COUNT(*) AS n FROM dept_task_comments c JOIN dept_tasks t ON t.id = c.task_id
     WHERE (c.body LIKE 'Returned%' OR c.body LIKE 'Bug found%') AND c.created_at >= ? AND c.created_at < ? AND t.assignee_id IS NOT NULL GROUP BY t.assignee_id`,
    from,
    to,
  );
  const kudosIn = await all<{ uid: string; n: number }>("SELECT to_user AS uid, COUNT(*) AS n FROM recog_kudos WHERE created_at >= ? AND created_at < ? GROUP BY to_user", from, to);
  const kudosOut = await all<{ uid: string; n: number }>("SELECT from_user AS uid, COUNT(*) AS n FROM recog_kudos WHERE created_at >= ? AND created_at < ? GROUP BY from_user", from, to);
  const count = (rows: { uid: string; n: number }[]) => new Map(rows.map((r) => [r.uid, Number(r.n)]));
  const [pR, tR, kI, kO, lR] = [count(prodReturns), count(taskReturns), count(kudosIn), count(kudosOut), count(lowRatings)];

  const work = new Map<string, { finished: number; withDue: number; onTime: number }>();
  for (const w of [...tasks, ...stages, ...tickets]) {
    const x = work.get(w.uid) ?? { finished: 0, withDue: 0, onTime: 0 };
    x.finished++;
    if (w.due) {
      x.withDue++;
      // A date-only due date counts until the end of that day.
      const dueAt = /^\d{4}-\d{2}-\d{2}$/.test(w.due) ? `${w.due}T23:59:59.999Z` : w.due;
      if (w.done <= dueAt) x.onTime++;
    }
    work.set(w.uid, x);
  }
  const deptOf = (u: { id: string; roles: string[] }) => empOf.get(u.id)?.department ?? u.roles[0] ?? null;
  const peers = new Map<string, number[]>();
  for (const u of users) {
    const d = deptOf(u) ?? "-";
    peers.set(d, [...(peers.get(d) ?? []), work.get(u.id)?.finished ?? 0]);
  }

  const prev = new Map((await all<{ user_id: string; score: number }>("SELECT user_id, score FROM recog_scores WHERE period = ?", prevPeriod(period))).map((r) => [r.user_id, Number(r.score)]));
  const rows: ScoreRow[] = [];
  for (const u of users) {
    const e = empOf.get(u.id);
    const t = e ? sheet.get(e.id) : undefined;
    const w = work.get(u.id) ?? { finished: 0, withDue: 0, onTime: 0 };
    const returns = (pR.get(u.id) ?? 0) + (tR.get(u.id) ?? 0) + (lR.get(u.id) ?? 0);
    const kudos = kI.get(u.id) ?? 0;
    const parts: Partial<Record<Part, number>> = {};
    const workdays = t ? t.present + t.late + t.halfDays + t.absent : 0;
    if (t && workdays > 0) parts.attendance = Math.round((100 * (t.present + 0.6 * t.late + 0.5 * t.halfDays)) / workdays);
    if (w.finished > 0) {
      const med = median((peers.get(deptOf(u) ?? "-") ?? []).filter((x) => x > 0));
      const vol = Math.min(1, w.finished / Math.max(1, med));
      const onTime = w.withDue ? w.onTime / w.withDue : 1;
      parts.delivery = Math.round(100 * (0.6 * onTime + 0.4 * vol));
      parts.quality = Math.round(Math.max(0, 100 * (1 - returns / w.finished)));
    }
    if (cfg.kudos) parts.collaboration = Math.min(100, 40 + 15 * kudos + 5 * Math.min(4, kO.get(u.id) ?? 0));
    // Only kudos is not enough to be ranked: a person needs attendance or finished work.
    if (parts.attendance === undefined && parts.delivery === undefined) continue;
    let sum = 0;
    let wsum = 0;
    for (const p of PARTS) {
      const v = parts[p];
      if (v === undefined || !cfg.weights[p]) continue;
      sum += v * cfg.weights[p];
      wsum += cfg.weights[p];
    }
    if (!wsum) continue;
    rows.push({
      userId: u.id,
      name: u.name,
      department: deptOf(u),
      score: Math.round((sum / wsum) * 10) / 10,
      parts,
      facts: { finished: w.finished, onTime: w.onTime, withDue: w.withDue, returns, kudos, late: t?.late ?? 0, absent: t?.absent ?? 0, workdays },
      rank: 0,
      previous: prev.get(u.id) ?? null,
    });
  }
  rows.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1]!.score === r.score ? rows[i - 1]!.rank : i + 1));
  return rows;
}

// The leaderboard as this person may see it.
export async function leaderboard(user: AppUser, period?: string, department?: string | null) {
  const cfg = await needOn();
  const p = period && isPeriod(period) ? period : await thisPeriod();
  const all_ = seesAll(user);
  if (cfg.leaderboard === "off" && !all_) throw new WorkflowError("FORBIDDEN", "The leaderboard is switched off.");
  if (cfg.leaderboard === "managers" && !all_) throw new WorkflowError("FORBIDDEN", "Only HR, Admin and owners see the leaderboard.");
  let rows = await computeScores(p, cfg);
  if (department) rows = rows.filter((r) => r.department === department);
  const departments = [...new Set((await computeScores(p, cfg)).map((r) => r.department).filter((d): d is string => !!d))].sort();
  const mine = rows.find((r) => r.userId === user.id) ?? null;
  const hide = (r: ScoreRow): ScoreRow => (cfg.showScores || all_ || r.userId === user.id ? r : { ...r, score: 0, parts: {}, facts: { ...r.facts, late: 0, absent: 0, returns: 0 } });
  const top = rows.slice(0, cfg.topN).map(hide);
  // Who needs support: the lowest quarter (at most 10), for HR, Admin and owners only.
  const support = all_ ? rows.slice(-Math.min(10, Math.max(1, Math.floor(rows.length / 4)))).reverse() : [];
  return { period: p, rows: all_ ? rows : top, top, mine, support, total: rows.length, departments, seesAll: all_, showScores: cfg.showScores || all_, weights: cfg.weights };
}

// ---------------------------------------------------------------------------
// Badges and titles
// ---------------------------------------------------------------------------

async function give(userId: string, badge: string, title: string, period: string, reason: string, by: AppUser | null) {
  const exists = await get("SELECT 1 AS x FROM recog_awards WHERE user_id = ? AND badge = ? AND period = ?", userId, badge, period);
  if (exists) return false;
  await run("INSERT INTO recog_awards (id, user_id, badge, title, period, reason, auto, awarded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", uid("awd_"), userId, badge, title, period, reason, by ? 0 : 1, by?.id ?? null, nowIso());
  await notify([userId], { type: "hr", title: `You earned ${badge === "title" ? `the title "${title}"` : `the ${title} badge`}`, body: `${period}: ${reason}`, link: "/recognition?tab=badges", dedupeKey: `award-${userId}-${badge}-${period}` }, nowIso(), by?.id);
  return true;
}

// The month's badges by the rules, and its scores kept for next month's comparison (and the history).
export async function awardMonth(period: string) {
  const cfg = await recognitionConfig();
  if (!cfg.enabled) return { awarded: 0 };
  const rows = await computeScores(period, cfg);
  const now = nowIso();
  for (const r of rows)
    await run(
      "INSERT INTO recog_scores (user_id, period, score, parts, rank, computed_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, period) DO UPDATE SET score = excluded.score, parts = excluded.parts, rank = excluded.rank, computed_at = excluded.computed_at",
      r.userId,
      period,
      r.score,
      JSON.stringify(r.parts),
      r.rank,
      now,
    );
  let awarded = 0;
  const on = (b: BadgeKey) => cfg.badges[b];
  const B = (b: BadgeKey) => BADGES[b].label;
  if (on("top_performer") && rows[0]) awarded += Number(await give(rows[0].userId, "top_performer", B("top_performer"), period, `Score ${rows[0].score}, the highest of ${rows.length}.`, null));
  if (on("dept_star")) {
    const byDept = new Map<string, ScoreRow[]>();
    for (const r of rows) if (r.department) byDept.set(r.department, [...(byDept.get(r.department) ?? []), r]);
    for (const [d, rs] of byDept) if (rs.length >= 3) awarded += Number(await give(rs[0]!.userId, "dept_star", B("dept_star"), period, `Highest score in ${d} (${rs[0]!.score}).`, null));
  }
  if (on("rising_star")) {
    const best = rows.filter((r) => r.previous !== null).map((r) => ({ r, d: r.score - r.previous! })).sort((a, b) => b.d - a.d)[0];
    if (best && best.d >= 10) awarded += Number(await give(best.r.userId, "rising_star", B("rising_star"), period, `Up ${Math.round(best.d)} points on the month before.`, null));
  }
  for (const r of rows) {
    const f = r.facts;
    if (on("perfect_attendance") && f.workdays >= 10 && f.late === 0 && f.absent === 0 && r.parts.attendance === 100) awarded += Number(await give(r.userId, "perfect_attendance", B("perfect_attendance"), period, `${f.workdays} working days, all on time.`, null));
    if (on("on_time") && f.finished >= 5 && f.withDue === f.finished && f.onTime === f.withDue) awarded += Number(await give(r.userId, "on_time", B("on_time"), period, `${f.finished} pieces of work, all by their due date.`, null));
    if (on("zero_defects") && f.finished >= 5 && f.returns === 0) awarded += Number(await give(r.userId, "zero_defects", B("zero_defects"), period, `${f.finished} pieces of work, none sent back.`, null));
    if (on("team_player") && f.kudos >= 3) awarded += Number(await give(r.userId, "team_player", B("team_player"), period, `${f.kudos} kudos from colleagues.`, null));
  }
  return { awarded };
}

// The scheduled job: once the month is over, its badges are given (once).
export async function recognitionJob() {
  const cfg = await recognitionConfig();
  if (!cfg.enabled) return { awarded: 0 };
  const last = prevPeriod(await thisPeriod());
  const done = parseJson<string | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'recog.lastAwarded'"))?.value, null);
  if (done && done >= last) return { awarded: 0 };
  const r = await awardMonth(last);
  await run(
    "INSERT INTO settings (key, value, updated_at) VALUES ('recog.lastAwarded', ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    JSON.stringify(last),
    nowIso(),
  );
  return r;
}

// A title given by HR or Admin ("Employee of the month", "Best presenter of the term").
export async function giveTitle(user: AppUser, input: { userId: string; title: string; reason: string; period?: string }) {
  await needOn();
  if (!seesAll(user)) throw new WorkflowError("FORBIDDEN", "HR, Admin and owners give titles.");
  const title = String(input.title ?? "").trim().slice(0, 60);
  const reason = String(input.reason ?? "").trim().slice(0, 300);
  if (!title || !reason) throw new WorkflowError("VALIDATION", "Give the title and why.");
  if (input.userId === user.id) throw new WorkflowError("FORBIDDEN", "Someone else gives you a title.");
  const period = input.period && isPeriod(input.period) ? input.period : await thisPeriod();
  const target = await get<{ name: string }>("SELECT name FROM users WHERE id = ?", input.userId);
  if (!target) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const badge = `title:${title.toLowerCase()}`;
  if (!(await give(input.userId, badge, title, period, reason, user))) throw new WorkflowError("VALIDATION", `${target.name} already has this title for ${period}.`);
  await audit({ actor: user }, { action: "recognition.title", summary: `${user.name} gave ${target.name} the title "${title}" for ${period}`, reason });
}

export async function removeAward(user: AppUser, id: string) {
  if (!seesAll(user)) throw new WorkflowError("FORBIDDEN", "HR, Admin and owners remove awards.");
  const a = await get<{ title: string; user_id: string }>("SELECT title, user_id FROM recog_awards WHERE id = ?", id);
  if (!a) return;
  await run("DELETE FROM recog_awards WHERE id = ?", id);
  await audit({ actor: user }, { action: "recognition.title", summary: `${user.name} removed the award "${a.title}"` });
}


export async function awards(user: AppUser, opts: { userId?: string; limit?: number } = {}) {
  await needOn();
  const rows = await all<{ id: string; user_id: string; name: string; badge: string; title: string; period: string; reason: string | null; auto: number; created_at: string }>(
    `SELECT a.id, a.user_id, u.name, a.badge, a.title, a.period, a.reason, a.auto, a.created_at FROM recog_awards a JOIN users u ON u.id = a.user_id ${opts.userId ? "WHERE a.user_id = ?" : ""} ORDER BY a.created_at DESC LIMIT ${Math.min(500, opts.limit ?? 100)}`,
    ...(opts.userId ? [opts.userId] : []),
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id, name: r.name, badge: r.badge, title: r.title, period: r.period, reason: r.reason, auto: !!Number(r.auto), created_at: r.created_at }));
}

// A person's current titles (this month and last), shown beside their name.
export async function titlesOf(userIds: string[]) {
  const cfg = await recognitionConfig();
  if (!cfg.enabled || !userIds.length) return {} as Record<string, string[]>;
  const p = await thisPeriod();
  const rows = await all<{ user_id: string; title: string }>(
    `SELECT user_id, title FROM recog_awards WHERE period IN (?, ?) AND user_id IN (${userIds.map(() => "?").join(",")}) ORDER BY created_at DESC`,
    p,
    prevPeriod(p),
    ...userIds,
  );
  const out: Record<string, string[]> = {};
  for (const r of rows) out[r.user_id] = [...new Set([...(out[r.user_id] ?? []), r.title])].slice(0, 3);
  return out;
}

// ---------------------------------------------------------------------------
// Kudos
// ---------------------------------------------------------------------------

export async function giveKudos(user: AppUser, input: { to: string; value: string; message: string }) {
  const cfg = await needOn();
  if (!cfg.kudos) throw new WorkflowError("INVALID_STATE", "Kudos are switched off.");
  if (input.to === user.id) throw new WorkflowError("VALIDATION", "Kudos are for someone else.");
  if (!(input.value in KUDOS_VALUES)) throw new WorkflowError("VALIDATION", "Choose what it is for.");
  const message = String(input.message ?? "").trim().slice(0, 300);
  if (message.length < 5) throw new WorkflowError("VALIDATION", "Say what they did.");
  const to = await get<{ name: string; active: number }>("SELECT name, active FROM users WHERE id = ?", input.to);
  if (!to || !Number(to.active)) throw new WorkflowError("NOT_FOUND", "Person not found.");
  const { from, to: end } = monthBounds(await thisPeriod());
  const given = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM recog_kudos WHERE from_user = ? AND created_at >= ? AND created_at < ?", user.id, from, end))?.c ?? 0);
  if (given >= cfg.kudosPerMonth) throw new WorkflowError("VALIDATION", `You have given your ${cfg.kudosPerMonth} kudos this month.`);
  if (await get("SELECT 1 AS x FROM recog_kudos WHERE from_user = ? AND to_user = ? AND created_at >= ?", user.id, input.to, new Date(Date.now() - 864e5).toISOString()))
    throw new WorkflowError("VALIDATION", `You already thanked ${to.name} today.`);
  const id = uid("kud_");
  await run("INSERT INTO recog_kudos (id, from_user, to_user, value, message, created_at) VALUES (?, ?, ?, ?, ?, ?)", id, user.id, input.to, input.value, message, nowIso());
  await notify([input.to], { type: "hr", title: `${user.name} gave you kudos: ${KUDOS_VALUES[input.value as keyof typeof KUDOS_VALUES]}`, body: message, link: "/recognition?tab=kudos" }, nowIso(), user.id);
  return id;
}

export async function kudosWall(user: AppUser, limit = 50) {
  await needOn();
  void user;
  return all<{ id: string; from_name: string; to_name: string; to_user: string; value: string; message: string; created_at: string }>(
    `SELECT k.id, f.name AS from_name, t.name AS to_name, k.to_user, k.value, k.message, k.created_at FROM recog_kudos k JOIN users f ON f.id = k.from_user JOIN users t ON t.id = k.to_user ORDER BY k.created_at DESC LIMIT ${Math.min(200, limit)}`,
  );
}
