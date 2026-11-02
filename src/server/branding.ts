// Branding (Admin, Branding): banners at the top of each section's main page (Home, production, each department,
// HR, Finance), as a picture or a colour with a title and a line; and the sidebar's icons and colours per entry,
// chosen from the icon pack (components/app/app-icon.tsx). Admin sets everything; a department's head sets their
// own department's banner.

import { all, get, nowIso, parseJson, run } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { customDepartments, deptAccess } from "./departments";
import { DEPARTMENT_LABELS } from "@/lib/domain";

export type NavBrand = Record<string, { icon?: string | null; tone?: string | null }>;
export type Banner = { key: string; title: string | null; text: string | null; color: string | null; image: boolean; updatedAt: string };

// Where banners can go: the section's key, its main page and its name.
export async function bannerSections() {
  const base = [
    { key: "home", path: "/dashboard", label: "Home (everyone)" },
    { key: "production", path: "/overview", label: "Production (Overview)" },
    { key: "dev", path: "/dev", label: DEPARTMENT_LABELS.dev },
    { key: "marketing", path: "/marketing", label: DEPARTMENT_LABELS.marketing },
    { key: "studio", path: "/studio", label: DEPARTMENT_LABELS.studio },
    { key: "hr", path: "/hr", label: "HR" },
    { key: "finance", path: "/finance", label: "Finance" },
    { key: "attendance", path: "/attendance", label: "Attendance" },
    { key: "people", path: "/people", label: "People" },
  ];
  for (const c of await customDepartments()) base.push({ key: `d:${c.key}`, path: `/d/${c.key}`, label: c.title });
  return base;
}

export async function navBrand(): Promise<NavBrand> {
  return parseJson<NavBrand>((await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.branding.nav'"))?.value, {});
}

export async function saveNavBrand(user: AppUser, input: NavBrand) {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin changes the sidebar's icons.");
  const clean: NavBrand = {};
  for (const [k, v] of Object.entries(input ?? {}).slice(0, 200)) {
    if (!k.startsWith("/") && !/^[a-z0-9:_-]{1,60}$/i.test(k)) continue;
    const icon = v?.icon && /^[a-zA-Z0-9]{1,40}$/.test(v.icon) ? v.icon : null;
    const tone = v?.tone && /^[a-z]{1,10}$/.test(v.tone) ? v.tone : null;
    if (icon || tone) clean[k.slice(0, 120)] = { icon, tone };
  }
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.branding.nav', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    JSON.stringify(clean),
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.branding", summary: `${user.name} changed the sidebar's icons and colours` });
}

export async function banners(): Promise<Banner[]> {
  const rows = await all<{ key: string; title: string | null; text: string | null; color: string | null; has_image: number; updated_at: string }>(
    "SELECT key, title, text, color, CASE WHEN data IS NULL THEN 0 ELSE 1 END AS has_image, updated_at FROM brand_banners ORDER BY key",
  );
  return rows.map((r) => ({ key: r.key, title: r.title, text: r.text, color: r.color, image: !!Number(r.has_image), updatedAt: r.updated_at }));
}

// Who may change a section's banner: Admin, or the head of that department.
async function mayEdit(user: AppUser, key: string) {
  if (can(user, "users.manage")) return true;
  const dept = key.startsWith("d:") ? key.slice(2) : ["dev", "marketing", "studio"].includes(key) ? key : null;
  if (!dept) return false;
  const a = await deptAccess(user, dept).catch(() => null);
  return !!a?.manage;
}

const MAX = 3 * 1024 * 1024;
export async function saveBanner(user: AppUser, input: { key: string; title?: string | null; text?: string | null; color?: string | null; image?: { mime: string; base64: string } | null; removeImage?: boolean }) {
  const sections = await bannerSections();
  if (!sections.some((s) => s.key === input.key)) throw new WorkflowError("NOT_FOUND", "Unknown place for a banner.");
  if (!(await mayEdit(user, input.key))) throw new WorkflowError("FORBIDDEN", "Only Admin or the department's head changes this banner.");
  const color = input.color && /^(#[0-9a-f]{6}|[a-z]{3,12})$/i.test(input.color) ? input.color : null;
  let mime: string | null | undefined;
  let data: string | null | undefined;
  if (input.image) {
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(input.image.mime)) throw new WorkflowError("VALIDATION", "Use a PNG, JPG, WebP or GIF picture.");
    if (Buffer.from(input.image.base64, "base64").length > MAX) throw new WorkflowError("VALIDATION", "The picture is over 3 MB; make it smaller.");
    mime = input.image.mime;
    data = input.image.base64;
  } else if (input.removeImage) {
    mime = null;
    data = null;
  }
  const cur = await get<{ mime: string | null; data: string | null }>("SELECT mime, data FROM brand_banners WHERE key = ?", input.key);
  await run(
    `INSERT INTO brand_banners (key, title, text, color, mime, data, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET title = excluded.title, text = excluded.text, color = excluded.color, mime = excluded.mime, data = excluded.data, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    input.key,
    input.title?.trim().slice(0, 120) || null,
    input.text?.trim().slice(0, 300) || null,
    color,
    mime === undefined ? (cur?.mime ?? null) : mime,
    data === undefined ? (cur?.data ?? null) : data,
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "settings.banner", summary: `${user.name} changed the banner of ${sections.find((s) => s.key === input.key)!.label}` });
}

export async function removeBanner(user: AppUser, key: string) {
  if (!(await mayEdit(user, key))) throw new WorkflowError("FORBIDDEN", "Only Admin or the department's head changes this banner.");
  await run("DELETE FROM brand_banners WHERE key = ?", key);
}

export async function bannerImage(key: string) {
  const r = await get<{ mime: string | null; data: string | null }>("SELECT mime, data FROM brand_banners WHERE key = ?", key);
  if (!r?.data || !r.mime) return null;
  return { mime: r.mime, data: Buffer.from(r.data, "base64") };
}

// For the layout: each section's main page and its banner (no picture data; the picture comes from its own URL).
export async function bannerMap() {
  const list = await banners();
  if (!list.length) return [];
  const sections = await bannerSections();
  return list
    .map((b) => {
      const s = sections.find((x) => x.key === b.key);
      return s ? { path: s.path, key: b.key, title: b.title, text: b.text, color: b.color, image: b.image ? `/api/branding/banner/${encodeURIComponent(b.key)}?v=${encodeURIComponent(b.updatedAt)}` : null } : null;
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
}
export type BannerView = Awaited<ReturnType<typeof bannerMap>>[number];
