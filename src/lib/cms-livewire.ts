export type CmsRemoteFilter = { key: string; label: string; options: { value: string; label: string }[] };
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const plain = (s: string) => decode(s.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();

export function remoteFilters(html: string): CmsRemoteFilter[] {
  const filters: CmsRemoteFilter[] = [];
  for (const match of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) {
    const key = match[1].match(/wire:model(?:\.[\w.]+)?="tableDeferredFilters\.([^"]+)"/)?.[1];
    if (!key) continue;
    filters.push({ key, label: key.replace(/\.value$/, "").replace(/[_.]/g, " "), options: [...match[2].matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([\s\S]*?)<\/option>/g)].map(m => ({ value: decode(m[1]), label: plain(m[2]) })) });
  }
  return filters;
}

// Use the table's signed snapshot and supported Livewire controls, just as its UI does.
export async function queryCmsTable(html: string, baseUrl: string, cookie: string, input: { page: number; pageSize: number; search: string; filters?: Record<string, string> }) {
  const filters = remoteFilters(html);
  const snapshot = [...html.matchAll(/wire:snapshot="([^"]+)"/g)].map(m => decode(m[1])).find(s => Object.hasOwn(JSON.parse(s).data ?? {}, "tableRecordsPerPage"));
  const csrf = html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri = html.match(/data-update-uri="([^"]+)"/)?.[1];
  if (!snapshot || !csrf || !uri) throw new Error("The CMS table session is unavailable. Reconnect Noor CMS.");
  const endpoint = new URL(decode(uri), baseUrl);
  if (endpoint.origin !== new URL(baseUrl).origin) throw new Error("Unexpected CMS update endpoint.");
  const updates: Record<string, unknown> = { tableSearch: input.search, tableRecordsPerPage: input.pageSize };
  for (const filter of filters) {
    const value = input.filters?.[filter.key] ?? "";
    if (value && !filter.options.some(o => o.value === value)) throw new Error(`Invalid ${filter.label} filter`);
    updates[`tableDeferredFilters.${filter.key}`] = value || null;
  }
  const calls = [...(filters.length ? [{ path: "", method: "applyTableFilters", params: [] }] : []), { path: "", method: "gotoPage", params: [input.page, "page"] }];
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": decode(csrf), Cookie: cookie }, body: JSON.stringify({ _token: decode(csrf), components: [{ snapshot, updates, calls }] }), signal: AbortSignal.timeout(20000), redirect: "error", cache: "no-store" });
  if (!response.ok) throw new Error(`CMS table query failed (HTTP ${response.status})`);
  const result = await response.json();
  const component = result.components?.[0];
  if (!component?.effects?.html || component.effects.redirect) throw new Error("CMS returned no table. Reconnect the CMS session.");
  const state = JSON.parse(component.snapshot).data;
  return { html: component.effects.html as string, filters, pageSize: Number(state.tableRecordsPerPage) || input.pageSize };
}

export function cmsPagination(html: string, count: number, page: number, pageSize: number) {
  const match = plain(html).match(/Showing\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)\s+results/i);
  const number = (s: string) => Number(s.replace(/,/g, ""));
  return match ? { from: number(match[1]), to: number(match[2]), totalResults: number(match[3]) } : { from: count ? (page - 1) * pageSize + 1 : 0, to: count ? (page - 1) * pageSize + count : 0, totalResults: count };
}
