/*
 * Brings the project's documentation (the Markdown files listed in docs/library.json) into the Dev team's
 * Specs and docs, the same way the server does when it starts. Safe to run again: unchanged files do nothing,
 * documents edited in the app are kept, deleted ones stay deleted.
 *
 *   npm run docs:sync                       embedded database in data/pg
 *   DATABASE_URL=... npm run docs:sync      any PostgreSQL
 */
import { closeDb, databaseLabel } from "../src/server/db";
import { syncRepoDocs } from "../src/server/doc-sync";

async function main() {
  console.log(`Database: ${databaseLabel()}`);
  const r = await syncRepoDocs();
  console.log(`Department: ${r.dept}`);
  console.log(`Added (${r.added.length}): ${r.added.join(", ") || "none"}`);
  console.log(`Updated (${r.updated.length}): ${r.updated.join(", ") || "none"}`);
  console.log(`Kept as edited in the app (${r.keptEdited.length}): ${r.keptEdited.join(", ") || "none"}`);
  console.log(`Unchanged: ${r.unchanged}`);
  if (r.problems.length) {
    console.log(`Problems: ${r.problems.join("; ")}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
