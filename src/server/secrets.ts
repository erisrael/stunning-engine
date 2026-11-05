// Encryption for stored credentials (SMTP passwords). The key comes from APP_SECRET when it is set, which keeps
// it outside the database; otherwise a random key is generated once and kept in settings, so it works with no
// setup but a full database copy then includes the key. Setting APP_SECRET later needs the passwords re-entered.

import crypto from "node:crypto";
import { get, nowIso, run } from "./db";

let keyPromise: Promise<Buffer> | null = null;

function key(): Promise<Buffer> {
  keyPromise ??= (async () => {
    if (process.env.APP_SECRET) return crypto.createHash("sha256").update(process.env.APP_SECRET).digest();
    const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.secret'");
    if (row) return Buffer.from(JSON.parse(row.value) as string, "base64");
    await run("INSERT INTO settings (key, value, updated_at) VALUES ('cfg.secret', ?, ?) ON CONFLICT (key) DO NOTHING", JSON.stringify(crypto.randomBytes(32).toString("base64")), nowIso());
    return Buffer.from(JSON.parse((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.secret'"))!.value) as string, "base64");
  })().catch((err) => {
    keyPromise = null;
    throw err;
  });
  return keyPromise;
}

export function secretSource() {
  return process.env.APP_SECRET ? "APP_SECRET" : "database";
}

export async function seal(plain: string): Promise<string> {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", await key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

async function dbFallbackKey(): Promise<Buffer | null> {
  try {
    const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.secret'");
    if (row) return Buffer.from(JSON.parse(row.value) as string, "base64");
  } catch {}
  return null;
}

export async function unseal(sealed: string): Promise<string | null> {
  try {
    const [v, iv, tag, ct] = sealed.split(":");
    if (v !== "v1") return null;
    const tryDecrypt = (k: Buffer): string | null => {
      try {
        const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
        d.setAuthTag(Buffer.from(tag, "base64"));
        return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
      } catch {
        return null;
      }
    };
    const primary = await key();
    const res = tryDecrypt(primary);
    if (res !== null) return res;

    if (process.env.APP_SECRET) {
      const fb = await dbFallbackKey();
      if (fb) {
        const fbRes = tryDecrypt(fb);
        if (fbRes !== null) return fbRes;
      }
    }
    return null;
  } catch {
    return null;
  }
}
