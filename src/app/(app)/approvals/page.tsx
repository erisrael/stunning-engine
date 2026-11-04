import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { get } from "@/server/db";
import { myLeave } from "@/server/leave";
import { listClaims } from "@/server/finance";
import { attendanceInbox, corrections } from "@/server/attendance";
import { shellCounts } from "@/server/shell";
import { all } from "@/server/db";
import { rejectedList } from "@/server/editorial";
import { leadDesk, ledStages } from "@/server/team-flow";
import { STAGE_LABELS, type Stage } from "@/lib/domain";
import { fmtDateTime } from "@/lib/format";
import { getSettings } from "@/server/settings";
import { ApprovalRow } from "./approval-row";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Approvals" };

type Row = { id: string; text: string; meta: string; href?: string; handover?: { id: string; itemIds: string[] }; item?: string };
type Section = { key: string; title: string; description: string; count: number; href: string; action: string; rows: Row[] };

// Handover batches waiting for this person: sent to them, or to a team they lead (the same rule as the sidebar count).
async function handoversToCheck(viewer: { id: string; leads: string[] }, tz: string): Promise<Row[]> {
  const leads = viewer.leads;
  const rows = await all<{ id: string; code: string; from_stage: Stage; to_stage: Stage; created_at: string; sender: string | null; item_id: string }>(
    `SELECT h.id, h.code, h.from_stage, h.to_stage, h.created_at, u.name AS sender, x.item_id
     FROM handovers h JOIN handover_items x ON x.handover_id = h.id AND x.status = 'pending' LEFT JOIN users u ON u.id = h.from_user
     WHERE h.status IN ('open','partial') AND (h.to_user = ?${leads.length ? ` OR (h.to_user IS NULL AND h.to_stage IN (${leads.map(() => "?").join(",")}))` : ""})
     ORDER BY h.created_at`,
    viewer.id,
    ...leads,
  );
  const out = new Map<string, Row & { n: number; ids: string[] }>();
  for (const r of rows) {
    const cur = out.get(r.id) ?? { id: r.id, n: 0, ids: [], text: "", meta: "", href: `/handovers/${r.id}` };
    cur.n++;
    cur.ids.push(r.item_id);
    cur.text = `${r.code}: ${cur.n} ${cur.n === 1 ? "part" : "parts"} from ${STAGE_LABELS[r.from_stage]}`;
    cur.meta = `To ${STAGE_LABELS[r.to_stage]}. Sent ${fmtDateTime(r.created_at, tz)}${r.sender ? ` by ${r.sender}` : ""}`;
    out.set(r.id, cur);
  }
  return [...out.values()].map(({ n: _n, ids, ...r }) => ({ ...r, handover: { id: r.id, itemIds: ids } }));
}

// Everything waiting for this person's decision in one list: leave, expense claims, attendance corrections and
// reviews, handovers to check, and timer corrections. Each links to where it is decided.
export default async function ApprovalsPage() {
  const viewer = await requireViewer();
  const hr = can(viewer, "attendance.manage");
  const [leave, claims, corr, counts, inbox, hrLeave] = await Promise.all([
    myLeave(viewer),
    listClaims(viewer, "toApprove"),
    corrections(viewer),
    shellCounts(viewer),
    attendanceInbox(viewer),
    can(viewer, "hr.manage") ? get<{ c: number }>("SELECT COUNT(*) AS c FROM leave_requests WHERE status = 'pending_hr'") : Promise.resolve(null),
  ]);
  const tz = (await getSettings()).workspace.timezone;
  const [handovers, rejections, desks] = await Promise.all([
    handoversToCheck(viewer, tz),
    rejectedList(viewer, "to_check"),
    Promise.all(ledStages(viewer).filter((s) => viewer.leads.includes(s)).map((s) => leadDesk(viewer, s))),
  ]);
  const toApprove = desks.flatMap((d) => d?.review ?? []);
  const sections: Section[] = [
    {
      key: "handovers",
      title: "Handovers to check",
      description: "Work handed to you or your team. Open one to accept part of it or reject with a reason.",
      count: handovers.length,
      href: "/handovers",
      action: "All handovers",
      rows: handovers,
    },
    {
      key: "rejected",
      title: "Rejections to cross-check",
      description: "Rejected work waits here before it goes back to the team's To do.",
      count: rejections.filter((r) => r.canCheck).length,
      href: "/handovers/rejected",
      action: "Cross-check",
      rows: [],
    },
    {
      key: "lead-review",
      title: "Work to approve",
      description: "Parts your team finished and sent to you. Open one to return it with a note.",
      count: toApprove.length,
      href: "/dashboard",
      action: "Open Home",
      rows: toApprove.map((i) => ({ id: i.id, text: i.title, meta: `${STAGE_LABELS[i.stage]}${i.ownerName ? ` · ${i.ownerName}` : ""} · ${i.place}`, href: `/items/${i.id}`, item: i.id })),
    },
    {
      key: "leave",
      title: "Leave requests",
      description: "From people who report to you.",
      count: leave.approvals.length,
      href: "/profile?tab=leave",
      action: "Decide",
      rows: leave.approvals.map((r) => ({ id: r.id, text: `${r.employeeName}: ${r.typeLabel}`, meta: `${r.startDate}${r.endDate !== r.startDate ? ` to ${r.endDate}` : ""}, ${r.days} ${r.days === 1 ? "day" : "days"}` })),
    },
    {
      key: "hr-leave",
      title: "Leave for HR",
      description: "Approved by the line manager, waiting for HR.",
      count: Number(hrLeave?.c ?? 0),
      href: "/hr?tab=leave",
      action: "Open HR, Leave",
      rows: [],
    },
    {
      key: "claims",
      title: "Expense claims",
      description: "From people who report to you.",
      count: claims.filter((c) => c.status === "submitted").length,
      href: "/profile?tab=pay&pay=approve",
      action: "Decide",
      rows: claims.filter((c) => c.status === "submitted").map((c) => ({ id: c.id, text: `${c.name}: ${c.description}`, meta: `${c.amount} · ${c.date}` })),
    },
    {
      key: "corrections",
      title: "Attendance corrections",
      description: "Times people asked to correct.",
      count: corr.toDecide.length,
      href: "/attendance?tab=corrections",
      action: "Decide",
      rows: corr.toDecide.map((c) => ({ id: c.id, text: c.full_name, meta: c.day })),
    },
    {
      key: "att-review",
      title: "Attendance to review",
      description: "Hand-made days and flagged check-ins.",
      count: hr ? (inbox?.review ?? 0) : 0,
      href: "/attendance?tab=review",
      action: "Review",
      rows: [],
    },
    { key: "timers", title: "Timer corrections", description: "Changes to recorded work time.", count: Number(counts.corrections), href: "/team", action: "Decide", rows: [] },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" description="Everything waiting for your decision, in one place." />
      {!sections.length ? (
        <EmptyState title="Nothing waiting for you" description="Handovers, rejections, work to approve, leave, claims and corrections that need your decision show up here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s) => (
            <Card key={s.key} data-testid={`approvals-${s.key}`}>
              <CardHeader>
                <CardTitle>
                  {s.title} ({s.count})
                </CardTitle>
                <CardDescription>{s.description}</CardDescription>
                <CardAction>
                  <Button size="sm" asChild>
                    <Link href={s.href}>{s.action}</Link>
                  </Button>
                </CardAction>
              </CardHeader>
              {s.rows.length > 0 && (
                <CardContent>
                  <ul className="divide-y text-sm">
                    {s.rows.slice(0, 8).map((r) =>
                      r.href ? (
                        <ApprovalRow key={r.id} text={r.text} meta={r.meta} href={r.href} handover={r.handover} item={r.item} />
                      ) : (
                        <li key={r.id} className="flex justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate">{r.text}</span>
                          <span className="shrink-0 text-muted-foreground">{r.meta}</span>
                        </li>
                      ),
                    )}
                  </ul>
                  {s.rows.length > 8 && <p className="pt-1 text-xs text-muted-foreground">and {s.rows.length - 8} more</p>}
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
