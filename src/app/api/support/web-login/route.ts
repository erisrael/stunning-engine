import { webAppLoginInfo, webAppSignIn } from "@/server/support-channels";
import { WorkflowError } from "@/server/workflow";
import { fromThisSite } from "@/server/request-origin";

// The support app on the web (/support-app): which sign-ins it offers, and signing in with Telegram's Login Widget
// or as a guest with a phone number. Answers the widget's session and the key its API calls use.
export async function GET() {
  return Response.json(await webAppLoginInfo(), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !fromThisSite(request, origin)) return Response.json({ error: "Not allowed." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as { telegram?: Record<string, unknown>; guest?: { device?: unknown; name?: unknown; phone?: unknown } };
  try {
    return Response.json(await webAppSignIn({ telegram: body.telegram ?? null, guest: body.guest ?? null }), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    const status = e instanceof WorkflowError ? ({ FORBIDDEN: 403, NOT_FOUND: 404, VALIDATION: 400, INVALID_STATE: 409 } as Record<string, number>)[e.code] ?? 400 : 500;
    return Response.json({ error: e instanceof Error && status !== 500 ? e.message : "Something went wrong." }, { status });
  }
}
