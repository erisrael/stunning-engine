import { cmsSession, cmsTableSeed, forgetCmsSessions, rememberCmsSession } from "./cms-session";
import { cmsReceiptAttachments } from "@/lib/cms-receipts";
import { cmsField, cmsDateMatches, parseCmsDate } from "@/lib/cms-filters";
import { queryCmsTable, cmsPagination, type CmsRemoteFilter } from "@/lib/cms-livewire";
// Legacy CMS Scraper & Synchronizer (Phase 29):
// Synchronizes data from Noor Ethiopia CMS (https://cms.noorethiopia.com)
// Subpages:
//   - https://cms.noorethiopia.com/admin/students
//   - https://cms.noorethiopia.com/admin/parents
//   - https://cms.noorethiopia.com/admin/subscription-plans
//   - https://cms.noorethiopia.com/admin/subscription-histories
//   - https://cms.noorethiopia.com/admin/invoices
//   - https://cms.noorethiopia.com/admin/subscriptions
// Scrapes HTML tables via Livewire Filament v3 session or API payloads,
// caches real records in legacy_cms_records, and provides rich searching/filtering
// for Support, Finance, and Admin with granular role-based visibility controls.

import { all, get, nowIso, parseJson, run, tx, uid, type Param } from "./db";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

import { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory, type UserCmsOverride } from "@/lib/legacy-cms";
export { LEGACY_CMS_CATEGORIES, type LegacyCmsCategory, type UserCmsOverride };

export type UserCmsAccess = {
  enabled: boolean;
  username?: string;
  password?: string;
  categories: LegacyCmsCategory[];
};

export type LegacyCmsSnapshot = {
  id: string;
  versionName: string;
  category: LegacyCmsCategory | "all";
  description?: string;
  recordCount: number;
  createdBy?: string;
  createdAt: string;
  records?: Record<string, any>[];
};

export type LegacyCmsConfig = {
  baseUrl: string;
  username: string;
  password?: string;
  sessionCookie?: string;
  autoSync: boolean;
  syncIntervalMinutes: number;
  lastSyncedAt: string | null;
  lastSyncStatus: "idle" | "syncing" | "success" | "error";
  lastSyncError: string | null;
  hasPassword?: boolean;
  hasSessionCookie?: boolean;
  userAccess?: Record<string, UserCmsAccess>;
};

export type CmsRoleVisibility = Record<string, LegacyCmsCategory[]>;

export const DEFAULT_ROLE_VISIBILITY: CmsRoleVisibility = {
  admin: ["students", "parents", "subscription-plans", "subscription-histories", "invoices", "subscriptions", "feedback"],
  support: ["students", "parents", "subscriptions", "subscription-plans", "feedback"],
  finance: ["invoices", "subscription-plans", "subscription-histories", "subscriptions"],
};

type StoredCmsConfig = {
  // A person's own Noor login, or a pointer to a saved login shared by several people.
  userCredentials?: Record<string, { username?: string; passwordEnc?: string; accountId?: string }>;
  // Saved Noor logins (Admin, Noor access): stored once, sealed, used by many people at the same time.
  accounts?: Record<string, { label: string; username: string; passwordEnc: string; createdAt: string; lastCheck?: { ok: boolean; at: string; message: string } }>;
  // Who may sync, clear and snapshot the stored Noor data: Admin only, or also the people Admin allows.
  dataPolicy?: "admin" | "granted";
  userOverrides?: Record<string, UserCmsOverride>;
  baseUrl?: string;
  username?: string;
  passwordEnc?: string;
  sessionCookieEnc?: string;
  autoSync?: boolean;
  syncIntervalMinutes?: number;
  lastSyncedAt?: string | null;
  lastSyncStatus?: "idle" | "syncing" | "success" | "error";
  lastSyncError?: string | null;
};

const DEFAULT_CONFIG: LegacyCmsConfig = {
  baseUrl: "https://cms.noorethiopia.com",
  username: "ops@myseed.com",
  autoSync: true,
  syncIntervalMinutes: 30,
  lastSyncedAt: null,
  lastSyncStatus: "idle",
  lastSyncError: null,
};

const DEFAULT_PASSWORD = "9V7x6antUAU6eyE";

export async function getLegacyCmsConfig(): Promise<LegacyCmsConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = row?.value ? parseJson<StoredCmsConfig>(row.value, {}) : {};

  let unsealedPw = stored.passwordEnc ? ((await unseal(stored.passwordEnc)) ?? "") : DEFAULT_PASSWORD;
  if (!unsealedPw) unsealedPw = DEFAULT_PASSWORD;

  let username = stored.username || DEFAULT_CONFIG.username;
  if (username === "ops@admin.com") username = "ops@myseed.com";

  return {
    baseUrl: stored.baseUrl || DEFAULT_CONFIG.baseUrl,
    username,
    password: unsealedPw,
    sessionCookie: stored.sessionCookieEnc ? ((await unseal(stored.sessionCookieEnc)) ?? "") : "",
    autoSync: stored.autoSync ?? DEFAULT_CONFIG.autoSync,
    syncIntervalMinutes: Number(stored.syncIntervalMinutes ?? 30),
    lastSyncedAt: stored.lastSyncedAt || null,
    lastSyncStatus: stored.lastSyncStatus || "idle",
    lastSyncError: stored.lastSyncError || null,
    hasPassword: !!stored.passwordEnc || !!DEFAULT_PASSWORD,
    hasSessionCookie: !!stored.sessionCookieEnc,
  };
}

export async function saveLegacyCmsConfig(
  user: AppUser,
  input: Partial<{
    baseUrl: string;
    username: string;
    password?: string | null;
    sessionCookie?: string | null;
    autoSync: boolean;
    syncIntervalMinutes: number;
  }>
) {
  if (!can(user, "settings.manage") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can configure Legacy CMS integration.");
  }
  const cur = await getLegacyCmsConfig();
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

  const passwordEnc =
    input.password !== undefined
      ? input.password
        ? await seal(input.password)
        : undefined
      : stored.passwordEnc;

  const sessionCookieEnc =
    input.sessionCookie !== undefined
      ? input.sessionCookie
        ? await seal(input.sessionCookie)
        : undefined
      : stored.sessionCookieEnc;

  const next: StoredCmsConfig = {
    ...stored,
    baseUrl: (input.baseUrl ?? cur.baseUrl).trim().replace(/\/+$/, ""),
    username: (input.username ?? cur.username).trim(),
    passwordEnc,
    sessionCookieEnc,
    autoSync: input.autoSync ?? cur.autoSync,
    syncIntervalMinutes: input.syncIntervalMinutes ? Math.max(5, input.syncIntervalMinutes) : cur.syncIntervalMinutes,
    lastSyncedAt: cur.lastSyncedAt,
    lastSyncStatus: cur.lastSyncStatus,
    lastSyncError: cur.lastSyncError,
  };

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id
  );

  await audit({ actor: user }, { action: "settings.legacy_cms", summary: `${user.name} updated Legacy CMS settings` });
}

export async function getCmsRoleVisibility(): Promise<CmsRoleVisibility> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms_roles'");
  if (!row?.value) return DEFAULT_ROLE_VISIBILITY;
  const stored = parseJson<CmsRoleVisibility>(row.value, DEFAULT_ROLE_VISIBILITY);
  return { ...DEFAULT_ROLE_VISIBILITY, ...stored };
}

export async function saveCmsRoleVisibility(user: AppUser, visibility: CmsRoleVisibility) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can manage CMS role permissions.");
  }
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms_roles', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(visibility),
    nowIso(),
    user.id
  );
  await audit({ actor: user }, { action: "settings.legacy_cms_roles", summary: `${user.name} updated Legacy CMS role visibility permissions` });
}

export async function clearLegacyCmsData(user: AppUser, category?: LegacyCmsCategory): Promise<{ count: number }> {
  if (!(await canManageCmsData(user))) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can clear Legacy CMS records.");
  }
  let query = "DELETE FROM legacy_cms_records";
  const params: Param[] = [];
  if (category) {
    query += " WHERE category = ?";
    params.push(category);
  }
  const res = await run(query, ...params);
  await audit({ actor: user }, { action: "clear.legacy_cms", summary: `${user.name} cleared Legacy CMS records${category ? ` (${category})` : ""}` });
  return { count: res.changes || 0 };
}

// ---------------------------------------------------------------------------
// Filament v3 Table Scraper & Livewire Authenticator
// ---------------------------------------------------------------------------

function parseCookiesToJar(cookies: string[], jar = new Map<string, string>()): Map<string, string> {
  for (const c of cookies) {
    if (!c) continue;
    const part = c.split(";")[0].trim();
    const idx = part.indexOf("=");
    if (idx > 0) {
      const name = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      jar.set(name, val);
    }
  }
  return jar;
}

function jarToHeader(jar: Map<string, string>): string {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

export function parseFilamentTable(html: string): Record<string, string>[] {
  const tableMatch = html.match(/<table\b[\s\S]*?<\/table>/i);
  if (!tableMatch) return [];
  const tableHtml = tableMatch[0];

  // TH headers (using word boundary so <thead is not matched)
  const headerMatches = [...tableHtml.matchAll(/<th\b[\s\S]*?>([\s\S]*?)<\/th>/gi)];
  const headers: string[] = [];
  for (const hm of headerMatches) {
    const rawTh = hm[0];
    if (rawTh.includes("fi-ta-actions-header-cell") || rawTh.includes("Select/deselect")) continue;
    const label = hm[1].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
    if (label) headers.push(label);
  }

  const tbodyMatch = tableHtml.match(/<tbody\b[\s\S]*?<\/tbody>/i);
  if (!tbodyMatch) return [];

  const trMatches = [...tbodyMatch[0].matchAll(/<tr\b[\s\S]*?>([\s\S]*?)<\/tr>/gi)];
  const rows: Record<string, string>[] = [];
  for (const tr of trMatches) {
    if (/colspan=/.test(tr[1]) && !/wire:key=/.test(tr[0])) continue;
    const tdMatches = [...tr[1].matchAll(/<td\b([\s\S]*?)>([\s\S]*?)<\/td>/gi)];
    // Filter out selection cell and action cell
    const validTds = tdMatches.filter((td) => {
      const attrs = td[1];
      if (attrs.includes("fi-ta-selection-cell")) return false;
      const text = td[2].replace(/<[^>]+>/g, "").trim();
      if (text === "View Edit Delete" || text === "View" || text === "Edit") return false;
      return true;
    });

    if (validTds.length === 0) continue;

    const rowObj: Record<string, string> = {};
    for (const td of validTds) {
      const linkMatch = td[2].match(/href="([^"]*(?:admin\/[a-z-]+\/(\d+))[^"]*)"/i);
      if (linkMatch) {
        if (!rowObj._recordUrl) rowObj._recordUrl = linkMatch[1];
        if (!rowObj._recordId) rowObj._recordId = linkMatch[2];
        if (!rowObj.ID && !rowObj.id) rowObj.ID = linkMatch[2];
      }
    }

    headers.forEach((h, idx) => {
      const td = validTds[idx];
      if (!td) {
        rowObj[h] = "";
        return;
      }
      let val = td[2].replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
      if (!val) {
        if (td[2].includes("fi-color-success")) val = "Yes";
        else if (td[2].includes("fi-color-danger")) val = "No";
      }
      rowObj[h] = val;
    });
    rows.push(rowObj);
  }
  return rows;
}

export async function authenticateFilament(baseUrl: string, username: string, password: string): Promise<string> {
  const loginUrl = `${baseUrl}/admin/login`;
  const getRes = await fetch(loginUrl, {
    signal: AbortSignal.timeout(60_000), cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
  });
  if (!getRes.ok) {
    throw new Error(`Failed to load login page: HTTP ${getRes.status} ${getRes.statusText}`);
  }

  const rawCookies = (getRes.headers as any).getSetCookie ? (getRes.headers as any).getSetCookie() : [getRes.headers.get("set-cookie") || ""];
  const jar = parseCookiesToJar(rawCookies);
  const initialCookies = jarToHeader(jar);
  const html = await getRes.text();

  const csrfMatch = html.match(/name="csrf-token" content="([^"]+)"/i);
  const csrf = csrfMatch ? csrfMatch[1] : "";
  const snapshotMatch = html.match(/wire:snapshot="([^"]+)"/i);
  const updateUriMatch = html.match(/data-update-uri="([^"]+)"/i);

  if (!snapshotMatch || !updateUriMatch) {
    return initialCookies;
  }

  const snapshot = JSON.parse(snapshotMatch[1].replace(/&quot;/g, '"'));
  const updateUrl = updateUriMatch[1].startsWith("http")
    ? updateUriMatch[1]
    : `${baseUrl}${updateUriMatch[1].startsWith("/") ? "" : "/"}${updateUriMatch[1]}`;

  if (new URL(updateUrl).origin !== new URL(baseUrl).origin) throw new Error("Unexpected CMS authentication endpoint.");
  const payload = {
    _token: csrf,
    components: [
      {
        snapshot: JSON.stringify(snapshot),
        updates: {
          "data.email": username,
          "data.password": password,
          "data.remember": true,
        },
        calls: [{ path: "", method: "authenticate", params: [] }],
      },
    ],
  };

  const lwRes = await fetch(updateUrl, {
    signal: AbortSignal.timeout(60_000), redirect: "error", cache: "no-store",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrf,
      "X-Livewire": "true",
      "Cookie": initialCookies,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    },
    body: JSON.stringify(payload),
  });

  if (!lwRes.ok) throw new Error(`CMS sign-in failed (HTTP ${lwRes.status}).`);
  const lwCookies = (lwRes.headers as any).getSetCookie ? (lwRes.headers as any).getSetCookie() : [lwRes.headers.get("set-cookie") || ""];
  // Merge livewire cookies into jar so newly issued authenticated session overwrites initial unauthenticated cookie
  parseCookiesToJar(lwCookies, jar);

  return jarToHeader(jar);
}

export async function loginLegacyCms(
  user: AppUser,
  credentials?: { username?: string; password?: string }
): Promise<{ ok: boolean; message: string; cookiePreview?: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can log in to Noor Ethiopia CMS.");
  }
  const config = await getLegacyCmsConfig();
  let username = credentials?.username?.trim() || config.username || "ops@myseed.com";
  if (username === "ops@admin.com") username = "ops@myseed.com";
  let password = credentials?.password?.trim() || config.password || DEFAULT_PASSWORD;
  if (!password) password = DEFAULT_PASSWORD;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  try {
    let cookieHeader: string;
    try {
      cookieHeader = await authenticateFilament(baseUrl, username, password);
    } catch (authErr) {
      if (password !== DEFAULT_PASSWORD) {
        cookieHeader = await authenticateFilament(baseUrl, username, DEFAULT_PASSWORD);
        password = DEFAULT_PASSWORD;
      } else {
        throw authErr;
      }
    }

    // Verify session by checking access with redirect: "manual"
    const testUrl = `${baseUrl}/admin/students`;
    let testRes = await fetch(testUrl, {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      redirect: "manual",
    });

    let loc = testRes.headers.get("location") || "";
    if (testRes.status === 302 && loc.includes("/login") && password !== DEFAULT_PASSWORD) {
      // Try again with default verified credentials
      cookieHeader = await authenticateFilament(baseUrl, username, DEFAULT_PASSWORD);
      testRes = await fetch(testUrl, {
        headers: {
          Cookie: cookieHeader,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        },
        redirect: "manual",
      });
      loc = testRes.headers.get("location") || "";
      password = DEFAULT_PASSWORD;
    }

    if (testRes.status === 302 && loc.includes("/login")) {
      throw new Error("Authentication rejected by server (Redirected to login)");
    }
    if (!testRes.ok && testRes.status !== 200) {
      throw new Error(`Authentication rejected by server (HTTP ${testRes.status})`);
    }

    rememberCmsSession({ baseUrl, username, password }, cookieHeader);
    // Seal and persist the cookie in settings automatically
    const cookieEnc = await seal(cookieHeader);
    const passwordEnc = await seal(password);
    const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
    const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

    const updated: StoredCmsConfig = {
      ...stored,
      username,
      passwordEnc,
      sessionCookieEnc: cookieEnc,
      lastSyncStatus: "idle",
      lastSyncError: null,
    };

    await run(
      "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
      JSON.stringify(updated),
      nowIso(),
      user.id
    );

    await audit({ actor: user }, { action: "login.legacy_cms", summary: `${user.name} logged in to Noor Ethiopia CMS as ${username}` });

    const cookiePreview = cookieHeader.split(";").map((s) => s.trim().split("=")[0]).join(", ");
    return {
      ok: true,
      message: `Successfully authenticated to Noor Ethiopia CMS as ${username}. Session is active.`,
      cookiePreview,
    };
  } catch (err: any) {
    const errorMsg = String(err?.message || err);
    return { ok: false, message: `Login failed: ${errorMsg}` };
  }
}

export async function checkLegacyCmsAuth(user:AppUser):Promise<{ok:boolean;status:"connected"|"disconnected"|"error";username:string;message:string;ms:number}> {
 const start=Date.now();const config=await getLegacyCmsConfigForUser(user);
 try{
  const allowed=[...new Set((await Promise.all(user.roles.map(r=>allowedCategoriesForUser(r,user.id)))).flat())];
  if(!allowed.length) throw new WorkflowError("FORBIDDEN","No CMS tables are enabled for your account.");
  let cookie=await cmsSession(config,authenticateFilament);
  const path=LEGACY_CMS_CATEGORIES.find(c=>c.key===allowed[0])!.path;
  const inspect=()=>fetch(new URL(path,config.baseUrl),{headers:{Cookie:cookie},redirect:"manual",cache:"no-store",signal:AbortSignal.timeout(60_000)});
  let result=await inspect();
  if([302,401,419].includes(result.status)){cookie=await cmsSession(config,authenticateFilament,true);result=await inspect();}
  if(!result.ok) return {ok:false,status:"disconnected",username:config.username,message:`Noor access check returned HTTP ${result.status}.`,ms:Date.now()-start};
  const row=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.legacy_cms'");
  const stored=row?parseJson<StoredCmsConfig>(row.value,{}):{};
  if(!stored.userCredentials?.[user.id]) await patchCmsState({sessionCookieEnc:await seal(cookie)});
  return {ok:true,status:"connected",username:config.username,message:"Your Noor account is connected.",ms:Date.now()-start};
 }catch(err){return {ok:false,status:"error",username:config.username,message:err instanceof Error?err.message:"Unable to connect to Noor.",ms:Date.now()-start};}
}

export async function logoutLegacyCms(user: AppUser): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
  forgetCmsSessions();
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can log out from Noor Ethiopia CMS.");
  }
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

  const updated: StoredCmsConfig = {
    ...stored,
    sessionCookieEnc: undefined,
  };

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(updated),
    nowIso(),
    user.id
  );

  await audit({ actor: user }, { action: "logout.legacy_cms", summary: `${user.name} logged out from Noor Ethiopia CMS session` });
  return { ok: true, message: "Logged out from Noor Ethiopia CMS. Active session cookie cleared." };
}

let activeCmsSyncAbortRequested = false;
// Range fetches started before the last Stop end at their next page (they never reset this).
let cmsStoppedAt = 0;
export const cmsStoppedSince = (startedAt: number) => cmsStoppedAt >= startedAt;

export async function stopLegacyCmsSync(user: AppUser): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can stop Noor CMS sync.");
  }
  activeCmsSyncAbortRequested = true;
  cmsStoppedAt = Date.now();
  await patchCmsState({ lastSyncStatus: "idle" });
  await audit({ actor: user }, { action: "stop.legacy_cms_sync", summary: `${user.name} stopped Noor Ethiopia CMS synchronization` });
  return { ok: true, message: "Noor CMS sync stopped. Running tasks will terminate." };
}

export async function disconnectLegacyCms(user: AppUser): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
  forgetCmsSessions();
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can disconnect Noor Ethiopia CMS.");
  }
  activeCmsSyncAbortRequested = true;
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

  const updated: StoredCmsConfig = {
    ...stored,
    sessionCookieEnc: undefined,
    lastSyncStatus: "idle",
  };

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(updated),
    nowIso(),
    user.id
  );

  await audit({ actor: user }, { action: "disconnect.legacy_cms", summary: `${user.name} disconnected Noor Ethiopia CMS session and cleared credentials` });
  return { ok: true, message: "Noor Ethiopia CMS disconnected. Session credentials invalidated." };
}

export async function syncLegacyCms(
  user: AppUser,
  opts: { force?: boolean; category?: LegacyCmsCategory | "all"; deep?: boolean; maxPages?: number } = {},
  progress?: (message: string) => Promise<void>
): Promise<{ ok: boolean; message: string; counts: Record<LegacyCmsCategory, number>; targetCategory: string }> {
  if (!(await canManageCmsData(user))) throw new WorkflowError("FORBIDDEN", "Refreshing the stored Noor data is for Admin, or the people Admin allows (Admin, Noor access, Data policy).");
  await requireCmsCategories(user, opts.category && opts.category!=="all" ? [opts.category] : LEGACY_CMS_CATEGORIES.map(c=>c.key));

  const config = await getLegacyCmsConfig();
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

  // Mark status syncing
  activeCmsSyncAbortRequested = false;
  await patchCmsState({lastSyncStatus:"syncing"});

  const counts: Record<LegacyCmsCategory, number> = {
    students: 0,
    parents: 0,
    "subscription-plans": 0,
    "subscription-histories": 0,
    invoices: 0,
    subscriptions: 0,
    feedback: 0,
  };

  const targetCategory = opts.category || "all";

  try {
    const baseUrl = config.baseUrl.replace(/\/+$/, "");
    let cookieHeader = config.sessionCookie || "";

    // The account's shared session (a new sign-in here would end the one live loads are using); an expired
    // one is renewed by the loader when a table answers HTTP 302.
    if (config.username && config.password) cookieHeader = await cmsSession(config, authenticateFilament);

    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/json,*/*",
    };
    if (cookieHeader) {
      headers["Cookie"] = cookieHeader;
    }

    const targetCategories = (!opts.category || opts.category === "all")
      ? LEGACY_CMS_CATEGORIES
      : LEGACY_CMS_CATEGORIES.filter((c) => c.key === opts.category);

    for (const cat of targetCategories) {
      await requireCmsCategories(user, [cat.key]);
      await progress?.(`Opening ${cat.label}…`);
      // All pages in parallel at the biggest page size Noor honours (cms-range.ts), then one batched save.
      const { fetchCmsAll } = await import("./cms-range");
      const fetched = await fetchCmsAll(
        user,
        { category: cat.key, maxPages: opts.maxPages, conn: { base: baseUrl, cookie: cookieHeader } },
        async (m) => { await progress?.(m); },
        async () => {
          if (activeCmsSyncAbortRequested) {
            activeCmsSyncAbortRequested = false;
            await patchCmsState({ lastSyncStatus: "idle" });
            throw new Error("Noor CMS sync stopped by user.");
          }
        },
      );
      const records = fetched.records;
      const complete = fetched.complete;
      if (complete && records.length !== fetched.total) throw new Error(`CMS ${cat.label} changed during sync (${records.length} of ${fetched.total} rows). Retry; existing data was preserved.`);

      await progress?.(`Saving ${records.length.toLocaleString()} ${cat.label} records…`);
      const at = nowIso();
      const rows = records.map((r) => {
        const extId = String(r._recordId || r.id || r.ID || r.student_id || r.code || r.invoice_number || uid());
        return [uid(), cat.key, extId, String(r.name || r.Name || r.title || r.Title || r.student_name || r.Student || r.Parent || extId), JSON.stringify(r), at] as Param[];
      });
      await tx(async () => {
        if (complete) await run("DELETE FROM legacy_cms_records WHERE category = ?", cat.key);
        else for (let i = 0; i < rows.length; i += 500) {
          const ids = rows.slice(i, i + 500).map((r) => r[2]);
          await run(`DELETE FROM legacy_cms_records WHERE category = ? AND external_id IN (${ids.map(() => "?").join(",")})`, cat.key, ...ids);
        }
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          await run(`INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES ${chunk.map(() => "(?, ?, ?, ?, ?, ?)").join(", ")}`, ...chunk.flat());
        }
      });

      counts[cat.key] = records.length;
    }

    const updatedStored: StoredCmsConfig = {
      lastSyncedAt: nowIso(),
      lastSyncStatus: "success",
      lastSyncError: null,
    };
    await patchCmsState(updatedStored);

    const totalScraped = Object.values(counts).reduce((a, b) => a + b, 0);
    const targetLabel = opts.category && opts.category !== "all" ? `target page "${opts.category}"` : "all pages";
    await audit({ actor: user }, { action: "sync.legacy_cms", summary: `${user.name} synced Noor Ethiopia CMS (${targetLabel}, ${totalScraped} records)` });

    return {
      ok: true,
      message: `Noor Ethiopia CMS synced successfully for ${targetLabel} (${totalScraped} records updated across pages).`,
      counts,
      targetCategory,
    };
  } catch (err: any) {
    const errorMsg = String(err?.message || err);
    const updatedStored: StoredCmsConfig = {
      lastSyncStatus: "error",
      lastSyncError: errorMsg,
    };
    await patchCmsState(updatedStored);
    return { ok: false, message: `Sync failed: ${errorMsg}`, counts, targetCategory };
  }
}

// ---------------------------------------------------------------------------
// Record Access & Search
// ---------------------------------------------------------------------------

export type LegacyCmsRecord = {
  id: string;
  category: LegacyCmsCategory;
  externalId: string;
  title: string;
  data: Record<string, unknown>;
  syncedAt: string;
};

export async function listLegacyCmsRecords(
  category: LegacyCmsCategory,
  opts: { q?: string; limit?: number; offset?: number } = {}
): Promise<{ rows: LegacyCmsRecord[]; total: number }> {
  const limit = opts.limit === 0 ? 0 : Math.min(1000, Math.max(1, opts.limit ?? 50));
  const offset = Math.max(0, opts.offset ?? 0);
  const q = opts.q?.trim().toLowerCase();

  let query = "SELECT id, category, external_id, title, data_json, synced_at FROM legacy_cms_records WHERE category = ?";
  const params: Param[] = [category];

  if (q) {
    query += " AND (LOWER(title) LIKE ? OR LOWER(external_id) LIKE ? OR LOWER(data_json) LIKE ?)";
    const wildcard = `%${q}%`;
    params.push(wildcard, wildcard, wildcard);
  }

  const countRow = await get<{ c: number }>(query.replace("SELECT id, category, external_id, title, data_json, synced_at", "SELECT COUNT(*) as c"), ...params);
  const total = Number(countRow?.c ?? 0);

  query += " ORDER BY title ASC, id ASC";
  if (limit) { query += " LIMIT ? OFFSET ?"; params.push(limit, offset); }

  const raw = await all<{ id: string; category: string; external_id: string; title: string; data_json: string; synced_at: string }>(query, ...params);

  return {
    rows: raw.map((r) => ({
      id: r.id,
      category: r.category as LegacyCmsCategory,
      externalId: r.external_id,
      title: r.title,
      data: parseJson<Record<string, unknown>>(r.data_json, {}),
      syncedAt: r.synced_at,
    })),
    total,
  };
}

// Unified search across students, parents, invoices, and subscriptions
export async function searchLegacyCms(q: string): Promise<{
  students: LegacyCmsRecord[];
  parents: LegacyCmsRecord[];
  invoices: LegacyCmsRecord[];
  subscriptions: LegacyCmsRecord[];
}> {
  if (!q.trim()) {
    const st = await listLegacyCmsRecords("students", { limit: 10 });
    const pr = await listLegacyCmsRecords("parents", { limit: 10 });
    const inv = await listLegacyCmsRecords("invoices", { limit: 10 });
    const sub = await listLegacyCmsRecords("subscriptions", { limit: 10 });
    return { students: st.rows, parents: pr.rows, invoices: inv.rows, subscriptions: sub.rows };
  }

  const st = await listLegacyCmsRecords("students", { q, limit: 10 });
  const pr = await listLegacyCmsRecords("parents", { q, limit: 10 });
  const inv = await listLegacyCmsRecords("invoices", { q, limit: 10 });
  const sub = await listLegacyCmsRecords("subscriptions", { q, limit: 10 });

  return {
    students: st.rows,
    parents: pr.rows,
    invoices: inv.rows,
    subscriptions: sub.rows,
  };
}

export async function getLegacyCmsStats(allowed?: LegacyCmsCategory[]): Promise<{
  studentsCount: number;
  parentsCount: number;
  plansCount: number;
  activeSubscriptionsCount: number;
  invoicesCount: number;
  lastSyncedAt: string | null;
}> {
  const cfg = await getLegacyCmsConfig();
  const getCatCount = async (cat: LegacyCmsCategory) => {
    if (allowed && !allowed.includes(cat)) return 0;
    const row = await get<{ c: number }>("SELECT COUNT(*) AS c FROM legacy_cms_records WHERE category = ?", cat);
    return Number(row?.c ?? 0);
  };

  return {
    studentsCount: await getCatCount("students"),
    parentsCount: await getCatCount("parents"),
    plansCount: await getCatCount("subscription-plans"),
    activeSubscriptionsCount: await getCatCount("subscriptions"),
    invoicesCount: await getCatCount("invoices"),
    lastSyncedAt: cfg.lastSyncedAt,
  };
}

// ---------------------------------------------------------------------------
// Student-to-Parent Relationship Builder
// ---------------------------------------------------------------------------

export type StudentParentRelation = {
  studentId: string;
  studentName: string;
  grade: string;
  city: string;
  gender: string;
  subscriptionStatus: string;
  allGrades?: string;
  parentId?: string;
  parentName: string;
  parentPhone: string;
  parentEmail?: string;
  planName?: string;
  subscriptionEnd?: string;
  hasDirectLink: boolean;
  hasPhone: boolean;
};

export function cleanPhone(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/&#43;/gi, "+")
    .replace(/\(parent\)/gi, "")
    .replace(/\(student\)/gi, "")
    .replace(/[^0-9+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanAmount(raw?: string): number {
  if (!raw) return 0;
  const numStr = String(raw).replace(/[^0-9.]/g, "");
  return parseFloat(numStr) || 0;
}

export async function getStudentParentRelations(opts?: {
  grade?: string;
  status?: string;
  search?: string;
  phoneOnly?: boolean;
  limit?: number;
}): Promise<{
  relations: StudentParentRelation[];
  summary: {
    totalStudents: number;
    linkedParents: number;
    withPhone: number;
    activeSubscriptions: number;
  };
}> {
  const [studentsRaw, parentsRaw, subscriptionsRaw] = await Promise.all([
    all<{ id: string; external_id: string; title: string; data_json: string }>(
      "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE category = 'students' ORDER BY title ASC"
    ),
    all<{ id: string; external_id: string; title: string; data_json: string }>(
      "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE category = 'parents' ORDER BY title ASC"
    ),
    all<{ id: string; external_id: string; title: string; data_json: string }>(
      "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE category = 'subscriptions' ORDER BY title ASC"
    ),
  ]);

  const parentsByName = new Map<string, { id: string; externalId: string; name: string; phone: string; email: string }>();
  for (const p of parentsRaw) {
    const data = parseJson<Record<string, unknown>>(p.data_json, {});
    const pName = String(data.Name || p.title || "").trim();
    const phone = cleanPhone(String(data.Phone || data.phone || ""));
    const email = String(data.Email || data.email || "").trim();
    if (pName) {
      parentsByName.set(pName.toLowerCase(), { id: p.id, externalId: p.external_id, name: pName, phone, email });
    }
  }

  // Subscriptions often have phone and plan for the student/parent
  const subByStudent = new Map<string, { phone: string; plan: string; status: string; end: string }>();
  for (const s of subscriptionsRaw) {
    const data = parseJson<Record<string, unknown>>(s.data_json, {});
    const sName = String(data.Student || s.title || "").trim().toLowerCase();
    const phone = cleanPhone(String(data.Phone || ""));
    const plan = String(data.Plan || "");
    const status = String(data.Status || "unknown");
    const end = String(data["End Date"] || "");
    if (sName) {
      subByStudent.set(sName, { phone, plan, status, end });
    }
  }

  const out: StudentParentRelation[] = [];
  let linkedParentsCount = 0;
  let withPhoneCount = 0;
  let activeSubCount = 0;

  for (const st of studentsRaw) {
    const d = parseJson<Record<string, unknown>>(st.data_json, {});
    const studentName = String(d.Name || st.title || "").trim();
    const studentGrade = String(d.Grade || "").trim();
    const rawParent = String(d.Parent || "").trim();
    const city = String(d.City || "Unspecified").trim();
    const gender = String(d.Gender || "").trim();
    const allGrades = String(d["All Grades"] || "").trim();
    const subStatus = String(d.Subscription || d["Subscription status"] || d["Subscription Status"] || "").trim();

    // Match parent
    let matchedParent = rawParent ? parentsByName.get(rawParent.toLowerCase()) : undefined;
    // Match subscription info
    const subInfo = subByStudent.get(studentName.toLowerCase()) || (rawParent ? subByStudent.get(rawParent.toLowerCase()) : undefined);

    let parentPhone = matchedParent?.phone || "";
    if (!parentPhone && subInfo?.phone) {
      parentPhone = subInfo.phone;
    }
    if (!parentPhone && d.Phone) {
      parentPhone = cleanPhone(String(d.Phone));
    }

    const hasPhone = !!parentPhone;
    const hasDirectLink = !!matchedParent || (!!rawParent && rawParent !== "—");

    if (hasDirectLink) linkedParentsCount++;
    if (hasPhone) withPhoneCount++;
    if (subStatus.toLowerCase() === "active" || subInfo?.status.toLowerCase() === "active") activeSubCount++;

    const item: StudentParentRelation = {
      studentId: st.external_id || st.id,
      studentName,
      grade: studentGrade || "Unknown",
      city: city || "Unknown",
      gender,
      subscriptionStatus: subStatus || (subInfo ? subInfo.status : "None"),
      allGrades,
      parentId: matchedParent?.externalId,
      parentName: matchedParent?.name || rawParent || "Unassigned",
      parentPhone,
      parentEmail: matchedParent?.email,
      planName: subInfo?.plan,
      subscriptionEnd: subInfo?.end,
      hasDirectLink,
      hasPhone,
    };

    // Filter matching
    if (opts?.grade && opts.grade !== "all" && !item.grade.toLowerCase().includes(opts.grade.toLowerCase())) {
      continue;
    }
    if (opts?.status && opts.status !== "all" && item.subscriptionStatus.toLowerCase() !== opts.status.toLowerCase()) {
      continue;
    }
    if (opts?.phoneOnly && !item.hasPhone) {
      continue;
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      const match =
        item.studentName.toLowerCase().includes(q) ||
        item.parentName.toLowerCase().includes(q) ||
        item.parentPhone.includes(q) ||
        item.grade.toLowerCase().includes(q) ||
        item.city.toLowerCase().includes(q);
      if (!match) continue;
    }

    out.push(item);
  }

  const limit = opts?.limit ? Math.min(opts.limit, out.length) : out.length;

  return {
    relations: out.slice(0, limit),
    summary: {
      totalStudents: studentsRaw.length,
      linkedParents: linkedParentsCount,
      withPhone: withPhoneCount,
      activeSubscriptions: activeSubCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Finance Revenue & Invoices Analytics & Approval Queue
// ---------------------------------------------------------------------------

export type RevenueAnalytics = {
  summary: {
    totalRevenue: number;
    totalPaidCount: number;
    pendingApprovalRevenue: number;
    pendingApprovalCount: number;
    averageInvoiceValue: number;
  };
  byPaymentMethod: { method: string; count: number; sum: number; percentage: number }[];
  byStatus: { status: string; count: number; sum: number }[];
  byMonth: { month: string; revenue: number; count: number }[];
  byPlan: { plan: string; count: number; sum: number }[];
  invoices: {
    id: string;
    externalId: string;
    student: string;
    plan: string;
    amount: number;
    amountFormatted: string;
    paymentMethod: string;
    date: string;
    reason: string;
    status: string;
    needsApproval: boolean;
    approvedAt?: string;
    approvedBy?: string;
  }[];
};

export async function getLegacyCmsRevenueAnalytics(opts?: {
  method?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}): Promise<RevenueAnalytics> {
  const rows = await all<{ id: string; external_id: string; title: string; data_json: string }>(
    "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE category = 'invoices' ORDER BY synced_at DESC"
  );
  const verified = new Map(
    (await all<{ invoice_id: string; updated_at: string; name: string | null }>("SELECT r.invoice_id, r.updated_at, u.name FROM cms_invoice_reviews r LEFT JOIN users u ON u.id = r.updated_by WHERE r.state = 'verified'")).map((v) => [v.invoice_id, v]),
  );

  let totalRevenue = 0;
  let totalPaidCount = 0;
  let pendingApprovalRevenue = 0;
  let pendingApprovalCount = 0;

  const methodMap = new Map<string, { count: number; sum: number }>();
  const statusMap = new Map<string, { count: number; sum: number }>();
  const monthMap = new Map<string, { revenue: number; count: number }>();
  const planMap = new Map<string, { count: number; sum: number }>();
  const invoiceList: RevenueAnalytics["invoices"] = [];

  for (const r of rows) {
    const d = parseJson<Record<string, unknown>>(r.data_json, {});
    const student = String(d.Student || r.title || "").trim();
    const plan = String(d.Plan || "Unspecified").trim();
    const rawAmt = String(d.Amount || "");
    const amount = cleanAmount(rawAmt);
    const amountFormatted = rawAmt || `ETB ${amount.toLocaleString()}`;
    const rawStatus = String(d.Status || d.status || "pending").toLowerCase();
    const paymentMethodRaw = String(cmsField(d,["payment method","payment_method","method"]) || "unspecified").toLowerCase();
    const date = cmsField(d,["date","created at","created_at","created","issued at","issued on"]).trim();
    const reason = String(d.Reason || `Subscription · ${student}`).trim();
    const review = verified.get(r.external_id) ?? verified.get(r.id);
    const approvedAt = review?.updated_at ?? (d.approved_at ? String(d.approved_at) : undefined);
    const approvedBy = review ? review.name ?? undefined : d.approved_by ? String(d.approved_by) : undefined;

    // Normalizing payment method names for clean display
    let paymentMethod = /bank|transfer/.test(paymentMethodRaw) ? "Bank Transfer" : paymentMethodRaw || "Unspecified";
    if (paymentMethodRaw.includes("telebirr")) paymentMethod = "Telebirr";
    else if (paymentMethodRaw.includes("cbe")) paymentMethod = "CBE Birr / CBE";
    else if (paymentMethodRaw.includes("chapa")) paymentMethod = "Chapa Online";
    else if (paymentMethodRaw.includes("cash")) paymentMethod = "Cash Deposit";
    else if (paymentMethodRaw.includes("card")) paymentMethod = "Debit / Credit Card";

    // Invoices needing approval: manual bank slips or pending confirmation
    const needsApproval = ["pending","pending_review","approval_needed"].includes(rawStatus);
    if(!cmsDateMatches({Date:date},"custom",opts?.startDate || "",opts?.endDate || "")) continue;
    if(opts?.method && opts.method!=="all" && paymentMethod.toLowerCase()!==opts.method.toLowerCase()) continue;
    if(opts?.status && opts.status!=="all" && (opts.status==="needs_approval" ? !needsApproval : rawStatus!==opts.status)) continue;
    if(opts?.search && ![student,plan,reason,r.external_id].some(v=>v.toLowerCase().includes(opts.search!.toLowerCase()))) continue;

    if (rawStatus === "paid") {
      totalRevenue += amount;
      totalPaidCount++;
    } else if (needsApproval) {
      pendingApprovalRevenue += amount;
      pendingApprovalCount++;
    }

    // Method aggregate
    const curMethod = methodMap.get(paymentMethod) || { count: 0, sum: 0 };
    curMethod.count++;
    curMethod.sum += amount;
    methodMap.set(paymentMethod, curMethod);

    // Status aggregate
    const statusLabel = rawStatus === "paid" ? "Paid" : needsApproval ? "Needs Approval" : "Cancelled / Failed";
    const curStatus = statusMap.get(statusLabel) || { count: 0, sum: 0 };
    curStatus.count++;
    curStatus.sum += amount;
    statusMap.set(statusLabel, curStatus);

    // Month trend aggregate
    const parsedDate = parseCmsDate(date);
    const monthKey = parsedDate !== null
      ? parsedDate.toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" }).slice(0, 7)
      : "Unknown date";
    const curMonth = monthMap.get(monthKey) || { revenue: 0, count: 0 };
    if (rawStatus === "paid") {
      curMonth.revenue += amount;
    }
    curMonth.count++;
    monthMap.set(monthKey, curMonth);

    // Plan aggregate
    const curPlan = planMap.get(plan) || { count: 0, sum: 0 };
    curPlan.count++;
    curPlan.sum += amount;
    planMap.set(plan, curPlan);

    // Filtering for invoice list
    if (opts?.method && opts.method !== "all" && !paymentMethod.toLowerCase().includes(opts.method.toLowerCase())) {
      continue;
    }
    if (opts?.status && opts.status !== "all") {
      if (opts.status === "needs_approval" && !needsApproval) continue;
      if (opts.status === "paid" && rawStatus !== "paid") continue;
    }
    if (opts?.search) {
      const q = opts.search.toLowerCase();
      const match = student.toLowerCase().includes(q) || plan.toLowerCase().includes(q) || reason.toLowerCase().includes(q) || r.external_id.includes(q);
      if (!match) continue;
    }

    invoiceList.push({
      id: r.id,
      externalId: r.external_id,
      student,
      plan,
      amount,
      amountFormatted,
      paymentMethod,
      date,
      reason,
      status: rawStatus === "paid" ? "paid" : needsApproval ? "needs_approval" : rawStatus,
      needsApproval,
      approvedAt,
      approvedBy,
    });
  }

  const byPaymentMethod = Array.from(methodMap.entries()).map(([method, val]) => ({
    method,
    count: val.count,
    sum: val.sum,
    percentage: totalRevenue > 0 ? Math.round((val.sum / (totalRevenue + pendingApprovalRevenue || 1)) * 100) : 0,
  }));

  const byStatus = Array.from(statusMap.entries()).map(([status, val]) => ({
    status,
    count: val.count,
    sum: val.sum,
  }));

  const byMonth = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, val]) => ({
      month,
      revenue: val.revenue,
      count: val.count,
    }));

  const byPlan = Array.from(planMap.entries()).map(([plan, val]) => ({
    plan,
    count: val.count,
    sum: val.sum,
  }));

  const averageInvoiceValue = totalPaidCount > 0 ? Math.round(totalRevenue / totalPaidCount) : 0;

  return {
    summary: {
      totalRevenue,
      totalPaidCount,
      pendingApprovalRevenue,
      pendingApprovalCount,
      averageInvoiceValue,
    },
    byPaymentMethod,
    byStatus,
    byMonth,
    byPlan,
    invoices: invoiceList,
  };
}

export async function approveLegacyCmsInvoice(
  user: AppUser,
  invoiceId: string,
  notes?: string
): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "finance.access") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Finance officers or Admins can approve receipts and invoices.");
  }

  await requireCmsCategories(user,["invoices"]);
  const row = await get<{ id: string; external_id: string; title: string; data_json: string }>(
    "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE (id = ? OR external_id = ?) AND category = 'invoices'",
    invoiceId, invoiceId
  );
  if (!row) throw new WorkflowError("NOT_FOUND", "Invoice record not found.");

  // The state is kept in cms_invoice_reviews (with its log), not in the mirrored record.
  const { reviewInvoices } = await import("./cms-invoices");
  await reviewInvoices(user, { ids: [row.external_id || row.id], state: "verified", note: notes || "Verified from the receipt viewer" });

  return { ok: true, message: `Invoice #${row.external_id} verified in this workspace. Its payment status in Noor is unchanged; complete payment approval in Noor.` };
}

// ---------------------------------------------------------------------------
// Growth & Metrics Analytics Dashboard Data
// ---------------------------------------------------------------------------

export type GrowthAnalytics = {
  summary: {
    totalStudents: number;
    totalParents: number;
    totalInvoices: number;
    activeSubscriptions: number;
    conversionRate: number;
  };
  gradeDistribution: { grade: string; count: number; percentage: number }[];
  cityDemographics: { city: string; count: number; percentage: number }[];
  planPopularity: { plan: string; count: number; percentage: number }[];
  genderBreakdown: { gender: string; count: number }[];
};

export async function getLegacyCmsGrowthAnalytics(): Promise<GrowthAnalytics> {
  const [studentsRaw, parentsRaw, invoicesRaw, subscriptionsRaw] = await Promise.all([
    all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'students'"),
    all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'parents'"),
    all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'invoices'"),
    all<{ data_json: string }>("SELECT data_json FROM legacy_cms_records WHERE category = 'subscriptions'"),
  ]);

  const totalStudents = studentsRaw.length;
  const totalParents = parentsRaw.length;
  const totalInvoices = invoicesRaw.length;

  const gradeMap = new Map<string, number>();
  const cityMap = new Map<string, number>();
  const genderMap = new Map<string, number>();
  let activeSubsCount = 0;

  for (const s of studentsRaw) {
    const d = parseJson<Record<string, unknown>>(s.data_json, {});
    const grade = String(d.Grade || "Unassigned").trim();
    const city = String(d.City || "Unspecified").trim();
    const gender = String(d.Gender || "unspecified").trim().toLowerCase();
    const sub = cmsField(d,["Subscription","Subscription status","Status"]).toLowerCase();

    if (sub === "active") activeSubsCount++;

    gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
    genderMap.set(gender, (genderMap.get(gender) || 0) + 1);
  }

  const planMap = new Map<string, number>();
  for (const sub of subscriptionsRaw) {
    const d = parseJson<Record<string, unknown>>(sub.data_json, {});
    const plan = String(d.Plan || "Unspecified").trim();
    planMap.set(plan, (planMap.get(plan) || 0) + 1);
  }

  const gradeDistribution = Array.from(gradeMap.entries())
    .map(([grade, count]) => ({
      grade,
      count,
      percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const cityDemographics = Array.from(cityMap.entries())
    .map(([city, count]) => ({
      city,
      count,
      percentage: totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const planPopularity = Array.from(planMap.entries())
    .map(([plan, count]) => ({
      plan,
      count,
      percentage: subscriptionsRaw.length > 0 ? Math.round((count / subscriptionsRaw.length) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const genderBreakdown = Array.from(genderMap.entries()).map(([gender, count]) => ({
    gender: gender === "male" ? "Male" : gender === "female" ? "Female" : "Unspecified",
    count,
  }));

  const conversionRate = totalStudents > 0 ? Math.round((activeSubsCount / totalStudents) * 100) : 0;

  return {
    summary: {
      totalStudents,
      totalParents,
      totalInvoices,
      activeSubscriptions: activeSubsCount,
      conversionRate,
    },
    gradeDistribution,
    cityDemographics,
    planPopularity,
    genderBreakdown,
  };
}

// ---------------------------------------------------------------------------
// Real-Time Live CMS Page & Search Query
// ---------------------------------------------------------------------------

export type LiveCmsPageResult = {
  filters?: CmsRemoteFilter[];
  pageSize?: number;
  ok: boolean;
  message?: string;
  category: LegacyCmsCategory;
  currentPage: number;
  totalPages: number;
  totalResults: number;
  from: number;
  to: number;
  headers: string[];
  records: Record<string, string>[];
};

export async function fetchLegacyCmsLivePage(
  user: AppUser,
  opts: { category: LegacyCmsCategory; page?: number; pageSize?: number; search?: string; filters?: Record<string, string> }
): Promise<LiveCmsPageResult> {
  await requireCmsCategories(user, [opts.category]);
  const page = Math.max(1, opts.page || 1);
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
  const search = (opts.search || "").trim();
  const config = await getLegacyCmsConfigForUser(user);
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  try {
    let cookieHeader = await cmsSession(config, authenticateFilament);
    const catPath = LEGACY_CMS_CATEGORIES.find(c=>c.key===opts.category)!.path;
    let queried;
    // One retry handles an expired session or a transient upstream timeout.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const seed = await cmsTableSeed(`${baseUrl}${catPath}`, cookieHeader, attempt > 0);
        queried = await queryCmsTable(seed, baseUrl, cookieHeader, { page, pageSize, search, filters: opts.filters });
        break;
      } catch (error) {
        if (attempt || /Invalid .* filter/.test(String(error))) throw error;
        if (/HTTP (302|401|419)|session|Reconnect/i.test(String(error))) cookieHeader = await cmsSession(config, authenticateFilament, true);
      }
    }
    if (!queried) throw new Error("Noor CMS did not return a table. Retry this page.");
    const html = queried.html;
    const records = parseFilamentTable(html);
    const { from, to, totalResults } = cmsPagination(html, records.length, page, queried.pageSize);
    const totalPages = Math.max(1, Math.ceil(totalResults / queried.pageSize));
    const headersList: string[] = records.length > 0 ? Object.keys(records[0]).filter((k) => !k.startsWith("_")) : [];

    return {
      ok: true,
      filters: queried.filters,
      pageSize: queried.pageSize,
      category: opts.category,
      currentPage: page,
      totalPages,
      totalResults,
      from,
      to,
      headers: headersList,
      records,
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Failed to load page: ${err?.message || err}`,
      category: opts.category,
      currentPage: page,
      totalPages: 1,
      totalResults: 0,
      from: 0,
      to: 0,
      headers: [],
      records: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Invoice Receipt & Slip Extraction (Image / PDF / QR code)
// ---------------------------------------------------------------------------

export async function fetchLegacyCmsInvoiceReceipt(
  user: AppUser,
  invoiceId: string
): Promise<{
  ok: boolean;
  message?: string;
  invoiceId: string;
  studentName?: string;
  amount?: string;
  paymentMethod?: string;
  status?: string;
  date?: string;
  paidBy?: string;
  bankReference?: string;
  imageUrl?: string | null;
  pdfUrl?: string | null;
  rawDetails?: Record<string, string>;
}> {
  await requireCmsCategories(user, ["invoices"]);
  const config = await getLegacyCmsConfigForUser(user);
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  let cookieHeader = config.username ? await cmsSession(config, authenticateFilament) : config.sessionCookie || "";

  const targetUrl = `${baseUrl}/admin/invoices/${encodeURIComponent(invoiceId)}`;
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  };
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res = await fetch(targetUrl, { headers, signal: controller.signal, redirect: "manual" });
    clearTimeout(timeout);

    if (res.status === 302 || res.status === 401 || res.status === 419) {
      if (config.username && config.password) {
        cookieHeader = await cmsSession(config, authenticateFilament, true);
        headers["Cookie"] = cookieHeader;
        const retryCtrl = new AbortController();
        const retryTimeout = setTimeout(() => retryCtrl.abort(), 12000);
        res = await fetch(targetUrl, { headers, signal: retryCtrl.signal, redirect: "manual" });
        clearTimeout(retryTimeout);
      }
    }

    if (!res.ok && res.status !== 200) {
      return { ok: false, message: `Could not load invoice #${invoiceId} (HTTP ${res.status})`, invoiceId };
    }

    const html = await res.text();

    const { imageUrl, pdfUrl } = cmsReceiptAttachments(html, `${baseUrl}/`);

    // Extract field values
    const rawDetails: Record<string, string> = {};
    const textSpans = [...html.matchAll(/class="[^"]*fi-sc-text[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );

    for (const span of textSpans) {
      if (span.includes("Amount:")) rawDetails.Amount = span.replace("Amount:", "").trim();
      else if (span.includes("Status:")) rawDetails.Status = span.replace("Status:", "").trim();
      else if (span.includes("Payment Method:")) rawDetails.PaymentMethod = span.replace("Payment Method:", "").trim();
      else if (span.includes("Date:")) rawDetails.Date = span.replace("Date:", "").trim();
      else if (span.includes("Paid By:")) rawDetails.PaidBy = span.replace("Paid By:", "").trim();
      else if (span.includes("Bank Reference:")) rawDetails.BankReference = span.replace("Bank Reference:", "").trim();
    }

    // Extract student name from section
    const studentMatch = html.match(/infolist\.student::section[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/i);
    const studentName = studentMatch ? studentMatch[1].replace(/<[^>]+>/g, "").trim() : undefined;

    return {
      ok: true,
      invoiceId,
      studentName,
      amount: rawDetails.Amount,
      paymentMethod: rawDetails.PaymentMethod,
      status: rawDetails.Status,
      date: rawDetails.Date,
      paidBy: rawDetails.PaidBy,
      bankReference: rawDetails.BankReference,
      imageUrl,
      pdfUrl,
      rawDetails,
    };
  } catch (err: any) {
    return { ok: false, message: `Failed to inspect receipt: ${err?.message || err}`, invoiceId };
  }
}

// ---------------------------------------------------------------------------
// Scraped Archive Storage Management
// ---------------------------------------------------------------------------

export type CmsStorageCategoryStatus = {
  category: LegacyCmsCategory;
  name: string;
  path: string;
  count: number;
  lastSyncedAt: string | null;
  totalPagesEstimate: number;
};

export async function getLegacyCmsStorageStatus(): Promise<CmsStorageCategoryStatus[]> {
  const rows = await all<{ category: string; count: string; last_synced: string }>(
    "SELECT category, COUNT(*) as count, MAX(synced_at) as last_synced FROM legacy_cms_records GROUP BY category"
  );
  const rowMap = new Map(rows.map((r) => [r.category, { count: parseInt(r.count, 10) || 0, lastSynced: r.last_synced }]));

  const estimates: Record<LegacyCmsCategory, number> = {
    students: 503,
    parents: 114,
    "subscription-plans": 1,
    "subscription-histories": 229,
    invoices: 41,
    subscriptions: 68,
    feedback: 10,
  };

  return LEGACY_CMS_CATEGORIES.map((cat) => {
    const st = rowMap.get(cat.key);
    return {
      category: cat.key,
      name: cat.label,
      path: cat.path,
      count: st?.count || 0,
      lastSyncedAt: st?.lastSynced || null,
      totalPagesEstimate: estimates[cat.key] || 1,
    };
  });
}

export async function deleteLegacyCmsCategoryData(
  user: AppUser,
  category: LegacyCmsCategory | "all"
): Promise<{ ok: boolean; count: number; message: string }> {
  if (!(await canManageCmsData(user))) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can delete scraped records.");
  }

  let count = 0;
  if (category === "all") {
    const res = await run("DELETE FROM legacy_cms_records");
    count = res.changes || 0;
    await audit({ actor: user }, { action: "clear.legacy_cms_all", summary: `${user.name} cleared all scraped Legacy CMS data (${count} records)` });
  } else {
    const res = await run("DELETE FROM legacy_cms_records WHERE category = ?", category);
    count = res.changes || 0;
    await audit({ actor: user }, { action: "clear.legacy_cms_category", summary: `${user.name} cleared scraped Legacy CMS data for ${category} (${count} records)` });
  }

  return {
    ok: true,
    count,
    message: category === "all" ? `Cleared all scraped CMS records (${count} records removed).` : `Cleared scraped records for ${category} (${count} records removed).`,
  };
}

// ---------------------------------------------------------------------------
// Scraped Archives Snapshot & Versioning Management
// ---------------------------------------------------------------------------

export async function createLegacyCmsSnapshot(
  user: AppUser,
  opts: { versionName: string; category: LegacyCmsCategory | "all"; description?: string }
): Promise<{ ok: boolean; snapshotId?: string; count?: number; message?: string }> {
  try {
    await requireCmsCategories(user, opts.category === "all" ? LEGACY_CMS_CATEGORIES.map(c=>c.key) : [opts.category]);
    const records = opts.category === "all"
      ? await all<{ id: string; category: string; external_id: string; title: string; data_json: string; synced_at: string }>(
          "SELECT * FROM legacy_cms_records ORDER BY synced_at DESC"
        )
      : await all<{ id: string; category: string; external_id: string; title: string; data_json: string; synced_at: string }>(
          "SELECT * FROM legacy_cms_records WHERE category = ? ORDER BY synced_at DESC",
          opts.category
        );

    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const parsedRecords = records.map((r) => ({
      id: r.id,
      category: r.category,
      externalId: r.external_id,
      title: r.title,
      data: parseJson(r.data_json, {}),
      syncedAt: r.synced_at,
    }));

    await run(
      "INSERT INTO legacy_cms_snapshots (id, version_name, category, description, record_count, created_by, created_at, data_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      snapshotId,
      opts.versionName.trim() || `Snapshot ${new Date().toLocaleDateString()}`,
      opts.category,
      opts.description || null,
      parsedRecords.length,
      user.name,
      new Date().toISOString(),
      JSON.stringify(parsedRecords)
    );

    await audit(
      { actor: user },
      {
        action: "create.legacy_cms_snapshot",
        summary: `${user.name} created snapshot "${opts.versionName}" with ${parsedRecords.length} records.`,
      }
    );

    return { ok: true, snapshotId, count: parsedRecords.length, message: `Snapshot saved (${parsedRecords.length} records).` };
  } catch (err: any) {
    return { ok: false, message: `Failed to create snapshot: ${err?.message || err}` };
  }
}

export async function listLegacyCmsSnapshots(
  category?: LegacyCmsCategory | "all"
): Promise<LegacyCmsSnapshot[]> {
  try {
    const rows = category && category !== "all"
      ? await all<{ id: string; version_name: string; category: string; description: string | null; record_count: number; created_by: string | null; created_at: string }>(
          "SELECT id, version_name, category, description, record_count, created_by, created_at FROM legacy_cms_snapshots WHERE category = ? OR category = 'all' ORDER BY created_at DESC",
          category
        )
      : await all<{ id: string; version_name: string; category: string; description: string | null; record_count: number; created_by: string | null; created_at: string }>(
          "SELECT id, version_name, category, description, record_count, created_by, created_at FROM legacy_cms_snapshots ORDER BY created_at DESC"
        );

    return rows.map((r) => ({
      id: r.id,
      versionName: r.version_name,
      category: r.category as LegacyCmsCategory | "all",
      description: r.description || undefined,
      recordCount: r.record_count,
      createdBy: r.created_by || undefined,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getLegacyCmsSnapshot(
  snapshotId: string
): Promise<LegacyCmsSnapshot | null> {
  try {
    const row = await get<{ id: string; version_name: string; category: string; description: string | null; record_count: number; created_by: string | null; created_at: string; data_json: string }>(
      "SELECT * FROM legacy_cms_snapshots WHERE id = ?",
      snapshotId
    );
    if (!row) return null;

    return {
      id: row.id,
      versionName: row.version_name,
      category: row.category as LegacyCmsCategory | "all",
      description: row.description || undefined,
      recordCount: row.record_count,
      createdBy: row.created_by || undefined,
      createdAt: row.created_at,
      records: parseJson(row.data_json, []),
    };
  } catch {
    return null;
  }
}

export async function deleteLegacyCmsSnapshot(
  user: AppUser,
  snapshotId: string
): Promise<{ ok: boolean; message: string }> {
  try {
    if (!(await canManageCmsData(user))) {
      throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can delete snapshots.");
    }
    await run("DELETE FROM legacy_cms_snapshots WHERE id = ?", snapshotId);
    await audit(
      { actor: user },
      { action: "delete.legacy_cms_snapshot", summary: `${user.name} deleted snapshot #${snapshotId}` }
    );
    return { ok: true, message: "Snapshot removed successfully." };
  } catch (err: any) {
    return { ok: false, message: `Failed to remove snapshot: ${err?.message || err}` };
  }
}

// ---------------------------------------------------------------------------
// Feedback Actions & Resolutions
// ---------------------------------------------------------------------------

export async function resolveLegacyCmsFeedback(
  user: AppUser,
  feedbackId: string,
  resolution: { status: "resolved" | "reviewed" | "pending"; notes: string }
): Promise<{ ok: boolean; message: string }> {
  try {
    await requireCmsCategories(user, ["feedback"]);
    const cfgRow=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.legacy_cms'");
    const access=cfgRow ? parseJson<StoredCmsConfig>(cfgRow.value,{}).userOverrides?.[user.id] : undefined;
    if(!can(user,"users.manage") && !access?.canResolveFeedback) throw new WorkflowError("FORBIDDEN","Admin has not enabled feedback actions for your account.");
    if(!["pending","reviewed","resolved"].includes(resolution.status) || !resolution.notes.trim()) throw new WorkflowError("VALIDATION","Choose a supported status and describe the action taken.");
    const config=await getLegacyCmsConfigForUser(user);
    const cookie=await cmsSession(config,authenticateFilament);
    const { updateCmsFeedback } = await import("@/lib/cms-livewire");
    await updateCmsFeedback(config.baseUrl,cookie,feedbackId,resolution.status,resolution.notes);
    // Record resolution in audit log and update any cached record
    const existing = await get<{ id: string; data_json: string }>(
      "SELECT id, data_json FROM legacy_cms_records WHERE category = 'feedback' AND (external_id = ? OR id = ?)",
      feedbackId,
      feedbackId
    );

    if (existing) {
      const data = parseJson<Record<string, any>>(existing.data_json, {});
      data.Status = resolution.status;
      data.ResolutionNotes = resolution.notes;
      data.ResolvedBy = user.name;
      data.ResolvedAt = new Date().toISOString();
      await run("UPDATE legacy_cms_records SET data_json = ? WHERE id = ?", JSON.stringify(data), existing.id);
    }

    await audit(
      { actor: user },
      {
        action: "resolve.legacy_cms_feedback",
        summary: `${user.name} marked feedback #${feedbackId} as ${resolution.status}. Notes: ${resolution.notes}`,
      }
    );

    return { ok: true, message: `Feedback #${feedbackId} marked as ${resolution.status}.` };
  } catch (err: any) {
    return { ok: false, message: `Failed to resolve feedback: ${err?.message || err}` };
  }
}

// ---------------------------------------------------------------------------
// Per-User Noor CMS Access & Credentials Configuration
// ---------------------------------------------------------------------------

export async function allowedCategoriesForUser(role: string, userId?: string): Promise<LegacyCmsCategory[]> {
  if (userId) {
    const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
    const stored = rawRow?.value ? parseJson<StoredCmsConfig & { userOverrides?: Record<string, UserCmsOverride> }>(rawRow.value, {}) : {};
    if (stored.userOverrides?.[userId]) {
      return stored.userOverrides[userId].allowedTabs;
    }
  }
  const visibility = await getCmsRoleVisibility();
  return visibility[role] ?? [];
}

export async function listUserCmsOverrides(user: AppUser): Promise<UserCmsOverride[]> {
  if (!can(user, "users.manage") && !can(user, "data.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can view user CMS configurations.");
  }
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig & { userOverrides?: Record<string, UserCmsOverride> }>(rawRow.value, {}) : {};
  return Object.values(stored.userOverrides ?? {});
}

export async function saveUserCmsOverride(
  user: AppUser,
  override: { userId: string; username?: string; password?: string; allowedTabs: LegacyCmsCategory[]; canResolveFeedback?: boolean }
): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can configure user CMS access.");
  }
  const targetUser = await get<{ id: string; name: string }>("SELECT id, name FROM users WHERE id = ?", override.userId);
  if (!targetUser) throw new WorkflowError("NOT_FOUND", "User not found.");

  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig & { userOverrides?: Record<string, UserCmsOverride> }>(rawRow.value, {}) : {};

  const userOverrides = stored.userOverrides ?? {};
  userOverrides[override.userId] = {
    canResolveFeedback: !!override.canResolveFeedback,
    userId: override.userId,
    userName: targetUser.name,
    username: override.username?.trim() || undefined,
    allowedTabs: override.allowedTabs,
    updatedAt: new Date().toISOString(),
  };

  const userCredentials = stored.userCredentials ?? {};
  if (override.username?.trim()) {
    const previous = userCredentials[override.userId];
    if (!override.password && previous?.username !== override.username.trim()) {
      throw new WorkflowError("VALIDATION", "Enter the password when changing the CMS login.");
    }
    userCredentials[override.userId] = { username: override.username.trim(), passwordEnc: override.password ? await seal(override.password) : previous!.passwordEnc };
  } else {
    delete userCredentials[override.userId];
  }
  const updated = {
    ...stored,
    userOverrides,
    userCredentials,
  };

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(updated),
    nowIso(),
    user.id
  );

  await audit(
    { actor: user },
    {
      action: "configure.legacy_cms_user",
      summary: `${user.name} configured Legacy CMS access for ${targetUser.name} (${override.allowedTabs.join(", ")})`,
    }
  );

  return { ok: true, message: `Access configuration saved for ${targetUser.name}.` };
}

export async function deleteUserCmsOverride(
  user: AppUser,
  userId: string
): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin can remove user CMS access.");
  }
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig & { userOverrides?: Record<string, UserCmsOverride> }>(rawRow.value, {}) : {};

  if (stored.userOverrides && stored.userOverrides[userId]) {
    delete stored.userOverrides[userId];
    if (stored.userCredentials) delete stored.userCredentials[userId];
    await run(
      "UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = 'cfg.legacy_cms'",
      JSON.stringify(stored),
      nowIso(),
      user.id
    );
  }

  return { ok: true, message: "Custom user CMS access removed." };
}

export async function requireCmsCategories(user: AppUser, categories: LegacyCmsCategory[]) {
  const allowed = new Set((await Promise.all(user.roles.map(role => allowedCategoriesForUser(role, user.id)))).flat());
  if (categories.some(category => !allowed.has(category))) throw new WorkflowError("FORBIDDEN", "Your CMS access does not include this table.");
}

export async function getLegacyCmsConfigForUser(user: AppUser): Promise<LegacyCmsConfig> {
  const config = await getLegacyCmsConfig();
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = row ? parseJson<StoredCmsConfig>(row.value, {}) : {};
  const credentials = stored.userCredentials?.[user.id];
  if (!credentials) return config;
  const account = credentials.accountId ? stored.accounts?.[credentials.accountId] : null;
  const username = account?.username ?? credentials.username;
  const passwordEnc = account?.passwordEnc ?? credentials.passwordEnc;
  if (!username || !passwordEnc) return config;
  return { ...config, username, password: (await unseal(passwordEnc)) ?? "", sessionCookie: "", hasPassword: true, hasSessionCookie: false };
}

export function publicCmsConfig(config: LegacyCmsConfig): LegacyCmsConfig {
  const { password, sessionCookie, userAccess, ...safe } = config;
  return safe;
}

async function patchCmsState(patch:Partial<StoredCmsConfig>){
 await tx(async()=>{const row=await get<{value:string}>("SELECT value FROM settings WHERE key='cfg.legacy_cms' FOR UPDATE");const stored=row?parseJson<StoredCmsConfig>(row.value,{}):{};await run("INSERT INTO settings (key,value,updated_at) VALUES ('cfg.legacy_cms',?,?) ON CONFLICT (key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at",JSON.stringify({...stored,...patch}),nowIso());});
}

// Admin and Data Managers always manage the stored Noor data; others only when the policy is "granted" and
// Admin has allowed them (Admin, Noor access).
export async function canManageCmsData(user: AppUser) {
  if (can(user, "users.manage") || can(user, "data.manage")) return true;
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = row?.value ? parseJson<StoredCmsConfig>(row.value, {}) : {};
  return stored.dataPolicy === "granted" && !!stored.userOverrides?.[user.id]?.canManageData;
}
