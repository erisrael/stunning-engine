import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { carPaint, glass, lamp, plain } from "./pbr";
import { vehicle } from "./models";

// Cars as they look in the street: bodies drawn from real proportions (a side profile with rounded edges, glass
// cabin, roof, bumpers, grille, lights, mirrors, wheel arches, an interior with seats, dashboard and steering wheel,
// and wheels with tyres, rims, brake discs and callipers), in car paint with a clear coat; plus licensed 3D models
// (see the asset manifest) that replace the drawn body when loaded. Each car has its own driving numbers (SPECS).

export type CarSpec = {
  label: string;
  real?: string; // where real-world numbers come from (a real car); otherwise they are the game's own
  mass: number; // kg
  power: number; // kW at the peak
  torque: number; // N·m peak
  redline: number; // rpm
  gears: number[];
  final: number;
  drive: "rwd" | "fwd" | "awd";
  grip: number; // tyre friction coefficient on dry asphalt
  wheelbase: number;
  cg: number; // centre of gravity height (m), more roll and weight transfer when high
  drag: number; // 0.5·Cd·A·rho
  downforce: number; // N per (m/s)² over the car
  brake: number; // N of braking force per 1000 kg
  steer: number; // max steering angle (rad)
  wheelR: number;
  topKmh: number; // for the dealer and the garage (computed from power and drag in the game)
};

export const SPECS: Record<string, CarSpec> = {
  hatch: { label: "Seed Volt hatchback", mass: 1150, power: 92, torque: 200, redline: 6500, gears: [3.45, 1.95, 1.36, 1.03, 0.82], final: 4.06, drive: "fwd", grip: 1.0, wheelbase: 2.55, cg: 0.55, drag: 0.36, downforce: 0, brake: 9000, steer: 0.62, wheelR: 0.31, topKmh: 185 },
  sedan: { label: "Seed Aurora sedan", mass: 1480, power: 150, torque: 320, redline: 6800, gears: [3.6, 2.1, 1.45, 1.1, 0.86, 0.69], final: 3.5, drive: "rwd", grip: 1.02, wheelbase: 2.85, cg: 0.52, drag: 0.32, downforce: 0.2, brake: 9500, steer: 0.58, wheelR: 0.33, topKmh: 225 },
  jeep: { label: "Seed Ranger 4x4", mass: 1950, power: 165, torque: 420, redline: 5600, gears: [4.1, 2.4, 1.5, 1.1, 0.88], final: 3.9, drive: "awd", grip: 0.95, wheelbase: 2.5, cg: 0.82, drag: 0.5, downforce: 0, brake: 8500, steer: 0.6, wheelR: 0.39, topKmh: 175 },
  suv: { label: "Seed Atlas SUV", mass: 2150, power: 230, torque: 480, redline: 6200, gears: [4.7, 3.1, 2.1, 1.67, 1.29, 1.0, 0.84, 0.67], final: 3.2, drive: "awd", grip: 0.98, wheelbase: 2.95, cg: 0.75, drag: 0.42, downforce: 0, brake: 9000, steer: 0.58, wheelR: 0.38, topKmh: 230 },
  pickup: { label: "Seed Ridge pickup", mass: 2050, power: 190, torque: 450, redline: 5800, gears: [4.2, 2.6, 1.6, 1.15, 0.9, 0.72], final: 3.7, drive: "rwd", grip: 0.95, wheelbase: 3.3, cg: 0.8, drag: 0.48, downforce: 0, brake: 8500, steer: 0.55, wheelR: 0.39, topKmh: 190 },
  sports: { label: "Seed Comet coupe", mass: 1420, power: 300, torque: 520, redline: 7400, gears: [3.4, 2.2, 1.6, 1.24, 1.0, 0.83, 0.69], final: 3.3, drive: "rwd", grip: 1.1, wheelbase: 2.55, cg: 0.46, drag: 0.3, downforce: 0.6, brake: 11000, steer: 0.55, wheelR: 0.34, topKmh: 280 },
  gt911: { label: "Porsche 911 Carrera 4S", real: "Porsche 911 Carrera 4S (992): 331 kW (450 PS), 530 N·m, 8-speed PDK, all-wheel drive, 1,565 kg, 306 km/h (manufacturer data)", mass: 1565, power: 331, torque: 530, redline: 7500, gears: [4.89, 3.17, 2.15, 1.56, 1.18, 0.94, 0.76, 0.61], final: 3.44, drive: "awd", grip: 1.15, wheelbase: 2.45, cg: 0.44, drag: 0.3, downforce: 0.8, brake: 12500, steer: 0.55, wheelR: 0.34, topKmh: 306 },
  concept: { label: "Darmstadt Concept", mass: 1300, power: 260, torque: 450, redline: 8000, gears: [3.2, 2.2, 1.65, 1.3, 1.05, 0.86], final: 3.6, drive: "rwd", grip: 1.12, wheelbase: 2.6, cg: 0.45, drag: 0.29, downforce: 0.9, brake: 12000, steer: 0.56, wheelR: 0.36, topKmh: 290 },
  supercar: { label: "Vortex V12", mass: 1450, power: 560, torque: 720, redline: 8700, gears: [3.1, 2.15, 1.65, 1.32, 1.08, 0.9, 0.76], final: 3.4, drive: "rwd", grip: 1.2, wheelbase: 2.65, cg: 0.42, drag: 0.29, downforce: 1.6, brake: 14000, steer: 0.52, wheelR: 0.35, topKmh: 340 },
  f2: { label: "Seed F2 (Formula 2 style)", mass: 795, power: 455, torque: 520, redline: 10000, gears: [3.2, 2.45, 1.95, 1.6, 1.35, 1.15], final: 3.0, drive: "rwd", grip: 1.5, wheelbase: 3.1, cg: 0.28, drag: 0.55, downforce: 3.6, brake: 22000, steer: 0.4, wheelR: 0.34, topKmh: 320 },
  van: { label: "Seed Courier van", mass: 2300, power: 120, torque: 340, redline: 4800, gears: [4.0, 2.3, 1.5, 1.0, 0.8], final: 4.2, drive: "fwd", grip: 0.92, wheelbase: 3.4, cg: 0.95, drag: 0.6, downforce: 0, brake: 8000, steer: 0.55, wheelR: 0.36, topKmh: 160 },
  bus: { label: "Seed City bus", mass: 12000, power: 220, torque: 1200, redline: 2600, gears: [3.4, 1.9, 1.4, 1.0, 0.75], final: 5.5, drive: "rwd", grip: 0.9, wheelbase: 6.0, cg: 1.2, drag: 2.2, downforce: 0, brake: 7000, steer: 0.5, wheelR: 0.5, topKmh: 90 },
};

// The procedural shapes, by body style (metres).
type Body = { L: number; W: number; clear: number; belt: number; roof: number; hood: number; trunk: number; ws: number; rear: number; wheelR: number; wb: number; nose: number };
const BODIES: Record<string, Body> = {
  hatch: { L: 4.05, W: 1.78, clear: 0.16, belt: 0.92, roof: 1.48, hood: 0.95, trunk: 0.2, ws: 0.6, rear: 0.28, wheelR: 0.31, wb: 2.55, nose: 0.25 },
  sedan: { L: 4.75, W: 1.85, clear: 0.15, belt: 0.95, roof: 1.44, hood: 1.15, trunk: 0.85, ws: 0.65, rear: 0.55, wheelR: 0.33, wb: 2.85, nose: 0.25 },
  suv: { L: 4.85, W: 1.95, clear: 0.22, belt: 1.1, roof: 1.72, hood: 1.1, trunk: 0.18, ws: 0.6, rear: 0.25, wheelR: 0.38, wb: 2.95, nose: 0.15 },
  jeep: { L: 4.3, W: 1.9, clear: 0.28, belt: 1.12, roof: 1.85, hood: 1.0, trunk: 0.1, ws: 0.25, rear: 0.05, wheelR: 0.39, wb: 2.5, nose: 0.08 },
  pickup: { L: 5.35, W: 1.95, clear: 0.26, belt: 1.12, roof: 1.82, hood: 1.15, trunk: 1.75, ws: 0.5, rear: 0.12, wheelR: 0.39, wb: 3.3, nose: 0.12 },
  sports: { L: 4.5, W: 1.9, clear: 0.12, belt: 0.82, roof: 1.3, hood: 1.35, trunk: 0.7, ws: 0.85, rear: 0.8, wheelR: 0.34, wb: 2.55, nose: 0.3 },
  supercar: { L: 4.6, W: 2.0, clear: 0.1, belt: 0.72, roof: 1.15, hood: 1.25, trunk: 1.1, ws: 0.95, rear: 0.9, wheelR: 0.35, wb: 2.65, nose: 0.35 },
  van: { L: 5.4, W: 2.0, clear: 0.2, belt: 1.2, roof: 2.35, hood: 0.7, trunk: 0.05, ws: 0.5, rear: 0.02, wheelR: 0.36, wb: 3.4, nose: 0.15 },
  bus: { L: 11.5, W: 2.55, clear: 0.3, belt: 1.25, roof: 3.0, hood: 0.15, trunk: 0.05, ws: 0.15, rear: 0.02, wheelR: 0.5, wb: 6.0, nose: 0.05 },
};

// Which body each catalog model draws (models not listed keep their old shape: bikes, scooters, the cart).
export const CAR_BODY: Record<string, string> = { hatch: "hatch", sedan: "sedan", suv: "suv", jeep: "jeep", pickup: "pickup", sports: "sports", supercar: "supercar", van: "van", bus: "bus", gt911: "sports", concept: "sports", f2: "f2" };

export type CarRig = {
  group: THREE.Group;
  body: THREE.Group; // pitches and rolls on its springs
  wheels: { obj: THREE.Object3D; front: boolean; spin: THREE.Object3D }[];
  lights: THREE.Mesh[];
  brakeMat: THREE.MeshStandardMaterial | null;
  headMat: THREE.MeshStandardMaterial | null;
  len: number;
  r: number;
  seatY: number;
  spec: CarSpec | null;
  paint: (color: string, finish?: "gloss" | "metallic" | "matte" | "pearl") => void;
};

function roundedShape(pts: [number, number][], r: number) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i]!, a = pts[(i - 1 + n) % n]!, b = pts[(i + 1) % n]!;
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ra = Math.min(r, da / 2.2), rb = Math.min(r, db / 2.2);
    const p1 = [p[0] + ((a[0] - p[0]) / da) * ra, p[1] + ((a[1] - p[1]) / da) * ra];
    const p2 = [p[0] + ((b[0] - p[0]) / db) * rb, p[1] + ((b[1] - p[1]) / db) * rb];
    if (i === 0) s.moveTo(p1[0]!, p1[1]!);
    else s.lineTo(p1[0]!, p1[1]!);
    s.quadraticCurveTo(p[0], p[1], p2[0]!, p2[1]!);
  }
  s.closePath();
  return s;
}
// A side profile (u along the car, v up) extruded across its width, centred, car frame (x across, z forward).
function slab(pts: [number, number][], width: number, bevel: number, round = 0.12) {
  const g = new THREE.ExtrudeGeometry(roundedShape(pts, round), { depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate((width - bevel * 2) / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function wheel(r: number, w: number, rimColor: string, caliper: string) {
  const g = new THREE.Group();
  // Tyre: a lathe of a rounded rectangle, sidewalls a little lighter.
  const prof: THREE.Vector2[] = [];
  const t = r * 0.32;
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI;
    prof.push(new THREE.Vector2(r - t + Math.sin(a) * t, -w / 2 + (1 - Math.cos(a)) * (w / 2)));
  }
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), plain("#1a1b1d", { rough: 0.85 }));
  tyre.rotation.z = Math.PI / 2;
  g.add(tyre);
  const rimM = plain(rimColor, { rough: 0.25, metal: 0.9 });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 0.86, 24), rimM);
  rim.rotation.z = Math.PI / 2;
  g.add(rim);
  const spokes = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.035, r * 1.2, r * 0.13), rimM);
    s.rotation.x = (i / 5) * Math.PI * 2;
    s.position.x = w * 0.45;
    spokes.add(s);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.16, r * 0.16, 0.04, 12), rimM);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = w * 0.46;
  spokes.add(hub);
  g.add(spokes);
  // Brake disc and calliper (inside, does not spin).
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, 0.03, 20), plain("#6f7377", { rough: 0.4, metal: 0.9 }));
  disc.rotation.z = Math.PI / 2;
  disc.position.x = w * 0.2;
  g.add(disc);
  return { g, caliper: new THREE.Mesh(new THREE.BoxGeometry(0.06, r * 0.4, r * 0.25), plain(caliper, { rough: 0.4 })) };
}

// A drawn car of a body style, in its paint.
function drawnCar(style: string, paintColor: string, rimColor: string): CarRig {
  const B = BODIES[style] ?? BODIES.sedan!;
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  let paintM = carPaint(paintColor, "metallic");
  const trim = plain("#141517", { rough: 0.5, metal: 0.2 });
  const chrome = plain("#c9ced3", { rough: 0.15, metal: 1 });
  const glassM = glass("#1f2a33", 0.55, 0.02);
  const zR = -B.L / 2, zF = B.L / 2;
  const zA = zR + B.trunk, zB = zF - B.hood;
  // Lower body: bumper to bumper up to the belt line, hood sloping down to the nose.
  const lower: [number, number][] = [
    [zR, B.clear + 0.1],
    [zR + 0.05, B.belt - 0.08],
    [zA - 0.05, B.belt],
    [zB, B.belt],
    [zF - B.nose, B.belt - 0.14],
    [zF, B.belt - 0.32],
    [zF, B.clear + 0.12],
    [zF - 0.2, B.clear],
    [zR + 0.2, B.clear],
  ];
  const bodyMesh = new THREE.Mesh(slab(lower, B.W, 0.06, 0.18), paintM);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  body.add(bodyMesh);
  // The cabin: glass between the pillars, the roof on top (painted).
  const inset = 0.12;
  const cab: [number, number][] = [
    [zA + 0.02, B.belt - 0.02],
    [zA + B.rear, B.roof - 0.04],
    [zB - B.ws, B.roof - 0.04],
    [zB - 0.02, B.belt - 0.02],
  ];
  const cabin = new THREE.Mesh(slab(cab, B.W - inset * 2, 0.04, 0.08), glassM);
  body.add(cabin);
  const roofP: [number, number][] = [
    [zA + B.rear + 0.08, B.roof - 0.06],
    [zA + B.rear + 0.04, B.roof + 0.01],
    [zB - B.ws - 0.04, B.roof + 0.01],
    [zB - B.ws - 0.08, B.roof - 0.06],
  ];
  const roof = new THREE.Mesh(slab(roofP, B.W - inset * 2 + 0.04, 0.03, 0.04), paintM);
  roof.castShadow = true;
  body.add(roof);
  // Pillars (dark) at the windscreen.
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.06, Math.hypot(B.ws, B.roof - B.belt), 0.06), trim);
    p.position.set(s * (B.W / 2 - inset - 0.01), (B.belt + B.roof) / 2, zB - B.ws / 2);
    p.rotation.x = Math.atan2(B.ws, B.roof - B.belt);
    body.add(p);
  }
  // Bumpers, grille, lights, plates, mirrors, handles, wheel arches.
  const add = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z);
    body.add(o);
    return o;
  };
  add(trim, 0, B.clear + 0.14, zF - 0.02, B.W * 0.92, 0.16, 0.12);
  add(trim, 0, B.clear + 0.14, zR + 0.02, B.W * 0.92, 0.16, 0.12);
  add(trim, 0, B.belt - 0.42, zF + 0.005, B.W * 0.45, 0.16, 0.04);
  const headM = lamp("#f6f8ff", 0.25, 4);
  const tailM = lamp("#ff2020", 0.35, 2.5);
  const brakeM = new THREE.MeshStandardMaterial({ color: "#5a0000", emissive: new THREE.Color("#ff1010"), emissiveIntensity: 0.4 });
  const lights: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const h = add(headM, s * (B.W / 2 - 0.28), B.belt - 0.3, zF - 0.03, 0.38, 0.1, 0.06);
    h.userData.front = true;
    lights.push(h);
    const t = add(tailM, s * (B.W / 2 - 0.22), B.belt - 0.14, zR + 0.03, 0.34, 0.1, 0.05);
    lights.push(t);
    add(brakeM, s * (B.W / 2 - 0.22), B.belt - 0.26, zR + 0.035, 0.3, 0.05, 0.05);
    // Mirrors on the doors.
    add(paintM, s * (B.W / 2 + 0.08), B.belt + 0.12, zB - 0.25, 0.14, 0.1, 0.18);
    add(trim, s * (B.W / 2 + 0.02), B.belt + 0.12, zB - 0.25, 0.08, 0.06, 0.12);
    // Door handles and the door line.
    add(chrome, s * (B.W / 2 + 0.01), B.belt - 0.12, (zA + zB) / 2 - 0.1, 0.02, 0.03, 0.16);
    add(trim, s * (B.W / 2 + 0.002), (B.belt + B.clear) / 2, (zA + zB) / 2 + 0.2, 0.005, B.belt - B.clear - 0.25, 0.012);
  }
  add(plain("#f2f2f0", { rough: 0.5 }), 0, B.clear + 0.3, zR - 0.005, 0.52, 0.12, 0.01);
  // Interior seen through the glass: dashboard, seats, steering wheel.
  const inside = plain("#26272a", { rough: 0.85 });
  add(inside, 0, B.belt - 0.05, zB - 0.2, B.W - 0.4, 0.18, 0.4);
  for (const s of [-1, 1]) {
    add(inside, s * 0.42, B.belt - 0.15, (zA + zB) / 2 - 0.05, 0.5, 0.18, 0.5);
    const back = add(inside, s * 0.42, B.belt + 0.2, (zA + zB) / 2 - 0.32, 0.48, 0.6, 0.12);
    back.rotation.x = -0.18;
  }
  const sw = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 20), trim);
  sw.position.set(-0.42, B.belt + 0.12, zB - 0.5);
  sw.rotation.x = -0.4;
  body.add(sw);
  // Wheels with arches.
  const wheels: CarRig["wheels"] = [];
  for (const [front, z] of [[true, B.wb / 2], [false, -B.wb / 2]] as const)
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * (B.W / 2 - 0.16), B.wheelR, z);
      const wh = wheel(B.wheelR, 0.24, rimColor, front ? "#b3261e" : "#2a2a2a");
      const spin = new THREE.Group();
      spin.add(wh.g);
      if (s < 0) spin.rotation.y = Math.PI;
      pivot.add(spin);
      wh.caliper.position.set(s * -0.05, 0.05, B.wheelR * 0.3);
      pivot.add(wh.caliper);
      group.add(pivot);
      wheels.push({ obj: pivot, front, spin });
      add(trim, s * (B.W / 2 - 0.1), B.wheelR + 0.08, z, 0.18, B.wheelR * 0.8, B.wheelR * 2.15);
    }
  if (style === "pickup") {
    // The bed walls.
    add(paintM, 0, B.belt - 0.05, zR + 0.85, B.W - 0.1, 0.1, 1.6);
    for (const s of [-1, 1]) add(paintM, s * (B.W / 2 - 0.06), B.belt + 0.15, zR + 0.85, 0.08, 0.35, 1.6);
  }
  if (style === "sports" || style === "supercar") {
    // A rear wing.
    add(trim, 0, B.belt + 0.22, zR + 0.25, B.W * 0.86, 0.04, 0.3);
    for (const s of [-1, 1]) add(trim, s * B.W * 0.36, B.belt + 0.1, zR + 0.3, 0.04, 0.22, 0.12);
  }
  body.traverse((o) => ((o as THREE.Mesh).isMesh ? (((o as THREE.Mesh).castShadow = true), ((o as THREE.Mesh).receiveShadow = true)) : 0));
  const paint = (c: string, finish: "gloss" | "metallic" | "matte" | "pearl" = "metallic") => {
    const next = carPaint(c, finish);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === paintM) m.material = next;
    });
    paintM = next;
  };
  return { group, body, wheels, lights, brakeMat: brakeM, headMat: headM, len: B.L, r: B.W / 2, seatY: B.belt - 0.45, spec: null, paint };
}

// A Formula 2 style single-seater: nose and wings, monocoque with the halo, sidepods, engine cover and airbox,
// open wheels with wide tyres; a livery of two colours.
function formulaCar(paintColor: string, second = "#111318"): CarRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  let paintM = carPaint(paintColor, "gloss");
  const darkM = carPaint(second, "gloss");
  const carbon = plain("#1c1d20", { rough: 0.35, metal: 0.3 });
  const add = (m: THREE.Material, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const o = new THREE.Mesh(g, m);
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.castShadow = true;
    body.add(o);
    return o;
  };
  // Monocoque and nose: a tapered tube.
  const tub = new THREE.CylinderGeometry(0.32, 0.42, 2.2, 14);
  tub.rotateX(Math.PI / 2);
  tub.scale(1.1, 0.75, 1);
  add(paintM, tub, 0, 0.42, 0.2);
  const nose = new THREE.CylinderGeometry(0.08, 0.32, 1.7, 12);
  nose.rotateX(Math.PI / 2);
  nose.scale(1.2, 0.6, 1);
  add(paintM, nose, 0, 0.3, 2.1);
  // Front wing with endplates; rear wing with two elements.
  add(darkM, new THREE.BoxGeometry(1.95, 0.03, 0.45), 0, 0.12, 2.75);
  add(paintM, new THREE.BoxGeometry(1.9, 0.03, 0.2), 0, 0.2, 2.68, -0.25);
  for (const s of [-1, 1]) add(carbon, new THREE.BoxGeometry(0.02, 0.24, 0.5), s * 0.98, 0.2, 2.72);
  add(darkM, new THREE.BoxGeometry(1.1, 0.04, 0.32), 0, 0.92, -2.25, 0.12);
  add(paintM, new THREE.BoxGeometry(1.1, 0.03, 0.18), 0, 1.02, -2.32, 0.35);
  for (const s of [-1, 1]) add(carbon, new THREE.BoxGeometry(0.02, 0.5, 0.55), s * 0.56, 0.8, -2.25);
  // Sidepods, engine cover and airbox.
  for (const s of [-1, 1]) {
    const pod = new THREE.CylinderGeometry(0.22, 0.3, 1.6, 10);
    pod.rotateX(Math.PI / 2);
    pod.scale(1.3, 0.7, 1);
    add(paintM, pod, s * 0.55, 0.36, -0.3);
  }
  const cover = new THREE.CylinderGeometry(0.12, 0.38, 1.9, 12);
  cover.rotateX(-Math.PI / 2);
  cover.scale(1, 1.2, 1);
  add(darkM, cover, 0, 0.62, -1.15);
  add(paintM, new THREE.BoxGeometry(0.3, 0.32, 0.4), 0, 0.95, -0.35);
  // Cockpit, driver's helmet, the halo.
  add(carbon, new THREE.BoxGeometry(0.5, 0.1, 0.8), 0, 0.62, 0.5);
  add(plain("#f0c419", { rough: 0.25 }), new THREE.SphereGeometry(0.15, 14, 10), 0, 0.82, 0.25);
  add(plain("#111", { rough: 0.1 }), new THREE.BoxGeometry(0.2, 0.06, 0.04), 0, 0.84, 0.39);
  const halo = new THREE.TorusGeometry(0.32, 0.03, 8, 20, Math.PI);
  add(carbon, halo, 0, 0.78, 0.55, -Math.PI / 2 + 0.15, 0, 0);
  add(carbon, new THREE.CylinderGeometry(0.025, 0.03, 0.32, 8), 0, 0.68, 0.92, 0.3);
  // Wheels: wide, open, big tyres; suspension arms.
  const wheels: CarRig["wheels"] = [];
  for (const [front, z, w, r] of [[true, 1.55, 0.36, 0.33], [false, -1.55, 0.45, 0.34]] as const)
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.85, r, z);
      const wh = wheel(r, w, "#2b2d30", "#b3261e");
      const spin = new THREE.Group();
      spin.add(wh.g);
      if (s < 0) spin.rotation.y = Math.PI;
      pivot.add(spin);
      group.add(pivot);
      wheels.push({ obj: pivot, front, spin });
      for (const dy of [-0.06, 0.08]) add(carbon, new THREE.BoxGeometry(0.62, 0.025, 0.05), s * 0.5, r + dy, z);
    }
  const lights: THREE.Mesh[] = [];
  const rain = lamp("#ff2020", 0.3, 2.5);
  const rl = add(rain, new THREE.BoxGeometry(0.12, 0.05, 0.02), 0, 0.42, -2.46);
  lights.push(rl);
  const paint = (c: string, finish: "gloss" | "metallic" | "matte" | "pearl" = "gloss") => {
    const next = carPaint(c, finish);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === paintM) m.material = next;
    });
    paintM = next;
  };
  return { group, body, wheels, lights, brakeMat: null, headMat: null, len: 5.0, r: 0.95, seatY: 0.25, spec: SPECS.f2!, paint };
}

// ------------------------------------------------------------------------------------------------- licensed models

type GlbCfg = { file: string; length: number; flip?: boolean; paint: RegExp; spinNames: [RegExp, boolean][]; steerNames?: RegExp[] };
const GLB: Record<string, GlbCfg> = {
  gt911: { file: "/models/cars/porsche911.glb", length: 4.52, paint: /^paint$/i, spinNames: [[/^Cylinder\.000$/, false], [/^Cylinder\.001$/, true]] },
  concept: { file: "/models/cars/concept.glb", length: 4.3, flip: true, paint: /^Paint 1/i, spinNames: [[/^WheelFrontL$/, true], [/^WheelFrontR$/, true], [/^WheelRearL$/, false], [/^WheelRearR$/, false]] },
};
const glbCache = new Map<string, Promise<THREE.Object3D>>();
function loadGlb(key: string) {
  if (!glbCache.has(key)) {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    glbCache.set(key, loader.loadAsync(GLB[key]!.file).then((g) => g.scene));
  }
  return glbCache.get(key)!;
}

// Cars showing a licensed model: within `range` of the camera they show it, farther away their drawn body.
// Town calls this a few times a second; cars taken out of the scene drop off the list.
const DETAILED = new Set<{ group: THREE.Group; setNear: (n: boolean) => void; orphan: number }>();
const _p = new THREE.Vector3();
export function updateCarDetail(camera: THREE.Vector3, range: number) {
  for (const d of DETAILED) {
    if (!d.group.parent) {
      if (++d.orphan > 6) DETAILED.delete(d);
      continue;
    }
    d.orphan = 0;
    d.group.getWorldPosition(_p);
    d.setNear(_p.distanceTo(camera) < range);
  }
}
export function forgetCarDetail(root: THREE.Object3D) {
  for (const d of DETAILED) {
    let top: THREE.Object3D = d.group;
    while (top.parent) top = top.parent;
    if (top === root) DETAILED.delete(d);
  }
}

// Swap the drawn body of a rig for the licensed model, keeping the rig (physics, lights) as it is.
async function upgradeToGlb(rig: CarRig, key: string, color: string) {
  const cfg = GLB[key];
  if (!cfg) return;
  const src = await loadGlb(key);
  const model = src.clone(true);
  // Lie it along +z, on the ground, at its real length.
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const holder = new THREE.Group();
  holder.add(model);
  if (size.y > size.z && size.y > size.x) model.rotation.x = -Math.PI / 2;
  else if (size.x > size.z) model.rotation.y = Math.PI / 2;
  holder.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(holder);
  const s2 = b2.getSize(new THREE.Vector3());
  const k = cfg.length / Math.max(s2.x, s2.z);
  holder.scale.setScalar(k);
  if (cfg.flip) holder.rotation.y = Math.PI;
  holder.updateMatrixWorld(true);
  const b3 = new THREE.Box3().setFromObject(holder);
  holder.position.set(-(b3.min.x + b3.max.x) / 2, -b3.min.y, -(b3.min.z + b3.max.z) / 2);
  // Its paint becomes the car paint (own copy), shadows on.
  let paintM = carPaint(color, "metallic");
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.receiveShadow = true;
    if (!Array.isArray(m.material) && cfg.paint.test(m.material.name)) m.material = paintM;
  });
  // Wheels: pivot each named wheel node at its own centre so it can spin (and steer).
  rig.group.add(holder);
  rig.group.updateMatrixWorld(true);
  const wheels: CarRig["wheels"] = [];
  for (const [re, front] of cfg.spinNames) {
    let node: THREE.Object3D | null = null;
    model.traverse((o) => !node && re.test(o.name) && (node = o));
    if (!node) continue;
    const n = node as THREE.Object3D;
    const c = new THREE.Box3().setFromObject(n).getCenter(new THREE.Vector3());
    const pivot = new THREE.Group();
    rig.group.worldToLocal(c);
    pivot.position.copy(c);
    rig.group.add(pivot);
    const spin = new THREE.Group();
    pivot.add(spin);
    rig.group.updateMatrixWorld(true);
    spin.attach(n);
    wheels.push({ obj: pivot, front, spin });
  }
  // Hide the drawn body and wheels; the lights stay (they are useful at night). Far away the drawn body comes back
  // (the licensed models have hundreds of thousands of triangles; see updateCarDetail).
  const drawn: THREE.Object3D[] = [];
  rig.body.traverse((o) => (o as THREE.Mesh).isMesh && !rig.lights.includes(o as THREE.Mesh) && drawn.push(o));
  const drawnWheels = rig.wheels.map((w) => w.obj);
  const glbWheels = wheels.map((w) => w.obj);
  let near: boolean | null = null;
  const setNear = (n: boolean) => {
    if (n === near) return;
    near = n;
    holder.visible = n;
    for (const o of glbWheels) o.visible = n;
    for (const o of drawn) o.visible = !n;
    for (const o of drawnWheels) o.visible = !n || !glbWheels.length;
  };
  setNear(true);
  DETAILED.add({ group: rig.group, setNear, orphan: 0 });
  rig.wheels = wheels.length ? wheels : rig.wheels;
  rig.paint = (c, finish = "metallic") => {
    const next = carPaint(c, finish);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material === paintM) m.material = next;
    });
    paintM = next;
  };
}

// A car for a catalog model: drawn now, the licensed model swapped in when it has loaded (High and Ultra).
export function carRig(model: string, paintColor: string, rims = "#c0c4c8", opts: { detailed?: boolean } = {}): CarRig | null {
  const style = CAR_BODY[model];
  if (!style) return null;
  const rig = style === "f2" ? formulaCar(paintColor) : drawnCar(style, paintColor, rims);
  rig.spec = SPECS[model] ?? SPECS[style] ?? SPECS.sedan!;
  if (GLB[model] && opts.detailed !== false) void upgradeToGlb(rig, model, paintColor).catch(() => {});
  return rig;
}

// Any vehicle: a car rig when the model is a car, otherwise the older shapes (bikes, scooters, the cart, hover).
export function anyVehicle(model: string, paint: string, rims?: string, detailed = true) {
  const rig = carRig(model, paint, rims, { detailed });
  if (rig) return { group: rig.group, wheels: rig.wheels.map((w) => w.spin), lights: rig.lights, len: rig.len, r: rig.r, seatY: rig.seatY, rig };
  const v = vehicle(model, paint, rims);
  return { ...v, rig: null as CarRig | null };
}
