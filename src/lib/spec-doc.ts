// Specs and documents shown as a company document: the formatted view in the app, the PDF (print) and the HTML
// export all come from here, so they look the same. The document itself stays Markdown, exactly as written or
// imported; this only renders it.
//
// Safe by construction: raw HTML in a document is shown as text, links go only to web, mail, phone and in-page
// addresses (or to another document in the library), and images only from the web or this site.
//
// Runs in the browser and on the server (marked has no Node dependencies).

import { Marked, type Tokens } from "marked";

export type SpecHeading = { id: string; depth: number; text: string };
export type SpecMeta = Record<string, string>;

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escHtml = (s: string) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]!);
const norm = (s: string) => s.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

// ---------------------------------------------------------------------------
// Reading a Markdown document
// ---------------------------------------------------------------------------

// YAML-style front matter ("---" lines around "key: value" lines) at the very top. Anything else that starts
// with "---" is the document's own text (a horizontal rule), so it is left alone.
export function splitFrontMatter(md: string): { meta: SpecMeta; body: string } {
  const m = String(md ?? "").match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { meta: {}, body: md ?? "" };
  const meta: SpecMeta = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    if (!line.trim() || /^\s+/.test(line) || /^\s*#/.test(line)) continue;
    const kv = line.match(/^([A-Za-z][\w .-]{0,40}):\s*(.*)$/);
    if (!kv) return { meta: {}, body: md };
    const v = kv[2]!.trim().replace(/^["'](.*)["']$/, "$1");
    if (v) meta[kv[1]!.trim()] = v;
  }
  return { meta, body: md.slice(m[0].length) };
}

// The title a Markdown file gives itself: "title:" in its front matter, or a single "# Heading" on its first line
// (a document with several level-one headings uses them as sections, so none of them is the title).
export function markdownTitle(md: string): string | null {
  const { meta, body } = splitFrontMatter(md);
  if (meta.title) return meta.title.slice(0, 160);
  const first = body.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
  if (!first) return null;
  const h1s = withoutCode(body).match(/^#[ \t]+\S/gm) ?? [];
  return h1s.length === 1 ? first[1]!.replace(/[*_`]/g, "").trim().slice(0, 160) || null : null;
}

const withoutCode = (s: string) => s.replace(/^(```|~~~)[\s\S]*?^\1/gm, "");

// Text written one line per thought (a document typed in the app, or imported from Word) keeps its line breaks.
// Markdown wrapped at a fixed width (many READMEs) is joined into paragraphs as Markdown intends.
export function looksHardWrapped(body: string) {
  const lines = body.split(/\r?\n/);
  const prose = (s: string) => s.trim().length > 0 && !/^\s*([#>|]|[-*+]\s|\d+[.)]\s|```|~~~|<)/.test(s);
  let pairs = 0;
  let wrapped = 0;
  let code = false;
  for (let i = 0; i < lines.length - 1; i++) {
    const l = lines[i]!;
    if (/^\s*(```|~~~)/.test(l)) code = !code;
    if (code) continue;
    if (prose(l) && prose(lines[i + 1]!)) {
      pairs++;
      const t = l.trimEnd();
      if (t.length >= 60 && t.length <= 120 && !/[.:;!?)]$/.test(t) && !/ {2}$/.test(l)) wrapped++;
    }
  }
  return pairs >= 6 && wrapped / pairs >= 0.5;
}

// A relative link from one repository file to another ("RUNBOOK.md", "../README.md#setup"), as a repository path.
export function resolveRepoPath(fromFile: string, href: string): string | null {
  const [p] = href.split("#");
  if (!p || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith("/")) return null;
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.join("/");
}

// ---------------------------------------------------------------------------
// Rendering the body
// ---------------------------------------------------------------------------

const REQ = /\b(?:FR|NFR|IR|DR|UR|SR|TC|ADR|SOP-DEV|RULE)-\d{1,4}\b/g;
// The text is already escaped here, so the apostrophe in "Won't" may be "&#39;".
const MOSCOW = /\((Must|Should|Could|Won(?:[’']|&#39;)t)\)/g;
// Requirement IDs and MoSCoW priorities stand out in the text (never inside code).
const markText = (escaped: string) =>
  escaped
    .replace(REQ, (id) => `<span class="spec-req">${id}</span>`)
    .replace(MOSCOW, (_, p: string) => `<span class="spec-moscow spec-moscow-${/^won/i.test(p) ? "wont" : p.toLowerCase()}">${p}</span>`);

const CALLOUTS: Record<string, string> = { note: "Note", tip: "Tip", important: "Important", warning: "Warning", caution: "Caution" };

export type RenderOptions = {
  // The document's title: a first-line "# Title" that repeats it is not shown twice (the header shows it).
  title?: string;
  // A relative link, as the URL of the document it points to in the library, or null (shown as plain text).
  linkTo?: (href: string) => string | null;
};

export function renderSpecBody(md: string, opts: RenderOptions = {}) {
  const { meta, body: raw } = splitFrontMatter(md);
  let body = raw;
  if (opts.title) {
    const m = body.match(/^\s*#[ \t]+(.+?)[ \t#]*(?:\r?\n|$)/);
    if (m && norm(m[1]!) === norm(opts.title)) body = body.slice(m[0].length);
  }
  const headings: SpecHeading[] = [];
  const used = new Map<string, number>();
  const slug = (text: string) => {
    const s =
      text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 60) || "section";
    const n = (used.get(s) ?? 0) + 1;
    used.set(s, n);
    return n > 1 ? `${s}-${n}` : s;
  };
  const marked = new Marked({ gfm: true, breaks: !looksHardWrapped(body) });
  marked.use({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = plain(inner);
        const id = slug(text);
        if (depth <= 3) headings.push({ id, depth, text });
        return `<h${depth} id="spec-${id}">${inner}</h${depth}>\n`;
      },
      // Raw HTML is shown as text, never run.
      html({ text }: Tokens.HTML | Tokens.Tag) {
        return escHtml(text);
      },
      text(token: Tokens.Text | Tokens.Escape) {
        if ("tokens" in token && token.tokens) return this.parser.parseInline(token.tokens);
        return markText("escaped" in token && token.escaped ? token.text : escHtml(token.text));
      },
      link({ href, title, tokens }: Tokens.Link) {
        const inner = this.parser.parseInline(tokens);
        const h = String(href ?? "").trim();
        const t = title ? ` title="${escHtml(title)}"` : "";
        if (/^https?:\/\//i.test(h)) return `<a href="${escHtml(h)}"${t} target="_blank" rel="noopener noreferrer">${inner}</a>`;
        if (/^(mailto|tel):/i.test(h) || /^#[\w-]*$/.test(h)) return `<a href="${escHtml(h)}"${t}>${inner}</a>`;
        if (/^\/(?!\/)/.test(h)) return `<a href="${escHtml(h)}"${t}>${inner}</a>`;
        if (/^[a-z][a-z0-9+.-]*:/i.test(h) || !h) return inner;
        const to = opts.linkTo?.(h);
        if (to) return `<a href="${escHtml(to)}" data-doc-link="${escHtml(to)}"${t}>${inner}</a>`;
        return `<span class="spec-xref" title="${escHtml(h)}">${inner}</span>`;
      },
      image({ href, title, text }: Tokens.Image) {
        const h = String(href ?? "").trim();
        if (!/^(https?:\/\/|\/(?!\/))/i.test(h)) return escHtml(text);
        // A draw.io diagram: its picture, with an Edit in draw.io button where the reader may edit.
        const dg = h.match(/^\/api\/diagrams\/(dgm_[A-Za-z0-9_-]+)/);
        if (dg) return `<figure class="spec-drawio" data-drawio="${escHtml(dg[1]!)}"><img src="${escHtml(h)}" alt="${escHtml(text)}" loading="lazy">${text ? `<figcaption>${escHtml(text)}</figcaption>` : ""}</figure>`;
        return `<img src="${escHtml(h)}" alt="${escHtml(text)}"${title ? ` title="${escHtml(title)}"` : ""} loading="lazy">`;
      },
      code({ text, lang }: Tokens.Code) {
        const l = (lang ?? "").trim().split(/\s+/)[0] ?? "";
        // Drawn in the browser (src/components/app/diagrams.tsx); the source stays underneath for print without scripts.
        if (l.toLowerCase() === "mermaid") return `<figure class="spec-diagram" data-mermaid><pre class="spec-mermaid-src"><code>${escHtml(text)}</code></pre></figure>\n`;
        return `<pre class="spec-code"${l ? ` data-lang="${escHtml(l)}"` : ""}><code>${escHtml(text)}</code></pre>\n`;
      },
      blockquote({ tokens }: Tokens.Blockquote) {
        let inner = this.parser.parse(tokens);
        const m = inner.match(/^<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:<br>)?\s*/i);
        if (!m) return `<blockquote>${inner}</blockquote>\n`;
        const kind = m[1]!.toLowerCase();
        inner = `<p>${inner.slice(m[0].length)}`.replace(/^<p><\/p>\s*/, "");
        return `<blockquote class="spec-callout spec-callout-${kind}"><p class="spec-callout-title">${CALLOUTS[kind]}</p>${inner}</blockquote>\n`;
      },
      listitem(item: Tokens.ListItem) {
        return `<li${item.task ? ' class="spec-task"' : ""}>${this.parser.parse(item.tokens)}</li>\n`;
      },
      checkbox({ checked }: Tokens.Checkbox) {
        return `<span class="spec-check${checked ? " is-done" : ""}" role="img" aria-label="${checked ? "Done" : "Not done"}"></span>`;
      },
      table(token: Tokens.Table) {
        const cell = (c: Tokens.TableCell) => {
          const tag = c.header ? "th" : "td";
          return `<${tag}${c.align ? ` style="text-align:${c.align}"` : ""}>${this.parser.parseInline(c.tokens)}</${tag}>`;
        };
        const head = `<thead><tr>${token.header.map(cell).join("")}</tr></thead>`;
        const rows = token.rows.length ? `<tbody>${token.rows.map((r) => `<tr>${r.map(cell).join("")}</tr>`).join("")}</tbody>` : "";
        return `<div class="spec-table"><table>${head}${rows}</table></div>\n`;
      },
    },
  });
  const html = marked.parse(body, { async: false }) as string;
  return { html, headings, meta };
}

// ---------------------------------------------------------------------------
// The whole document: header, document control, contents, body, footer
// ---------------------------------------------------------------------------

export type SpecDocInput = {
  workspace: string;
  logoUrl?: string | null;
  title: string;
  kindLabel: string;
  ref: string;
  version: number;
  status: string;
  statusLabel: string;
  author?: string | null;
  updatedAt?: string | null;
  approvedAt?: string | null;
  project?: string | null;
  reviewers?: { name: string; approved: boolean }[];
  source?: string | null;
  body: string;
  linkTo?: (href: string) => string | null;
};

const day = (s?: string | null) => (s ? s.slice(0, 10) : "");

export function specArticleHtml(d: SpecDocInput, opts: { forPrint?: boolean } = {}) {
  const { html, headings, meta } = renderSpecBody(d.body, { title: d.title, linkTo: d.linkTo });
  const row = (k: string, v: string) => (v ? `<tr><th scope="row">${escHtml(k)}</th><td>${v}</td></tr>` : "");
  const status = `<span class="spec-status spec-status-${escHtml(d.status)}">${escHtml(d.statusLabel)}</span>`;
  const reviewers = (d.reviewers ?? []).map((r) => `${escHtml(r.name)}${r.approved ? ' <span class="spec-ok">approved</span>' : ' <span class="spec-pending">pending</span>'}`).join(", ");
  const extra = Object.entries(meta)
    .filter(([k]) => !/^title$/i.test(k))
    .slice(0, 8)
    .map(([k, v]) => row(k[0]!.toUpperCase() + k.slice(1), escHtml(v)))
    .join("");
  const control = `<table class="spec-control"><tbody>${row("Document", `<span class="spec-mono">${escHtml(d.ref)}</span>`)}${row("Version", `${d.version} ${status}`)}${row("Owner", escHtml(d.author ?? ""))}${row("Project", escHtml(d.project ?? ""))}${row("Last updated", escHtml(day(d.updatedAt)))}${row("Approved", escHtml(day(d.approvedAt)))}${row("Reviewers", reviewers)}${row("Source", d.source ? `<span class="spec-mono">${escHtml(d.source)}</span> (kept in step with the repository)` : "")}${extra}</tbody></table>`;
  const toc =
    headings.length >= 3
      ? `<nav class="spec-toc" aria-label="Contents"><p class="spec-toc-title">Contents</p><ol>${headings
          .filter((h) => h.depth <= (headings.some((x) => x.depth === 1) ? 2 : 3))
          .map((h) => `<li class="d${h.depth}"><a href="#spec-${h.id}">${escHtml(h.text)}</a></li>`)
          .join("")}</ol></nav>`
      : "";
  const logo = d.logoUrl ? `<img src="${escHtml(d.logoUrl)}" alt="">` : "";
  const header = `<div class="spec-band"></div><header class="spec-head"><div class="spec-brand">${logo}<span>${escHtml(d.workspace)}</span></div><div class="spec-ref">${escHtml(d.kindLabel)}<br>${escHtml(d.ref)} · v${d.version}</div></header><section class="spec-titleblock"><p class="spec-kind">${escHtml(d.kindLabel)}</p><h1 class="spec-title">${escHtml(d.title)}</h1>${control}</section>`;
  const foot = `<footer class="spec-foot"><span>${escHtml(d.workspace)} · Internal document</span><span>${escHtml(d.title)} · v${d.version} · ${escHtml(d.statusLabel)}</span></footer>`;
  return `<article class="spec-doc${opts.forPrint ? " spec-print" : ""}">${opts.forPrint ? `<div class="spec-cover">${header}</div>` : header}${toc}<div class="spec-body">${html || '<p class="spec-empty">This document is empty.</p>'}</div>${foot}</article>`;
}

// A standalone page (print to PDF, or the HTML export) with the same look, A4, page numbers where the browser
// supports them, and the cover on its own page.
export function specDocumentHtml(d: SpecDocInput) {
  const footer = `${d.workspace} · ${d.title} · v${d.version}`.replace(/["\\]/g, "");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(d.title)}</title><style>
@page{size:A4;margin:18mm 16mm 20mm;@bottom-left{content:"${footer}";font:9pt Calibri,Arial,sans-serif;color:#6b7280}@bottom-right{content:counter(page) " / " counter(pages);font:9pt Calibri,Arial,sans-serif;color:#6b7280}}
html,body{margin:0;background:#eef0f3}body{font-family:Calibri,"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;padding:24px 12px}
@media print{html,body{background:#fff;padding:0}}
${SPEC_CSS}</style></head><body>${specArticleHtml(d, { forPrint: true })}</body></html>`;
}

// One stylesheet for the app and the printed page. In the app the colours follow the theme (its variables); on
// a printed page, where those variables do not exist, the fallbacks give Myseed's print colours.
export const SPEC_CSS = `
.spec-doc{--spec-paper:var(--card,#fff);--spec-ink:var(--card-foreground,#1f2328);--spec-muted:var(--muted-foreground,#5f6b7a);--spec-rule:var(--border,#e3e6ea);--spec-soft:var(--muted,#f5f6f8);--spec-accent:var(--brand,#074924);--spec-accent-2:var(--brand-fresh,#5dba47);--spec-link:var(--info,#1a5fd0);background:var(--spec-paper);color:var(--spec-ink);line-height:1.65;font-size:15px;border:1px solid var(--spec-rule);border-radius:12px;box-shadow:0 1px 2px rgb(0 0 0/.04),0 12px 32px -18px rgb(0 0 0/.25);max-width:56rem;margin:0 auto;overflow:hidden;overflow-wrap:anywhere}
.dark:not([data-mode="light"]) .spec-doc,:root[data-mode="dark"] .spec-doc{--spec-accent:var(--brand-fresh,#5dba47)}
.spec-band{height:6px;background:linear-gradient(90deg,var(--spec-accent),var(--spec-accent-2))}
.spec-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1.1rem 2.5rem 0}
.spec-brand{display:flex;align-items:center;gap:.6rem;font-weight:700;color:var(--spec-accent);font-size:14px}
.spec-brand img{height:30px;width:30px;object-fit:contain}
.spec-ref{font:500 11.5px/1.45 var(--font-mono,ui-monospace,Consolas,monospace);color:var(--spec-muted);text-align:right}
.spec-titleblock{padding:1.25rem 2.5rem 1.4rem;border-bottom:1px solid var(--spec-rule)}
.spec-kind{margin:0;text-transform:uppercase;letter-spacing:.09em;font-size:11px;font-weight:700;color:var(--spec-accent)}
.spec-title{font-size:2rem;line-height:1.2;font-weight:750;margin:.35rem 0 1rem;letter-spacing:-.015em;color:var(--spec-ink)}
.spec-control{width:100%;border-collapse:collapse;font-size:13px;border-top:1px solid var(--spec-rule)}
.spec-control th{width:9.5rem;text-align:left;font-weight:600;color:var(--spec-muted);padding:.4rem .75rem .4rem 0;vertical-align:top;white-space:nowrap;overflow-wrap:normal}
.spec-control td{padding:.4rem 0;vertical-align:top}
.spec-control tr{border-bottom:1px solid var(--spec-rule)}
.spec-mono{font-family:var(--font-mono,ui-monospace,Consolas,monospace);font-size:.92em}
.spec-status{display:inline-block;margin-left:.4rem;border-radius:999px;padding:0 .6rem;font-size:11.5px;font-weight:700;line-height:1.6;border:1px solid var(--spec-rule);background:var(--spec-soft);color:var(--spec-muted)}
.spec-status-approved{color:#17663a;background:#e3f4e8;border-color:#b5dcc2}
.spec-status-review{color:#7a5200;background:#fff3d1;border-color:#efd27f}
.spec-ok{color:#17663a;font-weight:600}.spec-pending{color:var(--spec-muted)}
.dark:not([data-mode="light"]) .spec-status-approved,:root[data-mode="dark"] .spec-status-approved,.dark:not([data-mode="light"]) .spec-ok,:root[data-mode="dark"] .spec-ok{color:#8fe0a8;background:transparent;border-color:#2f6b45}
.dark:not([data-mode="light"]) .spec-status-review,:root[data-mode="dark"] .spec-status-review{color:#f3cf6b;background:transparent;border-color:#6b5520}
.spec-toc{margin:1.5rem 2.5rem 0;padding:1rem 1.25rem;background:var(--spec-soft);border-radius:10px;font-size:13.5px}
.spec-toc-title{margin:0 0 .4rem;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--spec-muted)}
.spec-toc ol{list-style:none;margin:0;padding:0;columns:2 16rem;column-gap:2rem}
.spec-toc li{break-inside:avoid;padding:.12rem 0}
.spec-toc li.d2{padding-left:1rem}.spec-toc li.d3{padding-left:2rem;font-size:.95em}
.spec-toc a{color:var(--spec-ink);text-decoration:none}.spec-toc a:hover{color:var(--spec-accent);text-decoration:underline}
.spec-body{padding:1.25rem 2.5rem 2.25rem}
.spec-body>:first-child{margin-top:.5rem}
.spec-body h1,.spec-body h2,.spec-body h3,.spec-body h4,.spec-body h5,.spec-body h6{scroll-margin-top:5rem;line-height:1.3;color:var(--spec-ink)}
.spec-body h1{font-size:1.45rem;font-weight:750;margin:2.1rem 0 .7rem;padding-bottom:.35rem;border-bottom:2px solid var(--spec-accent)}
.spec-body h2{font-size:1.18rem;font-weight:700;margin:1.7rem 0 .5rem;color:var(--spec-accent)}
.spec-body h3{font-size:1.03rem;font-weight:700;margin:1.3rem 0 .35rem}
.spec-body h4,.spec-body h5,.spec-body h6{font-size:.95rem;font-weight:700;margin:1.1rem 0 .3rem;color:var(--spec-muted)}
.spec-body p{margin:.55rem 0}
.spec-body ul,.spec-body ol{padding-left:1.5rem;margin:.5rem 0}
.spec-body li{margin:.22rem 0}.spec-body li>p{margin:.2rem 0}
.spec-body li::marker{color:var(--spec-accent)}
.spec-body li.spec-task{list-style:none;margin-left:-1.3rem}
.spec-check{display:inline-block;position:relative;width:14px;height:14px;border:1.5px solid var(--spec-muted);border-radius:3px;vertical-align:-2px;margin-right:.5rem}
.spec-check.is-done{background:var(--spec-accent);border-color:var(--spec-accent)}
.spec-check.is-done::after{content:"";position:absolute;left:3.5px;top:0;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(45deg)}
.spec-table{overflow-x:auto;margin:1rem 0;border:1px solid var(--spec-rule);border-radius:10px}
.spec-table table{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.5}
.spec-table th{background:var(--spec-soft);text-align:left;font-weight:700;font-size:12.5px}
.spec-table th,.spec-table td{padding:.5rem .8rem;border-bottom:1px solid var(--spec-rule);vertical-align:top;min-width:6rem}
.spec-table tbody tr:last-child td{border-bottom:0}
.spec-table tbody tr:nth-child(even) td{background:color-mix(in srgb,var(--spec-soft) 55%,transparent)}
.spec-body code{font-family:var(--font-mono,ui-monospace,Consolas,monospace);font-size:.86em;background:var(--spec-soft);border:1px solid var(--spec-rule);padding:.05em .35em;border-radius:5px}
.spec-code,.spec-diagram pre{margin:1rem 0;background:var(--spec-soft);border:1px solid var(--spec-rule);border-radius:10px;padding:.85rem 1rem;overflow-x:auto;font-size:13px;line-height:1.55}
.spec-code code,.spec-diagram code{background:none;border:0;padding:0;font-size:inherit;white-space:pre}
.spec-code[data-lang]::before{content:attr(data-lang);display:block;font:700 10.5px/1 var(--font-mono,ui-monospace,monospace);text-transform:uppercase;letter-spacing:.08em;color:var(--spec-muted);margin-bottom:.55rem}
.spec-diagram{margin:1rem 0}.spec-diagram figcaption{font-size:12px;color:var(--spec-muted);font-weight:600}
.spec-diagram.is-drawn pre{display:none}.spec-diagram .spec-mermaid-svg{display:flex;justify-content:center;overflow-x:auto;padding:.5rem;background:#fff;border:1px solid var(--spec-rule);border-radius:10px}.spec-diagram .spec-mermaid-svg svg{max-width:100%;height:auto}
.spec-drawio{margin:1rem 0;position:relative;text-align:center}.spec-drawio img{max-width:100%;height:auto;background:#fff;border:1px solid var(--spec-rule);border-radius:10px;padding:.5rem}.spec-drawio figcaption{font-size:12px;color:var(--spec-muted);margin-top:.3rem}.spec-drawio .spec-drawio-edit{position:absolute;top:.5rem;right:.5rem;font:600 12px/1 system-ui;padding:.4rem .6rem;border-radius:8px;border:1px solid var(--spec-rule);background:#fff;color:#1f2937;cursor:pointer}@media print{.spec-drawio-edit{display:none}}
.spec-body blockquote{margin:1rem 0;padding:.7rem 1rem;border-left:4px solid var(--spec-accent);background:var(--spec-soft);border-radius:0 10px 10px 0}
.spec-body blockquote>:first-child{margin-top:0}.spec-body blockquote>:last-child{margin-bottom:0}
.spec-callout-note{border-left-color:#2f80ed!important}.spec-callout-tip{border-left-color:#1f9d55!important}.spec-callout-important{border-left-color:#7b68ee!important}.spec-callout-warning{border-left-color:#c27b00!important}.spec-callout-caution{border-left-color:#e2445c!important}
.spec-callout-title{font-weight:800;font-size:11px!important;text-transform:uppercase;letter-spacing:.09em;margin:0 0 .25rem!important;color:var(--spec-muted)}
.spec-req{font:700 .8em/1 var(--font-mono,ui-monospace,Consolas,monospace);color:var(--spec-accent);background:color-mix(in srgb,var(--spec-accent) 11%,transparent);border-radius:4px;padding:.18em .4em;white-space:nowrap}
.spec-moscow{font-size:.74em;font-weight:800;letter-spacing:.03em;border-radius:999px;padding:.12em .55em;white-space:nowrap;border:1px solid}
.spec-moscow-must{color:#b4233a;border-color:#f0b7c1}.spec-moscow-should{color:#8a5a00;border-color:#ecd08a}.spec-moscow-could{color:#1d5fbf;border-color:#b5cdf2}.spec-moscow-wont{color:var(--spec-muted);border-color:var(--spec-rule)}
.spec-body hr{border:0;border-top:1px solid var(--spec-rule);margin:1.75rem 0}
.spec-body a{color:var(--spec-link);text-decoration:underline;text-underline-offset:2px}
.spec-xref{border-bottom:1px dotted var(--spec-muted);cursor:help}
.spec-body img{max-width:100%;height:auto;border-radius:8px}
.spec-empty{color:var(--spec-muted);font-style:italic}
.spec-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem 1rem;padding:.85rem 2.5rem;border-top:1px solid var(--spec-rule);font-size:12px;color:var(--spec-muted);background:var(--spec-soft)}
@media (max-width:640px){.spec-doc{font-size:14.5px;border-radius:10px}.spec-head,.spec-titleblock,.spec-body,.spec-foot{padding-left:1rem;padding-right:1rem}.spec-toc{margin-left:1rem;margin-right:1rem}.spec-title{font-size:1.5rem}.spec-control th{width:auto;padding-right:.6rem}.spec-ref{display:none}}
.spec-print{box-shadow:none}
@media print{.spec-doc{border:0;border-radius:0;box-shadow:none;max-width:none;font-size:11pt}.spec-cover{break-after:page;min-height:240mm;display:flex;flex-direction:column}.spec-cover .spec-titleblock{margin-top:32mm;border-bottom:0}.spec-cover .spec-title{font-size:28pt}.spec-head,.spec-titleblock,.spec-body,.spec-foot{padding-left:0;padding-right:0}.spec-toc{margin-left:0;margin-right:0;break-after:page}.spec-foot{display:none}.spec-body h1,.spec-body h2,.spec-body h3{break-after:avoid}.spec-table,.spec-code,.spec-body blockquote,.spec-diagram{break-inside:avoid}.spec-table{overflow:visible}.spec-body a{color:inherit}}
`;
