import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Real trees and plants: game-ready models (Sketchfab, CC BY 4.0; mostly evolveduk's set; credits in
// public/models/CREDITS.txt) drawn as instances: one draw call per material for every tree of a kind. Up close the
// full model, farther a lighter copy (public/models/nature/<kind>-far.glb), beyond the view distance nothing.
// Leaves sway in the wind (shared with the weather). The city's builders call plant() while they build; Town makes
// a Nature from what was planted.

export const PLANTS = {
  oak: { h: [8, 12], far: true },
  beech: { h: [9, 13], far: true },
  birch: { h: [9, 14], far: true },
  maple: { h: [8, 11], far: true },
  willow: { h: [7, 10], far: true },
  acacia: { h: [6, 9], far: true },
  oldtree: { h: [7, 10], far: true },
  coconut: { h: [8, 12], far: true },
  curlypalm: { h: [6, 9], far: true },
  datepalm: { h: [7, 11], far: true },
  pine: { h: [10, 16], far: true },
  fir: { h: [9, 14], far: true },
  fern: { h: [0.6, 1.1], far: false },
  daisies: { h: [0.3, 0.45], far: false },
  banana: { h: [2.5, 4], far: false },
  monstera: { h: [0.9, 1.4], far: false },
  grass: { h: [0.35, 0.6], far: false, split: true },
  hedge: { h: [1.0, 1.4], far: false, split: true },
} as const satisfies Record<string, { h: readonly [number, number]; far: boolean; split?: boolean }>;
export type PlantKind = keyof typeof PLANTS;

type Spot = { kind: PlantKind; x: number; z: number; s: number; ry: number; v: number };
let planted: Spot[] = [];
// The city's builders: a plant here (size 0..1 picks a height in the kind's range; variant for packs).
export function plant(kind: PlantKind, x: number, z: number, size = Math.random(), ry = Math.random() * Math.PI * 2, variant = Math.floor(Math.random() * 8)) {
  if (!PLANTS[kind]) return;
  planted.push({ kind, x, z, s: Math.min(1, Math.max(0, size)), ry, v: Math.abs(Math.round(variant)) });
}
export function startPlanting() {
  planted = [];
}
export function takePlanted() {
  const p = planted;
  planted = [];
  return p;
}

// Wind for the leaves (Town sets the strength from the weather).
export const WIND = { time: { value: 0 }, strength: { value: 0.6 } };

type Part = { geo: THREE.BufferGeometry; mat: THREE.Material };
type Model = { variants: Part[][]; height: number[] };

const cache = new Map<string, Promise<Model | null>>();
const loader = () => {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return l;
};

// Leaves (alpha-cut, two-sided) sway with height above the ground; trunks stay put.
function windy(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uWindTime = WIND.time;
    sh.uniforms.uWind = WIND.strength;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWindTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
        vec3 iw = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
#else
        vec3 iw = vec3(0.0);
#endif
        float hgt = max(0.0, transformed.y - 1.2);
        float ph = uWindTime * 1.4 + iw.x * 0.21 + iw.z * 0.17;
        transformed.x += sin(ph + transformed.y * 0.35) * 0.035 * hgt * uWind;
        transformed.z += cos(ph * 0.8 + transformed.x * 0.3) * 0.025 * hgt * uWind;`,
      );
  };
  mat.customProgramCacheKey = () => "windy";
}

// One file: its meshes baked into the model's space, set on the ground and centred on the trunk, merged by
// material; packs (split) give one variant per top-level part.
async function loadModel(file: string, split: boolean): Promise<Model | null> {
  const g = await loader().loadAsync(file).catch(() => null);
  if (!g) return null;
  const root = g.scene;
  root.updateMatrixWorld(true);
  // Packs: down through single-child wrappers (Sketchfab_model, RootNode...) to the plants, one variant each.
  let base: THREE.Object3D = root;
  while (split && base.children.length === 1 && !(base as THREE.Mesh).isMesh) base = base.children[0]!;
  const groups = split && base.children.length > 1 ? base.children : [root];
  const variants: Part[][] = [];
  const height: number[] = [];
  for (const grp of groups) {
    const byMat = new Map<THREE.MeshStandardMaterial, THREE.BufferGeometry[]>();
    const box = new THREE.Box3();
    grp.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      let geo = m.geometry.clone();
      for (const k of Object.keys(geo.attributes)) if (!["position", "normal", "uv"].includes(k)) geo.deleteAttribute(k);
      // Plain floats so the transform can be baked (files are quantized).
      for (const k of Object.keys(geo.attributes)) {
        const a = geo.getAttribute(k) as THREE.BufferAttribute;
        const f = new Float32Array(a.count * a.itemSize);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < a.itemSize; c++) f[i * a.itemSize + c] = a.getComponent(i, c);
        geo.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize));
      }
      if (!geo.getAttribute("uv")) geo.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(geo.getAttribute("position").count * 2), 2));
      geo.applyMatrix4(m.matrixWorld);
      if (geo.index) geo = geo.toNonIndexed();
      geo.computeBoundingBox();
      box.union(geo.boundingBox!);
      const mat = m.material as THREE.MeshStandardMaterial;
      (byMat.get(mat) ?? byMat.set(mat, []).get(mat)!).push(geo);
    });
    if (box.isEmpty()) continue;
    // The trunk: the middle of the lowest tenth of the model.
    const cut = box.min.y + (box.max.y - box.min.y) * 0.1;
    let sx = 0, sz = 0, n = 0;
    for (const geos of byMat.values())
      for (const geo of geos) {
        const p = geo.getAttribute("position");
        for (let i = 0; i < p.count; i += 3) if (p.getY(i) < cut) (sx += p.getX(i), (sz += p.getZ(i)), n++);
      }
    const cx = n ? sx / n : (box.min.x + box.max.x) / 2, cz = n ? sz / n : (box.min.z + box.max.z) / 2;
    const parts: Part[] = [];
    for (const [mat, geos] of byMat) {
      const merged = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      if (!merged) continue;
      merged.translate(-cx, -box.min.y, -cz);
      merged.computeBoundingSphere();
      const leaf = mat.alphaTest > 0 || mat.transparent || !!mat.alphaMap;
      if (leaf) {
        mat.alphaTest = Math.max(0.35, mat.alphaTest || 0.35);
        mat.transparent = false;
        mat.side = THREE.DoubleSide;
        windy(mat);
      }
      mat.envMapIntensity = 0.6;
      parts.push({ geo: merged, mat });
    }
    if (parts.length) (variants.push(parts), height.push(box.max.y - box.min.y));
  }
  return variants.length ? { variants, height } : null;
}
const model = (kind: PlantKind, far: boolean) => {
  const key = `${kind}${far ? "-far" : ""}`;
  if (!cache.has(key)) cache.set(key, loadModel(`/models/nature/${key}.glb`, "split" in PLANTS[kind] && !!(PLANTS[kind] as { split?: boolean }).split));
  return cache.get(key)!;
};

type Layer = { meshes: THREE.InstancedMesh[]; variant: number };
type KindSet = { kind: PlantKind; spots: (Spot & { m: THREE.Matrix4 })[]; near: Layer[]; far: Layer[] };

// What one town planted, drawn as instances; update() hands each spot to the near or far copy by distance.
export class Nature {
  group = new THREE.Group();
  private sets: KindSet[] = [];
  private ready = false;
  constructor(scene: THREE.Scene, spots: Spot[], private quality: "low" | "medium" | "high" | "ultra") {
    this.group.name = "nature";
    scene.add(this.group);
    void this.build(spots);
  }
  private async build(spots: Spot[]) {
    try {
      await this.make(spots);
    } catch (e) {
      console.error("Nature", e);
    }
    this.ready = true;
  }
  private async make(spots: Spot[]) {
    const byKind = new Map<PlantKind, Spot[]>();
    for (const s of spots) (byKind.get(s.kind) ?? byKind.set(s.kind, []).get(s.kind)!).push(s);
    for (const [kind, list] of byKind) {
      const cfg = PLANTS[kind];
      const [near, far] = await Promise.all([model(kind, false), cfg.far ? model(kind, true) : Promise.resolve(null)]);
      if (!near) continue;
      const set: KindSet = { kind, spots: [], near: [], far: [] };
      for (const s of list) {
        const v = s.v % near.variants.length;
        const want = cfg.h[0] + (cfg.h[1] - cfg.h[0]) * s.s;
        const k = want / Math.max(0.01, near.height[v]!);
        set.spots.push({ ...s, v, m: new THREE.Matrix4().compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.ry), new THREE.Vector3(k, k, k)) });
      }
      const layers = (m: Model | null, shadows: boolean): Layer[] =>
        m
          ? m.variants.map((parts, variant) => ({
              variant,
              meshes: parts.map((p) => {
                const im = new THREE.InstancedMesh(p.geo, p.mat, Math.max(1, list.length));
                im.count = 0;
                im.frustumCulled = false;
                im.castShadow = shadows;
                im.receiveShadow = true;
                this.group.add(im);
                return im;
              }),
            }))
          : [];
      const big = cfg.h[1] > 3;
      set.near = layers(near, big && this.quality !== "low");
      set.far = layers(far, false);
      this.sets.push(set);
    }
  }
  // Near (full model) and far (lighter copy) by distance from the camera; past the view distance nothing.
  wind(dt: number, strength: number) {
    WIND.time.value += dt;
    WIND.strength.value += (strength - WIND.strength.value) * Math.min(1, dt * 0.5);
  }
  update(camera: THREE.Vector3, view: number, _dt = 0, _wind = 0) {
    if (!this.ready) return;
    // Automated test browsers draw in software: a short range keeps them quick (the trees are still there).
    const test = typeof navigator !== "undefined" && navigator.webdriver;
    const nearR = test ? 12 : { low: 25, medium: 45, high: 70, ultra: 110 }[this.quality];
    for (const set of this.sets) {
      const small = PLANTS[set.kind].h[1] <= 3;
      const maxR = test ? (small ? 12 : 45) : small ? Math.min(view, nearR * 1.4) : view;
      const counts = new Map<Layer, number>();
      for (const sp of set.spots) {
        const d = Math.hypot(sp.x - camera.x, sp.z - camera.z);
        if (d > maxR) continue;
        const pool = d < nearR || !set.far.length ? set.near : set.far;
        const layer = pool[sp.v % Math.max(1, pool.length)];
        if (!layer) continue;
        const i = counts.get(layer) ?? 0;
        for (const im of layer.meshes) im.setMatrixAt(i, sp.m);
        counts.set(layer, i + 1);
      }
      for (const layer of [...set.near, ...set.far]) {
        const n = counts.get(layer) ?? 0;
        for (const im of layer.meshes) {
          im.count = n;
          im.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }
  dispose() {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => (o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).dispose());
  }
}
