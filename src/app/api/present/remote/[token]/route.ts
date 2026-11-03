import { remoteMove, remoteState } from "@/server/decks";

// The presentation remote (Phase 12c): the phone posts { move: 1 or -1 }; the deck reads { steps } and sends the slide
// it shows ({ title, position }). The token in the address is the key, and it ends after four hours.
type Ctx = { params: Promise<{ token: string }> };
const fail = (e: unknown) => Response.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 404 });

export async function GET(_r: Request, ctx: Ctx) {
  try {
    return Response.json(await remoteState((await ctx.params).token));
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request: Request, ctx: Ctx) {
  try {
    const body = (await request.json().catch(() => ({}))) as { move?: number; title?: string; position?: string };
    const token = (await ctx.params).token;
    if (body.move === 1 || body.move === -1) return Response.json(await remoteMove(token, body.move));
    return Response.json(await remoteState(token, body.title ? { title: String(body.title), position: String(body.position ?? "") } : null));
  } catch (e) {
    return fail(e);
  }
}
