"use client";

// Access in a department (src/server/dept-access.ts): the Share dialog heads and leads use on folders, documents,
// files and projects; the protected reader for what a member may only view (no copying, printing or saving, a
// watermark with their name, attempts and tools reported); and the Access page with alerts and every share.

import * as React from "react";
import { toast } from "sonner";
import { BanIcon, CheckIcon, EyeIcon, Loader2Icon, ShieldAlertIcon, ShieldCheckIcon, Share2Icon, Trash2Icon, UsersIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import * as A from "@/app/actions/departments";
import { cn } from "@/lib/utils";

type Kind = "folder" | "doc" | "file" | "project";
type LevelOrNone = "view" | "download" | "none";
export const LEVEL_TEXT: Record<"view" | "download", string> = { view: "View only", download: "View and download" };

export function LevelBadge({ level }: { level: "view" | "download" }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded border px-1.5 text-[11px]", level === "view" ? "border-[color:var(--warning)]/50 text-[color:var(--warning)]" : "text-muted-foreground")} data-level={level}>
      {level === "view" ? <EyeIcon className="size-3" /> : <ShieldCheckIcon className="size-3" />} {LEVEL_TEXT[level]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Share dialog
// ---------------------------------------------------------------------------

export function ShareButton({ dept, kind, id, name, size = "icon" }: { dept: string; kind: Kind; id: string; name: string; size?: "icon" | "sm" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button size={size} variant="ghost" className={size === "icon" ? "size-7" : "h-8 gap-1.5"} aria-label={`Share ${name}`} onClick={() => setOpen(true)} data-share={id}>
        <Share2Icon className="size-3.5" />
        {size === "sm" && "Share"}
      </Button>
      {open && <ShareDialog dept={dept} kind={kind} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ShareDialog({ dept, kind, id, onClose }: { dept: string; kind: Kind; id: string; onClose: () => void }) {
  type Data = { title: string | null; shares: { id: string; userId: string; name: string; level: "view" | "download"; at: string }[]; people: { id: string; name: string; position: string | null }[] };
  const [data, setData] = React.useState<Data | null>(null);
  const [who, setWho] = React.useState("");
  const [level, setLevel] = React.useState<"view" | "download">("view");
  const [busy, setBusy] = React.useState(false);
  const load = React.useCallback(async () => {
    const r = await A.listSharesAction(dept, kind, id);
    if (r.ok) setData(r.data as Data);
    else toast.error(r.error);
  }, [dept, kind, id]);
  React.useEffect(() => void load(), [load]);
  const save = async (userId: string, l: LevelOrNone) => {
    setBusy(true);
    const r = await A.setShareAction(dept, { kind, id, userId, level: l });
    setBusy(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(l === "none" ? "No longer shared" : "Shared");
    setWho("");
    await load();
  };
  const what = { folder: "this folder and everything in it", doc: "this document", file: "this file", project: "this project's tasks" }[kind];
  const taken = new Set(data?.shares.map((s) => s.userId));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg" data-share-dialog>
        <DialogHeader>
          <DialogTitle>Share {data?.title ? `"${data.title}"` : ""}</DialogTitle>
          <DialogDescription>
            Choose who may see {what}. View only: read in the app, with copying, printing and downloading blocked and every attempt reported to you. View and download: also export, print and download. Heads and leads always see everything.
          </DialogDescription>
        </DialogHeader>
        {!data ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Select value={who} onValueChange={setWho}>
                <SelectTrigger className="h-8 min-w-48 flex-1 text-xs" aria-label="Share with">
                  <SelectValue placeholder="Choose a person" />
                </SelectTrigger>
                <SelectContent>
                  {!taken.has("*") && <SelectItem value="*">Everyone in the department</SelectItem>}
                  {data.people.filter((p) => !taken.has(p.id)).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.position ? ` (${p.position})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={level} onValueChange={(v) => setLevel(v as "view" | "download")}>
                <SelectTrigger className="h-8 w-44 text-xs" aria-label="Access">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="view">View only</SelectItem>
                  <SelectItem value="download">View and download</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!who || busy} onClick={() => save(who, level)}>
                Share
              </Button>
            </div>
            <ul className="divide-y rounded-lg border text-sm" data-share-list>
              {data.shares.map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2">
                  {s.userId === "*" ? <UsersIcon className="size-4 text-muted-foreground" /> : null}
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <Select value={s.level} onValueChange={(v) => save(s.userId, v as LevelOrNone)}>
                    <SelectTrigger className="h-7 w-40 text-xs" aria-label={`Access for ${s.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="view">View only</SelectItem>
                      <SelectItem value="download">View and download</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" className="size-7" aria-label={`Stop sharing with ${s.name}`} disabled={busy} onClick={() => save(s.userId, "none")}>
                    <Trash2Icon className="size-3.5" />
                  </Button>
                </li>
              ))}
              {!data.shares.length && <li className="px-3 py-3 text-xs text-muted-foreground">Not shared with any member yet. Only heads, leads and whoever made it can see it.</li>}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// The protected reader (view only)
// ---------------------------------------------------------------------------

// Wraps what a member may only view: selecting, copying, dragging, the right-click menu, saving, printing and the
// page source are blocked; the browser's developer tools and automation tools (WebDriver) hide the content; a
// watermark carries their name and the time; every attempt is reported once a minute at most.
export function ProtectedView({ dept, targetKind, targetId, viewer, children }: { dept: string; targetKind: "doc" | "file"; targetId: string; viewer: { name: string; email: string | null }; children: React.ReactNode }) {
  const [hidden, setHidden] = React.useState<string | null>(null);
  const [warn, setWarn] = React.useState<string | null>(null);
  const sent = React.useRef(new Map<string, number>());
  const report = React.useCallback(
    (kind: string, message: string, detail?: string) => {
      setWarn(message);
      const last = sent.current.get(kind) ?? 0;
      if (Date.now() - last < 60e3) return;
      sent.current.set(kind, Date.now());
      void A.reportAccessEventAction(dept, { kind, targetKind, targetId, detail: detail ?? null });
    },
    [dept, targetKind, targetId],
  );
  React.useEffect(() => {
    const blocked = "This is view only. Your team lead has been told.";
    const onCopy = (e: ClipboardEvent) => (e.preventDefault(), report(e.type === "cut" ? "cut" : "copy", blocked));
    const onMenu = (e: MouseEvent) => (e.preventDefault(), report("context_menu", blocked));
    const onDrag = (e: DragEvent) => (e.preventDefault(), report("drag", blocked));
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let kind: string | null = null;
      if (mod && k === "c") kind = "copy";
      else if (mod && k === "x") kind = "cut";
      else if (mod && k === "a") kind = "select_all";
      else if (mod && k === "s") kind = "save";
      else if (mod && k === "p") kind = "print";
      else if (mod && k === "u") kind = "view_source";
      else if (k === "f12" || (mod && e.shiftKey && ["i", "j", "c"].includes(k)) || (e.metaKey && e.altKey && ["i", "j", "c"].includes(k))) kind = "devtools";
      else if (k === "printscreen") kind = "print_screen";
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      if (kind === "print_screen") {
        void navigator.clipboard?.writeText?.("").catch(() => {});
        setHidden("Screenshots are not allowed for this document.");
        window.setTimeout(() => setHidden(null), 3000);
      }
      report(kind, blocked);
    };
    const onPrint = () => report("print", blocked);
    // Developer tools docked beside or under the page make the window's inner area much smaller than the outer one.
    const check = () => {
      const open = window.outerWidth - window.innerWidth > 200 || window.outerHeight - window.innerHeight > 260;
      if (open) {
        setHidden("Close the browser's developer tools to read this document.");
        report("devtools", "Developer tools are open.");
      } else setHidden((h) => (h?.startsWith("Close the browser") ? null : h));
    };
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) {
      setHidden("This document cannot be opened by automation tools.");
      report("automation", "Automation tool detected.", navigator.userAgent);
    }
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCopy);
    document.addEventListener("contextmenu", onMenu);
    document.addEventListener("dragstart", onDrag);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("beforeprint", onPrint);
    const timer = window.setInterval(check, 1500);
    check();
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCopy);
      document.removeEventListener("contextmenu", onMenu);
      document.removeEventListener("dragstart", onDrag);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("beforeprint", onPrint);
      window.clearInterval(timer);
    };
  }, [report]);
  const stamp = `${viewer.name}${viewer.email ? ` · ${viewer.email}` : ""} · ${new Date().toISOString().slice(0, 16).replace("T", " ")} · View only`;
  return (
    <div className="relative" data-protected-view>
      {/* Printing shows nothing but this line. */}
      <style>{`@media print { body * { visibility: hidden !important; } body::after { content: "This document is view only and cannot be printed."; visibility: visible; position: fixed; top: 40%; left: 0; right: 0; text-align: center; font: 16px sans-serif; } }`}</style>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/5 px-3 py-1.5 text-xs" role="note">
        <EyeIcon className="size-3.5 text-[color:var(--warning)]" />
        <span>View only. Copying, printing and downloading are blocked, and attempts are reported to your team lead.</span>
        {warn && <span className="ml-auto font-medium text-[color:var(--warning)]">{warn}</span>}
      </div>
      <div className={cn("relative select-none [-webkit-touch-callout:none]", hidden && "pointer-events-none blur-md")} onCopy={(e) => e.preventDefault()} aria-hidden={!!hidden}>
        {children}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" style={{ backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='420' height='220'><text x='10' y='120' transform='rotate(-24 210 110)' fill='rgba(120,120,120,0.13)' font-family='sans-serif' font-size='13'>${stamp.replace(/[<>&'"]/g, "")}</text></svg>`)}")` }} />
      </div>
      {hidden && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow">{hidden}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Access page (heads and leads)
// ---------------------------------------------------------------------------

type Overview = {
  shares: { id: string; kind: Kind; targetId: string; title: string; userId: string; name: string; level: "view" | "download"; by: string | null; at: string }[];
  people: { id: string; name: string; position: string | null; full: boolean }[];
  projects: { id: string; label: string }[];
  events: { id: string; userId: string | null; name: string; kind: string; label: string; targetKind: string | null; targetId: string | null; title: string | null; detail: string | null; userAgent: string | null; ip: string | null; repeats: number; at: string; last: string; reviewedAt: string | null; reviewer: string | null; outcome: string | null }[];
};
const KIND_LABEL: Record<Kind, string> = { folder: "Folder", doc: "Document", file: "File", project: "Project" };

export function DeptAccessView({ dept }: { dept: string }) {
  const [data, setData] = React.useState<Overview | null>(null);
  const [tab, setTab] = React.useState<"alerts" | "shares" | "people">("alerts");
  const [person, setPerson] = React.useState("all");
  const [project, setProject] = React.useState("");
  const [projectWho, setProjectWho] = React.useState("");
  const [projectLevel, setProjectLevel] = React.useState<"view" | "download">("view");
  const load = React.useCallback(async () => {
    const r = await A.accessOverviewAction(dept);
    if (r.ok) setData(r.data as Overview);
    else toast.error(r.error);
  }, [dept]);
  React.useEffect(() => void load(), [load]);
  if (!data) return <Loader2Icon className="animate-spin" />;
  const open = data.events.filter((e) => !e.reviewedAt);
  const review = async (id: string, outcome: "noted" | "revoke_item" | "revoke_all") => {
    const r = await A.reviewAccessEventAction(dept, id, outcome);
    if (!r.ok) return void toast.error(r.error);
    toast.success(outcome === "noted" ? "Marked as reviewed" : `Access removed${r.data ? ` (${r.data} share${r.data === 1 ? "" : "s"})` : ""}`);
    await load();
  };
  const unshare = async (s: Overview["shares"][number]) => {
    const r = await A.setShareAction(dept, { kind: s.kind, id: s.targetId, userId: s.userId, level: "none" });
    if (!r.ok) return void toast.error(r.error);
    await load();
  };
  const shares = data.shares.filter((s) => person === "all" || s.userId === person);
  return (
    <div className="space-y-4" data-access-view>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Open alerts", open.length, open.length > 0],
          ["Alerts this month", data.events.filter((e) => e.at >= new Date(Date.now() - 30 * 864e5).toISOString()).length, false],
          ["Shares", data.shares.length, false],
          ["Members with shares", new Set(data.shares.map((s) => s.userId)).size, false],
        ].map(([l, n, warn]) => (
          <div key={String(l)} className="rounded-xl border bg-card px-3 py-2.5">
            <p className="text-[11px] text-muted-foreground">{l}</p>
            <p className={cn("text-xl font-semibold tabular-nums", warn && "text-destructive")}>{n as number}</p>
          </div>
        ))}
      </div>
      <div className="inline-flex rounded-md border bg-muted/40 p-0.5" role="tablist">
        {(
          [
            ["alerts", `Alerts${open.length ? ` (${open.length})` : ""}`],
            ["shares", "Shares"],
            ["people", "People"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("rounded px-3 py-1 text-xs font-medium text-muted-foreground", tab === k && "bg-background text-foreground shadow-sm")} data-access-tab={k}>
            {l}
          </button>
        ))}
      </div>

      {tab === "alerts" && (
        <section className="space-y-2" aria-label="Alerts">
          <p className="text-xs text-muted-foreground">
            Attempts to copy, print, save or download what someone may only view; developer, automation and scraping tools; documents opened in bulk. The same attempt within ten minutes is counted on one alert.
          </p>
          <ul className="space-y-2">
            {data.events.map((e) => (
              <li key={e.id} className={cn("rounded-xl border bg-card p-3", !e.reviewedAt && "border-destructive/40")} data-access-event={e.kind}>
                <div className="flex flex-wrap items-start gap-2">
                  <ShieldAlertIcon className={cn("mt-0.5 size-4", e.reviewedAt ? "text-muted-foreground" : "text-destructive")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {e.name}: {e.label}
                      {e.repeats > 1 && <span className="ml-1 text-xs font-normal text-muted-foreground">({e.repeats} times)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {e.title ? `${e.targetKind === "file" ? "File" : "Document"}: ${e.title} · ` : ""}
                      {e.at.slice(0, 16).replace("T", " ")}
                      {e.last !== e.at ? ` to ${e.last.slice(11, 16)}` : ""}
                      {e.ip ? ` · ${e.ip}` : ""}
                      {e.detail ? ` · ${e.detail}` : ""}
                    </p>
                    {e.userAgent && <p className="truncate text-[11px] text-muted-foreground">{e.userAgent}</p>}
                    {e.reviewedAt && (
                      <p className="mt-1 text-xs">
                        <Badge variant="outline" className="gap-1">
                          <CheckIcon className="size-3" /> {e.outcome}
                        </Badge>{" "}
                        <span className="text-muted-foreground">by {e.reviewer ?? "someone"}, {e.reviewedAt.slice(0, 10)}</span>
                      </p>
                    )}
                  </div>
                  {!e.reviewedAt && (
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => review(e.id, "noted")}>
                        Reviewed
                      </Button>
                      {e.targetId && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => review(e.id, "revoke_item")}>
                          Remove access to this
                        </Button>
                      )}
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-xs text-destructive" onClick={() => window.confirm(`Remove everything shared with ${e.name}?`) && review(e.id, "revoke_all")}>
                        <BanIcon className="size-3" /> Remove all access
                      </Button>
                    </div>
                  )}
                </div>
              </li>
            ))}
            {!data.events.length && <li className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">No alerts. Nobody has tried to take what they may only view.</li>}
          </ul>
        </section>
      )}

      {tab === "shares" && (
        <section className="space-y-3" aria-label="Shares">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-2">
            <span className="text-xs font-medium">Share a project&apos;s tasks</span>
            <Select value={project} onValueChange={setProject}>
              <SelectTrigger className="h-8 w-56 text-xs" aria-label="Project">
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {data.projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectWho} onValueChange={setProjectWho}>
              <SelectTrigger className="h-8 w-48 text-xs" aria-label="With">
                <SelectValue placeholder="With whom" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="*">Everyone in the department</SelectItem>
                {data.people.filter((p) => !p.full).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={projectLevel} onValueChange={(v) => setProjectLevel(v as "view" | "download")}>
              <SelectTrigger className="h-8 w-40 text-xs" aria-label="Access">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">View only</SelectItem>
                <SelectItem value="download">View and download</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="h-8"
              disabled={!project || !projectWho}
              onClick={async () => {
                const r = await A.setShareAction(dept, { kind: "project", id: project, userId: projectWho, level: projectLevel });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Shared");
                setProject("");
                setProjectWho("");
                await load();
              }}
            >
              Share
            </Button>
            <Select value={person} onValueChange={setPerson}>
              <SelectTrigger className="ml-auto h-8 w-48 text-xs" aria-label="Show shares of">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone</SelectItem>
                <SelectItem value="*">Shared with the whole department</SelectItem>
                {data.people.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Folders, documents and files are shared from Specs and docs (the Share button on each).</p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">With</th>
                  <th className="px-3 py-1.5 text-left font-medium">What</th>
                  <th className="px-3 py-1.5 text-left font-medium">Access</th>
                  <th className="px-3 py-1.5 text-left font-medium">Shared by</th>
                  <th className="px-3 py-1.5 text-left font-medium">Since</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id} className="border-t" data-access-share={s.title}>
                    <td className="px-3 py-1.5 font-medium">{s.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-muted-foreground">{KIND_LABEL[s.kind]}:</span> {s.title}
                    </td>
                    <td className="px-3 py-1.5">
                      <LevelBadge level={s.level} />
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{s.by ?? ""}</td>
                    <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{s.at.slice(0, 10)}</td>
                    <td className="px-2 py-1 text-right">
                      <Button size="icon" variant="ghost" className="size-7" aria-label={`Stop sharing ${s.title} with ${s.name}`} onClick={() => unshare(s)}>
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!shares.length && (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                      Nothing shared yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "people" && (
        <section className="overflow-x-auto rounded-xl border bg-card" aria-label="People">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Person</th>
                <th className="px-3 py-1.5 text-left font-medium">Sees</th>
                <th className="px-3 py-1.5 text-right font-medium">Shares</th>
                <th className="px-3 py-1.5 text-right font-medium">Open alerts</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{p.name}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.full ? "Everything (head or lead)" : "Their own work and what is shared with them"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    <button type="button" className="hover:underline" onClick={() => (setPerson(p.id), setTab("shares"))}>
                      {data.shares.filter((s) => s.userId === p.id).length}
                    </button>
                  </td>
                  <td className={cn("px-3 py-1.5 text-right tabular-nums", open.some((e) => e.userId === p.id) && "font-semibold text-destructive")}>{open.filter((e) => e.userId === p.id).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
