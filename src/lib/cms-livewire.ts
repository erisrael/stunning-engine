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
  const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json", "X-Livewire": "true", "X-CSRF-TOKEN": decode(csrf), Cookie: cookie }, body: JSON.stringify({ _token: decode(csrf), components: [{ snapshot, updates, calls }] }), signal: AbortSignal.timeout(60_000), redirect: "error", cache: "no-store" });
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

// Mount the remote form first; its signed snapshot and field names remain server-owned.
export async function updateCmsFeedback(baseUrl:string,cookie:string,id:string,status:string,note:string) {
  if(!/^\d+$/.test(id)) throw new Error("Choose a live feedback record.");
  const page=new URL(`/admin/feedback/${id}`,baseUrl);
  const response=await fetch(page,{headers:{Cookie:cookie},redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
  if(!response.ok) throw new Error(`Feedback unavailable (HTTP ${response.status})`);
  const html=await response.text();
  let snapshot=[...html.matchAll(/wire:snapshot="([^"]+)"/g)].map(m=>decode(m[1])).find(s=>JSON.parse(s).memo?.name?.endsWith("ViewFeedback"));
  const csrf=html.match(/name="csrf-token"\s+content="([^"]+)"/)?.[1];
  const uri=html.match(/data-update-uri="([^"]+)"/)?.[1];
  if(!snapshot || !csrf || !uri || !html.includes("update_status")) throw new Error("Your Noor account cannot update this feedback.");
  const endpoint=new URL(decode(uri),baseUrl);
  if(endpoint.origin!==page.origin) throw new Error("Unexpected CMS endpoint.");
  const send=async(method:string,params:unknown[],updates:Record<string,unknown>)=>{
    const r=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-Livewire":"true","X-CSRF-TOKEN":decode(csrf),Cookie:cookie},body:JSON.stringify({_token:decode(csrf),components:[{snapshot,updates,calls:[{path:"",method,params}]}]}),redirect:"error",cache:"no-store",signal:AbortSignal.timeout(20000)});
    if(!r.ok) throw new Error(`Noor feedback update failed (HTTP ${r.status})`);
    const c=(await r.json()).components?.[0];
    if(!c?.snapshot || c.effects?.redirect) throw new Error("Noor did not confirm the feedback action.");
    snapshot=c.snapshot;
    const state=JSON.parse(c.snapshot);
    if(Object.keys(state.memo?.errors || {}).length) throw new Error("Noor rejected the feedback form. Check the status and note.");
    return state.data;
  };
  const mounted=await send("mountAction",["update_status",{}, {recordKey:id}],{});
  if(!JSON.stringify(mounted.mountedActions).includes("admin_note")) throw new Error("The Noor feedback form changed. Open the record in Noor to update it.");
  const saved=await send("callMountedAction",[],{"mountedActions.0.data.status":status,"mountedActions.0.data.admin_note":note.trim().slice(0,5000)});
  if(JSON.stringify(saved.mountedActions).includes("update_status")) throw new Error("Noor kept the form open; the change was not confirmed.");
}
