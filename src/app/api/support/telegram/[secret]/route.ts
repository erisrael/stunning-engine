import { telegramUpdate } from "@/server/support-channels";
import { recordIncoming } from "@/server/call-monitor";

// Messages to the support Telegram bot (Telegram calls this; the secret is in the address and the header).
// Each update is kept in the callback monitor.
export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  const t0 = Date.now();
  try {
    const update = await request.json();
    const kind = update?.callback_query ? "button press" : update?.message ? "message" : "update";
    const r = await telegramUpdate((await params).secret, request.headers.get("x-telegram-bot-api-secret-token"), update);
    await recordIncoming("telegram", { ok: true, status: 200, summary: `Webhook: ${kind}`, ref: update?.update_id ? String(update.update_id) : null, ms: Date.now() - t0 });
    return Response.json(r);
  } catch (e) {
    await recordIncoming("telegram", { ok: false, status: 403, summary: "Webhook refused", error: e instanceof Error ? e.message : "Failed", ms: Date.now() - t0 });
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 403 });
  }
}
