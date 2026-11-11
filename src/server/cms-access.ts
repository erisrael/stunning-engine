import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { can, listUsers, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { myDepartments } from "./departments";
import { forgetCmsSessions } from "./cms-session";
import { authenticateFilament, getCmsRoleVisibility, getLegacyCmsConfig, LEGACY_CMS_CATEGORIES, type LegacyCmsCategory } from "./legacy-cms";
import type { UserCmsOverride } from "@/lib/legacy-cms";

// Admin, Noor access (Update 1.0): the shared connection, saved Noor logins that several people use at once,
// who sees which Noor tables (per person, by department and role, in one table), and who manages the stored data.

type Stored = {
  userOverrides?: Record<string, UserCmsOverride>;
  userCredentials?: Record<string, { username?: string; passwordEnc?: string; accountId?: string }>;
  accounts?: Record<string, { label: string; username: string; passwordEnc: string; createdAt: string; lastCheck?: { ok: boolean; at: string; message: string } }>;
  dataPolicy?: "admin" | "granted";
  [k: string]: unknown;
};
const needAdmin = (u: AppUser) => {
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages Noor access.");
};
async function read(): Promise<Stored> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.legacy_cms'");
  return row?.value ? parseJson<Stored>(row.value, {}) : {};
}
async function write(user: AppUser, s: Stored) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.legacy_cms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(s),
    nowIso(),
    user.id,
  );
}

export type CmsAccessPerson = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  departments: { key: string; title: string }[];
  override: UserCmsOverride | null;
  login: { kind: "shared" | "account" | "own"; label: string };
  effectiveTables: LegacyCmsCategory[];
};

export async function cmsAccessOverview(user: AppUser) {
  needAdmin(user);
  const s = await read();
  const config = await getLegacyCmsConfig();
  const visibility = await getCmsRoleVisibility();
  const people: CmsAccessPerson[] = [];
  for (const u of await listUsers()) {
    const o = s.userOverrides?.[u.id] ?? null;
    const c = s.userCredentials?.[u.id];
    const acct = c?.accountId ? s.accounts?.[c.accountId] : null;
    people.push({
      id: u.id,
      name: u.name,
      email: u.email,
      roles: u.roles,
      // Their departments: where they are a member (by role) or hold a position, not merely ones they can open.
      departments: (await myDepartments(u).catch(() => [])).filter((d) => !!d.position).map((d) => ({ key: d.dept, title: d.title })),
      override: o,
      login: acct ? { kind: "account", label: acct.label } : c?.username ? { kind: "own", label: c.username } : { kind: "shared", label: config.username || "Shared login" },
      effectiveTables: o ? o.allowedTabs : [...new Set(u.roles.flatMap((r) => visibility[r] ?? []))],
    });
  }
  const counts = await all<{ category: string; c: number; last: string | null }>("SELECT category, COUNT(*) AS c, MAX(synced_at) AS last FROM legacy_cms_records GROUP BY category");
  const cache = await get<{ c: number; days: number }>("SELECT COUNT(*) AS c, COUNT(DISTINCT day) AS days FROM cms_range_cache");
  const reviews = await get<{ c: number }>("SELECT COUNT(*) AS c FROM cms_invoice_reviews");
  return {
    connection: { baseUrl: config.baseUrl, username: config.username, hasPassword: !!config.password, hasSession: !!config.sessionCookie, autoSync: config.autoSync, syncIntervalMinutes: config.syncIntervalMinutes, lastSyncedAt: config.lastSyncedAt, lastSyncStatus: config.lastSyncStatus, lastSyncError: config.lastSyncError },
    accounts: Object.entries(s.accounts ?? {}).map(([id, a]) => ({ id, label: a.label, username: a.username, createdAt: a.createdAt, lastCheck: a.lastCheck ?? null, users: Object.values(s.userCredentials ?? {}).filter((c) => c.accountId === id).length })),
    people,
    roles: Object.keys(visibility),
    visibility,
    dataPolicy: s.dataPolicy ?? "admin",
    stored: {
      tables: LEGACY_CMS_CATEGORIES.map((c) => ({ key: c.key, label: c.label, rows: Number(counts.find((x) => x.category === c.key)?.c ?? 0), last: counts.find((x) => x.category === c.key)?.last ?? null })),
      cacheRows: Number(cache?.c ?? 0),
      cacheDays: Number(cache?.days ?? 0),
      invoiceReviews: Number(reviews?.c ?? 0),
    },
  };
}

// Saved Noor logins.
export async function saveCmsAccount(user: AppUser, input: { id?: string; label: string; username: string; password?: string }) {
  needAdmin(user);
  const s = await read();
  const accounts = { ...(s.accounts ?? {}) };
  const label = input.label.trim().slice(0, 60);
  const username = input.username.trim().slice(0, 200);
  if (!label || !username) throw new WorkflowError("VALIDATION", "Give the login a name and the Noor email.");
  const prev = input.id ? accounts[input.id] : undefined;
  if (!prev && !input.password) throw new WorkflowError("VALIDATION", "Enter the Noor password.");
  const id = input.id ?? uid("noor_");
  accounts[id] = { label, username, passwordEnc: input.password ? await seal(input.password) : prev!.passwordEnc, createdAt: prev?.createdAt ?? nowIso(), lastCheck: prev?.username === username && !input.password ? prev.lastCheck : undefined };
  await write(user, { ...s, accounts });
  forgetCmsSessions();
  await audit({ actor: user }, { action: "configure.legacy_cms_account", summary: `${user.name} ${prev ? "updated" : "saved"} the Noor login "${label}" (${username})` });
  return id;
}

export async function deleteCmsAccount(user: AppUser, id: string) {
  needAdmin(user);
  const s = await read();
  const accounts = { ...(s.accounts ?? {}) };
  const label = accounts[id]?.label;
  delete accounts[id];
  const creds = Object.fromEntries(Object.entries(s.userCredentials ?? {}).filter(([, c]) => c.accountId !== id));
  await write(user, { ...s, accounts, userCredentials: creds });
  forgetCmsSessions();
  await audit({ actor: user }, { action: "configure.legacy_cms_account", summary: `${user.name} removed the Noor login "${label}"; its people now use the shared login` });
}

// Signs in to Noor with a saved login (or the shared one) and opens a table, to prove it works.
export async function testCmsLogin(user: AppUser, accountId: string | "shared") {
  needAdmin(user);
  const s = await read();
  const config = await getLegacyCmsConfig();
  const a = accountId === "shared" ? null : s.accounts?.[accountId];
  if (accountId !== "shared" && !a) throw new WorkflowError("NOT_FOUND", "Saved login not found.");
  const username = a?.username ?? config.username;
  const password = a ? ((await unseal(a.passwordEnc)) ?? "") : (config.password ?? "");
  const base = config.baseUrl.replace(/\/+$/, "");
  const start = Date.now();
  let result: { ok: boolean; message: string };
  try {
    const cookie = await authenticateFilament(base, username, password);
    const res = await fetch(`${base}/admin/invoices`, { headers: { Cookie: cookie }, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    const loc = res.headers.get("location") ?? "";
    result = res.ok ? { ok: true, message: `Signed in as ${username} (${Date.now() - start} ms).` } : { ok: false, message: loc.includes("login") ? `Noor did not accept ${username}: wrong email or password.` : `Noor answered HTTP ${res.status}.` };
  } catch (e) {
    result = { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
  if (a) {
    a.lastCheck = { ...result, at: nowIso() };
    await write(user, { ...s, accounts: { ...s.accounts, [accountId]: a } });
  }
  return result;
}

// Grant (or change) Noor access for several people at once.
export async function grantCmsAccess(
  user: AppUser,
  input: {
    userIds: string[];
    tables?: LegacyCmsCategory[];
    addTables?: LegacyCmsCategory[];
    removeTables?: LegacyCmsCategory[];
    canResolveFeedback?: boolean;
    canManageData?: boolean;
    login?: { kind: "shared" } | { kind: "account"; accountId: string } | { kind: "own"; username: string; password?: string };
  },
) {
  needAdmin(user);
  const ids = [...new Set(input.userIds)].slice(0, 500);
  if (!ids.length) throw new WorkflowError("VALIDATION", "Choose at least one person.");
  const valid = new Set(LEGACY_CMS_CATEGORIES.map((c) => c.key));
  const s = await read();
  const overrides = { ...(s.userOverrides ?? {}) };
  const creds = { ...(s.userCredentials ?? {}) };
  const people = new Map((await listUsers({ includeInactive: true })).map((u) => [u.id, u]));
  const visibility = await getCmsRoleVisibility();
  if (input.login?.kind === "account" && !s.accounts?.[input.login.accountId]) throw new WorkflowError("NOT_FOUND", "Saved login not found.");
  for (const id of ids) {
    const p = people.get(id);
    if (!p) continue;
    const prev = overrides[id];
    const base = prev?.allowedTabs ?? [...new Set(p.roles.flatMap((r) => visibility[r] ?? []))];
    let tables = input.tables ?? base;
    if (input.addTables) tables = [...new Set([...tables, ...input.addTables])];
    if (input.removeTables) tables = tables.filter((t) => !input.removeTables!.includes(t));
    tables = tables.filter((t) => valid.has(t));
    overrides[id] = {
      ...(prev ?? {}),
      userId: id,
      userName: p.name,
      allowedTabs: tables,
      canResolveFeedback: input.canResolveFeedback ?? prev?.canResolveFeedback ?? false,
      canManageData: input.canManageData ?? prev?.canManageData ?? false,
      updatedAt: nowIso(),
    };
    if (input.login?.kind === "shared") delete creds[id];
    if (input.login?.kind === "account") creds[id] = { accountId: input.login.accountId };
    if (input.login?.kind === "own") {
      const old = creds[id];
      const username = input.login.username.trim();
      if (!username) throw new WorkflowError("VALIDATION", "Enter the Noor email.");
      if (!input.login.password && (old?.username !== username || !old?.passwordEnc)) throw new WorkflowError("VALIDATION", "Enter the Noor password.");
      creds[id] = { username, passwordEnc: input.login.password ? await seal(input.login.password) : old!.passwordEnc };
    }
    overrides[id].credential = creds[id]?.accountId ? "account" : creds[id]?.username ? "own" : "shared";
    overrides[id].accountId = creds[id]?.accountId;
    overrides[id].username = creds[id]?.username;
  }
  await write(user, { ...s, userOverrides: overrides, userCredentials: creds });
  forgetCmsSessions();
  await audit({ actor: user }, { action: "configure.legacy_cms_user", summary: `${user.name} changed Noor access for ${ids.length} ${ids.length === 1 ? "person" : "people"}` });
  return ids.length;
}

// Back to the role's tables and the shared login.
export async function resetCmsAccess(user: AppUser, userIds: string[]) {
  needAdmin(user);
  const s = await read();
  const overrides = { ...(s.userOverrides ?? {}) };
  const creds = { ...(s.userCredentials ?? {}) };
  for (const id of userIds) {
    delete overrides[id];
    delete creds[id];
  }
  await write(user, { ...s, userOverrides: overrides, userCredentials: creds });
  forgetCmsSessions();
  await audit({ actor: user }, { action: "configure.legacy_cms_user", summary: `${user.name} reset Noor access for ${userIds.length} ${userIds.length === 1 ? "person" : "people"} to their role` });
}

// No tables at all for these people (their role's tables no longer apply either).
export async function revokeCmsAccess(user: AppUser, userIds: string[]) {
  return grantCmsAccess(user, { userIds, tables: [], canManageData: false, canResolveFeedback: false, login: { kind: "shared" } });
}

export async function setCmsDataPolicy(user: AppUser, policy: "admin" | "granted") {
  needAdmin(user);
  const s = await read();
  await write(user, { ...s, dataPolicy: policy === "granted" ? "granted" : "admin" });
  await audit({ actor: user }, { action: "configure.legacy_cms_data", summary: `${user.name} set who manages the stored Noor data: ${policy === "granted" ? "Admin and the people Admin allows" : "Admin only"}` });
}

export async function clearCmsRangeCache(user: AppUser) {
  needAdmin(user);
  await run("DELETE FROM cms_range_cache");
  await audit({ actor: user }, { action: "configure.legacy_cms_data", summary: `${user.name} cleared the Noor day cache` });
}
