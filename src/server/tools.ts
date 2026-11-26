// The Tools hub: six apps every person can use inside Myseed (notes and checklists, a reminder calendar, a sheets
// studio with a cross-check against production data, a document builder, a deck maker and the company letter
// generator), and the optional connections (calendar feed, Notion, Claude through MCP, ChatGPT actions).
//
// Admin decides (Admin, System & workspace, Tools hub) whether the hub is on, which apps and which connections are
// on, and for which roles (no roles ticked = everyone with "Tools hub" in Roles & permissions). Nothing here needs
// an outside service; the connections are extras.

import { get, nowIso, parseJson, run } from "./db";
import { audit, WorkflowError } from "./workflow";
import { can, type AppUser } from "./users";
import { TOOL_APPS, TOOL_FEATURES, type ToolApp, type ToolFeature, type Letterhead, DEFAULT_LETTERHEAD } from "@/lib/tools";

export type Switch = { on: boolean; roles: string[] };
export type ToolsConfig = {
  enabled: boolean;
  apps: Record<ToolApp, Switch>;
  features: Record<ToolFeature, Switch>;
  letterhead: Letterhead;
};

const ON: Switch = { on: true, roles: [] };

export async function toolsConfig(): Promise<ToolsConfig> {
  const raw = parseJson<Partial<ToolsConfig>>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.tools'"))?.value, {});
  const sw = (v: unknown): Switch => {
    const o = (v ?? {}) as Partial<Switch>;
    return { on: o.on ?? true, roles: Array.isArray(o.roles) ? o.roles.filter((r) => typeof r === "string").slice(0, 100) : [] };
  };
  return {
    enabled: raw.enabled ?? true,
    apps: Object.fromEntries(TOOL_APPS.map((a) => [a.key, raw.apps?.[a.key] ? sw(raw.apps[a.key]) : ON])) as ToolsConfig["apps"],
    features: Object.fromEntries(TOOL_FEATURES.map((f) => [f.key, raw.features?.[f.key] ? sw(raw.features[f.key]) : ON])) as ToolsConfig["features"],
    letterhead: { ...DEFAULT_LETTERHEAD, ...(raw.letterhead ?? {}) },
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

export async function saveToolsAccess(user: AppUser, input: Pick<ToolsConfig, "enabled" | "apps" | "features">) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin chooses who gets the tools.");
  const cur = await toolsConfig();
  const clean = (s: Partial<Switch> | undefined): Switch => ({ on: !!s?.on, roles: Array.isArray(s?.roles) ? [...new Set(s.roles.filter((r) => typeof r === "string" && /^[a-z][a-z0-9_]{1,39}$/.test(r)))] : [] });
  const next: ToolsConfig = {
    ...cur,
    enabled: !!input.enabled,
    apps: Object.fromEntries(TOOL_APPS.map((a) => [a.key, clean(input.apps?.[a.key])])) as ToolsConfig["apps"],
    features: Object.fromEntries(TOOL_FEATURES.map((f) => [f.key, clean(input.features?.[f.key])])) as ToolsConfig["features"],
  };
  await save(user, next);
  await audit({ actor: user }, { action: "tools.access", summary: `${user.name} changed who gets the Tools hub`, newValue: { enabled: next.enabled, apps: next.apps, features: next.features } });
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

const allowed = (s: Switch, user: AppUser) => s.on && (!s.roles.length || user.roles.some((r) => s.roles.includes(r)));

// The apps and connections this person may use.
export async function toolsFor(user: AppUser) {
  const cfg = await toolsConfig();
  const admin = can(user, "users.manage");
  const base = cfg.enabled && (can(user, "tools.use") || admin);
  const apps = base ? TOOL_APPS.filter((a) => admin || allowed(cfg.apps[a.key], user)) : [];
  const features = base ? TOOL_FEATURES.filter((f) => admin || allowed(cfg.features[f.key], user)).map((f) => f.key) : [];
  return { apps, features, letterhead: cfg.letterhead, canEditLetterhead: can(user, "tools.letterhead") || admin };
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
