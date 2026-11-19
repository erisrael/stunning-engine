"use client";

import * as React from "react";
import { toast } from "sonner";
import { CookieIcon, HandHeartIcon, Loader2Icon, SparklesIcon, VolleyballIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";

// The pet grows with the points work earns: levels unlock things to wear, food costs points, and its mood follows
// care and today's work.
const KINDS = [
  { key: "cat", label: "Cat", emoji: "🐱" },
  { key: "dog", label: "Puppy", emoji: "🐶" },
  { key: "fox", label: "Fox", emoji: "🦊" },
  { key: "panda", label: "Panda", emoji: "🐼" },
  { key: "dragon", label: "Dragon", emoji: "🐲" },
  { key: "robot", label: "Robot", emoji: "🤖" },
  { key: "owl", label: "Owl", emoji: "🦉" },
  { key: "bunny", label: "Bunny", emoji: "🐰" },
];
const ITEMS = [
  { key: "none", label: "Nothing", emoji: "", level: 1 },
  { key: "bow", label: "Bow", emoji: "🎀", level: 2 },
  { key: "cap", label: "Cap", emoji: "🧢", level: 3 },
  { key: "glasses", label: "Sunglasses", emoji: "🕶️", level: 4 },
  { key: "crown", label: "Crown", emoji: "👑", level: 6 },
  { key: "headphones", label: "Headphones", emoji: "🎧", level: 8 },
  { key: "wizard", label: "Wizard hat", emoji: "🧙", level: 10 },
];

type PetData = {
  pet: { kind: string; name: string; outfit: string; since: string; hunger: number; fun: number; love: number; happiness: number; mood: string } | null;
  points: { balance: number; earned: number; today: number };
  level: { level: number; into: number; need: number };
  feedCost: number;
};

const SAY: Record<string, string[]> = {
  joyful: ["Best day ever!", "You are on fire today!", "Let's keep going!"],
  happy: ["Nice work today.", "I like it here.", "What's next?"],
  okay: ["A snack would be nice…", "Let's finish one more task?", "I'm a little bored."],
  sad: ["I'm hungry…", "I missed you.", "Some work and a treat would cheer me up."],
};

function Bar({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px] text-muted-foreground"><span>{label}</span><span>{value}%</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn("h-full rounded-full transition-all duration-700", tone)} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function PetTab() {
  const [d, setD] = React.useState<PetData | null>(null);
  const [kind, setKind] = React.useState("cat");
  const [name, setName] = React.useState("");
  const [fx, setFx] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    const r = await F.petAction();
    if (r.ok) setD(r.data as PetData);
    else toast.error(r.error);
  }, []);
  React.useEffect(() => void load(), [load]);
  const act = async (a: "feed" | "play" | "pet" | "outfit", outfit?: string, effect?: string) => {
    const r = await F.carePetAction(a, outfit);
    if (!r.ok) return void toast.error(r.error);
    setD(r.data as PetData);
    if (effect) (setFx(effect), window.setTimeout(() => setFx(null), 1400));
  };
  if (!d) return <p className="py-8 text-center text-sm text-muted-foreground"><Loader2Icon className="inline size-4 animate-spin" /> Loading…</p>;
  if (!d.pet)
    return (
      <div className="space-y-3" data-fun-adopt>
        <p className="text-sm">Adopt a pet. It grows with the points your work earns, and gets hungry if you forget it.</p>
        <div className="grid grid-cols-4 gap-1.5">
          {KINDS.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} aria-pressed={kind === k.key} className={cn("flex flex-col items-center rounded-lg border p-2 text-3xl", kind === k.key && "border-primary bg-primary/10")}>
              {k.emoji}
              <span className="mt-1 text-[11px]">{k.label}</span>
            </button>
          ))}
        </div>
        <form className="flex gap-1" onSubmit={async (e) => { e.preventDefault(); const r = await F.adoptPetAction(kind, name); if (!r.ok) return void toast.error(r.error); setD(r.data as PetData); toast.success("Welcome home!"); }}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Its name" aria-label="Pet's name" className="h-9" maxLength={30} />
          <Button type="submit">Adopt</Button>
        </form>
      </div>
    );
  const p = d.pet;
  const k = KINDS.find((x) => x.key === p.kind) ?? KINDS[0]!;
  const item = ITEMS.find((i) => i.key === p.outfit);
  const line = SAY[p.mood]![new Date().getMinutes() % 3]!;
  return (
    <div className="space-y-3" data-fun-pet={p.mood}>
      <div className="relative flex flex-col items-center rounded-2xl bg-gradient-to-b from-primary/15 to-transparent px-3 pt-5 pb-3">
        <p className="mb-1 rounded-full bg-background px-3 py-1 text-xs shadow-xs">{line}</p>
        <div className={cn("relative text-7xl select-none", p.mood === "joyful" ? "animate-bounce" : p.mood === "sad" ? "opacity-80 grayscale-[.3]" : "motion-safe:animate-[pulse_3s_ease-in-out_infinite]")} aria-label={`${p.name} the ${k.label}, ${p.mood}`}>
          {k.emoji}
          {item?.emoji && <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-4xl">{item.emoji}</span>}
          {fx && <span className="pointer-events-none absolute -top-2 -right-6 animate-ping text-2xl">{fx}</span>}
        </div>
        <p className="mt-2 text-base font-semibold">{p.name}</p>
        <p className="text-xs text-muted-foreground">Level {d.level.level} · {d.points.balance} points to spend</p>
        <div className="mt-1 h-1.5 w-40 overflow-hidden rounded-full bg-muted" title={`${d.level.into} of ${d.level.need} to the next level`}>
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((d.level.into / d.level.need) * 100)}%` }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Bar label="Full" value={100 - p.hunger} tone="bg-[#F9AB00]" />
        <Bar label="Fun" value={p.fun} tone="bg-[#1a73e8]" />
        <Bar label="Love" value={p.love} tone="bg-[#d6336c]" />
        <Bar label="Happy" value={p.happiness} tone="bg-[#188038]" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <Button variant="outline" onClick={() => void act("feed", undefined, "🍖")} title={`Costs ${d.feedCost} points`} data-pet-feed>
          <CookieIcon /> Feed{d.feedCost ? ` (${d.feedCost})` : ""}
        </Button>
        <Button variant="outline" onClick={() => void act("play", undefined, "⚽")}><VolleyballIcon /> Play</Button>
        <Button variant="outline" onClick={() => void act("pet", undefined, "💖")}><HandHeartIcon /> Pet</Button>
      </div>
      <div>
        <p className="mb-1 flex items-center gap-1 text-xs font-medium"><SparklesIcon className="size-3.5" /> Things to wear (unlocked by level)</p>
        <div className="flex flex-wrap gap-1">
          {ITEMS.map((i) => {
            const locked = i.level > d.level.level;
            return (
              <button key={i.key} type="button" disabled={locked} onClick={() => void act("outfit", i.key)} title={locked ? `Unlocks at level ${i.level}` : i.label} className={cn("rounded-full border px-2 py-0.5 text-xs", p.outfit === i.key && "border-primary bg-primary/10", locked && "opacity-40")}>
                {i.emoji || "∅"} {i.label}{locked ? ` · L${i.level}` : ""}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">Your pet is happiest when you work: points earned today lift its mood.</p>
    </div>
  );
}
