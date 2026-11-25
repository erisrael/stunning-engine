"use client";

// Phones and tablets: a floating Liquid Glass tab bar like an iPhone app (Home, Work, Chat, Tools, More), and on
// phones a compact view that leaves out the long explanations and the extra table columns. Tools opens the everyday
// tools in one sheet: alerts, check-in, search, the assistant, approvals, routines, help, Settings and Install app.
// The Details switch in the top bar shows everything again; the choice stays on the phone. The bar steps aside while
// the keyboard is open, and inside a chat (glass.css).

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  BellIcon,
  BriefcaseIcon,
  CheckCheckIcon,
  ClockIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  Gamepad2Icon,
  HelpCircleIcon,
  HomeIcon,
  LayoutGridIcon,
  MenuIcon,
  MessageCircleIcon,
  QrCodeIcon,
  SearchIcon,
  SettingsIcon,
  SparklesIcon,
  TimerIcon,
  ZapIcon,
} from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { InstallPrompt, useInstall } from "./install-app";
import { switchRoleAction } from "@/app/actions/auth";
import { ROLE_LABELS, type Role } from "@/lib/domain";

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
      if (open && (el.classList.contains("in-chat") || document.querySelector("[data-support-shell]"))) window.scrollTo(0, 0);
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

// Phones: a strip of tabs scrolls sideways; the chosen tab is brought into view when a page opens and after a tap.
const TAB_ROWS = '[data-slot="tabs-list"], [data-page-tabs], [data-section-tabs], [data-wrap-tabs]';
const CHOSEN = '[aria-current="page"], [data-state="active"], [aria-selected="true"]';
function useChosenTabInView(pathname: string) {
  React.useEffect(() => {
    if (window.innerWidth >= 768) return;
    const bring = () => {
      for (const row of document.querySelectorAll<HTMLElement>(TAB_ROWS)) {
        if (row.scrollWidth <= row.clientWidth + 2) continue;
        const on = row.querySelector<HTMLElement>(CHOSEN);
        if (!on) continue;
        const r = row.getBoundingClientRect();
        const b = on.getBoundingClientRect();
        const left = row.scrollLeft + (b.left - r.left) - row.clientWidth / 2 + b.width / 2;
        row.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      }
    };
    // A strip with more tabs off to a side fades on that side (glass.css), so the hidden tabs are not missed.
    const edge = (row: HTMLElement) => {
      const more = row.scrollWidth > row.clientWidth + 2;
      row.toggleAttribute("data-more-start", more && row.scrollLeft > 4);
      row.toggleAttribute("data-more-end", more && row.scrollLeft + row.clientWidth < row.scrollWidth - 4);
    };
    const edges = () => document.querySelectorAll<HTMLElement>(TAB_ROWS).forEach(edge);
    const timers = [window.setTimeout(bring, 250), window.setTimeout(edges, 300), window.setTimeout(edges, 1200)];
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(TAB_ROWS)) timers.push(window.setTimeout(bring, 300), window.setTimeout(edges, 800));
    };
    let frame = 0;
    const onScroll = (e: Event) => {
      const row = e.target instanceof HTMLElement && e.target.matches(TAB_ROWS) ? e.target : null;
      if (!row || frame) return;
      frame = window.requestAnimationFrame(() => ((frame = 0), edge(row)));
    };
    document.addEventListener("click", onClick);
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", edges);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (frame) window.cancelAnimationFrame(frame);
      document.removeEventListener("click", onClick);
      document.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", edges);
    };
  }, [pathname]);
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
    // Not in Lite mode, with Reduce Transparency, or on low-power phones and the Android app (redrawn on every scroll frame).
    const calm = () => root.dataset.lite === "on" || "lowPower" in root.dataset || window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
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
export function MobileNav({
  work,
  chat,
  alerts,
  approvals = 0,
  appName = "the app",
  roles = [],
  activeRole,
  qrScan = false,
  fun = false,
}: {
  work: { href: string; label: string } | null;
  chat: number;
  alerts: number;
  approvals?: number;
  appName?: string;
  roles?: Role[];
  activeRole?: Role;
  qrScan?: boolean;
  fun?: boolean;
}) {
  const router = useRouter();
  const [details, toggleDetails] = useDetails();
  const [switching, startSwitch] = React.useTransition();
  const pathname = usePathname();
  const { setOpenMobile, openMobile } = useSidebar();
  const [tools, setTools] = React.useState(false);
  const shell = React.useRef<HTMLDivElement>(null);
  const map = useRefraction(shell);
  const { mode: installMode, install } = useInstall();
  useViewport();
  useChosenTabInView(pathname);
  React.useEffect(() => setTools(false), [pathname]);
  const items = [
    { href: "/dashboard", label: "Home", icon: HomeIcon, badge: 0 },
    ...(work ? [{ href: work.href, label: work.label, icon: BriefcaseIcon, badge: 0 }] : []),
    { href: "/chat", label: "Chat", icon: MessageCircleIcon, badge: chat },
  ];
  // Out of the way during a presentation.
  if (/\/present$/.test(pathname)) return null;
  const tiles: { label: string; icon: React.ComponentType<{ className?: string }>; href?: string; onClick?: () => void; badge?: number; phoneOnly?: boolean }[] = [
    { label: "Alerts", icon: BellIcon, href: "/notifications", badge: alerts },
    { label: "Check in", icon: ClockIcon, href: "/attendance" },
    { label: "Search", icon: SearchIcon, onClick: () => (setTools(false), press({ key: "k", ctrlKey: true })) },
    { label: "Assistant", icon: SparklesIcon, onClick: () => (setTools(false), press({ key: "a", code: "KeyA", altKey: true })) },
    { label: "Approvals", icon: CheckCheckIcon, href: "/approvals", badge: approvals },
    { label: "Routines", icon: ZapIcon, href: "/routines" },
    { label: "Help", icon: HelpCircleIcon, href: "/profile/help" },
    { label: "Settings", icon: SettingsIcon, href: "/preferences" },
    // Moved here from the top bar on phones.
    ...(qrScan ? [{ label: "Scan QR", icon: QrCodeIcon, onClick: () => (setTools(false), window.dispatchEvent(new Event("myseed:qr-scan"))) }] : []),
    { label: "Focus", icon: TimerIcon, onClick: () => (setTools(false), window.dispatchEvent(new Event("myseed:focus"))) },
    ...(fun ? [{ label: "Fun mode", icon: Gamepad2Icon, onClick: () => (setTools(false), window.dispatchEvent(new CustomEvent("myseed-fun", { detail: { toggle: true } }))) }] : []),
    { label: details ? "Less detail" : "All details", icon: details ? EyeOffIcon : EyeIcon, onClick: toggleDetails, phoneOnly: true },
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
          {/* Your role (phones; the top bar has the switcher on bigger screens). */}
          {roles.length > 1 && activeRole && (
            <div className="px-4 pb-3 md:hidden" data-tools-role>
              <p className="mb-1.5 text-[13px] font-medium text-[var(--ios-label-2)]">Viewing as</p>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Active role">
                {roles.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={r === activeRole}
                    disabled={switching}
                    onClick={() =>
                      r !== activeRole &&
                      startSwitch(async () => {
                        const res = await switchRoleAction(r).catch(() => ({ ok: false as const, error: "The role could not be switched. Try again." }));
                        if (!res.ok) return void toast.error(res.error);
                        toast.success(`Now viewing as ${ROLE_LABELS[r] || r}`);
                        setTools(false);
                        router.push("/dashboard");
                      })
                    }
                    className={cn("h-9 rounded-full px-3.5 text-[14px] font-medium transition-colors", r === activeRole ? "bg-primary text-primary-foreground" : "glass text-foreground", switching && "opacity-60")}
                  >
                    {ROLE_LABELS[r] || r}
                  </button>
                ))}
              </div>
            </div>
          )}
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
                <li key={t.label} data-tool={t.label} className={cn(t.phoneOnly && "md:hidden")} data-mobile-details={t.phoneOnly ? "" : undefined}>
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

// The Details switch (phones only, under Tools): compact by default; the choice stays on the phone.
function useDetails() {
  const [full, setFull] = React.useState(false);
  React.useEffect(() => {
    try {
      setFull(localStorage.getItem(KEY) === "1");
    } catch {}
  }, []);
  React.useEffect(() => {
    document.documentElement.classList.toggle("m-full", full);
  }, [full]);
  const toggle = () =>
    setFull((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  return [full, toggle] as const;
}
