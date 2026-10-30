"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckIcon,
  CircleStopIcon,
  ExternalLinkIcon,
  FileTextIcon,
  HelpCircleIcon,
  MoreHorizontalIcon,
  PauseIcon,
  PlayIcon,
  RocketIcon,
  RotateCcwIcon,
  SendIcon,
  ShieldAlertIcon,
  Undo2Icon,
  UploadCloudIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useActions, type DialogKind, type ItemRef } from "@/components/app/action-center";
import { NEXT_STAGE, STAGE_LABELS, STAGES, type Capability, type Role, type Stage } from "@/lib/domain";
import { cn } from "@/lib/utils";
import { tip } from "@/lib/help";

export type ActionItem = ItemRef & {
  lifecycle: string;
  stage: Stage | null;
  status: string | null;
  substate: string | null;
  ownerId: string | null;
  nextOwnerId?: string | null;
  hasMySession?: boolean;
};

// Leads act on their own stage (they can also assign within it). Managers only view unless granted Edit any stage.
// For a draft, ownerId is the Recording assignee.
export type ActionViewer = { id: string; roles: Role[]; leads?: Stage[]; perms: Capability[] };

const leads = (v: ActionViewer, st: Stage) => v.perms.includes("work.override") || !!v.leads?.includes(st);

export function canWorkClient(v: ActionViewer, stage: Stage | null, ownerId: string | null) {
  if (!stage) return false;
  if (leads(v, stage)) return true;
  return v.roles.includes(stage) && (!ownerId || ownerId === v.id);
}

export function primaryActions(item: ActionItem, v: ActionViewer) {
  const out: { key: string; label: string; icon: React.ReactNode; run: "dialog" | "direct"; kind: string; variant?: "default" | "outline" | "destructive" }[] = [];
  // Recording staff start a draft themselves; it goes straight to In progress.
  if (item.lifecycle === "draft" && canWorkClient(v, "recording", item.ownerId)) out.push({ key: "start", label: "Start recording", icon: <PlayIcon />, run: "direct", kind: "start" });
  if (item.lifecycle !== "in_production" || !item.stage) return out;
  const work = canWorkClient(v, item.stage, item.ownerId);
  const next = NEXT_STAGE[item.stage];
  // The next team's lead receives handed-over work (or the person it was handed to by name).
  const receive = next ? leads(v, next) || item.nextOwnerId === v.id : false;
  const lead = leads(v, item.stage);
  if (item.stage === "publication") {
    const publisher = v.roles.includes("publication") || leads(v, "publication");
    if (item.status === "blocked" && work) out.push({ key: "unblock", label: "Clear blocker", icon: <CheckIcon />, run: "dialog", kind: "unblock" });
    else if (publisher) {
      if (!item.substate || item.substate === "pending_review" || item.substate === "changes_requested")
        out.push({ key: "review", label: "Review", icon: <CheckIcon />, run: "dialog", kind: "review" });
      if (item.substate === "ready") out.push({ key: "schedule", label: "Schedule", icon: <SendIcon />, run: "dialog", kind: "schedule", variant: "outline" });
      if (item.substate === "ready" || item.substate === "scheduled" || item.substate === "failed")
        out.push({ key: "live", label: "Confirm live", icon: <RocketIcon />, run: "dialog", kind: "live" });
    }
    if (work && (item.status === "queued" || item.status === "paused")) out.push({ key: "start", label: item.status === "paused" ? "Resume" : "Start review", icon: <PlayIcon />, run: "direct", kind: "start", variant: "outline" });
    if (work && item.status === "in_progress" && item.hasMySession !== false) out.push({ key: "pause", label: "Pause", icon: <PauseIcon />, run: "dialog", kind: "pause", variant: "outline" });
    return out;
  }
  if (item.status === "awaiting_handoff") {
    if (receive) {
      out.push({ key: "accept", label: "Accept", icon: <CheckIcon />, run: "dialog", kind: "accept" });
      out.push({ key: "return", label: "Return", icon: <Undo2Icon />, run: "dialog", kind: "return", variant: "outline" });
    }
    return out;
  }
  if (!work) return out;
  if (item.status === "blocked") out.push({ key: "unblock", label: "Clear blocker", icon: <CheckIcon />, run: "dialog", kind: "unblock" });
  if (item.status === "queued") out.push({ key: "start", label: `Start ${STAGE_LABELS[item.stage].toLowerCase()}`, icon: <PlayIcon />, run: "direct", kind: "start" });
  if (item.status === "paused") out.push({ key: "start", label: "Resume", icon: <PlayIcon />, run: "direct", kind: "start" });
  if (item.status === "in_progress") {
    if (item.stage === "uploading") out.push({ key: "upload", label: "Record upload", icon: <UploadCloudIcon />, run: "dialog", kind: "upload", variant: "outline" });
    out.push({ key: "pause", label: "Pause", icon: <PauseIcon />, run: "dialog", kind: "pause", variant: "outline" });
  }
  // Team members send finished work to their team lead; only the lead approves and hands over to the next team.
  if (item.status === "lead_review" && lead) out.push({ key: "approve", label: "Approve", icon: <CheckIcon />, run: "direct", kind: "leadApprove" });
  if (!lead && ["in_progress", "paused", "finished"].includes(item.status ?? ""))
    out.push({ key: "submitLead", label: "Send to team lead", icon: <SendIcon />, run: "direct", kind: "submitLead", variant: item.status === "paused" ? "outline" : "default" });
  if (lead && ["in_progress", "paused", "queued", "finished", "lead_review", "ready"].includes(item.status ?? ""))
    out.push({ key: "submit", label: next ? `Hand over to ${STAGE_LABELS[next]}` : "Hand over", icon: <SendIcon />, run: "dialog", kind: "submit", variant: item.status === "ready" ? "default" : "outline" });
  return out;
}

type Entry =
  | { type: "label"; label: string }
  | { type: "separator" }
  | { type: "item"; key: string; label: string; icon?: React.ReactNode; href?: string; dialog?: DialogKind; preset?: Record<string, unknown>; direct?: string; destructive?: boolean };

// Every action for an item, shared by the "..." menu and the right-click menu so both always match.
export function menuEntries(item: ActionItem, v: ActionViewer): Entry[] {
  const can = (c: Capability) => v.perms.includes(c);
  const out: Entry[] = [{ type: "label", label: item.code }];
  for (const a of primaryActions(item, v)) out.push({ type: "item", key: a.key, label: a.label, icon: a.icon, ...(a.run === "direct" ? { direct: a.kind } : { dialog: a.kind as DialogKind }) });
  out.push({ type: "separator" });
  if (can("items.detail")) {
    out.push({ type: "item", key: "page", label: "Open page view", icon: <FileTextIcon />, href: `/items/${item.id}/form` });
    out.push({ type: "item", key: "detail", label: "Open detail view", icon: <ExternalLinkIcon />, href: `/items/${item.id}` });
  }
  out.push({ type: "item", key: "question", label: "Ask a question", icon: <HelpCircleIcon />, dialog: "question" });
  const work = canWorkClient(v, item.stage, item.ownerId);
  if (item.lifecycle === "in_production" && item.stage) {
    const st = item.stage;
    const next = NEXT_STAGE[st];
    const canRedo =
      (item.status === "awaiting_handoff" && next && (v.roles.includes(next) || leads(v, next))) ||
      (STAGES.indexOf(st) > 0 && (v.roles.includes(st) || leads(v, st)));
    if (canRedo) out.push({ type: "item", key: "redo", label: "Request a redo", icon: <RotateCcwIcon />, dialog: "redo" });
    if (work && ["queued", "in_progress", "paused"].includes(item.status ?? "")) out.push({ type: "item", key: "block", label: "Mark blocked", icon: <ShieldAlertIcon />, dialog: "block" });
    if (work) out.push({ type: "item", key: "asset", label: st === "recording" ? "Log recording" : "Link a file", icon: <UploadCloudIcon />, dialog: "asset", preset: { kind: st === "recording" ? "raw" : "master" } });
    if (st === "publication" && (can("release.emergency") || v.roles.includes("publication")))
      out.push({ type: "item", key: "releaseFailed", label: "Report failed release", icon: <CircleStopIcon />, dialog: "releaseFailed" });
    if (leads(v, st) || STAGES.some((s) => leads(v, s))) out.push({ type: "item", key: "assign", label: "Assign to a team member", icon: <UserPlusIcon />, dialog: "assign" });
  }
  const planning: Entry[] = [];
  if (item.lifecycle === "draft" && can("items.create")) planning.push({ type: "item", key: "release", label: "Queue for Recording", icon: <RocketIcon />, dialog: "release" });
  if (can("items.plan")) planning.push({ type: "item", key: "deadline", label: "Change deadline", dialog: "deadline" });
  if (item.lifecycle === "published" && can("items.create")) planning.push({ type: "item", key: "revision", label: "Start revision", dialog: "revision" });
  if ((item.lifecycle === "draft" || item.lifecycle === "in_production") && can("items.close")) planning.push({ type: "item", key: "close", label: "Archive or cancel", dialog: "close", destructive: true });
  if (planning.length) out.push({ type: "separator" }, { type: "label", label: "Planning" }, ...planning);
  return out.filter((e, i, a) => !(e.type === "separator" && (i === a.length - 1 || a[i + 1]?.type === "separator")));
}

function useEntryRunner(item: ActionItem) {
  const { run, open } = useActions();
  const router = useRouter();
  const ref: ItemRef = { id: item.id, code: item.code, title: item.title, version: item.version, stage: item.stage, status: item.status };
  return (e: Extract<Entry, { type: "item" }>) => {
    if (e.href) router.push(e.href);
    else if (e.direct) void run(ref, { action: e.direct } as never);
    else if (e.dialog) open(e.dialog, ref, e.preset);
  };
}

export function ItemActions({
  item,
  viewer,
  size = "sm",
  showMenu = true,
  compact = false,
  className,
  max = 3,
}: {
  item: ActionItem;
  viewer: ActionViewer;
  size?: "sm" | "xs" | "default";
  showMenu?: boolean;
  compact?: boolean;
  className?: string;
  max?: number;
}) {
  const { run, open } = useActions();
  const runEntry = useEntryRunner(item);
  const [busy, setBusy] = React.useState(false);
  const actions = primaryActions(item, viewer).slice(0, max);
  const ref: ItemRef = { id: item.id, code: item.code, title: item.title, version: item.version, stage: item.stage, status: item.status };
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {actions.map((a) => (
        <Button
          key={a.key}
          size={size}
          variant={a.variant ?? "default"}
          title={tip(`action.${a.kind}`)}
          disabled={busy}
          onClick={async (e) => {
            e.stopPropagation();
            if (a.run === "direct") {
              setBusy(true);
              await run(ref, { action: a.kind } as never);
              setBusy(false);
            } else open(a.kind as never, ref);
          }}
        >
          {a.icon}
          {!compact && a.label}
          {compact && <span className="sr-only">{a.label}</span>}
        </Button>
      ))}
      {showMenu && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size={size === "default" ? "icon" : size === "xs" ? "icon-xs" : "icon-sm"} variant="ghost" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
              <MoreHorizontalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56" onClick={(e) => e.stopPropagation()}>
            {menuEntries(item, viewer).map((e, i) =>
              e.type === "label" ? (
                <DropdownMenuLabel key={i} className="truncate text-xs text-muted-foreground">
                  {e.label}
                </DropdownMenuLabel>
              ) : e.type === "separator" ? (
                <DropdownMenuSeparator key={i} />
              ) : e.href ? (
                <DropdownMenuItem key={e.key} asChild>
                  <Link href={e.href}>
                    {e.icon} {e.label}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem key={e.key} variant={e.destructive ? "destructive" : "default"} onSelect={() => runEntry(e)}>
                  {e.icon} {e.label}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

// Wraps a row or card: right-click (or long-press on touch) opens every action for the item.
export function ItemContextMenu({ item, viewer, children }: { item: ActionItem; viewer: ActionViewer; children: React.ReactNode }) {
  const runEntry = useEntryRunner(item);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-60">
        {menuEntries(item, viewer).map((e, i) =>
          e.type === "label" ? (
            <ContextMenuLabel key={i} className="truncate">
              {e.label}
            </ContextMenuLabel>
          ) : e.type === "separator" ? (
            <ContextMenuSeparator key={i} />
          ) : (
            <ContextMenuItem key={e.key} variant={e.destructive ? "destructive" : "default"} onSelect={() => runEntry(e)}>
              {e.icon} {e.label}
            </ContextMenuItem>
          ),
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
