// The project book's look: a printed technical book. A4, a cover page, chapters starting on a new page with a large
// number, running header and page numbers (CSS page margin boxes, Chrome and Edge), serif body text, tables and
// figures that do not break across pages. Shared by the screen and print.
export const BOOK_CSS = `
.book{--ink:#16181d;--muted:#5d6470;--rule:#e3e5ea;--soft:#f6f7f9;--accent:#2b5fd9;color:var(--ink);background:#fff;font:15.5px/1.68 "Source Serif 4","Iowan Old Style","Palatino Linotype",Georgia,serif;max-width:860px;margin:0 auto;padding:0 56px 80px}
.book h1,.book h2,.book h3,.book h4,.book th,.book .chapter-no,.book .doc-meta,.book .cover-org,.book .cover-kind,.book .cover-sub,.book .cover-meta,.book .toc,.book figcaption,.book .cover-foot{font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif}
.book h1{font-size:30px;line-height:1.2;letter-spacing:-.01em;margin:0 0 18px}
.book h2{font-size:21px;margin:34px 0 10px;padding-top:6px;border-top:1px solid var(--rule)}
.book h3{font-size:17px;margin:24px 0 6px}
.book h4{font-size:15px;margin:18px 0 4px}
.book p{margin:0 0 12px}
.book a{color:var(--accent);text-decoration:none}
.book table{width:100%;border-collapse:collapse;margin:12px 0 18px;font-size:13.5px;font-family:Inter,"Segoe UI",Roboto,Arial,sans-serif}
.book th,.book td{border:1px solid var(--rule);padding:6px 9px;text-align:left;vertical-align:top}
.book thead th{background:var(--soft);font-weight:600}
.book .kv th{width:28%;background:var(--soft);font-weight:600}
.book .muted{color:var(--muted)}
.book code{font-family:"JetBrains Mono",Consolas,monospace;font-size:.88em;background:var(--soft);padding:1px 5px;border-radius:4px}
.book pre{background:var(--soft);border:1px solid var(--rule);border-radius:8px;padding:12px 14px;overflow-x:auto;font-size:12.5px;line-height:1.5}
.book pre code{background:none;padding:0}
.book blockquote{margin:14px 0;padding:8px 16px;border-left:3px solid var(--accent);background:var(--soft);color:#333}
.book img{max-width:100%}
.book-cover{min-height:1000px;display:flex;flex-direction:column;justify-content:flex-start;position:relative;padding-top:120px}
.book-cover .cover-band{position:absolute;left:-56px;right:-56px;top:0;height:14px}
.book-cover .cover-logo{width:72px;height:72px;object-fit:contain;margin-bottom:20px}
.book-cover .cover-org{font-size:14px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0}
.book-cover .cover-kind{font-size:15px;color:var(--accent);font-weight:600;margin:80px 0 6px;letter-spacing:.04em;text-transform:uppercase}
.book-cover .cover-title{font-size:54px;line-height:1.05;letter-spacing:-.02em;margin:0 0 12px;font-weight:800}
.book-cover .cover-sub{font-size:18px;color:var(--muted);margin:0 0 60px}
.book-cover .cover-meta{width:auto;min-width:60%;font-size:13.5px}
.book-cover .cover-meta th{width:140px;background:transparent;border:0;border-bottom:1px solid var(--rule);color:var(--muted);font-weight:500;padding-left:0}
.book-cover .cover-meta td{border:0;border-bottom:1px solid var(--rule)}
.book-cover .cover-foot{margin-top:auto;font-size:12.5px;color:var(--muted)}
.book-front,.book-chapter{padding-top:48px}
.book .chapter-no{font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0 0 6px}
.book .chapter-intro{font-size:17px;color:var(--muted);font-style:italic;margin-bottom:22px}
.book .doc-meta{font-size:12px;color:var(--muted);margin:-4px 0 14px}
.book .toc{list-style:none;padding:0;counter-reset:ch;font-size:15px}
.book .toc>li{counter-increment:ch;padding:6px 0;border-bottom:1px dotted var(--rule)}
.book .toc>li>a::before{content:counter(ch) ". ";color:var(--muted)}
.book .toc ol{list-style:none;padding-left:22px;font-size:13.5px;margin:4px 0 0}
.book .toc ol li{padding:2px 0}
.book-figure{margin:16px 0 24px;text-align:center}
.book-figure svg{max-width:100%;height:auto;border:1px solid var(--rule);border-radius:10px}
.book figcaption{font-size:12px;color:var(--muted);margin-top:6px}
.book .spec-diagram{margin:16px 0;text-align:center}
.book .spec-diagram.is-drawn pre{display:none}
.book .spec-mermaid-svg{display:flex;justify-content:center;padding:10px;border:1px solid var(--rule);border-radius:10px}
.book .spec-mermaid-svg svg{max-width:100%;height:auto}
.book .spec-drawio{margin:16px 0;text-align:center}
.book .spec-drawio img{border:1px solid var(--rule);border-radius:10px;padding:8px;background:#fff}
.book .spec-check{display:inline-block;width:13px;height:13px;border:1.5px solid var(--muted);border-radius:3px;margin-right:6px;vertical-align:-2px}
.book .spec-check.is-done{background:var(--accent);border-color:var(--accent)}
.book .spec-table{overflow-x:auto}
.book .spec-callout{border-left-color:#d97706}
@page{size:A4;margin:22mm 18mm 20mm 18mm;@bottom-center{content:counter(page);font:10pt Inter,Arial,sans-serif;color:#777}@top-right{content:string(booktitle);font:9pt Inter,Arial,sans-serif;color:#999}}
@page:first{@bottom-center{content:none}@top-right{content:none}}
@media print{
  html,body{background:#fff!important}
  .book{max-width:none;padding:0;font-size:11pt}
  .book-tools{display:none!important}
  .book-cover{min-height:250mm;padding-top:30mm;break-after:page}
  .book-cover .cover-band{left:0;right:0}
  .book-cover .cover-title{string-set:booktitle content()}
  .book-front,.book-chapter{break-before:page;padding-top:0}
  .book-doc{break-before:auto}
  .book h1,.book h2,.book h3{break-after:avoid}
  .book table,.book figure,.book pre,.book .spec-diagram,.book .spec-drawio{break-inside:avoid}
  .book a{color:inherit}
}
`;
