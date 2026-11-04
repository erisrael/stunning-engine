"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The handover pages: the handovers themselves, rejections to cross-check, the dates report, and how it is set up.
export function HandoverNav({ settings, rejected }: { settings: boolean; rejected: number }) {
  const pathname = usePathname();
  const tabs = [
    { href: "/handovers", label: "Handovers" },
    { href: "/handovers/rejected", label: rejected ? `Rejected (${rejected})` : "Rejected" },
    { href: "/handovers/report", label: "Report" },
    ...(settings ? [{ href: "/handovers/settings", label: "Settings" }] : []),
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b" aria-label="Handover pages" data-handover-nav>
      {tabs.map((t) => {
        const on = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm", on ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
