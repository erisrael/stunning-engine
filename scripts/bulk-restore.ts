/*
 * Restores a Myseed backup (from `npm run backup`) using batched multi-row inserts.
 * Unlike `npm run db:restore`, which inserts row by row, this finishes in seconds even
 * over a distant database connection:
 *
 *   DATABASE_URL="<session pooler string>" npm run db:bulk-restore -- backups/file.json
 *
 * Without DATABASE_URL it restores into the embedded database in data/pg.
 */
import fs from "node:fs";
import { closeDb, databaseLabel, placeholders, run, tx } from "../src/server/db";
import { TABLES } from "../src/server/schema";
import { emptyWorkspace } from "../src/server/workspace-data";

// Keep statement parameters under the 65535 protocol limit with headroom.
const MAX_PARAMS = 5000;

function insertChunk(table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const valuesSql = Array.from({ length: rows.length }, () => `(${placeholders(cols.length)})`).join(", ");
  const params = rows.flatMap((row) => cols.map((c) => (row[c] === undefined ? null : (row[c] as string | number | boolean | null))));
  return run(`INSERT INTO ${table} (${cols.join(", ")}) VALUES ${valuesSql}`, ...params);
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("Give the backup file: npm run db:bulk-restore -- backups/file.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { format?: string; tables?: Record<string, Record<string, unknown>[]> };
  if (data.format !== "myseed-backup" || !data.tables) throw new Error(`${file} is not a Myseed backup.`);
  const tables = data.tables;
  console.log(`Database: ${databaseLabel()}`);
  await tx(async () => {
    await emptyWorkspace();
    let inserted = 0;
    for (const t of TABLES) {
      const rows = tables[t] ?? [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const chunkSize = Math.max(1, Math.floor(MAX_PARAMS / Math.max(cols.length, 1)));
      for (let i = 0; i < rows.length; i += chunkSize) {
        await insertChunk(t, rows.slice(i, i + chunkSize));
        inserted += Math.min(chunkSize, rows.length - i);
      }
    }
    // Keep serial columns ahead of the restored ids.
    for (const [t, col] of [["access_scopes", "id"], ["leave_entries", "id"], ["stage_intervals", "id"], ["deadline_revisions", "id"], ["audit_events", "seq"], ["chat_messages", "seq"]])
      await run(`SELECT setval(pg_get_serial_sequence('${t}', '${col}'), GREATEST(COALESCE((SELECT MAX(${col}) FROM ${t}), 0), 1))`);
    console.log(`Inserted ${inserted} rows in batches.`);
  });
  console.log(`Restored ${file}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());