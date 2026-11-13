import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { leadDesk, myWork, myWorkCount, waitingInStage } from "@/server/team-flow";
import { takeLimit, myDeptTasks, takeStages, takeRequestsFor, myTakeRequests, takeRules, myWorkViews } from "@/server/my-work";
import { userDirectory, can } from "@/server/users";
import { appOrigin } from "@/server/password-reset";
import * as sd from "@/server/support-desk";
import * as ch from "@/server/support-channels";
import { adminWorkspaceData } from "@/server/admin-workspace";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { MyBoard } from "@/components/app/team-flow";
import { Desk, Inbox, TicketView } from "@/components/app/support/desk";
import { AdminWorkDesk } from "@/components/app/admin-work-desk";
import { STAGE_LABELS, STAGES } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { TakeRequests, TakeRulesEditor, TakeWork } from "./take-work";
import { MyPartsTable, MyTasksTable } from "./my-tables";

export const metadata = { title: "My work" };

// The person's own work, apart from managing a team: their production parts as a board, parts waiting in the stages
// they lead that they can take themselves, for support agents their open tickets, and for Admin their workspace.
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; view?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const cfg = await sd.supportConfig();
  const agent = cfg.enabled && (await sd.isAgent(viewer));
  const isAdmin = viewer.activeRole === "admin" || can(viewer, "users.manage");
  const [mine, toDo, desks] = await Promise.all([myWork(viewer), myWorkCount(viewer), Promise.all(STAGES.filter((s) => viewer.leads.includes(s)).map((s) => leadDesk(viewer, s)))]);
  // Parts waiting with nobody on them: in the stages they lead, and where Admin lets team members take work.
  const canTake = await takeStages(viewer);
  const memberStages = canTake.filter((s) => !s.lead && !desks.some((d) => d?.stage === s.stage)).map((s) => s.stage);
  const unassigned = [...desks.flatMap((d) => d?.unassigned ?? []), ...(await Promise.all(memberStages.map((s) => waitingInStage(viewer, s)))).flat()];
  const [toApprove, pendingMine] = await Promise.all([takeRequestsFor(viewer), myTakeRequests(viewer)]);
  const canShare = can(viewer, "items.plan") || viewer.roles.includes("manager");
  // Tasks assigned to this person in every department (Marketing, Finance, HR …), in one table.
  const tasks = await myDeptTasks(viewer).catch(() => []);
  const tabs = [
    ...(isAdmin ? ["admin"] : []),
    ...(mine.stages.length || unassigned.length || toApprove.length ? ["production"] : []),
    ...(tasks.length ? ["tasks"] : []),
    ...(agent ? ["support"] : []),
  ];
  const board = sp.view !== "table";
  const defaultTab = isAdmin ? "admin" : tabs.includes("production") ? "production" : tabs.includes("tasks") ? "tasks" : (tabs[0] ?? "admin");
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : sp.ticket ? "support" : defaultTab;

  let support: React.ReactNode = null;
  if (tab === "support" && agent) {
    const view = sp.view === "pending" || sp.view === "solved" ? sp.view : "mine";
    const rows = await sd.inbox(viewer, view);
    const counts = { mine: (await sd.inbox(viewer, "mine")).length };
    const detail = sp.ticket ? await sd.ticketDetail(viewer, sp.ticket).catch(() => null) : null;
    const me = await get<{ status: string }>("SELECT status FROM sup_agents WHERE user_id = ?", viewer.id);
    const queues = await sd.listQueues();
    const people = (await userDirectory()).map((u) => ({ id: u.id, name: u.name }));
    support = (
      <Desk status={me?.status ?? "offline"} record={cfg.recordCalls}>
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className={cn(detail && "hidden lg:block")}>
            <Inbox base="/my-work?tab=support" rows={rows} view={view} views={[{ key: "mine", label: "My open tickets", count: counts.mine }, { key: "solved", label: "Solved" }]} q="" openId={sp.ticket ?? null} />
          </div>
          {detail ? (
            <div className="space-y-2">
              <Link href={`/my-work?tab=support&view=${view}`} className="text-sm text-primary hover:underline lg:hidden">
                ← My tickets
              </Link>
              <TicketView
                d={detail as Parameters<typeof TicketView>[0]["d"]}
                agents={people.filter((p) => queues.some((q) => q.members.includes(p.id)) || cfg.leads.includes(p.id))}
                queues={queues.map((q) => ({ id: q.id, name: q.name }))}
                canned={await sd.cannedReplies()}
                me={viewer.id}
                lead={await sd.isLead(viewer, cfg)}
                articles={(await ch.listArticles(viewer)).filter((x) => x.published).map((x) => ({ id: x.id, title: x.title }))}
                origin={await appOrigin()}
              />
            </div>
          ) : (
            <div className="hidden lg:block">
              <EmptyState title="Choose a ticket" description="Your open tickets are on the left. Reply, call, change the status or hand it to someone else from the conversation." />
            </div>
          )}
        </div>
      </Desk>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="My work" description="Only your own work. Managing your team stays on Home." />
      {tabs.length > 1 && (
        <nav className="flex gap-1 border-b" aria-label="My work">
          {tabs.map((t) => (
            <Link key={t} href={`/my-work?tab=${t}`} className={cn("-mb-px border-b-2 px-3 py-2 text-sm", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground")}>
              {t === "production" ? `Production (${toDo} to do)` : t === "tasks" ? `Tasks (${tasks.length})` : t === "admin" ? "Admin workspace" : "Customer support"}
            </Link>
          ))}
        </nav>
      )}
      {!tabs.length && <EmptyState title="Nothing assigned to you" description="Work given to you shows here." />}
      {tab === "admin" && isAdmin && (
        <div className="space-y-4">
          <TakeRulesEditor rules={await takeRules()} stages={STAGES.filter((s) => s !== "publication")} />
          <AdminWorkDesk data={await adminWorkspaceData(viewer)} />
        </div>
      )}
      {tab === "production" && tabs.includes("production") && (
        <div className="space-y-6" data-my-work>
          <div className="flex items-center justify-end gap-1" role="radiogroup" aria-label="My parts as">
            {(["board", "table"] as const).map((v) => (
              <Link key={v} role="radio" aria-checked={(v === "board") === board} href={`/my-work?tab=production&view=${v}`} className={cn("rounded-md border px-2.5 py-1 text-xs capitalize", (v === "board") === board ? "border-primary bg-primary/10 font-medium" : "text-muted-foreground hover:bg-muted")}>
                {v}
              </Link>
            ))}
          </div>
          {board ? (
            <MyBoard items={mine.items} title="My work" />
          ) : (
            <MyPartsTable canShare={canShare} views={await myWorkViews(viewer, "my-work:parts")} items={mine.items.map((i) => ({ id: i.id, code: i.code, title: i.title, grade: i.grade, subject: i.subject, unitNumber: i.unitNumber, partNumber: i.partNumber, stage: i.stage, status: i.status, priority: i.priority, dueAt: i.dueAt, draft: i.draft }))} />
          )}
          <TakeRequests rows={toApprove} />
          {unassigned.length > 0 && (
            <TakeWork
              stages={canTake}
              pendingMine={pendingMine.length}
              items={unassigned.map((i) => ({
                id: i.id,
                code: i.code,
                title: i.title,
                place: i.place,
                stage: i.stage,
                stageLabel: STAGE_LABELS[i.stage],
                grade: i.grade ?? null,
                subject: i.subject ?? null,
                unitNumber: i.unitNumber ?? null,
                partNumber: i.partNumber ?? null,
                priority: i.priority,
                dueAt: i.dueAt ?? null,
              }))}
              limit={await takeLimit()}
            />
          )}
        </div>
      )}
      {tab === "tasks" && tabs.includes("tasks") && <MyTasksTable tasks={tasks} canShare={canShare} views={await myWorkViews(viewer, "my-work:tasks")} />}
      {support}
    </div>
  );
}
