import { requireCapability } from "@/server/auth";
import { listHandovers, seesAllHandovers, type HandoverFilter, type HandoverStatus } from "@/server/editorial";
import { getSettings } from "@/server/settings";
import { userDirectory } from "@/server/users";
import { PageHeader } from "@/components/app/primitives";
import { STAGES, type Stage } from "@/lib/domain";
import { localInputToIso } from "@/lib/format";
import { HandoverList } from "./handovers-client";

export const metadata = { title: "Handovers" };

const SORTS = ["created", "code", "items", "pending", "status"] as const;
const STATUSES = ["active", "open", "partial", "closed", "cancelled"] as const;

export default async function HandoversPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireCapability("nav.handovers");
  const sp = await searchParams;
  const tz = (await getSettings()).workspace.timezone;
  const base: HandoverFilter = {
    stage: (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : null,
    status: sp.status === "any" ? null : (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as HandoverStatus | "active") : "active",
    person: sp.person || null,
    q: sp.q || null,
    from: sp.from ? localInputToIso(`${sp.from}T00:00`, tz) : null,
    to: sp.to ? localInputToIso(`${sp.to}T23:59`, tz) : null,
    sort: (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as HandoverFilter["sort"]) : "created",
    dir: sp.dir === "asc" ? "asc" : "desc",
  };
  const [incoming, outgoing, everything] = await Promise.all([
    listHandovers(viewer, { ...base, box: "incoming" }),
    listHandovers(viewer, { ...base, box: "outgoing" }),
    listHandovers(viewer, { ...base, box: "all" }),
  ]);
  const box = sp.box === "outgoing" || sp.box === "all" || sp.box === "incoming" ? sp.box : incoming.length || !outgoing.length ? "incoming" : "outgoing";
  const rows = box === "incoming" ? incoming : box === "outgoing" ? outgoing : everything;
  return (
    <div className="space-y-4">
      <PageHeader
        title="Handovers"
        description="Work passed from one team to the next as a batch. The receiving side accepts what arrived or marks items missing with a note, which sends them back to the sender and their lead."
      />
      <HandoverList
        rows={rows}
        box={box}
        counts={{ incoming: incoming.length, outgoing: outgoing.length, all: everything.length }}
        seesAll={seesAllHandovers(viewer)}
        filter={{ ...base, from: sp.from ?? null, to: sp.to ?? null, status: sp.status === "any" ? null : base.status }}
        people={(await userDirectory()).map((u) => ({ id: u.id, name: u.name }))}
        tz={tz}
      />
    </div>
  );
}
