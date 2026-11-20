// Turns the Universal Animation Library (Quaternius, CC0) into small animation files for VRM humanoids:
// node scripts/retarget-ual.mjs <AnimationLibrary_Godot_Standard.glb> <out.json>
// For each clip it plays the source skeleton (forward kinematics), measures every bone's world rotation against the
// library's own T-pose, and writes the change as the local rotation of the matching VRM "normalized" bone (whose
// rest pose is a T-pose with no rotation). Hips height is kept relative to the T-pose; sideways root motion is dropped
// so loops play in place. Rotations are rounded to 1/10000.
import fs from "node:fs";
import * as THREE from "three";

const [, , src, dst] = process.argv;
const d = fs.readFileSync(src);
const jlen = d.readUInt32LE(12);
const j = JSON.parse(d.subarray(20, 20 + jlen).toString("utf8"));
const binOff = 20 + jlen + 8;
const bin = d.subarray(binOff, binOff + d.readUInt32LE(20 + jlen));

const COMP = { 5126: 4 };
const NUM = { SCALAR: 1, VEC3: 3, VEC4: 4 };
function accessor(i) {
  const a = j.accessors[i];
  const v = j.bufferViews[a.bufferView];
  const n = NUM[a.type];
  const out = new Float32Array(a.count * n);
  const base = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const stride = v.byteStride ?? n * COMP[a.componentType];
  for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = bin.readFloatLE(base + k * stride + c * 4);
  return out;
}

// The skeleton: parents and rest transforms.
const parent = new Map();
j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
const byName = new Map(j.nodes.map((n, i) => [n.name, i]));
const restT = j.nodes.map((n) => new THREE.Vector3(...(n.translation ?? [0, 0, 0])));
const restR = j.nodes.map((n) => new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])));

const MAP = {
  hips: "DEF-hips", spine: "DEF-spine.001", chest: "DEF-spine.002", upperChest: "DEF-spine.003", neck: "DEF-neck", head: "DEF-head",
  leftShoulder: "DEF-shoulder.L", leftUpperArm: "DEF-upper_arm.L", leftLowerArm: "DEF-forearm.L", leftHand: "DEF-hand.L",
  rightShoulder: "DEF-shoulder.R", rightUpperArm: "DEF-upper_arm.R", rightLowerArm: "DEF-forearm.R", rightHand: "DEF-hand.R",
  leftUpperLeg: "DEF-thigh.L", leftLowerLeg: "DEF-shin.L", leftFoot: "DEF-foot.L", leftToes: "DEF-toe.L",
  rightUpperLeg: "DEF-thigh.R", rightLowerLeg: "DEF-shin.R", rightFoot: "DEF-foot.R", rightToes: "DEF-toe.R",
  leftThumbMetacarpal: "DEF-thumb.01.L", leftThumbProximal: "DEF-thumb.02.L", leftThumbDistal: "DEF-thumb.03.L",
  leftIndexProximal: "DEF-f_index.01.L", leftIndexIntermediate: "DEF-f_index.02.L", leftMiddleProximal: "DEF-f_middle.01.L", leftMiddleIntermediate: "DEF-f_middle.02.L",
  leftRingProximal: "DEF-f_ring.01.L", leftRingIntermediate: "DEF-f_ring.02.L", leftLittleProximal: "DEF-f_pinky.01.L", leftLittleIntermediate: "DEF-f_pinky.02.L",
  rightThumbMetacarpal: "DEF-thumb.01.R", rightThumbProximal: "DEF-thumb.02.R", rightThumbDistal: "DEF-thumb.03.R",
  rightIndexProximal: "DEF-f_index.01.R", rightIndexIntermediate: "DEF-f_index.02.R", rightMiddleProximal: "DEF-f_middle.01.R", rightMiddleIntermediate: "DEF-f_middle.02.R",
  rightRingProximal: "DEF-f_ring.01.R", rightRingIntermediate: "DEF-f_ring.02.R", rightLittleProximal: "DEF-f_pinky.01.R", rightLittleIntermediate: "DEF-f_pinky.02.R",
};
// The VRM parent of each humanoid bone (so local = parent's change undone, then this bone's change).
const VPARENT = {
  spine: "hips", chest: "spine", upperChest: "chest", neck: "upperChest", head: "neck",
  leftShoulder: "upperChest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "upperChest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", leftToes: "leftFoot",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg", rightToes: "rightFoot",
};
for (const s of ["left", "right"]) {
  VPARENT[`${s}ThumbMetacarpal`] = `${s}Hand`;
  VPARENT[`${s}ThumbProximal`] = `${s}ThumbMetacarpal`;
  VPARENT[`${s}ThumbDistal`] = `${s}ThumbProximal`;
  for (const f of ["Index", "Middle", "Ring", "Little"]) {
    VPARENT[`${s}${f}Proximal`] = `${s}Hand`;
    VPARENT[`${s}${f}Intermediate`] = `${s}${f}Proximal`;
  }
}

// Sample a clip at time t: local rotations and translations of every node.
function sampler(anim) {
  const tracks = anim.channels.map((c) => {
    const s = anim.samplers[c.sampler];
    return { node: c.target.node, path: c.target.path, times: accessor(s.input), values: accessor(s.output), step: s.interpolation === "STEP" };
  });
  const dur = Math.max(...tracks.map((t) => t.times[t.times.length - 1] ?? 0));
  const at = (t) => {
    const R = restR.map((q) => q.clone()), T = restT.map((v) => v.clone());
    for (const tr of tracks) {
      const ts = tr.times;
      let k = 0;
      while (k < ts.length - 1 && ts[k + 1] <= t) k++;
      const k2 = Math.min(ts.length - 1, k + 1);
      const f = k2 === k || tr.step ? 0 : Math.min(1, Math.max(0, (t - ts[k]) / (ts[k2] - ts[k])));
      if (tr.path === "rotation") {
        const a = new THREE.Quaternion().fromArray(tr.values, k * 4), b = new THREE.Quaternion().fromArray(tr.values, k2 * 4);
        R[tr.node] = a.slerp(b, f);
      } else if (tr.path === "translation") {
        const a = new THREE.Vector3().fromArray(tr.values, k * 3), b = new THREE.Vector3().fromArray(tr.values, k2 * 3);
        T[tr.node] = a.lerp(b, f);
      }
    }
    // World transforms.
    const WR = new Array(j.nodes.length), WT = new Array(j.nodes.length);
    const world = (i) => {
      if (WR[i]) return;
      const p = parent.get(i);
      if (p === undefined) (WR[i] = R[i].clone()), (WT[i] = T[i].clone());
      else {
        world(p);
        WR[i] = WR[p].clone().multiply(R[i]);
        WT[i] = T[i].clone().applyQuaternion(WR[p]).add(WT[p]);
      }
    };
    j.nodes.forEach((_, i) => world(i));
    return { WR, WT };
  };
  return { at, dur };
}

const tpose = sampler(j.animations.find((a) => a.name === "A_TPose")).at(0);
// Which way does the rig face? Its left hand should be at +X when facing +Z (the VRM 1.0 direction).
const lx = tpose.WT[byName.get("DEF-hand.L")].x;
const flip = lx < 0;
const Y180 = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
const hipsRestY = tpose.WT[byName.get("DEF-hips")].y;
console.log("left hand x in T-pose", lx.toFixed(3), flip ? "(facing -Z: turning)" : "(facing +Z)", "hips height", hipsRestY.toFixed(3));

const WANT = {
  idle: "Idle_Loop", talk: "Idle_Talking_Loop", walk: "Walk_Loop", walkFormal: "Walk_Formal_Loop", jog: "Jog_Fwd_Loop", sprint: "Sprint_Loop",
  jumpStart: "Jump_Start", jumpLoop: "Jump_Loop", jumpLand: "Jump_Land", crouchIdle: "Crouch_Idle_Loop", crouchWalk: "Crouch_Fwd_Loop",
  dance: "Dance_Loop", drive: "Driving_Loop", sitEnter: "Sitting_Enter", sit: "Sitting_Idle_Loop", sitTalk: "Sitting_Talking_Loop", sitExit: "Sitting_Exit",
  interact: "Interact", pickUp: "PickUp_Table", push: "Push_Loop", roll: "Roll", swim: "Swim_Fwd_Loop", swimIdle: "Swim_Idle_Loop",
  punch: "Punch_Jab", hit: "Hit_Chest", aim: "Pistol_Aim_Neutral", shoot: "Pistol_Shoot", spell: "Spell_Simple_Shoot", fix: "Fixing_Kneeling", death: "Death01",
};
const FPS = 30;
const out = { fps: FPS, source: "Universal Animation Library by Quaternius (CC0)", clips: {} };
for (const [key, name] of Object.entries(WANT)) {
  const anim = j.animations.find((a) => a.name === name);
  if (!anim) {
    console.log("missing", name);
    continue;
  }
  const s = sampler(anim);
  const frames = Math.max(2, Math.round(s.dur * FPS) + 1);
  const bones = {};
  const hips = [];
  const delta = (pose, vb) => {
    const i = byName.get(MAP[vb]);
    // How far this bone turned in the world, compared with the T-pose.
    let q = pose.WR[i].clone().multiply(tpose.WR[i].clone().invert());
    if (flip) q = Y180.clone().multiply(q).multiply(Y180.clone().invert());
    return q;
  };
  for (let f = 0; f < frames; f++) {
    const pose = s.at(Math.min(s.dur, f / FPS));
    for (const vb of Object.keys(MAP)) {
      const dq = delta(pose, vb);
      const local = VPARENT[vb] ? delta(pose, VPARENT[vb]).invert().multiply(dq) : dq;
      (bones[vb] ??= []).push(...[local.x, local.y, local.z, local.w].map((v) => Math.round(v * 10000)));
    }
    const hp = pose.WT[byName.get("DEF-hips")];
    hips.push(Math.round(((hp.y - hipsRestY) / hipsRestY) * 10000));
  }
  // Bones that never move are left out.
  for (const [b, v] of Object.entries(bones)) {
    let still = true;
    for (let k = 4; k < v.length && still; k++) if (Math.abs(v[k] - v[k % 4]) > 15) still = false;
    if (still && v[0] === 0 && v[1] === 0 && v[2] === 0) delete bones[b];
  }
  out.clips[key] = { frames, loop: /Loop$/.test(name), bones, hips };
  console.log(key, name, frames, "frames", Object.keys(bones).length, "bones");
}
fs.writeFileSync(dst, JSON.stringify(out));
console.log("wrote", dst, (fs.statSync(dst).size / 1024).toFixed(0), "KB");
