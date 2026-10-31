// Matching an internet address against a site's networks: single addresses ("196.188.10.5"), ranges
// ("196.188.10.0/24", "2001:db8::/48"). Names that follow a changing address (dynamic DNS) are resolved on the server.

function v4(ip: string): bigint | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  return parts.reduce((n, p) => (n << BigInt(8)) | BigInt(p), BigInt(0));
}

function v6(ip: string): bigint | null {
  let s = ip.toLowerCase();
  if (s.includes("%")) s = s.split("%")[0]!;
  // An IPv4 tail (::ffff:1.2.3.4) becomes two groups.
  const tail = /(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(s);
  if (tail) {
    const n = v4(tail[1]!);
    if (n === null) return null;
    s = `${s.slice(0, -tail[1]!.length)}${(n >> BigInt(16)).toString(16)}:${(n & BigInt(0xffff)).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.reduce((n, g) => (n << BigInt(16)) | BigInt(parseInt(g, 16)), BigInt(0));
}

// An address as a number and its family; IPv4 written inside IPv6 (::ffff:1.2.3.4) counts as IPv4.
export function parseIp(ip: string): { family: 4 | 6; n: bigint } | null {
  const t = ip.trim().replace(/^\[|\]$/g, "");
  const a = v4(t);
  if (a !== null) return { family: 4, n: a };
  const b = v6(t);
  if (b === null) return null;
  if (b >> BigInt(32) === BigInt(0xffff)) return { family: 4, n: b & BigInt(0xffffffff) };
  return { family: 6, n: b };
}

export function isIpOrRange(entry: string) {
  const [addr, bits] = entry.trim().split("/");
  const p = parseIp(addr ?? "");
  if (!p) return false;
  if (bits === undefined) return true;
  const n = Number(bits);
  return Number.isInteger(n) && n >= 0 && n <= (p.family === 4 ? 32 : 128);
}

export function ipInRange(ip: string, entry: string) {
  const a = parseIp(ip);
  const [addr, bits] = entry.trim().split("/");
  const r = parseIp(addr ?? "");
  if (!a || !r || a.family !== r.family) return false;
  const size = a.family === 4 ? 32 : 128;
  const prefix = bits === undefined ? size : Number(bits);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > size) return false;
  const shift = BigInt(size - prefix);
  return a.n >> shift === r.n >> shift;
}

// A host name (for dynamic DNS), as opposed to an address or range.
export function isHostName(entry: string) {
  return !isIpOrRange(entry) && /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(entry.trim());
}
