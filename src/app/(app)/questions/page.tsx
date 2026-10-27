import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { all, nowIso } from "@/server/db";
import { getSettings } from "@/server/settings";
import { canViewItem, userDirectory } from "@/server/users";
import { fmtDateTime } from "@/lib/format";
import { MetricCard, PageHeader } from "@/components/app/primitives";
import { QuestionsPanel } from "../items/[id]/item-client";
import { cn } from "@/lib/utils";

export const metadata = { title: "Questions" };

type Q = { id: string; item_id: string | null; code: string | null; title: string | null; asked_by: string; owner_id: string; question: string; due_at: string | null; status: string; answer: string | null; answered_at: string | null; created_at: string; escalation_level: number; context_type: string; stage: string | null };

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const viewer = await requireCapability("nav.questions");
  const { show = "open" } = await searchParams;
  const isManager = viewer.roles.includes("manager");
  const tz = (await getSettings()).workspace.timezone;
  const now = nowIso();
  const allRows = (await all<Q>(
      `SELECT q.*, i.code, i.title FROM manager_questions q LEFT JOIN items i ON i.id = q.item_id
     ${isManager ? "" : "WHERE q.owner_id = ? OR q.asked_by = ?"} ORDER BY CASE q.status WHEN 'open' THEN 0 WHEN 'answered' THEN 1 ELSE 2 END, COALESCE(q.due_at, '9999')`,
      ...(isManager ? [] : [viewer.id, viewer.id]),
    ));
  const rows: Q[] = [];
  for (const q of allRows) if (!q.item_id || (await canViewItem(viewer, q.item_id))) rows.push(q);
  const counts = {
    open: rows.filter((q) => q.status === "open").length,
    overdue: rows.filter((q) => q.status === "open" && q.due_at && q.due_at < now).length,
    answered: rows.filter((q) => q.status === "answered").length,
    escalated: rows.filter((q) => q.status === "open" && q.escalation_level > 0).length,
  };
  const shown = rows.filter((q) =>
    show === "all" ? true : show === "overdue" ? q.status === "open" && !!q.due_at && q.due_at < now : show === "escalated" ? q.status === "open" && q.escalation_level > 0 : show === "mine" ? q.owner_id === viewer.id : q.status === show,
  );
  const users = await userDirectory();
  const groups = new Map<string, Q[]>();
  for (const q of shown) {
    const k = q.item_id ?? "general";
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(q);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isManager ? "Manager questions" : "Questions for me"}
        description="Tracked questions with an owner, an optional answer deadline and escalation history. Unanswered questions stay visible until resolved."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <MetricCard label="Open" value={counts.open} href="/questions?show=open" definition={{ definition: "Questions waiting for an answer." }} />
        <MetricCard label="Past answer deadline" value={counts.overdue} tone={counts.overdue ? "danger" : "default"} href="/questions?show=overdue" definition={{ definition: "Open questions whose answer deadline has passed. These are escalated automatically once." }} />
        <MetricCard label="Escalated" value={counts.escalated} tone={counts.escalated ? "warning" : "default"} href="/questions?show=escalated" definition={{ definition: "Open questions escalated by a manager or by the deadline check." }} />
        <MetricCard label="Answered, not resolved" value={counts.answered} href="/questions?show=answered" definition={{ definition: "Answered questions a manager has not yet marked resolved." }} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["open", "overdue", "escalated", "answered", "resolved", "mine", "all"].map((k) => (
          <Link key={k} href={`/questions?show=${k}`} className={cn("h-7 rounded-full border px-3 text-xs capitalize leading-7", show === k ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
            {k === "mine" ? "Assigned to me" : k}
          </Link>
        ))}
      </div>
      {shown.length === 0 && <p className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">No questions in this view.</p>}
      {[...groups.entries()].map(([k, qs]) => (
        <section key={k} className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {qs[0].item_id ? (
              <Link href={`/items/${qs[0].item_id}?tab=discussion`} className="text-sm font-medium hover:underline">
                <span className="font-mono text-xs text-muted-foreground">{qs[0].code}</span> {qs[0].title}
              </Link>
            ) : (
              <span className="text-sm font-medium">General questions</span>
            )}
            <span className="text-xs text-muted-foreground">Oldest asked {fmtDateTime(qs.map((q) => q.created_at).sort()[0], tz)}</span>
          </div>
          <QuestionsPanel itemId={k} questions={qs} users={users} viewerId={viewer.id} isManager={isManager} allowAsk={false} tz={tz} defaultOwner={null} stage={null} />
        </section>
      ))}
    </div>
  );
}

