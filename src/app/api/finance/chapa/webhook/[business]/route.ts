import { chapaWebhook } from "@/server/chapa-hub";
import { recordIncoming } from "@/server/call-monitor";

// Chapa calls this for each business: /api/finance/chapa/webhook/<business id>. Signed with that business's
// webhook secret; the status is then confirmed with Chapa's verify endpoint (src/server/chapa-hub.ts). Each call
// is kept in the callback monitor.
export async function POST(request: Request, ctx: { params: Promise<{ business: string }> }) {
  const t0 = Date.now();
  const { business } = await ctx.params;
  const raw = await request.text();
  if (raw.length > 200_000) {
    await recordIncoming("chapa", { ok: false, status: 413, summary: `Webhook for ${business}: too large`, error: "Too large" });
    return new Response("Too large", { status: 413 });
  }
  const r = await chapaWebhook(business, raw, request.headers);
  let ref: string | null = null;
  try {
    const j = JSON.parse(raw) as { tx_ref?: string; trx_ref?: string };
    ref = j.tx_ref ?? j.trx_ref ?? null;
  } catch {
    ref = null;
  }
  await recordIncoming("chapa", { ok: r.ok, status: r.status, summary: `Webhook for ${business}${r.message ? `: ${r.message}` : ""}`, error: r.ok ? null : r.message, ref, ms: Date.now() - t0 });
  return Response.json({ ok: r.ok, message: r.message }, { status: r.status });
}
