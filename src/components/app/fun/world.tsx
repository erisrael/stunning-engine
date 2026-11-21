"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BackpackIcon, CameraIcon, CarIcon, CircleHelpIcon, HandIcon, Maximize2Icon, MessageCircleIcon, MicIcon, MicOffIcon, Minimize2Icon, PaletteIcon, SettingsIcon, SparklesIcon, UsersIcon, XIcon,
  ArrowUpIcon, FootprintsIcon, MapIcon, ShoppingBagIcon, PartyPopperIcon, MusicIcon, LaughIcon, FrownIcon, HandHeartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { F, isGuestActions } from "./actions";
import type { HomeLayout, Look, Ride, Shop } from "@/lib/fun-catalog";
import type { Resident, Status } from "@/server/fun-world";
import type { Hud } from "./world/activities";
import type { NpcDef } from "./world/city";
import { ChatBox, GaragePanel, HomeStudio, InventoryPanel, MapPanel, NpcDialog, Panel, PeoplePanel, SettingsPanel, ShopPanel, VoicePanel } from "./world/panels";
import { Studio, type Wallet } from "./world/studio";
import { autoQuality, DEFAULT_XHAIR, PRESETS, Town, type RaceSync, type ChatMsg, type Gfx, type Room, type TownData, type VoiceState } from "./world/town";
import { useScores } from "./shell";
import { usePlayer } from "./player";
import { useYouTube } from "./youtube";
import { PERSONAS } from "@/lib/focus";
import { NpcConversation } from "./world/npc-dialog";
import { WEATHER_LABEL } from "./world/atmosphere";
import { COMPOUND, GP_CIRCUITS, GP_MODES, GT_CARS, SKILL, fmtLap, type Compound, type Difficulty, type GpCircuit, type GpClass, type GpMode, type RaceState } from "./world/gp";
import { ARCHERY_MODES, BOWS, archeryLevel, type ArcheryMode, type Bow } from "./world/archery";
import { STRIKE_MAPS, STRIKE_MODES, WEAPONS, type StrikeHud, type StrikeMap, type StrikeMode, type WeaponKey } from "./world/strike";
import { AGENTS, AGENT_KEYS, type AgentKey } from "@/lib/strike-agents";
import { ArcadeScreen } from "./world/arcade-screen";
import { FK_LEVELS, fkStars } from "./world/soccer";
import { EmoteWheel } from "./world/emote-wheel";

// Commands to the Fun window (open a tab or a game), without importing it (it imports this file).
const funCommand = (c: { open?: string; game?: string }) => window.dispatchEvent(new CustomEvent("myseed-fun", { detail: c }));

// Seed Town: the office world in 3D. A town with the office tower (three floors, stairs, an elevator, a desk for
// everyone), shops, homes people own and decorate, a park with activities, vehicles and a ring road; anime-style
// characters people design; chat (nearby, town, room) and voice (nearby or rooms) that also work in full screen.
// Walk with WASD or the arrows (Shift runs, Space jumps, C crouches), drag or move the mouse to look, V switches
// first and third person, E does things. Phones get a joystick and buttons.

type Home = NonNullable<Extract<Awaited<ReturnType<typeof F.worldHomeAction>>, { ok: true }>["data"]>;
const STATUS: Record<Status, { label: string; color: string }> = {
  working: { label: "Working", color: "#22c55e" },
  idle: { label: "Idle", color: "#eab308" },
  break: { label: "On a break", color: "#38bdf8" },
  online: { label: "Online", color: "#22c55e" },
  left: { label: "Gone home", color: "#94a3b8" },
  leave: { label: "On leave", color: "#a855f7" },
  absent: { label: "Absent", color: "#ef4444" },
  away: { label: "Away", color: "#94a3b8" },
};
const GFX_KEY = "myseed.world.gfx";
function loadGfx(): Gfx {
  const q = autoQuality();
  const phone = typeof navigator !== "undefined" && (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia("(pointer: coarse)").matches);
  const base: Gfx = { preset: "auto", ...PRESETS[q], ...(phone ? { view: Math.min(PRESETS[q].view, 90), shadows: 0 as const } : {}), sens: 1, invert: false, names: true, sfx: 0.7, music: 0.45, camera: "third", steady: true };
  try {
    const s = JSON.parse(localStorage.getItem(GFX_KEY) ?? "null") as Partial<Gfx> | null;
    if (s) return { ...base, ...s, ...(s.preset === "auto" ? PRESETS[q] : {}) };
  } catch {}
  return base;
}

type PanelState = { kind: string; data?: Record<string, unknown> } | null;

const MODE_LABEL: Record<string, string> = { gp: "Grand Prix", circuit: "Seed Circuit", race: "Street race", archery: "Archery", gallery: "Target gallery", penalty: "Penalties", freekick: "Free kicks", match: "Five-a-side", hoops: "Basketball", fishing: "Fishing", parkour: "Parkour", strike: "Seed Strike" };
// The keys, by what you are doing (the one you are in first).
const CONTROL_SETS: { key: string; label: string; rows: [string, string][] }[] = [
  { key: "walk", label: "On foot", rows: [["Walk", "WASD or arrows"], ["Run", "Shift"], ["Jump", "Space"], ["Crouch", "C"], ["Look", "drag, or the mouse in first person (click locks it)"], ["First or third person", "V"], ["Do things", "E or F"], ["Greet the nearest person", "G"], ["Emote wheel", "hold T, move the mouse, let go"], ["Quick emotes", "1 to 6"], ["Punch / block", "Q / hold X"], ["Map, GPS and waypoints", "M"], ["Your things", "I"], ["Call your car", "R"], ["Chat", "Enter"], ["These controls", "F1"], ["Menu, leave a mode", "Esc"]] },
  { key: "home", label: "At home", rows: [["Cook, eat, take a bath, sleep", "E at the kitchen, table, bathtub, bed"], ["Radio, lamp, lights", "E at the radio, lamp or the switch by the door"], ["Game console", "E at the console; arrows and Enter pick a game, Esc back"], ["Call and pet the dog", "E at its bed"], ["Watch TV", "E in front of the TV"], ["Furnish", "the mailbox outside"]] },
  { key: "drive", label: "Driving", rows: [["Throttle / brake", "W / S"], ["Steer", "A / D"], ["Handbrake", "Space"], ["Gears (manual)", "X up, Z down"], ["Horn", "H"], ["Camera (far chase, near chase, hood, cockpit)", "V"], ["Get in or out", "E"]] },
  { key: "gp", label: "Grand Prix", rows: [["Drive", "as above"], ["Pit lane", "left of the straight, 60 km/h; stop in the first box"], ["Pause, settings, restart, exit", "Esc"]] },
  { key: "strike", label: "Seed Strike and Seed Core", rows: [["Move", "WASD"], ["Walk quietly / crouch / jump", "Shift / Ctrl or C / Space"], ["Fire / aim or scope", "left / right mouse"], ["Reload", "R"], ["Weapons", "1, 2"], ["Abilities (Core)", "Q, E, X"], ["Buy menu (Core)", "B in the buy phase"], ["Plant or defuse (Core)", "hold F"], ["Pause, sensitivity, crosshair, leave", "Esc"]] },
  { key: "penalty", label: "Football", rows: [["Aim", "move the mouse"], ["Shoot", "hold to power up, let go"], ["Curve", "move the mouse sideways after the kick (aftertouch)"], ["On the pitch", "walk into the ball or E to kick, Shift for a hard one"], ["Pause and exit", "Esc"]] },
  { key: "archery", label: "Archery and the gallery", rows: [["Aim", "the mouse"], ["Draw and loose", "hold and let go"], ["Pause and exit", "Esc"]] },
];
function Controls({ first, only }: { first: string; only?: boolean }) {
  const k = first === "core" ? "strike" : first === "circuit" || first === "race" ? "drive" : first === "gallery" ? "archery" : first;
  const sets = [...CONTROL_SETS].sort((a, b) => (a.key === k ? -1 : b.key === k ? 1 : 0)).filter((s) => !only || s.key === k || (k === "gp" && s.key === "drive"));
  return (
    <div className="space-y-2 text-xs" data-world-controls>
      {sets.map((s) => (
        <div key={s.key}>
          <p className="font-medium">{s.label}</p>
          <table className="w-full">
            <tbody>
              {s.rows.map(([a, b]) => (
                <tr key={a} className="border-t border-border/50">
                  <td className="py-0.5 pr-2 text-muted-foreground">{a}</td>
                  <td className="py-0.5 font-mono text-[11px]">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">Phones: the joystick on the left, buttons on the right, drag to look. Gamepad: left stick walks, right stick looks, A jumps, X does things, Y switches the camera.</p>
    </div>
  );
}

// Seed Core's agent select: every agent as a card, the chosen one's powers in full, and a lock-in (the clock
// locks the chosen one in at zero).
function AgentSelect({ initial, onLock, onCancel }: { initial: AgentKey; onLock: (a: AgentKey) => void; onCancel: () => void }) {
  const [sel, setSel] = React.useState<AgentKey>(initial);
  const [left, setLeft] = React.useState(30);
  const selRef = React.useRef(sel);
  selRef.current = sel;
  React.useEffect(() => {
    const id = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(id);
  }, []);
  React.useEffect(() => {
    if (left <= 0) onLock(selRef.current);
  }, [left, onLock]);
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const i = AGENT_KEYS.indexOf(selRef.current);
      if (e.key === "ArrowRight" || e.key === "d") setSel(AGENT_KEYS[(i + 1) % AGENT_KEYS.length]!);
      else if (e.key === "ArrowLeft" || e.key === "a") setSel(AGENT_KEYS[(i + AGENT_KEYS.length - 1) % AGENT_KEYS.length]!);
      else if (e.key === "Enter") onLock(selRef.current);
      else if (e.key === "Escape") onCancel();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [onLock, onCancel]);
  const a = AGENTS[sel];
  return (
    <div className="absolute inset-0 z-40 flex flex-col bg-[#0b0f17]/95 p-3 text-white sm:p-6" data-core-select>
      <div className="flex items-center justify-between">
        <p className="text-xs tracking-[0.3em] text-white/60">SEED CORE · CHOOSE YOUR AGENT</p>
        <p className={cn("text-2xl font-bold tabular-nums", left <= 5 && "text-red-400")}>{Math.max(0, left)}</p>
      </div>
      <div className="mt-2 flex min-h-0 flex-1 flex-col gap-4 sm:flex-row">
        <div className="relative flex flex-1 flex-col justify-end overflow-hidden rounded-xl p-4" style={{ background: `radial-gradient(circle at 60% 30%, ${a.color}66, transparent 60%), linear-gradient(160deg, ${a.color}33, #0b0f17 70%)` }}>
          <span className="pointer-events-none absolute -top-6 right-2 text-[10rem] leading-none font-black opacity-15 select-none sm:text-[16rem]" style={{ color: a.color }}>{a.name[0]}</span>
          <p className="text-xs tracking-widest" style={{ color: a.color }}>{a.role.toUpperCase()}</p>
          <p className="text-4xl font-black tracking-wide sm:text-6xl">{a.name.toUpperCase()}</p>
          <p className="mt-1 max-w-md text-sm text-white/80">{a.bio}</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([["Q", a.q], ["E", a.e], ["X", a.x]] as const).map(([slot, ab]) => (
              <div key={slot} className="rounded-lg border border-white/15 bg-black/40 p-2 text-xs">
                <p className="flex items-center gap-1 font-bold"><span className="rounded bg-white px-1 text-black">{slot}</span>{ab.name}</p>
                <p className="mt-0.5 text-white/70">{ab.note}</p>
                <p className="mt-0.5 text-[10px] text-white/50">{slot === "X" ? `Ultimate: ${(ab as typeof a.x).points} points` : `${ab.charges} charge${ab.charges > 1 ? "s" : ""}${ab.cost ? `, ${ab.cost} credits` : ", free each round"}`}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:w-72">
          <div className="grid grid-cols-3 gap-2">
            {AGENT_KEYS.map((k) => {
              const g = AGENTS[k];
              return (
                <button key={k} type="button" onClick={() => setSel(k)} onDoubleClick={() => onLock(k)} className={cn("flex aspect-square flex-col items-center justify-center rounded-lg border-2 text-xs font-bold transition-transform", sel === k ? "scale-105 border-white" : "border-white/10 hover:border-white/40")} style={{ background: `linear-gradient(150deg, ${g.color}cc, ${g.color}33)` }} data-core-select-agent={k}>
                  <span className="text-2xl font-black">{g.name[0]}</span>
                  {g.name}
                  <span className="text-[9px] font-normal text-white/80">{g.role}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-white/50">Arrows to browse, Enter to lock in, Esc to go back. Bots fill the other places on both teams.</p>
          <Button size="lg" className="mt-auto w-full text-lg font-black tracking-widest" style={{ background: a.color }} onClick={() => onLock(sel)} data-core-lockin>LOCK IN</Button>
          <Button variant="ghost" className="text-white" onClick={onCancel}>Back</Button>
        </div>
      </div>
    </div>
  );
}

// Seed Strike's crosshair: four lines with a gap and an optional centre dot and outline (the usual tactical
// shooter style). The gap opens while running, jumping or spraying; it flashes red on a hit.
function Crosshair({ x, bloom, hit }: { x: import("./world/town").Crosshair; bloom: number; hit: boolean }) {
  const gap = x.gap + (x.moveError ? bloom * 16 : 0);
  const color = hit ? "#ff3b3b" : x.color;
  const line = (style: React.CSSProperties, key: string) => <span key={key} className="absolute" style={{ background: color, boxShadow: x.outline ? "0 0 0 1px #000" : undefined, ...style }} />;
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 size-0" data-strike-crosshair>
      {x.len > 0 && [
        line({ width: x.thick, height: x.len, left: -x.thick / 2, top: -gap - x.len }, "t"),
        line({ width: x.thick, height: x.len, left: -x.thick / 2, top: gap }, "b"),
        line({ height: x.thick, width: x.len, top: -x.thick / 2, left: -gap - x.len }, "l"),
        line({ height: x.thick, width: x.len, top: -x.thick / 2, left: gap }, "r"),
      ]}
      {x.dot && line({ width: x.thick, height: x.thick, left: -x.thick / 2, top: -x.thick / 2 }, "d")}
    </div>
  );
}

// The Windows app (desktop/): its launcher's graphics settings, and live numbers for the overlay.
type DesktopApi = { desktop: true; getSettings: () => Promise<{ settings: { graphics: { quality: Gfx["quality"]; renderScale: number; shadows: 0 | 1 | 2; view: number; fps: 0 | 30 | 60 }; showFps: boolean } }>; perf: () => Promise<{ cpu: number; memoryMb: number; gpu: number | null }> };
const desktopApi = () => (typeof window !== "undefined" ? ((window as unknown as { seedDesktop?: DesktopApi }).seedDesktop ?? null) : null);

// Frame rate, draw calls, triangles, the GPU and memory (F3; on by default in the Windows app).
function PerfOverlay({ town }: { town: React.RefObject<Town | null> }) {
  const [s, setS] = React.useState<{ fps: number; calls: number; tris: number; gpu: string; heap: number | null; app: { cpu: number; memoryMb: number; gpu: number | null } | null } | null>(null);
  React.useEffect(() => {
    let frames = 0, raf = 0, last = performance.now();
    const tick = () => {
      frames++;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const id = window.setInterval(async () => {
      const now = performance.now();
      const fps = Math.round((frames * 1000) / (now - last));
      frames = 0;
      last = now;
      const t = town.current as unknown as { renderer?: THREE_Renderer } | null;
      const r = t?.renderer;
      let calls = 0, tris = 0, gpu = "";
      if (r) {
        r.info.autoReset = false;
        r.info.reset();
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        calls = r.info.render.calls;
        tris = r.info.render.triangles;
        r.info.autoReset = true;
        const gl = r.getContext();
        const ext = gl.getExtension("WEBGL_debug_renderer_info");
        gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      }
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      const app = desktopApi() ? await desktopApi()!.perf().catch(() => null) : null;
      setS({ fps, calls, tris, gpu: gpu.replace(/^ANGLE \(|\)$/g, "").slice(0, 70), heap: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null, app });
    }, 1000);
    return () => (cancelAnimationFrame(raf), window.clearInterval(id));
  }, [town]);
  if (!s) return null;
  return (
    <div className="pointer-events-none absolute top-14 left-3 z-20 rounded-md bg-black/70 px-2 py-1 font-mono text-[10px] leading-tight text-[#a7f3d0]" data-world-perf>
      <p className="text-sm font-bold text-white">{s.fps} fps</p>
      <p>{s.calls} draws · {(s.tris / 1000).toFixed(0)}k tris</p>
      {s.heap !== null && <p>JS heap {s.heap} MB</p>}
      {s.app && <p>app CPU {s.app.cpu}% · RAM {s.app.memoryMb} MB{s.app.gpu !== null ? " · GPU process " + s.app.gpu + "%" : ""}</p>}
      <p className="max-w-56 truncate text-white/60">{s.gpu}</p>
    </div>
  );
}
type THREE_Renderer = { info: { autoReset: boolean; reset: () => void; render: { calls: number; triangles: number } }; getContext: () => WebGLRenderingContext };

export function SeedTown({ big = false, fill = false }: { big?: boolean; fill?: boolean }) {
  // The guest arcade: no account, nothing online, no links into Myseed.
  const guest = React.useMemo(() => isGuestActions(), []);
  const box = React.useRef<HTMLDivElement>(null);
  const shell = React.useRef<HTMLDivElement>(null);
  const town = React.useRef<Town | null>(null);
  const [home, setHome] = React.useState<Home | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [gfx, setGfx] = React.useState<Gfx | null>(null);
  const [build, setBuild] = React.useState(0);
  // Where I was when the town is rebuilt (graphics settings), so I carry on from there.
  const keepPos = React.useRef<{ x: number; y: number; z: number; h: number } | null>(null);
  const [panel, setPanel] = React.useState<PanelState>(null);
  const [card, setCard] = React.useState<Resident | null>(null);
  const [npc, setNpc] = React.useState<NpcDef | null>(null);
  const [prompt, setPrompt] = React.useState<{ label: string; key: string } | null>(null);
  const [hud, setHud] = React.useState<Hud | null>(null);
  const [where, setWhere] = React.useState("");
  const [online, setOnline] = React.useState<{ n: number; people: { id: string; name: string; voice: string; muted: boolean; x: number; z: number }[] }>({ n: 1, people: [] });
  const [messages, setMessages] = React.useState<ChatMsg[]>([]);
  const [chatOpen, setChatOpen] = React.useState(true);
  const [channel, setChannel] = React.useState<"near" | "town" | "room">("near");
  const [chatFocus, setChatFocus] = React.useState(0);
  const [rooms, setRooms] = React.useState<{ rooms: Room[]; me: VoiceState }>({ rooms: [], me: { mode: "off", room: null, muted: false } });
  const [speaking, setSpeaking] = React.useState<Set<string>>(new Set());
  const [volumes, setVolumes] = React.useState<Record<string, number>>({});
  const [speed, setSpeed] = React.useState<number | null>(null);
  const [gauge, setGauge] = React.useState<{ rpm: number; redline: number; gear: number; condition: number; manual: boolean } | null>(null);
  const [race, setRace] = React.useState<RaceState | null>(null);
  const [arch, setArch] = React.useState<{ mode: ArcheryMode; bow: Bow }>({ mode: "classic", bow: "training" });
  const [strike, setStrike] = React.useState<StrikeHud | null>(null);
  const [lobby, setLobby] = React.useState<{ open: { id: string; mode: string; map: string; n: number; max: number }[] } | null>(null);
  const [sk, setSk] = React.useState<{ mode: StrikeMode; map: StrikeMap; bots: number; difficulty: "easy" | "normal" | "hard"; primary: WeaponKey; code: string; agent: AgentKey }>({ mode: "core", map: "warehouse", bots: 5, difficulty: "normal", primary: "rifle", code: "", agent: "vesper" });
  const [board, setBoard] = React.useState(false);
  const [arcadeGame, setArcadeGame] = React.useState<string | null>(null);
  const [sleeping, setSleeping] = React.useState(false);
  const [agentSelect, setAgentSelect] = React.useState(false);
  const [raceLobby, setRaceLobby] = React.useState<RaceSync | null>(null);
  const [fight, setFight] = React.useState<{ me: number; foe: { name: string; hp: number } | null; block: boolean } | null>(null);
  React.useEffect(() => {
    if (!sleeping) return;
    const id = setTimeout(() => (setSleeping(false), town.current?.wake()), 4200);
    return () => clearTimeout(id);
  }, [sleeping]);
  const [nav, setNav] = React.useState<{ label: string; dist: number } | null>(null);
  // Graphics chosen in a match's pause menu: the town is rebuilt with them when the match ends.
  const [rebuildAfter, setRebuildAfter] = React.useState(false);
  const wheelOn = React.useCallback(() => !!town.current && !town.current.blockInput && !town.current.inFps, []);
  const wheelPick = React.useCallback((k: string) => (k === "firework" ? town.current?.firework() : town.current?.doEmote(k)), []);
  // While a cabinet's game is open the town leaves the keyboard alone (arrows play Snake, not walk).
  React.useEffect(() => {
    if (town.current) town.current.blockInput = !!arcadeGame;
  }, [arcadeGame]);
  // Tab holds the Strike scoreboard open.
  const inStrike = !!strike;
  React.useEffect(() => {
    if (!inStrike) return;
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      setBoard(e.type === "keydown");
    };
    window.addEventListener("keydown", k);
    window.addEventListener("keyup", k);
    return () => {
      window.removeEventListener("keydown", k);
      window.removeEventListener("keyup", k);
    };
  }, [inStrike]);
  const [gpSetup, setGpSetup] = React.useState<{ mode: GpMode; difficulty: Difficulty; opponents: number; compound: Compound; circuit: GpCircuit; cars: GpClass; myCar: string }>({ mode: "sprint", difficulty: "amateur", opponents: 7, compound: "medium", circuit: "park", cars: "f2", myCar: "p930" });
  const [gems, setGems] = React.useState(0);
  const [cam, setCam] = React.useState<"third" | "first">("third");
  const [driving, setDriving] = React.useState(false);
  const [sitting, setSitting] = React.useState(false);
  const [full, setFull] = React.useState(false);
  const [wallet, setWallet] = React.useState<Wallet | null>(null);
  const [coins, setCoins] = React.useState(0);
  const [muted, setMuted] = React.useState<Set<string>>(new Set());
  const [blocked, setBlocked] = React.useState<Set<string>>(new Set());
  const [emotes, setEmotes] = React.useState(false);
  const [touch, setTouch] = React.useState(false);
  const mini = React.useRef<HTMLCanvasElement>(null);
  const { report } = useScores("world");
  const lookRef = React.useRef<Look | null>(null);
  // Town music steps back while the Fun player plays or a voice chat is on.
  const player = usePlayer();
  const yt = useYouTube();
  React.useEffect(() => town.current?.sound.setDuck(!!player?.playing || rooms.me.mode !== "off"), [player?.playing, rooms.me.mode]);

  const [perf, setPerf] = React.useState(false);
  React.useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "F3" && (e.preventDefault(), setPerf((p) => !p));
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);
  React.useEffect(() => {
    const d = desktopApi();
    // The Windows app: its launcher decides the graphics (higher levels than a browser tab), and shows the overlay.
    if (d)
      void d.getSettings().then(({ settings }) => {
        const g = settings.graphics;
        setGfx({ ...loadGfx(), preset: "custom", quality: g.quality, ratio: g.renderScale, shadows: g.shadows, view: g.view, fps: g.fps, aa: true, effects: true });
        setPerf(settings.showFps);
      });
    else setGfx(loadGfx());
    const coarse = matchMedia("(pointer: coarse)").matches;
    setTouch(coarse);
    // Phones: the chat starts folded so the controls have room.
    if (coarse) setChatOpen(false);
    try {
      setMuted(new Set(JSON.parse(localStorage.getItem("myseed.world.muted") ?? "[]")));
      setBlocked(new Set(JSON.parse(localStorage.getItem("myseed.world.blocked") ?? "[]")));
    } catch {}
    void F.worldHomeAction().then((r) => {
      if (!r.ok || !r.data) return setError(r.ok ? "Seed Town is not available." : (r.error ?? "Could not open Seed Town."));
      setHome(r.data);
      setWallet((r.data.wallet as Wallet | null) ?? null);
      setCoins(r.data.coins);
    });
  }, []);

  // The town itself: built once the data is in, rebuilt when graphics settings need a new renderer.
  React.useEffect(() => {
    const el = box.current;
    if (!el || !home || !gfx) return;
    const me = home.residents.find((r) => r.me);
    const data: TownData = {
      look: lookRef.current ?? home.look,
      name: home.name,
      chat: home.chat,
      voice: home.voice,
      shop: home.shop,
      residents: home.residents,
      departments: home.departments,
      homes: home.homes,
      items: home.items,
      ride: home.ride,
      layout: home.layout,
      meId: me?.id ?? "me",
      seesAbsence: home.seesAbsence,
      iceServers: home.iceServers as RTCIceServer[],
      offline: guest,
    };
    let t: Town;
    try {
      t = new Town(el, data, gfx, {
        prompt: setPrompt,
        hud: setHud,
        where: setWhere,
        online: (n, people) => setOnline({ n, people }),
        chat: (m) => setMessages([...m]),
        rooms: (r, me2) => setRooms({ rooms: [...r], me: { ...me2 } }),
        speaking: (s) => setSpeaking(new Set(s)),
        open: (kind, d) => {
          if (kind === "close") return setPanel(null), setNpc(null), setCard(null);
          if (kind === "chat-focus") return setChatFocus((x) => x + 1);
          // A cabinet in Seed Arcade: its game on the cabinet's screen, over the town.
          if (kind === "arcade") return setArcadeGame(String(d?.game ?? "snake"));
          if (kind === "sleep") return setSleeping(true);
          // A menu ends a conversation (its box would cover the menu's lower half).
          setNpc(null);
          setPanel({ kind, data: d });
        },
        toast: (text, kind) => (kind === "err" ? toast.error(text) : kind === "ok" ? toast.success(text) : toast(text)),
        speed: setSpeed,
        nav: setNav,
        gauge: setGauge,
        fight: setFight,
        raceLobby: setRaceLobby,
        race: setRace,
        strike: setStrike,
        strikeLobby: setLobby,
        card: setCard,
        npc: setNpc,
        // A task someone gave me is done (I am at its place): the server checks and pays.
        quest: (npcId, q) => {
          void F.npcQuestDoneAction(npcId, { x: q.x, z: q.z }).then((r) => {
            if (!r.ok) return void toast.error(r.error);
            const got = (r.data as { coins: number }).coins;
            if (got) setCoins((c) => c + got);
            toast.success(`Task done: ${q.place}${got ? ` · +${got} coins` : ""}`);
          });
        },
        reward: (activity, amount, text, score) => {
          void (async () => {
            if (activity !== "gems" && activity !== "treasure" && score > 0) void F.saveScoreAction(`world:${activity}`, score, { activity }).catch(() => {});
            const r = amount > 0 ? await F.playRewardAction(activity, amount) : null;
            const got = r?.ok ? (r.data?.coins ?? 0) : 0;
            if (got) setCoins((c) => c + got);
            toast.success(`${text}${got ? ` · +${got} coins` : ""}`);
          })();
        },
        gems: (n) => setGems(n),
        camera: setCam,
        driving: setDriving,
        sitting: setSitting,
      });
    } catch (e) {
      setError(`3D could not start on this device: ${(e as Error).message}`);
      return;
    }
    town.current = t;
    for (const id of blocked) t.blocked.add(id);
    // Guests start at the door of Seed Arcade; after a rebuild (graphics settings) everyone is back where they were.
    if (keepPos.current) (t.teleport(keepPos.current.x, keepPos.current.y, keepPos.current.z), t.face(keepPos.current.h), (keepPos.current = null));
    else if (guest) t.goToArcade();
    // Browser tests (automation only) reach the town to check walls, stairs, the elevator and vehicles.
    if (navigator.webdriver) (window as unknown as { __seedTown?: Town }).__seedTown = t;
    const mapTimer = window.setInterval(() => mini.current && t.drawMap(mini.current, false), 250);
    return () => {
      window.clearInterval(mapTimer);
      keepPos.current = { ...t.where_(), h: t.facing };
      t.dispose();
      town.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, build]);

  // The character I am talking to turns to me and talks.
  React.useEffect(() => {
    if (town.current) town.current.npcTalk = npc?.id ?? "";
  }, [npc]);
  React.useEffect(() => {
    const f = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  React.useEffect(() => () => void (gems && report(gems)), [gems, report]);

  const saveGfx = (g: Gfx, rebuild: boolean) => {
    setGfx(g);
    try {
      localStorage.setItem(GFX_KEY, JSON.stringify(g));
    } catch {}
    if (rebuild) setBuild((b) => b + 1);
    else if (town.current) ((town.current.gfx = g), town.current.setVolumes(g.music ?? 0.45, g.sfx));
  };
  React.useEffect(() => {
    if (!strike && rebuildAfter) (setRebuildAfter(false), setBuild((b) => b + 1));
  }, [strike, rebuildAfter]);
  const toggleSet = (key: string, set: Set<string>, setter: (s: Set<string>) => void, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
    try {
      localStorage.setItem(key, JSON.stringify([...n]));
    } catch {}
    return n;
  };
  const refreshWallet = (w: Wallet) => {
    setWallet(w);
    setCoins(w.coins);
  };
  const npcAct = (act: string, arg?: string) => {
    const t = town.current;
    if (!home || !t) return;
    if (act === "shop") setPanel({ kind: "shop", data: { shop: arg } });
    else if (act === "who") {
      const c = home.residents.reduce<Record<string, number>>((a, r) => ((a[r.status] = (a[r.status] ?? 0) + 1), a), {});
      toast(`Today: ${Object.entries(c).map(([k, n]) => `${n} ${STATUS[k as Status].label.toLowerCase()}`).join(", ")}.`);
    } else if (act === "mydesk") {
      const me = home.residents.find((r) => r.me);
      if (!me) return;
      const i = home.departments.indexOf(me.dept);
      toast(`Your desk is in the ${me.dept} workspace on the ${i >= 6 ? "second" : "first"} floor. Taking you there.`);
      t.goTo(me.id);
      t.teleport(-16 + ((i % 6) % 3) * 11 + 5, (1 + Math.floor(i / 6)) * 4.5, -79 + Math.floor((i % 6) / 3) * 17.5 + 15);
    } else if (act === "drink") (t.doEmote("cheer"), toast("Fresh coffee. You feel ready for anything."));
    else if (act === "social" && npc) {
      t.socialWith(npc.id, String(arg));
      if (arg === "fight" || arg === "dance") setNpc(null);
    }
    else if (act === "tip") t.interact();
    else if (act === "dance") t.doEmote("dance");
    else if (act === "archery") setPanel({ kind: "activity", data: { kind: "archery" } });
    else if (act === "gp") setPanel({ kind: "gp" });
    setNpc(null);
  };

  if (error) return <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>;
  if (!home || !gfx) return <p className="py-8 text-center text-sm text-muted-foreground">Building {"Seed Town"}…</p>;
  const meId = home.residents.find((r) => r.me)?.id ?? "me";
  const t = town.current;
  const p = panel;
  return (
    <div ref={shell} className={cn(fill ? "flex h-full flex-col" : "space-y-2", full && "bg-background")} data-game="world">
      <div className={cn("relative overflow-hidden rounded-xl border bg-[#bfe3ff] outline-none select-none", fill ? "min-h-[300px] flex-1 rounded-none border-0" : touch ? "h-[calc(100dvh-9rem)] min-h-[420px]" : big ? "h-[72vh]" : "h-[460px]", full && "h-screen rounded-none")} id="seed-town" onClickCapture={(e) => (e.target as HTMLElement).closest("button") && town.current?.sound.play("click", { volume: 0.6 })}>
        <div ref={box} className="absolute inset-0" onPointerDown={() => town.current?.sound.unlock()} aria-label="Seed Town: walk with WASD or the arrow keys, Space to jump, drag to look around, E to interact" data-world-canvas />

        {/* Top bar: coins, where I am, who is here, menus. */}
        <div className="pointer-events-none absolute top-2 right-2 left-2 z-10 flex items-start justify-between gap-2 text-xs">
          <div className="pointer-events-auto flex flex-col gap-1">
            <span className="rounded-full bg-black/55 px-2.5 py-1 font-medium text-white" data-world-status>
              {online.n} in town · {coins} coins{gems ? ` · ${gems} gems` : ""}
            </span>
            {where && <span className="w-fit rounded-full bg-black/40 px-2 py-0.5 text-white" data-world-where>{where}</span>}
          </div>
          <div className="pointer-events-auto flex flex-wrap justify-end gap-1">
            {[
              ["people", <UsersIcon key="u" />, "Who is where", "data-world-people"],
              ["voice", rooms.me.mode === "off" ? <MicOffIcon key="v" /> : <MicIcon key="v" className={speaking.has(meId) ? "text-[#16a34a]" : ""} />, "Voice chat", "data-world-voice-btn"],
              ["dress", <PaletteIcon key="d" />, "Customize my character", "data-world-dress"],
              ["inventory", <BackpackIcon key="i" />, "Your things (I)", "data-world-inv"],
              ["shop", <ShoppingBagIcon key="s" />, "Shops", "data-world-shop"],
              ["map", <MapIcon key="m" />, "Map (M)", "data-world-mapbtn"],
              ["settings", <SettingsIcon key="g" />, "Settings", "data-world-settings-btn"],
              ["help", <CircleHelpIcon key="h" />, "Controls", "data-world-help"],
            ].map(([k, icon, label, attr]) => (
              <Button key={k as string} size="icon" variant="secondary" className={cn("size-8 rounded-full bg-white/85", p?.kind === k && "ring-2 ring-primary")} aria-label={label as string} title={label as string} onClick={() => setPanel(p?.kind === k ? null : { kind: k as string, data: k === "shop" ? { shop: "clothes" } : undefined })} {...{ [attr as string]: true }}>
                {icon}
              </Button>
            ))}
            <Button size="icon" variant="secondary" className="size-8 rounded-full bg-white/85" aria-label={cam === "third" ? "First person (V)" : "Third person (V)"} title={cam === "third" ? "First person (V)" : "Third person (V)"} onClick={() => t?.toggleCamera()} data-world-cam>
              <CameraIcon />
            </Button>
            <Button size="icon" variant="secondary" className="size-8 rounded-full bg-white/85" aria-label={full ? "Leave full screen" : "Full screen"} onClick={() => (full ? void document.exitFullscreen() : void document.getElementById("seed-town")?.requestFullscreen?.())}>
              {full ? <Minimize2Icon /> : <Maximize2Icon />}
            </Button>
          </div>
        </div>

        {/* Minimap. */}
        <canvas ref={mini} width={120} height={120} className="pointer-events-auto absolute top-[4.4rem] left-2 z-10 hidden size-[96px] cursor-pointer rounded-full border-2 border-white/80 shadow sm:block" onClick={() => setPanel({ kind: "map" })} aria-label="Map" />

        {nav && (
          <div className="pointer-events-none absolute top-[11rem] left-2 z-10 hidden max-w-[150px] rounded-md bg-black/70 px-2 py-1 text-[11px] text-white sm:block" data-world-nav>
            <span className="block truncate font-medium text-[#e9d5ff]">{nav.label}</span>
            <span className="tabular-nums">{nav.dist >= 1000 ? `${(nav.dist / 1000).toFixed(1)} km` : `${nav.dist} m`}</span>
          </div>
        )}
        {/* What I can do here. */}
        {prompt && !hud && (
          <button type="button" onClick={() => t?.interact()} className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-sm font-medium text-white shadow sm:bottom-16" data-world-prompt>
            <kbd className="mr-1.5 rounded bg-white/90 px-1.5 text-xs text-black">E</kbd>{prompt.label}
          </button>
        )}
        {speed !== null && <div className="absolute right-3 bottom-28 z-10 rounded-lg bg-black/60 px-3 py-1 text-right text-white sm:bottom-16" data-world-speed><span className="text-2xl font-bold tabular-nums">{speed}</span> <span className="text-xs">km/h</span>
            {gauge && (
              <div className="mt-0.5 flex items-center justify-end gap-2" data-world-gauge>
                <span className="text-sm font-bold tabular-nums">{gauge.gear < 0 ? "R" : gauge.gear}</span>
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/20"><span className="block h-full" style={{ width: `${Math.min(100, (gauge.rpm / gauge.redline) * 100)}%`, background: gauge.rpm > gauge.redline * 0.9 ? "#ef4444" : "#22c55e" }} /></span>
                <span className="text-[10px] tabular-nums">{Math.round(gauge.rpm / 100) / 10}k</span>
                {gauge.condition < 100 && <span className={cn("text-[10px]", gauge.condition < 40 ? "text-red-300" : "text-amber-200")}>{gauge.condition}%</span>}
              </div>
            )}
            <p className="text-[10px] opacity-70">W/S drive · A/D steer · Space handbrake · H horn · E get out{gauge?.manual ? " · X/Z gears" : ""}</p></div>}
        {hud && (
          <div className="absolute top-14 left-1/2 z-10 w-72 -translate-x-1/2 rounded-xl bg-black/65 p-2 text-center text-white" data-world-hud>
            <p className="text-sm font-semibold">{hud.title}</p>
            <p className="text-3xl font-bold tabular-nums">{hud.score}</p>
            <p className="text-xs">{hud.line}{hud.left ? ` · ${hud.left}` : ""}</p>
            <div className="mt-1 flex justify-center gap-1">
              <Button size="xs" variant="secondary" onClick={() => t?.stopActivity()}>Stop</Button>
            </div>
          </div>
        )}

        {/* Emotes and actions (not while driving, racing or in a match: the speed and ammo displays sit there). */}
        <div className={cn("absolute right-2 z-10 flex flex-col items-end gap-1", touch ? "bottom-40" : "bottom-36 sm:bottom-14", (speed !== null || strike || race) && "hidden")}>
          {emotes && (
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1">
              {([["wave", HandIcon], ["cheer", PartyPopperIcon], ["dance", MusicIcon], ["laugh", LaughIcon], ["cry", FrownIcon], ["clap", HandHeartIcon], ["bow", FootprintsIcon], ["jump", ArrowUpIcon], ["firework", SparklesIcon]] as const).map(([k, Icon]) => (
                <button key={k} type="button" onClick={() => (k === "firework" ? t?.firework() : t?.doEmote(k), setEmotes(false))} className="flex size-9 flex-col items-center justify-center rounded-lg bg-white/90 text-[9px] shadow" aria-label={k} title={k} data-emote={k}>
                  <Icon className="size-4" />
                  {k}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <button type="button" onClick={() => t?.callRide()} className="flex size-9 items-center justify-center rounded-full bg-white/85 shadow" aria-label="Call my vehicle (R)" title="Call my vehicle (R)" data-world-ride><CarIcon className="size-4" /></button>
            <button type="button" onClick={() => setEmotes(!emotes)} className="flex size-9 items-center justify-center rounded-full bg-white/85 shadow" aria-label="Emotes" title="Emotes (1-6)" data-world-emotes><HandIcon className="size-4" /></button>
          </div>
        </div>
        {touch && <TouchControls town={town} sitting={sitting} driving={driving} />}

        <ChatBox className={cn(touch && "top-24 bottom-auto", strike && "hidden")} messages={messages} onSend={(text, ch) => t?.say(text, ch)} open={chatOpen} setOpen={setChatOpen} channel={channel} setChannel={setChannel} inRoom={rooms.me.mode === "room"} enabled={home.chat} muted={muted} focusKey={chatFocus} />

        {/* Panels. */}
        {p?.kind === "people" && (
          <PeoplePanel
            residents={home.residents}
            online={online.people}
            seesAbsence={home.seesAbsence}
            onClose={() => setPanel(null)}
            onGo={(id) => t?.goTo(id)}
            onCard={setCard}
            onVisit={(id) => (t?.visitHome(id), setPanel(null))}
            muted={muted}
            blocked={blocked}
            onMute={(id) => {
              const n = toggleSet("myseed.world.muted", muted, setMuted, id);
              t?.setVolume(id, n.has(id) ? 0 : (volumes[id] ?? 1));
            }}
            onBlock={(id) => {
              const n = toggleSet("myseed.world.blocked", blocked, setBlocked, id);
              if (n.has(id)) t?.blocked.add(id);
              else t?.blocked.delete(id);
            }}
            onReport={async (id, name) => {
              const why = window.prompt(`Report ${name} to Admin. What happened?`);
              if (why === null) return;
              const r = await F.reportPlayerAction(id, why);
              if (r.ok) toast.success("Admin has been told. Thank you.");
              else toast.error(r.error);
            }}
          />
        )}
        {p?.kind === "voice" && (
          <VoicePanel
            enabled={home.voice}
            state={rooms.me}
            rooms={rooms.rooms}
            people={online.people}
            speaking={speaking}
            meId={meId}
            volumes={volumes}
            onMode={(m) => void t?.setVoice(m)}
            onMute={(m) => t?.setMicMuted(m)}
            onRoom={(op) => void t?.roomOp(op)}
            onVolume={(id, v) => (setVolumes({ ...volumes, [id]: v }), t?.setVolume(id, v))}
            onClose={() => setPanel(null)}
          />
        )}
        {p?.kind === "dress" && (
          <Studio
            look={lookRef.current ?? home.look}
            wallet={wallet}
            items={home.items}
            presets={home.presets}
            onClose={() => setPanel(null)}
            onSaved={(l) => ((lookRef.current = l), t?.restyle(l))}
            onWallet={refreshWallet}
          />
        )}
        {p?.kind === "shop" && <ShopPanel shop={(p.data?.shop as Shop) ?? "clothes"} focus={p.data?.item as string | undefined} items={home.items} wallet={wallet} onWallet={refreshWallet} onClose={() => setPanel(null)} onTryOn={() => setPanel({ kind: "dress" })} />}
        {p?.kind === "inventory" && (
          <InventoryPanel
            items={home.items}
            wallet={wallet}
            onClose={() => setPanel(null)}
            onAction={(a, key) => {
              if (a === "wear") setPanel({ kind: "dress" });
              else if (a === "place") setPanel({ kind: "home" });
              else if (a === "ride") void F.setRideAction(key).then((r) => (r.ok ? (refreshWallet(r.data as Wallet), t?.setRide({ ...((r.data as Wallet).owned.find((o) => o.key === key)?.data as Ride), key }), toast.success("Ready to ride")) : toast.error(r.error)));
              else if (a === "firework") (t?.firework(), setPanel(null));
              else if (a === "pet") (funCommand({ open: "pet" }), toast("Open the Pet tab to use it."));
            }}
          />
        )}
        {p?.kind === "garage" && <GaragePanel items={home.items} wallet={wallet} ride={home.ride} onClose={() => setPanel(null)} onWallet={refreshWallet} onRide={(r) => ((home.ride = r), t?.setRide(r))} />}
        {p?.kind === "home" && (
          <HomeStudio items={home.items} wallet={wallet} home={home.homes[meId] ?? { house: "house.cottage", wall: "#fef3c7", floor: "#d6a77a", items: [], access: "everyone", guests: [], level: 1 }} residents={home.residents} onClose={() => setPanel(null)} onWallet={refreshWallet} onSaved={(h: HomeLayout) => ((home.homes[meId] = h), t?.rebuildHome(meId, h))} />
        )}
        {p?.kind === "settings" && <SettingsPanel gfx={gfx} onChange={saveGfx} onClose={() => setPanel(null)} />}
        {p?.kind === "map" && t && (
          <MapPanel
            draw={(c, v) => t.drawMap(c, true, v)}
            me={() => t.where_()}
            waypoint={nav ? t.marker : null}
            onWaypoint={(x, z) => (t.setMarker({ x, z, label: "Waypoint" }), setNav({ label: "Waypoint", dist: 0 }))}
            onClear={() => (t.setMarker(null), setNav(null))}
            onTravel={(x, y, z) => (t.teleport(x, y, z), setPanel(null))}
            onClose={() => setPanel(null)}
          />
        )}
        {p?.kind === "help" && (
          <Panel title="Controls" onClose={() => setPanel(null)} wide>
            <Controls first={String(p.data?.mode ?? "walk")} />
            <p className="mt-2 text-xs text-muted-foreground">Coins: work earns most of them; activities and games add up to {home.playCoins} a day. Spend them on clothes, homes, furniture, vehicles and pet things.</p>
          </Panel>
        )}
        {p?.kind === "pause" && t && (
          <Panel title={`Paused · ${MODE_LABEL[String(p.data?.mode)] ?? "Game"}`} onClose={() => t.setPaused(false)}>
            <div className="space-y-2 text-xs" data-world-pause>
              <Button className="w-full" onClick={() => t.setPaused(false)} data-pause-resume>Resume (Esc)</Button>
              {["gp", "circuit", "race"].includes(String(p.data?.mode)) && (
                <div className="space-y-1 rounded-md border p-2">
                  <p className="font-medium">Driving</p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="xs" variant="outline" onClick={() => t.toggleCamera()}>Camera: far chase, near chase, hood, cockpit (V)</Button>
                    <Button size="xs" variant={t.manual ? "default" : "outline"} onClick={() => (t.setManual(!t.manual), setPanel({ ...p }))} data-pause-manual>Manual gears (X up, Z down): {t.manual ? "on" : "off"}</Button>
                    {gfx && (
                      <>
                        <Button size="xs" variant={gfx.tc !== false ? "default" : "outline"} onClick={() => saveGfx({ ...gfx, tc: gfx.tc === false }, false)} data-pause-tc>Traction control: {gfx.tc !== false ? "on" : "off"}</Button>
                        <Button size="xs" variant={gfx.steerAssist !== false ? "default" : "outline"} onClick={() => saveGfx({ ...gfx, steerAssist: gfx.steerAssist === false }, false)} data-pause-steer>Steering assist: {gfx.steerAssist !== false ? "on" : "off"}</Button>
                      </>
                    )}
                  </div>
                </div>
              )}
              {["archery", "gallery", "penalty", "freekick", "hoops", "fishing"].includes(String(p.data?.mode)) && gfx && (
                <label className="flex items-center justify-between gap-2 rounded-md border p-2">
                  Aim sensitivity
                  <input type="range" min={0.3} max={2.5} step={0.1} value={gfx.sens} onChange={(e) => saveGfx({ ...gfx, sens: Number(e.target.value) }, false)} />
                  <span className="w-8 tabular-nums">{gfx.sens.toFixed(1)}</span>
                </label>
              )}
              {gfx && (
                <div className="space-y-1 rounded-md border p-2">
                  <label className="flex items-center justify-between gap-2">Music<input type="range" min={0} max={1} step={0.05} value={gfx.music ?? 0.5} onChange={(e) => saveGfx({ ...gfx, music: Number(e.target.value) }, false)} /></label>
                  <label className="flex items-center justify-between gap-2">Sound effects<input type="range" min={0} max={1} step={0.1} value={gfx.sfx} onChange={(e) => saveGfx({ ...gfx, sfx: Number(e.target.value) }, false)} /></label>
                  <label className="flex items-center justify-between gap-2">Hold the frame rate steady<input type="checkbox" checked={gfx.steady !== false} onChange={(e) => saveGfx({ ...gfx, steady: e.target.checked }, false)} /></label>
                </div>
              )}
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer font-medium">Controls</summary>
                <Controls first={String(p.data?.mode ?? "walk")} only />
              </details>
              <div className="grid grid-cols-2 gap-1">
                <Button variant="outline" onClick={() => (setPanel(null), t.restartActivity())} data-pause-restart>Restart</Button>
                <Button variant="destructive" onClick={() => (setPanel(null), t.stopActivity())} data-pause-exit>Exit to town</Button>
              </div>
            </div>
          </Panel>
        )}
        {race && raceLobby && "id" in raceLobby && raceLobby.startIn > 0 && (
          <div className="absolute top-28 left-1/2 z-20 -translate-x-1/2 rounded-lg bg-black/75 px-3 py-2 text-center text-xs text-white" data-gp-grid>
            <p className="font-bold">Online race · lights in {Math.ceil(raceLobby.startIn / 1000)} s · {raceLobby.rows.length + 1} on the grid</p>
            {raceLobby.host && raceLobby.startIn > 7000 && <Button size="xs" className="mt-1" onClick={() => t?.raceOp({ op: "go" })} data-gp-go>Start now</Button>}
          </div>
        )}
        {fight && (
          <div className="pointer-events-none absolute top-14 left-1/2 z-10 w-72 -translate-x-1/2 space-y-1 rounded-lg bg-black/60 p-2 text-[11px] text-white" data-world-fight>
            <div className="flex items-center gap-2">
              <span className="w-14">You</span>
              <div className="h-2 flex-1 rounded bg-white/20"><div className="h-2 rounded bg-emerald-400" style={{ width: `${fight.me}%` }} /></div>
            </div>
            {fight.foe && (
              <div className="flex items-center gap-2">
                <span className="w-14 truncate">{fight.foe.name}</span>
                <div className="h-2 flex-1 rounded bg-white/20"><div className="h-2 rounded bg-red-500" style={{ width: `${fight.foe.hp}%` }} /></div>
              </div>
            )}
            {fight.foe && <p className="text-center text-white/70">Q punch · hold X to block · walk away to stop</p>}
          </div>
        )}
        {p?.kind === "elevator" && (
          <Panel title="Elevator" onClose={() => setPanel(null)}>
            <div className="grid gap-1" data-world-elevator>
              {["Ground floor: lobby, café, town hall", "First floor: workspaces, meeting room", "Second floor: workspaces, lead's office, lounge"].map((label, l) => (
                <Button key={l} variant={(p.data?.level as number) === l ? "default" : "outline"} onClick={() => (t?.elevator(l), setPanel(null))} data-floor={l}>{label}</Button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Step inside before it leaves: the doors close, it moves, and opens on your floor.</p>
          </Panel>
        )}
        {p?.kind === "activity" && p.data?.kind === "archery" && (
          <Panel title="Archery" onClose={() => setPanel(null)}>
            {(() => {
              const lvl = archeryLevel();
              return (
                <div className="space-y-2 text-xs" data-archery-setup>
                  <div className="grid grid-cols-2 gap-1">
                    {ARCHERY_MODES.map((m) => (
                      <button key={m.key} type="button" onClick={() => setArch((a) => ({ ...a, mode: m.key }))} className={cn("rounded-md border p-1.5 text-left", arch.mode === m.key ? "border-primary bg-primary/10" : "hover:bg-muted")} data-archery-mode={m.key}>
                        <span className="block font-medium">{m.label}</span>
                        <span className="block text-[10px] text-muted-foreground">{m.note}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(BOWS) as Bow[]).map((b) => (
                      <Button key={b} size="xs" variant={arch.bow === b ? "default" : "outline"} disabled={lvl < BOWS[b].unlock} onClick={() => setArch((a) => ({ ...a, bow: b }))} data-archery-bow={b}>
                        {BOWS[b].label}
                        {lvl < BOWS[b].unlock ? " (level " + BOWS[b].unlock + ")" : ""}
                      </Button>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground">Progressive level {lvl} of 10 (score 40 in a progressive round to go up; better bows unlock on the way). On a phone: drag to aim, hold to draw, lift to shoot.</p>
                  <Button className="w-full" onClick={() => (t?.startActivity("archery", lvl, arch), setPanel(null))} data-archery-start>
                    To the shooting line
                  </Button>
                </div>
              );
            })()}
          </Panel>
        )}
        {p?.kind === "activity" && p.data?.kind === "penalty" && (
          <Panel title="Football challenges" onClose={() => setPanel(null)}>
            <div className="space-y-3 text-xs" data-football-setup>
              <div>
                <p className="font-medium">Five-a-side match</p>
                <p className="mb-1 text-muted-foreground">You and four team mates against five, keepers on both sides, five minutes. Walk into the ball to dribble, E passes, F lobs, hold the mouse and let go to shoot, Q tackles, Shift sprints.</p>
                <div className="grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((lv) => <Button key={lv} size="sm" variant="outline" onClick={() => (t?.startActivity("match", lv), setPanel(null))} data-match-level={lv}>{["Easy", "Normal", "Hard"][lv - 1]}</Button>)}
                </div>
              </div>
              <div>
                <p className="font-medium">Penalties</p>
                <p className="mb-1 text-muted-foreground">Five shots. Aim with the mouse, hold for power (too hard flies over), Shift finesse, Ctrl chip; move the mouse after the kick to curl it. The keeper reads you better at higher levels.</p>
                <div className="grid grid-cols-3 gap-1">
                  {[1, 2, 3].map((lv) => <Button key={lv} size="sm" onClick={() => (t?.startActivity("penalty", lv), setPanel(null))} data-activity-level={lv}>Level {lv}</Button>)}
                </div>
              </div>
              <div>
                <p className="font-medium">Free kicks</p>
                <p className="mb-1 text-muted-foreground">Beat the wall and the keeper: a goal is one star, a top corner two, through the gold ring three. A star opens the next level.</p>
                <div className="grid grid-cols-4 gap-1">
                  {FK_LEVELS.map((l, i) => {
                    const st = fkStars();
                    const open = i === 0 || (st[i - 1] ?? 0) > 0;
                    return (
                      <Button key={i} size="sm" variant={open ? "default" : "outline"} disabled={!open} onClick={() => (t?.startActivity("freekick", i + 1), setPanel(null))} title={l.task} data-freekick-level={i + 1}>
                        {i + 1} <span className="ml-1 text-[10px] opacity-80">{"*".repeat(st[i] ?? 0) || "-"}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Panel>
        )}
        {p?.kind === "activity" && p.data?.kind !== "archery" && p.data?.kind !== "penalty" && (
          <Panel title={p.data?.kind === "archery" ? "Archery" : "Target gallery"} onClose={() => setPanel(null)}>
            <p className="mb-2 text-xs text-muted-foreground">{p.data?.kind === "archery" ? "Ten arrows. Hold to draw, move to aim, let go. Higher levels move the targets." : "Forty seconds. Tap white (2) and gold (5) targets; red ones cost points."}</p>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 3].map((lv) => <Button key={lv} onClick={() => (t?.startActivity(p.data?.kind as string, lv), setPanel(null))} data-activity-level={lv}>Level {lv}</Button>)}
            </div>
          </Panel>
        )}
        {p?.kind === "strike" && (
          <Panel title="Seed Strike" onClose={() => setPanel(null)}>
            <div className="space-y-2 text-xs" data-strike-setup>
              <div className="grid grid-cols-2 gap-1">
                {STRIKE_MODES.map((m) => (
                  <button key={m.key} type="button" onClick={() => setSk((s) => ({ ...s, mode: m.key }))} className={cn("rounded-md border p-1.5 text-left", sk.mode === m.key ? "border-primary bg-primary/10" : "hover:bg-muted")} data-strike-mode={m.key}>
                    <span className="block font-medium">{m.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{m.note}</span>
                  </button>
                ))}
              </div>
              {sk.mode === "core" && (
                <div className="space-y-1" data-core-agents>
                  <p className="font-medium">Choose your agent</p>
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {AGENT_KEYS.map((k) => {
                      const a = AGENTS[k];
                      return (
                        <button key={k} type="button" onClick={() => setSk((s) => ({ ...s, agent: k }))} className={cn("rounded-md border p-1.5 text-left", sk.agent === k ? "border-primary bg-primary/10" : "hover:bg-muted")} data-core-agent={k}>
                          <span className="flex items-center gap-1 font-semibold">
                            <span className="inline-block size-2.5 rounded-full" style={{ background: a.color }} />
                            {a.name}
                            <span className="ml-auto text-[10px] font-normal text-muted-foreground">{a.role}</span>
                          </span>
                          <span className="mt-0.5 block text-[10px] text-muted-foreground">{a.bio}</span>
                          <span className="mt-0.5 block text-[10px]">Q {a.q.name} · E {a.e.name} · X {a.x.name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {AGENTS[sk.agent].name}: Q {AGENTS[sk.agent].q.note} E {AGENTS[sk.agent].e.note} X {AGENTS[sk.agent].x.note}
                  </p>
                </div>
              )}
              {sk.mode !== "core" && (
              <div className="flex flex-wrap gap-1">
                {STRIKE_MAPS.filter((m) => m.key !== "yard").map((m) => (
                  <Button key={m.key} size="xs" variant={sk.map === m.key ? "default" : "outline"} onClick={() => setSk((s) => ({ ...s, map: m.key }))} data-strike-map={m.key}>
                    {m.label}
                  </Button>
                ))}
              </div>
              )}
              {sk.mode !== "core" && (
              <div className="flex flex-wrap items-center gap-1">
                Weapon:
                {(["rifle", "smg", "shotgun", "marksman"] as WeaponKey[]).map((w) => (
                  <Button key={w} size="xs" variant={sk.primary === w ? "default" : "outline"} onClick={() => setSk((s) => ({ ...s, primary: w }))}>
                    {WEAPONS[w].label}
                  </Button>
                ))}
                <span className="text-muted-foreground">+ K9 pistol</span>
              </div>
              )}
              {sk.mode !== "duel" && sk.mode !== "training" && sk.mode !== "core" && (
                <label className="flex items-center justify-between gap-2">
                  Bots <input type="range" min={1} max={9} value={sk.bots} onChange={(e) => setSk((s) => ({ ...s, bots: Number(e.target.value) }))} /> <span className="w-4 tabular-nums">{sk.bots}</span>
                </label>
              )}
              <div className="flex gap-1">
                {(["easy", "normal", "hard"] as const).map((d) => (
                  <Button key={d} size="xs" variant={sk.difficulty === d ? "default" : "outline"} onClick={() => setSk((s) => ({ ...s, difficulty: d }))} className="capitalize">
                    {d}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                WASD move, Shift sprint, Space jump, click to shoot (the mouse locks; Esc frees it), right button aims, R reloads, 1 and 2 switch weapons, Tab shows the scoreboard.
                {sk.mode === "core" && " Seed Core: B buys in the buy phase, Q and E are your powers, X your ultimate, hold F to plant or defuse."} Made-up names; no blood.
              </p>
              <Button className="w-full" onClick={() => (sk.mode === "core" ? setAgentSelect(true) : t?.startActivity("strike", 1, { mode: sk.mode, map: sk.map, bots: sk.bots, difficulty: sk.difficulty, loadout: [sk.primary, "pistol"] }), setPanel(null))} data-strike-start>
                {sk.mode === "core" ? `Play Seed Core as ${AGENTS[sk.agent].name}` : "Play with bots"}
              </Button>
              {sk.mode !== "training" && sk.mode !== "core" && !guest && (
                <div className="space-y-1 rounded-md border p-2">
                  <p className="font-medium">Online with colleagues</p>
                  <div className="flex flex-wrap gap-1">
                    <Button size="xs" onClick={() => (t?.strikeOp({ op: "quick", mode: sk.mode }), t?.startActivity("strike", 1, { mode: sk.mode, map: sk.map, bots: 0, difficulty: sk.difficulty, loadout: [sk.primary, "pistol"], online: true }), setPanel(null))} data-strike-quick>
                      Quick match
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => (t?.strikeOp({ op: "create", mode: sk.mode, map: sk.map, priv: true }), t?.startActivity("strike", 1, { mode: sk.mode, map: sk.map, bots: 0, difficulty: sk.difficulty, loadout: [sk.primary, "pistol"], online: true }), setPanel(null))}>
                      Private match (gets a code)
                    </Button>
                  </div>
                  {(lobby?.open ?? []).map((m) => (
                    <Button key={m.id} size="xs" variant="secondary" className="mr-1" onClick={() => (t?.strikeOp({ op: "join", id: m.id }), t?.startActivity("strike", 1, { mode: m.mode as StrikeMode, map: m.map as StrikeMap, bots: 0, difficulty: sk.difficulty, loadout: [sk.primary, "pistol"], online: true }), setPanel(null))}>
                      Join {m.mode} on {m.map} ({m.n}/{m.max})
                    </Button>
                  ))}
                  <div className="flex gap-1">
                    <input value={sk.code} onChange={(e) => setSk((s) => ({ ...s, code: e.target.value.replace(/\D/g, "").slice(0, 4) }))} placeholder="Code" className="h-7 w-20 rounded border bg-background px-1" />
                    <span className="self-center text-[10px] text-muted-foreground">A private match's code: ask its host; join from the list with it.</span>
                  </div>
                </div>
              )}
            </div>
          </Panel>
        )}
        {strike && (
          <>
            {strike.scope ? (
              <div className="pointer-events-none absolute inset-0 z-10" style={{ background: "radial-gradient(circle at center, transparent 0 32%, rgba(0,0,0,.92) 32.5%)" }} data-strike-scope>
                <div className="absolute top-1/2 left-0 h-px w-full bg-black" />
                <div className="absolute top-0 left-1/2 h-full w-px bg-black" />
                <div className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500" />
              </div>
            ) : (
              <Crosshair x={gfx?.xhair ?? DEFAULT_XHAIR} bloom={strike.bloom} hit={strike.hit > 0} />
            )}
            {strike.paused && !strike.over && (
              <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-3" data-strike-pause>
                <div className="w-full max-w-md space-y-3 rounded-xl bg-[#0f1117]/95 p-4 text-sm text-white">
                  <p className="text-lg font-bold">Paused</p>
                  <Button className="w-full" onClick={() => t?.strikeAct("resume")} data-strike-resume>Resume (click)</Button>
                  <label className="flex items-center justify-between gap-2 text-xs">
                    Mouse sensitivity
                    <input type="range" min={0.1} max={3} step={0.05} value={gfx?.sens ?? 1} onChange={(e) => gfx && saveGfx({ ...gfx, sens: Number(e.target.value) }, false)} data-strike-sens />
                    <span className="w-8 tabular-nums">{(gfx?.sens ?? 1).toFixed(2)}</span>
                  </label>
                  <label className="flex items-center justify-between gap-2 text-xs">
                    Scoped sensitivity
                    <input type="range" min={0.2} max={2} step={0.05} value={gfx?.scopeSens ?? 1} onChange={(e) => gfx && saveGfx({ ...gfx, scopeSens: Number(e.target.value) }, false)} />
                    <span className="w-8 tabular-nums">{(gfx?.scopeSens ?? 1).toFixed(2)}</span>
                  </label>
                  <div className="space-y-1 rounded-md border border-white/15 p-2 text-xs">
                    <p className="font-medium">Crosshair</p>
                    <div className="flex items-center gap-1">
                      {["#ffffff", "#00ff00", "#7fff00", "#ffff00", "#00ffff", "#ff4df0", "#ff3b3b"].map((c) => (
                        <button key={c} type="button" aria-label={`Colour ${c}`} onClick={() => gfx && saveGfx({ ...gfx, xhair: { ...(gfx.xhair ?? DEFAULT_XHAIR), color: c } }, false)} className={cn("size-5 rounded-sm border", (gfx?.xhair ?? DEFAULT_XHAIR).color === c ? "border-white" : "border-transparent")} style={{ background: c }} />
                      ))}
                    </div>
                    {(["len", "gap", "thick"] as const).map((k) => (
                      <label key={k} className="flex items-center justify-between gap-2">
                        {k === "len" ? "Length" : k === "gap" ? "Gap" : "Thickness"}
                        <input type="range" min={k === "thick" ? 1 : 0} max={k === "thick" ? 5 : 12} step={1} value={(gfx?.xhair ?? DEFAULT_XHAIR)[k]} onChange={(e) => gfx && saveGfx({ ...gfx, xhair: { ...(gfx.xhair ?? DEFAULT_XHAIR), [k]: Number(e.target.value) } }, false)} />
                        <span className="w-5 tabular-nums">{(gfx?.xhair ?? DEFAULT_XHAIR)[k]}</span>
                      </label>
                    ))}
                    <div className="flex flex-wrap gap-3">
                      {(["dot", "outline", "moveError"] as const).map((k) => (
                        <label key={k} className="flex items-center gap-1">
                          <input type="checkbox" checked={(gfx?.xhair ?? DEFAULT_XHAIR)[k]} onChange={(e) => gfx && saveGfx({ ...gfx, xhair: { ...(gfx.xhair ?? DEFAULT_XHAIR), [k]: e.target.checked } }, false)} />
                          {k === "dot" ? "Centre dot" : k === "outline" ? "Outline" : "Opens when moving"}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1 text-xs">
                    Graphics:
                    {(["low", "medium", "high", "ultra"] as const).map((q) => (
                      <Button key={q} size="xs" variant={gfx?.quality === q ? "default" : "outline"} className="capitalize" onClick={() => gfx && (saveGfx({ ...gfx, ...PRESETS[q], preset: q }, false), setRebuildAfter(true))}>{q}</Button>
                    ))}
                    {rebuildAfter && <span className="text-white/60">applies when you leave the match</span>}
                  </div>
                  <Button variant="destructive" className="w-full" onClick={() => t?.stopActivity()} data-strike-leave>Leave the match</Button>
                </div>
              </div>
            )}
            <div className="pointer-events-none absolute bottom-24 left-3 z-10 rounded-lg bg-black/65 px-3 py-2 text-white sm:bottom-16" data-strike-hud>
              <p className="text-xs">Health</p>
              <div className="h-2 w-40 overflow-hidden rounded bg-white/20"><div className="h-full bg-green-500" style={{ width: strike.hp + "%" }} /></div>
              <div className="mt-1 h-1.5 w-40 overflow-hidden rounded bg-white/20"><div className="h-full bg-sky-400" style={{ width: strike.armor * 2 + "%" }} /></div>
            </div>
            <div className="pointer-events-none absolute right-3 bottom-24 z-10 rounded-lg bg-black/65 px-3 py-2 text-right text-white sm:bottom-16">
              <p className="text-xs">{strike.weapon}</p>
              <p className="text-2xl font-bold tabular-nums">{strike.reloading ? "Reloading" : strike.ammo + " / " + strike.reserve}</p>
            </div>
            <div className={cn("pointer-events-none absolute top-14 left-1/2 z-10 -translate-x-1/2 rounded-lg bg-black/65 px-3 py-1 text-center text-white", strike.core && "hidden")}>
              <p className="text-sm font-bold">{strike.score}</p>
              <p className="text-[11px] tabular-nums">{strike.time}{strike.round ? " · " + strike.round : ""} · {strike.kills} kills · {strike.deaths} deaths</p>
            </div>
            <div className="pointer-events-none absolute top-24 right-3 z-10 space-y-0.5 text-right text-[11px] text-white">
              {strike.feed.map((f, i) => (
                <p key={i} className="rounded bg-black/55 px-2 py-0.5">{f}</p>
              ))}
            </div>
            {strike.dead > 0 && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-red-900/30 text-2xl font-bold text-white">Respawning in {strike.dead}</div>}
            {strike.core && (() => {
              const c = strike.core;
              return (
                <>
                  <div className="pointer-events-none absolute top-14 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-black/70 px-3 py-1 text-xs text-white" data-core-hud>
                    <span className={cn("rounded px-1.5 py-0.5 font-bold", c.side === "attack" ? "bg-red-600" : "bg-sky-600")}>{c.side === "attack" ? "ATTACK" : "DEFEND"}</span>
                    <span>Round {c.round}</span>
                    <span className="font-bold tabular-nums">{c.score[0]} : {c.score[1]}</span>
                    <span className="tabular-nums">{c.phase === "buy" ? "Buy " : c.phase === "planted" ? "Core " : ""}{c.timer}</span>
                    <span className="text-white/70">{c.alive[0]} v {c.alive[1]}</span>
                    {c.planted && <span className="rounded bg-amber-500 px-1.5 py-0.5 font-bold text-black">Core on {c.planted}</span>}
                    {c.history.length > 0 && (
                      <span className="flex gap-0.5" data-core-history>
                        {c.history.map((w, i) => <span key={i} className={cn("inline-block h-3 w-1.5 rounded-sm", w === 0 ? "bg-emerald-400" : "bg-red-500")} title={`Round ${i + 1}: ${w === 0 ? "won" : "lost"}`} />)}
                      </span>
                    )}
                  </div>
                  {c.banner && <div className="pointer-events-none absolute top-1/3 left-1/2 z-20 -translate-x-1/2 rounded-xl bg-black/70 px-5 py-2 text-center text-lg font-bold text-white" data-core-banner>{c.banner}</div>}
                  {c.blind > 0 && <div className="pointer-events-none absolute inset-0 z-30 bg-white" style={{ opacity: Math.min(0.97, c.blind) }} />}
                  {c.progress !== null && (
                    <div className="pointer-events-none absolute top-[58%] left-1/2 z-20 w-60 -translate-x-1/2 rounded-lg bg-black/70 p-2 text-center text-xs text-white" data-core-progress>
                      {c.progressLabel}
                      <div className="mt-1 h-2 overflow-hidden rounded bg-white/20"><div className="h-full bg-amber-400" style={{ width: `${Math.round(c.progress * 100)}%` }} /></div>
                    </div>
                  )}
                  <div className="absolute bottom-24 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1 sm:bottom-16" data-core-powers>
                    {c.hint && <p className="pointer-events-none rounded bg-black/60 px-2 py-0.5 text-[11px] text-white">{c.hint}</p>}
                    <div className="flex items-end gap-1">
                      {c.abilities.map((a) => (
                        <button key={a.slot} type="button" title={a.note} onClick={() => t?.strikeAct(a.slot.toLowerCase())} className={cn("w-24 rounded-md border px-1.5 py-1 text-left text-[10px] text-white", a.charges > 0 ? "border-white/40 bg-black/70" : "border-white/10 bg-black/40 opacity-70")} data-core-power={a.slot}>
                          <span className="flex items-center justify-between font-bold">
                            <span className="rounded bg-white/90 px-1 text-black">{a.slot}</span>
                            <span className="flex gap-0.5">
                              {a.slot === "X" ? <span className="tabular-nums">{a.pts}/{a.need}</span> : Array.from({ length: a.max }, (_, i) => <span key={i} className={cn("inline-block size-1.5 rounded-full", i < a.charges ? "bg-white" : "bg-white/25")} />)}
                            </span>
                          </span>
                          <span className="block truncate">{a.name}</span>
                        </button>
                      ))}
                      <div className="rounded-md bg-black/70 px-2 py-1 text-[10px] text-white">
                        <span className="block font-bold" style={{ color: c.color }}>{c.agent}</span>
                        <span className="tabular-nums text-[#fde68a]">{c.credits} credits</span>
                        {c.carrier && <span className="block text-amber-300">Core</span>}
                      </div>
                    </div>
                  </div>
                  {c.buy && (
                    <div className="absolute inset-x-4 top-16 z-30 mx-auto max-w-lg rounded-xl bg-black/85 p-3 text-sm text-white" data-core-buy>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="font-bold">Buy: {c.credits} credits</p>
                        <Button size="xs" variant="secondary" onClick={() => t?.strikeAct("close-buy")}>Close (B)</Button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {c.shop.map((it) => (
                          <button key={it.key} type="button" disabled={it.owned || !it.afford} onClick={() => t?.strikeAct(`buy:${it.key}`)} className={cn("flex items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs", it.owned ? "border-emerald-500/60 bg-emerald-900/30" : it.afford ? "border-white/25 hover:bg-white/10" : "border-white/10 opacity-50")} data-core-buy-item={it.key}>
                            <span>{it.label}</span>
                            <span className="tabular-nums text-[#fde68a]">{it.owned ? "owned" : it.cost}</span>
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-white/60">The K9 pistol is always yours. A weapon you buy stays while you live; armour takes half the damage.</p>
                    </div>
                  )}
                </>
              );
            })()}
            {(board || strike.over) && (
              <div className="absolute inset-x-6 top-16 z-20 mx-auto max-w-md rounded-xl bg-black/80 p-3 text-sm text-white" data-strike-board>
                {strike.over && <p className="mb-2 text-center text-lg font-bold text-[#f5c518]">{strike.over}</p>}
                <table className="w-full text-xs">
                  <thead><tr className="text-left text-white/60"><th>Player</th><th className="text-right">Kills</th><th className="text-right">Deaths</th></tr></thead>
                  <tbody>{strike.board.map((b) => <tr key={b.name} className={cn(b.me && "font-bold text-[#fde68a]")}><td><span className="mr-1 inline-block size-2 rounded-full" style={{ background: b.team === 0 ? "#3b82f6" : "#ef4444" }} />{b.name}</td><td className="text-right">{b.k}</td><td className="text-right">{b.d}</td></tr>)}</tbody>
                </table>
                {strike.over && <Button className="mt-2 w-full" size="sm" onClick={() => t?.stopActivity()}>Leave the arena</Button>}
              </div>
            )}
          </>
        )}
        {p?.kind === "gp" && (
          <Panel title="Seed Grand Prix" onClose={() => setPanel(null)}>
            <div className="space-y-2 text-xs" data-gp-setup>
              <p className="font-medium">Circuit</p>
              <div className="grid grid-cols-3 gap-1">
                {GP_CIRCUITS.map((c) => (
                  <button key={c.key} type="button" onClick={() => setGpSetup((s) => ({ ...s, circuit: c.key }))} className={cn("rounded-md border p-1.5 text-left", gpSetup.circuit === c.key ? "border-primary bg-primary/10" : "hover:bg-muted")} data-gp-circuit={c.key}>
                    <span className="block font-medium">{c.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{c.note}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-1">
                Cars:
                <Button size="xs" variant={gpSetup.cars === "f2" ? "default" : "outline"} onClick={() => setGpSetup((s) => ({ ...s, cars: "f2" }))} data-gp-class="f2">Formula 2</Button>
                <Button size="xs" variant={gpSetup.cars === "gt" ? "default" : "outline"} onClick={() => setGpSetup((s) => ({ ...s, cars: "gt" }))} data-gp-class="gt">GT road cars</Button>
                {gpSetup.cars === "gt" && (
                  <select value={gpSetup.myCar} onChange={(e) => setGpSetup((s) => ({ ...s, myCar: e.target.value }))} className="h-6 rounded border bg-background px-1" aria-label="Your car">
                    {GT_CARS.map((k) => <option key={k} value={k}>{({ p930: "Porsche 911 Turbo (930)", m3e30: "BMW M3 (E30)", gt911: "Porsche 911 Carrera 4S", punto: "Fiat Punto GT", supercar: "Vortex V12" } as Record<string, string>)[k]}</option>)}
                  </select>
                )}
              </div>
              <p className="font-medium">Session</p>
              <div className="grid grid-cols-2 gap-1">
                {GP_MODES.map((m) => (
                  <button key={m.key} type="button" onClick={() => setGpSetup((s) => ({ ...s, mode: m.key }))} className={cn("rounded-md border p-1.5 text-left", gpSetup.mode === m.key ? "border-primary bg-primary/10" : "hover:bg-muted")} data-gp-mode={m.key}>
                    <span className="block font-medium">{m.label}</span>
                    <span className="block text-[10px] text-muted-foreground">{m.note}</span>
                  </button>
                ))}
              </div>
              {!["practice", "qualifying", "timetrial"].includes(gpSetup.mode) && (
                <>
                  <label className="flex items-center justify-between gap-2">
                    AI drivers <input type="range" min={1} max={11} value={gpSetup.opponents} onChange={(e) => setGpSetup((s) => ({ ...s, opponents: Number(e.target.value) }))} /> <span className="w-5 tabular-nums">{gpSetup.opponents}</span>
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {(Object.keys(SKILL) as Difficulty[]).map((d) => (
                      <Button key={d} size="xs" variant={gpSetup.difficulty === d ? "default" : "outline"} onClick={() => setGpSetup((s) => ({ ...s, difficulty: d }))}>
                        {SKILL[d].label}
                      </Button>
                    ))}
                  </div>
                </>
              )}
              <div className="flex items-center gap-1">
                Tyres:{" "}
                {(Object.keys(COMPOUND) as Compound[]).map((c) => (
                  <Button key={c} size="xs" variant={gpSetup.compound === c ? "default" : "outline"} onClick={() => setGpSetup((s) => ({ ...s, compound: c }))} className="capitalize">
                    <span className="mr-1 inline-block size-2 rounded-full" style={{ background: COMPOUND[c].color }} />
                    {c}
                  </Button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{gpSetup.cars === "gt" ? "GT: real road cars, the field mixed." : "Your car: the Seed F2 single-seater."} W/S throttle and brake, A/D steer, Space handbrake, V cockpit view. The pit lane (left of the straight) limits you to 60 km/h; stop in the first box for new tyres and fuel. Esc leaves the session.</p>
              <Button className="w-full" onClick={() => (t?.startActivity("gp", 1, gpSetup), setPanel(null))} data-gp-start>
                Go to the grid
              </Button>
              <div className="space-y-1 rounded-md border p-2" data-gp-online>
                <p className="font-medium">Race people online</p>
                <p className="text-[10px] text-muted-foreground">Opens a race on the circuit and cars above ({GP_MODES.find((m) => m.key === gpSetup.mode)?.laps || 5} laps); others join from here until the lights (25 seconds, or start it sooner).</p>
                <Button size="sm" variant="outline" className="w-full" onClick={() => (t?.raceOp({ op: "open", circuit: gpSetup.circuit, cars: gpSetup.cars, laps: GP_MODES.find((m) => m.key === gpSetup.mode)?.laps || 5 }), setPanel(null))} data-gp-open>
                  Open an online race
                </Button>
                {raceLobby && "open" in raceLobby && raceLobby.open.length > 0 ? (
                  raceLobby.open.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                      <span>{GP_CIRCUITS.find((c) => c.key === r.circuit)?.label ?? r.circuit} · {r.cars === "gt" ? "GT" : "F2"} · {r.laps} laps · {r.n} on the grid · {r.host}</span>
                      <Button size="xs" onClick={() => (t?.raceOp({ op: "join", id: r.id }), setPanel(null))} data-gp-join={r.id}>Join</Button>
                    </div>
                  ))
                ) : (
                  <p className="text-[10px] text-muted-foreground">No open races right now.</p>
                )}
              </div>
            </div>
          </Panel>
        )}
        {perf && <PerfOverlay town={town} />}
        {arcadeGame && <ArcadeScreen game={arcadeGame} onClose={() => setArcadeGame(null)} />}
        {agentSelect && (
          <AgentSelect
            initial={sk.agent}
            onLock={(agent) => {
              setSk((s) => ({ ...s, agent }));
              setAgentSelect(false);
              t?.startActivity("strike", 1, { mode: "core", map: "yard", bots: 9, difficulty: sk.difficulty, loadout: ["pistol", "pistol"], agent });
            }}
            onCancel={() => setAgentSelect(false)}
          />
        )}
        {sleeping && (
          <div className="world-sleep pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-black text-white" data-world-sleep>
            <style>{`.world-sleep { animation: world-sleep 4.2s ease both; } @keyframes world-sleep { 0% { opacity: 0; } 20%, 80% { opacity: 1; } 100% { opacity: 0; } }`}</style>
            <p className="text-lg tracking-widest">Sleeping...</p>
          </div>
        )}
        {/* Hold T: the emote wheel (not in a first-person match, a cabinet's game or a panel). */}
        <EmoteWheel enabled={wheelOn} onPick={wheelPick} />
        {race && (
          <div className="pointer-events-none absolute top-14 right-3 z-10 w-56 rounded-lg bg-black/70 p-2 text-[11px] text-white" data-gp-hud>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold">
                P{race.pos}
                <span className="text-xs font-normal">/{race.of}</span>
              </span>
              <span>{race.laps ? "Lap " + Math.max(1, Math.min(race.lap, race.laps)) + "/" + race.laps : "Lap " + Math.max(1, race.lap)}</span>
            </div>
            <p className="font-mono tabular-nums">
              {fmtLap(race.lapTime)} {race.delta !== null && <span className={race.delta > 0 ? "text-red-300" : "text-green-300"}>{(race.delta > 0 ? "+" : "") + race.delta.toFixed(3)}</span>}
            </p>
            <p className="font-mono text-white/70">
              Last {fmtLap(race.last)} · Best {fmtLap(race.best)}
            </p>
            <p className="flex gap-1">
              {race.sectors.map((s, i) => (
                <span key={i} className={cn("flex-1 rounded px-1 text-center", s === null ? "bg-white/10" : "bg-purple-700/70")}>
                  S{i + 1} {s === null ? "--" : s.toFixed(1)}
                </span>
              ))}
            </p>
            <p className="mt-1 flex items-center gap-1">
              <span className="inline-block size-2 rounded-full" style={{ background: COMPOUND[race.tyre].color }} /> <span className="capitalize">{race.tyre}</span> {Math.round((1 - race.wear) * 100)}% · {Math.round(race.temp)}°C · fuel {Math.round(race.fuel)}%
            </p>
            {(race.penalty > 0 || race.warnings > 0) && (
              <p className="text-amber-300">
                Track limits {race.warnings % 3}/3{race.penalty ? " · +" + race.penalty + "s" : ""}
              </p>
            )}
            {race.inPit && <p className="text-sky-300">Pit lane · 60 km/h</p>}
            {race.phase === "lights" || race.phase === "grid" ? (
              <div className="my-1 flex justify-center gap-1" data-gp-lights>
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={cn("size-4 rounded-full border border-white/30", i < race.lights ? "bg-red-600" : "bg-black")} />
                ))}
              </div>
            ) : null}
            <p className="mt-1 text-[#fde68a]">{race.message}</p>
            <ol className="mt-1 space-y-0.5 border-t border-white/15 pt-1">
              {race.standings.filter((s) => s.pos <= 5 || s.me).map((s) => (
                <li key={s.name} className={cn("flex justify-between", s.me && "font-bold text-[#fde68a]")}>
                  <span>
                    {s.pos}. {s.name}
                  </span>
                  <span className="tabular-nums text-white/70">{s.gap}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {race?.results && (
          <Panel title="Race results" onClose={() => (t?.stopActivity(), setRace(null))}>
            <table className="w-full text-xs" data-gp-results>
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th>Pos</th>
                  <th>Driver</th>
                  <th>Time</th>
                  <th>Best</th>
                  <th className="text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {race.results.map((r) => (
                  <tr key={r.name} className={cn(r.me && "font-semibold")}>
                    <td>{r.pos}</td>
                    <td>{r.name}</td>
                    <td className="font-mono">{r.time}</td>
                    <td className="font-mono">{r.best}</td>
                    <td className="text-right">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Button className="mt-2 w-full" size="sm" onClick={() => (t?.stopActivity(), setRace(null))}>
              Back to the paddock
            </Button>
          </Panel>
        )}
        {p?.kind === "tv" && (
          <Panel title="Television" onClose={() => setPanel(null)}>
            <p className="mb-2 text-xs text-muted-foreground">Pick a channel; it plays in the app's video player.</p>
            <div className="grid grid-cols-2 gap-1" data-tv-channels>
              {PERSONAS.flatMap((x) => x.youtube)
                .filter((y) => y.video)
                .slice(0, 8)
                .map((y) => (
                  <Button key={y.video} size="xs" variant="outline" onClick={() => (yt?.play({ video: y.video!, title: y.label }), setPanel(null))} data-tv-channel={y.video}>
                    {y.label}
                  </Button>
                ))}
            </div>
          </Panel>
        )}
        {p?.kind === "computer" && (
          <Panel title="Your computer" onClose={() => setPanel(null)}>
            {(() => {
              const me = home.residents.find((r) => r.me);
              return (
                <div className="space-y-2 text-xs">
                  <p>{me ? `${STATUS[me.status].label} · today's progress ${me.progress}%` : "Welcome back."}</p>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-[#22c55e]" style={{ width: `${me?.progress ?? 0}%` }} /></div>
                  <p>{coins} coins · level {home.level.level}</p>
                  {!guest && (
                    <div className="flex flex-wrap gap-1">
                      <Button size="xs" asChild><a href="/my-work" target="_blank" rel="noreferrer">Open my work</a></Button>
                      <Button size="xs" variant="outline" asChild><a href="/chat" target="_blank" rel="noreferrer">Team chat</a></Button>
                      <Button size="xs" variant="outline" onClick={() => funCommand({ open: "focus" })}>Start a focus session</Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </Panel>
        )}
        {p?.kind === "present" && (
          <Panel title="The big screen" onClose={() => setPanel(null)}>
            <p className="mb-2 text-xs text-muted-foreground">Present a deck to the room: open it on the presentations page and share your screen in a call, or gather colleagues here in a voice room.</p>
            <div className="flex gap-1">
              {!guest && <Button size="xs" asChild><a href="/present" target="_blank" rel="noreferrer">Presentations</a></Button>}
              <Button size="xs" variant="outline" onClick={() => (void t?.roomOp({ op: "create", name: "Town hall" }), setPanel({ kind: "voice" }))}>Open a voice room</Button>
            </div>
          </Panel>
        )}
        {p?.kind === "visit" && (
          <Panel title={`${String(p.data?.name ?? "").split(" ")[0]}'s home`} onClose={() => setPanel(null)}>
            <p className="text-xs text-muted-foreground">{home.homes[p.data?.owner as string]?.access === "everyone" ? "The door is open: walk in." : "This home is for invited guests. Knock and wave!"}</p>
            <div className="mt-2 flex gap-1">
              <Button size="xs" onClick={() => (t?.doEmote("wave"), t?.say(`Knock knock, ${String(p.data?.name ?? "").split(" ")[0]}!`, "near"), setPanel(null))}>Knock</Button>
              {!guest && <Button size="xs" variant="outline" asChild><a href="/chat" target="_blank" rel="noreferrer">Message</a></Button>}
            </div>
          </Panel>
        )}
        {npc && t && npc.person ? (
          <NpcConversation
            key={npc.id}
            def={npc}
            host={{
              hours: t.atmosphere.hours,
              weather: WEATHER_LABEL[t.atmosphere.weather],
              player: home.residents.find((r) => r.me)?.name ?? "friend",
              speak: (id, v) => t.npcSpeak(id, v),
              mark: (m) => t.setMarker(m),
              quest: (id, q) => t.addQuest(id, q),
              act: npcAct,
            }}
            onClose={() => setNpc(null)}
          />
        ) : npc ? (
          <NpcDialog name={npc.name} role={npc.role} lines={npc.lines} actions={npc.actions} onAct={npcAct} onClose={() => setNpc(null)} />
        ) : null}
        {card && (
          <div className="absolute bottom-16 left-1/2 z-20 w-64 -translate-x-1/2 rounded-xl bg-background/95 p-3 text-sm shadow-lg" data-world-card>
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold">{card.name}</p>
                <p className="text-xs text-muted-foreground">{card.dept}</p>
              </div>
              <button type="button" aria-label="Close" onClick={() => setCard(null)}><XIcon className="size-4" /></button>
            </div>
            <p className="mt-1 text-xs" style={{ color: STATUS[card.status].color }}>{STATUS[card.status].label}</p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-[#22c55e]" style={{ width: `${card.progress}%` }} /></div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Today&apos;s progress {card.progress}%</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button size="xs" variant="outline" onClick={() => t?.doEmote("wave")}><HandIcon /> Wave</Button>
              <Button size="xs" variant="outline" onClick={() => (t?.visitHome(card.id), setCard(null))}>Visit home</Button>
              {!guest && <Button size="xs" variant="outline" asChild><a href="/chat"><MessageCircleIcon /> Message</a></Button>}
            </div>
          </div>
        )}
      </div>
      <p className={cn("text-[11px] text-muted-foreground", fill && "hidden")}>
        Walk: WASD (Shift runs) · Jump: Space · Look: drag · E: do things · V: first or third person · R: your vehicle · T: chat · M: map. The office is north, shops east, the park west, homes south.
      </p>
    </div>
  );
}

// Phones and tablets: a joystick on the left; jump, act, run and camera buttons on the right; drag anywhere to look.
function TouchControls({ town, sitting, driving }: { town: React.RefObject<Town | null>; sitting: boolean; driving: boolean }) {
  const [knob, setKnob] = React.useState<{ x: number; y: number } | null>(null);
  const [run, setRun] = React.useState(false);
  const base = React.useRef<HTMLDivElement>(null);
  const id = React.useRef<number | null>(null);
  const set = (e: React.PointerEvent) => {
    const r = base.current!.getBoundingClientRect();
    let x = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const l = Math.hypot(x, y);
    if (l > 1) (x /= l), (y /= l);
    setKnob({ x, y });
    town.current?.setJoy(x, y);
  };
  const end = () => ((id.current = null), setKnob(null), town.current?.setJoy(0, 0));
  return (
    <>
      <div
        ref={base}
        className="absolute bottom-5 left-4 z-10 size-28 touch-none rounded-full border-2 border-white/70 bg-black/20"
        onPointerDown={(e) => ((id.current = e.pointerId), e.currentTarget.setPointerCapture(e.pointerId), set(e))}
        onPointerMove={(e) => id.current === e.pointerId && set(e)}
        onPointerUp={end}
        onPointerCancel={end}
        aria-label="Move"
        data-world-joystick
      >
        <span className="absolute size-12 rounded-full bg-white/85 shadow" style={{ left: `calc(50% - 1.5rem + ${(knob?.x ?? 0) * 2.2}rem)`, top: `calc(50% - 1.5rem + ${(knob?.y ?? 0) * 2.2}rem)` }} />
      </div>
      <div className="absolute right-3 bottom-5 z-10 grid grid-cols-2 gap-2">
        <button type="button" className="size-12 rounded-full bg-white/85 text-xs font-bold shadow" onPointerDown={() => town.current?.interact()} aria-label="Do it">{sitting ? "Up" : driving ? "Out" : "Act"}</button>
        <button type="button" className="size-12 rounded-full bg-white/85 text-xs font-bold shadow" onPointerDown={() => town.current?.jump()} aria-label="Jump">Jump</button>
        <button type="button" className={cn("size-12 rounded-full text-xs font-bold shadow", run ? "bg-primary text-primary-foreground" : "bg-white/85")} onPointerDown={() => (setRun(!run), town.current?.setSprint(!run))} aria-label="Run" aria-pressed={run}>Run</button>
        <button type="button" className="size-12 rounded-full bg-white/85 text-xs font-bold shadow" onPointerDown={() => town.current?.toggleCamera()} aria-label="Camera">Cam</button>
      </div>
    </>
  );
}
