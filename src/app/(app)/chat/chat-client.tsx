"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArrowLeftIcon,
  BarChart3Icon,
  CheckCircle2Icon,
  CompassIcon,
  MegaphoneIcon,
  BellOffIcon,
  BellIcon,
  CornerUpLeftIcon,
  InfoIcon,
  LockIcon,
  LogOutIcon,
  MessagesSquareIcon,
  SquarePenIcon,
  RotateCcwIcon,
  HelpCircleIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  SearchIcon,
  SendHorizontalIcon,
  ShieldIcon,
  Trash2Icon,
  UserMinusIcon,
  UsersIcon,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MultiSelect } from "@/components/app/multi-select";
import { UserAvatar } from "@/components/app/primitives";
import {
  createGroupAction,
  openDirectAction,
  deleteMessageAction,
  editMessageAction,
  groupInfoAction,
  joinGroupAction,
  leaveGroupAction,
  muteGroupAction,
  olderMessagesAction,
  pinMessageAction,
  pollMessagesAction,
  sendMessageAction,
  setMemberRoleAction,
  setMembersAction,
  updateGroupAction,
} from "@/app/actions/chat";
import type { ChatGroupSummary, ChatMember, ChatMessage } from "@/server/chat";
import { ROLE_LABELS, type Role } from "@/lib/domain";
import { initials } from "@/lib/format";
import { decryptText, encryptText, isEnvelope } from "@/lib/e2e";
import { answerQuestionAction } from "@/app/actions/collab";
import { PushToggle } from "@/components/app/push-toggle";
import {
  AttachButton,
  Attachment,
  CallButton,
  CallCard,
  DiscoverChannelsDialog,
  EmojiPicker,
  InviteSection,
  NewChannelDialog,
  PollCard,
  PollDialog,
  QuickReact,
  ReactionBar,
  VoiceRecorder,
  fileText,
  gifUrl,
  isJumbo,
} from "./chat-extras";
import { SecureGate, useSecureChat } from "./secure";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; handle: string; roles: Role[] };

const COLORS = ["#7b68ee", "#3b82f6", "#06b6d4", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];
const NAME_COLORS = ["#7b68ee", "#e2445c", "#0ea5e9", "#16a34a", "#d97706", "#9333ea", "#0891b2", "#be185d"];

function nameColor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return NAME_COLORS[h % NAME_COLORS.length];
}

function GroupAvatar({ name, color, size = 44 }: { name: string; color: string | null; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ background: color ?? "#7b68ee", width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

function timeLabel(iso: string, tz: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toLocaleDateString("en-CA", { timeZone: tz }) === now.toLocaleDateString("en-CA", { timeZone: tz });
  if (sameDay) return d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
  const days = (now.getTime() - d.getTime()) / 864e5;
  if (days < 6) return d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short" });
  return d.toLocaleDateString("en-GB", { timeZone: tz, day: "numeric", month: "short" });
}

function dayLabel(iso: string, tz: string) {
  const key = (x: Date) => x.toLocaleDateString("en-CA", { timeZone: tz });
  const d = new Date(iso);
  if (key(d) === key(new Date())) return "Today";
  if (key(d) === key(new Date(Date.now() - 864e5))) return "Yesterday";
  return d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "long", day: "numeric", month: "long" });
}

// Light formatting: @mentions, links and line breaks.
function Body({ text, mine }: { text: string; mine: boolean }) {
  const parts = text.split(/(@[a-z0-9._-]+|https?:\/\/\S+)/gi);
  return (
    <span className="break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^@/.test(p) ? (
          <span key={i} className={cn("font-medium", mine ? "text-white underline decoration-white/40" : "text-primary")}>
            {p}
          </span>
        ) : /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            {p}
          </a>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </span>
  );
}

export function ChatClient({
  viewer,
  canManage,
  canCreateChannel,
  groups: initialGroups,
  activeId,
  initialMessages,
  directory,
  timezone,
}: {
  viewer: { id: string; name: string; handle: string };
  canManage: boolean;
  canCreateChannel: boolean;
  groups: ChatGroupSummary[];
  activeId: string | null;
  initialMessages: ChatMessage[];
  directory: Person[];
  timezone: string;
}) {
  const router = useRouter();
  const [groups, setGroups] = React.useState(initialGroups);
  const [q, setQ] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [directOpen, setDirectOpen] = React.useState(false);
  const [channelOpen, setChannelOpen] = React.useState(false);
  const [discoverOpen, setDiscoverOpen] = React.useState(false);
  const names = React.useMemo(() => Object.fromEntries(directory.map((p) => [p.id, p.name])), [directory]);
  React.useEffect(() => setGroups(initialGroups), [initialGroups]);
  const active = groups.find((g) => g.id === activeId) ?? null;
  const shown = groups.filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()) || g.lastMessage?.body.toLowerCase().includes(q.toLowerCase()));

  // Keep the list fresh while the page is open.
  React.useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && router.refresh(), 30000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="-mx-3 -my-4 flex h-[calc(100dvh-3.5rem)] overflow-hidden border-t bg-card sm:-mx-6 sm:-my-6">
      {/* Group list */}
      <aside className={cn("flex w-full shrink-0 flex-col border-r md:w-80 lg:w-96", active && "hidden md:flex")}>
        <div className="flex items-center gap-2 border-b p-3">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" className="h-9 rounded-full bg-muted/60 pl-8" />
          </div>
          <Button size="icon" variant="ghost" className="rounded-full" onClick={() => setDirectOpen(true)} aria-label="New direct message" title="New direct message (end-to-end encrypted)">
            <SquarePenIcon />
          </Button>
          <PushToggle compact />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="rounded-full" aria-label="New group or channel" title="New group or channel">
                <PlusIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canManage && (
                <DropdownMenuItem onClick={() => setCreating(true)}>
                  <UsersIcon /> New group
                </DropdownMenuItem>
              )}
              {canCreateChannel && (
                <DropdownMenuItem onClick={() => setChannelOpen(true)}>
                  <MegaphoneIcon /> New channel
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setDiscoverOpen(true)}>
                <CompassIcon /> Find channels
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {shown.map((g) => (
            <li key={g.id}>
              <Link
                href={`/chat?g=${g.id}`}
                scroll={false}
                className={cn("flex items-center gap-3 px-3 py-2.5 hover:bg-muted/60", g.id === activeId && "bg-primary/10 hover:bg-primary/10", g.archived && "opacity-60")}
              >
                {g.kind === "direct" ? (
                  <span className="relative shrink-0">
                    <UserAvatar name={g.name} size="md" className="size-11 text-sm" />
                    <LockIcon className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-card p-0.5 text-[var(--st-done-fg)]" />
                  </span>
                ) : g.kind === "channel" ? (
                  <span className="relative shrink-0">
                    <GroupAvatar name={g.name} color={g.color} />
                    <MegaphoneIcon className="absolute -right-0.5 -bottom-0.5 size-4 rounded-full bg-card p-0.5 text-primary" />
                  </span>
                ) : (
                  <GroupAvatar name={g.name} color={g.color} />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate font-medium">{g.name}</span>
                    {g.muted && <BellOffIcon className="size-3 shrink-0 text-muted-foreground" />}
                    {g.archived && <ArchiveIcon className="size-3 shrink-0 text-muted-foreground" />}
                    <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{g.lastMessage ? timeLabel(g.lastMessage.at, timezone) : ""}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm text-muted-foreground">
                      {g.lastMessage ? (
                        <>
                          <span className="text-foreground/80">{g.lastMessage.author.split(" ")[0]}: </span>
                          {g.lastMessage.body}
                        </>
                      ) : g.myRole ? (
                        "No messages yet"
                      ) : (
                        "You are not a member"
                      )}
                    </span>
                    {g.unread > 0 && (
                      <span className={cn("ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold text-white", g.muted ? "bg-muted-foreground/60" : "bg-primary")}>
                        {g.unread > 99 ? "99+" : g.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {!shown.length && (
            <li className="p-6 text-center text-sm text-muted-foreground">{groups.length ? "No groups match." : "You are not in any group yet. A manager can add you."}</li>
          )}
        </ul>
      </aside>

      {/* Conversation */}
      <section className={cn("min-w-0 flex-1 flex-col", active ? "flex" : "hidden md:flex")}>
        {active ? (
          <Conversation
            key={active.id}
            group={active}
            viewer={viewer}
            initialMessages={initialMessages}
            canManage={active.kind !== "direct" && (canManage || active.myRole === "admin")}
            directory={directory}
            names={names}
            timezone={timezone}
          />
        ) : (
          <div className="chat-wallpaper flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <MessagesSquareIcon className="size-10 opacity-40" />
            <p className="text-sm">Select a group to start chatting</p>
          </div>
        )}
      </section>

      {creating && <NewGroupDialog directory={directory} viewerId={viewer.id} onClose={() => setCreating(false)} onCreated={(id) => router.push(`/chat?g=${id}`)} />}
      {channelOpen && <NewChannelDialog directory={directory} viewerId={viewer.id} onClose={() => setChannelOpen(false)} onCreated={(id) => router.push(`/chat?g=${id}`)} />}
      {discoverOpen && <DiscoverChannelsDialog onClose={() => setDiscoverOpen(false)} />}
      {directOpen && <NewDirectDialog directory={directory} viewerId={viewer.id} onClose={() => setDirectOpen(false)} onOpen={(id) => router.push(`/chat?g=${id}`)} />}
    </div>
  );
}

function Conversation({
  group,
  viewer,
  initialMessages,
  canManage,
  directory,
  names,
  timezone,
}: {
  group: ChatGroupSummary;
  viewer: { id: string; name: string; handle: string };
  initialMessages: ChatMessage[];
  canManage: boolean;
  directory: Person[];
  names: Record<string, string>;
  timezone: string;
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState(initialMessages);
  const [pollOpen, setPollOpen] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [text, setText] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<ChatMessage | null>(null);
  const [editing, setEditing] = React.useState<ChatMessage | null>(null);
  const [infoOpen, setInfoOpen] = React.useState(false);
  const [hasOlder, setHasOlder] = React.useState(initialMessages.length >= 80);
  const [sending, setSending] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const since = React.useRef(new Date().toISOString());
  const stick = React.useRef(true);
  const member = !!group.myRole;
  const secure = useSecureChat(group.kind === "direct" ? viewer.id : null, group.peer?.id ?? null);
  const [plain, setPlain] = React.useState<Record<string, string | null>>({});
  // Decrypt direct messages (and encrypted reply previews) as they arrive.
  React.useEffect(() => {
    if (!secure.key) return;
    const todo = messages.flatMap((m) => [
      ...(m.encrypted && !m.deletedAt && !(m.id + m.body in plain) ? [[m.id + m.body, m.body] as const] : []),
      ...(m.replyTo && isEnvelope(m.replyTo.body) && !(m.replyTo.id + m.replyTo.body in plain) ? [[m.replyTo.id + m.replyTo.body, m.replyTo.body] as const] : []),
    ]);
    if (!todo.length) return;
    let live = true;
    void Promise.all(todo.map(async ([k, b]) => [k, await decryptText(secure.key!, b)] as const)).then((out) => {
      if (live) setPlain((p) => ({ ...p, ...Object.fromEntries(out) }));
    });
    return () => {
      live = false;
    };
  }, [messages, secure.key, plain]);
  const shown = (m: ChatMessage): ChatMessage =>
    group.kind !== "direct"
      ? m
      : {
          ...m,
          body: m.encrypted && !m.deletedAt ? (plain[m.id + m.body] ?? (secure.key ? "Unable to decrypt this message" : "Locked")) : m.body,
          replyTo: m.replyTo && isEnvelope(m.replyTo.body) ? { ...m.replyTo, body: plain[m.replyTo.id + m.replyTo.body] ?? "Encrypted message" } : m.replyTo,
        };

  const lastSeq = messages.length ? messages[messages.length - 1].seq : 0;
  const lastSeqRef = React.useRef(lastSeq);
  lastSeqRef.current = lastSeq;

  const merge = React.useCallback((fresh: ChatMessage[], changed: ChatMessage[] = []) => {
    setMessages((cur) => {
      const map = new Map(cur.map((m) => [m.id, m]));
      for (const m of [...fresh, ...changed]) map.set(m.id, m);
      return [...map.values()].sort((a, b) => a.seq - b.seq);
    });
  }, []);

  const poll = React.useCallback(async () => {
    const r = await pollMessagesAction({ groupId: group.id, afterSeq: lastSeqRef.current, since: since.current });
    if (!r.ok || !r.data) return;
    since.current = r.data.at;
    if (r.data.fresh.length || r.data.changed.length) merge(r.data.fresh, r.data.changed);
  }, [group.id, merge]);

  React.useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 5000);
    return () => clearInterval(t);
  }, [poll]);

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    const wire = group.kind === "direct" ? (secure.key ? await encryptText(secure.key, body) : null) : body;
    if (!wire) {
      setSending(false);
      return toast.error("Unlock secure chat first.");
    }
    if (editing) {
      const r = await editMessageAction(editing.id, wire);
      setSending(false);
      if (!r.ok) return toast.error(r.error);
      merge([], [{ ...editing, body: wire, editedAt: new Date().toISOString() }]);
      setEditing(null);
      setText("");
      return;
    }
    const r = await sendMessageAction({ groupId: group.id, body: wire, replyToId: replyTo?.id ?? null, encrypted: group.kind === "direct" });
    setSending(false);
    if (!r.ok) return toast.error(r.error);
    setText("");
    setReplyTo(null);
    stick.current = true;
    await poll();
    input.current?.focus();
  }

  // Stickers, GIFs and other one-tap messages (encrypted in direct chats).
  async function sendRaw(raw: string) {
    const wire = group.kind === "direct" ? (secure.key ? await encryptText(secure.key, raw) : null) : raw;
    if (!wire) return toast.error("Unlock secure chat first.");
    const r = await sendMessageAction({ groupId: group.id, body: wire, replyToId: replyTo?.id ?? null, encrypted: group.kind === "direct" });
    if (!r.ok) return toast.error(r.error);
    setReplyTo(null);
    stick.current = true;
    await poll();
  }
  const sent = React.useCallback(() => {
    stick.current = true;
    void poll();
  }, [poll]);

  async function loadOlder() {
    const first = messages[0];
    if (!first) return;
    const el = scroller.current;
    const before = el?.scrollHeight ?? 0;
    const r = await olderMessagesAction(group.id, first.seq);
    if (!r.ok || !r.data) return;
    if (r.data.length < 60) setHasOlder(false);
    stick.current = false;
    merge(r.data);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - before;
    });
  }

  const pinned = [...messages].reverse().find((m) => m.pinned && !m.deletedAt);

  return (
    <>
      <header className="flex items-center gap-3 border-b px-3 py-2">
        <Button size="icon" variant="ghost" className="md:hidden" asChild aria-label="Back to groups">
          <Link href="/chat">
            <ArrowLeftIcon />
          </Link>
        </Button>
        <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setInfoOpen(true)}>
          <GroupAvatar name={group.name} color={group.color} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{group.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {group.kind === "direct" ? (
                <span className="inline-flex items-center gap-1 text-[var(--st-done-fg)]">
                  <LockIcon className="size-3" /> End-to-end encrypted · @{group.peer?.handle}
                </span>
              ) : group.kind === "channel" ? (
                <>
                  Channel · {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                  {group.description ? ` · ${group.description}` : ""}
                </>
              ) : (
                <>
                  {group.memberCount} member{group.memberCount === 1 ? "" : "s"}
                  {group.description ? ` · ${group.description}` : ""}
                </>
              )}
            </span>
          </span>
        </button>
        {member && group.canPost && <CallButton group={group} cryptoKey={secure.key} onSent={sent} />}
        {member && (
          <Button
            size="icon"
            variant="ghost"
            title={group.muted ? "Unmute" : "Mute"}
            onClick={async () => {
              const r = await muteGroupAction(group.id, !group.muted);
              if (!r.ok) return toast.error(r.error);
              router.refresh();
            }}
          >
            {group.muted ? <BellOffIcon /> : <BellIcon />}
          </Button>
        )}
        <Button size="icon" variant="ghost" title="Group info" onClick={() => setInfoOpen(true)}>
          <InfoIcon />
        </Button>
      </header>

      {pinned && (
        <button
          className="flex items-center gap-2 border-b bg-muted/40 px-4 py-1.5 text-left text-xs"
          onClick={() => document.getElementById(`m-${pinned.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
        >
          <PinIcon className="size-3.5 shrink-0 text-primary" />
          <span className="font-medium text-primary">Pinned</span>
          <span className="truncate text-muted-foreground">{shown(pinned).body}</span>
        </button>
      )}

      <div
        ref={scroller}
        className="chat-wallpaper flex-1 overflow-y-auto px-2 py-3 sm:px-6"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-0.5">
          {hasOlder && (
            <Button size="sm" variant="ghost" className="mx-auto mb-2 rounded-full bg-card/80 text-xs" onClick={loadOlder}>
              Load earlier messages
            </Button>
          )}
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const newDay = !prev || dayLabel(prev.createdAt, timezone) !== dayLabel(m.createdAt, timezone);
            const grouped = !newDay && prev && prev.authorId === m.authorId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60e3;
            const system = /^(.+ (created the group|left the group)\.|.+ (added|removed) .+\.)$/.test(m.body) && m.body.startsWith(m.authorName);
            return (
              <React.Fragment key={m.id}>
                {newDay && (
                  <div className="sticky top-0 z-10 my-2 flex justify-center">
                    <span className="rounded-full bg-foreground/45 px-2.5 py-0.5 text-[11px] font-medium text-background backdrop-blur">{dayLabel(m.createdAt, timezone)}</span>
                  </div>
                )}
                {system ? (
                  <div className="my-1 flex justify-center">
                    <span className="rounded-full bg-foreground/35 px-2.5 py-0.5 text-[11px] text-background">{m.body}</span>
                  </div>
                ) : (
                  <Bubble
                    m={shown(m)}
                    mine={m.authorId === viewer.id}
                    grouped={!!grouped}
                    canManage={canManage}
                    canPin={group.kind === "direct" ? member : canManage}
                    canReact={member}
                    viewerId={viewer.id}
                    names={names}
                    cryptoKey={secure.key}
                    timezone={timezone}
                    onAnswer={async (questionId, answer) => {
                      const r = await answerQuestionAction(questionId, answer);
                      if (!r.ok) {
                        toast.error(r.error);
                        return;
                      }
                      setReplyTo(m);
                      const body = `Answer: ${answer}`;
                      const wire = group.kind === "direct" ? (secure.key ? await encryptText(secure.key, body) : null) : body;
                      if (wire) await sendMessageAction({ groupId: group.id, body: wire, replyToId: m.id, encrypted: group.kind === "direct" });
                      setReplyTo(null);
                      toast.success("Answered");
                      await poll();
                    }}
                    onReply={() => {
                      setReplyTo(m);
                      setEditing(null);
                      input.current?.focus();
                    }}
                    onEdit={() => {
                      setEditing(m);
                      setReplyTo(null);
                      setText(shown(m).body);
                      input.current?.focus();
                    }}
                    onChanged={(patch) => merge([], [{ ...m, ...patch }])}
                  />
                )}
              </React.Fragment>
            );
          })}
          {!messages.length && <p className="py-10 text-center text-sm text-muted-foreground">No messages yet. Say hello.</p>}
        </div>
      </div>

      {group.kind === "direct" && secure.state !== "ready" ? (
        <SecureGate secure={secure} peerName={group.peer?.name ?? "this person"} />
      ) : member && !group.canPost ? (
        <footer className="flex items-center justify-center gap-2 border-t p-3 text-sm text-muted-foreground">
          <MegaphoneIcon className="size-4" /> Only channel admins post here. React to posts with the smile button.
        </footer>
      ) : member ? (
        <footer className="border-t bg-card px-2 py-2 sm:px-4">
          {(replyTo || editing) && (
            <div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 border-l-2 border-primary pl-2 text-xs">
              {editing ? <PencilIcon className="size-3.5 text-primary" /> : <CornerUpLeftIcon className="size-3.5 text-primary" />}
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-primary">{editing ? "Edit message" : `Reply to ${replyTo!.authorName}`}</span>
                <span className="block truncate text-muted-foreground">{shown((editing ?? replyTo)!).body}</span>
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="size-6"
                onClick={() => {
                  setReplyTo(null);
                  if (editing) setText("");
                  setEditing(null);
                }}
              >
                <XIcon />
              </Button>
            </div>
          )}
          <div className="mx-auto flex max-w-3xl items-end gap-1">
            {!recording && !editing && (
              <>
                <AttachButton group={group} cryptoKey={secure.key} onSent={sent} />
                <EmojiPicker
                  onEmoji={(e) => {
                    setText((t) => t + e);
                    input.current?.focus();
                  }}
                  onSticker={(e) => void sendRaw(e)}
                  onGif={(g) => void sendRaw(g.url)}
                />
                {group.kind !== "direct" && (
                  <Button size="icon" variant="ghost" className="size-10 shrink-0 rounded-full" onClick={() => setPollOpen(true)} aria-label="New poll" title="New poll">
                    <BarChart3Icon />
                  </Button>
                )}
              </>
            )}
            {!recording && (
            <Textarea
              ref={input}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
                if (e.key === "Escape") {
                  setReplyTo(null);
                  setEditing(null);
                }
              }}
              placeholder="Message (Enter to send, Shift+Enter for a new line, @name to mention)"
              className="max-h-40 min-h-10 resize-none rounded-2xl bg-muted/50 py-2.5"
            />
            )}
            {text.trim() || editing ? (
              <Button size="icon" className="size-10 shrink-0 rounded-full" disabled={!text.trim() || sending} onClick={send} aria-label="Send">
                <SendHorizontalIcon />
              </Button>
            ) : (
              <VoiceRecorder group={group} cryptoKey={secure.key} onSent={sent} onRecording={setRecording} />
            )}
          </div>
        </footer>
      ) : (
        <footer className="flex items-center justify-center gap-2 border-t p-3 text-sm text-muted-foreground">
          You are viewing this group as a manager.
          <Button
            size="sm"
            onClick={async () => {
              const r = await joinGroupAction(group.id);
              if (!r.ok) return toast.error(r.error);
              router.refresh();
            }}
          >
            Join group
          </Button>
        </footer>
      )}

      {pollOpen && <PollDialog groupId={group.id} onClose={() => setPollOpen(false)} onSent={sent} />}
      {group.kind !== "direct" && <GroupInfo open={infoOpen} onOpenChange={setInfoOpen} group={group} canManage={canManage} directory={directory} viewerId={viewer.id} timezone={timezone} />}
    </>
  );
}

function Bubble({
  m,
  mine,
  grouped,
  canManage,
  canPin,
  canReact,
  viewerId,
  names,
  cryptoKey,
  timezone,
  onReply,
  onEdit,
  onChanged,
  onAnswer,
}: {
  m: ChatMessage;
  mine: boolean;
  grouped: boolean;
  canManage: boolean;
  canPin: boolean;
  canReact: boolean;
  viewerId: string;
  names: Record<string, string>;
  cryptoKey: CryptoKey | null;
  timezone: string;
  onReply: () => void;
  onEdit: () => void;
  onChanged: (patch: Partial<ChatMessage>) => void;
  onAnswer: (questionId: string, answer: string) => Promise<void>;
}) {
  const time = new Date(m.createdAt).toLocaleTimeString("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit" });
  const [answering, setAnswering] = React.useState(false);
  const [answer, setAnswer] = React.useState("");
  const gif = !m.deletedAt && m.kind === "text" ? gifUrl(m.body) : null;
  const sticker = !m.deletedAt && m.kind === "text" && !m.replyTo && isJumbo(m.body);
  const caption = m.kind === "file" || m.kind === "voice" ? fileText(m).caption : m.body;
  const q = m.kind === "question" ? (m.meta as { questionId?: string; questionStatus?: string; questionOwnerId?: string; questionAnswer?: string | null } | null) : null;
  const editable = mine && (m.kind === "text" || m.kind === "file") && !gif && !m.file?.encrypted;

  return (
    <div id={`m-${m.id}`} className={cn("flex flex-col", !grouped && "mt-2")}>
      <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
        {!mine && <span className="w-8 shrink-0">{!grouped && <UserAvatar name={m.authorName} />}</span>}
        {sticker ? (
          <div className="relative px-1 text-5xl leading-tight" title={time}>
            {m.body}
            <span className="ml-1 align-bottom text-[10px] text-muted-foreground">{time}</span>
          </div>
        ) : (
          <div className={cn("relative max-w-[82%] rounded-2xl px-3 py-1.5 text-sm shadow-xs sm:max-w-[70%]", mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card")}>
            {!mine && !grouped && (
              <p className="text-xs font-semibold" style={{ color: nameColor(m.authorId) }}>
                {m.authorName}
              </p>
            )}
            {m.replyTo && (
              <button
                className={cn("my-1 block w-full border-l-2 py-0.5 pl-2 text-left text-xs", mine ? "border-white/60 bg-white/10" : "border-primary bg-primary/5")}
                onClick={() => document.getElementById(`m-${m.replyTo!.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              >
                <span className={cn("block font-medium", mine ? "text-white" : "text-primary")}>{m.replyTo.authorName}</span>
                <span className={cn("block truncate", mine ? "text-white/80" : "text-muted-foreground")}>{m.replyTo.body}</span>
              </button>
            )}
            {m.kind === "request" || m.kind === "question" ? (
              <span className={cn("mb-1 flex items-center gap-1 text-[11px] font-semibold tracking-wide uppercase", mine ? "text-white/80" : "text-primary")}>
                {m.kind === "request" ? <RotateCcwIcon className="size-3" /> : <HelpCircleIcon className="size-3" />}
                {m.kind === "request" ? `Redo request${m.meta?.label ? `: ${String(m.meta.label)}` : ""}` : "Question"}
              </span>
            ) : null}
            {m.deletedAt ? (
              <span className={cn("italic", mine ? "text-white/70" : "text-muted-foreground")}>Message deleted</span>
            ) : m.kind === "poll" && m.poll ? (
              <PollCard m={m} mine={mine} names={names} canClose={mine || canManage} onChanged={onChanged} />
            ) : m.kind === "call" ? (
              <CallCard url={m.body} mine={mine} provider={String(m.meta?.provider ?? "jitsi")} meta={m.meta} groupId={m.groupId} />
            ) : gif ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={gif} alt="GIF" className="mb-1 max-h-60 max-w-full rounded-lg" loading="lazy" />
            ) : (
              <>
                {m.file && <Attachment m={m} mine={mine} viewerId={viewerId} cryptoKey={cryptoKey} onChanged={onChanged} />}
                {caption && <Body text={caption} mine={mine} />}
              </>
            )}
            {q?.questionId && !m.deletedAt && (
              <div className={cn("mt-1.5 rounded-lg px-2 py-1 text-xs", mine ? "bg-white/15" : "bg-muted")}>
                {q.questionStatus && q.questionStatus !== "open" ? (
                  <span className="flex items-start gap-1">
                    <CheckCircle2Icon className="mt-0.5 size-3 shrink-0" /> <span>{q.questionAnswer ? `Answered: ${q.questionAnswer}` : "Answered"}</span>
                  </span>
                ) : q.questionOwnerId === viewerId ? (
                  answering ? (
                    <form
                      className="flex flex-col gap-1"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!answer.trim()) return;
                        await onAnswer(q.questionId!, answer.trim());
                        setAnswering(false);
                        setAnswer("");
                      }}
                    >
                      <Textarea autoFocus rows={2} value={answer} onChange={(e) => setAnswer(e.target.value)} className="bg-background text-foreground" placeholder="Your answer" />
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="xs" variant="ghost" onClick={() => setAnswering(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" size="xs" disabled={!answer.trim()}>
                          Send answer
                        </Button>
                      </div>
                    </form>
                  ) : (
                    <Button size="xs" variant={mine ? "secondary" : "default"} onClick={() => setAnswering(true)}>
                      Answer
                    </Button>
                  )
                ) : (
                  <span className="opacity-80">Waiting for an answer</span>
                )}
              </div>
            )}
            {m.item && !m.deletedAt && (
              <Link
                href={`/items/${m.item.id}`}
                className={cn("mt-1 flex items-center gap-2 rounded-lg px-2 py-1 text-xs", mine ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/70")}
              >
                <span className="font-mono font-medium">{m.item.code}</span>
                <span className="truncate opacity-80">{m.item.title}</span>
              </Link>
            )}
            <span className={cn("float-right mt-1 ml-2 flex items-center gap-1 text-[10px] leading-none", mine ? "text-white/70" : "text-muted-foreground")}>
              {m.pinned && <PinIcon className="size-2.5" />}
              {m.editedAt && !m.deletedAt && "edited"} {time}
            </span>
          </div>
        )}
        {!m.deletedAt && canReact && <QuickReact m={m} viewerId={viewerId} mine={mine} onChanged={onChanged} />}
        {!m.deletedAt && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className={cn("size-7 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100", mine && "order-first")} aria-label="Message actions">
                <span className="text-lg leading-none">⋯</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={mine ? "end" : "start"}>
              <DropdownMenuItem onClick={onReply}>
                <CornerUpLeftIcon /> Reply
              </DropdownMenuItem>
              {(m.kind === "text" || caption) && !gif && (
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard?.writeText(caption);
                    toast.success("Copied");
                  }}
                >
                  Copy text
                </DropdownMenuItem>
              )}
              {editable && (
                <DropdownMenuItem onClick={onEdit}>
                  <PencilIcon /> Edit
                </DropdownMenuItem>
              )}
              {canPin && (
                <DropdownMenuItem
                  onClick={async () => {
                    const r = await pinMessageAction(m.id, !m.pinned);
                    if (!r.ok) return toast.error(r.error);
                    onChanged({ pinned: !m.pinned });
                  }}
                >
                  {m.pinned ? <PinOffIcon /> : <PinIcon />} {m.pinned ? "Unpin" : "Pin"}
                </DropdownMenuItem>
              )}
              {(mine || canManage) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={async () => {
                      const r = await deleteMessageAction(m.id);
                      if (!r.ok) return toast.error(r.error);
                      onChanged({ deletedAt: new Date().toISOString(), pinned: false });
                    }}
                  >
                    <Trash2Icon /> Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {!m.deletedAt && <ReactionBar m={m} viewerId={viewerId} names={names} mine={mine} onChanged={onChanged} />}
    </div>
  );
}

function GroupInfo({
  open,
  onOpenChange,
  group,
  canManage,
  directory,
  viewerId,
  timezone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  group: ChatGroupSummary;
  canManage: boolean;
  directory: Person[];
  viewerId: string;
  timezone: string;
}) {
  const router = useRouter();
  const [members, setMembers] = React.useState<ChatMember[] | null>(null);
  const [pinned, setPinned] = React.useState<ChatMessage[]>([]);
  const [adding, setAdding] = React.useState<string[]>([]);
  const [name, setName] = React.useState(group.name);
  const [description, setDescription] = React.useState(group.description ?? "");
  const [color, setColor] = React.useState(group.color ?? COLORS[0]);
  const [invite, setInvite] = React.useState<{ token: string | null; visibility: string }>({ token: null, visibility: group.visibility });
  const noun = group.kind === "channel" ? "channel" : "group";

  const load = React.useCallback(async () => {
    const r = await groupInfoAction(group.id);
    if (r.ok && r.data) {
      setMembers(r.data.members);
      setPinned(r.data.pinned);
      setInvite({ token: r.data.inviteToken, visibility: r.data.visibility });
    }
  }, [group.id]);
  React.useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const done = async (r: { ok: boolean; error?: string }, msg?: string) => {
    if (!r.ok) return toast.error(r.error);
    if (msg) toast.success(msg);
    await load();
    router.refresh();
  };
  const memberIds = new Set(members?.map((m) => m.userId));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="items-center text-center">
          <GroupAvatar name={group.name} color={color} size={72} />
          <SheetTitle className="text-lg">{group.name}</SheetTitle>
          <SheetDescription>{group.description || `${group.memberCount} members`}</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {canManage && (
            <section className="space-y-2 rounded-lg border p-3">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{noun === "channel" ? "Channel" : "Group"} settings</h3>
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {COLORS.map((c) => (
                  <button key={c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")} style={{ background: c }} aria-label={`Colour ${c}`} />
                ))}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={async () => done(await updateGroupAction(group.id, { name, description, color }), noun === "channel" ? "Channel saved" : "Group saved")}>
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={async () => done(await updateGroupAction(group.id, { archived: !group.archived }), group.archived ? "Group restored" : "Group archived")}>
                  <ArchiveIcon /> {group.archived ? "Restore" : "Archive"}
                </Button>
              </div>
            </section>
          )}
          {canManage && <InviteSection group={group} inviteToken={invite.token} visibility={invite.visibility} onChanged={() => void load().then(() => router.refresh())} />}

          {pinned.length > 0 && (
            <section className="space-y-1.5">
              <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Pinned messages</h3>
              <ul className="space-y-1">
                {pinned.map((p) => (
                  <li key={p.id} className="rounded-lg bg-muted/50 px-2.5 py-1.5 text-xs">
                    <span className="font-medium">{p.authorName}</span> <span className="text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-GB", { timeZone: timezone })}</span>
                    <p className="line-clamp-2">{p.body}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-2">
            <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <UsersIcon className="size-3.5" /> {members?.length ?? group.memberCount} members
            </h3>
            {canManage && (
              <div className="flex gap-2">
                <MultiSelect
                  label="Add people"
                  className="flex-1"
                  options={directory.filter((p) => !memberIds.has(p.id)).map((p) => ({ value: p.id, label: p.name, hint: p.roles.map((r) => ROLE_LABELS[r]).join(", ") }))}
                  value={adding}
                  onChange={setAdding}
                />
                <Button
                  size="sm"
                  disabled={!adding.length}
                  onClick={async () => {
                    const r = await setMembersAction(group.id, { add: adding });
                    setAdding([]);
                    await done(r, "Members added");
                  }}
                >
                  Add
                </Button>
              </div>
            )}
            <ul className="divide-y rounded-lg border">
              {members?.map((m) => (
                <li key={m.userId} className="flex items-center gap-2.5 px-2.5 py-2">
                  <UserAvatar name={m.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {m.name} {m.userId === viewerId && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      @{m.handle} · {m.roles.map((r) => ROLE_LABELS[r as Role] ?? r).join(", ")}
                    </span>
                  </span>
                  {m.role === "admin" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">{noun} admin</span>}
                  {canManage && m.userId !== viewerId && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" className="size-7" aria-label={`Manage ${m.name}`}>
                          <span className="text-lg leading-none">⋯</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={async () => done(await setMemberRoleAction(group.id, m.userId, m.role === "admin" ? "member" : "admin"))}>
                          <ShieldIcon /> {m.role === "admin" ? `Remove ${noun} admin` : `Make ${noun} admin${noun === "channel" ? " (can post)" : ""}`}
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onClick={async () => done(await setMembersAction(group.id, { remove: [m.userId] }), `${m.name} removed`)}>
                          <UserMinusIcon /> Remove from group
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </li>
              ))}
              {!members && <li className="p-3 text-xs text-muted-foreground">Loading...</li>}
            </ul>
          </section>

          {group.myRole && (
            <Button
              variant="outline"
              className="w-full text-destructive"
              onClick={async () => {
                const r = await leaveGroupAction(group.id);
                if (!r.ok) return toast.error(r.error);
                onOpenChange(false);
                router.push("/chat");
                router.refresh();
              }}
            >
              <LogOutIcon /> Leave {noun}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewGroupDialog({ directory, viewerId, onClose, onCreated }: { directory: Person[]; viewerId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState(COLORS[0]);
  const [members, setMembers] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const byRole = (role: Role) => directory.filter((p) => p.roles.includes(role)).map((p) => p.id);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New group</DialogTitle>
          <DialogDescription>You become the group admin. Members can be changed later from the group info.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <GroupAvatar name={name || "New group"} color={color} size={48} />
            <div className="flex-1 space-y-1.5">
              <Label>Name</Label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Grade 9 Physics crew" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")} style={{ background: c }} aria-label={`Colour ${c}`} />
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Members</Label>
            <MultiSelect
              label="Choose people"
              options={directory.filter((p) => p.id !== viewerId).map((p) => ({ value: p.id, label: p.name, hint: p.roles.map((r) => ROLE_LABELS[r]).join(", ") }))}
              value={members}
              onChange={setMembers}
            />
            <div className="flex flex-wrap gap-1">
              {(["recording", "editing", "uploading", "publication", "manager"] as Role[]).map((r) => (
                <Button key={r} size="xs" variant="outline" onClick={() => setMembers([...new Set([...members, ...byRole(r).filter((id) => id !== viewerId)])])}>
                  + all {ROLE_LABELS[r]}
                </Button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={busy || !name.trim()}
            onClick={async () => {
              setBusy(true);
              const r = await createGroupAction({ name, description, color, memberIds: members });
              setBusy(false);
              if (!r.ok) return toast.error(r.error);
              onClose();
              onCreated(r.data as string);
            }}
          >
            Create group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewDirectDialog({ directory, viewerId, onClose, onOpen }: { directory: Person[]; viewerId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const [q, setQ] = React.useState("");
  const people = directory.filter((p) => p.id !== viewerId && (!q || `${p.name} ${p.handle}`.toLowerCase().includes(q.toLowerCase())));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New direct message</DialogTitle>
          <DialogDescription>Direct messages are end-to-end encrypted. Only you and the other person can read them.</DialogDescription>
        </DialogHeader>
        <Input autoFocus placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-80 divide-y overflow-y-auto rounded-lg border">
          {people.map((p) => (
            <li key={p.id}>
              <button
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60"
                onClick={async () => {
                  const r = await openDirectAction(p.id);
                  if (!r.ok) return toast.error(r.error);
                  onClose();
                  onOpen(r.data as string);
                }}
              >
                <UserAvatar name={p.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    @{p.handle} · {p.roles.map((r) => ROLE_LABELS[r]).join(", ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
