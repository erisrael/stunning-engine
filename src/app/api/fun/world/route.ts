import { NextResponse } from "next/server";
import { getViewerFast } from "@/server/auth";
import { sync, type SyncInput } from "@/server/fun-world";

// Seed Town's live room: a few numbers in (and chat, voice introductions), everyone else's few numbers out, several
// times a second.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const viewer = await getViewerFast();
    if (!viewer) return NextResponse.json({ error: "Sign in again." }, { status: 401 });
    // Voice introductions can be a few kilobytes; anything bigger is not a town update.
    const text = await req.text();
    if (text.length > 200_000) return NextResponse.json({ error: "Too big." }, { status: 413 });
    const body = (JSON.parse(text || "{}") ?? {}) as SyncInput;
    return NextResponse.json(await sync(viewer, body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
