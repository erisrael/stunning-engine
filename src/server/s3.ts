// A small S3 client (AWS Signature Version 4) for backups to any S3-compatible storage: Cloudflare R2, Backblaze B2,
// Wasabi, MinIO on the VPS, or Amazon S3. Path-style addresses (endpoint/bucket/key), which all of them accept.

import crypto from "node:crypto";

export type S3Target = { endpoint: string; region: string; bucket: string; accessKeyId: string; secret: string };

const sha256 = (b: Buffer | string) => crypto.createHash("sha256").update(b).digest("hex");
const hmac = (k: Buffer | string, s: string) => crypto.createHmac("sha256", k).update(s).digest();
const enc = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// The Authorization header for one request. Exported for the test against AWS's published example.
export function signV4(r: {
  method: string;
  host: string;
  path: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  payloadHash: string;
  accessKeyId: string;
  secret: string;
  region: string;
  amzDate: string;
}) {
  const date = r.amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: r.host, "x-amz-content-sha256": r.payloadHash, "x-amz-date": r.amzDate };
  for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = v.trim();
  const names = Object.keys(headers).sort();
  const canonicalQuery = Object.entries(r.query ?? {})
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .sort()
    .join("&");
  const canonical = [r.method, r.path.split("/").map(enc).join("/"), canonicalQuery, names.map((n) => `${n}:${headers[n]}\n`).join(""), names.join(";"), r.payloadHash].join("\n");
  const scope = `${date}/${r.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", r.amzDate, scope, sha256(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac(`AWS4${r.secret}`, date), r.region), "s3"), "aws4_request");
  return `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${names.join(";")}, Signature=${crypto.createHmac("sha256", key).update(toSign).digest("hex")}`;
}

async function request(t: S3Target, method: string, key: string, opts: { query?: Record<string, string>; body?: Buffer } = {}) {
  const base = new URL(t.endpoint.replace(/\/+$/, ""));
  const path = `${base.pathname.replace(/\/+$/, "")}/${t.bucket}${key ? `/${key}` : ""}`;
  const amzDate = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const payloadHash = sha256(opts.body ?? "");
  const authorization = signV4({ method, host: base.host, path, query: opts.query, payloadHash, accessKeyId: t.accessKeyId, secret: t.secret, region: t.region || "auto", amzDate });
  const qs = new URLSearchParams(opts.query ?? {}).toString();
  const res = await fetch(`${base.origin}${path.split("/").map(enc).join("/")}${qs ? `?${qs}` : ""}`, {
    method,
    headers: { authorization, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate },
    body: opts.body ? new Uint8Array(opts.body) : undefined,
    signal: AbortSignal.timeout(10 * 60e3),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Storage answered ${res.status}${/<Code>([^<]+)/.exec(text)?.[1] ? ` (${/<Code>([^<]+)/.exec(text)![1]})` : ""}`);
  }
  return res;
}

export async function s3Put(t: S3Target, key: string, body: Buffer) {
  await request(t, "PUT", key, { body });
}

export async function s3Get(t: S3Target, key: string) {
  return Buffer.from(await (await request(t, "GET", key)).arrayBuffer());
}

export async function s3Delete(t: S3Target, key: string) {
  await request(t, "DELETE", key);
}

export async function s3List(t: S3Target, prefix: string): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const xml = await (await request(t, "GET", "", { query: { "list-type": "2", prefix, ...(token ? { "continuation-token": token } : {}) } })).text();
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]+)<\/Key>/.exec(m[1]!)?.[1];
      if (key) out.push({ key: key.replace(/&amp;/g, "&"), size: Number(/<Size>(\d+)<\/Size>/.exec(m[1]!)?.[1] ?? 0) });
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] : undefined;
  } while (token);
  return out;
}
