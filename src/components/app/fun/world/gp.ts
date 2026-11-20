import * as THREE from "three";
import type { Physics } from "./engine";
import { carRig, type CarRig } from "./cars";
import { lamp, plain, roadPaint, surface } from "./pbr";
import { signPlane } from "./toon";

// The Seed Grand Prix: a Formula 2 style circuit east of the ring road. A 1.6 km track with a long pit straight, a
// hairpin, a chicane, fast sweepers and esses; kerbs on the corners, gravel run-off, tyre barriers and walls, the
// pit lane with team garages and a speed limit, grandstands, the start-light gantry, the grid, a timing tower,
// race control, marshal posts and a podium. Racing: practice, qualifying, sprint and feature races (with a pit
// stop), time trial and a championship; AI drivers follow a racing line with braking points, overtake and defend,
// and make mistakes by difficulty; tyres wear and heat up, fuel burns, pits change tyres and refuel; track limits
// cost penalties; sectors, positions, fastest lap and results.

export const GP_CENTER = { x: 340, z: -255 };
const CTRL: [number, number][] = [
  [235, -140], [330, -140], [425, -140], // pit straight (east)
  [462, -150], [474, -182], [458, -212], // hairpin right
  [440, -238], [452, -262], [438, -286], // chicane
  [462, -318], [455, -356], [420, -376], // sweeping right
  [350, -380], [275, -372], // back straight (west)
  [236, -350], [232, -318], // tight left
  [256, -294], [236, -268], [258, -240], // esses
  [240, -206], [222, -178], [220, -156], // final corner onto the straight
];
export const TRACK_W = 13;

export type Track = {
  pts: THREE.Vector3[]; // sampled every metre along the centre
  len: number;
  curv: number[]; // curvature (1/m, signed) at each sample
  line: number[]; // racing line offset (m, + to the left of travel)
  vmax: number[]; // speed profile (m/s) for the reference car
  grid: { x: number; z: number; heading: number }[];
  pitLane: THREE.Vector3[];
  pitBoxes: { x: number; z: number; heading: number }[];
  sectors: [number, number];
  start: number; // sample index of the start line
  onTrack: (x: number, z: number) => boolean;
  nearest: (x: number, z: number, hint?: number) => { i: number; d: number; side: number };
  timing: { draw: (rows: string[]) => void };
  lights: THREE.Mesh[];
};

function sample(): { pts: THREE.Vector3[]; len: number } {
  const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, "centripetal", 0.5);
  const len = curve.getLength();
  const n = Math.round(len);
  return { pts: curve.getSpacedPoints(n).slice(0, n), len: n };
}

export function buildGrandPrix(ph: Physics, detail: number) {
  const group = new THREE.Group();
  group.name = "grandprix";
  const { pts, len } = sample();
  const N = pts.length;
  const at = (i: number) => pts[((i % N) + N) % N]!;
  const dirAt = (i: number) => at(i + 1).clone().sub(at(i - 1)).normalize();
  const leftOf = (i: number) => {
    const d = dirAt(i);
    return new THREE.Vector3(d.z, 0, -d.x);
  };
  // Curvature from the turn of the direction over a few metres.
  const curv: number[] = [];
  for (let i = 0; i < N; i++) {
    const a = dirAt(i - 3), b = dirAt(i + 3);
    const cross = a.x * b.z - a.z * b.x;
    curv.push(-cross / 6);
  }
  const smooth = (arr: number[], k: number) => arr.map((_, i) => {
    let s = 0;
    for (let j = -k; j <= k; j++) s += arr[((i + j) % N + N) % N]!;
    return s / (2 * k + 1);
  });
  const cs = smooth(curv, 6);
  // Racing line: out-in-out, towards the inside of each corner (smoothed so it moves early).
  const line = smooth(cs.map((c) => Math.max(-1, Math.min(1, c * 40)) * (TRACK_W / 2 - 1.6)), 18);
  // Speed profile for a reference single-seater: corner speed from grip, then braking backwards, accelerating
  // forwards.
  const mu = 1.5 * 9.81 * 1.25;
  const vmax = cs.map((c) => Math.min(85, Math.sqrt(mu / Math.max(1e-4, Math.abs(c)))));
  for (let pass = 0; pass < 2; pass++)
    for (let k = N * 2; k >= 0; k--) {
      const i = k % N, j = (k + 1) % N;
      vmax[i] = Math.min(vmax[i]!, Math.sqrt(vmax[j]! ** 2 + 2 * 26 * 1));
    }
  for (let pass = 0; pass < 2; pass++)
    for (let k = 0; k < N * 2; k++) {
      const i = (k + 1) % N, j = k % N;
      vmax[i] = Math.min(vmax[i]!, Math.sqrt(vmax[j]! ** 2 + 2 * 9 * 1));
    }

  // ---- the surface: asphalt ribbon, kerbs on corners, white edge lines, gravel run-off outside corners.
  const ribbon = (half0: number, half1: number, y: number, mat: THREE.Material, when?: (i: number) => boolean, step = 2) => {
    const pos: number[] = [];
    const uv: number[] = [];
    for (let i = 0; i < N; i += step) {
      if (when && !when(i)) continue;
      const a = at(i), b = at(i + step), la = leftOf(i), lb = leftOf(i + step);
      const p = [a.clone().addScaledVector(la, half0), a.clone().addScaledVector(la, half1), b.clone().addScaledVector(lb, half0), b.clone().addScaledVector(lb, half1)];
      for (const v of [p[0]!, p[2]!, p[1]!, p[1]!, p[2]!, p[3]!]) (pos.push(v.x, y, v.z), uv.push(v.x / 4, v.z / 4));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  };
  const tarmac = surface("asphalt", { tint: "#7c7c7c" });
  ribbon(-TRACK_W / 2, TRACK_W / 2, 0.025, tarmac, undefined, 1);
  ribbon(TRACK_W / 2 - 0.45, TRACK_W / 2 - 0.3, 0.032, roadPaint("#f4f4f2"), undefined, 2);
  ribbon(-TRACK_W / 2 + 0.3, -TRACK_W / 2 + 0.45, 0.032, roadPaint("#f4f4f2"), undefined, 2);
  const corner = (i: number) => Math.abs(cs[i]!) > 0.012;
  const red = plain("#c8102e", { rough: 0.6, wet: 0.5 }), white = plain("#f1f1ef", { rough: 0.6, wet: 0.5 });
  for (const side of [-1, 1]) {
    ribbon(side * (TRACK_W / 2), side * (TRACK_W / 2 + 1.1), 0.04, red, (i) => corner(i) && Math.floor(i / 3) % 2 === 0, 3);
    ribbon(side * (TRACK_W / 2), side * (TRACK_W / 2 + 1.1), 0.04, white, (i) => corner(i) && Math.floor(i / 3) % 2 === 1, 3);
    // Gravel traps outside corners (the outside is the side away from the centre of the turn).
    ribbon(side * (TRACK_W / 2 + 1.1), side * (TRACK_W / 2 + 9), 0.02, surface("gravel", { tint: "#d6c8b0" }), (i) => corner(i) && Math.sign(cs[i]!) !== side, 2);
  }
  // Start/finish line (chequered) and the grid boxes.
  const start = 50;
  const sp = at(start), sl = leftOf(start), sd = dirAt(start);
  for (let k = 0; k < 13; k++)
    for (let r = 0; r < 2; r++) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), (k + r) % 2 ? plain("#111", { rough: 0.6 }) : white);
      q.rotation.x = -Math.PI / 2;
      q.rotation.z = Math.atan2(sd.x, sd.z);
      q.position.copy(sp).addScaledVector(sl, -6 + k).addScaledVector(sd, r * 0.5 - 0.25).setY(0.035);
      group.add(q);
    }
  const grid: Track["grid"] = [];
  for (let g = 0; g < 12; g++) {
    const i = start - 8 - g * 8;
    const side = g % 2 ? -2.6 : 2.6;
    const p = at(i).clone().addScaledVector(leftOf(i), side);
    const d = dirAt(i);
    grid.push({ x: p.x, z: p.z, heading: Math.atan2(d.x, d.z) });
    const box = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.15), white);
    box.rotation.x = -Math.PI / 2;
    box.rotation.z = Math.atan2(d.x, d.z);
    box.position.set(p.x + d.x * 1.8, 0.034, p.z + d.z * 1.8);
    group.add(box);
  }

  // ---- barriers: tyre walls and concrete walls far enough out (solid), with posts every few metres.
  const wallM = surface("concrete", { tint: "#d9d6cf" });
  const tyreM = plain("#1c1c1e", { rough: 0.9 });
  for (let i = 0; i < N; i += 4) {
    for (const side of [-1, 1]) {
      const outside = corner(i) && Math.sign(cs[i]!) !== side;
      const off = side * (TRACK_W / 2 + (outside ? 11 : 5));
      const p = at(i).clone().addScaledVector(leftOf(i), off);
      // Not across the pit lane entry/exit (inside of the final corner and the straight).
      if (i > start - 40 && i < start + 110 && side < 0) continue;
      const d = dirAt(i);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, outside ? 0.9 : 1.1, 4.2), outside ? tyreM : wallM);
      m.position.set(p.x, outside ? 0.45 : 0.55, p.z);
      m.rotation.y = Math.atan2(d.x, d.z);
      m.castShadow = true;
      group.add(m);
      ph.post({ x: p.x, z: p.z, r: 1.6, minY: 0, maxY: 1.2, tag: "gp" } as never);
    }
  }

  // ---- the pit lane (inside the main straight), garages, the gantry, stands, tower, race control, podium.
  const pitLane: THREE.Vector3[] = [];
  const pitBoxes: Track["pitBoxes"] = [];
  for (let i = start - 30; i <= start + 100; i += 5) pitLane.push(at(i).clone().addScaledVector(leftOf(i), -(TRACK_W / 2 + 7)));
  ribbon(-(TRACK_W / 2 + 3), -(TRACK_W / 2 + 11), 0.022, surface("asphalt", { tint: "#9a9a9a" }), (i) => i > start - 32 && i < start + 102, 1);
  const garageM = plain("#e8e9eb", { rough: 0.6 });
  const teamCols = ["#1d4ed8", "#b91c1c", "#047857", "#7c3aed", "#ea580c", "#0f766e"];
  for (let g = 0; g < 6; g++) {
    const i = start + 6 + g * 14;
    const d = dirAt(i), l = leftOf(i);
    const p = at(i).clone().addScaledVector(l, -(TRACK_W / 2 + 18));
    const gr = new THREE.Group();
    gr.position.copy(p);
    gr.rotation.y = Math.atan2(d.x, d.z) + Math.PI / 2;
    const add = (m: THREE.Material, x: number, y: number, z: number, w: number, h: number, dd: number) => {
      const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m);
      o.position.set(x, y, z);
      o.castShadow = true;
      o.receiveShadow = true;
      gr.add(o);
    };
    add(garageM, 0, 3, -4, 12, 6, 0.4);
    add(garageM, -6, 3, 0, 0.4, 6, 8);
    add(garageM, 6, 3, 0, 0.4, 6, 8);
    add(plain("#2b2f33", { rough: 0.6 }), 0, 6.1, 0, 12.6, 0.3, 8.6);
    add(plain(teamCols[g]!, { rough: 0.4 }), 0, 5.2, 4.1, 12, 1.2, 0.1);
    const sign = signPlane(["Seed Racing", "Aurora GP", "Ridge Motorsport", "Comet Team", "Volt Racing", "Atlas GP"][g]!, 8, 1, teamCols[g]!);
    sign.position.set(0, 5.2, 4.17);
    gr.add(sign);
    group.add(gr);
    ph.sized(p.x - l.x * 4, 3, p.z - l.z * 4, 9, 6, 9, "gp");
    const bp = at(i).clone().addScaledVector(l, -(TRACK_W / 2 + 8.5));
    pitBoxes.push({ x: bp.x, z: bp.z, heading: Math.atan2(d.x, d.z) });
    const mark = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), plain(teamCols[g]!, { rough: 0.7 }));
    mark.rotation.x = -Math.PI / 2;
    mark.rotation.z = Math.atan2(d.x, d.z);
    mark.position.set(bp.x, 0.03, bp.z);
    group.add(mark);
  }
  // Start lights: five columns of red over the line.
  const lights: THREE.Mesh[] = [];
  const gantry = new THREE.Group();
  gantry.position.copy(sp);
  gantry.rotation.y = Math.atan2(sd.x, sd.z);
  const steel = plain("#3a3f45", { rough: 0.5, metal: 0.7 });
  for (const x of [-7.5, 7.5]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 0.4), steel);
    post.position.set(x, 3.5, 0);
    gantry.add(post);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(15.4, 1.1, 0.5), steel);
  beam.position.set(0, 6.6, 0);
  gantry.add(beam);
  for (let k = 0; k < 5; k++) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 16), new THREE.MeshStandardMaterial({ color: "#220000", emissive: new THREE.Color("#ff1a1a"), emissiveIntensity: 0 }));
    m.userData.keep = true;
    m.position.set(-2.4 + k * 1.2, 6.6, -0.26);
    m.rotation.y = Math.PI;
    gantry.add(m);
    lights.push(m);
  }
  group.add(gantry);
  // Grandstands along the straight (outside), with a roof.
  const standM = plain("#9aa3ab", { rough: 0.7 });
  const seatM = plain("#1d4ed8", { rough: 0.6 });
  for (let s = 0; s < 3; s++) {
    const i = start - 10 + s * 40;
    const d = dirAt(i), l = leftOf(i);
    const p = at(i).clone().addScaledVector(l, TRACK_W / 2 + 12);
    const st = new THREE.Group();
    st.position.copy(p);
    st.rotation.y = Math.atan2(d.x, d.z) - Math.PI / 2;
    for (let r = 0; r < 8; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(30, 0.6, 1.2), r % 2 ? standM : seatM);
      step.position.set(0, 0.3 + r * 0.6, r * 1.2);
      step.castShadow = true;
      st.add(step);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(31, 0.25, 11), plain("#e5e7eb", { rough: 0.5, metal: 0.3 }));
    roof.position.set(0, 8.5, 4.6);
    st.add(roof);
    group.add(st);
    ph.sized(p.x + l.x * 5, 2.5, p.z + l.z * 5, 14, 5, 14, "gp");
  }
  // Timing tower (a canvas that shows the order) and race control.
  const tc = document.createElement("canvas");
  tc.width = 256;
  tc.height = 512;
  const ttex = new THREE.CanvasTexture(tc);
  ttex.colorSpace = THREE.SRGBColorSpace;
  const tp = at(start + 20).clone().addScaledVector(leftOf(start + 20), TRACK_W / 2 + 4);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(3, 12, 0.5), [steel, steel, steel, steel, new THREE.MeshStandardMaterial({ map: ttex, emissive: new THREE.Color("#ffffff"), emissiveMap: ttex, emissiveIntensity: 0.9 }), steel]);
  tower.position.set(tp.x, 7, tp.z);
  tower.rotation.y = Math.atan2(sd.x, sd.z) - Math.PI / 2;
  group.add(tower);
  ph.post({ x: tp.x, z: tp.z, r: 1.4, minY: 0, maxY: 13 });
  const timing = {
    draw: (rows: string[]) => {
      const g = tc.getContext("2d")!;
      g.fillStyle = "#05070a";
      g.fillRect(0, 0, 256, 512);
      g.fillStyle = "#f5c518";
      g.font = "bold 22px system-ui";
      g.fillText("SEED GP", 12, 32);
      g.font = "18px ui-monospace, monospace";
      rows.slice(0, 12).forEach((r, k) => {
        g.fillStyle = k === 0 ? "#fde68a" : "#e5e7eb";
        g.fillText(r.slice(0, 22), 12, 66 + k * 36);
      });
      ttex.needsUpdate = true;
    },
  };
  timing.draw(["P1  --", "Practice open"]);
  const rc = at(start + 70).clone().addScaledVector(leftOf(start + 70), -(TRACK_W / 2 + 34));
  const rcM = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 8), surface("plaster", { tint: "#e9e6df" }));
  rcM.position.set(rc.x, 4.5, rc.z);
  rcM.castShadow = true;
  group.add(rcM);
  const rcGlass = new THREE.Mesh(new THREE.BoxGeometry(10.2, 2, 8.2), plain("#24323d", { rough: 0.1, metal: 0.6 }));
  rcGlass.position.set(rc.x, 7.4, rc.z);
  group.add(rcGlass);
  const rcs = signPlane("Race Control", 6, 0.8, "#111827", "#f5c518");
  rcs.position.set(rc.x, 9.4, rc.z);
  group.add(rcs);
  ph.sized(rc.x, 4.5, rc.z, 10, 9, 8, "gp");
  // The podium.
  const pod = at(start + 85).clone().addScaledVector(leftOf(start + 85), -(TRACK_W / 2 + 24));
  for (const [k, h] of [[0, 1.2], [-1, 0.8], [1, 0.5]] as const) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, h, 2), plain(k === 0 ? "#d4a017" : k < 0 ? "#b8bec4" : "#a0522d", { rough: 0.4, metal: 0.4 }));
    m.position.set(pod.x + k * 2.1, h / 2, pod.z);
    m.castShadow = true;
    group.add(m);
  }
  // Marshal posts with flags at each corner entry.
  if (detail > 0)
    for (let i = 0; i < N; i += 60) {
      if (!corner(i)) continue;
      const p = at(i).clone().addScaledVector(leftOf(i), (Math.sign(cs[i]!) || 1) * (TRACK_W / 2 + 6));
      const hut = new THREE.Mesh(new THREE.BoxGeometry(1.4, 2.2, 1.4), plain("#f1f1ef", { rough: 0.7 }));
      hut.position.set(p.x, 1.1, p.z);
      group.add(hut);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), plain("#f5c518", { rough: 0.8, side: THREE.DoubleSide }));
      flag.position.set(p.x, 2.7, p.z);
      group.add(flag);
    }
  // Sponsor boards (made-up brands) along the straight.
  const brands = ["SEED ENERGY", "HABESHA COFFEE", "AURORA TYRES", "VOLT OIL", "ATLAS BANK", "COMET TELECOM"];
  for (let k = 0; k < 6; k++) {
    const i = start + 10 + k * 15;
    const p = at(i).clone().addScaledVector(leftOf(i), TRACK_W / 2 + 4.6);
    const b = signPlane(brands[k]!, 6, 0.9, ["#0b3d91", "#5a1e1e", "#111", "#14532d", "#1e293b", "#7c2d12"][k]!, "#f8fafc");
    b.position.set(p.x, 0.75, p.z);
    b.rotation.y = Math.atan2(sd.x, sd.z) - Math.PI / 2;
    group.add(b);
  }
  // Light at night over the circuit.
  const floodM = lamp("#f4f7ff", 0.05, 3);
  for (let i = 0; i < N; i += 120) {
    const p = at(i).clone().addScaledVector(leftOf(i), -(TRACK_W / 2 + 14));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 16, 8), steel);
    pole.position.set(p.x, 8, p.z);
    group.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 0.4), floodM);
    head.position.set(p.x, 16, p.z);
    group.add(head);
  }

  // Track geometry helpers.
  const nearest = (x: number, z: number, hint?: number) => {
    let best = 0, bd = Infinity;
    const scan = (from: number, to: number) => {
      for (let k = from; k <= to; k++) {
        const i = ((k % N) + N) % N;
        const p = pts[i]!;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bd) (bd = d), (best = i);
      }
    };
    if (hint !== undefined) scan(hint - 25, hint + 60);
    if (hint === undefined || bd > 400) scan(0, N - 1);
    const l = leftOf(best);
    const side = (x - pts[best]!.x) * l.x + (z - pts[best]!.z) * l.z;
    return { i: best, d: Math.sqrt(bd), side };
  };
  const onTrack = (x: number, z: number) => {
    if (Math.hypot(x - GP_CENTER.x, z - GP_CENTER.z) > 200) return false;
    const n = nearest(x, z);
    return n.d < TRACK_W / 2 + 1.2 || (n.side < 0 && n.d < TRACK_W / 2 + 12 && n.i > start - 34 && n.i < start + 104);
  };
  const track: Track = { pts, len, curv: cs, line, vmax, grid, pitLane, pitBoxes, sectors: [Math.floor(N / 3), Math.floor((2 * N) / 3)], start, onTrack, nearest, timing, lights };
  return { group, track };
}

// ------------------------------------------------------------------------------------------------- the race

export type GpMode = "practice" | "qualifying" | "sprint" | "feature" | "timetrial" | "championship";
export const GP_MODES: { key: GpMode; label: string; laps: number; note: string }[] = [
  { key: "practice", label: "Practice", laps: 0, note: "Drive as long as you like; every lap timed." },
  { key: "qualifying", label: "Qualifying", laps: 3, note: "Three flying laps; your best sets your grid place." },
  { key: "sprint", label: "Sprint race", laps: 5, note: "Five laps, no pit stop needed." },
  { key: "feature", label: "Feature race", laps: 8, note: "Eight laps with a compulsory pit stop for tyres." },
  { key: "timetrial", label: "Time trial", laps: 3, note: "Alone on track; beat your best." },
  { key: "championship", label: "Championship", laps: 5, note: "Three rounds (sprint distance); points 25-18-15-12-10-8-6-4-2-1, two for the fastest lap." },
];
export type Difficulty = "beginner" | "amateur" | "pro" | "legend";
export const SKILL: Record<Difficulty, { pace: number; mistakes: number; label: string }> = {
  beginner: { pace: 0.8, mistakes: 0.02, label: "Beginner" },
  amateur: { pace: 0.88, mistakes: 0.012, label: "Amateur" },
  pro: { pace: 0.95, mistakes: 0.006, label: "Professional" },
  legend: { pace: 0.99, mistakes: 0.002, label: "Legend" },
};
export type Compound = "soft" | "medium" | "hard";
export const COMPOUND: Record<Compound, { grip: number; wear: number; color: string }> = {
  soft: { grip: 1.06, wear: 0.05, color: "#ef4444" },
  medium: { grip: 1.0, wear: 0.03, color: "#eab308" },
  hard: { grip: 0.95, wear: 0.018, color: "#f8fafc" },
};
export type GpSetup = { mode: GpMode; difficulty: Difficulty; opponents: number; compound: Compound; round?: number };
export type Standing = { name: string; me: boolean; pos: number; lap: number; gap: string; best: number | null; last: number | null; pit: boolean; tyre: Compound; penalty: number };
export type RaceState = {
  mode: GpMode;
  phase: "grid" | "lights" | "racing" | "finished";
  lights: number;
  lap: number;
  laps: number;
  pos: number;
  of: number;
  lapTime: number;
  last: number | null;
  best: number | null;
  sectors: (number | null)[];
  delta: number | null;
  tyre: Compound;
  wear: number;
  temp: number;
  fuel: number;
  inPit: boolean;
  pitDone: boolean;
  warnings: number;
  penalty: number;
  message: string;
  standings: Standing[];
  results: { pos: number; name: string; time: string; best: string; points: number; me: boolean }[] | null;
};

const NAMES = ["A. Bekele", "L. Haile", "M. Tesfaye", "S. Girma", "D. Alemu", "R. Kebede", "H. Mulugeta", "Y. Desta", "B. Abebe", "T. Worku", "E. Assefa"];
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
export const fmtLap = (s: number | null) => (s === null ? "--:--.---" : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, "0")}`);

type Bot = { name: string; rig: CarRig; s: number; lap: number; v: number; off: number; skill: number; mistakeUntil: number; time: number; best: number | null; lapStart: number; tyre: Compound; wear: number; pitted: boolean; done: number | null; lastLap: number | null };

export type GpHost = {
  scene: THREE.Scene;
  car: () => { x: number; z: number; heading: number; speed: number } | null;
  placeCar: (x: number, z: number, heading: number) => void;
  hold: (on: boolean) => void;
  limit: (mps: number | null) => void;
  grip: (k: number) => void;
  state: (s: RaceState | null) => void;
  done: (score: number, coins: number, text: string, lapBest: number | null) => void;
  sound: (k: "hit" | "win" | "miss") => void;
};

export class GrandPrix {
  readonly kind = "gp";
  readonly drives = true;
  private bots: Bot[] = [];
  private st: RaceState;
  private t0 = 0;
  private clock = 0;
  private lastI = 0;
  private sectorStart = 0;
  private lapStart = 0;
  private sectorBest: (number | null)[] = [null, null, null];
  private offTime = 0;
  private grip = 1;
  private finishAt = 0;
  private myDone: number | null = null;
  private lightsAt = 0;
  private goAt = 0;
  private pitStop = 0;
  constructor(
    private host: GpHost,
    private track: Track,
    private setup: GpSetup,
  ) {
    const mode = GP_MODES.find((m) => m.key === setup.mode)!;
    const alone = setup.mode === "timetrial" || setup.mode === "practice" || setup.mode === "qualifying";
    const n = alone ? 0 : Math.max(0, Math.min(11, setup.opponents));
    const skill = SKILL[setup.difficulty];
    const cols = ["#b91c1c", "#047857", "#7c3aed", "#ea580c", "#0f766e", "#be185d", "#1e3a8a", "#a16207", "#334155", "#15803d", "#9a3412"];
    // The grid: me in the middle for races (qualifying places come later), bots ahead and behind.
    const myGrid = alone ? 0 : Math.min(n, Math.floor(n / 2));
    let slot = 0;
    for (let k = 0; k <= n; k++) {
      const g = track.grid[k]!;
      if (k === myGrid) {
        host.placeCar(g.x, g.z, g.heading);
        continue;
      }
      const rig = carRig("f2", cols[slot % cols.length]!)!;
      rig.group.position.set(g.x, 0, g.z);
      rig.group.rotation.y = g.heading;
      host.scene.add(rig.group);
      const near = track.nearest(g.x, g.z);
      this.bots.push({ name: NAMES[slot % NAMES.length]!, rig, s: near.i, lap: 0, v: 0, off: near.side, skill: skill.pace * (0.97 + Math.random() * 0.05), mistakeUntil: 0, time: 0, best: null, lapStart: 0, tyre: setup.compound, wear: 0, pitted: false, done: null, lastLap: null });
      slot++;
    }
    this.st = { mode: setup.mode, phase: alone ? "racing" : "grid", lights: 0, lap: alone ? 1 : 0, laps: mode.laps, pos: myGrid + 1, of: n + 1, lapTime: 0, last: null, best: null, sectors: [null, null, null], delta: null, tyre: setup.compound, wear: 0, temp: alone ? 60 : 45, fuel: setup.mode === "feature" ? 100 : 60, inPit: false, pitDone: false, warnings: 0, penalty: 0, message: alone ? "Go! The lap starts at the line." : "Lights in a moment", standings: [], results: null };
    this.lastI = track.nearest(track.grid[myGrid]!.x, track.grid[myGrid]!.z).i;
    host.hold(!alone);
    this.lightsAt = performance.now() + 2500;
    if (alone) this.st.lap = 0;
  }

  // Each frame: lights, the bots, my timing, tyres, fuel, pits, track limits, the order.
  update(dt: number) {
    this.clock += dt;
    const now = performance.now();
    const st = this.st;
    const tr = this.track;
    const N = tr.pts.length;
    // Start lights: one more red each second, then out after a random pause.
    if (st.phase === "grid" && now > this.lightsAt) (st.phase = "lights"), (st.lights = 0);
    if (st.phase === "lights") {
      st.lights = Math.min(5, Math.floor((now - this.lightsAt) / 1000));
      tr.lights.forEach((m, k) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = k < st.lights ? 4 : 0));
      if (st.lights >= 5 && !this.goAt) this.goAt = now + 600 + Math.random() * 1600;
      if (this.goAt && now > this.goAt) {
        tr.lights.forEach((m) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0));
        st.phase = "racing";
        st.message = "Lights out!";
        this.host.hold(false);
        this.host.sound("hit");
        this.t0 = this.clock;
        this.lapStart = this.clock;
        this.sectorStart = this.clock;
        for (const b of this.bots) b.lapStart = this.clock;
      }
    }
    const car = this.host.car();
    // Bots: along the racing line at their pace (slower when their tyres are worn), mistakes now and then,
    // overtaking (a wider line) and keeping off each other and me.
    if (st.phase === "racing" || st.phase === "finished") {
      for (const b of this.bots) {
        if (b.done !== null && this.clock - b.done > 8) continue;
        const i = Math.floor(b.s) % N;
        const ahead = (k: number) => tr.vmax[(i + k) % N]!;
        let target = Math.min(ahead(0), ahead(8), ahead(16)) * b.skill * (1 - b.wear * 0.08) * (b.done !== null ? 0.5 : 1);
        if (now < b.mistakeUntil) target *= 0.55;
        else if (Math.random() < SKILL[this.setup.difficulty].mistakes * dt * (Math.abs(tr.curv[i]!) > 0.02 ? 3 : 0.2)) b.mistakeUntil = now + 900 + Math.random() * 900;
        let wantOff = tr.line[i]!;
        // Someone close ahead: go round them; me close behind: cover the inside.
        for (const o of this.bots) {
          if (o === b) continue;
          const gap = (((o.s - b.s) % N) + N) % N;
          if (gap > 0 && gap < 12) {
            if (o.v < b.v + 1) wantOff = o.off > 0 ? o.off - 3.2 : o.off + 3.2;
            if (gap < 6) target = Math.min(target, o.v * 0.98);
          }
        }
        if (car) {
          const me = tr.nearest(car.x, car.z, this.lastI);
          const gapToMe = (((me.i - b.s) % N) + N) % N;
          if (gapToMe > 0 && gapToMe < 10 && Math.abs(me.side - b.off) < 2.6) target = Math.min(target, Math.abs(car.speed) * 0.97);
          const behind = (((b.s - me.i) % N) + N) % N;
          if (behind > 0 && behind < 10) wantOff = Math.sign(tr.curv[(i + 20) % N]!) * 3;
        }
        b.off += Math.max(-dt * 3, Math.min(dt * 3, wantOff - b.off));
        b.v += Math.max(-24 * dt, Math.min(9 * dt, target - b.v));
        const before = b.s;
        b.s = (b.s + b.v * dt) % N;
        if (before > N - 20 && b.s < 20) this.botLap(b);
        const p = tr.pts[Math.floor(b.s)]!, q = tr.pts[(Math.floor(b.s) + 2) % N]!;
        const dir = q.clone().sub(p).normalize();
        const left = new THREE.Vector3(dir.z, 0, -dir.x);
        b.rig.group.position.set(p.x + left.x * b.off, 0, p.z + left.z * b.off);
        b.rig.group.rotation.y = Math.atan2(dir.x, dir.z);
        for (const w of b.rig.wheels) {
          w.spin.rotation.x += (b.v * dt) / 0.34;
          if (w.front) w.obj.rotation.y = THREE.MathUtils.clamp(tr.curv[(i + 4) % N]! * 25, -0.35, 0.35);
        }
        b.wear = Math.min(1, b.wear + (COMPOUND[b.tyre].wear / N) * b.v * dt);
        // Feature race: the bot pits once mid-race.
        if (this.setup.mode === "feature" && !b.pitted && b.lap >= Math.floor(st.laps / 2)) (b.pitted = true), (b.tyre = b.tyre === "hard" ? "medium" : "hard"), (b.wear = 0), (b.time += 22);
        // Do not drive through me: a nudge apart.
        if (car) {
          const dx = b.rig.group.position.x - car.x, dz = b.rig.group.position.z - car.z;
          const d = Math.hypot(dx, dz);
          if (d < 2.2 && d > 0.01) (b.off += (dx * left.x + dz * left.z > 0 ? 1 : -1) * 0.6), (b.v *= 0.97);
        }
      }
    }
    if (!car) return;
    // Me: progress along the track, laps, sectors, track limits, tyres, fuel and the pits.
    const me = tr.nearest(car.x, car.z, this.lastI);
    const crossed = this.lastI > N - 30 && me.i < 30 && me.i >= 0;
    const backwards = this.lastI < 30 && me.i > N - 30;
    const i = me.i;
    if (st.phase === "racing") {
      st.lapTime = this.clock - this.lapStart;
      for (const [k, at] of tr.sectors.entries())
        if (this.lastI < at && i >= at && i - at < 30 && st.sectors[k] === null) {
          st.sectors[k] = this.clock - this.sectorStart;
          this.sectorStart = this.clock;
        }
      if (crossed && !backwards) this.lapDone();
      // Track limits: all four wheels outside the white lines for half a second, away from the pit lane.
      const inPitLane = me.side < -(TRACK_W / 2 + 2) && i > tr.start - 34 && i < tr.start + 104;
      if (Math.abs(me.side) > TRACK_W / 2 + 1.0 && !inPitLane) this.offTime += dt;
      else this.offTime = 0;
      if (this.offTime > 0.5) {
        this.offTime = -2;
        st.warnings++;
        if (st.warnings % 3 === 0) (st.penalty += 5), (st.message = "Track limits: 5 second penalty"), this.host.sound("miss");
        else st.message = `Track limits warning (${st.warnings % 3}/3)`;
      }
      // Pit lane: the speed limiter, a stop in the box: new tyres (the next compound) and fuel.
      st.inPit = inPitLane;
      this.host.limit(inPitLane ? 60 / 3.6 : null);
      const box = tr.pitBoxes[0]!;
      if (inPitLane && Math.hypot(car.x - box.x, car.z - box.z) < 3 && Math.abs(car.speed) < 1) {
        this.pitStop += dt;
        st.message = `Pit stop... ${Math.max(0, 2.6 - this.pitStop).toFixed(1)}s`;
        if (this.pitStop > 2.6) {
          this.pitStop = -999;
          st.tyre = st.tyre === "soft" ? "medium" : st.tyre === "medium" ? "hard" : "soft";
          st.wear = 0;
          st.fuel = Math.max(st.fuel, 60);
          st.pitDone = true;
          st.message = `New ${st.tyre} tyres. Go!`;
          this.host.sound("win");
        }
      } else if (!inPitLane) this.pitStop = 0;
      // Tyres warm with speed and sliding; worn and cold tyres grip less. Fuel burns with distance.
      const sp = Math.abs(car.speed);
      st.temp += ((50 + sp * 0.9 - st.temp) * dt) / 6;
      st.wear = Math.min(1, st.wear + (COMPOUND[st.tyre].wear / N) * sp * dt);
      st.fuel = Math.max(0, st.fuel - (sp * dt * 6) / N);
      const warm = st.temp < 75 ? 0.9 + ((st.temp - 45) / 30) * 0.1 : st.temp > 115 ? 0.95 : 1;
      this.grip = COMPOUND[st.tyre].grip * (1 - st.wear * 0.3) * warm * (st.fuel <= 0 ? 0 : 1);
      this.host.grip(this.grip);
      if (st.fuel <= 0) st.message = "Out of fuel!";
    }
    this.lastI = i;
    // The order: laps first, then distance round the lap.
    const mine = { name: "You", me: true, prog: st.lap * N + ((i - tr.start + N) % N), lap: st.lap, best: st.best, last: st.last, tyre: st.tyre, pit: st.inPit, penalty: st.penalty, done: this.myDone };
    const rows = [mine, ...this.bots.map((b) => ({ name: b.name, me: false, prog: b.lap * N + ((Math.floor(b.s) - tr.start + N) % N), lap: b.lap, best: b.best, last: b.lastLap, tyre: b.tyre, pit: false, penalty: 0, done: b.done }))].sort((a, b) => (a.done !== null && b.done !== null ? a.done - b.done : b.prog - a.prog));
    st.pos = rows.findIndex((r) => r.me) + 1;
    st.standings = rows.map((r, k) => ({ name: r.name, me: r.me, pos: k + 1, lap: Math.max(0, r.lap), gap: k === 0 ? "Leader" : `+${Math.max(0, (rows[0]!.prog - r.prog) / 60).toFixed(1)}s`, best: r.best, last: r.last, pit: r.pit, tyre: r.tyre, penalty: r.penalty }));
    if (Math.floor(this.clock * 2) % 2 === 0) tr.timing.draw(st.standings.map((s) => `${String(s.pos).padStart(2)} ${s.name.padEnd(11)} ${s.lap}`));
    // The finish: when I take the flag (or everyone in time trial), then results.
    if (st.phase === "finished" && !st.results && performance.now() > this.finishAt) this.results(rows);
    this.host.state({ ...st });
  }

  private botLap(b: Bot) {
    const t = this.clock - b.lapStart;
    if (b.lap > 0) (b.lastLap = t), (b.best = b.best === null ? t : Math.min(b.best, t));
    b.lap++;
    b.lapStart = this.clock;
    if (this.st.laps && b.lap > this.st.laps && b.done === null) b.done = this.clock;
  }

  private lapDone() {
    const st = this.st;
    const t = this.clock - this.lapStart;
    if (st.lap >= 1 || this.setup.mode === "practice" || this.setup.mode === "qualifying" || this.setup.mode === "timetrial") {
      if (st.lap >= 1) {
        st.last = t;
        st.delta = st.best !== null ? t - st.best : null;
        if (st.best === null || t < st.best) (st.best = t), (st.message = `Fastest lap ${fmtLap(t)}`);
        else st.message = `Lap ${fmtLap(t)} (${st.delta! > 0 ? "+" : ""}${st.delta!.toFixed(3)})`;
        st.sectors.forEach((s, k) => s !== null && (this.sectorBest[k] = this.sectorBest[k] === null ? s : Math.min(this.sectorBest[k]!, s)));
      }
    }
    st.lap++;
    st.sectors = [null, null, null];
    this.lapStart = this.clock;
    this.sectorStart = this.clock;
    if (st.laps && st.lap > st.laps) {
      if (this.setup.mode === "feature" && !st.pitDone) (st.penalty += 30), (st.message = "No pit stop: 30 second penalty");
      st.phase = "finished";
      this.myDone = this.clock + st.penalty;
      this.finishAt = performance.now() + 4000;
      this.host.hold(true);
      this.host.sound("win");
    }
  }

  private results(rows: { name: string; me: boolean; best: number | null; done: number | null; prog: number }[]) {
    const st = this.st;
    const fastest = Math.min(...rows.map((r) => r.best ?? Infinity));
    const ordered = [...rows].sort((a, b) => (a.done ?? Infinity) - (b.done ?? Infinity) || b.prog - a.prog);
    st.results = ordered.map((r, k) => ({ pos: k + 1, name: r.name, time: r.done !== null ? fmtLap(r.done - this.t0) : "DNF", best: fmtLap(r.best), points: (POINTS[k] ?? 0) + (r.best === fastest && k < 10 ? 2 : 0), me: r.me }));
    const mine = st.results.find((r) => r.me)!;
    const coins = Math.max(1, 6 - mine.pos);
    this.host.done(mine.points, coins, `Grand Prix: P${mine.pos} of ${rows.length}${st.best ? ` · best lap ${fmtLap(st.best)}` : ""}`, st.best);
  }

  // Practice, qualifying and time trial end when I stop them.
  finishNow() {
    if (this.st.phase === "finished") return;
    this.st.phase = "finished";
    this.myDone = this.clock;
    this.finishAt = performance.now();
  }

  stop() {
    for (const b of this.bots) this.host.scene.remove(b.rig.group);
    this.host.hold(false);
    this.host.limit(null);
    this.host.grip(1);
    this.host.state(null);
    this.track.lights.forEach((m) => ((m.material as THREE.MeshStandardMaterial).emissiveIntensity = 0));
  }
}
