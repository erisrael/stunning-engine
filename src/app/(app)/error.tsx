"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { isStaleBuild, reloadForNewBuild } from "@/components/app/version-watch";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // The page is from an older build (a deploy happened while it was open, typical for calls and Seed Town): load the
  // new one instead of showing an error, unless a call is on, where reloading would drop it.
  const stale = isStaleBuild(error);
  const inCall = typeof document !== "undefined" && document.documentElement.dataset.callActive === "1";
  React.useEffect(() => {
    if (stale && !inCall) reloadForNewBuild();
  }, [stale, inCall]);
  // Errors caught here never reach the page-wide reporter, so this screen sends them (server errors carry only a
  // reference; the server already recorded the details).
  React.useEffect(() => {
    if (error.digest || stale) return;
    fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: error.message, stack: error.stack, path: window.location.pathname }) }).catch(() => {});
  }, [error]);
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">{stale ? "A new version is live" : "This page could not load"}</h2>
      <p className="text-sm text-muted-foreground">
        {stale
          ? inCall
            ? "Reload after your call to carry on with the new version."
            : "Loading the new version…"
          : "Nothing was changed. Try again; if the problem continues, share the reference below with your administrator."}
      </p>
      {error.digest && <code className="rounded bg-muted px-2 py-1 text-xs">Reference {error.digest}</code>}
      <Button onClick={stale ? () => window.location.reload() : reset}>{stale ? "Reload" : "Try again"}</Button>
    </div>
  );
}
