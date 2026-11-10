import crypto from "crypto";
import { get, run, nowIso } from "./db";
import { WorkflowError, audit } from "./workflow";
import { can, type AppUser } from "./users";

export type MyseedVerifyConfig = {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  webhookSecret: string;
  environment: "production" | "sandbox" | "custom";
  autoFulfill: boolean;
  status?: "connected" | "unconfigured" | "error";
  lastTestedAt?: string | null;
  lastError?: string | null;
};

export type VerifyPaymentItem = {
  title: string;
  minorAmount: string | null; // null for open-amount item
  quantity?: number;
  category?: string;
  reference?: string;
};

export type CreatePaymentRequestInput = {
  externalReference: string;
  currency?: string; // default "ETB"
  items: VerifyPaymentItem[];
  metadata?: Record<string, string>;
  expiresInMinutes?: number;
  idempotencyKey?: string;
};

export type VerifyPaymentRequestResponse = {
  id: string;
  status: "pending" | "submitted" | "accepted" | "rejected" | "expired";
  externalReference: string;
  currency: string;
  totalMinorAmount: string;
  submissionToken: string;
  submissionUrl?: string;
  expiresAt: string;
  createdAt: string;
};

const DEFAULT_CONFIG: MyseedVerifyConfig = {
  enabled: false,
  baseUrl: "https://verify.myseedops.tech",
  apiKey: "",
  webhookSecret: "",
  environment: "sandbox",
  autoFulfill: true,
  status: "unconfigured",
  lastTestedAt: null,
  lastError: null,
};

export async function getMyseedVerifyConfig(): Promise<MyseedVerifyConfig> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.myseed_verify'");
  if (!row?.value) return { ...DEFAULT_CONFIG };
  try {
    const parsed = JSON.parse(row.value);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveMyseedVerifyConfig(
  user: AppUser,
  input: Partial<MyseedVerifyConfig>
): Promise<MyseedVerifyConfig> {
  if (!can(user, "users.manage") && !can(user, "data.manage")) {
    throw new WorkflowError("FORBIDDEN", "Only administrators can configure verification platforms.");
  }

  const current = await getMyseedVerifyConfig();
  const updated: MyseedVerifyConfig = {
    ...current,
    ...input,
    baseUrl: (input.baseUrl ?? current.baseUrl).trim().replace(/\/+$/, ""),
    apiKey: input.apiKey !== undefined ? input.apiKey.trim() : current.apiKey,
    webhookSecret: input.webhookSecret !== undefined ? input.webhookSecret.trim() : current.webhookSecret,
  };

  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.myseed_verify', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(updated),
    nowIso(),
    user.id
  );

  await audit(
    { actor: user },
    {
      action: "settings.myseed_verify",
      summary: `${user.name} updated Myseed Verify configuration (${updated.environment}, enabled=${updated.enabled})`,
    }
  );

  return updated;
}

export async function testMyseedVerifyConnection(): Promise<{
  ok: boolean;
  message: string;
  ms: number;
  environment?: string;
  status: "connected" | "error";
}> {
  const config = await getMyseedVerifyConfig();
  if (!config.baseUrl) {
    return { ok: false, message: "Base URL is not configured.", ms: 0, status: "error" };
  }
  if (!config.apiKey) {
    return { ok: false, message: "API Key is required to connect.", ms: 0, status: "error" };
  }

  const start = Date.now();
  try {
    const res = await fetch(`${config.baseUrl}/v1/health`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    const ms = Date.now() - start;
    if (res.ok || res.status === 200 || res.status === 204) {
      await patchVerifyStatus("connected", null);
      return { ok: true, message: `Connected to Myseed Verify (${ms}ms)`, ms, environment: config.environment, status: "connected" };
    } else if (res.status === 401 || res.status === 403) {
      const err = `Authentication failed (HTTP ${res.status}). Verify API Key.`;
      await patchVerifyStatus("error", err);
      return { ok: false, message: err, ms, status: "error" };
    } else {
      // Even if /v1/health isn't ready on draft mock, checking root or ping
      const text = await res.text();
      const msg = `Host replied with HTTP ${res.status}: ${text.slice(0, 100)}`;
      await patchVerifyStatus("error", msg);
      return { ok: false, message: msg, ms, status: "error" };
    }
  } catch (err: any) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : "Network error connecting to verify platform.";
    await patchVerifyStatus("error", msg);
    return { ok: false, message: msg, ms, status: "error" };
  }
}

async function patchVerifyStatus(status: "connected" | "error", lastError: string | null) {
  try {
    const current = await getMyseedVerifyConfig();
    const updated = {
      ...current,
      status,
      lastTestedAt: nowIso(),
      lastError,
    };
    await run(
      "UPDATE settings SET value = ?, updated_at = ? WHERE key = 'cfg.myseed_verify'",
      JSON.stringify(updated),
      nowIso()
    );
  } catch {}
}

export async function createVerifyPaymentRequest(
  input: CreatePaymentRequestInput
): Promise<VerifyPaymentRequestResponse> {
  const config = await getMyseedVerifyConfig();
  if (!config.enabled) {
    throw new WorkflowError("REQUIREMENTS_MISSING", "Myseed Verify platform integration is currently disabled.");
  }
  if (!config.baseUrl || !config.apiKey) {
    throw new WorkflowError("REQUIREMENTS_MISSING", "Myseed Verify credentials or base URL are missing.");
  }

  const idempotencyKey = input.idempotencyKey || `req_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const payload = {
    external_reference: input.externalReference,
    currency: input.currency || "ETB",
    items: input.items.map((item) => ({
      title: item.title,
      minor_amount: item.minorAmount,
      quantity: item.quantity || 1,
      category: item.category,
      reference: item.reference,
    })),
    metadata: input.metadata || {},
    expires_in_minutes: input.expiresInMinutes || 120,
  };

  const res = await fetch(`${config.baseUrl}/v1/payment-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new WorkflowError(
      "VALIDATION",
      `Myseed Verify returned HTTP ${res.status}: ${errorBody.slice(0, 300)}`
    );
  }

  const data = await res.json();
  return {
    id: data.id,
    status: data.status || "pending",
    externalReference: data.external_reference || input.externalReference,
    currency: data.currency || "ETB",
    totalMinorAmount: data.total_minor_amount || "0",
    submissionToken: data.submission_token || "",
    submissionUrl: data.submission_url,
    expiresAt: data.expires_at || "",
    createdAt: data.created_at || nowIso(),
  };
}

export async function getVerifyPaymentRequest(requestId: string): Promise<any> {
  const config = await getMyseedVerifyConfig();
  if (!config.apiKey || !config.baseUrl) {
    throw new WorkflowError("REQUIREMENTS_MISSING", "Myseed Verify credentials missing.");
  }

  const res = await fetch(`${config.baseUrl}/v1/payment-requests/${encodeURIComponent(requestId)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new WorkflowError("NOT_FOUND", `Payment request not found on verify platform (HTTP ${res.status})`);
  }

  return await res.json();
}

export async function reportVerifyFulfillment(
  requestId: string,
  allocationId: string,
  action: string,
  details: { status: "fulfilled" | "failed"; note?: string; revision: number }
): Promise<any> {
  const config = await getMyseedVerifyConfig();
  if (!config.apiKey || !config.baseUrl) {
    throw new WorkflowError("REQUIREMENTS_MISSING", "Myseed Verify credentials missing.");
  }

  const res = await fetch(
    `${config.baseUrl}/v1/payment-requests/${encodeURIComponent(requestId)}/allocations/${encodeURIComponent(
      allocationId
    )}/fulfillment/${encodeURIComponent(action)}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(details),
      signal: AbortSignal.timeout(10_000),
    }
  );

  if (!res.ok) {
    throw new WorkflowError("VALIDATION", `Failed to report fulfillment to verify platform (HTTP ${res.status})`);
  }

  return await res.json();
}

/**
 * Validates the HMAC SHA-256 signature from the verification webhook.
 * Specification: X-Verify-Timestamp + '.' + rawBody bytes signed with secret.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
  clockToleranceSeconds = 300
): { valid: boolean; reason?: string } {
  if (!secret) return { valid: false, reason: "Webhook secret is not configured" };
  if (!timestampHeader || !signatureHeader) return { valid: false, reason: "Missing timestamp or signature headers" };

  const timestamp = Number(timestampHeader);
  if (isNaN(timestamp)) return { valid: false, reason: "Malformed timestamp" };

  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestamp) > clockToleranceSeconds) {
    return { valid: false, reason: `Timestamp outside tolerance window of ${clockToleranceSeconds}s` };
  }

  const payload = `${timestamp}.${typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")}`;
  const computedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    const sigBuffer = Buffer.from(signatureHeader.toLowerCase(), "utf8");
    const compBuffer = Buffer.from(computedHmac.toLowerCase(), "utf8");
    if (sigBuffer.length !== compBuffer.length) {
      return { valid: false, reason: "Signature length mismatch" };
    }
    const matched = crypto.timingSafeEqual(sigBuffer, compBuffer);
    return matched ? { valid: true } : { valid: false, reason: "Signature comparison failed" };
  } catch (err: any) {
    return { valid: false, reason: err?.message || "Crypto comparison error" };
  }
}
