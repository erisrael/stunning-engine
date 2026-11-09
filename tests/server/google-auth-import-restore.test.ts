process.env.MAIL_FAKE = "1";
import assert from "node:assert/strict";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { TEMPLATES, autoMap, runImport } from "../../src/server/importer";
import { getProfile, profileFieldsConfig, saveProfile, saveProfileFieldsConfig } from "../../src/server/profiles";
import { providerSignIn } from "../../src/server/signin";
import { googleSettings, requestEmailReset, saveGoogleSettings } from "../../src/server/password-reset";
import { listBackups, restoreBackup, runBackup } from "../../src/server/backups";

async function main() {
  console.log("Starting tests for Google auth, profile controls, equipment/finance imports, and restore...");

  const adminRow = await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'");
  const saraRow = await get<{ id: string }>("SELECT id FROM users WHERE email = 'sara@demo.local'");
  assert.ok(adminRow && saraRow, "Demo users must exist");
  const admin = (await loadUser(adminRow.id))!;
  const sara = (await loadUser(saraRow.id))!;

  // 1. Equipment & Finance Requests Import
  assert.ok(TEMPLATES.equipment, "Equipment template must exist");
  assert.ok(TEMPLATES.finance_requests, "Finance requests template must exist");

  const eqHeader = ["Asset tag", "Name", "Department", "Category", "Status", "Notes"];
  const eqRow1 = ["EQ-TST-01", "Test Camera 4K", "general", "Production", "available", "Imported 4k gear"];
  const eqRow2 = ["EQ-TST-02", "Wireless Mic Set", "general", "Audio", "available", "Imported mic"];

  const eqResult = await runImport(admin, {
    template: "equipment",
    mode: "create",
    sheet: { headers: eqHeader, rows: [eqRow1, eqRow2] },
    mapping: autoMap(TEMPLATES.equipment, eqHeader),
    dryRun: false,
    fileName: "equipment.csv",
  });
  assert.equal(eqResult.counts.create, 2, "Should create 2 equipment items");
  const importedEq = await get<{ name: string; notes: string }>("SELECT name, notes FROM equipment WHERE tag = 'EQ-TST-01'");
  assert.equal(importedEq?.name, "Test Camera 4K");
  assert.equal(importedEq?.notes, "Imported 4k gear");

  const finHeader = ["Department", "Request type", "Title", "Description", "Estimated cost", "Quantity"];
  const finRow = ["general", "device", "Telephoto lens purchase", "Urgent shoot equipment needed", "18500", "1"];

  const finResult = await runImport(admin, {
    template: "finance_requests",
    mode: "create",
    sheet: { headers: finHeader, rows: [finRow] },
    mapping: autoMap(TEMPLATES.finance_requests, finHeader),
    dryRun: false,
    fileName: "finance.csv",
  });
  assert.equal(finResult.counts.create, 1, "Should create 1 finance request");
  const importedFin = await get<{ title: string }>("SELECT title FROM fin_purchases WHERE title LIKE '%Telephoto lens purchase%'");
  assert.ok(importedFin, "Finance purchase request must be created");
  console.log("PASS Equipment & Finance requests imported successfully via templates");

  // 2. Attached Gmail to Profile & Account Matching
  await saveProfile(sara, {
    gmail: "sara.attached@gmail.com",
    headline: "Original Headline",
    skills: [{ name: "Editing", level: "good" }],
  });
  const saraProf = await getProfile(sara, sara.id);
  assert.equal(saraProf?.gmail, "sara.attached@gmail.com");

  // Enable Google settings for signin
  await saveGoogleSettings(admin, {
    clientId: "test.google.client.id.apps.googleusercontent.com",
    secret: "test_secret_12345",
    googleSignIn: true,
    googleReset: true,
  });

  // Sign in via Google matching attached Gmail
  const signinResult = await providerSignIn(
    "google",
    {
      subject: "google-sub-sara-123",
      email: "sara.attached@gmail.com",
      name: "Sara Demo",
    },
    "/",
  );
  assert.ok(signinResult.ok, "Google signin should succeed");
  const linked = await get<{ user_id: string }>("SELECT user_id FROM user_identities WHERE provider = 'google' AND email = 'sara.attached@gmail.com'");
  assert.equal(linked?.user_id, sara.id, "Google signin should link and match to sara's account via attached Gmail");
  console.log("PASS Sign in with attached Gmail matches user account");

  // Password reset matching attached Gmail
  await requestEmailReset("sara.attached@gmail.com");
  const resetRow = await get<{ user_id: string; via: string }>("SELECT user_id, via FROM password_resets WHERE user_id = ?", sara.id);
  assert.ok(resetRow, "Password reset should find account by attached Gmail and create reset token");
  assert.equal(resetRow.via, "email");
  console.log("PASS Password reset request identifies account via attached Gmail");

  // 3. Admin Profile Field Editability Controls
  await saveProfileFieldsConfig(admin, ["skills", "languages"]);
  const fieldCfg = await profileFieldsConfig();
  assert.deepEqual(fieldCfg.editable, ["skills", "languages"]);

  // Member tries to change locked headline vs allowed skills
  await saveProfile(sara, {
    headline: "Hacker Attempted Headline Change",
    skills: [{ name: "Editing", level: "good" }, { name: "Color Grading", level: "expert" }],
  });
  const saraUpdated = await getProfile(sara, sara.id);
  assert.equal(saraUpdated?.headline, "Original Headline", "Locked headline should not be modified by regular member");
  assert.ok(saraUpdated?.skills.some((s) => s.name === "Color Grading"), "Allowed skills should be updated");

  // Admin can change any field even if locked for members
  await saveProfile(admin, {
    headline: "Admin Master Headline",
  });
  const adminProf = await getProfile(admin, admin.id);
  assert.equal(adminProf?.headline, "Admin Master Headline", "Admin should be able to update their own fields");
  console.log("PASS Admin-controlled profile fields editability enforced");

  // 4. Google Settings Configuration
  await saveGoogleSettings(admin, {
    clientId: "test.google.client.id.apps.googleusercontent.com",
    secret: "test_secret_12345",
    googleSignIn: false,
    googleReset: true,
  });
  const gSet = await googleSettings();
  assert.equal(gSet.googleSignIn, false);
  assert.equal(gSet.googleReset, true);
  console.log("PASS Google settings configurable for signin and reset switches");

  // 5. Point-in-Time Restore
  const backup = await runBackup(admin);
  assert.ok(backup.ok, "Backup should succeed");
  const files = (await listBackups(admin)).files;
  assert.ok(files.length > 0, "Backup file should be listed");
  const targetFile = files[0];

  // Mutate data after backup
  await run("INSERT INTO equipment (id, tag, name, department, status, created_at, updated_at) VALUES ('eq_temp', 'EQ-POST-BACKUP', 'Transient Gear', 'general', 'available', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')");
  const trans = await get("SELECT tag FROM equipment WHERE tag = 'EQ-POST-BACKUP'");
  assert.ok(trans, "Transient record must exist before restore");

  // Restore from point in time
  const rest = await restoreBackup(admin, targetFile.target, targetFile.ref);
  assert.ok(rest.restoredRows > 0, "Restore should restore rows");

  const transAfter = await get("SELECT tag FROM equipment WHERE tag = 'EQ-POST-BACKUP'");
  assert.equal(transAfter, undefined, "Transient record added after backup must be reverted by restore");

  const preservedEq = await get<{ name: string }>("SELECT name FROM equipment WHERE tag = 'EQ-TST-01'");
  assert.equal(preservedEq?.name, "Test Camera 4K", "Data present during backup must be preserved");
  console.log("PASS Point-in-time restore successfully reverts changes to backup point");

  console.log("\nALL TESTS PASSED!");
}

main()
  .catch((e) => {
    console.error(e);
    console.log("FAIL google-auth-import-restore");
    process.exitCode = 1;
  })
  .finally(() => closeDb());
