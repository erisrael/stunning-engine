"use server";

import { requireViewer } from "@/server/auth";
import { getHrAiConfig, saveHrAiConfig, type HrAiConfig } from "@/server/hr-ai";

export async function getHrAiConfigAction() {
  try {
    await requireViewer();
    const config = await getHrAiConfig();
    return { ok: true, data: config };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load HR AI config" };
  }
}

export async function saveHrAiConfigAction(input: Partial<HrAiConfig>) {
  try {
    const viewer = await requireViewer();
    const saved = await saveHrAiConfig(viewer, input);
    return { ok: true, data: saved };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to save HR AI config" };
  }
}

