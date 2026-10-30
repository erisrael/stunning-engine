"use client";

import * as React from "react";
import Link from "next/link";
import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/app/primitives";
import { COVER_CLASS } from "@/components/app/profile-card";
import type { Cover } from "@/server/profiles";
import { cn } from "@/lib/utils";

export function PeopleDirectory({ people }: { people: { id: string; name: string; headline: string | null; avatar: string | null; cover: Cover; skills: string[] }[] }) {
  const [q, setQ] = React.useState("");
  const needle = q.trim().toLowerCase();
  const shown = people.filter((p) => !needle || `${p.name} ${p.headline ?? ""} ${p.skills.join(" ")}`.toLowerCase().includes(needle));
  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, job or skill (for example Premiere)" className="pl-8" aria-label="Search people" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((p) => (
          <Link key={p.id} href={`/people/${p.id}`} className="overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
            <div className={cn("h-12 bg-gradient-to-r", COVER_CLASS[p.cover])} />
            <div className="-mt-6 space-y-1 px-3 pb-3">
              {p.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- small data URL photo
                <img src={p.avatar} alt="" className="size-12 rounded-full border-2 border-background object-cover" />
              ) : (
                <div className="w-fit rounded-full border-2 border-background bg-background">
                  <UserAvatar name={p.name} size="md" />
                </div>
              )}
              <div className="font-medium">{p.name}</div>
              <div className="truncate text-xs text-muted-foreground">{p.headline ?? " "}</div>
              <div className="flex flex-wrap gap-1 pt-1">
                {p.skills.map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2 text-[11px]">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </Link>
        ))}
        {!shown.length && <p className="text-sm text-muted-foreground">Nobody matches.</p>}
      </div>
    </div>
  );
}
