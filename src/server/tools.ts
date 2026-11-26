// The Tools hub: six apps every person can use inside Myseed (notes and checklists, a reminder calendar, a sheets
// studio with a cross-check against production data, a document builder, a deck maker and the company letter
// generator), and the optional connections (calendar feed, Notion, Claude through MCP, ChatGPT actions).
//
// Admin decides (Admin, System & workspace, Tools hub) whether the hub is on, which apps and which connections are
// on, and who gets each: roles (none ticked = everyone with "Tools hub" in Roles & permissions), named people who get
// it whatever their role, and named people who never get it. People given a connection connect their own account
// (their own Notion, their own Claude or ChatGPT); nothing is shared between people. Admin also sets what the design
// editor offers and how the company signature and stamp may be put on letters. Nothing here needs an outside
// service; the connections are extras.

import { all, get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { TOOL_APPS, TOOL_FEATURES, type ToolApp, type ToolFeature, type Letterhead, DEFAULT_LETTERHEAD } from "@/lib/tools";
import { cleanDesignOptions, DEFAULT_DESIGN_OPTIONS, type DesignOptions } from "@/lib/design";

// Who gets something: on or off; roles (none = everyone with the hub); people always given it; people never given it.
export type Switch = { on: boolean; roles: string[]; users: string[]; blocked: string[] };
// The company's signature and stamp pictures on letters from the Letter Generator, and when they may be used.
export type SealPolicy = {
  signature: string | null;
  stamp: string | null;
  // off: never; optional: the writer ticks them; always: every letter carries them (for people allowed).
  use: "off" | "optional" | "always";
  who: Switch;
  // Letter templates they may be used on (none = every letter), and those that always carry them.
  templates: string[];
  required: string[];
  placement: "beside" | "over";
  signHeight: number;
  stampSize: number;
  stampOpacity: number;
  onExports: { pdf: boolean; word: boolean; image: boolean };
  // A line under the signature such as "Signed electronically on behalf of ...".
  note: string;
};
export type ToolsConfig = {
  enabled: boolean;
  apps: Record<ToolApp, Switch>;
  features: Record<ToolFeature, Switch>;
  letterhead: Letterhead;
  design: DesignOptions & { who: Switch };
  seal: SealPolicy;
};

const ON: Switch = { on: true, roles: [], users: [], blocked: [] };
const DEFAULT_SEAL: SealPolicy = { signature: null, stamp: null, use: "off", who: { on: true, roles: [], users: [], blocked: [] }, templates: [], required: [], placement: "beside", signHeight: 16, stampSize: 30, stampOpacity: 0.9, onExports: { pdf: true, word: true, image: true }, note: "" };

const ids = (v: unknown, n = 500) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && /^[\w-]{3,80}$/.test(x)))].slice(0, n) : []);
const sw = (v: unknown, dflt: Switch = ON): Switch => {
  if (!v || typeof v !== "object") return { ...dflt };
  const o = v as Partial<Switch>;
  return { on: o.on ?? true, roles: Array.isArray(o.roles) ? o.roles.filter((r) => typeof r === "string" && /^[a-z][a-z0-9_]{1,39}$/.test(r)).slice(0, 100) : [], users: ids(o.users), blocked: ids(o.blocked) };
};
const IMG = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const pic = (v: unknown, max = 800_000) => (typeof v === "string" && IMG.test(v) && v.length <= max ? v : null);
const LETTER_KEY = /^[a-z0-9_]{2,40}$/;

function cleanSeal(v: unknown): SealPolicy {
  const s = (v ?? {}) as Partial<SealPolicy>;
  const n = (x: unknown, d: number, lo: number, hi: number) => (Number.isFinite(Number(x)) ? Math.min(hi, Math.max(lo, Number(x))) : d);
  return {
    signature: pic(s.signature),
    stamp: pic(s.stamp),
    use: s.use === "optional" || s.use === "always" ? s.use : "off",
    who: sw(s.who),
    templates: (Array.isArray(s.templates) ? s.templates : []).filter((k) => typeof k === "string" && LETTER_KEY.test(k)).slice(0, 200),
    required: (Array.isArray(s.required) ? s.required : []).filter((k) => typeof k === "string" && LETTER_KEY.test(k)).slice(0, 200),
    placement: s.placement === "over" ? "over" : "beside",
    signHeight: n(s.signHeight, 16, 8, 40),
    stampSize: n(s.stampSize, 30, 15, 60),
    stampOpacity: n(s.stampOpacity, 0.9, 0.3, 1),
    onExports: { pdf: s.onExports?.pdf !== false, word: s.onExports?.word !== false, image: s.onExports?.image !== false },
    note: String(s.note ?? "").slice(0, 200),
  };
}

export async function toolsConfig(): Promise<ToolsConfig> {
  const raw = parseJson<Partial<ToolsConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.tools'"))?.value, {});
  return {
    enabled: raw.enabled ?? true,
    apps: Object.fromEntries(TOOL_APPS.map((a) => [a.key, sw(raw.apps?.[a.key])])) as ToolsConfig["apps"],
    features: Object.fromEntries(TOOL_FEATURES.map((f) => [f.key, sw(raw.features?.[f.key])])) as ToolsConfig["features"],
    letterhead: { ...DEFAULT_LETTERHEAD, ...(raw.letterhead ?? {}) },
    design: { ...cleanDesignOptions(raw.design ?? DEFAULT_DESIGN_OPTIONS), who: sw(raw.design?.who) },
    seal: cleanSeal(raw.seal ?? DEFAULT_SEAL),
  };
}

async function save(user: AppUser, cfg: ToolsConfig) {
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.tools', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(cfg),
    nowIso(),
    user.id,
  );
}

// People named in a switch must be real, active accounts.
async function realPeople(list: string[]) {
  if (!list.length) return [];
  const rows = await all<{ id: string }>(`SELECT id FROM users WHERE active = 1 AND id IN (${list.map(() => "?").join(",")})`, ...list);
  const ok = new Set(rows.map((r) => r.id));
  return list.filter((x) => ok.has(x));
}
async function cleanSwitch(s: Partial<Switch> | undefined): Promise<Switch> {
  const base = sw(s ?? { on: false });
  const users = await realPeople(base.users);
  const blocked = (await realPeople(base.blocked)).filter((x) => !users.includes(x));
  return { on: s ? !!s.on : false, roles: base.roles, users, blocked };
}

export async function saveToolsAccess(user: AppUser, input: Partial<Pick<ToolsConfig, "enabled" | "apps" | "features">> & { design?: Partial<ToolsConfig["design"]>; seal?: Partial<SealPolicy> }) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin chooses who gets the tools.");
  const cur = await toolsConfig();
  const next: ToolsConfig = { ...cur, enabled: input.enabled === undefined ? cur.enabled : !!input.enabled };
  if (input.apps) next.apps = Object.fromEntries(await Promise.all(TOOL_APPS.map(async (a) => [a.key, await cleanSwitch(input.apps?.[a.key])]))) as ToolsConfig["apps"];
  if (input.features) next.features = Object.fromEntries(await Promise.all(TOOL_FEATURES.map(async (f) => [f.key, await cleanSwitch(input.features?.[f.key])]))) as ToolsConfig["features"];
  if (input.design) next.design = { ...cleanDesignOptions({ ...cur.design, ...input.design }), who: await cleanSwitch(input.design.who ?? cur.design.who) };
  if (input.seal) {
    const s = cleanSeal({ ...cur.seal, ...input.seal });
    if (input.seal.signature && !s.signature) throw new WorkflowError("VALIDATION", "The signature must be a PNG, JPEG or WebP picture under about 600 KB (a transparent PNG looks best).");
    if (input.seal.stamp && !s.stamp) throw new WorkflowError("VALIDATION", "The stamp must be a PNG, JPEG or WebP picture under about 600 KB.");
    next.seal = { ...s, who: await cleanSwitch(input.seal.who ?? cur.seal.who) };
  }
  await save(user, next);
  await audit({ actor: user }, { action: "tools.access", summary: `${user.name} changed who gets the Tools hub`, newValue: { enabled: next.enabled, apps: next.apps, features: next.features, design: { ...next.design }, seal: { ...next.seal, signature: next.seal.signature ? "(picture)" : null, stamp: next.seal.stamp ? "(picture)" : null } } });
}

const MAX_LOGO = 400_000;
export async function saveLetterhead(user: AppUser, input: Letterhead) {
  if (!can(user, "tools.letterhead") && !can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "The letterhead is locked. Only people Admin allows can change it.");
  const str = (v: unknown, n: number) => String(v ?? "").slice(0, n);
  const color = (v: unknown, d: string) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v) : d);
  const logo = input.logo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(input.logo) && input.logo.length <= MAX_LOGO ? input.logo : null;
  if (input.logo && !logo) throw new WorkflowError("VALIDATION", "The logo must be a PNG, JPEG or WebP picture under 300 KB.");
  const lh: Letterhead = {
    company: str(input.company, 120),
    tagline: str(input.tagline, 160),
    address: str(input.address, 300),
    phone: str(input.phone, 80),
    email: str(input.email, 120),
    website: str(input.website, 120),
    footer: str(input.footer, 400),
    primary: color(input.primary, DEFAULT_LETTERHEAD.primary),
    accent: color(input.accent, DEFAULT_LETTERHEAD.accent),
    logo,
    signName: str(input.signName, 120),
    signTitle: str(input.signTitle, 120),
    refPrefix: str(input.refPrefix, 20).replace(/[^A-Za-z0-9/-]/g, ""),
  };
  const cur = await toolsConfig();
  await save(user, { ...cur, letterhead: lh });
  await audit({ actor: user }, { action: "tools.letterhead", summary: `${user.name} changed the official letterhead` });
}

// A switch for one person: on, not blocked, and either named or (with the hub) in one of its roles (none = all).
export function allowedBy(s: Switch, user: AppUser, hub: boolean) {
  if (!s.on || s.blocked.includes(user.id)) return false;
  if (s.users.includes(user.id)) return true;
  return hub && (!s.roles.length || user.roles.some((r) => s.roles.includes(r)));
}

// What the seal policy means for this person: may they put the company signature and stamp on letters?
export function sealFor(cfg: ToolsConfig, user: AppUser) {
  const s = cfg.seal;
  const may = s.use !== "off" && (!!s.signature || !!s.stamp) && allowedBy(s.who, user, true);
  return may ? { ...s, who: undefined } : null;
}

// The apps and connections this person may use. Admin gets everything; people named by Admin get their apps even
// when their role has no "Tools hub"; people blocked from an app never get it.
export async function toolsFor(user: AppUser) {
  const cfg = await toolsConfig();
  const admin = can(user, "users.manage");
  const hub = can(user, "tools.use") || admin;
  const named = [...Object.values(cfg.apps), ...Object.values(cfg.features)].some((s) => s.users.includes(user.id));
  const base = cfg.enabled && (hub || named);
  const apps = base ? TOOL_APPS.filter((a) => (admin && !cfg.apps[a.key].blocked.includes(user.id)) || allowedBy(cfg.apps[a.key], user, hub)) : [];
  const features = base ? TOOL_FEATURES.filter((f) => (admin && !cfg.features[f.key].blocked.includes(user.id)) || allowedBy(cfg.features[f.key], user, hub)).map((f) => f.key) : [];
  const design = base && (admin || allowedBy(cfg.design.who, user, hub)) ? { ...cfg.design, who: undefined } : null;
  return { apps, features, letterhead: cfg.letterhead, canEditLetterhead: can(user, "tools.letterhead") || admin, design, seal: base ? sealFor(cfg, user) : null };
}

// The design editor's options for a surface (letters, decks, correspondence), or null when it is not offered.
export async function designFor(user: AppUser, surface: keyof DesignOptions["surfaces"]) {
  const cfg = await toolsConfig();
  const admin = can(user, "users.manage");
  if (!cfg.design.surfaces[surface]) return null;
  if (!admin && !allowedBy(cfg.design.who, user, can(user, "tools.use") || surface === "correspondence")) return null;
  const { who: _who, ...opts } = cfg.design;
  void _who;
  return opts as DesignOptions;
}

// Notes, documents and reminders are private: Admin's View as never opens them (reads or writes).
function noPreview(user: AppUser) {
  if ((user as AppUser & { previewBy?: unknown }).previewBy) throw new WorkflowError("FORBIDDEN", "Tools hub content is private to each person, so View as cannot open it.");
}

export async function requireTool(user: AppUser, app: ToolApp) {
  noPreview(user);
  const t = await toolsFor(user);
  if (!t.apps.some((a) => a.key === app)) throw new WorkflowError("FORBIDDEN", "This tool is not available to you. Ask Admin (Admin, Tools hub).");
  return t;
}

export async function requireFeature(user: AppUser, feature: ToolFeature) {
  noPreview(user);
  const t = await toolsFor(user);
  if (!t.features.includes(feature)) throw new WorkflowError("FORBIDDEN", "This connection is not available to you. Ask Admin (Admin, Tools hub).");
  return t;
}
