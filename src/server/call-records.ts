// Call Records (Update 1.2, Phase 9, spec part H): one page for every customer call with its queue, wait, outcome,
// notes, tags, related conversation and request, lifecycle and recording. Admin, support leads and the managers Admin
// names see every call; agents see their own. Recordings come up from the agent's browser in pieces while the call
// runs, are kept for the retention period unless under legal hold, and every listen or download is logged.
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import * as sd from "./support-desk";
import { signedUploadUrl, storageKind } from "./storage";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export const CALL_OUTCOMES = ["resolved", "follow_up", "escalated", "callback_scheduled", "wrong_number", "no_answer", "other"] as const;
export const OUTCOME_LABELS: Record<string, string> = {
  resolved: "Resolved on the call",
  follow_up: "Needs follow-up",
  escalated: "Escalated",
  callback_scheduled: "Call-back scheduled",
  wrong_number: "Wrong number",
  no_answer: "No answer",
  other: "Other",
};

// Who sees what: all (Admin, leads, managers Admin allows) or own calls only; agents may hear their own recordings.
export async function recordAccess(user: AppUser) {
  const cfg = await sd.supportConfig();
  const all = sd.isAdmin(user) || (await sd.isLead(user, cfg)) || (cfg.recordingViewers ?? []).includes(user.id) || can(user, "support.recordings");
  const agent = await sd.isAgent(user);
  return { all, own: all || agent, hearOwn: all || (agent && cfg.agentsHearOwn !== false), lead: sd.isAdmin(user) || (await sd.isLead(user, cfg)) };
}

export async function canOpenCallRecords(user: AppUser) {
  const a = await recordAccess(user);
  return a.all || (a.own && (await sd.supportConfig()).enabled);
}

export type CallRecordFilters = { q?: string | null; customer?: string | null; minDur?: string | number | null; maxDur?: string | number | null; agentId?: string | null; queueId?: string | null; department?: string | null; direction?: string | null; status?: string | null; outcome?: string | null; recorded?: string | null; from?: string | null; to?: string | null; limit?: number };

type RecordRow = {
  id: string;
  customer_id: string | null;
  customer: string | null;
  agent_id: string | null;
  agent: string | null;
  queue_id: string | null;
  queue: string | null;
  department: string | null;
  direction: string;
  kind: string;
  status: string;
  phase: string | null;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_s: number | null;
  wait_s: number | null;
  category: string | null;
  ticket_id: string | null;
  number: number | null;
  request_id: string | null;
  request_ref: string | null;
  recording_id: string | null;
  recording_status: string | null;
  recording_size: number | null;
  legal_hold: number;
  outcome: string | null;
  notes: string | null;
  tags: string;
  phone: string | null;
};

const SELECT = `SELECT k.id, k.customer_id, c.name AS customer, k.agent_id, u.name AS agent, COALESCE(k.ring_queue, k.queue_id, t.queue_id) AS queue_id, q.name AS queue, q.department,
  k.direction, k.kind, k.status, k.phase, k.started_at, k.answered_at, k.ended_at, k.duration_s, k.wait_s, COALESCE(k.category, t.category) AS category, k.ticket_id, t.number,
  k.request_id, r.reference AS request_ref, k.recording_id, k.recording_status, k.recording_size, k.legal_hold, k.outcome, k.notes, k.tags, COALESCE(k.phone, c.phone) AS phone
  FROM sup_calls k LEFT JOIN sup_customers c ON c.id = k.customer_id LEFT JOIN users u ON u.id = k.agent_id LEFT JOIN sup_tickets t ON t.id = k.ticket_id
  LEFT JOIN sup_queues q ON q.id = COALESCE(k.ring_queue, k.queue_id, t.queue_id) LEFT JOIN sup_requests r ON r.id = k.request_id`;

const out = (r: RecordRow) => ({
  id: r.id,
  customerId: r.customer_id,
  customer: r.customer,
  agentId: r.agent_id,
  agent: r.agent,
  queueId: r.queue_id,
  queue: r.queue,
  department: r.department,
  direction: r.direction,
  kind: r.kind,
  status: r.status,
  phase: r.phase,
  startedAt: r.started_at,
  answeredAt: r.answered_at,
  endedAt: r.ended_at,
  durationS: r.duration_s === null ? null : Number(r.duration_s),
  waitS: r.wait_s === null ? null : Number(r.wait_s),
  category: r.category,
  ticketId: r.ticket_id,
  ticketNumber: r.number === null ? null : Number(r.number),
  requestId: r.request_id,
  requestRef: r.request_ref,
  recording: r.recording_id ? "saved" : (r.recording_status ?? "none"),
  recordingSize: r.recording_size === null ? null : Number(r.recording_size),
  legalHold: !!Number(r.legal_hold),
  outcome: r.outcome,
  notes: r.notes,
  tags: parseJson<string[]>(r.tags, []),
  phone: r.phone,
});
export type CallRecord = ReturnType<typeof out>;

function where(user: AppUser, all: boolean, f: CallRecordFilters) {
  const w: string[] = ["k.kind <> 'staff'", "k.status <> 'callback'"];
  const p: (string | number)[] = [];
  if (!all) {
    w.push("(k.agent_id = ? OR k.host_id = ?)");
    p.push(user.id, user.id);
  }
  if (f.agentId) (w.push("k.agent_id = ?"), p.push(f.agentId));
  if (f.queueId) (w.push("COALESCE(k.ring_queue, k.queue_id, t.queue_id) = ?"), p.push(f.queueId));
  if (f.department) (w.push("q.department = ?"), p.push(f.department));
  if (f.direction === "inbound" || f.direction === "outbound") (w.push("k.direction = ?"), p.push(f.direction));
  if (f.status) (w.push("(k.status = ? OR k.phase = ?)"), p.push(f.status, f.status));
  if (f.outcome) (w.push("k.outcome = ?"), p.push(f.outcome));
  if (f.recorded === "yes") w.push("k.recording_id IS NOT NULL");
  if (f.recorded === "no") w.push("k.recording_id IS NULL");
  if (f.recorded === "hold") w.push("k.legal_hold = 1");
  if (f.recorded === "deleted") w.push("k.recording_status IN ('deleted','purged')");
  const cust = clean(f.customer, 80).toLowerCase();
  if (cust) (w.push("(LOWER(COALESCE(c.name,'')) LIKE ? OR COALESCE(c.phone,'') LIKE ? OR k.customer_id = ?)"), p.push(`%${cust}%`, `%${cust}%`, cust));
  // Duration range in minutes (talk time).
  if (f.minDur !== null && f.minDur !== undefined && f.minDur !== "" && Number.isFinite(Number(f.minDur))) (w.push("COALESCE(k.duration_s, 0) >= ?"), p.push(Math.round(Number(f.minDur) * 60)));
  if (f.maxDur !== null && f.maxDur !== undefined && f.maxDur !== "" && Number.isFinite(Number(f.maxDur))) (w.push("COALESCE(k.duration_s, 0) <= ?"), p.push(Math.round(Number(f.maxDur) * 60)));
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) (w.push("k.started_at >= ?"), p.push(`${f.from}T00:00:00.000Z`));
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) (w.push("k.started_at <= ?"), p.push(`${f.to}T23:59:59.999Z`));
  const q = clean(f.q, 80).toLowerCase();
  if (q) {
    const n = Number(q.replace(/^#/, ""));
    w.push(`(LOWER(COALESCE(c.name,'')) LIKE ? OR COALESCE(k.phone, c.phone, '') LIKE ? OR LOWER(COALESCE(k.notes,'')) LIKE ? OR LOWER(k.tags) LIKE ? OR k.id = ?${Number.isInteger(n) && n > 0 ? " OR t.number = ?" : ""})`);
    p.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, q);
    if (Number.isInteger(n) && n > 0) p.push(n);
  }
  return { sql: w.join(" AND "), params: p };
}

export async function listCallRecords(user: AppUser, f: CallRecordFilters = {}) {
  const a = await recordAccess(user);
  if (!a.own) throw new WorkflowError("FORBIDDEN", "Call records are for support leads, the managers Admin allows, and agents for their own calls.");
  const w = where(user, a.all, f);
  const rows = await all<RecordRow>(`${SELECT} WHERE ${w.sql} ORDER BY k.started_at DESC LIMIT ?`, ...w.params, Math.max(1, Math.min(1000, f.limit ?? 200)));
  return { rows: rows.map(out), all: a.all };
}

export async function callRecordStats(user: AppUser, f: CallRecordFilters = {}) {
  const a = await recordAccess(user);
  const w = where(user, a.all, f);
  const r = await get<{ n: number; answered: number; missed: number; talk: number | null; wait: number | null; recorded: number }>(
    `SELECT COUNT(*) AS n, SUM(CASE WHEN k.answered_at IS NOT NULL THEN 1 ELSE 0 END) AS answered, SUM(CASE WHEN k.status = 'missed' THEN 1 ELSE 0 END) AS missed,
      AVG(CASE WHEN k.answered_at IS NOT NULL THEN k.duration_s END) AS talk, AVG(k.wait_s) AS wait, SUM(CASE WHEN k.recording_id IS NOT NULL THEN 1 ELSE 0 END) AS recorded
     FROM sup_calls k LEFT JOIN sup_customers c ON c.id = k.customer_id LEFT JOIN sup_tickets t ON t.id = k.ticket_id LEFT JOIN sup_queues q ON q.id = COALESCE(k.ring_queue, k.queue_id, t.queue_id) WHERE ${w.sql}`,
    ...w.params,
  );
  return { calls: Number(r?.n ?? 0), answered: Number(r?.answered ?? 0), missed: Number(r?.missed ?? 0), avgTalkS: r?.talk === null || r?.talk === undefined ? null : Math.round(Number(r.talk)), avgWaitS: r?.wait === null || r?.wait === undefined ? null : Math.round(Number(r.wait)), recorded: Number(r?.recorded ?? 0) };
}

async function recordFor(user: AppUser, id: string) {
  const a = await recordAccess(user);
  const r = await get<RecordRow & { host_id: string | null }>(`${SELECT.replace("SELECT k.id,", "SELECT k.host_id, k.id,")} WHERE k.id = ?`, id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Call not found.");
  if (!a.all && r.agent_id !== user.id && r.host_id !== user.id) throw new WorkflowError("FORBIDDEN", "You see the records of your own calls only.");
  return { r, a };
}

export async function callRecordDetail(user: AppUser, id: string) {
  const { r, a } = await recordFor(user, id);
  const lifecycle = await all<{ phase: string; status: string | null; detail: string | null; at: string }>("SELECT phase, status, detail, at FROM sup_call_events WHERE call_id = ? ORDER BY id", id);
  const queue = await all<{ kind: string; detail: string | null; at: string; agent: string | null }>("SELECT e.kind, e.detail, e.at, u.name AS agent FROM sup_queue_events e LEFT JOIN users u ON u.id = e.agent_id WHERE e.call_id = ? ORDER BY e.at", id);
  const access = a.all ? await all<{ action: string; at: string; who: string | null }>("SELECT x.action, x.at, u.name AS who FROM sup_recording_access x LEFT JOIN users u ON u.id = x.user_id WHERE x.call_id = ? ORDER BY x.at DESC LIMIT 50", id) : [];
  const requests = r.ticket_id ? await all<{ id: string; reference: string; title: string }>("SELECT id, reference, title FROM sup_requests WHERE ticket_id = ? ORDER BY created_at DESC LIMIT 20", r.ticket_id) : [];
  return {
    record: out(r),
    lifecycle,
    queue,
    access,
    requests: requests.map((x) => ({ id: x.id, reference: x.reference, title: x.title })),
    can: { listen: !!r.recording_id && (a.all || (r.agent_id === user.id && a.hearOwn)), download: !!r.recording_id && a.all, edit: a.all || r.agent_id === user.id, hold: a.lead || can(user, "support.retention"), remove: !!r.recording_id && !Number(r.legal_hold) && (sd.isAdmin(user) || can(user, "support.retention")) },
  };
}

export async function updateCallRecord(user: AppUser, id: string, input: { notes?: string | null; tags?: string[]; outcome?: string | null; category?: string | null; requestId?: string | null }) {
  const { r, a } = await recordFor(user, id);
  if (!a.all && r.agent_id !== user.id) throw new WorkflowError("FORBIDDEN", "Only the agent of the call and support leads change its record.");
  if (input.outcome && !CALL_OUTCOMES.includes(input.outcome as (typeof CALL_OUTCOMES)[number])) throw new WorkflowError("VALIDATION", "Choose an outcome from the list.");
  if (input.requestId && !(await get("SELECT 1 AS x FROM sup_requests WHERE id = ?", input.requestId))) throw new WorkflowError("VALIDATION", "Choose an existing support request.");
  const tags = input.tags ? [...new Set(input.tags.map((t) => clean(t, 30).toLowerCase()).filter(Boolean))].slice(0, 15) : null;
  await run(
    "UPDATE sup_calls SET notes = COALESCE(?, notes), tags = COALESCE(?, tags), outcome = CASE WHEN ? THEN ? ELSE outcome END, category = CASE WHEN ? THEN ? ELSE category END, request_id = CASE WHEN ? THEN ? ELSE request_id END WHERE id = ?",
    input.notes === undefined ? null : clean(input.notes, 4000),
    tags ? JSON.stringify(tags) : null,
    input.outcome !== undefined,
    input.outcome || null,
    input.category !== undefined,
    clean(input.category, 40).toLowerCase() || null,
    input.requestId !== undefined,
    input.requestId || null,
    id,
  );
  if (r.ticket_id) await sd.activity(user.id, r.ticket_id, "call_record", "Updated the call record");
}

export async function setLegalHold(user: AppUser, id: string, on: boolean, reason?: string | null) {
  const { r, a } = await recordFor(user, id);
  if (!a.lead && !can(user, "support.retention")) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to manage retention put a call under legal hold.");
  if (on && !clean(reason, 300)) throw new WorkflowError("VALIDATION", "Say why the recording must be kept.");
  await run("UPDATE sup_calls SET legal_hold = ? WHERE id = ?", on ? 1 : 0, id);
  await audit({ actor: user }, { action: "support.legal_hold", summary: `${user.name} ${on ? `put a call with ${r.customer ?? "a customer"} under legal hold: ${clean(reason, 300)}` : `lifted the legal hold on a call with ${r.customer ?? "a customer"}`}` });
}

export async function exportCallRecords(user: AppUser, f: CallRecordFilters = {}) {
  const a = await recordAccess(user);
  if (!a.all || !(a.lead || can(user, "support.export"))) throw new WorkflowError("FORBIDDEN", "Only support leads, Admin and people allowed to export call records do this.");
  const { rows } = await listCallRecords(user, { ...f, limit: 1000 });
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = ["Call ID", "Customer ID", "Customer", "Agent ID", "Agent", "Department", "Queue", "Direction", "Start", "End", "Duration (s)", "Wait (s)", "Status", "Category", "Conversation", "Support request", "Recording", "Outcome", "Notes", "Tags"];
  const lines = rows.map((r) => [r.id, r.customerId, r.customer, r.agentId, r.agent, r.department, r.queue, r.direction, r.startedAt, r.endedAt, r.durationS, r.waitS, r.phase ?? r.status, r.category, r.ticketNumber ? `#${r.ticketNumber}` : "", r.requestRef ?? "", r.recording, r.outcome ? OUTCOME_LABELS[r.outcome] : "", r.notes, r.tags.join("; ")].map(esc).join(","));
  await audit({ actor: user }, { action: "support.call_records_export", summary: `${user.name} exported ${rows.length} call records` });
  return [head.join(","), ...lines].join("\n");
}

// ---------------------------------------------------------------------------
// Recording in pieces
// ---------------------------------------------------------------------------

const maxBytes = () => (storageKind() === "supabase" ? 25 : 8) * 1024 * 1024;

export async function saveRecordingChunk(user: AppUser, callId: string, seq: number, file: { mime: string; data: Uint8Array }) {
  const cfg = await sd.supportConfig();
  const k = await get<{ agent_id: string | null; host_id: string | null; recording_id: string | null; recording_status: string | null }>("SELECT agent_id, host_id, recording_id, recording_status FROM sup_calls WHERE id = ?", callId);
  if (!k) throw new WorkflowError("NOT_FOUND", "Call not found.");
  if (k.agent_id !== user.id && k.host_id !== user.id) throw new WorkflowError("FORBIDDEN", "Not your call.");
  if (!cfg.recordCalls) throw new WorkflowError("INVALID_STATE", "Call recording is switched off.");
  if (k.recording_id) throw new WorkflowError("INVALID_STATE", "This call's recording is already saved.");
  if (!Number.isInteger(seq) || seq < 0 || seq > 5000) throw new WorkflowError("VALIDATION", "Bad piece number.");
  if (!/^audio\/|^video\/webm/.test(file.mime)) throw new WorkflowError("VALIDATION", "A recording is an audio file.");
  const have = Number((await get<{ n: number | null }>("SELECT SUM(LENGTH(data)) AS n FROM sup_recording_chunks WHERE call_id = ?", callId))?.n ?? 0) * 0.75;
  if (have + file.data.byteLength > maxBytes()) throw new WorkflowError("VALIDATION", "The recording has reached its size limit.");
  await run("INSERT INTO sup_recording_chunks (recording_id, call_id, seq, data, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (recording_id, seq) DO NOTHING", callId, callId, seq, Buffer.from(file.data).toString("base64"), nowIso());
  if (k.recording_status !== "recording") await run("UPDATE sup_calls SET recording_status = 'recording', recording_mime = ? WHERE id = ?", file.mime.split(";")[0], callId);
  return { ok: true, seq };
}

// Joins the pieces into one file and keeps it like any recording. Called when the agent hangs up, or by the
// scheduled checks for a call whose pieces stopped coming (the tab closed).
export async function finishRecording(callId: string, by: AppUser | null) {
  const k = await get<{ agent_id: string | null; host_id: string | null; ticket_id: string | null; recording_id: string | null; recording_mime: string | null }>("SELECT agent_id, host_id, ticket_id, recording_id, recording_mime FROM sup_calls WHERE id = ?", callId);
  if (!k) throw new WorkflowError("NOT_FOUND", "Call not found.");
  if (by && k.agent_id !== by.id && k.host_id !== by.id && !(await sd.isLead(by))) throw new WorkflowError("FORBIDDEN", "Not your call.");
  // Saved already (the browser sent the whole file after a piece failed): the pieces are not needed.
  if (k.recording_id) {
    await run("DELETE FROM sup_recording_chunks WHERE call_id = ?", callId);
    return k.recording_id;
  }
  const parts = await all<{ data: string }>("SELECT data FROM sup_recording_chunks WHERE call_id = ? ORDER BY seq", callId);
  if (!parts.length) {
    await run("UPDATE sup_calls SET recording_status = 'failed' WHERE id = ? AND recording_status = 'recording'", callId);
    return null;
  }
  const data = Buffer.concat(parts.map((p) => Buffer.from(p.data, "base64")));
  const mime = k.recording_mime ?? "audio/webm";
  const kind = storageKind();
  const rid = uid("rec_");
  if (kind === "supabase") {
    const url = await signedUploadUrl(`support/${rid}`);
    const r = await fetch(url, { method: "PUT", headers: { "Content-Type": mime }, body: data });
    if (!r.ok) {
      await run("UPDATE sup_calls SET recording_status = 'failed' WHERE id = ?", callId);
      throw new WorkflowError("VALIDATION", "Storage refused the recording.");
    }
  } else await run("INSERT INTO sup_blobs (id, data) VALUES (?, ?)", rid, data.toString("base64"));
  await run("UPDATE sup_calls SET recording_id = ?, recording_storage = ?, recording_size = ?, recording_status = 'saved' WHERE id = ?", rid, kind, data.byteLength, callId);
  await run("DELETE FROM sup_recording_chunks WHERE call_id = ?", callId);
  if (k.ticket_id) await sd.activity(by?.id ?? null, k.ticket_id, "call_recorded", `${Math.round(data.byteLength / 1024)} KB${by ? "" : " (saved after the agent's page closed)"}`);
  return rid;
}

export async function finishStaleRecordings() {
  const stale = await all<{ call_id: string }>("SELECT call_id FROM sup_recording_chunks GROUP BY call_id HAVING MAX(at) < ?", new Date(Date.now() - 2 * 60e3).toISOString());
  let n = 0;
  for (const s of stale) if (await finishRecording(s.call_id, null).catch(() => null)) n++;
  return n;
}
