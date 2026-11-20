import * as THREE from "three";
import { setNight, WORLD_UNIFORMS } from "./pbr";

// The sky, the time of day and the weather. Everyone sees the same: the clock and the weather come from the real
// time (a town day lasts DAY_MINUTES real minutes; the weather changes every slot, picked from the slot number), so
// no server message is needed. The sky is a physically based scattering shader (Preetham) with clouds, stars and the
// moon; it also lights the town (an environment map rebuilt as the sun moves). Rain falls around the camera, wets
// the roads (darker, glossy), fogs the distance, and makes cars slide more (Atmosphere.grip). Storms flash.

export const DAY_MINUTES = 48;
const SLOT_MINUTES = 12;
export type Weather = "clear" | "cloudy" | "rain" | "fog" | "storm";
export const WEATHER_LABEL: Record<Weather, string> = { clear: "Clear", cloudy: "Cloudy", rain: "Rain", fog: "Fog", storm: "Storm" };

// Town time in hours (0-24) for a moment, shared by everyone.
export function townHours(now = Date.now(), offset = 0) {
  const dayMs = DAY_MINUTES * 60_000;
  // Start the cycle in the morning at a fixed epoch, so the time is the same in every browser.
  return (((now + offset) % dayMs) / dayMs) * 24;
}

function weatherOfSlot(slot: number): Weather {
  // A small hash of the slot: clear most often, then clouds, rain, fog, storms.
  let h = (slot * 2654435761) >>> 0;
  h ^= h >>> 15;
  const r = (h % 1000) / 1000;
  return r < 0.38 ? "clear" : r < 0.62 ? "cloudy" : r < 0.8 ? "rain" : r < 0.9 ? "fog" : "storm";
}
export function townWeather(now = Date.now()) {
  const slot = Math.floor(now / (SLOT_MINUTES * 60_000));
  const into = (now / (SLOT_MINUTES * 60_000)) % 1;
  return { now: weatherOfSlot(slot), next: weatherOfSlot(slot + 1), into };
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

// Preetham daylight (as in three's Sky example) plus clouds (fbm), stars and a moon, in one pass.
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 sunDir;
uniform float rayleigh;
uniform float turbidity;
uniform float mieCoefficient;
uniform float mieDirectionalG;
uniform float cover;
uniform float dark;
uniform float time;
uniform float night;
uniform float exposure;
const vec3 up = vec3(0.0, 1.0, 0.0);
const float e = 2.71828182845904523536028747135266249775724709369995957;
const float pi = 3.141592653589793238462643383279502884197169;
const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
const float cutoffAngle = 1.6110731556870734;
const float steepness = 1.5;
const float EE = 1000.0;
const float rayleighZenithLength = 8.4E3;
const float mieZenithLength = 1.25E3;
const float sunAngularDiameterCos = 0.999956676946448443553574619906976478926848692873900859324;
const float THREE_OVER_SIXTEENPI = 0.05968310365946075;
const float ONE_OVER_FOURPI = 0.07957747154594767;
float sunIntensity(float zenithAngleCos) {
  zenithAngleCos = clamp(zenithAngleCos, -1.0, 1.0);
  return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zenithAngleCos)) / steepness)));
}
vec3 totalMie(float T) {
  float c = (0.2 * T) * 10E-18;
  return 0.434 * c * MieConst;
}
float rayleighPhase(float cosTheta) { return THREE_OVER_SIXTEENPI * (1.0 + pow(cosTheta, 2.0)); }
float hgPhase(float cosTheta, float g) {
  float g2 = pow(g, 2.0);
  float inverse = 1.0 / pow(1.0 - 2.0 * g * cosTheta + g2, 1.5);
  return ONE_OVER_FOURPI * ((1.0 - g2) * inverse);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec3 dir = normalize(vDir);
  float sunE = sunIntensity(dot(sunDir, up));
  float sunfade = 1.0 - clamp(1.0 - exp((sunDir.y * 450000.0) / 450000.0), 0.0, 1.0);
  float rayleighCoefficient = rayleigh - (1.0 * (1.0 - sunfade));
  vec3 betaR = totalRayleigh * rayleighCoefficient;
  vec3 betaM = totalMie(turbidity) * mieCoefficient;
  float zenithAngle = acos(max(0.0, dot(up, dir)));
  float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
  float sR = rayleighZenithLength * inverse;
  float sM = mieZenithLength * inverse;
  vec3 Fex = exp(-(betaR * sR + betaM * sM));
  float cosTheta = dot(dir, sunDir);
  vec3 betaRTheta = betaR * rayleighPhase(cosTheta * 0.5 + 0.5);
  vec3 betaMTheta = betaM * hgPhase(cosTheta, mieDirectionalG);
  vec3 Lin = pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * (1.0 - Fex), vec3(1.5));
  Lin *= mix(vec3(1.0), pow(sunE * ((betaRTheta + betaMTheta) / (betaR + betaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, sunDir), 5.0), 0.0, 1.0));
  vec3 L0 = vec3(0.1) * Fex;
  float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
  L0 += (sunE * 19000.0 * Fex) * sundisk * (1.0 - cover * 0.9);
  vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
  vec3 col = pow(texColor, vec3(1.0 / (1.2 + (1.2 * sunfade))));
  // Night: deep blue, stars, the moon opposite the sun.
  vec3 nightSky = mix(vec3(0.012, 0.02, 0.05), vec3(0.03, 0.05, 0.1), pow(1.0 - max(dir.y, 0.0), 3.0));
  col = mix(col, nightSky, night);
  if (dir.y > 0.0) {
    vec2 sp = dir.xz / (dir.y + 0.15) * 260.0;
    float s = step(0.9975, hash(floor(sp))) * (0.6 + 0.4 * sin(time * 2.0 + hash(floor(sp)) * 30.0));
    col += vec3(s) * night * (1.0 - cover) * smoothstep(0.0, 0.25, dir.y);
    vec3 moonDir = normalize(-sunDir + vec3(0.2, 0.1, 0.0));
    float m = smoothstep(0.9993, 0.9996, dot(dir, moonDir));
    col += vec3(0.9, 0.92, 1.0) * m * night * (1.0 - cover * 0.8);
    col += vec3(0.25, 0.28, 0.35) * pow(max(dot(dir, moonDir), 0.0), 60.0) * night * 0.4;
  }
  // Clouds: a layer of fbm noise moving with the wind, lit by the sun and darker in storms.
  if (dir.y > 0.0) {
    vec2 cp = dir.xz / (dir.y + 0.08) * 1.4 + vec2(time * 0.012, time * 0.006);
    float n = fbm(cp) * 0.75 + fbm(cp * 2.7 + 11.0) * 0.35;
    float c = smoothstep(1.0 - cover * 0.95, 1.25 - cover * 0.6, n + cover * 0.25);
    vec3 lit = mix(vec3(1.0, 0.98, 0.95), vec3(1.0, 0.72, 0.5), clamp(1.0 - sunDir.y * 4.0, 0.0, 1.0));
    vec3 cloudCol = mix(lit, vec3(0.42, 0.45, 0.5), dark) * mix(1.0, 0.08, night);
    float fade = smoothstep(0.0, 0.18, dir.y);
    col = mix(col, cloudCol * (0.75 + 0.25 * pow(max(dot(dir, sunDir), 0.0), 8.0)), c * fade * 0.92);
  }
  // Overcast: the whole sky greys out.
  col = mix(col, mix(vec3(0.62, 0.65, 0.7), vec3(0.06, 0.07, 0.09), night) * (1.0 - dark * 0.45), cover * cover * 0.55);
  // Below the horizon: the haze colour, so the edge of the world never shows.
  col = mix(col, col * 0.85, smoothstep(0.0, -0.1, dir.y));
  gl_FragColor = vec4(col * exposure, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export type AtmosphereOpts = { quality: "low" | "medium" | "high" | "ultra"; view: number; lights: number };

export class Atmosphere {
  readonly dome: THREE.Mesh;
  private uni: Record<string, THREE.IUniform>;
  private pmrem: THREE.PMREMGenerator | null = null;
  private envScene = new THREE.Scene();
  private envDome: THREE.Mesh;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private envAt = -1;
  private rain: THREE.LineSegments | null = null;
  private rainU: Record<string, THREE.IUniform> | null = null;
  private flash = 0;
  private nextFlash = 0;
  private pointLights: THREE.PointLight[] = [];
  private lampSpots: THREE.Vector3[] = [];
  private lampTick = 0;
  hours = 12;
  weather: Weather = "clear";
  // 0 dry .. 1 soaked; dries slowly after the rain.
  wet = 0;
  night = 0;
  rainAmount = 0;
  fogAmount = 0;
  wind = new THREE.Vector2(1, 0.3);
  // Admin or a player's settings can pin the time or the weather (null: follow the town).
  pinHours: number | null = null;
  pinWeather: Weather | null = null;
  onThunder: ((volume: number) => void) | null = null;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    private sun: THREE.DirectionalLight,
    private hemi: THREE.HemisphereLight,
    private o: AtmosphereOpts,
  ) {
    this.uni = {
      sunDir: { value: new THREE.Vector3(0, 1, 0) },
      rayleigh: { value: 2 },
      turbidity: { value: 6 },
      mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 },
      cover: { value: 0.2 },
      dark: { value: 0 },
      time: { value: 0 },
      night: { value: 0 },
      exposure: { value: 0.42 },
    };
    const mat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, uniforms: this.uni, side: THREE.BackSide, depthWrite: false, depthTest: false });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1000;
    this.dome.name = "sky";
    scene.add(this.dome);
    scene.background = null;
    this.envDome = new THREE.Mesh(this.dome.geometry, mat);
    this.envDome.scale.setScalar(100);
    this.envScene.add(this.envDome);
    if (o.quality !== "low") this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.fog = new THREE.Fog("#b8c6d4", o.view * 0.5, o.view);
    if (o.quality !== "low") this.makeRain();
    for (let i = 0; i < o.lights; i++) {
      const p = new THREE.PointLight("#ffd9a0", 0, 18, 2);
      p.castShadow = false;
      this.pointLights.push(p);
      scene.add(p);
    }
  }

  // Street lamp positions (the nearest few get a real light at night).
  setLamps(spots: THREE.Vector3[]) {
    this.lampSpots = spots;
  }

  private makeRain() {
    const N = this.o.quality === "ultra" ? 7000 : this.o.quality === "high" ? 4500 : 2500;
    const pos = new Float32Array(N * 6);
    const seed = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = Math.random() * 60, y = Math.random() * 40, z = Math.random() * 60;
      pos.set([x, y, z, x, y, z], i * 6);
      seed[i * 2] = 0;
      seed[i * 2 + 1] = 1;
    }
    const end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) (end[i * 2] = 0), (end[i * 2 + 1] = 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("tip", new THREE.BufferAttribute(end, 1));
    this.rainU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uAmount: { value: 0 }, uLight: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: this.rainU,
      transparent: true,
      depthWrite: false,
      vertexShader: `
attribute float tip;
uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; uniform float uAmount;
varying float vA;
void main(){
  vec3 p = position;
  float speed = 22.0 + fract(p.x * 13.1) * 6.0;
  p.y = mod(p.y - uTime * speed, 40.0);
  p.x = mod(p.x + uWind.x * uTime * 1.5 - uCam.x, 60.0) - 30.0 + uCam.x;
  p.z = mod(p.z + uWind.y * uTime * 1.5 - uCam.z, 60.0) - 30.0 + uCam.z;
  p.y += uCam.y - 14.0;
  p += tip * vec3(-uWind.x * 0.04, 0.55, -uWind.y * 0.04);
  vA = step(fract(position.z * 7.31 + position.x * 3.7), uAmount) * 0.55;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
      fragmentShader: `uniform float uLight; varying float vA; void main(){ if (vA <= 0.0) discard; gl_FragColor = vec4(vec3(0.75, 0.8, 0.88) * uLight, vA); }`,
    });
    this.rain = new THREE.LineSegments(g, m);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    this.scene.add(this.rain);
  }

  // How well tyres grip the road now (1 dry, about 0.7 soaked).
  get grip() {
    return 1 - this.wet * 0.3;
  }

  update(dt: number, camera: THREE.Camera, focus: THREE.Vector3, now = Date.now()) {
    this.hours = this.pinHours ?? townHours(now);
    const w = townWeather(now);
    const target = this.pinWeather ?? (w.into > 0.92 ? w.next : w.now);
    this.weather = target;
    const want = { clear: [0.1, 0, 0, 0], cloudy: [0.65, 0.2, 0, 0.03], rain: [0.9, 0.55, 0.85, 0.18], fog: [0.55, 0.25, 0, 0.85], storm: [1, 0.9, 1, 0.3] }[target];
    const k = Math.min(1, dt * 0.25);
    const cover = this.uni.cover!.value + (want[0]! - this.uni.cover!.value) * k;
    this.uni.cover!.value = cover;
    this.uni.dark!.value += (want[1]! - this.uni.dark!.value) * k;
    this.rainAmount += (want[2]! - this.rainAmount) * k;
    this.fogAmount += (want[3]! - this.fogAmount) * k;
    // Roads soak quickly and dry slowly.
    this.wet = this.rainAmount > 0.2 ? Math.min(1, this.wet + dt * 0.05 * this.rainAmount) : Math.max(0, this.wet - dt * 0.006);
    WORLD_UNIFORMS.uWet.value = this.wet;
    WORLD_UNIFORMS.uTime.value += dt;
    this.uni.time!.value += dt;

    // The sun: east at 6, overhead at noon, west at 18; the moon side at night.
    const a = ((this.hours - 6) / 24) * Math.PI * 2;
    const sunDir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0.35).normalize();
    this.uni.sunDir!.value.copy(sunDir);
    const elev = sunDir.y;
    const day = THREE.MathUtils.smoothstep(elev, -0.08, 0.18);
    this.night = 1 - day;
    this.uni.night!.value = THREE.MathUtils.smoothstep(-elev, -0.02, 0.2);
    this.uni.turbidity!.value = 4 + cover * 8;
    this.uni.rayleigh!.value = 1.5 + (1 - day) * 1.5;
    this.uni.exposure!.value = 0.42 + (1 - day) * 0.5;
    setNight(THREE.MathUtils.smoothstep(this.night, 0.35, 0.85));

    // Lights follow the sky: warm low sun, white midday, blue moonlight, dimmed by clouds.
    const lowSun = 1 - THREE.MathUtils.smoothstep(elev, 0.05, 0.4);
    const sunCol = new THREE.Color("#fff4e2").lerp(new THREE.Color("#ff9a55"), lowSun * 0.8);
    const moon = new THREE.Color("#9fb4ff");
    const shade = 1 - cover * 0.75;
    this.sun.color.copy(day > 0.02 ? sunCol : moon);
    this.sun.intensity = day > 0.02 ? 2.4 * day * shade : 0.25 * (1 - cover * 0.6);
    const toSun = day > 0.02 ? sunDir : new THREE.Vector3(-sunDir.x, Math.max(0.3, -sunDir.y), 0.3).normalize();
    this.sun.position.copy(focus).addScaledVector(toSun, 80);
    this.sun.target.position.copy(focus);
    this.hemi.color.set(day > 0.3 ? "#cfe3ff" : "#3a4a6e").lerp(new THREE.Color("#9aa3ad"), cover * 0.6);
    this.hemi.groundColor.set(day > 0.3 ? "#5d6650" : "#1c1f26");
    this.hemi.intensity = 0.2 + day * 0.55 * (1 - cover * 0.25) + this.flash * 4;

    // Fog: haze by day, thick in fog, close in heavy rain; tinted like the horizon.
    const fogCol = new THREE.Color().setRGB(0.62, 0.7, 0.8).lerp(new THREE.Color("#7d848b"), cover * 0.7).multiplyScalar(0.08 + day * 0.72);
    const f = this.scene.fog as THREE.Fog;
    f.color.copy(fogCol);
    const v = this.o.view;
    // Light haze at the edge of the view on clear days; closer in rain; thick in fog.
    f.far = THREE.MathUtils.lerp(v * 1.25, 60, this.fogAmount);
    f.near = THREE.MathUtils.lerp(v * 0.7, 4, this.fogAmount);

    // The dome follows the camera.
    this.dome.position.copy(camera.position);
    const far = (camera as THREE.PerspectiveCamera).far ?? 300;
    this.dome.scale.setScalar(far * 0.9);

    // The environment map (reflections, ambient light) when the sky has changed enough.
    if (this.pmrem) {
      const key = Math.round(this.hours * 6) + Math.round(cover * 10) * 1000 + Math.round(this.night * 10) * 100000;
      if (key !== this.envAt) {
        this.envAt = key;
        const old = this.envTarget;
        this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 1000);
        this.scene.environment = this.envTarget.texture;
        this.scene.environmentIntensity = 0.35 + day * 0.65;
        old?.dispose();
      }
    }

    // Rain.
    if (this.rain && this.rainU) {
      this.rain.visible = this.rainAmount > 0.03;
      this.rainU.uTime!.value += dt;
      this.rainU.uCam!.value.copy(camera.position);
      this.rainU.uWind!.value.copy(this.wind).multiplyScalar(target === "storm" ? 9 : 3);
      this.rainU.uAmount!.value = this.rainAmount;
      this.rainU.uLight!.value = 0.25 + day * 0.75 + this.flash;
    }

    // Lightning in storms: a flash, then thunder a moment later.
    this.flash = Math.max(0, this.flash - dt * 3);
    if (target === "storm" && this.rainAmount > 0.6) {
      if (!this.nextFlash) this.nextFlash = now + 4000 + Math.random() * 9000;
      if (now > this.nextFlash) {
        this.flash = 1;
        this.nextFlash = 0;
        const delay = 400 + Math.random() * 2500;
        setTimeout(() => this.onThunder?.(1 - delay / 3500), delay);
      }
    }

    // Street lamps: the nearest few get a real light after dark.
    this.lampTick -= dt;
    if (this.lampTick <= 0 && this.pointLights.length) {
      this.lampTick = 0.5;
      const on = this.night > 0.45;
      const near = on ? [...this.lampSpots].sort((p, q) => p.distanceToSquared(focus) - q.distanceToSquared(focus)).slice(0, this.pointLights.length) : [];
      this.pointLights.forEach((l, i) => {
        const s = near[i];
        l.intensity = s ? 18 * THREE.MathUtils.smoothstep(this.night, 0.45, 0.8) : 0;
        if (s) l.position.copy(s);
      });
    }
  }

  // The lighting state (for the HUD and the map).
  label() {
    const h = Math.floor(this.hours), m = Math.floor((this.hours % 1) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} · ${WEATHER_LABEL[this.weather]}`;
  }

  dispose() {
    this.envTarget?.dispose();
    this.pmrem?.dispose();
    this.rain?.geometry.dispose();
    (this.rain?.material as THREE.Material | undefined)?.dispose();
    (this.dome.material as THREE.Material).dispose();
    this.dome.geometry.dispose();
    for (const l of this.pointLights) this.scene.remove(l);
  }
}
