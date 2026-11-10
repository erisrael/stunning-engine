import { NextRequest, NextResponse } from "next/server";
import { getMyseedVerifyConfig, verifyWebhookSignature, reportVerifyFulfillment } from "@/server/myseed-verify";
import { get, run, nowIso, uid } from "@/server/db";

export async function POST(req: NextRequest) {
  try {
    const config = await getMyseedVerifyConfig();
    const rawBody = await req.text();

    const timestamp = req.headers.get("x-verify-timestamp");
    const signature = req.headers.get("x-verify-signature");
    const keyId = req.headers.get("x-verify-key-id");

    if (config.webhookSecret) {
      const verification = verifyWebhookSignature(rawBody, timestamp, signature, config.webhookSecret);
      if (!verification.valid) {
        return NextResponse.json({ ok: false, error: "Invalid signature", reason: verification.reason }, { status: 401 });
      }
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ ok: false, error: "Malformed JSON payload" }, { status: 400 });
    }

    const eventId = event.id || `evt_${Date.now()}`;
    const eventType = event.type || "payment.accepted";

    // Deduplicate event processing
    const existing = await get<{ id: string }>("SELECT id FROM idempotency_keys WHERE key = ?", `verify_evt_${eventId}`);
    if (existing) {
      return NextResponse.json({ ok: true, status: "duplicate", eventId });
    }

    await run(
      "INSERT INTO idempotency_keys (key, action, result) VALUES (?, ?, ?) ON CONFLICT (key) DO NOTHING",
      `verify_evt_${eventId}`,
      eventType,
      JSON.stringify({ receivedAt: nowIso(), eventType })
    );

    // Process event types
    if (eventType === "payment.accepted") {
      const payload = event.data || event.payload || {};
      const externalRef = payload.external_reference || payload.externalReference;
      const amount = payload.amount || payload.total_minor_amount;
      const provider = payload.provider || "telebirr";
      const bankRef = payload.bank_reference || payload.reference;

      // Log verified payment into audit
      await run(
        "INSERT INTO audit_events (id, action, summary, reason, occurred_at) VALUES (?, ?, ?, ?, ?)",
        uid("aud_"),
        "payment.verified_accepted",
        `Payment accepted via Myseed Verify: ${amount ?? ""} ETB (${provider}, ref: ${bankRef || "N/A"})`,
        `External Ref: ${externalRef || "N/A"}`,
        nowIso()
      );

      // Auto-fulfillment reporting if enabled
      if (config.autoFulfill && payload.request_id && payload.allocation_id) {
        try {
          await reportVerifyFulfillment(payload.request_id, payload.allocation_id, "enrollment_activated", {
            status: "fulfilled",
            note: "Automatically fulfilled via Myseed Verify webhook",
            revision: 1,
          });
        } catch {
          // Non-blocking fulfillment ack
        }
      }
    }

    return NextResponse.json({ ok: true, received: eventId, type: eventType });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Internal server error" }, { status: 500 });
  }
}

