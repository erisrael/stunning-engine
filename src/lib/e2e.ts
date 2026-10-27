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
