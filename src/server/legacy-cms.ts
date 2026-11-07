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
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
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

function parseFilamentTable(html: string): Record<string, string>[] {
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

export async function checkLegacyCmsAuth(
  user: AppUser
): Promise<{ ok: boolean; status: "connected" | "disconnected" | "error"; username: string; message: string; ms: number }> {
  const start = Date.now();
  const config = await getLegacyCmsConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  let username = config.username || "ops@myseed.com";
  if (username === "ops@admin.com") username = "ops@myseed.com";
  let password = config.password || DEFAULT_PASSWORD;

  let cookieHeader = config.sessionCookie || "";

  if (!cookieHeader) {
    try {
      cookieHeader = await authenticateFilament(baseUrl, username, password);
      const cookieEnc = await seal(cookieHeader);
      const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
      const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};
      await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify({ ...stored, username, sessionCookieEnc: cookieEnc }));
    } catch (err: any) {
      if (password !== DEFAULT_PASSWORD) {
        try {
          cookieHeader = await authenticateFilament(baseUrl, username, DEFAULT_PASSWORD);
          const cookieEnc = await seal(cookieHeader);
          const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
          const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};
          await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify({ ...stored, username, sessionCookieEnc: cookieEnc }));
        } catch {
          return {
            ok: false,
            status: "disconnected",
            username,
            message: `Not connected: ${err?.message || err}`,
            ms: Date.now() - start,
          };
        }
      } else {
        return {
          ok: false,
          status: "disconnected",
          username,
          message: `Not connected: ${err?.message || err}`,
          ms: Date.now() - start,
        };
      }
    }
  }

  if (!cookieHeader) {
    return {
      ok: false,
      status: "disconnected",
      username: config.username,
      message: "No active session cookie or credentials found.",
      ms: Date.now() - start,
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res = await fetch(`${baseUrl}/admin/students`, {
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      },
      redirect: "manual",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    // Auto-refresh session if expired
    const loc = res.headers.get("location") || "";
    if ((res.status === 302 && loc.includes("/login")) || res.status === 401 || res.status === 419) {
      if (config.username && config.password) {
        try {
          cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
          const cookieEnc = await seal(cookieHeader);
          const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
          const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};
          await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify({ ...stored, sessionCookieEnc: cookieEnc }));

          const retryCtrl = new AbortController();
          const retryTimeout = setTimeout(() => retryCtrl.abort(), 12000);
          res = await fetch(`${baseUrl}/admin/students`, {
            headers: {
              Cookie: cookieHeader,
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            },
            redirect: "manual",
            signal: retryCtrl.signal,
          });
          clearTimeout(retryTimeout);
        } catch {
          // ignore error here and handle below
        }
      }
    }

    const ms = Date.now() - start;
    const retryLoc = res.headers.get("location") || "";
    if (res.status === 200 && !retryLoc.includes("/login")) {
      return {
        ok: true,
        status: "connected",
        username: config.username,
        message: `Session active and verified with Noor CMS (HTTP 200)`,
        ms,
      };
    }

    return {
      ok: false,
      status: "disconnected",
      username: config.username,
      message: `Session expired (HTTP ${res.status})`,
      ms,
    };
  } catch (err: any) {
    return {
      ok: false,
      status: "error",
      username: config.username,
      message: `CMS unreachable: ${err?.message || err}`,
      ms: Date.now() - start,
    };
  }
}

export async function logoutLegacyCms(user: AppUser): Promise<{ ok: boolean; message: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
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

export async function syncLegacyCms(
  user: AppUser,
  opts: { force?: boolean; category?: LegacyCmsCategory | "all"; deep?: boolean; maxPages?: number } = {}
): Promise<{ ok: boolean; message: string; counts: Record<LegacyCmsCategory, number>; targetCategory: string }> {
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only Admin or Data Managers can trigger Legacy CMS sync.");
  }

  const config = await getLegacyCmsConfig();
  const rawRow = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  const stored = rawRow?.value ? parseJson<StoredCmsConfig>(rawRow.value, {}) : {};

  // Mark status syncing
  await run(
    "UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'",
    JSON.stringify({ ...stored, lastSyncStatus: "syncing" })
  );

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

    // Authenticate with Livewire if credentials provided and no explicit cookie
    if (!cookieHeader && config.username && config.password) {
      cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
      const cookieEnc = await seal(cookieHeader);
      await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify({ ...stored, sessionCookieEnc: cookieEnc }));
    }

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
      let records: Record<string, unknown>[] = [];
      const targetUrl = `${baseUrl}${cat.path}`;

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);
        let res = await fetch(targetUrl, { headers, signal: controller.signal });
        clearTimeout(timeout);

        // If session expired or redirected to login, auto-refresh and retry once
        if (res.url.includes("/login") || res.status === 401 || res.status === 419) {
          if (config.username && config.password) {
            try {
              cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
              headers["Cookie"] = cookieHeader;
              const cookieEnc = await seal(cookieHeader);
              await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify({ ...stored, sessionCookieEnc: cookieEnc }));

              const retryCtrl = new AbortController();
              const retryTimeout = setTimeout(() => retryCtrl.abort(), 20000);
              res = await fetch(targetUrl, { headers, signal: retryCtrl.signal });
              clearTimeout(retryTimeout);
            } catch (authErr) {
              console.warn(`[legacy-cms] Auto re-auth failed during sync:`, authErr);
            }
          }
        }

        if (res.ok && !res.url.includes("/login")) {
          const contentType = res.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const json = await res.json();
            records = Array.isArray(json) ? json : json.data || json.rows || json.items || [];
          } else {
            const html = await res.text();
            const p1 = parseFilamentTable(html);
            records.push(...p1);

            // Check total count from Filament pagination (e.g. "Showing 1 to 10 of 5,024 results")
            const totalMatch = html.match(/Showing \d+ to \d+ of ([0-9,]+) results/i);
            const totalItems = totalMatch ? parseInt(totalMatch[1].replace(/,/g, ""), 10) : p1.length;
            const totalPages = Math.ceil(totalItems / 10);

            // Determine how many pages to scrape:
            // - subscription-plans: 1
            // - invoices: ALL pages (e.g. 41 pages ~ 403 invoices)
            // - subscriptions: ALL pages (e.g. 68 pages ~ 677 subscriptions)
            // - parents: all or deep (default 50-114 pages)
            // - students: 30-100 pages (~300-1000 students) or deep all
            let pagesToScrape = 1;
            if (cat.key === "subscription-plans") {
              pagesToScrape = 1;
            } else if (opts.maxPages && opts.maxPages > 0) {
              pagesToScrape = Math.min(totalPages, opts.maxPages);
            } else if (opts.deep || opts.category === cat.key) {
              pagesToScrape = totalPages; // Scrape ALL pages across category
            } else if (cat.key === "invoices" || cat.key === "subscriptions") {
              pagesToScrape = totalPages;
            } else {
              pagesToScrape = Math.min(totalPages, 50);
            }

            if (pagesToScrape > 1) {
              const pageNums: number[] = [];
              for (let p = 2; p <= pagesToScrape; p++) pageNums.push(p);

              // Scrape in concurrent batches of 12 for higher performance
              const BATCH = 12;
              for (let i = 0; i < pageNums.length; i += BATCH) {
                const batch = pageNums.slice(i, i + BATCH);
                const batchResults = await Promise.all(
                  batch.map(async (p) => {
                    try {
                      const pRes = await fetch(`${targetUrl}?page=${p}`, { headers });
                      if (pRes.ok && !pRes.url.includes("/login")) {
                        const pHtml = await pRes.text();
                        return parseFilamentTable(pHtml);
                      }
                    } catch (err) {
                      console.warn(`[legacy-cms] Page ${p} fetch failed for ${cat.key}:`, err);
                    }
                    return [];
                  })
                );
                for (const rows of batchResults) {
                  records.push(...rows);
                }
              }
            }
          }
        }
      } catch (fetchErr) {
        console.warn(`[legacy-cms] Failed to fetch ${targetUrl}:`, fetchErr);
      }

      // Persist real scraped records into database transaction
      await tx(async () => {
        await run("DELETE FROM legacy_cms_records WHERE category = ?", cat.key);
        for (const r of records) {
          const recordId = uid();
          const extId = String(r.id || r.ID || r.student_id || r.code || r.invoice_number || uid());
          const title = String(r.name || r.Name || r.title || r.Title || r.student_name || r.Student || r.Parent || extId);
          await run(
            "INSERT INTO legacy_cms_records (id, category, external_id, title, data_json, synced_at) VALUES (?, ?, ?, ?, ?, ?)",
            recordId,
            cat.key,
            extId,
            title,
            JSON.stringify(r),
            nowIso()
          );
        }
      });

      counts[cat.key] = records.length;
    }

    const updatedStored: StoredCmsConfig = {
      ...stored,
      lastSyncedAt: nowIso(),
      lastSyncStatus: "success",
      lastSyncError: null,
    };
    await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify(updatedStored));

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
      ...stored,
      lastSyncStatus: "error",
      lastSyncError: errorMsg,
    };
    await run("UPDATE settings SET value = ? WHERE key = 'cfg.legacy_cms'", JSON.stringify(updatedStored));
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
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
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

  query += " ORDER BY title ASC LIMIT ? OFFSET ?";
  params.push(limit, offset);

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

export async function getLegacyCmsStats(): Promise<{
  studentsCount: number;
  parentsCount: number;
  plansCount: number;
  activeSubscriptionsCount: number;
  invoicesCount: number;
  lastSyncedAt: string | null;
}> {
  const cfg = await getLegacyCmsConfig();
  const getCatCount = async (cat: LegacyCmsCategory) => {
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

function cleanPhone(raw?: string): string {
  if (!raw) return "";
  return raw
    .replace(/&#43;/gi, "+")
    .replace(/\(parent\)/gi, "")
    .replace(/\(student\)/gi, "")
    .replace(/[^0-9+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAmount(raw?: string): number {
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
    const status = String(data.Status || "active");
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
    const city = String(d.City || "Addis Ababa").trim();
    const gender = String(d.Gender || "").trim();
    const allGrades = String(d["All Grades"] || "").trim();
    const subStatus = String(d.Subscription || "None").trim();

    // Match parent
    let matchedParent = rawParent ? parentsByName.get(rawParent.toLowerCase()) : undefined;
    if (!matchedParent && rawParent) {
      // Partial match
      for (const [key, pObj] of parentsByName.entries()) {
        if (key.includes(rawParent.toLowerCase()) || rawParent.toLowerCase().includes(key)) {
          matchedParent = pObj;
          break;
        }
      }
    }

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
      grade: studentGrade || "Grade 5",
      city: city || "Addis Ababa",
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
    const plan = String(d.Plan || "3 month package").trim();
    const rawAmt = String(d.Amount || "");
    const amount = cleanAmount(rawAmt);
    const amountFormatted = rawAmt || `ETB ${amount.toLocaleString()}`;
    const rawStatus = String(d.Status || d.status || "pending").toLowerCase();
    const paymentMethodRaw = String(d["Payment Method"] || d.payment_method || "bank").toLowerCase();
    const date = String(d.Date || d.created_at || "").trim();
    const reason = String(d.Reason || `Subscription · ${student}`).trim();
    const approvedAt = d.approved_at ? String(d.approved_at) : undefined;
    const approvedBy = d.approved_by ? String(d.approved_by) : undefined;

    // Normalizing payment method names for clean display
    let paymentMethod = "Bank Transfer";
    if (paymentMethodRaw.includes("telebirr")) paymentMethod = "Telebirr";
    else if (paymentMethodRaw.includes("cbe")) paymentMethod = "CBE Birr / CBE";
    else if (paymentMethodRaw.includes("chapa")) paymentMethod = "Chapa Online";
    else if (paymentMethodRaw.includes("cash")) paymentMethod = "Cash Deposit";
    else if (paymentMethodRaw.includes("card")) paymentMethod = "Debit / Credit Card";

    // Invoices needing approval: manual bank slips or pending confirmation
    const needsApproval = rawStatus === "pending" || rawStatus === "approval_needed" || (paymentMethod === "Bank Transfer" && rawStatus !== "paid");

    if (rawStatus === "paid" || approvedAt) {
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
    const statusLabel = rawStatus === "paid" || approvedAt ? "Paid" : needsApproval ? "Needs Approval" : "Cancelled / Failed";
    const curStatus = statusMap.get(statusLabel) || { count: 0, sum: 0 };
    curStatus.count++;
    curStatus.sum += amount;
    statusMap.set(statusLabel, curStatus);

    // Month trend aggregate
    const parsedDate = new Date(date);
    const monthKey = !isNaN(parsedDate.getTime())
      ? `${parsedDate.getFullYear()}-${String(parsedDate.getMonth() + 1).padStart(2, "0")}`
      : "2026-08";
    const curMonth = monthMap.get(monthKey) || { revenue: 0, count: 0 };
    if (rawStatus === "paid" || approvedAt) {
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
      if (opts.status === "paid" && rawStatus !== "paid" && !approvedAt) continue;
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
      date: date || "Aug 2026",
      reason,
      status: rawStatus === "paid" || approvedAt ? "paid" : needsApproval ? "needs_approval" : rawStatus,
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

  const row = await get<{ id: string; external_id: string; title: string; data_json: string }>(
    "SELECT id, external_id, title, data_json FROM legacy_cms_records WHERE id = ? AND category = 'invoices'",
    invoiceId
  );
  if (!row) throw new WorkflowError("NOT_FOUND", "Invoice record not found.");

  const data = parseJson<Record<string, unknown>>(row.data_json, {});
  const updatedData = {
    ...data,
    Status: "paid",
    status: "paid",
    approved_at: nowIso(),
    approved_by: user.name,
    approval_notes: notes || "Manually verified by Finance officer",
  };

  await run("UPDATE legacy_cms_records SET data_json = ? WHERE id = ?", JSON.stringify(updatedData), invoiceId);
  await audit({ actor: user }, { action: "finance.invoice_approve", summary: `${user.name} approved invoice #${row.external_id} (${row.title})` });

  return { ok: true, message: `Invoice #${row.external_id} successfully verified and marked as Paid.` };
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
    const city = String(d.City || "Addis Ababa").trim();
    const gender = String(d.Gender || "unspecified").trim().toLowerCase();
    const sub = String(d.Subscription || "").toLowerCase();

    if (sub === "active") activeSubsCount++;

    gradeMap.set(grade, (gradeMap.get(grade) || 0) + 1);
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
    genderMap.set(gender, (genderMap.get(gender) || 0) + 1);
  }

  const planMap = new Map<string, number>();
  for (const sub of subscriptionsRaw) {
    const d = parseJson<Record<string, unknown>>(sub.data_json, {});
    const plan = String(d.Plan || "3 month package").trim();
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
  opts: { category: LegacyCmsCategory; page?: number; pageSize?: number; search?: string }
): Promise<LiveCmsPageResult> {
  const page = Math.max(1, opts.page || 1);
  const pageSize = opts.pageSize && opts.pageSize > 0 ? opts.pageSize : 10;
  const search = (opts.search || "").trim();
  const config = await getLegacyCmsConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  let cookieHeader = config.sessionCookie || "";
  if (!cookieHeader && config.username && config.password) {
    try {
      cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
    } catch (e) {
      console.warn("[legacy-cms] Failed to authenticate for live page fetch:", e);
    }
  }

  const catPath = LEGACY_CMS_CATEGORIES.find((c) => c.key === opts.category)?.path || `/admin/${opts.category}`;
  const searchParam = search ? `&tableSearch=${encodeURIComponent(search)}&search=${encodeURIComponent(search)}` : "";
  const perPageParam = `&tableRecordsPerPage=${pageSize}&perPage=${pageSize}`;
  const targetUrl = `${baseUrl}${catPath}?page=${page}&tablePage=${page}${perPageParam}${searchParam}`;

  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,application/json,*/*",
  };
  if (cookieHeader) headers["Cookie"] = cookieHeader;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res = await fetch(targetUrl, { headers, signal: controller.signal, redirect: "manual" });
    clearTimeout(timeout);

    if (res.status === 302 || res.status === 401 || res.status === 419) {
      if (config.username && config.password) {
        cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
        headers["Cookie"] = cookieHeader;
        const retryCtrl = new AbortController();
        const retryTimeout = setTimeout(() => retryCtrl.abort(), 12000);
        res = await fetch(targetUrl, { headers, signal: retryCtrl.signal, redirect: "manual" });
        clearTimeout(retryTimeout);
      }
    }

    if (!res.ok && res.status !== 200) {
      return {
        ok: false,
        message: `HTTP ${res.status}: Failed to fetch page from Noor CMS`,
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

    const html = await res.text();
    const records = parseFilamentTable(html);

    // Parse "Showing X to Y of Z results"
    const showingMatch = html.match(/Showing\s+([0-9,]+)\s+to\s+([0-9,]+)\s+of\s+([0-9,]+)\s+results/i);
    let from = 0;
    let to = 0;
    let totalResults = records.length;
    if (showingMatch) {
      from = parseInt(showingMatch[1].replace(/,/g, ""), 10);
      to = parseInt(showingMatch[2].replace(/,/g, ""), 10);
      totalResults = parseInt(showingMatch[3].replace(/,/g, ""), 10);
    }
    const totalPages = Math.max(1, Math.ceil(totalResults / pageSize));
    const headersList: string[] = records.length > 0 ? Object.keys(records[0]).filter((k) => !k.startsWith("_")) : [];

    return {
      ok: true,
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
  const config = await getLegacyCmsConfig();
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  let cookieHeader = config.sessionCookie || "";
  if (!cookieHeader && config.username && config.password) {
    cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
  }

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
        cookieHeader = await authenticateFilament(baseUrl, config.username, config.password);
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

    // Extract PDF download link
    const pdfMatch = html.match(/href="([^"]*\/invoices\/\d+\/download[^"]*)"/i);
    const pdfUrl = pdfMatch ? (pdfMatch[1].startsWith("http") ? pdfMatch[1] : `${baseUrl}${pdfMatch[1]}`) : null;

    // Extract any image attachments (e.g. /storage/... or image tags)
    const imgMatches = [...html.matchAll(/<img\b[^>]*src="([^"]+)"[^>]*>/gi)]
      .map((m) => m[1])
      .filter((src) => !src.includes("ui-avatars") && !src.includes("data:image/svg"));

    let imageUrl = imgMatches[0] || null;
    if (imageUrl && !imageUrl.startsWith("http")) {
      imageUrl = `${baseUrl}${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
    }

    // Also look for storage link in <a> tags (e.g. uploaded slip)
    if (!imageUrl) {
      const storageMatch = html.match(/href="([^"]*(?:\.jpg|\.jpeg|\.png|\.webp|storage\/[^"]+)[^"]*)"/i);
      if (storageMatch) {
        imageUrl = storageMatch[1].startsWith("http") ? storageMatch[1] : `${baseUrl}${storageMatch[1]}`;
      }
    }

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
  if (!can(user, "data.manage") && !can(user, "users.manage")) {
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
    if (!can(user, "data.manage") && !can(user, "users.manage")) {
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
  resolution: { status: "resolved" | "in_review" | "closed"; notes: string }
): Promise<{ ok: boolean; message: string }> {
  try {
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
    if (stored.userOverrides?.[userId]?.allowedTabs?.length) {
      return stored.userOverrides[userId].allowedTabs;
    }
  }
  const visibility = await getCmsRoleVisibility();
  return visibility[role] ?? ["students", "parents", "feedback"];
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
  override: { userId: string; username?: string; password?: string; allowedTabs: LegacyCmsCategory[] }
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
    userId: override.userId,
    userName: targetUser.name,
    username: override.username?.trim() || undefined,
    allowedTabs: override.allowedTabs,
    updatedAt: new Date().toISOString(),
  };

  const updated = {
    ...stored,
    userOverrides,
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
    await run(
      "UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = 'cfg.legacy_cms'",
      JSON.stringify(stored),
      nowIso(),
      user.id
    );
  }

  return { ok: true, message: "Custom user CMS access removed." };
}
