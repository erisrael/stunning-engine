import * as THREE from "three";
import { ACCESSORIES, cleanLook, type Look } from "@/lib/fun-catalog";
import { capsule, cone, cyl, mesh, outline, sphere, toon, TOON, unitBox } from "./toon";

// Characters for Seed Town: an anime-style figure (cel shading, outlines, big drawn eyes, styled hair, outfits and
// accessories) built from simple shapes, with joints for walking, running, jumping, sitting, driving and emotes.
// Proportions follow the sliders in the character designer. The old blocky figure stays as a style.

export type Expression = "smile" | "cool" | "wink" | "calm" | "grin" | "pout" | "blink" | "laugh" | "cry" | "wow";
export type Pose = { speed: number; air: boolean; sit: boolean; drive: boolean; crouch: boolean; emote: string; aim?: boolean; swim?: boolean; mood?: string };
type Joints = Record<"hips" | "spine" | "neck" | "head" | "lHip" | "rHip" | "lKnee" | "rKnee" | "lShoulder" | "rShoulder" | "lElbow" | "rElbow", THREE.Object3D>;
export type Avatar = { root: THREE.Group; joints: Joints | null; look: Look; setFace: (e: Expression) => void; height: number; blinkAt: number; face: Expression; blocky?: Record<string, THREE.Mesh> };

// ------------------------------------------------------------------------------------------------- the face

const faceCache = new Map<string, THREE.Texture>();
function faceTexture(look: Look, e: Expression) {
  const key = `${look.eyes}|${look.eyeShape}|${e}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const ink = "#2a1b1b";
  const eyeY = 132, lx = 82, rx = 174;
  const shape = look.eyeShape;
  const closedArc = (x: number, up: boolean) => {
    g.strokeStyle = ink;
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    if (up) g.arc(x, eyeY + 12, 22, 1.15 * Math.PI, 1.85 * Math.PI);
    else g.arc(x, eyeY - 8, 22, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  };
  const openEye = (x: number, mirror: number) => {
    const h = shape === "sharp" ? 30 : shape === "sleepy" ? 26 : 38;
    const w = shape === "sharp" ? 27 : 24;
    // White of the eye.
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(x, eyeY, w, h, 0, 0, Math.PI * 2);
    g.fill();
    // Iris: dark at the top, light below, then the pupil and highlights.
    const grad = g.createLinearGradient(0, eyeY - h, 0, eyeY + h);
    const col = new THREE.Color(look.eyes);
    grad.addColorStop(0, `#${col.clone().multiplyScalar(0.35).getHexString()}`);
    grad.addColorStop(0.55, look.eyes);
    grad.addColorStop(1, `#${col.clone().lerp(new THREE.Color("#ffffff"), 0.45).getHexString()}`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, eyeY + 3, w * 0.82, h * 0.88, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#14090c";
    g.beginPath();
    g.ellipse(x, eyeY + 4, w * 0.36, h * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.ellipse(x + 8 * mirror, eyeY - h * 0.35, 8, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(x - 7 * mirror, eyeY + h * 0.4, 4, 4, 0, 0, Math.PI * 2);
    g.fill();
    if (shape === "sparkle") {
      g.fillStyle = "#fff";
      g.beginPath();
      const sx = x - 6 * mirror, sy = eyeY + 6;
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 2.5 : 8;
        g.lineTo(sx + Math.cos((i * Math.PI) / 4) * r, sy + Math.sin((i * Math.PI) / 4) * r);
      }
      g.fill();
    }
    // Lashes: a thick upper line, flicked at the outer corner.
    g.strokeStyle = ink;
    g.lineWidth = shape === "sharp" ? 8 : 7;
    g.lineCap = "round";
    g.beginPath();
    if (shape === "sleepy") {
      g.moveTo(x - w - 2, eyeY - h * 0.25);
      g.lineTo(x + w + 2, eyeY - h * 0.35);
    } else g.ellipse(x, eyeY, w + 2, h + 2, 0, Math.PI * 1.08, Math.PI * 1.92);
    g.stroke();
    g.beginPath();
    g.moveTo(x + (w + 1) * mirror, eyeY - h * 0.55);
    g.lineTo(x + (w + 11) * mirror, eyeY - h * 0.8);
    g.stroke();
    if (shape === "sleepy") {
      // The lid covers the top of the eye.
      g.fillStyle = "rgba(0,0,0,0)";
      g.globalCompositeOperation = "destination-out";
      g.fillRect(x - w - 4, eyeY - h - 4, 2 * w + 8, h * 0.72);
      g.globalCompositeOperation = "source-over";
    }
  };
  const closedEyes = e === "blink" || e === "laugh" || e === "cry";
  if (closedEyes) {
    closedArc(lx, e === "laugh");
    closedArc(rx, e === "laugh");
  } else {
    openEye(lx, -1);
    if (e === "wink") closedArc(rx, true);
    else openEye(rx, 1);
  }
  if (e === "cool" && !closedEyes) {
    // Half-lidded and confident.
    g.fillStyle = "rgba(0,0,0,0)";
    g.globalCompositeOperation = "destination-out";
    g.fillRect(lx - 30, eyeY - 44, 60, 22);
    g.fillRect(rx - 30, eyeY - 44, 60, 22);
    g.globalCompositeOperation = "source-over";
    g.strokeStyle = ink;
    g.lineWidth = 6;
    for (const x of [lx, rx]) (g.beginPath(), g.moveTo(x - 26, eyeY - 20), g.lineTo(x + 26, eyeY - 22), g.stroke());
  }
  // Brows.
  g.strokeStyle = ink;
  g.lineWidth = 5;
  g.lineCap = "round";
  const browLift = e === "wow" ? -10 : e === "pout" || e === "cry" ? 4 : 0;
  for (const [x, m] of [[lx, -1], [rx, 1]] as const) {
    g.beginPath();
    if (e === "pout" || e === "cry") (g.moveTo(x - 20 * m, eyeY - 52 + browLift), g.lineTo(x + 18 * m, eyeY - 60 + browLift));
    else g.arc(x, eyeY - 30 + browLift, 26, 1.25 * Math.PI, 1.75 * Math.PI);
    g.stroke();
  }
  // Blush.
  g.fillStyle = "rgba(255,120,140,.28)";
  for (const x of [lx - 8, rx + 8]) (g.beginPath(), g.ellipse(x, eyeY + 46, 20, 9, 0, 0, Math.PI * 2), g.fill());
  // Tears.
  if (e === "cry") {
    g.fillStyle = "rgba(96,165,250,.85)";
    for (const x of [lx, rx]) (g.beginPath(), g.roundRect(x - 6, eyeY + 10, 12, 70, 6), g.fill());
  }
  // Mouth.
  const my = 206;
  g.strokeStyle = ink;
  g.lineWidth = 5;
  g.beginPath();
  if (e === "grin" || e === "laugh") {
    g.fillStyle = "#7f1d1d";
    g.moveTo(108, my - 8);
    g.quadraticCurveTo(128, my - 4, 148, my - 8);
    g.quadraticCurveTo(146, my + 22, 128, my + 24);
    g.quadraticCurveTo(110, my + 22, 108, my - 8);
    g.fill();
    g.stroke();
    g.fillStyle = "#fb7185";
    g.beginPath();
    g.ellipse(128, my + 14, 10, 6, 0, 0, Math.PI * 2);
    g.fill();
  } else if (e === "wow" || e === "pout") {
    g.fillStyle = "#7f1d1d";
    g.ellipse(128, my + 2, e === "wow" ? 9 : 6, e === "wow" ? 12 : 5, 0, 0, Math.PI * 2);
    g.fill();
  } else if (e === "calm" || e === "cry") {
    g.moveTo(116, my + 4);
    g.lineTo(140, my + (e === "cry" ? 8 : 4));
    g.stroke();
  } else if (e === "cool") {
    g.moveTo(114, my + 2);
    g.quadraticCurveTo(132, my + 10, 146, my - 4);
    g.stroke();
  } else {
    g.arc(128, my - 6, 14, 0.2 * Math.PI, 0.8 * Math.PI);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  faceCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------------------------------------- pieces

const darker = (hex: string, k = 0.7) => `#${new THREE.Color(hex).multiplyScalar(k).getHexString()}`;
const lighter = (hex: string, k = 0.3) => `#${new THREE.Color(hex).lerp(new THREE.Color("#ffffff"), k).getHexString()}`;

function limb(parent: THREE.Object3D, r: number, len: number, mat: THREE.Material, y: number, withOutline: boolean) {
  const m = mesh(capsule(r, len), mat, 0, y, 0);
  if (withOutline) outline(m, 0.012);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function hair(head: THREE.Object3D, look: Look, detail: boolean) {
  const mat = toon(look.hair);
  const hi = toon(lighter(look.hair, 0.18));
  const add = (o: THREE.Mesh, line = true) => {
    if (line && detail) outline(o, 0.01);
    o.castShadow = true;
    head.add(o);
    return o;
  };
  const style = look.hairStyle;
  if (style === "bald") {
    add(mesh(new THREE.SphereGeometry(0.205, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), toon(darker(look.hair, 0.9)), 0, 0.02, -0.005), false);
    return;
  }
  // The cap of hair and the back of the head.
  add(mesh(new THREE.SphereGeometry(0.218, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.52), mat, 0, 0.025, -0.008, 1.03, 1.08, 1.04));
  const backLen = style === "bob" || style === "long" ? 0.86 : 0.74;
  add(mesh(new THREE.SphereGeometry(0.22, 18, 14, Math.PI, Math.PI, 0, Math.PI * backLen), mat, 0, 0.012, -0.012, 1.04, 1.02, 1.05));
  // Bangs over the forehead.
  const bangs = style === "spiky" || style === "messy" ? 6 : 5;
  for (let i = 0; i < bangs; i++) {
    const a = (i / (bangs - 1) - 0.5) * 1.6;
    const b = add(mesh(cone(6), i % 2 ? hi : mat, Math.sin(a) * 0.17, 0.11, Math.cos(a) * 0.17 + 0.02, 0.1, 0.17 + (i % 2) * 0.03, 0.06), false);
    b.rotation.set(Math.PI + 0.35, 0, -a * 0.35);
  }
  if (style === "spiky" || style === "messy") {
    const n = style === "spiky" ? 9 : 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const tilt = style === "messy" ? (Math.sin(i * 7.3) * 0.4 + 0.9) : 1;
      const s = add(mesh(cone(6), i % 3 ? mat : hi, Math.sin(a) * 0.14, 0.17, Math.cos(a) * 0.14 - 0.02, 0.11, 0.26 * tilt, 0.11), false);
      s.rotation.set(Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0);
    }
  }
  if (style === "bob" || style === "long") {
    for (const x of [-1, 1]) add(mesh(capsule(0.07, style === "long" ? 0.4 : 0.16), mat, x * 0.19, style === "long" ? -0.2 : -0.08, 0.02));
  }
  if (style === "long") add(mesh(capsule(0.15, 0.5), mat, 0, -0.35, -0.12, 1.2, 1, 0.55));
  if (style === "ponytail") {
    const tie = add(mesh(sphere(10), toon("#e11d48"), 0, 0.08, -0.22, 0.07, 0.07, 0.07), false);
    void tie;
    const tail = add(mesh(capsule(0.07, 0.36), mat, 0, -0.14, -0.29));
    tail.rotation.x = 0.3;
  }
  if (style === "twintails") {
    for (const x of [-1, 1]) {
      add(mesh(sphere(10), toon("#e11d48"), x * 0.2, 0.08, -0.06, 0.06, 0.06, 0.06), false);
      const t = add(mesh(capsule(0.065, 0.42), mat, x * 0.27, -0.18, -0.06));
      t.rotation.z = x * 0.18;
    }
  }
  if (style === "buns") for (const x of [-1, 1]) add(mesh(sphere(12), mat, x * 0.14, 0.2, -0.04, 0.15, 0.15, 0.15));
  // A single standing strand on top (the "ahoge").
  if (style === "short" || style === "messy" || style === "spiky") {
    const a = add(mesh(cone(5), mat, 0.02, 0.27, 0.02, 0.035, 0.16, 0.035), false);
    a.rotation.set(-0.5, 0, 0.3);
  }
}

function accessory(model: string, color: string, look: Look, head: THREE.Object3D, chest: THREE.Object3D, spine: THREE.Object3D) {
  const m = toon(color);
  const put = (p: THREE.Object3D, o: THREE.Mesh) => (p.add(o), o);
  switch (model) {
    case "cap": {
      put(head, mesh(new THREE.SphereGeometry(0.225, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), toon(look.shirt), 0, 0.05, 0, 1.04, 0.8, 1.04));
      put(head, mesh(cyl(16), toon(look.shirt), 0, 0.06, 0.2, 0.3, 0.02, 0.16));
      break;
    }
    case "beanie":
      put(head, mesh(new THREE.SphereGeometry(0.228, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m, 0, 0.05, 0, 1.03, 1.05, 1.03));
      put(head, mesh(sphere(8), toon("#f8fafc"), 0, 0.29, 0, 0.08, 0.08, 0.08));
      break;
    case "crown":
      put(head, mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.08, 10, 1, true), toon(color, { side: THREE.DoubleSide }), 0, 0.24, 0));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        put(head, mesh(cone(4), m, Math.sin(a) * 0.14, 0.31, Math.cos(a) * 0.14, 0.05, 0.08, 0.05));
      }
      break;
    case "halo": {
      const h = put(head, mesh(new THREE.TorusGeometry(0.15, 0.022, 6, 24), toon(color, { emissive: color }), 0, 0.36, 0));
      h.rotation.x = Math.PI / 2;
      break;
    }
    case "horns":
      for (const x of [-1, 1]) {
        const h = put(head, mesh(cone(6), m, x * 0.12, 0.25, 0.02, 0.06, 0.16, 0.06));
        h.rotation.z = -x * 0.4;
      }
      break;
    case "catears":
      for (const x of [-1, 1]) {
        const e = put(head, mesh(cone(4), toon(look.hair), x * 0.13, 0.25, -0.01, 0.12, 0.14, 0.06));
        e.rotation.z = -x * 0.35;
        const inner = put(head, mesh(cone(4), toon("#fda4af"), x * 0.13, 0.245, 0.015, 0.07, 0.09, 0.03));
        inner.rotation.z = -x * 0.35;
      }
      break;
    case "headphones": {
      const band = put(head, mesh(new THREE.TorusGeometry(0.23, 0.022, 6, 20, Math.PI), m, 0, 0.02, 0));
      band.rotation.z = 0;
      for (const x of [-1, 1]) put(head, mesh(cyl(14), m, x * 0.22, 0.0, 0, 0.11, 0.06, 0.11)).rotation.z = Math.PI / 2;
      break;
    }
    case "witch":
      put(head, mesh(cyl(20), m, 0, 0.2, 0, 0.6, 0.02, 0.6));
      put(head, mesh(cone(14), m, 0, 0.42, -0.03, 0.32, 0.44, 0.32)).rotation.x = -0.25;
      break;
    case "flowers":
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        put(head, mesh(sphere(8), toon(i % 2 ? color : "#fde047"), Math.sin(a) * 0.19, 0.2, Math.cos(a) * 0.19, 0.06, 0.05, 0.06));
      }
      break;
    case "glasses":
    case "shades":
      for (const x of [-1, 1]) {
        const lens = put(head, mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 16), m, x * 0.075, 0.0, 0.2));
        void lens;
        if (model === "shades") put(head, mesh(cyl(14), toon(color, { transparent: 0.75 }), x * 0.075, 0, 0.198, 0.09, 0.01, 0.09)).rotation.x = Math.PI / 2;
      }
      put(head, mesh(unitBox(), m, 0, 0.0, 0.205, 0.05, 0.01, 0.01));
      break;
    case "foxmask": {
      const mk = put(head, mesh(sphere(14), m, 0.08, 0.1, 0.17, 0.18, 0.2, 0.08));
      mk.rotation.z = 0.5;
      for (const x of [-1, 1]) put(head, mesh(cone(4), toon("#dc2626"), 0.08 + x * 0.06, 0.2, 0.17, 0.04, 0.06, 0.02));
      break;
    }
    case "chain":
      put(chest, mesh(new THREE.TorusGeometry(0.12, 0.012, 6, 20), m, 0, 0.12, 0.03)).rotation.x = Math.PI / 2 - 0.3;
      put(chest, mesh(unitBox(), m, 0, 0.03, 0.14, 0.04, 0.05, 0.015));
      break;
    case "scarf":
      put(chest, mesh(new THREE.TorusGeometry(0.1, 0.045, 8, 18), m, 0, 0.17, 0)).rotation.x = Math.PI / 2;
      put(chest, mesh(unitBox(), m, 0.06, 0.02, 0.12, 0.07, 0.2, 0.03)).rotation.z = 0.15;
      break;
    case "earrings":
      for (const x of [-1, 1]) put(head, mesh(sphere(8), toon(color, { emissive: darker(color, 0.3) }), x * 0.205, -0.07, 0, 0.03, 0.03, 0.03));
      break;
    case "backpack":
      put(spine, mesh(unitBox(), m, 0, 0.26, -0.18, 0.26, 0.3, 0.14));
      put(spine, mesh(unitBox(), toon(darker(color)), 0, 0.2, -0.26, 0.2, 0.14, 0.04));
      break;
    case "guitar": {
      const gt = put(spine, mesh(sphere(14), m, 0.05, 0.15, -0.2, 0.22, 0.28, 0.08));
      gt.rotation.z = 0.6;
      put(spine, mesh(unitBox(), toon("#1f2937"), -0.12, 0.42, -0.2, 0.04, 0.4, 0.03)).rotation.z = 0.6;
      break;
    }
    case "cape": {
      const cp = put(spine, mesh(new THREE.PlaneGeometry(0.42, 0.85, 1, 4), toon(color, { side: THREE.DoubleSide }), 0, 0.02, -0.17));
      cp.rotation.x = 0.12;
      cp.userData.cape = true;
      break;
    }
    case "wings":
      for (const x of [-1, 1]) {
        const w = put(spine, mesh(sphere(12), toon(color, { emissive: darker(color, 0.15) }), x * 0.24, 0.32, -0.22, 0.42, 0.26, 0.05));
        w.rotation.set(0, x * 0.5, x * 0.5);
        w.userData.wing = x;
      }
      break;
  }
}

// Accessory meshes on their own (for VRM characters): head things around a head centre, the rest around the chest.
export function accessoryMeshes(model: string, color: string, look: Look) {
  const head = new THREE.Group(), chest = new THREE.Group(), spine = new THREE.Group();
  accessory(model, color, look, head, chest, spine);
  spine.position.y = -0.26;
  const body = new THREE.Group();
  body.add(chest, spine);
  return { head, body };
}

// ------------------------------------------------------------------------------------------------- the anime figure

export function buildAvatar(raw: Partial<Look> | Look, opts: { detail?: boolean } = {}): Avatar {
  const look = cleanLook(raw);
  if (look.style === "blocky") return buildBlocky(look);
  const detail = opts.detail ?? TOON.quality !== "low";
  const root = new THREE.Group();
  const skin = toon(look.skin);
  const shirt = toon(look.shirt);
  const pants = toon(look.pants);
  const shoes = toon(look.shoes);
  const o = look.outfit;
  const legScale = 1 + look.legs * 0.15;
  const armScale = 1 + look.arms * 0.15;
  const shoulder = (look.body === "broad" ? 1.22 : 1) * (1 + look.shoulders * 0.18);
  const hipY = 0.8 * legScale;

  const hips = new THREE.Object3D();
  hips.position.y = hipY;
  root.add(hips);
  // Legs: thigh, knee, shin, shoe. Skirts and dresses show skin; trousers and suits cover the leg.
  const bare = o === "dress" || o === "sailor";
  const legMat = bare ? skin : o === "sport" || o === "knight" ? pants : pants;
  const legJoint = (x: number) => {
    const hip = new THREE.Object3D();
    hip.position.set(x * 0.095, 0, 0);
    hips.add(hip);
    limb(hip, 0.075 * (look.body === "broad" ? 1.12 : 1), 0.26 * legScale, legMat, -0.19 * legScale, detail);
    const knee = new THREE.Object3D();
    knee.position.y = -0.38 * legScale;
    hip.add(knee);
    limb(knee, 0.062, 0.26 * legScale, o === "sailor" ? toon("#111827") : legMat, -0.19 * legScale, detail);
    const isBoot = o === "adventurer" || o === "knight";
    const shoe = mesh(sphere(12), isBoot ? toon("#3f2a1d") : shoes, 0, -0.39 * legScale, 0.035, 0.13, isBoot ? 0.16 : 0.1, 0.24);
    if (detail) outline(shoe, 0.01);
    knee.add(shoe);
    if (o === "sport") knee.add(mesh(unitBox(), toon("#ffffff"), x * 0.06, -0.15 * legScale, 0, 0.012, 0.3 * legScale, 0.02));
    return { hip, knee };
  };
  const L = legJoint(1), R = legJoint(-1);

  // Pelvis and body.
  const spine = new THREE.Object3D();
  hips.add(spine);
  const pelvis = mesh(sphere(14), pants, 0, 0, 0, 0.3 * (look.body === "broad" ? 1.1 : 1), 0.2, 0.2);
  spine.add(pelvis);
  const chest = new THREE.Object3D();
  chest.position.y = 0.26;
  spine.add(chest);
  const torsoMat = o === "suit" ? pants : o === "jacket" ? toon("#f8fafc") : shirt;
  const torso = mesh(capsule(0.13, 0.22), torsoMat, 0, 0, 0, 1.2 * shoulder, 1, 0.82);
  if (detail) outline(torso, 0.012);
  torso.castShadow = true;
  chest.add(torso);
  if (o === "hoodie") {
    { const o = mesh(new THREE.TorusGeometry(0.11, 0.05, 8, 16), shirt, 0, 0.2, -0.06, 1.1 * shoulder, 1, 1); o.rotation.x = Math.PI / 2 + 0.6; chest.add(o); }
    chest.add(mesh(unitBox(), toon(darker(look.shirt, 0.85)), 0, -0.1, 0.11, 0.22, 0.09, 0.03));
    for (const x of [-0.04, 0.04]) chest.add(mesh(cyl(5), toon("#f8fafc"), x, 0.07, 0.115, 0.012, 0.12, 0.012));
  }
  if (o === "office" || o === "suit") {
    chest.add(mesh(unitBox(), toon(o === "suit" ? "#f8fafc" : lighter(look.shirt, 0.2)), 0, 0.06, 0.1, 0.1, 0.22, 0.04));
    chest.add(mesh(unitBox(), toon(o === "suit" ? look.shirt : "#b91c1c"), 0, 0.02, 0.125, 0.04, 0.2, 0.02));
  }
  if (o === "jacket") for (const x of [-1, 1]) chest.add(mesh(unitBox(), shirt, x * 0.1, 0, 0.06, 0.1, 0.36, 0.12));
  if (o === "sailor") {
    chest.add(mesh(unitBox(), pants, 0, 0.14, -0.06, 0.3, 0.12, 0.16));
    { const o = mesh(cone(4), toon("#dc2626"), 0, 0.06, 0.12, 0.08, 0.1, 0.03); o.rotation.x = Math.PI; chest.add(o); }
  }
  if (o === "sport") for (const x of [-1, 1]) chest.add(mesh(unitBox(), toon("#ffffff"), x * 0.155 * shoulder, 0, 0.0, 0.012, 0.32, 0.2));
  if (o === "knight") {
    chest.add(mesh(sphere(12), toon("#9ca3af"), 0, 0.02, 0.03, 0.34 * shoulder, 0.36, 0.26));
    for (const x of [-1, 1]) chest.add(mesh(sphere(10), toon("#6b7280"), x * 0.2 * shoulder, 0.14, 0, 0.16, 0.1, 0.16));
  }
  // Skirts, coats and robes below the waist.
  if (o === "dress" || o === "sailor" || o === "adventurer" || o === "robe" || o === "mage") {
    const long = o === "robe" || o === "mage";
    const len = long ? 0.72 : o === "adventurer" ? 0.5 : 0.34;
    const sk = mesh(new THREE.CylinderGeometry(0.14, long ? 0.3 : 0.26, len, 16, 1, true), toon(o === "sailor" ? look.pants : look.shirt, { side: THREE.DoubleSide }), 0, -len / 2 + 0.04, 0);
    if (detail) outline(sk, 0.01);
    sk.userData.skirt = true;
    spine.add(sk);
  }
  if (o === "robe") spine.add(mesh(cyl(14), pants, 0, 0.1, 0, 0.3, 0.08, 0.24));
  if (o === "adventurer" || o === "knight") spine.add(mesh(cyl(14), toon("#78350f"), 0, 0.06, 0, 0.29, 0.05, 0.21));
  if (o === "mage") {
    const hood = mesh(new THREE.SphereGeometry(0.25, 14, 10, Math.PI, Math.PI), shirt, 0, 0.5, -0.04, 1, 1.1, 1);
    chest.add(hood);
  }

  // Arms: shoulder, elbow, hand. Long sleeves for most outfits; short for the T-shirt and dress.
  const short = o === "tee" || o === "dress";
  const sleeve = o === "suit" ? pants : o === "knight" ? toon("#9ca3af") : shirt;
  const armJoint = (x: number) => {
    const sh = new THREE.Object3D();
    sh.position.set(x * 0.2 * shoulder, 0.13, 0);
    chest.add(sh);
    const wide = o === "robe" || o === "mage";
    const up = wide ? mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.28 * armScale, 10), sleeve, 0, -0.14 * armScale, 0) : mesh(capsule(0.052, 0.18 * armScale), sleeve, 0, -0.13 * armScale, 0);
    if (detail) outline(up, 0.01);
    sh.add(up);
    const el = new THREE.Object3D();
    el.position.y = -0.27 * armScale;
    sh.add(el);
    const fore = mesh(capsule(0.045, 0.16 * armScale), short ? skin : sleeve, 0, -0.11 * armScale, 0);
    if (detail) outline(fore, 0.01);
    el.add(fore);
    el.add(mesh(sphere(10), skin, 0, -0.25 * armScale, 0, 0.1, 0.11, 0.09));
    if (o === "sport") el.add(mesh(unitBox(), toon("#ffffff"), x * 0.04, -0.1, 0, 0.012, 0.2, 0.02));
    return { sh, el };
  };
  const LA = armJoint(1), RA = armJoint(-1);

  // Neck and head.
  const neck = new THREE.Object3D();
  neck.position.y = 0.21;
  chest.add(neck);
  neck.add(mesh(cyl(10), skin, 0, 0.03, 0, 0.09, 0.1, 0.09));
  const head = new THREE.Object3D();
  head.position.y = 0.2;
  head.scale.setScalar(1 + look.head * 0.15);
  neck.add(head);
  const skull = mesh(sphere(24), skin, 0, 0, 0, 0.4, 0.42, 0.39);
  if (detail) outline(skull, 0.012);
  skull.castShadow = true;
  head.add(skull);
  // Ears.
  for (const x of [-1, 1]) head.add(mesh(sphere(8), skin, x * 0.195, -0.01, -0.01, 0.05, 0.08, 0.05));
  // The face: a curved patch in front of the skull with the eyes, brows and mouth drawn on.
  const faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(look, look.face), transparent: true, depthWrite: false });
  const facePatch = new THREE.Mesh(new THREE.SphereGeometry(0.2025, 24, 16, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.7, 1.4), faceMat);
  facePatch.scale.set(1, 1.05, 0.975);
  facePatch.renderOrder = 2;
  head.add(facePatch);
  hair(head, look, detail);
  for (const key of [...look.acc, ACCESSORIES.find((a) => a.slot === "head" && a.model === look.hat)?.key].filter(Boolean) as string[]) {
    const a = ACCESSORIES.find((x) => x.key === key);
    if (a) accessory(a.model!, a.color ?? "#111827", look, head, chest, spine);
  }
  if (o === "knight") {
    const cp = mesh(new THREE.PlaneGeometry(0.4, 0.8, 1, 4), toon("#1e3a8a", { side: THREE.DoubleSide }), 0, 0.0, -0.16);
    cp.userData.cape = true;
    chest.add(cp);
  }
  if (o === "mage") for (let i = 0; i < 3; i++) chest.add(mesh(sphere(6), toon("#fde047", { emissive: "#facc15" }), (i - 1) * 0.1, -0.05 * i, 0.12, 0.03, 0.03, 0.03));

  const height = 1.7 * (1 + look.height * 0.1);
  root.scale.setScalar(1 + look.height * 0.1);
  const joints: Joints = { hips, spine, neck, head, lHip: L.hip, rHip: R.hip, lKnee: L.knee, rKnee: R.knee, lShoulder: LA.sh, rShoulder: RA.sh, lElbow: LA.el, rElbow: RA.el };
  root.traverse((x) => x instanceof THREE.Mesh && !x.userData.outline && (x.castShadow = true));
  const av: Avatar = {
    root,
    joints,
    look,
    height,
    blinkAt: performance.now() + 2000 + Math.random() * 3000,
    face: look.face,
    setFace: (e) => {
      if (av.face === e) return;
      av.face = e;
      faceMat.map = faceTexture(look, e);
      faceMat.needsUpdate = true;
    },
  };
  root.userData.avatar = av;
  root.userData.hipY = hipY;
  return av;
}

// ------------------------------------------------------------------------------------------------- motion

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

// One frame of motion: walking and running cycles, in the air, sitting, driving, crouching and emotes; the face
// blinks now and then and follows the emote.
export function animateAvatar(av: Avatar, t: number, dt: number, p: Pose) {
  if (av.blocky) return animateBlocky(av, t, p);
  const j = av.joints!;
  const k = Math.min(1, dt * 12);
  const s = Math.min(1, p.speed);
  const cyc = t * (6 + s * 6);
  const swing = p.air ? 0 : Math.sin(cyc) * (0.45 + s * 0.5) * (s > 0.05 ? 1 : 0);
  const set = (o: THREE.Object3D, x: number, y = 0, z = 0) => {
    o.rotation.x = lerp(o.rotation.x, x, k);
    o.rotation.y = lerp(o.rotation.y, y, k);
    o.rotation.z = lerp(o.rotation.z, z, k);
  };
  const hipY = av.root.userData.hipY as number;
  let bob = s > 0.05 && !p.air ? Math.abs(Math.sin(cyc)) * 0.04 * (0.5 + s) : Math.sin(t * 2) * 0.006;
  let lean = s * 0.12;
  let lArm = [-swing * 0.9, 0, 0.08], rArm = [swing * 0.9, 0, -0.08], lEl = [-0.2 - s * 0.6, 0, 0], rEl = [-0.2 - s * 0.6, 0, 0];
  let lLeg = [swing, 0, 0], rLeg = [-swing, 0, 0], lKn = [Math.max(0, -Math.sin(cyc)) * (0.4 + s * 0.6), 0, 0], rKn = [Math.max(0, Math.sin(cyc)) * (0.4 + s * 0.6), 0, 0];
  let headRot = [Math.sin(t * 0.7) * 0.03, Math.sin(t * 0.4) * 0.08, 0];
  let spinY = 0;
  let face: Expression = av.look.face;
  if (p.air) {
    lLeg = [-0.6, 0, 0];
    rLeg = [0.2, 0, 0];
    lKn = [1.1, 0, 0];
    rKn = [0.5, 0, 0];
    lArm = [-0.5, 0, 0.9];
    rArm = [-0.5, 0, -0.9];
  }
  if (p.crouch) {
    bob -= 0.22;
    lLeg = [-0.9 + swing * 0.4, 0, 0];
    rLeg = [-0.9 - swing * 0.4, 0, 0];
    lKn = [1.6, 0, 0];
    rKn = [1.6, 0, 0];
    lean = 0.35;
  }
  if (p.sit || p.drive) {
    bob = -0.36;
    lLeg = [-1.55, 0, 0.05];
    rLeg = [-1.55, 0, -0.05];
    lKn = [1.5, 0, 0];
    rKn = [1.5, 0, 0];
    lean = 0;
    if (p.drive) (lArm = [-1.2, 0, 0.15]), (rArm = [-1.2, 0, -0.15]), (lEl = [-0.4, 0, 0]), (rEl = [-0.4, 0, 0]);
    else (lArm = [-0.3, 0, 0.1]), (rArm = [-0.3, 0, -0.1]), (lEl = [-0.9, 0, 0]), (rEl = [-0.9, 0, 0]);
  }
  if (p.aim) (lArm = [-1.5, 0.3, 0]), (rArm = [-1.4, -0.6, 0]), (rEl = [-1.2, 0, 0]), (lEl = [0, 0, 0]);
  switch (p.emote) {
    case "wave":
      rArm = [0, 0, -2.7 + Math.sin(t * 12) * 0.35];
      rEl = [0, 0, -0.3];
      face = "smile";
      break;
    case "cheer":
      lArm = [0, 0, 2.8];
      rArm = [0, 0, -2.8];
      bob += Math.abs(Math.sin(t * 10)) * 0.08;
      face = "grin";
      break;
    case "dance":
      lArm = [Math.sin(t * 8) * 0.8, 0, 1.4 + Math.sin(t * 8) * 0.5];
      rArm = [-Math.sin(t * 8) * 0.8, 0, -1.4 + Math.sin(t * 8) * 0.5];
      lLeg = [Math.sin(t * 8) * 0.4, 0, 0.1];
      rLeg = [-Math.sin(t * 8) * 0.4, 0, -0.1];
      spinY = Math.sin(t * 4) * 0.6;
      bob += Math.abs(Math.sin(t * 8)) * 0.06;
      face = "grin";
      break;
    case "laugh":
      lean = -0.15 + Math.sin(t * 20) * 0.04;
      lArm = [-0.4, 0, 0.3];
      rArm = [-0.4, 0, -0.3];
      lEl = [-1.6, 0, 0];
      rEl = [-1.6, 0, 0];
      face = "laugh";
      break;
    case "cry":
      lean = 0.2;
      headRot = [0.35, 0, 0];
      lArm = [-1.2, 0, 0.3];
      rArm = [-1.2, 0, -0.3];
      lEl = [-1.8, 0, 0];
      rEl = [-1.8, 0, 0];
      face = "cry";
      break;
    case "bow":
      lean = 0.8;
      headRot = [0.3, 0, 0];
      face = "calm";
      break;
    case "clap":
      lArm = [-1.2, 0.5 + Math.sin(t * 18) * 0.2, 0.2];
      rArm = [-1.2, -0.5 - Math.sin(t * 18) * 0.2, -0.2];
      lEl = [-0.6, 0, 0];
      rEl = [-0.6, 0, 0];
      face = "grin";
      break;
    case "jump":
      face = "wow";
      break;
  }
  j.hips.position.y = lerp(j.hips.position.y, hipY + bob, k);
  set(j.spine, lean, spinY, 0);
  set(j.head, headRot[0]!, headRot[1]!, headRot[2]!);
  set(j.lShoulder, lArm[0]!, lArm[1]!, lArm[2]!);
  set(j.rShoulder, rArm[0]!, rArm[1]!, rArm[2]!);
  set(j.lElbow, lEl[0]!, lEl[1]!, lEl[2]!);
  set(j.rElbow, rEl[0]!, rEl[1]!, rEl[2]!);
  set(j.lHip, lLeg[0]!, lLeg[1]!, lLeg[2]!);
  set(j.rHip, rLeg[0]!, rLeg[1]!, rLeg[2]!);
  set(j.lKnee, lKn[0]!, 0, 0);
  set(j.rKnee, rKn[0]!, 0, 0);
  // Breathing, capes in the wind, wings flapping.
  j.spine.scale.y = 1 + Math.sin(t * 2.2) * 0.012;
  av.root.traverse((o) => {
    if (o.userData.cape) o.rotation.x = 0.12 + s * 0.6 + Math.sin(t * 6) * 0.05 * (0.3 + s);
    if (o.userData.wing) o.rotation.y = (o.userData.wing as number) * (0.5 + Math.sin(t * 3) * 0.25);
  });
  // Blink every few seconds (unless an emote sets the face).
  const now = performance.now();
  if (face === av.look.face && now > av.blinkAt) {
    face = "blink";
    if (now > av.blinkAt + 140) av.blinkAt = now + 2500 + Math.random() * 3500;
  }
  av.setFace(face);
}

// ------------------------------------------------------------------------------------------------- blocky style

function buildBlocky(look: Look): Avatar {
  const root = new THREE.Group();
  const m = (c: string) => toon(c);
  const box = (w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], y: number, x = 0) => {
    const b = new THREE.Mesh(unitBox(), mat);
    b.scale.set(w, h, d);
    b.position.set(x, y, 0);
    b.castShadow = true;
    root.add(b);
    return b;
  };
  const s = 0.62;
  const legL = box(0.42 * s, 0.9 * s, 0.42 * s, m(look.pants), 0.45 * s, -0.24 * s);
  const legR = box(0.42 * s, 0.9 * s, 0.42 * s, m(look.pants), 0.45 * s, 0.24 * s);
  box(1 * s, 1 * s, 0.55 * s, m(look.shirt), 1.4 * s);
  const armL = box(0.34 * s, 0.95 * s, 0.34 * s, m(look.skin), 1.4 * s, -0.68 * s);
  const armR = box(0.34 * s, 0.95 * s, 0.34 * s, m(look.skin), 1.4 * s, 0.68 * s);
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = look.skin;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = "#111";
  g.fillRect(18, 22, 7, 8);
  g.fillRect(39, 22, 7, 8);
  g.lineWidth = 3;
  g.beginPath();
  g.arc(32, 38, 10, 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const sk = m(look.skin);
  box(0.8 * s, 0.8 * s, 0.8 * s, [sk, sk, m(look.hair), sk, new THREE.MeshLambertMaterial({ map: tex }), sk], 2.3 * s);
  box(0.84 * s, 0.16 * s, 0.84 * s, m(look.hair), 2.76 * s);
  const av: Avatar = { root, joints: null, look, height: 1.75, blinkAt: 0, face: look.face, setFace: () => {}, blocky: { legL, legR, armL, armR } };
  root.userData.avatar = av;
  return av;
}

function animateBlocky(av: Avatar, t: number, p: Pose) {
  const { legL, legR, armL, armR } = av.blocky!;
  const s = p.speed > 0.05 && !p.sit && !p.drive ? Math.sin(t * 10) * 0.6 : 0;
  legL!.rotation.x = p.sit || p.drive ? -1.5 : s;
  legR!.rotation.x = p.sit || p.drive ? -1.5 : -s;
  armL!.rotation.x = -s;
  armR!.rotation.x = s;
  armR!.rotation.z = p.emote === "wave" ? 2.6 + Math.sin(t * 12) * 0.4 : 0;
  if (p.emote === "cheer") (armL!.rotation.z = -2.8), (armR!.rotation.z = 2.8);
}

// Looks for town characters (shopkeepers, visitors): varied and cheerful.
const NPC_HAIR = ["short", "bob", "ponytail", "long", "spiky", "buns", "twintails", "messy"];
const NPC_OUTFIT = ["tee", "hoodie", "office", "jacket", "dress", "sport", "suit", "sailor"];
const NPC_HAIR_COL = ["#2b1b0e", "#6b3e1e", "#f5d0a9", "#1f2937", "#9a3412", "#e5e7eb", "#7c3aed", "#ec4899", "#0ea5e9"];
const NPC_COL = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#f8fafc", "#0f172a"];
const NPC_SKIN = ["#f9d7b5", "#f2c9a0", "#d9a07a", "#b97d55", "#8d5a3b", "#5c3a26"];
export function npcLook(seed: number, over: Partial<Look> = {}): Look {
  const r = (n: number) => Math.abs(Math.floor(Math.sin(seed * 9301 + n * 49297) * 233280)) % 1000;
  return cleanLook({
    hairStyle: NPC_HAIR[r(1) % NPC_HAIR.length],
    outfit: NPC_OUTFIT[r(2) % NPC_OUTFIT.length],
    hair: NPC_HAIR_COL[r(3) % NPC_HAIR_COL.length],
    shirt: NPC_COL[r(4) % NPC_COL.length],
    pants: NPC_COL[(r(5) + 3) % NPC_COL.length],
    skin: NPC_SKIN[r(6) % NPC_SKIN.length],
    eyes: ["#3b82f6", "#22c55e", "#a855f7", "#f59e0b", "#7c2d12", "#ec4899"][r(7) % 6],
    eyeShape: (["round", "sharp", "sparkle", "sleepy"] as const)[r(8) % 4],
    body: r(9) % 3 === 0 ? "broad" : "slim",
    height: ((r(10) % 7) - 3) / 10,
    base: ["kai", "mei", "aoi", "shibu", "bibi", "vita", "shino", "victoria", "fumiriya"][r(11) % 9],
    tintClothes: r(12) % 2 === 0,
    ...over,
  });
}
