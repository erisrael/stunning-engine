/*
 * Workspace database commands.
 *
 *   npm run db:reset                    empty everything, then load settings, accounts, chat groups
 *                                       and the real curriculum from data-import/curriculum.json
 *   npm run db:reset -- --no-items      same, but only load the curriculum (no production items)
 *   npm run db:empty                    delete all data (keeps nothing)
 *   npm run db:empty -- --keep-accounts delete curriculum and production data, keep accounts and settings
 *   npm run db:import -- <file.json>    add or update a curriculum tracker backup in the current data
 *   npm run db:status                   row counts
 *
 * Uses DATABASE_URL when set (Supabase or any PostgreSQL), otherwise the embedded database in data/pg.
 */
import fs from "node:fs";
import path from "node:path";
import { closeDb, databaseLabel, pgliteDir, run } from "../src/server/db";
import { DEFAULT_SETTINGS, saveSetting } from "../src/server/settings";
import {
  createDefaultGroups,
  emptyWorkspace,
  importCurriculumBackup,
  isCurriculumBackup,
  setAccountScopes,
  upsertAccount,
  workspaceCounts,
} from "../src/server/workspace-data";
import crypto from "node:crypto";
import { HOLIDAYS, USERS } from "./seed-data";

// Readable but strong: four groups of letters and digits, no look-alike characters.
function generatedPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const group = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
  return `${group()}-${group()}-${group()}-${crypto.randomInt(10, 99)}`;
}

const [command = "status", ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((a) => a.startsWith("--")));
const fileArg = rest.find((a) => !a.startsWith("--"));
const DEFAULT_FILE = path.join(process.cwd(), "data-import", "curriculum.json");

function readBackup(file: string) {
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!isCurriculumBackup(data)) throw new Error(`${file} is not a curriculum tracker backup (expected grade -> subjects -> units -> parts).`);
  return data;
}

async function loadCurriculum(file: string, createItems: boolean, actorId: string | null) {
  const started = Date.now();
  const s = await importCurriculumBackup(readBackup(file), { createItems, actorId, fileName: path.basename(file) });
  console.log(
    `Curriculum: ${s.grades} grades, ${s.subjects} subjects, ${s.units.created + s.units.updated} units, ${s.parts.created + s.parts.updated} parts ` +
      `(${s.parts.created} new). Items: ${s.items.created} new, ${s.items.existing} existing. ` +
      `Recordings: ${s.recordings.created} camera codes logged, ${s.recordedParts} parts handed to Editing. (${((Date.now() - started) / 1000).toFixed(1)}s)`,
  );
  for (const w of s.warnings.slice(0, 20)) console.warn(`  warning: ${w}`);
}

async function main() {
  console.log(`Database: ${databaseLabel()}`);
  if (command === "empty") {
    const n = await emptyWorkspace({ keepAccounts: flags.has("--keep-accounts"), keepSettings: flags.has("--keep-accounts") });
    console.log(`Emptied ${n} tables.`);
  } else if (command === "reset") {
    await emptyWorkspace();
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof typeof DEFAULT_SETTINGS)[]) {
      const value = structuredClone(DEFAULT_SETTINGS[key]);
      if (key === "calendar") (value as typeof DEFAULT_SETTINGS.calendar).holidays = HOLIDAYS;
      await saveSetting(key, value as never);
    }
    const ids: Record<string, string> = {};
    const passwords: Record<string, string> = {};
    for (const u of USERS) {
      passwords[u.key] = generatedPassword();
      ids[u.key] = (await upsertAccount({ ...u, password: passwords[u.key], mustChangePassword: true })).id;
      for (const st of u.leads ?? []) await run("INSERT INTO team_leads (stage, user_id) VALUES (?, ?) ON CONFLICT DO NOTHING", st, ids[u.key]);
    }
    console.log(`Created ${USERS.length} accounts.`);
    await loadCurriculum(fileArg ?? DEFAULT_FILE, !flags.has("--no-items"), ids.kidus ?? null);
    for (const u of USERS) if (u.grades || u.subjects) await setAccountScopes(ids[u.key], u.grades, u.subjects);
    await createDefaultGroups(ids.biniyam ?? ids.kidus ?? null);
    // Credentials are printed once and kept in data/ (git-ignored), never in the repository.
    const lines = [
      "# Initial sign-in credentials",
      "",
      `Created ${new Date().toISOString()} by npm run db:reset. Everyone must choose a new password at first sign-in. Delete this file once passwords are handed out.`,
      "",
      "| Name | Email | Password | Roles | Leads |",
      "| --- | --- | --- | --- | --- |",
      ...USERS.map((u) => `| ${u.name} | ${u.email} | \`${passwords[u.key]}\` | ${u.roles.join(", ")} | ${(u.leads ?? []).join(", ") || "-"} |`),
      "",
    ];
    // Keep the file next to the database it belongs to, so a throwaway reset (npm run verify uses its own
    // PGLITE_DIR) never overwrites the real data/initial-credentials.md.
    const credDir = process.env.DATABASE_URL ? path.join(process.cwd(), "data") : path.dirname(pgliteDir());
    const credFile = path.join(credDir, "initial-credentials.md");
    fs.mkdirSync(credDir, { recursive: true });
    fs.writeFileSync(credFile, lines.join("\n"));
    console.log(`\nInitial credentials (also saved to ${path.relative(process.cwd(), credFile) || credFile}):`);
    for (const u of USERS) console.log(`  ${u.email.padEnd(28)} ${passwords[u.key]}   ${u.roles.join(", ")}${u.leads?.length ? ` (leads ${u.leads.join(", ")})` : ""}`);
  } else if (command === "import") {
    if (!fileArg) throw new Error("Give the backup file: npm run db:import -- path/to/backup.json");
    await loadCurriculum(fileArg, !flags.has("--no-items"), null);
  } else if (command !== "status") {
    throw new Error(`Unknown command "${command}". Use reset, empty, import or status.`);
  }
  console.log("Rows:", await workspaceCounts());
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
