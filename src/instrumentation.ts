import type { Instrumentation } from "next";

// Runs once when the server starts. On a server that stays up (a VPS, or a paid always-on host) a timer runs the
// scheduled jobs every 10 minutes, so nothing outside is needed. Set MYSEED_TIMER=0 to switch it off (for example
// when several copies of the app run and an outside schedule calls /api/cron/checks instead).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Every request to Noor's address goes through Noor's protection (src/server/noor-gate.ts).
  (await import("./server/noor-gate")).installNoorGate();
  // The project's documentation (docs/library.json) into the Dev team's Specs and docs, once per start, so a deploy
  // brings the documents with it. MYSEED_DOCS_SYNC=0 switches it off.
  if (process.env.MYSEED_DOCS_SYNC !== "0")
    setTimeout(async () => {
      try {
        const r = await (await import("./server/doc-sync")).syncRepoDocs();
        if (r.added.length || r.updated.length || r.keptEdited.length || r.problems.length)
          console.log(`Repository documents: ${r.added.length} added, ${r.updated.length} updated, ${r.keptEdited.length} kept as edited in the app, ${r.unchanged} unchanged${r.problems.length ? `; ${r.problems.join("; ")}` : ""}`);
      } catch (e) {
        console.error("Repository documents sync failed", e);
      }
    }, 20e3).unref();
  if (process.env.MYSEED_TIMER === "0") return;
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
  const cmsTick = async () => {
    try {
      await (await import("./server/cms-tasks")).runQueuedCmsTasks();
      const { scheduledCmsSync } = await import("./server/cms-schedule");
      await scheduledCmsSync(undefined, true);
      await (await import("./server/cms-reports")).scheduledCmsReports();
      await (await import("./server/chapa-hub")).scheduledChapa();
      await (await import("./server/cms-metrics")).scheduledCmsMetrics();
      await (await import("./server/cms-fields")).scheduledCmsMirror();
    } catch (e) {
      console.error("CMS automatic refresh failed", e);
    }
  };
  setTimeout(cmsTick, 90e3).unref();
  setInterval(cmsTick, 60e3).unref();
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
