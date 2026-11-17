"use client";
import * as React from "react";
import { toast } from "sonner";
import { AlertTriangleIcon, CompassIcon, DatabaseIcon, EyeOffIcon, ListTreeIcon, Loader2Icon, RefreshCwIcon, ScaleIcon, ShieldAlertIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, StatusStrip } from "@/components/app/page-kit";
import { cn } from "@/lib/utils";
import type { CmsField, CmsResource } from "@/server/cms-fields";
import * as A from "@/app/actions/cms-fields";

// Legacy CMS › Resources & fields (Update 1.2, Phase 3): every resource Noor's admin menu offers, switched on or off,
// its total at Noor against what is stored, the mirror with its progress, and each resource's field registry.

const TYPES = ["string", "integer", "decimal", "currency", "boolean", "date", "datetime", "enum", "status", "json", "relationship"];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) : "never");

export function CmsFieldsView() {
  const [list, setList] = React.useState<CmsResource[] | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState<CmsResource | null>(null);
  const stop = React.useRef(false);
  const load = React.useCallback(async () => {
    const r = await A.cmsResourcesAction();
    if (r.ok) (setList(r.data ?? []), setError(""));
    else setError(r.error);
  }, []);
  React.useEffect(() => void load(), [load]);

  const discover = async () => {
    setBusy("discover");
    const r = await A.cmsDiscoverAction();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Noor's menu has ${r.data!.found} resources${r.data!.added ? `, ${r.data!.added} new` : ""}.`);
    setList(r.data!.resources);
  };
  const toggle = async (x: CmsResource, on: boolean) => {
    const r = await A.cmsSetResourceAction(x.slug, on);
    if (!r.ok) toast.error(r.error);
    await load();
  };
  // A mirror runs in steps of about 50 seconds; each step reports its page, and Stop ends after the step.
  const mirror = async (x: CmsResource, restart = false) => {
    stop.current = false;
    setBusy(x.slug);
    for (let step = 0; step < 500; step++) {
      const r = await A.cmsMirrorAction(x.slug, restart && step === 0);
      await load();
      if (!r.ok) {
        toast.error(`${x.label}: ${r.error}`);
        break;
      }
      const m = r.data!;
      if (m.status === "paused" && !stop.current) continue;
      if (m.status === "paused") toast.message(`${x.label}: stopped. It carries on by itself, or press Continue.`);
      else if (m.complete) toast.success(`${x.label}: ${m.stored.toLocaleString()} stored, the same as Noor. ${m.inserted.toLocaleString()} new, ${m.updated.toLocaleString()} changed${m.removed ? `, ${m.removed.toLocaleString()} no longer at Noor removed` : ""}.`);
      else toast.warning(`${x.label}: ${m.notes.at(-1) ?? "the mirror is not complete."}`);
      break;
    }
    setBusy(null);
  };
  const totals = async () => {
    setBusy("totals");
    const r = await A.cmsCheckTotalsAction();
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    const gaps = r.data!.filter((x) => x.noorTotal != null && x.noorTotal !== x.stored);
    gaps.length ? toast.warning(`${gaps.length} resource(s) differ from Noor. Mirror them to bring them level.`) : toast.success("Every switched-on resource matches Noor.");
    await load();
  };

  if (error) return <StatusStrip tone="danger">{error}</StatusStrip>;
  if (!list) return <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading Noor resources…</StatusStrip>;
  const groups = [...new Set(list.map((x) => (x.known ? "Tables this app reads" : x.group || "Other resources")))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={discover} disabled={!!busy}>{busy === "discover" ? <Loader2Icon className="animate-spin" /> : <CompassIcon />} Read Noor's menu</Button>
        <Button size="sm" variant="outline" onClick={totals} disabled={!!busy}>{busy === "totals" ? <Loader2Icon className="animate-spin" /> : <ScaleIcon />} Compare totals with Noor</Button>
        {busy && busy !== "discover" && busy !== "totals" && <Button size="sm" variant="ghost" onClick={() => (stop.current = true)}><SquareIcon /> Stop after this step</Button>}
      </div>
      <StatusStrip>Noor is read through its admin pages: a field its admin never shows cannot be collected. A switched-on resource is mirrored completely, then kept current every hour and compared with Noor's total each night.</StatusStrip>
      {!list.some((x) => !x.known) && <EmptyState title="Only the seven tables are known so far" description="Read Noor's menu to find every resource your Noor login can see." />}
      {groups.map((g) => (
        <section key={g} className="space-y-2" aria-label={g}>
          <h2 className="text-sm font-semibold">{g}</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">On</th>
                    <th className="px-3 py-2">Resource</th>
                    <th className="px-3 py-2 text-right">At Noor</th>
                    <th className="px-3 py-2 text-right">Stored</th>
                    <th className="px-3 py-2">Fields</th>
                    <th className="px-3 py-2">Mirror</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {list.filter((x) => (x.known ? "Tables this app reads" : x.group || "Other resources") === g).map((x) => {
                    const gap = x.noorTotal != null && x.noorTotal !== x.stored;
                    return (
                      <tr key={x.slug} className="border-t" data-cms-resource={x.slug}>
                        <td className="px-3 py-1.5"><Switch checked={x.enabled} onCheckedChange={(v) => toggle(x, v)} aria-label={`Mirror ${x.label}`} /></td>
                        <td className="px-3 py-1.5">
                          <div className="font-medium">{x.label}</div>
                          <div className="text-[11px] text-muted-foreground">{x.path}</div>
                          {x.lastError && <div className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400"><AlertTriangleIcon className="size-3" /> {x.lastError}</div>}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{x.noorTotal == null ? "-" : x.noorTotal.toLocaleString()}</td>
                        <td className={cn("px-3 py-1.5 text-right tabular-nums", gap && "font-semibold text-amber-700 dark:text-amber-300")}>{x.stored.toLocaleString()}</td>
                        <td className="px-3 py-1.5"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(x)}><ListTreeIcon /> {x.fields ? `${x.fields} fields` : "Read fields"}</Button></td>
                        <td className="px-3 py-1.5 whitespace-nowrap">
                          {busy === x.slug ? <span className="flex items-center gap-1"><Loader2Icon className="size-3 animate-spin" /> page {x.run?.cursor ?? 1}{x.run?.pages ? ` of ${x.run.pages}` : ""}</span>
                            : x.run ? <Badge variant="outline" className="text-[10px]">Under way, page {x.run.cursor}{x.run.pages ? ` of ${x.run.pages}` : ""}</Badge>
                            : <span className="text-muted-foreground">{when(x.lastMirrorAt)}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!!busy || !x.enabled} onClick={() => mirror(x)} title={x.enabled ? undefined : "Switch the resource on first"}>
                            <RefreshCwIcon className={cn(busy === x.slug && "animate-spin")} /> {x.run ? "Continue" : "Mirror"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
      <FieldsSheet resource={open} onClose={() => (setOpen(null), void load())} />
    </div>
  );
}

function FieldsSheet({ resource, onClose }: { resource: CmsResource | null; onClose: () => void }) {
  const [fields, setFields] = React.useState<CmsField[] | null>(null);
  const [working, setWorking] = React.useState(false);
  const slug = resource?.slug ?? null;
  const load = React.useCallback(async () => {
    if (!slug) return;
    const r = await A.cmsFieldsAction(slug);
    if (r.ok) setFields(r.data!.fields);
    else toast.error(r.error);
  }, [slug]);
  React.useEffect(() => {
    setFields(null);
    void load();
  }, [load]);
  const refresh = async () => {
    if (!slug) return;
    setWorking(true);
    const r = await A.cmsRefreshFieldsAction(slug);
    setWorking(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`${r.data!.fields} fields read from Noor.`);
    await load();
  };
  const save = async (f: CmsField, input: Parameters<typeof A.cmsUpdateFieldAction>[2]) => {
    if (!slug) return;
    const r = await A.cmsUpdateFieldAction(slug, f.name, input);
    if (r.ok) setFields(r.data!);
    else toast.error(r.error);
  };
  return (
    <Sheet open={!!resource} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><DatabaseIcon className="size-4" /> {resource?.label} fields</SheetTitle>
          <SheetDescription>What Noor shows for this resource, the type of each field and what may be done with it. Your corrections stay when the fields are read again.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4 pb-6">
          <Button size="sm" onClick={refresh} disabled={working}>{working ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />} Read fields from Noor</Button>
          {!fields ? <StatusStrip><Loader2Icon className="size-3.5 animate-spin" /> Loading…</StatusStrip> : !fields.length ? (
            <EmptyState title="No fields read yet" description="Read the fields from Noor: its columns, hidden ones too, its filters and sort buttons." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-2 py-1.5">Field</th>
                    <th className="px-2 py-1.5">Label</th>
                    <th className="px-2 py-1.5">Type</th>
                    <th className="px-2 py-1.5">Can</th>
                    <th className="px-2 py-1.5" title="Sensitive fields are hidden from roles that may not see them">Sensitive</th>
                    <th className="px-2 py-1.5">Export</th>
                  </tr>
                </thead>
                <tbody>
                  {fields.map((f) => (
                    <tr key={f.name} className={cn("border-t align-top", f.stale && "opacity-60")} data-cms-field={f.name}>
                      <td className="px-2 py-1.5">
                        <div className="font-mono text-[11px]">{f.name}</div>
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {f.hiddenInNoor && <Badge variant="outline" className="text-[9px]"><EyeOffIcon className="size-2.5" /> hidden in Noor</Badge>}
                          {f.source === "filter" && <Badge variant="outline" className="text-[9px]">filter only</Badge>}
                          {f.relationship && <Badge variant="outline" className="text-[9px]">links {f.relationship}</Badge>}
                          {f.stale && <Badge variant="outline" className="text-[9px]">not seen at the last read</Badge>}
                        </div>
                        {f.sample && <div className="max-w-[16rem] truncate pt-0.5 text-[10px] text-muted-foreground" title={f.sample}>e.g. {f.sample}</div>}
                      </td>
                      <td className="px-2 py-1.5"><Input defaultValue={f.label} className="h-7 text-xs" aria-label={`Label of ${f.name}`} onBlur={(e) => e.target.value.trim() !== f.label && save(f, { label: e.target.value })} /></td>
                      <td className="px-2 py-1.5">
                        <Select value={f.type} onValueChange={(v) => save(f, { type: v })}>
                          <SelectTrigger className="h-7 w-32 text-xs" aria-label={`Type of ${f.name}`}><SelectValue /></SelectTrigger>
                          <SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}{t === f.inferredType ? " (seen)" : ""}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="px-2 py-1.5 text-[11px] text-muted-foreground">{[f.filterable && "filter", f.sortable && "sort", f.searchable && "search", f.nullable && "may be empty"].filter(Boolean).join(", ") || "-"}</td>
                      <td className="px-2 py-1.5"><label className="flex items-center gap-1"><Checkbox checked={f.sensitive} onCheckedChange={(v) => save(f, { sensitive: v === true })} aria-label={`${f.name} is sensitive`} />{f.sensitive && <ShieldAlertIcon className="size-3 text-amber-600" />}</label></td>
                      <td className="px-2 py-1.5"><Checkbox checked={f.exportable} onCheckedChange={(v) => save(f, { exportable: v === true })} aria-label={`Export ${f.name}`} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
