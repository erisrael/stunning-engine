// Running the system: backup retention, the S3 signature (AWS's published examples), backup encryption, scheduled
// job records and the lease, errors grouped and masked, and a real backup with a test restore.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { all, closeDb, get, nowIso, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { backupName, backupsToKeep } from "../../src/lib/backup-retention";
import { signV4 } from "../../src/server/s3";
import { decodeBackup, encodeBackup } from "../../src/server/backup-codec";
import { acquireLease, housekeeping, jobStatus, recordError, releaseLease, resolveErrors, runJob, scrub } from "../../src/server/ops";
import { backupConfig, listBackups, runBackup, saveBackupConfig, scheduledBackup, testRestore } from "../../src/server/backups";

let pass = 0;
let fail = 0;
const check = (name: string, ok: boolean, extra?: unknown) => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${!ok && extra !== undefined ? ` ${JSON.stringify(extra)}` : ""}`);
};
const throws = async (fn: () => unknown) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  // Retention: a backup every day for 500 days.
  const day = 864e5;
  const start = Date.UTC(2025, 0, 1, 2, 0);
  const names = Array.from({ length: 500 }, (_, i) => backupName(new Date(start + i * day), false));
  const keep = backupsToKeep(names, { daily: 7, weekly: 4, monthly: 12 });
  const newest = names.at(-1)!;
  check("the newest is kept", keep.has(newest));
  check("the last 7 days are kept", names.slice(-7).every((n) => keep.has(n)));
  check("about 7 daily + 4 weekly + 12 monthly remain (overlaps counted once)", keep.size >= 12 && keep.size <= 23, keep.size);
  check("nothing older than 12 months remains", [...keep].every((n) => Date.parse(`${n.slice(7, 11)}-${n.slice(11, 13)}-${n.slice(13, 15)}`) > start + 500 * day - 380 * day));
  check("other files are never touched", backupsToKeep(["notes.txt", newest]).size === 1);

  // S3 signature version 4, AWS documentation examples.
  const aws = { accessKeyId: "AKIAIOSFODNN7EXAMPLE", secret: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", region: "us-east-1", amzDate: "20130524T000000Z", payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" };
  const get1 = signV4({ ...aws, method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/test.txt", headers: { range: "bytes=0-9" } });
  check("S3 signature: GET object example", get1.endsWith("Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41"), get1);
  const list1 = signV4({ ...aws, method: "GET", host: "examplebucket.s3.amazonaws.com", path: "/", query: { "max-keys": "2", prefix: "J" } });
  check("S3 signature: list objects example", list1.endsWith("Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7"), list1);

  // The backup file
  const snap = { format: "myseed-backup", version: 1, createdAt: nowIso(), tables: { users: [{ id: "u1", name: "Ab" }] } };
  check("plain backups round-trip", decodeBackup(encodeBackup(snap)).tables.users![0]!.name === "Ab");
  const sealed = encodeBackup(snap, "correct horse battery");
  check("encrypted backups do not show their content", !sealed.includes(Buffer.from("Ab")) && sealed.subarray(0, 8).toString() === "MYSEEDB1");
  check("encrypted backups round-trip with the passphrase", decodeBackup(sealed, "correct horse battery").tables.users!.length === 1);
  check("a wrong passphrase is refused", /wrong/.test((await throws(() => decodeBackup(sealed, "nope"))) ?? ""));
  check("no passphrase is refused", /encrypted/.test((await throws(() => decodeBackup(sealed))) ?? ""));
  check("the old plain JSON from npm run backup still reads", decodeBackup(Buffer.from(JSON.stringify(snap))).tables.users!.length === 1);

  // Jobs and the lease
  check("a lease is taken once", (await acquireLease("t", 60e3)) && !(await acquireLease("t", 60e3)));
  await releaseLease("t");
  check("and again after release", await acquireLease("t", 60e3));
  await run("UPDATE settings SET value = ? WHERE key = 'lease.t'", JSON.stringify(new Date(Date.now() - 1000).toISOString()));
  check("an expired lease can be taken", await acquireLease("t", 60e3));
  await runJob("trash", async () => ({ removed: 2 }));
  await runJob("budgets", async () => {
    throw new Error("boom for budgets");
  });
  const js = await jobStatus();
  check("a job's result is recorded", js.jobs.find((j) => j.name === "trash")?.detail === '{"removed":2}');
  check("a failing job is recorded with its error", js.jobs.find((j) => j.name === "budgets")?.ok === false && /boom/.test(js.jobs.find((j) => j.name === "budgets")?.error ?? ""));

  // Errors
  check("personal data is masked", scrub("No user kidus@myseed.et with token abcdefghijklmnopqrstuvwxyz0123456789 phone 0911223344") === "No user [email] with token [token] phone [number]");
  for (let i = 0; i < 3; i++) await recordError({ source: "server", message: `Cannot read item 4${i}`, stack: "Error\n    at load (src/server/x.ts:10:5)", path: "/items/abc?x=secret" });
  const errs = await all<{ id: string; count: number; path: string }>("SELECT id, count, path FROM error_events WHERE source = 'server'");
  check("the same error is grouped, not repeated", errs.length === 1 && Number(errs[0]!.count) === 3, errs);
  check("addresses are kept without their query", errs[0]?.path === "/items/abc");
  const admin = (await loadUser((await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'"))!.id))!;
  const alerts = Number((await get<{ c: number }>("SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = 'failure'", admin.id))?.c);
  check("Admin is alerted once for a new error (plus the job error)", alerts >= 1 && alerts <= 3, alerts);
  await resolveErrors(admin, [errs[0]!.id]);
  await recordError({ source: "server", message: "Cannot read item 49", stack: "Error\n    at load (src/server/x.ts:10:5)" });
  check("a fixed error that comes back opens again", !(await get<{ resolved_at: string | null }>("SELECT resolved_at FROM error_events WHERE id = ?", errs[0]!.id))?.resolved_at);
  check("housekeeping runs", typeof (await housekeeping()).errors === "number");

  // A real backup to a folder, thinning, and a test restore.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "myseed-bk-"));
  for (let i = 1; i <= 20; i++) fs.writeFileSync(path.join(dir, backupName(new Date(Date.now() - i * day), false)), "old");
  fs.writeFileSync(path.join(dir, "keep-me.txt"), "not a backup");
  const cfg = await backupConfig();
  check("the relative folder is refused", /full path/.test((await throws(() => saveBackupConfig(admin, { ...cfg, local: { enabled: true, dir: "backups" } }))) ?? ""));
  check("encryption needs a passphrase", /passphrase/.test((await throws(() => saveBackupConfig(admin, { ...cfg, encrypt: true, local: { enabled: true, dir } }))) ?? ""));
  await saveBackupConfig(admin, { ...cfg, encrypt: true, local: { enabled: true, dir }, passphrase: "a long backup passphrase" });
  const r = await runBackup(admin);
  check("a backup is made", r.ok && r.rows > 10 && fs.existsSync(path.join(dir, r.name)) && r.name.endsWith(".enc"), r);
  const left = fs.readdirSync(dir);
  check("old copies are thinned (7 daily + weekly)", left.filter((f) => f.startsWith("myseed-")).length <= 12 && left.length < 22, left.length);
  check("other files in the folder are left alone", left.includes("keep-me.txt"));
  check("the backup is listed", (await listBackups(admin)).files.some((f) => f.name === r.name));
  const t = await testRestore(admin);
  check("the test restore passes: every table's rows match", t.ok, t.detail);
  check("nothing is due right after", (await scheduledBackup()) === "nothing due");
  fs.rmSync(dir, { recursive: true, force: true });

  console.log(`\n${pass} passed, ${fail} failed`);
  await closeDb();
  process.exit(fail ? 1 : 0);
}
main();
