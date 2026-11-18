// The External API console (Admin, External APIs): for each provider, whether it is set up, how its calls went in
// the last 24 hours and the latest calls themselves (tests included), read from the call monitor (int_calls). Nothing
// here holds or returns a key.
import { all, get, type Param } from "./db";
import { can, type AppUser } from "./users";
import { WorkflowError } from "./workflow";

export type ApiProvider = "verify" | "chapa" | "sms" | "academy" | "finance" | "noor";
export const API_PROVIDERS: ApiProvider[] = ["verify", "chapa", "sms", "academy", "finance", "noor"];

export type ApiState = "healthy" | "degraded" | "failing" | "untested" | "off" | "not_set_up";
export type ApiCallRow = { id: string; at: string; ok: boolean; status: number; ms: number; summary: string; error: string | null; direction: "in" | "out"; test: boolean };
export type ApiProviderStatus = {
  key: ApiProvider;
  label: string;
  state: ApiState;
  setup: string;
  calls: number;
  failures: number;
  avgMs: number;
  lastAt: string | null;
  lastError: string | null;
  recent: ApiCallRow[];
  monitorSource: string;
};

const LABEL: Record<ApiProvider, string> = { verify: "Myseed Verify", chapa: "Chapa", sms: "SMS providers", academy: "Academy API", finance: "Finance API", noor: "Noor CMS" };

// Calls of one provider. SMS sends of every connection are under "sms"; the old AfroMessage card and i-Conic tests too.
const WHERE: Record<ApiProvider, { sql: string; params: Param[] }> = {
  verify: { sql: "COALESCE(source, capability) = ?", params: ["verify"] },
  chapa: { sql: "COALESCE(source, capability) = ?", params: ["chapa"] },
  sms: { sql: "COALESCE(source, capability) = ?", params: ["sms"] },
  academy: { sql: "COALESCE(source, capability) = ?", params: ["academy"] },
  finance: { sql: "COALESCE(source, capability) = ?", params: ["finance"] },
  noor: { sql: "COALESCE(source, capability) = ?", params: ["noor"] },
};

type Setup = { configured: boolean; on: boolean; setup: string; extraFail?: string | null };

async function setupOf(key: ApiProvider): Promise<Setup> {
  if (key === "verify") {
    const { publicVerifyConfig } = await import("./myseed-verify");
    const c = await publicVerifyConfig();
    const configured = !!c.baseUrl && c.hasApiKey;
    return {
      configured,
      on: c.enabled,
      setup: !configured ? "Needs the address and API key" : `${c.environment === "production" ? "Production" : c.environment === "sandbox" ? "Sandbox" : "Custom"}${c.hasWebhookSecret ? ", webhooks signed" : ", no webhook secret"}`,
      extraFail: c.keyUnreadable ? "The saved key cannot be read: enter it again." : null,
    };
  }
  if (key === "chapa") {
    const r = await get<{ n: number; act: number }>("SELECT COUNT(*) AS n, SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) AS act FROM chapa_accounts");
    const n = Number(r?.n ?? 0);
    const on = Number(r?.act ?? 0);
    return { configured: n > 0, on: on > 0, setup: n ? `${on} of ${n} ${n === 1 ? "business" : "businesses"} active` : "No business added" };
  }
  if (key === "sms") {
    const { connectorsFor } = await import("./connectors");
    const list = await connectorsFor("sms");
    return { configured: list.length > 0, on: list.length > 0, setup: list.length ? list.map((c) => c.name).join(", ") : "No SMS connection active" };
  }
  if (key === "academy" || key === "finance") {
    const { publicExternalApiConfig } = await import("./external-api");
    const c = await publicExternalApiConfig();
    const s = c[key];
    const configured = !!s.baseUrl && c.keys[key].saved;
    return {
      configured,
      on: s.enabled,
      setup: configured ? s.baseUrl.replace(/^https?:\/\//, "") : !s.baseUrl ? "Needs the address" : "Needs the API key",
      extraFail: c.keys[key].saved && !c.keys[key].readable ? "The saved key cannot be read: enter it again." : null,
    };
  }
  const { getLegacyCmsConfig } = await import("./legacy-cms");
  const c = await getLegacyCmsConfig();
  const configured = !!c.baseUrl && !!c.hasPassword;
  const last = c.lastSyncedAt ? `last sync ${c.lastSyncStatus === "error" ? "failed" : c.lastSyncStatus === "syncing" ? "running" : "done"}` : "never synced";
  return {
    configured,
    on: configured,
    setup: configured ? `${c.baseUrl.replace(/^https?:\/\//, "")}, ${c.autoSync ? `auto every ${c.syncIntervalMinutes} min` : "auto sync off"}, ${last}` : "Needs a Noor login",
    extraFail: c.lastSyncStatus === "error" ? (c.lastSyncError ?? "The last sync failed.") : null,
  };
}

export async function apiProviderStatus(user: AppUser, key: ApiProvider, recent = 10): Promise<ApiProviderStatus> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees the external API console.");
  if (!API_PROVIDERS.includes(key)) throw new WorkflowError("NOT_FOUND", "No such provider.");
  const w = WHERE[key];
  const since = new Date(Date.now() - 24 * 3600e3).toISOString();
  const s = await get<{ calls: number; fails: number; avg_ms: number }>(`SELECT COUNT(*) AS calls, SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END) AS fails, AVG(ms) AS avg_ms FROM int_calls WHERE ${w.sql} AND at >= ?`, ...w.params, since);
  const rows = await all<{ id: string; at: string; ok: number; status: number; ms: number; summary: string; error: string | null; direction: string | null; test: number }>(
    `SELECT id, at, ok, status, ms, summary, error, direction, test FROM int_calls WHERE ${w.sql} ORDER BY at DESC LIMIT ?`,
    ...w.params,
    Math.max(1, Math.min(50, recent)),
  );
  const list: ApiCallRow[] = rows.map((r) => ({ id: r.id, at: r.at, ok: !!Number(r.ok), status: Number(r.status), ms: Number(r.ms), summary: r.summary, error: r.error, direction: r.direction === "in" ? "in" : "out", test: !!Number(r.test) }));
  const calls = Number(s?.calls ?? 0);
  const failures = Number(s?.fails ?? 0);
  const setup = await setupOf(key);
  const lastFail = list.find((r) => !r.ok);
  let state: ApiState;
  if (!setup.configured) state = "not_set_up";
  else if (!setup.on) state = "off";
  else if (setup.extraFail) state = "failing";
  else if (!list.length) state = "untested";
  else if (!list[0].ok) state = "failing";
  else if (calls && failures / calls >= 0.25) state = "failing";
  else if (failures) state = "degraded";
  else state = "healthy";
  return {
    key,
    label: LABEL[key],
    state,
    setup: setup.setup,
    calls,
    failures,
    avgMs: Math.round(Number(s?.avg_ms ?? 0)),
    lastAt: list[0]?.at ?? null,
    lastError: setup.extraFail ?? lastFail?.error ?? null,
    recent: list,
    monitorSource: key,
  };
}

export async function externalApiStatus(user: AppUser): Promise<ApiProviderStatus[]> {
  const out: ApiProviderStatus[] = [];
  for (const k of API_PROVIDERS) out.push(await apiProviderStatus(user, k));
  return out;
}
