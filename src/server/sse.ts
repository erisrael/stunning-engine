// Server-sent events: a stream that sends a JSON state whenever it changes (checked every second), a comment every
// 15 seconds to keep proxies from closing it, and ends after a few minutes (browsers reconnect by themselves).
export function sseResponse(request: Request, tick: () => Promise<unknown>, opts: { intervalMs?: number; maxMs?: number } = {}) {
  const interval = opts.intervalMs ?? 1000;
  const maxMs = opts.maxMs ?? 5 * 60_000;
  const enc = new TextEncoder();
  let stopped = false;
  request.signal.addEventListener("abort", () => (stopped = true));
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (s: string) => {
        if (!stopped) ctrl.enqueue(enc.encode(s));
      };
      const t0 = Date.now();
      let last = "";
      let lastSend = Date.now();
      send("retry: 2000\n\n");
      while (!stopped && Date.now() - t0 < maxMs) {
        try {
          const v = JSON.stringify(await tick());
          if (v !== last) {
            last = v;
            send(`data: ${v}\n\n`);
            lastSend = Date.now();
          } else if (Date.now() - lastSend > 15_000) {
            send(": ping\n\n");
            lastSend = Date.now();
          }
        } catch (e) {
          send(`event: failed\ndata: ${JSON.stringify({ error: e instanceof Error ? e.message : "Failed" })}\n\n`);
          break;
        }
        await new Promise((r) => setTimeout(r, interval));
      }
      try {
        ctrl.close();
      } catch {
        // already closed
      }
    },
    cancel() {
      stopped = true;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
