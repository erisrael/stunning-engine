import * as THREE from "three";
import type { ActCtx, Activity } from "./activities";
import { plain, surface } from "./pbr";
import { signPlane } from "./toon";

// Archery on its own field (south-west, past the ring road): a shooting line, lanes with straw bosses and real
// 10-ring target faces (X in the middle), wind flags. First person with the bow in your hands: move to aim, hold to
// draw (the string comes back, the aim sways more the longer you hold at full draw), let go to shoot. The arrow
// flies with gravity, air drag and the wind; it sticks where it hits; the score is the ring. Modes: classic, distance
// (30/50/70 m), moving targets, timed, precision (small faces), wind, a tournament against three AI archers (sets),
// progressive levels, and practice. Three bows: training, recurve and compound (with a sight).

export type ArcheryMode = "classic" | "distance" | "moving" | "timed" | "precision" | "wind" | "tournament" | "progressive" | "practice";
export const ARCHERY_MODES: { key: ArcheryMode; label: string; note: string }[] = [
  { key: "classic", label: "Classic", note: "Two ends of six arrows at 18 m." },
  { key: "distance", label: "Distance", note: "Six arrows each at 30, 50 and 70 m." },
  { key: "moving", label: "Moving targets", note: "Faces slide side to side; lead your shot." },
  { key: "timed", label: "Timed", note: "60 seconds, as many points as you can." },
  { key: "precision", label: "Precision", note: "Small 40 cm faces; only 8 and above count." },
  { key: "wind", label: "Wind challenge", note: "Strong, gusty crosswind; read the flags." },
  { key: "tournament", label: "Tournament", note: "You against three AI archers: sets of three arrows, two set points a win." },
  { key: "progressive", label: "Progressive", note: "Ten levels: farther, windier, moving. Score 40 to unlock the next." },
  { key: "practice", label: "Practice", note: "Endless arrows; try the bows." },
];
export type Bow = "training" | "recurve" | "compound";
export const BOWS: Record<Bow, { label: string; speed: number; draw: number; sway: number; sight: boolean; unlock: number }> = {
  training: { label: "Training bow", speed: 42, draw: 0.6, sway: 1.6, sight: false, unlock: 0 },
  recurve: { label: "Olympic recurve", speed: 58, draw: 0.9, sway: 1.0, sight: false, unlock: 3 },
  compound: { label: "Compound bow", speed: 82, draw: 1.1, sway: 0.55, sight: true, unlock: 6 },
};

export const FIELD = { x: -230, z: 0 }; // shooting line centre; targets west of it
const LINE_X = FIELD.x;

type Target = { g: THREE.Group; base: THREE.Vector3; r: number; dist: number; move: number; phase: number; lane: number };
type Arrow = { m: THREE.Group; v: THREE.Vector3; flying: boolean; owner: number };

const UNLOCK_KEY = "town.archery.level";

export class ArcheryField implements Activity {
  readonly kind = "archery";
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  private group = new THREE.Group();
  private view = new THREE.Group();
  private bowString: THREE.Line;
  private nocked: THREE.Group;
  private targets: Target[] = [];
  private arrows: Arrow[] = [];
  private aim = new THREE.Vector2();
  private drawStart = 0;
  private draw = 0;
  private wind = new THREE.Vector3();
  private windBase = 0;
  private gust = 0;
  private flags: THREE.Mesh[] = [];
  private score = 0;
  private shots = 0;
  private hits = 0;
  private xs = 0;
  private left = 0;
  private endScores: number[] = [];
  private endNow = 0;
  private stage = 0;
  private stages: { dist: number; arrows: number; r: number; move: number; wind: number }[] = [];
  private endsAt = 0;
  private bots: { name: string; skill: number; set: number; sets: number; arrows: number[] }[] = [];
  private mySets = 0;
  private myEnd: number[] = [];
  private message = "";
  private finished = false;
  constructor(
    private c: ActCtx,
    private mode: ArcheryMode,
    private bow: Bow,
    private level = 1,
  ) {
    c.scene.add(this.group);
    this.buildField();
    // Stages by mode.
    const L = Math.max(1, Math.min(10, level));
    this.stages =
      mode === "distance" ? [30, 50, 70].map((d) => ({ dist: d, arrows: 6, r: 0.61, move: 0, wind: 1.5 }))
      : mode === "moving" ? [{ dist: 25, arrows: 10, r: 0.61, move: 1.2, wind: 1 }]
      : mode === "precision" ? [{ dist: 18, arrows: 10, r: 0.2, move: 0, wind: 0.5 }]
      : mode === "wind" ? [{ dist: 30, arrows: 10, r: 0.61, move: 0, wind: 7 }]
      : mode === "timed" ? [{ dist: 18, arrows: 99, r: 0.61, move: 0, wind: 1 }]
      : mode === "tournament" ? [{ dist: 30, arrows: 3, r: 0.61, move: 0, wind: 2 }]
      : mode === "progressive" ? [{ dist: 15 + L * 5, arrows: 6, r: 0.61, move: L >= 6 ? 0.4 + (L - 6) * 0.25 : 0, wind: L * 0.6 }]
      : mode === "practice" ? [{ dist: 18, arrows: 999, r: 0.61, move: 0, wind: 1 }]
      : [{ dist: 18, arrows: 6, r: 0.61, move: 0, wind: 1 }, { dist: 18, arrows: 6, r: 0.61, move: 0, wind: 1 }];
    if (mode === "tournament") this.bots = [{ name: "Tigist", skill: 0.85 }, { name: "Mesfin", skill: 0.7 }, { name: "Hanna", skill: 0.55 }].map((b) => ({ ...b, set: 0, sets: 0, arrows: [] }));
    if (mode === "timed") this.endsAt = performance.now() + 60_000;
    this.startStage();
    this.camera = { pos: new THREE.Vector3(LINE_X - 0.3, 1.62, FIELD.z), look: new THREE.Vector3(LINE_X - 30, 1.5, FIELD.z) };
    // The bow in my hands (a view model that follows the camera).
    const riser = plain("#2a2d31", { rough: 0.35, metal: 0.6 });
    const limb = plain("#141518", { rough: 0.4 });
    const bowG = new THREE.Group();
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.05), riser);
    bowG.add(grip);
    for (const s of [1, -1]) {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, s * 0.1, 0), new THREE.Vector3(0, s * 0.42, 0.12), new THREE.Vector3(0, s * 0.62, -0.04));
      const l = new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.012, 6), limb);
      bowG.add(l);
    }
    if (BOWS[bow].sight) {
      const sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.12), plain("#d9d9d9", { metal: 1, rough: 0.2 }));
      sight.position.set(0.03, 0.08, 0.06);
      bowG.add(sight);
      const pin = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshBasicMaterial({ color: "#22c55e" }));
      pin.position.set(0.03, 0.08, 0.12);
      bowG.add(pin);
    }
    const sg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.62, -0.04), new THREE.Vector3(0, 0, -0.04), new THREE.Vector3(0, -0.62, -0.04)]);
    this.bowString = new THREE.Line(sg, new THREE.LineBasicMaterial({ color: "#e5e7eb" }));
    bowG.add(this.bowString);
    this.nocked = this.arrowMesh();
    bowG.add(this.nocked);
    // A gloved hand on the grip.
    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.08), plain("#3b2a1e", { rough: 0.8 }));
    glove.position.set(0.01, -0.02, 0.01);
    bowG.add(glove);
    bowG.rotation.z = -0.15;
    this.view.add(bowG);
    this.c.scene.add(this.view);
    this.hud();
  }

  private arrowMesh() {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.75, 6), plain("#c9a36a", { rough: 0.6 }));
    shaft.rotation.x = Math.PI / 2;
    shaft.position.z = 0.375;
    g.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.007, 0.03, 6), plain("#9aa0a6", { metal: 1, rough: 0.3 }));
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.765;
    g.add(tip);
    for (let k = 0; k < 3; k++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.07), plain(k ? "#f97316" : "#f8fafc", { rough: 0.8, side: THREE.DoubleSide }));
      f.position.set(Math.cos((k * Math.PI * 2) / 3) * 0.01, Math.sin((k * Math.PI * 2) / 3) * 0.01, 0.06);
      f.rotation.z = (k * Math.PI * 2) / 3;
      f.rotation.y = Math.PI / 2;
      g.add(f);
    }
    return g;
  }

  private buildField() {
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(110, 50), surface("grass", { tint: "#b6d39a" }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.set(LINE_X - 45, 0.012, FIELD.z);
    grass.receiveShadow = true;
    this.group.add(grass);
    const lineM = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 16), plain("#f8fafc", { rough: 0.7 }));
    lineM.rotation.x = -Math.PI / 2;
    lineM.position.set(LINE_X - 0.6, 0.02, FIELD.z);
    this.group.add(lineM);
    // Shelter over the line, a bow rack and a scoreboard.
    const wood = surface("planks", { tint: "#ffffff" });
    for (const z of [-7, 7]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 3, 0.2), wood);
      post.position.set(LINE_X + 1.5, 1.5, FIELD.z + z);
      this.group.add(post);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4, 0.15, 15), plain("#5a4632", { rough: 0.8 }));
    roof.position.set(LINE_X + 1, 3, FIELD.z);
    roof.castShadow = true;
    this.group.add(roof);
    const board = signPlane("Seed Archery Field", 5, 0.8, "#14532d");
    board.position.set(LINE_X + 2.9, 2.6, FIELD.z);
    board.rotation.y = -Math.PI / 2;
    this.group.add(board);
    // Wind flags at 10 m steps along the range.
    for (let d = 10; d <= 70; d += 15)
      for (const z of [-9, 9]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4, 6), plain("#d1d5db", { metal: 0.6, rough: 0.4 }));
        pole.position.set(LINE_X - d, 2, FIELD.z + z);
        this.group.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), plain("#facc15", { rough: 0.8, side: THREE.DoubleSide }));
        flag.position.set(LINE_X - d, 3.6, FIELD.z + z + 0.45);
        this.group.add(flag);
        this.flags.push(flag);
      }
    // Distance markers.
    for (const d of [18, 30, 50, 70]) {
      const s = signPlane(`${d} m`, 1.4, 0.5, "#1f2937");
      s.position.set(LINE_X - d, 0.4, FIELD.z - 10.5);
      s.rotation.y = Math.PI / 2;
      this.group.add(s);
    }
  }

  // A target face: ten rings (white, black, blue, red, gold), the X, on a straw boss with legs.
  private face(r: number) {
    const g = new THREE.Group();
    const cols = ["#f7f7f5", "#f7f7f5", "#1a1a1a", "#1a1a1a", "#1d6fd1", "#1d6fd1", "#d0281f", "#d0281f", "#f4c430", "#f4c430"];
    for (let k = 0; k < 10; k++) {
      const ring = new THREE.Mesh(new THREE.CircleGeometry(r * (1 - k / 10), 48), new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.8 }));
      ring.position.z = 0.002 * k;
      g.add(ring);
      if (k > 0) {
        const line = new THREE.Mesh(new THREE.RingGeometry(r * (1 - k / 10) - 0.002, r * (1 - k / 10), 48), new THREE.MeshBasicMaterial({ color: k === 3 ? "#f7f7f5" : "#333" }));
        line.position.z = 0.002 * k + 0.001;
        g.add(line);
      }
    }
    const x = new THREE.Mesh(new THREE.RingGeometry(r * 0.048, r * 0.05, 24), new THREE.MeshBasicMaterial({ color: "#333" }));
    x.position.z = 0.025;
    g.add(x);
    const boss = new THREE.Mesh(new THREE.BoxGeometry(Math.max(1.3, r * 2.3), Math.max(1.3, r * 2.3), 0.35), plain("#c8b07a", { rough: 1 }));
    boss.position.z = -0.18;
    g.add(boss);
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.9, 0.08), plain("#6b4f36", { rough: 0.8 }));
      leg.position.set(s * 0.55, -0.95, -0.5);
      leg.rotation.x = -0.25;
      g.add(leg);
    }
    return g;
  }

  private startStage() {
    for (const t of this.targets) this.group.remove(t.g);
    for (const a of this.arrows) this.group.remove(a.m);
    this.targets = [];
    this.arrows = [];
    const s = this.stages[this.stage]!;
    const lanes = this.mode === "tournament" ? 4 : this.mode === "moving" ? 3 : 1;
    for (let lane = 0; lane < lanes; lane++) {
      const g = this.face(s.r);
      const z = FIELD.z + (lane - (lanes - 1) / 2) * 4;
      const base = new THREE.Vector3(LINE_X - s.dist, 1.3, z);
      g.position.copy(base);
      g.rotation.y = Math.PI / 2;
      this.group.add(g);
      this.targets.push({ g, base, r: s.r, dist: s.dist, move: s.move, phase: lane * 1.7, lane });
    }
    this.left = s.arrows;
    this.endNow = 0;
    this.windBase = (Math.random() - 0.5) * 2 * s.wind;
    this.myEnd = [];
  }

  private hud() {
    const s = this.stages[this.stage]!;
    const wind = this.wind.z;
    const windTxt = `${Math.abs(wind).toFixed(1)} m/s ${wind > 0.1 ? "from the left" : wind < -0.1 ? "from the right" : "calm"}`;
    const timeLeft = this.endsAt ? Math.max(0, Math.ceil((this.endsAt - performance.now()) / 1000)) : null;
    const tour = this.bots.length ? ` · sets: you ${this.mySets}, ${this.bots.map((b) => `${b.name} ${b.sets}`).join(", ")}` : "";
    this.c.hud({
      title: `${ARCHERY_MODES.find((m) => m.key === this.mode)!.label} · ${BOWS[this.bow].label}${this.mode === "progressive" ? ` · level ${this.level}` : ""}`,
      line: this.message || `${s.dist} m · wind ${windTxt}${this.draw ? ` · draw ${Math.round(this.draw * 100)}%` : ""}${tour}`,
      score: this.score,
      left: timeLeft !== null ? `${timeLeft}s` : this.left > 900 ? "practice" : `${this.left} arrows`,
      hint: `Move to aim, hold to draw, let go to shoot · accuracy ${this.shots ? Math.round((this.hits / this.shots) * 100) : 0}%${this.xs ? ` · ${this.xs} X` : ""} · Esc to stop`,
    });
  }

  move(ndc: THREE.Vector2) {
    this.aim.copy(ndc);
  }
  down() {
    if (this.finished || this.left <= 0) return;
    this.drawStart = performance.now();
  }
  up() {
    if (!this.drawStart || this.finished || this.left <= 0) return;
    const draw = this.draw;
    this.drawStart = 0;
    this.draw = 0;
    if (draw < 0.15) return;
    this.shoot(draw);
  }

  // Where I am aiming (with sway), as a direction from the eye.
  private aimDir(t: number) {
    const hold = this.drawStart ? (performance.now() - this.drawStart) / 1000 : 0;
    const B = BOWS[this.bow];
    const tired = Math.max(0, hold - B.draw - 2) * 0.004;
    const sway = (0.0025 + tired) * B.sway;
    const yaw = -this.aim.x * 0.42 + Math.sin(t * 1.3) * sway + Math.sin(t * 3.1) * sway * 0.5;
    const pitch = this.aim.y * 0.25 + Math.cos(t * 1.1) * sway * 0.8 + 0.01;
    return new THREE.Vector3(-Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw)).normalize();
  }

  private shoot(draw: number) {
    const B = BOWS[this.bow];
    const eye = this.camera.pos;
    const dir = this.aimDir(performance.now() / 1000);
    const m = this.arrowMesh();
    m.position.copy(eye).addScaledVector(dir, 0.6).add(new THREE.Vector3(0, -0.05, 0));
    m.lookAt(m.position.clone().add(dir));
    this.group.add(m);
    this.arrows.push({ m, v: dir.multiplyScalar(B.speed * (0.45 + draw * 0.55)), flying: true, owner: 0 });
    this.left--;
    this.shots++;
    this.c.sound("shoot");
  }

  // The score of a point on a face (10 rings; X in the middle ring).
  private ring(t: Target, hit: THREE.Vector3) {
    const d = Math.hypot(hit.y - t.g.position.y, hit.z - t.g.position.z);
    if (d > t.r) return { pts: 0, x: false };
    const pts = 10 - Math.floor((d / t.r) * 10);
    return { pts: this.mode === "precision" && pts < 8 ? 0 : pts, x: d < t.r * 0.05 };
  }

  update(dt: number, t: number) {
    const s = this.stages[this.stage]!;
    // Wind: the base for this end plus gusts; flags show it.
    this.gust += (Math.random() - 0.5) * dt * s.wind * 0.8;
    this.gust *= 1 - dt * 0.3;
    this.wind.set(0, 0, this.windBase + this.gust);
    for (const f of this.flags) (f.rotation.y = Math.atan2(this.wind.z, 0.3) * 0.9), (f.scale.x = 0.5 + Math.min(1, Math.abs(this.wind.z) / 5) * 0.6);
    // Moving targets.
    for (const tg of this.targets) if (tg.move) tg.g.position.z = tg.base.z + Math.sin(t * tg.move + tg.phase) * 2.6;
    // Drawing.
    if (this.drawStart) this.draw = Math.min(1, (performance.now() - this.drawStart) / 1000 / BOWS[this.bow].draw);
    // The view model: in front of the camera, aimed where I aim; the string and arrow come back as I draw.
    const dir = this.aimDir(t);
    const cam = this.camera;
    const look = cam.pos.clone().add(dir);
    cam.look.copy(look);
    this.view.position.copy(cam.pos).addScaledVector(dir, 0.55).add(new THREE.Vector3(0, -0.12, 0)).add(new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(0.12));
    this.view.lookAt(this.view.position.clone().add(dir));
    const pull = this.draw * 0.55;
    const p = this.bowString.geometry.getAttribute("position") as THREE.BufferAttribute;
    p.setXYZ(1, 0, 0, -0.04 - pull);
    p.needsUpdate = true;
    this.nocked.position.set(0, 0, -0.04 - pull);
    this.nocked.visible = this.left > 0 && !this.finished;
    // Arrows: gravity, drag, wind; they stick in the face, the boss or the ground.
    for (const a of this.arrows) {
      if (!a.flying) continue;
      const prev = a.m.position.clone();
      const v = a.v;
      const sp = v.length();
      v.y -= 9.81 * dt;
      v.addScaledVector(v, -0.0006 * sp * dt);
      v.addScaledVector(this.wind.clone().sub(new THREE.Vector3(0, 0, v.z * 0.02)), 0.045 * dt);
      a.m.position.addScaledVector(v, dt);
      a.m.lookAt(a.m.position.clone().add(v));
      for (const tg of this.targets) {
        const px = tg.g.position.x;
        if (prev.x > px && a.m.position.x <= px) {
          const k = (prev.x - px) / (prev.x - a.m.position.x);
          const hit = new THREE.Vector3().lerpVectors(prev, a.m.position, k);
          const boss = Math.max(0.65, tg.r * 1.15);
          if (Math.abs(hit.y - tg.g.position.y) < boss && Math.abs(hit.z - tg.g.position.z) < boss) {
            a.flying = false;
            a.m.position.copy(hit).add(new THREE.Vector3(0.25, 0, 0));
            tg.g.attach(a.m);
            if (a.owner === 0 && tg.lane === (this.targets.length > 1 && this.mode === "tournament" ? 0 : tg.lane)) {
              const r = this.ring(tg, hit);
              this.score += r.pts;
              this.endNow += r.pts;
              this.myEnd.push(r.pts);
              if (r.pts) this.hits++;
              if (r.x) this.xs++;
              this.message = r.pts ? `${r.x ? "X! " : ""}${r.pts}` : "Miss";
              this.c.sound(r.pts >= 9 ? "win" : r.pts ? "hit" : "miss");
            }
          }
        }
      }
      if (a.flying && (a.m.position.y < 0.05 || a.m.position.x < LINE_X - 95)) {
        a.flying = false;
        if (a.owner === 0) (this.message = "Miss"), this.myEnd.push(0), this.c.sound("miss");
      }
    }
    // End of an end / stage / the round.
    const flying = this.arrows.some((a) => a.flying);
    const timeUp = this.endsAt && performance.now() > this.endsAt;
    if (!this.finished && !flying && (this.left <= 0 || timeUp)) {
      if (this.mode === "tournament") this.setEnd();
      this.endScores.push(this.endNow);
      if (this.stage + 1 < this.stages.length && !timeUp && !(this.mode === "tournament" && this.tournamentOver())) {
        this.stage++;
        this.startStage();
      } else if (this.mode === "tournament" && !this.tournamentOver()) this.startStage();
      else this.finish();
    }
    this.hud();
  }

  // A set in the tournament: everyone's three arrows; the best end wins two set points (a draw one each).
  private setEnd() {
    const mine = this.myEnd.reduce((a, b) => a + b, 0);
    const ends = this.bots.map((b) => {
      let sum = 0;
      for (let k = 0; k < 3; k++) {
        const spread = (1 - b.skill) * 0.55 + Math.abs(this.wind.z) * 0.02;
        const d = Math.abs(gauss() * spread);
        sum += d > 0.61 ? 0 : 10 - Math.floor((d / 0.61) * 10);
      }
      return sum;
    });
    const best = Math.max(mine, ...ends);
    const winners = [mine, ...ends].filter((x) => x === best).length;
    const pts = winners > 1 ? 1 : 2;
    if (mine === best) this.mySets += pts;
    this.bots.forEach((b, k) => ends[k] === best && (b.sets += pts));
    this.message = `Set: you ${mine}, ${this.bots.map((b, k) => `${b.name} ${ends[k]}`).join(", ")}`;
  }
  private tournamentOver() {
    return this.mySets >= 6 || this.bots.some((b) => b.sets >= 6) || this.endScores.length >= 5;
  }

  private finish() {
    this.finished = true;
    const acc = this.shots ? Math.round((this.hits / this.shots) * 100) : 0;
    let text = `${this.score} points · ${acc}% hits${this.xs ? ` · ${this.xs} X` : ""}`;
    if (this.mode === "tournament") {
      const won = this.mySets >= Math.max(...this.bots.map((b) => b.sets));
      text = `${won ? "You won the tournament" : "Tournament over"}: sets ${this.mySets} to ${Math.max(...this.bots.map((b) => b.sets))}. ${text}`;
    }
    if (this.mode === "progressive") {
      const unlocked = this.score >= 40 && this.level < 10;
      if (unlocked) {
        try {
          localStorage.setItem(UNLOCK_KEY, String(Math.max(Number(localStorage.getItem(UNLOCK_KEY) || 1), this.level + 1)));
        } catch {}
        text += ` · level ${this.level + 1} unlocked`;
      }
    }
    this.c.done(this.mode === "classic" ? "archery" : `archery-${this.mode}`, this.score, Math.round(this.score / 10), text);
  }

  stop() {
    this.c.scene.remove(this.group);
    this.c.scene.remove(this.view);
    this.c.hud(null);
  }
}

export function archeryLevel() {
  try {
    return Math.max(1, Math.min(10, Number(localStorage.getItem(UNLOCK_KEY) || 1)));
  } catch {
    return 1;
  }
}

function gauss() {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
