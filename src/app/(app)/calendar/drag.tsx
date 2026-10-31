"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { itemAction } from "@/app/actions/items";
import { localInputToIso } from "@/lib/format";
import { cn } from "@/lib/utils";

// Scheduled releases can be dragged to another day; the time of day stays the same.

const MIME = "application/x-myseed-release";

export function ReleaseChip({ itemId, time, canMove, className, title, children }: { itemId: string; time: string | null; canMove: boolean; className: string; title: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/items/${itemId}`}
      draggable={canMove}
      onDragStart={(e) => {
        e.dataTransfer.setData(MIME, JSON.stringify({ itemId, time }));
        e.dataTransfer.effectAllowed = "move";
      }}
      className={cn("block truncate rounded px-1.5 py-0.5 text-[11px]", canMove && "cursor-grab active:cursor-grabbing", className)}
      title={canMove ? `${title}. Drag to another day to reschedule.` : title}
    >
      {children}
    </Link>
  );
}

export function DayDrop({ date, tz, className, children }: { date: string; tz: string; className?: string; children: React.ReactNode }) {
  const router = useRouter();
  const [over, setOver] = React.useState(false);
  return (
    <div
      className={cn(className, over && "bg-primary/10 ring-2 ring-primary/40 ring-inset")}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(MIME)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={async (e) => {
        setOver(false);
        const raw = e.dataTransfer.getData(MIME);
        if (!raw) return;
        e.preventDefault();
        const { itemId, time } = JSON.parse(raw) as { itemId: string; time: string | null };
        const at = localInputToIso(`${date}T${time ?? "09:00"}`, tz);
        if (!at) return;
        if (Date.parse(at) < Date.now()) return void toast.error("Choose a day that has not passed.");
        const r = (await itemAction(itemId, { action: "schedule", scheduledAt: at }, { source: "ui" })) as { ok: boolean; error?: string };
        if (!r.ok) return void toast.error(r.error ?? "Could not reschedule.");
        toast.success(`Release moved to ${date}`);
        router.refresh();
      }}
    >
      {children}
    </div>
  );
}
