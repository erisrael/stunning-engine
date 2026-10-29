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

export async function unseal(sealed: string): Promise<string | null> {
  try {
    const [v, iv, tag, ct] = sealed.split(":");
    if (v !== "v1") return null;
    const d = crypto.createDecipheriv("aes-256-gcm", await key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
