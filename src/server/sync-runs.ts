import { all, get, nowIso, parseJson, run, uid } from "./db";

// The run log of every data collection (Update 1.2): Chapa transactions and, later, Noor tables. One row per run:
// what was asked (kind, window), where it got to (cursor: an interrupted run goes on from there), what it found
// (discovered, inserted, updated, skipped, failed, requests made) and how it ended. Failed requests are kept in
// sync_errors so nothing fails quietly.

export type SyncKind = "full" | "incremental" | "manual" | "reconcile";
// running: at work now. paused: out of time, goes on at the next call. partial: finished with windows that failed
// (retried by later runs). done / failed: ended.
export type SyncStatus = "running" | "paused" | "partial" | "done" | "failed";
export type SyncRun = {
  id: string;
  source: string;
  scopeId: string;
  kind: SyncKind;
  status: SyncStatus;
  from: string | null;
  until: string | null;
  cursor: string | null;
  discovered: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  requests: number;
  error: string | null;
  detail: Record<string, any>;
  startedBy: string | null;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  seconds: number;
};
type Row = {
  id: string; source: string; scope_id: string; kind: string; status: string; range_from: string | null; range_until: string | null; cursor: string | null;
  discovered: number; inserted: number; updated: number; skipped: number; failed: number; requests: number; error: string | null; detail_json: string | null;
  started_by: string | null; started_at: string; updated_at: string; finished_at: string | null;
};
const toRun = (r: Row): SyncRun => ({
  id: r.id, source: r.source, scopeId: r.scope_id, kind: r.kind as SyncKind, status: r.status as SyncStatus, from: r.range_from, until: r.range_until, cursor: r.cursor,
  discovered: Number(r.discovered), inserted: Number(r.inserted), updated: Number(r.updated), skipped: Number(r.skipped), failed: Number(r.failed), requests: Number(r.requests),
  error: r.error, detail: parseJson<Record<string, any>>(r.detail_json ?? "{}", {}), startedBy: r.started_by, startedAt: r.started_at, updatedAt: r.updated_at, finishedAt: r.finished_at,
  seconds: Math.max(0, Math.round((Date.parse(r.finished_at ?? r.updated_at) - Date.parse(r.started_at)) / 1000)),
});

export async function startRun(input: { source: string; scopeId: string; kind: SyncKind; from?: string | null; until?: string | null; cursor?: string | null; by?: string | null; detail?: Record<string, unknown> }): Promise<SyncRun> {
  const id = uid();
  const now = nowIso();
  await run(
    "INSERT INTO sync_runs (id, source, scope_id, kind, status, range_from, range_until, cursor, detail_json, started_by, started_at, updated_at) VALUES (?, ?, ?, ?, 'running', ?, ?, ?, ?, ?, ?, ?)",
    id, input.source, input.scopeId, input.kind, input.from ?? null, input.until ?? null, input.cursor ?? null, JSON.stringify(input.detail ?? {}), input.by ?? null, now, now,
  );
  return (await getRun(id))!;
}

export async function getRun(id: string): Promise<SyncRun | null> {
  const r = await get<Row>("SELECT * FROM sync_runs WHERE id = ?", id);
  return r ? toRun(r) : null;
}

// The run of this kind that has not ended (running, paused or partial), newest first.
export async function openRun(source: string, scopeId: string, kind: SyncKind): Promise<SyncRun | null> {
  const r = await get<Row>("SELECT * FROM sync_runs WHERE source = ? AND scope_id = ? AND kind = ? AND status IN ('running','paused','partial') ORDER BY started_at DESC LIMIT 1", source, scopeId, kind);
  return r ? toRun(r) : null;
}

// Counters are added to what the run has; cursor, status and detail replace.
export async function saveRun(
  id: string,
  p: { add?: Partial<Record<"discovered" | "inserted" | "updated" | "skipped" | "failed" | "requests", number>>; cursor?: string | null; status?: SyncStatus; error?: string | null; detail?: Record<string, unknown> },
) {
  const a = p.add ?? {};
  const now = nowIso();
  const ended = p.status === "done" || p.status === "failed" || p.status === "partial";
  await run(
    `UPDATE sync_runs SET discovered = discovered + ?, inserted = inserted + ?, updated = updated + ?, skipped = skipped + ?, failed = failed + ?, requests = requests + ?,
       cursor = CASE WHEN ? = 1 THEN ? ELSE cursor END, status = COALESCE(?, status), error = CASE WHEN ? = 1 THEN ? ELSE error END,
       detail_json = COALESCE(?, detail_json), updated_at = ?, finished_at = CASE WHEN ? = 1 THEN ? ELSE finished_at END WHERE id = ?`,
    a.discovered ?? 0, a.inserted ?? 0, a.updated ?? 0, a.skipped ?? 0, a.failed ?? 0, a.requests ?? 0,
    p.cursor !== undefined ? 1 : 0, p.cursor ?? null, p.status ?? null, p.error !== undefined ? 1 : 0, p.error ? p.error.slice(0, 1000) : null,
    p.detail ? JSON.stringify(p.detail) : null, now, ended ? 1 : 0, now, id,
  );
}

export async function runError(runId: string, request: string | null, status: number | null, message: string) {
  await run("INSERT INTO sync_errors (id, run_id, at, request, status, message) VALUES (?, ?, ?, ?, ?, ?)", uid(), runId, nowIso(), request?.slice(0, 500) ?? null, status, message.slice(0, 1000));
}

export async function listRuns(source: string, scopeIds: string[], limit = 30): Promise<SyncRun[]> {
  if (!scopeIds.length) return [];
  return (await all<Row>(`SELECT * FROM sync_runs WHERE source = ? AND scope_id IN (${scopeIds.map(() => "?").join(",")}) ORDER BY started_at DESC LIMIT ?`, source, ...scopeIds, Math.min(200, limit))).map(toRun);
}

export async function runErrors(runId: string, limit = 50) {
  return all<{ at: string; request: string | null; status: number | null; message: string }>("SELECT at, request, status, message FROM sync_errors WHERE run_id = ? ORDER BY at DESC LIMIT ?", runId, limit);
}

// A run left "running" by a process that died is paused, so the next call can carry on from its cursor.
export async function reviveStaleRuns(source: string, olderThanMs = 10 * 60e3) {
  await run("UPDATE sync_runs SET status = 'paused' WHERE source = ? AND status = 'running' AND updated_at < ?", source, new Date(Date.now() - olderThanMs).toISOString());
}

// Old run rows are dropped; the newest of each scope stay.
export async function pruneRuns(days = 90) {
  await run("DELETE FROM sync_runs WHERE started_at < ? AND status IN ('done','failed')", new Date(Date.now() - days * 86400e3).toISOString());
}
