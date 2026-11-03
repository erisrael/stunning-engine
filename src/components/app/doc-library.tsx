"use client";

// The department's document library (Phase 26): a folder tree, the open folder's folders, documents and files,
// search, pinned and recent documents, upload, import from Word or Markdown, move, duplicate and export.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ChevronRightIcon, CopyIcon, DownloadIcon, FileIcon, FileTextIcon, FileUpIcon, FolderIcon, FolderOpenIcon, FolderPlusIcon, Loader2Icon, PinIcon, SearchIcon, Trash2Icon, UploadIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as A from "@/app/actions/departments";
import type { Library } from "@/server/dev-library";
import { deptViewPath } from "@/lib/work";
import { cn } from "@/lib/utils";

const size = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const toBase64 = (f: File) =>
  new Promise<string>((ok, bad) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(",")[1] ?? "");
    r.onerror = () => bad(r.error);
    r.readAsDataURL(f);
  });

export function DocLibrary({ dept }: { dept: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const folderId = sp.get("folder");
  const [lib, setLib] = React.useState<Library | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [found, setFound] = React.useState<Awaited<ReturnType<typeof import("@/server/dev-library").searchLibrary>> | null>(null);
  const [newFolder, setNewFolder] = React.useState<string | null>(null);
  const upload = React.useRef<HTMLInputElement>(null);
  const imp = React.useRef<HTMLInputElement>(null);
  const load = React.useCallback(async () => {
    const r = await A.libraryAction(dept, folderId);
    if (r.ok) setLib(r.data!);
    else toast.error(r.error);
  }, [dept, folderId]);
  React.useEffect(() => {
    void load();
  }, [load]);
  React.useEffect(() => {
    if (q.trim().length < 2) return setFound(null);
    const t = window.setTimeout(async () => {
      const r = await A.searchLibraryAction(dept, q);
      if (r.ok) setFound(r.data!);
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, dept]);
  const go = (id: string | null) => router.push(`${pathname}${id ? `?folder=${id}` : ""}`);
  const openDoc = (id: string) => router.push(deptViewPath(dept, "docs", `doc=${id}`));
  const doIt = async (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown }>, done?: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return void toast.error(r.error), null;
    if (done) toast.success(done);
    await load();
    return r.data ?? true;
  };
  if (!lib) return <p className="text-sm text-muted-foreground">Loading the library…</p>;
  const tree = (parent: string | null, depth: number): React.ReactNode =>
    lib.tree
      .filter((f) => f.parentId === parent)
      .map((f) => (
        <React.Fragment key={f.id}>
          <button type="button" onClick={() => go(f.id)} className={cn("flex w-full items-center gap-1 rounded px-1.5 py-1 text-left text-sm hover:bg-muted", f.id === folderId && "bg-muted font-medium")} style={{ paddingLeft: 6 + depth * 14 }} data-tree-folder={f.name}>
            {f.id === folderId ? <FolderOpenIcon className="size-4 shrink-0 text-[#F9AB00]" /> : <FolderIcon className="size-4 shrink-0 text-[#F9AB00]" />}
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            <span className="text-[10px] text-muted-foreground">{f.docs + f.files || ""}</span>
          </button>
          {tree(f.id, depth + 1)}
        </React.Fragment>
      ));
  const moveTo = (kind: "doc" | "file", id: string) => (
    <select aria-label="Move to" className="h-7 rounded border bg-background px-1 text-xs" value="" onChange={(e) => e.target.value && void doIt(() => A.moveLibraryItemAction(dept, { kind, id, folderId: e.target.value === "__top" ? null : e.target.value }), "Moved")} data-move={id}>
      <option value="">Move to…</option>
      <option value="__top">Library (top)</option>
      {lib.tree.filter((f) => f.id !== folderId).map((f) => (
        <option key={f.id} value={f.id}>
          {f.name}
        </option>
      ))}
    </select>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]" data-library>
      <aside className="space-y-3">
        <div className="rounded-lg border bg-card p-2">
          <button type="button" onClick={() => go(null)} className={cn("flex w-full items-center gap-1 rounded px-1.5 py-1 text-sm hover:bg-muted", !folderId && "bg-muted font-medium")}>
            <FolderIcon className="size-4 text-[#1A73E8]" /> Library
          </button>
          {tree(null, 1)}
        </div>
        {lib.pins.length > 0 && (
          <div className="rounded-lg border bg-card p-2 text-sm" data-pins>
            <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
              <PinIcon className="size-3" /> Pinned
            </p>
            {lib.pins.map((p) => (
              <button key={p.id} type="button" className="block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-muted" onClick={() => openDoc(p.id)}>
                {p.title}
              </button>
            ))}
          </div>
        )}
        <div className="rounded-lg border bg-card p-2 text-sm">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Recent</p>
          {lib.recent.map((p) => (
            <button key={p.id} type="button" className="block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-muted" onClick={() => openDoc(p.id)}>
              {p.title}
            </button>
          ))}
        </div>
      </aside>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Folder path" data-breadcrumbs>
            <button type="button" className="hover:underline" onClick={() => go(null)}>
              Library
            </button>
            {lib.path.map((p) => (
              <React.Fragment key={p.id}>
                <ChevronRightIcon className="size-3.5 text-muted-foreground" />
                <button type="button" className="hover:underline" onClick={() => go(p.id)}>
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </nav>
          <div className="relative ml-auto">
            <SearchIcon className="absolute top-2.5 left-2 size-4 text-muted-foreground" />
            <Input aria-label="Search the library" placeholder="Search titles, text and files" className="h-9 w-64 pl-8" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {lib.canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setNewFolder("")} data-new-folder>
              <FolderPlusIcon /> New folder
            </Button>
            <input ref={upload} type="file" multiple className="hidden" aria-label="Files to add" data-upload-input onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              for (const f of files) {
                if (f.size > 15 * 1024 * 1024) { toast.error(`${f.name} is over 15 MB.`); continue; }
                await doIt(async () => A.uploadLibraryFileAction(dept, { folderId, name: f.name, mime: f.type, base64: await toBase64(f) }));
              }
              if (files.length) toast.success(`${files.length} added`);
            }} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => upload.current?.click()}>
              {busy ? <Loader2Icon className="animate-spin" /> : <UploadIcon />} Add files
            </Button>
            <input ref={imp} type="file" accept=".docx,.md,.markdown,.txt,.html,.htm" className="hidden" aria-label="Document to import" data-import-input onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const id = await doIt(async () => A.importDocumentAction(dept, { folderId, name: f.name, base64: await toBase64(f) }), "Imported as a document");
              if (typeof id === "string") openDoc(id);
            }} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => imp.current?.click()}>
              <FileUpIcon /> Import Word or Markdown
            </Button>
            {lib.folder && (
              <Button size="sm" variant="ghost" onClick={() => window.confirm(`Remove the folder "${lib.folder!.name}"? What is in it moves up.`) && void doIt(() => A.deleteFolderAction(dept, lib.folder!.id), "Folder removed").then(() => go(lib.folder!.parentId))}>
                <Trash2Icon /> Remove this folder
              </Button>
            )}
          </div>
        )}
        {newFolder !== null && (
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await doIt(() => A.saveFolderAction(dept, { name: newFolder, parentId: folderId }), "Folder made")) setNewFolder(null);
            }}
          >
            <Input autoFocus aria-label="Folder name" placeholder="Folder name, e.g. Mobile app" className="h-9 w-64" value={newFolder} onChange={(e) => setNewFolder(e.target.value)} />
            <Button size="sm" type="submit" disabled={!newFolder.trim()}>
              Make
            </Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setNewFolder(null)}>
              Cancel
            </Button>
          </form>
        )}
        {found ? (
          <div className="space-y-1 rounded-lg border bg-card p-2 text-sm" data-search-results>
            <p className="text-xs text-muted-foreground">
              {found.docs.length + found.files.length + found.folders.length} found for &quot;{q}&quot;
            </p>
            {found.folders.map((f) => (
              <button key={f.id} type="button" className="flex w-full items-center gap-2 rounded px-1.5 py-1 hover:bg-muted" onClick={() => (setQ(""), go(f.id))}>
                <FolderIcon className="size-4 text-[#F9AB00]" /> {f.name}
              </button>
            ))}
            {found.docs.map((d) => (
              <button key={d.id} type="button" className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-muted" onClick={() => openDoc(d.id)} data-found-doc={d.title}>
                <FileTextIcon className="mt-0.5 size-4 shrink-0 text-[#1A73E8]" />
                <span>
                  {d.title}
                  {d.snippet && <span className="block text-xs text-muted-foreground">{d.snippet}</span>}
                </span>
              </button>
            ))}
            {found.files.map((f) => (
              <a key={f.id} href={`/api/dept-library/${f.id}`} className="flex items-center gap-2 rounded px-1.5 py-1 hover:bg-muted">
                <FileIcon className="size-4 text-muted-foreground" /> {f.name}
              </a>
            ))}
          </div>
        ) : (
          <ul className="divide-y rounded-lg border bg-card text-sm" data-library-list>
            {lib.subfolders.map((f) => (
              <li key={f.id}>
                <button type="button" onClick={() => go(f.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50" data-folder={f.name}>
                  <FolderIcon className="size-4 text-[#F9AB00]" /> <span className="font-medium">{f.name}</span>
                </button>
              </li>
            ))}
            {lib.docs.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-lib-doc={d.title}>
                <FileTextIcon className="size-4 text-[#1A73E8]" />
                <button type="button" className="font-medium hover:underline" onClick={() => openDoc(d.id)}>
                  {d.title}
                </button>
                <span className="rounded bg-muted px-1.5 text-[11px]">{d.kindLabel}</span>
                <span className="text-xs text-muted-foreground">
                  v{d.version} · {d.status} · {d.author ?? ""} · {d.updatedAt.slice(0, 10)}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <Button size="icon" variant="ghost" className={cn("size-7", d.pinned && "text-[#1A73E8]")} aria-label={d.pinned ? `Unpin ${d.title}` : `Pin ${d.title}`} aria-pressed={d.pinned} onClick={() => doIt(() => A.togglePinAction(dept, d.id))}>
                    <PinIcon />
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="size-7" aria-label={`Download ${d.title} as Word`}>
                    <a href={`/api/dept-docs/${d.id}?dept=${dept}&format=docx`}>
                      <DownloadIcon />
                    </a>
                  </Button>
                  {lib.canWrite && (
                    <>
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Duplicate ${d.title}`} onClick={() => doIt(() => A.duplicateDocAction(dept, d.id), "Copied")}>
                        <CopyIcon />
                      </Button>
                      {moveTo("doc", d.id)}
                    </>
                  )}
                </span>
              </li>
            ))}
            {lib.files.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2" data-lib-file={f.name}>
                <FileIcon className="size-4 text-muted-foreground" />
                <a href={`/api/dept-library/${f.id}`} className="font-medium hover:underline" target="_blank" rel="noreferrer">
                  {f.name}
                </a>
                <span className="text-xs text-muted-foreground">
                  {size(f.size)} · {f.by ?? ""} · {f.createdAt.slice(0, 10)}
                </span>
                {lib.canWrite && (
                  <span className="ml-auto flex items-center gap-1">
                    {moveTo("file", f.id)}
                    <Button size="icon" variant="ghost" className="size-7" aria-label={`Delete ${f.name}`} onClick={() => window.confirm(`Delete ${f.name}?`) && void doIt(() => A.deleteLibraryFileAction(dept, f.id), "Deleted")}>
                      <Trash2Icon />
                    </Button>
                  </span>
                )}
              </li>
            ))}
            {!lib.subfolders.length && !lib.docs.length && !lib.files.length && <li className="px-3 py-6 text-center text-muted-foreground">This folder is empty. Start a document above, add files or import one.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
