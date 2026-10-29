// File storage for chat attachments and voice messages.
//
// With SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set, files go to Supabase Storage (bucket SUPABASE_BUCKET,
// default "chat-files"); browsers upload straight to it through a signed URL, so large files never pass through
// the app server. Without them, files are kept in the database (table chat_blobs), which works on any host with
// no setup and suits voice messages and small files.

import { get, run } from "./db";

export type StorageKind = "supabase" | "database";

const BUCKET = process.env.SUPABASE_BUCKET || "chat-files";

export function storageKind(): StorageKind {
  return process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY ? "supabase" : "database";
}

// Upload limits per storage. Database storage passes through the app server, whose request size is limited.
export function maxUploadBytes(kind: StorageKind = storageKind()) {
  return kind === "supabase" ? 25 * 1024 * 1024 : 8 * 1024 * 1024;
}

function supabase(path: string, init: RequestInit = {}) {
  const base = process.env.SUPABASE_URL!.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${base}/storage/v1${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, apikey: key, ...(init.headers ?? {}) } });
}

let bucketReady: Promise<void> | null = null;
// Creates the private bucket on first use, so no manual setup is needed in Supabase.
function ensureBucket() {
  bucketReady ??= (async () => {
    const r = await supabase(`/bucket/${BUCKET}`);
    if (r.ok) return;
    const c = await supabase("/bucket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false }) });
    if (!c.ok && c.status !== 409) throw new Error(`Could not create the storage bucket: ${await c.text()}`);
  })().catch((err) => {
    bucketReady = null;
    throw err;
  });
  return bucketReady;
}

// A one-time URL the browser can PUT the file to (Supabase only).
export async function signedUploadUrl(path: string): Promise<string> {
  await ensureBucket();
  const r = await supabase(`/object/upload/sign/${BUCKET}/${path}`, { method: "POST" });
  if (!r.ok) throw new Error(`Storage refused the upload: ${await r.text()}`);
  const { url } = (await r.json()) as { url: string };
  return `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1${url}`;
}

// A short-lived link to read the file (Supabase only).
export async function signedReadUrl(path: string, seconds = 120): Promise<string> {
  const r = await supabase(`/object/sign/${BUCKET}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: seconds }) });
  if (!r.ok) throw new Error(`Storage could not sign the file: ${await r.text()}`);
  const { signedURL } = (await r.json()) as { signedURL: string };
  return `${process.env.SUPABASE_URL!.replace(/\/$/, "")}/storage/v1${signedURL}`;
}

export async function objectExists(path: string) {
  const r = await supabase(`/object/info/${BUCKET}/${path}`);
  return r.ok;
}

export async function putDatabaseBlob(fileId: string, data: Uint8Array) {
  await run(
    "INSERT INTO chat_blobs (file_id, data) VALUES (?, ?) ON CONFLICT (file_id) DO UPDATE SET data = excluded.data",
    fileId,
    Buffer.from(data).toString("base64"),
  );
}

export async function readDatabaseBlob(fileId: string): Promise<Buffer | null> {
  const row = await get<{ data: string }>("SELECT data FROM chat_blobs WHERE file_id = ?", fileId);
  return row ? Buffer.from(row.data, "base64") : null;
}

export async function deleteStored(file: { id: string; storage: string; path: string }) {
  if (file.storage === "supabase") {
    const r = await supabase(`/object/${BUCKET}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [file.path] }) });
    if (!r.ok && r.status !== 404) throw new Error(`Storage could not delete the file: ${await r.text()}`);
  } else await run("DELETE FROM chat_blobs WHERE file_id = ?", file.id);
}
