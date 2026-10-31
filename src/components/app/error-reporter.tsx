"use client";

import * as React from "react";

// Sends errors that happen in the browser to Admin, System, Errors (kept in the app). The same error is sent at
// most once per page load, and at most 5 per page load.
export function ErrorReporter() {
  React.useEffect(() => {
    const sent = new Set<string>();
    const send = (message: string, stack?: string) => {
      if (!message || sent.size >= 5 || sent.has(message)) return;
      // Browser extensions and cancelled loads are not the app's errors.
      if (/ResizeObserver loop|chrome-extension:|moz-extension:|Load failed|NetworkError|Failed to fetch|AbortError/i.test(`${message} ${stack ?? ""}`)) return;
      sent.add(message);
      const body = JSON.stringify({ message: message.slice(0, 500), stack: stack?.slice(0, 4000), path: window.location.pathname });
      if (!navigator.sendBeacon?.("/api/errors", new Blob([body], { type: "application/json" })))
        fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
    };
    const onError = (e: ErrorEvent) => send(e.message, e.error instanceof Error ? e.error.stack : undefined);
    const onRejection = (e: PromiseRejectionEvent) => send(e.reason instanceof Error ? e.reason.message : String(e.reason), e.reason instanceof Error ? e.reason.stack : undefined);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
