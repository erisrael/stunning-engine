// Presentation templates (Phase 24): the built-in ones, Admin's own (made in the app or imported from a
// PowerPoint, Google Slides, Keynote or Canva file), and which one decks use by default. A deck can choose its own.
//
// Importing reads the file's theme (ppt/theme/theme1.xml, or theme/theme/theme1.xml in an Office .thmx): the
// twelve theme colours, the heading and body fonts, the picture behind the slide master (if any) and the first
// picture placed on the master (usually the logo). Nothing in the file is run.

import JSZip from "jszip";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { can, type AppUser } from "./users";
import { audit, WorkflowError } from "./workflow";
import { BUILT_IN_TEMPLATES, cleanTemplate, DEFAULT_TEMPLATE_ID, hex, type DeckTemplate } from "@/lib/deck-templates";

const need = (user: AppUser) => {
  if (!can(user, "users.manage")) throw new WorkflowError("FORBIDDEN", "Only Admin manages presentation templates.");
};

export async function listTemplates(): Promise<{ templates: DeckTemplate[]; defaultId: string }> {
  const rows = await all<{ id: string; data: string; source: string }>("SELECT id, data, source FROM pres_templates ORDER BY created_at");
  const own = rows.map((r) => ({ ...cleanTemplate(parseJson<Partial<DeckTemplate>>(r.data, {})), id: r.id, source: (r.source === "imported" ? "imported" : "custom") as DeckTemplate["source"] }));
  const d = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.present.template'"))?.value;
  const templates = [...BUILT_IN_TEMPLATES, ...own];
  return { templates, defaultId: templates.some((t) => t.id === d) ? d! : DEFAULT_TEMPLATE_ID };
}

export async function saveTemplate(user: AppUser, input: Partial<Omit<DeckTemplate, "id" | "importedFrom">> & { id?: string | null; basedOn?: string | null; importedFrom?: string | null }) {
  need(user);
  const { templates } = await listTemplates();
  const base = templates.find((t) => t.id === (input.basedOn ?? input.id)) ?? BUILT_IN_TEMPLATES[0]!;
  const data = cleanTemplate(input, base);
  const now = nowIso();
  if (input.id && !BUILT_IN_TEMPLATES.some((t) => t.id === input.id)) {
    const cur = await get<{ id: string }>("SELECT id FROM pres_templates WHERE id = ?", input.id);
    if (!cur) throw new WorkflowError("NOT_FOUND", "Template not found.");
    await run("UPDATE pres_templates SET name = ?, data = ?, updated_at = ? WHERE id = ?", data.name, JSON.stringify(data), now, input.id);
    await audit({ actor: user }, { action: "present.template", summary: `${user.name} changed the presentation template "${data.name}"` });
    return input.id;
  }
  // A built-in one is never changed: editing it saves a copy.
  const id = uid("tpl_");
  await run("INSERT INTO pres_templates (id, name, data, source, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", id, data.name, JSON.stringify(data), input.source === "imported" ? "imported" : "custom", user.id, now, now);
  await audit({ actor: user }, { action: "present.template", summary: `${user.name} added the presentation template "${data.name}"` });
  return id;
}

export async function deleteTemplate(user: AppUser, id: string) {
  need(user);
  if (BUILT_IN_TEMPLATES.some((t) => t.id === id)) throw new WorkflowError("VALIDATION", "Built-in templates stay; make a copy to change one.");
  await run("DELETE FROM pres_templates WHERE id = ?", id);
  const d = (await get<{ value: string }>("SELECT value FROM settings WHERE key = 'cfg.present.template'"))?.value;
  if (d === id) await run("DELETE FROM settings WHERE key = 'cfg.present.template'");
}

export async function setDefaultTemplate(user: AppUser, id: string) {
  need(user);
  if (!(await listTemplates()).templates.some((t) => t.id === id)) throw new WorkflowError("NOT_FOUND", "Template not found.");
  await run(
    "INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('cfg.present.template', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by",
    id,
    nowIso(),
    user.id,
  );
  await audit({ actor: user }, { action: "present.template", summary: `${user.name} made a new template the default for presentations` });
}

// ---------------------------------------------------------------------------
// Import from another presentation tool
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", webp: "image/webp" };

function colorOf(xml: string, slot: string): string | null {
  const m = xml.match(new RegExp(`<a:${slot}>([\\s\\S]*?)</a:${slot}>`));
  if (!m) return null;
  const srgb = m[1]!.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6})"/);
  if (srgb) return `#${srgb[1]}`;
  const sys = m[1]!.match(/<a:sysClr[^>]*lastClr="([0-9A-Fa-f]{6})"/);
  return sys ? `#${sys[1]}` : null;
}
const fontOf = (xml: string, kind: "majorFont" | "minorFont") => xml.match(new RegExp(`<a:${kind}>[\\s\\S]*?<a:latin\\s+typeface="([^"]*)"`))?.[1] ?? null;

async function imageFrom(zip: JSZip, partPath: string, xml: string, re: RegExp): Promise<string | null> {
  const rid = xml.match(re)?.[1];
  if (!rid) return null;
  const dir = partPath.slice(0, partPath.lastIndexOf("/"));
  const rels = await zip.file(`${dir}/_rels/${partPath.slice(dir.length + 1)}.rels`)?.async("string");
  const target = rels?.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? rels?.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`))?.[1];
  if (!target) return null;
  const parts = `${dir}/${target}`.split("/");
  const norm: string[] = [];
  for (const p of parts) p === ".." ? norm.pop() : p !== "." && norm.push(p);
  const file = zip.file(norm.join("/"));
  const ext = norm[norm.length - 1]!.split(".").pop()!.toLowerCase();
  if (!file || !MIME[ext]) return null;
  const b64 = await file.async("base64");
  return b64.length > 2_900_000 ? null : `data:${MIME[ext]};base64,${b64}`;
}

export type ImportedTheme = { name: string; colors: Record<string, string>; fonts: { heading: string | null; body: string | null }; background: string | null; logo: string | null };

export async function readTheme(fileName: string, data: ArrayBuffer | Uint8Array): Promise<ImportedTheme> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new WorkflowError("VALIDATION", "That is not a PowerPoint (.pptx, .potx) or Office theme (.thmx) file.");
  }
  const themePath = Object.keys(zip.files).find((f) => /^(ppt\/theme|theme\/theme)\/theme\d*\.xml$/.test(f));
  if (!themePath) throw new WorkflowError("VALIDATION", "No theme was found in the file. Save it from PowerPoint, Google Slides (File, Download, .pptx), Keynote (Export, PowerPoint) or Canva (Download, PPTX).");
  const theme = await zip.file(themePath)!.async("string");
  const colors: Record<string, string> = {};
  for (const slot of ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink"]) {
    const c = colorOf(theme, slot);
    if (c) colors[slot] = c;
  }
  if (!colors.accent1) throw new WorkflowError("VALIDATION", "The file's theme has no colours.");
  let background: string | null = null;
  let logo: string | null = null;
  const master = Object.keys(zip.files).find((f) => /^ppt\/slideMasters\/slideMaster\d*\.xml$/.test(f));
  if (master) {
    const xml = await zip.file(master)!.async("string");
    background = await imageFrom(zip, master, xml, /<p:bg>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"/);
    logo = await imageFrom(zip, master, xml, /<p:pic>[\s\S]*?<a:blip[^>]*r:embed="([^"]+)"/);
  }
  const core = await zip.file("docProps/core.xml")?.async("string");
  const title = core?.match(/<dc:title>([^<]+)<\/dc:title>/)?.[1]?.trim();
  return {
    name: (title || fileName.replace(/\.(pptx|potx|thmx)$/i, "")).slice(0, 60),
    colors,
    fonts: { heading: fontOf(theme, "majorFont"), body: fontOf(theme, "minorFont") },
    background,
    logo,
  };
}

// The theme as one of the app's templates: accent 1 is the main colour, accent 2 and 3 follow, dark 1 and light 1
// are the text and the background, light 2 the boxes; the six accents colour the charts.
export function themeToTemplate(t: ImportedTheme, fileName: string): Partial<DeckTemplate> {
  const c = t.colors;
  const accents = ["accent1", "accent2", "accent3", "accent4", "accent5", "accent6"].map((k) => c[k]).filter(Boolean) as string[];
  return {
    name: t.name,
    colors: {
      primary: hex(c.accent1, "#0B7A3B"),
      secondary: hex(c.accent2 ?? c.dk2, "#1A73E8"),
      accent: hex(c.accent3 ?? c.accent2, "#F9AB00"),
      background: hex(c.lt1, "#FFFFFF"),
      surface: hex(c.lt2, "#F3F4F6"),
      text: hex(c.dk1, "#1F2937"),
      muted: hex(c.dk2, "#6B7280"),
      chart: accents,
    },
    fonts: { heading: t.fonts.heading || "Calibri Light", body: t.fonts.body || "Calibri" },
    logo: t.logo,
    background: t.background,
    cover: { style: t.background ? "image" : "gradient", image: t.background },
    footer: "",
    slideNumbers: true,
    source: "imported",
    importedFrom: fileName,
  };
}

export async function importTemplate(user: AppUser, fileName: string, data: ArrayBuffer | Uint8Array) {
  need(user);
  if (!/\.(pptx|potx|thmx)$/i.test(fileName)) throw new WorkflowError("VALIDATION", "Choose a .pptx, .potx or .thmx file.");
  if (data.byteLength > 30 * 1024 * 1024) throw new WorkflowError("VALIDATION", "Files are limited to 30 MB.");
  const theme = await readTheme(fileName, data);
  const id = await saveTemplate(user, { ...themeToTemplate(theme, fileName), source: "imported" });
  return { id, name: theme.name, colors: theme.colors, fonts: theme.fonts, background: !!theme.background, logo: !!theme.logo };
}
