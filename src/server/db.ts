import { AsyncLocalStorage } from "node:async_hooks";
import crypto from "node:crypto";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

/*
 * Database access. Production uses PostgreSQL through DATABASE_URL (for example Supabase).
 * Without DATABASE_URL an embedded PostgreSQL (PGlite) stores data in ./data/pg, so local
 * development needs no database server and runs exactly the same SQL.
 *
 * Queries use "?" placeholders; they are converted to $1, $2 ... before execution.
 */

export type Param = string | number | null | boolean | undefined;
type Row = Record<string, unknown>;

interface Executor {
  query(sql: string, params: unknown[]): Promise<{ rows: Row[]; affected: number }>;
}

interface Driver extends Executor {
  kind: "postgres" | "pglite";
  exec(sql: string): Promise<void>;
  transaction<T>(fn: (ex: Executor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const INT8 = 20;
const NUMERIC = 1700;

async function createPostgres(url: string): Promise<Driver> {
  const postgres = (await import("postgres")).default;
  const sql = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    connect_timeout: 15,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require",
    types: {
      bigint: { to: INT8, from: [INT8], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      numeric: { to: NUMERIC, from: [NUMERIC], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
    onnotice: () => {},
  });
  const run = async (ex: typeof sql, text: string, params: unknown[]) => {
    const res = await ex.unsafe(text, params as never[]);
    return { rows: res as unknown as Row[], affected: res.count ?? 0 };
  };
  return {
    kind: "postgres",
    query: (text, params) => run(sql, text, params),
    exec: async (text) => {
      await sql.unsafe(text);
    },
    transaction: (fn) =>
      sql.begin(async (tx) => fn({ query: (text, params) => run(tx as unknown as typeof sql, text, params) })) as Promise<never>,
    close: () => sql.end({ timeout: 5 }),
  };
}

async function createPglite(dir: string): Promise<Driver> {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = await PGlite.create(dir, {
    parsers: { [INT8]: (x: string) => Number(x), [NUMERIC]: (x: string) => Number(x) },
  });
  const run = async (ex: Pick<typeof pg, "query">, text: string, params: unknown[]) => {
    const res = await ex.query<Row>(text, params);
    return { rows: res.rows, affected: res.affectedRows ?? 0 };
  };
  return {
    kind: "pglite",
    query: (text, params) => run(pg, text, params),
    exec: async (text) => {
      await pg.exec(text);
    },
    transaction: (fn) => pg.transaction((tx) => fn({ query: (text, params) => run(tx, text, params) })),
    close: () => pg.close(),
  };
}

const globalForDb = globalThis as unknown as { __myseedDb?: Promise<Driver> };
const txStore = new AsyncLocalStorage<Executor>();

export function databaseLabel() {
  return process.env.DATABASE_URL ? "PostgreSQL (DATABASE_URL)" : `Embedded PostgreSQL at ${pgliteDir()}`;
}

export function pgliteDir() {
  return process.env.PGLITE_DIR ?? path.join(process.cwd(), "data", "pg");
}

async function open(): Promise<Driver> {
  const url = process.env.DATABASE_URL;
  // Serverless hosts have no persistent disk, so the embedded database would lose data on every deploy.
  if (!url && (process.env.NETLIFY || process.env.VERCEL))
    throw new Error("DATABASE_URL is not set. Add your Supabase connection string in the hosting environment variables (see docs/RUNBOOK.md).");
  const driver = url ? await createPostgres(url) : await createPglite(pgliteDir());
  await driver.exec(SCHEMA_SQL);
  await driver.query(
    "INSERT INTO settings (key, value, updated_at) VALUES ('schema_version', $1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
    [JSON.stringify(SCHEMA_VERSION), new Date().toISOString()],
  );
  return driver;
}

export function driver(): Promise<Driver> {
  if (!globalForDb.__myseedDb) {
    globalForDb.__myseedDb = open().catch((err) => {
      globalForDb.__myseedDb = undefined;
      throw err;
    });
  }
  return globalForDb.__myseedDb;
}

export async function closeDb() {
  const d = globalForDb.__myseedDb;
  globalForDb.__myseedDb = undefined;
  if (d) await (await d).close();
}

// SQLite-era phrasing kept in a few statements is rewritten once per distinct statement.
const sqlCache = new Map<string, string>();
function translate(sql: string): string {
  const hit = sqlCache.get(sql);
  if (hit) return hit;
  let s = sql;
  if (/^\s*INSERT OR IGNORE INTO/i.test(s)) s = s.replace(/INSERT OR IGNORE INTO/i, "INSERT INTO") + " ON CONFLICT DO NOTHING";
  s = s.replace(/([\w.]+)\s*=\s*\?\s+COLLATE NOCASE/gi, "lower($1) = lower(?)");
  let n = 0;
  let out = "";
  let quote = false;
  for (const ch of s) {
    if (ch === "'") quote = !quote;
    out += !quote && ch === "?" ? `$${++n}` : ch;
  }
  sqlCache.set(sql, out);
  return out;
}

function norm(params: Param[]): unknown[] {
  return params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : p));
}

async function executor(): Promise<Executor> {
  return txStore.getStore() ?? (await driver());
}

export async function all<T = Row>(sql: string, ...params: Param[]): Promise<T[]> {
  const ex = await executor();
  return (await ex.query(translate(sql), norm(params))).rows as T[];
}

export async function get<T = Row>(sql: string, ...params: Param[]): Promise<T | undefined> {
  const rows = await all<T>(sql, ...params);
  return rows[0];
}

export async function run(sql: string, ...params: Param[]): Promise<{ changes: number }> {
  const ex = await executor();
  const res = await ex.query(translate(sql), norm(params));
  return { changes: res.affected };
}

export async function scalar<T = number>(sql: string, ...params: Param[]): Promise<T> {
  const row = await get<Row>(sql, ...params);
  return (row ? Object.values(row)[0] : null) as T;
}

// Nested calls join the outer transaction so workflow helpers compose atomically.
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  if (txStore.getStore()) return fn();
  const d = await driver();
  return d.transaction((ex) => txStore.run(ex, fn));
}

export async function execRaw(sql: string) {
  await (await driver()).exec(sql);
}

export function uid(prefix = "") {
  return prefix + crypto.randomUUID().replace(/-/g, "").slice(0, 20);
}

export function nowIso() {
  return new Date().toISOString();
}

export function placeholders(n: number) {
  return Array.from({ length: n }, () => "?").join(",");
}

export function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || !value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
