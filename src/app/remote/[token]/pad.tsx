"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

export function RemotePad({ token }: { token: string }) {
  const [s, setS] = React.useState<{ title: string | null; position: string | null } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const call = React.useCallback(
    async (body?: unknown) => {
      const r = await fetch(`/api/present/remote/${token}`, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
      const j = (await r.json()) as { title: string | null; position: string | null; error?: string };
      if (!r.ok) return setError(j.error ?? "This remote has ended.");
      setS(j);
    },
    [token],
  );
  React.useEffect(() => {
    void call();
    const t = window.setInterval(() => void call(), 2000);
    return () => window.clearInterval(t);
  }, [call]);
  if (error) return <p className="p-8 text-center text-muted-foreground">{error}</p>;
  const move = (d: number) => {
    navigator.vibrate?.(20);
    void call({ move: d });
  };
  return (
    <div className="flex h-dvh flex-col gap-4 bg-background p-4" data-remote>
      <div className="text-center">
        <p className="text-sm text-muted-foreground">{s?.position ?? ""}</p>
        <p className="text-lg font-semibold">{s?.title ?? "Waiting for the presentation"}</p>
      </div>
      <button type="button" className="flex flex-1 items-center justify-center rounded-2xl bg-primary text-3xl font-semibold text-primary-foreground active:opacity-80" onClick={() => move(1)} data-remote-next>
        Next <ChevronRightIcon className="size-10" />
      </button>
      <button type="button" className="flex h-24 items-center justify-center rounded-2xl border text-xl active:bg-muted" onClick={() => move(-1)} data-remote-prev>
        <ChevronLeftIcon className="size-8" /> Previous
      </button>
    </div>
  );
}
