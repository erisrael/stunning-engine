import Link from "next/link";
import { requireViewer } from "@/server/auth";
import { get } from "@/server/db";
import { userDirectory } from "@/server/users";
import { appOrigin } from "@/server/password-reset";
import * as sd from "@/server/support-desk";
import { EmptyState, PageHeader } from "@/components/app/primitives";
import { AgentBar, Desk, Inbox, NewTicket, TicketView } from "@/components/app/support/desk";
import { Apps, Canned, DeveloperApi, Monitor, Queues, SupportSettings } from "@/components/app/support/setup";
import { KnowledgeBaseScreen } from "@/components/app/support/knowledge-base";
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
import { CHANNEL_LABELS } from "@/lib/support";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { ResizablePane } from "@/components/app/resizable-pane";
import { MessageCircleIcon, MessagesSquareIcon, PhoneCallIcon, SearchIcon } from "lucide-react";

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
        <PageHeader title="Customer support" description="The help desk for the customers of Myseed's apps." actions={<Button asChild size="sm"><Link href="/chat"><MessageCircleIcon /> Open team chat</Link></Button>} />
        <EmptyState title={cfg.enabled ? "You are not a support agent" : "Customer support is switched off"} description={cfg.enabled ? "A support lead adds agents to the queues." : "Admin switches it on in Support setup."} />
      </div>
    );
  const tabs = [...(cfg.enabled && agent ? ["desk", "calls", "students", "kb"] : []), ...(cfg.enabled && (agent || lead) ? ["ratings"] : []), ...(lead && cfg.enabled ? ["monitor", "board"] : []), ...(cfg.enabled && (lead || viewer.perms.includes("support.analytics")) ? ["analytics"] : []), ...(lead ? ["queues", "ivr", "help", "content", "telegram", "bots", "apps", "systems"] : []), ...(admin || lead ? ["config", "settings"] : [])];
  const LABELS: Record<string, string> = { desk: "Desk", calls: "Calls", students: "Students & Parents", kb: "Knowledge base", ratings: "Ratings", monitor: "Monitor", analytics: "Analytics", board: "Live queues", ivr: "Phone menu", queues: "Queues and replies", help: "Help menu and routing", content: "Content", telegram: "Telegram", bots: "Bot manager", apps: "Apps and SDK", systems: "Connected systems", config: "Configuration", settings: "Settings" };
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : tabs[0]!;
  const people = (await userDirectory()).map((u) => ({ id: u.id, name: u.name }));
  const queues = await sd.listQueues();

  let panel: React.ReactNode = null;
  if (tab === "desk") {
    const view = sp.view ?? "mine";
    const filter = { priority: sp.pri ?? null, channel: sp.ch ?? null };
    const rows = await sd.inbox(viewer, view, sp.q ?? null, filter);
    const count = async (v: string) => (await sd.inbox(viewer, v)).length;
    // The spec's ten views (counts where they ask for action), then Late and each queue.
    const counted = new Set(["mine", "unassigned", "waiting", "escalated"]);
    const views = [
      ...(await Promise.all(sd.INBOX_VIEWS.map(async ([key, label]) => ({ key, label, count: counted.has(key) ? await count(key) : undefined })))),
      { key: "breached", label: "Late", count: await count("breached") },
      ...queues.filter((q) => q.active && (lead || q.members.includes(viewer.id))).map((q) => ({ key: `queue:${q.id}`, label: q.name })),
    ];
    const detail = sp.ticket ? await sd.ticketDetail(viewer, sp.ticket).catch(() => null) : null;
    const agents = people.filter((p) => queues.some((q) => q.members.includes(p.id)) || cfg.leads.includes(p.id));
    // Laid out like Team chat: the page fills the screen under the top bar, with the conversation list on the left,
    // the conversation in the middle and the customer on the right (a sheet on narrower screens).
    const myStatus = (await get<{ status: string }>("SELECT status FROM sup_agents WHERE user_id = ?", viewer.id))?.status ?? "offline";
    const backHref = `/support?view=${encodeURIComponent(view)}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}${sp.pri ? `&pri=${sp.pri}` : ""}${sp.ch ? `&ch=${sp.ch}` : ""}`;
    return (
      <Desk bar={false} status={myStatus} record={cfg.recordCalls}>
        <div data-support-shell data-ticket-open={detail ? "" : undefined} className="-mx-3 -my-4 flex h-[calc(100dvh-3.5rem)] flex-col overflow-hidden border-t bg-card sm:-mx-6 sm:-my-6">
          <div className="flex items-center gap-2 border-b px-3">
            <h1 className="hidden shrink-0 py-2 text-sm font-semibold md:block">Customer support</h1>
            <nav data-wrap-tabs className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]" aria-label="Support">
              {tabs.map((t) => (
                <Link key={t} href={`/support?tab=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("shrink-0 border-b-2 px-2.5 py-2.5 text-xs whitespace-nowrap", tab === t ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
                  {LABELS[t]}
                </Link>
              ))}
            </nav>
            <span className="hidden shrink-0 items-center gap-0.5 md:flex">
              <Button asChild size="icon" variant="ghost" title="Team chat" aria-label="Team chat"><Link href="/chat"><MessageCircleIcon /></Link></Button>
              <Button asChild size="icon" variant="ghost" title="Call records" aria-label="Call records"><Link href="/call-records"><PhoneCallIcon /></Link></Button>
            </span>
          </div>
          <div className="flex min-h-0 flex-1">
            {/* The list can be resized with the slider beside it and folded away for more room to chat (kept per device). */}
            <ResizablePane side="left" storageKey="support-list" label="Conversations" initial={340} min={260} max={520} className={cn("flex w-full shrink-0 flex-col border-r", detail && "hidden md:flex")}>
              <div className="flex items-center gap-1.5 border-b px-3 py-2">
                <AgentBar compact status={myStatus} />
                <span className="ml-auto flex shrink-0 items-center gap-1">
                  <StudentLookupDialog trigger={<Button size="icon" variant="outline" className="size-8" title="Look up a parent's phone" aria-label="Look up a parent's phone"><SearchIcon /></Button>} />
                  <NewTicket compact queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))} />
                </span>
              </div>
              <Inbox rows={rows} view={view} views={views} q={sp.q ?? ""} openId={sp.ticket ?? null} pri={sp.pri ?? ""} ch={sp.ch ?? ""} channels={Object.entries(CHANNEL_LABELS).map(([key, label]) => ({ key, label }))} />
            </ResizablePane>
            <section className={cn("min-w-0 flex-1 flex-col", detail ? "flex" : "hidden md:flex")} aria-label="Conversation">
              {detail ? (
                <TicketView backHref={backHref} d={detail as Parameters<typeof TicketView>[0]["d"]} agents={agents} queues={queues.map((q) => ({ id: q.id, name: q.name }))} canned={await sd.cannedReplies()} me={viewer.id} lead={lead} articles={(await ch.listArticles(viewer)).filter((x) => x.published).map((x) => ({ id: x.id, title: x.title }))} origin={await appOrigin()} />
              ) : (
                <div className="chat-wallpaper flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground">
                  <MessagesSquareIcon className="size-10 opacity-40" />
                  <p className="text-sm font-medium text-foreground/80">Choose a conversation</p>
                  <p className="max-w-sm text-xs">Go online to be given new conversations and calls. Conversations that wait because nobody is free are given out as agents come online.</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </Desk>
    );
  } else if (tab === "students") {
    panel = <StudentsTable />;
  } else if (tab === "ratings") {
    const { AgentRatings } = await import("@/components/app/support/agent-ratings");
    const agents = lead ? (await sd.listQueues()).flatMap((q) => q.members).filter((v, i, a) => a.indexOf(v) === i).map((id) => people.find((p) => p.id === id)).filter((p): p is { id: string; name: string } => !!p) : null;
    const first = sp.agent && lead ? sp.agent : agent ? viewer.id : (agents?.[0]?.id ?? viewer.id);
    panel = <AgentRatings initial={await sd.agentRatings(viewer, first)} agents={agents && agents.length ? agents : null} />;
  } else if (tab === "monitor") {
    const today = new Date().toISOString().slice(0, 10);
    const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : new Date(Date.now() - 6 * 864e5).toISOString().slice(0, 10);
    const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : today;
    panel = (
      <div className="space-y-4">
        <Monitor m={await sd.monitor(viewer, { from, to })} from={from} to={to} />
        <CategoryReport r={await hp.categoryReport(viewer, { from, to })} />
        {await (async () => {
          const { updateReports } = await import("@/server/support-analytics");
          const { UpdateReports } = await import("@/components/app/support/update-reports");
          return <UpdateReports r={await updateReports(viewer, { from, to })} />;
        })()}
      </div>
    );
  } else if (tab === "analytics") {
    const D = await import("@/server/support-dashboard");
    const { SupportAnalytics } = await import("@/components/app/support/support-analytics");
    const { datePresetRange, isDatePreset, addisToday } = await import("@/lib/date-presets");
    const { TICKET_STATUSES, TICKET_STATUS_LABELS } = await import("@/lib/support");
    const { customDepartments } = await import("@/server/departments");
    const preset = isDatePreset(sp.range) && sp.range !== "all" ? sp.range : "30days";
    const r = datePresetRange(preset, sp.from, sp.to);
    const today = addisToday();
    const range = { from: r.from ?? today, to: r.until ?? today };
    const members = [...new Set(queues.flatMap((q) => q.members))];
    panel = (
      <SupportAnalytics
        d={await D.supportDashboard(viewer, { ...range, agentId: sp.agent || null, department: sp.department || null, queueId: sp.queue || null, category: sp.category || null, customer: sp.customer || null, status: sp.status || null })}
        preset={preset}
        agents={people.filter((p) => members.includes(p.id))}
        queues={queues.map((q) => ({ id: q.id, name: q.name }))}
        departments={[...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))]}
        statuses={TICKET_STATUSES.map((s) => ({ key: s, label: TICKET_STATUS_LABELS[s] }))}
        canExport={lead || viewer.perms.includes("support.export") || viewer.perms.includes("export.run")}
      />
    );
  } else if (tab === "board") {
    const Q = await import("@/server/support-queues");
    const { QueueBoard } = await import("@/components/app/support/queue-calls");
    panel = <QueueBoard initial={await Q.queueBoard(viewer)} />;
  } else if (tab === "ivr") {
    const I = await import("@/server/support-ivr");
    const { IvrBuilder } = await import("@/components/app/support/ivr-builder");
    const { customDepartments } = await import("@/server/departments");
    const flows = await I.listFlows(viewer);
    const current = flows.find((f) => f.id === sp.flow) ?? flows[0] ?? null;
    const members = [...new Set(queues.flatMap((q) => q.members))];
    panel = (
      <IvrBuilder
        flows={flows}
        detail={current ? await I.flowDetail(viewer, current.id) : null}
        queues={queues.filter((q) => q.active).map((q) => ({ id: q.id, name: q.name }))}
        departments={[...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))]}
        agents={people.filter((p) => members.includes(p.id))}
        apps={(await sd.listApps(viewer)).map((a) => ({ id: a.id, name: a.name }))}
        channels={I.IVR_CHANNELS}
      />
    );
  } else if (tab === "queues")
    panel = (
      <div className="grid gap-4 xl:grid-cols-2">
        <Queues queues={queues} people={people} />
        {await (async () => {
          const Q = await import("@/server/support-queues");
          const { QueueCallSettings } = await import("@/components/app/support/queue-calls");
          const { customDepartments } = await import("@/server/departments");
          const members = [...new Set(queues.flatMap((q) => q.members))];
          const skills = new Map((await all<{ user_id: string; skills: string }>("SELECT user_id, skills FROM sup_agents")).map((r) => [r.user_id, r.skills]));
          return (
            <QueueCallSettings
              queues={await Q.allQueueSettings()}
              departments={[...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))]}
              agents={people.filter((p) => members.includes(p.id)).map((p) => ({ ...p, skills: (() => { try { return JSON.parse(skills.get(p.id) ?? "[]") as string[]; } catch { return []; } })() }))}
            />
          );
        })()}
        <Canned list={await sd.cannedReplies()} />
        {await (async () => {
          const F = await import("@/server/support-forward");
          const { ForwardingSetup } = await import("@/components/app/support/forwarding");
          const { customDepartments } = await import("@/server/departments");
          const departments = [...DEPARTMENTS.map((d) => ({ key: d as string, label: DEPARTMENT_LABELS[d] })), ...(await customDepartments()).map((d) => ({ key: d.key, label: d.title }))];
          const roles = (await (await import("@/server/role-catalog")).roleCatalog()).map((r) => ({ key: r.key, label: r.label }));
          return <ForwardingSetup initial={await F.listForwardTargets(viewer)} pending={lead ? await F.pendingForwards(viewer) : []} people={people} departments={departments} roles={roles} lead={lead} />;
        })()}
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
  else if (tab === "content") {
    const { listBots } = await import("@/server/bot-manager");
    const { SupportContentManager } = await import("@/components/app/support/content-manager");
    const bots = (await listBots(viewer)).map((b) => ({ key: b.key, name: b.name }));
    panel = <SupportContentManager bots={bots.length ? bots : [{ key: "default", name: "Default bot" }]} />;
  }
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
  else if (tab === "config" && lead) {
    const C = await import("@/server/support-center");
    const { ConfigCenter } = await import("@/components/app/support/config-center");
    panel = <ConfigCenter areas={await C.configurationCenter(viewer)} config={await C.centerConfig()} status={await C.supportOpen()} />;
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
  else if (tab === "kb") {
    const kb = await import("@/server/kb-guides");
    const filters = { q: sp.q ?? "", status: sp.status ?? "", category: sp.category ?? "", kind: sp.kind ?? "" };
    const categories = (await all<{ category: string }>("SELECT DISTINCT category FROM sup_articles WHERE category IS NOT NULL ORDER BY category")).map((r) => r.category);
    panel = <KnowledgeBaseScreen list={await kb.listKb(viewer, filters)} lead={lead} origin={await appOrigin()} categories={categories} filters={filters} />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Customer support"
        description="Questions and calls from customers of Myseed's apps, given out to agents by queue, with targets, recordings and monitoring."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link href="/chat"><MessageCircleIcon /> Team chat</Link></Button>
            {tabs.includes("calls") && <Button asChild size="sm" variant="outline"><Link href="/call-records"><PhoneCallIcon /> Call records</Link></Button>}
            <StudentLookupDialog />
          </div>
        }
      />
      <nav data-wrap-tabs className="flex gap-1 overflow-x-auto border-b [scrollbar-width:none]" aria-label="Support">
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
