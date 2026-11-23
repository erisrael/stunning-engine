"use client";

// After a deploy, a page that stays open (the support desk, a chat, the Telegram Mini App) still holds the old build:
// its Server Actions no longer exist on the server and fail ("Failed to find Server Action"), so messages do not send
// and lists stop updating. This watches for that: every minute (and when the tab comes back) it asks /api/health for
// the live deployment ID, and when it differs from the page's own (data-dpl-id) it reloads: at once when nothing is
// being typed, otherwise after asking. A Server Action refused for the same reason reloads too.
import * as React from "react";
import { toast } from "sonner";

const typing = () => {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) return false;
  if (el.isContentEditable) return true;
  return (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["button", "checkbox", "radio", "submit"].includes(el.type))) && !!el.value;
};
const inCall = () => document.documentElement.dataset.callActive === "1";

// What a page from an older build sees: the browser's own wording for a Server Action the new build does not have
// (UnrecognizedActionError, "was not found on the server"), the server's ("Failed to find Server Action"), or a code
// file of the old build that is gone (ChunkLoadError). Calls and Seed Town poll the server, so they hit it first.
export const STALE_BUILD = /UnrecognizedActionError|was not found on the server|Failed to find Server Action|older or newer deployment|ChunkLoadError|Loading chunk [\w-]+ failed|Failed to load chunk|error loading dynamically imported module/i;
export const isStaleBuild = (e: unknown) => {
  const err = e as { name?: string; message?: string } | null;
  return STALE_BUILD.test(`${err?.name ?? ""} ${err?.message ?? String(e ?? "")}`);
};

// Reload into the new build, at most once a minute (a reload that still fails shows the error instead of looping).
export function reloadForNewBuild(): boolean {
  try {
    const last = Number(sessionStorage.getItem("myseed.reloadedForBuild") ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem("myseed.reloadedForBuild", String(Date.now()));
  } catch {}
  window.location.reload();
  return true;
}

export function VersionWatch() {
  React.useEffect(() => {
    const mine = document.documentElement.dataset.dplId;
    let asked = false;
    const reload = (why: string) => {
      if (!typing() && !inCall() && reloadForNewBuild()) return;
      if (asked) return;
      asked = true;
      toast.info(why, { duration: Infinity, action: { label: "Reload", onClick: () => window.location.reload() } });
    };
    const check = async () => {
      if (!mine || document.hidden) return;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const v = r.ok ? ((await r.json()) as { v?: string | null }).v : null;
        if (v && v !== mine) {
          behind = true;
          reload("A new version is live. Reload to keep sending and receiving.");
        }
      } catch {
        // offline: try again later
      }
    };
    const stale = (e: PromiseRejectionEvent | ErrorEvent) => {
      const err = (e as PromiseRejectionEvent).reason ?? (e as ErrorEvent).error ?? { message: (e as ErrorEvent).message };
      if (isStaleBuild(err)) {
        e.preventDefault?.();
        reload("This page is from an older version. Reload to continue.");
      }
    };
    // A new build is live: the next link followed loads the page in full (the new build), not inside the old one.
    let behind = false;
    const onClick = (e: MouseEvent) => {
      if (!behind || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.origin !== window.location.origin) return;
      if (inCall()) return;
      e.preventDefault();
      window.location.assign(a.href);
    };
    document.addEventListener("click", onClick, true);
    const t = window.setInterval(check, 60_000);
    const onVisible = () => !document.hidden && void check();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("unhandledrejection", stale);
    window.addEventListener("error", stale);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("unhandledrejection", stale);
      window.removeEventListener("error", stale);
      document.removeEventListener("click", onClick, true);
    };
  }, []);
  return null;
}
