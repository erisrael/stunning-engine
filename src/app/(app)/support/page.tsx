import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { userDirectory } from "@/server/users";
import { appOrigin } from "@/server/password-reset";
import * as sd from "@/server/support-desk";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { Desk, Inbox, NewTicket, TicketView } from "@/components/app/support/desk";
import { Apps, Canned, DeveloperApi, KnowledgeBase, Monitor, Queues, SupportSettings } from "@/components/app/support/setup";
import { StudentLookupDialog } from "@/components/app/support/student-lookup-dialog";
import { CategoryReport, HelpMenuSetup, TelegramSetup } from "@/components/app/support/help-setup";
import * as hp from "@/server/support-help";
import { Systems } from "@/components/app/support/systems";
import { BotManager } from "@/components/app/support/bot-manager";
import { CallsCenter } from "@/components/app/support/call-center";
import { StudentsTable } from "@/components/app/support/students-table";
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
  const tabs = [...(cfg.enabled && agent ? ["desk", "calls", "students", "kb"] : []), ...(lead && cfg.enabled ? ["monitor"] : []), ...(lead ? ["queues", "help", "telegram", "bots", "apps", "systems"] : []), ...(admin || lead ? ["settings"] : [])];
  const LABELS: Record<string, string> = { desk: "Desk", calls: "Calls", students: "Students & Parents", kb: "Knowledge base", monitor: "Monitor", queues: "Queues and replies", help: "Help menu and routing", telegram: "Telegram", bots: "Bot manager", apps: "Apps and SDK", systems: "Connected systems", settings: "Settings" };
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
    const agents = people.filter((p) => queues.some((q) => q.members.includes(p.id)) || cfg.leads.includes(p.id));
    panel = (
      <>
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
      </>
    );
  } else if (tab === "students") {
    panel = <StudentsTable />;
  } else if (tab === "monitor") {
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
    panel = (
      <div className="space-y-4">
        <Monitor m={await sd.monitor(viewer, { from, to })} from={from} to={to} />
        <CategoryReport r={await hp.categoryReport(viewer, { from, to })} />
      </div>
    );
  } else if (tab === "queues")
    panel = (
      <div className="grid gap-4 xl:grid-cols-2">
        <Queues queues={queues} people={people} />
        <Canned list={await sd.cannedReplies()} />
      </div>
    );
  else if (tab === "help")
    panel = (
      <HelpMenuSetup
        categories={await hp.helpCategories()}
        routes={await hp.listRoutes()}
        queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
        kbCategories={(await all<{ category: string }>("SELECT DISTINCT category FROM sup_articles WHERE category IS NOT NULL ORDER BY category")).map((r) => r.category)}
      />
    );
  else if (tab === "telegram") panel = <TelegramSetup texts={await ch.telegramTexts()} categories={await hp.helpCategories()} health={await ch.telegramHealth()} admin={admin} />;
  else if (tab === "apps") {
    const apps = await sd.listApps(viewer);
    panel = (
      <div className="space-y-4">
        <Apps apps={apps} queues={queues} origin={await appOrigin()} admin={admin} />
        <DeveloperApi origin={await appOrigin()} appKey={apps[0]?.publicKey ?? null} />
      </div>
    );
  }
  else if (tab === "bots") {
    const bm = await import("@/server/bot-manager");
    const bots = await bm.listBots(viewer);
    const bot = bots.find((b) => b.key === sp.bot)?.key ?? bots[0]?.key ?? "default";
    const section = ["content", "forms", "feedback", "settings"].includes(sp.section ?? "") ? sp.section! : "content";
    const fstatus = ["new", "reviewed", "escalated", "all"].includes(sp.fstatus ?? "") ? sp.fstatus! : "new";
    const has = bots.length > 0;
    const resultsId = section === "forms" && sp.form ? sp.form : null;
    panel = (
      <BotManager
        bots={bots}
        bot={bot}
        section={section}
        content={has && section === "content" ? await bm.listContent(viewer, bot) : []}
        pushes={has && section === "content" ? await bm.listPushes(viewer, bot) : []}
        forms={has && section === "forms" ? await bm.listForms(viewer, bot) : []}
        feedback={has && section === "feedback" ? await bm.listFeedback(viewer, bot, fstatus === "all" ? null : fstatus) : []}
        fstatus={fstatus}
        texts={has && section === "settings" ? await ch.telegramTexts(bot) : null}
        results={resultsId ? await bm.formResults(viewer, resultsId).catch(() => null) : null}
        resultsId={resultsId}
      />
    );
  }
  else if (tab === "systems") {
    const { listSystems } = await import("@/server/connected-systems");
    const data = await listSystems(viewer);
    panel = <Systems systems={data.systems} unattached={data.unattached} admin={admin} origin={await appOrigin()} />;
  }
  else if (tab === "settings")
    panel = <SupportSettings cfg={cfg} people={people} admin={admin} mailboxes={(await all<{ address: string }>("SELECT address FROM email_senders WHERE mailbox = 1 AND active = 1 ORDER BY address")).map((m) => m.address)} telegram={await ch.telegramInfo()} queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))} />;
  else if (tab === "calls") {
    const sc = await import("@/server/support-calls");
    const filters = { status: sp.status ?? "", direction: sp.direction ?? "", q: sp.q ?? "", from: sp.from ?? "", to: sp.to ?? "" };
    panel = (
      <CallsCenter
        rows={await sc.callHistory(viewer, { ...filters, customerId: sp.customer ?? null })}
        callbacks={(await sc.callHistory(viewer, { status: "callback" })).reverse()}
        stats={await sc.callStats(viewer)}
        filters={filters}
      />
    );
  }
  else if (tab === "kb") panel = <KnowledgeBase list={await ch.listArticles(viewer)} lead={lead} origin={await appOrigin()} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer support"
        description="Questions and calls from customers of Myseed's apps, given out to agents by queue, with targets, recordings and monitoring."
        actions={<StudentLookupDialog />}
      />
      <nav className="flex gap-1 overflow-x-auto border-b" aria-label="Support">
        {tabs.map((t) => (
          <Link key={t} href={`/support?tab=${t}`} className={cn("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm whitespace-nowrap", tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {LABELS[t]}
          </Link>
        ))}
      </nav>
      {cfg.enabled && agent ? (
        <Desk status={(await get<{ status: string }>("SELECT status FROM sup_agents WHERE user_id = ?", viewer.id))?.status ?? "offline"} record={cfg.recordCalls}>
          {panel}
        </Desk>
      ) : (
        panel
      )}
    </div>
  );
}
