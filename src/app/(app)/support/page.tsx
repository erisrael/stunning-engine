import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { userDirectory } from "@/server/users";
import { appOrigin } from "@/server/password-reset";
import * as sd from "@/server/support-desk";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { Desk, Inbox, NewTicket, TicketView } from "@/components/app/support/desk";
import { Apps, Canned, DeveloperApi, KnowledgeBase, Monitor, Queues, SupportSettings } from "@/components/app/support/setup";
import * as ch from "@/server/support-channels";
import { all } from "@/server/db";
import { cn } from "@/lib/utils";

export const metadata = { title: "Customer support" };

// The help desk: the agents' inbox and tickets with calls; for leads the monitor and queues; for Admin the setup.
export default async function SupportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const cfg = await sd.supportConfig();
  const admin = sd.isAdmin(viewer);
  const lead = await sd.isLead(viewer, cfg);
  const agent = await sd.isAgent(viewer);
  if (!admin && (!cfg.enabled || !agent))
    return (
      <div className="space-y-4">
        <PageHeader title="Customer support" description="The help desk for the customers of Myseed's apps." />
        <EmptyState title={cfg.enabled ? "You are not a support agent" : "Customer support is switched off"} description={cfg.enabled ? "A support lead adds agents to the queues." : "Admin switches it on in Support setup."} />
      </div>
    );
  const tabs = [...(cfg.enabled && agent ? ["desk", "kb"] : []), ...(lead && cfg.enabled ? ["monitor"] : []), ...(lead ? ["queues", "apps"] : []), ...(admin || lead ? ["settings"] : [])];
  const LABELS: Record<string, string> = { kb: "Knowledge base", desk: "Desk", monitor: "Monitor", queues: "Queues and replies", apps: "Apps and SDK", settings: "Settings" };
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : tabs[0]!;
  const people = (await userDirectory()).map((u) => ({ id: u.id, name: u.name }));
  const queues = await sd.listQueues();

  let panel: React.ReactNode = null;
  if (tab === "desk") {
    const view = sp.view ?? "mine";
    const rows = await sd.inbox(viewer, view, sp.q ?? null);
    const count = async (v: string) => (await sd.inbox(viewer, v)).length;
    const views = [
      { key: "mine", label: "Mine", count: await count("mine") },
      { key: "unassigned", label: "Unassigned", count: await count("unassigned") },
      { key: "all", label: "All open" },
      { key: "breached", label: "Late", count: await count("breached") },
      ...queues.filter((q) => q.active && (lead || q.members.includes(viewer.id))).map((q) => ({ key: `queue:${q.id}`, label: q.name })),
      { key: "solved", label: "Solved" },
    ];
    const detail = sp.ticket ? await sd.ticketDetail(viewer, sp.ticket).catch(() => null) : null;
    const me = await get<{ status: string; last_seen_at: string | null }>("SELECT status, last_seen_at FROM sup_agents WHERE user_id = ?", viewer.id);
    const agents = people.filter((p) => queues.some((q) => q.members.includes(p.id)) || cfg.leads.includes(p.id));
    panel = (
      <Desk status={me?.status ?? "offline"} record={cfg.recordCalls}>
        <div className="flex justify-end">
          <NewTicket queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))} />
        </div>
        <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
          <div className={cn(detail && "hidden lg:block")}>
            <Inbox rows={rows} view={view} views={views} q={sp.q ?? ""} openId={sp.ticket ?? null} />
          </div>
          {detail ? (
            <div className="min-w-0 space-y-2">
            <Link href={`/support?view=${encodeURIComponent(view)}`} className="text-sm text-primary hover:underline lg:hidden">
              ← Tickets
            </Link>
            <TicketView d={detail as Parameters<typeof TicketView>[0]["d"]} agents={agents} queues={queues.map((q) => ({ id: q.id, name: q.name }))} canned={await sd.cannedReplies()} me={viewer.id} lead={lead} articles={(await ch.listArticles(viewer)).filter((x) => x.published).map((x) => ({ id: x.id, title: x.title }))} origin={await appOrigin()} />
            </div>
          ) : (
            <div className="hidden lg:block"><EmptyState title="Choose a ticket" description="Go online to be given new tickets and calls. Tickets that wait because nobody is free are given out as agents come online." /></div>
          )}
        </div>
      </Desk>
    );
  } else if (tab === "monitor") {
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
    panel = <Monitor m={await sd.monitor(viewer, { from, to })} from={from} to={to} />;
  } else if (tab === "queues")
    panel = (
      <div className="grid gap-4 xl:grid-cols-2">
        <Queues queues={queues} people={people} />
        <Canned list={await sd.cannedReplies()} />
      </div>
    );
  else if (tab === "apps") {
    const apps = await sd.listApps(viewer);
    panel = (
      <div className="space-y-4">
        <Apps apps={apps} queues={queues} origin={await appOrigin()} admin={admin} />
        <DeveloperApi origin={await appOrigin()} appKey={apps[0]?.publicKey ?? null} />
      </div>
    );
  }
  else if (tab === "settings")
    panel = <SupportSettings cfg={cfg} people={people} admin={admin} mailboxes={(await all<{ address: string }>("SELECT address FROM email_senders WHERE mailbox = 1 AND active = 1 ORDER BY address")).map((m) => m.address)} telegram={await ch.telegramInfo()} />;
  else if (tab === "kb") panel = <KnowledgeBase list={await ch.listArticles(viewer)} lead={lead} origin={await appOrigin()} />;

  return (
    <div className="space-y-4">
      <PageHeader title="Customer support" description="Questions and calls from customers of Myseed's apps, given out to agents by queue, with targets, recordings and monitoring." />
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Support">
        {tabs.map((t) => (
          <Link key={t} href={`/support?tab=${t}`} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {LABELS[t]}
          </Link>
        ))}
      </nav>
      {panel}
    </div>
  );
}
