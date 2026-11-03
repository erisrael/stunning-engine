import { requireViewer } from "@/server/auth";
import { getSettings } from "@/server/settings";
import { userDirectory } from "@/server/users";
import * as r from "@/server/recognition";
import { PageHeader, EmptyState } from "@/components/app/primitives";
import { RecognitionClient } from "./recognition-client";
import { localParts } from "@/lib/attendance";

export const metadata = { title: "Recognition" };

// Recognition: the leaderboard, badges and titles, kudos, and (Admin) the settings with the on and off switch.
export default async function RecognitionPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const sp = await searchParams;
  const cfg = await r.recognitionConfig();
  const admin = r.configures(viewer);
  const tz = (await getSettings()).workspace.timezone;
  const current = localParts(new Date().toISOString(), tz).date.slice(0, 7);
  if (!cfg.enabled && !admin)
    return (
      <div className="space-y-4">
        <PageHeader title="Recognition" description="Badges, titles, kudos and the leaderboard." />
        <EmptyState title="Recognition is switched off" description="Admin can switch it on in Recognition setup." />
      </div>
    );
  const boardAllowed = cfg.enabled && (cfg.leaderboard === "everyone" || r.seesAll(viewer));
  const tabs = [...(cfg.enabled ? [...(boardAllowed ? ["leaderboard"] : []), "badges", ...(cfg.kudos ? ["kudos"] : [])] : []), ...(admin ? ["settings"] : [])];
  const tab = tabs.includes(sp.tab ?? "") ? sp.tab! : tabs[0]!;
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") ? sp.period! : current;
  const board = tab === "leaderboard" ? await r.leaderboard(viewer, period, sp.dept ?? null) : null;
  const awards = cfg.enabled && tab === "badges" ? await r.awards(viewer, { limit: 200 }) : [];
  const kudos = cfg.enabled && tab === "kudos" ? await r.kudosWall(viewer) : [];
  const people = (await userDirectory()).filter((u) => u.id !== viewer.id).map((u) => ({ id: u.id, name: u.name }));
  return (
    <div className="space-y-4">
      <PageHeader title="Recognition" description="Who is doing well this month, badges earned by fixed rules, titles from HR, and kudos between colleagues." />
      <RecognitionClient
        tab={tab}
        tabs={tabs}
        cfg={cfg}
        board={board}
        awards={awards}
        kudos={kudos}
        people={people}
        viewerId={viewer.id}
        seesAll={r.seesAll(viewer)}
        admin={admin}
        period={period}
        current={current}
        dept={sp.dept ?? ""}
      />
    </div>
  );
}
