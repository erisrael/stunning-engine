import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { leadDesk, myWork } from "@/server/team-flow";
import { userDirectory } from "@/server/users";
import { appOrigin } from "@/server/password-reset";
import * as sd from "@/server/support-desk";
import * as ch from "@/server/support-channels";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { MyBoard } from "@/components/app/team-flow";
import { Desk, Inbox, TicketView } from "@/components/app/support/desk";
import { STAGE_LABELS, STAGES } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { TakeWork } from "./take-work";

export const metadata = { title: "My work" };

// The person's own work, apart from managing a team: their production parts as a board, parts waiting in the stages
// they lead that they can take themselves, and, for support agents, their open tickets with the conversation.
export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ tab?: string; ticket?: string; view?: string }> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const cfg = await sd.supportConfig();
  const agent = cfg.enabled && (await sd.isAgent(viewer));
  const [mine, desks] = await Promise.all([myWork(viewer), Promise.all(STAGES.filter((s) => viewer.leads.includes(s)).map((s) => leadDesk(viewer, s)))]);
  const unassigned = desks.flatMap((d) => d?.unassigned ?? []);
  const tabs = [...(mine.stages.length || unassigned.length ? ["production"] : []), ...(agent ? ["support"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : sp.ticket ? "support" : (tabs[0] ?? "production");

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
              {t === "production" ? `Production (${mine.items.length})` : "Customer support"}
            </Link>
          ))}
        </nav>
      )}
      {!tabs.length && <EmptyState title="Nothing assigned to you" description="Work given to you shows here." />}
      {tab === "production" && tabs.includes("production") && (
        <div className="space-y-6" data-my-work>
          <MyBoard items={mine.items} title="My work" />
          {unassigned.length > 0 && <TakeWork items={unassigned.map((i) => ({ id: i.id, code: i.code, title: i.title, place: i.place, stage: i.stage, stageLabel: STAGE_LABELS[i.stage] }))} me={viewer.id} />}
        </div>
      )}
      {support}
    </div>
  );
}
