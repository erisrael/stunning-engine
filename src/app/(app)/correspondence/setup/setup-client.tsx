"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangleIcon, PlusIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { saveCategoryAction, saveCorrNotifyAction, saveEntityAction, setAttachPolicyAction } from "@/app/actions/correspondence";
import type { Category, Entity } from "@/server/corr/setup";
import { cn } from "@/lib/utils";

type Reg = { ref_number: string; value: number; state: string; allocated_at: string; note: string | null; document_id: string | null; subject: string | null; by: string | null };
type Trail = { events: { seq: number; action: string; actorName: string | null; at: string; detail: Record<string, unknown> }[]; intact: boolean; brokenAt: number | null } | null;

// What a pattern gives, shown while it is typed (the server makes the real number when a letter is issued).
function sample(pattern: string, c: Partial<Category>, entityCode: string, seq = 1) {
  const now = new Date();
  const fyStart = c.config?.fyStartMonth ?? 7;
  const fy = now.getMonth() + 1 >= fyStart && fyStart > 1 ? now.getFullYear() + 1 : now.getFullYear();
  return pattern
    .replaceAll("{ENTITY}", entityCode)
    .replaceAll("{PARENT}", entityCode)
    .replaceAll("{DEPT}", "DEPT")
    .replaceAll("{CAT}", c.code || "CAT")
    .replaceAll("{YYYY}", String(now.getFullYear()))
    .replaceAll("{YY}", String(now.getFullYear()).slice(2))
    .replaceAll("{FY}", `FY${fy}`)
    .replaceAll("{MM}", String(now.getMonth() + 1).padStart(2, "0"))
    .replaceAll("{SEQ}", String(seq).padStart(c.padding ?? 6, "0"));
}

type Services = { ocr: { available: boolean; pdf: boolean; languages: string[] }; fax: boolean; clamav: boolean; key: { fingerprint: string; algorithm: string }; pades: boolean };
export function SetupClient({ entities, categories, next, tokens, register, trail, canEdit, notifyCfg, attach, services }: { entities: Entity[]; categories: Category[]; next: Record<string, string>; tokens: string[]; register: Reg[]; trail: Trail; canEdit: boolean; notifyCfg: { smsApprovals: boolean; smsOverdue: boolean; smsDelivery: boolean }; attach: { allowZip: boolean; requireScan: boolean }; services: Services }) {
  const [sms, setSms] = React.useState(notifyCfg);
  const [att, setAtt] = React.useState(attach);
  const router = useRouter();
  const [cat, setCat] = React.useState<Partial<Category> | null>(null);
  const [ent, setEnt] = React.useState<Partial<Entity> | null>(null);
  const code = (id: string | null | undefined) => entities.find((e) => e.id === id)?.code ?? entities[0]?.code ?? "CO";
  return (
    <Tabs defaultValue={canEdit ? "categories" : "register"}>
      <TabsList>
        {canEdit && <TabsTrigger value="categories">Categories and numbering</TabsTrigger>}
        {canEdit && <TabsTrigger value="entities">Company and branches</TabsTrigger>}
        {canEdit && <TabsTrigger value="services">Delivery, OCR and security</TabsTrigger>}
        <TabsTrigger value="register">Number register ({register.length})</TabsTrigger>
        {trail && <TabsTrigger value="history">Setup history</TabsTrigger>}
      </TabsList>

      {canEdit && (
        <TabsContent value="categories" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setCat({ code: "", name: "", pattern: "{ENTITY}/{CAT}/{YYYY}/{SEQ}", scope: "category", reset: "yearly", padding: 6, classification: "internal", config: { fyStartMonth: 7 }, entityId: entities[0]?.id ?? null, active: true })}>
              <PlusIcon /> New category
            </Button>
          </div>
          <Card>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-xs">
                <thead className="bg-muted/60 text-left text-[11px] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Pattern</th>
                    <th className="px-3 py-2">Counted</th>
                    <th className="px-3 py-2">Next number</th>
                    <th className="px-3 py-2">Classification</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className={cn("cursor-pointer border-t hover:bg-muted/40", !c.active && "opacity-50")} onClick={() => setCat(c)}>
                      <td className="px-3 py-2 font-mono">{c.code}</td>
                      <td className="px-3 py-2">{c.name}{!c.active && " (off)"}</td>
                      <td className="px-3 py-2 font-mono">{c.pattern}</td>
                      <td className="px-3 py-2">{{ category: "per category", department: "per department", entity: "across the entity" }[c.scope]}, {{ yearly: "from 1 each year", fiscal: "from 1 each fiscal year", never: "never reset" }[c.reset]}</td>
                      <td className="px-3 py-2 font-mono">{next[c.id]}</td>
                      <td className="px-3 py-2 capitalize">{c.classification}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {canEdit && (
        <TabsContent value="entities" className="mt-3 space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setEnt({ kind: "branch", code: "", legalName: "", parentId: entities[0]?.id ?? null })}>
              <PlusIcon /> Add subsidiary or branch
            </Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {entities.map((e) => (
              <Card key={e.id} className="cursor-pointer hover:border-primary" onClick={() => setEnt(e)}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm">
                    {e.legalName} <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                  </CardTitle>
                  <CardDescription className="capitalize">{e.kind}{e.parentId ? ` of ${entities.find((x) => x.id === e.parentId)?.legalName ?? ""}` : ""}</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">{[e.address, e.phone, e.email, e.registrationNo && `Reg. ${e.registrationNo}`, e.taxId && `TIN ${e.taxId}`].filter(Boolean).join(" · ") || "No details yet"}</CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            The logo, colours and footer come from the company letterhead (<Link className="underline" href="/tools/letters?tab=letterhead">Tools, Letters, Letterhead</Link>). Each issued letter keeps a copy, so changing them later never changes a sent letter.
          </p>
        </TabsContent>
      )}

      {canEdit && (
        <TabsContent value="services" className="mt-3 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Text messages (SMS)</CardTitle><CardDescription className="text-xs">Sent through the SMS providers set for alerts (Admin, Integrations), to the phone in each person&apos;s profile.</CardDescription></CardHeader>
            <CardContent className="space-y-2 text-sm">
              {([["smsApprovals", "When an approval, signature or stamp is waiting"], ["smsOverdue", "When a step is overdue (and to the supervisor)"], ["smsDelivery", "When a delivery fails"]] as const).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={sms[k]} onChange={(e) => setSms({ ...sms, [k]: e.target.checked })} /> {l}</label>
              ))}
              <Button size="sm" onClick={async () => { const r = await saveCorrNotifyAction(sms); if (!r.ok) return toast.error(r.error); toast.success("Saved"); }}>Save</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Attachments</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={att.allowZip} onChange={(e) => setAtt({ ...att, allowZip: e.target.checked })} /> Allow ZIP files</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={att.requireScan} onChange={(e) => setAtt({ ...att, requireScan: e.target.checked })} /> Refuse files that cannot be virus-scanned</label>
              <Button size="sm" onClick={async () => { const r = await setAttachPolicyAction(att); if (!r.ok) return toast.error(r.error); toast.success("Saved"); }}>Save</Button>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Connected services</CardTitle></CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>{services.ocr.available ? "✓" : "✗"} Text reading (OCR): {services.ocr.available ? `Tesseract, ${services.ocr.languages.join(" and ") || "English"}${services.ocr.pdf ? ", PDFs and pictures" : ", pictures only (install poppler for PDFs)"}` : "not installed (the server image installs Tesseract with English and Amharic)"}</p>
              <p>{services.clamav ? "✓" : "✗"} Virus scanning: {services.clamav ? "ClamAV connected" : "not connected (set CLAMAV_HOST to a ClamAV server); files are marked not scanned"}</p>
              <p>{services.fax ? "✓" : "✗"} Fax: {services.fax ? "connected" : "not connected (FAX_PROVIDER=phaxio with PHAXIO_KEY and PHAXIO_SECRET); fax is not offered"}</p>
              <p>✓ Server signature on every issued letter: {services.key.algorithm}, key {services.key.fingerprint} (public key at /api/corr/public-key)</p>
              <p>{services.pades ? "✓" : "✗"} Certificate-based PDF signatures (PAdES): {services.pades ? "signing service connected" : "needs a certificate from a certificate authority and a signing service; until then letters carry the server signature above, which proves they were not changed"}</p>
            </CardContent>
          </Card>
        </TabsContent>
      )}

      <TabsContent value="register" className="mt-3">
        <Card>
          <CardContent className="max-h-[65vh] overflow-auto p-0">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Number</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Letter</th>
                  <th className="px-3 py-2">Given</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {register.map((r) => (
                  <tr key={r.ref_number} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{r.document_id ? <Link className="hover:underline" href={`/correspondence/${r.document_id}`}>{r.ref_number}</Link> : r.ref_number}</td>
                    <td className={cn("px-3 py-1.5", r.state === "void" && "text-destructive")}>{r.state}</td>
                    <td className="max-w-64 truncate px-3 py-1.5">{r.subject ?? "-"}</td>
                    <td className="px-3 py-1.5 whitespace-nowrap">{new Date(r.allocated_at).toLocaleString()}</td>
                    <td className="px-3 py-1.5">{r.by ?? "-"}</td>
                    <td className="max-w-56 truncate px-3 py-1.5">{r.note ?? ""}</td>
                  </tr>
                ))}
                {!register.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">No numbers given yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </TabsContent>

      {trail && (
        <TabsContent value="history" className="mt-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {trail.intact ? <ShieldCheckIcon className="size-4 text-emerald-600" /> : <AlertTriangleIcon className="size-4 text-destructive" />}
                {trail.intact ? "Record chain intact" : `Record ${trail.brokenAt} was changed`}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-[60vh] space-y-1 overflow-auto text-xs">
              {trail.events.slice().reverse().map((e) => (
                <p key={e.seq} className="border-l-2 pl-2">
                  <b>{e.action}</b> by {e.actorName ?? "System"} · {new Date(e.at).toLocaleString()}
                  <span className="block truncate font-mono text-[10px] text-muted-foreground">{JSON.stringify(e.detail)}</span>
                </p>
              ))}
              {!trail.events.length && <p className="text-muted-foreground">No setup changes yet.</p>}
            </CardContent>
          </Card>
        </TabsContent>
      )}

      {cat && (
        <Dialog open onOpenChange={(o) => !o && setCat(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{cat.id ? cat.name : "New category"}</DialogTitle>
              <DialogDescription>Changing the pattern affects only letters issued from now on; issued letters keep their numbers.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium">Code</span>
                <Input value={cat.code ?? ""} onChange={(e) => setCat({ ...cat, code: e.target.value.toUpperCase() })} />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Name</span>
                <Input value={cat.name ?? ""} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
              </label>
              <label className="space-y-1 text-xs sm:col-span-2">
                <span className="font-medium">Number pattern</span>
                <Input className="font-mono" value={cat.pattern ?? ""} onChange={(e) => setCat({ ...cat, pattern: e.target.value })} />
                <span className="flex flex-wrap gap-1">
                  {tokens.map((t) => (
                    <button key={t} type="button" className="rounded border px-1 font-mono text-[10px] hover:bg-muted" onClick={() => setCat({ ...cat, pattern: `${cat.pattern ?? ""}${t}` })}>
                      {t}
                    </button>
                  ))}
                </span>
                <span className="block text-muted-foreground">
                  Looks like: <span className="font-mono text-foreground">{sample(cat.pattern ?? "", cat, code(cat.entityId))}</span>
                </span>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Counted</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={cat.scope} onChange={(e) => setCat({ ...cat, scope: e.target.value as Category["scope"] })}>
                  <option value="category">Per category</option>
                  <option value="department">Per department in the category</option>
                  <option value="entity">Across the whole entity</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Starts again at 1</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={cat.reset} onChange={(e) => setCat({ ...cat, reset: e.target.value as Category["reset"] })}>
                  <option value="yearly">Each calendar year</option>
                  <option value="fiscal">Each fiscal year</option>
                  <option value="never">Never</option>
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Digits in the running number</span>
                <Input type="number" min={1} max={10} value={cat.padding ?? 6} onChange={(e) => setCat({ ...cat, padding: Number(e.target.value) })} />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Fiscal year starts in month</span>
                <Input type="number" min={1} max={12} value={cat.config?.fyStartMonth ?? 7} onChange={(e) => setCat({ ...cat, config: { ...cat.config, fyStartMonth: Number(e.target.value) } })} />
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Default classification</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={cat.classification} onChange={(e) => setCat({ ...cat, classification: e.target.value as Category["classification"] })}>
                  {["public", "internal", "confidential", "restricted"].map((x) => (
                    <option key={x} value={x}>
                      {x[0]!.toUpperCase() + x.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Sent by</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={cat.entityId ?? ""} onChange={(e) => setCat({ ...cat, entityId: e.target.value })}>
                  {entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.legalName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs sm:col-span-2">
                <input type="checkbox" checked={cat.active !== false} onChange={(e) => setCat({ ...cat, active: e.target.checked })} /> In use (off hides it from new letters; its letters stay)
              </label>
            </div>
            <DialogFooter>
              <Button
                onClick={async () => {
                  const r = await saveCategoryAction(cat as Category);
                  if (!r.ok) return toast.error(r.error);
                  toast.success("Saved");
                  setCat(null);
                  router.refresh();
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {ent && (
        <Dialog open onOpenChange={(o) => !o && setEnt(null)}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>{ent.id ? ent.legalName : "New subsidiary or branch"}</DialogTitle>
              <DialogDescription>The code goes into reference numbers ({"{ENTITY}"}).</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["legalName", "Legal name"],
                  ["code", "Code"],
                  ["tradingName", "Trading name"],
                  ["registrationNo", "Registration number"],
                  ["taxId", "Tax ID (TIN)"],
                  ["phone", "Phone"],
                  ["email", "Email"],
                  ["website", "Website"],
                  ["address", "Address"],
                ] as [keyof Entity, string][]
              ).map(([k, l]) => (
                <label key={k} className={cn("space-y-1 text-xs", k === "address" && "sm:col-span-2")}>
                  <span className="font-medium">{l}</span>
                  <Input value={String(ent[k] ?? "")} onChange={(e) => setEnt({ ...ent, [k]: k === "code" ? e.target.value.toUpperCase() : e.target.value })} />
                </label>
              ))}
              <label className="space-y-1 text-xs">
                <span className="font-medium">Kind</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={ent.kind} onChange={(e) => setEnt({ ...ent, kind: e.target.value as Entity["kind"] })}>
                  <option value="company">Company</option>
                  <option value="subsidiary">Subsidiary</option>
                  <option value="branch">Branch</option>
                </select>
              </label>
              <div className="space-y-2 rounded-md border p-2 sm:col-span-2">
                <p className="text-xs font-medium">Its own letterhead (empty parts use the company letterhead)</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {ent.letterhead?.logo && <img src={ent.letterhead.logo} alt="Logo" className="h-10 rounded border bg-white p-0.5" />}
                  <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 hover:bg-muted">
                    {ent.letterhead?.logo ? "Change logo" : "Own logo"}
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 300_000) return toast.error("Use a logo under 300 KB."); const r = new FileReader(); r.onload = () => setEnt({ ...ent, letterhead: { ...ent.letterhead, logo: String(r.result) } }); r.readAsDataURL(f); }} />
                  </label>
                  {ent.letterhead?.logo && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEnt({ ...ent, letterhead: { ...ent.letterhead, logo: null } })}>Use the company logo</Button>}
                  <label className="flex items-center gap-1">Colour <input type="color" value={ent.letterhead?.primary ?? "#16a34a"} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, primary: e.target.value } })} /></label>
                  <label className="flex items-center gap-1">Name colour <input type="color" value={ent.letterhead?.accent ?? "#0f172a"} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, accent: e.target.value } })} /></label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input className="h-8 text-xs" value={ent.letterhead?.tagline ?? ""} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, tagline: e.target.value } })} placeholder="Line under the name" />
                  <Input className="h-8 text-xs" value={ent.letterhead?.footer ?? ""} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, footer: e.target.value } })} placeholder="Footer text" />
                  <Input className="h-8 text-xs" value={ent.letterhead?.signName ?? ""} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, signName: e.target.value } })} placeholder="Default signatory" />
                  <Input className="h-8 text-xs" value={ent.letterhead?.signTitle ?? ""} onChange={(e) => setEnt({ ...ent, letterhead: { ...ent.letterhead, signTitle: e.target.value } })} placeholder="Signatory's position" />
                </div>
              </div>
              <label className="space-y-1 text-xs">
                <span className="font-medium">Part of</span>
                <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={ent.parentId ?? ""} onChange={(e) => setEnt({ ...ent, parentId: e.target.value || null })}>
                  <option value="">None (top level)</option>
                  {entities.filter((x) => x.id !== ent.id).map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.legalName}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DialogFooter>
              <Button
                onClick={async () => {
                  const r = await saveEntityAction(ent as Entity);
                  if (!r.ok) return toast.error(r.error);
                  toast.success("Saved");
                  setEnt(null);
                  router.refresh();
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Tabs>
  );
}
