import { NextResponse } from "next/server";
import { requireViewer } from "@/server/auth";
import { sync } from "@/server/fun-world";

// Seed Town's live room: a few numbers in, everyone else's few numbers out, several times a second.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const viewer = await requireViewer();
    const body = (await req.json().catch(() => ({}))) as { x?: number; z?: number; ry?: number; mv?: number; say?: string; emote?: string };
    return NextResponse.json(await sync(viewer, body), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
