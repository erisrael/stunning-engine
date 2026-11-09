process.env.MAIL_FAKE = "1";
process.env.AI_FAKE = "1";
import assert from "node:assert/strict";
import { closeDb, get } from "../../src/server/db";
import { loadUser } from "../../src/server/users";
import { levenshtein, nearly, matchText, PLACES, FLOWS, DEFAULT_ASSISTANT } from "../../src/lib/assistant";
import { saveAiConfig, aiConfig, saveAiModel, listAiModels, testAiModelById } from "../../src/server/assistant-ai";

async function main() {
  console.log("Starting tests for assistant typo tolerance, navigation matching, and custom AI models...");

  // 1. Levenshtein and Typo Tolerance
  assert.equal(levenshtein("attendance", "atendance"), 1);
  assert.equal(levenshtein("schedule", "scheudle"), 2);
  assert.equal(levenshtein("leave", "leav"), 1);
  assert.equal(levenshtein("handover", "hndover"), 1);

  assert.ok(nearly("attendance", "atendance"), "Should match attendance with single 't'");
  assert.ok(nearly("schedule", "scheudle"), "Should match transposed schedule");
  assert.ok(nearly("leave", "leav"), "Should match leave without e");
  assert.ok(nearly("handover", "hndover"), "Should match handover without a");
  assert.ok(nearly("checkin", "chekin"), "Should match checkin typo");
  assert.ok(!nearly("apple", "banana"), "Completely different words must not match");

  console.log("PASS Typo tolerance & Levenshtein verified.");

  // 2. Navigation matching & Places
  const hrMatch = matchText("go to hr", FLOWS, DEFAULT_ASSISTANT);
  assert.ok(hrMatch.some((m) => m.type === "place" && m.place.name === "HR"), "Must match HR place on 'go to hr'");

  const leaveMatch = matchText("open leave", FLOWS, DEFAULT_ASSISTANT);
  assert.ok(leaveMatch.some((m) => m.type === "place" && m.place.name === "Leave"), "Must match Leave place on 'open leave'");

  const attendanceMatch = matchText("take me to attendance", FLOWS, DEFAULT_ASSISTANT);
  assert.ok(attendanceMatch.some((m) => m.type === "place" && m.place.name === "Attendance"), "Must match Attendance place");

  console.log("PASS Navigation & place matching verified.");

  // 3. Custom AI Model Configuration (No artificial limits)
  const adminRow = await get<{ id: string }>("SELECT id FROM users WHERE email = 'admin@demo.local'");
  assert.ok(adminRow, "Admin user must exist");
  const admin = (await loadUser(adminRow.id))!;

  // Save custom model on cfg
  await saveAiConfig(admin, {
    on: true,
    provider: "custom",
    model: "my-custom-org/deepseek-r1-custom-70b",
    customBaseUrl: "https://llm.internal.myseedops.tech/v1",
  });
  const cfg = await aiConfig();
  assert.equal(cfg.provider, "custom");
  assert.equal(cfg.model, "my-custom-org/deepseek-r1-custom-70b");
  assert.equal(cfg.customBaseUrl, "https://llm.internal.myseedops.tech/v1");

  // Save custom model in ai_models table
  const savedModel = await saveAiModel(admin, {
    name: "Gemini 2.0 Flash Production",
    provider: "gemini",
    model: "gemini-2.0-flash",
    apiKey: "test-fake-key",
    isDefault: true,
    active: true,
  });
  assert.ok(savedModel.id, "Saved model ID returned");

  const models = await listAiModels(admin);
  const foundModel = models.find((m) => m.id === savedModel.id);
  assert.ok(foundModel, "Model must be in list");
  assert.equal(foundModel?.model, "gemini-2.0-flash");
  assert.equal(foundModel?.isDefault, true);

  // Test the model (mocked/fake)
  const testRes = await testAiModelById(admin, savedModel.id);
  assert.ok(testRes.ok, "Fake test must succeed");

  console.log("PASS Custom AI model selection & testing verified without provider restrictions.");
  await closeDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

