import * as THREE from "three";
import type { Box, Physics } from "./engine";
import { anyVehicle } from "./cars";
import { ROADS, junctions, lightState, type Junction, type Road } from "./streets";

// Town traffic: cars drive in their lanes on the right, at town speeds (faster on the ring road and the avenues),
// turn at junctions along smooth curves, stop at red and yellow lights before the stop line, keep their distance
// from the car ahead, stop for people and cars in their way, and are solid (you bump into them). Everyone sees the
// same light cycle; each browser runs its own traffic (cars are scenery, not shared).

type Mover = {
  road: Road;
  dir: 1 | -1;
  t: number; // position along the road
  off: number; // lane offset across the road
  speed: number;
  turn: { a: THREE.Vector3; c: THREE.Vector3; b: THREE.Vector3; k: number; len: number; road: Road; dir: 1 | -1; t: number; off: number } | null;
  g: THREE.Group;
  wheels: THREE.Object3D[];
  box: Box;
  wait: number;
  lastJ: Junction | null;
  heading: number;
};

const PALETTE = ["#1f2937", "#e5e7eb", "#9ca3af", "#1e3a8a", "#7f1d1d", "#064e3b", "#f8fafc", "#78350f", "#334155", "#a16207", "#0f766e", "#111827"];
const MODELS = ["fairheaven", "ace", "negotiator", "taxi", "asti", "conquer", "bokaroo", "fairheaven", "ace", "police", "negotiator", "van"];

const laneOff = (r: Road, dir: 1 | -1) => (r.axis === "x" ? dir : -dir) * (r.lanes === 2 ? r.w * 0.375 : r.w / 4);
const pos = (r: Road, t: number, off: number) => (r.axis === "x" ? new THREE.Vector3(t, 0, r.c + off) : new THREE.Vector3(r.c + off, 0, t));
const headingOf = (r: Road, dir: 1 | -1) => (r.axis === "x" ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? 0 : Math.PI);

export class Traffic {
  private cars: Mover[] = [];
  private js: Junction[];
  private roads = ROADS.filter((r) => r.kind !== "access");
  private seed = 7;
  constructor(
    private scene: THREE.Scene,
    private ph: Physics,
    count: number,
  ) {
    this.js = junctions();
    for (let i = 0; i < count; i++) this.spawn(i);
  }
  private rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
  private spawn(i: number) {
    const road = this.roads[Math.floor(this.rnd() * this.roads.length)]!;
    const dir = (this.rnd() < 0.5 ? 1 : -1) as 1 | -1;
    const model = i === 0 ? "townbus" : MODELS[i % MODELS.length]!;
    const v = anyVehicle(model, PALETTE[Math.floor(this.rnd() * PALETTE.length)]!, undefined, true);
    const t = road.from + 10 + this.rnd() * (road.to - road.from - 20);
    const off = laneOff(road, dir);
    const p = pos(road, t, off);
    v.group.position.copy(p);
    this.scene.add(v.group);
    const half = Math.max(v.len, 3) / 2;
    const box = this.ph.addDynamic({ minX: p.x - half, maxX: p.x + half, minY: 0, maxY: 1.6, minZ: p.z - half, maxZ: p.z + half, tag: "traffic" });
    this.cars.push({ road, dir, t, off, speed: 0, turn: null, g: v.group, wheels: v.wheels, box, wait: 0, lastJ: null, heading: headingOf(road, dir) });
  }

  // The next junction ahead on this road, if any (and how far).
  private ahead(c: Mover) {
    let best: Junction | null = null, bd = Infinity;
    for (const j of this.js) {
      if (j.a !== c.road && j.b !== c.road) continue;
      const jt = c.road.axis === "x" ? j.x : j.z;
      const d = (jt - c.t) * c.dir;
      if (d > 0.5 && d < bd && j !== c.lastJ) (bd = d), (best = j);
    }
    return { j: best, d: bd };
  }

  update(dt: number, obstacles: { x: number; z: number }[], focus: THREE.Vector3, view: number) {
    const now = Date.now() / 1000;
    for (const c of this.cars) {
      const want = c.road.kind === "ring" || c.road.kind === "avenue" ? 14 : c.road.kind === "home" ? 8 : 11;
      let limit = want;
      if (c.turn) {
        // Following the curve through a junction.
        const tr = c.turn;
        c.speed = Math.min(c.speed + dt * 3, 7);
        tr.k += (c.speed * dt) / tr.len;
        if (tr.k >= 1) {
          c.road = tr.road;
          c.dir = tr.dir;
          c.t = tr.t;
          c.off = tr.off;
          c.turn = null;
        } else {
          const k = tr.k, u = 1 - k;
          const p = new THREE.Vector3().addScaledVector(tr.a, u * u).addScaledVector(tr.c, 2 * u * k).addScaledVector(tr.b, k * k);
          const d = new THREE.Vector3().addScaledVector(tr.c.clone().sub(tr.a), 2 * u).addScaledVector(tr.b.clone().sub(tr.c), 2 * k);
          c.g.position.copy(p);
          c.heading = Math.atan2(d.x, d.z);
        }
      }
      if (!c.turn) {
        const { j, d } = this.ahead(c);
        if (j) {
          const other = j.a === c.road ? j.b : j.a;
          const stopAt = other.w / 2 + other.s + 4.2;
          // Lights: stop before the line on red or yellow (unless too close to stop).
          if (j.signal && lightState(c.road.axis, now) !== "green" && d > stopAt - 0.5 && d < stopAt + 20) limit = Math.min(limit, Math.max(0, (d - stopAt) * 0.9));
          // Stop signs on home streets: a short wait.
          if (!j.signal && c.road.kind === "home" && d < stopAt + 1 && d > stopAt - 1 && c.wait < 1.2) (limit = 0), (c.wait += dt);
          // At the junction: turn (or must, at a road's end), else go straight on.
          if (d < 0.6) {
            c.wait = 0;
            c.lastJ = j;
            const endHere = (c.dir > 0 ? c.road.to - (c.road.axis === "x" ? j.x : j.z) : (c.road.axis === "x" ? j.x : j.z) - c.road.from) < 8;
            if (endHere || this.rnd() < 0.35) {
              const dirs = ([1, -1] as const).filter((dd) => {
                const ot = other.axis === "x" ? j.x : j.z;
                return dd > 0 ? other.to - ot > 12 : ot - other.from > 12;
              });
              if (other.kind !== "access" && dirs.length) {
                const nd = dirs[Math.floor(this.rnd() * dirs.length)]!;
                const ot = (other.axis === "x" ? j.x : j.z) + nd * (c.road.w / 2 + 2);
                const noff = laneOff(other, nd);
                const a = c.g.position.clone();
                const b = pos(other, ot, noff);
                const corner = c.road.axis === "x" ? new THREE.Vector3(b.x, 0, a.z) : new THREE.Vector3(a.x, 0, b.z);
                c.turn = { a, c: corner, b, k: 0, len: a.distanceTo(corner) + corner.distanceTo(b), road: other, dir: nd, t: ot, off: noff };
                c.lastJ = j;
              } else if (endHere) {
                // A dead end: turn round.
                c.dir = (-c.dir) as 1 | -1;
                c.off = laneOff(c.road, c.dir);
              }
            }
          }
        } else if ((c.dir > 0 ? c.road.to - c.t : c.t - c.road.from) < 6) {
          c.dir = (-c.dir) as 1 | -1;
          c.off = laneOff(c.road, c.dir);
          c.lastJ = null;
        }
        // Keep a gap to the car ahead in the same lane, and stop for people and cars in the way.
        const fx = Math.sin(headingOf(c.road, c.dir)), fz = Math.cos(headingOf(c.road, c.dir));
        const me = c.g.position;
        for (const o of this.cars) {
          if (o === c || o.road !== c.road || o.dir !== c.dir || o.turn) continue;
          const gap = (o.t - c.t) * c.dir;
          if (gap > 0 && gap < 18) limit = Math.min(limit, Math.max(0, (gap - 7) * 0.8));
        }
        for (const p of obstacles) {
          const dx = p.x - me.x, dz = p.z - me.z;
          const along = dx * fx + dz * fz, across = Math.abs(dx * fz - dz * fx);
          if (along > 0 && along < 12 && across < 2.2) limit = Math.min(limit, Math.max(0, (along - 4) * 0.7));
        }
        c.speed += Math.max(-9 * dt, Math.min(3 * dt, limit - c.speed));
        c.t += c.speed * c.dir * dt;
        const p = pos(c.road, c.t, c.off);
        c.g.position.copy(p);
        let dh = headingOf(c.road, c.dir) - c.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        c.heading += dh * Math.min(1, dt * 6);
      }
      c.g.rotation.y = c.heading;
      for (const w of c.wheels) w.rotation.x += (c.speed * dt) / 0.33;
      const half = 2.2;
      const p = c.g.position;
      Object.assign(c.box, { minX: p.x - half, maxX: p.x + half, minZ: p.z - half, maxZ: p.z + half });
      c.g.visible = p.distanceTo(focus) < view;
    }
  }

  dispose() {
    for (const c of this.cars) this.scene.remove(c.g);
    this.ph.remove("traffic");
    this.cars = [];
  }
}
