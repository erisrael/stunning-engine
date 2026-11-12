"use client";

// Files to send with a form: chosen, dropped or pasted (screenshots from the clipboard). Images show a small preview;
// each can be taken off again before sending. The files are read as base64 for a server action.

import * as React from "react";
import { FileIcon, FileTextIcon, ImageIcon, PaperclipIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "cn";

export type PickedFile = { key: string; name: string; mime: string; size: number; base64: string; preview: string | null };

export const DOC_ACCEPT = "image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip";

export const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function read(f: File): Promise<PickedFile> {
  return new Promise((ok, bad) => {
    const r = new FileReader();
    r.onload = () => {
      const url = String(r.result);
      const base64 = url.slice(url.indexOf(",") + 1);
      const name = f.name && f.name !== "image.png" ? f.name : `screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.${(f.type.split("/")[1] ?? "png").replace("jpeg", "jpg")}`;
      ok({ key: `${name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, name, mime: f.type || "application/octet-stream", size: f.size, base64, preview: f.type.startsWith("image/") ? url : null });
    };
    r.onerror = () => bad(r.error);
    r.readAsDataURL(f);
  });
}

// Files from a paste event (screenshots); used by text boxes that take a pasted picture.
export function pastedFiles(e: React.ClipboardEvent): File[] {
  return [...(e.clipboardData?.files ?? [])];
}

export function useAttachments({ max = 6, maxBytes = 8 * 1024 * 1024 }: { max?: number; maxBytes?: number } = {}) {
  const [files, setFiles] = React.useState<PickedFile[]>([]);
  const add = React.useCallback(
    async (list: File[]) => {
      if (!list.length) return;
      const read_ = await Promise.all(list.map(read));
      setFiles((cur) => {
        const next = [...cur];
        for (const f of read_) {
          if (next.length >= max) {
            toast.error(`At most ${max} files.`);
            break;
          }
          if (next.reduce((n, x) => n + x.size, 0) + f.size > maxBytes) {
            toast.error(`"${f.name}" is too big: ${fileSize(maxBytes)} in total.`);
            continue;
          }
          next.push(f);
        }
        return next;
      });
    },
    [max, maxBytes],
  );
  return { files, add, remove: (key: string) => setFiles((c) => c.filter((f) => f.key !== key)), clear: () => setFiles([]), payload: () => files.map(({ name, mime, base64 }) => ({ name, mime, base64 })) };
}

export function AttachPicker({ files, add, remove, label = "Attach screenshots or documents", hint = "Images, PDF, Word, Excel, PowerPoint. You can also paste a screenshot.", accept = DOC_ACCEPT, disabled }: { files: PickedFile[]; add: (f: File[]) => void; remove: (key: string) => void; label?: string; hint?: string; accept?: string; disabled?: boolean }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);
  return (
    <div className="space-y-2" data-attach>
      <div
        className={cn("flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground transition", over && "border-primary bg-primary/5")}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!disabled) add([...e.dataTransfer.files]);
        }}
      >
        <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
          <PaperclipIcon /> {label}
        </Button>
        <span>{hint} Or drop files here.</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          aria-label={label}
          onChange={(e) => {
            add([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>
      {files.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2" data-attach-list>
          {files.map((f) => (
            <li key={f.key} className="flex items-center gap-2 rounded-lg border bg-background p-1.5 text-xs">
              {f.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.preview} alt="" className="size-10 shrink-0 rounded object-cover" />
              ) : (
                <span className="flex size-10 shrink-0 items-center justify-center rounded bg-muted">{f.mime === "application/pdf" ? <FileTextIcon className="size-4" /> : <FileIcon className="size-4" />}</span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="text-muted-foreground">{fileSize(f.size)}</span>
              </span>
              <Button type="button" size="icon-xs" variant="ghost" aria-label={`Remove ${f.name}`} onClick={() => remove(f.key)}>
                <XIcon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Files already saved, as links (images open in a new tab).
export function FileLinks({ files, base }: { files: { id: string; name: string; mime: string; size: number }[]; base: string }) {
  if (!files.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" data-file-links>
      {files.map((f) => (
        <li key={f.id}>
          <a href={`${base}/${f.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-xs hover:border-primary/50 hover:text-primary">
            {f.mime.startsWith("image/") ? <ImageIcon className="size-3.5" /> : <FileTextIcon className="size-3.5" />}
            <span className="max-w-48 truncate">{f.name}</span>
            <span className="text-muted-foreground">{fileSize(f.size)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
