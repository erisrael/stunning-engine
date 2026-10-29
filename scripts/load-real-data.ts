/*
 * Loads the real production data into the current database (DATABASE_URL, or data/pg without it):
 *   1. the Recording team's curriculum tracker JSON (units, parts, camera codes; recorded parts move to Editing)
 *   2. the Uploading team's video tracker CSV (edited parts move to Uploading, later stages by status)
 * Both steps match existing records by their source IDs, so running it again is safe.
 *
 *   npx tsx scripts/load-real-data.ts <curriculum.json> <video-tracker.csv> [trace-out.json]
 */
import fs from "node:fs";
import path from "node:path";
import { all, closeDb, databaseLabel } from "../src/server/db";
import { importCurriculumBackup, isCurriculumBackup, workspaceCounts } from "../src/server/workspace-data";
import { importVideoTracker } from "../src/server/video-tracker";

async function main() {
  const [jsonPath, csvPath, traceOut] = process.argv.slice(2);
  if (!jsonPath || !csvPath) throw new Error("Usage: npx tsx scripts/load-real-data.ts <curriculum.json> <video-tracker.csv> [trace-out.json]");
  console.log(`Database: ${databaseLabel()}`);
  const admin = (await all<{ user_id: string }>("SELECT user_id FROM role_assignments WHERE role = 'admin' LIMIT 1"))[0]?.user_id ?? null;

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  if (!isCurriculumBackup(data)) throw new Error(`${jsonPath} is not a curriculum tracker backup.`);
  let t = Date.now();
  console.log("1/2 Curriculum tracker JSON...");
  const cur = await importCurriculumBackup(data, { actorId: admin, createItems: true, markRecorded: true, fileName: path.basename(jsonPath) });
  console.log(`    ${cur.units.created} units, ${cur.parts.created} parts, ${cur.items.created} items, ${cur.recordings.created} camera codes, ${cur.recordedParts} recorded (${Math.round((Date.now() - t) / 1000)}s)`);
  for (const w of cur.warnings) console.log(`    warning: ${w}`);

  t = Date.now();
  console.log("2/2 Video tracker CSV...");
  const vt = await importVideoTracker(fs.readFileSync(csvPath, "utf8"), { dryRun: false, actorId: admin, fileName: path.basename(csvPath) });
  console.log(`    ${JSON.stringify(vt.counts)} (${Math.round((Date.now() - t) / 1000)}s)`);
  for (const r of vt.trace.filter((r) => r.action === "error" || r.action === "skip")) console.log(`    ${r.action}: ${r.key} ${r.note}`);
  if (traceOut) fs.writeFileSync(traceOut, JSON.stringify(vt.trace));

  console.log("Counts:", JSON.stringify(await workspaceCounts()));
  console.log("Items by stage:", JSON.stringify(await all("SELECT lifecycle, stage, COUNT(*)::int AS n FROM items GROUP BY lifecycle, stage ORDER BY 1, 2")));
  await closeDb();
}

main().catch(async (err) => {
  console.error(err);
  await closeDb().catch(() => {});
  process.exit(1);
});
