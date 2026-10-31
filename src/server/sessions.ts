// Studio session planning: the Recording lead books a studio, a time, a presenter and a camera operator for one or
// several parts at once. Each part gets its own recording_sessions row sharing a batch id, so the item page, the
// calendar and imports keep working as before. Rooms and operators cannot be double-booked.

import { all, get, nowIso, run, tx, uid } from "./db";
import { assignStage, audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, isLeadOf, isManager, scopeSql, type AppUser } from "./users";
import { localInputToIso } from "@/lib/format";

export const canPlanSessions = (u: AppUser) => isLeadOf(u, "recording") || isManager(u) || can(u, "items.plan");
const canSeeSessions = (u: AppUser) => canPlanSessions(u) || can(u, "team.view") || u.roles.includes("recording");

function need(u: AppUser) {
  if (!canPlanSessions(u)) throw new WorkflowError("FORBIDDEN", "The Recording team lead or a manager books studio sessions.");
}

export type Booking = {
  batchId: string;
  start: string;
  durationMin: number;
  room: string | null;
  presenter: string | null;
  operatorId: string | null;
  operator: string | null;
  status: string;
  note: string | null;
  items: { id: string; code: string; title: string; place: string; stage: string | null; stageStatus: string | null }[];
};

type Row = {
  id: string;
  batch_id: string | null;
  item_id: string;
  scheduled_start: string;
  duration_min: number;
  presenter: string | null;
  location: string | null;
  status: string;
  outcome_note: string | null;
  operator_id: string | null;
  operator: string | null;
  code: string;
  title: string;
  stage: string | null;
  stage_status: string | null;
  grade: string | null;
  subject: string | null;
  unit_number: number | null;
  part_number: number | null;
};

const ROWS = `SELECT rs.id, rs.batch_id, rs.item_id, rs.scheduled_start, rs.duration_min, rs.presenter, rs.location, rs.status, rs.outcome_note, rs.operator_id, u.name AS operator,
    i.code, i.title, i.stage, i.stage_status, g.name AS grade, s.name AS subject, un.number AS unit_number, l.number AS part_number
  FROM recording_sessions rs JOIN items i ON i.id = rs.item_id LEFT JOIN users u ON u.id = rs.operator_id
  LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
  LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
  LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id`;

function group(rows: Row[]): Booking[] {
  const out = new Map<string, Booking>();
  for (const r of rows) {
    const key = r.batch_id ?? r.id;
    const b = out.get(key) ?? {
      batchId: key,
      start: r.scheduled_start,
      durationMin: Number(r.duration_min),
      room: r.location,
      presenter: r.presenter,
      operatorId: r.operator_id,
      operator: r.operator,
      status: r.status,
      note: r.outcome_note,
      items: [],
    };
    b.items.push({
      id: r.item_id,
      code: r.code,
      title: r.title,
      place: [r.grade, r.subject, r.unit_number != null ? `Unit ${r.unit_number}` : null, r.part_number != null ? `Part ${r.part_number}` : null].filter(Boolean).join(" · "),
      stage: r.stage,
      stageStatus: r.stage_status,
    });
    out.set(key, b);
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}

export async function sessionWeek(user: AppUser, weekStart: string) {
  if (!canSeeSessions(user)) throw new WorkflowError("FORBIDDEN", "You cannot see studio sessions.");
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const from = localInputToIso(`${weekStart}T00:00`, tz)!;
  const to = new Date(Date.parse(from) + 7 * 864e5).toISOString();
  const sc = scopeSql(user, "i");
  const rows = await all<Row>(`${ROWS} WHERE rs.scheduled_start >= ? AND rs.scheduled_start < ? AND rs.status <> 'cancelled' AND ${sc.sql} ORDER BY rs.scheduled_start, i.code`, from, to, ...sc.params);
  // Team members see only their own sessions.
  const mine = !canPlanSessions(user) && !can(user, "team.view");
  return { bookings: group(rows).filter((b) => !mine || b.operatorId === user.id), studios: s.lists.studios ?? [], tz };
}

// A recorder's next sessions, for their Home board.
export async function mySessions(user: AppUser) {
  const rows = await all<Row>(`${ROWS} WHERE rs.operator_id = ? AND rs.status = 'scheduled' AND rs.scheduled_start >= ? ORDER BY rs.scheduled_start LIMIT 40`, user.id, new Date(Date.now() - 12 * 36e5).toISOString());
  return group(rows).slice(0, 5);
}

// Parts that still need recording: drafts and parts in Recording not yet done.
export async function sessionCandidates(user: AppUser) {
  need(user);
  const sc = scopeSql(user, "i");
  return all<{ id: string; code: string; title: string; grade: string | null; subject: string | null; unit_number: number | null; part_number: number | null; booked: string | null }>(
    `SELECT i.id, i.code, i.title, g.name AS grade, s.name AS subject, un.number AS unit_number, l.number AS part_number,
        (SELECT MIN(rs.scheduled_start) FROM recording_sessions rs WHERE rs.item_id = i.id AND rs.status = 'scheduled' AND rs.scheduled_start >= ?) AS booked
     FROM items i LEFT JOIN item_memberships m ON m.item_id = i.id AND m.is_primary = 1
     LEFT JOIN grades g ON g.id = m.grade_id LEFT JOIN subjects s ON s.id = m.subject_id
     LEFT JOIN units un ON un.id = m.unit_id LEFT JOIN lessons l ON l.id = i.lesson_id
     WHERE (i.lifecycle = 'draft' OR (i.lifecycle = 'in_production' AND i.stage = 'recording' AND i.stage_status IN ('queued','in_progress','paused','blocked'))) AND ${sc.sql}
     ORDER BY g.sort, s.sort, un.number, l.number, i.code LIMIT 1000`,
    nowIso(),
    ...sc.params,
  );
}

export type BookingInput = { date: string; time: string; durationMin: number; room: string; presenter?: string | null; operatorId?: string | null; itemIds: string[]; assignToOperator?: boolean; note?: string | null };

async function clashes(start: string, end: string, room: string, operatorId: string | null, exceptBatch: string | null) {
  const rows = await all<{ batch_id: string | null; id: string; scheduled_start: string; duration_min: number; location: string | null; operator_id: string | null }>(
    "SELECT batch_id, id, scheduled_start, duration_min, location, operator_id FROM recording_sessions WHERE status = 'scheduled' AND scheduled_start < ? AND scheduled_start >= ?",
    end,
    new Date(Date.parse(start) - 24 * 36e5).toISOString(),
  );
  for (const r of rows) {
    if (exceptBatch && (r.batch_id ?? r.id) === exceptBatch) continue;
    const rEnd = new Date(Date.parse(r.scheduled_start) + Number(r.duration_min) * 60e3).toISOString();
    if (rEnd <= start) continue;
    if (r.location === room) return `${room} is already booked then.`;
    if (operatorId && r.operator_id === operatorId) return "The camera operator is already booked then.";
  }
  return null;
}

export async function bookSession(user: AppUser, input: BookingInput) {
  need(user);
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const ids = [...new Set(input.itemIds)].slice(0, 30);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose the parts to record.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new WorkflowError("VALIDATION", "Choose the day and start time.");
  const start = localInputToIso(`${input.date}T${input.time}`, tz)!;
  if (Date.parse(start) < Date.now() - 36e5) throw new WorkflowError("VALIDATION", "Choose a time that has not passed.");
  const duration = Math.round(Number(input.durationMin));
  if (!(duration >= 15 && duration <= 600)) throw new WorkflowError("VALIDATION", "A session lasts 15 minutes to 10 hours.");
  const room = String(input.room ?? "").trim().slice(0, 60);
  if (!room) throw new WorkflowError("VALIDATION", "Choose the studio.");
  const operatorId = input.operatorId || null;
  if (operatorId && !(await get("SELECT 1 AS x FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.user_id = ? AND r.role = 'recording' AND u.active = 1", operatorId)))
    throw new WorkflowError("VALIDATION", "The camera operator must be in the Recording team.");
  const end = new Date(Date.parse(start) + duration * 60e3).toISOString();
  const clash = await clashes(start, end, room, operatorId, null);
  if (clash) throw new WorkflowError("VALIDATION", clash);
  const batchId = uid("rsb_");
  const now = nowIso();
  const presenter = String(input.presenter ?? "").trim().slice(0, 120) || null;
  await tx(async () => {
    for (const id of ids) {
      await run(
        "INSERT INTO recording_sessions (id, item_id, scheduled_start, duration_min, presenter, location, status, outcome_note, created_by, created_at, operator_id, batch_id) VALUES (?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)",
        uid("rs_"),
        id,
        start,
        duration,
        presenter,
        room,
        String(input.note ?? "").trim().slice(0, 300) || null,
        user.id,
        now,
        operatorId,
        batchId,
      );
      // The operator records these parts: they become theirs in Recording (unless someone else already has them).
      if (input.assignToOperator && operatorId) {
        const owner = await get<{ user_id: string | null }>("SELECT user_id FROM stage_assignments WHERE item_id = ? AND stage = 'recording'", id);
        if (!owner?.user_id) await assignStage({ actor: user, silent: true }, id, { stage: "recording", userId: operatorId });
      }
    }
    await audit({ actor: user }, { action: "session.booked", stage: "recording", summary: `${user.name} booked ${room} on ${input.date} ${input.time} for ${ids.length} ${ids.length === 1 ? "part" : "parts"}` });
  });
  if (operatorId)
    await notify(
      [operatorId],
      { type: "assignment", title: `Studio session ${input.date} ${input.time}`, body: `${room}, ${duration} min, ${ids.length} ${ids.length === 1 ? "part" : "parts"}${presenter ? `, with ${presenter}` : ""}.`, link: "/sessions", dedupeKey: `session:${batchId}` },
      now,
      user.id,
    );
  return batchId;
}

async function batchRows(batchId: string) {
  return all<{ id: string; scheduled_start: string; duration_min: number; location: string | null; operator_id: string | null; status: string }>(
    "SELECT id, scheduled_start, duration_min, location, operator_id, status FROM recording_sessions WHERE batch_id = ? OR id = ?",
    batchId,
    batchId,
  );
}

export async function moveSession(user: AppUser, batchId: string, input: { date: string; time: string; room?: string | null }) {
  need(user);
  const rows = await batchRows(batchId);
  if (!rows.length) throw new WorkflowError("NOT_FOUND", "Session not found.");
  const tz = (await getSettings()).workspace.timezone;
  const start = localInputToIso(`${input.date}T${input.time}`, tz);
  if (!start) throw new WorkflowError("VALIDATION", "Choose the day and start time.");
  const room = input.room?.trim() || rows[0]!.location || "";
  const end = new Date(Date.parse(start) + Number(rows[0]!.duration_min) * 60e3).toISOString();
  const clash = await clashes(start, end, room, rows[0]!.operator_id, batchId);
  if (clash) throw new WorkflowError("VALIDATION", clash);
  await run("UPDATE recording_sessions SET scheduled_start = ?, location = ? WHERE batch_id = ? OR id = ?", start, room, batchId, batchId);
  await audit({ actor: user }, { action: "session.moved", stage: "recording", summary: `${user.name} moved a studio session to ${input.date} ${input.time}, ${room}` });
  if (rows[0]!.operator_id)
    await notify([rows[0]!.operator_id], { type: "assignment", title: `Session moved to ${input.date} ${input.time}`, body: room, link: "/sessions", dedupeKey: `session-moved:${batchId}:${start}` }, nowIso(), user.id);
}

export async function setSessionStatus(user: AppUser, batchId: string, status: "completed" | "cancelled", note?: string | null) {
  const rows = await batchRows(batchId);
  if (!rows.length) throw new WorkflowError("NOT_FOUND", "Session not found.");
  // The operator can mark their own session recorded; booking changes are the lead's.
  if (!(canPlanSessions(user) || (status === "completed" && rows[0]!.operator_id === user.id))) need(user);
  await run("UPDATE recording_sessions SET status = ?, outcome_note = COALESCE(?, outcome_note) WHERE batch_id = ? OR id = ?", status, note?.trim() || null, batchId, batchId);
  await audit({ actor: user }, { action: `session.${status}`, stage: "recording", summary: `${user.name} marked a studio session ${status === "completed" ? "recorded" : "cancelled"}${note ? `: ${note}` : ""}` });
}

export async function recordingStaff() {
  return all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = 'recording' AND u.active = 1 ORDER BY u.name");
}

export const weekStartOf = (date: string, weekStartsOn: number) => {
  const t = new Date(`${date}T12:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() - weekStartsOn + 7) % 7) * 864e5).toISOString().slice(0, 10);
};
