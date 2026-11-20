"use client";

import * as React from "react";
import { CookieIcon, EyeOffIcon, HandHeartIcon, MoonIcon, PawPrintIcon, SunIcon, VolleyballIcon } from "lucide-react";
import * as F from "@/app/actions/fun";
import { cn } from "@/lib/utils";
import { petStage, setAction, type PetStageApi } from "./pet3d";
import { ROAM_EVENT, ROAM_KEY, care, lookOf, moodOf, type PetData } from "./pet";

// The pet out on the screen: a small 3D pet that strolls along the bottom of the page on its own, follows the
// pointer with its eyes, can be dragged anywhere, takes food and toys dropped on it, and opens a little care menu
// when tapped. Switched on from the Pet tab; remembers where it was left.

const POS = "myseed.pet.pos";

export function RoamingPet() {
  const [on, setOn] = React.useState(false);
  const [d, setD] = React.useState<PetData | null>(null);
  const [pos, setPos] = React.useState({ x: 0, y: 0 });
  const [menu, setMenu] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const stage = React.useRef<PetStageApi | null>(null);
  const drag = React.useRef<{ dx: number; dy: number; moved: boolean; sx: number; sy: number } | null>(null);
  const walk = React.useRef<{ to: number; until: number } | null>(null);

  React.useEffect(() => {
    try {
      setOn(localStorage.getItem(ROAM_KEY) === "1");
      const p = JSON.parse(localStorage.getItem(POS) ?? "null") as { x: number; y: number } | null;
      setPos(p ?? { x: window.innerWidth - 220, y: window.innerHeight - 190 });
    } catch {
      setPos({ x: window.innerWidth - 220, y: window.innerHeight - 190 });
    }
    const t = (e: Event) => setOn(!!(e as CustomEvent<boolean>).detail);
    const changed = (e: Event) => setD((e as CustomEvent<PetData>).detail);
    window.addEventListener(ROAM_EVENT, t);
    window.addEventListener("myseed-pet-changed", changed);
    return () => (window.removeEventListener(ROAM_EVENT, t), window.removeEventListener("myseed-pet-changed", changed));
  }, []);
  React.useEffect(() => {
    if (!on) return;
    const load = () => void F.petAction().then((r) => r.ok && setD(r.data as PetData));
    load();
    const t = window.setInterval(load, 180_000);
    return () => window.clearInterval(t);
  }, [on]);
  const pet = d?.pet ?? null;
  const ready = on && !!pet;
  React.useEffect(() => {
    const el = box.current;
    if (!ready || !el || !pet) return;
    const s = petStage(el, lookOf(pet), { transparent: true, zoom: 3.6 });
    stage.current = s;
    const move = (e: PointerEvent) => s.lookAt(e.clientX, e.clientY);
    window.addEventListener("pointermove", move);
    return () => {
      window.removeEventListener("pointermove", move);
      s.dispose();
      stage.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  React.useEffect(() => {
    if (pet && stage.current) (stage.current.restyle(lookOf(pet)), stage.current.setMood(moodOf(pet), pet.sleeping));
  }, [pet]);
  // A stroll now and then (not while asleep, dragged or with the menu open).
  React.useEffect(() => {
    if (!ready) return;
    const t = window.setInterval(() => {
      const s = stage.current;
      if (!s || drag.current || menu || pet?.sleeping) return;
      const w = walk.current;
      if (w && performance.now() < w.until) {
        setPos((p) => {
          const step = Math.sign(w.to - p.x) * 2.2;
          if (Math.abs(w.to - p.x) < 3) return p;
          s.pet.root.rotation.y = step > 0 ? Math.PI / 2 : -Math.PI / 2;
          return { ...p, x: p.x + step };
        });
        if (s.pet.action !== "walk") setAction(s.pet, "walk");
      } else {
        if (s.pet.action === "walk") ((s.pet.action = "idle"), (s.pet.root.rotation.y = 0));
        if (Math.random() < 0.02) walk.current = { to: Math.max(10, Math.min(window.innerWidth - 170, (pos.x ?? 0) + (Math.random() - 0.5) * 500)), until: performance.now() + 6000 };
      }
    }, 33);
    return () => window.clearInterval(t);
  }, [ready, menu, pet?.sleeping, pos.x]);
  if (!ready || !pet) return null;
  const act = (a: Parameters<typeof F.carePetAction>[0], arg?: string) => (setMenu(false), void care(a, arg, stage.current, setD));
  return (
    <div
      className="fixed z-[65] select-none no-print"
      style={{ left: Math.max(0, Math.min(pos.x, (typeof window !== "undefined" ? window.innerWidth : 1200) - 160)), top: Math.max(0, Math.min(pos.y, (typeof window !== "undefined" ? window.innerHeight : 800) - 160)) }}
      data-pet-roaming
    >
      <div
        ref={box}
        className="size-40 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, moved: false, sx: e.clientX, sy: e.clientY };
          walk.current = null;
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          if (Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 5) g.moved = true;
          if (g.moved) setPos({ x: e.clientX - g.dx, y: e.clientY - g.dy });
        }}
        onPointerUp={(e) => {
          const g = drag.current;
          drag.current = null;
          if (!g) return;
          if (g.moved) {
            try {
              localStorage.setItem(POS, JSON.stringify({ x: e.clientX - g.dx, y: e.clientY - g.dy }));
            } catch {}
            if (stage.current) setAction(stage.current.pet, "happy");
            return;
          }
          const w = stage.current?.hit(e.clientX, e.clientY);
          if (w === "head" || w === "belly") act("pet", w);
          else setMenu(!menu);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const k = e.dataTransfer.getData("text/pet-thing");
          if (k.startsWith("food.") || k === "kibble") act("feed", k);
          else if (k.startsWith("toy.")) act("play", k);
          else if (k === "water") act("water");
        }}
        aria-label={`${pet.name}: drag to move, tap for care`}
        role="button"
      />
      {menu && (
        <div className="absolute -top-2 left-1/2 flex -translate-x-1/2 -translate-y-full gap-1 rounded-full border bg-background/95 p-1 shadow-lg" data-pet-menu>
          {([["feed", CookieIcon, "Feed"], ["play", VolleyballIcon, "Play"], ["pet", HandHeartIcon, "Pet"], [pet.sleeping ? "wake" : "sleep", pet.sleeping ? SunIcon : MoonIcon, pet.sleeping ? "Wake" : "Sleep"]] as const).map(([a, Icon, label]) => (
            <button key={a} type="button" title={label} aria-label={label} onClick={() => act(a as Parameters<typeof F.carePetAction>[0], a === "pet" ? "head" : undefined)} className="rounded-full p-1.5 hover:bg-muted"><Icon className="size-4" /></button>
          ))}
          <button type="button" title="Open the Pet tab" aria-label="Open the Pet tab" onClick={() => (setMenu(false), window.dispatchEvent(new CustomEvent("myseed-fun", { detail: { open: "pet" } })))} className="rounded-full p-1.5 hover:bg-muted"><PawPrintIcon className="size-4" /></button>
          <button type="button" title="Send it home" aria-label="Send it home" onClick={() => { setOn(false); try { localStorage.setItem(ROAM_KEY, "0"); } catch {} window.dispatchEvent(new CustomEvent(ROAM_EVENT, { detail: false })); }} className="rounded-full p-1.5 hover:bg-muted"><EyeOffIcon className="size-4" /></button>
        </div>
      )}
      <p className={cn("pointer-events-none -mt-3 text-center text-[11px] font-semibold drop-shadow", pet.sleeping && "opacity-60")}>{pet.name}</p>
    </div>
  );
}
