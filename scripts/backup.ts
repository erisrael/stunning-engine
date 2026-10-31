/*
 * Backs up or restores every table as one JSON file. Works the same on Supabase and the embedded database.
 *
 *   npm run backup                          writes backups/myseed-YYYYMMDD-HHMM.json.gz
 *   npm run backup -- D:/backups            writes into the given folder
 *   npm run db:restore -- backups/file      replaces all current data with the backup (.json, .json.gz or
 *                                           .json.gz.enc; encrypted ones need BACKUP_PASSPHRASE set)
 *
 * With BACKUP_PASSPHRASE set, `npm run backup` encrypts the file the same way as the automatic backups.
 *
 * On Supabase you can also use the dashboard's daily backups or `pg_dump` (see docs/RUNBOOK.md).
 */
import fs from "node:fs";
import path from "node:path";
import { closeDb, databaseLabel, run, tx } from "../src/server/db";
import { TABLES } from "../src/server/schema";
import { backupSnapshot, emptyWorkspace } from "../src/server/workspace-data";
import { decodeBackup, encodeBackup } from "../src/server/backup-codec";
import { backupName } from "../src/lib/backup-retention";

async function backup(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  const passphrase = process.env.BACKUP_PASSPHRASE || null;
  const target = path.join(dir, backupName(new Date(), !!passphrase));
  const snapshot = await backupSnapshot();
  fs.writeFileSync(target, encodeBackup(snapshot, passphrase));
  const rows = Object.values(snapshot.tables).reduce((n, r) => n + r.length, 0);
  console.log(`Backup written to ${target} (${rows} rows, ${(fs.statSync(target).size / 1024 / 1024).toFixed(1)} MB)`);
}

async function restore(file: string) {
  const data = decodeBackup(fs.readFileSync(file), process.env.BACKUP_PASSPHRASE || null);
  await tx(async () => {
    await emptyWorkspace();
    for (const t of TABLES) {
      for (const row of data.tables![t] ?? []) {
        const cols = Object.keys(row);
        await run(
          `INSERT INTO ${t} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`,
          ...cols.map((c) => row[c] as string | number | null),
        );
      }
    }
    // Keep serial columns ahead of the restored ids.
    for (const [t, col] of [["access_scopes", "id"], ["leave_entries", "id"], ["stage_intervals", "id"], ["deadline_revisions", "id"], ["audit_events", "seq"], ["chat_messages", "seq"]])
      await run(`SELECT setval(pg_get_serial_sequence('${t}', '${col}'), GREATEST(COALESCE((SELECT MAX(${col}) FROM ${t}), 0), 1))`);
  });
  console.log(`Restored ${file}`);
}

async function main() {
  console.log(`Database: ${databaseLabel()}`);
  if (process.argv[2] === "--restore") {
    if (!process.argv[3]) throw new Error("Give the backup file: npm run db:restore -- backups/file.json");
    await restore(process.argv[3]);
  } else await backup(process.argv[2] ?? path.join(process.cwd(), "backups"));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
