import * as THREE from "three";
import type { HomeLayout, Item, Look, Ride } from "@/lib/fun-catalog";
import type { Resident, Status } from "@/server/fun-world";
import { npcLook } from "./avatar";
import { Character } from "./character";
import { Archery, Fishing, Gallery, Hoops, Run, TIPS, type Activity, type Hud } from "./activities";
import { buildCity, buildHome, FH, HQ, RING, SHAFT, type Interact, type NpcDef } from "./city";
import { driveCar, moveBody, newBody, Physics, type Car } from "./engine";
import { vehicle } from "./models";
import { textSprite, toon, TOON, type Quality } from "./toon";
import { VoiceMesh } from "./voice";
import { PITCH, Penalty, Soccer, type BallState } from "./soccer";
import { TownAudio, musicFor, type Surface } from "./audio";
import { Atmosphere } from "./atmosphere";
import { Post } from "./post";
import { setTextureQuality } from "./pbr";
import { updateLights } from "./streets";
import { NpcBrain, PERSONALITIES, TOWNFOLK, WalkGraph, seeded, type Place } from "./npc-brain";
import { PEOPLE } from "./people";
import type { Quest } from "./npc-talk";
import { cleanLook } from "@/lib/fun-catalog";
import { lamp } from "./pbr";
import { anyVehicle, forgetCarDetail, updateCarDetail, type CarRig } from "./cars";
import { forgetPropDetail, updatePropDetail } from "./props";
import { newCarState, speedOf, stepCar, type CarState } from "./vehicle-physics";
import { ROADS } from "./streets";
import { Traffic } from "./traffic";
import { GrandPrix, type GpSetup, type RaceState } from "./gp";
import { ArcheryField, FIELD, type ArcheryMode, type Bow } from "./archery";
import { Strike, type StrikeHud, type StrikeSetup, type WeaponKey } from "./strike";

// Seed Town's game loop: builds the town, moves me (walking with collisions, or driving), the camera (third person
// with collision, or first person), everyone else (colleagues at desks or home, people in town live, town folk on
// their walks), interactions, activities, voice, and talks to the server five times a second.

export type Gfx = {
  preset: "auto" | Quality | "custom";
  quality: Quality;
  shadows: 0 | 1 | 2;
  ratio: number;
  aa: boolean;
  view: number;
  effects: boolean;
  fps: 0 | 30 | 60;
  fov: number;
  sens: number;
  invert: boolean;
  names: boolean;
  sfx: number;
  music?: number;
  camera: "third" | "first";
};
export const PRESETS: Record<Quality, Omit<Gfx, "preset" | "sens" | "invert" | "names" | "sfx" | "camera">> = {
  low: { quality: "low", shadows: 0, ratio: 0.75, aa: false, view: 70, effects: false, fps: 30, fov: 62 },
  medium: { quality: "medium", shadows: 0, ratio: 1, aa: true, view: 110, effects: true, fps: 60, fov: 62 },
  high: { quality: "high", shadows: 1, ratio: 1.25, aa: true, view: 160, effects: true, fps: 60, fov: 62 },
  ultra: { quality: "ultra", shadows: 2, ratio: 2, aa: true, view: 240, effects: true, fps: 0, fov: 65 },
};
export function autoQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  // Automated browsers draw in software: Medium keeps tests quick (no shadows or post-processing).
  if (navigator.webdriver) return "medium";
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || matchMedia("(pointer: coarse)").matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (mobile) return cores >= 8 && mem >= 6 ? "medium" : "low";
  return cores >= 8 && mem >= 8 ? "high" : cores >= 4 ? "medium" : "low";
}

export type TownData = {
  look: Look;
  name: string;
  chat: boolean;
  voice: boolean;
  shop: boolean;
  residents: Resident[];
  departments: string[];
  homes: Record<string, HomeLayout>;
  items: (Item & { on: boolean })[];
  ride: Ride & { key: string };
  layout: { props: { id: string; kind: string; x: number; z: number; r: number; s: number; color: string; text: string; name: string; lines: string[]; model?: string; solid?: boolean; y?: number }[]; notice: string };
  meId: string;
  seesAbsence: boolean;
  iceServers?: RTCIceServer[];
};
type Live = [string, string, number, number, number, number, number, string, string, string, string, string, string, number];
export type ChatMsg = { id: number; from: string; name: string; ch: "near" | "town" | "room"; text: string; at: number };
export type Room = { id: string; name: string; owner: string; priv: boolean; code: string; cap: number; n: number };
export type VoiceState = { mode: "off" | "near" | "room"; room: string | null; muted: boolean };

export type TownCallbacks = {
  prompt: (p: { label: string; key: string } | null) => void;
  // I reached the place of a task someone gave me.
  quest?: (npcId: string, q: Quest) => void;
  hud: (h: Hud | null) => void;
  where: (w: string) => void;
  online: (n: number, people: { id: string; name: string; voice: string; muted: boolean; x: number; z: number }[]) => void;
  chat: (m: ChatMsg[]) => void;
  rooms: (r: Room[], me: VoiceState) => void;
  speaking: (ids: Set<string>) => void;
  open: (panel: string, data?: Record<string, unknown>) => void;
  toast: (text: string, kind?: "ok" | "err" | "info") => void;
  speed: (kmh: number | null) => void;
  // Seed Strike's display (null when not playing).
  strike?: (h: StrikeHud | null) => void;
  // Online Strike: the open matches to join, and the match I am in.
  strikeLobby?: (s: { open: { id: string; mode: string; map: string; n: number; max: number }[] } | null) => void;
  // The Grand Prix display (null when not racing).
  race?: (s: RaceState | null) => void;
  // The car's dials: engine speed, gear, condition (null on foot).
  gauge?: (g: { rpm: number; redline: number; gear: number; condition: number; manual: boolean } | null) => void;
  card: (r: Resident) => void;
  npc: (n: NpcDef) => void;
  reward: (activity: string, amount: number, text: string, score: number) => void;
  gems: (n: number) => void;
  camera: (mode: "third" | "first") => void;
  driving: (on: boolean) => void;
  sitting: (on: boolean) => void;
};

const AT_DESK: Status[] = ["working", "idle", "online"];
const STATUS_COLOR: Record<Status, string> = { working: "#22c55e", idle: "#eab308", break: "#38bdf8", online: "#22c55e", left: "#94a3b8", leave: "#a855f7", absent: "#ef4444", away: "#94a3b8" };
const STATUS_LABEL: Record<Status, string> = { working: "Working", idle: "Idle", break: "On a break", online: "Online", left: "Gone home", leave: "On leave", absent: "Absent", away: "Away" };

type Person = {
  id: string;
  name: string;
  av: Character | null;
  group: THREE.Group;
  tag: THREE.Sprite | null;
  tagKey: string;
  bubble: THREE.Sprite | null;
  bubbleText: string;
  target: THREE.Vector3;
  ry: number;
  mv: number;
  emote: string;
  act: string;
  live: boolean;
  resident: Resident | null;
  look: Look;
  veh: string;
  vp: string;
  vehMesh: THREE.Group | null;
  voice: string;
  muted: boolean;
  seat: boolean;
};

export class Town {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private ph = new Physics();
  private city: ReturnType<typeof buildCity>;
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  // The sky, time of day and weather; the picture's finish (bloom, ambient occlusion).
  atmosphere: Atmosphere;
  private post: Post;
  private lightTick = 0;
  private people = new Map<string, Person>();
  private npcs: { def: NpcDef; av: Character; seg: number; k: number; brain?: NpcBrain; bubble?: THREE.Sprite | null; bubbleText?: string }[] = [];
  // Town folk's lives: places to go, the street graph they walk on.
  private places: Place[] = [];
  private graph: WalkGraph | null = null;
  // A destination someone pointed me to (map marker and a light in town), and tasks people gave me.
  marker: { x: number; z: number; label: string } | null = null;
  private beacon: THREE.Mesh | null = null;
  quests = new Map<string, Quest>();
  // Something for the eyes of town folk and colleagues to follow: my head.
  private meHead = new THREE.Object3D();
  private homeInteracts = new Map<string, Interact[]>();
  private homeGroups = new Map<string, THREE.Group>();
  private homeLive = new Map<string, { update: (me: { x: number; z: number }, t: number) => void; toggleLights: () => boolean; light: () => { x: number; y: number; z: number; on: boolean; r: number } }>();
  // One light for the inside of the home I am in (cheaper than a light per house).
  private homeLight = new THREE.PointLight("#ffe8c4", 0, 16, 1.6);
  private body: ReturnType<typeof newBody>;
  private me: Character;
  private meGroup = new THREE.Group();
  private meTag: THREE.Sprite | null = null;
  private yaw = 0;
  private pitch = 0.35;
  private fpPitch = 0;
  private dist = 9;
  // Photo mode: [x, y, z, lookX, lookY, lookZ] or null.
  freeCam: number[] | null = null;
  private heading = Math.PI;
  private keys = new Set<string>();
  private joy = { x: 0, y: 0 };
  private sprint = false;
  private crouch = false;
  private camMode: "third" | "first" = "third";
  private sit: { x: number; y: number; z: number; ry: number; swing?: boolean } | null = null;
  private car: { c: Car; g: THREE.Group; wheels: THREE.Object3D[]; lights: THREE.Mesh[]; key: string; paint: string; driving: boolean; seatY: number; rig: CarRig | null; st: CarState | null } | null = null;
  // Extra paved areas (race tracks) where cars keep their grip; the rest off the streets is grass.
  paved: ((x: number, z: number) => boolean)[] = [];
  private shiftKey: -1 | 0 | 1 = 0;
  private traffic: Traffic | null = null;
  // Race control of my car (the Grand Prix): held on the grid, the pit lane limit, tyre and fuel grip.
  private carHold = false;
  private carLimit: number | null = null;
  private carGrip = 1;
  private activity: Activity | null = null;
  private emote = "";
  private emoteUntil = 0;
  private mySay = "";
  private mySayAt = 0;
  private bubble: THREE.Sprite | null = null;
  private prompt: Interact | null = null;
  private lastPromptKey = "";
  private gems: THREE.Mesh[] = [];
  private gemCount = 0;
  private gemPaid = 0;
  private chest: THREE.Group | null = null;
  private fireworks: { pts: THREE.Points; v: Float32Array; born: number }[] = [];
  private seenFw = new Set<string>();
  private stop = false;
  private raf = 0;
  private timers: number[] = [];
  private clock = new THREE.Clock();
  private lastFrame = 0;
  private ro: ResizeObserver;
  private ray = new THREE.Raycaster();
  private drag: { x: number; y: number; moved: boolean; id: number } | null = null;
  private since = 0;
  private fresh = true;
  private outQueue: Record<string, unknown> = {};
  private messages: ChatMsg[] = [];
  voice: VoiceMesh;
  voiceState: VoiceState = { mode: "off", room: null, muted: false };
  private rooms: Room[] = [];
  private speakingIds = new Set<string>();
  muted = new Set<string>();
  blocked = new Set<string>();
  private stepDist = 0;
  private wasGround = true;
  private liftMoving = false;
  private where = "";
  // Football: the physics world loads when I come near the stadium.
  private soccer: Soccer | null = null;
  private soccerLoading = false;
  // After my kick I share the ball for 3.5 s of ball time (slow frames slow the ball too), at most 15 s of clock.
  private ballAuth = 0;
  private ballAuthUntil = 0;
  private get ballMine() {
    return this.ballAuth > 0 && performance.now() < this.ballAuthUntil;
  }
  private ballSeq = 0;
  score = { teal: 0, gold: 0 };

  constructor(
    private el: HTMLDivElement,
    private data: TownData,
    public gfx: Gfx,
    private cb: TownCallbacks,
  ) {
    TOON.quality = gfx.quality;
    setTextureQuality(gfx.quality !== "low", gfx.quality === "ultra" ? 8 : gfx.quality === "high" ? 4 : 2);
    this.camMode = gfx.camera;
    this.renderer = new THREE.WebGLRenderer({ antialias: gfx.aa, powerPreference: gfx.quality === "low" ? "low-power" : "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, gfx.ratio));
    this.renderer.setSize(el.clientWidth, el.clientHeight);
    this.renderer.shadowMap.enabled = gfx.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = "none";
    this.camera = new THREE.PerspectiveCamera(gfx.fov, el.clientWidth / Math.max(1, el.clientHeight), 0.1, gfx.view + 120);
    this.hemi = new THREE.HemisphereLight("#ffffff", "#7ca06a", 1.15);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff7e6", 1.5);
    this.sun.castShadow = gfx.shadows > 0;
    const sm = gfx.shadows === 2 ? 4096 : 2048;
    this.sun.shadow.mapSize.set(sm, sm);
    const span = gfx.shadows === 2 ? 70 : 50;
    Object.assign(this.sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 220 });
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
    this.atmosphere = new Atmosphere(this.scene, this.renderer, this.sun, this.hemi, { quality: gfx.quality, view: gfx.view, lights: gfx.quality === "ultra" ? 10 : gfx.quality === "high" ? 6 : gfx.quality === "medium" ? 2 : 0 });
    this.atmosphere.onThunder = (v) => this.sound.play("crash", { volume: Math.max(0.3, v) });
    this.post = new Post(this.renderer, this.scene, this.camera, gfx.quality === "ultra" ? "full" : gfx.quality === "high" ? "bloom" : "off", el.clientWidth, el.clientHeight);

    this.city = buildCity(this.ph, {
      name: data.name,
      departments: data.departments,
      residents: data.residents.map((r) => ({ id: r.id, name: r.name, dept: r.dept, me: r.me })),
      homes: data.homes,
      items: data.items,
      notice: data.layout.notice,
      props: data.layout.props,
      meId: data.meId,
      detail: gfx.quality === "low" ? 0 : 1,
    });
    this.scene.add(this.city.root);
    // Small things do not cast shadows (they would double the draw calls for little gain).
    this.city.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      const s = m.getWorldScale(new THREE.Vector3());
      if ((m.geometry.boundingSphere?.radius ?? 1) * Math.max(s.x, s.y, s.z) < 0.9) m.castShadow = false;
    });
    this.atmosphere.setLamps(this.city.lampSpots);
    this.scene.add(this.homeLight);
    // Traffic on the streets (more cars on better graphics).
    const cars = { low: 0, medium: 8, high: 16, ultra: 26 }[gfx.quality];
    if (cars) this.traffic = new Traffic(this.scene, this.ph, cars);
    for (const [id, lot] of this.city.lots) this.buildHomeFor(id, lot);
    // Shopkeepers, the coach and Admin's people stay at their posts; the old fixed walkers are replaced by town
    // folk with their own day (more of them on better graphics).
    for (const d of this.city.npcs) if (!d.id.startsWith("npc-walk")) this.addNpc(d);
    this.places = this.buildPlaces();
    this.graph = new WalkGraph();
    const folk = gfx.quality === "low" ? 6 : gfx.quality === "medium" ? 10 : TOWNFOLK.length;
    TOWNFOLK.slice(0, folk).forEach((f, i) => {
      const rng = seeded(1000 + i * 97);
      const home = this.places.filter((p) => p.kind === "home")[i % Math.max(1, this.places.filter((p) => p.kind === "home").length)] ?? null;
      const start = this.places[Math.floor(rng() * this.places.length)] ?? { x: 0, z: 10 };
      const brain = new NpcBrain(f.name, f.personality, f.role, start.x + (rng() - 0.5) * 3, start.z + (rng() - 0.5) * 3, rng, home);
      this.addNpc({ id: `npc-folk-${i}`, name: f.name, role: { worker: "Office worker", shopper: "Shopper", student: "Student", retiree: "Retired", athlete: "Athlete", keeper: "Shopkeeper", guide: "Guide" }[f.role], seed: 200 + i, x: brain.body.x, y: 0, z: brain.body.z, ry: 0, lines: [], actions: [], personality: f.personality, person: f.person, female: f.person.startsWith("rb_f"), brainRole: f.role }, brain);
    });
    void placeModels(this.scene, this.ph, data.layout.props);

    // Me.
    this.body = newBody(this.city.spawn.x, 0, this.city.spawn.z);
    this.me = new Character(data.look, gfx.quality !== "low");
    this.meGroup.add(this.me.root);
    this.meHead.position.y = 1.45;
    this.meGroup.add(this.meHead);
    this.scene.add(this.meGroup);
    this.setMyTag();

    // Colleagues where they are now (built when I come near, to keep the town light).
    for (const r of data.residents) if (!r.me) this.people.set(r.id, this.newPerson(r.id, r.name, r.look, this.spotOf(r), r, false));
    this.placeGems();
    this.placeChest();

    this.sound.setVolumes(gfx.music ?? 0.5, gfx.sfx);
    this.voice = new VoiceMesh(data.meId, () => this.cb.rooms(this.rooms, this.voiceState), data.iceServers);
    this.bindInput();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(el);
    this.timers.push(window.setInterval(() => void this.sync(), 200));
    this.timers.push(window.setInterval(() => this.slowTick(), 400));
    this.loop();
    this.cb.camera(this.camMode);
  }

  // ------------------------------------------------------------------------------------------------- building

  // Night for headlights and lamps (from the town's clock).
  private daylight() {
    this.scene.userData.night = this.atmosphere.night > 0.55;
  }

  private spotOf(r: Resident) {
    const desk = this.city.desks.get(r.id);
    if (AT_DESK.includes(r.status) && desk) return new THREE.Vector3(desk.x, desk.y, desk.z);
    if (r.status === "break") return new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30 + 2);
    const door = this.city.homeDoors.get(r.id);
    if (door) return new THREE.Vector3(door.x + (Math.random() - 0.5) * 2, 0, door.z + 3.5);
    return new THREE.Vector3((Math.random() - 0.5) * 20, 0, 14);
  }

  private buildHomeFor(id: string, lot: { cx: number; cz: number }) {
    const old = this.homeGroups.get(id);
    if (old) this.city.homesGroup.remove(old);
    const r = this.data.residents.find((x) => x.id === id);
    const h = this.data.homes[id];
    if (!r || !h) return;
    const mine = id === this.data.meId;
    const canEnter = mine || h.access === "everyone" || (h.access === "invited" && h.guests.includes(this.data.meId));
    const built = buildHome(this.ph, id, r.name, lot, h, this.data.items, canEnter, mine);
    this.city.homesGroup.add(built.group);
    this.homeGroups.set(id, built.group);
    this.homeInteracts.set(id, built.interacts);
    if ("update" in built) this.homeLive.set(id, built as unknown as { update: (me: { x: number; z: number }, t: number) => void; toggleLights: () => boolean; light: () => { x: number; y: number; z: number; on: boolean; r: number } });
  }

  // Where town folk go: benches, the plaza, the park, shop windows, the café, work in the office, the stadium
  // stands, bus shelters and their homes.
  private buildPlaces(): Place[] {
    const out: Place[] = [];
    for (const i of this.city.interacts) {
      const d = i.data ?? {};
      if (i.kind === "sit" && i.id.startsWith("bench") && typeof d.x === "number") out.push({ kind: "bench", x: d.x as number, y: 0, z: d.z as number, ry: d.ry as number, label: "a bench" });
    }
    for (let a = 0; a < 8; a++) out.push({ kind: "plaza", x: Math.cos(a * 0.785) * 15, y: 0, z: Math.sin(a * 0.785) * 15, ry: -a * 0.785 - Math.PI / 2, label: "the plaza" });
    for (const [x, z] of [[-60, -18], [-95, 10], [-70, 22], [-110, -10], [-55, 8], [-85, -12]] as const) out.push({ kind: "park", x, y: 0, z, ry: 0, label: "the park" });
    for (const x of [30, 50, 70, 90]) {
      out.push({ kind: "shop", x, y: 0.15, z: -10.5, ry: Math.PI, label: "the shops" });
      out.push({ kind: "shop", x, y: 0.15, z: 10.5, ry: 0, label: "the shops" });
    }
    out.push({ kind: "cafe", x: 40, y: 0.15, z: -45.5, ry: Math.PI, label: "Habesha Coffee" }, { kind: "cafe", x: 6, y: 0, z: 9, ry: Math.PI, label: "the plaza" });
    for (let i = 0; i < 6; i++) out.push({ kind: "work", x: -16 + i * 6.5, y: 0, z: -47.5, ry: Math.PI, label: "the office" });
    for (let i = 0; i < 8; i++) out.push({ kind: "stands", x: 166 + i * 5, y: 0.6, z: 40.5, ry: 0, label: "the stadium" });
    for (const [x, z, ry] of [[8.8, 60, -Math.PI / 2], [-8.8, 100, Math.PI / 2], [8.8, -110, -Math.PI / 2], [80, 7.6, Math.PI], [-80, -5.5, 0]] as const) out.push({ kind: "stop", x, y: 0.15, z, ry, label: "the bus stop" });
    for (const d of this.city.homeDoors.values()) out.push({ kind: "home", x: d.x, y: 0, z: d.z - 1.5, ry: Math.PI, label: "home" });
    for (const [x, z] of [[-110, -46], [-110, -94], [-70, -96], [-30, -96]] as const) out.push({ kind: "home", x, y: 0, z, ry: 0, label: "home" });
    return out;
  }

  // A light where someone sent me, and its marker on the map.
  setMarker(m: { x: number; z: number; label: string } | null) {
    this.marker = m;
    if (!this.beacon) {
      this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 60, 16, 1, true), lamp("#ffd34d", 1.2, 2.2));
      (this.beacon.material as THREE.MeshStandardMaterial).transparent = true;
      (this.beacon.material as THREE.MeshStandardMaterial).opacity = 0.35;
      (this.beacon.material as THREE.MeshStandardMaterial).depthWrite = false;
      this.scene.add(this.beacon);
    }
    this.beacon.visible = !!m;
    if (m) this.beacon.position.set(m.x, 30, m.z);
  }
  addQuest(npcId: string, q: Quest) {
    this.quests.set(npcId, q);
  }
  // A person talking to me: their mouth moves with their voice.
  npcSpeak(id: string, level: number) {
    this.npcs.find((n) => n.def.id === id)?.av.speak(level);
  }

  private addNpc(def: NpcDef, brain?: NpcBrain) {
    // Everyone in town is a realistic person now (their model by their seed, or as set for town folk).
    const person = def.person ?? PEOPLE[def.seed % PEOPLE.length]!.key;
    def.person = person;
    def.female ??= person.startsWith("rb_f");
    def.personality ??= PERSONALITIES[def.seed % PERSONALITIES.length];
    const av = new Character(this.gfx.quality === "low" ? npcLook(def.seed) : { ...cleanLook({}), style: "realistic", base: person }, this.gfx.quality !== "low");
    av.root.position.set(def.x, def.y, def.z);
    av.root.rotation.y = def.ry;
    const tag = textSprite([def.name, def.role], { color: "#fde68a", width: 2.6 });
    tag.position.set(0, 2.25, 0);
    av.root.add(tag);
    this.scene.add(av.root);
    if (!def.path && !brain) this.ph.post({ x: def.x, z: def.z, r: 0.35, minY: def.y, maxY: def.y + 1.8 });
    this.npcs.push({ def, av, seg: 0, k: 0, brain });
  }

  private newPerson(id: string, name: string, look: Look, at: THREE.Vector3, r: Resident | null, live: boolean): Person {
    const group = new THREE.Group();
    group.position.copy(at);
    group.userData.id = id;
    this.scene.add(group);
    return { id, name, av: null, group, tag: null, tagKey: "", bubble: null, bubbleText: "", target: at.clone(), ry: Math.PI, mv: 0, emote: "", act: "", live, resident: r, look, veh: "", vp: "", vehMesh: null, voice: "", muted: false, seat: !!r && AT_DESK.includes(r.status) && !live };
  }

  // Avatars are built when within reach and hidden when far (a few hundred colleagues stay cheap).
  private ensureAvatar(p: Person) {
    if (p.av) return;
    p.av = new Character(p.look, this.gfx.quality !== "low");
    p.group.add(p.av.root);
    this.retag(p);
  }
  private dropAvatar(p: Person) {
    if (!p.av) return;
    p.group.remove(p.av.root);
    p.av.dispose();
    p.av = null;
    if (p.tag) (p.group.remove(p.tag), p.tag.material.map?.dispose(), p.tag.material.dispose(), (p.tag = null), (p.tagKey = ""));
  }
  private retag(p: Person) {
    if (!p.av) return;
    const r = p.resident;
    const speaking = this.speakingIds.has(p.id);
    const key = `${p.name}|${r?.status}|${r?.progress}|${speaking}|${p.live}|${this.gfx.names}`;
    if (key === p.tagKey) return;
    p.tagKey = key;
    if (p.tag) (p.group.remove(p.tag), p.tag.material.map?.dispose(), p.tag.material.dispose());
    p.tag = null;
    if (!this.gfx.names) return;
    p.tag = r ? textSprite([p.name, STATUS_LABEL[r.status]], { bar: r.progress, color: STATUS_COLOR[r.status], speaking }) : textSprite([p.name, p.live ? "In town" : ""], { color: "#86efac", speaking });
    p.tag.position.set(0, 2.45, 0);
    p.group.add(p.tag);
  }
  private setMyTag() {
    if (this.meTag) (this.meGroup.remove(this.meTag), this.meTag.material.map?.dispose(), this.meTag.material.dispose());
    const r = this.data.residents.find((x) => x.me);
    this.meTag = r ? textSprite(["You", STATUS_LABEL[r.status]], { bar: r.progress, color: STATUS_COLOR[r.status], speaking: this.speakingIds.has(this.data.meId) }) : textSprite(["You"], { speaking: this.speakingIds.has(this.data.meId) });
    this.meTag.position.set(0, 2.45, 0);
    this.meGroup.add(this.meTag);
  }

  private placeGems() {
    const mat = toon("#a855f7", { emissive: "#6d28d9" });
    for (const [x, z] of this.city.gemSpots) {
      const g = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), mat);
      g.position.set(x, 1, z);
      this.scene.add(g);
      this.gems.push(g);
    }
  }
  private placeChest() {
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const c of day) h = (h * 31 + c.charCodeAt(0)) % 9973;
    const [x, y, z] = this.city.treasureSpots[h % this.city.treasureSpots.length]!;
    let claimed = false;
    try {
      claimed = localStorage.getItem("myseed.world.chest") === day;
    } catch {}
    if (claimed) return;
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.7), toon("#92400e")));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.14, 0.72), toon("#facc15", { emissive: "#a16207" }));
    lid.position.y = 0.36;
    g.add(lid);
    g.position.set(x, y + 0.3, z);
    this.scene.add(g);
    this.chest = g;
    this.city.interacts.push({ id: "chest", x, y, z, r: 1.8, label: "Open the treasure chest", kind: "treasure" });
  }

  // ------------------------------------------------------------------------------------------------- input

  private bindInput() {
    const el = this.el;
    el.tabIndex = 0;
    const wake = () => this.sound.unlock();
    el.addEventListener("pointerdown", wake);
    el.addEventListener("keydown", wake);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      const down = e.type === "keydown";
      // Manual gears: X up, Z down (Settings, driving).
      if (down && this.car?.driving && this.car.st?.manual && (k === "x" || k === "z")) {
        this.shiftKey = k === "x" ? 1 : -1;
        return;
      }
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " ", "shift"].includes(k)) {
        e.preventDefault();
        if (down) this.keys.add(k);
        else this.keys.delete(k);
        if (down && this.sit && k !== "shift") this.stand();
        return;
      }
      if (!down || e.repeat) return;
      if (k === "e" || k === "f") (e.preventDefault(), this.interact());
      else if (k === "v") this.toggleCamera();
      else if (k === "c") this.crouch = !this.crouch;
      else if (k === "h") this.honk();
      else if (k === "escape") this.escape();
      else if (k === "t" || k === "enter") (e.preventDefault(), this.cb.open("chat-focus"));
      else if (k === "m") this.cb.open("map");
      else if (k === "i") this.cb.open("inventory");
      else if (k === "r" && !this.car?.driving) this.callRide();
      else if (/^[1-6]$/.test(k)) this.doEmote(["wave", "cheer", "dance", "laugh", "clap", "bow"][Number(k) - 1]!);
    };
    const blur = () => this.keys.clear();
    el.addEventListener("keydown", onKey);
    el.addEventListener("keyup", onKey);
    window.addEventListener("blur", blur);
    const ndc = (e: PointerEvent | MouseEvent) => {
      const r = this.renderer.domElement.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const cv = this.renderer.domElement;
    const down = (e: PointerEvent) => {
      el.focus();
      if (this.activity?.down) return this.activity.down(ndc(e));
      if (this.camMode === "first" && e.pointerType === "mouse" && document.pointerLockElement !== cv) void cv.requestPointerLock?.();
      this.drag = { x: e.clientX, y: e.clientY, moved: false, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (this.activity?.move && e.target === cv) this.activity.move(ndc(e));
      if (document.pointerLockElement === cv) return this.lookBy(e.movementX, e.movementY);
      if (!this.drag || e.pointerId !== this.drag.id) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      if (!this.activity || (this.activity as { fps?: boolean }).fps) this.lookBy(dx, dy);
      this.drag.x = e.clientX;
      this.drag.y = e.clientY;
    };
    const up = (e: PointerEvent) => {
      if (this.activity?.up) this.activity.up(ndc(e));
      if (!this.drag || e.pointerId !== this.drag.id) return;
      if (!this.drag.moved && !this.activity) this.pick(ndc(e));
      this.drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      this.dist = Math.max(2.5, Math.min(18, this.dist + e.deltaY * 0.01));
    };
    cv.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    cv.addEventListener("wheel", wheel, { passive: false });
    cv.addEventListener("contextmenu", (e) => e.preventDefault());
    this.unbind = () => {
      el.removeEventListener("keydown", onKey);
      el.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (document.pointerLockElement === cv) document.exitPointerLock();
    };
  }
  private unbind = () => {};

  lookBy(dx: number, dy: number) {
    const s = this.gfx.sens;
    this.yaw -= dx * 0.006 * s;
    const iy = this.gfx.invert ? -1 : 1;
    if (this.camMode === "first") this.fpPitch = Math.max(-1.3, Math.min(1.3, this.fpPitch - dy * 0.005 * s * iy));
    else this.pitch = Math.max(0.02, Math.min(1.3, this.pitch + dy * 0.004 * s * iy));
  }
  setJoy(x: number, y: number) {
    this.joy.x = x;
    this.joy.y = y;
    if (this.sit && Math.hypot(x, y) > 0.3) this.stand();
  }
  jump() {
    if (this.sit) return this.stand();
    if (this.body.ground && !this.car?.driving) this.body.vy = 9.2;
  }
  private touchSprint = false;
  setSprint(on: boolean) {
    this.touchSprint = on;
    this.sprint = on;
  }
  toggleCamera() {
    this.camMode = this.camMode === "third" ? "first" : "third";
    if (this.camMode === "third" && document.pointerLockElement) document.exitPointerLock();
    this.cb.camera(this.camMode);
  }
  private escape() {
    if (this.activity) return this.stopActivity();
    if (this.sit) return this.stand();
    this.cb.open("close");
  }

  // Tap someone to see who they are.
  private pick(v: THREE.Vector2) {
    this.ray.setFromCamera(v, this.camera);
    const objs = [...[...this.people.values()].filter((p) => p.av).map((p) => p.group), ...this.npcs.map((n) => n.av.root)];
    const hit = this.ray.intersectObjects(objs, true)[0];
    let o: THREE.Object3D | null = hit?.object ?? null;
    while (o && !o.userData.id) o = o.parent;
    const id = o?.userData.id as string | undefined;
    const p = id ? this.people.get(id) : null;
    if (p) {
      this.cb.card(p.resident ?? { id: p.id, name: p.name, dept: "", status: "online", progress: 0, look: p.look, me: false });
      return;
    }
    const npc = this.npcs.find((n) => hit && isDescendant(hit.object, n.av.root));
    if (npc) this.cb.npc(npc.def);
  }

  // ------------------------------------------------------------------------------------------------- doing things

  doEmote(e: string) {
    this.emote = e;
    this.emoteUntil = performance.now() + (e === "dance" ? 8000 : 3000);
    if (e === "jump") this.jump();
    this.outQueue.emote = e;
  }
  say(text: string, ch: "near" | "town" | "room") {
    if (ch !== "room") {
      this.mySay = text;
      this.mySayAt = performance.now();
      this.setBubble(text);
    }
    this.outQueue.say = text;
    this.outQueue.ch = ch;
  }
  private setBubble(text: string) {
    if (this.bubble) (this.meGroup.remove(this.bubble), this.bubble.material.map?.dispose(), this.bubble.material.dispose());
    this.bubble = null;
    if (text) {
      this.bubble = textSprite([text], { bubble: true });
      this.bubble.position.set(0, 3.2, 0);
      this.meGroup.add(this.bubble);
    }
  }
  restyle(look: Look) {
    this.data.look = look;
    this.me.setLook(look);
  }
  goTo(id: string) {
    const p = this.people.get(id);
    if (!p) return;
    this.leaveCar();
    this.sit = null;
    const t = p.group.position;
    this.body.x = t.x;
    this.body.z = t.z + 1.6;
    this.body.y = t.y;
    this.body.vy = 0;
    this.yaw = 0;
  }
  teleport(x: number, y: number, z: number) {
    this.leaveCar();
    this.sit = null;
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.body.vy = 0;
  }
  elevator(level: number) {
    this.city.elevator.goTo(level);
  }
  private stand() {
    if (!this.sit) return;
    const s = this.sit;
    this.sit = null;
    this.body.x = s.x + Math.sin(s.ry) * 0.8;
    this.body.z = s.z + Math.cos(s.ry) * 0.8;
    this.body.y = s.y;
    const p = { x: this.body.x, z: this.body.z };
    this.ph.resolve(p, this.body.r, this.body.y, this.body.h, this.body.step);
    this.body.x = p.x;
    this.body.z = p.z;
    this.cb.sitting(false);
  }

  interact() {
    if (this.sit) return this.stand();
    if (this.car?.driving) return this.leaveCar();
    if (this.car && Math.hypot(this.car.c.x - this.body.x, this.car.c.z - this.body.z) < 3.2) return this.enterCar();
    const it = this.prompt;
    if (!it) return;
    const d = it.data ?? {};
    switch (it.kind) {
      case "sit":
        this.sit = { x: d.x as number, y: d.y as number, z: d.z as number, ry: d.ry as number, swing: !!d.swing };
        this.sound.play("select");
        this.cb.sitting(true);
        break;
      case "elevator":
        this.cb.open("elevator", { level: Math.round(this.body.y / FH) });
        break;
      case "shop":
        this.cb.open("shop", d);
        break;
      case "garage":
        // The garage repairs the car for free.
        if (this.car?.st && this.car.st.condition < 100) (this.car.st.condition = 100), this.cb.toast("Your car is repaired.", "ok");
        this.cb.open("garage");
        break;
      case "ride":
        this.callRide();
        break;
      case "computer":
        this.cb.open("computer");
        break;
      case "desk": {
        const r = this.data.residents.find((x) => x.id === d.id);
        if (r) this.cb.card(r);
        break;
      }
      case "decorate":
        this.cb.open("home");
        break;
      case "lights": {
        const on = this.homeLive.get(String(d.owner))?.toggleLights();
        this.sound.play("toggle" as never);
        this.cb.toast(on ? "Lights on" : "Lights off", "info");
        break;
      }
      case "tv":
        this.cb.open("tv");
        break;
      case "gp":
        this.cb.open("gp");
        break;
      case "strike":
        this.cb.open("strike");
        break;
      case "home":
        this.cb.open("visit", d);
        break;
      case "npc":
        this.sound.play("talk");
        this.cb.npc(d.def as NpcDef);
        break;
      case "archery":
      case "gallery":
        this.cb.open("activity", { kind: it.kind });
        break;
      case "hoops":
      case "fishing":
      case "parkour":
      case "race":
        this.startActivity(it.kind, 1);
        break;
      case "dance":
        this.doEmote("dance");
        break;
      case "slide":
        this.slide(d.x as number, d.z as number);
        break;
      case "book":
        this.cb.toast(TIPS[Math.floor(Math.random() * TIPS.length)]!, "info");
        break;
      case "wash":
        this.cb.toast("Squeaky clean. Nice!", "info");
        break;
      case "present":
      case "screen":
        this.cb.open("present");
        break;
      case "arcade":
        this.cb.open("arcade");
        break;
      case "treasure":
        this.claimChest();
        break;
      case "penalty":
        this.cb.open("activity", { kind: "penalty" });
        break;
      case "circuit":
        this.startActivity("circuit", 1);
        break;
      case "match":
        this.outQueue.ballReset = true;
        this.cb.toast("New match: 0 : 0. Kick off!", "info");
        break;
      case "kick":
        this.kickBall(this.keys.has("shift") || this.sprint);
        break;
    }
  }

  private slide(x: number, z: number) {
    this.teleport(x, 2.6, -26.6);
    this.doEmote("cheer");
    const start = performance.now();
    const t = window.setInterval(() => {
      const k = Math.min(1, (performance.now() - start) / 900);
      this.body.y = 2.6 * (1 - k);
      this.body.z = -26.6 + (z + 26.6) * k;
      this.body.x = x;
      if (k >= 1) window.clearInterval(t);
    }, 16);
  }

  private claimChest() {
    if (!this.chest) return;
    this.scene.remove(this.chest);
    this.chest = null;
    this.city.interacts = this.city.interacts.filter((i) => i.id !== "chest");
    try {
      localStorage.setItem("myseed.world.chest", new Date().toISOString().slice(0, 10));
    } catch {}
    this.burst(this.body.x, this.body.z);
    this.sound.play("levelup");
    this.cb.reward("treasure", 1, "You found today's treasure chest!", 1);
  }

  startActivity(kind: string, level: number, setup?: GpSetup | { mode: ArcheryMode; bow: Bow } | StrikeSetup) {
    this.stopActivity();
    this.leaveCar();
    this.sit = null;
    const ctx = {
      scene: this.scene,
      camera: this.camera,
      me: () => ({ x: this.body.x, y: this.body.y, z: this.body.z }),
      hud: (h: Hud | null) => this.cb.hud(h),
      done: (k: string, score: number, reward: number, text: string) => {
        this.cb.reward(k, reward, text, score);
        if (k === "parkour" || k === "race") this.stopActivity();
        else window.setTimeout(() => this.activity?.kind === k && this.stopActivity(), 2500);
      },
      sound: (s: "shoot" | "hit" | "miss" | "win" | "splash") => this.beep(s),
    };
    if (kind === "archery") {
      // The archery field (south-west): first person with the bow, the mode and bow chosen.
      const a = (setup as { mode?: ArcheryMode; bow?: Bow } | undefined) ?? {};
      this.teleport(FIELD.x + 1.5, 0, FIELD.z);
      this.activity = new ArcheryField(ctx, a.mode ?? "classic", a.bow ?? "training", level);
    } else if (kind === "strike") {
      // Seed Strike: a closed map far out of town, in first person.
      this.strikeCam = this.camMode;
      this.camMode = "first";
      this.cb.camera("first");
      const s = setup as StrikeSetup;
      this.activity = new Strike(
        {
          scene: this.scene,
          ph: this.ph,
          camera: this.camera,
          body: () => this.body,
          teleport: (x, z, yaw) => (this.teleport(x, 0, z), (this.yaw = yaw + Math.PI), (this.fpPitch = 0)),
          look: (dx, dy) => this.lookBy(dx, dy),
          fov: (k) => {
            const f = this.gfx.fov / k;
            if (Math.abs(this.camera.fov - f) > 0.1) (this.camera.fov += (f - this.camera.fov) * 0.35), this.camera.updateProjectionMatrix();
          },
          hud: (h) => this.cb.strike?.(h),
          sound: (k) => this.beep(k),
          done: (k, score, coins, text) => this.cb.reward(k, coins, text, score),
          others: () => [...this.people.values()].filter((p) => p.live && p.act.startsWith("strike")).map((p) => ({ id: p.id, name: p.name, x: p.group.position.x, y: p.group.position.y, z: p.group.position.z })),
          hitOnline: (to: string, w: WeaponKey, hs: boolean) => ((this.outQueue.hits = [...((this.outQueue.hits as unknown[]) ?? []), { to, w, hs }])),
          canvas: this.renderer.domElement,
        },
        s,
      );
    } else if (kind === "archery-old") (this.teleport(-99.3, 0, -23), (this.activity = new Archery(ctx, level)));
    else if (kind === "gallery") (this.teleport(-110, 0, 23), (this.activity = new Gallery(ctx, level)));
    else if (kind === "hoops") (this.teleport(-75, 0, 26.5), (this.activity = new Hoops(ctx)));
    else if (kind === "fishing") (this.teleport(-75, 0.45, -11), (this.activity = new Fishing(ctx)));
    else if (kind === "parkour") {
      this.teleport(this.city.parkour.start.x, 0, this.city.parkour.start.z);
      this.activity = new Run(ctx, "parkour", [{ ...this.city.parkour.finish, r: 1.6 }], 0.3);
    } else if (kind === "penalty") {
      void this.ensureSoccer().then((sc) => {
        if (!sc) return;
        this.teleport(PITCH.x0 + 12.5, 0, PITCH.cz);
        this.activity = new Penalty(ctx, sc, level);
      });
    } else if (kind === "circuit") {
      const c = this.city.circuit;
      this.teleport(c.start.x - Math.sin(c.start.heading) * 4, 0, c.start.z - Math.cos(c.start.heading) * 4);
      this.callRide(true);
      if (this.car) {
        this.car.c.heading = c.start.heading;
        this.enterCar();
      }
      const lap = c.checkpoints.slice(1).concat([c.checkpoints[0]!]);
      this.activity = new Run(ctx, "circuit", [...lap, ...lap, ...lap].map(([x, z]) => ({ x, y: 0, z, r: 9 })));
    } else if (kind === "gp") {
      // A Formula 2 style car on the grid, race control on it.
      const tr = this.city.gp;
      const s: GpSetup = (setup as GpSetup | undefined) ?? { mode: "practice", difficulty: "amateur", opponents: 7, compound: "medium" };
      if (!this.paved.includes(tr.onTrack)) this.paved.push(tr.onTrack);
      this.activity = new GrandPrix(
        {
          scene: this.scene,
          car: () => (this.car ? { x: this.car.c.x, z: this.car.c.z, heading: this.car.c.heading, speed: this.car.c.speed } : null),
          placeCar: (x, z, h) => {
            this.teleport(x, 0, z);
            this.spawnCar(x, z, h, "car.f2");
            this.enterCar();
            this.yaw = h + Math.PI;
          },
          hold: (on) => (this.carHold = on),
          limit: (v) => (this.carLimit = v),
          grip: (k) => (this.carGrip = k),
          state: (st) => this.cb.race?.(st),
          done: (score, coins, text, best) => {
            if (best) void import("@/app/actions/fun").then((F) => F.saveScoreAction("world:gp", Math.round(best * 1000), { activity: "gp" }).catch(() => {}));
            this.cb.reward("gp", Math.ceil(coins / 5), text, 0);
            void score;
          },
          sound: (k) => this.beep(k),
        },
        tr,
        s,
      ) as unknown as Activity;
    } else if (kind === "race") {
      this.teleport(this.city.race.start.x - 4, 0, this.city.race.start.z + 3);
      if (!this.car) this.callRide(true);
      if (this.car) this.enterCar();
      this.activity = new Run(ctx, "race", this.city.race.checkpoints.map(([x, z]) => ({ x, y: 0, z, r: 9 })));
    }
  }
  private strikeCam: "third" | "first" | null = null;
  // A match I joined online before the game started (the lobby starts it on the right map).
  pendingMatch: { map?: string; mode?: string; code?: string } | null = null;
  // Online Strike: create, join or leave a match (the next sync carries it).
  strikeOp(op: Record<string, unknown>) {
    this.outQueue.strike = op;
  }
  stopActivity() {
    const wasGp = this.activity?.kind === "gp";
    if (this.activity?.kind === "strike") {
      if ((this.activity as unknown as { setup: StrikeSetup }).setup?.online) this.outQueue.strike = { op: "leave" };
      if (this.strikeCam) (this.camMode = this.strikeCam), this.cb.camera(this.strikeCam), (this.strikeCam = null);
      this.cb.strike?.(null);
    }
    this.activity?.stop();
    this.activity = null;
    // Out of the race car: back on foot by the paddock, my own vehicle next time I call it.
    if (wasGp && this.car) {
      this.leaveCar();
      this.scene.remove(this.car.g);
      this.car = null;
    }
    this.cb.hud(null);
    if (this.soccer) this.soccer.onGoal = (team) => this.goal(team);
  }

  // ------------------------------------------------------------------------------------------------- football

  private async ensureSoccer() {
    if (this.soccer) return this.soccer;
    if (this.soccerLoading) return null;
    this.soccerLoading = true;
    try {
      this.soccer = await Soccer.create(this.scene);
      this.soccer.onGoal = (team) => this.goal(team);
    } catch {
      this.cb.toast("Football could not start on this device.", "err");
    }
    this.soccerLoading = false;
    return this.soccer;
  }
  private goal(team: "teal" | "gold") {
    this.cb.toast(`GOAL for ${team === "teal" ? "Teal" : "Gold"}!`, "ok");
    this.sound.play("goal");
    this.burst(team === "teal" ? PITCH.x0 : PITCH.x1, PITCH.cz, -8);
    // Whoever is sharing the ball reports the goal; the server keeps the score.
    if (this.ballMine) this.outQueue.goal = team;
  }
  kickBall(hard: boolean) {
    const sc = this.soccer;
    if (!sc) return false;
    const ok = sc.kick(this.body.x, this.body.z, this.heading, hard ? 17 : 9, hard ? 0.28 : 0.1, (Math.random() - 0.5) * (hard ? 1 : 0.3));
    if (ok) {
      this.ballAuth = 3.5;
      this.ballAuthUntil = performance.now() + 15000;
      this.doEmote("kick");
      this.sound.play("kick");
    }
    return ok;
  }


  // ------------------------------------------------------------------------------------------------- vehicles

  setRide(r: Ride & { key: string }) {
    this.data.ride = r;
    if (this.car) {
      const driving = this.car.driving;
      const at = { x: this.car.c.x, z: this.car.c.z, h: this.car.c.heading };
      this.scene.remove(this.car.g);
      this.car = null;
      this.spawnCar(at.x, at.z, at.h);
      if (driving) this.enterCar();
    }
  }
  callRide(quiet = false) {
    const inside = this.inBuilding();
    if (inside && !quiet) return this.cb.toast("Go outside to call your vehicle.", "err");
    if (this.car?.driving) return;
    const h = this.heading;
    this.spawnCar(this.body.x + Math.cos(h) * 3, this.body.z - Math.sin(h) * 3, h);
    if (!quiet) this.cb.toast("Your vehicle is here. Press E (or the hand button) to get in.", "info");
  }
  private spawnCar(x: number, z: number, heading: number, key?: string) {
    if (this.car) this.scene.remove(this.car.g);
    const it = this.data.items.find((i) => i.key === (key ?? this.data.ride.key)) ?? this.data.items.find((i) => i.key === "car.bike")!;
    const v = anyVehicle(it.model ?? "bike", this.data.ride.paint ?? it.color ?? "#3b82f6", this.data.ride.rims, this.gfx.quality === "high" || this.gfx.quality === "ultra");
    const pos = { x, z };
    this.ph.resolve(pos, v.r, 0, 1.4, 0.35, true);
    const lvl = this.data.ride.level ?? 1;
    const c: Car = { x: pos.x, z: pos.z, y: 0, heading, speed: 0, steer: 0, len: v.len, r: v.r, top: (it.speed ?? 12) * (1 + (lvl - 1) * 0.15), handling: it.handling ?? 2 };
    v.group.position.set(c.x, 0, c.z);
    v.group.rotation.y = heading;
    this.scene.add(v.group);
    const st = v.rig?.spec ? newCarState(c.x, c.z, heading) : null;
    if (st) st.manual = this.manualGears;
    this.car = { c, g: v.group, wheels: v.wheels, lights: v.lights, key: it.key, paint: this.data.ride.paint ?? it.color ?? "#3b82f6", driving: false, seatY: v.seatY, rig: v.rig, st };
  }
  private enterCar() {
    if (!this.car) return;
    this.car.driving = true;
    this.sit = null;
    this.cb.driving(true);
    this.startEngine();
  }
  private leaveCar() {
    if (!this.car?.driving) return;
    const c = this.car.c;
    this.car.driving = false;
    this.car.c.speed = 0;
    const side = { x: c.x + Math.cos(c.heading) * (c.r + 0.8), z: c.z - Math.sin(c.heading) * (c.r + 0.8) };
    this.ph.resolve(side, this.body.r, c.y, this.body.h, this.body.step);
    this.body.x = side.x;
    this.body.z = side.z;
    this.body.y = c.y;
    this.cb.driving(false);
    this.cb.speed(null);
    this.cb.gauge?.(null);
    if (this.car.st) (this.car.st.vx = 0), (this.car.st.vz = 0), (this.car.st.yawRate = 0);
    this.stopEngine();
  }
  private honk() {
    if (!this.car?.driving) return;
    this.sound.play("horn");
  }
  // What I walk on: floors and roads sound hard, homes wooden, the rest grass.
  private surface(): Surface {
    const { x, z } = this.body;
    for (const [id] of this.homeGroups) {
      const lot = this.city.lots.get(id);
      if (lot && Math.abs(x - lot.cx) < 5 && z > lot.cz - 2 && z < lot.cz + 4) return "wood";
    }
    if (this.inBuilding() || this.body.y > 0.2 || Math.abs(x) < 5 || Math.abs(z) < 5 || Math.hypot(x, z) < 24 || Math.abs(Math.abs(x) - RING) < 5 || Math.abs(Math.abs(z) - RING) < 5) return "hard";
    return "grass";
  }
  private inBuilding() {
    const { x, z } = this.body;
    if (x > HQ.x0 && x < HQ.x1 && z > HQ.z0 && z < HQ.z1) return true;
    if (x > -62 && x < -42 && z > -72 && z < -54) return true;
    if (x > 22 && x < 113 && ((z < -13 && z > -27) || (z > 13 && z < 35))) return true;
    for (const [id] of this.homeGroups) {
      const lot = this.city.lots.get(id);
      if (lot && Math.abs(x - lot.cx) < 6.5 && z > lot.cz - 4 && z < lot.cz + 6) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------------- homes

  rebuildHome(owner: string, layout: HomeLayout) {
    this.data.homes[owner] = layout;
    const lot = this.city.lots.get(owner);
    if (lot) this.buildHomeFor(owner, lot);
  }
  visitHome(owner: string) {
    const d = this.city.homeDoors.get(owner);
    if (d) this.teleport(d.x, 0, d.z - 1.5);
  }

  // ------------------------------------------------------------------------------------------------- voice

  async setVoice(mode: "off" | "near" | "room") {
    if (mode !== "off" && !this.voice.on) {
      try {
        await this.voice.start();
      } catch {
        this.cb.toast("The microphone is blocked. Allow it in the browser to talk.", "err");
        return;
      }
    }
    if (mode === "off") this.voice.stop();
    this.voiceState.mode = mode;
    this.outQueue.voice = { mode, muted: this.voice.muted };
    if (mode !== "room") this.outQueue.vr = { op: "leave" };
    this.cb.rooms(this.rooms, this.voiceState);
  }
  setMicMuted(m: boolean) {
    this.voice.setMuted(m);
    this.voiceState.muted = m;
    this.outQueue.voice = { ...(this.outQueue.voice as object), muted: m };
  }
  async roomOp(op: { op: "create"; name: string; priv?: boolean } | { op: "join"; id: string; code?: string } | { op: "leave" } | { op: "kick"; id: string }) {
    if ((op.op === "create" || op.op === "join") && !this.voice.on) {
      try {
        await this.voice.start();
      } catch {
        return this.cb.toast("The microphone is blocked. Allow it in the browser to talk.", "err");
      }
    }
    this.outQueue.vr = op;
  }
  setVolume(id: string, v: number) {
    this.voice.volumes.set(id, v);
  }

  // ------------------------------------------------------------------------------------------------- sound

  // Everything goes through the town's sound (music by district, recorded and made effects).
  readonly sound = new TownAudio();
  private tone(f: number, _dur: number) {
    this.sound.play(f > 900 ? "gem" : "kick");
  }
  private beep(kind: "shoot" | "hit" | "miss" | "win" | "splash") {
    this.sound.play(kind === "hit" && this.activity instanceof Run ? "checkpoint" : kind);
  }
  private startEngine() {
    this.sound.setEngine(true, 0, this.car ? (this.data.items.find((i) => i.key === this.car!.key)?.model ?? "car") : "car");
  }
  private stopEngine() {
    this.sound.setEngine(false);
  }
  setVolumes(music: number, sfx: number) {
    this.sound.setVolumes(music, sfx);
  }

  // ------------------------------------------------------------------------------------------------- effects

  burst(x: number, z: number, y = 0) {
    if (!this.gfx.effects) return;
    const n = 90;
    const pos = new Float32Array(n * 3);
    const v = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      pos.set([x, y + 14, z], i * 3);
      const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2, s = 6 + Math.random() * 4;
      v.set([Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s + 2, Math.sin(a) * Math.cos(b) * s], i * 3);
      c.setHSL(Math.random(), 0.9, 0.6);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.45, vertexColors: true, transparent: true }));
    this.scene.add(pts);
    this.fireworks.push({ pts, v, born: performance.now() });
    this.sound.play("firework", { distance: Math.hypot(x - this.body.x, z - this.body.z) / 3 });
  }
  firework() {
    this.outQueue.fw = true;
  }

  // ------------------------------------------------------------------------------------------------- the server

  private async sync() {
    if (this.stop || document.visibilityState !== "visible" || this.syncing) return;
    this.syncing = true;
    const b = this.body;
    const car = this.car?.driving ? this.car : null;
    const moving = car ? Math.abs(car.c.speed) > 0.5 : this.keys.size > 0 || Math.hypot(this.joy.x, this.joy.y) > 0.1;
    const payload: Record<string, unknown> = {
      x: Math.round((car ? car.c.x : b.x) * 100) / 100,
      y: Math.round((car ? car.c.y : b.y) * 100) / 100,
      z: Math.round((car ? car.c.z : b.z) * 100) / 100,
      ry: Math.round((car ? car.c.heading : this.heading) * 100) / 100,
      mv: moving ? (this.sprint ? 2 : 1) : 0,
      veh: car ? car.key : "",
      vp: car ? car.paint : "",
      act: this.sit ? "sit" : this.activity ? this.activity.kind : "",
      since: this.since,
      ...this.outQueue,
    };
    if (this.fresh) payload.fresh = true;
    if (this.soccer && this.ballMine) payload.ball = this.soccer.state();
    const sig = this.voice.take();
    if (sig.length) payload.sig = sig;
    this.outQueue = {};
    try {
      const r = await fetch("/api/fun/world", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const d = (await r.json()) as Parameters<Town["apply"]>[0] & { error?: string };
      if (!r.ok) {
        if (d.error) this.cb.toast(d.error, "err");
      } else {
        this.fresh = false;
        this.apply(d);
      }
    } catch {}
    this.syncing = false;
  }
  private syncing = false;

  private apply(d: { p: Live[]; looks: Record<string, Look>; m: ChatMsg[]; last: number; s: { from: string; d: never }[]; rooms: Room[]; me: { voice: VoiceState }; fw: { x: number; z: number; at: number; by: string }[]; err: string | null; pitch?: { ball: BallState | null; seq: number; by: string; score: { teal: number; gold: number } } | null; strike?: (Parameters<Strike["online"]>[0] & { id?: string; mode?: string; map?: string; code?: string }) | { open: { id: string; mode: string; map: string; n: number; max: number }[] } | null }) {
    // Seed Strike online: the lobby list, or the match I am in (the server referees).
    if (d.strike && "open" in d.strike) this.cb.strikeLobby?.(d.strike);
    else if (d.strike && "me" in d.strike) {
      this.cb.strikeLobby?.(null);
      const a = this.activity as unknown as Strike | null;
      if (a?.kind === "strike") a.online(d.strike, this.data.meId);
      else this.pendingMatch = d.strike as { map?: string; mode?: string; code?: string };
    }
    if (d.pitch) {
      if (d.pitch.score.teal !== this.score.teal || d.pitch.score.gold !== this.score.gold) {
        this.score = d.pitch.score;
        this.city.scoreboard.draw(this.score.teal, this.score.gold);
      }
      // Someone else kicked last: take their ball.
      if (this.soccer && d.pitch.ball && d.pitch.seq > this.ballSeq && d.pitch.by !== this.data.meId && !this.ballMine) this.soccer.setState(d.pitch.ball);
      this.ballSeq = Math.max(this.ballSeq, d.pitch.seq);
    }
    const seen = new Set<string>();
    for (const [id, name, x, y, z, ry, mv, say, emote, veh, vp, act, voice, muted] of d.p) {
      seen.add(id);
      let p = this.people.get(id);
      const look = d.looks[id] ?? p?.look ?? this.data.residents.find((r) => r.id === id)?.look;
      if (!p || !p.live || (d.looks[id] && p.live)) {
        if (p) (this.dropAvatar(p), this.scene.remove(p.group));
        p = this.newPerson(id, name, look ?? this.data.look, new THREE.Vector3(x, y, z), this.data.residents.find((r) => r.id === id) ?? null, true);
        this.people.set(id, p);
      }
      p.target.set(x, y, z);
      p.ry = ry;
      p.mv = mv;
      p.emote = emote;
      p.act = act;
      p.voice = voice;
      p.muted = !!muted;
      p.seat = act === "sit";
      if (p.veh !== veh || p.vp !== vp) {
        if (p.vehMesh) p.group.remove(p.vehMesh);
        p.vehMesh = null;
        p.veh = veh;
        p.vp = vp;
        if (veh) {
          const it = this.data.items.find((i) => i.key === veh);
          const v = anyVehicle(it?.model ?? "hatch", vp || it?.color || "#3b82f6", undefined, this.gfx.quality === "ultra");
          p.vehMesh = v.group;
          p.vehMesh.userData.seatY = v.seatY;
          p.group.add(v.group);
        }
      }
      if (!this.blocked.has(id)) this.bubbleFor(p, say);
    }
    // People who left town go back to their desk or home.
    for (const p of [...this.people.values()])
      if (p.live && !seen.has(p.id)) {
        this.dropAvatar(p);
        this.scene.remove(p.group);
        this.people.delete(p.id);
        const r = this.data.residents.find((x) => x.id === p.id);
        if (r) this.people.set(r.id, this.newPerson(r.id, r.name, r.look, this.spotOf(r), r, false));
      }
    if (d.m.length) {
      this.messages = [...this.messages, ...d.m.filter((m) => !this.blocked.has(m.from))].slice(-120);
      this.cb.chat(this.messages);
    }
    this.since = d.last;
    for (const s of d.s) void this.voice.handle(s.from, s.d);
    this.rooms = d.rooms;
    this.voiceState = { ...d.me.voice, muted: this.voice.muted };
    this.cb.rooms(this.rooms, this.voiceState);
    for (const f of d.fw) {
      const k = `${f.at}:${f.x}`;
      if (this.seenFw.has(k)) continue;
      this.seenFw.add(k);
      this.burst(f.x, f.z);
    }
    if (d.err) this.cb.toast(d.err, "err");
    // Voice: who to be connected to.
    if (this.voice.on) {
      const targets = new Set<string>();
      const me = { x: this.body.x, z: this.body.z };
      for (const p of this.people.values()) {
        if (!p.live || !p.voice || this.blocked.has(p.id)) continue;
        if (this.voiceState.mode === "room" && p.voice === `r:${this.voiceState.room}`) targets.add(p.id);
        if (this.voiceState.mode === "near" && p.voice === "n" && Math.hypot(p.target.x - me.x, p.target.z - me.z) < 44) targets.add(p.id);
      }
      this.voice.setTargets(targets);
    }
    this.cb.online(d.p.length + 1, d.p.map((x) => ({ id: x[0], name: x[1], voice: x[12], muted: !!x[13], x: x[2], z: x[4] })));
  }

  private bubbleFor(p: Person, text: string) {
    if (p.bubbleText === text) return;
    if (p.bubble) (p.group.remove(p.bubble), p.bubble.material.map?.dispose(), p.bubble.material.dispose());
    p.bubble = null;
    p.bubbleText = text;
    if (text) {
      p.bubble = textSprite([text], { bubble: true });
      p.bubble.position.set(0, 3.2, 0);
      p.group.add(p.bubble);
    }
  }

  // Every 0.4 s: build or drop avatars by distance, show districts in view, the place name, speaking rings.
  private slowTick() {
    const me = new THREE.Vector3(this.body.x, this.body.y, this.body.z);
    const reach = Math.min(55, this.gfx.view * 0.5);
    for (const p of this.people.values()) {
      const d = p.group.position.distanceTo(me);
      if (d < reach) this.ensureAvatar(p);
      else if (d > reach + 15) this.dropAvatar(p);
      if (p.av) p.group.visible = true;
    }
    // Drawn characters made of many small parts only near me (the detailed models, one skinned mesh, further).
    const show = (c: Character, d: number) => {
      const far = c.usingVrm ? Math.min(60, this.gfx.view * 0.5) : 35;
      c.root.visible = d < far;
      if (c.root.visible && c.root.userData.shadowNear !== d < 20) {
        c.root.userData.shadowNear = d < 20;
        c.root.traverse((o) => ((o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).castShadow = d < 20) : 0));
      }
    };
    for (const n of this.npcs) show(n.av, n.av.root.position.distanceTo(me));
    for (const p of this.people.values()) if (p.av) show(p.av, p.group.position.distanceTo(me));
    // Districts beyond sight are not drawn at all (their bounds are known); the open-air ones stay.
    for (const d of this.city.districts) {
      if (d.r > 200) continue;
      d.group.visible = Math.hypot(d.x - me.x, d.z - me.z) - d.r < this.gfx.view * 0.85;
    }
    // The licensed car models only up close (the dealer's, parked ones, mine); farther away their drawn bodies.
    updateCarDetail(this.camera.position, { low: 0, medium: 30, high: 55, ultra: 90 }[this.gfx.quality]);
    updatePropDetail(this.camera.position, { low: 30, medium: 45, high: 65, ultra: 100 }[this.gfx.quality]);
    // Detailed anime models for me and the nearest characters, as many as the graphics level allows.
    // Realistic people share their model and draw in a few calls, so more of them can be detailed.
    const budget = { low: 0, medium: 6, high: 14, ultra: 22 }[this.gfx.quality];
    const near = [
      ...[...this.people.values()].filter((p) => p.av).map((p) => ({ c: p.av!, d: p.group.position.distanceTo(me) })),
      ...this.npcs.filter((n) => n.av.root.visible).map((n) => ({ c: n.av, d: n.av.root.position.distanceTo(me) })),
    ].sort((a, b) => a.d - b.d);
    this.me.setDetailed(budget > 0);
    near.forEach((x, i) => x.c.setDetailed(i < budget - 1 && x.d < 45));
    // Tasks: am I where someone asked me to go?
    for (const [id, q] of this.quests) if (Math.hypot(q.x - me.x, q.z - me.z) < q.r) (this.quests.delete(id), this.cb.quest?.(id, q));
    if (this.marker && Math.hypot(this.marker.x - me.x, this.marker.z - me.z) < 7) (this.cb.toast(`You have reached ${this.marker.label}.`, "ok"), this.setMarker(null));
    for (const [id, g] of this.homeGroups) {
      const lot = this.city.lots.get(id);
      if (lot) g.visible = Math.hypot(lot.cx - me.x, lot.cz - me.z) < this.gfx.view;
    }
    // Where am I?
    let where = "Out and about";
    const inHq = me.x > HQ.x0 && me.x < HQ.x1 && me.z > HQ.z0 && me.z < HQ.z1;
    if (inHq) where = `Office · ${["ground floor", "first floor", "second floor", "roof"][Math.min(3, Math.round(me.y / FH))]}`;
    else {
      let best = Infinity;
      for (const d of this.city.districts) {
        if (d.name === "Extras" || d.name === "Ring road") continue;
        const dd = Math.hypot(d.x - me.x, d.z - me.z) / d.r;
        if (dd < 1 && dd < best) (best = dd), (where = d.name);
      }
      if (where === "Out and about" && (Math.abs(me.x) > RING_IN || Math.abs(me.z) > RING_IN)) where = "Ring road";
    }
    if (where !== this.where) (this.where = where), this.cb.where(where);
    this.sound.setMusic(musicFor(where, this.activity?.kind ?? null));
    // Speaking rings.
    if (this.voice.on) {
      const now = this.voice.speaking();
      const changed = now.size !== this.speakingIds.size || [...now].some((x) => !this.speakingIds.has(x));
      if (changed) {
        const meWas = this.speakingIds.has(this.data.meId);
        this.speakingIds = now;
        for (const p of this.people.values()) this.retag(p);
        if (meWas !== now.has(this.data.meId)) this.setMyTag();
        this.cb.speaking(now);
      }
    }
    this.daylight();
  }

  // ------------------------------------------------------------------------------------------------- the frame

  private loop = () => {
    if (this.stop) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    if (this.gfx.fps && now - this.lastFrame < 1000 / this.gfx.fps - 1) return;
    this.lastFrame = now;
    // Up to a tenth of a second a frame: slow devices still move in real time.
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    this.gamepad();
    this.step(dt, t);
    this.atmosphere.update(dt, this.camera, this.meGroup.position);
    if (this.traffic) {
      const obs = [{ x: this.body.x, z: this.body.z }, ...this.npcs.filter((n) => n.brain && n.av.root.visible).map((n) => ({ x: n.av.root.position.x, z: n.av.root.position.z })), ...[...this.people.values()].filter((p) => p.live).map((p) => ({ x: p.group.position.x, z: p.group.position.z }))];
      this.traffic.update(dt, obs, this.meGroup.position, this.gfx.view);
    }
    let inside: { x: number; y: number; z: number; on: boolean; r: number } | null = null;
    for (const h of this.homeLive.values()) {
      h.update(this.body, t);
      const l = h.light();
      if (l.on && Math.hypot(l.x - this.body.x, l.z - this.body.z) < l.r + 4) inside = l;
    }
    this.homeLight.intensity = inside ? 7 : 0;
    if (inside) this.homeLight.position.set(inside.x, inside.y, inside.z);
    this.post.setNight(this.atmosphere.night);
    this.lightTick -= dt;
    if (this.lightTick <= 0) (this.lightTick = 0.25), updateLights(this.city.trafficLights);
    this.post.render(dt);
  };

  private pad = { a: false, x: false, y: false };
  private gamepad() {
    const g = navigator.getGamepads?.().find((x) => x);
    if (!g) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    this.joy.x = dz(g.axes[0] ?? 0);
    this.joy.y = dz(g.axes[1] ?? 0);
    this.lookBy(dz(g.axes[2] ?? 0) * 12, dz(g.axes[3] ?? 0) * 8);
    const a = !!g.buttons[0]?.pressed, x = !!g.buttons[2]?.pressed, y = !!g.buttons[3]?.pressed;
    if (a && !this.pad.a) this.jump();
    if (x && !this.pad.x) this.interact();
    if (y && !this.pad.y) this.toggleCamera();
    if (g.buttons[10]) this.sprint = g.buttons[10].pressed || this.touchSprint;
    this.pad = { a, x, y };
  }

  private step(dt: number, t: number) {
    const b = this.body;
    this.city.update(t, dt);
    let fx = 0, fz = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) fz -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) fz += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) fx -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) fx += 1;
    fx += this.joy.x;
    fz += this.joy.y;
    const run = this.keys.has("shift") || this.sprint;
    let speed = 0;
    const car = this.car;
    if (this.activity) {
      // Activities hold the player in place (except timed runs).
      const drives = this.activity instanceof Run || (this.activity as { drives?: boolean }).drives;
      if ((this.activity as { walks?: boolean }).walks) speed = this.walk(fx, fz, dt, run);
      else if (drives && !car?.driving) speed = this.walk(fx, fz, dt, run);
      else if (drives && car?.driving) this.driveStep(this.carHold ? 0 : fx, this.carHold ? 0 : fz, dt);
      this.activity.update(dt, t);
    } else if (car?.driving) this.driveStep(fx, fz, dt);
    else if (this.sit) {
      b.x = this.sit.x;
      b.y = this.sit.y;
      b.z = this.sit.z;
      this.heading = this.sit.ry;
    } else speed = this.walk(fx, fz, dt, run);

    // Me.
    if (car?.driving) {
      this.meGroup.position.set(car.c.x, car.c.y + car.seatY - 0.45, car.c.z);
      this.meGroup.rotation.y = car.c.heading;
      this.heading = car.c.heading;
    } else {
      this.meGroup.position.set(b.x, b.y, b.z);
      this.meGroup.rotation.y = this.heading;
    }
    const emote = performance.now() < this.emoteUntil ? this.emote : "";
    this.me.update(t, dt, { speed, air: !b.ground && !car?.driving && !this.sit, sit: !!this.sit, drive: !!car?.driving, crouch: this.crouch && speed < 0.6, emote, aim: this.activity?.kind === "archery" }, null);
    if (this.sit?.swing) this.me.root.rotation.x = Math.sin(t * 2.4) * 0.4;
    else this.me.root.rotation.x = 0;
    if (this.mySay && performance.now() - this.mySayAt > 7000) (this.mySay = ""), this.setBubble("");
    // Hidden in first person (my own head would fill the view), and with the bow or a gun in my hands.
    this.me.root.visible = !(this.camMode === "first" && (!this.activity || (this.activity as { fps?: boolean }).fps)) && this.activity?.kind !== "archery";
    // My own name tag only when the camera is far enough back to see it whole; not while driving, racing or playing.
    if (this.meTag) this.meTag.visible = this.camMode === "third" && !this.activity && !this.car?.driving && this.camera.position.distanceTo(this.meGroup.position) > 3.5;

    // My parked or driven vehicle.
    if (car) {
      car.g.position.set(car.c.x, car.c.y, car.c.z);
      car.g.rotation.y = car.c.heading;
      if (!car.st) for (const w of car.wheels) w.rotation.x += (car.c.speed * dt) / 0.35;
      const night = !!this.scene.userData.night;
      for (const l of car.lights) l.visible = !l.userData.off && (l.userData.front ? night || car.driving : car.driving && (car.c.speed < 0.3 || fz > 0));
    }

    // Everyone else glides to where they are.
    const tmp = new THREE.Vector3();
    for (const p of this.people.values()) {
      if (!p.av) continue;
      const d = p.group.position.distanceTo(p.target);
      if (d > 0.03) {
        const stepLen = Math.min(d, (p.live ? (p.veh ? 40 : 14) : 4) * dt);
        tmp.subVectors(p.target, p.group.position).normalize();
        p.group.position.addScaledVector(tmp, stepLen);
        if (!p.live) p.group.rotation.y = Math.atan2(tmp.x, tmp.z);
      }
      if (d > 30) p.group.position.copy(p.target);
      if (p.live) p.group.rotation.y = p.ry;
      else if (p.seat && d < 0.05) p.group.rotation.y = Math.PI;
      const drive = !!p.vehMesh;
      if (p.vehMesh) p.av.root.position.y = ((p.vehMesh.userData.seatY as number) ?? 0.5) - 0.45;
      else p.av.root.position.y = 0;
      p.av.update(t, dt, { speed: p.live ? (p.mv ? (p.mv === 2 ? 1 : 0.5) : 0) : d > 0.05 ? 0.4 : 0, air: false, sit: p.seat && d < 0.1, drive, crouch: false, emote: p.emote }, p.group.position.distanceTo(this.meGroup.position) < 6 ? this.meHead : null);
    }

    // Town folk with a day of their own (brains), then the ones at their posts.
    const world = this.graph ? { hours: this.atmosphere.hours, raining: this.atmosphere.rainAmount > 0.35, me: { x: b.x, z: b.z, moving: this.keys.size > 0 }, places: this.places, graph: this.graph, ph: this.ph, others: this.npcs.filter((n) => n.brain).map((n) => n.brain!), matchOn: !!this.soccer } : null;
    const nowMs = Date.now();
    for (const n of this.npcs) {
      if (!n.brain || !world) continue;
      const talking = this.npcTalk === n.def.id;
      const pos = n.av.root.position;
      if (talking) {
        n.av.root.rotation.y = Math.atan2(b.x - pos.x, b.z - pos.z);
        n.av.update(t, dt, { speed: 0, air: false, sit: false, drive: false, crouch: false, emote: "talk" }, this.meHead);
        continue;
      }
      const o = n.brain.update(dt, world, nowMs);
      pos.set(o.x, o.y, o.z);
      let dr = o.ry - n.av.root.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      n.av.root.rotation.y += dr * Math.min(1, dt * 8);
      if (!o.visible) n.av.root.visible = false;
      if (n.av.root.visible) n.av.update(t, dt, { speed: o.speed, air: false, sit: o.sit, drive: false, crouch: false, emote: o.emote }, Math.hypot(b.x - o.x, b.z - o.z) < 5 ? this.meHead : null);
      if ((o.say ?? "") !== (n.bubbleText ?? "")) {
        if (n.bubble) (n.av.root.remove(n.bubble), n.bubble.material.map?.dispose(), n.bubble.material.dispose(), (n.bubble = null));
        n.bubbleText = o.say ?? "";
        if (o.say && Math.hypot(b.x - o.x, b.z - o.z) < 25) {
          n.bubble = textSprite([o.say], { bubble: true, width: 2.6 });
          n.bubble.position.set(0, 2.55, 0);
          n.av.root.add(n.bubble);
        }
      }
    }
    // Town folk: walkers follow their paths; everyone turns to greet me when I come close.
    for (const n of this.npcs) {
      if (!n.av.root.visible || n.brain) continue;
      const pos = n.av.root.position;
      const near = Math.hypot(pos.x - b.x, pos.z - b.z) < 3.5 && Math.abs(pos.y - b.y) < 2;
      let sp = 0;
      if (n.def.path && !near) {
        const a = n.def.path[n.seg % n.def.path.length]!, c = n.def.path[(n.seg + 1) % n.def.path.length]!;
        const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
        n.k += (1.3 * dt) / len;
        if (n.k >= 1) (n.k = 0), n.seg++;
        pos.set(a[0] + (c[0] - a[0]) * n.k, 0, a[1] + (c[1] - a[1]) * n.k);
        n.av.root.rotation.y = Math.atan2(c[0] - a[0], c[1] - a[1]);
        sp = 0.35;
      } else if (near) n.av.root.rotation.y = Math.atan2(b.x - pos.x, b.z - pos.z);
      n.av.update(t, dt, { speed: sp, air: false, sit: false, drive: false, crouch: false, emote: near && !n.def.path ? (this.npcTalk === n.def.id ? "talk" : "wave") : "" }, near ? this.meHead : null);
    }

    // Gems.
    for (const g of this.gems) {
      g.rotation.y += dt * 2;
      g.position.y = 1 + Math.sin(t * 2 + g.position.x) * 0.2;
      if (g.visible && Math.hypot(g.position.x - (car?.driving ? car.c.x : b.x), g.position.z - (car?.driving ? car.c.z : b.z)) < 1.4) {
        g.visible = false;
        this.gemCount++;
        this.cb.gems(this.gemCount);
        this.sound.play("gem");
        window.setTimeout(() => (g.visible = true), 25000);
        if (this.gemCount - this.gemPaid >= 5) {
          this.gemPaid = this.gemCount;
          this.cb.reward("gems", 5, "Five gems collected", this.gemCount);
        }
      }
    }
    if (this.chest) this.chest.rotation.y += dt * 0.5;
    // Fireworks.
    for (const f of this.fireworks) {
      const age = (performance.now() - f.born) / 1000;
      const pos = f.pts.geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        f.v[i * 3 + 1]! -= 6 * dt;
        pos.setXYZ(i, pos.getX(i) + f.v[i * 3]! * dt, pos.getY(i) + f.v[i * 3 + 1]! * dt, pos.getZ(i) + f.v[i * 3 + 2]! * dt);
      }
      pos.needsUpdate = true;
      (f.pts.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - age / 2.5);
      if (age > 2.6) (this.scene.remove(f.pts), f.pts.geometry.dispose(), (f.pts.material as THREE.Material).dispose());
    }
    this.fireworks = this.fireworks.filter((f) => f.pts.parent);

    // Office floors above me hide while I am inside, so the camera sees my floor.
    const inHq = b.x > HQ.x0 - 0.5 && b.x < HQ.x1 + 0.5 && b.z > HQ.z0 - 0.5 && b.z < HQ.z1 + 0.5 && !car?.driving;
    const level = Math.round(b.y / FH);
    this.city.levels.forEach((g, l) => (g.visible = !inHq || l <= level));
    this.city.roof.visible = !inHq;
    // Inside the elevator shaft: the floor picker.
    const inLift = b.x > SHAFT.x0 && b.x < SHAFT.x1 && b.z > SHAFT.z0 && b.z < SHAFT.z1;

    const lift = this.city.elevator;
    if (this.liftMoving && !lift.moving) this.sound.play("ding", { distance: Math.hypot(b.x - 20, b.z + 56) + Math.abs(b.y - lift.y) });
    this.liftMoving = lift.moving;
    const nearPitch = Math.hypot(b.x - (PITCH.x0 + PITCH.x1) / 2, b.z - PITCH.cz) < 70;
    this.sound.setCrowd(nearPitch ? Math.max(0, 1 - Math.hypot(b.x - (PITCH.x0 + PITCH.x1) / 2, b.z - PITCH.cz) / 70) : 0);
    if (nearPitch && !this.soccer) void this.ensureSoccer();
    else if (!nearPitch && this.soccer && !(this.activity instanceof Penalty) && Math.hypot(b.x - (PITCH.x0 + PITCH.x1) / 2, b.z - PITCH.cz) > 110) (this.soccer.dispose(), (this.soccer = null));
    if (this.soccer) {
      if (!(this.activity instanceof Penalty)) {
        this.soccer.setPlayer("me", b.x, b.y, b.z);
        for (const p of this.people.values()) if (p.live && Math.abs(p.group.position.x - (PITCH.x0 + PITCH.x1) / 2) < 40) this.soccer.setPlayer(p.id, p.group.position.x, p.group.position.y, p.group.position.z);
      } else this.soccer.dropPlayer("me");
      this.soccer.step(dt);
      this.ballAuth = Math.max(0, this.ballAuth - dt);
    }

    this.updateCamera(dt);
    this.findPrompt(inLift);

    // Voice in space.
    if (this.voice.on && this.voiceState.mode !== "off") {
      const others = new Map<string, { x: number; y: number; z: number }>();
      for (const p of this.people.values()) if (p.live) others.set(p.id, p.group.position);
      this.voice.place({ x: b.x, y: b.y, z: b.z, heading: this.heading }, others, this.voiceState.mode === "room" ? "room" : "near");
    }
    // The sun follows me so shadows stay sharp nearby (its direction comes from the town's clock).
  }

  private walk(fx: number, fz: number, dt: number, run: boolean) {
    const b = this.body;
    const len = Math.hypot(fx, fz);
    let dx = 0, dz = 0;
    let speed = 0;
    if (len > 0.1) {
      const sx = fx / Math.max(1, len), sz = fz / Math.max(1, len);
      const dir = new THREE.Vector3(sx, 0, sz).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
      const v = this.crouch ? 2.2 : run ? 8.5 : 4.6;
      dx = dir.x * v * dt * Math.min(1, len);
      dz = dir.z * v * dt * Math.min(1, len);
      const want = Math.atan2(dir.x, dir.z);
      let diff = want - this.heading;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.heading += diff * Math.min(1, dt * 12);
      speed = (run ? 1 : 0.5) * Math.min(1, len);
    } else if (this.camMode === "first") this.heading = this.yaw + Math.PI;
    const jump = (this.keys.has(" ") && b.ground ? 9.2 : 0) || 0;
    const x0 = b.x, z0 = b.z;
    if (jump) this.sound.play("jump");
    moveBody(this.ph, b, dx, dz, dt, jump);
    if (b.ground && !this.wasGround) this.sound.play("land");
    this.wasGround = b.ground;
    if (b.ground && speed > 0) {
      this.stepDist += Math.hypot(b.x - x0, b.z - z0);
      if (this.stepDist > (run ? 0.85 : 0.6)) ((this.stepDist = 0), this.sound.step(this.surface(), run));
    }
    return speed;
  }

  // On a street, a sidewalk, the plaza, a car park or a race track (the rest is grass: less grip).
  private onPavement(x: number, z: number) {
    for (const r of ROADS) {
      const along = r.axis === "x" ? x : z, across = r.axis === "x" ? z : x;
      if (along > r.from - 1 && along < r.to + 1 && Math.abs(across - r.c) < r.w / 2 + r.s) return true;
    }
    if (Math.hypot(x, z) < 26 || (x > 12 && x < 32 && z > 12 && z < 32)) return true;
    return this.paved.some((f) => f(x, z));
  }

  // Manual or automatic gears (a setting).
  manualGears = false;

  private driveStep(fx: number, fz: number, dt: number) {
    const car = this.car!;
    const before = Math.abs(car.c.speed);
    const spec = car.rig?.spec;
    if (spec && car.st) {
      const st = car.st;
      const lvl = Math.max(0, (this.data.ride.level ?? 1) - 1);
      const hit = stepCar(this.ph, st, spec, { throttle: -fz, brake: this.carHold ? 1 : 0, steer: -fx, handbrake: this.keys.has(" ") || this.carHold, shift: this.shiftKey }, { grip: this.atmosphere.grip * this.carGrip, offRoad: !this.onPavement(st.x, st.z), time: this.clock.elapsedTime }, dt, car.rig!.len, car.rig!.r, { engine: lvl, brakes: lvl, tyres: lvl, suspension: lvl, gearbox: lvl });
      // The pit lane speed limiter.
      if (this.carLimit !== null) {
        const v = Math.hypot(st.vx, st.vz);
        if (v > this.carLimit) (st.vx *= this.carLimit / v), (st.vz *= this.carLimit / v);
      }
      this.shiftKey = 0;
      Object.assign(car.c, { x: st.x, z: st.z, y: st.y, heading: st.heading, speed: speedOf(st) });
      if (hit > 4) {
        this.sound.play("crash", { volume: Math.min(1, hit / 20) });
        if (st.condition < 30) this.cb.toast("Your car is badly damaged. The garage repairs it for free.", "err");
      }
      // Springs, wheels and lights.
      const rig = car.rig!;
      rig.body.rotation.x = THREE.MathUtils.clamp(st.pitch * 0.06, -0.06, 0.06);
      rig.body.rotation.z = THREE.MathUtils.clamp(-st.roll * 0.09, -0.08, 0.08);
      for (const w of rig.wheels) {
        w.spin.rotation.x = st.wheelSpin;
        if (w.front) w.obj.rotation.y = st.steer * spec.steer;
      }
      const braking = -fz < 0 && speedOf(st) > 0.5;
      if (rig.brakeMat) rig.brakeMat.emissiveIntensity = braking || this.keys.has(" ") ? 3.5 : 0.4;
      this.cb.gauge?.({ rpm: Math.round(st.rpm), redline: spec.redline, gear: st.gear, condition: Math.round(st.condition), manual: st.manual });
      this.sound.setEngine(true, (st.rpm / spec.redline) * 32, this.data.items.find((i) => i.key === car.key)?.model ?? "car");
    } else {
      if (driveCar(this.ph, car.c, { throttle: -fz, steer: -fx, brake: this.keys.has(" ") }, dt) && before > 5) this.sound.play("crash", { volume: Math.min(1, before / 20) });
      this.sound.setEngine(true, Math.abs(car.c.speed), this.data.items.find((i) => i.key === car.key)?.model ?? "car");
    }
    this.body.x = car.c.x;
    this.body.z = car.c.z;
    this.body.y = car.c.y;
    this.cb.speed(Math.round(Math.abs(car.c.speed) * 3.6));
    // The camera swings behind the car.
    if (!this.drag) {
      let d = car.c.heading + Math.PI - this.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.yaw += d * Math.min(1, dt * 2.5) * Math.min(1, Math.abs(car.c.speed) / 3);
    }
  }

  private updateCamera(dt: number) {
    const b = this.body;
    const cam = this.camera;
    if (this.activity?.constructor && (this.activity as Activity).camera && !(this.activity instanceof Run)) {
      const c = (this.activity as Activity).camera!;
      cam.position.lerp(c.pos, Math.min(1, dt * 6));
      cam.lookAt(c.look);
      return;
    }
    const car = this.car?.driving ? this.car : null;
    // A fixed camera (photo mode and tests): from a point, looking at another.
    if (this.freeCam) {
      cam.position.set(this.freeCam[0], this.freeCam[1], this.freeCam[2]);
      cam.lookAt(this.freeCam[3], this.freeCam[4], this.freeCam[5]);
      return;
    }
    if (this.camMode === "first") {
      const y = car ? car.c.y + car.seatY + 0.85 : b.y + (this.crouch ? 1.1 : 1.58);
      const x = car ? car.c.x : b.x, z = car ? car.c.z : b.z;
      cam.position.set(x, y, z);
      const lx = -Math.sin(this.yaw) * Math.cos(this.fpPitch), ly = Math.sin(this.fpPitch), lz = -Math.cos(this.yaw) * Math.cos(this.fpPitch);
      cam.lookAt(x + lx, y + ly, z + lz);
      return;
    }
    const tx = car ? car.c.x : b.x, ty = (car ? car.c.y : b.y) + 1.5, tz = car ? car.c.z : b.z;
    const dist = car ? Math.max(this.dist, 7) : this.dist;
    const dir = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const want = new THREE.Vector3(tx, ty, tz).addScaledVector(dir, dist);
    // Never look through a wall: pull the camera in front of whatever is behind me.
    const k = this.ph.ray(tx, ty, tz, want.x, want.y, want.z);
    const d = Math.max(0.6, dist * k - 0.25);
    cam.position.set(tx + dir.x * d, Math.max(0.3, ty + dir.y * d), tz + dir.z * d);
    cam.lookAt(tx, ty, tz);
  }

  private findPrompt(inLift: boolean) {
    const b = this.body;
    let best: Interact | null = null;
    let bd = Infinity;
    const consider = (i: Interact) => {
      if (Math.abs(i.y - b.y) > 2.2) return;
      const d = Math.hypot(i.x - b.x, i.z - b.z);
      if (d < i.r && d < bd) (bd = d), (best = i);
    };
    if (!this.activity && !this.car?.driving && !this.sit) {
      for (const i of this.city.interacts) consider(i);
      for (const list of this.homeInteracts.values()) for (const i of list) consider(i);
      for (const n of this.npcs) {
        const p = n.av.root.position;
        consider({ id: n.def.id, x: p.x, y: p.y, z: p.z, r: 2.4, label: `Talk to ${n.def.name}`, kind: "npc", data: { def: n.def } });
      }
      if (inLift) best = { id: "lift-in", x: b.x, y: b.y, z: b.z, r: 1, label: "Elevator: choose a floor", kind: "elevator" };
    }
    this.prompt = best;
    let label = (best as Interact | null)?.label ?? "";
    let key = (best as Interact | null)?.id ?? "";
    if (this.car && !this.car.driving && Math.hypot(this.car.c.x - b.x, this.car.c.z - b.z) < 3.2 && !this.activity) (label = "Get in"), (key = "car");
    if (this.car?.driving) (label = "Get out"), (key = "car-out");
    if (this.sit) (label = "Stand up"), (key = "stand");
    if (this.soccer && !this.activity && !this.car?.driving && this.soccer.pos.distanceTo(new THREE.Vector3(b.x, b.y + 0.2, b.z)) < 1.7) {
      label = "Kick the ball (Shift: shoot)";
      key = "kick";
      this.prompt = { id: "kick", x: b.x, y: b.y, z: b.z, r: 2, label, kind: "kick" };
    }
    if (key !== this.lastPromptKey) {
      this.lastPromptKey = key;
      this.cb.prompt(key ? { label, key } : null);
    }
  }

  private resize() {
    const w = this.el.clientWidth, h = this.el.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // The minimap: town blocks, me (an arrow) and everyone in town.
  drawMap(c: HTMLCanvasElement, big: boolean) {
    const g = c.getContext("2d");
    if (!g) return;
    const W = c.width, H = c.height;
    const scale = big ? W / 480 : W / 120;
    const cx = big ? 40 : this.body.x, cz = big ? 0 : this.body.z;
    g.fillStyle = "#86c96b";
    g.fillRect(0, 0, W, H);
    const tx = (x: number) => W / 2 + (x - cx) * scale, tz = (z: number) => H / 2 + (z - cz) * scale;
    for (const r of this.city.mapRects) {
      g.fillStyle = r.color;
      g.fillRect(tx(r.x - r.w / 2), tz(r.z - r.d / 2), r.w * scale, r.d * scale);
    }
    if (big) {
      g.fillStyle = "#0f172a";
      g.font = "bold 12px system-ui";
      g.textAlign = "center";
      for (const r of this.city.mapRects) if (r.label) g.fillText(r.label, tx(r.x), tz(r.z) + 4);
    }
    for (const p of this.people.values()) {
      if (!p.live) continue;
      g.fillStyle = "#2563eb";
      g.beginPath();
      g.arc(tx(p.target.x), tz(p.target.z), big ? 4 : 3, 0, Math.PI * 2);
      g.fill();
    }
    // Where someone sent me (clamped to the edge of the minimap when far), and tasks.
    const pin = (x: number, z: number, color: string) => {
      const px = Math.max(6, Math.min(W - 6, tx(x))), pz = Math.max(6, Math.min(H - 6, tz(z)));
      g.fillStyle = color;
      g.strokeStyle = "#111";
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(px, pz - 7);
      g.lineTo(px + 5, pz);
      g.lineTo(px, pz + 7);
      g.lineTo(px - 5, pz);
      g.closePath();
      g.fill();
      g.stroke();
    };
    for (const q of this.quests.values()) pin(q.x, q.z, "#a855f7");
    if (this.marker) pin(this.marker.x, this.marker.z, "#facc15");
    g.save();
    g.translate(tx(this.body.x), tz(this.body.z));
    g.rotate(-this.heading + Math.PI);
    g.fillStyle = "#dc2626";
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 6);
    g.lineTo(-5, 6);
    g.fill();
    g.restore();
  }

  where_() {
    return { x: this.body.x, y: this.body.y, z: this.body.z };
  }

  // The character I am talking to turns to me and talks.
  npcTalk = "";
  dispose() {
    this.stop = true;
    forgetCarDetail(this.scene);
    forgetPropDetail(this.scene);
    this.soccer?.dispose();
    this.me.dispose();
    for (const n of this.npcs) n.av.dispose();
    for (const p of this.people.values()) p.av?.dispose();
    cancelAnimationFrame(this.raf);
    this.timers.forEach((t) => window.clearInterval(t));
    this.ro.disconnect();
    this.unbind();
    this.stopActivity();
    this.atmosphere.dispose();
    this.post.dispose();
    this.traffic?.dispose();
    this.voice.stop();
    this.sound.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((o as THREE.Sprite).isSprite) {
        const s = o as THREE.Sprite;
        s.material.map?.dispose();
        s.material.dispose();
      } else if (m.isMesh && m.geometry && !["BoxGeometry", "SphereGeometry", "CylinderGeometry", "ConeGeometry", "CapsuleGeometry"].includes(m.geometry.type)) m.geometry.dispose();
      if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const RING_IN = 128;

// Admin's uploaded models (.glb): loaded, placed, turned and sized; solid ones get a box people cannot pass.
export async function placeModels(scene: THREE.Object3D, ph: Physics | null, props: TownData["layout"]["props"]) {
  const list = props.filter((p) => p.kind === "model" && p.model);
  if (!list.length) return [] as THREE.Object3D[];
  const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();
  const cache = new Map<string, Promise<THREE.Group | null>>();
  const out: THREE.Object3D[] = [];
  for (const p of list) {
    if (!cache.has(p.model!)) cache.set(p.model!, loader.loadAsync(`/api/fun/models/${p.model}`).then((g) => g.scene, () => null));
    const src = await cache.get(p.model!)!;
    if (!src) continue;
    const o = src.clone(true);
    o.position.set(p.x, p.y ?? 0, p.z);
    o.rotation.y = (p.r * Math.PI) / 180;
    o.scale.setScalar(p.s);
    o.traverse((m) => ((m as THREE.Mesh).isMesh && ((m.castShadow = true), (m.receiveShadow = true))));
    o.userData.propId = p.id;
    scene.add(o);
    out.push(o);
    if (ph && p.solid !== false) {
      o.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(o);
      if (bb.max.y - bb.min.y > 0.3) ph.box(bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z, `model:${p.id}`);
    }
  }
  return out;
}
function isDescendant(o: THREE.Object3D, root: THREE.Object3D) {
  let x: THREE.Object3D | null = o;
  while (x) {
    if (x === root) return true;
    x = x.parent;
  }
  return false;
}
