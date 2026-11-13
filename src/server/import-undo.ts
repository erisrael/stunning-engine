import { all, get, nowIso, run, tx, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { notify } from "./notifications";
import { canUseTemplate, TEMPLATES, type TemplateKey } from "./importer";
import { undoConfig, undoHoursFor } from "./io-rules";

// Import undo (Update 1.0, phase 6). Every import row writes inside a transaction that names its job; a row trigger
// keeps each table row before and after (job_changes). Undo is asked for within the window Admin sets, approved by
// Admin or someone who may run that import (or not at all, as Admin chooses), and then reversed in one transaction,
// newest change first. A row is only put back when it is still exactly what the import left; anything people changed
// since, or that other records now depend on, is skipped and listed.

type Job = { id: string; kind: string; template: string | null; file_name: string | null; status: string; actor_id: string | null; created_at: string; finished_at: string | null; undone_at: string | null };
type Change = { id: number; tbl: string; op: "INSERT" | "UPDATE" | "DELETE"; before_row: string | null; after_row: string | null };
export type UndoSkip = { table: string; op: string; key: string; why: string };
export type UndoResult = { reversed: number; skipped: UndoSkip[]; tables: Record<string, number> };
export type UndoRequest = { id: string; jobId: string; requestedBy: string; requesterName: string; reason: string | null; status: string; decidedBy: string | null; deciderName: string | null; decidedAt: string | null; result: UndoResult | null; createdAt: string; template: string | null; fileName: string | null };

const isAdmin = (u: AppUser) => u.roles.includes("admin") || can(u, "users.manage");
const tplTitle = (t: string | null) => (t && TEMPLATES[t as TemplateKey]?.title) || t || "Import";

async function job(id: string) {
  const j = await get<Job>("SELECT id, kind, template, file_name, status, actor_id, created_at, finished_at, undone_at FROM jobs WHERE id = ?", id);
  if (!j) throw new WorkflowError("NOT_FOUND", "That job is gone.");
  return j;
}

// Whether this job can still be undone, and by when.
export async function undoState(user: AppUser, j: Pick<Job, "id" | "kind" | "template" | "status" | "actor_id" | "created_at" | "finished_at" | "undone_at">) {
  const hours = await undoHoursFor(j.template);
  const until = new Date(Date.parse(j.finished_at ?? j.created_at) + hours * 3600_000).toISOString();
  const changes = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM job_changes WHERE job_id = ?", j.id))?.c ?? 0);
  const pending = await get<{ id: string }>("SELECT id FROM job_undo_requests WHERE job_id = ? AND status = 'pending'", j.id);
  const t = j.template ? TEMPLATES[j.template as TemplateKey] : undefined;
  const mayAsk = j.actor_id === user.id || isAdmin(user) || (!!t && canUseTemplate(user, t));
  const why =
    j.kind !== "import" ? "Only imports can be undone."
    : j.undone_at ? "Already undone."
    : !/^completed/.test(j.status) ? "The import did not finish."
    : hours <= 0 ? "Admin has turned off undo for this import."
    : Date.now() > Date.parse(until) ? "The undo window has passed."
    : !changes ? "Nothing was recorded for this import (imports before 13 Nov 2026 cannot be undone)."
    : pending ? "An undo is already waiting for approval."
    : !mayAsk ? "Only the person who ran it, Admin or its team can ask."
    : null;
  return { can: !why, why, until, hours, changes, pendingId: pending?.id ?? null };
}

async function approverIds(template: string | null, except: string) {
  const cfg = await undoConfig();
  const admins = (await all<{ user_id: string }>("SELECT DISTINCT r.user_id FROM role_assignments r JOIN users u ON u.id = r.user_id WHERE r.role = 'admin' AND u.active = 1")).map((r) => r.user_id);
  if (cfg.approval !== "role" || !template) return admins.filter((id) => id !== except);
  const { loadUser } = await import("./users");
  const t = TEMPLATES[template as TemplateKey];
  const out = new Set(admins);
  for (const r of await all<{ id: string }>("SELECT id FROM users WHERE active = 1 LIMIT 500")) {
    if (out.has(r.id)) continue;
    const u = await loadUser(r.id).catch(() => null);
    if (u && t && canUseTemplate(u, t)) out.add(u.id);
  }
  out.delete(except);
  return [...out];
}

export async function mayApprove(user: AppUser, r: { requested_by: string; template: string | null }) {
  const cfg = await undoConfig();
  if (isAdmin(user)) return true;
  if (cfg.approval !== "role" || user.id === r.requested_by) return false;
  const t = r.template ? TEMPLATES[r.template as TemplateKey] : undefined;
  return !!t && canUseTemplate(user, t);
}

export async function requestUndo(user: AppUser, jobId: string, reason?: string) {
  const j = await job(jobId);
  const st = await undoState(user, j);
  if (!st.can) throw new WorkflowError("INVALID_STATE", st.why!);
  const cfg = await undoConfig();
  const id = uid("und_");
  await run("INSERT INTO job_undo_requests (id, job_id, requested_by, reason, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)", id, j.id, user.id, reason?.trim().slice(0, 500) || null, nowIso());
  await audit({ actor: user, jobId: j.id }, { action: "import.undo_requested", summary: `${user.name} asked to undo the ${tplTitle(j.template)} import${j.file_name ? ` (${j.file_name})` : ""}`, reason: reason ?? null });
  // No approval: the person undoes it straight away.
  if (cfg.approval === "none") return { id, status: "done" as const, result: await executeUndo(user, id) };
  await notify(await approverIds(j.template, user.id), { type: "job", title: "Undo request to approve", body: `${user.name} asked to undo the ${tplTitle(j.template)} import${j.file_name ? ` (${j.file_name})` : ""}.`, link: `/import-export?job=${j.id}`, dedupeKey: `undo:${id}` }, nowIso());
  return { id, status: "pending" as const, result: null };
}

export async function decideUndo(user: AppUser, requestId: string, approve: boolean, note?: string) {
  const r = await get<{ id: string; job_id: string; requested_by: string; status: string; template: string | null; file_name: string | null }>(
    "SELECT r.id, r.job_id, r.requested_by, r.status, j.template, j.file_name FROM job_undo_requests r JOIN jobs j ON j.id = r.job_id WHERE r.id = ?",
    requestId,
  );
  if (!r) throw new WorkflowError("NOT_FOUND", "That undo request is gone.");
  if (r.status !== "pending") throw new WorkflowError("INVALID_STATE", "That request was already decided.");
  if (!(await mayApprove(user, r))) throw new WorkflowError("FORBIDDEN", "Admin, or someone else who may run this import, approves the undo.");
  if (!approve) {
    await run("UPDATE job_undo_requests SET status = 'declined', decided_by = ?, decided_at = ?, result = ? WHERE id = ?", user.id, nowIso(), note ? JSON.stringify({ note }) : null, r.id);
    await audit({ actor: user, jobId: r.job_id }, { action: "import.undo_declined", summary: `${user.name} declined undoing the ${tplTitle(r.template)} import`, reason: note ?? null });
    await notify([r.requested_by], { type: "job", title: "Undo declined", body: `${user.name} declined undoing the ${tplTitle(r.template)} import.${note ? ` ${note}` : ""}`, link: `/import-export?job=${r.job_id}` }, nowIso());
    return { status: "declined" as const, result: null };
  }
  const result = await executeUndo(user, r.id);
  await notify([r.requested_by], { type: "job", title: "Import undone", body: `${user.name} approved it: ${result.reversed} changes put back${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}.`, link: `/import-export?job=${r.job_id}` }, nowIso(), user.id);
  return { status: "done" as const, result };
}

const q = (id: string) => `"${id.replace(/"/g, '""')}"`;
const meta = new Map<string, { cols: string[]; pk: string[] }>();
async function tableMeta(tbl: string) {
  const hit = meta.get(tbl);
  if (hit) return hit;
  const cols = (await all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = ? AND is_generated <> 'ALWAYS' ORDER BY ordinal_position", tbl)).map((c) => c.column_name);
  const pk = (await all<{ attname: string }>("SELECT a.attname FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey) WHERE i.indrelid = to_regclass(?) AND i.indisprimary", q(tbl))).map((r) => r.attname);
  const m = { cols, pk: pk.length ? pk : cols };
  meta.set(tbl, m);
  return m;
}

// Put back one job's changes, newest first, each inside a savepoint so one refusal never spoils the rest.
async function reverse(undoKey: string, changes: Change[]): Promise<UndoResult> {
  const out: UndoResult = { reversed: 0, skipped: [], tables: {} };
  let n = 0;
  for (const c of changes) {
    const m = await tableMeta(c.tbl);
    if (!m.cols.length) {
      out.skipped.push({ table: c.tbl, op: c.op, key: "", why: "The table no longer exists" });
      continue;
    }
    const img = (c.op === "DELETE" ? c.before_row : c.after_row)!;
    const keyObj = JSON.parse(img) as Record<string, unknown>;
    const key = m.pk.map((k) => String(keyObj[k] ?? "")).join(" · ").slice(0, 120);
    const T = q(c.tbl);
    const match = m.pk.map((k) => `t.${q(k)} IS NOT DISTINCT FROM r.${q(k)}`).join(" AND ");
    const sp = `undo_${++n}`;
    const skip = (why: string) => out.skipped.push({ table: c.tbl, op: c.op, key, why });
    const cur = await get<{ same: boolean | number }>(`SELECT (to_jsonb(t) = ?::jsonb) AS same FROM ${T} t, jsonb_populate_record(NULL::${T}, ?::jsonb) r WHERE ${match} LIMIT 1`, img, img);
    const same = cur ? cur.same === true || cur.same === 1 : null;
    if (c.op === "INSERT" && cur === undefined) continue; // already gone
    if (c.op === "UPDATE" && cur === undefined) { skip("Deleted since"); continue; }
    if (c.op !== "DELETE" && !same) { skip("Changed since the import"); continue; }
    if (c.op === "DELETE" && cur !== undefined) { skip("Added again since"); continue; }
    const mark = Number((await get<{ m: number }>("SELECT COALESCE(MAX(id), 0) AS m FROM job_changes WHERE job_id = ?", undoKey))?.m ?? 0);
    await run(`SAVEPOINT ${sp}`);
    try {
      if (c.op === "INSERT") await run(`DELETE FROM ${T} WHERE ctid = (SELECT t.ctid FROM ${T} t, jsonb_populate_record(NULL::${T}, ?::jsonb) r WHERE ${match} LIMIT 1)`, img);
      else if (c.op === "UPDATE")
        await run(`UPDATE ${T} t SET ${m.cols.map((k) => `${q(k)} = b.${q(k)}`).join(", ")} FROM jsonb_populate_record(NULL::${T}, ?::jsonb) b, jsonb_populate_record(NULL::${T}, ?::jsonb) r WHERE ${match}`, c.before_row!, img);
      else await run(`INSERT INTO ${T} (${m.cols.map(q).join(", ")}) SELECT ${m.cols.map((k) => `b.${q(k)}`).join(", ")} FROM jsonb_populate_record(NULL::${T}, ?::jsonb) b`, c.before_row!);
      // Anything else that moved with it (a cascade into records people added since) means it is not safe.
      const moved = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM job_changes WHERE job_id = ? AND id > ?", undoKey, mark))?.c ?? 0);
      if (moved > 1) {
        await run(`ROLLBACK TO SAVEPOINT ${sp}`);
        skip("Other records now depend on it");
        continue;
      }
      await run(`RELEASE SAVEPOINT ${sp}`);
      out.reversed++;
      out.tables[c.tbl] = (out.tables[c.tbl] ?? 0) + 1;
    } catch (e) {
      await run(`ROLLBACK TO SAVEPOINT ${sp}`);
      skip(e instanceof Error ? e.message.slice(0, 160) : "Could not be put back");
    }
  }
  return out;
}

export async function executeUndo(user: AppUser, requestId: string): Promise<UndoResult> {
  const r = await get<{ job_id: string }>("SELECT job_id FROM job_undo_requests WHERE id = ?", requestId);
  if (!r) throw new WorkflowError("NOT_FOUND", "That undo request is gone.");
  const j = await job(r.job_id);
  if (j.undone_at) throw new WorkflowError("INVALID_STATE", "Already undone.");
  const undoKey = `undo:${requestId}`;
  const result = await tx(async () => {
    const changes = await all<Change>("SELECT id, tbl, op, before_row, after_row FROM job_changes WHERE job_id = ? ORDER BY id DESC", j.id);
    await get("SELECT set_config('myseed.job_id', ?, true)", undoKey);
    const res = await reverse(undoKey, changes);
    await get("SELECT set_config('myseed.job_id', '', true)");
    const now = nowIso();
    await run("UPDATE job_undo_requests SET status = 'done', decided_by = COALESCE(decided_by, ?), decided_at = ?, result = ? WHERE id = ?", user.id, now, JSON.stringify(res), requestId);
    await run("UPDATE jobs SET undone_at = ? WHERE id = ?", now, j.id);
    return res;
  });
  // The undo's own change records were only needed to spot cascades.
  await run("DELETE FROM job_changes WHERE job_id = ?", undoKey);
  await audit(
    { actor: user, jobId: j.id },
    {
      action: "import.undone",
      summary: `${user.name} undid the ${tplTitle(j.template)} import${j.file_name ? ` (${j.file_name})` : ""}: ${result.reversed} changes put back${result.skipped.length ? `, ${result.skipped.length} skipped` : ""}`,
      newValue: { request: requestId, reversed: result.reversed, tables: result.tables, skipped: result.skipped.slice(0, 100) },
    },
  );
  return result;
}

const toReq = (r: Record<string, unknown>): UndoRequest => ({
  id: String(r.id),
  jobId: String(r.job_id),
  requestedBy: String(r.requested_by),
  requesterName: String(r.requester_name ?? "Someone"),
  reason: (r.reason as string) ?? null,
  status: String(r.status),
  decidedBy: (r.decided_by as string) ?? null,
  deciderName: (r.decider_name as string) ?? null,
  decidedAt: (r.decided_at as string) ?? null,
  result: r.result ? (JSON.parse(String(r.result)) as UndoResult) : null,
  createdAt: String(r.created_at),
  template: (r.template as string) ?? null,
  fileName: (r.file_name as string) ?? null,
});

const REQ_SQL = `SELECT r.*, j.template, j.file_name, u.name AS requester_name, d.name AS decider_name FROM job_undo_requests r JOIN jobs j ON j.id = r.job_id
  LEFT JOIN users u ON u.id = r.requested_by LEFT JOIN users d ON d.id = r.decided_by`;

// Requests this person can decide, plus their own, newest first.
export async function undoRequests(user: AppUser) {
  const rows = (await all<Record<string, unknown>>(`${REQ_SQL} ORDER BY r.created_at DESC LIMIT 60`)).map(toReq);
  const out: (UndoRequest & { canDecide: boolean })[] = [];
  for (const r of rows) {
    const canDecide = r.status === "pending" && (await mayApprove(user, { requested_by: r.requestedBy, template: r.template }));
    if (canDecide || r.requestedBy === user.id || isAdmin(user)) out.push({ ...r, canDecide });
  }
  return out;
}

export async function jobUndoRequests(jobId: string) {
  return (await all<Record<string, unknown>>(`${REQ_SQL} WHERE r.job_id = ? ORDER BY r.created_at DESC`, jobId)).map(toReq);
}
