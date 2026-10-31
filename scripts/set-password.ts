/*
 * Gives one account a new temporary password, for when nobody can sign in to use Admin → People → Reset password.
 * The person must choose their own password at the next sign-in, and their open sessions are ended. Their two-step
 * sign-in and any lockout are cleared too (a lost phone), so they set two-step up again when they sign in.
 *
 *   npm run db:set-password -- kidus@myseed.local                      embedded database in data/pg
 *   node --env-file=.env node_modules/tsx/dist/cli.mjs scripts/set-password.ts kidus@myseed.local
 *                                                                       the database in .env (for example Supabase)
 *
 * The new password is printed in this terminal only.
 */
import crypto from "node:crypto";
import { closeDb, databaseLabel, get, nowIso, run, uid } from "../src/server/db";
import { hashPassword } from "../src/server/passwords";

function generatedPassword() {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const group = () => Array.from(crypto.randomBytes(4), (b) => alphabet[b % alphabet.length]).join("");
  return `${group()}-${group()}-${group()}-${crypto.randomInt(10, 99)}`;
}

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error("Give the account's email: npm run db:set-password -- kidus@myseed.local");
  console.log(`Database: ${databaseLabel()}`);
  const user = await get<{ id: string; name: string; active: number }>("SELECT id, name, active FROM users WHERE lower(email) = lower(?)", email.trim());
  if (!user) throw new Error(`No account with the email ${email}.`);
  const password = generatedPassword();
  await run("UPDATE users SET password_hash = ?, must_change_password = 1, active = 1 WHERE id = ?", hashPassword(password), user.id);
  await run("DELETE FROM sessions WHERE user_id = ?", user.id);
  await run("DELETE FROM user_two_step WHERE user_id = ?", user.id);
  await run("DELETE FROM two_step_trust WHERE user_id = ?", user.id);
  await run("DELETE FROM signin_locks WHERE key = ?", `email:${email.trim().toLowerCase()}`);
  await run(
    "INSERT INTO audit_events (id, occurred_at, actor_kind, action, summary) VALUES (?, ?, 'system', 'user.password_reset', ?)",
    uid("aud_"),
    nowIso(),
    `Temporary password set and two-step sign-in cleared for ${user.name} from the command line`,
  );
  console.log(`\n${user.name} <${email}>${user.active ? "" : " (was deactivated, now active)"}`);
  console.log(`Temporary password: ${password}`);
  console.log("Sign in with it; you will be asked to choose your own password.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
