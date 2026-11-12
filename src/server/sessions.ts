// Studio session planning: the academic manager books a studio, a time, a presenter and a camera operator for one or
// several parts at once. Each part gets its own recording_sessions row sharing a batch id, so the item page, the
// calendar and imports keep working as before. Rooms and operators cannot be double-booked.

import { all, get, nowIso, run, tx, uid } from "./db";
import { assignStage, audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { getSettings } from "./settings";
import { can, isLeadOf, isManager, scopeSql, type AppUser } from "./users";
import { isoToLocalInput, localInputToIso } from "@/lib/format";

// Who books studio sessions (Studio sessions, Who manages them): the academic managers Admin names, and, as Admin
// chooses, planners and the Recording lead too. With nobody named, managers and planners book them.
export type SessionsConfig = { managers: string[]; planners: boolean; recordingLead: boolean };
export const DEFAULT_SESSIONS: SessionsConfig = { managers: [], planners: false, recordingLead: false };

export async function sessionsConfig(): Promise<SessionsConfig> {
  const r = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.sessions'");
  let v: Partial<SessionsConfig> = {};
  try {
    v = JSON.parse(r?.value ?? "{}");
  } catch {}
  return { ...DEFAULT_SESSIONS, ...v, managers: Array.isArray(v.managers) ? v.managers : [] };
}

export function plansWith(u: AppUser, cfg: SessionsConfig) {
  if (can(u, "users.manage")) return true;
  if (cfg.managers.includes(u.id)) return true;
  // Until an academic manager is named, managers book them.
  if (!cfg.managers.length && isManager(u) && !isLeadOf(u, "recording")) return true;
  if (cfg.planners && can(u, "items.plan")) return true;
  return cfg.recordingLead && isLeadOf(u, "recording");
}

export async function canPlanSessions(u: AppUser) {
  return plansWith(u, await sessionsConfig());
}

export async function saveSessionsConfig(user: AppUser, input: Partial<SessionsConfig>) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin chooses who manages studio sessions.");
  const cur = await sessionsConfig();
  const next: SessionsConfig = { managers: Array.isArray(input.managers) ? input.managers.map(String).slice(0, 50) : cur.managers, planners: input.planners ?? cur.planners, recordingLead: input.recordingLead ?? cur.recordingLead };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.sessions', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.sessions", summary: `${user.name} changed who manages studio sessions`, newValue: next });
}

async function need(u: AppUser) {
  if (!(await canPlanSessions(u))) throw new WorkflowError("FORBIDDEN", "The academic manager books studio sessions.");
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
  if (!(await canPlanSessions(user)) && !can(user, "team.view") && !user.roles.includes("recording")) throw new WorkflowError("FORBIDDEN", "You cannot see studio sessions.");
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const from = localInputToIso(`${weekStart}T00:00`, tz)!;
  const to = new Date(Date.parse(from) + 7 * 864e5).toISOString();
  const sc = scopeSql(user, "i");
  const rows = await all<Row>(`${ROWS} WHERE rs.scheduled_start >= ? AND rs.scheduled_start < ? AND rs.status <> 'cancelled' AND ${sc.sql} ORDER BY rs.scheduled_start, i.code`, from, to, ...sc.params);
  // Team members see only their own sessions.
  const mine = !(await canPlanSessions(user)) && !can(user, "team.view");
  return { bookings: group(rows).filter((b) => !mine || b.operatorId === user.id), studios: s.lists.studios ?? [], tz };
}

// A recorder's next sessions, for their Home board.
export async function mySessions(user: AppUser) {
  const rows = await all<Row>(`${ROWS} WHERE rs.operator_id = ? AND rs.status = 'scheduled' AND rs.scheduled_start >= ? ORDER BY rs.scheduled_start LIMIT 40`, user.id, new Date(Date.now() - 12 * 36e5).toISOString());
  return group(rows).slice(0, 5);
}

// Parts that still need recording: drafts and parts in Recording not yet done.
export async function sessionCandidates(user: AppUser) {
  await need(user);
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

// Checks a booking and tidies it: the day and time, length, studio, operator and parts, and that the studio and the
// operator are free then. Imports may book days already past (to bring in what was recorded).
async function prepareBooking(input: BookingInput, opts: { allowPast?: boolean; exceptBatch?: string | null } = {}) {
  const tz = (await getSettings()).workspace.timezone;
  const ids = [...new Set(input.itemIds)].slice(0, 30);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose the parts to record.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) throw new WorkflowError("VALIDATION", "Choose the day and start time.");
  const start = localInputToIso(`${input.date}T${input.time}`, tz)!;
  if (!opts.allowPast && Date.parse(start) < Date.now() - 36e5) throw new WorkflowError("VALIDATION", "Choose a time that has not passed.");
  const duration = Math.round(Number(input.durationMin));
  if (!(duration >= 15 && duration <= 600)) throw new WorkflowError("VALIDATION", "A session lasts 15 minutes to 10 hours.");
  const room = String(input.room ?? "").trim().slice(0, 60);
  if (!room) throw new WorkflowError("VALIDATION", "Choose the studio.");
  const operatorId = input.operatorId || null;
  if (operatorId && !(await get("SELECT 1 AS x FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.user_id = ? AND r.role = 'recording' AND u.active = 1", operatorId)))
    throw new WorkflowError("VALIDATION", "The camera operator must be in the Recording team.");
  const end = new Date(Date.parse(start) + duration * 60e3).toISOString();
  const clash = await clashes(start, end, room, operatorId, opts.exceptBatch ?? null);
  if (clash) throw new WorkflowError("VALIDATION", clash);
  const presenter = String(input.presenter ?? "").trim().slice(0, 120) || null;
  const note = String(input.note ?? "").trim().slice(0, 300) || null;
  return { ids, start, end, duration, room, operatorId, presenter, note };
}

export async function bookSession(user: AppUser, input: BookingInput, opts: { allowPast?: boolean } = {}) {
  if ((await (await import("./handover-config")).handoverConfig()).studioBooking === "off") throw new WorkflowError("VALIDATION", "Studio booking is turned off (Handovers, Settings).");
  await need(user);
  const { ids, start, duration, room, operatorId, presenter } = await prepareBooking(input, opts);
  const batchId = uid("rsb_");
  const now = nowIso();
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
  await need(user);
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

export async function setSessionStatus(user: AppUser, batchId: string, status: "completed" | "cancelled" | "scheduled", note?: string | null) {
  const rows = await batchRows(batchId);
  if (!rows.length) throw new WorkflowError("NOT_FOUND", "Session not found.");
  // The operator can mark their own session recorded; booking changes are the lead's.
  if (!((await canPlanSessions(user)) || (status === "completed" && rows[0]!.operator_id === user.id))) await need(user);
  await run("UPDATE recording_sessions SET status = ?, outcome_note = COALESCE(?, outcome_note) WHERE batch_id = ? OR id = ?", status, note?.trim() || null, batchId, batchId);
  await audit({ actor: user }, { action: `session.${status}`, stage: "recording", summary: `${user.name} marked a studio session ${status === "completed" ? "recorded" : status === "cancelled" ? "cancelled" : "booked again"}${note ? `: ${note}` : ""}` });
  if (status === "completed") await sendToRecordingDetails(batchId);
}

// Several sessions at once (the table): recorded, cancelled or booked again. Each is reported.
export async function setSessionsStatus(user: AppUser, batchIds: string[], status: "completed" | "cancelled" | "scheduled") {
  const out: { batchId: string; ok: boolean; error?: string }[] = [];
  for (const id of [...new Set(batchIds)].slice(0, 300)) {
    try {
      await setSessionStatus(user, id, status);
      out.push({ batchId: id, ok: true });
    } catch (e) {
      out.push({ batchId: id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

// A recorded session tells the Recording team's details on each part who presented and when: the presenter fills an
// empty presenter, and the studio, day, time and length go on the part's Recording notes. The camera codes, video
// titles and lengths (M:S) are still entered by the team.
async function sendToRecordingDetails(batchId: string) {
  const tz = (await getSettings()).workspace.timezone;
  const rows = await all<{ item_id: string; scheduled_start: string; duration_min: number; presenter: string | null; location: string | null }>(
    "SELECT item_id, scheduled_start, duration_min, presenter, location FROM recording_sessions WHERE batch_id = ? OR id = ?",
    batchId,
    batchId,
  );
  for (const r of rows) {
    if (r.presenter) await run("UPDATE items SET teacher = ?, version = version + 1, updated_at = ? WHERE id = ? AND (teacher IS NULL OR teacher = '')", r.presenter, nowIso(), r.item_id);
    const local = isoToLocalInput(r.scheduled_start, tz).replace("T", " ");
    const endIso = new Date(Date.parse(r.scheduled_start) + Number(r.duration_min) * 60e3).toISOString();
    const line = `Studio session: ${[r.location, `${local} to ${isoToLocalInput(endIso, tz).slice(11)}`, `${Number(r.duration_min)} min`, r.presenter ? `presenter ${r.presenter}` : null].filter(Boolean).join(", ")}`;
    const att = await get<{ id: string; notes: string | null }>(
      "SELECT a.id, a.notes FROM items i JOIN stage_attempts a ON a.id = i.current_attempt_id WHERE i.id = ? AND a.stage = 'recording'",
      r.item_id,
    );
    if (att && !(att.notes ?? "").includes(line)) await run("UPDATE stage_attempts SET notes = ? WHERE id = ?", [att.notes, line].filter(Boolean).join("\n"), att.id);
  }
}

// Changing a booking: its day, time, length, studio, presenter, operator, note and parts. Parts taken off lose this
// session; parts added join it.
export async function editSession(user: AppUser, batchId: string, input: BookingInput) {
  await need(user);
  const rows = await batchRows(batchId);
  if (!rows.length) throw new WorkflowError("NOT_FOUND", "Session not found.");
  const p = await prepareBooking(input, { allowPast: true, exceptBatch: batchId });
  const have = await all<{ id: string; item_id: string }>("SELECT id, item_id FROM recording_sessions WHERE batch_id = ? OR id = ?", batchId, batchId);
  const status = rows[0]!.status;
  const now = nowIso();
  await tx(async () => {
    for (const h of have.filter((h) => !p.ids.includes(h.item_id))) await run("DELETE FROM recording_sessions WHERE id = ?", h.id);
    await run(
      "UPDATE recording_sessions SET scheduled_start = ?, duration_min = ?, location = ?, presenter = ?, operator_id = ?, outcome_note = ?, batch_id = ? WHERE batch_id = ? OR id = ?",
      p.start,
      p.duration,
      p.room,
      p.presenter,
      p.operatorId,
      p.note,
      batchId,
      batchId,
      batchId,
    );
    for (const id of p.ids.filter((id) => !have.some((h) => h.item_id === id)))
      await run(
        "INSERT INTO recording_sessions (id, item_id, scheduled_start, duration_min, presenter, location, status, outcome_note, created_by, created_at, operator_id, batch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        uid("rs_"),
        id,
        p.start,
        p.duration,
        p.presenter,
        p.room,
        status,
        p.note,
        user.id,
        now,
        p.operatorId,
        batchId,
      );
    await audit({ actor: user }, { action: "session.edited", stage: "recording", summary: `${user.name} changed a studio session: ${p.room}, ${input.date} ${input.time}, ${p.ids.length} ${p.ids.length === 1 ? "part" : "parts"}` });
  });
  if (p.operatorId && status === "scheduled")
    await notify([p.operatorId], { type: "assignment", title: `Session changed: ${input.date} ${input.time}`, body: `${p.room}, ${p.duration} min${p.presenter ? `, with ${p.presenter}` : ""}.`, link: "/sessions", dedupeKey: `session-edit:${batchId}:${now}` }, now, user.id);
  if (status === "completed") await sendToRecordingDetails(batchId);
  return batchId;
}

export async function deleteSessions(user: AppUser, batchIds: string[]) {
  await need(user);
  const ids = [...new Set(batchIds)].slice(0, 300);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose the sessions to delete.");
  let n = 0;
  await tx(async () => {
    for (const id of ids) n += Number((await run("DELETE FROM recording_sessions WHERE batch_id = ? OR id = ?", id, id)).changes ?? 0);
    await audit({ actor: user }, { action: "session.deleted", stage: "recording", summary: `${user.name} deleted ${ids.length} studio ${ids.length === 1 ? "session" : "sessions"}` });
  });
  return n;
}

// Every session in a span of days, in any state, for the table (filters run on the page).
export async function sessionTable(user: AppUser, from: string, until: string) {
  if (!(await canPlanSessions(user)) && !can(user, "team.view") && !user.roles.includes("recording")) throw new WorkflowError("FORBIDDEN", "You cannot see studio sessions.");
  const tz = (await getSettings()).workspace.timezone;
  const a = localInputToIso(`${from}T00:00`, tz)!;
  const b = new Date(Date.parse(localInputToIso(`${until}T00:00`, tz)!) + 864e5).toISOString();
  const sc = scopeSql(user, "i");
  const rows = await all<Row>(`${ROWS} WHERE rs.scheduled_start >= ? AND rs.scheduled_start < ? AND ${sc.sql} ORDER BY rs.scheduled_start, i.code LIMIT 5000`, a, b, ...sc.params);
  const mine = !(await canPlanSessions(user)) && !can(user, "team.view");
  return group(rows).filter((x) => !mine || x.operatorId === user.id);
}

// ---------------------------------------------------------------------------
// Import from a sheet (template, preview, then import). A row with a session id changes that session, so a sheet
// exported from the table can be edited and imported back (kept in sync); a row without one books a new session.
// ---------------------------------------------------------------------------

export const SESSION_COLUMNS = ["session_id", "date", "start", "minutes", "studio", "presenter", "operator", "parts", "status", "note"] as const;
export type SessionImportRow = Partial<Record<(typeof SESSION_COLUMNS)[number], string>>;
export type SessionImportLine = {
  row: number;
  action: "create" | "update" | "skip" | "error";
  errors: string[];
  date: string;
  time: string;
  minutes: number;
  studio: string;
  presenter: string | null;
  operator: string | null;
  operatorId: string | null;
  parts: { code: string; id: string | null; title: string | null }[];
  status: "scheduled" | "completed" | "cancelled";
  note: string | null;
  sessionId: string | null;
};

const normDate = (v: string) => {
  const s = v.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return s;
};
const normTime = (v: string) => {
  const m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i.exec(v.trim());
  if (!m) return v.trim();
  let h = Number(m[1]);
  if (m[3]?.toLowerCase() === "pm" && h < 12) h += 12;
  if (m[3]?.toLowerCase() === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
};

export async function importSessions(user: AppUser, rows: SessionImportRow[], commit: boolean) {
  await need(user);
  if (rows.length > 500) throw new WorkflowError("VALIDATION", "Import at most 500 sessions at once.");
  const staff = await all<{ id: string; name: string; email: string }>(
    "SELECT u.id, u.name, u.email FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = 'recording' AND u.active = 1",
  );
  const studios = (await getSettings()).lists.studios ?? [];
  const sc = scopeSql(user, "i");
  const lines: SessionImportLine[] = [];
  for (const [i, raw] of rows.entries()) {
    const get1 = (k: (typeof SESSION_COLUMNS)[number]) => String(raw[k] ?? "").trim();
    const errors: string[] = [];
    if (SESSION_COLUMNS.every((k) => !get1(k))) continue;
    const date = normDate(get1("date"));
    const time = normTime(get1("start"));
    const minutes = Math.round(Number(get1("minutes") || 60));
    const studio = get1("studio");
    const opText = get1("operator");
    const op = opText ? staff.find((s) => s.email.toLowerCase() === opText.toLowerCase() || s.name.toLowerCase() === opText.toLowerCase()) : null;
    if (opText && !op) errors.push(`No one named "${opText}" in the Recording team`);
    const st = (get1("status").toLowerCase() || "scheduled").replace("recorded", "completed").replace("booked", "scheduled");
    const status = (["scheduled", "completed", "cancelled"].includes(st) ? st : "scheduled") as SessionImportLine["status"];
    if (get1("status") && !["scheduled", "completed", "cancelled", "recorded", "booked"].includes(get1("status").toLowerCase())) errors.push(`Status "${get1("status")}" is not booked, recorded or cancelled`);
    const codes = [...new Set(get1("parts").split(/[;,\n]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
    const parts: SessionImportLine["parts"] = [];
    for (const code of codes) {
      const it = await get<{ id: string; title: string }>(`SELECT i.id, i.title FROM items i WHERE UPPER(i.code) = ? AND i.revision_of_id IS NULL AND ${sc.sql}`, code, ...sc.params);
      parts.push({ code, id: it?.id ?? null, title: it?.title ?? null });
      if (!it) errors.push(`No part with the code ${code}`);
    }
    if (!codes.length) errors.push("List the parts' codes");
    if (studio && studios.length && !studios.includes(studio)) errors.push(`Studio "${studio}" is not in the studio list (Settings)`);
    const sessionId = get1("session_id") || null;
    const exists = sessionId ? await get("SELECT 1 AS x FROM recording_sessions WHERE batch_id = ? OR id = ?", sessionId, sessionId) : null;
    if (sessionId && !exists) errors.push(`Session ${sessionId} was not found (leave session_id empty to book a new one)`);
    const input: BookingInput = { date, time, durationMin: minutes, room: studio, presenter: get1("presenter") || null, operatorId: op?.id ?? null, itemIds: parts.map((p) => p.id).filter((x): x is string => !!x), note: get1("note") || null };
    if (!errors.length && status !== "cancelled") {
      try {
        await prepareBooking(input, { allowPast: true, exceptBatch: sessionId });
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    // The same studio twice at overlapping times in the file.
    const start = Date.parse(`${date}T${time}:00Z`);
    for (const o of lines)
      if (o.action !== "error" && o.status !== "cancelled" && status !== "cancelled" && o.studio === studio && Math.abs(Date.parse(`${o.date}T${o.time}:00Z`) - start) < Math.max(o.minutes, minutes) * 60e3)
        errors.push(`Overlaps row ${o.row} in ${studio}`);
    lines.push({ row: i + 2, action: errors.length ? "error" : sessionId ? "update" : "create", errors, date, time, minutes, studio, presenter: input.presenter ?? null, operator: op?.name ?? (opText || null), operatorId: op?.id ?? null, parts, status, note: input.note ?? null, sessionId });
  }
  if (!commit) return { lines, done: 0 };
  let done = 0;
  for (const l of lines.filter((l) => l.action !== "error")) {
    const input: BookingInput = { date: l.date, time: l.time, durationMin: l.minutes, room: l.studio, presenter: l.presenter, operatorId: l.operatorId, itemIds: l.parts.map((p) => p.id!).filter(Boolean), note: l.note };
    try {
      const id = l.sessionId ? await editSession(user, l.sessionId, input) : await bookSession(user, input, { allowPast: true });
      if (l.status !== "scheduled") await setSessionStatus(user, id, l.status);
      else if (l.sessionId) await run("UPDATE recording_sessions SET status = 'scheduled' WHERE (batch_id = ? OR id = ?) AND status <> 'scheduled'", id, id);
      done++;
    } catch (e) {
      l.action = "error";
      l.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  await audit({ actor: user }, { action: "session.imported", stage: "recording", summary: `${user.name} imported ${done} studio ${done === 1 ? "session" : "sessions"}` });
  return { lines, done };
}

export async function recordingStaff() {
  return all<{ id: string; name: string }>("SELECT u.id, u.name FROM users u JOIN role_assignments r ON r.user_id = u.id WHERE r.role = 'recording' AND u.active = 1 ORDER BY u.name");
}

export const weekStartOf = (date: string, weekStartsOn: number) => {
  const t = new Date(`${date}T12:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() - weekStartsOn + 7) % 7) * 864e5).toISOString().slice(0, 10);
};
