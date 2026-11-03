"use client";

// At the top of every page: unread announcements ("Got it") and policies to confirm ("I have read this"), until
// done. Also counts page visits for Admin's usage view (the section only, never what is on the page).
import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { MegaphoneIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { markAnnouncementAction, recordVisitAction } from "@/app/actions/announcements";
import type { Announcement } from "@/server/announcements";

export function AnnouncementStrip({ pending }: { pending: Announcement[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hidden, setHidden] = React.useState<string[]>([]);
  // How long the page took: a full load from the browser's own timing, a move inside the app from the click.
  React.useEffect(() => {
    const w = window as unknown as { __navStart?: number; __firstDone?: boolean };
    let ms: number | null = null;
    if (!w.__firstDone) {
      w.__firstDone = true;
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) ms = Math.round(performance.now() - nav.startTime);
    } else if (w.__navStart && performance.now() - w.__navStart < 30000) ms = Math.round(performance.now() - w.__navStart);
    w.__navStart = undefined;
    void recordVisitAction(pathname, ms);
  }, [pathname]);
  React.useEffect(() => {
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (a && a.origin === window.location.origin && a.pathname !== window.location.pathname) (window as unknown as { __navStart?: number }).__navStart = performance.now();
    };
    document.addEventListener("click", click, true);
    return () => document.removeEventListener("click", click, true);
  }, []);
  const list = pending.filter((a) => !hidden.includes(a.id));
  if (!list.length || pathname === "/announcements") return null;
  const a = list[0]!;
  const done = async (ack: boolean) => {
    setHidden((h) => [...h, a.id]);
    const r = await markAnnouncementAction(a.id, ack);
    if (!r.ok) return void toast.error(r.error);
    if (ack) toast.success("Thank you, confirmed");
    router.refresh();
  };
  return (
    <div className={`no-print mb-4 flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 ${a.kind === "policy" ? "border-[#E8710A]/40 bg-[#E8710A]/5" : "border-[#1A73E8]/30 bg-[#1A73E8]/5"}`} data-announcement={a.id}>
      {a.kind === "policy" ? <ShieldCheckIcon className="mt-0.5 size-5 shrink-0 text-[#E8710A]" /> : <MegaphoneIcon className="mt-0.5 size-5 shrink-0 text-[#1A73E8]" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {a.kind === "policy" ? "Policy: " : ""}
          {a.title}
        </p>
        <p className={`text-sm whitespace-pre-wrap text-muted-foreground ${a.kind === "policy" ? "max-h-48 overflow-y-auto" : "line-clamp-2"}`}>{a.body}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {a.author} · {new Date(a.createdAt).toLocaleDateString()}
          {list.length > 1 ? ` · ${list.length - 1} more` : ""} ·{" "}
          <Link href="/announcements" className="text-primary hover:underline">
            Read all
          </Link>
        </p>
      </div>
      {a.kind === "policy" ? (
        <Button size="sm" onClick={() => done(true)}>
          I have read this
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => done(false)}>
          Got it
        </Button>
      )}
    </div>
  );
}
