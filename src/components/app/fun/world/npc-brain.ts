import * as THREE from "three";
import { moveBody, newBody, type Body, type Physics } from "./engine";
import { ROADS, junctions } from "./streets";

// Town folk with their own lives. Each has a personality and a role; a day plan on the town's clock (work, lunch,
// shopping, the park, the football, home at night) picks where to go; they walk there along the sidewalks and
// zebra crossings (a graph of the streets, shortest path), never through walls (the same collisions as players),
// keep apart from each other, sit on benches, browse shop windows, watch matches, shelter from rain, chat with each
// other when they meet, and react to people who come near (look, wave, say hello; shy ones look away).

export type Personality = "friendly" | "shy" | "talkative" | "professional" | "curious" | "funny" | "helpful" | "competitive" | "serious";
export const PERSONALITIES: Personality[] = ["friendly", "shy", "talkative", "professional", "curious", "funny", "helpful", "competitive", "serious"];
export type Role = "worker" | "shopper" | "student" | "retiree" | "athlete" | "keeper" | "guide";
export type Doing = "walk" | "idle" | "sit" | "work" | "browse" | "watch" | "chat" | "greet" | "shelter" | "home";

export type Place = { kind: "bench" | "work" | "shop" | "plaza" | "park" | "stands" | "stop" | "home" | "cafe"; x: number; y: number; z: number; ry: number; label: string; taken?: string | null };

// ------------------------------------------------------------------------------------------------- the street graph

type Node = { x: number; z: number; links: number[] };
export class WalkGraph {
  nodes: Node[] = [];
  private add(x: number, z: number) {
    const near = this.nodes.findIndex((n) => Math.abs(n.x - x) < 1.2 && Math.abs(n.z - z) < 1.2);
    if (near >= 0) return near;
    this.nodes.push({ x, z, links: [] });
    return this.nodes.length - 1;
  }
  private link(a: number, b: number) {
    if (a === b) return;
    if (!this.nodes[a]!.links.includes(b)) this.nodes[a]!.links.push(b);
    if (!this.nodes[b]!.links.includes(a)) this.nodes[b]!.links.push(a);
  }
  constructor() {
    const js = junctions();
    // Along each sidewalk: points at the junction corners and every 25 m.
    for (const r of ROADS) {
      if (!r.s) continue;
      for (const side of [-1, 1]) {
        const off = side * (r.w / 2 + r.s / 2);
        const ts = new Set<number>([r.from + 1, r.to - 1]);
        for (const j of js) if (j.a === r || j.b === r) {
          const o = j.a === r ? j.b : j.a;
          const t = r.axis === "x" ? j.x : j.z;
          ts.add(t - o.w / 2 - o.s / 2);
          ts.add(t + o.w / 2 + o.s / 2);
        }
        const sorted = [...ts].filter((t) => t >= r.from && t <= r.to).sort((a, b) => a - b);
        const pts: number[] = [];
        for (let i = 0; i < sorted.length; i++) {
          pts.push(sorted[i]!);
          const next = sorted[i + 1];
          if (next !== undefined) for (let t = sorted[i]! + 25; t < next - 5; t += 25) pts.push(t);
        }
        let prev = -1;
        for (const t of pts) {
          const id = r.axis === "x" ? this.add(t, r.c + off) : this.add(r.c + off, t);
          if (prev >= 0) this.link(prev, id);
          prev = id;
        }
      }
    }
    // Zebra crossings: corners joined across each road at its junctions.
    for (const j of js) {
      const H = j.a, V = j.b;
      for (const q of [-1, 1]) {
        const ax = j.x + q * (V.w / 2 + V.s / 2);
        const a = this.closest(ax, j.z - (H.w / 2 + H.s / 2)), b = this.closest(ax, j.z + (H.w / 2 + H.s / 2));
        if (a.d < 2 && b.d < 2) this.link(a.i, b.i);
        const az = j.z + q * (H.w / 2 + H.s / 2);
        const c = this.closest(j.x - (V.w / 2 + V.s / 2), az), d = this.closest(j.x + (V.w / 2 + V.s / 2), az);
        if (c.d < 2 && d.d < 2) this.link(c.i, d.i);
      }
    }
  }
  closest(x: number, z: number) {
    let best = 0, bd = Infinity;
    this.nodes.forEach((n, i) => {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) (bd = d), (best = i);
    });
    return { i: best, d: Math.sqrt(bd) };
  }
  // Shortest path (A*) from near one point to near another, as points to walk through.
  path(fx: number, fz: number, tx: number, tz: number): { x: number; z: number }[] {
    const s = this.closest(fx, fz), g = this.closest(tx, tz);
    // Close by or off the streets entirely: walk straight.
    if (Math.hypot(tx - fx, tz - fz) < Math.min(30, s.d + g.d + 8)) return [{ x: tx, z: tz }];
    const open = new Set<number>([s.i]);
    const came = new Map<number, number>();
    const gs = new Map<number, number>([[s.i, 0]]);
    const h = (i: number) => Math.hypot(this.nodes[i]!.x - this.nodes[g.i]!.x, this.nodes[i]!.z - this.nodes[g.i]!.z);
    const fs = new Map<number, number>([[s.i, h(s.i)]]);
    let guard = 0;
    while (open.size && guard++ < 4000) {
      let cur = -1, cf = Infinity;
      for (const i of open) if ((fs.get(i) ?? Infinity) < cf) (cf = fs.get(i)!), (cur = i);
      if (cur === g.i) {
        const out: { x: number; z: number }[] = [];
        let c: number | undefined = cur;
        while (c !== undefined) (out.unshift({ x: this.nodes[c]!.x, z: this.nodes[c]!.z }), (c = came.get(c)));
        out.push({ x: tx, z: tz });
        return out;
      }
      open.delete(cur);
      for (const n of this.nodes[cur]!.links) {
        const d = (gs.get(cur) ?? 0) + Math.hypot(this.nodes[n]!.x - this.nodes[cur]!.x, this.nodes[n]!.z - this.nodes[cur]!.z);
        if (d < (gs.get(n) ?? Infinity)) {
          came.set(n, cur);
          gs.set(n, d);
          fs.set(n, d + h(n));
          open.add(n);
        }
      }
    }
    return [{ x: this.nodes[s.i]!.x, z: this.nodes[s.i]!.z }, { x: tx, z: tz }];
  }
}

// ------------------------------------------------------------------------------------------------- a brain

export type BrainOut = { x: number; y: number; z: number; ry: number; speed: number; sit: boolean; emote: string; visible: boolean; say: string | null };
export type World = { hours: number; raining: boolean; me: { x: number; z: number; moving: boolean }; places: Place[]; graph: WalkGraph; ph: Physics; others: NpcBrain[]; matchOn: boolean };

const SMALL_TALK: Record<Personality, string[]> = {
  friendly: ["Lovely to see you!", "How is your day going?", "The fountain looks great today."],
  shy: ["Oh... hello.", "Um, nice weather.", "Sorry, I was miles away."],
  talkative: ["Did you hear about the new tower downtown? Twenty-two floors!", "My cousin swears the circuit lap record will fall this week.", "I tried the Habesha Coffee place. Best macchiato in town."],
  professional: ["Busy day at the office.", "Meetings until five, then home.", "Have you finished your reports?"],
  curious: ["What do you think is inside the industrial yard?", "Have you been up the office tower?", "I wonder who built the wood south-west."],
  funny: ["I tried archery once. The target is still safe.", "My car has two speeds: slow and parked.", "I walk so I can say I exercised."],
  helpful: ["Need directions? Just ask.", "The shops are east along Market Street.", "Bus stops are on the avenue and Market Street."],
  competitive: ["Bet you can't beat my circuit time.", "Penalties at the stadium, you and me?", "I am the best archer in town, ask anyone."],
  serious: ["The traffic lights here are well timed.", "Keep to the sidewalks, please.", "Rain is coming, I think."],
};

let uid = 0;
export class NpcBrain {
  readonly id: string;
  body: Body;
  private ry = 0;
  private plan: { place: Place | null; doing: Doing; until: number; path: { x: number; z: number }[]; stuck: number; lastX: number; lastZ: number } = { place: null, doing: "idle", until: 0, path: [], stuck: 0, lastX: 0, lastZ: 0 };
  private chatWith: NpcBrain | null = null;
  private chatLines: string[] = [];
  private chatAt = 0;
  private greetedAt = 0;
  private nextDecide = 0;
  say: string | null = null;
  sayUntil = 0;
  // A fist fight with me: their health, the next punch, down until, running away until; mad ones fight back.
  fight: { hp: number; nextHit: number; koUntil: number; fleeUntil: number; mad: boolean } | null = null;
  hitMe: ((dmg: number, from: NpcBrain) => void) | null = null;
  // A social moment I started (high five, hug, dance): the emote until a time.
  social: { emote: string; until: number } | null = null;
  // Hit by me: the first punch starts a fight (or a run); returns true on a knock-out.
  struck(dmg: number, fromX: number, fromZ: number, ph: Physics, now: number) {
    const b = this.body;
    if (this.chatWith) this.endChat();
    if (!this.fight) {
      const mad = ["competitive", "serious", "funny", "professional"].includes(this.personality) || this.rng() < 0.25;
      this.fight = { hp: 100, nextHit: now + 600, koUntil: 0, fleeUntil: mad ? 0 : now + 9000, mad };
      this.say = mad ? ["You want a fight? Fine.", "Oh, it's on!", "Big mistake."][Math.floor(this.rng() * 3)]! : ["Help!", "Hey! Leave me alone!", "What is wrong with you?"][Math.floor(this.rng() * 3)]!;
      this.sayUntil = now + 2500;
    }
    const f = this.fight;
    if (now < f.koUntil) return false;
    f.hp -= dmg;
    const dx = b.x - fromX, dz = b.z - fromZ, d = Math.hypot(dx, dz) || 1;
    moveBody(ph, b, (dx / d) * 0.45, (dz / d) * 0.45, 1 / 60, 0);
    if (f.hp <= 0) {
      f.koUntil = now + 7000;
      this.say = null;
      return true;
    }
    return false;
  }
  constructor(
    public name: string,
    public personality: Personality,
    public role: Role,
    x: number,
    z: number,
    private rng: () => number,
    public home: Place | null = null,
  ) {
    this.id = `brain${uid++}`;
    this.body = newBody(x, 0, z);
    this.body.r = 0.28;
  }
  get doing() {
    return this.plan.doing;
  }
  get busyTalking() {
    return !!this.chatWith;
  }

  // What this person wants now, by the hour, the weather and who they are.
  private decide(w: World, now: number) {
    const h = w.hours;
    const r = this.rng();
    const pick = (kinds: Place["kind"][]) => {
      const list = w.places.filter((p) => kinds.includes(p.kind) && (!p.taken || p.taken === this.id));
      if (!list.length) return null;
      // Prefer places near-ish (people do not cross the whole town every hour).
      list.sort((a, b) => Math.hypot(a.x - this.body.x, a.z - this.body.z) - Math.hypot(b.x - this.body.x, b.z - this.body.z));
      return list[Math.floor(Math.min(list.length - 1, this.rng() ** 2 * list.length))]!;
    };
    let kinds: Place["kind"][];
    if (this.role === "keeper" || this.role === "guide") kinds = ["work"];
    else if (w.raining && r < 0.7) kinds = ["stop", "shop"];
    else if (h < 6 || h >= 22) kinds = r < 0.85 ? ["home"] : ["plaza"];
    else if (h < 8.5) kinds = this.role === "worker" ? ["work", "cafe"] : this.role === "athlete" ? ["park"] : ["plaza", "park"];
    else if (h < 12) kinds = this.role === "worker" ? ["work"] : this.role === "shopper" ? ["shop"] : this.role === "retiree" ? ["bench", "park"] : ["park", "plaza", "bench"];
    else if (h < 13.5) kinds = ["cafe", "bench", "plaza"];
    else if (h < 17) kinds = this.role === "worker" ? ["work"] : this.role === "student" ? ["park", "bench"] : ["shop", "plaza", "park"];
    else if (h < 20) kinds = w.matchOn && (this.role === "athlete" || r < 0.3) ? ["stands"] : r < 0.4 ? ["shop"] : r < 0.7 ? ["plaza", "bench"] : ["park"];
    else kinds = r < 0.5 ? ["home"] : ["plaza", "bench"];
    const place = pick(kinds) ?? pick(["plaza", "park", "bench"]);
    if (this.plan.place?.taken === this.id) this.plan.place.taken = null;
    if (place && (place.kind === "bench" || place.kind === "work" || place.kind === "stands")) place.taken = this.id;
    this.plan.place = place;
    this.plan.doing = "walk";
    this.plan.path = place ? w.graph.path(this.body.x, this.body.z, place.x, place.z) : [];
    this.plan.until = now + (40 + this.rng() * 80) * 1000;
    this.nextDecide = this.plan.until;
  }

  private arrive(now: number) {
    const p = this.plan.place;
    if (!p) return (this.plan.doing = "idle");
    this.plan.doing = p.kind === "bench" || p.kind === "stands" ? (p.kind === "stands" ? "watch" : "sit") : p.kind === "work" ? "work" : p.kind === "shop" ? "browse" : p.kind === "stop" ? "shelter" : p.kind === "home" ? "home" : "idle";
    this.ry = p.ry;
    this.plan.until = now + (p.kind === "work" ? 120 : p.kind === "home" ? 300 : 25 + this.rng() * 50) * 1000;
    this.nextDecide = this.plan.until;
  }

  // In a fight: knocked down, getting up (and giving up), running away, or coming at me with punches.
  private fighting(dt: number, w: World, now: number): BrainOut {
    const b = this.body;
    const f = this.fight!;
    const dx = w.me.x - b.x, dz = w.me.z - b.z, d = Math.hypot(dx, dz) || 1;
    const out = (speed: number, emote: string): BrainOut => ({ x: b.x, y: b.y, z: b.z, ry: this.ry, speed, sit: false, emote, visible: true, say: this.say });
    if (now < f.koUntil) return out(0, "ko");
    if (f.hp <= 0) {
      f.hp = 100;
      f.mad = false;
      f.fleeUntil = now + 7000;
      this.say = ["Okay, okay! You win.", "Ow. I give up.", "That's enough for me."][Math.floor(this.rng() * 3)]!;
      this.sayUntil = now + 3000;
    }
    // I left (far away), or they have run far enough: back to their day.
    if (d > 35 || (!f.mad && now > f.fleeUntil)) {
      this.fight = null;
      this.decide(w, now);
      return out(0, "");
    }
    if (!f.mad) {
      this.ry = Math.atan2(-dx, -dz);
      moveBody(w.ph, b, (-dx / d) * 3.6 * dt, (-dz / d) * 3.6 * dt, dt, 0);
      return out(0.9, "");
    }
    this.ry = Math.atan2(dx, dz);
    if (d > 1.05) {
      moveBody(w.ph, b, (dx / d) * 3.1 * dt, (dz / d) * 3.1 * dt, dt, 0);
      return out(0.75, "fight");
    }
    if (now > f.nextHit) {
      f.nextHit = now + 850 + this.rng() * 750;
      this.hitMe?.(6 + Math.floor(this.rng() * 8), this);
    }
    return out(0, now > f.nextHit - 300 || now < f.nextHit - 1300 ? "punch" : "fight");
  }

  // Start a chat with someone met on the way.
  startChat(o: NpcBrain, now: number) {
    if (this.chatWith || o.chatWith) return;
    this.chatWith = o;
    o.chatWith = this;
    const lines = [...SMALL_TALK[this.personality], ...SMALL_TALK[o.personality]].sort(() => this.rng() - 0.5).slice(0, 4);
    this.chatLines = lines;
    o.chatLines = [];
    this.chatAt = o.chatAt = now;
  }
  private endChat() {
    const o = this.chatWith;
    this.chatWith = null;
    if (o) o.chatWith = null;
  }

  update(dt: number, w: World, now: number): BrainOut {
    const b = this.body;
    let speed = 0;
    let emote = "";
    if (this.say && now > this.sayUntil) this.say = null;
    if (this.fight) return this.fighting(dt, w, now);
    if (this.social) {
      if (now > this.social.until) this.social = null;
      else return { x: b.x, y: b.y, z: b.z, ry: Math.atan2(w.me.x - b.x, w.me.z - b.z), speed: 0, sit: false, emote: this.social.emote, visible: true, say: this.say };
    }
    // A chat: face each other, take turns, part after a few lines.
    if (this.chatWith) {
      const o = this.chatWith;
      this.ry = Math.atan2(o.body.x - b.x, o.body.z - b.z);
      const k = Math.floor((now - this.chatAt) / 3500);
      if (this.chatLines.length) {
        if (k >= this.chatLines.length) this.endChat();
        else {
          const speaker = k % 2 === 0 ? this : o;
          speaker.say = this.chatLines[k]!;
          speaker.sayUntil = now + 3200;
        }
      }
      return { x: b.x, y: b.y, z: b.z, ry: this.ry, speed: 0, sit: false, emote: this.say ? "talk" : "", visible: true, say: this.say };
    }
    if (now > this.nextDecide || (!this.plan.place && this.plan.doing !== "walk")) this.decide(w, now);
    const meD = Math.hypot(w.me.x - b.x, w.me.z - b.z);
    if (this.plan.doing === "walk") {
      const tgt = this.plan.path[0];
      if (!tgt) this.arrive(now);
      else {
        const dx = tgt.x - b.x, dz = tgt.z - b.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.6) this.plan.path.shift();
        else {
          // Keep a little apart from others and from me.
          let sx = 0, sz = 0;
          for (const o of w.others) {
            if (o === this) continue;
            const ox = b.x - o.body.x, oz = b.z - o.body.z;
            const od = Math.hypot(ox, oz);
            if (od > 0.01 && od < 1.2) (sx += (ox / od) * (1.2 - od)), (sz += (oz / od) * (1.2 - od));
          }
          if (meD < 1.3 && meD > 0.01) (sx += ((b.x - w.me.x) / meD) * 1.2), (sz += ((b.z - w.me.z) / meD) * 1.2);
          const sp = (this.role === "athlete" ? 2.6 : w.raining ? 1.9 : 1.35) * (this.personality === "serious" || this.personality === "professional" ? 1.1 : 1);
          const vx = (dx / d) * sp + sx, vz = (dz / d) * sp + sz;
          moveBody(w.ph, b, vx * dt, vz * dt, dt, 0);
          this.ry = Math.atan2(vx, vz);
          speed = sp > 2 ? 0.7 : 0.45;
          // Stuck (a wall in the way): try the next point, then think again.
          if (Math.hypot(b.x - this.plan.lastX, b.z - this.plan.lastZ) < 0.05 * dt * 60) this.plan.stuck += dt;
          else this.plan.stuck = 0;
          this.plan.lastX = b.x;
          this.plan.lastZ = b.z;
          if (this.plan.stuck > 1.5) {
            this.plan.path.shift();
            this.plan.stuck = 0;
            if (!this.plan.path.length) this.arrive(now);
          }
          // Meet someone walking the other way: maybe stop for a chat (talkative and friendly people more often).
          const social = { talkative: 0.5, friendly: 0.35, funny: 0.3, curious: 0.25, helpful: 0.2, competitive: 0.15, professional: 0.08, serious: 0.05, shy: 0.02 }[this.personality];
          for (const o of w.others) {
            if (o === this || o.chatWith || o.plan.doing === "home" || this.rng() > social * dt * 0.5) continue;
            if (Math.hypot(o.body.x - b.x, o.body.z - b.z) < 2.2) this.startChat(o, now);
          }
        }
      }
    }
    // React to me: look, wave, say hello (once in a while); shy people glance away.
    let lookAtMe = false;
    if (meD < 5 && this.plan.doing !== "home") {
      if (this.personality === "shy") this.ry = Math.atan2(b.x - w.me.x, b.z - w.me.z);
      else {
        lookAtMe = this.plan.doing !== "walk";
        if (now - this.greetedAt > 45000 && meD < 3.5) {
          this.greetedAt = now;
          emote = "wave";
          const hello: Record<Personality, string> = { friendly: "Hi there!", shy: "", talkative: "Oh hello! Lovely day, isn't it?", professional: "Good day.", curious: "Hello! Where are you off to?", funny: "Hey! Nice shoes.", helpful: "Hello! Need a hand finding anything?", competitive: "Ready to lose at penalties?", serious: "Hello." };
          if (hello[this.personality]) (this.say = hello[this.personality]), (this.sayUntil = now + 3000);
        }
      }
    }
    if (lookAtMe) this.ry = Math.atan2(w.me.x - b.x, w.me.z - b.z);
    const p = this.plan.place;
    const sit = (this.plan.doing === "sit" || this.plan.doing === "watch" || this.plan.doing === "work") && !!p && Math.hypot(p.x - b.x, p.z - b.z) < 1.2;
    if (sit && p) (b.x = p.x), (b.z = p.z), (b.y = p.y);
    if (this.plan.doing === "browse") emote = emote || "interact";
    if (this.plan.doing === "watch" && w.matchOn && this.rng() < 0.002) emote = "cheer";
    return { x: b.x, y: b.y, z: b.z, ry: this.ry, speed, sit, emote: emote || (this.say ? "talk" : ""), visible: this.plan.doing !== "home", say: this.say };
  }
}

// A small seeded random generator, so a person's life is the same every visit.
export function seeded(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export const TOWNFOLK: { name: string; personality: Personality; role: Role; person: string }[] = [
  { name: "Saba", personality: "friendly", role: "shopper", person: "rb_f04" },
  { name: "Yonas", personality: "talkative", role: "worker", person: "rb_m05" },
  { name: "Meron", personality: "curious", role: "student", person: "rb_f08" },
  { name: "Kebede", personality: "serious", role: "retiree", person: "rb_m12" },
  { name: "Tsion", personality: "funny", role: "shopper", person: "rb_f12" },
  { name: "Ben", personality: "competitive", role: "athlete", person: "rb_m08" },
  { name: "Liya", personality: "helpful", role: "worker", person: "rb_f01" },
  { name: "Abel", personality: "shy", role: "student", person: "rb_m01" },
  { name: "Ruth", personality: "professional", role: "worker", person: "rb_f08" },
  { name: "Dawit", personality: "friendly", role: "retiree", person: "rb_m12" },
  { name: "Hiwot", personality: "talkative", role: "shopper", person: "rb_f04" },
  { name: "Samuel", personality: "competitive", role: "athlete", person: "rb_m05" },
  { name: "Selam", personality: "curious", role: "student", person: "rb_f12" },
  { name: "Elias", personality: "funny", role: "worker", person: "rb_m01" },
  { name: "Mahlet", personality: "helpful", role: "shopper", person: "rb_f01" },
  { name: "Nahom", personality: "serious", role: "worker", person: "rb_m08" },
];

export const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
