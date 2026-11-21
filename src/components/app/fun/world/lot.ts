import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Physics } from "./engine";
import { facade, plain, roadPaint, surface } from "./pbr";
import { signPlane } from "./toon";
import { plant } from "./nature";
import { anyVehicle } from "./cars";

// Myseed Studios, south of the ring road on Studio Boulevard: a walled film and TV lot like the big studio lots of
// real cities. A beige wall with a guarded gate; sound stages with curved roofs, painted numbers and giant doors;
// an office block; a water tower with the Myseed name; satellite dishes; a backlot street of colourful old-town
// fronts; rooftop air conditioners and ducts; lot roads with parking and parked cars; palms.

type Geo = Map<THREE.Material, THREE.BufferGeometry[]>;
const put = (geo: Geo, m: THREE.Material, g: THREE.BufferGeometry) => (geo.get(m) ?? geo.set(m, []).get(m)!).push(g);
const box = (geo: Geo, m: THREE.Material, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  put(geo, m, g);
};

// The lot's edges (the boulevard runs along x = 0 to the west).
export const LOT = { x0: 12, x1: 122, z0: 150, z1: 264 };

export function buildStudioLot(ph: Physics, detail: number) {
  const group = new THREE.Group();
  group.name = "studios";
  const geo: Geo = new Map();
  const stucco = surface("plaster", { tint: "#d9c9a6" });
  const stuccoDark = surface("plaster", { tint: "#b9a682" });
  const trim = plain("#efe6d2", { rough: 0.8 });
  const metalRoof = surface("factory", { tint: "#d4d4d0" });
  const flatRoof = surface("concrete", { tint: "#8d8b86" });
  const asphalt = surface("asphalt", { tint: "#7d7d7d" });
  const doorM = plain("#7c766b", { rough: 0.6, metal: 0.4 });
  const unitM = plain("#b9bdc1", { rough: 0.45, metal: 0.6 });
  const ductM = plain("#a7acb1", { rough: 0.35, metal: 0.8 });
  const white = plain("#f1f1ee", { rough: 0.4, metal: 0.2 });
  const paint = roadPaint();
  const solid = (x0: number, z0: number, x1: number, z1: number, h: number) => ph.sized((x0 + x1) / 2, h / 2, (z0 + z1) / 2, Math.abs(x1 - x0), h, Math.abs(z1 - z0), "bldg");
  const { x0, x1, z0, z1 } = LOT;

  // The lot's ground: asphalt roads and parking inside the wall.
  const ground = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  ground.rotateX(-Math.PI / 2);
  ground.translate((x0 + x1) / 2, 0.02, (z0 + z1) / 2);
  put(geo, asphalt, ground);

  // The wall: 3.2 m stucco with a cap, a gate on the boulevard with a guard booth and a barrier.
  const gate = [196, 206] as const;
  const wallRun = (ax: number, az: number, bx: number, bz: number) => {
    box(geo, stucco, Math.min(ax, bx) - 0.25, 0, Math.min(az, bz) - 0.25, Math.max(ax, bx) + 0.25, 3.2, Math.max(az, bz) + 0.25);
    box(geo, trim, Math.min(ax, bx) - 0.35, 3.2, Math.min(az, bz) - 0.35, Math.max(ax, bx) + 0.35, 3.4, Math.max(az, bz) + 0.35);
    // Pilasters every 6 m.
    const len = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= len; t += 6) {
      const px = ax + ((bx - ax) * t) / Math.max(len, 1), pz = az + ((bz - az) * t) / Math.max(len, 1);
      box(geo, stuccoDark, px - 0.4, 0, pz - 0.4, px + 0.4, 3.5, pz + 0.4);
    }
    solid(Math.min(ax, bx) - 0.25, Math.min(az, bz) - 0.25, Math.max(ax, bx) + 0.25, Math.max(az, bz) + 0.25, 3.4);
  };
  wallRun(x0, z0, x0, gate[0]);
  wallRun(x0, gate[1], x0, z1);
  wallRun(x0, z0, x1, z0);
  wallRun(x0, z1, x1, z1);
  wallRun(x1, z0, x1, z1);
  // The gate: a tiled canopy on two posts, the guard booth, the barrier arm.
  box(geo, stuccoDark, x0 - 1.6, 0, gate[0] - 0.6, x0 + 1.6, 4.4, gate[0]);
  box(geo, stuccoDark, x0 - 1.6, 0, gate[1], x0 + 1.6, 4.4, gate[1] + 0.6);
  box(geo, surface("clayroof", { tint: "#c96f4a" }), x0 - 2.2, 4.4, gate[0] - 1, x0 + 2.2, 4.9, gate[1] + 1);
  box(geo, stucco, x0 + 3, 0, gate[0] + 1, x0 + 6, 2.8, gate[0] + 3.5);
  box(geo, flatRoof, x0 + 2.8, 2.8, gate[0] + 0.8, x0 + 6.2, 3.0, gate[0] + 3.7);
  solid(x0 + 3, gate[0] + 1, x0 + 6, gate[0] + 3.5, 2.8);
  box(geo, plain("#e8e8e8", { rough: 0.5 }), x0 + 2.2, 1.0, gate[0] + 4, x0 + 2.4, 1.1, gate[1] - 0.6);
  box(geo, plain("#c62828", { rough: 0.5 }), x0 + 2.19, 1.0, gate[0] + 6, x0 + 2.41, 1.1, gate[0] + 7);
  const name = signPlane("MYSEED STUDIOS", 9, 1.3, "#2b2116", "#f3e3c3");
  name.position.set(x0 - 0.3, 5.6, (gate[0] + gate[1]) / 2);
  name.rotation.y = -Math.PI / 2;
  group.add(name);

  // Sound stages: big boxes with pilasters, curved metal roofs, giant doors and a painted number.
  const stage = (sx0: number, sz0: number, sx1: number, sz1: number, n: string) => {
    const h = 13;
    box(geo, facade("industrial", "#d6c7a3", 3, 8, 6.5), sx0, 0, sz0, sx1, h, sz1);
    for (let x = sx0; x <= sx1 + 0.01; x += 6) {
      box(geo, stuccoDark, x - 0.35, 0, sz0 - 0.35, x + 0.35, h + 0.2, sz0 + 0.1);
      box(geo, stuccoDark, x - 0.35, 0, sz1 - 0.1, x + 0.35, h + 0.2, sz1 + 0.35);
    }
    const w = sx1 - sx0, d = sz1 - sz0;
    const r = Math.max(w, d) * 0.62;
    const roof = new THREE.CylinderGeometry(r, r, w + 0.8, 24, 1, false, -0.45, 0.9);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 0.16, 1);
    roof.translate((sx0 + sx1) / 2, h - r * 0.16 * Math.cos(0.45) + 0.3, (sz0 + sz1) / 2);
    put(geo, metalRoof, roof);
    // The elephant doors on the lot road side and a personnel door.
    box(geo, doorM, sx0 + 3, 0.05, sz0 - 0.2, sx0 + 11, 9, sz0 - 0.05);
    box(geo, doorM, sx1 - 5, 0.05, sz0 - 0.2, sx1 - 3.8, 2.3, sz0 - 0.05);
    // Rooftop plant: air conditioners and a duct run.
    for (let i = 0; i < 3; i++) box(geo, unitM, sx0 + 4 + i * 8, h + 1.2, sz0 + 3, sx0 + 7 + i * 8, h + 3, sz0 + 6);
    const duct = new THREE.CylinderGeometry(0.55, 0.55, w - 6, 12);
    duct.rotateZ(Math.PI / 2);
    duct.translate((sx0 + sx1) / 2, h + 1.6, sz1 - 4);
    put(geo, ductM, duct);
    solid(sx0, sz0, sx1, sz1, h);
    // The number, big, on two walls.
    for (const [px, pz, ry] of [[(sx0 + sx1) / 2, sz0 - 0.4, Math.PI], [sx1 + 0.4, (sz0 + sz1) / 2, Math.PI / 2]] as const) {
      const s = signPlane(n, 3.2, 3.2, "#d6c7a3", "#2b2620");
      s.position.set(px, 9.5, pz);
      s.rotation.y = ry;
      group.add(s);
    }
  };
  stage(28, 160, 58, 182, "11");
  stage(66, 160, 96, 182, "12");
  stage(28, 190, 58, 212, "13");
  stage(66, 190, 96, 212, "14");
  stage(66, 222, 96, 244, "15");

  // Offices: four storeys of beige with a flat roof and rooftop units.
  box(geo, facade("office", "#d8cbb0", 5, 3.4, 3.6), 102, 0, 186, 118, 14.4, 214);
  box(geo, flatRoof, 101.6, 14.4, 185.6, 118.4, 14.9, 214.4);
  for (let i = 0; i < 4; i++) box(geo, unitM, 104 + (i % 2) * 7, 14.9, 189 + Math.floor(i / 2) * 12, 108 + (i % 2) * 7, 16.6, 194 + Math.floor(i / 2) * 12);
  solid(102, 186, 118, 214, 14.4);

  // The water tower: four legs with bracing, a tank and a cone, the Myseed name.
  const legM = plain("#d9d4c6", { rough: 0.6, metal: 0.3 });
  const tx = 108, tz = 170;
  for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) {
    const leg = new THREE.CylinderGeometry(0.22, 0.3, 18, 8);
    leg.translate(tx + lx, 9, tz + lz);
    put(geo, legM, leg);
  }
  for (let y = 4; y < 18; y += 4.5) {
    box(geo, legM, tx - 3, y, tz - 3.1, tx + 3, y + 0.18, tz - 2.9);
    box(geo, legM, tx - 3, y, tz + 2.9, tx + 3, y + 0.18, tz + 3.1);
    box(geo, legM, tx - 3.1, y, tz - 3, tx - 2.9, y + 0.18, tz + 3);
    box(geo, legM, tx + 2.9, y, tz - 3, tx + 3.1, y + 0.18, tz + 3);
  }
  const tank = new THREE.CylinderGeometry(4.2, 4.2, 6.5, 32);
  tank.translate(tx, 21.2, tz);
  put(geo, plain("#e6e0d0", { rough: 0.5, metal: 0.2 }), tank);
  const cone = new THREE.ConeGeometry(4.5, 2.6, 32);
  cone.translate(tx, 25.7, tz);
  put(geo, plain("#cfc8b6", { rough: 0.5, metal: 0.3 }), cone);
  solid(tx - 3.3, tz - 3.3, tx + 3.3, tz + 3.3, 18);
  const logo = signPlane("MYSEED", 4.6, 1.5, "#e6e0d0", "#5b3d1f");
  logo.position.set(tx - 4.25, 21.4, tz);
  logo.rotation.y = -Math.PI / 2;
  group.add(logo);

  // Satellite dishes on a fenced pad.
  const dishM = white;
  for (const [dx, dz, s] of [[104, 236, 3.2], [112, 246, 2.6], [104, 254, 3.6]] as const) {
    const pts = Array.from({ length: 12 }, (_, i) => new THREE.Vector2((i / 11) * s, ((i / 11) * s) ** 2 * (0.22 / s)));
    const dish = new THREE.LatheGeometry(pts, 28);
    dish.rotateX(-Math.PI / 2.6);
    dish.rotateY(-0.6);
    dish.translate(dx, s + 1.2, dz);
    put(geo, dishM, dish);
    const post = new THREE.CylinderGeometry(0.25, 0.4, s + 1.2, 10);
    post.translate(dx, (s + 1.2) / 2, dz);
    put(geo, plain("#9fa4a9", { rough: 0.5, metal: 0.6 }), post);
    ph.post({ x: dx, z: dz, r: 0.6, minY: 0, maxY: s + 2 });
  }

  // The backlot: a street of old-town fronts in warm colours with tiled roofs.
  const fronts = ["#d9a066", "#7fae6a", "#e6c35c", "#c27ba0", "#8fb4d9", "#d97a5a"];
  const tile = surface("clayroof", { tint: "#d4875c" });
  for (let i = 0; i < 6; i++) {
    const bx0 = 26 + i * 6, h = 9 + (i % 3) * 3;
    box(geo, facade("classic", fronts[i]!, i + 1, 3, 3), bx0, 0, 226, bx0 + 5.6, h, 240);
    box(geo, tile, bx0 - 0.2, h, 225.6, bx0 + 5.8, h + 0.7, 240.4);
    box(geo, plain(fronts[(i + 2) % 6]!, { rough: 0.8 }), bx0 + 0.4, 3.1, 240, bx0 + 5.2, 3.3, 241.4);
    solid(bx0, 226, bx0 + 5.6, 240, h);
  }
  for (let i = 0; i < 6; i++) {
    const bx0 = 26 + i * 6, h = 10 + ((i + 1) % 3) * 3;
    box(geo, facade("classic", fronts[(i + 3) % 6]!, i + 2, 3, 3), bx0, 0, 248, bx0 + 5.6, h, 260);
    box(geo, tile, bx0 - 0.2, h, 247.6, bx0 + 5.8, h + 0.7, 260.4);
    solid(bx0, 248, bx0 + 5.6, 260, h);
  }

  // Lot roads: lane lines and parking bays.
  const line = (ax: number, az: number, bx: number, bz: number, w = 0.15) => {
    const g = new THREE.PlaneGeometry(Math.max(w, Math.abs(bx - ax)), Math.max(w, Math.abs(bz - az)));
    g.rotateX(-Math.PI / 2);
    g.translate((ax + bx) / 2, 0.035, (az + bz) / 2);
    put(geo, paint, g);
  };
  line(18, 186, 118, 186);
  line(62, 154, 62, 218);
  for (let x = 20; x <= 100; x += 3) line(x, 153, x, 157.5, 0.12);
  // Palms along the lot's main road and by the gate.
  for (let x = 20; x <= 100; x += 12) plant(x % 24 === 20 ? "datepalm" : "coconut", x, 216.5, ((x * 7) % 10) / 10);
  for (const z of [188, 214]) plant("curlypalm", 16, z, 0.6);
  // Parked cars in the bays.
  if (detail > 0) {
    const models = ["fairheaven", "ace", "negotiator", "conquer", "bokaroo", "asti", "taxi"];
    const colors = ["#e5e7eb", "#1f2937", "#7f1d1d", "#1e3a8a", "#065f46", "#a16207", "#facc15"];
    for (let i = 0; i < 7; i++) {
      const x = 21.5 + i * 9;
      const v = anyVehicle(models[i]!, colors[i]!, undefined, true);
      v.group.position.set(x, 0, 155.5);
      v.group.rotation.y = Math.PI;
      group.add(v.group);
      ph.sized(x, 0.8, 155.5, 2, 1.6, 4.6, "bldg");
    }
  }

  // Merge by material: a few dozen draw calls for the whole lot.
  for (const [m, list] of geo) {
    const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
    for (const g of flat) for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
    const merged = mergeGeometries(flat, false);
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}
