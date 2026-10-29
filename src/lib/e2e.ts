// End-to-end encryption for direct chats, using the browser's Web Crypto API only.
//
// Each person has an ECDH P-256 key pair. The public key is shared through the server.
// The private key never leaves the browser unencrypted: it is wrapped with AES-GCM using a key
// derived from the person's chat passphrase (PBKDF2, 310,000 rounds) before it is stored, so it
// can be restored on another device. Each conversation uses AES-GCM with a key derived from
// ECDH(my private key, their public key), so only the two participants can read messages.

const PBKDF2_ROUNDS = 310_000;
const DB = "myseed-e2e";

const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

export type Envelope = { v: 1; iv: string; ct: string };

export function isEnvelope(body: string) {
  return body.startsWith('{"v":1,"iv":');
}

async function passphraseKey(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ROUNDS, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// New key pair, with the private key wrapped by the passphrase. Returns what the server stores.
export async function createKeys(passphrase: string) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrap = await passphraseKey(passphrase, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap, enc.encode(JSON.stringify(privateJwk)));
  const privateKey = await crypto.subtle.importKey("jwk", privateJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
  return {
    publicKey: JSON.stringify({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }),
    privateEnc: JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(ct) }),
    privateKey,
  };
}

// Unwraps the stored private key. Throws when the passphrase is wrong.
export async function unlockKeys(privateEnc: string, passphrase: string) {
  const { salt, iv, ct } = JSON.parse(privateEnc) as { salt: string; iv: string; ct: string };
  const wrap = await passphraseKey(passphrase, unb64(salt));
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, wrap, unb64(ct) as BufferSource);
  const jwk = JSON.parse(dec.decode(raw)) as JsonWebKey;
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);
}

export async function conversationKey(privateKey: CryptoKey, peerPublicKey: string) {
  const pub = await crypto.subtle.importKey("jwk", JSON.parse(peerPublicKey) as JsonWebKey, { name: "ECDH", namedCurve: "P-256" }, false, []);
  return crypto.subtle.deriveKey({ name: "ECDH", public: pub }, privateKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptText(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
  const env: Envelope = { v: 1, iv: b64(iv), ct: b64(ct) };
  return JSON.stringify(env);
}

export async function decryptText(key: CryptoKey, body: string): Promise<string | null> {
  try {
    const env = JSON.parse(body) as Envelope;
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(env.iv) as BufferSource }, key, unb64(env.ct) as BufferSource);
    return dec.decode(raw);
  } catch {
    return null;
  }
}

// The unlocked private key is cached per person in IndexedDB as a non-extractable CryptoKey,
// so the passphrase is needed once per device. "Lock secure chat" removes it.
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("keys");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function cacheKey(userId: string, key: CryptoKey) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("keys", "readwrite");
      t.objectStore("keys").put({ key, publicKey: null }, userId);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* private mode: keep the key in memory only */
  }
}

export async function cachedKey(userId: string): Promise<CryptoKey | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction("keys").objectStore("keys").get(userId);
      req.onsuccess = () => resolve((req.result?.key as CryptoKey) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function forgetKey(userId: string) {
  try {
    const db = await openDb();
    db.transaction("keys", "readwrite").objectStore("keys").delete(userId);
  } catch {
    /* nothing cached */
  }
}

// ---------------------------------------------------------------------------
// Automatic keys: protected by the login password instead of a separate chat passphrase.
//
// At sign-in the browser derives a wrapping key from the email and password (PBKDF2, the same rounds as above)
// and keeps only that derived, non-extractable key on the device. The password itself is never stored, and
// the server only ever sees the private key wrapped by it. Changing the password re-wraps the same key pair.
// ---------------------------------------------------------------------------

async function loginSalt(email: string) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(`myseed-e2e-login:${email.trim().toLowerCase()}`)));
}

export async function loginWrapKey(email: string, password: string) {
  return passphraseKey(password, await loginSalt(email));
}

async function storeGet<T>(id: string): Promise<T | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction("keys").objectStore("keys").get(id);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function storePut(id: string, value: unknown) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("keys", "readwrite");
      t.objectStore("keys").put(value, id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch {
    /* private mode: the key is derived again at the next sign-in */
  }
}

// Called by the sign-in form, so secure chat opens without asking for anything.
export async function rememberLogin(email: string, password: string) {
  await storePut(`login:${email.trim().toLowerCase()}`, { key: await loginWrapKey(email, password) });
}

export async function rememberedLogin(email: string): Promise<CryptoKey | null> {
  return (await storeGet<{ key: CryptoKey }>(`login:${email.trim().toLowerCase()}`))?.key ?? null;
}

export async function forgetLogin(email: string) {
  await storePut(`login:${email.trim().toLowerCase()}`, null);
}

async function wrapJwk(jwk: JsonWebKey, wrap: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrap, enc.encode(JSON.stringify(jwk)));
  return JSON.stringify({ kdf: "login", iv: b64(iv), ct: b64(ct) });
}

async function unwrapJwk(privateEnc: string, wrap: CryptoKey): Promise<JsonWebKey> {
  const { iv, ct } = JSON.parse(privateEnc) as { iv: string; ct: string };
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, wrap, unb64(ct) as BufferSource);
  return JSON.parse(dec.decode(raw)) as JsonWebKey;
}

const importPrivate = (jwk: JsonWebKey) => crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey"]);

export async function createKeysWith(wrap: CryptoKey) {
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey"]);
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return {
    publicKey: JSON.stringify({ kty: publicJwk.kty, crv: publicJwk.crv, x: publicJwk.x, y: publicJwk.y }),
    privateEnc: await wrapJwk(privateJwk, wrap),
    privateKey: await importPrivate(privateJwk),
  };
}

export async function unlockWith(privateEnc: string, wrap: CryptoKey) {
  return importPrivate(await unwrapJwk(privateEnc, wrap));
}

// Moves keys protected by the old chat passphrase to the login password (one time, same key pair).
export async function migratePassphrase(privateEnc: string, passphrase: string, wrap: CryptoKey) {
  const { salt, iv, ct } = JSON.parse(privateEnc) as { salt: string; iv: string; ct: string };
  const old = await passphraseKey(passphrase, unb64(salt));
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) as BufferSource }, old, unb64(ct) as BufferSource);
  const jwk = JSON.parse(dec.decode(raw)) as JsonWebKey;
  return { privateEnc: await wrapJwk(jwk, wrap), privateKey: await importPrivate(jwk) };
}

// After a password change: the same private key, wrapped with the new password.
export async function rewrapForPassword(privateEnc: string, email: string, oldPassword: string, newPassword: string) {
  const jwk = await unwrapJwk(privateEnc, await loginWrapKey(email, oldPassword));
  const next = await loginWrapKey(email, newPassword);
  return { privateEnc: await wrapJwk(jwk, next), wrap: next };
}

export async function rememberWrap(email: string, wrap: CryptoKey) {
  await storePut(`login:${email.trim().toLowerCase()}`, { key: wrap });
}

// Files and voice messages in direct chats: 12-byte IV followed by the AES-GCM ciphertext.
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const all = new Uint8Array(data);
  return crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) as BufferSource }, key, all.slice(12) as BufferSource);
}
