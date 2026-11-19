"use client";
import * as React from "react";
import Link from "next/link";
import { StarIcon } from "lucide-react";
import { MetricCard, EmptyState } from "@/components/app/primitives";
import { Toolbar, ViewSwitcher } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import { agentRatingsAction } from "@/app/actions/support-desk";
import type { agentRatings } from "@/server/support-desk";

type Data = Awaited<ReturnType<typeof agentRatings>>;

function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex", className)} aria-label={`${n} of 5`}>
      {[1, 2, 3, 4, 5].map((k) => (
        <StarIcon key={k} className={cn("size-3.5", k <= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </span>
  );
}

// Customer support > Ratings: how customers rated the help at the end of their conversations, kept on the agent
// who handled each one. An agent sees their own; leads choose any agent.
export function AgentRatings({ initial, agents }: { initial: Data; agents: { id: string; name: string }[] | null }) {
  const [d, setD] = React.useState(initial);
  const [days, setDays] = React.useState<"30" | "90" | "365">(String(initial.days) as "90");
  const [agent, setAgent] = React.useState(initial.agentId);
  const load = React.useCallback(async (id: string, span: string) => {
    const r = await agentRatingsAction(id, Number(span));
    if (r.ok) setD(r.data as Data);
  }, []);
  const max = Math.max(1, ...d.stars);
  return (
    <div className="space-y-4" data-agent-ratings>
      <Toolbar label="Ratings">
        {agents && (
          <select aria-label="Agent" value={agent} onChange={(e) => (setAgent(e.target.value), void load(e.target.value, days))} className="h-8 rounded-md border bg-background px-2 text-sm">
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        <ViewSwitcher label="Period" value={days} onChange={(v) => (setDays(v), void load(agent, v))} options={[["30", "30 days"], ["90", "90 days"], ["365", "A year"]]} />
      </Toolbar>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Average" value={d.average === null ? "–" : `${d.average} / 5`} hint={d.name} />
        <MetricCard label="Ratings" value={d.count} hint={`Last ${d.days} days`} />
        <MetricCard label="Satisfied" value={d.satisfied === null ? "–" : `${d.satisfied}%`} hint="4 or 5 stars" tone={d.satisfied !== null && d.satisfied < 70 ? "warning" : "default"} />
        <MetricCard label="Low ratings" value={d.stars[0]! + d.stars[1]!} hint="1 or 2 stars" tone={d.stars[0]! + d.stars[1]! ? "warning" : "default"} />
      </div>
      <section className="space-y-1.5 rounded-xl border bg-card p-4" aria-label="Stars">
        {[5, 4, 3, 2, 1].map((k) => (
          <div key={k} className="flex items-center gap-3 text-sm">
            <Stars n={k} className="w-24 shrink-0" />
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", k >= 4 ? "bg-emerald-500" : k === 3 ? "bg-amber-400" : "bg-red-500")} style={{ width: `${(d.stars[k - 1]! / max) * 100}%` }} />
            </div>
            <span className="w-8 text-right tabular-nums text-muted-foreground">{d.stars[k - 1]}</span>
          </div>
        ))}
      </section>
      {d.recent.length ? (
        <ul className="divide-y rounded-xl border bg-card" data-rating-list>
          {d.recent.map((r) => (
            <li key={r.id} className="flex flex-wrap items-start gap-3 p-3 text-sm">
              <Stars n={r.rating} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {r.customer_name ?? "Customer"}
                  {r.ticket_id ? (
                    <Link href={`/support?ticket=${r.ticket_id}`} className="ml-2 text-xs font-normal text-primary hover:underline">#{r.ticket_number}</Link>
                  ) : r.ticket_number ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">#{r.ticket_number}</span>
                  ) : null}
                </p>
                {r.comment && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">&ldquo;{r.comment}&rdquo;</p>}
              </div>
              <span className="text-xs text-muted-foreground">{r.channel === "telegram" ? "Telegram" : "Support app"} · {new Date(r.created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}</span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<StarIcon className="size-5" />} title="No ratings yet" description="Customers rate the help when a conversation is solved or closed." />
      )}
    </div>
  );
}
