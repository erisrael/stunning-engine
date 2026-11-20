import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Fewer draw calls for static scenery: inside a group, plain child groups (no name, no userData) are flattened into
// it, and all its plain meshes are merged by material into one mesh each. Named groups (floors the game hides,
// the roof), groups or meshes with userData (spinning showcases, swings, targets, things marked keep), sprites,
// skinned and instanced meshes are left as they are, and their own children are processed the same way (except
// things marked keep, such as cars: their parts swap and spin).

const plainGroup = (o: THREE.Object3D) => !(o as THREE.Mesh).isMesh && !(o as THREE.Sprite).isSprite && o.type === "Group" && !o.name && Object.keys(o.userData).length === 0;
const plainMesh = (o: THREE.Object3D) => {
  const m = o as THREE.Mesh;
  return m.isMesh && !(m as THREE.SkinnedMesh).isSkinnedMesh && !(m as unknown as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material) && Object.keys(m.userData).length === 0 && !m.name && m.children.length === 0 && !!m.geometry.getAttribute("normal");
};

export function optimizeStatic(group: THREE.Object3D) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const remove: THREE.Object3D[] = [];
  // Collect meshes here and in plain child groups (recursively), baking their transforms.
  const collect = (o: THREE.Object3D, top: boolean) => {
    for (const c of [...o.children]) {
      if (plainMesh(c)) {
        const m = c as THREE.Mesh;
        let g = m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        if (g.index) g = g.toNonIndexed();
        // Keep only the attributes every mesh has, so they merge.
        for (const k of Object.keys(g.attributes)) if (!["position", "normal", "uv"].includes(k)) g.deleteAttribute(k);
        if (!g.getAttribute("uv")) g.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array((g.getAttribute("position").count) * 2), 2));
        const mat = m.material as THREE.Material;
        const e = byMat.get(mat) ?? byMat.set(mat, { geos: [], cast: false }).get(mat)!;
        e.geos.push(g);
        e.cast ||= m.castShadow;
        if (top) remove.push(m);
      } else if (plainGroup(c)) {
        collect(c, false);
        if (top) remove.push(c);
      } else if (top && !c.userData.keep) optimizeStatic(c);
    }
  };
  collect(group, true);
  // Plain groups that also held special children: those children must survive, so put them back on the group.
  for (const r of remove) {
    if (plainGroup(r)) {
      const keep: THREE.Object3D[] = [];
      r.traverse((x) => x !== r && !plainMesh(x) && !plainGroup(x) && keep.push(x));
      for (const k of keep) if (k.parent && !keep.includes(k.parent)) group.attach(k);
    }
    group.remove(r);
  }
  for (const [mat, e] of byMat) {
    for (let i = 0; i < e.geos.length; i += 500) {
      const merged = mergeGeometries(e.geos.slice(i, i + 500), false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = e.cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    e.geos.forEach((g) => g.dispose());
  }
}

// A loaded model (a car from a file): every mesh under `root` (names and all; not skinned, instanced, morphing or
// marked keep) merged by material into one mesh each, in root's space. Compressed attributes (meshopt quantization)
// become plain floats first so transforms can be baked; mirrored parts get their triangles turned back.
export function mergeModel(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; cast: boolean; receive: boolean }>();
  const remove: THREE.Mesh[] = [];
  const m4 = new THREE.Matrix4();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.SkinnedMesh).isSkinnedMesh || (m as unknown as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.keep || Object.keys(m.geometry.morphAttributes).length) return;
    const g = new THREE.BufferGeometry();
    for (const [k, a] of Object.entries(m.geometry.attributes)) {
      const src = a as THREE.BufferAttribute;
      const f = new Float32Array(src.count * src.itemSize);
      for (let i = 0; i < src.count; i++) for (let c = 0; c < src.itemSize; c++) f[i * src.itemSize + c] = src.getComponent(i, c);
      g.setAttribute(k, new THREE.BufferAttribute(f, src.itemSize));
    }
    if (m.geometry.index) g.setIndex(Array.from(m.geometry.index.array as ArrayLike<number>));
    m4.multiplyMatrices(inv, m.matrixWorld);
    g.applyMatrix4(m4);
    if (m4.determinant() < 0) {
      // Mirrored: swap two corners of every triangle so the faces point out again.
      const idx = g.index;
      if (idx) for (let i = 0; i < idx.count; i += 3) { const b = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b); }
      else for (const a of Object.values(g.attributes) as THREE.BufferAttribute[]) for (let i = 0; i < a.count; i += 3) for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
    }
    const key = (m.material as THREE.Material).uuid + "|" + Object.keys(g.attributes).sort().join(",") + "|" + !!g.index;
    const e = groups.get(key) ?? groups.set(key, { mat: m.material as THREE.Material, geos: [], cast: false, receive: false }).get(key)!;
    e.geos.push(g);
    e.cast ||= m.castShadow;
    e.receive ||= m.receiveShadow;
    remove.push(m);
  });
  for (const m of remove) m.parent?.remove(m);
  for (const e of groups.values()) {
    const merged = mergeGeometries(e.geos, false);
    e.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, e.mat);
    mesh.castShadow = e.cast;
    mesh.receiveShadow = e.receive;
    root.add(mesh);
  }
}
