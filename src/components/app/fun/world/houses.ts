import * as THREE from "three";
import type { HomeLayout, Item } from "@/lib/fun-catalog";
import type { Physics } from "./engine";
import type { Interact } from "./city";
import { furniture } from "./models";
import { FURNITURE_PROP, placeProp } from "./props";
import { glass, lamp, plain, surface } from "./pbr";
import { textSprite } from "./toon";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Homes as real houses, each style its own architecture: a starter cottage (pitched clay roof, brick), a city
// townhouse (two storeys, flat roof, balcony), a modern house (white render, big glass, flat roof, terrace), a
// garden villa (wide, hipped roof, pool and loungers) and a manor (stone, columns, slate roof). Every house has its
// roof with fascia and gutters, windows with frames and sills, a front door with a porch light, a garage and a
// driveway to the street, a path, a fence or hedge with a gate, a mailbox and flower beds. Inside: the owner's floor
// and wall colours, skirting, a ceiling light that can be switched, and their furniture (real models where there
// is one; see props.ts). The front door opens for people allowed in and stays shut for others.

export type HouseSpec = { wall: string; wallKey: "plaster" | "brick" | "stone"; roof: "gable" | "hip" | "flat"; roofKey: "clayroof" | "roof" | "concrete"; storeys: 1 | 2; h: number; garage: boolean; pool: boolean; terrace: boolean; columns: boolean; fence: "picket" | "hedge" | "wall" | "glass" };
export const HOUSE_SPECS: Record<string, HouseSpec> = {
  cottage: { wall: "#e9d9c2", wallKey: "brick", roof: "gable", roofKey: "clayroof", storeys: 1, h: 3.1, garage: false, pool: false, terrace: false, columns: false, fence: "picket" },
  loft: { wall: "#d5d8dc", wallKey: "plaster", roof: "flat", roofKey: "concrete", storeys: 2, h: 3.2, garage: true, pool: false, terrace: false, columns: false, fence: "wall" },
  modern: { wall: "#f3f1ec", wallKey: "plaster", roof: "flat", roofKey: "concrete", storeys: 2, h: 3.3, garage: true, pool: false, terrace: true, columns: false, fence: "glass" },
  villa: { wall: "#efe2c8", wallKey: "plaster", roof: "hip", roofKey: "clayroof", storeys: 1, h: 3.6, garage: true, pool: true, terrace: true, columns: true, fence: "hedge" },
  castle: { wall: "#cfc8bb", wallKey: "stone", roof: "hip", roofKey: "roof", storeys: 2, h: 3.8, garage: true, pool: false, terrace: true, columns: true, fence: "wall" },
};

const tmpBox = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
function add(g: THREE.Group, m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, cast = true) {
  const o = new THREE.Mesh(tmpBox(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = cast;
  o.receiveShadow = true;
  g.add(o);
  return o;
}

// A pitched (gable along x) or hipped roof over a rectangle, with an overhang.
function roofMesh(kind: "gable" | "hip", w: number, d: number, rise: number, m: THREE.Material) {
  const hw = w / 2, hd = d / 2;
  const ridge = kind === "gable" ? hw : Math.max(0.2, hw - hd);
  const v = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], // eaves
    [-ridge, rise, 0], [ridge, rise, 0], // ridge
  ];
  const f = kind === "gable"
    ? [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [3, 0, 4], [1, 2, 5]]
    : [[0, 1, 5], [0, 5, 4], [2, 3, 4], [2, 4, 5], [3, 0, 4], [1, 2, 5]];
  const pos: number[] = [];
  const uv: number[] = [];
  for (const [a, b, c] of f) for (const i of [a, b, c]) (pos.push(...v[i!]!), uv.push(v[i!]![0]! / 2, v[i!]![2]! / 2));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  const o = new THREE.Mesh(g, m);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// Static parts merged by material (a house is then a dozen draw calls, not hundreds); moving and special parts stay.
function mergeStatic(g: THREE.Group, keep: Set<THREE.Object3D>) {
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const cast = new Map<THREE.Material, boolean>();
  const drop: THREE.Mesh[] = [];
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  for (const o of [...g.children]) {
    const m = o as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) continue;
    let geo = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    if (geo.index) geo = geo.toNonIndexed();
    if (!geo.getAttribute("uv") || !geo.getAttribute("normal")) continue;
    const mat = m.material as THREE.Material;
    (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(geo);
    cast.set(mat, (cast.get(mat) ?? false) || m.castShadow);
    drop.push(m);
  }
  for (const m of drop) (g.remove(m), m.geometry.dispose());
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    list.forEach((x) => x.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = cast.get(mat) ?? true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
}

export type BuiltHouse = { group: THREE.Group; interacts: Interact[]; door: { x: number; z: number }; inside: { x: number; z: number }; update: (me: { x: number; z: number }, t: number) => void; toggleLights: () => boolean; light: () => { x: number; y: number; z: number; on: boolean; r: number } };

// x0..x1 / z0..z1 is the room the owner furnishes (grid cells of 0.5 m from x0, z0); the door is on z0 (the
// street side, north).
export function buildHouse(ph: Physics, ownerId: string, ownerName: string, lot: { cx: number; cz: number }, h: HomeLayout, items: Item[], canEnter: boolean, mine: boolean, model: string, room: [number, number]): BuiltHouse {
  const tag = `home:${ownerId}`;
  ph.remove(tag);
  const g = new THREE.Group();
  g.name = tag;
  const S = HOUSE_SPECS[model] ?? HOUSE_SPECS.cottage!;
  const W = room[0] * 0.5, D = room[1] * 0.5;
  const cx = lot.cx, cz = lot.cz + 1;
  const x0 = cx - W / 2, x1 = cx + W / 2, z0 = cz - D / 2, z1 = cz + D / 2;
  const T = 0.25; // wall thickness
  const H = S.h;
  const top = S.storeys * H;
  const wallM = S.wallKey === "plaster" ? surface("plaster", { tint: S.wall }) : surface(S.wallKey, { tint: S.wallKey === "brick" ? "#ffffff" : "#ffffff" });
  const inner = plain(h.wall || "#f4efe6", { rough: 0.9 });
  const trim = plain("#f4f2ee", { rough: 0.6 });
  const darkTrim = plain("#2f3438", { rough: 0.5, metal: 0.4 });
  const frameM = model === "modern" || model === "loft" ? darkTrim : trim;
  const glassM = glass("#a9c1d1", 0.32);
  const doorM = surface("wood", { tint: "#7a4a2c" });
  const solid = (x: number, y: number, z: number, w: number, hh: number, d: number) => ph.sized(x, y, z, w, hh, d, tag);

  // ---- walls: outside material on the outer skin, the owner's paint inside; a door on the street side.
  const doorW = 1.1, doorH = 2.2;
  const wallRun = (axis: "x" | "z", at: number, from: number, to: number, gaps: [number, number, number][]) => {
    let cur = from;
    const seg = (a: number, b: number, ya: number, yb: number) => {
      if (b - a < 0.01 || yb - ya < 0.01) return;
      const mid = (a + b) / 2, len = b - a, hh = yb - ya, my = (ya + yb) / 2;
      const outerOff = (axis === "x" ? (at === z0 ? -1 : 1) : at === x0 ? -1 : 1) * (T / 4);
      if (axis === "x") {
        add(g, wallM, mid, my, at + outerOff, len, hh, T / 2);
        add(g, inner, mid, my, at - outerOff, len, hh, T / 2, false);
        solid(mid, my, at, len, hh, T);
      } else {
        add(g, wallM, at + outerOff, my, mid, T / 2, hh, len);
        add(g, inner, at - outerOff, my, mid, T / 2, hh, len, false);
        solid(at, my, mid, T, hh, len);
      }
    };
    for (const [a, b, gapTop] of [...gaps].sort((p, q) => p[0] - q[0])) {
      seg(cur, a, 0, H);
      seg(a, b, gapTop, H);
      cur = b;
    }
    seg(cur, to, 0, H);
  };
  // Windows: openings with glass, frame and a sill (sill at 0.9 m, head at 2.2 m) as wall gaps of the lower part.
  const winSpan = (len: number) => Math.max(1, Math.floor((len - 2) / 3));
  const winsX = (from: number, to: number, skip?: [number, number]) => {
    const n = winSpan(to - from);
    const out: [number, number][] = [];
    for (let i = 0; i < n; i++) {
      const c = from + ((i + 0.5) * (to - from)) / n;
      if (skip && c > skip[0] - 1.2 && c < skip[1] + 1.2) continue;
      out.push([c - 0.65, c + 0.65]);
    }
    return out;
  };
  const front = winsX(x0, x1, [cx - doorW / 2, cx + doorW / 2]);
  const back = winsX(x0, x1);
  const left = winsX(z0, z1);
  // A wall with windows: below the sill and above the head are wall, the window between is glass.
  const windowWall = (axis: "x" | "z", at: number, from: number, to: number, wins: [number, number][], door?: [number, number]) => {
    const gaps: [number, number, number][] = wins.map(([a, b]) => [a, b, 2.2]);
    if (door) gaps.push([door[0], door[1], doorH]);
    wallRun(axis, at, from, to, gaps);
    for (const [a, b] of wins) {
      const mid = (a + b) / 2, len = b - a;
      // Wall under the sill.
      if (axis === "x") {
        add(g, wallM, mid, 0.45, at, len, 0.9, T);
        solid(mid, 0.45, at, len, 0.9, T);
        add(g, glassM, mid, 1.55, at, len, 1.3, 0.04, false);
        solid(mid, 1.55, at, len, 1.3, 0.1);
        add(g, frameM, mid, 2.22, at, len + 0.1, 0.08, T + 0.06);
        add(g, frameM, mid, 0.88, at + (at === z0 ? -0.08 : 0.08), len + 0.2, 0.06, T + 0.2);
        add(g, frameM, mid, 1.55, at, 0.06, 1.3, T + 0.04);
      } else {
        add(g, wallM, at, 0.45, mid, T, 0.9, len);
        solid(at, 0.45, mid, T, 0.9, len);
        add(g, glassM, at, 1.55, mid, 0.04, 1.3, len, false);
        solid(at, 1.55, mid, 0.1, 1.3, len);
        add(g, frameM, at, 2.22, mid, T + 0.06, 0.08, len + 0.1);
        add(g, frameM, at + (at === x0 ? -0.08 : 0.08), 0.88, mid, T + 0.2, 0.06, len + 0.2);
        add(g, frameM, at, 1.55, mid, T + 0.04, 1.3, 0.06);
      }
    }
  };
  windowWall("x", z0, x0, x1, front, [cx - doorW / 2, cx + doorW / 2]);
  windowWall("x", z1, x0, x1, model === "modern" || model === "villa" ? [] : back);
  windowWall("z", x0, z0, z1, left);
  windowWall("z", x1, z0, z1, left);
  // Modern and villa: a glass wall to the garden at the back.
  if (model === "modern" || model === "villa") {
    add(g, glassM, cx, H / 2, z1, W - 0.6, H - 0.3, 0.05, false);
    for (let x = x0 + 0.3; x <= x1 - 0.3; x += (W - 0.6) / 4) add(g, darkTrim, x, H / 2, z1, 0.07, H - 0.3, 0.12);
  }

  // ---- upper storey (outside only), floors, ceiling, roof.
  if (S.storeys === 2) {
    const up = model === "modern" ? 0.8 : 0;
    add(g, wallM, cx + up, H + H / 2, cz, W + (model === "modern" ? 1.6 : 0), H, D);
    solid(cx + up, H + H / 2, cz, W + (model === "modern" ? 1.6 : 0), H, D);
    // Upper windows (glass bands in frames) on the front and back.
    for (const [a, b] of winsX(x0, x1))
      for (const z of [z0 - 0.02, z1 + 0.02]) {
        add(g, glassM, (a + b) / 2 + up, H + 1.6, z, b - a, 1.4, 0.04, false);
        add(g, frameM, (a + b) / 2 + up, H + 0.88, z + (z < cz ? -0.06 : 0.06), b - a + 0.2, 0.06, 0.15);
      }
    // A balcony over the door.
    if (model === "loft" || model === "castle") {
      add(g, plain("#d8d4cc", { rough: 0.8 }), cx, H + 0.05, z0 - 0.7, 3.2, 0.12, 1.4);
      add(g, glassM, cx, H + 0.6, z0 - 1.38, 3.2, 1, 0.04, false);
    }
  }
  // Floor (the owner's colour on a real floor), skirting, ceiling.
  const floorKey = /^#(c|d|b|a)/i.test(h.floor || "") ? "laminate" : "tiles";
  const floor = new THREE.Mesh(new THREE.BoxGeometry(W - T, 0.06, D - T), surface(floorKey, { tint: h.floor || "#d6a77a" }));
  floor.position.set(cx, 0.03, cz);
  floor.receiveShadow = true;
  g.add(floor);
  add(g, plain("#f6f4ef", { rough: 0.9 }), cx, H - 0.02, cz, W - T, 0.04, D - T, false);
  for (const [x, z, w, d] of [[cx, z0 + T / 2 + 0.01, W - T, 0.02], [cx, z1 - T / 2 - 0.01, W - T, 0.02], [x0 + T / 2 + 0.01, cz, 0.02, D - T], [x1 - T / 2 - 0.01, cz, 0.02, D - T]] as const) add(g, trim, x, 0.08, z, w, 0.12, d, false);
  // Roof by style.
  const roofMat = S.roofKey === "concrete" ? surface("concrete", { tint: "#8f8d88" }) : surface(S.roofKey, { tint: "#ffffff", side: THREE.DoubleSide });
  if (S.roof === "flat") {
    add(g, roofMat, cx + (model === "modern" ? 0.4 : 0), top + 0.15, cz, W + 1.2 + (model === "modern" ? 1.6 : 0), 0.3, D + 1.2);
    add(g, darkTrim, cx + (model === "modern" ? 0.4 : 0), top + 0.32, cz, W + 1.25 + (model === "modern" ? 1.6 : 0), 0.06, D + 1.25);
  } else {
    const r = roofMesh(S.roof, W + 1.0, D + 1.0, S.roof === "gable" ? D * 0.38 : D * 0.32, roofMat);
    r.position.set(cx, top, cz);
    g.add(r);
    // Fascia boards and gutters along the eaves.
    for (const z of [z0 - 0.5, z1 + 0.5]) {
      add(g, trim, cx, top - 0.06, z, W + 1.0, 0.18, 0.06);
      add(g, plain("#7b8085", { rough: 0.4, metal: 0.7 }), cx, top - 0.12, z + (z < cz ? -0.06 : 0.06), W + 1.0, 0.1, 0.1);
    }
    // Downpipes at the corners.
    for (const [x, z] of [[x0 - 0.35, z0 - 0.5], [x1 + 0.35, z0 - 0.5]] as const) add(g, plain("#7b8085", { rough: 0.4, metal: 0.7 }), x, top / 2, z, 0.08, top, 0.08);
    // A chimney on cottages and manors.
    if (model === "cottage" || model === "castle") add(g, surface("brick", { tint: "#ffffff" }), x1 - 1.4, top + 1.2, cz + 1, 0.7, 2.2, 0.7);
  }
  solid(cx, top + 0.6, cz, W + 0.5, 1.2, D + 0.5);

  // ---- the front: door (swings open for people allowed in), porch, light, steps, path.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(cx - doorW / 2, 0, z0 - 0.02);
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(doorW, doorH, 0.06), doorM);
  leaf.position.set(doorW / 2, doorH / 2, 0);
  leaf.castShadow = true;
  doorPivot.add(leaf);
  add(doorPivot, plain("#c9a14a", { rough: 0.3, metal: 0.9 }), doorW - 0.12, 1.05, -0.06, 0.04, 0.04, 0.12);
  g.add(doorPivot);
  const doorBox = ph.addDynamic({ minX: cx - doorW / 2, maxX: cx + doorW / 2, minY: 0, maxY: doorH, minZ: z0 - 0.1, maxZ: z0 + 0.1, tag });
  add(g, frameM, cx, doorH + 0.06, z0, doorW + 0.2, 0.12, T + 0.08);
  // Porch canopy and light.
  add(g, plain("#d9d4cb", { rough: 0.7 }), cx, doorH + 0.5, z0 - 0.7, 2.2, 0.12, 1.4);
  if (S.columns) for (const x of [cx - 1, cx + 1]) add(g, trim, x, (doorH + 0.5) / 2, z0 - 1.3, 0.22, doorH + 0.5, 0.22);
  const porch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 0.1), lamp("#ffd9a0", 0.05, 3));
  porch.position.set(cx + doorW / 2 + 0.35, 2.0, z0 - 0.18);
  g.add(porch);
  add(g, surface("stone", { tint: "#e8e4dc" }), cx, 0.08, z0 - 0.7, 2.4, 0.16, 1.4);
  // Path from the sidewalk to the door.
  const pathLen = Math.max(0.5, z0 - 1.4 - (lot.cz - 6.5));
  add(g, surface("stone", { tint: "#d7d2c8" }), cx, 0.02, z0 - 1.4 - pathLen / 2, 1.2, 0.04, pathLen, false);

  // ---- garage with a roll-up door and the driveway to the street (on the east side).
  if (S.garage) {
    const gx0 = x1 + 0.2, gx1 = x1 + 3.6;
    add(g, wallM, (gx0 + gx1) / 2, 1.4, cz + 0.5, gx1 - gx0, 2.8, D - 1);
    add(g, plain("#55595e", { rough: 0.7 }), (gx0 + gx1) / 2, 2.9, cz + 0.5, gx1 - gx0 + 0.4, 0.2, D - 0.6);
    add(g, plain("#c9ccd0", { rough: 0.45, metal: 0.5 }), (gx0 + gx1) / 2, 1.15, z0 + 0.48, gx1 - gx0 - 0.5, 2.3, 0.06);
    for (let y = 0.2; y < 2.3; y += 0.32) add(g, plain("#aeb2b6", { rough: 0.5, metal: 0.5 }), (gx0 + gx1) / 2, y, z0 + 0.44, gx1 - gx0 - 0.5, 0.03, 0.02, false);
    solid((gx0 + gx1) / 2, 1.4, cz + 0.5, gx1 - gx0, 2.8, D - 1);
    const dl = z0 + 0.5 - (lot.cz - 6.5);
    add(g, surface("concrete", { tint: "#cfccc5" }), (gx0 + gx1) / 2, 0.015, z0 + 0.5 - dl / 2, gx1 - gx0 - 0.2, 0.03, dl, false);
  }
  // ---- garden: fence or hedge along the front with a gate gap, flower beds, a pool and terrace by style.
  const fz = lot.cz - 6.6;
  const fx0 = lot.cx - 8, fx1 = lot.cx + 8;
  const gap: [number, number] = [cx - 0.8, cx + 0.8];
  const gap2: [number, number] | null = S.garage ? [x1 + 0.2, x1 + 3.8] : null;
  const runs = [[fx0, gap[0]], [gap[1], gap2 ? gap2[0] : fx1], ...(gap2 ? [[gap2[1], fx1]] : [])] as [number, number][];
  for (const [a, b] of runs) {
    if (b - a < 0.3) continue;
    const mid = (a + b) / 2, len = b - a;
    if (S.fence === "hedge") add(g, plain("#3e6b2e", { rough: 0.95 }), mid, 0.5, fz, len, 1, 0.6);
    else if (S.fence === "wall") (add(g, wallM, mid, 0.45, fz, len, 0.9, 0.25), add(g, trim, mid, 0.93, fz, len + 0.05, 0.06, 0.32));
    else if (S.fence === "glass") (add(g, glass("#c8d8e2", 0.3), mid, 0.55, fz, len, 1.1, 0.03, false), add(g, darkTrim, mid, 1.1, fz, len, 0.05, 0.06));
    else for (let x = a + 0.1; x < b; x += 0.25) add(g, trim, x, 0.45, fz, 0.08, 0.9, 0.04);
    if (S.fence === "picket") add(g, trim, mid, 0.7, fz, len, 0.06, 0.05);
    solid(mid, 0.5, fz, len, 1, 0.3);
  }
  const flowerCols = ["#c2185b", "#f9a825", "#7b1fa2", "#e53935", "#fdd835"];
  for (const [bx, bw] of [[x0 + 1.2, 1.6], [x1 - 1.2 - (S.garage ? 0 : 0), 1.6]] as const) {
    add(g, surface("dirt", { tint: "#ffffff" }), bx, 0.06, z0 - 1.0, bw, 0.12, 0.8, false);
    for (let i = 0; i < 6; i++) add(g, plain(flowerCols[(i + Math.round(bx)) % 5]!, { rough: 0.8 }), bx - bw / 2 + 0.15 + i * 0.26, 0.22, z0 - 1 + ((i % 2) - 0.5) * 0.3, 0.12, 0.12, 0.12, false);
  }
  if (S.terrace) {
    add(g, surface("planks", { tint: "#ffffff" }), cx, 0.06, z1 + 1.6, W - 1, 0.12, 2.8);
  }
  if (S.pool) {
    const pw = Math.min(W - 2, 7), pz = z1 + 4.2;
    add(g, surface("tiles", { tint: "#dfeef2" }), cx, 0.07, pz, pw + 1.2, 0.14, 3.2);
    const water = new THREE.Mesh(new THREE.BoxGeometry(pw, 0.05, 2.2), new THREE.MeshPhysicalMaterial({ color: "#3fa7c9", roughness: 0.05, transmission: 0.2, transparent: true, opacity: 0.85, envMapIntensity: 1.5 }));
    water.position.set(cx, 0.12, pz);
    g.add(water);
  }

  // ---- inside: a ceiling light that can be switched, and the furniture.
  const ceilingLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.08, 16), lamp("#fff2d6", 0.4, 2.5));
  ceilingLamp.position.set(cx, H - 0.08, cz);
  g.add(ceilingLamp);
  let lightsOn = true;
  const seats: Interact[] = [];
  const extra: Interact[] = [];
  for (const p of h.items) {
    const it = items.find((i) => i.key === p.key);
    if (!it) continue;
    const [sw, sd] = it.size ?? [2, 2];
    const [fw, fd] = p.r % 2 ? [sd, sw] : [sw, sd];
    const px = x0 + (p.x + fw / 2) * 0.5, pz = z0 + (p.z + fd / 2) * 0.5;
    const m = furniture(it.model ?? "", it.color ?? "#a16207", sw * 0.5, sd * 0.5);
    m.position.set(px, 0.06, pz);
    m.rotation.y = p.r * (Math.PI / 2);
    m.userData.furniture = { model: it.model, w: sw * 0.5, d: sd * 0.5, color: it.color };
    g.add(m);
    // A real model (Poly Haven, CC0) replaces the drawn one when there is one for this kind of furniture.
    const pk = FURNITURE_PROP[it.model ?? ""];
    if (pk) void placeProp(g, pk, px, pz, p.r * (Math.PI / 2) + Math.PI, { w: fw * 0.5, d: fd * 0.5, y: 0.06 }).then((h) => h && (m.visible = false));
    const tall: Record<string, number> = { rug: 0, lamp: 1.7, plant: 1, tree: 2.2, shelf: 2, tv: 1.5, painting: 0, aquarium: 1.3, fireplace: 1.4, arcade: 1.8, bed: 0.6, chair: 0.5, sofa: 0.5, armchair: 0.5, throne: 0.6, piano: 1.2, table: 0.78, desk: 0.78 };
    const ht = tall[it.model ?? ""] ?? 0.8;
    if (ht > 0) ph.sized(px, ht / 2, pz, fw * 0.5 * 0.9, ht, fd * 0.5 * 0.9, tag);
    const fwd = p.r * (Math.PI / 2);
    if (it.seat || it.model === "bed") seats.push({ id: `seat-${ownerId}-${p.x}-${p.z}`, x: px + Math.sin(fwd) * 0.9, y: 0, z: pz + Math.cos(fwd) * 0.9, r: 1.3, label: it.model === "bed" ? "Lie down" : it.model === "piano" ? "Play the piano" : "Sit down", kind: "sit", data: { x: px + Math.sin(fwd) * 0.2, y: 0.05, z: pz + Math.cos(fwd) * 0.2, ry: fwd } });
    if (it.model === "tv") extra.push({ id: `tv-${ownerId}-${p.x}-${p.z}`, x: px + Math.sin(fwd) * 1.4, y: 0, z: pz + Math.cos(fwd) * 1.4, r: 1.4, label: "Watch TV", kind: "tv" });
    if (it.model === "desk") extra.push({ id: `pc-${ownerId}-${p.x}-${p.z}`, x: px + Math.sin(fwd) * 0.9, y: 0, z: pz + Math.cos(fwd) * 0.9, r: 1.2, label: "Use the computer", kind: "computer" });
  }
  // The light switch by the door.
  extra.push({ id: `lights-${ownerId}`, x: cx + 1, y: 0, z: z0 + 0.8, r: 1.2, label: "Switch the lights", kind: "lights", data: { owner: ownerId } });

  // The name over the door, the mailbox (visit / decorate).
  const n = textSprite([mine ? "Your home" : `${ownerName.split(" ")[0]}'s home`, canEnter ? "" : "Private"], { width: 2.8 });
  n.position.set(cx, top + (S.roof === "flat" ? 1.2 : D * 0.4 + 0.9), z0 - 0.6);
  g.add(n);
  add(g, plain("#2b2f33", { rough: 0.5, metal: 0.6 }), cx + 1.6, 0.55, fz + 0.4, 0.06, 1.1, 0.06);
  add(g, plain(mine ? "#1f6b3a" : "#1f3f7a", { rough: 0.4, metal: 0.5 }), cx + 1.6, 1.15, fz + 0.4, 0.42, 0.3, 0.26);
  const interacts: Interact[] = [...seats, ...extra, { id: `mail-${ownerId}`, x: cx + 1.6, y: 0, z: fz - 0.4, r: 1.6, label: mine ? "Decorate your home" : canEnter ? `${ownerName.split(" ")[0]}'s home` : "Private home: knock", kind: mine ? "decorate" : "home", data: { owner: ownerId, name: ownerName } }];

  mergeStatic(g, new Set<THREE.Object3D>([n, ceilingLamp]));
  // The door opens when someone allowed in comes near, and closes behind them.
  let open = 0;
  const update = (me: { x: number; z: number }, _t: number) => {
    const near = canEnter && Math.hypot(me.x - cx, me.z - z0) < 2.3;
    const want = near ? 1 : 0;
    if (Math.abs(open - want) > 0.001) {
      open += (want - open) * 0.18;
      doorPivot.rotation.y = -open * 1.45;
      doorBox.on = open < 0.5;
    }
  };
  const toggleLights = () => {
    lightsOn = !lightsOn;
    (ceilingLamp.material as THREE.MeshStandardMaterial).emissiveIntensity = lightsOn ? 2.5 : 0;
    return lightsOn;
  };
  // One shared room light (the town's) comes here when someone is inside and the lights are on.
  const light = () => ({ x: cx, y: H - 0.4, z: cz, on: lightsOn, r: Math.max(W, D) * 0.7 });
  return { group: g, interacts, door: { x: cx, z: z0 - 1.2 }, inside: { x: cx, z: cz }, update, toggleLights, light };
}
