import { all, get, nowIso, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

// 3D models Admin uploads for Seed Town (glTF binary, .glb): placed from the town editor like any other prop.
// Kept in the database (a few megabytes each); served to signed-in people with a long cache.

const MAX = 15 * 1024 * 1024;
const isAdmin = (u: AppUser) => can(u, "users.manage") || can(u, "settings.manage");

export async function listModels() {
  return all<{ id: string; name: string; size: number; created_at: string }>("SELECT id, name, size, created_at FROM fun_models ORDER BY created_at DESC LIMIT 200");
}

export async function uploadModel(user: AppUser, name: string, bytes: Uint8Array) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin uploads models.");
  if (bytes.length > MAX) throw new WorkflowError("VALIDATION", "Models up to 15 MB.");
  // A glTF binary starts with "glTF", version 2.
  if (bytes.length < 20 || String.fromCharCode(...bytes.subarray(0, 4)) !== "glTF" || new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) !== 2) throw new WorkflowError("VALIDATION", "Upload a .glb file (glTF 2.0 binary).");
  const id = uid("fm_");
  const n = name.trim().replace(/\.glb$/i, "").slice(0, 60) || "Model";
  await run("INSERT INTO fun_models (id, name, mime, size, data, created_by, created_at) VALUES (?, ?, 'model/gltf-binary', ?, ?, ?, ?)", id, n, bytes.length, Buffer.from(bytes).toString("base64"), user.id, nowIso());
  await audit({ actor: user }, { action: "settings.fun", summary: `${user.name} uploaded the Seed Town model ${n}` });
  return { id, name: n, size: bytes.length };
}

export async function readModel(id: string) {
  if (!/^fm_[a-z0-9_-]{4,40}$/i.test(id)) return null;
  const r = await get<{ data: string; name: string }>("SELECT data, name FROM fun_models WHERE id = ?", id);
  return r ? { name: r.name, data: Buffer.from(r.data, "base64") } : null;
}

export async function deleteModel(user: AppUser, id: string) {
  if (!isAdmin(user)) throw new WorkflowError("FORBIDDEN", "Only Admin removes models.");
  await run("DELETE FROM fun_models WHERE id = ?", id);
}
