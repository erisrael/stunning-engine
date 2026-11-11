import { chapaWebhook } from "@/server/chapa-hub";

// Chapa calls this for each business: /api/finance/chapa/webhook/<business id>. Signed with that business's
// webhook secret; the status is then confirmed with Chapa's verify endpoint (src/server/chapa-hub.ts).
export async function POST(request: Request, ctx: { params: Promise<{ business: string }> }) {
  const { business } = await ctx.params;
  const raw = await request.text();
  if (raw.length > 200_000) return new Response("Too large", { status: 413 });
  const r = await chapaWebhook(business, raw, request.headers);
  return Response.json({ ok: r.ok, message: r.message }, { status: r.status });
}
