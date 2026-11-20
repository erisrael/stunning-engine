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
    if (Math.abs(w.y) > 0.5) this.ball.applyImpulse({ x: -w.y * v.z * 0.0006, y: 0, z: w.y * v.x * 0.0006 }, true);
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

// Penalties: five shots from the spot against a keeper who guesses a side (more often right at higher levels).
export class Penalty implements Activity {
  kind = "penalty";
  private left = 5;
  private goals = 0;
  private drawAt = 0;
  private aimZ = 0;
  private shotAt = 0;
  private dive = 0;
  private result = "";
  private keeperZ: number = PITCH.cz;
  camera: { pos: THREE.Vector3; look: THREE.Vector3 };
  constructor(private c: ActCtx, private s: Soccer, private level: number) {
    s.addKeeper(c.scene);
    s.onGoal = () => {
      if (this.shotAt) (this.goals++, (this.result = "GOAL!"), c.sound("win"));
    };
    this.camera = { pos: new THREE.Vector3(PITCH.x0 + 15, 2.2, PITCH.cz), look: new THREE.Vector3(PITCH.x0, 1.2, PITCH.cz) };
    this.place();
  }
  private place() {
    this.s.setState({ x: PITCH.x0 + 11, y: BALL_R, z: PITCH.cz, vx: 0, vy: 0, vz: 0 });
    this.keeperZ = PITCH.cz;
    this.s.moveKeeper(this.keeperZ);
    this.shotAt = 0;
    this.hud();
  }
  private hud() {
    this.c.hud({ title: `Penalties · level ${this.level}`, line: this.result || (this.drawAt ? `Power ${Math.round(this.power() * 100)}%` : "Aim left or right, hold for power, let go"), score: this.goals, left: `${this.left} shots`, hint: "Esc to stop" });
  }
  private power() {
    return this.drawAt ? Math.min(1, (performance.now() - this.drawAt) / 900) : 0;
  }
  down() {
    if (!this.shotAt && this.left > 0) this.drawAt = performance.now();
  }
  move(ndc: THREE.Vector2) {
    this.aimZ = Math.max(-1, Math.min(1, ndc.x));
  }
  up() {
    if (!this.drawAt || this.shotAt) return;
    const p = this.power();
    this.drawAt = 0;
    this.left--;
    this.result = "";
    // Toward the goal (-x), sideways by the aim; harder shots rise more.
    const speed = 14 + p * 16;
    const dirZ = this.aimZ * 0.42;
    this.s.setState({ x: PITCH.x0 + 11, y: BALL_R, z: PITCH.cz, vx: -speed, vy: 1 + p * 4.2, vz: -dirZ * speed });
    this.shotAt = performance.now();
    // The keeper guesses: right more often as the level rises.
    const right = Math.random() < 0.25 + this.level * 0.2;
    const target = PITCH.cz - dirZ * 11;
    this.dive = right ? target : PITCH.cz + (Math.random() - 0.5) * PITCH.goalW;
    this.c.sound("shoot");
  }
  update(dt: number) {
    if (this.shotAt) {
      const since = (performance.now() - this.shotAt) / 1000;
      if (since > 0.22) this.keeperZ += Math.sign(this.dive - this.keeperZ) * Math.min(Math.abs(this.dive - this.keeperZ), dt * (4 + this.level * 2));
      this.s.moveKeeper(this.keeperZ, since > 0.22 && Math.abs(this.dive - PITCH.cz) > 1.5 ? 0.7 : 0.95);
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
    if (this.drawAt || this.shotAt) this.hud();
  }
  stop() {
    this.s.removeKeeper();
    this.s.onGoal = null;
    this.s.reset();
    this.c.hud(null);
  }
}
