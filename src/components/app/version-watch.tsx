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

export function VersionWatch() {
  React.useEffect(() => {
    const mine = document.documentElement.dataset.dplId;
    let asked = false;
    const reload = (why: string) => {
      if (!typing() && !inCall()) return window.location.reload();
      if (asked) return;
      asked = true;
      toast.info(why, { duration: Infinity, action: { label: "Reload", onClick: () => window.location.reload() } });
    };
    const check = async () => {
      if (!mine || document.hidden) return;
      try {
        const r = await fetch("/api/health", { cache: "no-store" });
        const v = r.ok ? ((await r.json()) as { v?: string | null }).v : null;
        if (v && v !== mine) reload("A new version is live. Reload to keep sending and receiving.");
      } catch {
        // offline: try again later
      }
    };
    const stale = (e: PromiseRejectionEvent | ErrorEvent) => {
      const m = String((e as PromiseRejectionEvent).reason?.message ?? (e as ErrorEvent).message ?? "");
      if (/Failed to find Server Action|older or newer deployment/i.test(m)) reload("This page is from an older version. Reload to continue.");
    };
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
    };
  }, []);
  return null;
}
