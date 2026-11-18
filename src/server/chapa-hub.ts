import crypto from "node:crypto";
import { all, get, nowIso, parseJson, run, tx, uid, type Param } from "./db";
import { unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { getMeta, setMeta } from "./settings";
import {
  CHAPA_ACTIONS,
  DEFAULT_CHAPA_SETTINGS,
  MONEY_ACTIONS,
  normalizeChapaStatus,
  normalizeChapaType,
  phoneKey,
  chapaMethodLabel,
  CHAPA_STATUS_LABEL,
  type ChapaAction,
  type ChapaActionRule,
  type ChapaSettings,
  type ChapaStatus,
  type ChapaTx,
} from "@/lib/chapa";
import { trackedFetch } from "./call-monitor";
import { datePresetRange, isDatePreset, rangeInstants } from "@/lib/date-presets";

// Chapa for every business (Update 1.0, Phase 3).
//   - Each Chapa account is a business with its own keys, mode (test/live), sync interval and health.
//   - Sync: transactions are kept in chapa_transactions, one row per business and tx_ref with its status
//     history. How they are read from Chapa is in chapa-sync.ts. Every 15 minutes by default (per business),
//     plus the webhook, plus a re-check of pending, plus a nightly reconciliation.
//   - Admin decides, per business and role, who may view, export, verify, send to Support, and move money
//     (refund, withdraw, bulk withdraw, swap). Money actions start off and can need a second approver.
//   - Failed and stuck pending payments become cases in the support desk's Payment follow-up queue; a case
//     closes by itself when the customer pays.

const API = () => (process.env.CHAPA_API_BASE || "https://api.chapa.co").replace(/\/+$/, "");
const HOUR = 3600e3;
const DAY = 86400e3;
const addisDay = (t: number | string | Date) => new Date(+new Date(t) + 3 * HOUR).toISOString().slice(0, 10);
const dayStartIso = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 3 * HOUR).toISOString();
const dayEndIso = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - 3 * HOUR + DAY).toISOString();
const num = (v: unknown) => {
  const n = parseFloat(String(v ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Settings and who may do what
// ---------------------------------------------------------------------------

export async function chapaSettings(): Promise<ChapaSettings> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.chapa'");
  const s = parseJson<Partial<ChapaSettings>>(row?.value ?? "{}", {});
  const access: ChapaSettings["access"] = { "*": { ...DEFAULT_CHAPA_SETTINGS.access["*"] } };
  for (const [k, v] of Object.entries(s.access ?? {})) access[k] = { ...(access[k] ?? {}), ...v };
  return { rules: { ...DEFAULT_CHAPA_SETTINGS.rules, ...(s.rules ?? {}) }, access };
}

export async function saveChapaSettings(user: AppUser, input: ChapaSettings) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin decides what Chapa actions each role may run.");
  const rules = {
    pendingMinutes: Math.min(1440, Math.max(5, Math.round(Number(input.rules?.pendingMinutes) || 30))),
    autoSendTime: /^\d{2}:\d{2}$/.test(input.rules?.autoSendTime ?? "") ? input.rules.autoSendTime : null,
    dedupeHours: Math.min(720, Math.max(1, Math.round(Number(input.rules?.dedupeHours) || 24))),
    defaultSyncMinutes: Math.min(1440, Math.max(5, Math.round(Number(input.rules?.defaultSyncMinutes) || 15))),
  };
  const access: ChapaSettings["access"] = {};
  for (const [biz, acts] of Object.entries(input.access ?? {})) {
    access[biz] = {};
    for (const [a, r] of Object.entries(acts ?? {})) {
      if (!CHAPA_ACTIONS.some(([k]) => k === a) || !r) continue;
      access[biz][a as ChapaAction] = {
        enabled: !!r.enabled,
        roles: [...new Set((r.roles ?? []).map(String))].slice(0, 20),
        limit: r.limit != null && Number(r.limit) > 0 ? Number(r.limit) : null,
        dailyCap: r.dailyCap != null && Number(r.dailyCap) > 0 ? Number(r.dailyCap) : null,
        secondApprover: !!r.secondApprover,
      };
    }
  }
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.chapa', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify({ rules, access }),
    nowIso(),
    user.id,
  );
  const money = Object.values(access).flatMap((a) => MONEY_ACTIONS.filter((m) => a[m]?.enabled));
  await audit({ actor: user }, { action: "finance.chapa_settings", summary: `${user.name} saved the Chapa action rules${money.length ? ` (money actions on: ${[...new Set(money)].join(", ")})` : ""}` });
  return chapaSettings();
}

export function ruleFor(s: ChapaSettings, action: ChapaAction, accountId?: string | null): ChapaActionRule {
  const base = s.access["*"]?.[action] ?? { enabled: false, roles: [] };
  const own = accountId ? s.access[accountId]?.[action] : undefined;
  return { ...base, ...(own ?? {}) };
}

export async function chapaCan(user: AppUser, action: ChapaAction, accountId?: string | null, s?: ChapaSettings) {
  const settings = s ?? (await chapaSettings());
  const r = ruleFor(settings, action, accountId);
  const admin = can(user, "users.manage");
  if (admin && action === "view") return true;
  if (!r.enabled) return false;
  if (admin && r.roles.includes("admin")) return true;
  return user.roles.some((role) => r.roles.includes(role));
}

async function need(user: AppUser, action: ChapaAction, accountId?: string | null) {
  if (!(await chapaCan(user, action, accountId))) {
    const label = CHAPA_ACTIONS.find(([k]) => k === action)?.[1] ?? action;
    throw new WorkflowError("FORBIDDEN", MONEY_ACTIONS.includes(action) ? `${label} is off for your role on this business. Admin turns it on in Chapa, Settings.` : `${label} is not allowed for your role.`);
  }
}

// ---------------------------------------------------------------------------
// Businesses
// ---------------------------------------------------------------------------

export type AccRow = {
  date_filter?: string | null;
  date_filter_checked_at?: string | null;
  date_zone?: string | null;
  row_cap?: number | null;
  last_ok_sync_at?: string | null;
  id: string;
  name: string;
  secret_key_enc: string;
  webhook_secret_enc: string | null;
  currency: string;
  active: number;
  mode: string;
  currencies: string;
  owner_id: string | null;
  sync_minutes: number;
  health: string;
  last_sync_at: string | null;
  last_sync_rows: number;
  last_error: string | null;
  backfilled_at: string | null;
  probe_json: string | null;
  webhook_at: string | null;
};
export type ChapaBusiness = {
  id: string;
  name: string;
  mode: string;
  currencies: string[];
  active: boolean;
  syncMinutes: number;
  health: string;
  lastSyncAt: string | null;
  lastSyncRows: number;
  lastError: string | null;
  backfilled: boolean;
  webhookAt: string | null;
  hasWebhookSecret: boolean;
  // Webhook health (Update 1.2): calls refused in the last 7 days (wrong secret hash) and the last outcome.
  webhookRefused7d: number;
  webhookLast: { at: string; outcome: string; signed: boolean } | null;
  probe: unknown;
  rights: Record<ChapaAction, boolean>;
};

export async function accRow(id: string) {
  const r = await get<AccRow>("SELECT * FROM chapa_accounts WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Chapa business not found.");
  return r;
}

export async function chapaBusinesses(user: AppUser): Promise<ChapaBusiness[]> {
  const s = await chapaSettings();
  const rows = await all<AccRow>("SELECT * FROM chapa_accounts ORDER BY created_at");
  const out: ChapaBusiness[] = [];
  for (const r of rows) {
    if (!(await chapaCan(user, "view", r.id, s))) continue;
    const rights = Object.fromEntries(await Promise.all(CHAPA_ACTIONS.map(async ([a]) => [a, await chapaCan(user, a, r.id, s)]))) as Record<ChapaAction, boolean>;
    out.push({
      id: r.id,
      name: r.name,
      mode: r.mode,
      currencies: parseJson<string[]>(r.currencies, [r.currency || "ETB"]),
      active: !!r.active,
      syncMinutes: r.sync_minutes,
      health: r.health,
      lastSyncAt: r.last_sync_at,
      lastSyncRows: r.last_sync_rows,
      lastError: r.last_error,
      backfilled: !!r.backfilled_at,
      webhookAt: r.webhook_at,
      hasWebhookSecret: !!r.webhook_secret_enc,
      webhookRefused7d: Number((await get<{ n: number }>("SELECT COUNT(*) AS n FROM chapa_webhook_events WHERE account_id = ? AND signature_ok = 0 AND received_at >= ?", r.id, new Date(Date.now() - 7 * DAY).toISOString()))?.n ?? 0),
      webhookLast: await get<{ received_at: string; outcome: string; signature_ok: number }>("SELECT received_at, outcome, signature_ok FROM chapa_webhook_events WHERE account_id = ? ORDER BY received_at DESC LIMIT 1", r.id).then((w) => (w ? { at: w.received_at, outcome: w.outcome, signed: !!Number(w.signature_ok) } : null)),
      probe: parseJson<unknown>(r.probe_json ?? "null", null),
      rights,
    });
  }
  return out;
}

export async function updateBusiness(user: AppUser, id: string, input: { mode?: string; syncMinutes?: number; currencies?: string[]; ownerId?: string | null }) {
  if (!can(user, "users.manage") && !can(user, "settings.manage") && !can(user, "finance.access")) throw new WorkflowError("FORBIDDEN", "Only Admin or Finance set up Chapa businesses.");
  const r = await accRow(id);
  const mode = input.mode === "test" || input.mode === "live" ? input.mode : r.mode;
  const minutes = input.syncMinutes ? Math.min(1440, Math.max(5, Math.round(input.syncMinutes))) : r.sync_minutes;
  const currencies = input.currencies?.length ? [...new Set(input.currencies.map((c) => c.toUpperCase().slice(0, 3)))] : parseJson<string[]>(r.currencies, ["ETB"]);
  await run("UPDATE chapa_accounts SET mode = ?, sync_minutes = ?, currencies = ?, owner_id = ?, updated_at = ? WHERE id = ?", mode, minutes, JSON.stringify(currencies), input.ownerId === undefined ? r.owner_id : input.ownerId, nowIso(), id);
  await audit({ actor: user }, { action: "finance.chapa_business", summary: `${user.name} set ${r.name}: ${mode}, sync every ${minutes} min` });
}

// Visible business ids for a scope: one business, or all the person may view (test businesses only when chosen).
async function scope(user: AppUser, biz?: string | null, action: ChapaAction = "view") {
  const list = await chapaBusinesses(user);
  if (biz && biz !== "all") {
    const b = list.find((x) => x.id === biz);
    if (!b || !b.rights[action]) throw new WorkflowError("FORBIDDEN", "This Chapa business is not open to you.");
    return [b];
  }
  return list.filter((b) => b.rights[action] && b.mode !== "test");
}

// ---------------------------------------------------------------------------
// Chapa API
// ---------------------------------------------------------------------------

// Why this business's secret key cannot be used, or null when it can. A key that is stored but cannot be decrypted
// was sealed with another encryption secret (APP_SECRET set or changed, or the database restored from another
// server); only entering the key again fixes it, so it is said plainly instead of "no secret key".
export const CHAPA_KEY_UNREADABLE = "cannot be read";
export async function chapaKeyProblem(r: Pick<AccRow, "name" | "secret_key_enc">): Promise<string | null> {
  if (!r.secret_key_enc) return `${r.name} has no secret key. Enter it in Finance › Chapa › Settings.`;
  const k = (await unseal(r.secret_key_enc))?.trim() ?? "";
  if (k) return null;
  return `The saved secret key of ${r.name} ${CHAPA_KEY_UNREADABLE}: it was encrypted with a different encryption secret (APP_SECRET was set or changed, or the database came from another server). Enter the secret key again in Finance › Chapa › Settings.`;
}

async function secretOf(r: AccRow) {
  const k = (await unseal(r.secret_key_enc ?? ""))?.trim() ?? "";
  if (!k) throw new WorkflowError("INVALID_STATE", (await chapaKeyProblem(r)) ?? `${r.name} has no secret key.`);
  return k;
}

export async function chapaApi(r: AccRow, path: string, init: { method?: string; body?: unknown } = {}) {
  const key = await secretOf(r);
  const url = path.startsWith("http") ? path : `${API()}${path}`;
  if (new URL(url).origin !== new URL(API()).origin) throw new Error("Unexpected Chapa address.");
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await trackedFetch("chapa", url, {
        method: init.method ?? "GET",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(20_000),
        cache: "no-store",
      }, { summary: r.name });
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      const json = await res.json().catch(() => null);
      return { ok: res.ok, status: res.status, json };
    } catch (e) {
      if (attempt < 2) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      throw new Error(`Chapa could not be reached: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
const apiError = (r: { status: number; json: unknown }) => {
  const j = r.json as { message?: unknown } | null;
  return typeof j?.message === "string" ? j.message : j?.message ? JSON.stringify(j.message).slice(0, 200) : `HTTP ${r.status}`;
};

// The transactions list comes in a few response shapes; paging may be explicit or absent.
export function parseTxList(json: unknown): { list: Record<string, unknown>[]; next: string | null; lastPage: number | null; hasNext: boolean | null } {
  const j = (json ?? {}) as Record<string, any>;
  const d = j.data;
  const list: Record<string, unknown>[] = Array.isArray(d) ? d : Array.isArray(d?.transactions) ? d.transactions : Array.isArray(d?.data) ? d.data : Array.isArray(j.transactions) ? j.transactions : [];
  // Chapa responses may put paging in `pagination`, `meta`, `links`, or beside
  // the data. Read all supported variants so a valid page is not mistaken for
  // the end of the dataset.
  const p = d?.pagination ?? j.pagination ?? d?.meta ?? j.meta ?? (d && !Array.isArray(d) ? d : null) ?? {};
  const links = j.links ?? d?.links ?? {};
  const nextValue = p?.next_page_url ?? p?.next ?? links?.next;
  const next = typeof nextValue === "string" && nextValue ? nextValue : null;
  const currentPage = Number(p?.current_page ?? p?.currentPage ?? p?.page ?? j.current_page ?? j.currentPage) || (list.length ? 1 : null);
  const explicitLastPage = Number(p?.last_page ?? p?.lastPage ?? p?.total_pages ?? p?.totalPages ?? j.last_page ?? j.total_pages) || null;
  const total = Number(p?.total ?? p?.total_count ?? p?.totalCount ?? j.total ?? j.total_count ?? j.totalCount) || null;
  const pageSize = Number(p?.per_page ?? p?.perPage ?? p?.page_size ?? p?.pageSize ?? j.per_page ?? j.perPage) || list.length || null;
  const lastPage = explicitLastPage ?? (total && pageSize ? Math.ceil(total / pageSize) : null);
  const explicitNoNext = Object.hasOwn(p, "next_page_url") || Object.hasOwn(p, "next") || Object.hasOwn(links, "next");
  const hasNext = next ? true : lastPage && currentPage ? currentPage < lastPage : explicitNoNext ? false : null;
  return { list, next, lastPage, hasNext };
}

// Chapa writes dates with a zone (2023-08-27T19:21:18.000000Z) or without one. A date with no zone is read in the
// zone this business's answers were seen to use (chapa_accounts.date_zone, learned by the sync), Addis Ababa until
// then. A missing or unreadable date is null: it is never replaced by "now".
export type ChapaZone = "utc" | "addis";
export function parseChapaDate(created: unknown, zone: ChapaZone = "addis"): string | null {
  const s = String(created ?? "").trim();
  if (!s) return null;
  const zoned = /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(s);
  if (!zoned && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    const iso = new Date(s.replace(" ", "T") + (zone === "utc" ? "Z" : "+03:00"));
    if (!Number.isNaN(+iso)) return iso.toISOString();
  }
  if (!zoned && /^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00${zone === "utc" ? "Z" : "+03:00"}`).toISOString();
  const d = new Date(s);
  return !Number.isNaN(+d) ? d.toISOString() : null;
}
export const chapaZoneOf = (r: { date_zone?: string | null }): ChapaZone => (r.date_zone === "utc" ? "utc" : "addis");

const text = (v: unknown) => (v == null || v === "" ? null : String(v));
export function txFromApi(t: Record<string, any>, r: Pick<AccRow, "currency"> & { date_zone?: string | null }) {
  const c = (t.customer ?? {}) as Record<string, any>;
  const zone = chapaZoneOf(r);
  // tx_ref is the merchant's reference and the key everywhere (verify, webhook). The list may leave it out and
  // give only Chapa's own reference; then that is the key until a later answer brings the tx_ref.
  const own = text(t.tx_ref ?? t.trx_ref ?? t.trans_id);
  const refId = text(t.ref_id ?? t.chapa_reference ?? t.reference);
  return {
    txRef: String(own ?? refId ?? t.id ?? "").slice(0, 200),
    hasTxRef: !!own,
    refId: refId ? refId.slice(0, 200) : null,
    amount: num(t.amount),
    charge: num(t.charge ?? t.fee),
    currency: String(t.currency ?? r.currency ?? "ETB").toUpperCase().slice(0, 3),
    method: text(t.payment_method ?? t.method ?? t.channel),
    type: normalizeChapaType(t.type ?? t.transaction_type ?? t.payment_type),
    status: normalizeChapaStatus(t.status),
    providerStatus: text(t.status)?.slice(0, 80) ?? null,
    firstName: text(t.first_name ?? c.first_name),
    lastName: text(t.last_name ?? c.last_name),
    email: text(t.email ?? c.email),
    phone: text(t.phone_number ?? t.mobile ?? c.mobile ?? c.phone_number),
    createdAt: parseChapaDate(t.created_at ?? t.createdAt ?? t.date, zone),
    providerUpdatedAt: parseChapaDate(t.updated_at ?? t.updatedAt, zone),
    raw: t,
  };
}

export type ParsedTx = ReturnType<typeof txFromApi>;
type Parsed = ParsedTx;
export type StoredTx = {
  tx_ref: string; ref_id: string | null; status: string; status_history: string; amount: number; charge: number; currency: string; method: string | null; type: string | null;
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at: string; provider_status: string | null; date_flag: number;
};
export const STORED_TX = "tx_ref, ref_id, status, status_history, amount, charge, currency, method, type, first_name, last_name, email, phone, created_at, provider_status, date_flag";
const rawOf = (t: Parsed) => {
  const s = JSON.stringify(t.raw);
  return s.length <= 200_000 ? s : JSON.stringify({ note: "The answer was too large to keep.", tx_ref: t.txRef, ref_id: t.refId, status: t.providerStatus });
};

// Insert one transaction or bring the stored one up to date. The row is found by its tx_ref or by Chapa's own
// reference, so a payment first seen in the list (Chapa reference only) and later in a webhook (tx_ref) stays one
// row. Every field Chapa changed is updated; a status change is added to the history.
export async function upsertTx(accountId: string, t: Parsed, source: string, opts: { known?: StoredTx | null; fallbackDate?: string } = {}): Promise<{ previous: string | null; op: "inserted" | "updated" | "skipped" }> {
  const now = nowIso();
  let before = opts.known ?? (await get<StoredTx>(`SELECT ${STORED_TX} FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?`, accountId, t.txRef)) ?? null;
  // By Chapa's reference: a row stored under that reference (the list gave no tx_ref then), or, when this answer has
  // no tx_ref itself, the row that carries the reference. Two payments that each have their own tx_ref are never merged.
  if (!before && t.refId)
    before =
      (await get<StoredTx>(`SELECT ${STORED_TX} FROM chapa_transactions WHERE account_id = ? AND (tx_ref = ? ${t.hasTxRef ? "" : "OR ref_id = ?"}) ORDER BY created_at LIMIT 1`, accountId, t.refId, ...(t.hasTxRef ? [] : [t.refId]))) ?? null;
  if (!before) {
    const r = await run(
      `INSERT INTO chapa_transactions (account_id, tx_ref, ref_id, amount, charge, currency, method, type, status, first_name, last_name, email, phone, created_at, updated_at, verified_at, status_history, raw_json, provider_status, provider_updated_at, date_flag)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (account_id, tx_ref) DO NOTHING`,
      accountId, t.txRef, t.refId, t.amount, t.charge, t.currency, t.method, t.type, t.status, t.firstName, t.lastName, t.email, t.phone, t.createdAt ?? opts.fallbackDate ?? now, now, source === "verify" ? now : null,
      JSON.stringify([{ status: t.status, at: now, source }]), rawOf(t), t.providerStatus, t.providerUpdatedAt, t.createdAt ? 0 : 1,
    );
    return { previous: null, op: r.changes > 0 ? "inserted" : "skipped" };
  }
  let key = before.tx_ref;
  // The row was keyed by Chapa's reference and the merchant's tx_ref is now known: move it to the tx_ref.
  if (t.hasTxRef && key !== t.txRef && key === (before.ref_id ?? t.refId) && !(await get("SELECT 1 AS x FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", accountId, t.txRef))) {
    await run("UPDATE chapa_transactions SET tx_ref = ? WHERE account_id = ? AND tx_ref = ?", t.txRef, accountId, key);
    key = t.txRef;
  }
  // A webhook body or a refund carries only part of the payment: it never blanks what is stored.
  const partial = source === "webhook" || source === "refund";
  const typed = !!(t.raw.type || t.raw.transaction_type || t.raw.payment_type);
  const next = {
    // What a webhook body says is not proof: it never changes the status of a payment we already hold.
    status: source === "webhook" ? before.status : t.status,
    amount: partial && !t.amount ? Number(before.amount) : t.amount,
    charge: t.charge || Number(before.charge),
    currency: partial ? before.currency : t.currency,
    method: t.method ?? before.method,
    type: typed ? t.type : (before.type ?? t.type),
    ref_id: t.refId ?? before.ref_id,
    first_name: t.firstName ?? before.first_name,
    last_name: t.lastName ?? before.last_name,
    email: t.email ?? before.email,
    phone: t.phone ?? before.phone,
    created_at: t.createdAt ?? before.created_at,
    provider_status: t.providerStatus ?? before.provider_status,
    date_flag: t.createdAt ? 0 : Number(before.date_flag),
  };
  const same =
    next.status === before.status && Number(next.amount) === Number(before.amount) && Number(next.charge) === Number(before.charge) && next.currency === before.currency && next.method === before.method && next.type === before.type &&
    next.ref_id === before.ref_id && next.first_name === before.first_name && next.last_name === before.last_name && next.email === before.email && next.phone === before.phone &&
    Date.parse(next.created_at) === Date.parse(before.created_at) && next.provider_status === before.provider_status && next.date_flag === Number(before.date_flag);
  if (same) {
    if (source === "verify") await run("UPDATE chapa_transactions SET verified_at = ? WHERE account_id = ? AND tx_ref = ?", now, accountId, key);
    return { previous: before.status, op: "skipped" };
  }
  let history = before.status_history;
  if (next.status !== before.status) {
    const hist = parseJson<{ status: string; at: string; source: string }[]>(before.status_history, []);
    hist.push({ status: next.status, at: now, source });
    history = JSON.stringify(hist.slice(-50));
  }
  await run(
    `UPDATE chapa_transactions SET status = ?, status_history = ?, amount = ?, charge = ?, currency = ?, method = ?, type = ?, ref_id = ?, first_name = ?, last_name = ?, email = ?, phone = ?, created_at = ?, provider_status = ?,
       provider_updated_at = COALESCE(?, provider_updated_at), date_flag = ?, updated_at = ?, raw_json = CASE WHEN ? = 1 THEN raw_json ELSE ? END, verified_at = CASE WHEN ? = 'verify' THEN ? ELSE verified_at END
     WHERE account_id = ? AND tx_ref = ?`,
    next.status, history, next.amount, next.charge, next.currency, next.method, next.type, next.ref_id, next.first_name, next.last_name, next.email, next.phone, next.created_at, next.provider_status,
    t.providerUpdatedAt, next.date_flag, now, partial ? 1 : 0, rawOf(t), source, now, accountId, key,
  );
  return { previous: before.status, op: "updated" };
}

export async function afterStatus(accountId: string, t: Parsed, previous: string | null) {
  if (t.status === "success" && previous !== "success") {
    const { closeFollowupsFor } = await import("./support-desk");
    await closeFollowupsFor("chapa", { phone: t.phone ? t.phone : null, email: t.email ?? null }, `The customer paid ${t.amount} ${t.currency} (${chapaMethodLabel(t.method)}, ${t.txRef}). Closed by the system.`);
  }
}

// Reading a business's transactions from Chapa is in chapa-sync.ts (Update 1.2): by date windows when Chapa applies
// from_date and to_date, page by page otherwise; resumable, logged in sync_runs, and never ended by a guess.
export async function syncChapaBusiness(accountId: string, opts: { full?: boolean; budgetMs?: number; by?: string | null } = {}, progress: (m: string) => Promise<void> = async () => {}) {
  return (await import("./chapa-sync")).runChapaSync(accountId, opts, progress);
}

export async function syncNow(user: AppUser, biz: string | null, full = false) {
  const list = await scope(user, biz, "verify");
  if (full && !can(user, "users.manage") && !can(user, "settings.manage") && !can(user, "finance.access")) throw new WorkflowError("FORBIDDEN", "Only Admin or Finance start a full sync.");
  const out: { id: string; name: string; rows: number; inserted: number; updated: number; complete: boolean; status: string; note?: string; error?: string }[] = [];
  for (const b of list) {
    try {
      const r = await syncChapaBusiness(b.id, { full, budgetMs: 40_000, by: user.id });
      out.push({ id: b.id, name: b.name, rows: r.rows, inserted: r.inserted, updated: r.updated, complete: r.complete, status: r.status, note: r.notes[0] });
    } catch (e) {
      out.push({ id: b.id, name: b.name, rows: 0, inserted: 0, updated: 0, complete: false, status: "failed", error: e instanceof Error ? e.message : String(e) });
    }
  }
  await audit({ actor: user }, { action: "finance.chapa_sync", summary: `${user.name} ${full ? "ran a full sync of" : "synced"} Chapa (${out.map((o) => `${o.name}: ${o.error ? "failed" : `${o.rows} read, ${o.inserted} new`}`).join(", ")})` });
  return out;
}

// Ask Chapa for one payment's status now.
async function verifyRef(r: AccRow, txRef: string) {
  const res = await chapaApi(r, `/v1/transaction/verify/${encodeURIComponent(txRef)}`);
  const d = (res.json as { data?: Record<string, any> } | null)?.data;
  if (!res.ok || !d) throw new WorkflowError("INVALID_STATE", `Chapa did not confirm ${txRef}: ${apiError(res)}`);
  const t = txFromApi({ ...d, tx_ref: d.tx_ref ?? txRef }, r);
  const { previous } = await upsertTx(r.id, t, "verify");
  await afterStatus(r.id, t, previous);
  return t.status;
}

export async function verifyChapaTx(user: AppUser, accountId: string, txRef: string) {
  await need(user, "verify", accountId);
  const status = await verifyRef(await accRow(accountId), txRef);
  await audit({ actor: user }, { action: "finance.chapa_verify", summary: `${user.name} re-verified ${txRef}: ${CHAPA_STATUS_LABEL[status]}` });
  return status;
}

// Pending payments older than the threshold (and under three days old) are checked with Chapa again.
export async function recheckPending(now = Date.now()) {
  const s = await chapaSettings();
  const rows = await all<{ account_id: string; tx_ref: string }>(
    "SELECT t.account_id, t.tx_ref FROM chapa_transactions t JOIN chapa_accounts a ON a.id = t.account_id WHERE a.active = 1 AND t.status = 'pending' AND t.created_at < ? AND t.created_at > ? AND (t.verified_at IS NULL OR t.verified_at < ?) ORDER BY t.created_at DESC LIMIT 60",
    new Date(now - s.rules.pendingMinutes * 60e3).toISOString(),
    new Date(now - 3 * DAY).toISOString(),
    new Date(now - 15 * 60e3).toISOString(),
  );
  let changed = 0;
  for (const x of rows) {
    try {
      if ((await verifyRef(await accRow(x.account_id), x.tx_ref)) !== "pending") changed++;
    } catch {
      await run("UPDATE chapa_transactions SET verified_at = ? WHERE account_id = ? AND tx_ref = ?", nowIso(), x.account_id, x.tx_ref);
    }
  }
  return { checked: rows.length, changed };
}

// The webhook: signed with the business's webhook secret (x-chapa-signature = HMAC of the body;
// chapa-signature = HMAC of the secret). The status is then confirmed with Chapa, never taken from the body.
// The webhook secret ("Secret hash" in Chapa's dashboard, Settings, Webhooks). Chapa signs each call with it: the
// x-chapa-signature header is HMAC-SHA256 of the body, chapa-signature is HMAC-SHA256 of the secret itself.
export async function setChapaWebhookSecret(user: AppUser, accountId: string, secret: string) {
  if (!can(user, "finance.access") && !can(user, "users.manage") && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin or Finance set the webhook secret.");
  const r = await accRow(accountId);
  const v = String(secret ?? "").trim();
  if (v.length > 200) throw new WorkflowError("VALIDATION", "The secret hash is at most 200 characters. Use the same text as in Chapa's dashboard.");
  const { seal } = await import("./secrets");
  await run("UPDATE chapa_accounts SET webhook_secret_enc = ?, updated_at = ? WHERE id = ?", v ? await seal(v) : null, nowIso(), accountId);
  await audit({ actor: user }, { action: "chapa.webhook_secret", summary: `${user.name} ${v ? "set" : "removed"} the Chapa webhook secret of ${r.name}` });
}

// A test call signed exactly as Chapa signs, through the same check, without touching any payment.
export async function chapaWebhookSelfTest(user: AppUser, accountId: string) {
  await need(user, "view", accountId);
  const r = await accRow(accountId);
  if (!r.webhook_secret_enc) return { ok: false, message: "No webhook secret is saved for this business. Set the same secret hash here and in Chapa's dashboard." };
  const secret = (await unseal(r.webhook_secret_enc))?.trim() ?? "";
  if (!secret) return { ok: false, message: "The saved webhook secret cannot be read (the app's encryption secret changed). Save it again." };
  const body = JSON.stringify({ event: "charge.test", tx_ref: `selftest-${Date.now()}`, status: "success" });
  const h = (v: string) => crypto.createHmac("sha256", secret).update(v).digest("hex");
  const res = await chapaWebhook(accountId, body, new Headers({ "x-chapa-signature": h(body), "chapa-signature": h(secret) }), { dryRun: true });
  return { ok: res.ok, message: res.ok ? "The signature check passes. Chapa's calls signed with this secret hash will be accepted." : res.message };
}

export async function chapaWebhook(accountId: string, rawBody: string, headers: Headers, opts: { dryRun?: boolean } = {}) {
  const r = await get<AccRow>("SELECT * FROM chapa_accounts WHERE id = ?", accountId);
  if (!r?.webhook_secret_enc) return { ok: false, status: 404, message: "Unknown business or no webhook secret" };
  const secret = (await unseal(r.webhook_secret_enc))?.trim() ?? "";
  const h = (v: string) => crypto.createHmac("sha256", secret).update(v).digest("hex");
  const eq = (a: string | null, b: string) => !!a && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const body = parseJson<Record<string, any>>(rawBody, {});
  const txRef = String(body.tx_ref ?? body.data?.tx_ref ?? body.reference ?? "");
  const signed = eq(headers.get("x-chapa-signature"), h(rawBody)) || eq(headers.get("chapa-signature"), h(secret));
  // Every callback is kept, a refused one too (a wrong webhook secret then shows on the payment and in the log).
  const eventId = uid();
  const now = nowIso();
  await run(
    "INSERT INTO chapa_webhook_events (id, account_id, tx_ref, ref_id, event, status, signature_ok, outcome, body_json, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    eventId, accountId, txRef || null, body.reference ? String(body.reference).slice(0, 200) : null, body.event ? String(body.event).slice(0, 80) : null, body.status ? String(body.status).slice(0, 80) : null, signed ? 1 : 0,
    signed ? "received" : "refused: bad signature", signed ? rawBody.slice(0, 20000) : null, now,
  );
  const outcome = (text: string) => run("UPDATE chapa_webhook_events SET outcome = ? WHERE id = ?", text.slice(0, 300), eventId);
  if (!signed) return { ok: false, status: 401, message: "Bad signature" };
  if (opts.dryRun) {
    await outcome("self-test from Settings: signature accepted, nothing changed");
    return { ok: true, status: 200, message: "ok" };
  }
  await run("UPDATE chapa_accounts SET webhook_at = ? WHERE id = ?", now, accountId);
  if (!txRef) {
    await outcome("no tx_ref in the body");
    return { ok: true, status: 200, message: "No tx_ref" };
  }
  try {
    const status = await verifyRef(r, txRef);
    await outcome(`confirmed with Chapa: ${status}`);
  } catch (e) {
    // Chapa did not confirm yet: keep what the webhook said as pending, the re-check confirms later.
    const t = txFromApi({ ...body, status: "pending" }, r);
    if (t.txRef) await upsertTx(r.id, t, "webhook");
    await outcome(`not confirmed yet (${e instanceof Error ? e.message.slice(0, 160) : "no answer"}); kept as pending`);
  }
  await run("UPDATE chapa_transactions SET last_webhook_at = ? WHERE account_id = ? AND (tx_ref = ? OR ref_id = ?)", now, accountId, txRef, txRef);
  return { ok: true, status: 200, message: "ok" };
}

// h0: what each business's API returns: shapes, paging, statuses and types, and which endpoints work.
export async function probeChapaBusiness(user: AppUser, accountId: string) {
  await need(user, "verify", accountId);
  const r = await accRow(accountId);
  const keyProblem = await chapaKeyProblem(r);
  if (keyProblem) throw new WorkflowError("INVALID_STATE", keyProblem);
  const shape = (j: unknown) => {
    const o = (j ?? {}) as Record<string, any>;
    const d = o.data;
    return { keys: Object.keys(o), dataKeys: d && typeof d === "object" && !Array.isArray(d) ? Object.keys(d) : Array.isArray(d) ? ["(list)"] : [] };
  };
  const out: Record<string, unknown> = { checkedAt: nowIso() };
  for (const [name, path] of [
    ["transactions", "/v1/transactions?page=1&per_page=100"],
    ["transfers", "/v1/transfers"],
    ["balances", "/v1/balances"],
    ["banks", "/v1/banks"],
  ] as const) {
    try {
      const res = await chapaApi(r, path);
      const entry: Record<string, unknown> = { ok: res.ok, status: res.status, ...shape(res.json) };
      if (name === "transactions" && res.ok) {
        const p = parseTxList(res.json);
        const parsed = p.list.map((x) => txFromApi(x as Record<string, any>, r));
        entry.rows = p.list.length;
        entry.paging = p.next ? "next_page_url" : p.lastPage ? "last_page" : "none seen";
        entry.statuses = [...new Set(parsed.map((t) => t.status))];
        entry.types = [...new Set(parsed.map((t) => t.type))];
        entry.methods = [...new Set(parsed.map((t) => t.method).filter(Boolean))];
        entry.rowKeys = p.list[0] ? Object.keys(p.list[0]) : [];
      }
      if (name === "balances" && res.ok) entry.currencies = parseTxList(res.json).list.map((b: any) => b.currency);
      out[name] = entry;
    } catch (e) {
      out[name] = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  // Update 1.2: how the transactions list behaves, which decides how the sync reads it (chapa-sync.ts).
  try {
    const keys = (j: unknown) => parseTxList(j).list.map((x) => String((x as Record<string, any>).tx_ref ?? (x as Record<string, any>).ref_id ?? (x as Record<string, any>).id ?? ""));
    const old = await chapaApi(r, "/v1/transactions?from_date=2015-01-01T00:00:00&to_date=2015-01-02T00:00:00");
    const first = await chapaApi(r, "/v1/transactions");
    const second = await chapaApi(r, "/v1/transactions?page=2");
    const j = (first.json ?? {}) as Record<string, any>;
    const list = parseTxList(first.json).list as Record<string, any>[];
    const k1 = keys(first.json);
    const k2 = keys(second.json);
    const dates = list.map((x) => String(x.created_at ?? x.createdAt ?? "")).filter(Boolean);
    const t = dates.map((d) => Date.parse(parseChapaDate(d, "utc") ?? "")).filter((x) => !Number.isNaN(x));
    const dateFilterApplied = old.ok && parseTxList(old.json).list.length === 0;
    out.listing = {
      dateFilterApplied,
      dateFilterAnswer: old.ok ? `${parseTxList(old.json).list.length} rows for a day in 2015` : `HTTP ${old.status}`,
      rowsPerAnswer: list.length,
      pagination: j.data?.pagination ?? j.pagination ?? j.meta ?? j.data?.meta ?? null,
      pageParameter: !second.ok ? `HTTP ${second.status}` : !k2.length ? "page 2 is empty" : k2.every((k) => k1.includes(k)) ? "ignored (page 2 repeats page 1)" : "works",
      order: t.length < 2 || t[0] === t[t.length - 1] ? "unknown" : t[0] > t[t.length - 1] ? "newest first" : "oldest first",
      sampleDate: dates[0] ?? null,
      datesCarryZone: dates.length ? /(?:Z|[+-]\d{2}:?\d{2})$/.test(dates[0]) : null,
      statusesAsWritten: [...new Set(list.map((x) => String(x.status ?? "")))].slice(0, 20),
      rowsWithoutTxRef: list.filter((x) => !x.tx_ref).length,
      readBy: dateFilterApplied ? "date windows" : "pages",
    };
    await run("UPDATE chapa_accounts SET date_filter = ?, date_filter_checked_at = ? WHERE id = ?", dateFilterApplied ? "yes" : "no", nowIso(), accountId);
  } catch (e) {
    out.listing = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  await run("UPDATE chapa_accounts SET probe_json = ? WHERE id = ?", JSON.stringify(out), accountId);
  return out;
}

// ---------------------------------------------------------------------------
// Reading the stored transactions
// ---------------------------------------------------------------------------

export type TxFilter = {
  biz?: string | null; q?: string; status?: string[]; from?: string; until?: string; currency?: string; type?: string[]; method?: string[]; limit?: number;
  // Update 1.2: a time of day on the first and last day (HH:mm, Addis Ababa), the customer, and the reference.
  fromTime?: string; untilTime?: string; customer?: string; ref?: string;
};
type TxRow = {
  account_id: string; business: string; mode: string; tx_ref: string; ref_id: string | null; amount: number; charge: number; currency: string; method: string | null; type: string | null; status: string;
  first_name: string | null; last_name: string | null; email: string | null; phone: string | null; created_at: string; verified_at: string | null; followup_ticket_id: string | null;
  updated_at?: string | null; provider_status?: string | null; provider_updated_at?: string | null; last_webhook_at?: string | null; date_flag?: number | null;
};
const toTx = (r: TxRow): ChapaTx => ({
  accountId: r.account_id, business: r.business, mode: r.mode, txRef: r.tx_ref, refId: r.ref_id, amount: Number(r.amount), charge: Number(r.charge), currency: r.currency, method: r.method, type: r.type,
  status: r.status as ChapaStatus, customer: [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || r.phone || "Customer", email: r.email, phone: r.phone, createdAt: r.created_at, verifiedAt: r.verified_at, followupTicketId: r.followup_ticket_id,
  updatedAt: r.updated_at ?? null, providerStatus: r.provider_status ?? null, providerUpdatedAt: r.provider_updated_at ?? null, lastWebhookAt: r.last_webhook_at ?? null, undated: !!Number(r.date_flag ?? 0),
});

async function where(user: AppUser, f: TxFilter, action: ChapaAction = "view") {
  const biz = await scope(user, f.biz, action);
  const w: string[] = [`t.account_id IN (${biz.map(() => "?").join(",") || "''"})`];
  const a: Param[] = biz.map((b) => b.id);
  const span = rangeInstants(f.from, f.until, f.fromTime, f.untilTime);
  if (span.start) w.push("t.created_at >= ?"), a.push(span.start);
  if (span.end) w.push("t.created_at < ?"), a.push(span.end);
  if (f.customer?.trim()) {
    const c = f.customer.trim().toLowerCase();
    const digits = c.replace(/\D/g, "");
    w.push(`(LOWER(COALESCE(t.first_name,'') || ' ' || COALESCE(t.last_name,'')) LIKE ? OR LOWER(COALESCE(t.email,'')) LIKE ? ${digits.length >= 4 ? "OR COALESCE(t.phone,'') LIKE ?" : ""})`);
    a.push(`%${c}%`, `%${c}%`);
    if (digits.length >= 4) a.push(`%${digits.slice(-9)}%`);
  }
  if (f.ref?.trim()) w.push("(LOWER(t.tx_ref) LIKE ? OR LOWER(COALESCE(t.ref_id,'')) LIKE ?)"), a.push(`%${f.ref.trim().toLowerCase()}%`, `%${f.ref.trim().toLowerCase()}%`);
  if (f.status?.length) w.push(`t.status IN (${f.status.map(() => "?").join(",")})`), a.push(...f.status);
  if (f.type?.length) w.push(`t.type IN (${f.type.map(() => "?").join(",")})`), a.push(...f.type);
  if (f.method?.length) w.push(`(${f.method.map(() => "LOWER(COALESCE(t.method,'')) LIKE ?").join(" OR ")})`), a.push(...f.method.map((m) => `%${m.toLowerCase().replace(/[^a-z]/g, "")}%`));
  if (f.currency) w.push("t.currency = ?"), a.push(f.currency.toUpperCase());
  if (f.q?.trim()) {
    const q = f.q.trim().toLowerCase();
    const like = `%${q}%`;
    const digits = q.replace(/\D/g, "");
    w.push(`(LOWER(t.tx_ref) LIKE ? OR LOWER(COALESCE(t.ref_id,'')) LIKE ? OR LOWER(COALESCE(t.email,'')) LIKE ? OR LOWER(COALESCE(t.first_name,'') || ' ' || COALESCE(t.last_name,'')) LIKE ? ${digits.length >= 4 ? "OR COALESCE(t.phone,'') LIKE ?" : ""} ${/^\d+(\.\d+)?$/.test(q) ? "OR t.amount = ?" : ""})`);
    a.push(like, like, like, like);
    if (digits.length >= 4) a.push(`%${digits.slice(-9)}%`);
    if (/^\d+(\.\d+)?$/.test(q)) a.push(Number(q));
  }
  return { sql: w.join(" AND "), args: a, biz };
}
const TX_SELECT = "SELECT t.*, a.name AS business, a.mode FROM chapa_transactions t JOIN chapa_accounts a ON a.id = t.account_id";

export async function listChapaTx(user: AppUser, f: TxFilter, action: ChapaAction = "view") {
  const w = await where(user, f, action);
  const rows = await all<TxRow>(`${TX_SELECT} WHERE ${w.sql} ORDER BY t.created_at DESC LIMIT ?`, ...w.args, Math.min(500_000, f.limit ?? 2000));
  const totals = await all<{ currency: string; status: string; n: number; sum: number }>(`SELECT t.currency, t.status, COUNT(*) AS n, SUM(t.amount) AS sum FROM chapa_transactions t WHERE ${w.sql} GROUP BY t.currency, t.status`, ...w.args);
  return { rows: rows.map(toTx), totals: totals.map((t) => ({ currency: t.currency, status: t.status, n: Number(t.n), sum: Number(t.sum) })), businesses: w.biz.map((b) => ({ id: b.id, name: b.name })) };
}

// Update 1.2: one page of the filtered transactions, sorted and counted by the database, with the summary cards for
// the same filter. The table, the cards, the export and the paging all read this one filter, so they always agree.
export const TX_SORTS = { created: "t.created_at", updated: "t.updated_at", amount: "t.amount", status: "t.status", method: "LOWER(COALESCE(t.method,''))", customer: "LOWER(COALESCE(t.first_name,'') || ' ' || COALESCE(t.last_name,''))", verified: "t.verified_at", reference: "t.tx_ref" } as const;
export type TxSort = keyof typeof TX_SORTS;
export type TxSummary = { currency: string; total: number; success: number; successAmount: number; pending: number; failed: number; refunded: number; reversed: number; average: number | null; rate: number | null; fees: number };
export type TxPageInput = TxFilter & { page?: number; pageSize?: number; sort?: TxSort; dir?: "asc" | "desc" };

export async function chapaTxPage(user: AppUser, f: TxPageInput) {
  const w = await where(user, f);
  const pageSize = [25, 50, 100, 200].includes(Number(f.pageSize)) ? Number(f.pageSize) : 50;
  const sort = TX_SORTS[f.sort as TxSort] ?? TX_SORTS.created;
  const dir = f.dir === "asc" ? "ASC" : "DESC";
  const groups = await all<{ currency: string; status: string; n: number | string; sum: number | string | null; fees: number | string | null }>(`SELECT t.currency, t.status, COUNT(*) AS n, SUM(t.amount) AS sum, SUM(t.charge) AS fees FROM chapa_transactions t WHERE ${w.sql} GROUP BY t.currency, t.status`, ...w.args);
  const total = groups.reduce((a, g) => a + Number(g.n), 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.round(Number(f.page) || 1)));
  const rows = await all<TxRow>(`${TX_SELECT} WHERE ${w.sql} ORDER BY ${sort} ${dir} NULLS LAST, t.created_at DESC, t.tx_ref LIMIT ? OFFSET ?`, ...w.args, pageSize, (page - 1) * pageSize);
  const by = new Map<string, TxSummary>();
  for (const g of groups) {
    const s = by.get(g.currency) ?? { currency: g.currency, total: 0, success: 0, successAmount: 0, pending: 0, failed: 0, refunded: 0, reversed: 0, average: null, rate: null, fees: 0 };
    const n = Number(g.n);
    s.total += n;
    s.fees += Number(g.fees ?? 0);
    if (g.status === "success") (s.success += n), (s.successAmount += Number(g.sum ?? 0));
    else if (g.status === "pending") s.pending += n;
    else if (g.status === "failed") s.failed += n;
    else if (g.status === "refunded") s.refunded += n;
    else if (g.status === "reversed") s.reversed += n;
    by.set(g.currency, s);
  }
  for (const s of by.values()) {
    s.average = s.success ? s.successAmount / s.success : null;
    // Of the payments that ended (paid or failed): how many were paid. Pending ones are not counted against it.
    s.rate = s.success + s.failed ? s.success / (s.success + s.failed) : null;
  }
  // Businesses whose history is not all here yet: the numbers above may be short for older ranges.
  const state = w.biz.length ? await all<{ id: string; name: string; backfilled_at: string | null; health: string; last_error: string | null; last_ok_sync_at: string | null }>(`SELECT id, name, backfilled_at, health, last_error, last_ok_sync_at FROM chapa_accounts WHERE id IN (${w.biz.map(() => "?").join(",")})`, ...w.biz.map((b) => b.id)) : [];
  const partial = state.filter((b) => !b.backfilled_at || b.health === "error" || b.health === "partial").map((b) => ({ id: b.id, name: b.name, reason: b.health === "error" ? `the last sync failed${b.last_error ? ` (${b.last_error.slice(0, 120)})` : ""}` : !b.backfilled_at ? "its history has not been read completely" : (b.last_error ?? "the last sync was partial") }));
  const lastSync = state.map((b) => b.last_ok_sync_at).filter(Boolean).sort()[0] ?? null;
  return { rows: rows.map(toTx), total, page, pages, pageSize, summary: [...by.values()].sort((a, b) => b.total - a.total), businesses: w.biz.map((b) => ({ id: b.id, name: b.name })), partial, lastSync };
}

// Saved filters of the Transactions page: a person's own, and those Admin shares with everyone.
const TX_VIEW_PAGE = "chapa:transactions";
export async function chapaTxViews(user: AppUser) {
  const rows = await all<{ id: string; name: string; query: string; shared: number; owner_id: string }>("SELECT id, name, query, shared, owner_id FROM saved_views WHERE page = ? AND (owner_id = ? OR shared = 1) ORDER BY shared DESC, LOWER(name)", TX_VIEW_PAGE, user.id);
  return rows.map((r) => ({ id: r.id, name: r.name, filter: parseJson<Record<string, unknown>>(r.query, {}), shared: !!Number(r.shared), mine: r.owner_id === user.id }));
}
export async function saveChapaTxView(user: AppUser, input: { name: string; filter: Record<string, unknown>; shared?: boolean }) {
  if (!(await chapaBusinesses(user)).length) throw new WorkflowError("FORBIDDEN", "Chapa is not open to you.");
  const name = input.name.trim().slice(0, 60);
  if (!name) throw new WorkflowError("VALIDATION", "Give the filter a name.");
  const shared = !!input.shared && (can(user, "users.manage") || can(user, "settings.manage"));
  const query = JSON.stringify(input.filter ?? {}).slice(0, 4000);
  const same = await get<{ id: string }>("SELECT id FROM saved_views WHERE page = ? AND owner_id = ? AND LOWER(name) = LOWER(?)", TX_VIEW_PAGE, user.id, name);
  if (same) await run("UPDATE saved_views SET query = ?, shared = ? WHERE id = ?", query, shared ? 1 : 0, same.id);
  else await run("INSERT INTO saved_views (id, owner_id, name, page, query, config, shared, created_at) VALUES (?, ?, ?, ?, ?, '{}', ?, ?)", uid(), user.id, name, TX_VIEW_PAGE, query, shared ? 1 : 0, nowIso());
  return chapaTxViews(user);
}
export async function deleteChapaTxView(user: AppUser, id: string) {
  const v = await get<{ owner_id: string }>("SELECT owner_id FROM saved_views WHERE id = ? AND page = ?", id, TX_VIEW_PAGE);
  if (!v) return chapaTxViews(user);
  if (v.owner_id !== user.id && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "This filter belongs to someone else.");
  await run("DELETE FROM saved_views WHERE id = ?", id);
  return chapaTxViews(user);
}

// h10: volume, count and success rate for today, 7 and 30 days, by method, type and status, and a daily chart.
// The Overview's filter (Update 1.2): a date range (Today to All time, or custom), status, method, type and a search.
// The fixed cards (today, 7 and 30 days) follow the filters except the dates; the "Selected range" card, the chart,
// the breakdowns and the list of transactions follow all of them.
export type OverviewFilter = { preset?: string | null; start?: string | null; end?: string | null; status?: string[]; method?: string[]; type?: string[]; q?: string | null; sort?: "newest" | "oldest" | "amount_desc" | "amount_asc" | null };

export async function chapaOverview(user: AppUser, biz?: string | null, f: OverviewFilter = {}, now = Date.now()) {
  const today = addisDay(now);
  const back = (n: number) => addisDay(now - n * DAY);
  const windows = { today: today, d7: back(6), d30: back(29) };
  const rest = { status: f.status ?? [], method: f.method ?? [], type: f.type ?? [], q: f.q ?? undefined };
  const preset = isDatePreset(f.preset) ? f.preset : "30days";
  const sel = datePresetRange(preset, f.start, f.end, now);
  const range = await chapaRangeSummary(user, biz, { ...rest, from: sel.from ?? undefined, until: sel.until ?? undefined }, f.sort ?? "newest", now);
  const w = await where(user, { biz, from: windows.d30, until: today, ...rest });
  const rows = await all<{ currency: string; status: string; method: string | null; type: string | null; day: string; n: number; sum: number }>(
    `SELECT t.currency, t.status, t.method, t.type, SUBSTR(t.created_at, 1, 13) AS day, COUNT(*) AS n, SUM(t.amount) AS sum FROM chapa_transactions t WHERE ${w.sql} GROUP BY t.currency, t.status, t.method, t.type, SUBSTR(t.created_at, 1, 13)`,
    ...w.args,
  );
  type K = { volume: number; count: number; success: number; failed: number; pending: number };
  const blank = (): K => ({ volume: 0, count: 0, success: 0, failed: 0, pending: 0 });
  const byCur: Record<string, { today: K; d7: K; d30: K; method: Record<string, number>; type: Record<string, number>; status: Record<string, number>; daily: Record<string, { volume: number; count: number }> }> = {};
  for (const r of rows) {
    const c = (byCur[r.currency] ??= { today: blank(), d7: blank(), d30: blank(), method: {}, type: {}, status: {}, daily: {} });
    const day = addisDay(`${r.day}:00:00Z`);
    const n = Number(r.n);
    const sum = Number(r.sum);
    for (const [k, from] of Object.entries(windows) as [keyof typeof windows, string][]) {
      if (day < from) continue;
      const x = c[k];
      x.count += n;
      if (r.status === "success") (x.volume += sum), (x.success += n);
      if (r.status === "failed") x.failed += n;
      if (r.status === "pending") x.pending += n;
    }
    c.status[r.status] = (c.status[r.status] ?? 0) + n;
    if (r.status === "success") {
      const m = chapaMethodLabel(r.method);
      c.method[m] = (c.method[m] ?? 0) + sum;
      c.type[r.type ?? "api"] = (c.type[r.type ?? "api"] ?? 0) + sum;
      const d = (c.daily[day] ??= { volume: 0, count: 0 });
      d.volume += sum;
      d.count += n;
    }
  }
  const days = Array.from({ length: 30 }, (_, i) => back(29 - i));
  return {
    currencies: Object.entries(byCur).map(([currency, c]) => ({
      currency,
      windows: Object.fromEntries((["today", "d7", "d30"] as const).map((k) => [k, { ...c[k], rate: c[k].success + c[k].failed ? c[k].success / (c[k].success + c[k].failed) : null }])),
      byMethod: Object.entries(c.method).sort((a, b) => b[1] - a[1]),
      byType: Object.entries(c.type).sort((a, b) => b[1] - a[1]),
      byStatus: Object.entries(c.status).sort((a, b) => b[1] - a[1]),
      daily: days.map((d) => ({ day: d, ...(c.daily[d] ?? { volume: 0, count: 0 }) })),
      range: range.byCur[currency] ?? null,
    })),
    // Currencies seen only in the selected range (older than 30 days).
    rangeOnly: Object.entries(range.byCur).filter(([c]) => !byCur[c]).map(([currency, r]) => ({ currency, range: r })),
    filter: { preset, from: sel.from, until: sel.until, ...rest, sort: f.sort ?? "newest" },
    transactions: range.list,
    matching: range.count,
    businesses: w.biz.map((b) => ({ id: b.id, name: b.name, mode: b.mode, health: b.health, lastSyncAt: b.lastSyncAt, lastError: b.lastError })),
  };
}

// The selected range: totals by currency with the success rate, paid per day (per month past three months), the
// breakdowns, and the newest (or largest) matching transactions.
async function chapaRangeSummary(user: AppUser, biz: string | null | undefined, f: TxFilter, sort: string, now: number) {
  const w = await where(user, { biz, ...f });
  const rows = await all<{ currency: string; status: string; method: string | null; type: string | null; day: string; n: number; sum: number }>(
    `SELECT t.currency, t.status, t.method, t.type, SUBSTR(t.created_at, 1, 13) AS day, COUNT(*) AS n, SUM(t.amount) AS sum FROM chapa_transactions t WHERE ${w.sql} GROUP BY t.currency, t.status, t.method, t.type, SUBSTR(t.created_at, 1, 13)`,
    ...w.args,
  );
  const first = f.from ?? (rows.length ? rows.map((r) => addisDay(`${r.day}:00:00Z`)).sort()[0]! : addisDay(now));
  const last = f.until ?? addisDay(now);
  const spanDays = Math.round((Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / DAY) + 1;
  const monthly = spanDays > 92;
  const bucket = (d: string) => (monthly ? d.slice(0, 7) : d);
  const buckets: string[] = [];
  if (monthly) {
    for (let d = new Date(`${first.slice(0, 7)}-01T00:00:00Z`); d.toISOString().slice(0, 7) <= last.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) buckets.push(d.toISOString().slice(0, 7));
  } else for (let i = 0; i < Math.max(1, spanDays); i++) buckets.push(addisDay(Date.parse(`${first}T00:00:00Z`) - 3 * 3600e3 + i * DAY + 12 * 3600e3));
  type R = { volume: number; count: number; success: number; failed: number; pending: number; method: Record<string, number>; type: Record<string, number>; status: Record<string, number>; series: Record<string, { volume: number; count: number }> };
  const byCur: Record<string, R> = {};
  for (const r of rows) {
    const c = (byCur[r.currency] ??= { volume: 0, count: 0, success: 0, failed: 0, pending: 0, method: {}, type: {}, status: {}, series: {} });
    const n = Number(r.n);
    const sum = Number(r.sum);
    c.count += n;
    c.status[r.status] = (c.status[r.status] ?? 0) + n;
    if (r.status === "failed") c.failed += n;
    if (r.status === "pending") c.pending += n;
    if (r.status === "success") {
      c.volume += sum;
      c.success += n;
      const m = chapaMethodLabel(r.method);
      c.method[m] = (c.method[m] ?? 0) + sum;
      c.type[r.type ?? "api"] = (c.type[r.type ?? "api"] ?? 0) + sum;
      const b = bucket(addisDay(`${r.day}:00:00Z`));
      const s = (c.series[b] ??= { volume: 0, count: 0 });
      s.volume += sum;
      s.count += n;
    }
  }
  const order = { newest: "t.created_at DESC", oldest: "t.created_at ASC", amount_desc: "t.amount DESC, t.created_at DESC", amount_asc: "t.amount ASC, t.created_at DESC" }[sort] ?? "t.created_at DESC";
  const list = await all<TxRow>(`${TX_SELECT} WHERE ${w.sql} ORDER BY ${order} LIMIT 25`, ...w.args);
  const count = Number((await get<{ n: number }>(`SELECT COUNT(*) AS n FROM chapa_transactions t WHERE ${w.sql}`, ...w.args))?.n ?? 0);
  return {
    byCur: Object.fromEntries(
      Object.entries(byCur).map(([cur, c]) => [
        cur,
        {
          volume: c.volume,
          count: c.count,
          success: c.success,
          failed: c.failed,
          pending: c.pending,
          rate: c.success + c.failed ? c.success / (c.success + c.failed) : null,
          byMethod: Object.entries(c.method).sort((a, b) => b[1] - a[1]),
          byType: Object.entries(c.type).sort((a, b) => b[1] - a[1]),
          byStatus: Object.entries(c.status).sort((a, b) => b[1] - a[1]),
          series: buckets.map((b) => ({ day: b, ...(c.series[b] ?? { volume: 0, count: 0 }) })),
          monthly,
        },
      ]),
    ),
    list: list.map(toTx),
    count,
  };
}

// h3: one day, Success / Failed / Pending with counts, totals and the change from the day before.
export async function chapaDailyBoard(user: AppUser, day: string, biz?: string | null) {
  const prevDay = addisDay(Date.parse(dayStartIso(day)) - HOUR);
  const [cur, prev] = await Promise.all([listChapaTx(user, { biz, from: day, until: day, limit: 5000 }), listChapaTx(user, { biz, from: prevDay, until: prevDay, limit: 1 })]);
  const sum = (t: { status: string; n: number; sum: number }[], s: string) => t.filter((x) => x.status === s).reduce((a, x) => ({ n: a.n + x.n, sum: a.sum + x.sum }), { n: 0, sum: 0 });
  const tabs = (["success", "failed", "pending"] as const).map((s) => ({ status: s, ...sum(cur.totals, s), prev: sum(prev.totals, s), rows: cur.rows.filter((r) => r.status === s) }));
  return { day, prevDay, tabs };
}

// h15: customers grouped by phone (or email) per business. Update 1.2: filtered by date range, method and outcome, and
// compared over their tries: who paid on the first try, who failed and paid on a later try (recovered), who only
// failed, and who is still pending. "Recovered" means a successful payment after the customer's first failed try.
export type ChapaCustomerOutcome = "paid_first" | "recovered" | "failed_only" | "pending_only";
export const CHAPA_OUTCOME_LABEL: Record<ChapaCustomerOutcome, string> = { paid_first: "Paid first time", recovered: "Paid after failing", failed_only: "Never paid", pending_only: "Pending only" };
export type ChapaCustomerFilter = { biz?: string | null; q?: string; from?: string; until?: string; method?: string[]; outcome?: ChapaCustomerOutcome[]; sort?: "recent" | "paid" | "failed" | "name" };
const CUSTOMER_KEY = "COALESCE(NULLIF(RIGHT(REGEXP_REPLACE(COALESCE(t.phone,''), '[^0-9]', '', 'g'), 9), ''), LOWER(t.email), t.tx_ref)";

export async function chapaCustomers(user: AppUser, f: ChapaCustomerFilter) {
  const w = await where(user, { biz: f.biz, q: f.q, from: f.from, until: f.until, method: f.method });
  const order = { recent: "last_seen DESC", paid: "paid DESC, last_seen DESC", failed: "failed DESC, last_seen DESC", name: "LOWER(MAX(COALESCE(x.first_name,''))) ASC" }[f.sort ?? "recent"] ?? "last_seen DESC";
  const rows = await all<{ account_id: string; business: string; k: string; name: string; phone: string | null; email: string | null; paid: number; paid_n: number; failed: number; pending: number; tries: number; methods: string; first_seen: string; first_failed: string | null; first_paid: string | null; last_paid: string | null; last_seen: string; failed_before_paid: number; currency: string }>(
    `WITH x AS (SELECT t.*, ${CUSTOMER_KEY} AS k FROM chapa_transactions t WHERE ${w.sql}),
          g AS (SELECT account_id, k, MIN(CASE WHEN status = 'failed' THEN created_at END) AS first_failed, MIN(CASE WHEN status = 'success' THEN created_at END) AS first_paid, MAX(CASE WHEN status = 'success' THEN created_at END) AS last_paid FROM x GROUP BY account_id, k)
     SELECT x.account_id, a.name AS business, x.k,
            MAX(COALESCE(NULLIF(TRIM(COALESCE(x.first_name,'') || ' ' || COALESCE(x.last_name,'')), ''), x.email, x.phone)) AS name, MAX(x.phone) AS phone, MAX(x.email) AS email,
            SUM(CASE WHEN x.status = 'success' THEN x.amount ELSE 0 END) AS paid, SUM(CASE WHEN x.status = 'success' THEN 1 ELSE 0 END) AS paid_n,
            SUM(CASE WHEN x.status = 'failed' THEN 1 ELSE 0 END) AS failed, SUM(CASE WHEN x.status = 'pending' THEN 1 ELSE 0 END) AS pending, COUNT(*) AS tries,
            STRING_AGG(DISTINCT COALESCE(x.method,''), ',') AS methods, MIN(x.created_at) AS first_seen, MAX(g.first_failed) AS first_failed, MAX(g.first_paid) AS first_paid, MAX(g.last_paid) AS last_paid, MAX(x.created_at) AS last_seen,
            SUM(CASE WHEN x.status = 'failed' AND g.last_paid IS NOT NULL AND x.created_at < g.last_paid THEN 1 ELSE 0 END) AS failed_before_paid, MAX(x.currency) AS currency
     FROM x JOIN g ON g.account_id = x.account_id AND g.k = x.k JOIN chapa_accounts a ON a.id = x.account_id
     GROUP BY x.account_id, a.name, x.k ORDER BY ${order} LIMIT 20000`,
    ...w.args,
  );
  const cms = await cmsPhoneIndex();
  const outcomes = new Set(f.outcome ?? []);
  return rows
    .map((r) => {
      const paidN = Number(r.paid_n);
      const failed = Number(r.failed);
      // Paid after failing: a success later than the first failed try.
      const recovered = !!r.first_failed && !!r.last_paid && r.last_paid > r.first_failed;
      const outcome: ChapaCustomerOutcome = recovered ? "recovered" : paidN ? "paid_first" : failed ? "failed_only" : "pending_only";
      return {
        accountId: r.account_id, business: r.business, key: r.k, name: r.name, phone: r.phone, email: r.email, paid: Number(r.paid), paidCount: paidN, failed, pending: Number(r.pending), tries: Number(r.tries),
        methods: [...new Set(String(r.methods ?? "").split(",").filter(Boolean).map(chapaMethodLabel))], firstSeen: r.first_seen, firstFailed: r.first_failed, firstPaid: r.first_paid, lastPaid: r.last_paid, lastSeen: r.last_seen,
        outcome, failedBeforePaid: Number(r.failed_before_paid), recoveredAfterMs: recovered ? Date.parse(r.last_paid!) - Date.parse(r.first_failed!) : null,
        currency: r.currency, cms: cms.get(phoneKey(r.phone)) ?? null,
      };
    })
    .filter((c) => !outcomes.size || outcomes.has(c.outcome));
}
export type ChapaCustomer = Awaited<ReturnType<typeof chapaCustomers>>[number];

// The comparison over the filtered customers: how many failed at least once, how many of those paid on a later try,
// and the money that came in after a failure.
export function chapaCustomerSummary(list: ChapaCustomer[]) {
  const failedOnce = list.filter((c) => c.failed > 0);
  const recovered = list.filter((c) => c.outcome === "recovered");
  const byCur: Record<string, { paid: number; recoveredPaid: number }> = {};
  for (const c of list) {
    const x = (byCur[c.currency] ??= { paid: 0, recoveredPaid: 0 });
    x.paid += c.paid;
    if (c.outcome === "recovered") x.recoveredPaid += c.paid;
  }
  const waits = recovered.map((c) => c.recoveredAfterMs!).filter((n) => n >= 0).sort((a, b) => a - b);
  return {
    customers: list.length,
    paying: list.filter((c) => c.paidCount > 0).length,
    paidFirst: list.filter((c) => c.outcome === "paid_first").length,
    failedOnce: failedOnce.length,
    recovered: recovered.length,
    recoveryRate: failedOnce.length ? recovered.length / failedOnce.length : null,
    neverPaid: list.filter((c) => c.outcome === "failed_only").length,
    pendingOnly: list.filter((c) => c.outcome === "pending_only").length,
    medianRecoveryMs: waits.length ? waits[Math.floor(waits.length / 2)] : null,
    money: Object.entries(byCur).map(([currency, v]) => ({ currency, ...v })),
  };
}

// Every try of one customer, oldest first, to compare them side by side.
export async function chapaCustomerTries(user: AppUser, accountId: string, key: string) {
  await need(user, "view", accountId);
  const rows = await all<TxRow>(`${TX_SELECT} WHERE t.account_id = ? AND ${CUSTOMER_KEY} = ? ORDER BY t.created_at ASC LIMIT 500`, accountId, key);
  return rows.map(toTx);
}

// The customers list as a report (Excel, CSV and the PDF page share it).
export async function chapaCustomersReport(user: AppUser, f: ChapaCustomerFilter) {
  const list = await chapaCustomers(user, f);
  const sum = chapaCustomerSummary(list);
  const { buildCmsReport } = await import("@/lib/cms-report");
  const { getSettings } = await import("./settings");
  const { fmtDateTime } = await import("@/lib/format");
  const s = await getSettings();
  const tz = s.workspace.timezone;
  const headers = ["Outcome", "Customer", "Phone", "Email", "Paid", "Currency", "Payments", "Failed tries", "Failed before paying", "Pending", "First try", "First failure", "Paid after failure", "Last payment", "Methods", "Noor", "Business"];
  const d = (v: string | null) => (v ? fmtDateTime(v, tz) : "");
  const data = list.map((c) => ({
    Outcome: CHAPA_OUTCOME_LABEL[c.outcome], Customer: c.name, Phone: c.phone ?? "", Email: c.email ?? "", Paid: String(c.paid), Currency: c.currency, Payments: String(c.paidCount), "Failed tries": String(c.failed), "Failed before paying": String(c.failedBeforePaid), Pending: String(c.pending),
    "First try": d(c.firstSeen), "First failure": d(c.firstFailed), "Paid after failure": c.outcome === "recovered" ? d(c.lastPaid) : "", "Last payment": d(c.lastPaid), Methods: c.methods.join(", "), Noor: c.cms ? `${c.cms.student} (${c.cms.grade})` : "", Business: c.business,
  }));
  const today = addisDay(Date.now());
  const from = f.from ?? (list.length ? [...list].map((c) => c.firstSeen).sort()[0].slice(0, 10) : today);
  const until = f.until ?? today;
  const outcomeText = f.outcome?.length ? f.outcome.map((o) => CHAPA_OUTCOME_LABEL[o]).join(", ") : "";
  const spec = { category: "chapa", from, until, search: f.q, filters: { ...(outcomeText ? { outcome: outcomeText } : {}), ...(f.method?.length ? { method: f.method.join(", ") } : {}) }, columns: headers, groupBy: "none" as const, sumColumn: "Paid", title: "Chapa customers" };
  const report = buildCmsReport(data, headers, spec);
  const rate = sum.recoveryRate === null ? "no failed tries" : `${Math.round(sum.recoveryRate * 100)}% of the ${sum.failedOnce} who failed paid on a later try`;
  const meta = {
    table: "Chapa customers",
    from,
    until,
    filters: [`${sum.customers} customers: ${sum.paidFirst} paid first time, ${sum.recovered} paid after failing, ${sum.neverPaid} never paid (${rate})`, outcomeText && `Outcome: ${outcomeText}`, f.method?.length && `Method: ${f.method.join(", ")}`, f.q && `Search: ${f.q}`].filter(Boolean).join(" · "),
    exportedAt: fmtDateTime(nowIso(), tz),
    exportedBy: user.name,
    method: "Stored Chapa transactions, grouped by phone or email",
    workspace: s.workspace.name,
  };
  return { report, meta, summary: sum };
}

// Noor students and parents by phone (from the synchronized mirror), to link a payer to a CMS record.
async function cmsPhoneIndex() {
  const { getStudentParentRelations } = await import("./legacy-cms");
  const m = new Map<string, { student: string; parent: string; grade: string }>();
  try {
    for (const r of (await getStudentParentRelations()).relations) if (r.parentPhone) for (const p of r.parentPhone.split(/\s+/)) if (phoneKey(p).length === 9 && !m.has(phoneKey(p))) m.set(phoneKey(p), { student: r.studentName, parent: r.parentName, grade: r.grade });
  } catch {}
  return m;
}

export async function chapaTxDetail(user: AppUser, accountId: string, txRef: string) {
  await need(user, "view", accountId);
  const r = await get<TxRow & { status_history: string; raw_json: string | null }>(`${TX_SELECT} WHERE t.account_id = ? AND t.tx_ref = ?`, accountId, txRef);
  if (!r) throw new WorkflowError("NOT_FOUND", "Transaction not found.");
  let events: unknown[] = [];
  let eventsError: string | null = null;
  try {
    const res = await chapaApi(await accRow(accountId), `/v1/transaction/events/${encodeURIComponent(r.ref_id || txRef)}`);
    if (res.ok) events = parseTxList(res.json).list;
    else eventsError = apiError(res);
  } catch (e) {
    eventsError = e instanceof Error ? e.message : String(e);
  }
  const { ticketStatusOf } = await import("./support-desk");
  const ticket = r.followup_ticket_id ? ((await ticketStatusOf([r.followup_ticket_id]))[r.followup_ticket_id] ?? null) : null;
  const webhooks = await all<{ event: string | null; status: string | null; signature_ok: number; outcome: string | null; received_at: string }>(
    "SELECT event, status, signature_ok, outcome, received_at FROM chapa_webhook_events WHERE account_id = ? AND (tx_ref = ? OR tx_ref = ? OR ref_id = ?) ORDER BY received_at DESC LIMIT 50",
    accountId, r.tx_ref, r.ref_id ?? r.tx_ref, r.ref_id ?? r.tx_ref,
  );
  return {
    tx: toTx(r), history: parseJson<{ status: string; at: string; source: string }[]>(r.status_history, []), raw: parseJson<unknown>(r.raw_json ?? "null", null), events, eventsError, cms: (await cmsPhoneIndex()).get(phoneKey(r.phone)) ?? null, ticket,
    webhooks: webhooks.map((x) => ({ event: x.event, status: x.status, signed: !!Number(x.signature_ok), outcome: x.outcome, at: x.received_at })),
  };
}

// ---------------------------------------------------------------------------
// Payment follow-up
// ---------------------------------------------------------------------------

export type FollowupRow = { key: string; accountId: string; business: string; name: string; phone: string | null; email: string | null; attempts: number; amount: number; currency: string; methods: string[]; last: string; reasons: string[]; txRefs: string[]; ticketId: string | null; ticketNumber: number | null; ticketStatus: string | null; cms: { student: string; parent: string; grade: string } | null };

// h5: failed and stuck pending payments of a day, one row per customer and business, without customers who
// paid later that day or after.
export async function chapaFollowups(user: AppUser, day: string, biz?: string | null, now = Date.now()) {
  const s = await chapaSettings();
  const { rows } = await listChapaTx(user, { biz, from: day, until: day, status: ["failed", "pending"], limit: 5000 });
  const stuckBefore = now - s.rules.pendingMinutes * 60e3;
  const candidates = rows.filter((r) => r.status === "failed" || Date.parse(r.createdAt) < stuckBefore);
  const keyOf = (r: ChapaTx) => phoneKey(r.phone) || (r.email ?? "").toLowerCase() || r.txRef;
  const paid = await all<{ account_id: string; phone: string | null; email: string | null }>("SELECT account_id, phone, email FROM chapa_transactions WHERE status = 'success' AND created_at >= ?", dayStartIso(day));
  const paidKeys = new Set(paid.map((p) => `${p.account_id}|${phoneKey(p.phone) || (p.email ?? "").toLowerCase()}`));
  const groups = new Map<string, FollowupRow>();
  const cms = await cmsPhoneIndex();
  for (const r of candidates) {
    const k = keyOf(r);
    if (paidKeys.has(`${r.accountId}|${k}`)) continue;
    const id = `${r.accountId}:${k}:${day}`;
    const g = groups.get(id) ?? { key: id, accountId: r.accountId, business: r.business, name: r.customer, phone: r.phone, email: r.email, attempts: 0, amount: 0, currency: r.currency, methods: [], last: r.createdAt, reasons: [], txRefs: [], ticketId: null, ticketNumber: null, ticketStatus: null, cms: cms.get(phoneKey(r.phone)) ?? null };
    g.attempts++;
    g.amount = Math.max(g.amount, r.amount);
    const m = chapaMethodLabel(r.method);
    if (!g.methods.includes(m)) g.methods.push(m);
    const reason = r.status === "failed" ? "Failed" : "Pending, not completed";
    if (!g.reasons.includes(reason)) g.reasons.push(reason);
    g.txRefs.push(r.txRef);
    if (r.createdAt > g.last) g.last = r.createdAt;
    g.ticketId ??= r.followupTicketId;
    groups.set(id, g);
  }
  const list = [...groups.values()];
  const ids = list.map((g) => g.ticketId).filter((x): x is string => !!x);
  const { ticketStatusOf } = await import("./support-desk");
  const st = await ticketStatusOf(ids);
  for (const g of list) if (g.ticketId && st[g.ticketId]) (g.ticketNumber = st[g.ticketId].number), (g.ticketStatus = st[g.ticketId].status);
  return list.sort((a, b) => b.last.localeCompare(a.last));
}

// h6: send follow-ups to the Payment follow-up queue (by hand, or automatically with actor null).
export async function sendFollowups(actor: AppUser | null, day: string, keys: string[] | "all", biz?: string | null) {
  const s = await chapaSettings();
  let list: FollowupRow[];
  if (actor) {
    list = await chapaFollowups(actor, day, biz);
    for (const g of list) if (keys === "all" || keys.includes(g.key)) await need(actor, "send_support", g.accountId);
  } else {
    // Automatic: every business where auto follow-up is on.
    const system = { id: "system", name: "Myseed", roles: ["admin"], perms: ["users.manage"], active: true } as unknown as AppUser;
    list = (await chapaFollowups(system, day, null)).filter((g) => ruleFor(s, "auto_followup", g.accountId).enabled);
  }
  const { createFollowupTicket } = await import("./support-desk");
  let created = 0;
  let merged = 0;
  for (const g of list) {
    if (keys !== "all" && !keys.includes(g.key)) continue;
    if (g.ticketId && g.ticketStatus && !["solved", "closed"].includes(g.ticketStatus)) continue;
    const body = [
      `${g.name} tried to pay ${g.business} on ${day} and it did not complete.`,
      `Phone: ${g.phone ?? "none"} · Email: ${g.email ?? "none"}`,
      `Attempts: ${g.attempts} · Amount: ${g.amount.toLocaleString()} ${g.currency} · Method: ${g.methods.join(", ")}`,
      `Why: ${g.reasons.join(", ")}`,
      g.cms ? `Noor: student ${g.cms.student} (${g.cms.grade}), parent ${g.cms.parent}` : "Noor: no matching student or parent by phone",
      `References: ${g.txRefs.join(", ")}`,
      "Call the customer, help them pay, and note the outcome. The case closes by itself if they pay.",
    ].join("\n");
    const t = await createFollowupTicket(actor, { source: "chapa", sourceRef: g.key, customerName: g.name, phone: g.phone, email: g.email, subject: `Payment did not complete: ${g.name}, ${g.amount.toLocaleString()} ${g.currency} (${g.business})`, body, dedupeHours: s.rules.dedupeHours });
    if (t.created) created++;
    else merged++;
    await run(`UPDATE chapa_transactions SET followup_ticket_id = ?, followup_at = ? WHERE account_id = ? AND tx_ref IN (${g.txRefs.map(() => "?").join(",")})`, t.id, nowIso(), g.accountId, ...g.txRefs);
  }
  if (actor) await audit({ actor }, { action: "finance.chapa_followup", summary: `${actor.name} sent ${created} payment follow-up${created === 1 ? "" : "s"} to Support (${merged} added to open cases)` });
  return { created, merged };
}

// ---------------------------------------------------------------------------
// Balances and money actions (maker–checker)
// ---------------------------------------------------------------------------

export async function chapaBalances(user: AppUser, biz?: string | null) {
  const list = await scope(user, biz);
  const out: { accountId: string; business: string; mode: string; currency: string; available: number; ledger: number; error?: string }[] = [];
  for (const b of list) {
    try {
      const res = await chapaApi(await accRow(b.id), "/v1/balances");
      if (!res.ok) throw new Error(apiError(res));
      const rows = parseTxList(res.json).list as Record<string, any>[];
      const data = rows.length ? rows : [((res.json as { data?: Record<string, any> } | null)?.data ?? {}) as Record<string, any>];
      for (const x of data) out.push({ accountId: b.id, business: b.name, mode: b.mode, currency: String(x.currency ?? "ETB").toUpperCase(), available: num(x.available_balance ?? x.balance), ledger: num(x.ledger_balance ?? x.balance) });
    } catch (e) {
      out.push({ accountId: b.id, business: b.name, mode: b.mode, currency: "-", available: 0, ledger: 0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

const banksCache = new Map<string, { at: number; list: { code: string; name: string }[] }>();
export async function chapaBanks(user: AppUser, accountId: string) {
  await need(user, "transfer", accountId);
  const hit = banksCache.get(accountId);
  if (hit && Date.now() - hit.at < HOUR) return hit.list;
  const res = await chapaApi(await accRow(accountId), "/v1/banks");
  if (!res.ok) throw new WorkflowError("INVALID_STATE", `Chapa banks: ${apiError(res)}`);
  const list = (parseTxList(res.json).list as Record<string, any>[]).map((b) => ({ code: String(b.id ?? b.code ?? b.bank_code), name: String(b.name ?? b.bank_name) }));
  banksCache.set(accountId, { at: Date.now(), list });
  return list;
}

export type OpKind = "transfer" | "bulk_transfer" | "refund" | "swap";
export type ChapaOp = { id: string; accountId: string; business: string; kind: OpKind; status: string; amount: number; currency: string; reference: string; detail: Record<string, any>; reason: string | null; requestedBy: string | null; approvedBy: string | null; error: string | null; createdAt: string; updatedAt: string };

export async function requestChapaOp(user: AppUser, input: { kind: OpKind; accountId: string; amount: number; currency?: string; reason?: string; detail: Record<string, any> }) {
  const action: ChapaAction = input.kind;
  await need(user, action, input.accountId);
  const s = await chapaSettings();
  const rule = ruleFor(s, action, input.accountId);
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new WorkflowError("VALIDATION", "Enter the amount.");
  if (rule.limit && amount > rule.limit) throw new WorkflowError("VALIDATION", `The limit for one ${action.replace("_", " ")} is ${rule.limit.toLocaleString()}.`);
  const currency = (input.currency || "ETB").toUpperCase();
  const d = input.detail ?? {};
  if (input.kind === "transfer" && (!d.account_name || !d.account_number || !d.bank_code)) throw new WorkflowError("VALIDATION", "Give the account name, account number and bank.");
  if (input.kind === "bulk_transfer") {
    const items = Array.isArray(d.items) ? d.items : [];
    if (!items.length || items.length > 100) throw new WorkflowError("VALIDATION", "Add between 1 and 100 payees.");
    const total = items.reduce((a: number, x: any) => a + num(x.amount), 0);
    if (Math.abs(total - amount) > 0.01) throw new WorkflowError("VALIDATION", "The total must equal the sum of the payees.");
  }
  if (input.kind === "refund" && !d.tx_ref) throw new WorkflowError("VALIDATION", "Choose the payment to refund.");
  if (input.kind === "refund") {
    const t = await get<{ amount: number; status: string }>("SELECT amount, status FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", input.accountId, d.tx_ref);
    if (!t || t.status !== "success") throw new WorkflowError("VALIDATION", "Only a successful payment can be refunded.");
    if (amount > Number(t.amount)) throw new WorkflowError("VALIDATION", "A refund cannot be more than the payment.");
    if (!input.reason?.trim()) throw new WorkflowError("VALIDATION", "Give the reason for the refund.");
  }
  if ((input.kind === "transfer" || input.kind === "bulk_transfer") && rule.dailyCap) {
    const today = addisDay(Date.now());
    const used = Number((await get<{ s: number | null }>("SELECT SUM(amount) AS s FROM chapa_operations WHERE account_id = ? AND kind IN ('transfer','bulk_transfer') AND status NOT IN ('failed','rejected') AND created_at >= ?", input.accountId, dayStartIso(today)))?.s ?? 0);
    if (used + amount > rule.dailyCap) throw new WorkflowError("VALIDATION", `Today's withdrawal cap is ${rule.dailyCap.toLocaleString()}; ${used.toLocaleString()} is already used.`);
  }
  const id = uid("cop_");
  const reference = `MS-${input.kind.slice(0, 2).toUpperCase()}-${Date.now().toString(36)}-${crypto.randomBytes(2).toString("hex")}`;
  const now = nowIso();
  await run(
    "INSERT INTO chapa_operations (id, account_id, kind, status, amount, currency, reference, detail_json, reason, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, input.accountId, input.kind, rule.secondApprover ? "awaiting_approval" : "approved", amount, currency, reference, JSON.stringify(d).slice(0, 50000), input.reason?.trim().slice(0, 500) || null, user.id, now, now,
  );
  await audit({ actor: user }, { action: `finance.chapa_${input.kind}`, summary: `${user.name} asked for a Chapa ${input.kind.replace("_", " ")} of ${amount.toLocaleString()} ${currency}${rule.secondApprover ? " (waits for a second approver)" : ""}` });
  if (!rule.secondApprover) await executeOp(id, user);
  return id;
}

export async function decideChapaOp(user: AppUser, id: string, approve: boolean, note?: string) {
  const op = await get<{ account_id: string; kind: OpKind; status: string; requested_by: string | null; amount: number; currency: string }>("SELECT account_id, kind, status, requested_by, amount, currency FROM chapa_operations WHERE id = ?", id);
  if (!op) throw new WorkflowError("NOT_FOUND", "Request not found.");
  await need(user, op.kind, op.account_id);
  if (op.status !== "awaiting_approval") throw new WorkflowError("INVALID_STATE", "This request was already decided.");
  if (op.requested_by === user.id) throw new WorkflowError("FORBIDDEN", "Someone else approves a request you made.");
  await run("UPDATE chapa_operations SET status = ?, approved_by = ?, error = ?, updated_at = ? WHERE id = ? AND status = 'awaiting_approval'", approve ? "approved" : "rejected", user.id, approve ? null : (note?.trim() || "Rejected").slice(0, 300), nowIso(), id);
  await audit({ actor: user }, { action: `finance.chapa_${op.kind}`, summary: `${user.name} ${approve ? "approved" : "rejected"} a Chapa ${op.kind.replace("_", " ")} of ${Number(op.amount).toLocaleString()} ${op.currency}` });
  if (approve) await executeOp(id, user);
}

async function executeOp(id: string, user: AppUser) {
  const op = await get<{ account_id: string; kind: OpKind; amount: number; currency: string; reference: string; detail_json: string; reason: string | null }>("SELECT * FROM chapa_operations WHERE id = ? AND status = 'approved'", id);
  if (!op) return;
  const r = await accRow(op.account_id);
  const d = parseJson<Record<string, any>>(op.detail_json, {});
  let path = "";
  let body: unknown;
  if (op.kind === "transfer") (path = "/v1/transfers"), (body = { account_name: d.account_name, account_number: d.account_number, amount: String(op.amount), currency: op.currency, reference: op.reference, bank_code: d.bank_code });
  if (op.kind === "bulk_transfer") (path = "/v1/bulk-transfers"), (body = { title: d.title || op.reference, currency: op.currency, bulk_data: (d.items as any[]).map((x, i) => ({ account_name: x.account_name, account_number: x.account_number, amount: String(x.amount), reference: `${op.reference}-${i + 1}`, bank_code: x.bank_code })) });
  if (op.kind === "refund") (path = `/v1/refund/${encodeURIComponent(d.tx_ref)}`), (body = { reason: op.reason, amount: String(op.amount), reference: op.reference });
  if (op.kind === "swap") (path = "/v1/swap"), (body = { amount: op.amount, from: d.from || "USD", to: d.to || "ETB" });
  try {
    const res = await chapaApi(r, path, { method: "POST", body });
    const ok = res.ok && String((res.json as { status?: string } | null)?.status ?? "success").toLowerCase() !== "failed";
    await run("UPDATE chapa_operations SET status = ?, result_json = ?, error = ?, updated_at = ? WHERE id = ?", ok ? "sent" : "failed", JSON.stringify(res.json ?? null).slice(0, 20000), ok ? null : apiError(res), nowIso(), id);
    if (ok && op.kind === "refund") {
      const t = await get<{ amount: number }>("SELECT amount FROM chapa_transactions WHERE account_id = ? AND tx_ref = ?", op.account_id, d.tx_ref);
      if (t && Number(op.amount) >= Number(t.amount)) await upsertTx(op.account_id, { ...txFromApi({ tx_ref: d.tx_ref, status: "refunded", amount: t.amount }, r) }, "refund");
    }
    if (!ok) throw new WorkflowError("INVALID_STATE", `Chapa refused: ${apiError(res)}`);
  } catch (e) {
    if (e instanceof WorkflowError) throw e;
    await run("UPDATE chapa_operations SET status = 'failed', error = ?, updated_at = ? WHERE id = ?", (e instanceof Error ? e.message : String(e)).slice(0, 500), nowIso(), id);
    throw new WorkflowError("INVALID_STATE", e instanceof Error ? e.message : String(e));
  }
  void user;
}

export async function verifyTransfer(user: AppUser, id: string) {
  const op = await get<{ account_id: string; kind: string; reference: string }>("SELECT account_id, kind, reference FROM chapa_operations WHERE id = ?", id);
  if (!op || !op.kind.includes("transfer")) throw new WorkflowError("NOT_FOUND", "Withdrawal not found.");
  await need(user, "transfer", op.account_id);
  const res = await chapaApi(await accRow(op.account_id), `/v1/transfers/verify/${encodeURIComponent(op.reference)}`);
  const status = String(((res.json as { data?: { status?: string } } | null)?.data?.status) ?? (res.ok ? "sent" : "unknown")).toLowerCase();
  const mapped = /success|complete/.test(status) ? "completed" : /fail|revers/.test(status) ? "failed" : "sent";
  await run("UPDATE chapa_operations SET status = ?, result_json = ?, updated_at = ? WHERE id = ?", mapped, JSON.stringify(res.json ?? null).slice(0, 20000), nowIso(), id);
  return mapped;
}

export async function listChapaOps(user: AppUser, f: { biz?: string | null; kinds?: OpKind[] }) {
  const list = await scope(user, f.biz);
  if (!list.length) return [];
  const kinds = f.kinds?.length ? f.kinds : (["transfer", "bulk_transfer", "refund", "swap"] as OpKind[]);
  const rows = await all<{ id: string; account_id: string; business: string; kind: OpKind; status: string; amount: number; currency: string; reference: string; detail_json: string; reason: string | null; requested: string | null; approved: string | null; error: string | null; created_at: string; updated_at: string }>(
    `SELECT o.*, a.name AS business, ur.name AS requested, ua.name AS approved FROM chapa_operations o JOIN chapa_accounts a ON a.id = o.account_id LEFT JOIN users ur ON ur.id = o.requested_by LEFT JOIN users ua ON ua.id = o.approved_by
     WHERE o.account_id IN (${list.map(() => "?").join(",")}) AND o.kind IN (${kinds.map(() => "?").join(",")}) ORDER BY o.created_at DESC LIMIT 500`,
    ...list.map((b) => b.id), ...kinds,
  );
  return rows.map((r): ChapaOp => ({ id: r.id, accountId: r.account_id, business: r.business, kind: r.kind, status: r.status, amount: Number(r.amount), currency: r.currency, reference: r.reference, detail: parseJson(r.detail_json, {}), reason: r.reason, requestedBy: r.requested, approvedBy: r.approved, error: r.error, createdAt: r.created_at, updatedAt: r.updated_at }));
}

// Chapa's own list of withdrawals for a business (including ones made outside Myseed).
export async function chapaTransfersRemote(user: AppUser, accountId: string) {
  await need(user, "view", accountId);
  const res = await chapaApi(await accRow(accountId), "/v1/transfers");
  if (!res.ok) throw new WorkflowError("INVALID_STATE", `Chapa transfers: ${apiError(res)}`);
  return (parseTxList(res.json).list as Record<string, any>[]).slice(0, 500).map((t) => ({
    reference: String(t.tx_ref ?? t.reference ?? t.chapa_reference ?? ""),
    name: String(t.account_name ?? t.beneficiary_name ?? ""),
    account: String(t.account_number ?? ""),
    bank: String(t.bank_name ?? t.bank ?? t.bank_code ?? ""),
    amount: num(t.amount),
    currency: String(t.currency ?? "ETB"),
    status: String(t.status ?? ""),
    createdAt: String(t.created_at ?? ""),
  }));
}

export async function listBeneficiaries(user: AppUser, accountId: string) {
  await need(user, "transfer", accountId);
  return all<{ id: string; name: string; bank_code: string; bank_name: string | null; account_number: string }>("SELECT id, name, bank_code, bank_name, account_number FROM chapa_beneficiaries WHERE account_id = ? ORDER BY name", accountId);
}
export async function saveBeneficiary(user: AppUser, input: { accountId: string; id?: string; name: string; bankCode: string; bankName?: string; accountNumber: string; remove?: boolean }) {
  await need(user, "transfer", input.accountId);
  if (input.remove && input.id) return run("DELETE FROM chapa_beneficiaries WHERE id = ? AND account_id = ?", input.id, input.accountId);
  if (!input.name.trim() || !input.bankCode || !/^\d{5,20}$/.test(input.accountNumber.replace(/\s/g, ""))) throw new WorkflowError("VALIDATION", "Give the name, bank and a numeric account number.");
  await run("INSERT INTO chapa_beneficiaries (id, account_id, name, bank_code, bank_name, account_number, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", uid("cbn_"), input.accountId, input.name.trim().slice(0, 120), input.bankCode, input.bankName ?? null, input.accountNumber.replace(/\s/g, ""), user.id, nowIso());
}

// h14: credits into the account (Funding-type transactions) and debits (withdrawals made here).
export async function chapaFunds(user: AppUser, biz?: string | null) {
  const credits = (await listChapaTx(user, { biz, type: ["funding"], limit: 1000 })).rows;
  const debits = (await listChapaOps(user, { biz, kinds: ["transfer", "bulk_transfer"] })).filter((o) => ["sent", "completed"].includes(o.status));
  return { credits, debits };
}

// h9: Chapa payments against Noor invoices: by tx_ref anywhere in the invoice, else phone and amount the same day.
export async function matchChapaToNoor(user: AppUser, f: { from: string; until: string; biz?: string | null }) {
  const pay = (await listChapaTx(user, { biz: f.biz, from: f.from, until: f.until, status: ["success"], limit: 10000 })).rows;
  const fromCache = await all<{ rows_json: string }>("SELECT rows_json FROM cms_range_cache WHERE category = 'invoices' AND day >= ? AND day <= ?", f.from, f.until);
  const mirror = await all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'invoices'");
  const { cmsDate, cmsField } = await import("@/lib/cms-filters");
  const seen = new Set<string>();
  const invoices: Record<string, string>[] = [];
  for (const r of [...fromCache.flatMap((c) => parseJson<Record<string, string>[]>(c.rows_json, [])), ...mirror.map((m) => parseJson<Record<string, string>>(m.data_json, {}))]) {
    const id = r._recordId || r.ID || JSON.stringify(r).slice(0, 80);
    if (seen.has(id)) continue;
    const d = cmsDate(r);
    if (!d || addisDay(d) < f.from || addisDay(d) > f.until) continue;
    seen.add(id);
    invoices.push(r);
  }
  const used = new Set<number>();
  const matched: { tx: ChapaTx; invoiceId: string; how: string }[] = [];
  const unmatchedChapa: ChapaTx[] = [];
  for (const t of pay) {
    let i = invoices.findIndex((inv, k) => !used.has(k) && Object.values(inv).some((v) => String(v).includes(t.txRef) || (t.refId && String(v).includes(t.refId))));
    let how = "reference";
    if (i < 0) {
      i = invoices.findIndex((inv, k) => {
        if (used.has(k)) return false;
        const amt = num(cmsField(inv, ["amount", "total", "price"]));
        const ph = phoneKey(cmsField(inv, ["phone", "parent phone", "mobile"]));
        const d = cmsDate(inv);
        return Math.abs(amt - t.amount) < 0.01 && !!ph && ph === phoneKey(t.phone) && !!d && addisDay(d) === addisDay(t.createdAt);
      });
      how = "phone and amount";
    }
    if (i < 0) unmatchedChapa.push(t);
    else {
      used.add(i);
      matched.push({ tx: t, invoiceId: invoices[i]._recordId || invoices[i].ID || "", how });
    }
  }
  const unmatchedNoor = invoices.filter((_, k) => !used.has(k)).map((inv) => ({ id: inv._recordId || inv.ID || "", student: cmsField(inv, ["student", "name"]), amount: num(cmsField(inv, ["amount", "total"])), method: cmsField(inv, ["payment method", "method"]), status: cmsField(inv, ["status"]), date: cmsField(inv, ["created at", "date"]) }));
  return { matched, unmatchedChapa, unmatchedNoor, invoicesChecked: invoices.length };
}

// ---------------------------------------------------------------------------
// Exports (the same Excel, CSV and PDF files as the CMS reports)
// ---------------------------------------------------------------------------

export async function chapaReport(user: AppUser, f: TxFilter) {
  const { rows, businesses } = await listChapaTx(user, { ...f, limit: 500_000 }, "export");
  const { buildCmsReport, cmsFiltersText } = await import("@/lib/cms-report");
  const { getSettings } = await import("./settings");
  const { fmtDateTime } = await import("@/lib/format");
  const s = await getSettings();
  const headers = ["Status", "Customer", "Phone", "Email", "Amount", "Currency", "Method", "Type", "Reference", "Chapa reference", "Business", "Created at"];
  const data = rows.map((r) => ({ Status: CHAPA_STATUS_LABEL[r.status], Customer: r.customer, Phone: r.phone ?? "", Email: r.email ?? "", Amount: String(r.amount), Currency: r.currency, Method: chapaMethodLabel(r.method), Type: r.type ?? "", Reference: r.txRef, "Chapa reference": r.refId ?? "", Business: r.business, "Created at": fmtDateTime(r.createdAt, s.workspace.timezone) }));
  const from = f.from ?? (rows.at(-1)?.createdAt.slice(0, 10) || addisDay(Date.now()));
  const until = f.until ?? (rows[0]?.createdAt.slice(0, 10) || addisDay(Date.now()));
  const spec = { category: "chapa", from, until, search: f.q, filters: { ...(f.status?.length ? { status: f.status.join(", ") } : {}), ...(f.type?.length ? { type: f.type.join(", ") } : {}), ...(f.method?.length ? { method: f.method.join(", ") } : {}), ...(f.currency ? { currency: f.currency } : {}), business: businesses.map((b) => b.name).join(", ") }, columns: headers, groupBy: "status" as const, sumColumn: "Amount", title: "Chapa transactions" };
  const report = buildCmsReport(data, headers, spec);
  const meta = { table: "Chapa transactions", from, until, filters: cmsFiltersText(spec), exportedAt: fmtDateTime(nowIso(), s.workspace.timezone), exportedBy: user.name, method: "Stored Chapa transactions (synced and webhook)", workspace: s.workspace.name };
  return { report, meta };
}

// ---------------------------------------------------------------------------
// The schedule: sync each business on its interval, re-check pending, send automatic follow-ups
// ---------------------------------------------------------------------------

export async function scheduledChapa(now = Date.now()) {
  const accounts = await all<{ id: string; name: string; sync_minutes: number; last_sync_at: string | null; secret_key_enc: string; last_error: string | null }>("SELECT id, name, sync_minutes, last_sync_at, secret_key_enc, last_error FROM chapa_accounts WHERE active = 1");
  if (!accounts.length) return;
  const { acquireLease, releaseLease } = await import("./ops");
  if (!(await acquireLease("chapa-sync", 20 * 60e3))) return;
  try {
    const { openRun } = await import("./sync-runs");
    for (const a of accounts) {
      // A key that is missing or cannot be decrypted fails every request: say so once on the business and wait for
      // the key to be entered again, instead of starting a failing run every minute.
      const keyProblem = await chapaKeyProblem(a);
      if (keyProblem) {
        if (a.last_error !== keyProblem) await run("UPDATE chapa_accounts SET health = 'error', last_error = ?, last_sync_at = ? WHERE id = ?", keyProblem, nowIso(), a.id);
        continue;
      }
      // A full run that ran out of time, or has windows to try again, goes on whatever the interval.
      const unfinished = await openRun("chapa", a.id, "full");
      if (!unfinished && a.last_sync_at && now - Date.parse(a.last_sync_at) < a.sync_minutes * 60e3) continue;
      // A failure is on the business (health, last error) and in its run log; the other businesses still sync.
      await syncChapaBusiness(a.id, { full: !!unfinished, budgetMs: 90_000 }).catch((e) => console.error(`Chapa sync failed for ${a.name}`, e));
    }
    await recheckPending(now).catch((e) => console.error("Chapa pending re-check failed", e));
    await (await import("./chapa-sync")).scheduledChapaReconcile(now).catch((e) => console.error("Chapa reconcile failed", e));
    const s = await chapaSettings();
    if (s.rules.autoSendTime) {
      const local = new Date(now + 3 * HOUR).toISOString().slice(11, 16);
      const day = addisDay(now);
      if (local >= s.rules.autoSendTime && (await getMeta("chapaAutoSend")) !== day) {
        await setMeta("chapaAutoSend", day);
        await sendFollowups(null, day, "all").catch((e) => console.error("Chapa automatic follow-up failed", e));
      }
    }
  } finally {
    await releaseLease("chapa-sync");
  }
}

void tx;

// ---------------------------------------------------------------------------
// Overview layout (Update 1.0 Phase 8): the widgets each person shows, in order, with Admin's default for everyone.
// ---------------------------------------------------------------------------

export async function chapaOverviewLayout(user: AppUser) {
  const { cleanWidgets, DEFAULT_CHAPA_WIDGETS } = await import("@/lib/chapa");
  const saved = await getMeta("chapa.overview.default");
  const def = saved ? cleanWidgets(parseJson(saved, [])) : DEFAULT_CHAPA_WIDGETS;
  const mine = user.prefs.chapaOverview ? cleanWidgets(user.prefs.chapaOverview) : null;
  return { widgets: mine ?? def, own: !!mine, def, canSetDefault: can(user, "users.manage") || can(user, "settings.manage") };
}

// scope: "me" saves the person's own; "default" (Admin) sets everyone's; "reset" goes back to the default.
export async function saveChapaOverviewLayout(user: AppUser, widgets: string[], scope: "me" | "default" | "reset") {
  const { cleanWidgets } = await import("@/lib/chapa");
  const list = cleanWidgets(widgets);
  if (scope !== "reset" && !list.length) throw new WorkflowError("VALIDATION", "Keep at least one widget on the Overview.");
  const row = await get<{ prefs: string }>("SELECT prefs FROM users WHERE id = ?", user.id);
  const prefs = parseJson<Record<string, unknown>>(row?.prefs ?? "{}", {});
  if (scope === "default") {
    if (!can(user, "users.manage") && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets the Overview for everyone.");
    await setMeta("chapa.overview.default", JSON.stringify(list));
    await audit({ actor: user }, { action: "chapa.overview", summary: `${user.name} set the Chapa Overview for everyone: ${list.join(", ")}` });
  }
  // Saving everyone's also makes it the Admin's own; reset forgets the person's own.
  if (scope === "reset" || scope === "default") delete prefs.chapaOverview;
  else prefs.chapaOverview = list;
  await run("UPDATE users SET prefs = ? WHERE id = ?", JSON.stringify(prefs), user.id);
  return list;
}
