// The company report format for printing and PDF: the logo and the name Admin set (Configure whole system), a
// cover with the document control table, contents, numbered sections and a footer with page numbers. Plain HTML that
// the browser prints to PDF (A4). Used by the department pages' "PDF report" and the team overview.

import { identity } from "./identity";
import { getSettings } from "./settings";
import { SPEC_CSS, escHtml } from "@/lib/spec-doc";

export type ReportBrand = { name: string; logo: string; color: string };

export async function reportBrand(): Promise<ReportBrand> {
  const [id, s] = await Promise.all([identity().catch(() => null), getSettings()]);
  return { name: s.workspace.name || "Myseed", logo: `/api/branding/logo?v=${id?.version ?? "0"}`, color: id?.color ?? "#7b68ee" };
}

export const esc = escHtml;

export function table(head: string[], rows: (string | number | null | undefined)[][], right: number[] = [], raw: number[] = []) {
  const cell = (c: unknown, i: number) => (raw.includes(i) ? String(c ?? "") : escHtml(String(c ?? "")));
  return `<div class="spec-table"><table><thead><tr>${head.map((h, i) => `<th${right.includes(i) ? ' style="text-align:right"' : ""}>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r) => `<tr>${r.map((c, i) => `<td${right.includes(i) ? ' style="text-align:right"' : ""}>${cell(c, i)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}">None</td></tr>`
  }</tbody></table></div>`;
}

export const tiles = (list: [string, string | number][]) =>
  `<div class="ov-tiles">${list.map(([l, v]) => `<div class="ov-tile"><p class="ov-l">${escHtml(l)}</p><p class="ov-v">${escHtml(String(v))}</p></div>`).join("")}</div>`;

// A small progress bar for a table cell (raw HTML).
export const bar = (pct: number, color = "var(--spec-accent, #7b68ee)") =>
  `<span class="rep-bar"><span style="width:${Math.max(0, Math.min(100, Math.round(pct)))}%;background:${color}"></span></span> ${Math.round(pct)}%`;

export const callout = (title: string, html: string) => `<blockquote class="spec-callout spec-callout-note"><p class="spec-callout-title">${escHtml(title)}</p>${html}</blockquote>`;

export type ReportSection = { id: string; title: string; html: string };

export function reportDocument(o: {
  brand: ReportBrand;
  title: string;
  kind: string;
  ref: string;
  control: [string, string][];
  sections: ReportSection[];
  landscape?: boolean;
  css?: string;
}) {
  const footer = `${o.brand.name} · ${o.title}`.replace(/["\\]/g, "");
  const control = `<table class="spec-control"><tbody>${[["Document", `<span class="spec-mono">${escHtml(o.ref)}</span>`] as const, ...o.control.map(([k, v]) => [k, escHtml(v)] as const)]
    .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${v}</td></tr>`)
    .join("")}</tbody></table>`;
  const toc = `<nav class="spec-toc" aria-label="Contents"><p class="spec-toc-title">Contents</p><ol>${o.sections.map((s, i) => `<li class="d1"><a href="#rep-${s.id}">${i + 1}. ${escHtml(s.title)}</a></li>`).join("")}</ol></nav>`;
  const body = o.sections.map((s, i) => `<h1 id="rep-${s.id}">${i + 1}. ${escHtml(s.title)}</h1>${s.html}`).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escHtml(o.title)}</title><style>
@page{size:A4 ${o.landscape ? "landscape" : "portrait"};margin:14mm 14mm 16mm;@bottom-left{content:"${footer}";font:9pt Calibri,Arial,sans-serif;color:#6b7280}@bottom-right{content:counter(page) " / " counter(pages);font:9pt Calibri,Arial,sans-serif;color:#6b7280}}
html,body{margin:0;background:#eef0f3}body{font-family:Calibri,"Segoe UI",Arial,"Noto Sans Ethiopic",sans-serif;padding:24px 12px}
@media print{html,body{background:#fff;padding:0}.rep-actions{display:none}}
${SPEC_CSS}
.spec-doc{max-width:${o.landscape ? "72rem" : "52rem"}}
.spec-band{background:${o.brand.color}}
.rep-brand{display:flex;align-items:center;gap:.6rem}.rep-brand img{width:34px;height:34px;object-fit:contain}
.ov-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(9rem,1fr));gap:8px;margin:.5rem 0 1rem}
.ov-tile{border:1px solid var(--spec-rule);border-radius:10px;padding:.5rem .75rem;break-inside:avoid}
.ov-l{margin:0;font-size:11px;color:var(--spec-muted)}.ov-v{margin:.15rem 0 0;font-size:18px;font-weight:700}
.spec-table td,.spec-table th{min-width:0}
.rep-bar{display:inline-block;width:70px;height:7px;border-radius:9px;background:#e5e7eb;vertical-align:middle;overflow:hidden}.rep-bar>span{display:block;height:100%;border-radius:9px}
.rep-gantt{position:relative;height:12px;background:#f3f4f6;border-radius:4px;min-width:180px}.rep-gantt>span{position:absolute;top:2px;height:8px;border-radius:4px}
.rep-tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:9px;background:#eef2ff;color:#3730a3;white-space:nowrap}
.rep-actions{position:fixed;top:12px;right:12px;display:flex;gap:8px;z-index:5}.rep-actions button{font:600 13px system-ui;padding:8px 14px;border-radius:8px;border:1px solid #d1d5db;background:#fff;cursor:pointer}.rep-actions button.p{background:${o.brand.color};color:#fff;border-color:transparent}
h2.rep-sub{font-size:13pt;margin:1.1rem 0 .4rem}
${o.css ?? ""}
</style></head><body><div class="rep-actions"><button class="p" onclick="window.print()">Save as PDF or print</button></div><article class="spec-doc spec-print"><div class="spec-cover"><div class="spec-band"></div><header class="spec-head"><div class="spec-brand rep-brand"><img src="${escHtml(o.brand.logo)}" alt=""><span>${escHtml(o.brand.name)}</span></div><div class="spec-ref">${escHtml(o.kind)}<br>${escHtml(o.ref)}</div></header><section class="spec-titleblock"><p class="spec-kind">${escHtml(o.kind)}</p><h1 class="spec-title">${escHtml(o.title)}</h1>${control}</section></div>${o.sections.length > 1 ? toc : ""}<div class="spec-body">${body}</div><footer class="spec-foot"><span>${escHtml(o.brand.name)} · Internal report</span><span>${escHtml(o.ref)}</span></footer></article><script>window.addEventListener("load",()=>{if(new URLSearchParams(location.search).get("print")==="1")setTimeout(()=>window.print(),400)})</script></body></html>`;
}
