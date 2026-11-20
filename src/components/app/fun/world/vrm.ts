import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { VRMLoaderPlugin, VRMUtils, type VRM, type VRMHumanBoneName } from "@pixiv/three-vrm";
import { ACCESSORIES, VRM_BASES, type Look } from "@/lib/fun-catalog";
import { accessoryMeshes } from "./avatar";
import type { Pose } from "./avatar";

// Anime characters from VRM models (VRoid-made, rigged, with face expressions and swinging hair) playing animations
// from a free library (Quaternius' Universal Animation Library), retargeted ahead of time to the VRM skeleton
// (scripts/retarget-ual.mjs). Hair, clothes and eyes can be tinted; accessories ride on the head, neck and back
// bones; height and head size are sliders. Copies of the same model share textures and geometry.

type Clip = { frames: number; loop: boolean; bones: Record<string, number[]>; hips: number[] };
type AnimFile = { fps: number; clips: Record<string, Clip> };

let animPromise: Promise<AnimFile> | null = null;
const loadAnims = () => (animPromise ??= fetch("/models/anims/ual.json").then((r) => r.json() as Promise<AnimFile>));

const bufCache = new Map<string, Promise<ArrayBuffer>>();
const fileOf = (base: string) => VRM_BASES.find((b) => b.key === base)?.file ?? VRM_BASES[0]!.file;
export const preloadBase = (base: string) => {
  const f = fileOf(base);
  if (!bufCache.has(f)) bufCache.set(f, fetch(f).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Could not load ${f}`)))));
  return bufCache.get(f)!;
};

// The first copy of each model keeps its textures and geometries; later copies use them instead of their own.
type Shared = { textures: THREE.Texture[]; geometries: THREE.BufferGeometry[]; users: number };
const shared = new Map<string, Shared>();
const TEX_KEYS = ["map", "shadeMultiplyTexture", "normalMap", "emissiveMap", "matcapTexture", "rimMultiplyTexture", "outlineWidthMultiplyTexture", "uvAnimationMaskTexture", "shadingShiftTexture", "alphaMap"] as const;
function slots(root: THREE.Object3D) {
  const tex: [Record<string, unknown>, string][] = [];
  const geo: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    geo.push(m);
    for (const mat of ([] as THREE.Material[]).concat(m.material)) for (const k of TEX_KEYS) if ((mat as unknown as Record<string, unknown>)[k]) tex.push([mat as unknown as Record<string, unknown>, k]);
  });
  return { tex, geo };
}

export type VrmAvatar = {
  root: THREE.Group;
  vrm: VRM;
  base: string;
  height: number;
  update: (dt: number, t: number, pose: Pose, lookTarget?: THREE.Object3D | null) => void;
  setLook: (l: Look) => void;
  dispose: () => void;
};

// VRoid hair (and some clothes) comes as dozens of pieces, one per glTF primitive: with a dozen characters in view
// that was most of the town's draw calls. Pieces with the same material, skeleton, bind pose and place, and no face
// shapes (morph targets), are merged into one skinned mesh.
function mergePieces(root: THREE.Object3D) {
  const groups = new Map<string, THREE.SkinnedMesh[]>();
  root.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh || Array.isArray(m.material) || Object.keys(m.geometry.morphAttributes).length || !m.parent) return;
    const attrs = Object.keys(m.geometry.attributes).sort().join(",");
    const key = [m.parent.uuid, (m.material as THREE.Material).uuid, m.skeleton.uuid, attrs, !!m.geometry.index, m.bindMatrix.elements.map((v) => v.toFixed(4)).join(","), m.matrix.elements.map((v) => v.toFixed(4)).join(",")].join("|");
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  });
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const merged = mergeGeometries(list.map((m) => m.geometry), false);
    if (!merged) continue;
    const first = list[0]!;
    const mesh = new THREE.SkinnedMesh(merged, first.material);
    mesh.name = first.name;
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    mesh.bind(first.skeleton, first.bindMatrix);
    first.parent!.add(mesh);
    for (const m of list) (m.parent!.remove(m), m.geometry.dispose());
  }
}

const tmpQ = new THREE.Quaternion();
const E = (x: number, y: number, z: number) => tmpQ.clone().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));

// Tints for a look: the material names in VRoid models say what they are.
function tint(vrm: VRM, l: Look, originals: Map<THREE.Material, THREE.Color>) {
  vrm.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of ([] as THREE.Material[]).concat(m.material)) {
      const c = (mat as THREE.Material & { color?: THREE.Color }).color;
      if (!c) continue;
      if (!originals.has(mat)) originals.set(mat, c.clone());
      const base = originals.get(mat)!;
      const n = mat.name.toLowerCase();
      // Mixed with white so the model's own shading and detail stay.
      const mix = (hex: string, k: number) => c.copy(base).multiply(new THREE.Color("#ffffff").lerp(new THREE.Color(hex), k));
      if (/hair/.test(n) && !/face|brow/.test(n)) mix(l.hair, l.tintHair ? 0.75 : 0);
      else if (/iris/.test(n)) mix(l.eyes, l.tintEyes ? 0.7 : 0);
      else if (/tops|cloth|huku|onepiece|jacket|wear/.test(n) && !/bottom|shoe/.test(n)) mix(l.shirt, l.tintClothes ? 0.65 : 0);
      else if (/bottom/.test(n)) mix(l.pants, l.tintClothes ? 0.65 : 0);
      else if (/shoe/.test(n)) mix(l.shoes, l.tintClothes ? 0.6 : 0);
      else c.copy(base);
    }
  });
}

export async function createVrmAvatar(look: Look, opts: { shareKey?: string } = {}): Promise<VrmAvatar> {
  const base = look.base || VRM_BASES[0]!.key;
  const [buf, anims] = await Promise.all([preloadBase(base), loadAnims()]);
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await loader.parseAsync(buf.slice(0), "");
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  const v0 = vrm.meta?.metaVersion === "0";
  if (v0) VRMUtils.rotateVRM0(vrm);
  mergePieces(vrm.scene);
  // Culled when out of view, with bounds half again as big as the standing pose (arms and legs move); the face
  // (inside the head and hair) casts no shadow.
  vrm.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = !/face/i.test(m.name);
    if (m.isSkinnedMesh) {
      // From the rest pose in the geometry (the bones have not moved yet, so the skinned bounds would be empty).
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      m.boundingSphere = m.geometry.boundingSphere!.clone();
      m.boundingSphere.radius = m.boundingSphere.radius * 1.5 + 0.3;
      m.frustumCulled = true;
    } else m.frustumCulled = false;
  });
  // Share textures and geometries with the first copy of this model.
  const key = opts.shareKey ?? base;
  const mine = slots(vrm.scene);
  const s = shared.get(key);
  if (s && s.textures.length === mine.tex.length && s.geometries.length === mine.geo.length) {
    mine.tex.forEach(([mat, k], i) => {
      (mat[k] as THREE.Texture).dispose();
      mat[k] = s.textures[i];
    });
    mine.geo.forEach((m, i) => {
      m.geometry.dispose();
      m.geometry = s.geometries[i]!;
    });
    s.users++;
  } else if (!s) shared.set(key, { textures: mine.tex.map(([mat, k]) => mat[k] as THREE.Texture), geometries: mine.geo.map((m) => m.geometry), users: 1 });

  const root = new THREE.Group();
  root.add(vrm.scene);
  const H = vrm.humanoid;
  const node = (b: VRMHumanBoneName) => H.getNormalizedBoneNode(b);
  // VRM 0 models are turned around; their normalized rotations flip X and Z.
  const conv = (x: number, y: number, z: number, w: number) => (v0 ? [-x, y, -z, w] : [x, y, z, w]);
  const hipsNode = node("hips")!;
  const hipsY = hipsNode.position.y;
  const height = (node("head")?.getWorldPosition(new THREE.Vector3()).y ?? 1.4) + 0.15;

  // The clips, built for this skeleton.
  const mixer = new THREE.AnimationMixer(vrm.scene);
  const actions = new Map<string, THREE.AnimationAction>();
  const hasUpperChest = !!node("upperChest");
  for (const [name, c] of Object.entries(anims.clips)) {
    const times = Array.from({ length: c.frames }, (_, i) => i / anims.fps);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [bone, vals] of Object.entries(c.bones)) {
      let target = node(bone as VRMHumanBoneName);
      let values = vals;
      // Models without an upper chest: its turn goes into the neck and shoulders.
      if (!target) continue;
      if (!hasUpperChest && ["neck", "leftShoulder", "rightShoulder"].includes(bone) && c.bones.upperChest) {
        const uc = c.bones.upperChest;
        values = vals.map((_, i) => i).filter((i) => i % 4 === 0).flatMap((i) => {
          const q = new THREE.Quaternion(uc[i]! / 1e4, uc[i + 1]! / 1e4, uc[i + 2]! / 1e4, uc[i + 3]! / 1e4).multiply(new THREE.Quaternion(vals[i]! / 1e4, vals[i + 1]! / 1e4, vals[i + 2]! / 1e4, vals[i + 3]! / 1e4));
          return [q.x * 1e4, q.y * 1e4, q.z * 1e4, q.w * 1e4];
        });
      }
      const out: number[] = [];
      for (let i = 0; i < values.length; i += 4) out.push(...conv(values[i]! / 1e4, values[i + 1]! / 1e4, values[i + 2]! / 1e4, values[i + 3]! / 1e4));
      tracks.push(new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, times, out));
      target = null;
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, c.hips.flatMap((h) => [0, hipsY * (1 + h / 1e4), 0])));
    const clip = new THREE.AnimationClip(name, times[times.length - 1], tracks);
    const a = mixer.clipAction(clip);
    if (!c.loop) (a.setLoop(THREE.LoopOnce, 1), (a.clampWhenFinished = true));
    actions.set(name, a);
  }
  let current: THREE.AnimationAction | null = null;
  let currentName = "";
  const play = (name: string, fade = 0.25) => {
    if (name === currentName) return;
    const next = actions.get(name) ?? actions.get("idle")!;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    current?.fadeOut(fade);
    current = next;
    currentName = name;
  };
  play("idle", 0);

  // Accessories on the bones.
  const extra: THREE.Object3D[] = [];
  const originals = new Map<THREE.Material, THREE.Color>();
  const setLook = (l: Look) => {
    extra.forEach((o) => o.parent?.remove(o));
    extra.length = 0;
    const raw = (b: VRMHumanBoneName) => H.getRawBoneNode(b);
    const head = raw("head"), neck = raw("neck") ?? head, chest = raw("upperChest") ?? raw("chest") ?? raw("spine");
    const keys = [...l.acc, ACCESSORIES.find((a) => a.slot === "head" && a.model === l.hat)?.key].filter(Boolean) as string[];
    for (const k of keys) {
      const a = ACCESSORIES.find((x) => x.key === k);
      if (!a || !head || !chest) continue;
      // Built for a head of radius 0.2 around its centre; VRoid heads are smaller and the bone sits at the neck.
      const holder = new THREE.Group();
      const g = accessoryMeshes(a.model!, a.color ?? "#111827", l);
      const onHead = a.slot === "head" || a.slot === "face" || a.slot === "ears";
      holder.add(g.head);
      holder.scale.setScalar(0.62);
      if (onHead) holder.position.set(0, 0.1, v0 ? 0.0 : 0.0);
      (onHead ? head : a.slot === "neck" ? neck! : chest).add(holder);
      if (!onHead) {
        holder.position.set(0, a.slot === "neck" ? -0.05 : -0.1, 0);
        holder.add(g.body);
      }
      if (v0) holder.rotation.y = Math.PI;
      extra.push(holder);
    }
    tint(vrm, l, originals);
    root.scale.setScalar(1 + l.height * 0.08);
    head?.scale.setScalar(1 + l.head * 0.12);
  };
  setLook(look);

  // Emotes the library does not have, laid over the playing clip (normalized bones, T-pose based).
  const over = (b: VRMHumanBoneName, q: THREE.Quaternion, k = 1) => {
    const n = node(b);
    if (!n) return;
    const qq = v0 ? new THREE.Quaternion(-q.x, q.y, -q.z, q.w) : q;
    n.quaternion.slerp(qq, k);
  };
  const expr = (name: string, v: number) => vrm.expressionManager?.setValue(name, v);
  let blinkAt = performance.now() + 2500;
  let jumpPhase: "" | "up" | "air" = "";
  const update = (dt: number, t: number, p: Pose, lookTarget?: THREE.Object3D | null) => {
    // Pick the clip.
    let want = "idle";
    if (p.drive) want = "drive";
    else if (p.sit) want = "sit";
    else if (p.swim) want = p.speed > 0.05 ? "swim" : "swimIdle";
    else if (p.air) want = jumpPhase === "" ? "jumpStart" : "jumpLoop";
    else if (p.crouch) want = p.speed > 0.05 ? "crouchWalk" : "crouchIdle";
    else if (p.speed > 0.8) want = "sprint";
    else if (p.speed > 0.55) want = "jog";
    else if (p.speed > 0.05) want = "walk";
    else if (p.emote === "dance") want = "dance";
    else if (p.emote === "talk") want = "talk";
    else if (p.aim) want = "aim";
    else if (p.emote === "interact") want = "interact";
    else if (p.emote === "push") want = "push";
    if (p.air && jumpPhase === "") jumpPhase = "up";
    if (p.air && jumpPhase === "up" && (actions.get("jumpStart")?.time ?? 0) > 0.4) jumpPhase = "air";
    if (!p.air) jumpPhase = "";
    play(want, want.startsWith("jump") ? 0.12 : 0.25);
    mixer.update(dt);
    // Emotes on top.
    let face = "neutral";
    switch (p.emote) {
      case "wave":
        over("rightUpperArm", E(0, 0, -1.25 + Math.sin(t * 9) * 0.25));
        over("rightLowerArm", E(0, -0.9, 0));
        face = "happy";
        break;
      case "cheer":
        over("rightUpperArm", E(0, 0, -1.3));
        over("leftUpperArm", E(0, 0, 1.3));
        over("rightLowerArm", E(0, 0, -0.3));
        over("leftLowerArm", E(0, 0, 0.3));
        face = "happy";
        break;
      case "clap": {
        const c = Math.sin(t * 16) * 0.15;
        over("rightUpperArm", E(0, 0.9 + c, 1.1));
        over("leftUpperArm", E(0, -0.9 - c, -1.1));
        over("rightLowerArm", E(0, 1.4, 0));
        over("leftLowerArm", E(0, -1.4, 0));
        face = "happy";
        break;
      }
      case "bow":
        over("spine", E(0.5, 0, 0));
        over("chest", E(0.3, 0, 0));
        face = "relaxed";
        break;
      case "laugh":
        over("head", E(-0.25 + Math.sin(t * 18) * 0.05, 0, 0));
        over("chest", E(-0.1, 0, 0));
        face = "happy";
        break;
      case "cry":
        over("head", E(0.4, 0, 0));
        over("rightUpperArm", E(0, 0.6, 1.0));
        over("leftUpperArm", E(0, -0.6, -1.0));
        over("rightLowerArm", E(0, 2.0, 0));
        over("leftLowerArm", E(0, -2.0, 0));
        face = "sad";
        break;
      case "jump":
      case "wow":
        face = "surprised";
        break;
      case "dance":
        face = "happy";
        break;
    }
    if (p.mood) face = p.mood;
    for (const n of ["happy", "sad", "angry", "relaxed", "surprised"]) expr(n, n === face ? 1 : 0);
    // Blink now and then (not while smiling with closed eyes).
    const now = performance.now();
    expr("blink", face === "neutral" && now > blinkAt && now < blinkAt + 140 ? 1 : 0);
    if (now > blinkAt + 140) blinkAt = now + 2500 + Math.random() * 3500;
    if (vrm.lookAt) vrm.lookAt.target = lookTarget ?? null;
    vrm.update(dt);
  };
  return {
    root,
    vrm,
    base,
    height,
    update,
    setLook,
    dispose: () => {
      mixer.stopAllAction();
      extra.forEach((o) => o.traverse((x) => (x as THREE.Mesh).geometry?.dispose?.()));
      const sh = shared.get(key);
      if (sh && sh.users > 1) {
        // Others still use the shared textures and geometries: free only materials.
        sh.users--;
        vrm.scene.traverse((o) => ([] as THREE.Material[]).concat((o as THREE.Mesh).material ?? []).forEach((m) => m.dispose()));
      } else {
        shared.delete(key);
        VRMUtils.deepDispose(vrm.scene);
      }
    },
  };
}
