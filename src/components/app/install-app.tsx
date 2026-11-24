"use client";

// Install the app (Add to Home Screen) on phones and tablets. Android and Chrome: the system's own install dialog
// (beforeinstallprompt). iPhone and iPad: the steps in Safari's Share menu, since iOS has no install button for sites.
// A small glass card offers it once on touch devices; "Not now" hides it for two weeks. It is always under Tools.
// Nothing shows inside the installed app.

import * as React from "react";
import { DownloadIcon, PlusSquareIcon, ShareIcon, XIcon } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const SNOOZE_KEY = "myseed.install.snoozed";
const SNOOZE_MS = 14 * 24 * 3600 * 1000;

// One shared state for the card and the Tools tile.
let deferred: PromptEvent | null = null;
let installed = false;
let iosSteps = false;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

function standalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || window.matchMedia("(display-mode: fullscreen)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true || /MyseedOpsAndroid\//.test(navigator.userAgent);
}
function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as PromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

/** What can be done here: "prompt" (system dialog), "ios" (show the Share steps), or null (installed or not possible). */
export function useInstall() {
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    subs.add(force);
    setReady(true);
    return () => void subs.delete(force);
  }, []);
  const mode: "prompt" | "ios" | null = !ready || installed || standalone() ? null : deferred ? "prompt" : isIos() ? "ios" : null;
  const install = React.useCallback(async () => {
    if (deferred) {
      const d = deferred;
      deferred = null;
      await d.prompt().catch(() => {});
      const choice = await d.userChoice.catch(() => null);
      if (choice?.outcome === "accepted") installed = true;
      emit();
    } else if (isIos()) {
      iosSteps = true;
      emit();
    }
  }, []);
  return { mode, install };
}

function snoozed() {
  try {
    return Date.now() - Number(localStorage.getItem(SNOOZE_KEY) || 0) < SNOOZE_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt({ name }: { name: string }) {
  const { mode, install } = useInstall();
  const [card, setCard] = React.useState(false);
  const [, force] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    subs.add(force);
    return () => void subs.delete(force);
  }, []);
  // Mark the installed app on <html>, so styles can tell (html.pwa).
  React.useEffect(() => {
    document.documentElement.classList.toggle("pwa", standalone());
  }, []);
  // Offer it once on touch screens, a moment after the page opens.
  React.useEffect(() => {
    if (!mode || snoozed() || navigator.webdriver || !window.matchMedia("(pointer: coarse)").matches) return;
    const t = window.setTimeout(() => setCard(true), 4000);
    return () => window.clearTimeout(t);
  }, [mode]);
  const snooze = () => {
    setCard(false);
    try {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    } catch {}
  };
  const closeSteps = () => {
    iosSteps = false;
    emit();
  };

  return (
    <>
      {card && mode && (
        <div
          role="dialog"
          aria-label={`Install ${name}`}
          data-install-card
          className="glass glass-strong no-print fixed inset-x-3 bottom-[calc(var(--tabbar-space)+0.5rem)] z-[45] mx-auto flex max-w-md items-center gap-3 rounded-[1.6rem] p-3 pl-3.5 animate-in fade-in slide-in-from-bottom-4 lg:hidden"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/branding/app-icon?size=96" alt="" className="size-11 shrink-0 rounded-[0.7rem] shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold">Install {name}</p>
            <p className="text-[13px] leading-snug text-[var(--ios-label-2)]">Opens full screen from your home screen, with notifications.</p>
          </div>
          <button type="button" onClick={() => (setCard(false), void install())} className="h-9 shrink-0 rounded-full bg-primary px-4 text-[15px] font-semibold text-primary-foreground active:opacity-80" data-install-go>
            {mode === "ios" ? "How" : "Install"}
          </button>
          <button type="button" onClick={snooze} aria-label="Not now" className="-mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-[var(--ios-label-2)] active:bg-black/5">
            <XIcon className="size-4" />
          </button>
        </div>
      )}
      <Sheet open={iosSteps} onOpenChange={(o) => !o && closeSteps()}>
        <SheetContent side="bottom" className="glass glass-strong mx-auto max-w-lg rounded-t-[1.75rem] border-0 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-install-steps>
          <div className="mx-auto mt-2 h-1.5 w-9 rounded-full bg-foreground/20" aria-hidden />
          <SheetHeader className="items-center pb-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/branding/app-icon?size=192" alt="" className="mb-1 size-16 rounded-[1rem] shadow-md" />
            <SheetTitle className="text-[20px]">Add {name} to your Home Screen</SheetTitle>
            <SheetDescription>It opens full screen like an app and can show notifications.</SheetDescription>
          </SheetHeader>
          <ol className="mx-4 divide-y divide-[var(--glass-ring)] overflow-hidden rounded-2xl bg-background/60 text-[15px]">
            <Step n={1} icon={<ShareIcon className="size-5 text-[#007aff]" />}>
              Tap <b>Share</b> in Safari&apos;s toolbar (on iPhone it may be under <b>•••</b>).
            </Step>
            <Step n={2} icon={<PlusSquareIcon className="size-5" />}>
              Scroll and choose <b>Add to Home Screen</b>.
            </Step>
            <Step n={3} icon={<DownloadIcon className="size-5" />}>
              Leave <b>Open as Web App</b> on and tap <b>Add</b>.
            </Step>
          </ol>
          <button type="button" onClick={closeSteps} className="mx-4 mt-2 h-12 rounded-2xl bg-primary text-[17px] font-semibold text-primary-foreground active:opacity-80">
            Done
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Step({ n, icon, children }: { n: number; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3")}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted" aria-hidden>
        {icon}
      </span>
      <span className="sr-only">Step {n}: </span>
      <span>{children}</span>
    </li>
  );
}
