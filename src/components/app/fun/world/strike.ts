import * as THREE from "three";
import { moveBody, newBody, type Body, type Physics } from "./engine";
import type { Activity } from "./activities";
import { glass, lamp, plain, surface } from "./pbr";
import { signPlane } from "./toon";
import { Character } from "./character";
import { cleanLook } from "@/lib/fun-catalog";
import { PEOPLE } from "./people";

// Seed Strike: a shooter on closed maps of its own, away from town (made-up weapons; no real brands). Modes: Lone
// Wolf (1 against 1, rounds), bot training (targets and bots), team deathmatch and free-for-all, alone with bots or
// online with colleagues (the server checks every hit: who, how far, how fast, with what). Maps: a training
// facility, a warehouse, an urban block and a desert outpost, each with cover, high ground, stairs, several routes
// and spawn points. Weapons: pistol, SMG, rifle, shotgun, marksman rifle; recoil, spread, reloads, falloff,
// headshots. Bots patrol, find you, aim and shoot (reaction and accuracy by difficulty), take cover when hurt,
// reload behind cover and flank.

export type StrikeMode = "duel" | "training" | "tdm" | "ffa";
export const STRIKE_MODES: { key: StrikeMode; label: string; note: string }[] = [
  { key: "duel", label: "Lone Wolf", note: "One against one. Rounds; first to five." },
  { key: "training", label: "Bot training", note: "Targets and easy bots; accuracy counts." },
  { key: "tdm", label: "Team deathmatch", note: "Two teams; first to 30 kills or 8 minutes." },
  { key: "ffa", label: "Free-for-all", note: "Everyone for themselves; first to 20 kills." },
];
export type StrikeMap = "facility" | "warehouse" | "urban" | "desert";
export const STRIKE_MAPS: { key: StrikeMap; label: string; x: number; z: number }[] = [
  { key: "facility", label: "Training facility", x: 700, z: 0 },
  { key: "warehouse", label: "Industrial warehouse", x: 700, z: 220 },
  { key: "urban", label: "Urban block", x: 700, z: -220 },
  { key: "desert", label: "Desert outpost", x: 920, z: 0 },
];
import { WEAPONS, type WeaponKey } from "@/lib/strike-weapons";
export { WEAPONS, type WeaponKey };
export type Difficulty = "easy" | "normal" | "hard";
const BOT_SKILL: Record<Difficulty, { react: number; aim: number; hp: number }> = { easy: { react: 0.9, aim: 0.06, hp: 80 }, normal: { react: 0.55, aim: 0.035, hp: 100 }, hard: { react: 0.32, aim: 0.018, hp: 100 } };

export type StrikeSetup = { mode: StrikeMode; map: StrikeMap; bots: number; difficulty: Difficulty; loadout: [WeaponKey, WeaponKey]; online?: boolean };
export type StrikeHud = { hp: number; armor: number; weapon: string; ammo: number; mag: number; reserve: number; reloading: boolean; kills: number; deaths: number; score: string; time: string; feed: string[]; hit: number; dead: number; board: { name: string; team: number; k: number; d: number; me: boolean }[]; zoom: boolean; over: string | null; round: string };

export type StrikeHost = {
  scene: THREE.Scene;
  ph: Physics;
  camera: THREE.PerspectiveCamera;
  body: () => Body;
  teleport: (x: number, z: number, yaw: number) => void;
  look: (dx: number, dy: number) => void;
  fov: (k: number) => void;
  hud: (h: StrikeHud | null) => void;
  sound: (k: "shoot" | "hit" | "miss" | "win") => void;
  done: (kind: string, score: number, coins: number, text: string) => void;
  // Online: colleagues in the match (from the town's sync) and sending hits to the server.
  others: () => { id: string; name: string; x: number; y: number; z: number }[];
  hitOnline: (to: string, w: WeaponKey, hs: boolean) => void;
  canvas: HTMLCanvasElement;
};

type Layout = { size: [number, number]; floor: "concrete" | "metal" | "gravel" | "tiles"; wall: "concrete" | "brick" | "factory" | "plaster"; light: string; boxes: [number, number, number, number, number, number, string?][]; spawns: [number, number][]; props?: [string, number, number][] };
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
};

type Bot = { name: string; team: number; body: Body; av: Character; hp: number; yaw: number; target: Bot | "me" | null; seeAt: number; nextShot: number; ammo: number; reloadUntil: number; state: "patrol" | "engage" | "cover" | "dead"; goal: THREE.Vector3; respawnAt: number; kills: number; deaths: number; weapon: WeaponKey; strafe: number };
type Tgt = { m: THREE.Group; x: number; y: number; z: number; up: number; hit: boolean };

// Real weapon models (Sketchfab, CC BY 4.0; credits in public/models/CREDITS.txt), in the hands: turned so the
// muzzle points ahead (-z), at their real length, the grip near the hand; parts that are not the gun (loose
// bullets in the file) left out. Game names are our own (see strike-weapons.ts).
const WEAPON_MODEL: Record<string, { file: string; length: number; muzzleAtPlusZ: boolean; drop?: RegExp; pick?: number }> = {
  pistol: { file: "pistol", length: 0.19, muzzleAtPlusZ: false },
  smg: { file: "smg", length: 0.6, muzzleAtPlusZ: true },
  rifle: { file: "rifle", length: 0.86, muzzleAtPlusZ: false },
  shotgun: { file: "shotgun", length: 1.0, muzzleAtPlusZ: false },
  marksman: { file: "sniper", length: 1.25, muzzleAtPlusZ: false, drop: /^(Case|Bullet)$/ },
};
const weaponCache = new Map<string, Promise<THREE.Object3D | null>>();
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
  private lockMove = (e: MouseEvent) => document.pointerLockElement === this.host.canvas && this.host.look(e.movementX * 0.6, e.movementY * 0.6);
  private keyDown = (e: KeyboardEvent) => this.key(e.key.toLowerCase());
  private mouseRight = (e: MouseEvent) => (e.button === 2 ? ((this.zoom = e.type === "mousedown"), e.preventDefault()) : 0);
  private noMenu = (e: Event) => e.preventDefault();
  constructor(
    private host: StrikeHost,
    private setup: StrikeSetup,
  ) {
    const m = STRIKE_MAPS.find((x) => x.key === setup.map)!;
    this.origin = new THREE.Vector3(m.x, 0, m.z);
    this.layout = LAYOUTS[setup.map];
    this.weapon = setup.loadout[0];
    for (const w of setup.loadout) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
    this.buildMap();
    host.scene.add(this.group);
    // The weapon in my hands, and its muzzle flash.
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffd27a" }));
    this.flashLight = new THREE.PointLight("#ffbb66", 0, 6, 2);
    this.buildGun();
    host.scene.add(this.gun, this.flashLight);
    // Bots: teams in team modes, alone in free-for-all, one rival in Lone Wolf, easy ones in training.
    const n = setup.online ? 0 : setup.mode === "duel" ? 1 : setup.mode === "training" ? Math.max(2, setup.bots) : setup.bots;
    const names = ["Raven", "Atlas", "Nova", "Viper", "Ghost", "Bishop", "Echo", "Hawk", "Onyx", "Sable", "Titan"];
    for (let i = 0; i < n; i++) {
      const team = setup.mode === "tdm" ? (i % 2 === 0 ? 1 : 0) : 1;
      const sp = this.spawn(team, i + 1);
      const look = { ...cleanLook({}), style: "realistic" as const, base: PEOPLE[(i * 3) % PEOPLE.length]!.key };
      const av = new Character(look, true);
      av.setDetailed(true);
      this.host.scene.add(av.root);
      const b: Bot = { name: names[i % names.length]!, team, body: newBody(sp.x, 0, sp.z), av, hp: BOT_SKILL[setup.difficulty].hp, yaw: 0, target: null, seeAt: 0, nextShot: 0, ammo: 30, reloadUntil: 0, state: "patrol", goal: this.randomPoint(), respawnAt: 0, kills: 0, deaths: 0, weapon: (["rifle", "smg", "pistol", "shotgun"] as WeaponKey[])[i % 4]!, strafe: 1 };
      // A team band so you can tell friend from foe.
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.3), plain(team === 0 ? "#2563eb" : "#dc2626", { rough: 0.5, emissive: team === 0 ? "#1d4ed8" : "#b91c1c", emissiveIntensity: 0.6 }));
      band.position.y = 1.15;
      av.root.add(band);
      this.bots.push(b);
    }
    if (setup.mode === "training") this.spawnTargets();
    const sp = this.spawn(0, 0);
    host.teleport(sp.x, sp.z, this.facingCentre(sp));
    this.endsAt = performance.now() + (setup.mode === "tdm" ? 8 : setup.mode === "ffa" ? 10 : setup.mode === "training" ? 3 : 15) * 60_000;
    document.addEventListener("mousemove", this.lockMove);
    window.addEventListener("keydown", this.keyDown);
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
    const s = this.layout.spawns;
    const pick = this.setup.mode === "tdm" ? s.filter((_, k) => k % 2 === team) : s;
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
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), key === "metal" ? surface("metal", { tint: "#9aa3ab" }) : key === "brick" ? surface("brick", { tint: "#ffffff" }) : key === "plaster" ? surface("plaster", { tint: "#e3d2ad" }) : surface("concrete", { tint: "#cfcac0" }));
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
      const w = this.setup.loadout[Number(k) - 1]!;
      if (w !== this.weapon) (this.weapon = w), (this.reloadUntil = 0), this.buildGun();
    } else if (k === "r") this.reload();
  }
  private reload() {
    const W = WEAPONS[this.weapon];
    if (this.reloadUntil || this.ammo[this.weapon]! >= W.mag || this.reserve[this.weapon]! <= 0) return;
    this.reloadUntil = performance.now() + W.reload * 1000;
  }
  down() {
    if (document.pointerLockElement !== this.host.canvas) void this.host.canvas.requestPointerLock?.();
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
    if (now < this.deadUntil || this.over) return;
    if (this.reloadUntil || now < this.nextShot) return;
    if (this.ammo[this.weapon]! <= 0) return this.reload();
    this.nextShot = now + 60000 / W.rpm;
    this.ammo[this.weapon]!--;
    this.shots++;
    const cam = this.host.camera;
    const eye = cam.getWorldPosition(new THREE.Vector3());
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const moving = Math.hypot(this.host.body().x - this.lastX, this.host.body().z - this.lastZ) > 0.02;
    const spread = W.spread * (this.zoom ? 0.4 : 1) * (moving ? 1.8 : 1) + this.recoil * 0.4;
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
      for (const b of this.bots) if (b.state !== "dead" && (this.setup.mode !== "tdm" || b.team !== 0)) test(b.body.x, b.body.z, b.body.y, 1.75, { bot: b });
      for (const t of this.targets) if (!t.hit) test(t.x, t.z, 0, 1.65, { tgt: t });
      if (this.setup.online) for (const o of this.host.others()) test(o.x, o.z, o.y, 1.75, { online: o.id });
      const end = best ? eye.clone().addScaledVector(dir, (best as { d: number }).d) : eye.clone().addScaledVector(dir, wallDist);
      this.tracer(this.flash.getWorldPosition(new THREE.Vector3()), end);
      if (best) {
        const B = best as { d: number; hs: boolean; bot?: Bot; tgt?: Tgt; online?: string };
        hitAny = true;
        const falloff = Math.max(0.5, 1 - Math.max(0, B.d - W.range * 0.4) / W.range);
        const dmg = W.dmg * falloff * (B.hs ? (this.weapon === "shotgun" ? 1.5 : 2) : 1);
        if (B.bot) this.damageBot(B.bot, dmg, B.hs);
        if (B.tgt) (B.tgt.hit = true), (B.tgt.m.rotation.x = -1.4), this.kills++;
        if (B.online) this.host.hitOnline(B.online, this.weapon, B.hs);
        this.hitMark = now;
      } else if (k < 1) this.impact(end);
    }
    if (hitAny) this.hits++;
    // Recoil kicks the view up and a little sideways.
    this.recoil = Math.min(0.12, this.recoil + W.recoil);
    this.host.look((Math.random() - 0.5) * W.recoil * 120, -W.recoil * 260);
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
    b.hp -= dmg;
    b.target = "me";
    b.seeAt = performance.now();
    if (b.hp <= 0) {
      b.state = "dead";
      b.deaths++;
      b.respawnAt = performance.now() + 3500;
      b.av.root.visible = false;
      this.kills++;
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
      this.deadUntil = performance.now() + 3000;
      const b = this.bots.find((x) => x.name === by);
      if (b) b.kills++;
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
      for (const w of this.setup.loadout) this.ammo[w] = WEAPONS[w].mag;
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
    return this.host.ph.ray(ax, ay + 1.5, az, bx, by + 1.4, bz) >= 0.999;
  }

  private lastX = 0;
  private lastZ = 0;
  update(dt: number, t: number) {
    const now = performance.now();
    const me = this.host.body();
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
    this.gun.visible = now > this.deadUntil;
    if (this.reloadUntil) this.gun.rotation.x -= 0.6;
    if (this.flash.visible && now - this.nextShot > -60000 / WEAPONS[this.weapon].rpm + 40) this.flash.visible = false;
    this.flashLight.intensity = Math.max(0, this.flashLight.intensity - dt * 120);
    this.lastX = me.x;
    this.lastZ = me.z;
    for (const f of this.fx) if (now > f.until) (this.host.scene.remove(f.m), ((f.m as THREE.Mesh).geometry as THREE.BufferGeometry).dispose());
    this.fx = this.fx.filter((f) => now <= f.until);
    // Respawn after a death.
    if (this.deadUntil && now > this.deadUntil && this.hp <= 0 && this.setup.mode !== "duel") {
      this.hp = 100;
      this.armor = 50;
      for (const w of this.setup.loadout) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
      const sp = this.spawn(0, Math.floor(Math.random() * 6));
      this.host.teleport(sp.x, sp.z, this.facingCentre(sp));
    }
    // Bots.
    const skill = BOT_SKILL[this.setup.difficulty];
    for (const b of this.bots) {
      if (b.state === "dead") {
        if (now > b.respawnAt && this.setup.mode !== "duel") this.respawnBot(b);
        continue;
      }
      // Who to fight: me (if an enemy) or the nearest visible enemy bot.
      const enemiesOfB: { x: number; y: number; z: number; who: Bot | "me" }[] = [];
      if (this.setup.mode !== "tdm" || b.team !== 0) if (now > this.deadUntil) enemiesOfB.push({ x: me.x, y: me.y, z: me.z, who: "me" });
      for (const o of this.bots) if (o !== b && o.state !== "dead" && (this.setup.mode !== "tdm" || o.team !== b.team)) enemiesOfB.push({ x: o.body.x, y: o.body.y, z: o.body.z, who: o });
      let foe: (typeof enemiesOfB)[number] | null = null, fd = Infinity;
      for (const e of enemiesOfB) {
        const d = Math.hypot(e.x - b.body.x, e.z - b.body.z);
        if (d < fd && d < 60 && this.sees(b.body.x, b.body.y, b.body.z, e.x, e.y, e.z)) (fd = d), (foe = e);
      }
      let mx = 0, mz = 0;
      const sp = 3.4;
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
              if (o.hp <= 0) (o.state = "dead"), (o.deaths++, b.kills++), (o.respawnAt = now + 3500), (o.av.root.visible = false), this.feedLine(`${b.name} took out ${o.name}`);
            }
          }
          if (b.ammo <= 0) (b.reloadUntil = now + 2200), (b.ammo = 30), (b.state = "cover"), (b.goal = this.coverFrom(b, foe));
        }
      } else if (b.state === "engage") (b.state = "patrol"), (b.goal = Math.random() < 0.5 ? new THREE.Vector3(me.x, 0, me.z) : this.randomPoint());
      // Move: to cover, on patrol, or flanking towards where the fight is.
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
      score: this.setup.mode === "tdm" ? `Blue ${mineT} : ${theirsT} Red` : this.setup.mode === "duel" ? `Rounds ${this.rounds.me} : ${this.rounds.them}` : `${this.kills} kills`,
      time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
      feed: this.feed,
      hit: now - this.hitMark < 160 ? 1 : 0,
      dead: now < this.deadUntil ? Math.ceil((this.deadUntil - now) / 1000) : 0,
      board: this.onlineBoard ?? [{ name: "You", team: 0, k: this.kills, d: this.deaths, me: true }, ...this.bots.map((b) => ({ name: b.name, team: b.team, k: b.kills, d: b.deaths, me: false }))].sort((a, b) => b.k - a.k),
      zoom: this.zoom,
      over: this.over,
      round: this.setup.mode === "duel" ? `Round ${this.rounds.n}` : "",
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
      for (const w of this.setup.loadout) (this.ammo[w] = WEAPONS[w].mag), (this.reserve[w] = WEAPONS[w].mag * 4);
    }
    this.kills = s.board.find((b) => b.id === myId)?.k ?? this.kills;
    this.onlineBoard = s.board.map((b) => ({ name: b.name, team: b.team, k: b.k, d: b.d, me: b.id === myId }));
    this.feed = s.feed;
    this.endsAt = performance.now() + s.endsIn * 1000;
    if (s.over && !this.over) this.end(s.over);
  }

  stop() {
    document.removeEventListener("mousemove", this.lockMove);
    window.removeEventListener("keydown", this.keyDown);
    this.host.canvas.removeEventListener("mousedown", this.mouseRight);
    this.host.canvas.removeEventListener("mouseup", this.mouseRight);
    this.host.canvas.removeEventListener("contextmenu", this.noMenu);
    if (document.pointerLockElement) document.exitPointerLock();
    this.host.scene.remove(this.group, this.gun, this.flashLight);
    for (const b of this.bots) (this.host.scene.remove(b.av.root), b.av.dispose());
    for (const f of this.fx) this.host.scene.remove(f.m);
    this.host.ph.remove("arena");
    this.host.fov(1);
    this.host.hud(null);
  }
}
