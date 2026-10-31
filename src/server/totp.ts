// Authenticator app codes (TOTP, RFC 6238): six digits from a shared secret and the time, a new code every 30 seconds.
// Works with Google Authenticator, Microsoft Authenticator, Authy and the others.

import crypto from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP = 30;

export function toBase32(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function fromBase32(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const c of clean) {
    value = (value << 5) | B32.indexOf(c);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function newTotpSecret() {
  return toBase32(crypto.randomBytes(20));
}

export function totpCode(secretB32: string, step: number) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", fromBase32(secretB32)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

export const currentStep = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

// The step the code belongs to (one step either side allows for a phone clock that is slightly off), or null.
// A step at or before `usedStep` is refused, so a code seen over someone's shoulder cannot be used again.
export function matchTotp(secretB32: string, code: string, usedStep = 0, ms = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = currentStep(ms);
  for (const step of [now, now - 1, now + 1]) {
    if (step <= usedStep) continue;
    const want = Buffer.from(totpCode(secretB32, step));
    if (crypto.timingSafeEqual(want, Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUrl(secretB32: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}
