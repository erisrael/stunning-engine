"use client";

import * as React from "react";
import { toast } from "sonner";
import { FolderOpenIcon, DownloadIcon, FileDownIcon, FileUpIcon, Loader2Icon, PrinterIcon, ReplaceIcon, SaveIcon, Settings2Icon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { docxToBlocks } from "@/components/app/corr/docx-import";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getFileAction, saveFileAction } from "@/app/actions/tools";
import { RichDoc } from "@/components/app/tools/rich-doc";
import { bid, blocksDocx, blocksHtml, DEFAULT_PAGE, DOC_TEMPLATES, docxPageOf, logoBytes, pageChrome, pageCss, printHtml, esc, type Block, type DocData, type DocPage } from "@/components/app/tools/doc-model";
import { FileShelf, type SavedFile } from "@/components/app/tools/file-shelf";
import { downloadBlob, safeName } from "@/components/app/tools/shared";
import { NotionButton } from "@/components/app/tools/notion-button";
import type { Letterhead } from "@/lib/tools";
import { cn } from "@/lib/utils";

// Blocks back to Markdown, for Notion and for a .md download.
function toMarkdown(title: string, blocks: Block[]) {
  return [
    `# ${title}`,
    "",
    ...blocks.map((b) => {
      switch (b.type) {
        case "heading":
          return `${"#".repeat(b.level + (b.level < 3 ? 1 : 0))} ${b.text}`;
        case "paragraph":
          return b.text;
        case "list":
          return b.items.map((i, n) => (b.ordered ? `${n + 1}. ${i}` : `- ${i}`)).join("\n");
        case "table":
          return b.rows.map((r, i) => `| ${r.join(" | ")} |${i === 0 && b.header ? `\n|${r.map(() => "---").join("|")}|` : ""}`).join("\n");
        case "quote":
          return `> ${b.text}`;
        case "toc":
          return `**${b.title || "Contents"}**`;
        case "columns":
          return `${b.left}\n\n${b.right}`;
        case "image":
          return `![${b.caption ?? ""}](picture)`;
        case "textbox":
          return `> ${b.text}`;
        case "pagebreak":
        case "section":
          return "\n---\n";
        default:
          return "---";
      }
    }),
  ].join("\n\n");
}

// Markdown (or plain text) to blocks: headings, lists, tables, quotes, rules, paragraphs.
function markdownToBlocks(md: string): Block[] {
  const out: Block[] = [];
  const lines = md.replace(/\r/g, "").split("\n");
  let para: string[] = [];
  const flush = () => {
    if (para.join("").trim()) out.push({ id: bid(), type: "paragraph", text: para.join("\n").trim() });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]!;
    const h = /^(#{1,6})\s+(.*)$/.exec(l);
    if (h) {
      flush();
      out.push({ id: bid(), type: "heading", level: Math.min(3, h[1]!.length) as 1 | 2 | 3, text: h[2]! });
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s+/.test(l)) {
      flush();
      const ordered = /^\s*\d/.test(l);
      const items: string[] = [];
      const checked: boolean[] = [];
      let boxes = 0;
      while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i]!)) {
        const t = lines[i]!.replace(/^\s*([-*+]|\d+[.)])\s+/, "");
        const c = /^\[( |x|X)\]\s*/.exec(t);
        items.push(c ? t.slice(c[0].length) : t);
        checked.push(!!c && c[1] !== " ");
        if (c) boxes++;
        i++;
      }
      i--;
      const isCheck = boxes > 0 && boxes === items.length;
      out.push({ id: bid(), type: "list", ordered: ordered && !isCheck, items, ...(isCheck ? { style: "check" as const, checked } : {}) });
      continue;
    }
    if (/^\|.*\|\s*$/.test(l)) {
      flush();
      const rows: string[][] = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i]!)) {
        if (!/^\|[\s:|-]+\|\s*$/.test(lines[i]!)) rows.push(lines[i]!.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim()));
        i++;
      }
      i--;
      out.push({ id: bid(), type: "table", header: true, rows });
      continue;
    }
    if (/^>\s?/.test(l)) {
      flush();
      out.push({ id: bid(), type: "quote", text: l.replace(/^>\s?/, "") });
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) {
      flush();
      out.push({ id: bid(), type: "divider" });
      continue;
    }
    if (!l.trim()) flush();
    else para.push(l);
  }
  flush();
  return out.length ? out : [{ id: bid(), type: "paragraph", text: "" }];
}
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
  const [branded, setBranded] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [reading, setReading] = React.useState(false);
  const [find, setFind] = React.useState({ open: false, q: "", r: "", cs: false });
  const importRef = React.useRef<HTMLInputElement>(null);
  const page: DocPage = data?.page ?? DEFAULT_PAGE;
  const setPage = (p: Partial<DocPage>) => data && (setData({ ...data, page: { ...page, ...p } }), setDirty(true));
  const words = React.useMemo(() => (data ? plainText(data.blocks).split(/\s+/).filter(Boolean).length : 0), [data]);

  const openFile = async (f: File) => {
    if (dirty && !confirm("Leave this document without saving?")) return;
    try {
      let blocks: Block[];
      if (/\.docx$/i.test(f.name)) blocks = await docxToBlocks(f);
      else if (/\.html?$/i.test(f.name)) blocks = htmlToBlocks(await f.text());
      else if (/\.(md|markdown|txt)$/i.test(f.name)) blocks = markdownToBlocks(await f.text());
      else return toast.error("Open a .docx, .md, .html or .txt file.");
      setId(null);
      setTitle(f.name.replace(/\.[^.]+$/, ""));
      setData({ template: "blank", blocks, meta: { author, date: new Date().toISOString().slice(0, 10) } });
      setDirty(true);
      toast.success(`${blocks.length} parts opened`);
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

  const header = () =>
    branded
      ? `<div style="display:flex;align-items:center;gap:12pt;border-bottom:2.5pt solid ${esc(letterhead.primary)};padding-bottom:8pt;margin-bottom:14pt"><img src="${esc(letterhead.logo || "/api/branding/logo")}" style="height:40pt" alt=""><div><div style="font-size:15pt;font-weight:700;color:${esc(letterhead.accent)}">${esc(letterhead.company)}</div><div style="font-size:8.5pt;color:#64748b">${esc([letterhead.address, letterhead.phone, letterhead.email, letterhead.website].filter(Boolean).join(" · "))}</div></div></div>`
      : "";

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
        const r = await getFileAction("doc", fid);
        if (!r.ok) return toast.error(r.error);
        const f = r.data as { id: string; title: string; data: DocData };
        setId(f.id);
        setTitle(f.title);
        setData({ template: f.data.template ?? "blank", blocks: f.data.blocks ?? [], meta: f.data.meta, page: f.data.page });
        setDirty(false);
      }}
    />
  );
  return (
    <div className={cn("gap-4", data ? "space-y-3" : "grid lg:grid-cols-[15rem_minmax(0,1fr)]")}>
      <input ref={importRef} type="file" accept=".docx,.md,.markdown,.txt,.html,.htm" className="hidden" onChange={(e) => (e.target.files?.[0] && openFile(e.target.files[0]), (e.target.value = ""))} />
      {!data && shelf}
      {!data ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Start from a layout</p>
            <Button size="sm" variant="outline" className="ml-auto" onClick={() => importRef.current?.click()}>
              <FileUpIcon /> Open a file (.docx, .md, .html, .txt)
            </Button>
          </div>
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
                    <Input value={page.header} onChange={(e) => setPage({ header: e.target.value })} placeholder="Header text (every page)" />
                    <Input value={page.footer} onChange={(e) => setPage({ footer: e.target.value })} placeholder="Footer text (every page)" />
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
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={branded} onChange={(e) => setBranded(e.target.checked)} /> Company header and footer
              </label>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy === "docx"}
                  onClick={async () => {
                    setBusy("docx");
                    try {
                      const logo = branded ? await logoBytes(letterhead) : null;
                      const blob = await blocksDocx({ title, blocks: data.blocks, letterhead: branded ? { ...letterhead, logoData: logo?.data ?? null, logoType: logo?.type } : undefined, page: !branded && data.page ? docxPageOf(page) : undefined });
                      downloadBlob(blob, safeName(title, "docx"));
                    } catch {
                      toast.error("The Word file could not be made.");
                    }
                    setBusy(null);
                  }}
                >
                  {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word (.docx)
                </Button>
                <Button size="sm" variant="outline" onClick={() => printHtml(title, `${pageChrome(page)}${header()}${blocksHtml(data.blocks)}${branded && letterhead.footer ? `<div style="margin-top:24pt;border-top:1px solid ${esc(letterhead.primary)};padding-top:4pt;font-size:8pt;color:#64748b;text-align:center">${esc(letterhead.footer)}</div>` : ""}`, pageCss(page))}>
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
            <div className="overflow-x-auto rounded-xl border bg-[#e9ebee] px-4 py-6 pl-12 dark:bg-slate-900">
            <div style={{ width: page.orientation === "landscape" ? "297mm" : page.size === "A5" ? "148mm" : "210mm", maxWidth: "100%", paddingLeft: `${page.margins.left}mm`, paddingRight: `${page.margins.right}mm`, paddingTop: `${page.margins.top}mm`, paddingBottom: `${page.margins.bottom}mm` }} className={cn("mx-auto min-h-[200mm] bg-white text-[13px] shadow-[0_1px_3px_rgba(0,0,0,.12),0_8px_24px_rgba(0,0,0,.08)] leading-relaxed text-slate-900 shadow-sm", "[&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:ml-5 [&_ul]:list-disc")}>
              {/* Every piece of text is escaped in blocksHtml; only our own tags are added. */}
              {page.header && <p className="mb-2 text-center text-[10px] text-slate-500">{page.header}</p>}
              <div className="relative">
                {page.watermark && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/3 -rotate-[30deg] text-center text-6xl font-extrabold text-slate-400/15">{page.watermark}</span>}
                {reading ? (
                  <div dangerouslySetInnerHTML={{ __html: header() + blocksHtml(data.blocks) }} />
                ) : (
                  <>
                    <div dangerouslySetInnerHTML={{ __html: header() }} />
                    <RichDoc blocks={data.blocks} onChange={(blocks) => (setData({ ...data, blocks }), setDirty(true))} placeholder="Start typing your document…" minHeight="150mm" />
                  </>
                )}
              </div>
              {page.footer && <p className="mt-6 text-center text-[10px] text-slate-500">{page.footer}</p>}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
