// Automatic backups (Admin, System): a daily copy of the whole workspace (every table, and the files kept in the
// database) to the server's disk, Google Drive (the Admin's own Drive, only a "Myseed backups" folder the app
// made) and, when set up, any S3-compatible storage. Old copies are thinned to 7 daily, 4 weekly and 12 monthly
// (configurable). Once a month a copy is restored into a throwaway database to prove it can be restored.

import fs from "node:fs";
import path from "node:path";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { getSettings } from "./settings";
import { backupSnapshot } from "./workspace-data";
import { accessToken, googleConnection, GOOGLE_SCOPES } from "./google";
import { alertAdmins } from "./ops";
import { decodeBackup, encodeBackup } from "./backup-codec";
import { s3Delete, s3Get, s3List, s3Put, type S3Target } from "./s3";
import { SCHEMA_SQL, TABLES } from "./schema";
import { backupName, backupsToKeep, backupTime, DEFAULT_KEEP, isBackupName, type Keep } from "@/lib/backup-retention";

export type TargetId = "local" | "drive" | "s3";
export const TARGET_LABELS: Record<TargetId, string> = { local: "This server's disk", drive: "Google Drive", s3: "S3-compatible storage" };

export type BackupConfig = {
  enabled: boolean;
  hour: number;
  keep: Keep;
  testRestoreDays: number;
  encrypt: boolean;
  hasPassphrase: boolean;
  local: { enabled: boolean; dir: string };
  drive: { enabled: boolean; userId: string | null; email: string | null; folderId: string | null };
  s3: { enabled: boolean; endpoint: string; region: string; bucket: string; prefix: string; accessKeyId: string; hasSecret: boolean };
};
type Stored = BackupConfig & { passphraseEnc?: string; s3SecretEnc?: string };

export const defaultBackupDir = () => process.env.BACKUP_DIR || path.join(process.cwd(), "backups");

const DEFAULTS: BackupConfig = {
  enabled: true,
  hour: 2,
  keep: DEFAULT_KEEP,
  testRestoreDays: 30,
  encrypt: false,
  hasPassphrase: false,
  local: { enabled: true, dir: "" },
  drive: { enabled: false, userId: null, email: null, folderId: null },
  s3: { enabled: false, endpoint: "", region: "auto", bucket: "", prefix: "myseed/", accessKeyId: "", hasSecret: false },
};

async function load(): Promise<Stored> {
  const s = parseJson<Partial<Stored> | null>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.backup'"))?.value, null) ?? {};
  return {
    ...DEFAULTS,
    ...s,
    keep: { ...DEFAULTS.keep, ...(s.keep ?? {}) },
    local: { ...DEFAULTS.local, ...(s.local ?? {}) },
    drive: { ...DEFAULTS.drive, ...(s.drive ?? {}) },
    s3: { ...DEFAULTS.s3, ...(s.s3 ?? {}), hasSecret: !!s.s3SecretEnc },
    hasPassphrase: !!s.passphraseEnc,
  };
}

async function store(v: Stored, userId?: string) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.backup', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(v),
    nowIso(),
    userId ?? null,
  );
}

export async function backupConfig(): Promise<BackupConfig> {
  const { passphraseEnc: _p, s3SecretEnc: _s, ...rest } = await load();
  void _p;
  void _s;
  return rest;
}

const clamp = (n: unknown, lo: number, hi: number, d: number) => (typeof n === "number" && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : d);

export async function saveBackupConfig(user: AppUser, input: BackupConfig & { passphrase?: string | null; s3Secret?: string | null }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sets up backups.");
  const old = await load();
  const dir = input.local.dir.trim();
  if (dir && !path.isAbsolute(dir)) throw new WorkflowError("VALIDATION", "The backup folder must be a full path, for example /var/backups/myseed or D:\\Backups.");
  let drive = { ...old.drive, enabled: !!input.drive.enabled };
  if (drive.enabled && drive.userId !== user.id && !old.drive.userId) {
    const conn = await googleConnection(user.id);
    if (!conn?.scopes.includes(GOOGLE_SCOPES.drive)) throw new WorkflowError("NOT_CONNECTED", "Connect your Google Drive first (the Connect Google Drive button), then turn it on.");
    drive = { enabled: true, userId: user.id, email: conn.email, folderId: null };
  }
  if (!drive.enabled) drive = { enabled: false, userId: old.drive.userId, email: old.drive.email, folderId: old.drive.folderId };
  const s3 = { ...input.s3, endpoint: input.s3.endpoint.trim().replace(/\/+$/, ""), bucket: input.s3.bucket.trim(), prefix: input.s3.prefix.trim().replace(/^\/+/, ""), accessKeyId: input.s3.accessKeyId.trim(), region: input.s3.region.trim() || "auto", hasSecret: false };
  const s3SecretEnc = input.s3Secret === null ? undefined : input.s3Secret?.trim() ? await seal(input.s3Secret.trim()) : old.s3SecretEnc;
  if (s3.enabled) {
    if (!/^https?:\/\/[^\s/]+/.test(s3.endpoint)) throw new WorkflowError("VALIDATION", "Enter the storage endpoint, for example https://<account>.r2.cloudflarestorage.com.");
    if (!s3.bucket || !s3.accessKeyId || !s3SecretEnc) throw new WorkflowError("VALIDATION", "S3 storage needs the bucket, access key ID and secret key.");
  }
  const passphraseEnc = input.passphrase === null ? undefined : input.passphrase?.trim() ? await seal(input.passphrase) : old.passphraseEnc;
  if (input.passphrase?.trim() && input.passphrase.length < 12) throw new WorkflowError("VALIDATION", "Use a passphrase of at least 12 characters.");
  if (input.encrypt && !passphraseEnc) throw new WorkflowError("VALIDATION", "Set a passphrase to encrypt backups.");
  const v: Stored = {
    enabled: !!input.enabled,
    hour: clamp(input.hour, 0, 23, 2),
    keep: { daily: clamp(input.keep.daily, 1, 60, 7), weekly: clamp(input.keep.weekly, 0, 52, 4), monthly: clamp(input.keep.monthly, 0, 120, 12) },
    testRestoreDays: clamp(input.testRestoreDays, 0, 365, 30),
    encrypt: !!input.encrypt,
    hasPassphrase: false,
    local: { enabled: !!input.local.enabled, dir },
    drive,
    s3,
    passphraseEnc,
    s3SecretEnc,
  };
  if (v.enabled && !v.local.enabled && !v.drive.enabled && !v.s3.enabled) throw new WorkflowError("VALIDATION", "Choose at least one place to keep backups.");
  await store(v, user.id);
  await audit({ actor: user }, { action: "settings.backup", summary: `${user.name} changed backups` });
}

// ---------------------------------------------------------------------------
// Where backups go
// ---------------------------------------------------------------------------

type Listed = { name: string; size: number; ref: string };
type Target = { id: TargetId; put(name: string, body: Buffer): Promise<void>; list(): Promise<Listed[]>; get(ref: string): Promise<Buffer>; del(ref: string): Promise<void> };

function localTarget(c: Stored): Target {
  const dir = c.local.dir || defaultBackupDir();
  const safe = (name: string) => {
    if (!isBackupName(name)) throw new Error("Not a backup file.");
    return path.join(dir, name);
  };
  return {
    id: "local",
    async put(name, body) {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, `${name}.part`), body);
      fs.renameSync(path.join(dir, `${name}.part`), path.join(dir, name));
    },
    async list() {
      if (!fs.existsSync(dir)) return [];
      return fs
        .readdirSync(dir)
        .filter(isBackupName)
        .map((name) => ({ name, size: fs.statSync(path.join(dir, name)).size, ref: name }));
    },
    async get(ref) {
      return fs.readFileSync(safe(ref));
    },
    async del(ref) {
      fs.rmSync(safe(ref), { force: true });
    },
  };
}

const DRIVE = "https://www.googleapis.com/drive/v3/files";

async function driveFetch(userId: string, url: string, init: RequestInit = {}) {
  const token = await accessToken(userId, "drive");
  const res = await fetch(url, { ...init, headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10 * 60e3) });
  if (!res.ok) throw new Error(`Google Drive answered ${res.status}: ${(await res.text().catch(() => "")).slice(0, 160)}`);
  return res;
}

function driveTarget(c: Stored): Target {
  const userId = c.drive.userId!;
  const folder = async () => {
    if (c.drive.folderId) return c.drive.folderId;
    const q = encodeURIComponent("name = 'Myseed backups' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
    const found = (await (await driveFetch(userId, `${DRIVE}?q=${q}&fields=files(id)`)).json()) as { files: { id: string }[] };
    const id =
      found.files[0]?.id ??
      ((await (await driveFetch(userId, DRIVE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Myseed backups", mimeType: "application/vnd.google-apps.folder" }) })).json()) as { id: string }).id;
    c.drive.folderId = id;
    const cur = await load();
    await store({ ...cur, drive: { ...cur.drive, folderId: id } });
    return id;
  };
  return {
    id: "drive",
    async put(name, body) {
      // A resumable upload: one request for the details, one for the file (no 5 MB limit).
      const start = await driveFetch(userId, "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable", {
        method: "POST",
        headers: { "content-type": "application/json", "x-upload-content-type": "application/octet-stream", "x-upload-content-length": String(body.length) },
        body: JSON.stringify({ name, parents: [await folder()] }),
      });
      const loc = start.headers.get("location");
      if (!loc) throw new Error("Google Drive did not start the upload.");
      const up = await fetch(loc, { method: "PUT", headers: { "content-type": "application/octet-stream" }, body: new Uint8Array(body), signal: AbortSignal.timeout(10 * 60e3) });
      if (!up.ok) throw new Error(`Google Drive upload failed (${up.status}).`);
    },
    async list() {
      const q = encodeURIComponent(`'${await folder()}' in parents and trashed = false`);
      const r = (await (await driveFetch(userId, `${DRIVE}?q=${q}&fields=files(id,name,size)&pageSize=1000`)).json()) as { files: { id: string; name: string; size?: string }[] };
      return r.files.filter((f) => isBackupName(f.name)).map((f) => ({ name: f.name, size: Number(f.size ?? 0), ref: f.id }));
    },
    async get(ref) {
      return Buffer.from(await (await driveFetch(userId, `${DRIVE}/${encodeURIComponent(ref)}?alt=media`)).arrayBuffer());
    },
    async del(ref) {
      await driveFetch(userId, `${DRIVE}/${encodeURIComponent(ref)}`, { method: "DELETE" });
    },
  };
}

async function s3Target(c: Stored): Promise<Target> {
  const secret = c.s3SecretEnc ? await unseal(c.s3SecretEnc) : null;
  if (!secret) throw new Error("The S3 secret key is missing; enter it again.");
  const t: S3Target = { endpoint: c.s3.endpoint, region: c.s3.region, bucket: c.s3.bucket, accessKeyId: c.s3.accessKeyId, secret };
  const prefix = c.s3.prefix;
  return {
    id: "s3",
    put: (name, body) => s3Put(t, `${prefix}${name}`, body),
    async list() {
      return (await s3List(t, prefix)).map((o) => ({ name: o.key.slice(prefix.length), size: o.size, ref: o.key })).filter((o) => isBackupName(o.name));
    },
    get: (ref) => s3Get(t, ref),
    del: (ref) => s3Delete(t, ref),
  };
}

async function targets(c: Stored, only?: TargetId): Promise<Target[]> {
  const out: Target[] = [];
  if (c.local.enabled && (!only || only === "local")) out.push(localTarget(c));
  if (c.drive.enabled && c.drive.userId && (!only || only === "drive")) out.push(driveTarget(c));
  if (c.s3.enabled && (!only || only === "s3")) out.push(await s3Target(c));
  return out;
}

// ---------------------------------------------------------------------------
// Making, thinning, listing and checking backups
// ---------------------------------------------------------------------------

export type BackupResult = { ok: boolean; name: string; size: number; rows: number; results: Partial<Record<TargetId, string>> };

export async function runBackup(user?: AppUser): Promise<BackupResult> {
  if (user && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin makes backups.");
  const c = await load();
  const id = uid("bkp_");
  const started = nowIso();
  await run("INSERT INTO backup_runs (id, kind, started_at, by_user) VALUES (?, 'backup', ?, ?)", id, started, user?.id ?? null);
  const results: Partial<Record<TargetId, string>> = {};
  let name = "";
  let size = 0;
  let rows = 0;
  try {
    const list = await targets(c);
    if (!list.length) throw new Error("No place to keep backups is switched on.");
    const snapshot = await backupSnapshot();
    rows = Object.values(snapshot.tables).reduce((n, r) => n + r.length, 0);
    const passphrase = c.encrypt && c.passphraseEnc ? await unseal(c.passphraseEnc) : null;
    if (c.encrypt && !passphrase) throw new Error("The backup passphrase could not be read; set it again.");
    const body = encodeBackup(snapshot, passphrase);
    size = body.length;
    name = backupName(new Date(started), !!passphrase);
    for (const t of list) {
      try {
        await t.put(name, body);
        // Thinning only after a new copy is safely there.
        const existing = await t.list();
        const keep = backupsToKeep(existing.map((e) => e.name), c.keep);
        let removed = 0;
        for (const e of existing) if (!keep.has(e.name)) (await t.del(e.ref), removed++);
        results[t.id] = `saved${removed ? `, ${removed} old removed` : ""}`;
      } catch (e) {
        results[t.id] = `failed: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const failed = Object.entries(results).filter(([, r]) => r!.startsWith("failed"));
    const ok = failed.length === 0;
    await run(
      "UPDATE backup_runs SET finished_at = ?, ok = ?, file = ?, size = ?, rows = ?, targets = ?, detail = ? WHERE id = ?",
      nowIso(),
      ok ? 1 : 0,
      name,
      size,
      rows,
      JSON.stringify(results),
      ok ? null : failed.map(([k, r]) => `${TARGET_LABELS[k as TargetId]} ${r}`).join("; "),
      id,
    );
    if (!ok) await alertAdmins("Backup partly failed", failed.map(([k, r]) => `${TARGET_LABELS[k as TargetId]}: ${r}`).join("\n"), "/admin?tab=system", "backup");
    if (user) await audit({ actor: user }, { action: "backup.made", summary: `${user.name} made a backup (${name})` });
    return { ok, name, size, rows, results };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await run("UPDATE backup_runs SET finished_at = ?, ok = 0, detail = ?, targets = ? WHERE id = ?", nowIso(), msg.slice(0, 500), JSON.stringify(results), id);
    await alertAdmins("Backup failed", msg, "/admin?tab=system", "backup");
    return { ok: false, name, size, rows, results };
  }
}

function localHour(tz: string, at: Date) {
  return Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(at));
}

// Called by the scheduled jobs every 10 minutes: the daily backup once its hour has come (or when the last good
// one is over a day and a half old), then the test restore when one is due.
export async function scheduledBackup(now = nowIso()) {
  const c = await load();
  if (!c.enabled) return "off";
  const last = await get<{ started_at: string }>("SELECT started_at FROM backup_runs WHERE kind = 'backup' AND ok = 1 ORDER BY started_at DESC LIMIT 1");
  const lastTry = await get<{ started_at: string }>("SELECT started_at FROM backup_runs WHERE kind = 'backup' ORDER BY started_at DESC LIMIT 1");
  const age = last ? Date.parse(now) - Date.parse(last.started_at) : Infinity;
  // After a failure, wait an hour before trying again.
  const retryOk = !lastTry || Date.parse(now) - Date.parse(lastTry.started_at) > 3600e3;
  const tz = (await getSettings()).workspace.timezone;
  if (retryOk && (age > 36 * 3600e3 || (age > 20 * 3600e3 && localHour(tz, new Date(now)) >= c.hour))) {
    const r = await runBackup();
    return r.ok ? `backup ${r.name}` : "backup failed";
  }
  if (c.testRestoreDays) {
    const lastTest = await get<{ started_at: string }>("SELECT started_at FROM backup_runs WHERE kind = 'test' ORDER BY started_at DESC LIMIT 1");
    if (last && (!lastTest || Date.parse(now) - Date.parse(lastTest.started_at) > c.testRestoreDays * 864e5)) {
      const r = await testRestore();
      return r.ok ? "test restore passed" : "test restore failed";
    }
  }
  return "nothing due";
}

export type BackupFile = { target: TargetId; name: string; size: number; ref: string; at: string | null };

export async function listBackups(user: AppUser): Promise<{ files: BackupFile[]; errors: Partial<Record<TargetId, string>> }> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees backups.");
  const c = await load();
  const files: BackupFile[] = [];
  const errors: Partial<Record<TargetId, string>> = {};
  for (const id of ["local", "drive", "s3"] as TargetId[]) {
    try {
      for (const t of await targets(c, id)) for (const f of await t.list()) files.push({ target: id, name: f.name, size: f.size, ref: f.ref, at: backupTime(f.name)?.toISOString() ?? null });
    } catch (e) {
      errors[id] = e instanceof Error ? e.message : String(e);
    }
  }
  files.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return { files, errors };
}

export async function readBackup(user: AppUser | null, target: TargetId, ref: string) {
  if (user && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin downloads backups.");
  const [t] = await targets(await load(), target);
  if (!t) throw new WorkflowError("NOT_FOUND", "That place is not switched on.");
  return t.get(ref);
}

export type BackupRun = { id: string; kind: string; startedAt: string; finishedAt: string | null; ok: boolean; file: string | null; size: number; rows: number; targets: Partial<Record<TargetId, string>>; detail: string | null; by: string | null };

export async function backupRuns(user: AppUser): Promise<BackupRun[]> {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin sees backups.");
  const rows = await all<{ id: string; kind: string; started_at: string; finished_at: string | null; ok: number; file: string | null; size: number | null; rows: number | null; targets: string; detail: string | null; name: string | null }>(
    "SELECT r.*, u.name FROM backup_runs r LEFT JOIN users u ON u.id = r.by_user ORDER BY r.started_at DESC LIMIT 60",
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, startedAt: r.started_at, finishedAt: r.finished_at, ok: !!r.ok, file: r.file, size: Number(r.size ?? 0), rows: Number(r.rows ?? 0), targets: parseJson(r.targets, {}), detail: r.detail, by: r.name }));
}

// Restores the newest backup into a throwaway in-memory database and compares every table's row count with the
// backup. Nothing in the real database is touched.
export async function testRestore(user?: AppUser): Promise<{ ok: boolean; detail: string }> {
  if (user && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin tests backups.");
  const id = uid("bkp_");
  await run("INSERT INTO backup_runs (id, kind, started_at, by_user) VALUES (?, 'test', ?, ?)", id, nowIso(), user?.id ?? null);
  const c = await load();
  let detail = "";
  let ok = false;
  let file: string | null = null;
  try {
    let picked: { t: Target; f: Listed } | null = null;
    for (const t of await targets(c)) {
      const newest = (await t.list().catch(() => [])).sort((a, b) => b.name.localeCompare(a.name))[0];
      if (newest && (!picked || newest.name > picked.f.name)) picked = { t, f: newest };
    }
    if (!picked) throw new Error("There is no backup to test yet.");
    file = picked.f.name;
    const snapshot = decodeBackup(await picked.t.get(picked.f.ref), c.passphraseEnc ? await unseal(c.passphraseEnc) : null);
    const { PGlite } = await import("@electric-sql/pglite");
    const pg = await PGlite.create();
    const t0 = Date.now();
    try {
      await pg.exec(SCHEMA_SQL);
      const wrong: string[] = [];
      let total = 0;
      for (const table of TABLES) {
        const rows = snapshot.tables[table] ?? [];
        if (!rows.length) continue;
        const cols = Object.keys(rows[0]!);
        const per = Math.max(1, Math.floor(20000 / cols.length));
        for (let i = 0; i < rows.length; i += per) {
          const chunk = rows.slice(i, i + per);
          const params: unknown[] = [];
          const values = chunk.map((r) => `(${cols.map((col) => (params.push(r[col] ?? null), `$${params.length}`)).join(", ")})`).join(", ");
          await pg.query(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${values}`, params);
        }
        const n = Number((await pg.query<{ c: number }>(`SELECT COUNT(*)::int AS c FROM ${table}`)).rows[0]?.c ?? 0);
        if (n !== rows.length) wrong.push(`${table} ${n} of ${rows.length}`);
        total += rows.length;
      }
      ok = wrong.length === 0;
      detail = ok ? `${file} restored: ${total} rows in ${Object.keys(snapshot.tables).length} tables match, in ${Math.round((Date.now() - t0) / 1000)} s (from ${TARGET_LABELS[picked.t.id]})` : `${file}: counts differ: ${wrong.join(", ")}`;
    } finally {
      await pg.close();
    }
  } catch (e) {
    detail = `${file ? `${file}: ` : ""}${e instanceof Error ? e.message : String(e)}`;
  }
  await run("UPDATE backup_runs SET finished_at = ?, ok = ?, file = ?, detail = ? WHERE id = ?", nowIso(), ok ? 1 : 0, file, detail.slice(0, 500), id);
  if (!ok) await alertAdmins("Backup test restore failed", detail, "/admin?tab=system", "backup");
  return { ok, detail };
}
