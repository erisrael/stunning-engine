/*
 * Copies the curriculum and production data between databases, leaving accounts, sign-ins and settings alone.
 * Building the data locally and copying it is minutes instead of hours over a distant connection.
 *
 *   DATABASE_URL= npx tsx scripts/copy-workspace-data.ts export data.json          (from data/pg)
 *   DATABASE_URL="<session pooler>" npx tsx scripts/copy-workspace-data.ts import data.json
 *
 * import replaces these tables in one transaction: if anything fails, the target is unchanged.
 * Both databases must have the same user ids (owners and authors refer to them).
 */
import fs from "node:fs";
import { all, closeDb, databaseLabel, placeholders, run, tx } from "../src/server/db";
import { TABLES } from "../src/server/schema";
import { workspaceCounts } from "../src/server/workspace-data";

// Curriculum and production tables, in dependency order (TABLES order).
const DATA_TABLES = [
  "curricula",
  "grades",
  "subjects",
  "grade_subjects",
  "units",
  "lessons",
  "items",
  "item_memberships",
  "stage_assignments",
  "stage_attempts",
  "stage_intervals",
  "assets",
  "handoff_reviews",
  "publication_targets",
  "audit_events",
  "jobs",
];
const SERIALS: [string, string][] = [["stage_intervals", "id"], ["audit_events", "seq"]];
const MAX_PARAMS = 5000;

async function main() {
  const [command, file] = process.argv.slice(2);
  if (!file || !["export", "import"].includes(command)) throw new Error("Usage: copy-workspace-data.ts export|import <file.json>");
  const tables = TABLES.filter((t) => DATA_TABLES.includes(t));
  console.log(`Database: ${databaseLabel()}`);

  if (command === "export") {
    const out: Record<string, unknown[]> = {};
    const users = (await all<{ id: string }>("SELECT id FROM users")).map((u) => u.id);
    for (const t of tables) out[t] = await all(`SELECT * FROM ${t}`);
    fs.writeFileSync(file, JSON.stringify({ format: "myseed-workspace-data", users, tables: out }));
    console.log(`Exported ${tables.map((t) => `${t} ${out[t].length}`).join(", ")}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { format: string; users: string[]; tables: Record<string, Record<string, unknown>[]> };
  if (data.format !== "myseed-workspace-data") throw new Error(`${file} was not written by this script's export.`);
  const here = new Set((await all<{ id: string }>("SELECT id FROM users")).map((u) => u.id));
  const missing = data.users.filter((id) => !here.has(id));
  if (missing.length) throw new Error(`These user ids are not in the target database: ${missing.join(", ")}. Owners and authors would not match.`);

  await tx(async () => {
    // Children first. If a table outside this list still points at these rows, the delete fails and nothing changes.
    for (const t of [...tables].reverse()) await run(`DELETE FROM ${t}`);
    for (const t of tables) {
      const rows = data.tables[t] ?? [];
      if (!rows.length) continue;
      const cols = Object.keys(rows[0]);
      const size = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
      for (let i = 0; i < rows.length; i += size) {
        const chunk = rows.slice(i, i + size);
        await run(
          `INSERT INTO ${t} (${cols.join(", ")}) VALUES ${chunk.map(() => `(${placeholders(cols.length)})`).join(", ")}`,
          ...chunk.flatMap((r) => cols.map((c) => (r[c] === undefined ? null : (r[c] as string | number | boolean | null)))),
        );
      }
      console.log(`  ${t}: ${rows.length}`);
    }
    for (const [t, col] of SERIALS) await run(`SELECT setval(pg_get_serial_sequence('${t}', '${col}'), GREATEST(COALESCE((SELECT MAX(${col}) FROM ${t}), 0), 1))`);
  });
  console.log("Counts:", JSON.stringify(await workspaceCounts()));
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
