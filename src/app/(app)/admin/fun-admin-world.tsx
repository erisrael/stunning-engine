"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import * as F from "@/app/actions/fun";
import { CATALOG, RARITY, SHOPS, mergedCatalog, type Item, type ShopConfig } from "@/lib/fun-catalog";

// Admin, Seed Town: the economy (balances, history, gifts and upgrades), the shop's shelves (prices, what is on
// sale, new colour variants) and the town editor (things and characters placed on the map, without code).

type Economy = NonNullable<Extract<Awaited<ReturnType<typeof F.adminEconomyAction>>, { ok: true }>["data"]>;

export function EconomyAdmin() {
  const [e, setE] = React.useState<Economy | null>(null);
  const [who, setWho] = React.useState<string>("");
  const [amount, setAmount] = React.useState(50);
  const [note, setNote] = React.useState("");
  const [item, setItem] = React.useState("house.apartment");
  const load = React.useCallback(async (id?: string) => {
    const r = await F.adminEconomyAction(id || null);
    if (r.ok) setE(r.data ?? null);
    else toast.error(r.error);
  }, []);
  React.useEffect(() => void load(), [load]);
  if (!e) return null;
  const items = mergedCatalog(e.shop);
  const person = e.people.find((p) => p.id === who);
  return (
    <Card data-fun-economy>
      <CardHeader>
        <CardTitle className="text-base">Coins and gifts</CardTitle>
        <CardDescription>Points are the coins of Seed Town. Every purchase is checked on the server. Give coins, items or upgrades (homes and vehicles one level up); take them back if needed. People are told when they receive something.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <select value={who} onChange={(x) => (setWho(x.target.value), void load(x.target.value))} className="h-8 rounded-md border bg-background px-2" aria-label="Person" data-econ-person>
            <option value="">Choose a person…</option>
            {e.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.balance} coins)</option>)}
          </select>
          {person && <span className="text-muted-foreground">{person.balance} coins</span>}
        </div>
        {person && (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="space-y-2 rounded-lg border p-3">
              <p className="font-medium">Give or take coins</p>
              <div className="flex flex-wrap gap-1">
                <Input type="number" value={amount} onChange={(x) => setAmount(Number(x.target.value))} className="h-8 w-24" aria-label="Coins (negative takes back)" />
                <Input value={note} onChange={(x) => setNote(x.target.value)} placeholder="Why (they see it)" className="h-8 flex-1" aria-label="Why" />
                <Button size="sm" onClick={async () => { const r = await F.grantCoinsAction(who, amount, note); if (!r.ok) return void toast.error(r.error); toast.success("Done"); setNote(""); void load(who); }} data-econ-coins>Give</Button>
              </div>
              <p className="font-medium">Give an item</p>
              <div className="flex flex-wrap gap-1">
                <select value={item} onChange={(x) => setItem(x.target.value)} className="h-8 flex-1 rounded-md border bg-background px-2" aria-label="Item">
                  {items.filter((i) => i.price > 0).map((i) => <option key={i.key} value={i.key}>{i.label} ({SHOPS[i.shop].label}, {i.price})</option>)}
                </select>
                <Button size="sm" variant="outline" onClick={async () => { const r = await F.grantItemAction(who, item, 1, note); if (!r.ok) return void toast.error(r.error); toast.success("Given"); void load(who); }} data-econ-item>Give</Button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="xs" variant="outline" onClick={async () => { const r = await F.grantUpgradeAction(who, "home"); if (!r.ok) return void toast.error(r.error); toast.success("Home upgraded"); void load(who); }}>Upgrade their home ({e.home?.level ?? 1}/3)</Button>
                {e.owned.filter((o) => o.key.startsWith("car.")).map((o) => <Button key={o.key} size="xs" variant="outline" onClick={async () => { const r = await F.grantUpgradeAction(who, o.key); if (!r.ok) return void toast.error(r.error); toast.success("Vehicle upgraded"); void load(who); }}>Upgrade {items.find((i) => i.key === o.key)?.label}</Button>)}
              </div>
            </div>
            <div className="rounded-lg border p-3">
              <p className="mb-1 font-medium">What they own</p>
              {e.owned.length ? (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto text-xs">
                  {e.owned.map((o) => (
                    <li key={o.key} className="flex items-center gap-2">
                      <span className="flex-1">{items.find((i) => i.key === o.key)?.label ?? o.key}{o.qty > 1 ? ` x${o.qty}` : ""} <span className="text-muted-foreground">({o.source})</span></span>
                      <Button size="icon" variant="ghost" className="size-6" aria-label="Take back" onClick={async () => { if (!confirm("Take this back?")) return; const r = await F.revokeItemAction(who, o.key); if (!r.ok) return void toast.error(r.error); void load(who); }}><Trash2Icon /></Button>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">Only the free things so far.</p>}
            </div>
          </div>
        )}
        <div>
          <p className="mb-1 font-medium">{person ? `${person.name}'s coin history` : "Recent spending, play coins and gifts"}</p>
          <div className="max-h-56 overflow-y-auto rounded-lg border">
            <table className="w-full text-xs">
              <tbody>
                {e.log.map((l, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="p-1 text-muted-foreground">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="p-1">{l.name}</td>
                    <td className="p-1">{l.reason}</td>
                    <td className="p-1 text-muted-foreground">{l.source}</td>
                    <td className={`p-1 text-right tabular-nums ${l.points < 0 ? "text-destructive" : "text-[#188038]"}`}>{l.points > 0 ? "+" : ""}{l.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------- shelves

export function ShopAdmin() {
  const [cfg, setCfg] = React.useState<ShopConfig | null>(null);
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [draft, setDraft] = React.useState({ base: "outfit.jacket", label: "", color: "#e11d48", price: 100, rarity: "rare", level: 0, limited: false });
  React.useEffect(() => void F.adminEconomyAction(null).then((r) => r.ok && r.data && setCfg(r.data.shop)), []);
  if (!cfg) return null;
  const all = mergedCatalog(cfg);
  const setItem = (k: string, p: { price?: number; on?: boolean }) => setCfg({ ...cfg, items: { ...cfg.items, [k]: { ...cfg.items[k], ...p } } });
  const shown = all.filter((i) => !q || i.label.toLowerCase().includes(q.toLowerCase()) || SHOPS[i.shop].label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Card data-fun-shop-admin>
      <CardHeader>
        <CardTitle className="text-base">Shop shelves</CardTitle>
        <CardDescription>Prices in coins (0: free for everyone), what is on sale, and your own items: a new colour of an existing model, optionally limited (switch it off when the season ends).</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an item or shop" className="h-8 max-w-xs" aria-label="Find an item" />
        <div className="max-h-80 overflow-y-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left text-muted-foreground"><th className="p-1">On sale</th><th>Item</th><th>Shop</th><th>Rarity</th><th>Price</th><th /></tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.key} className="border-t">
                  <td className="p-1"><Switch checked={i.on} onCheckedChange={(v) => setItem(i.key, { on: v })} aria-label={`${i.label} on sale`} /></td>
                  <td>{i.label}{i.custom ? " (yours)" : ""}</td>
                  <td>{SHOPS[i.shop].label}</td>
                  <td style={{ color: RARITY[i.rarity].color }}>{RARITY[i.rarity].label}</td>
                  <td><Input type="number" min={0} value={i.price} onChange={(e) => setItem(i.key, { price: Number(e.target.value) })} className="h-7 w-24 text-xs" aria-label={`Price of ${i.label}`} /></td>
                  <td>{i.custom && <Button size="icon" variant="ghost" className="size-6" aria-label={`Remove ${i.label}`} onClick={() => setCfg({ ...cfg, custom: cfg.custom.filter((c) => c.key !== i.key) })}><Trash2Icon /></Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-2 text-xs">
          <label className="space-y-0.5">Copy of
            <select value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value })} className="block h-8 rounded-md border bg-background px-1">
              {CATALOG.filter((i) => ["outfit", "acc", "furniture", "vehicle", "petwear", "petskin", "special"].includes(i.kind)).map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
            </select>
          </label>
          <label className="space-y-0.5">Name<Input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="h-8 w-40" placeholder="Ruby jacket" /></label>
          <label className="space-y-0.5">Colour<input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="block h-8 w-12 rounded border" /></label>
          <label className="space-y-0.5">Price<Input type="number" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} className="h-8 w-20" /></label>
          <label className="space-y-0.5">Rarity
            <select value={draft.rarity} onChange={(e) => setDraft({ ...draft, rarity: e.target.value })} className="block h-8 rounded-md border bg-background px-1">{Object.keys(RARITY).map((r) => <option key={r} value={r}>{r}</option>)}</select>
          </label>
          <label className="space-y-0.5">Level<Input type="number" value={draft.level} onChange={(e) => setDraft({ ...draft, level: Number(e.target.value) })} className="h-8 w-16" /></label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={draft.limited} onChange={(e) => setDraft({ ...draft, limited: e.target.checked })} /> Limited</label>
          <Button size="sm" variant="outline" disabled={!draft.label.trim()} onClick={() => {
            const base = CATALOG.find((i) => i.key === draft.base)!;
            setCfg({ ...cfg, custom: [...cfg.custom, { ...base, key: "", label: draft.label, color: draft.color, price: draft.price, rarity: draft.rarity as Item["rarity"], level: draft.level || undefined, limited: draft.limited, base: draft.base } as Item & { base: string }] });
            setDraft({ ...draft, label: "" });
          }}><PlusIcon /> Add</Button>
        </div>
        <Button disabled={busy} onClick={async () => { setBusy(true); const r = await F.saveShopConfigAction(cfg); setBusy(false); if (!r.ok) return void toast.error(r.error); setCfg(r.data as ShopConfig); toast.success("Shelves saved"); }} data-fun-shop-save>Save the shelves</Button>
      </CardContent>
    </Card>
  );
}

// ------------------------------------------------------------------------------------------------- the town editor

const TownEditor3D = dynamic(() => import("./town-editor-3d"), { ssr: false, loading: () => <div className="h-[420px] animate-pulse rounded-lg border bg-muted" /> });
type Prop = { id: string; kind: string; x: number; z: number; r: number; s: number; color: string; text: string; name: string; lines: string[]; model?: string; solid?: boolean; y?: number };
type Model = { id: string; name: string; size: number };
const KINDS: [string, string][] = [["model", "Uploaded model"], ["tree", "Tree"], ["bench", "Bench"], ["lamp", "Lamp"], ["flowers", "Flowers"], ["fountain", "Fountain"], ["statue", "Statue"], ["kiosk", "Kiosk"], ["billboard", "Billboard"], ["rock", "Rock"], ["tent", "Tent"], ["stage", "Stage"], ["arch", "Arch"], ["car", "Parked car"], ["chest", "Treasure chest"], ["npc", "Character to talk to"], ["spawn", "Where people arrive"]];
// The town's own blocks, for finding your way on the map.
const BLOCKS: [string, number, number, number, number, string][] = [
  ["Plaza", 0, 0, 40, 40, "#e7e2d8"], ["Office", 0, -62, 52, 36, "#93c5fd"], ["Library", -52, -63, 20, 18, "#fde68a"], ["Shops north", 60, -20, 76, 14, "#fbcfe8"], ["Shops south", 50, 20, 56, 14, "#fed7aa"],
  ["Car dealer", 100, 24, 26, 22, "#e5e7eb"], ["Park", -80, 0, 100, 60, "#bbf7d0"], ["Archery", -114, -23, 28, 18, "#fcd34d"], ["Parkour", -114, 56, 16, 36, "#c4b5fd"], ["Homes", 0, 78, 180, 96, "#fef3c7"],
];
export function TownEditor() {
  const [props, setProps] = React.useState<Prop[] | null>(null);
  const [notice, setNotice] = React.useState("");
  const [kind, setKind] = React.useState("tree");
  const [sel, setSel] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [models, setModels] = React.useState<Model[]>([]);
  const [model, setModel] = React.useState("");
  const [placing, setPlacing] = React.useState(true);
  const [uploading, setUploading] = React.useState(false);
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const loadModels = React.useCallback(async () => {
    const r = await fetch("/api/fun/models").then((x) => x.json()).catch(() => ({ models: [] }));
    setModels(r.models ?? []);
    if (!model && r.models?.[0]) setModel(r.models[0].id);
  }, [model]);
  React.useEffect(() => void loadModels(), []); // eslint-disable-line react-hooks/exhaustive-deps
  // A new thing of the chosen kind at a spot (from the map or the 3D view).
  const add = (x: number, z: number) => {
    if (!props) return;
    if (kind === "model" && !model) return void toast.error("Upload a model first.");
    const id = `p${Date.now().toString(36)}`;
    setProps([...props, { id, kind, x, z, r: 0, s: 1, color: kind === "tree" ? "#22a35a" : "#64748b", text: kind === "billboard" ? "Welcome!" : "", name: kind === "npc" ? "Visitor" : "", lines: kind === "npc" ? ["Hello! Lovely day in town."] : [], model: kind === "model" ? model : undefined, solid: true, y: 0 }]);
    setSel(id);
  };
  const drag = React.useRef<string | null>(null);
  React.useEffect(() => void F.worldLayoutAction().then((r) => r.ok && r.data && (setProps(r.data.props as Prop[]), setNotice(r.data.notice))), []);
  const SIZE = 480, SCALE = SIZE / 300;
  const toMap = (x: number, z: number) => [SIZE / 2 + x * SCALE, SIZE / 2 + z * SCALE] as const;
  const fromMap = (px: number, py: number) => [Math.round(((px - SIZE / 2) / SCALE) * 10) / 10, Math.round(((py - SIZE / 2) / SCALE) * 10) / 10] as const;
  React.useEffect(() => {
    const g = canvas.current?.getContext("2d");
    if (!g || !props) return;
    g.fillStyle = "#86c96b";
    g.fillRect(0, 0, SIZE, SIZE);
    g.fillStyle = "#6b7280";
    for (const [x, z, w, d] of [[0, -100, 10, 112], [0, 92, 10, 86], [-80, 0, 110, 10], [80, 0, 110, 10]] as const) {
      const [px, py] = toMap(x - w / 2, z - d / 2);
      g.fillRect(px, py, w * SCALE, d * SCALE);
    }
    g.font = "11px system-ui";
    g.textAlign = "center";
    for (const [label, x, z, w, d, c] of BLOCKS) {
      const [px, py] = toMap(x - w / 2, z - d / 2);
      g.fillStyle = c;
      g.fillRect(px, py, w * SCALE, d * SCALE);
      g.fillStyle = "#0f172a";
      g.fillText(label, px + (w * SCALE) / 2, py + (d * SCALE) / 2 + 4);
    }
    for (const p of props) {
      const [px, py] = toMap(p.x, p.z);
      g.fillStyle = p.kind === "npc" ? "#7c3aed" : p.kind === "spawn" ? "#dc2626" : p.color;
      g.strokeStyle = p.id === sel ? "#000" : "#fff";
      g.lineWidth = p.id === sel ? 3 : 1.5;
      g.beginPath();
      g.arc(px, py, 5 + p.s * 1.5, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props, sel]);
  if (!props) return null;
  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE] as const;
  };
  const near = (px: number, py: number) => props.find((p) => {
    const [x, y] = toMap(p.x, p.z);
    return Math.hypot(x - px, y - py) < 9;
  });
  const cur = props.find((p) => p.id === sel) ?? null;
  const upd = (p: Partial<Prop>) => setProps(props.map((x) => (x.id === sel ? { ...x, ...p } : x)));
  return (
    <Card data-fun-town-editor>
      <CardHeader>
        <CardTitle className="text-base">Town editor</CardTitle>
        <CardDescription>Add things to Seed Town without code: pick a kind, click the map to place it, drag to move, click to edit (turn, size, colour, sign text, a character&apos;s name and lines). Saving publishes it; people see it next time they open the town.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          <TownEditor3D props={props} notice={notice} selected={sel} placing={placing} onSelect={setSel} onPlace={add} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={placing} onChange={(e) => setPlacing(e.target.checked)} data-town-placing /> Clicking the 3D view places the chosen thing (off: clicking selects)</label>
          <div className="flex flex-wrap gap-1">
            {KINDS.map(([k, label]) => <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full border px-2 py-0.5 text-xs ${kind === k ? "border-primary bg-primary/10" : ""}`} data-town-kind={k}>{label}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-xs" data-town-models>
            <span className="font-medium">Your models</span>
            <select value={model} onChange={(e) => setModel(e.target.value)} className="h-7 rounded border bg-background px-1" aria-label="Model to place">
              {models.length ? models.map((m) => <option key={m.id} value={m.id}>{m.name} ({Math.round(m.size / 1024)} KB)</option>) : <option value="">None yet</option>}
            </select>
            <label className="cursor-pointer rounded-md border px-2 py-1 hover:bg-muted">
              {uploading ? "Uploading…" : "Upload a .glb"}
              <input type="file" accept=".glb,model/gltf-binary" className="hidden" data-town-upload onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                setUploading(true);
                const fd = new FormData();
                fd.append("file", f);
                fd.append("name", f.name);
                const r = await fetch("/api/fun/models", { method: "POST", body: fd }).then((x) => x.json()).catch((er: Error) => ({ error: er.message }));
                setUploading(false);
                if (r.error) return void toast.error(r.error);
                toast.success(`${r.name} uploaded`);
                setModel(r.id);
                setKind("model");
                void loadModels();
              }} />
            </label>
            <span className="text-muted-foreground">glTF binary up to 15 MB, in metres; free models: Quaternius, Kenney, Poly Pizza (CC0).</span>
          </div>
          <canvas
            ref={canvas}
            width={SIZE}
            height={SIZE}
            className="aspect-square w-full max-w-[480px] cursor-crosshair rounded-lg border"
            onPointerDown={(e) => {
              const [px, py] = at(e);
              const hit = near(px, py);
              if (hit) return (setSel(hit.id), (drag.current = hit.id));
              const [x, z] = fromMap(px, py);
              add(x, z);
            }}
            onPointerMove={(e) => {
              if (!drag.current || !(e.buttons & 1)) return;
              const [x, z] = fromMap(...at(e));
              setProps(props.map((p) => (p.id === drag.current ? { ...p, x, z } : p)));
            }}
            onPointerUp={() => (drag.current = null)}
            aria-label="Town map: click to place, drag to move"
            data-town-map
          />
          <label className="block text-xs">Notice on the plaza board and in the town hall<Input value={notice} onChange={(e) => setNotice(e.target.value)} maxLength={200} className="mt-1 h-8" /></label>
        </div>
        <div className="space-y-2 text-xs">
          <p className="font-medium">{props.length} things placed</p>
          {cur ? (
            <div className="space-y-2 rounded-lg border p-2">
              <p className="font-medium">{KINDS.find((k) => k[0] === cur.kind)?.[1]} at {cur.x}, {cur.z}</p>
              <label className="block">Turn {cur.r}°<input type="range" min={-180} max={180} value={cur.r} onChange={(e) => upd({ r: Number(e.target.value) })} className="w-full" /></label>
              <label className="block">Size {cur.s}<input type="range" min={0.3} max={5} step={0.1} value={cur.s} onChange={(e) => upd({ s: Number(e.target.value) })} className="w-full" /></label>
              <label className="flex items-center gap-2">Colour <input type="color" value={cur.color} onChange={(e) => upd({ color: e.target.value })} className="h-7 w-10 rounded border" /></label>
              {cur.kind === "model" && (
                <>
                  <p className="text-muted-foreground">{models.find((m) => m.id === cur.model)?.name ?? "Model"}</p>
                  <label className="block">Height above ground {cur.y ?? 0} m<input type="range" min={0} max={20} step={0.5} value={cur.y ?? 0} onChange={(e) => upd({ y: Number(e.target.value) })} className="w-full" /></label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={cur.solid !== false} onChange={(e) => upd({ solid: e.target.checked })} /> Solid (people and vehicles cannot pass through)</label>
                </>
              )}
              {(cur.kind === "billboard" || cur.kind === "npc") && <label className="block">{cur.kind === "npc" ? "Role" : "Sign text"}<Input value={cur.text} onChange={(e) => upd({ text: e.target.value })} maxLength={60} className="h-8" /></label>}
              {cur.kind === "npc" && (
                <>
                  <label className="block">Name<Input value={cur.name} onChange={(e) => upd({ name: e.target.value })} maxLength={30} className="h-8" /></label>
                  <label className="block">What they say (one line each)<textarea value={cur.lines.join("\n")} onChange={(e) => upd({ lines: e.target.value.split("\n").slice(0, 6) })} rows={4} className="w-full rounded-md border bg-background p-1" /></label>
                </>
              )}
              <Button size="xs" variant="outline" onClick={() => (setProps(props.filter((p) => p.id !== sel)), setSel(null))}><Trash2Icon /> Remove</Button>
            </div>
          ) : <p className="text-muted-foreground">Click a dot to edit it.</p>}
          <Button disabled={busy} onClick={async () => { setBusy(true); const r = await F.saveWorldLayoutAction({ props: props as never, notice }); setBusy(false); if (!r.ok) return void toast.error(r.error); toast.success("Town published"); }} data-town-save>Publish the town</Button>
          <Button variant="outline" size="sm" asChild><a href="/fun" target="_blank" rel="noreferrer">See it in Seed Town</a></Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Admin, Seed Town: the asset library. Every third-party asset the town uses (textures, props, cars, people, the
// anime characters, music and sounds are listed in their own credits): where it came from, who made it, its
// licence, its size, what was done to it and where it is used. Read from public/models/manifest.json (written by
// scripts/fetch-assets.mjs); Admin's own uploads are in the town editor below.
type Asset = { id: string; name: string; category: string; file: string; source: string; author: string; license: string; sizeKb: number; steps?: string[]; status: string; usedIn: string; updated: string; note?: string; polycount?: number | null };
export function AssetLibrary() {
  const [list, setList] = React.useState<Asset[] | null>(null);
  const [cat, setCat] = React.useState("all");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    void fetch("/models/manifest.json").then((r) => r.json()).then((d: { assets: Asset[] }) => setList(d.assets)).catch(() => setList([]));
  }, []);
  const cats = [...new Set((list ?? []).map((a) => a.category))];
  const shown = (list ?? []).filter((a) => (cat === "all" || a.category === cat) && (!q || `${a.name} ${a.author} ${a.license}`.toLowerCase().includes(q.toLowerCase())));
  const total = (list ?? []).reduce((s, a) => s + a.sizeKb, 0);
  return (
    <Card data-asset-library>
      <CardHeader>
        <CardTitle className="text-base">Asset library</CardTitle>
        <CardDescription>
          {list ? `${list.length} assets, ${(total / 1024).toFixed(1)} MB in all` : "Loading…"}. Every one is licensed for this use (CC0, CC BY, CC BY-SA or MIT); attribution is shown where the licence asks. Real car designs and names stay their makers&apos; trademarks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex flex-wrap items-center gap-1">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, author or licence" className="h-8 w-56" />
          {["all", ...cats].map((c) => (
            <Button key={c} size="xs" variant={cat === c ? "default" : "outline"} onClick={() => setCat(c)} className="capitalize">
              {c}
            </Button>
          ))}
        </div>
        <div className="max-h-[420px] overflow-auto rounded-md border">
          <table className="w-full">
            <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
              <tr>
                <th className="p-1.5">Preview</th>
                <th>Asset</th>
                <th>Source and author</th>
                <th>Licence</th>
                <th className="text-right">Size</th>
                <th>Optimised</th>
                <th>Status</th>
                <th>Used in</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map((a) => (
                <tr key={a.id} data-asset={a.id}>
                  <td className="p-1.5">{a.category === "texture" ? <img src={a.file} alt="" className="size-10 rounded object-cover" /> : <span className="inline-flex size-10 items-center justify-center rounded bg-muted text-[9px] uppercase">{a.category.slice(0, 4)}</span>}</td>
                  <td>
                    <p className="font-medium">{a.name}</p>
                    <p className="text-[10px] text-muted-foreground">{a.id} · {a.updated}{a.polycount ? ` · ${(a.polycount / 1000).toFixed(0)}k polygons` : ""}</p>
                    {a.note && <p className="text-[10px] text-amber-700 dark:text-amber-300">{a.note}</p>}
                  </td>
                  <td>
                    <a href={a.source} target="_blank" rel="noreferrer" className="text-primary underline">source</a>
                    <p className="text-[10px] text-muted-foreground">{a.author}</p>
                  </td>
                  <td>{a.license}</td>
                  <td className="text-right tabular-nums">{a.sizeKb >= 1024 ? `${(a.sizeKb / 1024).toFixed(1)} MB` : `${a.sizeKb} KB`}</td>
                  <td className="text-[10px] text-muted-foreground">{(a.steps ?? []).join(", ")}</td>
                  <td className="capitalize">{a.status}</td>
                  <td className="text-[10px]">{a.usedIn}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
