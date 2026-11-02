import { EmptyState } from "@/components/app/primitives";
import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { all } from "@/server/db";
import { listLog, listSenders, listTemplates, sendersFor, smtpSettings, SMTP_PRESETS, type LogFilter } from "@/server/email";
import { secretSource } from "@/server/secrets";
import { getSettings } from "@/server/settings";
import { can, userDirectory } from "@/server/users";
import { localInputToIso } from "@/lib/format";
import { PageHeader } from "@/components/app/primitives";
import { EmailClient } from "./email-client";
import { mailboxes, mailConfig, myMailbox } from "@/server/mail";
import { MailClient } from "@/components/app/mail-client";
import { MailAdmin } from "@/components/app/mail-admin";

export const metadata = { title: "Email" };

const TABS = ["inbox", "compose", "sent", "templates", "settings"] as const;

export default async function EmailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  // Conversations and mail are private; View as does not open them.
  if (viewer.previewBy) return <EmptyState title="Private in View as" description={`${viewer.name}'s ${"email"} is private, so View as does not show it.`} />;
  const manage = can(viewer, "email.manage");
  const canSend = can(viewer, "email.send") || manage;
  const own = await myMailbox(viewer.id);
  const mc = await mailConfig();
  const canOpenOthers = manage && mc.adminOpen;
  const hasInbox = !!own || canOpenOthers;
  if (!canSend && !hasInbox) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const defaultTab = hasInbox ? "inbox" : "compose";
  const allowed = (t: string) => (t === "inbox" ? hasInbox : t === "settings" ? manage : canSend);
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") && allowed(sp.tab!) ? (sp.tab as (typeof TABS)[number]) : defaultTab;
  const tz = (await getSettings()).workspace.timezone;
  const filter: LogFilter = {
    q: sp.q ?? null,
    status: sp.status ?? null,
    sender: sp.sender ?? null,
    from: sp.from ? localInputToIso(`${sp.from}T00:00`, tz) : null,
    to: sp.to ? localInputToIso(`${sp.to}T23:59`, tz) : null,
    mine: sp.mine === "1",
    sort: (["created", "subject", "recipients", "failed"] as const).find((s) => s === sp.sort) ?? "created",
    dir: sp.dir === "asc" ? "asc" : "desc",
  };
  const [smtp, senders, allSenders, templates, directory, groups, log] = await Promise.all([
    smtpSettings(),
    sendersFor(viewer),
    manage ? listSenders() : Promise.resolve([]),
    listTemplates(viewer),
    userDirectory(),
    all<{ id: string; name: string; kind: string }>(
      manage
        ? "SELECT id, name, kind FROM chat_groups WHERE kind <> 'direct' AND archived = 0 ORDER BY name"
        : "SELECT g.id, g.name, g.kind FROM chat_groups g JOIN chat_members m ON m.group_id = g.id AND m.user_id = ? WHERE g.kind <> 'direct' AND g.archived = 0 ORDER BY g.name",
      ...(manage ? [] : [viewer.id]),
    ),
    tab === "sent" ? listLog(viewer, filter) : Promise.resolve([]),
  ]);
  const boxes = manage ? await mailboxes(viewer) : [];
  const inbox = hasInbox ? (
    <MailClient
      ownBox={own ? { id: own.id, address: own.address } : null}
      others={canOpenOthers ? boxes.filter((b) => b.mailbox && b.userId !== viewer.id).map((b) => ({ id: b.id, address: b.address, name: b.userName })) : []}
      initialBox={sp.box ?? null}
      tz={tz}
    />
  ) : null;
  if (!canSend)
    return (
      <div className="space-y-4">
        <PageHeader help="talk" title="Email" description={`Your company mailbox${own ? `, ${own.address}` : ""}.`} />
        {inbox}
      </div>
    );
  return (
    <div className="space-y-4">
      <PageHeader help="talk" title="Email" description={own ? `Your mailbox ${own.address}, and email to many people at once with a log of what happened for each.` : "Send email to people in the workspace and outside it, from your own address or the organisation's. Every email is logged with what happened for each recipient."} />
      <EmailClient
        tab={tab}
        defaultTab={defaultTab}
        inbox={inbox}
        mailAdmin={manage ? <MailAdmin config={mc} boxes={boxes} people={directory.map((u) => ({ id: u.id, name: u.name, handle: u.handle }))} /> : null}
        canManage={manage}
        viewer={{ id: viewer.id, name: viewer.name, email: viewer.email }}
        smtp={smtp}
        senders={senders}
        allSenders={allSenders}
        templates={templates}
        people={directory.map((u) => ({ id: u.id, name: u.name, roles: u.roles }))}
        groups={groups}
        log={log}
        filter={{ ...filter, from: sp.from ?? null, to: sp.to ?? null }}
        presets={SMTP_PRESETS.map((p) => ({ ...p }))}
        secretSource={secretSource()}
        tz={tz}
      />
    </div>
  );
}
