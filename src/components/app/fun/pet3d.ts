import * as THREE from "three";

// The pet in 3D: a chibi animal per kind (cat, puppy, fox, panda, dragon, robot, owl, bunny) built from soft shapes
// with cel shading and drawn anime eyes. It grows through four stages (a baby has a big head and small body), wears
// what it owns, and lives: it breathes, blinks, wags, looks at the pointer, hops when petted, munches, plays, splashes
// in the bath, and curls up to sleep.

export type PetLook = { kind: string; stage: number; skin: string | null; wear: string[]; outfit: string };
export type PetAction = "idle" | "eat" | "happy" | "play" | "bath" | "sleep" | "sad" | "walk" | "drink" | "belly";

const BASE: Record<string, { body: string; belly: string; dark: string }> = {
  cat: { body: "#f59e0b", belly: "#fef3c7", dark: "#92400e" },
  dog: { body: "#d6a77a", belly: "#fef3c7", dark: "#78350f" },
  fox: { body: "#f97316", belly: "#fff7ed", dark: "#1f2937" },
  panda: { body: "#f8fafc", belly: "#f8fafc", dark: "#111827" },
  dragon: { body: "#22c55e", belly: "#fde68a", dark: "#166534" },
  robot: { body: "#94a3b8", belly: "#e2e8f0", dark: "#334155" },
  owl: { body: "#a16207", belly: "#fde68a", dark: "#422006" },
  bunny: { body: "#f1f5f9", belly: "#fce7f3", dark: "#f9a8d4" },
};
const SKIN: Record<string, [string, string, string]> = {
  "petskin.gold": ["#facc15", "#fef9c3", "#a16207"],
  "petskin.snow": ["#f8fafc", "#ffffff", "#cbd5e1"],
  "petskin.galaxy": ["#4c1d95", "#db2777", "#22d3ee"],
};

let gradient: THREE.DataTexture | null = null;
const toon = (c: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 190, 190, 190, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color: c, gradientMap: gradient, ...extra });
};
const outlineMat = new THREE.MeshBasicMaterial({ color: "#1a1423", side: THREE.BackSide });
const S = (r: number, seg = 20) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75));
function part(g: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, line = true) {
  const o = new THREE.Mesh(g, m);
  o.position.set(x, y, z);
  o.scale.set(sx, sy, sz);
  if (line) {
    const l = new THREE.Mesh(g, outlineMat);
    l.scale.setScalar(1.06);
    o.add(l);
  }
  return o;
}

type Face = "open" | "blink" | "happy" | "sad" | "sleep" | "wow";
function faceTex(kind: string, f: Face, eye = "#111827") {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const y = 120, lx = 80, rx = 176;
  if (kind === "robot") {
    g.fillStyle = "#0f172a";
    g.beginPath();
    g.roundRect(30, 60, 196, 130, 30);
    g.fill();
    g.fillStyle = "#22d3ee";
    g.shadowColor = "#22d3ee";
    g.shadowBlur = 12;
  }
  if (kind === "panda") {
    g.fillStyle = "#111827";
    for (const x of [lx, rx]) (g.beginPath(), g.ellipse(x, y + 4, 34, 42, x < 128 ? 0.4 : -0.4, 0, Math.PI * 2), g.fill());
  }
  const open = (x: number) => {
    g.fillStyle = kind === "robot" ? "#22d3ee" : kind === "panda" ? "#f8fafc" : eye;
    g.beginPath();
    g.ellipse(x, y, 22, f === "wow" ? 30 : 26, 0, 0, Math.PI * 2);
    g.fill();
    if (kind === "panda") {
      g.fillStyle = "#111827";
      g.beginPath();
      g.ellipse(x, y + 2, 15, 18, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = "#fff";
    g.beginPath();
    g.ellipse(x + 7, y - 9, 8, 9, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(x - 7, y + 10, 3.5, 3.5, 0, 0, Math.PI * 2);
    g.fill();
  };
  const arc = (x: number, up: boolean) => {
    g.strokeStyle = kind === "robot" ? "#22d3ee" : kind === "panda" ? "#f8fafc" : "#1f2937";
    g.lineWidth = 7;
    g.lineCap = "round";
    g.beginPath();
    if (up) g.arc(x, y + 10, 18, 1.15 * Math.PI, 1.85 * Math.PI);
    else g.arc(x, y - 6, 18, 0.15 * Math.PI, 0.85 * Math.PI);
    g.stroke();
  };
  if (f === "open" || f === "wow") (open(lx), open(rx));
  else if (f === "happy") (arc(lx, true), arc(rx, true));
  else (arc(lx, false), arc(rx, false));
  g.shadowBlur = 0;
  if (kind !== "robot") {
    g.fillStyle = "rgba(255,110,140,.35)";
    for (const x of [lx - 18, rx + 18]) (g.beginPath(), g.ellipse(x, y + 42, 20, 10, 0, 0, Math.PI * 2), g.fill());
  }
  if (f === "sad") {
    g.fillStyle = "rgba(96,165,250,.85)";
    g.beginPath();
    g.ellipse(rx + 4, y + 34, 6, 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Mouth.
  g.strokeStyle = kind === "robot" ? "#22d3ee" : "#1f2937";
  g.lineWidth = 5;
  g.beginPath();
  if (kind === "owl") {
    g.fillStyle = "#f59e0b";
    g.moveTo(118, 150);
    g.lineTo(138, 150);
    g.lineTo(128, 172);
    g.fill();
  } else if (f === "happy" || f === "wow") {
    g.fillStyle = "#be123c";
    g.arc(128, 160, 14, 0, Math.PI);
    g.fill();
  } else if (f === "sad") g.arc(128, 178, 12, 1.15 * Math.PI, 1.85 * Math.PI);
  else {
    g.arc(118, 158, 10, 0.1 * Math.PI, 0.9 * Math.PI);
    g.moveTo(148, 158);
    g.arc(138, 158, 10, 0.1 * Math.PI, 0.9 * Math.PI);
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type Pet = {
  root: THREE.Group;
  body: THREE.Object3D;
  head: THREE.Object3D;
  ears: THREE.Object3D[];
  tail: THREE.Object3D | null;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  face: THREE.MeshBasicMaterial;
  faces: Map<Face, THREE.Texture>;
  kind: string;
  action: PetAction;
  actionAt: number;
  blinkAt: number;
  look: THREE.Vector2;
  fx: THREE.Group;
  dispose: () => void;
};

export function buildPet(l: PetLook): Pet {
  const kind = BASE[l.kind] ? l.kind : "cat";
  const sk = l.skin ? SKIN[l.skin] : null;
  const col = sk ? { body: sk[0], belly: sk[1], dark: sk[2] } : BASE[kind]!;
  const stage = Math.max(0, Math.min(3, l.stage));
  const headR = [0.62, 0.56, 0.5, 0.46][stage]!;
  const bodyR = [0.42, 0.48, 0.54, 0.6][stage]!;
  const legLen = [0.12, 0.16, 0.2, 0.24][stage]!;
  const root = new THREE.Group();
  const mats: THREE.Material[] = [];
  const M = (c: string, extra: Partial<THREE.MeshToonMaterialParameters> = {}) => {
    const m = toon(c, extra);
    mats.push(m);
    return m;
  };
  const bodyM = M(col.body), bellyM = M(col.belly), darkM = M(col.dark);
  const body = new THREE.Group();
  body.position.y = legLen + bodyR * 0.8;
  root.add(body);
  const robot = kind === "robot";
  body.add(part(robot ? new THREE.BoxGeometry(bodyR * 1.7, bodyR * 1.5, bodyR * 1.4, 2, 2, 2) : S(bodyR), bodyM, 0, 0, 0, 1, robot ? 1 : 0.9, 1));
  if (!robot) body.add(part(S(bodyR * 0.7), bellyM, 0, -bodyR * 0.08, bodyR * 0.42, 1, 0.95, 0.6, false));
  if (sk && l.skin === "petskin.galaxy") for (let i = 0; i < 10; i++) body.add(part(S(0.03, 6), M("#fde68a", { emissive: "#fde68a" }), (Math.random() - 0.5) * bodyR * 1.4, (Math.random() - 0.5) * bodyR, bodyR * 0.85, 1, 1, 1, false));
  // Legs.
  const legs: THREE.Object3D[] = [];
  if (kind !== "owl") {
    for (const [x, z] of [[-0.22, 0.2], [0.22, 0.2], [-0.22, -0.2], [0.22, -0.2]]) {
      const pivot = new THREE.Object3D();
      pivot.position.set(x! * bodyR * 2, -bodyR * 0.55, z! * bodyR * 1.6);
      pivot.add(part(new THREE.CapsuleGeometry(bodyR * 0.2, legLen, 4, 8), kind === "panda" ? darkM : bodyM, 0, -legLen * 0.5, 0));
      body.add(pivot);
      legs.push(pivot);
    }
  } else for (const x of [-0.18, 0.18]) body.add(part(S(0.1, 8), M("#f59e0b"), x, -bodyR * 0.85, bodyR * 0.3, 1.4, 0.6, 1.4, false));
  // Head.
  const head = new THREE.Group();
  head.position.set(0, bodyR * 0.85 + headR * 0.7, bodyR * 0.15);
  body.add(head);
  head.add(part(robot ? new THREE.BoxGeometry(headR * 2, headR * 1.7, headR * 1.7) : S(headR, 24), kind === "panda" ? bodyM : bodyM, 0, 0, 0, 1, 0.95, 0.95));
  const faces = new Map<Face, THREE.Texture>();
  for (const f of ["open", "blink", "happy", "sad", "sleep", "wow"] as Face[]) faces.set(f, faceTex(kind, f));
  const face = new THREE.MeshBasicMaterial({ map: faces.get("open")!, transparent: true, depthWrite: false });
  mats.push(face);
  const patch = robot ? new THREE.Mesh(new THREE.PlaneGeometry(headR * 1.8, headR * 1.8), face) : new THREE.Mesh(new THREE.SphereGeometry(headR * 1.005, 28, 18, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.75, 1.5), face);
  if (robot) patch.position.z = headR * 0.86;
  patch.scale.set(1, 0.95, 0.95);
  patch.renderOrder = 2;
  head.add(patch);
  if (kind === "dog" || kind === "fox") head.add(part(S(headR * 0.36), bellyM, 0, -headR * 0.28, headR * 0.82, 1.1, 0.75, 0.8, false));
  if (kind === "dog" || kind === "fox" || kind === "cat" || kind === "bunny" || kind === "panda") head.add(part(S(headR * 0.08, 8), M("#1f2937"), 0, -headR * 0.15, headR * 0.98, 1.2, 0.8, 0.8, false));
  if (kind === "cat") for (const x of [-1, 1]) for (const dy of [-0.05, 0.05]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(headR * 0.6, 0.008, 0.008), M("#1f2937"));
    w.position.set(x * headR * 0.75, -headR * 0.18 + dy, headR * 0.8);
    w.rotation.z = x * dy * 3;
    head.add(w);
  }
  // Ears by kind.
  const ears: THREE.Object3D[] = [];
  const ear = (x: number, make: () => THREE.Object3D) => {
    const p = new THREE.Object3D();
    p.position.set(x * headR * 0.55, headR * 0.7, 0);
    p.add(make());
    head.add(p);
    ears.push(p);
  };
  for (const x of [-1, 1]) {
    if (kind === "cat" || kind === "fox") ear(x, () => {
      const g = new THREE.Group();
      const e = part(new THREE.ConeGeometry(headR * 0.32, headR * 0.6, 4), bodyM, 0, headR * 0.2, 0);
      e.rotation.z = -x * 0.2;
      g.add(e);
      if (kind === "fox") g.add(part(new THREE.ConeGeometry(headR * 0.14, headR * 0.22, 4), darkM, -x * headR * 0.03, headR * 0.44, 0.02, 1, 1, 1, false));
      return g;
    });
    else if (kind === "dog") ear(x, () => {
      const e = part(S(headR * 0.3), darkM, x * headR * 0.2, -headR * 0.35, 0, 0.55, 1.25, 0.4);
      e.rotation.z = x * 0.3;
      return e;
    });
    else if (kind === "panda") ear(x, () => part(S(headR * 0.24), darkM, 0, 0, 0, 1, 1, 0.6));
    else if (kind === "bunny") ear(x, () => {
      const e = part(new THREE.CapsuleGeometry(headR * 0.16, headR * 0.9, 4, 10), bodyM, 0, headR * 0.55, 0, 1, 1, 0.55);
      e.add(part(new THREE.CapsuleGeometry(headR * 0.08, headR * 0.7, 4, 8), M("#f9a8d4"), 0, 0, headR * 0.06, 1, 1, 0.5, false));
      e.rotation.z = -x * 0.15;
      return e;
    });
    else if (kind === "dragon") ear(x, () => {
      const h = part(new THREE.ConeGeometry(headR * 0.12, headR * 0.5, 6), M("#fde68a"), 0, headR * 0.2, -headR * 0.1);
      h.rotation.x = -0.4;
      return h;
    });
    else if (kind === "owl") ear(x, () => {
      const t = part(new THREE.ConeGeometry(headR * 0.18, headR * 0.4, 5), darkM, 0, headR * 0.1, 0);
      t.rotation.z = -x * 0.5;
      return t;
    });
  }
  if (robot) {
    const ant = new THREE.Object3D();
    ant.position.y = headR * 0.85;
    ant.add(part(new THREE.CylinderGeometry(0.02, 0.02, headR * 0.5), darkM, 0, headR * 0.25, 0, 1, 1, 1, false));
    ant.add(part(S(headR * 0.12, 10), M("#f43f5e", { emissive: "#be123c" }), 0, headR * 0.55, 0, 1, 1, 1, false));
    head.add(ant);
    ears.push(ant);
  }
  // Tail.
  let tail: THREE.Object3D | null = null;
  if (kind !== "owl" && kind !== "robot") {
    tail = new THREE.Object3D();
    tail.position.set(0, 0, -bodyR * 0.9);
    if (kind === "bunny") tail.add(part(S(bodyR * 0.28), M("#ffffff"), 0, 0, -0.05));
    else if (kind === "fox") {
      const t = part(S(bodyR * 0.4), bodyM, 0, bodyR * 0.25, -bodyR * 0.4, 0.8, 0.8, 1.6);
      t.add(part(S(bodyR * 0.25), M("#ffffff"), 0, 0, -bodyR * 0.55, 1, 1, 1, false));
      tail.add(t);
    } else {
      const len = kind === "cat" || kind === "dragon" ? bodyR * 1.3 : bodyR * 0.5;
      const t = part(new THREE.CapsuleGeometry(bodyR * (kind === "dragon" ? 0.16 : 0.1), len, 4, 8), kind === "panda" ? darkM : bodyM, 0, len * 0.4, -len * 0.25);
      t.rotation.x = -0.9;
      tail.add(t);
    }
    body.add(tail);
  }
  // Wings (dragon, owl, or bought ones).
  const wings: THREE.Object3D[] = [];
  const wantWings = kind === "dragon" || kind === "owl" || l.wear.includes("petwear.wings");
  if (wantWings)
    for (const x of [-1, 1]) {
      const p = new THREE.Object3D();
      p.position.set(x * bodyR * 0.8, bodyR * 0.2, -bodyR * 0.1);
      const wm = l.wear.includes("petwear.wings") ? M("#f8fafc", { emissive: "#e0f2fe" }) : kind === "owl" ? darkM : M("#86efac");
      p.add(part(S(bodyR * 0.5), wm, x * bodyR * 0.25, 0, 0, 0.35, 1, 1.2));
      body.add(p);
      wings.push(p);
    }
  if (kind === "dragon") for (let i = 0; i < 4; i++) body.add(part(new THREE.ConeGeometry(0.06, 0.16, 4), M("#fde68a"), 0, bodyR * 0.85 - i * 0.04, -i * bodyR * 0.28, 1, 1, 1, false));
  // Things to wear.
  const W = (c: string) => M(c);
  const hat = l.outfit;
  if (hat === "bow") {
    const b = new THREE.Group();
    for (const x of [-1, 1]) { const o = part(new THREE.ConeGeometry(headR * 0.18, headR * 0.3, 4), W("#ec4899"), x * headR * 0.16, 0, 0, 1, 1, 1, false); o.rotation.z = (x * Math.PI) / 2; b.add(o); }
    b.position.set(headR * 0.45, headR * 0.75, 0.1);
    head.add(b);
  } else if (hat === "cap") {
    head.add(part(new THREE.SphereGeometry(headR * 1.02, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), W("#2563eb"), 0, headR * 0.1, 0));
    head.add(part(new THREE.CylinderGeometry(headR * 0.5, headR * 0.5, 0.03, 16), W("#2563eb"), 0, headR * 0.45, headR * 0.6, 1, 1, 0.8, false));
  } else if (hat === "glasses") {
    for (const x of [-1, 1]) head.add(part(new THREE.TorusGeometry(headR * 0.22, 0.02, 6, 16), W("#111827"), x * headR * 0.38, headR * 0.05, headR * 0.92, 1, 1, 1, false));
  } else if (hat === "crown") {
    head.add(part(new THREE.CylinderGeometry(headR * 0.4, headR * 0.36, headR * 0.25, 10, 1, true), W("#facc15"), 0, headR * 0.95, 0, 1, 1, 1, false));
  } else if (hat === "headphones") {
    head.add(part(new THREE.TorusGeometry(headR * 1.02, 0.04, 6, 20, Math.PI), W("#111827"), 0, 0, 0, 1, 1, 1, false));
    for (const x of [-1, 1]) head.add(part(S(headR * 0.22), W("#ef4444"), x * headR, 0, 0, 0.6, 1, 1, false));
  } else if (hat === "wizard") {
    head.add(part(new THREE.ConeGeometry(headR * 0.55, headR * 1.2, 14), W("#4c1d95"), 0, headR * 1.3, 0));
  }
  if (l.wear.includes("petwear.collar")) {
    { const o = part(new THREE.TorusGeometry(headR * 0.62, 0.035, 6, 20), W("#dc2626"), 0, -headR * 0.72, 0, 1, 1, 1, false); o.rotation.x = Math.PI / 2; head.add(o); }
    head.add(part(S(0.05, 8), W("#facc15"), 0, -headR * 0.8, headR * 0.6, 1, 1, 1, false));
  }
  if (l.wear.includes("petwear.bandana")) { const o = part(new THREE.ConeGeometry(headR * 0.45, headR * 0.5, 3), W("#2563eb"), 0, -headR * 0.85, headR * 0.45, 1, 1, 0.4, false); o.rotation.x = Math.PI; head.add(o); }
  if (l.wear.includes("petwear.scarf")) { const o = part(new THREE.TorusGeometry(headR * 0.6, 0.08, 8, 20), W("#16a34a"), 0, -headR * 0.75, 0, 1, 1, 1, false); o.rotation.x = Math.PI / 2; head.add(o); }
  const fx = new THREE.Group();
  root.add(fx);
  root.traverse((o) => o instanceof THREE.Mesh && (o.castShadow = true));
  const pet: Pet = {
    root, body, head, ears, tail, legs, wings, face, faces, kind, action: "idle", actionAt: 0, blinkAt: performance.now() + 2000, look: new THREE.Vector2(), fx,
    dispose: () => {
      root.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      mats.forEach((m) => m.dispose());
      faces.forEach((t) => t.dispose());
    },
  };
  return pet;
}

const heartTex = (() => {
  let t: THREE.Texture | null = null;
  return (kind: "heart" | "z" | "bubble" | "crumb" | "star") => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    if (kind === "heart") {
      g.fillStyle = "#f43f5e";
      g.beginPath();
      g.moveTo(32, 54);
      g.bezierCurveTo(4, 34, 10, 6, 32, 20);
      g.bezierCurveTo(54, 6, 60, 34, 32, 54);
      g.fill();
    } else if (kind === "z") {
      g.fillStyle = "#6366f1";
      g.font = "bold 48px system-ui";
      g.textAlign = "center";
      g.fillText("z", 32, 48);
    } else if (kind === "bubble") {
      g.strokeStyle = "#7dd3fc";
      g.lineWidth = 4;
      g.fillStyle = "rgba(186,230,253,.4)";
      g.beginPath();
      g.arc(32, 32, 24, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else if (kind === "star") {
      g.fillStyle = "#facc15";
      g.beginPath();
      for (let i = 0; i < 10; i++) g.lineTo(32 + Math.cos((i * Math.PI) / 5 - Math.PI / 2) * (i % 2 ? 11 : 26), 32 + Math.sin((i * Math.PI) / 5 - Math.PI / 2) * (i % 2 ? 11 : 26));
      g.fill();
    } else {
      g.fillStyle = "#b45309";
      g.fillRect(20, 20, 24, 24);
    }
    void t;
    t = new THREE.CanvasTexture(c);
    return t;
  };
})();

// Little floating things: hearts, z's, bubbles, crumbs, stars.
export function puff(p: Pet, kind: "heart" | "z" | "bubble" | "crumb" | "star", n = 5) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex(kind), transparent: true, depthWrite: false }));
    s.scale.setScalar(kind === "crumb" ? 0.08 : 0.22);
    s.position.set((Math.random() - 0.5) * 0.8, 1 + Math.random() * 0.5, 0.3 + Math.random() * 0.3);
    s.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.4, kind === "crumb" ? -0.6 : 0.5 + Math.random() * 0.4, 0), born: performance.now() + i * 120 };
    p.fx.add(s);
  }
}

export function setAction(p: Pet, a: PetAction) {
  p.action = a;
  p.actionAt = performance.now();
  if (a === "happy" || a === "belly") puff(p, "heart", 6);
  if (a === "eat") puff(p, "crumb", 6);
  if (a === "bath") puff(p, "bubble", 10);
  if (a === "play") puff(p, "star", 5);
}

// One frame of life. `mood` 0..1 sets how happily it wags; `sleeping` curls it up.
export function animatePet(p: Pet, t: number, dt: number, mood: number, sleeping: boolean) {
  const since = (performance.now() - p.actionAt) / 1000;
  let a = p.action;
  if (a !== "idle" && a !== "walk" && a !== "sleep" && a !== "sad" && since > 2.2) a = p.action = "idle";
  if (sleeping) a = "sleep";
  const bodyY = p.body.userData.y0 ?? (p.body.userData.y0 = p.body.position.y);
  p.body.position.y = bodyY;
  p.body.rotation.set(0, 0, 0);
  p.head.rotation.set(0, 0, 0);
  p.root.position.y = 0;
  let face: Face = "open";
  const breathe = 1 + Math.sin(t * 2.4) * 0.025;
  p.body.scale.set(1, breathe, 1);
  // Looks at the pointer.
  p.head.rotation.y = THREE.MathUtils.clamp(p.look.x * 0.7, -0.7, 0.7);
  p.head.rotation.x = THREE.MathUtils.clamp(-p.look.y * 0.4, -0.4, 0.4);
  const wag = (0.4 + mood * 1.2) * Math.sin(t * (6 + mood * 10));
  if (p.tail) p.tail.rotation.y = wag * 0.6;
  p.ears.forEach((e, i) => (e.rotation.z = Math.sin(t * 3 + i) * 0.05 + (Math.sin(t * 0.7 + i * 4) > 0.97 ? 0.3 : 0)));
  p.wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(t * 4) * 0.15)));
  p.legs.forEach((l) => (l.rotation.x = 0));
  switch (a) {
    case "happy":
    case "belly": {
      const hop = Math.abs(Math.sin(since * 9)) * 0.35 * Math.max(0, 1 - since / 2);
      p.root.position.y = hop;
      p.body.scale.set(1 + hop * 0.2, breathe - hop * 0.3, 1 + hop * 0.2);
      face = "happy";
      if (a === "belly") p.body.rotation.z = Math.sin(since * 14) * 0.15;
      break;
    }
    case "eat":
    case "drink":
      p.head.rotation.x = 0.35 + Math.abs(Math.sin(since * 10)) * 0.25;
      face = since % 0.5 < 0.25 ? "happy" : "open";
      if (Math.random() < 0.05) puff(p, "crumb", 1);
      break;
    case "play":
      p.root.position.y = Math.abs(Math.sin(since * 6)) * 0.45;
      p.body.rotation.y = since * 6;
      face = "wow";
      if (p.tail) p.tail.rotation.y = Math.sin(t * 20) * 0.8;
      break;
    case "bath":
      p.body.rotation.z = Math.sin(since * 25) * 0.18 * Math.max(0, 1 - since / 2);
      face = "blink";
      if (Math.random() < 0.08) puff(p, "bubble", 1);
      break;
    case "walk":
      p.legs.forEach((l, i) => (l.rotation.x = Math.sin(t * 10 + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI : 0)) * 0.6));
      p.root.position.y = Math.abs(Math.sin(t * 10)) * 0.04;
      break;
    case "sleep":
      p.body.rotation.z = 1.2;
      p.body.position.y = bodyY * 0.5;
      face = "sleep";
      p.body.scale.set(1, 1 + Math.sin(t * 1.4) * 0.04, 1);
      if (Math.random() < 0.012) puff(p, "z", 1);
      break;
    case "sad":
      face = "sad";
      p.head.rotation.x = 0.3;
      p.ears.forEach((e) => (e.rotation.z = 0.5));
      break;
  }
  if (face === "open" && performance.now() > p.blinkAt) {
    face = "blink";
    if (performance.now() > p.blinkAt + 150) p.blinkAt = performance.now() + 2200 + Math.random() * 3000;
  }
  const tex = p.faces.get(face)!;
  if (p.face.map !== tex) (p.face.map = tex), (p.face.needsUpdate = true);
  // Floating things rise and fade.
  for (const s of [...p.fx.children] as THREE.Sprite[]) {
    const age = (performance.now() - (s.userData.born as number)) / 1000;
    if (age < 0) {
      s.visible = false;
      continue;
    }
    s.visible = true;
    s.position.addScaledVector(s.userData.v as THREE.Vector3, dt);
    s.material.opacity = Math.max(0, 1 - age / 1.6);
    if (age > 1.6) (p.fx.remove(s), s.material.map?.dispose(), s.material.dispose());
  }
}

// A small three.js stage for a pet (the Pet tab and the pet that roams the screen).
export function petStage(el: HTMLElement, look: PetLook, opts: { transparent?: boolean; zoom?: number } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(el.clientWidth, el.clientHeight);
  renderer.domElement.style.touchAction = "none";
  el.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight("#ffffff", "#a78bfa", 1.3));
  const d = new THREE.DirectionalLight("#fff7e6", 1.4);
  d.position.set(2, 4, 3);
  scene.add(d);
  if (!opts.transparent) {
    const floor = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
  } else {
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), new THREE.MeshBasicMaterial({ color: "#000", transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2;
    scene.add(shadow);
  }
  const camera = new THREE.PerspectiveCamera(35, el.clientWidth / Math.max(1, el.clientHeight), 0.1, 50);
  let zoom = opts.zoom ?? 4;
  let rot = 0;
  let pet = buildPet(look);
  scene.add(pet.root);
  const clock = new THREE.Clock();
  let raf = 0;
  let mood = 0.6, sleeping = false;
  const ro = new ResizeObserver(() => {
    renderer.setSize(el.clientWidth, el.clientHeight);
    camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
    camera.updateProjectionMatrix();
  });
  ro.observe(el);
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, clock.getDelta());
    animatePet(pet, clock.elapsedTime, dt, mood, sleeping);
    pet.root.rotation.y = rot;
    camera.position.set(0, 1.2 + zoom * 0.12, zoom);
    camera.lookAt(0, 0.85, 0);
    renderer.render(scene, camera);
  };
  loop();
  const ray = new THREE.Raycaster();
  return {
    get pet() {
      return pet;
    },
    restyle(l: PetLook) {
      scene.remove(pet.root);
      pet.dispose();
      pet = buildPet(l);
      scene.add(pet.root);
    },
    setMood(m: number, s: boolean) {
      mood = m;
      sleeping = s;
    },
    rotate(dx: number) {
      rot += dx;
    },
    zoomBy(dz: number) {
      zoom = Math.max(2.4, Math.min(7, zoom + dz));
    },
    // Where the pointer touched the pet: head, belly or body (null: missed).
    hit(x: number, y: number) {
      const r = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
      const h = ray.intersectObject(pet.root, true)[0];
      if (!h) return null;
      let o: THREE.Object3D | null = h.object;
      while (o && o !== pet.head && o !== pet.root) o = o.parent;
      if (o === pet.head) return "head";
      return h.point.y < 0.75 ? "belly" : "body";
    },
    lookAt(x: number, y: number) {
      const r = renderer.domElement.getBoundingClientRect();
      pet.look.set(((x - (r.left + r.width / 2)) / window.innerWidth) * 2.5, ((y - (r.top + r.height / 3)) / window.innerHeight) * 2.5);
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      pet.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
export type PetStageApi = ReturnType<typeof petStage>;
