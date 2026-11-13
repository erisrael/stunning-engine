// Integrate a platform (Phase 27): connect any SMS, email, payment or other provider by its API, without code and
// without an AI. Admin gives the address of the provider's API documentation (or its OpenAPI / Swagger file, or
// pastes it, or picks a ready preset). The app then:
// 1. reads it: an OpenAPI 3 or Swagger 2 file (JSON or YAML), or a documentation page, where it looks for the
//    spec's link (Swagger UI, Redoc, the usual /openapi.json paths) and, failing that, the curl examples;
// 2. lists the operations, finds the one that fits the purpose (send an SMS, send an email, start a payment) from
//    its words and fields, and matches its fields to the app's (to, message, subject, amount, reference...);
// 3. sets up the sign-in (API key in a header or the address, bearer token, basic, OAuth client credentials);
// 4. tests it with a real call, and once switched on the app uses it: SMS from the app, email when chosen for the
//    app's own mail, payment links. Every call is logged (without secrets).

import crypto from "node:crypto";
import YAML from "yaml";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { seal, unseal } from "./secrets";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

import { CAPABILITIES, matchFields, type Capability, type Field } from "@/lib/connector-match";
export { CAPABILITIES, matchFields, type Capability };

export type AuthKind = "none" | "header" | "query" | "bearer" | "basic" | "oauth2";
export type Auth = { kind: AuthKind; name?: string; prefix?: string; tokenUrl?: string; scope?: string };
export type { Field };
export type Operation = { id: string; method: string; path: string; summary: string; contentType: "json" | "form" | "none"; fields: Field[] };
export type ResponseMap = { okPath?: string; okValue?: string; idPath?: string; urlPath?: string; errorPath?: string };
export type ConnectorDraft = {
  name: string;
  capability: Capability;
  baseUrl: string;
  auth: Auth;
  operation: { method: string; path: string; contentType: "json" | "form" | "none"; map: Record<string, string>; headers: Record<string, string> };
  response: ResponseMap;
  docsUrl?: string | null;
  specUrl?: string | null;
  preset?: string | null;
};
export type Connector = ConnectorDraft & { id: string; status: "draft" | "active"; priority?: number; isDefault: boolean; useForSystem: boolean; hasSecrets: boolean; secretNames: string[]; operations: Operation[]; lastTest: { ok: boolean; at: string; status: number; detail: string } | null; createdAt: string };

const need = (u: AppUser) => {
  if (!can(u, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin connects platforms.");
};

// ---------------------------------------------------------------------------
// Reading the documentation
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT = 15000;
async function fetchText(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new WorkflowError("VALIDATION", "Give the address starting with https://.");
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT), headers: { Accept: "application/json, application/yaml, text/yaml, text/html;q=0.9, */*;q=0.5", "User-Agent": "Myseed-Connector/1.0" }, redirect: "follow" }).catch((e) => {
    throw new WorkflowError("INVALID_STATE", `The address could not be reached (${e instanceof Error ? e.message : "network"}).`);
  });
  const text = (await res.text()).slice(0, 6_000_000);
  return { ok: res.ok, status: res.status, type: res.headers.get("content-type") ?? "", text, url: res.url || url };
}

function parseSpec(text: string): Record<string, unknown> | null {
  const t = text.trim();
  try {
    const j = t.startsWith("{") ? JSON.parse(t) : YAML.parse(t);
    if (j && typeof j === "object" && ("openapi" in j || "swagger" in j) && "paths" in j) return j as Record<string, unknown>;
  } catch {
    // Not a spec.
  }
  return null;
}

// Where a documentation page keeps its OpenAPI file.
export function specLinks(html: string, pageUrl: string): string[] {
  const found = new Set<string>();
  const add = (u: string) => {
    try {
      found.add(new URL(u.replace(/&amp;/g, "&"), pageUrl).toString());
    } catch {
      // Not an address.
    }
  };
  for (const m of html.matchAll(/(?:spec-url|data-spec-url|specUrl)\s*=\s*["']([^"']+)["']/gi)) add(m[1]!);
  for (const m of html.matchAll(/\burl\s*:\s*["']([^"']+\.(?:json|ya?ml)[^"']*)["']/gi)) add(m[1]!);
  for (const m of html.matchAll(/(?:href|src)\s*=\s*["']([^"']*(?:openapi|swagger|api-docs)[^"']*)["']/gi)) add(m[1]!);
  for (const m of html.matchAll(/["'](\/[^"'\s]*(?:openapi|swagger)[^"'\s]*\.(?:json|ya?ml))["']/gi)) add(m[1]!);
  const origin = new URL(pageUrl).origin;
  for (const p of ["/openapi.json", "/swagger.json", "/v3/api-docs", "/api-docs", "/openapi.yaml", "/swagger/v1/swagger.json", "/api/openapi.json", "/docs/openapi.json"]) found.add(`${origin}${p}`);
  return [...found].slice(0, 20);
}

type Spec = Record<string, unknown> & { paths: Record<string, Record<string, Record<string, unknown>>> };

function resolve(spec: Spec, node: unknown, depth = 0): Record<string, unknown> {
  if (!node || typeof node !== "object" || depth > 6) return {};
  const n = node as Record<string, unknown>;
  if (typeof n.$ref === "string") {
    const parts = n.$ref.replace(/^#\//, "").split("/");
    let cur: unknown = spec;
    for (const p of parts) cur = (cur as Record<string, unknown>)?.[p.replace(/~1/g, "/").replace(/~0/g, "~")];
    return resolve(spec, cur, depth + 1);
  }
  if (Array.isArray(n.allOf)) return n.allOf.reduce<Record<string, unknown>>((acc, x) => {
    const r = resolve(spec, x, depth + 1);
    return { ...acc, ...r, properties: { ...((acc.properties as object) ?? {}), ...((r.properties as object) ?? {}) }, required: [...((acc.required as string[]) ?? []), ...((r.required as string[]) ?? [])] };
  }, {});
  return n;
}

// Body fields, flattened one level ("customer.email") so nested providers map too.
function bodyFields(spec: Spec, schema: unknown, prefix = "", depth = 0): Field[] {
  const s = resolve(spec, schema);
  const props = (s.properties ?? {}) as Record<string, unknown>;
  const req = new Set((s.required as string[]) ?? []);
  const out: Field[] = [];
  for (const [k, v] of Object.entries(props).slice(0, 80)) {
    const p = resolve(spec, v);
    const name = prefix ? `${prefix}.${k}` : k;
    if (p.type === "object" && p.properties && depth < 1) out.push(...bodyFields(spec, p, name, depth + 1));
    else out.push({ name, in: "body", required: req.has(k), type: String(p.type ?? (p.items ? "array" : "string")), description: typeof p.description === "string" ? p.description.slice(0, 160) : undefined });
  }
  return out;
}

export function readSpec(spec: Spec): { title: string; baseUrl: string; auths: Auth[]; operations: Operation[] } {
  const info = (spec.info ?? {}) as { title?: string };
  let baseUrl = "";
  if (Array.isArray(spec.servers) && spec.servers[0]) {
    const sv = spec.servers[0] as { url: string; variables?: Record<string, { default?: string }> };
    baseUrl = sv.url.replace(/\{(\w+)\}/g, (_, k) => sv.variables?.[k]?.default ?? k);
  } else if (spec.host) baseUrl = `${Array.isArray(spec.schemes) ? spec.schemes[0] : "https"}://${spec.host}${spec.basePath ?? ""}`;
  const schemes = { ...(((spec.components as Record<string, unknown>)?.securitySchemes as object) ?? {}), ...((spec.securityDefinitions as object) ?? {}) } as Record<string, Record<string, unknown>>;
  const auths: Auth[] = Object.values(schemes).map((s) => {
    if (s.type === "apiKey") return { kind: s.in === "query" ? "query" : "header", name: String(s.name ?? "X-API-Key") } as Auth;
    if (s.type === "http" && s.scheme === "basic") return { kind: "basic" } as Auth;
    if (s.type === "basic") return { kind: "basic" } as Auth;
    if (s.type === "http") return { kind: "bearer" } as Auth;
    if (s.type === "oauth2") {
      const flows = (s.flows ?? {}) as Record<string, { tokenUrl?: string; scopes?: Record<string, string> }>;
      const cc = flows.clientCredentials ?? (s.flow === "application" ? { tokenUrl: s.tokenUrl as string } : null);
      return cc?.tokenUrl ? ({ kind: "oauth2", tokenUrl: cc.tokenUrl, scope: Object.keys(cc.scopes ?? {}).join(" ") } as Auth) : ({ kind: "bearer" } as Auth);
    }
    return { kind: "bearer" } as Auth;
  });
  const operations: Operation[] = [];
  for (const [path, item] of Object.entries(spec.paths ?? {}).slice(0, 600))
    for (const [method, op] of Object.entries(item ?? {})) {
      if (!["get", "post", "put", "patch", "delete"].includes(method)) continue;
      const o = op as Record<string, unknown>;
      const params = [...(((item as unknown as { parameters?: unknown[] }).parameters) ?? []), ...((o.parameters as unknown[]) ?? [])].map((p) => resolve(spec, p));
      const fields: Field[] = [];
      let contentType: Operation["contentType"] = "none";
      for (const p of params) {
        if (p.in === "body") {
          fields.push(...bodyFields(spec, p.schema));
          contentType = "json";
        } else if (p.in === "formData") {
          fields.push({ name: String(p.name), in: "form", required: !!p.required, type: String(p.type ?? "string") });
          contentType = "form";
        } else if (p.in === "query" || p.in === "path" || p.in === "header") fields.push({ name: String(p.name), in: p.in as Field["in"], required: !!p.required || p.in === "path", type: String((p.schema as { type?: string })?.type ?? p.type ?? "string") });
      }
      const rb = resolve(spec, o.requestBody);
      const content = (rb.content ?? {}) as Record<string, { schema?: unknown }>;
      const json = Object.keys(content).find((k) => /json/.test(k));
      const form = Object.keys(content).find((k) => /form/.test(k));
      if (json) (contentType = "json"), fields.push(...bodyFields(spec, content[json]!.schema));
      else if (form) (contentType = "form"), fields.push(...bodyFields(spec, content[form]!.schema).map((f) => ({ ...f, in: "form" as const })));
      operations.push({ id: String(o.operationId ?? `${method}_${path}`).slice(0, 120), method: method.toUpperCase(), path, summary: String(o.summary ?? o.description ?? "").slice(0, 200), contentType, fields });
    }
  return { title: String(info.title ?? "API"), baseUrl: baseUrl.replace(/\/$/, ""), auths, operations };
}

// Without a spec: the curl examples on the documentation page.
export function readCurl(html: string): { baseUrl: string; auths: Auth[]; operations: Operation[] } {
  const text = html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\\\s*\n/g, " ");
  const operations: Operation[] = [];
  const auths: Auth[] = [];
  let baseUrl = "";
  for (const m of text.matchAll(/curl\b([^\n]*(?:\n\s+-[^\n]*)*)/g)) {
    const cmd = m[1]!;
    const url = cmd.match(/['"]?(https?:\/\/[^\s'"]+)['"]?/)?.[1];
    if (!url) continue;
    const u = new URL(url);
    const method = (cmd.match(/(?:-X|--request)\s+['"]?(\w+)/)?.[1] ?? (/(?:-d|--data|-F|--form)\b/.test(cmd) ? "POST" : "GET")).toUpperCase();
    const fields: Field[] = [];
    let contentType: Operation["contentType"] = "none";
    const data = cmd.match(/(?:-d|--data(?:-raw)?)\s+'([^']*)'|(?:-d|--data(?:-raw)?)\s+"((?:[^"\\]|\\.)*)"/);
    const body = data ? (data[1] ?? data[2] ?? "").replace(/\\"/g, '"') : "";
    if (body.trim().startsWith("{")) {
      contentType = "json";
      try {
        const flat = (o: Record<string, unknown>, pre = ""): void => {
          for (const [k, v] of Object.entries(o)) v && typeof v === "object" && !Array.isArray(v) ? flat(v as Record<string, unknown>, `${pre}${k}.`) : fields.push({ name: `${pre}${k}`, in: "body", required: true, type: typeof v === "number" ? "number" : "string" });
        };
        flat(JSON.parse(body));
      } catch {
        for (const k of body.matchAll(/"(\w+)"\s*:/g)) fields.push({ name: k[1]!, in: "body", required: true, type: "string" });
      }
    } else if (body) {
      contentType = "form";
      for (const kv of body.split("&")) if (kv.includes("=")) fields.push({ name: decodeURIComponent(kv.split("=")[0]!), in: "form", required: true, type: "string" });
    }
    for (const f of cmd.matchAll(/(?:-F|--form|--data-urlencode)\s+['"]?([\w\[\].]+)=/g)) (contentType = "form"), fields.push({ name: f[1]!, in: "form", required: true, type: "string" });
    for (const [k] of u.searchParams) fields.push({ name: k, in: "query", required: true, type: "string" });
    for (const h of cmd.matchAll(/(?:-H|--header)\s+['"]([^:'"]+):\s*([^'"]*)['"]/g)) {
      const name = h[1]!.trim();
      const val = h[2]!.trim();
      if (/^authorization$/i.test(name)) auths.push(/^basic/i.test(val) ? { kind: "basic" } : { kind: "bearer" });
      else if (/key|token|secret/i.test(name)) auths.push({ kind: "header", name });
    }
    if (/\s-u\s|--user\s/.test(cmd)) auths.push({ kind: "basic" });
    if (!baseUrl) baseUrl = u.origin;
    operations.push({ id: `${method}_${u.pathname}`, method, path: u.pathname, summary: `From the example: ${method} ${u.pathname}`, contentType, fields });
  }
  return { baseUrl, auths, operations };
}

export type Discovery = { source: "openapi" | "curl" | "none"; title: string; baseUrl: string; specUrl: string | null; auths: Auth[]; operations: Operation[]; tried: string[] };

export async function discover(input: { url?: string | null; spec?: string | null }): Promise<Discovery> {
  const tried: string[] = [];
  if (input.spec?.trim()) {
    const s = parseSpec(input.spec);
    if (!s) throw new WorkflowError("VALIDATION", "That text is not an OpenAPI or Swagger file (JSON or YAML).");
    return { source: "openapi", specUrl: null, tried, ...readSpec(s as Spec) };
  }
  const url = String(input.url ?? "").trim();
  const page = await fetchText(url);
  tried.push(url);
  const direct = parseSpec(page.text);
  if (direct) return { source: "openapi", specUrl: page.url, tried, ...readSpec(direct as Spec) };
  if (/html/i.test(page.type) || /<html|<body|<div/i.test(page.text)) {
    for (const link of specLinks(page.text, page.url)) {
      tried.push(link);
      const r = await fetchText(link).catch(() => null);
      const s = r?.ok ? parseSpec(r.text) : null;
      if (s) return { source: "openapi", specUrl: link, tried, ...readSpec(s as Spec) };
    }
    const c = readCurl(page.text);
    if (c.operations.length) return { source: "curl", title: page.text.match(/<title>([^<]+)<\/title>/i)?.[1]?.trim() ?? new URL(page.url).hostname, specUrl: null, tried, ...c };
  }
  return { source: "none", title: new URL(page.url).hostname, baseUrl: new URL(page.url).origin, specUrl: null, auths: [], operations: [], tried };
}

// ---------------------------------------------------------------------------
// Choosing the operation and matching fields
// ---------------------------------------------------------------------------

const WORDS: Record<Capability, RegExp> = {
  sms: /\b(sms|text ?message|messag|send|bulk|notify)/i,
  email: /\b(e-?mail|mail|send|smtp|message)/i,
  payment: /\b(payment|pay|charge|checkout|transaction|initiali[sz]e|invoice|order|session|link)/i,
  webhook: /\b(event|webhook|hook|notify|message|post)/i,
  other: /./,
};
const AVOID = /\b(list|get|delete|remove|status|report|balance|history|refund|cancel|template|webhook|verify)\b/i;

export function chooseOperation(capability: Capability, ops: Operation[]): Operation | null {
  const vars = CAPABILITIES[capability].vars as readonly string[];
  let best: Operation | null = null;
  let bestScore = -Infinity;
  for (const o of ops) {
    const words = `${o.id} ${o.path} ${o.summary}`;
    let s = 0;
    if (WORDS[capability].test(words)) s += 5;
    if (/send|create|initiali|post/i.test(words)) s += 2;
    if (AVOID.test(o.summary) || AVOID.test(o.id)) s -= 4;
    if (o.method === "POST") s += 2;
    if (o.method === "GET" && capability !== "other") s -= 1;
    const m = matchFields(capability, o.fields);
    s += Object.values(m).filter((x) => x.startsWith("{{")).length * 2;
    s -= Object.values(m).filter((x) => x === "").length * 0.5;
    if (capability === "sms" && o.fields.some((f) => /phone|to|msisdn|recipient/i.test(f.name)) && o.fields.some((f) => /message|text|body|msg/i.test(f.name))) s += 4;
    if (capability === "payment" && o.fields.some((f) => /amount/i.test(f.name))) s += 4;
    if (capability === "email" && o.fields.some((f) => /subject/i.test(f.name))) s += 4;
    if (s > bestScore) [best, bestScore] = [o, s];
  }
  return bestScore > 0 ? best : (ops[0] ?? null);
}

function guessResponse(capability: Capability): ResponseMap {
  if (capability === "payment") return { urlPath: "data.checkout_url|data.authorization_url|url|data.link|link|checkout_url|payment_url", idPath: "data.reference|id|data.id|reference", errorPath: "message|error.message|error" };
  return { idPath: "id|message_id|messageId|data.id|sid|data.message_id|response.message_id", errorPath: "message|error.message|error|errors.0.message" };
}

export function draftFrom(d: Discovery, capability: Capability, docsUrl: string | null): ConnectorDraft {
  const op = chooseOperation(capability, d.operations);
  return {
    name: d.title.slice(0, 60) || "Provider",
    capability,
    baseUrl: d.baseUrl,
    auth: d.auths[0] ?? { kind: "bearer" },
    operation: op ? { method: op.method, path: op.path, contentType: op.contentType === "none" && op.method !== "GET" ? "json" : op.contentType, map: matchFields(capability, op.fields), headers: {} } : { method: "POST", path: "/", contentType: "json", map: {}, headers: {} },
    response: guessResponse(capability),
    docsUrl,
    specUrl: d.specUrl,
  };
}

// ---------------------------------------------------------------------------
// Ready presets (the same engine, filled in from each provider's documentation)
// ---------------------------------------------------------------------------

export const PRESETS: (ConnectorDraft & { key: string; region: string; secrets: { name: string; label: string }[] })[] = [
  {
    key: "afromessage",
    region: "Ethiopia",
    name: "AfroMessage",
    capability: "sms",
    baseUrl: "https://api.afromessage.com",
    auth: { kind: "bearer" },
    operation: { method: "POST", path: "/api/send", contentType: "json", map: { to: "{{to}}", message: "{{message}}", from: "{{secret.identifier}}", sender: "{{sender}}" }, headers: {} },
    response: { okPath: "acknowledge", okValue: "success", idPath: "response.message_id", errorPath: "response.errors.0" },
    docsUrl: "https://www.afromessage.com/developers",
    secrets: [{ name: "token", label: "API token" }, { name: "identifier", label: "Identifier ID" }],
  },
  {
    key: "africastalking",
    region: "Africa",
    name: "Africa's Talking SMS",
    capability: "sms",
    baseUrl: "https://api.africastalking.com",
    auth: { kind: "header", name: "apiKey" },
    operation: { method: "POST", path: "/version1/messaging", contentType: "form", map: { username: "{{secret.username}}", to: "{{to}}", message: "{{message}}", from: "{{sender}}" }, headers: { Accept: "application/json" } },
    response: { okPath: "SMSMessageData.Recipients.0.status", okValue: "Success", idPath: "SMSMessageData.Recipients.0.messageId", errorPath: "SMSMessageData.Message" },
    docsUrl: "https://developers.africastalking.com/docs/sms/sending",
    secrets: [{ name: "token", label: "API key" }, { name: "username", label: "Username" }],
  },
  {
    key: "twilio",
    region: "Worldwide",
    name: "Twilio SMS",
    capability: "sms",
    baseUrl: "https://api.twilio.com",
    auth: { kind: "basic" },
    operation: { method: "POST", path: "/2010-04-01/Accounts/{{secret.username}}/Messages.json", contentType: "form", map: { To: "{{to}}", From: "{{sender}}", Body: "{{message}}" }, headers: {} },
    response: { idPath: "sid", errorPath: "message" },
    docsUrl: "https://www.twilio.com/docs/messaging/api/message-resource",
    secrets: [{ name: "username", label: "Account SID" }, { name: "password", label: "Auth token" }],
  },
  {
    key: "sendgrid",
    region: "Worldwide",
    name: "SendGrid email",
    capability: "email",
    baseUrl: "https://api.sendgrid.com",
    auth: { kind: "bearer" },
    operation: { method: "POST", path: "/v3/mail/send", contentType: "json", map: { "personalizations.0.to.0.email": "{{to}}", "from.email": "{{from}}", "from.name": "{{fromName}}", subject: "{{subject}}", "content.0.type": "text/plain", "content.0.value": "{{text}}" }, headers: {} },
    response: { errorPath: "errors.0.message" },
    docsUrl: "https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send",
    secrets: [{ name: "token", label: "API key" }],
  },
  {
    key: "brevo",
    region: "Worldwide",
    name: "Brevo email",
    capability: "email",
    baseUrl: "https://api.brevo.com",
    auth: { kind: "header", name: "api-key" },
    operation: { method: "POST", path: "/v3/smtp/email", contentType: "json", map: { "sender.email": "{{from}}", "sender.name": "{{fromName}}", "to.0.email": "{{to}}", subject: "{{subject}}", textContent: "{{text}}", htmlContent: "{{html}}" }, headers: { Accept: "application/json" } },
    response: { idPath: "messageId", errorPath: "message" },
    docsUrl: "https://developers.brevo.com/reference/sendtransacemail",
    secrets: [{ name: "token", label: "API key" }],
  },
  {
    key: "mailgun",
    region: "Worldwide",
    name: "Mailgun email",
    capability: "email",
    baseUrl: "https://api.mailgun.net",
    auth: { kind: "basic" },
    operation: { method: "POST", path: "/v3/{{secret.domain}}/messages", contentType: "form", map: { from: "{{fromName}} <{{from}}>", to: "{{to}}", subject: "{{subject}}", text: "{{text}}", html: "{{html}}" }, headers: {} },
    response: { idPath: "id", errorPath: "message" },
    docsUrl: "https://documentation.mailgun.com/docs/mailgun/api-reference/send/mailgun/messages",
    secrets: [{ name: "username", label: "User (api)" }, { name: "password", label: "API key" }, { name: "domain", label: "Sending domain" }],
  },
  {
    key: "chapa",
    region: "Ethiopia",
    name: "Chapa payments",
    capability: "payment",
    baseUrl: "https://api.chapa.co",
    auth: { kind: "bearer" },
    operation: { method: "POST", path: "/v1/transaction/initialize", contentType: "json", map: { amount: "{{amount}}", currency: "{{currency}}", email: "{{email}}", first_name: "{{first_name}}", last_name: "{{last_name}}", phone_number: "{{phone}}", tx_ref: "{{reference}}", callback_url: "{{callback_url}}", return_url: "{{return_url}}", "customization.title": "Payment", "customization.description": "{{description}}" }, headers: {} },
    response: { okPath: "status", okValue: "success", urlPath: "data.checkout_url", errorPath: "message" },
    docsUrl: "https://developer.chapa.co/integrations/accept-payments",
    secrets: [{ name: "token", label: "Secret key" }],
  },
  {
    key: "paystack",
    region: "Africa",
    name: "Paystack payments",
    capability: "payment",
    baseUrl: "https://api.paystack.co",
    auth: { kind: "bearer" },
    operation: { method: "POST", path: "/transaction/initialize", contentType: "json", map: { email: "{{email}}", amount: "{{amount_cents}}", currency: "{{currency}}", reference: "{{reference}}", callback_url: "{{callback_url}}" }, headers: {} },
    response: { okPath: "status", okValue: "true", urlPath: "data.authorization_url", idPath: "data.reference", errorPath: "message" },
    docsUrl: "https://paystack.com/docs/api/transaction/#initialize",
    secrets: [{ name: "token", label: "Secret key" }],
  },
  {
    key: "stripe",
    region: "Worldwide",
    name: "Stripe checkout",
    capability: "payment",
    baseUrl: "https://api.stripe.com",
    auth: { kind: "bearer" },
    operation: { method: "POST", path: "/v1/checkout/sessions", contentType: "form", map: { mode: "payment", "line_items[0][price_data][currency]": "{{currency}}", "line_items[0][price_data][product_data][name]": "{{description}}", "line_items[0][price_data][unit_amount]": "{{amount_cents}}", "line_items[0][quantity]": "1", success_url: "{{return_url}}", client_reference_id: "{{reference}}", customer_email: "{{email}}" }, headers: {} },
    response: { urlPath: "url", idPath: "id", errorPath: "error.message" },
    docsUrl: "https://docs.stripe.com/api/checkout/sessions/create",
    secrets: [{ name: "token", label: "Secret key" }],
  },
];

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

type Row = { id: string; name: string; capability: string; draft: string; operations: string; secrets: string | null; status: string; is_default: number; use_for_system: number; last_test: string | null; created_at: string; priority?: number };
const toConnector = (r: Row): Connector => {
  const d = parseJson<ConnectorDraft>(r.draft, {} as ConnectorDraft);
  const names = r.secrets ? (parseJson<{ names?: string[] }>(r.secrets, {}).names ?? []) : [];
  return { ...d, id: r.id, name: r.name, capability: r.capability as Capability, status: r.status === "active" ? "active" : "draft", priority: Number(r.priority ?? 100), isDefault: !!Number(r.is_default), useForSystem: !!Number(r.use_for_system), hasSecrets: names.length > 0, secretNames: names, operations: parseJson<Operation[]>(r.operations, []), lastTest: parseJson(r.last_test, null), createdAt: r.created_at };
};

export async function listConnectors(user: AppUser) {
  need(user);
  return (await all<Row>("SELECT * FROM int_connectors ORDER BY capability, is_default DESC, priority, name")).map(toConnector);
}

function cleanDraft(d: Partial<ConnectorDraft>): ConnectorDraft {
  const cap = (d.capability && d.capability in CAPABILITIES ? d.capability : "other") as Capability;
  const base = String(d.baseUrl ?? "").trim().replace(/\/$/, "");
  if (!/^https?:\/\/[^\s]+$/i.test(base)) throw new WorkflowError("VALIDATION", "Give the API's address (https://...).");
  const auth = d.auth ?? { kind: "none" };
  const op = d.operation ?? { method: "POST", path: "/", contentType: "json", map: {}, headers: {} };
  return {
    name: String(d.name ?? "").trim().slice(0, 60) || "Provider",
    capability: cap,
    baseUrl: base,
    auth: { kind: (["none", "header", "query", "bearer", "basic", "oauth2"].includes(auth.kind) ? auth.kind : "bearer") as AuthKind, name: auth.name?.slice(0, 80), prefix: auth.prefix?.slice(0, 20), tokenUrl: auth.tokenUrl?.slice(0, 300), scope: auth.scope?.slice(0, 300) },
    operation: {
      method: ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(op.method).toUpperCase()) ? String(op.method).toUpperCase() : "POST",
      path: String(op.path ?? "/").slice(0, 400).startsWith("/") ? String(op.path).slice(0, 400) : `/${String(op.path ?? "").slice(0, 399)}`,
      contentType: (["json", "form", "none"].includes(op.contentType) ? op.contentType : "json") as "json" | "form" | "none",
      map: Object.fromEntries(Object.entries(op.map ?? {}).slice(0, 80).map(([k, v]) => [String(k).slice(0, 120), String(v ?? "").slice(0, 2000)])),
      headers: Object.fromEntries(Object.entries(op.headers ?? {}).slice(0, 20).filter(([k]) => /^[\w-]{1,60}$/.test(k)).map(([k, v]) => [k, String(v).slice(0, 500)])),
    },
    response: { okPath: d.response?.okPath?.slice(0, 200), okValue: d.response?.okValue?.slice(0, 100), idPath: d.response?.idPath?.slice(0, 300), urlPath: d.response?.urlPath?.slice(0, 300), errorPath: d.response?.errorPath?.slice(0, 200) },
    docsUrl: d.docsUrl?.slice(0, 400) ?? null,
    specUrl: d.specUrl?.slice(0, 400) ?? null,
    preset: d.preset?.slice(0, 40) ?? null,
  };
}

export async function saveConnector(user: AppUser, input: Partial<ConnectorDraft> & { id?: string | null; operations?: Operation[]; secrets?: Record<string, string> | null; status?: string; isDefault?: boolean; useForSystem?: boolean }) {
  need(user);
  const d = cleanDraft(input);
  const now = nowIso();
  let sealed: string | null | undefined = undefined;
  if (input.secrets && Object.values(input.secrets).some((v) => String(v ?? "").trim())) {
    const cur = input.id ? await get<{ secrets: string | null }>("SELECT secrets FROM int_connectors WHERE id = ?", input.id) : undefined;
    const old = cur?.secrets ? parseJson<{ blob?: string }>(cur.secrets, {}) : {};
    const prev = old.blob ? parseJson<Record<string, string>>(await unseal(old.blob), {}) : {};
    const next = { ...prev, ...Object.fromEntries(Object.entries(input.secrets).filter(([, v]) => String(v ?? "").trim()).map(([k, v]) => [k.slice(0, 40), String(v).trim().slice(0, 4000)])) };
    sealed = JSON.stringify({ names: Object.keys(next), blob: await seal(JSON.stringify(next)) });
  }
  const status = input.status === "active" ? "active" : "draft";
  if (input.id) {
    if (!(await get("SELECT 1 AS x FROM int_connectors WHERE id = ?", input.id))) throw new WorkflowError("NOT_FOUND", "Not found.");
    await run(`UPDATE int_connectors SET name = ?, capability = ?, draft = ?, status = ?, use_for_system = ?, ${input.operations ? "operations = ?," : ""} ${sealed !== undefined ? "secrets = ?," : ""} updated_at = ? WHERE id = ?`, d.name, d.capability, JSON.stringify(d), status, input.useForSystem ? 1 : 0, ...(input.operations ? [JSON.stringify(input.operations.slice(0, 300))] : []), ...(sealed !== undefined ? [sealed] : []), now, input.id);
  }
  const id = input.id ?? uid("con_");
  if (!input.id) await run("INSERT INTO int_connectors (id, name, capability, draft, operations, secrets, status, is_default, use_for_system, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)", id, d.name, d.capability, JSON.stringify(d), JSON.stringify((input.operations ?? []).slice(0, 300)), sealed ?? null, status, input.useForSystem ? 1 : 0, user.id, now, now);
  // One default per purpose: the first active one, or the one Admin picks.
  if (input.isDefault || (status === "active" && !(await get("SELECT 1 AS x FROM int_connectors WHERE capability = ? AND is_default = 1 AND id <> ?", d.capability, id)))) {
    await run("UPDATE int_connectors SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END WHERE capability = ?", id, d.capability);
  }
  await audit({ actor: user }, { action: "integrations.connector", summary: `${user.name} saved the ${CAPABILITIES[d.capability].label} connection "${d.name}" (${status})` });
  return id;
}

export async function deleteConnector(user: AppUser, id: string) {
  need(user);
  await run("DELETE FROM int_connectors WHERE id = ?", id);
}

// Read the docs (or a spec), and return a draft ready to review.
export async function setupFromDocs(user: AppUser, input: { url?: string | null; spec?: string | null; capability: Capability }) {
  need(user);
  const d = await discover(input);
  if (!d.operations.length) throw new WorkflowError("VALIDATION", `No API operations were found${d.tried.length ? ` (looked at ${d.tried.length} addresses)` : ""}. Give the OpenAPI or Swagger file's address, paste it, or choose a preset.`);
  return { discovery: { source: d.source, title: d.title, specUrl: d.specUrl, auths: d.auths, operations: d.operations, count: d.operations.length, tried: d.tried.length }, draft: draftFrom(d, input.capability, input.url ?? null) };
}

// ---------------------------------------------------------------------------
// Calling
// ---------------------------------------------------------------------------

export function pick(obj: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  for (const alt of path.split("|")) {
    let cur: unknown = obj;
    for (const k of alt.split(".")) cur = cur == null ? undefined : (cur as Record<string, unknown>)[k];
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const keys = path.split(".");
  let cur: Record<string, unknown> | unknown[] = target;
  keys.forEach((k, i) => {
    const last = i === keys.length - 1;
    const nextIsIndex = /^\d+$/.test(keys[i + 1] ?? "");
    const key: string | number = Array.isArray(cur) ? Number(k) : k;
    if (last) (cur as Record<string | number, unknown>)[key] = value;
    else {
      const c = cur as Record<string | number, unknown>;
      if (c[key] === undefined || typeof c[key] !== "object") c[key] = nextIsIndex ? [] : {};
      cur = c[key] as Record<string, unknown>;
    }
  });
}

// {{a|b}} takes the first of a, b that has a value (as {{sender|secret.sender}}: the route's sender ID, else the saved one).
const fill = (tpl: string, vars: Record<string, string>) => tpl.replace(/\{\{\s*([\w.|]+)\s*\}\}/g, (_, k: string) => k.split("|").map((x) => vars[x.trim()]).find((v) => v !== undefined && v !== "") ?? "");
const tokens = new Map<string, { token: string; until: number }>();

async function secretsOf(id: string): Promise<Record<string, string>> {
  const r = await get<{ secrets: string | null }>("SELECT secrets FROM int_connectors WHERE id = ?", id);
  const b = r?.secrets ? parseJson<{ blob?: string }>(r.secrets, {}).blob : null;
  return b ? parseJson<Record<string, string>>(await unseal(b), {}) : {};
}

export type CallResult = { ok: boolean; status: number; id: string | null; url: string | null; error: string | null; ms: number; body: unknown };

export async function callConnector(c: Connector, input: Record<string, string | number>, opts: { test?: boolean } = {}): Promise<CallResult> {
  const sec = await secretsOf(c.id);
  const vars: Record<string, string> = { ...Object.fromEntries(Object.entries(input).map(([k, v]) => [k, String(v)])), ...Object.fromEntries(Object.entries(sec).map(([k, v]) => [`secret.${k}`, v])) };
  const op = c.operation;
  let path = fill(op.path, vars);
  const headers: Record<string, string> = { "User-Agent": "Myseed-Connector/1.0", ...Object.fromEntries(Object.entries(op.headers).map(([k, v]) => [k, fill(v, vars)])) };
  const query = new URLSearchParams();
  const secret = sec.token ?? sec.apiKey ?? sec.key ?? sec.password ?? "";
  if (c.auth.kind === "header") headers[c.auth.name || "X-API-Key"] = `${c.auth.prefix ? `${c.auth.prefix} ` : ""}${secret}`;
  else if (c.auth.kind === "query") query.set(c.auth.name || "api_key", secret);
  else if (c.auth.kind === "bearer") headers.Authorization = `Bearer ${secret}`;
  else if (c.auth.kind === "basic") headers.Authorization = `Basic ${Buffer.from(`${sec.username ?? ""}:${sec.password ?? sec.token ?? ""}`).toString("base64")}`;
  else if (c.auth.kind === "oauth2" && c.auth.tokenUrl) {
    const key = `${c.id}:${c.auth.tokenUrl}`;
    let t = tokens.get(key);
    if (!t || t.until < Date.now()) {
      const r = await fetch(c.auth.tokenUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${sec.clientId ?? sec.username ?? ""}:${sec.clientSecret ?? sec.password ?? ""}`).toString("base64")}` }, body: new URLSearchParams({ grant_type: "client_credentials", ...(c.auth.scope ? { scope: c.auth.scope } : {}) }), signal: AbortSignal.timeout(FETCH_TIMEOUT) });
      const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
      if (!j.access_token) throw new WorkflowError("INVALID_STATE", "The provider refused the client ID and secret.");
      t = { token: j.access_token, until: Date.now() + ((j.expires_in ?? 3600) - 60) * 1000 };
      tokens.set(key, t);
    }
    headers.Authorization = `Bearer ${t.token}`;
  }
  const body: Record<string, unknown> = {};
  const form = new URLSearchParams();
  for (const [field, tpl] of Object.entries(op.map)) {
    const v = fill(tpl, vars);
    if (v === "" && tpl.includes("{{")) continue;
    if (field.startsWith("query:")) query.set(field.slice(6), v);
    else if (field.startsWith("path:")) path = path.replace(`{${field.slice(5)}}`, encodeURIComponent(v));
    else if (op.method === "GET" || op.contentType === "none") query.set(field, v);
    else if (op.contentType === "form") form.set(field, v);
    else setPath(body, field, /^\d+(\.\d+)?$/.test(v) && /amount|quantity|unit/i.test(field) ? Number(v) : v);
  }
  if (op.contentType === "json" && op.method !== "GET") headers["Content-Type"] = "application/json";
  if (op.contentType === "form" && op.method !== "GET") headers["Content-Type"] = "application/x-www-form-urlencoded";
  const url = `${c.baseUrl}${path}${query.toString() ? `${path.includes("?") ? "&" : "?"}${query.toString()}` : ""}`;
  const t0 = Date.now();
  let status = 0;
  let parsed: unknown = null;
  let error: string | null = null;
  try {
    const res = await fetch(url, { method: op.method, headers, body: op.method === "GET" ? undefined : op.contentType === "form" ? form.toString() : op.contentType === "json" ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(FETCH_TIMEOUT) });
    status = res.status;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text.slice(0, 500);
    }
    if (!res.ok) error = String(pick(parsed, c.response.errorPath) ?? `The provider answered ${res.status}.`).slice(0, 300);
    // A 404 is nearly always a wrong address or path: say which one was tried (never the query, which may hold a key).
    if (res.status === 404) error = `Not found (404) at ${op.method} ${c.baseUrl}${path}. The address or path is wrong for this provider; check it in the provider's API docs.${error && !/^The provider answered/.test(error) ? ` (${error})` : ""}`.slice(0, 400);
  } catch (e) {
    error = e instanceof Error ? e.message : "No answer.";
  }
  const okField = c.response.okPath ? String(pick(parsed, c.response.okPath) ?? "") : null;
  const ok = !error && status >= 200 && status < 300 && (okField === null || !c.response.okValue || okField.toLowerCase() === c.response.okValue.toLowerCase());
  if (!error && !ok) error = String(pick(parsed, c.response.errorPath) ?? `Not accepted (${c.response.okPath} is "${okField}").`).slice(0, 300);
  const result: CallResult = { ok, status, id: (pick(parsed, c.response.idPath) as string | undefined)?.toString() ?? null, url: (pick(parsed, c.response.urlPath) as string | undefined)?.toString() ?? null, error, ms: Date.now() - t0, body: parsed };
  // The log keeps the address and fields' names, never the secrets or the message itself.
  const { recordCall } = await import("./call-monitor");
  await recordCall({
    source: c.capability === "sms" || c.capability === "email" || c.capability === "payment" ? c.capability : "connector",
    connectorId: c.id,
    ok,
    status,
    ms: result.ms,
    summary: `${c.name} · ${op.method} ${c.baseUrl}${op.path.replace(/\{\{[^}]+\}\}/g, "…")} (${Object.keys(op.map).length} fields)`,
    error,
    ref: result.id,
    test: opts.test,
  });
  return result;
}

export async function testConnector(user: AppUser, id: string, input: Record<string, string>) {
  need(user);
  const r = await get<Row>("SELECT * FROM int_connectors WHERE id = ?", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Not found.");
  const c = toConnector(r);
  const res = await callConnector(c, { reference: `test-${crypto.randomBytes(4).toString("hex")}`, currency: "ETB", amount: "10", amount_cents: "1000", ...input }, { test: true });
  await run("UPDATE int_connectors SET last_test = ? WHERE id = ?", JSON.stringify({ ok: res.ok, at: nowIso(), status: res.status, detail: res.ok ? (res.url ?? res.id ?? "Accepted") : (res.error ?? "Failed") }), id);
  return { ok: res.ok, status: res.status, id: res.id, url: res.url, error: res.error, ms: res.ms, body: JSON.stringify(res.body)?.slice(0, 1500) ?? null };
}

export async function callLog(user: AppUser, limit = 50) {
  need(user);
  return all<{ id: string; name: string | null; capability: string; ok: number; status: number; ms: number; summary: string; error: string | null; test: number; at: string }>(
    "SELECT l.id, c.name, l.capability, l.ok, l.status, l.ms, l.summary, l.error, l.test, l.at FROM int_calls l LEFT JOIN int_connectors c ON c.id = l.connector_id ORDER BY l.at DESC LIMIT ?",
    Math.max(1, Math.min(500, limit)),
  );
}

// Active connectors for a purpose, in Admin's order (the default first): the first is primary, the rest fallbacks.
export async function connectorsFor(capability: Capability) {
  return (await all<Row>("SELECT * FROM int_connectors WHERE capability = ? AND status = 'active' ORDER BY is_default DESC, priority, created_at", capability)).map(toConnector);
}

export async function setConnectorOrder(user: AppUser, capability: Capability, ids: string[]) {
  need(user);
  const list = (await connectorsFor(capability)).map((c) => c.id);
  const order = [...ids.filter((id) => list.includes(id)), ...list.filter((id) => !ids.includes(id))];
  for (let i = 0; i < order.length; i++) await run("UPDATE int_connectors SET priority = ?, is_default = ? WHERE id = ?", (i + 1) * 10, i === 0 ? 1 : 0, order[i]);
  await audit({ actor: user }, { action: "integrations.connector", summary: `${user.name} set the order of ${CAPABILITIES[capability].label} connections` });
  return order;
}

// What the rest of the app uses.
export async function smsAvailable() {
  return (await connectorsFor("sms")).length > 0;
}
// SMS goes through the SMS module: routing by purpose, fallback providers, retries and delivery status.
export async function sendSms(to: string, message: string, sender?: string | null, purpose: "otp" | "alerts" | "marketing" = "alerts") {
  const { sendSmsMessage } = await import("./sms");
  // id stays the provider's message id, as before; messageId is the row in sms_messages.
  const r = await sendSmsMessage({ to, message, sender, purpose });
  return { ...r, id: r.providerId, messageId: r.id };
}
export async function emailConnectorForSystem() {
  const r = await get<Row>("SELECT * FROM int_connectors WHERE capability = 'email' AND status = 'active' AND use_for_system = 1 ORDER BY is_default DESC, priority LIMIT 1");
  return r ? toConnector(r) : null;
}
// The chosen email connection first; if it fails, the other active email connections in Admin's order.
export async function sendEmailViaConnector(c: Connector, input: { to: string; subject: string; text: string; html?: string; from: string; fromName: string }) {
  const list = [c, ...(await connectorsFor("email")).filter((x) => x.id !== c.id)];
  const errors: string[] = [];
  for (const x of list) {
    const r = await callConnector(x, { ...input, html: input.html ?? input.text.replace(/\n/g, "<br>") });
    if (r.ok) return { provider: x.name, id: r.id };
    errors.push(`${x.name}: ${r.error}`);
  }
  throw new Error(errors.join("; "));
}
export async function createPaymentLink(user: AppUser, input: { amount: number; currency?: string; description: string; email?: string | null; phone?: string | null; name?: string | null; reference?: string | null; returnUrl?: string | null }) {
  if (!can(user, "finance.access") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Finance and Admin ask for payments.");
  const list = await connectorsFor("payment");
  if (!list.length) throw new WorkflowError("INVALID_STATE", "No payment provider is connected (Admin, Integrations, Integrate a platform).");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) throw new WorkflowError("VALIDATION", "Enter the amount.");
  const [first, ...rest] = String(input.name ?? "Customer").split(/\s+/);
  const reference = input.reference || `MS-${Date.now().toString(36)}-${crypto.randomBytes(3).toString("hex")}`;
  // The primary provider first, then the fallbacks.
  let r: CallResult | null = null;
  let c = list[0];
  const errors: string[] = [];
  for (const x of list) {
    c = x;
    r = await callConnector(x, { amount: String(amount), amount_cents: String(Math.round(amount * 100)), currency: input.currency || "ETB", description: input.description.slice(0, 200), email: input.email ?? "", phone: input.phone ?? "", first_name: first ?? "", last_name: rest.join(" "), reference, callback_url: "", return_url: input.returnUrl ?? "" });
    if (r.ok && r.url) break;
    errors.push(`${x.name}: ${r.error ?? "the answer had no link"}`);
  }
  if (!r || !r.ok || !r.url) throw new WorkflowError("INVALID_STATE", `No payment link came back: ${errors.join("; ")}`);
  await audit({ actor: user }, { action: "integrations.payment", summary: `${user.name} made a payment link for ${amount} ${input.currency || "ETB"} (${input.description.slice(0, 60)}) via ${c.name}` });
  return { url: r.url, reference, provider: c.name };
}

export async function installPreset(user: AppUser, key: string) {
  need(user);
  const p = PRESETS.find((x) => x.key === key);
  if (!p) throw new WorkflowError("NOT_FOUND", "Unknown preset.");
  const { secrets: _s, key: _k, region: _r, ...draft } = p;
  void _s, void _k, void _r;
  return saveConnector(user, { ...draft, preset: key, status: "draft" });
}
