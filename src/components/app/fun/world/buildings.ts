import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Physics } from "./engine";
import { facade, glass, lamp, plain, surface, type FacadeStyle } from "./pbr";
import { signPlane } from "./toon";

// The districts around the old town: downtown towers to the north-east (offices, glass towers and brick blocks
// with shops on the ground floor, setbacks, roof parapets and rooftop plant), civic and apartment blocks to the
// north-west (balconies), an industrial yard to the south-east (warehouses, roll-up doors, containers, a fence)
// and a wood to the south-west. Each building is solid; their windows light up at night.

type Geo = Map<THREE.Material, THREE.BufferGeometry[]>;
const put = (geo: Geo, m: THREE.Material, g: THREE.BufferGeometry) => (geo.get(m) ?? geo.set(m, []).get(m)!).push(g);
const B = (geo: Geo, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  put(geo, m, g);
};

let seedN = 7;
const rnd = () => ((seedN = (seedN * 16807) % 2147483647) / 2147483647);

const WALLS: Record<FacadeStyle, string[]> = {
  office: ["#d9d4c9", "#c7c2b8", "#e3ded3", "#b9b4aa"],
  glass: ["#5d6b78", "#4a5866", "#6d7d8c", "#55636f"],
  brick: ["#8e4a3a", "#9b5a44", "#7d4434", "#a0614a"],
  classic: ["#e6dccb", "#d9cdb8", "#efe6d6", "#cfc3ae"],
  apartment: ["#d8cbb8", "#c9d1d3", "#e2d6c2", "#bfc7c9"],
  shop: ["#dcd3c4"],
  industrial: ["#8b9399", "#9aa1a6", "#7f878d"],
  house: ["#ece5d8"],
};

export function buildDistricts(ph: Physics, opts: { detail: number }) {
  const group = new THREE.Group();
  group.name = "districts";
  const geo: Geo = new Map();
  const roofM = surface("concrete", { tint: "#9c9a95" });
  const parapetM = surface("concrete", { tint: "#c8c4bc" });
  const unitM = plain("#a3a8ad", { rough: 0.5, metal: 0.6 });
  const darkM = plain("#2a2e33", { rough: 0.6, metal: 0.4 });
  const signs: THREE.Object3D[] = [];
  const store = facade("shop", "#3a3f45", 3, 5, 4.6);

  // A building on a lot: a ground floor with shop fronts (or a lobby), storeys above in its style, maybe a
  // setback tier, a roof with a parapet and rooftop plant.
  const tower = (x0: number, z0: number, x1: number, z1: number, floors: number, style: FacadeStyle, shops: string[] = []) => {
    const wall = WALLS[style][Math.floor(rnd() * WALLS[style].length)]!;
    const fm = facade(style, wall, Math.floor(rnd() * 4) + 1, style === "glass" ? 3 : 4, 3.5);
    const ground = 4.6;
    // Ground floor: shop glass and a band over it.
    B(geo, shops.length ? store : fm, x0, 0, z0, x1, ground, z1);
    B(geo, parapetM, x0 - 0.15, ground - 0.2, z0 - 0.15, x1 + 0.15, ground + 0.25, z1 + 0.15);
    let top = ground + floors * 3.5;
    const tier = floors > 9 && rnd() > 0.35;
    const lower = tier ? ground + Math.round(floors * 0.6) * 3.5 : top;
    B(geo, fm, x0, ground + 0.25, z0, x1, lower, z1);
    let rx0 = x0, rz0 = z0, rx1 = x1, rz1 = z1;
    if (tier) {
      const inset = Math.min(x1 - x0, z1 - z0) * 0.18;
      B(geo, roofM, x0, lower, z0, x1, lower + 0.3, z1);
      rx0 = x0 + inset;
      rz0 = z0 + inset;
      rx1 = x1 - inset;
      rz1 = z1 - inset;
      B(geo, fm, rx0, lower + 0.3, rz0, rx1, top, rz1);
    } else top = lower;
    // Roof: slab, parapet, plant and a stair house.
    B(geo, roofM, rx0, top, rz0, rx1, top + 0.3, rz1);
    for (const [a, b, c, d] of [[rx0, rz0, rx1, rz0 + 0.3], [rx0, rz1 - 0.3, rx1, rz1], [rx0, rz0, rx0 + 0.3, rz1], [rx1 - 0.3, rz0, rx1, rz1]] as const) B(geo, parapetM, a, top + 0.3, b, c, top + 1.3, d);
    if (opts.detail > 0) {
      const n = 2 + Math.floor(rnd() * 4);
      for (let i = 0; i < n; i++) {
        const ux = rx0 + 2 + rnd() * (rx1 - rx0 - 5), uz = rz0 + 2 + rnd() * (rz1 - rz0 - 5);
        B(geo, unitM, ux, top + 0.3, uz, ux + 1.6 + rnd(), top + 1.6, uz + 1.2 + rnd());
      }
      B(geo, darkM, rx0 + 1.5, top + 0.3, rz1 - 4.5, rx0 + 4.5, top + 3.2, rz1 - 1.5);
      if (floors > 14) B(geo, darkM, (rx0 + rx1) / 2 - 0.1, top + 0.3, (rz0 + rz1) / 2 - 0.1, (rx0 + rx1) / 2 + 0.1, top + 8, (rz0 + rz1) / 2 + 0.1);
    }
    ph.sized((x0 + x1) / 2, (lower + 0.3) / 2, (z0 + z1) / 2, x1 - x0, lower + 0.3, z1 - z0, "bldg");
    if (tier) ph.sized((rx0 + rx1) / 2, (lower + top) / 2, (rz0 + rz1) / 2, rx1 - rx0, top - lower + 0.3, rz1 - rz0, "bldg");
    // Shop names over the windows on the street sides, with awnings.
    shops.forEach((name, i) => {
      const side = i % 4;
      const along = (side < 2 ? x1 - x0 : z1 - z0) - 2;
      const w = Math.min(7, along);
      const s = signPlane(name, w, 0.9, ["#14213d", "#5a1e1e", "#1e4d2b", "#3d2a5a", "#5a3d1e"][(i + Math.floor(rnd() * 5)) % 5], "#f5f0e6");
      const awn = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 1.4), plain(["#7a1f1f", "#1f3a7a", "#2f5d2f", "#6b4b1f"][i % 4]!, { rough: 0.8 }));
      const y = ground - 0.75;
      if (side === 0) s.position.set((x0 + x1) / 2, y, z1 + 0.06), awn.position.set((x0 + x1) / 2, y - 0.75, z1 + 0.7);
      if (side === 1) s.position.set((x0 + x1) / 2, y, z0 - 0.06), (s.rotation.y = Math.PI), awn.position.set((x0 + x1) / 2, y - 0.75, z0 - 0.7);
      if (side === 2) s.position.set(x1 + 0.06, y, (z0 + z1) / 2), (s.rotation.y = Math.PI / 2), awn.position.set(x1 + 0.7, y - 0.75, (z0 + z1) / 2), (awn.rotation.y = Math.PI / 2);
      if (side === 3) s.position.set(x0 - 0.06, y, (z0 + z1) / 2), (s.rotation.y = -Math.PI / 2), awn.position.set(x0 - 0.7, y - 0.75, (z0 + z1) / 2), (awn.rotation.y = Math.PI / 2);
      awn.rotation.x = side === 0 ? 0.2 : side === 1 ? -0.2 : 0;
      awn.castShadow = true;
      signs.push(s, awn);
    });
  };

  // Apartments with balconies on the long sides.
  const apartments = (x0: number, z0: number, x1: number, z1: number, floors: number) => {
    const wall = WALLS.apartment[Math.floor(rnd() * 4)]!;
    const fm = facade("apartment", wall, Math.floor(rnd() * 4) + 1, 4, 3.2);
    const top = floors * 3.2;
    B(geo, fm, x0, 0, z0, x1, top, z1);
    B(geo, roofM, x0 - 0.3, top, z0 - 0.3, x1 + 0.3, top + 0.4, z1 + 0.3);
    const slab = plain("#d9d6cf", { rough: 0.8 });
    const rail = glass("#b8c9d4", 0.35);
    for (let f = 1; f < floors; f++)
      for (let x = x0 + 2; x < x1 - 3; x += 4)
        for (const [z, d] of [[z1, 1], [z0, -1]] as const) {
          B(geo, slab, x, f * 3.2 - 0.1, z, x + 2.6, f * 3.2 + 0.08, z + d * 1.2);
          B(geo, rail, x, f * 3.2 + 0.08, z + d * 1.15, x + 2.6, f * 3.2 + 1.05, z + d * 1.2);
        }
    ph.sized((x0 + x1) / 2, top / 2, (z0 + z1) / 2, x1 - x0, top, z1 - z0, "bldg");
  };

  // ---------------------------------------------------------------- downtown (north-east)
  seedN = 11;
  const shopNames = ["Habesha Coffee", "Seed Books", "Addis Bakery", "Fresh Market", "Pharmacy", "Tech Corner", "Bank of Seed", "Sport House", "Juice Bar", "Optics", "Barber", "Cinema"];
  let si = 0;
  const nextShops = (n: number) => Array.from({ length: n }, () => shopNames[si++ % shopNames.length]!);
  tower(31, -77, 53, -49, 8, "office", nextShops(2));
  tower(71, -77, 93, -64, 14, "glass", nextShops(1));
  tower(71, -62, 93, -49, 6, "brick", nextShops(2));
  tower(111, -77, 125, -49, 18, "glass", nextShops(1));
  tower(11, -125, 31, -95, 11, "office", nextShops(2));
  tower(33, -125, 53, -95, 22, "glass", []);
  tower(71, -125, 93, -95, 16, "office", nextShops(2));
  tower(111, -125, 125, -110, 9, "brick", nextShops(1));
  tower(111, -108, 125, -95, 12, "classic", nextShops(1));
  // ---------------------------------------------------------------- civic quarter and apartments (north-west)
  seedN = 23;
  apartments(-125, -77, -96, -63, 7);
  apartments(-125, -60, -96, -48, 5);
  tower(-80, -77, -66, -48, 6, "classic", nextShops(1));
  apartments(-125, -125, -96, -112, 9);
  apartments(-125, -108, -96, -95, 6);
  tower(-80, -125, -50, -96, 10, "brick", nextShops(2));
  tower(-46, -125, -11, -96, 13, "office", nextShops(2));
  // ---------------------------------------------------------------- the industrial yard (south-east)
  const steel = surface("factory", { tint: "#ffffff" });
  const ind = facade("industrial", "#8d959b", 2, 6, 5);
  const door = plain("#5e666d", { rough: 0.5, metal: 0.7 });
  for (const [z0, z1] of [[34, 58], [66, 90], [98, 122]] as const) {
    B(geo, ind, 103, 0, z0, 124, 9, z1);
    // A shallow pitched roof.
    const roof = new THREE.CylinderGeometry(13.5, 13.5, z1 - z0 + 0.6, 3, 1, false, -Math.PI / 6, Math.PI / 3);
    roof.rotateX(Math.PI / 2);
    roof.scale(1, 0.18, 1);
    roof.translate(113.5, 9 - 13.5 * 0.18 * 0.5, (z0 + z1) / 2);
    put(geo, steel, roof);
    for (let z = z0 + 3; z < z1 - 4; z += 7) B(geo, door, 102.85, 0.2, z, 103.05, 4.8, z + 4.5);
    ph.sized(113.5, 5, (z0 + z1) / 2, 21, 10, z1 - z0, "bldg");
  }
  // Containers stacked in the yard.
  const boxC = ["#a3362a", "#2a5aa3", "#d08a1c", "#2f7a4a", "#7a7f85"].map((c) => plain(c, { rough: 0.55, metal: 0.4 }));
  for (let i = 0; i < 10; i++) {
    const x = 128 - (i % 2) * 2.6, z = 36 + Math.floor(i / 2) * 18 + (i % 3);
    const h = i % 3 === 0 ? 5.2 : 2.6;
    B(geo, boxC[i % boxC.length]!, x - 1.2, 0, z, x + 1.2, 2.6, z + 6);
    if (h > 3) B(geo, boxC[(i + 2) % boxC.length]!, x - 1.2, 2.6, z + 0.2, x + 1.2, 5.2, z + 6.2);
    ph.sized(x, h / 2, z + 3, 2.4, h, 6, "bldg");
  }
  // A chain-link fence round the yard (posts and mesh), with a gate on East Homes Road.
  const fence = new THREE.MeshStandardMaterial({ color: "#8a9096", metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
  for (const [ax, az, bx, bz] of [[101.5, 30, 101.5, 60], [101.5, 68, 101.5, 126], [101.5, 126, 126, 126]] as const) {
    const len = Math.hypot(bx - ax, bz - az);
    const pl = new THREE.PlaneGeometry(len, 2.4);
    if (ax === bx) pl.rotateY(Math.PI / 2);
    pl.translate((ax + bx) / 2, 1.2, (az + bz) / 2);
    put(geo, fence, pl);
    for (let t = 0; t <= len; t += 3) {
      const px = ax + ((bx - ax) * t) / len, pz = az + ((bz - az) * t) / len;
      const p = new THREE.CylinderGeometry(0.04, 0.04, 2.5, 6);
      p.translate(px, 1.25, pz);
      put(geo, unitM, p);
    }
    ph.sized((ax + bx) / 2, 1.2, (az + bz) / 2, Math.max(0.2, Math.abs(bx - ax)), 2.4, Math.max(0.2, Math.abs(bz - az)), "bldg");
  }
  const yard = surface("concrete", { tint: "#b5b2ab" });
  const yg = new THREE.PlaneGeometry(24, 96);
  yg.rotateX(-Math.PI / 2);
  yg.translate(114, 0.008, 78);
  put(geo, yard, yg);

  // ---------------------------------------------------------------- the wood (south-west)
  const bark = plain("#4a3a2c", { rough: 0.95 });
  const leaves = [plain("#365e27", { rough: 0.85 }), plain("#4a7431", { rough: 0.85 }), plain("#2f5222", { rough: 0.85 })];
  seedN = 5;
  for (let i = 0; i < (opts.detail > 0 ? 60 : 25); i++) {
    const x = -124 + rnd() * 24, z = 82 + rnd() * 44;
    const h = 4 + rnd() * 4;
    const t = new THREE.CylinderGeometry(0.14, 0.24, h, 7);
    t.translate(x, h / 2, z);
    put(geo, bark, t);
    const conifer = rnd() > 0.5;
    if (conifer)
      for (let k = 0; k < 3; k++) {
        const c = new THREE.ConeGeometry(2.2 - k * 0.55, 2.6, 9);
        c.translate(x, h - 0.6 + k * 1.3, z);
        put(geo, leaves[k % 3]!, c);
      }
    else
      for (let k = 0; k < 5; k++) {
        const s = new THREE.IcosahedronGeometry(1.2 + rnd() * 0.8, 1);
        s.translate(x + (rnd() - 0.5) * 2, h + rnd() * 1.4, z + (rnd() - 0.5) * 2);
        put(geo, leaves[k % 3]!, s);
      }
    ph.post({ x, z, r: 0.3, minY: 0, maxY: h });
  }

  for (const [m, raw] of geo) {
    const list = raw.map((g) => (g.index ? g.toNonIndexed() : g));
    raw.forEach((g, i) => g !== list[i] && g.dispose());
    for (let i = 0; i < list.length; i += 300) {
      const merged = mergeGeometries(list.slice(i, i + 300), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    list.forEach((g) => g.dispose());
  }
  for (const s of signs) group.add(s);
  // Rooftop warning lights on the tall towers (they blink at night).
  const red = lamp("#ff2a2a", 0, 5);
  for (const [x, z, h] of [[43, -110, 4.6 + 22 * 3.5 + 8], [118, -63, 4.6 + 18 * 3.5], [82, -110, 4.6 + 16 * 3.5]] as const) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), red);
    m.position.set(x, h, z);
    group.add(m);
  }
  return { group };
}
