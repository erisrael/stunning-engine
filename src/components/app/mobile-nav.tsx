"use client";

// Phones and tablets: a floating Liquid Glass tab bar like an iPhone app (Home, Work, Chat, Tools, More), and on
// phones a compact view that leaves out the long explanations and the extra table columns. Tools opens the everyday
// tools in one sheet: alerts, check-in, search, the assistant, approvals, routines, help, Settings and Install app.
// The Details switch in the top bar shows everything again; the choice stays on the phone. The bar steps aside while
// the keyboard is open, and inside a chat (glass.css).

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  BriefcaseIcon,
  CheckCheckIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  HelpCircleIcon,
  HomeIcon,
  LayoutGridIcon,
  MenuIcon,
  MessageCircleIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  ZapIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { InstallPrompt, useInstall } from "./install-app";

const KEY = "myseed.mobile.details";

// The keyboard is open when the visible part of the page is much shorter than the window; the visible height is kept
// in --vvh so pages like Chat can keep their message box right above the keyboard.
function useViewport() {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const el = document.documentElement;
    const on = () => {
      const open = vv.height < window.innerHeight * 0.8 && window.innerWidth < 1024;
      el.classList.toggle("kb-open", open);
      el.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // iOS scrolls the page up under the keyboard; keep the top at the top.
      if (open && el.classList.contains("in-chat")) window.scrollTo(0, 0);
    };
    on();
    // iPhone and iPad Safari ignore the viewport's no-zoom: stop the pinch gesture itself (phones and tablets).
    const noPinch = (e: Event) => window.innerWidth < 1024 && e.preventDefault();
    document.addEventListener("gesturestart", noPinch);
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      document.removeEventListener("gesturestart", noPinch);
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
}

const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));

// Liquid Glass refraction (Chromium only; Safari and Firefox keep the frosted glass): an SVG displacement map the
// size of the bar bends what is behind it near the rounded edges, as a lens would. Not in Lite mode or with Reduce
// Transparency.
function refractionMap(w: number, h: number) {
  const r = h / 2;
  const edge = Math.min(w, h) * 0.08;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="r" x1="100%" y1="0%" x2="0%" y2="0%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#f00"/></linearGradient><linearGradient id="b" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="#000"/><stop offset="100%" stop-color="#00f"/></linearGradient></defs><rect width="${w}" height="${h}" fill="#000"/><rect width="${w}" height="${h}" rx="${r}" fill="url(#r)"/><rect width="${w}" height="${h}" rx="${r}" fill="url(#b)" style="mix-blend-mode:difference"/><rect x="${edge}" y="${edge}" width="${w - 2 * edge}" height="${h - 2 * edge}" rx="${r - edge}" fill="hsl(0 0% 50% / 0.94)" style="filter:blur(9px)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function useRefraction(ref: React.RefObject<HTMLElement | null>) {
  const [map, setMap] = React.useState<{ href: string; w: number; h: number } | null>(null);
  React.useEffect(() => {
    const el = ref.current;
    const root = document.documentElement;
    const chromium = !!(navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands?.some((b) => /Chromium/.test(b.brand));
    const calm = () => root.dataset.lite === "on" || window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
    if (!el || !chromium || calm()) return;
    const draw = () => {
      const { width, height } = el.getBoundingClientRect();
      if (width < 10 || height < 10) return;
      setMap({ href: refractionMap(Math.round(width), Math.round(height)), w: Math.round(width), h: Math.round(height) });
      root.dataset.glassRefract = "";
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    return () => {
      ro.disconnect();
      delete root.dataset.glassRefract;
    };
  }, [ref]);
  return map;
}

const haptic = () => {
  try {
    navigator.vibrate?.(8);
  } catch {}
};

function Badge({ n, className }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return <span className={cn("tab-badge absolute min-w-[18px] rounded-full px-1 text-center text-[11px] leading-[18px] font-semibold tabular-nums", className)}>{n > 99 ? "99+" : n}</span>;
}

// Phones and tablets (below 1024px): a floating Liquid Glass tab bar in Apple's style (iOS 26): up to five tabs, a
// glass pill that slides to the chosen one, filled icons for the chosen tab, red badges, 44pt+ touch targets, and it
// stays clear of the home indicator. Tools opens a glass sheet of everyday tools; More opens the full menu.
export function MobileNav({ work, chat, alerts, approvals = 0, appName = "the app" }: { work: { href: string; label: string } | null; chat: number; alerts: number; approvals?: number; appName?: string }) {
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();
  const [tools, setTools] = React.useState(false);
  const shell = React.useRef<HTMLDivElement>(null);
  const map = useRefraction(shell);
  const { mode: installMode, install } = useInstall();
  useViewport();
  React.useEffect(() => setTools(false), [pathname]);
  const items = [
    { href: "/dashboard", label: "Home", icon: HomeIcon, badge: 0 },
    ...(work ? [{ href: work.href, label: work.label, icon: BriefcaseIcon, badge: 0 }] : []),
    { href: "/chat", label: "Chat", icon: MessageCircleIcon, badge: chat },
  ];
  // Out of the way during a presentation.
  if (/\/present$/.test(pathname)) return null;
  const tiles: { label: string; icon: React.ComponentType<{ className?: string }>; href?: string; onClick?: () => void; badge?: number }[] = [
    { label: "Alerts", icon: BellIcon, href: "/notifications", badge: alerts },
    { label: "Check in", icon: ClockIcon, href: "/attendance" },
    { label: "Search", icon: SearchIcon, onClick: () => (setTools(false), press({ key: "k", ctrlKey: true })) },
    { label: "Assistant", icon: SparklesIcon, onClick: () => (setTools(false), press({ key: "a", code: "KeyA", altKey: true })) },
    { label: "Approvals", icon: CheckCheckIcon, href: "/approvals", badge: approvals },
    { label: "Routines", icon: ZapIcon, href: "/routines" },
    { label: "Help", icon: HelpCircleIcon, href: "/profile/help" },
    { label: "Settings", icon: SettingsIcon, href: "/preferences" },
    ...(installMode ? [{ label: "Install app", icon: DownloadIcon, onClick: () => (setTools(false), void install()) }] : []),
  ];
  const toolsBadge = alerts + approvals;
  const n = items.length + 2;
  const tabIndex = items.findIndex((it) => pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href)));
  const active = openMobile ? n - 1 : tools ? n - 2 : tabIndex;
  const tabCls = "relative z-10 flex h-full w-full flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] font-medium tracking-[0.01em]";
  const tone = (on: boolean) => (on ? "text-primary" : "text-foreground/75");
  const icon = (Icon: React.ComponentType<{ className?: string; strokeWidth?: number; fill?: string; fillOpacity?: number }>, on: boolean) => <Icon className="size-[23px]" strokeWidth={on ? 2.25 : 1.85} fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.18 : 0} />;
  return (
    <>
      {map && (
        <svg aria-hidden width="0" height="0" className="pointer-events-none absolute">
          <filter id="lg-refract" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feImage href={map.href} x="0" y="0" width={map.w} height={map.h} preserveAspectRatio="none" result="map" />
            <feDisplacementMap in="SourceGraphic" in2="map" scale={-48} xChannelSelector="R" yChannelSelector="B" />
          </filter>
        </svg>
      )}
      <nav className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[var(--tabbar-gap)] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:hidden" aria-label="Main" data-mobile-nav>
        <div ref={shell} className="tab-shell glass glass-refract pointer-events-auto relative h-[var(--tabbar-h)] w-full max-w-[34rem] rounded-full">
          <ul className="relative grid h-full p-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
            <li aria-hidden className="tab-lens pointer-events-none absolute top-1 bottom-1 left-1 rounded-full" style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${Math.max(0, active) * 100}%)`, opacity: active < 0 ? 0 : 1 }} />
            {items.map((it, i) => {
              const on = i === active;
              return (
                <li key={it.href} className="min-w-0">
                  <Link href={it.href} onClick={haptic} className={cn(tabCls, tone(on))} aria-current={i === tabIndex ? "page" : undefined} data-mobile-tab={it.label}>
                    <span className="relative">
                      {icon(it.icon, on)}
                      <Badge n={it.badge} className="-top-1.5 left-[15px]" />
                    </span>
                    <span className="max-w-full truncate px-0.5">{it.label}</span>
                  </Link>
                </li>
              );
            })}
            <li className="min-w-0">
              <button type="button" onClick={() => (haptic(), setTools(true))} className={cn(tabCls, tone(active === n - 2))} data-mobile-tab="Tools" aria-haspopup="dialog" aria-expanded={tools}>
                <span className="relative">
                  {icon(LayoutGridIcon, active === n - 2)}
                  <Badge n={toolsBadge} className="-top-1.5 left-[15px]" />
                </span>
                <span>Tools</span>
              </button>
            </li>
            <li className="min-w-0">
              <button type="button" onClick={() => (haptic(), setOpenMobile(true))} className={cn(tabCls, tone(active === n - 1))} data-mobile-tab="More" aria-haspopup="dialog">
                {icon(MenuIcon, active === n - 1)}
                <span>More</span>
              </button>
            </li>
          </ul>
        </div>
      </nav>
      <Sheet open={tools} onOpenChange={setTools}>
        <SheetContent side="bottom" className="glass glass-strong mx-auto max-w-xl rounded-t-[1.75rem] border-0 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:hidden" data-tools-sheet>
          <div className="mx-auto mt-2 h-1.5 w-9 rounded-full bg-foreground/20" aria-hidden />
          <SheetHeader className="pt-2 pb-1">
            <SheetTitle className="text-[22px] font-bold tracking-tight">Tools</SheetTitle>
            <SheetDescription className="sr-only">Everyday tools and your settings</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-4 gap-x-2 gap-y-3 px-4 pb-2 sm:grid-cols-5">
            {tiles.map((t) => {
              const inner = (
                <>
                  <span className="glass relative flex size-[3.4rem] items-center justify-center rounded-[1.1rem]">
                    <t.icon className="size-[22px]" />
                    <Badge n={t.badge ?? 0} className="-top-1 -right-1" />
                  </span>
                  <span className="text-center text-[11.5px] leading-tight">{t.label}</span>
                </>
              );
              const cls = "flex w-full flex-col items-center gap-1.5 rounded-2xl p-1 transition-transform active:scale-95";
              return (
                <li key={t.label} data-tool={t.label}>
                  {t.href ? (
                    <Link href={t.href} className={cls} onClick={() => setTools(false)}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" className={cls} onClick={t.onClick}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
      <InstallPrompt name={appName} />
    </>
  );
}

// The Details switch (phones only): compact by default.
export function MobileDetails() {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    let v = false;
    try {
      v = localStorage.getItem(KEY) === "1";
    } catch {}
    setFull(v);
  }, []);
  React.useEffect(() => {
    document.documentElement.classList.toggle("m-full", full);
  }, [full]);
  return (
    <button
      type="button"
      className="flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted md:hidden"
      aria-pressed={full}
      aria-label={full ? "Show less detail" : "Show all details"}
      title={full ? "Show less detail" : "Show all details"}
      onClick={() => {
        const v = !full;
        setFull(v);
        try {
          localStorage.setItem(KEY, v ? "1" : "0");
        } catch {}
      }}
      data-mobile-details
    >
      {full ? <EyeIcon className="size-4" /> : <EyeOffIcon className="size-4" />}
    </button>
  );
}
