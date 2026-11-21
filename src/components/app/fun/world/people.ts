import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { VRMHumanoid, type VRMHumanBoneName, type VRMHumanBones } from "@pixiv/three-vrm";
import type { Pose } from "./avatar";

// Realistic people: the Microsoft Rocketbox avatars (MIT; public/models/people, see the asset manifest), rigged
// with a 3ds Max Biped skeleton. Their bones are mapped to a humanoid rig (the same one the anime characters use),
// so the same retargeted animation library plays on them: idle, walk, jog, sprint, jumps, sitting, driving, talking,
// dancing. Faces move with their facial bones: the jaw opens and closes with speech (lip-sync), the eyelids blink,
// the mouth corners smile, the head turns to whoever they talk to. Each person has their own walk (stride and
// posture) and their own idle variation.

export const PEOPLE = [
  { key: "rb_m01", name: "Daniel", gender: "m" },
  { key: "rb_m05", name: "Samuel", gender: "m" },
  { key: "rb_m08", name: "Michael", gender: "m" },
  { key: "rb_m12", name: "Robert", gender: "m" },
  { key: "rb_f01", name: "Hana", gender: "f" },
  { key: "rb_f04", name: "Sara", gender: "f" },
  { key: "rb_f08", name: "Ruth", gender: "f" },
  { key: "rb_f12", name: "Lidya", gender: "f" },
] as const;
export const isPersonKey = (k: string) => PEOPLE.some((p) => p.key === k);

type Clip = { frames: number; loop: boolean; bones: Record<string, number[]>; hips: number[] };
type AnimFile = { fps: number; clips: Record<string, Clip> };
let animPromise: Promise<AnimFile> | null = null;
const loadAnims = () => (animPromise ??= fetch("/models/anims/ual.json").then((r) => r.json() as Promise<AnimFile>));
const bufs = new Map<string, Promise<ArrayBuffer>>();
const fetchBuf = (key: string) => {
  if (!bufs.has(key)) bufs.set(key, fetch(`/models/people/${key}.glb`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`Could not load ${key}`)))));
  return bufs.get(key)!;
};
export const preloadPerson = (key: string) => void fetchBuf(key).catch(() => {});

// Biped bone names for the humanoid rig.
const MAP: Partial<Record<VRMHumanBoneName, string>> = {
  hips: "Bip01 Pelvis",
  spine: "Bip01 Spine",
  chest: "Bip01 Spine1",
  upperChest: "Bip01 Spine2",
  neck: "Bip01 Neck",
  head: "Bip01 Head",
  leftShoulder: "Bip01 L Clavicle",
  leftUpperArm: "Bip01 L UpperArm",
  leftLowerArm: "Bip01 L Forearm",
  leftHand: "Bip01 L Hand",
  rightShoulder: "Bip01 R Clavicle",
  rightUpperArm: "Bip01 R UpperArm",
  rightLowerArm: "Bip01 R Forearm",
  rightHand: "Bip01 R Hand",
  leftUpperLeg: "Bip01 L Thigh",
  leftLowerLeg: "Bip01 L Calf",
  leftFoot: "Bip01 L Foot",
  leftToes: "Bip01 L Toe0",
  rightUpperLeg: "Bip01 R Thigh",
  rightLowerLeg: "Bip01 R Calf",
  rightFoot: "Bip01 R Foot",
  rightToes: "Bip01 R Toe0",
  leftThumbMetacarpal: "Bip01 L Finger0",
  leftThumbProximal: "Bip01 L Finger01",
  leftThumbDistal: "Bip01 L Finger02",
  leftIndexProximal: "Bip01 L Finger1",
  leftIndexIntermediate: "Bip01 L Finger11",
  leftIndexDistal: "Bip01 L Finger12",
  leftMiddleProximal: "Bip01 L Finger2",
  leftMiddleIntermediate: "Bip01 L Finger21",
  leftMiddleDistal: "Bip01 L Finger22",
  leftRingProximal: "Bip01 L Finger3",
  leftRingIntermediate: "Bip01 L Finger31",
  leftRingDistal: "Bip01 L Finger32",
  leftLittleProximal: "Bip01 L Finger4",
  leftLittleIntermediate: "Bip01 L Finger41",
  leftLittleDistal: "Bip01 L Finger42",
  rightThumbMetacarpal: "Bip01 R Finger0",
  rightThumbProximal: "Bip01 R Finger01",
  rightThumbDistal: "Bip01 R Finger02",
  rightIndexProximal: "Bip01 R Finger1",
  rightIndexIntermediate: "Bip01 R Finger11",
  rightIndexDistal: "Bip01 R Finger12",
  rightMiddleProximal: "Bip01 R Finger2",
  rightMiddleIntermediate: "Bip01 R Finger21",
  rightMiddleDistal: "Bip01 R Finger22",
  rightRingProximal: "Bip01 R Finger3",
  rightRingIntermediate: "Bip01 R Finger31",
  rightRingDistal: "Bip01 R Finger32",
  rightLittleProximal: "Bip01 R Finger4",
  rightLittleIntermediate: "Bip01 R Finger41",
  rightLittleDistal: "Bip01 R Finger42",
};

export type PersonAvatar = {
  root: THREE.Group;
  key: string;
  height: number;
  update: (dt: number, t: number, pose: Pose, lookTarget?: THREE.Object3D | null) => void;
  // 0..1 how loud the person is speaking now (moves the jaw); set by the speech system.
  speak: (level: number) => void;
  dispose: () => void;
};

const q = new THREE.Quaternion();
const E = (x: number, y: number, z: number) => q.clone().setFromEuler(new THREE.Euler(x, y, z, "XYZ"));
// Turn a bone by a world-space rotation (in its rest pose).
function turnWorld(bone: THREE.Object3D, rot: THREE.Quaternion) {
  const parentQ = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
  const worldQ = bone.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parentQ.clone().invert().multiply(rot).multiply(worldQ));
  bone.updateMatrixWorld(true);
}

// Each person's model is parsed once; every copy in town is a clone sharing its geometry, materials and textures.
const sources = new Map<string, Promise<THREE.Object3D>>();
function source(key: string) {
  if (!sources.has(key))
    sources.set(
      key,
      fetchBuf(key).then(async (buf) => {
        const loader = new GLTFLoader();
        loader.setMeshoptDecoder(MeshoptDecoder);
        return (await loader.parseAsync(buf.slice(0), "")).scene;
      }),
    );
  return sources.get(key)!;
}

export async function createPerson(key: string, opts: { seed?: number } = {}): Promise<PersonAvatar> {
  const [src, anims] = await Promise.all([source(key), loadAnims()]);
  const model = cloneSkinned(src);
  const root = new THREE.Group();
  root.add(model);
  model.traverse((o) => {
    o.frustumCulled = false;
    const m = o as THREE.SkinnedMesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
      for (const mat of ([] as THREE.Material[]).concat(m.material)) {
        const s = mat as THREE.MeshStandardMaterial;
        s.envMapIntensity = 0.7;
        // Hair and lashes: cut out cleanly.
        if (s.alphaTest > 0) s.side = THREE.DoubleSide;
      }
    }
  });
  model.updateMatrixWorld(true);
  const bone = (n: string) => model.getObjectByName(n) ?? model.getObjectByName(n.replace(/ /g, "_"));
  // The model's size: Rocketbox is in centimetres in some exports; scale to about 1.75 m from feet to head top.
  const box = new THREE.Box3().setFromObject(model);
  const tall = box.max.y - box.min.y;
  if (tall > 10) model.scale.multiplyScalar(1 / 100);
  else if (tall < 0.5) model.scale.multiplyScalar(100);
  model.updateMatrixWorld(true);
  const box2 = new THREE.Box3().setFromObject(model);
  model.position.y -= box2.min.y;
  model.updateMatrixWorld(true);

  // Face +z (as the town's characters do): if the left hand is on -x the model faces -z, so turn it round.
  const lh = bone("Bip01 L Hand")?.getWorldPosition(new THREE.Vector3()) ?? new THREE.Vector3(1, 0, 0);
  if (lh.x < 0) {
    model.rotation.y += Math.PI;
    model.updateMatrixWorld(true);
  }
  // Arms out level (T-pose) before the rig takes its rest pose: the clips are made for a T-pose.
  for (const side of ["L", "R"] as const) {
    const ua = bone(`Bip01 ${side} UpperArm`), fa = bone(`Bip01 ${side} Forearm`), hand = bone(`Bip01 ${side} Hand`);
    if (!ua || !fa || !hand) continue;
    const want = new THREE.Vector3(side === "L" ? 1 : -1, 0, 0);
    const a = ua.getWorldPosition(new THREE.Vector3()), b = fa.getWorldPosition(new THREE.Vector3());
    turnWorld(ua, new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), want));
    const c = fa.getWorldPosition(new THREE.Vector3()), d = hand.getWorldPosition(new THREE.Vector3());
    turnWorld(fa, new THREE.Quaternion().setFromUnitVectors(d.clone().sub(c).normalize(), want));
  }
  // Legs straight down.
  for (const side of ["L", "R"] as const) {
    const th = bone(`Bip01 ${side} Thigh`), ca = bone(`Bip01 ${side} Calf`), ft = bone(`Bip01 ${side} Foot`);
    if (!th || !ca || !ft) continue;
    const down = new THREE.Vector3(0, -1, 0);
    const a = th.getWorldPosition(new THREE.Vector3()), b = ca.getWorldPosition(new THREE.Vector3());
    turnWorld(th, new THREE.Quaternion().setFromUnitVectors(b.clone().sub(a).normalize(), down));
    const c = ca.getWorldPosition(new THREE.Vector3()), d = ft.getWorldPosition(new THREE.Vector3());
    turnWorld(ca, new THREE.Quaternion().setFromUnitVectors(d.clone().sub(c).normalize(), down));
  }

  const human: VRMHumanBones = {} as VRMHumanBones;
  for (const [hb, n] of Object.entries(MAP)) {
    const node = bone(n!);
    if (node) (human as Record<string, { node: THREE.Object3D }>)[hb] = { node };
  }
  const H = new VRMHumanoid(human, { autoUpdateHumanBones: true });
  root.add(H.normalizedHumanBonesRoot);
  const node = (b: VRMHumanBoneName) => H.getNormalizedBoneNode(b);
  const hipsNode = node("hips")!;
  const hipsY = hipsNode.position.y;
  const headBone = bone("Bip01 Head");
  const height = (headBone?.getWorldPosition(new THREE.Vector3()).y ?? 1.6) + 0.14;

  // Clips.
  const mixer = new THREE.AnimationMixer(H.normalizedHumanBonesRoot);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const [name, c] of Object.entries(anims.clips)) {
    const times = Array.from({ length: c.frames }, (_, i) => i / anims.fps);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [b, vals] of Object.entries(c.bones)) {
      const target = node(b as VRMHumanBoneName);
      if (!target) continue;
      const out: number[] = [];
      for (let i = 0; i < vals.length; i += 4) out.push(vals[i]! / 1e4, vals[i + 1]! / 1e4, vals[i + 2]! / 1e4, vals[i + 3]! / 1e4);
      tracks.push(new THREE.QuaternionKeyframeTrack(`${target.name}.quaternion`, times, out));
    }
    tracks.push(new THREE.VectorKeyframeTrack(`${hipsNode.name}.position`, times, c.hips.flatMap((h) => [0, hipsY * (1 + h / 1e4), 0])));
    const a = mixer.clipAction(new THREE.AnimationClip(name, times[times.length - 1], tracks));
    if (!c.loop) (a.setLoop(THREE.LoopOnce, 1), (a.clampWhenFinished = true));
    actions.set(name, a);
  }
  // Each person moves a little differently: their own pace and idle.
  const seed = opts.seed ?? key.charCodeAt(key.length - 1);
  const pace = 0.92 + (seed % 7) * 0.025;
  let current: THREE.AnimationAction | null = null;
  let currentName = "";
  const play = (name: string, fade = 0.3) => {
    if (name === currentName) return;
    const next = actions.get(name) ?? actions.get("idle")!;
    next.reset().setEffectiveWeight(1).fadeIn(fade).play();
    next.timeScale = name === "walk" || name === "jog" ? pace : 1;
    current?.fadeOut(fade);
    current = next;
    currentName = name;
  };
  play("idle", 0);

  // Face: jaw, eyelids, mouth corners and eyes (facial bones), turned in their rest frame.
  const jaw = bone("Bip01 MJaw");
  const lidsTop = [bone("Bip01 LEyeBlinkTop"), bone("Bip01 REyeBlinkTop")].filter(Boolean) as THREE.Object3D[];
  const corners = [bone("Bip01 LMouthCorner"), bone("Bip01 RMouthCorner")].filter(Boolean) as THREE.Object3D[];
  const rest = new Map<THREE.Object3D, { q: THREE.Quaternion; p: THREE.Vector3 }>();
  for (const b of [jaw, ...lidsTop, ...corners]) if (b) rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() });
  let speech = 0, speechNow = 0;
  let blinkAt = performance.now() + 2000;
  let jumpPhase: "" | "up" | "air" = "";
  const lookQ = new THREE.Quaternion();

  const over = (b: VRMHumanBoneName, rot: THREE.Quaternion, k = 1) => node(b)?.quaternion.slerp(rot, k);
  const update = (dt: number, t: number, p: Pose, lookTarget?: THREE.Object3D | null) => {
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
    else if (p.emote === "talk" || speech > 0.05) want = "talk";
    else if (p.aim) want = "aim";
    else if (p.emote === "interact") want = "interact";
    if (p.air && jumpPhase === "") jumpPhase = "up";
    if (p.air && jumpPhase === "up" && (actions.get("jumpStart")?.time ?? 0) > 0.4) jumpPhase = "air";
    if (!p.air) jumpPhase = "";
    play(want, want.startsWith("jump") ? 0.12 : 0.3);
    mixer.update(dt);
    switch (p.emote) {
      case "wave":
        over("rightUpperArm", E(0, 0, -1.25 + Math.sin(t * 9) * 0.25));
        over("rightLowerArm", E(0, -0.9, 0));
        break;
      case "cheer":
        over("rightUpperArm", E(0, 0, -1.3));
        over("leftUpperArm", E(0, 0, 1.3));
        break;
      case "fight":
        over("rightUpperArm", E(0.6, 0.9, 1.1));
        over("leftUpperArm", E(0.6, -0.9, -1.1));
        over("rightLowerArm", E(0, 2.1, 0));
        over("leftLowerArm", E(0, -2.1, 0));
        break;
      case "punch":
        over("rightUpperArm", E(0, 1.45, 0.05));
        over("rightLowerArm", E(0, 0.15, 0));
        over("leftUpperArm", E(0.6, -0.9, -1.1));
        over("leftLowerArm", E(0, -2.1, 0));
        over("chest", E(0, 0.35, 0));
        break;
      case "highfive":
        over("rightUpperArm", E(0, 0.6, -1.1));
        over("rightLowerArm", E(0, -0.4, 0));
        break;
      case "hug":
        over("rightUpperArm", E(0, 1.2, 0.2));
        over("leftUpperArm", E(0, -1.2, -0.2));
        over("rightLowerArm", E(0, 1.1, 0));
        over("leftLowerArm", E(0, -1.1, 0));
        break;
      case "bow":
        over("spine", E(0.5, 0, 0));
        over("chest", E(0.3, 0, 0));
        break;
      case "laugh":
        over("head", E(-0.25 + Math.sin(t * 18) * 0.05, 0, 0));
        break;
      case "cry":
        over("head", E(0.45, 0, 0));
        over("rightUpperArm", E(0.9, 0.9, 1.25));
        over("leftUpperArm", E(0.9, -0.9, -1.25));
        over("rightLowerArm", E(0, 2.3, 0));
        over("leftLowerArm", E(0, -2.3, 0));
        break;
    }
    // The head turns towards whoever I talk to (within reach of a neck).
    if (lookTarget) {
      const h = node("head");
      if (h) {
        const hp = h.getWorldPosition(new THREE.Vector3());
        const tp = lookTarget.getWorldPosition(new THREE.Vector3());
        const local = root.worldToLocal(tp.clone()).sub(root.worldToLocal(hp.clone()));
        const yaw = Math.max(-1, Math.min(1, Math.atan2(local.x, local.z)));
        const pitch = Math.max(-0.4, Math.min(0.4, -Math.atan2(local.y, Math.hypot(local.x, local.z))));
        lookQ.setFromEuler(new THREE.Euler(pitch, yaw, 0, "YXZ"));
        h.quaternion.slerp(lookQ, 0.6);
      }
    }
    H.update();
    // Speech: the jaw follows the voice level (smoothed), with a little flutter for syllables.
    speechNow += (speech - speechNow) * Math.min(1, dt * 18);
    const open = speechNow * (0.55 + 0.45 * Math.abs(Math.sin(t * 13 + Math.sin(t * 5))));
    const restJ = jaw && rest.get(jaw);
    if (jaw && restJ) jaw.quaternion.copy(restJ.q).multiply(E(0, 0, open * 0.28));
    // Blinks.
    const now = performance.now();
    const blink = now > blinkAt && now < blinkAt + 130 ? 1 : 0;
    if (now > blinkAt + 130) blinkAt = now + 2200 + Math.random() * 3800;
    for (const l of lidsTop) {
      const r = rest.get(l);
      if (r) l.position.copy(r.p).add(new THREE.Vector3(0, -0.006 * blink, 0));
    }
    // A slight smile when waving or cheering.
    const smile = p.emote === "wave" || p.emote === "cheer" || p.emote === "laugh" ? 1 : 0;
    corners.forEach((c, i) => {
      const r = rest.get(c);
      if (r) c.position.copy(r.p).add(new THREE.Vector3(0, 0.003 * smile, (i ? -1 : 1) * 0.002 * smile));
    });
  };
  return {
    root,
    key,
    height,
    update,
    speak: (level) => (speech = Math.max(0, Math.min(1, level))),
    // Geometry, materials and textures are shared with other copies (kept for the page's life).
    dispose: () => {
      mixer.stopAllAction();
      root.removeFromParent();
    },
  };
}
