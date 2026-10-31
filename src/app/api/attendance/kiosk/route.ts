import { cookies } from "next/headers";
import { WorkflowError } from "@/server/workflow";
import { KIOSK_COOKIE, kioskFromToken, kioskPing, kioskPunch, pairKiosk, type KioskPunchInput } from "@/server/attendance";

// The kiosk device: no personal account, only its own token (a cookie set from a one-time setup link).
//   GET  ?setup=<code>                 pairs this browser with the kiosk, then opens /kiosk
//   POST {action:"ping"}               heartbeat; returns the kiosk's name and its signing key
//   POST {action:"punch", badge|code+pin}
//   POST {action:"sync", items:[{clientId, at, sig, badge|code+pin}]}   check-ins kept while offline

const secure = () => process.env.NODE_ENV === "production" && process.env.MYSEED_INSECURE_COOKIES !== "1";
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("setup") ?? "";
  const token = code ? await pairKiosk(code) : null;
  if (!token) return Response.redirect(new URL("/kiosk?error=setup", url), 303);
  (await cookies()).set(KIOSK_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(), path: "/", maxAge: 5 * 365 * 864e2 });
  return Response.redirect(new URL("/kiosk", url), 303);
}

export async function POST(request: Request) {
  const kiosk = await kioskFromToken((await cookies()).get(KIOSK_COOKIE)?.value);
  if (!kiosk) return json({ error: "This device is not set up as a kiosk. Ask HR for a setup link." }, 401);
  let body: { action?: string; items?: KioskPunchInput[] } & KioskPunchInput;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Bad request" }, 400);
  }
  const fail = (err: unknown) => (err instanceof WorkflowError ? err.message : "Something went wrong. Try again.");
  try {
    if (body.action === "ping") return json(await kioskPing(kiosk));
    if (body.action === "punch") return json(await kioskPunch(kiosk, body));
    if (body.action === "sync") {
      const results = [];
      // Oldest first, so check-ins and check-outs pair in the order they happened.
      for (const item of [...(body.items ?? [])].slice(0, 500).sort((a, b) => String(a.at).localeCompare(String(b.at)))) {
        try {
          await kioskPunch(kiosk, item);
          results.push({ clientId: item.clientId, ok: true });
        } catch (err) {
          results.push({ clientId: item.clientId, ok: false, error: fail(err), final: err instanceof WorkflowError });
        }
      }
      return json({ results });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    if (err instanceof WorkflowError) return json({ error: err.message }, 422);
    console.error(err);
    return json({ error: fail(err) }, 500);
  }
}
