"use client";

// A section's pages as underlined tabs (the Ops standard, as PageTabs). While the sidebar is open on a computer the
// sidebar already lists these pages, so the row is not shown at all; collapsed to icons, and on phones, it shows.

import * as React from "react";
import Link from "next/link";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

export type SectionTab = { key: string; label: string; href: string };

export function SectionTabs({ tabs, active, label, end }: { tabs: SectionTab[]; active: string; label: string; end?: React.ReactNode }) {
  const { state, isMobile } = useSidebar();
  if (!isMobile && state === "expanded") return end ? <div className="flex justify-end">{end}</div> : null;
  return (
    <nav aria-label={label} data-page-tabs className="-mx-1 flex items-center gap-0.5 overflow-x-auto border-b px-1 [scrollbar-width:none]">
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={on ? "page" : undefined}
            className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap transition-colors", on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
          >
            {t.label}
          </Link>
        );
      })}
      {end && <span className="ml-auto shrink-0">{end}</span>}
    </nav>
  );
}
