"use client";

// A Noor snapshot's sections (Update 1.2, System improvements 2): records (search, a resource, a field filter, sort
// by any column, pages, chosen columns, CSV export of what is shown), entities, schemas, data quality, storage, logs,
// and the comparison with another snapshot or the data stored now.
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDownIcon, ArrowUpIcon, ColumnsIcon, DownloadIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState, MetricCard } from "@/components/app/primitives";
import { StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import * as A from "@/app/actions/cms-archives";
import type { compareSnapshot, snapshotDetail, snapshotRecords } from "@/server/cms-archives";
import { bytes } from "./archives-view";

type Detail = Awaited<ReturnType<typeof snapshotDetail>>;
type Comparison = Awaited<ReturnType<typeof compareSnapshot>>;
type Records = Awaited<ReturnType<typeof snapshotRecords>>;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const select = "h-8 rounded-md border bg-background px-2 text-sm";

export function SnapshotTabs({ tab, detail, comparison, others, withId }: { tab: string; detail: Detail; comparison: Comparison | null; others: { id: string; name: string }[]; withId: string }) {
  if (tab === "records") return <RecordsTab detail={detail} />;
  if (tab === "entities")
    return (
      <div className="overflow-x-auto rounded-xl border bg-card" data-snapshot-entities>
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Resource</th>
              <th className="p-2 text-right">Records</th>
              <th className="p-2 text-right">Fields</th>
              <th className="p-2 text-right">Size</th>
              <th className="p-2">Newest row read</th>
            </tr>
          </thead>
          <tbody>
            {detail.entities.map((e) => (
              <tr key={e.category} className="border-b last:border-0" data-entity={e.category}>
                <td className="p-2 font-medium">{e.label}</td>
                <td className="p-2 text-right tabular-nums">{e.records.toLocaleString()}</td>
                <td className="p-2 text-right tabular-nums">{e.fields}</td>
                <td className="p-2 text-right tabular-nums">{bytes(e.bytes)}</td>
                <td className="p-2 text-xs" suppressHydrationWarning>{e.newest ? new Date(e.newest).toLocaleString("en-GB") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  if (tab === "schemas")
    return (
      <div className="space-y-4" data-snapshot-schemas>
        {detail.schemas.map((s) => (
          <section key={s.category} className="rounded-xl border bg-card p-3">
            <h2 className="mb-2 text-sm font-semibold">{detail.entities.find((e) => e.category === s.category)?.label ?? s.category} <span className="font-normal text-muted-foreground">· {s.fields.length} fields</span></h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-1.5">Field</th>
                    <th className="p-1.5">Holds</th>
                    <th className="p-1.5">Filled</th>
                    <th className="p-1.5 text-right">Different values</th>
                    <th className="p-1.5">Example</th>
                  </tr>
                </thead>
                <tbody>
                  {s.fields.map((f) => (
                    <tr key={f.name} className="border-b last:border-0" data-schema-field={f.name}>
                      <td className="p-1.5 font-medium">{f.name}</td>
                      <td className="p-1.5">
                        {f.type}
                        {f.mixed && <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">mixed</span>}
                      </td>
                      <td className="p-1.5">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", f.fillRate < 0.5 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: pct(f.fillRate) }} />
                          </div>
                          <span className="text-xs tabular-nums">{pct(f.fillRate)}</span>
                        </div>
                      </td>
                      <td className="p-1.5 text-right tabular-nums">{f.distinct.toLocaleString()}</td>
                      <td className="max-w-56 truncate p-1.5 text-xs text-muted-foreground">{f.sample ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    );
  if (tab === "quality")
    return (
      <div className="grid gap-3 lg:grid-cols-2" data-snapshot-quality>
        {detail.quality.map((q) => (
          <section key={q.category} className="space-y-2 rounded-xl border bg-card p-3 text-sm" data-quality={q.category}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{detail.entities.find((e) => e.category === q.category)?.label ?? q.category}</h2>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", q.score >= 90 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200" : q.score >= 70 ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200" : "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200")} data-quality-score={q.score}>
                {q.score} / 100
              </span>
            </div>
            <ul className="space-y-1 text-xs">
              <li>{q.duplicateCount ? <b className="text-rose-700">{q.duplicateCount} Noor ids appear more than once</b> : "No duplicate Noor ids"}</li>
              <li>{q.noId ? <b className="text-amber-700">{q.noId} records without a Noor id</b> : "Every record has a Noor id"}</li>
              <li>{q.noTitle ? `${q.noTitle} records without a title` : "Every record has a title"}</li>
              <li>{q.emptyFields.length ? `Never filled: ${q.emptyFields.join(", ")}` : "No field is always empty"}</li>
              {q.sparse.length > 0 && <li>Mostly empty: {q.sparse.map((s) => `${s.name} (${pct(s.fillRate)})`).join(", ")}</li>}
              {q.mixed.length > 0 && <li>Mixed kinds of values: {q.mixed.join(", ")}</li>}
            </ul>
            {q.duplicates.length > 0 && <p className="text-xs text-muted-foreground">Duplicated ids: {q.duplicates.slice(0, 10).map((d) => `${d.id} (${d.times}×)`).join(", ")}</p>}
          </section>
        ))}
      </div>
    );
  if (tab === "storage")
    return (
      <div className="space-y-3" data-snapshot-storage>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <MetricCard label="Snapshot size" value={bytes(detail.storage.bytes)} />
          <MetricCard label="Records in it" value={detail.records.toLocaleString()} />
          <MetricCard label="Stored now" value={detail.storage.perResource.reduce((a, r) => a + r.nowRecords, 0).toLocaleString()} hint={bytes(detail.storage.perResource.reduce((a, r) => a + r.nowBytes, 0))} />
        </div>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Resource</th>
                <th className="p-2 text-right">In the snapshot</th>
                <th className="p-2 text-right">Size</th>
                <th className="p-2 text-right">Stored now</th>
                <th className="p-2 text-right">Size now</th>
              </tr>
            </thead>
            <tbody>
              {detail.storage.perResource.map((r) => (
                <tr key={r.category} className="border-b last:border-0">
                  <td className="p-2 font-medium">{r.label}</td>
                  <td className="p-2 text-right tabular-nums">{r.records.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">{bytes(r.bytes)}</td>
                  <td className="p-2 text-right tabular-nums">{r.nowRecords.toLocaleString()}</td>
                  <td className="p-2 text-right tabular-nums">{bytes(r.nowBytes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  if (tab === "logs")
    return detail.logs.length ? (
      <ol className="space-y-1 rounded-xl border bg-card p-3 text-sm" data-snapshot-logs>
        {detail.logs.map((l, i) => (
          <li key={i} className="flex gap-3 border-b py-1.5 last:border-0">
            <span className="w-36 shrink-0 text-xs tabular-nums text-muted-foreground" suppressHydrationWarning>{new Date(l.at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span className={cn("shrink-0 rounded px-1.5 text-[10px] uppercase", l.kind === "audit" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{l.kind === "audit" ? "change" : "Noor read"}</span>
            <span className="min-w-0">{l.text}</span>
          </li>
        ))}
      </ol>
    ) : (
      <EmptyState title="Nothing logged" description="No change to this snapshot and no Noor read before it was taken." />
    );
  return <CompareTab id={detail.id} comparison={comparison!} others={others} withId={withId} />;
}

function RecordsTab({ detail }: { detail: Detail }) {
  const [f, setF] = React.useState({ q: "", category: detail.entities.length === 1 ? detail.entities[0]!.category : "", sort: "", dir: "asc" as "asc" | "desc", page: 1, size: 50, field: "", value: "" });
  const [q, setQ] = React.useState("");
  const [data, setData] = React.useState<Records | null>(null);
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  React.useEffect(() => {
    const t = window.setTimeout(() => setF((x) => (x.q === q ? x : { ...x, q, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  React.useEffect(() => {
    let stop = false;
    setBusy(true);
    void A.snapshotRecordsAction(detail.id, f).then((r) => {
      if (stop) return;
      setBusy(false);
      if (r.ok) setData(r.data!);
      else toast.error(r.error);
    });
    return () => {
      stop = true;
    };
  }, [detail.id, JSON.stringify(f)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols = (data?.columns ?? []).filter((c) => !hidden.has(c));
  const sortBy = (k: string) => setF({ ...f, sort: k, dir: f.sort === k && f.dir === "asc" ? "desc" : "asc", page: 1 });
  const Arrow = ({ k }: { k: string }) => (f.sort === k ? f.dir === "asc" ? <ArrowUpIcon className="inline size-3" /> : <ArrowDownIcon className="inline size-3" /> : null);
  return (
    <div className="space-y-3" data-snapshot-records>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Input aria-label="Search records" placeholder="Search every field" className="h-8 w-56" value={q} onChange={(e) => setQ(e.target.value)} />
        {detail.entities.length > 1 && (
          <select aria-label="Resource" className={select} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value, page: 1, field: "", sort: "" })}>
            <option value="">Every resource</option>
            {detail.entities.map((e) => (
              <option key={e.category} value={e.category}>{e.label}</option>
            ))}
          </select>
        )}
        <select aria-label="Filter field" className={select} value={f.field} onChange={(e) => setF({ ...f, field: e.target.value, page: 1 })}>
          <option value="">Filter a field…</option>
          {(data?.columns ?? []).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {f.field && <Input aria-label="Field value" placeholder={`${f.field} contains`} className="h-8 w-44" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value, page: 1 })} />}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline">
              <ColumnsIcon /> Columns {hidden.size ? `(${(data?.columns.length ?? 0) - hidden.size})` : ""}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-80 overflow-y-auto">
            <DropdownMenuLabel>Shown columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(data?.columns ?? []).map((c) => (
              <DropdownMenuCheckboxItem key={c} checked={!hidden.has(c)} onSelect={(e) => e.preventDefault()} onCheckedChange={(v) => setHidden((h) => { const n = new Set(h); if (v) n.delete(c); else n.add(c); return n; })}>
                {c}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          disabled={exporting || !data?.total}
          onClick={async () => {
            setExporting(true);
            const r = await A.exportSnapshotAction(detail.id, f, cols);
            setExporting(false);
            if (!r.ok) return void toast.error(r.error);
            const url = URL.createObjectURL(new Blob([r.data!.csv], { type: "text/csv;charset=utf-8" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = r.data!.fileName;
            a.click();
            URL.revokeObjectURL(url);
            toast.success(`${r.data!.rows.toLocaleString()} records exported`);
          }}
          data-snapshot-export
        >
          {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />} Export CSV
        </Button>
        <span className="ml-auto text-xs text-muted-foreground" data-records-total={data?.total ?? ""}>
          {busy && <Loader2Icon className="mr-1 inline size-3 animate-spin" />}
          {data ? `${data.total.toLocaleString()} records` : ""}
        </span>
      </div>
      {data && !data.total ? (
        <EmptyState title="No records match" description="Change the search or the filter." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                {!f.category && <th className="p-2">Resource</th>}
                <th className="cursor-pointer p-2 whitespace-nowrap" onClick={() => sortBy("_id")} aria-sort={f.sort === "_id" ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>Noor id <Arrow k="_id" /></th>
                {cols.map((c) => (
                  <th key={c} className="cursor-pointer p-2 whitespace-nowrap" onClick={() => sortBy(c)} aria-sort={f.sort === c ? (f.dir === "asc" ? "ascending" : "descending") : undefined}>
                    {c} <Arrow k={c} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.rows.map((r, i) => (
                <tr key={`${r.category}-${r.externalId}-${i}`} className="border-b last:border-0" data-snapshot-row={r.externalId ?? ""}>
                  {!f.category && <td className="p-2 text-xs text-muted-foreground">{r.category}</td>}
                  <td className="p-2 font-mono text-xs">{r.externalId ?? "—"}</td>
                  {cols.map((c) => (
                    <td key={c} className="max-w-64 truncate p-2" title={r.data[c]}>{r.data[c] || <span className="text-muted-foreground">—</span>}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <select aria-label="Rows per page" className={select} value={f.size} onChange={(e) => setF({ ...f, size: Number(e.target.value), page: 1 })}>
            {[25, 50, 100, 200].map((n) => (
              <option key={n} value={n}>{n} a page</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={data.page <= 1} onClick={() => setF({ ...f, page: data.page - 1 })}>Previous</Button>
            <span className="tabular-nums" data-records-page>Page {data.page} of {data.pages}</span>
            <Button size="sm" variant="outline" disabled={data.page >= data.pages} onClick={() => setF({ ...f, page: data.page + 1 })} aria-label="Next page">Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CompareTab({ id, comparison: c, others, withId }: { id: string; comparison: Comparison; others: { id: string; name: string }[]; withId: string }) {
  const router = useRouter();
  const [part, setPart] = React.useState<"changed" | "added" | "removed">("changed");
  return (
    <div className="space-y-3" data-snapshot-comparison>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 text-sm">
        <span>
          <b>{c.before.name}</b> ({c.before.records.toLocaleString()}) compared with
        </span>
        <select aria-label="Compare with" className={select} value={withId} onChange={(e) => router.push(`/legacy-cms/snapshots/${id}?tab=compare&with=${e.target.value}`)}>
          <option value="current">The data stored now</option>
          {others.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
        <span className="text-muted-foreground">({c.after.records.toLocaleString()})</span>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Changed" value={c.counts.changed.toLocaleString()} />
        <MetricCard label="Added since" value={c.counts.added.toLocaleString()} />
        <MetricCard label="Gone since" value={c.counts.removed.toLocaleString()} />
        <MetricCard label="The same" value={c.counts.same.toLocaleString()} />
      </div>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted-foreground">
            <tr>
              <th className="p-2">Resource</th>
              <th className="p-2 text-right">Before</th>
              <th className="p-2 text-right">After</th>
              <th className="p-2 text-right">Added</th>
              <th className="p-2 text-right">Gone</th>
              <th className="p-2 text-right">Changed</th>
            </tr>
          </thead>
          <tbody>
            {c.perResource.map((r) => (
              <tr key={r.category} className="border-b last:border-0" data-compare-resource={r.category}>
                <td className="p-2 font-medium">{r.category}</td>
                <td className="p-2 text-right tabular-nums">{r.before.toLocaleString()}</td>
                <td className="p-2 text-right tabular-nums">{r.after.toLocaleString()}</td>
                <td className="p-2 text-right tabular-nums text-emerald-700">{r.added ? `+${r.added}` : 0}</td>
                <td className="p-2 text-right tabular-nums text-rose-700">{r.removed ? `−${r.removed}` : 0}</td>
                <td className="p-2 text-right tabular-nums text-amber-700">{r.changed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div role="radiogroup" aria-label="Show" className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-xs">
        {(["changed", "added", "removed"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={part === k} className={cn("rounded-md px-2.5 py-1 font-medium", part === k ? "bg-background shadow-sm" : "text-muted-foreground")} onClick={() => setPart(k)}>
            {k === "changed" ? `Changed (${c.counts.changed})` : k === "added" ? `Added (${c.counts.added})` : `Gone (${c.counts.removed})`}
          </button>
        ))}
      </div>
      {part === "changed" ? (
        c.changed.length ? (
          <ul className="space-y-2" data-compare-changed>
            {c.changed.map((x, i) => (
              <li key={i} className="rounded-xl border bg-card p-3 text-sm">
                <p className="font-medium">
                  {x.title ?? x.externalId} <span className="font-mono text-xs text-muted-foreground">{x.category} #{x.externalId}</span>
                </p>
                <table className="mt-1 w-full text-xs">
                  <tbody>
                    {x.fields.map((fl) => (
                      <tr key={fl.name}>
                        <td className="w-40 py-0.5 pr-2 text-muted-foreground">{fl.name}</td>
                        <td className="py-0.5 pr-2 text-rose-700 line-through">{fl.before || "—"}</td>
                        <td className="py-0.5 text-emerald-700">{fl.after || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </li>
            ))}
          </ul>
        ) : (
          <StatusStrip>No record changed.</StatusStrip>
        )
      ) : (
        (() => {
          const list = part === "added" ? c.added : c.removed;
          return list.length ? (
            <ul className="divide-y rounded-xl border bg-card text-sm" data-compare-list={part}>
              {list.map((x, i) => (
                <li key={i} className="flex gap-3 p-2">
                  <span className="w-28 shrink-0 text-xs text-muted-foreground">{x.category}</span>
                  <span className="font-mono text-xs">{x.externalId ?? "—"}</span>
                  <span className="min-w-0 truncate">{x.title}</span>
                </li>
              ))}
            </ul>
          ) : (
            <StatusStrip>None.</StatusStrip>
          );
        })()
      )}
    </div>
  );
}
