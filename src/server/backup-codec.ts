// The backup file: the workspace snapshot as JSON, gzipped, and when Admin set a passphrase, encrypted with
// AES-256-GCM under a key made from the passphrase (scrypt). Without the passphrase an encrypted backup cannot
// be read, by anyone; Admin keeps it somewhere safe outside the app.

import crypto from "node:crypto";
import zlib from "node:zlib";

const MAGIC = Buffer.from("MYSEEDB1");

export type Snapshot = { format: string; version: number; createdAt: string; tables: Record<string, Record<string, unknown>[]> };

export function encodeBackup(snapshot: unknown, passphrase?: string | null) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(snapshot)), { level: 9 });
  if (!passphrase) return gz;
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salt, 32), iv);
  const body = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([MAGIC, salt, iv, c.getAuthTag(), body]);
}

// Reads any backup this app made: encrypted, gzipped, or the plain JSON from `npm run backup`.
export function decodeBackup(buf: Buffer, passphrase?: string | null): Snapshot {
  let raw = buf;
  if (raw.subarray(0, 8).equals(MAGIC)) {
    if (!passphrase) throw new Error("This backup is encrypted. Give the backup passphrase.");
    const salt = raw.subarray(8, 24);
    const iv = raw.subarray(24, 36);
    const tag = raw.subarray(36, 52);
    const d = crypto.createDecipheriv("aes-256-gcm", crypto.scryptSync(passphrase, salt, 32), iv);
    d.setAuthTag(tag);
    try {
      raw = Buffer.concat([d.update(raw.subarray(52)), d.final()]);
    } catch {
      throw new Error("The passphrase is wrong, or the file is damaged.");
    }
  }
  if (raw[0] === 0x1f && raw[1] === 0x8b) raw = zlib.gunzipSync(raw);
  const data = JSON.parse(raw.toString("utf8")) as Snapshot;
  if (data.format !== "myseed-backup" || !data.tables) throw new Error("This is not a Myseed backup.");
  return data;
}
