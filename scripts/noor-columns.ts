// Read-only: list each Noor table's columns (shown and hidden), sortable columns and filters, to find date fields.
// Uses the app's saved Noor connection. Run: npx tsx scripts/noor-columns.ts [table ...]
import { authenticateFilament, getLegacyCmsConfig } from "../src/server/legacy-cms";
import { sortableColumns, remoteFilters } from "../src/lib/cms-livewire";

async function main() {
  const config = await getLegacyCmsConfig();
  const base = config.baseUrl.replace(/\/+$/, "");
  const cookie = await authenticateFilament(base, config.username, config.password ?? "");
  const tables = process.argv.slice(2).length ? process.argv.slice(2) : ["students", "parents", "invoices", "subscriptions", "subscription-histories", "subscription-plans", "feedback"];
  for (const t of tables) {
    const html = await (await fetch(`${base}/admin/${t}`, { headers: { Cookie: cookie }, redirect: "manual" })).text();
    const snap = [...html.matchAll(/wire:snapshot="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&")).find((s) => { try { return Object.hasOwn(JSON.parse(s).data ?? {}, "tableRecordsPerPage"); } catch { return false; } });
    const data = snap ? JSON.parse(snap).data : {};
    console.log(`\n== ${t}`);
    const unwrap = (v: unknown): unknown => (Array.isArray(v) && v.length === 2 && v[1] && typeof v[1] === "object" && "s" in (v[1] as object) ? unwrap(v[0]) : v);
    const cols = ((unwrap(data.tableColumns) as unknown[]) ?? []).map((c) => unwrap(c) as { name: string; label: string; isToggled: boolean; isToggleable: boolean });
    console.log("columns:", cols.map((c) => `${c.name}${c.isToggled ? "" : " [hidden]"}${c.isToggleable ? " (toggle)" : ""}`).join(", "));
    console.log("sortable:", sortableColumns(html).join(", "));
    console.log("filters:", remoteFilters(html).map((f) => `${f.key}(${f.kind})`).join(", "));
  }
}
main().then(() => process.exit(0)).catch((e) => (console.error(e), process.exit(1)));
