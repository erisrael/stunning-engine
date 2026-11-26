import Link from "next/link";
import { corrPage } from "@/server/corr/page";
import { myQueue } from "@/server/corr/workflow";
import { listDocs, STATUS_LABEL } from "@/server/corr/documents";
import { all } from "@/server/db";
import { PageHeader } from "@/components/app/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CorrNav } from "@/components/app/corr/corr-nav";
import { ACTION_LABELS } from "@/server/corr/org";
import { cn } from "@/lib/utils";

export const metadata = { title: "My approvals" };

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "-");

// The executive queue: what waits for this person (most urgent first), their letters in approval, and what they
// signed or approved recently, including under delegation.
export default async function InboxPage() {
  const { viewer, rights } = await corrPage();
  const [queue, mine, recent] = await Promise.all([
    myQueue(viewer),
    rights.create ? listDocs(viewer, { mine: true, status: ["pending_approval", "pending_signature", "approved", "signed"] }) : Promise.resolve({ rows: [], total: 0, counts: {} }),
    all<{ document_id: string; stage_name: string; action: string; status: string; acted_at: string; capacity: string | null; subject: string; ref_number: string | null }>(
      "SELECT s.document_id, s.stage_name, s.action, s.status, s.acted_at, s.capacity, d.subject, d.ref_number FROM corr_steps s JOIN corr_documents d ON d.id = s.document_id WHERE s.user_id = ? AND s.acted_at IS NOT NULL ORDER BY s.acted_at DESC LIMIT 30",
      viewer.id,
    ),
  ]);
  return (
    <div className="space-y-4">
      <PageHeader title="My approvals" description="Letters waiting for your review, approval, signature or stamp, most urgent first." />
      <CorrNav active="inbox" rights={rights} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Waiting for you ({queue.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {queue.map((q) => (
              <Link key={q.stepId} href={`/correspondence/${q.documentId}`} className={cn("flex flex-wrap items-center gap-2 rounded-md border p-2.5 text-sm hover:bg-muted", q.overdue && "border-destructive/50")}>
                <span className={cn("rounded px-1.5 text-[11px] uppercase", q.priority === "urgent" ? "bg-red-500/15 text-red-700 dark:text-red-300" : q.priority === "high" ? "bg-amber-500/15 text-amber-800 dark:text-amber-200" : "bg-muted")}>{q.priority}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{q.subject || "(no subject)"}</span>
                <span className="text-xs text-muted-foreground">
                  {ACTION_LABELS[q.action] ?? q.action} · {q.stage} · as {q.capacity}
                </span>
                <span className={cn("text-xs tabular", q.overdue ? "text-destructive" : "text-muted-foreground")}>{q.dueAt ? `due ${when(q.dueAt)}` : `since ${when(q.since)}`}</span>
              </Link>
            ))}
            {!queue.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing waits for you.</p>}
          </CardContent>
        </Card>
        <div className="space-y-4">
          {rights.create && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">My letters in approval ({mine.total})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                {mine.rows.map((r) => (
                  <Link key={r.id} href={`/correspondence/${r.id}`} className="flex justify-between gap-2 rounded px-1 py-0.5 hover:bg-muted">
                    <span className="truncate">{r.subject || "(no subject)"}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{STATUS_LABEL[r.status]}</span>
                  </Link>
                ))}
                {!mine.rows.length && <p className="text-xs text-muted-foreground">None.</p>}
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">What I acted on</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs">
              {recent.map((r, i) => {
                const cap = (() => {
                  try {
                    return (JSON.parse(r.capacity ?? "{}") as { label?: string }).label ?? "";
                  } catch {
                    return "";
                  }
                })();
                return (
                  <Link key={i} href={`/correspondence/${r.document_id}`} className="block rounded px-1 py-0.5 hover:bg-muted">
                    <span className="font-medium">{r.status}</span> {r.ref_number ?? r.subject} <span className="text-muted-foreground">· {cap} · {when(r.acted_at)}</span>
                  </Link>
                );
              })}
              {!recent.length && <p className="text-muted-foreground">Nothing yet.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
