"use client";

import * as React from "react";
import { toast } from "sonner";
import { BookOpenIcon, PencilRulerIcon, FolderOpenIcon, DownloadIcon, FileDownIcon, FileUpIcon, ListOrderedIcon, Loader2Icon, PanelTopIcon, PrinterIcon, ReplaceIcon, SaveIcon, Settings2Icon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { docxToBlocks } from "@/components/app/corr/docx-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getFileAction, saveFileAction } from "@/app/actions/tools";
import { RichDoc } from "@/components/app/tools/rich-doc";
import { bid, blocksDocx, blocksHtml, DEFAULT_PAGE, DOC_PAPER, DOC_TEMPLATES, logoBytes, printHtml, esc, type Block, type DocData, type DocPage } from "@/components/app/tools/doc-model";
import { bandHtml, bandPng, coverHtml, DEFAULT_HF, effectiveHF, fillText, hfValues, headerFooterOfDocx, layoutCss, layoutOf, splitParts, withNumber, type DocLayout, type HeaderFooter, type HFSource } from "@/components/app/tools/page-layout";
import { CoverDialog, FileHFPrompt, HeaderFooterDialog, HFDesignerDialog, NumberingDialog, ZonesPreview } from "@/components/app/tools/doc-layout-panel";
import { pageHtml, webFontsCss } from "@/lib/design";
import { TemplateShelf } from "@/components/app/tools/template-shelf";
import { markdownToBlocks, toMarkdown } from "@/components/app/tools/doc-markdown";
import { FileShelf, type SavedFile } from "@/components/app/tools/file-shelf";
import { downloadBlob, safeName, useOpenFromLink } from "@/components/app/tools/shared";
import { NotionButton } from "@/components/app/tools/notion-button";
import type { Letterhead } from "@/lib/tools";
import { cn } from "@/lib/utils";

// HTML (a saved web page, or from Google Docs) to Markdown first, then blocks.
function htmlToBlocks(html: string): Block[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const md: string[] = [];
  const inline = (n: Node): string => {
    if (n.nodeType === 3) return (n.textContent ?? "").replace(/\s+/g, " ");
    const el = n as HTMLElement;
    const inner = [...el.childNodes].map(inline).join("");
    const tag = el.tagName?.toLowerCase();
    if (tag === "b" || tag === "strong") return inner.trim() ? `**${inner}**` : inner;
    if (tag === "i" || tag === "em") return inner.trim() ? `*${inner}*` : inner;
    if (tag === "u") return `__${inner}__`;
    if (tag === "br") return "\n";
    if (tag === "a" && /^https?:/.test(el.getAttribute("href") ?? "")) return `[${inner}](${el.getAttribute("href")})`;
    return inner;
  };
  const walk = (el: Element) => {
    for (const c of [...el.children]) {
      const tag = c.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) md.push(`${"#".repeat(Number(tag[1]))} ${inline(c).trim()}`, "");
      else if (tag === "p" || tag === "div" && !c.querySelector("p,h1,h2,h3,ul,ol,table")) md.push(inline(c).trim(), "");
      else if (tag === "ul" || tag === "ol") (md.push(...[...c.children].map((li, i) => `${tag === "ol" ? `${i + 1}.` : "-"} ${inline(li).trim()}`)), md.push(""));
      else if (tag === "table") {
        const rows = [...c.querySelectorAll("tr")].map((tr) => `| ${[...tr.children].map((td) => inline(td).trim().replace(/\|/g, "/")).join(" | ")} |`);
        if (rows.length) md.push(rows[0]!, `|${rows[0]!.split("|").slice(2).map(() => "---|").join("")}`, ...rows.slice(1), "");
      } else if (tag === "blockquote") md.push(`> ${inline(c).trim()}`, "");
      else if (tag === "hr") md.push("---", "");
      else if (tag === "img" && /^data:image\//.test(c.getAttribute("src") ?? "")) md.push("");
      else walk(c);
    }
  };
  walk(doc.body);
  return markdownToBlocks(md.join("\n"));
}

function plainText(blocks: Block[]) {
  return toMarkdown("", blocks).replace(/^# \n\n/, "").replace(/\*\*|__|~~|==/g, "").replace(/\{[^|{}]{1,80}\|(.+?)\}/g, "$1");
}

export function DocsClient({ files: initialFiles, author, letterhead, notion }: { files: SavedFile[]; author: string; letterhead: Letterhead; notion: boolean }) {
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [data, setData] = React.useState<DocData | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [find, setFind] = React.useState({ open: false, q: "", r: "", cs: false });
  const importRef = React.useRef<HTMLInputElement>(null);
  const page: DocPage = data?.page ?? DEFAULT_PAGE;
  const setPage = (p: Partial<DocPage>) => data && (setData({ ...data, page: { ...page, ...p } }), setDirty(true));
  // Cover, header and footer, numbering. A document from before them keeps its old header and footer text.
  const layout: DocLayout = React.useMemo(() => {
    if (data?.layout) return layoutOf(data.layout);
    const l = layoutOf(null);
    if (data?.page && (data.page.header || data.page.footer)) return { ...l, source: "custom" as const, hf: { ...DEFAULT_HF, header: { left: "", center: data.page.header, right: "" }, footer: { left: "", center: data.page.footer, right: "" }, logo: "none" as const } };
    return l;
  }, [data?.layout, data?.page]);
  const setLayout = (l: DocLayout) => data && (setData({ ...data, layout: l }), setDirty(true));
  const [panel, setPanel] = React.useState<null | "hf" | "cover" | "numbers" | "design">(null);
  // The ribbon sits in the window above the page (as in Word), not on the page.
  const [barHost, setBarHost] = React.useState<HTMLDivElement | null>(null);
  const [filePrompt, setFilePrompt] = React.useState<HeaderFooter | null>(null);
  const fields = { title, author: data?.meta?.author ?? author, date: data?.meta?.date ?? new Date().toISOString().slice(0, 10), company: letterhead.company, address: letterhead.address, phone: letterhead.phone, email: letterhead.email, website: letterhead.website };
  const hf = effectiveHF(layout, letterhead);
  const branded = layout.source === "company";
  const logoUrl = letterhead.logo || "/api/branding/logo";
  // The margins in effect: the opened Word file's own with its header and footer, and always enough to clear a banner.
  const fileM = layout.source === "document" ? hf?.margins : undefined;
  const headArt = hf?.art?.header;
  const footArt = hf?.art?.footer;
  // A header or footer made in the designer wins over the banner and the Word file's own.
  const headD = hf?.design?.header;
  const footD = hf?.design?.footer;
  const headH = headD?.h ?? headArt?.heightMm ?? 0;
  const footH = footD?.h ?? footArt?.heightMm ?? 0;
  const mg = {
    top: Math.max(fileM?.top ?? page.margins.top, headH ? headH + 8 : 0),
    bottom: Math.max(fileM?.bottom ?? page.margins.bottom, footH ? footH + 6 : 0),
    left: fileM?.left ?? page.margins.left,
    right: fileM?.right ?? page.margins.right,
  };
  const words = React.useMemo(() => (data ? plainText(data.blocks).split(/\s+/).filter(Boolean).length : 0), [data]);

  const openFile = async (f: File) => {
    if (dirty && !confirm("Leave this document without saving?")) return;
    try {
      let blocks: Block[];
      let fromFile: HeaderFooter | null = null;
      if (/\.(docx|dotx)$/i.test(f.name)) ((blocks = await docxToBlocks(f)), (fromFile = await headerFooterOfDocx(f).catch(() => null)));
      else if (/\.html?$/i.test(f.name)) blocks = htmlToBlocks(await f.text());
      else if (/\.(md|markdown|txt)$/i.test(f.name)) blocks = markdownToBlocks(await f.text());
      else return toast.error("Open a .docx, .dotx, .md, .html or .txt file.");
      setId(null);
      setTitle(f.name.replace(/\.[^.]+$/, ""));
      setData({ template: "blank", blocks, meta: { author, date: new Date().toISOString().slice(0, 10) }, layout: { ...layoutOf(null), fromFile } });
      setDirty(true);
      toast.success(`${blocks.length} parts opened`);
      // Ask which header and footer to use: the file's own or the company's.
      if (fromFile) setFilePrompt(fromFile);
    } catch {
      toast.error("The file could not be read.");
    }
  };
  const replaceAll = () => {
    if (!data || !find.q) return;
    const re = new RegExp(find.q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), find.cs ? "g" : "gi");
    let n = 0;
    const fix = (t: string) => t.replace(re, () => (n++, find.r));
    const blocks = data.blocks.map((b): Block => {
      switch (b.type) {
        case "heading":
        case "paragraph":
        case "quote":
        case "textbox":
          return { ...b, text: fix(b.text) };
        case "list":
          return { ...b, items: b.items.map(fix) };
        case "table":
          return { ...b, rows: b.rows.map((r) => r.map(fix)) };
        case "columns":
          return { ...b, left: fix(b.left), right: fix(b.right) };
        default:
          return b;
      }
    });
    setData({ ...data, blocks });
    setDirty(true);
    toast.success(`${n} replaced`);
  };
  const count = React.useMemo(() => {
    if (!data || !find.q) return 0;
    const hay = plainText(data.blocks);
    return (find.cs ? hay : hay.toLowerCase()).split(find.cs ? find.q : find.q.toLowerCase()).length - 1;
  }, [data, find.q, find.cs]);

  const insertToc = () => {
    if (!data) return;
    const toc: Block = { id: bid(), type: "toc", title: "Contents" };
    const brk: Block = { id: bid(), type: "pagebreak" };
    const firstHead = data.blocks.find((b) => b.type === "heading");
    // The contents goes first, on its own page; the main pages start after it (unless set otherwise).
    setData({ ...data, blocks: [toc, brk, ...data.blocks], layout: { ...layout, numbering: { ...layout.numbering, mainStartsAt: layout.numbering.mainStartsAt ?? firstHead?.id ?? brk.id } } });
    setDirty(true);
    toast.success("Contents page added; the main pages start after it");
  };
  const paper = DOC_PAPER[page.size] ?? DOC_PAPER.A4;
  const [pw, ph] = page.orientation === "landscape" ? [paper.h, paper.w] : [paper.w, paper.h];
  const pdf = () => {
    if (!data) return;
    const parts = splitParts(data.blocks, layout);
    const body = `${layout.cover ? coverHtml(layout.cover, logoUrl) : ""}${parts.front.length ? `<div class="doc-front">${header()}${blocksHtml(parts.front, data.blocks)}</div>` : ""}<div class="doc-main">${parts.front.length ? "" : header()}${blocksHtml(parts.main, data.blocks)}</div>${page.watermark ? `<div style="position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72pt;font-weight:800;color:rgba(100,116,139,.12);transform:rotate(-30deg)">${esc(page.watermark)}</div>` : ""}`;
    if (hf && (headH || footH)) {
      // A banner repeats on every printed page: fixed bands, with the page's text kept clear of them by a table
      // whose head and foot repeat on each page.
      const plain = (z: { left: string; center: string; right: string }) => `<div style="display:flex;gap:4mm;padding:0 ${mg.right}mm 0 ${mg.left}mm;font-size:${hf.size}pt;color:${hf.color}"><div style="flex:1">${esc(fillText(z.left, fields))}</div><div style="flex:1;text-align:center">${esc(fillText(z.center, fields))}</div><div style="flex:1;text-align:right">${esc(fillText(z.right, fields))}</div></div>`;
      const designed = (d: NonNullable<typeof headD>) => `<style>${webFontsCss(d)}</style>${pageHtml(d, d.pages[0]!, hfValues(fields), { logo: logoUrl })}`;
      const top = headD ? designed(headD) : headArt ? bandHtml(headArt, hf.header, fields, logoUrl, "header") : plain(hf.header);
      const bottom = footD ? designed(footD) : footArt ? bandHtml(footArt, hf.footer, fields, logoUrl, "footer") : plain(hf.footer);
      const framed = `<div class="hf-top">${top}</div><div class="hf-bottom">${bottom}</div><table class="hf-page"><thead><tr><td><div style="height:${mg.top}mm"></div></td></tr></thead><tfoot><tr><td><div style="height:${mg.bottom}mm"></div></td></tr></tfoot><tbody><tr><td style="padding:0 ${mg.right}mm 0 ${mg.left}mm">${body}</td></tr></tbody></table>`;
      return printHtml(title, framed, `@page{size:${pw}mm ${ph}mm;margin:0}.hf-top{position:fixed;top:0;left:0;right:0}.hf-bottom{position:fixed;bottom:0;left:0;right:0}table.hf-page{width:100%;margin:0;border-collapse:collapse}table.hf-page>thead>tr>td,table.hf-page>tfoot>tr>td,table.hf-page>tbody>tr>td{border:0;padding:0}.doc-cover,.doc-front{break-after:page}sup.fn{font-size:7pt}`);
    }
    printHtml(title, body, layoutCss(layout, branded ? { ...hf!, header: { left: "", center: "", right: "" } } : hf, fields, { w: pw, h: ph }, mg, page.pageNumbers));
  };
  const word = async () => {
    if (!data) return;
    setBusy("docx");
    try {
      const needsLogo = (hf && hf.logo !== "none") || !!layout.cover?.logo;
      const logo = needsLogo ? await logoBytes(letterhead) : null;
      // Banners: a Word file's own header and footer go back in unchanged; a designed banner goes in as a picture.
      // A designed header or footer goes in as a picture of the design (drawn at 300 dpi).
      const { pageImage } = await import("@/components/app/design/design-export");
      const designPng = async (d: NonNullable<typeof headD>) => {
        const url = await pageImage(d, 0, "png", hfValues(fields), { logo: logoUrl }, 300);
        const bin = atob(url.split(",")[1]!);
        return Uint8Array.from(bin, (c) => c.charCodeAt(0));
      };
      const bands = {
        header: headD ? await designPng(headD) : headArt && !hf?.raw?.header ? await bandPng(headArt, hf!.header, fields, logoUrl, "header", pw) : null,
        footer: footD ? await designPng(footD) : footArt && !hf?.raw?.footer ? await bandPng(footArt, hf!.footer, fields, logoUrl, "footer", pw) : null,
        headerMm: headH,
        footerMm: footH,
      };
      // The Word file's own part is used only where no design replaced it.
      const hfOut = hf ? { ...hf, raw: hf.raw ? { header: headD ? undefined : hf.raw.header, footer: footD ? undefined : hf.raw.footer } : undefined } : hf;
      const blob = await blocksDocx({ title, blocks: data.blocks, letterhead: { ...letterhead, logoData: logo?.data ?? null, logoType: logo?.type }, layout: { layout, hf: hfOut, fields, page: { w: pw, h: ph, margins: { ...mg, header: fileM?.header, footer: fileM?.footer } }, pageNumbers: page.pageNumbers, bands } });
      downloadBlob(blob, safeName(title, "docx"));
    } catch {
      toast.error("The Word file could not be made.");
    }
    setBusy(null);
  };

  const start = (key: string) => {
    const t = DOC_TEMPLATES.find((x) => x.key === key)!;
    setId(null);
    setTitle(t.key === "blank" ? "Untitled document" : t.label);
    setData({ template: key, blocks: t.blocks(), meta: { author, date: new Date().toISOString().slice(0, 10) } });
    setDirty(true);
  };

  const save = async () => {
    if (!data) return;
    setBusy("save");
    const r = await saveFileAction("doc", { id: id ?? undefined, title, data });
    setBusy(null);
    if (!r.ok) return toast.error(r.error);
    const nid = r.data as string;
    setId(nid);
    setFiles([{ id: nid, title: title || "Untitled", updated_at: new Date().toISOString() }, ...files.filter((f) => f.id !== nid)]);
    setDirty(false);
    toast.success("Document saved");
  };

  function header() {
    return branded
      ? `<div style="display:flex;align-items:center;gap:12pt;border-bottom:2.5pt solid ${esc(letterhead.primary)};padding-bottom:8pt;margin-bottom:14pt"><img src="${esc(letterhead.logo || "/api/branding/logo")}" style="height:40pt" alt=""><div><div style="font-size:15pt;font-weight:700;color:${esc(letterhead.accent)}">${esc(letterhead.company)}</div><div style="font-size:8.5pt;color:#64748b">${esc([letterhead.address, letterhead.phone, letterhead.email, letterhead.website].filter(Boolean).join(" · "))}</div></div></div>`
      : "";
  }

  const openSaved = async (fid: string) => {
    const r = await getFileAction("doc", fid);
    if (!r.ok) return toast.error(r.error);
    const f = r.data as { id: string; title: string; data: DocData };
    setId(f.id);
    setTitle(f.title);
    setData({ template: f.data.template ?? "blank", blocks: f.data.blocks ?? [], meta: f.data.meta, page: f.data.page, layout: f.data.layout });
    setDirty(false);
  };
  useOpenFromLink(openSaved);
  const shelf = (
      <FileShelf
      kind="doc"
      files={files}
      setFiles={setFiles}
      current={id}
      newLabel="New document"
      onNew={() => {
        if (dirty && !confirm("Leave this document without saving?")) return;
        setData(null);
        setId(null);
      }}
      onOpen={async (fid) => {
        if (dirty && !confirm("Leave this document without saving?")) return;
        await openSaved(fid);
      }}
    />
  );
  return (
    <div className={cn("gap-4", data ? "space-y-3" : "grid lg:grid-cols-[15rem_minmax(0,1fr)]")}>
      <input ref={importRef} type="file" accept=".docx,.dotx,.md,.markdown,.txt,.html,.htm" className="hidden" onChange={(e) => (e.target.files?.[0] && openFile(e.target.files[0]), (e.target.value = ""))} />
      {!data && shelf}
      {!data ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Start from a layout</p>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => importRef.current?.click()}>
              <FileUpIcon /> Open a file (.docx, .dotx, .md, .html, .txt)
            </Button>
          </div>
          <TemplateShelf<DocData>
            kind="tpl_doc"
            accept=".docx,.dotx,.md,.markdown,.html,.htm,.txt"
            label="Import a template (.docx, .dotx)"
            onImport={async (f) => {
              const word = /\.(docx|dotx)$/i.test(f.name);
              const blocks = word ? await docxToBlocks(f) : /\.html?$/i.test(f.name) ? htmlToBlocks(await f.text()) : markdownToBlocks(await f.text());
              const fromFile = word ? await headerFooterOfDocx(f).catch(() => null) : null;
              return { title: f.name.replace(/\.[^.]+$/, ""), data: { template: "imported", blocks, layout: { ...layoutOf(null), fromFile, source: fromFile ? "document" : "company" } } };
            }}
            onUse={(d, t) => {
              setId(null);
              setTitle(t);
              setData({ ...d, blocks: (d.blocks ?? []).map((b) => ({ ...b, id: bid() })), meta: { author, date: new Date().toISOString().slice(0, 10) }, layout: d.layout ? { ...d.layout, numbering: { ...layoutOf(d.layout).numbering, mainStartsAt: null } } : undefined });
              setDirty(true);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DOC_TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => start(t.key)} className="rounded-lg border p-4 text-left hover:border-primary hover:bg-primary/5">
                <span className="block font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">{t.hint}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline">
                      <FolderOpenIcon /> My documents ({files.length})
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-2" align="start">
                    {shelf}
                  </PopoverContent>
                </Popover>
                <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="min-w-48 flex-1 font-medium" aria-label="Document title" />
                <Button size="sm" onClick={save} disabled={busy === "save"}>
                  {busy === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-1.5 py-1 text-xs">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => importRef.current?.click()}>
                  <FileUpIcon /> Open
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="ghost" className="h-7 text-xs">
                      <Settings2Icon /> Page setup
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 space-y-2 text-xs" align="start">
                    <div className="grid grid-cols-2 gap-2">
                      <label className="space-y-1">
                        <span className="font-medium">Paper</span>
                        <select className="h-8 w-full rounded-md border bg-background px-1" value={page.size} onChange={(e) => setPage({ size: e.target.value as DocPage["size"] })}>
                          {["A4", "A5", "Letter", "Legal"].map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </label>
                      <label className="space-y-1">
                        <span className="font-medium">Orientation</span>
                        <select className="h-8 w-full rounded-md border bg-background px-1" value={page.orientation} onChange={(e) => setPage({ orientation: e.target.value as "portrait" })}>
                          <option value="portrait">Portrait</option>
                          <option value="landscape">Landscape</option>
                        </select>
                      </label>
                      {(["top", "bottom", "left", "right"] as const).map((k) => (
                        <label key={k} className="space-y-1">
                          <span className="font-medium capitalize">{k} margin (mm)</span>
                          <Input className="h-8" type="number" min={0} max={80} value={page.margins[k]} onChange={(e) => setPage({ margins: { ...page.margins, [k]: Number(e.target.value) } })} />
                        </label>
                      ))}
                    </div>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setPanel("hf")}>Header and footer…</Button>
                    <Input value={page.watermark} onChange={(e) => setPage({ watermark: e.target.value })} placeholder="Watermark, e.g. DRAFT or CONFIDENTIAL" />
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={page.pageNumbers} onChange={(e) => setPage({ pageNumbers: e.target.checked })} /> Page numbers
                    </label>
                  </PopoverContent>
                </Popover>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFind({ ...find, open: !find.open })}>
                  <ReplaceIcon /> Find and replace
                </Button>
                <span className="ml-auto pr-1 text-muted-foreground tabular-nums">
                  {words.toLocaleString()} words · about {Math.max(1, Math.round(words / 230))} min to read
                </span>
              </div>
              {find.open && (
                <div className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-xs">
                  <Input className="h-8 w-48" value={find.q} onChange={(e) => setFind({ ...find, q: e.target.value })} placeholder="Find" autoFocus />
                  <Input className="h-8 w-48" value={find.r} onChange={(e) => setFind({ ...find, r: e.target.value })} placeholder="Replace with" />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={find.cs} onChange={(e) => setFind({ ...find, cs: e.target.checked })} /> Match case
                  </label>
                  <span className="text-muted-foreground">{find.q ? `${count} found` : ""}</span>
                  <Button size="sm" className="h-8" disabled={!count} onClick={replaceAll}>
                    Replace all
                  </Button>
                </div>
              )}
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-md border p-0.5 text-xs" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={!reading} onClick={() => setReading(false)} className={cn("rounded px-2.5 py-1", !reading && "bg-primary text-primary-foreground")}>
                  Edit
                </button>
                <button type="button" role="tab" aria-selected={reading} onClick={() => setReading(true)} className={cn("rounded px-2.5 py-1", reading && "bg-primary text-primary-foreground")}>
                  Read (as printed)
                </button>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel("hf")} data-open-hf>
                  <PanelTopIcon /> Header and footer: {layout.source === "company" ? "company" : layout.source === "document" ? "the file's" : layout.source === "custom" ? "my own" : "none"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel("design")} data-open-designer>
                  <PencilRulerIcon /> Design header and footer
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel("cover")} data-open-cover>
                  <BookOpenIcon /> {layout.cover ? "Cover page" : "Add a cover page"}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPanel("numbers")} data-open-numbering>
                  <ListOrderedIcon /> Page numbering
                </Button>
              </div>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === "docx"}
                  onClick={word}
                >
                  {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word (.docx)
                </Button>
                <Button size="sm" variant="outline" onClick={pdf}>
                  <PrinterIcon /> PDF
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline">
                      <DownloadIcon /> More
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-56 p-1">
                    {[
                      { label: "Markdown (.md)", run: () => downloadBlob(new Blob([toMarkdown(title, data.blocks)], { type: "text/markdown" }), safeName(title, "md")) },
                      { label: "Web page (.html)", run: () => downloadBlob(new Blob([`<!doctype html><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:800px;margin:30px auto;line-height:1.5}table{border-collapse:collapse}th,td{border:1px solid #cbd5e1;padding:4px 8px}</style>${header()}${blocksHtml(data.blocks)}`], { type: "text/html" }), safeName(title, "html")) },
                      { label: "Plain text (.txt)", run: () => downloadBlob(new Blob([`${title}\n\n${plainText(data.blocks)}`], { type: "text/plain" }), safeName(title, "txt")) },
                      {
                        label: "Save as a template",
                        run: async () => {
                          const r = await saveFileAction("tpl_doc", { title: title || "Template", data: { ...data, layout } });
                          if (r.ok) toast.success("Kept as a template: start new documents from it under Your templates");
                          else toast.error(r.error);
                        },
                      },
                    ].map((x) => (
                      <button key={x.label} type="button" onClick={x.run} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-muted">
                        {x.label}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
                {notion && <NotionButton title={title} markdown={toMarkdown(title, data.blocks)} />}
              </div>
            </div>
            <div ref={setBarHost} className="sticky top-14 z-30 overflow-x-auto rounded-lg border bg-background shadow-sm empty:hidden" data-doc-ribbon />
            <div className="space-y-6 overflow-x-auto rounded-xl border bg-[#e9ebee] px-4 py-6 dark:bg-slate-900">
            {layout.cover && (
              <button type="button" onClick={() => setPanel("cover")} title="Edit the cover page" className="mx-auto block bg-white text-left text-slate-900 shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)]" style={{ width: `${pw}mm`, maxWidth: "100%", padding: `${mg.top}mm ${mg.right}mm ${mg.bottom}mm ${mg.left}mm` }} data-cover-preview>
                <div dangerouslySetInnerHTML={{ __html: coverHtml(layout.cover, logoUrl) }} />
              </button>
            )}
            <div style={{ width: page.orientation === "landscape" ? "297mm" : page.size === "A5" ? "148mm" : "210mm", maxWidth: "100%", paddingLeft: `${mg.left}mm`, paddingRight: `${mg.right}mm`, paddingTop: `${mg.top}mm`, paddingBottom: `${mg.bottom}mm`, minHeight: `${ph}mm` }} className={cn("mx-auto flex flex-col bg-white text-[13px] shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)] leading-relaxed text-slate-900 shadow-sm", "[&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:ml-5 [&_ul]:list-disc")}>
              {/* Every piece of text is escaped in blocksHtml; only our own tags are added. */}
              {hf && !branded && (headH ? (
                <div style={{ margin: `-${mg.top}mm -${mg.right}mm ${mg.top - headH}mm -${mg.left}mm` }}><ZonesPreview z={hf.header} hf={hf} f={fields} where="header" logo={logoUrl} onClick={() => setPanel("design")} /></div>
              ) : (
                <div className="-mt-[8mm] mb-4"><ZonesPreview z={hf.header} hf={hf} f={fields} where="header" logo={logoUrl} onClick={() => setPanel("design")} /></div>
              ))}
              <div className="relative">
                {page.watermark && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 -rotate-[30deg] text-center text-6xl font-extrabold text-slate-400/15">{page.watermark}</span>}
                {reading ? (
                  <div dangerouslySetInnerHTML={{ __html: header() + blocksHtml(data.blocks) }} />
                ) : (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: header() }} />
                    <RichDoc blocks={data.blocks} onChange={(blocks) => (setData({ ...data, blocks }), setDirty(true))} placeholder="Start typing your document…" minHeight="150mm" toolbarHost={barHost} />
                  </>
                )}
              </div>
              {(() => {
                const f = withNumber(hf, layout.numbering, page.pageNumbers);
                if (!f) return null;
                if (footH) return <div className="mt-auto" style={{ margin: `8mm -${mg.right}mm -${mg.bottom}mm -${mg.left}mm`, paddingTop: 0 }}><ZonesPreview z={f.footer} hf={f} f={fields} where="footer" logo={logoUrl} onClick={() => setPanel("design")} /></div>;
                return <div className="mt-auto pt-8"><ZonesPreview z={f.footer} hf={f} f={fields} where="footer" onClick={() => setPanel("design")} /></div>;
              })()}
            </div>
            </div>
          </div>
          {hf !== undefined && (
            <HFDesignerDialog
              open={panel === "design"}
              onOpenChange={(v) => setPanel(v ? "design" : null)}
              hf={hf ?? { ...DEFAULT_HF, header: { left: "", center: "", right: "" }, footer: { left: "", center: "", right: "" }, logo: "none" }}
              pageW={pw}
              fields={fields}
              logo={logoUrl}
              onSave={(next) => setLayout({ ...layout, source: "custom", hf: next })}
            />
          )}
          <HeaderFooterDialog open={panel === "hf"} onOpenChange={(v) => setPanel(v ? "hf" : null)} layout={layout} setLayout={setLayout} letterhead={letterhead} fields={fields} />
          <CoverDialog open={panel === "cover"} onOpenChange={(v) => setPanel(v ? "cover" : null)} layout={layout} setLayout={setLayout} fields={fields} color={letterhead.primary} logo={logoUrl} />
          <NumberingDialog open={panel === "numbers"} onOpenChange={(v) => setPanel(v ? "numbers" : null)} layout={layout} setLayout={setLayout} blocks={data.blocks} pageNumbers={page.pageNumbers} setPageNumbers={(v) => setPage({ pageNumbers: v })} onAddCover={() => setPanel("cover")} onInsertToc={insertToc} />
        </div>
      )}
      <FileHFPrompt
        hf={filePrompt}
        fields={fields}
        onChoose={async (src: HFSource, keep) => {
          const got = filePrompt;
          setFilePrompt(null);
          if (data) setLayout({ ...layout, fromFile: got, source: src });
          if (keep && got) {
            const r = await saveFileAction("hf", { title: `${title || "Document"}: header and footer`, data: got });
            if (r.ok) toast.success("The file's header and footer were saved as a template");
          }
        }}
      />
    </div>
  );
}
