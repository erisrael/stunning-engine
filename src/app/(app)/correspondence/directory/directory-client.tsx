"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2Icon, PlusIcon, SearchIcon, ShieldCheckIcon, StarIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteContactAction, saveContactAction, saveOrgAction } from "@/app/actions/correspondence";
import type { Contact, Org } from "@/server/corr/directory";
import { cn } from "@/lib/utils";

const SOURCE: Record<Org["source"], { label: string; tone: string; hint: string }> = {
  internal: { label: "Entered here", tone: "bg-muted text-muted-foreground", hint: "Typed in by someone in the company" },
  external: { label: "External, not verified", tone: "bg-amber-500/15 text-amber-800 dark:text-amber-200", hint: "Found in an outside directory and not yet checked" },
  verified: { label: "Verified", tone: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200", hint: "Checked against an authoritative source" },
};

const blank = (): Partial<Org> => ({ legalName: "", source: "internal", status: "active" });

export function DirectoryClient({ initial, q: q0, canEdit }: { initial: Org[]; q: string; canEdit: boolean }) {
  const router = useRouter();
  const [q, setQ] = React.useState(q0);
  const [edit, setEdit] = React.useState<Partial<Org> | null>(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => (e.preventDefault(), router.push(`/correspondence/directory${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`))} className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, registration or tax no., contact, email, phone, city, industry" className="h-9 w-96 max-w-full pl-7" aria-label="Search the directory" />
        </form>
        <span className="text-xs text-muted-foreground">{initial.length} shown</span>
        {canEdit && (
          <Button className="ml-auto" onClick={() => setEdit(blank())}>
            <PlusIcon /> Add organisation
          </Button>
        )}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {initial.map((o) => (
          <Card key={o.id} className={cn(canEdit && "cursor-pointer hover:border-primary")} onClick={() => canEdit && setEdit(o)}>
            <CardContent className="space-y-1.5 p-4 text-sm">
              <div className="flex items-start gap-2">
                <Building2Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 font-medium">
                    <span className="truncate">{o.legalName}</span>
                    {o.favorite && <StarIcon className="size-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                  </p>
                  {o.tradingName && <p className="truncate text-xs text-muted-foreground">{o.tradingName}</p>}
                </div>
                <span className={cn("shrink-0 rounded px-1.5 py-0.5 text-[10px]", SOURCE[o.source].tone)} title={SOURCE[o.source].hint}>
                  {o.source === "verified" && <ShieldCheckIcon className="mr-0.5 inline size-3" />}
                  {SOURCE[o.source].label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{[o.industry, o.city, o.registrationNo && `Reg. ${o.registrationNo}`, o.taxId && `TIN ${o.taxId}`].filter(Boolean).join(" · ") || "No details yet"}</p>
              <p className="text-xs">{[o.email, o.phone].filter(Boolean).join(" · ")}</p>
              {o.contacts?.length ? <p className="truncate text-xs text-muted-foreground">Contacts: {o.contacts.map((c) => c.name).join(", ")}</p> : null}
              {o.letters ? <p className="text-[11px] text-muted-foreground">{o.letters} letters{o.lastLetterAt ? `, last ${new Date(o.lastLetterAt).toLocaleDateString()}` : ""}</p> : null}
            </CardContent>
          </Card>
        ))}
        {!initial.length && <p className="col-span-full py-12 text-center text-sm text-muted-foreground">{q0 ? "Nothing matches." : canEdit ? "No organisations yet. Add the first." : "No organisations yet."}</p>}
      </div>
      {edit && <OrgDialog value={edit} onClose={() => setEdit(null)} onSaved={() => (setEdit(null), router.refresh())} />}
    </div>
  );
}

function OrgDialog({ value, onClose, onSaved }: { value: Partial<Org>; onClose: () => void; onSaved: () => void }) {
  const [o, setO] = React.useState(value);
  const [contacts, setContacts] = React.useState<Contact[]>(value.contacts ?? []);
  const [c, setC] = React.useState<Partial<Contact>>({ name: "" });
  const [busy, setBusy] = React.useState(false);
  const f = (k: keyof Org, label: string, opts: { area?: boolean; span?: boolean } = {}) => (
    <label className={cn("space-y-1 text-xs", opts.span && "sm:col-span-2")}>
      <span className="font-medium">{label}</span>
      {opts.area ? <Textarea rows={2} value={String(o[k] ?? "")} onChange={(e) => setO({ ...o, [k]: e.target.value })} /> : <Input value={String(o[k] ?? "")} onChange={(e) => setO({ ...o, [k]: e.target.value })} />}
    </label>
  );
  return (
    <Dialog open onOpenChange={(x) => !x && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{o.id ? o.legalName : "New organisation"}</DialogTitle>
          <DialogDescription>Mark a record verified only after checking it against an authoritative source (for example the trade registry). Your name and the time are kept.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {f("legalName", "Legal name", { span: true })}
          {f("tradingName", "Trading name")}
          {f("kind", "Type (company, government, NGO, school…)")}
          {f("registrationNo", "Registration number")}
          {f("taxId", "Tax ID (TIN)")}
          {f("industry", "Industry")}
          {f("country", "Country")}
          {f("region", "Region")}
          {f("city", "City")}
          {f("address", "Address", { area: true, span: true })}
          {f("postalAddress", "P.O. Box / postal address")}
          {f("website", "Website")}
          {f("email", "Official email")}
          {f("phone", "Phone")}
          {f("fax", "Fax")}
          <label className="space-y-1 text-xs">
            <span className="font-medium">Preferred channel</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={o.channel ?? ""} onChange={(e) => setO({ ...o, channel: e.target.value || null })}>
              <option value="">Not set</option>
              {["email", "hand", "courier", "post", "fax", "portal"].map((x) => (
                <option key={x} value={x}>
                  {x[0]!.toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="font-medium">Source</span>
            <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={o.source ?? "internal"} onChange={(e) => setO({ ...o, source: e.target.value as Org["source"] })}>
              {(Object.keys(SOURCE) as Org["source"][]).map((x) => (
                <option key={x} value={x}>
                  {SOURCE[x].label}
                </option>
              ))}
            </select>
            {o.verifiedBy && <span className="block text-[11px] text-muted-foreground">Verified by {o.verifiedBy} on {o.verifiedAt ? new Date(o.verifiedAt).toLocaleDateString() : ""}</span>}
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={!!o.favorite} onChange={(e) => setO({ ...o, favorite: e.target.checked })} /> Favourite (shown first)
          </label>
          {f("notes", "Notes", { area: true, span: true })}
        </div>
        {o.id && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm font-medium">Contacts</p>
            {contacts.map((x) => (
              <div key={x.id} className="flex items-center gap-2 text-xs">
                <span className="flex-1">
                  <b>{x.name}</b>
                  {x.title ? `, ${x.title}` : ""} {x.primary && <span className="rounded bg-muted px-1">main</span>}
                  <span className="block text-muted-foreground">{[x.department, x.email, x.phone].filter(Boolean).join(" · ")}</span>
                </span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Remove ${x.name}`}
                  onClick={async () => {
                    const r = await deleteContactAction(x.id);
                    if (!r.ok) return toast.error(r.error);
                    setContacts(contacts.filter((y) => y.id !== x.id));
                  }}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
            <div className="grid gap-1 sm:grid-cols-3">
              <Input className="h-8 text-xs" placeholder="Name" value={c.name ?? ""} onChange={(e) => setC({ ...c, name: e.target.value })} />
              <Input className="h-8 text-xs" placeholder="Position" value={c.title ?? ""} onChange={(e) => setC({ ...c, title: e.target.value })} />
              <Input className="h-8 text-xs" placeholder="Department" value={c.department ?? ""} onChange={(e) => setC({ ...c, department: e.target.value })} />
              <Input className="h-8 text-xs" placeholder="Email" value={c.email ?? ""} onChange={(e) => setC({ ...c, email: e.target.value })} />
              <Input className="h-8 text-xs" placeholder="Phone" value={c.phone ?? ""} onChange={(e) => setC({ ...c, phone: e.target.value })} />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={!!c.primary} onChange={(e) => setC({ ...c, primary: e.target.checked })} /> Main contact
              </label>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={!c.name?.trim()}
              onClick={async () => {
                const r = await saveContactAction({ ...c, orgId: o.id!, name: c.name! });
                if (!r.ok) return toast.error(r.error);
                setContacts([...contacts.map((x) => (c.primary ? { ...x, primary: false } : x)), { id: r.data as string, orgId: o.id!, name: c.name!, title: c.title ?? null, department: c.department ?? null, email: c.email ?? null, phone: c.phone ?? null, fax: null, primary: !!c.primary }]);
                setC({ name: "" });
              }}
            >
              <PlusIcon /> Add contact
            </Button>
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={busy || !o.legalName?.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await saveOrgAction({ ...o, legalName: o.legalName! });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              toast.success(o.id ? "Saved" : "Added. Now add its contacts.");
              if (o.id) onSaved();
              else setO({ ...o, id: r.data as string });
            }}
          >
            {o.id ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
