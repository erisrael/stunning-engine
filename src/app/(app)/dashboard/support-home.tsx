import Link from "next/link";
import { BookOpenIcon, HeadphonesIcon, InboxIcon, PhoneIcon, PhoneIncomingIcon, PhoneOutgoingIcon, SearchIcon, TicketIcon } from "lucide-react";
import type { AppUser } from "@/server/users";
import * as sd from "@/server/support-desk";
import { TICKET_STATUS_LABELS } from "@/lib/support";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, MetricCard, PageHeader } from "@/components/app/primitives";
import { Desk, NewTicket } from "@/components/app/support/desk";
import { cn } from "@/lib/utils";
import { PreviewButton, TicketPreviewProvider } from "@/components/app/support/ticket-preview";

// The home of the Customer Support role: the agent's own tickets, the tickets waiting for someone, their recent
// calls and their numbers, with the status switch and incoming-call popup of the desk.
const PRIORITY_TONE: Record<string, string> = { urgent: "bg-destructive/10 text-destructive", high: "bg-amber-500/10 text-amber-700 dark:text-amber-400", normal: "bg-muted text-muted-foreground", low: "bg-muted text-muted-foreground" };

// compact: for a narrow card (the subject keeps its room; priority and status are left out).
function TicketRows({ rows, empty, compact }: { rows: sd.TicketListRow[]; empty: string; compact?: boolean }) {
  if (!rows.length) return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y rounded-lg border">
      {rows.map((t) => {
        const due = !t.first_response_at ? t.sla_first_due : t.sla_resolve_due;
        const late = !!t.breached || (due ? Date.parse(due) < Date.now() : false);
        return (
          <li key={t.id} className="flex items-center pr-1 hover:bg-muted/50">
            <Link href={`/support?tab=desk&ticket=${t.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2 text-sm" data-home-ticket={t.number}>
              <span className="shrink-0 font-mono text-xs text-muted-foreground">#{t.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{t.subject}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.customer ?? "Customer"} · {t.channel}
                  {t.queue ? ` · ${t.queue}` : ""}
                </span>
              </span>
              {!compact && <span className={cn("hidden shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium sm:inline", PRIORITY_TONE[t.priority])}>{t.priority}</span>}
              {!compact && <span className="hidden w-28 shrink-0 text-right text-xs text-muted-foreground md:inline">{TICKET_STATUS_LABELS[t.status] ?? t.status}</span>}
              <span className={cn("shrink-0 text-right text-xs tabular-nums", late ? "font-medium text-destructive" : "text-muted-foreground")}>{late ? "Late" : due ? fmtRelative(due) : fmtRelative(t.updated_at)}</span>
            </Link>
            <PreviewButton id={t.id} label={`Preview ticket ${t.number}`} />
          </li>
        );
      })}
    </ul>
  );
}

export async function SupportHome({ viewer, timezone, greeting }: { viewer: AppUser; timezone: string; greeting: string }) {
  const h = await sd.agentHome(viewer);
  const header = <PageHeader eyebrow="Customer support" title={`${greeting}, ${viewer.name.split(" ")[0]}`} description="Your tickets, the waiting queue, your calls and your numbers." />;
  if (!h.enabled || !h.agent)
    return (
      <div className="space-y-6" data-support-home>
        {header}
        <EmptyState
          icon={<HeadphonesIcon className="size-5" />}
          title={h.enabled ? "You are not in a support queue yet" : "Customer support is switched off"}
          description={h.enabled ? "A support lead adds you to a queue in Customer support, Queues and replies. Your tickets and calls appear here then." : "Admin switches customer support on in Customer support, Settings."}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href="/support">Open Customer support</Link>
            </Button>
          }
        />
      </div>
    );
  const s = h.stats;
  const cfg = await sd.supportConfig();
  const queues = (await sd.listQueues()).filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }));
  return (
    <div className="space-y-6" data-support-home>
      {header}
      <TicketPreviewProvider>
      <Desk status={h.status} record={cfg.recordCalls}>
        <div className="flex flex-wrap items-center gap-2" data-support-actions>
          <NewTicket queues={queues} />
          <Button asChild size="sm" variant="outline">
            <Link href="/support?tab=desk&view=unassigned">
              <InboxIcon /> Waiting queue{h.waitingCount ? ` (${h.waitingCount})` : ""}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/support?tab=students">
              <SearchIcon /> Find a student or parent
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/support?tab=kb">
              <BookOpenIcon /> Knowledge base
            </Link>
          </Button>
          {h.ringing > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400" data-ringing>
              <PhoneIncomingIcon className="size-3.5" /> {h.ringing} {h.ringing === 1 ? "call" : "calls"} ringing
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6" data-support-stats>
          <MetricCard label="My open tickets" value={s.open} href="/support?tab=desk&view=mine" />
          <MetricCard label="Waiting for someone" value={h.waitingCount} href="/support?tab=desk&view=unassigned" tone={h.waitingCount ? "warning" : "default"} />
          <MetricCard label="Solved today" value={s.solvedToday} hint={`${s.solved7} in 7 days`} />
          <MetricCard label="First response" value={s.firstResponseMin === null ? "–" : s.firstResponseMin < 60 ? `${s.firstResponseMin} min` : `${Math.round(s.firstResponseMin / 6) / 10} h`} hint="average, 7 days" />
          <MetricCard label="Customer rating" value={s.rating === null ? "–" : `${s.rating} / 5`} hint={`${s.ratings} ratings, 30 days`} />
          <MetricCard label="Late" value={s.late} href="/support?tab=desk&view=breached" tone={s.late ? "danger" : "default"} />
        </div>

        <div className="grid gap-4 xl:grid-cols-[1fr_24rem]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TicketIcon className="size-4 text-muted-foreground" /> My tickets
              </CardTitle>
              <CardDescription>Assigned to you and not solved, most urgent first.</CardDescription>
              <CardAction>
                <Link href="/support?tab=desk&view=mine" className="text-sm text-primary hover:underline">
                  Open desk
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent data-home-mine>
              <TicketRows rows={h.mine} empty="No tickets assigned to you. Go online to be given new ones." />
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <InboxIcon className="size-4 text-muted-foreground" /> Waiting queue
                </CardTitle>
                <CardDescription>Tickets in your queues that nobody has yet.</CardDescription>
              </CardHeader>
              <CardContent data-home-waiting>
                <TicketRows rows={h.waiting} empty="Nothing is waiting." compact />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <PhoneIcon className="size-4 text-muted-foreground" /> Recent calls
                </CardTitle>
                <CardDescription>
                  {s.callsToday} today · {s.callMinutes7} min in 7 days
                </CardDescription>
              </CardHeader>
              <CardContent data-home-calls>
                {h.calls.length ? (
                  <ul className="divide-y rounded-lg border text-sm">
                    {h.calls.map((c) => (
                      <li key={c.id}>
                        <Link href={c.ticket_id ? `/support?tab=desk&ticket=${c.ticket_id}` : "/support"} className="flex items-center gap-2 px-3 py-2 hover:bg-muted/50">
                          {c.direction === "outbound" ? <PhoneOutgoingIcon className="size-3.5 text-muted-foreground" /> : <PhoneIncomingIcon className="size-3.5 text-muted-foreground" />}
                          <span className="min-w-0 flex-1 truncate">
                            {c.customer ?? "Customer"}
                            {c.number ? <span className="text-muted-foreground"> · #{c.number}</span> : null}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums">{c.duration_s ? `${Math.floor(c.duration_s / 60)}:${String(c.duration_s % 60).padStart(2, "0")}` : c.status}</span>
                          {c.recorded ? <span className="text-[11px] text-muted-foreground">rec</span> : null}
                          <span className="hidden w-28 text-right text-xs text-muted-foreground sm:inline">{fmtDateTime(c.started_at, timezone)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="py-6 text-center text-sm text-muted-foreground">No calls yet.</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </Desk>
      </TicketPreviewProvider>
    </div>
  );
}
