"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EraserIcon, PenLineIcon, PlusIcon, ShieldCheckIcon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MultiSelect } from "@/components/app/multi-select";
import { registerSignatureAction, revokeSignatureAction, saveSignPolicyAction, saveStampAction } from "@/app/actions/correspondence";
import type { SignPolicy, StampAllowed, StampDesign, StampKind } from "@/server/corr/signing";
import { clearWhite } from "@/components/app/image-tools";

type Stamp = { id: string; name: string; kind: StampKind; design: StampDesign; image: string; allowed: StampAllowed; active: boolean; entityId?: string | null; upload?: string | null };
const KINDS: StampKind[] = ["circular", "rectangular", "department", "received", "approved", "paid", "confidential", "copy", "custom"];

// A signature pad: drawn with a mouse, finger or stylus, exported as a transparent PNG.
function Pad({ onDone }: { onDone: (png: string) => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const [empty, setEmpty] = React.useState(true);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * ref.current!.width, ((e.clientY - r.top) / r.height) * ref.current!.height] as const;
  };
  return (
    <div className="space-y-2">
      <canvas
        ref={ref}
        width={600}
        height={200}
        className="w-full touch-none rounded-md border bg-white"
        style={{ aspectRatio: "3 / 1" }}
        onPointerDown={(e) => {
          drawing.current = true;
          const c = ref.current!.getContext("2d")!;
          c.lineWidth = 3;
          c.lineCap = "round";
          c.strokeStyle = "#0b1f4d";
          c.beginPath();
          c.moveTo(...pos(e));
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const c = ref.current!.getContext("2d")!;
          c.lineTo(...pos(e));
          c.stroke();
          setEmpty(false);
        }}
        onPointerUp={() => (drawing.current = false)}
        aria-label="Draw your signature here"
      />
      <div className="flex gap-2">
        <Button size="sm" variant="ghost" onClick={() => (ref.current!.getContext("2d")!.clearRect(0, 0, 600, 200), setEmpty(true))}>
          <EraserIcon /> Clear
        </Button>
        <Button size="sm" disabled={empty} onClick={() => onDone(ref.current!.toDataURL("image/png"))}>
          <PenLineIcon /> Use this signature
        </Button>
      </div>
    </div>
  );
}

export function SignaturesClient({ mine, stamps, canDesign, keyInfo, positions, roles, people, entities, policy, categories = [] }: { policy: SignPolicy; categories?: { code: string; name: string }[]; entities: { id: string; name: string }[]; mine: { id: string; image: string; kind: string; active: boolean; revokedAt: string | null; createdAt: string; validTo: string | null }[]; stamps: Stamp[]; canDesign: boolean; keyInfo: { fingerprint: string; algorithm: string }; positions: { id: string; title: string }[]; roles: { key: string; label: string }[]; people: { id: string; name: string }[] }) {
  const router = useRouter();
  const [edit, setEdit] = React.useState<Partial<Stamp> | null>(null);
  const active = mine.find((s) => s.active && !s.revokedAt);
  const save = async (image: string, kind: "upload" | "drawn") => {
    const r = await registerSignatureAction({ image, kind });
    if (!r.ok) return toast.error(r.error);
    toast.success("Signature registered");
    router.refresh();
  };
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your signature</CardTitle>
          <CardDescription>Shown on letters you sign. A letter shows it only once you have actually signed; the record of who signed, as whom, on which content, is kept with it.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {active ? (
            <div className="flex items-center gap-3">
              <img src={active.image} alt="Your signature" className="h-16 rounded border bg-white p-1" />
              <div className="text-xs text-muted-foreground">
                Registered {new Date(active.createdAt).toLocaleDateString()} ({active.kind}){active.validTo ? `, valid until ${new Date(active.validTo).toLocaleDateString()}` : ""}
                <Button size="sm" variant="ghost" className="ml-2 text-destructive" onClick={async () => { if (!confirm("Revoke your signature? You cannot sign until you register a new one.")) return; const r = await revokeSignatureAction(active.id); if (!r.ok) return toast.error(r.error); router.refresh(); }}>
                  Revoke
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No signature registered yet.</p>
          )}
          {policy.allowDrawn && <Pad onDone={(png) => save(png, "drawn")} />}
          {policy.allowUpload && <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            <UploadIcon className="size-4" /> Upload a picture (transparent PNG is best)
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 400_000) return toast.error("Use a picture under 400 KB.");
                const r = new FileReader();
                // A scan on white paper: the white is made see-through.
                r.onload = async () => void save(await clearWhite(String(r.result)), "upload");
                r.readAsDataURL(f);
              }}
            />
          </label>}
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <ShieldCheckIcon className="size-3.5" /> Every issued letter is also signed by the server ({keyInfo.algorithm}, key {keyInfo.fingerprint}), so a changed copy is detected.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Company stamps</CardTitle>
            <CardDescription>Applied at a workflow&apos;s stamp step by the people each stamp lists (and who have the stamp right).</CardDescription>
          </div>
          {canDesign && (
            <Button size="sm" onClick={() => setEdit({ name: "", kind: "circular", design: { text: "", inner: "", centre: "", color: "#1d4ed8", border: 2, size: 38, rotation: 0, opacity: 0.9, showDate: true }, allowed: {}, active: true })}>
              <PlusIcon /> New stamp
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {stamps.map((s) => (
            <button key={s.id} type="button" disabled={!canDesign} onClick={() => setEdit({ ...s, upload: s.image.startsWith("data:image/svg") ? null : s.image })} className="flex items-center gap-3 rounded-md border p-2 text-left hover:bg-muted disabled:hover:bg-transparent">
              <img src={s.image} alt={s.name} className="h-14 w-auto" />
              <span className="text-sm">
                <span className="block font-medium">{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.kind}{s.entityId ? ` · ${entities.find((e) => e.id === s.entityId)?.name ?? ""}` : ""}{s.active ? "" : " · off"}</span>
              </span>
            </button>
          ))}
          {!stamps.length && <p className="text-sm text-muted-foreground">No stamps yet.</p>}
        </CardContent>
      </Card>

      {canDesign && <PolicyCard initial={policy} categories={categories} />}

      {edit && (
        <Dialog open onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{edit.id ? edit.name : "New stamp"}</DialogTitle>
            </DialogHeader>
            <label className="flex items-center gap-2 text-xs">
              Belongs to
              <select className="h-8 rounded-md border bg-background px-2" value={edit.entityId ?? ""} onChange={(e) => setEdit({ ...edit, entityId: e.target.value || null })}>
                <option value="">Every entity</option>
                {entities.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </label>
            <StampForm value={edit} onChange={setEdit} positions={positions} roles={roles} people={people} allowUpload={policy.allowStampUpload} />
            <DialogFooter>
              <Button onClick={async () => { const r = await saveStampAction(edit as Stamp); if (!r.ok) return toast.error(r.error); toast.success("Stamp saved"); setEdit(null); router.refresh(); }}>
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// The preview here is drawn in the browser the same way the server draws the saved stamp.
function preview(kind: StampKind, d: StampDesign) {
  const round = kind === "circular" || kind === "department" || kind === "custom";
  const c = d.color;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const svg = round
    ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><g opacity="${d.opacity}" transform="rotate(${d.rotation} 100 100)" fill="none" stroke="${c}"><circle cx="100" cy="100" r="94" stroke-width="${d.border}"/><circle cx="100" cy="100" r="66" stroke-width="${Math.max(1, d.border - 1)}"/><defs><path id="r" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text fill="${c}" stroke="none" font-family="Arial" font-size="15" font-weight="700" letter-spacing="1.5"><textPath href="#r">${esc(d.text)} ★ </textPath></text><text x="100" y="${d.centre ? 92 : 106}" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="${d.centre ? 13 : 16}" font-weight="700">${esc(d.inner ?? "")}</text>${d.centre ? `<text x="100" y="112" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="11">${esc(d.centre)}</text>` : ""}${d.showDate ? `<text x="100" y="130" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="10">${new Date().toLocaleDateString("en-GB")}</text>` : ""}</g></svg>`
    : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 120"><g opacity="${d.opacity}" transform="rotate(${d.rotation} 130 60)" fill="none" stroke="${c}"><rect x="4" y="4" width="252" height="112" rx="8" stroke-width="${d.border}"/><rect x="11" y="11" width="238" height="98" rx="5"/><text x="130" y="52" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="30" font-weight="800">${esc(d.inner || kind.toUpperCase())}</text><text x="130" y="76" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="12" font-weight="700">${esc(d.text)}</text>${d.showDate ? `<text x="130" y="98" text-anchor="middle" fill="${c}" stroke="none" font-family="Arial" font-size="11">${new Date().toLocaleDateString("en-GB")}</text>` : ""}</g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function PolicyCard({ initial, categories }: { initial: SignPolicy; categories: { code: string; name: string }[] }) {
  const router = useRouter();
  const [p, setP] = React.useState(initial);
  const set = (x: Partial<SignPolicy>) => setP({ ...p, ...x });
  const num = (label: string, k: "stampSize" | "signatureHeight" | "stampRotate", min: number, max: number, unit: string) => (
    <label className="flex items-center gap-2 text-sm">
      {label} <Input type="number" className="h-8 w-20" min={min} max={max} value={p[k]} onChange={(e) => set({ [k]: Number(e.target.value) } as Partial<SignPolicy>)} /> {unit}
    </label>
  );
  return (
    <Card className="xl:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Where and when signatures and stamps are used</CardTitle>
        <CardDescription>How people register signatures, how signatures and stamps sit on a letter, where the pictures show, and which kinds of letter must be stamped before they are issued.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-3">
        <div className="space-y-2">
          <p className="text-sm font-medium">Registering</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.allowDrawn} onChange={(e) => set({ allowDrawn: e.target.checked })} /> Signers may draw their signature</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.allowUpload} onChange={(e) => set({ allowUpload: e.target.checked })} /> Signers may upload a picture of it</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.allowStampUpload} onChange={(e) => set({ allowStampUpload: e.target.checked })} /> Stamps may be uploaded pictures of the real seal</label>
          <p className="pt-2 text-sm font-medium">Where the pictures show</p>
          {(
            [
              ["pdf", "PDF and print"],
              ["word", "Word files"],
              ["link", "The recipient's secure link"],
              ["image", "Pictures (PNG, JPEG)"],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.showOn[k]} onChange={(e) => set({ showOn: { ...p.showOn, [k]: e.target.checked } })} /> {l}</label>
          ))}
          <p className="text-xs text-muted-foreground">Where they are hidden, the letter still says who signed, as whom and when.</p>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">On the letter</p>
          <label className="flex items-center gap-2 text-sm">
            The stamp sits
            <select className="h-8 rounded-md border bg-background px-2 text-sm" value={p.stampPlacement} onChange={(e) => set({ stampPlacement: e.target.value as SignPolicy["stampPlacement"] })}>
              <option value="over-signature">over the signature</option>
              <option value="beside-signature">beside the signature</option>
              <option value="below-signature">below the signature</option>
            </select>
          </label>
          {num("Stamp size", "stampSize", 12, 50, "mm")}
          {num("Stamp tilt", "stampRotate", -45, 45, "°")}
          <label className="flex items-center gap-2 text-sm">Stamp strength <Input type="number" className="h-8 w-20" min={30} max={100} value={Math.round(p.stampOpacity * 100)} onChange={(e) => set({ stampOpacity: Number(e.target.value) / 100 })} /> %</label>
          {num("Signature height", "signatureHeight", 8, 40, "mm")}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.showAwaiting} onChange={(e) => set({ showAwaiting: e.target.checked })} /> Show the places still waiting to be signed</label>
          <Input value={p.note} onChange={(e) => set({ note: e.target.value })} placeholder="Line under each signature, e.g. Signed electronically" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Must be stamped before issue</p>
          <MultiSelect label="Categories" options={categories.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }))} value={p.stampRequired} onChange={(v) => set({ stampRequired: v })} placeholder="None (beyond each category's own setting)" />
          <p className="text-xs text-muted-foreground">Their workflows need a stamp step; a letter cannot be issued until an allowed person has applied the stamp.</p>
        </div>
        <div className="md:col-span-3">
          <Button
            onClick={async () => {
              const r = await saveSignPolicyAction(p);
              if (!r.ok) return toast.error(r.error);
              toast.success("Saved");
              router.refresh();
            }}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StampForm({ value, onChange, positions, roles, people, allowUpload }: { value: Partial<Stamp>; onChange: (v: Partial<Stamp>) => void; positions: { id: string; title: string }[]; roles: { key: string; label: string }[]; people: { id: string; name: string }[]; allowUpload: boolean }) {
  const d = value.design!;
  const setD = (p: Partial<StampDesign>) => onChange({ ...value, design: { ...d, ...p } });
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-xs"><span className="font-medium">Name</span><Input value={value.name ?? ""} onChange={(e) => onChange({ ...value, name: e.target.value })} /></label>
        <label className="space-y-1 text-xs">
          <span className="font-medium">Kind</span>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value.kind} onChange={(e) => onChange({ ...value, kind: e.target.value as StampKind })}>
            {KINDS.map((k) => <option key={k} value={k}>{k[0]!.toUpperCase() + k.slice(1)}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs sm:col-span-2"><span className="font-medium">Text (around the ring, or under the word)</span><Input value={d.text} onChange={(e) => setD({ text: e.target.value })} placeholder="MYSEED PLC · ADDIS ABABA" /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Centre word</span><Input value={d.inner ?? ""} onChange={(e) => setD({ inner: e.target.value })} placeholder="SEAL / RECEIVED" /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Centre line (e.g. Reg. no.)</span><Input value={d.centre ?? ""} onChange={(e) => setD({ centre: e.target.value })} /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Colour</span><Input type="color" value={d.color} onChange={(e) => setD({ color: e.target.value })} /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Border</span><Input type="number" min={1} max={6} value={d.border} onChange={(e) => setD({ border: Number(e.target.value) })} /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Rotation (°)</span><Input type="number" min={-45} max={45} value={d.rotation} onChange={(e) => setD({ rotation: Number(e.target.value) })} /></label>
        <label className="space-y-1 text-xs"><span className="font-medium">Opacity</span><Input type="number" min={0.2} max={1} step={0.05} value={d.opacity} onChange={(e) => setD({ opacity: Number(e.target.value) })} /></label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={d.showDate} onChange={(e) => setD({ showDate: e.target.checked })} /> Date on the stamp</label>
        <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={value.active !== false} onChange={(e) => onChange({ ...value, active: e.target.checked })} /> In use</label>
        <div className="space-y-1 sm:col-span-2">
          <p className="text-xs font-medium">Who may use it</p>
          <MultiSelect label="People" options={people.map((p) => ({ value: p.id, label: p.name }))} value={value.allowed?.users ?? []} onChange={(v) => onChange({ ...value, allowed: { ...value.allowed, users: v } })} placeholder="People" />
          <MultiSelect label="Roles" options={roles.map((r) => ({ value: r.key, label: r.label }))} value={value.allowed?.roles ?? []} onChange={(v) => onChange({ ...value, allowed: { ...value.allowed, roles: v } })} placeholder="Roles" />
          <MultiSelect label="Positions" options={positions.map((p) => ({ value: p.id, label: p.title }))} value={value.allowed?.positions ?? []} onChange={(v) => onChange({ ...value, allowed: { ...value.allowed, positions: v } })} placeholder="Positions" />
          <p className="text-[11px] text-muted-foreground">Nobody listed: only correspondence administrators.</p>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-start justify-center rounded-md border bg-white p-3">
          <img src={value.upload || preview(value.kind ?? "circular", d)} alt="Stamp preview" className="w-full" />
        </div>
        {allowUpload && (
          <div className="space-y-1">
            <label className="inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-md border px-2 py-1.5 text-xs hover:bg-muted">
              <UploadIcon className="size-3.5" /> {value.upload ? "Change the picture" : "Use a picture of the real seal"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (f.size > 1_000_000) return toast.error("Use a picture under 1 MB.");
                  const r = new FileReader();
                  r.onload = async () => onChange({ ...value, upload: await clearWhite(String(r.result)), design: { ...d, text: d.text || value.name || "Seal" } });
                  r.readAsDataURL(f);
                }}
              />
            </label>
            {value.upload && (
              <Button size="sm" variant="ghost" className="h-7 w-full text-xs" onClick={() => onChange({ ...value, upload: null })}>
                Draw it here instead
              </Button>
            )}
            <p className="text-[11px] text-muted-foreground">A scan or photo on white paper works: the white is made see-through.</p>
          </div>
        )}
      </div>
    </div>
  );
}
