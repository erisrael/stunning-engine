import { all, get, nowIso, run } from "./db";
import type { AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { getMeta, setMeta } from "./settings";
import * as H from "./chapa-hub";
import { getRun, listRuns, openRun, reviveStaleRuns, runError, runErrors, saveRun, startRun, type SyncRun } from "./sync-runs";

// Reading every transaction of a Chapa business (Update 1.2, Phase 1).
//
// Chapa documents from_date, to_date, status and currency on GET /v1/transactions, and no page parameters. So:
//   - Windows. When Chapa applies the date filter (checked once a week per business: a day in 2015 must come back
//     empty), history is read in date windows. Inside a window every page Chapa offers is followed. When Chapa
//     offers none and the answer looks full (a round number of rows, or the most this business ever returned), the
//     window is read again as two halves; more rows in the halves proves the answer was cut, and the halves are
//     split further. Nothing ends on a guess.
//   - Pages. When Chapa ignores the date filter, the whole list is read page by page until Chapa says there is no
//     next page, a page comes back empty, or a page repeats (the page number is ignored).
//   - A full run reads back from now, a week at a time, until a year of empty weeks; it saves where it got to
//     after each window and carries on from there at the next call. A window that fails is kept and tried again.
//   - A normal run reads from the last good sync, with a two-hour overlap.
//   - Reconciliation reads a range again and compares it with what is stored, by status, then repairs.
// Every run is a row in sync_runs; every failed request a row in sync_errors.

const HOUR = 3600e3;
const DAY = 86400e3;
const FLOOR = Date.parse("2019-01-01T00:00:00Z");
const FULL_WINDOW = 7 * DAY;
const EMPTY_WINDOWS_END = 52;
const PAGE_LIMIT = 20_000;
const fmt = (ms: number) => new Date(ms).toISOString().slice(0, 19);
const iso = (ms: number) => new Date(ms).toISOString();
const dayStartMs = (day: string) => Date.parse(`${day}T00:00:00Z`) - 3 * HOUR;
const addisDay = (t: number) => new Date(t + 3 * HOUR).toISOString().slice(0, 10);

type Raw = Record<string, any>;
type Counts = { discovered: number; inserted: number; updated: number; skipped: number; failed: number };
type Ctx = {
  r: H.AccRow;
  runId: string;
  requests: number;
  saved: number; // requests already written to the run
  cap: number | null;
  capped: number;
  dupes: number;
  votes: { utc: number; addis: number };
  sample: Raw | null; // a row whose date has no zone
  zoneAsked: boolean;
  notes: string[];
  deadline: number;
};

class ChapaApiError extends Error {
  constructor(public request: string, public status: number, message: string) {
    super(message);
  }
}

const keyOf = (x: Raw) => String(x.tx_ref ?? x.trx_ref ?? x.trans_id ?? x.ref_id ?? x.chapa_reference ?? x.reference ?? x.id ?? JSON.stringify(x));
const messageOf = (res: { status: number; json: unknown }) => {
  const m = (res.json as { message?: unknown } | null)?.message;
  return typeof m === "string" ? m : m ? JSON.stringify(m).slice(0, 200) : `HTTP ${res.status}`;
};
const note = (ctx: Ctx, text: string) => void (ctx.notes.includes(text) || ctx.notes.push(text));

// Chapa's "next page" address may name another host or scheme (a proxy in front of it): only its path is used,
// and the window's dates are kept on it.
function carry(next: string, base: string) {
  const b = new URL(base, "https://chapa.invalid");
  const u = new URL(next, "https://chapa.invalid");
  // per_page too: Chapa's next link leaves it out, and page 2 at another page size repeats rows of page 1, which
  // read as "the page number is ignored" and ended a full read after one page.
  for (const k of ["from_date", "to_date", "status", "currency", "per_page"]) if (b.searchParams.has(k) && !u.searchParams.has(k)) u.searchParams.set(k, b.searchParams.get(k)!);
  return `${u.pathname}${u.search}`;
}
function withPage(base: string, page: number) {
  const u = new URL(base, "https://chapa.invalid");
  u.searchParams.set("page", String(page));
  return `${u.pathname}${u.search}`;
}

// Every page of one list request. onPage gets the rows not seen before and the address of the next page (null at
// the end); returning true stops the reading there.
async function fetchPages(ctx: Ctx, base: string, onPage?: (rows: Raw[], next: string | null) => Promise<boolean | void>) {
  const seen = new Set<string>();
  const rows: Raw[] = [];
  let path = base;
  let page = Number(new URL(base, "https://chapa.invalid").searchParams.get("page")) || 1;
  for (let n = 0; n < PAGE_LIMIT; n++) {
    const res = await H.chapaApi(ctx.r, path);
    ctx.requests++;
    if (!res.ok) throw new ChapaApiError(path, res.status, messageOf(res));
    const { list, next, lastPage, hasNext } = H.parseTxList(res.json);
    if (!list.length) return { rows, ended: "empty" as const, pagingIgnored: false };
    const inPage = new Set<string>();
    const fresh: Raw[] = [];
    for (const x of list as Raw[]) {
      const k = keyOf(x);
      if (inPage.has(k)) ctx.dupes++;
      else if (!seen.has(k)) fresh.push(x);
      inPage.add(k);
    }
    // The same rows again: the page number was ignored. This is the end of what this request can give.
    if (!fresh.length) return { rows, ended: "repeat" as const, pagingIgnored: true };
    for (const x of fresh) seen.add(keyOf(x));
    rows.push(...fresh);
    let following: string | null;
    if (next) following = carry(next, base);
    else if (lastPage && page < lastPage) following = withPage(base, page + 1);
    else if (hasNext === false || (lastPage && page >= lastPage)) following = null;
    else following = withPage(base, page + 1); // Chapa said nothing about paging: ask for the next page and see
    if (onPage && (await onPage(fresh, following)) === true) return { rows, ended: "stopped" as const, pagingIgnored: false };
    if (!following) return { rows, ended: "provider" as const, pagingIgnored: false };
    path = following;
    page++;
  }
  note(ctx, `Reading stopped after ${PAGE_LIMIT.toLocaleString()} pages of one request; the rest is read by the next run.`);
  return { rows, ended: "limit" as const, pagingIgnored: false };
}

// Dates without a zone: which zone puts them inside the window that was asked for (in UTC)?
function vote(ctx: Ctx, rows: Raw[], from: number, to: number) {
  for (const x of rows) {
    const s = String(x.created_at ?? x.createdAt ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s) || /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(s)) continue;
    const utc = Date.parse(`${s.replace(" ", "T")}Z`);
    if (Number.isNaN(utc)) continue;
    ctx.sample ??= x;
    const inUtc = utc >= from - 1000 && utc <= to + 1000;
    const inAddis = utc - 3 * HOUR >= from - 1000 && utc - 3 * HOUR <= to + 1000;
    if (inUtc !== inAddis) ctx.votes[inUtc ? "utc" : "addis"]++;
  }
}
async function settleZone(ctx: Ctx) {
  // Not known yet and the windows were too wide to tell: ask Chapa for the very second of one payment, read as
  // UTC and then as Addis Ababa time. The reading that returns the payment is the zone. Asked once per business.
  if (!ctx.r.date_zone && ctx.sample && !ctx.zoneAsked && ctx.votes.utc + ctx.votes.addis < 3) {
    ctx.zoneAsked = true;
    const utc = Date.parse(`${String(ctx.sample.created_at ?? ctx.sample.createdAt).trim().replace(" ", "T")}Z`);
    for (const [zone, at] of [["utc", utc], ["addis", utc - 3 * HOUR]] as const) {
      const res = await H.chapaApi(ctx.r, `/v1/transactions?from_date=${fmt(at)}&to_date=${fmt(at + 1000)}`);
      ctx.requests++;
      if (res.ok && (H.parseTxList(res.json).list as Raw[]).some((x) => keyOf(x) === keyOf(ctx.sample!))) {
        ctx.votes[zone] += 3;
        break;
      }
    }
  }
  const total = ctx.votes.utc + ctx.votes.addis;
  if (total < 3) return;
  const winner = ctx.votes.utc >= ctx.votes.addis ? "utc" : "addis";
  if (ctx.votes[winner] / total < 0.9) return;
  if (ctx.r.date_zone === winner) return;
  const first = !ctx.r.date_zone;
  if (first && winner === "addis") {
    ctx.r.date_zone = winner;
    await run("UPDATE chapa_accounts SET date_zone = ? WHERE id = ?", winner, ctx.r.id);
    return;
  }
  ctx.r.date_zone = winner;
  await run("UPDATE chapa_accounts SET date_zone = ? WHERE id = ?", winner, ctx.r.id);
  note(ctx, winner === "utc" ? "Chapa's dates for this business are in UTC; stored dates are corrected as they are read again." : "Chapa's dates for this business are in Addis Ababa time.");
}

// One date window, complete: split in two for as long as an answer without pages looks cut.
async function fetchWindow(ctx: Ctx, from: number, to: number, depth = 0): Promise<Map<string, Raw>> {
  const got = await fetchPages(ctx, `/v1/transactions?from_date=${fmt(from)}&to_date=${fmt(to)}`);
  vote(ctx, got.rows, from, to);
  const out = new Map(got.rows.map((x) => [keyOf(x), x]));
  const n = got.rows.length;
  const looksCut = got.pagingIgnored && (ctx.cap ? n >= ctx.cap : n >= 10 && n % 5 === 0);
  if (!looksCut) return out;
  if (to - from <= 60_000 || depth >= 24) {
    ctx.capped++;
    note(ctx, `Chapa returned ${n} rows for ${fmt(from)} to ${fmt(to)} UTC and offers no further page. Some payments of that minute may be missing.`);
    return out;
  }
  const mid = from + Math.floor((to - from) / 2000) * 1000;
  for (const [a, b] of [[from, mid], [mid, to]] as const) for (const [k, v] of await fetchWindow(ctx, a, b, depth + 1)) out.set(k, v);
  if (out.size > n) ctx.cap = ctx.cap ? Math.min(ctx.cap, n) : n;
  return out;
}

// Does this business's API apply from_date and to_date? Asked once a week: a day long before Chapa existed.
async function usesDateFilter(ctx: Ctx, force = false): Promise<boolean> {
  const r = ctx.r;
  if (!force && r.date_filter && r.date_filter_checked_at && Date.now() - Date.parse(r.date_filter_checked_at) < 7 * DAY) return r.date_filter === "yes";
  const path = "/v1/transactions?from_date=2015-01-01T00:00:00&to_date=2015-01-02T00:00:00";
  const res = await H.chapaApi(r, path);
  ctx.requests++;
  if (res.status === 401 || res.status === 403 || res.status >= 500) throw new ChapaApiError(path, res.status, messageOf(res));
  const yes = res.ok && H.parseTxList(res.json).list.length === 0;
  r.date_filter = yes ? "yes" : "no";
  r.date_filter_checked_at = nowIso();
  await run("UPDATE chapa_accounts SET date_filter = ?, date_filter_checked_at = ? WHERE id = ?", r.date_filter, r.date_filter_checked_at, r.id);
  return yes;
}

// Store what was read. A row with no reference at all cannot be kept apart from others: it is logged, not dropped.
async function store(ctx: Ctx, raws: Iterable<Raw>, source: string, fallbackDate?: string): Promise<Counts> {
  const c: Counts = { discovered: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const parsed: H.ParsedTx[] = [];
  for (const x of raws) {
    c.discovered++;
    const t = H.txFromApi(x, ctx.r);
    if (t.txRef) parsed.push(t);
    else {
      c.failed++;
      await runError(ctx.runId, null, null, `A transaction without any reference was not stored: ${JSON.stringify(x).slice(0, 300)}`);
    }
  }
  for (let i = 0; i < parsed.length; i += 200) {
    const chunk = parsed.slice(i, i + 200);
    const known = new Map((await all<H.StoredTx>(`SELECT ${H.STORED_TX} FROM chapa_transactions WHERE account_id = ? AND tx_ref IN (${chunk.map(() => "?").join(",")})`, ctx.r.id, ...chunk.map((t) => t.txRef))).map((x) => [x.tx_ref, x]));
    for (const t of chunk) {
      try {
        const { previous, op } = await H.upsertTx(ctx.r.id, t, source, { known: known.get(t.txRef), fallbackDate });
        c[op]++;
        await H.afterStatus(ctx.r.id, t, previous);
      } catch (e) {
        c.failed++;
        await runError(ctx.runId, null, null, `${t.txRef} was not stored: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }
  return c;
}

const flush = async (ctx: Ctx, p: Parameters<typeof saveRun>[1] = {}) => {
  const requests = ctx.requests - ctx.saved;
  ctx.saved = ctx.requests;
  await saveRun(ctx.runId, { ...p, add: { ...(p.add ?? {}), requests } });
};

export type ChapaSyncResult = { runId: string; rows: number; pages: number; inserted: number; updated: number; skipped: number; failed: number; complete: boolean; status: string; mode: "windows" | "pages"; notes: string[] };

// Full history by date windows, newest first, resumable.
async function fullByWindows(ctx: Ctx, runRow: SyncRun, progress: (m: string) => Promise<void>) {
  // attempts was counted by runChapaSync before this call.
  const d = { emptyWindows: 0, failedWindows: [] as [number, number][], attempts: 1, ...(runRow.detail as object) } as { emptyWindows: number; failedWindows: [number, number][]; attempts: number; [k: string]: unknown };
  let cursor = Date.parse(runRow.cursor ?? "") || Date.parse(runRow.until ?? nowIso());
  let rows = runRow.discovered;
  let paused = false;
  let failuresInARow = 0;
  const one = async (from: number, to: number) => {
    const map = await fetchWindow(ctx, from, to);
    await settleZone(ctx);
    const c = await store(ctx, map.values(), "sync", iso(to));
    rows += c.discovered;
    return c;
  };
  // Windows that failed in an earlier attempt come first.
  const retry = d.failedWindows;
  d.failedWindows = [];
  for (const [from, to] of retry) {
    try {
      await flush(ctx, { add: await one(from, to) });
    } catch (e) {
      d.failedWindows.push([from, to]);
      await runError(ctx.runId, e instanceof ChapaApiError ? e.request : null, e instanceof ChapaApiError ? e.status : null, e instanceof Error ? e.message : String(e));
    }
  }
  while (cursor > FLOOR && d.emptyWindows < EMPTY_WINDOWS_END) {
    if (Date.now() > ctx.deadline) {
      paused = true;
      break;
    }
    const from = Math.max(FLOOR, cursor - FULL_WINDOW);
    try {
      const c = await one(from, cursor);
      d.emptyWindows = c.discovered ? 0 : d.emptyWindows + 1;
      failuresInARow = 0;
      cursor = from;
      await flush(ctx, { add: c, cursor: iso(cursor), detail: d });
    } catch (e) {
      await runError(ctx.runId, e instanceof ChapaApiError ? e.request : null, e instanceof ChapaApiError ? e.status : null, e instanceof Error ? e.message : String(e));
      d.failedWindows.push([from, cursor]);
      cursor = from;
      await flush(ctx, { add: { failed: 1 }, cursor: iso(cursor), detail: d });
      // Chapa is down or the key is refused: stop, the run carries on later from here.
      if (++failuresInARow >= 3) throw e;
    }
    await progress(`${ctx.r.name}: ${rows.toLocaleString()} transactions read, back to ${addisDay(cursor)}`);
  }
  if (paused) return { status: "paused" as const, complete: false, detail: d };
  if (d.failedWindows.length) return { status: d.attempts >= 6 ? ("failed" as const) : ("partial" as const), complete: false, detail: d };
  return { status: "done" as const, complete: ctx.capped === 0, detail: d };
}

// From the last good sync to now, a day at a time.
async function recentByWindows(ctx: Ctx, from: number, to: number, source = "sync") {
  const total: Counts = { discovered: 0, inserted: 0, updated: 0, skipped: 0, failed: 0 };
  const all = new Map<string, Raw>();
  for (let a = from; a < to; a += DAY) {
    const b = Math.min(to, a + DAY);
    const map = await fetchWindow(ctx, a, b);
    await settleZone(ctx);
    for (const [k, v] of map) all.set(k, v);
    if (source) {
      const c = await store(ctx, map.values(), source, iso(b));
      for (const k of Object.keys(total) as (keyof Counts)[]) total[k] += c[k];
      await flush(ctx, { add: c, cursor: iso(b) });
    }
  }
  return { counts: total, rows: all };
}

// The whole list, page by page (Chapa ignored the date filter). A normal run stops at the last sync when the list
// is newest first; a list that is oldest first is read to its end.
async function byPages(ctx: Ctx, runRow: SyncRun, full: boolean, since: number, progress: (m: string) => Promise<void>) {
  let rows = runRow.discovered;
  let paused = false;
  let ascending = false;
  let last = 0;
  const got = await fetchPages(ctx, runRow.cursor?.startsWith("/v1/") ? runRow.cursor : "/v1/transactions?page=1&per_page=100", async (fresh, next) => {
    const dates = fresh.map((x) => Date.parse(H.parseChapaDate(x.created_at ?? x.createdAt ?? x.date, H.chapaZoneOf(ctx.r)) ?? "")).filter((t) => !Number.isNaN(t));
    if (dates.length > 1 && dates[0] < dates[dates.length - 1]) ascending = true;
    const c = await store(ctx, fresh, "sync");
    rows += c.discovered;
    last = fresh.length;
    await flush(ctx, { add: c, cursor: next });
    await progress(`${ctx.r.name}: ${rows.toLocaleString()} transactions read`);
    // Newest first: a page that reaches back past the last sync is the last one needed.
    const descending = dates.length > 1 && dates[0] > dates[dates.length - 1];
    if (!full && since && !ascending && dates.length && (descending ? Math.min(...dates) : Math.max(...dates)) < since) return true;
    if (next && Date.now() > ctx.deadline) return (paused = true);
  });
  if (ascending) note(ctx, "Chapa lists this business's transactions oldest first, so every page is read on each sync.");
  if (paused) return { status: "paused" as const, complete: false };
  if (got.ended === "limit") return { status: "paused" as const, complete: false };
  // One answer and no way to ask for more: say so when it looks full.
  if (got.pagingIgnored && got.rows.length === last && last >= 10 && last % 5 === 0) {
    note(ctx, `Chapa returned ${last} transactions, applies neither a date range nor a page number for this business, so older payments cannot be read through the API. New payments still arrive by webhook.`);
    return { status: "done" as const, complete: false };
  }
  return { status: "done" as const, complete: true };
}

export async function runChapaSync(accountId: string, opts: { full?: boolean; budgetMs?: number; by?: string | null } = {}, progress: (m: string) => Promise<void> = async () => {}): Promise<ChapaSyncResult> {
  await reviveStaleRuns("chapa");
  const r = await H.accRow(accountId);
  // No run is started with a key that cannot be used: every request would fail the same way.
  const keyProblem = await H.chapaKeyProblem(r);
  if (keyProblem) {
    await run("UPDATE chapa_accounts SET health = 'error', last_error = ?, last_sync_at = ? WHERE id = ?", keyProblem, nowIso(), accountId);
    throw new WorkflowError("INVALID_STATE", keyProblem);
  }
  const now = Date.now();
  const full = !!opts.full || !r.backfilled_at;
  const open = full ? await openRun("chapa", accountId, "full") : null;
  // Each call that works on a full run is one attempt, counted before anything can fail, so a run that keeps
  // failing ends after six attempts instead of being taken up again on every tick.
  if (open) open.detail = { ...open.detail, attempts: Number(open.detail.attempts ?? 0) + 1 };
  const lastGood = Date.parse(r.last_ok_sync_at ?? r.last_sync_at ?? "") || now - 7 * DAY;
  const since = Math.max(lastGood - 2 * HOUR, now - 30 * DAY);
  const runRow = open ?? (await startRun({ source: "chapa", scopeId: accountId, kind: full ? "full" : "incremental", from: full ? null : iso(since), until: iso(now + 5 * 60e3), by: opts.by ?? null }));
  if (open) await saveRun(open.id, { status: "running", error: null, detail: open.detail });
  else if (full) await saveRun(runRow.id, { detail: (runRow.detail = { ...runRow.detail, attempts: 1 }) });
  const ctx: Ctx = { r, runId: runRow.id, requests: 0, saved: 0, cap: r.row_cap ?? null, capped: 0, dupes: 0, votes: { utc: 0, addis: 0 }, sample: null, zoneAsked: false, notes: [], deadline: now + (opts.budgetMs ?? 4 * 60e3) };
  let mode: "windows" | "pages" = "pages";
  try {
    const windows = await usesDateFilter(ctx);
    mode = windows ? "windows" : "pages";
    let end: { status: "paused" | "partial" | "failed" | "done"; complete: boolean; detail?: Record<string, unknown> };
    if (windows && full) end = await fullByWindows(ctx, runRow, progress);
    else if (windows) {
      await recentByWindows(ctx, since, now + 5 * 60e3);
      end = { status: "done", complete: ctx.capped === 0 };
    } else end = await byPages(ctx, runRow, full, since, progress);
    const detail = { ...(end.detail ?? runRow.detail), mode, notes: ctx.notes, rowCap: ctx.cap, duplicatesInAnswers: ctx.dupes };
    await flush(ctx, { status: end.status, detail, error: end.status === "failed" ? "Some date windows could not be read after six attempts." : null });
    const after = (await getRun(runRow.id))!;
    const good = end.status === "done";
    await run(
      `UPDATE chapa_accounts SET last_sync_at = ?, last_sync_rows = ?, health = ?, last_error = ?, row_cap = COALESCE(?, row_cap),
         last_ok_sync_at = CASE WHEN ? = 1 THEN ? ELSE last_ok_sync_at END, backfilled_at = CASE WHEN ? = 1 THEN COALESCE(backfilled_at, ?) ELSE backfilled_at END WHERE id = ?`,
      nowIso(), after.discovered, end.status === "failed" ? "error" : end.complete || end.status === "paused" ? "ok" : "partial", end.status === "failed" ? after.error : end.complete ? null : (ctx.notes[0] ?? null), ctx.cap,
      good ? 1 : 0, runRow.startedAt, good && full && end.complete ? 1 : 0, nowIso(), accountId,
    );
    return { runId: runRow.id, rows: after.discovered, pages: after.requests, inserted: after.inserted, updated: after.updated, skipped: after.skipped, failed: after.failed, complete: good && end.complete, status: end.status, mode, notes: ctx.notes };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await runError(ctx.runId, e instanceof ChapaApiError ? e.request : null, e instanceof ChapaApiError ? e.status : null, msg);
    // A full run keeps its place and goes on at the next call; a normal run simply starts again from the last good sync.
    const attempts = Number(((await getRun(runRow.id))?.detail.attempts as number) ?? 0);
    await flush(ctx, { status: full && attempts < 6 ? "paused" : "failed", error: msg });
    await run("UPDATE chapa_accounts SET health = 'error', last_error = ?, last_sync_at = ? WHERE id = ?", msg.slice(0, 500), nowIso(), accountId);
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Reconciliation: Chapa's list for a range against what is stored, then repair.
// ---------------------------------------------------------------------------

type ByStatus = Record<string, { n: number; sum: number }>;
export type ChapaReconcile = {
  runId: string;
  accountId: string;
  business: string;
  from: string;
  until: string;
  mode: "windows" | "pages";
  provider: { total: number; byStatus: ByStatus; undated: number; duplicates: number };
  localBefore: { total: number; byStatus: ByStatus };
  localAfter: { total: number; byStatus: ByStatus };
  missing: { txRef: string; status: string; amount: number; currency: string; createdAt: string | null }[];
  missingCount: number;
  statusChanged: { txRef: string; was: string; now: string }[];
  statusChangedCount: number;
  datedDifferently: number;
  localOnly: { txRef: string; status: string; amount: number; createdAt: string }[];
  localOnlyCount: number;
  localDuplicates: number;
  repaired: { inserted: number; updated: number };
  notes: string[];
  checkedAt: string;
};

const tally = (rows: { status: string; amount: number }[]) => {
  const out: ByStatus = {};
  for (const r of rows) {
    const s = (out[r.status] ??= { n: 0, sum: 0 });
    s.n++;
    s.sum += Number(r.amount) || 0;
  }
  return out;
};

export async function reconcileChapaBusiness(accountId: string, from: string, until: string, by: string | null = null): Promise<ChapaReconcile> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(until) || from > until) throw new WorkflowError("VALIDATION", "Choose a start and an end day.");
  const a = dayStartMs(from);
  const b = dayStartMs(until) + DAY;
  if (b - a > 93 * DAY) throw new WorkflowError("VALIDATION", "Reconcile up to three months at a time.");
  const r = await H.accRow(accountId);
  const runRow = await startRun({ source: "chapa", scopeId: accountId, kind: "reconcile", from: iso(a), until: iso(b), by });
  const ctx: Ctx = { r, runId: runRow.id, requests: 0, saved: 0, cap: r.row_cap ?? null, capped: 0, dupes: 0, votes: { utc: 0, addis: 0 }, sample: null, zoneAsked: false, notes: [], deadline: Date.now() + 10 * 60e3 };
  try {
    const windows = await usesDateFilter(ctx);
    let raws: Raw[];
    if (windows) raws = [...(await recentByWindows(ctx, a, Math.min(b, Date.now() + 5 * 60e3), "")).rows.values()];
    else {
      raws = (await fetchPages(ctx, "/v1/transactions?page=1&per_page=100")).rows;
      note(ctx, "Chapa did not apply the date range for this business, so its whole list was read and compared by date here.");
    }
    const parsed = raws.map((x) => H.txFromApi(x, ctx.r)).filter((t) => t.txRef);
    const undated = parsed.filter((t) => !t.createdAt).length;
    const inRange = parsed.filter((t) => !t.createdAt || (Date.parse(t.createdAt) >= a && Date.parse(t.createdAt) < b));
    const localSql = `SELECT ${H.STORED_TX} FROM chapa_transactions WHERE account_id = ? AND created_at >= ? AND created_at < ?`;
    const local = await all<H.StoredTx>(localSql, accountId, iso(a), iso(b));
    const byKey = new Map<string, H.StoredTx>();
    for (const l of local) {
      byKey.set(l.tx_ref, l);
      if (l.ref_id) byKey.set(l.ref_id, l);
    }
    const matched = new Set<string>();
    const missing: ChapaReconcile["missing"] = [];
    const statusChanged: ChapaReconcile["statusChanged"] = [];
    let datedDifferently = 0;
    for (const t of inRange) {
      const l = byKey.get(t.txRef) ?? (t.refId ? byKey.get(t.refId) : undefined);
      if (l) {
        matched.add(l.tx_ref);
        if (l.status !== t.status) statusChanged.push({ txRef: l.tx_ref, was: l.status, now: t.status });
        continue;
      }
      const elsewhere = await get<{ status: string }>("SELECT status FROM chapa_transactions WHERE account_id = ? AND (tx_ref = ? OR ref_id = ? OR tx_ref = ?)", accountId, t.txRef, t.refId ?? t.txRef, t.refId ?? t.txRef);
      if (elsewhere) datedDifferently++;
      else missing.push({ txRef: t.txRef, status: t.status, amount: t.amount, currency: t.currency, createdAt: t.createdAt });
    }
    const localOnly = local.filter((l) => !matched.has(l.tx_ref)).map((l) => ({ txRef: l.tx_ref, status: l.status, amount: Number(l.amount), createdAt: l.created_at }));
    const dup = await get<{ n: number | string }>(
      "SELECT COUNT(*) AS n FROM (SELECT ref_id FROM chapa_transactions WHERE account_id = ? AND created_at >= ? AND created_at < ? AND ref_id IS NOT NULL GROUP BY ref_id HAVING COUNT(*) > 1) d",
      accountId, iso(a), iso(b),
    );
    await settleZone(ctx);
    const c = await store(ctx, windows ? raws : inRange.map((t) => t.raw), "reconcile", iso(b));
    const localAfter = await all<H.StoredTx>(localSql, accountId, iso(a), iso(b));
    if (localOnly.length && windows) note(ctx, "Payments stored here that Chapa's list did not return usually came from a webhook or a verification with a date outside this range on Chapa's side.");
    const out: ChapaReconcile = {
      runId: runRow.id, accountId, business: r.name, from, until, mode: windows ? "windows" : "pages",
      provider: { total: inRange.length, byStatus: tally(inRange), undated, duplicates: ctx.dupes },
      localBefore: { total: local.length, byStatus: tally(local) },
      localAfter: { total: localAfter.length, byStatus: tally(localAfter) },
      missing: missing.slice(0, 200), missingCount: missing.length,
      statusChanged: statusChanged.slice(0, 200), statusChangedCount: statusChanged.length,
      datedDifferently,
      localOnly: localOnly.slice(0, 200), localOnlyCount: localOnly.length,
      localDuplicates: Number(dup?.n ?? 0),
      repaired: { inserted: c.inserted, updated: c.updated },
      notes: ctx.notes, checkedAt: nowIso(),
    };
    await flush(ctx, { add: c, status: "done", detail: out as unknown as Record<string, unknown> });
    return out;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await runError(ctx.runId, e instanceof ChapaApiError ? e.request : null, e instanceof ChapaApiError ? e.status : null, msg);
    await flush(ctx, { status: "failed", error: msg });
    throw e;
  }
}

export async function reconcileChapa(user: AppUser, accountId: string, from: string, until: string) {
  if (!(await H.chapaCan(user, "verify", accountId))) throw new WorkflowError("FORBIDDEN", "Reconciling is not allowed for your role on this business.");
  const out = await reconcileChapaBusiness(accountId, from, until, user.id).catch((e) => {
    // What Chapa answered is what the person needs to read, not "something went wrong".
    throw e instanceof WorkflowError ? e : new WorkflowError("INVALID_STATE", `Chapa could not be read: ${e instanceof Error ? e.message : String(e)}`);
  });
  await audit({ actor: user }, { action: "finance.chapa_reconcile", summary: `${user.name} reconciled ${out.business} ${from} to ${until}: Chapa ${out.provider.total}, here ${out.localBefore.total} before and ${out.localAfter.total} after (${out.missingCount} were missing)` });
  return out;
}

// Each night: the last seven days of every active business. A gap is repaired and Admin is told.
export async function scheduledChapaReconcile(now = Date.now()) {
  const day = addisDay(now);
  if (new Date(now + 3 * HOUR).getUTCHours() < 2) return;
  for (const a of await all<{ id: string; name: string }>("SELECT id, name FROM chapa_accounts WHERE active = 1 AND backfilled_at IS NOT NULL")) {
    const key = `chapaReconcile:${a.id}`;
    if ((await getMeta(key)) === day) continue;
    await setMeta(key, day);
    try {
      const r = await reconcileChapaBusiness(a.id, addisDay(now - 7 * DAY), day);
      if (r.missingCount || r.statusChangedCount) {
        const { alertAdmins } = await import("./ops");
        await alertAdmins(`Chapa: ${a.name} had payments missing here`, `The nightly check of the last 7 days found ${r.missingCount} payment(s) missing and ${r.statusChangedCount} with another status. They have been corrected. Chapa ${r.provider.total}, stored now ${r.localAfter.total}.`, "/finance/chapa?tab=sync", `chapa-reconcile:${a.id}`);
      }
    } catch (e) {
      console.error(`Chapa reconcile failed for ${a.name}`, e);
    }
  }
}

// ---------------------------------------------------------------------------
// What the Sync page shows
// ---------------------------------------------------------------------------

export async function chapaSyncState(user: AppUser, biz?: string | null) {
  const list = (await H.chapaBusinesses(user)).filter((b) => !biz || biz === "all" || b.id === biz);
  const ids = list.map((b) => b.id);
  const rows = ids.length
    ? await all<{ id: string; date_filter: string | null; date_zone: string | null; row_cap: number | null; last_ok_sync_at: string | null; stored: number | string; undated: number | string; first_at: string | null; last_at: string | null }>(
        `SELECT a.id, a.date_filter, a.date_zone, a.row_cap, a.last_ok_sync_at,
                (SELECT COUNT(*) FROM chapa_transactions t WHERE t.account_id = a.id) AS stored,
                (SELECT COUNT(*) FROM chapa_transactions t WHERE t.account_id = a.id AND t.date_flag = 1) AS undated,
                (SELECT MIN(created_at) FROM chapa_transactions t WHERE t.account_id = a.id) AS first_at,
                (SELECT MAX(created_at) FROM chapa_transactions t WHERE t.account_id = a.id) AS last_at
         FROM chapa_accounts a WHERE a.id IN (${ids.map(() => "?").join(",")})`,
        ...ids,
      )
    : [];
  const extra = new Map(rows.map((x) => [x.id, x]));
  const runs = await listRuns("chapa", ids, 60);
  return {
    businesses: list.map((b) => {
      const x = extra.get(b.id);
      const open = runs.find((r) => r.scopeId === b.id && r.kind === "full" && ["running", "paused", "partial"].includes(r.status));
      return {
        id: b.id, name: b.name, mode: b.mode, health: b.health, lastError: b.lastError, lastSyncAt: b.lastSyncAt, lastOkSyncAt: x?.last_ok_sync_at ?? null, backfilled: b.backfilled, syncMinutes: b.syncMinutes,
        dateFilter: x?.date_filter ?? null, dateZone: x?.date_zone ?? null, rowCap: x?.row_cap ?? null, stored: Number(x?.stored ?? 0), undated: Number(x?.undated ?? 0), firstAt: x?.first_at ?? null, lastAt: x?.last_at ?? null,
        canSync: b.rights.verify, fullRun: open ? { id: open.id, status: open.status, cursor: open.cursor, discovered: open.discovered } : null,
      };
    }),
    runs: runs.map((r) => ({ ...r, business: list.find((b) => b.id === r.scopeId)?.name ?? "", detail: r.kind === "reconcile" ? r.detail : { notes: r.detail.notes ?? [], mode: r.detail.mode ?? null, failedWindows: (r.detail.failedWindows ?? []).length } })),
  };
}

export async function chapaRunErrors(user: AppUser, runId: string) {
  const r = await getRun(runId);
  if (!r || r.source !== "chapa" || !(await H.chapaCan(user, "view", r.scopeId))) throw new WorkflowError("NOT_FOUND", "Sync run not found.");
  return runErrors(runId, 100);
}
