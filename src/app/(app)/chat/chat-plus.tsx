"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarSearchIcon,
  CheckCheckIcon,
  CheckIcon,
  FileIcon,
  FlagIcon,
  ForwardIcon,
  ImageIcon,
  LinkIcon,
  Loader2Icon,
  MailIcon,
  MapPinIcon,
  MessageCircleIcon,
  MicIcon,
  PhoneIcon,
  SearchIcon,
  SendIcon,
  UserIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserAvatar } from "@/components/app/primitives";
import { contactCardAction, forwardPlainAction, forwardTargetsAction, messageReadersAction, searchMessagesAction, sharedMediaAction } from "@/app/actions/chat-plus";
import { openDirectAction, peerKeyAction, sendMessageAction } from "@/app/actions/chat";
import { sendReportAction } from "@/app/actions/support";
import type { ChatGroupSummary, ChatMessage } from "@/server/chat";
import type { ContactCard } from "@/server/profiles";
import { cachedKey, conversationKey, decryptText, encryptText } from "@/lib/e2e";
import { Attachment, fileText } from "./chat-extras";
import { cn } from "@/lib/utils";

const COVER: Record<string, string> = {
  emerald: "from-emerald-600 to-teal-400",
  indigo: "from-indigo-600 to-sky-400",
  sunset: "from-orange-500 to-pink-500",
  ocean: "from-cyan-600 to-blue-500",
  rose: "from-rose-500 to-fuchsia-500",
  slate: "from-slate-700 to-slate-400",
  gold: "from-amber-500 to-yellow-300",
  violet: "from-violet-600 to-purple-400",
};

// ---------------------------------------------------------------------------
// Presence and seen ticks
// ---------------------------------------------------------------------------

export function presenceLabel(at: string | null | undefined) {
  if (!at) return "last seen a while ago";
  const ms = Date.now() - Date.parse(at);
  if (ms < 2 * 60e3) return "online";
  const min = Math.round(ms / 60e3);
  if (min < 60) return `last seen ${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `last seen ${h} h ago`;
  return `last seen ${new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
export const isOnline = (at: string | null | undefined) => !!at && Date.now() - Date.parse(at) < 2 * 60e3;

export function OnlineDot({ at, className }: { at: string | null | undefined; className?: string }) {
  return <span className={cn("block size-3 rounded-full border-2 border-card", isOnline(at) ? "bg-[var(--st-done-fg)]" : "bg-muted-foreground/40", className)} title={presenceLabel(at)} />;
}

// One tick: sent. Two: seen by everyone (direct chat) or by someone (group, with the count on hover).
export function Ticks({ seen, total, mine }: { seen: number; total: number; mine: boolean }) {
  if (!mine) return null;
  const all = total > 0 && seen >= total;
  return (
    <span title={seen ? `Seen by ${seen} of ${total}` : "Sent"} className={cn("inline-flex", all ? "text-sky-300" : "opacity-80")}>
      {seen ? <CheckCheckIcon className="size-3" /> : <CheckIcon className="size-3" />}
    </span>
  );
}

export function ReadersDialog({ messageId, onClose, timezone }: { messageId: string; onClose: () => void; timezone: string }) {
  const [rows, setRows] = React.useState<{ userId: string; name: string; readAt: string | null }[] | null>(null);
  React.useEffect(() => {
    void messageReadersAction(messageId).then((r) => (r.ok ? setRows(r.data as never) : toast.error(r.error)));
  }, [messageId]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Seen by</DialogTitle>
          <DialogDescription>When each person first saw this message.</DialogDescription>
        </DialogHeader>
        <ul className="max-h-80 space-y-1.5 overflow-auto text-sm">
          {rows === null && <li className="text-muted-foreground">Loading…</li>}
          {rows?.map((r) => (
            <li key={r.userId} className="flex items-center gap-2">
              <UserAvatar name={r.name} />
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              <span className={cn("text-xs", r.readAt ? "text-muted-foreground" : "text-muted-foreground/60")}>
                {r.readAt ? new Date(r.readAt).toLocaleString(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }) : "Not yet"}
              </span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Search and jump to a date
// ---------------------------------------------------------------------------

export function SearchSheet({
  open,
  onOpenChange,
  group,
  loaded,
  initialQuery,
  onJump,
  timezone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: ChatGroupSummary;
  // Messages already in view, readable (direct chats are decrypted in the browser).
  loaded: ChatMessage[];
  initialQuery?: string;
  onJump: (seq: number) => void;
  timezone: string;
}) {
  const [q, setQ] = React.useState(initialQuery ?? "");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [everywhere, setEverywhere] = React.useState(false);
  const [hits, setHits] = React.useState<{ id: string; groupId: string; groupName: string; seq: number; authorName: string; body: string; createdAt: string }[]>([]);
  const [busy, setBusy] = React.useState(false);
  const router = useRouter();
  React.useEffect(() => setQ(initialQuery ?? ""), [initialQuery]);
  const run = React.useCallback(async () => {
    const term = q.trim();
    if (term.length < 2) return setHits([]);
    if (group.kind === "direct" && !everywhere) {
      // End-to-end encrypted: searched here, in what this device has loaded and decrypted.
      const t = term.toLowerCase();
      setHits(
        loaded
          .filter((m) => !m.deletedAt && m.body.toLowerCase().includes(t) && (!from || m.createdAt >= from) && (!to || m.createdAt.slice(0, 10) <= to))
          .reverse()
          .map((m) => ({ id: m.id, groupId: m.groupId, groupName: group.name, seq: m.seq, authorName: m.authorName, body: m.body, createdAt: m.createdAt })),
      );
      return;
    }
    setBusy(true);
    const r = await searchMessagesAction({ q: term, groupId: everywhere ? null : group.id, from: from || null, to: to || null });
    setBusy(false);
    if (r.ok) setHits(r.data as never);
  }, [q, from, to, everywhere, group, loaded]);
  React.useEffect(() => {
    if (!open) return;
    const t = setTimeout(run, 300);
    return () => clearTimeout(t);
  }, [open, run]);
  const mark = (text: string) => {
    const i = text.toLowerCase().indexOf(q.trim().toLowerCase());
    if (i < 0) return text.slice(0, 160);
    const start = Math.max(0, i - 40);
    return (
      <>
        {start > 0 && "…"}
        {text.slice(start, i)}
        <mark className="rounded bg-primary/25 px-0.5 text-foreground">{text.slice(i, i + q.trim().length)}</mark>
        {text.slice(i + q.trim().length, i + 120)}
      </>
    );
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Search messages</SheetTitle>
          <SheetDescription>
            {group.kind === "direct" && !everywhere ? "This chat is end-to-end encrypted, so it is searched on your device. Load earlier messages to search further back." : "Words, names, #tags or @mentions."}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="pl-8" aria-label="Search messages" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={everywhere} onCheckedChange={(v) => setEverywhere(v === true)} /> All my groups and channels
          </label>
        </div>
        <ul className="flex-1 space-y-1 overflow-y-auto px-2 pb-4">
          {busy && (
            <li className="flex justify-center py-4">
              <Loader2Icon className="size-4 animate-spin" />
            </li>
          )}
          {hits.map((h) => (
            <li key={h.id}>
              <button
                type="button"
                className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onOpenChange(false);
                  if (h.groupId === group.id) onJump(h.seq);
                  else router.push(`/chat?g=${h.groupId}&seq=${h.seq}`);
                }}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{h.authorName}</span>
                  {h.groupId !== group.id && <span>in {h.groupName}</span>}
                  <span className="ml-auto">{new Date(h.createdAt).toLocaleString(undefined, { timeZone: timezone, dateStyle: "medium", timeStyle: "short" })}</span>
                </div>
                <div className="line-clamp-2">{mark(h.body)}</div>
              </button>
            </li>
          ))}
          {!busy && q.trim().length >= 2 && !hits.length && <li className="py-6 text-center text-sm text-muted-foreground">Nothing found.</li>}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

export function JumpToDate({ onJump }: { onJump: (date: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [date, setDate] = React.useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" title="Go to a date" aria-label="Go to a date">
          <CalendarSearchIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <Label htmlFor="jump-date">Show the chat from</Label>
        <Input id="jump-date" type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          {[
            ["Yesterday", 1],
            ["A week ago", 7],
            ["A month ago", 30],
          ].map(([l, d]) => (
            <Button key={l} size="xs" variant="outline" onClick={() => setDate(new Date(Date.now() - (d as number) * 864e5).toISOString().slice(0, 10))}>
              {l}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!date}
          onClick={() => {
            setOpen(false);
            onJump(date);
          }}
        >
          Go
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ---------------------------------------------------------------------------
// Shared media, files, voice and links (like a profile's media tabs)
// ---------------------------------------------------------------------------

type MediaTab = "media" | "files" | "voice" | "links";
const LINK_RE = /https?:\/\/[^\s<>"']+/gi;

export function MediaSheet({ open, onOpenChange, group, cryptoKey, viewerId, onJump }: { open: boolean; onOpenChange: (o: boolean) => void; group: ChatGroupSummary; cryptoKey: CryptoKey | null; viewerId: string; onJump: (seq: number) => void }) {
  const [tab, setTab] = React.useState<MediaTab>("media");
  const [rows, setRows] = React.useState<ChatMessage[] | null>(null);
  React.useEffect(() => {
    if (!open) return;
    setRows(null);
    void sharedMediaAction(group.id).then(async (r) => {
      if (!r.ok) return void toast.error(r.error);
      const list = r.data as ChatMessage[];
      // Encrypted direct chats: read the captions and texts here.
      if (group.kind === "direct" && cryptoKey)
        setRows(await Promise.all(list.map(async (m) => (m.encrypted && m.body ? { ...m, body: (await decryptText(cryptoKey, m.body)) ?? "" } : m))));
      else setRows(list);
    });
  }, [open, group.id, group.kind, cryptoKey]);
  const isMedia = (m: ChatMessage) => m.file && (m.file.kind === "image" || /^(image|video)\//.test(m.file.mime));
  const media = (rows ?? []).filter((m) => m.file && !m.file.gone && isMedia(m));
  const files = (rows ?? []).filter((m) => m.file && !m.file.gone && m.file.kind === "file" && !isMedia(m));
  const voice = (rows ?? []).filter((m) => m.file && m.file.kind === "voice");
  const links = (rows ?? []).flatMap((m) => [...new Set((m.file ? fileText(m).caption : m.body).match(LINK_RE) ?? [])].map((url) => ({ url, m })));
  const counts: Record<MediaTab, number> = { media: media.length, files: files.length, voice: voice.length, links: links.length };
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Shared in {group.name}</SheetTitle>
          <SheetDescription>Photos and videos, files, voice messages and links.</SheetDescription>
        </SheetHeader>
        <div className="px-4">
          <Tabs value={tab} onValueChange={(v) => setTab(v as MediaTab)}>
            <TabsList className="w-full">
              <TabsTrigger value="media">
                <ImageIcon className="size-3.5" /> Media {counts.media || ""}
              </TabsTrigger>
              <TabsTrigger value="files">
                <FileIcon className="size-3.5" /> Files {counts.files || ""}
              </TabsTrigger>
              <TabsTrigger value="voice">
                <MicIcon className="size-3.5" /> Voice {counts.voice || ""}
              </TabsTrigger>
              <TabsTrigger value="links">
                <LinkIcon className="size-3.5" /> Links {counts.links || ""}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {rows === null ? (
            <div className="flex justify-center py-8">
              <Loader2Icon className="size-5 animate-spin" />
            </div>
          ) : tab === "media" ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {media.map((m) => (
                <div key={m.id} className="overflow-hidden rounded-lg border bg-card p-1 text-xs">
                  <Attachment m={m} mine={false} viewerId={viewerId} cryptoKey={cryptoKey} onChanged={() => {}} />
                  <button type="button" className="mt-1 w-full truncate text-left text-muted-foreground hover:underline" onClick={() => (onOpenChange(false), onJump(m.seq))}>
                    {new Date(m.createdAt).toLocaleDateString()} · {m.authorName}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {(tab === "files" ? files : tab === "voice" ? voice : []).map((m) => (
                <li key={m.id} className="rounded-lg border bg-card p-2 text-sm">
                  <Attachment m={m} mine={false} viewerId={viewerId} cryptoKey={cryptoKey} onChanged={() => {}} />
                  <button type="button" className="mt-1 text-xs text-muted-foreground hover:underline" onClick={() => (onOpenChange(false), onJump(m.seq))}>
                    {m.authorName}, {new Date(m.createdAt).toLocaleString()} · show in chat
                  </button>
                </li>
              ))}
              {tab === "links" &&
                links.map(({ url, m }, i) => (
                  <li key={`${m.id}-${i}`} className="rounded-lg border bg-card p-2 text-sm">
                    <a href={url} target="_blank" rel="noreferrer noopener" className="block truncate text-primary hover:underline">
                      {url}
                    </a>
                    <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => (onOpenChange(false), onJump(m.seq))}>
                      {m.authorName}, {new Date(m.createdAt).toLocaleString()} · show in chat
                    </button>
                  </li>
                ))}
              {!counts[tab] && <li className="py-8 text-center text-sm text-muted-foreground">Nothing here yet.</li>}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Contact card: tapping a person shows their photo, status and contact details, as far as they allow
// ---------------------------------------------------------------------------

export function ContactSheet({ userId, onClose, onMedia }: { userId: string | null; onClose: () => void; onMedia?: () => void }) {
  const router = useRouter();
  const [c, setC] = React.useState<ContactCard | null>(null);
  const [reporting, setReporting] = React.useState(false);
  React.useEffect(() => {
    if (!userId) return;
    setC(null);
    void contactCardAction(userId).then((r) => (r.ok ? setC(r.data as ContactCard) : toast.error(r.error)));
  }, [userId]);
  const row = (icon: React.ReactNode, label: string, value: string | null, href?: string) =>
    value ? (
      <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel="noreferrer noopener" className={cn("flex items-center gap-3 rounded-lg px-3 py-2", href && "hover:bg-muted")}>
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{value}</span>
          <span className="block text-xs text-muted-foreground">{label}</span>
        </span>
      </a>
    ) : null;
  return (
    <Sheet open={!!userId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="sr-only">
          <SheetTitle>{c?.name ?? "Profile"}</SheetTitle>
          <SheetDescription>Contact details</SheetDescription>
        </SheetHeader>
        {!c ? (
          <div className="flex justify-center py-16">
            <Loader2Icon className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="flex flex-col overflow-y-auto">
            <div className={cn("h-24 bg-gradient-to-r", COVER[c.cover] ?? COVER.emerald)} />
            <div className="-mt-10 flex flex-col items-center gap-1 px-4 text-center">
              {c.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- small data URL photo
                <img src={c.avatar} alt="" className="size-20 rounded-full border-4 border-background object-cover" />
              ) : (
                <span className="rounded-full border-4 border-background bg-background">
                  <UserAvatar name={c.name} size="md" className="size-16 text-xl" />
                </span>
              )}
              <h2 className="text-lg font-semibold">{c.name}</h2>
              <p className={cn("text-xs", isOnline(c.lastActiveAt) ? "text-[var(--st-done-fg)]" : "text-muted-foreground")}>{presenceLabel(c.lastActiveAt)}</p>
              {c.headline && <p className="text-sm text-muted-foreground">{c.headline}</p>}
            </div>
            <div className="mt-3 flex justify-center gap-2 px-4">
              {!c.isSelf && (
                <Button
                  size="sm"
                  onClick={async () => {
                    const r = await openDirectAction(c.userId);
                    if (!r.ok) return void toast.error(r.error);
                    onClose();
                    router.push(`/chat?g=${r.data}`);
                  }}
                >
                  <MessageCircleIcon /> Message
                </Button>
              )}
              {c.phone && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`tel:${c.phone}`}>
                    <PhoneIcon /> Call
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href={`/people/${c.userId}`}>
                  <UserIcon /> Profile
                </Link>
              </Button>
            </div>
            <div className="mt-3 space-y-0.5 px-2 pb-3">
              {row(<span className="text-sm font-medium">@</span>, "Username", c.handle)}
              {row(<PhoneIcon className="size-4" />, "Mobile", c.phone, c.phone ? `tel:${c.phone}` : undefined)}
              {row(<PhoneIcon className="size-4" />, "Phone", c.phone2, c.phone2 ? `tel:${c.phone2}` : undefined)}
              {row(<MailIcon className="size-4" />, "Email", c.email, c.email ? `mailto:${c.email}` : undefined)}
              {row(<MailIcon className="size-4" />, "Work email", c.workEmail, c.workEmail ? `mailto:${c.workEmail}` : undefined)}
              {row(<SendIcon className="size-4" />, "Telegram", c.telegram ? `@${c.telegram}` : null, c.telegram ? `https://t.me/${c.telegram}` : undefined)}
              {row(<MessageCircleIcon className="size-4" />, "WhatsApp", c.whatsapp, c.whatsapp ? `https://wa.me/${c.whatsapp.replace(/[^\d]/g, "")}` : undefined)}
              {row(<MapPinIcon className="size-4" />, "Office", c.office)}
              {row(<MapPinIcon className="size-4" />, "Location", c.location)}
              {row(<UserIcon className="size-4" />, "Roles", c.roles.join(", "))}
            </div>
            <div className="flex flex-wrap gap-2 border-t px-4 py-3">
              {onMedia && (
                <Button size="sm" variant="ghost" onClick={onMedia}>
                  <ImageIcon /> Shared media
                </Button>
              )}
              {!c.isSelf && (
                <Button size="sm" variant="ghost" className="text-[var(--st-blocked-fg)]" onClick={() => setReporting(true)}>
                  <FlagIcon /> Report
                </Button>
              )}
            </div>
          </div>
        )}
        {reporting && c && <ReportDialog target={{ targetType: "user", targetId: c.userId, targetLabel: c.name }} onClose={() => setReporting(false)} />}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Report (safety)
// ---------------------------------------------------------------------------

export const REASONS: Record<string, string> = {
  harassment: "Harassment or bullying",
  hate: "Hate or discrimination",
  sexual: "Sexual content or advances",
  threat: "Threats or violence",
  privacy: "Sharing private information",
  spam: "Spam or scam",
  fraud: "Fraud or misuse of company resources",
  safety: "Health and safety risk",
  other: "Something else",
};

export function ReportDialog({ target, evidence, onClose }: { target: { targetType: "message" | "user" | "chat" | "other"; targetId?: string | null; targetLabel?: string | null }; evidence?: string | null; onClose: () => void }) {
  const [reason, setReason] = React.useState("harassment");
  const [details, setDetails] = React.useState("");
  const [share, setShare] = React.useState(!!evidence);
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Report{target.targetLabel ? `: ${target.targetLabel}` : ""}</DialogTitle>
          <DialogDescription>
            Goes to Admin only. The person reported is not told who reported them. Read the{" "}
            <Link href="/safety" className="underline">
              safety policy
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <Select value={reason} onValueChange={setReason}>
            <SelectTrigger className="w-full" aria-label="Reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(REASONS).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={4} placeholder="What happened? When? Who else saw it?" aria-label="Details" />
          {evidence && (
            <label className="flex items-start gap-2">
              <Checkbox checked={share} onCheckedChange={(v) => setShare(v === true)} className="mt-0.5" />
              <span>
                Include the message text, so Admin can read it (this chat is encrypted; Admin cannot see it otherwise).
                <span className="mt-1 block rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{evidence.slice(0, 300)}</span>
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              const r = await sendReportAction({ ...target, reason, details, evidence: share ? evidence : null });
              setBusy(false);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Report sent. Admin will look at it; you are told when it is handled.");
              onClose();
            }}
          >
            <FlagIcon /> Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Forward to one or many people, groups and channels
// ---------------------------------------------------------------------------

export function ForwardDialog({ message, plainText, sourceName, viewerId, onClose }: { message: ChatMessage; plainText: string; sourceName: string; viewerId: string; onClose: () => void }) {
  const [targets, setTargets] = React.useState<{ groups: { id: string; name: string; kind: "group" | "channel" }[]; people: { id: string; name: string; handle: string }[] } | null>(null);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    void forwardTargetsAction().then((r) => (r.ok ? setTargets(r.data as never) : toast.error(r.error)));
  }, []);
  const toggle = (k: string) => setPicked((s) => (s.has(k) ? new Set([...s].filter((x) => x !== k)) : new Set([...s, k])));
  const fromLabel = message.forwardedFrom ?? `${message.authorName} in ${sourceName}`;
  // Files from end-to-end encrypted chats stay there; their text can still be forwarded.
  const fileBlocked = !!message.file && message.file.encrypted;
  const send = async () => {
    setBusy(true);
    const groupIds = [...picked].filter((k) => k.startsWith("g:")).map((k) => k.slice(2));
    const userIds = [...picked].filter((k) => k.startsWith("u:")).map((k) => k.slice(2));
    let ok = 0;
    let failed = 0;
    if (groupIds.length) {
      if (message.encrypted) {
        // The text was decrypted on this device; groups and channels receive it as normal text.
        for (const gid of groupIds) {
          const r = await sendMessageAction({ groupId: gid, body: plainText, forwardedFrom: fromLabel });
          r.ok ? ok++ : failed++;
        }
      } else {
        const r = await forwardPlainAction(message.id, groupIds);
        if (r.ok) ok += (r.data as string[]).length;
        else {
          failed += groupIds.length;
          toast.error(r.error);
        }
      }
    }
    if (userIds.length) {
      const pk = await cachedKey(viewerId);
      for (const uid of userIds) {
        try {
          if (!pk) throw new Error("locked");
          const g = await openDirectAction(uid);
          const peer = await peerKeyAction(uid);
          if (!g.ok || !peer.ok || !peer.data) throw new Error("no key");
          const key = await conversationKey(pk, peer.data as string);
          const body = await encryptText(key, plainText || "(forwarded attachment)");
          const r = await sendMessageAction({ groupId: g.data as string, body, encrypted: true, forwardedFrom: fromLabel });
          r.ok ? ok++ : failed++;
        } catch {
          failed++;
        }
      }
    }
    setBusy(false);
    if (ok) toast.success(`Forwarded to ${ok} ${ok === 1 ? "chat" : "chats"}${failed ? `; ${failed} could not be reached (secure chat not set up there yet)` : ""}`);
    else toast.error("Could not forward. Open a direct chat with them first, so secure chat is set up.");
    if (ok) onClose();
  };
  const needle = q.trim().toLowerCase();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Forward</DialogTitle>
          <DialogDescription className="line-clamp-2">{plainText || (message.file ? `File: ${fileText(message).name ?? "attachment"}` : "")}</DialogDescription>
        </DialogHeader>
        {fileBlocked && <p className="rounded bg-muted px-3 py-2 text-xs text-muted-foreground">Files from encrypted direct chats stay in that chat. The caption is forwarded.</p>}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, groups, channels" aria-label="Search" />
        <div className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {!targets && <Loader2Icon className="mx-auto size-4 animate-spin" />}
          {targets?.groups
            .filter((g) => !needle || g.name.toLowerCase().includes(needle))
            .map((g) => (
              <label key={g.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={picked.has(`g:${g.id}`)} onCheckedChange={() => toggle(`g:${g.id}`)} />
                <span className="flex-1 truncate">{g.name}</span>
                <span className="text-xs text-muted-foreground">{g.kind === "channel" ? "Channel" : "Group"}</span>
              </label>
            ))}
          {!fileBlocked &&
            targets?.people
              .filter((p) => !needle || `${p.name} ${p.handle}`.toLowerCase().includes(needle))
              .map((p) => (
                <label key={p.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted">
                  <Checkbox checked={picked.has(`u:${p.id}`)} onCheckedChange={() => toggle(`u:${p.id}`)} />
                  <UserAvatar name={p.name} />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground">@{p.handle}</span>
                </label>
              ))}
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">{picked.size} chosen</span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={busy || !picked.size}>
            {busy ? <Loader2Icon className="animate-spin" /> : <ForwardIcon />} Forward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// @mention picker for the message box
// ---------------------------------------------------------------------------

export function MentionPicker({ text, members, onPick }: { text: string; members: { handle: string; name: string }[]; onPick: (handle: string) => void }) {
  const m = text.match(/(?:^|\s)@([a-z0-9._-]*)$/i);
  if (!m) return null;
  const q = m[1]!.toLowerCase();
  const list = [{ handle: "all", name: "Everyone in this chat" }, ...members].filter((x) => x.handle.toLowerCase().startsWith(q) || x.name.toLowerCase().includes(q)).slice(0, 6);
  if (!list.length) return null;
  return (
    <div className="mx-auto mb-1 max-w-3xl overflow-hidden rounded-lg border bg-popover shadow-md" role="listbox" aria-label="Mention someone">
      {list.map((x) => (
        <button key={x.handle} type="button" role="option" aria-selected={false} className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-muted" onMouseDown={(e) => (e.preventDefault(), onPick(x.handle))}>
          <UserAvatar name={x.name} />
          <span className="flex-1 truncate">{x.name}</span>
          <span className="text-xs text-muted-foreground">@{x.handle}</span>
        </button>
      ))}
    </div>
  );
}
