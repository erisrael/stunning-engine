import type { Instrumentation } from "next";

// Runs once when the server starts. On a server that stays up (a VPS, or a paid always-on host) a timer runs the
// scheduled jobs every 10 minutes, so nothing outside is needed. Set MYSEED_TIMER=0 to switch it off (for example
// when several copies of the app run and an outside schedule calls /api/cron/checks instead).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.MYSEED_TIMER === "0") return;
  const tick = async () => {
    try {
      const { runScheduledChecks } = await import("./server/jobs");
      await runScheduledChecks(undefined, { trigger: "timer" });
    } catch (e) {
      console.error("Scheduled jobs (timer) failed", e);
    }
  };
  setTimeout(tick, 60e3).unref();
  setInterval(tick, 10 * 60e3).unref();
}

// Errors on the server are kept in the app (Admin, System, Errors), with no outside service.
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const e = err as Error & { digest?: string };
  // Redirects and "not found" travel as errors inside Next.js; they are not failures.
  if (typeof e?.digest === "string" && /^NEXT_(REDIRECT|NOT_FOUND|HTTP_ERROR_FALLBACK)/.test(e.digest)) return;
  const { recordError } = await import("./server/ops");
  await recordError({ source: "server", message: e?.message ?? String(err), stack: e?.stack, path: request.path, route: `${context.routeType} ${context.routePath}`, digest: e?.digest ?? null });
};
