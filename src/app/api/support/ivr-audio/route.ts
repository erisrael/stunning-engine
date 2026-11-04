import { ivrAudio } from "@/server/support-desk";

// The recording callers hear while they wait for an agent (Support, Settings, Waiting message). Public: the widget
// plays it in the customer's browser.
export async function GET() {
  const a = await ivrAudio();
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(a.data), { headers: { "Content-Type": a.mime, "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
