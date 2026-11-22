/*
 * Adds the Dev team's record of how the system was built (docs/dev-history.json) to the Dev team: projects,
 * sprints, releases and tasks assigned to the Dev account named Kidus (or MYSEED_DEV_OWNER_EMAIL). The server does
 * the same when it starts. Only what is missing is added; run again safely. --force reapplies an unchanged file.
 *
 *   npm run dev:history
 *   DATABASE_URL=... npm run dev:history
 */
import { closeDb, databaseLabel } from "../src/server/db";
import { applyDevHistory } from "../src/server/dev-history";

async function main() {
  console.log(`Database: ${databaseLabel()}`);
  const r = await applyDevHistory({ force: process.argv.includes("--force") });
  console.log(r.applied ? `Added for ${r.owner}: ${r.projects} projects, ${r.sprints} sprints, ${r.releases} releases, ${r.tasks} tasks (${r.skipped} already there)` : `Nothing added: ${r.reason}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
