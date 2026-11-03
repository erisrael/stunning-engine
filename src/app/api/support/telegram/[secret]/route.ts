import { telegramUpdate } from "@/server/support-channels";

// Messages to the support Telegram bot (Telegram calls this; the secret is in the address and the header).
export async function POST(request: Request, { params }: { params: Promise<{ secret: string }> }) {
  try {
    const update = await request.json();
    return Response.json(await telegramUpdate((await params).secret, request.headers.get("x-telegram-bot-api-secret-token"), update));
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 403 });
  }
}
