import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Customer support › Monitor, below the agents' table (Update 1.2, Phase 10): conversations by channel, calls by queue,
// the phone menu, support requests and sync health, for the dates chosen above.

type Reports = Awaited<ReturnType<typeof import("@/server/support-analytics").updateReports>>;
const secs = (s: number | null) => (s === null ? "—" : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`);
const dash = (v: number | null, unit = "") => (v === null ? "—" : `${v}${unit}`);
const CHANNEL: Record<string, string> = { widget: "Website and app", telegram: "Telegram", email: "Email", call: "Calls", web: "Web", sms: "SMS" };

function Table({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b text-left text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={h} className={i ? "p-2 text-right" : "p-2"}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className={j ? "p-2 text-right tabular-nums" : "p-2"}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function UpdateReports({ r }: { r: Reports }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2" data-update-reports>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversations by channel</CardTitle>
          <CardDescription>Opened in these dates: average time to the first answer and to solved.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table head={["Channel", "Opened", "Solved", "First answer", "Solved in"]} empty="No conversations in these dates." rows={r.channels.map((c) => [CHANNEL[c.channel] ?? c.channel, c.count, c.solved, dash(c.firstAnswerMin, " min"), dash(c.resolveHours, " h")])} />
        </CardContent>
      </Card>
      <Card data-report-calls>
        <CardHeader>
          <CardTitle className="text-base">Calls by queue</CardTitle>
          <CardDescription>Abandoned: the caller hung up while waiting. Missed: nobody answered in time. Refused: closed, full or nobody online.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            head={["Queue", "In", "Out", "Answered", "Abandoned", "Missed", "Refused", "Call-backs", "Wait", "Talk"]}
            empty="No calls in these dates."
            rows={r.callsByQueue.map((q) => [q.queue, q.incoming, q.outgoing, q.answered, q.abandoned, q.missed, q.refused, q.callbacks, secs(q.avgWaitS), secs(q.avgTalkS)])}
          />
        </CardContent>
      </Card>
      <Card data-report-ivr>
        <CardHeader>
          <CardTitle className="text-base">Phone menu</CardTitle>
          <CardDescription>
            {r.ivr ? `${r.ivr.sessions} callers went through the menu · ${r.ivr.invalid} wrong keys · ${r.ivr.timeouts} times nothing was pressed · ${r.ivr.full} times a queue was closed or full.` : "Not available."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {r.ivr && r.ivr.outcomes.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {r.ivr.outcomes.map((o) => (
                <Badge key={o.outcome} variant="outline">{o.outcome.replace(/_/g, " ")}: {o.n}</Badge>
              ))}
            </div>
          )}
          <Table head={["Menu", "Choice", "Pressed"]} empty="No choices pressed in these dates." rows={(r.ivr?.choices ?? []).map((c) => [c.menu, c.choice, c.n])} />
        </CardContent>
      </Card>
      <Card data-report-requests>
        <CardHeader>
          <CardTitle className="text-base">Support requests</CardTitle>
          <CardDescription>Sent in these dates, by destination, and the average time a request stays in each status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Table head={["Destination", "Sent", "Still open"]} empty="No support requests in these dates." rows={r.requests.byDest.map((d) => [d.destination, d.count, d.open])} />
          {r.requests.timeInStatus.length > 0 && <Table head={["Status", "Average hours", "Times"]} empty="" rows={r.requests.timeInStatus.map((s) => [s.label, s.avgHours, s.times])} />}
        </CardContent>
      </Card>
      <Card className="xl:col-span-2" data-report-sync>
        <CardHeader>
          <CardTitle className="text-base">Sync health</CardTitle>
          <CardDescription>The latest run of each Chapa account and Noor table. Failed runs in these dates: Chapa {r.syncFailures.chapa ?? 0}, Noor {r.syncFailures.noor ?? 0}.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table
            head={["Source", "Account or table", "Last run", "Result", "When", "Rows failed"]}
            empty="No syncs have run yet."
            rows={r.sync.map((s) => [s.source === "chapa" ? "Chapa" : s.source === "noor" ? "Noor" : s.source, s.scope, s.kind, <span key="s" className={s.status === "failed" ? "text-destructive" : ""} title={s.error ?? undefined}>{s.status}</span>, <span key="w" suppressHydrationWarning>{new Date(s.at).toLocaleString()}</span>, s.failed])}
          />
        </CardContent>
      </Card>
    </div>
  );
}
