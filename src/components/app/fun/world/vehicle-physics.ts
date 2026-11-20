import type { Physics } from "./engine";
import type { CarSpec } from "./cars";

// Driving that feels like the car: a bicycle model (front and rear axle) with tyre slip angles and a tyre curve
// that saturates (grip runs out and the car slides), weight moving to the back when accelerating and to the front
// when braking, an engine with a torque curve, a gearbox (automatic, or manual with the shift keys), drive to the
// rear, front or all wheels with wheelspin when there is more torque than grip, a handbrake for drifts, drag and
// downforce, less grip in the rain and on grass, and damage that saps power. A light hatchback and a heavy SUV
// differ in every number (see SPECS). Runs in small fixed steps so it is the same at any frame rate.

export type CarState = {
  x: number;
  z: number;
  y: number;
  heading: number;
  vx: number;
  vz: number;
  yawRate: number;
  rpm: number;
  gear: number; // -1 reverse, 1.. forward
  steer: number; // -1..1 smoothed
  wheelSpin: number;
  condition: number; // 100 new .. 0 wrecked
  pitch: number;
  roll: number;
  slip: number; // how much the rear is sliding (for tyre noise and smoke)
  shiftAt: number;
  manual: boolean;
};
export type CarInput = { throttle: number; brake: number; steer: number; handbrake: boolean; shift?: -1 | 0 | 1 };
export type CarEnv = { grip: number; offRoad: boolean; time: number };
export type Tuning = { engine: number; brakes: number; tyres: number; suspension: number; gearbox: number };
export const NO_TUNING: Tuning = { engine: 0, brakes: 0, tyres: 0, suspension: 0, gearbox: 0 };

export function newCarState(x: number, z: number, heading: number): CarState {
  return { x, z, y: 0, heading, vx: 0, vz: 0, yawRate: 0, rpm: 900, gear: 1, steer: 0, wheelSpin: 0, condition: 100, pitch: 0, roll: 0, slip: 0, shiftAt: 0, manual: false };
}

export const speedOf = (s: CarState) => s.vx * Math.sin(s.heading) + s.vz * Math.cos(s.heading);

const G = 9.81;
// Tyre force for a slip angle: rises, peaks near 0.1 rad, then falls a little (a simple Pacejka curve).
const tyre = (alpha: number, load: number, mu: number) => -mu * load * Math.sin(1.35 * Math.atan(10 * alpha));

function torqueAt(spec: CarSpec, rpm: number) {
  const r = rpm / spec.redline;
  const curve = r < 0.15 ? 0.55 : r < 0.55 ? 0.55 + ((r - 0.15) / 0.4) * 0.45 : r < 0.8 ? 1 : 1 - (r - 0.8) * 0.75;
  const t = spec.torque * curve;
  // Never more than the engine's power allows at this speed.
  const cap = (spec.power * 1000) / Math.max(1, (rpm * 2 * Math.PI) / 60);
  return Math.min(t, cap);
}

// One frame of driving; returns the impact speed when the car hit something (0 otherwise).
export function stepCar(ph: Physics, s: CarState, spec: CarSpec, input: CarInput, env: CarEnv, dt: number, len: number, r: number, tune: Tuning = NO_TUNING): number {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  let impact = 0;
  const m = spec.mass;
  const wb = spec.wheelbase;
  const a = wb * 0.5, b = wb * 0.5;
  const Iz = m * (wb * wb) * 0.3;
  const power = (1 + tune.engine * 0.1) * (s.condition < 50 ? 0.55 + s.condition / 110 : 1);
  const brakeK = 1 + tune.brakes * 0.12;
  const mu = spec.grip * (1 + tune.tyres * 0.04) * env.grip * (env.offRoad ? 0.62 : 1);
  const cg = spec.cg * (1 - tune.suspension * 0.05);
  // Steering: quicker at low speed, narrower at high speed (as real racks feel).
  s.steer += (input.steer - s.steer) * Math.min(1, dt * 6);
  for (let i = 0; i < n; i++) {
    const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
    const rx = Math.cos(s.heading), rz = -Math.sin(s.heading);
    let vLong = s.vx * fx + s.vz * fz;
    let vLat = s.vx * rx + s.vz * rz;
    const speed = Math.abs(vLong);
    const delta = s.steer * spec.steer * (1 / (1 + speed * speed * 0.0006));
    // Gear: reverse when stopped and pulling back; automatic shifts on the rev range.
    if (s.gear > 0 && input.throttle < 0 && vLong < 0.6) s.gear = -1;
    if (s.gear < 0 && input.throttle > 0 && vLong > -0.6) s.gear = 1;
    const ratio = s.gear < 0 ? spec.gears[0]! * 1.1 : spec.gears[Math.min(spec.gears.length, s.gear) - 1]!;
    const wheelRpm = (speed / spec.wheelR) * (60 / (2 * Math.PI));
    s.rpm = Math.max(900, Math.min(spec.redline * 1.02, wheelRpm * ratio * spec.final));
    const shiftDelay = 0.25 - tune.gearbox * 0.05;
    if (s.gear > 0 && env.time > s.shiftAt) {
      if (!s.manual) {
        if (s.rpm > spec.redline * 0.93 && s.gear < spec.gears.length) (s.gear++, (s.shiftAt = env.time + shiftDelay));
        else if (s.rpm < spec.redline * 0.42 && s.gear > 1) (s.gear--, (s.shiftAt = env.time + shiftDelay));
      } else if (input.shift) {
        s.gear = Math.max(1, Math.min(spec.gears.length, s.gear + input.shift));
        s.shiftAt = env.time + shiftDelay;
      }
    }
    // Loads on each axle: static, weight transfer from the last acceleration (pitch), downforce.
    const down = spec.downforce * vLong * vLong;
    const transfer = (s.pitch * m * G * cg) / wb;
    const Nf = Math.max(0, (m * G * b) / wb + down * 0.45 - transfer);
    const Nr = Math.max(0, (m * G * a) / wb + down * 0.55 + transfer);
    // Engine force at the driven wheels, limited by their grip (wheelspin beyond).
    const throttle = Math.max(0, input.throttle * (s.gear < 0 ? -1 : 1)) * (env.time < s.shiftAt ? 0.3 : 1);
    let drive = (torqueAt(spec, s.rpm) * power * ratio * spec.final * 0.88 * Math.abs(throttle)) / spec.wheelR;
    if (s.gear < 0) drive = -drive * (input.throttle < 0 ? 1 : 0);
    else if (input.throttle < 0) drive = 0;
    const drivenN = spec.drive === "rwd" ? Nr : spec.drive === "fwd" ? Nf : Nf + Nr;
    const tractionLimit = mu * drivenN;
    let spin = 0;
    if (Math.abs(drive) > tractionLimit) {
      spin = Math.min(1, (Math.abs(drive) - tractionLimit) / tractionLimit);
      drive = Math.sign(drive) * tractionLimit * 0.92;
    }
    // Brakes (and the brake key while moving forward), rolling resistance, air.
    const braking = (input.brake + (input.throttle < 0 && vLong > 0.6 ? -input.throttle : 0)) * spec.brake * brakeK * (m / 1000);
    const brakeF = Math.min(braking, mu * (Nf + Nr)) * Math.sign(vLong);
    const roll = (env.offRoad ? 0.06 : 0.015) * m * G * Math.sign(vLong) * Math.min(1, speed);
    const drag = spec.drag * vLong * Math.abs(vLong);
    // Tyres: slip angles at each axle; the handbrake and wheelspin take grip from the rear.
    let Ff = 0, Fr = 0;
    if (speed > 1.2) {
      const af = Math.atan2(vLat + s.yawRate * a, speed) - delta * Math.sign(vLong);
      const ar = Math.atan2(vLat - s.yawRate * b, speed);
      const rearGrip = mu * (input.handbrake ? 0.35 : 1) * (spec.drive !== "fwd" ? 1 - spin * 0.55 : 1);
      Ff = tyre(af, Nf, mu);
      Fr = tyre(ar, Nr, rearGrip);
      s.slip = Math.min(1, Math.abs(ar) * 4 + spin * 0.6 + (input.handbrake ? 0.4 : 0));
    } else {
      // Parking speed: the car follows its wheels.
      s.yawRate = (vLong * Math.tan(delta)) / wb;
      vLat *= 0.6;
      s.slip = spin * 0.5;
    }
    const hb = input.handbrake ? 0.8 * m * G * 0.5 * Math.sign(vLong) : 0;
    const longF = drive - brakeF - roll - drag - hb - Ff * Math.sin(delta);
    const aLong = longF / m;
    const aLat = (Ff * Math.cos(delta) + Fr) / m;
    vLong += aLong * h;
    // Brakes and friction stop the car; they never push it backwards.
    if (Math.sign(vLong) !== Math.sign(vLong - aLong * h) && Math.abs(drive) < 1 && Math.abs(vLong) < 0.5) vLong = 0;
    vLat += (aLat - vLong * s.yawRate) * h;
    if (speed > 1.2) s.yawRate += ((a * Ff * Math.cos(delta) - b * Fr) / Iz) * h;
    s.yawRate *= 1 - Math.min(1, h * 0.8);
    s.heading += s.yawRate * h;
    // Springs: the body pitches with braking and acceleration and rolls in corners.
    s.pitch += (-aLong / G - s.pitch) * Math.min(1, h * 6);
    s.roll += ((aLat / G) * cg - s.roll) * Math.min(1, h * 6);
    const nfx = Math.sin(s.heading), nfz = Math.cos(s.heading), nrx = Math.cos(s.heading), nrz = -Math.sin(s.heading);
    s.vx = nfx * vLong + nrx * vLat;
    s.vz = nfz * vLong + nrz * vLat;
    // Move, keeping out of walls with two circles (front and back); a hit bounces and damages.
    const nx = s.x + s.vx * h, nz = s.z + s.vz * h;
    const off = len / 2 - r;
    const front = { x: nx + nfx * off, z: nz + nfz * off }, back = { x: nx - nfx * off, z: nz - nfz * off };
    const h1 = ph.resolve(front, r, s.y, 1.4, 0.35, true), h2 = ph.resolve(back, r, s.y, 1.4, 0.35, true);
    if (h1 || h2) {
      const v = Math.hypot(s.vx, s.vz);
      impact = Math.max(impact, v);
      s.x = (front.x + back.x) / 2;
      s.z = (front.z + back.z) / 2;
      const k = v > 4 ? -0.25 : 0.3;
      s.vx *= k;
      s.vz *= k;
      s.yawRate *= 0.3;
      if (v > 3) s.condition = Math.max(0, s.condition - v * 1.4);
    } else {
      s.x = nx;
      s.z = nz;
    }
    s.wheelSpin += (vLong / spec.wheelR) * h + spin * h * 30;
  }
  s.y = ph.groundAt(s.x, s.z, r * 0.5, s.y, 0.4);
  return impact;
}
