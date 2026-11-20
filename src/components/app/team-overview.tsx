import Link from "next/link";
import { STAGE_LABELS, STATUS_LABELS } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { StatusPill, toneFor } from "@/components/app/status-pill";
import type { TeamOverviewData } from "@/server/team-flow";

// A team's overview for its members (Home): what the team has done, what is open, sent back to redo or waiting,
// and who is on what. Read only; item links only for people who may open item pages.
export function TeamOverview({ data, tz, links }: { data: TeamOverviewData; tz: string; links: boolean }) {
  const team = STAGE_LABELS[data.stage];
  const done = data.stage === "recording" ? "Recorded" : "Done";
  const c = data.counts;
  const tiles: [string, number, string][] = [
    [`${done} this week`, c.doneWeek, "done"],
    [`${done} in all`, c.doneTotal, "done"],
    ["In progress", c.active, "active"],
    ["Redo", c.redo, "redo"],
    ["To do", c.todo, "queued"],
    ["Blocked", c.blocked, "blocked"],
    ["Waiting for the lead", c.withLead + c.done, "paused"],
    ["Handed over", c.handedOver, "handoff"],
  ];
  const item = (x: { id: string; code: string; title: string }) =>
    links ? (
      <Link href={`/items/${x.id}`} className="font-mono text-xs text-primary hover:underline">
        {x.code}
      </Link>
    ) : (
      <span className="font-mono text-xs">{x.code}</span>
    );
  return (
    <section className="space-y-3 rounded-xl border bg-card p-3" aria-label={`${team} team overview`} data-team-overview={data.stage}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-semibold">{team} team overview</h2>
        <span className="text-xs text-muted-foreground">What the team has {data.stage === "recording" ? "recorded" : "done"}, what is open and who is on what. Read only.</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {tiles.map(([label, n, tone]) => (
          <div key={label} className="rounded-lg border px-2.5 py-2" data-overview-tile={label}>
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold tabular-nums" style={tone === "redo" && n > 0 ? { color: "var(--st-paused-fg)" } : undefined}>
              {n}
            </p>
          </div>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Who is on what</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Person</th>
                  <th className="px-1 py-1.5 text-right font-medium">To do</th>
                  <th className="px-1 py-1.5 text-right font-medium">Doing</th>
                  <th className="px-1 py-1.5 text-right font-medium">Redo</th>
                  <th className="px-1 py-1.5 text-right font-medium">Waiting</th>
                  <th className="px-2 py-1.5 text-right font-medium">{done} (7 days)</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.people.map((p) => (
                  <tr key={p.id} data-overview-person={p.id}>
                    <td className="px-2 py-1.5">{p.name}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{p.todo}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{p.active}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{p.redo}</td>
                    <td className="px-1 py-1.5 text-right tabular-nums">{p.waiting}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{p.doneWeek}</td>
                  </tr>
                ))}
                {!data.people.length && (
                  <tr>
                    <td colSpan={6} className="px-2 py-3 text-center text-muted-foreground">
                      Nobody in the team yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Open now</h3>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-xs">
            {data.open.map((x) => (
              <li key={x.id} className="flex items-center gap-2 px-2 py-1.5">
                {item(x)}
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                <span className="hidden truncate text-muted-foreground sm:inline">{x.who ?? "Unassigned"}</span>
                <StatusPill size="xs" tone={x.redo ? "redo" : toneFor(x.status)} label={x.redo ? "Redo" : STATUS_LABELS[x.status]} />
              </li>
            ))}
            {!data.open.length && <li className="px-2 py-3 text-center text-muted-foreground">Nothing open.</li>}
          </ul>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-sm font-medium">Latest {done.toLowerCase()}</h3>
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border text-xs">
            {data.recent.map((x) => (
              <li key={x.id + x.at} className="flex items-center gap-2 px-2 py-1.5">
                {item(x)}
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
                <span className="shrink-0 text-muted-foreground">
                  {x.who ? `${x.who}, ` : ""}
                  {fmtDateTime(x.at, tz)}
                </span>
              </li>
            ))}
            {!data.recent.length && <li className="px-2 py-3 text-center text-muted-foreground">Nothing {done.toLowerCase()} yet.</li>}
          </ul>
        </div>
      </div>
    </section>
  );
}
