import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Real props (Poly Haven, CC0; public/models/props, see the asset manifest): each file loads once and is cloned
// where it is used (geometry and textures shared). Sizes are fitted to the space they stand in.

export const PROP_KEYS = ["sofa", "sofa_modern", "armchair", "armchair_classic", "table", "table_round", "coffee_table", "chair", "chair_plastic", "school_chair", "tv", "shelves", "shelves_steel", "ceiling_lamp", "plant", "plant_small", "picnic", "outdoor_set", "coffee_cart", "trash", "aircon", "utility_box", "wet_sign", "barrel", "barrel_blue", "crate", "cardboard", "tyre", "power_box", "rock", "fern", "shrub"] as const;
export type PropKey = (typeof PROP_KEYS)[number];

const cache = new Map<string, Promise<THREE.Object3D>>();
function load(key: string) {
  if (!cache.has(key)) {
    const l = new GLTFLoader();
    l.setMeshoptDecoder(MeshoptDecoder);
    cache.set(
      key,
      l.loadAsync(`/models/props/${key}.glb`).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) (m.castShadow = true), (m.receiveShadow = true);
        });
        return g.scene;
      }),
    );
  }
  return cache.get(key)!;
}

// Props are drawn only within a distance of the camera that depends on the graphics level (Town calls this a few
// times a second); a street of shops has hundreds of them.
const PLACED = new Set<THREE.Object3D>();
const _w = new THREE.Vector3();
export function updatePropDetail(camera: THREE.Vector3, range: number) {
  for (const h of PLACED) {
    if (!h.parent) {
      PLACED.delete(h);
      continue;
    }
    h.getWorldPosition(_w);
    h.visible = _w.distanceToSquared(camera) < range * range;
  }
}
export function forgetPropDetail(root: THREE.Object3D) {
  for (const h of PLACED) {
    let top: THREE.Object3D = h;
    while (top.parent) top = top.parent;
    if (top === root) PLACED.delete(h);
  }
}

// A copy of a prop on the floor at (x, z), turned ry; fit: the size to fit into (width, depth) when given.
export async function placeProp(parent: THREE.Object3D, key: string, x: number, z: number, ry: number, fit?: { w: number; d: number; y?: number }) {
  if (!(PROP_KEYS as readonly string[]).includes(key)) return null;
  const src = await load(key).catch(() => null);
  if (!src) return null;
  const o = src.clone(true);
  const holder = new THREE.Group();
  holder.add(o);
  if (fit) {
    const b = new THREE.Box3().setFromObject(o);
    const s = b.getSize(new THREE.Vector3());
    const k = Math.min(fit.w / Math.max(0.01, s.x), fit.d / Math.max(0.01, s.z));
    o.scale.multiplyScalar(Math.min(2.5, Math.max(0.3, k)));
  }
  const b2 = new THREE.Box3().setFromObject(o);
  o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y + (fit?.y ?? 0), -(b2.min.z + b2.max.z) / 2);
  holder.position.set(x, 0, z);
  holder.rotation.y = ry;
  parent.add(holder);
  PLACED.add(holder);
  return holder;
}

// The real model for a piece of furniture from the catalog, when there is one.
export const FURNITURE_PROP: Record<string, PropKey> = { sofa: "sofa", armchair: "armchair", table: "table", chair: "chair", tv: "tv", shelf: "shelves", plant: "plant", desk: "table" };
