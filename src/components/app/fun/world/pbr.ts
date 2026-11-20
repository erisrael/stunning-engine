import * as THREE from "three";

// Realistic surfaces for the town (characters keep their own styles): physically based materials with CC0 texture
// sets from Poly Haven (public/textures/pbr, see public/models/manifest.json), mapped in world space so a texture
// keeps its real size on any box, wall or road (no stretching on instanced boxes). Rain makes outdoor surfaces
// darker and glossy through one shared uniform; lit windows and street lamps follow the night uniform.

export type SurfaceKey =
  | "asphalt"
  | "sidewalk"
  | "grass"
  | "brick"
  | "plaster"
  | "concrete"
  | "wood"
  | "laminate"
  | "tiles"
  | "roof"
  | "clayroof"
  | "gravel"
  | "metal"
  | "marble"
  | "stone"
  | "planks"
  | "fabric"
  | "dirt"
  | "cobble"
  | "factory";

export const SURFACES: SurfaceKey[] = ["asphalt", "sidewalk", "grass", "brick", "plaster", "concrete", "wood", "laminate", "tiles", "roof", "clayroof", "gravel", "metal", "marble", "stone", "planks", "fabric", "dirt", "cobble", "factory"];

// Metres one texture tile covers, per surface.
const TILE: Record<SurfaceKey, number> = { asphalt: 6, sidewalk: 2.4, grass: 5, brick: 2.2, plaster: 3, concrete: 4, wood: 2, laminate: 2, tiles: 2, roof: 2.5, clayroof: 2.5, gravel: 4, metal: 2, marble: 2.5, stone: 2.5, planks: 2, fabric: 1, dirt: 4, cobble: 2.5, factory: 3 };
// Typical roughness when the texture set has no roughness map, and how much rain wets it (roofs and walls less).
const OUTDOOR: Partial<Record<SurfaceKey, number>> = { asphalt: 1, sidewalk: 0.9, grass: 0.5, gravel: 0.6, dirt: 0.7, cobble: 0.9, stone: 0.8, brick: 0.35, plaster: 0.3, concrete: 0.8, roof: 0.6, clayroof: 0.6, metal: 0.6, planks: 0.5, factory: 0.4 };

// Shared by every realistic material: rain (0 dry to 1 soaked) and night (0 day to 1 night).
export const WORLD_UNIFORMS = { uWet: { value: 0 }, uNight: { value: 0 }, uTime: { value: 0 } };

export const PBR = { textures: true, anisotropy: 4 };

const loader = new THREE.TextureLoader();
const texCache = new Map<string, THREE.Texture>();
function tex(key: SurfaceKey, map: "color" | "normal" | "arm") {
  const k = `${key}_${map}`;
  let t = texCache.get(k);
  if (!t) {
    t = loader.load(`/textures/pbr/${k}.webp`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = map === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.anisotropy = PBR.anisotropy;
    texCache.set(k, t);
  }
  return t;
}

// World-space box mapping: the UVs of every map come from the world position on the face's main axis.
function worldUv(m: THREE.Material, tile: number, wetness: number) {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = WORLD_UNIFORMS.uWet;
    shader.uniforms.uTile = { value: 1 / tile };
    shader.uniforms.uWetK = { value: wetness };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTile;
varying vec3 vWN;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
{
  vec4 bwp = vec4(position, 1.0);
  vec3 bn = normal;
  #ifdef USE_INSTANCING
    bwp = instanceMatrix * bwp;
    bn = mat3(instanceMatrix) * bn;
  #endif
  bwp = modelMatrix * bwp;
  bn = normalize(mat3(modelMatrix) * bn);
  vWN = bn;
  vec3 an = abs(bn);
  vec2 buv = an.y > max(an.x, an.z) ? bwp.xz : (an.x > an.z ? vec2(bwp.z, bwp.y) : bwp.xy);
  buv *= uTile;
  #ifdef USE_MAP
    vMapUv = buv;
  #endif
  #ifdef USE_NORMALMAP
    vNormalMapUv = buv;
  #endif
  #ifdef USE_ROUGHNESSMAP
    vRoughnessMapUv = buv;
  #endif
  #ifdef USE_METALNESSMAP
    vMetalnessMapUv = buv;
  #endif
  #ifdef USE_AOMAP
    vAoMapUv = buv;
  #endif
}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uWet;
uniform float uWetK;
varying vec3 vWN;`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
float wetAmt = uWet * uWetK * (vWN.y > 0.6 ? 1.0 : 0.35);
roughnessFactor = mix(roughnessFactor, 0.08, wetAmt);`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
diffuseColor.rgb *= 1.0 - 0.38 * uWet * uWetK * (vWN.y > 0.6 ? 1.0 : 0.4);`,
      );
  };
  m.customProgramCacheKey = () => `wuv${tile}|${wetness}`;
}

const matCache = new Map<string, THREE.Material>();
export type SurfaceOpts = { tint?: string | number; tile?: number; rough?: number; metal?: number; side?: THREE.Side; env?: number; emissive?: string; transparent?: number };

// A realistic surface: the texture set (or a plain physically based colour on low quality), tinted.
export function surface(key: SurfaceKey, o: SurfaceOpts = {}): THREE.MeshStandardMaterial {
  const ck = `${key}|${o.tint ?? ""}|${o.tile ?? ""}|${o.rough ?? ""}|${o.metal ?? ""}|${o.side ?? ""}|${o.env ?? ""}|${o.emissive ?? ""}|${o.transparent ?? ""}|${PBR.textures ? 1 : 0}`;
  let m = matCache.get(ck) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  const textured = PBR.textures;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(o.tint ?? "#ffffff"),
    roughness: o.rough ?? 1,
    metalness: o.metal ?? (key === "metal" ? 0.6 : 0),
    side: o.side ?? THREE.FrontSide,
    envMapIntensity: o.env ?? 0.9,
    transparent: o.transparent !== undefined,
    opacity: o.transparent ?? 1,
  });
  if (o.emissive) m.emissive = new THREE.Color(o.emissive);
  if (textured) {
    m.map = tex(key, "color");
    m.normalMap = tex(key, "normal");
    m.normalScale = new THREE.Vector2(0.9, 0.9);
    // ARM: ambient occlusion (R), roughness (G), metalness (B).
    const arm = tex(key, "arm");
    m.roughnessMap = arm;
    m.aoMap = null;
    if (key === "metal") m.metalnessMap = arm;
  } else {
    // Without textures, a typical colour for the surface (tint multiplies it).
    const base: Partial<Record<SurfaceKey, string>> = { asphalt: "#3a3d42", sidewalk: "#9a978f", grass: "#4f7d34", brick: "#8f4a37", plaster: "#e8e2d6", concrete: "#9c9a94", wood: "#8a5a35", laminate: "#a77b52", tiles: "#d9d5ce", roof: "#4b4f55", clayroof: "#9a4a2e", gravel: "#a39582", metal: "#8d949b", marble: "#ecebe7", stone: "#9b958a", planks: "#7a5a3c", fabric: "#7d7f8a", dirt: "#6d5640", cobble: "#7b776f", factory: "#8f969c" };
    m.color.multiply(new THREE.Color(base[key] ?? "#999999"));
    m.roughness = o.rough ?? 0.85;
  }
  worldUv(m, o.tile ?? TILE[key], OUTDOOR[key] ?? 0);
  matCache.set(ck, m);
  return m;
}

// A plain physically based colour (no texture), still wettable outdoors when asked.
export function plain(color: string | number, o: { rough?: number; metal?: number; side?: THREE.Side; transparent?: number; emissive?: string; emissiveIntensity?: number; env?: number; wet?: number } = {}) {
  const ck = `plain|${color}|${o.rough ?? ""}|${o.metal ?? ""}|${o.side ?? ""}|${o.transparent ?? ""}|${o.emissive ?? ""}|${o.emissiveIntensity ?? ""}|${o.env ?? ""}|${o.wet ?? ""}`;
  let m = matCache.get(ck) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(color),
    roughness: o.rough ?? 0.8,
    metalness: o.metal ?? 0,
    side: o.side ?? THREE.FrontSide,
    transparent: o.transparent !== undefined,
    opacity: o.transparent ?? 1,
    envMapIntensity: o.env ?? 1,
  });
  if (o.emissive) (m.emissive = new THREE.Color(o.emissive)), (m.emissiveIntensity = o.emissiveIntensity ?? 1);
  if (o.transparent !== undefined) m.depthWrite = o.transparent > 0.6;
  if (o.wet) worldUv(m, 4, o.wet);
  matCache.set(ck, m);
  return m;
}

// Car paint: a metallic base with a clear coat (reflections from the sky), as on real cars.
export function carPaint(color: string, finish: "gloss" | "metallic" | "matte" | "pearl" = "metallic") {
  const ck = `paint|${color}|${finish}`;
  let m = matCache.get(ck) as THREE.MeshPhysicalMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    metalness: finish === "metallic" ? 0.65 : finish === "pearl" ? 0.4 : 0.05,
    roughness: finish === "matte" ? 0.6 : finish === "metallic" ? 0.32 : 0.18,
    clearcoat: finish === "matte" ? 0 : 1,
    clearcoatRoughness: 0.05,
    iridescence: finish === "pearl" ? 0.6 : 0,
    envMapIntensity: 1.3,
  });
  matCache.set(ck, m);
  return m;
}

export function glass(tint = "#9fb6c8", opacity = 0.35, rough = 0.05) {
  const ck = `glass|${tint}|${opacity}|${rough}`;
  let m = matCache.get(ck) as THREE.MeshPhysicalMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(tint), metalness: 0.0, roughness: rough, transparent: true, opacity, envMapIntensity: 0.9, depthWrite: false, side: THREE.DoubleSide, specularIntensity: 1 });
  matCache.set(ck, m);
  return m;
}

// Lamps, signs and lit windows: they glow at night (the night uniform scales their light).
const glowMats: { m: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
export function lamp(color = "#fff2c4", day = 0.05, night = 3) {
  const ck = `lamp|${color}|${day}|${night}`;
  let m = matCache.get(ck) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  m = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color), emissiveIntensity: day, roughness: 0.4 });
  glowMats.push({ m, day, night });
  matCache.set(ck, m);
  return m;
}
export function setNight(n: number) {
  WORLD_UNIFORMS.uNight.value = n;
  for (const g of glowMats) g.m.emissiveIntensity = g.day + (g.night - g.day) * n;
}

// Building facades: a canvas texture of window bays (frames, glass, blinds, some lit at night) for a whole wall,
// with a matching emissive map so windows light up after dark. Styles give each street its own architecture.
export type FacadeStyle = "office" | "glass" | "brick" | "classic" | "apartment" | "shop" | "industrial" | "house";
const facadeCache = new Map<string, { map: THREE.Texture; emissive: THREE.Texture; rough: THREE.Texture }>();
function facadeTextures(style: FacadeStyle, wall: string, seed: number) {
  const key = `${style}|${wall}|${seed % 4}`;
  const hit = facadeCache.get(key);
  if (hit) return hit;
  const W = 256, H = 256;
  const mk = () => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    return [c, c.getContext("2d")!] as const;
  };
  const [c1, g] = mk();
  const [c2, e] = mk();
  const [c3, r] = mk();
  let rnd = seed * 9301 + 49297;
  const rand = () => ((rnd = (rnd * 9301 + 49297) % 233280) / 233280);
  // One texture tile = one bay: 4 m wide, one storey (3.5 m) tall, drawn at 256x256.
  g.fillStyle = wall;
  g.fillRect(0, 0, W, H);
  // Subtle wall noise and joints.
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rand() > 0.5 ? "255,255,255" : "0,0,0"},${0.02 + rand() * 0.04})`;
    g.fillRect(rand() * W, rand() * H, 2 + rand() * 4, 1 + rand() * 2);
  }
  if (style === "brick") {
    g.strokeStyle = "rgba(0,0,0,.18)";
    for (let y = 0; y < H; y += 10) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
      for (let x = (y / 10) % 2 ? 0 : 12; x < W; x += 24) {
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x, y + 10);
        g.stroke();
      }
    }
  }
  r.fillStyle = "#d8d8d8"; // walls rough
  r.fillRect(0, 0, W, H);
  e.fillStyle = "#000";
  e.fillRect(0, 0, W, H);
  const glassStyle = style === "glass";
  const win = glassStyle ? { x: 4, y: 6, w: W - 8, h: H - 18 } : style === "industrial" ? { x: 40, y: 40, w: 176, h: 90 } : style === "classic" ? { x: 70, y: 40, w: 116, h: 170 } : style === "house" ? { x: 64, y: 60, w: 128, h: 130 } : { x: 34, y: 44, w: 188, h: 150 };
  // Frame and sill.
  g.fillStyle = glassStyle ? "#2b3440" : style === "classic" ? "#efe9dd" : "#3d4148";
  g.fillRect(win.x - 6, win.y - 6, win.w + 12, win.h + 12);
  if (style === "classic") (g.fillStyle = "#d9d0bf"), g.fillRect(win.x - 14, win.y - 24, win.w + 28, 14);
  // Glass: sky reflection gradient with a blind or curtain in some windows.
  const grd = g.createLinearGradient(0, win.y, 0, win.y + win.h);
  grd.addColorStop(0, glassStyle ? "#6f8ea8" : "#7f97ab");
  grd.addColorStop(1, glassStyle ? "#2c3e50" : "#33414f");
  g.fillStyle = grd;
  g.fillRect(win.x, win.y, win.w, win.h);
  const blind = rand();
  if (blind > 0.55 && !glassStyle) (g.fillStyle = "rgba(230,224,210,.85)"), g.fillRect(win.x, win.y, win.w, win.h * (0.2 + rand() * 0.5));
  // Mullions.
  g.fillStyle = glassStyle ? "#1d242c" : "#2c3036";
  if (glassStyle) for (let x = 0; x <= W; x += 64) g.fillRect(x - 2, 0, 4, H);
  else g.fillRect(win.x + win.w / 2 - 3, win.y, 6, win.h);
  if (glassStyle) g.fillRect(0, H - 14, W, 14);
  // Roughness: glass smooth.
  r.fillStyle = "#1a1a1a";
  r.fillRect(win.x, win.y, win.w, win.h);
  if (glassStyle) (r.fillStyle = "#151515"), r.fillRect(0, 0, W, H);
  // Night: most windows lit warm or cool (the emissive map), a few dark.
  const lit = rand();
  if (lit > 0.25) {
    e.fillStyle = lit > 0.7 ? "#ffe2a8" : lit > 0.45 ? "#fff3d6" : "#cfe3ff";
    e.globalAlpha = 0.6 + rand() * 0.4;
    e.fillRect(win.x, win.y, win.w, win.h);
    if (blind > 0.55 && !glassStyle) (e.globalAlpha = 0.35), (e.fillStyle = "#ffd59a"), e.fillRect(win.x, win.y, win.w, win.h * 0.4);
  }
  const t = (c: HTMLCanvasElement, srgb: boolean) => {
    const x = new THREE.CanvasTexture(c);
    x.wrapS = x.wrapT = THREE.RepeatWrapping;
    x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    x.anisotropy = PBR.anisotropy;
    return x;
  };
  const out = { map: t(c1, true), emissive: t(c2, true), rough: t(c3, false) };
  facadeCache.set(key, out);
  return out;
}

// A facade material: bays of `bay` metres wide and `storey` metres tall, in world space so every wall of any size
// gets whole windows. Lit windows glow with the night uniform.
export function facade(style: FacadeStyle, wall: string, seed = 1, bay = 4, storey = 3.5) {
  const ck = `facade|${style}|${wall}|${seed % 4}|${bay}|${storey}`;
  let m = matCache.get(ck) as THREE.MeshStandardMaterial | undefined;
  if (m) return m;
  const t = facadeTextures(style, wall, seed);
  m = new THREE.MeshStandardMaterial({ map: t.map, roughnessMap: t.rough, emissiveMap: t.emissive, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 1, roughness: 1, metalness: style === "glass" ? 0.35 : 0, envMapIntensity: style === "glass" ? 1.4 : 0.8 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = WORLD_UNIFORMS.uNight;
    shader.uniforms.uBay = { value: new THREE.Vector2(1 / bay, 1 / storey) };
    shader.uniforms.uWet = WORLD_UNIFORMS.uWet;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform vec2 uBay;\nvarying vec2 vBayId;").replace(
      "#include <uv_vertex>",
      `#include <uv_vertex>
{
  vec4 bwp = vec4(position, 1.0);
  vec3 bn = normal;
  #ifdef USE_INSTANCING
    bwp = instanceMatrix * bwp;
    bn = mat3(instanceMatrix) * bn;
  #endif
  bwp = modelMatrix * bwp;
  bn = normalize(mat3(modelMatrix) * bn);
  vec3 an = abs(bn);
  vec2 buv = an.x > an.z ? vec2(bwp.z * sign(bn.x), bwp.y) : vec2(-bwp.x * sign(bn.z), bwp.y);
  if (an.y > 0.6) buv = bwp.xz * 0.05;
  buv *= uBay;
  vBayId = floor(buv) + floor(bwp.xz * 0.01) * 17.0;
  vMapUv = buv;
  vRoughnessMapUv = buv;
  vEmissiveMapUv = buv;
}`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform float uNight;\nuniform float uWet;\nvarying vec2 vBayId;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\nfloat hb = fract(sin(dot(vBayId, vec2(12.9898, 78.233))) * 43758.5453);\ntotalEmissiveRadiance *= uNight * 0.85 * step(0.5, hb) * (0.35 + 0.65 * fract(hb * 7.31));")
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.15, uWet * 0.3);");
  };
  m.customProgramCacheKey = () => `facade${bay}|${storey}`;
  matCache.set(ck, m);
  return m;
}

// Lane markings, crossings and parking lines: a bright, slightly rough paint that also darkens in rain.
export function roadPaint(color = "#f2f2ee") {
  return plain(color, { rough: 0.55, wet: 0.6 });
}

// Detailed realistic textures are only fetched when used; low quality draws plain colours instead.
export function setTextureQuality(on: boolean, anisotropy: number) {
  if (PBR.textures !== on) matCache.clear();
  PBR.textures = on;
  PBR.anisotropy = anisotropy;
}
