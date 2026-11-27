"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileUpIcon, LayoutTemplateIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteFileAction, getFileAction, listFilesAction, saveFileAction } from "@/app/actions/tools";

type Kind = "tpl_doc" | "tpl_deck" | "tpl_sheet" | "tpl_letter";
type Tpl = { id: string; title: string; updated_at: string };

// "Your templates" on a tool's start page: a Word, PowerPoint or Excel file (or one of the tool's own files) kept as
// a template, to start new ones from. Import reads the file in the browser (onImport) and keeps what it gives.
export function TemplateShelf<T>({ kind, accept, label, onImport, onUse, saveCurrent }: { kind: Kind; accept: string; label: string; onImport: (f: File) => Promise<{ title: string; data: T } | null>; onUse: (data: T, title: string) => void; saveCurrent?: { title: string; data: T } | null }) {
  const [list, setList] = React.useState<Tpl[] | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [del, setDel] = React.useState<Tpl | null>(null);
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    void listFilesAction(kind).then((r) => setList(r.ok ? ((r.data as Tpl[]) ?? []) : []));
  }, [kind]);
  const keep = async (title: string, data: T) => {
    const r = await saveFileAction(kind, { title, data });
    if (!r.ok) return toast.error(r.error);
    setList((l) => [{ id: r.data as string, title, updated_at: new Date().toISOString() }, ...(l ?? [])]);
    toast.success(`"${title}" kept as a template`);
  };
  return (
    <div className="space-y-2 rounded-lg border p-3" data-template-shelf={kind}>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy("import");
          try {
            const got = await onImport(f);
            if (got) await keep(got.title, got.data);
          } catch {
            toast.error("That file could not be read as a template.");
          }
          setBusy(null);
        }}
      />
      <div className="flex flex-wrap items-center gap-2">
        <LayoutTemplateIcon className="size-4 text-muted-foreground" />
        <p className="text-sm font-medium">Your templates</p>
        <div className="ml-auto flex flex-wrap gap-2">
          {saveCurrent && (
            <Button size="sm" variant="outline" onClick={() => keep(saveCurrent.title, saveCurrent.data)}>
              Save this as a template
            </Button>
          )}
          <Button size="sm" variant="outline" disabled={busy === "import"} onClick={() => ref.current?.click()} data-template-import>
            {busy === "import" ? <Loader2Icon className="animate-spin" /> : <FileUpIcon />} {label}
          </Button>
        </div>
      </div>
      {list === null ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : list.length ? (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((t) => (
            <li key={t.id} className="group flex items-center gap-1 rounded-md border">
              <button
                type="button"
                className="min-w-0 flex-1 px-3 py-2 text-left text-sm hover:bg-muted"
                disabled={busy === t.id}
                onClick={async () => {
                  setBusy(t.id);
                  const r = await getFileAction(kind, t.id);
                  setBusy(null);
                  if (!r.ok) return toast.error(r.error);
                  onUse((r.data as { data: T }).data, t.title);
                }}
              >
                <span className="block truncate font-medium">{t.title}</span>
                <span className="block text-[11px] text-muted-foreground">Start a new one from it</span>
              </button>
              <button type="button" aria-label={`Delete the template ${t.title}`} className="p-2 opacity-50 hover:opacity-100" onClick={() => setDel(t)}>
                <Trash2Icon className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">Import a file to keep it as a template; its layout, styles and text are copied into each new one you start from it.</p>
      )}
      <AlertDialog open={!!del} onOpenChange={(v) => !v && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the template &quot;{del?.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>Files already made from it stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!del) return;
                const r = await deleteFileAction(kind, del.id);
                if (!r.ok) return toast.error(r.error);
                setList((l) => (l ?? []).filter((x) => x.id !== del.id));
                setDel(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
