"use client";

import * as React from "react";
import { toast } from "sonner";
import { DownloadIcon, FileDownIcon, Loader2Icon, PrinterIcon, SaveIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getFileAction, saveFileAction } from "@/app/actions/tools";
import { BlockEditor } from "@/components/app/tools/block-editor";
import { blocksDocx, blocksHtml, DOC_TEMPLATES, logoBytes, printHtml, esc, type Block, type DocData } from "@/components/app/tools/doc-model";
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
        default:
          return "---";
      }
    }),
  ].join("\n\n");
}

export function DocsClient({ files: initialFiles, author, letterhead, notion }: { files: SavedFile[]; author: string; letterhead: Letterhead; notion: boolean }) {
  const [files, setFiles] = React.useState(initialFiles);
  const [id, setId] = React.useState<string | null>(null);
  const [title, setTitle] = React.useState("");
  const [data, setData] = React.useState<DocData | null>(null);
  const [branded, setBranded] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

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

  return (
    <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)]">
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
          setData({ template: f.data.template ?? "blank", blocks: f.data.blocks ?? [], meta: f.data.meta });
          setDirty(false);
        }}
      />
      {!data ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Start from a layout</p>
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
        <div className="grid gap-4 2xl:grid-cols-2">
          <Card>
            <CardContent className="space-y-3 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input value={title} onChange={(e) => (setTitle(e.target.value), setDirty(true))} className="min-w-48 flex-1 font-medium" aria-label="Document title" />
                <Button size="sm" onClick={save} disabled={busy === "save"}>
                  {busy === "save" ? <Loader2Icon className="animate-spin" /> : <SaveIcon />} Save
                </Button>
              </div>
              <BlockEditor blocks={data.blocks} onChange={(blocks) => (setData({ ...data, blocks }), setDirty(true))} />
            </CardContent>
          </Card>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
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
                      const blob = await blocksDocx({ title, blocks: data.blocks, letterhead: branded ? { ...letterhead, logoData: logo?.data ?? null, logoType: logo?.type } : undefined });
                      downloadBlob(blob, safeName(title, "docx"));
                    } catch {
                      toast.error("The Word file could not be made.");
                    }
                    setBusy(null);
                  }}
                >
                  {busy === "docx" ? <Loader2Icon className="animate-spin" /> : <FileDownIcon />} Word (.docx)
                </Button>
                <Button size="sm" variant="outline" onClick={() => printHtml(title, `${header()}${blocksHtml(data.blocks)}${branded && letterhead.footer ? `<div style="margin-top:24pt;border-top:1px solid ${esc(letterhead.primary)};padding-top:4pt;font-size:8pt;color:#64748b;text-align:center">${esc(letterhead.footer)}</div>` : ""}`)}>
                  <PrinterIcon /> PDF
                </Button>
                <Button size="sm" variant="outline" onClick={() => downloadBlob(new Blob([toMarkdown(title, data.blocks)], { type: "text/markdown" }), safeName(title, "md"))}>
                  <DownloadIcon /> .md
                </Button>
                {notion && <NotionButton title={title} markdown={toMarkdown(title, data.blocks)} />}
              </div>
            </div>
            <div className={cn("mx-auto max-w-[210mm] rounded-md border bg-white p-8 text-[13px] leading-relaxed text-slate-900 shadow-sm", "[&_blockquote]:border-l-4 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600 [&_h1]:mb-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-3 [&_h3]:font-semibold [&_hr]:my-3 [&_ol]:ml-5 [&_ol]:list-decimal [&_p]:mb-2 [&_table]:my-2 [&_table]:w-full [&_td]:border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:bg-slate-100 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_ul]:ml-5 [&_ul]:list-disc")}>
              {/* Every piece of text is escaped in blocksHtml; only our own tags are added. */}
              <div dangerouslySetInnerHTML={{ __html: header() + blocksHtml(data.blocks) }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
