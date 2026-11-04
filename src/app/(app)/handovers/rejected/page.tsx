import { requireCapability } from "@/server/auth";
import { crossCheckCount, rejectedList } from "@/server/editorial";
import { handoverConfig } from "@/server/handover-config";
import { getSettings } from "@/server/settings";
import { can } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { HandoverNav } from "../handover-nav";
import { RejectedClient } from "./rejected-client";

export const metadata = { title: "Rejected handovers" };

const WHO = { sender_lead: "the sending team's lead", receiver_lead: "the receiving team's lead", manager: "a manager" };
const TABS = ["to_check", "confirmed", "overturned"] as const;

export default async function RejectedPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const viewer = await requireCapability("nav.handovers");
  const sp = await searchParams;
  const tab = (TABS as readonly string[]).includes(sp.tab ?? "") ? (sp.tab as (typeof TABS)[number]) : "to_check";
  const [rows, cfg, settings, count] = await Promise.all([rejectedList(viewer, tab), handoverConfig(), getSettings(), crossCheckCount(viewer)]);
  const priority = cfg.rejectedPriority === "keep" ? "its priority unchanged" : `${cfg.rejectedPriority} priority`;
  return (
    <div className="space-y-4">
      <PageHeader
        help="lead"
        title="Rejected"
        description={cfg.crossCheck ? `A rejection waits here until ${WHO[cfg.checker]} or a manager checks it. If it is right, the work goes to the team's To do with ${priority}. If it is wrong, the work moves on to the next team.` : `Cross-checking is off, so rejected work goes straight to the team's To do with ${priority}.`}
      />
      <HandoverNav settings={can(viewer, "settings.manage") || can(viewer, "users.manage")} rejected={count} />
      <RejectedClient rows={rows} tab={tab} tz={settings.workspace.timezone} />
    </div>
  );
}
