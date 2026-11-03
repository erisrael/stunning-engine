"use client";

// Phones (Phase 29): a bottom tab bar like a phone app (Home, Work, Chat, Alerts, More), and a compact view that
// leaves out the long explanations and the extra table columns. The Details switch in the top bar shows
// everything again; the choice stays on the phone.

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellIcon, BriefcaseIcon, EyeIcon, EyeOffIcon, HomeIcon, MenuIcon, MessageCircleIcon } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const KEY = "myseed.mobile.details";

export function MobileNav({ work, chat, alerts }: { work: { href: string; label: string } | null; chat: number; alerts: number }) {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const items = [
    { href: "/dashboard", label: "Home", icon: HomeIcon, badge: 0 },
    ...(work ? [{ href: work.href, label: work.label, icon: BriefcaseIcon, badge: 0 }] : []),
    { href: "/chat", label: "Chat", icon: MessageCircleIcon, badge: chat },
    { href: "/notifications", label: "Alerts", icon: BellIcon, badge: alerts },
  ];
  // Out of the way during a presentation.
  if (/\/present$/.test(pathname)) return null;
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Main" data-mobile-nav>
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
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
          <button type="button" onClick={() => setOpenMobile(true)} className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground" data-mobile-tab="More">
            <span className="flex h-7 w-12 items-center justify-center rounded-full">
              <MenuIcon className="size-5" />
            </span>
            More
          </button>
        </li>
      </ul>
    </nav>
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
