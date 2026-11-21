import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Physics } from "./engine";
import type { Interact } from "./city";
import { facade, glass, lamp, plain, roadPaint, surface } from "./pbr";
import { signPlane } from "./toon";
import { plant } from "./nature";
import { anyVehicle } from "./cars";
import { buildFountain } from "./fountain";

// The Myseed HQ campus, north of the ring road at the end of Campus Drive: a glass tower of 26 storeys on a
// two-storey podium with a lobby you can walk into (reception, a logo wall, lounges, the elevator bank to the sky
// deck on the roof), a forecourt with a fountain, flags and the name in stone, and parking: a big surface lot
// west of the drive (marked bays, lamp posts, tree islands, a barrier gate) and a multi-storey car park with a
// surface lot east of the tower. Parked cars stand in the bays.

type Geo = Map<THREE.Material, THREE.BufferGeometry[]>;
const put = (geo: Geo, m: THREE.Material, g: THREE.BufferGeometry) => (geo.get(m) ?? geo.set(m, []).get(m)!).push(g);
const box = (geo: Geo, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  const g = new THREE.BoxGeometry(Math.max(0.01, Math.abs(x1 - x0)), Math.max(0.01, Math.abs(y1 - y0)), Math.max(0.01, Math.abs(z1 - z0)));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  put(geo, m, g);
};
const cyl = (geo: Geo, m: THREE.Material, x: number, y0: number, z: number, r: number, h: number, seg = 16) => {
  const g = new THREE.CylinderGeometry(r, r, h, seg);
  g.translate(x, y0 + h / 2, z);
  put(geo, m, g);
};

export const CAMPUS = { x0: -68, x1: 110, z0: -262, z1: -146 };
// The tower and its podium (the lobby is the podium's ground floor).
export const HQ_TOWER = { x0: 22, x1: 50, z0: -238, z1: -210 };
const POD = { x0: 14, x1: 62, z0: -246, z1: -196, h: 9 };
const FLOOR = 3.6;
const STOREYS = 26;
export const SKY_DECK_Y = POD.h + STOREYS * FLOOR + 0.3;

// The old office (the town centre's three-storey glass block): a canopy over its door, planters with trees and
// flags on the forecourt towards the plaza.
export function buildOfficeFront(ph: Physics, hq: { x0: number; x1: number; z1: number }) {
  const group = new THREE.Group();
  group.name = "office-front";
  const geo: Geo = new Map();
  const steel = plain("#3a4048", { rough: 0.35, metal: 0.85 });
  const stone = surface("stone", { tint: "#e6e0d4" });
  const lampM = lamp("#fff1d0", 0.08, 3.2);
  const z = hq.z1;
  box(geo, steel, -6, 3.7, z, 6, 4.0, z + 5);
  box(geo, lampM, -5.6, 3.65, z + 0.3, 5.6, 3.7, z + 4.7);
  for (const x of [-5.5, 5.5]) (box(geo, steel, x - 0.15, 0, z + 4.6, x + 0.15, 3.7, z + 4.9), ph.sized(x, 1.85, z + 4.75, 0.3, 3.7, 0.3, "bldg"));
  for (const x of [-18, -11, 11, 18]) {
    box(geo, stone, x - 1.2, 0, z + 3, x + 1.2, 0.6, z + 5.4);
    ph.sized(x, 0.3, z + 4.2, 2.4, 0.6, 2.4, "bldg");
    plant(x < 0 ? "birch" : "maple", x, z + 4.2, 0.45);
  }
  for (const [i, x] of [-23, -21, -19].entries()) {
    const g = new THREE.CylinderGeometry(0.06, 0.06, 8, 8);
    g.translate(x, 4, z + 6);
    put(geo, steel, g);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1), plain(["#16a34a", "#facc15", "#dc2626"][i]!, { rough: 0.9 }));
    f.position.set(x + 0.95, 7.3, z + 6);
    group.add(f);
  }
  for (const [m, list] of geo) {
    const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = m !== lampM;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

export function buildCampus(ph: Physics, interacts: Interact[], detail: number) {
  const group = new THREE.Group();
  group.name = "campus";
  const geo: Geo = new Map();
  const solid = (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => ph.sized((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), "bldg");
  const asphalt = surface("asphalt", { tint: "#6f6f6f" });
  const paving = surface("tiles", { tint: "#d9d4ca" });
  const stone = surface("stone", { tint: "#e6e0d4" });
  const concrete = surface("concrete", { tint: "#b9b6b0" });
  const curtain = facade("glass", "#4f6476", 5, 3, FLOOR);
  const darkGlass = glass("#6f8aa0", 0.45, 0.04);
  const steel = plain("#3a4048", { rough: 0.35, metal: 0.85 });
  const white = plain("#f2f2ef", { rough: 0.5 });
  const wood = surface("wood", { tint: "#b07d4f" });
  const paint = roadPaint();
  const yellow = roadPaint("#e8c547");
  const lampM = lamp("#fff1d0", 0.08, 3.2);
  const flagCols = ["#16a34a", "#facc15", "#dc2626"];

  // ---- the ground: asphalt for the lots, paving for the forecourt and round the tower.
  const ground = (m: THREE.Material, x0: number, z0: number, x1: number, z1: number, y = 0.02) => {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
    put(geo, m, g);
  };
  ground(asphalt, -66, -252, -10, -152);
  ground(paving, 10, -252, 66, -150, 0.03);
  ground(asphalt, 68, -252, 108, -152);
  const line = (m: THREE.Material, ax: number, az: number, bx: number, bz: number, w = 0.12) => {
    const g = new THREE.PlaneGeometry(Math.max(w, Math.abs(bx - ax)), Math.max(w, Math.abs(bz - az)));
    g.rotateX(-Math.PI / 2);
    g.translate((ax + bx) / 2, 0.04, (az + bz) / 2);
    put(geo, m, g);
  };

  // ---- the podium: glass walls between stone piers, a deep entrance canopy on the forecourt, a door on the drive.
  const { x0, x1, z0, z1, h } = POD;
  const doorS: [number, number] = [32, 44];
  const doorW: [number, number] = [-224, -216];
  const pier = 0.8;
  const glassRun = (axis: "x" | "z", at: number, a: number, b: number, gap?: [number, number]) => {
    const seg = (p: number, q: number) => {
      if (q - p < 0.05) return;
      if (axis === "x") box(geo, darkGlass, p, 0.1, at - 0.05, q, h - 0.6, at + 0.05), solid(p, at - 0.2, q, at + 0.2, 0, h);
      else box(geo, darkGlass, at - 0.05, 0.1, p, at + 0.05, h - 0.6, q), solid(at - 0.2, p, at + 0.2, q, 0, h);
    };
    if (gap) (seg(a, gap[0]), seg(gap[1], b), axis === "x" ? box(geo, darkGlass, gap[0], 3.6, at - 0.05, gap[1], h - 0.6, at + 0.05) : box(geo, darkGlass, at - 0.05, 3.6, gap[0], at + 0.05, h - 0.6, gap[1]));
    else seg(a, b);
    for (let p = a; p <= b + 0.01; p += 6) axis === "x" ? box(geo, stone, p - pier / 2, 0, at - 0.45, p + pier / 2, h, at + 0.45) : box(geo, stone, at - 0.45, 0, p - pier / 2, at + 0.45, h, p + pier / 2);
  };
  glassRun("x", z1, x0, x1, doorS);
  glassRun("x", z0, x0, x1);
  glassRun("z", x0, z0, z1, doorW);
  glassRun("z", x1, z0, z1);
  // Floor, the mezzanine band, the podium roof (a garden terrace round the tower).
  box(geo, surface("tiles", { tint: "#ece8e0" }), x0, 0, z0, x1, 0.08, z1);
  box(geo, white, x0, 4.4, z0, x1, 4.7, z0 + 6);
  box(geo, concrete, x0 - 0.5, h - 0.6, z0 - 0.5, x1 + 0.5, h, z1 + 0.5);
  box(geo, stone, x0 - 0.6, h, z0 - 0.6, x1 + 0.6, h + 0.9, z0 - 0.2);
  box(geo, stone, x0 - 0.6, h, z1 + 0.2, x1 + 0.6, h + 0.9, z1 + 0.6);
  solid(x0, z0, x1, z1, h - 0.6, h);
  // The canopy over the main entrance, on two steel columns, with a lit soffit.
  box(geo, steel, doorS[0] - 4, 5.2, z1, doorS[1] + 4, 5.6, z1 + 9);
  box(geo, lampM, doorS[0] - 3.5, 5.15, z1 + 0.5, doorS[1] + 3.5, 5.2, z1 + 8.5);
  for (const x of [doorS[0] - 3, doorS[1] + 3]) (box(geo, steel, x - 0.2, 0, z1 + 8.2, x + 0.2, 5.2, z1 + 8.6), solid(x - 0.2, z1 + 8.2, x + 0.2, z1 + 8.6, 0, 5.2));
  // The lobby: reception desk, the logo wall, lounges, the elevator bank (the tower core), plants.
  box(geo, wood, 34, 0, -206, 42, 1.1, -204.6);
  box(geo, white, 33.8, 1.1, -206.2, 42.2, 1.2, -204.4);
  solid(34, -206, 42, -204.6, 0, 1.1);
  box(geo, wood, HQ_TOWER.x0 + 4, 0, HQ_TOWER.z1 - 0.4, HQ_TOWER.x1 - 4, 7.5, HQ_TOWER.z1);
  box(geo, concrete, HQ_TOWER.x0 + 8, 0, HQ_TOWER.z0 + 8, HQ_TOWER.x1 - 8, h - 0.6, HQ_TOWER.z1 - 0.4);
  solid(HQ_TOWER.x0 + 8, HQ_TOWER.z0 + 8, HQ_TOWER.x1 - 8, HQ_TOWER.z1 - 0.4, 0, h);
  for (const x of [HQ_TOWER.x0 + 10, HQ_TOWER.x0 + 14, HQ_TOWER.x1 - 14, HQ_TOWER.x1 - 10]) box(geo, steel, x - 1.1, 0.08, HQ_TOWER.z1 - 0.45, x + 1.1, 2.6, HQ_TOWER.z1 - 0.38);
  for (const [lx, lz] of [[20, -204], [56, -204], [20, -236], [56, -236]] as const) {
    box(geo, plain("#2f3a45", { rough: 0.8 }), lx - 2.2, 0.08, lz - 1, lx + 2.2, 0.5, lz + 1);
    box(geo, plain("#2f3a45", { rough: 0.8 }), lx - 2.2, 0.5, lz - 1, lx + 2.2, 1.0, lz - 0.6);
    solid(lx - 2.2, lz - 1, lx + 2.2, lz + 1, 0, 0.5);
  }
  const logo = signPlane("MYSEED", 12, 2.2, "#3a2a1a", "#f5e6c8");
  logo.position.set((HQ_TOWER.x0 + HQ_TOWER.x1) / 2, 5, HQ_TOWER.z1 + 0.02);
  group.add(logo);
  for (const [px, pz] of [[17, -199], [59, -199], [17, -243], [59, -243]] as const) plant("monstera", px, pz, 0.9);
  interacts.push({ id: "hq-reception", x: 38, y: 0, z: -202.5, r: 2.2, label: "Reception: welcome to Myseed HQ", kind: "book" });
  interacts.push({ id: "hq-skydeck-up", x: (HQ_TOWER.x0 + HQ_TOWER.x1) / 2, y: 0, z: HQ_TOWER.z1 + 2, r: 2.4, label: "Elevator to the sky deck (26th floor)", kind: "skydeck", data: { up: true } });

  // ---- the tower: curtain wall over the podium, a setback crown, a lit band, the sky deck with glass railings and
  // a helipad, the spire.
  const T = HQ_TOWER;
  const crown = POD.h + (STOREYS - 4) * FLOOR;
  box(geo, curtain, T.x0, POD.h, T.z0, T.x1, crown, T.z1);
  // Vertical fins on the faces (the mullions read from afar).
  for (let x = T.x0 + 1.5; x < T.x1; x += 3) for (const z of [T.z0 - 0.25, T.z1 + 0.25]) box(geo, steel, x - 0.12, POD.h, z - 0.12, x + 0.12, crown, z + 0.12);
  for (let z = T.z0 + 1.5; z < T.z1; z += 3) for (const x of [T.x0 - 0.25, T.x1 + 0.25]) box(geo, steel, x - 0.12, POD.h, z - 0.12, x + 0.12, crown, z + 0.12);
  const inset = 2.5;
  box(geo, curtain, T.x0 + inset, crown, T.z0 + inset, T.x1 - inset, SKY_DECK_Y - 0.3, T.z1 - inset);
  box(geo, lampM, T.x0 - 0.1, crown - 0.4, T.z0 - 0.1, T.x1 + 0.1, crown, T.z1 + 0.1);
  box(geo, concrete, T.x0 + inset - 0.3, SKY_DECK_Y - 0.3, T.z0 + inset - 0.3, T.x1 - inset + 0.3, SKY_DECK_Y, T.z1 - inset + 0.3);
  solid(T.x0, T.z0, T.x1, T.z1, POD.h, crown + 0.3);
  solid(T.x0 + inset, T.z0 + inset, T.x1 - inset, T.z1 - inset, crown, SKY_DECK_Y);
  // The crown's terrace (on the setback) is the sky deck: glass railings round the edge.
  box(geo, concrete, T.x0, crown, T.z0, T.x1, crown + 0.3, T.z1);
  for (const [a, b, c, d] of [[T.x0, T.z0, T.x1, T.z0 + 0.1], [T.x0, T.z1 - 0.1, T.x1, T.z1], [T.x0, T.z0, T.x0 + 0.1, T.z1], [T.x1 - 0.1, T.z0, T.x1, T.z1]] as const) {
    box(geo, glass("#c8dbe8", 0.3), a, crown + 0.3, b, c, crown + 1.5, d);
    box(geo, steel, a, crown + 1.5, b, c, crown + 1.58, d);
    solid(a, b, c, d, crown, crown + 1.6);
  }
  // Helipad on the top roof, the spire.
  const pad = new THREE.CircleGeometry(6, 32);
  pad.rotateX(-Math.PI / 2);
  pad.translate((T.x0 + T.x1) / 2, SKY_DECK_Y + 0.02, (T.z0 + T.z1) / 2);
  put(geo, plain("#2f3439", { rough: 0.8 }), pad);
  line(yellow, (T.x0 + T.x1) / 2 - 1.6, (T.z0 + T.z1) / 2 - 0.2, (T.x0 + T.x1) / 2 + 1.6, (T.z0 + T.z1) / 2 + 0.2, 0.4);
  for (const dx of [-1.6, 1.6]) {
    const g = new THREE.PlaneGeometry(0.4, 3.4);
    g.rotateX(-Math.PI / 2);
    g.translate((T.x0 + T.x1) / 2 + dx, SKY_DECK_Y + 0.05, (T.z0 + T.z1) / 2);
    put(geo, yellow, g);
  }
  cyl(geo, steel, T.x1 - inset - 2, SKY_DECK_Y, T.z0 + inset + 2, 0.35, 16, 8);
  cyl(geo, lamp("#ff3b30", 0.6, 4), T.x1 - inset - 2, SKY_DECK_Y + 16, T.z0 + inset + 2, 0.25, 0.5, 8);
  const name = signPlane("MYSEED", 16, 3, "#0b1220", "#e8f1ff");
  name.position.set((T.x0 + T.x1) / 2, crown - 3, T.z1 + 0.35);
  group.add(name);
  interacts.push({ id: "hq-skydeck-down", x: (T.x0 + T.x1) / 2, y: crown + 0.3, z: T.z1 - 1.5, r: 2.4, label: "Elevator down to the lobby", kind: "skydeck", data: { up: false } });

  // ---- the forecourt: a fountain, flags, the name in stone, benches, trees in planters.
  const fx = 38, fz = -176;
  const fountain = buildFountain(6.2);
  fountain.group.position.set(fx, 0, fz);
  group.add(fountain.group);
  ph.post({ x: fx, z: fz, r: 6.2, minY: 0, maxY: 0.7, tag: "bldg" } as never);
  for (let i = 0; i < 3; i++) {
    const x = 18 + i * 4;
    cyl(geo, steel, x, 0, -158, 0.08, 11, 8);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.5), plain(flagCols[i]!, { rough: 0.9, side: THREE.DoubleSide } as never));
    f.position.set(x + 1.25, 10, -158);
    f.userData.flag = true;
    group.add(f);
  }
  box(geo, stone, 26, 0, -156, 50, 1.3, -154);
  solid(26, -156, 50, -154, 0, 1.3);
  const carved = signPlane("MYSEED HQ", 22, 1.1, "#e6e0d4", "#1f2937");
  carved.position.set(38, 0.65, -153.95);
  group.add(carved);
  for (const [bx, bz] of [[24, -186], [52, -186], [24, -166], [52, -166]] as const) {
    box(geo, wood, bx - 1.2, 0.42, bz - 0.25, bx + 1.2, 0.5, bz + 0.25);
    box(geo, steel, bx - 1.1, 0, bz - 0.2, bx - 1, 0.42, bz + 0.2);
    box(geo, steel, bx + 1, 0, bz - 0.2, bx + 1.1, 0.42, bz + 0.2);
    interacts.push({ id: `hq-bench-${bx}-${bz}`, x: bx, y: 0, z: bz + 0.9, r: 1.2, label: "Sit down", kind: "sit", data: { x: bx, y: 0.05, z: bz + 0.1, ry: 0 } });
  }
  for (const [px, pz] of [[16, -192], [60, -192], [16, -160], [60, -160], [28, -192], [48, -192]] as const) {
    box(geo, stone, px - 1.3, 0, pz - 1.3, px + 1.3, 0.7, pz + 1.3);
    solid(px - 1.3, pz - 1.3, px + 1.3, pz + 1.3, 0, 0.7);
    plant(["maple", "birch", "acacia"][Math.abs(Math.round(px + pz)) % 3] as "maple", px, pz, 0.55);
  }

  // ---- the west lot: six rows of bays off three aisles, tree islands at the ends, lamp posts, a hedge along the
  // drive with two way-ins and a barrier gate.
  const rows: { x0: number; x1: number; face: 1 | -1 }[] = [
    { x0: -64, x1: -58.6, face: 1 },
    { x0: -51.6, x1: -46.2, face: -1 },
    { x0: -46.2, x1: -40.8, face: 1 },
    { x0: -33.8, x1: -28.4, face: -1 },
    { x0: -28.4, x1: -23, face: 1 },
    { x0: -16, x1: -10.6, face: -1 },
  ];
  const bayZ: number[] = [];
  for (let z = -246; z <= -160; z += 2.7) bayZ.push(z);
  for (const r of rows) {
    for (const z of bayZ) line(paint, r.x0, z, r.x1, z);
    line(paint, r.x0, bayZ[0]!, r.x0, bayZ[bayZ.length - 1]!);
  }
  // Islands with trees at the row ends and the middle.
  for (const r of rows)
    for (const z of [-250, -203, -156]) {
      box(geo, concrete, r.x0, 0, z - 1.4, r.x1, 0.18, z + 1.4);
      plant(z === -203 ? "maple" : "birch", (r.x0 + r.x1) / 2, z, 0.45);
    }
  // Lamp posts down the aisles.
  for (const ax of [-55.1, -37.3, -19.5])
    for (let z = -240; z <= -164; z += 19) {
      cyl(geo, steel, ax, 0, z, 0.1, 8, 8);
      box(geo, steel, ax - 1.3, 7.9, z - 0.15, ax + 1.3, 8.1, z + 0.15);
      for (const s of [-1, 1]) box(geo, lampM, ax + s * 1.1 - 0.35, 7.75, z - 0.2, ax + s * 1.1 + 0.35, 7.9, z + 0.2);
      ph.post({ x: ax, z, r: 0.15, minY: 0, maxY: 8, tag: "bldg" } as never);
    }
  // The hedge along the drive with way-ins at z -170 and -232; barrier at the first.
  for (const [a, b] of [[-252, -236], [-228, -174], [-166, -150]] as const) {
    box(geo, plain("#3f6b2e", { rough: 0.95 }), -10.2, 0, a, -9.6, 1.1, b);
    solid(-10.2, a, -9.6, b, 0, 1.1);
  }
  box(geo, white, -16, 0, -175, -13, 2.6, -172);
  box(geo, concrete, -16.2, 2.6, -175.2, -12.8, 2.8, -171.8);
  solid(-16, -175, -13, -172, 0, 2.6);
  box(geo, plain("#d32f2f", { rough: 0.5 }), -12.8, 1, -170.2, -10.4, 1.1, -170.0);
  const lotSign = signPlane("P  Myseed HQ parking", 6, 0.9, "#1e3a8a", "#ffffff");
  lotSign.position.set(-9.3, 2.4, -168);
  lotSign.rotation.y = Math.PI / 2;
  group.add(lotSign);
  cyl(geo, steel, -9.3, 0, -170.8, 0.06, 2.9, 6);
  cyl(geo, steel, -9.3, 0, -165.2, 0.06, 2.9, 6);

  // ---- the east side: a four-deck car park (open sides, columns, ramps' parapets) and a surface lot.
  const G = { x0: 70, x1: 106, z0: -250, z1: -208 };
  for (let d = 0; d < 4; d++) {
    const y = d * 3.2;
    box(geo, concrete, G.x0, y + 2.9, G.z0, G.x1, y + 3.2, G.z1);
    for (const [a, b, c, e] of [[G.x0, G.z0, G.x1, G.z0 + 0.25], [G.x0, G.z1 - 0.25, G.x1, G.z1], [G.x0, G.z0, G.x0 + 0.25, G.z1], [G.x1 - 0.25, G.z0, G.x1, G.z1]] as const) box(geo, concrete, a, y + 3.2, b, c, y + 4.2, e);
    for (let x = G.x0 + 0.4; x <= G.x1; x += 8.6) for (let z = G.z0 + 0.4; z <= G.z1; z += 10.3) box(geo, concrete, x - 0.3, y, z - 0.3, x + 0.3, y + 2.9, z + 0.3);
  }
  box(geo, surface("concrete", { tint: "#c9c6c0" }), G.x0 + 14, 0, G.z1 - 0.1, G.x0 + 22, 2.6, G.z1 + 0.1);
  solid(G.x0, G.z0, G.x1, G.z1, 0, 13.8);
  const gSign = signPlane("P  CAR PARK", 7, 1.2, "#1e3a8a", "#ffffff");
  gSign.position.set((G.x0 + G.x1) / 2, 11.6, G.z1 + 0.3);
  group.add(gSign);
  for (let x = 72; x <= 104; x += 2.7) (line(paint, x, -200, x, -194.6), line(paint, x, -168, x, -162.6));
  line(paint, 72, -194.6, 104.4, -194.6);
  line(paint, 72, -168, 104.4, -168);

  // ---- parked cars: fourteen in the lots (each car is many parts, so not every bay is full); the four nearest the
  // forecourt are real models, the rest drawn bodies.
  if (detail > 0) {
    const spots: [number, number, number, string, string, boolean][] = [
      [-13.3, -186.1, -1, "p930", "#111827", true],
      [-13.3, -194.2, -1, "m3e30", "#7f1d1d", true],
      [-13.3, -210.4, -1, "gclass", "#1f2937", true],
      [-25.7, -191.5, 1, "gt911", "#9ca3af", true],
      [-25.7, -218.5, 1, "fairheaven", "#e5e7eb", false],
      [-31.1, -183.4, -1, "ace", "#1e3a8a", false],
      [-31.1, -226.6, -1, "negotiator", "#065f46", false],
      [-43.5, -188.8, 1, "conquer", "#a16207", false],
      [-43.5, -237.4, 1, "punto", "#f8fafc", false],
      [-48.9, -172.6, -1, "bokaroo", "#334155", false],
      [-61.3, -199.6, 1, "asti", "#b91c1c", false],
      [-61.3, -229.3, 1, "taxi", "#facc15", false],
      [77.4, -197.3, -1, "fairheaven", "#1f2937", false],
      [88.2, -197.3, -1, "ace", "#e5e7eb", false],
    ];
    for (const [x, z, face, model, paint, real] of spots) {
      const v = anyVehicle(model, paint, undefined, real);
      v.group.position.set(x, 0, z);
      v.group.rotation.y = face > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(v.group);
      ph.sized(x, 0.8, z, 4.4, 1.6, 2, "bldg");
    }
  }

  // ---- merge by material.
  for (const [m, list] of geo) {
    const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(flat, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = m !== lampM;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // Flags wave a little.
  const flags = group.children.filter((c) => c.userData.flag);
  const update = (t: number) => {
    for (const [i, f] of flags.entries()) f.rotation.y = Math.sin(t * 2.2 + i) * 0.18;
    fountain.update(t);
  };
  return { group, update, crownY: crown + 0.3 };
}
