import { redirect } from "next/navigation";
import { requireViewer } from "@/server/auth";
import { listTemplates, templateStages, type TemplateFilter } from "@/server/editorial";
import { getSettings } from "@/server/settings";
import { PageHeader } from "@/components/app/primitives";
import { STAGES, type Stage } from "@/lib/domain";
import { ChecklistTemplates } from "./templates-client";

export const metadata = { title: "Checklists" };

const SORTS = ["name", "stage", "updated", "items", "used"] as const;

export default async function ChecklistsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const viewer = await requireViewer();
  const stages = templateStages(viewer);
  if (!stages.length) redirect("/dashboard?denied=permission");
  const sp = await searchParams;
  const filter: TemplateFilter = {
    stage: (STAGES as readonly string[]).includes(sp.stage ?? "") ? (sp.stage as Stage) : null,
    q: sp.q ?? null,
    active: sp.active === "active" || sp.active === "inactive" ? sp.active : "all",
    sort: (SORTS as readonly string[]).includes(sp.sort ?? "") ? (sp.sort as TemplateFilter["sort"]) : "stage",
    dir: sp.dir === "desc" ? "desc" : "asc",
  };
  const templates = (await listTemplates(filter)).filter((t) => stages.includes(t.stage));
  const standard = (await getSettings()).checklists;
  return (
    <div className="space-y-4">
      <PageHeader
        help="manager" title="Checklists"
        description="Every stage has a standard checklist that applies to all its work. Extra checklists add lines for particular kinds of work and are picked per person when assigning. Lines can be required, and can need the team lead's verification before the handoff."
      />
      <ChecklistTemplates templates={templates} stages={stages} filter={filter} standard={Object.fromEntries(stages.map((s) => [s, standard[s].map((c) => ({ ...c, verify: !!c.verify }))]))} />
    </div>
  );
}
