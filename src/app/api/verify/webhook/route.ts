import { NextRequest, NextResponse } from "next/server";
import { getMyseedVerifyConfig, verifyWebhookSignature, reportVerifyFulfillment } from "@/server/myseed-verify";
import { recordIncoming } from "@/server/call-monitor";
import { get, run, nowIso, uid } from "@/server/db";

// Myseed Verify's payment webhook. Nothing is accepted unless Verify is switched on and the event carries a valid
// X-Verify-Signature made with the saved signing secret: an unsigned "payment accepted" is refused, never recorded.
export async function POST(req: NextRequest) {
  const t0 = Date.now();
  const refuse = async (status: number, error: string, reason?: string) => {
    await recordIncoming("verify", { ok: false, status, ms: Date.now() - t0, summary: "Verify webhook refused", error: reason ? `${error}: ${reason}` : error });
    return NextResponse.json({ ok: false, error, ...(reason ? { reason } : {}) }, { status });
  };
  try {
    const config = await getMyseedVerifyConfig();
    if (!config.enabled) return refuse(503, "Myseed Verify is switched off");
    if (!config.webhookSecret) return refuse(401, "No webhook signing secret is saved");
    const rawBody = await req.text();

    const timestamp = req.headers.get("x-verify-timestamp");
    const signature = req.headers.get("x-verify-signature");
    const verification = verifyWebhookSignature(rawBody, timestamp, signature, config.webhookSecret);
    if (!verification.valid) return refuse(401, "Invalid signature", verification.reason);

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return refuse(400, "Malformed JSON payload");
    }

    const eventId = event.id || `evt_${Date.now()}`;
    const eventType = event.type || "payment.accepted";

    // Deduplicate event processing
    const existing = await get<{ key: string }>("SELECT key FROM idempotency_keys WHERE key = ?", `verify_evt_${eventId}`);
    if (existing) {
      await recordIncoming("verify", { ok: true, status: 200, ms: Date.now() - t0, summary: `Verify ${eventType} (repeat)`, ref: String(eventId) });
      return NextResponse.json({ ok: true, status: "duplicate", eventId });
    }

    await run(
      "INSERT INTO idempotency_keys (key, action, result, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (key) DO NOTHING",
      `verify_evt_${eventId}`,
      eventType,
      JSON.stringify({ receivedAt: nowIso(), eventType }),
      nowIso()
    );

    if (eventType === "payment.accepted") {
      const payload = event.data || event.payload || {};
      const externalRef = payload.external_reference || payload.externalReference;
      const amount = payload.amount || payload.total_minor_amount;
      const provider = payload.provider || "telebirr";
      const bankRef = payload.bank_reference || payload.reference;

      await run(
        "INSERT INTO audit_events (id, action, summary, reason, occurred_at) VALUES (?, ?, ?, ?, ?)",
        uid("aud_"),
        "payment.verified_accepted",
        `Payment accepted via Myseed Verify: ${amount ?? ""} ETB (${provider}, ref: ${bankRef || "N/A"})`,
        `External Ref: ${externalRef || "N/A"}`,
        nowIso()
      );

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

    await recordIncoming("verify", { ok: true, status: 200, ms: Date.now() - t0, summary: `Verify ${eventType}`, ref: String(eventId) });
    return NextResponse.json({ ok: true, received: eventId, type: eventType });
  } catch (err: any) {
    return refuse(500, err?.message || "Internal server error");
  }
}
