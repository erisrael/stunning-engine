// Where the files live (Phase 16.2) and publishing to the Myseed App (Phase 16.3).
//
// 16.2: Admin lists the company's storage places (a shared Google Drive folder, a NAS path, a cloud bucket) and the
// folder pattern (grade, subject, unit, part). A link on a part outside those places is flagged; a weekly check
// opens every raw, master, captions and thumbnail link and lists the ones that no longer open for the leads; and a
// leaver's links outside the company places are listed for the leaver checklist.
// 16.3: the Uploading card sends the master to the Myseed App through its API (address and key in Admin, Files and
// publishing), records the app's ID, and Publication confirms live when the app says it plays.

import { all, get, nowIso, parseJson, run } from "./db";
import { seal, unseal } from "./secrets";
import { can, isManager, type AppUser } from "./users";
import { audit, WorkflowError, confirmLive, recordUpload, verifyTarget, getItem } from "./workflow";
import { notify } from "./notifications";

export type StorageConfig = { locations: { label: string; prefix: string }[]; pattern: string };
export type AppConfig = { url: string; keyEnc: string | null };

async function cfg<T>(key: string, d: T): Promise<T> {
  return { ...d, ...parseJson<Partial<T>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key))?.value, {}) };
}
async function put(user: AppUser, key: string, value: unknown) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    key,
    JSON.stringify(value),
    nowIso(),
    user.id,
  );
}
const needAdmin = (u: AppUser) => {
  if (!can(u, "users.manage") && !can(u, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets this.");
};

export const storageConfig = () => cfg<StorageConfig>("cfg.storage", { locations: [], pattern: "{grade}/{subject}/{unit}/{code}" });
export async function saveStorageConfig(user: AppUser, input: StorageConfig) {
  needAdmin(user);
  const locations = (input.locations ?? [])
    .map((l) => ({ label: String(l.label ?? "").trim().slice(0, 60), prefix: String(l.prefix ?? "").trim().slice(0, 300) }))
    .filter((l) => l.prefix)
    .slice(0, 20);
  await put(user, "cfg.storage", { locations, pattern: String(input.pattern ?? "").trim().slice(0, 200) || "{grade}/{subject}/{unit}/{code}" });
  await audit({ actor: user }, { action: "settings.storage", summary: `${user.name} changed the company's file places (${locations.length})` });
}

// Inside one of the company's places (no places set: everything counts as inside).
export function insidePlaces(url: string | null | undefined, c: StorageConfig) {
  if (!url || !c.locations.length) return true;
  const u = url.trim().toLowerCase();
  return c.locations.some((l) => u.startsWith(l.prefix.toLowerCase()));
}

// The folder a part's files should go in.
export async function folderFor(itemId: string) {
  const c = await storageConfig();
  const r = await get<{ code: string; grade: string | null; subject: string | null; unit: string | null }>(
    "SELECT i.code, g.name AS grade, s.name AS subject, u.title AS unit FROM items i LEFT JOIN lessons l ON l.id = i.lesson_id LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN grades g ON g.id = u.grade_id LEFT JOIN subjects s ON s.id = u.subject_id WHERE i.id = ?",
    itemId,
  ).catch(() => null);
  if (!r) return null;
  return c.pattern.replace("{grade}", r.grade ?? "-").replace("{subject}", r.subject ?? "-").replace("{unit}", r.unit ?? "-").replace("{code}", r.code).replace("{part}", r.code);
}

// Links on current files that are outside the company's places (for a part, or everyone's).
export async function linksOutside(opts: { itemId?: string; userId?: string } = {}) {
  const c = await storageConfig();
  if (!c.locations.length) return [];
  const where = ["a.status = 'current'", "a.url IS NOT NULL"];
  const p: string[] = [];
  if (opts.itemId) (where.push("a.item_id = ?"), p.push(opts.itemId));
  if (opts.userId) (where.push("a.created_by = ?"), p.push(opts.userId));
  const rows = await all<{ id: string; item_id: string; code: string; kind: string; url: string }>(`SELECT a.id, a.item_id, i.code, a.kind, a.url FROM assets a JOIN items i ON i.id = a.item_id WHERE ${where.join(" AND ")} LIMIT 2000`, ...p);
  return rows.filter((r) => !insidePlaces(r.url, c));
}

// Weekly: does every raw, master, captions and thumbnail link still open? Results are kept; leads hear of broken ones.
type Fetcher = (url: string) => Promise<number>;
const defaultFetch: Fetcher = async (url) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    let r = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctl.signal });
    if (r.status === 405 || r.status === 403) r = await fetch(url, { method: "GET", redirect: "follow", signal: ctl.signal });
    return r.status;
  } catch {
    return 0;
  } finally {
    clearTimeout(t);
  }
};
export async function checkLinks(fetcher: Fetcher = defaultFetch, limit = 400) {
  const rows = await all<{ id: string; item_id: string; code: string; kind: string; url: string }>(
    "SELECT a.id, a.item_id, i.code, a.kind, a.url FROM assets a JOIN items i ON i.id = a.item_id WHERE a.status = 'current' AND a.url LIKE 'http%' AND a.kind IN ('raw','master','captions','thumbnail') ORDER BY a.created_at DESC LIMIT ?",
    String(limit),
  );
  const broken: typeof rows = [];
  for (const r of rows) {
    const status = await fetcher(r.url);
    const ok = status >= 200 && status < 400;
    await run("INSERT INTO link_checks (asset_id, url, status, ok, checked_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (asset_id) DO UPDATE SET url = excluded.url, status = excluded.status, ok = excluded.ok, checked_at = excluded.checked_at", r.id, r.url, status, ok ? 1 : 0, nowIso());
    if (!ok) broken.push(r);
  }
  if (broken.length) {
    const leads = (await all<{ user_id: string }>("SELECT DISTINCT user_id FROM team_leads")).map((r) => r.user_id);
    await notify(leads, { type: "failure", title: `${broken.length} file link${broken.length === 1 ? "" : "s"} no longer open`, body: broken.slice(0, 5).map((b) => `${b.code} ${b.kind}`).join(", "), link: "/admin?tab=files", dedupeKey: `links:${nowIso().slice(0, 10)}` }, nowIso());
  }
  return { checked: rows.length, broken: broken.length };
}

export async function brokenLinks() {
  return await all<{ asset_id: string; url: string; status: number; checked_at: string; code: string; kind: string }>(
    "SELECT c.asset_id, c.url, c.status, c.checked_at, i.code, a.kind FROM link_checks c JOIN assets a ON a.id = c.asset_id JOIN items i ON i.id = a.item_id WHERE c.ok = 0 AND a.status = 'current' ORDER BY c.checked_at DESC LIMIT 200",
  );
}

// Weekly by the scheduled checks.
export async function weeklyLinkCheck() {
  const last = await get<{ v: string | null }>("SELECT MAX(checked_at) AS v FROM link_checks");
  if (last?.v && Date.now() - Date.parse(last.v) < 6.5 * 864e5) return { skipped: true };
  return await checkLinks();
}

// ---------------------------------------------------------------------------
// The Myseed App
// ---------------------------------------------------------------------------

export const appConfig = () => cfg<AppConfig>("cfg.myseedApp", { url: "", keyEnc: null });
export async function appConfigView() {
  const c = await appConfig();
  return { url: c.url, hasKey: !!c.keyEnc };
}
export async function saveAppConfig(user: AppUser, input: { url: string; key?: string | null; clearKey?: boolean }) {
  needAdmin(user);
  const url = String(input.url ?? "").trim().replace(/\/+$/, "");
  if (url && !/^https?:\/\//.test(url)) throw new WorkflowError("VALIDATION", "The address starts with https://.");
  const cur = await appConfig();
  await put(user, "cfg.myseedApp", { url, keyEnc: input.clearKey ? null : input.key?.trim() ? await seal(input.key.trim()) : cur.keyEnc });
  await audit({ actor: user }, { action: "settings.myseed_app", summary: `${user.name} set the Myseed App connection` });
}

async function appCall(path: string, init: RequestInit) {
  const c = await appConfig();
  if (!c.url) throw new WorkflowError("INVALID_STATE", "The Myseed App is not connected (Admin, Files and publishing).");
  const key = c.keyEnc ? await unseal(c.keyEnc) : null;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(`${c.url}${path}`, { ...init, signal: ctl.signal, headers: { "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(init.headers ?? {}) } });
    const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok) throw new WorkflowError("INVALID_STATE", `The Myseed App answered ${r.status}${body.error ? `: ${String(body.error)}` : ""}.`);
    return body;
  } catch (e) {
    if (e instanceof WorkflowError) throw e;
    throw new WorkflowError("INVALID_STATE", "The Myseed App could not be reached.");
  } finally {
    clearTimeout(t);
  }
}

// Uploading: send the approved master with the part's details; the app's ID is recorded as the upload.
export async function publishToApp(user: AppUser, itemId: string) {
  // The same people who record uploads by hand (Uploading and managers); the upload itself checks the stage too.
  if (!user.roles.includes("uploading" as never) && !isManager(user)) throw new WorkflowError("FORBIDDEN", "Only Uploading records uploads.");
  const item = await getItem(itemId);
  const master = await get<{ id: string; url: string | null }>("SELECT id, url FROM assets WHERE item_id = ? AND kind = 'master' AND status = 'current' ORDER BY version_no DESC LIMIT 1", itemId);
  if (!master?.url) throw new WorkflowError("REQUIREMENTS_MISSING", "There is no approved master with a link to send.");
  const meta = await get<{ grade: string | null; subject: string | null; unit: string | null }>(
    "SELECT g.name AS grade, s.name AS subject, u.title AS unit FROM items i LEFT JOIN lessons l ON l.id = i.lesson_id LEFT JOIN units u ON u.id = l.unit_id LEFT JOIN grades g ON g.id = u.grade_id LEFT JOIN subjects s ON s.id = u.subject_id WHERE i.id = ?",
    itemId,
  ).catch(() => null);
  const res = await appCall("/videos", { method: "POST", body: JSON.stringify({ code: item.code, title: item.title, titleAm: item.title_am ?? null, grade: meta?.grade ?? null, subject: meta?.subject ?? null, unit: meta?.unit ?? null, teacher: item.teacher ?? null, videoUrl: master.url }) });
  const id = String(res.id ?? "");
  if (!id) throw new WorkflowError("INVALID_STATE", "The Myseed App did not give an ID back.");
  await recordUpload({ actor: user }, itemId, { platform: "myseed_app", status: res.status === "ready" ? "uploaded" : "processing", externalId: id, uploadUrl: typeof res.url === "string" ? res.url : null });
  return { id, status: String(res.status ?? "processing") };
}

// Uploading or Publication: ask the app whether it plays; when ready, the upload is complete and checked; when live,
// Publication's "live" is recorded with the app's link.
export async function checkApp(user: AppUser, itemId: string) {
  const t = await get<{ external_id: string | null; upload_status: string }>("SELECT external_id, upload_status FROM publication_targets WHERE item_id = ? AND platform = 'myseed_app'", itemId);
  if (!t?.external_id) throw new WorkflowError("INVALID_STATE", "Send it to the Myseed App first.");
  const res = await appCall(`/videos/${encodeURIComponent(t.external_id)}`, { method: "GET" });
  const status = String(res.status ?? "");
  if ((status === "ready" || status === "live") && t.upload_status !== "uploaded") await recordUpload({ actor: user }, itemId, { platform: "myseed_app", status: "uploaded", externalId: t.external_id, uploadUrl: typeof res.url === "string" ? res.url : null });
  if (res.playable === true) await verifyTarget({ actor: user }, itemId, { platform: "myseed_app", playback: true, metadata: true }).catch(() => {});
  if (status === "live" && typeof res.url === "string") await confirmLive({ actor: user }, itemId, { platform: "myseed_app", liveUrl: res.url }).catch(() => {});
  return { status, playable: res.playable === true, url: typeof res.url === "string" ? res.url : null };
}
