import * as THREE from "three";
import { facade, plain, surface, SURFACES, type FacadeStyle, type SurfaceKey } from "./pbr";

// Materials for Seed Town. The town itself is realistic (physically based materials, see pbr.ts): toon() gives a
// physically based colour, or a textured surface when the colour names one ("brick:#ffffff", "facade:glass:#9aa"),
// shared so thousands of meshes reuse a few materials. Characters and pets keep the cel-shaded ("anime") look with
// cel() and outlines (inverted hull). Small canvas textures for signs and labels.

let gradient: THREE.DataTexture | null = null;
function gradientMap() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export type Quality = "low" | "medium" | "high" | "ultra";
// realistic: the town's materials are physically based (the editor and tests may switch it off).
export const TOON = { quality: "high" as Quality, realistic: true };

// How rough a plain coloured surface is, guessed from its colour (dark trims and metals shinier, greens matte).
function roughOf(c: THREE.Color) {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  if (hsl.h > 0.2 && hsl.h < 0.45 && hsl.s > 0.25) return 0.9;
  if (hsl.l < 0.15) return 0.45;
  if (hsl.l > 0.85) return 0.55;
  return 0.72;
}

// The town's material for a colour: physically based, or a textured surface ("grass:#ffffff") or facade
// ("facade:office:#d8d2c4") when the colour names one.
export function toon(color: string | number, opts: { emissive?: string; transparent?: number; side?: THREE.Side; flat?: boolean } = {}): THREE.Material {
  if (!TOON.realistic) return cel(color, opts);
  if (typeof color === "string" && color.includes(":")) {
    const parts = color.split(":");
    if (parts[0] === "facade") return facade(parts[1] as FacadeStyle, parts[2] ?? "#d8d2c4", Number(parts[3] ?? 1));
    if ((SURFACES as string[]).includes(parts[0]!)) return surface(parts[0] as SurfaceKey, { tint: parts[1] || "#ffffff", side: opts.side, transparent: opts.transparent });
  }
  if (opts.flat) return cel(color, opts);
  const c = new THREE.Color(typeof color === "string" ? color.replace(/^.*:/, "") : color);
  return plain(`#${c.getHexString()}`, { rough: roughOf(c), side: opts.side, transparent: opts.transparent, emissive: opts.emissive, emissiveIntensity: opts.emissive ? 1.2 : undefined });
}

const cache = new Map<string, THREE.Material>();
// The cel-shaded material for a colour (characters, pets; low quality: plain Lambert, cheaper).
export function cel(color: string | number, opts: { emissive?: string; transparent?: number; side?: THREE.Side; flat?: boolean } = {}): THREE.Material {
  const key = `${color}|${opts.emissive ?? ""}|${opts.transparent ?? ""}|${opts.side ?? ""}|${opts.flat ? 1 : 0}|${TOON.quality === "low" ? "l" : "t"}`;
  let m = cache.get(key);
  if (!m) {
    const base = { color: new THREE.Color(color), side: opts.side ?? THREE.FrontSide, transparent: opts.transparent !== undefined, opacity: opts.transparent ?? 1 };
    m = opts.flat
      ? new THREE.MeshBasicMaterial(base)
      : TOON.quality === "low"
        ? new THREE.MeshLambertMaterial({ ...base, emissive: new THREE.Color(opts.emissive ?? "#000000") })
        : new THREE.MeshToonMaterial({ ...base, gradientMap: gradientMap(), emissive: new THREE.Color(opts.emissive ?? "#000000") });
    if (opts.transparent !== undefined) (m as THREE.Material).depthWrite = opts.transparent > 0.6;
    cache.set(key, m);
  }
  return m;
}

const outlineMat = new THREE.MeshBasicMaterial({ color: "#1a1423", side: THREE.BackSide });
// A dark rim around a mesh (the anime outline); skipped on low quality.
export function outline(mesh: THREE.Mesh, width = 0.035) {
  // Only cel-shaded things (characters) get the rim; the realistic town does not.
  if (TOON.quality === "low" || !(mesh.material as THREE.MeshToonMaterial).isMeshToonMaterial) return mesh;
  const o = new THREE.Mesh(mesh.geometry, outlineMat);
  o.scale.setScalar(1 + width / Math.max(0.05, boundingRadius(mesh.geometry)));
  o.userData.outline = true;
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}
function boundingRadius(g: THREE.BufferGeometry) {
  if (!g.boundingSphere) g.computeBoundingSphere();
  return g.boundingSphere?.radius ?? 1;
}

// Shared geometries (a unit box, spheres, capsules) so most meshes are a scaled copy of a few shapes.
const geoCache = new Map<string, THREE.BufferGeometry>();
export function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) (g = make()), geoCache.set(key, g);
  return g;
}
export const unitBox = () => geo("box", () => new THREE.BoxGeometry(1, 1, 1));
export const sphere = (seg = 16) => geo(`sph${seg}`, () => new THREE.SphereGeometry(0.5, seg, Math.max(8, seg * 0.75)));
export const cyl = (seg = 14) => geo(`cyl${seg}`, () => new THREE.CylinderGeometry(0.5, 0.5, 1, seg));
export const cone = (seg = 12) => geo(`cone${seg}`, () => new THREE.ConeGeometry(0.5, 1, seg));
export const capsule = (r: number, len: number) => geo(`cap${r}|${len}`, () => new THREE.CapsuleGeometry(r, len, 4, 10));

export function mesh(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  return o;
}

// A canvas-drawn texture (cached by key).
const texCache = new Map<string, THREE.Texture>();
export function canvasTex(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

// Ground textures: grass with soft noise, asphalt with lane marks, paving and wood.
export function grassTex() {
  return canvasTex("grass", 256, 256, (g) => {
    g.fillStyle = "#7cc86a";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2400; i++) {
      g.fillStyle = ["#6fbf5d", "#88d276", "#74c262", "#93d97f"][i % 4]!;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 3 + Math.random() * 3);
    }
  }, [60, 60]);
}
export function roadTex() {
  return canvasTex("road", 128, 256, (g) => {
    g.fillStyle = "#4b5563";
    g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = i % 2 ? "#525b69" : "#444c59";
      g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2);
    }
    g.fillStyle = "#facc15";
    g.fillRect(61, 0, 6, 120);
    g.fillStyle = "#e5e7eb";
    g.fillRect(4, 0, 4, 256);
    g.fillRect(120, 0, 4, 256);
  });
}
export function pavingTex() {
  return canvasTex("paving", 128, 128, (g) => {
    g.fillStyle = "#e7e2d8";
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "#cfc8bb";
    g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
      g.beginPath();
      g.moveTo(0, i * 32);
      g.lineTo(128, i * 32);
      g.stroke();
      for (let j = 0; j < 4; j++) {
        g.beginPath();
        g.moveTo(j * 32 + (i % 2) * 16, i * 32);
        g.lineTo(j * 32 + (i % 2) * 16, i * 32 + 32);
        g.stroke();
      }
    }
  }, [40, 40]);
}
export function floorTex(color: string) {
  return canvasTex(`floor${color}`, 128, 128, (g) => {
    g.fillStyle = color;
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = "rgba(0,0,0,.08)";
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(0, i * 16);
      g.lineTo(128, i * 16);
      g.stroke();
    }
  });
}

// A sign or name tag drawn on a canvas, as a sprite that always faces the camera.
export function textSprite(lines: string[], opts: { bar?: number; color?: string; bubble?: boolean; bg?: string; width?: number; speaking?: boolean } = {}) {
  const c = document.createElement("canvas");
  const w = 512, h = opts.bubble ? 160 : 150;
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  if (opts.bubble) {
    g.fillStyle = "rgba(255,255,255,.95)";
    g.strokeStyle = "#111";
    g.lineWidth = 4;
    g.beginPath();
    g.roundRect(8, 8, w - 16, h - 40, 26);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(w / 2 - 18, h - 33);
    g.lineTo(w / 2, h - 8);
    g.lineTo(w / 2 + 18, h - 33);
    g.fill();
    g.fillStyle = "#111";
    g.font = "bold 34px system-ui, sans-serif";
    const t = lines[0]!.length > 46 ? `${lines[0]!.slice(0, 44)}…` : lines[0]!;
    const cut = t.lastIndexOf(" ", 23) > 5 ? t.lastIndexOf(" ", 23) : 23;
    const ls = t.length > 23 ? [t.slice(0, cut), t.slice(cut).trim()] : [t];
    ls.forEach((l, i) => g.fillText(l, w / 2, 60 + i * 40 - (ls.length - 1) * 16));
  } else {
    g.fillStyle = opts.bg ?? "rgba(15,23,42,.72)";
    g.beginPath();
    g.roundRect(56, 4, w - 112, opts.bar !== undefined ? 112 : 64, 18);
    g.fill();
    if (opts.speaking) {
      g.strokeStyle = "#22c55e";
      g.lineWidth = 6;
      g.stroke();
    }
    g.fillStyle = "#fff";
    g.font = "bold 36px system-ui, sans-serif";
    g.fillText(lines[0]!.slice(0, 22), w / 2, 46);
    if (lines[1]) {
      g.font = "28px system-ui, sans-serif";
      g.fillStyle = opts.color ?? "#e2e8f0";
      g.fillText(lines[1].slice(0, 28), w / 2, 82);
    }
    if (opts.bar !== undefined) {
      g.fillStyle = "rgba(255,255,255,.25)";
      g.fillRect(96, 94, w - 192, 12);
      g.fillStyle = opts.bar >= 60 ? "#22c55e" : opts.bar >= 25 ? "#eab308" : "#ef4444";
      g.fillRect(96, 94, ((w - 192) * Math.max(4, opts.bar)) / 100, 12);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  const sw = opts.width ?? 3.2;
  s.scale.set(sw, (sw * h) / w, 1);
  return s;
}

// A flat sign on a wall (a plane with text), for shop fronts and room names.
export function signPlane(text: string, w: number, h: number, bg = "#0f172a", fg = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = Math.round((512 * h) / w);
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  let size = Math.min(c.height * 0.6, 90);
  g.font = `bold ${size}px system-ui, sans-serif`;
  while (g.measureText(text).width > c.width * 0.9 && size > 12) g.font = `bold ${(size -= 4)}px system-ui, sans-serif`;
  g.fillText(text, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t }));
}

export function disposeAll(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Sprite).isSprite) return;
    // Shared geometries and materials live for the page; only one-off ones (sprites, signs) are freed.
    if (o.userData.outline) return;
    if ((o as THREE.Sprite).isSprite || m.geometry?.type === "PlaneGeometry") {
      const mats = ([] as (THREE.Material & { map?: THREE.Texture | null })[]).concat(m.material as never);
      for (const mt of mats) {
        if (seen.has(mt)) continue;
        seen.add(mt);
        if (!texCache.size || ![...texCache.values()].includes(mt.map as THREE.Texture)) mt.map?.dispose?.();
        mt.dispose();
      }
    }
  });
}
