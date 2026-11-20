"use client";

import * as React from "react";
import Link from "next/link";
import { DownloadIcon, LayoutDashboardIcon, SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FunMode } from "@/components/app/fun/fun-mode";

type InstallEvent = Event & { prompt: () => Promise<void> };

// The installed Fun app: the Fun window on the whole screen, an Install button where the browser offers it, and a
// way back to Myseed.
export function FunApp({ name, on }: { name: string; on: boolean }) {
  const [install, setInstall] = React.useState<InstallEvent | null>(null);
  React.useEffect(() => {
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/fun-sw.js", { scope: "/fun" }).catch(() => {});
    const f = (e: Event) => (e.preventDefault(), setInstall(e as InstallEvent));
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);
  return (
    <div className="min-h-dvh bg-gradient-to-b from-primary/10 to-background" data-fun-app>
      <header className="mx-auto flex max-w-3xl items-center gap-2 px-3 py-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#ff7eb6] via-[#9334E6] to-[#4285F4] text-white"><SparklesIcon className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Myseed Fun</p>
          <p className="truncate text-xs text-muted-foreground">Hi {name.split(" ")[0]}</p>
        </div>
        {install && (
          <Button size="sm" variant="outline" onClick={() => void install.prompt().then(() => setInstall(null))} data-fun-install>
            <DownloadIcon /> Install
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link href="/dashboard">
            <LayoutDashboardIcon /> Myseed
          </Link>
        </Button>
      </header>
      {on ? <FunMode standalone /> : <p className="p-8 text-center text-sm text-muted-foreground">Admin has switched Fun mode off for you.</p>}
    </div>
  );
}
