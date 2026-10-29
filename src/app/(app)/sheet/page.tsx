import { requireCapability } from "@/server/auth";
import { listItems } from "@/server/queries";
import { filterOptions } from "@/server/view-data";
import { sheetExtras } from "@/server/sheet";
import { getSettings } from "@/server/settings";
import { nowIso } from "@/server/db";
import { userDirectory } from "@/server/users";
import { parseFilters } from "@/lib/filters";
import { SHEET_BASE_COLUMNS, SHEET_PRESETS } from "@/lib/columns";
import { PageHeader } from "@/components/app/primitives";
import { FilterBar } from "@/components/app/filter-bar";
import { SheetGrid } from "./sheet-grid";
import { PageImport } from "@/components/app/page-import";

export const metadata = { title: "Sheet view" };

export default async function SheetPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireCapability("nav.sheet");
  const sp = await searchParams;
  const filters = parseFilters(sp);
  if (!sp.sort) {
    filters.sort = "curriculum";
    filters.dir = "asc";
  }
  const s = await getSettings();
  const presetParam = typeof sp.preset === "string" ? sp.preset : null;
  const preset = SHEET_PRESETS.find((p) => p.key === presetParam)?.key ?? (viewer.activeRole === "admin" || viewer.activeRole === "manager" ? "overview" : viewer.activeRole);
  const { rows, total } = await listItems(viewer, { ...filters, size: 500, page: 1 }, nowIso(), { all: false });
  // Presets saved before the base columns became optional did not store them; they stay visible.
  const saved = Object.fromEntries(
    Object.entries(viewer.prefs.sheetPresets ?? {}).map(([k, v]) => [k, v.includesBase ? v.columns : [...SHEET_BASE_COLUMNS, ...v.columns]]),
  );
  return (
    <div className="space-y-4">
      <PageHeader
        title="Sheet view"
        description="The familiar handoff and upload table, editing the same live records. Colored cells are dropdowns; locked cells explain who is responsible."
        actions={<PageImport viewer={viewer} page="work" />}
      />
      <FilterBar options={await filterOptions(viewer, "/sheet")} total={total} note={total > 500 ? "Showing the first 500 rows. Narrow the filters to see the rest." : undefined} />
      <SheetGrid
        rows={rows}
        extras={await sheetExtras(rows)}
        preset={preset}
        savedColumns={saved}
        viewer={{ id: viewer.id, roles: viewer.roles, name: viewer.name, leads: viewer.leads, perms: viewer.perms }}
        users={await userDirectory()}
        tz={s.workspace.timezone}
        now={Date.now()}
        total={total}
      />
    </div>
  );
}
