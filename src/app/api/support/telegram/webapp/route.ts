import { telegramMiniApp } from "@/server/support-channels";
import { WorkflowError } from "@/server/workflow";
import { fromThisSite } from "@/server/request-origin";

// The support app inside Telegram (Mini App) signs in: Telegram's signed data (initData) and which bot opened it.
// Answers the widget's session and the key its API calls use.
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !fromThisSite(request, origin)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { initData?: unknown; bot?: unknown };
  try {
    return Response.json(await telegramMiniApp(String(body.initData ?? ""), String(body.bot ?? "default")), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof WorkflowError ? ({ FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, INVALID_STATE: 409 } as Record<string, number>)[e.code] ?? 400 : 500;
    return Response.json({ error: e instanceof Error && status !== 500 ? e.message : "Something went wrong." }, { status });
  }
}
