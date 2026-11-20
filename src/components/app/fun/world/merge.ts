import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Fewer draw calls for static scenery: inside a group, plain child groups (no name, no userData) are flattened into
// it, and all its plain meshes are merged by material into one mesh each. Named groups (floors the game hides,
// the roof), groups or meshes with userData (spinning showcases, swings, targets, things marked keep), sprites,
// skinned and instanced meshes are left as they are, and their own children are processed the same way.

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
      } else if (top) optimizeStatic(c);
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
