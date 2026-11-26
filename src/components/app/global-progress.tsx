"use client";

// Something happens the moment you click: a bar runs along the top while a page opens or a change is saved, and if
// it takes more than a moment (a slow or lossy connection) a "Loading…" card shows too. It follows what you start
// yourself: a link, a tab, a button that saves (Next.js navigations and server actions). Background refreshes (calls,
// notifications, the live desk) do not show it, so it never flickers on its own.

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";

// A request made this soon after a click, a key or a form submit counts as yours.
const AFTER_INPUT_MS = 1500;
// Shorter waits than this show nothing (no flicker on a fast connection).
const BAR_AFTER_MS = 120;
const CARD_AFTER_MS = 600;
// Never stuck: whatever happens, it ends after this long.
const GIVE_UP_MS = 25_000;

let pending = 0;
let navigating = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const busy = () => pending > 0 || navigating;

function headerOf(init: RequestInit | undefined, input: RequestInfo | URL, name: string) {
  try {
    const h = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    return h.get(name);
  } catch {
    return null;
  }
}

export function GlobalProgress() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [, force] = React.useReducer((x: number) => x + 1, 0);
  const [phase, setPhase] = React.useState<"idle" | "bar" | "card">("idle");
  const lastInput = React.useRef(0);

  // A page change has arrived: the navigation is over.
  React.useEffect(() => {
    if (!navigating) return;
    navigating = false;
    emit();
  }, [pathname, search]);

  React.useEffect(() => {
    const l = () => force();
    listeners.add(l);
    const mark = () => (lastInput.current = Date.now());
    // A link to another page of this app: busy from the click until the page is there.
    const onClick = (e: MouseEvent) => {
      mark();
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      navigating = true;
      emit();
      // A link that only opens something on this page (its click is handled there) asks the server for nothing: stop
      // as soon as it is clear no page is on its way. A real navigation either changes the address or is fetching.
      const from = location.pathname + location.search;
      const started = Date.now();
      const check = () => {
        if (!navigating || location.pathname + location.search !== from) return;
        if (pending === 0 && Date.now() - started > 500) {
          navigating = false;
          emit();
          return;
        }
        window.setTimeout(check, 300);
      };
      window.setTimeout(check, 500);
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", mark, true);
    document.addEventListener("submit", mark, true);
    document.addEventListener("change", mark, true);
    // Back and forward: the same.
    const onPop = () => {
      navigating = true;
      emit();
    };
    window.addEventListener("popstate", onPop);

    // Saving a change (a server action) or the router fetching a page you asked for.
    const original = window.fetch;
    const patched: typeof fetch = (input, init) => {
      const action = headerOf(init, input, "next-action");
      const rsc = headerOf(init, input, "rsc");
      const prefetch = headerOf(init, input, "next-router-prefetch");
      const mine = (action || (rsc && !prefetch)) && Date.now() - lastInput.current < AFTER_INPUT_MS;
      if (!mine) return original(input, init);
      pending++;
      emit();
      const done = () => {
        pending = Math.max(0, pending - 1);
        emit();
      };
      const p = original(input, init);
      p.then(done, done);
      return p;
    };
    window.fetch = patched;
    return () => {
      listeners.delete(l);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", mark, true);
      document.removeEventListener("submit", mark, true);
      document.removeEventListener("change", mark, true);
      window.removeEventListener("popstate", onPop);
      if (window.fetch === patched) window.fetch = original;
    };
  }, []);

  const on = busy();
  React.useEffect(() => {
    if (!on) {
      setPhase("idle");
      return;
    }
    const t1 = window.setTimeout(() => setPhase("bar"), BAR_AFTER_MS);
    const t2 = window.setTimeout(() => setPhase("card"), CARD_AFTER_MS);
    const t3 = window.setTimeout(() => {
      pending = 0;
      navigating = false;
      emit();
    }, GIVE_UP_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [on]);

  if (phase === "idle") return null;
  return (
    <>
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[300] h-[3px] overflow-hidden" data-global-progress>
        <div className="global-progress-bar h-full bg-primary shadow-[0_0_8px_var(--primary)]" />
      </div>
      {phase === "card" && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-16 z-[300] flex justify-center px-4" data-global-loading>
          <div className="flex items-center gap-2.5 rounded-full border bg-background/95 px-4 py-2 text-sm font-medium shadow-lg">
            <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
            Loading…
          </div>
        </div>
      )}
    </>
  );
}
