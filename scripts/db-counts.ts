/*
 * Prints row counts as one JSON line, for tools such as the control panel.
 *
 *   npm run db:counts                       embedded database in data/pg
 *   DATABASE_URL=... npm run db:counts      Supabase or any PostgreSQL
 */
import { closeDb, databaseLabel } from "../src/server/db";
import { workspaceCounts } from "../src/server/workspace-data";

async function main() {
  const started = Date.now();
  const counts = await workspaceCounts();
  console.log(JSON.stringify({ database: databaseLabel(), counts, ms: Date.now() - started }));
}

main()
  .catch((err) => {
    console.log(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
