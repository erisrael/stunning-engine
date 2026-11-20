import * as THREE from "three";
import { CATALOG, SHOPS, type HomeLayout, type Item, type Shop } from "@/lib/fun-catalog";
import type { Physics } from "./engine";
import { furniture, prop, showcase, tree, vehicle } from "./models";
import { canvasTex, cone, cyl, floorTex, grassTex, mesh, pavingTex, roadTex, signPlane, sphere, textSprite, toon, unitBox } from "./toon";
import { PITCH } from "./soccer";
import { ROADS, buildStreets } from "./streets";
import { buildDistricts } from "./buildings";
import { glass as glassMat, surface } from "./pbr";
import { buildHouse } from "./houses";
import { optimizeStatic } from "./merge";
import { anyVehicle } from "./cars";
import { buildGrandPrix } from "./gp";

// The town: a plaza in the middle; the office tower (three floors with stairs, an elevator, a lobby, a café, a town
// hall, meeting rooms and a desk for everyone) to the north; shops and the car dealer to the east; the park with
// archery, a target gallery, hoops, a parkour course, a dance floor and a fishing pond to the west; homes to the
// south; a ring road for racing. Every building can be entered; walls, furniture and fences are solid.

export type Interact = { id: string; x: number; y: number; z: number; r: number; label: string; kind: string; data?: Record<string, unknown> };
export type NpcDef = { id: string; name: string; role: string; seed: number; x: number; y: number; z: number; ry: number; lines: string[]; actions: { label: string; act: string; arg?: string }[]; path?: [number, number][]; sit?: boolean; personality?: import("./npc-brain").Personality; person?: string; female?: boolean; brainRole?: import("./npc-brain").Role };
export type Spot = { x: number; y: number; z: number; ry: number };
type Rect = { x0: number; z0: number; x1: number; z1: number };
export type MapRect = { x: number; z: number; w: number; d: number; color: string; label?: string };

export const FH = 4.5; // office floor height
export const HQ = { x0: -26, x1: 26, z0: -80, z1: -44 };
export const RING = 135;
export const SHAFT = { x0: 18, x1: 22, z0: -58, z1: -54 };

// Static boxes of one colour become one instanced mesh (a few draw calls for a whole district).
class Blocks {
  private byColor = new Map<string, THREE.Matrix4[]>();
  constructor(private ph: Physics) {}
  add(color: string, x: number, y: number, z: number, w: number, h: number, d: number, solid = true, rotY = 0, tag?: string) {
    if (SKIN[color]) color = SKIN[color]!;
    // "veh" boxes are invisible and stop only vehicles.
    if (color !== "veh") {
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(w, h, d));
      const list = this.byColor.get(color) ?? [];
      list.push(m);
      this.byColor.set(color, list);
    }
    if (solid) {
      if (rotY && Math.abs(Math.sin(rotY * 2)) > 0.01) {
        const r = Math.max(w, d) / 2;
        this.ph.sized(x, y, z, r * 1.4, h, r * 1.4, tag);
      } else if (Math.abs(Math.sin(rotY)) > 0.5) this.ph.sized(x, y, z, d, h, w, tag);
      else this.ph.sized(x, y, z, w, h, d, tag);
    }
  }
  // An axis-aligned box from corners.
  span(color: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, solid = true, tag?: string) {
    this.add(color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), solid, 0, tag);
  }
  finish(parent: THREE.Object3D, opts: { transparent?: number; shadows?: boolean } = {}) {
    for (const [color, list] of this.byColor) {
      const [c, t] = color.split("|");
      // See-through walls are real glass (reflections from the sky); everything else by its colour or surface.
      // Building glass: a clear, slightly blue-grey pane (whatever pale colour the old block used).
      const mat = t && Number(t) < 0.6 && !c!.includes(":") ? glassMat("#5f7682", 0.2, 0.03) : toon(c!, t ? { transparent: Number(t) } : {});
      const inst = new THREE.InstancedMesh(unitBox(), mat, list.length);
      list.forEach((m, i) => inst.setMatrixAt(i, m));
      inst.instanceMatrix.needsUpdate = true;
      inst.castShadow = opts.shadows ?? true;
      inst.receiveShadow = true;
      inst.computeBoundingSphere();
      parent.add(inst);
    }
    this.byColor.clear();
  }
}

// A rectangle minus holes, as a few rectangles (floors with stairwells and the elevator shaft).
function minus(outer: Rect, holes: Rect[]): Rect[] {
  const xs = [...new Set([outer.x0, outer.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= outer.x0 && x <= outer.x1).sort((a, b) => a - b);
  const zs = [...new Set([outer.z0, outer.z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((z) => z >= outer.z0 && z <= outer.z1).sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let j = 0; j + 1 < zs.length; j++) {
    let run: Rect | null = null;
    for (let i = 0; i + 1 < xs.length; i++) {
      const cx = (xs[i]! + xs[i + 1]!) / 2, cz = (zs[j]! + zs[j + 1]!) / 2;
      const inHole = holes.some((h) => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1);
      if (!inHole) {
        if (run && run.x1 === xs[i]) run.x1 = xs[i + 1]!;
        else (run = { x0: xs[i]!, z0: zs[j]!, x1: xs[i + 1]!, z1: zs[j + 1]! }), out.push(run);
      } else run = null;
    }
  }
  return out;
}

// A wall along x or z with openings (doors), from y0 up h.
function wall(b: Blocks, color: string, axis: "x" | "z", at: number, from: number, to: number, y0: number, h: number, t: number, gaps: [number, number, number?][] = [], tag?: string) {
  const cuts = [...gaps].sort((a, c) => a[0] - c[0]);
  let cur = from;
  const seg = (a: number, c: number, ya: number, yc: number) => {
    if (c - a < 0.01 || yc - ya < 0.01) return;
    if (axis === "x") b.span(color, a, ya, at - t / 2, c, yc, at + t / 2, true, tag);
    else b.span(color, at - t / 2, ya, a, at + t / 2, yc, c, true, tag);
  };
  for (const [g0, g1, top] of cuts) {
    seg(cur, g0, y0, y0 + h);
    if (top !== undefined && top < h) seg(g0, g1, y0 + top, y0 + h);
    cur = g1;
  }
  seg(cur, to, y0, y0 + h);
}

export type Elevator = { y: number; target: number; level: number; moving: boolean; doorOpen: number; cab: THREE.Group; doors: { box: import("./engine").Box; mesh: THREE.Mesh }[]; floor: import("./engine").Box; goTo: (l: number) => void };

// The town's buildings, given real surfaces: floors, stairs and trims of the old blocks keep their layout but are
// drawn in stone, wood, tiles and concrete (by their colour).
const SKIN: Record<string, string> = {
  "#e7e5e4": "marble:#f4f2ee",
  "#d6d3d1": "laminate:#ffffff",
  "#a8a29e": "concrete:#d4d0c8",
  "#94a3b8": "concrete:#b9b6b0",
  "#78350f": "wood:#c8a27a",
  "#f1f5f9": "tiles:#d8d6d2",
  "#fef3c7": "plaster:#f2e6c9",
  "#fde68a": "plaster:#ecd9a6",
  "#cbd5e1": "plaster:#d9dde2",
  "#e2e8f0": "concrete:#e8e6e1",
};

export type CityInput = {
  name: string;
  departments: string[];
  residents: { id: string; name: string; dept: string; me: boolean }[];
  homes: Record<string, HomeLayout>;
  items: Item[];
  notice: string;
  props: { id: string; kind: string; x: number; z: number; r: number; s: number; color: string; text: string; name: string; lines: string[]; model?: string; solid?: boolean; y?: number }[];
  meId: string;
  // 0: few details (low graphics), 1: everything.
  detail?: number;
};

export function buildCity(ph: Physics, input: CityInput) {
  const root = new THREE.Group();
  const interacts: Interact[] = [];
  const npcs: NpcDef[] = [];
  const mapRects: MapRect[] = [];
  const desks = new Map<string, Spot>();
  const homeDoors = new Map<string, Spot>();
  const districts: { name: string; x: number; z: number; r: number; group: THREE.Group }[] = [];
  const animated: ((t: number, dt: number) => void)[] = [];
  const district = (name: string, x: number, z: number, r: number) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    districts.push({ name, x, z, r, group: g });
    return g;
  };
  const I = (i: Interact) => interacts.push(i);
  // What each shop shows on its podiums: the things that normally cost something (even while Admin makes
  // everything free), newest first for the car dealer.
  const listPrice = (k: string, p: number) => CATALOG.find((c) => c.key === k)?.price ?? p;
  const itemsOf = (s: Shop) => input.items.filter((i) => i.shop === s && listPrice(i.key, i.price) > 0).sort((a, b) => (s === "cars" ? listPrice(b.key, b.price) - listPrice(a.key, a.price) : 0));

  // ---------------------------------------------------------------- ground, streets and the districts round the old town
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), surface("grass", { tint: "#b9d79a" }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  const streets = buildStreets(ph, { trees: true, detail: input.detail ?? 1 });
  root.add(streets.group);
  for (const r of ROADS) {
    const len = r.to - r.from, mid = (r.from + r.to) / 2;
    mapRects.push(r.axis === "x" ? { x: mid, z: r.c, w: len, d: r.w + r.s * 2, color: "#6b7280" } : { x: r.c, z: mid, w: r.w + r.s * 2, d: len, color: "#6b7280" });
  }
  const districtsBuilt = buildDistricts(ph, { detail: input.detail ?? 1 });
  root.add(districtsBuilt.group);
  mapRects.push({ x: 78, z: -86, w: 96, d: 80, color: "#9aa3ad", label: "Downtown" }, { x: -78, z: -86, w: 96, d: 80, color: "#b8b0a2", label: "Civic" }, { x: 114, z: 78, w: 24, d: 96, color: "#8d959b", label: "Industry" }, { x: -112, z: 104, w: 26, d: 44, color: "#4d7a3a", label: "Wood" });

  // ---------------------------------------------------------------- the plaza
  const plaza = district("Plaza", 0, 0, 30);
  const pv = new THREE.Mesh(new THREE.CircleGeometry(24, 48), surface("stone", { tint: "#e6e1d6" }));
  pv.rotation.x = -Math.PI / 2;
  pv.position.y = 0.03;
  pv.receiveShadow = true;
  plaza.add(pv);
  mapRects.push({ x: 0, z: 0, w: 40, d: 40, color: "#e7e2d8", label: "Plaza" });
  const fountain = prop("fountain", "#a8a29e", "");
  fountain.scale.setScalar(1.4);
  plaza.add(fountain);
  ph.post({ x: 0, z: 0, r: 3.2, minY: 0, maxY: 1.2 });
  const spray: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const d = mesh(sphere(8), toon("#bae6fd", { transparent: 0.7 }), 0, 2.4, 0, 0.3, 0.3, 0.3);
    d.userData.keep = true;
    plaza.add(d);
    spray.push(d);
  }
  animated.push((t) => spray.forEach((d, i) => {
    const k = (t * 0.8 + i / 6) % 1;
    const a = (i / 6) * Math.PI * 2;
    d.position.set(Math.cos(a) * k * 2.4, 2.4 + Math.sin(k * Math.PI) * 1.4 - k * 1.2, Math.sin(a) * k * 2.4);
  }));
  const townSign = textSprite([input.name, "Office north · Shops east · Park west · Homes south"], { width: 7 });
  townSign.position.set(0, 6, 0);
  plaza.add(townSign);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const bx = Math.cos(a) * 9, bz = Math.sin(a) * 9;
    const b = prop("bench", "#a16207", "");
    b.position.set(bx, 0, bz);
    b.rotation.y = -a - Math.PI / 2;
    plaza.add(b);
    ph.post({ x: bx, z: bz, r: 0.7, minY: 0, maxY: 0.5 });
    I({ id: `bench-p${i}`, x: bx - Math.cos(a) * 0.4, y: 0, z: bz - Math.sin(a) * 0.4, r: 1.6, label: "Sit on the bench", kind: "sit", data: { x: bx, y: 0, z: bz, ry: -a - Math.PI / 2 + Math.PI } });
    const l = prop("lamp", "", "");
    l.position.set(Math.cos(a + 0.3) * 14, 0, Math.sin(a + 0.3) * 14);
    plaza.add(l);
    ph.post({ x: l.position.x, z: l.position.z, r: 0.2, minY: 0, maxY: 4 });
  }
  // The notice board.
  const board = signPlane(input.notice || "Welcome! Earn coins by working and playing.", 4, 1.6, "#1e3a8a");
  board.position.set(0, 2.2, 18);
  board.rotation.y = Math.PI;
  plaza.add(board);
  // Parking by the plaza: call your vehicle here (or from the menu anywhere outside).
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ map: canvasTex("lot", 128, 128, (g) => {
    g.fillStyle = "#475569";
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = "#f8fafc";
    for (let i = 0; i < 5; i++) g.fillRect(8 + i * 28, 6, 3, 50);
  }) }));
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(22, 0.025, 22);
  plaza.add(lot);
  mapRects.push({ x: 22, z: 22, w: 16, d: 16, color: "#475569", label: "P" });
  I({ id: "parking", x: 16, y: 0, z: 16, r: 3, label: "Get my vehicle", kind: "ride" });
  const meter = prop("kiosk", "#0ea5e9", "");
  meter.scale.setScalar(0.5);
  meter.position.set(15, 0, 15);
  plaza.add(meter);

  // ---------------------------------------------------------------- the office tower (north)
  const biz = district("Office", 0, -62, 40);
  mapRects.push({ x: 0, z: -62, w: 52, d: 36, color: "#93c5fd", label: "Office" });
  const levels: THREE.Group[] = [0, 1, 2].map((l) => {
    const g = new THREE.Group();
    g.name = `level${l}`;
    biz.add(g);
    return g;
  });
  const roof = new THREE.Group();
  roof.name = "roof";
  biz.add(roof);
  const glass = "#a5d8ff|0.32";
  {
    // Facade: glass between pillars, bands at each floor, the entrance on the south.
    for (let l = 0; l < 3; l++) {
      const b = new Blocks(ph);
      const y0 = l * FH;
      wall(b, glass, "x", HQ.z1, HQ.x0, HQ.x1, y0, FH, 0.3, l === 0 ? [[-3, 3, 3.4]] : [], "glass");
      wall(b, glass, "x", HQ.z0, HQ.x0, HQ.x1, y0, FH, 0.3, [], "glass");
      wall(b, glass, "z", HQ.x0, HQ.z0, HQ.z1, y0, FH, 0.3, [], "glass");
      wall(b, glass, "z", HQ.x1, HQ.z0, HQ.z1, y0, FH, 0.3, [], "glass");
      b.finish(levels[l]!, { shadows: false });
      const s = new Blocks(ph);
      for (let x = HQ.x0; x <= HQ.x1; x += 6.5) for (const z of [HQ.z0, HQ.z1]) s.span("#e2e8f0", x - 0.35, y0, z - 0.35, x + 0.35, y0 + FH, z + 0.35, !(l === 0 && z === HQ.z1 && Math.abs(x) < 3.5));
      for (let z = HQ.z0; z <= HQ.z1; z += 6) for (const x of [HQ.x0, HQ.x1]) s.span("#e2e8f0", x - 0.35, y0, z - 0.35, x + 0.35, y0 + FH, z + 0.35);
      if (l > 0) s.span("#cbd5e1", HQ.x0 - 0.4, y0 - 0.35, HQ.z0 - 0.4, HQ.x1 + 0.4, y0, HQ.z0 + 0.1, false);
      s.finish(levels[l]!);
    }
    // Floors with holes for the two flights of stairs and the elevator shaft.
    const holeA = { x0: -25.6, x1: -21.9, z0: -56.75, z1: -50 };
    const holeB = { x0: -21.6, x1: -17.9, z0: -56.75, z1: -50 };
    const shaft = { x0: SHAFT.x0, x1: SHAFT.x1, z0: SHAFT.z0, z1: SHAFT.z1 };
    const floorColors = ["#e7e5e4", "#d6d3d1", "#d6d3d1"];
    for (let l = 0; l < 4; l++) {
      const parent = l < 3 ? levels[l]! : roof;
      const b = new Blocks(ph);
      const y = l * FH;
      const rects = l === 0 ? [{ x0: HQ.x0, x1: HQ.x1, z0: HQ.z0, z1: HQ.z1 }] : minus({ x0: HQ.x0, x1: HQ.x1, z0: HQ.z0, z1: HQ.z1 }, l === 1 ? [holeA, shaft] : l === 2 ? [holeB, shaft] : [shaft]);
      for (const r of rects) b.span(l === 3 ? "#94a3b8" : floorColors[l]!, r.x0, y - (l === 0 ? 0.02 : 0.3), r.z0, r.x1, y + (l === 0 ? 0.04 : 0), r.z1, l !== 0);
      if (l === 3) b.span("#64748b", HQ.x0 - 0.5, y, HQ.z0 - 0.5, HQ.x1 + 0.5, y + 0.8, HQ.z0, true);
      b.finish(parent);
    }
    const sign = signPlane(`${input.name} HQ`, 12, 1.6, "#0f172a");
    sign.position.set(0, FH * 3 + 1.4, HQ.z1 + 0.25);
    roof.add(sign);
    // Stairs: two flights (ground to first, first to second), with railings round the stairwells.
    const st = new Blocks(ph);
    for (let i = 0; i < 15; i++) {
      st.span("#a8a29e", -25.5, 0, -50 - (i + 1) * 0.45, -22, (i + 1) * 0.3, -50 - i * 0.45);
      st.span("#a8a29e", -21.5, FH, -56.75 + i * 0.45, -18, FH + (i + 1) * 0.3, -56.75 + (i + 1) * 0.45);
    }
    st.span("#475569", -21.95, FH, -56, -21.85, FH + 1, -50);
    st.span("#475569", -25.6, FH, -50.1, -21.9, FH + 1, -49.95);
    st.span("#475569", -21.7, 2 * FH, -56.85, -17.8, 2 * FH + 1, -56.75);
    st.span("#475569", -17.85, 2 * FH, -56.75, -17.75, 2 * FH + 1, -50.8);
    st.span("#475569", -21.7, 2 * FH, -56.75, -21.6, 2 * FH + 1, -50.8);
    st.finish(levels[0]!);
    for (const [l, label] of [[0, "Stairs up"], [1, "Stairs up / down"], [2, "Stairs down"]] as const) {
      const s = textSprite([label], { width: 2.4 });
      s.position.set(-22, l * FH + 3.2, -49);
      levels[l]!.add(s);
    }
  }

  // The elevator: a cabin that moves between the three floors, with doors on each floor.
  const shaftB = new Blocks(ph);
  shaftB.span("#cbd5e1", SHAFT.x0 - 0.2, 0, SHAFT.z0, SHAFT.x0, 3 * FH, SHAFT.z1);
  shaftB.span("#cbd5e1", SHAFT.x1, 0, SHAFT.z0, SHAFT.x1 + 0.2, 3 * FH, SHAFT.z1);
  shaftB.span("#cbd5e1", SHAFT.x0 - 0.2, 0, SHAFT.z0 - 0.2, SHAFT.x1 + 0.2, 3 * FH, SHAFT.z0);
  for (let l = 0; l < 3; l++) {
    shaftB.span("#94a3b8", SHAFT.x0 - 0.2, l * FH, SHAFT.z1, SHAFT.x0 + 0.8, (l + 1) * FH, SHAFT.z1 + 0.2);
    shaftB.span("#94a3b8", SHAFT.x1 - 0.8, l * FH, SHAFT.z1, SHAFT.x1 + 0.2, (l + 1) * FH, SHAFT.z1 + 0.2);
    shaftB.span("#94a3b8", SHAFT.x0 + 0.8, l * FH + 3, SHAFT.z1, SHAFT.x1 - 0.8, (l + 1) * FH, SHAFT.z1 + 0.2);
  }
  shaftB.finish(biz);
  const cab = new THREE.Group();
  cab.add(mesh(unitBox(), toon("#78716c"), 0, -0.1, 0, 3.9, 0.2, 3.9));
  cab.add(mesh(unitBox(), toon("#e5e7eb"), 0, 1.6, -1.9, 3.9, 3.2, 0.05));
  cab.add(mesh(unitBox(), toon("#fef3c7", { emissive: "#a16207" }), 0, 3.0, 0, 1.2, 0.05, 1.2));
  cab.position.set((SHAFT.x0 + SHAFT.x1) / 2, 0, (SHAFT.z0 + SHAFT.z1) / 2);
  cab.userData.keep = true;
  biz.add(cab);
  const cabFloor = ph.addDynamic({ minX: SHAFT.x0 + 0.05, maxX: SHAFT.x1 - 0.05, minZ: SHAFT.z0 + 0.05, maxZ: SHAFT.z1 - 0.05, minY: -0.2, maxY: 0, tag: "cab" });
  const doors = [0, 1, 2].map((l) => {
    const m = mesh(unitBox(), toon("#9ca3af"), (SHAFT.x0 + SHAFT.x1) / 2, l * FH + 1.5, SHAFT.z1 + 0.1, 2.4, 3, 0.1);
    m.userData.keep = true;
    biz.add(m);
    return { box: ph.addDynamic({ minX: SHAFT.x0 + 0.8, maxX: SHAFT.x1 - 0.8, minZ: SHAFT.z1, maxZ: SHAFT.z1 + 0.2, minY: l * FH, maxY: l * FH + 3, tag: "door" }), mesh: m };
  });
  const elevator: Elevator = {
    y: 0,
    target: 0,
    level: 0,
    moving: false,
    doorOpen: 1,
    cab,
    doors,
    floor: cabFloor,
    goTo: (l) => {
      elevator.target = Math.max(0, Math.min(2, l)) * FH;
      elevator.moving = elevator.target !== elevator.y;
      elevator.level = Math.round(elevator.target / FH);
    },
  };
  animated.push((_, dt) => {
    const e = elevator;
    // Doors close before moving and open on arrival.
    const want = e.moving ? 0 : 1;
    e.doorOpen += Math.sign(want - e.doorOpen) * Math.min(Math.abs(want - e.doorOpen), dt * 2);
    if (e.moving && e.doorOpen <= 0.01) {
      const d = e.target - e.y;
      e.y += Math.sign(d) * Math.min(Math.abs(d), dt * 2.6);
      if (Math.abs(e.target - e.y) < 0.001) (e.y = e.target), (e.moving = false);
    }
    e.cab.position.y = e.y;
    e.floor.minY = e.y - 0.2;
    e.floor.maxY = e.y;
    const at = Math.round(e.y / FH);
    e.doors.forEach((d, l) => {
      const open = !e.moving && l === at && Math.abs(e.y - l * FH) < 0.01 ? e.doorOpen : 0;
      d.box.on = open < 0.9;
      d.mesh.scale.x = Math.max(0.05, 2.4 * (1 - open));
      d.mesh.position.x = (SHAFT.x0 + SHAFT.x1) / 2 + open * 1.1;
    });
  });
  for (let l = 0; l < 3; l++) {
    I({ id: `lift-call-${l}`, x: 20, y: l * FH, z: -52.6, r: 2, label: "Elevator: choose a floor", kind: "elevator", data: { level: l } });
    const s = textSprite([["Ground floor", "First floor", "Second floor"][l]!, "Elevator"], { width: 2.2 });
    s.position.set(20, l * FH + 3.6, -53.2);
    levels[l]!.add(s);
  }

  // Ground floor: entrance, security, reception, waiting area; behind it a café and the town hall.
  {
    const L0 = levels[0]!;
    const b = new Blocks(ph);
    b.span("veh", -3.2, 0, HQ.z1 - 0.4, 3.2, 2.5, HQ.z1 + 0.4, true, "veh");
    b.span("#f8fafc", -4, 0, -53.2, 4, 1.1, -52.2);
    b.span("#0ea5e9", -4.1, 1.1, -53.3, 4.1, 1.2, -52.1, false);
    for (const x of [-7, -3.2, 3.2, 7]) b.span("#475569", x - 0.15, 0, -48.2, x + 0.15, 1, -47.6);
    b.finish(L0);
    // The wall between the lobby and the café and hall, with a door to each.
    const w = new Blocks(ph);
    wall(w, "#e2e8f0", "x", -60, HQ.x0 + 0.2, HQ.x1 - 0.2, 0, FH - 0.3, 0.3, [[-12, -9, 2.8], [9, 12, 2.8]]);
    w.finish(L0);
    npcs.push({ id: "npc-reception", name: "Mia", role: "Reception", seed: 11, x: 0, y: 0, z: -54.2, ry: 0, lines: ["Welcome to the office! Workspaces are upstairs: take the stairs on the left or the elevator on the right.", "The café is behind me on the left, the town hall on the right."], actions: [{ label: "Who is in today?", act: "who" }, { label: "Where is my desk?", act: "mydesk" }] });
    npcs.push({ id: "npc-guard", name: "Dawit", role: "Security", seed: 12, x: 9, y: 0, z: -47.5, ry: Math.PI, lines: ["Good to see you. Badge in, and have a great day.", "No running in the lobby!"], actions: [] });
    for (const [x, z, r] of [[-13, -48, Math.PI / 2], [13, -48, -Math.PI / 2]] as const) {
      const s = furniture("sofa", "#475569", 3, 1.5);
      s.position.set(x, 0, z);
      s.rotation.y = r;
      L0.add(s);
      ph.sized(x, 0.35, z, 1.5, 0.7, 3);
      I({ id: `lobby-sofa${x}`, x: x + Math.sin(r) * 1.2, y: 0, z, r: 1.8, label: "Sit and wait", kind: "sit", data: { x: x + Math.sin(r) * 0.3, y: 0, z, ry: r } });
      const p = furniture("plant", "#16a34a", 1, 1);
      p.position.set(x, 0, z - 2.6);
      L0.add(p);
    }
    const screen = signPlane("Welcome. Today in the office: see the board", 6, 1.4, "#0f172a", "#7dd3fc");
    screen.position.set(0, 3, -59.6);
    screen.userData.lobbyScreen = true;
    L0.add(screen);
    // Café and kitchen.
    const cafe = new Blocks(ph);
    cafe.span("#78350f", -24, 0, -78, -12, 1.1, -76.8);
    cafe.span("#f8fafc", -24, 1.1, -78, -12, 1.2, -76.8, false);
    cafe.span("#e5e7eb", -25.6, 0, -79.6, -24, 2.2, -74);
    cafe.span("#111827", -20, 1.2, -77.8, -19, 1.8, -77.2, false);
    cafe.finish(L0);
    npcs.push({ id: "npc-barista", name: "Liya", role: "Café", seed: 13, x: -18, y: 0, z: -78.8, ry: 0, lines: ["Coffee, tea or a fresh juice? Everything is on the house.", "A short break makes the afternoon better."], actions: [{ label: "A coffee, please", act: "drink" }] });
    for (let i = 0; i < 4; i++) {
      const tx = -22 + (i % 2) * 8, tz = -70 + Math.floor(i / 2) * 5;
      const t = furniture("table", "#a16207", 1.6, 1.2);
      t.position.set(tx, 0, tz);
      L0.add(t);
      ph.sized(tx, 0.4, tz, 1.6, 0.8, 1.2);
      for (const s of [-1, 1]) {
        const c = furniture("chair", "#0f766e", 0.6, 0.6);
        c.position.set(tx, 0, tz + s * 1.05);
        c.rotation.y = s > 0 ? Math.PI : 0;
        L0.add(c);
        I({ id: `cafe-chair${i}${s}`, x: tx, y: 0, z: tz + s * 1.4, r: 1.1, label: "Sit down", kind: "sit", data: { x: tx, y: 0, z: tz + s * 1.15, ry: s > 0 ? Math.PI : 0 } });
      }
    }
    const cs = signPlane("Café", 3, 0.8, "#78350f");
    cs.position.set(-10.5, 3.3, -59.6);
    L0.add(cs);
    // Restroom.
    const rr = new Blocks(ph);
    wall(rr, "#e0f2fe", "z", -3, -79.8, -66, 0, 3, 0.2, [[-69, -67.5, 2.4]]);
    wall(rr, "#e0f2fe", "x", -66, -12, -3, 0, 3, 0.2, []);
    rr.span("#f8fafc", -8, 0, -79.6, -6, 0.9, -78.8);
    rr.span("#93c5fd", -8, 1.6, -79.7, -6, 2.6, -79.6, false);
    rr.finish(L0);
    I({ id: "wash", x: -7, y: 0, z: -78, r: 1.5, label: "Wash your hands", kind: "wash" });
    const rs = signPlane("Restrooms", 2, 0.5, "#0369a1");
    rs.position.set(-2.85, 2.6, -68.2);
    rs.rotation.y = Math.PI / 2;
    L0.add(rs);
    // Town hall: a stage and a big screen, rows of chairs.
    const hall = new Blocks(ph);
    hall.span("#334155", 4, 0, -79.8, 25.6, 0.5, -74);
    hall.finish(L0);
    const hs = signPlane(input.notice || "Town hall", 10, 3, "#1e293b", "#e2e8f0");
    hs.position.set(14.8, 3.2, -79.6);
    L0.add(hs);
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 6; c++) {
        const x = 7 + c * 3, z = -70 + r * 3;
        const ch = furniture("chair", "#b91c1c", 0.6, 0.6);
        ch.position.set(x, 0, z);
        ch.rotation.y = Math.PI;
        L0.add(ch);
        I({ id: `hall${r}${c}`, x, y: 0, z: z + 0.7, r: 0.9, label: "Take a seat", kind: "sit", data: { x, y: 0, z, ry: Math.PI } });
      }
    I({ id: "stage", x: 14.8, y: 0.5, z: -76, r: 3, label: "Present on the stage", kind: "present" });
    const hl = signPlane("Town hall", 3, 0.8, "#7c2d12");
    hl.position.set(10.5, 3.3, -59.6);
    L0.add(hl);
  }

  // Upper floors: department workspaces with a desk and chair for everyone, a meeting room, an office and a lounge.
  {
    const depts = input.departments.length ? input.departments : ["Team"];
    const colors = ["#bfdbfe", "#fbcfe8", "#bbf7d0", "#fde68a", "#ddd6fe", "#fed7aa", "#a5f3fc", "#fecaca", "#d9f99d", "#f5d0fe", "#99f6e4", "#fef08a"];
    depts.slice(0, 12).forEach((d, i) => {
      const l = 1 + Math.floor(i / 6);
      const k = i % 6;
      const col = k % 3, row = Math.floor(k / 3);
      const x0 = -16 + col * 11, z0 = -79 + row * 17.5;
      const y = l * FH;
      const g = levels[l]!;
      const carpet = mesh(unitBox(), toon(colors[i % colors.length]!), x0 + 5.25, y + 0.02, z0 + 8.5, 10.5, 0.03, 16.8);
      carpet.receiveShadow = true;
      g.add(carpet);
      const b = new Blocks(ph);
      b.span("#e5e7eb", x0, y, z0, x0 + 0.15, y + 1.2, z0 + 7);
      b.span("#e5e7eb", x0, y, z0 + 10, x0 + 0.15, y + 1.2, z0 + 16.8);
      b.finish(g);
      const lab = textSprite([d, "Workspace"], { width: 3.6 });
      lab.position.set(x0 + 5.25, y + 3.4, z0 + 1.5);
      g.add(lab);
      const team = input.residents.filter((r) => r.dept === d);
      team.slice(0, 15).forEach((r, n) => {
        const dx = x0 + 1.9 + (n % 3) * 3.4, dz = z0 + 3 + Math.floor(n / 3) * 2.8;
        const desk = furniture("desk", r.me ? "#fde68a" : "#f8fafc", 1.6, 0.8);
        desk.position.set(dx, y, dz);
        g.add(desk);
        ph.sized(dx, y + 0.4, dz, 1.6, 0.8, 0.8);
        const chair = furniture("chair", "#111827", 0.6, 0.6);
        chair.position.set(dx, y, dz + 0.85);
        chair.rotation.y = Math.PI;
        g.add(chair);
        desks.set(r.id, { x: dx, y, z: dz + 0.9, ry: Math.PI });
        I({ id: `desk-${r.id}`, x: dx, y, z: dz + 1.2, r: 1.1, label: r.me ? "Use your computer" : `${r.name.split(" ")[0]}'s desk`, kind: r.me ? "computer" : "desk", data: { id: r.id, x: dx, y, z: dz + 0.9, ry: Math.PI } });
      });
    });
    // Meeting room (first floor) and a lead's office and lounge (second floor), in the north-west corner.
    for (const l of [1, 2]) {
      const y = l * FH;
      const g = levels[l]!;
      const b = new Blocks(ph);
      wall(b, l === 1 ? glass : "#e2e8f0", "x", -62, -25.8, -17, y, FH - 0.3, 0.2, [[-21.5, -19.5, 2.8]], "glass");
      wall(b, l === 1 ? glass : "#e2e8f0", "z", -17, -79.8, -62, y, FH - 0.3, 0.2, [], "glass");
      b.finish(g, { shadows: false });
      const sign = signPlane(l === 1 ? "Meeting room" : "Lead's office", 3, 0.7, "#1e293b");
      sign.position.set(-21.5, y + 3.3, -61.85);
      g.add(sign);
      if (l === 1) {
        const t = furniture("table", "#e5e7eb", 5, 2);
        t.position.set(-21.4, y, -71);
        t.rotation.y = Math.PI / 2;
        g.add(t);
        ph.sized(-21.4, y + 0.4, -71, 2, 0.8, 5);
        for (let i = 0; i < 6; i++) {
          const s = i < 3 ? -1 : 1;
          const cz = -73 + (i % 3) * 2;
          const c = furniture("chair", "#334155", 0.6, 0.6);
          c.position.set(-21.4 + s * 1.5, y, cz);
          c.rotation.y = s * -Math.PI / 2;
          g.add(c);
          I({ id: `meet${i}`, x: -21.4 + s * 1.9, y, z: cz, r: 0.9, label: "Join the meeting", kind: "sit", data: { x: -21.4 + s * 1.55, y, z: cz, ry: (s * -Math.PI) / 2 } });
        }
        const scr = signPlane("Meeting room: present a deck", 3.6, 2, "#0f172a", "#a5b4fc");
        scr.position.set(-21.4, y + 2, -79.6);
        g.add(scr);
        I({ id: "meet-screen", x: -21.4, y, z: -77.5, r: 1.6, label: "Use the screen", kind: "screen" });
      } else {
        const d2 = furniture("desk", "#78350f", 2.4, 1.2);
        d2.position.set(-21.4, y, -74);
        g.add(d2);
        ph.sized(-21.4, y + 0.4, -74, 2.4, 0.8, 1.2);
        const sh = furniture("shelf", "#78350f", 3, 0.6);
        sh.position.set(-24.8, y, -71);
        sh.rotation.y = Math.PI / 2;
        g.add(sh);
        ph.sized(-24.8, y + 1, -71, 0.6, 2, 3);
        const so = furniture("sofa", "#7c3aed", 3, 1.4);
        so.position.set(8, y, -50);
        so.rotation.y = Math.PI;
        g.add(so);
        ph.sized(8, y + 0.35, -50, 3, 0.7, 1.4);
        I({ id: "lounge", x: 8, y, z: -51.4, r: 1.6, label: "Relax in the lounge", kind: "sit", data: { x: 8, y, z: -50.3, ry: Math.PI } });
        const arc = furniture("arcade", "#7c3aed", 1, 1);
        arc.position.set(12, y, -46);
        arc.rotation.y = Math.PI;
        g.add(arc);
        ph.sized(12, y + 0.9, -46, 1, 1.8, 1);
        I({ id: "arcade", x: 12, y, z: -47.4, r: 1.3, label: "Play the arcade", kind: "arcade" });
      }
    }
  }

  // ---------------------------------------------------------------- the library (education, north-west)
  const lib = district("Library", -52, -62, 18);
  {
    const b = new Blocks(ph);
    const x0 = -62, x1 = -42, z0 = -72, z1 = -54;
    wall(b, "#fef3c7", "x", z1, x0, x1, 0, 5, 0.4, [[-53.5, -50.5, 3.2]]);
    wall(b, "#fef3c7", "x", z0, x0, x1, 0, 5, 0.4);
    wall(b, "#fef3c7", "z", x0, z0, z1, 0, 5, 0.4);
    wall(b, "#fef3c7", "z", x1, z0, z1, 0, 5, 0.4);
    b.span("#b45309", x0 - 0.5, 5, z0 - 0.5, x1 + 0.5, 5.4, z1 + 0.5);
    b.span("veh", -53.5, 0, z1 - 0.2, -50.5, 2, z1 + 0.2, true, "veh");
    b.finish(lib);
    const floor = mesh(unitBox(), toon("#d6a77a"), -52, 0.03, -63, 19.6, 0.04, 17.6);
    lib.add(floor);
    const s = signPlane("Library", 5, 1, "#78350f");
    s.position.set(-52, 4.2, z1 + 0.25);
    lib.add(s);
    for (let i = 0; i < 5; i++) {
      const sh = furniture("shelf", "#78350f", 3, 0.6);
      sh.position.set(-60 + i * 4, 0, -71.2);
      lib.add(sh);
      ph.sized(-60 + i * 4, 1, -71.2, 3, 2, 0.6);
    }
    for (let i = 0; i < 3; i++) {
      const tx = -57 + i * 5, tz = -63;
      const t = furniture("table", "#a16207", 2, 1.2);
      t.position.set(tx, 0, tz);
      lib.add(t);
      ph.sized(tx, 0.4, tz, 2, 0.8, 1.2);
      I({ id: `study${i}`, x: tx, y: 0, z: tz + 1.4, r: 1.1, label: "Study here", kind: "sit", data: { x: tx, y: 0, z: tz + 1, ry: Math.PI } });
    }
    I({ id: "book", x: -52, y: 0, z: -69.8, r: 2.5, label: "Read a book", kind: "book" });
    npcs.push({ id: "npc-librarian", name: "Ruth", role: "Library", seed: 21, x: -45, y: 0, z: -60, ry: -Math.PI / 2, lines: ["Quiet please... unless it is a good idea.", "Every book here has one useful tip inside."], actions: [{ label: "Give me a tip", act: "tip" }] });
    mapRects.push({ x: -52, z: -63, w: 20, d: 18, color: "#fde68a", label: "Library" });
  }

  // ---------------------------------------------------------------- shops (east)
  const shopsG = district("Shops", 70, 0, 50);
  const shopAt = (key: Shop, cx: number, south: boolean, w = 16, d = 14, color = "#fde68a") => {
    const front = south ? 13 : -13, back = south ? 13 + d : -13 - d;
    const z0 = Math.min(front, back), z1 = Math.max(front, back);
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const b = new Blocks(ph);
    const big = key === "cars";
    // A shop front of glass under a fascia, rendered walls in the shop's colour (muted, as real paint).
    const paint = `plaster:#${new THREE.Color(color).lerp(new THREE.Color("#e8e2d8"), 0.55).getHexString()}`;
    wall(b, glass, "x", front, x0 + 0.6, x1 - 0.6, 0, 4.2, 0.12, [[cx - (big ? 3 : 1.6), cx + (big ? 3 : 1.6), 3.2]], "glass");
    b.span(paint, x0, 4.2, front - 0.25, x1, 5.5, front + 0.25);
    for (const x of [x0 + 0.3, x1 - 0.3]) b.span(paint, x - 0.3, 0, front - 0.25, x + 0.3, 4.2, front + 0.25);
    b.span("#2f3438", x0 + 0.6, 4.1, front - 0.08, x1 - 0.6, 4.25, front + 0.08, false);
    wall(b, paint, "x", back, x0, x1, 0, 5.5, 0.4);
    wall(b, paint, "z", x0, z0, z1, 0, 5.5, 0.4);
    wall(b, paint, "z", x1, z0, z1, 0, 5.5, 0.4);
    b.span("#3a3f45", x0 - 0.4, 5.5, z0 - 0.4, x1 + 0.4, 5.9, z1 + 0.4);
    b.span("veh", cx - 3, 0, front - 0.25, cx + 3, 2, front + 0.25, true, "veh");
    // Counter and keeper at the back.
    const ck = south ? back - 2.4 : back + 2.4;
    b.span("#78350f", cx - 3, 0, ck - 0.5, cx + 3, 1.1, ck + 0.5);
    b.finish(shopsG);
    const fl = mesh(unitBox(), toon("#f1f5f9"), cx, 0.03, (z0 + z1) / 2, w - 0.6, 0.04, d - 0.6);
    shopsG.add(fl);
    const info = SHOPS[key];
    const sign = signPlane(info.label, Math.min(w - 2, 8), 1.2, "#0f172a", "#fde68a");
    sign.position.set(cx, 4.4, front + (south ? -0.25 : 0.25));
    if (south) sign.rotation.y = Math.PI;
    shopsG.add(sign);
    const awn = mesh(unitBox(), toon(["#ef4444", "#3b82f6", "#22c55e", "#a855f7", "#f97316", "#0ea5e9", "#eab308", "#ec4899"][Object.keys(SHOPS).indexOf(key)]!), cx, 3.6, front + (south ? -0.9 : 0.9), 6, 0.12, 1.6);
    awn.rotation.x = south ? 0.25 : -0.25;
    shopsG.add(awn);
    const kz = south ? back - 1.2 : back + 1.2;
    npcs.push({ id: `npc-shop-${key}`, name: info.keeper, role: info.label, seed: 30 + Object.keys(SHOPS).indexOf(key), x: cx, y: 0, z: kz, ry: south ? Math.PI : 0, lines: [info.line], actions: [{ label: "Browse the shop", act: "shop", arg: key }] });
    I({ id: `shop-${key}`, x: cx, y: 0, z: south ? ck - 1.3 : ck + 1.3, r: 2.2, label: `Shop at ${info.label}`, kind: "shop", data: { shop: key } });
    // Podiums with a few things on show.
    const show = itemsOf(key).slice(0, big ? 4 : 3);
    show.forEach((it, i) => {
      const px = cx - (show.length - 1) * (big ? 3 : 2.6) + i * (big ? 6 : 5.2), pz = (z0 + z1) / 2 + (south ? -1 : 1);
      const pod = mesh(cyl(20), toon("#e2e8f0"), px, 0.2, pz, big ? 4.6 : 1.4, 0.4, big ? 4.6 : 1.4);
      shopsG.add(pod);
      if (big) ph.post({ x: px, z: pz, r: 2.3, minY: 0, maxY: 1.4 });
      else ph.post({ x: px, z: pz, r: 0.7, minY: 0, maxY: 1.2 });
      const m = it.kind === "vehicle" ? anyVehicle(it.model ?? "hatch", it.color ?? "#3b82f6", undefined, true).group : showcase(it.kind, it.model ?? "", it.color ?? "#a855f7");
      m.position.set(px, 0.4, pz);
      m.scale.setScalar(big ? 0.9 : 0.8);
      m.userData.spin = true;
      shopsG.add(m);
      I({ id: `pod-${it.key}`, x: px, y: 0, z: pz + (south ? -1.6 : 1.6) * (big ? 1.8 : 1), r: big ? 2.6 : 1.4, label: `See ${it.label} (${it.price} coins)`, kind: "shop", data: { shop: key, item: it.key } });
    });
    mapRects.push({ x: cx, z: (z0 + z1) / 2, w, d, color, label: info.label.split(" ")[0] });
  };
  shopAt("clothes", 30, false, 16, 14, "#fbcfe8");
  shopAt("accessories", 50, false, 16, 14, "#ddd6fe");
  shopAt("special", 70, false, 16, 14, "#fde68a");
  shopAt("general", 90, false, 16, 14, "#bbf7d0");
  shopAt("furniture", 30, true, 16, 14, "#fed7aa");
  shopAt("pets", 50, true, 16, 14, "#a5f3fc");
  shopAt("homes", 70, true, 16, 14, "#e2e8f0");
  shopAt("cars", 100, true, 26, 22, "#e5e7eb");
  I({ id: "garage", x: 114.5, y: 0, z: 24, r: 2.5, label: "Your garage", kind: "garage" });
  const gs = signPlane("Garage", 3, 0.9, "#1e293b");
  gs.position.set(113.2, 3, 24);
  gs.rotation.y = Math.PI / 2;
  shopsG.add(gs);
  animated.push((t) => shopsG.children.forEach((c) => c.userData.spin && (c.rotation.y = t * 0.5)));

  // ---------------------------------------------------------------- the park and fun zones (west)
  const park = district("Park", -80, 0, 60);
  {
    mapRects.push({ x: -80, z: 0, w: 100, d: 60, color: "#86efac", label: "Park" });
    const pth = (x: number, z: number, w: number, d: number) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ color: "#e7d7b5" }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.025, z);
      m.receiveShadow = true;
      park.add(m);
    };
    pth(-80, -6, 100, 3);
    pth(-62, 8, 3, 40);
    pth(-95, 8, 3, 40);
    // Pond with a fishing pier.
    const pond = new THREE.Mesh(new THREE.CircleGeometry(9, 32), toon("#38bdf8", { transparent: 0.85 }));
    pond.rotation.x = -Math.PI / 2;
    pond.position.set(-75, 0.05, -20);
    park.add(pond);
    ph.post({ x: -75, z: -20, r: 8.6, minY: 0, maxY: 0.9 });
    mapRects.push({ x: -75, z: -20, w: 16, d: 16, color: "#38bdf8" });
    const pier = new Blocks(ph);
    pier.span("#a16207", -76, 0.3, -12.5, -74, 0.45, -10.5);
    pier.finish(park);
    I({ id: "fish", x: -75, y: 0, z: -10.5, r: 2, label: "Go fishing", kind: "fishing" });
    npcs.push({ id: "npc-ranger", name: "Abel", role: "Park ranger", seed: 41, x: -71, y: 0, z: -9, ry: Math.PI, lines: ["Cast, wait for the float to dip, then pull right away.", "The big ones bite in the evening."], actions: [] });
    // Trees (instanced would be cheaper; these are shared materials and a few hundred meshes).
    for (let i = 0; i < 60; i++) {
      const x = -128 + (i % 12) * 9 + Math.sin(i * 3.7) * 2.5, z = -34 + Math.floor(i / 12) * 15 + Math.cos(i * 1.9) * 3;
      if (Math.hypot(x + 75, z + 20) < 11 || (x > -128 && x < -97 && z > -33 && z < -12) || (Math.abs(x + 80) < 52 && Math.abs(z + 6) < 3) || (x > -84 && x < -30 && z > 12 && z < 32) || (x < -97 && z > 12)) continue;
      const tr = tree(i);
      tr.position.set(x, 0, z);
      tr.rotation.y = i;
      park.add(tr);
      ph.post({ x, z, r: 0.35, minY: 0, maxY: 3 });
    }
    for (let i = 0; i < 6; i++) {
      const x = -50 - i * 8, z = -3.5;
      const bn = prop("bench", "#a16207", "");
      bn.position.set(x, 0, z);
      bn.rotation.y = Math.PI;
      park.add(bn);
      ph.post({ x, z, r: 0.6, minY: 0, maxY: 0.5 });
      I({ id: `bench-k${i}`, x, y: 0, z: z - 1, r: 1.4, label: "Sit on the bench", kind: "sit", data: { x, y: 0, z: z - 0.1, ry: Math.PI } });
      const f = prop("flowers", ["#f472b6", "#f97316", "#a855f7"][i % 3]!, "");
      f.position.set(x + 4, 0, -9);
      park.add(f);
    }
    // Playground: a slide and swings.
    const pg = new Blocks(ph);
    pg.span("#f97316", -50, 0, -27, -49.6, 2.6, -26.6);
    pg.span("#f97316", -48.4, 0, -27, -48, 2.6, -26.6);
    pg.span("#fde047", -50, 2.4, -27.4, -48, 2.6, -25.6, false);
    pg.finish(park);
    const slide = mesh(unitBox(), toon("#ef4444"), -49, 1.3, -23.6, 1.2, 0.1, 4.6);
    slide.rotation.x = -0.55;
    park.add(slide);
    I({ id: "slide", x: -49, y: 0, z: -28.2, r: 1.6, label: "Go down the slide", kind: "slide", data: { x: -49, z: -21 } });
    for (let i = 0; i < 2; i++) {
      const sx = -40 + i * 2.2;
      const frame = new Blocks(ph);
      frame.span("#2563eb", sx - 1, 0, -27, sx - 0.9, 2.8, -26.9);
      frame.span("#2563eb", sx + 0.9, 0, -27, sx + 1, 2.8, -26.9);
      frame.span("#2563eb", sx - 1, 2.8, -27, sx + 1, 2.9, -26.9, false);
      frame.finish(park);
      const seat = mesh(unitBox(), toon("#111827"), sx, 0.6, -26.95, 0.7, 0.06, 0.4);
      seat.userData.swing = i;
      park.add(seat);
      I({ id: `swing${i}`, x: sx, y: 0, z: -25.8, r: 1.1, label: "Swing", kind: "sit", data: { x: sx, y: 0.1, z: -26.95, ry: 0, swing: true } });
    }
    // Gazebo.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = -100 + Math.cos(a) * 3.5, pz = 20 + Math.sin(a) * 3.5;
      park.add(mesh(cyl(8), toon("#f8fafc"), px, 1.5, pz, 0.3, 3, 0.3));
      ph.post({ x: px, z: pz, r: 0.18, minY: 0, maxY: 3 });
    }
    park.add(mesh(cone(6), toon("#7c2d12"), -100, 3.8, 20, 9, 1.8, 9));
    // Dance floor with a stage.
    const tiles: THREE.Mesh[] = [];
    for (let i = 0; i < 36; i++) {
      const t = mesh(unitBox(), toon("#a855f7", { emissive: "#581c87" }), -48 + (i % 6) * 1.6, 0.05, 18 + Math.floor(i / 6) * 1.6, 1.5, 0.08, 1.5);
      (t.material as THREE.Material) = (t.material as THREE.Material).clone();
      park.add(t);
      tiles.push(t);
    }
    animated.push((t) => tiles.forEach((m, i) => ((m.material as THREE.MeshToonMaterial).emissive?.setHSL(((t * 0.3 + i * 0.07) % 1), 0.8, 0.25 + 0.15 * Math.sin(t * 4 + i)))));
    const stage = prop("stage", "#1e293b", "");
    stage.position.set(-44, 0, 30);
    park.add(stage);
    ph.sized(-44, 0.4, 30, 6, 0.8, 4);
    I({ id: "dance", x: -44, y: 0, z: 22, r: 4, label: "Dance", kind: "dance" });
    npcs.push({ id: "npc-dj", name: "DJ Nati", role: "Dance floor", seed: 51, x: -44, y: 0.8, z: 30.5, ry: Math.PI, lines: ["Step on the floor and show your moves!"], actions: [{ label: "Dance with me", act: "dance" }] });
    // Archery range: three lanes of targets west of the line.
    const ar = new Blocks(ph);
    ar.span("#a16207", -101, 0, -32, -100.6, 1, -14);
    ar.finish(park);
    const targets: THREE.Group[] = [];
    [-110, -118, -126].forEach((x, i) => {
      const tg = new THREE.Group();
      const z = -28 + i * 5;
      tg.position.set(x, 0, z);
      for (let r = 0; r < 5; r++) {
        const ring = mesh(cyl(24), toon(["#f8fafc", "#111827", "#3b82f6", "#ef4444", "#facc15"][r]!), 0, 1.6, 0.05 * r, 1.6 - r * 0.32, 0.06, 1.6 - r * 0.32);
        ring.rotation.x = Math.PI / 2;
        tg.add(ring);
      }
      tg.rotation.y = Math.PI / 2;
      tg.userData.archery = true;
      tg.add(mesh(unitBox(), toon("#78350f"), 0, 0.6, -0.1, 0.12, 1.2, 0.12));
      park.add(tg);
      targets.push(tg);
      ph.sized(x, 1.6, z, 0.4, 1.8, 1.8);
    });
    I({ id: "archery", x: -99.5, y: 0, z: -23, r: 2.5, label: "Shoot at the archery range", kind: "archery" });
    npcs.push({ id: "npc-archer", name: "Hiwot", role: "Archery coach", seed: 61, x: -99, y: 0, z: -33, ry: -Math.PI / 2, lines: ["Hold to draw, aim with the mouse, let go to shoot. The bull's-eye scores ten.", "Targets move at the harder levels."], actions: [{ label: "Start a round", act: "archery" }] });
    mapRects.push({ x: -114, z: -23, w: 28, d: 18, color: "#fcd34d", label: "Archery" });
    // Target gallery.
    const gb = new Blocks(ph);
    gb.span("#dc2626", -116, 0, 20, -104, 1.1, 21);
    gb.span("#fef2f2", -116, 3.2, 14, -104, 3.4, 21, false);
    gb.finish(park);
    I({ id: "gallery", x: -110, y: 0, z: 22.5, r: 2.5, label: "Play the target gallery", kind: "gallery" });
    mapRects.push({ x: -110, z: 17, w: 12, d: 8, color: "#fca5a5", label: "Gallery" });
    // Hoops.
    const hp = new Blocks(ph);
    hp.span("#64748b", -75.15, 0, 33.8, -74.85, 3.4, 34.1);
    hp.span("#f8fafc", -76, 3, 33.6, -74, 4.2, 33.8);
    hp.finish(park);
    const rim = mesh(new THREE.TorusGeometry(0.3, 0.03, 6, 16), toon("#f97316"), -75, 3.1, 33.2);
    rim.rotation.x = Math.PI / 2;
    park.add(rim);
    const court = mesh(unitBox(), toon("#c2410c"), -75, 0.03, 28, 10, 0.03, 14);
    park.add(court);
    I({ id: "hoops", x: -75, y: 0, z: 27, r: 2, label: "Shoot hoops", kind: "hoops" });
    mapRects.push({ x: -75, z: 28, w: 10, d: 14, color: "#fb923c", label: "Hoops" });
  }

  // Parkour: platforms rising to a flag (west of the homes).
  const pk = district("Parkour", -114, 55, 28);
  const parkour = { start: { x: -114, z: 38 }, finish: { x: -114, y: 0, z: 74 } };
  {
    const b = new Blocks(ph);
    const steps: [number, number, number, number, number][] = [
      [-114, 41, 0.5, 2.5, 2.5], [-111, 44, 1.0, 2, 2], [-108, 47.5, 1.5, 2, 2], [-111, 51, 2.0, 1.6, 1.6], [-114, 54, 2.5, 1.6, 1.6],
      [-117.5, 56.5, 3.0, 1.6, 1.6], [-120, 60, 3.5, 1.4, 1.4], [-117, 63, 4.0, 1.4, 1.4], [-114, 65.5, 4.5, 1.4, 1.4], [-111, 68.5, 5.0, 1.6, 1.6], [-114, 72, 5.5, 3, 3],
    ];
    steps.forEach(([x, z, h, w, d], i) => b.span(["#f97316", "#22c55e", "#3b82f6", "#a855f7", "#ec4899"][i % 5]!, x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2));
    b.finish(pk);
    parkour.finish = { x: -114, y: 5.5, z: 72 };
    pk.add(mesh(cyl(6), toon("#e5e7eb"), -114, 6.8, 72, 0.08, 2.6, 0.08));
    pk.add(mesh(unitBox(), toon("#ef4444"), -113.5, 7.6, 72, 1, 0.6, 0.05));
    I({ id: "parkour", x: -114, y: 0, z: 37.5, r: 2.2, label: "Start the parkour run", kind: "parkour" });
    mapRects.push({ x: -114, z: 56, w: 16, d: 36, color: "#c4b5fd", label: "Parkour" });
  }

  // Race: a lap of the ring road through four corners.
  const race = { start: { x: 0, z: -RING }, checkpoints: [[RING, -RING], [RING, RING], [-RING, RING], [-RING, -RING], [0, -RING]] as [number, number][] };
  {
    const g = district("Ring road", 0, -RING, 20);
    for (const x of [-6, 6]) g.add(mesh(unitBox(), toon("#111827"), x, 3, -RING, 0.4, 6, 0.4));
    const banner = signPlane("START / FINISH", 12, 1.4, "#111827", "#facc15");
    banner.position.set(0, 5.6, -RING);
    g.add(banner);
    const back = banner.clone();
    back.rotation.y = Math.PI;
    g.add(back);
    I({ id: "race", x: 0, y: 0, z: -RING + 6, r: 4, label: "Start a race lap", kind: "race" });
  }


  // ---------------------------------------------------------------- the stadium (east, past the ring road)
  const stadium = district("Stadium", 185, 60, 45);
  const scoreboard = { draw: (_teal: number, _gold: number) => {} };
  {
    const { x0, x1, z0, z1, cz, goalW, goalH, depth } = PITCH;
    const turf = canvasTex("turf", 256, 256, (g) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? "#3f9d4a" : "#47ad53";
        g.fillRect(i * 32, 0, 32, 256);
      }
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 + 6, z1 - z0 + 6), new THREE.MeshLambertMaterial({ map: turf }));
    field.rotation.x = -Math.PI / 2;
    field.position.set((x0 + x1) / 2, 0.03, cz);
    field.receiveShadow = true;
    stadium.add(field);
    // White lines: the edges, halfway line, centre circle, boxes.
    const line = (x: number, z: number, w: number, d: number) => stadium.add(mesh(unitBox(), toon("#f8fafc"), x, 0.045, z, w, 0.01, d));
    line((x0 + x1) / 2, z0 + 0.1, x1 - x0, 0.15);
    line((x0 + x1) / 2, z1 - 0.1, x1 - x0, 0.15);
    line(x0 + 0.1, cz, 0.15, z1 - z0);
    line(x1 - 0.1, cz, 0.15, z1 - z0);
    line((x0 + x1) / 2, cz, 0.15, z1 - z0);
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 4.6, 48), toon("#f8fafc"));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set((x0 + x1) / 2, 0.05, cz);
    stadium.add(ring);
    for (const [x, sgn] of [[x0, 1], [x1, -1]] as const) {
      line(x + sgn * 8, cz, 0.15, 16);
      line(x + sgn * 4, cz - 8, 8, 0.15);
      line(x + sgn * 4, cz + 8, 8, 0.15);
      stadium.add(mesh(cyl(12), toon("#f8fafc"), x + sgn * 11, 0.05, cz, 0.3, 0.01, 0.3));
    }
    const b = new Blocks(ph);
    // Boards (with gaps by the corners to walk in), goals (posts, bar and nets), stands, floodlights.
    b.span("#1d4ed8", x0 - 0.2, 0, z0 - 0.2, x0 + 14, 1, z0, true);
    b.span("#1d4ed8", x0 + 17, 0, z0 - 0.2, x1 + 0.2, 1, z0, true);
    b.span("#1d4ed8", x0 - 0.2, 0, z1, x1 + 0.2, 1, z1 + 0.2, true);
    for (const x of [x0, x1]) {
      const side = x === x0 ? -1 : 1;
      b.span("#1d4ed8", x - (side < 0 ? 0.2 : 0), 0, z0, x + (side > 0 ? 0.2 : 0), 1, cz - goalW / 2, true);
      b.span("#1d4ed8", x - (side < 0 ? 0.2 : 0), 0, cz + goalW / 2, x + (side > 0 ? 0.2 : 0), 1, z1, true);
      for (const z of [cz - goalW / 2, cz + goalW / 2]) b.span("#f8fafc", x - 0.06, 0, z - 0.06, x + 0.06, goalH, z + 0.06, true);
      b.span("#f8fafc", x - 0.06, goalH - 0.06, cz - goalW / 2, x + 0.06, goalH + 0.06, cz + goalW / 2, false);
      b.span("#e2e8f0|0.35", x + side * depth - 0.04, 0, cz - goalW / 2, x + side * depth + 0.04, goalH, cz + goalW / 2, true);
      for (const z of [cz - goalW / 2, cz + goalW / 2]) b.span("#e2e8f0|0.35", Math.min(x, x + side * depth), 0, z - 0.04, Math.max(x, x + side * depth), goalH, z + 0.04, true);
      b.span("#e2e8f0|0.35", Math.min(x, x + side * depth), goalH, cz - goalW / 2, Math.max(x, x + side * depth), goalH + 0.05, cz + goalW / 2, false);
    }
    for (let r = 0; r < 6; r++) b.span(["#334155", "#475569"][r % 2]!, x0 - 2, 0, z1 + 2 + r * 1.1, x1 + 2, 0.4 + r * 0.4, z1 + 3.1 + r * 1.1, true);
    for (const [x, z] of [[x0 - 4, z0 - 4], [x1 + 4, z0 - 4], [x0 - 4, z1 + 9], [x1 + 4, z1 + 9]] as const) {
      b.span("#64748b", x - 0.25, 0, z - 0.25, x + 0.25, 16, z + 0.25, true);
      stadium.add(mesh(unitBox(), toon("#fef9c3", { emissive: "#fde047" }), x, 16.4, z, 2.4, 0.8, 0.5));
    }
    b.finish(stadium);
    // The scoreboard, drawn again when a goal goes in.
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 192;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.75), new THREE.MeshBasicMaterial({ map: tex }));
    board.position.set((x0 + x1) / 2, 11, z1 + 11);
    board.rotation.y = Math.PI;
    stadium.add(board);
    stadium.add(mesh(unitBox(), toon("#1f2937"), (x0 + x1) / 2, 5.5, z1 + 11.2, 0.6, 11, 0.4));
    scoreboard.draw = (teal, gold) => {
      const g = c.getContext("2d")!;
      g.fillStyle = "#0f172a";
      g.fillRect(0, 0, 512, 192);
      g.textAlign = "center";
      g.font = "bold 40px system-ui";
      g.fillStyle = "#2dd4bf";
      g.fillText("TEAL", 128, 56);
      g.fillStyle = "#facc15";
      g.fillText("GOLD", 384, 56);
      g.font = "bold 110px system-ui";
      g.fillStyle = "#ffffff";
      g.fillText(String(teal), 128, 170);
      g.fillText(String(gold), 384, 170);
      g.fillText(":", 256, 160);
      tex.needsUpdate = true;
    };
    scoreboard.draw(0, 0);
    const signS = signPlane("Seed Stadium", 10, 1.6, "#0f172a", "#2dd4bf");
    signS.position.set((x0 + x1) / 2, 3, z0 - 3);
    stadium.add(signS);
    I({ id: "penalty", x: x0 + 13, y: 0, z: cz, r: 2, label: "Take penalties", kind: "penalty" });
    I({ id: "score-reset", x: (x0 + x1) / 2, y: 0, z: z1 - 1.5, r: 2.2, label: "Start a new match (score to 0:0)", kind: "match" });
    npcs.push({ id: "npc-coach", name: "Coach Tesfaye", role: "Football", seed: 91, x: x0 + 15, y: 0, z: z0 + 1.6, ry: 0, lines: ["Walk into the ball to dribble; E kicks it, hold Shift for a hard shot.", "Teal defends the west goal, Gold the east. First to five?"], actions: [{ label: "Penalty challenge", act: "penalty" }] });
    mapRects.push({ x: (x0 + x1) / 2, z: cz, w: x1 - x0, d: z1 - z0, color: "#4ade80", label: "Stadium" });
  }

  // ---------------------------------------------------------------- Seed Circuit: a kart track with barriers
  const circuitG = district("Circuit", 190, -55, 50);
  const circuit = { start: { x: 0, z: 0, heading: 0 }, checkpoints: [] as [number, number][] };
  {
    const pts = [[158, -50], [162, -32], [180, -24], [200, -30], [214, -22], [228, -34], [226, -58], [214, -78], [196, -84], [182, -72], [170, -82], [158, -72]].map(([x, z]) => new THREE.Vector3(x!, 0, z!));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    const N = 260, W = 11;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const edgeL: THREE.Vector3[] = [], edgeR: THREE.Vector3[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = curve.getPointAt(t % 1), tan = curve.getTangentAt(t % 1);
      const side = new THREE.Vector3().crossVectors(tan, up).normalize();
      const l = p.clone().addScaledVector(side, W / 2), r = p.clone().addScaledVector(side, -W / 2);
      pos.push(l.x, 0.04, l.z, r.x, 0.04, r.z);
      uv.push(0, t * 40, 1, t * 40);
      if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
      edgeL.push(p.clone().addScaledVector(side, W / 2 + 0.7));
      edgeR.push(p.clone().addScaledVector(side, -W / 2 - 0.7));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const asphalt = roadTex().clone();
    asphalt.needsUpdate = true;
    asphalt.wrapS = asphalt.wrapT = THREE.RepeatWrapping;
    const track = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: asphalt, side: THREE.DoubleSide }));
    track.receiveShadow = true;
    circuitG.add(track);
    // Barriers: red and white blocks along both edges (solid), open where the road from the ring road comes in.
    const start = curve.getPointAt(0), startTan = curve.getTangentAt(0);
    circuit.start = { x: start.x, z: start.z, heading: Math.atan2(startTan.x, startTan.z) };
    const blocks = new THREE.InstancedMesh(unitBox(), toon("#ffffff"), edgeL.length * 2);
    const col = new THREE.Color();
    let n = 0;
    const m4 = new THREE.Matrix4();
    for (const edge of [edgeL, edgeR]) {
      edge.forEach((p, i) => {
        if (edge === edgeL && i > N - 6 && i <= N) return;
        if (edge === edgeL && i < 4) return;
        const q = edge[(i + 1) % edge.length]!;
        const ang = Math.atan2(q.x - p.x, q.z - p.z);
        m4.compose(new THREE.Vector3(p.x, 0.45, p.z), new THREE.Quaternion().setFromAxisAngle(up, ang), new THREE.Vector3(0.5, 0.9, p.distanceTo(q) + 0.05));
        blocks.setMatrixAt(n, m4);
        blocks.setColorAt(n, col.set(i % 2 ? "#ef4444" : "#f8fafc"));
        n++;
        ph.post({ x: p.x, z: p.z, r: 0.55, minY: 0, maxY: 0.9 });
      });
    }
    blocks.count = n;
    blocks.instanceMatrix.needsUpdate = true;
    if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
    blocks.castShadow = true;
    circuitG.add(blocks);
    for (let k = 0; k < 8; k++) {
      const p = curve.getPointAt(k / 8);
      circuit.checkpoints.push([p.x, p.z]);
    }
    // Start gantry and grandstand.
    const side = new THREE.Vector3().crossVectors(startTan, up).normalize();
    for (const sgn of [-1, 1]) {
      const g = start.clone().addScaledVector(side, sgn * (W / 2 + 1.6));
      circuitG.add(mesh(unitBox(), toon("#111827"), g.x, 3, g.z, 0.4, 6, 0.4));
      ph.post({ x: g.x, z: g.z, r: 0.3, minY: 0, maxY: 6 });
    }
    const gantry = signPlane("SEED CIRCUIT", W + 3, 1.4, "#111827", "#facc15");
    gantry.position.set(start.x, 5.8, start.z);
    gantry.rotation.y = Math.atan2(startTan.x, startTan.z);
    circuitG.add(gantry);
    const back = gantry.clone();
    back.rotation.y += Math.PI;
    circuitG.add(back);
    const pit = start.clone().addScaledVector(side, W / 2 + 4);
    I({ id: "circuit", x: pit.x, y: 0, z: pit.z, r: 3, label: "Race three laps of Seed Circuit", kind: "circuit" });
    mapRects.push({ x: 192, z: -54, w: 72, d: 64, color: "#9ca3af", label: "Circuit" });
  }

  // ---------------------------------------------------------------- Seed Strike arena (the entrance; the maps are far out)
  {
    const ar = district("Arena", 300, 230, 30);
    const shell = new THREE.Mesh(new THREE.BoxGeometry(40, 14, 28), surface("factory", { tint: "#ffffff" }));
    shell.position.set(300, 7, 240);
    shell.castShadow = true;
    ar.add(shell);
    ph.sized(300, 7, 240, 40, 14, 28, "bldg");
    const sign = signPlane("SEED STRIKE ARENA", 18, 2.4, "#0b0f14", "#f5c518");
    sign.position.set(300, 11, 225.9);
    sign.rotation.y = Math.PI;
    ar.add(sign);
    const doorway = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), glassMat("#30404c", 0.55, 0.05));
    doorway.position.set(300, 2, 225.9);
    ar.add(doorway);
    I({ id: "strike", x: 300, y: 0, z: 222, r: 4, label: "Seed Strike: play a match", kind: "strike" });
    mapRects.push({ x: 300, z: 240, w: 40, d: 28, color: "#3b4148", label: "Arena" });
  }

  // ---------------------------------------------------------------- the archery field (south-west, past the ring road)
  I({ id: "archery-field", x: -228, y: 0, z: 3, r: 3, label: "Archery: choose a mode and a bow", kind: "archery" });
  mapRects.push({ x: -275, z: 0, w: 100, d: 40, color: "#9bc27f", label: "Archery" });

  // ---------------------------------------------------------------- the Grand Prix circuit (east, past the ring road)
  const gpG = district("Grand Prix", 345, -258, 175);
  const gpBuilt = buildGrandPrix(ph, input.detail ?? 1);
  gpG.add(gpBuilt.group);
  mapRects.push({ x: 345, z: -258, w: 260, d: 250, color: "#7f8a94", label: "Grand Prix" });
  {
    const g = gpBuilt.track.grid[0]!;
    I({ id: "gp", x: 214, y: 0, z: -127, r: 4, label: "Grand Prix: race, qualify or practise", kind: "gp" });
    npcs.push({ id: "npc-gp-director", name: "Race Director", role: "Seed Grand Prix", seed: 95, x: 216, y: 0, z: -129, ry: -Math.PI / 2, lines: ["Welcome to the Seed Grand Prix. Pick a session and I will put your car on the grid.", "Track limits are strict here: three warnings cost five seconds."], actions: [{ label: "Choose a session", act: "gp" }] });
    void g;
  }

  // ---------------------------------------------------------------- homes (south)
  const homesG = district("Homes", 0, 75, 95);
  const lots = new Map<string, { cx: number; cz: number }>();
  input.residents.slice(0, 60).forEach((r, i) => {
    const col = i % 10, row = Math.floor(i / 10);
    const cx = (col < 5 ? -1 : 1) * (14 + (col % 5) * 17), cz = 38 + row * 16;
    lots.set(r.id, { cx, cz });
    homeDoors.set(r.id, { x: cx, y: 0, z: cz - 5.2, ry: 0 });
  });
  mapRects.push({ x: 0, z: 78, w: 180, d: 96, color: "#fef3c7", label: "Homes" });

  // ---------------------------------------------------------------- Admin's own additions
  const extra = district("Extras", 0, 0, 400);
  for (const p of input.props) {
    if (p.kind === "npc") {
      npcs.push({ id: `npc-${p.id}`, name: p.name || "Visitor", role: p.text || "", seed: p.id.length * 7 + p.x, x: p.x, y: 0, z: p.z, ry: (p.r * Math.PI) / 180, lines: p.lines.length ? p.lines : ["Hello!"], actions: [] });
      continue;
    }
    // Uploaded models load on their own (they are files); see placeModels.
    if (p.kind === "spawn" || p.kind === "model") continue;
    const m = prop(p.kind, p.color, p.text);
    m.position.set(p.x, 0, p.z);
    m.rotation.y = (p.r * Math.PI) / 180;
    m.scale.setScalar(p.s);
    extra.add(m);
    if (p.kind === "billboard" && p.text) {
      const s = signPlane(p.text, 6 * p.s, 2 * p.s, p.color);
      s.position.set(p.x, 3 * p.s, p.z);
      s.rotation.y = (p.r * Math.PI) / 180;
      extra.add(s);
      extra.add(mesh(unitBox(), toon("#334155"), p.x, 1 * p.s, p.z - 0.1, 0.3, 2 * p.s, 0.3));
    }
    const solid: Record<string, number> = { tree: 0.4, lamp: 0.2, fountain: 2.6, statue: 0.8, kiosk: 1.3, rock: 0.8, tent: 1.4, stage: 3, arch: 0, car: 1.2, billboard: 0.3, chest: 0.5 };
    if (solid[p.kind]) ph.post({ x: p.x, z: p.z, r: solid[p.kind]! * p.s, minY: 0, maxY: 2 * p.s });
    if (p.kind === "bench") I({ id: `bench-x${p.id}`, x: p.x, y: 0, z: p.z, r: 1.4, label: "Sit on the bench", kind: "sit", data: { x: p.x, y: 0, z: p.z, ry: (p.r * Math.PI) / 180 } });
    if (p.kind === "chest") I({ id: `chest-x${p.id}`, x: p.x, y: 0, z: p.z, r: 1.8, label: "Open the chest", kind: "treasure" });
  }
  const spawnProp = input.props.find((p) => p.kind === "spawn");

  // ---------------------------------------------------------------- town folk walking about
  const walkers: [number, number][][] = [
    [[-20, 10], [20, 10], [20, -10], [-20, -10]],
    [[-30, -6], [-120, -6], [-120, -5], [-30, -5]],
    [[8, 30], [8, 120], [9, 120], [9, 30]],
    [[30, 8], [110, 8], [110, 9], [30, 9]],
    [[-62, 0], [-62, 26], [-95, 26], [-95, 0]],
    [[-8, -30], [-8, -40], [8, -40], [8, -30]],
  ];
  walkers.forEach((path, i) => npcs.push({ id: `npc-walk${i}`, name: ["Saba", "Yonas", "Meron", "Kebede", "Tsion", "Ben"][i]!, role: "Visitor", seed: 70 + i, x: path[0]![0], y: 0, z: path[0]![1], ry: 0, lines: [["Lovely day for a walk!", "Have you tried the archery range? I hit a bull's-eye once."], ["The pond has the best fish in town.", "I heard the car dealer has a new sports car."], ["My house has a piano now. Come visit!", "The homes south of the plaza are cosy."], ["Shopping day! Threads has new outfits.", "Coins from work go a long way here."], ["The parkour course is harder than it looks.", "Have you seen the dance floor at night?"], ["Off to the office. Busy day!", "The café upstairs, I mean behind reception, has great coffee."]][i]!, actions: [], path }));

  // Gems in the plaza and the park; one treasure chest a day in a hidden spot.
  const gemSpots: [number, number][] = [];
  for (let i = 0; i < 18; i++) {
    const a = i * 2.39996, r = 6 + (i * 7.7) % 30;
    gemSpots.push(i < 12 ? [Math.cos(a) * r, Math.sin(a) * r] : [-40 - (i - 12) * 12, 4 + ((i * 13) % 20)]);
  }
  const treasureSpots: [number, number, number][] = [[-114, 5.5, 72.6], [28, 0, -84], [-30, 0, 120], [125, 0, -125], [-100, 0, 24], [60, 0, 34], [-128, 0, -34], [0, 13.5, -62]];

  // Static scenery merged by material (far fewer draw calls); homes are rebuilt as people change them, so not here.
  for (const d of districts) if (d.name !== "Homes" && d.name !== "Extras") optimizeStatic(d.group);

  return {
    root,
    interacts,
    npcs,
    mapRects,
    desks,
    homeDoors,
    lots,
    districts,
    levels,
    roof,
    homesGroup: homesG,
    elevator,
    parkour,
    race,
    circuit,
    scoreboard,
    gemSpots,
    treasureSpots,
    spawn: spawnProp ? { x: spawnProp.x, z: spawnProp.z } : { x: 0, z: 12 },
    lampSpots: streets.lampSpots,
    gp: gpBuilt.track,
    trafficLights: streets.lights,
    update: (t: number, dt: number) => animated.forEach((f) => f(t, dt)),
  };
}

// ------------------------------------------------------------------------------------------------- homes

const HOUSE_STYLE: Record<string, { wall: string; roof: string; h: number }> = {
  cottage: { wall: "#fef3c7", roof: "#b91c1c", h: 3.2 },
  loft: { wall: "#cbd5e1", roof: "#334155", h: 3.8 },
  modern: { wall: "#f8fafc", roof: "#1f2937", h: 3.4 },
  villa: { wall: "#fde68a", roof: "#9a3412", h: 3.6 },
  castle: { wall: "#a8a29e", roof: "#1e3a8a", h: 4.2 },
};

// A home on its lot: walls with a door facing the street, a roof in its style, the floor and wall colours the owner
// chose, and their furniture where they put it (solid; chairs, sofas and beds can be sat on). The door stays shut
// for people the owner did not let in.
export function buildHome(ph: Physics, ownerId: string, ownerName: string, lot: { cx: number; cz: number }, h: HomeLayout, items: Item[], canEnter: boolean, mine: boolean) {
  const house = items.find((i) => i.key === h.house) ?? items.find((i) => i.key === "house.cottage");
  return buildHouse(ph, ownerId, ownerName, lot, h, items, canEnter, mine, house?.model ?? "cottage", (house?.room as [number, number] | undefined) ?? [16, 12]);
}

// The earlier block homes (kept for the editor's simple preview).
export function buildBlockHome(ph: Physics, ownerId: string, ownerName: string, lot: { cx: number; cz: number }, h: HomeLayout, items: Item[], canEnter: boolean, mine: boolean) {
  const tag = `home:${ownerId}`;
  ph.remove(tag);
  const g = new THREE.Group();
  g.name = tag;
  const house = items.find((i) => i.key === h.house) ?? items.find((i) => i.key === "house.cottage");
  const [rw, rd] = house?.room ?? [16, 12];
  const W = rw * 0.5, D = rd * 0.5;
  const style = HOUSE_STYLE[house?.model ?? "cottage"] ?? HOUSE_STYLE.cottage!;
  const cx = lot.cx, cz = lot.cz + 1;
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const b = new Blocks(ph);
  const wallC = h.wall || style.wall;
  wall(b, wallC, "x", z0, x0, x1, 0, style.h, 0.25, [[cx - 0.8, cx + 0.8, 2.4]], tag);
  wall(b, wallC, "x", z1, x0, x1, 0, style.h, 0.25, [], tag);
  wall(b, wallC, "z", x0, z0, z1, 0, style.h, 0.25, [], tag);
  wall(b, wallC, "z", x1, z0, z1, 0, style.h, 0.25, [], tag);
  b.span("veh", cx - 1, 0, z0 - 0.3, cx + 1, 2, z0 + 0.3, true, tag);
  if (!canEnter) b.span("#7c2d12", cx - 0.8, 0, z0 - 0.06, cx + 0.8, 2.4, z0 + 0.06, true, tag);
  // Windows.
  for (const x of [x0 + W * 0.22, x1 - W * 0.22]) b.span("#7dd3fc", x - 0.7, 1.2, z0 - 0.14, x + 0.7, 2.2, z0 - 0.1, false);
  // Roof by style.
  const model = house?.model ?? "cottage";
  if (model === "cottage" || model === "villa") {
    const r = mesh(cone(4), toon(style.roof), cx, style.h + 1.1, cz, Math.max(W, D) * 1.5, 2.2, Math.max(W, D) * 1.5 * (D / W));
    r.rotation.y = Math.PI / 4;
    r.castShadow = true;
    g.add(r);
  } else b.span(style.roof, x0 - 0.4, style.h, z0 - 0.4, x1 + 0.4, style.h + 0.35, z1 + 0.4, true, tag);
  if (model === "villa") {
    for (const x of [x0 + 0.6, x1 - 0.6]) b.span("#f8fafc", x - 0.2, 0, z0 - 1.6, x + 0.2, style.h, z0 - 1.2, true, tag);
    b.span("#f8fafc", x0, style.h - 0.3, z0 - 1.8, x1, style.h, z0 - 0.1, false);
    const pool = mesh(unitBox(), toon("#38bdf8", { transparent: 0.8 }), cx + W / 2 - 1.2, 0.05, z1 + 1.4, 2.4, 0.06, 1.8);
    g.add(pool);
  }
  if (model === "castle")
    for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
      b.span(style.wall, x! - 0.8, 0, z! - 0.8, x! + 0.8, style.h + 1.6, z! + 0.8, true, tag);
      g.add(mesh(cone(8), toon(style.roof), x!, style.h + 2.6, z!, 2, 2, 2));
    }
  if (model === "modern") b.span("#7dd3fc|0.5", x0 + 0.2, 0.2, z1 + 0.05, x1 - 0.2, style.h - 0.2, z1 + 0.15, false);
  if (model === "loft") b.span("#334155", cx - 1.2, style.h, cz - 1, cx + 1.2, style.h + 1.2, cz + 1, true, tag);
  // Floor and furniture.
  const floor = mesh(unitBox(), new THREE.MeshLambertMaterial({ map: floorTex(h.floor || "#d6a77a") }), cx, 0.04, cz, W - 0.25, 0.05, D - 0.25);
  floor.receiveShadow = true;
  g.add(floor);
  const seats: Interact[] = [];
  for (const p of h.items) {
    const it = items.find((i) => i.key === p.key);
    if (!it) continue;
    const [sw, sd] = it.size ?? [2, 2];
    const [fw, fd] = p.r % 2 ? [sd, sw] : [sw, sd];
    const px = x0 + (p.x + fw / 2) * 0.5, pz = z0 + (p.z + fd / 2) * 0.5;
    const m = furniture(it.model ?? "", it.color ?? "#a16207", sw * 0.5, sd * 0.5);
    m.position.set(px, 0.05, pz);
    m.rotation.y = p.r * (Math.PI / 2);
    g.add(m);
    const tall: Record<string, number> = { rug: 0, lamp: 1.7, plant: 1, tree: 2.2, shelf: 2, tv: 1.5, painting: 0, aquarium: 1.3, fireplace: 1.4, arcade: 1.8, bed: 0.6, chair: 0.5, sofa: 0.5, armchair: 0.5, throne: 0.6, piano: 1.2, table: 0.78, desk: 0.78 };
    const ht = tall[it.model ?? ""] ?? 0.8;
    if (ht > 0) ph.sized(px, ht / 2, pz, fw * 0.5 * 0.9, ht, fd * 0.5 * 0.9, tag);
    if (it.seat || it.model === "bed") {
      const fwd = p.r * (Math.PI / 2);
      seats.push({ id: `seat-${ownerId}-${p.x}-${p.z}`, x: px + Math.sin(fwd) * 0.9, y: 0, z: pz + Math.cos(fwd) * 0.9, r: 1.3, label: it.model === "bed" ? "Lie down" : it.model === "piano" ? "Play the piano" : "Sit down", kind: "sit", data: { x: px + Math.sin(fwd) * 0.2, y: 0.05, z: pz + Math.cos(fwd) * 0.2, ry: fwd } });
    }
  }
  b.finish(g);
  // The name over the door, and a mailbox (visit / decorate).
  const n = textSprite([mine ? "Your home" : `${ownerName.split(" ")[0]}'s home`, canEnter ? "" : "Private"], { width: 2.8 });
  n.position.set(cx, style.h + (model === "cottage" || model === "villa" ? 2.8 : 1.4), z0 - 0.4);
  g.add(n);
  const box = mesh(unitBox(), toon(mine ? "#16a34a" : "#2563eb"), cx + 1.6, 0.6, z0 - 1.4, 0.35, 1.2, 0.35);
  g.add(box);
  const interacts: Interact[] = [...seats, { id: `mail-${ownerId}`, x: cx + 1.6, y: 0, z: z0 - 2, r: 1.6, label: mine ? "Decorate your home" : canEnter ? `${ownerName.split(" ")[0]}'s home` : "Private home: knock", kind: mine ? "decorate" : "home", data: { owner: ownerId, name: ownerName } }];
  return { group: g, interacts, door: { x: cx, z: z0 - 1.2 }, inside: { x: cx, z: cz } };
}

// A vehicle mesh for anyone's ride (shared by the town and the garage preview).
export function rideMesh(model: string, paint: string, rims?: string) {
  return vehicle(model, paint, rims);
}
