// The site's own identity (Admin, Branding, Name and logo): the name and line under it in the sidebar and sign-in
// page, the browser tab title, the installed app's name, and the logo and favicon. Pictures are kept in the database
// and served from /api/branding/logo and /api/branding/favicon; without them the Myseed mark is used.

import { get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";

export type Identity = { name: string; tagline: string; shortName: string; color: string; logo: boolean; favicon: boolean; version: string };
type Stored = { name?: string; tagline?: string; shortName?: string; color?: string; logo?: string | null; favicon?: string | null; version?: string };

export const DEFAULT_IDENTITY: Identity = { name: "Myseed", tagline: "Content Manager", shortName: "Myseed", color: "#16a34a", logo: false, favicon: false, version: "0" };

async function stored(): Promise<Stored> {
  return parseJson<Stored>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.identity'"))?.value, {});
}

export async function identity(): Promise<Identity> {
  const s = await stored().catch(() => ({}) as Stored);
  return {
    name: s.name || DEFAULT_IDENTITY.name,
    tagline: s.tagline ?? DEFAULT_IDENTITY.tagline,
    shortName: s.shortName || s.name || DEFAULT_IDENTITY.shortName,
    color: s.color || DEFAULT_IDENTITY.color,
    logo: !!s.logo,
    favicon: !!s.favicon,
    version: s.version ?? "0",
  };
}

// "Myseed Content Manager": the full title, for tabs and the installed app.
export const fullName = (i: Identity) => [i.name, i.tagline].filter(Boolean).join(" ");

const IMAGE = /^data:image\/(png|jpeg|webp|svg\+xml|x-icon|vnd\.microsoft\.icon|gif);base64,/;

export async function saveIdentity(user: AppUser, input: { name?: string; tagline?: string; shortName?: string; color?: string; logo?: string | null; favicon?: string | null }) {
  if (!can(user, "users.manage") && !can(user, "settings.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes the site's name and logo.");
  const cur = await stored();
  const clean = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
  const pic = (v: string | null | undefined, old: string | null | undefined, what: string) => {
    if (v === undefined) return old ?? null;
    if (v === null || v === "") return null;
    if (!IMAGE.test(v)) throw new WorkflowError("VALIDATION", `The ${what} must be a PNG, JPEG, WebP, SVG, GIF or ICO picture.`);
    if (v.length > 1_500_000) throw new WorkflowError("VALIDATION", `The ${what} is limited to 1 MB.`);
    return v;
  };
  const name = input.name === undefined ? cur.name : clean(input.name, 40);
  if (input.name !== undefined && !name) throw new WorkflowError("VALIDATION", "Give the site a name.");
  const color = input.color === undefined ? cur.color : /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : cur.color;
  const next: Stored = {
    name,
    tagline: input.tagline === undefined ? cur.tagline : clean(input.tagline, 60),
    shortName: input.shortName === undefined ? cur.shortName : clean(input.shortName, 20),
    color,
    logo: pic(input.logo, cur.logo, "logo"),
    favicon: pic(input.favicon, cur.favicon, "favicon"),
    version: String(Date.now()),
  };
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.identity', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(next),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.identity", summary: `${user.name} changed the site's name or logo` });
  return identity();
}

export async function identityImage(kind: "logo" | "favicon") {
  const s = await stored();
  const v = kind === "favicon" ? (s.favicon ?? s.logo) : s.logo;
  const m = v ? /^data:([^;]+);base64,(.*)$/.exec(v) : null;
  return m ? { mime: m[1]!, data: Buffer.from(m[2]!, "base64") } : null;
}
