import { getViewer, requestIp } from "@/server/auth";
import { recordError } from "@/server/ops";

// Errors in people's browsers, sent by the error reporter in the page. Kept small and limited per address, so
// nobody can fill the log.
const recent = new Map<string, number[]>();

export async function POST(request: Request) {
  const ip = (await requestIp()) ?? "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60e3);
  if (hits.length >= 10) return new Response(null, { status: 429 });
  recent.set(ip, [...hits, now]);
  if (recent.size > 5000) recent.clear();
  const text = await request.text();
  if (text.length > 12_000) return new Response(null, { status: 413 });
  let body: { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (typeof body.message !== "string" || !body.message.trim()) return new Response(null, { status: 400 });
  const viewer = await getViewer();
  await recordError({
    source: "browser",
    message: body.message,
    stack: typeof body.stack === "string" ? body.stack : undefined,
    path: typeof body.path === "string" ? body.path : null,
    digest: typeof body.digest === "string" ? body.digest.slice(0, 40) : null,
    userId: viewer?.id ?? null,
  });
  return new Response(null, { status: 204 });
}
