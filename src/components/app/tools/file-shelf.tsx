"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteFileAction } from "@/app/actions/tools";
import type { FileKind } from "@/server/tools-data";
import { cn } from "@/lib/utils";

export type SavedFile = { id: string; title: string; updated_at: string };

// The person's saved documents, decks or letters: open, start a new one, delete.
export function FileShelf({ kind, files, setFiles, current, onOpen, onNew, newLabel }: { kind: FileKind; files: SavedFile[]; setFiles: (f: SavedFile[]) => void; current: string | null; onOpen: (id: string) => void; onNew: () => void; newLabel: string }) {
  return (
    <aside className="space-y-2">
      <Button className="w-full" onClick={onNew}>
        <PlusIcon /> {newLabel}
      </Button>
      <ul className="max-h-[60vh] space-y-1 overflow-auto">
        {files.map((f) => (
          <li key={f.id} className="group flex items-center gap-1">
            <button type="button" onClick={() => onOpen(f.id)} className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-muted", current === f.id && "border-primary bg-primary/5")}>
              <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{f.title}</span>
                <span className="block text-[11px] text-muted-foreground">{new Date(f.updated_at).toLocaleString()}</span>
              </span>
            </button>
            <button
              type="button"
              aria-label={`Delete ${f.title}`}
              className="rounded p-1 opacity-0 group-hover:opacity-60 hover:opacity-100 focus:opacity-100"
              onClick={async () => {
                if (!confirm(`Delete "${f.title}"?`)) return;
                const r = await deleteFileAction(kind, f.id);
                if (!r.ok) return toast.error(r.error);
                setFiles(files.filter((x) => x.id !== f.id));
              }}
            >
              <Trash2Icon className="size-3.5" />
            </button>
          </li>
        ))}
        {!files.length && <li className="px-2 py-4 text-center text-xs text-muted-foreground">Nothing saved yet.</li>}
      </ul>
    </aside>
  );
}
