"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  BackpackIcon, CameraIcon, CarIcon, CircleHelpIcon, HandIcon, Maximize2Icon, MessageCircleIcon, MicIcon, MicOffIcon, Minimize2Icon, PaletteIcon, SettingsIcon, SparklesIcon, UsersIcon, XIcon,
  ArrowUpIcon, FootprintsIcon, MapIcon, ShoppingBagIcon, PartyPopperIcon, MusicIcon, LaughIcon, FrownIcon, HandHeartIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import * as F from "@/app/actions/fun";
import type { HomeLayout, Look, Ride, Shop } from "@/lib/fun-catalog";
import type { Resident, Status } from "@/server/fun-world";
import type { Hud } from "./world/activities";
import type { NpcDef } from "./world/city";
import { ChatBox, GaragePanel, HomeStudio, InventoryPanel, MapPanel, NpcDialog, Panel, PeoplePanel, SettingsPanel, ShopPanel, VoicePanel } from "./world/panels";
import { Studio, type Wallet } from "./world/studio";
import { autoQuality, PRESETS, Town, type ChatMsg, type Gfx, type Room, type TownData, type VoiceState } from "./world/town";
import { useScores } from "./shell";
import { usePlayer } from "./player";

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
  const base: Gfx = { preset: "auto", ...PRESETS[q], sens: 1, invert: false, names: true, sfx: 0.7, music: 0.45, camera: "third" };
  try {
    const s = JSON.parse(localStorage.getItem(GFX_KEY) ?? "null") as Partial<Gfx> | null;
    if (s) return { ...base, ...s, ...(s.preset === "auto" ? PRESETS[q] : {}) };
  } catch {}
  return base;
}

type PanelState = { kind: string; data?: Record<string, unknown> } | null;

export function SeedTown({ big = false }: { big?: boolean }) {
  const box = React.useRef<HTMLDivElement>(null);
  const shell = React.useRef<HTMLDivElement>(null);
  const town = React.useRef<Town | null>(null);
  const [home, setHome] = React.useState<Home | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [gfx, setGfx] = React.useState<Gfx | null>(null);
  const [build, setBuild] = React.useState(0);
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
  React.useEffect(() => town.current?.sound.setDuck(!!player?.playing || rooms.me.mode !== "off"), [player?.playing, rooms.me.mode]);

  React.useEffect(() => {
    setGfx(loadGfx());
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
          if (kind === "arcade") return funCommand({ game: "snake" });
          setPanel({ kind, data: d });
        },
        toast: (text, kind) => (kind === "err" ? toast.error(text) : kind === "ok" ? toast.success(text) : toast(text)),
        speed: setSpeed,
        card: setCard,
        npc: setNpc,
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
    // Browser tests (automation only) reach the town to check walls, stairs, the elevator and vehicles.
    if (navigator.webdriver) (window as unknown as { __seedTown?: Town }).__seedTown = t;
    const mapTimer = window.setInterval(() => mini.current && t.drawMap(mini.current, false), 250);
    return () => {
      window.clearInterval(mapTimer);
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
    else if (act === "tip") t.interact();
    else if (act === "dance") t.doEmote("dance");
    else if (act === "archery") setPanel({ kind: "activity", data: { kind: "archery" } });
    setNpc(null);
  };

  if (error) return <p className="py-8 text-center text-sm text-muted-foreground">{error}</p>;
  if (!home || !gfx) return <p className="py-8 text-center text-sm text-muted-foreground">Building {"Seed Town"}…</p>;
  const meId = home.residents.find((r) => r.me)?.id ?? "me";
  const t = town.current;
  const p = panel;
  return (
    <div ref={shell} className={cn("space-y-2", full && "bg-background")} data-game="world">
      <div className={cn("relative overflow-hidden rounded-xl border bg-[#bfe3ff] outline-none select-none", touch ? "h-[calc(100dvh-9rem)] min-h-[420px]" : big ? "h-[72vh]" : "h-[460px]", full && "h-screen rounded-none")} id="seed-town" onClickCapture={(e) => (e.target as HTMLElement).closest("button") && town.current?.sound.play("click", { volume: 0.6 })}>
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

        {/* What I can do here. */}
        {prompt && !hud && (
          <button type="button" onClick={() => t?.interact()} className="absolute bottom-28 left-1/2 z-10 -translate-x-1/2 rounded-full bg-black/65 px-3 py-1.5 text-sm font-medium text-white shadow sm:bottom-16" data-world-prompt>
            <kbd className="mr-1.5 rounded bg-white/90 px-1.5 text-xs text-black">E</kbd>{prompt.label}
          </button>
        )}
        {speed !== null && <div className="absolute right-3 bottom-28 z-10 rounded-lg bg-black/60 px-3 py-1 text-right text-white sm:bottom-16" data-world-speed><span className="text-2xl font-bold tabular-nums">{speed}</span> <span className="text-xs">km/h</span><p className="text-[10px] opacity-70">W/S drive · A/D steer · Space brake · H horn · E get out</p></div>}
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

        {/* Emotes and actions. */}
        <div className={cn("absolute right-2 z-10 flex flex-col items-end gap-1", touch ? "bottom-40" : "bottom-36 sm:bottom-14")}>
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

        <ChatBox className={touch ? "top-24 bottom-auto" : undefined} messages={messages} onSend={(text, ch) => t?.say(text, ch)} open={chatOpen} setOpen={setChatOpen} channel={channel} setChannel={setChannel} inRoom={rooms.me.mode === "room"} enabled={home.chat} muted={muted} focusKey={chatFocus} />

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
        {p?.kind === "map" && t && <MapPanel draw={(c) => t.drawMap(c, true)} onTravel={(x, y, z) => (t.teleport(x, y, z), setPanel(null))} onClose={() => setPanel(null)} />}
        {p?.kind === "help" && (
          <Panel title="Controls" onClose={() => setPanel(null)}>
            <ul className="space-y-1 text-xs">
              <li><b>Walk</b> WASD or arrows · <b>Run</b> Shift · <b>Jump</b> Space · <b>Crouch</b> C</li>
              <li><b>Look</b> drag (or move the mouse in first person; click to lock it, Esc to free it) · <b>Zoom</b> wheel</li>
              <li><b>First / third person</b> V · <b>Do things</b> E · <b>Chat</b> T or Enter · <b>Map</b> M · <b>Your things</b> I</li>
              <li><b>Vehicle</b> R calls it, E gets in and out; W/S drive, A/D steer, Space brakes, H honks</li>
              <li><b>Emotes</b> 1 to 6 · <b>Stop an activity</b> Esc</li>
              <li><b>Phones</b> joystick on the left, buttons on the right, drag to look</li>
              <li><b>Gamepad</b> left stick walks, right stick looks, A jumps, X does things, Y switches the camera</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">Coins: work earns most of them; activities and games add up to {home.playCoins} a day. Spend them on clothes, homes, furniture, vehicles and pet things.</p>
          </Panel>
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
        {p?.kind === "activity" && (
          <Panel title={p.data?.kind === "archery" ? "Archery" : "Target gallery"} onClose={() => setPanel(null)}>
            <p className="mb-2 text-xs text-muted-foreground">{p.data?.kind === "archery" ? "Ten arrows. Hold to draw, move to aim, let go. Higher levels move the targets." : "Forty seconds. Tap white (2) and gold (5) targets; red ones cost points."}</p>
            <div className="grid grid-cols-3 gap-1">
              {[1, 2, 3].map((lv) => <Button key={lv} onClick={() => (t?.startActivity(p.data?.kind as string, lv), setPanel(null))} data-activity-level={lv}>Level {lv}</Button>)}
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
                  <div className="flex flex-wrap gap-1">
                    <Button size="xs" asChild><a href="/my-work" target="_blank" rel="noreferrer">Open my work</a></Button>
                    <Button size="xs" variant="outline" asChild><a href="/chat" target="_blank" rel="noreferrer">Team chat</a></Button>
                    <Button size="xs" variant="outline" onClick={() => funCommand({ open: "focus" })}>Start a focus session</Button>
                  </div>
                </div>
              );
            })()}
          </Panel>
        )}
        {p?.kind === "present" && (
          <Panel title="The big screen" onClose={() => setPanel(null)}>
            <p className="mb-2 text-xs text-muted-foreground">Present a deck to the room: open it on the presentations page and share your screen in a call, or gather colleagues here in a voice room.</p>
            <div className="flex gap-1">
              <Button size="xs" asChild><a href="/present" target="_blank" rel="noreferrer">Presentations</a></Button>
              <Button size="xs" variant="outline" onClick={() => (void t?.roomOp({ op: "create", name: "Town hall" }), setPanel({ kind: "voice" }))}>Open a voice room</Button>
            </div>
          </Panel>
        )}
        {p?.kind === "visit" && (
          <Panel title={`${String(p.data?.name ?? "").split(" ")[0]}'s home`} onClose={() => setPanel(null)}>
            <p className="text-xs text-muted-foreground">{home.homes[p.data?.owner as string]?.access === "everyone" ? "The door is open: walk in." : "This home is for invited guests. Knock and wave!"}</p>
            <div className="mt-2 flex gap-1">
              <Button size="xs" onClick={() => (t?.doEmote("wave"), t?.say(`Knock knock, ${String(p.data?.name ?? "").split(" ")[0]}!`, "near"), setPanel(null))}>Knock</Button>
              <Button size="xs" variant="outline" asChild><a href="/chat" target="_blank" rel="noreferrer">Message</a></Button>
            </div>
          </Panel>
        )}
        {npc && <NpcDialog name={npc.name} role={npc.role} lines={npc.lines} actions={npc.actions} onAct={npcAct} onClose={() => setNpc(null)} />}
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
              <Button size="xs" variant="outline" asChild><a href="/chat"><MessageCircleIcon /> Message</a></Button>
            </div>
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">
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
