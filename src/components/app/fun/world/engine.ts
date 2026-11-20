// Seed Town's physics: solid boxes and round posts in a spatial grid, a character that walks into them (never
// through), climbs steps and stairs, falls with gravity, lands, bumps its head, and rides moving platforms
// (elevators); vehicles that collide with buildings; and rays for the camera so it never looks through a wall.
// Hand-written and small on purpose (no physics engine download): everything in town is boxes and cylinders.

export type Box = { minX: number; minY: number; minZ: number; maxX: number; maxY: number; maxZ: number; tag?: string; on?: boolean };
export type Post = { x: number; z: number; r: number; minY: number; maxY: number; tag?: string };

const CELL = 8;
const key = (i: number, j: number) => i * 4096 + j;

export class Physics {
  private grid = new Map<number, Box[]>();
  private posts: Post[] = [];
  private postGrid = new Map<number, Post[]>();
  // Moving things (elevator cabins and doors): few, always checked, and can be switched off (open doors).
  dynamic: Box[] = [];
  count = 0;

  add(b: Box) {
    const i0 = Math.floor(b.minX / CELL), i1 = Math.floor(b.maxX / CELL), j0 = Math.floor(b.minZ / CELL), j1 = Math.floor(b.maxZ / CELL);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = key(i, j);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(b);
      }
    this.count++;
    return b;
  }
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tag?: string) {
    return this.add({ minX: Math.min(x0, x1), minY: Math.min(y0, y1), minZ: Math.min(z0, z1), maxX: Math.max(x0, x1), maxY: Math.max(y0, y1), maxZ: Math.max(z0, z1), tag });
  }
  // A box from its centre and size.
  sized(cx: number, cy: number, cz: number, w: number, h: number, d: number, tag?: string) {
    return this.box(cx - w / 2, cy - h / 2, cz - d / 2, cx + w / 2, cy + h / 2, cz + d / 2, tag);
  }
  post(p: Post) {
    this.posts.push(p);
    for (let i = Math.floor((p.x - p.r) / CELL); i <= Math.floor((p.x + p.r) / CELL); i++)
      for (let j = Math.floor((p.z - p.r) / CELL); j <= Math.floor((p.z + p.r) / CELL); j++) {
        const k = key(i, j);
        const l = this.postGrid.get(k) ?? [];
        l.push(p);
        this.postGrid.set(k, l);
      }
    this.count++;
    return p;
  }
  addDynamic(b: Box) {
    b.on = b.on ?? true;
    this.dynamic.push(b);
    return b;
  }
  remove(tag: string) {
    for (const [k, list] of this.grid) this.grid.set(k, list.filter((b) => b.tag !== tag));
    this.posts = this.posts.filter((p) => p.tag !== tag);
    for (const [k, l] of this.postGrid) this.postGrid.set(k, l.filter((p) => p.tag !== tag));
    this.dynamic = this.dynamic.filter((b) => b.tag !== tag);
  }

  near(x: number, z: number, r: number): Box[] {
    const out: Box[] = [];
    const i0 = Math.floor((x - r) / CELL), i1 = Math.floor((x + r) / CELL), j0 = Math.floor((z - r) / CELL), j1 = Math.floor((z + r) / CELL);
    const seen = new Set<Box>();
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const b of this.grid.get(key(i, j)) ?? []) if (!seen.has(b)) (seen.add(b), out.push(b));
    for (const b of this.dynamic) if (b.on) out.push(b);
    return out;
  }
  nearPosts(x: number, z: number, r: number) {
    const out = new Set<Post>();
    for (let i = Math.floor((x - r - 1) / CELL); i <= Math.floor((x + r + 1) / CELL); i++)
      for (let j = Math.floor((z - r - 1) / CELL); j <= Math.floor((z + r + 1) / CELL); j++)
        for (const p of this.postGrid.get(key(i, j)) ?? []) if (Math.abs(p.x - x) < p.r + r + 1 && Math.abs(p.z - z) < p.r + r + 1) out.add(p);
    return [...out];
  }

  // The highest surface under a circle that the feet can stand on (at most `step` above them).
  groundAt(x: number, z: number, r: number, feetY: number, step: number) {
    let g = 0;
    for (const b of this.near(x, z, r)) {
      if (b.maxY > feetY + step || b.maxY <= g || b.tag === "veh") continue;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) g = b.maxY;
    }
    for (const p of this.nearPosts(x, z, r)) if (p.maxY <= feetY + step && p.maxY > g && Math.hypot(p.x - x, p.z - z) < p.r + r) g = p.maxY;
    return g;
  }

  // The lowest ceiling above the head.
  ceilingAt(x: number, z: number, r: number, headY: number, feetY: number) {
    let c = Infinity;
    for (const b of this.near(x, z, r)) {
      if (b.minY < feetY + 0.5 || b.minY > headY + 0.5) continue;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) c = Math.min(c, b.minY);
    }
    return c;
  }

  // Push a circle (feet to head) out of every wall it overlaps. Things lower than `step` are not walls.
  // Boxes tagged "veh" stop only vehicles (doorways, the park).
  resolve(pos: { x: number; z: number }, r: number, feetY: number, height: number, step: number, vehicle = false) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const b of this.near(pos.x, pos.z, r + 0.5)) {
        if (b.maxY <= feetY + step || b.minY >= feetY + height - 0.05) continue;
        if (b.tag === "veh" && !vehicle) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = moved = true;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          dx /= d;
          dz /= d;
          pos.x = cx + dx * r;
          pos.z = cz + dz * r;
        } else {
          // The centre is inside the box: out along the shortest way.
          const l = pos.x - b.minX, rr = b.maxX - pos.x, n = pos.z - b.minZ, s = b.maxZ - pos.z;
          const m = Math.min(l, rr, n, s);
          if (m === l) pos.x = b.minX - r;
          else if (m === rr) pos.x = b.maxX + r;
          else if (m === n) pos.z = b.minZ - r;
          else pos.z = b.maxZ + r;
        }
      }
      for (const p of this.nearPosts(pos.x, pos.z, r)) {
        if (p.maxY <= feetY + step || p.minY >= feetY + height) continue;
        const dx = pos.x - p.x, dz = pos.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d >= p.r + r) continue;
        hit = moved = true;
        const k = d > 1e-6 ? (p.r + r) / d : 1;
        pos.x = p.x + (d > 1e-6 ? dx * k : p.r + r);
        pos.z = p.z + (d > 1e-6 ? dz * k : 0);
      }
      if (!moved) break;
    }
    return hit;
  }

  // The first solid thing along a segment: the fraction 0..1 of the way (1: nothing).
  ray(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    let best = 1;
    const minX = Math.min(ax, bx), maxX = Math.max(ax, bx), minZ = Math.min(az, bz), maxZ = Math.max(az, bz);
    for (const b of this.near((minX + maxX) / 2, (minZ + maxZ) / 2, Math.max(maxX - minX, maxZ - minZ) / 2 + 1)) {
      if (b.tag === "veh" || b.tag === "glass") continue;
      let t0 = 0, t1 = best;
      const slab = (o: number, d: number, lo: number, hi: number) => {
        if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
        let a = (lo - o) / d, c = (hi - o) / d;
        if (a > c) [a, c] = [c, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, c);
        return t0 <= t1;
      };
      if (slab(ax, dx, b.minX, b.maxX) && slab(ay, dy, b.minY, b.maxY) && slab(az, dz, b.minZ, b.maxZ) && t0 < best) best = t0;
    }
    return best;
  }
}

// ------------------------------------------------------------------------------------------------- walking

export type Body = { x: number; y: number; z: number; vy: number; ground: boolean; r: number; h: number; step: number; platform: Box | null };
export const newBody = (x: number, y: number, z: number): Body => ({ x, y, z, vy: 0, ground: true, r: 0.32, h: 1.7, step: 0.45, platform: null });

const GRAVITY = 26;

// Move a body by (dx, dz) this frame: in small steps so it never tunnels through a thin wall; then gravity, steps
// up and down, landing and the ceiling. Returns true when it hit a wall.
export function moveBody(ph: Physics, b: Body, dx: number, dz: number, dt: number, jump: number) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dz)) / 0.15));
  let hit = false;
  const p = { x: b.x, z: b.z };
  for (let i = 0; i < n; i++) {
    p.x += dx / n;
    p.z += dz / n;
    if (ph.resolve(p, b.r, b.y, b.h, b.step)) hit = true;
  }
  b.x = p.x;
  b.z = p.z;
  if (jump && b.ground) {
    b.vy = jump;
    b.ground = false;
  }
  const g = ph.groundAt(b.x, b.z, b.r * 0.6, b.y, b.step);
  if (b.ground && b.vy <= 0 && g >= b.y - 0.55 && g <= b.y + b.step) {
    // On the ground: follow steps and stairs up and down, and moving floors.
    b.y = g;
    b.vy = 0;
  } else {
    b.vy -= GRAVITY * dt;
    b.y += b.vy * dt;
    if (b.y <= g) {
      b.y = g;
      b.vy = 0;
      b.ground = true;
    } else b.ground = false;
    if (b.vy > 0) {
      const c = ph.ceilingAt(b.x, b.z, b.r * 0.6, b.y + b.h, b.y);
      if (b.y + b.h > c) (b.y = c - b.h), (b.vy = 0);
    }
  }
  if (b.y < -5) (b.y = 0), (b.vy = 0);
  return hit;
}

// ------------------------------------------------------------------------------------------------- driving

export type Car = { x: number; z: number; y: number; heading: number; speed: number; steer: number; len: number; r: number; top: number; handling: number };

// Arcade driving: throttle, brake and reverse, steering that depends on speed, friction; two circles (front and
// back) keep the vehicle out of buildings, and a crash bounces it back.
export function driveCar(ph: Physics, c: Car, input: { throttle: number; steer: number; brake: boolean }, dt: number) {
  const accel = input.throttle > 0 ? 9 + c.top * 0.25 : input.throttle < 0 ? (c.speed > 0.5 ? 20 : 6) : 0;
  c.speed += input.throttle * accel * dt;
  if (input.brake) c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), 26 * dt);
  // Rolling friction and air.
  c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), (2 + Math.abs(c.speed) * 0.08) * dt);
  c.speed = Math.max(-c.top * 0.35, Math.min(c.top, c.speed));
  c.steer += (input.steer - c.steer) * Math.min(1, dt * 8);
  const turn = c.steer * c.handling * Math.min(1, Math.abs(c.speed) / 6) * Math.sign(c.speed || 1);
  c.heading += turn * dt * (1 - Math.min(0.5, Math.abs(c.speed) / (c.top * 2.2)));
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  // In small steps, so a fast car never skips through a thin wall.
  let hit = false;
  const off = c.len / 2 - c.r;
  const travel = c.speed * dt;
  const n = Math.max(1, Math.ceil(Math.abs(travel) / 0.3));
  for (let i = 0; i < n; i++) {
    const nx = c.x + (fx * travel) / n, nz = c.z + (fz * travel) / n;
    const front = { x: nx + fx * off, z: nz + fz * off }, back = { x: nx - fx * off, z: nz - fz * off };
    const h1 = ph.resolve(front, c.r, c.y, 1.4, 0.35, true), h2 = ph.resolve(back, c.r, c.y, 1.4, 0.35, true);
    if (h1 || h2) {
      hit = true;
      c.x = (front.x + back.x) / 2;
      c.z = (front.z + back.z) / 2;
      if (Math.abs(c.speed) > 4) c.speed *= -0.25;
      else c.speed *= 0.5;
      break;
    }
    c.x = nx;
    c.z = nz;
  }
  c.y = ph.groundAt(c.x, c.z, c.r * 0.5, c.y, 0.4);
  return hit;
}
