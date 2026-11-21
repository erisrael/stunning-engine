import * as THREE from "three";
import type { ActCtx, Activity } from "./activities";
import { Character } from "./character";
import { PITCH, type Soccer } from "./soccer";
import { cleanLook } from "@/lib/fun-catalog";

// A five-a-side match on the stadium pitch (the way the mobile and console football games play): you and four
// team mates (Teal, attacking east) against five (Gold), a keeper on each side. Bots hold their places and shift
// with the ball; the nearest goes for it; with the ball they dribble towards goal, pass when pressed and shoot in
// range. You: walk into the ball to dribble, E passes to the best team mate in front, F lobs it forward, hold the
// mouse and let go to shoot (where you face), Q tackles. Five minutes of match time; goals restart from the centre.

type P = { id: string; team: 0 | 1; role: "gk" | "def" | "mid" | "wing" | "fwd"; home: { x: number; z: number }; x: number; z: number; ry: number; av: Character; cool: number };
const LOOKS = ["kai", "mei", "aoi", "shibu", "bibi", "vita", "shino", "victoria", "fumiriya"];
const MID_X = (PITCH.x0 + PITCH.x1) / 2;
const HALF = (PITCH.x1 - PITCH.x0) / 2;

export class FootballMatch implements Activity {
  kind = "match";
  readonly walks = true;
  private bots: P[] = [];
  private score: [number, number] = [0, 0];
  private clock = 300;
  private drawAt = 0;
  private resetAt = 0;
  private msg = "Kick off!";
  private keys = (e: KeyboardEvent) => {
    if (e.type !== "keydown" || e.repeat || (e.target as HTMLElement)?.closest?.("input, textarea")) return;
    const k = e.key.toLowerCase();
    if (k === "e") this.pass(false);
    else if (k === "f") this.pass(true);
    else if (k === "q") this.tackle();
  };
  constructor(private c: ActCtx, private s: Soccer, private heading: () => number, private level: number) {
    s.onGoal = null;
    const roles: P["role"][] = ["gk", "def", "mid", "wing", "fwd"];
    // Home spots (as a fraction of the half from my goal): keeper, defender, midfielder, winger, forward.
    const spot: Record<P["role"], [number, number]> = { gk: [0.03, 0], def: [0.3, -0.25], mid: [0.55, 0.2], wing: [0.75, -0.6], fwd: [0.9, 0.35] };
    let n = 0;
    for (const team of [0, 1] as const)
      for (const role of roles) {
        if (team === 0 && role === "mid") continue; // that place is mine
        const [fx, fz] = spot[role];
        const x = team === 0 ? PITCH.x0 + fx * HALF : PITCH.x1 - fx * HALF, z = PITCH.cz + fz * (PITCH.z1 - PITCH.cz) * (team === 0 ? 1 : -1);
        const look = { ...cleanLook({}), style: "anime" as const, base: LOOKS[n % LOOKS.length]!, tintClothes: true, shirt: role === "gk" ? (team ? "#16a34a" : "#7c3aed") : team ? "#eab308" : "#0d9488", pants: "#1f2937", shoes: "#111827" };
        const av = new Character(look, true);
        av.setDetailed(true);
        c.scene.add(av.root);
        this.bots.push({ id: `m${n}`, team, role, home: { x, z }, x, z, ry: team ? -Math.PI / 2 : Math.PI / 2, av, cool: 0 });
        n++;
      }
    window.addEventListener("keydown", this.keys);
    this.kickoff();
  }
  private kickoff() {
    this.s.reset();
    this.s.setState({ x: MID_X, y: 0.3, z: PITCH.cz, vx: 0, vy: 0, vz: 0 });
    for (const b of this.bots) (b.x = b.home.x), (b.z = b.home.z);
  }
  private me() {
    return this.c.me();
  }
  // Pass: to the team mate most in front of me (and open); a lob goes long and high.
  private pass(lob: boolean) {
    const m = this.me(), h = this.heading();
    const fx = Math.sin(h), fz = Math.cos(h);
    const mates = this.bots.filter((b) => b.team === 0 && b.role !== "gk");
    let best: P | null = null, bs = -Infinity;
    for (const b of mates) {
      const dx = b.x - m.x, dz = b.z - m.z, d = Math.hypot(dx, dz) || 1;
      const s = ((dx * fx + dz * fz) / d) * 2 - d / 30 + (b.x - m.x) / 40;
      if (s > bs) (bs = s), (best = b);
    }
    if (!best) return;
    const dx = best.x + 2 - m.x, dz = best.z - m.z, d = Math.hypot(dx, dz);
    if (this.s.kick(m.x, m.z, Math.atan2(dx, dz), lob ? Math.min(20, 8 + d * 0.5) : Math.min(22, 6 + d * 0.75), lob ? 0.55 : 0.05)) this.c.sound("shoot");
  }
  private tackle() {
    const m = this.me();
    const b = this.s.pos;
    if (Math.hypot(b.x - m.x, b.z - m.z) < 2.4) this.s.kick(b.x - Math.sin(this.heading()) * 0.5, b.z - Math.cos(this.heading()) * 0.5, this.heading(), 9, 0.05);
  }
  down() {
    this.drawAt = performance.now();
  }
  up() {
    if (!this.drawAt) return;
    const p = Math.min(1, (performance.now() - this.drawAt) / 900);
    this.drawAt = 0;
    const m = this.me();
    if (this.s.kick(m.x, m.z, this.heading(), 12 + p * 18, 0.08 + p * 0.12, (Math.random() - 0.5) * 0.4)) this.c.sound("shoot");
  }
  update(dt: number, t: number) {
    const now = performance.now();
    const ball = this.s.pos;
    const m = this.me();
    if (now > this.resetAt) this.clock -= dt;
    // Goals: the whole ball over a goal line between the posts.
    if (now > this.resetAt && Math.abs(ball.z - PITCH.cz) < PITCH.goalW / 2 && ball.y < PITCH.goalH && (ball.x < PITCH.x0 - 0.3 || ball.x > PITCH.x1 + 0.3)) {
      const mine = ball.x > PITCH.x1;
      this.score[mine ? 0 : 1]++;
      this.msg = mine ? "GOAL! Teal scores" : "Gold scores";
      this.c.sound(mine ? "win" : "miss");
      this.resetAt = now + 2500;
      setTimeout(() => this.kickoff(), 2400);
    }
    // The bots.
    const skill = 0.85 + this.level * 0.07;
    const chaser = (team: 0 | 1) => {
      let best: P | null = null, bd = Infinity;
      for (const b of this.bots) if (b.team === team && b.role !== "gk") {
        const d = Math.hypot(b.x - ball.x, b.z - ball.z);
        if (d < bd) (bd = d), (best = b);
      }
      // On my team, I go for it when I am nearest.
      if (team === 0 && Math.hypot(m.x - ball.x, m.z - ball.z) < bd) return null;
      return best;
    };
    const ch = [chaser(0), chaser(1)];
    for (const b of this.bots) {
      const goalX = b.team === 0 ? PITCH.x1 : PITCH.x0, ownX = b.team === 0 ? PITCH.x0 : PITCH.x1;
      const dir = b.team === 0 ? 1 : -1;
      let tx: number, tz: number, sp = 4.6 * skill;
      if (b.role === "gk") {
        tx = ownX + dir * 0.8;
        tz = PITCH.cz + Math.max(-2.8, Math.min(2.8, (ball.z - PITCH.cz) * 0.6));
        if (Math.hypot(ball.x - ownX, ball.z - PITCH.cz) < 9) (tx = ball.x), (tz = ball.z), (sp = 5.5);
      } else if (b === ch[b.team]) {
        // Get behind the ball (between it and their own goal) to play it forward.
        tx = ball.x - dir * 0.7;
        tz = ball.z;
        sp = 6.2 * skill;
      } else {
        // Hold the place, shifted with the ball.
        tx = b.home.x + (ball.x - MID_X) * 0.55;
        tz = b.home.z + (ball.z - PITCH.cz) * 0.3;
      }
      const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
      const moving = d > 0.3;
      if (moving) {
        const k = Math.min(d, sp * dt) / d;
        b.x = Math.max(PITCH.x0 - 0.5, Math.min(PITCH.x1 + 0.5, b.x + dx * k));
        b.z = Math.max(PITCH.z0 + 0.5, Math.min(PITCH.z1 - 0.5, b.z + dz * k));
        b.ry = Math.atan2(dx, dz);
      }
      // With the ball at their feet: shoot in range, pass when pressed, dribble on.
      b.cool -= dt;
      const bd = Math.hypot(ball.x - b.x, ball.z - b.z);
      if (bd < 1.2 && b.cool <= 0 && ball.y < 0.8 && now > this.resetAt) {
        b.cool = 0.35;
        const toGoal = Math.abs(goalX - b.x);
        const foes = this.bots.filter((o) => o.team !== b.team).map((o) => ({ x: o.x, z: o.z })).concat(b.team === 1 ? [{ x: m.x, z: m.z }] : []);
        const pressed = foes.some((o) => Math.hypot(o.x - b.x, o.z - b.z) < 2.4);
        if (b.role === "gk") this.s.kick(b.x, b.z, Math.atan2(dir * 20, (Math.random() - 0.5) * 20), 17, 0.35);
        else if (toGoal < 17 * skill) {
          const aimZ = PITCH.cz + (Math.random() < 0.5 ? -1 : 1) * (PITCH.goalW / 2 - 0.6) * Math.random();
          this.s.kick(b.x, b.z, Math.atan2(goalX - b.x, aimZ - b.z), 16 + 8 * skill, 0.1 + Math.random() * 0.08);
        } else if (pressed) {
          const mates = this.bots.filter((o) => o.team === b.team && o !== b && o.role !== "gk").concat(b.team === 0 ? [] : []);
          const to = mates.sort((p, q) => dir * (q.x - p.x))[0];
          const tgt = b.team === 0 && Math.random() < 0.5 ? { x: m.x, z: m.z } : to ? { x: to.x, z: to.z } : { x: goalX, z: PITCH.cz };
          const pd = Math.hypot(tgt.x - b.x, tgt.z - b.z);
          this.s.kick(b.x, b.z, Math.atan2(tgt.x - b.x, tgt.z - b.z), Math.min(20, 6 + pd * 0.7), 0.05);
        } else this.s.kick(b.x, b.z, Math.atan2(goalX - b.x, PITCH.cz - b.z + (Math.random() - 0.5) * 8), 4.2, 0.02);
      }
      this.s.setPlayer(b.id, b.x, 0, b.z);
      b.av.root.position.set(b.x, 0, b.z);
      b.av.root.rotation.y = b.ry;
      b.av.update(t, dt, { speed: moving ? (sp > 5 ? 0.85 : 0.55) : 0, air: false, sit: false, drive: false, crouch: false, emote: "" }, null);
    }
    const mm = Math.max(0, Math.ceil(this.clock));
    this.c.hud({ title: `Five-a-side · Teal ${this.score[0]} : ${this.score[1]} Gold`, line: now < this.resetAt ? this.msg : `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")} · E pass · F lob · hold the mouse to shoot · Q tackle`, score: this.score[0], left: `${Math.floor(mm / 60)}:${String(mm % 60).padStart(2, "0")}`, hint: "Esc pauses" });
    if (this.clock <= 0) {
      const [a, b] = this.score;
      this.clock = 1e9;
      this.c.done("match", a, a > b ? 6 : a === b ? 3 : 1, a > b ? `You won ${a} to ${b}` : a === b ? `A draw, ${a} all` : `You lost ${a} to ${b}`);
    }
  }
  stop() {
    window.removeEventListener("keydown", this.keys);
    for (const b of this.bots) (this.c.scene.remove(b.av.root), this.s.dropPlayer(b.id), b.av.dispose?.());
    this.s.reset();
    this.c.hud(null);
  }
}
