"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

// The sub-pages of the sidebar entry you are in. With the sidebar expanded they sit under the entry; with it
// collapsed to icons they move to a tab bar at the top of the page (no flyout menus in the rail).
export type SectionTab = { label: string; href: string };
type Section = { label: string; tabs: SectionTab[]; active: string | null } | null;

let current: Section = null;
const listeners = new Set<() => void>();
export function publishSection(next: Section) {
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => (listeners.add(l), () => void listeners.delete(l));
const snapshot = () => current;

export function CollapsedSectionTabs() {
  const { state, isMobile } = useSidebar();
  const section = React.useSyncExternalStore(subscribe, snapshot, () => null);
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const ref = React.useRef<HTMLDivElement>(null);
  // A page that draws its own tab bar keeps it; the section bar then stays away so tabs never show twice.
  const [pageHasTabs, setPageHasTabs] = React.useState(false);
  React.useEffect(() => {
    const main = ref.current?.closest("main");
    if (!main) return;
    // The page already links most of the section's pages itself (its own tab bar), or marks its tab bar.
    const check = () => {
      if (main.querySelector("[data-page-tabs]")) return setPageHasTabs(true);
      const tabs = current?.tabs ?? [];
      if (tabs.length < 2) return setPageHasTabs(false);
      const own = new Set(
        [...main.querySelectorAll<HTMLAnchorElement>("a[href]")]
          .filter((a) => !a.closest("[data-section-tabs]"))
          .map((a) => a.getAttribute("href")!),
      );
      setPageHasTabs(tabs.filter((t) => own.has(t.href)).length >= Math.ceil(tabs.length / 2));
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(main, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [pathname, search, section]);
  const show = state === "collapsed" && !isMobile && !!section && section.tabs.length > 1 && !pageHasTabs;
  return (
    <div ref={ref} className="no-print">
      {show && (
        <nav aria-label={`${section!.label} pages`} data-section-tabs className="-mx-1 mb-4 flex gap-0.5 overflow-x-auto border-b px-1 [scrollbar-width:none]">
          {section!.tabs.map((t) => {
            const on = t.href === section!.active;
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors",
                  on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
