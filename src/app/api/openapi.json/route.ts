import { openApiDoc } from "@/server/platform";

// The app's own OpenAPI file (Admin, Platform, Developer integration): data feeds, the support SDK, operations.
// It describes the APIs only; every call still needs its key.
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const u = new URL(request.url);
  const origin = `${request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? u.host}`;
  return Response.json(await openApiDoc(origin), { headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" } });
}
