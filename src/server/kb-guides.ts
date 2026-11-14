// The knowledge base, Update 1.1: how-to guides (ordered steps, each with text and an optional YouTube video that is
// checked when saved), a video on a plain article, bulk import (CSV, JSON, Markdown, or a ZIP of Markdown files,
// with a preview first), bulk publish, unpublish, move and delete, and export. Customers get the same articles and
// guides in the help center, the widget, the Telegram bot and the API.
//
// Text is light Markdown (bold, italics, links, lists), drawn safely by src/lib/mini-markdown.tsx. The body column
// keeps all the words (intro and steps) so the existing search finds guides too.

import Papa from "papaparse";
import JSZip from "jszip";
import { all, get, nowIso, parseJson, run, uid } from "./db";
import { audit, WorkflowError } from "./workflow";
import type { AppUser } from "./users";
import { trackedFetch } from "./call-monitor";

const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
export const IMPORT_MAX = 5 * 1024 * 1024;
const MAX_ROWS = 500;

export type Video = { id: string; title: string | null };
export type Step = { title: string; body: string; video: Video | null };
export type ArticleKind = "article" | "guide";
export type FullArticle = {
  id: string;
  kind: ArticleKind;
  title: string;
  intro: string;
  body: string;
  category: string | null;
  keywords: string;
  published: boolean;
  steps: Step[];
  video: Video | null;
  views: number;
  helpful: number;
  not_helpful: number;
  updated_at: string;
};

async function agent(user: AppUser) {
  const sd = await import("./support-desk");
  if (!(await sd.isAgent(user))) throw new WorkflowError("FORBIDDEN", "Only support agents work on the knowledge base.");
  return sd;
}
async function lead(user: AppUser) {
  const sd = await agent(user);
  if (!(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "Only support leads and Admin do this.");
}

// ---------------------------------------------------------------------------
// YouTube
// ---------------------------------------------------------------------------

// The video's id from any YouTube address (watch, youtu.be, shorts, embed, live), or null.
export function youtubeId(url: string): string | null {
  const u = clean(url, 400);
  if (!u) return null;
  let p: URL;
  try {
    p = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
  } catch {
    return null;
  }
  const host = p.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = p.pathname.slice(1).split("/")[0] ?? null;
  else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (p.pathname === "/watch") id = p.searchParams.get("v");
    else {
      const m = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(p.pathname);
      id = m ? m[2]! : null;
    }
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
export const thumbnail = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
export const watchUrl = (id: string) => `https://www.youtube.com/watch?v=${id}`;

// Asks YouTube whether the video exists and can be embedded (its oEmbed answer); replaced in tests (browser tests
// point YOUTUBE_OEMBED_BASE at a local fake).
type Checker = (id: string) => Promise<{ ok: boolean; title?: string; status?: number }>;
let checker: Checker = async (id) => {
  const r = await trackedFetch("youtube", `${process.env.YOUTUBE_OEMBED_BASE || "https://www.youtube.com"}/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return { ok: false, status: r.status };
  const j = (await r.json().catch(() => ({}))) as { title?: string };
  return { ok: true, title: j.title };
};
export function setYoutubeChecker(c: Checker) {
  checker = c;
}

// A YouTube link checked: the id, its title, and why not when it cannot be used.
export async function checkVideo(url: string): Promise<{ ok: true; video: Video; thumbnail: string } | { ok: false; error: string }> {
  const id = youtubeId(url);
  if (!id) return { ok: false, error: "That is not a YouTube video link." };
  try {
    const r = await checker(id);
    if (!r.ok) return { ok: false, error: r.status === 401 || r.status === 403 ? "This video cannot be shown on other sites (embedding is off)." : "YouTube does not have this video, or it is private." };
    return { ok: true, video: { id, title: r.title ? clean(r.title, 200) : null }, thumbnail: thumbnail(id) };
  } catch {
    // YouTube could not be reached: kept, unchecked.
    return { ok: true, video: { id, title: null }, thumbnail: thumbnail(id) };
  }
}
export async function checkVideoFor(user: AppUser, url: string) {
  await agent(user);
  return checkVideo(url);
}

// ---------------------------------------------------------------------------
// Articles and guides
// ---------------------------------------------------------------------------

type Row = { id: string; kind: string | null; title: string; intro: string | null; body: string; category: string | null; keywords: string; published: number; steps: string | null; video: string | null; views: number; helpful: number; not_helpful: number; updated_at: string };
const fullOf = (r: Row): FullArticle => ({
  id: r.id,
  kind: r.kind === "guide" ? "guide" : "article",
  title: r.title,
  intro: r.intro ?? (r.kind === "guide" ? "" : r.body),
  body: r.body,
  category: r.category,
  keywords: r.keywords,
  published: !!Number(r.published),
  steps: parseJson<Step[]>(r.steps, []),
  video: parseJson<Video | null>(r.video, null),
  views: Number(r.views),
  helpful: Number(r.helpful),
  not_helpful: Number(r.not_helpful),
  updated_at: r.updated_at,
});

export async function listKb(user: AppUser, f: { q?: string | null; status?: string | null; category?: string | null; kind?: string | null } = {}) {
  await agent(user);
  let rows = (await all<Row>("SELECT * FROM sup_articles ORDER BY published DESC, category, title")).map(fullOf);
  const q = clean(f.q, 80).toLowerCase();
  if (q) rows = rows.filter((a) => `${a.title} ${a.keywords} ${a.body}`.toLowerCase().includes(q));
  if (f.status === "published") rows = rows.filter((a) => a.published);
  if (f.status === "draft") rows = rows.filter((a) => !a.published);
  if (f.kind === "guide" || f.kind === "article") rows = rows.filter((a) => a.kind === f.kind);
  if (f.category === "-") rows = rows.filter((a) => !a.category);
  else if (f.category) rows = rows.filter((a) => (a.category ?? "").toLowerCase() === f.category!.toLowerCase());
  return rows;
}

export type ArticleInput = { id?: string | null; kind?: string; title: string; intro?: string | null; body?: string | null; category?: string | null; keywords?: string | null; published?: boolean; videoUrl?: string | null; steps?: { title?: string; body?: string; videoUrl?: string | null; video?: Video | null }[] };

// Validates and shapes one article or guide (checking its videos); throws with a plain reason.
async function shape(input: ArticleInput, opts: { checkVideos: boolean }) {
  const kind: ArticleKind = input.kind === "guide" || (input.steps?.length ?? 0) > 0 ? "guide" : "article";
  const title = clean(input.title, 160);
  if (!title) throw new WorkflowError("VALIDATION", "Give the title.");
  const intro = clean(kind === "guide" ? (input.intro ?? input.body) : (input.body ?? input.intro), 20000);
  const vid = async (url: string | null | undefined, given: Video | null | undefined, where: string): Promise<Video | null> => {
    if (given?.id && /^[\w-]{11}$/.test(given.id) && !url) return { id: given.id, title: given.title ? clean(given.title, 200) : null };
    const u = clean(url, 400);
    if (!u) return null;
    if (!opts.checkVideos) {
      const id = youtubeId(u);
      if (!id) throw new WorkflowError("VALIDATION", `${where}: that is not a YouTube video link.`);
      return { id, title: null };
    }
    const r = await checkVideo(u);
    if (!r.ok) throw new WorkflowError("VALIDATION", `${where}: ${r.error}`);
    return r.video;
  };
  const steps: Step[] = [];
  if (kind === "guide") {
    for (const [i, s] of (input.steps ?? []).entries()) {
      const st = clean(s.title, 160);
      const sb = clean(s.body, 6000);
      const video = await vid(s.videoUrl, s.video, `Step ${i + 1}`);
      if (!st && !sb && !video) continue;
      steps.push({ title: st || `Step ${steps.length + 1}`, body: sb, video });
    }
    if (!steps.length) throw new WorkflowError("VALIDATION", "A guide needs at least one step.");
    if (steps.length > 40) throw new WorkflowError("VALIDATION", "A guide has at most 40 steps.");
  } else if (!intro) throw new WorkflowError("VALIDATION", "Give the title and the answer.");
  const video = kind === "article" ? await vid(input.videoUrl, null, "Video") : null;
  // Every word, for search and snippets.
  const body = kind === "guide" ? [intro, ...steps.map((s, i) => `${i + 1}. ${s.title}\n${s.body}`)].filter(Boolean).join("\n\n").slice(0, 40000) : intro;
  return { kind, title, intro, body, steps, video, category: clean(input.category, 60) || null, keywords: clean(input.keywords, 300) };
}

export async function saveKbArticle(user: AppUser, input: ArticleInput) {
  const sd = await agent(user);
  const publish = !!input.published;
  if (publish && !(await sd.isLead(user))) throw new WorkflowError("FORBIDDEN", "A support lead publishes articles.");
  // A save that sends no steps (the plain article form) keeps the guide's stored steps.
  if (input.id && input.steps === undefined && input.kind === "guide") {
    const old = await get<{ steps: string | null }>("SELECT steps FROM sup_articles WHERE id = ?", input.id);
    input = { ...input, steps: parseJson<Step[]>(old?.steps ?? null, []).map((s) => ({ title: s.title, body: s.body, video: s.video })) };
  }
  const a = await shape(input, { checkVideos: true });
  const now = nowIso();
  if (input.id) {
    if (!(await get("SELECT id FROM sup_articles WHERE id = ?", input.id))) throw new WorkflowError("NOT_FOUND", "Article not found.");
    await run(
      "UPDATE sup_articles SET kind = ?, title = ?, intro = ?, body = ?, steps = ?, video = ?, category = ?, keywords = ?, published = ?, updated_by = ?, updated_at = ? WHERE id = ?",
      a.kind, a.title, a.intro, a.body, JSON.stringify(a.steps), a.video ? JSON.stringify(a.video) : null, a.category, a.keywords, publish ? 1 : 0, user.id, now, input.id,
    );
    return input.id;
  }
  const id = uid("art_");
  await run(
    "INSERT INTO sup_articles (id, kind, title, intro, body, steps, video, category, keywords, published, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    id, a.kind, a.title, a.intro, a.body, JSON.stringify(a.steps), a.video ? JSON.stringify(a.video) : null, a.category, a.keywords, publish ? 1 : 0, user.id, user.id, now, now,
  );
  return id;
}

// For customers (help center, widget, API): a published article or guide with its videos.
export async function publicArticle(id: string) {
  const r = await get<Row>("SELECT * FROM sup_articles WHERE id = ? AND published = 1", id);
  if (!r) throw new WorkflowError("NOT_FOUND", "Article not found.");
  await run("UPDATE sup_articles SET views = views + 1 WHERE id = ?", id);
  const a = fullOf(r);
  const v = (x: Video | null) => (x ? { ...x, url: watchUrl(x.id), thumbnail: thumbnail(x.id), embed: `https://www.youtube-nocookie.com/embed/${x.id}` } : null);
  return { id: a.id, kind: a.kind, title: a.title, category: a.category, updated_at: a.updated_at, body: a.kind === "guide" ? a.intro : a.body, intro: a.intro, video: v(a.video), steps: a.steps.map((s) => ({ title: s.title, body: s.body, video: v(s.video) })) };
}

// A guide as Telegram messages: the intro, then each step with its video link (Telegram shows the preview).
export async function guideMessages(id: string) {
  const a = await publicArticle(id);
  const out = [[`${a.title}`, a.intro].filter(Boolean).join("\n\n")];
  if (a.kind === "article" && a.video) out[0] += `\n\n${a.video.url}`;
  a.steps.forEach((s, i) => out.push([`${i + 1}. ${s.title}`, s.body, s.video?.url].filter(Boolean).join("\n\n")));
  return out.map((m) => m.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1 ($2)").slice(0, 4000));
}

// ---------------------------------------------------------------------------
// Bulk actions and export
// ---------------------------------------------------------------------------

export async function bulkKb(user: AppUser, ids: string[], action: "publish" | "unpublish" | "delete" | "move", category?: string | null) {
  await lead(user);
  const list = [...new Set(ids.map((x) => clean(x, 40)).filter(Boolean))].slice(0, 1000);
  if (!list.length) throw new WorkflowError("VALIDATION", "Choose articles first.");
  const ph = list.map(() => "?").join(",");
  const now = nowIso();
  let n = 0;
  if (action === "publish" || action === "unpublish") n = (await all(`UPDATE sup_articles SET published = ?, updated_by = ?, updated_at = ? WHERE id IN (${ph}) RETURNING id`, action === "publish" ? 1 : 0, user.id, now, ...list)).length;
  else if (action === "move") n = (await all(`UPDATE sup_articles SET category = ?, updated_by = ?, updated_at = ? WHERE id IN (${ph}) RETURNING id`, clean(category, 60) || null, user.id, now, ...list)).length;
  else if (action === "delete") n = (await all(`DELETE FROM sup_articles WHERE id IN (${ph}) RETURNING id`, ...list)).length;
  else throw new WorkflowError("VALIDATION", "Unknown action.");
  const what = action === "move" ? `moved to ${clean(category, 60) || "no category"}` : action === "delete" ? "deleted" : `${action}ed`;
  await audit({ actor: user }, { action: "support.kb", summary: `${user.name} ${what} ${n} help article${n === 1 ? "" : "s"}` });
  return { changed: n };
}

// Everything as JSON in the import format (a backup, or to move between sites).
export async function exportKb(user: AppUser) {
  await lead(user);
  return (await all<Row>("SELECT * FROM sup_articles ORDER BY category, title")).map(fullOf).map((a) => ({
    title: a.title,
    kind: a.kind,
    category: a.category,
    keywords: a.keywords,
    published: a.published,
    ...(a.kind === "guide" ? { intro: a.intro, steps: a.steps.map((s) => ({ title: s.title, body: s.body, video: s.video ? watchUrl(s.video.id) : null })) } : { body: a.body, video: a.video ? watchUrl(a.video.id) : null }),
  }));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

type Draft = ArticleInput & { source: string };
export type ImportLine = { source: string; title: string; kind: ArticleKind; category: string | null; published: boolean; steps: number; action: "create" | "update" | "skip"; error: string | null };

const truthy = (v: unknown) => (typeof v === "boolean" ? v : /^(1|yes|true|y|published|on)$/i.test(String(v ?? "").trim()));

function fromCsv(text: string, name: string): Draft[] {
  const p = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase() });
  if (!p.meta.fields?.includes("title")) throw new WorkflowError("VALIDATION", `${name}: the first row must name the columns, with at least "title" and "body".`);
  return p.data.map((r, i) => {
    // Steps as columns: step1, step1_video, step2, ... (a line "Title: text" or just text).
    const steps: Draft["steps"] = [];
    for (let n = 1; n <= 40; n++) {
      const s = r[`step${n}`] ?? r[`step ${n}`];
      if (s === undefined) break;
      if (!s.trim() && !(r[`step${n}_video`] ?? "").trim()) continue;
      const [t, ...rest] = s.split(/:\s|\n/);
      steps.push(rest.length ? { title: t, body: rest.join(": ").trim(), videoUrl: r[`step${n}_video`] } : { title: s, body: "", videoUrl: r[`step${n}_video`] });
    }
    return { source: `${name} row ${i + 2}`, title: r.title ?? "", body: r.body ?? r.answer ?? "", intro: r.intro ?? r.body ?? "", category: r.category, keywords: r.keywords, published: truthy(r.published), kind: (r.kind ?? "").trim().toLowerCase() || (steps.length ? "guide" : "article"), videoUrl: r.video, steps };
  });
}

function fromJson(text: string, name: string): Draft[] {
  let j: unknown;
  try {
    j = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    throw new WorkflowError("VALIDATION", `${name} is not valid JSON.`);
  }
  const list = Array.isArray(j) ? j : Array.isArray((j as { articles?: unknown[] })?.articles) ? (j as { articles: unknown[] }).articles : null;
  if (!list) throw new WorkflowError("VALIDATION", `${name}: expected a list of articles ([{"title": ..., "body": ...}]).`);
  return list.map((x, i) => {
    const o = (x ?? {}) as Record<string, unknown>;
    const steps = Array.isArray(o.steps) ? (o.steps as Record<string, unknown>[]).map((s) => (typeof s === "string" ? { title: s, body: "" } : { title: String(s.title ?? ""), body: String(s.body ?? s.text ?? ""), videoUrl: s.video ? String(s.video) : null })) : [];
    return { source: `${name} item ${i + 1}`, title: String(o.title ?? ""), body: String(o.body ?? o.answer ?? ""), intro: String(o.intro ?? o.body ?? ""), category: o.category ? String(o.category) : null, keywords: Array.isArray(o.keywords) ? o.keywords.join(", ") : String(o.keywords ?? ""), published: truthy(o.published), kind: String(o.kind ?? (steps.length ? "guide" : "article")), videoUrl: o.video ? String(o.video) : null, steps };
  });
}

// One Markdown file: front matter (title, category, keywords, published) or the first "# " heading as the title;
// "## " headings are a guide's steps; a YouTube link on its own line is that step's (or the article's) video.
function fromMarkdown(text: string, name: string): Draft[] {
  let md = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const meta: Record<string, string> = {};
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(md);
  if (fm) {
    for (const line of fm[1]!.split("\n")) {
      const m = /^(\w+)\s*:\s*(.*)$/.exec(line);
      if (m) meta[m[1]!.toLowerCase()] = m[2]!.replace(/^["']|["']$/g, "").trim();
    }
    md = md.slice(fm[0].length);
  }
  const h1 = /^#\s+(.+)$/m.exec(md);
  const title = meta.title || h1?.[1]?.trim() || name.replace(/\.(md|markdown)$/i, "").replace(/[-_]+/g, " ");
  if (h1 && !meta.title) md = md.replace(h1[0], "");
  const ytLine = /^\s*<?(https?:\/\/(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/\S+?)>?\s*$/m;
  const takeVideo = (s: string) => {
    const m = ytLine.exec(s);
    return m ? { video: m[1]!, rest: s.replace(m[0], "").trim() } : { video: null, rest: s.trim() };
  };
  const parts = md.split(/^##\s+/m);
  const head = takeVideo(parts.shift() ?? "");
  const steps = parts.map((p) => {
    const nl = p.indexOf("\n");
    const t = (nl < 0 ? p : p.slice(0, nl)).replace(/^(step\s*\d+\s*[:.-]\s*|\d+[.)]\s*)/i, "").trim();
    const v = takeVideo(nl < 0 ? "" : p.slice(nl + 1));
    return { title: t, body: v.rest, videoUrl: v.video };
  });
  const kind = (meta.kind || (steps.length ? "guide" : "article")).toLowerCase();
  return [{ source: name, title, body: head.rest, intro: head.rest, category: meta.category || null, keywords: meta.keywords || "", published: truthy(meta.published), kind, videoUrl: kind === "article" ? head.video : null, steps: kind === "guide" ? steps : [] }];
}

async function drafts(file: { name: string; data: Buffer }): Promise<Draft[]> {
  const name = clean(file.name, 200) || "file";
  if (file.data.length > IMPORT_MAX) throw new WorkflowError("VALIDATION", "The file is larger than 5 MB.");
  const ext = (/\.([a-z]+)$/i.exec(name)?.[1] ?? "").toLowerCase();
  if (ext === "zip") {
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.data);
    } catch {
      throw new WorkflowError("VALIDATION", `${name} is not a ZIP file.`);
    }
    const out: Draft[] = [];
    let total = 0;
    for (const f of Object.values(zip.files).sort((a, b) => a.name.localeCompare(b.name))) {
      if (f.dir || /(^|\/)(__MACOSX|\.)/.test(f.name)) continue;
      const inner = (/\.([a-z]+)$/i.exec(f.name)?.[1] ?? "").toLowerCase();
      if (!["md", "markdown", "csv", "json"].includes(inner)) continue;
      const buf = await f.async("nodebuffer");
      total += buf.length;
      if (total > 20 * 1024 * 1024) throw new WorkflowError("VALIDATION", "The ZIP holds more than 20 MB of text.");
      out.push(...(await drafts({ name: f.name, data: buf })));
    }
    if (!out.length) throw new WorkflowError("VALIDATION", `${name} has no .md, .csv or .json files.`);
    return out;
  }
  const text = file.data.toString("utf8");
  if (ext === "csv") return fromCsv(text, name);
  if (ext === "json") return fromJson(text, name);
  if (ext === "md" || ext === "markdown" || ext === "txt") return fromMarkdown(text, name);
  throw new WorkflowError("VALIDATION", "Import a .csv, .json, .md or .zip file.");
}

// Reads the file and shows what would happen (preview), or does it. An article with the same title is updated;
// a row with a problem is skipped with its reason. Videos are checked with YouTube only on the real import.
export async function importKb(user: AppUser, file: { name: string; data: Buffer }, opts: { preview: boolean; publish?: boolean | null }) {
  await lead(user);
  const list = await drafts(file);
  if (list.length > MAX_ROWS) throw new WorkflowError("VALIDATION", `At most ${MAX_ROWS} articles at a time (this file has ${list.length}).`);
  const existing = new Map((await all<{ id: string; title: string }>("SELECT id, title FROM sup_articles")).map((r) => [r.title.trim().toLowerCase(), r.id]));
  const seen = new Set<string>();
  const lines: ImportLine[] = [];
  let created = 0;
  let updated = 0;
  for (const d of list) {
    const key = clean(d.title, 160).toLowerCase();
    const published = opts.publish === true ? true : opts.publish === false ? false : !!d.published;
    const base = { source: d.source, title: clean(d.title, 160) || "(no title)", category: clean(d.category, 60) || null, published, steps: 0 };
    try {
      if (key && seen.has(key)) throw new WorkflowError("VALIDATION", "The same title appears earlier in this import.");
      const a = await shape({ ...d, published }, { checkVideos: !opts.preview });
      seen.add(key);
      const id = existing.get(key) ?? null;
      lines.push({ ...base, kind: a.kind, steps: a.steps.length, action: id ? "update" : "create", error: null });
      if (opts.preview) continue;
      const now = nowIso();
      if (id) {
        await run("UPDATE sup_articles SET kind = ?, title = ?, intro = ?, body = ?, steps = ?, video = ?, category = ?, keywords = ?, published = ?, updated_by = ?, updated_at = ? WHERE id = ?", a.kind, a.title, a.intro, a.body, JSON.stringify(a.steps), a.video ? JSON.stringify(a.video) : null, a.category, a.keywords, published ? 1 : 0, user.id, now, id);
        updated++;
      } else {
        const nid = uid("art_");
        await run("INSERT INTO sup_articles (id, kind, title, intro, body, steps, video, category, keywords, published, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", nid, a.kind, a.title, a.intro, a.body, JSON.stringify(a.steps), a.video ? JSON.stringify(a.video) : null, a.category, a.keywords, published ? 1 : 0, user.id, user.id, now, now);
        existing.set(key, nid);
        created++;
      }
    } catch (e) {
      lines.push({ ...base, kind: (d.steps?.length ? "guide" : "article") as ArticleKind, action: "skip", error: e instanceof Error ? e.message : String(e) });
    }
  }
  const skipped = lines.filter((l) => l.action === "skip").length;
  if (!opts.preview) await audit({ actor: user }, { action: "support.kb", summary: `${user.name} imported help articles from ${clean(file.name, 120)}: ${created} new, ${updated} updated, ${skipped} skipped` });
  return { preview: opts.preview, created: opts.preview ? lines.filter((l) => l.action === "create").length : created, updated: opts.preview ? lines.filter((l) => l.action === "update").length : updated, skipped, lines };
}
