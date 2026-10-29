import Link from "next/link";
import { requireCapability } from "@/server/auth";
import { listItems } from "@/server/queries";
import { filterOptions } from "@/server/view-data";
import { toWorkRows, userNames } from "@/server/rows";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { parseFilters } from "@/lib/filters";
import { STAGE_LABELS, STAGES, isStageRole, type Stage } from "@/lib/domain";
import { PageHeader } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { cn } from "@/lib/utils";
import { Board, type Col } from "./board";
import { PageImport } from "@/components/app/page-import";

export const metadata = { title: "Board" };

const ORDER: Record<string, number> = { in_progress: 0, blocked: 1, awaiting_handoff: 2, paused: 3, queued: 4 };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.board");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const s = await getSettings();
  const myStages = viewer.roles.filter(isStageRole) as Stage[];
  // Own-work members get their personal board; anyone with a stage role can switch to it.
  const mode: "team" | "mine" = sp.board === "mine" || (sp.board !== "team" && viewer.ownWorkOnly) ? (myStages.length ? "mine" : "team") : "team";
  const { rows, total } = await listItems(viewer, { ...filters, sort: "due", dir: "asc" }, nowIso(), { all: true });
  const work = await toWorkRows(rows, viewer.id);
  let cols: Col[];
  if (mode === "mine") {
    const mine = work.filter((r) => r.lifecycle === "in_production" && r.stage && myStages.includes(r.stage) && (r.ownerId === viewer.id || viewer.leads.includes(r.stage)));
    // Recording staff see drafts assigned to them (or unassigned) in To do; dragging one to In progress starts it.
    const drafts = myStages.includes("recording") ? work.filter((r) => r.lifecycle === "draft" && (!r.ownerId || r.ownerId === viewer.id || viewer.leads.includes("recording"))) : [];
    // Items I sent on stay visible until the next team accepts them.
    cols = [
      { key: "queued", label: "To do", hint: "Assigned to you", rows: [...drafts, ...mine.filter((r) => r.stage_status === "queued")] },
      { key: "in_progress", label: "In progress", hint: "Timer running", rows: mine.filter((r) => r.stage_status === "in_progress") },
      { key: "paused", label: "Paused", rows: mine.filter((r) => r.stage_status === "paused") },
      { key: "blocked", label: "Blocked", hint: "Waiting on someone", rows: mine.filter((r) => r.stage_status === "blocked") },
      { key: "awaiting_handoff", label: "Sent to next team", hint: "Waiting for them to accept", rows: mine.filter((r) => r.stage_status === "awaiting_handoff") },
    ];
  } else {
    const published = rows.filter((r) => r.lifecycle === "published").sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, 25).map((r) => r.id);
    cols = [
      { key: "draft", label: "Not started", hint: "Waiting for Recording to start", rows: work.filter((r) => r.lifecycle === "draft") },
      ...STAGES.map((st) => ({
        key: st,
        label: STAGE_LABELS[st],
        hint: viewer.leads.includes(st) ? "Your team · active and blocked first" : "Active and blocked first",
        rows: work.filter((r) => r.lifecycle === "in_production" && r.stage === st).sort((a, b) => (ORDER[a.stage_status ?? ""] ?? 9) - (ORDER[b.stage_status ?? ""] ?? 9)),
      })),
      { key: "published", label: "Published", hint: "Most recent 25", rows: published.map((id) => work.find((w) => w.id === id)!) },
    ];
  }
  return (
    <div className="space-y-4">
      <PageHeader
        title={mode === "mine" ? "My work" : "Board"}
        description={
          mode === "mine"
            ? "Your items in your stage. Drag to start, pause, block or send to the next team. The next team's lead is notified when you send."
            : "Drag a card to the next stage when it is ready; that team's lead is notified. You can only move items in your own stage. Right-click any card for actions."
        }
        actions={
          <>
          <PageImport viewer={viewer} page="work" />
          {myStages.length > 0 && (
            <div className="flex rounded-lg border p-0.5 text-xs">
              {(["team", "mine"] as const).map((k) => (
                <Link key={k} href={`/pipeline?board=${k}`} className={cn("rounded-md px-2.5 py-1 font-medium", mode === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                  {k === "team" ? "Team board" : "My work"}
                </Link>
              ))}
            </div>
          )}
          </>
        }
      />
      <FilterBar options={await filterOptions(viewer, "/pipeline")} total={total} hideKeys={["stage"]} />
      <Board columns={cols} viewer={{ id: viewer.id, roles: viewer.roles, leads: viewer.leads, perms: viewer.perms }} users={await userNames()} tz={s.workspace.timezone} now={Date.now()} mode={mode} />
    </div>
  );
}
