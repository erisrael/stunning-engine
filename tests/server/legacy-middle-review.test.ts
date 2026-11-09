process.env.MAIL_FAKE = "1";
import assert from "node:assert/strict";
import { all, closeDb, get, run } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { addPart, addSubject, addUnit, legacyParts } from "../../src/server/legacy";

async function main() {
  console.log("Starting tests for legacy middle insertion and review parts...");

  const adminRow = await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'");
  assert.ok(adminRow, "Admin user must exist");
  const admin = (await loadUser(adminRow.id))!;

  const grade = await get<{ id: string }>("SELECT id FROM grades WHERE active = 1 ORDER BY sort LIMIT 1");
  assert.ok(grade, "At least one grade must exist");

  const subj = await addSubject(admin, grade.id, "Test Legacy Subject " + Date.now());
  const unit = await addUnit(admin, grade.id, subj.id, "Unit 1: Test Fundamentals");

  // 1. Add Part 1
  const p1 = await addPart(admin, unit.id, "Introduction");
  assert.equal(p1.number, 1);

  // 2. Add Part 2
  const p2 = await addPart(admin, unit.id, "Core Concepts");
  assert.equal(p2.number, 2);

  // 3. Add Part 3
  const p3 = await addPart(admin, unit.id, "Advanced Applications");
  assert.equal(p3.number, 3);

  let parts = await legacyParts(unit.id);
  assert.equal(parts.length, 3);
  assert.equal(parts[0].number, 1);
  assert.equal(parts[1].number, 2);
  assert.equal(parts[2].number, 3);

  // 4. Insert Review Part in the middle at position 2
  const reviewPart = await addPart(admin, unit.id, "Mid-Unit Review & Quiz", {
    insertAt: 2,
    kind: "review",
  });
  assert.equal(reviewPart.number, 2);

  parts = await legacyParts(unit.id);
  assert.equal(parts.length, 4);

  // Position 1: Introduction
  assert.equal(parts[0].number, 1);
  assert.equal(parts[0].title, "Introduction");

  // Position 2: Mid-Unit Review & Quiz (Review part - not forced into Part 2)
  assert.equal(parts[1].number, 2);
  assert.equal(parts[1].title, "Mid-Unit Review & Quiz");

  // Position 3: Core Concepts (shifted from 2 to 3)
  assert.equal(parts[2].number, 3);
  assert.equal(parts[2].title, "Core Concepts");

  // Position 4: Advanced Applications (shifted from 3 to 4)
  assert.equal(parts[3].number, 4);
  assert.equal(parts[3].title, "Advanced Applications");

  // 5. Insert Custom Part at position 1 (at the very beginning)
  const customPart = await addPart(admin, unit.id, "Unit Overview & Diagnostic", {
    insertAt: 1,
    kind: "custom",
  });
  assert.equal(customPart.number, 1);

  parts = await legacyParts(unit.id);
  assert.equal(parts.length, 5);
  assert.equal(parts[0].number, 1);
  assert.equal(parts[0].title, "Unit Overview & Diagnostic");
  assert.equal(parts[1].number, 2);
  assert.equal(parts[1].title, "Introduction");
  assert.equal(parts[2].number, 3);
  assert.equal(parts[2].title, "Mid-Unit Review & Quiz");
  assert.equal(parts[3].number, 4);
  assert.equal(parts[3].title, "Core Concepts");
  assert.equal(parts[4].number, 5);
  assert.equal(parts[4].title, "Advanced Applications");

  console.log("PASS Legacy middle insertion and review parts verified successfully!");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

