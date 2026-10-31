import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { can } from "@/server/users";
import { get } from "@/server/db";
import { myLeave } from "@/server/leave";
import { listClaims } from "@/server/finance";
import { attendanceInbox, corrections } from "@/server/attendance";
import { shellCounts } from "@/server/shell";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Approvals" };

type Section = { key: string; title: string; description: string; count: number; href: string; action: string; rows: { id: string; text: string; meta: string }[] };

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
  const sections: Section[] = [
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
    { key: "handovers", title: "Handovers to check", description: "Work handed to you or your team.", count: Number(counts.incoming), href: "/handovers", action: "Check", rows: [] },
    { key: "timers", title: "Timer corrections", description: "Changes to recorded work time.", count: Number(counts.corrections), href: "/team", action: "Decide", rows: [] },
  ].filter((s) => s.count > 0);

  return (
    <div className="space-y-4">
      <PageHeader title="Approvals" description="Everything waiting for your decision, in one place." />
      {!sections.length ? (
        <EmptyState title="Nothing waiting for you" description="Leave, claims, corrections and handovers that need your decision show up here." />
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
                    {s.rows.slice(0, 8).map((r) => (
                      <li key={r.id} className="flex justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate">{r.text}</span>
                        <span className="shrink-0 text-muted-foreground">{r.meta}</span>
                      </li>
                    ))}
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
