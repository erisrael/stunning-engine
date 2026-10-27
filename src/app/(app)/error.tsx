"use client";

import { Button } from "@/components/ui/button";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center">
      <h2 className="text-lg font-semibold">This page could not load</h2>
      <p className="text-sm text-muted-foreground">
        Nothing was changed. Try again; if the problem continues, share the reference below with your administrator.
      </p>
      {error.digest && <code className="rounded bg-muted px-2 py-1 text-xs">Reference {error.digest}</code>}
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
