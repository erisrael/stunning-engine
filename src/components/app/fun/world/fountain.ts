import * as THREE from "three";
import { plain, surface } from "./pbr";

// A stone fountain: a moulded basin (turned profiles, not cylinders), a pedestal with two bowls, water that moves
// (ripples on the surface), sheets of water falling from the bowls' rims and a jet at the top with spray. One
// draw call per material; the water and spray animate in update().

const lathe = (pts: [number, number][], seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);

// Ripples: a small normal map drawn once, scrolled over the water.
let rippleTex: THREE.CanvasTexture | null = null;
function ripples() {
  if (rippleTex) return rippleTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const a = (x / 128) * Math.PI * 2, b = (y / 128) * Math.PI * 2;
      const nx = Math.sin(a * 3 + Math.sin(b * 2) * 1.5) * 0.5 + Math.sin(a * 7 + b * 5) * 0.2;
      const ny = Math.cos(b * 3 + Math.sin(a * 2) * 1.5) * 0.5 + Math.cos(b * 6 - a * 4) * 0.2;
      const i = (y * 128 + x) * 4;
      img.data[i] = 128 + nx * 90;
      img.data[i + 1] = 128 + ny * 90;
      img.data[i + 2] = 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  rippleTex = new THREE.CanvasTexture(c);
  rippleTex.wrapS = rippleTex.wrapT = THREE.RepeatWrapping;
  return rippleTex;
}

// Falling water: soft vertical streaks that scroll down.
let sheetTex: THREE.CanvasTexture | null = null;
function sheet() {
  if (sheetTex) return sheetTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 64, 128);
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 64, y = Math.random() * 128, h = 10 + Math.random() * 40;
    const grad = g.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(235,245,255,${0.35 + Math.random() * 0.4})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x, y, 1 + Math.random() * 1.5, h);
  }
  sheetTex = new THREE.CanvasTexture(c);
  sheetTex.wrapS = sheetTex.wrapT = THREE.RepeatWrapping;
  return sheetTex;
}

export function buildFountain(radius = 3) {
  const group = new THREE.Group();
  group.name = "fountain";
  const k = radius / 3;
  const stone = surface("stone", { tint: "#e9e2d3" });
  const stoneDark = surface("stone", { tint: "#cfc6b4" });
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y = 0, cast = true) => {
    const o = new THREE.Mesh(geo, m);
    o.position.y = y;
    o.castShadow = cast;
    o.receiveShadow = true;
    group.add(o);
    return o;
  };
  // The basin: a moulded wall (outside foot, body, a rounded rim you could sit on, the inside face) and its floor.
  add(lathe([[3.0, 0], [3.08, 0.08], [3.02, 0.14], [2.98, 0.52], [3.06, 0.56], [3.08, 0.64], [2.98, 0.7], [2.74, 0.7], [2.68, 0.64], [2.68, 0.12]].map(([r, y]) => [r * k, y] as [number, number])), stone);
  add(new THREE.CircleGeometry(2.7 * k, 48).rotateX(-Math.PI / 2), plain("#3d4a4f", { rough: 0.9 }), 0.1, false);
  // The pedestal and two bowls.
  add(lathe([[0.62, 0], [0.7, 0.08], [0.48, 0.2], [0.34, 0.5], [0.3, 1.2], [0.4, 1.3], [0.4, 1.36]].map(([r, y]) => [r * k, y] as [number, number]), 32), stoneDark, 0.1);
  add(lathe([[0.3, 0], [1.25, 0.18], [1.38, 0.3], [1.32, 0.34], [1.2, 0.26], [0.32, 0.12]].map(([r, y]) => [r * k, y] as [number, number]), 40), stone, 1.42 * k);
  add(lathe([[0.16, 0], [0.18, 0.5], [0.24, 0.56]].map(([r, y]) => [r * k, y] as [number, number]), 24), stoneDark, 1.72 * k);
  add(lathe([[0.18, 0], [0.7, 0.12], [0.78, 0.2], [0.72, 0.23], [0.62, 0.17], [0.2, 0.08]].map(([r, y]) => [r * k, y] as [number, number]), 32), stone, 2.28 * k);
  add(lathe([[0.1, 0], [0.12, 0.25], [0.05, 0.36], [0, 0.4]].map(([r, y]) => [r * k, y] as [number, number]), 16), stoneDark, 2.48 * k);

  // Water: the pool and both bowls (a clear surface with moving ripples).
  const tex = ripples();
  const water = new THREE.MeshPhysicalMaterial({ color: "#5d9db3", roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.86, normalMap: tex, normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.4 });
  tex.repeat.set(3, 3);
  add(new THREE.CircleGeometry(2.68 * k, 48).rotateX(-Math.PI / 2), water, 0.5, false);
  add(new THREE.CircleGeometry(1.22 * k, 40).rotateX(-Math.PI / 2), water, 1.42 * k + 0.26 * k, false);
  add(new THREE.CircleGeometry(0.64 * k, 32).rotateX(-Math.PI / 2), water, 2.28 * k + 0.17 * k, false);

  // Sheets of water falling from each bowl's rim into the one below.
  const st = sheet();
  const fall = new THREE.MeshBasicMaterial({ map: st, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide, color: "#e6f4ff" });
  const lower = new THREE.CylinderGeometry(1.36 * k, 1.55 * k, 1.72 * k - 0.5, 48, 1, true);
  add(lower, fall, 0.5 + (1.72 * k - 0.5) / 2, false);
  const upper = new THREE.CylinderGeometry(0.76 * k, 0.86 * k, 2.5 * k - 1.72 * k, 32, 1, true);
  add(upper, fall, 1.72 * k + (2.5 * k - 1.72 * k) / 2, false);

  // The jet and its spray: points thrown up and falling back into the top bowl.
  const N = 260;
  const pos = new Float32Array(N * 3);
  const life = new Float32Array(N);
  const vel = new Float32Array(N * 3);
  const seed = (i: number) => {
    const a = Math.random() * Math.PI * 2, s = 0.15 + Math.random() * 0.35;
    pos[i * 3] = 0;
    pos[i * 3 + 1] = 2.86 * k;
    pos[i * 3 + 2] = 0;
    vel[i * 3] = Math.cos(a) * s * k;
    vel[i * 3 + 1] = (3.2 + Math.random() * 0.9) * Math.sqrt(k);
    vel[i * 3 + 2] = Math.sin(a) * s * k;
    life[i] = 0;
  };
  for (let i = 0; i < N; i++) (seed(i), (life[i] = Math.random() * 1.4));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: "#eef7ff", size: 0.07 * k, transparent: true, opacity: 0.8, depthWrite: false, sizeAttenuation: true }));
  spray.frustumCulled = false;
  group.add(spray);

  let last = 0;
  const update = (t: number) => {
    const dt = Math.min(0.05, Math.max(0, t - last));
    last = t;
    tex.offset.set(t * 0.02, t * 0.015);
    st.offset.y = -t * 0.9;
    for (let i = 0; i < N; i++) {
      life[i]! += dt;
      vel[i * 3 + 1]! -= 9.81 * dt;
      pos[i * 3]! += vel[i * 3]! * dt;
      pos[i * 3 + 1]! += vel[i * 3 + 1]! * dt;
      pos[i * 3 + 2]! += vel[i * 3 + 2]! * dt;
      if (pos[i * 3 + 1]! < 2.42 * k || life[i]! > 1.6) seed(i);
    }
    geo.attributes.position!.needsUpdate = true;
  };
  return { group, update };
}
