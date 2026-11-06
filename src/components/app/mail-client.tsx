"use client";

// Phase 14: the company inbox in the app. Folders on the left (Inbox, Drafts, Sent, Archive, Junk, Trash and the
// mailbox's own), the list, and the message beside it on wide screens or in its place on narrow ones. Compose with
// reply, reply all, forward, attachments, drafts and a few seconds to undo sending. Keyboard: c compose, j and k
// move, Enter open, u back, r reply, a reply all, f forward, e archive, # delete, s star, / search.

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  FileIcon,
  FolderIcon,
  ForwardIcon,
  ImageIcon,
  InboxIcon,
  KeyRoundIcon,
  Loader2Icon,
  MailIcon,
  MailOpenIcon,
  OctagonAlertIcon,
  PaperclipIcon,
  PencilIcon,
  RefreshCwIcon,
  ReplyAllIcon,
  ReplyIcon,
  SearchIcon,
  SendIcon,
  ShieldCheckIcon,
  StarIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cancelScheduledAction, mailActAction, mailDraftAction, mailFoldersAction, mailHomeAction, mailListAction, mailMessageAction, mailSaveDraftAction, mailScheduleAction, mailSendAction, myScheduledAction, mySignatureAction, saveSignatureAction, setMyMailboxPasswordAction } from "@/app/actions/mail";
import type { FolderRole, MailAction, MailCompose, MailFolder, MailMessage } from "@/server/mail";
import { cn, pollMs } from "@/lib/utils";

type Row = { uid: number; seen: boolean; flagged: boolean; answered: boolean; draft: boolean; size: number; date: string; subject: string; from: { name: string; address: string } | null; to: string[]; attachments: boolean; preview?: string; thread?: number[] };
// Messages with the same subject (without Re: and Fwd:) are one conversation in the list.
const threadKey = (subject: string) => subject.replace(/^((re|fwd?|aw|sv)\s*:\s*)+/i, "").trim().toLowerCase();
function group(rows: Row[]): Row[] {
  const out: Row[] = [];
  const at = new Map<string, number>();
  for (const r of rows) {
    const k = threadKey(r.subject);
    const i = k ? at.get(k) : undefined;
    if (i === undefined) {
      if (k) at.set(k, out.length);
      out.push({ ...r, thread: [r.uid] });
    } else {
      const t = out[i]!;
      out[i] = { ...t, seen: t.seen && r.seen, flagged: t.flagged || r.flagged, attachments: t.attachments || r.attachments, thread: [...(t.thread ?? [t.uid]), r.uid] };
    }
  }
  return out;
}
type Draft = { to: string; cc: string; bcc: string; subject: string; text: string; inReplyTo: string | null; references: string[]; attachments: { name: string; type: string; base64: string }[]; draftUid: number | null; replied: { folder: string; uid: number } | null; forward: { folder: string; uid: number; names: string[] } | null; showCc: boolean };
const EMPTY: Draft = { to: "", cc: "", bcc: "", subject: "", text: "", inReplyTo: null, references: [], attachments: [], draftUid: null, replied: null, forward: null, showCc: false };
const ICON: Record<FolderRole, React.ComponentType<{ className?: string }>> = { inbox: InboxIcon, drafts: FileIcon, sent: SendIcon, archive: ArchiveIcon, junk: OctagonAlertIcon, trash: Trash2Icon };
const UNDO_MS = 5000;

const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
};
const split = (v: string) => v.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const who = (a: { name: string; address: string } | null) => (a ? a.name || a.address : "(unknown)");
const fmtSize = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

export function MailClient({ ownBox, others, initialBox, tz }: { ownBox: { id: string; address: string } | null; others: { id: string; address: string; name: string | null }[]; initialBox: string | null; tz: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [box, setBox] = React.useState<string | null>(initialBox && others.some((o) => o.id === initialBox) ? initialBox : ownBox ? null : (others[0]?.id ?? null));
  const readOnly = !!box && box !== ownBox?.id;
  const [folders, setFolders] = React.useState<MailFolder[] | null>(null);
  const [folder, setFolder] = React.useState("INBOX");
  const [rows, setRows] = React.useState<Row[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const [pages, setPages] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<"unread" | "starred" | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [checked, setChecked] = React.useState<number[]>([]);
  const [cursor, setCursor] = React.useState(0);
  const [open, setOpen] = React.useState<MailMessage | null>(null);
  const [opening, setOpening] = React.useState<number | null>(null);
  const [compose, setCompose] = React.useState<Draft | null>(null);
  const [threads, setThreads] = React.useState(true);
  const [signature, setSignature] = React.useState("");
  const [editSig, setEditSig] = React.useState<string | null>(null);
  const [editPass, setEditPass] = React.useState(false);
  const [scheduled, setScheduled] = React.useState<{ id: string; subject: string; recipients: string; send_at: string; status: string; error: string | null }[]>([]);
  const loadScheduled = React.useCallback(async () => {
    const r = await myScheduledAction();
    if (r.ok) setScheduled(r.data!);
  }, []);
  React.useEffect(() => {
    void mySignatureAction().then((r) => r.ok && setSignature(r.data ?? ""));
    void loadScheduled();
  }, [loadScheduled]);
  const sig = signature.trim() ? `\n\n-- \n${signature.trim()}` : "";
  const newMessage = () => setCompose({ ...EMPTY, text: sig });
  const searchRef = React.useRef<HTMLInputElement>(null);
  const current = folders?.find((f) => f.path === folder);
  const shown = React.useMemo(() => (threads && current?.role !== "drafts" ? group(rows) : rows), [threads, rows, current?.role]);

  const loadFolders = React.useCallback(async () => {
    const r = await mailFoldersAction(box);
    if (r.ok) setFolders(r.data!);
  }, [box]);

  const loadList = React.useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      const r = await mailListAction({ box, folder, page, q: query || null, only });
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setError(null);
      setRows(r.data!.rows);
      setTotal(r.data!.total);
      setPages(r.data!.pages);
    },
    [box, folder, page, query, only],
  );

  // First load (and when switching mailboxes): folders, then the inbox.
  React.useEffect(() => {
    let off = false;
    (async () => {
      setFolders(null);
      setOpen(null);
      setFolder("INBOX");
      const r = await mailHomeAction(box);
      if (off) return;
      if (!r.ok) return (setError(r.error), setLoading(false));
      setFolders(r.data!.folders);
    })();
    return () => {
      off = true;
    };
  }, [box]);

  React.useEffect(() => {
    if (folders) void loadList();
  }, [folders !== null, loadList]); // eslint-disable-line react-hooks/exhaustive-deps

  // New mail: every minute while the page is open, and when coming back to the tab.
  React.useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void loadFolders();
      void loadList(true);
    };
    const t = window.setInterval(refresh, pollMs(60_000));
    document.addEventListener("visibilitychange", refresh);
    return () => (window.clearInterval(t), document.removeEventListener("visibilitychange", refresh));
  }, [loadFolders, loadList]);

  const pickFolder = (path: string) => {
    setFolder(path);
    setPage(0);
    setChecked([]);
    setOpen(null);
    setCursor(0);
  };

  const openMessage = async (row: Row) => {
    if (current?.role === "drafts" && !readOnly) {
      const r = await mailDraftAction({ box, folder, uid: row.uid });
      if (!r.ok) return toast.error(r.error);
      const d = r.data!;
      return setCompose({ ...EMPTY, to: d.to.join(", "), cc: d.cc.join(", "), bcc: d.bcc.join(", "), subject: d.subject, text: d.text, inReplyTo: d.inReplyTo, references: d.references, attachments: d.attachments, draftUid: row.uid, showCc: !!(d.cc.length || d.bcc.length) });
    }
    setOpening(row.uid);
    const r = await mailMessageAction({ box, folder, uid: row.uid });
    setOpening(null);
    if (!r.ok) return toast.error(r.error);
    setOpen(r.data!);
    if (!row.seen) {
      setRows((rs) => rs.map((x) => (x.uid === row.uid ? { ...x, seen: true } : x)));
      setFolders((fs) => fs?.map((f) => (f.path === folder ? { ...f, unread: Math.max(0, f.unread - 1) } : f)) ?? fs);
      router.refresh();
    }
  };

  const act = async (action: MailAction, uids: number[], to?: string) => {
    if (!uids.length) return;
    const r = await mailActAction({ box, folder, uids, action, to });
    if (!r.ok) return toast.error(r.error);
    const leaves = ["archive", "junk", "notjunk", "restore", "trash", "delete", "move"].includes(action);
    if (leaves) {
      setRows((rs) => rs.filter((x) => !uids.includes(x.uid)));
      if (open && uids.includes(open.uid)) setOpen(null);
      toast.success(
        { archive: "Archived", junk: "Moved to Junk", notjunk: "Moved to the inbox", restore: "Moved to the inbox", trash: current?.role === "trash" ? "Deleted for good" : "Moved to Trash", delete: "Deleted for good", move: "Moved" }[action as string] ??
          "Done",
      );
    } else {
      const set = (x: Row): Row => (action === "read" ? { ...x, seen: true } : action === "unread" ? { ...x, seen: false } : action === "star" ? { ...x, flagged: true } : action === "unstar" ? { ...x, flagged: false } : x);
      setRows((rs) => rs.map((x) => (uids.includes(x.uid) ? set(x) : x)));
      if (open && uids.includes(open.uid) && (action === "star" || action === "unstar")) setOpen({ ...open, flagged: action === "star" });
      if (action === "unread" && open && uids.includes(open.uid)) setOpen(null);
    }
    setChecked([]);
    void loadFolders();
    router.refresh();
  };

  const reply = (m: MailMessage, mode: "reply" | "all" | "forward") => {
    const quoteHead = `On ${new Date(m.date).toLocaleString("en-GB", { timeZone: tz })}, ${who(m.from)} <${m.from?.address ?? ""}> wrote:`;
    const quoted = m.text
      .split("\n")
      .map((l) => `> ${l}`)
      .join("\n");
    if (mode === "forward")
      return setCompose({
        ...EMPTY,
        subject: /^fwd?:/i.test(m.subject) ? m.subject : `Fwd: ${m.subject}`,
        text: `\n\n---------- Forwarded message ----------\nFrom: ${who(m.from)} <${m.from?.address ?? ""}>\nDate: ${new Date(m.date).toLocaleString("en-GB", { timeZone: tz })}\nSubject: ${m.subject}\nTo: ${m.to.map((a) => a.address).join(", ")}\n\n${m.text}`,
        forward: m.attachments.length ? { folder: m.folder, uid: m.uid, names: m.attachments.map((a) => a.name) } : null,
      });
    const me = (ownBox?.address ?? "").toLowerCase();
    const to = (m.replyTo.length ? m.replyTo : m.from ? [m.from] : []).map((a) => a.address);
    const cc = mode === "all" ? [...m.to, ...m.cc].map((a) => a.address).filter((a) => a !== me && !to.includes(a)) : [];
    setCompose({
      ...EMPTY,
      to: to.join(", "),
      cc: cc.join(", "),
      showCc: cc.length > 0,
      subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}`,
      text: `${sig}\n\n${quoteHead}\n${quoted}`,
      inReplyTo: m.messageId,
      references: m.references,
      replied: { folder: m.folder, uid: m.uid },
    });
  };

  // Keyboard shortcuts.
  React.useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (typing(e) || compose || e.metaKey || e.ctrlKey || e.altKey) return;
      const row = shown[cursor];
      if (e.key === "c" && !readOnly) (e.preventDefault(), newMessage());
      else if (e.key === "/") (e.preventDefault(), searchRef.current?.focus());
      else if (e.key === "j") setCursor((c) => Math.min(shown.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if ((e.key === "Enter" || e.key === "o") && row) void openMessage(row);
      else if (e.key === "u") setOpen(null);
      else if (open && e.key === "r" && !readOnly) (e.preventDefault(), reply(open, "reply"));
      else if (open && e.key === "a" && !readOnly) (e.preventDefault(), reply(open, "all"));
      else if (open && e.key === "f" && !readOnly) (e.preventDefault(), reply(open, "forward"));
      else if (e.key === "e" && !readOnly) void act("archive", open ? [open.uid] : checked.length ? checked : row ? [row.uid] : []);
      else if (e.key === "#" && !readOnly) void act("trash", open ? [open.uid] : checked.length ? checked : row ? [row.uid] : []);
      else if (e.key === "s" && !readOnly) {
        const target = open ? rows.find((x) => x.uid === open.uid) : row;
        if (target) void act(target.flagged ? "unstar" : "star", [target.uid]);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

  const selectBox = (v: string) => {
    const next = v === "mine" ? null : v;
    setBox(next);
    const p = new URLSearchParams(params.toString());
    if (next) p.set("box", next);
    else p.delete("box");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const allChecked = rows.length > 0 && checked.length === rows.length;
  const role = current?.role ?? null;

  return (
    <div className="space-y-3" data-mail>
      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Mailbox</span>
          <Select value={box ?? "mine"} onValueChange={selectBox}>
            <SelectTrigger className="w-72" aria-label="Mailbox">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ownBox && <SelectItem value="mine">Mine ({ownBox.address})</SelectItem>}
              {others.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name ? `${o.name} (${o.address})` : o.address}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {readOnly && (
            <span className="flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-1 text-amber-800 dark:text-amber-300">
              <ShieldCheckIcon className="size-4" /> Read-only. This opening is recorded and the person is told.
            </span>
          )}
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Mail folders" className="space-y-2">
          {!readOnly && (
            <Button className="w-full justify-start" onClick={newMessage}>
              <PencilIcon /> Compose
            </Button>
          )}
          {!readOnly && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <button type="button" className="text-primary hover:underline" onClick={() => setEditSig(signature)} data-edit-signature>
                Signature
              </button>
              <span className="text-muted-foreground">·</span>
              <button type="button" className="text-primary hover:underline" onClick={() => setEditPass(true)} data-edit-password>
                Password
              </button>
              <span className="text-muted-foreground">·</span>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={threads} onChange={(e) => setThreads(e.target.checked)} /> Conversations
              </label>
            </div>
          )}
          {editSig !== null && (
            <div className="space-y-1 rounded-lg border p-2" data-signature-form>
              <Textarea aria-label="Signature" rows={4} value={editSig} onChange={(e) => setEditSig(e.target.value)} placeholder={"Abebe Kebede\nEditing lead, Myseed"} />
              <div className="flex gap-1">
                <Button size="xs" onClick={async () => { const r = await saveSignatureAction(editSig); if (!r.ok) return void toast.error(r.error); setSignature(editSig); setEditSig(null); toast.success("Signature saved"); }}>
                  Save
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setEditSig(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {scheduled.length > 0 && (
            <div className="space-y-1 rounded-lg border p-2 text-xs" data-scheduled>
              <p className="font-medium">Scheduled ({scheduled.length})</p>
              {scheduled.map((m) => (
                <div key={m.id} className="space-y-0.5">
                  <p className="truncate">{m.subject}</p>
                  <p className={m.status === "failed" ? "text-destructive" : "text-muted-foreground"}>{m.status === "failed" ? `Not sent: ${m.error}` : `${new Date(m.send_at).toLocaleString([], { dateStyle: "short", timeStyle: "short", timeZone: tz })} to ${m.recipients}`}</p>
                  <button type="button" className="text-primary hover:underline" onClick={async () => { const r = await cancelScheduledAction(m.id); if (!r.ok) return void toast.error(r.error); toast.success("Not sent; it is back in Drafts"); void loadScheduled(); void loadFolders(); }}>
                    Cancel and keep as draft
                  </button>
                </div>
              ))}
            </div>
          )}
          <ul className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
            {(folders ?? []).map((f) => {
              const Icon = f.role ? ICON[f.role] : FolderIcon;
              const badge = f.role === "drafts" ? f.total : f.role === "sent" || f.role === "trash" || f.role === "archive" ? 0 : f.unread;
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    data-folder={f.role ?? f.name}
                    aria-current={f.path === folder ? "page" : undefined}
                    onClick={() => pickFolder(f.path)}
                    className={cn("flex w-full items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-left text-sm hover:bg-muted", f.path === folder && "bg-primary/10 font-semibold text-primary")}
                  >
                    <Icon className="size-4 shrink-0" />
                    <span className="flex-1 truncate">{f.name}</span>
                    {badge > 0 && <span className="text-xs tabular-nums">{badge}</span>}
                  </button>
                </li>
              );
            })}
            {!folders && !error && (
              <li className="flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Connecting…
              </li>
            )}
          </ul>
        </nav>

        <div className={cn("grid min-w-0 gap-3", open && "xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
          <section aria-label="Messages" className={cn("min-w-0 rounded-xl border bg-card", open && "hidden xl:block")}>
            <div className="flex flex-wrap items-center gap-2 border-b p-2">
              <Checkbox aria-label="Select all" checked={allChecked} onCheckedChange={(v) => setChecked(v ? rows.map((r) => r.uid) : [])} disabled={readOnly || !rows.length} />
              {checked.length > 0 && !readOnly ? (
                <BulkBar role={role} folders={folders ?? []} folder={folder} onAct={(a, to) => act(a, checked, to)} count={checked.length} />
              ) : (
                <>
                  <form
                    className="flex min-w-48 flex-1 items-center gap-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPage(0);
                      setQuery(q.trim());
                    }}
                  >
                    <div className="relative flex-1">
                      <SearchIcon className="pointer-events-none absolute top-2.5 left-2 size-4 text-muted-foreground" />
                      <Input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${current?.name ?? "mail"}`} className="pl-8" aria-label="Search mail" />
                    </div>
                    {query && (
                      <Button type="button" size="icon-sm" variant="ghost" aria-label="Clear search" onClick={() => (setQ(""), setQuery(""), setPage(0))}>
                        <XIcon />
                      </Button>
                    )}
                  </form>
                  <div className="flex gap-1">
                    {(["unread", "starred"] as const).map((k) => (
                      <Button key={k} size="sm" variant={only === k ? "secondary" : "ghost"} aria-pressed={only === k} onClick={() => (setOnly(only === k ? null : k), setPage(0))}>
                        {k === "unread" ? "Unread" : "Starred"}
                      </Button>
                    ))}
                  </div>
                  <Button size="icon-sm" variant="ghost" aria-label="Refresh" onClick={() => (void loadFolders(), void loadList())}>
                    <RefreshCwIcon className={cn(loading && "animate-spin")} />
                  </Button>
                </>
              )}
            </div>
            {error ? (
              <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4" role="alert">
                <p className="text-sm font-medium text-destructive">{error}</p>
                {!readOnly && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button size="xs" variant="default" onClick={() => setEditPass(true)}>
                      <KeyRoundIcon className="size-3.5" /> Enter / Update Mailbox Password
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => (void loadFolders(), void loadList())}>
                      <RefreshCwIcon className="size-3.5" /> Retry
                    </Button>
                  </div>
                )}
              </div>
            ) : loading && !rows.length ? (
              <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" /> Loading…
              </p>
            ) : !rows.length ? (
              <p className="p-6 text-center text-sm text-muted-foreground">{query || only ? "Nothing matches." : `${current?.name ?? "This folder"} is empty.`}</p>
            ) : (
              <ul className="divide-y" data-mail-list>
                {shown.map((r, i) => (
                  <li
                    key={r.uid}
                    data-mail-row={r.uid}
                    className={cn("group flex cursor-pointer items-center gap-2 px-2 py-2 text-sm hover:bg-muted/60", !r.seen && "bg-primary/[0.03]", open?.uid === r.uid && "bg-primary/10", i === cursor && "ring-1 ring-primary/40 ring-inset")}
                    onClick={() => (setCursor(i), void openMessage(r))}
                  >
                    <Checkbox aria-label="Select" checked={checked.includes(r.uid)} disabled={readOnly} onClick={(e) => e.stopPropagation()} onCheckedChange={(v) => setChecked((c) => (v ? [...c, ...(r.thread ?? [r.uid])] : c.filter((x) => !(r.thread ?? [r.uid]).includes(x))))} />
                    <button
                      type="button"
                      aria-label={r.flagged ? "Remove star" : "Star"}
                      disabled={readOnly}
                      onClick={(e) => (e.stopPropagation(), void act(r.flagged ? "unstar" : "star", [r.uid]))}
                      className="text-muted-foreground hover:text-amber-500"
                    >
                      <StarIcon className={cn("size-4", r.flagged && "fill-amber-400 text-amber-500")} />
                    </button>
                    {/* One line on wide screens; sender over subject when a message is open beside the list, or on phones. */}
                    <span className={cn("flex min-w-0 flex-1 flex-col", !open && "sm:flex-row sm:items-baseline sm:gap-2")}>
                      <span className={cn("flex min-w-0 items-baseline gap-2", !open && "sm:w-40 sm:shrink-0")}>
                        <span className={cn("min-w-0 flex-1 truncate", !r.seen && "font-semibold")}>{role === "sent" || role === "drafts" ? `To: ${r.to.join(", ") || "(nobody yet)"}` : who(r.from)}</span>
                        <span className={cn("shrink-0 text-xs tabular-nums", !open && "sm:hidden", !r.seen ? "font-semibold" : "text-muted-foreground")}>{when(r.date, tz)}</span>
                      </span>
                      <span className="flex min-w-0 flex-1 items-baseline gap-2">
                        <span className={cn("min-w-0 flex-1 truncate", !r.seen ? "font-semibold" : "text-muted-foreground")}>
                          {r.draft && role !== "drafts" && <span className="mr-1 text-destructive">Draft</span>}
                          {r.subject || "(no subject)"}
                          {(r.thread?.length ?? 1) > 1 && <span className="ml-1 rounded bg-muted px-1 text-xs font-normal text-muted-foreground" data-thread-count>{r.thread!.length}</span>}
                          {r.preview && <span className="ml-2 font-normal text-muted-foreground" data-mail-preview> {r.preview}</span>}
                        </span>
                        {r.attachments && <PaperclipIcon className="size-3.5 shrink-0 text-muted-foreground" aria-label="Has attachments" />}
                        <span className={cn("hidden shrink-0 text-xs tabular-nums", !open && "sm:inline", !r.seen ? "font-semibold" : "text-muted-foreground")}>{when(r.date, tz)}</span>
                      </span>
                    </span>
                    {opening === r.uid && <Loader2Icon className="size-4 animate-spin" />}
                  </li>
                ))}
              </ul>
            )}
            {total > 0 && (
              <div className="flex items-center justify-end gap-2 border-t p-2 text-xs text-muted-foreground">
                {page * 50 + 1}–{Math.min(total, page * 50 + rows.length)} of {total}
                <Button size="icon-xs" variant="ghost" aria-label="Newer" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeftIcon />
                </Button>
                <Button size="icon-xs" variant="ghost" aria-label="Older" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                  <ChevronRightIcon />
                </Button>
              </div>
            )}
          </section>

          {open && (
            <Reader
              m={open}
              box={box}
              role={role}
              tz={tz}
              readOnly={readOnly}
              folders={folders ?? []}
              onClose={() => setOpen(null)}
              onReply={(mode) => reply(open, mode)}
              onAct={(a, to) => act(a, [open.uid], to)}
              onImages={async () => {
                const r = await mailMessageAction({ box, folder, uid: open.uid, images: true });
                if (r.ok) setOpen(r.data!);
              }}
            />
          )}
        </div>
      </div>
      {compose && (
        <Compose
          initial={compose}
          box={box}
          from={ownBox?.address ?? ""}
          draftsPath={folders?.find((f) => f.role === "drafts")?.path ?? null}
          onClose={() => setCompose(null)}
          onDone={() => (void loadFolders(), current?.role === "sent" || current?.role === "drafts" ? void loadList(true) : null)}
          onReopen={(d) => setCompose(d)}
          onScheduled={() => void loadScheduled()}
        />
      )}
      {editPass && (
        <SetPasswordDialog
          boxAddress={box ? (others.find((o) => o.id === box)?.address ?? "this mailbox") : (ownBox?.address ?? "your mailbox")}
          boxId={box}
          onClose={() => setEditPass(false)}
          onSaved={() => {
            setEditPass(false);
            setError(null);
            void loadFolders();
            void loadList();
          }}
        />
      )}
    </div>
  );
}

function when(iso: string, tz: string) {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  if (day(d) === day(new Date())) return d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const sameYear = d.toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" }) === new Date().toLocaleDateString("en-GB", { timeZone: tz, year: "numeric" });
  return d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

function MoveTo({ folders, folder, onMove }: { folders: MailFolder[]; folder: string; onMove: (to: string) => void }) {
  const targets = folders.filter((f) => f.path !== folder && f.role !== "drafts" && f.role !== "sent");
  if (!targets.length) return null;
  return (
    <Select value="" onValueChange={onMove}>
      <SelectTrigger size="sm" className="w-32" aria-label="Move to">
        <SelectValue placeholder="Move to" />
      </SelectTrigger>
      <SelectContent>
        {targets.map((f) => (
          <SelectItem key={f.path} value={f.path}>
            {f.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BulkBar({ role, folders, folder, count, onAct }: { role: FolderRole | null; folders: MailFolder[]; folder: string; count: number; onAct: (a: MailAction, to?: string) => void }) {
  return (
    <div className="flex flex-1 flex-wrap items-center gap-1">
      <span className="mr-1 text-sm text-muted-foreground">{count} selected</span>
      {role !== "archive" && role !== "trash" && (
        <Button size="sm" variant="ghost" onClick={() => onAct("archive")}>
          <ArchiveIcon /> Archive
        </Button>
      )}
      {role === "junk" ? (
        <Button size="sm" variant="ghost" onClick={() => onAct("notjunk")}>
          <InboxIcon /> Not junk
        </Button>
      ) : role !== "sent" && role !== "drafts" ? (
        <Button size="sm" variant="ghost" onClick={() => onAct("junk")}>
          <OctagonAlertIcon /> Junk
        </Button>
      ) : null}
      {role === "trash" && (
        <Button size="sm" variant="ghost" onClick={() => onAct("restore")}>
          <InboxIcon /> Back to inbox
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => (role !== "trash" || window.confirm(`Delete ${count} for good?`)) && onAct("trash")}>
        <Trash2Icon /> {role === "trash" ? "Delete for good" : "Delete"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAct("read")}>
        <MailOpenIcon /> Read
      </Button>
      <Button size="sm" variant="ghost" onClick={() => onAct("unread")}>
        <MailIcon /> Unread
      </Button>
      <MoveTo folders={folders} folder={folder} onMove={(to) => onAct("move", to)} />
    </div>
  );
}

function Reader({
  m,
  box,
  role,
  tz,
  readOnly,
  folders,
  onClose,
  onReply,
  onAct,
  onImages,
}: {
  m: MailMessage;
  box: string | null;
  role: FolderRole | null;
  tz: string;
  readOnly: boolean;
  folders: MailFolder[];
  onClose: () => void;
  onReply: (mode: "reply" | "all" | "forward") => void;
  onAct: (a: MailAction, to?: string) => void;
  onImages: () => void;
}) {
  const frame = React.useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = React.useState(200);
  const [showImages, setShowImages] = React.useState(false);
  React.useEffect(() => setShowImages(false), [m.uid]);
  const fit = () => {
    const d = frame.current?.contentDocument;
    if (d?.body) setHeight(Math.min(20000, Math.max(120, d.documentElement.scrollHeight + 8)));
  };
  const att = (i: number, dl = false) => `/api/mail/attachment?${new URLSearchParams({ ...(box ? { box } : {}), folder: m.folder, uid: String(m.uid), i: String(i), ...(dl ? { dl: "1" } : {}) })}`;
  return (
    <article aria-label="Message" className="min-w-0 space-y-3 rounded-xl border bg-card p-3" data-mail-message={m.uid}>
      <div className="flex flex-wrap items-center gap-1">
        <Button size="sm" variant="ghost" onClick={onClose} aria-label="Back to the list">
          <ArrowLeftIcon />
        </Button>
        {!readOnly && (
          <>
            {role !== "archive" && role !== "trash" && (
              <Button size="sm" variant="ghost" onClick={() => onAct("archive")}>
                <ArchiveIcon /> Archive
              </Button>
            )}
            {role === "junk" ? (
              <Button size="sm" variant="ghost" onClick={() => onAct("notjunk")}>
                <InboxIcon /> Not junk
              </Button>
            ) : (
              role !== "sent" && (
                <Button size="sm" variant="ghost" onClick={() => onAct("junk")}>
                  <OctagonAlertIcon /> Junk
                </Button>
              )
            )}
            <Button size="sm" variant="ghost" onClick={() => (role !== "trash" || window.confirm("Delete this for good?")) && onAct("trash")}>
              <Trash2Icon /> {role === "trash" ? "Delete for good" : "Delete"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onAct("unread")}>
              <MailIcon /> Unread
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={m.flagged ? "Remove star" : "Star"} onClick={() => onAct(m.flagged ? "unstar" : "star")}>
              <StarIcon className={cn(m.flagged && "fill-amber-400 text-amber-500")} />
            </Button>
            <MoveTo folders={folders} folder={m.folder} onMove={(to) => onAct("move", to)} />
          </>
        )}
      </div>
      <h2 className="text-xl font-semibold break-words">{m.subject || "(no subject)"}</h2>
      <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
        <div className="min-w-0">
          <p>
            <span className="font-semibold">{who(m.from)}</span> <span className="text-muted-foreground">&lt;{m.from?.address}&gt;</span>
          </p>
          <p className="text-muted-foreground">
            To {m.to.map((a) => a.name || a.address).join(", ") || "(hidden)"}
            {m.cc.length > 0 && <> · Cc {m.cc.map((a) => a.name || a.address).join(", ")}</>}
          </p>
        </div>
        <span className="text-muted-foreground">{new Date(m.date).toLocaleString("en-GB", { timeZone: tz, dateStyle: "medium", timeStyle: "short" })}</span>
      </div>
      {m.remoteImages && !showImages && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
          <ImageIcon className="size-4" /> Pictures from outside are hidden, so the sender cannot tell you opened this.
          <Button size="sm" variant="outline" onClick={() => (setShowImages(true), onImages())}>
            Show images
          </Button>
        </div>
      )}
      {m.html ? (
        <iframe
          ref={frame}
          title="Message body"
          // No scripts can run; links open in a new tab. Same origin only so the height can be measured.
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={m.html}
          onLoad={fit}
          style={{ height }}
          className="w-full rounded-lg border bg-white"
        />
      ) : (
        <p className="text-sm text-muted-foreground">(This message has no text.)</p>
      )}
      {m.attachments.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Attachments">
          {m.attachments.map((a) => (
            <li key={a.index} className="flex items-center gap-2 rounded-lg border px-2 py-1 text-sm">
              <PaperclipIcon className="size-4 text-muted-foreground" />
              <a href={att(a.index)} target="_blank" rel="noreferrer" className="max-w-56 truncate hover:underline">
                {a.name}
              </a>
              <span className="text-xs text-muted-foreground">{fmtSize(a.size)}</span>
              <a href={att(a.index, true)} className="text-xs text-primary hover:underline" download>
                Download
              </a>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && role !== "drafts" && (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => onReply("reply")}>
            <ReplyIcon /> Reply
          </Button>
          {m.to.length + m.cc.length > 1 && (
            <Button variant="outline" onClick={() => onReply("all")}>
              <ReplyAllIcon /> Reply all
            </Button>
          )}
          <Button variant="outline" onClick={() => onReply("forward")}>
            <ForwardIcon /> Forward
          </Button>
        </div>
      )}
    </article>
  );
}

function Compose({ initial, box, from, draftsPath, onClose, onDone, onReopen, onScheduled }: { initial: Draft; box: string | null; from: string; draftsPath: string | null; onClose: () => void; onDone: () => void; onReopen: (d: Draft) => void; onScheduled?: () => void }) {
  const [d, setD] = React.useState<Draft>(initial);
  const [later, setLater] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"draft" | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const dirty = d.to !== initial.to || d.subject !== initial.subject || d.text !== initial.text || d.attachments.length !== initial.attachments.length;
  const payload = (x: Draft): MailCompose => ({ box, to: split(x.to), cc: split(x.cc), bcc: split(x.bcc), subject: x.subject, text: x.text, inReplyTo: x.inReplyTo, references: x.references, attachments: x.attachments, draftUid: x.draftUid, replied: x.replied, forward: x.forward ? { folder: x.forward.folder, uid: x.forward.uid } : null });

  const saveDraft = async (quiet = false) => {
    setBusy("draft");
    const r = await mailSaveDraftAction(payload(d));
    setBusy(null);
    if (!r.ok) return toast.error(r.error), false;
    set({ draftUid: r.data!.uid ?? null });
    if (!quiet) toast.success("Draft saved");
    onDone();
    return true;
  };

  const close = async () => {
    if (dirty && (d.to || d.subject || d.text.trim())) await saveDraft(true).then((ok) => ok && toast("Saved in Drafts"));
    onClose();
  };

  // Sent after a few seconds unless Undo is pressed; the window closes at once.
  const send = () => {
    if (!split(d.to).length && !split(d.cc).length && !split(d.bcc).length) return toast.error("Add at least one recipient.");
    const snapshot = d;
    onClose();
    let undone = false;
    const id = toast("Sending…", {
      duration: UNDO_MS,
      action: {
        label: "Undo",
        onClick: () => {
          undone = true;
          onReopen(snapshot);
        },
      },
    });
    window.setTimeout(async () => {
      if (undone) return;
      const r = await mailSendAction(payload(snapshot));
      toast.dismiss(id);
      if (!r.ok) {
        toast.error(r.error, { duration: 12000 });
        return onReopen(snapshot);
      }
      toast.success("Sent");
      onDone();
    }, UNDO_MS);
  };

  const size = d.attachments.reduce((n, a) => n + (a.base64.length * 3) / 4, 0);
  return (
    <Dialog open onOpenChange={(o) => !o && void close()}>
      <DialogContent className="sm:max-w-2xl" onKeyDown={(e) => (e.ctrlKey || e.metaKey) && e.key === "Enter" && (e.preventDefault(), send())}>
        <DialogHeader>
          <DialogTitle>{d.inReplyTo ? "Reply" : d.subject.startsWith("Fwd:") ? "Forward" : "New message"}</DialogTitle>
          <DialogDescription>From {from}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Input value={d.to} onChange={(e) => set({ to: e.target.value })} placeholder="To" aria-label="To" autoFocus={!d.to} />
            {!d.showCc && (
              <Button size="sm" variant="ghost" onClick={() => set({ showCc: true })}>
                Cc Bcc
              </Button>
            )}
          </div>
          {d.showCc && (
            <>
              <Input value={d.cc} onChange={(e) => set({ cc: e.target.value })} placeholder="Cc" aria-label="Cc" />
              <Input value={d.bcc} onChange={(e) => set({ bcc: e.target.value })} placeholder="Bcc" aria-label="Bcc" />
            </>
          )}
          <Input value={d.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Subject" aria-label="Subject" />
          <Textarea value={d.text} onChange={(e) => set({ text: e.target.value })} rows={12} aria-label="Message" autoFocus={!!d.to} className="font-[inherit]" />
          {d.forward && (
            <p className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <PaperclipIcon className="size-3.5" /> Forwarded with {d.forward.names.join(", ")}
              <button type="button" className="text-primary hover:underline" onClick={() => set({ forward: null })}>
                Leave out
              </button>
            </p>
          )}
          {d.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {d.attachments.map((a, i) => (
                <li key={`${a.name}-${i}`} className="flex items-center gap-1 rounded-lg border px-2 py-1 text-sm">
                  <PaperclipIcon className="size-3.5" /> <span className="max-w-48 truncate">{a.name}</span>
                  <button type="button" aria-label={`Remove ${a.name}`} onClick={() => set({ attachments: d.attachments.filter((_, j) => j !== i) })}>
                    <XIcon className="size-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              const added = await Promise.all(files.map(async (f) => ({ name: f.name, type: f.type || "application/octet-stream", base64: await fileToBase64(f), size: f.size })));
              if (size + added.reduce((n, a) => n + a.size, 0) > 20 * 1048576) return toast.error("Attachments are limited to 20 MB in total.");
              set({ attachments: [...d.attachments, ...added.map(({ size: _s, ...a }) => a)] });
            }}
          />
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => fileRef.current?.click()}>
              <PaperclipIcon /> Attach
            </Button>
            <Button variant="ghost" disabled={busy === "draft"} onClick={() => void saveDraft()}>
              {busy === "draft" && <Loader2Icon className="animate-spin" />} Save draft
            </Button>
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={async () => {
                if (d.draftUid && draftsPath) await mailActAction({ box, folder: draftsPath, uids: [d.draftUid], action: "delete" });
                onClose();
                onDone();
              }}
            >
              Discard
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1" data-send-later>
            {later !== null ? (
              <>
                <Input type="datetime-local" aria-label="Send at" className="h-9 w-52" value={later} onChange={(e) => setLater(e.target.value)} />
                <Button
                  variant="outline"
                  disabled={!later}
                  onClick={async () => {
                    const r = await mailScheduleAction(payload(d), new Date(later).toISOString());
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(`Scheduled for ${new Date(r.data!.sendAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`);
                    onClose();
                    onDone();
                    onScheduled?.();
                  }}
                >
                  Schedule
                </Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setLater(new Date(Date.now() + 36e5 - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 16))}>
                Send later
              </Button>
            )}
            <Button onClick={send}>
              <SendIcon /> Send
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SetPasswordDialog({ boxAddress, boxId, onClose, onSaved }: { boxAddress: string; boxId: string | null; onClose: () => void; onSaved: () => void }) {
  const [password, setPassword] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    if (!password.trim()) return toast.error("Enter the mailbox password.");
    setBusy(true);
    const r = await setMyMailboxPasswordAction(password.trim(), boxId);
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success("Mailbox password saved");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Set mailbox password</DialogTitle>
          <DialogDescription>
            Enter the password for <strong>{boxAddress}</strong>. The password is encrypted and used by the app to connect to your email.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <Label htmlFor="mb-client-pass">Mailbox Password</Label>
            <div className="relative">
              <Input
                id="mb-client-pass"
                type={show ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                className="pr-10"
              />
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                className="absolute right-1 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setShow(!show)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Use the email account&apos;s password from your mail hosting / webmail.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2Icon className="animate-spin" />} Save & Connect
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
