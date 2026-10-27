"use client";

import * as React from "react";
import { toast } from "sonner";
import { CheckIcon, CornerDownRightIcon, PencilIcon, Trash2Icon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/app/primitives";
import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  listCommentsAction,
  reactCommentAction,
  resolveCommentAction,
  type CommentView,
} from "@/app/actions/collab";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const REACTIONS: Record<string, string> = { agree: "Agree", thanks: "Thanks", seen: "Seen" };

function Body({ text }: { text: string }) {
  // Highlights @mentions and timecodes; everything else is plain text.
  const parts = text.split(/(@[a-z0-9.]+|\b\d{1,2}:\d{2}(?::\d{2})?\b)/gi);
  return (
    <p className="text-sm break-words whitespace-pre-wrap">
      {parts.map((p, i) =>
        /^@/.test(p) ? (
          <span key={i} className="rounded bg-accent px-0.5 font-medium text-accent-foreground">
            {p}
          </span>
        ) : /^\d{1,2}:\d{2}/.test(p) ? (
          <span key={i} className="rounded bg-muted px-1 font-mono text-xs">
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </p>
  );
}

export function CommentThread({
  itemId,
  reportKey,
  field,
  assetId,
  stage,
  viewerId,
  isManager,
  tz,
  allowTimecode,
  assets,
  compact,
  placeholder,
  context,
}: {
  itemId?: string;
  reportKey?: string;
  field?: string | null;
  assetId?: string | null;
  stage?: string | null;
  viewerId: string;
  isManager: boolean;
  tz: string;
  allowTimecode?: boolean;
  assets?: { id: string; label: string }[];
  compact?: boolean;
  placeholder?: string;
  context?: Record<string, unknown>;
}) {
  const [rows, setRows] = React.useState<CommentView[] | null>(null);
  const [body, setBody] = React.useState("");
  const [timecode, setTimecode] = React.useState("");
  const [asset, setAsset] = React.useState<string>(assetId ?? "");
  const [replyTo, setReplyTo] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [editText, setEditText] = React.useState("");
  const [showResolved, setShowResolved] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await listCommentsAction({ itemId, reportKey, field: field ?? undefined, assetId: assetId ?? undefined });
    if (res.ok) setRows(res.data as CommentView[]);
  }, [itemId, reportKey, field, assetId]);
  React.useEffect(() => {
    load();
  }, [load]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    const res = await addCommentAction({
      targetType: reportKey ? "report" : asset ? "asset" : field ? "field" : "item",
      targetId: reportKey ?? (asset || itemId!),
      itemId: itemId ?? null,
      stage: stage ?? null,
      field: field ?? null,
      assetId: asset || null,
      timecode: timecode || null,
      parentId: replyTo,
      body,
      context: context ?? null,
    });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    setBody("");
    setTimecode("");
    setReplyTo(null);
    load();
  };

  const roots = (rows ?? []).filter((r) => !r.parent_id && (showResolved || !r.resolved));
  const replies = (id: string) => (rows ?? []).filter((r) => r.parent_id === id);

  const renderComment = (c: CommentView, depth = 0) => (
    <li key={c.id} id={c.id} className={cn("flex gap-2.5", depth > 0 && "mt-2")}>
      <UserAvatar name={c.author_name} size={depth ? "xs" : "sm"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
          <span className="font-medium">{c.author_name}</span>
          <span className="text-muted-foreground" title={fmtDateTime(c.created_at, tz)}>
            {fmtRelative(c.created_at)}
          </span>
          {c.edited_at && <span className="text-muted-foreground" title={`Edited ${fmtDateTime(c.edited_at, tz)}`}>edited</span>}
          {c.field && <span className="rounded bg-muted px-1 text-[10px]">{c.field.replace(/_/g, " ")}</span>}
          {c.asset_label && <span className="rounded bg-muted px-1 text-[10px]">{c.asset_label}</span>}
          {c.context && <span className="rounded bg-muted px-1 text-[10px]" title={c.context}>snapshot: {(() => { try { const x = JSON.parse(c.context!); return `${x.window ?? ""} ${x.filters ?? ""}`.trim() || "saved context"; } catch { return "saved context"; } })()}</span>}
          {c.timecode && <span className="rounded bg-[var(--st-queued-bg)] px-1 font-mono text-[10px] text-[var(--st-queued-fg)]">{c.timecode}</span>}
          {!!c.resolved && <span className="rounded bg-[var(--st-done-bg)] px-1 text-[10px] text-[var(--st-done-fg)]">resolved</span>}
        </div>
        {c.deleted_at ? (
          <p className="text-sm text-muted-foreground italic">Comment deleted. The deletion is recorded in the history.</p>
        ) : editing === c.id ? (
          <div className="mt-1 space-y-1.5">
            <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} />
            <div className="flex gap-1.5">
              <Button
                size="xs"
                onClick={async () => {
                  const res = await editCommentAction(c.id, editText);
                  if (!res.ok) return toast.error(res.error);
                  setEditing(null);
                  load();
                }}
              >
                Save
              </Button>
              <Button size="xs" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Body text={c.body} />
        )}
        {!c.deleted_at && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {Object.entries(REACTIONS).map(([k, l]) => {
              const r = c.reactions.find((x) => x.reaction === k);
              return (
                <button
                  key={k}
                  onClick={async () => {
                    await reactCommentAction(c.id, k);
                    load();
                  }}
                  className={cn("h-5 rounded-full border px-2 text-[10px]", r?.mine ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground")}
                >
                  {l}
                  {r ? ` ${r.count}` : ""}
                </button>
              );
            })}
            {depth === 0 && (
              <Button size="xs" variant="ghost" className="h-5 px-1.5 text-[11px]" onClick={() => setReplyTo(c.id)}>
                <CornerDownRightIcon /> Reply
              </Button>
            )}
            {depth === 0 && (
              <Button
                size="xs"
                variant="ghost"
                className="h-5 px-1.5 text-[11px]"
                onClick={async () => {
                  const res = await resolveCommentAction(c.id, !c.resolved);
                  if (!res.ok) toast.error(res.error);
                  load();
                }}
              >
                {c.resolved ? <Undo2Icon /> : <CheckIcon />} {c.resolved ? "Reopen" : "Resolve"}
              </Button>
            )}
            {c.author_id === viewerId && (
              <Button
                size="xs"
                variant="ghost"
                className="h-5 px-1.5 text-[11px]"
                onClick={() => {
                  setEditing(c.id);
                  setEditText(c.body);
                }}
              >
                <PencilIcon /> Edit
              </Button>
            )}
            {(c.author_id === viewerId || isManager) && (
              <Button
                size="xs"
                variant="ghost"
                className="h-5 px-1.5 text-[11px] text-muted-foreground"
                onClick={async () => {
                  const res = await deleteCommentAction(c.id);
                  if (!res.ok) toast.error(res.error);
                  load();
                }}
              >
                <Trash2Icon /> Delete
              </Button>
            )}
          </div>
        )}
        {depth === 0 && replies(c.id).length > 0 && <ul className="mt-1 border-l pl-3">{replies(c.id).map((r) => renderComment(r, 1))}</ul>}
      </div>
    </li>
  );

  return (
    <div className="space-y-3">
      {rows === null ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : roots.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <>
          {rows.some((r) => r.resolved) && (
            <button className="text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowResolved((x) => !x)}>
              {showResolved ? "Hide resolved" : "Show resolved"}
            </button>
          )}
          <ul className={cn("space-y-3", compact && "max-h-96 overflow-y-auto pr-1")}>{roots.map((c) => renderComment(c))}</ul>
        </>
      )}
      <div className="space-y-2 rounded-lg border bg-background p-2">
        {replyTo && (
          <p className="flex items-center justify-between text-xs text-muted-foreground">
            Replying to a comment
            <button className="underline" onClick={() => setReplyTo(null)}>
              Cancel reply
            </button>
          </p>
        )}
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={placeholder ?? "Write a comment. Mention someone with @name.surname"}
          className="min-h-16 border-0 p-1 shadow-none focus-visible:ring-0"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          {allowTimecode && assets && assets.length > 0 && (
            <>
              <select value={asset} onChange={(e) => setAsset(e.target.value)} className="h-7 rounded-md border bg-background px-1.5 text-xs" aria-label="Attach to file version">
                <option value="">Whole item</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label}
                  </option>
                ))}
              </select>
              {asset && <Input value={timecode} onChange={(e) => setTimecode(e.target.value)} placeholder="03:42" className="h-7 w-20 text-xs" aria-label="Timecode" />}
            </>
          )}
          <span className="ml-auto text-[11px] text-muted-foreground">Ctrl Enter to send</span>
          <Button size="sm" disabled={busy || !body.trim()} onClick={send}>
            Comment
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground">A comment saying approved does not approve anything; use the workflow actions for decisions.</p>
    </div>
  );
}
