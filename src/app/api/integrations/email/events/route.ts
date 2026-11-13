import { handleEmailEvent } from "@/server/email-health";

// Bounce and complaint events from the email relay (Resend or Brevo): /api/integrations/email/events?t=<token>.
export async function POST(request: Request) {
  let payload: unknown = null;
  try {
    payload = JSON.parse((await request.text()).slice(0, 200_000));
  } catch {
    payload = null;
  }
  const r = await handleEmailEvent(new URL(request.url).searchParams.get("t"), payload);
  return Response.json(r, { status: r.status });
}
