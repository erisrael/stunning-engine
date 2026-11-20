import * as THREE from "three";
import { cone, cyl, mesh, outline, sphere, toon, unitBox } from "./toon";

// Models for things people own and the town's props: furniture, vehicles, trees, lamps, benches and more. All are
// small groups of shared shapes in cel-shaded colours, standing on y = 0, facing +z.

const B = (g: THREE.Group, c: string, x: number, y: number, z: number, w: number, h: number, d: number, line = false) => {
  const m = mesh(unitBox(), toon(c), x, y, z, w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  if (line) outline(m, 0.02);
  g.add(m);
  return m;
};
const S = (g: THREE.Group, c: string, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, seg = 12) => {
  const m = mesh(sphere(seg), toon(c), x, y, z, sx, sy, sz);
  m.castShadow = true;
  g.add(m);
  return m;
};
const C = (g: THREE.Group, c: string, x: number, y: number, z: number, r: number, h: number, seg = 12) => {
  const m = mesh(cyl(seg), toon(c), x, y, z, r * 2, h, r * 2);
  m.castShadow = true;
  g.add(m);
  return m;
};
const dark = (hex: string, k = 0.7) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;

// ------------------------------------------------------------------------------------------------- furniture

// A piece of furniture, its footprint w x d metres (cells x 0.5), in its colour.
export function furniture(model: string, color: string, w: number, d: number): THREE.Group {
  const g = new THREE.Group();
  switch (model) {
    case "chair":
      B(g, color, 0, 0.45, 0, w * 0.8, 0.08, d * 0.8);
      B(g, color, 0, 0.85, -d * 0.36, w * 0.8, 0.8, 0.08);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, dark(color), (x! * w) / 2.8, 0.22, (z! * d) / 2.8, 0.06, 0.45, 0.06);
      break;
    case "table":
      B(g, color, 0, 0.74, 0, w * 0.95, 0.07, d * 0.9, true);
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B(g, dark(color), (x! * w) / 2.4, 0.36, (z! * d) / 2.4, 0.08, 0.72, 0.08);
      break;
    case "bed":
      B(g, dark(color, 0.5), 0, 0.22, 0, w * 0.95, 0.3, d * 0.95);
      B(g, "#f8fafc", 0, 0.42, 0, w * 0.9, 0.16, d * 0.9);
      B(g, color, 0, 0.48, d * 0.12, w * 0.92, 0.08, d * 0.68);
      S(g, "#ffffff", 0, 0.56, -d * 0.36, w * 0.6, 0.12, 0.3);
      B(g, dark(color, 0.5), 0, 0.6, -d * 0.48, w * 0.95, 0.9, 0.08);
      break;
    case "sofa":
    case "armchair":
      B(g, color, 0, 0.25, 0, w * 0.95, 0.42, d * 0.9, true);
      B(g, color, 0, 0.62, -d * 0.36, w * 0.95, 0.6, d * 0.2);
      for (const x of [-1, 1]) B(g, dark(color, 0.85), (x * w) / 2.15, 0.45, 0, w * 0.08, 0.36, d * 0.9);
      B(g, dark(color, 1.15), 0, 0.5, 0.05, w * 0.82, 0.1, d * 0.6);
      break;
    case "plant":
      C(g, "#b45309", 0, 0.22, 0, 0.22, 0.44);
      S(g, color, 0, 0.75, 0, 0.6, 0.7, 0.6);
      S(g, dark(color, 1.2), 0.15, 1.0, 0.05, 0.35);
      break;
    case "tree":
      C(g, "#b45309", 0, 0.25, 0, 0.35, 0.5);
      C(g, "#78350f", 0, 1.0, 0, 0.08, 1.2);
      S(g, color, 0, 1.7, 0, 1.1, 1.0, 1.1);
      S(g, dark(color, 1.2), 0.3, 2.0, 0.2, 0.6);
      break;
    case "lamp": {
      C(g, "#334155", 0, 0.03, 0, 0.18, 0.06);
      C(g, "#334155", 0, 0.8, 0, 0.025, 1.6);
      const shade = mesh(cone(14), toon(color, { emissive: dark(color, 0.6) }), 0, 1.6, 0, 0.45, 0.35, 0.45);
      shade.rotation.x = Math.PI;
      g.add(shade);
      break;
    }
    case "rug": {
      const r = mesh(cyl(32), toon(color), 0, 0.01, 0, w * 0.95, 0.02, d * 0.95);
      r.receiveShadow = true;
      g.add(r);
      g.add(mesh(cyl(32), toon(dark(color, 1.25)), 0, 0.015, 0, w * 0.6, 0.02, d * 0.6));
      break;
    }
    case "shelf":
      B(g, color, 0, 0.95, 0, w * 0.95, 1.9, d * 0.8, true);
      for (let i = 0; i < 4; i++) {
        B(g, dark(color, 0.6), 0, 0.3 + i * 0.45, 0.02, w * 0.85, 0.36, d * 0.6);
        for (let k = 0; k < 6; k++) B(g, ["#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#f8fafc"][(k + i) % 6]!, -w * 0.38 + k * w * 0.14, 0.3 + i * 0.45, 0.06, w * 0.1, 0.3, d * 0.5);
      }
      break;
    case "desk":
      B(g, color, 0, 0.74, 0, w * 0.95, 0.06, d * 0.9, true);
      for (const x of [-1, 1]) B(g, "#64748b", (x * w) / 2.3, 0.37, 0, 0.06, 0.72, d * 0.8);
      B(g, "#111827", 0, 1.05, -d * 0.25, w * 0.4, 0.3, 0.04);
      B(g, "#38bdf8", 0, 1.05, -d * 0.23, w * 0.36, 0.25, 0.01);
      break;
    case "tv":
      B(g, "#78350f", 0, 0.25, 0, w * 0.9, 0.5, d * 0.8);
      B(g, color, 0, 1.05, 0, w * 0.85, 0.9, 0.08, true);
      B(g, "#1e40af", 0, 1.05, 0.045, w * 0.8, 0.82, 0.01).material = toon("#3b82f6", { emissive: "#1e3a8a" });
      break;
    case "painting":
      B(g, "#78350f", 0, 1.5, -d * 0.4, w * 0.9, 0.8, 0.06);
      B(g, color, 0, 1.5, -d * 0.36, w * 0.78, 0.66, 0.02);
      S(g, "#fde047", -w * 0.15, 1.6, -d * 0.35, 0.18, 0.18, 0.02);
      break;
    case "aquarium":
      B(g, "#1f2937", 0, 0.35, 0, w * 0.9, 0.7, d * 0.8);
      g.add(mesh(unitBox(), toon(color, { transparent: 0.45 }), 0, 1.0, 0, w * 0.9, 0.6, d * 0.8));
      for (let i = 0; i < 3; i++) S(g, ["#f97316", "#facc15", "#ec4899"][i]!, -0.4 + i * 0.4, 1.0, 0, 0.14, 0.08, 0.05).userData.fish = i;
      break;
    case "piano":
      B(g, color, 0, 0.75, -d * 0.15, w * 0.95, 1.1, d * 0.5, true);
      B(g, "#f8fafc", 0, 0.78, d * 0.12, w * 0.9, 0.05, d * 0.18);
      for (let i = 0; i < 10; i++) B(g, "#0f172a", -w * 0.4 + i * w * 0.09, 0.81, d * 0.08, 0.04, 0.03, d * 0.1);
      B(g, color, 0, 0.25, d * 0.3, w * 0.5, 0.45, d * 0.25);
      break;
    case "fireplace":
      B(g, color, 0, 0.7, -d * 0.2, w * 0.95, 1.4, d * 0.55, true);
      B(g, "#1f2937", 0, 0.45, -d * 0.02, w * 0.5, 0.6, d * 0.2);
      { const o = mesh(cone(6), toon("#f97316", { emissive: "#ea580c" }), 0, 0.4, 0.02, 0.3, 0.4, 0.15); o.userData.flame = true; g.add(o); }
      break;
    case "arcade":
      B(g, color, 0, 0.9, 0, w * 0.8, 1.8, d * 0.7, true);
      B(g, "#0f172a", 0, 1.3, d * 0.33, w * 0.6, 0.45, 0.02).material = toon("#22d3ee", { emissive: "#0e7490" });
      B(g, "#111827", 0, 0.95, d * 0.4, w * 0.7, 0.08, 0.25);
      break;
    case "throne":
      B(g, color, 0, 0.3, 0, w * 0.85, 0.5, d * 0.8, true);
      B(g, color, 0, 1.1, -d * 0.35, w * 0.85, 1.6, 0.15, true);
      B(g, "#dc2626", 0, 0.58, 0.05, w * 0.7, 0.08, d * 0.6);
      for (const x of [-1, 1]) S(g, "#f8fafc", (x * w) / 2.6, 1.95, -d * 0.35, 0.14);
      break;
    default:
      B(g, color, 0, 0.4, 0, w * 0.9, 0.8, d * 0.9, true);
  }
  return g;
}

// ------------------------------------------------------------------------------------------------- vehicles

// A vehicle, facing +z, with wheels (spun while driving) and lights. Returns its length and radius for collisions.
export function vehicle(model: string, paint: string, rims = "#e5e7eb"): { group: THREE.Group; len: number; r: number; seatY: number; wheels: THREE.Object3D[]; lights: THREE.Mesh[] } {
  const g = new THREE.Group();
  const wheels: THREE.Object3D[] = [];
  const lights: THREE.Mesh[] = [];
  const wheel = (x: number, z: number, r: number, w: number) => {
    const p = new THREE.Object3D();
    p.position.set(x, r, z);
    const t = mesh(cyl(14), toon("#111827"), 0, 0, 0, r * 2, w, r * 2);
    t.rotation.z = Math.PI / 2;
    p.add(t);
    const rim = mesh(cyl(10), toon(rims), 0, 0, 0, r * 1.1, w * 1.05, r * 1.1);
    rim.rotation.z = Math.PI / 2;
    p.add(rim);
    g.add(p);
    wheels.push(p);
  };
  const lamp = (x: number, y: number, z: number, front: boolean) => {
    const l = mesh(unitBox(), toon(front ? "#fef9c3" : "#ef4444", { emissive: front ? "#a16207" : "#7f1d1d" }), x, y, z, 0.28, 0.12, 0.05);
    l.userData.front = front;
    g.add(l);
    lights.push(l);
  };
  let len = 4, r = 1, seatY = 0.55;
  if (model === "bike" || model === "scooter" || model === "moto") {
    const two = model !== "scooter";
    wheel(0, 0.75, model === "moto" ? 0.36 : 0.34, 0.1);
    wheel(0, -0.75, model === "moto" ? 0.36 : 0.34, 0.1);
    if (model === "bike") {
      B(g, paint, 0, 0.6, 0, 0.06, 0.06, 1.2).rotation.x = 0.2;
      B(g, paint, 0, 0.75, -0.25, 0.06, 0.6, 0.06);
      B(g, "#111827", 0, 1.05, -0.3, 0.2, 0.06, 0.32);
      B(g, paint, 0, 0.85, 0.55, 0.06, 0.6, 0.06);
      B(g, "#111827", 0, 1.15, 0.55, 0.6, 0.05, 0.05);
      seatY = 1.05;
    } else {
      B(g, paint, 0, 0.55, 0, 0.36, 0.3, 1.4, true);
      B(g, "#111827", 0, 0.8, -0.25, 0.32, 0.12, 0.6);
      B(g, paint, 0, 0.95, 0.55, 0.12, 0.6, 0.12);
      B(g, "#111827", 0, 1.25, 0.55, 0.7, 0.06, 0.06);
      if (two) S(g, paint, 0, 0.75, 0.25, 0.4, 0.3, 0.6);
      seatY = 0.85;
    }
    lamp(0, model === "bike" ? 1.0 : 1.05, 0.68, true);
    lamp(0, 0.75, -0.75, false);
    len = 1.9;
    r = 0.45;
  } else if (model === "cart") {
    for (const [x, z] of [[-0.6, 0.8], [0.6, 0.8], [-0.6, -0.8], [0.6, -0.8]]) wheel(x!, z!, 0.25, 0.18);
    B(g, paint, 0, 0.45, 0, 1.3, 0.3, 2.2, true);
    B(g, "#1f2937", 0, 0.75, -0.3, 1.2, 0.2, 0.8);
    B(g, "#1f2937", 0, 1.05, -0.65, 1.2, 0.6, 0.12);
    for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.9], [0.6, -0.9]]) B(g, "#e5e7eb", x!, 1.35, z!, 0.05, 1.2, 0.05);
    B(g, paint, 0, 1.95, -0.15, 1.4, 0.06, 1.9);
    lamp(-0.45, 0.55, 1.12, true);
    lamp(0.45, 0.55, 1.12, true);
    len = 2.4;
    r = 0.8;
    seatY = 0.85;
  } else {
    // Cars: body, cabin with glass, wheels, lights. Shapes differ by model.
    const sport = model === "sports" || model === "hover";
    const jeep = model === "jeep";
    const L = sport ? 4.4 : jeep ? 4.0 : 3.8, W = sport ? 1.9 : 1.8, H = sport ? 0.55 : jeep ? 0.9 : 0.75;
    const lift = jeep ? 0.45 : model === "hover" ? 0.6 : 0.3;
    if (model !== "hover") for (const [x, z] of [[-W / 2, L * 0.32], [W / 2, L * 0.32], [-W / 2, -L * 0.32], [W / 2, -L * 0.32]]) wheel(x!, z!, jeep ? 0.42 : 0.34, 0.26);
    else for (const [x, z] of [[-W / 2, L * 0.3], [W / 2, L * 0.3], [-W / 2, -L * 0.3], [W / 2, -L * 0.3]]) g.add(mesh(cyl(12), toon("#22d3ee", { emissive: "#0891b2" }), x!, 0.35, z!, 0.5, 0.12, 0.5));
    const body = B(g, paint, 0, lift + H / 2, 0, W, H, L, true);
    body.userData.paint = true;
    const cabin = mesh(unitBox(), toon("#93c5fd", { transparent: 0.7 }), 0, lift + H + (sport ? 0.25 : 0.35), sport ? -0.3 : -0.1, W * 0.86, sport ? 0.5 : 0.7, L * (sport ? 0.42 : 0.5));
    g.add(cabin);
    B(g, paint, 0, lift + H + (sport ? 0.52 : 0.72), sport ? -0.35 : -0.1, W * 0.88, 0.06, L * (sport ? 0.38 : 0.48)).userData.paint = true;
    if (sport) B(g, "#111827", 0, lift + H + 0.25, -L / 2 + 0.15, W * 0.9, 0.06, 0.3);
    if (jeep) (B(g, "#1f2937", 0, lift + H + 0.1, -L / 2 - 0.12, 0.6, 0.6, 0.2), B(g, "#334155", 0, lift + 0.15, L / 2 + 0.05, W, 0.2, 0.15));
    lamp(-W * 0.32, lift + H * 0.6, L / 2 + 0.01, true);
    lamp(W * 0.32, lift + H * 0.6, L / 2 + 0.01, true);
    lamp(-W * 0.32, lift + H * 0.6, -L / 2 - 0.01, false);
    lamp(W * 0.32, lift + H * 0.6, -L / 2 - 0.01, false);
    len = L;
    r = W / 2 + 0.05;
    seatY = lift + H * 0.55;
  }
  g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  return { group: g, len, r, seatY, wheels, lights };
}

// ------------------------------------------------------------------------------------------------- props

export function tree(kind: number, color = "#22a35a") {
  const g = new THREE.Group();
  if (kind % 3 === 0) {
    // A round leafy tree.
    C(g, "#7c4a26", 0, 1.2, 0, 0.22, 2.4, 8);
    S(g, color, 0, 3.0, 0, 2.6, 2.3, 2.6);
    S(g, dark(color, 1.15), 0.6, 3.6, 0.3, 1.5);
    S(g, dark(color, 0.9), -0.6, 2.7, -0.4, 1.4);
  } else if (kind % 3 === 1) {
    // A pine.
    C(g, "#7c4a26", 0, 0.8, 0, 0.18, 1.6, 8);
    for (let i = 0; i < 3; i++) g.add(mesh(cone(8), toon(dark("#15803d", 1 + i * 0.1)), 0, 1.8 + i * 0.9, 0, 2.4 - i * 0.6, 1.6, 2.4 - i * 0.6));
  } else {
    // A blossom tree.
    C(g, "#6b3d1f", 0, 1.1, 0, 0.2, 2.2, 8);
    S(g, "#f9a8d4", 0, 2.8, 0, 2.4, 1.8, 2.4);
    S(g, "#fbcfe8", 0.5, 3.2, 0.2, 1.3);
  }
  g.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  return g;
}

export function bench(color = "#a16207") {
  const g = new THREE.Group();
  B(g, color, 0, 0.45, 0, 1.8, 0.08, 0.5);
  B(g, color, 0, 0.8, -0.22, 1.8, 0.4, 0.06);
  for (const x of [-0.75, 0.75]) B(g, "#374151", x, 0.22, 0, 0.08, 0.45, 0.45);
  return g;
}

export function lampPost() {
  const g = new THREE.Group();
  C(g, "#1f2937", 0, 2, 0, 0.08, 4, 8);
  const bulb = S(g, "#fef3c7", 0, 4.1, 0, 0.45);
  bulb.material = toon("#fef3c7", { emissive: "#a16207" });
  bulb.userData.bulb = true;
  return g;
}

export function flowers(color: string) {
  const g = new THREE.Group();
  B(g, "#65a30d", 0, 0.15, 0, 2, 0.3, 1);
  for (let i = 0; i < 8; i++) S(g, i % 2 ? color : "#fde047", -0.8 + (i % 4) * 0.5, 0.4, -0.25 + Math.floor(i / 4) * 0.5, 0.25);
  return g;
}

// Props Admin can place from the town editor (and the town uses itself).
export function prop(kind: string, color: string, text: string): THREE.Group {
  switch (kind) {
    case "tree":
      return tree(Math.abs(Math.round(color.charCodeAt(2) || 0)), color);
    case "bench":
      return bench(color);
    case "lamp":
      return lampPost();
    case "flowers":
      return flowers(color);
    case "fountain": {
      const g = new THREE.Group();
      C(g, "#a8a29e", 0, 0.4, 0, 2.2, 0.8, 24);
      g.add(mesh(cyl(24), toon("#38bdf8", { transparent: 0.85 }), 0, 0.82, 0, 3.9, 0.08, 3.9));
      C(g, "#d6d3d1", 0, 1.4, 0, 0.3, 1.6);
      return g;
    }
    case "statue": {
      const g = new THREE.Group();
      B(g, "#9ca3af", 0, 0.6, 0, 1.4, 1.2, 1.4);
      S(g, color, 0, 2.0, 0, 0.9, 1.6, 0.9);
      S(g, color, 0, 3.0, 0, 0.6);
      return g;
    }
    case "kiosk": {
      const g = new THREE.Group();
      B(g, color, 0, 0.6, 0, 2.4, 1.2, 1.4, true);
      B(g, "#f8fafc", 0, 2.6, 0, 2.8, 0.15, 1.8);
      for (const x of [-1.2, 1.2]) B(g, "#374151", x, 1.8, 0.6, 0.08, 1.6, 0.08);
      return g;
    }
    case "rock": {
      const g = new THREE.Group();
      S(g, "#78716c", 0, 0.4, 0, 1.6, 1.0, 1.3, 6);
      return g;
    }
    case "tent": {
      const g = new THREE.Group();
      { const o = mesh(cone(4), toon(color), 0, 1.2, 0, 3, 2.4, 3); o.rotation.y = Math.PI / 4; g.add(o); }
      return g;
    }
    case "stage": {
      const g = new THREE.Group();
      B(g, "#334155", 0, 0.4, 0, 6, 0.8, 4);
      B(g, color, 0, 3, -1.9, 6, 4.4, 0.2);
      return g;
    }
    case "arch": {
      const g = new THREE.Group();
      for (const x of [-2, 2]) B(g, color, x, 2, 0, 0.5, 4, 0.5);
      B(g, color, 0, 4.1, 0, 4.8, 0.5, 0.6);
      return g;
    }
    case "chest": {
      const g = new THREE.Group();
      B(g, "#92400e", 0, 0.3, 0, 1, 0.6, 0.7, true);
      B(g, "#facc15", 0, 0.62, 0, 1.02, 0.1, 0.72);
      return g;
    }
    case "car":
      return vehicle("hatch", color).group;
    default: {
      const g = new THREE.Group();
      B(g, color, 0, 1, 0, 1, 2, 1);
      void text;
      return g;
    }
  }
}

// A small picture of a shop item on a podium (shops show a few).
export function showcase(kind: string, model: string, color: string) {
  if (kind === "furniture") return furniture(model, color, 1.4, 1.2);
  if (kind === "vehicle") return vehicle(model, color).group;
  const g = new THREE.Group();
  if (kind === "petfood") {
    C(g, "#e5e7eb", 0, 0.12, 0, 0.3, 0.24);
    S(g, color || "#f59e0b", 0, 0.28, 0, 0.4, 0.2, 0.4);
  } else if (kind === "pettoy") S(g, color, 0, 0.25, 0, 0.45);
  else if (kind === "house") {
    B(g, "#fef3c7", 0, 0.4, 0, 1, 0.8, 0.8);
    { const o = mesh(cone(4), toon(color || "#dc2626"), 0, 1.05, 0, 1.2, 0.5, 1.2); o.rotation.y = Math.PI / 4; g.add(o); }
  } else {
    S(g, color || "#a855f7", 0, 0.35, 0, 0.5, 0.6, 0.5);
    g.add(mesh(cone(5), toon("#fde047", { emissive: "#a16207" }), 0, 0.8, 0, 0.2, 0.3, 0.2));
  }
  return g;
}
