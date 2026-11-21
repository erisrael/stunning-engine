import * as THREE from "three";
import { cyl, mesh, sphere, toon, unitBox } from "./toon";

// Things to do in town, each with its own play, levels and score: archery (draw, aim, let go; arrows fly with
// gravity; moving targets at higher levels), the target gallery (pop-up targets, gold ones worth more, do not hit
// the red ones), hoops (power and aim), fishing (wait for the bite, pull in time), and timed runs (parkour, a race
// lap). The world drives them each frame; the score goes to the board and earns a few coins.

export type Hud = { title: string; line: string; score: number; left?: string; hint: string };
export type ActCtx = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  me: () => { x: number; y: number; z: number };
  hud: (h: Hud | null) => void;
  done: (kind: string, score: number, reward: number, text: string) => void;
  sound: (kind: "shoot" | "hit" | "miss" | "win" | "splash") => void;
};

export interface Activity {
  kind: string;
  camera?: { pos: THREE.Vector3; look: THREE.Vector3 };
  update(dt: number, t: number): void;
  down?(ndc: THREE.Vector2, pointer?: string): void;
  up?(ndc: THREE.Vector2): void;
  move?(ndc: THREE.Vector2): void;
  key?(k: string): void;
  stop(): void;
}

const tmp = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------- archery

export class Archery implements Activity {
  kind = "archery";
  private arrows: { m: THREE.Mesh; v: THREE.Vector3; done: boolean }[] = [];
  private targets: { g: THREE.Group; base: THREE.Vector3; speed: number }[] = [];
  private left = 10;
  private score = 0;
  private drawAt = 0;
  private aim = new THREE.Vector2(0, 0);
  private group = new THREE.Group();
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  private hidden: THREE.Object3D[] = [];
  constructor(private c: ActCtx, private level: number) {
    c.scene.add(this.group);
    // The range's own (still) targets step aside while a round runs.
    c.scene.traverse((o) => o.userData.archery && o.visible && (this.hidden.push(o), (o.visible = false)));
    // Targets: three lanes; level 2 moves them slowly, level 3 faster and further.
    [-110, -118, -126].forEach((x, i) => {
      const g = new THREE.Group();
      const base = new THREE.Vector3(x - (level === 3 ? 4 : 0), 1.6, -28 + i * 5);
      g.position.copy(base);
      for (let r = 0; r < 5; r++) {
        const ring = mesh(cyl(24), toon(["#f8fafc", "#111827", "#3b82f6", "#ef4444", "#facc15"][r]!), 0, 0, 0.02 * r, 1.6 - r * 0.32, 0.04, 1.6 - r * 0.32);
        ring.rotation.x = Math.PI / 2;
        g.add(ring);
      }
      g.rotation.y = Math.PI / 2;
      this.group.add(g);
      this.targets.push({ g, base, speed: level === 1 ? 0 : level === 2 ? 0.6 + i * 0.2 : 1.2 + i * 0.3 });
    });
    this.camera = { pos: new THREE.Vector3(-99.2, 1.7, -23), look: new THREE.Vector3(-118, 1.6, -23) };
    this.hud();
  }
  private hud() {
    this.c.hud({ title: `Archery · level ${this.level}`, line: this.drawAt ? `Power ${Math.round(this.power() * 100)}%` : "Hold to draw, aim, let go", score: this.score, left: `${this.left} arrows`, hint: "Esc to stop" });
  }
  private power() {
    return this.drawAt ? Math.min(1, (performance.now() - this.drawAt) / 900) : 0;
  }
  down() {
    if (this.left > 0) this.drawAt = performance.now();
  }
  move(ndc: THREE.Vector2) {
    this.aim.copy(ndc);
  }
  up() {
    if (!this.drawAt || this.left <= 0) return;
    const p = this.power();
    this.drawAt = 0;
    this.left--;
    const dir = new THREE.Vector3(-1, 0.04 + this.aim.y * 0.25, -this.aim.x * 0.35).normalize();
    const m = mesh(unitBox(), toon("#78350f"), -99.6, 1.6, -23, 0.9, 0.04, 0.04);
    m.add(mesh(unitBox(), toon("#ef4444"), 0.4, 0, 0, 0.15, 0.12, 0.02));
    this.group.add(m);
    this.arrows.push({ m, v: dir.multiplyScalar(18 + p * 30), done: false });
    this.c.sound("shoot");
    this.hud();
  }
  update(dt: number, t: number) {
    for (const tg of this.targets) if (tg.speed) tg.g.position.z = tg.base.z + Math.sin(t * tg.speed + tg.base.x) * 2;
    for (const a of this.arrows) {
      if (a.done) continue;
      const prev = a.m.position.clone();
      a.v.y -= 9.8 * dt;
      a.m.position.addScaledVector(a.v, dt);
      a.m.rotation.z = Math.atan2(a.v.y, -a.v.x) * -1;
      a.m.rotation.y = Math.atan2(a.v.z, -a.v.x);
      for (const tg of this.targets) {
        const px = tg.g.position.x;
        if (prev.x > px && a.m.position.x <= px) {
          const k = (prev.x - px) / (prev.x - a.m.position.x);
          tmp.lerpVectors(prev, a.m.position, k);
          const d = Math.hypot(tmp.y - tg.g.position.y, tmp.z - tg.g.position.z);
          if (d < 0.8) {
            const pts = d < 0.16 ? 10 : d < 0.32 ? 8 : d < 0.48 ? 6 : d < 0.64 ? 4 : 2;
            this.score += pts * this.level;
            a.done = true;
            a.m.position.copy(tmp);
            tg.g.attach(a.m);
            this.c.sound(pts === 10 ? "win" : "hit");
          }
        }
      }
      if (a.m.position.y < 0 || a.m.position.x < -140) {
        if (!a.done) this.c.sound("miss");
        a.done = true;
      }
    }
    if (this.drawAt) this.hud();
    if (this.left === 0 && this.arrows.every((a) => a.done)) {
      this.c.done("archery", this.score, Math.round(this.score / 10), `${this.score} points with 10 arrows`);
      this.left = -1;
    }
  }
  stop() {
    this.c.scene.remove(this.group);
    this.hidden.forEach((o) => (o.visible = true));
    this.c.hud(null);
  }
}

// ------------------------------------------------------------------------------------------------- target gallery

export class Gallery implements Activity {
  kind = "gallery";
  private pops: { m: THREE.Mesh; kind: "plain" | "gold" | "red"; until: number; hit: boolean }[] = [];
  private score = 0;
  private combo = 0;
  private end: number;
  private next = 0;
  private group = new THREE.Group();
  private ray = new THREE.Raycaster();
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx, private level: number) {
    c.scene.add(this.group);
    this.end = performance.now() + 40_000;
    this.camera = { pos: new THREE.Vector3(-110, 1.8, 24), look: new THREE.Vector3(-110, 2, 14) };
  }
  down(ndc: THREE.Vector2) {
    this.ray.setFromCamera(ndc, this.c.camera);
    const hit = this.ray.intersectObjects(this.pops.filter((p) => !p.hit).map((p) => p.m))[0];
    this.c.sound("shoot");
    if (!hit) return void (this.combo = 0);
    const p = this.pops.find((x) => x.m === hit.object)!;
    p.hit = true;
    if (p.kind === "red") (this.score = Math.max(0, this.score - 5)), (this.combo = 0), this.c.sound("miss");
    else {
      this.combo++;
      this.score += (p.kind === "gold" ? 5 : 2) * (1 + Math.floor(this.combo / 5));
      this.c.sound("hit");
    }
  }
  update(_dt: number, t: number) {
    const now = performance.now();
    if (now > this.next) {
      this.next = now + Math.max(280, 900 - this.level * 200) * (0.6 + Math.random() * 0.8);
      const r = Math.random();
      const kind = r < 0.15 ? "gold" : r < 0.3 ? "red" : "plain";
      const m = mesh(cyl(20), toon(kind === "gold" ? "#facc15" : kind === "red" ? "#dc2626" : "#f8fafc", { emissive: kind === "gold" ? "#a16207" : "#000000" }), -115 + Math.random() * 10, 1.2 + Math.random() * 1.8, 14.6, 0.7, 0.08, 0.7);
      m.rotation.x = Math.PI / 2;
      m.add(mesh(cyl(20), toon(kind === "red" ? "#111827" : "#ef4444"), 0, 0.05, 0, 0.35, 0.02, 0.35));
      this.group.add(m);
      this.pops.push({ m, kind, until: now + Math.max(700, 1700 - this.level * 300), hit: false });
    }
    for (const p of this.pops) {
      const live = now < p.until && !p.hit;
      p.m.scale.setScalar(live ? Math.min(1, p.m.scale.x + 0.15) : Math.max(0.01, p.m.scale.x - 0.2));
      if (!live && p.m.scale.x <= 0.02) this.group.remove(p.m);
    }
    this.pops = this.pops.filter((p) => p.m.parent);
    void t;
    const left = Math.max(0, Math.ceil((this.end - now) / 1000));
    this.c.hud({ title: `Target gallery · level ${this.level}`, line: this.combo >= 5 ? `Combo x${1 + Math.floor(this.combo / 5)}` : "Tap the white and gold targets, never the red", score: this.score, left: `${left}s`, hint: "Esc to stop" });
    if (left === 0 && this.end > 0) {
      this.end = 0;
      this.c.done("gallery", this.score, Math.round(this.score / 8), `${this.score} points in 40 seconds`);
    }
  }
  stop() {
    this.c.scene.remove(this.group);
    this.c.hud(null);
  }
}

// ------------------------------------------------------------------------------------------------- hoops

export class Hoops implements Activity {
  kind = "hoops";
  private ball: { m: THREE.Mesh; v: THREE.Vector3; live: boolean; scored: boolean } | null = null;
  private left = 10;
  private made = 0;
  private drawAt = 0;
  private aimX = 0;
  private group = new THREE.Group();
  private rim = new THREE.Vector3(-75, 3.1, 33.2);
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx) {
    c.scene.add(this.group);
    this.camera = { pos: new THREE.Vector3(-75, 2.2, 24.5), look: new THREE.Vector3(-75, 3, 33) };
    this.hud();
  }
  private hud() {
    this.c.hud({ title: "Hoops", line: this.drawAt ? `Power ${Math.round(this.power() * 100)}%` : "Hold for power, aim left or right, let go", score: this.made, left: `${this.left} balls`, hint: "Esc to stop" });
  }
  private power() {
    return this.drawAt ? 0.5 + 0.5 * Math.abs(Math.sin((performance.now() - this.drawAt) / 600)) : 0;
  }
  down() {
    if (!this.ball?.live && this.left > 0) this.drawAt = performance.now();
  }
  move(ndc: THREE.Vector2) {
    this.aimX = ndc.x;
  }
  up() {
    if (!this.drawAt) return;
    const p = this.power();
    this.drawAt = 0;
    this.left--;
    const m = mesh(sphere(14), toon("#ea580c"), -75, 1.9, 26.5, 0.48, 0.48, 0.48);
    this.group.add(m);
    // A ball thrown at the right power (about 65%) drops through the rim.
    const v = new THREE.Vector3(this.aimX * 1.2, 4.2 + p * 4.6, 3.2 + p * 3.2);
    this.ball = { m, v, live: true, scored: false };
    this.c.sound("shoot");
    this.hud();
  }
  update(dt: number) {
    const b = this.ball;
    if (b?.live) {
      const prevY = b.m.position.y;
      b.v.y -= 9.8 * dt;
      b.m.position.addScaledVector(b.v, dt);
      const p = b.m.position;
      if (!b.scored && prevY >= this.rim.y && p.y < this.rim.y && Math.hypot(p.x - this.rim.x, p.z - this.rim.z) < 0.4) {
        b.scored = true;
        this.made++;
        this.c.sound("win");
      }
      // The backboard.
      if (p.z > 33.5 && p.y > 2.9 && p.y < 4.3 && Math.abs(p.x + 75) < 1) (b.v.z *= -0.5), (p.z = 33.5);
      if (p.y < 0.25) {
        b.live = false;
        if (!b.scored) this.c.sound("miss");
        window.setTimeout(() => this.group.remove(b.m), 800);
      }
    }
    if (this.drawAt) this.hud();
    if (this.left === 0 && !this.ball?.live) {
      this.left = -1;
      this.c.done("hoops", this.made, this.made, `${this.made} of 10 baskets`);
    }
  }
  stop() {
    this.c.scene.remove(this.group);
    this.c.hud(null);
  }
}

// ------------------------------------------------------------------------------------------------- fishing

const FISH = [
  { name: "Minnow", w: 0.1, rare: 0.45, pts: 1 },
  { name: "Tilapia", w: 0.8, rare: 0.3, pts: 2 },
  { name: "Catfish", w: 2.4, rare: 0.15, pts: 4 },
  { name: "Golden carp", w: 3.5, rare: 0.08, pts: 8 },
  { name: "Old boot", w: 0.5, rare: 0.02, pts: 0 },
];
export class Fishing implements Activity {
  kind = "fishing";
  private state: "idle" | "wait" | "bite" = "idle";
  private at = 0;
  private casts = 5;
  private score = 0;
  private caught: string[] = [];
  private float: THREE.Mesh;
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx) {
    this.float = mesh(sphere(10), toon("#ef4444"), -75, 0.15, -16, 0.25, 0.25, 0.25);
    this.float.visible = false;
    c.scene.add(this.float);
    this.camera = { pos: new THREE.Vector3(-75, 2.4, -9), look: new THREE.Vector3(-75, 0, -18) };
    this.hud("Tap to cast");
  }
  private hud(line: string) {
    this.c.hud({ title: "Fishing", line, score: this.score, left: `${this.casts} casts`, hint: "Esc to stop" });
  }
  down() {
    const now = performance.now();
    if (this.state === "idle" && this.casts > 0) {
      this.casts--;
      this.state = "wait";
      this.at = now + 1800 + Math.random() * 4500;
      this.float.position.set(-75 + (Math.random() - 0.5) * 6, 0.15, -15 - Math.random() * 6);
      this.float.visible = true;
      this.c.sound("splash");
      this.hud("Wait for the float to dip…");
    } else if (this.state === "wait") {
      this.state = "idle";
      this.float.visible = false;
      this.hud("Too soon: it swam off. Tap to cast again");
    } else if (this.state === "bite") {
      let r = Math.random(), f = FISH[0]!;
      for (const x of FISH) if ((r -= x.rare) <= 0) ((f = x), (r = 9));
      this.score += f.pts;
      this.caught.push(f.name);
      this.state = "idle";
      this.float.visible = false;
      this.c.sound(f.pts >= 4 ? "win" : "hit");
      this.hud(`Caught a ${f.name}${f.pts ? ` (${f.w} kg)` : ""}! Tap to cast`);
    }
  }
  update(_dt: number, t: number) {
    const now = performance.now();
    if (this.state === "wait") {
      this.float.position.y = 0.15 + Math.sin(t * 3) * 0.03;
      if (now > this.at) ((this.state = "bite"), (this.at = now + 850), this.hud("PULL!"));
    } else if (this.state === "bite") {
      this.float.position.y = -0.05 + Math.sin(t * 30) * 0.05;
      if (now > this.at) ((this.state = "idle"), (this.float.visible = false), this.hud("It got away. Tap to cast"), this.c.sound("miss"));
    }
    if (this.casts === 0 && this.state === "idle") {
      this.casts = -1;
      this.c.done("fishing", this.score, Math.ceil(this.score / 3), this.caught.length ? `Caught: ${this.caught.join(", ")}` : "No luck this time");
    }
  }
  stop() {
    this.c.scene.remove(this.float);
    this.c.hud(null);
  }
}

// ------------------------------------------------------------------------------------------------- timed runs

// Parkour and race laps: the clock starts at the line; checkpoints in order; the finish stops it.
export class Run implements Activity {
  private start = performance.now();
  private next = 0;
  private marker: THREE.Mesh;
  constructor(
    private c: ActCtx,
    public kind: "parkour" | "race" | "circuit",
    private points: { x: number; y: number; z: number; r: number }[],
    private failBelow?: number,
  ) {
    this.marker = mesh(new THREE.TorusGeometry(kind === "parkour" ? 1.4 : 6, 0.18, 8, 32), toon("#facc15", { emissive: "#a16207" }), 0, 0, 0);
    c.scene.add(this.marker);
    this.place();
  }
  private place() {
    const p = this.points[this.next]!;
    this.marker.position.set(p.x, p.y + (this.kind === "parkour" ? 1.2 : 4), p.z);
  }
  update(_dt: number, t: number) {
    const me = this.c.me();
    this.marker.rotation.y = t;
    const secs = (performance.now() - this.start) / 1000;
    const p = this.points[this.next]!;
    const per = this.kind === "circuit" ? this.points.length / 3 : this.points.length;
    this.c.hud({ title: this.kind === "race" ? "Race lap" : this.kind === "circuit" ? `Seed Circuit · lap ${Math.min(3, Math.floor(this.next / per) + 1)} of 3` : "Parkour run", line: this.kind === "parkour" ? "Reach the flag at the top" : `Checkpoint ${(this.next % per) + 1} of ${per}`, score: Math.round(secs * 10) / 10, left: "", hint: "Esc to give up" });
    if (this.failBelow !== undefined && secs > 2 && me.y < this.failBelow && Math.hypot(me.x - this.points[0]!.x, me.z - this.points[0]!.z) > 4) {
      this.c.done(this.kind, 0, 0, "You fell! Back to the start to try again.");
      return;
    }
    if (Math.hypot(me.x - p.x, me.z - p.z) < p.r && me.y >= p.y - 0.6) {
      this.c.sound("hit");
      this.next++;
      if (this.next >= this.points.length) {
        const s = Math.round(secs * 10) / 10;
        const reward = this.kind === "race" ? Math.max(1, Math.round(150 / s)) : this.kind === "circuit" ? Math.max(1, Math.round(240 / s)) : Math.max(1, Math.round(60 / s));
        this.c.done(this.kind, Math.round(s * 10), reward, `${s} seconds`);
        return;
      }
      this.place();
    }
  }
  stop() {
    this.c.scene.remove(this.marker);
    this.c.hud(null);
  }
}

// Tips from the library's books.
export const TIPS = [
  "Write tomorrow's top three tasks before you leave today.",
  "A two-minute task done now saves a ten-minute reminder later.",
  "When stuck, explain the problem out loud to a colleague (or a pet).",
  "Clear names in files save everyone a search.",
  "Celebrate small wins: they add up to big ones.",
  "Take a short walk after lunch: the afternoon gets easier.",
  "Ask 'what does done look like?' before starting a task.",
  "Batch your messages: answer them at set times, not all day.",
];
