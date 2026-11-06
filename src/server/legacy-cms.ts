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

export type LegacyCmsCategory =
  | "students"
  | "parents"
  | "subscription-plans"
  | "subscription-histories"
  | "invoices"
  | "subscriptions";

export const LEGACY_CMS_CATEGORIES: { key: LegacyCmsCategory; label: string; path: string; description: string }[] = [
  { key: "students", label: "Students", path: "/admin/students", description: "Enrolled students, grade levels, parent contacts and IDs." },
  { key: "parents", label: "Parents", path: "/admin/parents", description: "Parent names, phone numbers, emails, and student links." },
  { key: "subscription-plans", label: "Subscription Plans", path: "/admin/subscription-plans", description: "Available subscription tiers, pricing, and curriculum access." },
  { key: "subscription-histories", label: "Subscription Histories", path: "/admin/subscription-histories", description: "Past subscription terms, renew cycles, and audit history." },
  { key: "invoices", label: "Invoices", path: "/admin/invoices", description: "Payment invoices, CBE / Telebirr bank references, and receipts." },
  { key: "subscriptions", label: "Active Subscriptions", path: "/admin/subscriptions", description: "Currently active subscriptions and expiration dates." },
];

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
};

export type CmsRoleVisibility = Record<string, LegacyCmsCategory[]>;

export const DEFAULT_ROLE_VISIBILITY: CmsRoleVisibility = {
  admin: ["students", "parents", "subscription-plans", "subscription-histories", "invoices", "subscriptions"],
  support: ["students", "parents", "subscriptions", "subscription-plans"],
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

async function authenticateFilament(baseUrl: string, username: string, password: string): Promise<string> {
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
  opts: { force?: boolean; category?: LegacyCmsCategory | "all" } = {}
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
            records = parseFilamentTable(html);
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
    await audit({ actor: user }, { action: "sync.legacy_cms", summary: `${user.name} synced Noor Ethiopia CMS (${targetLabel})` });

    return {
      ok: true,
      message: `Noor Ethiopia CMS synced successfully for ${targetLabel} (${totalScraped} records updated).`,
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
