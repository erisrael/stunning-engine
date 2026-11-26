"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { MultiSelect } from "@/components/app/multi-select";
import { createGptClientAction, revokeGptClientAction, saveToolsAccessAction } from "@/app/actions/tools";
import { Input } from "@/components/ui/input";
import { TOOL_APPS, TOOL_FEATURES } from "@/lib/tools";
import { DESIGN_FONTS } from "@/lib/design";
import { LETTER_LIBRARY } from "@/lib/letter-library";
import type { Switch as Sw, ToolsConfig } from "@/server/tools";
import { cn } from "@/lib/utils";
import { clearWhite } from "@/components/app/image-tools";

type Row = { key: string; label: string; hint: string };
type Person = { id: string; name: string; roles: string[] };

// Who gets something: roles, plus people always given it, plus people never given it.
function WhoPicker({ s, set, roles, people, label, everyone = "Everyone with Tools hub" }: { s: Sw; set: (n: Partial<Sw>) => void; roles: { value: string; label: string }[]; people: { value: string; label: string }[]; label: string; everyone?: string }) {
  const [open, setOpen] = React.useState(s.users.length > 0 || s.blocked.length > 0);
  return (
    <div className="space-y-1.5">
      <MultiSelect label={`Roles for ${label}`} options={roles} value={s.roles} onChange={(v: string[]) => set({ roles: v })} placeholder={everyone} />
      <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setOpen(!open)} aria-expanded={open}>
        <ChevronDownIcon className={cn("size-3 transition-transform", !open && "-rotate-90")} /> People ({s.users.length} added, {s.blocked.length} left out)
      </button>
      {open && (
        <div className="grid gap-1.5">
          <MultiSelect label={`People who always get ${label}`} options={people} value={s.users} onChange={(v: string[]) => set({ users: v, blocked: s.blocked.filter((x) => !v.includes(x)) })} placeholder="Add people (whatever their role)" />
          <MultiSelect label={`People who never get ${label}`} options={people} value={s.blocked} onChange={(v: string[]) => set({ blocked: v, users: s.users.filter((x) => !v.includes(x)) })} placeholder="Leave people out" />
        </div>
      )}
    </div>
  );
}

export function ToolsAdmin({ initial, roles, people = [], gptClients = [] }: { initial: ToolsConfig; roles: { key: string; label: string }[]; people?: Person[]; gptClients?: { client_id: string; name: string; created_at: string; revoked_at: string | null }[] }) {
  const router = useRouter();
  const [c, setC] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const options = roles.map((r) => ({ value: r.key, label: r.label }));
  const peopleOpts = people.map((p) => ({ value: p.id, label: p.name, hint: p.roles.map((r) => roles.find((x) => x.key === r)?.label ?? r).join(", ") }));

  const section = (title: string, rows: readonly Row[], part: "apps" | "features") => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{title}</p>
      <div className="divide-y rounded-md border">
        {rows.map((r) => {
          const s = (c[part] as Record<string, Sw>)[r.key]!;
          const set = (next: Partial<Sw>) => setC({ ...c, [part]: { ...c[part], [r.key]: { ...s, ...next } } });
          return (
            <div key={r.key} className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:items-start">
              <label className="flex items-start gap-3">
                <Switch className="mt-0.5" checked={s.on} onCheckedChange={(v) => set({ on: v })} aria-label={r.label} />
                <span>
                  <span className="block text-sm font-medium">{r.label}</span>
                  <span className="block text-xs text-muted-foreground">{r.hint}</span>
                </span>
              </label>
              <div className={s.on ? "" : "pointer-events-none opacity-50"}>
                <WhoPicker s={s} set={set} roles={options} people={peopleOpts} label={r.label} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const saveAll = async (part?: "design" | "seal") => {
    setBusy(true);
    const r = await saveToolsAccessAction(part === "design" ? { design: c.design } : part === "seal" ? { seal: c.seal } : { enabled: c.enabled, apps: c.apps, features: c.features });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Saved");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tools hub</CardTitle>
          <CardDescription>
            Six apps that work inside Myseed with no outside service. Switch each app and connection on or off, then choose who gets it: roles (none picked = everyone whose role has &ldquo;Tools hub&rdquo; in{" "}
            <Link className="underline" href="/admin?tab=permissions">
              Roles &amp; permissions
            </Link>
            ), people who always get it whatever their role, and people left out. People given a connection connect their own account (their own Notion, Claude or ChatGPT). Notes, documents and reminders are private to each person.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={c.enabled} onCheckedChange={(v) => setC({ ...c, enabled: v })} />
            Tools hub on
          </label>
          <fieldset disabled={!c.enabled} className="space-y-5 disabled:opacity-50">
            {section("Apps", TOOL_APPS, "apps")}
            {section("Connections (optional; the apps work without them)", TOOL_FEATURES, "features")}
          </fieldset>
          <Button disabled={busy} onClick={() => saveAll()}>
            Save
          </Button>
          <GptClients clients={gptClients} />
        </CardContent>
      </Card>
      <DesignAdmin c={c} setC={setC} roles={options} people={peopleOpts} onSave={() => saveAll("design")} busy={busy} />
      <SealAdmin c={c} setC={setC} roles={options} people={peopleOpts} onSave={() => saveAll("seal")} busy={busy} />
    </div>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

// The design editor (Canva style) for letters, decks and Correspondence: where it is offered, for whom, and what it allows.
function DesignAdmin({ c, setC, roles, people, onSave, busy }: { c: ToolsConfig; setC: (c: ToolsConfig) => void; roles: { value: string; label: string }[]; people: { value: string; label: string }[]; onSave: () => void; busy: boolean }) {
  const d = c.design;
  const set = (p: Partial<ToolsConfig["design"]>) => setC({ ...c, design: { ...d, ...p } });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Design editor</CardTitle>
        <CardDescription>A Canva-style editor for letters, slides and other designs: drag, resize, rotate, layers, pictures, shapes, icons, tables, backgrounds and brand colours, with a switch between editing and preview.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Where</p>
            <Check label="Company Letter Generator (Tools)" checked={d.surfaces.letters} onChange={(v) => set({ surfaces: { ...d.surfaces, letters: v } })} />
            <Check label="Deck Maker (free-design slides)" checked={d.surfaces.decks} onChange={(v) => set({ surfaces: { ...d.surfaces, decks: v } })} />
            <Check label="Correspondence letters" checked={d.surfaces.correspondence} onChange={(v) => set({ surfaces: { ...d.surfaces, correspondence: v } })} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Who</p>
            <WhoPicker s={d.who} set={(n) => set({ who: { ...d.who, ...n } })} roles={roles} people={people} label="the design editor" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Modes</p>
            <label className="flex items-center gap-2 text-sm">
              A letter opens in
              <select className="h-8 rounded-md border bg-background px-2 text-sm" value={d.defaultMode} onChange={(e) => set({ defaultMode: e.target.value as "write" })}>
                <option value="write">Write (form and text)</option>
                <option value="design">Design (free editor)</option>
                <option value="preview">Preview</option>
              </select>
            </label>
            <Check label="People may switch between writing, designing and previewing" checked={d.allowModeSwitch} onChange={(v) => set({ allowModeSwitch: v })} />
            <Check label="Letterhead parts stay locked" hint="The logo, name, contacts and footer a template places cannot be moved, changed or deleted." checked={d.lockLetterhead} onChange={(v) => set({ lockLetterhead: v })} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">What people may add</p>
            <Check label="Upload pictures" checked={d.allowUploads} onChange={(v) => set({ allowUploads: v })} />
            <label className="flex items-center gap-2 text-sm">
              Largest picture
              <Input type="number" className="h-8 w-24" min={100} max={3000} value={d.maxUploadKb} onChange={(e) => set({ maxUploadKb: Number(e.target.value) })} /> KB
            </label>
            <Check label="Shapes" checked={d.allowShapes} onChange={(v) => set({ allowShapes: v })} />
            <Check label="Icons" checked={d.allowIcons} onChange={(v) => set({ allowIcons: v })} />
            <Check label="Tables" checked={d.allowTables} onChange={(v) => set({ allowTables: v })} />
            <Check label="QR codes" checked={d.allowQr} onChange={(v) => set({ allowQr: v })} />
            <Check label="Background pictures" checked={d.allowBackgroundImage} onChange={(v) => set({ allowBackgroundImage: v })} />
            <Check label="Change the page size" checked={d.allowPageSize} onChange={(v) => set({ allowPageSize: v })} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Brand</p>
            <Check label="Any colour" hint="Off: only the brand colours below." checked={d.allowCustomColors} onChange={(v) => set({ allowCustomColors: v })} />
            <div className="flex flex-wrap items-center gap-1">
              {d.palette.map((col, i) => (
                <span key={i} className="inline-flex items-center">
                  <input type="color" value={col} aria-label={`Brand colour ${i + 1}`} onChange={(e) => set({ palette: d.palette.map((x, j) => (j === i ? e.target.value : x)) })} className="h-7 w-8 cursor-pointer rounded border p-0" />
                  <button type="button" aria-label="Remove colour" className="px-0.5 text-xs text-muted-foreground" onClick={() => set({ palette: d.palette.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </span>
              ))}
              {d.palette.length < 24 && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ palette: [...d.palette, "#16a34a"] })}>
                  + Colour
                </Button>
              )}
            </div>
            <Check label="Every font" hint="Off: only the fonts below." checked={d.allowAllFonts} onChange={(v) => set({ allowAllFonts: v })} />
            {!d.allowAllFonts && <MultiSelect label="Fonts" options={DESIGN_FONTS.map((f) => ({ value: f, label: f }))} value={d.fonts} onChange={(v: string[]) => set({ fonts: v })} placeholder="Choose fonts" />}
            <Check label="Load web fonts (Google Fonts)" hint="Montserrat, Poppins, Playfair, Noto Sans Ethiopic and others. Off: only fonts on each computer." checked={d.webFonts} onChange={(v) => set({ webFonts: v })} />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Helpers and downloads</p>
            <Check label="Snap to guides" checked={d.snap} onChange={(v) => set({ snap: v })} />
            <Check label="Grid on by default" checked={d.grid} onChange={(v) => set({ grid: v })} />
            <label className="flex items-center gap-2 text-sm">
              Grid size <Input type="number" className="h-8 w-20" min={1} max={50} value={d.gridSize} onChange={(e) => set({ gridSize: Number(e.target.value) })} /> mm
            </label>
            <label className="flex items-center gap-2 text-sm">
              Pages per design up to <Input type="number" className="h-8 w-20" min={1} max={60} value={d.maxPages} onChange={(e) => set({ maxPages: Number(e.target.value) })} />
            </label>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {(["pdf", "png", "jpeg", "svg", "pptx", "docx"] as const).map((k) => (
                <Check key={k} label={k.toUpperCase()} checked={d.exports[k]} onChange={(v) => set({ exports: { ...d.exports, [k]: v } })} />
              ))}
            </div>
          </div>
        </div>
        <Button disabled={busy} onClick={onSave}>
          Save design editor
        </Button>
      </CardContent>
    </Card>
  );
}

// The company signature and stamp on letters from the Letter Generator: the pictures, who may use them and when.
function SealAdmin({ c, setC, roles, people, onSave, busy }: { c: ToolsConfig; setC: (c: ToolsConfig) => void; roles: { value: string; label: string }[]; people: { value: string; label: string }[]; onSave: () => void; busy: boolean }) {
  const s = c.seal;
  const set = (p: Partial<ToolsConfig["seal"]>) => setC({ ...c, seal: { ...s, ...p } });
  const letters = LETTER_LIBRARY.map((t) => ({ value: t.key, label: t.label, group: t.group }));
  const pick = (k: "signature" | "stamp") => (
    <div className="space-y-2">
      <p className="text-sm font-medium">{k === "signature" ? "Signature" : "Stamp (seal)"}</p>
      <div className="flex h-24 items-center justify-center rounded-md border bg-[repeating-conic-gradient(#f1f5f9_0_25%,#fff_0_50%)] bg-[length:16px_16px]">
        {s[k] ? <img src={s[k]!} alt={k} className="max-h-20 max-w-full object-contain" /> : <span className="text-xs text-muted-foreground">No picture</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted">
          <UploadIcon className="size-3.5" /> Upload
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              if (f.size > 600_000) return toast.error("Use a picture under 600 KB.");
              const r = new FileReader();
              r.onload = async () => set({ [k]: await clearWhite(String(r.result)) } as Partial<ToolsConfig["seal"]>);
              r.readAsDataURL(f);
            }}
          />
        </label>
        {s[k] && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => set({ [k]: null } as Partial<ToolsConfig["seal"]>)}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">A scan on white paper works: the white is made see-through.</p>
    </div>
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Signatures and stamps on letters</CardTitle>
        <CardDescription>
          The company signature and stamp the Letter Generator can put on letters, and when. Correspondence uses each signer&apos;s own signature and the stamps in{" "}
          <Link className="underline" href="/correspondence/signatures">
            Correspondence, Signatures and stamps
          </Link>
          , applied through approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {pick("signature")}
          {pick("stamp")}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">When</p>
            {(
              [
                ["off", "Never", "The pictures are kept but not used."],
                ["optional", "When the writer ticks them", "Only for the letters below, by the people allowed."],
                ["always", "On every letter", "For the letters below, written by the people allowed."],
              ] as const
            ).map(([k, l, h]) => (
              <label key={k} className="flex items-start gap-2 text-sm">
                <input type="radio" className="mt-1" name="seal-use" checked={s.use === k} onChange={() => set({ use: k })} />
                <span>
                  {l}
                  <span className="block text-xs text-muted-foreground">{h}</span>
                </span>
              </label>
            ))}
            <MultiSelect label="Letters they may be used on" options={letters} value={s.templates} onChange={(v: string[]) => set({ templates: v })} placeholder="Every kind of letter" />
            <MultiSelect label="Letters that always carry them" options={letters} value={s.required} onChange={(v: string[]) => set({ required: v })} placeholder="None" />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Who may put them on letters</p>
            <WhoPicker s={s.who} set={(n) => set({ who: { ...s.who, ...n } })} roles={roles} people={people} label="the company signature and stamp" everyone="Everyone with the Letter Generator" />
            <p className="pt-2 text-sm font-medium">Where on the letter</p>
            <label className="flex items-center gap-2 text-sm">
              The stamp
              <select className="h-8 rounded-md border bg-background px-2 text-sm" value={s.placement} onChange={(e) => set({ placement: e.target.value as "beside" })}>
                <option value="beside">beside the signature</option>
                <option value="over">over the signature</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1">Signature height <Input type="number" className="h-8 w-16" min={8} max={40} value={s.signHeight} onChange={(e) => set({ signHeight: Number(e.target.value) })} /> mm</label>
              <label className="flex items-center gap-1">Stamp size <Input type="number" className="h-8 w-16" min={15} max={60} value={s.stampSize} onChange={(e) => set({ stampSize: Number(e.target.value) })} /> mm</label>
              <label className="flex items-center gap-1">Stamp strength <Input type="number" className="h-8 w-16" min={30} max={100} value={Math.round(s.stampOpacity * 100)} onChange={(e) => set({ stampOpacity: Number(e.target.value) / 100 })} /> %</label>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Check label="On PDF" checked={s.onExports.pdf} onChange={(v) => set({ onExports: { ...s.onExports, pdf: v } })} />
              <Check label="On Word" checked={s.onExports.word} onChange={(v) => set({ onExports: { ...s.onExports, word: v } })} />
              <Check label="On pictures (PNG, JPEG)" checked={s.onExports.image} onChange={(v) => set({ onExports: { ...s.onExports, image: v } })} />
            </div>
            <Input value={s.note} onChange={(e) => set({ note: e.target.value })} placeholder="Line under the signature (optional), e.g. Signed on behalf of the CEO" />
          </div>
        </div>
        <Button disabled={busy} onClick={onSave}>
          Save signatures and stamps
        </Button>
      </CardContent>
    </Card>
  );
}

// The OAuth client a Custom GPT uses (its secret is shown once). People still approve the GPT on their own account.
function GptClients({ clients }: { clients: { client_id: string; name: string; created_at: string; revoked_at: string | null }[] }) {
  const router = useRouter();
  const [name, setName] = React.useState("Myseed GPT");
  const [uris, setUris] = React.useState("");
  const [made, setMade] = React.useState<{ clientId: string; clientSecret: string } | null>(null);
  return (
    <div className="space-y-2 border-t pt-4">
      <p className="text-sm font-medium">ChatGPT connections</p>
      <p className="text-xs text-muted-foreground">
        A Custom GPT needs a client id and secret (GPT editor, Actions, Authentication, OAuth). Leave the callback empty to accept ChatGPT&apos;s own callback address, or paste the exact one the GPT editor shows.
      </p>
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="w-48" aria-label="Name" />
        <Input value={uris} onChange={(e) => setUris(e.target.value)} className="min-w-64 flex-1" placeholder="Callback URL (optional)" aria-label="Callback URL" />
        <Button
          variant="outline"
          onClick={async () => {
            const r = await createGptClientAction({ name, redirectUris: uris.split(/[\s,]+/).filter(Boolean) });
            if (!r.ok) return toast.error(r.error);
            setMade(r.data as { clientId: string; clientSecret: string });
            router.refresh();
          }}
        >
          Create
        </Button>
      </div>
      {made && (
        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-xs">
          <p className="font-medium">Copy these now; the secret is not shown again.</p>
          <p className="mt-1 font-mono break-all">Client ID: {made.clientId}</p>
          <p className="font-mono break-all">Client secret: {made.clientSecret}</p>
        </div>
      )}
      <ul className="space-y-1 text-sm">
        {clients.map((c) => (
          <li key={c.client_id} className="flex items-center gap-2">
            <span className={c.revoked_at ? "text-muted-foreground line-through" : ""}>
              {c.name} <span className="font-mono text-xs text-muted-foreground">{c.client_id}</span>
            </span>
            {!c.revoked_at && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  if (!confirm(`Remove ${c.name}? Everyone connected through it is disconnected.`)) return;
                  const r = await revokeGptClientAction(c.client_id);
                  if (!r.ok) return toast.error(r.error);
                  router.refresh();
                }}
              >
                Remove
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
