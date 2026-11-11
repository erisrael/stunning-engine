// Read-only check of what Noor's Filament tables accept: page sizes, the date filter and sorting.
// Run: NOOR_USER=... NOOR_PASS=... npx tsx scripts/noor-probe.ts [table]   (changes nothing in Noor)
import { authenticateFilament, parseFilamentTable } from "../src/server/legacy-cms";
import { queryCmsTable, remoteFilters, sortableColumns, dateSortColumn, cmsPagination } from "../src/lib/cms-livewire";
import { cmsDate } from "../src/lib/cms-filters";

async function main() {
const base = "https://cms.noorethiopia.com";
const table = process.argv[2] || "invoices";
if (!process.env.NOOR_USER || !process.env.NOOR_PASS) throw new Error("Set NOOR_USER and NOOR_PASS.");
const cookie = await authenticateFilament(base, process.env.NOOR_USER, process.env.NOOR_PASS);
const seed = await (await fetch(`${base}/admin/${table}`, { headers: { Cookie: cookie }, redirect: "manual" })).text();
console.log("seed bytes", seed.length, "has snapshot", seed.includes("wire:snapshot"));
const f = remoteFilters(seed);
console.log("filters", JSON.stringify(f.map((x) => ({ key: x.key, kind: x.kind, from: x.from, until: x.until, options: x.options.length }))));
console.log("sortable", sortableColumns(seed), "dateSort", dateSortColumn(seed));
const snap = [...seed.matchAll(/wire:snapshot="([^"]+)"/g)].map((m) => m[1].replace(/&quot;/g, '"')).find((s) => s.includes("tableRecordsPerPage"));
if (snap) {
  const d = JSON.parse(snap).data;
  console.log("snapshot keys", Object.keys(d).join(","));
  console.log("tableDeferredFilters", JSON.stringify(d.tableDeferredFilters).slice(0, 600));
  console.log("perPage", JSON.stringify(d.tableRecordsPerPage), "sort", d.tableSortColumn, d.tableSortDirection);
}
for (const size of [250, 100, 50, 25]) {
  try {
    const r = await queryCmsTable(seed, base, cookie, { page: 1, pageSize: size, search: "" });
    const rows = parseFilamentTable(r.html);
    console.log(`size ${size}: state ${r.pageSize}, rows ${rows.length}, total ${cmsPagination(r.html, rows.length, 1, r.pageSize).totalResults}`);
  } catch (e) {
    console.log(`size ${size}: ERROR ${e instanceof Error ? e.message : e}`);
  }
}
const date = f.find((x) => x.kind === "date");
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() + 3 * 3600e3 - 7 * 86400e3).toISOString().slice(0, 10);
if (date) {
  try {
    const r = await queryCmsTable(seed, base, cookie, { page: 1, pageSize: 50, search: "", dates: { [date.key]: { from: weekAgo, until: today } } });
    const rows = parseFilamentTable(r.html);
    console.log(`date filter ${weekAgo}..${today}: rows ${rows.length}, total ${cmsPagination(r.html, rows.length, 1, r.pageSize).totalResults}, first dates`, rows.slice(0, 3).map((x) => cmsDate(x)?.toISOString()));
  } catch (e) {
    console.log("date filter ERROR", e instanceof Error ? e.message : e);
  }
}
const col = dateSortColumn(seed);
if (col) {
  try {
    const r = await queryCmsTable(seed, base, cookie, { page: 1, pageSize: 50, search: "", sort: { column: col, direction: "desc" } });
    const rows = parseFilamentTable(r.html);
    console.log(`sorted by ${col} desc: first dates`, rows.slice(0, 3).map((x) => cmsDate(x)?.toISOString()), "headers", Object.keys(rows[0] ?? {}).join(" | "));
  } catch (e) {
    console.log("sort ERROR", e instanceof Error ? e.message : e);
  }
}
}
main().then(()=>process.exit(0)).catch((e)=>{console.error(e);process.exit(1);});
