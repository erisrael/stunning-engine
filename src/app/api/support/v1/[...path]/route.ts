import * as sd from "@/server/support-desk";
import { WorkflowError } from "@/server/workflow";
import { sseResponse } from "@/server/sse";

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
//   POST customers/sync             server to server, X-App-Secret: <app secret>  { customers: [{ id, name, email?, phone?, meta? }] }
//   GET  tickets/<id>/live            server-sent events: { stamp, status, typing, read, online } (token may be ?token=)
//   POST tickets/<id>/typing | read   the customer is typing / has read the conversation
//   GET  tickets/<id>/files           the conversation's files; POST { name, mime, data (base64) } sends one (10 MB)
//   GET  files/<id>                   one file (token may be ?token=)
//   GET  ping                         checks the key and the setup                 -> { ok, app, checks, time }
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
    // EventSource and file links cannot send headers: the token may come in the address (?token=).
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("token") || "";
    const [a0, id0, b0] = path;
    // Live stream of a conversation (new messages, the agent typing, read, online).
    if (method === "GET" && a0 === "tickets" && id0 && b0 === "live") {
      await sd.customerLive(app, token, id0);
      return new Response(sseResponse(request, () => sd.customerLive(app, token, id0)).body, { headers: { ...headers, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
    }
    // A file of the customer's conversation.
    if (method === "GET" && a0 === "files" && id0) {
      const file = await sd.customerFile(app, token, id0);
      const inline = /^(image\/(png|jpe?g|gif|webp)|audio\/|application\/pdf)/.test(file.mime);
      return new Response(new Uint8Array(file.data), { headers: { ...headers, "Content-Type": inline ? file.mime : "application/octet-stream", "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(file.name)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const body = method === "POST" ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : {};
    const s = (v: unknown) => (typeof v === "string" ? v : "");
    const [a, id, b] = path;
    let out: unknown;
    if (a === "ping" && method === "GET") {
      // For developers: is the key right, and is support ready for this app? No customer token needed.
      out = { ok: true, app: app.name, time: new Date().toISOString(), checks: await sd.appChecks({ id: app.id, name: app.name, active: !!app.active, origins: JSON.parse(app.origins || "[]"), queueId: app.queue_id, verifyIdentity: !!app.verify_identity }) };
    } else if (method === "POST" && a === "identify") out = await sd.identify(app, body as Parameters<typeof sd.identify>[1]);
    else if (a === "customers" && id === "sync" && method === "POST") out = await (await import("@/server/connected-systems")).syncCustomers(app.public_key, request.headers.get("x-app-secret"), body.customers);
    else if (a === "tickets" && !id && method === "GET") out = await sd.customerTickets(app, token);
    else if (a === "tickets" && !id && method === "POST") out = { id: await sd.customerCreateTicket(app, token, { subject: s(body.subject), message: s(body.message), priority: s(body.priority) as sd.Priority }) };
    else if (a === "tickets" && id && b === "messages" && method === "GET") out = await sd.customerMessages(app, token, id, new URL(request.url).searchParams.get("since"));
    else if (a === "tickets" && id && b === "messages" && method === "POST") out = (await sd.customerReply(app, token, id, s(body.body)), { ok: true });
    else if (a === "tickets" && id && b === "typing" && method === "POST") out = (await sd.customerTyping(app, token, id), { ok: true });
    else if (a === "tickets" && id && b === "read" && method === "POST") out = (await sd.customerRead(app, token, id), { ok: true });
    else if (a === "tickets" && id && b === "files" && method === "GET") out = await sd.customerFiles(app, token, id);
    else if (a === "tickets" && id && b === "files" && method === "POST") out = await sd.customerUpload(app, token, id, { name: s(body.name), mime: s(body.mime), data: s(body.data) });
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

// Counted in Admin, Platform, API usage.
const count = (r: Request, c: Ctx, m: "GET" | "POST") => import("@/server/platform").then((p) => p.tracked("support-sdk", () => handle(r, c, m)));
export const GET = (r: Request, c: Ctx) => count(r, c, "GET");
export const POST = (r: Request, c: Ctx) => count(r, c, "POST");
