"use client";

import * as React from "react";
import * as THREE from "three";
import { toast } from "sonner";
import { BookmarkIcon, CheckIcon, GemIcon, Loader2Icon, LockIcon, PersonStandingIcon, ScissorsIcon, ShirtIcon, SmileIcon, SparklesIcon, Trash2Icon, UsersIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { ACCESSORIES, CATALOG, HAIR_STYLES, OUTFITS, RARITY, cleanLook, isFree, lookItems, type AccSlot, type Item, type Look } from "@/lib/fun-catalog";
import { Character } from "./character";

// The character designer: a turning 3D preview (drag to rotate, wheel or pinch to zoom, try the animations), and
// tabs for the body, face, hair, outfit, accessories and saved looks. Paid things can be tried on; saving needs them
// bought (right here).

export type Wallet = { coins: number; level: { level: number; into: number; need: number }; owned: { key: string; qty: number; data: Record<string, unknown> }[]; ride: string | null; free?: boolean };
type Preset = { name: string; look: Look };
const POSES = ["idle", "walk", "run", "jump", "sit", "wave", "dance", "laugh", "cry", "cheer", "bow", "clap"] as const;
const SKINS = ["#fde3cf", "#f9d7b5", "#f2c9a0", "#d9a07a", "#b97d55", "#8d5a3b", "#5c3a26", "#3b2417"];
const HAIRS = ["#2b1b0e", "#6b3e1e", "#a0522d", "#f5d0a9", "#fde68a", "#e5e7eb", "#1f2937", "#7c3aed", "#ec4899", "#0ea5e9", "#22c55e", "#ef4444"];
const EYES = ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#7c2d12", "#ec4899", "#ef4444", "#06b6d4", "#111827"];
const CLOTH = ["#f8fafc", "#111827", "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#4f46e5", "#a855f7", "#ec4899", "#78350f"];

export function Preview({ look, pose, className, auto = true }: { look: Look; pose: string; className?: string; auto?: boolean }) {
  const box = React.useRef<HTMLDivElement>(null);
  const state = React.useRef<{ av: Character | null; scene: THREE.Scene; rot: number; zoom: number; pose: string } | null>(null);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight("#ffffff", "#8b5cf6", 1.3));
    const key = new THREE.DirectionalLight("#fff7e6", 1.6);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight("#93c5fd", 0.9);
    rim.position.set(-3, 2, -3);
    scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.1, 40), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.18 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.08, 1.14, 48), new THREE.MeshBasicMaterial({ color: "#fde68a", transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);
    // Floating sparkles.
    const n = 80;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 6, Math.random() * 4, -1.5 - Math.random() * 3], i * 3);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: "#bfdbfe", size: 0.04, transparent: true, opacity: 0.8 }));
    scene.add(stars);
    const camera = new THREE.PerspectiveCamera(35, el.clientWidth / el.clientHeight, 0.1, 50);
    state.current = { av: null, scene, rot: 0.3, zoom: 4.2, pose: "idle" };
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY });
    const move = (e: PointerEvent) => {
      if (!drag || !state.current) return;
      state.current.rot += (e.clientX - drag.x) * 0.012;
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (state.current) state.current.zoom = Math.max(1.6, Math.min(6, state.current.zoom + e.deltaY * 0.004));
    };
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("wheel", wheel, { passive: false });
    const clock = new THREE.Clock();
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, clock.getDelta());
      const t = clock.elapsedTime;
      const s = state.current!;
      if (s.av) {
        const p = s.pose;
        s.av.update(t, dt, { speed: p === "walk" ? 0.5 : p === "run" ? 0.7 : 0, air: p === "jump" && Math.sin(t * 2) > 0, sit: p === "sit", drive: false, crouch: false, emote: ["wave", "dance", "laugh", "cry", "cheer", "bow", "clap"].includes(p) ? p : "" }, camera);
        s.av.root.position.y = p === "jump" ? Math.max(0, Math.sin(t * 2)) * 0.5 : p === "sit" ? 0.0 : 0;
        if (auto && !drag) s.rot += dt * 0.25;
        s.av.root.rotation.y = s.rot;
      }
      stars.rotation.y = t * 0.03;
      const z = s.zoom;
      const focusY = z < 2.4 ? 1.45 : 1.0;
      camera.position.set(0, focusY + 0.25, z);
      camera.lookAt(0, focusY, 0);
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      sg.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, [auto]);
  React.useEffect(() => {
    const s = state.current;
    if (!s) return;
    if (!s.av) {
      s.av = new Character(look, true);
      s.av.setDetailed(true);
      s.scene.add(s.av.root);
    } else s.av.setLook(look);
  }, [look]);
  React.useEffect(() => () => state.current?.av?.dispose(), []);
  React.useEffect(() => {
    if (state.current) state.current.pose = pose;
  }, [pose]);
  return <div ref={box} className={cn("relative touch-none", className)} data-studio-preview />;
}

type Tab = "characters" | "body" | "face" | "hair" | "outfit" | "acc" | "presets";

export function Studio({ look: start, wallet, items, presets: startPresets, onClose, onSaved, onWallet }: { look: Look; wallet: Wallet | null; items: Item[]; presets: Preset[]; onClose: () => void; onSaved: (l: Look) => void; onWallet: (w: Wallet) => void }) {
  const [l, setL] = React.useState<Look>(start);
  const [tab, setTab] = React.useState<Tab>("characters");
  const [pose, setPose] = React.useState<string>("idle");
  const [busy, setBusy] = React.useState(false);
  const [presets, setPresets] = React.useState(startPresets);
  const [presetName, setPresetName] = React.useState("");
  const owned = React.useMemo(() => new Set((wallet?.owned ?? []).map((o) => o.key)), [wallet]);
  const priceOf = (key: string) => items.find((i) => i.key === key) ?? null;
  const has = (key: string) => {
    const it = priceOf(key);
    return !it || isFree(it) || owned.has(key);
  };
  const missing = lookItems(l).filter((k) => !has(k));
  const missingCost = missing.reduce((a, k) => a + (priceOf(k)?.price ?? 0), 0);
  const set = (p: Partial<Look>) => setL((x) => cleanLook({ ...x, ...p }));
  const buy = async (key: string) => {
    const r = await F.buyAction(key);
    if (!r.ok) return toast.error(r.error), false;
    onWallet(r.data as Wallet);
    toast.success(`${priceOf(key)?.label ?? "Item"} is yours`);
    return true;
  };
  const tile = (it: Item, on: boolean, pick: () => void, label = it.label) => {
    const mine = has(it.key);
    const locked = !mine && it.level && (wallet?.level.level ?? 1) < it.level;
    return (
      <button key={it.key} type="button" onClick={pick} className={cn("relative flex flex-col items-start rounded-lg border p-2 text-left text-xs transition-colors", on ? "border-primary bg-primary/10" : "hover:bg-muted")} data-studio-item={it.key}>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 flex items-center gap-1 text-[10px]" style={{ color: RARITY[it.rarity].color }}>{RARITY[it.rarity].label}</span>
        <span className="mt-1 text-[10px] text-muted-foreground">{mine ? (isFree(it) ? "Free" : "Owned") : locked ? `Level ${it.level}` : `${it.price} coins`}</span>
        {!mine && <LockIcon className="absolute top-1.5 right-1.5 size-3 text-muted-foreground" />}
        {on && mine && <CheckIcon className="absolute top-1.5 right-1.5 size-3 text-primary" />}
      </button>
    );
  };
  const swatches = (list: string[], value: string, pick: (c: string) => void, label: string) => (
    <div>
      <p className="mb-1 text-xs font-medium">{label}</p>
      <div className="flex flex-wrap items-center gap-1">
        {list.map((c) => <button key={c} type="button" aria-label={`${label} ${c}`} onClick={() => pick(c)} className={cn("size-6 rounded-full border-2", value === c ? "border-primary ring-2 ring-primary/30" : "border-white/40")} style={{ background: c }} />)}
        <input type="color" value={value} onChange={(e) => pick(e.target.value)} aria-label={`${label}: any colour`} className="h-6 w-8 cursor-pointer rounded border" />
      </div>
    </div>
  );
  const slider = (k: "height" | "head" | "arms" | "legs" | "shoulders", label: string) => (
    <label className="block text-xs">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-muted-foreground">{l[k].toFixed(1)}</span></span>
      <input type="range" min={-1} max={1} step={0.1} value={l[k]} onChange={(e) => set({ [k]: Number(e.target.value) })} className="w-full accent-[#f59e0b]" aria-label={label} data-studio-slider={k} />
    </label>
  );
  const slots: [AccSlot, string][] = [["head", "Head"], ["face", "Face"], ["neck", "Neck"], ["ears", "Ears"], ["back", "Back"]];
  // Detailed models: anime (VRoid) or realistic people (Rocketbox); both use the motion library.
  const anime = l.style === "anime" || l.style === "realistic";
  const TABS: [Tab, string, React.ReactNode][] = [
    ["characters", "Characters", <UsersIcon key="c" />],
    ["body", "Body", <PersonStandingIcon key="b" />],
    ["face", "Face", <SmileIcon key="f" />],
    ["hair", "Hair", <ScissorsIcon key="h" />],
    ["outfit", "Attire", <ShirtIcon key="o" />],
    ["acc", "Accessories", <GemIcon key="a" />],
    ["presets", "Saved looks", <BookmarkIcon key="p" />],
  ];
  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-hidden bg-gradient-to-br from-[#0b1026] via-[#1e1b4b] to-[#0f172a] text-white" data-world-dressup>
      <div className="flex items-center gap-2 px-3 py-2">
        <SparklesIcon className="size-5 text-[#fde68a]" />
        <p className="flex-1 text-lg font-semibold tracking-wide">Character creation</p>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs">{wallet?.coins ?? 0} coins · level {wallet?.level.level ?? 1}</span>
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-1 hover:bg-white/10"><XIcon className="size-5" /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto px-2 md:w-40 md:flex-col md:px-3" aria-label="Designer sections">
          {TABS.map(([k, label, icon]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-sm whitespace-nowrap [&_svg]:size-4", tab === k ? "bg-white/15 font-semibold" : "text-white/70 hover:bg-white/5")} data-studio-tab={k}>
              {icon} {label}
            </button>
          ))}
        </nav>
        <div className="relative min-h-[220px] flex-1">
          <Preview look={l} pose={pose} className="absolute inset-0" />
          <div className="absolute inset-x-2 bottom-2 flex flex-wrap justify-center gap-1">
            {POSES.map((p) => <button key={p} type="button" onClick={() => setPose(p)} className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", pose === p ? "bg-[#fde68a] text-black" : "bg-white/10 hover:bg-white/20")} data-studio-pose={p}>{p}</button>)}
          </div>
        </div>
        <div className="max-h-[45%] min-h-0 w-full overflow-y-auto bg-black/25 p-3 md:max-h-none md:w-80 [&_.text-muted-foreground]:text-white/60">
          {tab === "characters" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1">
                {([["realistic", "Realistic"], ["anime", "Anime"], ["chibi", "Chibi"], ["blocky", "Blocky"]] as const).map(([s, label]) => <Button key={s} size="xs" variant={l.style === s ? "default" : "secondary"} onClick={() => set(s === "realistic" ? { style: s, base: l.style === "realistic" ? l.base : "rb_m01" } : s === "anime" ? { style: s, base: l.style === "anime" ? l.base : "kai" } : { style: s })} data-studio-style={s}>{label}</Button>)}
              </div>
              {anime ? (
                <div className="grid grid-cols-2 gap-1.5">{CATALOG.filter((i) => i.kind === "avatar" && !!i.realistic === (l.style === "realistic")).map((a) => tile(priceOf(a.key) ?? a, l.base === a.model, () => set({ base: a.model })))}</div>
              ) : (
                <p className="text-xs text-white/70">The chibi and blocky styles are built from simple shapes: choose hair, outfits and proportions in the other tabs.</p>
              )}
              <p className="text-[11px] text-white/60">{l.style === "realistic" ? "Realistic people (Microsoft Rocketbox, free to use) are rigged 3D models with real animations; their faces move when they talk and blink." : "Anime characters are rigged 3D models with real animations, facial expressions and swinging hair."} They load the first time you see them.</p>
            </div>
          )}
          {tab === "body" && (
            <div className="space-y-3">
              {!anime && (
                <div className="flex gap-1">
                  {(["slim", "broad"] as const).map((s) => <Button key={s} size="xs" variant={l.body === s ? "default" : "secondary"} onClick={() => set({ body: s })} className="capitalize">{s}</Button>)}
                </div>
              )}
              <div className="rounded-lg bg-white/5 p-2">
                <p className="mb-1 border-b border-white/10 pb-1 text-xs font-semibold tracking-wide uppercase">Body</p>
                {slider("height", "Height")}
                {!anime && slider("shoulders", "Shoulders")}
              </div>
              <div className="rounded-lg bg-white/5 p-2">
                <p className="mb-1 border-b border-white/10 pb-1 text-xs font-semibold tracking-wide uppercase">Head, arms and legs</p>
                {slider("head", "Head size")}
                {!anime && slider("arms", "Arm length")}
                {!anime && slider("legs", "Leg length")}
              </div>
              {swatches(SKINS, l.skin, (c) => set({ skin: c }), "Skin")}
            </div>
          )}
          {tab === "face" && (
            <div className="space-y-3">
              {anime && <label className="flex items-center justify-between text-xs">Change the eye colour<input type="checkbox" checked={l.tintEyes} onChange={(e) => set({ tintEyes: e.target.checked })} /></label>}
              {(!anime || l.tintEyes) && swatches(EYES, l.eyes, (c) => set({ eyes: c }), "Eye colour")}
              <div>
                <p className="mb-1 text-xs font-medium">Eyes</p>
                <div className="flex flex-wrap gap-1">{(["round", "sharp", "sleepy", "sparkle"] as const).map((s) => <Button key={s} size="xs" variant={l.eyeShape === s ? "default" : "secondary"} onClick={() => set({ eyeShape: s })} className="capitalize">{s}</Button>)}</div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium">Expression</p>
                <div className="flex flex-wrap gap-1">{(["smile", "grin", "cool", "wink", "calm", "pout"] as const).map((s) => <Button key={s} size="xs" variant={l.face === s ? "default" : "secondary"} onClick={() => set({ face: s })} className="capitalize">{s}</Button>)}</div>
              </div>
            </div>
          )}
          {tab === "hair" && (
            <div className="space-y-3">
              {anime ? (
                <label className="flex items-center justify-between text-xs">Dye the hair<input type="checkbox" checked={l.tintHair} onChange={(e) => set({ tintHair: e.target.checked })} data-studio-tint="hair" /></label>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">{HAIR_STYLES.map((h) => tile(priceOf(h.key) ?? h, l.hairStyle === h.model, () => set({ hairStyle: h.model })))}</div>
              )}
              {(!anime || l.tintHair) && swatches(HAIRS, l.hair, (c) => set({ hair: c }), "Hair colour")}
            </div>
          )}
          {tab === "outfit" && (
            <div className="space-y-3">
              {anime ? (
                <label className="flex items-center justify-between text-xs">Recolour the clothes<input type="checkbox" checked={l.tintClothes} onChange={(e) => set({ tintClothes: e.target.checked })} data-studio-tint="clothes" /></label>
              ) : (
                <div className="grid grid-cols-2 gap-1.5">{OUTFITS.map((o) => tile(priceOf(o.key) ?? o, l.outfit === o.model, () => set({ outfit: o.model })))}</div>
              )}
              {swatches(CLOTH, l.shirt, (c) => set({ shirt: c }), "Top")}
              {swatches(CLOTH, l.pants, (c) => set({ pants: c }), "Bottom")}
              {swatches(CLOTH, l.shoes, (c) => set({ shoes: c }), "Shoes")}
            </div>
          )}
          {tab === "acc" && (
            <div className="space-y-3">
              {slots.map(([slot, label]) => (
                <div key={slot}>
                  <p className="mb-1 text-xs font-semibold tracking-wide uppercase">{label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button type="button" onClick={() => (slot === "head" ? set({ hat: "none" }) : set({ acc: l.acc.filter((k) => ACCESSORIES.find((a) => a.key === k)?.slot !== slot) }))} className={cn("rounded-lg border p-2 text-left text-xs", (slot === "head" ? l.hat === "none" : !l.acc.some((k) => ACCESSORIES.find((a) => a.key === k)?.slot === slot)) ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                      Nothing
                    </button>
                    {ACCESSORIES.filter((a) => a.slot === slot).map((a) => {
                      const on = slot === "head" ? l.hat === a.model : l.acc.includes(a.key);
                      return tile(priceOf(a.key) ?? a, on, () => (slot === "head" ? set({ hat: a.model }) : set({ acc: [...l.acc.filter((k) => ACCESSORIES.find((x) => x.key === k)?.slot !== slot), a.key] })));
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
          {tab === "presets" && (
            <div className="space-y-2">
              <p className="text-xs text-white/70">Keep up to four looks and switch between them.</p>
              {presets.map((p) => (
                <div key={p.name} className="flex items-center gap-1 rounded-lg bg-white/5 p-2 text-sm">
                  <span className="flex-1 truncate">{p.name}</span>
                  <Button size="xs" variant="secondary" onClick={() => setL(p.look)}>Wear</Button>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${p.name}`} onClick={async () => { const r = await F.savePresetAction(p.name, null); if (r.ok) setPresets(r.data ?? []); }}><Trash2Icon /></Button>
                </div>
              ))}
              <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); const r = await F.savePresetAction(presetName, l); if (!r.ok) return void toast.error(r.error); setPresets(r.data ?? []); setPresetName(""); toast.success("Look saved"); }}>
                <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Name this look" maxLength={30} className="h-8 bg-white/10 text-white" aria-label="Look name" />
                <Button size="sm" type="submit" disabled={!presetName.trim()}>Save</Button>
              </form>
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-white/10 px-3 py-2">
        {missing.length > 0 ? (
          <>
            <p className="flex-1 text-xs text-[#fde68a]">Trying on {missing.length} thing{missing.length === 1 ? "" : "s"} you do not own ({missingCost} coins).</p>
            <Button size="sm" variant="secondary" disabled={busy || (wallet?.coins ?? 0) < missingCost} onClick={async () => { setBusy(true); for (const k of missing) if (!(await buy(k))) break; setBusy(false); }} data-studio-buy-all>
              Buy them
            </Button>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <Button variant="secondary" size="sm" onClick={() => setL(start)}>Undo changes</Button>
        <Button
          size="sm"
          disabled={busy || missing.length > 0}
          onClick={async () => {
            setBusy(true);
            const r = await F.saveLookAction(l);
            setBusy(false);
            if (!r.ok) return void toast.error(r.error);
            onSaved(r.data as Look);
            onClose();
            toast.success("Looking good!");
          }}
          data-world-save-look
        >
          Save my look
        </Button>
      </div>
    </div>
  );
}
