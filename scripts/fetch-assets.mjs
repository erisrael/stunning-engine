// Seed Town asset pipeline: downloads permitted third-party assets, optimises them and writes them into public/,
// with a manifest (public/models/manifest.json) that Admin's Asset library shows: name, category, source, author,
// licence, size, what was done to it and where it is used.
//
//   node scripts/fetch-assets.mjs [textures|props|cars|people|all] --tools <dir with node_modules>
//
// Needs (in --tools): @gltf-transform/cli, sharp, fbx2gltf. Nothing here runs at build or on the server.
// Sources (all checked by hand before adding): Poly Haven (CC0 textures and models, api.polyhaven.com), the
// Khronos glTF Sample Assets (CarConcept, CC BY 4.0), Lionsharp Studios' Porsche 911 Carrera 4S (CC BY-SA 4.0, via
// the pmndrs examples repository), the Microsoft Rocketbox avatars (MIT).

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const args = process.argv.slice(2);
const what = args[0] ?? "all";
const tools = args.includes("--tools") ? args[args.indexOf("--tools") + 1] : process.env.ASSET_TOOLS;
if (!tools) throw new Error("Pass --tools <dir> with @gltf-transform/cli, sharp and fbx2gltf installed.");
const req = createRequire(path.join(tools, "package.json"));
const sharp = req("sharp");
const GT = path.join(tools, "node_modules", ".bin", process.platform === "win32" ? "gltf-transform.cmd" : "gltf-transform");
const FBX = path.join(tools, "node_modules", "fbx2gltf", "bin", process.platform === "win32" ? "Windows_NT" : process.platform === "darwin" ? "Darwin" : "Linux", process.platform === "win32" ? "FBX2glTF.exe" : "FBX2glTF");
const ROOT = process.cwd();
const TMP = path.join(tools, "work");
fs.mkdirSync(TMP, { recursive: true });
const MANIFEST = path.join(ROOT, "public/models/manifest.json");
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { assets: [] };
const put = (a) => {
  manifest.assets = manifest.assets.filter((x) => x.id !== a.id);
  manifest.assets.push({ ...a, updated: new Date().toISOString().slice(0, 10) });
  manifest.assets.sort((x, y) => (x.category + x.id).localeCompare(y.category + y.id));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1));
};
const get = async (url, file) => {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return file;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  return file;
};
const json = async (url) => (await fetch(url)).json();
const gt = (...a) => execFileSync(GT, a, { stdio: "pipe", shell: process.platform === "win32" });
const kb = (f) => Math.round(fs.statSync(f).size / 1024);

// ------------------------------------------------------------------------------------------------- textures
// Surface key -> Poly Haven texture. Colour, normal (OpenGL) and ARM (occlusion, roughness, metalness) maps.
const TEXTURES = {
  asphalt: ["asphalt_02", 1024],
  sidewalk: ["concrete_pavement", 1024],
  grass: ["leafy_grass", 1024],
  brick: ["red_brick_03", 1024],
  plaster: ["white_plaster_02", 512],
  concrete: ["concrete_floor_02", 1024],
  wood: ["wood_floor", 512],
  laminate: ["laminate_floor_02", 512],
  tiles: ["floor_tiles_06", 512],
  roof: ["grey_roof_tiles_02", 512],
  clayroof: ["clay_roof_tiles_02", 512],
  gravel: ["gravelly_sand", 512],
  metal: ["metal_plate", 512],
  marble: ["marble_01", 512],
  stone: ["stone_tiles_02", 512],
  planks: ["wood_planks_dirt", 512],
  fabric: ["fabric_pattern_07", 512],
  dirt: ["forest_ground_04", 512],
  cobble: ["cobblestone_floor_04", 512],
  factory: ["factory_wall", 512],
};

async function textures() {
  const out = path.join(ROOT, "public/textures/pbr");
  fs.mkdirSync(out, { recursive: true });
  for (const [key, [id, size]] of Object.entries(TEXTURES)) {
    const files = await json(`https://api.polyhaven.com/files/${id}`);
    const info = await json(`https://api.polyhaven.com/info/${id}`);
    const pick = (k) => files[k]?.["1k"]?.jpg?.url;
    const maps = { color: pick("Diffuse"), normal: pick("nor_gl"), arm: pick("arm") };
    let bytes = 0;
    for (const [m, url] of Object.entries(maps)) {
      if (!url) continue;
      if (fs.existsSync(path.join(out, `${key}_${m}.webp`)) && m !== "color") {
        bytes += fs.statSync(path.join(out, `${key}_${m}.webp`)).size;
        continue;
      }
      const src = await get(url, path.join(TMP, "tex", `${id}_${m}.jpg`));
      const dst = path.join(out, `${key}_${m}.webp`);
      await sharp(src).resize(size, size).webp({ quality: m === "color" ? 82 : 78 }).toFile(dst);
      bytes += fs.statSync(dst).size;
    }
    put({ id: `tex.${key}`, name: info.name ?? id, category: "texture", file: `/textures/pbr/${key}_color.webp`, source: `https://polyhaven.com/a/${id}`, author: Object.keys(info.authors ?? {}).join(", ") || "Poly Haven", license: "CC0", sizeKb: Math.round(bytes / 1024), steps: [`1k maps resized to ${size}px`, "WebP"], status: "integrated", usedIn: "City surfaces" });
    console.log("texture", key, id, Math.round(bytes / 1024), "KB");
  }
}

// ------------------------------------------------------------------------------------------------- props (Poly Haven models)
const PROPS = {
  sofa: ["sofa_02", "furniture"],
  sofa_modern: ["sofa_03", "furniture"],
  armchair: ["modern_arm_chair_01", "furniture"],
  armchair_classic: ["ArmChair_01", "furniture"],
  table: ["wooden_table_02", "furniture"],
  table_round: ["round_wooden_table_01", "furniture"],
  coffee_table: ["coffee_table_round_01", "furniture"],
  chair: ["GreenChair_01", "furniture"],
  chair_plastic: ["plastic_monobloc_chair_01", "furniture"],
  school_chair: ["SchoolChair_01", "furniture"],
  tv: ["Television_01", "furniture"],
  shelves: ["wooden_display_shelves_01", "furniture"],
  shelves_steel: ["steel_frame_shelves_01", "furniture"],
  ceiling_lamp: ["modern_ceiling_lamp_01", "furniture"],
  plant: ["potted_plant_02", "furniture"],
  plant_small: ["potted_plant_04", "furniture"],
  picnic: ["wooden_picnic_table", "street"],
  outdoor_set: ["outdoor_table_chair_set_01", "street"],
  coffee_cart: ["CoffeeCart_01", "street"],
  trash: ["metal_trash_can", "street"],
  aircon: ["exterior_aircon_unit", "street"],
  utility_box: ["utility_box_02", "street"],
  wet_sign: ["WetFloorSign_01", "street"],
  barrel: ["Barrel_01", "industrial"],
  barrel_blue: ["Barrel_02", "industrial"],
  crate: ["wooden_crate_01", "industrial"],
  cardboard: ["cardboard_box_01", "industrial"],
  tyre: ["old_tyre", "industrial"],
  power_box: ["power_box_01", "industrial"],
  rock: ["boulder_01", "nature"],
  fern: ["fern_02", "nature"],
  shrub: ["shrub_sorrel_01", "nature"],
};

async function props() {
  const out = path.join(ROOT, "public/models/props");
  fs.mkdirSync(out, { recursive: true });
  for (const [key, [id, cat]] of Object.entries(PROPS)) {
    try {
      const files = await json(`https://api.polyhaven.com/files/${id}`);
      const info = await json(`https://api.polyhaven.com/info/${id}`);
      const g = files.gltf["1k"].gltf;
      const dir = path.join(TMP, "props", id);
      const main = await get(g.url, path.join(dir, path.basename(g.url)));
      for (const [rel, inc] of Object.entries(g.include ?? {})) await get(inc.url, path.join(dir, rel));
      const dst = path.join(out, `${key}.glb`);
      gt("optimize", main, dst, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", cat === "nature" ? "512" : "512", "--simplify", "false", "--flatten", "false");
      put({ id: `prop.${key}`, name: info.name ?? id, category: cat, file: `/models/props/${key}.glb`, source: `https://polyhaven.com/a/${id}`, author: Object.keys(info.authors ?? {}).join(", ") || "Poly Haven", license: "CC0", sizeKb: kb(dst), polycount: info.polycount ?? null, steps: ["glTF 1k", "textures 512px WebP", "meshopt"], status: "integrated", usedIn: cat === "furniture" ? "Homes and offices" : cat === "industrial" ? "Shooter maps and the industrial district" : "Streets and parks" });
      console.log("prop", key, id, kb(dst), "KB");
    } catch (e) {
      console.log("prop failed", key, id, String(e).slice(0, 200));
    }
  }
}

// ------------------------------------------------------------------------------------------------- cars
const CARS = [
  {
    key: "porsche911",
    url: "https://raw.githubusercontent.com/pmndrs/examples/main/examples/building-live-envmaps/src/911-transformed.glb",
    name: "Porsche 911 Carrera 4S",
    author: "Lionsharp Studios (Karol Miklas)",
    license: "CC BY-SA 4.0",
    source: "https://sketchfab.com/3d-models/free-porsche-911-carrera-4s-d01b254483794de3819786d93e0e1ebf",
    note: "Real-world car design and name are trademarks of their maker; the model's licence covers the 3D model only.",
  },
  {
    key: "concept",
    url: "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb",
    name: "Car Concept",
    author: "Eric Chadwick, Darmstadt Graphics Group GmbH (Khronos glTF Sample Assets)",
    license: "CC BY 4.0",
    source: "https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept",
  },
];

async function cars() {
  const out = path.join(ROOT, "public/models/cars");
  fs.mkdirSync(out, { recursive: true });
  for (const c of CARS) {
    const src = await get(c.url, path.join(TMP, "cars", `${c.key}.glb`));
    const dst = path.join(out, `${c.key}.glb`);
    gt("optimize", src, dst, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "false", "--flatten", "false", "--join", "false", "--instance", "false");
    put({ id: `car.${c.key}`, name: c.name, category: "vehicle", file: `/models/cars/${c.key}.glb`, source: c.source, author: c.author, license: c.license, note: c.note, sizeKb: kb(dst), steps: ["textures 1024px WebP", "meshopt", "wheels found by name at load"], status: "integrated", usedIn: "Vehicles (dealer, garage, traffic)" });
    console.log("car", c.key, kb(src), "->", kb(dst), "KB");
  }
}

// ------------------------------------------------------------------------------------------------- people (Rocketbox, MIT)
const PEOPLE = {
  rb_m01: "Male_Adult_01",
  rb_m05: "Male_Adult_05",
  rb_m08: "Male_Adult_08",
  rb_m12: "Male_Adult_12",
  rb_f01: "Female_Adult_01",
  rb_f04: "Female_Adult_04",
  rb_f08: "Female_Adult_08",
  rb_f12: "Female_Adult_12",
};

async function people() {
  const out = path.join(ROOT, "public/models/people");
  fs.mkdirSync(out, { recursive: true });
  const base = "https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars/Adults";
  const { NodeIO } = req("@gltf-transform/core");
  for (const [key, name] of Object.entries(PEOPLE)) {
    try {
      const dir = path.join(TMP, "people", name);
      const listing = await json(`https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/Adults/${name}/Textures`);
      await get(`${base}/${name}/Export/${name}.fbx`, path.join(dir, `${name}.fbx`));
      const tex = {};
      for (const f of listing) {
        const m = /_(body|head|opacity)_(color|normal)\.tga$/.exec(f.name);
        if (!m) continue;
        const src = await get(f.download_url, path.join(dir, f.name));
        const png = path.join(dir, `${m[1]}_${m[2]}.png`);
        // TGA through sharp is not supported everywhere; decode the simple uncompressed TGA ourselves.
        await sharp(readTga(src), { raw: readTga.last }).resize(1024, 1024).png().toFile(png);
        tex[`${m[1]}_${m[2]}`] = png;
      }
      const raw = path.join(dir, `${key}.glb`);
      execFileSync(FBX, ["--binary", "--input", path.join(dir, `${name}.fbx`), "--output", raw.replace(/\.glb$/, "")], { stdio: "pipe" });
      // Put the real textures in (FBX2glTF writes placeholders for TGA), the opacity map as alpha for hair and lashes.
      const io = new NodeIO();
      const doc = await io.read(raw);
      const D = doc.getRoot();
      for (const mat of D.listMaterials()) {
        const part = /_body$/.test(mat.getName()) ? "body" : /_head$/.test(mat.getName()) ? "head" : /_opacity$/.test(mat.getName()) ? "opacity" : null;
        if (!part) continue;
        const color = tex[`${part}_color`];
        if (color) mat.setBaseColorTexture(doc.createTexture(`${part}_color`).setImage(fs.readFileSync(color)).setMimeType("image/png"));
        const normal = tex[`${part}_normal`];
        if (normal) mat.setNormalTexture(doc.createTexture(`${part}_normal`).setImage(fs.readFileSync(normal)).setMimeType("image/png"));
        mat.setMetallicFactor(0).setRoughnessFactor(part === "head" ? 0.55 : 0.7).setBaseColorFactor([1, 1, 1, 1]);
        if (part === "opacity") mat.setAlphaMode("MASK").setAlphaCutoff(0.35).setDoubleSided(true);
      }
      for (const t of D.listTextures()) if (!t.getName()) t.dispose();
      await io.write(raw, doc);
      const dst = path.join(out, `${key}.glb`);
      gt("optimize", raw, dst, "--compress", "meshopt", "--texture-compress", "webp", "--texture-size", "1024", "--simplify", "false", "--flatten", "false", "--join", "false");
      put({ id: `person.${key}`, name: `${name.replace(/_/g, " ")} (Rocketbox)`, category: "character", file: `/models/people/${key}.glb`, source: `https://github.com/microsoft/Microsoft-Rocketbox/tree/master/Assets/Avatars/Adults/${name}`, author: "Microsoft (Rocketbox)", license: "MIT", sizeKb: kb(dst), steps: ["FBX to glTF", "textures 1024px WebP", "meshopt", "animations retargeted at load (Biped to humanoid)"], status: "integrated", usedIn: "Realistic characters and town folk" });
      console.log("person", key, name, kb(dst), "KB");
    } catch (e) {
      console.log("person failed", key, name, String(e).slice(0, 300));
    }
  }
}

// Uncompressed 24/32-bit TGA (what Rocketbox ships) to raw RGBA for sharp.
function readTga(file) {
  const b = fs.readFileSync(file);
  const idLen = b[0], type = b[2], w = b.readUInt16LE(12), h = b.readUInt16LE(14), bpp = b[16], desc = b[17];
  if (type !== 2 && type !== 10) throw new Error(`TGA type ${type}`);
  const px = bpp / 8;
  const out = Buffer.alloc(w * h * 4);
  let p = 18 + idLen;
  const topDown = !!(desc & 0x20);
  const put1 = (i, o) => {
    const row = Math.floor(i / w), col = i % w;
    const y = topDown ? row : h - 1 - row;
    const d = (y * w + col) * 4;
    out[d] = b[o + 2];
    out[d + 1] = b[o + 1];
    out[d + 2] = b[o];
    out[d + 3] = px === 4 ? b[o + 3] : 255;
  };
  if (type === 2) for (let i = 0; i < w * h; i++, p += px) put1(i, p);
  else {
    let i = 0;
    while (i < w * h) {
      const c = b[p++];
      const n = (c & 0x7f) + 1;
      if (c & 0x80) {
        for (let k = 0; k < n; k++) put1(i++, p);
        p += px;
      } else for (let k = 0; k < n; k++, p += px) put1(i++, p);
    }
  }
  readTga.last = { width: w, height: h, channels: 4 };
  return out;
}

if (what === "textures" || what === "all") await textures();
if (what === "props" || what === "all") await props();
if (what === "cars" || what === "all") await cars();
if (what === "people" || what === "all") await people();
console.log("manifest", manifest.assets.length, "assets");
