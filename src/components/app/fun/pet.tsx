"use client";

import * as React from "react";
import { toast } from "sonner";
import { BathIcon, CookieIcon, DropletsIcon, HandHeartIcon, Loader2Icon, MoonIcon, PencilIcon, SparklesIcon, SunIcon, VolleyballIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import { CATALOG } from "@/lib/fun-catalog";
import { PET_ICONS } from "./icons";
import { petStage, setAction, type PetAction, type PetLook, type PetStageApi } from "./pet3d";

// The pet: a 3D companion that grows with care (baby, young, adolescent, adult). Tap its head or belly, drag food
// and toys onto it, bathe it, put it to bed. Its six needs fall over time; caring when it needs it earns it
// experience; a daily streak gives a bonus. Work points still lift its mood. It can also roam the screen.

const KINDS = [
  { key: "cat", label: "Cat" },
  { key: "dog", label: "Puppy" },
  { key: "fox", label: "Fox" },
  { key: "panda", label: "Panda" },
  { key: "dragon", label: "Dragon" },
  { key: "robot", label: "Robot" },
  { key: "owl", label: "Owl" },
  { key: "bunny", label: "Bunny" },
];
const ITEMS = [
  { key: "none", label: "Nothing", level: 1 },
  { key: "bow", label: "Bow", level: 2 },
  { key: "cap", label: "Cap", level: 3 },
  { key: "glasses", label: "Sunglasses", level: 4 },
  { key: "crown", label: "Crown", level: 6 },
  { key: "headphones", label: "Headphones", level: 8 },
  { key: "wizard", label: "Wizard hat", level: 10 },
];
const STAGES = ["Baby", "Young", "Adolescent", "Adult"];

export type PetData = {
  pet: {
    kind: string; name: string; outfit: string; since: string; hunger: number; full: number; fun: number; love: number; clean: number; energy: number; health: number; happiness: number; mood: string; sleeping: boolean;
    xp: number; stage: string; stageLabel: string; stageIndex: number; nextXp: number | null; streak: number; skin: string | null; wear: string[]; log: { at: string; what: string }[];
  } | null;
  points: { balance: number; earned: number; today: number };
  level: { level: number; into: number; need: number };
  feedCost: number;
  things: { key: string; qty: number }[];
  shop: boolean;
  others?: { id: string; name: string; kind: string; stage: string }[];
  slots?: number;
  gained?: number;
  grew?: string | null;
};

const SAY: Record<string, string[]> = {
  joyful: ["Best day ever!", "You are on fire today!", "Let's keep going!"],
  happy: ["Nice work today.", "I like it here.", "What's next?"],
  okay: ["A snack would be nice…", "Let's finish one more task?", "I'm a little bored."],
  sad: ["I'm hungry…", "I missed you.", "Some work and a treat would cheer me up."],
  sleeping: ["Zzz…", "Zzz… (dreaming of treats)", "Zzz…"],
};
export const ROAM_KEY = "myseed.pet.roam";
export const ROAM_EVENT = "myseed-pet-roam";

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{label}</span><span>{value}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export const lookOf = (p: NonNullable<PetData["pet"]>): PetLook => ({ kind: p.kind, stage: p.stageIndex ?? 0, skin: p.skin, wear: p.wear ?? [], outfit: p.outfit });
export const moodOf = (p: NonNullable<PetData["pet"]>) => p.happiness / 100;

// Care with the matching 3D reaction; shared by the tab and the roaming pet.
export async function care(act: Parameters<typeof F.carePetAction>[0], arg: string | undefined, stage: PetStageApi | null, onData: (d: PetData) => void) {
  const anim: Record<string, PetAction> = { feed: "eat", water: "drink", play: "play", pet: arg === "belly" ? "belly" : "happy", bath: "bath" };
  if (stage && anim[act]) setAction(stage.pet, anim[act]!);
  const r = await F.carePetAction(act, arg);
  if (!r.ok) {
    toast.error(r.error);
    if (stage) setAction(stage.pet, "sad");
    return null;
  }
  const d = r.data as PetData;
  onData(d);
  if (d.grew) toast.success(`${d.pet?.name} grew up: now ${d.grew.toLowerCase()}!`);
  else if (d.gained) toast(`+${d.gained} care points for ${d.pet?.name}`);
  window.dispatchEvent(new CustomEvent("myseed-pet-changed", { detail: d }));
  return d;
}

function Stage({ look, mood, sleeping, onTouch, onDropThing, onReady, className }: { look: PetLook; mood: number; sleeping: boolean; onTouch?: (where: "head" | "belly" | "body") => void; onDropThing?: (key: string) => void; onReady?: (s: PetStageApi) => void; className?: string }) {
  const box = React.useRef<HTMLDivElement>(null);
  const api = React.useRef<PetStageApi | null>(null);
  const lookKey = JSON.stringify(look);
  React.useEffect(() => {
    const el = box.current;
    if (!el) return;
    const s = petStage(el, look);
    api.current = s;
    onReady?.(s);
    const move = (e: PointerEvent) => s.lookAt(e.clientX, e.clientY);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      s.dispose();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => void api.current?.restyle(look), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => void api.current?.setMood(mood, sleeping), [mood, sleeping]);
  const drag = React.useRef<{ x: number; moved: boolean } | null>(null);
  return (
    <div
      ref={box}
      className={cn("relative cursor-grab", className)}
      onPointerDown={(e) => (drag.current = { x: e.clientX, moved: false })}
      onPointerMove={(e) => {
        if (!drag.current || !(e.buttons & 1)) return;
        const dx = e.clientX - drag.current.x;
        if (Math.abs(dx) > 3) drag.current.moved = true;
        api.current?.rotate(dx * 0.01);
        drag.current.x = e.clientX;
      }}
      onPointerUp={(e) => {
        if (drag.current && !drag.current.moved) {
          const w = api.current?.hit(e.clientX, e.clientY);
          if (w) onTouch?.(w);
        }
        drag.current = null;
      }}
      onWheel={(e) => api.current?.zoomBy(e.deltaY * 0.004)}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const k = e.dataTransfer.getData("text/pet-thing");
        if (k) onDropThing?.(k);
      }}
      aria-label="Your pet: tap its head or belly, drag to turn it, drop food or toys on it"
      data-pet-stage
    />
  );
}

export function PetTab() {
  const [d, setD] = React.useState<PetData | null>(null);
  const [kind, setKind] = React.useState("cat");
  const [name, setName] = React.useState("");
  const [roam, setRoam] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [adopting, setAdopting] = React.useState(false);
  const stage = React.useRef<PetStageApi | null>(null);
  const load = React.useCallback(async () => {
    const r = await F.petAction();
    if (r.ok) setD(r.data as PetData);
    else toast.error(r.error);
  }, []);
  React.useEffect(() => {
    void load();
    try {
      setRoam(localStorage.getItem(ROAM_KEY) === "1");
    } catch {}
    const on = (e: Event) => setD((e as CustomEvent<PetData>).detail);
    window.addEventListener("myseed-pet-changed", on);
    return () => window.removeEventListener("myseed-pet-changed", on);
  }, [load]);
  if (!d) return <p className="py-8 text-center text-sm text-muted-foreground"><Loader2Icon className="inline size-4 animate-spin" /> Loading…</p>;
  if (!d.pet || adopting)
    return (
      <div className="space-y-3" data-fun-adopt>
        <p className="text-sm">Adopt a pet. It grows up with your care and the points your work earns, and gets hungry if you forget it.</p>
        <Stage look={{ kind, stage: 0, skin: null, wear: [], outfit: "none" }} mood={0.8} sleeping={false} className="h-44 rounded-2xl bg-gradient-to-b from-primary/15 to-transparent" key={kind} />
        <div className="grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} aria-pressed={kind === k.key} className={cn("flex flex-col items-center rounded-lg border p-2", kind === k.key && "border-primary bg-primary/10")}>
              {React.createElement(PET_ICONS[k.key]!, { className: "size-6" })}
              <span className="mt-1 text-[11px]">{k.label}</span>
            </button>
          ))}
        </div>
        <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); const r = await F.adoptPetAction(kind, name); if (!r.ok) return void toast.error(r.error); setD(r.data as PetData); setAdopting(false); setName(""); toast.success("Welcome home!"); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name" aria-label="Pet's name" className="h-9" maxLength={30} />
          <Button type="submit">Adopt</Button>
          {adopting && <Button type="button" variant="ghost" onClick={() => setAdopting(false)}>Back</Button>}
        </form>
        {adopting && <p className="text-[11px] text-muted-foreground">{d.pet?.name} will rest in the kennel (its needs pause) while the new one is out.</p>}
      </div>
    );
  const p = d.pet;
  const line = SAY[p.mood]?.[new Date().getMinutes() % 3] ?? "";
  const foods = CATALOG.filter((i) => i.kind === "petfood");
  const toys = CATALOG.filter((i) => i.kind === "pettoy");
  const have = (k: string) => d.things.find((t) => t.key === k)?.qty ?? 0;
  const act = (a: Parameters<typeof F.carePetAction>[0], arg?: string) => care(a, arg, stage.current, setD);
  const onThing = (k: string) => (k.startsWith("food.") || k === "kibble" ? void act("feed", k) : k.startsWith("toy.") ? void act("play", k) : k === "water" ? void act("water") : undefined);
  const nextAt = p.nextXp;
  const prevAt = [0, 100, 300, 700][p.stageIndex] ?? 0;
  const thing = (k: string, label: string, n: number | null, Icon: React.ComponentType<{ className?: string }>) => (
    <button key={k} type="button" draggable onDragStart={(e) => e.dataTransfer.setData("text/pet-thing", k)} onClick={() => onThing(k)} disabled={n === 0} className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 text-xs disabled:opacity-40" title="Drag onto your pet, or tap" data-pet-thing={k}>
      <Icon className="size-3.5" /> {label}{n !== null ? ` (${n})` : ""}
    </button>
  );
  return (
    <div className="space-y-3" data-fun-pet={p.mood}>
      <div className="relative rounded-2xl bg-gradient-to-b from-primary/15 to-transparent px-3 pt-3 pb-2">
        <p className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background px-3 py-1 text-xs shadow-xs">{line}</p>
        <Stage look={lookOf(p)} mood={moodOf(p)} sleeping={p.sleeping} onReady={(s) => (stage.current = s)} onTouch={(w) => void act("pet", w === "belly" ? "belly" : w === "head" ? "head" : "chin")} onDropThing={onThing} className="h-56" />
        <div className="flex items-center justify-center gap-2">
          {renaming ? (
            <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("n") as string; await act("rename", v); setRenaming(false); }}>
              <Input name="n" defaultValue={p.name} className="h-7 w-32" maxLength={30} aria-label="New name" autoFocus />
              <Button size="xs" type="submit">Save</Button>
            </form>
          ) : (
            <p className="text-base font-semibold">{p.name} <button type="button" aria-label="Rename" onClick={() => setRenaming(true)}><PencilIcon className="inline size-3 text-muted-foreground" /></button></p>
          )}
        </div>
        <p className="text-center text-xs text-muted-foreground">{p.stageLabel} · {p.xp} care points{p.streak ? ` · ${p.streak}-day streak` : ""} · level {d.level.level} · {d.points.balance} coins</p>
        {nextAt !== null && (
          <div className="mx-auto mt-1 h-1.5 w-48 overflow-hidden rounded-full bg-muted" title={`${nextAt - p.xp} care points to ${STAGES[p.stageIndex + 1]}`}>
            <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(((p.xp - prevAt) / Math.max(1, nextAt - prevAt)) * 100)}%` }} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Bar label="Full" value={p.full} tone="bg-[#F9AB00]" />
        <Bar label="Fun" value={p.fun} tone="bg-[#1a73e8]" />
        <Bar label="Love" value={p.love} tone="bg-[#d6336c]" />
        <Bar label="Clean" value={p.clean} tone="bg-[#06b6d4]" />
        <Bar label="Energy" value={p.energy} tone="bg-[#8b5cf6]" />
        <Bar label="Health" value={p.health} tone="bg-[#188038]" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" size="sm" onClick={() => void act("feed")} title={`A bowl costs ${d.feedCost} points`} data-pet-feed><CookieIcon /> Feed{d.feedCost ? ` (${d.feedCost})` : ""}</Button>
        <Button variant="outline" size="sm" onClick={() => void act("play")}><VolleyballIcon /> Play</Button>
        <Button variant="outline" size="sm" onClick={() => void act("pet", "head")}><HandHeartIcon /> Pet</Button>
        <Button variant="outline" size="sm" onClick={() => void act("bath")}><BathIcon /> Bath</Button>
        <Button variant="outline" size="sm" onClick={() => void act("water")}><DropletsIcon /> Water</Button>
        <Button variant="outline" size="sm" onClick={() => void act(p.sleeping ? "wake" : "sleep")}>{p.sleeping ? <SunIcon /> : <MoonIcon />} {p.sleeping ? "Wake" : "Sleep"}</Button>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium">Treats and toys (drag onto {p.name})</p>
        <div className="flex flex-wrap gap-1">
          {thing("kibble", "Food bowl", null, CookieIcon)}
          {thing("water", "Water", null, DropletsIcon)}
          {foods.map((f) => thing(f.key, f.label, have(f.key), CookieIcon))}
          {toys.filter((t) => have(t.key)).map((t) => thing(t.key, t.label, null, VolleyballIcon))}
        </div>
        {d.shop && <p className="mt-1 text-[11px] text-muted-foreground">More treats, toys, collars and coats at Paws &amp; Treats in Seed Town.</p>}
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium"><SparklesIcon className="size-3.5" /> Things to wear</p>
        <div className="flex flex-wrap gap-1">
          {ITEMS.map((i) => {
            const locked = i.level > d.level.level;
            return (
              <button key={i.key} type="button" disabled={locked} onClick={() => void act("outfit", i.key)} title={locked ? `Unlocks at level ${i.level}` : i.label} className={cn("rounded-full border px-2 py-0.5 text-xs", p.outfit === i.key && "border-primary bg-primary/10", locked && "opacity-40")}>
                {i.label}{locked ? ` · L${i.level}` : ""}
              </button>
            );
          })}
          {CATALOG.filter((i) => i.kind === "petwear" && have(i.key)).map((i) => {
            const on = p.wear.includes(i.key);
            return <button key={i.key} type="button" onClick={() => void act("wear", (on ? p.wear.filter((w) => w !== i.key) : [...p.wear, i.key].slice(-3)).join(","))} className={cn("rounded-full border px-2 py-0.5 text-xs", on && "border-primary bg-primary/10")}>{i.label}</button>;
          })}
          {CATALOG.filter((i) => i.kind === "petskin" && have(i.key)).map((i) => (
            <button key={i.key} type="button" onClick={() => void act("skin", p.skin === i.key ? "" : i.key)} className={cn("rounded-full border px-2 py-0.5 text-xs", p.skin === i.key && "border-primary bg-primary/10")}>{i.label}</button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1 rounded-lg border p-2 text-xs" data-pet-kennel>
        <span className="font-medium">Your pets</span>
        <span className="rounded-full border border-primary bg-primary/10 px-2 py-0.5">{p.name} (out)</span>
        {(d.others ?? []).map((o) => (
          <button key={o.id} type="button" onClick={async () => { const r = await F.switchPetAction(o.id); if (!r.ok) return void toast.error(r.error); setD(r.data as PetData); window.dispatchEvent(new CustomEvent("myseed-pet-changed", { detail: r.data })); toast.success(`${o.name} is out to play`); }} className="rounded-full border px-2 py-0.5 hover:bg-muted" data-pet-switch={o.name}>
            {o.name} · {o.stage}
          </button>
        ))}
        {(d.others?.length ?? 0) + 1 < (d.slots ?? 3) && <Button size="xs" variant="ghost" onClick={() => setAdopting(true)} data-pet-adopt-more>Adopt another</Button>}
      </div>
      <label className="flex items-center justify-between rounded-lg border p-2 text-xs">
        Let {p.name} roam the screen (drag it anywhere; tap it for care)
        <Switch checked={roam} onCheckedChange={(v) => { setRoam(v); try { localStorage.setItem(ROAM_KEY, v ? "1" : "0"); } catch {} window.dispatchEvent(new CustomEvent(ROAM_EVENT, { detail: v })); }} aria-label="Roam the screen" data-pet-roam />
      </label>
      {p.log.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">{p.name}&apos;s diary</summary>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {p.log.slice(0, 10).map((l, i) => <li key={i}>{new Date(l.at).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })}: {l.what}</li>)}
          </ul>
        </details>
      )}
      <p className="text-[11px] text-muted-foreground">Care when it needs it (hungry, bored, dirty) earns care points that grow it up; work points lift its mood.</p>
    </div>
  );
}
