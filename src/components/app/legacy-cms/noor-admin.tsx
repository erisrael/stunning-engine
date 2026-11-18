"use client";

// Noor's admin pages worked from here (Update 1.2, System improvements 4): the catalogue grouped as Noor groups
// them, each list read live from Noor (search, Noor's own filters, pages), records created, edited and deleted
// through Noor's own forms and actions, and Noor's form pages (Send SMS, Send Push Notification, Settings) filled
// in and sent to Noor.
import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeftIcon, ChevronRightIcon, ExternalLinkIcon, FileTextIcon, Loader2Icon, PencilIcon, PlusIcon, RefreshCwIcon, SearchIcon, SendIcon, TableIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/app/primitives";
import { cn } from "@/lib/utils";
import { smsCount } from "@/lib/sms-segments";
import * as A from "@/app/actions/cms-admin";
import type { noorAdminCatalog, noorAdminList, FormTarget, AdminListQuery } from "@/server/cms-admin";
import type { NoorField, NoorForm } from "@/lib/cms-forms";

type Catalog = Awaited<ReturnType<typeof noorAdminCatalog>>;
type List = Extract<Awaited<ReturnType<typeof noorAdminList>>, { kind: "list" }>;
const ANY = "__any";

export function NoorAdminCatalog({ data }: { data: Catalog }) {
  return (
    <div className="space-y-5" data-noor-admin>
      {!data.menuRead && (
        <p className="rounded-lg border border-dashed bg-muted/40 p-3 text-xs text-muted-foreground">
          Noor&apos;s menu has not been read yet, so these pages use Noor&apos;s usual addresses. Resources & fields reads the menu.
        </p>
      )}
      {data.groups.map((g) => (
        <section key={g.key} className="space-y-2" data-admin-group={g.key}>
          <h2 className="text-sm font-semibold">{g.label}</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {g.pages.map((p) => {
              const body = (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-center gap-2 font-medium">
                      {p.kind === "page" ? <FileTextIcon className="size-4 text-muted-foreground" /> : <TableIcon className="size-4 text-muted-foreground" />}
                      {p.label}
                    </span>
                    {p.found === false && <Badge variant="outline" className="shrink-0 text-[10px]">Not in Noor&apos;s menu</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{p.about}</p>
                  {p.kind === "list" && (
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {p.noorTotal !== null ? `${p.noorTotal.toLocaleString()} in Noor` : "Noor's count not read yet"}
                      {p.stored ? ` · ${p.stored.toLocaleString()} stored` : ""}
                    </p>
                  )}
                </>
              );
              return p.open ? (
                <Link key={p.slug} href={`/legacy-cms/admin/${p.slug}`} data-admin-page={p.slug} className="space-y-1 rounded-xl border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {body}
                </Link>
              ) : (
                <div key={p.slug} data-admin-page={p.slug} aria-disabled className="space-y-1 rounded-xl border border-dashed p-3 opacity-60" title="Your Noor access does not include this page">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// --- A Noor list ----------------------------------------------------------------------

export function NoorAdminList({ slug, initial }: { slug: string; initial: List }) {
  const [data, setData] = React.useState<List>(initial);
  const [q, setQ] = React.useState<AdminListQuery>({ page: 1, pageSize: initial.pageSize, search: "", filters: {} });
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState<FormTarget | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);
  const first = React.useRef(true);

  const load = React.useCallback(
    async (next: AdminListQuery) => {
      setLoading(true);
      const r = await A.noorAdminListAction(slug, next);
      setLoading(false);
      if (!r.ok) return toast.error(r.error);
      if (r.data!.kind === "list") setData(r.data as List);
    },
    [slug],
  );
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    void load(q);
  }, [q, load]);
  React.useEffect(() => {
    const t = setTimeout(() => setQ((x) => (x.search === search ? x : { ...x, search, page: 1 })), 400);
    return () => clearTimeout(t);
  }, [search]);

  const remove = async () => {
    if (!removing) return;
    const id = removing;
    setRemoving(null);
    const r = await A.deleteNoorAdminRecordAction(slug, id);
    if (!r.ok) return toast.error(r.error);
    toast.success(`Deleted in Noor.`);
    void load(q);
  };

  return (
    // Bottom room keeps the pager clear of the floating assistant button.
    <div className="space-y-3 pb-16" data-noor-list={slug}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${data.label} in Noor`} aria-label="Search in Noor" className="pl-8" />
        </div>
        {data.filters.map((f) => (
          <div key={f.key} className="min-w-[9rem]">
            <Label className="mb-1 block text-xs text-muted-foreground">{f.label}</Label>
            <Select value={q.filters?.[f.key] || ANY} onValueChange={(v) => setQ((x) => ({ ...x, page: 1, filters: { ...x.filters, [f.key]: v === ANY ? "" : v } }))}>
              <SelectTrigger aria-label={f.label} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>Any</SelectItem>
                {f.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
        <Button variant="outline" size="icon" aria-label="Reload from Noor" onClick={() => void load(q)} disabled={loading}>
          <RefreshCwIcon className={cn(loading && "animate-spin")} />
        </Button>
        {data.canCreate && (
          <Button onClick={() => setEditing({ mode: "create" })} data-noor-create>
            <PlusIcon /> New
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span data-noor-total={data.total}>
          {data.total ? `${data.from.toLocaleString()} to ${data.to.toLocaleString()} of ${data.total.toLocaleString()} in Noor` : "Nothing matches in Noor"}
        </span>
        <Link href={`/legacy-cms?view=records`} className="underline-offset-2 hover:underline">
          Filter the stored copy in Records
        </Link>
      </div>

      <div className={cn("overflow-x-auto rounded-xl border bg-card transition-opacity", loading && "opacity-60")} aria-busy={loading}>
        {data.rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                {data.headers.map((h) => (
                  <TableHead key={h} className="whitespace-nowrap">
                    {h}
                  </TableHead>
                ))}
                {(data.canEdit || data.canDelete) && <TableHead className="w-0 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((r, i) => (
                <TableRow key={r.id || i} data-noor-row={r.id}>
                  {data.headers.map((h) => (
                    <TableCell key={h} className="max-w-[18rem] truncate" title={r.cells[h]}>
                      {r.cells[h] || <span className="text-muted-foreground">-</span>}
                    </TableCell>
                  ))}
                  {(data.canEdit || data.canDelete) && (
                    <TableCell className="whitespace-nowrap text-right">
                      {data.canEdit && r.id && (
                        <Button variant="ghost" size="icon" aria-label={`Edit ${r.id}`} onClick={() => setEditing({ mode: "edit", id: r.id })}>
                          <PencilIcon />
                        </Button>
                      )}
                      {data.canDelete && r.id && (
                        <Button variant="ghost" size="icon" aria-label={`Delete ${r.id}`} className="text-destructive hover:text-destructive" onClick={() => setRemoving(r.id)}>
                          <Trash2Icon />
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <EmptyState title={q.search || Object.values(q.filters ?? {}).some(Boolean) ? "Nothing matches" : `No ${data.label.toLowerCase()} in Noor`} description={q.search ? "Try other words or clear the filters." : undefined} />
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Select value={String(q.pageSize ?? 25)} onValueChange={(v) => setQ((x) => ({ ...x, page: 1, pageSize: Number(v) }))}>
          <SelectTrigger aria-label="Rows per page" className="w-[7.5rem]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[10, 25, 50].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} per page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1 text-sm">
          <Button variant="outline" size="icon" aria-label="Previous page" disabled={data.page <= 1 || loading} onClick={() => setQ((x) => ({ ...x, page: Math.max(1, data.page - 1) }))}>
            <ChevronLeftIcon />
          </Button>
          <span className="px-2 tabular-nums">
            Page {data.page} of {data.pages}
          </span>
          <Button variant="outline" size="icon" aria-label="Next page" disabled={data.page >= data.pages || loading} onClick={() => setQ((x) => ({ ...x, page: data.page + 1 }))}>
            <ChevronRightIcon />
          </Button>
        </div>
      </div>

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{editing?.mode === "edit" ? `Edit ${data.label} ${editing.id}` : `New in ${data.label}`}</SheetTitle>
            <SheetDescription>Saved straight to Noor, checked by Noor&apos;s own rules.</SheetDescription>
          </SheetHeader>
          {editing && (
            <div className="px-4 pb-6">
              <LoadedForm
                key={editing.mode === "edit" ? editing.id : "create"}
                slug={slug}
                target={editing}
                onDone={() => {
                  setEditing(null);
                  void load(q);
                }}
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete record {removing} in Noor?</AlertDialogTitle>
            <AlertDialogDescription>Noor deletes it for everyone. The stored copy here keeps it until the next sync.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()} className="bg-destructive text-white hover:bg-destructive/90" data-noor-confirm-delete>
              Delete in Noor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LoadedForm({ slug, target, onDone }: { slug: string; target: FormTarget; onDone: () => void }) {
  const [state, setState] = React.useState<{ form: NoorForm; canSubmit: boolean } | { error: string } | null>(null);
  React.useEffect(() => {
    let live = true;
    void A.noorAdminFormAction(slug, target).then((r) => live && setState(r.ok ? { form: r.data!.form, canSubmit: r.data!.canSubmit } : { error: r.error }));
    return () => {
      live = false;
    };
  }, [slug, target]);
  if (!state)
    return (
      <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" /> Opening Noor&apos;s form
      </p>
    );
  if ("error" in state) return <p className="py-6 text-sm text-destructive">{state.error}</p>;
  return <NoorFormView slug={slug} target={target} form={state.form} canSubmit={state.canSubmit} onDone={onDone} />;
}

// --- A Noor form ----------------------------------------------------------------------

const MESSAGE = /^(message|body|content|text|sms|notification_body)$/i;

export function NoorFormView({ slug, target, form, canSubmit, onDone }: { slug: string; target: FormTarget; form: NoorForm; canSubmit: boolean; onDone?: () => void }) {
  const initial = React.useMemo(() => Object.fromEntries(form.fields.map((f) => [f.name, f.value])), [form]);
  const [values, setValues] = React.useState<Record<string, unknown>>(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [sending, setSending] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);
  const set = (name: string, v: unknown) => {
    setValues((x) => ({ ...x, [name]: v }));
    setErrors((e) => (e[name] ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== name)) : e));
  };
  const changed = () => Object.fromEntries(form.fields.filter((f) => f.editable && JSON.stringify(values[f.name] ?? null) !== JSON.stringify(initial[f.name] ?? null)).map((f) => [f.name, values[f.name]]));
  // Pages that send something (Send SMS, push) ask once before sending; record forms save at once.
  const sendsOut = target.mode === "page" && /send|notify|sms|push/i.test(`${slug} ${form.submit} ${form.submitLabel}`);

  const submit = async () => {
    setConfirm(false);
    const missing = form.fields.filter((f) => f.required && f.editable && (values[f.name] === null || values[f.name] === undefined || values[f.name] === "" || (Array.isArray(values[f.name]) && !(values[f.name] as unknown[]).length)));
    if (missing.length) {
      setErrors(Object.fromEntries(missing.map((f) => [f.name, [`${f.label} is required.`]])));
      return toast.error(`${missing[0].label} is required.`);
    }
    setSending(true);
    const r = await A.submitNoorAdminFormAction(slug, target, changed());
    setSending(false);
    if (!r.ok) return toast.error(r.error);
    if (!r.data!.ok) {
      setErrors(r.data!.fieldErrors);
      return toast.error(r.data!.error);
    }
    toast.success(target.mode === "create" ? "Created in Noor." : target.mode === "edit" ? "Saved in Noor." : `${form.submitLabel}: Noor accepted it.`);
    onDone?.();
  };

  const visible = form.fields;
  return (
    <form
      className="space-y-4"
      data-noor-form={slug}
      onSubmit={(e) => {
        e.preventDefault();
        if (sendsOut) setConfirm(true);
        else void submit();
      }}
    >
      {form.tabs && form.tabs.length > 1 && (
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1" aria-label="Noor page tabs" data-noor-tabs>
          {form.tabs.map((t) => (
            <Link
              key={t.value}
              href={`?tab=${encodeURIComponent(t.value)}`}
              aria-current={form.tab === t.value ? "page" : undefined}
              className={cn("rounded-md px-3 py-1.5 text-sm", form.tab === t.value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
              data-noor-tab={t.value}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
      {!visible.length && <p className="text-sm text-muted-foreground">This Noor form has no fields; sending it runs {form.submitLabel}.</p>}
      {visible.map((f) => (
        <FieldInput key={f.name} field={f} value={values[f.name]} onChange={(v) => set(f.name, v)} errors={errors[f.name]} disabled={!canSubmit} sms={slug === "send-sms" && MESSAGE.test(f.name)} />
      ))}
      {canSubmit ? (
        <Button type="submit" disabled={sending} data-noor-submit>
          {sending ? <Loader2Icon className="animate-spin" /> : sendsOut ? <SendIcon /> : null} {form.submitLabel}
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">Sending to Noor is for Admin, or the people Admin allows to manage Noor data.</p>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{form.submitLabel}?</AlertDialogTitle>
            <AlertDialogDescription>Noor sends this to real people as soon as you confirm.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submit()} data-noor-confirm-send>
              {form.submitLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

function FieldInput({ field: f, value, onChange, errors, disabled, sms }: { field: NoorField; value: unknown; onChange: (v: unknown) => void; errors?: string[]; disabled: boolean; sms: boolean }) {
  const id = `noor-${f.name}`;
  const off = disabled || !f.editable;
  const text = value === null || value === undefined ? "" : String(value);
  let control: React.ReactNode;
  if (f.kind === "toggle")
    control = (
      <div className="flex items-center gap-2">
        <Switch id={id} checked={!!value} onCheckedChange={(c) => onChange(c)} disabled={off} />
        <Label htmlFor={id} className="font-normal">
          {f.label}
        </Label>
      </div>
    );
  else if (f.kind === "select")
    control = (
      <Select value={text || ANY} onValueChange={(v) => onChange(v === ANY ? null : v)} disabled={off}>
        <SelectTrigger id={id} aria-label={f.label} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{f.required ? "Choose" : "None"}</SelectItem>
          {f.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  else if (f.kind === "multiselect") {
    const list = Array.isArray(value) ? value.map(String) : [];
    control = f.options.length ? (
      <div role="group" aria-label={f.label} className="grid max-h-64 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
        {f.options.map((o) => (
          <label key={o.value} className="flex items-center gap-2 text-sm">
            <Checkbox checked={list.includes(o.value)} disabled={off} onCheckedChange={(c) => onChange(c ? [...list, o.value] : list.filter((x) => x !== o.value))} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
    ) : (
      <p className="text-xs text-muted-foreground">{list.length ? list.join(", ") : "None"} (Noor lists these choices only on its own page.)</p>
    );
  } else if (f.kind === "textarea") {
    const c = sms ? smsCount(text) : null;
    control = (
      <>
        <Textarea id={id} value={text} onChange={(e) => onChange(e.target.value)} disabled={off} rows={sms ? 5 : 4} maxLength={f.maxLength ?? undefined} placeholder={f.placeholder ?? undefined} aria-invalid={!!errors?.length} />
        <p className="text-right text-xs tabular-nums text-muted-foreground" data-sms-count={c ? c.segments : undefined}>
          {c ? `${c.characters} characters · ${c.segments} SMS ${c.segments === 1 ? "part" : "parts"} (${c.encoding}) · ${c.remaining} left in this part` : `${[...text].length}${f.maxLength ? ` of ${f.maxLength}` : ""} characters`}
        </p>
      </>
    );
  } else if (f.kind === "file" || f.kind === "other")
    control = <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground">{f.kind === "file" ? "Files are attached on Noor's own page; this form keeps the ones already there." : "This field is kept as Noor has it."}</p>;
  else
    control = (
      <Input
        id={id}
        type={f.kind === "datetime" ? "datetime-local" : ["email", "tel", "url", "number", "password", "date", "time", "color"].includes(f.kind) ? f.kind : "text"}
        value={f.kind === "datetime" ? text.replace(" ", "T").slice(0, 16) : f.kind === "date" ? text.slice(0, 10) : text}
        onChange={(e) => onChange(e.target.value)}
        disabled={off}
        maxLength={f.maxLength ?? undefined}
        placeholder={f.placeholder ?? undefined}
        aria-invalid={!!errors?.length}
        autoComplete={f.kind === "password" ? "new-password" : undefined}
      />
    );
  return (
    <div className="space-y-1.5" data-noor-field={f.name}>
      {f.kind !== "toggle" && (
        <Label htmlFor={id}>
          {f.label}
          {f.required && <span className="text-destructive"> *</span>}
        </Label>
      )}
      {control}
      {errors?.map((e) => (
        <p key={e} className="text-xs text-destructive">
          {e}
        </p>
      ))}
    </div>
  );
}

export function NoorOpenLink({ href }: { href: string }) {
  return (
    <Button variant="outline" size="sm" asChild>
      <a href={href} target="_blank" rel="noreferrer">
        <ExternalLinkIcon /> Open in Noor
      </a>
    </Button>
  );
}
