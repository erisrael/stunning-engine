import Link from "next/link";
import { FilePlus2Icon } from "lucide-react";
import { requireCapability } from "@/server/auth";
import { listItems } from "@/server/queries";
import { filterOptions } from "@/server/view-data";
import { userNames } from "@/server/rows";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { userDirectory } from "@/server/users";
import { parseFilters } from "@/lib/filters";
import { DEFAULT_CONTENT_COLUMNS, ITEM_COLUMNS } from "@/lib/columns";
import { tzLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { ContentTable } from "./content-table";
import { PageImport } from "@/components/app/page-import";

export const metadata = { title: "All content" };

export default async function ContentPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.list");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  // Grouped by Grade → Subject (default) or Subject → Grade, always in curriculum order.
  const grouping = sp.group === "subject" ? "subject" : sp.group === "none" ? "none" : "grade";
  if (grouping === "grade") {
    filters.sort = "curriculum";
    filters.dir = "asc";
  } else if (grouping === "subject") {
    filters.sort = "subject";
    filters.dir = "asc";
  }
  const s = await getSettings();
  const { rows, total } = await listItems(viewer, filters, nowIso());
  const valid = new Set(ITEM_COLUMNS.map((c) => c.key));
  const columns = (viewer.prefs.contentColumns?.filter((c) => valid.has(c)) ?? DEFAULT_CONTENT_COLUMNS).filter(Boolean);
  const canCreate = viewer.perms.includes("items.create");
  return (
    <div className="space-y-4">
      <PageHeader
        help="lead" title="List"
        description="Every part in your access, grouped by grade and subject like the Overview. Click a row to open it; right-click for actions."
        actions={
          <>
            <PageImport viewer={viewer} page="work" />
            {canCreate && (
              <Button size="sm" asChild>
                <Link href="/items/new">
                  <FilePlus2Icon /> New item
                </Link>
              </Button>
            )}
          </>
        }
      />
      <FilterBar options={await filterOptions(viewer, "/content")} total={total} note={`Dates in ${tzLabel(s.workspace.timezone)}`} />
      <ContentTable
        rows={rows}
        total={total}
        page={filters.page}
        size={filters.size}
        columns={columns.length >= 1 ? columns : DEFAULT_CONTENT_COLUMNS}
        density={viewer.prefs.density ?? "comfortable"}
        ctx={{ users: await userNames(), tz: s.workspace.timezone, lists: s.lists }}
        viewer={{ id: viewer.id, roles: viewer.roles, leads: viewer.leads, perms: viewer.perms }}
        grouping={grouping}
        users={await userDirectory()}
        now={Date.now()}
      />
    </div>
  );
}
