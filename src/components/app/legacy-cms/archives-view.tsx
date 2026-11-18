"use client";

// Noor's scraped archives and storage (Update 1.2, System improvements 2): storage statistics against Noor's own
// totals, "Fetch everything" with its progress, each resource's last read, and the snapshots (created here, opened as
// a full page, compared).
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveIcon, CloudDownloadIcon, DatabaseIcon, GitCompareIcon, HardDriveIcon, Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, MetricCard } from "@/components/app/primitives";
import { StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import * as A from "@/app/actions/cms-archives";
import type { archiveOverview, fetchEverything } from "@/server/cms-archives";

type Overview = Awaited<ReturnType<typeof archiveOverview>>;
type Progress = Awaited<ReturnType<typeof fetchEverything>>;

export const bytes = (n: number) => (n >= 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n >= 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never");

export function CmsArchivesView({ data }: { data: Overview }) {
  const router = useRouter();
  const [progress, setProgress] = React.useState<Progress | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [compare, setCompare] = React.useState<{ a: string; b: string }>({ a: data.snapshots[0]?.id ?? "", b: "current" });
  const stop = React.useRef(false);
  const t = data.totals;
  const maxBytes = Math.max(1, ...data.resources.map((r) => r.bytes));

  // Calls the server until every resource is read; each call reads for up to a minute and says where it is.
  const fetchAll = async () => {
    setFetching(true);
    stop.current = false;
    try {
      for (let i = 0; i < 200 && !stop.current; i++) {
        const r = await A.fetchEverythingAction();
        if (!r.ok) {
          toast.error(r.error);
          break;
        }
        setProgress(r.data!);
        if (r.data!.done) {
          const failed = r.data!.resources.filter((x) => x.status === "failed");
          if (failed.length) toast.error(`${failed.length} could not be read: ${failed.map((x) => x.label).join(", ")}`);
          else toast.success("Everything is fetched from Noor.");
          break;
        }
      }
    } finally {
      setFetching(false);
      router.refresh();
    }
  };

  return (
    <div className="space-y-4" data-archives>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-archive-stats>
        <MetricCard label="Records stored" value={t.records.toLocaleString()} hint={t.noorRecords ? `Noor reports ${t.noorRecords.toLocaleString()}` : "Noor's totals not checked yet"} />
        <MetricCard label="Storage used" value={bytes(t.bytes + t.snapshotBytes)} hint={`${bytes(t.bytes)} records · ${bytes(t.snapshotBytes)} snapshots`} />
        <MetricCard label="Resources" value={`${t.enabled} of ${t.resources}`} hint={t.behind ? `${t.behind} differ from Noor` : "All match Noor"} />
        <MetricCard label="Snapshots" value={t.snapshots.toLocaleString()} hint={t.failing ? `${t.failing} resources failed their last read` : "No read errors"} />
      </div>

      <section className="space-y-3 rounded-xl border bg-card p-4" data-archive-resources>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <DatabaseIcon className="size-4" /> Stored from Noor
            </h2>
            <p className="text-xs text-muted-foreground">Every switched-on resource, read in full from Noor, page by page. A read that runs out of time carries on where it stopped.</p>
          </div>
          {data.manager && (
            <div className="flex gap-2">
              {fetching && (
                <Button variant="ghost" size="sm" onClick={() => (stop.current = true)}>
                  Stop after this step
                </Button>
              )}
              <Button size="sm" disabled={fetching || !t.enabled} onClick={() => void fetchAll()} data-fetch-everything>
                {fetching ? <Loader2Icon className="animate-spin" /> : <CloudDownloadIcon />} Fetch everything
              </Button>
            </div>
          )}
        </div>
        {progress && (
          <ul className="grid gap-1 rounded-lg bg-muted/40 p-2 text-xs sm:grid-cols-2" data-fetch-progress={progress.done ? "done" : "working"}>
            {progress.resources.map((p) => (
              <li key={p.slug} className="flex items-start gap-2" data-fetch-resource={p.slug} data-fetch-status={p.status}>
                <span className={cn("mt-1 size-2 shrink-0 rounded-full", p.status === "done" ? "bg-emerald-500" : p.status === "failed" ? "bg-rose-500" : p.status === "working" ? "animate-pulse bg-amber-500" : "bg-muted-foreground/40")} />
                <span>
                  <b className="font-medium">{p.label}</b> · {p.detail}
                </span>
              </li>
            ))}
          </ul>
        )}
        {!data.resources.length ? (
          <EmptyState title="No Noor resources yet" description="Read Noor's admin menu in Resources & fields to find its tables." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-2">Resource</th>
                  <th className="p-2 text-right">Stored</th>
                  <th className="p-2 text-right">In Noor</th>
                  <th className="p-2">Size</th>
                  <th className="p-2">Last full read</th>
                  <th className="p-2">State</th>
                </tr>
              </thead>
              <tbody>
                {data.resources.map((r) => (
                  <tr key={r.slug} className="border-b last:border-0" data-archive-resource={r.slug}>
                    <td className="p-2">
                      <span className="font-medium">{r.label}</span>
                      {r.group && <span className="block text-[11px] text-muted-foreground">{r.group}</span>}
                    </td>
                    <td className="p-2 text-right tabular-nums">{r.stored.toLocaleString()}</td>
                    <td className="p-2 text-right tabular-nums">{r.noorTotal == null ? "—" : r.noorTotal.toLocaleString()}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary/70" style={{ width: `${(r.bytes / maxBytes) * 100}%` }} />
                        </div>
                        <span className="text-xs tabular-nums text-muted-foreground">{bytes(r.bytes)}</span>
                      </div>
                    </td>
                    <td className="p-2 text-xs" suppressHydrationWarning>{when(r.lastMirrorAt)}</td>
                    <td className="p-2 text-xs">
                      {!r.enabled ? (
                        <span className="text-muted-foreground">Off</span>
                      ) : r.lastError ? (
                        <span className="text-rose-600" title={r.lastError}>Failed: {r.lastError.slice(0, 60)}</span>
                      ) : r.run ? (
                        <span className="text-amber-700">Part read ({r.run.discovered.toLocaleString()} rows)</span>
                      ) : r.noorTotal != null && r.noorTotal !== r.stored ? (
                        <span className="text-amber-700">Differs from Noor</span>
                      ) : r.lastMirrorAt ? (
                        <span className="text-emerald-700 dark:text-emerald-400">Complete</span>
                      ) : (
                        <span className="text-muted-foreground">Not read yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-xl border bg-card p-4" data-archive-snapshots>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ArchiveIcon className="size-4" /> Snapshots
            </h2>
            <p className="text-xs text-muted-foreground">A frozen copy of the stored records, to look back at or compare. Open one for its records, schemas, data quality and history.</p>
          </div>
          {data.manager && (
            <Button size="sm" variant="outline" onClick={() => setCreating(true)} data-snapshot-new>
              <PlusIcon /> New snapshot
            </Button>
          )}
        </div>
        {!data.snapshots.length ? (
          <EmptyState icon={<ArchiveIcon className="size-5" />} title="No snapshots yet" description="Take one before a big change in Noor, to compare after." />
        ) : (
          <>
            <ul className="divide-y rounded-lg border">
              {data.snapshots.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 p-3 text-sm" data-snapshot={s.name}>
                  <HardDriveIcon className="size-4 text-muted-foreground" />
                  <Link href={`/legacy-cms/snapshots/${s.id}`} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                      {s.category === "all" ? "Every resource" : s.category} · {s.records.toLocaleString()} records · {bytes(s.bytes)} · {when(s.createdAt)}
                      {s.createdBy ? ` by ${s.createdBy}` : ""}
                    </span>
                  </Link>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={`/legacy-cms/snapshots/${s.id}`}>Open</Link>
                  </Button>
                  {data.manager && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Delete ${s.name}`}
                      onClick={async () => {
                        if (!confirm(`Delete the snapshot "${s.name}" for good? The stored records are not touched.`)) return;
                        const r = await A.deleteSnapshotAction(s.id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Snapshot deleted");
                        router.refresh();
                      }}
                    >
                      <Trash2Icon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm" data-snapshot-compare>
              <GitCompareIcon className="size-4 text-muted-foreground" />
              <span>Compare</span>
              <select aria-label="Compare snapshot" className="h-8 rounded-md border bg-background px-2 text-sm" value={compare.a} onChange={(e) => setCompare({ ...compare, a: e.target.value })}>
                {data.snapshots.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <span>with</span>
              <select aria-label="Compare with" className="h-8 rounded-md border bg-background px-2 text-sm" value={compare.b} onChange={(e) => setCompare({ ...compare, b: e.target.value })}>
                <option value="current">The data stored now</option>
                {data.snapshots.filter((s) => s.id !== compare.a).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <Button size="sm" asChild>
                <Link href={`/legacy-cms/snapshots/${compare.a}?tab=compare&with=${compare.b}`}>Compare</Link>
              </Button>
            </div>
          </>
        )}
      </section>
      {creating && <NewSnapshot resources={data.resources.filter((r) => r.stored > 0).map((r) => ({ key: r.slug, label: r.label, n: r.stored }))} onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewSnapshot({ resources, onClose }: { resources: { key: string; label: string; n: number }[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = React.useState({ name: "", category: "all", description: "" });
  const [busy, setBusy] = React.useState(false);
  const total = f.category === "all" ? resources.reduce((a, r) => a + r.n, 0) : (resources.find((r) => r.key === f.category)?.n ?? 0);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New snapshot</DialogTitle>
          <DialogDescription>A frozen copy of the records stored now. It does not change when Noor or the stored data change.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Input aria-label="Snapshot name" placeholder="Name, e.g. Before the price change" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <select aria-label="What to copy" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            <option value="all">Every resource</option>
            {resources.map((r) => (
              <option key={r.key} value={r.key}>{r.label} ({r.n.toLocaleString()})</option>
            ))}
          </select>
          <Textarea aria-label="Description" placeholder="Why (optional)" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          {!resources.length && <StatusStrip tone="warning">Nothing is stored yet. Fetch from Noor first.</StatusStrip>}
          {resources.length > 0 && <p className="text-xs text-muted-foreground">{total.toLocaleString()} records will be copied.</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || !f.name.trim() || !total}
            onClick={async () => {
              setBusy(true);
              const r = await A.createSnapshotAction(f);
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`Snapshot saved with ${r.data!.records.toLocaleString()} records`);
              onClose();
              router.refresh();
            }}
            data-snapshot-save
          >
            {busy && <Loader2Icon className="animate-spin" />} Save snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
