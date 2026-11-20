import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Physics } from "./engine";
import { glass, lamp, plain, roadPaint, surface } from "./pbr";
import { signPlane } from "./toon";
import { plant, type PlantKind } from "./nature";

// The town's streets, planned like a real town: a ring road, Seed Avenue north and south, Market Street through the
// shops, Office Row behind the tower, a downtown grid to the north-east, a civic quarter to the north-west, home
// streets to the south and roads out to the stadium and the circuit. Every road has its lanes and markings, raised
// sidewalks with curbs and corner pads, zebra crossings and stop lines at junctions, street lamps (lit at night),
// trees on the avenues, traffic lights on a shared cycle at the busy junctions, stop signs at the quiet ones, street
// name signs and bus stops. Traffic follows the same plan (lanes, junctions and lights).

export type Road = {
  name: string;
  axis: "x" | "z"; // the road runs along this axis
  c: number; // its centre line on the other axis
  from: number;
  to: number;
  w: number; // asphalt width
  s: number; // sidewalk width each side (0: none)
  lanes: 1 | 2; // lanes each way
  kind: "ring" | "avenue" | "street" | "home" | "access";
};

export const ROADS: Road[] = [
  { name: "Ring Road", axis: "x", c: -135, from: -141, to: 141, w: 12, s: 3, lanes: 2, kind: "ring" },
  { name: "Ring Road", axis: "x", c: 135, from: -141, to: 141, w: 12, s: 3, lanes: 2, kind: "ring" },
  { name: "Ring Road", axis: "z", c: -135, from: -135, to: 135, w: 12, s: 3, lanes: 2, kind: "ring" },
  { name: "Ring Road", axis: "z", c: 135, from: -135, to: 135, w: 12, s: 3, lanes: 2, kind: "ring" },
  { name: "Seed Avenue", axis: "z", c: 0, from: -135, to: -86, w: 12, s: 3.5, lanes: 2, kind: "avenue" },
  { name: "Seed Avenue", axis: "z", c: 0, from: 34, to: 135, w: 12, s: 3.5, lanes: 2, kind: "avenue" },
  { name: "Office Row", axis: "x", c: -86, from: -135, to: 135, w: 10, s: 3, lanes: 1, kind: "street" },
  { name: "Market Street", axis: "x", c: 0, from: 34, to: 135, w: 10, s: 3, lanes: 1, kind: "street" },
  { name: "Park Road", axis: "x", c: 0, from: -135, to: -34, w: 8, s: 2.5, lanes: 1, kind: "street" },
  { name: "Tower Street", axis: "x", c: -40, from: 30, to: 135, w: 10, s: 3, lanes: 1, kind: "street" },
  { name: "Civic Street", axis: "x", c: -40, from: -135, to: -30, w: 8, s: 2.5, lanes: 1, kind: "street" },
  { name: "Harbour Lane", axis: "z", c: 62, from: -135, to: -40, w: 10, s: 3, lanes: 1, kind: "street" },
  { name: "Lantern Lane", axis: "z", c: 102, from: -135, to: -40, w: 10, s: 3, lanes: 1, kind: "street" },
  { name: "Library Way", axis: "z", c: -88, from: -135, to: -40, w: 8, s: 2.5, lanes: 1, kind: "street" },
  { name: "East Homes Road", axis: "z", c: 95, from: 30, to: 135, w: 8, s: 2, lanes: 1, kind: "street" },
  { name: "West Homes Road", axis: "z", c: -95, from: 30, to: 135, w: 8, s: 2, lanes: 1, kind: "street" },
  ...[30, 46, 62, 78, 94, 110].map((z, i) => ({ name: ["Acacia", "Birch", "Cedar", "Daisy", "Elm", "Fern"][i] + " Street", axis: "x" as const, c: z, from: -95, to: 95, w: 7, s: 1.5, lanes: 1 as const, kind: "home" as const })),
  { name: "Stadium Road", axis: "x", c: 60, from: 135, to: 158, w: 10, s: 2.5, lanes: 1, kind: "access" },
  { name: "Circuit Road", axis: "x", c: -55, from: 135, to: 150, w: 10, s: 2.5, lanes: 1, kind: "access" },
  { name: "Grand Prix Road", axis: "x", c: -120, from: 135, to: 214, w: 10, s: 2.5, lanes: 1, kind: "access" },
];

// Junctions with traffic lights (the rest have stop signs on the minor road).
const SIGNALS: [number, number][] = [[0, -86], [62, -86], [102, -86], [62, -40], [102, -40], [0, 135], [0, -135], [-88, -86], [-88, -40]];

export type Junction = { x: number; z: number; a: Road; b: Road; signal: boolean };

// Traffic lights: one cycle for the whole town (everyone sees the same lights): roads along x go first.
export const LIGHT_CYCLE = 34;
export function lightState(axis: "x" | "z", t = Date.now() / 1000): "green" | "yellow" | "red" {
  const k = t % LIGHT_CYCLE;
  const half = LIGHT_CYCLE / 2;
  const mine = axis === "x" ? k : (k + half) % LIGHT_CYCLE;
  return mine < half - 5 ? "green" : mine < half - 2 ? "yellow" : "red";
}

const along = (r: Road, t: number, off: number) => (r.axis === "x" ? new THREE.Vector3(t, 0, r.c + off) : new THREE.Vector3(r.c + off, 0, t));

export function junctions(roads = ROADS): Junction[] {
  const out: Junction[] = [];
  for (const a of roads)
    for (const b of roads) {
      if (a.axis !== "x" || b.axis !== "z") continue;
      if (b.c >= a.from - 1 && b.c <= a.to + 1 && a.c >= b.from - 1 && a.c <= b.to + 1) out.push({ x: b.c, z: a.c, a, b, signal: SIGNALS.some(([x, z]) => x === b.c && z === a.c) });
    }
  return out;
}

// Parts of a road (along its axis) taken by crossing roads, per side (-1 or +1) of the road.
function cuts(r: Road, js: Junction[]) {
  const out: { t: number; half: number; side: -1 | 0 | 1; j: Junction }[] = [];
  for (const j of js) {
    if (j.a !== r && j.b !== r) continue;
    const o = j.a === r ? j.b : j.a;
    const t = r.axis === "x" ? j.x : j.z;
    const half = o.w / 2 + o.s;
    // Which side(s) of r the other road leaves on.
    const neg = o.from < r.c - r.w / 2 - 0.5, pos = o.to > r.c + r.w / 2 + 0.5;
    out.push({ t, half, side: neg && pos ? 0 : neg ? -1 : 1, j });
  }
  return out;
}

// Pieces of [from, to] left after removing spans.
function pieces(from: number, to: number, spans: [number, number][]) {
  const out: [number, number][] = [];
  let cur = from;
  for (const [a, b] of [...spans].sort((p, q) => p[0] - q[0])) {
    if (a > cur) out.push([cur, Math.min(a, to)]);
    cur = Math.max(cur, b);
  }
  if (cur < to) out.push([cur, to]);
  return out.filter(([a, b]) => b - a > 0.2);
}

type Geo = Map<THREE.Material, THREE.BufferGeometry[]>;
const box = (geo: Geo, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, ry = 0) => {
  const g = new THREE.BoxGeometry(w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  (geo.get(mat) ?? geo.set(mat, []).get(mat)!).push(g);
};
const flat = (geo: Geo, mat: THREE.Material, x: number, y: number, z: number, w: number, d: number) => {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  g.translate(x, y, z);
  (geo.get(mat) ?? geo.set(mat, []).get(mat)!).push(g);
};
const cylinder = (geo: Geo, mat: THREE.Material, x: number, y: number, z: number, r: number, h: number, seg = 10, r2 = r) => {
  const g = new THREE.CylinderGeometry(r2, r, h, seg);
  g.translate(x, y, z);
  (geo.get(mat) ?? geo.set(mat, []).get(mat)!).push(g);
};
function finish(geo: Geo, parent: THREE.Object3D, shadows: boolean) {
  for (const [m, raw] of geo) {
    // Boxes are indexed, spheres are not: merge everything unindexed.
    const list = raw.map((g) => (g.index ? g.toNonIndexed() : g));
    raw.forEach((g, i) => g !== list[i] && g.dispose());
    // Merge in chunks so a long street is a few draw calls, and far chunks can be culled.
    for (let i = 0; i < list.length; i += 400) {
      const merged = mergeGeometries(list.slice(i, i + 400), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.receiveShadow = true;
      mesh.castShadow = shadows;
      parent.add(mesh);
    }
    list.forEach((g) => g.dispose());
  }
  geo.clear();
}

export type TrafficLight = { x: number; z: number; axis: "x" | "z"; lamps: THREE.Mesh[] };

// Every light on one axis shows the same colour at the same time, so they share six materials (two axes, three
// lamps) and all the heads merge into a few draw calls.
const SIGNAL_MATS = { x: [] as THREE.MeshStandardMaterial[], z: [] as THREE.MeshStandardMaterial[] };
function signalMat(axis: "x" | "z", i: number) {
  if (!SIGNAL_MATS[axis][i]) SIGNAL_MATS[axis][i] = new THREE.MeshStandardMaterial({ color: "#1d1d1d", emissive: new THREE.Color(["#ff3b30", "#ffcc00", "#34c759"][i]), emissiveIntensity: 0, roughness: 0.3 });
  return SIGNAL_MATS[axis][i]!;
}

export function buildStreets(ph: Physics, opts: { trees: boolean; detail: number }) {
  const group = new THREE.Group();
  group.name = "streets";
  const js = junctions();
  const geo: Geo = new Map();
  const deco: Geo = new Map();
  const lampSpots: THREE.Vector3[] = [];
  const lights: TrafficLight[] = [];
  const asphalt = surface("asphalt", { tint: "#8c8c8c" });
  const walk = surface("sidewalk", { tint: "#ffffff" });
  const curbM = surface("concrete", { tint: "#d6d3cc" });
  const white = roadPaint("#efefe9");
  const yellow = roadPaint("#e8b923");
  const poleM = plain("#3b4148", { rough: 0.45, metal: 0.8 });
  const darkM = plain("#1c1f23", { rough: 0.5, metal: 0.3 });
  const bulb = lamp("#ffe7b8", 0.02, 4);
  const soil = surface("dirt", { tint: "#ffffff" });

  // Junction squares (asphalt).
  for (const j of js) flat(geo, asphalt, j.x, 0.012, j.z, j.b.w, j.a.w);

  for (const r of ROADS) {
    const len = r.to - r.from, mid = (r.from + r.to) / 2;
    // Asphalt.
    if (r.axis === "x") flat(geo, asphalt, mid, 0.01, r.c, len, r.w);
    else flat(geo, asphalt, r.c, 0.01, mid, r.w, len);
    const cs = cuts(r, js);
    const inJ = cs.map((c) => [c.t - c.half, c.t + c.half] as [number, number]);
    // Markings, outside junctions: centre line (double yellow on big roads, dashed on home streets), lane lines,
    // edge lines.
    const mark = (off: number, mat: THREE.Material, dash: number, gap: number, wide = 0.15) => {
      for (const [a, b] of pieces(r.from + 1, r.to - 1, inJ.map(([p, q]) => [p - 4, q + 4]))) {
        if (!dash) {
          const p = along(r, (a + b) / 2, off);
          if (r.axis === "x") flat(geo, mat, p.x, 0.02, p.z, b - a, wide);
          else flat(geo, mat, p.x, 0.02, p.z, wide, b - a);
          continue;
        }
        for (let t = a; t + dash <= b; t += dash + gap) {
          const p = along(r, t + dash / 2, off);
          if (r.axis === "x") flat(geo, mat, p.x, 0.02, p.z, dash, wide);
          else flat(geo, mat, p.x, 0.02, p.z, wide, dash);
        }
      }
    };
    if (r.kind === "home") mark(0, yellow, 3, 4, 0.12);
    else {
      mark(-0.12, yellow, 0, 0);
      mark(0.12, yellow, 0, 0);
    }
    if (r.lanes === 2) for (const s of [-1, 1]) mark((s * r.w) / 4, white, 3, 6);
    if (r.kind !== "home") for (const s of [-1, 1]) mark(s * (r.w / 2 - 0.35), white, 0, 0, 0.12);

    // Zebra crossings and stop lines before each junction (on the approaching side of each direction).
    for (const c of cs) {
      for (const dir of [-1, 1]) {
        const edge = c.t + dir * c.half;
        if (edge < r.from + 1 || edge > r.to - 1) continue;
        // Zebra: stripes across the road, 3 m deep, just outside the junction.
        const zc = edge + dir * 1.8;
        for (let k = -r.w / 2 + 0.6; k < r.w / 2 - 0.3; k += 1.1) {
          const p = along(r, zc, k + 0.25);
          if (r.axis === "x") flat(geo, white, p.x, 0.021, p.z, 3, 0.5);
          else flat(geo, white, p.x, 0.021, p.z, 0.5, 3);
        }
        // Stop line for traffic coming towards the junction on this side (it drives on the right).
        const sl = edge + dir * 3.9;
        const laneSide = dir > 0 ? (r.axis === "x" ? -1 : 1) : r.axis === "x" ? 1 : -1;
        const p = along(r, sl, (laneSide * r.w) / 4);
        if (r.axis === "x") flat(geo, white, p.x, 0.021, p.z, 0.45, r.w / 2 - 0.4);
        else flat(geo, white, p.x, 0.021, p.z, r.w / 2 - 0.4, 0.45);
      }
    }

    // Sidewalks with curbs on both sides, cut at junctions on the side the crossing road leaves.
    if (r.s > 0)
      for (const side of [-1, 1] as const) {
        const spans = cs.filter((c) => c.side === 0 || c.side === side).map((c) => [c.t - c.half + r.s * 0 - 0.01, c.t + c.half + 0.01] as [number, number]);
        const off = side * (r.w / 2 + r.s / 2);
        for (const [a, b] of pieces(r.from, r.to, spans.map(([p, q]) => [p + r.s * 0, q] as [number, number]))) {
          const p = along(r, (a + b) / 2, off);
          const L = b - a;
          if (r.axis === "x") box(geo, walk, p.x, 0.075, p.z, L, 0.15, r.s);
          else box(geo, walk, p.x, 0.075, p.z, r.s, 0.15, L);
          // The curb: a concrete edge along the road.
          const k = along(r, (a + b) / 2, side * (r.w / 2 + 0.1));
          if (r.axis === "x") box(geo, curbM, k.x, 0.08, k.z, L, 0.16, 0.2);
          else box(geo, curbM, k.x, 0.08, k.z, 0.2, 0.16, L);
          if (r.axis === "x") ph.sized(p.x, 0.075, p.z, L, 0.15, r.s, "walk");
          else ph.sized(p.x, 0.075, p.z, r.s, 0.15, L, "walk");
          // Street lamps every 26 m (alternating sides on wide roads), trees between them on avenues.
          const step = 26;
          for (let t = a + 6 + (side > 0 ? step / 2 : 0); t < b - 4; t += step) {
            const lp = along(r, t, side * (r.w / 2 + r.s - 0.5));
            cylinder(deco, poleM, lp.x, 3.6, lp.z, 0.09, 7.2, 8, 0.07);
            const toRoad = -side;
            const arm = along(r, t, side * (r.w / 2 + r.s - 0.5) + toRoad * 1.4);
            box(deco, poleM, (lp.x + arm.x) / 2, 7.15, (lp.z + arm.z) / 2, r.axis === "x" ? 0.08 : 2.9, 0.08, r.axis === "x" ? 2.9 : 0.08);
            box(deco, darkM, arm.x, 7.05, arm.z, r.axis === "x" ? 0.5 : 0.8, 0.14, r.axis === "x" ? 0.8 : 0.5);
            box(deco, bulb, arm.x, 6.96, arm.z, r.axis === "x" ? 0.36 : 0.62, 0.04, r.axis === "x" ? 0.62 : 0.36);
            lampSpots.push(new THREE.Vector3(arm.x, 6.6, arm.z));
            ph.post({ x: lp.x, z: lp.z, r: 0.15, minY: 0, maxY: 7 });
            if (opts.trees && (r.kind === "avenue" || r.kind === "street") && r.s >= 3 && t + step / 2 < b - 4) {
              const tp = along(r, t + step / 2, side * (r.w / 2 + r.s / 2 + 0.2));
              tree(deco, tp.x, tp.z, (t * 7.3 + r.c) % 1, r.kind === "avenue", soil);
              ph.post({ x: tp.x, z: tp.z, r: 0.25, minY: 0, maxY: 4 });
            }
          }
        }
      }
  }

  // Corner pads where two sidewalks meet at a junction.
  for (const j of js) {
    const H = j.a, V = j.b;
    if (!H.s || !V.s) continue;
    for (const qx of [-1, 1])
      for (const qz of [-1, 1]) {
        const hArm = qx < 0 ? H.from < V.c - V.w / 2 - 0.5 : H.to > V.c + V.w / 2 + 0.5;
        const vArm = qz < 0 ? V.from < H.c - H.w / 2 - 0.5 : V.to > H.c + H.w / 2 + 0.5;
        if (!hArm || !vArm) continue;
        const sx = V.s, sz = H.s;
        const cx = j.x + qx * (V.w / 2 + sx / 2), cz = j.z + qz * (H.w / 2 + sz / 2);
        box(geo, walk, cx, 0.075, cz, sx, 0.15, sz);
        ph.sized(cx, 0.075, cz, sx, 0.15, sz, "walk");
        // Signal poles on the corners of signalled junctions, a stop sign on the minor road elsewhere.
        const px = j.x + qx * (V.w / 2 + 0.5), pz = j.z + qz * (H.w / 2 + 0.5);
        if (j.signal) {
          cylinder(deco, poleM, px, 2.3, pz, 0.08, 4.6, 8);
          ph.post({ x: px, z: pz, r: 0.12, minY: 0, maxY: 4 });
          // Two heads per pole: one for each road's traffic arriving at this corner.
          for (const axis of ["x", "z"] as const) {
            const ry = axis === "x" ? (qx > 0 ? -Math.PI / 2 : Math.PI / 2) : qz > 0 ? Math.PI : 0;
            const m = new THREE.Matrix4().makeRotationY(ry).setPosition(px, 3.6, pz);
            const housing = new THREE.BoxGeometry(0.34, 1.0, 0.28).applyMatrix4(m);
            (deco.get(darkM) ?? deco.set(darkM, []).get(darkM)!).push(housing);
            [0, 1, 2].forEach((i) => {
              const disc = new THREE.CircleGeometry(0.11, 14);
              disc.translate(0, 0.3 - i * 0.3, 0.145);
              disc.applyMatrix4(m);
              const mat = signalMat(axis, i);
              (deco.get(mat) ?? deco.set(mat, []).get(mat)!).push(disc);
            });
            if (!lights.some((l) => l.axis === axis)) lights.push({ x: px, z: pz, axis, lamps: [] });
          }
        } else if (opts.detail > 0) {
          // Stop sign facing traffic on the minor road (home streets and side roads).
          const minor = H.kind === "home" || (H.w < V.w ? true : false) ? "x" : "z";
          if ((minor === "x" && qz < 0 && qx < 0) || (minor === "z" && qx > 0 && qz < 0)) {
            cylinder(deco, poleM, px, 1.2, pz, 0.04, 2.4, 6);
            const sign = new THREE.Mesh(new THREE.CircleGeometry(0.38, 8), plain("#c8102e", { rough: 0.4 }));
            sign.position.set(px, 2.3, pz);
            sign.rotation.y = minor === "x" ? -Math.PI / 2 : 0;
            group.add(sign);
            const txt = signPlane("STOP", 0.5, 0.18, "#c8102e");
            txt.position.set(px + (minor === "x" ? -0.02 : 0), 2.3, pz + (minor === "z" ? 0.02 : 0));
            txt.rotation.y = sign.rotation.y;
            group.add(txt);
          }
        }
        // A street name sign on one corner of each junction.
        if (qx > 0 && qz > 0 && opts.detail > 0) {
          const nx = j.x + qx * (V.w / 2 + V.s - 0.4), nz = j.z + qz * (H.w / 2 + H.s - 0.4);
          cylinder(deco, poleM, nx, 1.5, nz, 0.04, 3, 6);
          const a = signPlane(H.name, 1.6, 0.26, "#1f5f3a");
          a.position.set(nx, 2.95, nz);
          group.add(a);
          const b = signPlane(V.name, 1.6, 0.26, "#1f5f3a");
          b.position.set(nx, 2.65, nz);
          b.rotation.y = Math.PI / 2;
          group.add(b);
        }
      }
  }

  // Bus stops on the avenues: a shelter with glass sides, a bench and the timetable.
  const glassM = glass("#cfe3f0", 0.25);
  for (const [x, z, ry] of [[7.6 + 1.2, 60, Math.PI / 2], [-7.6 - 1.2, 100, -Math.PI / 2], [7.6 + 1.2, -110, Math.PI / 2], [80, 6.5 + 1.1, 0], [-80, -5.5, Math.PI]] as [number, number, number][]) {
    const g = new THREE.Group();
    g.position.set(x, 0.15, z);
    g.rotation.y = ry;
    const add = (m: THREE.Material, px: number, py: number, pz: number, w: number, h: number, d: number) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
      o.position.set(px, py, pz);
      o.castShadow = true;
      g.add(o);
    };
    add(poleM, -1.8, 1.25, -0.6, 0.08, 2.5, 0.08);
    add(poleM, 1.8, 1.25, -0.6, 0.08, 2.5, 0.08);
    add(glassM, 0, 1.3, -0.65, 3.6, 2.2, 0.03);
    add(glassM, -1.8, 1.3, 0, 0.03, 2.2, 1.3);
    add(plain("#2b3138", { rough: 0.4, metal: 0.6 }), 0, 2.55, -0.05, 3.9, 0.08, 1.6);
    add(plain("#6b4f36", { rough: 0.7 }), 0, 0.45, -0.35, 2.4, 0.06, 0.45);
    const t = signPlane("Seed Bus · 1 Ring · 2 Avenue · 3 Market", 1.2, 0.45, "#0b4f8a");
    t.position.set(1.4, 1.6, -0.62);
    g.add(t);
    group.add(g);
    const wx = x + Math.sin(ry) * 0, wz = z;
    ph.post({ x: wx, z: wz, r: 0.6, minY: 0, maxY: 2.5 });
  }

  finish(geo, group, false);
  finish(deco, group, true);
  return { group, lampSpots, lights, junctions: js };
}

// A street tree: a trunk, branches and clusters of leaves (several shades), slightly different every time.
// A street tree: a soil square in the pavement; the tree itself is a real model planted for Nature (palms on the
// avenues, broadleaf trees on the streets).
function tree(geo: Geo, x: number, z: number, seed: number, avenue: boolean, soil: THREE.Material) {
  box(geo, soil, x, 0.16, z, 1.3, 0.04, 1.3);
  const kinds: PlantKind[] = avenue ? ["coconut", "curlypalm", "datepalm", "coconut"] : ["oak", "maple", "beech", "acacia", "birch"];
  const s = ((seed % 1) + 1) % 1;
  plant(kinds[Math.floor(s * 97) % kinds.length]!, x, z, s, s * 40);
}

// Update the traffic lights (called a few times a second).
export function updateLights(_lights: TrafficLight[], t = Date.now() / 1000) {
  for (const axis of ["x", "z"] as const) {
    const s = lightState(axis, t);
    SIGNAL_MATS[axis].forEach((m, i) => {
      const on = (i === 0 && s === "red") || (i === 1 && s === "yellow") || (i === 2 && s === "green");
      m.emissiveIntensity = on ? 3.2 : 0.02;
    });
  }
}

// The lanes traffic drives in: for each road, two directions (right-hand traffic), as segments joined at junctions.
export type Lane = { road: Road; dir: 1 | -1; off: number; from: number; to: number };
export function lanes(): Lane[] {
  const out: Lane[] = [];
  for (const r of ROADS) {
    if (r.kind === "access") continue;
    for (const dir of [1, -1] as const) {
      // Right-hand traffic: heading +x drives at +z offset... (+x heading: right side is +z in this world's frame).
      const off = (r.axis === "x" ? dir : -dir) * (r.lanes === 2 ? r.w * 0.375 : r.w / 4);
      out.push({ road: r, dir, off, from: r.from + 2, to: r.to - 2 });
    }
  }
  return out;
}
