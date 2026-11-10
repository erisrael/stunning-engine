"use server";

import { requireViewer } from "@/server/auth";
import {
  getMyseedVerifyConfig,
  saveMyseedVerifyConfig,
  testMyseedVerifyConnection,
  createVerifyPaymentRequest,
  type MyseedVerifyConfig,
  type CreatePaymentRequestInput,
} from "@/server/myseed-verify";

export async function getMyseedVerifyConfigAction() {
  try {
    await requireViewer();
    const config = await getMyseedVerifyConfig();
    return {
      ok: true,
      data: {
        ...config,
        apiKey: config.apiKey ? `${config.apiKey.slice(0, 6)}••••••••` : "",
        hasApiKey: !!config.apiKey,
        webhookSecret: config.webhookSecret ? "••••••••" : "",
        hasWebhookSecret: !!config.webhookSecret,
      },
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to load verify config" };
  }
}

export async function saveMyseedVerifyConfigAction(input: Partial<MyseedVerifyConfig>) {
  try {
    const viewer = await requireViewer();
    const saved = await saveMyseedVerifyConfig(viewer, input);
    return { ok: true, data: saved };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to save verify config" };
  }
}

export async function testMyseedVerifyConnectionAction() {
  try {
    await requireViewer();
    const res = await testMyseedVerifyConnection();
    return res;
  } catch (err: any) {
    return { ok: false, message: err?.message || "Test connection failed", ms: 0, status: "error" as const };
  }
}

export async function createVerifyPaymentRequestAction(input: CreatePaymentRequestInput) {
  try {
    await requireViewer();
    const res = await createVerifyPaymentRequest(input);
    return { ok: true, data: res };
  } catch (err: any) {
    return { ok: false, error: err?.message || "Failed to create payment request" };
  }
}

