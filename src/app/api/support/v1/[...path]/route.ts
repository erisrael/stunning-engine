import * as sd from "@/server/support-desk";
import { WorkflowError } from "@/server/workflow";

// The customer API of customer support (docs/SUPPORT-SDK.md), used by the SDK widget and by apps directly.
//   X-App-Key: <the app's public key>          every request
//   Authorization: Bearer <customer token>      every request after identify
//
//   POST identify                     { id?, name?, email?, phone?, hash?, meta? }  -> { token, customer, app, online, ... }
//   GET  tickets                      the customer's conversations
//   POST tickets                      { subject?, message, priority? }              -> { id }
//   GET  tickets/<id>/messages        ?since=<iso>                                  -> { ticket, messages }
//   POST tickets/<id>/messages        { body }
//   POST tickets/<id>/rating          { rating: 1..5, comment? }
//   GET  articles?q=                  help articles matching the words (the knowledge base)
//   GET  articles/<id>                one article; POST articles/<id>/vote { helpful: true|false }
//   GET  ice                          STUN and TURN servers for a call
//   POST calls                        { ticketId?, offer, consent }                 -> { callId, ticketId }
//   GET  calls/<id>                   -> { status, answer, ice, agent }
//   POST calls/<id>/ice               { candidate }
//   POST calls/<id>/end
// Browsers may call it from the app's allowed web addresses (Admin, Support setup, Apps); apps' servers and mobile
// apps send no Origin and are not limited by it.

type Ctx = { params: Promise<{ path: string[] }> };

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-App-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: cors(request.headers.get("origin")) });
}

async function handle(request: Request, ctx: Ctx, method: "GET" | "POST") {
  const origin = request.headers.get("origin");
  const headers = cors(origin);
  const path = (await ctx.params).path;
  try {
    // Pages served by this app itself (the widget) are always allowed.
    const self = origin && new URL(request.url).origin === origin;
    const app = await sd.appByKey(request.headers.get("x-app-key") ?? new URL(request.url).searchParams.get("key"), self ? null : origin);
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const body = method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const [a, id, b] = path;
    let out: unknown;
    if (method === "POST" && a === "identify") out = await sd.identify(app, body as Parameters<typeof sd.identify>[1]);
    else if (a === "tickets" && !id && method === "GET") out = await sd.customerTickets(app, token);
    else if (a === "tickets" && !id && method === "POST") out = { id: await sd.customerCreateTicket(app, token, { subject: s(body.subject), message: s(body.message), priority: s(body.priority) as sd.Priority }) };
    else if (a === "tickets" && id && b === "messages" && method === "GET") out = await sd.customerMessages(app, token, id, new URL(request.url).searchParams.get("since"));
    else if (a === "tickets" && id && b === "messages" && method === "POST") out = (await sd.customerReply(app, token, id, s(body.body)), { ok: true });
    else if (a === "tickets" && id && b === "rating" && method === "POST") out = (await sd.customerRate(app, token, id, Number(body.rating), s(body.comment)), { ok: true });
    else if (a === "articles" && !id && method === "GET") out = await (await import("@/server/support-channels")).searchArticles(new URL(request.url).searchParams.get("q") ?? "");
    else if (a === "articles" && id && !b && method === "GET") out = await (await import("@/server/support-channels")).readArticle(id);
    else if (a === "articles" && id && b === "vote" && method === "POST") out = (await (await import("@/server/support-channels")).voteArticle(id, body.helpful === true), { ok: true });
    else if (a === "ice" && method === "GET") out = (await sd.customerByToken(app, token), await sd.iceConfig());
    else if (a === "calls" && !id && method === "POST") out = await sd.customerStartCall(app, token, { ticketId: s(body.ticketId) || null, offer: s(body.offer), consent: body.consent === true });
    else if (a === "calls" && id && !b && method === "GET") out = await sd.customerPollCall(app, token, id);
    else if (a === "calls" && id && b === "ice" && method === "POST") out = (await sd.customerIce(app, token, id, body.candidate), { ok: true });
    else if (a === "calls" && id && b === "end" && method === "POST") out = (await sd.customerEndCall(app, token, id), { ok: true });
    else return Response.json({ error: "Unknown request." }, { status: 404, headers });
    return Response.json(out ?? { ok: true }, { headers });
  } catch (e) {
    const status = e instanceof WorkflowError ? ({ FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, INVALID_STATE: 409 } as Record<string, number>)[e.code] ?? 400 : 500;
    if (status === 500) console.error("support api", e);
    return Response.json({ error: e instanceof Error && status !== 500 ? e.message : "Something went wrong." }, { status, headers });
  }
}

export const GET = (r: Request, c: Ctx) => handle(r, c, "GET");
export const POST = (r: Request, c: Ctx) => handle(r, c, "POST");
