/*
 * One-off script: set password to "12345678" for all seed users.
 * Run from project root: node node_modules/tsx/dist/cli.mjs scripts/reset-all-passwords.ts
 */
import { closeDb, databaseLabel, all, run, uid, nowIso } from "../src/server/db";
import { hashPassword } from "../src/server/passwords";

const EMAILS = [
  "kidus@myseed.local",
  "biniyam@myseed.local",
  "michael@myseed.local",
  "wasihun@myseed.local",
  "amanuel@myseed.local",
];

const PASSWORD = "12345678";

async function main() {
  console.log(`Database: ${databaseLabel()}`);
  const users = await all<{ id: string; name: string; email: string }>(
    `SELECT id, name, email FROM users WHERE lower(email) IN (${EMAILS.map(() => "?").join(",")})`,
    ...EMAILS.map((e) => e.toLowerCase()),
  );

  if (!users.length) throw new Error("No matching users found in the database.");

  for (const user of users) {
    await run(
      "UPDATE users SET password_hash = ?, must_change_password = 0, active = 1 WHERE id = ?",
      hashPassword(PASSWORD),
      user.id,
    );
    await run("DELETE FROM sessions WHERE user_id = ?", user.id);
    await run(
      "INSERT INTO audit_events (id, occurred_at, actor_kind, action, summary) VALUES (?, ?, 'system', 'user.password_reset', ?)",
      uid("aud_"),
      nowIso(),
      `Password reset to fixed value for ${user.name} via reset-all-passwords script`,
    );
    console.log(`✓ ${user.name} <${user.email}>`);
  }
  console.log(`\nAll ${users.length} users now have password: ${PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
