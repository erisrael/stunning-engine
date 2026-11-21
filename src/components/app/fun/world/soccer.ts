import * as THREE from "three";
import type RAPIER_NS from "@dimforge/rapier3d-compat";
import type { ActCtx, Activity } from "./activities";
import { mesh, sphere, toon, unitBox } from "./toon";

// Football on the stadium pitch with a real physics engine (Rapier, loaded only near the stadium): the ball rolls,
// bounces off the boards and posts, spins and can be lifted; players' bodies push it; goals count. In a kick-about
// the last person to kick the ball shares where it is so everyone sees the same ball. A penalty challenge puts you
// against a goalkeeper who dives.

type R = typeof RAPIER_NS;
export const PITCH = { x0: 160, x1: 210, z0: 44, z1: 76, cz: 60, goalW: 7, goalH: 2.4, depth: 2 };
export const BALL_R = 0.22;

export type BallState = { x: number; y: number; z: number; vx: number; vy: number; vz: number };

export class Soccer {
  private world: RAPIER_NS.World;
  private ball: RAPIER_NS.RigidBody;
  readonly ballMesh: THREE.Mesh;
  private players = new Map<string, RAPIER_NS.RigidBody>();
  keeper: RAPIER_NS.RigidBody | null = null;
  keeperMesh: THREE.Mesh | null = null;
  private lastGoal = 0;
  onGoal: ((team: "teal" | "gold") => void) | null = null;
  private constructor(private R: R, private scene: THREE.Scene) {
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    const fixed = (x: number, y: number, z: number, hx: number, hy: number, hz: number, bounce = 0.5) => {
      const b = this.world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(x, y, z));
      this.world.createCollider(R.ColliderDesc.cuboid(hx, hy, hz).setRestitution(bounce).setFriction(0.8), b);
    };
    const { x0, x1, z0, z1, cz, goalW, goalH, depth } = PITCH;
    // The ground, the boards around the pitch (open at the goals), the goals (posts, bar and net).
    fixed((x0 + x1) / 2, -0.5, (z0 + z1) / 2, 60, 0.5, 40, 0.3);
    fixed((x0 + x1) / 2, 0.5, z0 - 0.1, (x1 - x0) / 2 + 0.2, 0.5, 0.1);
    fixed((x0 + x1) / 2, 0.5, z1 + 0.1, (x1 - x0) / 2 + 0.2, 0.5, 0.1);
    for (const x of [x0, x1]) {
      const side = x === x0 ? -1 : 1;
      fixed(x + side * 0.1, 0.5, (z0 + cz - goalW / 2) / 2, 0.1, 0.5, (cz - goalW / 2 - z0) / 2);
      fixed(x + side * 0.1, 0.5, (z1 + cz + goalW / 2) / 2, 0.1, 0.5, (z1 - cz - goalW / 2) / 2);
      for (const z of [cz - goalW / 2, cz + goalW / 2]) fixed(x, goalH / 2, z, 0.06, goalH / 2, 0.06, 0.7);
      fixed(x, goalH, cz, 0.06, 0.06, goalW / 2, 0.7);
      fixed(x + side * depth, goalH / 2, cz, 0.05, goalH / 2, goalW / 2, 0.1);
      for (const z of [cz - goalW / 2, cz + goalW / 2]) fixed(x + (side * depth) / 2, goalH / 2, z, depth / 2, goalH / 2, 0.05, 0.1);
      fixed(x + (side * depth) / 2, goalH + 0.05, cz, depth / 2, 0.05, goalW / 2, 0.1);
    }
    const bd = R.RigidBodyDesc.dynamic().setTranslation((x0 + x1) / 2, 1, cz).setLinearDamping(0.35).setAngularDamping(0.6).setCcdEnabled(true);
    this.ball = this.world.createRigidBody(bd);
    this.world.createCollider(R.ColliderDesc.ball(BALL_R).setRestitution(0.65).setFriction(0.7).setMass(0.45), this.ball);
    // A football: white with dark patches.
    const tex = document.createElement("canvas");
    tex.width = 128;
    tex.height = 64;
    const g = tex.getContext("2d")!;
    g.fillStyle = "#f8fafc";
    g.fillRect(0, 0, 128, 64);
    g.fillStyle = "#111827";
    for (let i = 0; i < 10; i++) {
      g.beginPath();
      const cx = (i * 29) % 128, cy = 12 + ((i * 17) % 44);
      for (let k = 0; k < 5; k++) g.lineTo(cx + Math.cos((k * 2 * Math.PI) / 5) * 7, cy + Math.sin((k * 2 * Math.PI) / 5) * 7);
      g.fill();
    }
    const t = new THREE.CanvasTexture(tex);
    t.colorSpace = THREE.SRGBColorSpace;
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshToonMaterial({ map: t }));
    this.ballMesh.castShadow = true;
    scene.add(this.ballMesh);
  }

  static async create(scene: THREE.Scene) {
    const R = (await import("@dimforge/rapier3d-compat")).default;
    await R.init();
    return new Soccer(R, scene);
  }

  // A player's body (pushes the ball), kept where the person stands.
  setPlayer(id: string, x: number, y: number, z: number) {
    let b = this.players.get(id);
    if (!b) {
      b = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(x, y + 0.9, z));
      this.world.createCollider(this.R.ColliderDesc.capsule(0.55, 0.32).setRestitution(0.3), b);
      this.players.set(id, b);
    }
    b.setNextKinematicTranslation({ x, y: y + 0.9, z });
  }
  dropPlayer(id: string) {
    const b = this.players.get(id);
    if (b) this.world.removeRigidBody(b);
    this.players.delete(id);
  }

  get pos() {
    const t = this.ball.translation();
    return new THREE.Vector3(t.x, t.y, t.z);
  }
  state(): BallState {
    const t = this.ball.translation(), v = this.ball.linvel();
    const r = (n: number) => Math.round(n * 100) / 100;
    return { x: r(t.x), y: r(t.y), z: r(t.z), vx: r(v.x), vy: r(v.y), vz: r(v.z) };
  }
  setState(s: BallState) {
    this.ball.setTranslation({ x: s.x, y: Math.max(BALL_R, s.y), z: s.z }, true);
    this.ball.setLinvel({ x: s.vx, y: s.vy, z: s.vz }, true);
  }
  reset() {
    this.setState({ x: (PITCH.x0 + PITCH.x1) / 2, y: 1, z: PITCH.cz, vx: 0, vy: 0, vz: 0 });
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
  }

  // Kick from where I stand, the way I face: power in m/s, lift upwards, curl for spin. Only when close enough.
  kick(x: number, z: number, heading: number, power: number, lift = 0.15, curl = 0) {
    const p = this.pos;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d > 1.7 || p.y > 1.4) return false;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.ball.setLinvel({ x: fx * power, y: power * lift + 0.5, z: fz * power }, true);
    this.ball.setAngvel({ x: 0, y: curl * 8, z: 0 }, true);
    return true;
  }

  step(dt: number) {
    this.world.timestep = Math.min(1 / 30, Math.max(1 / 240, dt));
    // A curling ball bends (the Magnus effect, simply).
    const v = this.ball.linvel(), w = this.ball.angvel();
    const kM = 0.0006 * this.world.timestep * 60;
    if (Math.abs(w.y) > 0.5) this.ball.applyImpulse({ x: -w.y * v.z * kM, y: 0, z: w.y * v.x * kM }, true);
    // The wall jumps when the kick is taken, and lands.
    if (this.wall.length) {
      const up = Math.max(0, 1 - Math.abs(performance.now() - this.jumpAt - 250) / 250) * 0.4;
      this.wall.forEach((b, i) => {
        const p = this.wallAt[i]!;
        b.setNextKinematicTranslation({ x: p.x, y: 0.9 + up, z: p.z });
        this.wallMeshes[i]!.position.set(p.x, up, p.z);
      });
    }
    this.world.step();
    const t = this.ball.translation(), q = this.ball.rotation();
    this.ballMesh.position.set(t.x, t.y, t.z);
    this.ballMesh.quaternion.set(q.x, q.y, q.z, q.w);
    if (this.keeper && this.keeperMesh) {
      const k = this.keeper.translation();
      this.keeperMesh.position.set(k.x, k.y, k.z);
    }
    // Goals: the whole ball past the line, between the posts and under the bar.
    const now = performance.now();
    if (now - this.lastGoal > 2500 && Math.abs(t.z - PITCH.cz) < PITCH.goalW / 2 && t.y < PITCH.goalH) {
      if (t.x < PITCH.x0 - BALL_R) (this.lastGoal = now), this.onGoal?.("teal");
      else if (t.x > PITCH.x1 + BALL_R) (this.lastGoal = now), this.onGoal?.("gold");
    }
    // A ball that left the stadium comes back to the centre.
    if (t.y < -2 || Math.abs(t.x - (PITCH.x0 + PITCH.x1) / 2) > 45 || Math.abs(t.z - PITCH.cz) > 35) this.reset();
  }

  // Spin about the vertical (curl): set, or add to it (aftertouch).
  setSpin(wy: number) {
    this.ball.setAngvel({ x: 0, y: wy, z: 0 }, true);
  }
  addSpin(dwy: number) {
    const w = this.ball.angvel();
    this.ball.setAngvel({ x: w.x, y: Math.max(-14, Math.min(14, w.y + dwy)), z: w.z }, true);
  }
  // A free-kick wall: players (bodies the ball bounces off) at these spots, facing the ball.
  private wall: RAPIER_NS.RigidBody[] = [];
  private wallAt: { x: number; z: number }[] = [];
  private wallMeshes: THREE.Object3D[] = [];
  private jumpAt = -1e9;
  setWall(pts: { x: number; z: number }[], scene: THREE.Scene) {
    for (const b of this.wall) this.world.removeRigidBody(b);
    for (const m of this.wallMeshes) scene.remove(m);
    this.wall = [];
    this.wallMeshes = [];
    this.wallAt = pts;
    for (const p of pts) {
      const b = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, 0.9, p.z));
      this.world.createCollider(this.R.ColliderDesc.cuboid(0.22, 0.9, 0.28).setRestitution(0.35), b);
      this.wall.push(b);
      const g = new THREE.Group();
      g.add(mesh(unitBox(), toon("#1d4ed8"), 0, 1.15, 0, 0.42, 0.7, 0.5));
      g.add(mesh(unitBox(), toon("#f8fafc"), 0, 0.62, 0, 0.4, 0.36, 0.48));
      for (const z of [-0.12, 0.12]) g.add(mesh(unitBox(), toon("#e2b48c"), 0, 0.22, z, 0.14, 0.44, 0.14));
      g.add(mesh(sphere(12), toon("#8d5a3b"), 0, 1.68, 0, 0.3, 0.32, 0.3));
      g.position.set(p.x, 0, p.z);
      scene.add(g);
      this.wallMeshes.push(g);
    }
  }
  jumpWall() {
    this.jumpAt = performance.now() + 60;
  }

  // The goalkeeper (penalty challenge): a body that slides and dives along the goal line.
  addKeeper(scene: THREE.Scene) {
    if (this.keeper) return;
    this.keeper = this.world.createRigidBody(this.R.RigidBodyDesc.kinematicPositionBased().setTranslation(PITCH.x0 + 0.4, 0.95, PITCH.cz));
    this.world.createCollider(this.R.ColliderDesc.cuboid(0.25, 0.95, 0.45).setRestitution(0.4), this.keeper);
    this.keeperMesh = mesh(unitBox(), toon("#f97316"), PITCH.x0 + 0.4, 0.95, PITCH.cz, 0.5, 1.9, 0.9);
    const head = mesh(sphere(12), toon("#f2c9a0"), 0, 0.62, 0, 0.7, 0.28, 0.5);
    this.keeperMesh.add(head);
    scene.add(this.keeperMesh);
  }
  moveKeeper(z: number, y = 0.95) {
    this.keeper?.setNextKinematicTranslation({ x: PITCH.x0 + 0.4, y, z });
  }
  removeKeeper() {
    if (this.keeper) this.world.removeRigidBody(this.keeper);
    this.keeper = null;
    if (this.keeperMesh) this.scene.remove(this.keeperMesh);
    this.keeperMesh = null;
  }

  dispose() {
    this.scene.remove(this.ballMesh);
    this.removeKeeper();
    this.ballMesh.geometry.dispose();
    this.world.free();
  }
}

// ------------------------------------------------------------------------------------------------- shooting
// The shot, as in the big football games: aim at a point in the goal mouth (the mouse), hold for power (past 85 %
// the shot gets wild), Shift for a finesse shot (placed, with curl), Ctrl for a chip; after the kick, moving the
// mouse sideways bends the ball (aftertouch). The ball flies with air drag and the Magnus effect, so the numbers
// below solve for the kick that would reach the aim point without spin.

const G = 9.81;
const K = 0.35; // the ball's linear damping (air drag), the same as its body's
function solveKick(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }, speed: number) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const D = Math.hypot(dx, dz);
  const s = Math.max(speed, D * K * 1.3);
  const T = -Math.log(1 - (D * K) / s) / K;
  const e = 1 - Math.exp(-K * T);
  const vy = ((to.y - from.y + (G * T) / K) * K) / e - G / K;
  return { vx: (dx / D) * s, vy, vz: (dz / D) * s, T };
}

type ShotKeys = { finesse: boolean; chip: boolean };
function shotKeys(): [ShotKeys, () => void] {
  const k: ShotKeys = { finesse: false, chip: false };
  const on = (e: KeyboardEvent) => {
    if (e.key === "Shift") k.finesse = e.type === "keydown";
    if (e.key === "Control") k.chip = e.type === "keydown";
  };
  window.addEventListener("keydown", on);
  window.addEventListener("keyup", on);
  return [k, () => (window.removeEventListener("keydown", on), window.removeEventListener("keyup", on))];
}

// A ring that shows where the shot is aimed (white) or the target to hit (gold), standing in the goal mouth.
function ring(color: string, r: number) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.05, 8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false }));
  m.rotation.y = Math.PI / 2;
  m.renderOrder = 5;
  return m;
}

// Penalties: five shots from the spot against a keeper who guesses (more often right at higher levels) and dives
// low or high; a chip down the middle beats a keeper who has already gone.
export class Penalty implements Activity {
  kind = "penalty";
  private left = 5;
  private goals = 0;
  private drawAt = 0;
  private aimZ = 0;
  private aimY = 0.35;
  private shotAt = 0;
  private lastX = 0;
  private dive = 0;
  private diveY = 0.95;
  private result = "";
  private keeperZ: number = PITCH.cz;
  private keys: ShotKeys;
  private unkey: () => void;
  private aim = ring("#ffffff", 0.22);
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx, private s: Soccer, private level: number) {
    s.addKeeper(c.scene);
    [this.keys, this.unkey] = shotKeys();
    s.onGoal = () => {
      if (this.shotAt && !this.result) (this.goals++, (this.result = "GOAL!"), c.sound("win"));
    };
    this.camera = { pos: new THREE.Vector3(PITCH.x0 + 15, 2.2, PITCH.cz), look: new THREE.Vector3(PITCH.x0, 1.2, PITCH.cz) };
    c.scene.add(this.aim);
    this.place();
  }
  private target() {
    return { x: PITCH.x0, y: 0.25 + this.aimY * (PITCH.goalH - 0.45), z: PITCH.cz - this.aimZ * (PITCH.goalW / 2 - 0.25) };
  }
  private place() {
    this.s.setState({ x: PITCH.x0 + 11, y: BALL_R, z: PITCH.cz, vx: 0, vy: 0, vz: 0 });
    this.s.setSpin(0);
    this.keeperZ = PITCH.cz;
    this.s.moveKeeper(this.keeperZ);
    if (this.s.keeperMesh) this.s.keeperMesh.rotation.x = 0;
    this.shotAt = 0;
    this.result = "";
    this.aim.visible = true;
    this.hud();
  }
  private hud() {
    const kind = this.keys.chip ? "Chip" : this.keys.finesse ? "Finesse" : "Power";
    this.c.hud({ title: `Penalties · level ${this.level}`, line: this.result || (this.drawAt ? `${kind} shot · ${Math.round(this.power() * 100)}%${this.power() > 0.85 ? " (too hard?)" : ""}` : "Aim with the mouse, hold to power up, let go. Shift finesse, Ctrl chip"), score: this.goals, left: `${Math.max(0, this.left)} shots`, hint: "Esc pauses" });
  }
  private power() {
    return this.drawAt ? Math.min(1, (performance.now() - this.drawAt) / 1000) : 0;
  }
  down() {
    if (!this.shotAt && this.left > 0) this.drawAt = performance.now();
  }
  move(ndc: THREE.Vector2) {
    // After the kick: aftertouch (sideways mouse bends the ball for half a second).
    if (this.shotAt && performance.now() - this.shotAt < 500) this.s.addSpin((ndc.x - this.lastX) * -18);
    this.lastX = ndc.x;
    if (this.shotAt) return;
    this.aimZ = Math.max(-1, Math.min(1, ndc.x * 1.3));
    this.aimY = Math.max(0, Math.min(1, (ndc.y + 0.6) / 1.2));
    const t = this.target();
    this.aim.position.set(t.x + 0.05, t.y, t.z);
  }
  up() {
    if (!this.drawAt || this.shotAt) return;
    const p = this.power();
    this.drawAt = 0;
    this.left--;
    this.result = "";
    const t = this.target();
    // Too hard: wild (higher and wider, more the harder); too soft: weak and easy to save.
    const wild = Math.max(0, p - 0.85) / 0.15;
    t.y += wild * (0.4 + Math.random() * 1.1);
    t.z += (Math.random() - 0.5) * wild * 1.6;
    const speed = this.keys.chip ? 9 + p * 3 : this.keys.finesse ? 15 + p * 7 : 16 + p * 14;
    const k = solveKick({ x: PITCH.x0 + 11, y: BALL_R, z: PITCH.cz }, t, speed);
    this.s.setState({ x: PITCH.x0 + 11, y: BALL_R, z: PITCH.cz, vx: k.vx, vy: k.vy, vz: k.vz });
    // Finesse: curl towards the far side of where it is aimed.
    this.s.setSpin(this.keys.finesse ? Math.sign(t.z - PITCH.cz) * 3 : 0);
    this.shotAt = performance.now();
    this.aim.visible = false;
    // The keeper guesses: right more often as the level rises; a chip is read only by the best.
    const right = Math.random() < 0.2 + this.level * 0.2 - (this.keys.chip ? 0.35 : 0) - (p > 0.75 ? 0.1 : 0);
    this.dive = right ? t.z : PITCH.cz + (Math.random() < 0.5 ? -1 : 1) * (1.5 + Math.random() * 2);
    this.diveY = right && t.y > 1.3 ? 1.25 : 0.7;
    this.c.sound("shoot");
  }
  update(dt: number) {
    if (this.shotAt) {
      const since = (performance.now() - this.shotAt) / 1000;
      const go = since > 0.2;
      if (go) this.keeperZ += Math.sign(this.dive - this.keeperZ) * Math.min(Math.abs(this.dive - this.keeperZ), dt * (4.5 + this.level * 1.6));
      const off = this.keeperZ - PITCH.cz;
      this.s.moveKeeper(this.keeperZ, go && Math.abs(this.dive - PITCH.cz) > 1.2 ? this.diveY : 0.95);
      if (this.s.keeperMesh) this.s.keeperMesh.rotation.x += ((go ? Math.max(-1.3, Math.min(1.3, -off * 0.45)) : 0) - this.s.keeperMesh.rotation.x) * Math.min(1, dt * 10);
      if (since > 2.6) {
        if (!this.result) (this.result = "Saved!"), this.c.sound("miss");
        if (this.left > 0) this.place();
        else {
          this.shotAt = 0;
          this.left = -1;
          this.c.done("penalty", this.goals, this.goals * 2, `${this.goals} goals from 5 penalties`);
        }
      }
    }
    this.hud();
  }
  stop() {
    this.unkey();
    this.c.scene.remove(this.aim);
    this.s.removeKeeper();
    this.s.onGoal = null;
    this.s.reset();
    this.c.hud(null);
  }
}

// Free kicks (a challenge in levels, as in the score-a-goal mobile games): the ball on a spot, a wall 9.15 m in
// front that jumps, a keeper who reacts. Get it in for a star, into a top corner for two, through the gold ring for
// three. Stars are kept; a level with a star opens the next.
export const FK_LEVELS: { dist: number; angle: number; wall: number; ring: [number, number]; task: string }[] = [
  { dist: 18, angle: 0, wall: 2, ring: [-0.7, 0.6], task: "Over the wall, into the goal" },
  { dist: 20, angle: 0.25, wall: 3, ring: [0.7, 0.7], task: "Curl it round the wall" },
  { dist: 22, angle: -0.3, wall: 3, ring: [-0.75, 0.8], task: "Far top corner" },
  { dist: 19, angle: 0.5, wall: 4, ring: [0.8, 0.85], task: "A tight angle: bend it" },
  { dist: 24, angle: -0.15, wall: 4, ring: [0.75, 0.85], task: "From distance: power and dip" },
  { dist: 26, angle: 0.35, wall: 5, ring: [-0.8, 0.8], task: "Long range, five in the wall" },
  { dist: 21, angle: -0.55, wall: 5, ring: [0.8, 0.85], task: "From the edge of the box" },
  { dist: 28, angle: 0, wall: 5, ring: [0.0, 0.9], task: "Right under the bar" },
];
const FK_KEY = "seed.freekick.stars";
export function fkStars(): number[] {
  try {
    const a = JSON.parse(localStorage.getItem(FK_KEY) ?? "[]") as number[];
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
}
export class FreeKick implements Activity {
  kind = "freekick";
  private ball = { x: 0, y: BALL_R, z: 0 };
  private drawAt = 0;
  private shotAt = 0;
  private aimZ = 0;
  private aimY = 0.6;
  private lastX = 0;
  private result = "";
  private stars = 0;
  private keeperZ: number = PITCH.cz;
  private dive = PITCH.cz;
  private diveY = 0.95;
  private keys: ShotKeys;
  private unkey: () => void;
  private aim = ring("#ffffff", 0.22);
  private gold = ring("#facc15", 0.5);
  private crossed = false;
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx, private s: Soccer, private level: number) {
    this.level = Math.max(1, Math.min(FK_LEVELS.length, level));
    s.addKeeper(c.scene);
    [this.keys, this.unkey] = shotKeys();
    s.onGoal = null;
    c.scene.add(this.aim, this.gold);
    this.camera = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
    this.setup();
  }
  get where() {
    return { x: this.ball.x + 1.6, z: this.ball.z };
  }
  private def() {
    return FK_LEVELS[this.level - 1]!;
  }
  private setup() {
    const L = this.def();
    this.ball = { x: PITCH.x0 + Math.cos(L.angle) * L.dist, y: BALL_R, z: PITCH.cz + Math.sin(L.angle) * L.dist };
    this.s.setState({ ...this.ball, vx: 0, vy: 0, vz: 0 });
    this.s.setSpin(0);
    // The wall: 9.15 m towards the goal, covering the near post side.
    const toGoal = new THREE.Vector2(PITCH.x0 - this.ball.x, PITCH.cz - this.ball.z).normalize();
    const side = new THREE.Vector2(-toGoal.y, toGoal.x);
    const near = Math.sign(this.ball.z - PITCH.cz) || 1;
    const c = { x: this.ball.x + toGoal.x * 9.15, z: this.ball.z + toGoal.y * 9.15 };
    const pts: { x: number; z: number }[] = [];
    for (let i = 0; i < L.wall; i++) {
      const k = (i - (L.wall - 1) / 2) * 0.62 + near * 0.35 * (L.wall > 2 ? 1 : 0);
      pts.push({ x: c.x + side.x * k, z: c.z + side.y * k });
    }
    this.s.setWall(pts, this.c.scene);
    this.keeperZ = PITCH.cz + near * 0.6;
    this.s.moveKeeper(this.keeperZ);
    if (this.s.keeperMesh) this.s.keeperMesh.rotation.x = 0;
    this.gold.position.set(PITCH.x0 + 0.05, 0.25 + L.ring[1] * (PITCH.goalH - 0.5), PITCH.cz + L.ring[0] * (PITCH.goalW / 2 - 0.5));
    this.shotAt = 0;
    this.crossed = false;
    this.result = "";
    this.stars = 0;
    this.aim.visible = true;
    // Behind the ball, looking at the goal.
    this.camera.pos.set(this.ball.x - toGoal.x * 5, 2.1, this.ball.z - toGoal.y * 5);
    this.camera.look.set(PITCH.x0, 1.3, PITCH.cz);
    this.hud();
  }
  private target() {
    return { x: PITCH.x0, y: 0.25 + this.aimY * (PITCH.goalH - 0.45), z: PITCH.cz - this.aimZ * (PITCH.goalW / 2 - 0.25) };
  }
  private power() {
    return this.drawAt ? Math.min(1, (performance.now() - this.drawAt) / 1000) : 0;
  }
  private hud() {
    const total = fkStars().reduce((a, b) => a + (b ?? 0), 0);
    this.c.hud({ title: `Free kicks · level ${this.level} of ${FK_LEVELS.length}`, line: this.result || (this.drawAt ? `Power ${Math.round(this.power() * 100)}%${this.power() > 0.85 ? " (too hard?)" : ""}` : `${this.def().task}. Aim, hold, let go; move the mouse after the kick to curl it`), score: total, left: `best ${fkStars()[this.level - 1] ?? 0} of 3 stars`, hint: "Esc pauses" });
  }
  down() {
    if (!this.shotAt) this.drawAt = performance.now();
  }
  move(ndc: THREE.Vector2) {
    if (this.shotAt && performance.now() - this.shotAt < 600) this.s.addSpin((ndc.x - this.lastX) * -22);
    this.lastX = ndc.x;
    if (this.shotAt) return;
    this.aimZ = Math.max(-1.15, Math.min(1.15, ndc.x * 1.3));
    this.aimY = Math.max(0, Math.min(1.1, (ndc.y + 0.5) / 1.1));
    const t = this.target();
    this.aim.position.set(t.x + 0.05, t.y, t.z);
  }
  up() {
    if (!this.drawAt || this.shotAt) return;
    const p = this.power();
    this.drawAt = 0;
    const t = this.target();
    const wild = Math.max(0, p - 0.85) / 0.15;
    t.y += wild * (0.4 + Math.random() * 1.1);
    t.z += (Math.random() - 0.5) * wild * 1.6;
    const speed = this.keys.chip ? 12 + p * 4 : this.keys.finesse ? 17 + p * 7 : 19 + p * 12;
    const k = solveKick(this.ball, t, speed);
    this.s.setState({ ...this.ball, vx: k.vx, vy: k.vy, vz: k.vz });
    this.s.setSpin(this.keys.finesse ? Math.sign(t.z - this.ball.z) * 3 : 0);
    this.s.jumpWall();
    this.shotAt = performance.now();
    this.aim.visible = false;
    // The keeper reads it late (better at higher levels) and goes for where it will cross.
    this.dive = t.z + (Math.random() - 0.5) * (3.2 - this.level * 0.25);
    this.diveY = t.y > 1.4 ? 1.3 : 0.75;
    this.c.sound("shoot");
  }
  update(dt: number) {
    if (this.shotAt) {
      const since = (performance.now() - this.shotAt) / 1000;
      const go = since > 0.32 - this.level * 0.02;
      if (go) this.keeperZ += Math.sign(this.dive - this.keeperZ) * Math.min(Math.abs(this.dive - this.keeperZ), dt * (3.6 + this.level * 0.45));
      this.s.moveKeeper(this.keeperZ, go ? this.diveY : 0.95);
      const off = this.keeperZ - PITCH.cz;
      if (this.s.keeperMesh) this.s.keeperMesh.rotation.x += ((go ? Math.max(-1.3, Math.min(1.3, -off * 0.45)) : 0) - this.s.keeperMesh.rotation.x) * Math.min(1, dt * 10);
      // Scored? The ball past the line, between the posts, under the bar: stars by where it went in.
      const b = this.s.pos;
      if (!this.crossed && b.x < PITCH.x0 - BALL_R) {
        this.crossed = true;
        if (Math.abs(b.z - PITCH.cz) < PITCH.goalW / 2 && b.y < PITCH.goalH) {
          const g = this.gold.position;
          const corner = Math.abs(b.z - PITCH.cz) > PITCH.goalW / 2 - 1.1 && b.y > 1.45;
          this.stars = Math.hypot(b.z - g.z, b.y - g.y) < 0.6 ? 3 : corner ? 2 : 1;
          this.result = this.stars === 3 ? "GOAL! Through the ring: 3 stars" : this.stars === 2 ? "GOAL! Top corner: 2 stars" : "GOAL! 1 star";
          this.c.sound("win");
        }
      }
      if (since > 3) {
        if (!this.stars) (this.result = "No goal. Try again."), this.c.sound("miss");
        const all = fkStars();
        if (this.stars > (all[this.level - 1] ?? 0)) {
          all[this.level - 1] = this.stars;
          try {
            localStorage.setItem(FK_KEY, JSON.stringify(all));
          } catch {}
        }
        if (this.stars) {
          this.c.done("freekick", this.stars, this.stars, `Free kick level ${this.level}: ${this.stars} of 3 stars`);
          if (this.level < FK_LEVELS.length) this.level++;
        }
        this.setup();
        this.result = this.stars ? "" : "No goal. Try again.";
      }
    }
    this.hud();
  }
  stop() {
    this.unkey();
    this.c.scene.remove(this.aim, this.gold);
    this.s.setWall([], this.c.scene);
    this.s.removeKeeper();
    this.s.reset();
    this.c.hud(null);
  }
}
