import * as THREE from "three";
import { moveBody, newBody, type Body, type Physics } from "./engine";
import type { Activity } from "./activities";
import { glass, lamp, plain, surface } from "./pbr";
import { signPlane } from "./toon";
import { Character } from "./character";
import { cleanLook } from "@/lib/fun-catalog";
import { PEOPLE } from "./people";
import { AGENTS, AGENT_KEYS, CORE_BUY, CORE_TIMES, ECON, type AbilityKey, type AgentKey } from "@/lib/strike-agents";

// Seed Strike: a shooter on closed maps of its own, away from town (made-up weapons; no real brands). Modes: Lone
// Wolf (1 against 1, rounds), bot training (targets and bots), team deathmatch and free-for-all, alone with bots or
// online with colleagues (the server checks every hit: who, how far, how fast, with what). Maps: a training
// facility, a warehouse, an urban block and a desert outpost, each with cover, high ground, stairs, several routes
// and spawn points. Weapons: pistol, SMG, rifle, shotgun, marksman rifle; recoil, spread, reloads, falloff,
// headshots. Bots patrol, find you, aim and shoot (reaction and accuracy by difficulty), take cover when hurt,
// reload behind cover and flank.

export type StrikeMode = "duel" | "training" | "tdm" | "ffa" | "core";
export const STRIKE_MODES: { key: StrikeMode; label: string; note: string }[] = [
  { key: "core", label: "Seed Core", note: "Five against five with agents and powers: buy, then attack or defend the core sites. First to 7 rounds." },
  { key: "duel", label: "Lone Wolf", note: "One against one. Rounds; first to five." },
  { key: "training", label: "Bot training", note: "Targets and easy bots; accuracy counts." },
  { key: "tdm", label: "Team deathmatch", note: "Two teams; first to 30 kills or 8 minutes." },
  { key: "ffa", label: "Free-for-all", note: "Everyone for themselves; first to 20 kills." },
];
export type StrikeMap = "facility" | "warehouse" | "urban" | "desert" | "yard";
export const STRIKE_MAPS: { key: StrikeMap; label: string; x: number; z: number }[] = [
  { key: "facility", label: "Training facility", x: 700, z: 0 },
  { key: "warehouse", label: "Industrial warehouse", x: 700, z: 220 },
  { key: "urban", label: "Urban block", x: 700, z: -220 },
  { key: "desert", label: "Desert outpost", x: 920, z: 0 },
  { key: "yard", label: "Kibra Yard", x: 920, z: 230 },
];
import { WEAPONS, type WeaponKey } from "@/lib/strike-weapons";
export { WEAPONS, type WeaponKey };
const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponKey[];
// Each agent's character (one of the anime models).
const AGENT_LOOK: Record<AgentKey, string> = { vesper: "shino", kestrel: "victoria", lula: "mei", abeba: "vita", tsehay: "bibi", zemen: "kai" };
export type Difficulty = "easy" | "normal" | "hard";
const BOT_SKILL: Record<Difficulty, { react: number; aim: number; hp: number }> = { easy: { react: 0.9, aim: 0.06, hp: 80 }, normal: { react: 0.55, aim: 0.035, hp: 100 }, hard: { react: 0.32, aim: 0.018, hp: 100 } };

export type StrikeSetup = { mode: StrikeMode; map: StrikeMap; bots: number; difficulty: Difficulty; loadout: [WeaponKey, WeaponKey]; online?: boolean; agent?: AgentKey };
// Seed Core's part of the display: the round, the side, credits, powers, the core, the buy menu.
export type CoreHud = {
  phase: "buy" | "live" | "planted" | "end";
  side: "attack" | "defend";
  round: number;
  score: [number, number];
  timer: string;
  credits: number;
  agent: string;
  color: string;
  abilities: { slot: "Q" | "E" | "X"; name: string; note: string; charges: number; max: number; pts?: number; need?: number }[];
  carrier: boolean;
  hint: string;
  progress: number | null;
  progressLabel: string;
  planted: string | null;
  blind: number;
  buy: boolean;
  shop: { key: string; label: string; cost: number; owned: boolean; afford: boolean }[];
  alive: [number, number];
  banner: string;
  history: number[];
};
export type StrikeHud = { hp: number; armor: number; weapon: string; ammo: number; mag: number; reserve: number; reloading: boolean; kills: number; deaths: number; score: string; time: string; feed: string[]; hit: number; dead: number; board: { name: string; team: number; k: number; d: number; me: boolean }[]; zoom: boolean; over: string | null; round: string; core?: CoreHud; paused: boolean; bloom: number; scope: boolean };

export type StrikeHost = {
  scene: THREE.Scene;
  ph: Physics;
  camera: THREE.PerspectiveCamera;
  body: () => Body;
  teleport: (x: number, z: number, yaw: number) => void;
  look: (dx: number, dy: number) => void;
  fov: (k: number) => void;
  hud: (h: StrikeHud | null) => void;
  // Seed Core: walking speed (slow fields, planting) and a throw upwards (Updraft).
  speed?: (k: number) => void;
  jump?: (vy: number) => void;
  // Sensitivity while aiming (times the normal one).
  scopeSens?: () => number;
  sound: (k: "shoot" | "hit" | "miss" | "win") => void;
  done: (kind: string, score: number, coins: number, text: string) => void;
  // Online: colleagues in the match (from the town's sync) and sending hits to the server.
  others: () => { id: string; name: string; x: number; y: number; z: number }[];
  hitOnline: (to: string, w: WeaponKey, hs: boolean) => void;
  canvas: HTMLCanvasElement;
};

type Layout = {
  size: [number, number];
  floor: "concrete" | "metal" | "gravel" | "tiles" | "stone";
  wall: "concrete" | "brick" | "factory" | "plaster";
  light: string;
  boxes: [number, number, number, number, number, number, string?][];
  spawns: [number, number][];
  props?: [string, number, number][];
  // Seed Core maps: the two sites, where each side starts, a route network for bots, where attackers smoke a
  // site's ways in, and where defenders hold.
  core?: {
    sites: { key: "A" | "B"; x: number; z: number; r: number }[];
    west: [number, number][];
    east: [number, number][];
    nav: { pts: [number, number][]; edges: [number, number][] };
    entries: Record<"A" | "B", [number, number][]>;
    anchors: Record<"A" | "B", [number, number][]>;
  };
};
// Boxes: x0, z0, x1, z1, y0, y1 (metres from the map centre), material key.
const LAYOUTS: Record<StrikeMap, Layout> = {
  facility: {
    size: [60, 44], floor: "concrete", wall: "concrete", light: "#e8f0ff",
    boxes: [[-6, -4, 6, -2, 0, 1.2], [-6, 2, 6, 4, 0, 1.2], [-20, -14, -16, -10, 0, 2.2], [16, 10, 20, 14, 0, 2.2], [-20, 10, -16, 14, 0, 1.2], [16, -14, 20, -10, 0, 1.2], [-2, -18, 2, -14, 0, 2.6], [-2, 14, 2, 18, 0, 2.6], [-29, -6, -24, 6, 0, 3], [24, -6, 29, 6, 0, 3], [-12, -22, -10, -12, 0, 3.4, "brick"], [10, 12, 12, 22, 0, 3.4, "brick"], [-24, -6, -20, -4, 0, 1.5], [20, 4, 24, 6, 0, 1.5]],
    spawns: [[-26, -16], [26, 16], [-26, 16], [26, -16], [0, -20], [0, 20]],
  },
  warehouse: {
    size: [70, 50], floor: "concrete", wall: "factory", light: "#fff1d6",
    boxes: [[-30, -18, -18, -12, 0, 2.6, "metal"], [-30, -11, -18, -5, 0, 2.6, "metal"], [18, 5, 30, 11, 0, 2.6, "metal"], [18, 12, 30, 18, 0, 2.6, "metal"], [-6, -6, 6, 6, 3.5, 3.8, "metal"], [-6, -6, -5.6, 6, 0, 3.5, "metal"], [5.6, -6, 6, 6, 0, 3.5, "metal"], [-14, 14, -10, 18, 0, 1.4], [10, -18, 14, -14, 0, 1.4], [-2, -24, 2, -20, 0, 1.2], [-2, 20, 2, 24, 0, 1.2], [-34, -2, -30, 2, 0, 2, "metal"], [30, -2, 34, 2, 0, 2, "metal"]],
    spawns: [[-30, 20], [30, -20], [-30, -22], [30, 22], [0, -14], [0, 14]],
    props: [["barrel", -12, 6], ["barrel", -11, 7], ["crate", 12, -6], ["crate", 13, -4.5], ["tyre", -20, 0], ["tyre", 20, 1], ["cardboard", 4, 16], ["barrel_blue", -4, -16]],
  },
  urban: {
    size: [70, 56], floor: "gravel", wall: "brick", light: "#ffe9c7",
    boxes: [[-30, -24, -14, -10, 0, 7, "brick"], [14, 10, 30, 24, 0, 7, "brick"], [-30, 10, -18, 24, 0, 4.5, "plaster"], [18, -24, 30, -10, 0, 4.5, "plaster"], [-6, -3, 6, 3, 0, 1.4, "metal"], [-10, 12, -6, 15, 0, 1.1], [6, -15, 10, -12, 0, 1.1], [-14, -2, -12, 6, 0, 2.2], [12, -6, 14, 2, 0, 2.2], [-2, -26, 2, -22, 0, 3], [-2, 22, 2, 26, 0, 3]],
    spawns: [[-26, 0], [26, 0], [0, -18], [0, 18], [-8, 26], [8, -26]],
    props: [["trash", -12, 9], ["utility_box", 12, -8], ["barrel", 0, 10], ["crate", 0, -10]],
  },
  desert: {
    size: [80, 60], floor: "gravel", wall: "plaster", light: "#fff4dc",
    boxes: [[-8, -8, 8, -6, 0, 1.2, "plaster"], [-8, 6, 8, 8, 0, 1.2, "plaster"], [-30, -20, -24, -14, 0, 6, "plaster"], [24, 14, 30, 20, 0, 6, "plaster"], [-30, -20, -24, -14, 6, 6.2, "metal"], [-36, 4, -32, 8, 0, 1], [32, -8, 36, -4, 0, 1], [-14, 18, -6, 20, 0, 1.6], [6, -20, 14, -18, 0, 1.6], [-20, -2, -18, 6, 0, 2], [18, -6, 20, 2, 0, 2]],
    spawns: [[-34, -24], [34, 24], [-34, 24], [34, -24], [0, -26], [0, 26]],
    props: [["barrel", -10, 0], ["crate", 10, 0], ["tyre", 0, 14], ["tyre", 0, -14]],
  },
  // Kibra Yard (Seed Core): attackers start west, defenders east. Three lanes (north to A, mid, south to B), a
  // building between the sites so mid splits to A or B, cover on each site, a wall in front of each spawn.
  yard: {
    size: [96, 72], floor: "stone", wall: "plaster", light: "#ffeccc",
    boxes: [
      [-34, -13, 8, -11, 0, 4.2, "stucco"], [-34, 11, 8, 13, 0, 4.2, "terracotta"],
      [-36, -4, -34, 4, 0, 3, "teal"], [38, -6, 40, 6, 0, 3, "teal"],
      [-4, -3, 4, 3, 0, 1.3, "metal"], [-20, -7, -17, -4, 0, 2.2, "wood"], [-20, 4, -17, 7, 0, 2.2, "wood"],
      [-22, -30, -18, -26, 0, 1.4, "wood"], [-6, -22, -2, -18, 0, 2.2, "stucco"], [-22, 26, -18, 30, 0, 1.4, "wood"], [-6, 18, -2, 22, 0, 2.2, "terracotta"],
      [14, -8, 22, 8, 0, 5, "stucco"],
      [26, -24, 29, -21, 0, 1.4, "metal"], [33, -30, 36, -27, 0, 2.2, "wood"], [24, -16, 27, -14, 0, 1.2, "wood"], [31, -19, 33, -17, 0, 1.0, "metal"],
      [26, 21, 29, 24, 0, 1.4, "metal"], [33, 27, 36, 30, 0, 2.2, "wood"], [24, 14, 27, 16, 0, 1.2, "wood"], [31, 17, 33, 19, 0, 1.0, "metal"],
    ],
    spawns: [[-44, 0], [44, 0]],
    props: [["barrel", -8, -30], ["crate", 10, 30], ["barrel_blue", 36, -14], ["crate", 36, 14], ["tyre", -26, 0], ["utility_box", 24, -6]],
    core: {
      sites: [{ key: "A", x: 30, z: -22, r: 7 }, { key: "B", x: 30, z: 22, r: 7 }],
      west: [[-44, -6], [-44, 0], [-44, 6], [-41, -3], [-41, 3]],
      east: [[44, -9], [44, 9], [46, -3], [46, 3], [43, 0]],
      nav: {
        pts: [[-42, 0], [-30, -22], [-10, -26], [16, -22], [30, -22], [-30, 0], [-10, 0], [10, 0], [14, -10], [14, 10], [-30, 22], [-10, 26], [16, 22], [30, 22], [44, 0], [41, -12], [41, 12]],
        edges: [[0, 1], [0, 5], [0, 10], [1, 2], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 4], [8, 3], [7, 9], [9, 13], [9, 12], [10, 11], [11, 12], [12, 13], [14, 15], [15, 4], [14, 16], [16, 13]],
      },
      entries: { A: [[20, -22], [17, -11]], B: [[20, 22], [17, 11]] },
      anchors: { A: [[34, -20], [32, -29], [25, -18]], B: [[34, 20], [32, 29], [25, 18]] },
    },
  },
};

type Bot = {
  name: string; team: number; body: Body; av: Character; hp: number; yaw: number; target: Bot | "me" | null; seeAt: number; nextShot: number; ammo: number; reloadUntil: number; state: "patrol" | "engage" | "cover" | "dead"; goal: THREE.Vector3; respawnAt: number; kills: number; deaths: number; weapon: WeaponKey; strafe: number;
  // Seed Core.
  agent?: AgentKey; armor?: number; credits?: number; blindUntil?: number; slowUntil?: number; shownUntil?: number; marker?: THREE.Sprite; path?: THREE.Vector3[]; pathTo?: string; anchor?: THREE.Vector3 | null; used?: Set<string>; prog?: number;
};
type Zone = { kind: "smoke" | "slow" | "lock" | "trip"; x: number; z: number; r: number; until: number; team: number; mesh?: THREE.Object3D };
type Core = {
  // Who won each round (0 my team, 1 theirs), my kills this round, whether I was the last of my team standing.
  history: number[];
  roundKills: number;
  alone: boolean;
  phase: "buy" | "live" | "planted" | "end";
  ends: number;
  round: number;
  score: [number, number];
  attack: 0 | 1;
  credits: number;
  streak: [number, number];
  carrier: Bot | "me" | null;
  dropped: THREE.Vector3 | null;
  device: THREE.Group;
  planted: { site: "A" | "B"; x: number; z: number; at: number } | null;
  prog: number;
  site: "A" | "B";
  agent: AgentKey;
  charges: { q: number; e: number };
  pts: number;
  armorBought: number;
  primary: WeaponKey | null;
  zones: Zone[];
  walls: { mesh: THREE.Mesh; until: number; tag: string }[];
  blindUntil: number;
  slowUntil: number;
  buffUntil: number;
  precision: number;
  heal: number;
  buy: boolean;
  banner: string;
  bannerUntil: number;
  liveAt: number;
  over: boolean;
};
type Tgt = { m: THREE.Group; x: number; y: number; z: number; up: number; hit: boolean };

// A smoke puff texture (a soft round blot), made once.
let puffTex: THREE.Texture | null = null;
function smokePuff() {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 31);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.55, "rgba(255,255,255,.75)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}

// Real weapon models (Sketchfab, CC BY 4.0; credits in public/models/CREDITS.txt), in the hands: turned so the
// muzzle points ahead (-z), at their real length, the grip near the hand; parts that are not the gun (loose
// bullets in the file) left out. Game names are our own (see strike-weapons.ts).
const WEAPON_MODEL: Record<string, { file: string; length: number; muzzleAtPlusZ: boolean; drop?: RegExp; pick?: number }> = {
  pistol: { file: "pistol", length: 0.19, muzzleAtPlusZ: false },
  smg: { file: "smg", length: 0.6, muzzleAtPlusZ: true },
  rifle: { file: "rifle", length: 0.86, muzzleAtPlusZ: false },
  shotgun: { file: "shotgun", length: 1.0, muzzleAtPlusZ: false },
  marksman: { file: "sniper", length: 1.25, muzzleAtPlusZ: false, drop: /^(Case|Bullet)$/ },
  heavy: { file: "ak", length: 0.88, muzzleAtPlusZ: true },
  revolver: { file: "revolver", length: 0.32, muzzleAtPlusZ: true },
};
const weaponCache = new Map<string, Promise<THREE.Object3D | null>>();
// The maps' materials by key (painted stucco in warm colours, crates, metal, brick).
const MAP_MATS: Record<string, () => THREE.Material> = {
  metal: () => surface("metal", { tint: "#9aa3ab" }),
  brick: () => surface("brick", { tint: "#ffffff" }),
  plaster: () => surface("plaster", { tint: "#e3d2ad" }),
  stucco: () => surface("plaster", { tint: "#ead7b0" }),
  terracotta: () => surface("plaster", { tint: "#cf7f5a" }),
  teal: () => surface("plaster", { tint: "#7fb3aa" }),
  wood: () => surface("planks", { tint: "#c9a77c" }),
  stone: () => surface("stone", { tint: "#e6ddcc" }),
  concrete: () => surface("concrete", { tint: "#cfcac0" }),
};
async function weaponModel(key: string): Promise<{ obj: THREE.Object3D; muzzle: THREE.Vector3 } | null> {
  const cfg = WEAPON_MODEL[key];
  if (!cfg) return null;
  if (!weaponCache.has(cfg.file))
    weaponCache.set(
      cfg.file,
      (async () => {
        const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three/examples/jsm/libs/meshopt_decoder.module.js")]);
        const l = new GLTFLoader();
        l.setMeshoptDecoder(MeshoptDecoder);
        return (await l.loadAsync(`/models/weapons/${cfg.file}.glb`)).scene;
      })().catch(() => null),
    );
  const src = await weaponCache.get(cfg.file)!;
  if (!src) return null;
  const model = src.clone(true);
  const out: THREE.Object3D[] = [];
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((o as THREE.Light).isLight || (cfg.drop && m.isMesh && !Array.isArray(m.material) && cfg.drop.test(m.material.name))) out.push(o);
    if (m.isMesh) (m.castShadow = false), (m.receiveShadow = false), (m.frustumCulled = false);
  });
  out.forEach((o) => o.parent?.remove(o));
  // Lie it along z (its longest side), muzzle ahead, at its real length, centred just ahead of the hand.
  const holder = new THREE.Group();
  const turn = new THREE.Group();
  turn.add(model);
  holder.add(turn);
  const b = new THREE.Box3().setFromObject(model);
  const sz = b.getSize(new THREE.Vector3());
  if (sz.y > sz.z && sz.y > sz.x) model.rotation.x = -Math.PI / 2;
  else if (sz.x > sz.z) model.rotation.y = Math.PI / 2;
  if (cfg.muzzleAtPlusZ) turn.rotation.y = Math.PI;
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(holder);
  const s2 = b2.getSize(new THREE.Vector3());
  holder.scale.setScalar(cfg.length / Math.max(0.01, s2.z));
  holder.updateMatrixWorld(true);
  const b3 = new THREE.Box3().setFromObject(holder);
  const len = b3.max.z - b3.min.z;
  holder.position.set(-(b3.min.x + b3.max.x) / 2, -(b3.min.y + b3.max.y) / 2 - 0.01, -(b3.max.z - len * 0.32));
  return { obj: holder, muzzle: new THREE.Vector3(0, 0.02, holder.position.z + b3.min.z - 0.02) };
}

export class Strike implements Activity {
  readonly kind = "strike";
  readonly walks = true;
  readonly fps = true;
  private group = new THREE.Group();
  private origin: THREE.Vector3;
  private layout: Layout;
  private bots: Bot[] = [];
  private targets: Tgt[] = [];
  private weapon: WeaponKey;
  private ammo: Record<string, number> = {};
  private reserve: Record<string, number> = {};
  private reloadUntil = 0;
  private nextShot = 0;
  private trigger = false;
  private zoom = false;
  private hp = 100;
  private armor = 50;
  private kills = 0;
  private deaths = 0;
  private deadUntil = 0;
  private feed: string[] = [];
  private hitMark = 0;
  private gun = new THREE.Group();
  private flash: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private fx: { m: THREE.Object3D; until: number }[] = [];
  private endsAt: number;
  private over: string | null = null;
  private rounds = { me: 0, them: 0, n: 1 };
  private shots = 0;
  private hits = 0;
  private recoil = 0;
  // Team modes: team deathmatch and Seed Core (team 0 is mine).
  private teams: boolean;
  private loadout: [WeaponKey, WeaponKey];
  private core: Core | null = null;
  private holdF = false;
  private keyUp = (e: KeyboardEvent) => e.key.toLowerCase() === "f" && (this.holdF = false);
  // Mouse look while the mouse is locked; aiming down sights or a scope slows it (zoom and the scoped setting).
  private lockMove = (e: MouseEvent) => {
    if (document.pointerLockElement !== this.host.canvas || this.paused) return;
    const k = 0.6 * (this.zoom ? (this.host.scopeSens?.() ?? 1) / WEAPONS[this.weapon].zoom : 1);
    this.host.look(e.movementX * k, e.movementY * k);
  };
  // Paused (Esc, or the mouse let go): the menu shows; nothing fires.
  private paused = false;
  private wasLocked = false;
  private lockChange = () => {
    const locked = document.pointerLockElement === this.host.canvas;
    if (locked) (this.paused = false), (this.wasLocked = true);
    else if (this.wasLocked && !this.over && !this.core?.buy) (this.paused = true), (this.trigger = false), (this.zoom = false), (this.lostAt = performance.now());
  };
  private lostAt = 0;
  // Ask for the mouse; the browser refuses without a click (or right after Esc), which is fine.
  private lock() {
    try {
      const p = this.host.canvas.requestPointerLock?.() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      /* no pointer lock here */
    }
  }
  private keyDown = (e: KeyboardEvent) => this.key(e.key.toLowerCase());
  private mouseRight = (e: MouseEvent) => (e.button === 2 ? ((this.zoom = e.type === "mousedown"), e.preventDefault()) : 0);
  private noMenu = (e: Event) => e.preventDefault();
  constructor(
    private host: StrikeHost,
    private setup: StrikeSetup,
  ) {
    const m = STRIKE_MAPS.find((x) => x.key === (setup.mode === "core" ? "yard" : setup.map))!;
    this.origin = new THREE.Vector3(m.x, 0, m.z);
    if (setup.mode === "core") setup = this.setup = { ...setup, map: "yard", loadout: ["pistol", "pistol"] };
    this.layout = LAYOUTS[setup.map];
    this.teams = setup.mode === "tdm" || setup.mode === "core";
    this.loadout = [...setup.loadout];
    this.weapon = this.loadout[0];
    for (const w of WEAPON_KEYS) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
    this.buildMap();
    host.scene.add(this.group);
    // The weapon in my hands, and its muzzle flash.
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd27a" }));
    this.flashLight = new THREE.PointLight("#ffbb66", 0, 6, 2);
    this.buildGun();
    host.scene.add(this.gun, this.flashLight);
    // Bots: teams in team modes, alone in free-for-all, one rival in Lone Wolf, easy ones in training.
    const n = setup.online ? 0 : setup.mode === "core" ? 9 : setup.mode === "duel" ? 1 : setup.mode === "training" ? Math.max(2, setup.bots) : setup.bots;
    const names = ["Raven", "Atlas", "Nova", "Viper", "Ghost", "Bishop", "Echo", "Hawk", "Onyx", "Sable", "Titan"];
    // Seed Core: four team mates and five rivals, each an agent (mine is not repeated on my side).
    const mine = setup.agent ?? "vesper";
    const pool0 = AGENT_KEYS.filter((k) => k !== mine).sort(() => Math.random() - 0.5);
    const pool1 = [...AGENT_KEYS].sort(() => Math.random() - 0.5);
    if (setup.mode === "core") this.core = this.newCore(mine);
    for (let i = 0; i < n; i++) {
      const team = setup.mode === "core" ? (i < 4 ? 0 : 1) : setup.mode === "tdm" ? (i % 2 === 0 ? 1 : 0) : 1;
      const agent = setup.mode === "core" ? (team === 0 ? pool0[i % pool0.length]! : pool1[(i - 4) % pool1.length]!) : undefined;
      const sp = this.spawn(team, i + 1);
      // Agents are stylised heroes (the anime characters) in their own colours; other modes' bots are people.
      const look = agent
        ? { ...cleanLook({}), style: "anime" as const, base: AGENT_LOOK[agent], tintClothes: true, shirt: AGENTS[agent].color, pants: "#1f2430", shoes: "#111318" }
        : { ...cleanLook({}), style: "realistic" as const, base: PEOPLE[(i * 3) % PEOPLE.length]!.key };
      const av = new Character(look, true);
      av.setDetailed(true);
      this.host.scene.add(av.root);
      const b: Bot = { name: agent ? `${names[i % names.length]} (${AGENTS[agent].name})` : names[i % names.length]!, team, body: newBody(sp.x, 0, sp.z), av, hp: BOT_SKILL[setup.difficulty].hp, yaw: 0, target: null, seeAt: 0, nextShot: 0, ammo: 30, reloadUntil: 0, state: "patrol", goal: this.randomPoint(), respawnAt: 0, kills: 0, deaths: 0, weapon: (["rifle", "smg", "pistol", "shotgun"] as WeaponKey[])[i % 4]!, strafe: 1 };
      if (agent) {
        b.agent = agent;
        b.credits = ECON.start;
        b.armor = 0;
        b.used = new Set();
        b.weapon = "pistol";
        // A marker over a rival shown by a power (seen through walls).
        if (team === 1) {
          const c = document.createElement("canvas");
          c.width = c.height = 64;
          const g = c.getContext("2d")!;
          g.fillStyle = "#ef4444";
          g.beginPath();
          g.moveTo(32, 58);
          g.lineTo(8, 14);
          g.lineTo(56, 14);
          g.closePath();
          g.fill();
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
          sprite.scale.set(0.5, 0.5, 0.5);
          sprite.position.y = 2.3;
          sprite.visible = false;
          sprite.renderOrder = 999;
          av.root.add(sprite);
          b.marker = sprite;
        }
      }
      // A team band so you can tell friend from foe.
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), plain(team === 0 ? "#2563eb" : "#dc2626", { rough: 0.5, emissive: team === 0 ? "#1d4ed8" : "#b91c1c", emissiveIntensity: 0.6 }));
      band.position.y = 1.15;
      av.root.add(band);
      this.bots.push(b);
    }
    if (setup.mode === "training") this.spawnTargets();
    const sp = this.spawn(0, 0);
    host.teleport(sp.x, sp.z, this.facingCentre(sp));
    if (this.core) this.coreRound(true);
    this.endsAt = performance.now() + (setup.mode === "core" ? 60 : setup.mode === "tdm" ? 8 : setup.mode === "ffa" ? 10 : setup.mode === "training" ? 3 : 15) * 60_000;
    document.addEventListener("mousemove", this.lockMove);
    document.addEventListener("pointerlockchange", this.lockChange);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    host.canvas.addEventListener("mousedown", this.mouseRight);
    host.canvas.addEventListener("mouseup", this.mouseRight);
    host.canvas.addEventListener("contextmenu", this.noMenu);
    this.feedLine(`${STRIKE_MODES.find((x) => x.key === setup.mode)!.label} on ${m.label}. Click to lock the mouse; Esc to leave.`);
  }

  private at(x: number, z: number) {
    return new THREE.Vector3(this.origin.x + x, 0, this.origin.z + z);
  }
  private facingCentre(p: THREE.Vector3) {
    return Math.atan2(p.x - this.origin.x, p.z - this.origin.z);
  }
  // A spawn for a team (0 mine), away from enemies where possible.
  private spawn(team: number, i: number) {
    const C = this.layout.core;
    if (this.core && C) {
      const list = this.core.attack === team ? C.west : C.east;
      const p = list[i % list.length]!;
      return this.at(p[0], p[1]);
    }
    const s = this.layout.spawns;
    const pick = this.teams ? s.filter((_, k) => k % 2 === team) : s;
    const p = pick[(i + Math.floor(Math.random() * pick.length)) % pick.length]!;
    return this.at(p[0], p[1]);
  }
  private randomPoint() {
    const [w, d] = this.layout.size;
    for (let k = 0; k < 20; k++) {
      const p = this.at((Math.random() - 0.5) * (w - 6), (Math.random() - 0.5) * (d - 6));
      const pos = { x: p.x, z: p.z };
      if (!this.host.ph.resolve(pos, 0.5, 0, 1.7, 0.45)) return p;
    }
    return this.at(0, 0);
  }

  private buildMap() {
    const L = this.layout;
    const [w, d] = L.size;
    const ph = this.host.ph;
    const tag = "arena";
    ph.remove(tag);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, d), surface(L.floor, { tint: L.floor === "gravel" ? "#e8d9b8" : "#ffffff" }));
    floor.position.copy(this.at(0, 0)).setY(-0.1);
    floor.receiveShadow = true;
    this.group.add(floor);
    const wallM = surface(L.wall, { tint: L.wall === "plaster" ? "#e7d7b6" : "#ffffff" });
    const H = 9;
    for (const [x, z, ww, dd] of [[0, -d / 2, w, 0.6], [0, d / 2, w, 0.6], [-w / 2, 0, 0.6, d], [w / 2, 0, 0.6, d]] as const) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, H, dd), wallM);
      m.position.copy(this.at(x, z)).setY(H / 2);
      m.receiveShadow = true;
      this.group.add(m);
      ph.sized(m.position.x, H / 2, m.position.z, ww, H, dd, tag);
    }
    // A roof for indoor maps (with skylights), open sky for the outdoor ones.
    if (this.setup.map === "facility" || this.setup.map === "warehouse") {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(w, 0.3, d), plain("#4a4f55", { rough: 0.7, metal: 0.4 }));
      roof.position.copy(this.at(0, 0)).setY(H);
      this.group.add(roof);
      for (let x = -w / 2 + 8; x < w / 2; x += 12) {
        const strip = new THREE.Mesh(new THREE.BoxGeometry(3, 0.12, 1.2), lamp(L.light, 2.5, 2.5));
        strip.position.copy(this.at(x, 0)).setY(H - 0.2);
        this.group.add(strip);
        for (const z of [-d / 4, d / 4]) {
          const s2 = strip.clone();
          s2.position.copy(this.at(x, z)).setY(H - 0.2);
          this.group.add(s2);
        }
      }
      const fill = new THREE.PointLight(L.light, 30, 60, 1.2);
      fill.position.copy(this.at(0, 0)).setY(H - 1);
      this.group.add(fill);
    }
    for (const [x0, z0, x1, z1, y0, y1, mat] of L.boxes) {
      const key = mat ?? "concrete";
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), MAP_MATS[key]?.() ?? surface("concrete", { tint: "#cfcac0" }));
      // Tall walls get a light cap, like the trims on real stucco walls.
      if (y1 - y0 >= 2.8 && key !== "wood" && key !== "metal") {
        const cap = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.24, 0.22, z1 - z0 + 0.24), plain("#f1e6cf", { rough: 0.8 }));
        cap.position.copy(this.at((x0 + x1) / 2, (z0 + z1) / 2)).setY(y1 + 0.11);
        cap.castShadow = true;
        this.group.add(cap);
      }
      const c = this.at((x0 + x1) / 2, (z0 + z1) / 2);
      m.position.set(c.x, (y0 + y1) / 2, c.z);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
      ph.sized(c.x, (y0 + y1) / 2, c.z, x1 - x0, y1 - y0, z1 - z0, tag);
    }
    // Stairs up to the high ground on the warehouse catwalk and the desert tower (steps you walk up).
    const stairs = (x: number, z: number, dirX: number, top: number) => {
      const steps = Math.ceil(top / 0.3);
      for (let k = 0; k < steps; k++) {
        const c = this.at(x + dirX * k * 0.45, z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.45, (k + 1) * 0.3, 2), surface("metal", { tint: "#8f979e" }));
        m.position.set(c.x, ((k + 1) * 0.3) / 2, c.z);
        m.castShadow = true;
        this.group.add(m);
        ph.sized(c.x, ((k + 1) * 0.3) / 2, c.z, 0.45, (k + 1) * 0.3, 2, tag);
      }
    };
    if (this.setup.map === "warehouse") (stairs(-14, 0, 1, 3.5), stairs(14, 0, -1, 3.5));
    if (this.setup.map === "desert") stairs(-20, -17, -1, 6);
    // Props (real models; solid).
    for (const [k, x, z] of L.props ?? []) {
      const c = this.at(x, z);
      void import("./props").then(({ placeProp }) => placeProp(this.group, k, c.x, c.z, 0));
      ph.post({ x: c.x, z: c.z, r: 0.6, minY: 0, maxY: 1.2, tag } as never);
    }
    if (this.setup.map === "yard") this.yardDecor();
    for (const st of L.core?.sites ?? []) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(st.r - 0.25, st.r, 48), new THREE.MeshBasicMaterial({ color: "#f5c518", transparent: true, opacity: 0.55, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(this.at(st.x, st.z)).setY(0.03);
      this.group.add(ring);
      const sign = signPlane(`Site ${st.key}`, 3.2, 1.2, "#111827", "#f5c518");
      sign.position.copy(this.at(st.x, st.z)).setY(4.2);
      sign.rotation.y = -Math.PI / 2;
      this.group.add(sign);
    }
    const title = signPlane(STRIKE_MAPS.find((x) => x.key === this.setup.map)!.label, 8, 1.2, "#111827", "#f5c518");
    title.position.copy(this.at(0, -d / 2 + 0.4)).setY(5);
    this.group.add(title);
    if (this.setup.map === "urban") {
      // Windows on the buildings (glass) for looks.
      for (const [x, z] of [[-22, -9.9], [22, 9.9]] as const) {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(10, 1.6), glass("#2b3640", 0.6));
        g.position.copy(this.at(x, z)).setY(4.5);
        this.group.add(g);
      }
    }
  }

  private buildGun() {
    const built = this.weapon;
    // The real model (public/models/weapons) replaces the drawn one when it has loaded.
    void weaponModel(built).then((m) => {
      if (!m || this.weapon !== built) return;
      for (const c of [...this.gun.children]) if (c !== this.flash) this.gun.remove(c);
      this.gun.add(m.obj);
      this.flash.position.copy(m.muzzle);
    });
    const metal = plain("#2a2d31", { rough: 0.35, metal: 0.7 });
    const poly = plain("#1b1c1f", { rough: 0.7 });
    const w = this.weapon;
    this.gun.clear();
    const len = w === "pistol" ? 0.2 : w === "smg" ? 0.38 : w === "shotgun" ? 0.75 : w === "marksman" ? 0.95 : 0.7;
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, len * 0.55), metal);
    body.position.z = -len * 0.3;
    this.gun.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len * 0.5, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -len * 0.7);
    this.gun.add(barrel);
    if (w !== "pistol") {
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.22), poly);
      stock.position.set(0, -0.02, 0.08);
      this.gun.add(stock);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.14, 0.06), poly);
      mag.position.set(0, -0.1, -len * 0.3);
      mag.rotation.x = 0.2;
      this.gun.add(mag);
    }
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.11, 0.05), poly);
    grip.position.set(0, -0.08, -0.02);
    grip.rotation.x = -0.25;
    this.gun.add(grip);
    if (w === "marksman" || w === "rifle") {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.2, 10), metal);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, 0.08, -len * 0.35);
      this.gun.add(scope);
    }
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 0.12), plain("#2f2a26", { rough: 0.85 }));
    hand.position.set(0, -0.06, -0.02);
    this.gun.add(hand);
    this.flash.position.set(0, 0.02, -len * 0.98);
    this.flash.visible = false;
    this.gun.add(this.flash);
  }

  // Kibra Yard's dressing: archways over the three lanes' entrances, banners in the teams' colours on the long
  // walls, hanging lamps; nothing here blocks a shot (the arches are high).
  private yardDecor() {
    const trimM = plain("#f1e6cf", { rough: 0.8 });
    const arch = (x: number, z0: number, z1: number) => {
      for (const z of [z0, z1]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.6, 0.8), MAP_MATS.terracotta!());
        p.position.copy(this.at(x, z)).setY(2.3);
        p.castShadow = true;
        this.group.add(p);
        this.host.ph.sized(p.position.x, 2.3, p.position.z, 0.8, 4.6, 0.8, "arena");
      }
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, Math.abs(z1 - z0) + 0.8), MAP_MATS.terracotta!());
      top.position.copy(this.at(x, (z0 + z1) / 2)).setY(4.9);
      top.castShadow = true;
      this.group.add(top);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, Math.abs(z1 - z0) + 1), trimM);
      cap.position.copy(this.at(x, (z0 + z1) / 2)).setY(5.45);
      this.group.add(cap);
    };
    arch(-30, -34, -14);
    arch(-30, -10, 10);
    arch(-30, 14, 34);
    const banner = (x: number, z: number, color: string, ry: number) => {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3), plain(color, { rough: 0.9, side: THREE.DoubleSide }));
      b.position.copy(this.at(x, z)).setY(2.6);
      b.rotation.y = ry;
      this.group.add(b);
    };
    for (let x = -26; x <= 2; x += 10) (banner(x, -10.85, "#2563eb", 0), banner(x, 10.85, "#dc2626", Math.PI));
    for (const [x, z] of [[-10, -24], [-10, 24], [0, 0], [26, -22], [26, 22]] as const) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), plain("#fff1c4", { emissive: "#ffd27a", emissiveIntensity: 2.2 }));
      l.position.copy(this.at(x, z)).setY(4.2);
      this.group.add(l);
    }
  }

  private spawnTargets() {
    for (let k = 0; k < 8; k++) {
      const p = this.randomPoint();
      const g = new THREE.Group();
      const board = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 0.05), plain("#d9c69a", { rough: 0.9 }));
      board.position.y = 0.95;
      g.add(board);
      const head = new THREE.Mesh(new THREE.CircleGeometry(0.16, 16), plain("#b91c1c", { rough: 0.6 }));
      head.position.set(0, 1.55, 0.03);
      g.add(head);
      g.position.copy(p);
      g.rotation.y = this.facingCentre(p) + Math.PI;
      this.group.add(g);
      this.targets.push({ m: g, x: p.x, y: 0, z: p.z, up: 1, hit: false });
    }
  }

  private feedLine(t: string) {
    this.feed = [t, ...this.feed].slice(0, 5);
  }

  key(k: string) {
    if (k === "1" || k === "2") {
      const w = this.loadout[Number(k) - 1]!;
      if (w !== this.weapon) (this.weapon = w), (this.reloadUntil = 0), this.buildGun();
    } else if (k === "r") this.reload();
    else if (this.core) {
      if (k === "q" || k === "e" || k === "x") this.ability(k);
      else if (k === "b" && this.core.phase === "buy") {
        this.core.buy = !this.core.buy;
        // The menu needs the mouse.
        if (this.core.buy && document.pointerLockElement) document.exitPointerLock();
      }
      else if (k === "f") this.holdF = true;
    }
  }
  private reload() {
    const W = WEAPONS[this.weapon];
    if (this.reloadUntil || this.ammo[this.weapon]! >= W.mag || this.reserve[this.weapon]! <= 0) return;
    this.reloadUntil = performance.now() + W.reload * 1000;
  }
  down(_ndc?: unknown, pointer?: string) {
    // With a mouse, the first click (or one after a pause) only takes the mouse; shots start once it is locked.
    // Touch screens have no lock and fire straight away.
    if (pointer === "mouse" && document.pointerLockElement !== this.host.canvas) return this.lock();
    if (this.paused) return;
    this.trigger = true;
    this.fire();
  }
  up() {
    this.trigger = false;
  }

  // One shot (or a shotgun's pellets): a ray from the eye with spread; walls stop it; bots, targets and online
  // colleagues take damage (head twice as much); tracer, flash, impact.
  private fire() {
    const now = performance.now();
    const W = WEAPONS[this.weapon];
    if (now < this.deadUntil || this.over || this.paused) return;
    if (this.core && (this.core.phase === "buy" || this.core.phase === "end")) return;
    if (this.reloadUntil || now < this.nextShot) return;
    if (this.ammo[this.weapon]! <= 0) return this.reload();
    const burst = !!this.core && now < this.core.buffUntil;
    this.nextShot = now + 60000 / (W.rpm * (burst ? 1.3 : 1));
    this.ammo[this.weapon]!--;
    const precise = !!this.core && this.core.precision > 0;
    if (precise) this.core!.precision--;
    this.shots++;
    const cam = this.host.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    // Standing is steadiest, walking (Shift) nearly so, running and jumping are not.
    const runK = !this.host.body().ground ? 2.6 : this.speedNow > 4 ? 1.8 : this.speedNow > 1 ? 1.12 : 1;
    const spread = W.spread * (this.zoom ? 0.4 : 1) * runK + this.recoil * 0.4;
    let hitAny = false;
    for (let p = 0; p < W.pellets; p++) {
      const dir = fwd.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)).normalize();
      const far = eye.clone().addScaledVector(dir, W.range);
      const k = this.host.ph.ray(eye.x, eye.y, eye.z, far.x, far.y, far.z);
      const wallDist = W.range * k;
      let best: { d: number; hs: boolean; bot?: Bot; tgt?: Tgt; online?: string } | null = null;
      const test = (cx: number, cz: number, y0: number, bodyH: number, other: Omit<NonNullable<typeof best>, "d" | "hs">) => {
        // A capsule (body) and a sphere (head).
        for (const [cy, r, hs] of [[y0 + bodyH - 0.12, 0.14, true], [y0 + bodyH * 0.55, 0.3, false], [y0 + bodyH * 0.25, 0.26, false]] as [number, number, boolean][]) {
          const oc = new THREE.Vector3(cx, cy, cz).sub(eye);
          const t = oc.dot(dir);
          if (t < 0 || t > wallDist) continue;
          const dd = oc.lengthSq() - t * t;
          if (dd < r * r && (!best || t < best.d)) best = { d: t, hs, ...other };
        }
      };
      for (const b of this.bots) if (b.state !== "dead" && (!this.teams || b.team !== 0)) test(b.body.x, b.body.z, b.body.y, 1.75, { bot: b });
      for (const t of this.targets) if (!t.hit) test(t.x, t.z, 0, 1.65, { tgt: t });
      if (this.setup.online) for (const o of this.host.others()) test(o.x, o.z, o.y, 1.75, { online: o.id });
      const end = best ? eye.clone().addScaledVector(dir, (best as { d: number }).d) : eye.clone().addScaledVector(dir, wallDist);
      this.tracer(this.flash.getWorldPosition(new THREE.Vector3()), end);
      if (best) {
        const B = best as { d: number; hs: boolean; bot?: Bot; tgt?: Tgt; online?: string };
        hitAny = true;
        const falloff = Math.max(0.5, 1 - Math.max(0, B.d - W.range * 0.4) / W.range);
        const dmg = precise ? 150 : W.dmg * falloff * (B.hs ? (this.weapon === "shotgun" ? 1.5 : 2) : 1) * (burst ? 1.25 : 1);
        if (B.bot) this.damageBot(B.bot, dmg, B.hs);
        if (B.tgt) (B.tgt.hit = true), (B.tgt.m.rotation.x = -1.4), this.kills++;
        if (B.online) this.host.hitOnline(B.online, this.weapon, B.hs);
        this.hitMark = now;
      } else if (k < 1) this.impact(end);
    }
    if (hitAny) this.hits++;
    // Recoil kicks the view up and a little sideways.
    const kick = W.recoil * (burst ? 0.35 : 1);
    this.recoil = Math.min(0.12, this.recoil + kick);
    this.host.look((Math.random() - 0.5) * kick * 120, -kick * 260);
    this.flash.visible = true;
    this.flashLight.intensity = 6;
    this.flashLight.position.copy(this.flash.getWorldPosition(new THREE.Vector3()));
    this.host.sound("shoot");
  }

  private tracer(a: THREE.Vector3, b: THREE.Vector3) {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: "#ffe2a0", transparent: true, opacity: 0.7 }));
    this.host.scene.add(l);
    this.fx.push({ m: l, until: performance.now() + 60 });
  }
  private impact(p: THREE.Vector3) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), new THREE.MeshBasicMaterial({ color: "#f8d48a" }));
    s.position.copy(p);
    this.host.scene.add(s);
    this.fx.push({ m: s, until: performance.now() + 120 });
    const dec = new THREE.Mesh(new THREE.CircleGeometry(0.05, 8), new THREE.MeshBasicMaterial({ color: "#111", transparent: true, opacity: 0.7, depthWrite: false }));
    dec.position.copy(p);
    dec.lookAt(this.host.camera.position);
    this.host.scene.add(dec);
    this.fx.push({ m: dec, until: performance.now() + 8000 });
  }

  private damageBot(b: Bot, dmg: number, hs: boolean) {
    if (b.armor) {
      const a = Math.min(b.armor, dmg * 0.5);
      b.armor -= a;
      dmg -= a;
    }
    b.hp -= dmg;
    b.target = "me";
    b.seeAt = performance.now();
    if (b.hp <= 0) {
      b.state = "dead";
      b.deaths++;
      b.respawnAt = performance.now() + (this.core ? Infinity : 3500);
      b.av.root.visible = false;
      this.kills++;
      if (this.core) this.core.roundKills++;
      if (this.core) this.coreKill(b, "me");
      this.feedLine(`You ${hs ? "headshot" : "took out"} ${b.name} (${WEAPONS[this.weapon].label})`);
      this.host.sound("hit");
      if (this.setup.mode === "duel") this.roundEnd(true);
    } else if (b.hp < 45 && b.state === "engage") (b.state = "cover"), (b.goal = this.coverFrom(b, this.host.body()));
  }

  private damageMe(dmg: number, by: string) {
    if (performance.now() < this.deadUntil || this.over) return;
    const toArmor = Math.min(this.armor, dmg * 0.5);
    this.armor -= toArmor;
    this.hp -= dmg - toArmor;
    this.host.sound("miss");
    if (this.hp <= 0) {
      this.deaths++;
      this.feedLine(`${by} took you out`);
      this.deadUntil = performance.now() + (this.core ? Infinity : 3000);
      const b = this.bots.find((x) => x.name === by);
      if (b) b.kills++;
      if (this.core) this.coreDeath();
      if (this.setup.mode === "duel") this.roundEnd(false);
    }
  }

  private roundEnd(won: boolean) {
    if (won) this.rounds.me++;
    else this.rounds.them++;
    this.feedLine(`Round ${this.rounds.n}: ${won ? "yours" : "lost"} (${this.rounds.me}-${this.rounds.them})`);
    this.rounds.n++;
    if (this.rounds.me >= 5 || this.rounds.them >= 5) return this.end(this.rounds.me >= 5 ? "You won the duel" : "You lost the duel");
    // Both back to their spawns.
    setTimeout(() => {
      if (this.over) return;
      this.hp = 100;
      this.armor = 50;
      for (const w of this.loadout) this.ammo[w] = WEAPONS[w].mag;
      const sp = this.spawn(0, 0);
      this.host.teleport(sp.x, sp.z, this.facingCentre(sp));
      for (const b of this.bots) this.respawnBot(b);
    }, 2500);
  }

  private respawnBot(b: Bot) {
    const sp = this.spawn(b.team, Math.floor(Math.random() * 6));
    b.body.x = sp.x;
    b.body.z = sp.z;
    b.body.y = 0;
    b.hp = BOT_SKILL[this.setup.difficulty].hp;
    b.state = "patrol";
    b.goal = this.randomPoint();
    b.av.root.visible = true;
    b.ammo = 30;
  }

  // A spot behind cover from someone: a point near the bot that has no line of sight to them.
  private coverFrom(b: Bot, from: { x: number; y: number; z: number }) {
    for (let k = 0; k < 24; k++) {
      const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 8;
      const p = new THREE.Vector3(b.body.x + Math.cos(a) * r, 0, b.body.z + Math.sin(a) * r);
      const ok = !this.host.ph.resolve({ x: p.x, z: p.z }, 0.4, 0, 1.7, 0.45) && this.host.ph.ray(from.x, from.y + 1.5, from.z, p.x, 1.4, p.z) < 0.98;
      if (ok) return p;
    }
    return this.randomPoint();
  }

  private sees(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    return this.host.ph.ray(ax, ay + 1.5, az, bx, by + 1.4, bz) >= 0.999 && !this.smoked(ax, ay + 1.5, az, bx, by + 1.4, bz);
  }
  // Does a line pass through a smoke?
  private smoked(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (!this.core) return false;
    const a = new THREE.Vector3(ax, ay, az), d = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = d.length();
    d.divideScalar(Math.max(len, 1e-6));
    for (const z of this.core.zones) {
      if (z.kind !== "smoke") continue;
      const c = new THREE.Vector3(z.x, 1.6, z.z).sub(a);
      const t = Math.max(0, Math.min(len, c.dot(d)));
      if (c.lengthSq() - t * t < z.r * z.r && c.clone().sub(d.clone().multiplyScalar(t)).length() < z.r) return true;
    }
    return false;
  }

  private lastX = 0;
  private lastZ = 0;
  private speedNow = 0;
  update(dt: number, t: number) {
    const now = performance.now();
    const me = this.host.body();
    this.speedNow = Math.hypot(me.x - this.lastX, me.z - this.lastZ) / Math.max(dt, 1e-3);
    // Weapon: reloads finish, full auto keeps firing, the view model follows the camera (with sway and kick).
    if (this.reloadUntil && now > this.reloadUntil) {
      const W = WEAPONS[this.weapon];
      const need = W.mag - this.ammo[this.weapon]!;
      const take = Math.min(need, this.reserve[this.weapon]!);
      this.ammo[this.weapon]! += take;
      this.reserve[this.weapon]! -= take;
      this.reloadUntil = 0;
    }
    if (this.trigger && WEAPONS[this.weapon].auto) this.fire();
    this.recoil = Math.max(0, this.recoil - dt * 0.25);
    this.host.fov(this.zoom ? WEAPONS[this.weapon].zoom : 1);
    const cam = this.host.camera;
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const right = new THREE.Vector3().crossVectors(fwd, cam.up).normalize();
    const bob = Math.sin(t * 9) * 0.006 * (Math.hypot(me.x - this.lastX, me.z - this.lastZ) > 0.01 ? 1 : 0.2);
    this.gun.position.copy(cam.position).addScaledVector(fwd, 0.35).addScaledVector(right, this.zoom ? 0 : 0.16).add(new THREE.Vector3(0, (this.zoom ? -0.06 : -0.15) + bob + this.recoil * 0.3, 0));
    this.gun.quaternion.copy(cam.quaternion);
    this.gun.visible = now > this.deadUntil && !(this.zoom && WEAPONS[this.weapon].zoom >= 2);
    if (this.reloadUntil) this.gun.rotation.x -= 0.6;
    if (this.flash.visible && now - this.nextShot > -60000 / WEAPONS[this.weapon].rpm + 40) this.flash.visible = false;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);
    this.lastX = me.x;
    this.lastZ = me.z;
    for (const f of this.fx) if (now > f.until) (this.host.scene.remove(f.m), ((f.m as THREE.Mesh).geometry as THREE.BufferGeometry | undefined)?.dispose());
    this.fx = this.fx.filter((f) => now <= f.until);
    // Respawn after a death.
    if (this.deadUntil && now > this.deadUntil && this.hp <= 0 && this.setup.mode !== "duel") {
      this.hp = 100;
      this.armor = 50;
      for (const w of this.loadout) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
      const sp = this.spawn(0, Math.floor(Math.random() * 6));
      this.host.teleport(sp.x, sp.z, this.facingCentre(sp));
    }
    if (this.core) this.coreUpdate(dt, now);
    // Bots.
    const skill = BOT_SKILL[this.setup.difficulty];
    for (const b of this.bots) {
      if (b.marker) b.marker.visible = (b.shownUntil ?? 0) > now && b.state !== "dead";
      if (b.state === "dead") {
        if (now > b.respawnAt && this.setup.mode !== "duel") this.respawnBot(b);
        continue;
      }
      // Seed Core: nobody moves or shoots while buying; the round is over at its end.
      if (this.core && (this.core.phase === "buy" || this.core.phase === "end")) {
        b.av.root.position.set(b.body.x, b.body.y, b.body.z);
        b.av.update(t, dt, { speed: 0, air: false, sit: false, drive: false, crouch: false, emote: "", aim: false }, null);
        continue;
      }
      const blind = (b.blindUntil ?? 0) > now;
      // Who to fight: me (if an enemy) or the nearest visible enemy bot.
      const enemiesOfB: { x: number; y: number; z: number; who: Bot | "me" }[] = [];
      if (!this.teams || b.team !== 0) if (now > this.deadUntil) enemiesOfB.push({ x: me.x, y: me.y, z: me.z, who: "me" });
      for (const o of this.bots) if (o !== b && o.state !== "dead" && (!this.teams || o.team !== b.team)) enemiesOfB.push({ x: o.body.x, y: o.body.y, z: o.body.z, who: o });
      let foe: (typeof enemiesOfB)[number] | null = null, fd = Infinity;
      if (!blind)
        for (const e of enemiesOfB) {
          const d = Math.hypot(e.x - b.body.x, e.z - b.body.z);
          if (d < fd && d < 60 && this.sees(b.body.x, b.body.y, b.body.z, e.x, e.y, e.z)) (fd = d), (foe = e);
        }
      if (this.core) this.botPowers(b, foe, now);
      let mx = 0, mz = 0;
      const sp = 3.4 * (this.core && this.slowedAt(b.body.x, b.body.z, b.team, now, b) ? 0.5 : 1);
      if (foe) {
        if (b.state === "patrol") (b.state = "engage"), (b.seeAt = now);
        b.yaw = Math.atan2(foe.x - b.body.x, foe.z - b.body.z);
        // Strafe a little while fighting; shoot after the reaction time, with skill-based aim.
        if (Math.random() < dt * 0.6) b.strafe = -b.strafe;
        if (b.state === "engage") (mx = Math.cos(b.yaw) * b.strafe * 0.5), (mz = -Math.sin(b.yaw) * b.strafe * 0.5);
        if (now > b.reloadUntil && now - b.seeAt > skill.react * 1000 && now > b.nextShot && b.state !== "cover") {
          const W = WEAPONS[b.weapon];
          b.nextShot = now + (60000 / W.rpm) * (1.2 + Math.random());
          b.ammo--;
          const miss = skill.aim * (1 + fd / 25) * (Math.hypot(me.x - this.lastX, me.z - this.lastZ) > 0.02 ? 1.5 : 1);
          const hit = Math.random() > miss * 8;
          this.tracer(new THREE.Vector3(b.body.x, b.body.y + 1.45, b.body.z), new THREE.Vector3(foe.x + (hit ? 0 : (Math.random() - 0.5) * 2), foe.y + 1.3, foe.z));
          this.host.sound("shoot");
          if (hit) {
            const dmg = W.dmg * W.pellets * 0.6 * (fd > W.range ? 0.5 : 1);
            if (foe.who === "me") this.damageMe(dmg, b.name);
            else {
              const o = foe.who as Bot;
              o.hp -= dmg;
              if (o.hp <= 0) (o.state = "dead"), (o.deaths++, b.kills++), (o.respawnAt = now + (this.core ? Infinity : 3500)), (o.av.root.visible = false), this.feedLine(`${b.name} took out ${o.name}`), this.core && this.coreKill(o, b);
            }
          }
          if (b.ammo <= 0) (b.reloadUntil = now + 2200), (b.ammo = 30), (b.state = "cover"), (b.goal = this.coverFrom(b, foe));
        }
      } else if (b.state === "engage") (b.state = "patrol"), (b.goal = Math.random() < 0.5 ? new THREE.Vector3(me.x, 0, me.z) : this.randomPoint());
      // Move: to cover, on patrol, or flanking towards where the fight is (Seed Core: along the routes to the
      // site, to hold a spot, to plant or to defuse).
      if (this.core && b.state === "patrol") b.goal = this.coreGoal(b, now, !!foe);
      if (b.state === "cover" || b.state === "patrol") {
        const dx = b.goal.x - b.body.x, dz = b.goal.z - b.body.z;
        const d = Math.hypot(dx, dz);
        if (d < 1) {
          if (b.state === "cover" && now > b.reloadUntil) b.state = foe ? "engage" : "patrol";
          b.goal = Math.random() < 0.4 ? new THREE.Vector3(me.x + (Math.random() - 0.5) * 10, 0, me.z + (Math.random() - 0.5) * 10) : this.randomPoint();
        } else (mx = (dx / d) * sp), (mz = (dz / d) * sp), foe || (b.yaw = Math.atan2(dx, dz));
      }
      const bx = b.body.x, bz = b.body.z;
      if (moveBody(this.host.ph, b.body, mx * dt, mz * dt, dt, 0) && b.state === "patrol") b.goal = this.randomPoint();
      const moved = Math.hypot(b.body.x - bx, b.body.z - bz) / Math.max(dt, 1e-3);
      b.av.root.position.set(b.body.x, b.body.y, b.body.z);
      b.av.root.rotation.y = b.yaw;
      b.av.update(t, dt, { speed: moved > 2.5 ? 0.7 : moved > 0.3 ? 0.4 : 0, air: false, sit: false, drive: false, crouch: b.state === "cover" && moved < 0.3, emote: "", aim: !!foe }, null);
    }
    this.checkEnd(now);
    this.pushHud(now);
  }

  private checkEnd(now: number) {
    if (this.over) return;
    const top = Math.max(this.kills, ...this.bots.map((b) => b.kills));
    if (this.setup.mode === "ffa" && top >= 20) this.end(this.kills >= 20 ? "You won the free-for-all" : "Free-for-all over");
    if (this.setup.mode === "tdm") {
      const mine = this.kills + this.bots.filter((b) => b.team === 0).reduce((a, b) => a + b.kills, 0);
      const theirs = this.bots.filter((b) => b.team === 1).reduce((a, b) => a + b.kills, 0);
      if (mine >= 30 || theirs >= 30) this.end(mine >= 30 ? "Your team won" : "The other team won");
    }
    if (this.setup.mode === "training" && this.targets.length && this.targets.every((t) => t.hit) && this.bots.every((b) => b.state === "dead")) this.end("Training complete");
    if (now > this.endsAt) this.end("Time");
  }

  private end(text: string) {
    if (this.over) return;
    this.over = text;
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    this.host.sound("win");
    this.host.done(`strike-${this.setup.mode}`, this.kills * 100 + acc, Math.min(20, this.kills), `${text}: ${this.kills} kills, ${this.deaths} deaths, ${acc}% accuracy`);
  }

  // ------------------------------------------------------------------------------------------------- Seed Core
  // Five against five: I and four team mates against five rivals, each an agent with powers. A round: a buy phase
  // (stay near the spawn), then the attackers take the core to site A or B and plant it (3.5 s), the defenders
  // stop them or defuse it (6 s) before it goes off (40 s). First to 7 rounds; sides swap after 6. Credits from
  // wins, losses, kills and plants buy weapons, armour and power charges; the ultimate charges with kills, deaths,
  // plants and defuses. Nobody comes back within a round.

  private newCore(agent: AgentKey): Core {
    const device = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.42, 14), plain("#1f2937", { rough: 0.35, metal: 0.7 }));
    body.position.y = 0.21;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 24), plain("#22c55e", { rough: 0.3, emissive: "#22c55e", emissiveIntensity: 2.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.38;
    device.add(body, ring);
    device.visible = false;
    this.host.scene.add(device);
    const a = AGENTS[agent];
    return { history: [], roundKills: 0, alone: false, phase: "buy", ends: 0, round: 0, score: [0, 0], attack: 0, credits: ECON.start, streak: [0, 0], carrier: null, dropped: null, device, planted: null, prog: 0, site: "A", agent, charges: { q: a.q.charges, e: a.e.charges }, pts: 0, armorBought: 0, primary: null, zones: [], walls: [], blindUntil: 0, slowUntil: 0, buffUntil: 0, precision: 0, heal: 0, buy: true, banner: "", bannerUntil: 0, liveAt: 0, over: false };
  }

  private banner(text: string) {
    if (!this.core) return;
    this.core.banner = text;
    this.core.bannerUntil = performance.now() + 2800;
  }

  // A new round: everyone back at their side's spawn, bots buy and get their plan, the core to an attacker.
  private coreRound(first: boolean) {
    const C = this.core!;
    const now = performance.now();
    C.round++;
    C.roundKills = 0;
    C.alone = false;
    C.attack = C.round <= CORE_TIMES.half ? 0 : 1;
    if (C.round === CORE_TIMES.half + 1) this.feedLine("Sides swap: your team defends now");
    C.phase = "buy";
    C.ends = now + (first ? CORE_TIMES.firstBuy : CORE_TIMES.buy) * 1000;
    C.buy = true;
    C.planted = null;
    C.prog = 0;
    C.dropped = null;
    C.site = Math.random() < 0.5 ? "A" : "B";
    for (const w of C.walls) (this.host.ph.remove(w.tag), this.host.scene.remove(w.mesh));
    for (const z of C.zones) if (z.mesh) this.host.scene.remove(z.mesh);
    C.walls = [];
    C.zones = [];
    C.blindUntil = C.slowUntil = C.buffUntil = 0;
    C.precision = 0;
    C.heal = 0;
    C.charges.e = AGENTS[C.agent].e.charges;
    // Me: back on my feet with what I kept (a death loses the bought weapon and armour).
    this.hp = 100;
    this.armor = C.armorBought;
    this.deadUntil = 0;
    this.loadout = [C.primary ?? "pistol", "pistol"];
    this.weapon = this.loadout[0];
    this.reloadUntil = 0;
    this.buildGun();
    for (const w of WEAPON_KEYS) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
    const sp = this.spawn(0, 1);
    this.host.teleport(sp.x, sp.z, this.facingCentre(sp));
    // Bots: at their spawns, buying with their credits, defenders with a spot to hold.
    let di = 0;
    this.bots.forEach((b, i) => {
      const p = this.spawn(b.team, i + 2);
      b.body.x = p.x;
      b.body.z = p.z;
      b.body.y = 0;
      b.hp = 100;
      b.state = "patrol";
      b.respawnAt = 0;
      b.av.root.visible = true;
      b.blindUntil = b.slowUntil = b.shownUntil = 0;
      b.path = [];
      b.pathTo = "";
      b.used = new Set();
      b.prog = 0;
      b.reloadUntil = 0;
      let cr = b.credits ?? 0;
      const pick: WeaponKey = cr >= 3900 ? (Math.random() < 0.5 ? "rifle" : "heavy") : cr >= 2900 ? "heavy" : cr >= 1850 ? (Math.random() < 0.5 ? "smg" : "shotgun") : cr >= 800 ? "revolver" : "pistol";
      const cost = CORE_BUY.find((x) => x.weapon === pick)?.cost ?? 0;
      if (b.weapon !== pick) (cr -= cost), (b.weapon = pick);
      b.armor = cr >= 1000 ? 50 : cr >= 400 ? 25 : 0;
      cr -= b.armor === 50 ? 1000 : b.armor === 25 ? 400 : 0;
      b.credits = Math.max(0, cr);
      b.ammo = WEAPONS[pick].mag;
      if (b.team !== C.attack) {
        const site = di % 2 === 0 ? "A" : "B";
        const list = this.layout.core!.anchors[site];
        const a = list[Math.floor(di / 2) % list.length]!;
        b.anchor = this.at(a[0], a[1]);
        di++;
      } else b.anchor = null;
    });
    const attackers = this.bots.filter((b) => b.team === C.attack);
    C.carrier = C.attack === 0 ? "me" : (attackers[Math.floor(Math.random() * attackers.length)] ?? null);
    C.device.visible = false;
    this.banner(C.attack === 0 ? `Round ${C.round}: attack. Take the core to A or B` : `Round ${C.round}: defend A and B`);
  }

  private siteAt(x: number, z: number): "A" | "B" | null {
    for (const s of this.layout.core!.sites) if (Math.hypot(x - (this.origin.x + s.x), z - (this.origin.z + s.z)) < s.r) return s.key;
    return null;
  }
  private canPlant(me: Body) {
    const C = this.core!;
    return C.phase === "live" && C.carrier === "me" && this.hp > 0 && !!this.siteAt(me.x, me.z);
  }
  private canDefuse(me: Body) {
    const C = this.core!;
    return C.phase === "planted" && C.attack === 1 && this.hp > 0 && !!C.planted && Math.hypot(me.x - C.planted.x, me.z - C.planted.z) < 1.8;
  }
  private slowedAt(x: number, z: number, team: number, now: number, b?: Bot) {
    const C = this.core!;
    if (b ? (b.slowUntil ?? 0) > now : C.slowUntil > now) return true;
    return C.zones.some((q) => (q.kind === "slow" || q.kind === "lock" || (q.kind === "smoke" && q.r > 6)) && q.team !== team && Math.hypot(x - q.x, z - q.z) < q.r);
  }

  private plant(x: number, z: number) {
    const C = this.core!;
    const site = this.siteAt(x, z)!;
    const now = performance.now();
    C.phase = "planted";
    C.ends = now + CORE_TIMES.fuse * 1000;
    C.planted = { site, x, z, at: now };
    C.prog = 0;
    C.carrier = null;
    if (C.attack === 0) (C.credits = Math.min(ECON.cap, C.credits + ECON.plant)), (C.pts = Math.min(AGENTS[C.agent].x.points, C.pts + 1));
    for (const b of this.bots) {
      if (b.team === C.attack) b.credits = (b.credits ?? 0) + ECON.plant;
      b.prog = 0;
      b.path = [];
      b.pathTo = "";
    }
    this.banner(`The core is planted on ${site}`);
    this.feedLine(`Core planted on ${site}: ${CORE_TIMES.fuse} s`);
    this.host.sound("hit");
  }

  private coreWin(team: number, why: string) {
    const C = this.core!;
    if (C.phase === "end") return;
    C.phase = "end";
    C.ends = performance.now() + CORE_TIMES.end * 1000;
    C.prog = 0;
    C.buy = false;
    this.holdF = false;
    C.score[team as 0 | 1]++;
    C.history.push(team);
    C.streak[team as 0 | 1] = 0;
    C.streak[(1 - team) as 0 | 1]++;
    const lossPay = (t: number) => Math.min(ECON.lossMax, ECON.loss + ECON.lossStep * Math.max(0, C.streak[t as 0 | 1] - 1));
    const won = team === 0;
    C.credits = Math.min(ECON.cap, C.credits + (won ? ECON.win : lossPay(0)));
    for (const b of this.bots) b.credits = Math.min(ECON.cap, (b.credits ?? 0) + (b.team === team ? ECON.win : lossPay(b.team)));
    // The big moments: all five of them by me (an ace), or the round won as the last one standing (a clutch).
    const special = C.roundKills >= 5 ? "ACE" : won && C.alone && this.hp > 0 ? "CLUTCH" : "";
    this.banner(special ? `${special}! Round won: ${why}` : `${won ? "Round won" : "Round lost"}: ${why}`);
    this.feedLine(`Round ${C.round}: ${why} (${C.score[0]}-${C.score[1]})`);
    this.host.sound(won ? "win" : "miss");
  }

  private coreKill(victim: Bot, by: Bot | "me") {
    const C = this.core!;
    if (by === "me") (C.credits = Math.min(ECON.cap, C.credits + ECON.kill)), (C.pts = Math.min(AGENTS[C.agent].x.points, C.pts + 1));
    else by.credits = (by.credits ?? 0) + ECON.kill;
    if (C.carrier === victim) {
      C.carrier = null;
      C.dropped = new THREE.Vector3(victim.body.x, 0, victim.body.z);
      this.feedLine(`${victim.name} dropped the core`);
    }
  }
  private coreDeath() {
    const C = this.core!;
    C.pts = Math.min(AGENTS[C.agent].x.points, C.pts + 1);
    C.primary = null;
    C.armorBought = 0;
    if (C.carrier === "me") {
      const me = this.host.body();
      C.carrier = null;
      C.dropped = new THREE.Vector3(me.x, 0, me.z);
      this.feedLine("You dropped the core");
    }
  }

  private coreUpdate(dt: number, now: number) {
    const C = this.core!;
    if (C.over) return;
    const me = this.host.body();
    const meAlive = this.hp > 0;
    // The clock: buy, live, planted, the pause after a round, the end of the match.
    if (C.phase === "buy" && now > C.ends) {
      C.phase = "live";
      C.ends = now + CORE_TIMES.live * 1000;
      C.liveAt = now;
      C.buy = false;
      this.banner(C.attack === 0 ? "Go: plant the core" : "Hold the sites");
    } else if (C.phase === "live" && now > C.ends) return this.coreWin(1 - C.attack, "time ran out before a plant");
    else if (C.phase === "planted" && now > C.ends) return this.coreWin(C.attack, "the core went off");
    else if (C.phase === "end" && now > C.ends) {
      if (C.score[0] >= CORE_TIMES.win || C.score[1] >= CORE_TIMES.win) {
        C.over = true;
        this.host.speed?.(1);
        return this.end(C.score[0] >= CORE_TIMES.win ? `You won Seed Core ${C.score[0]} to ${C.score[1]}` : `Seed Core lost ${C.score[0]} to ${C.score[1]}`);
      }
      return this.coreRound(false);
    }
    // Buy phase: stay within 7 m of the spawn.
    if (C.phase === "buy") {
      const home = this.spawn(0, 1);
      const d = Math.hypot(me.x - home.x, me.z - home.z);
      if (d > 7) (me.x = home.x + ((me.x - home.x) * 7) / d), (me.z = home.z + ((me.z - home.z) * 7) / d);
    }
    // Powers run out: smokes, fields, walls.
    for (const z of C.zones) if (now > z.until && z.mesh) this.host.scene.remove(z.mesh);
    C.zones = C.zones.filter((z) => now <= z.until);
    for (const w of C.walls) if (now > w.until) (this.host.ph.remove(w.tag), this.host.scene.remove(w.mesh));
    C.walls = C.walls.filter((w) => now <= w.until);
    for (const z of C.zones) {
      if (z.kind === "trip") {
        for (const b of this.bots)
          if (b.team !== z.team && b.state !== "dead" && Math.hypot(b.body.x - z.x, b.body.z - z.z) < z.r) {
            b.shownUntil = now + 4000;
            b.slowUntil = now + 3000;
            z.until = now;
            this.feedLine(`Tripwire: ${b.name}`);
          }
        if (z.team !== 0 && meAlive && Math.hypot(me.x - z.x, me.z - z.z) < z.r) (C.slowUntil = now + 3000), (z.until = now);
      } else if (z.kind === "lock") for (const b of this.bots) if (b.team !== z.team && Math.hypot(b.body.x - z.x, b.body.z - z.z) < z.r) b.shownUntil = now + 300;
    }
    // Smoke puffs drift.
    for (const z of C.zones) if (z.kind === "smoke" && z.mesh) for (const c of z.mesh.children) if ((c as THREE.Sprite).isSprite) (c as THREE.Sprite).material.rotation += dt * (c.userData.spin as number);
    // Mend heals over three seconds.
    if (C.heal > 0 && meAlive) {
      const h = Math.min(C.heal, dt * 20);
      this.hp = Math.min(100, this.hp + h);
      C.heal -= h;
    }
    // My speed: slowed in a rival's field, still while planting or defusing, nothing while down.
    const acting = this.holdF && (this.canPlant(me) || this.canDefuse(me));
    this.host.speed?.(!meAlive || C.phase === "end" ? 0 : acting ? 0 : this.slowedAt(me.x, me.z, 0, now) ? 0.5 : 1);
    if (C.phase === "live") {
      if (C.dropped) {
        if (C.attack === 0 && meAlive && Math.hypot(me.x - C.dropped.x, me.z - C.dropped.z) < 1.4) (C.carrier = "me"), (C.dropped = null), this.feedLine("You picked up the core");
        else
          for (const b of this.bots)
            if (b.team === C.attack && b.state !== "dead" && Math.hypot(b.body.x - C.dropped.x, b.body.z - C.dropped.z) < 1.4) {
              C.carrier = b;
              C.dropped = null;
              break;
            }
      }
      if (C.carrier === "me") {
        if (this.holdF && this.canPlant(me)) {
          C.prog += dt / CORE_TIMES.plant;
          if (C.prog >= 1) this.plant(me.x, me.z);
        } else C.prog = 0;
      } else if (C.carrier) {
        const b = C.carrier;
        if (this.siteAt(b.body.x, b.body.z) && b.state === "patrol") {
          b.prog = (b.prog ?? 0) + dt / CORE_TIMES.plant;
          if (b.prog >= 1) this.plant(b.body.x, b.body.z);
        } else b.prog = 0;
      }
    } else if (C.phase === "planted" && C.planted) {
      if (C.attack === 1) {
        if (this.holdF && this.canDefuse(me)) {
          C.prog += dt / CORE_TIMES.defuse;
          if (C.prog >= 1) {
            C.pts = Math.min(AGENTS[C.agent].x.points, C.pts + 1);
            return this.coreWin(0, "you defused the core");
          }
        } else C.prog = C.prog >= 0.5 ? 0.5 : 0;
      }
      for (const b of this.bots)
        if (b.team !== C.attack && b.state !== "dead" && b.state === "patrol" && Math.hypot(b.body.x - C.planted.x, b.body.z - C.planted.z) < 1.6) {
          b.prog = (b.prog ?? 0) + dt / CORE_TIMES.defuse;
          if (b.prog >= 1) return this.coreWin(1 - C.attack, `${b.name} defused the core`);
        }
      const left = (C.ends - now) / 1000;
      C.device.children[1]!.visible = Math.sin(now / (left < 10 ? 50 : 150)) > 0;
    }
    // Who is still standing.
    if (C.phase === "live" || C.phase === "planted") {
      const alive = (team: number) => this.bots.filter((b) => b.team === team && b.state !== "dead").length + (team === 0 && meAlive ? 1 : 0);
      if (alive(1 - C.attack) === 0) return this.coreWin(C.attack, C.phase === "planted" ? "the defenders are down, the core will go off" : "all the defenders are down");
      if (alive(C.attack) === 0 && C.phase === "live") return this.coreWin(1 - C.attack, "all the attackers are down");
    }
    // The core: on its carrier's back, on the floor, or planted.
    const d = C.device;
    if (C.planted) (d.visible = true), d.position.set(C.planted.x, 0, C.planted.z);
    else if (C.dropped) (d.visible = true), d.position.copy(C.dropped);
    else if (C.carrier && C.carrier !== "me") (d.visible = C.carrier.state !== "dead"), d.position.set(C.carrier.body.x, C.carrier.body.y + 0.9, C.carrier.body.z);
    else d.visible = false;
  }

  // A bot's way: attackers to the round's site (or the dropped core, or around the planted core), defenders to
  // their spot (or to the planted core). Along the map's routes.
  private coreGoal(b: Bot, _now: number, _sees: boolean): THREE.Vector3 {
    const C = this.core!;
    const L = this.layout.core!;
    const siteP = (k: "A" | "B") => {
      const s = L.sites.find((x) => x.key === k)!;
      return this.at(s.x, s.z);
    };
    let target: THREE.Vector3;
    if (b.team === C.attack) {
      if (C.planted) target = b.anchor ?? (b.anchor = new THREE.Vector3(C.planted.x + (Math.random() - 0.5) * 8, 0, C.planted.z + (Math.random() - 0.5) * 8));
      else if (C.dropped) target = C.dropped.clone();
      else if (C.carrier === b) target = siteP(C.site);
      else target = b.anchor ?? (b.anchor = siteP(C.site).add(new THREE.Vector3((Math.random() - 0.5) * 8, 0, (Math.random() - 0.5) * 8)));
    } else if (C.planted) target = new THREE.Vector3(C.planted.x, 0, C.planted.z);
    else target = b.anchor ?? siteP("A");
    const key = `${Math.round(target.x)},${Math.round(target.z)}`;
    if (b.pathTo !== key) (b.path = this.route(new THREE.Vector3(b.body.x, 0, b.body.z), target)), (b.pathTo = key);
    const path = b.path!;
    while (path.length > 1 && Math.hypot(path[0]!.x - b.body.x, path[0]!.z - b.body.z) < 1.6) path.shift();
    const next = path[0] ?? target;
    if (Math.hypot(next.x - b.body.x, next.z - b.body.z) < 0.7) return new THREE.Vector3(b.body.x, 0, b.body.z);
    return next;
  }
  private route(from: THREE.Vector3, to: THREE.Vector3) {
    const N = this.layout.core!.nav;
    const pts = N.pts.map(([x, z]) => this.at(x, z));
    const nearest = (p: THREE.Vector3) => {
      let k = 0, best = Infinity;
      pts.forEach((q, i) => {
        const d = q.distanceToSquared(p);
        if (d < best) (best = d), (k = i);
      });
      return k;
    };
    const a = nearest(from), z = nearest(to);
    const prev = new Map<number, number>([[a, -1]]);
    const queue = [a];
    while (queue.length) {
      const c = queue.shift()!;
      if (c === z) break;
      for (const [u, v] of N.edges) {
        const n = u === c ? v : v === c ? u : -1;
        if (n >= 0 && !prev.has(n)) (prev.set(n, c), queue.push(n));
      }
    }
    const path: THREE.Vector3[] = [];
    for (let c: number | undefined = z; c !== undefined && c !== -1; c = prev.get(c)) path.unshift(pts[c]!);
    path.push(to.clone());
    return path;
  }

  // Bots use their powers at sensible moments: smokes on a site's ways in, a wall in front of their spot, a
  // flare at a rival, a dart over the site, mending when hurt, backing off when losing a fight.
  private botPowers(b: Bot, foe: { x: number; y: number; z: number } | null, now: number) {
    const C = this.core!;
    if ((C.phase !== "live" && C.phase !== "planted") || !b.agent || !b.used) return;
    const used = b.used;
    const attacking = b.team === C.attack;
    const L = this.layout.core!;
    const since = (now - C.liveAt) / 1000;
    if (b.agent === "vesper" && attacking && !used.has("smoke") && since > 6 && C.phase === "live") {
      used.add("smoke");
      for (const [x, z] of L.entries[C.site]) this.smokeAt(this.at(x, z), 4.2, 14, b.team);
    }
    if (b.agent === "lula" && !attacking && !used.has("wall") && since > 1 && b.anchor) {
      used.add("wall");
      this.wallAt(b.anchor.clone().add(new THREE.Vector3(-4, 0, 0)), -Math.PI / 2, b.team);
    }
    if ((b.agent === "kestrel" || b.agent === "tsehay") && foe && !used.has("flash") && Math.hypot(foe.x - b.body.x, foe.z - b.body.z) > 5) {
      used.add("flash");
      this.flashAt(new THREE.Vector3(foe.x, foe.y + 1.8, foe.z), b.team, b.agent === "tsehay" ? 250 : 600);
    }
    if (b.agent === "kestrel" && attacking && !used.has("recon") && since > 8) {
      used.add("recon");
      const s = L.sites.find((x) => x.key === C.site)!;
      this.reveal(this.at(s.x, s.z), 30, 5000, b.team);
    }
    if (b.agent === "abeba" && b.hp < 50 && !used.has("mend")) (used.add("mend"), (b.hp = Math.min(100, b.hp + 55)));
    if ((b.agent === "zemen" || b.agent === "vesper") && foe && b.hp < 45 && !used.has("away")) (used.add("away"), (b.state = "cover"), (b.goal = this.coverFrom(b, foe)));
  }

  // ---- powers (mine and the bots')
  private smokeAt(p: THREE.Vector3, r: number, sec: number, team: number) {
    // A soft cloud: an opaque core (it must hide people) wrapped in drifting puffs.
    const m = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.86, 2), new THREE.MeshStandardMaterial({ color: "#b7bcc4", roughness: 1, side: THREE.DoubleSide }));
    m.add(core);
    const puff = smokePuff();
    for (let i = 0; i < 26; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puff, color: i % 3 ? "#c9cdd3" : "#aeb3ba", transparent: true, opacity: 0.85, depthWrite: false }));
      const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2, rr = r * (0.7 + Math.random() * 0.4);
      s.position.set(Math.cos(a) * Math.cos(e) * rr, Math.sin(e) * rr * 0.8, Math.sin(a) * Math.cos(e) * rr);
      s.scale.setScalar(r * (0.9 + Math.random() * 0.6));
      s.userData.spin = (Math.random() - 0.5) * 0.4;
      m.add(s);
    }
    m.position.set(p.x, Math.max(1.6, r * 0.5), p.z);
    m.scale.y = 0.8;
    this.host.scene.add(m);
    this.core!.zones.push({ kind: "smoke", x: p.x, z: p.z, r, until: performance.now() + sec * 1000, team, mesh: m });
  }
  private wallAt(p: THREE.Vector3, yaw: number, team: number) {
    const C = this.core!;
    const alongX = Math.abs(Math.cos(yaw)) > Math.abs(Math.sin(yaw));
    const w = alongX ? 6 : 0.5, d = alongX ? 0.5 : 6;
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 3, d), new THREE.MeshStandardMaterial({ color: team === 0 ? "#86efac" : "#fca5a5", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.55, emissive: team === 0 ? "#166534" : "#7f1d1d", emissiveIntensity: 0.5 }));
    m.position.set(p.x, 1.5, p.z);
    this.host.scene.add(m);
    const tag = `power-wall-${Math.random().toString(36).slice(2, 8)}`;
    this.host.ph.sized(p.x, 1.5, p.z, w, 3, d, tag);
    C.walls.push({ mesh: m, until: performance.now() + 20000, tag });
  }
  private flashAt(p: THREE.Vector3, team: number, delay: number) {
    window.setTimeout(() => {
      if (!this.core || this.over) return;
      const now = performance.now();
      // The muzzle-flash light lights the burst (a new light would make every material recompile).
      this.flashLight.position.copy(p);
      this.flashLight.intensity = 60;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }));
      ball.position.copy(p);
      this.host.scene.add(ball);
      this.fx.push({ m: ball, until: now + 120 });
      for (const b of this.bots) {
        if (b.team === team || b.state === "dead") continue;
        const d = Math.hypot(p.x - b.body.x, p.z - b.body.z);
        if (d > 30 || this.host.ph.ray(b.body.x, b.body.y + 1.5, b.body.z, p.x, p.y, p.z) < 0.98) continue;
        const face = Math.cos(Math.atan2(p.x - b.body.x, p.z - b.body.z) - b.yaw);
        if (face > 0.2) b.blindUntil = now + 2500 * (1 - d / 35);
      }
      if (team !== 0 && this.hp > 0) {
        const eye = this.host.camera.getWorldPosition(new THREE.Vector3());
        const to = p.clone().sub(eye);
        const d = to.length();
        const look = this.host.camera.getWorldDirection(new THREE.Vector3()).dot(to.normalize());
        if (d < 30 && look > 0.3 && this.host.ph.ray(eye.x, eye.y, eye.z, p.x, p.y, p.z) > 0.98) this.core.blindUntil = now + 2500 * (1 - d / 35) * look;
      }
      this.host.sound("hit");
    }, delay);
  }
  private reveal(p: THREE.Vector3, r: number, ms: number, team: number) {
    const now = performance.now();
    for (const b of this.bots) if (b.team !== team && b.state !== "dead" && Math.hypot(b.body.x - p.x, b.body.z - p.z) < r) b.shownUntil = now + ms;
  }
  private dashMe(dir: THREE.Vector3, dist: number) {
    const me = this.host.body();
    const k = this.host.ph.ray(me.x, me.y + 1, me.z, me.x + dir.x * dist, me.y + 1, me.z + dir.z * dist);
    const d = Math.max(0, dist * k - 0.6);
    me.x += dir.x * d;
    me.z += dir.z * d;
  }
  private disc(p: THREE.Vector3, r: number, color: string) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.28, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, 0.04, p.z);
    this.host.scene.add(m);
    return m;
  }

  // My powers (Q, E, X).
  private ability(slot: "q" | "e" | "x") {
    const C = this.core!;
    if (this.hp <= 0 || C.phase === "end" || C.phase === "buy") return;
    const ag = AGENTS[C.agent];
    const def = slot === "x" ? ag.x : ag[slot];
    if (slot === "x") {
      if (C.pts < ag.x.points) return this.banner(`${ag.x.name}: ${C.pts} of ${ag.x.points} points`);
      C.pts = 0;
    } else {
      if (C.charges[slot] <= 0) return this.banner(`No ${def.name} left this round`);
      C.charges[slot]--;
    }
    this.power(def.key);
    this.feedLine(`You used ${def.name}`);
  }
  private power(k: AbilityKey) {
    const C = this.core!;
    const now = performance.now();
    const me = this.host.body();
    const cam = this.host.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    const aim = (max: number) => {
      const far = eye.clone().addScaledVector(fwd, max);
      const t = this.host.ph.ray(eye.x, eye.y, eye.z, far.x, far.y, far.z);
      return eye.clone().addScaledVector(fwd, Math.max(0.5, max * t - 0.6));
    };
    switch (k) {
      case "smoke":
        return this.smokeAt(aim(35).setY(0), 4.2, 14, 0);
      case "nightfall":
        return this.smokeAt(aim(40).setY(0), 9, 18, 0);
      case "step":
        return this.dashMe(flat, 7);
      case "dash":
        return this.dashMe(flat, 8);
      case "blink": {
        const p = aim(14);
        me.x = p.x;
        me.z = p.z;
        return;
      }
      case "flash":
        return this.flashAt(aim(30), 0, 600);
      case "blaze":
        return this.flashAt(aim(8), 0, 250);
      case "recon":
        return this.reveal(aim(45).setY(0), 30, 5000, 0);
      case "hunt":
        return this.reveal(this.origin.clone(), 999, 6000, 0);
      case "wall":
        return this.wallAt(new THREE.Vector3(me.x, 0, me.z).addScaledVector(flat, 3.5), Math.atan2(flat.x, flat.z), 0);
      case "trip": {
        const p = aim(12).setY(0);
        C.zones.push({ kind: "trip", x: p.x, z: p.z, r: 2.2, until: now + 90000, team: 0, mesh: this.disc(p, 2.2, "#22c55e") });
        return;
      }
      case "lockdown":
        C.zones.push({ kind: "lock", x: me.x, z: me.z, r: 12, until: now + 8000, team: 0, mesh: this.disc(new THREE.Vector3(me.x, 0, me.z), 12, "#16a34a") });
        return;
      case "mend":
        C.heal += 60;
        return;
      case "slow": {
        const p = aim(25).setY(0);
        C.zones.push({ kind: "slow", x: p.x, z: p.z, r: 5, until: now + 7000, team: 0, mesh: this.disc(p, 5, "#f59e0b") });
        return;
      }
      case "renew":
        this.hp = 100;
        this.armor = 50;
        for (const b of this.bots) if (b.team === 0 && b.state !== "dead" && Math.hypot(b.body.x - me.x, b.body.z - me.z) < 15) (b.hp = 100), (b.armor = 50);
        return;
      case "sunburst":
        C.buffUntil = now + 10000;
        return;
      case "updraft":
        this.host.jump?.(11);
        return;
      case "precision":
        C.precision = 5;
        return;
    }
  }

  // The buy menu and the powers from the display.
  act(a: string) {
    if (a === "pause") {
      // Esc already let the mouse go (and paused) a moment ago: that is the same press.
      if (performance.now() - this.lostAt < 400) return;
      this.paused = !this.paused;
      if (this.paused) (this.trigger = false), (this.zoom = false), document.pointerLockElement && document.exitPointerLock();
      return;
    }
    if (a === "resume") {
      this.paused = false;
      return this.lock();
    }
    const C = this.core;
    if (!C) return;
    if (a === "close-buy") C.buy = false;
    else if (a === "open-buy" && C.phase === "buy") C.buy = true;
    else if (a.startsWith("buy:")) this.buyItem(a.slice(4));
    else if (a === "q" || a === "e" || a === "x") this.ability(a);
  }
  private buyItem(key: string) {
    const C = this.core!;
    if (C.phase !== "buy") return;
    const ag = AGENTS[C.agent];
    if (key === "q") {
      if (C.credits < ag.q.cost || C.charges.q >= ag.q.charges) return;
      C.credits -= ag.q.cost;
      C.charges.q++;
      return;
    }
    const it = CORE_BUY.find((i) => i.key === key);
    if (!it || C.credits < it.cost) return;
    if (it.weapon) {
      if (this.loadout[0] === it.weapon) return;
      C.credits -= it.cost;
      C.primary = it.weapon;
      this.loadout = [it.weapon, "pistol"];
      this.weapon = it.weapon;
      this.ammo[it.weapon] = WEAPONS[it.weapon].mag;
      this.reserve[it.weapon] = WEAPONS[it.weapon].mag * 4;
      this.buildGun();
      this.host.sound("hit");
    } else if (it.armor) {
      if (C.armorBought >= it.armor) return;
      C.credits -= it.cost;
      C.armorBought = it.armor;
      this.armor = it.armor;
    }
  }

  private coreHud(now: number): CoreHud {
    const C = this.core!;
    const ag = AGENTS[C.agent];
    const me = this.host.body();
    const left = Math.max(0, Math.ceil((C.ends - now) / 1000));
    const shop = [
      ...CORE_BUY.map((i) => ({ key: i.key, label: i.label, cost: i.cost, owned: i.weapon ? this.loadout[0] === i.weapon : C.armorBought >= (i.armor ?? 0), afford: C.credits >= i.cost })),
      ...(ag.q.cost ? [{ key: "q", label: `${ag.q.name} (Q), ${C.charges.q} of ${ag.q.charges}`, cost: ag.q.cost, owned: C.charges.q >= ag.q.charges, afford: C.credits >= ag.q.cost }] : []),
    ];
    const alive = (team: number) => this.bots.filter((b) => b.team === team && b.state !== "dead").length + (team === 0 && this.hp > 0 ? 1 : 0);
    if (C.phase === "live" || C.phase === "planted") if (alive(0) === 1 && this.hp > 0 && alive(1) > 0) C.alone = true;
    const canPlant = this.canPlant(me), canDefuse = this.canDefuse(me);
    const hint =
      this.hp <= 0 ? "You are down until the next round" :
      C.phase === "buy" ? "Buy phase: B opens the buy menu; Q, E and X are your powers" :
      canPlant ? "Hold F to plant the core" :
      canDefuse ? "Hold F to defuse the core" :
      C.carrier === "me" ? "You carry the core: take it to site A or B" :
      C.phase === "planted" ? (C.attack === 0 ? `Guard the core on ${C.planted?.site}` : `The core is on ${C.planted?.site}: defuse it (F)`) :
      C.dropped && C.attack === 0 ? "The core is on the floor: pick it up" : C.attack === 0 ? "Push with your team to the site" : "Hold your site";
    return {
      phase: C.phase,
      side: C.attack === 0 ? "attack" : "defend",
      round: C.round,
      score: [C.score[0], C.score[1]],
      timer: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
      credits: C.credits,
      agent: ag.name,
      color: ag.color,
      abilities: [
        { slot: "Q", name: ag.q.name, note: ag.q.note, charges: C.charges.q, max: ag.q.charges },
        { slot: "E", name: ag.e.name, note: ag.e.note, charges: C.charges.e, max: ag.e.charges },
        { slot: "X", name: ag.x.name, note: ag.x.note, charges: C.pts >= ag.x.points ? 1 : 0, max: 1, pts: C.pts, need: ag.x.points },
      ],
      carrier: C.carrier === "me",
      hint,
      progress: C.prog > 0 ? Math.min(1, C.prog) : null,
      progressLabel: C.phase === "planted" ? "Defusing" : "Planting",
      planted: C.planted?.site ?? null,
      blind: Math.max(0, Math.min(1, (C.blindUntil - now) / 1200)),
      buy: C.buy && C.phase === "buy",
      shop,
      alive: [alive(0), alive(1)],
      banner: now < C.bannerUntil ? C.banner : "",
      history: C.history.slice(),
    };
  }

  private pushHud(now: number) {
    const W = WEAPONS[this.weapon];
    const mineT = this.kills + this.bots.filter((b) => b.team === 0).reduce((a, b) => a + b.kills, 0);
    const theirsT = this.bots.filter((b) => b.team === 1).reduce((a, b) => a + b.kills, 0);
    const left = Math.max(0, Math.ceil((this.endsAt - now) / 1000));
    this.host.hud({
      hp: Math.max(0, Math.round(this.hp)),
      armor: Math.round(this.armor),
      weapon: W.label,
      ammo: this.ammo[this.weapon]!,
      mag: W.mag,
      reserve: this.reserve[this.weapon]!,
      reloading: !!this.reloadUntil,
      kills: this.kills,
      deaths: this.deaths,
      score: this.core ? `${this.core.score[0]} : ${this.core.score[1]}` : this.setup.mode === "tdm" ? `Blue ${mineT} : ${theirsT} Red` : this.setup.mode === "duel" ? `Rounds ${this.rounds.me} : ${this.rounds.them}` : `${this.kills} kills`,
      time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
      feed: this.feed,
      hit: now - this.hitMark < 160 ? 1 : 0,
      dead: !this.core && now < this.deadUntil ? Math.ceil((this.deadUntil - now) / 1000) : 0,
      board: this.onlineBoard ?? [{ name: "You", team: 0, k: this.kills, d: this.deaths, me: true }, ...this.bots.map((b) => ({ name: b.name, team: b.team, k: b.kills, d: b.deaths, me: false }))].sort((a, b) => b.k - a.k),
      zoom: this.zoom,
      over: this.over,
      round: this.setup.mode === "duel" ? `Round ${this.rounds.n}` : "",
      core: this.core ? this.coreHud(now) : undefined,
      paused: this.paused,
      // How far the crosshair opens: running, jumping, recoil (0 to 1).
      bloom: Math.min(1, (!this.host.body().ground ? 0.8 : this.speedNow > 4 ? 0.45 : this.speedNow > 1 ? 0.12 : 0) + this.recoil * 6),
      scope: this.zoom && WEAPONS[this.weapon].zoom >= 2,
    });
  }

  // Online: the server is the referee (my health, deaths, the board, the feed, the result).
  private onlineBoard: StrikeHud["board"] | null = null;
  online(s: { me: { hp: number; armor: number; alive: boolean; respawnIn: number; team: number }; board: { id: string; name: string; team: number; k: number; d: number }[]; feed: string[]; over: string | null; endsIn: number }, myId: string) {
    const was = this.hp > 0;
    this.hp = s.me.hp;
    this.armor = s.me.armor;
    if (!s.me.alive) this.deadUntil = performance.now() + s.me.respawnIn * 1000;
    if (was && !s.me.alive) this.deaths++;
    if (!was && s.me.alive) {
      const sp = this.spawn(this.setup.mode === "tdm" ? s.me.team : 0, Math.floor(Math.random() * 6));
      this.host.teleport(sp.x, sp.z, this.facingCentre(sp));
      for (const w of this.loadout) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
    }
    this.kills = s.board.find((b) => b.id === myId)?.k ?? this.kills;
    this.onlineBoard = s.board.map((b) => ({ name: b.name, team: b.team, k: b.k, d: b.d, me: b.id === myId }));
    this.feed = s.feed;
    this.endsAt = performance.now() + s.endsIn * 1000;
    if (s.over && !this.over) this.end(s.over);
  }

  stop() {
    document.removeEventListener("mousemove", this.lockMove);
    document.removeEventListener("pointerlockchange", this.lockChange);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    this.host.canvas.removeEventListener("mousedown", this.mouseRight);
    this.host.canvas.removeEventListener("mouseup", this.mouseRight);
    this.host.canvas.removeEventListener("contextmenu", this.noMenu);
    if (document.pointerLockElement) document.exitPointerLock();
    this.host.scene.remove(this.group, this.gun, this.flashLight);
    for (const b of this.bots) (this.host.scene.remove(b.av.root), b.av.dispose());
    for (const f of this.fx) this.host.scene.remove(f.m);
    this.host.ph.remove("arena");
    if (this.core) {
      for (const w of this.core.walls) (this.host.ph.remove(w.tag), this.host.scene.remove(w.mesh));
      for (const z of this.core.zones) z.mesh && this.host.scene.remove(z.mesh);
      this.host.scene.remove(this.core.device);
      this.host.speed?.(1);
    }
    this.host.fov(1);
    this.host.hud(null);
  }
}
