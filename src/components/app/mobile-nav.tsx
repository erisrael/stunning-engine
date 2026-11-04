"use client";

// Phones (Phase 29): a bottom tab bar like a phone app (Home, Work, Chat, Tools, More), and a compact view that
// leaves out the long explanations and the extra table columns. Tools opens the everyday tools in one sheet: alerts,
// check-in, search, the assistant, approvals, routines, help and Settings. The Details switch in the top bar shows
// everything again; the choice stays on the phone. The bar steps aside while the keyboard is open, and inside a chat.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BellIcon,
  BriefcaseIcon,
  CheckCheckIcon,
  ClockIcon,
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

const KEY = "myseed.mobile.details";

// The keyboard is open when the visible part of the page is much shorter than the window; the visible height is kept
// in --vvh so pages like Chat can keep their message box right above the keyboard.
function useViewport() {
  React.useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const el = document.documentElement;
    const on = () => {
      const open = vv.height < window.innerHeight * 0.8 && window.innerWidth < 768;
      el.classList.toggle("kb-open", open);
      el.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
      // iOS scrolls the page up under the keyboard; keep the top at the top.
      if (open && el.classList.contains("in-chat")) window.scrollTo(0, 0);
    };
    on();
    vv.addEventListener("resize", on);
    vv.addEventListener("scroll", on);
    return () => {
      vv.removeEventListener("resize", on);
      vv.removeEventListener("scroll", on);
    };
  }, []);
}

const press = (init: KeyboardEventInit) => window.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, ...init }));

export function MobileNav({ work, chat, alerts, approvals = 0 }: { work: { href: string; label: string } | null; chat: number; alerts: number; approvals?: number }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const [tools, setTools] = React.useState(false);
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
  ];
  const toolsBadge = alerts + approvals;
  return (
    <>
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main" data-mobile-nav>
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 2}, minmax(0, 1fr))` }}>
          {items.map((it) => {
            const on = pathname === it.href || (it.href !== "/dashboard" && pathname.startsWith(it.href));
            return (
              <li key={it.href}>
                <Link href={it.href} className={cn("relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px]", on ? "text-primary" : "text-muted-foreground")} aria-current={on ? "page" : undefined} data-mobile-tab={it.label}>
                  <span className={cn("flex h-7 w-12 items-center justify-center rounded-full transition-colors", on && "bg-primary/12")}>
                    <it.icon className="size-5" />
                  </span>
                  {it.label}
                  {it.badge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-[#D93025] px-1 text-center text-[10px] leading-4 font-semibold text-white">{it.badge > 99 ? "99+" : it.badge}</span>}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => setTools(true)} className={cn("relative flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px]", tools ? "text-primary" : "text-muted-foreground")} data-mobile-tab="Tools" aria-haspopup="dialog">
              <span className={cn("flex h-7 w-12 items-center justify-center rounded-full", tools && "bg-primary/12")}>
                <LayoutGridIcon className="size-5" />
              </span>
              Tools
              {toolsBadge > 0 && <span className="absolute top-1.5 left-1/2 ml-2 min-w-4 rounded-full bg-[#D93025] px-1 text-center text-[10px] leading-4 font-semibold text-white">{toolsBadge > 99 ? "99+" : toolsBadge}</span>}
            </button>
          </li>
          <li>
            <button type="button" onClick={() => setOpenMobile(true)} className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground" data-mobile-tab="More">
              <span className="flex h-7 w-12 items-center justify-center rounded-full">
                <MenuIcon className="size-5" />
              </span>
              More
            </button>
          </li>
        </ul>
      </nav>
      <Sheet open={tools} onOpenChange={setTools}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden" data-tools-sheet>
          <SheetHeader className="pb-0">
            <SheetTitle>Tools</SheetTitle>
            <SheetDescription className="sr-only">Everyday tools and your settings</SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-4 gap-2 px-4 pb-2">
            {tiles.map((t) => {
              const inner = (
                <>
                  <span className="relative flex size-12 items-center justify-center rounded-2xl bg-muted">
                    <t.icon className="size-5" />
                    {!!t.badge && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-[#D93025] px-1 text-center text-[10px] leading-4 font-semibold text-white">{t.badge > 99 ? "99+" : t.badge}</span>}
                  </span>
                  <span className="text-center text-[11px] leading-tight">{t.label}</span>
                </>
              );
              const cls = "flex w-full flex-col items-center gap-1 rounded-xl p-1.5 hover:bg-muted/60";
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
