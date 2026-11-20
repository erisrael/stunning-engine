"use client";

import * as React from "react";
import * as THREE from "three";
import { toast } from "sonner";
import {
  ArrowUpIcon, CarIcon, CheckIcon, ChevronDownIcon, ChevronUpIcon, HomeIcon, LockIcon, MicIcon, MicOffIcon, PackageIcon, PlusIcon, RotateCwIcon,
  ShoppingBagIcon, StarIcon, Trash2Icon, UserXIcon, UsersIcon, Volume2Icon, VolumeXIcon, XIcon, FlagIcon, MapPinIcon, LogInIcon, LogOutIcon, SendIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { RARITY, SHOPS, isFree, type HomeLayout, type Item, type Placed, type Ride, type Shop } from "@/lib/fun-catalog";
import type { Resident } from "@/server/fun-world";
import { furniture, showcase, vehicle } from "./models";
import { anyVehicle } from "./cars";
import type { ChatMsg, Gfx, Room, VoiceState } from "./town";
import { PRESETS } from "./town";
import type { Wallet } from "./studio";

// The windows inside Seed Town (they stay inside the game, so they work in full screen too).

export function Panel({ title, onClose, children, className, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; className?: string; wide?: boolean }) {
  return (
    <div className={cn("absolute top-12 right-2 bottom-2 z-20 flex flex-col overflow-hidden rounded-xl border bg-background/97 text-sm shadow-xl", wide ? "left-2 sm:left-auto sm:w-[560px]" : "left-2 sm:left-auto sm:w-80", className)} data-world-panel>
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <div className="min-w-0 flex-1 font-semibold">{title}</div>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded p-0.5 hover:bg-muted"><XIcon className="size-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">{children}</div>
    </div>
  );
}

// A small turning 3D picture of one thing.
function Thumb({ item, className }: { item: Item; className?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(r.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#fff", "#999", 1.4));
    const d = new THREE.DirectionalLight("#fff", 1.2);
    d.position.set(2, 3, 2);
    scene.add(d);
    const m = item.kind === "vehicle" ? anyVehicle(item.model ?? "hatch", item.color ?? "#3b82f6", undefined, true).group : item.kind === "furniture" ? furniture(item.model ?? "", item.color ?? "#a16207", (item.size?.[0] ?? 2) * 0.5, (item.size?.[1] ?? 2) * 0.5) : showcase(item.kind, item.model ?? "", item.color ?? "#a855f7");
    const bb = new THREE.Box3().setFromObject(m);
    const size = bb.getSize(new THREE.Vector3()).length() || 1;
    m.position.sub(bb.getCenter(new THREE.Vector3()));
    scene.add(m);
    const cam = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.01, 100);
    cam.position.set(0, size * 0.5, size * 1.5);
    cam.lookAt(0, 0, 0);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      m.rotation.y += 0.01;
      r.render(scene, cam);
    };
    loop();
    return () => (cancelAnimationFrame(raf), r.dispose(), r.domElement.remove());
  }, [item]);
  return <div ref={box} className={cn("rounded-lg bg-gradient-to-b from-muted to-background", className)} />;
}

const owns = (w: Wallet | null, it: Item) => isFree(it) || !!w?.owned.some((o) => o.key === it.key && o.qty > 0);
const qtyOf = (w: Wallet | null, key: string) => w?.owned.find((o) => o.key === key)?.qty ?? 0;
const wishKey = "myseed.world.wishlist";
function useWishlist() {
  const [w, setW] = React.useState<string[]>([]);
  React.useEffect(() => {
    try {
      setW(JSON.parse(localStorage.getItem(wishKey) ?? "[]"));
    } catch {}
  }, []);
  const toggle = (k: string) =>
    setW((cur) => {
      const n = cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k];
      try {
        localStorage.setItem(wishKey, JSON.stringify(n));
      } catch {}
      return n;
    });
  return { list: w, toggle };
}

// ------------------------------------------------------------------------------------------------- the shop

export function ShopPanel({ shop, focus, items, wallet, onWallet, onClose, onTryOn }: { shop: Shop; focus?: string; items: (Item & { on: boolean })[]; wallet: Wallet | null; onWallet: (w: Wallet) => void; onClose: () => void; onTryOn: () => void }) {
  const [store, setStore] = React.useState<Shop | "wish">(shop);
  const [sel, setSel] = React.useState<string | null>(focus ?? null);
  const [qty, setQty] = React.useState(1);
  const [busy, setBusy] = React.useState(false);
  const [history, setHistory] = React.useState<{ points: number; reason: string; created_at: string }[] | null>(null);
  const wish = useWishlist();
  const list = items.filter((i) => (store === "wish" ? wish.list.includes(i.key) : i.shop === store) && (i.on || owns(wallet, i)) && i.kind !== "hair");
  const it = items.find((i) => i.key === sel) ?? null;
  const lvl = wallet?.level.level ?? 1;
  return (
    <Panel title={<span className="flex items-center gap-2"><ShoppingBagIcon className="size-4" /> {store === "wish" ? "Wishlist" : SHOPS[store].label}</span>} onClose={onClose} wide>
      <div className="mb-2 flex flex-wrap gap-1" data-shop-tabs>
        {(Object.keys(SHOPS) as Shop[]).map((s) => <button key={s} type="button" onClick={() => (setStore(s), setSel(null))} className={cn("rounded-full border px-2 py-0.5 text-xs", store === s && "border-primary bg-primary/10 font-medium")}>{SHOPS[s].label}</button>)}
        <button type="button" onClick={() => setStore("wish")} className={cn("rounded-full border px-2 py-0.5 text-xs", store === "wish" && "border-primary bg-primary/10")}><StarIcon className="inline size-3" /> Wishlist</button>
        <button type="button" onClick={async () => { const r = await F.pointsLogAction(); if (r.ok) setHistory((r.data ?? []).filter((x) => x.points < 0)); }} className="rounded-full border px-2 py-0.5 text-xs">Purchases</button>
      </div>
      {wallet?.free ? (
        <p className="mb-2 rounded-md border border-[#188038]/40 bg-[#188038]/10 px-2 py-1 text-xs text-[#188038]" data-shop-free>Everything is free for now (Admin): take what you like. {wallet.coins} coins · level {lvl}.</p>
      ) : (
        <p className="mb-2 text-xs text-muted-foreground">{wallet?.coins ?? 0} coins · level {lvl}. Work earns most coins; town activities and games add a few each day.</p>
      )}
      {history && (
        <div className="mb-2 rounded-lg border p-2 text-xs">
          <div className="mb-1 flex justify-between font-medium">Your purchases <button type="button" onClick={() => setHistory(null)}><XIcon className="size-3" /></button></div>
          {history.length ? history.map((h, i) => <p key={i} className="flex justify-between"><span>{h.reason}</span><span className="tabular-nums">{h.points}</span></p>) : <p className="text-muted-foreground">Nothing bought yet.</p>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
        <div className="grid grid-cols-2 gap-1.5 self-start sm:grid-cols-3">
          {list.map((i) => {
            const mine = owns(wallet, i);
            const locked = !mine && !!i.level && lvl < i.level;
            return (
              <button key={i.key} type="button" onClick={() => (setSel(i.key), setQty(1))} className={cn("relative rounded-lg border p-2 text-left text-xs transition-colors", sel === i.key ? "border-primary bg-primary/5" : "hover:bg-muted")} data-shop-item={i.key}>
                <span className="block h-1 rounded-full" style={{ background: RARITY[i.rarity].color }} />
                <span className="mt-1 block font-medium leading-tight">{i.label}</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">{mine && !i.stack ? "Owned" : locked ? `Level ${i.level}` : isFree(i) ? "Free" : `${i.price} coins`}{i.stack && qtyOf(wallet, i.key) ? ` · have ${qtyOf(wallet, i.key)}` : ""}</span>
                {locked && <LockIcon className="absolute top-2 right-1.5 size-3 text-muted-foreground" />}
                {wish.list.includes(i.key) && <StarIcon className="absolute top-2 right-1.5 size-3 fill-[#f59e0b] text-[#f59e0b]" />}
              </button>
            );
          })}
          {!list.length && <p className="col-span-full text-xs text-muted-foreground">{store === "wish" ? "Star things in the shops to keep them here." : "Nothing on the shelves right now."}</p>}
        </div>
        {it ? (
          <div className="space-y-2 rounded-lg border p-2" data-shop-detail>
            <Thumb item={it} className="h-36 w-full" />
            <p className="font-semibold">{it.label}</p>
            <p className="text-xs" style={{ color: RARITY[it.rarity].color }}>{RARITY[it.rarity].label}{it.limited ? " · limited" : ""}</p>
            {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
            {it.kind === "vehicle" && <p className="text-xs text-muted-foreground">Top speed {Math.round((it.speed ?? 10) * 3.6)} km/h · {it.seats} seat{it.seats === 1 ? "" : "s"}</p>}
            {it.kind === "house" && <p className="text-xs text-muted-foreground">Room for {it.capacity} pieces of furniture</p>}
            {it.effect && <p className="text-xs text-muted-foreground">{Object.entries(it.effect).map(([k, v]) => `${k} ${v! > 0 ? "+" : ""}${v}`).join(" · ")}</p>}
            {it.level ? <p className="text-xs text-muted-foreground">Needs level {it.level}</p> : null}
            {it.stack && (
              <label className="flex items-center gap-1 text-xs">How many <input type="number" min={1} max={20} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(20, Number(e.target.value) || 1)))} className="h-7 w-14 rounded border bg-background px-1" /></label>
            )}
            {owns(wallet, it) && !it.stack ? (
              <p className="flex items-center gap-1 text-xs text-[#188038]"><CheckIcon className="size-3.5" /> Yours{["outfit", "acc"].includes(it.kind) ? ": wear it from the designer" : ""}</p>
            ) : (
              <Button
                className="w-full"
                size="sm"
                disabled={busy || (!!it.level && lvl < it.level) || (wallet?.coins ?? 0) < it.price * (it.stack ? qty : 1)}
                onClick={async () => {
                  setBusy(true);
                  const r = await F.buyAction(it.key, qty);
                  setBusy(false);
                  if (!r.ok) return void toast.error(r.error);
                  onWallet(r.data as Wallet);
                  toast.success(`${isFree(it) ? "Took" : "Bought"} ${it.stack && qty > 1 ? `${qty} x ` : ""}${it.label}`);
                }}
                data-shop-buy
              >
                {isFree(it) ? "Take it (free)" : `Buy for ${it.price * (it.stack ? qty : 1)} coins`}
              </Button>
            )}
            <div className="flex gap-1">
              {["outfit", "acc"].includes(it.kind) && <Button size="xs" variant="outline" onClick={onTryOn}>Try on</Button>}
              <Button size="xs" variant="ghost" onClick={() => wish.toggle(it.key)}><StarIcon className={cn(wish.list.includes(it.key) && "fill-[#f59e0b] text-[#f59e0b]")} /> {wish.list.includes(it.key) ? "Wished" : "Wish"}</Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Pick something to see it turn, its rarity and what it does.</p>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- my things

const CATS: [string, string, (i: Item) => boolean][] = [
  ["clothes", "Clothing", (i) => i.kind === "outfit" || i.kind === "hair"],
  ["acc", "Accessories", (i) => i.kind === "acc"],
  ["furniture", "Furniture", (i) => i.kind === "furniture"],
  ["homes", "Homes", (i) => i.kind === "house"],
  ["vehicles", "Vehicles", (i) => i.kind === "vehicle"],
  ["pets", "Pets", (i) => ["petfood", "pettoy", "petwear", "petskin"].includes(i.kind)],
  ["special", "Special", (i) => i.kind === "special"],
  ["skins", "Game skins", (i) => i.kind === "skin"],
];
export function InventoryPanel({ items, wallet, onClose, onAction }: { items: Item[]; wallet: Wallet | null; onClose: () => void; onAction: (a: "wear" | "place" | "ride" | "firework" | "pet" | "skin", key: string) => void }) {
  const [cat, setCat] = React.useState("clothes");
  const [skin, setSkin] = React.useState<string | null>(null);
  React.useEffect(() => {
    try {
      setSkin(localStorage.getItem("myseed.skin.snake"));
    } catch {}
  }, []);
  const def = CATS.find((c) => c[0] === cat)!;
  const mine = items.filter((i) => def[2](i) && (isFree(i) || qtyOf(wallet, i.key) > 0));
  return (
    <Panel title={<span className="flex items-center gap-2"><PackageIcon className="size-4" /> Your things</span>} onClose={onClose} wide>
      <div className="mb-2 flex flex-wrap gap-1">
        {CATS.map(([k, label]) => <button key={k} type="button" onClick={() => setCat(k)} className={cn("rounded-full border px-2 py-0.5 text-xs", cat === k && "border-primary bg-primary/10 font-medium")} data-inv-cat={k}>{label}</button>)}
      </div>
      <p className="mb-2 text-xs text-muted-foreground">{wallet?.coins ?? 0} coins · level {wallet?.level.level ?? 1} · {wallet?.owned.length ?? 0} things bought or given</p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {mine.map((i) => {
          const q = qtyOf(wallet, i.key);
          const act =
            i.kind === "outfit" || i.kind === "acc" || i.kind === "hair" ? (["wear", "Wear"] as const)
            : i.kind === "furniture" || i.kind === "house" ? (["place", i.kind === "house" ? "Move in" : "Place"] as const)
            : i.kind === "vehicle" ? (["ride", wallet?.ride === i.key || (!wallet?.ride && i.key === "car.bike") ? "Riding" : "Ride"] as const)
            : i.key === "special.firework" ? (["firework", "Light"] as const)
            : i.kind.startsWith("pet") ? (["pet", "Use with pet"] as const)
            : i.kind === "skin" && i.model === "snake" ? (["skin", skin === i.key ? "Using" : "Use"] as const)
            : null;
          return (
            <div key={i.key} className="rounded-lg border p-2 text-xs" data-inv-item={i.key}>
              <span className="block h-1 rounded-full" style={{ background: RARITY[i.rarity].color }} />
              <p className="mt-1 font-medium">{i.label}</p>
              <p className="text-[10px] text-muted-foreground">{RARITY[i.rarity].label}{i.stack ? ` · ${q} left` : isFree(i) ? " · free" : ""}</p>
              {act && (
                <Button size="xs" variant="outline" className="mt-1 w-full" onClick={() => (act[0] === "skin" ? (localStorage.setItem("myseed.skin.snake", i.key), setSkin(i.key), toast.success("Snake skin set")) : onAction(act[0], i.key))}>
                  {act[1]}
                </Button>
              )}
            </div>
          );
        })}
        {!mine.length && <p className="col-span-full text-xs text-muted-foreground">Nothing here yet. The shops on the east street sell all of it.</p>}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- the garage

export function GaragePanel({ items, wallet, ride, onClose, onRide, onWallet }: { items: Item[]; wallet: Wallet | null; ride: Ride & { key: string }; onClose: () => void; onRide: (r: Ride & { key: string }) => void; onWallet: (w: Wallet) => void }) {
  const cars = items.filter((i) => i.kind === "vehicle" && owns(wallet, i));
  const [sel, setSel] = React.useState(ride.key);
  const it = items.find((i) => i.key === sel) ?? cars[0]!;
  const data = (wallet?.owned.find((o) => o.key === sel)?.data ?? {}) as Ride;
  const [paint, setPaint] = React.useState(data.paint ?? it?.color ?? "#3b82f6");
  const [rims, setRims] = React.useState(data.rims ?? "#e5e7eb");
  React.useEffect(() => {
    const d = (wallet?.owned.find((o) => o.key === sel)?.data ?? {}) as Ride;
    setPaint(d.paint ?? items.find((i) => i.key === sel)?.color ?? "#3b82f6");
    setRims(d.rims ?? "#e5e7eb");
  }, [sel, wallet, items]);
  const level = data.level ?? 1;
  const cost = it ? Math.max(60, Math.round(it.price * 0.3)) * level : 0;
  return (
    <Panel title={<span className="flex items-center gap-2"><CarIcon className="size-4" /> Your garage</span>} onClose={onClose} wide>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="space-y-1">
          {cars.map((c) => (
            <button key={c.key} type="button" onClick={() => setSel(c.key)} className={cn("block w-full rounded-lg border p-2 text-left text-xs", sel === c.key && "border-primary bg-primary/5")} data-garage-car={c.key}>
              <span className="font-medium">{c.label}</span>
              {ride.key === c.key && <span className="ml-1 text-[10px] text-[#188038]">riding</span>}
            </button>
          ))}
          <p className="pt-1 text-[11px] text-muted-foreground">More at Aether Motors, inside.</p>
        </div>
        {it && (
          <div className="space-y-2">
            <Thumb item={{ ...it, color: paint }} className="h-40 w-full" key={`${it.key}${paint}`} />
            <p className="text-xs text-muted-foreground">Engine level {level} of 3 · top speed {Math.round((it.speed ?? 10) * (1 + (level - 1) * 0.15) * 3.6)} km/h</p>
            <div className="flex items-center gap-2 text-xs">
              Paint <input type="color" value={paint} onChange={(e) => setPaint(e.target.value)} className="h-7 w-10 rounded border" aria-label="Paint" />
              Rims <input type="color" value={rims} onChange={(e) => setRims(e.target.value)} className="h-7 w-10 rounded border" aria-label="Rims" />
            </div>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" onClick={async () => { const r = await F.setRideAction(it.key, { paint, rims }); if (!r.ok) return void toast.error(r.error); onWallet(r.data as Wallet); onRide({ key: it.key, paint, rims, level }); toast.success(`${it.label} is ready`); }} data-garage-use>
                Ride this one
              </Button>
              <Button size="sm" variant="outline" disabled={level >= 3 || (wallet?.coins ?? 0) < cost} onClick={async () => { const r = await F.upgradeRideAction(it.key); if (!r.ok) return void toast.error(r.error); onWallet(r.data as Wallet); if (ride.key === it.key) onRide({ ...ride, level: level + 1 }); toast.success("Upgraded"); }}>
                <ArrowUpIcon /> {level >= 3 ? "Fully upgraded" : `Upgrade (${cost})`}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- decorating the home

const WALLS = ["#fef3c7", "#fce7f3", "#e0f2fe", "#dcfce7", "#f1f5f9", "#ede9fe", "#fee2e2", "#1f2937"];
const FLOORS = ["#d6a77a", "#a16207", "#e5e7eb", "#94a3b8", "#fcd34d", "#86efac", "#c4b5fd", "#78350f"];
export function HomeStudio({ items, wallet, home, residents, onClose, onSaved, onWallet }: { items: Item[]; wallet: Wallet | null; home: HomeLayout; residents: Resident[]; onClose: () => void; onSaved: (h: HomeLayout) => void; onWallet: (w: Wallet) => void }) {
  const [h, setH] = React.useState<HomeLayout>(home);
  const [pick, setPick] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<number | null>(null);
  const [busy, setBusy] = React.useState(false);
  const house = items.find((i) => i.key === h.house) ?? items.find((i) => i.key === "house.cottage")!;
  const [rw, rd] = house.room ?? [16, 12];
  const houses = items.filter((i) => i.kind === "house" && owns(wallet, i));
  const furn = items.filter((i) => i.kind === "furniture" && owns(wallet, i));
  const used = (k: string) => h.items.filter((p) => p.key === k).length;
  const left = (it: Item) => (isFree(it) ? Infinity : qtyOf(wallet, it.key) - used(it.key));
  const cap = (house.capacity ?? 16) + ((h.level ?? 1) - 1) * 10;
  const foot = (p: Placed) => {
    const it = items.find((i) => i.key === p.key);
    const [w, d] = it?.size ?? [2, 2];
    return p.r % 2 ? [d, w] : [w, d];
  };
  const place = (x: number, z: number) => {
    if (sel !== null) {
      const n = [...h.items];
      n[sel] = { ...n[sel]!, x, z };
      setH({ ...h, items: n });
      return;
    }
    if (!pick) return;
    const it = items.find((i) => i.key === pick)!;
    if (left(it) <= 0) return void toast.error(`No more ${it.label} left; buy more at Nest Home.`);
    if (h.items.length >= cap) return void toast.error(`Your home holds ${cap} pieces.`);
    setH({ ...h, items: [...h.items, { key: pick, x, z, r: 0 }] });
  };
  const cell = 18;
  return (
    <Panel title={<span className="flex items-center gap-2"><HomeIcon className="size-4" /> Decorate your home</span>} onClose={onClose} wide>
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {houses.map((x) => <button key={x.key} type="button" onClick={() => setH({ ...h, house: x.key, items: [] })} className={cn("rounded-full border px-2 py-0.5", h.house === x.key && "border-primary bg-primary/10")}>{x.label}</button>)}
          <span className="ml-auto text-muted-foreground">{h.items.length} / {cap} pieces · level {h.level ?? 1}</span>
        </div>
        <div className="overflow-auto rounded-lg border bg-muted/40 p-1">
          <div className="relative" style={{ width: rw * cell, height: rd * cell, background: h.floor, backgroundImage: "linear-gradient(rgba(0,0,0,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,.08) 1px, transparent 1px)", backgroundSize: `${cell}px ${cell}px`, outline: `6px solid ${h.wall}` }} data-home-grid>
            {Array.from({ length: rw * rd }, (_, i) => (
              <button key={i} type="button" aria-label={`Cell ${i % rw}, ${Math.floor(i / rw)}`} onClick={() => place(i % rw, Math.floor(i / rw))} className="absolute hover:bg-primary/20" style={{ left: (i % rw) * cell, top: Math.floor(i / rw) * cell, width: cell, height: cell }} />
            ))}
            {h.items.map((p, i) => {
              const it = items.find((x) => x.key === p.key);
              const [w, d] = foot(p);
              return (
                <button key={i} type="button" onClick={(e) => (e.stopPropagation(), setSel(sel === i ? null : i), setPick(null))} className={cn("absolute flex items-center justify-center overflow-hidden rounded border-2 text-[9px] leading-tight font-medium text-white shadow", sel === i ? "border-primary ring-2 ring-primary" : "border-black/30")} style={{ left: p.x * cell, top: p.z * cell, width: w * cell, height: d * cell, background: it?.color ?? "#64748b", opacity: it?.model === "rug" ? 0.6 : 1 }} title={it?.label}>
                  {it?.label}
                </button>
              );
            })}
            <span className="absolute -top-0.5 left-1/2 h-1.5 w-12 -translate-x-1/2 rounded bg-[#7c2d12]" title="Door" />
          </div>
        </div>
        {sel !== null && (
          <div className="flex items-center gap-1 text-xs">
            <span className="flex-1">Selected: {items.find((x) => x.key === h.items[sel]?.key)?.label}. Click a cell to move it.</span>
            <Button size="xs" variant="outline" onClick={() => setH({ ...h, items: h.items.map((p, i) => (i === sel ? { ...p, r: (p.r + 1) % 4 } : p)) })}><RotateCwIcon /> Turn</Button>
            <Button size="xs" variant="outline" onClick={() => (setH({ ...h, items: h.items.filter((_, i) => i !== sel) }), setSel(null))}><Trash2Icon /> Store</Button>
          </div>
        )}
        <div>
          <p className="mb-1 text-xs font-medium">Your furniture (pick, then click the floor)</p>
          <div className="flex flex-wrap gap-1">
            {furn.map((f) => {
              const n = left(f);
              return (
                <button key={f.key} type="button" disabled={n <= 0} onClick={() => (setPick(pick === f.key ? null : f.key), setSel(null))} className={cn("rounded-full border px-2 py-0.5 text-xs disabled:opacity-40", pick === f.key && "border-primary bg-primary/10")} data-home-furn={f.key}>
                  {f.label}{Number.isFinite(n) ? ` (${n})` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="mb-1 font-medium">Walls</p>
            <div className="flex flex-wrap gap-1">{WALLS.map((c) => <button key={c} type="button" aria-label={`Walls ${c}`} onClick={() => setH({ ...h, wall: c })} className={cn("size-6 rounded border-2", h.wall === c ? "border-primary" : "border-transparent")} style={{ background: c }} />)}</div>
          </div>
          <div>
            <p className="mb-1 font-medium">Floor</p>
            <div className="flex flex-wrap gap-1">{FLOORS.map((c) => <button key={c} type="button" aria-label={`Floor ${c}`} onClick={() => setH({ ...h, floor: c })} className={cn("size-6 rounded border-2", h.floor === c ? "border-primary" : "border-transparent")} style={{ background: c }} />)}</div>
          </div>
        </div>
        <div className="space-y-1 rounded-lg border p-2 text-xs">
          <p className="font-medium">Who may come in</p>
          <div className="flex gap-1">
            {(["everyone", "invited", "private"] as const).map((a) => <Button key={a} size="xs" variant={h.access === a ? "default" : "outline"} onClick={() => setH({ ...h, access: a })} className="capitalize">{a === "invited" ? "Guests only" : a}</Button>)}
          </div>
          {h.access === "invited" && (
            <div className="flex max-h-24 flex-wrap gap-1 overflow-y-auto">
              {residents.filter((r) => !r.me).map((r) => <button key={r.id} type="button" onClick={() => setH({ ...h, guests: h.guests.includes(r.id) ? h.guests.filter((g) => g !== r.id) : [...h.guests, r.id] })} className={cn("rounded-full border px-2 py-0.5", h.guests.includes(r.id) && "border-primary bg-primary/10")}>{r.name}</button>)}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); const r = await F.saveHomeAction(h); setBusy(false); if (!r.ok) return void toast.error(r.error); onSaved(r.data as HomeLayout); toast.success("Home saved"); }} data-home-save>
            Save home
          </Button>
          <Button size="sm" variant="outline" disabled={(h.level ?? 1) >= 3} onClick={async () => { const r = await F.upgradeHomeAction(); if (!r.ok) return void toast.error(r.error); setH({ ...h, level: (r.data as HomeLayout).level }); const w = await F.walletAction(); if (w.ok && w.data) onWallet(w.data as Wallet); toast.success("More room!"); }}>
            <ArrowUpIcon /> {(h.level ?? 1) >= 3 ? "Fully upgraded" : "Upgrade for more room"}
          </Button>
        </div>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- voice

export function VoicePanel({ state, rooms, people, speaking, meId, onMode, onMute, onRoom, onVolume, volumes, onClose, enabled }: {
  state: VoiceState; rooms: Room[]; people: { id: string; name: string; voice: string; muted: boolean }[]; speaking: Set<string>; meId: string; volumes: Record<string, number>; enabled: boolean;
  onMode: (m: "off" | "near" | "room") => void; onMute: (m: boolean) => void; onRoom: (op: { op: "create"; name: string; priv?: boolean } | { op: "join"; id: string; code?: string } | { op: "leave" } | { op: "kick"; id: string }) => void; onVolume: (id: string, v: number) => void; onClose: () => void;
}) {
  const [name, setName] = React.useState("");
  const [priv, setPriv] = React.useState(false);
  const mine = rooms.find((r) => r.id === state.room);
  const talking = people.filter((p) => (state.mode === "room" ? p.voice === `r:${state.room}` : p.voice === "n"));
  if (!enabled) return <Panel title="Voice" onClose={onClose}><p className="text-xs text-muted-foreground">Admin has switched voice chat off.</p></Panel>;
  return (
    <Panel title={<span className="flex items-center gap-2"><MicIcon className="size-4" /> Voice</span>} onClose={onClose}>
      <div className="space-y-3" data-world-voice>
        <div className="grid grid-cols-3 gap-1">
          {([["off", "Off"], ["near", "Nearby"], ["room", "Room"]] as const).map(([m, label]) => <Button key={m} size="xs" variant={state.mode === m ? "default" : "outline"} onClick={() => onMode(m)} data-voice-mode={m}>{label}</Button>)}
        </div>
        <p className="text-[11px] text-muted-foreground">{state.mode === "near" ? "People within about 40 m hear you: louder the closer, from the side they stand on." : state.mode === "room" ? "Everyone in your room hears you, wherever they are in town." : "Your microphone is off."}</p>
        {state.mode !== "off" && (
          <Button size="sm" variant={state.muted ? "destructive" : "outline"} onClick={() => onMute(!state.muted)} className="w-full" data-voice-mute>
            {state.muted ? <MicOffIcon /> : <MicIcon />} {state.muted ? "Muted: tap to talk" : "Mute my microphone"}
            {speaking.has(meId) && !state.muted && <span className="ml-auto size-2 animate-pulse rounded-full bg-[#22c55e]" />}
          </Button>
        )}
        <div>
          <p className="mb-1 text-xs font-medium">Rooms</p>
          {rooms.length ? rooms.map((r) => (
            <div key={r.id} className={cn("mb-1 flex items-center gap-1 rounded-lg border p-1.5 text-xs", r.id === state.room && "border-primary bg-primary/5")}>
              {r.priv && <LockIcon className="size-3" />}
              <span className="flex-1 truncate">{r.name} <span className="text-muted-foreground">{r.n}/{r.cap}</span></span>
              {r.code && <span className="rounded bg-muted px-1 font-mono">code {r.code}</span>}
              {r.id === state.room ? (
                <Button size="xs" variant="ghost" onClick={() => onRoom({ op: "leave" })}><LogOutIcon /> Leave</Button>
              ) : (
                <Button size="xs" variant="outline" onClick={() => onRoom({ op: "join", id: r.id, code: r.priv ? (window.prompt("This room is private. Its code:") ?? "") : undefined })}><LogInIcon /> Join</Button>
              )}
            </div>
          )) : <p className="text-[11px] text-muted-foreground">No rooms yet. Make one for your team.</p>}
          <form className="mt-1 flex items-center gap-1" onSubmit={(e) => (e.preventDefault(), onRoom({ op: "create", name, priv }), setName(""))}>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New room name" className="h-8" maxLength={30} aria-label="Room name" />
            <label className="flex items-center gap-1 text-[11px]"><input type="checkbox" checked={priv} onChange={(e) => setPriv(e.target.checked)} /> private</label>
            <Button size="icon" type="submit" className="size-8" aria-label="Make the room"><PlusIcon /></Button>
          </form>
        </div>
        {state.mode !== "off" && (
          <div>
            <p className="mb-1 text-xs font-medium">{state.mode === "room" ? `In ${mine?.name ?? "the room"}` : "Nearby voices"}</p>
            {talking.length ? talking.map((p) => (
              <div key={p.id} className="mb-1 flex items-center gap-1 text-xs">
                <span className={cn("size-2 rounded-full", speaking.has(p.id) ? "bg-[#22c55e]" : "bg-muted")} />
                <span className="flex-1 truncate">{p.name}{p.muted ? " (muted)" : ""}</span>
                <input type="range" min={0} max={1.5} step={0.1} value={volumes[p.id] ?? 1} onChange={(e) => onVolume(p.id, Number(e.target.value))} className="w-20" aria-label={`Volume of ${p.name}`} />
                {mine?.owner === meId && <Button size="icon" variant="ghost" className="size-6" aria-label={`Remove ${p.name}`} onClick={() => onRoom({ op: "kick", id: p.id })}><UserXIcon /></Button>}
              </div>
            )) : <p className="text-[11px] text-muted-foreground">Nobody to hear yet.</p>}
          </div>
        )}
        <p className="text-[10px] text-muted-foreground">Voices go straight between browsers and are never recorded.</p>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- chat

export function ChatBox({ messages, onSend, open, setOpen, channel, setChannel, inRoom, enabled, muted, focusKey, className }: { messages: ChatMsg[]; onSend: (t: string, ch: "near" | "town" | "room") => void; open: boolean; setOpen: (o: boolean) => void; channel: "near" | "town" | "room"; setChannel: (c: "near" | "town" | "room") => void; inRoom: boolean; enabled: boolean; muted: Set<string>; focusKey: number; className?: string }) {
  const [say, setSay] = React.useState("");
  const input = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLDivElement>(null);
  const shown = messages.filter((m) => !muted.has(m.from) && (channel === "town" ? true : m.ch === channel));
  React.useEffect(() => {
    list.current?.scrollTo({ top: 1e6 });
  }, [shown.length, open]);
  React.useEffect(() => {
    if (focusKey) (setOpen(true), window.setTimeout(() => input.current?.focus(), 30));
  }, [focusKey, setOpen]);
  if (!enabled) return null;
  return (
    <div className={cn("absolute bottom-2 left-2 z-10 w-[min(320px,calc(100%-7rem))] text-xs", className)} data-world-chat>
      {open && (
        <div className="mb-1 rounded-lg bg-black/55 p-1.5 text-white backdrop-blur">
          <div className="mb-1 flex gap-1">
            {([["near", "Nearby"], ["town", "Town"], ...(inRoom ? [["room", "Room"]] : [])] as [typeof channel, string][]).map(([c, l]) => <button key={c} type="button" onClick={() => setChannel(c)} className={cn("rounded px-1.5 py-0.5", channel === c ? "bg-white/25 font-medium" : "hover:bg-white/10")}>{l}</button>)}
            <button type="button" className="ml-auto" aria-label="Hide chat" onClick={() => setOpen(false)}><ChevronDownIcon className="size-4" /></button>
          </div>
          <div ref={list} className="max-h-36 space-y-0.5 overflow-y-auto" aria-live="polite">
            {shown.slice(-40).map((m) => <p key={m.id}><span className={cn("font-semibold", m.ch === "town" ? "text-[#fde68a]" : m.ch === "room" ? "text-[#a5b4fc]" : "text-[#86efac]")}>{m.name.split(" ")[0]}:</span> {m.text}</p>)}
            {!shown.length && <p className="text-white/60">{channel === "near" ? "Say hello to people near you." : channel === "town" ? "Messages to the whole town." : "Messages to your voice room."}</p>}
          </div>
        </div>
      )}
      <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (say.trim()) (onSend(say.trim(), channel), setSay("")); }}>
        {!open && <Button type="button" size="icon" variant="secondary" className="size-9 shrink-0 bg-white/85" aria-label="Show chat" onClick={() => setOpen(true)}><ChevronUpIcon /></Button>}
        <Input ref={input} value={say} onChange={(e) => setSay(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (e.currentTarget.blur())} maxLength={160} placeholder={channel === "town" ? "Say something to the town" : channel === "room" ? "Say something to your room" : "Say something to everyone nearby"} aria-label="Say something" className="h-9 bg-white/90 text-black" data-world-say />
        <Button size="icon" type="submit" className="size-9 shrink-0" aria-label="Say"><SendIcon /></Button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------------------------------------- people

export function PeoplePanel({ residents, online, seesAbsence, onClose, onGo, onCard, onVisit, muted, blocked, onMute, onBlock, onReport }: {
  residents: Resident[]; online: { id: string; name: string }[]; seesAbsence: boolean; onClose: () => void; onGo: (id: string) => void; onCard: (r: Resident) => void; onVisit: (id: string) => void;
  muted: Set<string>; blocked: Set<string>; onMute: (id: string) => void; onBlock: (id: string) => void; onReport: (id: string, name: string) => void;
}) {
  const STATUS: Record<string, [string, string]> = { working: ["Working", "#22c55e"], online: ["Online", "#22c55e"], idle: ["Idle", "#eab308"], break: ["On a break", "#38bdf8"], absent: ["Absent", "#ef4444"], leave: ["On leave", "#a855f7"], left: ["Gone home", "#94a3b8"], away: ["Away", "#94a3b8"] };
  const counts = residents.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
  const [q, setQ] = React.useState("");
  return (
    <Panel title={<span className="flex items-center gap-2"><UsersIcon className="size-4" /> Who is where</span>} onClose={onClose}>
      <p className="mb-2 text-xs text-muted-foreground">{Object.entries(counts).map(([k, n]) => `${n} ${STATUS[k]![0].toLowerCase()}`).join(" · ")}</p>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" className="mb-2 h-8" aria-label="Find someone" />
      {online.length > 0 && (
        <div className="mb-2">
          <p className="font-medium text-[#2563eb]">In town now ({online.length})</p>
          {online.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
            <div key={p.id} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-muted">
              <button type="button" className="flex-1 truncate text-left" onClick={() => onGo(p.id)}>{p.name}</button>
              <button type="button" title={muted.has(p.id) ? "Unmute" : "Mute"} aria-label={muted.has(p.id) ? `Unmute ${p.name}` : `Mute ${p.name}`} onClick={() => onMute(p.id)}>{muted.has(p.id) ? <VolumeXIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}</button>
              <button type="button" title={blocked.has(p.id) ? "Unblock" : "Block"} aria-label={`Block ${p.name}`} onClick={() => onBlock(p.id)}><UserXIcon className={cn("size-3.5", blocked.has(p.id) && "text-destructive")} /></button>
              <button type="button" title="Report" aria-label={`Report ${p.name}`} onClick={() => onReport(p.id, p.name)}><FlagIcon className="size-3.5" /></button>
            </div>
          ))}
        </div>
      )}
      {(["working", "online", "idle", "break", ...(seesAbsence ? ["absent", "leave"] : []), "left", "away"] as string[]).map((st) => {
        const list = residents.filter((r) => r.status === st && r.name.toLowerCase().includes(q.toLowerCase()));
        if (!list.length) return null;
        return (
          <div key={st} className="mb-2">
            <p className="font-medium" style={{ color: STATUS[st]![1] }}>{STATUS[st]![0]} ({list.length})</p>
            {list.map((r) => (
              <div key={r.id} className="flex items-center gap-1 rounded px-1 py-0.5 text-xs hover:bg-muted">
                <button type="button" className="flex-1 truncate text-left" onClick={() => (onGo(r.id), onCard(r))}>{r.name}{r.me ? " (you)" : ""}</button>
                <span className="text-muted-foreground tabular-nums">{r.progress}%</span>
                <button type="button" title="Visit their home" aria-label={`Visit ${r.name}'s home`} onClick={() => onVisit(r.id)}><HomeIcon className="size-3.5" /></button>
              </div>
            ))}
          </div>
        );
      })}
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- settings

export function SettingsPanel({ gfx, onChange, onClose }: { gfx: Gfx; onChange: (g: Gfx, rebuild: boolean) => void; onClose: () => void }) {
  const set = (p: Partial<Gfx>, rebuild = true) => onChange({ ...gfx, ...p, preset: p.preset ?? (rebuild ? "custom" : gfx.preset) }, rebuild);
  return (
    <Panel title="Settings" onClose={onClose}>
      <div className="space-y-3 text-xs" data-world-settings>
        <div>
          <p className="mb-1 font-medium">Graphics</p>
          <div className="grid grid-cols-5 gap-1">
            {(["auto", "low", "medium", "high", "ultra"] as const).map((p) => <Button key={p} size="xs" variant={gfx.preset === p ? "default" : "outline"} onClick={() => onChange({ ...gfx, preset: p, ...(p === "auto" ? PRESETS[gfx.quality] : PRESETS[p]) }, true)} className="capitalize" data-gfx-preset={p}>{p}</Button>)}
          </div>
          {gfx.preset === "custom" && <p className="mt-1 text-muted-foreground">Custom</p>}
        </div>
        <label className="flex items-center justify-between">Shadows
          <select value={gfx.shadows} onChange={(e) => set({ shadows: Number(e.target.value) as 0 | 1 | 2 })} className="h-7 rounded border bg-background px-1"><option value={0}>Off</option><option value={1}>Soft</option><option value={2}>Sharp</option></select>
        </label>
        <label className="flex items-center justify-between">Character detail and outlines
          <select value={gfx.quality} onChange={(e) => set({ quality: e.target.value as Gfx["quality"] })} className="h-7 rounded border bg-background px-1">{(["low", "medium", "high", "ultra"] as const).map((q) => <option key={q} value={q}>{q}</option>)}</select>
        </label>
        <label className="block">Resolution {Math.round(gfx.ratio * 100)}%<input type="range" min={0.5} max={2} step={0.25} value={gfx.ratio} onChange={(e) => set({ ratio: Number(e.target.value) })} className="w-full" /></label>
        <label className="block">View distance {gfx.view} m<input type="range" min={50} max={260} step={10} value={gfx.view} onChange={(e) => set({ view: Number(e.target.value) })} className="w-full" /></label>
        <label className="block">Field of view {gfx.fov}°<input type="range" min={50} max={90} step={1} value={gfx.fov} onChange={(e) => set({ fov: Number(e.target.value) })} className="w-full" /></label>
        <label className="flex items-center justify-between">Smooth edges (anti-aliasing)<input type="checkbox" checked={gfx.aa} onChange={(e) => set({ aa: e.target.checked })} /></label>
        <label className="flex items-center justify-between">Effects (fireworks, sparkles)<input type="checkbox" checked={gfx.effects} onChange={(e) => set({ effects: e.target.checked }, false)} /></label>
        <label className="flex items-center justify-between">Frame rate
          <select value={gfx.fps} onChange={(e) => set({ fps: Number(e.target.value) as 0 | 30 | 60 }, false)} className="h-7 rounded border bg-background px-1"><option value={30}>30</option><option value={60}>60</option><option value={0}>Screen rate</option></select>
        </label>
        <p className="pt-1 font-medium">Controls</p>
        <label className="block">Camera speed {gfx.sens.toFixed(1)}<input type="range" min={0.3} max={2.5} step={0.1} value={gfx.sens} onChange={(e) => set({ sens: Number(e.target.value) }, false)} className="w-full" /></label>
        <label className="flex items-center justify-between">Invert up and down<input type="checkbox" checked={gfx.invert} onChange={(e) => set({ invert: e.target.checked }, false)} /></label>
        <label className="flex items-center justify-between">Start in first person<input type="checkbox" checked={gfx.camera === "first"} onChange={(e) => set({ camera: e.target.checked ? "first" : "third" }, false)} /></label>
        <label className="flex items-center justify-between">Names over heads<input type="checkbox" checked={gfx.names} onChange={(e) => set({ names: e.target.checked }, false)} /></label>
        <label className="block">Music {Math.round((gfx.music ?? 0.5) * 100)}%<input type="range" min={0} max={1} step={0.05} value={gfx.music ?? 0.5} onChange={(e) => set({ music: Number(e.target.value) }, false)} className="w-full" data-gfx-music /></label>
        <label className="block">Sound effects {Math.round(gfx.sfx * 100)}%<input type="range" min={0} max={1} step={0.1} value={gfx.sfx} onChange={(e) => set({ sfx: Number(e.target.value) }, false)} className="w-full" /></label>
        <p className="text-[10px] text-muted-foreground">Music: town themes by cynicmusic and Geomancer, Castle Town by Will Carpenter, action chiptunes by Juhani Junkala (all CC0). Effects: Kenney (CC0) and sounds made in your browser.</p>
        <p className="text-[10px] text-muted-foreground" data-desktop-download>
          On a Windows PC with a graphics card: <a className="underline" href="/downloads/desktop/latest">get the Seed Town app</a> (higher graphics levels, full screen, a launcher with diagnostics; same account). F3 shows the frame rate.
        </p>
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- map

export function MapPanel({ draw, onTravel, onClose }: { draw: (c: HTMLCanvasElement) => void; onTravel: (x: number, y: number, z: number) => void; onClose: () => void }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  React.useEffect(() => {
    const t = window.setInterval(() => ref.current && draw(ref.current), 300);
    if (ref.current) draw(ref.current);
    return () => window.clearInterval(t);
  }, [draw]);
  const PLACES: [string, number, number, number][] = [["Plaza", 0, 0, 12], ["Office", 0, 0, -40], ["Shops", 40, 0, 2], ["Car dealer", 100, 0, 10], ["Park", -50, 0, -4], ["Archery", -97, 0, -23], ["Parkour", -114, 0, 36], ["Homes", 0, 0, 30], ["Race start", 0, 0, -130], ["Library", -52, 0, -51], ["Stadium", 185, 0, 41], ["Seed Circuit", 152, 0, -52], ["Grand Prix", 214, 0, -124], ["Archery field", -226, 0, 2], ["Seed Strike", 300, 0, 218], ["Downtown", 60, 0, -45], ["Industrial yard", 98, 0, 64]];
  return (
    <Panel title={<span className="flex items-center gap-2"><MapPinIcon className="size-4" /> Map</span>} onClose={onClose} wide>
      <canvas ref={ref} width={420} height={420} className="mx-auto aspect-square w-full max-w-[420px] rounded-lg border" data-world-map />
      <p className="mt-2 mb-1 text-xs font-medium">Travel there</p>
      <div className="flex flex-wrap gap-1">{PLACES.map(([n, x, y, z]) => <Button key={n} size="xs" variant="outline" onClick={() => onTravel(x, y, z)}>{n}</Button>)}</div>
    </Panel>
  );
}

// ------------------------------------------------------------------------------------------------- talking with town folk

export function NpcDialog({ name, role, lines, actions, onAct, onClose }: { name: string; role: string; lines: string[]; actions: { label: string; act: string; arg?: string }[]; onAct: (act: string, arg?: string) => void; onClose: () => void }) {
  const [i, setI] = React.useState(0);
  return (
    <div className="absolute inset-x-2 bottom-24 z-20 mx-auto max-w-md rounded-xl border-2 border-[#fde68a] bg-[#0f172a]/95 p-3 text-sm text-white shadow-xl sm:bottom-16" data-world-npc>
      <div className="mb-1 flex items-center gap-2">
        <span className="font-semibold text-[#fde68a]">{name}</span>
        <span className="text-xs text-white/60">{role}</span>
        <button type="button" aria-label="Close" className="ml-auto" onClick={onClose}><XIcon className="size-4" /></button>
      </div>
      <p className="min-h-10">{lines[i % lines.length]}</p>
      <div className="mt-2 flex flex-wrap gap-1">
        {lines.length > 1 && <Button size="xs" variant="secondary" onClick={() => setI(i + 1)}>Tell me more</Button>}
        {actions.map((a) => <Button key={a.label} size="xs" onClick={() => onAct(a.act, a.arg)}>{a.label}</Button>)}
        <Button size="xs" variant="ghost" className="text-white" onClick={onClose}>Bye</Button>
      </div>
    </div>
  );
}
